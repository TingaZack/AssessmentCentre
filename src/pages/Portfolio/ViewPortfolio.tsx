// src/components/views/ViewPortfolio/ViewPortfolio.tsx

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
    User, Calendar, FileText, CheckCircle, AlertTriangle, AlertCircle, Clock,
    BookOpen, Briefcase, FileBadge, Eye, Edit3,
    ShieldCheck, Award, Loader2, BarChart2,
    RotateCcw, Download, X, Menu, Search,
    Filter, ChevronLeft, ChevronRight,
    ArrowUpDown, CheckSquare, Square, Printer, Layers, ShieldAlert,
    Timer, Lock, ChevronDown, ChevronUp, CheckCircle2
} from 'lucide-react';
import {
    collection, query, where, getDocs, doc, getDoc, limit,
    setDoc, updateDoc, deleteField, onSnapshot, addDoc, writeBatch
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
import { RemediationModal } from '../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewModals';
import moment from 'moment';
import { WorkplaceLogViewerModal } from '../../components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal';

// ─── IMPORT EXTERNAL PRINT COMPONENTS ───
import { WorkplaceModuleBulkPrintable } from './WorkplaceModuleBulkPrintable';

// ─── Interfaces & Types ────────────────────────────────────────────────────────

interface LearnerSubmission {
    id: string;
    assessmentId: string;
    learnerId: string;
    enrollmentId: string;
    authUid?: string;
    cohortId?: string;
    title: string;
    type: string;
    status: 'not_started' | 'in_progress' | 'submitted' | 'awaiting_learner_signoff' | 'facilitator_reviewed' | 'returned' | 'graded' | 'moderated' | 'appealed' | 'missed' | 'upcoming' | 'scheduled';
    assignedAt: string;
    startedAt?: string;
    marks: number;
    totalMarks: number;
    competency?: 'C' | 'NYC';
    moduleNumber?: string;
    moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
    timeLimit?: number;
    isScheduled?: boolean;
    scheduledDate?: string;
    moderation?: { outcome?: 'Endorsed' | 'Returned' };
    appeal?: { status?: 'pending' | 'upheld' | 'rejected', reason?: string, date?: string };
    qualificationName?: string;
    attemptNumber?: number;
    dueDate?: string;
    facilitatorName?: string;
    assessorName?: string;
    rawLogData?: any;
}

type TabId = 'overview' | 'knowledge' | 'practical' | 'workplace' | 'other' | 'compliance';

const TABS: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    { id: 'practical', label: 'Practical', icon: Briefcase },
    { id: 'workplace', label: 'Workplace', icon: Layers },
    { id: 'compliance', label: 'Compliance', icon: FileBadge },
];

const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz'];

// ─── Global Independent Sub-Components ──────────────────────────────────────

