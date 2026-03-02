// src/pages/Portfolio/ViewPortfolio.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
    ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
    Upload, RotateCcw, MessageSquare
} from 'lucide-react';
import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { auth, db, storage } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar';
import { PageHeader } from '../../components/common/PageHeader/PageHeader';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import { createPortal } from 'react-dom';
import './ViewPortfolio.css';

interface LearnerSubmission {
    id: string;
    assessmentId: string;
    learnerId: string;
    enrollmentId: string;
    cohortId?: string;
    title: string;
    type: string;
    status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
    assignedAt: string;
    startedAt?: string;
    marks: number;
    totalMarks: number;
    competency?: 'C' | 'NYC';
    moduleNumber?: string;
    moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
    timeLimit?: number;
    moderation?: { outcome?: 'Endorsed' | 'Returned' };
    qualificationName?: string;
    attemptNumber?: number;
}

const TABS = [
    { id: 'overview', label: 'Progress Overview', icon: <BarChart2 size={13} /> },
    { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={13} /> },
    { id: 'practical', label: 'Practical (P)', icon: <FileText size={13} /> },
    { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={13} /> },
    { id: 'other', label: 'Practice & Extras', icon: <Play size={13} /> },
    { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={13} /> },
] as const;

type TabId = typeof TABS[number]['id'];

// ─── CUSTOM REMEDIATION MODAL COMPONENT ───
const RemediationModal: React.FC<{
    submissionTitle: string;
    attemptNumber: number;
    onClose: () => void;
    onSubmit: (date: string, notes: string) => void;
}> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
    const [date, setDate] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmed, setConfirmed] = useState(false);

    useEffect(() => {
        const style = document.createElement('style');
        style.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(style);
        return () => { document.head.removeChild(style); };
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !notes.trim() || !confirmed) return;
        onSubmit(date, notes);
    };

    const isFinalAttempt = attemptNumber === 2;

    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
                            <RotateCcw size={24} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
                            </h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                        {isFinalAttempt
                            ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
                            : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
                    </p>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
                    </div>

                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
                            <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
                        </label>
                        <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
                    </div>

                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                            <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
                        </span>
                    </label>

                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                        <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
                            Log Coaching & Unlock
                        </button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
};


