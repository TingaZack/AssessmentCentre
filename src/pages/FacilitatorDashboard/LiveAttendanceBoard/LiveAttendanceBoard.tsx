// src/pages/FacilitatorDashboard/LiveAttendanceBoard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { ChevronLeft, Users, UserCheck, CheckCircle, Search, ShieldAlert, Calendar, Home, Coffee } from 'lucide-react';
import moment from 'moment';

import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';

// 🚀 CSS IMPORTS
import '../../AdminDashboard/AdminDashboard.css';
import '../../../components/views/LearnersView/LearnersView.css';
import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';

export const LiveAttendanceBoard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();

    // Grab the cohort ID from the URL (?cohort=XYZ)
    const urlParams = new URLSearchParams(location.search);
    const cohortId = urlParams.get('cohort');

    const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [liveScans, setLiveScans] = useState<string[]>([]); // Array of learner IDs who are present
    const [isInitializing, setIsInitializing] = useState(true);

    // 🚀 NEW: Closure State Management
    const [holidays, setHolidays] = useState<string[]>([]);
    const [bypassClosure, setBypassClosure] = useState(false);

    const todayString = moment().format('YYYY-MM-DD');

    // 1. Load Data & Fetch Holidays
    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();

        const fetchHolidays = async () => {
            const currentYear = new Date().getFullYear();
            const cacheKey = `holidays_za_${currentYear}`;
            const cached = localStorage.getItem(cacheKey);

            if (cached) {
                setHolidays(JSON.parse(cached));
            } else {
                try {
                    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
                    if (res.ok) {
                        const data = await res.json();
                        const dateList = data.map((h: any) => h.date);
                        setHolidays(dateList);
                        localStorage.setItem(cacheKey, JSON.stringify(dateList));
                    }
                } catch (e) {
                    console.warn("Holiday API unreachable, bypassing holiday lock.");
                }
            }
        };

        fetchHolidays();
    }, [cohorts.length, learners.length, fetchCohorts, fetchLearners]);

    const currentCohort = cohorts.find(c => c.id === cohortId);

    // 2. Build the exact roster (Deduplicated)
    const roster = useMemo(() => {
        if (!currentCohort || learners.length === 0) return [];

        const uniqueMap = new Map<string, any>();
        learners.forEach(l => {
            if (currentCohort.learnerIds?.includes(l.id) || currentCohort.learnerIds?.includes(l.idNumber)) {
                const key = l.idNumber || l.id;
                if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
                    uniqueMap.set(key, l);
                }
            }
        });
        return Array.from(uniqueMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [currentCohort, learners]);

    // 3. 🚀 THE MAGIC: Real-time Firestore Listener 🚀
    useEffect(() => {
        if (!cohortId) return;

        const q = query(
            collection(db, 'live_attendance_scans'),
            where('cohortId', '==', cohortId),
            where('dateString', '==', todayString)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const checkedInIds = snapshot.docs.map(doc => doc.data().learnerId);
            setLiveScans([...new Set(checkedInIds)]);
            setIsInitializing(false);
        }, (error) => {
            console.error("Real-time listener failed:", error);
            setIsInitializing(false);
        });

        return () => unsubscribe();
    }, [cohortId, todayString]);

    // 4. Manual Check-in Override
    const handleManualCheckIn = async (learnerId: string) => {
        if (liveScans.includes(learnerId)) return;

        try {
            await addDoc(collection(db, 'live_attendance_scans'), {
                cohortId: cohortId,
                learnerId: learnerId,
                dateString: todayString,
                timestamp: serverTimestamp(),
                facilitatorId: user?.uid || 'admin',
                method: 'manual_override'
            });
        } catch (error) {
            console.error("Failed to manual check-in:", error);
            alert("Failed to manually check in learner.");
        }
    };

    const filteredRoster = roster.filter(l =>
        l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.idNumber.includes(searchTerm)
    );

    const presentCount = liveScans.length;
    const totalCount = roster.length;
    const progressPercent = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);

    // ── SAFELY HANDLE MISSING URL PARAMS ──
    if (!cohortId) {
        return (
            <div className="vp-empty-state vp-empty-state--large animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', marginTop: '2rem', borderRadius: '12px' }}>
                <ShieldAlert size={64} color="var(--mlab-red)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ fontFamily: 'var(--font-heading)', color: '#0f172a' }}>Missing Cohort ID</h2>
                <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                    Please return to the dashboard and select a valid cohort to view live attendance.
                </p>
                <button onClick={() => navigate(-1)} className="lfm-btn lfm-btn--primary" style={{ margin: '0 auto' }}>
                    <ChevronLeft size={16} /> Return to Directory
                </button>
            </div>
        );
    }

    if (isInitializing || cohorts.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <Loader message="Connecting to Live Board..." />
            </div>
        );
    }

    if (!currentCohort) {
        return (
            <div className="vp-empty-state vp-empty-state--large animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', marginTop: '2rem', borderRadius: '12px' }}>
                <ShieldAlert size={64} color="var(--mlab-red)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ fontFamily: 'var(--font-heading)', color: '#0f172a' }}>Cohort Not Found</h2>
                <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                    The cohort you are trying to view no longer exists or you do not have permission to view it.
                </p>
                <button onClick={() => navigate(-1)} className="lfm-btn lfm-btn--primary" style={{ margin: '0 auto' }}>
                    <ChevronLeft size={16} /> Return
                </button>
            </div>
        );
    }

    // ── 🚀 INDUSTRY LOGIC: CHECK FOR CLOSURES ──
    const isWeekend = moment().day() === 0 || moment().day() === 6;
    const isHoliday = holidays.includes(todayString);
    const recess = (currentCohort.recessPeriods || []).find((p: any) => moment(todayString).isBetween(p.start, p.end, 'day', '[]'));

    let closureReason = null;
    if (isHoliday) closureReason = "National Public Holiday";
    else if (isWeekend) closureReason = "Standard Weekend Closure";
    else if (recess) closureReason = `Scheduled Recess: ${recess.reason}`;

    // If campus is closed and facilitator hasn't bypassed it, show the lock screen
    if (closureReason && !bypassClosure) {
        return (
            <div className="vp-empty-state vp-empty-state--large animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', marginTop: '2rem', borderRadius: '12px' }}>
                <div style={{ marginBottom: 24, padding: 32, borderRadius: '50%', background: 'var(--mlab-light-blue)', display: 'inline-block' }}>
                    {closureReason.includes('Weekend') ? <Home size={64} color="var(--mlab-blue)" /> : <Coffee size={64} color="var(--mlab-blue)" />}
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '2rem' }}>Campus is Closed</h2>
                <p style={{ maxWidth: '450px', margin: '0.5rem auto 2rem', color: 'var(--mlab-grey)', fontSize: '1.1rem' }}>
                    Attendance tracking is disabled for today.<br />
                    <span style={{ color: 'var(--mlab-green)', fontWeight: 600 }}>Reason: {closureReason}</span>
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => navigate(-1)} className="lfm-btn lfm-btn--ghost">
                        <ChevronLeft size={16} /> Go Back
                    </button>
                    <button onClick={() => setBypassClosure(true)} className="lfm-btn lfm-btn--primary">
                        <ShieldAlert size={16} /> Override & Open Register
                    </button>
                </div>
            </div>
        );
    }


    // ── MAIN RENDER ──
    return (
        <div className="animate-fade-in" style={{ padding: '0 1rem 3rem 1rem', maxWidth: '1400px', margin: '0 auto' }}>

            {/* ── HEADER ── */}
            <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', paddingTop: '1rem' }}>
                <div className="header-title">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--mlab-green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mlab-green)' }}>
                            Live Invigilator Board • {moment().format('DD MMMM YYYY')}
                        </span>
                        {bypassClosure && (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', marginLeft: '10px', border: '1px solid #fecaca' }}>
                                EMERGENCY OVERRIDE ACTIVE
                            </span>
                        )}
                    </div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <button onClick={() => navigate(-1)} style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
                            <ChevronLeft size={20} color="var(--mlab-blue)" />
                        </button>
                        {currentCohort.name}
                    </h1>
                    <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0 44px' }}>Real-time class arrival tracking</p>
                </div>
            </header>

            <div className="admin-content">
                {/* ── STATS & PROGRESS (Using lfm panel styling) ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                    <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', borderLeftColor: 'var(--mlab-blue)', margin: 0 }}>
                        <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid var(--mlab-border)' }}><Users size={24} color="var(--mlab-blue)" /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Roster</p>
                            <h2 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '2rem' }}>{totalCount}</h2>
                        </div>
                    </div>

                    <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', background: 'var(--mlab-green-bg)', borderLeftColor: 'var(--mlab-green)', margin: 0 }}>
                        <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid #bbf7d0' }}><UserCheck size={24} color="var(--mlab-green-dark)" /></div>
                        <div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Checked In</p>
                            <h2 style={{ margin: 0, color: 'var(--mlab-green-dark)', fontSize: '2rem' }}>{presentCount}</h2>
                        </div>
                    </div>

                    <div className="lfm-flags-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--mlab-white)', margin: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Arrival Progress</span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{progressPercent}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: 'var(--mlab-green)', width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }} />
                        </div>
                    </div>
                </div>

                {/* ── TOOLBAR ── */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div className="lfm-fg" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
                        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)' }} />
                        <input
                            type="text"
                            className="lfm-input"
                            placeholder="Search learners to manually override..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '36px' }}
                        />
                    </div>
                </div>

                {/* ── LIVE ROSTER GRID ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
                    {filteredRoster.map(l => {
                        const isPresent = liveScans.includes(l.id) || liveScans.includes(l.idNumber);

                        return (
                            <div key={l.id} style={{
                                background: 'var(--mlab-white)',
                                border: '1px solid var(--mlab-border)',
                                borderLeft: `5px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-grey-lt)'}`,
                                padding: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.3s ease',
                                boxShadow: isPresent ? '0 4px 6px -1px rgba(148, 199, 61, 0.15)' : 'none',
                                backgroundColor: isPresent ? 'var(--mlab-green-bg)' : 'var(--mlab-white)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '40px', height: '40px',
                                        background: isPresent ? 'var(--mlab-white)' : 'var(--mlab-bg)',
                                        color: isPresent ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)',
                                        border: `1px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-border)'}`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 'bold', fontSize: '1.1rem', fontFamily: 'var(--font-heading)'
                                    }}>
                                        {l.fullName.charAt(0)}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>{l.fullName}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.idNumber}</div>
                                    </div>
                                </div>

                                {isPresent ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--mlab-green-dark)', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>
                                        <CheckCircle size={16} /> Present
                                    </div>
                                ) : (
                                    <button
                                        className="lfm-btn lfm-btn--ghost"
                                        onClick={() => handleManualCheckIn(l.idNumber || l.id)}
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem' }}
                                    >
                                        Check In
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {filteredRoster.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', border: '1px dashed var(--mlab-border)' }}>
                            No learners found matching your search.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// // // src/pages/FacilitatorDashboard/LiveAttendanceBoard.tsx

// // import React, { useState, useEffect, useMemo } from 'react';
// // import { useNavigate, useLocation } from 'react-router-dom';
// // import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
// // import { ChevronLeft, Users, UserCheck, CheckCircle, Search, ShieldAlert, Sidebar, Menu, X } from 'lucide-react';
// // import moment from 'moment';

// // // 🚀 IMPORTING THE STRICT DESIGN SYSTEM
// // // import '../../components/admin/LearnerFormModal.css';
// // import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// // import { useStore } from '../../../store/useStore';
// // import { auth, db } from '../../../lib/firebase';
// // import Loader from '../../../components/common/Loader/Loader';

// // // CSS Imports
// // // import '../AdminDashboard/AdminDashboard.css';
// // import '../../AdminDashboard/AdminDashboard.css'
// // // import '../../components/views/LearnersView/LearnersView.css';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';
// // // import '../../components/admin/LearnerFormModal.css'; // Mapped for the LFM card styles

// // export const LiveAttendanceBoard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const location = useLocation();

// //     // Grab the cohort ID from the URL (?cohort=XYZ)
// //     const urlParams = new URLSearchParams(location.search);
// //     const cohortId = urlParams.get('cohort');

// //     const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [liveScans, setLiveScans] = useState<string[]>([]); // Array of learner IDs who are present
// //     const [isInitializing, setIsInitializing] = useState(true);
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

// //     const todayString = moment().format('YYYY-MM-DD');

// //     // 1. Ensure global data is loaded
// //     useEffect(() => {
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //     }, [cohorts.length, learners.length, fetchCohorts, fetchLearners]);

// //     const currentCohort = cohorts.find(c => c.id === cohortId);

// //     // 2. Build the exact roster (Deduplicated)
// //     const roster = useMemo(() => {
// //         if (!currentCohort || learners.length === 0) return [];

// //         const uniqueMap = new Map<string, any>();
// //         learners.forEach(l => {
// //             if (currentCohort.learnerIds?.includes(l.id) || currentCohort.learnerIds?.includes(l.idNumber)) {
// //                 const key = l.idNumber || l.id;
// //                 if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
// //                     uniqueMap.set(key, l);
// //                 }
// //             }
// //         });
// //         return Array.from(uniqueMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
// //     }, [currentCohort, learners]);

// //     // 3. 🚀 THE MAGIC: Real-time Firestore Listener 🚀
// //     useEffect(() => {
// //         if (!cohortId) return;

// //         const q = query(
// //             collection(db, 'live_attendance_scans'),
// //             where('cohortId', '==', cohortId),
// //             where('dateString', '==', todayString)
// //         );

// //         // onSnapshot pushes data to the UI instantly whenever the database changes
// //         const unsubscribe = onSnapshot(q, (snapshot) => {
// //             const checkedInIds = snapshot.docs.map(doc => doc.data().learnerId);
// //             setLiveScans([...new Set(checkedInIds)]);
// //             setIsInitializing(false);
// //         }, (error) => {
// //             console.error("Real-time listener failed:", error);
// //             setIsInitializing(false);
// //         });

// //         // Cleanup listener when the facilitator leaves the page
// //         return () => unsubscribe();
// //     }, [cohortId, todayString]);

// //     // 4. Manual Check-in Override
// //     const handleManualCheckIn = async (learnerId: string) => {
// //         if (liveScans.includes(learnerId)) return;

// //         try {
// //             await addDoc(collection(db, 'live_attendance_scans'), {
// //                 cohortId: cohortId,
// //                 learnerId: learnerId,
// //                 dateString: todayString,
// //                 timestamp: serverTimestamp(),
// //                 facilitatorId: user?.uid || 'admin',
// //                 method: 'manual_override'
// //             });
// //         } catch (error) {
// //             console.error("Failed to manual check-in:", error);
// //             alert("Failed to manually check in learner.");
// //         }
// //     };

// //     const filteredRoster = roster.filter(l =>
// //         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// //         l.idNumber.includes(searchTerm)
// //     );

// //     const presentCount = liveScans.length;
// //     const totalCount = roster.length;
// //     const progressPercent = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);

// //     // Render loading or missing cohort states within the layout structure
// //     if (!cohortId || (!isInitializing && !currentCohort)) {
// //         return (
// //             <div className="admin-layout">
// //                 <Sidebar
// //                     role={user?.role}
// //                 // currentNav="attendance" 
// //                 // onLogout={() => signOut(auth).then(() => navigate('/login'))} 
// //                 />
// //                 <main className="main-wrapper" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
// //                     <div className="vp-empty-state vp-empty-state--large" style={{ padding: '3rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center' }}>
// //                         <ShieldAlert size={64} color="var(--mlab-red)" style={{ margin: '0 auto 1rem' }} />
// //                         <h2 style={{ marginTop: '1.5rem', color: '#0f172a' }}>Missing Cohort</h2>
// //                         <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
// //                             Please return to the dashboard and select a cohort to view live attendance.
// //                         </p>
// //                         <button onClick={() => navigate(-1)} className="mlab-btn mlab-btn--primary" style={{ margin: '0 auto' }}>
// //                             <ChevronLeft size={16} /> Return to Directory
// //                         </button>
// //                     </div>
// //                 </main>
// //             </div>
// //         );
// //     }

// //     if (isInitializing) {
// //         return (
// //             <div className="admin-layout" style={{ alignItems: 'center', justifyContent: 'center' }}>
// //                 <Loader message="Connecting to Live Board..." />
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="admin-layout">

// //             {/* Admin Mobile Header */}
// //             <div className="admin-mobile-header">
// //                 <div className="admin-mobile-header-left">
// //                     <button className="admin-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// //                         <Menu size={24} />
// //                     </button>
// //                     <div className="admin-mobile-title">Live Attendance</div>
// //                 </div>
// //                 <div className="admin-mobile-header-right">
// //                     <NotificationBell />
// //                 </div>
// //             </div>

