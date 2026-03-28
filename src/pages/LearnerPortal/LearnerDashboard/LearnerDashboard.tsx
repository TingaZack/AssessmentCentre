// src/pages/LearnerPortal/LearnerDashboard.tsx

import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X, Award, Download,
    GraduationCap, Clock, User, BookOpen, CheckCircle
} from 'lucide-react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import './LearnerDashboard.css';

const LearnerDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [academicProfile, setAcademicProfile] = useState<any>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [currentNav]);

    // ─── REAL-TIME DATA SYNC ──────────────────────────────────────────────────
    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();

        if (!store.user?.uid) return;

        const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));
        const unsubscribe = onSnapshot(q, snapshot => {
            if (!snapshot.empty) {
                setAcademicProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            }
        }, err => console.error('Error listening to learner profile:', err));

        return () => unsubscribe();
    }, [store.user?.uid]);

    const handleLogout = async () => {
        try { await signOut(auth); navigate('/login'); }
        catch (error) { console.error('Logout failed', error); }
    };

    // ─── Derived data ─────────────────────────────────────────────────────────
    const myLearnerProfile = academicProfile || store.learners.find(l =>
        l.authUid === store.user?.uid || l.email === store.user?.email
    );

    const myCohorts = store.cohorts.filter(c =>
        c.id === myLearnerProfile?.cohortId ||
        c.learnerIds?.includes(myLearnerProfile?.id || '')
    );

    const getStaffName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const pageTitle =
        currentNav === 'dashboard' ? 'My Active Classes' :
            currentNav === 'certificates' ? 'My Certificates' :
                'My Profile';

    const pageSub =
        currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
            currentNav === 'certificates' ? 'Official certificates issued to your profile' :
                'Manage your personal details and account';

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="admin-layout learner-layout">

            {/* ── MOBILE HEADER ── */}
            <header className="ld-mobile-header">
                <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu size={22} />
                </button>
                <div className="ld-mobile-brand">
                    <span className="ld-mobile-brand__logo">mLab</span>
                    <span className="ld-mobile-brand__sub">Learner Portal</span>
                </div>
            </header>

            {/* ── OVERLAY ── */}
            {isMobileMenuOpen && (
                <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* ── SIDEBAR ── */}
            <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
                <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                    <X size={22} />
                </button>
                <Sidebar
                    role={store.user?.role}
                    currentNav={currentNav}
                    setCurrentNav={setCurrentNav as any}
                    onLogout={handleLogout}
                />
            </div>

            {/* ── MAIN PANE ── */}
            <main className="main-wrapper">
                {/* Page header */}
                <div className="dashboard-header">
                    <div className="header-title">
                        <h1>{pageTitle}</h1>
                        <p>{pageSub}</p>
                    </div>
                </div>

                <div className="admin-content">

                    {/* ── Dashboard Tab ──────────────────────────────────── */}
                    {currentNav === 'dashboard' && (
                        <div className="ld-animate">
                            <h2 className="ld-section-title">
                                <Layers size={16} /> Active Cohorts
                            </h2>

                            <div className="ld-cohort-grid">
                                {myCohorts.map(cohort => (
                                    <div key={cohort.id} className="ld-cohort-card">
                                        <div className="ld-cohort-card__header">
                                            <h3 className="ld-cohort-card__name">{cohort.name}</h3>
                                            <span className="ld-badge ld-badge--active">Active</span>
                                        </div>

                                        <div className="ld-cohort-card__dates">
                                            <Calendar size={13} />
                                            {cohort.startDate} — {cohort.endDate}
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
                                                onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
                                            >
                                                Open Portfolio <ArrowRight size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {myCohorts.length === 0 && (
                                    <div className="ld-empty">
                                        <div className="ld-empty__icon"><Layers size={36} /></div>
                                        <span className="ld-empty__title">No Classes Found</span>
                                        <p className="ld-empty__desc">You haven't been assigned to a class yet. Contact your facilitator for assistance.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Profile Tab ──────────────────────────────────── */}
                    {currentNav === 'profile' && (
                        <LearnerProfileView
                            profile={myLearnerProfile}
                            user={store.user}
                            onUpdate={store.updateLearner}
                        />
                    )}

                    {/* ── Certificates Tab ─────────────────────────────── */}
                    {currentNav === 'certificates' && (
                        <div className="ld-animate">
                            <h2 className="ld-section-title">
                                <Award size={16} /> Issued Certificates
                            </h2>

                            {(!myLearnerProfile?.certificates || myLearnerProfile.certificates.length === 0) ? (
                                <div className="ld-empty">
                                    <div className="ld-empty__icon"><Award size={36} /></div>
                                    <span className="ld-empty__title">No Certificates Yet</span>
                                    <p className="ld-empty__desc">Certificates will appear here once issued by your administrator upon programme completion.</p>
                                </div>
                            ) : (
                                <div className="ld-cohort-grid">
                                    {[...myLearnerProfile.certificates].reverse().map((cert: any) => (
                                        <div key={cert.id} className="ld-cohort-card ld-cert-card">
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
                                                            day: 'numeric', month: 'long', year: 'numeric'
                                                        })}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="ld-cohort-card__footer">
                                                <button
                                                    className="ld-btn ld-btn--download"
                                                    onClick={() => window.open(cert.pdfUrl, '_blank')}
                                                >
                                                    <Download size={14} /> View &amp; Download PDF
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