export const ViewPortfolio: React.FC = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const targetCohortId = (location.state as any)?.cohortId;

    const user = useStore(state => state.user);
    const learners = useStore(state => state.learners);
    const learnersLoading = useStore(state => state.learnersLoading);
    const programmes = useStore(state => state.programmes);
    const cohorts = useStore(state => state.cohorts);
    const fetchLearners = useStore(state => state.fetchLearners);
    const fetchProgrammes = useStore(state => state.fetchProgrammes);
    const fetchCohorts = useStore(state => state.fetchCohorts);
    const updateLearner = useStore(state => state.updateLearner);

    const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [timeOffset, setTimeOffset] = useState(0);
    const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
    const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

    const [remediatingId, setRemediatingId] = useState<string | null>(null);
    const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);

    useEffect(() => {
        const fetchOffset = async () => {
            try {
                const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
                const data = await res.json();
                setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
            } catch { setTimeOffset(0); }
        };
        fetchOffset();
        const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
        return () => clearInterval(tick);
    }, []);

    const getSecureNow = () => currentTimeTick + timeOffset;

    useEffect(() => {
        if (learners.length === 0) fetchLearners();
        if (programmes.length === 0) fetchProgrammes();
        if (cohorts.length === 0) fetchCohorts();
    }, [learners.length, programmes.length, cohorts.length, fetchLearners, fetchProgrammes, fetchCohorts]);

    const enrollment = useMemo(() => {
        if (!routeId) return undefined;
        const humanRecords = learners.filter(l => l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId);
        if (humanRecords.length === 0) return undefined;
        if (targetCohortId) {
            const exactMatch = humanRecords.find(l => l.cohortId === targetCohortId);
            if (exactMatch) return exactMatch;
            return { ...humanRecords[0], cohortId: targetCohortId };
        }
        let match = humanRecords.find(l => l.enrollmentId === routeId && l.id !== l.learnerId);
        if (match) return match;
        return humanRecords.find(e => e.status !== 'dropped') || humanRecords[0];
    }, [learners, routeId, targetCohortId]);

    const enrollmentId = enrollment?.id;
    const enrollmentLearnerId = enrollment?.learnerId;
    const enrollmentCohortId = enrollment?.cohortId;
    const enrollmentSaqaId = enrollment?.qualification?.saqaId;
    const enrollmentQualName = enrollment?.qualification?.name;

    const matchingProgramme = useMemo(() => {
        if (programmes.length === 0) return null;
        const activeCohortId = targetCohortId || enrollmentCohortId;
        if (activeCohortId && cohorts.length > 0) {
            const linkedCohort = cohorts.find(c => c.id === activeCohortId);
            const templateId = (linkedCohort as any)?.programmeId || (linkedCohort as any)?.qualificationId;
            if (templateId) {
                const prog = programmes.find(p => p.id === templateId);
                if (prog) return prog;
            }
        }
        if (enrollmentSaqaId) {
            const targetSaqa = String(enrollmentSaqaId).trim();
            if (targetSaqa) {
                const progMatch = programmes.find(p => String(p.saqaId || '').trim() === targetSaqa);
                if (progMatch) return progMatch;
            }
        }
        return null;
    }, [programmes, cohorts, enrollmentCohortId, targetCohortId, enrollmentSaqaId]);

    const headerCourseName = matchingProgramme?.name || enrollmentQualName || 'Unassigned Qualification';

    useEffect(() => {
        let isMounted = true;
        const load = async () => {
            if (!enrollmentId && !enrollmentLearnerId) return;
            setLoadingSubmissions(true);
            try {
                const subRef = collection(db, 'learner_submissions');
                const humanId = enrollmentLearnerId || enrollmentId;
                const activeCohortId = targetCohortId || enrollmentCohortId;

                let q;
                if (activeCohortId && activeCohortId !== 'Unassigned') {
                    q = query(subRef, where('learnerId', '==', humanId), where('cohortId', '==', activeCohortId));
                } else {
                    q = query(subRef, where('learnerId', '==', humanId));
                }

                let snap = await getDocs(q);
                let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

                const cache = new Map<string, number | undefined>();
                for (let i = 0; i < subs.length; i++) {
                    const sub = subs[i];
                    if (!cache.has(sub.assessmentId)) {
                        const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
                        cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
                    }
                    subs[i].timeLimit = cache.get(sub.assessmentId);
                }

                if (isMounted) {
                    subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
                    setSubmissions(subs);
                }
            } catch (err) {
                if (isMounted) console.error('Error fetching submissions:', err);
            } finally {
                if (isMounted) setLoadingSubmissions(false);
            }
        };
        load();
        return () => { isMounted = false; };
    }, [enrollmentId, enrollmentLearnerId, enrollmentCohortId, targetCohortId]);

    const pipelineStats = useMemo(() => {
        const total = submissions.length;
        if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
        return {
            total,
            submitted: submissions.filter(s => !['not_started', 'in_progress'].includes(s.status)).length,
            facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed', 'returned'].includes(s.status)).length,
            graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
            moderated: submissions.filter(s => s.status === 'moderated').length,
        };
    }, [submissions]);

    const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'idUrl' | 'cvUrl' | 'qualUrl') => {
        const file = e.target.files?.[0];
        if (!file || !enrollment) return;

        setUploadingDoc(docType);
        try {
            const ext = file.name.split('.').pop();
            const targetId = enrollment.learnerId || enrollment.id;
            const storageRef = ref(storage, `learners/${targetId}/${docType}_${Date.now()}.${ext}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadUrl = await getDownloadURL(snapshot.ref);

            const currentDocs = (enrollment as any).documents || {};
            await updateLearner(targetId, { documents: { ...currentDocs, [docType]: downloadUrl } } as any);
            toast.success("Document uploaded successfully!");
        } catch (error) {
            toast.error("Failed to upload document. Please try again.");
        } finally {
            setUploadingDoc(null);
            e.target.value = '';
        }
    };

    const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
        if (!remediationTarget) return;
        const sub = remediationTarget;
        setRemediationTarget(null);
        setRemediatingId(sub.id);

        try {
            const historyRef = doc(collection(db, 'learner_submissions', sub.id, 'history'));
            await setDoc(historyRef, {
                ...sub,
                archivedAt: new Date().toISOString(),
                snapshotReason: 'Remediation requested after NYC outcome',
                coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
            });

            await updateDoc(doc(db, 'learner_submissions', sub.id), {
                status: 'in_progress',
                competency: deleteField(),
                grading: deleteField(),
                moderation: deleteField(),
                submittedAt: deleteField(),
                learnerDeclaration: deleteField(),
                attemptNumber: (sub.attemptNumber || 1) + 1,
                lastStaffEditAt: new Date().toISOString(),
                latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorName: user?.fullName }
            });

            setSubmissions(prev => prev.map(s => s.id === sub.id ? {
                ...s, status: 'in_progress', competency: undefined, grading: undefined, moderation: undefined, attemptNumber: (s.attemptNumber || 1) + 1
            } : s));

            toast.success("Coaching logged & workbook unlocked!");
        } catch (err) {
            toast.error("Failed to unlock for remediation.");
        } finally {
            setRemediatingId(null);
        }
    };

    const handleActionClick = (sub: LearnerSubmission) => {
        const isStaff = user?.role !== 'learner';
        const currentAttempt = sub.attemptNumber || 1;
        const isEligibleForRemediation = isStaff && sub.status === 'moderated' && sub.competency === 'NYC' && (user?.role === 'facilitator' || user?.role === 'admin') && currentAttempt < 3;

        if (isEligibleForRemediation) {
            setRemediationTarget(sub);
            return;
        }

        if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
        else navigate(`/portfolio/submission/${sub.id}`);
    };

    const isActionRequired = (sub: LearnerSubmission) => {
        const role = user?.role;
        return (role === 'facilitator' && sub.status === 'submitted') ||
            (role === 'assessor' && (sub.status === 'facilitator_reviewed' || sub.status === 'returned')) ||
            (role === 'moderator' && sub.status === 'graded');
    };

    const getStatusBadge = (sub: LearnerSubmission) => {
        const role = user?.role || 'learner';
        switch (sub.status) {
            case 'moderated':
                return sub.competency === 'C'
                    ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span>
                    : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
            case 'appealed':
                return <span className="vp-badge vp-badge--appeal"><Scale size={11} /> Appealed</span>;
            case 'graded':
                return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
            case 'returned':
                return <span className="vp-badge vp-badge--warning"><AlertCircle size={11} /> Returned to Assessor</span>;
            case 'facilitator_reviewed':
                return <span className="vp-badge vp-badge--progress"><PenTool size={11} /> Grading Pending</span>;
            case 'submitted':
                return role === 'facilitator' || role === 'admin'
                    ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
                    : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
            case 'in_progress':
                return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress {sub.attemptNumber && sub.attemptNumber > 1 ? `(Attempt ${sub.attemptNumber})` : ''}</span>;
            default:
                return <span className="vp-badge vp-badge--none">Not Started</span>;
        }
    };

    const getActionContent = (sub: LearnerSubmission) => {
        const role = user?.role || 'learner';
        if (remediatingId === sub.id) return <><Loader2 size={12} className="vp-spin" /> Processing...</>;

        if (role === 'learner') {
            if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
            if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
            return <><Eye size={12} /> View Results</>;
        }

        const currentAttempt = sub.attemptNumber || 1;
        if (sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin')) {
            if (currentAttempt >= 3) return <><Eye size={12} /> Locked (Max Attempts)</>;
            return <><RotateCcw size={12} /> Start Remediation</>;
        }

        return <><PenTool size={12} /> Review Record</>;
    };

    const renderTimeRemaining = (sub: LearnerSubmission) => {
        if (!sub.timeLimit) return <span className="vp-time vp-time--none">No Limit</span>;
        if (sub.status === 'not_started') return <span className="vp-time vp-time--neutral">{sub.timeLimit}m Total</span>;
        if (sub.status === 'in_progress' && sub.startedAt) {
            const endTime = new Date(sub.startedAt).getTime() + sub.timeLimit * 60 * 1000;
            const remainingSecs = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
            if (remainingSecs === 0) return <span className="vp-time vp-time--expired"><AlertCircle size={13} /> Time Expired</span>;
            const m = Math.floor(remainingSecs / 60);
            const s = remainingSecs % 60;
            return (
                <span className={`vp-time ${remainingSecs < 300 ? 'vp-time--low' : 'vp-time--ok'}`}>
                    <Timer size={13} />{m}m {s.toString().padStart(2, '0')}s
                </span>
            );
        }
        return <span className="vp-time vp-time--none">—</span>;
    };

    const renderPipelineBar = (label: string, value: number, total: number, colorKey: string) => {
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
            <div className="vp-pipeline-item" key={label}>
                <div className="vp-pipeline-item__header">
                    <span className="vp-pipeline-item__label">{label}</span>
                    <span className="vp-pipeline-item__stat">{value} / {total} — {pct}%</span>
                </div>
                <div className="vp-pipeline-track">
                    <div className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`} style={{ width: `${pct}%` } as React.CSSProperties} />
                </div>
            </div>
        );
    };

    const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
        if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
        return (
            <ul className="vp-curr-list">
                {modules.map((mod, idx) => {
                    const sub = submissions.find(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);
                    const isDone = sub && ['graded', 'moderated'].includes(sub.status);
                    const isActive = sub && !isDone;
                    const stateKey = isDone ? 'done' : isActive ? 'active' : 'pending';
                    return (
                        <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`}>
                            <div className="vp-curr-item__icon">
                                {isDone && <CheckCircle size={15} />}
                                {isActive && <Clock size={15} />}
                                {!sub && <AlertCircle size={15} />}
                            </div>
                            <div className="vp-curr-item__info">
                                <span className="vp-curr-item__code">{mod.code || `M${idx + 1}`}</span>
                                <span className="vp-curr-item__name">{mod.name}</span>
                            </div>
                            <div className="vp-curr-item__badge">
                                {sub ? getStatusBadge(sub) : <span className="vp-badge vp-badge--none">Not Assigned</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    const renderDocRow = (title: string, docType: 'idUrl' | 'cvUrl' | 'qualUrl', url?: string) => {
        const isUploading = uploadingDoc === docType;
        const isStaff = user?.role !== 'learner';

        return (
            <div className="vp-doc-row">
                <div className="vp-doc-info">
                    <div className={`vp-doc-icon ${url ? 'uploaded' : 'missing'}`}>
                        <FileText size={20} />
                    </div>
                    <div className="vp-doc-text">
                        <h4>{title}</h4>
                        <span className={url ? 'status-uploaded' : 'status-missing'}>{url ? 'Uploaded & Verified' : 'Missing Document'}</span>
                    </div>
                </div>
                <div className="vp-doc-actions">
                    {url && <a href={url} target="_blank" rel="noopener noreferrer" className="vp-btn-view"><Eye size={14} /> View</a>}
                    {isStaff && (
                        <label className={`vp-btn-upload ${isUploading ? 'disabled' : ''}`}>
                            {isUploading ? <Loader2 size={14} className="vp-spin" /> : <Upload size={14} />}
                            {url ? 'Replace' : 'Upload'}
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleDocumentUpload(e, docType)} disabled={isUploading} style={{ display: 'none' }} />
                        </label>
                    )}
                </div>
            </div>
        );
    };

    if (learnersLoading && !enrollment) return (
        <div className="admin-layout vp-full-screen">
            <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
            <main className="main-wrapper vp-centered"><Loader2 size={40} className="vp-spin" /><span className="vp-loading-label">Initializing Secure Portfolio…</span></main>
        </div>
    );

    if (!enrollment) return (
        <div className="admin-layout vp-full-screen">
            <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
            <main className="main-wrapper" style={{ padding: '2rem' }}>
                <PageHeader theme={(user?.role as any) || 'default'} variant="compact" title="Record Not Found" onBack={() => navigate(-1)} backLabel="Back to Safety" />
                <div className="vp-empty-state vp-empty-state--error"><AlertCircle size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__text">This portfolio could not be located. It may belong to a different course or have been archived.</p></div>
            </main>
        </div>
    );

    const filteredSubmissions = submissions.filter(sub => {
        const subType = (sub.moduleType || 'knowledge').toLowerCase();
        if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
        return subType === activeTab;
    });

    const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';
    const learnerDocs = (enrollment as any).documents || {};

    return (
        <div className="admin-layout vp-full-screen">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />

            <main className="main-wrapper vp-scroll-area">
                {remediationTarget && (
                    <RemediationModal
                        submissionTitle={remediationTarget.title}
                        attemptNumber={remediationTarget.attemptNumber || 1}
                        onClose={() => setRemediationTarget(null)}
                        onSubmit={executeRemediation}
                    />
                )}

                <PageHeader theme={headerTheme} variant="hero" eyebrow="Portfolio of Evidence" title={enrollment.fullName} description={headerCourseName} onBack={() => navigate(-1)} status={{ label: enrollment.status?.toUpperCase(), variant: enrollment.status === 'active' ? 'active' : 'warning' }} />

                <div className="admin-content vp-content">
                    <div className="vp-profile-card">
                        <div className="vp-profile-card__avatar">
                            {(enrollment as any).profilePhotoUrl ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" /> : <User size={34} className="vp-profile-card__avatar-icon" />}
                        </div>
                        <div className="vp-profile-card__info">
                            <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
                            <div className="vp-profile-card__meta">
                                <span><strong>ID:</strong> {enrollment.idNumber}</span>
                                <span><Calendar size={12} /> Enrolled: {new Date(enrollment.trainingStartDate).toLocaleDateString()}</span>
                                <span className="vp-ref-tag"><History size={11} /> Ref: {enrollment.enrollmentId?.slice(-6) || enrollment.id?.slice(-6)}</span>
                            </div>
                        </div>
                        <div className="vp-profile-card__status">
                            <span className="vp-profile-card__status-label">Course Status</span>
                            <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>{enrollment.status?.toUpperCase()}</span>
                        </div>
                    </div>

                    <div className="vp-tab-bar">
                        {TABS.map(tab => (
                            <button key={tab.id} className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
                                {tab.icon} <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div className="vp-panel vp-panel--padded">
                            <div className="vp-overview-grid">
                                <div className="vp-overview-card">
                                    <h3 className="vp-overview-card__title"><BarChart2 size={14} /> Assessment Pipeline</h3>
                                    {pipelineStats.total === 0 ? (
                                        <div className="vp-empty-state">
                                            <BarChart2 size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Assigned</p><p className="vp-empty-state__text">No assessments have been published for this specific class yet.</p>
                                        </div>
                                    ) : (
                                        <div className="vp-pipeline">
                                            {renderPipelineBar('1. Learner Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
                                            {renderPipelineBar('2. Facilitator Pre-Marking', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
                                            {renderPipelineBar('3. Assessor Grading', pipelineStats.graded, pipelineStats.total, 'amber')}
                                            {renderPipelineBar('4. Moderator Verification', pipelineStats.moderated, pipelineStats.total, 'green')}
                                        </div>
                                    )}
                                </div>
                                <div className="vp-overview-card">
                                    <h3 className="vp-overview-card__title"><BookOpen size={14} /> Curriculum Coverage Map</h3>
                                    {!matchingProgramme ? (
                                        <div className="vp-empty-state">
                                            <AlertCircle size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Blueprint Linked</p><p className="vp-empty-state__text">No curriculum blueprint is linked to this specific class instance.</p>
                                        </div>
                                    ) : (
                                        <div className="vp-curr-sections">
                                            <div className="vp-curr-group"><span className="vp-curr-group__label">Knowledge Modules</span>{renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}</div>
                                            <div className="vp-curr-group"><span className="vp-curr-group__label">Practical Modules</span>{renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}</div>
                                            <div className="vp-curr-group"><span className="vp-curr-group__label">Workplace Modules</span>{renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab !== 'overview' && activeTab !== 'compliance' && (
                        <div className="vp-panel">
                            {loadingSubmissions ? (
                                <div className="vp-empty-state"><Loader2 size={28} className="vp-spin" /><span className="vp-empty-state__text">Filtering Course Assignments…</span></div>
                            ) : filteredSubmissions.length === 0 ? (
                                <div className="vp-empty-state">
                                    <FileText size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Found</p><p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
                                </div>
                            ) : (
                                <div className="vp-table-scroll">
                                    <table className="vp-table">
                                        <thead>
                                            <tr>
                                                <th className="vp-th">Assessment Title</th>
                                                <th className="vp-th vp-th--narrow">Type</th>
                                                <th className="vp-th vp-th--narrow">Time</th>
                                                <th className="vp-th vp-th--narrow">Status</th>
                                                <th className="vp-th vp-th--action" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredSubmissions.map(sub => {
                                                const role = user?.role;
                                                const currentAttempt = sub.attemptNumber || 1;
                                                const isRemediationAction = sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin');
                                                const isMaxAttempts = currentAttempt >= 3;

                                                const rowActionClass = (isActionRequired(sub) || (isRemediationAction && !isMaxAttempts)) ? 'vp-tr--action' : '';
                                                let btnClass = 'vp-action-btn--outline';
                                                let btnStyle: React.CSSProperties = {};

                                                if (isActionRequired(sub)) btnClass = 'vp-action-btn--primary';
                                                if (isRemediationAction) {
                                                    if (isMaxAttempts) {
                                                        btnStyle = { background: '#fef2f2', color: '#ef4444', borderColor: '#ef4444' };
                                                    } else {
                                                        btnClass = 'vp-action-btn--primary';
                                                        btnStyle = { background: '#f59e0b', color: 'white', borderColor: '#f59e0b' };
                                                    }
                                                }

                                                return (
                                                    <tr key={sub.id} className={`vp-tr ${rowActionClass}`}>
                                                        <td className="vp-td">
                                                            <span className="vp-cell-title">{sub.title}</span>
                                                            <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
                                                        </td>
                                                        <td className="vp-td"><span className="vp-cell-type">{sub.type}</span></td>
                                                        <td className="vp-td">{renderTimeRemaining(sub)}</td>
                                                        <td className="vp-td">{getStatusBadge(sub)}</td>
                                                        <td className="vp-td vp-td--action">
                                                            <button className={`vp-action-btn ${btnClass}`} style={btnStyle} onClick={() => handleActionClick(sub)} disabled={remediatingId === sub.id}>
                                                                {getActionContent(sub)}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'compliance' && (
                        <div className="vp-panel vp-panel--padded animate-fade-in">
                            <div className="vp-compliance-header">
                                <div className="vp-compliance-title"><FileBadge size={28} className="vp-compliance-icon" /><div><h3>Compliance Vault</h3><p>Mandatory KYC & QCTO documentation for <strong>{enrollment.fullName}</strong>.</p></div></div>
                            </div>
                            <div className="vp-doc-grid">
                                {renderDocRow('National ID / Passport', 'idUrl', learnerDocs.idUrl)}
                                {renderDocRow('Highest Qualification', 'qualUrl', learnerDocs.qualUrl)}
                                {renderDocRow('Comprehensive CV', 'cvUrl', learnerDocs.cvUrl)}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

// import React, { useEffect, useState, useMemo } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import {
//     User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
//     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
//     ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
//     Upload
// } from 'lucide-react';
// import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { signOut } from 'firebase/auth';
// import { auth, db, storage } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar';
// import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// import './ViewPortfolio.css';

// interface LearnerSubmission {
//     id: string;
//     assessmentId: string;
//     learnerId: string;
//     enrollmentId: string;
//     cohortId?: string;
//     title: string;
//     type: string;
//     status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
//     assignedAt: string;
//     startedAt?: string;
//     marks: number;
//     totalMarks: number;
//     competency?: 'C' | 'NYC';
//     moduleNumber?: string;
//     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
//     timeLimit?: number;
//     moderation?: { outcome?: 'Endorsed' | 'Returned' };
//     qualificationName?: string;
// }

// const TABS = [
//     { id: 'overview', label: 'Progress Overview', icon: <BarChart2 size={13} /> },
//     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={13} /> },
//     { id: 'practical', label: 'Practical (P)', icon: <FileText size={13} /> },
//     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={13} /> },
//     { id: 'other', label: 'Practice & Extras', icon: <Play size={13} /> },
//     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={13} /> },
// ] as const;

// type TabId = typeof TABS[number]['id'];

// export const ViewPortfolio: React.FC = () => {
//     const { id: routeId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();

//     // 🚀 READ COHORT CONTEXT FROM ROUTER
//     const targetCohortId = (location.state as any)?.cohortId;

//     // 🚀 STRICT ZUSTAND SELECTORS (Prevents infinite re-rendering loops)
//     const user = useStore(state => state.user);
//     const learners = useStore(state => state.learners);
//     const learnersLoading = useStore(state => state.learnersLoading);
//     const programmes = useStore(state => state.programmes);
//     const cohorts = useStore(state => state.cohorts);
//     const fetchLearners = useStore(state => state.fetchLearners);
//     const fetchProgrammes = useStore(state => state.fetchProgrammes);
//     const fetchCohorts = useStore(state => state.fetchCohorts);
//     const updateLearner = useStore(state => state.updateLearner);

//     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
//     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
//     const [activeTab, setActiveTab] = useState<TabId>('overview');
//     const [timeOffset, setTimeOffset] = useState(0);
//     const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
//     const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

//     // ── Secure time offset ──
//     useEffect(() => {
//         const fetchOffset = async () => {
//             try {
//                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
//                 const data = await res.json();
//                 setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
//             } catch { setTimeOffset(0); }
//         };
//         fetchOffset();
//         const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
//         return () => clearInterval(tick);
//     }, []);

//     const getSecureNow = () => currentTimeTick + timeOffset;

//     useEffect(() => {
//         if (learners.length === 0) fetchLearners();
//         if (programmes.length === 0) fetchProgrammes();
//         if (cohorts.length === 0) fetchCohorts();
//     }, [learners.length, programmes.length, cohorts.length, fetchLearners, fetchProgrammes, fetchCohorts]);

//     // ─── 🚀 SECURE CONTEXT-AWARE ENROLLMENT RECORD 🚀 ───
//     const enrollment = useMemo(() => {
//         if (!routeId) return undefined;

//         const humanRecords = learners.filter(l => l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId);
//         if (humanRecords.length === 0) return undefined;

//         if (targetCohortId) {
//             const exactMatch = humanRecords.find(l => l.cohortId === targetCohortId);
//             if (exactMatch) return exactMatch;
//             return { ...humanRecords[0], cohortId: targetCohortId };
//         }

//         let match = humanRecords.find(l => l.enrollmentId === routeId && l.id !== l.learnerId);
//         if (match) return match;

//         return humanRecords.find(e => e.status !== 'dropped') || humanRecords[0];
//     }, [learners, routeId, targetCohortId]);

//     // ─── PRIMITIVE DEPENDENCIES FOR EFFECTS (Bulletproof loop prevention) ───
//     const enrollmentId = enrollment?.id;
//     const enrollmentLearnerId = enrollment?.learnerId;
//     const enrollmentCohortId = enrollment?.cohortId;
//     const enrollmentSaqaId = enrollment?.qualification?.saqaId;
//     const enrollmentQualName = enrollment?.qualification?.name;

//     // ─── 🚀 BULLETPROOF PROGRAMME MATCHER 🚀 ───
//     const matchingProgramme = useMemo(() => {
//         if (programmes.length === 0) return null;

//         const activeCohortId = targetCohortId || enrollmentCohortId;

//         if (activeCohortId && cohorts.length > 0) {
//             const linkedCohort = cohorts.find(c => c.id === activeCohortId);
//             const templateId = (linkedCohort as any)?.programmeId || (linkedCohort as any)?.qualificationId;

//             if (templateId) {
//                 const prog = programmes.find(p => p.id === templateId);
//                 if (prog) return prog;
//             }
//         }

//         if (enrollmentSaqaId) {
//             const targetSaqa = String(enrollmentSaqaId).trim();
//             if (targetSaqa) {
//                 const progMatch = programmes.find(p => String(p.saqaId || '').trim() === targetSaqa);
//                 if (progMatch) return progMatch;
//             }
//         }

//         return null;
//     }, [programmes, cohorts, enrollmentCohortId, targetCohortId, enrollmentSaqaId]);

//     const headerCourseName = matchingProgramme?.name || enrollmentQualName || 'Unassigned Qualification';

//     // ─── 🚀 STRICT SUBMISSION FETCHER 🚀 ───
//     useEffect(() => {
//         let isMounted = true;

//         const load = async () => {
//             if (!enrollmentId && !enrollmentLearnerId) return;
//             setLoadingSubmissions(true);
//             try {
//                 const subRef = collection(db, 'learner_submissions');
//                 const humanId = enrollmentLearnerId || enrollmentId;
//                 const activeCohortId = targetCohortId || enrollmentCohortId;

//                 let q;
//                 if (activeCohortId && activeCohortId !== 'Unassigned') {
//                     q = query(subRef, where('learnerId', '==', humanId), where('cohortId', '==', activeCohortId));
//                 } else {
//                     q = query(subRef, where('learnerId', '==', humanId));
//                 }

//                 let snap = await getDocs(q);
//                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

//                 const cache = new Map<string, number | undefined>();
//                 for (let i = 0; i < subs.length; i++) {
//                     const sub = subs[i];
//                     if (!cache.has(sub.assessmentId)) {
//                         const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
//                         cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
//                     }
//                     subs[i].timeLimit = cache.get(sub.assessmentId);
//                 }

//                 if (isMounted) {
//                     subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
//                     setSubmissions(subs);
//                 }
//             } catch (err) {
//                 if (isMounted) console.error('Error fetching submissions:', err);
//             } finally {
//                 if (isMounted) setLoadingSubmissions(false);
//             }
//         };

//         load();

//         return () => { isMounted = false; };
//         // 🚀 Strict Primitive Dependencies
//     }, [enrollmentId, enrollmentLearnerId, enrollmentCohortId, targetCohortId]);

//     // ── Pipeline stats ──
//     const pipelineStats = useMemo(() => {
//         const total = submissions.length;
//         if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
//         return {
//             total,
//             submitted: submissions.filter(s => !['not_started', 'in_progress'].includes(s.status)).length,
//             facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed', 'returned'].includes(s.status)).length,
//             graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
//             moderated: submissions.filter(s => s.status === 'moderated').length,
//         };
//     }, [submissions]);

//     // ── Document Upload Handler ──
//     const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'idUrl' | 'cvUrl' | 'qualUrl') => {
//         const file = e.target.files?.[0];
//         if (!file || !enrollment) return;

//         setUploadingDoc(docType);
//         try {
//             const ext = file.name.split('.').pop();
//             const targetId = enrollment.learnerId || enrollment.id;
//             const storageRef = ref(storage, `learners/${targetId}/${docType}_${Date.now()}.${ext}`);

//             const snapshot = await uploadBytes(storageRef, file);
//             const downloadUrl = await getDownloadURL(snapshot.ref);

//             const currentDocs = (enrollment as any).documents || {};

//             await updateLearner(targetId, {
//                 documents: {
//                     ...currentDocs,
//                     [docType]: downloadUrl
//                 }
//             } as any);

//             alert("Document uploaded successfully!");
//         } catch (error) {
//             console.error("Upload failed", error);
//             alert("Failed to upload document. Please try again.");
//         } finally {
//             setUploadingDoc(null);
//             e.target.value = '';
//         }
//     };

//     const handleActionClick = (sub: LearnerSubmission) => {
//         if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
//         else navigate(`/portfolio/submission/${sub.id}`);
//     };

//     const isActionRequired = (sub: LearnerSubmission) => {
//         const role = user?.role;
//         return (role === 'facilitator' && sub.status === 'submitted') ||
//             (role === 'assessor' && (sub.status === 'facilitator_reviewed' || sub.status === 'returned')) ||
//             (role === 'moderator' && sub.status === 'graded');
//     };

//     const getStatusBadge = (sub: LearnerSubmission) => {
//         const role = user?.role || 'learner';
//         switch (sub.status) {
//             case 'moderated':
//                 return sub.competency === 'C'
//                     ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span>
//                     : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
//             case 'appealed':
//                 return <span className="vp-badge vp-badge--appeal"><Scale size={11} /> Appealed</span>;
//             case 'graded':
//                 return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
//             case 'returned':
//                 return <span className="vp-badge vp-badge--warning"><AlertCircle size={11} /> Returned to Assessor</span>;
//             case 'facilitator_reviewed':
//                 return <span className="vp-badge vp-badge--progress"><PenTool size={11} /> Grading Pending</span>;
//             case 'submitted':
//                 return role === 'facilitator' || role === 'admin'
//                     ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
//                     : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
//             case 'in_progress':
//                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress</span>;
//             default:
//                 return <span className="vp-badge vp-badge--none">Not Started</span>;
//         }
//     };

//     const getActionContent = (sub: LearnerSubmission) => {
//         const role = user?.role || 'learner';
//         if (role === 'learner') {
//             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
//             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
//             return <><Eye size={12} /> View Results</>;
//         }
//         return <><PenTool size={12} /> Review Record</>;
//     };

//     const renderTimeRemaining = (sub: LearnerSubmission) => {
//         if (!sub.timeLimit) return <span className="vp-time vp-time--none">No Limit</span>;
//         if (sub.status === 'not_started') return <span className="vp-time vp-time--neutral">{sub.timeLimit}m Total</span>;
//         if (sub.status === 'in_progress' && sub.startedAt) {
//             const endTime = new Date(sub.startedAt).getTime() + sub.timeLimit * 60 * 1000;
//             const remainingSecs = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
//             if (remainingSecs === 0) return <span className="vp-time vp-time--expired"><AlertCircle size={13} /> Time Expired</span>;
//             const m = Math.floor(remainingSecs / 60);
//             const s = remainingSecs % 60;
//             return (
//                 <span className={`vp-time ${remainingSecs < 300 ? 'vp-time--low' : 'vp-time--ok'}`}>
//                     <Timer size={13} />{m}m {s.toString().padStart(2, '0')}s
//                 </span>
//             );
//         }
//         return <span className="vp-time vp-time--none">—</span>;
//     };

//     const renderPipelineBar = (label: string, value: number, total: number, colorKey: string) => {
//         const pct = total > 0 ? Math.round((value / total) * 100) : 0;
//         return (
//             <div className="vp-pipeline-item" key={label}>
//                 <div className="vp-pipeline-item__header">
//                     <span className="vp-pipeline-item__label">{label}</span>
//                     <span className="vp-pipeline-item__stat">{value} / {total} — {pct}%</span>
//                 </div>
//                 <div className="vp-pipeline-track">
//                     <div
//                         className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`}
//                         style={{ width: `${pct}%` } as React.CSSProperties}
//                     />
//                 </div>
//             </div>
//         );
//     };

//     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
//         if (!modules || modules.length === 0) {
//             return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
//         }
//         return (
//             <ul className="vp-curr-list">
//                 {modules.map((mod, idx) => {
//                     const sub = submissions.find(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);
//                     const isDone = sub && ['graded', 'moderated'].includes(sub.status);
//                     const isActive = sub && !isDone;
//                     const stateKey = isDone ? 'done' : isActive ? 'active' : 'pending';
//                     return (
//                         <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`}>
//                             <div className="vp-curr-item__icon">
//                                 {isDone && <CheckCircle size={15} />}
//                                 {isActive && <Clock size={15} />}
//                                 {!sub && <AlertCircle size={15} />}
//                             </div>
//                             <div className="vp-curr-item__info">
//                                 <span className="vp-curr-item__code">{mod.code || `M${idx + 1}`}</span>
//                                 <span className="vp-curr-item__name">{mod.name}</span>
//                             </div>
//                             <div className="vp-curr-item__badge">
//                                 {sub ? getStatusBadge(sub) : <span className="vp-badge vp-badge--none">Not Assigned</span>}
//                             </div>
//                         </li>
//                     );
//                 })}
//             </ul>
//         );
//     };

//     const renderDocRow = (title: string, docType: 'idUrl' | 'cvUrl' | 'qualUrl', url?: string) => {
//         const isUploading = uploadingDoc === docType;
//         const isStaff = user?.role !== 'learner';

//         return (
//             <div className="vp-doc-row">
//                 <div className="vp-doc-info">
//                     <div className={`vp-doc-icon ${url ? 'uploaded' : 'missing'}`}>
//                         <FileText size={20} />
//                     </div>
//                     <div className="vp-doc-text">
//                         <h4>{title}</h4>
//                         <span className={url ? 'status-uploaded' : 'status-missing'}>
//                             {url ? 'Uploaded & Verified' : 'Missing Document'}
//                         </span>
//                     </div>
//                 </div>
//                 <div className="vp-doc-actions">
//                     {url && (
//                         <a href={url} target="_blank" rel="noopener noreferrer" className="vp-btn-view">
//                             <Eye size={14} /> View
//                         </a>
//                     )}

//                     {isStaff && (
//                         <label className={`vp-btn-upload ${isUploading ? 'disabled' : ''}`}>
//                             {isUploading ? <Loader2 size={14} className="vp-spin" /> : <Upload size={14} />}
//                             {url ? 'Replace' : 'Upload'}
//                             <input
//                                 type="file"
//                                 accept=".pdf,.jpg,.jpeg,.png"
//                                 onChange={(e) => handleDocumentUpload(e, docType)}
//                                 disabled={isUploading}
//                                 style={{ display: 'none' }}
//                             />
//                         </label>
//                     )}
//                 </div>
//             </div>
//         );
//     };

//     if (learnersLoading && !enrollment) {
//         return (
//             <div className="admin-layout vp-full-screen">
//                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//                 <main className="main-wrapper vp-centered">
//                     <Loader2 size={40} className="vp-spin" />
//                     <span className="vp-loading-label">Initializing Secure Portfolio…</span>
//                 </main>
//             </div>
//         );
//     }

//     if (!enrollment) {
//         return (
//             <div className="admin-layout vp-full-screen">
//                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//                 <main className="main-wrapper" style={{ padding: '2rem' }}>
//                     <PageHeader
//                         theme={(user?.role as any) || 'default'}
//                         variant="compact"
//                         title="Record Not Found"
//                         onBack={() => navigate(-1)}
//                         backLabel="Back to Safety"
//                     />
//                     <div className="vp-empty-state vp-empty-state--error">
//                         <AlertCircle size={40} className="vp-empty-state__icon" />
//                         <p className="vp-empty-state__text">
//                             This portfolio could not be located. It may belong to a different
//                             course or have been archived.
//                         </p>
//                     </div>
//                 </main>
//             </div>
//         );
//     }

//     const filteredSubmissions = submissions.filter(sub => {
//         const subType = (sub.moduleType || 'knowledge').toLowerCase();
//         if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
//         return subType === activeTab;
//     });

//     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';
//     const learnerDocs = (enrollment as any).documents || {};

//     return (
//         <div className="admin-layout vp-full-screen">
//             <Sidebar
//                 role={user?.role}
//                 currentNav="learners"
//                 onLogout={() => signOut(auth).then(() => navigate('/login'))}
//             />

//             <main className="main-wrapper vp-scroll-area">

//                 <PageHeader
//                     theme={headerTheme}
//                     variant="hero"
//                     eyebrow="Portfolio of Evidence"
//                     title={enrollment.fullName}
//                     description={headerCourseName}
//                     onBack={() => navigate(-1)}
//                     status={{
//                         label: enrollment.status?.toUpperCase(),
//                         variant: enrollment.status === 'active' ? 'active' : 'warning',
//                     }}
//                 />

//                 <div className="admin-content vp-content">

//                     <div className="vp-profile-card">
//                         <div className="vp-profile-card__avatar">
//                             {(enrollment as any).profilePhotoUrl
//                                 ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" />
//                                 : <User size={34} className="vp-profile-card__avatar-icon" />
//                             }
//                         </div>
//                         <div className="vp-profile-card__info">
//                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
//                             <div className="vp-profile-card__meta">
//                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
//                                 <span><Calendar size={12} /> Enrolled: {new Date(enrollment.trainingStartDate).toLocaleDateString()}</span>
//                                 <span className="vp-ref-tag">
//                                     <History size={11} />
//                                     Ref: {enrollment.enrollmentId?.slice(-6) || enrollment.id?.slice(-6)}
//                                 </span>
//                             </div>
//                         </div>
//                         <div className="vp-profile-card__status">
//                             <span className="vp-profile-card__status-label">Course Status</span>
//                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>
//                                 {enrollment.status?.toUpperCase()}
//                             </span>
//                         </div>
//                     </div>

//                     <div className="vp-tab-bar">
//                         {TABS.map(tab => (
//                             <button
//                                 key={tab.id}
//                                 className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`}
//                                 onClick={() => setActiveTab(tab.id)}
//                             >
//                                 {tab.icon}
//                                 <span>{tab.label}</span>
//                             </button>
//                         ))}
//                     </div>

//                     {activeTab === 'overview' && (
//                         <div className="vp-panel vp-panel--padded">
//                             <div className="vp-overview-grid">
//                                 <div className="vp-overview-card">
//                                     <h3 className="vp-overview-card__title">
//                                         <BarChart2 size={14} /> Assessment Pipeline
//                                     </h3>
//                                     {pipelineStats.total === 0 ? (
//                                         <div className="vp-empty-state">
//                                             <BarChart2 size={32} className="vp-empty-state__icon" />
//                                             <p className="vp-empty-state__title">No Assessments Assigned</p>
//                                             <p className="vp-empty-state__text">No assessments have been published for this specific class yet.</p>
//                                         </div>
//                                     ) : (
//                                         <div className="vp-pipeline">
//                                             {renderPipelineBar('1. Learner Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
//                                             {renderPipelineBar('2. Facilitator Pre-Marking', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
//                                             {renderPipelineBar('3. Assessor Grading', pipelineStats.graded, pipelineStats.total, 'amber')}
//                                             {renderPipelineBar('4. Moderator Verification', pipelineStats.moderated, pipelineStats.total, 'green')}
//                                         </div>
//                                     )}
//                                 </div>

//                                 <div className="vp-overview-card">
//                                     <h3 className="vp-overview-card__title">
//                                         <BookOpen size={14} /> Curriculum Coverage Map
//                                     </h3>
//                                     {!matchingProgramme ? (
//                                         <div className="vp-empty-state">
//                                             <AlertCircle size={32} className="vp-empty-state__icon" />
//                                             <p className="vp-empty-state__title">No Blueprint Linked</p>
//                                             <p className="vp-empty-state__text">No curriculum blueprint is linked to this specific class instance.</p>
//                                         </div>
//                                     ) : (
//                                         <div className="vp-curr-sections">
//                                             <div className="vp-curr-group">
//                                                 <span className="vp-curr-group__label">Knowledge Modules</span>
//                                                 {renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}
//                                             </div>
//                                             <div className="vp-curr-group">
//                                                 <span className="vp-curr-group__label">Practical Modules</span>
//                                                 {renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}
//                                             </div>
//                                             <div className="vp-curr-group">
//                                                 <span className="vp-curr-group__label">Workplace Modules</span>
//                                                 {renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}
//                                             </div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab !== 'overview' && activeTab !== 'compliance' && (
//                         <div className="vp-panel">
//                             {loadingSubmissions ? (
//                                 <div className="vp-empty-state">
//                                     <Loader2 size={28} className="vp-spin" />
//                                     <span className="vp-empty-state__text">Filtering Course Assignments…</span>
//                                 </div>
//                             ) : filteredSubmissions.length === 0 ? (
//                                 <div className="vp-empty-state">
//                                     <FileText size={40} className="vp-empty-state__icon" />
//                                     <p className="vp-empty-state__title">No Assessments Found</p>
//                                     <p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
//                                 </div>
//                             ) : (
//                                 <div className="vp-table-scroll">
//                                     <table className="vp-table">
//                                         <thead>
//                                             <tr>
//                                                 <th className="vp-th">Assessment Title</th>
//                                                 <th className="vp-th vp-th--narrow">Type</th>
//                                                 <th className="vp-th vp-th--narrow">Time</th>
//                                                 <th className="vp-th vp-th--narrow">Status</th>
//                                                 <th className="vp-th vp-th--action" />
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {filteredSubmissions.map(sub => (
//                                                 <tr key={sub.id} className={`vp-tr ${isActionRequired(sub) ? 'vp-tr--action' : ''}`}>
//                                                     <td className="vp-td">
//                                                         <span className="vp-cell-title">{sub.title}</span>
//                                                         <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
//                                                     </td>
//                                                     <td className="vp-td">
//                                                         <span className="vp-cell-type">{sub.type}</span>
//                                                     </td>
//                                                     <td className="vp-td">{renderTimeRemaining(sub)}</td>
//                                                     <td className="vp-td">{getStatusBadge(sub)}</td>
//                                                     <td className="vp-td vp-td--action">
//                                                         <button
//                                                             className={`vp-action-btn ${isActionRequired(sub) ? 'vp-action-btn--primary' : 'vp-action-btn--outline'}`}
//                                                             onClick={() => handleActionClick(sub)}
//                                                         >
//                                                             {getActionContent(sub)}
//                                                         </button>
//                                                     </td>
//                                                 </tr>
//                                             ))}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {activeTab === 'compliance' && (
//                         <div className="vp-panel vp-panel--padded animate-fade-in">
//                             <div className="vp-compliance-header">
//                                 <div className="vp-compliance-title">
//                                     <FileBadge size={28} className="vp-compliance-icon" />
//                                     <div>
//                                         <h3>Compliance Vault</h3>
//                                         <p>Mandatory KYC & QCTO documentation for <strong>{enrollment.fullName}</strong>.</p>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div className="vp-doc-grid">
//                                 {renderDocRow('National ID / Passport', 'idUrl', learnerDocs.idUrl)}
//                                 {renderDocRow('Highest Qualification', 'qualUrl', learnerDocs.qualUrl)}
//                                 {renderDocRow('Comprehensive CV', 'cvUrl', learnerDocs.cvUrl)}
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };


// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // import {
// //     User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
// //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
// //     ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
// //     Upload
// // } from 'lucide-react';
// // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { signOut } from 'firebase/auth';
// // import { auth, db, storage } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// // import './ViewPortfolio.css';

// // interface LearnerSubmission {
// //     id: string;
// //     assessmentId: string;
// //     learnerId: string;
// //     enrollmentId: string;
// //     cohortId?: string;
// //     title: string;
// //     type: string;
// //     status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
// //     assignedAt: string;
// //     startedAt?: string;
// //     marks: number;
// //     totalMarks: number;
// //     competency?: 'C' | 'NYC';
// //     moduleNumber?: string;
// //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// //     timeLimit?: number;
// //     moderation?: { outcome?: 'Endorsed' | 'Returned' };
// //     qualificationName?: string;
// // }

// // const TABS = [
// //     { id: 'overview', label: 'Progress Overview', icon: <BarChart2 size={13} /> },
// //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={13} /> },
// //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={13} /> },
// //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={13} /> },
// //     { id: 'other', label: 'Practice & Extras', icon: <Play size={13} /> },
// //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={13} /> },
// // ] as const;

// // type TabId = typeof TABS[number]['id'];

// // export const ViewPortfolio: React.FC = () => {
// //     const { id: routeId } = useParams();
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // 🚀 READ COHORT CONTEXT FROM ROUTER (if provided by previous page)
// //     const targetCohortId = (location.state as any)?.cohortId;

// //     const {
// //         user,
// //         learners, fetchLearners, learnersLoading,
// //         programmes, fetchProgrammes,
// //         cohorts, fetchCohorts,
// //         updateLearner
// //     } = useStore();

// //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// //     const [activeTab, setActiveTab] = useState<TabId>('overview');
// //     const [timeOffset, setTimeOffset] = useState(0);
// //     const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
// //     const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

// //     // ── 🚀 SECURE CONTEXT-AWARE ENROLLMENT RECORD 🚀 ──
// //     // ── 🚀 SECURE CONTEXT-AWARE ENROLLMENT RECORD 🚀 ──
// //     const enrollment = useMemo(() => {
// //         if (!routeId) return undefined;

// //         // 1. HIGHEST PRIORITY: If we know which cohort we came from, FORCE the match for that specific cohort.
// //         if (targetCohortId) {
// //             const contextMatch = learners.find(l =>
// //                 (l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId) &&
// //                 l.cohortId === targetCohortId
// //             );
// //             if (contextMatch) {
// //                 console.log("🔒 Locked to Context Cohort:", targetCohortId);
// //                 return contextMatch;
// //             }
// //         }

// //         // 2. Secondary: If no context was provided, try matching the exact Enrollment ID
// //         let match = learners.find(l => l.enrollmentId === routeId && l.id !== l.learnerId); // Ensures it's a relational record
// //         if (match) return match;

// //         // 3. Fallback: Grab their first active record
// //         const all = learners.filter(l => l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId);
// //         return all.find(e => e.status !== 'dropped') || all[0];
// //     }, [learners, routeId, targetCohortId]);

// //     // ── 🚀 BULLETPROOF PROGRAMME MATCHER 🚀 ──
// //     const matchingProgramme = useMemo(() => {
// //         if (!enrollment || programmes.length === 0) return null;

// //         // Step A: Priority Match via the physical Class (Cohort)
// //         if (enrollment.cohortId && cohorts.length > 0) {
// //             const linkedCohort = cohorts.find(c => c.id === enrollment.cohortId);

// //             // 🚀 WE NOW EXPLICITLY LOOK FOR programmeId BASED ON YOUR FIRESTORE DATA
// //             const templateId = (linkedCohort as any)?.programmeId || (linkedCohort as any)?.qualificationId;

// //             if (templateId) {
// //                 const prog = programmes.find(p => p.id === templateId);
// //                 if (prog) {
// //                     return prog;
// //                 } else {
// //                     // 🚨 If you see this in the console, your database is out of sync!
// //                     console.error(`🚨 DATA MISMATCH: Cohort '${linkedCohort?.name}' points to programmeId '${templateId}', but that template does not exist!`);
// //                 }
// //             }
// //         }

// //         // Step B: Strict Fallback Match via Learner's saved Qualification data
// //         if (enrollment.qualification) {
// //             const targetSaqa = String(enrollment.qualification.saqaId || '').trim();
// //             const targetName = String(enrollment.qualification.name || '').trim().toLowerCase();

// //             const progMatch = programmes.find(p => {
// //                 const pSaqa = String(p.saqaId || '').trim();
// //                 const pName = String(p.name || '').trim().toLowerCase();

// //                 if (targetSaqa && pSaqa && targetSaqa === pSaqa) return true;
// //                 if (targetName && pName && targetName === pName) return true;
// //                 return false;
// //             });

// //             if (progMatch) return progMatch;
// //         }

// //         return null;
// //     }, [programmes, enrollment, cohorts]);


// //     // Derive header name safely
// //     const headerCourseName = matchingProgramme?.name
// //         || enrollment?.qualification?.name
// //         || 'Unassigned Qualification';

// //     // 🔍 TEMPORARY DIAGNOSTIC TRACKER
// //     useEffect(() => {
// //         if (learnersLoading || programmes.length === 0 || cohorts.length === 0) return;

// //         console.group("🔍 DIAGNOSING CURRICULUM MATCH 🔍");
// //         console.log("1. URL Route ID:", routeId);
// //         console.log("2. Router State (Cohort ID):", location.state?.cohortId);

// //         console.log("3. Found Enrollment:", enrollment ? {
// //             id: enrollment.id,
// //             enrollmentId: enrollment.enrollmentId,
// //             cohortId: enrollment.cohortId,
// //             qualName: enrollment.qualification?.name,
// //             saqaId: enrollment.qualification?.saqaId
// //         } : "NOT FOUND");

// //         if (enrollment && enrollment.cohortId) {
// //             const linkedCohort = cohorts.find(c => c.id === enrollment.cohortId);
// //             console.log("4. Linked Cohort:", linkedCohort ? {
// //                 id: linkedCohort.id,
// //                 name: linkedCohort.name,
// //                 qualificationId: linkedCohort.qualificationId // THIS IS THE CRITICAL FIELD
// //             } : "NOT FOUND IN STORE");

// //             if (linkedCohort && linkedCohort.qualificationId) {
// //                 const prog = programmes.find(p => p.id === linkedCohort.qualificationId);
// //                 console.log("5. Relational Programme Match:", prog ? { id: prog.id, name: prog.name } : "PROGRAMME ID DOES NOT MATCH COHORT QUALIFICATION ID");
// //             } else {
// //                 console.log("5. Relational Programme Match: FAILED (Cohort has no qualificationId)");
// //             }
// //         }

// //         console.log("6. Final Matching Programme Chosen by App:", matchingProgramme ? {
// //             id: matchingProgramme.id,
// //             name: matchingProgramme.name
// //         } : "NONE");
// //         console.groupEnd();
// //     }, [routeId, location.state, enrollment, cohorts, programmes, matchingProgramme, learnersLoading]);


// //     // ── Secure time offset ──
// //     useEffect(() => {
// //         const fetchOffset = async () => {
// //             try {
// //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// //                 const data = await res.json();
// //                 setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
// //             } catch { setTimeOffset(0); }
// //         };
// //         fetchOffset();
// //         const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
// //         return () => clearInterval(tick);
// //     }, []);

// //     const getSecureNow = () => currentTimeTick + timeOffset;

// //     useEffect(() => {
// //         if (learners.length === 0) fetchLearners();
// //         if (programmes.length === 0) fetchProgrammes();
// //         if (cohorts.length === 0) fetchCohorts();
// //     }, [learners.length, programmes.length, cohorts.length, fetchLearners, fetchProgrammes, fetchCohorts]);

// //     // ── Fetch submissions ──
// //     useEffect(() => {
// //         const load = async () => {
// //             if (!enrollment) return;
// //             setLoadingSubmissions(true);
// //             try {
// //                 const subRef = collection(db, 'learner_submissions');
// //                 let q = query(subRef, where('enrollmentId', '==', enrollment.enrollmentId));
// //                 let snap = await getDocs(q);
// //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// //                 // if (subs.length === 0 && enrollment.learnerId) {
// //                 //     const legacyQ = query(subRef, where('learnerId', '==', enrollment.learnerId));
// //                 //     const legacySnap = await getDocs(legacyQ);
// //                 //     const all = legacySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// //                 //     // Critical: Filter legacy records strictly to the current cohort if available
// //                 //     subs = all.filter(s => {
// //                 //         if (enrollment.cohortId) return s.cohortId === enrollment.cohortId;
// //                 //         return s.qualificationName === enrollment.qualification?.name;
// //                 //     });
// //                 // }

// //                 if (subs.length === 0 && enrollment.learnerId) {
// //                     const legacyQ = query(subRef, where('learnerId', '==', enrollment.learnerId));
// //                     const legacySnap = await getDocs(legacyQ);
// //                     const all = legacySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// //                     subs = all.filter(s => {
// //                         // 🚀 STRICT FILTER: Only show assessments explicitly assigned to THIS class instance
// //                         if (enrollment.cohortId && s.cohortId) {
// //                             return s.cohortId === enrollment.cohortId;
// //                         }
// //                         // Absolute fallback for extremely old records without a cohortId
// //                         return s.qualificationName === enrollment.qualification?.name && !s.cohortId;
// //                     });
// //                 }

// //                 const cache = new Map<string, number | undefined>();
// //                 for (let i = 0; i < subs.length; i++) {
// //                     const sub = subs[i];
// //                     if (!cache.has(sub.assessmentId)) {
// //                         const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// //                         cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
// //                     }
// //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// //                 }

// //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// //                 setSubmissions(subs);
// //             } catch (err) {
// //                 console.error('Error fetching submissions:', err);
// //             } finally {
// //                 setLoadingSubmissions(false);
// //             }
// //         };
// //         load();
// //     }, [enrollment]);

// //     // ── Pipeline stats ──
// //     const pipelineStats = useMemo(() => {
// //         const total = submissions.length;
// //         if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
// //         return {
// //             total,
// //             submitted: submissions.filter(s => !['not_started', 'in_progress'].includes(s.status)).length,
// //             facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(s.status)).length,
// //             graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
// //             moderated: submissions.filter(s => s.status === 'moderated').length,
// //         };
// //     }, [submissions]);

// //     // ── Document Upload Handler ──
// //     const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'idUrl' | 'cvUrl' | 'qualUrl') => {
// //         const file = e.target.files?.[0];
// //         if (!file || !enrollment) return;

// //         setUploadingDoc(docType);
// //         try {
// //             const ext = file.name.split('.').pop();
// //             const storageRef = ref(storage, `learners/${enrollment.learnerId}/${docType}_${Date.now()}.${ext}`);

// //             const snapshot = await uploadBytes(storageRef, file);
// //             const downloadUrl = await getDownloadURL(snapshot.ref);

// //             const currentDocs = (enrollment as any).documents || {};

// //             await updateLearner(enrollment.id, {
// //                 documents: {
// //                     ...currentDocs,
// //                     [docType]: downloadUrl
// //                 }
// //             } as any);

// //             alert("Document uploaded successfully!");
// //         } catch (error) {
// //             console.error("Upload failed", error);
// //             alert("Failed to upload document. Please try again.");
// //         } finally {
// //             setUploadingDoc(null);
// //             e.target.value = '';
// //         }
// //     };

// //     const handleActionClick = (sub: LearnerSubmission) => {
// //         if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
// //         else navigate(`/portfolio/submission/${sub.id}`);
// //     };

// //     const isActionRequired = (sub: LearnerSubmission) => {
// //         const role = user?.role;
// //         return (role === 'facilitator' && sub.status === 'submitted') ||
// //             (role === 'assessor' && sub.status === 'facilitator_reviewed');
// //     };

// //     const getStatusBadge = (sub: LearnerSubmission) => {
// //         const role = user?.role || 'learner';
// //         switch (sub.status) {
// //             case 'moderated':
// //                 return sub.competency === 'C'
// //                     ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span>
// //                     : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
// //             case 'appealed':
// //                 return <span className="vp-badge vp-badge--appeal"><Scale size={11} /> Appealed</span>;
// //             case 'graded':
// //                 return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
// //             case 'facilitator_reviewed':
// //                 return <span className="vp-badge vp-badge--progress"><PenTool size={11} /> Grading Pending</span>;
// //             case 'submitted':
// //                 return role === 'facilitator'
// //                     ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
// //                     : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
// //             case 'in_progress':
// //                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress</span>;
// //             default:
// //                 return <span className="vp-badge vp-badge--none">Not Started</span>;
// //         }
// //     };

// //     const getActionContent = (sub: LearnerSubmission) => {
// //         const role = user?.role || 'learner';
// //         if (role === 'learner') {
// //             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
// //             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
// //             return <><Eye size={12} /> View Results</>;
// //         }
// //         return <><PenTool size={12} /> Review Record</>;
// //     };

// //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// //         if (!sub.timeLimit) return <span className="vp-time vp-time--none">No Limit</span>;
// //         if (sub.status === 'not_started') return <span className="vp-time vp-time--neutral">{sub.timeLimit}m Total</span>;
// //         if (sub.status === 'in_progress' && sub.startedAt) {
// //             const endTime = new Date(sub.startedAt).getTime() + sub.timeLimit * 60 * 1000;
// //             const remainingSecs = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
// //             if (remainingSecs === 0) return <span className="vp-time vp-time--expired"><AlertCircle size={13} /> Time Expired</span>;
// //             const m = Math.floor(remainingSecs / 60);
// //             const s = remainingSecs % 60;
// //             return (
// //                 <span className={`vp-time ${remainingSecs < 300 ? 'vp-time--low' : 'vp-time--ok'}`}>
// //                     <Timer size={13} />{m}m {s.toString().padStart(2, '0')}s
// //                 </span>
// //             );
// //         }
// //         return <span className="vp-time vp-time--none">—</span>;
// //     };

// //     const renderPipelineBar = (label: string, value: number, total: number, colorKey: string) => {
// //         const pct = total > 0 ? Math.round((value / total) * 100) : 0;
// //         return (
// //             <div className="vp-pipeline-item" key={label}>
// //                 <div className="vp-pipeline-item__header">
// //                     <span className="vp-pipeline-item__label">{label}</span>
// //                     <span className="vp-pipeline-item__stat">{value} / {total} — {pct}%</span>
// //                 </div>
// //                 <div className="vp-pipeline-track">
// //                     <div
// //                         className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`}
// //                         style={{ width: `${pct}%` } as React.CSSProperties}
// //                     />
// //                 </div>
// //             </div>
// //         );
// //     };

// //     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
// //         if (!modules || modules.length === 0) {
// //             return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
// //         }
// //         return (
// //             <ul className="vp-curr-list">
// //                 {modules.map((mod, idx) => {
// //                     const sub = submissions.find(s => s.moduleNumber === mod.code);
// //                     const isDone = sub && ['graded', 'moderated'].includes(sub.status);
// //                     const isActive = sub && !isDone;
// //                     const stateKey = isDone ? 'done' : isActive ? 'active' : 'pending';
// //                     return (
// //                         <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`}>
// //                             <div className="vp-curr-item__icon">
// //                                 {isDone && <CheckCircle size={15} />}
// //                                 {isActive && <Clock size={15} />}
// //                                 {!sub && <AlertCircle size={15} />}
// //                             </div>
// //                             <div className="vp-curr-item__info">
// //                                 <span className="vp-curr-item__code">{mod.code || `M${idx + 1}`}</span>
// //                                 <span className="vp-curr-item__name">{mod.name}</span>
// //                             </div>
// //                             <div className="vp-curr-item__badge">
// //                                 {sub ? getStatusBadge(sub) : <span className="vp-badge vp-badge--none">Not Assigned</span>}
// //                             </div>
// //                         </li>
// //                     );
// //                 })}
// //             </ul>
// //         );
// //     };

// //     const renderDocRow = (title: string, docType: 'idUrl' | 'cvUrl' | 'qualUrl', url?: string) => {
// //         const isUploading = uploadingDoc === docType;
// //         const isStaff = user?.role !== 'learner';

// //         return (
// //             <div className="vp-doc-row">
// //                 <div className="vp-doc-info">
// //                     <div className={`vp-doc-icon ${url ? 'uploaded' : 'missing'}`}>
// //                         <FileText size={20} />
// //                     </div>
// //                     <div className="vp-doc-text">
// //                         <h4>{title}</h4>
// //                         <span className={url ? 'status-uploaded' : 'status-missing'}>
// //                             {url ? 'Uploaded & Verified' : 'Missing Document'}
// //                         </span>
// //                     </div>
// //                 </div>
// //                 <div className="vp-doc-actions">
// //                     {url && (
// //                         <a href={url} target="_blank" rel="noopener noreferrer" className="vp-btn-view">
// //                             <Eye size={14} /> View
// //                         </a>
// //                     )}

// //                     {isStaff && (
// //                         <label className={`vp-btn-upload ${isUploading ? 'disabled' : ''}`}>
// //                             {isUploading ? <Loader2 size={14} className="vp-spin" /> : <Upload size={14} />}
// //                             {url ? 'Replace' : 'Upload'}
// //                             <input
// //                                 type="file"
// //                                 accept=".pdf,.jpg,.jpeg,.png"
// //                                 onChange={(e) => handleDocumentUpload(e, docType)}
// //                                 disabled={isUploading}
// //                                 style={{ display: 'none' }}
// //                             />
// //                         </label>
// //                     )}
// //                 </div>
// //             </div>
// //         );
// //     };

// //     if (learnersLoading && !enrollment) {
// //         return (
// //             <div className="admin-layout vp-full-screen">
// //                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// //                 <main className="main-wrapper vp-centered">
// //                     <Loader2 size={40} className="vp-spin" />
// //                     <span className="vp-loading-label">Initializing Secure Portfolio…</span>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     if (!enrollment) {
// //         return (
// //             <div className="admin-layout vp-full-screen">
// //                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// //                 <main className="main-wrapper" style={{ padding: '2rem' }}>
// //                     <PageHeader
// //                         theme={(user?.role as any) || 'default'}
// //                         variant="compact"
// //                         title="Record Not Found"
// //                         onBack={() => navigate(-1)}
// //                         backLabel="Back to Safety"
// //                     />
// //                     <div className="vp-empty-state vp-empty-state--error">
// //                         <AlertCircle size={40} className="vp-empty-state__icon" />
// //                         <p className="vp-empty-state__text">
// //                             This portfolio could not be located. It may belong to a different
// //                             course or have been archived.
// //                         </p>
// //                     </div>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     const filteredSubmissions = submissions.filter(sub => {
// //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// //         if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
// //         return subType === activeTab;
// //     });

// //     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';
// //     const learnerDocs = (enrollment as any).documents || {};

// //     return (
// //         <div className="admin-layout vp-full-screen">
// //             <Sidebar
// //                 role={user?.role}
// //                 currentNav="learners"
// //                 onLogout={() => signOut(auth).then(() => navigate('/login'))}
// //             />

// //             <main className="main-wrapper vp-scroll-area">

// //                 <PageHeader
// //                     theme={headerTheme}
// //                     variant="hero"
// //                     eyebrow="Portfolio of Evidence"
// //                     title={enrollment.fullName}
// //                     description={headerCourseName}
// //                     onBack={() => navigate(-1)}
// //                     status={{
// //                         label: enrollment.status?.toUpperCase(),
// //                         variant: enrollment.status === 'active' ? 'active' : 'warning',
// //                     }}
// //                 />

// //                 <div className="admin-content vp-content">

// //                     <div className="vp-profile-card">
// //                         <div className="vp-profile-card__avatar">
// //                             {(enrollment as any).profilePhotoUrl
// //                                 ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" />
// //                                 : <User size={34} className="vp-profile-card__avatar-icon" />
// //                             }
// //                         </div>
// //                         <div className="vp-profile-card__info">
// //                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
// //                             <div className="vp-profile-card__meta">
// //                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
// //                                 <span><Calendar size={12} /> Enrolled: {enrollment.trainingStartDate}</span>
// //                                 <span className="vp-ref-tag">
// //                                     <History size={11} />
// //                                     Ref: {enrollment.enrollmentId?.slice(-6) || 'Legacy'}
// //                                 </span>
// //                             </div>
// //                         </div>
// //                         <div className="vp-profile-card__status">
// //                             <span className="vp-profile-card__status-label">Course Status</span>
// //                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>
// //                                 {enrollment.status?.toUpperCase()}
// //                             </span>
// //                         </div>
// //                     </div>

// //                     <div className="vp-tab-bar">
// //                         {TABS.map(tab => (
// //                             <button
// //                                 key={tab.id}
// //                                 className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`}
// //                                 onClick={() => setActiveTab(tab.id)}
// //                             >
// //                                 {tab.icon}
// //                                 <span>{tab.label}</span>
// //                             </button>
// //                         ))}
// //                     </div>

// //                     {activeTab === 'overview' && (
// //                         <div className="vp-panel vp-panel--padded">
// //                             <div className="vp-overview-grid">
// //                                 <div className="vp-overview-card">
// //                                     <h3 className="vp-overview-card__title">
// //                                         <BarChart2 size={14} /> Assessment Pipeline
// //                                     </h3>
// //                                     {pipelineStats.total === 0 ? (
// //                                         <div className="vp-empty-state">
// //                                             <BarChart2 size={32} className="vp-empty-state__icon" />
// //                                             <p className="vp-empty-state__title">No Assessments Assigned</p>
// //                                             <p className="vp-empty-state__text">No assessments have been published for this enrollment yet.</p>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="vp-pipeline">
// //                                             {renderPipelineBar('1. Learner Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
// //                                             {renderPipelineBar('2. Facilitator Pre-Marking', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
// //                                             {renderPipelineBar('3. Assessor Grading', pipelineStats.graded, pipelineStats.total, 'amber')}
// //                                             {renderPipelineBar('4. Moderator Verification', pipelineStats.moderated, pipelineStats.total, 'green')}
// //                                         </div>
// //                                     )}
// //                                 </div>

// //                                 <div className="vp-overview-card">
// //                                     <h3 className="vp-overview-card__title">
// //                                         <BookOpen size={14} /> Curriculum Coverage Map
// //                                     </h3>
// //                                     {!matchingProgramme ? (
// //                                         <div className="vp-empty-state">
// //                                             <AlertCircle size={32} className="vp-empty-state__icon" />
// //                                             <p className="vp-empty-state__title">No Blueprint Linked</p>
// //                                             <p className="vp-empty-state__text">No curriculum blueprint is linked to this specific class instance.</p>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="vp-curr-sections">
// //                                             <div className="vp-curr-group">
// //                                                 <span className="vp-curr-group__label">Knowledge Modules</span>
// //                                                 {renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}
// //                                             </div>
// //                                             <div className="vp-curr-group">
// //                                                 <span className="vp-curr-group__label">Practical Modules</span>
// //                                                 {renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}
// //                                             </div>
// //                                             <div className="vp-curr-group">
// //                                                 <span className="vp-curr-group__label">Workplace Modules</span>
// //                                                 {renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}
// //                                             </div>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {activeTab !== 'overview' && activeTab !== 'compliance' && (
// //                         <div className="vp-panel">
// //                             {loadingSubmissions ? (
// //                                 <div className="vp-empty-state">
// //                                     <Loader2 size={28} className="vp-spin" />
// //                                     <span className="vp-empty-state__text">Filtering Course Assignments…</span>
// //                                 </div>
// //                             ) : filteredSubmissions.length === 0 ? (
// //                                 <div className="vp-empty-state">
// //                                     <FileText size={40} className="vp-empty-state__icon" />
// //                                     <p className="vp-empty-state__title">No Assessments Found</p>
// //                                     <p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
// //                                 </div>
// //                             ) : (
// //                                 <div className="vp-table-scroll">
// //                                     <table className="vp-table">
// //                                         <thead>
// //                                             <tr>
// //                                                 <th className="vp-th">Assessment Title</th>
// //                                                 <th className="vp-th vp-th--narrow">Type</th>
// //                                                 <th className="vp-th vp-th--narrow">Time</th>
// //                                                 <th className="vp-th vp-th--narrow">Status</th>
// //                                                 <th className="vp-th vp-th--action" />
// //                                             </tr>
// //                                         </thead>
// //                                         <tbody>
// //                                             {filteredSubmissions.map(sub => (
// //                                                 <tr key={sub.id} className={`vp-tr ${isActionRequired(sub) ? 'vp-tr--action' : ''}`}>
// //                                                     <td className="vp-td">
// //                                                         <span className="vp-cell-title">{sub.title}</span>
// //                                                         <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
// //                                                     </td>
// //                                                     <td className="vp-td">
// //                                                         <span className="vp-cell-type">{sub.type}</span>
// //                                                     </td>
// //                                                     <td className="vp-td">{renderTimeRemaining(sub)}</td>
// //                                                     <td className="vp-td">{getStatusBadge(sub)}</td>
// //                                                     <td className="vp-td vp-td--action">
// //                                                         <button
// //                                                             className={`vp-action-btn ${isActionRequired(sub) ? 'vp-action-btn--primary' : 'vp-action-btn--outline'}`}
// //                                                             onClick={() => handleActionClick(sub)}
// //                                                         >
// //                                                             {getActionContent(sub)}
// //                                                         </button>
// //                                                     </td>
// //                                                 </tr>
// //                                             ))}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}

// //                     {activeTab === 'compliance' && (
// //                         <div className="vp-panel vp-panel--padded animate-fade-in">
// //                             <div className="vp-compliance-header">
// //                                 <div className="vp-compliance-title">
// //                                     <FileBadge size={28} className="vp-compliance-icon" />
// //                                     <div>
// //                                         <h3>Compliance Vault</h3>
// //                                         <p>Mandatory KYC & QCTO documentation for <strong>{enrollment.fullName}</strong>.</p>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="vp-doc-grid">
// //                                 {renderDocRow('National ID / Passport', 'idUrl', learnerDocs.idUrl)}
// //                                 {renderDocRow('Highest Qualification', 'qualUrl', learnerDocs.qualUrl)}
// //                                 {renderDocRow('Comprehensive CV', 'cvUrl', learnerDocs.cvUrl)}
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };





// // // import React, { useEffect, useState, useMemo } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import {
// // //     User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
// // //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
// // //     ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2
// // // } from 'lucide-react';
// // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // import { signOut } from 'firebase/auth';
// // // import { auth, db } from '../../lib/firebase';
// // // import { useStore } from '../../store/useStore';
// // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// // // import './ViewPortfolio.css';

// // // interface LearnerSubmission {
// // //     id: string;
// // //     assessmentId: string;
// // //     learnerId: string;
// // //     enrollmentId: string;
// // //     cohortId?: string;
// // //     title: string;
// // //     type: string;
// // //     status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
// // //     assignedAt: string;
// // //     startedAt?: string;
// // //     marks: number;
// // //     totalMarks: number;
// // //     competency?: 'C' | 'NYC';
// // //     moduleNumber?: string;
// // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// // //     timeLimit?: number;
// // //     moderation?: { outcome?: 'Endorsed' | 'Returned' };
// // //     qualificationName?: string;
// // // }

// // // const TABS = [
// // //     { id: 'overview', label: 'Progress Overview', icon: <BarChart2 size={13} /> },
// // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={13} /> },
// // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={13} /> },
// // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={13} /> },
// // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={13} /> },
// // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={13} /> },
// // // ] as const;

// // // type TabId = typeof TABS[number]['id'];

// // // // Pipeline stage definitions — order matters for rendering
// // // const PIPELINE_STAGES = [
// // //     { key: 'submitted', label: '1. Learner Submissions', color: 'blue' },
// // //     { key: 'facReviewed', label: '2. Facilitator Pre-Marking', color: 'purple' },
// // //     { key: 'graded', label: '3. Assessor Grading', color: 'amber' },
// // //     { key: 'moderated', label: '4. Moderator Verification', color: 'green' },
// // // ] as const;

// // // export const ViewPortfolio: React.FC = () => {
// // //     const { id: routeId } = useParams();
// // //     const navigate = useNavigate();

// // //     const { user, learners, fetchLearners, learnersLoading, programmes, fetchProgrammes } = useStore();
// // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // //     const [activeTab, setActiveTab] = useState<TabId>('overview');
// // //     const [timeOffset, setTimeOffset] = useState(0);
// // //     const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());

// // //     // ── Secure enrollment record ──
// // //     const enrollment = useMemo(() => {
// // //         if (!routeId) return undefined;
// // //         const specific = learners.find(l => l.enrollmentId === routeId);
// // //         if (specific) return specific;
// // //         const all = learners.filter(l => l.learnerId === routeId || l.id === routeId);
// // //         return all.find(e => e.status !== 'dropped') || all[0];
// // //     }, [learners, routeId]);

// // //     // ── Match programme template ──
// // //     const matchingProgramme = useMemo(() => {
// // //         if (!enrollment) return null;
// // //         return programmes.find(p =>
// // //             p.saqaId === enrollment.qualification?.saqaId ||
// // //             p.name === enrollment.qualification?.name
// // //         ) || null;
// // //     }, [programmes, enrollment]);

// // //     // ── Secure time offset ──
// // //     useEffect(() => {
// // //         const fetchOffset = async () => {
// // //             try {
// // //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// // //                 const data = await res.json();
// // //                 setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
// // //             } catch { setTimeOffset(0); }
// // //         };
// // //         fetchOffset();
// // //         const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
// // //         return () => clearInterval(tick);
// // //     }, []);

// // //     const getSecureNow = () => currentTimeTick + timeOffset;

// // //     useEffect(() => {
// // //         if (learners.length === 0) fetchLearners();
// // //         if (programmes.length === 0) fetchProgrammes();
// // //     }, [learners.length, programmes.length, fetchLearners, fetchProgrammes]);

// // //     // ── Fetch submissions ──
// // //     useEffect(() => {
// // //         const load = async () => {
// // //             if (!enrollment) return;
// // //             setLoadingSubmissions(true);
// // //             try {
// // //                 const subRef = collection(db, 'learner_submissions');
// // //                 let q = query(subRef, where('enrollmentId', '==', enrollment.enrollmentId));
// // //                 let snap = await getDocs(q);
// // //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// // //                 if (subs.length === 0 && enrollment.learnerId) {
// // //                     const legacyQ = query(subRef, where('learnerId', '==', enrollment.learnerId));
// // //                     const legacySnap = await getDocs(legacyQ);
// // //                     const all = legacySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
// // //                     subs = all.filter(s => s.cohortId === enrollment.cohortId ||
// // //                         s.qualificationName === enrollment.qualification?.name);
// // //                 }

// // //                 // Append time limits from templates
// // //                 const cache = new Map<string, number | undefined>();
// // //                 for (let i = 0; i < subs.length; i++) {
// // //                     const sub = subs[i];
// // //                     if (!cache.has(sub.assessmentId)) {
// // //                         const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// // //                         cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
// // //                     }
// // //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// // //                 }

// // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // //                 setSubmissions(subs);
// // //             } catch (err) {
// // //                 console.error('Error fetching submissions:', err);
// // //             } finally {
// // //                 setLoadingSubmissions(false);
// // //             }
// // //         };
// // //         load();
// // //     }, [enrollment]);

// // //     // ── Pipeline stats ──
// // //     const pipelineStats = useMemo(() => {
// // //         const total = submissions.length;
// // //         if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
// // //         return {
// // //             total,
// // //             submitted: submissions.filter(s => !['not_started', 'in_progress'].includes(s.status)).length,
// // //             facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(s.status)).length,
// // //             graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
// // //             moderated: submissions.filter(s => s.status === 'moderated').length,
// // //         };
// // //     }, [submissions]);

// // //     const handleActionClick = (sub: LearnerSubmission) => {
// // //         if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
// // //         else navigate(`/portfolio/submission/${sub.id}`);
// // //     };

// // //     const isActionRequired = (sub: LearnerSubmission) => {
// // //         const role = user?.role;
// // //         return (role === 'facilitator' && sub.status === 'submitted') ||
// // //             (role === 'assessor' && sub.status === 'facilitator_reviewed');
// // //     };

// // //     const getStatusBadge = (sub: LearnerSubmission) => {
// // //         const role = user?.role || 'learner';
// // //         switch (sub.status) {
// // //             case 'moderated':
// // //                 return sub.competency === 'C'
// // //                     ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span>
// // //                     : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
// // //             case 'appealed':
// // //                 return <span className="vp-badge vp-badge--appeal"><Scale size={11} /> Appealed</span>;
// // //             case 'graded':
// // //                 return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
// // //             case 'facilitator_reviewed':
// // //                 return <span className="vp-badge vp-badge--progress"><PenTool size={11} /> Grading Pending</span>;
// // //             case 'submitted':
// // //                 return role === 'facilitator'
// // //                     ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
// // //                     : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
// // //             case 'in_progress':
// // //                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress</span>;
// // //             default:
// // //                 return <span className="vp-badge vp-badge--none">Not Started</span>;
// // //         }
// // //     };

// // //     const getActionContent = (sub: LearnerSubmission) => {
// // //         const role = user?.role || 'learner';
// // //         if (role === 'learner') {
// // //             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
// // //             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
// // //             return <><Eye size={12} /> View Results</>;
// // //         }
// // //         return <><PenTool size={12} /> Review Record</>;
// // //     };

// // //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// // //         if (!sub.timeLimit) return <span className="vp-time vp-time--none">No Limit</span>;
// // //         if (sub.status === 'not_started') return <span className="vp-time vp-time--neutral">{sub.timeLimit}m Total</span>;
// // //         if (sub.status === 'in_progress' && sub.startedAt) {
// // //             const endTime = new Date(sub.startedAt).getTime() + sub.timeLimit * 60 * 1000;
// // //             const remainingSecs = Math.max(0, Math.floor((endTime - getSecureNow()) / 1000));
// // //             if (remainingSecs === 0) return <span className="vp-time vp-time--expired"><AlertCircle size={13} /> Time Expired</span>;
// // //             const m = Math.floor(remainingSecs / 60);
// // //             const s = remainingSecs % 60;
// // //             return (
// // //                 <span className={`vp-time ${remainingSecs < 300 ? 'vp-time--low' : 'vp-time--ok'}`}>
// // //                     <Timer size={13} />{m}m {s.toString().padStart(2, '0')}s
// // //                 </span>
// // //             );
// // //         }
// // //         return <span className="vp-time vp-time--none">—</span>;
// // //     };

// // //     // ── Pipeline progress bar (pure CSS driven) ──
// // //     const renderPipelineBar = (label: string, value: number, total: number, colorKey: string) => {
// // //         const pct = total > 0 ? Math.round((value / total) * 100) : 0;
// // //         return (
// // //             <div className="vp-pipeline-item" key={label}>
// // //                 <div className="vp-pipeline-item__header">
// // //                     <span className="vp-pipeline-item__label">{label}</span>
// // //                     <span className="vp-pipeline-item__stat">{value} / {total} — {pct}%</span>
// // //                 </div>
// // //                 <div className="vp-pipeline-track">
// // //                     <div
// // //                         className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`}
// // //                         style={{ width: `${pct}%` } as React.CSSProperties}
// // //                     />
// // //                 </div>
// // //             </div>
// // //         );
// // //     };

// // //     // ── Curriculum checklist ──
// // //     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
// // //         if (!modules || modules.length === 0) {
// // //             return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
// // //         }
// // //         return (
// // //             <ul className="vp-curr-list">
// // //                 {modules.map((mod, idx) => {
// // //                     const sub = submissions.find(s => s.moduleNumber === mod.code);
// // //                     const isDone = sub && ['graded', 'moderated'].includes(sub.status);
// // //                     const isActive = sub && !isDone;
// // //                     const stateKey = isDone ? 'done' : isActive ? 'active' : 'pending';
// // //                     return (
// // //                         <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`}>
// // //                             <div className="vp-curr-item__icon">
// // //                                 {isDone && <CheckCircle size={15} />}
// // //                                 {isActive && <Clock size={15} />}
// // //                                 {!sub && <AlertCircle size={15} />}
// // //                             </div>
// // //                             <div className="vp-curr-item__info">
// // //                                 <span className="vp-curr-item__code">{mod.code || `M${idx + 1}`}</span>
// // //                                 <span className="vp-curr-item__name">{mod.name}</span>
// // //                             </div>
// // //                             <div className="vp-curr-item__badge">
// // //                                 {sub ? getStatusBadge(sub) : <span className="vp-badge vp-badge--none">Not Assigned</span>}
// // //                             </div>
// // //                         </li>
// // //                     );
// // //                 })}
// // //             </ul>
// // //         );
// // //     };

// // //     // ── Loading / 404 ──
// // //     if (learnersLoading && !enrollment) {
// // //         return (
// // //             <div className="admin-layout vp-full-screen">
// // //                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// // //                 <main className="main-wrapper vp-centered">
// // //                     <Loader2 size={40} className="vp-spin" />
// // //                     <span className="vp-loading-label">Initializing Secure Portfolio…</span>
// // //                 </main>
// // //             </div>
// // //         );
// // //     }

// // //     if (!enrollment) {
// // //         return (
// // //             <div className="admin-layout vp-full-screen">
// // //                 <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// // //                 <main className="main-wrapper" style={{ padding: '2rem' }}>
// // //                     <PageHeader
// // //                         theme={(user?.role as any) || 'default'}
// // //                         variant="compact"
// // //                         title="Record Not Found"
// // //                         onBack={() => navigate(-1)}
// // //                         backLabel="Back to Safety"
// // //                     />
// // //                     <div className="vp-empty-state vp-empty-state--error">
// // //                         <AlertCircle size={40} className="vp-empty-state__icon" />
// // //                         <p className="vp-empty-state__text">
// // //                             This portfolio could not be located. It may belong to a different
// // //                             course or have been archived.
// // //                         </p>
// // //                     </div>
// // //                 </main>
// // //             </div>
// // //         );
// // //     }

// // //     const filteredSubmissions = submissions.filter(sub => {
// // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// // //         if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // //         return subType === activeTab;
// // //     });

// // //     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';

// // //     return (
// // //         <div className="admin-layout vp-full-screen">
// // //             <Sidebar
// // //                 role={user?.role}
// // //                 currentNav="learners"
// // //                 onLogout={() => signOut(auth).then(() => navigate('/login'))}
// // //             />

// // //             <main className="main-wrapper vp-scroll-area">

// // //                 <PageHeader
// // //                     theme={headerTheme}
// // //                     variant="hero"
// // //                     eyebrow="Portfolio of Evidence"
// // //                     title={enrollment.fullName}
// // //                     description={enrollment.qualification?.name || 'Unassigned Qualification'}
// // //                     onBack={() => navigate(-1)}
// // //                     status={{
// // //                         label: enrollment.status?.toUpperCase(),
// // //                         variant: enrollment.status === 'active' ? 'active' : 'warning',
// // //                     }}
// // //                 />

// // //                 <div className="admin-content vp-content">

// // //                     {/* ── Profile card ── */}
// // //                     <div className="vp-profile-card">
// // //                         <div className="vp-profile-card__avatar">
// // //                             {(enrollment as any).profilePhotoUrl
// // //                                 ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" />
// // //                                 : <User size={34} className="vp-profile-card__avatar-icon" />
// // //                             }
// // //                         </div>
// // //                         <div className="vp-profile-card__info">
// // //                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
// // //                             <div className="vp-profile-card__meta">
// // //                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
// // //                                 <span><Calendar size={12} /> Enrolled: {enrollment.trainingStartDate}</span>
// // //                                 <span className="vp-ref-tag">
// // //                                     <History size={11} />
// // //                                     Ref: {enrollment.enrollmentId?.slice(-6) || 'Legacy'}
// // //                                 </span>
// // //                             </div>
// // //                         </div>
// // //                         <div className="vp-profile-card__status">
// // //                             <span className="vp-profile-card__status-label">Course Status</span>
// // //                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>
// // //                                 {enrollment.status?.toUpperCase()}
// // //                             </span>
// // //                         </div>
// // //                     </div>

// // //                     {/* ── Tab bar ── */}
// // //                     <div className="vp-tab-bar">
// // //                         {TABS.map(tab => (
// // //                             <button
// // //                                 key={tab.id}
// // //                                 className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`}
// // //                                 onClick={() => setActiveTab(tab.id)}
// // //                             >
// // //                                 {tab.icon}
// // //                                 <span>{tab.label}</span>
// // //                             </button>
// // //                         ))}
// // //                     </div>

// // //                     {/* ══ OVERVIEW TAB ══ */}
// // //                     {activeTab === 'overview' && (
// // //                         <div className="vp-panel vp-panel--padded">
// // //                             <div className="vp-overview-grid">

// // //                                 {/* Pipeline tracking */}
// // //                                 <div className="vp-overview-card">
// // //                                     <h3 className="vp-overview-card__title">
// // //                                         <BarChart2 size={14} /> Assessment Pipeline
// // //                                     </h3>
// // //                                     {pipelineStats.total === 0 ? (
// // //                                         <div className="vp-empty-state">
// // //                                             <BarChart2 size={32} className="vp-empty-state__icon" />
// // //                                             <p className="vp-empty-state__title">No Assessments Assigned</p>
// // //                                             <p className="vp-empty-state__text">No assessments have been published for this enrollment yet.</p>
// // //                                         </div>
// // //                                     ) : (
// // //                                         <div className="vp-pipeline">
// // //                                             {renderPipelineBar('1. Learner Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
// // //                                             {renderPipelineBar('2. Facilitator Pre-Marking', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
// // //                                             {renderPipelineBar('3. Assessor Grading', pipelineStats.graded, pipelineStats.total, 'amber')}
// // //                                             {renderPipelineBar('4. Moderator Verification', pipelineStats.moderated, pipelineStats.total, 'green')}
// // //                                         </div>
// // //                                     )}
// // //                                 </div>

// // //                                 {/* Curriculum coverage map */}
// // //                                 <div className="vp-overview-card">
// // //                                     <h3 className="vp-overview-card__title">
// // //                                         <BookOpen size={14} /> Curriculum Coverage Map
// // //                                     </h3>
// // //                                     {!matchingProgramme ? (
// // //                                         <div className="vp-empty-state">
// // //                                             <AlertCircle size={32} className="vp-empty-state__icon" />
// // //                                             <p className="vp-empty-state__title">No Blueprint Linked</p>
// // //                                             <p className="vp-empty-state__text">No curriculum blueprint is linked to this enrollment.</p>
// // //                                         </div>
// // //                                     ) : (
// // //                                         <div className="vp-curr-sections">
// // //                                             <div className="vp-curr-group">
// // //                                                 <span className="vp-curr-group__label">Knowledge Modules</span>
// // //                                                 {renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}
// // //                                             </div>
// // //                                             <div className="vp-curr-group">
// // //                                                 <span className="vp-curr-group__label">Practical Modules</span>
// // //                                                 {renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}
// // //                                             </div>
// // //                                             <div className="vp-curr-group">
// // //                                                 <span className="vp-curr-group__label">Workplace Modules</span>
// // //                                                 {renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}
// // //                                             </div>
// // //                                         </div>
// // //                                     )}
// // //                                 </div>

// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ══ SUBMISSION TABS ══ */}
// // //                     {activeTab !== 'overview' && activeTab !== 'compliance' && (
// // //                         <div className="vp-panel">
// // //                             {loadingSubmissions ? (
// // //                                 <div className="vp-empty-state">
// // //                                     <Loader2 size={28} className="vp-spin" />
// // //                                     <span className="vp-empty-state__text">Filtering Course Assignments…</span>
// // //                                 </div>
// // //                             ) : filteredSubmissions.length === 0 ? (
// // //                                 <div className="vp-empty-state">
// // //                                     <FileText size={40} className="vp-empty-state__icon" />
// // //                                     <p className="vp-empty-state__title">No Assessments Found</p>
// // //                                     <p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
// // //                                 </div>
// // //                             ) : (
// // //                                 <div className="vp-table-scroll">
// // //                                     <table className="vp-table">
// // //                                         <thead>
// // //                                             <tr>
// // //                                                 <th className="vp-th">Assessment Title</th>
// // //                                                 <th className="vp-th vp-th--narrow">Type</th>
// // //                                                 <th className="vp-th vp-th--narrow">Time</th>
// // //                                                 <th className="vp-th vp-th--narrow">Status</th>
// // //                                                 <th className="vp-th vp-th--action" />
// // //                                             </tr>
// // //                                         </thead>
// // //                                         <tbody>
// // //                                             {filteredSubmissions.map(sub => (
// // //                                                 <tr key={sub.id} className={`vp-tr ${isActionRequired(sub) ? 'vp-tr--action' : ''}`}>
// // //                                                     <td className="vp-td">
// // //                                                         <span className="vp-cell-title">{sub.title}</span>
// // //                                                         <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
// // //                                                     </td>
// // //                                                     <td className="vp-td">
// // //                                                         <span className="vp-cell-type">{sub.type}</span>
// // //                                                     </td>
// // //                                                     <td className="vp-td">{renderTimeRemaining(sub)}</td>
// // //                                                     <td className="vp-td">{getStatusBadge(sub)}</td>
// // //                                                     <td className="vp-td vp-td--action">
// // //                                                         <button
// // //                                                             className={`vp-action-btn ${isActionRequired(sub) ? 'vp-action-btn--primary' : 'vp-action-btn--outline'}`}
// // //                                                             onClick={() => handleActionClick(sub)}
// // //                                                         >
// // //                                                             {getActionContent(sub)}
// // //                                                         </button>
// // //                                                     </td>
// // //                                                 </tr>
// // //                                             ))}
// // //                                         </tbody>
// // //                                     </table>
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}

// // //                     {/* ══ COMPLIANCE TAB ══ */}
// // //                     {activeTab === 'compliance' && (
// // //                         <div className="vp-compliance-panel">
// // //                             <FileBadge size={40} className="vp-compliance-panel__icon" />
// // //                             <h3 className="vp-compliance-panel__title">Compliance Documents</h3>
// // //                             <p className="vp-compliance-panel__desc">
// // //                                 Stored specifically for the{' '}
// // //                                 <strong>{enrollment.qualification?.name || 'Current'}</strong> course.
// // //                             </p>
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };


// // // // import React, { useEffect, useState, useMemo } from 'react';
// // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // import {
// // // //     User, GraduationCap, Calendar, FileText, CheckCircle,
// // // //     AlertCircle, BookOpen, Briefcase, FileBadge, Eye, Play,
// // // //     Edit3, Timer, Award, Scale, PenTool, History, Loader2
// // // // } from 'lucide-react';
// // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // import { signOut } from 'firebase/auth';
// // // // import { auth, db } from '../../lib/firebase';
// // // // import { useStore } from '../../store/useStore';
// // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// // // // import './ViewPortfolio.css';

// // // // interface LearnerSubmission {
// // // //     id: string;
// // // //     assessmentId: string;
// // // //     learnerId: string;
// // // //     enrollmentId: string;
// // // //     cohortId?: string;
// // // //     title: string;
// // // //     type: string;
// // // //     status: 'not_started' | 'in_progress' | 'submitted' | 'facilitator_reviewed' | 'graded' | 'moderated' | 'appealed' | 'returned';
// // // //     assignedAt: string;
// // // //     startedAt?: string;
// // // //     marks: number;
// // // //     totalMarks: number;
// // // //     competency?: 'C' | 'NYC';
// // // //     moduleNumber?: string;
// // // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// // // //     timeLimit?: number;
// // // //     moderation?: { outcome?: 'Endorsed' | 'Returned' };
// // // // }

// // // // const TABS = [
// // // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={13} /> },
// // // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={13} /> },
// // // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={13} /> },
// // // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={13} /> },
// // // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={13} /> },
// // // // ] as const;

// // // // type TabId = typeof TABS[number]['id'];

// // // // export const ViewPortfolio: React.FC = () => {
// // // //     const { id: routeId } = useParams();
// // // //     const navigate = useNavigate();

// // // //     const { user, learners, fetchLearners, learnersLoading } = useStore();
// // // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // // //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');
// // // //     const [timeOffset, setTimeOffset] = useState(0);
// // // //     const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());

// // // //     // ── Secure the enrollment record ──
// // // //     const enrollment = useMemo(() => {
// // // //         if (!routeId) return undefined;
// // // //         const specific = learners.find(l => l.enrollmentId === routeId);
// // // //         if (specific) return specific;
// // // //         const all = learners.filter(l => l.learnerId === routeId || l.id === routeId);
// // // //         return all.find(e => e.status !== 'dropped') || all[0];
// // // //     }, [learners, routeId]);

// // // //     // ── Secure time offset ──
// // // //     useEffect(() => {
// // // //         const fetchOffset = async () => {
// // // //             try {
// // // //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// // // //                 const data = await res.json();
// // // //                 setTimeOffset(new Date(data.utc_datetime).getTime() - Date.now());
// // // //             } catch { setTimeOffset(0); }
// // // //         };
// // // //         fetchOffset();
// // // //         const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000);
// // // //         return () => clearInterval(tick);
// // // //     }, []);

// // // //     const getSecureNow = () => currentTimeTick + timeOffset;

// // // //     useEffect(() => {
// // // //         if (learners.length === 0) fetchLearners();
// // // //     }, [learners.length, fetchLearners]);

// // // //     // ── Fetch submissions ──
// // // //     useEffect(() => {
// // // //         const load = async () => {
// // // //             if (!enrollment) return;
// // // //             setLoadingSubmissions(true);
// // // //             try {
// // // //                 const subRef = collection(db, 'learner_submissions');
// // // //                 let q = query(subRef, where('enrollmentId', '==', enrollment.enrollmentId));
// // // //                 let snap = await getDocs(q);
// // // //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// // // //                 if (subs.length === 0 && enrollment.learnerId) {
// // // //                     const legacyQ = query(subRef, where('learnerId', '==', enrollment.learnerId));
// // // //                     const legacySnap = await getDocs(legacyQ);
// // // //                     const all = legacySnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
// // // //                     subs = all.filter(sub => sub.cohortId === enrollment.cohortId);
// // // //                 }

// // // //                 const cache = new Map<string, number | undefined>();
// // // //                 for (let i = 0; i < subs.length; i++) {
// // // //                     const sub = subs[i];
// // // //                     if (!cache.has(sub.assessmentId)) {
// // // //                         const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// // // //                         cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
// // // //                     }
// // // //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// // // //                 }

// // // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // // //                 setSubmissions(subs);
// // // //             } catch (err) {
// // // //                 console.error('Error fetching submissions:', err);
// // // //             } finally {
// // // //                 setLoadingSubmissions(false);
// // // //             }
// // // //         };
// // // //         load();
// // // //     }, [enrollment]);

// // // //     const handleLogout = async () => { await signOut(auth); navigate('/login'); };

// // // //     const handleNavChange = (nav: string) => {
// // // //         if (user?.role === 'learner') {
// // // //             if (nav === 'dashboard') navigate('/portal');
// // // //             if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
// // // //         } else {
// // // //             navigate('/admin', { state: { activeTab: nav } });
// // // //         }
// // // //     };

// // // //     const handleActionClick = (sub: LearnerSubmission) => {
// // // //         if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
// // // //         else navigate(`/portfolio/submission/${sub.id}`);
// // // //     };

// // // //     const getStatusBadge = (sub: LearnerSubmission) => {
// // // //         const role = user?.role || 'learner';
// // // //         switch (sub.status) {
// // // //             case 'moderated':
// // // //                 return sub.competency === 'C'
// // // //                     ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Final: Competent</span>
// // // //                     : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> Final: NYC</span>;
// // // //             case 'appealed':
// // // //                 return <span className="vp-badge vp-badge--appeal"><Scale size={11} /> Appeal Under Review</span>;
// // // //             case 'submitted':
// // // //                 return role === 'facilitator'
// // // //                     ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
// // // //                     : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
// // // //             case 'in_progress':
// // // //                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress</span>;
// // // //             default:
// // // //                 return <span className="vp-badge vp-badge--none">Not Started</span>;
// // // //         }
// // // //     };

// // // //     const getActionContent = (sub: LearnerSubmission) => {
// // // //         const role = user?.role || 'learner';
// // // //         if (role === 'learner') {
// // // //             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
// // // //             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
// // // //             return <><Eye size={12} /> View Results</>;
// // // //         }
// // // //         return <><PenTool size={12} /> Review Record</>;
// // // //     };

// // // //     const isActionRequired = (sub: LearnerSubmission) => {
// // // //         const role = user?.role;
// // // //         return (role === 'facilitator' && sub.status === 'submitted') ||
// // // //             (role === 'assessor' && sub.status === 'facilitator_reviewed');
// // // //     };

// // // //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// // // //         if (!sub.timeLimit) return <span className="vp-time vp-time--none">No Limit</span>;

// // // //         if (sub.status === 'not_started') {
// // // //             return <span className="vp-time vp-time--neutral">{sub.timeLimit}m Total</span>;
// // // //         }

// // // //         if (sub.status === 'in_progress' && sub.startedAt) {
// // // //             const endTime = new Date(sub.startedAt).getTime() + sub.timeLimit * 60 * 1000;
// // // //             const remainingMs = Math.max(0, endTime - getSecureNow());
// // // //             const remainingSecs = Math.floor(remainingMs / 1000);

// // // //             if (remainingSecs === 0) {
// // // //                 return (
// // // //                     <span className="vp-time vp-time--expired">
// // // //                         <AlertCircle size={13} /> Time Expired
// // // //                     </span>
// // // //                 );
// // // //             }

// // // //             const m = Math.floor(remainingSecs / 60);
// // // //             const s = remainingSecs % 60;
// // // //             const isLow = remainingSecs < 300;

// // // //             return (
// // // //                 <span className={`vp-time ${isLow ? 'vp-time--low' : 'vp-time--ok'}`}>
// // // //                     <Timer size={13} />
// // // //                     {m}m {s.toString().padStart(2, '0')}s
// // // //                 </span>
// // // //             );
// // // //         }

// // // //         return <span className="vp-time vp-time--none">—</span>;
// // // //     };

// // // //     // ── Loading state ──
// // // //     if (learnersLoading && !enrollment) {
// // // //         return (
// // // //             <div className="admin-layout vp-full-screen">
// // // //                 <Sidebar role={user?.role} currentNav="learners" onLogout={handleLogout} />
// // // //                 <main className="main-wrapper vp-centered">
// // // //                     <Loader2 size={40} className="vp-spin" />
// // // //                     <span className="vp-loading-label">Initializing Secure Portfolio…</span>
// // // //                 </main>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     // ── 404 state ──
// // // //     if (!enrollment) {
// // // //         return (
// // // //             <div className="admin-layout vp-full-screen">
// // // //                 <Sidebar role={user?.role} currentNav="learners" onLogout={handleLogout} />
// // // //                 <main className="main-wrapper" style={{ padding: '2rem' }}>
// // // //                     <PageHeader
// // // //                         theme={(user?.role as any) || 'default'}
// // // //                         variant="compact"
// // // //                         title="Record Not Found"
// // // //                         onBack={() => navigate(-1)}
// // // //                         backLabel="Back to Safety"
// // // //                     />
// // // //                     <div className="vp-empty-state vp-empty-state--error">
// // // //                         <AlertCircle size={40} className="vp-empty-state__icon" />
// // // //                         <p className="vp-empty-state__text">
// // // //                             This portfolio could not be located. It may belong to a different
// // // //                             course or have been archived.
// // // //                         </p>
// // // //                     </div>
// // // //                 </main>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     const filteredSubmissions = submissions.filter(sub => {
// // // //         const tabId = activeTab.toLowerCase();
// // // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// // // //         if (tabId === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // // //         return subType === tabId;
// // // //     });

// // // //     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';

// // // //     return (
// // // //         <div className="admin-layout vp-full-screen">
// // // //             <Sidebar
// // // //                 role={user?.role}
// // // //                 currentNav="learners"
// // // //                 setCurrentNav={handleNavChange}
// // // //                 onLogout={handleLogout}
// // // //             />

// // // //             <main className="main-wrapper vp-scroll-area">

// // // //                 <PageHeader
// // // //                     theme={headerTheme}
// // // //                     variant="hero"
// // // //                     eyebrow="Academic Statement"
// // // //                     title={enrollment.fullName}
// // // //                     description={`Course: ${enrollment.qualification?.name || 'Unassigned Qualification'}`}
// // // //                     onBack={() => navigate(-1)}
// // // //                 />

// // // //                 <div className="admin-content vp-content">

// // // //                     {/* ── Profile card ── */}
// // // //                     <div className="vp-profile-card">
// // // //                         <div className="vp-profile-card__avatar">
// // // //                             {(enrollment as any).profilePhotoUrl
// // // //                                 ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" />
// // // //                                 : <User size={34} className="vp-profile-card__avatar-icon" />
// // // //                             }
// // // //                         </div>
// // // //                         <div className="vp-profile-card__info">
// // // //                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
// // // //                             <div className="vp-profile-card__meta">
// // // //                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
// // // //                                 <span><Calendar size={12} /> Enrolled: {enrollment.trainingStartDate}</span>
// // // //                                 <span className="vp-ref-tag">
// // // //                                     <History size={11} />
// // // //                                     Ref: {enrollment.enrollmentId?.slice(-6) || 'Legacy'}
// // // //                                 </span>
// // // //                             </div>
// // // //                         </div>
// // // //                         <div className="vp-profile-card__status">
// // // //                             <span className="vp-profile-card__status-label">Course Status</span>
// // // //                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>
// // // //                                 {enrollment.status?.toUpperCase()}
// // // //                             </span>
// // // //                         </div>
// // // //                     </div>

// // // //                     {/* ── Tab bar ── */}
// // // //                     <div className="vp-tab-bar">
// // // //                         {TABS.map(tab => (
// // // //                             <button
// // // //                                 key={tab.id}
// // // //                                 className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`}
// // // //                                 onClick={() => setActiveTab(tab.id)}
// // // //                             >
// // // //                                 {tab.icon}
// // // //                                 <span>{tab.label}</span>
// // // //                                 {activeTab === tab.id && submissions.filter(s => {
// // // //                                     const t = (s.moduleType || 'knowledge').toLowerCase();
// // // //                                     return tab.id === 'knowledge' ? (t === 'knowledge' || !s.moduleType) : t === tab.id;
// // // //                                 }).length > 0 && (
// // // //                                         <span className="vp-tab__count">
// // // //                                             {submissions.filter(s => {
// // // //                                                 const t = (s.moduleType || 'knowledge').toLowerCase();
// // // //                                                 return tab.id === 'knowledge' ? (t === 'knowledge' || !s.moduleType) : t === tab.id;
// // // //                                             }).length}
// // // //                                         </span>
// // // //                                     )}
// // // //                             </button>
// // // //                         ))}
// // // //                     </div>

// // // //                     {/* ── Main panel ── */}
// // // //                     {activeTab !== 'compliance' ? (
// // // //                         <div className="vp-panel">
// // // //                             {loadingSubmissions ? (
// // // //                                 <div className="vp-empty-state">
// // // //                                     <Loader2 size={28} className="vp-spin" />
// // // //                                     <span className="vp-empty-state__text">Filtering Course Assignments…</span>
// // // //                                 </div>
// // // //                             ) : filteredSubmissions.length === 0 ? (
// // // //                                 <div className="vp-empty-state">
// // // //                                     <FileText size={40} className="vp-empty-state__icon" />
// // // //                                     <p className="vp-empty-state__title">No Assessments Found</p>
// // // //                                     <p className="vp-empty-state__text">No records exist for this module type in this enrollment.</p>
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <div className="vp-table-scroll">
// // // //                                     <table className="vp-table">
// // // //                                         <thead>
// // // //                                             <tr>
// // // //                                                 <th className="vp-th">Assessment Title</th>
// // // //                                                 <th className="vp-th vp-th--narrow">Type</th>
// // // //                                                 <th className="vp-th vp-th--narrow">Time</th>
// // // //                                                 <th className="vp-th vp-th--narrow">Status</th>
// // // //                                                 <th className="vp-th vp-th--action" />
// // // //                                             </tr>
// // // //                                         </thead>
// // // //                                         <tbody>
// // // //                                             {filteredSubmissions.map(sub => (
// // // //                                                 <tr key={sub.id} className={`vp-tr ${isActionRequired(sub) ? 'vp-tr--action' : ''}`}>
// // // //                                                     <td className="vp-td">
// // // //                                                         <span className="vp-cell-title">{sub.title}</span>
// // // //                                                         <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
// // // //                                                     </td>
// // // //                                                     <td className="vp-td">
// // // //                                                         <span className="vp-cell-type">{sub.type}</span>
// // // //                                                     </td>
// // // //                                                     <td className="vp-td">{renderTimeRemaining(sub)}</td>
// // // //                                                     <td className="vp-td">{getStatusBadge(sub)}</td>
// // // //                                                     <td className="vp-td vp-td--action">
// // // //                                                         <button
// // // //                                                             className={`vp-action-btn ${isActionRequired(sub) ? 'vp-action-btn--primary' : 'vp-action-btn--outline'}`}
// // // //                                                             onClick={() => handleActionClick(sub)}
// // // //                                                         >
// // // //                                                             {getActionContent(sub)}
// // // //                                                         </button>
// // // //                                                     </td>
// // // //                                                 </tr>
// // // //                                             ))}
// // // //                                         </tbody>
// // // //                                     </table>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     ) : (
// // // //                         <div className="vp-compliance-panel">
// // // //                             <FileBadge size={40} className="vp-compliance-panel__icon" />
// // // //                             <h3 className="vp-compliance-panel__title">Compliance Documents</h3>
// // // //                             <p className="vp-compliance-panel__desc">
// // // //                                 Stored specifically for the{' '}
// // // //                                 <strong>{enrollment.qualification?.name || 'Current'}</strong> course.
// // // //                             </p>
// // // //                         </div>
// // // //                     )}
// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };


// // // // import React, { useEffect, useState } from 'react';
// // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // import {
// // // //     ArrowLeft, User, GraduationCap, Calendar,
// // // //     FileText, CheckCircle, AlertCircle, Clock,
// // // //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
// // // //     ShieldCheck, Award, MessageSquareWarning
// // // // } from 'lucide-react';
// // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // import { signOut } from 'firebase/auth';
// // // // import { auth, db } from '../../lib/firebase';
// // // // import { useStore } from '../../store/useStore';
// // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // import './ViewPortfolio.css';

// // // // interface LearnerSubmission {
// // // //     id: string;
// // // //     assessmentId: string;
// // // //     learnerId: string;
// // // //     title: string;
// // // //     type: string;
// // // //     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'moderated' | 'appealed'; // Updated Status types
// // // //     assignedAt: string;
// // // //     startedAt?: string;
// // // //     marks: number;
// // // //     totalMarks: number;
// // // //     competency?: 'C' | 'NYC';
// // // //     moduleNumber?: string;
// // // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// // // //     timeLimit?: number;
// // // //     moderation?: {
// // // //         outcome?: 'Endorsed' | 'Returned';
// // // //     };
// // // // }

// // // // const TABS = [
// // // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
// // // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
// // // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
// // // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
// // // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// // // // ] as const;

// // // // type TabId = typeof TABS[number]['id'];

// // // // export const ViewPortfolio: React.FC = () => {
// // // //     const { id: learnerId } = useParams();
// // // //     const navigate = useNavigate();

// // // //     const { user, learners, fetchLearners } = useStore();
// // // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // // //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

// // // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // // //     const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

// // // //     const learner = learners.find(l => l.id === learnerId);

// // // //     useEffect(() => {
// // // //         const fetchSecureTimeOffset = async () => {
// // // //             try {
// // // //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// // // //                 const data = await res.json();
// // // //                 const secureServerTime = new Date(data.utc_datetime).getTime();
// // // //                 const localMachineTime = new Date().getTime();
// // // //                 setTimeOffset(secureServerTime - localMachineTime);
// // // //             } catch (error) {
// // // //                 console.warn("Could not sync with secure time server.", error);
// // // //                 setTimeOffset(0);
// // // //             }
// // // //         };
// // // //         fetchSecureTimeOffset();

// // // //         const interval = setInterval(() => {
// // // //             setCurrentTimeTick(Date.now());
// // // //         }, 1000);

// // // //         return () => clearInterval(interval);
// // // //     }, []);

// // // //     const getSecureNow = () => currentTimeTick + timeOffset;

// // // //     useEffect(() => {
// // // //         if (learners.length === 0) fetchLearners();

// // // //         const fetchSubmissionsAndTemplates = async () => {
// // // //             if (!learnerId) return;
// // // //             setLoadingSubmissions(true);
// // // //             try {
// // // //                 const q = query(
// // // //                     collection(db, 'learner_submissions'),
// // // //                     where('learnerId', '==', learnerId)
// // // //                 );
// // // //                 const snap = await getDocs(q);
// // // //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// // // //                 const cache = new Map<string, number | undefined>();

// // // //                 for (let i = 0; i < subs.length; i++) {
// // // //                     const sub = subs[i];
// // // //                     if (!cache.has(sub.assessmentId)) {
// // // //                         const templateSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// // // //                         if (templateSnap.exists()) {
// // // //                             const templateData = templateSnap.data();
// // // //                             cache.set(sub.assessmentId, templateData.moduleInfo?.timeLimit);
// // // //                         } else {
// // // //                             cache.set(sub.assessmentId, undefined);
// // // //                         }
// // // //                     }
// // // //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// // // //                 }

// // // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // // //                 setSubmissions(subs);
// // // //             } catch (err) {
// // // //                 console.error('Error fetching submissions:', err);
// // // //             } finally {
// // // //                 setLoadingSubmissions(false);
// // // //             }
// // // //         };

// // // //         fetchSubmissionsAndTemplates();
// // // //     }, [learnerId, learners.length, fetchLearners]);

// // // //     const handleLogout = async () => {
// // // //         await signOut(auth);
// // // //         navigate('/login');
// // // //     };

// // // //     const handleNavChange = (nav: string) => {
// // // //         if (user?.role === 'learner') {
// // // //             if (nav === 'dashboard') navigate('/portal');
// // // //             if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
// // // //         } else {
// // // //             navigate('/admin', { state: { activeTab: nav } });
// // // //         }
// // // //     };

// // // //     const handleActionClick = (sub: LearnerSubmission) => {
// // // //         if (user?.role === 'learner') {
// // // //             navigate(`/learner/assessment/${sub.assessmentId}`);
// // // //         } else {
// // // //             navigate(`/portfolio/submission/${sub.id}`);
// // // //         }
// // // //     };

// // // //     // 🚀 ENHANCED STATUS BADGE LOGIC 🚀
// // // //     const getStatusBadge = (sub: LearnerSubmission) => {
// // // //         const isStudent = user?.role === 'learner';

// // // //         // 1. Fully Moderated (Finalised)
// // // //         if (sub.status === 'moderated') {
// // // //             return sub.competency === 'C'
// // // //                 ? <span className="mlab-badge mlab-badge--competent"><Award size={12} /> Final: Competent</span>
// // // //                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> Final: NYC</span>;
// // // //         }

// // // //         // 2. Graded by Assessor (Awaiting Moderation)
// // // //         if (sub.status === 'graded') {
// // // //             // If the user is a learner, we don't necessarily want to say "Awaiting Moderation", 
// // // //             // just that it's graded. But for staff, they need to know QA is pending.
// // // //             if (isStudent) {
// // // //                 return sub.competency === 'C'
// // // //                     ? <span className="mlab-badge" style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Graded: Competent</span>
// // // //                     : <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> Graded: NYC</span>;
// // // //             } else {
// // // //                 return <span className="mlab-badge" style={{ background: '#f3e8ff', color: '#7e22ce', border: '1px solid #e9d5ff' }}><ShieldCheck size={12} /> Needs Moderation</span>;
// // // //             }
// // // //         }

// // // //         // 3. Submitted (Awaiting Assessor)
// // // //         if (sub.status === 'submitted') {
// // // //             // Check if it was returned by a moderator!
// // // //             if (sub.moderation?.outcome === 'Returned') {
// // // //                 return <span className="mlab-badge" style={{ background: '#ffe4e6', color: '#9f1239', border: '1px solid #fecdd3' }}><MessageSquareWarning size={12} /> Assessor Revision Needed</span>;
// // // //             }
// // // //             return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Awaiting Assessor</span>;
// // // //         }

// // // //         // 4. In Progress
// // // //         if (sub.status === 'in_progress') {
// // // //             return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
// // // //         }

// // // //         // 5. Not Started
// // // //         return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
// // // //     };

// // // //     const getActionContent = (sub: LearnerSubmission) => {
// // // //         if (user?.role === 'learner') {
// // // //             if (sub.status === 'not_started') return <><Play size={13} /> Start</>;
// // // //             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
// // // //             if (['graded', 'moderated'].includes(sub.status)) return <><Eye size={13} /> Feedback</>;
// // // //             return <><Eye size={13} /> View</>;
// // // //         }

// // // //         // Staff actions
// // // //         if (user?.role === 'assessor' && sub.status === 'submitted') return <><Edit3 size={13} /> Grade Script</>;
// // // //         if (user?.role === 'moderator' && sub.status === 'graded') return <><ShieldCheck size={13} /> Moderate Script</>;

// // // //         return <><Eye size={13} /> View Record</>;
// // // //     };

// // // //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// // // //         if (!sub.timeLimit) return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No Limit</span>;

// // // //         if (sub.status === 'not_started') {
// // // //             return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{sub.timeLimit}m Total</span>;
// // // //         }

// // // //         if (sub.status === 'in_progress' && sub.startedAt) {
// // // //             const startTime = new Date(sub.startedAt).getTime();
// // // //             const timeLimitMs = sub.timeLimit * 60 * 1000;
// // // //             const endTime = startTime + timeLimitMs;

// // // //             const secureNow = getSecureNow();
// // // //             const remainingSeconds = Math.max(0, Math.floor((endTime - secureNow) / 1000));

// // // //             if (remainingSeconds === 0) {
// // // //                 return (
// // // //                     <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                         <AlertCircle size={14} /> Time Expired
// // // //                     </span>
// // // //                 );
// // // //             }

// // // //             const m = Math.floor(remainingSeconds / 60);
// // // //             const s = remainingSeconds % 60;
// // // //             const isLow = remainingSeconds < 300;

// // // //             return (
// // // //                 <span style={{
// // // //                     color: isLow ? '#ef4444' : '#2563eb',
// // // //                     fontWeight: isLow ? 'bold' : 'normal',
// // // //                     fontSize: '0.9rem',
// // // //                     display: 'flex', alignItems: 'center', gap: '4px'
// // // //                 }}>
// // // //                     <Timer size={14} />
// // // //                     {m}m {s.toString().padStart(2, '0')}s
// // // //                 </span>
// // // //             );
// // // //         }

// // // //         return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>;
// // // //     };

// // // //     if (!learner) {
// // // //         return <div className="mlab-state mlab-state--loading">Loading Portfolio Data…</div>;
// // // //     }

// // // //     const filteredSubmissions = submissions.filter(sub => {
// // // //         const currentTab = activeTab.toLowerCase();
// // // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// // // //         if (currentTab === 'knowledge') {
// // // //             return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // // //         }
// // // //         return subType === currentTab;
// // // //     });

// // // //     return (
// // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// // // //             <Sidebar
// // // //                 role={user?.role}
// // // //                 currentNav="learners"
// // // //                 setCurrentNav={handleNavChange}
// // // //                 onLogout={handleLogout}
// // // //             />

// // // //             <main className="main-wrapper" style={{ width: '100%', height: '100vh', overflowY: 'auto' }}>
// // // //                 <header className="dashboard-header" style={{ flexShrink: 0, zIndex: 10 }}>
// // // //                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
// // // //                         <ArrowLeft size={16} /> Back
// // // //                     </button>

// // // //                     <div className="mlab-portfolio-header">
// // // //                         <h1>Portfolio of Evidence</h1>
// // // //                         <p>QCTO / SETA Compliance Record</p>
// // // //                     </div>
// // // //                 </header>

// // // //                 <div className="admin-content" style={{ paddingBottom: '4rem' }}>
// // // //                     <div className="mlab-profile-card">
// // // //                         <div className="mlab-profile-avatar"><User size={36} /></div>
// // // //                         <div className="mlab-profile-info">
// // // //                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
// // // //                             <div className="mlab-profile-info__meta">
// // // //                                 <span><strong>ID:</strong> {learner.idNumber}</span>
// // // //                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
// // // //                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
// // // //                             </div>
// // // //                         </div>
// // // //                         <div className="mlab-profile-status">
// // // //                             <span className="mlab-profile-status__label">Overall Status</span>
// // // //                             {learner.status === 'active'
// // // //                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
// // // //                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
// // // //                             }
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="mlab-tab-bar">
// // // //                         {TABS.map(tab => (
// // // //                             <button
// // // //                                 key={tab.id}
// // // //                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // // //                                 onClick={() => setActiveTab(tab.id)}
// // // //                             >
// // // //                                 {tab.icon} {tab.label}
// // // //                             </button>
// // // //                         ))}
// // // //                     </div>

// // // //                     {activeTab !== 'compliance' && (
// // // //                         <div className="mlab-panel animate-fade-in">
// // // //                             {loadingSubmissions ? (
// // // //                                 <div className="mlab-state mlab-state--loading">Loading assignments…</div>
// // // //                             ) : filteredSubmissions.length === 0 ? (
// // // //                                 <div className="mlab-state">
// // // //                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // //                                     <span className="mlab-state__title">No {activeTab} assessments assigned.</span>
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <table className="mlab-table">
// // // //                                     <thead>
// // // //                                         <tr>
// // // //                                             <th>Assessment Title</th>
// // // //                                             <th>Type</th>
// // // //                                             <th>Time Limit</th>
// // // //                                             <th>Status</th>
// // // //                                             <th>Action</th>
// // // //                                         </tr>
// // // //                                     </thead>
// // // //                                     <tbody>
// // // //                                         {filteredSubmissions.map(sub => (
// // // //                                             <tr key={sub.id}>
// // // //                                                 <td>
// // // //                                                     <div className="mlab-cell-title">{sub.title}</div>
// // // //                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
// // // //                                                 </td>
// // // //                                                 <td><span className="mlab-cell-meta">{sub.type}</span></td>
// // // //                                                 <td>{renderTimeRemaining(sub)}</td>
// // // //                                                 <td>{getStatusBadge(sub)}</td> {/* 🚀 PASS THE WHOLE OBJ */}
// // // //                                                 <td className="mlab-cell-action">
// // // //                                                     {/* 🚀 DYNAMIC BUTTON STYLING BASED ON ROLE/STATUS */}
// // // //                                                     <button
// // // //                                                         className={`mlab-btn ${(user?.role === 'assessor' && sub.status === 'submitted') ||
// // // //                                                             (user?.role === 'moderator' && sub.status === 'graded')
// // // //                                                             ? 'mlab-btn--primary'
// // // //                                                             : 'mlab-btn--outline-blue'
// // // //                                                             }`}
// // // //                                                         onClick={() => handleActionClick(sub)}
// // // //                                                     >
// // // //                                                         {getActionContent(sub)}
// // // //                                                     </button>
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         ))}
// // // //                                     </tbody>
// // // //                                 </table>
// // // //                             )}
// // // //                         </div>
// // // //                     )}