// //             {/* Admin Sidebar & Overlay */}
// //             {isMobileMenuOpen && (
// //                 <div className="admin-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />
// //             )}

// //             <div className={`admin-sidebar-wrapper ${isMobileMenuOpen ? 'open' : ''}`}>
// //                 <button className="admin-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// //                     <X size={24} />
// //                 </button>
// //                 <Sidebar
// //                     role={user?.role}
// //                 // currentNav="attendance"
// //                 // onLogout={() => signOut(auth).then(() => navigate('/login'))}
// //                 />
// //             </div>

// //             {/* Main Content Wrapper */}
// //             <main className="main-wrapper" style={{ padding: 16, paddingBottom: '5%' }}>

// //                 {/* ── HEADER ── */}
// //                 <header className="dashboard-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
// //                     <div className="header-title">
// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
// //                             <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--mlab-green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
// //                             <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--mlab-green)' }}>
// //                                 Live Invigilator Board • {moment().format('DD MMMM YYYY')}
// //                             </span>
// //                         </div>
// //                         <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                             <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
// //                                 <ChevronLeft size={20} color="var(--mlab-blue)" />
// //                             </button>
// //                             {/* {currentCohort.name} */}
// //                             hello
// //                         </h1>
// //                         <p>Real-time class arrival tracking</p>
// //                     </div>

