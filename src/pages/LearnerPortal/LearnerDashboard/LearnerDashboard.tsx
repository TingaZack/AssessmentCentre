// src/pages/LearnerPortal/LearnerDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X, Award, Download,
    GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
    Hexagon, Mail, Search, Filter, ChevronDown, ChevronUp, XCircle, Zap, AlertCircle, Loader2, History
} from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { createPortal } from 'react-dom';
import './LearnerDashboard.css';

type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
type SortType = 'newest' | 'oldest' | 'name';

// ─── ACTION INBOX COMPONENT ──────────────────────────────────────────────────
const LearnerActionInbox: React.FC<{ profileId: string; logs: any[] }> = ({ profileId, logs }) => {
    const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
    const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [logToConfirm, setLogToConfirm] = useState<any | null>(null);
    const [now, setNow] = useState(new Date());
    const toast = useToast();

    // Update time every minute for the countdowns
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Split logs into Pending and History
    const pendingLogs = useMemo(() => {
        return logs.filter(log => {
            const isPending = !log.acknowledgedBy?.includes(profileId);
            const isNotPenalized = !log.penalizedLearners?.includes(profileId);
            const hasNotExpired = new Date(log.deadlineAt) > new Date();
            return isPending && isNotPenalized && hasNotExpired;
        }).sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
    }, [logs, profileId]);

    const historyLogs = useMemo(() => {
        return logs.filter(log => log.acknowledgedBy?.includes(profileId))
            .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
    }, [logs, profileId]);

    // Group logs by Module Code for the accordion view
    const groupedLogs = useMemo(() => {
        const activeList = viewMode === 'pending' ? pendingLogs : historyLogs;
        const groups: Record<string, any[]> = {};
        activeList.forEach(log => {
            const code = log.moduleCode || 'General';
            if (!groups[code]) groups[code] = [];
            groups[code].push(log);
        });
        return groups;
    }, [pendingLogs, historyLogs, viewMode]);

    // Auto-expand all modules by default
    useEffect(() => {
        if (Object.keys(groupedLogs).length > 0) {
            setExpandedModules(new Set(Object.keys(groupedLogs)));
        } else {
            setExpandedModules(new Set());
        }
    }, [groupedLogs, viewMode]);

    const toggleModuleAccordion = (moduleCode: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(moduleCode)) next.delete(moduleCode);
            else next.add(moduleCode);
            return next;
        });
    };

    const executeAcknowledge = async () => {
        if (!logToConfirm) return;
        const logId = logToConfirm.id;
        setAcknowledgingId(logId);

        try {
            const functions = getFunctions();
            const ackFn = httpsCallable(functions, 'acknowledgeCurriculumTopic');
            await ackFn({ logId, learnerId: profileId });

            toast.success("✅ Topic Acknowledged! +1 Streak");
            setLogToConfirm(null);
        } catch (error) {
            console.error("Ack Error:", error);
            toast.error("Failed to acknowledge. Please try again or contact support.");
            setLogToConfirm(null);
        } finally {
            setAcknowledgingId(null);
        }
    };

    const formatTimeLeft = (deadlineIso: string) => {
        const total = new Date(deadlineIso).getTime() - now.getTime();
        if (total <= 0) return "Expired";
        const h = Math.floor(total / (1000 * 60 * 60));
        const m = Math.floor((total / 1000 / 60) % 60);
        if (h > 24) return `${Math.floor(h / 24)} days left`;
        return `${h}h ${m}m left`;
    };

    return (
        <>
            {/* CONFIRMATION MODAL */}
            {logToConfirm && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="info"
                        title="Confirm Delivery"
                        message={`By clicking confirm, you officially acknowledge that your facilitator delivered the training for "${logToConfirm.topicTitle}" on ${logToConfirm.coveredAt ? new Date(logToConfirm.coveredAt).toLocaleDateString('en-ZA') : 'the specified date'}. \n\nNote: This action creates a permanent digital record for your QCTO compliance file.`}
                        onCancel={() => setLogToConfirm(null)}
                        onClose={executeAcknowledge}
                        confirmText={acknowledgingId === logToConfirm.id ? "Confirming..." : "Yes, I Confirm"}
                    />
                </div>,
                document.body
            )}

            <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1.5rem', background: 'white', border: '1px solid var(--mlab-border)' }}>

                {/* SUB-TABS: PENDING VS HISTORY */}
                <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc' }}>
                    <button
                        onClick={() => setViewMode('pending')}
                        style={{
                            flex: 1, padding: '1rem', background: 'transparent', border: 'none',
                            borderBottom: `3px solid ${viewMode === 'pending' ? '#f59e0b' : 'transparent'}`,
                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700,
                            color: viewMode === 'pending' ? '#d97706' : 'var(--mlab-grey)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <Zap size={16} /> Pending Actions
                        <span style={{ background: viewMode === 'pending' ? '#f59e0b' : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingLogs.length}</span>
                    </button>
                    <button
                        onClick={() => setViewMode('history')}
                        style={{
                            flex: 1, padding: '1rem', background: 'transparent', border: 'none',
                            borderBottom: `3px solid ${viewMode === 'history' ? 'var(--mlab-green)' : 'transparent'}`,
                            fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700,
                            color: viewMode === 'history' ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'all 0.2s'
                        }}
                    >
                        <History size={16} /> Acknowledged History
                        <span style={{ background: viewMode === 'history' ? 'var(--mlab-green)' : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{historyLogs.length}</span>
                    </button>
                </div>

                <div style={{ padding: '1.5rem', background: viewMode === 'pending' ? '#fffbeb' : '#f0fdf4' }}>

                    {/* EMPTY STATES */}
                    {viewMode === 'pending' && pendingLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <CheckCircle size={48} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>Inbox Zero!</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>You are all caught up. No pending curriculum topics to acknowledge.</p>
                        </div>
                    )}

                    {viewMode === 'history' && historyLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <History size={48} color="var(--mlab-grey-light)" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>No History Yet</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>Topics you acknowledge will appear here as a permanent record.</p>
                        </div>
                    )}

                    {/* CONTENT LIST */}
                    {((viewMode === 'pending' && pendingLogs.length > 0) || (viewMode === 'history' && historyLogs.length > 0)) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {viewMode === 'pending' && (
                                <p style={{ color: '#b45309', fontSize: '0.85rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px', background: '#fef3c7', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                    <AlertCircle size={16} /> Your facilitator has published new topics. Acknowledge them below to maintain your streak!
                                </p>
                            )}

                            {Object.keys(groupedLogs).map(modCode => {
                                const logs = groupedLogs[modCode];
                                const moduleName = logs[0].moduleName || 'Unnamed Module';
                                const isOpen = expandedModules.has(modCode);

                                const headerColor = viewMode === 'pending' ? '#d97706' : '#15803d';
                                const headerBg = viewMode === 'pending' ? '#fef3c7' : '#dcfce7';

                                return (
                                    <div key={modCode} style={{ background: 'white', borderRadius: '8px', border: `1px solid ${viewMode === 'pending' ? '#fde68a' : '#bbf7d0'}`, overflow: 'hidden' }}>
                                        <div
                                            className="lfm-section-hdr"
                                            style={{ cursor: 'pointer', borderBottom: isOpen ? `1px solid ${viewMode === 'pending' ? '#fde68a' : '#bbf7d0'}` : 'none', background: headerBg, padding: '12px 16px' }}
                                            onClick={() => toggleModuleAccordion(modCode)}
                                        >
                                            <Layers size={16} color={headerColor} />
                                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <span style={{ color: headerColor, fontWeight: 700 }}>{modCode} <span style={{ fontWeight: 400, opacity: 0.8 }}>{moduleName}</span></span>
                                            </div>
                                            {isOpen ? <ChevronUp size={16} color={headerColor} /> : <ChevronDown size={16} color={headerColor} />}
                                        </div>

                                        {isOpen && (
                                            <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                                                <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                    <tbody>
                                                        {logs.map(log => {
                                                            const isUrgent = viewMode === 'pending' && (new Date(log.deadlineAt).getTime() - now.getTime()) < (12 * 60 * 60 * 1000);

                                                            return (
                                                                <tr key={log.id} style={{ background: isUrgent ? '#fef2f2' : 'white', borderBottom: '1px solid var(--mlab-border)' }}>
                                                                    <td>
                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                            <span style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
                                                                                {log.topicCode ? `${log.topicCode}: ` : ''}{log.topicTitle}
                                                                            </span>
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '4px' }}>
                                                                                Delivered: {log.coveredAt ? new Date(log.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                                                            </span>
                                                                        </div>
                                                                    </td>

                                                                    {/* ACTION OR BADGE CELL */}
                                                                    <td style={{ textAlign: 'right', width: '220px' }}>
                                                                        {viewMode === 'pending' ? (
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: isUrgent ? '#dc2626' : '#d97706', fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                    <Clock size={12} /> {formatTimeLeft(log.deadlineAt)}
                                                                                </div>
                                                                                <button
                                                                                    className="mlab-btn mlab-btn--sm"
                                                                                    style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '6px 12px' }}
                                                                                    onClick={() => setLogToConfirm(log)}
                                                                                    disabled={acknowledgingId === log.id}
                                                                                >
                                                                                    {acknowledgingId === log.id ? <Loader2 size={14} className="lfm-spin" /> : "Acknowledge"}
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                <CheckCircle size={12} /> Acknowledged
                                                                            </span>
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
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

// ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
const LearnerDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [activeDashTab, setActiveDashTab] = useState<'programmes' | 'tasks'>('programmes');

    const [academicProfile, setAcademicProfile] = useState<any>(null);
    const [learnerEnrollments, setLearnerEnrollments] = useState<any[]>([]);
    const [allCurriculumLogs, setAllCurriculumLogs] = useState<any[]>([]);

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Search and Filter States
    const [cohortSearch, setCohortSearch] = useState('');
    const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
    const [cohortSort, setCohortSort] = useState<SortType>('newest');
    const [showCohortFilters, setShowCohortFilters] = useState(false);

    const [certSearch, setCertSearch] = useState('');
    const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
    const [certSort, setCertSort] = useState<SortType>('newest');
    const [showCertFilters, setShowCertFilters] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    // Fetch Profile and Ledgers
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();

        if (!store.user?.uid || !store.user?.email) return;

        const fetchProfileAndLedger = async () => {
            setIsLoading(true);
            try {
                const emailQ = query(collection(db, 'learners'), where('email', '==', store.user!.email));
                const authQ = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));

                const [emailSnap, authSnap] = await Promise.all([getDocs(emailQ), getDocs(authQ)]);

                const allDocs = new Map();
                emailSnap.docs.forEach(d => allDocs.set(d.id, d));
                authSnap.docs.forEach(d => allDocs.set(d.id, d));

                const docsArray = Array.from(allDocs.values());

                if (docsArray.length > 0) {
                    const profileDoc = docsArray[0];
                    const profileData = profileDoc.data();
                    const finalProfileId = profileDoc.id;

                    setAcademicProfile({ id: finalProfileId, ...profileData });

                    const enrolQ = query(
                        collection(db, 'enrollments'),
                        where('learnerId', '==', finalProfileId),
                        where('status', 'in', ['active', 'in-progress'])
                    );
                    const enrolSnap = await getDocs(enrolQ);

                    const activeEnrollments = enrolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    setLearnerEnrollments(activeEnrollments);
                }
            } catch (error) {
                console.error('Error fetching learner profile and ledger:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchProfileAndLedger();
    }, [store.user?.uid, store.user?.email]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    const myCohorts = useMemo(() => {
        if (learnerEnrollments.length === 0 || !store.cohorts) return [];
        const enrolledCohortIds = new Set(learnerEnrollments.map(e => e.cohortId));
        return store.cohorts.filter(c => enrolledCohortIds.has(c.id));
    }, [learnerEnrollments, store.cohorts]);

    // LOGS LISTENER (Pulls ALL logs for the inbox to filter) 🚀
    useEffect(() => {
        if (!academicProfile?.id || myCohorts.length === 0) return;

        const cohortIds = myCohorts.map(c => c.id);
        const logsRef = collection(db, 'curriculum_logs');
        const q = query(logsRef, where('cohortId', 'in', cohortIds));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setAllCurriculumLogs(logs);
        });

        return () => unsubscribe();
    }, [academicProfile?.id, myCohorts]);

    // Calculate Pending Badge Number for the Tab
    const pendingCount = useMemo(() => {
        if (!academicProfile?.id) return 0;
        return allCurriculumLogs.filter(log => {
            const isPending = !log.acknowledgedBy?.includes(academicProfile.id);
            const isNotPenalized = !log.penalizedLearners?.includes(academicProfile.id);
            const hasNotExpired = new Date(log.deadlineAt) > new Date();
            return isPending && isNotPenalized && hasNotExpired;
        }).length;
    }, [allCurriculumLogs, academicProfile?.id]);

    const getStaffName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const filteredCohorts = useMemo(() => {
        let result = [...myCohorts];

        if (cohortSearch.trim()) {
            const searchLower = cohortSearch.toLowerCase();
            result = result.filter(c =>
                c.name?.toLowerCase().includes(searchLower) ||
                getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
            );
        }

        const today = new Date();
        if (cohortFilter === 'active') {
            result = result.filter(c => {
                const start = new Date(c.startDate);
                const end = new Date(c.endDate);
                return start <= today && end >= today;
            });
        } else if (cohortFilter === 'completed') {
            result = result.filter(c => new Date(c.endDate) < today);
        } else if (cohortFilter === 'upcoming') {
            result = result.filter(c => new Date(c.startDate) > today);
        }

        result.sort((a, b) => {
            if (cohortSort === 'name') return a.name?.localeCompare(b.name);
            const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
            const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
            return dateA.getTime() - dateB.getTime();
        });

        return result;
    }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

    const filteredCertificates = useMemo(() => {
        const certs = academicProfile?.certificates || [];
        let result = [...certs];

        if (certSearch.trim()) {
            const searchLower = certSearch.toLowerCase();
            result = result.filter((c: any) =>
                c.type?.toLowerCase().includes(searchLower) ||
                c.courseName?.toLowerCase().includes(searchLower)
            );
        }

        if (certFilter !== 'all') {
            result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
        }

        result.sort((a: any, b: any) => {
            if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
            const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
            const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
            return dateA.getTime() - dateB.getTime();
        });

        return result;
    }, [academicProfile?.certificates, certSearch, certFilter, certSort]);

    const pageTitle =
        currentNav === 'dashboard' ? 'My Dashboard' :
            currentNav === 'certificates' ? 'My Certificates' :
                'My Profile';

    const pageSub =
        currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
            currentNav === 'certificates' ? 'Official certificates issued to your profile' :
                'Manage your personal details and account';

    const clearCohortFilters = () => {
        setCohortSearch('');
        setCohortFilter('all');
        setCohortSort('newest');
    };

    const clearCertFilters = () => {
        setCertSearch('');
        setCertFilter('all');
        setCertSort('newest');
    };

    const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
    const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

    const pScore = academicProfile?.professionalismScore ?? 100;
    const pStreak = academicProfile?.professionalismStreak ?? 0;

    if (isLoading) {
        return (
            <div className="admin-layout learner-layout">
                <div className="ld-loading">
                    <Hexagon size={40} className="ld-loading__icon" />
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="admin-layout learner-layout">
            <header className="ld-mobile-header">
                <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu size={20} />
                </button>
                <div className="ld-mobile-brand">
                    <span className="ld-mobile-brand__logo">mLab</span>
                    <span className="ld-mobile-brand__sub">Learner Portal</span>
                </div>
            </header>

            {isMobileMenuOpen && (
                <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
                <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={20} />
                </button>
                <Sidebar
                    role={store.user?.role}
                    currentNav={currentNav}
                    setCurrentNav={setCurrentNav as any}
                    onLogout={handleLogout}
                />
            </div>

            <main className="main-wrapper">
                <div className="dashboard-header dashboard-header--compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div className="header-title">
                        <div className="header-badge">
                            <Shield size={12} />
                            <span>Verified</span>
                        </div>
                        <h1>{pageTitle}</h1>
                        <p>{pageSub}</p>
                    </div>

                    {/* GAMIFICATION HEADER */}
                    {currentNav === 'dashboard' && (
                        <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '1rem', borderRight: '1px solid var(--mlab-border)' }}>
                                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Score</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: pScore >= 80 ? 'var(--mlab-green)' : (pScore >= 50 ? '#d97706' : '#dc2626') }}>💯 {pScore}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Streak</span>
                                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>🔥 {pStreak}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="admin-content">
                    {currentNav === 'dashboard' && (
                        <div className="ld-animate">

                            <div className="ld-stats-bar">
                                <div className="ld-stat-item">
                                    <div className="ld-stat__icon ld-stat__icon--blue">
                                        <GraduationCap size={18} />
                                    </div>
                                    <div className="ld-stat__info">
                                        <span className="ld-stat__value">{myCohorts.length}</span>
                                        <span className="ld-stat__label">Programmes</span>
                                    </div>
                                </div>
                                <div className="ld-stat-divider" />
                                <div className="ld-stat-item">
                                    <div className="ld-stat__icon ld-stat__icon--green">
                                        <Award size={18} />
                                    </div>
                                    <div className="ld-stat__info">
                                        <span className="ld-stat__value">{academicProfile?.certificates?.length || 0}</span>
                                        <span className="ld-stat__label">Certificates</span>
                                    </div>
                                </div>
                                <div className="ld-stat-divider" />
                                <div className="ld-stat-item">
                                    <div className="ld-stat__icon ld-stat__icon--amber">
                                        <Clock size={18} />
                                    </div>
                                    <div className="ld-stat__info">
                                        <span className="ld-stat__value">On Track</span>
                                        <span className="ld-stat__label">Attendance</span>
                                    </div>
                                </div>
                            </div>

                            {/* TABBED NAVIGATION */}
                            <div className="lfm-tabs" style={{ marginBottom: '1.5rem', marginTop: '1.5rem' }}>
                                <button
                                    className={`lfm-tab ${activeDashTab === 'programmes' ? 'active' : ''}`}
                                    onClick={() => setActiveDashTab('programmes')}
                                >
                                    <Layers size={16} /> My Programmes
                                </button>
                                <button
                                    className={`lfm-tab ${activeDashTab === 'tasks' ? 'active' : ''}`}
                                    onClick={() => setActiveDashTab('tasks')}
                                >
                                    <Zap size={16} /> Action Required
                                    {pendingCount > 0 && (
                                        <span style={{
                                            background: '#dc2626', color: 'white', padding: '2px 6px',
                                            borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '6px'
                                        }}>
                                            {pendingCount}
                                        </span>
                                    )}
                                </button>
                            </div>

                            {/* TAB CONTENT */}
                            {activeDashTab === 'tasks' && (
                                <div className="animate-fade-in">
                                    <LearnerActionInbox profileId={academicProfile.id} logs={allCurriculumLogs} />
                                </div>
                            )}

                            {activeDashTab === 'programmes' && (
                                <div className="animate-fade-in">
                                    <div className="ld-section-header">
                                        <h2 className="ld-section-title">
                                            <Layers size={16} /> Active Cohorts
                                            <span className="ld-count-badge">{filteredCohorts.length}</span>
                                        </h2>

                                        <div className="ld-search-filter-bar">
                                            <div className="ld-search-box">
                                                <Search size={16} className="ld-search-icon" />
                                                <input
                                                    type="text"
                                                    placeholder="Search programmes..."
                                                    value={cohortSearch}
                                                    onChange={(e) => setCohortSearch(e.target.value)}
                                                    className="ld-search-input"
                                                />
                                                {cohortSearch && (
                                                    <button
                                                        className="ld-clear-btn"
                                                        onClick={() => setCohortSearch('')}
                                                    >
                                                        <XCircle size={14} />
                                                    </button>
                                                )}
                                            </div>

                                            <button
                                                className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`}
                                                onClick={() => setShowCohortFilters(!showCohortFilters)}
                                            >
                                                <Filter size={16} />
                                                <span>Filter</span>
                                                {hasActiveCohortFilters && <span className="ld-filter-dot" />}
                                                <ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
                                            </button>
                                        </div>
                                    </div>

                                    {showCohortFilters && (
                                        <div className="ld-filter-panel">
                                            <div className="ld-filter-group">
                                                <label>Status</label>
                                                <div className="ld-filter-chips">
                                                    {[
                                                        { key: 'all', label: 'All' },
                                                        { key: 'active', label: 'Active' },
                                                        { key: 'upcoming', label: 'Upcoming' },
                                                        { key: 'completed', label: 'Completed' }
                                                    ].map((f) => (
                                                        <button
                                                            key={f.key}
                                                            className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`}
                                                            onClick={() => setCohortFilter(f.key as FilterType)}
                                                        >
                                                            {f.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="ld-filter-group">
                                                <label>Sort By</label>
                                                <select
                                                    value={cohortSort}
                                                    onChange={(e) => setCohortSort(e.target.value as SortType)}
                                                    className="ld-filter-select"
                                                >
                                                    <option value="newest">Newest First</option>
                                                    <option value="oldest">Oldest First</option>
                                                    <option value="name">Name A-Z</option>
                                                </select>
                                            </div>

                                            {hasActiveCohortFilters && (
                                                <button className="ld-clear-filters" onClick={clearCohortFilters}>
                                                    <XCircle size={14} /> Clear All
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    <div className="ld-cohort-grid">
                                        {filteredCohorts.map((cohort, index) => (
                                            <div
                                                key={cohort.id}
                                                className="ld-cohort-card"
                                                style={{ animationDelay: `${index * 0.08}s` }}
                                            >
                                                <div className="ld-cohort-card__header">
                                                    <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                                    <span className="ld-badge ld-badge--active">Active</span>
                                                </div>

                                                <div className="ld-cohort-card__dates">
                                                    <Calendar size={12} />
                                                    <span>{cohort.startDate} — {cohort.endDate}</span>
                                                </div>

                                                <div className="ld-cohort-card__roles">
                                                    <div className="ld-role-row">
                                                        <div className="ld-role-dot ld-role-dot--blue" />
                                                        <span className="ld-role-label">Facilitator</span>
                                                        <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
                                                    </div>
                                                    <div className="ld-role-row">
                                                        <div className="ld-role-dot ld-role-dot--red" />
                                                        <span className="ld-role-label">Assessor</span>
                                                        <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
                                                    </div>
                                                    {cohort.moderatorId && (
                                                        <div className="ld-role-row">
                                                            <div className="ld-role-dot ld-role-dot--green" />
                                                            <span className="ld-role-label">Moderator</span>
                                                            <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="ld-cohort-card__footer">
                                                    <button
                                                        className="ld-btn ld-btn--primary"
                                                        onClick={() => navigate(`/portfolio/${academicProfile?.id}`, { state: { cohortId: cohort.id } })}
                                                    >
                                                        <span>Portfolio</span>
                                                        <ArrowRight size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        {filteredCohorts.length === 0 && (
                                            <div className="ld-empty">
                                                <div className="ld-empty__icon">
                                                    <Search size={32} strokeWidth={1.5} />
                                                </div>
                                                <span className="ld-empty__title">No Active Enrollments</span>
                                                <p className="ld-empty__desc">
                                                    You are currently not enrolled in any active classes.
                                                    If you believe this is an error, please contact administration.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                        </div>
                    )}

                    {currentNav === 'profile' && (
                        <LearnerProfileView
                            profile={academicProfile}
                            user={store.user}
                            onUpdate={store.updateLearner}
                        />
                    )}

                    {currentNav === 'certificates' && (
                        <div className="ld-animate">
                            <div className="ld-section-header">
                                <h2 className="ld-section-title">
                                    <Award size={16} /> Issued Certificates
                                    <span className="ld-count-badge">{filteredCertificates.length}</span>
                                </h2>

                                <div className="ld-search-filter-bar">
                                    <div className="ld-search-box">
                                        <Search size={16} className="ld-search-icon" />
                                        <input
                                            type="text"
                                            placeholder="Search certificates..."
                                            value={certSearch}
                                            onChange={(e) => setCertSearch(e.target.value)}
                                            className="ld-search-input"
                                        />
                                        {certSearch && (
                                            <button
                                                className="ld-clear-btn"
                                                onClick={() => setCertSearch('')}
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <button
                                        className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`}
                                        onClick={() => setShowCertFilters(!showCertFilters)}
                                    >
                                        <Filter size={16} />
                                        <span>Filter</span>
                                        {hasActiveCertFilters && <span className="ld-filter-dot" />}
                                        <ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
                                    </button>
                                </div>
                            </div>

                            {showCertFilters && (
                                <div className="ld-filter-panel">
                                    <div className="ld-filter-group">
                                        <label>Type</label>
                                        <div className="ld-filter-chips">
                                            {[
                                                { key: 'all', label: 'All Types' },
                                                { key: 'certificate', label: 'Certificate' },
                                                { key: 'statement', label: 'Statement' }
                                            ].map((f) => (
                                                <button
                                                    key={f.key}
                                                    className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`}
                                                    onClick={() => setCertFilter(f.key as any)}
                                                >
                                                    {f.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="ld-filter-group">
                                        <label>Sort By</label>
                                        <select
                                            value={certSort}
                                            onChange={(e) => setCertSort(e.target.value as SortType)}
                                            className="ld-filter-select"
                                        >
                                            <option value="newest">Newest First</option>
                                            <option value="oldest">Oldest First</option>
                                            <option value="name">Name A-Z</option>
                                        </select>
                                    </div>

                                    {hasActiveCertFilters && (
                                        <button className="ld-clear-filters" onClick={clearCertFilters}>
                                            <XCircle size={14} /> Clear All
                                        </button>
                                    )}
                                </div>
                            )}

                            {filteredCertificates.length === 0 ? (
                                <div className="ld-empty ld-empty--large">
                                    <div className="ld-empty__icon">
                                        {certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}
                                    </div>
                                    <span className="ld-empty__title">
                                        {certSearch ? 'No Results Found' : 'No Certificates Yet'}
                                    </span>
                                    <p className="ld-empty__desc">
                                        {certSearch
                                            ? `No certificates match "${certSearch}"`
                                            : 'Certificates appear here after programme completion.'}
                                    </p>
                                    {hasActiveCertFilters && certSearch && (
                                        <button
                                            className="ld-btn ld-btn--ghost ld-btn--sm"
                                            onClick={clearCertFilters}
                                        >
                                            <XCircle size={14} />
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="ld-cohort-grid">
                                    {filteredCertificates.map((cert: any, index: number) => (
                                        <div
                                            key={cert.id}
                                            className="ld-cohort-card ld-cert-card"
                                            style={{ animationDelay: `${index * 0.08}s` }}
                                        >
                                            <div className="ld-cohort-card__header">
                                                <div className="ld-cert-card__icon-wrap">
                                                    <Award size={18} />
                                                </div>
                                                <div className="ld-cert-card__title-group">
                                                    <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
                                                </div>
                                                <span className="ld-badge ld-badge--issued">Issued</span>
                                            </div>

                                            <div className="ld-cohort-card__roles">
                                                <div className="ld-role-row">
                                                    <BookOpen size={12} />
                                                    <span className="ld-role-label">Programme</span>
                                                    <span className="ld-role-name">{cert.courseName}</span>
                                                </div>
                                                <div className="ld-role-row">
                                                    <Calendar size={12} />
                                                    <span className="ld-role-label">Issued</span>
                                                    <span className="ld-role-name">
                                                        {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
                                                            day: 'numeric', month: 'short', year: 'numeric'
                                                        })}
                                                    </span>
                                                </div>
                                                <div className="ld-role-row">
                                                    <CheckCircle size={12} />
                                                    <span className="ld-role-label">Status</span>
                                                    <span className="ld-role-name ld-role-name--success">Valid</span>
                                                </div>
                                            </div>

                                            <div className="ld-cohort-card__footer">
                                                <button
                                                    className="ld-btn ld-btn--download"
                                                    onClick={() => window.open(cert.pdfUrl, '_blank')}
                                                >
                                                    <Download size={14} />
                                                    <span>Download PDF</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default LearnerDashboard;



// // src/pages/LearnerPortal/LearnerDashboard.tsx

// import React, { useEffect, useState, useMemo } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import {
//     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
//     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
//     Hexagon, Mail, Search, Filter, ChevronDown, ChevronUp, XCircle, Zap, AlertCircle, Loader2
// } from 'lucide-react';
// import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { useStore } from '../../../store/useStore';
// import { auth, db } from '../../../lib/firebase';
// import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// import { useToast } from '../../../components/common/Toast/Toast';
// import './LearnerDashboard.css';

// type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
// type SortType = 'newest' | 'oldest' | 'name';

// // ─── ACTION INBOX COMPONENT ──────────────────────────────────────────────────
// const LearnerActionInbox: React.FC<{ profileId: string; pendingLogs: any[] }> = ({ profileId, pendingLogs }) => {
//     const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
//     const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
//     const [now, setNow] = useState(new Date());
//     const toast = useToast();

//     // Update time every minute for the countdowns
//     useEffect(() => {
//         const interval = setInterval(() => setNow(new Date()), 60000);
//         return () => clearInterval(interval);
//     }, []);

//     // Group logs by Module Code to match the Facilitator Accordion style
//     const groupedLogs = useMemo(() => {
//         const groups: Record<string, any[]> = {};
//         pendingLogs.forEach(log => {
//             const code = log.moduleCode || 'General';
//             if (!groups[code]) groups[code] = [];
//             groups[code].push(log);
//         });
//         return groups;
//     }, [pendingLogs]);

//     // Auto-expand all modules by default so the learner sees everything immediately
//     useEffect(() => {
//         if (pendingLogs.length > 0 && expandedModules.size === 0) {
//             setExpandedModules(new Set(Object.keys(groupedLogs)));
//         }
//     }, [groupedLogs, pendingLogs.length]);

//     const toggleModuleAccordion = (moduleCode: string) => {
//         setExpandedModules(prev => {
//             const next = new Set(prev);
//             if (next.has(moduleCode)) next.delete(moduleCode);
//             else next.add(moduleCode);
//             return next;
//         });
//     };

//     const handleAcknowledge = async (logId: string) => {
//         setAcknowledgingId(logId);
//         try {
//             const functions = getFunctions();
//             const ackFn = httpsCallable(functions, 'acknowledgeCurriculumTopic');
//             await ackFn({ logId, learnerId: profileId });

//             toast.success("✅ Topic Acknowledged! +1 Streak");
//         } catch (error) {
//             console.error("Ack Error:", error);
//             toast.error("Failed to acknowledge. Please try again.");
//         } finally {
//             setAcknowledgingId(null);
//         }
//     };

//     const formatTimeLeft = (deadlineIso: string) => {
//         const total = new Date(deadlineIso).getTime() - now.getTime();
//         if (total <= 0) return "Expired";
//         const h = Math.floor(total / (1000 * 60 * 60));
//         const m = Math.floor((total / 1000 / 60) % 60);
//         if (h > 24) return `${Math.floor(h / 24)} days left`;
//         return `${h}h ${m}m left`;
//     };

//     if (pendingLogs.length === 0) {
//         return (
//             <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1.5rem' }}>
//                 <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
//                     <h2 className="lfm-header__title"><Zap size={18} /> Action Required</h2>
//                 </div>
//                 <div className="lfm-body" style={{ background: 'white', border: '2px solid var(--mlab-blue)', borderTop: 'none', padding: '4rem 2rem', borderRadius: '0 0 8px 8px', textAlign: 'center' }}>
//                     <CheckCircle size={48} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
//                     <h3 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>Inbox Zero!</h3>
//                     <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>You are all caught up. No pending curriculum topics to acknowledge.</p>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1.5rem' }}>
//             <div className="lfm-header" style={{ background: '#f59e0b' }}>
//                 <h2 className="lfm-header__title" style={{ color: 'white' }}>
//                     <Zap size={18} /> Action Required: Pending Acknowledgements
//                 </h2>
//             </div>
//             <div className="lfm-body" style={{ background: 'white', border: '2px solid #f59e0b', borderTop: 'none', padding: '1.5rem', borderRadius: '0 0 8px 8px' }}>
//                 <p style={{ color: '#b45309', fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', background: '#fffbeb', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
//                     <AlertCircle size={16} /> Your facilitator has published new topics. Acknowledge them below to maintain your streak!
//                 </p>

//                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                     {Object.keys(groupedLogs).map(modCode => {
//                         const logs = groupedLogs[modCode];
//                         const moduleName = logs[0].moduleName || 'Unnamed Module';
//                         const isOpen = expandedModules.has(modCode);

//                         return (
//                             <div key={modCode}>
//                                 <div
//                                     className="lfm-section-hdr"
//                                     style={{ cursor: 'pointer', borderBottomColor: '#f59e0b', opacity: isOpen ? 1 : 0.85, background: '#fffbeb' }}
//                                     onClick={() => toggleModuleAccordion(modCode)}
//                                 >
//                                     <Layers size={16} color="#d97706" />
//                                     <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                         <span style={{ color: '#92400e', fontWeight: 700 }}>{modCode} <span style={{ color: '#b45309', fontWeight: 400 }}>{moduleName}</span></span>
//                                         <span style={{ background: '#fde68a', color: '#92400e', border: '1px solid #fcd34d', padding: '2px 8px', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                             {logs.length} Topic{logs.length !== 1 ? 's' : ''} Pending
//                                         </span>
//                                     </div>
//                                     {isOpen ? <ChevronUp size={16} color="#92400e" /> : <ChevronDown size={16} color="#92400e" />}
//                                 </div>

//                                 {isOpen && (
//                                     <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid #f59e0b', padding: 0, marginTop: '-0.75rem' }}>
//                                         <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
//                                             <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
//                                                 <thead style={{ background: '#fef3c7' }}>
//                                                     <tr>
//                                                         <th style={{ color: 'grey' }}>Topic / Activity</th>
//                                                         <th style={{ width: '200px', color: 'grey' }}>Urgency</th>
//                                                         <th style={{ width: '150px', color: 'grey', textAlign: 'right' }}>Action</th>
//                                                     </tr>
//                                                 </thead>
//                                                 <tbody>
//                                                     {logs.map(log => {
//                                                         const isUrgent = (new Date(log.deadlineAt).getTime() - now.getTime()) < (12 * 60 * 60 * 1000);

//                                                         return (
//                                                             <tr key={log.id} style={{ background: isUrgent ? '#fef2f2' : 'white' }}>
//                                                                 <td>
//                                                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                                                         <span style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>
//                                                                             {log.topicCode ? `${log.topicCode}: ` : ''}{log.topicTitle}
//                                                                         </span>
//                                                                         <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>
//                                                                             {log.moduleType}
//                                                                         </span>
//                                                                     </div>
//                                                                 </td>
//                                                                 <td>
//                                                                     <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: isUrgent ? '#dc2626' : '#d97706', fontSize: '0.75rem', fontWeight: 700, background: isUrgent ? '#fee2e2' : '#fffbeb', border: `1px solid ${isUrgent ? '#fca5a5' : '#fde68a'}`, padding: '4px 8px', borderRadius: '4px' }}>
//                                                                         <Clock size={12} /> {formatTimeLeft(log.deadlineAt)}
//                                                                     </div>
//                                                                 </td>
//                                                                 <td style={{ textAlign: 'right' }}>
//                                                                     <button
//                                                                         className="mlab-btn mlab-btn--sm"
//                                                                         style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none', padding: '6px 16px', minWidth: '110px', display: 'inline-flex', justifyContent: 'center' }}
//                                                                         onClick={() => handleAcknowledge(log.id)}
//                                                                         disabled={acknowledgingId === log.id}
//                                                                     >
//                                                                         {acknowledgingId === log.id ? <Loader2 size={14} className="lfm-spin" /> : "Acknowledge"}
//                                                                     </button>
//                                                                 </td>
//                                                             </tr>
//                                                         );
//                                                     })}
//                                                 </tbody>
//                                             </table>
//                                         </div>
//                                     </div>
//                                 )}
//                             </div>
//                         );
//                     })}
//                 </div>
//             </div>
//         </div>
//     );
// };

// // ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
// const LearnerDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();

//     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );
//     const [activeDashTab, setActiveDashTab] = useState<'programmes' | 'tasks'>('programmes');

//     const [academicProfile, setAcademicProfile] = useState<any>(null);
//     const [learnerEnrollments, setLearnerEnrollments] = useState<any[]>([]);
//     const [pendingLogs, setPendingLogs] = useState<any[]>([]);

//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [isLoading, setIsLoading] = useState(true);

//     // Search and Filter States
//     const [cohortSearch, setCohortSearch] = useState('');
//     const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
//     const [cohortSort, setCohortSort] = useState<SortType>('newest');
//     const [showCohortFilters, setShowCohortFilters] = useState(false);

//     const [certSearch, setCertSearch] = useState('');
//     const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
//     const [certSort, setCertSort] = useState<SortType>('newest');
//     const [showCertFilters, setShowCertFilters] = useState(false);

//     useEffect(() => {
//         setIsMobileMenuOpen(false);
//     }, [currentNav]);

//     // Fetch Profile and Ledgers
//     useEffect(() => {
//         store.fetchCohorts();
//         store.fetchStaff();

//         if (!store.user?.uid || !store.user?.email) return;

//         const fetchProfileAndLedger = async () => {
//             setIsLoading(true);
//             try {
//                 const emailQ = query(collection(db, 'learners'), where('email', '==', store.user!.email));
//                 const authQ = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));

//                 const [emailSnap, authSnap] = await Promise.all([getDocs(emailQ), getDocs(authQ)]);

//                 const allDocs = new Map();
//                 emailSnap.docs.forEach(d => allDocs.set(d.id, d));
//                 authSnap.docs.forEach(d => allDocs.set(d.id, d));

//                 const docsArray = Array.from(allDocs.values());

//                 if (docsArray.length > 0) {
//                     const profileDoc = docsArray[0];
//                     const profileData = profileDoc.data();
//                     const finalProfileId = profileDoc.id;

//                     setAcademicProfile({ id: finalProfileId, ...profileData });

//                     const enrolQ = query(
//                         collection(db, 'enrollments'),
//                         where('learnerId', '==', finalProfileId),
//                         where('status', 'in', ['active', 'in-progress'])
//                     );
//                     const enrolSnap = await getDocs(enrolQ);

//                     const activeEnrollments = enrolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
//                     setLearnerEnrollments(activeEnrollments);
//                 }
//             } catch (error) {
//                 console.error('Error fetching learner profile and ledger:', error);
//             } finally {
//                 setIsLoading(false);
//             }
//         };

//         fetchProfileAndLedger();
//     }, [store.user?.uid, store.user?.email]);

//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             navigate('/login');
//         } catch (error) {
//             console.error('Logout failed', error);
//         }
//     };

//     const myCohorts = useMemo(() => {
//         if (learnerEnrollments.length === 0 || !store.cohorts) return [];
//         const enrolledCohortIds = new Set(learnerEnrollments.map(e => e.cohortId));
//         return store.cohorts.filter(c => enrolledCohortIds.has(c.id));
//     }, [learnerEnrollments, store.cohorts]);

//     // INBOX LISTENER 🚀
//     useEffect(() => {
//         if (!academicProfile?.id || myCohorts.length === 0) return;

//         const cohortIds = myCohorts.map(c => c.id);
//         const logsRef = collection(db, 'curriculum_logs');
//         const q = query(logsRef, where('cohortId', 'in', cohortIds));

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

//             const actionable = logs.filter(log => {
//                 const isPending = !log.acknowledgedBy?.includes(academicProfile.id);
//                 const isNotPenalized = !log.penalizedLearners?.includes(academicProfile.id);
//                 const hasNotExpired = new Date(log.deadlineAt) > new Date();
//                 return isPending && isNotPenalized && hasNotExpired;
//             });

//             actionable.sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
//             setPendingLogs(actionable);
//         });

//         return () => unsubscribe();
//     }, [academicProfile?.id, myCohorts]);

//     const getStaffName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     const filteredCohorts = useMemo(() => {
//         let result = [...myCohorts];

//         if (cohortSearch.trim()) {
//             const searchLower = cohortSearch.toLowerCase();
//             result = result.filter(c =>
//                 c.name?.toLowerCase().includes(searchLower) ||
//                 getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
//             );
//         }

//         const today = new Date();
//         if (cohortFilter === 'active') {
//             result = result.filter(c => {
//                 const start = new Date(c.startDate);
//                 const end = new Date(c.endDate);
//                 return start <= today && end >= today;
//             });
//         } else if (cohortFilter === 'completed') {
//             result = result.filter(c => new Date(c.endDate) < today);
//         } else if (cohortFilter === 'upcoming') {
//             result = result.filter(c => new Date(c.startDate) > today);
//         }

//         result.sort((a, b) => {
//             if (cohortSort === 'name') return a.name?.localeCompare(b.name);
//             const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
//             const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
//             return dateA.getTime() - dateB.getTime();
//         });

//         return result;
//     }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

//     const filteredCertificates = useMemo(() => {
//         const certs = academicProfile?.certificates || [];
//         let result = [...certs];

//         if (certSearch.trim()) {
//             const searchLower = certSearch.toLowerCase();
//             result = result.filter((c: any) =>
//                 c.type?.toLowerCase().includes(searchLower) ||
//                 c.courseName?.toLowerCase().includes(searchLower)
//             );
//         }

//         if (certFilter !== 'all') {
//             result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
//         }

//         result.sort((a: any, b: any) => {
//             if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
//             const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
//             const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
//             return dateA.getTime() - dateB.getTime();
//         });

//         return result;
//     }, [academicProfile?.certificates, certSearch, certFilter, certSort]);

//     const pageTitle =
//         currentNav === 'dashboard' ? 'My Dashboard' :
//             currentNav === 'certificates' ? 'My Certificates' :
//                 'My Profile';

//     const pageSub =
//         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
//             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
//                 'Manage your personal details and account';

//     const clearCohortFilters = () => {
//         setCohortSearch('');
//         setCohortFilter('all');
//         setCohortSort('newest');
//     };

//     const clearCertFilters = () => {
//         setCertSearch('');
//         setCertFilter('all');
//         setCertSort('newest');
//     };

//     const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
//     const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

//     const pScore = academicProfile?.professionalismScore ?? 100;
//     const pStreak = academicProfile?.professionalismStreak ?? 0;

//     if (isLoading) {
//         return (
//             <div className="admin-layout learner-layout">
//                 <div className="ld-loading">
//                     <Hexagon size={40} className="ld-loading__icon" />
//                     <span>Loading...</span>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div className="admin-layout learner-layout">
//             <header className="ld-mobile-header">
//                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                     <Menu size={20} />
//                 </button>
//                 <div className="ld-mobile-brand">
//                     <span className="ld-mobile-brand__logo">mLab</span>
//                     <span className="ld-mobile-brand__sub">Learner Portal</span>
//                 </div>
//             </header>

//             {isMobileMenuOpen && (
//                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
//             )}

//             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
//                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
//                     <X size={20} />
//                 </button>
//                 <Sidebar
//                     role={store.user?.role}
//                     currentNav={currentNav}
//                     setCurrentNav={setCurrentNav as any}
//                     onLogout={handleLogout}
//                 />
//             </div>

//             <main className="main-wrapper">
//                 <div className="dashboard-header dashboard-header--compact" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
//                     <div className="header-title">
//                         <div className="header-badge">
//                             <Shield size={12} />
//                             <span>Verified</span>
//                         </div>
//                         <h1>{pageTitle}</h1>
//                         <p>{pageSub}</p>
//                     </div>

//                     {/* GAMIFICATION HEADER */}
//                     {currentNav === 'dashboard' && (
//                         <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
//                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '1rem', borderRight: '1px solid var(--mlab-border)' }}>
//                                 <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Score</span>
//                                 <span style={{ fontSize: '1.25rem', fontWeight: 800, color: pScore >= 80 ? 'var(--mlab-green)' : (pScore >= 50 ? '#d97706' : '#dc2626') }}>💯 {pScore}</span>
//                             </div>
//                             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//                                 <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Streak</span>
//                                 <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>🔥 {pStreak}</span>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="admin-content">
//                     {currentNav === 'dashboard' && (
//                         <div className="ld-animate">

//                             <div className="ld-stats-bar">
//                                 <div className="ld-stat-item">
//                                     <div className="ld-stat__icon ld-stat__icon--blue">
//                                         <GraduationCap size={18} />
//                                     </div>
//                                     <div className="ld-stat__info">
//                                         <span className="ld-stat__value">{myCohorts.length}</span>
//                                         <span className="ld-stat__label">Programmes</span>
//                                     </div>
//                                 </div>
//                                 <div className="ld-stat-divider" />
//                                 <div className="ld-stat-item">
//                                     <div className="ld-stat__icon ld-stat__icon--green">
//                                         <Award size={18} />
//                                     </div>
//                                     <div className="ld-stat__info">
//                                         <span className="ld-stat__value">{academicProfile?.certificates?.length || 0}</span>
//                                         <span className="ld-stat__label">Certificates</span>
//                                     </div>
//                                 </div>
//                                 <div className="ld-stat-divider" />
//                                 <div className="ld-stat-item">
//                                     <div className="ld-stat__icon ld-stat__icon--amber">
//                                         <Clock size={18} />
//                                     </div>
//                                     <div className="ld-stat__info">
//                                         <span className="ld-stat__value">On Track</span>
//                                         <span className="ld-stat__label">Attendance</span>
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* TABBED NAVIGATION (Matches Facilitator View) */}
//                             <div className="lfm-tabs" style={{ marginBottom: '1.5rem', marginTop: '1.5rem' }}>
//                                 <button
//                                     className={`lfm-tab ${activeDashTab === 'programmes' ? 'active' : ''}`}
//                                     onClick={() => setActiveDashTab('programmes')}
//                                 >
//                                     <Layers size={16} /> My Programmes
//                                 </button>
//                                 <button
//                                     className={`lfm-tab ${activeDashTab === 'tasks' ? 'active' : ''}`}
//                                     onClick={() => setActiveDashTab('tasks')}
//                                 >
//                                     <Zap size={16} /> Action Required
//                                     {pendingLogs.length > 0 && (
//                                         <span style={{
//                                             background: '#dc2626', color: 'white', padding: '2px 6px',
//                                             borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '6px'
//                                         }}>
//                                             {pendingLogs.length}
//                                         </span>
//                                     )}
//                                 </button>
//                             </div>

//                             {/* TAB CONTENT */}
//                             {activeDashTab === 'tasks' && (
//                                 <div className="animate-fade-in">
//                                     <LearnerActionInbox profileId={academicProfile.id} pendingLogs={pendingLogs} />
//                                 </div>
//                             )}

//                             {activeDashTab === 'programmes' && (
//                                 <div className="animate-fade-in">
//                                     <div className="ld-section-header">
//                                         <h2 className="ld-section-title">
//                                             <Layers size={16} /> Active Cohorts
//                                             <span className="ld-count-badge">{filteredCohorts.length}</span>
//                                         </h2>

//                                         <div className="ld-search-filter-bar">
//                                             <div className="ld-search-box">
//                                                 <Search size={16} className="ld-search-icon" />
//                                                 <input
//                                                     type="text"
//                                                     placeholder="Search programmes..."
//                                                     value={cohortSearch}
//                                                     onChange={(e) => setCohortSearch(e.target.value)}
//                                                     className="ld-search-input"
//                                                 />
//                                                 {cohortSearch && (
//                                                     <button
//                                                         className="ld-clear-btn"
//                                                         onClick={() => setCohortSearch('')}
//                                                     >
//                                                         <XCircle size={14} />
//                                                     </button>
//                                                 )}
//                                             </div>

//                                             <button
//                                                 className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`}
//                                                 onClick={() => setShowCohortFilters(!showCohortFilters)}
//                                             >
//                                                 <Filter size={16} />
//                                                 <span>Filter</span>
//                                                 {hasActiveCohortFilters && <span className="ld-filter-dot" />}
//                                                 <ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
//                                             </button>
//                                         </div>
//                                     </div>

//                                     {showCohortFilters && (
//                                         <div className="ld-filter-panel">
//                                             <div className="ld-filter-group">
//                                                 <label>Status</label>
//                                                 <div className="ld-filter-chips">
//                                                     {[
//                                                         { key: 'all', label: 'All' },
//                                                         { key: 'active', label: 'Active' },
//                                                         { key: 'upcoming', label: 'Upcoming' },
//                                                         { key: 'completed', label: 'Completed' }
//                                                     ].map((f) => (
//                                                         <button
//                                                             key={f.key}
//                                                             className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`}
//                                                             onClick={() => setCohortFilter(f.key as FilterType)}
//                                                         >
//                                                             {f.label}
//                                                         </button>
//                                                     ))}
//                                                 </div>
//                                             </div>

//                                             <div className="ld-filter-group">
//                                                 <label>Sort By</label>
//                                                 <select
//                                                     value={cohortSort}
//                                                     onChange={(e) => setCohortSort(e.target.value as SortType)}
//                                                     className="ld-filter-select"
//                                                 >
//                                                     <option value="newest">Newest First</option>
//                                                     <option value="oldest">Oldest First</option>
//                                                     <option value="name">Name A-Z</option>
//                                                 </select>
//                                             </div>

//                                             {hasActiveCohortFilters && (
//                                                 <button className="ld-clear-filters" onClick={clearCohortFilters}>
//                                                     <XCircle size={14} /> Clear All
//                                                 </button>
//                                             )}
//                                         </div>
//                                     )}

//                                     <div className="ld-cohort-grid">
//                                         {filteredCohorts.map((cohort, index) => (
//                                             <div
//                                                 key={cohort.id}
//                                                 className="ld-cohort-card"
//                                                 style={{ animationDelay: `${index * 0.08}s` }}
//                                             >
//                                                 <div className="ld-cohort-card__header">
//                                                     <h3 className="ld-cohort-card__name">{cohort.name}</h3>
//                                                     <span className="ld-badge ld-badge--active">Active</span>
//                                                 </div>

//                                                 <div className="ld-cohort-card__dates">
//                                                     <Calendar size={12} />
//                                                     <span>{cohort.startDate} — {cohort.endDate}</span>
//                                                 </div>

//                                                 <div className="ld-cohort-card__roles">
//                                                     <div className="ld-role-row">
//                                                         <div className="ld-role-dot ld-role-dot--blue" />
//                                                         <span className="ld-role-label">Facilitator</span>
//                                                         <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
//                                                     </div>
//                                                     <div className="ld-role-row">
//                                                         <div className="ld-role-dot ld-role-dot--red" />
//                                                         <span className="ld-role-label">Assessor</span>
//                                                         <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
//                                                     </div>
//                                                     {cohort.moderatorId && (
//                                                         <div className="ld-role-row">
//                                                             <div className="ld-role-dot ld-role-dot--green" />
//                                                             <span className="ld-role-label">Moderator</span>
//                                                             <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
//                                                         </div>
//                                                     )}
//                                                 </div>

//                                                 <div className="ld-cohort-card__footer">
//                                                     <button
//                                                         className="ld-btn ld-btn--primary"
//                                                         onClick={() => navigate(`/portfolio/${academicProfile?.id}`, { state: { cohortId: cohort.id } })}
//                                                     >
//                                                         <span>Portfolio</span>
//                                                         <ArrowRight size={14} />
//                                                     </button>
//                                                 </div>
//                                             </div>
//                                         ))}

//                                         {filteredCohorts.length === 0 && (
//                                             <div className="ld-empty">
//                                                 <div className="ld-empty__icon">
//                                                     <Search size={32} strokeWidth={1.5} />
//                                                 </div>
//                                                 <span className="ld-empty__title">No Active Enrollments</span>
//                                                 <p className="ld-empty__desc">
//                                                     You are currently not enrolled in any active classes.
//                                                     If you believe this is an error, please contact administration.
//                                                 </p>
//                                             </div>
//                                         )}
//                                     </div>
//                                 </div>
//                             )}

//                         </div>
//                     )}

//                     {currentNav === 'profile' && (
//                         <LearnerProfileView
//                             profile={academicProfile}
//                             user={store.user}
//                             onUpdate={store.updateLearner}
//                         />
//                     )}

//                     {currentNav === 'certificates' && (
//                         <div className="ld-animate">
//                             <div className="ld-section-header">
//                                 <h2 className="ld-section-title">
//                                     <Award size={16} /> Issued Certificates
//                                     <span className="ld-count-badge">{filteredCertificates.length}</span>
//                                 </h2>

//                                 <div className="ld-search-filter-bar">
//                                     <div className="ld-search-box">
//                                         <Search size={16} className="ld-search-icon" />
//                                         <input
//                                             type="text"
//                                             placeholder="Search certificates..."
//                                             value={certSearch}
//                                             onChange={(e) => setCertSearch(e.target.value)}
//                                             className="ld-search-input"
//                                         />
//                                         {certSearch && (
//                                             <button
//                                                 className="ld-clear-btn"
//                                                 onClick={() => setCertSearch('')}
//                                             >
//                                                 <XCircle size={14} />
//                                             </button>
//                                         )}
//                                     </div>

//                                     <button
//                                         className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`}
//                                         onClick={() => setShowCertFilters(!showCertFilters)}
//                                     >
//                                         <Filter size={16} />
//                                         <span>Filter</span>
//                                         {hasActiveCertFilters && <span className="ld-filter-dot" />}
//                                         <ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
//                                     </button>
//                                 </div>
//                             </div>

//                             {showCertFilters && (
//                                 <div className="ld-filter-panel">
//                                     <div className="ld-filter-group">
//                                         <label>Type</label>
//                                         <div className="ld-filter-chips">
//                                             {[
//                                                 { key: 'all', label: 'All Types' },
//                                                 { key: 'certificate', label: 'Certificate' },
//                                                 { key: 'statement', label: 'Statement' }
//                                             ].map((f) => (
//                                                 <button
//                                                     key={f.key}
//                                                     className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`}
//                                                     onClick={() => setCertFilter(f.key as any)}
//                                                 >
//                                                     {f.label}
//                                                 </button>
//                                             ))}
//                                         </div>
//                                     </div>

//                                     <div className="ld-filter-group">
//                                         <label>Sort By</label>
//                                         <select
//                                             value={certSort}
//                                             onChange={(e) => setCertSort(e.target.value as SortType)}
//                                             className="ld-filter-select"
//                                         >
//                                             <option value="newest">Newest First</option>
//                                             <option value="oldest">Oldest First</option>
//                                             <option value="name">Name A-Z</option>
//                                         </select>
//                                     </div>

//                                     {hasActiveCertFilters && (
//                                         <button className="ld-clear-filters" onClick={clearCertFilters}>
//                                             <XCircle size={14} /> Clear All
//                                         </button>
//                                     )}
//                                 </div>
//                             )}

//                             {filteredCertificates.length === 0 ? (
//                                 <div className="ld-empty ld-empty--large">
//                                     <div className="ld-empty__icon">
//                                         {certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}
//                                     </div>
//                                     <span className="ld-empty__title">
//                                         {certSearch ? 'No Results Found' : 'No Certificates Yet'}
//                                     </span>
//                                     <p className="ld-empty__desc">
//                                         {certSearch
//                                             ? `No certificates match "${certSearch}"`
//                                             : 'Certificates appear here after programme completion.'}
//                                     </p>
//                                     {hasActiveCertFilters && certSearch && (
//                                         <button
//                                             className="ld-btn ld-btn--ghost ld-btn--sm"
//                                             onClick={clearCertFilters}
//                                         >
//                                             <XCircle size={14} />
//                                             Clear Filters
//                                         </button>
//                                     )}
//                                 </div>
//                             ) : (
//                                 <div className="ld-cohort-grid">
//                                     {filteredCertificates.map((cert: any, index: number) => (
//                                         <div
//                                             key={cert.id}
//                                             className="ld-cohort-card ld-cert-card"
//                                             style={{ animationDelay: `${index * 0.08}s` }}
//                                         >
//                                             <div className="ld-cohort-card__header">
//                                                 <div className="ld-cert-card__icon-wrap">
//                                                     <Award size={18} />
//                                                 </div>
//                                                 <div className="ld-cert-card__title-group">
//                                                     <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
//                                                 </div>
//                                                 <span className="ld-badge ld-badge--issued">Issued</span>
//                                             </div>

//                                             <div className="ld-cohort-card__roles">
//                                                 <div className="ld-role-row">
//                                                     <BookOpen size={12} />
//                                                     <span className="ld-role-label">Programme</span>
//                                                     <span className="ld-role-name">{cert.courseName}</span>
//                                                 </div>
//                                                 <div className="ld-role-row">
//                                                     <Calendar size={12} />
//                                                     <span className="ld-role-label">Issued</span>
//                                                     <span className="ld-role-name">
//                                                         {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
//                                                             day: 'numeric', month: 'short', year: 'numeric'
//                                                         })}
//                                                     </span>
//                                                 </div>
//                                                 <div className="ld-role-row">
//                                                     <CheckCircle size={12} />
//                                                     <span className="ld-role-label">Status</span>
//                                                     <span className="ld-role-name ld-role-name--success">Valid</span>
//                                                 </div>
//                                             </div>

//                                             <div className="ld-cohort-card__footer">
//                                                 <button
//                                                     className="ld-btn ld-btn--download"
//                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
//                                                 >
//                                                     <Download size={14} />
//                                                     <span>Download PDF</span>
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     ))}
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };

// export default LearnerDashboard;


// // // src/pages/LearnerPortal/LearnerDashboard.tsx

// // import React, { useEffect, useState, useMemo } from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import {
// //     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
// //     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
// //     Hexagon, Mail, Search, Filter, ChevronDown, XCircle
// // } from 'lucide-react';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // import { useStore } from '../../../store/useStore';
// // import { auth, db } from '../../../lib/firebase';
// // import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// // import './LearnerDashboard.css';

// // type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
// // type SortType = 'newest' | 'oldest' | 'name';

// // const LearnerDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();

// //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );
// //     const [academicProfile, setAcademicProfile] = useState<any>(null);
// //     const [learnerEnrollments, setLearnerEnrollments] = useState<any[]>([]);

// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// //     const [isLoading, setIsLoading] = useState(true);

// //     // Search and Filter States
// //     const [cohortSearch, setCohortSearch] = useState('');
// //     const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
// //     const [cohortSort, setCohortSort] = useState<SortType>('newest');
// //     const [showCohortFilters, setShowCohortFilters] = useState(false);

// //     const [certSearch, setCertSearch] = useState('');
// //     const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
// //     const [certSort, setCertSort] = useState<SortType>('newest');
// //     const [showCertFilters, setShowCertFilters] = useState(false);

// //     useEffect(() => {
// //         setIsMobileMenuOpen(false);
// //     }, [currentNav]);

// //     useEffect(() => {
// //         store.fetchCohorts();
// //         store.fetchStaff();

// //         if (!store.user?.uid || !store.user?.email) return;

// //         const fetchProfileAndLedger = async () => {
// //             setIsLoading(true);
// //             try {
// //                 // 1. Fetch Human Profile
// //                 const emailQ = query(collection(db, 'learners'), where('email', '==', store.user!.email));
// //                 const authQ = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));

// //                 const [emailSnap, authSnap] = await Promise.all([getDocs(emailQ), getDocs(authQ)]);

// //                 const allDocs = new Map();
// //                 emailSnap.docs.forEach(d => allDocs.set(d.id, d));
// //                 authSnap.docs.forEach(d => allDocs.set(d.id, d));

// //                 const docsArray = Array.from(allDocs.values());

// //                 if (docsArray.length > 0) {
// //                     // Use the first valid profile found
// //                     const profileDoc = docsArray[0];
// //                     const profileData = profileDoc.data();
// //                     const finalProfileId = profileDoc.id;

// //                     setAcademicProfile({
// //                         id: finalProfileId,
// //                         ...profileData
// //                     });

// //                     // 2. FETCH FROM ENROLLMENTS LEDGER (The new source of truth)
// //                     // We query the ledger to find any class where this specific human is enrolled.
// //                     const enrolQ = query(
// //                         collection(db, 'enrollments'),
// //                         where('learnerId', '==', finalProfileId),
// //                         where('status', 'in', ['active', 'in-progress']) // Optional: Filter out 'dropped'
// //                     );
// //                     const enrolSnap = await getDocs(enrolQ);

// //                     const activeEnrollments = enrolSnap.docs.map(d => ({ id: d.id, ...d.data() }));
// //                     setLearnerEnrollments(activeEnrollments);
// //                 }
// //             } catch (error) {
// //                 console.error('Error fetching learner profile and ledger:', error);
// //             } finally {
// //                 setIsLoading(false);
// //             }
// //         };

// //         fetchProfileAndLedger();

// //     }, [store.user?.uid, store.user?.email]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         }
// //         catch (error) {
// //             console.error('Logout failed', error);
// //         }
// //     };

// //     // LEDGER-FIRST COHORT RESOLUTION
// //     // The learner is in the cohort ONLY IF there is an active ledger document for it.
// //     const myCohorts = useMemo(() => {
// //         if (learnerEnrollments.length === 0 || !store.cohorts) return [];

// //         // Extract the IDs of the classes they are enrolled in from the ledger
// //         const enrolledCohortIds = new Set(learnerEnrollments.map(e => e.cohortId));

// //         // Find the full class details from the global store
// //         return store.cohorts.filter(c => enrolledCohortIds.has(c.id));
// //     }, [learnerEnrollments, store.cohorts]);


// //     const getStaffName = (id: string) =>
// //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     const filteredCohorts = useMemo(() => {
// //         let result = [...myCohorts];

// //         if (cohortSearch.trim()) {
// //             const searchLower = cohortSearch.toLowerCase();
// //             result = result.filter(c =>
// //                 c.name?.toLowerCase().includes(searchLower) ||
// //                 getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
// //             );
// //         }

// //         const today = new Date();
// //         if (cohortFilter === 'active') {
// //             result = result.filter(c => {
// //                 const start = new Date(c.startDate);
// //                 const end = new Date(c.endDate);
// //                 return start <= today && end >= today;
// //             });
// //         } else if (cohortFilter === 'completed') {
// //             result = result.filter(c => new Date(c.endDate) < today);
// //         } else if (cohortFilter === 'upcoming') {
// //             result = result.filter(c => new Date(c.startDate) > today);
// //         }

// //         result.sort((a, b) => {
// //             if (cohortSort === 'name') return a.name?.localeCompare(b.name);
// //             const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
// //             const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
// //             return dateA.getTime() - dateB.getTime();
// //         });

// //         return result;
// //     }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

// //     const filteredCertificates = useMemo(() => {
// //         const certs = academicProfile?.certificates || [];
// //         let result = [...certs];

// //         if (certSearch.trim()) {
// //             const searchLower = certSearch.toLowerCase();
// //             result = result.filter((c: any) =>
// //                 c.type?.toLowerCase().includes(searchLower) ||
// //                 c.courseName?.toLowerCase().includes(searchLower)
// //             );
// //         }

// //         if (certFilter !== 'all') {
// //             result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
// //         }

// //         result.sort((a: any, b: any) => {
// //             if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
// //             const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
// //             const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
// //             return dateA.getTime() - dateB.getTime();
// //         });

// //         return result;
// //     }, [academicProfile?.certificates, certSearch, certFilter, certSort]);

// //     const pageTitle =
// //         currentNav === 'dashboard' ? 'My Dashboard' :
// //             currentNav === 'certificates' ? 'My Certificates' :
// //                 'My Profile';

// //     const pageSub =
// //         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
// //             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
// //                 'Manage your personal details and account';

// //     const clearCohortFilters = () => {
// //         setCohortSearch('');
// //         setCohortFilter('all');
// //         setCohortSort('newest');
// //     };

// //     const clearCertFilters = () => {
// //         setCertSearch('');
// //         setCertFilter('all');
// //         setCertSort('newest');
// //     };

// //     const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
// //     const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

// //     if (isLoading) {
// //         return (
// //             <div className="admin-layout learner-layout">
// //                 <div className="ld-loading">
// //                     <Hexagon size={40} className="ld-loading__icon" />
// //                     <span>Loading...</span>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="admin-layout learner-layout">
// //             <header className="ld-mobile-header">
// //                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// //                     <Menu size={20} />
// //                 </button>
// //                 <div className="ld-mobile-brand">
// //                     <span className="ld-mobile-brand__logo">mLab</span>
// //                     <span className="ld-mobile-brand__sub">Learner Portal</span>
// //                 </div>
// //             </header>

// //             {isMobileMenuOpen && (
// //                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// //             )}

// //             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
// //                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// //                     <X size={20} />
// //                 </button>
// //                 <Sidebar
// //                     role={store.user?.role}
// //                     currentNav={currentNav}
// //                     setCurrentNav={setCurrentNav as any}
// //                     onLogout={handleLogout}
// //                 />
// //             </div>

// //             <main className="main-wrapper">
// //                 <div className="dashboard-header dashboard-header--compact">
// //                     <div className="header-title">
// //                         <div className="header-badge">
// //                             <Shield size={12} />
// //                             <span>Verified</span>
// //                         </div>
// //                         <h1>{pageTitle}</h1>
// //                         <p>{pageSub}</p>
// //                     </div>
// //                 </div>

// //                 <div className="admin-content">
// //                     {currentNav === 'dashboard' && (
// //                         <div className="ld-animate">
// //                             <div className="ld-stats-bar">
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--blue">
// //                                         <GraduationCap size={18} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">{myCohorts.length}</span>
// //                                         <span className="ld-stat__label">Programmes</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ld-stat-divider" />
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--green">
// //                                         <Award size={18} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">{academicProfile?.certificates?.length || 0}</span>
// //                                         <span className="ld-stat__label">Certificates</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ld-stat-divider" />
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--amber">
// //                                         <Clock size={18} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">On Track</span>
// //                                         <span className="ld-stat__label">Attendance</span>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <div className="ld-section-header">
// //                                 <h2 className="ld-section-title">
// //                                     <Layers size={16} /> Active Cohorts
// //                                     <span className="ld-count-badge">{filteredCohorts.length}</span>
// //                                 </h2>

// //                                 <div className="ld-search-filter-bar">
// //                                     <div className="ld-search-box">
// //                                         <Search size={16} className="ld-search-icon" />
// //                                         <input
// //                                             type="text"
// //                                             placeholder="Search programmes..."
// //                                             value={cohortSearch}
// //                                             onChange={(e) => setCohortSearch(e.target.value)}
// //                                             className="ld-search-input"
// //                                         />
// //                                         {cohortSearch && (
// //                                             <button
// //                                                 className="ld-clear-btn"
// //                                                 onClick={() => setCohortSearch('')}
// //                                             >
// //                                                 <XCircle size={14} />
// //                                             </button>
// //                                         )}
// //                                     </div>

// //                                     <button
// //                                         className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`}
// //                                         onClick={() => setShowCohortFilters(!showCohortFilters)}
// //                                     >
// //                                         <Filter size={16} />
// //                                         <span>Filter</span>
// //                                         {hasActiveCohortFilters && <span className="ld-filter-dot" />}
// //                                         <ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             {showCohortFilters && (
// //                                 <div className="ld-filter-panel">
// //                                     <div className="ld-filter-group">
// //                                         <label>Status</label>
// //                                         <div className="ld-filter-chips">
// //                                             {[
// //                                                 { key: 'all', label: 'All' },
// //                                                 { key: 'active', label: 'Active' },
// //                                                 { key: 'upcoming', label: 'Upcoming' },
// //                                                 { key: 'completed', label: 'Completed' }
// //                                             ].map((f) => (
// //                                                 <button
// //                                                     key={f.key}
// //                                                     className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`}
// //                                                     onClick={() => setCohortFilter(f.key as FilterType)}
// //                                                 >
// //                                                     {f.label}
// //                                                 </button>
// //                                             ))}
// //                                         </div>
// //                                     </div>

// //                                     <div className="ld-filter-group">
// //                                         <label>Sort By</label>
// //                                         <select
// //                                             value={cohortSort}
// //                                             onChange={(e) => setCohortSort(e.target.value as SortType)}
// //                                             className="ld-filter-select"
// //                                         >
// //                                             <option value="newest">Newest First</option>
// //                                             <option value="oldest">Oldest First</option>
// //                                             <option value="name">Name A-Z</option>
// //                                         </select>
// //                                     </div>

// //                                     {hasActiveCohortFilters && (
// //                                         <button className="ld-clear-filters" onClick={clearCohortFilters}>
// //                                             <XCircle size={14} /> Clear All
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             )}

// //                             <div className="ld-cohort-grid">
// //                                 {filteredCohorts.map((cohort, index) => (
// //                                     <div
// //                                         key={cohort.id}
// //                                         className="ld-cohort-card"
// //                                         style={{ animationDelay: `${index * 0.08}s` }}
// //                                     >
// //                                         <div className="ld-cohort-card__header">
// //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// //                                             <span className="ld-badge ld-badge--active">Active</span>
// //                                         </div>

// //                                         <div className="ld-cohort-card__dates">
// //                                             <Calendar size={12} />
// //                                             <span>{cohort.startDate} — {cohort.endDate}</span>
// //                                         </div>

// //                                         <div className="ld-cohort-card__roles">
// //                                             <div className="ld-role-row">
// //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// //                                                 <span className="ld-role-label">Facilitator</span>
// //                                                 <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
// //                                             </div>
// //                                             <div className="ld-role-row">
// //                                                 <div className="ld-role-dot ld-role-dot--red" />
// //                                                 <span className="ld-role-label">Assessor</span>
// //                                                 <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
// //                                             </div>
// //                                             {cohort.moderatorId && (
// //                                                 <div className="ld-role-row">
// //                                                     <div className="ld-role-dot ld-role-dot--green" />
// //                                                     <span className="ld-role-label">Moderator</span>
// //                                                     <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
// //                                                 </div>
// //                                             )}
// //                                         </div>

// //                                         <div className="ld-cohort-card__footer">
// //                                             <button
// //                                                 className="ld-btn ld-btn--primary"
// //                                                 onClick={() => navigate(`/portfolio/${academicProfile?.id}`, { state: { cohortId: cohort.id } })}
// //                                             >
// //                                                 <span>Portfolio</span>
// //                                                 <ArrowRight size={14} />
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 ))}

// //                                 {filteredCohorts.length === 0 && (
// //                                     <div className="ld-empty">
// //                                         <div className="ld-empty__icon">
// //                                             <Search size={32} strokeWidth={1.5} />
// //                                         </div>
// //                                         <span className="ld-empty__title">No Active Enrollments</span>
// //                                         <p className="ld-empty__desc">
// //                                             You are currently not enrolled in any active classes.
// //                                             If you believe this is an error, please contact administration.
// //                                         </p>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {currentNav === 'profile' && (
// //                         <LearnerProfileView
// //                             profile={academicProfile}
// //                             user={store.user}
// //                             onUpdate={store.updateLearner}
// //                         />
// //                     )}

// //                     {currentNav === 'certificates' && (
// //                         <div className="ld-animate">
// //                             <div className="ld-section-header">
// //                                 <h2 className="ld-section-title">
// //                                     <Award size={16} /> Issued Certificates
// //                                     <span className="ld-count-badge">{filteredCertificates.length}</span>
// //                                 </h2>

// //                                 <div className="ld-search-filter-bar">
// //                                     <div className="ld-search-box">
// //                                         <Search size={16} className="ld-search-icon" />
// //                                         <input
// //                                             type="text"
// //                                             placeholder="Search certificates..."
// //                                             value={certSearch}
// //                                             onChange={(e) => setCertSearch(e.target.value)}
// //                                             className="ld-search-input"
// //                                         />
// //                                         {certSearch && (
// //                                             <button
// //                                                 className="ld-clear-btn"
// //                                                 onClick={() => setCertSearch('')}
// //                                             >
// //                                                 <XCircle size={14} />
// //                                             </button>
// //                                         )}
// //                                     </div>

// //                                     <button
// //                                         className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`}
// //                                         onClick={() => setShowCertFilters(!showCertFilters)}
// //                                     >
// //                                         <Filter size={16} />
// //                                         <span>Filter</span>
// //                                         {hasActiveCertFilters && <span className="ld-filter-dot" />}
// //                                         <ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             {showCertFilters && (
// //                                 <div className="ld-filter-panel">
// //                                     <div className="ld-filter-group">
// //                                         <label>Type</label>
// //                                         <div className="ld-filter-chips">
// //                                             {[
// //                                                 { key: 'all', label: 'All Types' },
// //                                                 { key: 'certificate', label: 'Certificate' },
// //                                                 { key: 'statement', label: 'Statement' }
// //                                             ].map((f) => (
// //                                                 <button
// //                                                     key={f.key}
// //                                                     className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`}
// //                                                     onClick={() => setCertFilter(f.key as any)}
// //                                                 >
// //                                                     {f.label}
// //                                                 </button>
// //                                             ))}
// //                                         </div>
// //                                     </div>

// //                                     <div className="ld-filter-group">
// //                                         <label>Sort By</label>
// //                                         <select
// //                                             value={certSort}
// //                                             onChange={(e) => setCertSort(e.target.value as SortType)}
// //                                             className="ld-filter-select"
// //                                         >
// //                                             <option value="newest">Newest First</option>
// //                                             <option value="oldest">Oldest First</option>
// //                                             <option value="name">Name A-Z</option>
// //                                         </select>
// //                                     </div>

// //                                     {hasActiveCertFilters && (
// //                                         <button className="ld-clear-filters" onClick={clearCertFilters}>
// //                                             <XCircle size={14} /> Clear All
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             )}

// //                             {filteredCertificates.length === 0 ? (
// //                                 <div className="ld-empty ld-empty--large">
// //                                     <div className="ld-empty__icon">
// //                                         {certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}
// //                                     </div>
// //                                     <span className="ld-empty__title">
// //                                         {certSearch ? 'No Results Found' : 'No Certificates Yet'}
// //                                     </span>
// //                                     <p className="ld-empty__desc">
// //                                         {certSearch
// //                                             ? `No certificates match "${certSearch}"`
// //                                             : 'Certificates appear here after programme completion.'}
// //                                     </p>
// //                                     {hasActiveCertFilters && certSearch && (
// //                                         <button
// //                                             className="ld-btn ld-btn--ghost ld-btn--sm"
// //                                             onClick={clearCertFilters}
// //                                         >
// //                                             <XCircle size={14} />
// //                                             Clear Filters
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             ) : (
// //                                 <div className="ld-cohort-grid">
// //                                     {filteredCertificates.map((cert: any, index: number) => (
// //                                         <div
// //                                             key={cert.id}
// //                                             className="ld-cohort-card ld-cert-card"
// //                                             style={{ animationDelay: `${index * 0.08}s` }}
// //                                         >
// //                                             <div className="ld-cohort-card__header">
// //                                                 <div className="ld-cert-card__icon-wrap">
// //                                                     <Award size={18} />
// //                                                 </div>
// //                                                 <div className="ld-cert-card__title-group">
// //                                                     <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
// //                                                 </div>
// //                                                 <span className="ld-badge ld-badge--issued">Issued</span>
// //                                             </div>

// //                                             <div className="ld-cohort-card__roles">
// //                                                 <div className="ld-role-row">
// //                                                     <BookOpen size={12} />
// //                                                     <span className="ld-role-label">Programme</span>
// //                                                     <span className="ld-role-name">{cert.courseName}</span>
// //                                                 </div>
// //                                                 <div className="ld-role-row">
// //                                                     <Calendar size={12} />
// //                                                     <span className="ld-role-label">Issued</span>
// //                                                     <span className="ld-role-name">
// //                                                         {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
// //                                                             day: 'numeric', month: 'short', year: 'numeric'
// //                                                         })}
// //                                                     </span>
// //                                                 </div>
// //                                                 <div className="ld-role-row">
// //                                                     <CheckCircle size={12} />
// //                                                     <span className="ld-role-label">Status</span>
// //                                                     <span className="ld-role-name ld-role-name--success">Valid</span>
// //                                                 </div>
// //                                             </div>

// //                                             <div className="ld-cohort-card__footer">
// //                                                 <button
// //                                                     className="ld-btn ld-btn--download"
// //                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
// //                                                 >
// //                                                     <Download size={14} />
// //                                                     <span>Download PDF</span>
// //                                                 </button>
// //                                             </div>
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };

// // export default LearnerDashboard;


// // // // src/pages/LearnerPortal/LearnerDashboard.tsx

// // // import React, { useEffect, useState, useMemo } from 'react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import { signOut } from 'firebase/auth';
// // // import {
// // //     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
// // //     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
// // //     Hexagon, Mail, Search, Filter, ChevronDown, XCircle
// // // } from 'lucide-react';
// // // import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
// // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // import { useStore } from '../../../store/useStore';
// // // import { auth, db } from '../../../lib/firebase';
// // // import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// // // import './LearnerDashboard.css';

// // // type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
// // // type SortType = 'newest' | 'oldest' | 'name';

// // // const LearnerDashboard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();
// // //     const store = useStore();

// // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
// // //         (location.state as any)?.activeTab || 'dashboard'
// // //     );
// // //     const [academicProfile, setAcademicProfile] = useState<any>(null);
// // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// // //     const [isLoading, setIsLoading] = useState(true);

// // //     // Search and Filter States
// // //     const [cohortSearch, setCohortSearch] = useState('');
// // //     const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
// // //     const [cohortSort, setCohortSort] = useState<SortType>('newest');
// // //     const [showCohortFilters, setShowCohortFilters] = useState(false);

// // //     const [certSearch, setCertSearch] = useState('');
// // //     const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
// // //     const [certSort, setCertSort] = useState<SortType>('newest');
// // //     const [showCertFilters, setShowCertFilters] = useState(false);

// // //     useEffect(() => {
// // //         setIsMobileMenuOpen(false);
// // //     }, [currentNav]);

// // //     useEffect(() => {
// // //         store.fetchCohorts();
// // //         store.fetchStaff();

// // //         if (!store.user?.uid || !store.user?.email) return;

// // //         const fetchProfile = async () => {
// // //             setIsLoading(true);
// // //             try {
// // //                 // 1. Fetch by Email
// // //                 const emailQ = query(collection(db, 'learners'), where('email', '==', store.user!.email));
// // //                 const emailSnap = await getDocs(emailQ);

// // //                 // 2. Fetch by AuthUid
// // //                 const authQ = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));
// // //                 const authSnap = await getDocs(authQ);

// // //                 // 3. Combine results
// // //                 const allDocs = new Map();
// // //                 emailSnap.docs.forEach(d => allDocs.set(d.id, d));
// // //                 authSnap.docs.forEach(d => allDocs.set(d.id, d));

// // //                 const docsArray = Array.from(allDocs.values());
// // //                 let lDoc: any = null;

// // //                 if (docsArray.length > 0) {
// // //                     lDoc = docsArray.find(d => d.data().cohortId && d.data().cohortId !== 'Unassigned');
// // //                     if (!lDoc) lDoc = docsArray[0];

// // //                     const lData = lDoc.data();

// // //                     setAcademicProfile({
// // //                         id: lDoc.id,
// // //                         ...lData
// // //                     });
// // //                 }
// // //             } catch (error) {
// // //                 console.error('Error fetching learner profile:', error);
// // //             } finally {
// // //                 setIsLoading(false);
// // //             }
// // //         };

// // //         fetchProfile();

// // //     }, [store.user?.uid, store.user?.email]);

// // //     const handleLogout = async () => {
// // //         try {
// // //             await signOut(auth);
// // //             navigate('/login');
// // //         }
// // //         catch (error) {
// // //             console.error('Logout failed', error);
// // //         }
// // //     };

// // //     // THE BULLETPROOF FIX: We check the Class Register (Admin perspective) directly!
// // //     const myCohorts = store.cohorts.filter(c => {
// // //         if (!academicProfile) return false;

// // //         // 1. Is the Learner's ID physically in the Cohort's class register?
// // //         if (c.learnerIds?.includes(academicProfile.id)) return true;

// // //         // 2. Does the Learner's profile explicitly state they are in this cohort?
// // //         if (c.id === academicProfile.cohortId && c.id !== 'Unassigned') return true;

// // //         return false;
// // //     });

// // //     // AUTO-HEAL IN MEMORY: We ensure the child components know the true Cohort ID
// // //     const resolvedAcademicProfile = useMemo(() => {
// // //         if (!academicProfile) return null;

// // //         // Find the first cohort that has claimed this learner
// // //         const realCohort = store.cohorts.find(c => c.learnerIds?.includes(academicProfile.id));

// // //         if (realCohort && academicProfile.cohortId !== realCohort.id) {
// // //             return { ...academicProfile, cohortId: realCohort.id };
// // //         }

// // //         return academicProfile;
// // //     }, [academicProfile, store.cohorts]);


// // //     useEffect(() => {
// // //         if (!store.user?.email) return;

// // //         const runDeepDiagnostics = async () => {
// // //             console.group("🛑 FIREBASE DEEP DIAGNOSTIC 🛑");
// // //             console.log("1. Authenticated User:", { uid: store.user?.uid, email: store.user?.email });

// // //             try {
// // //                 // Search for the Learner Profile by Email
// // //                 const qEmail = query(collection(db, 'learners'), where('email', '==', store.user!.email));
// // //                 const snapEmail = await getDocs(qEmail);

// // //                 console.log(`2. Found ${snapEmail.size} profile(s) matching this email in 'learners' collection:`);
// // //                 const profileIds: string[] = [];

// // //                 snapEmail.forEach(doc => {
// // //                     profileIds.push(doc.id);
// // //                     console.log(`   -> Profile ID: ${doc.id}`, doc.data());
// // //                 });

// // //                 // Search for their Ledger Records
// // //                 console.log("3. Checking 'enrollments' collection for these profile IDs...");
// // //                 for (const pid of profileIds) {
// // //                     const qEnrol = query(collection(db, 'enrollments'), where('learnerId', '==', pid));
// // //                     const snapEnrol = await getDocs(qEnrol);

// // //                     console.log(`   -> Found ${snapEnrol.size} enrollment(s) for Profile ${pid}:`);
// // //                     snapEnrol.forEach(doc => {
// // //                         console.log(`      -> Enrollment Doc ID: ${doc.id}`, doc.data());
// // //                     });
// // //                 }
// // //             } catch (error) {
// // //                 console.error("Diagnostic failed:", error);
// // //             }
// // //             console.groupEnd();
// // //         };

// // //         runDeepDiagnostics();
// // //     }, [store.user?.email]);


// // //     const getStaffName = (id: string) =>
// // //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // //     const filteredCohorts = useMemo(() => {
// // //         let result = [...myCohorts];

// // //         if (cohortSearch.trim()) {
// // //             const searchLower = cohortSearch.toLowerCase();
// // //             result = result.filter(c =>
// // //                 c.name?.toLowerCase().includes(searchLower) ||
// // //                 getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
// // //             );
// // //         }

// // //         const today = new Date();
// // //         if (cohortFilter === 'active') {
// // //             result = result.filter(c => {
// // //                 const start = new Date(c.startDate);
// // //                 const end = new Date(c.endDate);
// // //                 return start <= today && end >= today;
// // //             });
// // //         } else if (cohortFilter === 'completed') {
// // //             result = result.filter(c => new Date(c.endDate) < today);
// // //         } else if (cohortFilter === 'upcoming') {
// // //             result = result.filter(c => new Date(c.startDate) > today);
// // //         }

// // //         result.sort((a, b) => {
// // //             if (cohortSort === 'name') return a.name?.localeCompare(b.name);
// // //             const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
// // //             const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
// // //             return dateA.getTime() - dateB.getTime();
// // //         });

// // //         return result;
// // //     }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

// // //     const filteredCertificates = useMemo(() => {
// // //         const certs = resolvedAcademicProfile?.certificates || [];
// // //         let result = [...certs];

// // //         if (certSearch.trim()) {
// // //             const searchLower = certSearch.toLowerCase();
// // //             result = result.filter((c: any) =>
// // //                 c.type?.toLowerCase().includes(searchLower) ||
// // //                 c.courseName?.toLowerCase().includes(searchLower)
// // //             );
// // //         }

// // //         if (certFilter !== 'all') {
// // //             result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
// // //         }

// // //         result.sort((a: any, b: any) => {
// // //             if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
// // //             const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
// // //             const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
// // //             return dateA.getTime() - dateB.getTime();
// // //         });

// // //         return result;
// // //     }, [resolvedAcademicProfile?.certificates, certSearch, certFilter, certSort]);

// // //     const pageTitle =
// // //         currentNav === 'dashboard' ? 'My Dashboard' :
// // //             currentNav === 'certificates' ? 'My Certificates' :
// // //                 'My Profile';

// // //     const pageSub =
// // //         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
// // //             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
// // //                 'Manage your personal details and account';

// // //     const clearCohortFilters = () => {
// // //         setCohortSearch('');
// // //         setCohortFilter('all');
// // //         setCohortSort('newest');
// // //     };

// // //     const clearCertFilters = () => {
// // //         setCertSearch('');
// // //         setCertFilter('all');
// // //         setCertSort('newest');
// // //     };

// // //     const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
// // //     const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

// // //     if (isLoading) {
// // //         return (
// // //             <div className="admin-layout learner-layout">
// // //                 <div className="ld-loading">
// // //                     <Hexagon size={40} className="ld-loading__icon" />
// // //                     <span>Loading...</span>
// // //                 </div>
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div className="admin-layout learner-layout">
// // //             <header className="ld-mobile-header">
// // //                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// // //                     <Menu size={20} />
// // //                 </button>
// // //                 <div className="ld-mobile-brand">
// // //                     <span className="ld-mobile-brand__logo">mLab</span>
// // //                     <span className="ld-mobile-brand__sub">Learner Portal</span>
// // //                 </div>
// // //             </header>

// // //             {isMobileMenuOpen && (
// // //                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// // //             )}

// // //             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
// // //                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// // //                     <X size={20} />
// // //                 </button>
// // //                 <Sidebar
// // //                     role={store.user?.role}
// // //                     currentNav={currentNav}
// // //                     setCurrentNav={setCurrentNav as any}
// // //                     onLogout={handleLogout}
// // //                 />
// // //             </div>

// // //             <main className="main-wrapper">
// // //                 <div className="dashboard-header dashboard-header--compact">
// // //                     <div className="header-title">
// // //                         <div className="header-badge">
// // //                             <Shield size={12} />
// // //                             <span>Verified</span>
// // //                         </div>
// // //                         <h1>{pageTitle}</h1>
// // //                         <p>{pageSub}</p>
// // //                     </div>
// // //                 </div>

// // //                 <div className="admin-content">
// // //                     {currentNav === 'dashboard' && (
// // //                         <div className="ld-animate">
// // //                             <div className="ld-stats-bar">
// // //                                 <div className="ld-stat-item">
// // //                                     <div className="ld-stat__icon ld-stat__icon--blue">
// // //                                         <GraduationCap size={18} />
// // //                                     </div>
// // //                                     <div className="ld-stat__info">
// // //                                         <span className="ld-stat__value">{myCohorts.length}</span>
// // //                                         <span className="ld-stat__label">Programmes</span>
// // //                                     </div>
// // //                                 </div>
// // //                                 <div className="ld-stat-divider" />
// // //                                 <div className="ld-stat-item">
// // //                                     <div className="ld-stat__icon ld-stat__icon--green">
// // //                                         <Award size={18} />
// // //                                     </div>
// // //                                     <div className="ld-stat__info">
// // //                                         <span className="ld-stat__value">{resolvedAcademicProfile?.certificates?.length || 0}</span>
// // //                                         <span className="ld-stat__label">Certificates</span>
// // //                                     </div>
// // //                                 </div>
// // //                                 <div className="ld-stat-divider" />
// // //                                 <div className="ld-stat-item">
// // //                                     <div className="ld-stat__icon ld-stat__icon--amber">
// // //                                         <Clock size={18} />
// // //                                     </div>
// // //                                     <div className="ld-stat__info">
// // //                                         <span className="ld-stat__value">On Track</span>
// // //                                         <span className="ld-stat__label">Attendance</span>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             <div className="ld-section-header">
// // //                                 <h2 className="ld-section-title">
// // //                                     <Layers size={16} /> Active Cohorts
// // //                                     <span className="ld-count-badge">{filteredCohorts.length}</span>
// // //                                 </h2>

// // //                                 <div className="ld-search-filter-bar">
// // //                                     <div className="ld-search-box">
// // //                                         <Search size={16} className="ld-search-icon" />
// // //                                         <input
// // //                                             type="text"
// // //                                             placeholder="Search programmes..."
// // //                                             value={cohortSearch}
// // //                                             onChange={(e) => setCohortSearch(e.target.value)}
// // //                                             className="ld-search-input"
// // //                                         />
// // //                                         {cohortSearch && (
// // //                                             <button
// // //                                                 className="ld-clear-btn"
// // //                                                 onClick={() => setCohortSearch('')}
// // //                                             >
// // //                                                 <XCircle size={14} />
// // //                                             </button>
// // //                                         )}
// // //                                     </div>

// // //                                     <button
// // //                                         className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`}
// // //                                         onClick={() => setShowCohortFilters(!showCohortFilters)}
// // //                                     >
// // //                                         <Filter size={16} />
// // //                                         <span>Filter</span>
// // //                                         {hasActiveCohortFilters && <span className="ld-filter-dot" />}
// // //                                         <ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
// // //                                     </button>
// // //                                 </div>
// // //                             </div>

// // //                             {showCohortFilters && (
// // //                                 <div className="ld-filter-panel">
// // //                                     <div className="ld-filter-group">
// // //                                         <label>Status</label>
// // //                                         <div className="ld-filter-chips">
// // //                                             {[
// // //                                                 { key: 'all', label: 'All' },
// // //                                                 { key: 'active', label: 'Active' },
// // //                                                 { key: 'upcoming', label: 'Upcoming' },
// // //                                                 { key: 'completed', label: 'Completed' }
// // //                                             ].map((f) => (
// // //                                                 <button
// // //                                                     key={f.key}
// // //                                                     className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`}
// // //                                                     onClick={() => setCohortFilter(f.key as FilterType)}
// // //                                                 >
// // //                                                     {f.label}
// // //                                                 </button>
// // //                                             ))}
// // //                                         </div>
// // //                                     </div>

// // //                                     <div className="ld-filter-group">
// // //                                         <label>Sort By</label>
// // //                                         <select
// // //                                             value={cohortSort}
// // //                                             onChange={(e) => setCohortSort(e.target.value as SortType)}
// // //                                             className="ld-filter-select"
// // //                                         >
// // //                                             <option value="newest">Newest First</option>
// // //                                             <option value="oldest">Oldest First</option>
// // //                                             <option value="name">Name A-Z</option>
// // //                                         </select>
// // //                                     </div>

// // //                                     {hasActiveCohortFilters && (
// // //                                         <button className="ld-clear-filters" onClick={clearCohortFilters}>
// // //                                             <XCircle size={14} /> Clear All
// // //                                         </button>
// // //                                     )}
// // //                                 </div>
// // //                             )}

// // //                             <div className="ld-cohort-grid">
// // //                                 {filteredCohorts.map((cohort, index) => (
// // //                                     <div
// // //                                         key={cohort.id}
// // //                                         className="ld-cohort-card"
// // //                                         style={{ animationDelay: `${index * 0.08}s` }}
// // //                                     >
// // //                                         <div className="ld-cohort-card__header">
// // //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// // //                                             <span className="ld-badge ld-badge--active">Active</span>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__dates">
// // //                                             <Calendar size={12} />
// // //                                             <span>{cohort.startDate} — {cohort.endDate}</span>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__roles">
// // //                                             <div className="ld-role-row">
// // //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// // //                                                 <span className="ld-role-label">Facilitator</span>
// // //                                                 <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
// // //                                             </div>
// // //                                             <div className="ld-role-row">
// // //                                                 <div className="ld-role-dot ld-role-dot--red" />
// // //                                                 <span className="ld-role-label">Assessor</span>
// // //                                                 <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
// // //                                             </div>
// // //                                             {cohort.moderatorId && (
// // //                                                 <div className="ld-role-row">
// // //                                                     <div className="ld-role-dot ld-role-dot--green" />
// // //                                                     <span className="ld-role-label">Moderator</span>
// // //                                                     <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
// // //                                                 </div>
// // //                                             )}
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__footer">
// // //                                             <button
// // //                                                 className="ld-btn ld-btn--primary"
// // //                                                 onClick={() => navigate(`/portfolio/${resolvedAcademicProfile?.id}`, { state: { cohortId: cohort.id } })}
// // //                                             >
// // //                                                 <span>Portfolio</span>
// // //                                                 <ArrowRight size={14} />
// // //                                             </button>
// // //                                         </div>
// // //                                     </div>
// // //                                 ))}

// // //                                 {filteredCohorts.length === 0 && (
// // //                                     <div className="ld-empty">
// // //                                         <div className="ld-empty__icon">
// // //                                             <Search size={32} strokeWidth={1.5} />
// // //                                         </div>
// // //                                         <span className="ld-empty__title">No Results Found</span>
// // //                                         <p className="ld-empty__desc">
// // //                                             {cohortSearch
// // //                                                 ? `No programmes match "${cohortSearch}"`
// // //                                                 : "No programmes match the selected filters."}
// // //                                         </p>
// // //                                         {hasActiveCohortFilters && (
// // //                                             <button
// // //                                                 className="ld-btn ld-btn--ghost ld-btn--sm"
// // //                                                 onClick={clearCohortFilters}
// // //                                             >
// // //                                                 <XCircle size={14} />
// // //                                                 Clear Filters
// // //                                             </button>
// // //                                         )}
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {currentNav === 'profile' && (
// // //                         <LearnerProfileView
// // //                             profile={resolvedAcademicProfile}
// // //                             user={store.user}
// // //                             onUpdate={store.updateLearner}
// // //                         />
// // //                     )}

// // //                     {currentNav === 'certificates' && (
// // //                         <div className="ld-animate">
// // //                             <div className="ld-section-header">
// // //                                 <h2 className="ld-section-title">
// // //                                     <Award size={16} /> Issued Certificates
// // //                                     <span className="ld-count-badge">{filteredCertificates.length}</span>
// // //                                 </h2>

// // //                                 <div className="ld-search-filter-bar">
// // //                                     <div className="ld-search-box">
// // //                                         <Search size={16} className="ld-search-icon" />
// // //                                         <input
// // //                                             type="text"
// // //                                             placeholder="Search certificates..."
// // //                                             value={certSearch}
// // //                                             onChange={(e) => setCertSearch(e.target.value)}
// // //                                             className="ld-search-input"
// // //                                         />
// // //                                         {certSearch && (
// // //                                             <button
// // //                                                 className="ld-clear-btn"
// // //                                                 onClick={() => setCertSearch('')}
// // //                                             >
// // //                                                 <XCircle size={14} />
// // //                                             </button>
// // //                                         )}
// // //                                     </div>

// // //                                     <button
// // //                                         className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`}
// // //                                         onClick={() => setShowCertFilters(!showCertFilters)}
// // //                                     >
// // //                                         <Filter size={16} />
// // //                                         <span>Filter</span>
// // //                                         {hasActiveCertFilters && <span className="ld-filter-dot" />}
// // //                                         <ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
// // //                                     </button>
// // //                                 </div>
// // //                             </div>

// // //                             {showCertFilters && (
// // //                                 <div className="ld-filter-panel">
// // //                                     <div className="ld-filter-group">
// // //                                         <label>Type</label>
// // //                                         <div className="ld-filter-chips">
// // //                                             {[
// // //                                                 { key: 'all', label: 'All Types' },
// // //                                                 { key: 'certificate', label: 'Certificate' },
// // //                                                 { key: 'statement', label: 'Statement' }
// // //                                             ].map((f) => (
// // //                                                 <button
// // //                                                     key={f.key}
// // //                                                     className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`}
// // //                                                     onClick={() => setCertFilter(f.key as any)}
// // //                                                 >
// // //                                                     {f.label}
// // //                                                 </button>
// // //                                             ))}
// // //                                         </div>
// // //                                     </div>

// // //                                     <div className="ld-filter-group">
// // //                                         <label>Sort By</label>
// // //                                         <select
// // //                                             value={certSort}
// // //                                             onChange={(e) => setCertSort(e.target.value as SortType)}
// // //                                             className="ld-filter-select"
// // //                                         >
// // //                                             <option value="newest">Newest First</option>
// // //                                             <option value="oldest">Oldest First</option>
// // //                                             <option value="name">Name A-Z</option>
// // //                                         </select>
// // //                                     </div>

// // //                                     {hasActiveCertFilters && (
// // //                                         <button className="ld-clear-filters" onClick={clearCertFilters}>
// // //                                             <XCircle size={14} /> Clear All
// // //                                         </button>
// // //                                     )}
// // //                                 </div>
// // //                             )}

// // //                             {filteredCertificates.length === 0 ? (
// // //                                 <div className="ld-empty ld-empty--large">
// // //                                     <div className="ld-empty__icon">
// // //                                         {certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}
// // //                                     </div>
// // //                                     <span className="ld-empty__title">
// // //                                         {certSearch ? 'No Results Found' : 'No Certificates Yet'}
// // //                                     </span>
// // //                                     <p className="ld-empty__desc">
// // //                                         {certSearch
// // //                                             ? `No certificates match "${certSearch}"`
// // //                                             : 'Certificates appear here after programme completion.'}
// // //                                     </p>
// // //                                     {hasActiveCertFilters && certSearch && (
// // //                                         <button
// // //                                             className="ld-btn ld-btn--ghost ld-btn--sm"
// // //                                             onClick={clearCertFilters}
// // //                                         >
// // //                                             <XCircle size={14} />
// // //                                             Clear Filters
// // //                                         </button>
// // //                                     )}
// // //                                 </div>
// // //                             ) : (
// // //                                 <div className="ld-cohort-grid">
// // //                                     {filteredCertificates.map((cert: any, index: number) => (
// // //                                         <div
// // //                                             key={cert.id}
// // //                                             className="ld-cohort-card ld-cert-card"
// // //                                             style={{ animationDelay: `${index * 0.08}s` }}
// // //                                         >
// // //                                             <div className="ld-cohort-card__header">
// // //                                                 <div className="ld-cert-card__icon-wrap">
// // //                                                     <Award size={18} />
// // //                                                 </div>
// // //                                                 <div className="ld-cert-card__title-group">
// // //                                                     <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
// // //                                                 </div>
// // //                                                 <span className="ld-badge ld-badge--issued">Issued</span>
// // //                                             </div>

// // //                                             <div className="ld-cohort-card__roles">
// // //                                                 <div className="ld-role-row">
// // //                                                     <BookOpen size={12} />
// // //                                                     <span className="ld-role-label">Programme</span>
// // //                                                     <span className="ld-role-name">{cert.courseName}</span>
// // //                                                 </div>
// // //                                                 <div className="ld-role-row">
// // //                                                     <Calendar size={12} />
// // //                                                     <span className="ld-role-label">Issued</span>
// // //                                                     <span className="ld-role-name">
// // //                                                         {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
// // //                                                             day: 'numeric', month: 'short', year: 'numeric'
// // //                                                         })}
// // //                                                     </span>
// // //                                                 </div>
// // //                                                 <div className="ld-role-row">
// // //                                                     <CheckCircle size={12} />
// // //                                                     <span className="ld-role-label">Status</span>
// // //                                                     <span className="ld-role-name ld-role-name--success">Valid</span>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div className="ld-cohort-card__footer">
// // //                                                 <button
// // //                                                     className="ld-btn ld-btn--download"
// // //                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
// // //                                                 >
// // //                                                     <Download size={14} />
// // //                                                     <span>Download PDF</span>
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>
// // //                                     ))}
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             </main>
// // //         </div>
// // //     );
// // // };

// // // export default LearnerDashboard;


// // // // // src/pages/LearnerPortal/LearnerDashboard.tsx

// // // // import React, { useEffect, useState, useMemo } from 'react';
// // // // import { useNavigate, useLocation } from 'react-router-dom';
// // // // import { signOut } from 'firebase/auth';
// // // // import {
// // // //     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
// // // //     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
// // // //     Hexagon, Mail, Search, Filter, ChevronDown, XCircle
// // // // } from 'lucide-react';
// // // // import { doc, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
// // // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { auth, db } from '../../../lib/firebase';
// // // // import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// // // // import './LearnerDashboard.css';

// // // // type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
// // // // type SortType = 'newest' | 'oldest' | 'name';

// // // // const LearnerDashboard: React.FC = () => {
// // // //     const navigate = useNavigate();
// // // //     const location = useLocation();
// // // //     const store = useStore();

// // // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
// // // //         (location.state as any)?.activeTab || 'dashboard'
// // // //     );
// // // //     const [academicProfile, setAcademicProfile] = useState<any>(null);
// // // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// // // //     const [isLoading, setIsLoading] = useState(true);

// // // //     // Search and Filter States
// // // //     const [cohortSearch, setCohortSearch] = useState('');
// // // //     const [cohortFilter, setCohortFilter] = useState<FilterType>('all');
// // // //     const [cohortSort, setCohortSort] = useState<SortType>('newest');
// // // //     const [showCohortFilters, setShowCohortFilters] = useState(false);

// // // //     const [certSearch, setCertSearch] = useState('');
// // // //     const [certFilter, setCertFilter] = useState<'all' | 'certificate' | 'statement'>('all');
// // // //     const [certSort, setCertSort] = useState<SortType>('newest');
// // // //     const [showCertFilters, setShowCertFilters] = useState(false);

// // // //     useEffect(() => {
// // // //         setIsMobileMenuOpen(false);
// // // //     }, [currentNav]);

// // // //     useEffect(() => {
// // // //         store.fetchCohorts();
// // // //         store.fetchStaff();

// // // //         if (!store.user?.uid) return;

// // // //         const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));

// // // //         const unsubscribe = onSnapshot(q, async (snapshot) => {
// // // //             if (!snapshot.empty) {
// // // //                 const lDoc = snapshot.docs[0];
// // // //                 const lData = lDoc.data();

// // // //                 try {
// // // //                     // Fetch matching enrollments to get all possible IDs mapped to this human
// // // //                     const enrolQ = query(collection(db, 'enrollments'), where('learnerId', '==', lDoc.id));
// // // //                     const enrolSnap = await getDocs(enrolQ);

// // // //                     const enrolIds = enrolSnap.docs.map(d => d.id);
// // // //                     const enrolCohortIds = enrolSnap.docs.map(d => d.data().cohortId).filter(id => id && id !== 'Unassigned');

// // // //                     setAcademicProfile({
// // // //                         id: lDoc.id,
// // // //                         ...lData,
// // // //                         associatedEnrollmentIds: enrolIds,
// // // //                         associatedCohortIds: enrolCohortIds
// // // //                     });
// // // //                 } catch (error) {
// // // //                     console.error("Failed to fetch enrollments for cross-referencing:", error);
// // // //                     setAcademicProfile({ id: lDoc.id, ...lData });
// // // //                 }
// // // //             }
// // // //             setIsLoading(false);
// // // //         }, err => {
// // // //             console.error('Error listening to learner profile:', err);
// // // //             setIsLoading(false);
// // // //         });

// // // //         return () => unsubscribe();
// // // //     }, [store.user?.uid]);

// // // //     const handleLogout = async () => {
// // // //         try {
// // // //             await signOut(auth);
// // // //             navigate('/login');
// // // //         }
// // // //         catch (error) {
// // // //             console.error('Logout failed', error);
// // // //         }
// // // //     };

// // // //     const myLearnerProfile = academicProfile || store.learners.find(l =>
// // // //         l.authUid === store.user?.uid || l.email === store.user?.email
// // // //     );

// // // //     const myCohorts = store.cohorts.filter(c => {
// // // //         if (!myLearnerProfile) return false;
// // // //         if (c.id === myLearnerProfile.cohortId) return true;
// // // //         if (myLearnerProfile.associatedCohortIds?.includes(c.id)) return true;
// // // //         if (c.learnerIds?.includes(myLearnerProfile.id)) return true;
// // // //         if (myLearnerProfile.associatedEnrollmentIds?.some((eid: string) => c.learnerIds?.includes(eid))) return true;
// // // //         return false;
// // // //     });

// // // //     const getStaffName = (id: string) =>
// // // //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // // //     const filteredCohorts = useMemo(() => {
// // // //         let result = [...myCohorts];

// // // //         if (cohortSearch.trim()) {
// // // //             const searchLower = cohortSearch.toLowerCase();
// // // //             result = result.filter(c =>
// // // //                 c.name?.toLowerCase().includes(searchLower) ||
// // // //                 getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
// // // //             );
// // // //         }

// // // //         const today = new Date();
// // // //         if (cohortFilter === 'active') {
// // // //             result = result.filter(c => {
// // // //                 const start = new Date(c.startDate);
// // // //                 const end = new Date(c.endDate);
// // // //                 return start <= today && end >= today;
// // // //             });
// // // //         } else if (cohortFilter === 'completed') {
// // // //             result = result.filter(c => new Date(c.endDate) < today);
// // // //         } else if (cohortFilter === 'upcoming') {
// // // //             result = result.filter(c => new Date(c.startDate) > today);
// // // //         }

// // // //         result.sort((a, b) => {
// // // //             if (cohortSort === 'name') return a.name?.localeCompare(b.name);
// // // //             const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
// // // //             const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
// // // //             return dateA.getTime() - dateB.getTime();
// // // //         });

// // // //         return result;
// // // //     }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]);

// // // //     const filteredCertificates = useMemo(() => {
// // // //         const certs = myLearnerProfile?.certificates || [];
// // // //         let result = [...certs];

// // // //         if (certSearch.trim()) {
// // // //             const searchLower = certSearch.toLowerCase();
// // // //             result = result.filter((c: any) =>
// // // //                 c.type?.toLowerCase().includes(searchLower) ||
// // // //                 c.courseName?.toLowerCase().includes(searchLower)
// // // //             );
// // // //         }

// // // //         if (certFilter !== 'all') {
// // // //             result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
// // // //         }

// // // //         result.sort((a: any, b: any) => {
// // // //             if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
// // // //             const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
// // // //             const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
// // // //             return dateA.getTime() - dateB.getTime();
// // // //         });

// // // //         return result;
// // // //     }, [myLearnerProfile?.certificates, certSearch, certFilter, certSort]);

// // // //     const pageTitle =
// // // //         currentNav === 'dashboard' ? 'My Dashboard' :
// // // //             currentNav === 'certificates' ? 'My Certificates' :
// // // //                 'My Profile';

// // // //     const pageSub =
// // // //         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
// // // //             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
// // // //                 'Manage your personal details and account';

// // // //     const clearCohortFilters = () => {
// // // //         setCohortSearch('');
// // // //         setCohortFilter('all');
// // // //         setCohortSort('newest');
// // // //     };

// // // //     const clearCertFilters = () => {
// // // //         setCertSearch('');
// // // //         setCertFilter('all');
// // // //         setCertSort('newest');
// // // //     };

// // // //     const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
// // // //     const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

// // // //     if (isLoading) {
// // // //         return (
// // // //             <div className="admin-layout learner-layout">
// // // //                 <div className="ld-loading">
// // // //                     <Hexagon size={40} className="ld-loading__icon" />
// // // //                     <span>Loading...</span>
// // // //                 </div>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div className="admin-layout learner-layout">
// // // //             <header className="ld-mobile-header">
// // // //                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// // // //                     <Menu size={20} />
// // // //                 </button>
// // // //                 <div className="ld-mobile-brand">
// // // //                     <span className="ld-mobile-brand__logo">mLab</span>
// // // //                     <span className="ld-mobile-brand__sub">Learner Portal</span>
// // // //                 </div>
// // // //             </header>

// // // //             {isMobileMenuOpen && (
// // // //                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// // // //             )}

// // // //             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
// // // //                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// // // //                     <X size={20} />
// // // //                 </button>
// // // //                 <Sidebar
// // // //                     role={store.user?.role}
// // // //                     currentNav={currentNav}
// // // //                     setCurrentNav={setCurrentNav as any}
// // // //                     onLogout={handleLogout}
// // // //                 />
// // // //             </div>

// // // //             <main className="main-wrapper">
// // // //                 <div className="dashboard-header dashboard-header--compact">
// // // //                     <div className="header-title">
// // // //                         <div className="header-badge">
// // // //                             <Shield size={12} />
// // // //                             <span>Verified</span>
// // // //                         </div>
// // // //                         <h1>{pageTitle}</h1>
// // // //                         <p>{pageSub}</p>
// // // //                     </div>
// // // //                 </div>

// // // //                 <div className="admin-content">
// // // //                     {currentNav === 'dashboard' && (
// // // //                         <div className="ld-animate">
// // // //                             <div className="ld-stats-bar">
// // // //                                 <div className="ld-stat-item">
// // // //                                     <div className="ld-stat__icon ld-stat__icon--blue">
// // // //                                         <GraduationCap size={18} />
// // // //                                     </div>
// // // //                                     <div className="ld-stat__info">
// // // //                                         <span className="ld-stat__value">{myCohorts.length}</span>
// // // //                                         <span className="ld-stat__label">Programmes</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="ld-stat-divider" />
// // // //                                 <div className="ld-stat-item">
// // // //                                     <div className="ld-stat__icon ld-stat__icon--green">
// // // //                                         <Award size={18} />
// // // //                                     </div>
// // // //                                     <div className="ld-stat__info">
// // // //                                         <span className="ld-stat__value">{myLearnerProfile?.certificates?.length || 0}</span>
// // // //                                         <span className="ld-stat__label">Certificates</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="ld-stat-divider" />
// // // //                                 <div className="ld-stat-item">
// // // //                                     <div className="ld-stat__icon ld-stat__icon--amber">
// // // //                                         <Clock size={18} />
// // // //                                     </div>
// // // //                                     <div className="ld-stat__info">
// // // //                                         <span className="ld-stat__value">On Track</span>
// // // //                                         <span className="ld-stat__label">Attendance</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             <div className="ld-section-header">
// // // //                                 <h2 className="ld-section-title">
// // // //                                     <Layers size={16} /> Active Cohorts
// // // //                                     <span className="ld-count-badge">{filteredCohorts.length}</span>
// // // //                                 </h2>

// // // //                                 <div className="ld-search-filter-bar">
// // // //                                     <div className="ld-search-box">
// // // //                                         <Search size={16} className="ld-search-icon" />
// // // //                                         <input
// // // //                                             type="text"
// // // //                                             placeholder="Search programmes..."
// // // //                                             value={cohortSearch}
// // // //                                             onChange={(e) => setCohortSearch(e.target.value)}
// // // //                                             className="ld-search-input"
// // // //                                         />
// // // //                                         {cohortSearch && (
// // // //                                             <button
// // // //                                                 className="ld-clear-btn"
// // // //                                                 onClick={() => setCohortSearch('')}
// // // //                                             >
// // // //                                                 <XCircle size={14} />
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>

// // // //                                     <button
// // // //                                         className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`}
// // // //                                         onClick={() => setShowCohortFilters(!showCohortFilters)}
// // // //                                     >
// // // //                                         <Filter size={16} />
// // // //                                         <span>Filter</span>
// // // //                                         {hasActiveCohortFilters && <span className="ld-filter-dot" />}
// // // //                                         <ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {showCohortFilters && (
// // // //                                 <div className="ld-filter-panel">
// // // //                                     <div className="ld-filter-group">
// // // //                                         <label>Status</label>
// // // //                                         <div className="ld-filter-chips">
// // // //                                             {[
// // // //                                                 { key: 'all', label: 'All' },
// // // //                                                 { key: 'active', label: 'Active' },
// // // //                                                 { key: 'upcoming', label: 'Upcoming' },
// // // //                                                 { key: 'completed', label: 'Completed' }
// // // //                                             ].map((f) => (
// // // //                                                 <button
// // // //                                                     key={f.key}
// // // //                                                     className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`}
// // // //                                                     onClick={() => setCohortFilter(f.key as FilterType)}
// // // //                                                 >
// // // //                                                     {f.label}
// // // //                                                 </button>
// // // //                                             ))}
// // // //                                         </div>
// // // //                                     </div>

// // // //                                     <div className="ld-filter-group">
// // // //                                         <label>Sort By</label>
// // // //                                         <select
// // // //                                             value={cohortSort}
// // // //                                             onChange={(e) => setCohortSort(e.target.value as SortType)}
// // // //                                             className="ld-filter-select"
// // // //                                         >
// // // //                                             <option value="newest">Newest First</option>
// // // //                                             <option value="oldest">Oldest First</option>
// // // //                                             <option value="name">Name A-Z</option>
// // // //                                         </select>
// // // //                                     </div>

// // // //                                     {hasActiveCohortFilters && (
// // // //                                         <button className="ld-clear-filters" onClick={clearCohortFilters}>
// // // //                                             <XCircle size={14} /> Clear All
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>
// // // //                             )}

// // // //                             <div className="ld-cohort-grid">
// // // //                                 {filteredCohorts.map((cohort, index) => (
// // // //                                     <div
// // // //                                         key={cohort.id}
// // // //                                         className="ld-cohort-card"
// // // //                                         style={{ animationDelay: `${index * 0.08}s` }}
// // // //                                     >
// // // //                                         <div className="ld-cohort-card__header">
// // // //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// // // //                                             <span className="ld-badge ld-badge--active">Active</span>
// // // //                                         </div>

// // // //                                         <div className="ld-cohort-card__dates">
// // // //                                             <Calendar size={12} />
// // // //                                             <span>{cohort.startDate} — {cohort.endDate}</span>
// // // //                                         </div>

// // // //                                         <div className="ld-cohort-card__roles">
// // // //                                             <div className="ld-role-row">
// // // //                                                 <div className="ld-role-dot ld-role-dot--blue" />
// // // //                                                 <span className="ld-role-label">Facilitator</span>
// // // //                                                 <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
// // // //                                             </div>
// // // //                                             <div className="ld-role-row">
// // // //                                                 <div className="ld-role-dot ld-role-dot--red" />
// // // //                                                 <span className="ld-role-label">Assessor</span>
// // // //                                                 <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
// // // //                                             </div>
// // // //                                             {cohort.moderatorId && (
// // // //                                                 <div className="ld-role-row">
// // // //                                                     <div className="ld-role-dot ld-role-dot--green" />
// // // //                                                     <span className="ld-role-label">Moderator</span>
// // // //                                                     <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </div>

// // // //                                         <div className="ld-cohort-card__footer">
// // // //                                             {/* THE FIX: Passing the cohortId state to the router so ViewPortfolio knows which class to load! */}
// // // //                                             <button
// // // //                                                 className="ld-btn ld-btn--primary"
// // // //                                                 onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`, { state: { cohortId: cohort.id } })}
// // // //                                             >
// // // //                                                 <span>Portfolio</span>
// // // //                                                 <ArrowRight size={14} />
// // // //                                             </button>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 ))}

// // // //                                 {filteredCohorts.length === 0 && (
// // // //                                     <div className="ld-empty">
// // // //                                         <div className="ld-empty__icon">
// // // //                                             <Search size={32} strokeWidth={1.5} />
// // // //                                         </div>
// // // //                                         <span className="ld-empty__title">No Results Found</span>
// // // //                                         <p className="ld-empty__desc">
// // // //                                             {cohortSearch
// // // //                                                 ? `No programmes match "${cohortSearch}"`
// // // //                                                 : "No programmes match the selected filters."}
// // // //                                         </p>
// // // //                                         {hasActiveCohortFilters && (
// // // //                                             <button
// // // //                                                 className="ld-btn ld-btn--ghost ld-btn--sm"
// // // //                                                 onClick={clearCohortFilters}
// // // //                                             >
// // // //                                                 <XCircle size={14} />
// // // //                                                 Clear Filters
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         </div>
// // // //                     )}

// // // //                     {currentNav === 'profile' && (
// // // //                         <LearnerProfileView
// // // //                             profile={myLearnerProfile}
// // // //                             user={store.user}
// // // //                             onUpdate={store.updateLearner}
// // // //                         />
// // // //                     )}

// // // //                     {currentNav === 'certificates' && (
// // // //                         <div className="ld-animate">
// // // //                             <div className="ld-section-header">
// // // //                                 <h2 className="ld-section-title">
// // // //                                     <Award size={16} /> Issued Certificates
// // // //                                     <span className="ld-count-badge">{filteredCertificates.length}</span>
// // // //                                 </h2>

// // // //                                 <div className="ld-search-filter-bar">
// // // //                                     <div className="ld-search-box">
// // // //                                         <Search size={16} className="ld-search-icon" />
// // // //                                         <input
// // // //                                             type="text"
// // // //                                             placeholder="Search certificates..."
// // // //                                             value={certSearch}
// // // //                                             onChange={(e) => setCertSearch(e.target.value)}
// // // //                                             className="ld-search-input"
// // // //                                         />
// // // //                                         {certSearch && (
// // // //                                             <button
// // // //                                                 className="ld-clear-btn"
// // // //                                                 onClick={() => setCertSearch('')}
// // // //                                             >
// // // //                                                 <XCircle size={14} />
// // // //                                             </button>
// // // //                                         )}
// // // //                                     </div>

// // // //                                     <button
// // // //                                         className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`}
// // // //                                         onClick={() => setShowCertFilters(!showCertFilters)}
// // // //                                     >
// // // //                                         <Filter size={16} />
// // // //                                         <span>Filter</span>
// // // //                                         {hasActiveCertFilters && <span className="ld-filter-dot" />}
// // // //                                         <ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
// // // //                                     </button>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {showCertFilters && (
// // // //                                 <div className="ld-filter-panel">
// // // //                                     <div className="ld-filter-group">
// // // //                                         <label>Type</label>
// // // //                                         <div className="ld-filter-chips">
// // // //                                             {[
// // // //                                                 { key: 'all', label: 'All Types' },
// // // //                                                 { key: 'certificate', label: 'Certificate' },
// // // //                                                 { key: 'statement', label: 'Statement' }
// // // //                                             ].map((f) => (
// // // //                                                 <button
// // // //                                                     key={f.key}
// // // //                                                     className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`}
// // // //                                                     onClick={() => setCertFilter(f.key as any)}
// // // //                                                 >
// // // //                                                     {f.label}
// // // //                                                 </button>
// // // //                                             ))}
// // // //                                         </div>
// // // //                                     </div>

// // // //                                     <div className="ld-filter-group">
// // // //                                         <label>Sort By</label>
// // // //                                         <select
// // // //                                             value={certSort}
// // // //                                             onChange={(e) => setCertSort(e.target.value as SortType)}
// // // //                                             className="ld-filter-select"
// // // //                                         >
// // // //                                             <option value="newest">Newest First</option>
// // // //                                             <option value="oldest">Oldest First</option>
// // // //                                             <option value="name">Name A-Z</option>
// // // //                                         </select>
// // // //                                     </div>

// // // //                                     {hasActiveCertFilters && (
// // // //                                         <button className="ld-clear-filters" onClick={clearCertFilters}>
// // // //                                             <XCircle size={14} /> Clear All
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>
// // // //                             )}

// // // //                             {filteredCertificates.length === 0 ? (
// // // //                                 <div className="ld-empty ld-empty--large">
// // // //                                     <div className="ld-empty__icon">
// // // //                                         {certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}
// // // //                                     </div>
// // // //                                     <span className="ld-empty__title">
// // // //                                         {certSearch ? 'No Results Found' : 'No Certificates Yet'}
// // // //                                     </span>
// // // //                                     <p className="ld-empty__desc">
// // // //                                         {certSearch
// // // //                                             ? `No certificates match "${certSearch}"`
// // // //                                             : 'Certificates appear here after programme completion.'}
// // // //                                     </p>
// // // //                                     {hasActiveCertFilters && certSearch && (
// // // //                                         <button
// // // //                                             className="ld-btn ld-btn--ghost ld-btn--sm"
// // // //                                             onClick={clearCertFilters}
// // // //                                         >
// // // //                                             <XCircle size={14} />
// // // //                                             Clear Filters
// // // //                                         </button>
// // // //                                     )}
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <div className="ld-cohort-grid">
// // // //                                     {filteredCertificates.map((cert: any, index: number) => (
// // // //                                         <div
// // // //                                             key={cert.id}
// // // //                                             className="ld-cohort-card ld-cert-card"
// // // //                                             style={{ animationDelay: `${index * 0.08}s` }}
// // // //                                         >
// // // //                                             <div className="ld-cohort-card__header">
// // // //                                                 <div className="ld-cert-card__icon-wrap">
// // // //                                                     <Award size={18} />
// // // //                                                 </div>
// // // //                                                 <div className="ld-cert-card__title-group">
// // // //                                                     <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
// // // //                                                 </div>
// // // //                                                 <span className="ld-badge ld-badge--issued">Issued</span>
// // // //                                             </div>

// // // //                                             <div className="ld-cohort-card__roles">
// // // //                                                 <div className="ld-role-row">
// // // //                                                     <BookOpen size={12} />
// // // //                                                     <span className="ld-role-label">Programme</span>
// // // //                                                     <span className="ld-role-name">{cert.courseName}</span>
// // // //                                                 </div>
// // // //                                                 <div className="ld-role-row">
// // // //                                                     <Calendar size={12} />
// // // //                                                     <span className="ld-role-label">Issued</span>
// // // //                                                     <span className="ld-role-name">
// // // //                                                         {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
// // // //                                                             day: 'numeric', month: 'short', year: 'numeric'
// // // //                                                         })}
// // // //                                                     </span>
// // // //                                                 </div>
// // // //                                                 <div className="ld-role-row">
// // // //                                                     <CheckCircle size={12} />
// // // //                                                     <span className="ld-role-label">Status</span>
// // // //                                                     <span className="ld-role-name ld-role-name--success">Valid</span>
// // // //                                                 </div>
// // // //                                             </div>

// // // //                                             <div className="ld-cohort-card__footer">
// // // //                                                 <button
// // // //                                                     className="ld-btn ld-btn--download"
// // // //                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
// // // //                                                 >
// // // //                                                     <Download size={14} />
// // // //                                                     <span>Download PDF</span>
// // // //                                                 </button>
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     ))}
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}
// // // //                 </div>
// // // //             </main>
// // // //         </div>
// // // //     );
// // // // };

// // // // export default LearnerDashboard;