// // // //                     {activeTab === 'compliance' && (
// // // //                         <div className="mlab-compliance-panel animate-fade-in">
// // // //                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // //                             <h3>Compliance Documents</h3>
// // // //                             <p>Learner ID, CV, and Enrollment Contracts.</p>
// // // //                         </div>
// // // //                     )}
// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };


// // // // // import React, { useEffect, useState } from 'react';
// // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // import {
// // // // //     ArrowLeft, User, GraduationCap, Calendar,
// // // // //     FileText, CheckCircle, AlertCircle, Clock,
// // // // //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer
// // // // // } from 'lucide-react';
// // // // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // // // import { signOut } from 'firebase/auth';
// // // // // import { auth, db } from '../../lib/firebase';
// // // // // import { useStore } from '../../store/useStore';
// // // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // // import './ViewPortfolio.css';

// // // // // interface LearnerSubmission {
// // // // //     id: string;
// // // // //     assessmentId: string;
// // // // //     learnerId: string;
// // // // //     title: string;
// // // // //     type: string;
// // // // //     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'appealed';
// // // // //     assignedAt: string;
// // // // //     startedAt?: string; // Captured when learner starts
// // // // //     marks: number;
// // // // //     totalMarks: number;
// // // // //     competency?: 'C' | 'NYC';
// // // // //     moduleNumber?: string;
// // // // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
// // // // //     // We will populate this dynamically from the assessment template
// // // // //     timeLimit?: number;
// // // // // }

