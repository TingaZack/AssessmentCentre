// src/pages/LearnerPortal/LearnerDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X
} from 'lucide-react';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import './LearnerDashboard.css';

const LearnerDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile'>(
        (location.state as any)?.activeTab || 'dashboard'
    );

    // Mobile Sidebar State
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Auto-close the sidebar when the user clicks a navigation link on mobile
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();
        store.fetchLearners();
    }, [store.fetchCohorts, store.fetchStaff, store.fetchLearners]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    // ─── Data ─────────────────────────────────────────────────────────────────
    const myLearnerProfile = store.learners.find(l =>
        l.authUid === store.user?.uid || l.email === store.user?.email
    );

    const myCohorts = store.cohorts.filter(c =>
        c.id === myLearnerProfile?.cohortId ||
        c.learnerIds?.includes(myLearnerProfile?.id || '')
    );

    const getStaffName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="admin-layout learner-layout">

            {/* MOBILE HEADER */}
            <div className="ld-mobile-header">
                <button
                    className="ld-hamburger-btn"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <Menu size={24} />
                </button>
                <div className="ld-mobile-title">Learner Portal</div>
            </div>

            {/* MOBILE OVERLAY */}
            {isMobileMenuOpen && (
                <div
                    className="ld-sidebar-overlay"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* SIDEBAR WRAPPER */}
            <div className={`ld-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
                <button
                    className="ld-close-btn"
                    onClick={() => setIsMobileMenuOpen(false)}
                >
                    <X size={24} />
                </button>
                <Sidebar
                    role={store.user?.role}
                    currentNav={currentNav}
                    setCurrentNav={setCurrentNav}
                    onLogout={handleLogout}
                />
            </div>

            <main className="main-wrapper" style={{ width: '100%', padding: 16 }}>
                <header className="dashboard-header">
                    <div className="header-title">
                        <h1 className="ld-page-title">
                            {currentNav === 'dashboard' && 'My Active Classes'}
                            {currentNav === 'profile' && 'My Personal Profile'}
                        </h1>
                        <p className="ld-page-sub">
                            Welcome back, {store.user?.fullName || 'Learner'}
                        </p>
                    </div>
                </header>

                <div className="admin-content">

                    {/* ── Dashboard Tab ────────────────────────────────────── */}
                    {currentNav === 'dashboard' && (
                        <div className="ld-animate">

                            <h2 className="ld-section-title">
                                <Layers size={16} /> Active Cohorts
                            </h2>

                            <div className="ld-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="ld-cohort-card">

                                        {/* Card Header */}
                                        <div className="ld-cohort-card__header">
                                            <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                            <span className="ld-badge-active">Active</span>
                                        </div>

                                        {/* Date Range */}
                                        <div className="ld-cohort-card__dates">
                                            <Calendar size={13} />
                                            {cohort.startDate} — {cohort.endDate}
                                        </div>

                                        {/* Staff Roles */}
                                        <div className="ld-cohort-card__roles">
                                            <div className="ld-role-row">
                                                <div className="ld-role-dot ld-role-dot--blue" />
                                                <span className="ld-role-label">Facilitator:</span>
                                                <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
                                            </div>
                                            <div className="ld-role-row">
                                                <div className="ld-role-dot ld-role-dot--red" />
                                                <span className="ld-role-label">Assessor:</span>
                                                <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
                                            </div>
                                        </div>

                                        {/* Footer CTA */}
                                        <div className="ld-cohort-card__footer">
                                            <button
                                                className="ld-portfolio-btn"
                                                onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
                                            >
                                                Open Portfolio <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* Empty State */}
                                {myCohorts.length === 0 && (
                                    <div className="ld-empty">
                                        <Layers size={44} color="var(--mlab-green)" style={{ opacity: 0.5 }} />
                                        <span className="ld-empty__title">No Classes Found</span>
                                        <p className="ld-empty__desc">
                                            You haven't been assigned to a class yet.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Profile Tab ──────────────────────────────────────── */}
                    {currentNav === 'profile' && (
                        <LearnerProfileView
                            profile={myLearnerProfile}
                            user={store.user}
                            onUpdate={store.updateLearner}
                        />
                    )}

                </div>
            </main>
        </div>
    );
};

export default LearnerDashboard;