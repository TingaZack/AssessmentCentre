// src/pages/Portfolio/ViewPortfolio.tsx


// src/pages/Portfolio/ViewPortfolio.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
    ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
    Upload, RotateCcw, MessageSquare, Download, AlertTriangle, X
} from 'lucide-react';
import {
    collection, query, where, getDocs, doc, getDoc,
    setDoc, updateDoc, deleteField, onSnapshot, addDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { signOut } from 'firebase/auth';
import { auth, db, storage } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
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

// ─── POE GENERATOR COMPONENT (INLINE) ───
const PoEGenerator: React.FC<{ learnerId: string, requestedByUid: string }> = ({ learnerId, requestedByUid }) => {
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        if (!learnerId) return;
        const q = query(collection(db, 'poe_export_requests'), where('learnerId', '==', learnerId));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
                docs.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
                const data = docs[0];

                if (data.status === 'processing') {
                    setGenerating(true);
                    setErrorMsg(null);
                    setProgress(data.progress || 0);
                    setProgressMsg(data.progressMessage || 'Initializing...');
                } else if (data.status === 'completed') {
                    setGenerating(false);
                    setProgress(100);
                    setDownloadUrl(data.downloadUrl);
                    if (!downloadUrl) toast.success("Master PoE is ready for download!");
                } else if (data.status === 'error') {
                    setGenerating(false);
                    setErrorMsg(data.errorMessage || "Unknown error occurred.");
                } else if (data.status === 'dismissed') {
                    setErrorMsg(null);
                    setGenerating(false);
                }
            }
        });
        return () => unsubscribe();
    }, [learnerId, downloadUrl, toast]);

    const handleGeneratePoE = async () => {
        setGenerating(true);
        setProgress(0);
        setProgressMsg('Preparing request...');
        setErrorMsg(null);
        try {
            await addDoc(collection(db, 'poe_export_requests'), {
                learnerId, requestedBy: requestedByUid, status: 'processing',
                progress: 0, progressMessage: 'Initializing...', requestedAt: new Date().toISOString()
            });
        } catch (error: any) {
            setErrorMsg(error.message);
            setGenerating(false);
        }
    };

    const handleDismissError = async () => {
        setErrorMsg(null);
        try {
            const q = query(collection(db, 'poe_export_requests'), where('learnerId', '==', learnerId));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const latest = snap.docs.sort((a, b) => new Date(b.data().requestedAt).getTime() - new Date(a.data().requestedAt).getTime())[0];
                await updateDoc(doc(db, 'poe_export_requests', latest.id), { status: 'dismissed' });
            }
        } catch (err) { console.error(err); }
    };

    const radius = 14;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h3 style={{ margin: '0 0 8px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                        <FileText size={20} color="#0284c7" /> Master Portfolio of Evidence
                    </h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>Generate a complete, QCTO-compliant PDF PoE for this learner.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    {generating ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'white', border: '1px solid #cbd5e1', padding: '6px 16px', borderRadius: '8px' }}>
                            <svg width="32" height="32" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r={radius} stroke="#e2e8f0" strokeWidth="4" fill="none" />
                                <circle cx="18" cy="18" r={radius} stroke="#0ea5e9" strokeWidth="4" fill="none" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }} />
                            </svg>
                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: '120px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{progress}%</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{progressMsg}</span>
                            </div>
                        </div>
                    ) : downloadUrl ? (
                        <>
                            <a href={downloadUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#16a34a', color: 'white', padding: '10px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}><Download size={16} /> Download PoE</a>
                            <button onClick={handleGeneratePoE} style={{ background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 16px', borderRadius: '6px', fontWeight: 'bold', fontSize: '0.85rem', cursor: 'pointer' }}>Regenerate</button>
                        </>
                    ) : (
                        <button onClick={handleGeneratePoE} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0284c7', color: 'white', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}><FileText size={16} /> Generate Master PoE</button>
                    )}
                </div>
            </div>
            {errorMsg && (
                <div style={{ marginTop: '15px', background: '#fef2f2', border: '1px solid #fecdd3', padding: '12px', borderRadius: '6px', color: '#991b1b', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', fontSize: '0.85rem' }}>
                    <div style={{ display: 'flex', gap: '10px' }}><AlertTriangle size={18} /><div><strong>Generation Failed</strong><br />{errorMsg}</div></div>
                    <button onClick={handleDismissError} style={{ background: 'transparent', border: 'none', color: '#991b1b', cursor: 'pointer' }}><X size={16} /></button>
                </div>
            )}
            <div style={{ marginTop: '15px', background: '#fffbeb', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: '#b45309' }}>
                <AlertTriangle size={16} /><span><strong>Compliance:</strong> Ensure all modules are Moderated before final export for auditors.</span>
            </div>
        </div>
    );
};

// ─── REMEDIATION MODAL ───
const RemediationModal: React.FC<{ submissionTitle: string; attemptNumber: number; onClose: () => void; onSubmit: (date: string, notes: string) => void; }> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
    const [date, setDate] = useState('');
    const [notes, setNotes] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    useEffect(() => {
        const s = document.createElement('style'); s.innerHTML = `body, html { overflow: hidden !important; }`;
        document.head.appendChild(s); return () => { document.head.removeChild(s); };
    }, []);
    const isFinal = attemptNumber === 2;
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
            <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinal ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinal ? '#fef2f2' : '#fffbeb' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ background: isFinal ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}><RotateCcw size={24} /></div>
                        <div><h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinal ? '#b91c1c' : '#b45309' }}>Initiate Remediation {isFinal && "(FINAL ATTEMPT)"}</h2><p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>{submissionTitle}</p></div>
                    </div>
                </div>
                <form onSubmit={e => { e.preventDefault(); onSubmit(date, notes); }} style={{ padding: '1.5rem' }}>
                    <div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching Session *</label>
                        <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' }} /></div>
                    <div style={{ marginBottom: '1.5rem' }}><label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Coaching Notes *</label>
                        <textarea required rows={3} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', resize: 'vertical' }} /></div>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
                        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px' }} />
                        <span style={{ fontSize: '0.8rem', color: '#475569' }}><strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.</span>
                    </label>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Cancel</button>
                        <button type="submit" disabled={!confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinal ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', opacity: !confirmed ? 0.5 : 1 }}>Log Coaching & Unlock</button>
                    </div>
                </form>
            </div>
        </div>, document.body
    );
};