// // // // // const TABS = [
// // // // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
// // // // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
// // // // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
// // // // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
// // // // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// // // // // ] as const;

// // // // // type TabId = typeof TABS[number]['id'];

// // // // // export const ViewPortfolio: React.FC = () => {
// // // // //     const { id: learnerId } = useParams();
// // // // //     const navigate = useNavigate();

// // // // //     const { user, learners, fetchLearners } = useStore();
// // // // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // // // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // // // //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

// // // // //     // 🚀 SECURE TIME STATES
// // // // //     const [timeOffset, setTimeOffset] = useState<number>(0);
// // // // //     const [currentTimeTick, setCurrentTimeTick] = useState<number>(Date.now());

// // // // //     const learner = learners.find(l => l.id === learnerId);

// // // // //     // ─── 1. FETCH SECURE TIME OFFSET ───
// // // // //     useEffect(() => {
// // // // //         const fetchSecureTimeOffset = async () => {
// // // // //             try {
// // // // //                 const res = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC');
// // // // //                 const data = await res.json();
// // // // //                 const secureServerTime = new Date(data.utc_datetime).getTime();
// // // // //                 const localMachineTime = new Date().getTime();
// // // // //                 setTimeOffset(secureServerTime - localMachineTime);
// // // // //             } catch (error) {
// // // // //                 console.warn("Could not sync with secure time server.", error);
// // // // //                 setTimeOffset(0);
// // // // //             }
// // // // //         };
// // // // //         fetchSecureTimeOffset();