const getTypeBadge = (type: string) => {
    const t = (type || '').toLowerCase();
    const baseStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, border: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' };

    if (t.includes('formative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Formative</span>;
    if (t.includes('summative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>Summative</span>;
    if (t.includes('observation')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>Observation</span>;
    if (t.includes('logbook')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Logbook</span>;

    return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>{type || 'Task'}</span>;
};

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

// ───  SUPPORT SCHEDULING MODAL ───
const ScheduleSessionModal: React.FC<{ learner: any; user: any; context?: LearnerSubmission | null; onClose: () => void }> = ({ learner, user, context, onClose }) => {
    // If a module context was passed, default to Academic Support and pre-fill the topic
    const [category, setCategory] = useState(context ? 'Academic Support & Remediation' : 'General Check-in');
    const [topic, setTopic] = useState(context ? `Regarding ${context.moduleNumber || 'Assessment'}: ${context.title}` : '');
    const [dateTime, setDateTime] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const toast = useToast();

    const handleSubmit = async () => {
        if (!dateTime || !topic) {
            toast.error("Please fill in all fields.");
            return;
        }

        setIsSubmitting(true);
        try {
            const functions = getFunctions();
            const scheduleCoachingSession = httpsCallable(functions, 'scheduleCoachingSession');

            await scheduleCoachingSession({
                learnerId: learner.learnerId || learner.id,
                learnerEmail: learner.email || learner.demographics?.learnerEmailAddress || 'noreply@mlab.co.za',
                learnerName: learner.fullName,
                staffId: user.uid,
                staffEmail: user.email,
                staffName: user.fullName,
                dateTime,
                topic,
                sessionCategory: category,
                assessmentId: context ? context.assessmentId : null
            });

            toast.success("Support session scheduled successfully! Invites sent.");
            onClose();
        } catch (error: any) {
            toast.error(error.message || "Failed to schedule session.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return createPortal(
        <div className="mlab-modal-overlay" onClick={onClose} style={{ zIndex: 99999 }}>
            <div className="mlab-modal-window mlab-modal-window--md" onClick={e => e.stopPropagation()}>
                <div className="mlab-modal-header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '50%', color: '#0ea5e9' }}>
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h2 className="mlab-modal-title" style={{ margin: 0 }}>Schedule Support Session</h2>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                Set up a 1-on-1 Google Meet session with <strong>{learner.fullName}</strong>.
                            </p>
                        </div>
                    </div>
                    <button className="mlab-modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="mlab-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.5rem' }}>

                    {/* 🚀 FIXED: Context badge with proper fallbacks for missing Module Numbers */}
                    {context && (
                        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                            <BookOpen size={16} color="#166534" style={{ marginTop: '2px', flexShrink: 0 }} />
                            <div>
                                <strong style={{ color: '#166534', fontSize: '0.8rem', display: 'block' }}>
                                    Module Context Linked: {context.moduleNumber || 'Assessment'}
                                </strong>
                                <span style={{ color: '#15803d', fontSize: '0.75rem', lineHeight: 1.4, display: 'inline-block', marginTop: '2px' }}>
                                    This session will be officially linked to <strong>{context.moduleNumber ? `${context.moduleNumber} - ${context.title}` : context.title}</strong> in the database.
                                </span>
                            </div>
                        </div>
                    )}

                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Session Category</label>
                        <select className="lfm-input" value={category} onChange={e => setCategory(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                            <option value="Academic Support & Remediation">📚 Academic Support & Remediation</option>
                            <option value="Career Guidance & Placement">💼 Career Guidance & Placement</option>
                            <option value="Wellness & Personal Support">🧠 Wellness & Personal Support</option>
                            <option value="General Check-in">💬 General Check-in</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Date & Time</label>
                        <input type="datetime-local" className="lfm-input" value={dateTime} onChange={e => setDateTime(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Topic / Notes</label>
                        <textarea className="lfm-input" rows={3} placeholder="What will this session cover?" value={topic} onChange={e => setTopic(e.target.value)} style={{ width: '100%', padding: '10px', marginTop: '6px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px' }} />
                    </div>
                </div>

                <div className="mlab-modal-footer">
                    <button onClick={onClose} className="mlab-btn mlab-btn--ghost">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="mlab-btn mlab-btn--primary">
                        {isSubmitting ? <Loader2 size={16} className="vp-spin" /> : <Calendar size={16} />} Schedule & Invite
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

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

// ==========================================================================
// MAIN APPLICATION DASHBOARD VIEW
// ==========================================================================
export const ViewPortfolio: React.FC = () => {
    const { id: routeId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const targetCohortId = (location.state as any)?.cohortId;

    // ─── 1. REACT HOOKS AND STATES ───
    const {
        user, learners, learnersLoading, programmes, cohorts,
        fetchLearners, fetchProgrammes, fetchCohorts,
        employers, fetchEmployers,
        placements, fetchPlacements
    } = useStore() as any;

    const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
    const [loadingSubmissions, setLoadingSubmissions] = useState(true);

    const [searchParams, setSearchParams] = useSearchParams();
    const urlTab = searchParams.get('tab') as TabId | null;
    const validTabs: TabId[] = ['overview', 'knowledge', 'practical', 'workplace', 'other', 'compliance'];
    const activeTab: TabId = urlTab && validTabs.includes(urlTab) ? urlTab : 'overview';

    const setActiveTab = (tab: TabId) => {
        setSearchParams((prev) => {
            prev.set('tab', tab);
            prev.delete('expanded');
            return prev;
        }, { replace: true });
    };

    const [searchTerm, setSearchTerm] = useState('');

    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'module' | 'date' | 'status' | 'title'>('module');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    const [showLogModal, setShowLogModal] = useState(false);
    const [selectedLog, setSelectedLog] = useState<any>(null);

    const [bulkPrintPayload, setBulkPrintPayload] = useState<{
        moduleCode: string;
        moduleTopics: any[];
        logs: any[];
        mentorName: string;
        assessorName: string;
        learnerSig: string;
        mentorSig: string;
        assessorSig: string;
        employerDetails: any;
    } | null>(null);
    const [isCompilingPrint, setIsCompilingPrint] = useState<boolean>(false);

    const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [scheduleContext, setScheduleContext] = useState<LearnerSubmission | null>(null); // 🚀 NEW context for modular booking
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 15;

    const urlExpanded = searchParams.get('expanded');
    const expandedModules = useMemo(() => new Set(urlExpanded ? urlExpanded.split(',') : []), [urlExpanded]);

    const toggleModuleAccordion = (moduleCode: string) => {
        setSearchParams((prev) => {
            const current = new Set(prev.get('expanded') ? prev.get('expanded')!.split(',') : []);

            // Toggle the module code in the URL
            if (current.has(moduleCode)) {
                current.delete(moduleCode);
            } else {
                current.add(moduleCode);
            }

            // Update URL or remove the param if empty
            if (current.size > 0) {
                prev.set('expanded', Array.from(current).join(','));
            } else {
                prev.delete('expanded');
            }
            return prev;
        }, { replace: true }); // Keeps the back-button history clean!
    };

    // ─── 2. EFFECTS (DATA FETCHING) ───
    useEffect(() => {
        if (!learners || !learners.length) fetchLearners();
        if (!programmes || !programmes.length) fetchProgrammes();
        if (!cohorts || !cohorts.length) fetchCohorts();
        if (!employers || !employers.length) {
            if (typeof fetchEmployers === 'function') fetchEmployers();
        }
        if (!placements || !placements.length) {
            if (typeof fetchPlacements === 'function') fetchPlacements();
        }
    }, []);

    // ─── 3. USE MEMO MAPPINGS (DEPENDENCIES FIRST) ───
    const enrollment = useMemo(() => {
        if (!routeId) return undefined;
        const records = learners.filter((l: any) => l.enrollmentId === routeId || l.id === routeId || l.learnerId === routeId);
        if (!records.length) return undefined;
        if (targetCohortId) return records.find((l: any) => l.cohortId === targetCohortId) || { ...records[0], cohortId: targetCohortId };
        return records.find((e: any) => e.status !== 'dropped') || records[0];
    }, [learners, routeId, targetCohortId]);

    const matchingProgramme = useMemo(() => {
        if (!programmes || !programmes.length || !enrollment) return null;
        const activeCohortId = targetCohortId || enrollment.cohortId;
        if (activeCohortId && cohorts.length) {
            const linked = cohorts.find((c: any) => c.id === activeCohortId);
            const templateId = (linked as any)?.programmeId || (linked as any)?.qualificationId;
            const prog = programmes.find((p: any) => p.id === templateId);
            if (prog) return prog;
        }
        return programmes.find((p: any) => String(p.saqaId || '') === String(enrollment.qualification?.saqaId || '')) || null;
    }, [programmes, cohorts, enrollment, targetCohortId]);

    // ─── CROSS-REFERENCE PLACEMENT ENGINE DATA (SYNCHRONOUS CACHE FALLBACK) ───
    const activeEmployerDetails = useMemo(() => {
        if (!enrollment || !employers || !placements) return null;

        const targetId = enrollment.learnerId || enrollment.id;

        const activePlacement = placements
            .filter((p: any) => p.learnerId === targetId && ['Active Placement', 'Pending Match', 'active'].includes(p.status))
            .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

        if (activePlacement?.employerId) {
            const matchedEmployer = employers.find((e: any) => e.id === activePlacement.employerId);
            if (matchedEmployer) {
                return {
                    companyName: matchedEmployer.name,
                    address: matchedEmployer.physicalAddress || 'Address missing in system',
                    workTelephone: matchedEmployer.contactPhone || 'Phone unlisted',
                    email: matchedEmployer.contactEmail || 'Email unlisted'
                };
            }
        }
        return null;
    }, [enrollment, employers, placements]);

    useEffect(() => {
        let mounted = true;
        if (!enrollment || !enrollment.idNumber) return;

        const loadSubmissions = async () => {
            setLoadingSubmissions(true);

            try {
                const subRef = collection(db, 'learner_submissions');
                const targetHumanId = enrollment.learnerId || enrollment.id;
                const targetAuthUid = enrollment.authUid || targetHumanId;
                const activeCohortId = targetCohortId || enrollment.cohortId;

                let subs: LearnerSubmission[] = [];

                try {
                    // 🚀 FIX: Query BOTH authUid and learnerId to prevent missing submissions!
                    let mergedDocs = new Map();

                    if (user?.role === 'learner') {
                        const snap = await getDocs(query(subRef, where('authUid', '==', user.uid)));
                        snap.docs.forEach(d => mergedDocs.set(d.id, d));
                    } else {
                        const [authSnap, idSnap] = await Promise.all([
                            getDocs(query(subRef, where('authUid', '==', targetAuthUid))),
                            getDocs(query(subRef, where('learnerId', '==', targetHumanId)))
                        ]);
                        authSnap.docs.forEach(d => mergedDocs.set(d.id, d));
                        idSnap.docs.forEach(d => mergedDocs.set(d.id, d));
                    }

                    if (activeCohortId) {
                        subs = Array.from(mergedDocs.values())
                            .map(d => ({ id: d.id, ...d.data() } as LearnerSubmission))
                            .filter(s => s.cohortId === activeCohortId || !s.cohortId);
                    } else {
                        subs = Array.from(mergedDocs.values())
                            .map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
                    }

                    // 🚀 FIX: Deduplicate Ghost Submissions
                    // If a blank 'not_started' duplicate was created, prioritize the real one.
                    const deduplicatedMap = new Map<string, LearnerSubmission>();
                    subs.forEach(sub => {
                        const existing = deduplicatedMap.get(sub.assessmentId);
                        if (!existing) {
                            deduplicatedMap.set(sub.assessmentId, sub);
                        } else {
                            const statusWeights: Record<string, number> = { 'not_started': 0, 'in_progress': 1, 'returned': 2, 'submitted': 3, 'facilitator_reviewed': 4, 'graded': 5, 'moderated': 6 };
                            const currWeight = statusWeights[sub.status] || 0;
                            const existWeight = statusWeights[existing.status] || 0;
                            if (currWeight > existWeight) {
                                deduplicatedMap.set(sub.assessmentId, sub);
                            }
                        }
                    });

                    subs = Array.from(deduplicatedMap.values());

                } catch (queryErr) {
                    console.error("Submission query error:", queryErr);
                }

                const activeAssessments = new Map();
                const draftAssessmentIds = new Set();

                try {
                    const assessmentsSnap = await getDocs(collection(db, 'assessments'));
                    assessmentsSnap.forEach(docSnap => {
                        const assData = docSnap.data();
                        const belongsToCohort = (assData.cohortIds && assData.cohortIds.includes(activeCohortId)) || (assData.cohortId === activeCohortId);

                        if (belongsToCohort || !activeCohortId) {
                            if (assData.status === 'active' || assData.status === 'scheduled' || assData.status === 'upcoming') {
                                activeAssessments.set(docSnap.id, assData);
                            } else if (assData.status === 'draft') {
                                draftAssessmentIds.add(docSnap.id);
                            }
                        }
                    });
                } catch (e) {
                    console.warn("Failed to fetch assessment metadata.", e);
                }

                subs = subs.map(sub => {
                    const matchingAss = activeAssessments.get(sub.assessmentId);
                    if (matchingAss) {
                        return {
                            ...sub,
                            isScheduled: matchingAss.isScheduled || matchingAss.status === 'scheduled',
                            scheduledDate: matchingAss.scheduledDate || null,
                            timeLimit: matchingAss.moduleInfo?.timeLimit || sub.timeLimit || 0
                        };
                    }
                    return sub;
                });

                try {
                    if (activeCohortId) {
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
                                    authUid: targetAuthUid,
                                    qualificationName: enrollment.qualification?.name || matchingProgramme?.name || "",
                                    assessmentId: astId,
                                    cohortId: activeCohortId,
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
                } catch (hydrationError) {
                    console.warn("Auto-hydration skipped due to permissions/network.");
                }

                try {
                    const logTargetId = enrollment.idNumber || targetHumanId;
                    const logsRef = collection(db, 'workplace_logs');
                    const logsQuery = query(logsRef, where('learnerId', '==', logTargetId));
                    const logsSnap = await getDocs(logsQuery);

                    if (!logsSnap.empty) {
                        let mappedLogs: LearnerSubmission[] = logsSnap.docs.map(docSnap => {
                            const data = docSnap.data();

                            let mappedStatus: LearnerSubmission['status'] = 'submitted';
                            if (data.status === 'Approved') mappedStatus = 'facilitator_reviewed';
                            if (data.status === 'Rejected') mappedStatus = 'returned';
                            if (data.status === 'Draft') mappedStatus = 'in_progress';

                            return {
                                id: docSnap.id,
                                assessmentId: data.workActivityCode || `log-${docSnap.id}`,
                                learnerId: data.learnerId || targetHumanId,
                                enrollmentId: enrollment.enrollmentId || enrollment.id,
                                authUid: targetAuthUid,
                                cohortId: data.cohortId,
                                title: data.topicTitle || data.workActivityLabel || 'Workplace Log Entry',
                                type: 'Logbook',
                                status: mappedStatus,
                                assignedAt: data.createdAt || new Date().toISOString(),
                                marks: data.totalHours || 0,
                                totalMarks: 8,
                                moduleNumber: data.workActivityCode || 'Workplace',
                                moduleType: 'workplace',
                                isScheduled: false,
                                facilitatorName: data.mentorId ? 'Mentor Assigned' : 'Unassigned',
                                rawLogData: { id: docSnap.id, ...data }
                            } as LearnerSubmission & { rawLogData?: any };
                        });

                        if (activeCohortId) {
                            mappedLogs = mappedLogs.filter(log => log.cohortId === activeCohortId);
                        }

                        subs = [...subs, ...mappedLogs];
                    }
                } catch (logErr) {
                    console.error("[DEBUG Workplace Logs] ERROR - Failed to fetch logs:", logErr);
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
    }, [enrollment, matchingProgramme, targetCohortId, user?.uid]);

    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchTerm, statusFilter]);

    // ─── PIPELINE AND FILTER MEMOS ───
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

    const filteredSubmissions = useMemo(() => {
        let filtered = submissions.filter(sub => {
            if (activeTab === 'overview') return true;
            const isPracticeActivity = INFORMAL_TYPES.includes(sub.type);
            if (activeTab === 'other') return isPracticeActivity;
            return (sub.moduleType || 'knowledge') === activeTab && !isPracticeActivity;
        });

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(sub =>
                sub.title.toLowerCase().includes(term) ||
                sub.moduleNumber?.toLowerCase().includes(term) ||
                sub.type?.toLowerCase().includes(term) ||
                sub.facilitatorName?.toLowerCase().includes(term)
            );
        }

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

    const totalPages = useMemo(() => Math.ceil(filteredSubmissions.length / itemsPerPage), [filteredSubmissions.length]);

    const paginatedSubmissions = useMemo(() => {
        return filteredSubmissions.slice(
            (currentPage - 1) * itemsPerPage,
            currentPage * itemsPerPage
        );
    }, [filteredSubmissions, currentPage]);

    const activeCohort = useMemo(() => cohorts.find((c: any) => c.id === (targetCohortId || enrollment?.cohortId)), [cohorts, targetCohortId, enrollment]);
    const activeCohortName = (enrollment as any)?.cohortName || activeCohort?.name;

    const effectiveStartDate = enrollment?.trainingStartDate || activeCohort?.startDate;
    const effectiveEndDate = (enrollment as any)?.trainingEndDate || activeCohort?.endDate;

    // ─── 4. INNER RENDER HELPERS (Must follow Memos) ───
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

    const handleTriggerCompiledModulePrint = async (moduleCode: string, logsList: any[]) => {
        try {
            setIsCompilingPrint(true);
            console.group(`🔍 QCTO BULK PRINT DYNAMIC ENGINE: Module ${moduleCode}`);

            const chronologicalLogs = [...logsList].sort((a, b) =>
                new Date(a.dateString || 0).getTime() - new Date(b.dateString || 0).getTime()
            );
            const lastApprovedLog = [...chronologicalLogs].reverse().find(l => l.status === 'Approved');
            const targetLog = lastApprovedLog || chronologicalLogs[chronologicalLogs.length - 1] || {};

            const linkedBlueprintModule = (matchingProgramme?.workExperienceModules || []).find(
                (m: any) => (m.code === moduleCode || m.name === moduleCode)
            );
            const verifiedModuleTopics = linkedBlueprintModule?.topics || [];

            // Resolve Learner Sig
            let resolvedLearnerSig = targetLog.learnerSignatureUrl || targetLog.signatureUrl || targetLog.learnerSignature || targetLog.signature || '';
            const targetLearnerId = targetLog.learnerId || enrollment?.idNumber;

            if (!resolvedLearnerSig && targetLearnerId) {
                try {
                    const learnerQuery = query(collection(db, 'users'), where('idNumber', '==', String(targetLearnerId).trim()), limit(1));
                    const querySnapshot = await getDocs(learnerQuery);
                    if (!querySnapshot.empty) {
                        resolvedLearnerSig = querySnapshot.docs[0].data().signatureUrl || '';
                    }
                } catch (e) { console.warn("Learner signature trace lookup skipped:", e); }
            }

            // Resolve Mentor Sig & Extrapolate Employer ID directly from Mentor Profile
            let resolvedMentorSig = targetLog.mentorSignatureUrl || '';
            let resolvedMentorName = targetLog.mentorName || 'Assigned Workplace Mentor';
            let resolvedEmployerId = targetLog.employerId || null;

            if (!resolvedMentorSig && (targetLog.mentorEmail || targetLog.processedBy)) {
                const targetEmail = (targetLog.mentorEmail || targetLog.processedBy).toLowerCase().trim();
                try {
                    const sigDoc = await getDoc(doc(db, 'mentor_signatures', targetEmail));
                    if (sigDoc.exists()) resolvedMentorSig = sigDoc.data().signatureUrl || '';
                } catch (e) { console.error(e); }
            }

            if (targetLog.mentorId) {
                try {
                    const profile = await getDoc(doc(db, 'users', targetLog.mentorId));
                    if (profile.exists()) {
                        const data = profile.data();
                        resolvedMentorName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
                        if (!resolvedMentorSig) {
                            resolvedMentorSig = data.signatureUrl || data.existingSignatureUrl || '';
                        }
                        // 🚀 DYNAMIC EXTRACTION: Grab Employer ID directly from the Mentor's Profile!
                        if (data.employerId) {
                            resolvedEmployerId = data.employerId;
                        }
                    }
                } catch (e) { console.error(e); }
            }

            // Resolve Assessor Sig
            let resolvedAssessorSig = targetLog.assessorSignatureUrl || '';
            let resolvedAssessorName = targetLog.assessorName || 'Unassigned Assessor';
            const targetAssessorId = targetLog.assessorId || targetLog.reviewerId;

            if (targetAssessorId && !resolvedAssessorSig) {
                try {
                    const profile = await getDoc(doc(db, 'users', targetAssessorId));
                    if (profile.exists()) {
                        const data = profile.data();
                        resolvedAssessorName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
                        resolvedAssessorSig = data.signatureUrl || '';
                    }
                } catch (e) { console.error(e); }
            }

            // 🚀 SECURE EMPLOYER DETAILS RESOLUTION (using extracted resolvedEmployerId)
            let finalEmployerDetails = activeEmployerDetails; // Fallback to cache

            if (resolvedEmployerId) {
                let matchedEmployer = employers?.find((e: any) => e.id === resolvedEmployerId);

                // If the employer is not in the Zustand store cache, fetch it directly from the DB!
                if (!matchedEmployer) {
                    try {
                        const empDoc = await getDoc(doc(db, 'employers', resolvedEmployerId));
                        if (empDoc.exists()) {
                            matchedEmployer = { id: empDoc.id, ...empDoc.data() };
                        }
                    } catch (e) { console.warn("Failed to fetch exact employer doc:", e); }
                }

                if (matchedEmployer) {
                    finalEmployerDetails = {
                        companyName: matchedEmployer.name || 'Registered Host Employer',
                        address: matchedEmployer.physicalAddress || 'Address missing in system',
                        workTelephone: matchedEmployer.contactPhone || 'Phone unlisted',
                        email: matchedEmployer.contactEmail || 'Email unlisted'
                    };
                }
            }

            console.groupEnd();

            setBulkPrintPayload({
                moduleCode,
                moduleTopics: verifiedModuleTopics,
                logs: logsList,
                mentorName: resolvedMentorName,
                assessorName: resolvedAssessorName,
                learnerSig: resolvedLearnerSig,
                mentorSig: resolvedMentorSig,
                assessorSig: resolvedAssessorSig,
                employerDetails: finalEmployerDetails // 🚀 INJECTED RESOLVED DETAILS
            });

            setTimeout(() => {
                window.print();
                setBulkPrintPayload(null);
                setIsCompilingPrint(false);
            }, 1200);

        } catch (err) {
            console.error("Batch print run failure:", err);
            setIsCompilingPrint(false);
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
                if (sub.status === 'upcoming') {
                    return <span className="mlab-badge" style={{ ...baseStyle, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}><Lock size={12} /> Coming Soon</span>;
                }
                return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1' }}><BookOpen size={12} /> Not Started</span>;
        }
    };

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

    const renderTableRow = (sub: LearnerSubmission, isGrouped: boolean) => {
        const isNYC = sub.status === 'moderated' && sub.competency === 'NYC';
        const hasPendingAppeal = sub.status === 'appealed' || sub.appeal?.status === 'pending';
        const isScheduledForFuture = sub.isScheduled && sub.scheduledDate && new Date(sub.scheduledDate).getTime() > Date.now();

        return (
            <tr key={sub.id}>
                <td style={isGrouped ? { paddingLeft: '2.5rem' } : {}}>
                    <div className="vp-assessment-cell">
                        <span className="vp-assessment-title" style={isGrouped ? { fontSize: '0.9rem' } : {}}>{sub.title}</span>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                            {sub.isScheduled && sub.scheduledDate && ['not_started', 'in_progress', 'missed', 'upcoming'].includes(sub.status) ? (
                                <span className="vp-assessment-meta" style={{ color: sub.status === 'missed' ? '#ef4444' : '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Clock size={12} />
                                    {isScheduledForFuture
                                        ? `Unlocks: ${moment(sub.scheduledDate).format('DD MMM YYYY [at] HH:mm')}`
                                        : `Scheduled: ${moment(sub.scheduledDate).format('DD MMM YYYY [at] HH:mm')}`}
                                </span>
                            ) : (
                                <span className="vp-assessment-meta">
                                    Assigned: {moment(sub.assignedAt).format('DD MMM YYYY')}
                                </span>
                            )}

                            {(sub.timeLimit && sub.timeLimit > 0) ? (
                                <span className="vp-assessment-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Timer size={12} /> {sub.timeLimit} Min Limit
                                </span>
                            ) : null}
                        </div>
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
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>

                        {/* 🚀 NEW: Contextual Scheduling Button (Visible to staff only) */}
                        {user?.role !== 'learner' && (
                            <button
                                className="mlab-btn mlab-btn--ghost mlab-btn--sm"
                                style={{ padding: '6px', color: '#0ea5e9' }}
                                title="Schedule Support Session for this Module"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setScheduleContext(sub);
                                    setShowScheduleModal(true);
                                }}
                            >
                                <Calendar size={14} />
                            </button>
                        )}

                        {/* Existing View/Remediate logic below... */}
                        {(() => {
                            const handleViewClick = () => {
                                if (sub.moduleType === 'workplace') {
                                    if (!(sub as any).rawLogData) {
                                        setSelectedLog(sub);
                                    } else {
                                        setSelectedLog((sub as any).rawLogData);
                                    }
                                    setShowLogModal(true);
                                } else {
                                    if (user?.role === 'learner') {
                                        navigate(`/learner/assessment/${sub.assessmentId}`);
                                    } else {
                                        navigate(`/portfolio/submission/${sub.id}`);
                                    }
                                }
                            };

                            if (isNYC && user?.role === 'learner' && !hasPendingAppeal) {
                                return (
                                    <button className="mlab-btn mlab-btn--warning mlab-btn--sm" onClick={handleViewClick}>
                                        <AlertCircle size={14} style={{ marginRight: '4px' }} /> Appeal / Remediate
                                    </button>
                                );
                            }

                            if (isNYC && user?.role !== 'learner' && !hasPendingAppeal) {
                                return (
                                    <button className="mlab-btn mlab-btn--warning mlab-btn--sm" disabled={isDropped} onClick={() => setRemediationTarget(sub)}>
                                        <AlertCircle size={14} style={{ marginRight: '4px' }} /> Remediate
                                    </button>
                                );
                            }

                            if (sub.status === 'missed' && user?.role !== 'learner') {
                                return (
                                    <button className="mlab-btn mlab-btn--outline" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={handleViewClick}>
                                        <ShieldAlert size={14} /> Review Absence
                                    </button>
                                );
                            }

                            if ((sub.status === 'missed' || sub.status === 'upcoming') && user?.role === 'learner') {
                                return (
                                    <button className="mlab-btn" style={{ color: sub.status === 'missed' ? '#dc2626' : '#d97706' }} onClick={handleViewClick}>
                                        <Eye size={14} /> View
                                    </button>
                                );
                            }

                            return (
                                <button className="mlab-btn" style={{ color: 'green' }} onClick={handleViewClick}>
                                    <Eye size={14} /> View
                                </button>
                            );
                        })()}
                    </div>
                </td>
            </tr>
        );
    };

    const renderTableBody = () => {
        if (sortBy === 'module') {
            const groups: Record<string, LearnerSubmission[]> = {};
            filteredSubmissions.forEach(sub => {
                const mod = sub.moduleNumber || 'Unlinked Assessments';
                if (!groups[mod]) groups[mod] = [];
                groups[mod].push(sub);
            });

            const sortedKeys = Object.keys(groups).sort((a, b) => sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a));

            return sortedKeys.map(modCode => {
                const actionableLogs = groups[modCode]
                    .filter(s => s.moduleType === 'workplace' && (s as any).rawLogData)
                    .map(s => (s as any).rawLogData);

                const groupSubs = groups[modCode];
                const isExpanded = expandedModules.has(modCode);

                const gradedCount = groupSubs.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length;
                const pendingCount = groupSubs.filter(s => ['submitted', 'facilitator_reviewed', 'returned'].includes(s.status)).length;
                const liveCount = groupSubs.filter(s => s.status === 'in_progress').length;
                const isAllDone = gradedCount === groupSubs.length && groupSubs.length > 0;

                return (
                    <React.Fragment key={modCode}>
                        <tr
                            style={{
                                background: isAllDone ? '#f0fdf4' : liveCount > 0 ? '#fef2f2' : pendingCount > 0 ? '#fff7ed' : '#f8fafc',
                                borderLeft: isAllDone ? '4px solid #22c55e' : liveCount > 0 ? '4px solid #ef4444' : pendingCount > 0 ? '4px solid #f97316' : '4px solid transparent',
                                cursor: 'pointer', transition: 'background 0.2s'
                            }}
                            onClick={() => toggleModuleAccordion(modCode)}
                        >
                            <td colSpan={sortBy !== 'module' ? 6 : 5} style={{ padding: '12px 16px', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <Layers size={16} color={isAllDone ? "var(--mlab-green)" : liveCount > 0 ? "#ef4444" : pendingCount > 0 ? "#f97316" : "var(--mlab-blue)"} />
                                        <span style={{ fontWeight: 800, color: isAllDone ? 'var(--mlab-green-dark)' : liveCount > 0 ? '#b91c1c' : pendingCount > 0 ? '#c2410c' : 'var(--mlab-blue)', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                            {modCode}
                                        </span>

                                        <div style={{ display: 'flex', gap: '6px', marginLeft: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, background: 'rgba(0,0,0,0.05)', color: '#475569', padding: '2px 8px', borderRadius: '12px' }}>
                                                {groupSubs.length} Items
                                            </span>
                                            {isAllDone && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', border: '1px solid #bbf7d0', textTransform: 'uppercase' }}>
                                                    <CheckCircle2 size={10} /> Complete
                                                </span>
                                            )}
                                            {!isAllDone && liveCount > 0 && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontWeight: 800, background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #fca5a5' }}>
                                                    <span style={{ width: '6px', height: '6px', background: '#ef4444', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                    {liveCount} Live
                                                </span>
                                            )}
                                            {!isAllDone && pendingCount > 0 && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontWeight: 700, background: '#ffedd5', color: '#9a3412', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', border: '1px solid #fed7aa' }}>
                                                    <Clock size={10} /> {pendingCount} Pending Action
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                        {activeTab === 'workplace' && actionableLogs.length > 0 && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleTriggerCompiledModulePrint(modCode, actionableLogs); }}
                                                disabled={isCompilingPrint}
                                                className="mlab-btn mlab-btn--outline mlab-btn--sm"
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', borderColor: '#cbd5e1', color: '#073f4e', fontWeight: 600, height: '28px', padding: '0 10px', cursor: 'pointer' }}
                                            >
                                                {isCompilingPrint ? <Loader2 size={12} className="vp-spin" /> : <Printer size={12} />}
                                                Print Module Logbook ({actionableLogs.length})
                                            </button>
                                        )}
                                        <div style={{ color: '#94a3b8' }}>
                                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                        </div>
                                    </div>
                                </div>
                            </td>
                        </tr>
                        {isExpanded && groups[modCode].map(sub => renderTableRow(sub, true))}
                    </React.Fragment>
                );
            });
        } else {
            return paginatedSubmissions.map(sub => renderTableRow(sub, false));
        }
    };

    // ─── 5. UI RETURN RENDER BLOCK ───
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
                <Sidebar role={user?.role} currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'} onLogout={() => signOut(auth).then(() => navigate('/login'))} />
                <main className="main-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="vp-empty-state vp-empty-state--large" style={{ padding: '3rem', border: '1px dashed #cbd5e1', background: 'white' }}>
                        <AlertTriangle size={64} color="#ef4444" />
                        <h2 style={{ marginTop: '1.5rem', color: '#0f172a' }}>Invalid Learner Data</h2>
                        <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                            This learner profile is incomplete or corrupted (Missing ID or Full Name). Grading tools are disabled to prevent database errors.
                        </p>
                        <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--primary">
                            <ChevronLeft size={16} /> Return to Directory
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    const isDropped = enrollment.status === 'dropped';

    return (
        <div className="admin-layout">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* Global Keyframes for the Live Dot Ping Animation */}
            <style>{`
                @keyframes live-dot-ping {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { transform: scale(1.2); box-shadow: 0 0 0 8px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
            `}</style>

            {remediationTarget && (
                <RemediationModal submissionTitle={remediationTarget.title} attemptNumber={remediationTarget.attemptNumber || 1} onClose={() => setRemediationTarget(null)} onSubmit={executeRemediation} />
            )}

            {showExportModal && (
                <ExportModal submissions={filteredSubmissions} onClose={() => setShowExportModal(false)} />
            )}

            {showLogModal && (
                <WorkplaceLogViewerModal log={selectedLog} allowEdit={false} onClose={() => { setShowLogModal(false); setSelectedLog(null); }} />
            )}

            {/* 🚀 NEW: Render Schedule Session Modal with Context if provided */}
            {showScheduleModal && (
                <ScheduleSessionModal
                    learner={enrollment}
                    user={user}
                    context={scheduleContext}
                    onClose={() => {
                        setShowScheduleModal(false);
                        setScheduleContext(null); // Clear context on close
                    }}
                />
            )}

            {/* ⚙️ PORTAL LAYER INJECTION FOR AGGREGATED BATCH VIEW PRINTING */}
            {bulkPrintPayload && createPortal(
                <WorkplaceModuleBulkPrintable
                    moduleCode={bulkPrintPayload.moduleCode}
                    moduleTopics={bulkPrintPayload.moduleTopics}
                    logs={bulkPrintPayload.logs}
                    learnerName={enrollment?.fullName || 'Candidate Learner'}
                    learnerIdNumber={enrollment?.idNumber || ''}
                    learnerSig={bulkPrintPayload.learnerSig}
                    mentorSig={bulkPrintPayload.mentorSig}
                    assessorSig={bulkPrintPayload.assessorSig}
                    mentorName={bulkPrintPayload.mentorName}
                    assessorName={bulkPrintPayload.assessorName}
                    employerDetails={bulkPrintPayload.employerDetails} // 🚀 INJECTED DIRECTLY FROM STATE
                />,
                document.body
            )}

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

            {isMobileMenuOpen && (
                <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={24} />
                </button>
                <Sidebar role={user?.role} currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'} onLogout={() => signOut(auth).then(() => navigate('/login'))} />
            </div>

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
                        <button onClick={() => {
                            setScheduleContext(null);
                            setShowScheduleModal(true);
                        }}
                            disabled={isDropped}
                            className="mlab-btn mlab-btn--primary">
                            <Calendar size={16} /> Schedule Session
                        </button>
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
                    <div className="vp-profile-card">
                        <div className="vp-profile-avatar">
                            {(enrollment as any).profilePhotoUrl ? (
                                <img src={(enrollment as any).profilePhotoUrl} alt="Profile" crossOrigin="anonymous" />
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
                                    <Calendar size={14} /><strong>Programme Window: </strong>
                                    {effectiveStartDate ? new Date(effectiveStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Start'}
                                    {' — '}
                                    {effectiveEndDate ? new Date(effectiveEndDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown End'}
                                </span>
                                <>
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
                                <div className="vp-card-header vp-card-header--between" style={{ borderBottom: '1px solid #cbd5e1', paddingBottom: '1rem' }}>
                                    <div className="vp-card-title-group">
                                        <h3>{TABS.find(t => t.id === activeTab)?.label} Assessments</h3>
                                    </div>
                                </div>

                                <div className="mlab-toolbar" style={{ borderTop: 'none', padding: '1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', background: '#f8fafc', borderBottom: '1px solid #cbd5e1' }}>
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
                                        <button className="mlab-btn mlab-btn--ghost" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} style={{ marginTop: '1rem' }}>
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

                                        {sortBy !== 'module' && totalPages > 1 && (
                                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--mlab-border)' }}>
                                                <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                                    <ChevronLeft size={16} /> Prev
                                                </button>
                                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                    Page {currentPage} of {totalPages}
                                                </span>
                                                <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
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
                                                {renderDocRow('Certified ID Copy', 'id', idUrl)}
                                                {renderDocRow('Highest Qualification', 'qual', qualUrl)}
                                                {renderDocRow('Updated CV', 'cv', cvUrl)}

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


// // src/components/views/ViewPortfolio/ViewPortfolio.tsx

// import React, { useEffect, useState, useMemo, useCallback } from 'react';
// import { useParams, useNavigate, useLocation } from 'react-router-dom';
// import {
//     User, Calendar, FileText, CheckCircle, AlertTriangle, AlertCircle, Clock,
//     BookOpen, Briefcase, FileBadge, Eye, Edit3,
//     ShieldCheck, Award, Loader2, BarChart2,
//     RotateCcw, Download, X, Menu, Search,
//     Filter, ChevronLeft, ChevronRight,
//     ArrowUpDown, CheckSquare, Square, Printer, Layers, ShieldAlert,
//     Timer, Lock
// } from 'lucide-react';
// import {
//     collection, query, where, getDocs, doc, getDoc, limit,
//     setDoc, updateDoc, deleteField, onSnapshot, addDoc, writeBatch
// } from 'firebase/firestore';
// import { signOut } from 'firebase/auth';
// import { auth, db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
// import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';
// import { createPortal } from 'react-dom';

// import '../AdminDashboard/AdminDashboard.css';
// import '../../components/views/LearnersView/LearnersView.css';
// import './ViewPortfolio.css';
// import Loader from '../../components/common/Loader/Loader';
// import { RemediationModal } from '../FacilitatorDashboard/SubmissionReview/SubmissionReview/SubmissionReviewModals';
// import moment from 'moment';
// import { WorkplaceLogViewerModal } from '../../components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal';

// // ─── IMPORT EXTERNAL PRINT COMPONENTS ───
// import { WorkplaceModuleBulkPrintable } from './WorkplaceModuleBulkPrintable';

// // ─── Interfaces & Types ────────────────────────────────────────────────────────

// interface LearnerSubmission {
//     id: string;
//     assessmentId: string;
//     learnerId: string;
//     enrollmentId: string;
//     authUid?: string;
//     cohortId?: string;
//     title: string;
//     type: string;
//     status: 'not_started' | 'in_progress' | 'submitted' | 'awaiting_learner_signoff' | 'facilitator_reviewed' | 'returned' | 'graded' | 'moderated' | 'appealed' | 'missed' | 'upcoming' | 'scheduled';
//     assignedAt: string;
//     startedAt?: string;
//     marks: number;
//     totalMarks: number;
//     competency?: 'C' | 'NYC';
//     moduleNumber?: string;
//     moduleType?: 'knowledge' | 'practical' | 'workplace' | 'other';
//     timeLimit?: number;
//     isScheduled?: boolean;
//     scheduledDate?: string;
//     moderation?: { outcome?: 'Endorsed' | 'Returned' };
//     appeal?: { status?: 'pending' | 'upheld' | 'rejected', reason?: string, date?: string };
//     qualificationName?: string;
//     attemptNumber?: number;
//     dueDate?: string;
//     facilitatorName?: string;
//     assessorName?: string;
//     rawLogData?: any;
// }

// type TabId = 'overview' | 'knowledge' | 'practical' | 'workplace' | 'other' | 'compliance';

// const TABS: { id: TabId; label: string; icon: any }[] = [
//     { id: 'overview', label: 'Overview', icon: BarChart2 },
//     { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
//     { id: 'practical', label: 'Practical', icon: Briefcase },
//     { id: 'workplace', label: 'Workplace', icon: Layers },
//     { id: 'compliance', label: 'Compliance', icon: FileBadge },
// ];

// const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz'];

// // ─── Global Independent Sub-Components ──────────────────────────────────────

// const getTypeBadge = (type: string) => {
//     const t = (type || '').toLowerCase();
//     const baseStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, border: 'none', textTransform: 'uppercase', letterSpacing: '0.05em' };

//     if (t.includes('formative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }}>Formative</span>;
//     if (t.includes('summative')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>Summative</span>;
//     if (t.includes('observation')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>Observation</span>;
//     if (t.includes('logbook')) return <span className="mlab-badge" style={{ ...baseStyle, background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>Logbook</span>;

//     return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1' }}>{type || 'Task'}</span>;
// };

// const SkeletonPulse: React.FC<{ className?: string, style?: React.CSSProperties }> = ({ className, style }) => (
//     <div className={`vp-skeleton ${className || ''}`} style={style} />
// );

// const TableSkeleton: React.FC = () => (
//     <div style={{ padding: '1.5rem' }}>
//         {[...Array(5)].map((_, i) => (
//             <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', alignItems: 'center' }}>
//                 <SkeletonPulse className="vp-skeleton-text" style={{ width: '40%' }} />
//                 <SkeletonPulse className="vp-skeleton-text" style={{ width: '20%' }} />
//                 <SkeletonPulse className="vp-skeleton-text" style={{ width: '15%' }} />
//                 <SkeletonPulse className="vp-skeleton-text" style={{ width: '25%' }} />
//             </div>
//         ))}
//     </div>
// );

// const ProgressRing: React.FC<{ progress: number; size?: number }> = ({ progress, size = 40 }) => {
//     const radius = 16;
//     const circumference = 2 * Math.PI * radius;
//     const strokeDashoffset = circumference - (progress / 100) * circumference;

//     return (
//         <svg width={size} height={size} viewBox="0 0 40 40" className="vp-progress-ring">
//             <circle cx="20" cy="20" r={radius} stroke="#e2e8f0" strokeWidth="4" fill="none" />
//             <circle
//                 cx="20"
//                 cy="20"
//                 r={radius}
//                 stroke="#94c73d"
//                 strokeWidth="4"
//                 fill="none"
//                 strokeDasharray={circumference}
//                 strokeDashoffset={strokeDashoffset}
//                 strokeLinecap="butt"
//                 style={{ transition: 'stroke-dashoffset 0.5s ease-out', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
//             />
//         </svg>
//     );
// };

// const PoEGenerator: React.FC<{ learnerId: string; requestedByUid: string }> = ({ learnerId, requestedByUid }) => {
//     const [generating, setGenerating] = useState(false);
//     const [progress, setProgress] = useState(0);
//     const [progressMsg, setProgressMsg] = useState('');
//     const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
//     const [errorMsg, setErrorMsg] = useState<string | null>(null);
//     const toast = useToast();

//     useEffect(() => {
//         if (!learnerId || !requestedByUid) return;

//         const q = query(
//             collection(db, 'poe_export_requests'),
//             where('learnerId', '==', learnerId),
//             where('requestedBy', '==', requestedByUid)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             if (!snapshot.empty) {
//                 const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
//                 docs.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
//                 const data = docs[0];

//                 if (data.status === 'processing') {
//                     setGenerating(true);
//                     setErrorMsg(null);
//                     setProgress(data.progress || 0);
//                     setProgressMsg(data.progressMessage || 'Initializing...');
//                 } else if (data.status === 'completed') {
//                     setGenerating(false);
//                     setProgress(100);
//                     setDownloadUrl(data.downloadUrl);
//                     if (!downloadUrl && generating) toast.success("Master PoE is ready for download!");
//                 } else if (data.status === 'error') {
//                     setGenerating(false);
//                     setErrorMsg(data.errorMessage || "Unknown error occurred.");
//                 } else if (data.status === 'dismissed') {
//                     setErrorMsg(null);
//                     setGenerating(false);
//                 }
//             }
//         });
//         return () => unsubscribe();
//     }, [learnerId, requestedByUid, downloadUrl, generating, toast]);

//     const handleGeneratePoE = async () => {
//         setGenerating(true);
//         setProgress(0);
//         setProgressMsg('Preparing request...');
//         setErrorMsg(null);
//         try {
//             await addDoc(collection(db, 'poe_export_requests'), {
//                 learnerId, requestedBy: requestedByUid, status: 'processing',
//                 progress: 0, progressMessage: 'Initializing...', requestedAt: new Date().toISOString()
//             });
//         } catch (error: any) {
//             setErrorMsg(error.message);
//             setGenerating(false);
//         }
//     };

//     const handleDismissError = async () => {
//         setErrorMsg(null);
//         try {
//             const q = query(collection(db, 'poe_export_requests'), where('learnerId', '==', learnerId), where('requestedBy', '==', requestedByUid));
//             const snap = await getDocs(q);
//             if (!snap.empty) {
//                 const latest = snap.docs.sort((a, b) => new Date(b.data().requestedAt).getTime() - new Date(a.data().requestedAt).getTime())[0];
//                 await updateDoc(doc(db, 'poe_export_requests', latest.id), { status: 'dismissed' });
//             }
//         } catch (err) { console.error(err); }
//     };

//     return (
//         <div className="vp-poe-card">
//             <div className="vp-poe-header">
//                 <div className="vp-poe-title-group">
//                     <div className="vp-poe-icon">
//                         <FileText size={24} />
//                     </div>
//                     <div>
//                         <h3 className="vp-poe-title">Master Portfolio of Evidence</h3>
//                         <p className="vp-poe-desc">Generate a complete, QCTO-compliant PDF PoE for this learner</p>
//                     </div>
//                 </div>

//                 <div className="vp-poe-actions">
//                     {generating ? (
//                         <div className="vp-poe-progress">
//                             <ProgressRing progress={progress} size={44} />
//                             <div className="vp-poe-progress-info">
//                                 <span className="vp-poe-progress-percent">{progress}%</span>
//                                 <span className="vp-poe-progress-msg">{progressMsg}</span>
//                             </div>
//                         </div>
//                     ) : downloadUrl ? (
//                         <>
//                             <a
//                                 href={downloadUrl}
//                                 target="_blank"
//                                 rel="noreferrer"
//                                 className="mlab-btn mlab-btn--success"
//                                 style={{ color: 'green', textDecoration: 'none' }}
//                             >
//                                 <Download size={16} /> Download PoE
//                             </a>
//                             <button onClick={handleGeneratePoE} className="mlab-btn mlab-btn--ghost">
//                                 <RotateCcw size={16} /> Regenerate
//                             </button>
//                         </>
//                     ) : (
//                         <button onClick={handleGeneratePoE} className="mlab-btn mlab-btn--primary">
//                             <FileText size={16} /> Generate Master PoE
//                         </button>
//                     )}
//                 </div>
//             </div>

//             {errorMsg && (
//                 <div className="vp-alert vp-alert--error">
//                     <div className="vp-alert-content">
//                         <AlertTriangle size={18} />
//                         <div>
//                             <strong>Generation Failed</strong>
//                             <p>{errorMsg}</p>
//                         </div>
//                     </div>
//                     <button onClick={handleDismissError} className="vp-alert-close">
//                         <X size={16} />
//                     </button>
//                 </div>
//             )}

//             <div className="vp-poe-notice">
//                 <AlertTriangle size={16} />
//                 <span><strong>Compliance Note:</strong> Ensure all modules are Moderated before final export for auditors.</span>
//             </div>
//         </div>
//     );
// };

// const ExportModal: React.FC<{
//     submissions: LearnerSubmission[];
//     onClose: () => void;
// }> = ({ submissions, onClose }) => {
//     const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
//     const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');
//     const [exporting, setExporting] = useState(false);

//     const toggleAll = useCallback(() => {
//         if (selectedIds.size === submissions.length) setSelectedIds(new Set());
//         else setSelectedIds(new Set(submissions.map(s => s.id)));
//     }, [selectedIds, submissions]);

//     const toggleOne = useCallback((id: string) => {
//         const next = new Set(selectedIds);
//         if (next.has(id)) next.delete(id);
//         else next.add(id);
//         setSelectedIds(next);
//     }, [selectedIds]);

//     const handleExport = async () => {
//         setExporting(true);
//         await new Promise(r => setTimeout(r, 1500));
//         setExporting(false);
//         onClose();
//     };

//     return createPortal(
//         <div className="mlab-modal-overlay" onClick={onClose}>
//             <div className="mlab-modal-window mlab-modal-window--md" onClick={e => e.stopPropagation()}>
//                 <div className="mlab-modal-header">
//                     <h2 className="mlab-modal-title">
//                         <Download size={18} /> Export Assessment Data
//                     </h2>
//                     <button className="mlab-modal-close" onClick={onClose}><X size={20} /></button>
//                 </div>

//                 <div className="mlab-modal-body" style={{ padding: 0 }}>
//                     <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--mlab-border)', background: 'var(--mlab-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                             <span style={{ fontSize: '0.85rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Format:</span>
//                             <select value={format} onChange={e => setFormat(e.target.value as any)} style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', outline: 'none' }}>
//                                 <option value="pdf">PDF Report</option>
//                                 <option value="csv">CSV Spreadsheet</option>
//                             </select>
//                         </div>
//                         <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={toggleAll}>
//                             {selectedIds.size === submissions.length ? <CheckSquare size={14} /> : <Square size={14} />}
//                             {selectedIds.size === submissions.length ? 'Deselect All' : 'Select All'}
//                         </button>
//                     </div>

//                     <div style={{ maxHeight: 350, overflowY: 'auto' }}>
//                         {submissions.map(sub => (
//                             <div key={sub.id}
//                                 style={{
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     gap: '12px',
//                                     padding: '12px 20px',
//                                     borderBottom: '1px solid var(--mlab-border)',
//                                     cursor: 'pointer',
//                                     background: selectedIds.has(sub.id) ? 'var(--mlab-green-bg)' : 'white'
//                                 }}
//                                 onClick={() => toggleOne(sub.id)}
//                             >
//                                 {selectedIds.has(sub.id) ? <CheckSquare size={18} color="var(--mlab-green)" /> : <Square size={18} color="var(--mlab-grey-light)" />}
//                                 <div style={{ flex: 1 }}>
//                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.9rem', display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                         {sub.title}
//                                     </div>
//                                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
//                                         <span>{sub.moduleNumber || 'General'}</span>
//                                         {getTypeBadge(sub.type)}
//                                         <span>• {sub.status.replace('_', ' ')}</span>
//                                     </div>
//                                 </div>
//                             </div>
//                         ))}
//                     </div>
//                 </div>

//                 <div className="mlab-modal-footer">
//                     <button onClick={onClose} className="mlab-btn mlab-btn--ghost">Cancel</button>
//                     <button
//                         onClick={handleExport}
//                         disabled={selectedIds.size === 0 || exporting}
//                         className="mlab-btn mlab-btn--primary"
//                     >
//                         {exporting ? <Loader2 size={16} className="vp-spin" /> : <Download size={16} />}
//                         Export {selectedIds.size > 0 && `(${selectedIds.size})`}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// // ==========================================================================
// // 🚀 MAIN APPLICATION DASHBOARD VIEW
// // ==========================================================================
// export const ViewPortfolio: React.FC = () => {
//     const { id: routeId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();
//     const toast = useToast();
//     const targetCohortId = (location.state as any)?.cohortId;

//     // ─── 1. REACT HOOKS AND STATES ───
//     const {
//         user, learners, learnersLoading, programmes, cohorts,
//         fetchLearners, fetchProgrammes, fetchCohorts,
//         employers, fetchEmployers,
//         placements, fetchPlacements
//     } = useStore() as any;

//     const [submissions, setSubmissions] = useState<LearnerSubmission[]>([]);
//     const [loadingSubmissions, setLoadingSubmissions] = useState(true);
//     const [activeTab, setActiveTab] = useState<TabId>('overview');
//     const [searchTerm, setSearchTerm] = useState('');
//     const [statusFilter, setStatusFilter] = useState<string>('all');
//     const [sortBy, setSortBy] = useState<'module' | 'date' | 'status' | 'title'>('module');
//     const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

//     const [showLogModal, setShowLogModal] = useState(false);
//     const [selectedLog, setSelectedLog] = useState<any>(null);

//     const [bulkPrintPayload, setBulkPrintPayload] = useState<{
//         moduleCode: string;
//         moduleTopics: any[];
//         logs: any[];
//         mentorName: string;
//         assessorName: string;
//         learnerSig: string;
//         mentorSig: string;
//         assessorSig: string;
//         employerDetails: any;
//     } | null>(null);
//     const [isCompilingPrint, setIsCompilingPrint] = useState<boolean>(false);

//     const [remediationTarget, setRemediationTarget] = useState<LearnerSubmission | null>(null);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [showExportModal, setShowExportModal] = useState(false);
//     const [currentPage, setCurrentPage] = useState(1);
//     const itemsPerPage = 15;

//     // ─── 2. EFFECTS (DATA FETCHING) ───
//     useEffect(() => {
//         if (!learners || !learners.length) fetchLearners();
//         if (!programmes || !programmes.length) fetchProgrammes();
//         if (!cohorts || !cohorts.length) fetchCohorts();
//         if (!employers || !employers.length) {
//             if (typeof fetchEmployers === 'function') fetchEmployers();
//         }
//         if (!placements || !placements.length) {
//             if (typeof fetchPlacements === 'function') fetchPlacements();
//         }
//     }, []);

//     // ─── 3. USE MEMO MAPPINGS (DEPENDENCIES FIRST) ───
//     const enrollment = useMemo(() => {
//         if (!routeId) return undefined;
//         const records = learners.filter((l: any) => l.enrollmentId === routeId || l.id === routeId || l.learnerId === routeId);
//         if (!records.length) return undefined;
//         if (targetCohortId) return records.find((l: any) => l.cohortId === targetCohortId) || { ...records[0], cohortId: targetCohortId };
//         return records.find((e: any) => e.status !== 'dropped') || records[0];
//     }, [learners, routeId, targetCohortId]);

//     const matchingProgramme = useMemo(() => {
//         if (!programmes || !programmes.length || !enrollment) return null;
//         const activeCohortId = targetCohortId || enrollment.cohortId;
//         if (activeCohortId && cohorts.length) {
//             const linked = cohorts.find((c: any) => c.id === activeCohortId);
//             const templateId = (linked as any)?.programmeId || (linked as any)?.qualificationId;
//             const prog = programmes.find((p: any) => p.id === templateId);
//             if (prog) return prog;
//         }
//         return programmes.find((p: any) => String(p.saqaId || '') === String(enrollment.qualification?.saqaId || '')) || null;
//     }, [programmes, cohorts, enrollment, targetCohortId]);

//     // ─── CROSS-REFERENCE PLACEMENT ENGINE DATA (SYNCHRONOUS CACHE FALLBACK) ───
//     const activeEmployerDetails = useMemo(() => {
//         if (!enrollment || !employers || !placements) return null;

//         const targetId = enrollment.learnerId || enrollment.id;

//         const activePlacement = placements
//             .filter((p: any) => p.learnerId === targetId && ['Active Placement', 'Pending Match', 'active'].includes(p.status))
//             .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

//         if (activePlacement?.employerId) {
//             const matchedEmployer = employers.find((e: any) => e.id === activePlacement.employerId);
//             if (matchedEmployer) {
//                 return {
//                     companyName: matchedEmployer.name,
//                     address: matchedEmployer.physicalAddress || 'Address missing in system',
//                     workTelephone: matchedEmployer.contactPhone || 'Phone unlisted',
//                     email: matchedEmployer.contactEmail || 'Email unlisted'
//                 };
//             }
//         }
//         return null;
//     }, [enrollment, employers, placements]);

//     useEffect(() => {
//         let mounted = true;
//         if (!enrollment || !enrollment.idNumber) return;

//         const loadSubmissions = async () => {
//             setLoadingSubmissions(true);

//             try {
//                 const subRef = collection(db, 'learner_submissions');
//                 const targetHumanId = enrollment.learnerId || enrollment.id;
//                 const targetAuthUid = enrollment.authUid || targetHumanId;
//                 const activeCohortId = targetCohortId || enrollment.cohortId;

//                 let subs: LearnerSubmission[] = [];

//                 try {
//                     let subSnap;
//                     if (user?.role === 'learner') {
//                         subSnap = await getDocs(query(subRef, where('authUid', '==', user.uid)));
//                     } else {
//                         subSnap = await getDocs(query(subRef, where('learnerId', '==', targetHumanId)));
//                     }

//                     if (activeCohortId) {
//                         subs = subSnap.docs
//                             .map(d => ({ id: d.id, ...d.data() } as LearnerSubmission))
//                             .filter(s => s.cohortId === activeCohortId || !s.cohortId);
//                     } else {
//                         subs = subSnap.docs.map(d => ({ id: d.id, ...d.data() } as LearnerSubmission));
//                     }
//                 } catch (queryErr) {
//                     console.error("Submission query error:", queryErr);
//                 }

//                 const activeAssessments = new Map();
//                 const draftAssessmentIds = new Set();

//                 try {
//                     const assessmentsSnap = await getDocs(collection(db, 'assessments'));
//                     assessmentsSnap.forEach(docSnap => {
//                         const assData = docSnap.data();
//                         const belongsToCohort = (assData.cohortIds && assData.cohortIds.includes(activeCohortId)) || (assData.cohortId === activeCohortId);

//                         if (belongsToCohort || !activeCohortId) {
//                             if (assData.status === 'active' || assData.status === 'scheduled' || assData.status === 'upcoming') {
//                                 activeAssessments.set(docSnap.id, assData);
//                             } else if (assData.status === 'draft') {
//                                 draftAssessmentIds.add(docSnap.id);
//                             }
//                         }
//                     });
//                 } catch (e) {
//                     console.warn("Failed to fetch assessment metadata.", e);
//                 }

//                 subs = subs.map(sub => {
//                     const matchingAss = activeAssessments.get(sub.assessmentId);
//                     if (matchingAss) {
//                         return {
//                             ...sub,
//                             isScheduled: matchingAss.isScheduled || matchingAss.status === 'scheduled',
//                             scheduledDate: matchingAss.scheduledDate || null,
//                             timeLimit: matchingAss.moduleInfo?.timeLimit || sub.timeLimit || 0
//                         };
//                     }
//                     return sub;
//                 });

//                 try {
//                     if (activeCohortId) {
//                         const batch = writeBatch(db);
//                         let batchCount = 0;

//                         subs = subs.filter(sub => {
//                             if (draftAssessmentIds.has(sub.assessmentId) && sub.status === 'not_started') {
//                                 batch.delete(doc(db, 'learner_submissions', sub.id));
//                                 batchCount++;
//                                 return false;
//                             }
//                             return true;
//                         });

//                         const existingAssIds = new Set(subs.map(s => s.assessmentId));

//                         for (const [astId, assData] of activeAssessments.entries()) {
//                             if (!existingAssIds.has(astId)) {
//                                 const sid = `${activeCohortId}_${targetHumanId}_${astId}`;
//                                 const newSub = {
//                                     learnerId: targetHumanId,
//                                     enrollmentId: enrollment.enrollmentId || enrollment.id,
//                                     authUid: targetAuthUid,
//                                     qualificationName: enrollment.qualification?.name || matchingProgramme?.name || "",
//                                     assessmentId: astId,
//                                     cohortId: activeCohortId,
//                                     title: assData.title,
//                                     type: assData.type || 'formative',
//                                     moduleType: assData.moduleType || 'knowledge',
//                                     status: assData.status === 'upcoming' ? 'upcoming' : 'not_started',
//                                     assignedAt: new Date().toISOString(),
//                                     marks: 0,
//                                     totalMarks: assData.totalMarks || 0,
//                                     moduleNumber: assData.moduleInfo?.moduleNumber || "",
//                                     timeLimit: assData.moduleInfo?.timeLimit || 0,
//                                     isScheduled: assData.isScheduled || assData.status === 'scheduled' || false,
//                                     scheduledDate: assData.scheduledDate || null,
//                                     createdAt: new Date().toISOString(),
//                                     createdBy: "System_AutoHydration"
//                                 };

//                                 batch.set(doc(db, "learner_submissions", sid), newSub);
//                                 subs.push({ id: sid, ...newSub } as LearnerSubmission);
//                                 batchCount++;
//                             }
//                         }

//                         if (batchCount > 0) {
//                             await batch.commit();
//                         }
//                     }
//                 } catch (hydrationError) {
//                     console.warn("Auto-hydration skipped due to permissions/network.");
//                 }

//                 try {
//                     const logTargetId = enrollment.idNumber || targetHumanId;
//                     const logsRef = collection(db, 'workplace_logs');
//                     const logsQuery = query(logsRef, where('learnerId', '==', logTargetId));
//                     const logsSnap = await getDocs(logsQuery);

//                     if (!logsSnap.empty) {
//                         let mappedLogs: LearnerSubmission[] = logsSnap.docs.map(docSnap => {
//                             const data = docSnap.data();

//                             let mappedStatus: LearnerSubmission['status'] = 'submitted';
//                             if (data.status === 'Approved') mappedStatus = 'facilitator_reviewed';
//                             if (data.status === 'Rejected') mappedStatus = 'returned';
//                             if (data.status === 'Draft') mappedStatus = 'in_progress';

//                             return {
//                                 id: docSnap.id,
//                                 assessmentId: data.workActivityCode || `log-${docSnap.id}`,
//                                 learnerId: data.learnerId || targetHumanId,
//                                 enrollmentId: enrollment.enrollmentId || enrollment.id,
//                                 authUid: targetAuthUid,
//                                 cohortId: data.cohortId,
//                                 title: data.topicTitle || data.workActivityLabel || 'Workplace Log Entry',
//                                 type: 'Logbook',
//                                 status: mappedStatus,
//                                 assignedAt: data.createdAt || new Date().toISOString(),
//                                 marks: data.totalHours || 0,
//                                 totalMarks: 8,
//                                 moduleNumber: data.workActivityCode || 'Workplace',
//                                 moduleType: 'workplace',
//                                 isScheduled: false,
//                                 facilitatorName: data.mentorId ? 'Mentor Assigned' : 'Unassigned',
//                                 rawLogData: { id: docSnap.id, ...data }
//                             } as LearnerSubmission & { rawLogData?: any };
//                         });

//                         if (activeCohortId) {
//                             mappedLogs = mappedLogs.filter(log => log.cohortId === activeCohortId);
//                         }

//                         subs = [...subs, ...mappedLogs];
//                     }
//                 } catch (logErr) {
//                     console.error("[DEBUG Workplace Logs] ERROR - Failed to fetch logs:", logErr);
//                 }

//                 if (mounted) {
//                     setSubmissions(subs.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime()));
//                     setLoadingSubmissions(false);
//                 }

//             } catch (err) {
//                 console.error("Error loading portfolio submissions:", err);
//                 if (mounted) setLoadingSubmissions(false);
//             }
//         };

//         loadSubmissions();

//         return () => { mounted = false; };
//     }, [enrollment, matchingProgramme, targetCohortId, user?.uid]);

//     useEffect(() => {
//         setCurrentPage(1);
//     }, [activeTab, searchTerm, statusFilter]);

//     // ─── PIPELINE AND FILTER MEMOS ───
//     const pipelineStats = useMemo(() => {
//         const total = submissions.length;
//         if (total === 0) return { total: 0, submitted: 0, facReviewed: 0, graded: 0, moderated: 0 };
//         return {
//             total,
//             submitted: submissions.filter(s => !['not_started', 'in_progress', 'missed'].includes(s.status)).length,
//             facReviewed: submissions.filter(s => ['facilitator_reviewed', 'graded', 'moderated', 'appealed', 'returned'].includes(s.status)).length,
//             graded: submissions.filter(s => ['graded', 'moderated', 'appealed'].includes(s.status)).length,
//             moderated: submissions.filter(s => s.status === 'moderated').length,
//         };
//     }, [submissions]);

//     const filteredSubmissions = useMemo(() => {
//         let filtered = submissions.filter(sub => {
//             if (activeTab === 'overview') return true;
//             const isPracticeActivity = INFORMAL_TYPES.includes(sub.type);
//             if (activeTab === 'other') return isPracticeActivity;
//             return (sub.moduleType || 'knowledge') === activeTab && !isPracticeActivity;
//         });

//         if (searchTerm) {
//             const term = searchTerm.toLowerCase();
//             filtered = filtered.filter(sub =>
//                 sub.title.toLowerCase().includes(term) ||
//                 sub.moduleNumber?.toLowerCase().includes(term) ||
//                 sub.type?.toLowerCase().includes(term) ||
//                 sub.facilitatorName?.toLowerCase().includes(term)
//             );
//         }

//         if (statusFilter !== 'all') {
//             filtered = filtered.filter(sub => {
//                 if (statusFilter === 'competent') return sub.status === 'moderated' && sub.competency === 'C';
//                 if (statusFilter === 'nyc') return sub.status === 'moderated' && sub.competency === 'NYC';
//                 if (statusFilter === 'pending') return ['submitted', 'facilitator_reviewed', 'graded'].includes(sub.status);
//                 if (statusFilter === 'active') return ['in_progress', 'not_started'].includes(sub.status);
//                 if (statusFilter === 'missed') return sub.status === 'missed';
//                 return sub.status === statusFilter;
//             });
//         }

//         filtered.sort((a, b) => {
//             let comparison = 0;
//             switch (sortBy) {
//                 case 'module':
//                     comparison = (a.moduleNumber || 'ZZZ').localeCompare(b.moduleNumber || 'ZZZ');
//                     break;
//                 case 'date':
//                     comparison = new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
//                     break;
//                 case 'title':
//                     comparison = a.title.localeCompare(b.title);
//                     break;
//                 case 'status':
//                     const statusOrder = ['not_started', 'in_progress', 'submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed', 'missed'];
//                     comparison = statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status);
//                     break;
//             }
//             return sortOrder === 'asc' ? comparison * -1 : comparison;
//         });

//         return filtered;
//     }, [submissions, activeTab, searchTerm, statusFilter, sortBy, sortOrder]);

//     const totalPages = useMemo(() => Math.ceil(filteredSubmissions.length / itemsPerPage), [filteredSubmissions.length]);

//     const paginatedSubmissions = useMemo(() => {
//         return filteredSubmissions.slice(
//             (currentPage - 1) * itemsPerPage,
//             currentPage * itemsPerPage
//         );
//     }, [filteredSubmissions, currentPage]);

//     const activeCohort = useMemo(() => cohorts.find((c: any) => c.id === (targetCohortId || enrollment?.cohortId)), [cohorts, targetCohortId, enrollment]);
//     const activeCohortName = (enrollment as any)?.cohortName || activeCohort?.name;

//     const effectiveStartDate = enrollment?.trainingStartDate || activeCohort?.startDate;
//     const effectiveEndDate = (enrollment as any)?.trainingEndDate || activeCohort?.endDate;

//     // ─── 4. INNER RENDER HELPERS (Must follow Memos) ───
//     const executeRemediation = async (date: string, notes: string) => {
//         if (!remediationTarget) return;
//         const s = remediationTarget;
//         setRemediationTarget(null);
//         try {
//             await setDoc(doc(collection(db, 'learner_submissions', s.id, 'history')), { ...s, archivedAt: new Date().toISOString() });
//             await updateDoc(doc(db, 'learner_submissions', s.id), {
//                 status: 'in_progress',
//                 competency: deleteField(),
//                 grading: deleteField(),
//                 moderation: deleteField(),
//                 submittedAt: deleteField(),
//                 attemptNumber: (s.attemptNumber || 1) + 1,
//                 remediationDate: date,
//                 remediationNotes: notes,
//                 remediatedBy: user?.uid,
//                 remediatedAt: new Date().toISOString()
//             });
//             setSubmissions(p => p.map(x => x.id === s.id ? { ...x, status: 'in_progress', competency: undefined, attemptNumber: (x.attemptNumber || 1) + 1 } : x));
//             toast.success("Workbook unlocked for next attempt!");
//         } catch {
//             toast.error("Failed to unlock workbook.");
//         }
//     };

//     const handleTriggerCompiledModulePrint = async (moduleCode: string, logsList: any[]) => {
//         try {
//             setIsCompilingPrint(true);
//             console.group(`🔍 QCTO BULK PRINT DYNAMIC ENGINE: Module ${moduleCode}`);

//             const chronologicalLogs = [...logsList].sort((a, b) =>
//                 new Date(a.dateString || 0).getTime() - new Date(b.dateString || 0).getTime()
//             );
//             const lastApprovedLog = [...chronologicalLogs].reverse().find(l => l.status === 'Approved');
//             const targetLog = lastApprovedLog || chronologicalLogs[chronologicalLogs.length - 1] || {};

//             const linkedBlueprintModule = (matchingProgramme?.workExperienceModules || []).find(
//                 (m: any) => (m.code === moduleCode || m.name === moduleCode)
//             );
//             const verifiedModuleTopics = linkedBlueprintModule?.topics || [];

//             // Resolve Learner Sig
//             let resolvedLearnerSig = targetLog.learnerSignatureUrl || targetLog.signatureUrl || targetLog.learnerSignature || targetLog.signature || '';
//             const targetLearnerId = targetLog.learnerId || enrollment?.idNumber;

//             if (!resolvedLearnerSig && targetLearnerId) {
//                 try {
//                     const learnerQuery = query(collection(db, 'users'), where('idNumber', '==', String(targetLearnerId).trim()), limit(1));
//                     const querySnapshot = await getDocs(learnerQuery);
//                     if (!querySnapshot.empty) {
//                         resolvedLearnerSig = querySnapshot.docs[0].data().signatureUrl || '';
//                     }
//                 } catch (e) { console.warn("Learner signature trace lookup skipped:", e); }
//             }

//             // Resolve Mentor Sig & Extrapolate Employer ID directly from Mentor Profile
//             let resolvedMentorSig = targetLog.mentorSignatureUrl || '';
//             let resolvedMentorName = targetLog.mentorName || 'Assigned Workplace Mentor';
//             let resolvedEmployerId = targetLog.employerId || null;

//             if (!resolvedMentorSig && (targetLog.mentorEmail || targetLog.processedBy)) {
//                 const targetEmail = (targetLog.mentorEmail || targetLog.processedBy).toLowerCase().trim();
//                 try {
//                     const sigDoc = await getDoc(doc(db, 'mentor_signatures', targetEmail));
//                     if (sigDoc.exists()) resolvedMentorSig = sigDoc.data().signatureUrl || '';
//                 } catch (e) { console.error(e); }
//             }

//             if (targetLog.mentorId) {
//                 try {
//                     const profile = await getDoc(doc(db, 'users', targetLog.mentorId));
//                     if (profile.exists()) {
//                         const data = profile.data();
//                         resolvedMentorName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
//                         if (!resolvedMentorSig) {
//                             resolvedMentorSig = data.signatureUrl || data.existingSignatureUrl || '';
//                         }
//                         // 🚀 DYNAMIC EXTRACTION: Grab Employer ID directly from the Mentor's Profile!
//                         if (data.employerId) {
//                             resolvedEmployerId = data.employerId;
//                         }
//                     }
//                 } catch (e) { console.error(e); }
//             }

//             // Resolve Assessor Sig
//             let resolvedAssessorSig = targetLog.assessorSignatureUrl || '';
//             let resolvedAssessorName = targetLog.assessorName || 'Unassigned Assessor';
//             const targetAssessorId = targetLog.assessorId || targetLog.reviewerId;

//             if (targetAssessorId && !resolvedAssessorSig) {
//                 try {
//                     const profile = await getDoc(doc(db, 'users', targetAssessorId));
//                     if (profile.exists()) {
//                         const data = profile.data();
//                         resolvedAssessorName = data.fullName || `${data.firstName || ''} ${data.lastName || ''}`.trim();
//                         resolvedAssessorSig = data.signatureUrl || '';
//                     }
//                 } catch (e) { console.error(e); }
//             }

//             // 🚀 SECURE EMPLOYER DETAILS RESOLUTION (using extracted resolvedEmployerId)
//             let finalEmployerDetails = activeEmployerDetails; // Fallback to cache

//             if (resolvedEmployerId) {
//                 let matchedEmployer = employers?.find((e: any) => e.id === resolvedEmployerId);

//                 // If the employer is not in the Zustand store cache, fetch it directly from the DB!
//                 if (!matchedEmployer) {
//                     try {
//                         const empDoc = await getDoc(doc(db, 'employers', resolvedEmployerId));
//                         if (empDoc.exists()) {
//                             matchedEmployer = { id: empDoc.id, ...empDoc.data() };
//                         }
//                     } catch (e) { console.warn("Failed to fetch exact employer doc:", e); }
//                 }

//                 if (matchedEmployer) {
//                     finalEmployerDetails = {
//                         companyName: matchedEmployer.name || 'Registered Host Employer',
//                         address: matchedEmployer.physicalAddress || 'Address missing in system',
//                         workTelephone: matchedEmployer.contactPhone || 'Phone unlisted',
//                         email: matchedEmployer.contactEmail || 'Email unlisted'
//                     };
//                 }
//             }

//             console.groupEnd();

//             setBulkPrintPayload({
//                 moduleCode,
//                 moduleTopics: verifiedModuleTopics,
//                 logs: logsList,
//                 mentorName: resolvedMentorName,
//                 assessorName: resolvedAssessorName,
//                 learnerSig: resolvedLearnerSig,
//                 mentorSig: resolvedMentorSig,
//                 assessorSig: resolvedAssessorSig,
//                 employerDetails: finalEmployerDetails // 🚀 INJECTED RESOLVED DETAILS
//             });

//             setTimeout(() => {
//                 window.print();
//                 setBulkPrintPayload(null);
//                 setIsCompilingPrint(false);
//             }, 1200);

//         } catch (err) {
//             console.error("Batch print run failure:", err);
//             setIsCompilingPrint(false);
//         }
//     };

//     const getStatusBadge = (sub: LearnerSubmission) => {
//         const baseStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, border: 'none', textTransform: 'uppercase' };

//         if (sub.status === 'appealed' || sub.appeal?.status === 'pending') {
//             return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}><AlertTriangle size={12} /> Appeal Pending</span>;
//         }

//         const role = user?.role || 'learner';
//         const isWorkplace = sub.moduleType === 'workplace';

//         switch (sub.status) {
//             case 'moderated':
//                 return sub.competency === 'C'
//                     ? <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><Award size={12} /> Competent</span>
//                     : <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> NYC</span>;

//             case 'graded':
//                 if (role === 'moderator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><ShieldCheck size={12} /> Ready for QA</span>;
//                 if (role === 'admin') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' }}><Clock size={12} /> Awaiting QA</span>;
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#fef9c3', color: '#854d0e', border: '1px solid #fef08a' }}><CheckCircle size={12} /> QA Pending</span>;

//             case 'facilitator_reviewed':
//                 if (role === 'assessor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><Award size={12} /> Ready for Grading</span>;
//                 if (role === 'admin' || role === 'moderator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><Clock size={12} /> Awaiting Grading</span>;
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#f3e8ff', color: '#6d28d9', border: '1px solid #e9d5ff' }}><Eye size={12} /> {isWorkplace ? 'Verified' : 'Pre-Marked'}</span>;

//             case 'awaiting_learner_signoff':
//                 if (role === 'learner') return <span className="mlab-badge" style={{ ...baseStyle, background: '#ffedd5', color: '#c2410c', border: '1px solid #fed7aa' }}><Edit3 size={12} /> Action Required</span>;
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' }}><Clock size={12} /> Awaiting Sign-off</span>;

//             case 'returned':
//                 if (role === 'learner') return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca' }}><AlertCircle size={12} /> Revision Required</span>;
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' }}><RotateCcw size={12} /> Returned</span>;

//             case 'submitted':
//                 if (role === 'facilitator') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Eye size={12} /> Awaiting Pre-Marking</span>;
//                 if (role === 'mentor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><ShieldCheck size={12} /> Awaiting Verification</span>;
//                 if (role === 'admin' || role === 'assessor') return <span className="mlab-badge" style={{ ...baseStyle, background: '#e0e7ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}><Clock size={12} /> Awaiting Facilitator</span>;
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Submitted</span>;

//             case 'in_progress':
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' }}><Edit3 size={12} /> In Progress (Att. {sub.attemptNumber || 1})</span>;

//             case 'missed':
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}><AlertTriangle size={12} /> Missed</span>;

//             default:
//                 if (sub.status === 'upcoming') {
//                     return <span className="mlab-badge" style={{ ...baseStyle, background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}><Lock size={12} /> Coming Soon</span>;
//                 }
//                 return <span className="mlab-badge" style={{ ...baseStyle, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1' }}><BookOpen size={12} /> Not Started</span>;
//         }
//     };

//     const renderPipelineBar = (label: string, value: number, total: number, variant: string) => {
//         const pct = total > 0 ? Math.round((value / total) * 100) : 0;
//         return (
//             <div className="vp-pipeline-item" key={label}>
//                 <div className="vp-pipeline-header">
//                     <span className="vp-pipeline-label">{label}</span>
//                     <span className="vp-pipeline-stat">{value}/{total} ({pct}%)</span>
//                 </div>
//                 <div className="vp-pipeline-track">
//                     <div className={`vp-pipeline-fill vp-pipeline-fill--${variant}`} style={{ width: `${pct}%` }} />
//                 </div>
//             </div>
//         );
//     };

//     const renderCurriculumGroup = (modules: any[] | undefined, typeLabel: string) => {
//         if (!modules || modules.length === 0) return <p className="vp-curr-empty">No {typeLabel} modules defined.</p>;
//         return (
//             <ul className="vp-curr-list">
//                 {modules.map((mod, idx) => {
//                     const moduleSubs = submissions.filter(s => s.moduleNumber === mod.code || s.moduleNumber === mod.name);

//                     let stateKey = 'pending';
//                     if (moduleSubs.length > 0) {
//                         const allDone = moduleSubs.every(s => ['graded', 'moderated', 'appealed'].includes(s.status));
//                         stateKey = allDone ? 'done' : 'active';
//                     }

//                     return (
//                         <li key={idx} className={`vp-curr-item vp-curr-item--${stateKey}`} style={{ flexDirection: 'column', alignItems: 'stretch', padding: '12px 16px' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                     <div className="vp-curr-icon">
//                                         {stateKey === 'done' ? <CheckCircle size={16} /> : stateKey === 'active' ? <Clock size={16} /> : <AlertCircle size={16} />}
//                                     </div>
//                                     <div className="vp-curr-info">
//                                         <span className="vp-curr-code">{mod.code || `M${idx + 1}`}</span>
//                                         <span className="vp-curr-name">{mod.name}</span>
//                                     </div>
//                                 </div>

//                                 {moduleSubs.length === 0 && (
//                                     <span className="mlab-badge mlab-badge--ghost" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: '#f8fafc', color: '#64748b', border: '1px dashed #cbd5e1' }}>Not Assigned</span>
//                                 )}
//                             </div>

//                             {moduleSubs.length > 0 && (
//                                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px', paddingLeft: '28px' }}>
//                                     {moduleSubs.map(sub => (
//                                         <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
//                                             {getTypeBadge(sub.type)}
//                                             {getStatusBadge(sub)}
//                                         </div>
//                                     ))}
//                                 </div>
//                             )}
//                         </li>
//                     );
//                 })}
//             </ul>
//         );
//     };

//     const renderDocRow = (title: string, docType: string, url?: string) => (
//         <div className="vp-doc-card" key={docType}>
//             <div className="vp-doc-icon-wrap">
//                 <div className={`vp-doc-icon ${url ? 'vp-doc-icon--success' : 'vp-doc-icon--missing'}`}>
//                     <FileText size={20} />
//                 </div>
//             </div>
//             <div className="vp-doc-info">
//                 <h4 className="vp-doc-title">{title}</h4>
//                 <span className={`vp-doc-status ${url ? 'vp-doc-status--success' : 'vp-doc-status--missing'}`}>
//                     {url ? 'Verified & On File' : 'Document Missing'}
//                 </span>
//             </div>
//             {url ? (
//                 <a
//                     href={url}
//                     target="_blank"
//                     rel="noreferrer"
//                     className="mlab-btn mlab-btn--outline mlab-btn--sm"
//                     style={{ color: 'var(--mlab-midnight, #073f4e)', textDecoration: 'none', border: '1px solid var(--mlab-border, #e2e8f0)' }}
//                 >
//                     <Eye size={14} /> View
//                 </a>
//             ) : (
//                 <span className="vp-doc-pending">Pending Upload</span>
//             )}
//         </div>
//     );

//     const renderTableRow = (sub: LearnerSubmission, isGrouped: boolean) => {
//         const isNYC = sub.status === 'moderated' && sub.competency === 'NYC';
//         const hasPendingAppeal = sub.status === 'appealed' || sub.appeal?.status === 'pending';
//         const isScheduledForFuture = sub.isScheduled && sub.scheduledDate && new Date(sub.scheduledDate).getTime() > Date.now();

//         return (
//             <tr key={sub.id}>
//                 <td style={isGrouped ? { paddingLeft: '2.5rem' } : {}}>
//                     <div className="vp-assessment-cell">
//                         <span className="vp-assessment-title" style={isGrouped ? { fontSize: '0.9rem' } : {}}>{sub.title}</span>

//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
//                             {sub.isScheduled && sub.scheduledDate && ['not_started', 'in_progress', 'missed', 'upcoming'].includes(sub.status) ? (
//                                 <span className="vp-assessment-meta" style={{ color: sub.status === 'missed' ? '#ef4444' : '#0284c7', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                     <Clock size={12} />
//                                     {isScheduledForFuture
//                                         ? `Unlocks: ${moment(sub.scheduledDate).format('DD MMM YYYY [at] HH:mm')}`
//                                         : `Scheduled: ${moment(sub.scheduledDate).format('DD MMM YYYY [at] HH:mm')}`}
//                                 </span>
//                             ) : (
//                                 <span className="vp-assessment-meta">
//                                     Assigned: {moment(sub.assignedAt).format('DD MMM YYYY')}
//                                 </span>
//                             )}

//                             {(sub.timeLimit && sub.timeLimit > 0) ? (
//                                 <span className="vp-assessment-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                     <Timer size={12} /> {sub.timeLimit} Min Limit
//                                 </span>
//                             ) : null}
//                         </div>
//                     </div>
//                 </td>
//                 {!isGrouped && (
//                     <td>
//                         <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', color: 'var(--mlab-green)', fontWeight: 600 }}>
//                             {sub.moduleNumber || 'General'}
//                         </span>
//                     </td>
//                 )}
//                 <td>{getTypeBadge(sub.type)}</td>
//                 <td>{getStatusBadge(sub)}</td>
//                 <td style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem' }}>
//                     #{sub.attemptNumber || 1}
//                 </td>
//                 <td style={{ textAlign: 'right' }}>
//                     {(() => {
//                         const handleViewClick = () => {
//                             if (sub.moduleType === 'workplace') {
//                                 if (!(sub as any).rawLogData) {
//                                     setSelectedLog(sub);
//                                 } else {
//                                     setSelectedLog((sub as any).rawLogData);
//                                 }
//                                 setShowLogModal(true);
//                             } else {
//                                 if (user?.role === 'learner') {
//                                     navigate(`/learner/assessment/${sub.assessmentId}`);
//                                 } else {
//                                     navigate(`/portfolio/submission/${sub.id}`);
//                                 }
//                             }
//                         };

//                         if (isNYC && user?.role === 'learner' && !hasPendingAppeal) {
//                             return (
//                                 <button className="mlab-btn mlab-btn--warning mlab-btn--sm" onClick={handleViewClick}>
//                                     <AlertCircle size={14} style={{ marginRight: '4px' }} /> Appeal / Remediate
//                                 </button>
//                             );
//                         }

//                         if (isNYC && user?.role !== 'learner' && !hasPendingAppeal) {
//                             return (
//                                 <button className="mlab-btn mlab-btn--warning mlab-btn--sm" onClick={() => setRemediationTarget(sub)}>
//                                     <AlertCircle size={14} style={{ marginRight: '4px' }} /> Remediate
//                                 </button>
//                             );
//                         }

//                         if (sub.status === 'missed' && user?.role !== 'learner') {
//                             return (
//                                 <button className="mlab-btn mlab-btn--outline" style={{ color: '#dc2626', borderColor: '#fecaca' }} onClick={handleViewClick}>
//                                     <ShieldAlert size={14} /> Review Absence
//                                 </button>
//                             );
//                         }

//                         if ((sub.status === 'missed' || sub.status === 'upcoming') && user?.role === 'learner') {
//                             return (
//                                 <button className="mlab-btn" style={{ color: sub.status === 'missed' ? '#dc2626' : '#d97706' }} onClick={handleViewClick}>
//                                     <Eye size={14} /> View
//                                 </button>
//                             );
//                         }

//                         return (
//                             <button className="mlab-btn" style={{ color: 'green' }} onClick={handleViewClick}>
//                                 <Eye size={14} /> View
//                             </button>
//                         );
//                     })()}
//                 </td>
//             </tr>
//         );
//     };

//     const renderTableBody = () => {
//         if (sortBy === 'module') {
//             const groups: Record<string, LearnerSubmission[]> = {};
//             filteredSubmissions.forEach(sub => {
//                 const mod = sub.moduleNumber || 'Unlinked Assessments';
//                 if (!groups[mod]) groups[mod] = [];
//                 groups[mod].push(sub);
//             });

//             const sortedKeys = Object.keys(groups).sort((a, b) => sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a));

//             return sortedKeys.map(modCode => {
//                 const actionableLogs = groups[modCode]
//                     .filter(s => s.moduleType === 'workplace' && (s as any).rawLogData)
//                     .map(s => (s as any).rawLogData);

//                 return (
//                     <React.Fragment key={modCode}>
//                         <tr style={{ background: '#f8fafc' }}>
//                             <td colSpan={sortBy !== 'module' ? 6 : 5} style={{ padding: '12px 16px', borderBottom: '2px solid #e2e8f0', borderTop: '1px solid #e2e8f0' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <Layers size={16} color="var(--mlab-blue)" />
//                                         <span style={{ fontWeight: 800, color: 'var(--mlab-blue)', fontSize: '0.85rem', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
//                                             {modCode}
//                                         </span>
//                                     </div>

//                                     {activeTab === 'workplace' && actionableLogs.length > 0 && (
//                                         <button
//                                             onClick={() => handleTriggerCompiledModulePrint(modCode, actionableLogs)}
//                                             disabled={isCompilingPrint}
//                                             className="mlab-btn mlab-btn--outline mlab-btn--sm"
//                                             style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'white', borderColor: '#cbd5e1', color: '#073f4e', fontWeight: 600, height: '28px', padding: '0 10px', cursor: 'pointer' }}
//                                         >
//                                             {isCompilingPrint ? <Loader2 size={12} className="vp-spin" /> : <Printer size={12} />}
//                                             Print Module Logbook ({actionableLogs.length})
//                                         </button>
//                                     )}
//                                 </div>
//                             </td>
//                         </tr>
//                         {groups[modCode].map(sub => renderTableRow(sub, true))}
//                     </React.Fragment>
//                 );
//             });
//         } else {
//             return paginatedSubmissions.map(sub => renderTableRow(sub, false));
//         }
//     };

//     // ─── 5. UI RETURN RENDER BLOCK ───
//     if (learnersLoading && !enrollment) {
//         return (
//             <div className="admin-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
//                 <Loader message='Loading Portfolio...' />
//             </div>
//         );
//     }

//     if (!enrollment || !enrollment.idNumber) {
//         return (
//             <div className="admin-layout">
//                 <Sidebar role={user?.role} currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'} onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//                 <main className="main-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                     <div className="vp-empty-state vp-empty-state--large" style={{ padding: '3rem', border: '1px dashed #cbd5e1', background: 'white' }}>
//                         <AlertTriangle size={64} color="#ef4444" />
//                         <h2 style={{ marginTop: '1.5rem', color: '#0f172a' }}>Invalid Learner Data</h2>
//                         <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
//                             This learner profile is incomplete or corrupted (Missing ID or Full Name). Grading tools are disabled to prevent database errors.
//                         </p>
//                         <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--primary">
//                             <ChevronLeft size={16} /> Return to Directory
//                         </button>
//                     </div>
//                 </main>
//             </div>
//         );
//     }

//     return (
//         <div className="admin-layout">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {remediationTarget && (
//                 <RemediationModal submissionTitle={remediationTarget.title} attemptNumber={remediationTarget.attemptNumber || 1} onClose={() => setRemediationTarget(null)} onSubmit={executeRemediation} />
//             )}

//             {showExportModal && (
//                 <ExportModal submissions={filteredSubmissions} onClose={() => setShowExportModal(false)} />
//             )}

//             {showLogModal && (
//                 <WorkplaceLogViewerModal log={selectedLog} allowEdit={false} onClose={() => { setShowLogModal(false); setSelectedLog(null); }} />
//             )}

//             {/* ⚙️ PORTAL LAYER INJECTION FOR AGGREGATED BATCH VIEW PRINTING */}
//             {bulkPrintPayload && createPortal(
//                 <WorkplaceModuleBulkPrintable
//                     moduleCode={bulkPrintPayload.moduleCode}
//                     moduleTopics={bulkPrintPayload.moduleTopics}
//                     logs={bulkPrintPayload.logs}
//                     learnerName={enrollment?.fullName || 'Candidate Learner'}
//                     learnerIdNumber={enrollment?.idNumber || ''}
//                     learnerSig={bulkPrintPayload.learnerSig}
//                     mentorSig={bulkPrintPayload.mentorSig}
//                     assessorSig={bulkPrintPayload.assessorSig}
//                     mentorName={bulkPrintPayload.mentorName}
//                     assessorName={bulkPrintPayload.assessorName}
//                     employerDetails={bulkPrintPayload.employerDetails} // 🚀 INJECTED DIRECTLY FROM STATE
//                 />,
//                 document.body
//             )}

//             <div className="admin-mobile-header">
//                 <div className="admin-mobile-header-left">
//                     <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                         <Menu size={24} />
//                     </button>
//                     <div className="admin-mobile-title">Portfolio View</div>
//                 </div>
//                 <div className="admin-mobile-header-right">
//                     <NotificationBell />
//                 </div>
//             </div>

//             {isMobileMenuOpen && (
//                 <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
//             )}

//             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
//                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
//                     <X size={24} />
//                 </button>
//                 <Sidebar role={user?.role} currentNav={user?.role === 'learner' ? 'dashboard' : 'learners'} onLogout={() => signOut(auth).then(() => navigate('/login'))} />
//             </div>

//             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>
//                 <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                     <div className="header-title">
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
//                             <ShieldCheck size={18} color="var(--mlab-green)" />
//                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mlab-green)' }}>
//                                 Verified Portfolio
//                             </span>
//                         </div>
//                         <h1>{enrollment.fullName}</h1>
//                         <p>{matchingProgramme?.name || "Qualification Portfolio"} • {enrollment.idNumber}</p>
//                     </div>
//                     <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
//                         <button onClick={() => setShowExportModal(true)} className="mlab-btn mlab-btn--ghost">
//                             <Download size={16} /> Export
//                         </button>
//                         <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--ghost">
//                             <ChevronLeft size={16} /> Back
//                         </button>
//                         <NotificationBell />
//                     </div>
//                 </header>

//                 <div className="admin-content">
//                     <div className="vp-profile-card">
//                         <div className="vp-profile-avatar">
//                             {(enrollment as any).profilePhotoUrl ? (
//                                 <img src={(enrollment as any).profilePhotoUrl} alt="Profile" crossOrigin="anonymous" />
//                             ) : (
//                                 <User size={32} />
//                             )}
//                         </div>
//                         <div className="vp-profile-info">
//                             <h2 className="vp-profile-name">{enrollment.fullName}</h2>
//                             <div className="vp-profile-meta">
//                                 <span><strong>ID:</strong> {enrollment.idNumber}</span>
//                                 <span className="vp-profile-divider">|</span>
//                                 <span>
//                                     <Calendar size={14} /><strong>Programme Window: </strong>
//                                     {effectiveStartDate ? new Date(effectiveStartDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown Start'}
//                                     {' — '}
//                                     {effectiveEndDate ? new Date(effectiveEndDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Unknown End'}
//                                 </span>
//                                 <>
//                                     <span className="vp-profile-divider">|</span>
//                                     <span><Briefcase size={14} /> {activeCohortName || "Dormant Profile (Unassigned)"}</span>
//                                 </>
//                             </div>
//                         </div>
//                         <div className="vp-profile-status">
//                             <span className="vp-status-label">Status</span>
//                             <span className={`vp-status-value vp-status-value--${enrollment.status}`}>
//                                 {enrollment.status === 'active' ? 'IN TRAINING' : enrollment.status?.toUpperCase() || 'UNKNOWN'}
//                             </span>
//                         </div>
//                     </div>

//                     <nav className="vp-tabs" role="tablist">
//                         {TABS.map(tab => {
//                             const Icon = tab.icon;
//                             const isActive = activeTab === tab.id;
//                             return (
//                                 <button
//                                     key={tab.id}
//                                     className={`vp-tab ${isActive ? 'vp-tab--active' : ''}`}
//                                     onClick={() => setActiveTab(tab.id)}
//                                     role="tab"
//                                     aria-selected={isActive}
//                                     aria-controls={`panel-${tab.id}`}
//                                     style={{ outline: 'none', WebkitTapHighlightColor: 'transparent', borderColor: 'transparent' }}
//                                 >
//                                     <Icon size={16} />
//                                     <span>{tab.label}</span>
//                                     {tab.id !== 'overview' && tab.id !== 'compliance' && (
//                                         <span className="vp-count-badge" style={{ marginLeft: '6px', fontSize: '0.65rem', padding: '1px 6px' }}>
//                                             {submissions.filter(s => {
//                                                 if (tab.id === 'other') return INFORMAL_TYPES.includes(s.type);
//                                                 return (s.moduleType || 'knowledge') === tab.id && !INFORMAL_TYPES.includes(s.type);
//                                             }).length}
//                                         </span>
//                                     )}
//                                 </button>
//                             );
//                         })}
//                     </nav>

//                     <div className="vp-content">
//                         {activeTab === 'overview' && (
//                             <div className="vp-grid vp-grid--2col">
//                                 {user?.role !== 'learner' && (
//                                     <div className="vp-grid-span-2">
//                                         <PoEGenerator learnerId={enrollment.learnerId || enrollment.id} requestedByUid={user?.uid || ''} />
//                                     </div>
//                                 )}

//                                 <div className="vp-card">
//                                     <div className="vp-card-header">
//                                         <BarChart2 size={18} />
//                                         <h3>Pipeline Progress</h3>
//                                     </div>
//                                     <div className="vp-pipeline">
//                                         {renderPipelineBar('Submissions', pipelineStats.submitted, pipelineStats.total, 'blue')}
//                                         {renderPipelineBar('Facilitator Review', pipelineStats.facReviewed, pipelineStats.total, 'purple')}
//                                         {renderPipelineBar('Assessor Graded', pipelineStats.graded, pipelineStats.total, 'amber')}
//                                         {renderPipelineBar('Moderated', pipelineStats.moderated, pipelineStats.total, 'green')}
//                                     </div>
//                                 </div>

//                                 <div className="vp-card">
//                                     <div className="vp-card-header">
//                                         <BookOpen size={18} />
//                                         <h3>Curriculum Map</h3>
//                                     </div>
//                                     {!matchingProgramme ? (
//                                         <div className="vp-empty-state">
//                                             <AlertCircle size={32} />
//                                             <p>No Qualification Blueprint Linked</p>
//                                         </div>
//                                     ) : (
//                                         <div className="vp-curr-groups">
//                                             <div className="vp-curr-group">
//                                                 <span className="vp-curr-group-label">Knowledge Modules</span>
//                                                 {renderCurriculumGroup(matchingProgramme.knowledgeModules, 'K')}
//                                             </div>
//                                             <div className="vp-curr-group">
//                                                 <span className="vp-curr-group-label">Practical Modules</span>
//                                                 {renderCurriculumGroup(matchingProgramme.practicalModules, 'P')}
//                                             </div>
//                                             {matchingProgramme.workExperienceModules && (
//                                                 <div className="vp-curr-group">
//                                                     <span className="vp-curr-group-label">Workplace Modules</span>
//                                                     {renderCurriculumGroup(matchingProgramme.workExperienceModules, 'W')}
//                                                 </div>
//                                             )}
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         )}

//                         {(activeTab === 'knowledge' || activeTab === 'practical' || activeTab === 'workplace' || activeTab === 'other') && (
//                             <div className="vp-card" id={`panel-${activeTab}`}>
//                                 <div className="vp-card-header vp-card-header--between">
//                                     <div className="vp-card-title-group">
//                                         <h3>{TABS.find(t => t.id === activeTab)?.label} Assessments</h3>
//                                     </div>
//                                 </div>

//                                 <div className="mlab-toolbar" style={{ borderTop: 'none', margin: 10, display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
//                                     <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', flex: '1', minWidth: '220px', overflow: 'hidden' }}>
//                                         <Search size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
//                                         <input
//                                             type="text"
//                                             placeholder="Search assessments..."
//                                             value={searchTerm}
//                                             onChange={(e) => setSearchTerm(e.target.value)}
//                                             style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 12px', color: 'var(--mlab-blue)', width: '100%', fontSize: '0.85rem' }}
//                                         />
//                                     </div>

//                                     <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
//                                         <Filter size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
//                                         <select
//                                             value={statusFilter}
//                                             onChange={e => setStatusFilter(e.target.value)}
//                                             style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 8px', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.85rem', appearance: 'none' }}
//                                         >
//                                             <option value="all">All Statuses</option>
//                                             <option value="not_started">Not Started</option>
//                                             <option value="in_progress">In Progress</option>
//                                             <option value="submitted">Submitted</option>
//                                             <option value="pending">Pending Review</option>
//                                             <option value="competent">Competent</option>
//                                             <option value="nyc">Not Yet Competent</option>
//                                             <option value="appealed">Appealed</option>
//                                             <option value="missed">Missed</option>
//                                         </select>
//                                     </div>

//                                     <div className="mlab-select-wrap" style={{ height: '38px', border: '1px solid var(--mlab-border)', borderRadius: '6px', background: 'white', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
//                                         <ArrowUpDown size={16} color="var(--mlab-grey)" style={{ marginLeft: '12px', flexShrink: 0 }} />
//                                         <select
//                                             value={sortBy}
//                                             onChange={e => setSortBy(e.target.value as any)}
//                                             style={{ height: '100%', border: 'none', background: 'transparent', outline: 'none', padding: '0 32px 0 8px', color: 'var(--mlab-blue)', cursor: 'pointer', fontSize: '0.85rem', appearance: 'none' }}
//                                         >
//                                             <option value="module">Module (Grouped)</option>
//                                             <option value="date">Date Assigned</option>
//                                             <option value="title">Title</option>
//                                             <option value="status">Status</option>
//                                         </select>
//                                     </div>

//                                     <button
//                                         className="mlab-btn mlab-btn--ghost"
//                                         onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
//                                         title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
//                                         style={{ height: '38px', border: '1px solid var(--mlab-border)', background: 'white', borderRadius: '6px', padding: '0 16px', display: 'flex', alignItems: 'center', outline: 'none' }}
//                                     >
//                                         {sortOrder === 'asc' ? '↑ Asc' : '↓ Desc'}
//                                     </button>
//                                 </div>

//                                 {loadingSubmissions ? (
//                                     <TableSkeleton />
//                                 ) : filteredSubmissions.length === 0 ? (
//                                     <div className="vp-empty-state">
//                                         <FileText size={40} />
//                                         <p>No assessments found matching your criteria</p>
//                                         <button className="mlab-btn mlab-btn--ghost" onClick={() => { setSearchTerm(''); setStatusFilter('all'); }} style={{ marginTop: '1rem' }}>
//                                             Clear Filters
//                                         </button>
//                                     </div>
//                                 ) : (
//                                     <>
//                                         <div className="mlab-table-wrap">
//                                             <table className="mlab-table">
//                                                 <thead>
//                                                     <tr>
//                                                         <th>Assessment</th>
//                                                         {sortBy !== 'module' && <th>Module</th>}
//                                                         <th>Type</th>
//                                                         <th>Status</th>
//                                                         <th>Attempt</th>
//                                                         <th style={{ textAlign: 'right' }}>Actions</th>
//                                                     </tr>
//                                                 </thead>
//                                                 <tbody>
//                                                     {renderTableBody()}
//                                                 </tbody>
//                                             </table>
//                                         </div>

//                                         {sortBy !== 'module' && totalPages > 1 && (
//                                             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '1rem', borderTop: '1px solid var(--mlab-border)' }}>
//                                                 <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
//                                                     <ChevronLeft size={16} /> Prev
//                                                 </button>
//                                                 <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
//                                                     Page {currentPage} of {totalPages}
//                                                 </span>
//                                                 <button className="mlab-btn mlab-btn--ghost mlab-btn--sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
//                                                     Next <ChevronRight size={16} />
//                                                 </button>
//                                             </div>
//                                         )}
//                                     </>
//                                 )}
//                             </div>
//                         )}

//                         {activeTab === 'compliance' && (
//                             <div className="vp-card" id="panel-compliance">
//                                 <div className="vp-card-header vp-card-header--between">
//                                     <div className="vp-card-title-group">
//                                         <FileBadge size={18} />
//                                         <h3>Compliance Documents</h3>
//                                     </div>
//                                     {user?.role !== 'learner' && (
//                                         <button className="mlab-btn mlab-btn--outline mlab-btn--sm">
//                                             <Printer size={14} /> Print Checklist
//                                         </button>
//                                     )}
//                                 </div>
//                                 <div className="vp-doc-grid">
//                                     {(() => {
//                                         const legacyDocs = (enrollment as any).documents || {};
//                                         const rawUploadedDocs = (enrollment as any).uploadedDocuments;
//                                         const uploadedDocs = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

//                                         const idUrl = uploadedDocs.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl;
//                                         const cvUrl = uploadedDocs.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl;
//                                         const qualUrl = uploadedDocs.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl;

//                                         const coreDocIds = ['id', 'cv', 'qual'];
//                                         const customDocs = uploadedDocs.filter((d: any) => !coreDocIds.includes(d.id));

//                                         return (
//                                             <>
//                                                 {renderDocRow('Certified ID Copy', 'id', idUrl)}
//                                                 {renderDocRow('Highest Qualification', 'qual', qualUrl)}
//                                                 {renderDocRow('Updated CV', 'cv', cvUrl)}

//                                                 {customDocs.map((doc: any, idx: number) => (
//                                                     renderDocRow(doc.name || 'Additional Document', doc.id || `custom_${idx}`, doc.url)
//                                                 ))}

//                                                 {!idUrl && !cvUrl && !qualUrl && customDocs.length === 0 && (
//                                                     <div className="vp-empty-state" style={{ gridColumn: '1 / -1' }}>
//                                                         <AlertCircle size={32} color="var(--mlab-grey)" />
//                                                         <p>No compliance documents found on file.</p>
//                                                     </div>
//                                                 )}
//                                             </>
//                                         );
//                                     })()}
//                                 </div>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             </main>
//         </div>
//     );
// };

// export default ViewPortfolio;