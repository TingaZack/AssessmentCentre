// src/pages/Portfolio/ViewPortfolio.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    User, Calendar, FileText, CheckCircle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Play, Edit3,
    ShieldCheck, Award, Loader2, BarChart2,
    RotateCcw, Download, AlertTriangle, X, Menu, Search,
    Filter, ChevronLeft, ChevronRight,
    ArrowUpDown, CheckSquare, Square, Printer, Layers, ShieldAlert
} from 'lucide-react';
import {
    collection, query, where, getDocs, doc,
    setDoc, updateDoc, deleteField, onSnapshot, addDoc, writeBatch
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';
import { createPortal } from 'react-dom';

import '../AdminDashboard/AdminDashboard.css';
import '../../components/views/LearnersView/LearnersView.css';
import './ViewPortfolio.css';
import Loader from '../../components/common/Loader/Loader';

interface LearnerSubmission {
    id: string;
    assessmentId: string;
    learnerId: string;
    enrollmentId: string;
    authUid?: string;
    cohortId?: string;
    title: string;
    type: string;
    status: 'not_started' | 'in_progress' | 'submitted' | 'awaiting_learner_signoff' | 'facilitator_reviewed' | 'returned' | 'graded' | 'moderated' | 'appealed' | 'missed';
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
    dueDate?: string;
    facilitatorName?: string;
    assessorName?: string;
}

const TABS = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { id: 'practical', label: 'Practical', icon: FileText },
    { id: 'workplace', label: 'Workplace', icon: Briefcase },
    { id: 'other', label: 'Practice', icon: Play },
    { id: 'compliance', label: 'Compliance', icon: FileBadge },
] as const;

type TabId = typeof TABS[number]['id'];
const INFORMAL_TYPES = ['Developmental Activity', 'Practice Set', 'Task'];

// 🚀 UTILITY: Global Type Badge Generator
const getTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    const baseStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, border: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' };

    if (t.includes('formative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Formative</span>;
    if (t.includes('summative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>Summative</span>;
    if (t.includes('observation')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>Observation</span>;
    if (t.includes('logbook')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Logbook</span>;

    return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>{type || 'Task'}</span>;
};


// Skeleton Components
const SkeletonPulse: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className, style }) => (
    <div className={`vp-skeleton ${className || ''}`} style={style} />
);

const TableSkeleton: React.FC = () => (
    <div style={{ padding: '1.5rem' }}>
        {[...Array(5)].map((_, i) => (
            <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
                <SkeletonPulse className="vp-skeleton-text" style={{ width: '40%' }} />
                <SkeletonPulse className="vp-skeleton-text" style={{ width: '20%' }} />
                <SkeletonPulse className="vp-skeleton-text" style={{ width: '15%' }} />
                <SkeletonPulse className="vp-skeleton-text" style={{ width: '25%' }} />
            </div>
        ))}
    </div>
);

// Progress Ring Component
const ProgressRing: React.FC<{ progress: number; size?: number }> = ({ progress, size = 40 }) => {
    const radius = 16;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <svg width={size} height={size} viewBox="0 0 40 40" className="vp-progress-ring">
            <circle cx="20" cy="20" r={radius} stroke="#e2e8f0" strokeWidth="4" fill="none" />
            <circle
                cx="20"
                cy="20"
                r={radius}
                stroke="#94c73d"
                strokeWidth="4"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="butt"
                style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
            />
        </svg>
    );
};

// PoE Generator Component
const PoEGenerator: React.FC<{ learnerId: string; requestedByUid: string }> = ({ learnerId, requestedByUid }) => {
    const [generating, setGenerating] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMsg, setProgressMsg] = useState('');
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const toast = useToast();

    useEffect(() => {
        if (!learnerId || !requestedByUid) return;

        const q = query(
            collection(db, 'poe_export_requests'),
            where('learnerId', '==', learnerId),
            where('requestedBy', '==', requestedByUid)
        );

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
                    if (!downloadUrl && generating) toast.success("Master PoE is ready for download!");
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
    }, [learnerId, requestedByUid, downloadUrl, generating, toast]);

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
            const q = query(collection(db, 'poe_export_requests'), where('learnerId', '==', learnerId), where('requestedBy', '==', requestedByUid));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const latest = snap.docs.sort((a, b) => new Date(b.data().requestedAt).getTime() - new Date(a.data().requestedAt).getTime())[0];
                await updateDoc(doc(db, 'poe_export_requests', latest.id), { status: 'dismissed' });
            }
        } catch (err) { console.error(err); }
    };

    return (
        <div className="vp-poe-card">
            <div className="vp-poe-header">
                <div className="vp-poe-title-group">
                    <div className="vp-poe-icon">
                        <FileText size={24} />
                    </div>
                    <div>
                        <h3 className="vp-poe-title">Master Portfolio of Evidence</h3>
                        <p className="vp-poe-desc">Generate a complete, QCTO-compliant PDF PoE for this learner</p>
                    </div>
                </div>

                <div className="vp-poe-actions">
                    {generating ? (
                        <div className="vp-poe-progress">
                            <ProgressRing progress={progress} size={44} />
                            <div className="vp-poe-progress-info">
                                <span className="vp-poe-progress-percent">{progress}%</span>
                                <span className="vp-poe-progress-msg">{progressMsg}</span>
                            </div>
                        </div>
                    ) : downloadUrl ? (
                        <>
                            <a
                                href={downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mlab-btn mlab-btn--success"
                                style={{ color: 'green', textDecoration: 'none' }}
                            >
                                <Download size={16} /> Download PoE
                            </a>
                            <button onClick={handleGeneratePoE} className="mlab-btn mlab-btn--ghost">
                                <RotateCcw size={16} /> Regenerate
                            </button>
                        </>
                    ) : (
                        <button onClick={handleGeneratePoE} className="mlab-btn mlab-btn--primary">
                            <FileText size={16} /> Generate Master PoE
                        </button>
                    )}
                </div>
            </div>

            {errorMsg && (
                <div className="vp-alert vp-alert--error">
                    <div className="vp-alert-content">
                        <AlertTriangle size={18} />
                        <div>
                            <strong>Generation Failed</strong>
                            <p>{errorMsg}</p>
                        </div>
                    </div>
                    <button onClick={handleDismissError} className="vp-alert-close">
                        <X size={16} />
                    </button>
                </div>
            )}

            <div className="vp-poe-notice">
                <AlertTriangle size={16} />
                <span><strong>Compliance Note:</strong> Ensure all modules are Moderated before final export for auditors.</span>
            </div>
        </div>
    );
};