// // // // //         // Tick every second to update UI live
// // // // //         const interval = setInterval(() => {
// // // // //             setCurrentTimeTick(Date.now());
// // // // //         }, 1000);

// // // // //         return () => clearInterval(interval);
// // // // //     }, []);

// // // // //     // Helper to get true current time
// // // // //     const getSecureNow = () => currentTimeTick + timeOffset;

// // // // //     // ─── 2. FETCH DATA ───
// // // // //     useEffect(() => {
// // // // //         if (learners.length === 0) fetchLearners();

// // // // //         const fetchSubmissionsAndTemplates = async () => {
// // // // //             if (!learnerId) return;
// // // // //             setLoadingSubmissions(true);
// // // // //             try {
// // // // //                 // 1. Fetch the Learner's Submissions
// // // // //                 const q = query(
// // // // //                     collection(db, 'learner_submissions'),
// // // // //                     where('learnerId', '==', learnerId)
// // // // //                 );
// // // // //                 const snap = await getDocs(q);
// // // // //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// // // // //                 // 2. Fetch Time Limits from Assessment Templates
// // // // //                 // (Since timeLimit is stored in the template, not the submission doc)
// // // // //                 const cache = new Map<string, number | undefined>();

// // // // //                 for (let i = 0; i < subs.length; i++) {
// // // // //                     const sub = subs[i];
// // // // //                     if (!cache.has(sub.assessmentId)) {
// // // // //                         const templateSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// // // // //                         if (templateSnap.exists()) {
// // // // //                             const templateData = templateSnap.data();
// // // // //                             cache.set(sub.assessmentId, templateData.moduleInfo?.timeLimit);
// // // // //                         } else {
// // // // //                             cache.set(sub.assessmentId, undefined);
// // // // //                         }
// // // // //                     }
// // // // //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// // // // //                 }

// // // // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // // // //                 setSubmissions(subs);
// // // // //             } catch (err) {
// // // // //                 console.error('Error fetching submissions:', err);
// // // // //             } finally {
// // // // //                 setLoadingSubmissions(false);
// // // // //             }
// // // // //         };

// // // // //         fetchSubmissionsAndTemplates();
// // // // //     }, [learnerId, learners.length, fetchLearners]);

// // // // //     // ─── 3. ACTIONS ───
// // // // //     const handleLogout = async () => {
// // // // //         await signOut(auth);
// // // // //         navigate('/login');
// // // // //     };

// // // // //     const handleNavChange = (nav: string) => {
// // // // //         if (user?.role === 'learner') {
// // // // //             if (nav === 'dashboard') navigate('/portal');
// // // // //             if (nav === 'profile') navigate('/portal', { state: { activeTab: 'profile' } });
// // // // //         } else {
// // // // //             navigate('/admin', { state: { activeTab: nav } });
// // // // //         }
// // // // //     };

// // // // //     const handleActionClick = (sub: LearnerSubmission) => {
// // // // //         if (user?.role === 'learner') {
// // // // //             navigate(`/learner/assessment/${sub.assessmentId}`);
// // // // //         } else {
// // // // //             navigate(`/portfolio/submission/${sub.id}`);
// // // // //         }
// // // // //     };