// //                     <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
// //                         <NotificationBell />
// //                     </div>
// //                 </header>

// //                 <div className="admin-content">
// //                     {/* ── STATS & PROGRESS (Using lfm panel styling) ── */}
// //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
// //                         <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', borderLeftColor: 'var(--mlab-blue)', margin: 0 }}>
// //                             <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid var(--mlab-border)' }}><Users size={24} color="var(--mlab-blue)" /></div>
// //                             <div>
// //                                 <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Roster</p>
// //                                 <h2 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '2rem' }}>{totalCount}</h2>
// //                             </div>
// //                         </div>

// //                         <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', background: 'var(--mlab-green-bg)', borderLeftColor: 'var(--mlab-green)', margin: 0 }}>
// //                             <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid #bbf7d0' }}><UserCheck size={24} color="var(--mlab-green-dark)" /></div>
// //                             <div>
// //                                 <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Checked In</p>
// //                                 <h2 style={{ margin: 0, color: 'var(--mlab-green-dark)', fontSize: '2rem' }}>{presentCount}</h2>
// //                             </div>
// //                         </div>

// //                         <div className="lfm-flags-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--mlab-white)', margin: 0 }}>
// //                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
// //                                 <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Arrival Progress</span>
// //                                 <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{progressPercent}%</span>
// //                             </div>
// //                             <div style={{ width: '100%', height: '8px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
// //                                 <div style={{ height: '100%', background: 'var(--mlab-green)', width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }} />
// //                             </div>
// //                         </div>
// //                     </div>

