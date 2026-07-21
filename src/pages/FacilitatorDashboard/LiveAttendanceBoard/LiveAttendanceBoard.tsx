// src/pages/FacilitatorDashboard/LiveAttendanceBoard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    collection, query, where, onSnapshot, addDoc, serverTimestamp,
    writeBatch, doc, getDocs, increment, updateDoc, getDoc
} from 'firebase/firestore';
import {
    ChevronLeft, Users, UserCheck, Search,
    ShieldAlert, Calendar, Home, Coffee, AlertTriangle, X, FileSignature, UserX,
    Clock, Edit3, Loader2, Save
} from 'lucide-react';
import moment from 'moment';

import { useStore } from '../../../store/useStore';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { NotificationBell } from '../../../components/common/NotificationBell/NotificationBell';

import '../../CohortDetails/CohortDetailsPage.css';

export const LiveAttendanceBoard: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();

    const urlParams = new URLSearchParams(location.search);
    const cohortId = urlParams.get('cohort');

    const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [liveScans, setLiveScans] = useState<any[]>([]);
    const [isInitializing, setIsInitializing] = useState(true);
    const [isFinalizing, setIsFinalizing] = useState(false);

    // ─── MODAL STATES ───
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [earlyClosureReason, setEarlyClosureReason] = useState('');

    const [scanToEdit, setScanToEdit] = useState<any | null>(null);
    const [newTimeInput, setNewTimeInput] = useState<string>('');
    const [lunchOutInput, setLunchOutInput] = useState<string>('');
    const [lunchInInput, setLunchInInput] = useState<string>('');
    const [isUpdatingTime, setIsUpdatingTime] = useState(false);

    // Closure State Management
    const [holidays, setHolidays] = useState<string[]>([]);
    const [bypassClosure, setBypassClosure] = useState(false);

    // DYNAMIC CHECKOUT FALLBACK TIME
    const [checkoutFallbackTime, setCheckoutFallbackTime] = useState("16:00");

    const todayString = moment().format('YYYY-MM-DD');
    const currentCohort = cohorts.find(c => c.id === cohortId);

    // 1. Load Data, Holidays, & Campus Settings
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

        const fetchCampusSettings = async () => {
            try {
                const snap = await getDoc(doc(db, 'system_settings', 'global'));
                if (snap.exists()) {
                    const data = snap.data();
                    const allCampuses = data.campuses || [];
                    const cohortCampusId = currentCohort?.campusId;

                    const myCampus = allCampuses.find((c: any) => c.id === cohortCampusId)
                        || allCampuses.find((c: any) => c.isDefault)
                        || allCampuses[0];

                    if (myCampus?.campusTimes?.checkoutStart) {
                        setCheckoutFallbackTime(myCampus.campusTimes.checkoutStart);
                        console.log(`🛠️ Extracted Campus Checkout Rule: ${myCampus.campusTimes.checkoutStart}`);
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch settings, falling back to 16:00", e);
            }
        };

        fetchHolidays();
        if (currentCohort) fetchCampusSettings();

    }, [cohorts.length, learners.length, currentCohort, fetchCohorts, fetchLearners]);


    // 2. Build the exact roster (Deduplicated & Filtered for Active Only)
    const roster = useMemo(() => {
        if (!currentCohort || learners.length === 0) return [];

        const uniqueMap = new Map<string, any>();
        learners.forEach(l => {
            // 🚀 SECURE: Immediately ignore learners who have officially dropped out
            if (l.status === 'dropped') return;

            if (currentCohort.learnerIds?.includes(l.id) || currentCohort.learnerIds?.includes(l.idNumber)) {
                const key = l.idNumber || l.id;
                if (!uniqueMap.has(key) || !l.id.startsWith('Unassigned_')) {
                    uniqueMap.set(key, l);
                }
            }
        });
        return Array.from(uniqueMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName));
    }, [currentCohort, learners]);

    const absentLearnersList = useMemo(() => {
        const presentIds = liveScans.map(s => s.learnerId);
        return roster.filter(l => !presentIds.includes(l.id) && !presentIds.includes(l.idNumber));
    }, [roster, liveScans]);

    // 3. Real-time Firestore Listener
    useEffect(() => {
        if (!cohortId) return;

        const q = query(
            collection(db, 'live_attendance_scans'),
            where('cohortId', '==', cohortId),
            where('dateString', '==', todayString)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const scans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLiveScans(scans);
            setIsInitializing(false);
        }, (error) => {
            console.error("Real-time listener failed:", error);
            setIsInitializing(false);
        });

        return () => unsubscribe();
    }, [cohortId, todayString]);

    // 4. Manual Check-in Override
    const handleManualCheckIn = async (learner: any) => {
        const learnerIdToUse = learner.idNumber || learner.id;
        const alreadyPresent = liveScans.some(s => s.learnerId === learnerIdToUse);

        if (alreadyPresent) return;

        try {
            await addDoc(collection(db, 'live_attendance_scans'), {
                cohortId: cohortId,
                learnerId: learnerIdToUse,
                learnerName: learner.fullName || 'Unknown Learner',
                dateString: todayString,
                checkInAt: Date.now(),
                timestamp: serverTimestamp(),
                facilitatorId: user?.uid || 'admin',
                method: 'manual_override',
                checkInStatus: 'on-time'
            });
            toast.success(`${learner.fullName} checked in manually.`);
        } catch (error) {
            console.error("Failed to manual check-in:", error);
            toast.error("Failed to manually check in learner.");
        }
    };

    // 5. Adjust Check-In & Lunch Times
    const handleAdjustTime = async () => {
        if (!scanToEdit) return;
        setIsUpdatingTime(true);

        try {
            let newCheckInMs = scanToEdit.checkInAt;
            if (newTimeInput) {
                const [hours, minutes] = newTimeInput.split(':');
                newCheckInMs = moment().hours(Number(hours)).minutes(Number(minutes)).seconds(0).valueOf();
            }

            let newLunchOutMs = null;
            if (lunchOutInput) {
                const [outH, outM] = lunchOutInput.split(':');
                newLunchOutMs = moment().hours(Number(outH)).minutes(Number(outM)).seconds(0).valueOf();
            }

            let newLunchInMs = null;
            if (lunchInInput) {
                const [inH, inM] = lunchInInput.split(':');
                newLunchInMs = moment().hours(Number(inH)).minutes(Number(inM)).seconds(0).valueOf();
            }

            await updateDoc(doc(db, 'live_attendance_scans', scanToEdit.id), {
                checkInAt: newCheckInMs,
                lunchOutAt: newLunchOutMs,
                lunchInAt: newLunchInMs,
                method: 'manual_adjusted',
                adjustedBy: user?.uid || 'admin'
            });

            toast.success("Time logs updated successfully!");
            setScanToEdit(null);
        } catch (error) {
            console.error("Failed to update time:", error);
            toast.error("Failed to update times.");
        } finally {
            setIsUpdatingTime(false);
        }
    };

    const openAdjustTimeModal = (scan: any, learnerName: string) => {
        setScanToEdit({ ...scan, learnerName });
        setNewTimeInput(scan.checkInAt ? moment(scan.checkInAt).format('HH:mm') : '');
        setLunchOutInput(scan.lunchOutAt ? moment(scan.lunchOutAt).format('HH:mm') : '');
        setLunchInInput(scan.lunchInAt ? moment(scan.lunchInAt).format('HH:mm') : '');
    };

    // 6. FINALIZE & CLOSE DAY LOGIC (DIRECT ID NUMBER MAPPING)
    const handleInitiateFinalize = () => {
        setShowReviewModal(true);
    };

    const executeFinalize = async () => {
        if (!currentCohort || !cohortId) return;

        setIsFinalizing(true);

        try {
            const batch = writeBatch(db);

            const q = query(
                collection(db, 'live_attendance_scans'),
                where('cohortId', '==', cohortId),
                where('dateString', '==', todayString)
            );
            const liveSnap = await getDocs(q);

            const [fallbackH, fallbackM] = checkoutFallbackTime.split(':').map(Number);
            const getMs = (val: any) => {
                if (!val) return null;
                if (val.toMillis) return val.toMillis();
                if (typeof val === 'number') return val;
                return new Date(val).getTime();
            };

            // GROUP MULTIPLE TAPS DIRECTLY BY LEARNER ID (ID Number)
            const groupedScans: Record<string, any[]> = {};
            liveSnap.docs.forEach(d => {
                const data = d.data();
                const lId = String(data.learnerId);

                if (!groupedScans[lId]) groupedScans[lId] = [];
                groupedScans[lId].push(data);
            });

            const scansMap: Record<string, any> = {};
            const presentLearnerIds = Object.keys(groupedScans);

            //  MAP TO 4-SLOT EXACT TIMESTAMPS
            presentLearnerIds.forEach(lId => {
                const userTaps = groupedScans[lId];

                // Sort chronologically
                userTaps.sort((a, b) => {
                    const tA = getMs(a.checkInAt) || getMs(a.timestamp) || 0;
                    const tB = getMs(b.checkInAt) || getMs(b.timestamp) || 0;
                    return tA - tB;
                });

                let checkInMs = null, lunchOutMs = null, lunchInMs = null, checkOutMs = null;

                if (userTaps.length === 1) {
                    checkInMs = getMs(userTaps[0].checkInAt) || getMs(userTaps[0].timestamp);
                    lunchOutMs = getMs(userTaps[0].lunchOutAt);
                    lunchInMs = getMs(userTaps[0].lunchInAt);
                    checkOutMs = getMs(userTaps[0].checkOutAt);
                } else if (userTaps.length > 1) {
                    checkInMs = getMs(userTaps[0].checkInAt) || getMs(userTaps[0].timestamp);
                    lunchOutMs = getMs(userTaps[1]?.checkInAt) || getMs(userTaps[1]?.timestamp) || getMs(userTaps[0].lunchOutAt);
                    lunchInMs = getMs(userTaps[2]?.checkInAt) || getMs(userTaps[2]?.timestamp) || getMs(userTaps[0].lunchInAt);
                    checkOutMs = getMs(userTaps[3]?.checkInAt) || getMs(userTaps[3]?.timestamp) || getMs(userTaps[0].checkOutAt);
                }

                scansMap[lId] = {
                    checkInAt: checkInMs,
                    lunchOutAt: lunchOutMs,
                    lunchInAt: lunchInMs,
                    checkOutAt: checkOutMs,
                };
            });

            // AUTO-IMPUTE MISSING CHECKOUTS
            presentLearnerIds.forEach(lId => {
                const scan = scansMap[lId];
                if (scan.checkInAt && !scan.checkOutAt) {
                    const outDate = new Date(scan.checkInAt);
                    outDate.setHours(fallbackH || 16, fallbackM || 0, 0, 0);
                    scan.checkOutAt = Math.max(outDate.getTime(), scan.checkInAt);
                }
            });

            const rosterIds = roster.map(l => l.idNumber || l.id);
            const absentLearnerIds = rosterIds.filter(id => !presentLearnerIds.includes(id));

            // SAVE THE FINALIZED REGISTER
            const historyRef = doc(collection(db, 'attendance'));
            batch.set(historyRef, {
                cohortId: cohortId,
                cohortName: currentCohort.name,
                date: todayString,
                facilitatorId: user?.uid || 'admin',
                presentLearners: presentLearnerIds,
                absentLearners: absentLearnerIds,
                reasons: {},
                proofs: {},
                scans: scansMap,
                earlyClosureReason: earlyClosureReason.trim() || null,
                finalizedAt: serverTimestamp(),
                method: 'manual_close'
            });

            // GAMIFICATION (Directly using ID Number as Document ID)
            presentLearnerIds.forEach((id: string) => {
                const learnerRef = doc(db, 'learners', id);
                batch.update(learnerRef, {
                    labHours: increment(8),
                    professionalismStreak: increment(1)
                });
            });

            absentLearnerIds.forEach((id: string) => {
                const learnerRef = doc(db, 'learners', id);
                batch.update(learnerRef, {
                    professionalismStreak: 0,
                    professionalismScore: increment(-5)
                });
            });

            liveSnap.docs.forEach(d => batch.delete(d.ref));

            await batch.commit();

            toast.success("Register locked and submitted successfully!");
            setShowReviewModal(false);
            navigate('/facilitator/attendance');

        } catch (error: any) {
            console.error("Finalization failed:", error);
            toast.error("Failed to close register. Please check your connection.");
            setIsFinalizing(false);
        }
    };

    const filteredRoster = roster.filter(l =>
        l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.idNumber.includes(searchTerm)
    );

    const presentCount = liveScans.length;
    const totalCount = roster.length;
    const progressPercent = totalCount === 0 ? 0 : Math.round((presentCount / totalCount) * 100);

    if (!cohortId) {
        return (
            <div className="animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', borderRadius: '12px', margin: '2rem auto', maxWidth: '800px' }}>
                <ShieldAlert size={64} color="var(--mlab-red)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ fontFamily: 'var(--font-heading)', color: '#0f172a' }}>Missing Cohort ID</h2>
                <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                    Please return to the dashboard and select a valid cohort to view live attendance.
                </p>
                <button onClick={() => navigate(-1)} className="cdp-btn cdp-btn--sky" style={{ margin: '0 auto' }}>
                    <ChevronLeft size={16} /> Return to Directory
                </button>
            </div>
        );
    }

    if (isInitializing || cohorts.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
                <Loader2 size={40} className="cdp-spinner" color="var(--mlab-blue)" />
            </div>
        );
    }

    if (!currentCohort) {
        return (
            <div className="animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', borderRadius: '12px', margin: '2rem auto', maxWidth: '800px' }}>
                <ShieldAlert size={64} color="var(--mlab-red)" style={{ margin: '0 auto 1rem' }} />
                <h2 style={{ fontFamily: 'var(--font-heading)', color: '#0f172a' }}>Cohort Not Found</h2>
                <p style={{ maxWidth: '400px', margin: '0.5rem auto 2rem', color: '#64748b' }}>
                    The cohort you are trying to view no longer exists or you do not have permission to view it.
                </p>
                <button onClick={() => navigate(-1)} className="cdp-btn cdp-btn--sky" style={{ margin: '0 auto' }}>
                    <ChevronLeft size={16} /> Return
                </button>
            </div>
        );
    }

    const isWeekend = moment().day() === 0 || moment().day() === 6;
    const isHoliday = holidays.includes(todayString);
    const recess = (currentCohort.recessPeriods || []).find((p: any) => moment(todayString).isBetween(p.start, p.end, 'day', '[]'));

    let closureReason = null;
    if (isHoliday) closureReason = "National Public Holiday";
    else if (isWeekend) closureReason = "Standard Weekend Closure";
    else if (recess) closureReason = `Scheduled Recess: ${recess.reason}`;

    if (closureReason && !bypassClosure) {
        return (
            <div className="animate-fade-in" style={{ padding: '4rem 2rem', border: '1px dashed #cbd5e1', background: 'white', textAlign: 'center', borderRadius: '12px', margin: '2rem auto', maxWidth: '800px' }}>
                <div style={{ marginBottom: 24, padding: 32, borderRadius: '50%', background: 'var(--mlab-light-blue)', display: 'inline-block' }}>
                    {closureReason.includes('Weekend') ? <Home size={64} color="var(--mlab-blue)" /> : <Coffee size={64} color="var(--mlab-blue)" />}
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '2rem' }}>Campus is Closed</h2>
                <p style={{ maxWidth: '450px', margin: '0.5rem auto 2rem', color: 'var(--mlab-grey)', fontSize: '1.1rem' }}>
                    Attendance tracking is disabled for today.<br />
                    <span style={{ color: 'var(--mlab-green)', fontWeight: 600 }}>Reason: {closureReason}</span>
                </p>

                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                    <button onClick={() => navigate(-1)} className="cdp-btn cdp-btn--outline">
                        <ChevronLeft size={16} /> Go Back
                    </button>
                    <button onClick={() => setBypassClosure(true)} className="cdp-btn" style={{ background: 'var(--mlab-red)', color: 'white', borderColor: 'var(--mlab-red)' }}>
                        <ShieldAlert size={16} /> Override & Open Register
                    </button>
                </div>
            </div>
        );
    }

    const currentHour = moment().hour();
    const isEarlyClosure = currentHour < 16;

    // ── MAIN RENDER ──
    return (
        <div className="animate-fade-in" style={{ width: '100%', display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

            {/* EDIT TIME MODAL WITH LUNCH LOGGING */}
            {scanToEdit && createPortal(
                <div className="lfm-overlay" style={{ zIndex: 99999 }}>
                    <div className="lfm-modal animate-slide-up" style={{ maxWidth: '500px', width: '90%' }}>
                        <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
                            <h2 className="lfm-header__title" style={{ color: 'white' }}>
                                <Clock size={18} color="var(--mlab-green)" /> Adjust Times
                            </h2>
                            <button className="lfm-close-btn" onClick={() => setScanToEdit(null)}>
                                <X size={20} color="white" />
                            </button>
                        </div>
                        <div className="lfm-body" style={{ padding: '1.5rem', background: '#f8fafc' }}>
                            <p style={{ margin: '0 0 1.5rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                Adjusting time logs for <strong>{scanToEdit.learnerName}</strong>.
                                The system will mark this as a manual override in the audit trail.
                            </p>
                            <div className="lfm-grid">
                                <div className="lfm-fg lfm-fg--full">
                                    <label>Campus Arrival Time</label>
                                    <input
                                        type="time"
                                        className="lfm-input bg-white"
                                        value={newTimeInput}
                                        onChange={(e) => setNewTimeInput(e.target.value)}
                                        style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}
                                    />
                                </div>
                                <div className="lfm-fg">
                                    <label>Lunch Out</label>
                                    <input
                                        type="time"
                                        className="lfm-input bg-white"
                                        value={lunchOutInput}
                                        onChange={(e) => setLunchOutInput(e.target.value)}
                                    />
                                </div>
                                <div className="lfm-fg">
                                    <label>Lunch In</label>
                                    <input
                                        type="time"
                                        className="lfm-input bg-white"
                                        value={lunchInInput}
                                        onChange={(e) => setLunchInInput(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button className="lfm-btn lfm-btn--ghost" onClick={() => setScanToEdit(null)}>Cancel</button>
                            <button className="lfm-btn lfm-btn--primary" onClick={handleAdjustTime} disabled={isUpdatingTime}>
                                {isUpdatingTime ? <Loader2 size={16} className="lfm-spin" /> : <Save size={16} />} Save Adjustments
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* REVIEW TIMESHEET MODAL */}
            {showReviewModal && createPortal(
                <div className="lfm-overlay" style={{ zIndex: 99999 }}>
                    <div className="lfm-modal animate-slide-up" style={{ maxWidth: '600px', width: '90%' }}>
                        <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
                            <h2 className="lfm-header__title" style={{ color: 'white' }}>
                                <FileSignature size={18} color="var(--mlab-green)" /> Review Daily Register
                            </h2>
                            <button className="lfm-close-btn" onClick={() => setShowReviewModal(false)}>
                                <X size={20} color="white" />
                            </button>
                        </div>
                        <div className="lfm-body" style={{ background: '#f8fafc', maxHeight: '70vh', overflowY: 'auto' }}>
                            <p style={{ color: '#475569', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                Please review the attendance summary before locking the register. Missing checkout times will automatically be saved as <strong>{checkoutFallbackTime}</strong> to preserve learner duration analytics.
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: '#dcfce7', padding: '8px', borderRadius: '50%' }}><UserCheck size={20} color="#16a34a" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Present</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d' }}>{presentCount}</div>
                                    </div>
                                </div>
                                <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: '#fee2e2', padding: '8px', borderRadius: '50%' }}><UserX size={20} color="#dc2626" /></div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#991b1b', textTransform: 'uppercase' }}>Absent</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#b91c1c' }}>{absentLearnersList.length}</div>
                                    </div>
                                </div>
                            </div>

                            {/* LIST OF ABSENTEES */}
                            {absentLearnersList.length > 0 && (
                                <div style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                                    <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', color: '#dc2626', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <AlertTriangle size={14} /> The following learners will be marked absent:
                                    </h4>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                        {absentLearnersList.map(l => (
                                            <span key={l.id} style={{ fontSize: '0.8rem', background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '2px 8px', borderRadius: '4px' }}>
                                                {l.fullName}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* EARLY CLOSURE WARNING */}
                            {isEarlyClosure && (
                                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '1rem', borderLeft: '4px solid #f59e0b' }}>
                                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Clock size={16} /> Early Campus Closure
                                    </h4>
                                    <p style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: '#92400e', lineHeight: 1.4 }}>
                                        It is currently before 4:00 PM. To comply with QCTO regulations, you must state a valid reason for dismissing the cohort early.
                                    </p>
                                    <textarea
                                        className="lfm-input"
                                        placeholder="e.g., Loadshedding Stage 6, Water outage, Event..."
                                        value={earlyClosureReason}
                                        onChange={e => setEarlyClosureReason(e.target.value)}
                                        style={{ minHeight: '80px', resize: 'vertical', background: 'white' }}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="lfm-footer" style={{ background: 'white' }}>
                            <button className="lfm-btn lfm-btn--ghost" onClick={() => setShowReviewModal(false)}>Continue Editing</button>
                            <button
                                className="lfm-btn lfm-btn--primary"
                                style={{ background: 'var(--mlab-blue)', borderColor: 'var(--mlab-blue)' }}
                                disabled={isFinalizing || (isEarlyClosure && earlyClosureReason.trim().length < 5)}
                                onClick={executeFinalize}
                            >
                                {isFinalizing ? <Loader2 size={16} className="lfm-spin" /> : <ShieldAlert size={16} />}
                                Lock Register & Submit
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── HEADER (Edge to Edge) ── */}
            <header className="cdp-header" style={{ borderRadius: 0, margin: 0, width: '100%' }}>
                <div className="cdp-header__left">
                    <button className="cdp-header__back" onClick={() => navigate(-1)}>
                        <ChevronLeft size={14} /> Back
                    </button>
                    <div className="cdp-header__eyebrow">
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--mlab-green)', display: 'inline-block', animation: 'cdp-fade 2s infinite alternate' }} />
                        Live Invigilator Board
                        {bypassClosure && (
                            <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 6px', borderRadius: '4px', border: '1px solid #fecaca', marginLeft: '6px' }}>
                                OVERRIDE ACTIVE
                            </span>
                        )}
                    </div>
                    <h1 className="cdp-header__title">{currentCohort.name}</h1>
                    <p className="cdp-header__sub">
                        <Calendar size={12} className="cdp-header__sub-icon" /> {moment().format('DD MMMM YYYY')}
                        <span className="cdp-header__status cdp-header__status--active" style={{ marginLeft: '8px' }}>Tracking Arrivals</span>
                    </p>
                </div>
                <div className="cdp-header__right">
                    <div className="cdp-header__actions">
                        <button onClick={handleInitiateFinalize} disabled={isFinalizing} className="cdp-btn cdp-btn--sky">
                            {isFinalizing ? <Loader2 size={14} className="cdp-spinner" /> : <FileSignature size={14} />} Review & Finalize Day
                        </button>
                    </div>
                    <NotificationBell />
                </div>
            </header>

            {/* ── CONTENT AREA (Safely Padded) ── */}
            <div style={{ padding: '2rem', maxWidth: '1600px', margin: '0 auto', width: '100%', flex: 1, boxSizing: 'border-box' }}>

                {/* ── STATS & PROGRESS ── */}
                <div className="cdp-stat-row" style={{ marginBottom: '1.5rem' }}>
                    <div className="cdp-stat-card cdp-stat-card--blue">
                        <div className="cdp-stat-card__icon"><Users size={20} /></div>
                        <div className="cdp-stat-card__body">
                            <span className="cdp-stat-card__value">{totalCount}</span>
                            <span className="cdp-stat-card__label">Total Roster</span>
                        </div>
                    </div>

                    <div className="cdp-stat-card cdp-stat-card--green">
                        <div className="cdp-stat-card__icon"><UserCheck size={20} /></div>
                        <div className="cdp-stat-card__body">
                            <span className="cdp-stat-card__value">{presentCount}</span>
                            <span className="cdp-stat-card__label">Checked In</span>
                        </div>
                    </div>

                    <div className="cdp-stat-card" style={{ flex: 2, borderTopColor: 'var(--mlab-border)', }}>
                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Arrival Progress</span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{progressPercent}%</span>
                            </div>
                            <div style={{ width: '100%', height: '8px', background: 'var(--mlab-bg)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--mlab-green)', width: `${progressPercent}%`, transition: 'width 0.5s ease-in-out' }} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── ROSTER TABLE ── */}
                <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent', }}>
                    <div className="vp-card" style={{ marginBottom: 0, }}>
                        <div className="vp-card-header" style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', borderRadius: '12px 12px 0 0' }}>
                            <div className="vp-card-title-group">
                                <Users size={18} color="var(--mlab-blue)" />
                                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                    Class Register
                                </h3>
                            </div>

                            <div className="mlab-search" style={{ minWidth: '250px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '6px', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Search size={16} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search learners to manually override..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8rem' }}
                                />
                            </div>
                        </div>

                        <div className="mlab-table-wrap">
                            <table className="mlab-table">
                                <thead>
                                    <tr>
                                        <th>Learner Details</th>
                                        <th>Time Logged</th>
                                        <th>Live Status</th>
                                        <th className="cdp-th--right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRoster.map(l => {
                                        // Find ALL scans for this learner today to properly evaluate their status
                                        const learnerTaps = liveScans.filter(s => s.learnerId === l.id || s.learnerId === l.idNumber);
                                        const isPresent = learnerTaps.length > 0;

                                        // Sort taps chronologically to find the newest action
                                        learnerTaps.sort((a, b) => {
                                            const tA = a.checkInAt || (a.timestamp?.toMillis ? a.timestamp.toMillis() : 0);
                                            const tB = b.checkInAt || (b.timestamp?.toMillis ? b.timestamp.toMillis() : 0);
                                            return tA - tB;
                                        });

                                        const firstTap = learnerTaps[0];
                                        const secondTap = learnerTaps[1];
                                        const thirdTap = learnerTaps[2];

                                        return (
                                            <tr key={l.id} style={{ background: isPresent ? 'var(--mlab-green-bg)' : 'transparent' }}>
                                                <td>
                                                    <div className="cdp-learner-cell">
                                                        <div className="cdp-learner-avatar" style={{ background: isPresent ? 'var(--mlab-white)' : 'var(--mlab-blue)', color: isPresent ? 'var(--mlab-green-dark)' : 'var(--mlab-white)', border: isPresent ? '1px solid var(--mlab-green)' : 'none' }}>
                                                            {l.fullName.charAt(0)}
                                                        </div>
                                                        <div className="cdp-learner-cell__info">
                                                            <span className="cdp-learner-cell__name">{l.fullName}</span>
                                                            <span className="cdp-learner-cell__id">{l.idNumber}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontWeight: 600, color: isPresent ? 'var(--mlab-midnight)' : 'var(--mlab-grey)' }}>
                                                            <strong style={{ opacity: 0.6, fontSize: '0.7rem' }}>IN:</strong> {isPresent ? moment(firstTap?.checkInAt || (firstTap?.timestamp?.toDate ? firstTap.timestamp.toDate() : firstTap?.timestamp)).format('HH:mm') : '—'}
                                                        </span>
                                                        {isPresent && learnerTaps.length > 1 && (
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                                                <strong style={{ opacity: 0.8, fontSize: '0.65rem' }}>LUNCH:</strong> {secondTap ? moment(secondTap.checkInAt || (secondTap.timestamp?.toDate ? secondTap.timestamp.toDate() : secondTap.timestamp)).format('HH:mm') : '--:--'} to {thirdTap ? moment(thirdTap.checkInAt || (thirdTap.timestamp?.toDate ? thirdTap.timestamp.toDate() : thirdTap.timestamp)).format('HH:mm') : '--:--'}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td>
                                                    {isPresent ? (
                                                        <span className="cdp-status-badge cdp-status-badge--active">Present</span>
                                                    ) : (
                                                        <span className="cdp-status-badge cdp-status-badge--dropped" style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1' }}>Pending</span>
                                                    )}
                                                </td>
                                                <td className="cdp-td--right">
                                                    {isPresent ? (
                                                        <button
                                                            className="cdp-btn cdp-btn--outline"
                                                            onClick={() => openAdjustTimeModal(firstTap, l.fullName)}
                                                            style={{ background: 'white' }}
                                                        >
                                                            <Edit3 size={12} /> Adjust Time
                                                        </button>
                                                    ) : (
                                                        <button
                                                            className="cdp-btn cdp-btn--sky"
                                                            onClick={() => handleManualCheckIn(l)}
                                                        >
                                                            <UserCheck size={12} /> Check In
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {filteredRoster.length === 0 && (
                                        <tr>
                                            <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                <Search size={32} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                                                No learners found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};