// // // // //     // ─── 4. HELPERS ───
// // // // //     const getStatusBadge = (status: string, competency?: string) => {
// // // // //         if (status === 'graded') {
// // // // //             return competency === 'C'
// // // // //                 ? <span className="mlab-badge mlab-badge--competent"><CheckCircle size={12} /> Competent</span>
// // // // //                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> NYC</span>;
// // // // //         }
// // // // //         switch (status) {
// // // // //             case 'submitted': return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Under Review</span>;
// // // // //             case 'in_progress': return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
// // // // //             case 'not_started': return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
// // // // //             default: return <span className="mlab-badge mlab-badge--not-started">{status}</span>;
// // // // //         }
// // // // //     };

// // // // //     const getActionContent = (sub: LearnerSubmission) => {
// // // // //         if (user?.role === 'learner') {
// // // // //             if (sub.status === 'not_started') return <><Play size={13} /> Start</>;
// // // // //             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
// // // // //             if (sub.status === 'graded') return <><Eye size={13} /> Feedback</>;
// // // // //             return <><Eye size={13} /> View</>;
// // // // //         }
// // // // //         return <><Eye size={13} /> View Record</>;
// // // // //     };

// // // // //     // 🚀 TIME CALCULATION LOGIC
// // // // //     const renderTimeRemaining = (sub: LearnerSubmission) => {
// // // // //         if (!sub.timeLimit) return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No Limit</span>;

// // // // //         if (sub.status === 'not_started') {
// // // // //             return <span style={{ color: '#64748b', fontSize: '0.85rem' }}>{sub.timeLimit}m Total</span>;
// // // // //         }

// // // // //         if (sub.status === 'in_progress' && sub.startedAt) {
// // // // //             const startTime = new Date(sub.startedAt).getTime();
// // // // //             const timeLimitMs = sub.timeLimit * 60 * 1000;
// // // // //             const endTime = startTime + timeLimitMs;

// // // // //             const secureNow = getSecureNow();
// // // // //             const remainingSeconds = Math.max(0, Math.floor((endTime - secureNow) / 1000));

// // // // //             if (remainingSeconds === 0) {
// // // // //                 return (
// // // // //                     <span style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // // //                         <AlertCircle size={14} /> Time Expired
// // // // //                     </span>
// // // // //                 );
// // // // //             }

// // // // //             const m = Math.floor(remainingSeconds / 60);
// // // // //             const s = remainingSeconds % 60;
// // // // //             const isLow = remainingSeconds < 300; // Under 5 mins

// // // // //             return (
// // // // //                 <span style={{
// // // // //                     color: isLow ? '#ef4444' : '#2563eb',
// // // // //                     fontWeight: isLow ? 'bold' : 'normal',
// // // // //                     fontSize: '0.9rem',
// // // // //                     display: 'flex', alignItems: 'center', gap: '4px'
// // // // //                 }}>
// // // // //                     <Timer size={14} />
// // // // //                     {m}m {s.toString().padStart(2, '0')}s
// // // // //                 </span>
// // // // //             );
// // // // //         }

// // // // //         return <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>—</span>;
// // // // //     };

// // // // //     if (!learner) {
// // // // //         return <div className="mlab-state mlab-state--loading">Loading Portfolio Data…</div>;
// // // // //     }