// ─── MAIN COMPONENT ───
export const ViewPortfolio: React.FC = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const targetCohortId = (location.state as any)?.cohortId;

    const { user, learners, learnersLoading, programmes, cohorts, fetchLearners, fetchProgrammes, fetchCohorts, updateLearner } = useStore();
    const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [timeOffset, setTimeOffset] = useState(0);
    const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
    const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);
    const [remediatingId, setRemediatingId] = useState<string | null>(null);
    const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);

    useEffect(() => {
        fetch('https://worldtimeapi.org/api/timezone/Etc/UTC').then(r => r.json()).then(d => setTimeOffset(new Date(d.utc_datetime).getTime() - Date.now())).catch(() => setTimeOffset(0));
        const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000); return () => clearInterval(tick);
    }, []);
    const getSecureNow = () => currentTimeTick + timeOffset;

    useEffect(() => { if (!learners.length) fetchLearners(); if (!programmes.length) fetchProgrammes(); if (!cohorts.length) fetchCohorts(); }, [learners.length, programmes.length, cohorts.length]);

    const enrollment = useMemo(() => {
        const records = learners.filter(l => l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId);
        if (!records.length) return undefined;
        if (targetCohortId) return records.find(l => l.cohortId === targetCohortId) || { ...records[0], cohortId: targetCohortId };
        return records.find(e => e.status !== 'dropped') || records[0];
    }, [learners, routeId, targetCohortId]);

    const matchingProgramme = useMemo(() => {
        if (!programmes.length || !enrollment) return null;
        const activeCohortId = targetCohortId || enrollment.cohortId;
        if (activeCohortId && cohorts.length) {
            const linked = cohorts.find(c => c.id === activeCohortId);
            const templateId = (linked as any)?.programmeId || (linked as any)?.qualificationId;
            const prog = programmes.find(p => p.id === templateId);
            if (prog) return prog;
        }
        return programmes.find(p => String(p.saqaId || '') === String(enrollment.qualification?.saqaId || '')) || null;
    }, [programmes, cohorts, enrollment, targetCohortId]);

    useEffect(() => {
        let mounted = true; if (!enrollment) return;
        setLoadingSubmissions(true);
        const subRef = collection(db, 'learner_submissions');
        const q = enrollment.cohortId ? query(subRef, where('learnerId', '==', enrollment.learnerId || enrollment.id), where('cohortId', '==', enrollment.cohortId)) : query(subRef, where('learnerId', '==', enrollment.learnerId || enrollment.id));
        getDocs(q).then(snap => {
            if (mounted) {
                const subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
                setSubmissions(subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()));
                setLoadingSubmissions(false);
            }
        });
        return () => { mounted = false; };
    }, [enrollment]);

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

    const executeRemediation = async (date: string, notes: string) => {
        if (!remediationTarget) return; const s = remediationTarget; setRemediationTarget(null); setRemediatingId(s.id);
        try {
            await setDoc(doc(collection(db, 'learner_submissions', s.id, 'history')), { ...s, archivedAt: new Date().toISOString() });
            await updateDoc(doc(db, 'learner_submissions', s.id), { status: 'in_progress', competency: deleteField(), grading: deleteField(), moderation: deleteField(), submittedAt: deleteField(), attemptNumber: (s.attemptNumber || 1) + 1 });
            setSubmissions(p => p.map(x => x.id === s.id ? { ...x, status: 'in_progress', competency: undefined, attemptNumber: (x.attemptNumber || 1) + 1 } : x));
            toast.success("Workbook unlocked!");
        } catch { toast.error("Failed to unlock."); } finally { setRemediatingId(null); }
    };

    const renderPipelineBar = (label: string, value: number, total: number, colorKey: string) => {
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
            <div className="vp-pipeline-item" key={label}>
                <div className="vp-pipeline-item__header"><span className="vp-pipeline-item__label">{label}</span><span className="vp-pipeline-item__stat">{value} / {total} — {pct}%</span></div>
                <div className="vp-pipeline-track"><div className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`} style={{ width: `${pct}%` }} /></div>
            </div>
        );
    };

    const getStatusBadge = (sub: LearnerSubmission) => {
        const role = user?.role || 'learner';
        switch (sub.status) {
            case 'moderated':
                return sub.competency === 'C' ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span> : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
            case 'graded': return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
            case 'in_progress': return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress (Attempt {sub.attemptNumber || 1})</span>;
            case 'submitted': return <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
            default: return <span className="vp-badge vp-badge--none">Not Started</span>;
        }
    };

    const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
        if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined.</p>;
        return (
            <ul className="vp-curr-list">
                {modules.map((mod, idx) => {
                    const sub = submissions.find(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);
                    const stateKey = sub && ['graded', 'moderated'].includes(sub.status) ? 'done' : (sub ? 'active' : 'pending');
                    return (
                        <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`}>
                            <div className="vp-curr-item__icon">{stateKey === 'done' ? <CheckCircle size={15} /> : (stateKey === 'active' ? <Clock size={15} /> : <AlertCircle size={15} />)}</div>
                            <div className="vp-curr-item__info"><span className="vp-curr-item__code">{mod.code || `M${idx + 1}`}</span><span className="vp-curr-item__name">{mod.name}</span></div>
                            <div className="vp-curr-item__badge">{sub ? getStatusBadge(sub) : <span className="vp-badge vp-badge--none">Not Assigned</span>}</div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    const renderDocRow = (title: string, docType: string, url?: string) => (
        <div className="vp-doc-row">
            <div className="vp-doc-info">
                <div className={`vp-doc-icon ${url ? 'uploaded' : 'missing'}`}><FileText size={20} /></div>
                <div className="vp-doc-text"><h4>{title}</h4><span className={url ? 'status-uploaded' : 'status-missing'}>{url ? 'Verified' : 'Missing'}</span></div>
            </div>
            {url && <a href={url} target="_blank" rel="noreferrer" className="vp-btn-view"><Eye size={14} /> View</a>}
        </div>
    );

    if (learnersLoading && !enrollment) return <div className="admin-layout vp-full-screen"><main className="vp-centered"><Loader2 size={40} className="animate-spin" /></main></div>;
    if (!enrollment) return <div className="admin-layout vp-full-screen"><main className="main-wrapper"><PageHeader title="Portfolio Not Found" onBack={() => navigate(-1)} /></main></div>;

    const filteredSubmissions = submissions.filter(sub => activeTab === 'overview' ? true : (sub.moduleType || 'knowledge') === activeTab);

    return (
        <div className="admin-layout vp-full-screen">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
            <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />

            <main className="main-wrapper vp-scroll-area">
                {remediationTarget && <RemediationModal submissionTitle={remediationTarget.title} attemptNumber={remediationTarget.attemptNumber || 1} onClose={() => setRemediationTarget(null)} onSubmit={executeRemediation} />}

                <PageHeader theme={user?.role === 'learner' ? 'student' : 'default'} variant="hero" title={enrollment.fullName} eyebrow="Portfolio of Evidence" description={matchingProgramme?.name || "Qualification"} onBack={() => navigate(-1)} status={{ label: enrollment.status?.toUpperCase(), variant: enrollment.status === 'active' ? 'active' : 'warning' }} />

                <div className="admin-content vp-content">
                    <div className="vp-profile-card">
                        <div className="vp-profile-card__avatar">{(enrollment as any).profilePhotoUrl ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" /> : <User size={34} />}</div>
                        <div className="vp-profile-card__info"><h2 className="vp-profile-card__name">{enrollment.fullName}</h2><div className="vp-profile-card__meta"><span><strong>ID:</strong> {enrollment.idNumber}</span><span><Calendar size={12} /> {new Date(enrollment.trainingStartDate).toLocaleDateString()}</span></div></div>
                        <div className="vp-profile-card__status"><span className="vp-profile-card__status-label">Course Status</span><span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>{enrollment.status?.toUpperCase()}</span></div>
                    </div>

                    <div className="vp-tab-bar">
                        {TABS.map(tab => (
                            <button key={tab.id} className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.icon} <span>{tab.label}</span></button>
                        ))}
                    </div>

                    {activeTab === 'overview' && (
                        <div className="vp-panel vp-panel--padded">
                            {user?.role !== 'learner' && <PoEGenerator learnerId={enrollment.learnerId || enrollment.id} requestedByUid={user?.uid || ''} />}
                            <div className="vp-overview-grid">
                                <div className="vp-overview-card">
                                    <h3 className="vp-overview-card__title"><BarChart2 size={14} /> Pipeline Progress</h3>
                                    <div className="vp-pipeline">
                                        {renderPipelineBar('Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
                                        {renderPipelineBar('Facilitator Review', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
                                        {renderPipelineBar('Assessor Graded', pipelineStats.graded, pipelineStats.total, 'amber')}
                                        {renderPipelineBar('Moderated', pipelineStats.moderated, pipelineStats.total, 'green')}
                                    </div>
                                </div>
                                <div className="vp-overview-card">
                                    <h3 className="vp-overview-card__title"><BookOpen size={14} /> Curriculum Map</h3>
                                    {!matchingProgramme ? <div className="vp-empty-state"><AlertCircle size={32} /><p>No Blueprint Linked</p></div> : (
                                        <div className="vp-curr-sections">
                                            <div className="vp-curr-group"><span className="vp-curr-group__label">Knowledge</span>{renderCurriculumGroup(matchingProgramme.knowledgeModules, 'K')}</div>
                                            <div className="vp-curr-group"><span className="vp-curr-group__label">Practical</span>{renderCurriculumGroup(matchingProgramme.practicalModules, 'P')}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab !== 'overview' && activeTab !== 'compliance' && (
                        <div className="vp-panel">
                            {loadingSubmissions ? <div className="vp-empty-state"><Loader2 className="animate-spin" /></div> : filteredSubmissions.length === 0 ? <div className="vp-empty-state"><FileText size={40} /><p>No Assessments Found</p></div> : (
                                <div className="vp-table-scroll">
                                    <table className="vp-table">
                                        <thead><tr><th className="vp-th">Assessment</th><th className="vp-th vp-th--narrow">Status</th><th className="vp-th vp-th--action" /></tr></thead>
                                        <tbody>
                                            {filteredSubmissions.map(sub => {
                                                const isNYC = sub.status === 'moderated' && sub.competency === 'NYC' && user?.role !== 'learner';
                                                return (
                                                    <tr key={sub.id} className="vp-tr">
                                                        <td className="vp-td"><span className="vp-cell-title">{sub.title}</span><br /><small>{sub.moduleNumber}</small></td>
                                                        <td className="vp-td">{getStatusBadge(sub)}</td>
                                                        <td className="vp-td vp-td--action">
                                                            <button
                                                                className={`vp-action-btn ${isNYC ? 'vp-action-btn--primary' : 'vp-action-btn--outline'}`}
                                                                style={isNYC ? { background: '#f59e0b', color: 'white', border: 'none' } : {}}
                                                                onClick={() => isNYC ? setRemediationTarget(sub) : navigate(user?.role === 'learner' ? `/learner/assessment/${sub.assessmentId}` : `/portfolio/submission/${sub.id}`)}
                                                            >
                                                                {remediatingId === sub.id ? <Loader2 className="animate-spin" size={14} /> : (isNYC ? 'Remediate' : 'View')}
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
                        <div className="vp-panel vp-panel--padded">
                            <div className="vp-doc-grid">
                                {renderDocRow('National ID', 'idUrl', (enrollment as any).documents?.idUrl)}
                                {renderDocRow('CV', 'cvUrl', (enrollment as any).documents?.cvUrl)}
                                {renderDocRow('Qualification', 'qualUrl', (enrollment as any).documents?.qualUrl)}
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default ViewPortfolio;




// import React, { useEffect, useState, useMemo } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import {
//     User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
//     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
//     ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
//     Upload, RotateCcw, MessageSquare, Download, AlertTriangle
// } from 'lucide-react';
// import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, onSnapshot, orderBy, limit, addDoc } from 'firebase/firestore';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { signOut } from 'firebase/auth';
// import { auth, db, storage } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar';
// import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
// import { createPortal } from 'react-dom';
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
//     attemptNumber?: number;
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

// // ─── POE GENERATOR COMPONENT ───
// const PoEGenerator: React.FC<{ learnerId: string, requestedByUid: string }> = ({ learnerId, requestedByUid }) => {
//     const [generating, setGenerating] = useState(false);
//     const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
//     const toast = useToast();

//     // Listen for changes in the export request document
//     useEffect(() => {
//         if (!learnerId) return;

//         // Query the latest request for this learner
//         const q = query(
//             collection(db, 'poe_export_requests'),
//             where('learnerId', '==', learnerId),
//             orderBy('requestedAt', 'desc'),
//             limit(1)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             if (!snapshot.empty) {
//                 const data = snapshot.docs[0].data();

//                 if (data.status === 'processing') {
//                     setGenerating(true);
//                 } else if (data.status === 'completed') {
//                     setGenerating(false);
//                     setDownloadUrl(data.downloadUrl);
//                     if (!downloadUrl) { // Only toast once when it flips to completed
//                         toast.success("Master PoE is ready for download!");
//                     }
//                 } else if (data.status === 'error') {
//                     setGenerating(false);
//                     toast.error("Failed to generate PoE: " + data.errorMessage);
//                 }
//             }
//         });

//         return () => unsubscribe();
//     }, [learnerId, downloadUrl, toast]);

//     const handleGeneratePoE = async () => {
//         setGenerating(true);
//         setDownloadUrl(null);
//         toast.info("Initializing PoE generation in the cloud. This may take a minute...");

//         try {
//             // Write to Firestore to trigger the backend Cloud Function
//             await addDoc(collection(db, 'poe_export_requests'), {
//                 learnerId: learnerId,
//                 requestedBy: requestedByUid,
//                 status: 'processing',
//                 requestedAt: new Date().toISOString()
//             });
//         } catch (error) {
//             console.error("Error starting generation", error);
//             toast.error("Failed to request PoE generation.");
//             setGenerating(false);
//         }
//     };

//     return (
//         <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
//                 <div>
//                     <h3 style={{ margin: '0 0 8px 0', color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
//                         <FileText size={20} color="#0284c7" />
//                         Master Portfolio of Evidence
//                     </h3>
//                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
//                         Generate a complete, QCTO-compliant PDF containing the learner's profile, Statement of Results, and all signed modules.
//                     </p>
//                 </div>

//                 <div style={{ display: 'flex', gap: '10px' }}>
//                     {generating ? (
//                         <button disabled style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#e2e8f0', color: '#64748b', padding: '10px 16px', borderRadius: '6px', border: 'none', fontWeight: 'bold' }}>
//                             <Loader2 size={16} className="vp-spin" /> Compiling PDF...
//                         </button>
//                     ) : downloadUrl ? (
//                         <>
//                             <a
//                                 href={downloadUrl}
//                                 target="_blank"
//                                 rel="noreferrer"
//                                 style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#16a34a', color: 'white', padding: '10px 16px', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}
//                             >
//                                 <Download size={16} /> Download Latest PoE
//                             </a>
//                             <button onClick={handleGeneratePoE} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid #cbd5e1', color: '#475569', padding: '10px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
//                                 Regenerate
//                             </button>
//                         </>
//                     ) : (
//                         <button onClick={handleGeneratePoE} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#0284c7', color: 'white', padding: '10px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.85rem' }}>
//                             <FileText size={16} /> Generate Master PoE
//                         </button>
//                     )}
//                 </div>
//             </div>

//             <div style={{ marginTop: '15px', background: '#fffbeb', padding: '10px', borderRadius: '6px', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.8rem', color: '#b45309' }}>
//                 <AlertTriangle size={16} />
//                 <span><strong>Compliance Note:</strong> Ensure all modules are marked as "Moderated" before generating the final export for an auditor. An email will be sent to you when generation completes.</span>
//             </div>
//         </div>
//     );
// };

// // ─── CUSTOM REMEDIATION MODAL COMPONENT ───
// const RemediationModal: React.FC<{
//     submissionTitle: string;
//     attemptNumber: number;
//     onClose: () => void;
//     onSubmit: (date: string, notes: string) => void;
// }> = ({ submissionTitle, attemptNumber, onClose, onSubmit }) => {
//     const [date, setDate] = useState('');
//     const [notes, setNotes] = useState('');
//     const [confirmed, setConfirmed] = useState(false);

//     useEffect(() => {
//         const style = document.createElement('style');
//         style.innerHTML = `body, html { overflow: hidden !important; }`;
//         document.head.appendChild(style);
//         return () => { document.head.removeChild(style); };
//     }, []);

//     const handleSubmit = (e: React.FormEvent) => {
//         e.preventDefault();
//         if (!date || !notes.trim() || !confirmed) return;
//         onSubmit(date, notes);
//     };

//     const isFinalAttempt = attemptNumber === 2;

//     return createPortal(
//         <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,46,58,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)', padding: '1rem' }}>
//             <div className="animate-fade-in" style={{ background: 'white', maxWidth: '500px', width: '100%', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', borderTop: isFinalAttempt ? '6px solid #ef4444' : '6px solid #f59e0b' }}>
//                 <div style={{ padding: '1.5rem', borderBottom: '1px solid #e2e8f0', background: isFinalAttempt ? '#fef2f2' : '#fffbeb' }}>
//                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                         <div style={{ background: isFinalAttempt ? '#ef4444' : '#f59e0b', padding: '10px', borderRadius: '50%', color: 'white' }}>
//                             <RotateCcw size={24} />
//                         </div>
//                         <div>
//                             <h2 style={{ margin: 0, fontSize: '1.25rem', color: isFinalAttempt ? '#b91c1c' : '#b45309', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 Initiate Remediation {isFinalAttempt && "(FINAL ATTEMPT)"}
//                             </h2>
//                             <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: isFinalAttempt ? '#991b1b' : '#92400e' }}>{submissionTitle}</p>
//                         </div>
//                     </div>
//                 </div>

//                 <form onSubmit={handleSubmit} style={{ padding: '1.5rem' }}>
//                     <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
//                         {isFinalAttempt
//                             ? "WARNING: This will unlock the learner's 3rd and final attempt. A rigorous intervention is required."
//                             : "QCTO regulations require evidence of a developmental intervention before a learner can attempt an assessment again. Please log the coaching session details below."}
//                     </p>

//                     <div style={{ marginBottom: '1rem' }}>
//                         <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>Date of Coaching / Feedback Session *</label>
//                         <input type="date" required value={date} onChange={e => setDate(e.target.value)} max={new Date().toISOString().split('T')[0]} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none' }} />
//                     </div>

//                     <div style={{ marginBottom: '1.5rem' }}>
//                         <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: '#334155', marginBottom: '6px' }}>
//                             <MessageSquare size={14} color="#64748b" /> Coaching Notes / Areas Addressed *
//                         </label>
//                         <textarea required rows={3} placeholder={isFinalAttempt ? "Describe the rigorous intervention applied..." : "Briefly describe what was discussed..."} value={notes} onChange={e => setNotes(e.target.value)} style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.9rem', outline: 'none', resize: 'vertical' }} />
//                     </div>

//                     <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#f8fafc', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer', marginBottom: '1.5rem' }}>
//                         <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: isFinalAttempt ? '#ef4444' : '#f59e0b' }} />
//                         <span style={{ fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
//                             <strong>I legally declare</strong> that an academic intervention has taken place and this learner is ready for their next attempt.
//                         </span>
//                     </label>

//                     <div style={{ display: 'flex', gap: '1rem' }}>
//                         <button type="button" onClick={onClose} style={{ flex: 1, padding: '0.75rem', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
//                         <button type="submit" disabled={!date || !notes.trim() || !confirmed} style={{ flex: 2, padding: '0.75rem', background: isFinalAttempt ? '#ef4444' : '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: (!date || !notes.trim() || !confirmed) ? 'not-allowed' : 'pointer', fontWeight: 'bold', opacity: (!date || !notes.trim() || !confirmed) ? 0.5 : 1 }}>
//                             Log Coaching & Unlock
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>, document.body
//     );
// };

// export const ViewPortfolio: React.FC = () => {
//     const { id: routeId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();
//     const toast = useToast();

//     const targetCohortId = (location.state as any)?.cohortId;

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

//     const [remediatingId, setRemediatingId] = useState<string | null>(null);
//     const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);

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

//     const enrollmentId = enrollment?.id;
//     const enrollmentLearnerId = enrollment?.learnerId;
//     const enrollmentCohortId = enrollment?.cohortId;
//     const enrollmentSaqaId = enrollment?.qualification?.saqaId;
//     const enrollmentQualName = enrollment?.qualification?.name;

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
//     }, [enrollmentId, enrollmentLearnerId, enrollmentCohortId, targetCohortId]);

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
//             await updateLearner(targetId, { documents: { ...currentDocs, [docType]: downloadUrl } } as any);
//             toast.success("Document uploaded successfully!");
//         } catch (error) {
//             toast.error("Failed to upload document. Please try again.");
//         } finally {
//             setUploadingDoc(null);
//             e.target.value = '';
//         }
//     };

//     const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
//         if (!remediationTarget) return;
//         const sub = remediationTarget;
//         setRemediationTarget(null);
//         setRemediatingId(sub.id);

//         try {
//             const historyRef = doc(collection(db, 'learner_submissions', sub.id, 'history'));
//             await setDoc(historyRef, {
//                 ...sub,
//                 archivedAt: new Date().toISOString(),
//                 snapshotReason: 'Remediation requested after NYC outcome',
//                 coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
//             });

//             await updateDoc(doc(db, 'learner_submissions', sub.id), {
//                 status: 'in_progress',
//                 competency: deleteField(),
//                 grading: deleteField(),
//                 moderation: deleteField(),
//                 submittedAt: deleteField(),
//                 learnerDeclaration: deleteField(),
//                 attemptNumber: (sub.attemptNumber || 1) + 1,
//                 lastStaffEditAt: new Date().toISOString(),
//                 latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorName: user?.fullName }
//             });

//             setSubmissions(prev => prev.map(s => s.id === sub.id ? {
//                 ...s, status: 'in_progress', competency: undefined, grading: undefined, moderation: undefined, attemptNumber: (s.attemptNumber || 1) + 1
//             } : s));

//             toast.success("Coaching logged & workbook unlocked!");
//         } catch (err) {
//             toast.error("Failed to unlock for remediation.");
//         } finally {
//             setRemediatingId(null);
//         }
//     };

//     const handleActionClick = (sub: LearnerSubmission) => {
//         const isStaff = user?.role !== 'learner';
//         const currentAttempt = sub.attemptNumber || 1;
//         const isEligibleForRemediation = isStaff && sub.status === 'moderated' && sub.competency === 'NYC' && (user?.role === 'facilitator' || user?.role === 'admin') && currentAttempt < 3;

//         if (isEligibleForRemediation) {
//             setRemediationTarget(sub);
//             return;
//         }

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
//                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress {sub.attemptNumber && sub.attemptNumber > 1 ? `(Attempt ${sub.attemptNumber})` : ''}</span>;
//             default:
//                 return <span className="vp-badge vp-badge--none">Not Started</span>;
//         }
//     };

//     const getActionContent = (sub: LearnerSubmission) => {
//         const role = user?.role || 'learner';
//         if (remediatingId === sub.id) return <><Loader2 size={12} className="vp-spin" /> Processing...</>;

//         if (role === 'learner') {
//             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
//             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
//             return <><Eye size={12} /> View Results</>;
//         }

//         const currentAttempt = sub.attemptNumber || 1;
//         if (sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin')) {
//             if (currentAttempt >= 3) return <><Eye size={12} /> Locked (Max Attempts)</>;
//             return <><RotateCcw size={12} /> Start Remediation</>;
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
//                     <div className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`} style={{ width: `${pct}%` } as React.CSSProperties} />
//                 </div>
//             </div>
//         );
//     };

//     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
//         if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
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
//                         <span className={url ? 'status-uploaded' : 'status-missing'}>{url ? 'Uploaded & Verified' : 'Missing Document'}</span>
//                     </div>
//                 </div>
//                 <div className="vp-doc-actions">
//                     {url && <a href={url} target="_blank" rel="noopener noreferrer" className="vp-btn-view"><Eye size={14} /> View</a>}
//                     {isStaff && (
//                         <label className={`vp-btn-upload ${isUploading ? 'disabled' : ''}`}>
//                             {isUploading ? <Loader2 size={14} className="vp-spin" /> : <Upload size={14} />}
//                             {url ? 'Replace' : 'Upload'}
//                             <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleDocumentUpload(e, docType)} disabled={isUploading} style={{ display: 'none' }} />
//                         </label>
//                     )}
//                 </div>
//             </div>
//         );
//     };

//     if (learnersLoading && !enrollment) return (
//         <div className="admin-layout vp-full-screen">
//             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//             <main className="main-wrapper vp-centered"><Loader2 size={40} className="vp-spin" /><span className="vp-loading-label">Initializing Secure Portfolio…</span></main>
//         </div>
//     );

//     if (!enrollment) return (
//         <div className="admin-layout vp-full-screen">
//             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//             <main className="main-wrapper" style={{ padding: '2rem' }}>
//                 <PageHeader theme={(user?.role as any) || 'default'} variant="compact" title="Record Not Found" onBack={() => navigate(-1)} backLabel="Back to Safety" />
//                 <div className="vp-empty-state vp-empty-state--error"><AlertCircle size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__text">This portfolio could not be located. It may belong to a different course or have been archived.</p></div>
//             </main>
//         </div>
//     );

//     const filteredSubmissions = submissions.filter(sub => {
//         const subType = (sub.moduleType || 'knowledge').toLowerCase();
//         if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
//         return subType === activeTab;
//     });

//     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';
//     const learnerDocs = (enrollment as any).documents || {};

//     return (
//         <div className="admin-layout vp-full-screen">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
//             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />

//             <main className="main-wrapper vp-scroll-area">
//                 {remediationTarget && (
//                     <RemediationModal
//                         submissionTitle={remediationTarget.title}
//                         attemptNumber={remediationTarget.attemptNumber || 1}
//                         onClose={() => setRemediationTarget(null)}
//                         onSubmit={executeRemediation}
//                     />
//                 )}

//                 <PageHeader theme={headerTheme} variant="hero" eyebrow="Portfolio of Evidence" title={enrollment.fullName} description={headerCourseName} onBack={() => navigate(-1)} status={{ label: enrollment.status?.toUpperCase(), variant: enrollment.status === 'active' ? 'active' : 'warning' }} />

//                 <div className="admin-content vp-content">
//                     <div className="vp-profile-card">
//                         <div className="vp-profile-card__avatar">
//                             {(enrollment as any).profilePhotoUrl ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" /> : <User size={34} className="vp-profile-card__avatar-icon" />}
//                         </div>
//                         <div className="vp-profile-card__info">
//                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
//                             <div className="vp-profile-card__meta">
//                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
//                                 <span><Calendar size={12} /> Enrolled: {new Date(enrollment.trainingStartDate).toLocaleDateString()}</span>
//                                 <span className="vp-ref-tag"><History size={11} /> Ref: {enrollment.enrollmentId?.slice(-6) || enrollment.id?.slice(-6)}</span>
//                             </div>
//                         </div>
//                         <div className="vp-profile-card__status">
//                             <span className="vp-profile-card__status-label">Course Status</span>
//                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>{enrollment.status?.toUpperCase()}</span>
//                         </div>
//                     </div>

//                     <div className="vp-tab-bar">
//                         {TABS.map(tab => (
//                             <button key={tab.id} className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
//                                 {tab.icon} <span>{tab.label}</span>
//                             </button>
//                         ))}
//                     </div>

//                     {activeTab === 'overview' && (
//                         <div className="vp-panel vp-panel--padded">

//                             {/* 🚀 THE NEW POE GENERATOR TRIGGER 🚀 */}
//                             {user?.role !== 'learner' && (
//                                 <PoEGenerator learnerId={enrollment.learnerId || enrollment.id} requestedByUid={user?.uid || ''} />
//                             )}

//                             <div className="vp-overview-grid">
//                                 <div className="vp-overview-card">
//                                     <h3 className="vp-overview-card__title"><BarChart2 size={14} /> Assessment Pipeline</h3>
//                                     {pipelineStats.total === 0 ? (
//                                         <div className="vp-empty-state">
//                                             <BarChart2 size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Assigned</p><p className="vp-empty-state__text">No assessments have been published for this specific class yet.</p>
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
//                                     <h3 className="vp-overview-card__title"><BookOpen size={14} /> Curriculum Coverage Map</h3>
//                                     {!matchingProgramme ? (
//                                         <div className="vp-empty-state">
//                                             <AlertCircle size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Blueprint Linked</p><p className="vp-empty-state__text">No curriculum blueprint is linked to this specific class instance.</p>
//                                         </div>
//                                     ) : (
//                                         <div className="vp-curr-sections">
//                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Knowledge Modules</span>{renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}</div>
//                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Practical Modules</span>{renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}</div>
//                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Workplace Modules</span>{renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}</div>
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab !== 'overview' && activeTab !== 'compliance' && (
//                         <div className="vp-panel">
//                             {loadingSubmissions ? (
//                                 <div className="vp-empty-state"><Loader2 size={28} className="vp-spin" /><span className="vp-empty-state__text">Filtering Course Assignments…</span></div>
//                             ) : filteredSubmissions.length === 0 ? (
//                                 <div className="vp-empty-state">
//                                     <FileText size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Found</p><p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
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
//                                             {filteredSubmissions.map(sub => {
//                                                 const role = user?.role;
//                                                 const currentAttempt = sub.attemptNumber || 1;
//                                                 const isRemediationAction = sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin');
//                                                 const isMaxAttempts = currentAttempt >= 3;

//                                                 const rowActionClass = (isActionRequired(sub) || (isRemediationAction && !isMaxAttempts)) ? 'vp-tr--action' : '';
//                                                 let btnClass = 'vp-action-btn--outline';
//                                                 let btnStyle: React.CSSProperties = {};

//                                                 if (isActionRequired(sub)) btnClass = 'vp-action-btn--primary';
//                                                 if (isRemediationAction) {
//                                                     if (isMaxAttempts) {
//                                                         btnStyle = { background: '#fef2f2', color: '#ef4444', borderColor: '#ef4444' };
//                                                     } else {
//                                                         btnClass = 'vp-action-btn--primary';
//                                                         btnStyle = { background: '#f59e0b', color: 'white', borderColor: '#f59e0b' };
//                                                     }
//                                                 }

//                                                 return (
//                                                     <tr key={sub.id} className={`vp-tr ${rowActionClass}`}>
//                                                         <td className="vp-td">
//                                                             <span className="vp-cell-title">{sub.title}</span>
//                                                             <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
//                                                         </td>
//                                                         <td className="vp-td"><span className="vp-cell-type">{sub.type}</span></td>
//                                                         <td className="vp-td">{renderTimeRemaining(sub)}</td>
//                                                         <td className="vp-td">{getStatusBadge(sub)}</td>
//                                                         <td className="vp-td vp-td--action">
//                                                             <button className={`vp-action-btn ${btnClass}`} style={btnStyle} onClick={() => handleActionClick(sub)} disabled={remediatingId === sub.id}>
//                                                                 {getActionContent(sub)}
//                                                             </button>
//                                                         </td>
//                                                     </tr>
//                                                 );
//                                             })}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     {activeTab === 'compliance' && (
//                         <div className="vp-panel vp-panel--padded animate-fade-in">
//                             <div className="vp-compliance-header">
//                                 <div className="vp-compliance-title"><FileBadge size={28} className="vp-compliance-icon" /><div><h3>Compliance Vault</h3><p>Mandatory KYC & QCTO documentation for <strong>{enrollment.fullName}</strong>.</p></div></div>
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

// export default ViewPortfolio;




// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useParams, useNavigate, useLocation } from 'react-router-dom';
// // import {
// //     User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
// //     BookOpen, Briefcase, FileBadge, Eye, Play, Edit3, Timer,
// //     ShieldCheck, Award, PenTool, Scale, History, Loader2, BarChart2,
// //     Upload, RotateCcw, MessageSquare
// // } from 'lucide-react';
// // import { collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteField } from 'firebase/firestore';
// // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { signOut } from 'firebase/auth';
// // import { auth, db, storage } from '../../lib/firebase';
// // import { useStore } from '../../store/useStore';
// // import { Sidebar } from '../../components/dashboard/Sidebar';
// // import { PageHeader } from '../../components/common/PageHeader/PageHeader';
// // import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
// // import { createPortal } from 'react-dom';
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
// //     attemptNumber?: number;
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

// // // ─── CUSTOM REMEDIATION MODAL COMPONENT ───
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

// //     return createPortal(
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
// //         </div>, document.body
// //     );
// // };


// // export const ViewPortfolio: React.FC = () => {
// //     const { id: routeId } = useParams();
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const toast = useToast();

// //     const targetCohortId = (location.state as any)?.cohortId;

// //     const user = useStore(state => state.user);
// //     const learners = useStore(state => state.learners);
// //     const learnersLoading = useStore(state => state.learnersLoading);
// //     const programmes = useStore(state => state.programmes);
// //     const cohorts = useStore(state => state.cohorts);
// //     const fetchLearners = useStore(state => state.fetchLearners);
// //     const fetchProgrammes = useStore(state => state.fetchProgrammes);
// //     const fetchCohorts = useStore(state => state.fetchCohorts);
// //     const updateLearner = useStore(state => state.updateLearner);

// //     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
// //     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
// //     const [activeTab, setActiveTab] = useState<TabId>('overview');
// //     const [timeOffset, setTimeOffset] = useState(0);
// //     const [currentTimeTick, setCurrentTimeTick] = useState(Date.now());
// //     const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

// //     const [remediatingId, setRemediatingId] = useState<string | null>(null);
// //     const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);

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

// //     const enrollment = useMemo(() => {
// //         if (!routeId) return undefined;
// //         const humanRecords = learners.filter(l => l.enrollmentId === routeId || l.learnerId === routeId || l.id === routeId);
// //         if (humanRecords.length === 0) return undefined;
// //         if (targetCohortId) {
// //             const exactMatch = humanRecords.find(l => l.cohortId === targetCohortId);
// //             if (exactMatch) return exactMatch;
// //             return { ...humanRecords[0], cohortId: targetCohortId };
// //         }
// //         let match = humanRecords.find(l => l.enrollmentId === routeId && l.id !== l.learnerId);
// //         if (match) return match;
// //         return humanRecords.find(e => e.status !== 'dropped') || humanRecords[0];
// //     }, [learners, routeId, targetCohortId]);

// //     const enrollmentId = enrollment?.id;
// //     const enrollmentLearnerId = enrollment?.learnerId;
// //     const enrollmentCohortId = enrollment?.cohortId;
// //     const enrollmentSaqaId = enrollment?.qualification?.saqaId;
// //     const enrollmentQualName = enrollment?.qualification?.name;

// //     const matchingProgramme = useMemo(() => {
// //         if (programmes.length === 0) return null;
// //         const activeCohortId = targetCohortId || enrollmentCohortId;
// //         if (activeCohortId && cohorts.length > 0) {
// //             const linkedCohort = cohorts.find(c => c.id === activeCohortId);
// //             const templateId = (linkedCohort as any)?.programmeId || (linkedCohort as any)?.qualificationId;
// //             if (templateId) {
// //                 const prog = programmes.find(p => p.id === templateId);
// //                 if (prog) return prog;
// //             }
// //         }
// //         if (enrollmentSaqaId) {
// //             const targetSaqa = String(enrollmentSaqaId).trim();
// //             if (targetSaqa) {
// //                 const progMatch = programmes.find(p => String(p.saqaId || '').trim() === targetSaqa);
// //                 if (progMatch) return progMatch;
// //             }
// //         }
// //         return null;
// //     }, [programmes, cohorts, enrollmentCohortId, targetCohortId, enrollmentSaqaId]);

// //     const headerCourseName = matchingProgramme?.name || enrollmentQualName || 'Unassigned Qualification';

// //     useEffect(() => {
// //         let isMounted = true;
// //         const load = async () => {
// //             if (!enrollmentId && !enrollmentLearnerId) return;
// //             setLoadingSubmissions(true);
// //             try {
// //                 const subRef = collection(db, 'learner_submissions');
// //                 const humanId = enrollmentLearnerId || enrollmentId;
// //                 const activeCohortId = targetCohortId || enrollmentCohortId;

// //                 let q;
// //                 if (activeCohortId && activeCohortId !== 'Unassigned') {
// //                     q = query(subRef, where('learnerId', '==', humanId), where('cohortId', '==', activeCohortId));
// //                 } else {
// //                     q = query(subRef, where('learnerId', '==', humanId));
// //                 }

// //                 let snap = await getDocs(q);
// //                 let subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));

// //                 const cache = new Map<string, number | undefined>();
// //                 for (let i = 0; i < subs.length; i++) {
// //                     const sub = subs[i];
// //                     if (!cache.has(sub.assessmentId)) {
// //                         const tSnap = await getDoc(doc(db, 'assessments', sub.assessmentId));
// //                         cache.set(sub.assessmentId, tSnap.exists() ? tSnap.data().moduleInfo?.timeLimit : undefined);
// //                     }
// //                     subs[i].timeLimit = cache.get(sub.assessmentId);
// //                 }

// //                 if (isMounted) {
// //                     subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
// //                     setSubmissions(subs);
// //                 }
// //             } catch (err) {
// //                 if (isMounted) console.error('Error fetching submissions:', err);
// //             } finally {
// //                 if (isMounted) setLoadingSubmissions(false);
// //             }
// //         };
// //         load();
// //         return () => { isMounted = false; };
// //     }, [enrollmentId, enrollmentLearnerId, enrollmentCohortId, targetCohortId]);

// //     const pipelineStats = useMemo(() => {
// //         const total = submissions.length;
// //         if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
// //         return {
// //             total,
// //             submitted: submissions.filter(s => !['not_started', 'in_progress'].includes(s.status)).length,
// //             facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed', 'returned'].includes(s.status)).length,
// //             graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
// //             moderated: submissions.filter(s => s.status === 'moderated').length,
// //         };
// //     }, [submissions]);

// //     const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>, docType: 'idUrl' | 'cvUrl' | 'qualUrl') => {
// //         const file = e.target.files?.[0];
// //         if (!file || !enrollment) return;

// //         setUploadingDoc(docType);
// //         try {
// //             const ext = file.name.split('.').pop();
// //             const targetId = enrollment.learnerId || enrollment.id;
// //             const storageRef = ref(storage, `learners/${targetId}/${docType}_${Date.now()}.${ext}`);
// //             const snapshot = await uploadBytes(storageRef, file);
// //             const downloadUrl = await getDownloadURL(snapshot.ref);

// //             const currentDocs = (enrollment as any).documents || {};
// //             await updateLearner(targetId, { documents: { ...currentDocs, [docType]: downloadUrl } } as any);
// //             toast.success("Document uploaded successfully!");
// //         } catch (error) {
// //             toast.error("Failed to upload document. Please try again.");
// //         } finally {
// //             setUploadingDoc(null);
// //             e.target.value = '';
// //         }
// //     };

// //     const executeRemediation = async (coachingDate: string, coachingNotes: string) => {
// //         if (!remediationTarget) return;
// //         const sub = remediationTarget;
// //         setRemediationTarget(null);
// //         setRemediatingId(sub.id);

// //         try {
// //             const historyRef = doc(collection(db, 'learner_submissions', sub.id, 'history'));
// //             await setDoc(historyRef, {
// //                 ...sub,
// //                 archivedAt: new Date().toISOString(),
// //                 snapshotReason: 'Remediation requested after NYC outcome',
// //                 coachingLog: { date: coachingDate, notes: coachingNotes, facilitatorId: user?.uid, facilitatorName: user?.fullName }
// //             });

// //             await updateDoc(doc(db, 'learner_submissions', sub.id), {
// //                 status: 'in_progress',
// //                 competency: deleteField(),
// //                 grading: deleteField(),
// //                 moderation: deleteField(),
// //                 submittedAt: deleteField(),
// //                 learnerDeclaration: deleteField(),
// //                 attemptNumber: (sub.attemptNumber || 1) + 1,
// //                 lastStaffEditAt: new Date().toISOString(),
// //                 latestCoachingLog: { date: coachingDate, notes: coachingNotes, facilitatorName: user?.fullName }
// //             });

// //             setSubmissions(prev => prev.map(s => s.id === sub.id ? {
// //                 ...s, status: 'in_progress', competency: undefined, grading: undefined, moderation: undefined, attemptNumber: (s.attemptNumber || 1) + 1
// //             } : s));

// //             toast.success("Coaching logged & workbook unlocked!");
// //         } catch (err) {
// //             toast.error("Failed to unlock for remediation.");
// //         } finally {
// //             setRemediatingId(null);
// //         }
// //     };

// //     const handleActionClick = (sub: LearnerSubmission) => {
// //         const isStaff = user?.role !== 'learner';
// //         const currentAttempt = sub.attemptNumber || 1;
// //         const isEligibleForRemediation = isStaff && sub.status === 'moderated' && sub.competency === 'NYC' && (user?.role === 'facilitator' || user?.role === 'admin') && currentAttempt < 3;

// //         if (isEligibleForRemediation) {
// //             setRemediationTarget(sub);
// //             return;
// //         }

// //         if (user?.role === 'learner') navigate(`/learner/assessment/${sub.assessmentId}`);
// //         else navigate(`/portfolio/submission/${sub.id}`);
// //     };

// //     const isActionRequired = (sub: LearnerSubmission) => {
// //         const role = user?.role;
// //         return (role === 'facilitator' && sub.status === 'submitted') ||
// //             (role === 'assessor' && (sub.status === 'facilitator_reviewed' || sub.status === 'returned')) ||
// //             (role === 'moderator' && sub.status === 'graded');
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
// //             case 'returned':
// //                 return <span className="vp-badge vp-badge--warning"><AlertCircle size={11} /> Returned to Assessor</span>;
// //             case 'facilitator_reviewed':
// //                 return <span className="vp-badge vp-badge--progress"><PenTool size={11} /> Grading Pending</span>;
// //             case 'submitted':
// //                 return role === 'facilitator' || role === 'admin'
// //                     ? <span className="vp-badge vp-badge--action"><PenTool size={11} /> Needs Marking</span>
// //                     : <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
// //             case 'in_progress':
// //                 return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress {sub.attemptNumber && sub.attemptNumber > 1 ? `(Attempt ${sub.attemptNumber})` : ''}</span>;
// //             default:
// //                 return <span className="vp-badge vp-badge--none">Not Started</span>;
// //         }
// //     };

// //     const getActionContent = (sub: LearnerSubmission) => {
// //         const role = user?.role || 'learner';
// //         if (remediatingId === sub.id) return <><Loader2 size={12} className="vp-spin" /> Processing...</>;

// //         if (role === 'learner') {
// //             if (sub.status === 'not_started') return <><Play size={12} /> Start</>;
// //             if (sub.status === 'in_progress') return <><Edit3 size={12} /> Resume</>;
// //             return <><Eye size={12} /> View Results</>;
// //         }

// //         const currentAttempt = sub.attemptNumber || 1;
// //         if (sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin')) {
// //             if (currentAttempt >= 3) return <><Eye size={12} /> Locked (Max Attempts)</>;
// //             return <><RotateCcw size={12} /> Start Remediation</>;
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
// //                     <div className={`vp-pipeline-fill vp-pipeline-fill--${colorKey}`} style={{ width: `${pct}%` } as React.CSSProperties} />
// //                 </div>
// //             </div>
// //         );
// //     };

// //     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
// //         if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined in curriculum.</p>;
// //         return (
// //             <ul className="vp-curr-list">
// //                 {modules.map((mod, idx) => {
// //                     const sub = submissions.find(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);
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
// //                         <span className={url ? 'status-uploaded' : 'status-missing'}>{url ? 'Uploaded & Verified' : 'Missing Document'}</span>
// //                     </div>
// //                 </div>
// //                 <div className="vp-doc-actions">
// //                     {url && <a href={url} target="_blank" rel="noopener noreferrer" className="vp-btn-view"><Eye size={14} /> View</a>}
// //                     {isStaff && (
// //                         <label className={`vp-btn-upload ${isUploading ? 'disabled' : ''}`}>
// //                             {isUploading ? <Loader2 size={14} className="vp-spin" /> : <Upload size={14} />}
// //                             {url ? 'Replace' : 'Upload'}
// //                             <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleDocumentUpload(e, docType)} disabled={isUploading} style={{ display: 'none' }} />
// //                         </label>
// //                     )}
// //                 </div>
// //             </div>
// //         );
// //     };

// //     if (learnersLoading && !enrollment) return (
// //         <div className="admin-layout vp-full-screen">
// //             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// //             <main className="main-wrapper vp-centered"><Loader2 size={40} className="vp-spin" /><span className="vp-loading-label">Initializing Secure Portfolio…</span></main>
// //         </div>
// //     );

// //     if (!enrollment) return (
// //         <div className="admin-layout vp-full-screen">
// //             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />
// //             <main className="main-wrapper" style={{ padding: '2rem' }}>
// //                 <PageHeader theme={(user?.role as any) || 'default'} variant="compact" title="Record Not Found" onBack={() => navigate(-1)} backLabel="Back to Safety" />
// //                 <div className="vp-empty-state vp-empty-state--error"><AlertCircle size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__text">This portfolio could not be located. It may belong to a different course or have been archived.</p></div>
// //             </main>
// //         </div>
// //     );

// //     const filteredSubmissions = submissions.filter(sub => {
// //         const subType = (sub.moduleType || 'knowledge').toLowerCase();
// //         if (activeTab === 'knowledge') return subType === 'knowledge' || subType === '' || !sub.moduleType;
// //         return subType === activeTab;
// //     });

// //     const headerTheme = user?.role === 'learner' ? 'student' : (user?.role as any) || 'default';
// //     const learnerDocs = (enrollment as any).documents || {};

// //     return (
// //         <div className="admin-layout vp-full-screen">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <Sidebar role={user?.role} currentNav="learners" onLogout={() => signOut(auth).then(() => navigate('/login'))} />

// //             <main className="main-wrapper vp-scroll-area">
// //                 {remediationTarget && (
// //                     <RemediationModal
// //                         submissionTitle={remediationTarget.title}
// //                         attemptNumber={remediationTarget.attemptNumber || 1}
// //                         onClose={() => setRemediationTarget(null)}
// //                         onSubmit={executeRemediation}
// //                     />
// //                 )}

// //                 <PageHeader theme={headerTheme} variant="hero" eyebrow="Portfolio of Evidence" title={enrollment.fullName} description={headerCourseName} onBack={() => navigate(-1)} status={{ label: enrollment.status?.toUpperCase(), variant: enrollment.status === 'active' ? 'active' : 'warning' }} />

// //                 <div className="admin-content vp-content">
// //                     <div className="vp-profile-card">
// //                         <div className="vp-profile-card__avatar">
// //                             {(enrollment as any).profilePhotoUrl ? <img src={(enrollment as any).profilePhotoUrl} alt="" className="vp-profile-card__avatar-img" /> : <User size={34} className="vp-profile-card__avatar-icon" />}
// //                         </div>
// //                         <div className="vp-profile-card__info">
// //                             <h2 className="vp-profile-card__name">{enrollment.fullName}</h2>
// //                             <div className="vp-profile-card__meta">
// //                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
// //                                 <span><Calendar size={12} /> Enrolled: {new Date(enrollment.trainingStartDate).toLocaleDateString()}</span>
// //                                 <span className="vp-ref-tag"><History size={11} /> Ref: {enrollment.enrollmentId?.slice(-6) || enrollment.id?.slice(-6)}</span>
// //                             </div>
// //                         </div>
// //                         <div className="vp-profile-card__status">
// //                             <span className="vp-profile-card__status-label">Course Status</span>
// //                             <span className={`vp-course-status vp-course-status--${enrollment.status === 'active' ? 'active' : 'other'}`}>{enrollment.status?.toUpperCase()}</span>
// //                         </div>
// //                     </div>

// //                     <div className="vp-tab-bar">
// //                         {TABS.map(tab => (
// //                             <button key={tab.id} className={`vp-tab ${activeTab === tab.id ? 'vp-tab--active' : ''}`} onClick={() => setActiveTab(tab.id)}>
// //                                 {tab.icon} <span>{tab.label}</span>
// //                             </button>
// //                         ))}
// //                     </div>

// //                     {activeTab === 'overview' && (
// //                         <div className="vp-panel vp-panel--padded">
// //                             <div className="vp-overview-grid">
// //                                 <div className="vp-overview-card">
// //                                     <h3 className="vp-overview-card__title"><BarChart2 size={14} /> Assessment Pipeline</h3>
// //                                     {pipelineStats.total === 0 ? (
// //                                         <div className="vp-empty-state">
// //                                             <BarChart2 size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Assigned</p><p className="vp-empty-state__text">No assessments have been published for this specific class yet.</p>
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
// //                                     <h3 className="vp-overview-card__title"><BookOpen size={14} /> Curriculum Coverage Map</h3>
// //                                     {!matchingProgramme ? (
// //                                         <div className="vp-empty-state">
// //                                             <AlertCircle size={32} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Blueprint Linked</p><p className="vp-empty-state__text">No curriculum blueprint is linked to this specific class instance.</p>
// //                                         </div>
// //                                     ) : (
// //                                         <div className="vp-curr-sections">
// //                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Knowledge Modules</span>{renderCurriculumGroup(matchingProgramme.knowledgeModules, 'Knowledge')}</div>
// //                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Practical Modules</span>{renderCurriculumGroup(matchingProgramme.practicalModules, 'Practical')}</div>
// //                                             <div className="vp-curr-group"><span className="vp-curr-group__label">Workplace Modules</span>{renderCurriculumGroup(matchingProgramme.workExperienceModules, 'Workplace')}</div>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     {activeTab !== 'overview' && activeTab !== 'compliance' && (
// //                         <div className="vp-panel">
// //                             {loadingSubmissions ? (
// //                                 <div className="vp-empty-state"><Loader2 size={28} className="vp-spin" /><span className="vp-empty-state__text">Filtering Course Assignments…</span></div>
// //                             ) : filteredSubmissions.length === 0 ? (
// //                                 <div className="vp-empty-state">
// //                                     <FileText size={40} className="vp-empty-state__icon" /><p className="vp-empty-state__title">No Assessments Found</p><p className="vp-empty-state__text">No {activeTab} records exist for this enrollment.</p>
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
// //                                             {filteredSubmissions.map(sub => {
// //                                                 const role = user?.role;
// //                                                 const currentAttempt = sub.attemptNumber || 1;
// //                                                 const isRemediationAction = sub.status === 'moderated' && sub.competency === 'NYC' && (role === 'facilitator' || role === 'admin');
// //                                                 const isMaxAttempts = currentAttempt >= 3;

// //                                                 const rowActionClass = (isActionRequired(sub) || (isRemediationAction && !isMaxAttempts)) ? 'vp-tr--action' : '';
// //                                                 let btnClass = 'vp-action-btn--outline';
// //                                                 let btnStyle: React.CSSProperties = {};

// //                                                 if (isActionRequired(sub)) btnClass = 'vp-action-btn--primary';
// //                                                 if (isRemediationAction) {
// //                                                     if (isMaxAttempts) {
// //                                                         btnStyle = { background: '#fef2f2', color: '#ef4444', borderColor: '#ef4444' };
// //                                                     } else {
// //                                                         btnClass = 'vp-action-btn--primary';
// //                                                         btnStyle = { background: '#f59e0b', color: 'white', borderColor: '#f59e0b' };
// //                                                     }
// //                                                 }

// //                                                 return (
// //                                                     <tr key={sub.id} className={`vp-tr ${rowActionClass}`}>
// //                                                         <td className="vp-td">
// //                                                             <span className="vp-cell-title">{sub.title}</span>
// //                                                             <span className="vp-cell-sub">{sub.moduleNumber || 'Module Data'}</span>
// //                                                         </td>
// //                                                         <td className="vp-td"><span className="vp-cell-type">{sub.type}</span></td>
// //                                                         <td className="vp-td">{renderTimeRemaining(sub)}</td>
// //                                                         <td className="vp-td">{getStatusBadge(sub)}</td>
// //                                                         <td className="vp-td vp-td--action">
// //                                                             <button className={`vp-action-btn ${btnClass}`} style={btnStyle} onClick={() => handleActionClick(sub)} disabled={remediatingId === sub.id}>
// //                                                                 {getActionContent(sub)}
// //                                                             </button>
// //                                                         </td>
// //                                                     </tr>
// //                                                 );
// //                                             })}
// //                                         </tbody>
// //                                     </table>
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}

// //                     {activeTab === 'compliance' && (
// //                         <div className="vp-panel vp-panel--padded animate-fade-in">
// //                             <div className="vp-compliance-header">
// //                                 <div className="vp-compliance-title"><FileBadge size={28} className="vp-compliance-icon" /><div><h3>Compliance Vault</h3><p>Mandatory KYC & QCTO documentation for <strong>{enrollment.fullName}</strong>.</p></div></div>
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