// //                     {/* ── TOOLBAR ── */}
// //                     <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
// //                         <div className="lfm-fg" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
// //                             <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)' }} />
// //                             <input
// //                                 type="text"
// //                                 className="lfm-input"
// //                                 placeholder="Search learners to manually override..."
// //                                 value={searchTerm}
// //                                 onChange={e => setSearchTerm(e.target.value)}
// //                                 style={{ paddingLeft: '36px' }}
// //                             />
// //                         </div>
// //                     </div>

// //                     {/* ── LIVE ROSTER GRID ── */}
// //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
// //                         {filteredRoster.map(l => {
// //                             const isPresent = liveScans.includes(l.id) || liveScans.includes(l.idNumber);

// //                             return (
// //                                 <div key={l.id} style={{
// //                                     background: 'var(--mlab-white)',
// //                                     border: '1px solid var(--mlab-border)',
// //                                     borderLeft: `5px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-grey-lt)'}`,
// //                                     padding: '1rem',
// //                                     display: 'flex',
// //                                     alignItems: 'center',
// //                                     justifyContent: 'space-between',
// //                                     transition: 'all 0.3s ease',
// //                                     boxShadow: isPresent ? '0 4px 6px -1px rgba(148, 199, 61, 0.15)' : 'none',
// //                                     backgroundColor: isPresent ? 'var(--mlab-green-bg)' : 'var(--mlab-white)'
// //                                 }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                         <div style={{
// //                                             width: '40px', height: '40px',
// //                                             background: isPresent ? 'var(--mlab-white)' : 'var(--mlab-bg)',
// //                                             color: isPresent ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)',
// //                                             border: `1px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-border)'}`,
// //                                             display: 'flex', alignItems: 'center', justifyContent: 'center',
// //                                             fontWeight: 'bold', fontSize: '1.1rem', fontFamily: 'var(--font-heading)'
// //                                         }}>
// //                                             {l.fullName.charAt(0)}
// //                                         </div>
// //                                         <div>
// //                                             <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>{l.fullName}</div>
// //                                             <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.idNumber}</div>
// //                                         </div>
// //                                     </div>

