// src/pages/LearnerPortal/LearnerDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X, Award, Download,
    GraduationCap, Clock, BookOpen, CheckCircle, Shield,
    Hexagon, Search, Filter, ChevronDown, ChevronUp, Zap,
    AlertCircle, Loader2, History, PlayCircle, XCircle,
    TrendingUp, AlertTriangle, Globe, MapPin
} from 'lucide-react';
import { collection, query, where, getDocs, onSnapshot, getDoc, doc, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import { useToast } from '../../../components/common/Toast/Toast';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';
import { createPortal } from 'react-dom';
import moment from 'moment';
import './LearnerDashboard.css';
import { LearnerAttendanceView } from '../LearnerAttendanceView/LearnerAttendanceView';
import { LearnerWorkplaceLogModal } from '../../../components/views/LearnerWorkplaceLogModal/LearnerWorkplaceLogModal';

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
type SortType = 'newest' | 'oldest' | 'name';
const getSafeTime = (ts: any) => ts?.toDate ? ts.toDate() : new Date(ts);

interface InboxProps {
    profileId: string;
    logs: any[];
    absenceDates: string[];
}

const LearnerActionInbox: React.FC<InboxProps> = ({ profileId, logs, absenceDates }) => {
    const [viewMode, setViewMode] = useState<'pending' | 'history'>('pending');
    const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [logToConfirm, setLogToConfirm] = useState<any | null>(null);
    const [now, setNow] = useState(new Date());
    const toast = useToast();

    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    const pendingLogs = useMemo(() => {
        return logs.filter(log => !log.acknowledgedBy?.includes(profileId))
            .sort((a, b) => new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime());
    }, [logs, profileId]);

    const historyLogs = useMemo(() => {
        return logs.filter(log => log.acknowledgedBy?.includes(profileId))
            .sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime());
    }, [logs, profileId]);

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
            toast.success("Topic Acknowledged! Keep up the momentum.");
            setLogToConfirm(null);
        } catch (error) {
            console.error("Ack Error:", error);
            toast.error("Failed to acknowledge. Please try again.");
            setLogToConfirm(null);
        } finally {
            setAcknowledgingId(null);
        }
    };

    const formatTimeLeft = (deadlineIso: string) => {
        const total = new Date(deadlineIso).getTime() - now.getTime();
        if (total <= 0) return "Overdue";
        const h = Math.floor(total / (1000 * 60 * 60));
        const m = Math.floor((total / 1000 / 60) % 60);
        if (h > 24) return `${Math.floor(h / 24)} days left`;
        return `${h}h ${m}m left`;
    };

    return (
        <>
            {logToConfirm && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type={absenceDates.includes(logToConfirm.coveredAt) ? "warning" : "info"}
                        title={absenceDates.includes(logToConfirm.coveredAt) ? "Catch-up Confirmation" : "Confirm Delivery"}
                        message={
                            absenceDates.includes(logToConfirm.coveredAt)
                                ? `You were absent on ${new Date(logToConfirm.coveredAt).toLocaleDateString('en-ZA')}. By clicking confirm, you officially declare that you have reviewed the materials for "${logToConfirm.topicTitle}" and are now up to date.`
                                : `By clicking confirm, you officially acknowledge that your facilitator delivered the training for "${logToConfirm.topicTitle}" on ${new Date(logToConfirm.coveredAt).toLocaleDateString('en-ZA')}.`
                        }
                        onCancel={() => setLogToConfirm(null)}
                        onClose={executeAcknowledge}
                        confirmText={acknowledgingId === logToConfirm.id ? "Confirming..." : "Yes, I Confirm"}
                    />
                </div>,
                document.body
            )}
            <div style={{ borderRadius: '12px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', marginBottom: '1.5rem', background: 'white', border: '1px solid var(--mlab-border)' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--mlab-border)', background: '#f8fafc' }}>
                    <button onClick={() => setViewMode('pending')} style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: `3px solid ${viewMode === 'pending' ? '#f59e0b' : 'transparent'}`, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, color: viewMode === 'pending' ? '#d97706' : 'var(--mlab-grey)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                        <Zap size={16} /> Pending Actions <span style={{ background: viewMode === 'pending' ? '#f59e0b' : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{pendingLogs.length}</span>
                    </button>
                    <button onClick={() => setViewMode('history')} style={{ flex: 1, padding: '1rem', background: 'transparent', border: 'none', borderBottom: `3px solid ${viewMode === 'history' ? GREEN : 'transparent'}`, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontWeight: 700, color: viewMode === 'history' ? '#166534' : 'var(--mlab-grey)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s' }}>
                        <History size={16} /> History <span style={{ background: viewMode === 'history' ? GREEN : '#cbd5e1', color: 'white', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem' }}>{historyLogs.length}</span>
                    </button>
                </div>
                <div style={{ padding: '1.5rem', background: viewMode === 'pending' ? '#fffbeb' : '#f0fdf4' }}>
                    {viewMode === 'pending' && pendingLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <CheckCircle size={48} color={GREEN} style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>Inbox Zero!</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>You are all caught up. No pending curriculum topics to acknowledge.</p>
                        </div>
                    )}
                    {viewMode === 'history' && historyLogs.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                            <History size={48} color="var(--mlab-grey-light)" style={{ margin: '0 auto 1rem' }} />
                            <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase', margin: '0 0 0.5rem 0' }}>No History Yet</h3>
                            <p style={{ color: 'var(--mlab-grey)', margin: 0 }}>Topics you acknowledge will appear here as a permanent record.</p>
                        </div>
                    )}
                    {((viewMode === 'pending' && pendingLogs.length > 0) || (viewMode === 'history' && historyLogs.length > 0)) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {viewMode === 'pending' && (
                                <p style={{ color: '#b45309', fontSize: '0.85rem', margin: '0 0 0.5rem 0', display: 'flex', alignItems: 'center', gap: '8px', background: '#fef3c7', padding: '10px 12px', borderRadius: '6px', border: '1px solid #fde68a' }}>
                                    <AlertCircle size={16} /> You have pending curriculum topics to review. Acknowledge them below to stay compliant.
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
                                                            const timeDiff = new Date(log.deadlineAt).getTime() - now.getTime();
                                                            const isExpired = viewMode === 'pending' && timeDiff <= 0;
                                                            const isUrgent = viewMode === 'pending' && !isExpired && timeDiff < (12 * 60 * 60 * 1000);
                                                            const isMissed = absenceDates.includes(log.coveredAt);
                                                            let rowBg = 'white';
                                                            if (viewMode === 'pending') {
                                                                if (isExpired) rowBg = '#fee2e2';
                                                                else if (isMissed) rowBg = '#fff1f2';
                                                                else if (isUrgent) rowBg = '#fef3c7';
                                                            }
                                                            return (
                                                                <tr key={log.id} style={{ background: rowBg, borderBottom: '1px solid var(--mlab-border)' }}>
                                                                    <td style={{ padding: '16px' }}>
                                                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                                                {isMissed && viewMode === 'pending' && <span style={{ background: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>Missed Day</span>}
                                                                                <span style={{ fontWeight: 600, color: MIDNIGHT, fontSize: '0.85rem' }}>
                                                                                    {log.topicCode ? `${log.topicCode}: ` : ''}{log.topicTitle}
                                                                                </span>
                                                                            </div>
                                                                            <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '4px' }}>
                                                                                Delivered: {log.coveredAt ? new Date(log.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                                                            </span>
                                                                            {isMissed && viewMode === 'pending' && (
                                                                                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.6)', borderRadius: '6px', border: '1px dashed #fda4af' }}>
                                                                                    <h5 style={{ margin: '0 0 8px 0', fontSize: '0.7rem', textTransform: 'uppercase', color: '#be123c', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                        <BookOpen size={12} /> Catch-up Materials
                                                                                    </h5>
                                                                                    {log.catchUpNotes ? <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#475569' }}>{log.catchUpNotes}</p> : <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', fontStyle: 'italic', color: '#94a3b8' }}>No notes provided by facilitator.</p>}
                                                                                    {log.videoLink && (
                                                                                        <a href={log.videoLink} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#e11d48', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', background: '#ffe4e6', padding: '4px 10px', borderRadius: '4px' }}>
                                                                                            <PlayCircle size={14} /> Watch Recording
                                                                                        </a>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td style={{ textAlign: 'right', width: '220px', padding: '16px' }}>
                                                                        {viewMode === 'pending' ? (
                                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px' }}>
                                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: isExpired ? '#b91c1c' : (isUrgent ? '#d97706' : '#64748b'), fontSize: '0.75rem', fontWeight: 700 }}>
                                                                                    <Clock size={12} /> {formatTimeLeft(log.deadlineAt)}
                                                                                </div>
                                                                                <button
                                                                                    className="mlab-btn mlab-btn--sm"
                                                                                    style={{ background: isExpired ? '#dc2626' : (isMissed ? '#e11d48' : GREEN), color: (isExpired || isMissed) ? 'white' : MIDNIGHT, border: 'none', padding: '6px 12px' }}
                                                                                    onClick={() => setLogToConfirm(log)}
                                                                                    disabled={acknowledgingId === log.id}
                                                                                >
                                                                                    {acknowledgingId === log.id ? <Loader2 size={14} className="lfm-spin" /> : (isMissed ? "Caught Up" : "Acknowledge")}
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

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates' | 'attendance'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [activeDashTab, setActiveDashTab] = useState<'programmes' | 'tasks' | 'events'>('programmes');

    const [academicProfile, setAcademicProfile] = useState<any>(null);
    const [learnerEnrollments, setLearnerEnrollments] = useState<any[]>([]);
    const [allCurriculumLogs, setAllCurriculumLogs] = useState<any[]>([]);
    const [absenceDates, setAbsenceDates] = useState<any[]>([]);

    const [showWorkplaceLogModal, setShowWorkplaceLogModal] = useState(false);
    // State to hold the drafted workplace log to pass down into the edit modal
    const [activeEditLog, setActiveEditLog] = useState<any>(null);

    const [myScans, setMyScans] = useState<any[]>([]);
    const [myWorkplaceLogs, setMyWorkplaceLogs] = useState<any[]>([]);

    const [eventCheckins, setEventCheckins] = useState<any[]>([]);
    const [allEcosystemEvents, setAllEcosystemEvents] = useState<any[]>([]);
    const [eventSearch, setEventSearch] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [showStreakLostModal, setShowStreakLostModal] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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

    // 🚀 MASTER STREAM HOISTING ENGINE
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();

        if (!store.user?.uid) return;

        let unsubscribeProfile: () => void;
        let unsubscribeScans: () => void;
        let unsubscribeWorklogs: () => void;

        const setupLiveProfile = async () => {
            setIsLoading(true);
            console.log("🚀 [System Log]: Initializing setupLiveProfile stream for Auth UID:", store.user?.uid);

            try {
                const qProfile = query(collection(db, 'learners'), where('authUid', '==', store.user!.uid));

                unsubscribeProfile = onSnapshot(qProfile, async (snapProfile) => {
                    console.group("⚙️ [Live Profile Stream Tick]");

                    if (snapProfile.empty) {
                        console.warn("⚠️ [Profile Stream Warning]: No matching learner found for this Auth UID in the 'learners' collection.");
                        setIsLoading(false);
                        console.groupEnd();
                        return;
                    }

                    const profileDoc = snapProfile.docs[0];
                    const profileData = profileDoc.data();
                    const finalProfileId = profileDoc.id;
                    const profile: any = { id: finalProfileId, ...profileData };

                    console.log("📋 Physical Identity Doc ID (SA ID Number):", finalProfileId);

                    setAcademicProfile((prev: any) => {
                        if (prev && prev.professionalismStreak > 0 && profile.professionalismStreak === 0) {
                            setShowStreakLostModal(true);
                        }
                        else if (!prev && profile.professionalismStreak === 0 && profile.professionalismScore < 100) {
                            const localKey = `streak_loss_seen_${finalProfileId}_${profile.professionalismScore}`;
                            if (!localStorage.getItem(localKey)) {
                                setShowStreakLostModal(true);
                                localStorage.setItem(localKey, 'true');
                            }
                        }
                        return {
                            ...profile,
                            employerId: prev?.employerId || profile.employerId || null,
                            mentorId: prev?.mentorId || profile.mentorId || null
                        };
                    });

                    console.log("🔍 Fetching academic registration ledger from 'enrollments'...");
                    const enrolQ = query(
                        collection(db, 'enrollments'),
                        where('learnerId', '==', finalProfileId),
                        where('status', 'in', ['active', 'in-progress'])
                    );
                    const snapEnrol = await getDocs(enrolQ);
                    const enrolls = snapEnrol.docs.map(d => ({ id: d.id, ...d.data() }));
                    setLearnerEnrollments(enrolls);

                    // ─── 🚀 IN-MEMORY BLUEPRINT HYDRATION ENGINE ───
                    if (enrolls.length > 0) {
                        let activeEnrollment: any = enrolls[0];

                        const hasWE = activeEnrollment.workExperienceModules && activeEnrollment.workExperienceModules.length > 0;

                        if (!hasWE) {
                            console.log("🛠️ [Self-Healing Initialized]: Local blueprint modules are empty. Executing in-memory recovery...");
                            try {
                                const cohortDocRef = doc(db, 'cohorts', activeEnrollment.cohortId);
                                const cohortSnap = await getDoc(cohortDocRef);
                                let masterProgrammeId = activeEnrollment.programmeId;

                                if (cohortSnap.exists()) {
                                    masterProgrammeId = cohortSnap.data().programmeId || masterProgrammeId;
                                }

                                if (masterProgrammeId) {
                                    const progSnap = await getDoc(doc(db, 'programmes', masterProgrammeId));

                                    if (progSnap.exists()) {
                                        const progData = progSnap.data();
                                        const recoveredWE = progData.workExperienceModules || [];
                                        const recoveredP = progData.practicalModules || [];
                                        const recoveredK = progData.knowledgeModules || [];

                                        console.log(`📋 Found Blueprint Templates -> WE Count: ${recoveredWE.length}. Injecting straight to memory!`);

                                        // 🚀 ASSIGN TO LOCAL RUNTIME FIRST SO CHANNELS HYDRATE SECURELY
                                        activeEnrollment.workExperienceModules = recoveredWE;
                                        activeEnrollment.practicalModules = recoveredP;
                                        activeEnrollment.knowledgeModules = recoveredK;
                                    }
                                }
                            } catch (healError) {
                                console.error("🚨 In-memory self-healing failed:", healError);
                            }
                        }

                        console.log("⚡ Hydrating UI state container with modules count =", (activeEnrollment.workExperienceModules || []).length);
                        setAcademicProfile((prev: any) => prev ? {
                            ...prev,
                            workExperienceModules: activeEnrollment.workExperienceModules || [],
                            practicalModules: activeEnrollment.practicalModules || [],
                            knowledgeModules: activeEnrollment.knowledgeModules || [],
                            qualification: activeEnrollment.qualification || prev.qualification
                        } : prev);
                    }

                    if (enrolls.length > 0) {
                        const qAtt = query(collection(db, 'attendance'), where('cohortId', 'in', enrolls.map((e: any) => e.cohortId)));
                        const snapAtt = await getDocs(qAtt);

                        const missed = snapAtt.docs
                            .filter(d => d.data().absentLearners?.includes(profile.id) || d.data().absentLearners?.includes(profile.idNumber))
                            .map(d => {
                                const attData = d.data();
                                return {
                                    date: attData.date,
                                    cohortId: attData.cohortId || '',
                                    cohortName: attData.cohortName || ''
                                };
                            });

                        setAbsenceDates(missed);
                    }

                    const scansQ = query(collection(db, 'live_attendance_scans'), where('learnerId', '==', finalProfileId));
                    unsubscribeScans = onSnapshot(scansQ, (snapScans) => {
                        const scans = snapScans.docs.map(d => ({ id: d.id, ...d.data() }));
                        setMyScans(scans);
                    });

                    const worklogsQ = query(collection(db, 'workplace_logs'), where('learnerId', '==', finalProfileId));
                    unsubscribeWorklogs = onSnapshot(worklogsQ, (snapLogs) => {
                        const logs = snapLogs.docs.map(d => ({ id: d.id, ...d.data() }));
                        setMyWorkplaceLogs(logs);
                    });

                    console.groupEnd();
                    setIsLoading(false);
                });

            } catch (error) {
                console.error('❌ Critical outer error in setupLiveProfile:', error);
                setIsLoading(false);
            }
        };

        setupLiveProfile();

        return () => {
            if (unsubscribeProfile) unsubscribeProfile();
            if (unsubscribeScans) unsubscribeScans();
            if (unsubscribeWorklogs) unsubscribeWorklogs();
        };
    }, [store.user?.uid]);

    // 🚀 HOISTED FULLY-REACTIVE SINGLE-SOURCE-OF-TRUTH PLACEMENT LEDGER STREAM
    useEffect(() => {
        if (!academicProfile?.id) return;

        // Compile all potential identification tokens for this learner (Pure ID vs Composite IDs)
        const possibleIds = [academicProfile.id, ...learnerEnrollments.map(e => e.id)];

        const placementQ = query(
            collection(db, 'placements'),
            where('learnerId', 'in', possibleIds)
        );

        const unsubscribe = onSnapshot(placementQ, (snapPlacement) => {
            if (!snapPlacement.empty) {
                // Filter down to strictly active timelines matching the master scorecard indices
                const activeDocs = snapPlacement.docs
                    .map(d => d.data())
                    .filter(p => {
                        const status = String(p.status || '').toLowerCase();
                        return status.includes('active') || status.includes('pending');
                    });

                if (activeDocs.length > 0) {
                    const placementData = activeDocs[0];
                    setAcademicProfile((prev: any) => prev ? {
                        ...prev,
                        employerId: placementData.employerId,
                        mentorId: placementData.mentorId || placementData.assignedMentorId
                    } : prev);
                    return;
                }
            }
            // Baseline unplaced layout reset
            setAcademicProfile((prev: any) => prev ? { ...prev, employerId: null, mentorId: null } : prev);
        });

        return () => unsubscribe();
    }, [academicProfile?.id, learnerEnrollments]);

    useEffect(() => {
        if (!store.user?.email) return;
        const checkinsQ = query(collection(db, 'event_checkins'), where('guestEmail', '==', store.user.email.toLowerCase()));
        const unsubCheckins = onSnapshot(checkinsQ, (snap) => setEventCheckins(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        const eventsQ = query(collection(db, 'events'));
        const unsubEvents = onSnapshot(eventsQ, (snap) => setAllEcosystemEvents(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { unsubCheckins(); unsubEvents(); };
    }, [store.user?.email]);

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

    const myAttendedEvents = useMemo(() => {
        const checkinMap = new Map();
        eventCheckins.forEach(c => checkinMap.set(c.eventId, c));

        return allEcosystemEvents
            .filter(e => checkinMap.has(e.id))
            .map(e => ({ ...e, checkinData: checkinMap.get(e.id) }))
            .sort((a, b) => {
                const timeA = getSafeTime(a.checkinData.timestamp);
                const timeB = getSafeTime(b.checkinData.timestamp);
                return timeB.getTime() - timeA.getTime();
            });
    }, [eventCheckins, allEcosystemEvents]);

    const filteredEcosystemEvents = useMemo(() => {
        if (!eventSearch.trim()) return myAttendedEvents;
        const lower = eventSearch.toLowerCase();
        return myAttendedEvents.filter(e =>
            e.eventName?.toLowerCase().includes(lower) ||
            e.location?.toLowerCase().includes(lower) ||
            e.eventType?.toLowerCase().includes(lower)
        );
    }, [myAttendedEvents, eventSearch]);

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

    const pendingCount = useMemo(() => {
        if (!academicProfile?.id) return 0;
        return allCurriculumLogs.filter(log => !log.acknowledgedBy?.includes(academicProfile.id)).length;
    }, [allCurriculumLogs, academicProfile?.id]);

    const formattedScanHistory = useMemo(() => {
        const daysMap = new Map();
        myScans.forEach(scan => {
            if (!daysMap.has(scan.dateString)) {
                daysMap.set(scan.dateString, scan);
            } else {
                const existing = daysMap.get(scan.dateString);
                daysMap.set(scan.dateString, {
                    ...existing,
                    checkInAt: Math.min(existing.checkInAt || Infinity, scan.checkInAt || Infinity),
                    checkOutAt: scan.checkOutAt ? Math.max(existing.checkOutAt || 0, scan.checkOutAt) : existing.checkOutAt,
                    lunchOutAt: scan.lunchOutAt || existing.lunchOutAt,
                    lunchInAt: scan.lunchInAt || existing.lunchInAt
                });
            }
        });
        return Array.from(daysMap.values()).sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());
    }, [myScans]);

    const resolvedAbsenceDates = useMemo(() => {
        if (!absenceDates) return [];
        return absenceDates.map((abs: any) => {
            if (typeof abs === 'string') return { date: abs, cohortName: 'Unknown Class', cohortId: '' };
            const relatedCohort = store.cohorts?.find(c => c.id === abs.cohortId);
            if (relatedCohort?.name) return { date: abs.date, cohortName: relatedCohort.name, cohortId: abs.cohortId };
            if (abs.cohortName) return { date: abs.date, cohortName: abs.cohortName, cohortId: abs.cohortId };
            return { date: abs.date, cohortName: 'Unknown Class', cohortId: abs.cohortId };
        });
    }, [absenceDates, store.cohorts]);

    const absenceDateStrings = useMemo(() => resolvedAbsenceDates.map(a => a.date), [resolvedAbsenceDates]);

    const attendancePercentage = useMemo(() => {
        const totalDays = formattedScanHistory.length + resolvedAbsenceDates.length;
        if (totalDays === 0) return "100%";
        return Math.round((formattedScanHistory.length / totalDays) * 100) + "%";
    }, [formattedScanHistory, resolvedAbsenceDates]);

    const getStaffName = (id: string) => store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const filteredCohorts = useMemo(() => {
        let result = [...myCohorts];
        if (cohortSearch.trim()) {
            const searchLower = cohortSearch.toLowerCase();
            result = result.filter(c => c.name?.toLowerCase().includes(searchLower) || getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower));
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
            result = result.filter((c: any) => c.type?.toLowerCase().includes(searchLower) || c.courseName?.toLowerCase().includes(searchLower));
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

    const pageTitle = currentNav === 'dashboard' ? 'My Dashboard' : currentNav === 'certificates' ? 'My Certificates' : currentNav === 'attendance' ? 'Compliance Hub' : 'My Profile';
    const pageSub = currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` : currentNav === 'certificates' ? 'Official certificates issued to your profile' : currentNav === 'attendance' ? 'Track your compliance matrix and hardware log status' : 'Manage your personal details and account';

    const clearCohortFilters = () => { setCohortSearch(''); setCohortFilter('all'); setCohortSort('newest'); };
    const clearCertFilters = () => { setCertSearch(''); setCertFilter('all'); setCertSort('newest'); };

    const hasActiveCohortFilters = cohortSearch || cohortFilter !== 'all' || cohortSort !== 'newest';
    const hasActiveCertFilters = certSearch || certFilter !== 'all' || certSort !== 'newest';

    const pScore = academicProfile?.professionalismScore ?? 100;
    const pStreak = academicProfile?.professionalismStreak ?? 0;

    const scoreCommentary = useMemo(() => {
        if (pScore === 100 && pStreak > 2) {
            return {
                bg: '#f0fdf4', color: '#166534', border: '#bbf7d0',
                icon: <Award size={16} color="#166534" />,
                text: `Outstanding! You are fully compliant and on a ${pStreak}-day streak.`
            };
        } else if (pScore >= 80) {
            return {
                bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0',
                icon: <TrendingUp size={16} color="#15803d" />,
                text: pStreak === 0
                    ? `Good standing, but your streak broke! Clear your inbox to reignite it.`
                    : `Great job staying on track. Keep acknowledging topics to reach 100.`
            };
        } else if (pScore >= 50) {
            return {
                bg: '#fffbeb', color: '#b45309', border: '#fde68a',
                icon: <AlertTriangle size={16} color="#b45309" />,
                text: `Your score has dropped. Acknowledge pending tasks promptly to rebuild your standing.`
            };
        } else {
            return {
                bg: '#fef2f2', color: '#b91c1c', border: '#fecaca',
                icon: <AlertTriangle size={16} color="#b91c1c" />,
                text: `Critical: Your compliance score is very low. Clear your Action Inbox immediately.`
            };
        }
    }, [pScore, pStreak]);

    if (isLoading) {
        return (
            <div className="admin-layout learner-layout">
                <div className="ld-loading">
                    <Hexagon size={40} className="ld-loading__icon spin" />
                    <span>Loading...</span>
                </div>
            </div>
        );
    }

    return (
        <>
            {showWorkplaceLogModal && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <LearnerWorkplaceLogModal
                        learner={academicProfile}
                        existingLog={activeEditLog}
                        onClose={() => {
                            setShowWorkplaceLogModal(false);
                            setActiveEditLog(null);
                        }}
                    />
                </div>,
                document.body
            )}
            {showStreakLostModal && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="warning"
                        title="🔥 Streak Lost!"
                        message="Your Professionalism Streak has been reset to 0 because you failed to acknowledge a curriculum topic on time, or you were marked absent. It is critical to stay up to date with your Action Inbox to remain compliant. Let's start building that streak back up today!"
                        onClose={() => setShowStreakLostModal(false)}
                        confirmText="I Understand"
                    />
                </div>,
                document.body
            )}

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

                        {currentNav === 'dashboard' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                                <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingRight: '1rem', borderRight: '1px solid var(--mlab-border)' }}>
                                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Score</span>
                                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: pScore >= 80 ? GREEN : (pScore >= 50 ? '#d97706' : '#dc2626') }}>💯 {pScore}</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', fontWeight: 800, color: 'var(--mlab-grey)', letterSpacing: '0.05em' }}>Streak</span>
                                        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ea580c' }}>🔥 {pStreak}</span>
                                    </div>
                                </div>
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: scoreCommentary.bg, border: `1px solid ${scoreCommentary.border}`,
                                    padding: '6px 12px', borderRadius: '6px', maxWidth: '350px'
                                }}>
                                    {scoreCommentary.icon}
                                    <span style={{ fontSize: '0.75rem', color: scoreCommentary.color, fontWeight: 600, lineHeight: 1.3 }}>
                                        {scoreCommentary.text}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="admin-content">

                        {currentNav === 'dashboard' && (
                            <div className="ld-animate">
                                <div className="ld-stats-bar">
                                    <div className="ld-stat-item">
                                        <div className="ld-stat__icon ld-stat__icon--blue"><GraduationCap size={18} /></div>
                                        <div className="ld-stat__info">
                                            <span className="ld-stat__value">{myCohorts.length}</span>
                                            <span className="ld-stat__label">Programmes</span>
                                        </div>
                                    </div>
                                    <div className="ld-stat-divider" />
                                    <div className="cdp-stat-card__body" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div className="ld-stat__icon" style={{ background: '#ede9fe', color: '#8b5cf6' }}><Globe size={18} /></div>
                                        <div className="ld-stat__info">
                                            <span className="ld-stat__value">{myAttendedEvents.length}</span>
                                            <span className="ld-stat__label">Events</span>
                                        </div>
                                    </div>
                                    <div className="ld-stat-divider" />
                                    <div className="ld-stat-item">
                                        <div className="ld-stat__icon ld-stat__icon--green"><Award size={18} /></div>
                                        <div className="ld-stat__info">
                                            <span className="ld-stat__value">{academicProfile?.certificates?.length || 0}</span>
                                            <span className="ld-stat__label">Certificates</span>
                                        </div>
                                    </div>
                                    <div className="ld-stat-divider" />
                                    <div className="ld-stat-item">
                                        <div className="ld-stat__icon ld-stat__icon--amber"><Clock size={18} /></div>
                                        <div className="ld-stat__info">
                                            <span className="ld-stat__value">{attendancePercentage}</span>
                                            <span className="ld-stat__label">Attendance</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="lfm-tabs" style={{ marginBottom: '1.5rem', marginTop: '1.5rem', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                                    <button className={`lfm-tab ${activeDashTab === 'programmes' ? 'active' : ''}`} onClick={() => setActiveDashTab('programmes')}>
                                        <Layers size={16} /> My Programmes
                                    </button>
                                    <button className={`lfm-tab ${activeDashTab === 'events' ? 'active' : ''}`} onClick={() => setActiveDashTab('events')}>
                                        <Globe size={16} /> Ecosystem Events
                                        {myAttendedEvents.length > 0 && (
                                            <span style={{ background: activeDashTab === 'events' ? '#e0e7ff' : '#f1f5f9', color: activeDashTab === 'events' ? '#3730a3' : '#64748b', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '6px' }}>
                                                {myAttendedEvents.length}
                                            </span>
                                        )}
                                    </button>
                                    <button className={`lfm-tab ${activeDashTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveDashTab('tasks')}>
                                        <Zap size={16} /> Action Required
                                        {pendingCount > 0 && (
                                            <span style={{ background: '#dc2626', color: 'white', padding: '2px 6px', borderRadius: '10px', fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '6px' }}>
                                                {pendingCount}
                                            </span>
                                        )}
                                    </button>
                                </div>

                                {activeDashTab === 'tasks' && (
                                    <div className="animate-fade-in">
                                        <LearnerActionInbox profileId={academicProfile.id} logs={allCurriculumLogs} absenceDates={absenceDateStrings} />
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
                                                    <input type="text" placeholder="Search programmes..." value={cohortSearch} onChange={(e) => setCohortSearch(e.target.value)} className="ld-search-input" />
                                                    {cohortSearch && <button className="ld-clear-btn" onClick={() => setCohortSearch('')}><XCircle size={14} /></button>}
                                                </div>
                                                <button className={`ld-filter-toggle ${showCohortFilters ? 'active' : ''}`} onClick={() => setShowCohortFilters(!showCohortFilters)}>
                                                    <Filter size={16} /><span>Filter</span>{hasActiveCohortFilters && <span className="ld-filter-dot" />}<ChevronDown size={14} className={showCohortFilters ? 'rotate' : ''} />
                                                </button>
                                            </div>
                                        </div>

                                        {showCohortFilters && (
                                            <div className="ld-filter-panel">
                                                <div className="ld-filter-group">
                                                    <label>Status</label>
                                                    <div className="ld-filter-chips">
                                                        {[{ key: 'all', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'upcoming', label: 'Upcoming' }, { key: 'completed', label: 'Completed' }].map((f) => (
                                                            <button key={f.key} className={`ld-filter-chip ${cohortFilter === f.key ? 'active' : ''}`} onClick={() => setCohortFilter(f.key as FilterType)}>{f.label}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div className="ld-filter-group">
                                                    <label>Sort By</label>
                                                    <select value={cohortSort} onChange={(e) => setCohortSort(e.target.value as SortType)} className="ld-filter-select">
                                                        <option value="newest">Newest First</option>
                                                        <option value="oldest">Oldest First</option>
                                                        <option value="name">Name A-Z</option>
                                                    </select>
                                                </div>
                                                {hasActiveCohortFilters && (
                                                    <button className="ld-clear-filters" onClick={clearCohortFilters}><XCircle size={14} /> Clear All</button>
                                                )}
                                            </div>
                                        )}

                                        <div className="ld-cohort-grid">
                                            {filteredCohorts.map((cohort, index) => (
                                                <div key={cohort.id} className="ld-cohort-card" style={{ animationDelay: `${index * 0.08}s` }}>
                                                    <div className="ld-cohort-card__header">
                                                        <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                                        <span className="ld-badge ld-badge--active">Active</span>
                                                    </div>
                                                    <div className="ld-cohort-card__dates">
                                                        <Calendar size={12} /><span>{cohort.startDate} — {cohort.endDate}</span>
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
                                                        <button className="ld-btn ld-btn--primary" onClick={() => navigate(`/portfolio/${academicProfile?.id}`, { state: { cohortId: cohort.id } })}>
                                                            <span>Portfolio</span><ArrowRight size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {filteredCohorts.length === 0 && (
                                                <div className="ld-empty">
                                                    <div className="ld-empty__icon"><Search size={32} strokeWidth={1.5} /></div>
                                                    <span className="ld-empty__title">No Active Enrollments</span>
                                                    <p className="ld-empty__desc">You are currently not enrolled in any active classes. If you believe this is an error, please contact administration.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {activeDashTab === 'events' && (
                                    <div className="animate-fade-in">
                                        <div className="ld-section-header">
                                            <h2 className="ld-section-title">
                                                <Globe size={16} /> Event History
                                                <span className="ld-count-badge">{filteredEcosystemEvents.length}</span>
                                            </h2>
                                            <div className="ld-search-filter-bar">
                                                <div className="ld-search-box">
                                                    <Search size={16} className="ld-search-icon" />
                                                    <input type="text" placeholder="Search events, venues..." value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} className="ld-search-input" />
                                                    {eventSearch && <button className="ld-clear-btn" onClick={() => setEventSearch('')}><XCircle size={14} /></button>}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="ld-cohort-grid">
                                            {filteredEcosystemEvents.map((event, index) => {
                                                const checkinTime = getSafeTime(event.checkinData.timestamp);
                                                return (
                                                    <div key={`${event.id}-${index}`} className="ld-cohort-card" style={{ animationDelay: `${index * 0.08}s` }}>
                                                        <div className="ld-cohort-card__header">
                                                            <h3 className="ld-cohort-card__name" style={{ color: 'var(--mlab-blue)' }}>{event.eventName}</h3>
                                                            {event.eventType && <span className="ld-badge" style={{ background: '#e0e7ff', color: '#3730a3', border: '1px solid #c7d2fe' }}>{event.eventType}</span>}
                                                        </div>
                                                        <div className="ld-cohort-card__roles" style={{ marginTop: '1rem', flex: 1 }}>
                                                            <div className="ld-role-row">
                                                                <Calendar size={13} color="var(--mlab-grey)" />
                                                                <span className="ld-role-label">Event Date</span>
                                                                <span className="ld-role-name">{moment(event.date).format('D MMM YYYY')}</span>
                                                            </div>
                                                            <div className="ld-role-row">
                                                                <MapPin size={13} color="var(--mlab-grey)" />
                                                                <span className="ld-role-label">Location</span>
                                                                <span className="ld-role-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{event.location.split(',')[0]}</span>
                                                            </div>
                                                            <div className="ld-role-row">
                                                                <Clock size={13} color="var(--mlab-green-dark)" />
                                                                <span className="ld-role-label">Checked In</span>
                                                                <span className="ld-role-name" style={{ color: 'var(--mlab-green-dark)', fontWeight: 700 }}>{moment(checkinTime).format('h:mm A')}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredEcosystemEvents.length === 0 && (
                                                <div className="ld-empty" style={{ gridColumn: '1 / -1' }}>
                                                    <div className="ld-empty__icon"><Globe size={32} strokeWidth={1.5} /></div>
                                                    <span className="ld-empty__title">No Events Found</span>
                                                    <p className="ld-empty__desc">{eventSearch ? `No events match your search for "${eventSearch}".` : "You haven't checked into any ecosystem events yet. Join an upcoming Hackathon or Masterclass to build your profile!"}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ════ VIEW 2: ISOLATED ATTENDANCE HUB ════ */}
                        {currentNav === 'attendance' && (
                            <LearnerAttendanceView
                                formattedScanHistory={formattedScanHistory || []}
                                absenceDates={resolvedAbsenceDates || []}
                                attendancePercentage={attendancePercentage || "100%"}
                                cohorts={myCohorts || []}
                                workplaceLogs={myWorkplaceLogs}
                                learnerHasEmployer={!!academicProfile?.employerId}
                                onOpenLogModal={(selectedLog) => {
                                    // 🚀 If clicking "Resume", save the draft to state. Otherwise, clear it for a new entry.
                                    if (selectedLog && selectedLog.id) {
                                        setActiveEditLog(selectedLog);
                                    } else {
                                        setActiveEditLog(null);
                                    }
                                    setShowWorkplaceLogModal(true);
                                }}
                            />
                        )}

                        {/* ════ VIEW 3: ACCOUNT PROFILE EDITOR ════ */}
                        {currentNav === 'profile' && (
                            <LearnerProfileView
                                profile={academicProfile}
                                user={store.user}
                                onUpdate={store.updateLearner}
                            />
                        )}

                        {/* ════ VIEW 4: SECURED BLOCKCHAIN ACCREDITATIONS ════ */}
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
                                            <input type="text" placeholder="Search certificates..." value={certSearch} onChange={(e) => setCertSearch(e.target.value)} className="ld-search-input" />
                                            {certSearch && <button className="ld-clear-btn" onClick={() => setCertSearch('')}><XCircle size={14} /></button>}
                                        </div>
                                        <button className={`ld-filter-toggle ${showCertFilters ? 'active' : ''}`} onClick={() => setShowCertFilters(!showCertFilters)}>
                                            <Filter size={16} /><span>Filter</span>{hasActiveCertFilters && <span className="ld-filter-dot" />}<ChevronDown size={14} className={showCertFilters ? 'rotate' : ''} />
                                        </button>
                                    </div>
                                </div>
                                {showCertFilters && (
                                    <div className="ld-filter-panel">
                                        <div className="ld-filter-group">
                                            <label>Type</label>
                                            <div className="ld-filter-chips">
                                                {[{ key: 'all', label: 'All Types' }, { key: 'certificate', label: 'Certificate' }, { key: 'statement', label: 'Statement' }].map((f) => (
                                                    <button key={f.key} className={`ld-filter-chip ${certFilter === f.key ? 'active' : ''}`} onClick={() => setCertFilter(f.key as any)}>{f.label}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="ld-filter-group">
                                            <label>Sort By</label>
                                            <select value={certSort} onChange={(e) => setCertSort(e.target.value as SortType)} className="ld-filter-select">
                                                <option value="newest">Newest First</option>
                                                <option value="oldest">Oldest First</option>
                                                <option value="name">Name A-Z</option>
                                            </select>
                                        </div>
                                        {hasActiveCertFilters && <button className="ld-clear-filters" onClick={clearCertFilters}><XCircle size={14} /> Clear All</button>}
                                    </div>
                                )}
                                {filteredCertificates.length === 0 ? (
                                    <div className="ld-empty ld-empty--large">
                                        <div className="ld-empty__icon">{certSearch ? <Search size={40} strokeWidth={1} /> : <Award size={40} strokeWidth={1} />}</div>
                                        <span className="ld-empty__title">{certSearch ? 'No Results Found' : 'No Certificates Yet'}</span>
                                        <p className="ld-empty__desc">{certSearch ? `No certificates match "${certSearch}"` : 'Certificates appear here after programme completion.'}</p>
                                        {hasActiveCertFilters && certSearch && <button className="ld-btn ld-btn--ghost ld-btn--sm" onClick={clearCertFilters}><XCircle size={14} /> Clear Filters</button>}
                                    </div>
                                ) : (
                                    <div className="ld-cohort-grid">
                                        {filteredCertificates.map((cert: any, index: number) => (
                                            <div key={cert.id} className="ld-cohort-card ld-cert-card" style={{ animationDelay: `${index * 0.08}s` }}>
                                                <div className="ld-cohort-card__header">
                                                    <div className="ld-cert-card__icon-wrap"><Award size={18} /></div>
                                                    <div className="ld-cert-card__title-group">
                                                        <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
                                                    </div>
                                                    <span className="ld-badge ld-badge--issued">Issued</span>
                                                </div>
                                                <div className="ld-cohort-card__roles">
                                                    <div className="ld-role-row">
                                                        <BookOpen size={12} /><span className="ld-role-label">Programme</span><span className="ld-role-name">{cert.courseName}</span>
                                                    </div>
                                                    <div className="ld-role-row">
                                                        <Calendar size={12} /><span className="ld-role-label">Issued</span><span className="ld-role-name">{new Date(cert.issueDate).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                    </div>
                                                    <div className="ld-role-row">
                                                        <CheckCircle size={12} /><span className="ld-role-label">Status</span><span className="ld-role-name ld-role-name--success">Valid</span>
                                                    </div>
                                                </div>
                                                <div className="ld-cohort-card__footer">
                                                    <button className="ld-btn ld-btn--download" onClick={() => window.open(cert.pdfUrl, '_blank')}>
                                                        <Download size={14} /><span>Download PDF</span>
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
        </>
    );
};

export default LearnerDashboard;