// // // // //     const filteredSubmissions = submissions.filter(sub => {
// // // // //         const currentTab = activeTab.toLowerCase();
// // // // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// // // // //         if (currentTab === 'knowledge') {
// // // // //             return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // // // //         }
// // // // //         return subType === currentTab;
// // // // //     });

// // // // //     return (
// // // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// // // // //             <Sidebar
// // // // //                 role={user?.role}
// // // // //                 currentNav="learners"
// // // // //                 setCurrentNav={handleNavChange}
// // // // //                 onLogout={handleLogout}
// // // // //             />

// // // // //             <main className="main-wrapper" style={{ width: '100%' }}>
// // // // //                 <header className="dashboard-header">
// // // // //                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
// // // // //                         <ArrowLeft size={16} /> Back
// // // // //                     </button>

// // // // //                     <div className="mlab-portfolio-header">
// // // // //                         <h1>Portfolio of Evidence</h1>
// // // // //                         <p>QCTO / SETA Compliance Record</p>
// // // // //                     </div>
// // // // //                 </header>

// // // // //                 <div className="admin-content">
// // // // //                     <div className="mlab-profile-card">
// // // // //                         <div className="mlab-profile-avatar"><User size={36} /></div>
// // // // //                         <div className="mlab-profile-info">
// // // // //                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
// // // // //                             <div className="mlab-profile-info__meta">
// // // // //                                 <span><strong>ID:</strong> {learner.idNumber}</span>
// // // // //                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
// // // // //                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                         <div className="mlab-profile-status">
// // // // //                             <span className="mlab-profile-status__label">Overall Status</span>
// // // // //                             {learner.status === 'active'
// // // // //                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
// // // // //                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
// // // // //                             }
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div className="mlab-tab-bar">
// // // // //                         {TABS.map(tab => (
// // // // //                             <button
// // // // //                                 key={tab.id}
// // // // //                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // // // //                                 onClick={() => setActiveTab(tab.id)}
// // // // //                             >
// // // // //                                 {tab.icon} {tab.label}
// // // // //                             </button>
// // // // //                         ))}
// // // // //                     </div>

// // // // //                     {activeTab !== 'compliance' && (
// // // // //                         <div className="mlab-panel animate-fade-in">
// // // // //                             {loadingSubmissions ? (
// // // // //                                 <div className="mlab-state mlab-state--loading">Loading assignments…</div>
// // // // //                             ) : filteredSubmissions.length === 0 ? (
// // // // //                                 <div className="mlab-state">
// // // // //                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // // //                                     <span className="mlab-state__title">No {activeTab} assessments assigned.</span>
// // // // //                                 </div>
// // // // //                             ) : (
// // // // //                                 <table className="mlab-table">
// // // // //                                     <thead>
// // // // //                                         <tr>
// // // // //                                             <th>Assessment Title</th>
// // // // //                                             <th>Type</th>
// // // // //                                             <th>Time Limit</th> {/* 🚀 NEW COLUMN */}
// // // // //                                             <th>Status</th>
// // // // //                                             <th>Action</th>
// // // // //                                         </tr>
// // // // //                                     </thead>
// // // // //                                     <tbody>
// // // // //                                         {filteredSubmissions.map(sub => (
// // // // //                                             <tr key={sub.id}>
// // // // //                                                 <td>
// // // // //                                                     <div className="mlab-cell-title">{sub.title}</div>
// // // // //                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
// // // // //                                                 </td>
// // // // //                                                 <td><span className="mlab-cell-meta">{sub.type}</span></td>
// // // // //                                                 <td>{renderTimeRemaining(sub)}</td> {/* 🚀 RENDER TIMER HERE */}
// // // // //                                                 <td>{getStatusBadge(sub.status, sub.competency)}</td>
// // // // //                                                 <td className="mlab-cell-action">
// // // // //                                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={() => handleActionClick(sub)}>
// // // // //                                                         {getActionContent(sub)}
// // // // //                                                     </button>
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         ))}
// // // // //                                     </tbody>
// // // // //                                 </table>
// // // // //                             )}
// // // // //                         </div>
// // // // //                     )}

// // // // //                     {activeTab === 'compliance' && (
// // // // //                         <div className="mlab-compliance-panel animate-fade-in">
// // // // //                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // // //                             <h3>Compliance Documents</h3>
// // // // //                             <p>Learner ID, CV, and Enrollment Contracts.</p>
// // // // //                         </div>
// // // // //                     )}
// // // // //                 </div>
// // // // //             </main>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // // // src/pages/Portfolio/ViewPortfolio.tsx
// // // // // // // Styled to align with mLab Corporate Identity Brand Guide 2019
// // // // // // // All visual styling lives in ViewPortfolio.css

// // // // // // import React, { useEffect, useState } from 'react';
// // // // // // import { useParams, useNavigate } from 'react-router-dom';
// // // // // // import {
// // // // // //     ArrowLeft, User, GraduationCap, Calendar,
// // // // // //     FileText, CheckCircle, AlertCircle, Clock,
// // // // // //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3
// // // // // // } from 'lucide-react';
// // // // // // import { collection, query, where, getDocs } from 'firebase/firestore';
// // // // // // import { db } from '../../lib/firebase';
// // // // // // import { useStore } from '../../store/useStore';
// // // // // // import { Sidebar } from '../../components/dashboard/Sidebar';
// // // // // // import './ViewPortfolio.css';

// // // // // // interface LearnerSubmission {
// // // // // //     id: string;
// // // // // //     assessmentId: string;
// // // // // //     learnerId: string;
// // // // // //     title: string;
// // // // // //     type: string;
// // // // // //     status: 'not_started' | 'in_progress' | 'submitted' | 'graded' | 'appealed';
// // // // // //     assignedAt: string;
// // // // // //     marks: number;
// // // // // //     totalMarks: number;
// // // // // //     competency?: 'C' | 'NYC';
// // // // // //     moduleNumber?: string;
// // // // // //     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other'; // ✅ Make sure this is typed!
// // // // // // }

// // // // // // // ✅ Added the 'other' tab for practice tests
// // // // // // const TABS = [
// // // // // //     { id: 'knowledge', label: 'Knowledge (K)', icon: <BookOpen size={15} /> },
// // // // // //     { id: 'practical', label: 'Practical (P)', icon: <FileText size={15} /> },
// // // // // //     { id: 'workplace', label: 'Workplace (W)', icon: <Briefcase size={15} /> },
// // // // // //     { id: 'other', label: 'Practice & Extras', icon: <Play size={15} /> },
// // // // // //     { id: 'compliance', label: 'Compliance Docs', icon: <FileBadge size={15} /> },
// // // // // // ] as const;

// // // // // // type TabId = typeof TABS[number]['id'];

// // // // // // export const ViewPortfolio: React.FC = () => {
// // // // // //     const { id: learnerId } = useParams();
// // // // // //     const navigate = useNavigate();

// // // // // //     const { user, learners, fetchLearners } = useStore();
// // // // // //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// // // // // //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// // // // // //     const [activeTab, setActiveTab] = useState<TabId>('knowledge');

// // // // // //     const learner = learners.find(l => l.id === learnerId);

// // // // // //     useEffect(() => {
// // // // // //         if (learners.length === 0) fetchLearners();

// // // // // //         const fetchSubmissions = async () => {
// // // // // //             if (!learnerId) return;
// // // // // //             setLoadingSubmissions(true);
// // // // // //             try {
// // // // // //                 const q = query(
// // // // // //                     collection(db, 'learner_submissions'),
// // // // // //                     where('learnerId', '==', learnerId)
// // // // // //                 );
// // // // // //                 const snap = await getDocs(q);
// // // // // //                 const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LearnerSubmission));
// // // // // //                 subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// // // // // //                 setSubmissions(subs);
// // // // // //                 console.log("Fetched Submissions for this learner:", subs); // 🔍 Debugging log
// // // // // //             } catch (err) {
// // // // // //                 console.error('Error fetching submissions:', err);
// // // // // //             } finally {
// // // // // //                 setLoadingSubmissions(false);
// // // // // //             }
// // // // // //         };

// // // // // //         fetchSubmissions();
// // // // // //     }, [learnerId, learners.length, fetchLearners]);

// // // // // //     if (!learner) {
// // // // // //         return (
// // // // // //             <div className="mlab-state mlab-state--loading">
// // // // // //                 Loading Portfolio Data…
// // // // // //             </div>
// // // // // //         );
// // // // // //     }

// // // // // //     // ── Badge helper ──────────────────────────────────────────────────────────
// // // // // //     const getStatusBadge = (status: string, competency?: string) => {
// // // // // //         if (status === 'graded') {
// // // // // //             return competency === 'C'
// // // // // //                 ? <span className="mlab-badge mlab-badge--competent"><CheckCircle size={12} /> Competent</span>
// // // // // //                 : <span className="mlab-badge mlab-badge--nyc"><AlertCircle size={12} /> Not Yet Competent</span>;
// // // // // //         }
// // // // // //         switch (status) {
// // // // // //             case 'submitted': return <span className="mlab-badge mlab-badge--review"><Clock size={12} /> Under Review</span>;
// // // // // //             case 'in_progress': return <span className="mlab-badge mlab-badge--in-progress"><Edit3 size={12} /> In Progress</span>;
// // // // // //             case 'not_started': return <span className="mlab-badge mlab-badge--not-started">Not Started</span>;
// // // // // //             default: return <span className="mlab-badge mlab-badge--not-started">{status}</span>;
// // // // // //         }
// // // // // //     };

// // // // // //     // ── Action helpers ────────────────────────────────────────────────────────
// // // // // //     const handleActionClick = (sub: LearnerSubmission) => {
// // // // // //         if (user?.role === 'learner') {
// // // // // //             navigate(`/assessment-player/${sub.assessmentId}`);
// // // // // //         } else if (user?.role === 'assessor') {
// // // // // //             navigate(`/grading/${sub.id}`);
// // // // // //         } else {
// // // // // //             navigate(`/portfolio/submission/${sub.id}`);
// // // // // //         }
// // // // // //     };

// // // // // //     const getActionContent = (sub: LearnerSubmission) => {
// // // // // //         if (user?.role === 'learner') {
// // // // // //             if (sub.status === 'not_started') return <><Play size={13} /> Start Assessment</>;
// // // // // //             if (sub.status === 'in_progress') return <><Edit3 size={13} /> Resume</>;
// // // // // //             if (sub.status === 'graded') return <><Eye size={13} /> View Feedback</>;
// // // // // //             return <><Eye size={13} /> View Submission</>;
// // // // // //         }
// // // // // //         if (user?.role === 'assessor') {
// // // // // //             if (sub.status === 'submitted') return <><Edit3 size={13} /> Grade Now</>;
// // // // // //             return <><Eye size={13} /> View</>;
// // // // // //         }
// // // // // //         return <><Eye size={13} /> View Record</>;
// // // // // //     };

// // // // // //     // ✅ THE MISSING FILTER LOGIC: Filter by Active Tab
// // // // // //     // const filteredSubmissions = submissions.filter(sub => {
// // // // // //     //     // If an assessment was published before we added the 'moduleType' dropdown, 
// // // // // //     //     // default it to 'knowledge' so it doesn't disappear completely.
// // // // // //     //     const type = sub.moduleType || 'knowledge';
// // // // // //     //     return type === activeTab;
// // // // // //     // });
// // // // // //     // Inside ViewPortfolio.tsx, update this block:

// // // // // //     const filteredSubmissions = submissions.filter(sub => {
// // // // // //         // 1. Convert everything to lowercase to avoid "Knowledge" vs "knowledge" bugs
// // // // // //         const currentTab = activeTab.toLowerCase();
// // // // // //         const subType = (sub.moduleType || 'knowledge').toLowerCase();

// // // // // //         // 2. If we are on the Knowledge tab, show anything that is knowledge OR missing a type
// // // // // //         if (currentTab === 'knowledge') {
// // // // // //             return subType === 'knowledge' || subType === '' || !sub.moduleType;
// // // // // //         }

// // // // // //         // 3. Otherwise, do a strict match
// // // // // //         return subType === currentTab;
// // // // // //     });

// // // // // //     // ── Render ────────────────────────────────────────────────────────────────
// // // // // //     return (
// // // // // //         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
// // // // // //             <Sidebar
// // // // // //                 currentNav="learners"
// // // // // //                 setCurrentNav={() => navigate(-1)}
// // // // // //                 onLogout={() => navigate('/login')}
// // // // // //             />

// // // // // //             <main className="main-wrapper" style={{ width: '100%' }}>
// // // // // //                 <header className="dashboard-header">

// // // // // //                     {/* Back */}
// // // // // //                     <button type="button" className="mlab-back-btn" onClick={() => navigate(-1)}>
// // // // // //                         <ArrowLeft size={16} /> Back
// // // // // //                     </button>

// // // // // //                     {/* Page title */}
// // // // // //                     <div className="mlab-portfolio-header">
// // // // // //                         <h1>Portfolio of Evidence</h1>
// // // // // //                         <p>QCTO / SETA Compliance Record</p>
// // // // // //                     </div>
// // // // // //                 </header>

// // // // // //                 <div className="admin-content">

// // // // // //                     {/* ── Learner Profile Card ──────────────────────────── */}
// // // // // //                     <div className="mlab-profile-card">
// // // // // //                         <div className="mlab-profile-avatar">
// // // // // //                             <User size={36} />
// // // // // //                         </div>

// // // // // //                         <div className="mlab-profile-info">
// // // // // //                             <h2 className="mlab-profile-info__name">{learner.fullName}</h2>
// // // // // //                             <div className="mlab-profile-info__meta">
// // // // // //                                 <span><strong>ID:</strong> {learner.idNumber}</span>
// // // // // //                                 <span><GraduationCap size={13} /> {learner.qualification?.name}</span>
// // // // // //                                 <span><Calendar size={13} /> Enrolled: {learner.trainingStartDate}</span>
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         <div className="mlab-profile-status">
// // // // // //                             <span className="mlab-profile-status__label">Overall Status</span>
// // // // // //                             {learner.status === 'active'
// // // // // //                                 ? <span className="mlab-badge mlab-badge--active-learner">Active</span>
// // // // // //                                 : <span className="mlab-badge mlab-badge--dropped-learner">Dropped</span>
// // // // // //                             }
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     {/* ── Tab Bar ───────────────────────────────────────── */}
// // // // // //                     <div className="mlab-tab-bar">
// // // // // //                         {TABS.map(tab => (
// // // // // //                             <button
// // // // // //                                 key={tab.id}
// // // // // //                                 className={`mlab-tab ${activeTab === tab.id ? 'mlab-tab--active' : 'mlab-tab--inactive'}`}
// // // // // //                                 onClick={() => setActiveTab(tab.id)}
// // // // // //                             >
// // // // // //                                 {tab.icon} {tab.label}
// // // // // //                             </button>
// // // // // //                         ))}
// // // // // //                     </div>

// // // // // //                     {/* ── Assessment Tab Content ────────────────────────── */}
// // // // // //                     {activeTab !== 'compliance' && (
// // // // // //                         <div className="mlab-panel">
// // // // // //                             {loadingSubmissions ? (
// // // // // //                                 <div className="mlab-state mlab-state--loading">
// // // // // //                                     Loading assignments…
// // // // // //                                 </div>
// // // // // //                             ) : filteredSubmissions.length === 0 ? (  // ✅ Use filteredSubmissions here
// // // // // //                                 <div className="mlab-state">
// // // // // //                                     <FileText size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // // // //                                     <span className="mlab-state__title">
// // // // // //                                         {activeTab === 'other' ? 'No practice tests assigned.' : `No ${activeTab} assessments assigned.`}
// // // // // //                                     </span>
// // // // // //                                     <p className="mlab-state__desc">
// // // // // //                                         Assessments published by the Facilitator will appear here.
// // // // // //                                     </p>
// // // // // //                                 </div>
// // // // // //                             ) : (
// // // // // //                                 <table className="mlab-table">
// // // // // //                                     <thead>
// // // // // //                                         <tr>
// // // // // //                                             <th>Assessment Title</th>
// // // // // //                                             <th>Type</th>
// // // // // //                                             <th>Assigned Date</th>
// // // // // //                                             <th>Status</th>
// // // // // //                                             <th>Action</th>
// // // // // //                                         </tr>
// // // // // //                                     </thead>
// // // // // //                                     <tbody>
// // // // // //                                         {/* ✅ Use filteredSubmissions here too! */}
// // // // // //                                         {filteredSubmissions.map(sub => (
// // // // // //                                             <tr key={sub.id}>
// // // // // //                                                 <td>
// // // // // //                                                     <div className="mlab-cell-title">{sub.title}</div>
// // // // // //                                                     <div className="mlab-cell-sub">{sub.moduleNumber || 'Module Data'}</div>
// // // // // //                                                 </td>
// // // // // //                                                 <td>
// // // // // //                                                     <span className="mlab-cell-meta">{sub.type}</span>
// // // // // //                                                 </td>
// // // // // //                                                 <td>
// // // // // //                                                     <span className="mlab-cell-meta">
// // // // // //                                                         {new Date(sub.assignedAt).toLocaleDateString()}
// // // // // //                                                     </span>
// // // // // //                                                 </td>
// // // // // //                                                 <td>
// // // // // //                                                     {getStatusBadge(sub.status, sub.competency)}
// // // // // //                                                 </td>
// // // // // //                                                 <td className="mlab-cell-action">
// // // // // //                                                     <button
// // // // // //                                                         className="mlab-btn mlab-btn--outline-blue"
// // // // // //                                                         onClick={() => handleActionClick(sub)}
// // // // // //                                                     >
// // // // // //                                                         {getActionContent(sub)}
// // // // // //                                                     </button>
// // // // // //                                                 </td>
// // // // // //                                             </tr>
// // // // // //                                         ))}
// // // // // //                                     </tbody>
// // // // // //                                 </table>
// // // // // //                             )}
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                     {/* ── Compliance Tab Content ────────────────────────── */}
// // // // // //                     {activeTab === 'compliance' && (
// // // // // //                         <div className="mlab-compliance-panel">
// // // // // //                             <FileBadge size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
// // // // // //                             <h3 className="mlab-compliance-panel__title">Compliance Documents</h3>
// // // // // //                             <p className="mlab-compliance-panel__desc">
// // // // // //                                 This section will hold the Learner's Certified ID, CV, and Signed Enrollment Contracts.
// // // // // //                             </p>
// // // // // //                             <button className="mlab-btn mlab-btn--green">
// // // // // //                                 Upload Document
// // // // // //                             </button>
// // // // // //                         </div>
// // // // // //                     )}

// // // // // //                 </div>
// // // // // //             </main>
// // // // // //         </div>
// // // // // //     );
// // // // // // };