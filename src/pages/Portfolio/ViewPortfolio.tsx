// src/pages/Portfolio/ViewPortfolio.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Play, Edit3,
    ShieldCheck, Award, Loader2, BarChart2,
    RotateCcw, Download, AlertTriangle, X, Menu
} from 'lucide-react';
import {
    collection, query, where, getDocs, doc,
    setDoc, updateDoc, deleteField, onSnapshot, addDoc
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
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
    appeal?: { status?: 'pending' | 'upheld' | 'rejected', reason?: string, date?: string };
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
    const [remediatingId, setRemediatingId] = useState<string | null>(null);
    const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);

    // Mobile Sidebar State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        fetch('https://worldtimeapi.org/api/timezone/Etc/UTC').then(r => r.json()).then(d => setTimeOffset(new Date(d.utc_datetime).getTime() - Date.now())).catch(() => setTimeOffset(0));
        const tick = setInterval(() => setCurrentTimeTick(Date.now()), 1000); return () => clearInterval(tick);
    }, []);

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
        // Check for pending appeals first
        if (sub.status === 'appealed' || sub.appeal?.status === 'pending') {
            return <span className="vp-badge" style={{ background: '#fffbeb', color: '#b45309', border: '1px solid #fcd34d' }}><AlertTriangle size={11} /> Appeal Pending</span>;
        }

        // Ensure we fall back appropriately 
        switch (sub.status) {
            case 'moderated':
                return sub.competency === 'C' ? <span className="vp-badge vp-badge--competent"><Award size={11} /> Competent</span> : <span className="vp-badge vp-badge--nyc"><AlertCircle size={11} /> NYC</span>;
            case 'graded': return <span className="vp-badge vp-badge--graded"><ShieldCheck size={11} /> QA Pending</span>;
            case 'in_progress': return <span className="vp-badge vp-badge--progress"><Edit3 size={11} /> In Progress (Attempt {sub.attemptNumber || 1})</span>;
            case 'submitted': return <span className="vp-badge vp-badge--submitted"><CheckCircle size={11} /> Submitted</span>;
            case 'facilitator_reviewed': return <span className="vp-badge vp-badge--submitted"><Eye size={11} /> Pre-Marked</span>;
            default: return <span className="vp-badge vp-badge--none">Not Started</span>;
        }
    };

    const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
        if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined.</p>;
        return (
            <ul className="vp-curr-list">
                {modules.map((mod, idx) => {
                    const sub = submissions.find(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);
                    const stateKey = sub && ['graded', 'moderated', 'appealed'].includes(sub.status) ? 'done' : (sub ? 'active' : 'pending');

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
        <div className="admin-layout vp-full-screen vp-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* MOBILE HEADER */}
            <div className="vp-mobile-header">
                <button
                    className="vp-hamburger-btn"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <div className="vp-mobile-title">Portfolio View</div>
            </div>

            {/* MOBILE OVERLAY */}
            {isMobileMenuOpen && (
                <div
                    className="vp-sidebar-overlay"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* SIDEBAR WRAPPER */}
            <div className={`vp-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button
                    className="vp-close-btn"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <X size={24} />
                </button>
                <Sidebar
                    role={user?.role}
                    currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'}
                    onLogout={() => signOut(auth).then(() => navigate('/login'))}
                />
            </div>

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
                                                // Only show Remediate/Appeal buttons if the appeal window is still open or pending
                                                const isNYC = sub.status === 'moderated' && sub.competency === 'NYC';
                                                const hasPendingAppeal = sub.status === 'appealed' || sub.appeal?.status === 'pending';

                                                return (
                                                    <tr key={sub.id} className="vp-tr">
                                                        <td className="vp-td"><span className="vp-cell-title">{sub.title}</span><br /><small>{sub.moduleNumber}</small></td>
                                                        <td className="vp-td">{getStatusBadge(sub)}</td>
                                                        <td className="vp-td vp-td--action">
                                                            {isNYC && user?.role === 'learner' && !hasPendingAppeal ? (
                                                                <button
                                                                    className="vp-action-btn vp-action-btn--primary"
                                                                    style={{ background: '#f59e0b', color: 'white', border: 'none' }}
                                                                    onClick={() => navigate(`/learner/assessment/${sub.assessmentId}`)}
                                                                >
                                                                    Appeals / Remediation
                                                                </button>
                                                            ) : isNYC && user?.role !== 'learner' && !hasPendingAppeal ? (
                                                                <button
                                                                    className="vp-action-btn vp-action-btn--primary"
                                                                    style={{ background: '#f59e0b', color: 'white', border: 'none' }}
                                                                    onClick={() => setRemediationTarget(sub)}
                                                                >
                                                                    {remediatingId === sub.id ? <Loader2 className="animate-spin" size={14} /> : 'Remediate'}
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    className="vp-action-btn vp-action-btn--outline"
                                                                    onClick={() => navigate(user?.role === 'learner' ? `/learner/assessment/${sub.assessmentId}` : `/portfolio/submission/${sub.id}`)}
                                                                >
                                                                    View
                                                                </button>
                                                            )}
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


