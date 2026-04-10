// src/pages/LearnerPortal/LearnerDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import {
    Layers, Calendar, ArrowRight, Menu, X, Award, Download,
    GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
    Hexagon, Mail, Search, Filter, ChevronDown, XCircle
} from 'lucide-react';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useStore } from '../../../store/useStore';
import { auth, db } from '../../../lib/firebase';
import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
import './LearnerDashboard.css';

type FilterType = 'all' | 'active' | 'completed' | 'upcoming';
type SortType = 'newest' | 'oldest' | 'name';

const LearnerDashboard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const store = useStore();

    const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
        (location.state as any)?.activeTab || 'dashboard'
    );
    const [academicProfile, setAcademicProfile] = useState<any>(null);
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

    useEffect(() => {
        store.fetchCohorts();
        store.fetchStaff();

        if (!store.user?.uid) return;

        const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));
        const unsubscribe = onSnapshot(q, snapshot => {
            if (!snapshot.empty) {
                setAcademicProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            }
            setIsLoading(false);
        }, err => {
            console.error('Error listening to learner profile:', err);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [store.user?.uid]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        }
        catch (error) {
            console.error('Logout failed', error);
        }
    };

    const myLearnerProfile = academicProfile || store.learners.find(l =>
        l.authUid === store.user?.uid || l.email === store.user?.email
    );

    const myCohorts = store.cohorts.filter(c =>
        c.id === myLearnerProfile?.cohortId ||
        c.learnerIds?.includes(myLearnerProfile?.id || '')
    );

    // 🚀 FIX 1: Moved getStaffName ABOVE the useMemo so it can be used inside filteredCohorts
    const getStaffName = (id: string) =>
        store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

    // Filtered and Sorted Cohorts
    const filteredCohorts = useMemo(() => {
        let result = [...myCohorts];

        // Search filter
        if (cohortSearch.trim()) {
            const searchLower = cohortSearch.toLowerCase();
            result = result.filter(c =>
                c.name?.toLowerCase().includes(searchLower) ||
                getStaffName(c.facilitatorId)?.toLowerCase().includes(searchLower)
            );
        }

        // Status filter
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

        // Sort
        result.sort((a, b) => {
            if (cohortSort === 'name') return a.name?.localeCompare(b.name);
            const dateA = new Date(cohortSort === 'newest' ? b.startDate : a.startDate);
            const dateB = new Date(cohortSort === 'newest' ? a.startDate : b.startDate);
            return dateA.getTime() - dateB.getTime();
        });

        return result;
    }, [myCohorts, cohortSearch, cohortFilter, cohortSort, store.staff]); // 🚀 Added store.staff to dependency array

    // Filtered and Sorted Certificates
    const filteredCertificates = useMemo(() => {
        const certs = myLearnerProfile?.certificates || [];
        let result = [...certs];

        // Search filter
        if (certSearch.trim()) {
            const searchLower = certSearch.toLowerCase();
            result = result.filter((c: any) =>
                c.type?.toLowerCase().includes(searchLower) ||
                c.courseName?.toLowerCase().includes(searchLower)
            );
        }

        // Type filter
        if (certFilter !== 'all') {
            result = result.filter((c: any) => c.type?.toLowerCase().includes(certFilter));
        }

        // Sort
        result.sort((a: any, b: any) => {
            if (certSort === 'name') return a.courseName?.localeCompare(b.courseName);
            const dateA = new Date(certSort === 'newest' ? b.issueDate : a.issueDate);
            const dateB = new Date(certSort === 'newest' ? a.issueDate : b.issueDate);
            return dateA.getTime() - dateB.getTime();
        });

        return result;
    }, [myLearnerProfile?.certificates, certSearch, certFilter, certSort]);

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
            {/* Mobile Header */}
            <header className="ld-mobile-header">
                <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                    <Menu size={20} />
                </button>
                <div className="ld-mobile-brand">
                    <span className="ld-mobile-brand__logo">mLab</span>
                    <span className="ld-mobile-brand__sub">Learner Portal</span>
                </div>
            </header>

            {/* Overlay */}
            {isMobileMenuOpen && (
                <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
            )}

            {/* Sidebar */}
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

            {/* Main Content */}
            <main className="main-wrapper">
                {/* Compact Header */}
                <div className="dashboard-header dashboard-header--compact">
                    <div className="header-title">
                        <div className="header-badge">
                            <Shield size={12} />
                            <span>Verified</span>
                        </div>
                        <h1>{pageTitle}</h1>
                        <p>{pageSub}</p>
                    </div>
                </div>

                <div className="admin-content">
                    {/* DASHBOARD TAB */}
                    {currentNav === 'dashboard' && (
                        <div className="ld-animate">
                            {/* Compact Stats */}
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
                                        <span className="ld-stat__value">{myLearnerProfile?.certificates?.length || 0}</span>
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

                            {/* Search and Filter Bar */}
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

                            {/* Filter Panel */}
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
                                                onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
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
                                        <span className="ld-empty__title">No Results Found</span>
                                        <p className="ld-empty__desc">
                                            {cohortSearch
                                                ? `No programmes match "${cohortSearch}"`
                                                : "No programmes match the selected filters."}
                                        </p>
                                        {hasActiveCohortFilters && (
                                            <button
                                                className="ld-btn ld-btn--ghost ld-btn--sm"
                                                onClick={clearCohortFilters}
                                            >
                                                <XCircle size={14} />
                                                Clear Filters
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* PROFILE TAB */}
                    {currentNav === 'profile' && (
                        <LearnerProfileView
                            profile={myLearnerProfile}
                            user={store.user}
                            onUpdate={store.updateLearner}
                        />
                    )}

                    {/* CERTIFICATES TAB */}
                    {currentNav === 'certificates' && (
                        <div className="ld-animate">
                            {/* Search and Filter Bar */}
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

                            {/* Filter Panel */}
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

// import React, { useEffect, useState } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { signOut } from 'firebase/auth';
// import {
//     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
//     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
//     Hexagon, Mail
// } from 'lucide-react';
// import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
// import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// import { useStore } from '../../../store/useStore';
// import { auth, db } from '../../../lib/firebase';
// import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// import './LearnerDashboard.css';

// const LearnerDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();
//     const store = useStore();

//     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
//         (location.state as any)?.activeTab || 'dashboard'
//     );
//     const [academicProfile, setAcademicProfile] = useState<any>(null);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [isLoading, setIsLoading] = useState(true);

//     useEffect(() => {
//         setIsMobileMenuOpen(false);
//     }, [currentNav]);

//     useEffect(() => {
//         store.fetchCohorts();
//         store.fetchStaff();

//         if (!store.user?.uid) return;

//         const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));
//         const unsubscribe = onSnapshot(q, snapshot => {
//             if (!snapshot.empty) {
//                 setAcademicProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
//             }
//             setIsLoading(false);
//         }, err => {
//             console.error('Error listening to learner profile:', err);
//             setIsLoading(false);
//         });

//         return () => unsubscribe();
//     }, [store.user?.uid]);

//     const handleLogout = async () => {
//         try {
//             await signOut(auth);
//             navigate('/login');
//         }
//         catch (error) {
//             console.error('Logout failed', error);
//         }
//     };

//     const myLearnerProfile = academicProfile || store.learners.find(l =>
//         l.authUid === store.user?.uid || l.email === store.user?.email
//     );

//     const myCohorts = store.cohorts.filter(c =>
//         c.id === myLearnerProfile?.cohortId ||
//         c.learnerIds?.includes(myLearnerProfile?.id || '')
//     );

//     const getStaffName = (id: string) =>
//         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

//     const pageTitle =
//         currentNav === 'dashboard' ? 'My Dashboard' :
//             currentNav === 'certificates' ? 'My Certificates' :
//                 'My Profile';

//     const pageSub =
//         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
//             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
//                 'Manage your personal details and account';

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
//             {/* Mobile Header */}
//             <header className="ld-mobile-header">
//                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                     <Menu size={20} />
//                 </button>
//                 <div className="ld-mobile-brand">
//                     <span className="ld-mobile-brand__logo">mLab</span>
//                     <span className="ld-mobile-brand__sub">Learner Portal</span>
//                 </div>
//             </header>

//             {/* Overlay */}
//             {isMobileMenuOpen && (
//                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
//             )}

//             {/* Sidebar */}
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

//             {/* Main Content */}
//             <main className="main-wrapper">
//                 {/* Compact Header */}
//                 <div className="dashboard-header dashboard-header--compact">
//                     <div className="header-title">
//                         <div className="header-badge">
//                             <Shield size={12} />
//                             <span>Verified</span>
//                         </div>
//                         <h1>{pageTitle}</h1>
//                         <p>{pageSub}</p>
//                     </div>
//                 </div>

//                 <div className="admin-content">
//                     {/* DASHBOARD TAB */}
//                     {currentNav === 'dashboard' && (
//                         <div className="ld-animate">
//                             {/* Compact Stats */}
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
//                                         <span className="ld-stat__value">{myLearnerProfile?.certificates?.length || 0}</span>
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

//                             <h2 className="ld-section-title">
//                                 <Layers size={16} /> Active Cohorts
//                             </h2>

//                             <div className="ld-cohort-grid">
//                                 {myCohorts.map((cohort, index) => (
//                                     <div
//                                         key={cohort.id}
//                                         className="ld-cohort-card"
//                                         style={{ animationDelay: `${index * 0.08}s` }}
//                                     >
//                                         <div className="ld-cohort-card__header">
//                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
//                                             <span className="ld-badge ld-badge--active">Active</span>
//                                         </div>

//                                         <div className="ld-cohort-card__dates">
//                                             <Calendar size={12} />
//                                             <span>{cohort.startDate} — {cohort.endDate}</span>
//                                         </div>

//                                         <div className="ld-cohort-card__roles">
//                                             <div className="ld-role-row">
//                                                 <div className="ld-role-dot ld-role-dot--blue" />
//                                                 <span className="ld-role-label">Facilitator</span>
//                                                 <span className="ld-role-name">{getStaffName(cohort.facilitatorId)}</span>
//                                             </div>
//                                             <div className="ld-role-row">
//                                                 <div className="ld-role-dot ld-role-dot--red" />
//                                                 <span className="ld-role-label">Assessor</span>
//                                                 <span className="ld-role-name">{getStaffName(cohort.assessorId)}</span>
//                                             </div>
//                                             {cohort.moderatorId && (
//                                                 <div className="ld-role-row">
//                                                     <div className="ld-role-dot ld-role-dot--green" />
//                                                     <span className="ld-role-label">Moderator</span>
//                                                     <span className="ld-role-name">{getStaffName(cohort.moderatorId)}</span>
//                                                 </div>
//                                             )}
//                                         </div>

//                                         <div className="ld-cohort-card__footer">
//                                             <button
//                                                 className="ld-btn ld-btn--primary"
//                                                 onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
//                                             >
//                                                 <span>Portfolio</span>
//                                                 <ArrowRight size={14} />
//                                             </button>
//                                         </div>
//                                     </div>
//                                 ))}

//                                 {myCohorts.length === 0 && (
//                                     <div className="ld-empty">
//                                         <div className="ld-empty__icon">
//                                             <Layers size={32} strokeWidth={1.5} />
//                                         </div>
//                                         <span className="ld-empty__title">No Classes Found</span>
//                                         <p className="ld-empty__desc">Contact your facilitator for assistance.</p>
//                                         <button
//                                             className="ld-btn ld-btn--ghost ld-btn--sm"
//                                             onClick={() => window.location.href = 'mailto:support@mlab.co.za'}
//                                         >
//                                             <Mail size={14} />
//                                             Contact Support
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>
//                     )}

//                     {/* PROFILE TAB */}
//                     {currentNav === 'profile' && (
//                         <LearnerProfileView
//                             profile={myLearnerProfile}
//                             user={store.user}
//                             onUpdate={store.updateLearner}
//                         />
//                     )}

//                     {/* CERTIFICATES TAB */}
//                     {currentNav === 'certificates' && (
//                         <div className="ld-animate">
//                             <h2 className="ld-section-title">
//                                 <Award size={16} /> Issued Certificates
//                             </h2>

//                             {(!myLearnerProfile?.certificates || myLearnerProfile.certificates.length === 0) ? (
//                                 <div className="ld-empty ld-empty--large">
//                                     <div className="ld-empty__icon">
//                                         <Award size={40} strokeWidth={1} />
//                                     </div>
//                                     <span className="ld-empty__title">No Certificates Yet</span>
//                                     <p className="ld-empty__desc">Certificates appear here after programme completion.</p>
//                                 </div>
//                             ) : (
//                                 <div className="ld-cohort-grid">
//                                     {[...myLearnerProfile.certificates].reverse().map((cert: any, index) => (
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

// // import React, { useEffect, useState } from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { signOut } from 'firebase/auth';
// // import {
// //     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
// //     GraduationCap, Clock, User, BookOpen, CheckCircle, Shield,
// //     Hexagon, Mail
// // } from 'lucide-react';
// // import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
// // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // import { useStore } from '../../../store/useStore';
// // import { auth, db } from '../../../lib/firebase';
// // import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// // import './LearnerDashboard.css';

// // const LearnerDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const store = useStore();

// //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
// //         (location.state as any)?.activeTab || 'dashboard'
// //     );
// //     const [academicProfile, setAcademicProfile] = useState<any>(null);
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// //     const [isLoading, setIsLoading] = useState(true);

// //     useEffect(() => {
// //         setIsMobileMenuOpen(false);
// //     }, [currentNav]);

// //     // ─── REAL-TIME DATA SYNC ──────────────────────────────────────────────────
// //     useEffect(() => {
// //         store.fetchCohorts();
// //         store.fetchStaff();

// //         if (!store.user?.uid) return;

// //         const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));
// //         const unsubscribe = onSnapshot(q, snapshot => {
// //             if (!snapshot.empty) {
// //                 setAcademicProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
// //             }
// //             setIsLoading(false);
// //         }, err => {
// //             console.error('Error listening to learner profile:', err);
// //             setIsLoading(false);
// //         });

// //         return () => unsubscribe();
// //     }, [store.user?.uid]);

// //     const handleLogout = async () => {
// //         try {
// //             await signOut(auth);
// //             navigate('/login');
// //         }
// //         catch (error) {
// //             console.error('Logout failed', error);
// //         }
// //     };

// //     // ─── Derived data ─────────────────────────────────────────────────────────
// //     const myLearnerProfile = academicProfile || store.learners.find(l =>
// //         l.authUid === store.user?.uid || l.email === store.user?.email
// //     );

// //     const myCohorts = store.cohorts.filter(c =>
// //         c.id === myLearnerProfile?.cohortId ||
// //         c.learnerIds?.includes(myLearnerProfile?.id || '')
// //     );

// //     const getStaffName = (id: string) =>
// //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// //     const pageTitle =
// //         currentNav === 'dashboard' ? 'My Dashboard' :
// //             currentNav === 'certificates' ? 'My Certificates' :
// //                 'My Profile';

// //     const pageSub =
// //         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
// //             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
// //                 'Manage your personal details and account';

// //     // ─── Render ───────────────────────────────────────────────────────────────

// //     if (isLoading) {
// //         return (
// //             <div className="admin-layout learner-layout">
// //                 <div className="ld-loading">
// //                     <Hexagon size={48} className="ld-loading__icon" />
// //                     <span>Loading your dashboard...</span>
// //                 </div>
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="admin-layout learner-layout">

// //             {/* ── MOBILE HEADER ── */}
// //             <header className="ld-mobile-header">
// //                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// //                     <Menu size={22} />
// //                 </button>
// //                 <div className="ld-mobile-brand">
// //                     <span className="ld-mobile-brand__logo">mLab</span>
// //                     <span className="ld-mobile-brand__sub">Learner Portal</span>
// //                 </div>
// //             </header>

// //             {/* ── OVERLAY ── */}
// //             {isMobileMenuOpen && (
// //                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// //             )}

// //             {/* ── SIDEBAR ── */}
// //             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
// //                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// //                     <X size={22} />
// //                 </button>
// //                 <Sidebar
// //                     role={store.user?.role}
// //                     currentNav={currentNav}
// //                     setCurrentNav={setCurrentNav as any}
// //                     onLogout={handleLogout}
// //                 />
// //             </div>

// //             {/* ── MAIN PANE ── */}
// //             <main className="main-wrapper">
// //                 {/* Enhanced Page header */}
// //                 <div className="dashboard-header dashboard-header--enhanced">
// //                     <div className="header-title">
// //                         <div className="header-badge">
// //                             <Shield size={14} />
// //                             <span>Verified Account</span>
// //                         </div>
// //                         <h1>{pageTitle}</h1>
// //                         <p>{pageSub}</p>
// //                     </div>
// //                 </div>

// //                 <div className="admin-content">

// //                     {/* ── Dashboard Tab ──────────────────────────────────── */}
// //                     {currentNav === 'dashboard' && (
// //                         <div className="ld-animate">
// //                             {/* Stats Row */}
// //                             <div className="ld-stats-bar">
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--blue">
// //                                         <GraduationCap size={20} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">{myCohorts.length}</span>
// //                                         <span className="ld-stat__label">Active Programmes</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ld-stat-divider" />
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--green">
// //                                         <Award size={20} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">{myLearnerProfile?.certificates?.length || 0}</span>
// //                                         <span className="ld-stat__label">Certificates</span>
// //                                     </div>
// //                                 </div>
// //                                 <div className="ld-stat-divider" />
// //                                 <div className="ld-stat-item">
// //                                     <div className="ld-stat__icon ld-stat__icon--amber">
// //                                         <Clock size={20} />
// //                                     </div>
// //                                     <div className="ld-stat__info">
// //                                         <span className="ld-stat__value">On Track</span>
// //                                         <span className="ld-stat__label">Attendance</span>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             <h2 className="ld-section-title">
// //                                 <Layers size={18} /> Active Cohorts
// //                             </h2>

// //                             <div className="ld-cohort-grid">
// //                                 {myCohorts.map((cohort, index) => (
// //                                     <div
// //                                         key={cohort.id}
// //                                         className="ld-cohort-card"
// //                                         style={{ animationDelay: `${index * 0.1}s` }}
// //                                     >
// //                                         <div className="ld-cohort-card__header">
// //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// //                                             <span className="ld-badge ld-badge--active">Active</span>
// //                                         </div>

// //                                         <div className="ld-cohort-card__dates">
// //                                             <Calendar size={14} />
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
// //                                                 onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
// //                                             >
// //                                                 <span>Open Portfolio</span>
// //                                                 <ArrowRight size={16} />
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 ))}

// //                                 {myCohorts.length === 0 && (
// //                                     <div className="ld-empty">
// //                                         <div className="ld-empty__icon">
// //                                             <Layers size={40} strokeWidth={1.5} />
// //                                         </div>
// //                                         <span className="ld-empty__title">No Classes Found</span>
// //                                         <p className="ld-empty__desc">You haven't been assigned to a class yet. Contact your facilitator for assistance.</p>
// //                                         <button
// //                                             className="ld-btn ld-btn--ghost ld-btn--sm"
// //                                             onClick={() => window.location.href = 'mailto:support@mlab.co.za'}
// //                                         >
// //                                             <Mail size={14} />
// //                                             Contact Support
// //                                         </button>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}

// //                     {/* ── Profile Tab ──────────────────────────────────── */}
// //                     {currentNav === 'profile' && (
// //                         <LearnerProfileView
// //                             profile={myLearnerProfile}
// //                             user={store.user}
// //                             onUpdate={store.updateLearner}
// //                         />
// //                     )}

// //                     {/* ── Certificates Tab ─────────────────────────────── */}
// //                     {currentNav === 'certificates' && (
// //                         <div className="ld-animate">
// //                             <h2 className="ld-section-title">
// //                                 <Award size={18} /> Issued Certificates
// //                             </h2>

// //                             {(!myLearnerProfile?.certificates || myLearnerProfile.certificates.length === 0) ? (
// //                                 <div className="ld-empty ld-empty--large">
// //                                     <div className="ld-empty__icon">
// //                                         <Award size={48} strokeWidth={1} />
// //                                     </div>
// //                                     <span className="ld-empty__title">No Certificates Yet</span>
// //                                     <p className="ld-empty__desc">Certificates will appear here once issued by your administrator upon programme completion.</p>
// //                                 </div>
// //                             ) : (
// //                                 <div className="ld-cohort-grid">
// //                                     {[...myLearnerProfile.certificates].reverse().map((cert: any, index) => (
// //                                         <div
// //                                             key={cert.id}
// //                                             className="ld-cohort-card ld-cert-card"
// //                                             style={{ animationDelay: `${index * 0.1}s` }}
// //                                         >
// //                                             <div className="ld-cohort-card__header">
// //                                                 <div className="ld-cert-card__icon-wrap">
// //                                                     <Award size={20} />
// //                                                 </div>
// //                                                 <div className="ld-cert-card__title-group">
// //                                                     <h3 className="ld-cohort-card__name">Certificate of {cert.type}</h3>
// //                                                 </div>
// //                                                 <span className="ld-badge ld-badge--issued">Issued</span>
// //                                             </div>

// //                                             <div className="ld-cohort-card__roles">
// //                                                 <div className="ld-role-row">
// //                                                     <BookOpen size={14} />
// //                                                     <span className="ld-role-label">Programme</span>
// //                                                     <span className="ld-role-name">{cert.courseName}</span>
// //                                                 </div>
// //                                                 <div className="ld-role-row">
// //                                                     <Calendar size={14} />
// //                                                     <span className="ld-role-label">Issued</span>
// //                                                     <span className="ld-role-name">
// //                                                         {new Date(cert.issueDate).toLocaleDateString('en-ZA', {
// //                                                             day: 'numeric', month: 'long', year: 'numeric'
// //                                                         })}
// //                                                     </span>
// //                                                 </div>
// //                                                 <div className="ld-role-row">
// //                                                     <CheckCircle size={14} />
// //                                                     <span className="ld-role-label">Status</span>
// //                                                     <span className="ld-role-name ld-role-name--success">Valid & Verified</span>
// //                                                 </div>
// //                                             </div>

// //                                             <div className="ld-cohort-card__footer">
// //                                                 <button
// //                                                     className="ld-btn ld-btn--download"
// //                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
// //                                                 >
// //                                                     <Download size={16} />
// //                                                     <span>View & Download PDF</span>
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

// // // import React, { useEffect, useState } from 'react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import { signOut } from 'firebase/auth';
// // // import {
// // //     Layers, Calendar, ArrowRight, Menu, X, Award, Download,
// // //     GraduationCap, Clock, User, BookOpen, CheckCircle
// // // } from 'lucide-react';
// // // import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
// // // import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
// // // import { useStore } from '../../../store/useStore';
// // // import { auth, db } from '../../../lib/firebase';
// // // import { LearnerProfileView } from './LearnerProfileView/LearnerProfileView';
// // // import './LearnerDashboard.css';

// // // const LearnerDashboard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();
// // //     const store = useStore();

// // //     const [currentNav, setCurrentNav] = useState<'dashboard' | 'profile' | 'certificates'>(
// // //         (location.state as any)?.activeTab || 'dashboard'
// // //     );
// // //     const [academicProfile, setAcademicProfile] = useState<any>(null);
// // //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// // //     useEffect(() => {
// // //         setIsMobileMenuOpen(false);
// // //     }, [currentNav]);

// // //     // ─── REAL-TIME DATA SYNC ──────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         store.fetchCohorts();
// // //         store.fetchStaff();

// // //         if (!store.user?.uid) return;

// // //         const q = query(collection(db, 'learners'), where('authUid', '==', store.user.uid));
// // //         const unsubscribe = onSnapshot(q, snapshot => {
// // //             if (!snapshot.empty) {
// // //                 setAcademicProfile({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
// // //             }
// // //         }, err => console.error('Error listening to learner profile:', err));

// // //         return () => unsubscribe();
// // //     }, [store.user?.uid]);

// // //     const handleLogout = async () => {
// // //         try { await signOut(auth); navigate('/login'); }
// // //         catch (error) { console.error('Logout failed', error); }
// // //     };

// // //     // ─── Derived data ─────────────────────────────────────────────────────────
// // //     const myLearnerProfile = academicProfile || store.learners.find(l =>
// // //         l.authUid === store.user?.uid || l.email === store.user?.email
// // //     );

// // //     const myCohorts = store.cohorts.filter(c =>
// // //         c.id === myLearnerProfile?.cohortId ||
// // //         c.learnerIds?.includes(myLearnerProfile?.id || '')
// // //     );

// // //     const getStaffName = (id: string) =>
// // //         store.staff.find(s => s.id === id)?.fullName || 'Unassigned';

// // //     const pageTitle =
// // //         currentNav === 'dashboard' ? 'My Active Classes' :
// // //             currentNav === 'certificates' ? 'My Certificates' :
// // //                 'My Profile';

// // //     const pageSub =
// // //         currentNav === 'dashboard' ? `Welcome back, ${store.user?.fullName || 'Learner'}` :
// // //             currentNav === 'certificates' ? 'Official certificates issued to your profile' :
// // //                 'Manage your personal details and account';

// // //     // ─── Render ───────────────────────────────────────────────────────────────
// // //     return (
// // //         <div className="admin-layout learner-layout">

// // //             {/* ── MOBILE HEADER ── */}
// // //             <header className="ld-mobile-header">
// // //                 <button className="ld-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// // //                     <Menu size={22} />
// // //                 </button>
// // //                 <div className="ld-mobile-brand">
// // //                     <span className="ld-mobile-brand__logo">mLab</span>
// // //                     <span className="ld-mobile-brand__sub">Learner Portal</span>
// // //                 </div>
// // //             </header>

// // //             {/* ── OVERLAY ── */}
// // //             {isMobileMenuOpen && (
// // //                 <div className="ld-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// // //             )}

// // //             {/* ── SIDEBAR ── */}
// // //             <div className={`ld-sidebar-wrapper${isMobileMenuOpen ? ' open' : ''}`}>
// // //                 <button className="ld-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// // //                     <X size={22} />
// // //                 </button>
// // //                 <Sidebar
// // //                     role={store.user?.role}
// // //                     currentNav={currentNav}
// // //                     setCurrentNav={setCurrentNav as any}
// // //                     onLogout={handleLogout}
// // //                 />
// // //             </div>

// // //             {/* ── MAIN PANE ── */}
// // //             <main className="main-wrapper">
// // //                 {/* Page header */}
// // //                 <div className="dashboard-header">
// // //                     <div className="header-title">
// // //                         <h1>{pageTitle}</h1>
// // //                         <p>{pageSub}</p>
// // //                     </div>
// // //                 </div>

// // //                 <div className="admin-content">

// // //                     {/* ── Dashboard Tab ──────────────────────────────────── */}
// // //                     {currentNav === 'dashboard' && (
// // //                         <div className="ld-animate">
// // //                             <h2 className="ld-section-title">
// // //                                 <Layers size={16} /> Active Cohorts
// // //                             </h2>

// // //                             <div className="ld-cohort-grid">
// // //                                 {myCohorts.map(cohort => (
// // //                                     <div key={cohort.id} className="ld-cohort-card">
// // //                                         <div className="ld-cohort-card__header">
// // //                                             <h3 className="ld-cohort-card__name">{cohort.name}</h3>
// // //                                             <span className="ld-badge ld-badge--active">Active</span>
// // //                                         </div>

// // //                                         <div className="ld-cohort-card__dates">
// // //                                             <Calendar size={13} />
// // //                                             {cohort.startDate} — {cohort.endDate}
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
// // //                                                 onClick={() => navigate(`/portfolio/${myLearnerProfile?.id}`)}
// // //                                             >
// // //                                                 Open Portfolio <ArrowRight size={13} />
// // //                                             </button>
// // //                                         </div>
// // //                                     </div>
// // //                                 ))}

// // //                                 {myCohorts.length === 0 && (
// // //                                     <div className="ld-empty">
// // //                                         <div className="ld-empty__icon"><Layers size={36} /></div>
// // //                                         <span className="ld-empty__title">No Classes Found</span>
// // //                                         <p className="ld-empty__desc">You haven't been assigned to a class yet. Contact your facilitator for assistance.</p>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     {/* ── Profile Tab ──────────────────────────────────── */}
// // //                     {currentNav === 'profile' && (
// // //                         <LearnerProfileView
// // //                             profile={myLearnerProfile}
// // //                             user={store.user}
// // //                             onUpdate={store.updateLearner}
// // //                         />
// // //                     )}

// // //                     {/* ── Certificates Tab ─────────────────────────────── */}
// // //                     {currentNav === 'certificates' && (
// // //                         <div className="ld-animate">
// // //                             <h2 className="ld-section-title">
// // //                                 <Award size={16} /> Issued Certificates
// // //                             </h2>

// // //                             {(!myLearnerProfile?.certificates || myLearnerProfile.certificates.length === 0) ? (
// // //                                 <div className="ld-empty">
// // //                                     <div className="ld-empty__icon"><Award size={36} /></div>
// // //                                     <span className="ld-empty__title">No Certificates Yet</span>
// // //                                     <p className="ld-empty__desc">Certificates will appear here once issued by your administrator upon programme completion.</p>
// // //                                 </div>
// // //                             ) : (
// // //                                 <div className="ld-cohort-grid">
// // //                                     {[...myLearnerProfile.certificates].reverse().map((cert: any) => (
// // //                                         <div key={cert.id} className="ld-cohort-card ld-cert-card">
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
// // //                                                             day: 'numeric', month: 'long', year: 'numeric'
// // //                                                         })}
// // //                                                     </span>
// // //                                                 </div>
// // //                                             </div>

// // //                                             <div className="ld-cohort-card__footer">
// // //                                                 <button
// // //                                                     className="ld-btn ld-btn--download"
// // //                                                     onClick={() => window.open(cert.pdfUrl, '_blank')}
// // //                                                 >
// // //                                                     <Download size={14} /> View &amp; Download PDF
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