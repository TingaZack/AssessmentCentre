import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
    BookOpen,
    Users,
    ArrowRight,
    ClipboardCheck,
    Calendar,
    Layers,
    Plus,
    Activity
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { AttendanceHistoryList } from './AttendanceRegister/AttendanceHistoryList';
import './FacilitatorDashboard.css';
import { AssessmentManager } from './AssessmentManager/AssessmentManager';
import { FacilitatorProfileView } from './FacilitatorProfileView/FacilitatorProfileView';
import PageHeader from '../../components/common/PageHeader/PageHeader';

export const FacilitatorDashboard: React.FC = () => {
    // We need updateStaffProfile to allow the profile view to save changes
    const { user, cohorts, fetchCohorts, updateStaffProfile } = useStore();
    const navigate = useNavigate();
    const location = useLocation();

    // Internal state to control the view, synced with URL
    const [activeTab, setActiveTab] = useState<'dashboard' | 'history' | 'profile' | 'assessments'>('dashboard');

    // State for Facilitator Analytics
    const [avgMarkingTime, setAvgMarkingTime] = useState<number | null>(null);

    //  SYNC TABS WITH URL
    useEffect(() => {
        const path = location.pathname;
        if (path.includes('/profile')) {
            setActiveTab('profile');
        } else if (path.includes('/attendance') && !path.includes('/', 22)) {
            // Checks for generic attendance list, excludes specific cohort IDs
            setActiveTab('history');
        } else if (path.includes('/assessments')) {
            setActiveTab('assessments');
        } else {
            setActiveTab('dashboard');
        }
    }, [location.pathname]);

    // FETCH DATA
    useEffect(() => {
        fetchCohorts();
    }, [fetchCohorts]);

    // FILTER COHORTS
    const myCohorts = useMemo(() => {
        return cohorts.filter(c => c.facilitatorId === user?.uid && !c.isArchived);
    }, [cohorts, user]);

    // FETCH HISTORICAL MARKING DATA
    useEffect(() => {
        const fetchHistoricalTime = async () => {
            if (!user?.uid) return;
            try {
                // Fetch all scripts that THIS facilitator has marked
                const q = query(
                    collection(db, 'learner_submissions'),
                    where('grading.facilitatorId', '==', user.uid)
                );
                const snap = await getDocs(q);

                let totalTime = 0;
                let count = 0;

                snap.forEach(doc => {
                    const data = doc.data();
                    if (data.grading?.facilitatorTimeSpent && data.grading.facilitatorTimeSpent > 0) {
                        totalTime += data.grading.facilitatorTimeSpent;
                        count++;
                    }
                });

                if (count > 0) {
                    setAvgMarkingTime(totalTime / count);
                } else {
                    setAvgMarkingTime(0);
                }

            } catch (error) {
                console.error("Failed to fetch historical marking times:", error);
            }
        };

        if (activeTab === 'dashboard') {
            fetchHistoricalTime();
        }
    }, [user?.uid, activeTab]);

    // Format seconds into readable text
    const formatTimeSpent = (seconds?: number | null) => {
        if (seconds === undefined || seconds === null || seconds === 0) return '—';
        const m = Math.floor(seconds / 60);
        if (m === 0) return '< 1m';
        const h = Math.floor(m / 60);
        if (h > 0) {
            const remM = m % 60;
            return `${h}h ${remM}m`;
        }
        return `${m}m`;
    };

    return (
        <div className="dashboard-content">
            <PageHeader
                eyebrow="Facilitator Portal"
                title={activeTab === 'dashboard' ? 'My Cohorts' : activeTab === 'history' ? 'Attendance History' : activeTab === 'profile' ? 'My Profile' : 'Assessments'}
                description={activeTab === 'dashboard' ? 'View and manage your assigned cohorts.' : activeTab === 'history' ? 'Review past attendance registers.' : activeTab === 'profile' ? 'View and update your profile information.' : 'Create and manage assessments for your learners.'}
                actions={
                    <>
                        {activeTab === 'assessments' && <PageHeader.Btn
                            variant="primary"
                            icon={<Plus size={15} />}
                            onClick={() => { }}
                        >
                            New Assessment
                        </PageHeader.Btn>}
                    </>
                }
            />

            {/* VIEW: ACTIVE COHORTS (Dashboard) */}
            {activeTab === 'dashboard' && (
                <div className="animate-fade-in">

                    {/* Metrics Row */}
                    <div className="f-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div className="f-stat-icon blue" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Layers size={24} />
                            </div>
                            <div className="stat-info">
                                <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Active Classes</label>
                                <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{myCohorts.length}</div>
                            </div>
                        </div>

                        <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                            <div className="f-stat-icon green" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Users size={24} />
                            </div>
                            <div className="stat-info">
                                <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>Total Learners</label>
                                <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0f172a', fontFamily: 'var(--font-heading)' }}>
                                    {myCohorts.reduce((acc, curr) => acc + (curr.learnerIds?.length || 0), 0)}
                                </div>
                            </div>
                        </div>

                        {/* Facilitator Historical Time Metric */}
                        <div className="stat-card" style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '1.25rem', borderLeft: '4px solid #0ea5e9' }}>
                            <div className="f-stat-icon" style={{ width: '54px', height: '54px', borderRadius: '12px', background: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Activity size={24} />
                            </div>
                            <div className="stat-info">
                                <label style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 'bold', textTransform: 'uppercase' }}>My Avg Pre-Mark Pace</label>
                                <div className="value" style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#0ea5e9', fontFamily: 'var(--font-heading)' }}>
                                    {formatTimeSpent(avgMarkingTime)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* COHORT GRID */}
                    <section className="list-view">
                        <h3 className="section-title" style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', color: 'var(--mlab-blue)', borderBottom: '2px solid #f1f5f9', paddingBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Layers size={20} /> Your Assigned Cohorts
                        </h3>

                        <div className="ld-cohort-grid">
                            {myCohorts.length > 0 ? myCohorts.map(cohort => (
                                <div key={cohort.id} className="ld-cohort-card">
                                    <div className="ld-cohort-card__header">
                                        <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                        <span className="ld-badge-active">Facilitating</span>
                                    </div>

                                    <div className="ld-cohort-card__dates">
                                        <Calendar size={13} /> {cohort.startDate} — {cohort.endDate}
                                    </div>

                                    <div className="ld-cohort-card__roles">
                                        <div className="ld-role-row">
                                            <div className="ld-role-dot ld-role-dot--blue" />
                                            <span className="ld-role-label">Enrolled Learners:</span>
                                            <span className="ld-role-name">{cohort.learnerIds?.length || 0}</span>
                                        </div>
                                    </div>

                                    <div className="ld-cohort-card__footer">
                                        <button
                                            className="ld-attendance-btn"
                                            onClick={() => navigate(`/facilitator/attendance/${cohort.id}`)}
                                        >
                                            <ClipboardCheck size={14} /> Register
                                        </button>
                                        <button
                                            className="ld-portfolio-btn"
                                            onClick={() => navigate(`/cohorts/${cohort.id}`)}
                                        >
                                            View Class <ArrowRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            )) : (
                                <div className="f-empty-state" style={{ border: '1px dashed #cbd5e1', padding: '4rem', textAlign: 'center', color: '#64748b', borderRadius: '12px', background: '#f8fafc', gridColumn: '1 / -1' }}>
                                    <Layers size={48} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                    <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 'bold', color: '#0f172a' }}>No active cohorts</p>
                                    <p style={{ margin: '0.5rem 0 0 0' }}>You have not been assigned to facilitate any classes yet.</p>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* VIEW: ATTENDANCE HISTORY */}
            {activeTab === 'history' && (
                <div className="animate-fade-in">
                    <AttendanceHistoryList facilitatorId={user?.uid} />
                </div>
            )}

            {/* VIEW: ASSESSMENTS */}
            {activeTab === 'assessments' && (
                <AssessmentManager />
            )}

            {/* VIEW: PROFILE */}
            {activeTab === 'profile' && (
                <div className="animate-fade-in">
                    <FacilitatorProfileView
                        profile={user}
                        user={user}
                        onUpdate={updateStaffProfile}
                    />
                </div>
            )}
        </div>
    );
};