// //                                     {isPresent ? (
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--mlab-green-dark)', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>
// //                                             <CheckCircle size={16} /> Present
// //                                         </div>
// //                                     ) : (
// //                                         <button
// //                                             className="lfm-btn lfm-btn--ghost"
// //                                             onClick={() => handleManualCheckIn(l.idNumber || l.id)}
// //                                             style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem' }}
// //                                         >
// //                                             Check In
// //                                         </button>
// //                                     )}
// //                                 </div>
// //                             );
// //                         })}

// //                         {filteredRoster.length === 0 && (
// //                             <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', border: '1px dashed var(--mlab-border)' }}>
// //                                 No learners found matching your search.
// //                             </div>
// //                         )}
// //                     </div>
// //                 </div>
// //             </main>
// //         </div>
// //     );
// // };


// // src/pages/FacilitatorDashboard/LiveAttendanceBoard.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { useNavigate, useLocation } from 'react-router-dom';
// import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
// import { ChevronLeft, Users, UserCheck, CheckCircle, Search, ShieldAlert } from 'lucide-react';
// import moment from 'moment';

// // 🚀 IMPORTING THE STRICT DESIGN SYSTEM
// // import '../../components/admin/LearnerFormModal.css';
// import '../../../components/admin/LearnerFormModal/LearnerFormModal.css';
// import { useStore } from '../../../store/useStore';
// import { db } from '../../../lib/firebase';
// import Loader from '../../../components/common/Loader/Loader';

// export const LiveAttendanceBoard: React.FC = () => {
//     const navigate = useNavigate();
//     const location = useLocation();

//     // Grab the cohort ID from the URL (?cohort=XYZ)
//     const urlParams = new URLSearchParams(location.search);
//     const cohortId = urlParams.get('cohort');

//     const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

//     const [searchTerm, setSearchTerm] = useState('');
//     const [liveScans, setLiveScans] = useState<string[]>([]); // Array of learner IDs who are present
//     const [isInitializing, setIsInitializing] = useState(true);

//     const todayString = moment().format('YYYY-MM-DD');

//     // 1. Ensure global data is loaded
//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//     }, [cohorts.length, learners.length, fetchCohorts, fetchLearners]);

//     const currentCohort = cohorts.find(c => c.id === cohortId);

//     // 2. Build the exact roster (Deduplicated)
//     const roster = useMemo(() => {
//         if (!currentCohort || learners.length === 0) return [];

//         const uniqueMap = new Map<string, any>();
//         learners.forEach(l => {
//             if (currentCohort.learnerIds?.includes(l.id) || currentCohort.learnerIds?.includes(l.idNumber)) {
//                 const key = l.idNumber || l.id;
//                 if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
//                     uniqueMap.set(key, l);
//                 }
//             }
//         });
//         return Array.from(uniqueMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
//     }, [currentCohort, learners]);

//     // 3. 🚀 THE MAGIC: Real-time Firestore Listener 🚀
//     useEffect(() => {
//         if (!cohortId) return;

//         const q = query(
//             collection(db, 'live_attendance_scans'),
//             where('cohortId', '==', cohortId),
//             where('dateString', '==', todayString)
//         );

//         // onSnapshot pushes data to the UI instantly whenever the database changes
//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const checkedInIds = snapshot.docs.map(doc => doc.data().learnerId);
//             setLiveScans([...new Set(checkedInIds)]);
//             setIsInitializing(false);
//         }, (error) => {
//             console.error("Real-time listener failed:", error);
//             setIsInitializing(false);
//         });

//         // Cleanup listener when the facilitator leaves the page
//         return () => unsubscribe();
//     }, [cohortId, todayString]);

//     // 4. Manual Check-in Override
//     const handleManualCheckIn = async (learnerId: string) => {
//         if (liveScans.includes(learnerId)) return;

