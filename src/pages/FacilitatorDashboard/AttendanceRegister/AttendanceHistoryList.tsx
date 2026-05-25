// src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    collection, query, where, getDocs, orderBy
} from 'firebase/firestore';
import {
    FileText, Calendar, ArrowRight, AlertTriangle, History,
    Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
    DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target, MonitorPlay, Layers
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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

    // URL Parameter Syncing
    const [searchParams, setSearchParams] = useSearchParams();

    // Helper to safely update URL params without pushing massive history stacks
    const updateParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value && value !== 'all') {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        setSearchParams(params, { replace: true });
    };

    // Use "?view=" for sub-tabs to prevent colliding with AdminDashboard's "?tab="
    const activeTab = (searchParams.get('view') as 'registers' | 'leaves') || 'registers';

    const selectedCohortId = searchParams.get('cohort') || '';
    const registerSearch = searchParams.get('date') || '';
    const leaveSearch = searchParams.get('leaveSearch') || '';
    const leaveStatusFilter = searchParams.get('leaveStatus') || 'all';
    const leaveTypeFilter = searchParams.get('leaveType') || 'all';

    // Update "?view=" in the URL
    const setActiveTab = (val: 'registers' | 'leaves') => updateParam('view', val);

    const setSelectedCohortId = (val: string) => updateParam('cohort', val);
    const setRegisterSearch = (val: string) => updateParam('date', val);
    const setLeaveSearch = (val: string) => updateParam('leaveSearch', val);
    const setLeaveStatusFilter = (val: string) => updateParam('leaveStatus', val);
    const setLeaveTypeFilter = (val: string) => updateParam('leaveType', val);

    // ADMIN "GOD MODE" CHECK
    const user = useStore(s => s.user);
    const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

    // COHORT SELECTOR LOGIC
    const allCohorts = useStore(s => s.cohorts) || [];
    const fetchCohorts = useStore(s => s.fetchCohorts);

    // GUARANTEE COHORTS ARE LOADED INSTANTLY
    useEffect(() => {
        if (allCohorts.length === 0 && fetchCohorts) {
            fetchCohorts();
        }
    }, [allCohorts.length, fetchCohorts]);

    const availableCohorts = useMemo(() => {
        if (isAdmin) return allCohorts;
        return allCohorts.filter(c => c.facilitatorId === (facilitatorId || user?.uid));
    }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

    // TIME MACHINE STATE
    const [reconcileDate, setReconcileDate] = useState<string>('');

    const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
    const leaveRequests = useStore(s => s.leaveRequests) || [];
    const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
    const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

    const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
    const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
    const [error, setError] = useState<string | null>(null);

    // ACTIONABLE INTELLIGENCE STATE
    const [liveKioskCount, setLiveKioskCount] = useState(0);

    // HOLIDAY CACHE FOR ANALYTICS
    const [holidays, setHolidays] = useState<string[]>([]);

    // ADMIN LEAVES STATE
    const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
    const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);

    // Reference to prevent violent spinner reloading on tab switches
    const hasFetchedLeaves = useRef(false);

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

    // ── Fetch registers & live kiosks ──────────────────────────────────────────
    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;

            if (cachedHistory === null) setLoadingRegisters(true);
            setError(null);

            try {
                // 1. Fetch History
                let qHist;
                if (isAdmin) {
                    qHist = query(collection(db, 'attendance'), orderBy('date', 'desc'));
                } else {
                    const targetId = facilitatorId || user?.uid;
                    qHist = query(collection(db, 'attendance'), where('facilitatorId', '==', targetId), orderBy('date', 'desc'));
                }

                const snap = await getDocs(qHist);
                const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                cachedHistory = fresh;
                setHistory(fresh);

                // 2. Fetch Live Kiosks
                const todayStr = moment().format('YYYY-MM-DD');
                let qKiosk;
                if (isAdmin) {
                    qKiosk = query(collection(db, 'kiosk_sessions'), where('date', '==', todayStr), where('status', '==', 'active'));
                } else {
                    const targetId = facilitatorId || user?.uid;
                    qKiosk = query(collection(db, 'kiosk_sessions'), where('facilitatorId', '==', targetId), where('date', '==', todayStr), where('status', '==', 'active'));
                }
                const kioskSnap = await getDocs(qKiosk);
                setLiveKioskCount(kioskSnap.size);

            } catch (err: any) {
                console.error('Firestore Error:', err);
                setError(err.message);
            } finally {
                setLoadingRegisters(false);
            }
        };
        fetchData();
    }, [facilitatorId, isAdmin, user]);

    // ── Fetch leaves on tab change ────────────────────────────────────────────
    useEffect(() => {
        if (activeTab === 'leaves') {
            if (isAdmin) {
                // Only show the loader if we haven't fetched yet
                if (!hasFetchedLeaves.current) {
                    setLoadingAdminLeaves(true);
                }

                // Fetch silently in the background
                getDocs(collection(db, 'leave_requests')).then(snap => {
                    setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    hasFetchedLeaves.current = true; // Mark as fetched
                }).finally(() => setLoadingAdminLeaves(false));

            } else {
                const targetId = facilitatorId || user?.uid;
                if (targetId && leaveRequests.length === 0) {
                    fetchFacilitatorLeaveRequests(targetId);
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
    const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

    // Centralized Leave Request Stats
    const { pendingLeaveCount, approvedLeaveCount, declinedLeaveCount } = useMemo(() => {
        let pending = 0, approved = 0, declined = 0;
        displayedLeavesData.forEach(r => {
            if (r.status === 'Pending') pending++;
            else if (r.status === 'Approved') approved++;
            else if (r.status === 'Declined') declined++;
        });
        return { pendingLeaveCount: pending, approvedLeaveCount: approved, declinedLeaveCount: declined };
    }, [displayedLeavesData]);

    // ── Register Filtering ────────────────────────────────────────────────────
    const filteredHistory = useMemo(() => {
        let data = history;
        if (selectedCohortId) {
            data = data.filter(r => r.cohortId === selectedCohortId);
        }
        if (registerSearch) {
            data = data.filter(r => r.date === registerSearch);
        }
        return data;
    }, [history, registerSearch, selectedCohortId]);

    // ── ANALYTICS: GLOBAL HEALTH MATH (ALL COHORTS) ─────────────────────────
    const globalStats = useMemo(() => {
        if (history.length === 0) return null;

        let totalExpectedScans = 0;
        let totalPresentScans = 0;

        history.forEach(reg => {
            const present = reg.presentLearners?.length || 0;
            const absent = reg.absentLearners?.length || 0;
            const dailyTotal = present + absent;

            if (dailyTotal > 0) {
                totalExpectedScans += dailyTotal;
                totalPresentScans += present;
            }
        });

        const globalAttendanceRate = totalExpectedScans > 0
            ? Math.round((totalPresentScans / totalExpectedScans) * 100)
            : 0;

        return {
            totalRegisters: history.length,
            globalAttendanceRate,
            pendingLeaves: pendingLeaveCount,
            activeKiosks: liveKioskCount
        };
    }, [history, pendingLeaveCount, liveKioskCount]);

    // ── ANALYTICS: COHORT HEALTH MATH (SPECIFIC COHORT) ─────────────────────
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

        while (current.isSameOrBefore(end, 'day')) {
            const dayOfWeek = current.day();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
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

        let totalExpectedScans = 0;
        let totalPresentScans = 0;

        cohortRegisters.forEach(reg => {
            const present = reg.presentLearners?.length || 0;
            const absent = reg.absentLearners?.length || 0;
            const dailyTotal = present + absent || (cohort.learnerIds?.length || 0);

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

    // STATE-DRIVEN RECONCILIATION CHECK
    const todayString = moment().format('YYYY-MM-DD');
    const isFinalizedToday = selectedCohortId
        ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString)
        : false;

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
                    await updateLeaveStatus(id, status, {
                        reviewedBy: user?.uid || 'Unknown',
                        reviewedByName: user?.fullName || 'Unknown Admin'
                    });

                    if (isAdmin) {
                        setAdminLeaves(prev => prev.map(req => req.id === id ? {
                            ...req,
                            status,
                            reviewedBy: user?.uid,
                            reviewedByName: user?.fullName
                        } : req));
                    }
                    toast.success(`Leave request marked as ${status}.`);
                } catch (err) {
                    toast.error('Failed to update the leave status. Please check your connection and try again.');
                }
            }
        });
    };

    if (loadingRegisters) {
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

                            {/* BEAUTIFUL DATE FILTER INPUT */}
                            <div className="mlab-search" style={{
                                minWidth: '250px', maxWidth: '350px', display: 'flex',
                                alignItems: 'center', gap: '8px', padding: '4px 12px',
                                background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: 0,
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

                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', borderRadius: 0 }}>
                            <select
                                value={selectedCohortId}
                                onChange={(e) => setSelectedCohortId(e.target.value)}
                                style={{
                                    padding: '8px 12px',
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

                            {/* TIME MACHINE WIDGET */}
                            {selectedCohortId && (
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: '#f1f5f9', padding: '4px 8px',
                                    borderRadius: 0, border: '1px solid #cbd5e1'
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

                            {/* FUNNELED TO LIVE BOARD FOR REVIEW */}
                            <button
                                className={`mlab-btn mlab-btn--outline ${!isFinalizedToday && selectedCohortId ? 'mlab-btn--primary' : 'mlab-btn--outline-blue'}`}
                                onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)}
                                style={{ whiteSpace: 'nowrap', opacity: selectedCohortId ? 1 : 0.5 }}
                                disabled={!selectedCohortId}
                                title={!selectedCohortId ? "Select a specific cohort to view" : ""}
                            >
                                <Clock size={16} /> {isFinalizedToday ? 'Live Dashboard' : 'View Live Board & Finalize'}
                            </button>

                            <button
                                className="mlab-btn mlab-btn--primary"
                                onClick={() => navigate('/facilitator/attendance/scanner')}
                                style={{ whiteSpace: 'nowrap' }}
                            >
                                <ScanLine size={16} /> Scan Attendance
                            </button>
                        </div>
                    </div>

                    {/* ── GLOBAL ANALYTICS PANEL (Appears when NO Cohort is Selected) ── */}
                    {!selectedCohortId && globalStats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Layers size={24} color="var(--mlab-blue)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Registers</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
                                        {globalStats.totalRegisters} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>Finalized</span>
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Global Attendance</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
                                        {globalStats.globalAttendanceRate}%
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: `4px solid ${globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? '#f59e0b' : 'var(--mlab-grey-light)'}`, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? '#fef3c7' : '#f1f5f9', padding: '12px', borderRadius: '50%' }}>
                                    <MonitorPlay size={24} color={globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? "#d97706" : "var(--mlab-grey)"} />
                                </div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Items</p>
                                    <h3 style={{ margin: '4px 0 0', color: globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? '#d97706' : 'var(--mlab-grey)', fontSize: '1.5rem' }}>
                                        {globalStats.activeKiosks} <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Live Classes</span>
                                    </h3>
                                    <p style={{ margin: '2px 0 0', fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                        {globalStats.pendingLeaves} Pending Leave Request{globalStats.pendingLeaves !== 1 && 's'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TERM ANALYTICS PANEL (Appears when Cohort Selected) */}
                    {selectedCohortId && cohortStats && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-light-blue)', padding: '12px', borderRadius: '50%' }}><Target size={24} color="var(--mlab-blue)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Term Progress</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-blue)', fontSize: '1.5rem' }}>
                                        {cohortStats.daysCompleted} <span style={{ fontSize: '1rem', color: 'var(--mlab-grey)' }}>/ {cohortStats.netExpectedTermDays} Days</span>
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-green)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <div style={{ background: 'var(--mlab-green-bg)', padding: '12px', borderRadius: '50%' }}><BarChart2 size={24} color="var(--mlab-green-dark)" /></div>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Average Attendance</p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>
                                        {cohortStats.avgAttendanceRate}%
                                    </h3>
                                </div>
                            </div>

                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid #f59e0b', display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
                    {/* CDP Styled Metrics Ribbon for Leave Requests */}
                    <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><FileText size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{displayedLeavesData.length}</span>
                                <span className="cdp-stat-card__label">Total Requests</span>
                            </div>
                        </div>

                        <div className="cdp-stat-card cdp-stat-card--amber">
                            <div className="cdp-stat-card__icon"><Clock size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value" style={{ color: pendingLeaveCount > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{pendingLeaveCount}</span>
                                <span className="cdp-stat-card__label">Pending Review</span>
                            </div>
                        </div>

                        <div className="cdp-stat-card cdp-stat-card--green">
                            <div className="cdp-stat-card__icon"><CheckCircle size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value">{approvedLeaveCount}</span>
                                <span className="cdp-stat-card__label">Approved</span>
                            </div>
                        </div>

                        <div className="cdp-stat-card cdp-stat-card--grey">
                            <div className="cdp-stat-card__icon"><XCircle size={20} /></div>
                            <div className="cdp-stat-card__body">
                                <span className="cdp-stat-card__value" style={{ color: declinedLeaveCount > 0 ? '#ef4444' : 'inherit' }}>{declinedLeaveCount}</span>
                                <span className="cdp-stat-card__label">Declined</span>
                            </div>
                        </div>
                    </div>

                    <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div className="mlab-search" style={{ minWidth: '220px', borderRadius: 0 }}>
                                <Search size={18} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by learner name..."
                                    value={leaveSearch}
                                    onChange={e => setLeaveSearch(e.target.value)}
                                />
                            </div>

                            <div className="mlab-select-wrap" style={{ borderRadius: 0 }}>
                                <Filter size={16} color="var(--mlab-grey)" />
                                <select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}>
                                    <option value="all">All Statuses</option>
                                    <option value="Pending">Pending</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Declined">Declined</option>
                                </select>
                            </div>

                            <div className="mlab-select-wrap" style={{ borderRadius: 0 }}>
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