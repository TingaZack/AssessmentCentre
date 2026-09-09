// src/pages/FacilitatorDashboard/FacilitatorDashboard.tsx

import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../../store/useStore';
import {
    Users,
    ArrowRight,
    ClipboardCheck,
    Calendar,
    Layers,
    Plus,
    FileEdit,
    LayoutDashboard,
    UserCircle,
    HeartHandshake,
    MessageSquare,
    Zap,
    ChevronUp,
    ChevronDown,
    HelpCircle,
    Award
} from 'lucide-react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

import { AttendanceHistoryList } from '../AttendanceRegister/AttendanceHistoryList';
import { AssessmentManager } from '../AssessmentManager/AssessmentManager';
import { FacilitatorProfileView } from '../FacilitatorProfileView/FacilitatorProfileView';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
import { CoachingScheduleView } from '../../../components/views/CoachingScheduleView/CoachingScheduleView';
import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';

import '../../AdminDashboard/AdminDashboard.css';
import './FacilitatorDashboard.css';
import '../../../components/views/CohortsView/CohortsView.css';
import { CertificateStudio } from '../../AdminDashboard/CertificateStudio/CertificateStudio';
import { SurveyManager } from '../../AdminDashboard/SurveyManager/SurveyManager';

export const FacilitatorDashboard: React.FC = () => {
    const {
        user,
        cohorts,
        learners,
        programmes,
        staff,
        employers,
        settings,
        fetchCohorts,
        fetchLearners,
        fetchProgrammes,
        fetchStaff,
        fetchEmployers,
        updateStaffProfile
    } = useStore();

    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    // 🚀 INCLUDED 'studio' IN THE URL TAB UNION
    const urlTab = searchParams.get('tab') as 'dashboard' | 'history' | 'profile' | 'assessments' | 'coaching' | 'surveys' | 'studio' | null;

    const activeTab = useMemo(() => {
        const path = location.pathname;
        if (path.includes('/profile')) return 'profile';
        if (path.includes('/attendance') && !path.includes('/', 22)) return 'history';
        if (path.includes('/assessments')) return 'assessments';
        if (urlTab) return urlTab;
        return 'dashboard';
    }, [location.pathname, urlTab]);

    const handleSetTab = (tab: 'dashboard' | 'history' | 'profile' | 'assessments' | 'coaching' | 'surveys' | 'studio') => {
        setSearchParams((prev) => {
            prev.set('tab', tab);
            return prev;
        }, { replace: true });
    };

    const [showKPIs, setShowKPIs] = useState(true);

    const [stats, setStats] = useState({
        avgMarkingTime: null as number | null,
        totalMarked: 0,
        pendingMarking: 0,
        awaitingSignoff: 0,
        pendingByCohort: {} as Record<string, number>
    });

    const [, setCoachingAlertCount] = useState(0);

    // Advanced Facilitator KPI States
    const [slaStats, setSlaStats] = useState({ under24: 0, days1to5: 0, over5: 0 });
    const [domainStats, setModuleDomainStats] = useState({ know: 0, prac: 0, work: 0, other: 0, total: 0 });
    const [curriculumCoverage, setCurriculumCoverage] = useState({ knowTotal: 0, knowLogged: 0, pracTotal: 0, pracLogged: 0, workTotal: 0, workLogged: 0 });
    const [attendanceHealth, setAttendanceHealth] = useState({ high: 0, mid: 0, low: 0, total: 0 });

    const isAssistant = ['assistant_facilitator', 'support_facilitator'].includes(user?.role || '');

    const myCohorts = useMemo(() => {
        return cohorts.filter(c =>
            (c.facilitatorId === user?.uid || c.supportFacilitatorId === user?.uid) &&
            !c.isArchived
        );
    }, [cohorts, user]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();

        if (activeTab === 'dashboard') {
            if (learners.length === 0) fetchLearners();
            if (staff.length === 0) fetchStaff();
        }

        if (activeTab === 'assessments' && programmes.length === 0) fetchProgrammes();

        if (activeTab === 'profile') {
            if (employers.length === 0) fetchEmployers();
            if (staff.length === 0) fetchStaff();
        }
    }, [activeTab, fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers, cohorts.length, learners.length, programmes.length, employers.length, staff.length]);

    useEffect(() => {
        const fetchDashboardStats = async () => {
            if (!user?.uid) return;

            try {
                const cohortIds = myCohorts.map(c => c.id);

                const coachingSnap = await getDocs(query(collection(db, 'coaching_sessions'), where('status', 'in', ['requested', 'pending_notes'])));
                let cAlerts = 0;
                const nowMs = Date.now();

                coachingSnap.docs.forEach(cDoc => {
                    const cData = cDoc.data();
                    const isPast = new Date(cData.dateTime).getTime() < nowMs;
                    const needsLink = !cData.meetLink || cData.requiresManualLink;
                    if (cData.status === 'pending_notes' || (cData.status === 'requested' && isPast) || needsLink) {
                        cAlerts++;
                    }
                });
                setCoachingAlertCount(cAlerts);

                if (isAssistant) return;

                const markedQuery = query(collection(db, 'learner_submissions'), where('grading.facilitatorId', '==', user.uid));
                const markedSnap = await getDocs(markedQuery);

                let totalTime = 0;
                let timeTrackedCount = 0;
                markedSnap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.grading?.facilitatorTimeSpent > 0) {
                        totalTime += data.grading.facilitatorTimeSpent;
                        timeTrackedCount++;
                    }
                });

                const calculatedAvgTime = timeTrackedCount > 0 ? totalTime / timeTrackedCount : 0;

                let pendingCount = 0;
                let signoffCount = 0;
                const cohortPendingMap: Record<string, number> = {};

                let u24 = 0, u5 = 0, o5 = 0;
                let dKnow = 0, dPrac = 0, dWork = 0, dOther = 0;

                if (cohortIds.length > 0) {
                    const chunks = [];
                    for (let i = 0; i < cohortIds.length; i += 10) chunks.push(cohortIds.slice(i, i + 10));

                    for (const chunk of chunks) {
                        const pendingQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'submitted'));
                        const pSnap = await getDocs(pendingQ);
                        pendingCount += pSnap.size;

                        pSnap.forEach(docSnap => {
                            const data = docSnap.data();
                            const cid = data.cohortId;
                            if (cid) cohortPendingMap[cid] = (cohortPendingMap[cid] || 0) + 1;

                            const submittedDateMs = new Date(data.submittedAt || data.createdAt || Date.now()).getTime();
                            const daysOld = (nowMs - submittedDateMs) / (1000 * 3600 * 24);
                            if (daysOld <= 1) u24++;
                            else if (daysOld <= 5) u5++;
                            else o5++;

                            const modType = (data.moduleType || '').toLowerCase();
                            const titleStr = (data.title || '').toLowerCase();
                            if (modType.includes('knowledge') || titleStr.includes('knowledge')) dKnow++;
                            else if (modType.includes('practical') || titleStr.includes('practical')) dPrac++;
                            else if (modType.includes('workplace') || modType.includes('work experience')) dWork++;
                            else dOther++;
                        });

                        const signoffQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'awaiting_learner_signoff'));
                        signoffCount += (await getDocs(signoffQ)).size;
                    }

                    const chunksCurr = [];
                    for (let i = 0; i < cohortIds.length; i += 10) chunksCurr.push(cohortIds.slice(i, i + 10));
                    let kLog = 0, pLog = 0, wLog = 0;

                    for (const chunk of chunksCurr) {
                        const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', 'in', chunk));
                        const logsSnap = await getDocs(logsQ);
                        logsSnap.forEach(docSnap => {
                            const data = docSnap.data();
                            const mType = (data.moduleType || '').toLowerCase();
                            if (mType.includes('knowledge')) kLog++;
                            else if (mType.includes('practical')) pLog++;
                            else if (mType.includes('workplace') || mType.includes('work experience')) wLog++;
                        });
                    }

                    const kTot = myCohorts.length * 15 || 1;
                    const pTot = myCohorts.length * 10 || 1;
                    const wTot = myCohorts.length * 5 || 1;

                    setCurriculumCoverage({
                        knowTotal: kTot, knowLogged: Math.min(kLog, kTot),
                        pracTotal: pTot, pracLogged: Math.min(pLog, pTot),
                        workTotal: wTot, workLogged: Math.min(wLog, wTot)
                    });

                    let highCount = 0, midCount = 0, lowCount = 0;
                    for (const chunk of chunksCurr) {
                        const attQ = query(collection(db, 'attendance'), where('cohortId', 'in', chunk));
                        const attSnap = await getDocs(attQ);

                        attSnap.forEach(docSnap => {
                            const data = docSnap.data();
                            const present = data.presentLearners?.length || 0;
                            const total = (data.presentLearners?.length || 0) + (data.absentLearners?.length || 0);
                            const pct = total > 0 ? (present / total) * 100 : 100;

                            if (pct >= 75) highCount++;
                            else if (pct >= 40) midCount++;
                            else lowCount++;
                        });
                    }

                    const attTotal = highCount + midCount + lowCount;
                    setAttendanceHealth({ high: highCount, mid: midCount, low: lowCount, total: attTotal > 0 ? attTotal : 1 });
                }

                setSlaStats({ under24: u24, days1to5: u5, over5: o5 });
                setModuleDomainStats({ know: dKnow, prac: dPrac, work: dWork, other: dOther, total: pendingCount });

                setStats({
                    avgMarkingTime: calculatedAvgTime,
                    totalMarked: markedSnap.size,
                    pendingMarking: pendingCount,
                    awaitingSignoff: signoffCount,
                    pendingByCohort: cohortPendingMap
                });
            } catch (error) {
                console.error("Failed to fetch dashboard stats:", error);
            }
        };

        if (activeTab === 'dashboard') fetchDashboardStats();
    }, [user?.uid, activeTab, myCohorts, isAssistant]);

    const formatTimeSpent = (seconds?: number | null) => {
        if (!seconds) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
    };

    const getStaffName = (id?: string) => {
        if (!id) return 'Unassigned';
        const member = staff.find(s => s.id === id || s.authUid === id);
        return member ? member.fullName : 'Unknown';
    };

    const totalLearnersCount = myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0);

    return (
        <div className="cdp-layout">
            <main className="cdp-main">
                {/* ── PAGE HEADER ── */}
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-blue)' }}>
                    <div className="cdp-header__left">
                        <div className="cdp-header__icon-wrap">
                            {activeTab === 'dashboard' && <LayoutDashboard size={22} />}
                            {activeTab === 'history' && <ClipboardCheck size={22} />}
                            {activeTab === 'profile' && <UserCircle size={22} />}
                            {activeTab === 'assessments' && <FileEdit size={22} />}
                            {activeTab === 'surveys' && <HelpCircle size={22} />}
                            {activeTab === 'coaching' && <MessageSquare size={22} />}
                            {activeTab === 'studio' && <Award size={22} />}
                        </div>
                        <div className="cdp-header__text">
                            <span className="cdp-header__eyebrow">Facilitator Portal</span>
                            <h1 className="cdp-header__title">
                                {activeTab === 'dashboard' && (isAssistant ? 'Assistant Facilitator Overview' : 'My Cohorts')}
                                {activeTab === 'history' && 'Attendance History'}
                                {activeTab === 'profile' && 'My Profile'}
                                {activeTab === 'assessments' && (isAssistant ? 'Portfolio Tracking' : 'Assessment Manager')}
                                {activeTab === 'surveys' && 'Surveys & Feedback Center'}
                                {activeTab === 'coaching' && 'Coaching & Support Schedule'}
                                {activeTab === 'studio' && 'Certificate Studio'}
                            </h1>
                            <p className="cdp-header__sub">
                                Practitioner: {user?.fullName || 'Unknown User'}
                            </p>
                        </div>
                    </div>

                    <div className="cdp-header__right" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                        {activeTab === 'assessments' && !isAssistant && (
                            <button className="lfm-btn lfm-btn--primary" onClick={() => navigate('/facilitator/assessments/builder')}>
                                <Plus size={16} /> New Assessment
                            </button>
                        )}
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content" style={{ padding: '2rem' }}>

                    {/* COACHING SCHEDULE */}
                    {activeTab === 'coaching' && (
                        <div className="animate-fade-in"><CoachingScheduleView /></div>
                    )}

                    {/* FULL SURVEY MANAGER */}
                    {activeTab === 'surveys' && (
                        <div className="animate-fade-in">
                            <SurveyManager />
                        </div>
                    )}

                    {/* CERTIFICATE STUDIO */}
                    {activeTab === 'studio' && (
                        <div className="animate-fade-in">
                            <CertificateStudio />
                        </div>
                    )}

                    {/* DASHBOARD OVERVIEW */}
                    {activeTab === 'dashboard' && (
                        <div className="animate-fade-in">

                            {/* COLLAPSIBLE PERFORMANCE INSIGHTS TOGGLE */}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: showKPIs ? '1rem' : '2rem' }}>
                                <button
                                    onClick={() => setShowKPIs(!showKPIs)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        background: 'transparent', border: 'none', color: 'var(--mlab-grey)',
                                        fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700,
                                        textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
                                    onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
                                >
                                    {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
                                </button>
                            </div>

                            {/* COLLAPSIBLE KPI WRAPPER */}
                            {showKPIs && (
                                <div className="animate-slide-down">
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                        <ModuleProgressCard
                                            type="Active Cohorts"
                                            data={{ total: 0, logged: myCohorts.length, subValue: 'Active class allocations' }}
                                        />
                                        <ModuleProgressCard
                                            type="Active Learners"
                                            data={{ total: totalLearnersCount > 0 ? totalLearnersCount : 1, logged: totalLearnersCount, subValue: 'Enrolled students' }}
                                        />

                                        {!isAssistant && (
                                            <>
                                                <ModuleProgressCard
                                                    type="Pending Marking"
                                                    data={{ total: stats.pendingMarking > 0 ? stats.pendingMarking : 1, logged: stats.pendingMarking, subValue: 'Awaiting pre-marking review' }}
                                                />
                                                <ModuleProgressCard
                                                    type="Facilitator Pace"
                                                    data={{ total: 0, logged: formatTimeSpent(stats.avgMarkingTime), subValue: 'Avg pre-marking pace' }}
                                                />
                                            </>
                                        )}
                                    </div>

                                    {!isAssistant && (
                                        <>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                                                <ModuleProgressCard
                                                    type="Queue Aging & SLA"
                                                    orientation="landscape"
                                                    data={{
                                                        total: stats.pendingMarking > 0 ? stats.pendingMarking : 1,
                                                        logged: stats.pendingMarking,
                                                        subValue: 'SLA breakdown for pre-marking items',
                                                        lines: [
                                                            { label: `< 24 Hours (${slaStats.under24})`, value: slaStats.under24, total: stats.pendingMarking, color: '#16a34a', bg: '#dcfce7' },
                                                            { label: `1 - 5 Days (${slaStats.days1to5})`, value: slaStats.days1to5, total: stats.pendingMarking, color: '#f59e0b', bg: '#fef3c7' },
                                                            { label: `Overdue > 5 Days (${slaStats.over5})`, value: slaStats.over5, total: stats.pendingMarking, color: '#dc2626', bg: '#fee2e2' }
                                                        ]
                                                    }}
                                                />

                                                <ModuleProgressCard
                                                    type="Grading by Module"
                                                    orientation="landscape"
                                                    data={{
                                                        total: domainStats.total > 0 ? domainStats.total : 1,
                                                        logged: domainStats.total,
                                                        subValue: 'Pre-marking queue by domain',
                                                        lines: [
                                                            { label: `Knowledge (${domainStats.know})`, value: domainStats.know, total: domainStats.total, color: '#16a34a', bg: '#dcfce7' },
                                                            { label: `Practical (${domainStats.prac})`, value: domainStats.prac, total: domainStats.total, color: '#0ea5e9', bg: '#e0f2fe' },
                                                            { label: `Workplace (${domainStats.work})`, value: domainStats.work, total: domainStats.total, color: '#d97706', bg: '#fef3c7' },
                                                            { label: `Other (${domainStats.other})`, value: domainStats.other, total: domainStats.total, color: '#ec4899', bg: '#fdf2f8' }
                                                        ].filter(l => l.total > 0)
                                                    }}
                                                />
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                                                <ModuleProgressCard
                                                    type="QCTO Compliance"
                                                    orientation="landscape"
                                                    data={{
                                                        total: curriculumCoverage.knowTotal + curriculumCoverage.pracTotal + curriculumCoverage.workTotal,
                                                        logged: curriculumCoverage.knowLogged + curriculumCoverage.pracLogged + curriculumCoverage.workLogged,
                                                        subValue: 'Topics covered in class',
                                                        lines: [
                                                            { label: `Knowledge Modules (${((curriculumCoverage.knowLogged / curriculumCoverage.knowTotal) * 100).toFixed(1)}%)`, value: curriculumCoverage.knowLogged, total: curriculumCoverage.knowTotal, color: '#16a34a', bg: '#dcfce7' },
                                                            { label: `Practical Modules (${((curriculumCoverage.pracLogged / curriculumCoverage.pracTotal) * 100).toFixed(1)}%)`, value: curriculumCoverage.pracLogged, total: curriculumCoverage.pracTotal, color: '#0ea5e9', bg: '#e0f2fe' },
                                                            { label: `Workplace Modules (${((curriculumCoverage.workLogged / curriculumCoverage.workTotal) * 100).toFixed(1)}%)`, value: curriculumCoverage.workLogged, total: curriculumCoverage.workTotal, color: '#d97706', bg: '#fef3c7' }
                                                        ]
                                                    }}
                                                />

                                                <ModuleProgressCard
                                                    type="Active Attendance"
                                                    orientation="landscape"
                                                    data={{
                                                        total: attendanceHealth.total,
                                                        logged: attendanceHealth.high,
                                                        subValue: 'Attendance health across active registers',
                                                        lines: [
                                                            { label: `High Compliance 75%+ (${attendanceHealth.high})`, value: attendanceHealth.high, total: attendanceHealth.total, color: '#16a34a', bg: '#dcfce7' },
                                                            { label: `At-Risk 40-74% (${attendanceHealth.mid})`, value: attendanceHealth.mid, total: attendanceHealth.total, color: '#f59e0b', bg: '#fef3c7' },
                                                            { label: `Critical Risk <40% (${attendanceHealth.low})`, value: attendanceHealth.low, total: attendanceHealth.total, color: '#dc2626', bg: '#fee2e2' }
                                                        ]
                                                    }}
                                                />
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── COHORT GRID ── */}
                            <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title"><Layers size={18} /> Your Assigned Cohorts ({myCohorts.length})</h2>
                                </div>

                                <div className="lfm-body" style={{ background: 'var(--mlab-bg)' }}>
                                    <div className="mlab-cohort-grid">
                                        {myCohorts.length > 0 ? myCohorts.map(cohort => {
                                            const pendingCount = stats.pendingByCohort[cohort.id] || 0;
                                            const isSupport = cohort.supportFacilitatorId === user?.uid;
                                            const isBootcamp = (cohort as any).type === 'bootcamp' || (cohort as any).isBootcamp === true;

                                            return (
                                                <div key={cohort.id} className="mlab-cohort-card animate-fade-in">
                                                    <div className="mlab-cohort-card__header">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <h3 className="mlab-cohort-card__name">{cohort.name}</h3>
                                                            {isBootcamp && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#fef3c7', color: '#d97706', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', border: '1px solid #fde68a' }}>
                                                                    <Zap size={10} /> Bootcamp
                                                                </span>
                                                            )}
                                                        </div>

                                                        {!isAssistant && pendingCount > 0 ? (
                                                            <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <FileEdit size={10} /> {pendingCount} To Mark
                                                            </span>
                                                        ) : isSupport ? (
                                                            <span className="mlab-badge" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                <HeartHandshake size={10} /> Assistant
                                                            </span>
                                                        ) : (
                                                            <span className="ld-badge-active">Primary</span>
                                                        )}
                                                    </div>

                                                    <div className="mlab-cohort-card__dates">
                                                        <Calendar size={14} />
                                                        <span>{cohort.startDate} — {cohort.endDate}</span>
                                                    </div>

                                                    <div className="mlab-role-row-stack">
                                                        <div className="mlab-role-row">
                                                            <div className="mlab-role-dot mlab-role-dot--blue" />
                                                            <span className="mlab-role-label">Facilitator:</span>
                                                            <span className="mlab-role-name">{getStaffName(cohort.facilitatorId)}</span>
                                                        </div>

                                                        {cohort.supportFacilitatorId && (
                                                            <div className="mlab-role-row">
                                                                <div className="mlab-role-dot" style={{ background: '#0ea5e9' }} />
                                                                <span className="mlab-role-label">Assistant Fac:</span>
                                                                <span className="mlab-role-name">{getStaffName(cohort.supportFacilitatorId)}</span>
                                                            </div>
                                                        )}

                                                        {!isBootcamp ? (
                                                            <>
                                                                <div className="mlab-role-row">
                                                                    <div className="mlab-role-dot mlab-role-dot--red" />
                                                                    <span className="mlab-role-label">Assessor:</span>
                                                                    <span className="mlab-role-name">{getStaffName(cohort.assessorId)}</span>
                                                                </div>
                                                                <div className="mlab-role-row">
                                                                    <div className="mlab-role-dot mlab-role-dot--green" />
                                                                    <span className="mlab-role-label">Moderator:</span>
                                                                    <span className="mlab-role-name">{getStaffName(cohort.moderatorId)}</span>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="mlab-role-row">
                                                                <div className="mlab-role-dot" style={{ background: '#8b5cf6' }} />
                                                                <span className="mlab-role-label">Location:</span>
                                                                <span className="mlab-role-name">
                                                                    {(settings?.campuses as any[])?.find((c: any) => c.id === cohort.campusId)?.name || 'Online / Hybrid'}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="mlab-role-row" style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--mlab-border)' }}>
                                                            <div className="mlab-role-dot" style={{ background: '#f59e0b' }} />
                                                            <span className="mlab-role-label">{isBootcamp ? 'Applicants:' : 'Enrolled Learners:'}</span>
                                                            <span className="mlab-role-name" style={{ fontWeight: 'bold' }}>{cohort.learnerIds?.length || 0} {isBootcamp ? 'Registered' : ''}</span>
                                                        </div>
                                                    </div>

                                                    <div style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: '10px', marginTop: 16 }}>
                                                        <button className="mlab-cohort-card__manage" style={{ flex: 1, justifyContent: 'center' }} onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                                            View Class <ArrowRight size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <div className="mlab-cohort-empty" style={{ gridColumn: '1 / -1', margin: '2rem 0' }}>
                                                <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                                <p className="mlab-cohort-empty__title">No Active Cohorts</p>
                                                <p className="mlab-cohort-empty__desc">You have not been assigned to facilitate any classes yet.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'history' && <div className="animate-fade-in"><AttendanceHistoryList facilitatorId={user?.uid} /></div>}
                    {activeTab === 'assessments' && <AssessmentManager />}
                    {activeTab === 'profile' && <div className="animate-fade-in"><FacilitatorProfileView profile={user} user={user} onUpdate={updateStaffProfile} /></div>}
                </div>
            </main>
        </div>
    );
};