//         try {
//             await addDoc(collection(db, 'live_attendance_scans'), {
//                 cohortId: cohortId,
//                 learnerId: learnerId,
//                 dateString: todayString,
//                 timestamp: serverTimestamp(),
//                 facilitatorId: user?.uid || 'admin',
//                 method: 'manual_override'
//             });
//         } catch (error) {
//             console.error("Failed to manual check-in:", error);
//             alert("Failed to manually check in learner.");
//         }
//     };

//     const filteredRoster = roster.filter(l =>
//         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
//         l.idNumber.includes(searchTerm)
//     );

//     const presentCount = liveScans.length;
//     const totalCount = roster.length;
//     const progressPercent = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);

//     if (!cohortId) {
//         return (
//             <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--mlab-red)' }}>
//                 <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
//                 <h2 style={{ fontFamily: 'var(--font-heading)' }}>Missing Cohort</h2>
//                 <p>Please return to the dashboard and select a cohort to view live attendance.</p>
//                 <button className="lfm-btn lfm-btn--primary" onClick={() => navigate(-1)} style={{ margin: '2rem auto' }}>Go Back</button>
//             </div>
//         );
//     }

//     if (isInitializing || !currentCohort) {
//         return <div className="p-8"><Loader message="Connecting to Live Board..." /></div>;
//     }

//     return (
//         <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

//             {/* ── HEADER ── */}
//             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
//                 <div>
//                     <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                         <button onClick={() => navigate(-1)} style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', padding: '6px', cursor: 'pointer', display: 'flex' }}>
//                             <ChevronLeft size={20} color="var(--mlab-blue)" />
//                         </button>
//                         {currentCohort.name}
//                     </h1>
//                     <div className="lfm-section-hdr" style={{ margin: '12px 0 0 44px', borderBottom: 'none', paddingBottom: 0 }}>
//                         <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--mlab-green)', display: 'inline-block', animation: 'pulse 2s infinite' }} />
//                         Live Invigilator Board • {moment().format('DD MMMM YYYY')}
//                     </div>
//                 </div>
//             </div>

//             {/* ── STATS & PROGRESS (Using lfm panel styling) ── */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
//                 <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', borderLeftColor: 'var(--mlab-blue)' }}>
//                     <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid var(--mlab-border)' }}><Users size={24} color="var(--mlab-blue)" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Roster</p>
//                         <h2 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '2rem' }}>{totalCount}</h2>
//                     </div>
//                 </div>

//                 <div className="lfm-flags-panel" style={{ flexDirection: 'row', alignItems: 'center', gap: '1rem', background: 'var(--mlab-green-bg)', borderLeftColor: 'var(--mlab-green)' }}>
//                     <div style={{ background: 'var(--mlab-white)', padding: '1rem', border: '1px solid #bbf7d0' }}><UserCheck size={24} color="var(--mlab-green-dark)" /></div>
//                     <div>
//                         <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Checked In</p>
//                         <h2 style={{ margin: 0, color: 'var(--mlab-green-dark)', fontSize: '2rem' }}>{presentCount}</h2>
//                     </div>
//                 </div>

//                 <div className="lfm-flags-panel" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'var(--mlab-white)' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
//                         <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Arrival Progress</span>
//                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{progressPercent}%</span>
//                     </div>
//                     <div style={{ width: '100%', height: '8px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
//                         <div style={{ height: '100%', background: 'var(--mlab-green)', width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }} />
//                     </div>
//                 </div>
//             </div>

//             {/* ── TOOLBAR ── */}
//             <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
//                 <div className="lfm-fg" style={{ flex: 1, maxWidth: '400px', position: 'relative' }}>
//                     <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)' }} />
//                     <input
//                         type="text"
//                         className="lfm-input"
//                         placeholder="Search learners to manually override..."
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                         style={{ paddingLeft: '36px' }}
//                     />
//                 </div>
//             </div>

//             {/* ── LIVE ROSTER GRID ── */}
//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
//                 {filteredRoster.map(l => {
//                     const isPresent = liveScans.includes(l.id) || liveScans.includes(l.idNumber);

//                     return (
//                         <div key={l.id} style={{
//                             background: 'var(--mlab-white)',
//                             border: '1px solid var(--mlab-border)',
//                             borderLeft: `5px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-grey-lt)'}`,
//                             padding: '1rem',
//                             display: 'flex',
//                             alignItems: 'center',
//                             justifyContent: 'space-between',
//                             transition: 'all 0.3s ease',
//                             boxShadow: isPresent ? '0 4px 6px -1px rgba(148, 199, 61, 0.15)' : 'none',
//                             backgroundColor: isPresent ? 'var(--mlab-green-bg)' : 'var(--mlab-white)'
//                         }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                 <div style={{
//                                     width: '40px', height: '40px',
//                                     background: isPresent ? 'var(--mlab-white)' : 'var(--mlab-bg)',
//                                     color: isPresent ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)',
//                                     border: `1px solid ${isPresent ? 'var(--mlab-green)' : 'var(--mlab-border)'}`,
//                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
//                                     fontWeight: 'bold', fontSize: '1.1rem', fontFamily: 'var(--font-heading)'
//                                 }}>
//                                     {l.fullName.charAt(0)}
//                                 </div>
//                                 <div>
//                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)', fontSize: '0.95rem' }}>{l.fullName}</div>
//                                     <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.idNumber}</div>
//                                 </div>
//                             </div>