// Global mLab Export Modal
const ExportModal: React.FC<{
    submissions: LearnerSubmission[];
    onClose: () => void;
}> = ({ submissions, onClose }) => {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
    const [exporting, setExporting] = useState(false);

    const toggleAll = useCallback(() => {
        if (selectedIds.size === submissions.length) setSelectedIds(new Set());
        else setSelectedIds(new Set(submissions.map(s => s.id)));
    }, [selectedIds, submissions]);

    const toggleOne = useCallback((id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    }, [selectedIds]);

    const handleExport = async () => {
        setExporting(true);
        await new Promise(r => setTimeout(r, 1500));
        setExporting(false);
        onClose();
    };

    return createPortal(
        <div className="mlab-modal-overlay" onClick={onClose}>
            <div className="mlab-modal-window mlab-modal-window--md" onClick={e => e.stopPropagation()}>
                <div className="mlab-modal-header">
                    <h2 className="mlab-modal-title">
                        <Download size={18} /> Export Assessment Data
                    </h2>
                    <button className="mlab-modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="mlab-modal-body" style={{ padding: 0 }}>
                    <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Format:</span>
                            <select value={format} onChange={e => setFormat(e.target.value as any)} style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', outline: 'none' }}>
                                <option value="pdf">PDF Report</option>
                                <option value="csv">CSV Spreadsheet</option>
                            </select>
                        </div>
                        <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={toggleAll}>
                            {selectedIds.size === submissions.length ? <CheckSquare size={14} /> : <Square size={14} />}
                            {selectedIds.size === submissions.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>

                    <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                        {submissions.map(sub => (
                            <div key={sub.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '12px 20px',
                                    borderBottom: '1px solid var(--mlab-border)',
                                    cursor: 'pointer',
                                    background: selectedIds.has(sub.id) ? 'var(--mlab-green-bg)' : 'white'
                                }}
                                onClick={() => toggleOne(sub.id)}
                            >
                                {selectedIds.has(sub.id) ? <CheckSquare size={18} color="var(--mlab-green)" /> : <Square size={18} color="var(--mlab-grey-light)" />}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {sub.title}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                                        <span>{sub.moduleNumber || 'General'}</span>
                                        {getTypeBadge(sub.type)}
                                        <span>• {sub.status.replace('_', ' ')}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="mlab-modal-footer">
                    <button onClick={onClose} className="mlab-btn mlab-btn--ghost">Cancel</button>
                    <button
                        onClick={handleExport}
                        disabled={selectedIds.size === 0 || exporting}
                        className="mlab-btn mlab-btn--primary"
                    >
                        {exporting ? <Loader2 size={16} className="vp-spin" /> : <Download size={16} />}
                        Export {selectedIds.size > 0 && `(${selectedIds.size})`}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// Main Component
export const ViewPortfolio: React.FC = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const targetCohortId = (location.state as any)?.cohortId;

    const { user, learners, learnersLoading, programmes, cohorts, fetchLearners, fetchProgrammes, fetchCohorts } = useStore();
    const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'module' | 'date' | 'status' | 'title'>('module');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    useEffect(() => {
        if (!learners.length) fetchLearners();
        if (!programmes.length) fetchProgrammes();
        if (!cohorts.length) fetchCohorts();
    }, []);

    // 🚀 RESOLVING THE TARGET ENROLLMENT 🚀
    const enrollment = useMemo(() => {
        if (!routeId) return undefined;
        const records = learners.filter(l => l.enrollmentId === routeId || l.id === routeId || l.learnerId === routeId);
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
        let mounted = true;
        if (!enrollment || !enrollment.idNumber) return;

        const loadSubmissions = async () => {
            setLoadingSubmissions(true);

            try {
                const subRef = collection(db, 'learner_submissions');
                const targetHumanId = enrollment.learnerId || enrollment.id;
                const activeCohortId = targetCohortId || enrollment.cohortId;

                let subs: LearnerSubmission[] = [];

                if (user?.role === 'learner') {
                    const q1 = activeCohortId && activeCohortId !== ""
                        ? query(subRef, where('authUid', '==', user.uid), where('cohortId', '==', activeCohortId))
                        : query(subRef, where('authUid', '==', user.uid));

                    const q2 = activeCohortId && activeCohortId !== ""
                        ? query(subRef, where('learnerId', '==', user.uid), where('cohortId', '==', activeCohortId))
                        : query(subRef, where('learnerId', '==', user.uid));

                    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

                    const merged = new Map();
                    snap1.docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
                    snap2.docs.forEach(d => merged.set(d.id, { id: d.id, ...d.data() }));
                    subs = Array.from(merged.values()) as LearnerSubmission[];
                } else {
                    const q = activeCohortId && activeCohortId !== ""
                        ? query(subRef, where('learnerId', '==', targetHumanId), where('cohortId', '==', activeCohortId))
                        : query(subRef, where('learnerId', '==', targetHumanId));

                    const snap = await getDocs(q);
                    subs = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
                }

                if (activeCohortId && activeCohortId !== "") {
                    const cohortAssessmentsQ = query(
                        collection(db, 'assessments'),
                        where('cohortIds', 'array-contains', activeCohortId)
                    );

                    const cohortAssSnap = await getDocs(cohortAssessmentsQ);

                    const activeAssessments = new Map();
                    const draftAssessmentIds = new Set();

                    cohortAssSnap.forEach(docSnap => {
                        const assData = docSnap.data();
                        if (assData.status === 'active' || assData.status === 'scheduled') {
                            activeAssessments.set(docSnap.id, assData);
                        } else if (assData.status === 'draft') {
                            draftAssessmentIds.add(docSnap.id);
                        }
                    });

                    const batch = writeBatch(db);
                    let batchCount = 0;

                    subs = subs.filter(sub => {
                        if (draftAssessmentIds.has(sub.assessmentId) && sub.status === 'not_started') {
                            batch.delete(doc(db, 'learner_submissions', sub.id));
                            batchCount++;
                            return false;
                        }
                        return true;
                    });

                    const existingAssIds = new Set(subs.map(s => s.assessmentId));

                    for (const [astId, assData] of activeAssessments.entries()) {
                        if (!existingAssIds.has(astId)) {
                            const sid = `${activeCohortId}_${targetHumanId}_${astId}`;
                            const newSub = {
                                learnerId: targetHumanId,
                                enrollmentId: enrollment.enrollmentId || enrollment.id,
                                authUid: user?.role === 'learner' ? user.uid : (enrollment.authUid || targetHumanId),
                                qualificationName: enrollment.qualification?.name || matchingProgramme?.name || "",
                                assessmentId: astId,
                                cohortId: activeCohortId,
                                title: assData.title,
                                type: assData.type,
                                moduleType: assData.moduleType,
                                status: "not_started",
                                assignedAt: new Date().toISOString(),
                                marks: 0,
                                totalMarks: assData.totalMarks || 0,
                                moduleNumber: assData.moduleInfo?.moduleNumber || "",
                                createdAt: new Date().toISOString(),
                                createdBy: "System_AutoHydration"
                            };

                            batch.set(doc(db, "learner_submissions", sid), newSub);
                            subs.push({ id: sid, ...newSub } as LearnerSubmission);
                            batchCount++;
                        }
                    }

                    if (batchCount > 0) {
                        await batch.commit();
                    }
                }

                if (mounted) {
                    setSubmissions(subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()));
                    setLoadingSubmissions(false);
                }

            } catch (err) {
                console.error("Error loading portfolio submissions:", err);
                if (mounted) setLoadingSubmissions(false);
            }
        };

        loadSubmissions();

        return () => { mounted = false; };
    }, [enrollment, matchingProgramme, targetCohortId]);

    // Reset pagination when tab changes
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchTerm, statusFilter]);

    const pipelineStats = useMemo(() => {
        const total = submissions.length;
        if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
        return {
            total,
            submitted: submissions.filter(s => !['not_started', 'in_progress', 'missed'].includes(s.status)).length,
            facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed', 'returned'].includes(s.status)).length,
            graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
            moderated: submissions.filter(s => s.status === 'moderated').length,
        };
    }, [submissions]);

    const executeRemediation = async (date: string, notes: string) => {
        if (!remediationTarget) return;
        const s = remediationTarget;
        setRemediationTarget(null);
        try {
            await setDoc(doc(collection(db, 'learner_submissions', s.id, 'history')), { ...s, archivedAt: new Date().toISOString() });
            await updateDoc(doc(db, 'learner_submissions', s.id), {
                status: 'in_progress',
                competency: deleteField(),
                grading: deleteField(),
                moderation: deleteField(),
                submittedAt: deleteField(),
                attemptNumber: (s.attemptNumber || 1) + 1,
                remediationDate: date,
                remediationNotes: notes,
                remediatedBy: user?.uid,
                remediatedAt: new Date().toISOString()
            });
            setSubmissions(p => p.map(x => x.id === s.id ? { ...x, status: 'in_progress', competency: undefined, attemptNumber: (x.attemptNumber || 1) + 1 } : x));
            toast.success("Workbook unlocked for next attempt!");
        } catch {
            toast.error("Failed to unlock workbook.");
        }
    };

    const getStatusBadge = (sub: LearnerSubmission) => {
        const baseStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, border: 'none', textTransform: 'uppercase' };

        if (sub.status === 'appealed' || sub.appeal?.status === 'pending') {
            return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}><AlertTriangle size={12} /> Appeal Pending</span>;
        }

        const role = user?.role || 'learner';
        const isWorkplace = sub.moduleType === 'workplace';

        switch (sub.status) {
            case 'moderated':
                return sub.competency === 'C'
                    ? <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><Award size={12} /> Competent</span>
                    : <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> NYC</span>;

            case 'graded':
                if (role === 'moderator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><ShieldCheck size={12} /> Ready for QA</span>;
                if (role === 'admin') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' }}><Clock size={12} /> Awaiting QA</span>;
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' }}><CheckCircle size={12} /> QA Pending</span>;

            case 'facilitator_reviewed':
                if (role === 'assessor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><Award size={12} /> Ready for Grading</span>;
                if (role === 'admin' || role === 'moderator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><Clock size={12} /> Awaiting Grading</span>;
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#f3e8ff', color: '#6d28d9', border: '1px solid #e9d5ff' }}><Eye size={12} /> {isWorkplace ? 'Verified' : 'Pre-Marked'}</span>;

            case 'awaiting_learner_signoff':
                if (role === 'learner') return <span className="mlab-badge" style={{ ...baseStyle, background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}><Edit3 size={12} /> Action Required</span>;
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}><Clock size={12} /> Awaiting Sign-off</span>;

            case 'returned':
                if (role === 'learner') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> Revision Required</span>;
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}><RotateCcw size={12} /> Returned</span>;

            case 'submitted':
                if (role === 'facilitator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Eye size={12} /> Awaiting Pre-Marking</span>;
                if (role === 'mentor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><ShieldCheck size={12} /> Awaiting Verification</span>;
                if (role === 'admin' || role === 'assessor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Clock size={12} /> Awaiting Facilitator</span>;
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Submitted</span>;

            case 'in_progress':
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}><Edit3 size={12} /> In Progress (Att. {sub.attemptNumber || 1})</span>;

            case 'missed':
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}><AlertTriangle size={12} /> Missed</span>;

            default:
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1' }}><BookOpen size={12} /> Not Started</span>;
        }
    };

    const filteredSubmissions = useMemo(() => {
        let filtered = submissions.filter(sub => {
            if (activeTab === 'overview') return true;
            const isPracticeActivity = INFORMAL_TYPES.includes(sub.type);

            if (activeTab === 'other') return isPracticeActivity;

            return (sub.moduleType || 'knowledge') === activeTab && !isPracticeActivity;
        });

        // Search filter
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(sub =>
                sub.title.toLowerCase().includes(term) ||
                sub.moduleNumber?.toLowerCase().includes(term) ||
                sub.type?.toLowerCase().includes(term) ||
                sub.facilitatorName?.toLowerCase().includes(term)
            );
        }

        // Status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(sub => {
                if (statusFilter === 'competent') return sub.status === 'moderated' && sub.competency === 'C';
                if (statusFilter === 'nyc') return sub.status === 'moderated' && sub.competency === 'NYC';
                if (statusFilter === 'pending') return ['submitted', 'facilitator_reviewed', 'graded'].includes(sub.status);
                if (statusFilter === 'active') return ['in_progress', 'not_started'].includes(sub.status);
                if (statusFilter === 'missed') return sub.status === 'missed';
                return sub.status === statusFilter;
            });
        }

        // Sorting
        filtered.sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'module':
                    comparison = (a.moduleNumber || 'ZZZ').localeCompare(b.moduleNumber || 'ZZZ');
                    break;
                case 'date':
                    comparison = new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
                    break;
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'status':
                    const statusOrder = ['not_started', 'in_progress', 'submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed'];
                    comparison = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
                    break;
            }
            return sortOrder === 'asc' ? comparison * -1 : comparison;
        });

        return filtered;
    }, [submissions, activeTab, searchTerm, statusFilter, sortBy, sortOrder]);

    // Pagination
    const totalPages = Math.ceil(filteredSubmissions.length / itemsPerPage);
    const paginatedSubmissions = filteredSubmissions.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const renderPipelineBar = (label: string, value: number, total: number, variant: string) => {
        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
        return (
            <div className="vp-pipeline-item" key={label}>
                <div className="vp-pipeline-header">
                    <span className="vp-pipeline-label">{label}</span>
                    <span className="vp-pipeline-stat">{value}/{total} ({pct}%)</span>
                </div>
                <div className="vp-pipeline-track">
                    <div className={`vp-pipeline-fill vp-pipeline-fill--${variant}`} style={{ width: `${pct}%` }} />
                </div>
            </div>
        );
    };

    const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
        if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined.</p>;
        return (
            <ul className="vp-curr-list">
                {modules.map((mod, idx) => {
                    const moduleSubs = submissions.filter(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);

                    let stateKey = 'pending';
                    if (moduleSubs.length > 0) {
                        const allDone = moduleSubs.every(s => ['graded', 'moderated', 'appealed'].includes(s.status));
                        stateKey = allDone ? 'done' : 'active';
                    }

                    return (
                        <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`} style={{ flexDirection: 'column', alignItems: 'stretch', padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div className="vp-curr-icon">
                                        {stateKey === 'done' ? <CheckCircle size={16} /> : stateKey === 'active' ? <Clock size={16} /> : <AlertCircle size={16} />}
                                    </div>
                                    <div className="vp-curr-info">
                                        <span className="vp-curr-code">{mod.code || `M${idx + 1}`}</span>
                                        <span className="vp-curr-name">{mod.name}</span>
                                    </div>
                                </div>

                                {moduleSubs.length === 0 && (
                                    <span className="mlab-badge mlab-badge--ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1' }}>Not Assigned</span>
                                )}
                            </div>

                            {moduleSubs.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', paddingLeft: '28px' }}>
                                    {moduleSubs.map(sub => (
                                        <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                            {getTypeBadge(sub.type)}
                                            {getStatusBadge(sub)}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        );
    };

    const renderDocRow = (title: string, docType: string, url?: string) => (
        <div className="vp-doc-card" key={docType}>
            <div className="vp-doc-icon-wrap">
                <div className={`vp-doc-icon ${url ? 'vp-doc-icon--success' : 'vp-doc-icon--missing'}`}>
                    <FileText size={20} />
                </div>
            </div>
            <div className="vp-doc-info">
                <h4 className="vp-doc-title">{title}</h4>
                <span className={`vp-doc-status ${url ? 'vp-doc-status--success' : 'vp-doc-status--missing'}`}>
                    {url ? 'Verified & On File' : 'Document Missing'}
                </span>
            </div>
            {url ? (
                <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mlab-btn mlab-btn--outline mlab-btn--sm"
                    style={{ color: 'var(--mlab-midnight, #073f4e)', textDecoration: 'none', border: '1px solid var(--mlab-border, #e2e8f0)' }}
                >
                    <Eye size={14} /> View
                </a>
            ) : (
                <span className="vp-doc-pending">Pending Upload</span>
            )}
        </div>
    );

    // 🚀 DYNAMIC ROW RENDERER: Supports Flat and Grouped Rows
    const renderTableRow = (sub: LearnerSubmission, isGrouped: boolean) => {
        const isNYC = sub.status === 'moderated' && sub.competency === 'NYC';
        const hasPendingAppeal = sub.status === 'appealed' || sub.appeal?.status === 'pending';

        return (
            <tr key={sub.id}>
                <td style={isGrouped ? { paddingLeft: '2.5rem' } : {}}>
                    <div className="vp-assessment-cell">
                        <span className="vp-assessment-title" style={isGrouped ? { fontSize: '0.9rem' } : {}}>{sub.title}</span>
                        <span className="vp-assessment-meta">Assigned {new Date(sub.assignedAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}</span>
                    </div>
                </td>
                {!isGrouped && (
                    <td>
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', color: 'var(--mlab-green)', fontWeight: 600 }}>
                            {sub.moduleNumber || 'General'}
                        </span>
                    </td>
                )}
                <td>{getTypeBadge(sub.type)}</td>
                <td>{getStatusBadge(sub)}</td>
                <td style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem' }}>
                    #{sub.attemptNumber || 1}
                </td>
                <td style={{ textAlign: 'right' }}>
                    {isNYC && user?.role === 'learner' && !hasPendingAppeal ? (
                        <button
                            className="mlab-btn mlab-btn--warning mlab-btn--sm"
                            onClick={() => navigate(`/learner/assessment/${sub.assessmentId}`)}
                        >
                            <AlertCircle size={14} style={{ marginRight: '4px' }}/> Appeal / Remediate
                        </button>
                    ) : isNYC && user?.role !== 'learner' && !hasPendingAppeal ? (
                        <button
                            className="mlab-btn mlab-btn--warning mlab-btn--sm"
                            onClick={() => setRemediationTarget(sub)}
                        >
                            <AlertCircle size={14} style={{ marginRight: '4px' }}/> Remediate
                        </button>
                    ) : sub.status === 'missed' && user?.role !== 'learner' ? (
                        <button
                            className="mlab-btn mlab-btn--outline"
                            style={{ color: '#dc2626', borderColor: '#fecaca' }}
                            onClick={() => navigate(`/portfolio/submission/${sub.id}`)}
                        >
                            <ShieldAlert size={14} /> Review Absence
                        </button>
                    ) : sub.status === 'missed' && user?.role === 'learner' ? (
                        <button
                            className="mlab-btn"
                            style={{ color: '#dc2626' }}
                            onClick={() => navigate(`/learner/assessment/${sub.assessmentId}`)}
                        >
                            <Eye size={14} /> View
                        </button>
                    ) : (
                        <button
                            className="mlab-btn"
                            style={{ color: 'green' }}
                            onClick={() => navigate(user?.role === 'learner' ? `/learner/assessment/${sub.assessmentId}` : `/portfolio/submission/${sub.id}`)}
                        >
                            <Eye size={14} /> View
                        </button>
                    )}
                </td>
            </tr>
        );
    };

    // 🚀 DYNAMIC TABLE BODY RENDERER
    const renderTableBody = () => {
        if (sortBy === 'module') {
            // Group by module
            const groups: Record<string, LearnerSubmission[]> = {};
            filteredSubmissions.forEach(sub => {
                const mod = sub.moduleNumber || 'Unlinked Assessments';
                if (!groups[mod]) groups[mod] = [];
                groups[mod].push(sub);
            });

            const sortedKeys = Object.keys(groups).sort((a, b) => sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a));

            return sortedKeys.map(modCode => (
                <React.Fragment key={modCode}>
                    <tr style={{ background: '#f8fafc' }}>
                        <td colSpan={5} style={{ padding: '12px 16px', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Layers size={16} color="var(--mlab-blue)" />
                                <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                    {modCode}
                                </span>
                            </div>
                        </td>
                    </tr>
                    {groups[modCode].map(sub => renderTableRow(sub, true))}
                </React.Fragment>
            ));
        } else {
            // Standard Paginated Flat View
            return paginatedSubmissions.map(sub => renderTableRow(sub, false));
        }
    };


    const activeCohort = cohorts.find(c => c.id === (targetCohortId || enrollment?.cohortId));
    const activeCohortName = (enrollment as any)?.cohortName || activeCohort?.name;

    const effectiveStartDate = enrollment?.trainingStartDate || activeCohort?.startDate;
    const effectiveEndDate = (enrollment as any)?.trainingEndDate || activeCohort?.endDate;

    if (learnersLoading && !enrollment) {
        return (
            <div className="admin-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <Loader message='Loading Portfolio...' />
            </div>
        );
    }

    if (!enrollment || !enrollment.idNumber) {
        return (
            <div className="admin-layout">
                <Sidebar
                    role={user?.role}
                    currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'}
                    onLogout={() => signOut(auth).then(() => navigate('/login'))}
                />
                <main className="main-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="vp-empty-state vp-empty-state--large" style={{ padding: '3rem', border: '1px dashed #cbd5e1', background: 'white' }}>
                        <AlertTriangle size={64} color="#ef4444" />
                        <h2 style={{ marginTop: '1.5rem', color: '#0f172a' }}>Invalid Learner Data</h2>
                        <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                            This learner profile is incomplete or corrupted (Missing ID or Full Name).
                            Grading tools are disabled to prevent database errors.
                            Please contact an Administrator to repair or delete this record.
                        </p>
                        <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--primary">
                            <ChevronLeft size={16} /> Return to Directory
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="admin-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {remediationTarget && (
                <RemediationModal
                    submissionTitle={remediationTarget.title}
                    attemptNumber={remediationTarget.attemptNumber || 1}
                    onClose={() => setRemediationTarget(null)}
                    onSubmit={executeRemediation}
                />
            )}

            {showExportModal && (
                <ExportModal
                    submissions={filteredSubmissions}
                    onClose={() => setShowExportModal(false)}
                />
            )}

            {/* Admin Mobile Header */}
            <div className="admin-mobile-header">
                <div className="admin-mobile-header-left">
                    <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu size={24} />
                    </button>
                    <div className="admin-mobile-title">Portfolio View</div>
                </div>
                <div className="admin-mobile-header-right">
                    <NotificationBell />
                </div>
            </div>

            {/* Admin Sidebar & Overlay */}
            {isMobileMenuOpen && (
                <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={24} />
                </button>
                <Sidebar
                    role={user?.role}
                    currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'}
                    onLogout={() => signOut(auth).then(() => navigate('/login'))}
                />
            </div>

            {/* Main Content using standard Main Wrapper */}
            <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

                <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="header-title">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <ShieldCheck size={18} color="var(--mlab-green)" />
                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mlab-green)' }}>
                                Verified Portfolio
                            </span>
                        </div>
                        <h1>{enrollment.fullName}</h1>
                        <p>{matchingProgramme?.name || "Qualification Portfolio"} • {enrollment.idNumber}</p>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        <button onClick={() => setShowExportModal(true)} className="mlab-btn mlab-btn--ghost">
                            <Download size={16} /> Export
                        </button>
                        <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--ghost">
                            <ChevronLeft size={16} /> Back
                        </button>
                        <NotificationBell />
                    </div>
                </header>

                <div className="admin-content">
                    {/* Profile Card */}
                    <div className="vp-profile-card">
                        <div className="vp-profile-avatar">
                            {(enrollment as any).profilePhotoUrl ? (
                                <img src={(enrollment as any).profilePhotoUrl} alt="" />
                            ) : (
                                <User size={32} />
                            )}
                        </div>
                        <div className="vp-profile-info">
                            <h2 className="vp-profile-name">{enrollment.fullName}</h2>
                            <div className="vp-profile-meta">
                                <span><strong>ID:</strong> {enrollment.idNumber}</span>
                                <span className="vp-profile-divider">|</span>
                                <span>
                                    <Calendar size={14} /><strong>Programme Start & End Date: </strong>
                                    {effectiveStartDate ? new Date(effectiveStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Start'}
                                    {' — '}
                                    {effectiveEndDate ? new Date(effectiveEndDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown End'}
                                </span>                                    <>
                                    <span className="vp-profile-divider">|</span>
                                    <span><Briefcase size={14} /> {activeCohortName || "Dormant Profile (Unassigned)"}</span>
                                </>
                            </div>
                        </div>
                        <div className="vp-profile-status">
                            <span className="vp-status-label">Status</span>
                            <span className={`vp-status-value vp-status-value--${enrollment.status}`}>
                                {enrollment.status === 'active' ? 'IN TRAINING' : enrollment.status?.toUpperCase() || 'UNKNOWN'}
                            </span>
                        </div>
                    </div>

                    {/* Tabs */}
                    <nav className="vp-tabs" role="tablist">
                        {TABS.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    className={`vp-tab ${isActive ? 'vp-tab--active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-controls={`panel-${tab.id}`}
                                    style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', borderColor: 'transparent' }}
                                >
                                    <Icon size={16} />
                                    <span>{tab.label}</span>
                                    {tab.id !== 'overview' && tab.id !== 'compliance' && (
                                        <span className="vp-count-badge" style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 6px' }}>
                                            {submissions.filter(s => {
                                                if (tab.id === 'other') return INFORMAL_TYPES.includes(s.type);
                                                return (s.moduleType || 'knowledge') === tab.id && !INFORMAL_TYPES.includes(s.type);
                                            }).length}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Tab Content */}
                    <div className="vp-content">
                        {activeTab === 'overview' && (
                            <div className="vp-grid vp-grid--2col">

                                {user?.role !== 'learner' && (
                                    <div className="vp-grid-span-2">
                                        <PoEGenerator learnerId={enrollment.learnerId || enrollment.id} requestedByUid={user?.uid || ''} />
                                    </div>
                                )}

                                <div className="vp-card">
                                    <div className="vp-card-header">
                                        <BarChart2 size={18} />
                                        <h3>Pipeline Progress</h3>
                                    </div>
                                    <div className="vp-pipeline">
                                        {renderPipelineBar('Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
                                        {renderPipelineBar('Facilitator Review', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
                                        {renderPipelineBar('Assessor Graded', pipelineStats.graded, pipelineStats.total, 'amber')}
                                        {renderPipelineBar('Moderated', pipelineStats.moderated, pipelineStats.total, 'green')}
                                    </div>
                                </div>

                                <div className="vp-card">
                                    <div className="vp-card-header">
                                        <BookOpen size={18} />
                                        <h3>Curriculum Map</h3>
                                    </div>
                                    {!matchingProgramme ? (
                                        <div className="vp-empty-state">
                                            <AlertCircle size={32} />
                                            <p>No Qualification Blueprint Linked</p>
                                        </div>
                                    ) : (
                                        <div className="vp-curr-groups">
                                            <div className="vp-curr-group">
                                                <span className="vp-curr-group-label">Knowledge Modules</span>
                                                {renderCurriculumGroup(matchingProgramme.knowledgeModules, 'K')}
                                            </div>
                                            <div className="vp-curr-group">
                                                <span className="vp-curr-group-label">Practical Modules</span>
                                                {renderCurriculumGroup(matchingProgramme.practicalModules, 'P')}
                                            </div>
                                            {matchingProgramme.workExperienceModules && (
                                                <div className="vp-curr-group">
                                                    <span className="vp-curr-group-label">Workplace Modules</span>
                                                    {renderCurriculumGroup(matchingProgramme.workExperienceModules, 'W')}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {(activeTab === 'knowledge' || activeTab === 'practical' || activeTab === 'workplace' || activeTab === 'other') && (
                            <div className="vp-card" id={`panel-${activeTab}`}>
                                <div className="vp-card-header vp-card-header--between">
                                    <div className="vp-card-title-group">
                                        <h3>{TABS.find(t => t.id === activeTab)?.label} Assessments</h3>
                                    </div>
                                </div>

                                {/* Standard mLab Toolbar */}
                                <div className="mlab-toolbar" style={{ borderTop: 'none', margin: 10, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>

                                    {/* Search Bar */}
                                    <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', flex: '1', minWidth: '220px', overflow: 'hidden' }}>
                                        <Search size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
                                        <input
                                            type="text"
                                            placeholder="Search assessments..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 12px', color: 'var(--mlab-blue)', width: '100%', fontSize: '0.85rem' }}
                                        />
                                    </div>

                                    {/* Status Filter */}
                                    <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                        <Filter size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
                                        <select
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(e.target.value)}
                                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 8px', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.85rem', appearance: 'none' }}
                                        >
                                            <option value="all">All Statuses</option>
                                            <option value="not_started">Not Started</option>
                                            <option value="in_progress">In Progress</option>
                                            <option value="submitted">Submitted</option>
                                            <option value="pending">Pending Review</option>
                                            <option value="competent">Competent</option>
                                            <option value="nyc">Not Yet Competent</option>
                                            <option value="appealed">Appealed</option>
                                            <option value="missed">Missed</option>
                                        </select>
                                    </div>

                                    {/* Sort By Filter */}
                                    <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                                        <ArrowUpDown size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
                                        <select
                                            value={sortBy}
                                            onChange={e => setSortBy(e.target.value as any)}
                                            style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 8px', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.85rem', appearance: 'none' }}
                                        >
                                            <option value="module">Module (Grouped)</option>
                                            <option value="date">Date Assigned</option>
                                            <option value="title">Title</option>
                                            <option value="status">Status</option>
                                        </select>
                                    </div>

                                    {/* Sort Order Button */}
                                    <button
                                        className="mlab-btn mlab-btn--ghost"
                                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                        title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                                        style={{ height: '38px', border: '1px solid var(--mlab-border)', background: 'white', borderRadius: '6px', padding: '0 16px', display: 'flex', alignItems: 'center', outline: 'none' }}
                                    >
                                        {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
                                    </button>

                                </div>

                                {loadingSubmissions ? (
                                    <TableSkeleton />
                                ) : filteredSubmissions.length === 0 ? (
                                    <div className="vp-empty-state">
                                        <FileText size={40} />
                                        <p>No assessments found matching your criteria</p>
                                        <button
                                            className="mlab-btn mlab-btn--ghost"
                                            onClick={() => { setSearchTerm(''); setStatusFilter('all'); }}
                                            style={{ marginTop: '1rem' }}
                                        >
                                            Clear Filters
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="mlab-table-wrap">
                                            <table className="mlab-table">
                                                <thead>
                                                    <tr>
                                                        <th>Assessment</th>
                                                        {sortBy !== 'module' && <th>Module</th>}
                                                        <th>Type</th>
                                                        <th>Status</th>
                                                        <th>Attempt</th>
                                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {renderTableBody()}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Pagination (Hidden in Grouped View) */}
                                        {sortBy !== 'module' && totalPages > 1 && (
                                            <div style={{
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                                gap: '0.5rem',
                                                padding: '1rem',
                                                borderTop: '1px solid var(--mlab-border)'
                                            }}>
                                                <button
                                                    className="mlab-btn mlab-btn--ghost mlab-btn--sm"
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                >
                                                    <ChevronLeft size={16} /> Prev
                                                </button>
                                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                    Page {currentPage} of {totalPages}
                                                </span>
                                                <button
                                                    className="mlab-btn mlab-btn--ghost mlab-btn--sm"
                                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                    disabled={currentPage === totalPages}
                                                >
                                                    Next <ChevronRight size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'compliance' && (
                            <div className="vp-card" id="panel-compliance">
                                <div className="vp-card-header vp-card-header--between">
                                    <div className="vp-card-title-group">
                                        <FileBadge size={18} />
                                        <h3>Compliance Documents</h3>
                                    </div>
                                    {user?.role !== 'learner' && (
                                        <button className="mlab-btn mlab-btn--outline mlab-btn--sm">
                                            <Printer size={14} /> Print Checklist
                                        </button>
                                    )}
                                </div>
                                <div className="vp-doc-grid">
                                    {(() => {
                                        const legacyDocs = (enrollment as any).documents || {};
                                        const rawUploadedDocs = (enrollment as any).uploadedDocuments;
                                        const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

                                        const idUrl = uploadedDocs.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl;
                                        const cvUrl = uploadedDocs.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl;
                                        const qualUrl = uploadedDocs.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl;

                                        const coreDocIds = ['id', 'cv', 'qual'];
                                        const customDocs = uploadedDocs.filter((d: any) => !coreDocIds.includes(d.id));

                                        return (
                                            <>
                                                {renderDocRow('National ID', 'id', idUrl)}
                                                {renderDocRow('Highest Qualification', 'qual', qualUrl)}
                                                {renderDocRow('Detailed CV', 'cv', cvUrl)}

                                                {customDocs.map((doc: any, idx: number) => (
                                                    renderDocRow(doc.name || 'Additional Document', doc.id || `custom_${idx}`, doc.url)
                                                ))}

                                                {!idUrl && !cvUrl && !qualUrl && customDocs.length === 0 && (
                                                    <div className="vp-empty-state" style={{ gridColumn: '1 / -1' }}>
                                                        <AlertCircle size={32} color="var(--mlab-grey)" />
                                                        <p>No compliance documents found on file.</p>
                                                    </div>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default ViewPortfolio;