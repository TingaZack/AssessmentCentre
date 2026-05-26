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
    Activity,
    Clock,
    FileEdit,
    LayoutDashboard,
    UserCircle,
    HeartHandshake
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { AttendanceHistoryList } from '../AttendanceRegister/AttendanceHistoryList';
import { AssessmentManager } from '../AssessmentManager/AssessmentManager';
import { FacilitatorProfileView } from '../FacilitatorProfileView/FacilitatorProfileView';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';

import '../../AdminDashboard/AdminDashboard.css';

import './FacilitatorDashboard.css';
import StatCard from '../../../components/common/StatCard/StatCard';

export const FacilitatorDashboard: React.FC = () => {
    const {
        user,
        cohorts,
        learners,
        programmes,
        staff,
        employers,
        fetchCohorts,
        fetchLearners,
        fetchProgrammes,
        fetchStaff,
        fetchEmployers,
        updateStaffProfile
    } = useStore();

    const navigate = useNavigate();
    const location = useLocation();

    const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

    const [stats, setStats] = useState({
        avgMarkingTime: null as number | null,
        totalMarked: 0,
        pendingMarking: 0,
        awaitingSignoff: 0,
        pendingByCohort: {} as Record<string, number>
    });

    useEffect(() => {
        const path = location.pathname;
        if (path.includes('/profile')) setActiveTab('profile');
        else if (path.includes('/attendance') && !path.includes('/', 22)) setActiveTab('history');
        else if (path.includes('/assessments')) setActiveTab('assessments');
        else setActiveTab('dashboard');
    }, [location.pathname]);

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (activeTab === 'dashboard' && learners.length === 0) fetchLearners();
        if (activeTab === 'assessments' && programmes.length === 0) fetchProgrammes();
        if (activeTab === 'profile') {
            if (employers.length === 0) fetchEmployers();
            if (staff.length === 0) fetchStaff();
        }
    }, [activeTab, fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff, fetchEmployers, cohorts.length, learners.length, programmes.length, employers.length, staff.length]);

    // CO-FACILITATION LOGIC: Include classes where they are Primary OR Support
    const myCohorts = useMemo(() => {
        return cohorts.filter(c =>
            (c.facilitatorId === user?.uid || c.supportFacilitatorId === user?.uid) &&
            !c.isArchived
        );
    }, [cohorts, user]);

    useEffect(() => {
        const fetchDashboardStats = async () => {
            if (!user?.uid) return;
            try {
                const markedQuery = query(collection(db, 'learner_submissions'), where('grading.facilitatorId', '==', user.uid));
                const markedSnap = await getDocs(markedQuery);

                let totalTime = 0;
                let timeTrackedCount = 0;
                markedSnap.forEach(doc => {
                    const data = doc.data();
                    if (data.grading?.facilitatorTimeSpent > 0) {
                        totalTime += data.grading.facilitatorTimeSpent;
                        timeTrackedCount++;
                    }
                });

                const calculatedAvgTime = timeTrackedCount > 0 ? totalTime / timeTrackedCount : 0;

                let pendingCount = 0;
                let signoffCount = 0;
                const cohortPendingMap: Record<string, number> = {};
                const cohortIds = myCohorts.map(c => c.id);

                if (cohortIds.length > 0) {
                    const chunks = [];
                    for (let i = 0; i < cohortIds.length; i += 10) chunks.push(cohortIds.slice(i, i + 10));

                    for (const chunk of chunks) {
                        const pendingQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'submitted'));
                        const pSnap = await getDocs(pendingQ);
                        pendingCount += pSnap.size;
                        pSnap.forEach(doc => {
                            const cid = doc.data().cohortId;
                            if (cid) cohortPendingMap[cid] = (cohortPendingMap[cid] || 0) + 1;
                        });

                        const signoffQ = query(collection(db, 'learner_submissions'), where('cohortId', 'in', chunk), where('status', '==', 'awaiting_learner_signoff'));
                        signoffCount += (await getDocs(signoffQ)).size;
                    }
                }

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
    }, [user?.uid, activeTab, myCohorts]);

    const formatTimeSpent = (seconds?: number | null) => {
        if (!seconds) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
    };

    return (
        <div className="wm-root animate-fade-in" style={{ padding: 16, paddingBottom: '5%' }}>

            {/* ── PAGE HEADER (Matching Admin Dashboard Standard) ── */}
            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon">
                        {activeTab === 'dashboard' && <LayoutDashboard size={22} />}
                        {activeTab === 'history' && <ClipboardCheck size={22} />}
                        {activeTab === 'profile' && <UserCircle size={22} />}
                        {activeTab === 'assessments' && <FileEdit size={22} />}
                    </div>
                    <div>
                        <h1 className="wm-page-header__title">
                            {activeTab === 'dashboard' && 'My Cohorts'}
                            {activeTab === 'history' && 'Attendance History'}
                            {activeTab === 'profile' && 'My Profile'}
                            {activeTab === 'assessments' && 'Assessment Manager'}
                        </h1>
                        <p className="wm-page-header__desc">
                            {activeTab === 'dashboard' && 'View and manage your assigned cohorts and active classes.'}
                            {activeTab === 'history' && 'Review past attendance registers and session records.'}
                            {activeTab === 'profile' && 'View and update your facilitator profile and contact info.'}
                            {activeTab === 'assessments' && 'Create and manage assessments for your assigned learners.'}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {activeTab === 'assessments' && (
                        <button className="mlab-btn mlab-btn--primary" onClick={() => navigate('/facilitator/assessments/builder')}>
                            <Plus size={16} /> New Assessment
                        </button>
                    )}
                    <NotificationBell />
                </div>
            </div>

            <div className="admin-content">
                {activeTab === 'dashboard' && (
                    <div className="animate-fade-in">

                        {/* ── KPI RIBBON (Matching Admin Standard) ── */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                            <StatCard icon={<FileEdit size={20} />} title="Awaiting Pre-Marking" value={stats.pendingMarking} borderColor="var(--mlab-amber)" />
                            <StatCard icon={<Clock size={20} />} title="Pending Signatures" value={stats.awaitingSignoff} borderColor="var(--mlab-grey)" />
                            <StatCard icon={<ClipboardCheck size={20} />} title="Lifetime Scripts" value={stats.totalMarked} borderColor="var(--mlab-green)" />
                            <StatCard icon={<Layers size={20} />} title="Active Classes" value={myCohorts.length} borderColor="var(--mlab-blue)" />
                            <StatCard icon={<Users size={20} />} title="Total Learners" value={myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)} borderColor="var(--mlab-blue)" />
                            <StatCard icon={<Activity size={20} />} title="Avg Pre-Mark Pace" value={formatTimeSpent(stats.avgMarkingTime)} borderColor="#8b5cf6" />
                        </div>

                        {/* ── COHORT GRID ── */}
                        <section className="list-view">
                            <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                                <Layers size={20} /> Your Assigned Cohorts
                            </h3>

                            <div className="ld-cohort-grid">
                                {myCohorts.length > 0 ? myCohorts.map(cohort => {
                                    const pendingCount = stats.pendingByCohort[cohort.id] || 0;
                                    // CHECK IF THEY ARE PRIMARY OR SUPPORT
                                    const isSupport = cohort.supportFacilitatorId === user?.uid;

                                    return (
                                        <div key={cohort.id} className="ld-cohort-card">
                                            <div className="ld-cohort-card__header">
                                                <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                                {pendingCount > 0 ? (
                                                    <span className="mlab-badge" style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <FileEdit size={10} /> {pendingCount} To Mark
                                                    </span>
                                                ) : isSupport ? (
                                                    <span className="mlab-badge" style={{ background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <HeartHandshake size={10} /> Support
                                                    </span>
                                                ) : (
                                                    <span className="ld-badge-active">Facilitating</span>
                                                )}
                                            </div>
                                            <div className="ld-cohort-card__dates"><Calendar size={13} /> {cohort.startDate} — {cohort.endDate}</div>
                                            <div className="ld-cohort-card__roles">
                                                <div className="ld-role-row">
                                                    <div className="ld-role-dot ld-role-dot--blue" />
                                                    <span className="ld-role-label">Enrolled Learners:</span>
                                                    <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
                                                </div>
                                            </div>
                                            <div className="ld-cohort-card__footer">
                                                <button className="ld-attendance-btn" onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}>
                                                    <ClipboardCheck size={14} /> Register
                                                </button>
                                                <button className="ld-portfolio-btn" onClick={() => navigate(`/cohorts/${cohort.id}`)}>
                                                    View Class <ArrowRight size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="f-empty-state">
                                        <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                        <p style={{ fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
                                        <p>You have not been assigned to facilitate any classes yet.</p>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'history' && <div className="animate-fade-in"><AttendanceHistoryList facilitatorId={user?.uid} /></div>}
                {activeTab === 'assessments' && <AssessmentManager />}
                {activeTab === 'profile' && <div className="animate-fade-in"><FacilitatorProfileView profile={user} user={user} onUpdate={updateStaffProfile} /></div>}
            </div>
        </div>
    );
};