//                             {isPresent ? (
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--mlab-green-dark)', fontWeight: 'bold', fontSize: '0.85rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)', letterSpacing: '0.05em' }}>
//                                     <CheckCircle size={16} /> Present
//                                 </div>
//                             ) : (
//                                 <button
//                                     className="lfm-btn lfm-btn--ghost"
//                                     onClick={() => handleManualCheckIn(l.idNumber || l.id)}
//                                     style={{ padding: '0.4rem 0.8rem', fontSize: '0.65rem' }}
//                                 >
//                                     Check In
//                                 </button>
//                             )}
//                         </div>
//                     );
//                 })}

//                 {filteredRoster.length === 0 && (
//                     <div style={{ gridColumn: '1 / -1', padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', border: '1px dashed var(--mlab-border)' }}>
//                         No learners found matching your search.
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };


// // // // src/pages/FacilitatorDashboard/LiveAttendanceBoard.tsx

// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { useNavigate, useLocation } from 'react-router-dom';
// // // import { collection, query, where, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
// // // import { ChevronLeft, Users, UserCheck, CheckCircle, Search, ShieldAlert } from 'lucide-react';

// // // import moment from 'moment';
// // // import '../FacilitatorDashboard/FacilitatorDashboard.css';
// // // import { useStore } from '../../../store/useStore';
// // // import { db } from '../../../lib/firebase';
// // // import Loader from '../../../components/common/Loader/Loader';

// // // export const LiveAttendanceBoard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const location = useLocation();

// // //     // Grab the cohort ID from the URL (?cohort=XYZ)
// // //     const urlParams = new URLSearchParams(location.search);
// // //     const cohortId = urlParams.get('cohort');

// // //     const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [liveScans, setLiveScans] = useState<string[]>([]); // Array of learner IDs who are present
// // //     const [isInitializing, setIsInitializing] = useState(true);

// // //     const todayString = moment().format('YYYY-MM-DD');

// // //     // 1. Ensure global data is loaded
// // //     useEffect(() => {
// // //         if (cohorts.length === 0) fetchCohorts();
// // //         if (learners.length === 0) fetchLearners();
// // //     }, [cohorts.length, learners.length, fetchCohorts, fetchLearners]);

// // //     const currentCohort = cohorts.find(c => c.id === cohortId);

// // //     // 2. Build the exact roster (Deduplicated)
// // //     const roster = useMemo(() => {
// // //         if (!currentCohort || learners.length === 0) return [];

// // //         const uniqueMap = new Map<string, any>();
// // //         learners.forEach(l => {
// // //             if (currentCohort.learnerIds?.includes(l.id) || currentCohort.learnerIds?.includes(l.idNumber)) {
// // //                 const key = l.idNumber || l.id;
// // //                 if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
// // //                     uniqueMap.set(key, l);
// // //                 }
// // //             }
// // //         });
// // //         return Array.from(uniqueMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
// // //     }, [currentCohort, learners]);

// // //     // 3. 🚀 THE MAGIC: Real-time Firestore Listener 🚀
// // //     useEffect(() => {
// // //         if (!cohortId) return;

// // //         const q = query(
// // //             collection(db, 'live_attendance_scans'),
// // //             where('cohortId', '==', cohortId),
// // //             where('dateString', '==', todayString)
// // //         );

// // //         // onSnapshot pushes data to the UI instantly whenever the database changes!
// // //         const unsubscribe = onSnapshot(q, (snapshot) => {
// // //             const checkedInIds = snapshot.docs.map(doc => doc.data().learnerId);
// // //             setLiveScans([...new Set(checkedInIds)]);
// // //             setIsInitializing(false);
// // //         }, (error) => {
// // //             console.error("Real-time listener failed:", error);
// // //             setIsInitializing(false);
// // //         });

// // //         // Cleanup listener when the facilitator leaves the page
// // //         return () => unsubscribe();
// // //     }, [cohortId, todayString]);

// // //     // 4. Manual Check-in Override (If a learner's phone is dead)
// // //     const handleManualCheckIn = async (learnerId: string) => {
// // //         if (liveScans.includes(learnerId)) return; // Already checked in

// // //         try {
// // //             await addDoc(collection(db, 'live_attendance_scans'), {
// // //                 cohortId: cohortId,
// // //                 learnerId: learnerId,
// // //                 dateString: todayString,
// // //                 timestamp: serverTimestamp(),
// // //                 facilitatorId: user?.uid || 'admin',
// // //                 method: 'manual_override'
// // //             });
// // //             // Note: No state update needed here. The onSnapshot listener above 
// // //             // will automatically see the new database entry and turn the card green!
// // //         } catch (error) {
// // //             console.error("Failed to manual check-in:", error);
// // //             alert("Failed to manually check in learner.");
// // //         }
// // //     };

// // //     const filteredRoster = roster.filter(l =>
// // //         l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
// // //         l.idNumber.includes(searchTerm)
// // //     );

