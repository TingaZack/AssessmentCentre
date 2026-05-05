// src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    collection, query, where, getDocs, orderBy,
    doc, writeBatch, serverTimestamp, increment
} from 'firebase/firestore';
import {
    FileText, Calendar, ArrowRight, AlertTriangle, History,
    Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
    DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';
import moment from 'moment';
import '../../../components/views/LearnersView/LearnersView.css';
import './AttendanceHistoryList.css';
import { useStore } from '../../../store/useStore';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
import { useToast } from '../../../components/common/Toast/Toast';

// ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
let cachedHistory: any[] | null = null;

export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
    const navigate = useNavigate();
    const toast = useToast();

    // 🚀 ADMIN "GOD MODE" CHECK 🚀
    const user = useStore(s => s.user);
    const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

    // 🚀 COHORT SELECTOR LOGIC 🚀
    const allCohorts = useStore(s => s.cohorts) || [];
    const fetchCohorts = useStore(s => s.fetchCohorts);

    // 🚀 GUARANTEE COHORTS ARE LOADED INSTANTLY
    useEffect(() => {
        if (allCohorts.length === 0 && fetchCohorts) {
            fetchCohorts();
        }
    }, [allCohorts.length, fetchCohorts]);

    const availableCohorts = useMemo(() => {
        if (isAdmin) return allCohorts;
        return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
    }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

    // 🚀 Default to empty string ("All Cohorts")
    const [selectedCohortId, setSelectedCohortId] = useState<string>('');

    // 🚀 TIME MACHINE STATE 🚀
    const [reconcileDate, setReconcileDate] = useState<string>('');

    const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
    const leaveRequests = useStore(s => s.leaveRequests) || [];
    const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
    const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

    const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
    const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
    const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
    const [error, setError] = useState<string | null>(null);

    // 🚀 HOLIDAY CACHE FOR ANALYTICS 🚀
    const [holidays, setHolidays] = useState<string[]>([]);

    // 🚀 ADMIN LEAVES STATE 🚀
    const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
    const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

    // ─── REGISTERS FILTER STATE ───
    const [registerSearch, setRegisterSearch] = useState('');

    // ─── LEAVE REQUESTS FILTER STATE ───
    const [leaveSearch, setLeaveSearch] = useState('');
    const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
    const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

    // ─── MODAL STATE ───
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        confirmText?: string;
        onConfirm?: () => void;
        onCancel?: () => void;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    // ── Fetch Holidays on Mount ───────────────────────────────────────────────
    useEffect(() => {
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
                    console.warn("Holiday API unreachable for analytics.");
                }
            }
        };
        fetchHolidays();
    }, []);

    // ── Fetch registers ───────────────────────────────────────────────────────
    useEffect(() => {
        const fetchHistory = async () => {
            if (!isAdmin && !facilitatorId) return;

            if (cachedHistory === null) setLoadingRegisters(true);
            setError(null);

            try {
                let q;
                if (isAdmin) {
                    q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
                } else {
                    q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
                }

                const snap = await getDocs(q);
                const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                cachedHistory = fresh;
                setHistory(fresh);
            } catch (err: any) {
                console.error('Firestore Error:', err);
                setError(err.message);
            } finally {
                setLoadingRegisters(false);
            }
        };
        fetchHistory();
    }, [facilitatorId, isAdmin]);

    // ── Fetch leaves on tab change ────────────────────────────────────────────
    useEffect(() => {
        if (activeTab === 'leaves') {
            if (isAdmin) {
                setLoadingAdminLeaves(true);
                getDocs(collection(db, 'leave_requests')).then(snap => {
                    setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                }).finally(() => setLoadingAdminLeaves(false));
            } else if (facilitatorId && leaveRequests.length === 0) {
                fetchFacilitatorLeaveRequests(facilitatorId);
            }
        }
    }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

    const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
    const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

    // ── Register Filtering ────────────────────────────────────────────────────
    const filteredHistory = useMemo(() => {
        let data = history;
        if (selectedCohortId) {
            data = data.filter(r => r.cohortId === selectedCohortId);
        }
        if (registerSearch) {
            // Native date picker outputs exact YYYY-MM-DD
            data = data.filter(r => r.date === registerSearch);
        }
        return data;
    }, [history, registerSearch, selectedCohortId]);

    // ── 🚀 ANALYTICS: COHORT HEALTH MATH 🚀 ──────────────────────────────────
    const cohortStats = useMemo(() => {
        if (!selectedCohortId) return null;

        const cohort = availableCohorts.find(c => c.id === selectedCohortId);
        if (!cohort || !cohort.startDate || !cohort.endDate) return null;

        const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);

        let totalWeekdays = 0;
        let holidaysCount = 0;
        let recessCount = 0;

        const start = moment(cohort.startDate);
        const end = moment(cohort.endDate);
        const current = start.clone();

        // Calculate Term Metrics
        while (current.isSameOrBefore(end, 'day')) {
            const dayOfWeek = current.day();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Ignore Sat/Sun
                totalWeekdays++;
                const dateStr = current.format('YYYY-MM-DD');

                const isHoliday = holidays.includes(dateStr);
                const isRecess = (cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'));

                if (isHoliday) holidaysCount++;
                else if (isRecess) recessCount++;
            }
            current.add(1, 'day');
        }

        const netExpectedTermDays = totalWeekdays - holidaysCount - recessCount;
        const daysCompleted = cohortRegisters.length;

        // Calculate Average Attendance %
        let totalExpectedScans = 0;
        let totalPresentScans = 0;

        cohortRegisters.forEach(reg => {
            const present = reg.presentLearners?.length || 0;
            const absent = reg.absentLearners?.length || 0;
            const dailyTotal = present + absent || (cohort.learnerIds?.length || 0); // Fallback to roster size

            if (dailyTotal > 0) {
                totalExpectedScans += dailyTotal;
                totalPresentScans += present;
            }
        });

        const avgAttendanceRate = totalExpectedScans > 0
            ? Math.round((totalPresentScans / totalExpectedScans) * 100)
            : 0;

        return {
            netExpectedTermDays,
            daysCompleted,
            holidaysCount,
            recessCount,
            avgAttendanceRate
        };
    }, [selectedCohortId, availableCohorts, history, holidays]);

    // ── Leave Filtering ───────────────────────────────────────────────────────
    const filteredLeaves = useMemo(() => {
        return displayedLeavesData.filter(req => {
            const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
            const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
            const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
            return matchesSearch && matchesStatus && matchesType;
        });
    }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

    const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

    // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
    const todayString = moment().format('YYYY-MM-DD');
    const isFinalizedToday = selectedCohortId
        ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
        : false;

    // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
    const handleFinalizeRegister = async () => {
        if (!selectedCohortId) return;

        const currentCohort = availableCohorts.find(c => c.id === selectedCohortId);
        const cohortName = currentCohort?.name || 'this cohort';
        const rosterIds = currentCohort?.learnerIds || []; // Used to calculate absences

        setModalConfig({
            isOpen: true,
            type: 'warning',
            title: 'Finalize Attendance?',
            message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
            confirmText: 'Yes, Finalize & Close',
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                setLoadingRegisters(true);

                try {
                    // 1. Fetch ALL live scans for this cohort
                    const q = query(
                        collection(db, 'live_attendance_scans'),
                        where('cohortId', '==', selectedCohortId)
                    );
                    const liveSnap = await getDocs(q);

                    const batch = writeBatch(db);
                    const scansByDate: Record<string, any[]> = {};

                    // 2. Group the scans by date
                    liveSnap.docs.forEach(d => {
                        const data = d.data();
                        const date = data.dateString || todayString;
                        if (!scansByDate[date]) scansByDate[date] = [];
                        scansByDate[date].push({ ref: d.ref, ...data });
                    });

                    // 🚀 If nobody checked in at all today, we STILL must finalize TODAY
                    if (Object.keys(scansByDate).length === 0) {
                        scansByDate[todayString] = [];
                    }

                    // 3. Process each date group
                    for (const [scanDate, scans] of Object.entries(scansByDate)) {
                        // Deduplicate who was present
                        const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];

                        // 🚀 CALCULATE ABSENCES: Roster MINUS Present Learners
                        const absentLearnerIds = rosterIds.filter((id: string) => !presentLearnerIds.includes(id));

                        const historyRef = doc(collection(db, 'attendance'));

                        // Save the permanent record
                        batch.set(historyRef, {
                            cohortId: selectedCohortId,
                            cohortName: cohortName,
                            date: scanDate,
                            facilitatorId: facilitatorId || user?.uid || 'admin',
                            presentLearners: presentLearnerIds,
                            absentLearners: absentLearnerIds, // Explicitly save absentees
                            reasons: {}, // Initialize empty objects for the Time Machine
                            proofs: {},
                            finalizedAt: serverTimestamp(),
                            method: 'manual_close'
                        });

                        // 🚀 NEW: GAMIFICATION ENGINE - Grade the Learners! 🚀

                        // A. Reward Present Learners (+8 Lab Hours, +1 Streak)
                        presentLearnerIds.forEach((id: string) => {
                            const learnerRef = doc(db, 'learners', id);
                            batch.update(learnerRef, {
                                labHours: increment(8),
                                professionalismStreak: increment(1)
                            });
                        });

                        // B. Penalize Absent Learners (Reset Streak to 0, -5% Score)
                        absentLearnerIds.forEach((id: string) => {
                            const learnerRef = doc(db, 'learners', id);
                            batch.update(learnerRef, {
                                professionalismStreak: 0,
                                professionalismScore: increment(-5) // 5% penalty for unexcused absence
                            });
                        });

                        // Queue the live scans for deletion
                        scans.forEach(s => batch.delete(s.ref));
                    }

                    // 4. Commit transaction
                    await batch.commit();
                    toast.success(`Register for ${cohortName} finalized successfully.`);

                    // 5. Refresh local history
                    let freshQuery;
                    if (isAdmin) {
                        freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
                    } else {
                        freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
                    }
                    const freshSnap = await getDocs(freshQuery);
                    const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                    cachedHistory = freshData;
                    setHistory(freshData);

                } catch (err: any) {
                    console.error(err);
                    toast.error(err.message || "Failed to finalize register.");
                } finally {
                    setLoadingRegisters(false);
                }
            }
        });
    };

    const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
        setModalConfig({
            isOpen: true,
            type: status === 'Approved' ? 'success' : 'warning',
            title: `Confirm ${status}`,
            message: `Are you sure you want to mark this learner's leave request as ${status}?`,
            confirmText: `Yes, ${status}`,
            onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
            onConfirm: async () => {
                setModalConfig(prev => ({ ...prev, isOpen: false }));
                try {
                    await updateLeaveStatus(id, status);
                    if (isAdmin) {
                        setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
                    }
                    toast.success(`Leave request marked as ${status}.`);
                } catch (err) {
                    toast.error('Failed to update the leave status. Please check your connection and try again.');
                }
            }
        });
    };

    if (loadingRegisters || (!isAdmin && !facilitatorId)) {
        return (
            <div className="att-loader-wrap">
                <Loader message="Loading Dashboard…" />
            </div>
        );
    }

    return (
        <div className="att-root animate-fade-in">
            {modalConfig.isOpen && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type={modalConfig.type}
                        title={modalConfig.title}
                        message={modalConfig.message}
                        confirmText={modalConfig.confirmText}
                        onClose={() => {
                            if (modalConfig.onConfirm) modalConfig.onConfirm();
                            else setModalConfig(p => ({ ...p, isOpen: false }));
                        }}
                        onCancel={modalConfig.onCancel}
                    />
                </div>,
                document.body
            )}

            <div className="att-tabs" role="tablist">
                <button
                    role="tab"
                    aria-selected={activeTab === 'registers'}
                    className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
                    onClick={() => setActiveTab('registers')}
                >
                    <History size={14} /> Past Registers
                </button>
                <button
                    role="tab"
                    aria-selected={activeTab === 'leaves'}
                    className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
                    onClick={() => setActiveTab('leaves')}
                >
                    <FileText size={14} /> Leave Requests
                    {pendingLeaveCount > 0 && (
                        <span className="att-pending-badge">{pendingLeaveCount} New</span>
                    )}
                </button>
            </div>

            {error && (
                <div className="att-error">
                    <div className="att-error__title">
                        <AlertTriangle size={15} /> Database Sync Error
                    </div>
                    <p className="att-error__body">{error}</p>
                </div>
            )}

            {activeTab === 'registers' && (
                <>
                    <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>

                            {/* 🚀 BEAUTIFUL DATE FILTER INPUT 🚀 */}
                            <div className="mlab-search" style={{
                                minWidth: '250px', maxWidth: '350px', display: 'flex',
                                alignItems: 'center', gap: '8px', padding: '4px 12px',
                                background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '8px',
                                height: 35
                            }}>
                                <Calendar size={18} color="var(--mlab-grey)" />
                                <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                    Filter Date:
                                </span>
                                <input
                                    type="date"
                                    value={registerSearch}
                                    onChange={e => setRegisterSearch(e.target.value)}
                                    style={{
                                        border: 'none', background: 'transparent', outline: 'none',
                                        color: 'var(--mlab-blue)', fontWeight: 600, flex: 1, cursor: 'pointer'
                                    }}
                                />
                                {registerSearch && (
                                    <button
                                        onClick={() => setRegisterSearch('')}
                                        title="Clear Date Filter"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                                    >
                                        <XCircle size={16} color="#ef4444" />
                                    </button>
                                )}
                            </div>

                        </div>

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <select
                                value={selectedCohortId}
                                onChange={(e) => setSelectedCohortId(e.target.value)}
                                style={{
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--mlab-border)',
                                    background: 'white',
                                    fontFamily: 'var(--font-body)',
                                    color: 'var(--mlab-blue)',
                                    fontWeight: 600,
                                    maxWidth: '220px'
                                }}
                            >
                                <option value="">All Cohorts</option>
                                {availableCohorts.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
                                    </option>
                                ))}
                            </select>

                            {/* 🚀 TIME MACHINE WIDGET 🚀 */}
                            {selectedCohortId && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: '#f1f5f9', padding: '4px 8px',
                                    borderRadius: '8px', border: '1px solid #cbd5e1'
                                }}>
                                    <History size={16} color="var(--mlab-grey)" />
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Time Machine:
                                    </span>
                                    <input
                                        type="date"
                                        max={moment().subtract(1, 'days').format('YYYY-MM-DD')} // Restrict to past dates
                                        value={reconcileDate}
                                        onChange={e => setReconcileDate(e.target.value)}
                                        style={{
                                            border: 'none', background: 'transparent', outline: 'none',
                                            fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                        title="Select a past date to backdate or edit attendance"
                                    />
                                    <button
                                        className="mlab-btn mlab-btn--sm"
                                        disabled={!reconcileDate}
                                        onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)}
                                        style={{
                                            background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1',
                                            color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem'
                                        }}
                                        title="Reconcile attendance for this past date"
                                    >
                                        Reconcile
                                    </button>
                                </div>
                            )}

                            <button
                                className="mlab-btn mlab-btn--outline"
                                onClick={() => {
                                    const encodedAuth = btoa(JSON.stringify({
                                        fid: facilitatorId || user?.uid || 'admin',
                                        cid: selectedCohortId
                                    }));
                                    const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
                                    window.open(url, '_blank');
                                }}
                                style={{
                                    whiteSpace: 'nowrap',
                                    borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
                                    color: isFinalizedToday ? '#94a3b8' : 'inherit',
                                    cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
                                }}
                                disabled={!selectedCohortId || isFinalizedToday}
                                title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
                            >
                                <Calendar size={16} /> Launch TV Kiosk
                            </button>

                            <button
                                className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
                                onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
                                style={{ whiteSpace: 'nowrap' }}
                                disabled={!selectedCohortId}
                                title={!selectedCohortId ? "Select a specific cohort to view" : ""}
                            >
                                <Clock size={16} /> Live Dashboard
                            </button>

                            {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
                            {selectedCohortId && (
                                <button
                                    className="mlab-btn"
                                    onClick={handleFinalizeRegister}
                                    disabled={isFinalizedToday}
                                    style={{
                                        whiteSpace: 'nowrap',
                                        borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
                                        color: isFinalizedToday ? '#94a3b8' : '#ef4444',
                                        background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
                                        borderWidth: '1px',
                                        borderStyle: 'solid',
                                        cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
                                    }}
                                    title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
                                >
                                    <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
                                </button>
                            )}

                            <button
                                className="mlab-btn mlab-btn--primary"
                                onClick={() => navigate('/facilitator/attendance/scanner')}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <ScanLine size={16} /> Scan Attendance
                            </button>
                        </div>
                    </div>

                    {/* 🚀 TERM ANALYTICS PANEL (Appears when Cohort Selected) 🚀 */}
                    {selectedCohortId && cohortStats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Target size={24} color="var(--mlab-blue)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Progress</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
                                        {cohortStats.daysCompleted} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>/ {cohortStats.netExpectedTermDays} Days</span>
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Attendance</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
                                        {cohortStats.avgAttendanceRate}%
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Coffee size={24} color="#d97706" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excluded Days</p>
                                    <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem' }}>
                                        {cohortStats.holidaysCount + cohortStats.recessCount} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Off</span>
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                        {cohortStats.holidaysCount} Holidays • {cohortStats.recessCount} Recess
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Date Recorded</th>
                                    {isAdmin && <th>Cohort</th>}
                                    <th>Attendance</th>
                                    <th>Proofs</th>
                                    <th className="att-th--right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredHistory.length > 0 ? filteredHistory.map(record => {
                                    const proofCount = Object.keys(record.proofs || {}).length;
                                    const presentCount = record.presentLearners?.length || 0;

                                    // 🚀 FIX: Grab the saved name first, then fallback to the lookup, then fallback to Unknown
                                    const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

                                    return (
                                        <tr key={record.id}>
                                            <td>
                                                <div className="att-date-cell">
                                                    <Calendar size={14} className="att-date-cell__icon" />
                                                    <span className="att-date-cell__label">
                                                        {moment(record.date).format('DD MMM YYYY')}
                                                    </span>
                                                </div>
                                            </td>
                                            {isAdmin && (
                                                <td>
                                                    <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                                        {cohortName}
                                                    </span>
                                                </td>
                                            )}
                                            <td>
                                                <span className="att-badge att-badge--present">
                                                    <Users size={11} /> {presentCount} Present
                                                </span>
                                            </td>
                                            <td>
                                                {proofCount > 0 ? (
                                                    <span className="att-badge att-badge--proof">
                                                        <FileText size={11} /> {proofCount} Attached
                                                    </span>
                                                ) : (
                                                    <span className="att-no-data">None</span>
                                                )}
                                            </td>
                                            <td className="att-td--right">
                                                <button
                                                    className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
                                                    onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
                                                >
                                                    Open Register <ArrowRight size={13} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
                                            {history.length === 0 ? (
                                                <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                                    <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                                    <p className="mlab-empty__title">No Records Yet</p>
                                                    <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
                                                </div>
                                            ) : (
                                                <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                                    <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                                    <p className="mlab-empty__title">No matches found</p>
                                                    <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
                                                    <button
                                                        className="mlab-btn mlab-btn--outline"
                                                        onClick={() => setRegisterSearch('')}
                                                        style={{ marginTop: '1rem' }}
                                                    >
                                                        Clear Search
                                                    </button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'leaves' && (
                <>
                    <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div className="mlab-search" style={{ minWidth: '220px' }}>
                                <Search size={18} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by learner name..."
                                    value={leaveSearch}
                                    onChange={e => setLeaveSearch(e.target.value)}
                                />
                            </div>

                            <div className="mlab-select-wrap">
                                <Filter size={16} color="var(--mlab-grey)" />
                                <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
                                    <option value="all">All Statuses</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Declined">Declined</option>
                                </select>
                            </div>

                            <div className="mlab-select-wrap">
                                <Filter size={16} color="var(--mlab-grey)" />
                                <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
                                    <option value="all">All Reasons</option>
                                    <option value="Sick Leave">Sick Leave</option>
                                    <option value="Personal Emergency">Personal Emergency</option>
                                    <option value="Interview">Interview</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="mlab-table-wrap">
                        {isLeavesLoading ? (
                            <div className="att-loader-wrap att-loader-wrap--inline">
                                <Loader message="Fetching requests…" />
                            </div>
                        ) : (
                            <table className="mlab-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '15%' }}>Learner</th>
                                        <th style={{ width: '15%' }}>Date(s) Affected</th>
                                        <th>Reason</th>
                                        <th>Attachment</th>
                                        <th>Status</th>
                                        <th className="att-th--right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
                                        const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
                                        const start = parseDate(req.startDate || req.dateAffected);
                                        const end = parseDate(req.endDate || req.dateAffected);
                                        const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
                                        const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
                                        const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

                                        return (
                                            <tr key={req.id}>
                                                <td>
                                                    <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
                                                </td>

                                                <td>
                                                    <div className="att-dates-cell">
                                                        <div className="att-dates-cell__start">
                                                            <Calendar size={13} className="att-dates-cell__icon" />
                                                            <span className="att-dates-cell__label">{fmtStart}</span>
                                                        </div>
                                                        {!isSameDay && (
                                                            <div className="att-dates-cell__end">
                                                                <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
                                                                <span className="att-dates-cell__label--end">{fmtEnd}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                <td>
                                                    <div className="att-reason-cell">
                                                        <span className="att-reason-cell__type">{req.type}</span>
                                                        <span className="att-reason-cell__quote">"{req.reason}"</span>
                                                    </div>
                                                </td>

                                                <td>
                                                    {req.attachmentUrl ? (
                                                        <a
                                                            href={req.attachmentUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="att-attach-link"
                                                            title={req.attachmentName || 'Download Document'}
                                                        >
                                                            <DownloadCloud size={14} />
                                                            <span className="att-attach-link__text">
                                                                {req.attachmentName
                                                                    ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
                                                                    : 'View File'}
                                                            </span>
                                                        </a>
                                                    ) : (
                                                        <span className="att-no-data">No Attachment</span>
                                                    )}
                                                </td>

                                                <td>
                                                    {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
                                                    {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
                                                    {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
                                                </td>

                                                <td className="att-td--right">
                                                    {req.status === 'Pending' ? (
                                                        <div className="att-action-btns">
                                                            <button
                                                                className="att-btn att-btn--approve"
                                                                onClick={() => handleLeaveAction(req.id, 'Approved')}
                                                            >
                                                                <CheckCircle size={12} /> Approve
                                                            </button>
                                                            <button
                                                                className="att-btn att-btn--decline"
                                                                onClick={() => handleLeaveAction(req.id, 'Declined')}
                                                            >
                                                                <XCircle size={12} /> Decline
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="att-reviewed-label">Reviewed</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
                                                {displayedLeavesData.length === 0 ? (
                                                    <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                                        <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                                        <p className="mlab-empty__title">All Caught Up!</p>
                                                        <p className="mlab-empty__desc">No leave requests are pending review.</p>
                                                    </div>
                                                ) : (
                                                    <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
                                                        <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
                                                        <p className="mlab-empty__title">No matches found</p>
                                                        <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
                                                        <button
                                                            className="mlab-btn mlab-btn--outline"
                                                            onClick={() => {
                                                                setLeaveSearch('');
                                                                setLeaveStatusFilter('all');
                                                                setLeaveTypeFilter('all');
                                                            }}
                                                            style={{ marginTop: '1rem' }}
                                                        >
                                                            Clear Filters
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};


// // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     collection, query, where, getDocs, orderBy,
//     doc, writeBatch, serverTimestamp
// } from 'firebase/firestore';
// import {
//     FileText, Calendar, ArrowRight, AlertTriangle, History,
//     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
//     DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target
// } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { db } from '../../../lib/firebase';
// import Loader from '../../../components/common/Loader/Loader';
// import moment from 'moment';
// import '../../../components/views/LearnersView/LearnersView.css';
// import './AttendanceHistoryList.css';
// import { useStore } from '../../../store/useStore';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import { useToast } from '../../../components/common/Toast/Toast';

// // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// let cachedHistory: any[] | null = null;

// export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
//     const navigate = useNavigate();
//     const toast = useToast();

//     // 🚀 ADMIN "GOD MODE" CHECK 🚀
//     const user = useStore(s => s.user);
//     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

//     // 🚀 COHORT SELECTOR LOGIC 🚀
//     const allCohorts = useStore(s => s.cohorts) || [];
//     const fetchCohorts = useStore(s => s.fetchCohorts);

//     // 🚀 GUARANTEE COHORTS ARE LOADED INSTANTLY
//     useEffect(() => {
//         if (allCohorts.length === 0 && fetchCohorts) {
//             fetchCohorts();
//         }
//     }, [allCohorts.length, fetchCohorts]);

//     const availableCohorts = useMemo(() => {
//         if (isAdmin) return allCohorts;
//         return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
//     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

//     // 🚀 Default to empty string ("All Cohorts")
//     const [selectedCohortId, setSelectedCohortId] = useState<string>('');

//     // 🚀 TIME MACHINE STATE 🚀
//     const [reconcileDate, setReconcileDate] = useState<string>('');

//     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
//     const leaveRequests = useStore(s => s.leaveRequests) || [];
//     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
//     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

//     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
//     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
//     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
//     const [error, setError] = useState<string | null>(null);

//     // 🚀 HOLIDAY CACHE FOR ANALYTICS 🚀
//     const [holidays, setHolidays] = useState<string[]>([]);

//     // 🚀 ADMIN LEAVES STATE 🚀
//     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
//     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

//     // ─── REGISTERS FILTER STATE ───
//     const [registerSearch, setRegisterSearch] = useState('');

//     // ─── LEAVE REQUESTS FILTER STATE ───
//     const [leaveSearch, setLeaveSearch] = useState('');
//     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
//     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

//     // ─── MODAL STATE ───
//     const [modalConfig, setModalConfig] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//         confirmText?: string;
//         onConfirm?: () => void;
//         onCancel?: () => void;
//     }>({ isOpen: false, type: 'info', title: '', message: '' });

//     // ── Fetch Holidays on Mount ───────────────────────────────────────────────
//     useEffect(() => {
//         const fetchHolidays = async () => {
//             const currentYear = new Date().getFullYear();
//             const cacheKey = `holidays_za_${currentYear}`;
//             const cached = localStorage.getItem(cacheKey);

//             if (cached) {
//                 setHolidays(JSON.parse(cached));
//             } else {
//                 try {
//                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
//                     if (res.ok) {
//                         const data = await res.json();
//                         const dateList = data.map((h: any) => h.date);
//                         setHolidays(dateList);
//                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
//                     }
//                 } catch (e) {
//                     console.warn("Holiday API unreachable for analytics.");
//                 }
//             }
//         };
//         fetchHolidays();
//     }, []);

//     // ── Fetch registers ───────────────────────────────────────────────────────
//     useEffect(() => {
//         const fetchHistory = async () => {
//             if (!isAdmin && !facilitatorId) return;

//             if (cachedHistory === null) setLoadingRegisters(true);
//             setError(null);

//             try {
//                 let q;
//                 if (isAdmin) {
//                     q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
//                 } else {
//                     q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
//                 }

//                 const snap = await getDocs(q);
//                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
//                 cachedHistory = fresh;
//                 setHistory(fresh);
//             } catch (err: any) {
//                 console.error('Firestore Error:', err);
//                 setError(err.message);
//             } finally {
//                 setLoadingRegisters(false);
//             }
//         };
//         fetchHistory();
//     }, [facilitatorId, isAdmin]);

//     // ── Fetch leaves on tab change ────────────────────────────────────────────
//     useEffect(() => {
//         if (activeTab === 'leaves') {
//             if (isAdmin) {
//                 setLoadingAdminLeaves(true);
//                 getDocs(collection(db, 'leave_requests')).then(snap => {
//                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//                 }).finally(() => setLoadingAdminLeaves(false));
//             } else if (facilitatorId && leaveRequests.length === 0) {
//                 fetchFacilitatorLeaveRequests(facilitatorId);
//             }
//         }
//     }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

//     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
//     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

//     // ── Register Filtering ────────────────────────────────────────────────────
//     const filteredHistory = useMemo(() => {
//         let data = history;
//         if (selectedCohortId) {
//             data = data.filter(r => r.cohortId === selectedCohortId);
//         }
//         if (registerSearch) {
//             // Native date picker outputs exact YYYY-MM-DD
//             data = data.filter(r => r.date === registerSearch);
//         }
//         return data;
//     }, [history, registerSearch, selectedCohortId]);

//     // ── 🚀 ANALYTICS: COHORT HEALTH MATH 🚀 ──────────────────────────────────
//     const cohortStats = useMemo(() => {
//         if (!selectedCohortId) return null;

//         const cohort = availableCohorts.find(c => c.id === selectedCohortId);
//         if (!cohort || !cohort.startDate || !cohort.endDate) return null;

//         const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);

//         let totalWeekdays = 0;
//         let holidaysCount = 0;
//         let recessCount = 0;

//         const start = moment(cohort.startDate);
//         const end = moment(cohort.endDate);
//         const current = start.clone();

//         // Calculate Term Metrics
//         while (current.isSameOrBefore(end, 'day')) {
//             const dayOfWeek = current.day();
//             if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Ignore Sat/Sun
//                 totalWeekdays++;
//                 const dateStr = current.format('YYYY-MM-DD');

//                 const isHoliday = holidays.includes(dateStr);
//                 const isRecess = (cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'));

//                 if (isHoliday) holidaysCount++;
//                 else if (isRecess) recessCount++;
//             }
//             current.add(1, 'day');
//         }

//         const netExpectedTermDays = totalWeekdays - holidaysCount - recessCount;
//         const daysCompleted = cohortRegisters.length;

//         // Calculate Average Attendance %
//         let totalExpectedScans = 0;
//         let totalPresentScans = 0;

//         cohortRegisters.forEach(reg => {
//             const present = reg.presentLearners?.length || 0;
//             const absent = reg.absentLearners?.length || 0;
//             const dailyTotal = present + absent || (cohort.learnerIds?.length || 0); // Fallback to roster size

//             if (dailyTotal > 0) {
//                 totalExpectedScans += dailyTotal;
//                 totalPresentScans += present;
//             }
//         });

//         const avgAttendanceRate = totalExpectedScans > 0
//             ? Math.round((totalPresentScans / totalExpectedScans) * 100)
//             : 0;

//         return {
//             netExpectedTermDays,
//             daysCompleted,
//             holidaysCount,
//             recessCount,
//             avgAttendanceRate
//         };
//     }, [selectedCohortId, availableCohorts, history, holidays]);

//     // ── Leave Filtering ───────────────────────────────────────────────────────
//     const filteredLeaves = useMemo(() => {
//         return displayedLeavesData.filter(req => {
//             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
//             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
//             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
//             return matchesSearch && matchesStatus && matchesType;
//         });
//     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

//     const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

//     // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
//     const todayString = moment().format('YYYY-MM-DD');
//     const isFinalizedToday = selectedCohortId
//         ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
//         : false;

//     // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
//     const handleFinalizeRegister = async () => {
//         if (!selectedCohortId) return;

//         const currentCohort = availableCohorts.find(c => c.id === selectedCohortId);
//         const cohortName = currentCohort?.name || 'this cohort';
//         const rosterIds = currentCohort?.learnerIds || []; // Used to calculate absences

//         setModalConfig({
//             isOpen: true,
//             type: 'warning',
//             title: 'Finalize Attendance?',
//             message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
//             confirmText: 'Yes, Finalize & Close',
//             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
//             onConfirm: async () => {
//                 setModalConfig(prev => ({ ...prev, isOpen: false }));
//                 setLoadingRegisters(true);

//                 try {
//                     // 1. Fetch ALL live scans for this cohort
//                     const q = query(
//                         collection(db, 'live_attendance_scans'),
//                         where('cohortId', '==', selectedCohortId)
//                     );
//                     const liveSnap = await getDocs(q);

//                     const batch = writeBatch(db);
//                     const scansByDate: Record<string, any[]> = {};

//                     // 2. Group the scans by date
//                     liveSnap.docs.forEach(d => {
//                         const data = d.data();
//                         const date = data.dateString || todayString;
//                         if (!scansByDate[date]) scansByDate[date] = [];
//                         scansByDate[date].push({ ref: d.ref, ...data });
//                     });

//                     // 🚀 If nobody checked in at all today, we STILL must finalize TODAY
//                     if (Object.keys(scansByDate).length === 0) {
//                         scansByDate[todayString] = [];
//                     }

//                     // 3. Process each date group
//                     for (const [scanDate, scans] of Object.entries(scansByDate)) {
//                         // Deduplicate who was present
//                         const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];

//                         // 🚀 CALCULATE ABSENCES: Roster MINUS Present Learners
//                         const absentLearnerIds = rosterIds.filter((id: string) => !presentLearnerIds.includes(id));

//                         const historyRef = doc(collection(db, 'attendance'));

//                         // Save the permanent record
//                         batch.set(historyRef, {
//                             cohortId: selectedCohortId,
//                             cohortName: cohortName,
//                             date: scanDate,
//                             facilitatorId: facilitatorId || user?.uid || 'admin',
//                             presentLearners: presentLearnerIds,
//                             absentLearners: absentLearnerIds, // Explicitly save absentees
//                             reasons: {}, // Initialize empty objects for the Time Machine
//                             proofs: {},
//                             finalizedAt: serverTimestamp(),
//                             method: 'manual_close'
//                         });

//                         // Queue the live scans for deletion
//                         scans.forEach(s => batch.delete(s.ref));
//                     }

//                     // 4. Commit transaction
//                     await batch.commit();
//                     toast.success(`Register for ${cohortName} finalized successfully.`);

//                     // 5. Refresh local history
//                     let freshQuery;
//                     if (isAdmin) {
//                         freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
//                     } else {
//                         freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
//                     }
//                     const freshSnap = await getDocs(freshQuery);
//                     const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
//                     cachedHistory = freshData;
//                     setHistory(freshData);

//                 } catch (err: any) {
//                     console.error(err);
//                     toast.error(err.message || "Failed to finalize register.");
//                 } finally {
//                     setLoadingRegisters(false);
//                 }
//             }
//         });
//     };

//     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
//         setModalConfig({
//             isOpen: true,
//             type: status === 'Approved' ? 'success' : 'warning',
//             title: `Confirm ${status}`,
//             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
//             confirmText: `Yes, ${status}`,
//             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
//             onConfirm: async () => {
//                 setModalConfig(prev => ({ ...prev, isOpen: false }));
//                 try {
//                     await updateLeaveStatus(id, status);
//                     if (isAdmin) {
//                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
//                     }
//                     toast.success(`Leave request marked as ${status}.`);
//                 } catch (err) {
//                     toast.error('Failed to update the leave status. Please check your connection and try again.');
//                 }
//             }
//         });
//     };

//     if (loadingRegisters || (!isAdmin && !facilitatorId)) {
//         return (
//             <div className="att-loader-wrap">
//                 <Loader message="Loading Dashboard…" />
//             </div>
//         );
//     }

//     return (
//         <div className="att-root animate-fade-in">
//             {modalConfig.isOpen && createPortal(
//                 <div style={{ position: 'relative', zIndex: 999999 }}>
//                     <StatusModal
//                         type={modalConfig.type}
//                         title={modalConfig.title}
//                         message={modalConfig.message}
//                         confirmText={modalConfig.confirmText}
//                         onClose={() => {
//                             if (modalConfig.onConfirm) modalConfig.onConfirm();
//                             else setModalConfig(p => ({ ...p, isOpen: false }));
//                         }}
//                         onCancel={modalConfig.onCancel}
//                     />
//                 </div>,
//                 document.body
//             )}

//             <div className="att-tabs" role="tablist">
//                 <button
//                     role="tab"
//                     aria-selected={activeTab === 'registers'}
//                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
//                     onClick={() => setActiveTab('registers')}
//                 >
//                     <History size={14} /> Past Registers
//                 </button>
//                 <button
//                     role="tab"
//                     aria-selected={activeTab === 'leaves'}
//                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
//                     onClick={() => setActiveTab('leaves')}
//                 >
//                     <FileText size={14} /> Leave Requests
//                     {pendingLeaveCount > 0 && (
//                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
//                     )}
//                 </button>
//             </div>

//             {error && (
//                 <div className="att-error">
//                     <div className="att-error__title">
//                         <AlertTriangle size={15} /> Database Sync Error
//                     </div>
//                     <p className="att-error__body">{error}</p>
//                 </div>
//             )}

//             {activeTab === 'registers' && (
//                 <>
//                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>

//                             {/* 🚀 BEAUTIFUL DATE FILTER INPUT 🚀 */}
//                             <div className="mlab-search" style={{
//                                 minWidth: '250px', maxWidth: '350px', display: 'flex',
//                                 alignItems: 'center', gap: '8px', padding: '4px 12px',
//                                 background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: '8px',
//                                 height: 35
//                             }}>
//                                 <Calendar size={18} color="var(--mlab-grey)" />
//                                 <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, whiteSpace: 'nowrap' }}>
//                                     Filter Date:
//                                 </span>
//                                 <input
//                                     type="date"
//                                     value={registerSearch}
//                                     onChange={e => setRegisterSearch(e.target.value)}
//                                     style={{
//                                         border: 'none', background: 'transparent', outline: 'none',
//                                         color: 'var(--mlab-blue)', fontWeight: 600, flex: 1, cursor: 'pointer'
//                                     }}
//                                 />
//                                 {registerSearch && (
//                                     <button
//                                         onClick={() => setRegisterSearch('')}
//                                         title="Clear Date Filter"
//                                         style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
//                                     >
//                                         <XCircle size={16} color="#ef4444" />
//                                     </button>
//                                 )}
//                             </div>

//                         </div>

//                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
//                             <select
//                                 value={selectedCohortId}
//                                 onChange={(e) => setSelectedCohortId(e.target.value)}
//                                 style={{
//                                     padding: '8px 12px',
//                                     borderRadius: '8px',
//                                     border: '1px solid var(--mlab-border)',
//                                     background: 'white',
//                                     fontFamily: 'var(--font-body)',
//                                     color: 'var(--mlab-blue)',
//                                     fontWeight: 600,
//                                     maxWidth: '220px'
//                                 }}
//                             >
//                                 <option value="">All Cohorts</option>
//                                 {availableCohorts.map(c => (
//                                     <option key={c.id} value={c.id}>
//                                         {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
//                                     </option>
//                                 ))}
//                             </select>

//                             {/* 🚀 TIME MACHINE WIDGET 🚀 */}
//                             {selectedCohortId && (
//                                 <div style={{
//                                     display: 'flex', alignItems: 'center', gap: '8px',
//                                     background: '#f1f5f9', padding: '4px 8px',
//                                     borderRadius: '8px', border: '1px solid #cbd5e1'
//                                 }}>
//                                     <History size={16} color="var(--mlab-grey)" />
//                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                         Time Machine:
//                                     </span>
//                                     <input
//                                         type="date"
//                                         max={moment().subtract(1, 'days').format('YYYY-MM-DD')} // Restrict to past dates
//                                         value={reconcileDate}
//                                         onChange={e => setReconcileDate(e.target.value)}
//                                         style={{
//                                             border: 'none', background: 'transparent', outline: 'none',
//                                             fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600,
//                                             cursor: 'pointer'
//                                         }}
//                                         title="Select a past date to backdate or edit attendance"
//                                     />
//                                     <button
//                                         className="mlab-btn mlab-btn--sm"
//                                         disabled={!reconcileDate}
//                                         onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)}
//                                         style={{
//                                             background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1',
//                                             color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem'
//                                         }}
//                                         title="Reconcile attendance for this past date"
//                                     >
//                                         Reconcile
//                                     </button>
//                                 </div>
//                             )}

//                             <button
//                                 className="mlab-btn mlab-btn--outline"
//                                 onClick={() => {
//                                     const encodedAuth = btoa(JSON.stringify({
//                                         fid: facilitatorId || user?.uid || 'admin',
//                                         cid: selectedCohortId
//                                     }));
//                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
//                                     window.open(url, '_blank');
//                                 }}
//                                 style={{
//                                     whiteSpace: 'nowrap',
//                                     borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
//                                     color: isFinalizedToday ? '#94a3b8' : 'inherit',
//                                     cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
//                                 }}
//                                 disabled={!selectedCohortId || isFinalizedToday}
//                                 title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
//                             >
//                                 <Calendar size={16} /> Launch TV Kiosk
//                             </button>

//                             <button
//                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
//                                 onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
//                                 style={{ whiteSpace: 'nowrap' }}
//                                 disabled={!selectedCohortId}
//                                 title={!selectedCohortId ? "Select a specific cohort to view" : ""}
//                             >
//                                 <Clock size={16} /> Live Dashboard
//                             </button>

//                             {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
//                             {selectedCohortId && (
//                                 <button
//                                     className="mlab-btn"
//                                     onClick={handleFinalizeRegister}
//                                     disabled={isFinalizedToday}
//                                     style={{
//                                         whiteSpace: 'nowrap',
//                                         borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
//                                         color: isFinalizedToday ? '#94a3b8' : '#ef4444',
//                                         background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
//                                         borderWidth: '1px',
//                                         borderStyle: 'solid',
//                                         cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
//                                     }}
//                                     title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
//                                 >
//                                     <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
//                                 </button>
//                             )}

//                             <button
//                                 className="mlab-btn mlab-btn--primary"
//                                 onClick={() => navigate('/facilitator/attendance/scanner')}
//                                 style={{ whiteSpace: 'nowrap' }}
//                             >
//                                 <ScanLine size={16} /> Scan Attendance
//                             </button>
//                         </div>
//                     </div>

//                     {/* 🚀 TERM ANALYTICS PANEL (Appears when Cohort Selected) 🚀 */}
//                     {selectedCohortId && cohortStats && (
//                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                 <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Target size={24} color="var(--mlab-blue)" /></div>
//                                 <div>
//                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Progress</p>
//                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
//                                         {cohortStats.daysCompleted} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>/ {cohortStats.netExpectedTermDays} Days</span>
//                                     </h3>
//                                 </div>
//                             </div>

//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                 <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
//                                 <div>
//                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Attendance</p>
//                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
//                                         {cohortStats.avgAttendanceRate}%
//                                     </h3>
//                                 </div>
//                             </div>

//                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                 <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Coffee size={24} color="#d97706" /></div>
//                                 <div>
//                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excluded Days</p>
//                                     <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem' }}>
//                                         {cohortStats.holidaysCount + cohortStats.recessCount} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Off</span>
//                                     </h3>
//                                     <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
//                                         {cohortStats.holidaysCount} Holidays • {cohortStats.recessCount} Recess
//                                     </p>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     <div className="mlab-table-wrap">
//                         <table className="mlab-table">
//                             <thead>
//                                 <tr>
//                                     <th>Date Recorded</th>
//                                     {isAdmin && <th>Cohort</th>}
//                                     <th>Attendance</th>
//                                     <th>Proofs</th>
//                                     <th className="att-th--right">Action</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
//                                     const proofCount = Object.keys(record.proofs || {}).length;
//                                     const presentCount = record.presentLearners?.length || 0;

//                                     // 🚀 FIX: Grab the saved name first, then fallback to the lookup, then fallback to Unknown
//                                     const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

//                                     return (
//                                         <tr key={record.id}>
//                                             <td>
//                                                 <div className="att-date-cell">
//                                                     <Calendar size={14} className="att-date-cell__icon" />
//                                                     <span className="att-date-cell__label">
//                                                         {moment(record.date).format('DD MMM YYYY')}
//                                                     </span>
//                                                 </div>
//                                             </td>
//                                             {isAdmin && (
//                                                 <td>
//                                                     <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
//                                                         {cohortName}
//                                                     </span>
//                                                 </td>
//                                             )}
//                                             <td>
//                                                 <span className="att-badge att-badge--present">
//                                                     <Users size={11} /> {presentCount} Present
//                                                 </span>
//                                             </td>
//                                             <td>
//                                                 {proofCount > 0 ? (
//                                                     <span className="att-badge att-badge--proof">
//                                                         <FileText size={11} /> {proofCount} Attached
//                                                     </span>
//                                                 ) : (
//                                                     <span className="att-no-data">None</span>
//                                                 )}
//                                             </td>
//                                             <td className="att-td--right">
//                                                 <button
//                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
//                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
//                                                 >
//                                                     Open Register <ArrowRight size={13} />
//                                                 </button>
//                                             </td>
//                                         </tr>
//                                     );
//                                 }) : (
//                                     <tr>
//                                         <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
//                                             {history.length === 0 ? (
//                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
//                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                                     <p className="mlab-empty__title">No Records Yet</p>
//                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
//                                                 </div>
//                                             ) : (
//                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
//                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                                     <p className="mlab-empty__title">No matches found</p>
//                                                     <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
//                                                     <button
//                                                         className="mlab-btn mlab-btn--outline"
//                                                         onClick={() => setRegisterSearch('')}
//                                                         style={{ marginTop: '1rem' }}
//                                                     >
//                                                         Clear Search
//                                                     </button>
//                                                 </div>
//                                             )}
//                                         </td>
//                                     </tr>
//                                 )}
//                             </tbody>
//                         </table>
//                     </div>
//                 </>
//             )}

//             {activeTab === 'leaves' && (
//                 <>
//                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                             <div className="mlab-search" style={{ minWidth: '220px' }}>
//                                 <Search size={18} color="var(--mlab-grey)" />
//                                 <input
//                                     type="text"
//                                     placeholder="Search by learner name..."
//                                     value={leaveSearch}
//                                     onChange={e => setLeaveSearch(e.target.value)}
//                                 />
//                             </div>

//                             <div className="mlab-select-wrap">
//                                 <Filter size={16} color="var(--mlab-grey)" />
//                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
//                                     <option value="all">All Statuses</option>
//                                     <option value="Pending">Pending</option>
//                                     <option value="Approved">Approved</option>
//                                     <option value="Declined">Declined</option>
//                                 </select>
//                             </div>

//                             <div className="mlab-select-wrap">
//                                 <Filter size={16} color="var(--mlab-grey)" />
//                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
//                                     <option value="all">All Reasons</option>
//                                     <option value="Sick Leave">Sick Leave</option>
//                                     <option value="Personal Emergency">Personal Emergency</option>
//                                     <option value="Interview">Interview</option>
//                                     <option value="Other">Other</option>
//                                 </select>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="mlab-table-wrap">
//                         {isLeavesLoading ? (
//                             <div className="att-loader-wrap att-loader-wrap--inline">
//                                 <Loader message="Fetching requests…" />
//                             </div>
//                         ) : (
//                             <table className="mlab-table">
//                                 <thead>
//                                     <tr>
//                                         <th style={{ width: '15%' }}>Learner</th>
//                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
//                                         <th>Reason</th>
//                                         <th>Attachment</th>
//                                         <th>Status</th>
//                                         <th className="att-th--right">Actions</th>
//                                     </tr>
//                                 </thead>
//                                 <tbody>
//                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
//                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
//                                         const start = parseDate(req.startDate || req.dateAffected);
//                                         const end = parseDate(req.endDate || req.dateAffected);
//                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
//                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
//                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

//                                         return (
//                                             <tr key={req.id}>
//                                                 <td>
//                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
//                                                 </td>

//                                                 <td>
//                                                     <div className="att-dates-cell">
//                                                         <div className="att-dates-cell__start">
//                                                             <Calendar size={13} className="att-dates-cell__icon" />
//                                                             <span className="att-dates-cell__label">{fmtStart}</span>
//                                                         </div>
//                                                         {!isSameDay && (
//                                                             <div className="att-dates-cell__end">
//                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
//                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
//                                                             </div>
//                                                         )}
//                                                     </div>
//                                                 </td>

//                                                 <td>
//                                                     <div className="att-reason-cell">
//                                                         <span className="att-reason-cell__type">{req.type}</span>
//                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
//                                                     </div>
//                                                 </td>

//                                                 <td>
//                                                     {req.attachmentUrl ? (
//                                                         <a
//                                                             href={req.attachmentUrl}
//                                                             target="_blank"
//                                                             rel="noopener noreferrer"
//                                                             className="att-attach-link"
//                                                             title={req.attachmentName || 'Download Document'}
//                                                         >
//                                                             <DownloadCloud size={14} />
//                                                             <span className="att-attach-link__text">
//                                                                 {req.attachmentName
//                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
//                                                                     : 'View File'}
//                                                             </span>
//                                                         </a>
//                                                     ) : (
//                                                         <span className="att-no-data">No Attachment</span>
//                                                     )}
//                                                 </td>

//                                                 <td>
//                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
//                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
//                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
//                                                 </td>

//                                                 <td className="att-td--right">
//                                                     {req.status === 'Pending' ? (
//                                                         <div className="att-action-btns">
//                                                             <button
//                                                                 className="att-btn att-btn--approve"
//                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
//                                                             >
//                                                                 <CheckCircle size={12} /> Approve
//                                                             </button>
//                                                             <button
//                                                                 className="att-btn att-btn--decline"
//                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
//                                                             >
//                                                                 <XCircle size={12} /> Decline
//                                                             </button>
//                                                         </div>
//                                                     ) : (
//                                                         <span className="att-reviewed-label">Reviewed</span>
//                                                     )}
//                                                 </td>
//                                             </tr>
//                                         );
//                                     }) : (
//                                         <tr>
//                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
//                                                 {displayedLeavesData.length === 0 ? (
//                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
//                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                                         <p className="mlab-empty__title">All Caught Up!</p>
//                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
//                                                     </div>
//                                                 ) : (
//                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
//                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                                         <p className="mlab-empty__title">No matches found</p>
//                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
//                                                         <button
//                                                             className="mlab-btn mlab-btn--outline"
//                                                             onClick={() => {
//                                                                 setLeaveSearch('');
//                                                                 setLeaveStatusFilter('all');
//                                                                 setLeaveTypeFilter('all');
//                                                             }}
//                                                             style={{ marginTop: '1rem' }}
//                                                         >
//                                                             Clear Filters
//                                                         </button>
//                                                     </div>
//                                                 )}
//                                             </td>
//                                         </tr>
//                                     )}
//                                 </tbody>
//                             </table>
//                         )}
//                     </div>
//                 </>
//             )}
//         </div>
//     );
// };


// // // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// // import React, { useState, useEffect, useMemo } from 'react';
// // import { createPortal } from 'react-dom';
// // import {
// //     collection, query, where, getDocs, orderBy,
// //     doc, writeBatch, serverTimestamp
// // } from 'firebase/firestore';
// // import {
// //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// //     DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target
// // } from 'lucide-react';
// // import { useNavigate } from 'react-router-dom';
// // import { db } from '../../../lib/firebase';
// // import Loader from '../../../components/common/Loader/Loader';
// // import moment from 'moment';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import './AttendanceHistoryList.css';
// // import { useStore } from '../../../store/useStore';
// // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // import { useToast } from '../../../components/common/Toast/Toast';

// // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // let cachedHistory: any[] | null = null;

// // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// //     const navigate = useNavigate();
// //     const toast = useToast();

// //     // 🚀 ADMIN "GOD MODE" CHECK 🚀
// //     const user = useStore(s => s.user);
// //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

// //     // 🚀 COHORT SELECTOR LOGIC 🚀
// //     const allCohorts = useStore(s => s.cohorts) || [];
// //     const availableCohorts = useMemo(() => {
// //         if (isAdmin) return allCohorts;
// //         return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
// //     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

// //     // 🚀 Default to empty string ("All Cohorts")
// //     const [selectedCohortId, setSelectedCohortId] = useState<string>('');

// //     // 🚀 TIME MACHINE STATE 🚀
// //     const [reconcileDate, setReconcileDate] = useState<string>('');

// //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// //     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
// //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// //     const [error, setError] = useState<string | null>(null);

// //     // 🚀 HOLIDAY CACHE FOR ANALYTICS 🚀
// //     const [holidays, setHolidays] = useState<string[]>([]);

// //     // 🚀 ADMIN LEAVES STATE 🚀
// //     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
// //     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

// //     // ─── REGISTERS FILTER STATE ───
// //     const [registerSearch, setRegisterSearch] = useState('');

// //     // ─── LEAVE REQUESTS FILTER STATE ───
// //     const [leaveSearch, setLeaveSearch] = useState('');
// //     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
// //     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

// //     // ─── MODAL STATE ───
// //     const [modalConfig, setModalConfig] = useState<{
// //         isOpen: boolean;
// //         type: StatusType;
// //         title: string;
// //         message: string;
// //         confirmText?: string;
// //         onConfirm?: () => void;
// //         onCancel?: () => void;
// //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// //     // ── Fetch Holidays on Mount ───────────────────────────────────────────────
// //     useEffect(() => {
// //         const fetchHolidays = async () => {
// //             const currentYear = new Date().getFullYear();
// //             const cacheKey = `holidays_za_${currentYear}`;
// //             const cached = localStorage.getItem(cacheKey);

// //             if (cached) {
// //                 setHolidays(JSON.parse(cached));
// //             } else {
// //                 try {
// //                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
// //                     if (res.ok) {
// //                         const data = await res.json();
// //                         const dateList = data.map((h: any) => h.date);
// //                         setHolidays(dateList);
// //                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
// //                     }
// //                 } catch (e) {
// //                     console.warn("Holiday API unreachable for analytics.");
// //                 }
// //             }
// //         };
// //         fetchHolidays();
// //     }, []);

// //     // ── Fetch registers ───────────────────────────────────────────────────────
// //     useEffect(() => {
// //         const fetchHistory = async () => {
// //             if (!isAdmin && !facilitatorId) return;

// //             if (cachedHistory === null) setLoadingRegisters(true);
// //             setError(null);

// //             try {
// //                 let q;
// //                 if (isAdmin) {
// //                     q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// //                 } else {
// //                     q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
// //                 }

// //                 const snap = await getDocs(q);
// //                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// //                 cachedHistory = fresh;
// //                 setHistory(fresh);
// //             } catch (err: any) {
// //                 console.error('Firestore Error:', err);
// //                 setError(err.message);
// //             } finally {
// //                 setLoadingRegisters(false);
// //             }
// //         };
// //         fetchHistory();
// //     }, [facilitatorId, isAdmin]);

// //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// //     useEffect(() => {
// //         if (activeTab === 'leaves') {
// //             if (isAdmin) {
// //                 setLoadingAdminLeaves(true);
// //                 getDocs(collection(db, 'leave_requests')).then(snap => {
// //                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //                 }).finally(() => setLoadingAdminLeaves(false));
// //             } else if (facilitatorId && leaveRequests.length === 0) {
// //                 fetchFacilitatorLeaveRequests(facilitatorId);
// //             }
// //         }
// //     }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

// //     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
// //     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

// //     // ── Register Filtering ────────────────────────────────────────────────────
// //     const filteredHistory = useMemo(() => {
// //         let data = history;
// //         if (selectedCohortId) {
// //             data = data.filter(r => r.cohortId === selectedCohortId);
// //         }
// //         if (registerSearch) {
// //             const lower = registerSearch.toLowerCase();
// //             data = data.filter(r =>
// //                 moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
// //                 r.date.includes(lower)
// //             );
// //         }
// //         return data;
// //     }, [history, registerSearch, selectedCohortId]);

// //     // ── 🚀 ANALYTICS: COHORT HEALTH MATH 🚀 ──────────────────────────────────
// //     const cohortStats = useMemo(() => {
// //         if (!selectedCohortId) return null;

// //         const cohort = availableCohorts.find(c => c.id === selectedCohortId);
// //         if (!cohort || !cohort.startDate || !cohort.endDate) return null;

// //         const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);

// //         let totalWeekdays = 0;
// //         let holidaysCount = 0;
// //         let recessCount = 0;

// //         const start = moment(cohort.startDate);
// //         const end = moment(cohort.endDate);
// //         const current = start.clone();

// //         // Calculate Term Metrics
// //         while (current.isSameOrBefore(end, 'day')) {
// //             const dayOfWeek = current.day();
// //             if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Ignore Sat/Sun
// //                 totalWeekdays++;
// //                 const dateStr = current.format('YYYY-MM-DD');

// //                 const isHoliday = holidays.includes(dateStr);
// //                 const isRecess = (cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'));

// //                 if (isHoliday) holidaysCount++;
// //                 else if (isRecess) recessCount++;
// //             }
// //             current.add(1, 'day');
// //         }

// //         const netExpectedTermDays = totalWeekdays - holidaysCount - recessCount;
// //         const daysCompleted = cohortRegisters.length;

// //         // Calculate Average Attendance %
// //         let totalExpectedScans = 0;
// //         let totalPresentScans = 0;

// //         cohortRegisters.forEach(reg => {
// //             const present = reg.presentLearners?.length || 0;
// //             const absent = reg.absentLearners?.length || 0;
// //             const dailyTotal = present + absent || (cohort.learnerIds?.length || 0); // Fallback to roster size

// //             if (dailyTotal > 0) {
// //                 totalExpectedScans += dailyTotal;
// //                 totalPresentScans += present;
// //             }
// //         });

// //         const avgAttendanceRate = totalExpectedScans > 0
// //             ? Math.round((totalPresentScans / totalExpectedScans) * 100)
// //             : 0;

// //         return {
// //             netExpectedTermDays,
// //             daysCompleted,
// //             holidaysCount,
// //             recessCount,
// //             avgAttendanceRate
// //         };
// //     }, [selectedCohortId, availableCohorts, history, holidays]);

// //     // ── Leave Filtering ───────────────────────────────────────────────────────
// //     const filteredLeaves = useMemo(() => {
// //         return displayedLeavesData.filter(req => {
// //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
// //             return matchesSearch && matchesStatus && matchesType;
// //         });
// //     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// //     const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

// //     // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
// //     const todayString = moment().format('YYYY-MM-DD');
// //     const isFinalizedToday = selectedCohortId
// //         ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
// //         : false;

// //     // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
// //     const handleFinalizeRegister = async () => {
// //         if (!selectedCohortId) return;

// //         const cohortName = availableCohorts.find(c => c.id === selectedCohortId)?.name || 'this cohort';

// //         setModalConfig({
// //             isOpen: true,
// //             type: 'warning',
// //             title: 'Finalize Attendance?',
// //             message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
// //             confirmText: 'Yes, Finalize & Close',
// //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// //             onConfirm: async () => {
// //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// //                 setLoadingRegisters(true);

// //                 try {
// //                     // 1. Fetch ALL live scans for this cohort (ignoring the current clock date)
// //                     const q = query(
// //                         collection(db, 'live_attendance_scans'),
// //                         where('cohortId', '==', selectedCohortId)
// //                     );
// //                     const liveSnap = await getDocs(q);

// //                     if (liveSnap.empty) {
// //                         toast.error("No live attendance data found to finalize.");
// //                         setLoadingRegisters(false);
// //                         return;
// //                     }

// //                     const batch = writeBatch(db);

// //                     // 2. Group the scans by the date they ACTUALLY occurred
// //                     const scansByDate: Record<string, any[]> = {};
// //                     liveSnap.docs.forEach(d => {
// //                         const data = d.data();
// //                         const date = data.dateString;

// //                         if (!scansByDate[date]) scansByDate[date] = [];
// //                         scansByDate[date].push({ ref: d.ref, ...data });
// //                     });

// //                     // 3. Process each date group individually
// //                     for (const [scanDate, scans] of Object.entries(scansByDate)) {
// //                         const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];
// //                         const historyRef = doc(collection(db, 'attendance'));

// //                         // Save the permanent record using the SCAN DATE, not today's date
// //                         batch.set(historyRef, {
// //                             cohortId: selectedCohortId,
// //                             cohortName: cohortName,
// //                             date: scanDate,
// //                             facilitatorId: facilitatorId || user?.uid || 'admin',
// //                             presentLearners: presentLearnerIds,
// //                             absentLearners: [],
// //                             finalizedAt: serverTimestamp(),
// //                             method: 'manual_close'
// //                         });

// //                         // Queue the live scans for deletion
// //                         scans.forEach(s => batch.delete(s.ref));
// //                     }

// //                     // 4. Commit transaction
// //                     await batch.commit();
// //                     toast.success(`Register for ${cohortName} finalized successfully.`);

// //                     // 5. Refresh local history
// //                     let freshQuery;
// //                     if (isAdmin) {
// //                         freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// //                     } else {
// //                         freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
// //                     }
// //                     const freshSnap = await getDocs(freshQuery);
// //                     const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
// //                     cachedHistory = freshData;
// //                     setHistory(freshData);

// //                 } catch (err: any) {
// //                     console.error(err);
// //                     toast.error(err.message || "Failed to finalize register.");
// //                 } finally {
// //                     setLoadingRegisters(false);
// //                 }
// //             }
// //         });
// //     };

// //     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
// //         setModalConfig({
// //             isOpen: true,
// //             type: status === 'Approved' ? 'success' : 'warning',
// //             title: `Confirm ${status}`,
// //             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
// //             confirmText: `Yes, ${status}`,
// //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// //             onConfirm: async () => {
// //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// //                 try {
// //                     await updateLeaveStatus(id, status);
// //                     if (isAdmin) {
// //                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
// //                     }
// //                     toast.success(`Leave request marked as ${status}.`);
// //                 } catch (err) {
// //                     toast.error('Failed to update the leave status. Please check your connection and try again.');
// //                 }
// //             }
// //         });
// //     };

// //     if (loadingRegisters || (!isAdmin && !facilitatorId)) {
// //         return (
// //             <div className="att-loader-wrap">
// //                 <Loader message="Loading Dashboard…" />
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="att-root animate-fade-in">
// //             {modalConfig.isOpen && createPortal(
// //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// //                     <StatusModal
// //                         type={modalConfig.type}
// //                         title={modalConfig.title}
// //                         message={modalConfig.message}
// //                         confirmText={modalConfig.confirmText}
// //                         onClose={() => {
// //                             if (modalConfig.onConfirm) modalConfig.onConfirm();
// //                             else setModalConfig(p => ({ ...p, isOpen: false }));
// //                         }}
// //                         onCancel={modalConfig.onCancel}
// //                     />
// //                 </div>,
// //                 document.body
// //             )}

// //             <div className="att-tabs" role="tablist">
// //                 <button
// //                     role="tab"
// //                     aria-selected={activeTab === 'registers'}
// //                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
// //                     onClick={() => setActiveTab('registers')}
// //                 >
// //                     <History size={14} /> Past Registers
// //                 </button>
// //                 <button
// //                     role="tab"
// //                     aria-selected={activeTab === 'leaves'}
// //                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
// //                     onClick={() => setActiveTab('leaves')}
// //                 >
// //                     <FileText size={14} /> Leave Requests
// //                     {pendingLeaveCount > 0 && (
// //                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
// //                     )}
// //                 </button>
// //             </div>

// //             {error && (
// //                 <div className="att-error">
// //                     <div className="att-error__title">
// //                         <AlertTriangle size={15} /> Database Sync Error
// //                     </div>
// //                     <p className="att-error__body">{error}</p>
// //                 </div>
// //             )}

// //             {activeTab === 'registers' && (
// //                 <>
// //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// //                                 <Search size={18} color="var(--mlab-grey)" />
// //                                 <input
// //                                     type="text"
// //                                     placeholder="Search by date (e.g. 12 Oct)..."
// //                                     value={registerSearch}
// //                                     onChange={e => setRegisterSearch(e.target.value)}
// //                                 />
// //                             </div>
// //                         </div>

// //                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
// //                             <select
// //                                 value={selectedCohortId}
// //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// //                                 style={{
// //                                     padding: '8px 12px',
// //                                     borderRadius: '8px',
// //                                     border: '1px solid var(--mlab-border)',
// //                                     background: 'white',
// //                                     fontFamily: 'var(--font-body)',
// //                                     color: 'var(--mlab-blue)',
// //                                     fontWeight: 600,
// //                                     maxWidth: '220px'
// //                                 }}
// //                             >
// //                                 <option value="">All Cohorts</option>
// //                                 {availableCohorts.map(c => (
// //                                     <option key={c.id} value={c.id}>
// //                                         {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
// //                                     </option>
// //                                 ))}
// //                             </select>

// //                             {/* 🚀 TIME MACHINE WIDGET 🚀 */}
// //                             {selectedCohortId && (
// //                                 <div style={{
// //                                     display: 'flex', alignItems: 'center', gap: '8px',
// //                                     background: '#f1f5f9', padding: '4px 8px',
// //                                     borderRadius: '8px', border: '1px solid #cbd5e1'
// //                                 }}>
// //                                     <History size={16} color="var(--mlab-grey)" />
// //                                     <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                         Time Machine:
// //                                     </span>
// //                                     <input
// //                                         type="date"
// //                                         max={moment().subtract(1, 'days').format('YYYY-MM-DD')} // Restrict to past dates
// //                                         value={reconcileDate}
// //                                         onChange={e => setReconcileDate(e.target.value)}
// //                                         style={{
// //                                             border: 'none', background: 'transparent', outline: 'none',
// //                                             fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600,
// //                                             cursor: 'pointer'
// //                                         }}
// //                                         title="Select a past date to backdate or edit attendance"
// //                                     />
// //                                     <button
// //                                         className="mlab-btn mlab-btn--sm"
// //                                         disabled={!reconcileDate}
// //                                         onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)}
// //                                         style={{
// //                                             background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1',
// //                                             color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem'
// //                                         }}
// //                                         title="Reconcile attendance for this past date"
// //                                     >
// //                                         Reconcile
// //                                     </button>
// //                                 </div>
// //                             )}

// //                             <button
// //                                 className="mlab-btn mlab-btn--outline"
// //                                 onClick={() => {
// //                                     const encodedAuth = btoa(JSON.stringify({
// //                                         fid: facilitatorId || user?.uid || 'admin',
// //                                         cid: selectedCohortId
// //                                     }));
// //                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
// //                                     window.open(url, '_blank');
// //                                 }}
// //                                 style={{
// //                                     whiteSpace: 'nowrap',
// //                                     borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
// //                                     color: isFinalizedToday ? '#94a3b8' : 'inherit',
// //                                     cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// //                                 }}
// //                                 disabled={!selectedCohortId || isFinalizedToday}
// //                                 title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
// //                             >
// //                                 <Calendar size={16} /> Launch TV Kiosk
// //                             </button>

// //                             <button
// //                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// //                                 onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
// //                                 style={{ whiteSpace: 'nowrap' }}
// //                                 disabled={!selectedCohortId}
// //                                 title={!selectedCohortId ? "Select a specific cohort to view" : ""}
// //                             >
// //                                 <Clock size={16} /> Live Dashboard
// //                             </button>

// //                             {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
// //                             {selectedCohortId && (
// //                                 <button
// //                                     className="mlab-btn"
// //                                     onClick={handleFinalizeRegister}
// //                                     disabled={isFinalizedToday}
// //                                     style={{
// //                                         whiteSpace: 'nowrap',
// //                                         borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
// //                                         color: isFinalizedToday ? '#94a3b8' : '#ef4444',
// //                                         background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
// //                                         borderWidth: '1px',
// //                                         borderStyle: 'solid',
// //                                         cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// //                                     }}
// //                                     title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
// //                                 >
// //                                     <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
// //                                 </button>
// //                             )}

// //                             <button
// //                                 className="mlab-btn mlab-btn--primary"
// //                                 onClick={() => navigate('/facilitator/attendance/scanner')}
// //                                 style={{ whiteSpace: 'nowrap' }}
// //                             >
// //                                 <ScanLine size={16} /> Scan Attendance
// //                             </button>
// //                         </div>
// //                     </div>

// //                     {/* 🚀 TERM ANALYTICS PANEL (Appears when Cohort Selected) 🚀 */}
// //                     {selectedCohortId && cohortStats && (
// //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                 <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Target size={24} color="var(--mlab-blue)" /></div>
// //                                 <div>
// //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Progress</p>
// //                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
// //                                         {cohortStats.daysCompleted} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>/ {cohortStats.netExpectedTermDays} Days</span>
// //                                     </h3>
// //                                 </div>
// //                             </div>

// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                 <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
// //                                 <div>
// //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Attendance</p>
// //                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
// //                                         {cohortStats.avgAttendanceRate}%
// //                                     </h3>
// //                                 </div>
// //                             </div>

// //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// //                                 <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Coffee size={24} color="#d97706" /></div>
// //                                 <div>
// //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excluded Days</p>
// //                                     <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem' }}>
// //                                         {cohortStats.holidaysCount + cohortStats.recessCount} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Off</span>
// //                                     </h3>
// //                                     <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
// //                                         {cohortStats.holidaysCount} Holidays • {cohortStats.recessCount} Recess
// //                                     </p>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     )}

// //                     <div className="mlab-table-wrap">
// //                         <table className="mlab-table">
// //                             <thead>
// //                                 <tr>
// //                                     <th>Date Recorded</th>
// //                                     {isAdmin && <th>Cohort</th>}
// //                                     <th>Attendance</th>
// //                                     <th>Proofs</th>
// //                                     <th className="att-th--right">Action</th>
// //                                 </tr>
// //                             </thead>
// //                             <tbody>
// //                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
// //                                     const proofCount = Object.keys(record.proofs || {}).length;
// //                                     const presentCount = record.presentLearners?.length || 0;

// //                                     // 🚀 FIX: Grab the saved name first, then fallback to the lookup, then fallback to Unknown
// //                                     const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

// //                                     return (
// //                                         <tr key={record.id}>
// //                                             <td>
// //                                                 <div className="att-date-cell">
// //                                                     <Calendar size={14} className="att-date-cell__icon" />
// //                                                     <span className="att-date-cell__label">
// //                                                         {moment(record.date).format('DD MMM YYYY')}
// //                                                     </span>
// //                                                 </div>
// //                                             </td>
// //                                             {isAdmin && (
// //                                                 <td>
// //                                                     <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
// //                                                         {cohortName}
// //                                                     </span>
// //                                                 </td>
// //                                             )}
// //                                             <td>
// //                                                 <span className="att-badge att-badge--present">
// //                                                     <Users size={11} /> {presentCount} Present
// //                                                 </span>
// //                                             </td>
// //                                             <td>
// //                                                 {proofCount > 0 ? (
// //                                                     <span className="att-badge att-badge--proof">
// //                                                         <FileText size={11} /> {proofCount} Attached
// //                                                     </span>
// //                                                 ) : (
// //                                                     <span className="att-no-data">None</span>
// //                                                 )}
// //                                             </td>
// //                                             <td className="att-td--right">
// //                                                 <button
// //                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
// //                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// //                                                 >
// //                                                     Open Register <ArrowRight size={13} />
// //                                                 </button>
// //                                             </td>
// //                                         </tr>
// //                                     );
// //                                 }) : (
// //                                     <tr>
// //                                         <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
// //                                             {history.length === 0 ? (
// //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// //                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                                     <p className="mlab-empty__title">No Records Yet</p>
// //                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// //                                                 </div>
// //                                             ) : (
// //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// //                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                                     <p className="mlab-empty__title">No matches found</p>
// //                                                     <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// //                                                     <button
// //                                                         className="mlab-btn mlab-btn--outline"
// //                                                         onClick={() => setRegisterSearch('')}
// //                                                         style={{ marginTop: '1rem' }}
// //                                                     >
// //                                                         Clear Search
// //                                                     </button>
// //                                                 </div>
// //                                             )}
// //                                         </td>
// //                                     </tr>
// //                                 )}
// //                             </tbody>
// //                         </table>
// //                     </div>
// //                 </>
// //             )}

// //             {activeTab === 'leaves' && (
// //                 <>
// //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// //                             <div className="mlab-search" style={{ minWidth: '220px' }}>
// //                                 <Search size={18} color="var(--mlab-grey)" />
// //                                 <input
// //                                     type="text"
// //                                     placeholder="Search by learner name..."
// //                                     value={leaveSearch}
// //                                     onChange={e => setLeaveSearch(e.target.value)}
// //                                 />
// //                             </div>

// //                             <div className="mlab-select-wrap">
// //                                 <Filter size={16} color="var(--mlab-grey)" />
// //                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
// //                                     <option value="all">All Statuses</option>
// //                                     <option value="Pending">Pending</option>
// //                                     <option value="Approved">Approved</option>
// //                                     <option value="Declined">Declined</option>
// //                                 </select>
// //                             </div>

// //                             <div className="mlab-select-wrap">
// //                                 <Filter size={16} color="var(--mlab-grey)" />
// //                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
// //                                     <option value="all">All Reasons</option>
// //                                     <option value="Sick Leave">Sick Leave</option>
// //                                     <option value="Personal Emergency">Personal Emergency</option>
// //                                     <option value="Interview">Interview</option>
// //                                     <option value="Other">Other</option>
// //                                 </select>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="mlab-table-wrap">
// //                         {isLeavesLoading ? (
// //                             <div className="att-loader-wrap att-loader-wrap--inline">
// //                                 <Loader message="Fetching requests…" />
// //                             </div>
// //                         ) : (
// //                             <table className="mlab-table">
// //                                 <thead>
// //                                     <tr>
// //                                         <th style={{ width: '15%' }}>Learner</th>
// //                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
// //                                         <th>Reason</th>
// //                                         <th>Attachment</th>
// //                                         <th>Status</th>
// //                                         <th className="att-th--right">Actions</th>
// //                                     </tr>
// //                                 </thead>
// //                                 <tbody>
// //                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
// //                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
// //                                         const start = parseDate(req.startDate || req.dateAffected);
// //                                         const end = parseDate(req.endDate || req.dateAffected);
// //                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
// //                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
// //                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

// //                                         return (
// //                                             <tr key={req.id}>
// //                                                 <td>
// //                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
// //                                                 </td>

// //                                                 <td>
// //                                                     <div className="att-dates-cell">
// //                                                         <div className="att-dates-cell__start">
// //                                                             <Calendar size={13} className="att-dates-cell__icon" />
// //                                                             <span className="att-dates-cell__label">{fmtStart}</span>
// //                                                         </div>
// //                                                         {!isSameDay && (
// //                                                             <div className="att-dates-cell__end">
// //                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
// //                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
// //                                                             </div>
// //                                                         )}
// //                                                     </div>
// //                                                 </td>

// //                                                 <td>
// //                                                     <div className="att-reason-cell">
// //                                                         <span className="att-reason-cell__type">{req.type}</span>
// //                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
// //                                                     </div>
// //                                                 </td>

// //                                                 <td>
// //                                                     {req.attachmentUrl ? (
// //                                                         <a
// //                                                             href={req.attachmentUrl}
// //                                                             target="_blank"
// //                                                             rel="noopener noreferrer"
// //                                                             className="att-attach-link"
// //                                                             title={req.attachmentName || 'Download Document'}
// //                                                         >
// //                                                             <DownloadCloud size={14} />
// //                                                             <span className="att-attach-link__text">
// //                                                                 {req.attachmentName
// //                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
// //                                                                     : 'View File'}
// //                                                             </span>
// //                                                         </a>
// //                                                     ) : (
// //                                                         <span className="att-no-data">No Attachment</span>
// //                                                     )}
// //                                                 </td>

// //                                                 <td>
// //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// //                                                 </td>

// //                                                 <td className="att-td--right">
// //                                                     {req.status === 'Pending' ? (
// //                                                         <div className="att-action-btns">
// //                                                             <button
// //                                                                 className="att-btn att-btn--approve"
// //                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
// //                                                             >
// //                                                                 <CheckCircle size={12} /> Approve
// //                                                             </button>
// //                                                             <button
// //                                                                 className="att-btn att-btn--decline"
// //                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
// //                                                             >
// //                                                                 <XCircle size={12} /> Decline
// //                                                             </button>
// //                                                         </div>
// //                                                     ) : (
// //                                                         <span className="att-reviewed-label">Reviewed</span>
// //                                                     )}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     }) : (
// //                                         <tr>
// //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// //                                                 {displayedLeavesData.length === 0 ? (
// //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// //                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                                         <p className="mlab-empty__title">All Caught Up!</p>
// //                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
// //                                                     </div>
// //                                                 ) : (
// //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// //                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// //                                                         <p className="mlab-empty__title">No matches found</p>
// //                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// //                                                         <button
// //                                                             className="mlab-btn mlab-btn--outline"
// //                                                             onClick={() => {
// //                                                                 setLeaveSearch('');
// //                                                                 setLeaveStatusFilter('all');
// //                                                                 setLeaveTypeFilter('all');
// //                                                             }}
// //                                                             style={{ marginTop: '1rem' }}
// //                                                         >
// //                                                             Clear Filters
// //                                                         </button>
// //                                                     </div>
// //                                                 )}
// //                                             </td>
// //                                         </tr>
// //                                     )}
// //                                 </tbody>
// //                             </table>
// //                         )}
// //                     </div>
// //                 </>
// //             )}
// //         </div>
// //     );
// // };


// // // // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import {
// // //     collection, query, where, getDocs, orderBy,
// // //     doc, writeBatch, serverTimestamp
// // // } from 'firebase/firestore';
// // // import {
// // //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// // //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// // //     DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target
// // // } from 'lucide-react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { db } from '../../../lib/firebase';
// // // import Loader from '../../../components/common/Loader/Loader';
// // // import moment from 'moment';
// // // import '../../../components/views/LearnersView/LearnersView.css';
// // // import './AttendanceHistoryList.css';
// // // import { useStore } from '../../../store/useStore';
// // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // // import { useToast } from '../../../components/common/Toast/Toast';

// // // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // // let cachedHistory: any[] | null = null;

// // // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// // //     const navigate = useNavigate();
// // //     const toast = useToast();

// // //     // 🚀 ADMIN "GOD MODE" CHECK 🚀
// // //     const user = useStore(s => s.user);
// // //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

// // //     // 🚀 COHORT SELECTOR LOGIC 🚀
// // //     const allCohorts = useStore(s => s.cohorts) || [];
// // //     const availableCohorts = useMemo(() => {
// // //         if (isAdmin) return allCohorts;
// // //         return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
// // //     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

// // //     // 🚀 Default to empty string ("All Cohorts")
// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>('');

// // //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// // //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// // //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// // //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// // //     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
// // //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// // //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// // //     const [error, setError] = useState<string | null>(null);

// // //     // 🚀 HOLIDAY CACHE FOR ANALYTICS 🚀
// // //     const [holidays, setHolidays] = useState<string[]>([]);

// // //     // 🚀 ADMIN LEAVES STATE 🚀
// // //     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
// // //     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

// // //     // ─── REGISTERS FILTER STATE ───
// // //     const [registerSearch, setRegisterSearch] = useState('');

// // //     // ─── LEAVE REQUESTS FILTER STATE ───
// // //     const [leaveSearch, setLeaveSearch] = useState('');
// // //     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
// // //     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

// // //     // ─── MODAL STATE ───
// // //     const [modalConfig, setModalConfig] = useState<{
// // //         isOpen: boolean;
// // //         type: StatusType;
// // //         title: string;
// // //         message: string;
// // //         confirmText?: string;
// // //         onConfirm?: () => void;
// // //         onCancel?: () => void;
// // //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// // //     // ── Fetch Holidays on Mount ───────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const fetchHolidays = async () => {
// // //             const currentYear = new Date().getFullYear();
// // //             const cacheKey = `holidays_za_${currentYear}`;
// // //             const cached = localStorage.getItem(cacheKey);

// // //             if (cached) {
// // //                 setHolidays(JSON.parse(cached));
// // //             } else {
// // //                 try {
// // //                     const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`);
// // //                     if (res.ok) {
// // //                         const data = await res.json();
// // //                         const dateList = data.map((h: any) => h.date);
// // //                         setHolidays(dateList);
// // //                         localStorage.setItem(cacheKey, JSON.stringify(dateList));
// // //                     }
// // //                 } catch (e) {
// // //                     console.warn("Holiday API unreachable for analytics.");
// // //                 }
// // //             }
// // //         };
// // //         fetchHolidays();
// // //     }, []);

// // //     // ── Fetch registers ───────────────────────────────────────────────────────
// // //     useEffect(() => {
// // //         const fetchHistory = async () => {
// // //             if (!isAdmin && !facilitatorId) return;

// // //             if (cachedHistory === null) setLoadingRegisters(true);
// // //             setError(null);

// // //             try {
// // //                 let q;
// // //                 if (isAdmin) {
// // //                     q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // //                 } else {
// // //                     q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
// // //                 }

// // //                 const snap = await getDocs(q);
// // //                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // //                 cachedHistory = fresh;
// // //                 setHistory(fresh);
// // //             } catch (err: any) {
// // //                 console.error('Firestore Error:', err);
// // //                 setError(err.message);
// // //             } finally {
// // //                 setLoadingRegisters(false);
// // //             }
// // //         };
// // //         fetchHistory();
// // //     }, [facilitatorId, isAdmin]);

// // //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// // //     useEffect(() => {
// // //         if (activeTab === 'leaves') {
// // //             if (isAdmin) {
// // //                 setLoadingAdminLeaves(true);
// // //                 getDocs(collection(db, 'leave_requests')).then(snap => {
// // //                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // //                 }).finally(() => setLoadingAdminLeaves(false));
// // //             } else if (facilitatorId && leaveRequests.length === 0) {
// // //                 fetchFacilitatorLeaveRequests(facilitatorId);
// // //             }
// // //         }
// // //     }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

// // //     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
// // //     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

// // //     // ── Register Filtering ────────────────────────────────────────────────────
// // //     const filteredHistory = useMemo(() => {
// // //         let data = history;
// // //         if (selectedCohortId) {
// // //             data = data.filter(r => r.cohortId === selectedCohortId);
// // //         }
// // //         if (registerSearch) {
// // //             const lower = registerSearch.toLowerCase();
// // //             data = data.filter(r =>
// // //                 moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
// // //                 r.date.includes(lower)
// // //             );
// // //         }
// // //         return data;
// // //     }, [history, registerSearch, selectedCohortId]);

// // //     // ── 🚀 ANALYTICS: COHORT HEALTH MATH 🚀 ──────────────────────────────────
// // //     const cohortStats = useMemo(() => {
// // //         if (!selectedCohortId) return null;

// // //         const cohort = availableCohorts.find(c => c.id === selectedCohortId);
// // //         if (!cohort || !cohort.startDate || !cohort.endDate) return null;

// // //         const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);

// // //         let totalWeekdays = 0;
// // //         let holidaysCount = 0;
// // //         let recessCount = 0;

// // //         const start = moment(cohort.startDate);
// // //         const end = moment(cohort.endDate);
// // //         const current = start.clone();

// // //         // Calculate Term Metrics
// // //         while (current.isSameOrBefore(end, 'day')) {
// // //             const dayOfWeek = current.day();
// // //             if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Ignore Sat/Sun
// // //                 totalWeekdays++;
// // //                 const dateStr = current.format('YYYY-MM-DD');

// // //                 const isHoliday = holidays.includes(dateStr);
// // //                 const isRecess = (cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'));

// // //                 if (isHoliday) holidaysCount++;
// // //                 else if (isRecess) recessCount++;
// // //             }
// // //             current.add(1, 'day');
// // //         }

// // //         const netExpectedTermDays = totalWeekdays - holidaysCount - recessCount;
// // //         const daysCompleted = cohortRegisters.length;

// // //         // Calculate Average Attendance %
// // //         let totalExpectedScans = 0;
// // //         let totalPresentScans = 0;

// // //         cohortRegisters.forEach(reg => {
// // //             const present = reg.presentLearners?.length || 0;
// // //             const absent = reg.absentLearners?.length || 0;
// // //             const dailyTotal = present + absent || (cohort.learnerIds?.length || 0); // Fallback to roster size

// // //             if (dailyTotal > 0) {
// // //                 totalExpectedScans += dailyTotal;
// // //                 totalPresentScans += present;
// // //             }
// // //         });

// // //         const avgAttendanceRate = totalExpectedScans > 0
// // //             ? Math.round((totalPresentScans / totalExpectedScans) * 100)
// // //             : 0;

// // //         return {
// // //             netExpectedTermDays,
// // //             daysCompleted,
// // //             holidaysCount,
// // //             recessCount,
// // //             avgAttendanceRate
// // //         };
// // //     }, [selectedCohortId, availableCohorts, history, holidays]);

// // //     // ── Leave Filtering ───────────────────────────────────────────────────────
// // //     const filteredLeaves = useMemo(() => {
// // //         return displayedLeavesData.filter(req => {
// // //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// // //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// // //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
// // //             return matchesSearch && matchesStatus && matchesType;
// // //         });
// // //     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// // //     const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

// // //     // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
// // //     const todayString = moment().format('YYYY-MM-DD');
// // //     const isFinalizedToday = selectedCohortId
// // //         ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
// // //         : false;

// // //     // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
// // //     const handleFinalizeRegister = async () => {
// // //         if (!selectedCohortId) return;

// // //         const cohortName = availableCohorts.find(c => c.id === selectedCohortId)?.name || 'this cohort';

// // //         setModalConfig({
// // //             isOpen: true,
// // //             type: 'warning',
// // //             title: 'Finalize Attendance?',
// // //             message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
// // //             confirmText: 'Yes, Finalize & Close',
// // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // //             onConfirm: async () => {
// // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // //                 setLoadingRegisters(true);

// // //                 try {
// // //                     // 1. Fetch ALL live scans for this cohort (ignoring the current clock date)
// // //                     const q = query(
// // //                         collection(db, 'live_attendance_scans'),
// // //                         where('cohortId', '==', selectedCohortId)
// // //                     );
// // //                     const liveSnap = await getDocs(q);

// // //                     if (liveSnap.empty) {
// // //                         toast.error("No live attendance data found to finalize.");
// // //                         setLoadingRegisters(false);
// // //                         return;
// // //                     }

// // //                     const batch = writeBatch(db);

// // //                     // 2. Group the scans by the date they ACTUALLY occurred
// // //                     const scansByDate: Record<string, any[]> = {};
// // //                     liveSnap.docs.forEach(d => {
// // //                         const data = d.data();
// // //                         const date = data.dateString;

// // //                         if (!scansByDate[date]) scansByDate[date] = [];
// // //                         scansByDate[date].push({ ref: d.ref, ...data });
// // //                     });

// // //                     // 3. Process each date group individually
// // //                     for (const [scanDate, scans] of Object.entries(scansByDate)) {
// // //                         const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];
// // //                         const historyRef = doc(collection(db, 'attendance'));

// // //                         // Save the permanent record using the SCAN DATE, not today's date
// // //                         batch.set(historyRef, {
// // //                             cohortId: selectedCohortId,
// // //                             cohortName: cohortName,
// // //                             date: scanDate,
// // //                             facilitatorId: facilitatorId || user?.uid || 'admin',
// // //                             presentLearners: presentLearnerIds,
// // //                             absentLearners: [],
// // //                             finalizedAt: serverTimestamp(),
// // //                             method: 'manual_close'
// // //                         });

// // //                         // Queue the live scans for deletion
// // //                         scans.forEach(s => batch.delete(s.ref));
// // //                     }

// // //                     // 4. Commit transaction
// // //                     await batch.commit();
// // //                     toast.success(`Register for ${cohortName} finalized successfully.`);

// // //                     // 5. Refresh local history
// // //                     let freshQuery;
// // //                     if (isAdmin) {
// // //                         freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // //                     } else {
// // //                         freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
// // //                     }
// // //                     const freshSnap = await getDocs(freshQuery);
// // //                     const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
// // //                     cachedHistory = freshData;
// // //                     setHistory(freshData);

// // //                 } catch (err: any) {
// // //                     console.error(err);
// // //                     toast.error(err.message || "Failed to finalize register.");
// // //                 } finally {
// // //                     setLoadingRegisters(false);
// // //                 }
// // //             }
// // //         });
// // //     };

// // //     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
// // //         setModalConfig({
// // //             isOpen: true,
// // //             type: status === 'Approved' ? 'success' : 'warning',
// // //             title: `Confirm ${status}`,
// // //             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
// // //             confirmText: `Yes, ${status}`,
// // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // //             onConfirm: async () => {
// // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // //                 try {
// // //                     await updateLeaveStatus(id, status);
// // //                     if (isAdmin) {
// // //                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
// // //                     }
// // //                     toast.success(`Leave request marked as ${status}.`);
// // //                 } catch (err) {
// // //                     toast.error('Failed to update the leave status. Please check your connection and try again.');
// // //                 }
// // //             }
// // //         });
// // //     };

// // //     if (loadingRegisters || (!isAdmin && !facilitatorId)) {
// // //         return (
// // //             <div className="att-loader-wrap">
// // //                 <Loader message="Loading Dashboard…" />
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div className="att-root animate-fade-in">
// // //             {modalConfig.isOpen && createPortal(
// // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // //                     <StatusModal
// // //                         type={modalConfig.type}
// // //                         title={modalConfig.title}
// // //                         message={modalConfig.message}
// // //                         confirmText={modalConfig.confirmText}
// // //                         onClose={() => {
// // //                             if (modalConfig.onConfirm) modalConfig.onConfirm();
// // //                             else setModalConfig(p => ({ ...p, isOpen: false }));
// // //                         }}
// // //                         onCancel={modalConfig.onCancel}
// // //                     />
// // //                 </div>,
// // //                 document.body
// // //             )}

// // //             <div className="att-tabs" role="tablist">
// // //                 <button
// // //                     role="tab"
// // //                     aria-selected={activeTab === 'registers'}
// // //                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
// // //                     onClick={() => setActiveTab('registers')}
// // //                 >
// // //                     <History size={14} /> Past Registers
// // //                 </button>
// // //                 <button
// // //                     role="tab"
// // //                     aria-selected={activeTab === 'leaves'}
// // //                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
// // //                     onClick={() => setActiveTab('leaves')}
// // //                 >
// // //                     <FileText size={14} /> Leave Requests
// // //                     {pendingLeaveCount > 0 && (
// // //                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
// // //                     )}
// // //                 </button>
// // //             </div>

// // //             {error && (
// // //                 <div className="att-error">
// // //                     <div className="att-error__title">
// // //                         <AlertTriangle size={15} /> Database Sync Error
// // //                     </div>
// // //                     <p className="att-error__body">{error}</p>
// // //                 </div>
// // //             )}

// // //             {activeTab === 'registers' && (
// // //                 <>
// // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// // //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// // //                                 <Search size={18} color="var(--mlab-grey)" />
// // //                                 <input
// // //                                     type="text"
// // //                                     placeholder="Search by date (e.g. 12 Oct)..."
// // //                                     value={registerSearch}
// // //                                     onChange={e => setRegisterSearch(e.target.value)}
// // //                                 />
// // //                             </div>
// // //                         </div>

// // //                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
// // //                             <select
// // //                                 value={selectedCohortId}
// // //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// // //                                 style={{
// // //                                     padding: '8px 12px',
// // //                                     borderRadius: '8px',
// // //                                     border: '1px solid var(--mlab-border)',
// // //                                     background: 'white',
// // //                                     fontFamily: 'var(--font-body)',
// // //                                     color: 'var(--mlab-blue)',
// // //                                     fontWeight: 600,
// // //                                     maxWidth: '220px'
// // //                                 }}
// // //                             >
// // //                                 <option value="">All Cohorts</option>
// // //                                 {availableCohorts.map(c => (
// // //                                     <option key={c.id} value={c.id}>
// // //                                         {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
// // //                                     </option>
// // //                                 ))}
// // //                             </select>

// // //                             <button
// // //                                 className="mlab-btn mlab-btn--outline"
// // //                                 onClick={() => {
// // //                                     const encodedAuth = btoa(JSON.stringify({
// // //                                         fid: facilitatorId || user?.uid || 'admin',
// // //                                         cid: selectedCohortId
// // //                                     }));
// // //                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
// // //                                     window.open(url, '_blank');
// // //                                 }}
// // //                                 style={{
// // //                                     whiteSpace: 'nowrap',
// // //                                     borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
// // //                                     color: isFinalizedToday ? '#94a3b8' : 'inherit',
// // //                                     cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // //                                 }}
// // //                                 disabled={!selectedCohortId || isFinalizedToday}
// // //                                 title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
// // //                             >
// // //                                 <Calendar size={16} /> Launch TV Kiosk
// // //                             </button>

// // //                             <button
// // //                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// // //                                 onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
// // //                                 style={{ whiteSpace: 'nowrap' }}
// // //                                 disabled={!selectedCohortId}
// // //                                 title={!selectedCohortId ? "Select a specific cohort to view" : ""}
// // //                             >
// // //                                 <Clock size={16} /> Live Dashboard
// // //                             </button>

// // //                             {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
// // //                             {selectedCohortId && (
// // //                                 <button
// // //                                     className="mlab-btn"
// // //                                     onClick={handleFinalizeRegister}
// // //                                     disabled={isFinalizedToday}
// // //                                     style={{
// // //                                         whiteSpace: 'nowrap',
// // //                                         borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
// // //                                         color: isFinalizedToday ? '#94a3b8' : '#ef4444',
// // //                                         background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
// // //                                         borderWidth: '1px',
// // //                                         borderStyle: 'solid',
// // //                                         cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // //                                     }}
// // //                                     title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
// // //                                 >
// // //                                     <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
// // //                                 </button>
// // //                             )}

// // //                             <button
// // //                                 className="mlab-btn mlab-btn--primary"
// // //                                 onClick={() => navigate('/facilitator/attendance/scanner')}
// // //                                 style={{ whiteSpace: 'nowrap' }}
// // //                             >
// // //                                 <ScanLine size={16} /> Scan Attendance
// // //                             </button>
// // //                         </div>
// // //                     </div>

// // //                     {/* 🚀 TERM ANALYTICS PANEL (Appears when Cohort Selected) 🚀 */}
// // //                     {selectedCohortId && cohortStats && (
// // //                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                 <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Target size={24} color="var(--mlab-blue)" /></div>
// // //                                 <div>
// // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Progress</p>
// // //                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
// // //                                         {cohortStats.daysCompleted} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>/ {cohortStats.netExpectedTermDays} Days</span>
// // //                                     </h3>
// // //                                 </div>
// // //                             </div>

// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                 <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
// // //                                 <div>
// // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Attendance</p>
// // //                                     <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
// // //                                         {cohortStats.avgAttendanceRate}%
// // //                                     </h3>
// // //                                 </div>
// // //                             </div>

// // //                             <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
// // //                                 <div style={{ background: '#fef3c7', padding: '12px', borderRadius: '50%' }}><Coffee size={24} color="#d97706" /></div>
// // //                                 <div>
// // //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Excluded Days</p>
// // //                                     <h3 style={{ margin: '4px 0 0', color: '#d97706', fontSize: '1.5rem' }}>
// // //                                         {cohortStats.holidaysCount + cohortStats.recessCount} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Off</span>
// // //                                     </h3>
// // //                                     <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
// // //                                         {cohortStats.holidaysCount} Holidays • {cohortStats.recessCount} Recess
// // //                                     </p>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     )}

// // //                     <div className="mlab-table-wrap">
// // //                         <table className="mlab-table">
// // //                             <thead>
// // //                                 <tr>
// // //                                     <th>Date Recorded</th>
// // //                                     {isAdmin && <th>Cohort</th>}
// // //                                     <th>Attendance</th>
// // //                                     <th>Proofs</th>
// // //                                     <th className="att-th--right">Action</th>
// // //                                 </tr>
// // //                             </thead>
// // //                             <tbody>
// // //                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
// // //                                     const proofCount = Object.keys(record.proofs || {}).length;
// // //                                     const presentCount = record.presentLearners?.length || 0;

// // //                                     // 🚀 FIX: Grab the saved name first, then fallback to the lookup, then fallback to Unknown
// // //                                     const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

// // //                                     return (
// // //                                         <tr key={record.id}>
// // //                                             <td>
// // //                                                 <div className="att-date-cell">
// // //                                                     <Calendar size={14} className="att-date-cell__icon" />
// // //                                                     <span className="att-date-cell__label">
// // //                                                         {moment(record.date).format('DD MMM YYYY')}
// // //                                                     </span>
// // //                                                 </div>
// // //                                             </td>
// // //                                             {isAdmin && (
// // //                                                 <td>
// // //                                                     <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
// // //                                                         {cohortName}
// // //                                                     </span>
// // //                                                 </td>
// // //                                             )}
// // //                                             <td>
// // //                                                 <span className="att-badge att-badge--present">
// // //                                                     <Users size={11} /> {presentCount} Present
// // //                                                 </span>
// // //                                             </td>
// // //                                             <td>
// // //                                                 {proofCount > 0 ? (
// // //                                                     <span className="att-badge att-badge--proof">
// // //                                                         <FileText size={11} /> {proofCount} Attached
// // //                                                     </span>
// // //                                                 ) : (
// // //                                                     <span className="att-no-data">None</span>
// // //                                                 )}
// // //                                             </td>
// // //                                             <td className="att-td--right">
// // //                                                 <button
// // //                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
// // //                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// // //                                                 >
// // //                                                     Open Register <ArrowRight size={13} />
// // //                                                 </button>
// // //                                             </td>
// // //                                         </tr>
// // //                                     );
// // //                                 }) : (
// // //                                     <tr>
// // //                                         <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
// // //                                             {history.length === 0 ? (
// // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // //                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // //                                                     <p className="mlab-empty__title">No Records Yet</p>
// // //                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// // //                                                 </div>
// // //                                             ) : (
// // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // //                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // //                                                     <p className="mlab-empty__title">No matches found</p>
// // //                                                     <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // //                                                     <button
// // //                                                         className="mlab-btn mlab-btn--outline"
// // //                                                         onClick={() => setRegisterSearch('')}
// // //                                                         style={{ marginTop: '1rem' }}
// // //                                                     >
// // //                                                         Clear Search
// // //                                                     </button>
// // //                                                 </div>
// // //                                             )}
// // //                                         </td>
// // //                                     </tr>
// // //                                 )}
// // //                             </tbody>
// // //                         </table>
// // //                     </div>
// // //                 </>
// // //             )}

// // //             {activeTab === 'leaves' && (
// // //                 <>
// // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // //                             <div className="mlab-search" style={{ minWidth: '220px' }}>
// // //                                 <Search size={18} color="var(--mlab-grey)" />
// // //                                 <input
// // //                                     type="text"
// // //                                     placeholder="Search by learner name..."
// // //                                     value={leaveSearch}
// // //                                     onChange={e => setLeaveSearch(e.target.value)}
// // //                                 />
// // //                             </div>

// // //                             <div className="mlab-select-wrap">
// // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // //                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
// // //                                     <option value="all">All Statuses</option>
// // //                                     <option value="Pending">Pending</option>
// // //                                     <option value="Approved">Approved</option>
// // //                                     <option value="Declined">Declined</option>
// // //                                 </select>
// // //                             </div>

// // //                             <div className="mlab-select-wrap">
// // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // //                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
// // //                                     <option value="all">All Reasons</option>
// // //                                     <option value="Sick Leave">Sick Leave</option>
// // //                                     <option value="Personal Emergency">Personal Emergency</option>
// // //                                     <option value="Interview">Interview</option>
// // //                                     <option value="Other">Other</option>
// // //                                 </select>
// // //                             </div>
// // //                         </div>
// // //                     </div>

// // //                     <div className="mlab-table-wrap">
// // //                         {isLeavesLoading ? (
// // //                             <div className="att-loader-wrap att-loader-wrap--inline">
// // //                                 <Loader message="Fetching requests…" />
// // //                             </div>
// // //                         ) : (
// // //                             <table className="mlab-table">
// // //                                 <thead>
// // //                                     <tr>
// // //                                         <th style={{ width: '15%' }}>Learner</th>
// // //                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
// // //                                         <th>Reason</th>
// // //                                         <th>Attachment</th>
// // //                                         <th>Status</th>
// // //                                         <th className="att-th--right">Actions</th>
// // //                                     </tr>
// // //                                 </thead>
// // //                                 <tbody>
// // //                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
// // //                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
// // //                                         const start = parseDate(req.startDate || req.dateAffected);
// // //                                         const end = parseDate(req.endDate || req.dateAffected);
// // //                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
// // //                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
// // //                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

// // //                                         return (
// // //                                             <tr key={req.id}>
// // //                                                 <td>
// // //                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     <div className="att-dates-cell">
// // //                                                         <div className="att-dates-cell__start">
// // //                                                             <Calendar size={13} className="att-dates-cell__icon" />
// // //                                                             <span className="att-dates-cell__label">{fmtStart}</span>
// // //                                                         </div>
// // //                                                         {!isSameDay && (
// // //                                                             <div className="att-dates-cell__end">
// // //                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
// // //                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
// // //                                                             </div>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     <div className="att-reason-cell">
// // //                                                         <span className="att-reason-cell__type">{req.type}</span>
// // //                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
// // //                                                     </div>
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     {req.attachmentUrl ? (
// // //                                                         <a
// // //                                                             href={req.attachmentUrl}
// // //                                                             target="_blank"
// // //                                                             rel="noopener noreferrer"
// // //                                                             className="att-attach-link"
// // //                                                             title={req.attachmentName || 'Download Document'}
// // //                                                         >
// // //                                                             <DownloadCloud size={14} />
// // //                                                             <span className="att-attach-link__text">
// // //                                                                 {req.attachmentName
// // //                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
// // //                                                                     : 'View File'}
// // //                                                             </span>
// // //                                                         </a>
// // //                                                     ) : (
// // //                                                         <span className="att-no-data">No Attachment</span>
// // //                                                     )}
// // //                                                 </td>

// // //                                                 <td>
// // //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// // //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// // //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// // //                                                 </td>

// // //                                                 <td className="att-td--right">
// // //                                                     {req.status === 'Pending' ? (
// // //                                                         <div className="att-action-btns">
// // //                                                             <button
// // //                                                                 className="att-btn att-btn--approve"
// // //                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
// // //                                                             >
// // //                                                                 <CheckCircle size={12} /> Approve
// // //                                                             </button>
// // //                                                             <button
// // //                                                                 className="att-btn att-btn--decline"
// // //                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
// // //                                                             >
// // //                                                                 <XCircle size={12} /> Decline
// // //                                                             </button>
// // //                                                         </div>
// // //                                                     ) : (
// // //                                                         <span className="att-reviewed-label">Reviewed</span>
// // //                                                     )}
// // //                                                 </td>
// // //                                             </tr>
// // //                                         );
// // //                                     }) : (
// // //                                         <tr>
// // //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// // //                                                 {displayedLeavesData.length === 0 ? (
// // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // //                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // //                                                         <p className="mlab-empty__title">All Caught Up!</p>
// // //                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
// // //                                                     </div>
// // //                                                 ) : (
// // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // //                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // //                                                         <p className="mlab-empty__title">No matches found</p>
// // //                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // //                                                         <button
// // //                                                             className="mlab-btn mlab-btn--outline"
// // //                                                             onClick={() => {
// // //                                                                 setLeaveSearch('');
// // //                                                                 setLeaveStatusFilter('all');
// // //                                                                 setLeaveTypeFilter('all');
// // //                                                             }}
// // //                                                             style={{ marginTop: '1rem' }}
// // //                                                         >
// // //                                                             Clear Filters
// // //                                                         </button>
// // //                                                     </div>
// // //                                                 )}
// // //                                             </td>
// // //                                         </tr>
// // //                                     )}
// // //                                 </tbody>
// // //                             </table>
// // //                         )}
// // //                     </div>
// // //                 </>
// // //             )}
// // //         </div>
// // //     );
// // // };


// // // // // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import {
// // // //     collection, query, where, getDocs, orderBy,
// // // //     doc, writeBatch, serverTimestamp
// // // // } from 'firebase/firestore';
// // // // import {
// // // //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// // // //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// // // //     DownloadCloud, Filter, ScanLine
// // // // } from 'lucide-react';
// // // // import { useNavigate } from 'react-router-dom';
// // // // import { db } from '../../../lib/firebase';
// // // // import Loader from '../../../components/common/Loader/Loader';
// // // // import moment from 'moment';
// // // // import '../../../components/views/LearnersView/LearnersView.css';
// // // // import './AttendanceHistoryList.css';
// // // // import { useStore } from '../../../store/useStore';
// // // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // // // import { useToast } from '../../../components/common/Toast/Toast';

// // // // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // // // let cachedHistory: any[] | null = null;

// // // // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// // // //     const navigate = useNavigate();
// // // //     const toast = useToast();

// // // //     // 🚀 ADMIN "GOD MODE" CHECK 🚀
// // // //     const user = useStore(s => s.user);
// // // //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

// // // //     // 🚀 COHORT SELECTOR LOGIC 🚀
// // // //     const allCohorts = useStore(s => s.cohorts) || [];
// // // //     const availableCohorts = useMemo(() => {
// // // //         if (isAdmin) return allCohorts;
// // // //         return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
// // // //     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

// // // //     // 🚀 Default to empty string ("All Cohorts")
// // // //     const [selectedCohortId, setSelectedCohortId] = useState<string>('');

// // // //     // NOTE: We intentionally REMOVED the auto-select useEffect here 
// // // //     // so it doesn't fight the "All Cohorts" dropdown selection!

// // // //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// // // //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// // // //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// // // //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// // // //     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
// // // //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// // // //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// // // //     const [error, setError] = useState<string | null>(null);

// // // //     // 🚀 ADMIN LEAVES STATE 🚀
// // // //     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
// // // //     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

// // // //     // ─── REGISTERS FILTER STATE ───
// // // //     const [registerSearch, setRegisterSearch] = useState('');

// // // //     // ─── LEAVE REQUESTS FILTER STATE ───
// // // //     const [leaveSearch, setLeaveSearch] = useState('');
// // // //     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
// // // //     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

// // // //     // ─── MODAL STATE ───
// // // //     const [modalConfig, setModalConfig] = useState<{
// // // //         isOpen: boolean;
// // // //         type: StatusType;
// // // //         title: string;
// // // //         message: string;
// // // //         confirmText?: string;
// // // //         onConfirm?: () => void;
// // // //         onCancel?: () => void;
// // // //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// // // //     // ── Fetch registers ───────────────────────────────────────────────────────
// // // //     useEffect(() => {
// // // //         const fetchHistory = async () => {
// // // //             if (!isAdmin && !facilitatorId) return;

// // // //             if (cachedHistory === null) setLoadingRegisters(true);
// // // //             setError(null);

// // // //             try {
// // // //                 let q;
// // // //                 if (isAdmin) {
// // // //                     q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // // //                 } else {
// // // //                     q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
// // // //                 }

// // // //                 const snap = await getDocs(q);
// // // //                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // //                 cachedHistory = fresh;
// // // //                 setHistory(fresh);
// // // //             } catch (err: any) {
// // // //                 console.error('Firestore Error:', err);
// // // //                 setError(err.message);
// // // //             } finally {
// // // //                 setLoadingRegisters(false);
// // // //             }
// // // //         };
// // // //         fetchHistory();
// // // //     }, [facilitatorId, isAdmin]);

// // // //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// // // //     useEffect(() => {
// // // //         if (activeTab === 'leaves') {
// // // //             if (isAdmin) {
// // // //                 setLoadingAdminLeaves(true);
// // // //                 getDocs(collection(db, 'leave_requests')).then(snap => {
// // // //                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // //                 }).finally(() => setLoadingAdminLeaves(false));
// // // //             } else if (facilitatorId && leaveRequests.length === 0) {
// // // //                 fetchFacilitatorLeaveRequests(facilitatorId);
// // // //             }
// // // //         }
// // // //     }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

// // // //     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
// // // //     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

// // // //     // ── Register Filtering ────────────────────────────────────────────────────
// // // //     const filteredHistory = useMemo(() => {
// // // //         let data = history;
// // // //         if (selectedCohortId) {
// // // //             data = data.filter(r => r.cohortId === selectedCohortId);
// // // //         }
// // // //         if (registerSearch) {
// // // //             const lower = registerSearch.toLowerCase();
// // // //             data = data.filter(r =>
// // // //                 moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
// // // //                 r.date.includes(lower)
// // // //             );
// // // //         }
// // // //         return data;
// // // //     }, [history, registerSearch, selectedCohortId]);

// // // //     // ── Leave Filtering ───────────────────────────────────────────────────────
// // // //     const filteredLeaves = useMemo(() => {
// // // //         return displayedLeavesData.filter(req => {
// // // //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// // // //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// // // //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
// // // //             return matchesSearch && matchesStatus && matchesType;
// // // //         });
// // // //     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// // // //     const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

// // // //     // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
// // // //     const todayString = moment().format('YYYY-MM-DD');
// // // //     const isFinalizedToday = selectedCohortId
// // // //         ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
// // // //         : false;

// // // //     // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
// // // //     const handleFinalizeRegister = async () => {
// // // //         if (!selectedCohortId) return;

// // // //         const cohortName = availableCohorts.find(c => c.id === selectedCohortId)?.name || 'this cohort';

// // // //         setModalConfig({
// // // //             isOpen: true,
// // // //             type: 'warning',
// // // //             title: 'Finalize Attendance?',
// // // //             message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
// // // //             confirmText: 'Yes, Finalize & Close',
// // // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // // //             onConfirm: async () => {
// // // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // // //                 setLoadingRegisters(true);

// // // //                 try {
// // // //                     // 1. Fetch ALL live scans for this cohort (ignoring the current clock date)
// // // //                     const q = query(
// // // //                         collection(db, 'live_attendance_scans'),
// // // //                         where('cohortId', '==', selectedCohortId)
// // // //                     );
// // // //                     const liveSnap = await getDocs(q);

// // // //                     if (liveSnap.empty) {
// // // //                         toast.error("No live attendance data found to finalize.");
// // // //                         setLoadingRegisters(false);
// // // //                         return;
// // // //                     }

// // // //                     const batch = writeBatch(db);

// // // //                     // 2. Group the scans by the date they ACTUALLY occurred
// // // //                     const scansByDate: Record<string, any[]> = {};
// // // //                     liveSnap.docs.forEach(d => {
// // // //                         const data = d.data();
// // // //                         const date = data.dateString;

// // // //                         if (!scansByDate[date]) scansByDate[date] = [];
// // // //                         scansByDate[date].push({ ref: d.ref, ...data });
// // // //                     });

// // // //                     // 3. Process each date group individually
// // // //                     for (const [scanDate, scans] of Object.entries(scansByDate)) {
// // // //                         const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];
// // // //                         const historyRef = doc(collection(db, 'attendance'));

// // // //                         // Save the permanent record using the SCAN DATE, not today's date
// // // //                         batch.set(historyRef, {
// // // //                             cohortId: selectedCohortId,
// // // //                             cohortName: cohortName,
// // // //                             date: scanDate,
// // // //                             facilitatorId: facilitatorId || user?.uid || 'admin',
// // // //                             presentLearners: presentLearnerIds,
// // // //                             absentLearners: [],
// // // //                             finalizedAt: serverTimestamp(),
// // // //                             method: 'manual_close'
// // // //                         });

// // // //                         // Queue the live scans for deletion
// // // //                         scans.forEach(s => batch.delete(s.ref));
// // // //                     }

// // // //                     // 4. Commit transaction
// // // //                     await batch.commit();
// // // //                     toast.success(`Register for ${cohortName} finalized successfully.`);

// // // //                     // 5. Refresh local history
// // // //                     let freshQuery;
// // // //                     if (isAdmin) {
// // // //                         freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // // //                     } else {
// // // //                         freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
// // // //                     }
// // // //                     const freshSnap = await getDocs(freshQuery);
// // // //                     const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // //                     cachedHistory = freshData;
// // // //                     setHistory(freshData);

// // // //                 } catch (err: any) {
// // // //                     console.error(err);
// // // //                     toast.error(err.message || "Failed to finalize register.");
// // // //                 } finally {
// // // //                     setLoadingRegisters(false);
// // // //                 }
// // // //             }
// // // //         });
// // // //     };

// // // //     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
// // // //         setModalConfig({
// // // //             isOpen: true,
// // // //             type: status === 'Approved' ? 'success' : 'warning',
// // // //             title: `Confirm ${status}`,
// // // //             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
// // // //             confirmText: `Yes, ${status}`,
// // // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // // //             onConfirm: async () => {
// // // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // // //                 try {
// // // //                     await updateLeaveStatus(id, status);
// // // //                     if (isAdmin) {
// // // //                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
// // // //                     }
// // // //                     toast.success(`Leave request marked as ${status}.`);
// // // //                 } catch (err) {
// // // //                     toast.error('Failed to update the leave status. Please check your connection and try again.');
// // // //                 }
// // // //             }
// // // //         });
// // // //     };

// // // //     if (loadingRegisters || (!isAdmin && !facilitatorId)) {
// // // //         return (
// // // //             <div className="att-loader-wrap">
// // // //                 <Loader message="Loading Dashboard…" />
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div className="att-root animate-fade-in">
// // // //             {modalConfig.isOpen && createPortal(
// // // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // // //                     <StatusModal
// // // //                         type={modalConfig.type}
// // // //                         title={modalConfig.title}
// // // //                         message={modalConfig.message}
// // // //                         confirmText={modalConfig.confirmText}
// // // //                         onClose={() => {
// // // //                             if (modalConfig.onConfirm) modalConfig.onConfirm();
// // // //                             else setModalConfig(p => ({ ...p, isOpen: false }));
// // // //                         }}
// // // //                         onCancel={modalConfig.onCancel}
// // // //                     />
// // // //                 </div>,
// // // //                 document.body
// // // //             )}

// // // //             <div className="att-tabs" role="tablist">
// // // //                 <button
// // // //                     role="tab"
// // // //                     aria-selected={activeTab === 'registers'}
// // // //                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
// // // //                     onClick={() => setActiveTab('registers')}
// // // //                 >
// // // //                     <History size={14} /> Past Registers
// // // //                 </button>
// // // //                 <button
// // // //                     role="tab"
// // // //                     aria-selected={activeTab === 'leaves'}
// // // //                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
// // // //                     onClick={() => setActiveTab('leaves')}
// // // //                 >
// // // //                     <FileText size={14} /> Leave Requests
// // // //                     {pendingLeaveCount > 0 && (
// // // //                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
// // // //                     )}
// // // //                 </button>
// // // //             </div>

// // // //             {error && (
// // // //                 <div className="att-error">
// // // //                     <div className="att-error__title">
// // // //                         <AlertTriangle size={15} /> Database Sync Error
// // // //                     </div>
// // // //                     <p className="att-error__body">{error}</p>
// // // //                 </div>
// // // //             )}

// // // //             {activeTab === 'registers' && (
// // // //                 <>
// // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// // // //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // //                                 <input
// // // //                                     type="text"
// // // //                                     placeholder="Search by date (e.g. 12 Oct)..."
// // // //                                     value={registerSearch}
// // // //                                     onChange={e => setRegisterSearch(e.target.value)}
// // // //                                 />
// // // //                             </div>
// // // //                         </div>

// // // //                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
// // // //                             <select
// // // //                                 value={selectedCohortId}
// // // //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// // // //                                 style={{
// // // //                                     padding: '8px 12px',
// // // //                                     borderRadius: '8px',
// // // //                                     border: '1px solid var(--mlab-border)',
// // // //                                     background: 'white',
// // // //                                     fontFamily: 'var(--font-body)',
// // // //                                     color: 'var(--mlab-blue)',
// // // //                                     fontWeight: 600,
// // // //                                     maxWidth: '220px'
// // // //                                 }}
// // // //                             >
// // // //                                 <option value="">All Cohorts</option>
// // // //                                 {availableCohorts.map(c => (
// // // //                                     <option key={c.id} value={c.id}>
// // // //                                         {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
// // // //                                     </option>
// // // //                                 ))}
// // // //                             </select>

// // // //                             <button
// // // //                                 className="mlab-btn mlab-btn--outline"
// // // //                                 onClick={() => {
// // // //                                     const encodedAuth = btoa(JSON.stringify({
// // // //                                         fid: facilitatorId || user?.uid || 'admin',
// // // //                                         cid: selectedCohortId
// // // //                                     }));
// // // //                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
// // // //                                     window.open(url, '_blank');
// // // //                                 }}
// // // //                                 style={{
// // // //                                     whiteSpace: 'nowrap',
// // // //                                     borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
// // // //                                     color: isFinalizedToday ? '#94a3b8' : 'inherit',
// // // //                                     cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // // //                                 }}
// // // //                                 disabled={!selectedCohortId || isFinalizedToday}
// // // //                                 title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
// // // //                             >
// // // //                                 <Calendar size={16} /> Launch TV Kiosk
// // // //                             </button>

// // // //                             <button
// // // //                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// // // //                                 onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
// // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // //                                 disabled={!selectedCohortId}
// // // //                                 title={!selectedCohortId ? "Select a specific cohort to view" : ""}
// // // //                             >
// // // //                                 <Clock size={16} /> Live Dashboard
// // // //                             </button>

// // // //                             {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
// // // //                             {selectedCohortId && (
// // // //                                 <button
// // // //                                     className="mlab-btn"
// // // //                                     onClick={handleFinalizeRegister}
// // // //                                     disabled={isFinalizedToday}
// // // //                                     style={{
// // // //                                         whiteSpace: 'nowrap',
// // // //                                         borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
// // // //                                         color: isFinalizedToday ? '#94a3b8' : '#ef4444',
// // // //                                         background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
// // // //                                         borderWidth: '1px',
// // // //                                         borderStyle: 'solid',
// // // //                                         cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // // //                                     }}
// // // //                                     title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
// // // //                                 >
// // // //                                     <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
// // // //                                 </button>
// // // //                             )}

// // // //                             <button
// // // //                                 className="mlab-btn mlab-btn--primary"
// // // //                                 onClick={() => navigate('/facilitator/attendance/scanner')}
// // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // //                             >
// // // //                                 <ScanLine size={16} /> Scan Attendance
// // // //                             </button>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="mlab-table-wrap">
// // // //                         <table className="mlab-table">
// // // //                             <thead>
// // // //                                 <tr>
// // // //                                     <th>Date Recorded</th>
// // // //                                     {isAdmin && <th>Cohort</th>}
// // // //                                     <th>Attendance</th>
// // // //                                     <th>Proofs</th>
// // // //                                     <th className="att-th--right">Action</th>
// // // //                                 </tr>
// // // //                             </thead>
// // // //                             <tbody>
// // // //                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
// // // //                                     const proofCount = Object.keys(record.proofs || {}).length;
// // // //                                     const presentCount = record.presentLearners?.length || 0;

// // // //                                     // 🚀 FIX: Grab the saved name first, then fallback to the lookup, then fallback to Unknown
// // // //                                     const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

// // // //                                     return (
// // // //                                         <tr key={record.id}>
// // // //                                             <td>
// // // //                                                 <div className="att-date-cell">
// // // //                                                     <Calendar size={14} className="att-date-cell__icon" />
// // // //                                                     <span className="att-date-cell__label">
// // // //                                                         {moment(record.date).format('DD MMM YYYY')}
// // // //                                                     </span>
// // // //                                                 </div>
// // // //                                             </td>
// // // //                                             {isAdmin && (
// // // //                                                 <td>
// // // //                                                     <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
// // // //                                                         {cohortName}
// // // //                                                     </span>
// // // //                                                 </td>
// // // //                                             )}
// // // //                                             <td>
// // // //                                                 <span className="att-badge att-badge--present">
// // // //                                                     <Users size={11} /> {presentCount} Present
// // // //                                                 </span>
// // // //                                             </td>
// // // //                                             <td>
// // // //                                                 {proofCount > 0 ? (
// // // //                                                     <span className="att-badge att-badge--proof">
// // // //                                                         <FileText size={11} /> {proofCount} Attached
// // // //                                                     </span>
// // // //                                                 ) : (
// // // //                                                     <span className="att-no-data">None</span>
// // // //                                                 )}
// // // //                                             </td>
// // // //                                             <td className="att-td--right">
// // // //                                                 <button
// // // //                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
// // // //                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// // // //                                                 >
// // // //                                                     Open Register <ArrowRight size={13} />
// // // //                                                 </button>
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     );
// // // //                                 }) : (
// // // //                                     <tr>
// // // //                                         <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
// // // //                                             {history.length === 0 ? (
// // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // //                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // //                                                     <p className="mlab-empty__title">No Records Yet</p>
// // // //                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// // // //                                                 </div>
// // // //                                             ) : (
// // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // //                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // //                                                     <p className="mlab-empty__title">No matches found</p>
// // // //                                                     <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // // //                                                     <button
// // // //                                                         className="mlab-btn mlab-btn--outline"
// // // //                                                         onClick={() => setRegisterSearch('')}
// // // //                                                         style={{ marginTop: '1rem' }}
// // // //                                                     >
// // // //                                                         Clear Search
// // // //                                                     </button>
// // // //                                                 </div>
// // // //                                             )}
// // // //                                         </td>
// // // //                                     </tr>
// // // //                                 )}
// // // //                             </tbody>
// // // //                         </table>
// // // //                     </div>
// // // //                 </>
// // // //             )}

// // // //             {activeTab === 'leaves' && (
// // // //                 <>
// // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // // //                             <div className="mlab-search" style={{ minWidth: '220px' }}>
// // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // //                                 <input
// // // //                                     type="text"
// // // //                                     placeholder="Search by learner name..."
// // // //                                     value={leaveSearch}
// // // //                                     onChange={e => setLeaveSearch(e.target.value)}
// // // //                                 />
// // // //                             </div>

// // // //                             <div className="mlab-select-wrap">
// // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // //                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
// // // //                                     <option value="all">All Statuses</option>
// // // //                                     <option value="Pending">Pending</option>
// // // //                                     <option value="Approved">Approved</option>
// // // //                                     <option value="Declined">Declined</option>
// // // //                                 </select>
// // // //                             </div>

// // // //                             <div className="mlab-select-wrap">
// // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // //                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
// // // //                                     <option value="all">All Reasons</option>
// // // //                                     <option value="Sick Leave">Sick Leave</option>
// // // //                                     <option value="Personal Emergency">Personal Emergency</option>
// // // //                                     <option value="Interview">Interview</option>
// // // //                                     <option value="Other">Other</option>
// // // //                                 </select>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="mlab-table-wrap">
// // // //                         {isLeavesLoading ? (
// // // //                             <div className="att-loader-wrap att-loader-wrap--inline">
// // // //                                 <Loader message="Fetching requests…" />
// // // //                             </div>
// // // //                         ) : (
// // // //                             <table className="mlab-table">
// // // //                                 <thead>
// // // //                                     <tr>
// // // //                                         <th style={{ width: '15%' }}>Learner</th>
// // // //                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
// // // //                                         <th>Reason</th>
// // // //                                         <th>Attachment</th>
// // // //                                         <th>Status</th>
// // // //                                         <th className="att-th--right">Actions</th>
// // // //                                     </tr>
// // // //                                 </thead>
// // // //                                 <tbody>
// // // //                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
// // // //                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
// // // //                                         const start = parseDate(req.startDate || req.dateAffected);
// // // //                                         const end = parseDate(req.endDate || req.dateAffected);
// // // //                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
// // // //                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
// // // //                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

// // // //                                         return (
// // // //                                             <tr key={req.id}>
// // // //                                                 <td>
// // // //                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
// // // //                                                 </td>

// // // //                                                 <td>
// // // //                                                     <div className="att-dates-cell">
// // // //                                                         <div className="att-dates-cell__start">
// // // //                                                             <Calendar size={13} className="att-dates-cell__icon" />
// // // //                                                             <span className="att-dates-cell__label">{fmtStart}</span>
// // // //                                                         </div>
// // // //                                                         {!isSameDay && (
// // // //                                                             <div className="att-dates-cell__end">
// // // //                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
// // // //                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
// // // //                                                             </div>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 </td>

// // // //                                                 <td>
// // // //                                                     <div className="att-reason-cell">
// // // //                                                         <span className="att-reason-cell__type">{req.type}</span>
// // // //                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
// // // //                                                     </div>
// // // //                                                 </td>

// // // //                                                 <td>
// // // //                                                     {req.attachmentUrl ? (
// // // //                                                         <a
// // // //                                                             href={req.attachmentUrl}
// // // //                                                             target="_blank"
// // // //                                                             rel="noopener noreferrer"
// // // //                                                             className="att-attach-link"
// // // //                                                             title={req.attachmentName || 'Download Document'}
// // // //                                                         >
// // // //                                                             <DownloadCloud size={14} />
// // // //                                                             <span className="att-attach-link__text">
// // // //                                                                 {req.attachmentName
// // // //                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
// // // //                                                                     : 'View File'}
// // // //                                                             </span>
// // // //                                                         </a>
// // // //                                                     ) : (
// // // //                                                         <span className="att-no-data">No Attachment</span>
// // // //                                                     )}
// // // //                                                 </td>

// // // //                                                 <td>
// // // //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// // // //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// // // //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// // // //                                                 </td>

// // // //                                                 <td className="att-td--right">
// // // //                                                     {req.status === 'Pending' ? (
// // // //                                                         <div className="att-action-btns">
// // // //                                                             <button
// // // //                                                                 className="att-btn att-btn--approve"
// // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
// // // //                                                             >
// // // //                                                                 <CheckCircle size={12} /> Approve
// // // //                                                             </button>
// // // //                                                             <button
// // // //                                                                 className="att-btn att-btn--decline"
// // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
// // // //                                                             >
// // // //                                                                 <XCircle size={12} /> Decline
// // // //                                                             </button>
// // // //                                                         </div>
// // // //                                                     ) : (
// // // //                                                         <span className="att-reviewed-label">Reviewed</span>
// // // //                                                     )}
// // // //                                                 </td>
// // // //                                             </tr>
// // // //                                         );
// // // //                                     }) : (
// // // //                                         <tr>
// // // //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// // // //                                                 {displayedLeavesData.length === 0 ? (
// // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // //                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // //                                                         <p className="mlab-empty__title">All Caught Up!</p>
// // // //                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
// // // //                                                     </div>
// // // //                                                 ) : (
// // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // //                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // //                                                         <p className="mlab-empty__title">No matches found</p>
// // // //                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // // //                                                         <button
// // // //                                                             className="mlab-btn mlab-btn--outline"
// // // //                                                             onClick={() => {
// // // //                                                                 setLeaveSearch('');
// // // //                                                                 setLeaveStatusFilter('all');
// // // //                                                                 setLeaveTypeFilter('all');
// // // //                                                             }}
// // // //                                                             style={{ marginTop: '1rem' }}
// // // //                                                         >
// // // //                                                             Clear Filters
// // // //                                                         </button>
// // // //                                                     </div>
// // // //                                                 )}
// // // //                                             </td>
// // // //                                         </tr>
// // // //                                     )}
// // // //                                 </tbody>
// // // //                             </table>
// // // //                         )}
// // // //                     </div>
// // // //                 </>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };



// // // // // // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// // // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import {
// // // // //     collection, query, where, getDocs, orderBy,
// // // // //     doc, writeBatch, serverTimestamp
// // // // // } from 'firebase/firestore';
// // // // // import {
// // // // //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// // // // //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// // // // //     DownloadCloud, Filter, ScanLine
// // // // // } from 'lucide-react';
// // // // // import { useNavigate } from 'react-router-dom';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import Loader from '../../../components/common/Loader/Loader';
// // // // // import moment from 'moment';
// // // // // import '../../../components/views/LearnersView/LearnersView.css';
// // // // // import './AttendanceHistoryList.css';
// // // // // import { useStore } from '../../../store/useStore';
// // // // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // // // // import { useToast } from '../../../components/common/Toast/Toast';

// // // // // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // // // // let cachedHistory: any[] | null = null;

// // // // // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// // // // //     const navigate = useNavigate();
// // // // //     const toast = useToast();

// // // // //     // 🚀 ADMIN "GOD MODE" CHECK 🚀
// // // // //     const user = useStore(s => s.user);
// // // // //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

// // // // //     // 🚀 COHORT SELECTOR LOGIC 🚀
// // // // //     const allCohorts = useStore(s => s.cohorts) || [];
// // // // //     const availableCohorts = useMemo(() => {
// // // // //         if (isAdmin) return allCohorts;
// // // // //         return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
// // // // //     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

// // // // //     const [selectedCohortId, setSelectedCohortId] = useState<string>('');

// // // // //     // Auto-select the first available cohort on load
// // // // //     useEffect(() => {
// // // // //         if (availableCohorts.length > 0 && !selectedCohortId) {
// // // // //             setSelectedCohortId(availableCohorts[0].id);
// // // // //         }
// // // // //     }, [availableCohorts, selectedCohortId]);

// // // // //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// // // // //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// // // // //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// // // // //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// // // // //     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
// // // // //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// // // // //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// // // // //     const [error, setError] = useState<string | null>(null);

// // // // //     // 🚀 ADMIN LEAVES STATE 🚀
// // // // //     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
// // // // //     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

// // // // //     // ─── REGISTERS FILTER STATE ───
// // // // //     const [registerSearch, setRegisterSearch] = useState('');

// // // // //     // ─── LEAVE REQUESTS FILTER STATE ───
// // // // //     const [leaveSearch, setLeaveSearch] = useState('');
// // // // //     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
// // // // //     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

// // // // //     // ─── MODAL STATE ───
// // // // //     const [modalConfig, setModalConfig] = useState<{
// // // // //         isOpen: boolean;
// // // // //         type: StatusType;
// // // // //         title: string;
// // // // //         message: string;
// // // // //         confirmText?: string;
// // // // //         onConfirm?: () => void;
// // // // //         onCancel?: () => void;
// // // // //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// // // // //     // ── Fetch registers ───────────────────────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         const fetchHistory = async () => {
// // // // //             if (!isAdmin && !facilitatorId) return;

// // // // //             if (cachedHistory === null) setLoadingRegisters(true);
// // // // //             setError(null);

// // // // //             try {
// // // // //                 let q;
// // // // //                 if (isAdmin) {
// // // // //                     q = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // // // //                 } else {
// // // // //                     q = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId), orderBy('date', 'desc'));
// // // // //                 }

// // // // //                 const snap = await getDocs(q);
// // // // //                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // // //                 cachedHistory = fresh;
// // // // //                 setHistory(fresh);
// // // // //             } catch (err: any) {
// // // // //                 console.error('Firestore Error:', err);
// // // // //                 setError(err.message);
// // // // //             } finally {
// // // // //                 setLoadingRegisters(false);
// // // // //             }
// // // // //         };
// // // // //         fetchHistory();
// // // // //     }, [facilitatorId, isAdmin]);

// // // // //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// // // // //     useEffect(() => {
// // // // //         if (activeTab === 'leaves') {
// // // // //             if (isAdmin) {
// // // // //                 setLoadingAdminLeaves(true);
// // // // //                 getDocs(collection(db, 'leave_requests')).then(snap => {
// // // // //                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// // // // //                 }).finally(() => setLoadingAdminLeaves(false));
// // // // //             } else if (facilitatorId && leaveRequests.length === 0) {
// // // // //                 fetchFacilitatorLeaveRequests(facilitatorId);
// // // // //             }
// // // // //         }
// // // // //     }, [activeTab, facilitatorId, isAdmin, fetchFacilitatorLeaveRequests, leaveRequests.length]);

// // // // //     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
// // // // //     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

// // // // //     // ── Register Filtering ────────────────────────────────────────────────────
// // // // //     const filteredHistory = useMemo(() => {
// // // // //         let data = history;
// // // // //         if (selectedCohortId) {
// // // // //             data = data.filter(r => r.cohortId === selectedCohortId);
// // // // //         }
// // // // //         if (registerSearch) {
// // // // //             const lower = registerSearch.toLowerCase();
// // // // //             data = data.filter(r =>
// // // // //                 moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
// // // // //                 r.date.includes(lower)
// // // // //             );
// // // // //         }
// // // // //         return data;
// // // // //     }, [history, registerSearch, selectedCohortId]);

// // // // //     // ── Leave Filtering ───────────────────────────────────────────────────────
// // // // //     const filteredLeaves = useMemo(() => {
// // // // //         return displayedLeavesData.filter(req => {
// // // // //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// // // // //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// // // // //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
// // // // //             return matchesSearch && matchesStatus && matchesType;
// // // // //         });
// // // // //     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// // // // //     const pendingLeaveCount = displayedLeavesData.filter(r => r.status === 'Pending').length;

// // // // //     // 🚀 STATE-DRIVEN RECONCILIATION CHECK 🚀
// // // // //     const todayString = moment().format('YYYY-MM-DD');
// // // // //     const isFinalizedToday = selectedCohortId
// // // // //         ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
// // // // //         : false;

// // // // //     // ── FINALIZE & CLOSE DAY LOGIC (BULLETPROOF BOUNDARY RECONCILIATION) ──────
// // // // //     const handleFinalizeRegister = async () => {
// // // // //         if (!selectedCohortId) return;

// // // // //         const cohortName = availableCohorts.find(c => c.id === selectedCohortId)?.name || 'this cohort';

// // // // //         setModalConfig({
// // // // //             isOpen: true,
// // // // //             type: 'warning',
// // // // //             title: 'Finalize Attendance?',
// // // // //             message: `This will close the session for ${cohortName}, save the finalized register to history, and clear the live board.`,
// // // // //             confirmText: 'Yes, Finalize & Close',
// // // // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // // // //             onConfirm: async () => {
// // // // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // // // //                 setLoadingRegisters(true);

// // // // //                 try {
// // // // //                     // 1. Fetch ALL live scans for this cohort (ignoring the current clock date)
// // // // //                     const q = query(
// // // // //                         collection(db, 'live_attendance_scans'),
// // // // //                         where('cohortId', '==', selectedCohortId)
// // // // //                     );
// // // // //                     const liveSnap = await getDocs(q);

// // // // //                     if (liveSnap.empty) {
// // // // //                         toast.error("No live attendance data found to finalize.");
// // // // //                         setLoadingRegisters(false);
// // // // //                         return;
// // // // //                     }

// // // // //                     const batch = writeBatch(db);

// // // // //                     // 2. Group the scans by the date they ACTUALLY occurred
// // // // //                     const scansByDate: Record<string, any[]> = {};
// // // // //                     liveSnap.docs.forEach(d => {
// // // // //                         const data = d.data();
// // // // //                         const date = data.dateString;

// // // // //                         if (!scansByDate[date]) scansByDate[date] = [];
// // // // //                         scansByDate[date].push({ ref: d.ref, ...data });
// // // // //                     });

// // // // //                     // 3. Process each date group individually
// // // // //                     for (const [scanDate, scans] of Object.entries(scansByDate)) {
// // // // //                         const presentLearnerIds = [...new Set(scans.map(s => s.learnerId))];
// // // // //                         const historyRef = doc(collection(db, 'attendance'));

// // // // //                         // Save the permanent record using the SCAN DATE, not today's date
// // // // //                         batch.set(historyRef, {
// // // // //                             cohortId: selectedCohortId,
// // // // //                             cohortName: cohortName,
// // // // //                             date: scanDate,
// // // // //                             facilitatorId: facilitatorId || user?.uid || 'admin',
// // // // //                             presentLearners: presentLearnerIds,
// // // // //                             absentLearners: [],
// // // // //                             finalizedAt: serverTimestamp(),
// // // // //                             method: 'manual_close'
// // // // //                         });

// // // // //                         // Queue the live scans for deletion
// // // // //                         scans.forEach(s => batch.delete(s.ref));
// // // // //                     }

// // // // //                     // 4. Commit transaction
// // // // //                     await batch.commit();
// // // // //                     toast.success(`Register for ${cohortName} finalized successfully.`);

// // // // //                     // 5. Refresh local history
// // // // //                     let freshQuery;
// // // // //                     if (isAdmin) {
// // // // //                         freshQuery = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// // // // //                     } else {
// // // // //                         freshQuery = query(collection(db, 'attendance'), where('facilitatorId', '==', facilitatorId || user?.uid), orderBy('date', 'desc'));
// // // // //                     }
// // // // //                     const freshSnap = await getDocs(freshQuery);
// // // // //                     const freshData = freshSnap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // // //                     cachedHistory = freshData;
// // // // //                     setHistory(freshData);

// // // // //                 } catch (err: any) {
// // // // //                     console.error(err);
// // // // //                     toast.error(err.message || "Failed to finalize register.");
// // // // //                 } finally {
// // // // //                     setLoadingRegisters(false);
// // // // //                 }
// // // // //             }
// // // // //         });
// // // // //     };

// // // // //     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
// // // // //         setModalConfig({
// // // // //             isOpen: true,
// // // // //             type: status === 'Approved' ? 'success' : 'warning',
// // // // //             title: `Confirm ${status}`,
// // // // //             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
// // // // //             confirmText: `Yes, ${status}`,
// // // // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // // // //             onConfirm: async () => {
// // // // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // // // //                 try {
// // // // //                     await updateLeaveStatus(id, status);
// // // // //                     if (isAdmin) {
// // // // //                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status } : req));
// // // // //                     }
// // // // //                     toast.success(`Leave request marked as ${status}.`);
// // // // //                 } catch (err) {
// // // // //                     toast.error('Failed to update the leave status. Please check your connection and try again.');
// // // // //                 }
// // // // //             }
// // // // //         });
// // // // //     };

// // // // //     if (loadingRegisters || (!isAdmin && !facilitatorId)) {
// // // // //         return (
// // // // //             <div className="att-loader-wrap">
// // // // //                 <Loader message="Loading Dashboard…" />
// // // // //             </div>
// // // // //         );
// // // // //     }

// // // // //     return (
// // // // //         <div className="att-root animate-fade-in">
// // // // //             {modalConfig.isOpen && createPortal(
// // // // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // // // //                     <StatusModal
// // // // //                         type={modalConfig.type}
// // // // //                         title={modalConfig.title}
// // // // //                         message={modalConfig.message}
// // // // //                         confirmText={modalConfig.confirmText}
// // // // //                         onClose={() => {
// // // // //                             if (modalConfig.onConfirm) modalConfig.onConfirm();
// // // // //                             else setModalConfig(p => ({ ...p, isOpen: false }));
// // // // //                         }}
// // // // //                         onCancel={modalConfig.onCancel}
// // // // //                     />
// // // // //                 </div>,
// // // // //                 document.body
// // // // //             )}

// // // // //             <div className="att-tabs" role="tablist">
// // // // //                 <button
// // // // //                     role="tab"
// // // // //                     aria-selected={activeTab === 'registers'}
// // // // //                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
// // // // //                     onClick={() => setActiveTab('registers')}
// // // // //                 >
// // // // //                     <History size={14} /> Past Registers
// // // // //                 </button>
// // // // //                 <button
// // // // //                     role="tab"
// // // // //                     aria-selected={activeTab === 'leaves'}
// // // // //                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
// // // // //                     onClick={() => setActiveTab('leaves')}
// // // // //                 >
// // // // //                     <FileText size={14} /> Leave Requests
// // // // //                     {pendingLeaveCount > 0 && (
// // // // //                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
// // // // //                     )}
// // // // //                 </button>
// // // // //             </div>

// // // // //             {error && (
// // // // //                 <div className="att-error">
// // // // //                     <div className="att-error__title">
// // // // //                         <AlertTriangle size={15} /> Database Sync Error
// // // // //                     </div>
// // // // //                     <p className="att-error__body">{error}</p>
// // // // //                 </div>
// // // // //             )}

// // // // //             {activeTab === 'registers' && (
// // // // //                 <>
// // // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// // // // //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// // // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // // //                                 <input
// // // // //                                     type="text"
// // // // //                                     placeholder="Search by date (e.g. 12 Oct)..."
// // // // //                                     value={registerSearch}
// // // // //                                     onChange={e => setRegisterSearch(e.target.value)}
// // // // //                                 />
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
// // // // //                             <select
// // // // //                                 value={selectedCohortId}
// // // // //                                 onChange={(e) => setSelectedCohortId(e.target.value)}
// // // // //                                 style={{
// // // // //                                     padding: '8px 12px',
// // // // //                                     borderRadius: '8px',
// // // // //                                     border: '1px solid var(--mlab-border)',
// // // // //                                     background: 'white',
// // // // //                                     fontFamily: 'var(--font-body)',
// // // // //                                     color: 'var(--mlab-blue)',
// // // // //                                     fontWeight: 600,
// // // // //                                     maxWidth: '220px'
// // // // //                                 }}
// // // // //                             >
// // // // //                                 <option value="">All Cohorts</option>
// // // // //                                 {availableCohorts.map(c => (
// // // // //                                     <option key={c.id} value={c.id}>
// // // // //                                         {c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}
// // // // //                                     </option>
// // // // //                                 ))}
// // // // //                             </select>

// // // // //                             <button
// // // // //                                 className="mlab-btn mlab-btn--outline"
// // // // //                                 onClick={() => {
// // // // //                                     const encodedAuth = btoa(JSON.stringify({
// // // // //                                         fid: facilitatorId || user?.uid || 'admin',
// // // // //                                         cid: selectedCohortId
// // // // //                                     }));
// // // // //                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
// // // // //                                     window.open(url, '_blank');
// // // // //                                 }}
// // // // //                                 style={{
// // // // //                                     whiteSpace: 'nowrap',
// // // // //                                     borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)',
// // // // //                                     color: isFinalizedToday ? '#94a3b8' : 'inherit',
// // // // //                                     cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // // // //                                 }}
// // // // //                                 disabled={!selectedCohortId || isFinalizedToday}
// // // // //                                 title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}
// // // // //                             >
// // // // //                                 <Calendar size={16} /> Launch TV Kiosk
// // // // //                             </button>

// // // // //                             <button
// // // // //                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// // // // //                                 onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
// // // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // // //                                 disabled={!selectedCohortId}
// // // // //                                 title={!selectedCohortId ? "Select a specific cohort to view" : ""}
// // // // //                             >
// // // // //                                 <Clock size={16} /> Live Dashboard
// // // // //                             </button>

// // // // //                             {/* 🚀 STATE-DRIVEN FINALIZE BUTTON 🚀 */}
// // // // //                             {selectedCohortId && (
// // // // //                                 <button
// // // // //                                     className="mlab-btn"
// // // // //                                     onClick={handleFinalizeRegister}
// // // // //                                     disabled={isFinalizedToday}
// // // // //                                     style={{
// // // // //                                         whiteSpace: 'nowrap',
// // // // //                                         borderColor: isFinalizedToday ? '#cbd5e1' : '#ef4444',
// // // // //                                         color: isFinalizedToday ? '#94a3b8' : '#ef4444',
// // // // //                                         background: isFinalizedToday ? '#f8fafc' : 'rgba(239, 68, 68, 0.05)',
// // // // //                                         borderWidth: '1px',
// // // // //                                         borderStyle: 'solid',
// // // // //                                         cursor: isFinalizedToday ? 'not-allowed' : 'pointer'
// // // // //                                     }}
// // // // //                                     title={isFinalizedToday ? "Already reconciled for today" : "Close register and lock attendance"}
// // // // //                                 >
// // // // //                                     <CheckCircle size={16} /> {isFinalizedToday ? 'Reconciled for Today' : 'Finalize & Close Day'}
// // // // //                                 </button>
// // // // //                             )}

// // // // //                             <button
// // // // //                                 className="mlab-btn mlab-btn--primary"
// // // // //                                 onClick={() => navigate('/facilitator/attendance/scanner')}
// // // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // // //                             >
// // // // //                                 <ScanLine size={16} /> Scan Attendance
// // // // //                             </button>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div className="mlab-table-wrap">
// // // // //                         <table className="mlab-table">
// // // // //                             <thead>
// // // // //                                 <tr>
// // // // //                                     <th>Date Recorded</th>
// // // // //                                     {isAdmin && <th>Cohort</th>}
// // // // //                                     <th>Attendance</th>
// // // // //                                     <th>Proofs</th>
// // // // //                                     <th className="att-th--right">Action</th>
// // // // //                                 </tr>
// // // // //                             </thead>
// // // // //                             <tbody>
// // // // //                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
// // // // //                                     const proofCount = Object.keys(record.proofs || {}).length;
// // // // //                                     const presentCount = record.presentLearners?.length || 0;
// // // // //                                     const cohortName = allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

// // // // //                                     return (
// // // // //                                         <tr key={record.id}>
// // // // //                                             <td>
// // // // //                                                 <div className="att-date-cell">
// // // // //                                                     <Calendar size={14} className="att-date-cell__icon" />
// // // // //                                                     <span className="att-date-cell__label">
// // // // //                                                         {moment(record.date).format('DD MMM YYYY')}
// // // // //                                                     </span>
// // // // //                                                 </div>
// // // // //                                             </td>
// // // // //                                             {isAdmin && (
// // // // //                                                 <td>
// // // // //                                                     <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
// // // // //                                                         {cohortName}
// // // // //                                                     </span>
// // // // //                                                 </td>
// // // // //                                             )}
// // // // //                                             <td>
// // // // //                                                 <span className="att-badge att-badge--present">
// // // // //                                                     <Users size={11} /> {presentCount} Present
// // // // //                                                 </span>
// // // // //                                             </td>
// // // // //                                             <td>
// // // // //                                                 {proofCount > 0 ? (
// // // // //                                                     <span className="att-badge att-badge--proof">
// // // // //                                                         <FileText size={11} /> {proofCount} Attached
// // // // //                                                     </span>
// // // // //                                                 ) : (
// // // // //                                                     <span className="att-no-data">None</span>
// // // // //                                                 )}
// // // // //                                             </td>
// // // // //                                             <td className="att-td--right">
// // // // //                                                 <button
// // // // //                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
// // // // //                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// // // // //                                                 >
// // // // //                                                     Open Register <ArrowRight size={13} />
// // // // //                                                 </button>
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     );
// // // // //                                 }) : (
// // // // //                                     <tr>
// // // // //                                         <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
// // // // //                                             {history.length === 0 ? (
// // // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // //                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // //                                                     <p className="mlab-empty__title">No Records Yet</p>
// // // // //                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// // // // //                                                 </div>
// // // // //                                             ) : (
// // // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // //                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // //                                                     <p className="mlab-empty__title">No matches found</p>
// // // // //                                                     <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // // // //                                                     <button
// // // // //                                                         className="mlab-btn mlab-btn--outline"
// // // // //                                                         onClick={() => setRegisterSearch('')}
// // // // //                                                         style={{ marginTop: '1rem' }}
// // // // //                                                     >
// // // // //                                                         Clear Search
// // // // //                                                     </button>
// // // // //                                                 </div>
// // // // //                                             )}
// // // // //                                         </td>
// // // // //                                     </tr>
// // // // //                                 )}
// // // // //                             </tbody>
// // // // //                         </table>
// // // // //                     </div>
// // // // //                 </>
// // // // //             )}

// // // // //             {activeTab === 'leaves' && (
// // // // //                 <>
// // // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // // // //                             <div className="mlab-search" style={{ minWidth: '220px' }}>
// // // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // // //                                 <input
// // // // //                                     type="text"
// // // // //                                     placeholder="Search by learner name..."
// // // // //                                     value={leaveSearch}
// // // // //                                     onChange={e => setLeaveSearch(e.target.value)}
// // // // //                                 />
// // // // //                             </div>

// // // // //                             <div className="mlab-select-wrap">
// // // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // // //                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
// // // // //                                     <option value="all">All Statuses</option>
// // // // //                                     <option value="Pending">Pending</option>
// // // // //                                     <option value="Approved">Approved</option>
// // // // //                                     <option value="Declined">Declined</option>
// // // // //                                 </select>
// // // // //                             </div>

// // // // //                             <div className="mlab-select-wrap">
// // // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // // //                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
// // // // //                                     <option value="all">All Reasons</option>
// // // // //                                     <option value="Sick Leave">Sick Leave</option>
// // // // //                                     <option value="Personal Emergency">Personal Emergency</option>
// // // // //                                     <option value="Interview">Interview</option>
// // // // //                                     <option value="Other">Other</option>
// // // // //                                 </select>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>

// // // // //                     <div className="mlab-table-wrap">
// // // // //                         {isLeavesLoading ? (
// // // // //                             <div className="att-loader-wrap att-loader-wrap--inline">
// // // // //                                 <Loader message="Fetching requests…" />
// // // // //                             </div>
// // // // //                         ) : (
// // // // //                             <table className="mlab-table">
// // // // //                                 <thead>
// // // // //                                     <tr>
// // // // //                                         <th style={{ width: '15%' }}>Learner</th>
// // // // //                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
// // // // //                                         <th>Reason</th>
// // // // //                                         <th>Attachment</th>
// // // // //                                         <th>Status</th>
// // // // //                                         <th className="att-th--right">Actions</th>
// // // // //                                     </tr>
// // // // //                                 </thead>
// // // // //                                 <tbody>
// // // // //                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
// // // // //                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
// // // // //                                         const start = parseDate(req.startDate || req.dateAffected);
// // // // //                                         const end = parseDate(req.endDate || req.dateAffected);
// // // // //                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
// // // // //                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
// // // // //                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

// // // // //                                         return (
// // // // //                                             <tr key={req.id}>
// // // // //                                                 <td>
// // // // //                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
// // // // //                                                 </td>

// // // // //                                                 <td>
// // // // //                                                     <div className="att-dates-cell">
// // // // //                                                         <div className="att-dates-cell__start">
// // // // //                                                             <Calendar size={13} className="att-dates-cell__icon" />
// // // // //                                                             <span className="att-dates-cell__label">{fmtStart}</span>
// // // // //                                                         </div>
// // // // //                                                         {!isSameDay && (
// // // // //                                                             <div className="att-dates-cell__end">
// // // // //                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
// // // // //                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
// // // // //                                                             </div>
// // // // //                                                         )}
// // // // //                                                     </div>
// // // // //                                                 </td>

// // // // //                                                 <td>
// // // // //                                                     <div className="att-reason-cell">
// // // // //                                                         <span className="att-reason-cell__type">{req.type}</span>
// // // // //                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
// // // // //                                                     </div>
// // // // //                                                 </td>

// // // // //                                                 <td>
// // // // //                                                     {req.attachmentUrl ? (
// // // // //                                                         <a
// // // // //                                                             href={req.attachmentUrl}
// // // // //                                                             target="_blank"
// // // // //                                                             rel="noopener noreferrer"
// // // // //                                                             className="att-attach-link"
// // // // //                                                             title={req.attachmentName || 'Download Document'}
// // // // //                                                         >
// // // // //                                                             <DownloadCloud size={14} />
// // // // //                                                             <span className="att-attach-link__text">
// // // // //                                                                 {req.attachmentName
// // // // //                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
// // // // //                                                                     : 'View File'}
// // // // //                                                             </span>
// // // // //                                                         </a>
// // // // //                                                     ) : (
// // // // //                                                         <span className="att-no-data">No Attachment</span>
// // // // //                                                     )}
// // // // //                                                 </td>

// // // // //                                                 <td>
// // // // //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// // // // //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// // // // //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// // // // //                                                 </td>

// // // // //                                                 <td className="att-td--right">
// // // // //                                                     {req.status === 'Pending' ? (
// // // // //                                                         <div className="att-action-btns">
// // // // //                                                             <button
// // // // //                                                                 className="att-btn att-btn--approve"
// // // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
// // // // //                                                             >
// // // // //                                                                 <CheckCircle size={12} /> Approve
// // // // //                                                             </button>
// // // // //                                                             <button
// // // // //                                                                 className="att-btn att-btn--decline"
// // // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
// // // // //                                                             >
// // // // //                                                                 <XCircle size={12} /> Decline
// // // // //                                                             </button>
// // // // //                                                         </div>
// // // // //                                                     ) : (
// // // // //                                                         <span className="att-reviewed-label">Reviewed</span>
// // // // //                                                     )}
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         );
// // // // //                                     }) : (
// // // // //                                         <tr>
// // // // //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// // // // //                                                 {displayedLeavesData.length === 0 ? (
// // // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // //                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // //                                                         <p className="mlab-empty__title">All Caught Up!</p>
// // // // //                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
// // // // //                                                     </div>
// // // // //                                                 ) : (
// // // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // //                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // //                                                         <p className="mlab-empty__title">No matches found</p>
// // // // //                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // // // //                                                         <button
// // // // //                                                             className="mlab-btn mlab-btn--outline"
// // // // //                                                             onClick={() => {
// // // // //                                                                 setLeaveSearch('');
// // // // //                                                                 setLeaveStatusFilter('all');
// // // // //                                                                 setLeaveTypeFilter('all');
// // // // //                                                             }}
// // // // //                                                             style={{ marginTop: '1rem' }}
// // // // //                                                         >
// // // // //                                                             Clear Filters
// // // // //                                                         </button>
// // // // //                                                     </div>
// // // // //                                                 )}
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     )}
// // // // //                                 </tbody>
// // // // //                             </table>
// // // // //                         )}
// // // // //                     </div>
// // // // //                 </>
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // // // src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

// // // // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // // // import { createPortal } from 'react-dom';
// // // // // // import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
// // // // // // import {
// // // // // //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// // // // // //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// // // // // //     DownloadCloud, Filter, ScanLine
// // // // // // } from 'lucide-react';
// // // // // // import { useNavigate } from 'react-router-dom';
// // // // // // import { db } from '../../../lib/firebase';
// // // // // // import Loader from '../../../components/common/Loader/Loader';
// // // // // // import moment from 'moment';
// // // // // // import '../../../components/views/LearnersView/LearnersView.css';
// // // // // // import './AttendanceHistoryList.css';
// // // // // // import { useStore } from '../../../store/useStore';
// // // // // // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

// // // // // // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // // // // // let cachedHistory: any[] | null = null;

// // // // // // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// // // // // //     const navigate = useNavigate();

// // // // // //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// // // // // //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// // // // // //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// // // // // //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// // // // // //     const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
// // // // // //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// // // // // //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// // // // // //     const [error, setError] = useState<string | null>(null);

// // // // // //     // ─── REGISTERS FILTER STATE ───
// // // // // //     const [registerSearch, setRegisterSearch] = useState('');

// // // // // //     // ─── LEAVE REQUESTS FILTER STATE ───
// // // // // //     const [leaveSearch, setLeaveSearch] = useState('');
// // // // // //     const [leaveStatusFilter, setLeaveStatusFilter] = useState('all');
// // // // // //     const [leaveTypeFilter, setLeaveTypeFilter] = useState('all');

// // // // // //     // ─── MODAL STATE ───
// // // // // //     const [modalConfig, setModalConfig] = useState<{
// // // // // //         isOpen: boolean;
// // // // // //         type: StatusType;
// // // // // //         title: string;
// // // // // //         message: string;
// // // // // //         confirmText?: string;
// // // // // //         onConfirm?: () => void;
// // // // // //         onCancel?: () => void;
// // // // // //     }>({ isOpen: false, type: 'info', title: '', message: '' });

// // // // // //     // ── Fetch registers ───────────────────────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         const fetchHistory = async () => {
// // // // // //             if (!facilitatorId) return;
// // // // // //             if (cachedHistory === null) setLoadingRegisters(true);
// // // // // //             setError(null);
// // // // // //             try {
// // // // // //                 const snap = await getDocs(query(
// // // // // //                     collection(db, 'attendance'),
// // // // // //                     where('facilitatorId', '==', facilitatorId),
// // // // // //                     orderBy('date', 'desc')
// // // // // //                 ));
// // // // // //                 const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
// // // // // //                 cachedHistory = fresh;
// // // // // //                 setHistory(fresh);
// // // // // //             } catch (err: any) {
// // // // // //                 console.error('Firestore Error:', err);
// // // // // //                 setError(err.message);
// // // // // //             } finally {
// // // // // //                 setLoadingRegisters(false);
// // // // // //             }
// // // // // //         };
// // // // // //         fetchHistory();
// // // // // //     }, [facilitatorId]);

// // // // // //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// // // // // //     useEffect(() => {
// // // // // //         if (activeTab === 'leaves' && facilitatorId && leaveRequests.length === 0) {
// // // // // //             fetchFacilitatorLeaveRequests(facilitatorId);
// // // // // //         }
// // // // // //     }, [activeTab, facilitatorId, fetchFacilitatorLeaveRequests, leaveRequests.length]);

// // // // // //     // ── Register Filtering ────────────────────────────────────────────────────
// // // // // //     const filteredHistory = useMemo(() => {
// // // // // //         if (!registerSearch) return history;
// // // // // //         const lower = registerSearch.toLowerCase();
// // // // // //         return history.filter(r =>
// // // // // //             moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
// // // // // //             r.date.includes(lower)
// // // // // //         );
// // // // // //     }, [history, registerSearch]);

// // // // // //     // ── Leave Filtering ───────────────────────────────────────────────────────
// // // // // //     const filteredLeaves = useMemo(() => {
// // // // // //         return leaveRequests.filter(req => {
// // // // // //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// // // // // //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// // // // // //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;

// // // // // //             return matchesSearch && matchesStatus && matchesType;
// // // // // //         });
// // // // // //     }, [leaveRequests, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// // // // // //     const pendingLeaveCount = leaveRequests.filter(r => r.status === 'Pending').length;

// // // // // //     // ── Leave action (Using Custom Modal) ─────────────────────────────────────
// // // // // //     const handleLeaveAction = (id: string, status: 'Approved' | 'Declined') => {
// // // // // //         setModalConfig({
// // // // // //             isOpen: true,
// // // // // //             type: status === 'Approved' ? 'success' : 'warning',
// // // // // //             title: `Confirm ${status}`,
// // // // // //             message: `Are you sure you want to mark this learner's leave request as ${status}?`,
// // // // // //             confirmText: `Yes, ${status}`,
// // // // // //             onCancel: () => setModalConfig(prev => ({ ...prev, isOpen: false })),
// // // // // //             onConfirm: async () => {
// // // // // //                 setModalConfig(prev => ({ ...prev, isOpen: false }));
// // // // // //                 try {
// // // // // //                     await updateLeaveStatus(id, status);
// // // // // //                 } catch (err) {
// // // // // //                     setModalConfig({
// // // // // //                         isOpen: true,
// // // // // //                         type: 'error',
// // // // // //                         title: 'Update Failed',
// // // // // //                         message: 'Failed to update the leave status. Please check your connection and try again.',
// // // // // //                         confirmText: 'Okay',
// // // // // //                         onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
// // // // // //                     });
// // // // // //                 }
// // // // // //             }
// // // // // //         });
// // // // // //     };

// // // // // //     // ── Loading state ─────────────────────────────────────────────────────────
// // // // // //     if (loadingRegisters || !facilitatorId) {
// // // // // //         return (
// // // // // //             <div className="att-loader-wrap">
// // // // // //                 <Loader message="Loading Dashboard…" />
// // // // // //             </div>
// // // // // //         );
// // // // // //     }

// // // // // //     return (
// // // // // //         <div className="att-root animate-fade-in">

// // // // // //             {/* 🚀 Z-INDEX SAFEGUARD FOR STATUS MODAL 🚀 */}
// // // // // //             {modalConfig.isOpen && createPortal(
// // // // // //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// // // // // //                     <StatusModal
// // // // // //                         type={modalConfig.type}
// // // // // //                         title={modalConfig.title}
// // // // // //                         message={modalConfig.message}
// // // // // //                         confirmText={modalConfig.confirmText}
// // // // // //                         onClose={() => {
// // // // // //                             if (modalConfig.onConfirm) modalConfig.onConfirm();
// // // // // //                             else setModalConfig(p => ({ ...p, isOpen: false }));
// // // // // //                         }}
// // // // // //                         onCancel={modalConfig.onCancel}
// // // // // //                     />
// // // // // //                 </div>,
// // // // // //                 document.body
// // // // // //             )}

// // // // // //             {/* ── TABS ── */}
// // // // // //             <div className="att-tabs" role="tablist">
// // // // // //                 <button
// // // // // //                     role="tab"
// // // // // //                     aria-selected={activeTab === 'registers'}
// // // // // //                     className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`}
// // // // // //                     onClick={() => setActiveTab('registers')}
// // // // // //                 >
// // // // // //                     <History size={14} /> Past Registers
// // // // // //                 </button>
// // // // // //                 <button
// // // // // //                     role="tab"
// // // // // //                     aria-selected={activeTab === 'leaves'}
// // // // // //                     className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`}
// // // // // //                     onClick={() => setActiveTab('leaves')}
// // // // // //                 >
// // // // // //                     <FileText size={14} /> Leave Requests
// // // // // //                     {pendingLeaveCount > 0 && (
// // // // // //                         <span className="att-pending-badge">{pendingLeaveCount} New</span>
// // // // // //                     )}
// // // // // //                 </button>
// // // // // //             </div>

// // // // // //             {/* ── ERROR BANNER ── */}
// // // // // //             {error && (
// // // // // //                 <div className="att-error">
// // // // // //                     <div className="att-error__title">
// // // // // //                         <AlertTriangle size={15} /> Database Sync Error
// // // // // //                     </div>
// // // // // //                     <p className="att-error__body">{error}</p>
// // // // // //                 </div>
// // // // // //             )}

// // // // // //             {/* ════════════════════════════════════════
// // // // // //                 TAB 1 — REGISTERS
// // // // // //             ════════════════════════════════════════ */}
// // // // // //             {activeTab === 'registers' && (
// // // // // //                 <>
// // // // // //                     {/* ── REGISTERS TOOLBAR ── */}
// // // // // //                     {/* <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// // // // // //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// // // // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // // // //                                 <input
// // // // // //                                     type="text"
// // // // // //                                     placeholder="Search by date (e.g. 12 Oct)..."
// // // // // //                                     value={registerSearch}
// // // // // //                                     onChange={e => setRegisterSearch(e.target.value)}
// // // // // //                                 />
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         <button
// // // // // //                             className="mlab-btn mlab-btn--primary"
// // // // // //                             onClick={() => navigate('/facilitator/attendance/scanner')}
// // // // // //                             style={{ whiteSpace: 'nowrap' }}
// // // // // //                         >
// // // // // //                             <ScanLine size={16} /> Scan Attendance
// // // // // //                         </button>
// // // // // //                     </div> */}
// // // // // //                     {/* ── REGISTERS TOOLBAR ── */}
// // // // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>

// // // // // //                         {/* Left Side: Search */}
// // // // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// // // // // //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
// // // // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // // // //                                 <input
// // // // // //                                     type="text"
// // // // // //                                     placeholder="Search by date (e.g. 12 Oct)..."
// // // // // //                                     value={registerSearch}
// // // // // //                                     onChange={e => setRegisterSearch(e.target.value)}
// // // // // //                                 />
// // // // // //                             </div>
// // // // // //                         </div>

// // // // // //                         {/* Right Side: Action Buttons */}
// // // // // //                         <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
// // // // // //                             {/* 1. Launch TV Kiosk (Opens in New Tab) */}
// // // // // //                             {/* <button
// // // // // //                                 className="mlab-btn mlab-btn--outline"
// // // // // //                                 onClick={() => window.open('/kiosk', '_blank')}
// // // // // //                                 style={{ whiteSpace: 'nowrap', borderColor: 'var(--mlab-grey)' }}
// // // // // //                             >
// // // // // //                                 <Calendar size={16} /> Launch TV Kiosk
// // // // // //                             </button> */}
// // // // // //                             {/* 1. Launch TV Kiosk (Opens in New Tab - Auto Authenticated) */}
// // // // // //                             <button
// // // // // //                                 className="mlab-btn mlab-btn--outline"
// // // // // //                                 onClick={() => {
// // // // // //                                     const encodedAuth = btoa(JSON.stringify({
// // // // // //                                         fid: facilitatorId,
// // // // // //                                         cid: "placeholder_cohort_id" // (We'll pass the real one later)
// // // // // //                                     }));
// // // // // //                                     // 🚀 FIX: Use the full origin URL
// // // // // //                                     const url = `${window.location.origin}/kiosk?auth=${encodedAuth}`;
// // // // // //                                     window.open(url, '_blank');
// // // // // //                                 }}
// // // // // //                                 style={{ whiteSpace: 'nowrap', borderColor: 'var(--mlab-grey)' }}
// // // // // //                             >
// // // // // //                                 <Calendar size={16} /> Launch TV Kiosk
// // // // // //                             </button>

// // // // // //                             {/* 2. Live Invigilator Dashboard */}
// // // // // //                             <button
// // // // // //                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// // // // // //                                 onClick={() => navigate('/facilitator/attendance/live')}
// // // // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // // // //                             >
// // // // // //                                 <Clock size={16} /> Live Dashboard
// // // // // //                             </button>

// // // // // //                             {/* 3. Mobile Scanner App Redirect / Setup */}
// // // // // //                             <button
// // // // // //                                 className="mlab-btn mlab-btn--primary"
// // // // // //                                 onClick={() => navigate('/facilitator/attendance/scanner')}
// // // // // //                                 style={{ whiteSpace: 'nowrap' }}
// // // // // //                             >
// // // // // //                                 <ScanLine size={16} /> Scan Attendance
// // // // // //                             </button>
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     <div className="mlab-table-wrap">
// // // // // //                         <table className="mlab-table">
// // // // // //                             <thead>
// // // // // //                                 <tr>
// // // // // //                                     <th>Date Recorded</th>
// // // // // //                                     <th>Attendance</th>
// // // // // //                                     <th>Proofs</th>
// // // // // //                                     <th className="att-th--right">Action</th>
// // // // // //                                 </tr>
// // // // // //                             </thead>
// // // // // //                             <tbody>
// // // // // //                                 {filteredHistory.length > 0 ? filteredHistory.map(record => {
// // // // // //                                     const proofCount = Object.keys(record.proofs || {}).length;
// // // // // //                                     const presentCount = record.presentLearners?.length || 0;
// // // // // //                                     return (
// // // // // //                                         <tr key={record.id}>
// // // // // //                                             <td>
// // // // // //                                                 <div className="att-date-cell">
// // // // // //                                                     <Calendar size={14} className="att-date-cell__icon" />
// // // // // //                                                     <span className="att-date-cell__label">
// // // // // //                                                         {moment(record.date).format('DD MMM YYYY')}
// // // // // //                                                     </span>
// // // // // //                                                 </div>
// // // // // //                                             </td>
// // // // // //                                             <td>
// // // // // //                                                 <span className="att-badge att-badge--present">
// // // // // //                                                     <Users size={11} /> {presentCount} Present
// // // // // //                                                 </span>
// // // // // //                                             </td>
// // // // // //                                             <td>
// // // // // //                                                 {proofCount > 0 ? (
// // // // // //                                                     <span className="att-badge att-badge--proof">
// // // // // //                                                         <FileText size={11} /> {proofCount} Attached
// // // // // //                                                     </span>
// // // // // //                                                 ) : (
// // // // // //                                                     <span className="att-no-data">None</span>
// // // // // //                                                 )}
// // // // // //                                             </td>
// // // // // //                                             <td className="att-td--right">
// // // // // //                                                 <button
// // // // // //                                                     className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn"
// // // // // //                                                     onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// // // // // //                                                 >
// // // // // //                                                     Open Register <ArrowRight size={13} />
// // // // // //                                                 </button>
// // // // // //                                             </td>
// // // // // //                                         </tr>
// // // // // //                                     );
// // // // // //                                 }) : (
// // // // // //                                     <tr>
// // // // // //                                         <td colSpan={4} style={{ padding: '3rem', textAlign: 'center' }}>
// // // // // //                                             {history.length === 0 ? (
// // // // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // // //                                                     <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // //                                                     <p className="mlab-empty__title">No Records Yet</p>
// // // // // //                                                     <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// // // // // //                                                 </div>
// // // // // //                                             ) : (
// // // // // //                                                 <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // // //                                                     <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // //                                                     <p className="mlab-empty__title">No matches found</p>
// // // // // //                                                     <p className="mlab-empty__desc">Try adjusting your date search.</p>
// // // // // //                                                     <button
// // // // // //                                                         className="mlab-btn mlab-btn--outline"
// // // // // //                                                         onClick={() => setRegisterSearch('')}
// // // // // //                                                         style={{ marginTop: '1rem' }}
// // // // // //                                                     >
// // // // // //                                                         Clear Search
// // // // // //                                                     </button>
// // // // // //                                                 </div>
// // // // // //                                             )}
// // // // // //                                         </td>
// // // // // //                                     </tr>
// // // // // //                                 )}
// // // // // //                             </tbody>
// // // // // //                         </table>
// // // // // //                     </div>
// // // // // //                 </>
// // // // // //             )}

// // // // // //             {/* ════════════════════════════════════════
// // // // // //                 TAB 2 — LEAVE REQUESTS
// // // // // //             ════════════════════════════════════════ */}
// // // // // //             {activeTab === 'leaves' && (
// // // // // //                 <>
// // // // // //                     {/* ── LEAVE REQUESTS TOOLBAR ── */}
// // // // // //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// // // // // //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// // // // // //                             <div className="mlab-search" style={{ minWidth: '220px' }}>
// // // // // //                                 <Search size={18} color="var(--mlab-grey)" />
// // // // // //                                 <input
// // // // // //                                     type="text"
// // // // // //                                     placeholder="Search by learner name..."
// // // // // //                                     value={leaveSearch}
// // // // // //                                     onChange={e => setLeaveSearch(e.target.value)}
// // // // // //                                 />
// // // // // //                             </div>

// // // // // //                             <div className="mlab-select-wrap">
// // // // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // // // //                                 <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
// // // // // //                                     <option value="all">All Statuses</option>
// // // // // //                                     <option value="Pending">Pending</option>
// // // // // //                                     <option value="Approved">Approved</option>
// // // // // //                                     <option value="Declined">Declined</option>
// // // // // //                                 </select>
// // // // // //                             </div>

// // // // // //                             <div className="mlab-select-wrap">
// // // // // //                                 <Filter size={16} color="var(--mlab-grey)" />
// // // // // //                                 <select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}>
// // // // // //                                     <option value="all">All Reasons</option>
// // // // // //                                     <option value="Sick Leave">Sick Leave</option>
// // // // // //                                     <option value="Personal Emergency">Personal Emergency</option>
// // // // // //                                     <option value="Interview">Interview</option>
// // // // // //                                     <option value="Other">Other</option>
// // // // // //                                 </select>
// // // // // //                             </div>
// // // // // //                         </div>
// // // // // //                     </div>

// // // // // //                     <div className="mlab-table-wrap">
// // // // // //                         {isFetchingLeaves ? (
// // // // // //                             <div className="att-loader-wrap att-loader-wrap--inline">
// // // // // //                                 <Loader message="Fetching requests…" />
// // // // // //                             </div>
// // // // // //                         ) : (
// // // // // //                             <table className="mlab-table">
// // // // // //                                 <thead>
// // // // // //                                     <tr>
// // // // // //                                         <th style={{ width: '15%' }}>Learner</th>
// // // // // //                                         <th style={{ width: '15%' }}>Date(s) Affected</th>
// // // // // //                                         <th>Reason</th>
// // // // // //                                         <th>Attachment</th>
// // // // // //                                         <th>Status</th>
// // // // // //                                         <th className="att-th--right">Actions</th>
// // // // // //                                     </tr>
// // // // // //                                 </thead>
// // // // // //                                 <tbody>
// // // // // //                                     {filteredLeaves.length > 0 ? filteredLeaves.map(req => {
// // // // // //                                         const parseDate = (v: any) => !v ? null : v.seconds ? v.toDate() : new Date(v);
// // // // // //                                         const start = parseDate(req.startDate || req.dateAffected);
// // // // // //                                         const end = parseDate(req.endDate || req.dateAffected);
// // // // // //                                         const fmtStart = start ? moment(start).format('DD MMM YYYY') : 'Unknown';
// // // // // //                                         const fmtEnd = end ? moment(end).format('DD MMM YYYY') : 'Unknown';
// // // // // //                                         const isSameDay = start && end ? moment(start).isSame(end, 'day') : true;

// // // // // //                                         return (
// // // // // //                                             <tr key={req.id}>
// // // // // //                                                 <td>
// // // // // //                                                     <span className="mlab-cell-name">{req.learnerName || req.learnerId}</span>
// // // // // //                                                 </td>

// // // // // //                                                 <td>
// // // // // //                                                     <div className="att-dates-cell">
// // // // // //                                                         <div className="att-dates-cell__start">
// // // // // //                                                             <Calendar size={13} className="att-dates-cell__icon" />
// // // // // //                                                             <span className="att-dates-cell__label">{fmtStart}</span>
// // // // // //                                                         </div>
// // // // // //                                                         {!isSameDay && (
// // // // // //                                                             <div className="att-dates-cell__end">
// // // // // //                                                                 <ArrowRightCircle size={12} className="att-dates-cell__arrow" />
// // // // // //                                                                 <span className="att-dates-cell__label--end">{fmtEnd}</span>
// // // // // //                                                             </div>
// // // // // //                                                         )}
// // // // // //                                                     </div>
// // // // // //                                                 </td>

// // // // // //                                                 <td>
// // // // // //                                                     <div className="att-reason-cell">
// // // // // //                                                         <span className="att-reason-cell__type">{req.type}</span>
// // // // // //                                                         <span className="att-reason-cell__quote">"{req.reason}"</span>
// // // // // //                                                     </div>
// // // // // //                                                 </td>

// // // // // //                                                 <td>
// // // // // //                                                     {req.attachmentUrl ? (
// // // // // //                                                         <a
// // // // // //                                                             href={req.attachmentUrl}
// // // // // //                                                             target="_blank"
// // // // // //                                                             rel="noopener noreferrer"
// // // // // //                                                             className="att-attach-link"
// // // // // //                                                             title={req.attachmentName || 'Download Document'}
// // // // // //                                                         >
// // // // // //                                                             <DownloadCloud size={14} />
// // // // // //                                                             <span className="att-attach-link__text">
// // // // // //                                                                 {req.attachmentName
// // // // // //                                                                     ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName)
// // // // // //                                                                     : 'View File'}
// // // // // //                                                             </span>
// // // // // //                                                         </a>
// // // // // //                                                     ) : (
// // // // // //                                                         <span className="att-no-data">No Attachment</span>
// // // // // //                                                     )}
// // // // // //                                                 </td>

// // // // // //                                                 <td>
// // // // // //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// // // // // //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// // // // // //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// // // // // //                                                 </td>

// // // // // //                                                 <td className="att-td--right">
// // // // // //                                                     {req.status === 'Pending' ? (
// // // // // //                                                         <div className="att-action-btns">
// // // // // //                                                             <button
// // // // // //                                                                 className="att-btn att-btn--approve"
// // // // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Approved')}
// // // // // //                                                             >
// // // // // //                                                                 <CheckCircle size={12} /> Approve
// // // // // //                                                             </button>
// // // // // //                                                             <button
// // // // // //                                                                 className="att-btn att-btn--decline"
// // // // // //                                                                 onClick={() => handleLeaveAction(req.id, 'Declined')}
// // // // // //                                                             >
// // // // // //                                                                 <XCircle size={12} /> Decline
// // // // // //                                                             </button>
// // // // // //                                                         </div>
// // // // // //                                                     ) : (
// // // // // //                                                         <span className="att-reviewed-label">Reviewed</span>
// // // // // //                                                     )}
// // // // // //                                                 </td>
// // // // // //                                             </tr>
// // // // // //                                         );
// // // // // //                                     }) : (
// // // // // //                                         <tr>
// // // // // //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// // // // // //                                                 {leaveRequests.length === 0 ? (
// // // // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // // //                                                         <FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // //                                                         <p className="mlab-empty__title">All Caught Up!</p>
// // // // // //                                                         <p className="mlab-empty__desc">No leave requests are pending review.</p>
// // // // // //                                                     </div>
// // // // // //                                                 ) : (
// // // // // //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}>
// // // // // //                                                         <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // //                                                         <p className="mlab-empty__title">No matches found</p>
// // // // // //                                                         <p className="mlab-empty__desc">Try adjusting your filters or search term.</p>
// // // // // //                                                         <button
// // // // // //                                                             className="mlab-btn mlab-btn--outline"
// // // // // //                                                             onClick={() => {
// // // // // //                                                                 setLeaveSearch('');
// // // // // //                                                                 setLeaveStatusFilter('all');
// // // // // //                                                                 setLeaveTypeFilter('all');
// // // // // //                                                             }}
// // // // // //                                                             style={{ marginTop: '1rem' }}
// // // // // //                                                         >
// // // // // //                                                             Clear Filters
// // // // // //                                                         </button>
// // // // // //                                                     </div>
// // // // // //                                                 )}
// // // // // //                                             </td>
// // // // // //                                         </tr>
// // // // // //                                     )}
// // // // // //                                 </tbody>
// // // // // //                             </table>
// // // // // //                         )}
// // // // // //                     </div>
// // // // // //                 </>
// // // // // //             )}
// // // // // //         </div>
// // // // // //     );
// // // // // // };




// // // // // // // // src/components/FacilitatorPortal/AttendanceHistoryList/AttendanceHistoryList.tsx

// // // // // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // // // // import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
// // // // // // // import { FileText, Calendar, ArrowRight, AlertTriangle, History, Users, Search } from 'lucide-react';
// // // // // // // import { useNavigate } from 'react-router-dom';
// // // // // // // import { db } from '../../../lib/firebase';
// // // // // // // import Loader from '../../../components/common/Loader/Loader';
// // // // // // // import moment from 'moment';
// // // // // // // import '../../../components/views/LearnersView/LearnersView.css';

// // // // // // // // MODULE-LEVEL CACHE
// // // // // // // let cachedHistory: any[] | null = null;

// // // // // // // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// // // // // // //     const navigate = useNavigate();

// // // // // // //     // Check cache strictly on mount
// // // // // // //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// // // // // // //     const [loading, setLoading] = useState<boolean>(() => cachedHistory === null);
// // // // // // //     const [error, setError] = useState<string | null>(null);

// // // // // // //     const [searchTerm, setSearchTerm] = useState('');

// // // // // // //     useEffect(() => {
// // // // // // //         const fetchHistory = async () => {
// // // // // // //             if (!facilitatorId) return;

// // // // // // //             if (cachedHistory === null) {
// // // // // // //                 setLoading(true);
// // // // // // //             }

// // // // // // //             setError(null);

// // // // // // //             try {
// // // // // // //                 const q = query(
// // // // // // //                     collection(db, 'attendance'),
// // // // // // //                     where('facilitatorId', '==', facilitatorId),
// // // // // // //                     orderBy('date', 'desc')
// // // // // // //                 );
// // // // // // //                 const snapshot = await getDocs(q);
// // // // // // //                 const freshData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

// // // // // // //                 cachedHistory = freshData;
// // // // // // //                 setHistory(freshData);
// // // // // // //             } catch (err: any) {
// // // // // // //                 console.error('Firestore Error:', err);
// // // // // // //                 setError(err.message);
// // // // // // //             } finally {
// // // // // // //                 setLoading(false);
// // // // // // //             }
// // // // // // //         };

// // // // // // //         fetchHistory();
// // // // // // //     }, [facilitatorId]);

// // // // // // //     const filteredHistory = useMemo(() => {
// // // // // // //         if (!searchTerm) return history;
// // // // // // //         const lower = searchTerm.toLowerCase();
// // // // // // //         return history.filter(record => {
// // // // // // //             const formattedDate = moment(record.date).format('DD MMM YYYY').toLowerCase();
// // // // // // //             return formattedDate.includes(lower) || record.date.includes(lower);
// // // // // // //         });
// // // // // // //     }, [history, searchTerm]);

// // // // // // //     if (loading || !facilitatorId) return (
// // // // // // //         <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
// // // // // // //             <Loader message="Loading History..." />
// // // // // // //         </div>
// // // // // // //     );

// // // // // // //     if (error) return (
// // // // // // //         <div style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', margin: '1rem 0' }}>
// // // // // // //             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
// // // // // // //                 <AlertTriangle size={16} /> Database Sync Error
// // // // // // //             </div>
// // // // // // //             <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
// // // // // // //         </div>
// // // // // // //     );

// // // // // // //     return (
// // // // // // //         <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>

// // // // // // //             <div className="mlab-toolbar">
// // // // // // //                 <div className="mlab-search">
// // // // // // //                     <Search size={18} color="var(--mlab-grey)" />
// // // // // // //                     <input
// // // // // // //                         type="text"
// // // // // // //                         placeholder="Search by date (e.g. 12 Oct)..."
// // // // // // //                         value={searchTerm}
// // // // // // //                         onChange={e => setSearchTerm(e.target.value)}
// // // // // // //                     />
// // // // // // //                 </div>
// // // // // // //             </div>

// // // // // // //             <div className="mlab-table-wrap">
// // // // // // //                 <table className="mlab-table">
// // // // // // //                     <thead>
// // // // // // //                         <tr>
// // // // // // //                             <th>Date Recorded</th>
// // // // // // //                             <th>Attendance</th>
// // // // // // //                             <th>Proofs</th>
// // // // // // //                             <th style={{ textAlign: 'right' }}>Action</th>
// // // // // // //                         </tr>
// // // // // // //                     </thead>
// // // // // // //                     <tbody>
// // // // // // //                         {filteredHistory.length > 0 ? (
// // // // // // //                             filteredHistory.map(record => {
// // // // // // //                                 const proofCount = Object.keys(record.proofs || {}).length;
// // // // // // //                                 const presentCount = record.presentLearners?.length || 0;
// // // // // // //                                 return (
// // // // // // //                                     <tr key={record.id}>
// // // // // // //                                         <td>
// // // // // // //                                             <div className="mlab-cell-content" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
// // // // // // //                                                 <Calendar size={15} color="var(--mlab-blue)" />
// // // // // // //                                                 <span className="mlab-cell-name">{moment(record.date).format('DD MMM YYYY')}</span>
// // // // // // //                                             </div>
// // // // // // //                                         </td>
// // // // // // //                                         <td>
// // // // // // //                                             <span className="mlab-badge mlab-badge--active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // // // //                                                 <Users size={11} /> {presentCount} Present
// // // // // // //                                             </span>
// // // // // // //                                         </td>
// // // // // // //                                         <td>
// // // // // // //                                             {proofCount > 0 ? (
// // // // // // //                                                 <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // // // //                                                     <FileText size={11} /> {proofCount} Attached
// // // // // // //                                                 </span>
// // // // // // //                                             ) : (
// // // // // // //                                                 <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>None</span>
// // // // // // //                                             )}
// // // // // // //                                         </td>
// // // // // // //                                         <td style={{ textAlign: 'right' }}>
// // // // // // //                                             <button
// // // // // // //                                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
// // // // // // //                                                 onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
// // // // // // //                                             >
// // // // // // //                                                 Open Register <ArrowRight size={13} />
// // // // // // //                                             </button>
// // // // // // //                                         </td>
// // // // // // //                                     </tr>
// // // // // // //                                 );
// // // // // // //                             })
// // // // // // //                         ) : (
// // // // // // //                             <tr>
// // // // // // //                                 <td colSpan={4}>
// // // // // // //                                     {history.length === 0 ? (
// // // // // // //                                         <div className="mlab-empty">
// // // // // // //                                             <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // // //                                             <p className="mlab-empty__title">No Records Yet</p>
// // // // // // //                                             <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
// // // // // // //                                         </div>
// // // // // // //                                     ) : (
// // // // // // //                                         <div className="mlab-empty">
// // // // // // //                                             <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
// // // // // // //                                             <p className="mlab-empty__title">No matches found</p>
// // // // // // //                                             <p className="mlab-empty__desc">Try adjusting your search term.</p>
// // // // // // //                                             <button
// // // // // // //                                                 className="mlab-btn mlab-btn--outline"
// // // // // // //                                                 onClick={() => setSearchTerm('')}
// // // // // // //                                                 style={{ marginTop: '1rem' }}
// // // // // // //                                             >
// // // // // // //                                                 Clear Search
// // // // // // //                                             </button>
// // // // // // //                                         </div>
// // // // // // //                                     )}
// // // // // // //                                 </td>
// // // // // // //                             </tr>
// // // // // // //                         )}
// // // // // // //                     </tbody>
// // // // // // //                 </table>
// // // // // // //             </div>
// // // // // // //         </div>
// // // // // // //     );
// // // // // // // };