// // //     const presentCount = liveScans.length;
// // //     const totalCount = roster.length;
// // //     const progressPercent = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);

// // //     if (!cohortId) {
// // //         return (
// // //             <div style={{ padding: '4rem', textAlign: 'center', color: '#ef4444' }}>
// // //                 <ShieldAlert size={48} style={{ margin: '0 auto 1rem' }} />
// // //                 <h2>Missing Cohort</h2>
// // //                 <p>Please return to the dashboard and select a cohort to view live attendance.</p>
// // //                 <button className="mlab-btn mlab-btn--primary" onClick={() => navigate(-1)} style={{ margin: '2rem auto' }}>Go Back</button>
// // //             </div>
// // //         );
// // //     }

// // //     if (isInitializing || !currentCohort) {
// // //         return <div className="p-8"><Loader message="Connecting to Live Board..." /></div>;
// // //     }

// // //     return (
// // //         <div className="animate-fade-in" style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>

// // //             {/* ── HEADER ── */}
// // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
// // //                 <div>
// // //                     <h1 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                         <button onClick={() => navigate(-1)} style={{ background: '#f1f5f9', border: 'none', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex' }}>
// // //                             <ChevronLeft size={20} color="var(--mlab-blue)" />
// // //                         </button>
// // //                         {currentCohort.name}
// // //                     </h1>
// // //                     <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0 44px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
// // //                         Live Invigilator Board • {moment().format('DD MMMM YYYY')}
// // //                     </p>
// // //                 </div>
// // //             </div>

// // //             {/* ── STATS & PROGRESS ── */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
// // //                 <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                     <div style={{ background: '#f1f5f9', padding: '1rem', borderRadius: '50%' }}><Users size={24} color="var(--mlab-blue)" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Total Roster</p>
// // //                         <h2 style={{ margin: 0, color: 'var(--mlab-blue)' }}>{totalCount}</h2>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                     <div style={{ background: '#dcfce7', padding: '1rem', borderRadius: '50%' }}><UserCheck size={24} color="#16a34a" /></div>
// // //                     <div>
// // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Checked In</p>
// // //                         <h2 style={{ margin: 0, color: '#16a34a' }}>{presentCount}</h2>
// // //                     </div>
// // //                 </div>

// // //                 <div style={{ background: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
// // //                         <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Arrival Progress</span>
// // //                         <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{progressPercent}%</span>
// // //                     </div>
// // //                     <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
// // //                         <div style={{ height: '100%', background: '#22c55e', width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }} />
// // //                     </div>
// // //                 </div>
// // //             </div>

// // //             {/* ── TOOLBAR ── */}
// // //             <div className="mlab-toolbar" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
// // //                 <div className="mlab-search" style={{ flex: 1, maxWidth: '400px' }}>
// // //                     <Search size={18} color="var(--mlab-grey)" />
// // //                     <input
// // //                         type="text"
// // //                         placeholder="Search learners to manually override..."
// // //                         value={searchTerm}
// // //                         onChange={e => setSearchTerm(e.target.value)}
// // //                     />
// // //                 </div>
// // //             </div>

// // //             {/* ── LIVE ROSTER GRID ── */}
// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
// // //                 {filteredRoster.map(l => {
// // //                     const isPresent = liveScans.includes(l.id) || liveScans.includes(l.idNumber);

// // //                     return (
// // //                         <div key={l.id} style={{
// // //                             background: 'white',
// // //                             border: `2px solid ${isPresent ? '#22c55e' : 'var(--mlab-border)'}`,
// // //                             borderRadius: '12px',
// // //                             padding: '1rem',
// // //                             display: 'flex',
// // //                             alignItems: 'center',
// // //                             justifyContent: 'space-between',
// // //                             transition: 'all 0.3s ease',
// // //                             boxShadow: isPresent ? '0 4px 6px -1px rgba(34, 197, 94, 0.1)' : 'none'
// // //                         }}>
// // //                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                 <div style={{
// // //                                     width: '40px', height: '40px', borderRadius: '50%',
// // //                                     background: isPresent ? '#dcfce7' : '#f1f5f9',
// // //                                     color: isPresent ? '#166534' : '#64748b',
// // //                                     display: 'flex', alignItems: 'center', justifyContent: 'center',
// // //                                     fontWeight: 'bold', fontSize: '1.1rem'
// // //                                 }}>
// // //                                     {l.fullName.charAt(0)}
// // //                                 </div>
// // //                                 <div>
// // //                                     <div style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{l.fullName}</div>
// // //                                     <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{l.idNumber}</div>
// // //                                 </div>
// // //                             </div>

// // //                             {isPresent ? (
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 'bold', fontSize: '0.85rem' }}>
// // //                                     <CheckCircle size={16} /> Present
// // //                                 </div>
// // //                             ) : (
// // //                                 <button
// // //                                     className="mlab-btn mlab-btn--sm mlab-btn--outline"
// // //                                     onClick={() => handleManualCheckIn(l.idNumber || l.id)}
// // //                                 >
// // //                                     Check In
// // //                                 </button>
// // //                             )}
// // //                         </div>
// // //                     );
// // //                 })}
// // //             </div>
// // //         </div>
// // //     );
// // // };