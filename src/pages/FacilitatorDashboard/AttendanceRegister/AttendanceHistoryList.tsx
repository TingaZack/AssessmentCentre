// src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    collection, query, where, getDocs
} from 'firebase/firestore';
import {
    FileText, Calendar, ArrowRight, AlertTriangle, History,
    Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
    DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target, MonitorPlay, Layers, ChevronLeft, ChevronRight,
    Plus
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
import { AttendanceRingCard } from '../AttendancePage';
import { StipendExportModal } from '../../../components/common/StipendExportModal/StipendExportModal';
import { FacilitatorLogLeaveModal } from '../../../components/common/FacilitatorLogLeaveModal/FacilitatorLogLeaveModal';

// ─── HELPER: TIMESTAMP-SAFE DATE EXTRACTOR ──────────────────────────────────
const extractDateString = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val.split('T')[0];
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        return moment(val.seconds * 1000).format('YYYY-MM-DD');
    }
    if (val instanceof Date) {
        return moment(val).format('YYYY-MM-DD');
    }
    return '';
};

const getLeaveDateMs = (req: any): number => {
    const val = req.startDate || req.dateAffected || req.createdAt;
    if (!val) return 0;
    if (typeof val === 'object' && typeof val.seconds === 'number') {
        return val.seconds * 1000;
    }
    const ms = new Date(val).getTime();
    return isNaN(ms) ? 0 : ms;
};

// ─── MAIN ATTENDANCE HISTORY & LOG LIST ──────────────────────────────────────
let cachedHistory: any[] | null = null;

export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
    const navigate = useNavigate();
    const toast = useToast();
    const [searchParams, setSearchParams] = useSearchParams();

    const updateParam = (key: string, value: string) => {
        const params = new URLSearchParams(searchParams);
        if (value && value !== 'all') {
            params.set(key, value);
        } else {
            params.delete(key);
        }
        setSearchParams(params, { replace: true });
    };

    const activeTab = (searchParams.get('view') as 'registers' | 'leaves' | 'calendar') || 'registers';

    const selectedCohortId = searchParams.get('cohort') || '';
    const registerSearch = searchParams.get('date') || '';
    const leaveSearch = searchParams.get('leaveSearch') || '';
    const leaveStatusFilter = searchParams.get('leaveStatus') || 'all';
    const leaveTypeFilter = searchParams.get('leaveType') || 'all';

    const setActiveTab = (val: 'registers' | 'leaves' | 'calendar') => updateParam('view', val);

    const setSelectedCohortId = (val: string) => updateParam('cohort', val);
    const setRegisterSearch = (val: string) => updateParam('date', val);
    const setLeaveSearch = (val: string) => updateParam('leaveSearch', val);
    const setLeaveStatusFilter = (val: string) => updateParam('leaveStatus', val);
    const setLeaveTypeFilter = (val: string) => updateParam('leaveType', val);

    const user = useStore(s => s.user);
    const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

    const allCohorts = useStore(s => s.cohorts) || [];
    const allLearners = useStore(s => s.learners) || [];
    const fetchCohorts = useStore(s => s.fetchCohorts);

    useEffect(() => {
        if (allCohorts.length === 0 && fetchCohorts) {
            fetchCohorts();
        }
    }, [allCohorts.length, fetchCohorts]);

    const availableCohorts = useMemo(() => {
        if (isAdmin) return allCohorts;
        const targetId = facilitatorId || user?.uid;
        return allCohorts.filter(c =>
            c.facilitatorId === targetId ||
            c.supportFacilitatorId === targetId
        );
    }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

    // FILTER OUT DROPPED / WITHDRAWN / ARCHIVED LEARNERS FROM ACTIVE ROSTER
    const activeCohortLearners = useMemo(() => {
        return allLearners.filter(l => {
            const st = String(l.status || '').toLowerCase();
            return l.cohortId === selectedCohortId && st !== 'dropped' && st !== 'withdrawn' && st !== 'archived' && !l.isArchived;
        });
    }, [allLearners, selectedCohortId]);

    const [reconcileDate, setReconcileDate] = useState<string>('');
    const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
    const leaveRequests = useStore(s => s.leaveRequests) || [];
    const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
    const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

    const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
    const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
    const [error, setError] = useState<string | null>(null);

    const [liveKioskCount, setLiveKioskCount] = useState(0);
    const [holidays, setHolidays] = useState<string[]>([]);

    const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
    const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);
    const hasFetchedLeaves = useRef(false);

    const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
    const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);

    // FACILITATOR LOG LEAVE ON BEHALF OF LEARNER MODAL STATE
    const [isLogLeaveModalOpen, setIsLogLeaveModalOpen] = useState(false);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
        confirmText?: string;
        onConfirm?: () => void;
        onCancel?: () => void;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

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

    // Fetch registers & live kiosks
    useEffect(() => {
        const fetchData = async () => {
            if (!user) return;

            if (cachedHistory === null) setLoadingRegisters(true);
            setError(null);

            try {
                let qHist;
                let qLogs;
                let qRecs;

                if (isAdmin) {
                    qHist = query(collection(db, 'attendance'));
                    qLogs = query(collection(db, 'attendance_logs'));
                    qRecs = query(collection(db, 'attendance_records'));
                } else {
                    const myCohortIds = availableCohorts.map(c => c.id);
                    if (myCohortIds.length > 0) {
                        const chunk = myCohortIds.slice(0, 10);
                        qHist = query(collection(db, 'attendance'), where('cohortId', 'in', chunk));
                        qLogs = query(collection(db, 'attendance_logs'), where('cohortId', 'in', chunk));
                        qRecs = query(collection(db, 'attendance_records'), where('cohortId', 'in', chunk));
                    } else {
                        qHist = query(collection(db, 'attendance'), where('cohortId', '==', 'NONE'));
                        qLogs = query(collection(db, 'attendance_logs'), where('cohortId', '==', 'NONE'));
                        qRecs = query(collection(db, 'attendance_records'), where('cohortId', '==', 'NONE'));
                    }
                }

                const [snap, logsSnap, recsSnap] = await Promise.all([
                    getDocs(qHist),
                    getDocs(qLogs),
                    getDocs(qRecs)
                ]);

                let fresh = snap.docs.map(d => {
                    const data = d.data();
                    const cleanDate = extractDateString(data.date);
                    return { id: d.id, ...data, date: cleanDate };
                });

                const recordsByCohortDate = new Map<string, { present: string[], partial: string[], excused: string[], absent: string[] }>();

                recsSnap.docs.forEach(d => {
                    const data = d.data();
                    const cleanDate = extractDateString(data.sessionDate || data.date || data.timestamp || data.checkInTime);
                    const targetCohort = data.cohortId || data.cohort_id;
                    if (!cleanDate || !targetCohort) return;

                    const key = `${targetCohort}_${cleanDate}`;
                    if (!recordsByCohortDate.has(key)) {
                        recordsByCohortDate.set(key, { present: [], partial: [], excused: [], absent: [] });
                    }
                    const entry = recordsByCohortDate.get(key)!;
                    const lId = data.learnerId || data.learner_id || data.idNumber;
                    const st = (data.status || '').toLowerCase();

                    if (['present', 'check_in', 'present_onsite'].includes(st)) {
                        if (lId && !entry.present.includes(lId)) entry.present.push(lId);
                    } else if (['partial', 'late'].includes(st)) {
                        if (lId && !entry.partial.includes(lId)) entry.partial.push(lId);
                    } else if (['excused_absent', 'excused'].includes(st)) {
                        if (lId && !entry.excused.includes(lId)) entry.excused.push(lId);
                    } else if (['absent', 'absent_unexcused', 'unexcused_absent'].includes(st)) {
                        if (lId && !entry.absent.includes(lId)) entry.absent.push(lId);
                    }
                });

                const logDocs: any[] = [];
                const logKeys = new Set<string>();

                logsSnap.docs.forEach(d => {
                    const data = d.data();
                    const cleanDate = extractDateString(data.sessionDate || data.date || data.createdAt);
                    const targetCohort = data.cohortId || data.cohort_id;
                    if (!cleanDate || !targetCohort) return;

                    const key = `${targetCohort}_${cleanDate}`;
                    logKeys.add(key);

                    const recData = recordsByCohortDate.get(key);
                    const presentLearners = recData?.present.length ? recData.present : Array(data.totalPresent || data.presentCount || 0).fill('present');
                    const partialLearners = recData?.partial || [];
                    const excusedLearners = recData?.excused || [];
                    const absentLearners = recData?.absent.length ? recData.absent : Array(data.totalAbsent || data.absentCount || 0).fill('absent');

                    logDocs.push({
                        id: d.id,
                        cohortId: targetCohort,
                        date: cleanDate,
                        presentLearners,
                        partialLearners,
                        excusedLearners,
                        absentLearners,
                        isBootcampLog: true,
                        proofs: data.proofs || {},
                        ...data
                    });
                });

                recordsByCohortDate.forEach((recData, key) => {
                    if (!logKeys.has(key)) {
                        const parts = key.split('_');
                        const cDate = parts.pop() || '';
                        const cId = parts.join('_');
                        logDocs.push({
                            id: `virtual_${key}`,
                            cohortId: cId,
                            date: cDate,
                            presentLearners: recData.present,
                            partialLearners: recData.partial,
                            excusedLearners: recData.excused,
                            absentLearners: recData.absent,
                            isBootcampLog: true
                        });
                    }
                });

                const existingKeys = new Set(fresh.map((r: any) => `${r.cohortId}_${r.date}`));
                logDocs.forEach(log => {
                    const key = `${log.cohortId}_${log.date}`;
                    if (!existingKeys.has(key)) {
                        fresh.push(log);
                        existingKeys.add(key);
                    }
                });

                fresh.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

                cachedHistory = fresh;
                setHistory(fresh);

                const todayStr = moment().format('YYYY-MM-DD');
                let qKiosk;
                if (isAdmin) {
                    qKiosk = query(collection(db, 'kiosk_sessions'), where('date', '==', todayStr), where('status', '==', 'active'));
                } else {
                    const myCohortIds = availableCohorts.map(c => c.id);
                    if (myCohortIds.length > 0) {
                        const chunk = myCohortIds.slice(0, 10);
                        qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', 'in', chunk), where('date', '==', todayStr), where('status', '==', 'active'));
                    } else {
                        qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', '==', 'NONE'));
                    }
                }
                const kioskSnap = await getDocs(qKiosk);
                setLiveKioskCount(kioskSnap.size);

            } catch (err: any) {
                console.error('Firestore Attendance Fetch Error:', err);
                setError(err.message);
            } finally {
                setLoadingRegisters(false);
            }
        };
        fetchData();
    }, [facilitatorId, isAdmin, user, availableCohorts]);

    useEffect(() => {
        if (activeTab === 'leaves' || activeTab === 'calendar') {
            if (isAdmin) {
                if (!hasFetchedLeaves.current) {
                    setLoadingAdminLeaves(true);
                }
                getDocs(collection(db, 'leave_requests')).then(snap => {
                    setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                    hasFetchedLeaves.current = true;
                }).finally(() => setLoadingAdminLeaves(false));
            } else {
                const targetId = facilitatorId || user?.uid;
                if (targetId && leaveRequests.length === 0) {
                    fetchFacilitatorLeaveRequests(targetId);
                }
            }
        }
    }, [activeTab]);

    const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
    const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

    const { pendingLeaveCount, approvedLeaveCount, declinedLeaveCount } = useMemo(() => {
        let pending = 0, approved = 0, declined = 0;
        displayedLeavesData.forEach(r => {
            if (r.status === 'Pending') pending++;
            else if (r.status === 'Approved') approved++;
            else if (r.status === 'Declined') declined++;
        });
        return { pendingLeaveCount: pending, approvedLeaveCount: approved, declinedLeaveCount: declined };
    }, [displayedLeavesData]);

    const filteredHistory = useMemo(() => {
        let data = history;
        if (selectedCohortId) data = data.filter(r => r.cohortId === selectedCohortId);
        if (registerSearch) data = data.filter(r => r.date === registerSearch);
        return data;
    }, [history, registerSearch, selectedCohortId]);

    const globalStats = useMemo(() => {
        if (history.length === 0) return null;
        let totalExpectedScans = 0, totalPresentScans = 0;

        history.forEach(reg => {
            const present = reg.presentLearners?.length || 0;
            const absent = reg.absentLearners?.length || 0;
            const dailyTotal = present + absent;
            if (dailyTotal > 0) {
                totalExpectedScans += dailyTotal;
                totalPresentScans += present;
            }
        });

        return {
            totalRegisters: history.length,
            globalAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0,
            pendingLeaves: pendingLeaveCount,
            activeKiosks: liveKioskCount
        };
    }, [history, pendingLeaveCount, liveKioskCount]);

    const cohortStats = useMemo(() => {
        if (!selectedCohortId) return null;
        const cohort = availableCohorts.find(c => c.id === selectedCohortId);
        if (!cohort || !cohort.startDate || !cohort.endDate) return null;

        const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);
        let totalWeekdays = 0, holidaysCount = 0, recessCount = 0;

        const start = moment(cohort.startDate);
        const end = moment(cohort.endDate);
        const current = start.clone();

        while (current.isSameOrBefore(end, 'day')) {
            const dayOfWeek = current.day();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                totalWeekdays++;
                const dateStr = current.format('YYYY-MM-DD');
                if (holidays.includes(dateStr)) holidaysCount++;
                else if ((cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'))) recessCount++;
            }
            current.add(1, 'day');
        }

        let totalExpectedScans = 0, totalPresentScans = 0;
        cohortRegisters.forEach(reg => {
            const present = reg.presentLearners?.length || 0;
            const absent = reg.absentLearners?.length || 0;
            const dailyTotal = present + absent || (cohort.learnerIds?.length || 0);

            if (dailyTotal > 0) {
                totalExpectedScans += dailyTotal;
                totalPresentScans += present;
            }
        });

        return {
            netExpectedTermDays: totalWeekdays - holidaysCount - recessCount,
            daysCompleted: cohortRegisters.length,
            holidaysCount,
            recessCount,
            avgAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0
        };
    }, [selectedCohortId, availableCohorts, history, holidays]);

    const filteredLeaves = useMemo(() => {
        const list = displayedLeavesData.filter(req => {
            const matchesSearch = (req.learnerName || req.learnerId || '').toLowerCase().includes(leaveSearch.toLowerCase());
            const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
            const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
            return matchesSearch && matchesStatus && matchesType;
        });

        return list.sort((a, b) => {
            const timeA = getLeaveDateMs(a);
            const timeB = getLeaveDateMs(b);
            return timeB - timeA;
        });
    }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

    const todayString = moment().format('YYYY-MM-DD');
    const isFinalizedToday = selectedCohortId ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString) : false;

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
                    await updateLeaveStatus(id, status, { reviewedBy: user?.uid || 'Unknown', reviewedByName: user?.fullName || 'Unknown Admin' });
                    if (isAdmin) {
                        setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status, reviewedBy: user?.uid, reviewedByName: user?.fullName } : req));
                    }
                    toast.success(`Leave request marked as ${status}.`);
                } catch (err) {
                    toast.error('Failed to update the leave status.');
                }
            }
        });
    };

    const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
    const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

    const calendarGrid = useMemo(() => {
        const startDay = calendarMonth.day();
        const diff = startDay === 0 ? 6 : startDay - 1;
        const startGrid = calendarMonth.clone().subtract(diff, 'days');

        const endOfMonth = calendarMonth.clone().endOf('month');
        const endDay = endOfMonth.day();
        const endDiff = endDay === 0 ? 0 : 7 - endDay;
        const endGrid = endOfMonth.clone().add(endDiff, 'days');

        const grid = [];
        let curr = startGrid.clone();
        while (curr.isSameOrBefore(endGrid)) {
            grid.push(curr.clone());
            curr.add(1, 'day');
        }
        return grid;
    }, [calendarMonth]);

    // 🚀 MULTI-STATUS GRANULAR CALENDAR AGGREGATION
    const calendarDataMap = useMemo(() => {
        const map = new Map();

        holidays.forEach(h => map.set(h, { isHoliday: true }));

        if (selectedCohortId) {
            const cohort = availableCohorts.find(c => c.id === selectedCohortId);
            if (cohort?.recessPeriods) {
                cohort.recessPeriods.forEach((p: any) => {
                    let curr = moment(p.start);
                    const end = moment(p.end);
                    while (curr.isSameOrBefore(end)) {
                        const dStr = curr.format('YYYY-MM-DD');
                        map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
                        curr.add(1, 'day');
                    }
                });
            }
        }

        history.forEach(h => {
            if (!selectedCohortId || h.cohortId === selectedCohortId) {
                const dStr = moment(h.date).format('YYYY-MM-DD');
                const existing = map.get(dStr) || {};
                existing.hasRegister = true;
                existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
                existing.partial = (existing.partial || 0) + (h.partialLearners?.length || 0);
                existing.excused = (existing.excused || 0) + (h.excusedLearners?.length || 0);
                existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
                map.set(dStr, existing);
            }
        });

        displayedLeavesData.forEach(l => {
            if (!selectedCohortId || l.cohortId === selectedCohortId) {
                let curr = moment(l.startDate || l.dateAffected);
                const end = moment(l.endDate || l.dateAffected);
                while (curr.isSameOrBefore(end)) {
                    const dStr = curr.format('YYYY-MM-DD');
                    const existing = map.get(dStr) || {};
                    existing.leaves = (existing.leaves || 0) + 1;
                    if (l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
                    if (l.status === 'Approved') existing.approvedLeaves = (existing.approvedLeaves || 0) + 1;
                    map.set(dStr, existing);
                    curr.add(1, 'day');
                }
            }
        });

        return map;
    }, [holidays, history, displayedLeavesData, selectedCohortId, availableCohorts]);

    if (loadingRegisters) {
        return <div className="att-loader-wrap"><Loader message="Loading Dashboard…" /></div>;
    }

    return (
        <div className="att-root animate-fade-in">
            <style>{`
                .mc-cards-wrapper { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 2rem; }
                .mc { background: white; border: 1px solid var(--mlab-border);padding: 22px 20px 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 18px; transition: transform .22s ease, box-shadow .22s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,.06); }
                .mc-orb { position: absolute; top: -50px; right: -50px; width: 130px; height: 130px; border-radius: 50%; opacity: .15; filter: blur(28px); pointer-events: none; }
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; }
                .mc-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .mc-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: .2em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-size: 14px; font-weight: 700; color: var(--mlab-midnight); letter-spacing: -0.2px; line-height: 1.2; }
                .mc-pct { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; flex-shrink: 0; margin-top: 1px; color: var(--mlab-midnight); }
                .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 6px 0; }
                .mc-ring-svg { transform: rotate(-90deg); }
                .mc-ring-track { fill: none; stroke: #f1f5f9; stroke-width: 8px; }
                .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
                .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
                .mc-ring-num { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; color: var(--mlab-midnight); }
                .mc-ring-denom { font-size: 10px; font-weight: 500; color: var(--mlab-grey); }
                .mc-bars { display: flex; flex-direction: column; gap: 8px; }
                .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
                .mc-bar-lbl { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--mlab-grey); }
                .mc-bar-val { font-size: 10px; font-weight: 700; color: var(--mlab-midnight); }
                .mc-track { width: 100%; height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
                .mc-fill { height: 100%; border-radius: 3px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                .mc-fill-shimmer { background-size: 200% 100%; animation: shimmer 2.4s linear infinite .8s; }
                .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--mlab-border); }
                .mc-total { font-size: 11px; font-weight: 500; color: var(--mlab-grey); }
                .mc-total strong { font-weight: 800; color: var(--mlab-midnight); }
                .mc-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 10px; font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
                @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.75); } }
                .mc-dot { width: 5px; height: 5px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }

                .mc-k .mc-orb { background: #f59e0b; } .mc-k .mc-icon { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-pct { color: #d97706; } .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background-image: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); } .mc-k .mc-fill-secondary { background: #fef3c7; } .mc-k .mc-status { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-dot { background: #d97706; }
                .mc-p .mc-orb { background: #38bdf8; } .mc-p .mc-icon { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-pct { color: #0284c7; } .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background-image: linear-gradient(90deg,#7dd3fc,#0ea5e9,#7dd3fc); } .mc-p .mc-fill-secondary { background: #e0f2fe; } .mc-p .mc-status { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-dot { background: #0284c7; }
                .mc-w .mc-orb { background: var(--mlab-green); } .mc-w .mc-icon { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-pct { color: #65a30d; } .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background-image: linear-gradient(90deg,#bef264,#84cc16,#bef264); } .mc-w .mc-fill-secondary { background: #ecfccb; } .mc-w .mc-status { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-dot { background: #65a30d; }
                .mc-r .mc-orb { background: #ef4444; } .mc-r .mc-icon { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-pct { color: #b91c1c; } .mc-r .mc-ring-fill { stroke: url(#gR); } .mc-r .mc-fill-primary { background-image: linear-gradient(90deg,#fca5a5,#ef4444,#fca5a5); } .mc-r .mc-fill-secondary { background: #fee2e2; } .mc-r .mc-status { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-dot { background: #b91c1c; }
            `}</style>

            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#d97706" /></linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></linearGradient>
                    <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fca5a5" /><stop offset="100%" stopColor="#b91c1c" /></linearGradient>
                </defs>
            </svg>

            {modalConfig.isOpen && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText}
                        onClose={() => { if (modalConfig.onConfirm) modalConfig.onConfirm(); else setModalConfig(p => ({ ...p, isOpen: false })); }}
                        onCancel={modalConfig.onCancel}
                    />
                </div>,
                document.body
            )}

            <StipendExportModal
                isOpen={isStipendModalOpen}
                onClose={() => setIsStipendModalOpen(false)}
                cohortId={selectedCohortId || ''}
                cohortName={availableCohorts.find(c => c.id === selectedCohortId)?.name || 'Cohort'}
                learners={activeCohortLearners}
                attendanceMode={
                    (() => {
                        const c = availableCohorts.find(item => item.id === selectedCohortId);
                        return ((c as any)?.isBootcamp || (c as any)?.cohortType === 'bootcamp' || (c as any)?.type === 'bootcamp')
                            ? 'bootcamp'
                            : 'qcto';
                    })()
                }
                initialMonth={calendarMonth.format('YYYY-MM')}
            />

            {/* FACILITATOR LOG LEAVE ON BEHALF OF LEARNER MODAL */}
            <FacilitatorLogLeaveModal
                isOpen={isLogLeaveModalOpen}
                onClose={() => setIsLogLeaveModalOpen(false)}
                cohortId={selectedCohortId}
                learners={activeCohortLearners.length > 0 ? activeCohortLearners : allLearners}
                facilitatorUser={user}
                onSuccess={() => {
                    if (isAdmin) {
                        getDocs(collection(db, 'leave_requests')).then(snap => {
                            setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                        });
                    } else {
                        const targetId = facilitatorId || user?.uid;
                        if (targetId) {
                            fetchFacilitatorLeaveRequests(targetId);
                        }
                    }
                }}
            />

            <div className="att-tabs" role="tablist">
                <button role="tab" aria-selected={activeTab === 'registers'} className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('registers')}>
                    <History size={14} /> Past Registers
                </button>
                <button role="tab" aria-selected={activeTab === 'calendar'} className={`att-tab${activeTab === 'calendar' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('calendar')}>
                    <Calendar size={14} /> Calendar View
                </button>
                <button role="tab" aria-selected={activeTab === 'leaves'} className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('leaves')}>
                    <FileText size={14} /> Leave Requests
                    {pendingLeaveCount > 0 && <span className="att-pending-badge">{pendingLeaveCount} New</span>}
                </button>
            </div>

            {error && (
                <div className="att-error">
                    <div className="att-error__title"><AlertTriangle size={15} /> Database Sync Error</div>
                    <p className="att-error__body">{error}</p>
                </div>
            )}

            {activeTab !== 'leaves' && (
                <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                        {activeTab === 'registers' && (
                            <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: 0, height: 35 }}>
                                <Calendar size={18} color="var(--mlab-grey)" />
                                <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter Date:</span>
                                <input type="date" value={registerSearch} onChange={e => setRegisterSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-blue)', fontWeight: 600, flex: 1, cursor: 'pointer' }} />
                                {registerSearch && <button onClick={() => setRegisterSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}><XCircle size={16} color="#ef4444" /></button>}
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', borderRadius: 0 }}>
                        <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--mlab-border)', background: 'white', fontFamily: 'var(--font-body)', color: 'var(--mlab-blue)', fontWeight: 600, maxWidth: '220px' }}>
                            <option value="">All Cohorts (Global)</option>
                            {availableCohorts.map(c => <option key={c.id} value={c.id}>{c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}</option>)}
                        </select>

                        {selectedCohortId && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px 8px', borderRadius: 0, border: '1px solid #cbd5e1' }}>
                                <History size={16} color="var(--mlab-grey)" />
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Machine:</span>
                                <input type="date" max={moment().subtract(1, 'days').format('YYYY-MM-DD')} value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, cursor: 'pointer' }} />
                                <button className="mlab-btn mlab-btn--sm" disabled={!reconcileDate} onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)} style={{ background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1', color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem' }}>Reconcile</button>
                            </div>
                        )}

                        <button className="mlab-btn mlab-btn--outline" onClick={() => { const encodedAuth = btoa(JSON.stringify({ fid: facilitatorId || user?.uid || 'admin', cid: selectedCohortId })); window.open(`${window.location.origin}/kiosk?auth=${encodedAuth}`, '_blank'); }} style={{ whiteSpace: 'nowrap', borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)', color: isFinalizedToday ? '#94a3b8' : 'inherit', cursor: isFinalizedToday ? 'not-allowed' : 'pointer' }} disabled={!selectedCohortId || isFinalizedToday} title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}><Calendar size={16} /> Launch TV Kiosk</button>
                        <button className={`mlab-btn mlab-btn--outline ${!isFinalizedToday && selectedCohortId ? 'mlab-btn--primary' : 'mlab-btn--outline-blue'}`} onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)} style={{ whiteSpace: 'nowrap', opacity: selectedCohortId ? 1 : 0.5 }} disabled={!selectedCohortId} title={!selectedCohortId ? "Select a specific cohort to view" : ""}><Clock size={16} /> {isFinalizedToday ? 'Live Dashboard' : 'View Live Board & Finalize'}</button>
                    </div>
                </div>
            )}

            {activeTab === 'registers' && !selectedCohortId && globalStats && (
                <div className="mc-cards-wrapper animate-fade-in">
                    <AttendanceRingCard
                        title="Global Attendance"
                        typeLabel="Overall Health"
                        mainValue={`${globalStats.globalAttendanceRate}%`}
                        totalValue="All Cohorts"
                        pct={globalStats.globalAttendanceRate}
                        theme="w"
                        icon={<BarChart2 size={18} />}
                        bar1Label="Present"
                        bar1Val={`${globalStats.globalAttendanceRate}%`}
                        bar1Pct={globalStats.globalAttendanceRate}
                        bar2Label="Absent"
                        bar2Val={`${100 - globalStats.globalAttendanceRate}%`}
                        bar2Pct={100 - globalStats.globalAttendanceRate}
                        statusText="System Wide"
                    />
                    <AttendanceRingCard
                        title="Total Registers"
                        typeLabel="System Activity"
                        mainValue={globalStats.totalRegisters}
                        totalValue="Finalized"
                        pct={100}
                        theme="p"
                        icon={<Layers size={18} />}
                        bar1Label="Logged"
                        bar1Val={`${globalStats.totalRegisters}`}
                        bar1Pct={100}
                        bar2Label="Pending"
                        bar2Val="0"
                        bar2Pct={0}
                        statusText="Up to date"
                    />
                    <AttendanceRingCard
                        title="Action Items"
                        typeLabel="Pending Tasks"
                        mainValue={globalStats.pendingLeaves + globalStats.activeKiosks}
                        totalValue="Tasks"
                        pct={globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? 100 : 0}
                        theme={globalStats.pendingLeaves > 0 ? "r" : (globalStats.activeKiosks > 0 ? "k" : "p")}
                        icon={<MonitorPlay size={18} />}
                        bar1Label="Live Classes"
                        bar1Val={`${globalStats.activeKiosks}`}
                        bar1Pct={globalStats.activeKiosks > 0 ? 50 : 0}
                        bar2Label="Pending Leaves"
                        bar2Val={`${globalStats.pendingLeaves}`}
                        bar2Pct={globalStats.pendingLeaves > 0 ? 50 : 0}
                        statusText={globalStats.pendingLeaves > 0 ? "Needs Review" : (globalStats.activeKiosks > 0 ? "Live Now" : "All Clear")}
                    />
                </div>
            )}

            {activeTab === 'registers' && selectedCohortId && cohortStats && (
                <div className="mc-cards-wrapper animate-fade-in">
                    <AttendanceRingCard
                        title="Term Progress"
                        typeLabel="Timeline"
                        mainValue={cohortStats.daysCompleted}
                        totalValue={`${cohortStats.netExpectedTermDays} Days`}
                        pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
                        theme="p"
                        icon={<Target size={18} />}
                        bar1Label="Completed"
                        bar1Val={`${cohortStats.daysCompleted} days`}
                        bar1Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
                        bar2Label="Remaining"
                        bar2Val={`${Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted)} days`}
                        bar2Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted) / cohortStats.netExpectedTermDays) * 100) : 0}
                        statusText="Active Term"
                    />
                    <AttendanceRingCard
                        title="Average Attendance"
                        typeLabel="Cohort Health"
                        mainValue={`${cohortStats.avgAttendanceRate}%`}
                        totalValue="Target: 80%"
                        pct={cohortStats.avgAttendanceRate}
                        theme={cohortStats.avgAttendanceRate >= 80 ? "w" : (cohortStats.avgAttendanceRate >= 50 ? "k" : "r")}
                        icon={<BarChart2 size={18} />}
                        bar1Label="Present"
                        bar1Val="Avg"
                        bar1Pct={cohortStats.avgAttendanceRate}
                        bar2Label="Absent"
                        bar2Val="Avg"
                        bar2Pct={100 - cohortStats.avgAttendanceRate}
                        statusText={cohortStats.avgAttendanceRate >= 80 ? "On Track" : "Needs Attention"}
                    />
                    <AttendanceRingCard
                        title="Excluded Days"
                        typeLabel="Off-Campus"
                        mainValue={cohortStats.holidaysCount + cohortStats.recessCount}
                        totalValue="Total Off"
                        pct={cohortStats.holidaysCount + cohortStats.recessCount > 0 ? 100 : 0}
                        theme="k"
                        icon={<Coffee size={18} />}
                        bar1Label="Holidays"
                        bar1Val={`${cohortStats.holidaysCount} days`}
                        bar1Pct={cohortStats.holidaysCount > 0 ? 50 : 0}
                        bar2Label="Recess"
                        bar2Val={`${cohortStats.recessCount} days`}
                        bar2Pct={cohortStats.recessCount > 0 ? 50 : 0}
                        statusText="Term Breaks"
                    />
                </div>
            )}

            {/* TAB 1: REGISTERS TABLE */}
            {activeTab === 'registers' && (
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
                                                <span className="att-date-cell__label">{moment(record.date).format('DD MMM YYYY')}</span>
                                            </div>
                                        </td>
                                        {isAdmin && <td><span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>{cohortName}</span></td>}
                                        <td><span className="att-badge att-badge--present"><Users size={11} /> {presentCount} Present</span></td>
                                        <td>{proofCount > 0 ? <span className="att-badge att-badge--proof"><FileText size={11} /> {proofCount} Attached</span> : <span className="att-no-data">None</span>}</td>
                                        <td className="att-td--right">
                                            <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn" onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}>
                                                Open Register <ArrowRight size={13} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
                                        {history.length === 0 ? (
                                            <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><History size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No Records Yet</p><p className="mlab-empty__desc">Saved attendance registers will appear here.</p></div>
                                        ) : (
                                            <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => setRegisterSearch('')} style={{ marginTop: '1rem' }}>Clear Search</button></div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TAB 2: CALENDAR VIEW (ALIGNED WITH QCTOCOHORTVIEW DESIGN SYSTEM) */}
            {activeTab === 'calendar' && (
                <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
                    <div className="lfm-header">
                        <h2 className="lfm-header__title">
                            <Calendar size={18} /> Cohort Attendance Calendar
                        </h2>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {selectedCohortId && (
                                <button
                                    className="lfm-btn"
                                    onClick={() => setIsStipendModalOpen(true)}
                                    style={{ background: 'var(--mlab-green)', border: 'none' }}
                                >
                                    <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
                                </button>
                            )}

                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--mlab-white)', padding: '4px', border: '1px solid var(--mlab-border)' }}>
                                <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronLeft size={16} /></button>
                                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
                                <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-blue)', display: 'flex' }}><ChevronRight size={16} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
                        {!selectedCohortId && (
                            <div style={{ marginBottom: '1.5rem', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 0, color: '#b45309', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
                                <AlertTriangle size={18} /> Please select a specific cohort from the dropdown above to view accurate daily attendance metrics.
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '4px 10px', border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
                                {history.filter(r => !selectedCohortId || r.cohortId === selectedCohortId).length} Total Sessions
                            </span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', background: '#fffbeb', color: '#d97706', padding: '4px 10px', border: '1px solid #fde68a', textTransform: 'uppercase' }}>
                                {pendingLeaveCount} Pending Leaves
                            </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                                <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                            {calendarGrid.map((day) => {
                                const dateStr = day.format('YYYY-MM-DD');
                                const isCurrentMonth = day.month() === calendarMonth.month();
                                const isToday = dateStr === moment().format('YYYY-MM-DD');
                                const data = calendarDataMap.get(dateStr);

                                return (
                                    <div
                                        key={dateStr}
                                        onClick={() => {
                                            if (data?.hasRegister && selectedCohortId) {
                                                navigate(`/facilitator/attendance/${selectedCohortId}?date=${dateStr}`);
                                            } else if (data?.leaves > 0) {
                                                setLeaveSearch('');
                                                setActiveTab('leaves');
                                            } else if (selectedCohortId) {
                                                setRegisterSearch(dateStr);
                                                setActiveTab('registers');
                                            }
                                        }}
                                        style={{
                                            border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)',
                                            borderRadius: 0,
                                            minHeight: '110px',
                                            padding: '10px',
                                            backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent',
                                            opacity: isCurrentMonth ? 1 : 0.6,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            boxShadow: isToday ? 'inset 0 0 0 2px rgba(7,63,78,0.1)' : 'none'
                                        }}
                                        onMouseOver={e => e.currentTarget.style.borderColor = 'var(--mlab-green)'}
                                        onMouseOut={e => e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : 'var(--mlab-border)'}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{
                                                fontWeight: '700',
                                                fontFamily: 'var(--font-heading)',
                                                color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)',
                                                background: isToday ? 'var(--mlab-blue)' : 'transparent',
                                                width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem'
                                            }}>{day.format('D')}</span>
                                        </div>

                                        {data && (
                                            <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                {data.isHoliday && <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>Public Holiday</span>}
                                                {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #e9d5ff' }}>{data.label || 'Recess'}</span>}

                                                {/* 🚀 MULTI-STATUS GRANULAR STATUS PILLS */}
                                                {data.hasRegister && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        {data.present > 0 && (
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--mlab-green-dark)', background: 'var(--mlab-green-bg)', padding: '2px 4px', fontWeight: 'bold', border: '1px solid var(--mlab-green)' }}>
                                                                {data.present} Present
                                                            </span>
                                                        )}
                                                        {data.partial > 0 && (
                                                            <span style={{ fontSize: '0.65rem', color: '#b45309', background: '#fffbeb', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fcd34d' }}>
                                                                {data.partial} Partial
                                                            </span>
                                                        )}
                                                        {(data.excused > 0 || data.approvedLeaves > 0) && (
                                                            <span style={{ fontSize: '0.65rem', color: '#0369a1', background: '#e0f2fe', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #bae6fd' }}>
                                                                {data.excused || data.approvedLeaves} Reported
                                                            </span>
                                                        )}
                                                        {data.absent > 0 && (
                                                            <span style={{ fontSize: '0.65rem', color: '#991b1b', background: '#fef2f2', padding: '2px 4px', fontWeight: 'bold', border: '1px solid #fca5a5' }}>
                                                                {data.absent} Unexcused
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {!data.hasRegister && data.leaves > 0 && (
                                                    <span style={{ marginTop: '4px', fontSize: '0.65rem', background: data.pendingLeaves > 0 ? '#fffbeb' : 'var(--mlab-bg)', color: data.pendingLeaves > 0 ? '#d97706' : 'var(--mlab-grey)', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', border: `1px solid ${data.pendingLeaves > 0 ? '#fde68a' : 'var(--mlab-border)'}` }}>
                                                        <FileText size={10} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: LEAVES */}
            {activeTab === 'leaves' && (
                <>
                    <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
                        <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><FileText size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{displayedLeavesData.length}</span><span className="cdp-stat-card__label">Total Requests</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: pendingLeaveCount > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{pendingLeaveCount}</span><span className="cdp-stat-card__label">Pending Review</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><CheckCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{approvedLeaveCount}</span><span className="cdp-stat-card__label">Approved</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><XCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: declinedLeaveCount > 0 ? '#ef4444' : 'inherit' }}>{declinedLeaveCount}</span><span className="cdp-stat-card__label">Declined</span></div></div>
                    </div>

                    <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            <div className="mlab-search" style={{ minWidth: '220px', borderRadius: 0 }}>
                                <Search size={18} color="var(--mlab-grey)" />
                                <input type="text" placeholder="Search by learner name..." value={leaveSearch} onChange={e => setLeaveSearch(e.target.value)} />
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

                        {/* LOG LEAVE FOR LEARNER BUTTON */}
                        <button
                            className="mlab-btn"
                            onClick={() => setIsLogLeaveModalOpen(true)}
                            style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            <Plus size={16} /> Log Leave for Learner
                        </button>
                    </div>

                    <div className="mlab-table-wrap">
                        {isLeavesLoading ? (
                            <div className="att-loader-wrap att-loader-wrap--inline"><Loader message="Fetching requests…" /></div>
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
                                                <td><span className="mlab-cell-name">{req.learnerName || req.learnerId}</span></td>
                                                <td>
                                                    <div className="att-dates-cell">
                                                        <div className="att-dates-cell__start"><Calendar size={13} className="att-dates-cell__icon" /><span className="att-dates-cell__label">{fmtStart}</span></div>
                                                        {!isSameDay && <div className="att-dates-cell__end"><ArrowRightCircle size={12} className="att-dates-cell__arrow" /><span className="att-dates-cell__label--end">{fmtEnd}</span></div>}
                                                    </div>
                                                </td>
                                                <td><div className="att-reason-cell"><span className="att-reason-cell__type">{req.type}</span><span className="att-reason-cell__quote">"{req.reason}"</span></div></td>
                                                <td>
                                                    {req.attachmentUrl ? (
                                                        <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" className="att-attach-link" title={req.attachmentName || 'Download Document'}>
                                                            <DownloadCloud size={14} /><span className="att-attach-link__text">{req.attachmentName ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName) : 'View File'}</span>
                                                        </a>
                                                    ) : <span className="att-no-data">No Attachment</span>}
                                                </td>
                                                <td>
                                                    {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
                                                    {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
                                                    {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
                                                </td>
                                                <td className="att-td--right">
                                                    {req.status === 'Pending' ? (
                                                        <div className="att-action-btns">
                                                            <button className="att-btn att-btn--approve" onClick={() => handleLeaveAction(req.id, 'Approved')}><CheckCircle size={12} /> Approve</button>
                                                            <button className="att-btn att-btn--decline" onClick={() => handleLeaveAction(req.id, 'Declined')}><XCircle size={12} /> Decline</button>
                                                        </div>
                                                    ) : <span className="att-reviewed-label">Reviewed</span>}
                                                </td>
                                            </tr>
                                        );
                                    }) : (
                                        <tr>
                                            <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
                                                {displayedLeavesData.length === 0 ? (
                                                    <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">All Caught Up!</p><p className="mlab-empty__desc">No leave requests are pending review.</p></div>
                                                ) : (
                                                    <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => { setLeaveSearch(''); setLeaveStatusFilter('all'); setLeaveTypeFilter('all'); }} style={{ marginTop: '1rem' }}>Clear Filters</button></div>
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

// import React, { useState, useEffect, useMemo, useRef } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     collection, query, where, getDocs, orderBy
// } from 'firebase/firestore';
// import {
//     FileText, Calendar, ArrowRight, AlertTriangle, History,
//     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
//     DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target, MonitorPlay, Layers, ChevronLeft, ChevronRight,
//     DollarSign, Calculator, Loader2, X
// } from 'lucide-react';
// import { useNavigate, useSearchParams } from 'react-router-dom';
// import * as XLSX from 'xlsx';
// import { db } from '../../../lib/firebase';
// import Loader from '../../../components/common/Loader/Loader';
// import moment from 'moment';
// import '../../../components/views/LearnersView/LearnersView.css';
// import './AttendanceHistoryList.css';
// import { useStore } from '../../../store/useStore';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { AttendanceRingCard } from '../AttendancePage';

// // ─── HELPER: TIMESTAMP-SAFE DATE EXTRACTOR ──────────────────────────────────
// const extractDateString = (val: any): string => {
//     if (!val) return '';
//     if (typeof val === 'string') return val.split('T')[0];
//     if (typeof val === 'object' && typeof val.seconds === 'number') {
//         return moment(val.seconds * 1000).format('YYYY-MM-DD');
//     }
//     if (val instanceof Date) {
//         return moment(val).format('YYYY-MM-DD');
//     }
//     return '';
// };

// // ─── STIPEND EXPORT MODAL ───────────────────────────────────────────────────

// export const StipendExportModal: React.FC<{
//     isOpen: boolean;
//     onClose: () => void;
//     cohortId: string;
//     cohortName: string;
//     learners: any[];
//     attendanceMode: 'qcto' | 'bootcamp';
//     initialMonth: string;
// }> = ({ isOpen, onClose, cohortId, cohortName, learners, attendanceMode, initialMonth }) => {
//     const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
//     const [stipendAmount, setStipendAmount] = useState<number>(3500);
//     const [isGenerating, setIsGenerating] = useState(false);
//     const toast = useToast();

//     useEffect(() => {
//         if (isOpen) setSelectedMonth(initialMonth);
//     }, [initialMonth, isOpen]);

//     if (!isOpen) return null;

//     const handleExport = async () => {
//         setIsGenerating(true);

//         try {
//             let totalLoggedDays = 0;
//             const learnerStats: Record<string, { present: number, partial: number, approvedLeave: number }> = {};

//             learners.forEach(l => {
//                 const statsObj = { present: 0, partial: 0, approvedLeave: 0 };
//                 if (l.idNumber) learnerStats[l.idNumber] = statsObj;
//                 if (l.id) learnerStats[l.id] = statsObj;
//             });

//             // 1. Fetch approved leaves
//             const leavesSnap = await getDocs(query(collection(db, 'leave_requests'), where('status', '==', 'Approved')));
//             const paidLeaveDates = new Map<string, Set<string>>();

//             leavesSnap.docs.forEach(doc => {
//                 const lv = doc.data();
//                 const id = lv.learnerId || lv.idNumber;
//                 if (!id) return;

//                 if (!paidLeaveDates.has(id)) paidLeaveDates.set(id, new Set());
//                 const dateSet = paidLeaveDates.get(id)!;

//                 const start = lv.startDate || lv.dateAffected;
//                 const end = lv.endDate || lv.dateAffected;

//                 if (start && end) {
//                     let current = new Date(start);
//                     const endDate = new Date(end);
//                     while (current <= endDate) {
//                         dateSet.add(current.toISOString().split('T')[0]);
//                         current.setDate(current.getDate() + 1);
//                     }
//                 }
//             });

//             // 2. Fetch attendance logs and records
//             if (attendanceMode === 'bootcamp') {
//                 const logsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('cohortId', '==', cohortId)));
//                 const monthLogs = logsSnap.docs.filter(d => {
//                     const data = d.data();
//                     const dateStr = extractDateString(data.sessionDate || data.date || data.createdAt);
//                     return dateStr.startsWith(selectedMonth);
//                 });
//                 totalLoggedDays = monthLogs.length;

//                 const recsSnap = await getDocs(query(collection(db, 'attendance_records'), where('cohortId', '==', cohortId)));
//                 recsSnap.docs.forEach(d => {
//                     const data = d.data();
//                     const dateStr = extractDateString(data.sessionDate || data.date || data.timestamp || data.checkInTime);

//                     if (dateStr.startsWith(selectedMonth)) {
//                         const targetId = data.learnerId || data.learner_id || data.idNumber;
//                         const match = learners.find(l => l.id === targetId || l.idNumber === targetId);
//                         if (match) {
//                             const key = match.idNumber || match.id;
//                             const st = (data.status || '').toLowerCase();
//                             if (['present', 'check_in', 'present_onsite'].includes(st)) {
//                                 if (learnerStats[key]) learnerStats[key].present++;
//                             } else if (st === 'partial' || st === 'late') {
//                                 if (learnerStats[key]) learnerStats[key].partial++;
//                             } else {
//                                 if (paidLeaveDates.get(targetId)?.has(dateStr) || paidLeaveDates.get(match.idNumber)?.has(dateStr)) {
//                                     if (learnerStats[key]) learnerStats[key].approvedLeave++;
//                                 }
//                             }
//                         }
//                     }
//                 });
//             } else {
//                 const attSnap = await getDocs(query(collection(db, 'attendance'), where('cohortId', '==', cohortId)));
//                 const monthAtts = attSnap.docs.filter(d => {
//                     const dateStr = extractDateString(d.data().date);
//                     return dateStr.startsWith(selectedMonth);
//                 });
//                 totalLoggedDays = monthAtts.length;

//                 monthAtts.forEach(d => {
//                     const data = d.data();
//                     const dateStr = extractDateString(data.date);
//                     const presents = data.presentLearners || [];

//                     learners.forEach(l => {
//                         const idNum = l.idNumber || l.id;
//                         if (presents.includes(idNum) || presents.includes(l.id)) {
//                             if (learnerStats[idNum]) learnerStats[idNum].present++;
//                         } else {
//                             if (paidLeaveDates.get(idNum)?.has(dateStr) || paidLeaveDates.get(l.id)?.has(dateStr)) {
//                                 if (learnerStats[idNum]) learnerStats[idNum].approvedLeave++;
//                             }
//                         }
//                     });
//                 });
//             }

//             if (totalLoggedDays === 0) {
//                 toast.error(`No attendance registers found for ${selectedMonth}.`);
//                 setIsGenerating(false);
//                 return;
//             }

//             // 3. Setup Excel Headers
//             const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });
//             const headers = [
//                 "Learner Name",
//                 "ID Number",
//                 "Total Logged Days",
//                 "Days Present (1.0)",
//                 "Days Partial (0.5)",
//                 "Approved Paid Leave (1.0)",
//                 "Unpaid Days Missed",
//                 "Base Stipend (ZAR)",
//                 "Calculated Payout (ZAR)"
//             ];

//             const dataRows = [headers.map(createTextCell)];

//             learners.forEach(learner => {
//                 const key = learner.idNumber || learner.id;
//                 const stats = learnerStats[key] || { present: 0, partial: 0, approvedLeave: 0 };

//                 const presentCount = stats.present;
//                 const partialCount = stats.partial;
//                 const approvedLeaveCount = stats.approvedLeave;

//                 const equivalentDaysPaid = presentCount + approvedLeaveCount + (partialCount * 0.5);
//                 const unpaidDaysMissed = totalLoggedDays - presentCount - partialCount - approvedLeaveCount;

//                 const cappedPaidDays = Math.min(equivalentDaysPaid, totalLoggedDays);
//                 const payout = totalLoggedDays > 0 ? (cappedPaidDays / totalLoggedDays) * stipendAmount : 0;

//                 dataRows.push([
//                     learner.fullName,
//                     learner.idNumber,
//                     totalLoggedDays,
//                     presentCount,
//                     partialCount,
//                     approvedLeaveCount,
//                     Math.max(0, unpaidDaysMissed),
//                     `R ${stipendAmount.toFixed(2)}`,
//                     `R ${payout.toFixed(2)}`
//                 ].map(createTextCell));
//             });

//             const wb = XLSX.utils.book_new();

//             const summarySheet = XLSX.utils.aoa_to_sheet([
//                 ["STIPEND RECONCILIATION REPORT"],
//                 ["Cohort:", cohortName],
//                 ["Month:", selectedMonth],
//                 ["Base Stipend:", `R ${stipendAmount.toFixed(2)}`],
//                 ["Total Logged Training Days:", totalLoggedDays],
//                 ["Note:", "Approved Paid Leave is calculated at 1.0 day rate. Partial attendance is calculated at 0.5 day rate."],
//                 ["Export Date:", new Date().toLocaleDateString()]
//             ].map(r => r.map(createTextCell)));

//             const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

//             XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
//             XLSX.utils.book_append_sheet(wb, dataSheet, 'Payroll Data');

//             const fileName = `Stipends_${cohortName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedMonth}.xlsx`;
//             XLSX.writeFile(wb, fileName);

//             toast.success("Stipend export generated successfully!");
//             onClose();

//         } catch (error) {
//             console.error("Export error:", error);
//             toast.error("Failed to generate stipend export.");
//         } finally {
//             setIsGenerating(false);
//         }
//     };

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
//                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
//                     <div className="wm-modal__header-icon" style={{ background: '#f0fdf4', color: '#166534' }}>
//                         <DollarSign size={20} />
//                     </div>
//                     <div>
//                         <h2 className="wm-modal__title">Export Monthly Stipends</h2>
//                         <p className="wm-modal__subtitle">Calculate pro-rata payouts based on timesheets.</p>
//                     </div>
//                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>

//                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                     <div className="wm-form-group">
//                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Calendar size={14} /> Select Month
//                         </label>
//                         <input
//                             type="month"
//                             className="wm-form-input"
//                             value={selectedMonth}
//                             onChange={e => setSelectedMonth(e.target.value)}
//                         />
//                     </div>

//                     <div className="wm-form-group">
//                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <Calculator size={14} /> Monthly Base Stipend (ZAR)
//                         </label>
//                         <div style={{ position: 'relative' }}>
//                             <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>R</span>
//                             <input
//                                 type="number"
//                                 className="wm-form-input"
//                                 style={{ paddingLeft: '32px' }}
//                                 value={stipendAmount}
//                                 onChange={e => setStipendAmount(Number(e.target.value))}
//                                 min="0"
//                                 step="100"
//                             />
//                         </div>
//                         <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.5, border: '1px solid #cbd5e1' }}>
//                             <strong>Calculation Logic:</strong>
//                             <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
//                                 <li><strong>Present:</strong> 1.0 day rate</li>
//                                 <li><strong style={{ color: 'var(--mlab-green)' }}>Approved Leave:</strong> 1.0 day rate (Paid)</li>
//                                 <li><strong>Partial:</strong> 0.5 day rate</li>
//                                 <li><strong>Absent:</strong> Unpaid</li>
//                             </ul>
//                         </div>
//                     </div>
//                 </div>

//                 <div className="wm-modal__footer">
//                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isGenerating}>Cancel</button>
//                     <button className="mlab-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={handleExport} disabled={isGenerating || stipendAmount <= 0 || !selectedMonth}>
//                         {isGenerating ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />} Generate Excel
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };

// // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// let cachedHistory: any[] | null = null;

// export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
//     const navigate = useNavigate();
//     const toast = useToast();
//     const [searchParams, setSearchParams] = useSearchParams();

//     const updateParam = (key: string, value: string) => {
//         const params = new URLSearchParams(searchParams);
//         if (value && value !== 'all') {
//             params.set(key, value);
//         } else {
//             params.delete(key);
//         }
//         setSearchParams(params, { replace: true });
//     };

//     const activeTab = (searchParams.get('view') as 'registers' | 'leaves' | 'calendar') || 'registers';

//     const selectedCohortId = searchParams.get('cohort') || '';
//     const registerSearch = searchParams.get('date') || '';
//     const leaveSearch = searchParams.get('leaveSearch') || '';
//     const leaveStatusFilter = searchParams.get('leaveStatus') || 'all';
//     const leaveTypeFilter = searchParams.get('leaveType') || 'all';

//     const setActiveTab = (val: 'registers' | 'leaves' | 'calendar') => updateParam('view', val);

//     const setSelectedCohortId = (val: string) => updateParam('cohort', val);
//     const setRegisterSearch = (val: string) => updateParam('date', val);
//     const setLeaveSearch = (val: string) => updateParam('leaveSearch', val);
//     const setLeaveStatusFilter = (val: string) => updateParam('leaveStatus', val);
//     const setLeaveTypeFilter = (val: string) => updateParam('leaveType', val);

//     const user = useStore(s => s.user);
//     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

//     const allCohorts = useStore(s => s.cohorts) || [];
//     const allLearners = useStore(s => s.learners) || [];
//     const fetchCohorts = useStore(s => s.fetchCohorts);

//     useEffect(() => {
//         if (allCohorts.length === 0 && fetchCohorts) {
//             fetchCohorts();
//         }
//     }, [allCohorts.length, fetchCohorts]);

//     const availableCohorts = useMemo(() => {
//         if (isAdmin) return allCohorts;
//         const targetId = facilitatorId || user?.uid;
//         return allCohorts.filter(c =>
//             c.facilitatorId === targetId ||
//             c.supportFacilitatorId === targetId
//         );
//     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

//     const activeCohortLearners = useMemo(() => {
//         return allLearners.filter(l =>
//             l.cohortId === selectedCohortId &&
//             l.status !== 'dropped'
//         );
//     }, [allLearners, selectedCohortId]);

//     const [reconcileDate, setReconcileDate] = useState<string>('');
//     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
//     const leaveRequests = useStore(s => s.leaveRequests) || [];
//     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
//     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

//     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
//     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
//     const [error, setError] = useState<string | null>(null);

//     const [liveKioskCount, setLiveKioskCount] = useState(0);
//     const [holidays, setHolidays] = useState<string[]>([]);

//     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
//     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);
//     const hasFetchedLeaves = useRef(false);

//     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));
//     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);

//     const [modalConfig, setModalConfig] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//         confirmText?: string;
//         onConfirm?: () => void;
//         onCancel?: () => void;
//     }>({ isOpen: false, type: 'info', title: '', message: '' });

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

//     // ── Fetch registers & live kiosks (Robust Timestamp extraction) ─────────────
//     useEffect(() => {
//         const fetchData = async () => {
//             if (!user) return;

//             if (cachedHistory === null) setLoadingRegisters(true);
//             setError(null);

//             try {
//                 let qHist;
//                 let qLogs;
//                 let qRecs;

//                 if (isAdmin) {
//                     qHist = query(collection(db, 'attendance'));
//                     qLogs = query(collection(db, 'attendance_logs'));
//                     qRecs = query(collection(db, 'attendance_records'));
//                 } else {
//                     const myCohortIds = availableCohorts.map(c => c.id);
//                     if (myCohortIds.length > 0) {
//                         const chunk = myCohortIds.slice(0, 10);
//                         qHist = query(collection(db, 'attendance'), where('cohortId', 'in', chunk));
//                         qLogs = query(collection(db, 'attendance_logs'), where('cohortId', 'in', chunk));
//                         qRecs = query(collection(db, 'attendance_records'), where('cohortId', 'in', chunk));
//                     } else {
//                         qHist = query(collection(db, 'attendance'), where('cohortId', '==', 'NONE'));
//                         qLogs = query(collection(db, 'attendance_logs'), where('cohortId', '==', 'NONE'));
//                         qRecs = query(collection(db, 'attendance_records'), where('cohortId', '==', 'NONE'));
//                     }
//                 }

//                 const [snap, logsSnap, recsSnap] = await Promise.all([
//                     getDocs(qHist),
//                     getDocs(qLogs),
//                     getDocs(qRecs)
//                 ]);

//                 let fresh = snap.docs.map(d => {
//                     const data = d.data();
//                     const cleanDate = extractDateString(data.date);
//                     return { id: d.id, ...data, date: cleanDate };
//                 });

//                 // Group individual attendance_records by `${cohortId}_${date}`
//                 const recordsByCohortDate = new Map<string, { present: string[], absent: string[] }>();

//                 recsSnap.docs.forEach(d => {
//                     const data = d.data();
//                     const cleanDate = extractDateString(data.sessionDate || data.date || data.timestamp || data.checkInTime);
//                     const targetCohort = data.cohortId || data.cohort_id;
//                     if (!cleanDate || !targetCohort) return;

//                     const key = `${targetCohort}_${cleanDate}`;
//                     if (!recordsByCohortDate.has(key)) {
//                         recordsByCohortDate.set(key, { present: [], absent: [] });
//                     }
//                     const entry = recordsByCohortDate.get(key)!;
//                     const lId = data.learnerId || data.learner_id || data.idNumber;
//                     const st = (data.status || '').toLowerCase();

//                     if (['present', 'check_in', 'present_onsite', 'late', 'partial'].includes(st)) {
//                         if (lId && !entry.present.includes(lId)) entry.present.push(lId);
//                     } else if (['absent', 'absent_unexcused'].includes(st)) {
//                         if (lId && !entry.absent.includes(lId)) entry.absent.push(lId);
//                     }
//                 });

//                 // Map attendance_logs into register format
//                 const logDocs: any[] = [];
//                 const logKeys = new Set<string>();

//                 logsSnap.docs.forEach(d => {
//                     const data = d.data();
//                     const cleanDate = extractDateString(data.sessionDate || data.date || data.createdAt);
//                     const targetCohort = data.cohortId || data.cohort_id;
//                     if (!cleanDate || !targetCohort) return;

//                     const key = `${targetCohort}_${cleanDate}`;
//                     logKeys.add(key);

//                     const recData = recordsByCohortDate.get(key);
//                     const presentLearners = recData?.present.length
//                         ? recData.present
//                         : Array(data.totalPresent || data.presentCount || 0).fill('present');
//                     const absentLearners = recData?.absent.length
//                         ? recData.absent
//                         : Array(data.totalAbsent || data.absentCount || 0).fill('absent');

//                     logDocs.push({
//                         id: d.id,
//                         cohortId: targetCohort,
//                         date: cleanDate,
//                         presentLearners,
//                         absentLearners,
//                         isBootcampLog: true,
//                         proofs: data.proofs || {},
//                         ...data
//                     });
//                 });

//                 // Create virtual registers for unmapped attendance_records
//                 recordsByCohortDate.forEach((recData, key) => {
//                     if (!logKeys.has(key)) {
//                         const parts = key.split('_');
//                         const cDate = parts.pop() || '';
//                         const cId = parts.join('_');
//                         logDocs.push({
//                             id: `virtual_${key}`,
//                             cohortId: cId,
//                             date: cDate,
//                             presentLearners: recData.present,
//                             absentLearners: recData.absent,
//                             isBootcampLog: true
//                         });
//                     }
//                 });

//                 // Merge into fresh registers without duplicates
//                 const existingKeys = new Set(fresh.map((r: any) => `${r.cohortId}_${r.date}`));
//                 logDocs.forEach(log => {
//                     const key = `${log.cohortId}_${log.date}`;
//                     if (!existingKeys.has(key)) {
//                         fresh.push(log);
//                         existingKeys.add(key);
//                     }
//                 });

//                 fresh.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

//                 cachedHistory = fresh;
//                 setHistory(fresh);

//                 // Fetch active live kiosks
//                 const todayStr = moment().format('YYYY-MM-DD');
//                 let qKiosk;
//                 if (isAdmin) {
//                     qKiosk = query(collection(db, 'kiosk_sessions'), where('date', '==', todayStr), where('status', '==', 'active'));
//                 } else {
//                     const myCohortIds = availableCohorts.map(c => c.id);
//                     if (myCohortIds.length > 0) {
//                         const chunk = myCohortIds.slice(0, 10);
//                         qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', 'in', chunk), where('date', '==', todayStr), where('status', '==', 'active'));
//                     } else {
//                         qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', '==', 'NONE'));
//                     }
//                 }
//                 const kioskSnap = await getDocs(qKiosk);
//                 setLiveKioskCount(kioskSnap.size);

//             } catch (err: any) {
//                 console.error('Firestore Attendance Fetch Error:', err);
//                 setError(err.message);
//             } finally {
//                 setLoadingRegisters(false);
//             }
//         };
//         fetchData();
//     }, [facilitatorId, isAdmin, user, availableCohorts]);

//     useEffect(() => {
//         if (activeTab === 'leaves' || activeTab === 'calendar') {
//             if (isAdmin) {
//                 if (!hasFetchedLeaves.current) {
//                     setLoadingAdminLeaves(true);
//                 }
//                 getDocs(collection(db, 'leave_requests')).then(snap => {
//                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
//                     hasFetchedLeaves.current = true;
//                 }).finally(() => setLoadingAdminLeaves(false));
//             } else {
//                 const targetId = facilitatorId || user?.uid;
//                 if (targetId && leaveRequests.length === 0) {
//                     fetchFacilitatorLeaveRequests(targetId);
//                 }
//             }
//         }
//     }, [activeTab]);

//     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
//     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

//     const { pendingLeaveCount, approvedLeaveCount, declinedLeaveCount } = useMemo(() => {
//         let pending = 0, approved = 0, declined = 0;
//         displayedLeavesData.forEach(r => {
//             if (r.status === 'Pending') pending++;
//             else if (r.status === 'Approved') approved++;
//             else if (r.status === 'Declined') declined++;
//         });
//         return { pendingLeaveCount: pending, approvedLeaveCount: approved, declinedLeaveCount: declined };
//     }, [displayedLeavesData]);

//     const filteredHistory = useMemo(() => {
//         let data = history;
//         if (selectedCohortId) data = data.filter(r => r.cohortId === selectedCohortId);
//         if (registerSearch) data = data.filter(r => r.date === registerSearch);
//         return data;
//     }, [history, registerSearch, selectedCohortId]);

//     const globalStats = useMemo(() => {
//         if (history.length === 0) return null;
//         let totalExpectedScans = 0, totalPresentScans = 0;

//         history.forEach(reg => {
//             const present = reg.presentLearners?.length || 0;
//             const absent = reg.absentLearners?.length || 0;
//             const dailyTotal = present + absent;
//             if (dailyTotal > 0) {
//                 totalExpectedScans += dailyTotal;
//                 totalPresentScans += present;
//             }
//         });

//         return {
//             totalRegisters: history.length,
//             globalAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0,
//             pendingLeaves: pendingLeaveCount,
//             activeKiosks: liveKioskCount
//         };
//     }, [history, pendingLeaveCount, liveKioskCount]);

//     const cohortStats = useMemo(() => {
//         if (!selectedCohortId) return null;
//         const cohort = availableCohorts.find(c => c.id === selectedCohortId);
//         if (!cohort || !cohort.startDate || !cohort.endDate) return null;

//         const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);
//         let totalWeekdays = 0, holidaysCount = 0, recessCount = 0;

//         const start = moment(cohort.startDate);
//         const end = moment(cohort.endDate);
//         const current = start.clone();

//         while (current.isSameOrBefore(end, 'day')) {
//             const dayOfWeek = current.day();
//             if (dayOfWeek !== 0 && dayOfWeek !== 6) {
//                 totalWeekdays++;
//                 const dateStr = current.format('YYYY-MM-DD');
//                 if (holidays.includes(dateStr)) holidaysCount++;
//                 else if ((cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'))) recessCount++;
//             }
//             current.add(1, 'day');
//         }

//         let totalExpectedScans = 0, totalPresentScans = 0;
//         cohortRegisters.forEach(reg => {
//             const present = reg.presentLearners?.length || 0;
//             const absent = reg.absentLearners?.length || 0;
//             const dailyTotal = present + absent || (cohort.learnerIds?.length || 0);

//             if (dailyTotal > 0) {
//                 totalExpectedScans += dailyTotal;
//                 totalPresentScans += present;
//             }
//         });

//         return {
//             netExpectedTermDays: totalWeekdays - holidaysCount - recessCount,
//             daysCompleted: cohortRegisters.length,
//             holidaysCount,
//             recessCount,
//             avgAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0
//         };
//     }, [selectedCohortId, availableCohorts, history, holidays]);

//     const filteredLeaves = useMemo(() => {
//         return displayedLeavesData.filter(req => {
//             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
//             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
//             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
//             return matchesSearch && matchesStatus && matchesType;
//         });
//     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

//     const todayString = moment().format('YYYY-MM-DD');
//     const isFinalizedToday = selectedCohortId ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString) : false;

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
//                     await updateLeaveStatus(id, status, { reviewedBy: user?.uid || 'Unknown', reviewedByName: user?.fullName || 'Unknown Admin' });
//                     if (isAdmin) {
//                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status, reviewedBy: user?.uid, reviewedByName: user?.fullName } : req));
//                     }
//                     toast.success(`Leave request marked as ${status}.`);
//                 } catch (err) {
//                     toast.error('Failed to update the leave status.');
//                 }
//             }
//         });
//     };

//     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
//     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

//     const calendarGrid = useMemo(() => {
//         const startDay = calendarMonth.day();
//         const diff = startDay === 0 ? 6 : startDay - 1;
//         const startGrid = calendarMonth.clone().subtract(diff, 'days');

//         const endOfMonth = calendarMonth.clone().endOf('month');
//         const endDay = endOfMonth.day();
//         const endDiff = endDay === 0 ? 0 : 7 - endDay;
//         const endGrid = endOfMonth.clone().add(endDiff, 'days');

//         const grid = [];
//         let curr = startGrid.clone();
//         while (curr.isSameOrBefore(endGrid)) {
//             grid.push(curr.clone());
//             curr.add(1, 'day');
//         }
//         return grid;
//     }, [calendarMonth]);

//     const calendarDataMap = useMemo(() => {
//         const map = new Map();

//         holidays.forEach(h => map.set(h, { isHoliday: true }));

//         if (selectedCohortId) {
//             const cohort = availableCohorts.find(c => c.id === selectedCohortId);
//             if (cohort?.recessPeriods) {
//                 cohort.recessPeriods.forEach((p: any) => {
//                     let curr = moment(p.start);
//                     const end = moment(p.end);
//                     while (curr.isSameOrBefore(end)) {
//                         const dStr = curr.format('YYYY-MM-DD');
//                         map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
//                         curr.add(1, 'day');
//                     }
//                 });
//             }
//         }

//         history.forEach(h => {
//             if (!selectedCohortId || h.cohortId === selectedCohortId) {
//                 const dStr = moment(h.date).format('YYYY-MM-DD');
//                 const existing = map.get(dStr) || {};
//                 existing.hasRegister = true;
//                 existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
//                 existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
//                 map.set(dStr, existing);
//             }
//         });

//         displayedLeavesData.forEach(l => {
//             if (!selectedCohortId || l.cohortId === selectedCohortId) {
//                 let curr = moment(l.startDate || l.dateAffected);
//                 const end = moment(l.endDate || l.dateAffected);
//                 while (curr.isSameOrBefore(end)) {
//                     const dStr = curr.format('YYYY-MM-DD');
//                     const existing = map.get(dStr) || {};
//                     existing.leaves = (existing.leaves || 0) + 1;
//                     if (l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
//                     map.set(dStr, existing);
//                     curr.add(1, 'day');
//                 }
//             }
//         });

//         return map;
//     }, [holidays, history, displayedLeavesData, selectedCohortId, availableCohorts]);

//     if (loadingRegisters) {
//         return <div className="att-loader-wrap"><Loader message="Loading Dashboard…" /></div>;
//     }

//     return (
//         <div className="att-root animate-fade-in">
//             <style>{`
//                 .mc-cards-wrapper { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 2rem; }
//                 .mc { background: white; border: 1px solid var(--mlab-border);padding: 22px 20px 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 18px; transition: transform .22s ease, box-shadow .22s ease; cursor: default; }
//                 .mc:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,.06); }
//                 .mc-orb { position: absolute; top: -50px; right: -50px; width: 130px; height: 130px; border-radius: 50%; opacity: .15; filter: blur(28px); pointer-events: none; }
//                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; }
//                 .mc-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
//                 .mc-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: .2em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
//                 .mc-title { font-size: 14px; font-weight: 700; color: var(--mlab-midnight); letter-spacing: -0.2px; line-height: 1.2; }
//                 .mc-pct { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; flex-shrink: 0; margin-top: 1px; color: var(--mlab-midnight); }
//                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 6px 0; }
//                 .mc-ring-svg { transform: rotate(-90deg); }
//                 .mc-ring-track { fill: none; stroke: #f1f5f9; stroke-width: 8px; }
//                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
//                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
//                 .mc-ring-num { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; color: var(--mlab-midnight); }
//                 .mc-ring-denom { font-size: 10px; font-weight: 500; color: var(--mlab-grey); }
//                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
//                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
//                 .mc-bar-lbl { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--mlab-grey); }
//                 .mc-bar-val { font-size: 10px; font-weight: 700; color: var(--mlab-midnight); }
//                 .mc-track { width: 100%; height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
//                 .mc-fill { height: 100%; border-radius: 3px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
//                 @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
//                 .mc-fill-shimmer { background-size: 200% 100%; animation: shimmer 2.4s linear infinite .8s; }
//                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--mlab-border); }
//                 .mc-total { font-size: 11px; font-weight: 500; color: var(--mlab-grey); }
//                 .mc-total strong { font-weight: 800; color: var(--mlab-midnight); }
//                 .mc-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 10px; font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
//                 @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.75); } }
//                 .mc-dot { width: 5px; height: 5px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }

//                 .mc-k .mc-orb { background: #f59e0b; } .mc-k .mc-icon { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-pct { color: #d97706; } .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background-image: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); } .mc-k .mc-fill-secondary { background: #fef3c7; } .mc-k .mc-status { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-dot { background: #d97706; }
//                 .mc-p .mc-orb { background: #38bdf8; } .mc-p .mc-icon { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-pct { color: #0284c7; } .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background-image: linear-gradient(90deg,#7dd3fc,#0ea5e9,#7dd3fc); } .mc-p .mc-fill-secondary { background: #e0f2fe; } .mc-p .mc-status { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-dot { background: #0284c7; }
//                 .mc-w .mc-orb { background: var(--mlab-green); } .mc-w .mc-icon { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-pct { color: #65a30d; } .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background-image: linear-gradient(90deg,#bef264,#84cc16,#bef264); } .mc-w .mc-fill-secondary { background: #ecfccb; } .mc-w .mc-status { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-dot { background: #65a30d; }
//                 .mc-r .mc-orb { background: #ef4444; } .mc-r .mc-icon { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-pct { color: #b91c1c; } .mc-r .mc-ring-fill { stroke: url(#gR); } .mc-r .mc-fill-primary { background-image: linear-gradient(90deg,#fca5a5,#ef4444,#fca5a5); } .mc-r .mc-fill-secondary { background: #fee2e2; } .mc-r .mc-status { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-dot { background: #b91c1c; }
//             `}</style>

//             <svg width="0" height="0" style={{ position: 'absolute' }}>
//                 <defs>
//                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#d97706" /></linearGradient>
//                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
//                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></linearGradient>
//                     <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fca5a5" /><stop offset="100%" stopColor="#b91c1c" /></linearGradient>
//                 </defs>
//             </svg>

//             {modalConfig.isOpen && createPortal(
//                 <div style={{ position: 'relative', zIndex: 999999 }}>
//                     <StatusModal
//                         type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText}
//                         onClose={() => { if (modalConfig.onConfirm) modalConfig.onConfirm(); else setModalConfig(p => ({ ...p, isOpen: false })); }}
//                         onCancel={modalConfig.onCancel}
//                     />
//                 </div>,
//                 document.body
//             )}

//             <StipendExportModal
//                 isOpen={isStipendModalOpen}
//                 onClose={() => setIsStipendModalOpen(false)}
//                 cohortId={selectedCohortId || ''}
//                 cohortName={availableCohorts.find(c => c.id === selectedCohortId)?.name || 'Cohort'}
//                 learners={activeCohortLearners}
//                 attendanceMode={
//                     (() => {
//                         const c = availableCohorts.find(item => item.id === selectedCohortId);
//                         return ((c as any)?.isBootcamp || (c as any)?.cohortType === 'bootcamp' || (c as any)?.type === 'bootcamp')
//                             ? 'bootcamp'
//                             : 'qcto';
//                     })()
//                 }
//                 initialMonth={calendarMonth.format('YYYY-MM')}
//             />

//             <div className="att-tabs" role="tablist">
//                 <button role="tab" aria-selected={activeTab === 'registers'} className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('registers')}>
//                     <History size={14} /> Past Registers
//                 </button>
//                 <button role="tab" aria-selected={activeTab === 'calendar'} className={`att-tab${activeTab === 'calendar' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('calendar')}>
//                     <Calendar size={14} /> Calendar View
//                 </button>
//                 <button role="tab" aria-selected={activeTab === 'leaves'} className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('leaves')}>
//                     <FileText size={14} /> Leave Requests
//                     {pendingLeaveCount > 0 && <span className="att-pending-badge">{pendingLeaveCount} New</span>}
//                 </button>
//             </div>

//             {error && (
//                 <div className="att-error">
//                     <div className="att-error__title"><AlertTriangle size={15} /> Database Sync Error</div>
//                     <p className="att-error__body">{error}</p>
//                 </div>
//             )}

//             {activeTab !== 'leaves' && (
//                 <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
//                         {activeTab === 'registers' && (
//                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: 0, height: 35 }}>
//                                 <Calendar size={18} color="var(--mlab-grey)" />
//                                 <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter Date:</span>
//                                 <input type="date" value={registerSearch} onChange={e => setRegisterSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-blue)', fontWeight: 600, flex: 1, cursor: 'pointer' }} />
//                                 {registerSearch && <button onClick={() => setRegisterSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}><XCircle size={16} color="#ef4444" /></button>}
//                             </div>
//                         )}
//                     </div>

//                     <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', borderRadius: 0 }}>
//                         <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--mlab-border)', background: 'white', fontFamily: 'var(--font-body)', color: 'var(--mlab-blue)', fontWeight: 600, maxWidth: '220px' }}>
//                             <option value="">All Cohorts (Global)</option>
//                             {availableCohorts.map(c => <option key={c.id} value={c.id}>{c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}</option>)}
//                         </select>

//                         {selectedCohortId && (
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px 8px', borderRadius: 0, border: '1px solid #cbd5e1' }}>
//                                 <History size={16} color="var(--mlab-grey)" />
//                                 <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Machine:</span>
//                                 <input type="date" max={moment().subtract(1, 'days').format('YYYY-MM-DD')} value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, cursor: 'pointer' }} />
//                                 <button className="mlab-btn mlab-btn--sm" disabled={!reconcileDate} onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)} style={{ background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1', color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem' }}>Reconcile</button>
//                             </div>
//                         )}

//                         <button className="mlab-btn mlab-btn--outline" onClick={() => { const encodedAuth = btoa(JSON.stringify({ fid: facilitatorId || user?.uid || 'admin', cid: selectedCohortId })); window.open(`${window.location.origin}/kiosk?auth=${encodedAuth}`, '_blank'); }} style={{ whiteSpace: 'nowrap', borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)', color: isFinalizedToday ? '#94a3b8' : 'inherit', cursor: isFinalizedToday ? 'not-allowed' : 'pointer' }} disabled={!selectedCohortId || isFinalizedToday} title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}><Calendar size={16} /> Launch TV Kiosk</button>
//                         <button className={`mlab-btn mlab-btn--outline ${!isFinalizedToday && selectedCohortId ? 'mlab-btn--primary' : 'mlab-btn--outline-blue'}`} onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)} style={{ whiteSpace: 'nowrap', opacity: selectedCohortId ? 1 : 0.5 }} disabled={!selectedCohortId} title={!selectedCohortId ? "Select a specific cohort to view" : ""}><Clock size={16} /> {isFinalizedToday ? 'Live Dashboard' : 'View Live Board & Finalize'}</button>
//                     </div>
//                 </div>
//             )}

//             {activeTab === 'registers' && !selectedCohortId && globalStats && (
//                 <div className="mc-cards-wrapper animate-fade-in">
//                     <AttendanceRingCard
//                         title="Global Attendance"
//                         typeLabel="Overall Health"
//                         mainValue={`${globalStats.globalAttendanceRate}%`}
//                         totalValue="All Cohorts"
//                         pct={globalStats.globalAttendanceRate}
//                         theme="w"
//                         icon={<BarChart2 size={18} />}
//                         bar1Label="Present"
//                         bar1Val={`${globalStats.globalAttendanceRate}%`}
//                         bar1Pct={globalStats.globalAttendanceRate}
//                         bar2Label="Absent"
//                         bar2Val={`${100 - globalStats.globalAttendanceRate}%`}
//                         bar2Pct={100 - globalStats.globalAttendanceRate}
//                         statusText="System Wide"
//                     />
//                     <AttendanceRingCard
//                         title="Total Registers"
//                         typeLabel="System Activity"
//                         mainValue={globalStats.totalRegisters}
//                         totalValue="Finalized"
//                         pct={100}
//                         theme="p"
//                         icon={<Layers size={18} />}
//                         bar1Label="Logged"
//                         bar1Val={`${globalStats.totalRegisters}`}
//                         bar1Pct={100}
//                         bar2Label="Pending"
//                         bar2Val="0"
//                         bar2Pct={0}
//                         statusText="Up to date"
//                     />
//                     <AttendanceRingCard
//                         title="Action Items"
//                         typeLabel="Pending Tasks"
//                         mainValue={globalStats.pendingLeaves + globalStats.activeKiosks}
//                         totalValue="Tasks"
//                         pct={globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? 100 : 0}
//                         theme={globalStats.pendingLeaves > 0 ? "r" : (globalStats.activeKiosks > 0 ? "k" : "p")}
//                         icon={<MonitorPlay size={18} />}
//                         bar1Label="Live Classes"
//                         bar1Val={`${globalStats.activeKiosks}`}
//                         bar1Pct={globalStats.activeKiosks > 0 ? 50 : 0}
//                         bar2Label="Pending Leaves"
//                         bar2Val={`${globalStats.pendingLeaves}`}
//                         bar2Pct={globalStats.pendingLeaves > 0 ? 50 : 0}
//                         statusText={globalStats.pendingLeaves > 0 ? "Needs Review" : (globalStats.activeKiosks > 0 ? "Live Now" : "All Clear")}
//                     />
//                 </div>
//             )}

//             {activeTab === 'registers' && selectedCohortId && cohortStats && (
//                 <div className="mc-cards-wrapper animate-fade-in">
//                     <AttendanceRingCard
//                         title="Term Progress"
//                         typeLabel="Timeline"
//                         mainValue={cohortStats.daysCompleted}
//                         totalValue={`${cohortStats.netExpectedTermDays} Days`}
//                         pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
//                         theme="p"
//                         icon={<Target size={18} />}
//                         bar1Label="Completed"
//                         bar1Val={`${cohortStats.daysCompleted} days`}
//                         bar1Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
//                         bar2Label="Remaining"
//                         bar2Val={`${Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted)} days`}
//                         bar2Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted) / cohortStats.netExpectedTermDays) * 100) : 0}
//                         statusText="Active Term"
//                     />
//                     <AttendanceRingCard
//                         title="Average Attendance"
//                         typeLabel="Cohort Health"
//                         mainValue={`${cohortStats.avgAttendanceRate}%`}
//                         totalValue="Target: 80%"
//                         pct={cohortStats.avgAttendanceRate}
//                         theme={cohortStats.avgAttendanceRate >= 80 ? "w" : (cohortStats.avgAttendanceRate >= 50 ? "k" : "r")}
//                         icon={<BarChart2 size={18} />}
//                         bar1Label="Present"
//                         bar1Val="Avg"
//                         bar1Pct={cohortStats.avgAttendanceRate}
//                         bar2Label="Absent"
//                         bar2Val="Avg"
//                         bar2Pct={100 - cohortStats.avgAttendanceRate}
//                         statusText={cohortStats.avgAttendanceRate >= 80 ? "On Track" : "Needs Attention"}
//                     />
//                     <AttendanceRingCard
//                         title="Excluded Days"
//                         typeLabel="Off-Campus"
//                         mainValue={cohortStats.holidaysCount + cohortStats.recessCount}
//                         totalValue="Total Off"
//                         pct={cohortStats.holidaysCount + cohortStats.recessCount > 0 ? 100 : 0}
//                         theme="k"
//                         icon={<Coffee size={18} />}
//                         bar1Label="Holidays"
//                         bar1Val={`${cohortStats.holidaysCount} days`}
//                         bar1Pct={cohortStats.holidaysCount > 0 ? 50 : 0}
//                         bar2Label="Recess"
//                         bar2Val={`${cohortStats.recessCount} days`}
//                         bar2Pct={cohortStats.recessCount > 0 ? 50 : 0}
//                         statusText="Term Breaks"
//                     />
//                 </div>
//             )}

//             {/* TAB 1: REGISTERS TABLE */}
//             {activeTab === 'registers' && (
//                 <div className="mlab-table-wrap">
//                     <table className="mlab-table">
//                         <thead>
//                             <tr>
//                                 <th>Date Recorded</th>
//                                 {isAdmin && <th>Cohort</th>}
//                                 <th>Attendance</th>
//                                 <th>Proofs</th>
//                                 <th className="att-th--right">Action</th>
//                             </tr>
//                         </thead>
//                         <tbody>
//                             {filteredHistory.length > 0 ? filteredHistory.map(record => {
//                                 const proofCount = Object.keys(record.proofs || {}).length;
//                                 const presentCount = record.presentLearners?.length || 0;
//                                 const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

//                                 return (
//                                     <tr key={record.id}>
//                                         <td>
//                                             <div className="att-date-cell">
//                                                 <Calendar size={14} className="att-date-cell__icon" />
//                                                 <span className="att-date-cell__label">{moment(record.date).format('DD MMM YYYY')}</span>
//                                             </div>
//                                         </td>
//                                         {isAdmin && <td><span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>{cohortName}</span></td>}
//                                         <td><span className="att-badge att-badge--present"><Users size={11} /> {presentCount} Present</span></td>
//                                         <td>{proofCount > 0 ? <span className="att-badge att-badge--proof"><FileText size={11} /> {proofCount} Attached</span> : <span className="att-no-data">None</span>}</td>
//                                         <td className="att-td--right">
//                                             <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn" onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}>
//                                                 Open Register <ArrowRight size={13} />
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             }) : (
//                                 <tr>
//                                     <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
//                                         {history.length === 0 ? (
//                                             <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><History size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No Records Yet</p><p className="mlab-empty__desc">Saved attendance registers will appear here.</p></div>
//                                         ) : (
//                                             <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => setRegisterSearch('')} style={{ marginTop: '1rem' }}>Clear Search</button></div>
//                                         )}
//                                     </td>
//                                 </tr>
//                             )}
//                         </tbody>
//                     </table>
//                 </div>
//             )}

//             {/* TAB 2: CALENDAR VIEW */}
//             {activeTab === 'calendar' && (
//                 <div className="cdp-panel animate-fade-in" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
//                         <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <Calendar size={22} color="var(--mlab-blue)" />
//                             Cohort Attendance Calendar
//                         </h3>

//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                             {selectedCohortId && (
//                                 <button
//                                     className="mlab-btn mlab-btn--sm"
//                                     onClick={() => setIsStipendModalOpen(true)}
//                                     style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontWeight: 700 }}
//                                 >
//                                     <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
//                                 </button>
//                             )}

//                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
//                                 <button onClick={handlePrevMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={16} /></button>
//                                 <span style={{ fontWeight: '800', width: '130px', textAlign: 'center', color: 'var(--mlab-midnight)', fontSize: '0.95rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
//                                 <button onClick={handleNextMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={16} /></button>
//                             </div>
//                         </div>
//                     </div>

//                     {!selectedCohortId && (
//                         <div style={{ marginBottom: '1.5rem', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#b45309', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
//                             <AlertTriangle size={18} /> Please select a specific cohort from the dropdown above to view accurate daily attendance metrics.
//                         </div>
//                     )}

//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
//                         {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
//                             <div key={d} style={{ textAlign: 'center', fontWeight: '800', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
//                         ))}
//                     </div>

//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
//                         {calendarGrid.map((day) => {
//                             const dateStr = day.format('YYYY-MM-DD');
//                             const isCurrentMonth = day.month() === calendarMonth.month();
//                             const isToday = dateStr === moment().format('YYYY-MM-DD');
//                             const data = calendarDataMap.get(dateStr);

//                             return (
//                                 <div
//                                     key={dateStr}
//                                     onClick={() => {
//                                         if (data?.hasRegister && selectedCohortId) {
//                                             navigate(`/facilitator/attendance/${selectedCohortId}?date=${dateStr}`);
//                                         } else if (data?.leaves > 0) {
//                                             setLeaveSearch('');
//                                             setActiveTab('leaves');
//                                         } else {
//                                             setRegisterSearch(dateStr);
//                                             setActiveTab('registers');
//                                         }
//                                     }}
//                                     style={{
//                                         border: isToday ? '2px solid var(--mlab-blue)' : '1px solid #e2e8f0',
//                                         borderRadius: '10px',
//                                         minHeight: '110px',
//                                         padding: '10px',
//                                         backgroundColor: isCurrentMonth ? 'white' : '#f8fafc',
//                                         opacity: isCurrentMonth ? 1 : 0.4,
//                                         cursor: 'pointer',
//                                         transition: 'all 0.2s',
//                                         boxShadow: isToday ? '0 4px 12px rgba(7, 63, 78, 0.15)' : 'none'
//                                     }}
//                                     onMouseOver={e => e.currentTarget.style.borderColor = 'var(--mlab-green)'}
//                                     onMouseOut={e => e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : '#e2e8f0'}
//                                 >
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                         <span style={{
//                                             fontWeight: isToday ? '800' : '600',
//                                             color: isToday ? 'white' : 'var(--mlab-midnight)',
//                                             background: isToday ? 'var(--mlab-blue)' : 'transparent',
//                                             width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.85rem'
//                                         }}>{day.format('D')}</span>
//                                     </div>

//                                     {data && (
//                                         <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                             {data.isHoliday && <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0284c7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Public Holiday</span>}
//                                             {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.label || 'Recess'}</span>}

//                                             {data.hasRegister && (
//                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
//                                                     <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.present} Present</span>
//                                                     {data.absent > 0 && <span style={{ fontSize: '0.7rem', color: '#991b1b', background: '#fee2e2', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.absent} Absent</span>}
//                                                 </div>
//                                             )}

//                                             {data.leaves > 0 && (
//                                                 <span style={{ marginTop: '4px', fontSize: '0.7rem', background: data.pendingLeaves > 0 ? '#fef3c7' : '#f1f5f9', color: data.pendingLeaves > 0 ? '#b45309' : '#475569', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
//                                                     <FileText size={12} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
//                                                 </span>
//                                             )}
//                                         </div>
//                                     )}
//                                 </div>
//                             );
//                         })}
//                     </div>
//                 </div>
//             )}

//             {/* TAB 3: LEAVES */}
//             {activeTab === 'leaves' && (
//                 <>
//                     <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
//                         <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><FileText size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{displayedLeavesData.length}</span><span className="cdp-stat-card__label">Total Requests</span></div></div>
//                         <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: pendingLeaveCount > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{pendingLeaveCount}</span><span className="cdp-stat-card__label">Pending Review</span></div></div>
//                         <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><CheckCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{approvedLeaveCount}</span><span className="cdp-stat-card__label">Approved</span></div></div>
//                         <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><XCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: declinedLeaveCount > 0 ? '#ef4444' : 'inherit' }}>{declinedLeaveCount}</span><span className="cdp-stat-card__label">Declined</span></div></div>
//                     </div>

//                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
//                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                             <div className="mlab-search" style={{ minWidth: '220px', borderRadius: 0 }}><Search size={18} color="var(--mlab-grey)" /><input type="text" placeholder="Search by learner name..." value={leaveSearch} onChange={e => setLeaveSearch(e.target.value)} /></div>
//                             <div className="mlab-select-wrap" style={{ borderRadius: 0 }}><Filter size={16} color="var(--mlab-grey)" /><select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Declined">Declined</option></select></div>
//                             <div className="mlab-select-wrap" style={{ borderRadius: 0 }}><Filter size={16} color="var(--mlab-grey)" /><select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}><option value="all">All Reasons</option><option value="Sick Leave">Sick Leave</option><option value="Personal Emergency">Personal Emergency</option><option value="Interview">Interview</option><option value="Other">Other</option></select></div>
//                         </div>
//                     </div>

//                     <div className="mlab-table-wrap">
//                         {isLeavesLoading ? (
//                             <div className="att-loader-wrap att-loader-wrap--inline"><Loader message="Fetching requests…" /></div>
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
//                                                 <td><span className="mlab-cell-name">{req.learnerName || req.learnerId}</span></td>
//                                                 <td>
//                                                     <div className="att-dates-cell">
//                                                         <div className="att-dates-cell__start"><Calendar size={13} className="att-dates-cell__icon" /><span className="att-dates-cell__label">{fmtStart}</span></div>
//                                                         {!isSameDay && <div className="att-dates-cell__end"><ArrowRightCircle size={12} className="att-dates-cell__arrow" /><span className="att-dates-cell__label--end">{fmtEnd}</span></div>}
//                                                     </div>
//                                                 </td>
//                                                 <td><div className="att-reason-cell"><span className="att-reason-cell__type">{req.type}</span><span className="att-reason-cell__quote">"{req.reason}"</span></div></td>
//                                                 <td>
//                                                     {req.attachmentUrl ? (
//                                                         <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" className="att-attach-link" title={req.attachmentName || 'Download Document'}>
//                                                             <DownloadCloud size={14} /><span className="att-attach-link__text">{req.attachmentName ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName) : 'View File'}</span>
//                                                         </a>
//                                                     ) : <span className="att-no-data">No Attachment</span>}
//                                                 </td>
//                                                 <td>
//                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
//                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
//                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
//                                                 </td>
//                                                 <td className="att-td--right">
//                                                     {req.status === 'Pending' ? (
//                                                         <div className="att-action-btns">
//                                                             <button className="att-btn att-btn--approve" onClick={() => handleLeaveAction(req.id, 'Approved')}><CheckCircle size={12} /> Approve</button>
//                                                             <button className="att-btn att-btn--decline" onClick={() => handleLeaveAction(req.id, 'Declined')}><XCircle size={12} /> Decline</button>
//                                                         </div>
//                                                     ) : <span className="att-reviewed-label">Reviewed</span>}
//                                                 </td>
//                                             </tr>
//                                         );
//                                     }) : (
//                                         <tr>
//                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
//                                                 {displayedLeavesData.length === 0 ? (
//                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">All Caught Up!</p><p className="mlab-empty__desc">No leave requests are pending review.</p></div>
//                                                 ) : (
//                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => { setLeaveSearch(''); setLeaveStatusFilter('all'); setLeaveTypeFilter('all'); }} style={{ marginTop: '1rem' }}>Clear Filters</button></div>
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

// // import React, { useState, useEffect, useMemo, useRef } from 'react';
// // import { createPortal } from 'react-dom';
// // import {
// //     collection, query, where, getDocs, orderBy
// // } from 'firebase/firestore';
// // import {
// //     FileText, Calendar, ArrowRight, AlertTriangle, History,
// //     Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
// //     DownloadCloud, Filter, ScanLine, BarChart2, Coffee, Target, MonitorPlay, Layers, ChevronLeft, ChevronRight,
// //     DollarSign, Calculator, Loader2, X
// // } from 'lucide-react';
// // import { useNavigate, useSearchParams } from 'react-router-dom';
// // import * as XLSX from 'xlsx';
// // import { db } from '../../../lib/firebase';
// // import Loader from '../../../components/common/Loader/Loader';
// // import moment from 'moment';
// // import '../../../components/views/LearnersView/LearnersView.css';
// // import './AttendanceHistoryList.css';
// // import { useStore } from '../../../store/useStore';
// // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import { AttendanceRingCard } from '../AttendancePage';


// // // ─── STIPEND EXPORT MODAL ───────────────────────────────────────────────────

// // export const StipendExportModal: React.FC<{
// //     isOpen: boolean;
// //     onClose: () => void;
// //     cohortId: string;
// //     cohortName: string;
// //     learners: any[];
// //     attendanceMode: 'qcto' | 'bootcamp';
// //     initialMonth: string;
// // }> = ({ isOpen, onClose, cohortId, cohortName, learners, attendanceMode, initialMonth }) => {
// //     const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);
// //     const [stipendAmount, setStipendAmount] = useState<number>(3500);
// //     const [isGenerating, setIsGenerating] = useState(false);
// //     const toast = useToast();

// //     // Sync state when initial month changes from calendar view
// //     useEffect(() => {
// //         if (isOpen) setSelectedMonth(initialMonth);
// //     }, [initialMonth, isOpen]);

// //     if (!isOpen) return null;

// //     const handleExport = async () => {
// //         setIsGenerating(true);

// //         try {
// //             let totalLoggedDays = 0;
// //             const learnerStats: Record<string, { present: number, partial: number, approvedLeave: number }> = {};

// //             // Initialize stats for active roster
// //             learners.forEach(l => {
// //                 learnerStats[l.idNumber || l.id] = { present: 0, partial: 0, approvedLeave: 0 };
// //             });

// //             // 1. 🚀 FETCH APPROVED LEAVES
// //             const leavesSnap = await getDocs(query(collection(db, 'leave_requests'), where('status', '==', 'Approved')));
// //             const paidLeaveDates = new Map<string, Set<string>>();

// //             leavesSnap.docs.forEach(doc => {
// //                 const lv = doc.data();
// //                 const id = lv.learnerId || lv.idNumber;
// //                 if (!id) return;

// //                 if (!paidLeaveDates.has(id)) paidLeaveDates.set(id, new Set());
// //                 const dateSet = paidLeaveDates.get(id)!;

// //                 const start = lv.startDate || lv.dateAffected;
// //                 const end = lv.endDate || lv.dateAffected;

// //                 if (start && end) {
// //                     let current = new Date(start);
// //                     const endDate = new Date(end);
// //                     while (current <= endDate) {
// //                         dateSet.add(current.toISOString().split('T')[0]);
// //                         current.setDate(current.getDate() + 1);
// //                     }
// //                 }
// //             });

// //             // 2. Fetch data based on Bootcamp vs QCTO mode
// //             if (attendanceMode === 'bootcamp') {
// //                 const logsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('cohortId', '==', cohortId)));
// //                 const monthLogs = logsSnap.docs.filter(d => (d.data().sessionDate || '').startsWith(selectedMonth));
// //                 totalLoggedDays = monthLogs.length;

// //                 const recsSnap = await getDocs(query(collection(db, 'attendance_records'), where('cohortId', '==', cohortId)));
// //                 recsSnap.docs.forEach(d => {
// //                     const data = d.data();
// //                     const dateStr = (data.sessionDate || '').split('T')[0];

// //                     if (dateStr.startsWith(selectedMonth)) {
// //                         const targetId = data.learnerId;
// //                         const match = learners.find(l => l.id === targetId || l.idNumber === targetId);
// //                         if (match) {
// //                             const key = match.idNumber || match.id;
// //                             if (data.status === 'Present') {
// //                                 learnerStats[key].present++;
// //                             } else if (data.status === 'Partial') {
// //                                 learnerStats[key].partial++;
// //                             } else {
// //                                 if (paidLeaveDates.get(targetId)?.has(dateStr) || paidLeaveDates.get(match.idNumber)?.has(dateStr)) {
// //                                     learnerStats[key].approvedLeave++;
// //                                 }
// //                             }
// //                         }
// //                     }
// //                 });
// //             } else {
// //                 const attSnap = await getDocs(query(collection(db, 'attendance'), where('cohortId', '==', cohortId)));
// //                 const monthAtts = attSnap.docs.filter(d => (d.data().date || '').startsWith(selectedMonth));
// //                 totalLoggedDays = monthAtts.length;

// //                 monthAtts.forEach(d => {
// //                     const data = d.data();
// //                     const dateStr = (data.date || '').split('T')[0];
// //                     const presents = data.presentLearners || [];

// //                     learners.forEach(l => {
// //                         const idNum = l.idNumber;
// //                         if (presents.includes(idNum)) {
// //                             learnerStats[idNum].present++;
// //                         } else {
// //                             if (paidLeaveDates.get(idNum)?.has(dateStr) || paidLeaveDates.get(l.id)?.has(dateStr)) {
// //                                 learnerStats[idNum].approvedLeave++;
// //                             }
// //                         }
// //                     });
// //                 });
// //             }

// //             if (totalLoggedDays === 0) {
// //                 toast.error(`No attendance registers found for ${selectedMonth}.`);
// //                 setIsGenerating(false);
// //                 return;
// //             }

// //             // 3. Setup Excel Headers
// //             const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });
// //             const headers = [
// //                 "Learner Name",
// //                 "ID Number",
// //                 "Total Logged Days",
// //                 "Days Present (1.0)",
// //                 "Days Partial (0.5)",
// //                 "Approved Paid Leave (1.0)",
// //                 "Unpaid Days Missed",
// //                 "Base Stipend (ZAR)",
// //                 "Calculated Payout (ZAR)"
// //             ];

// //             const dataRows = [headers.map(createTextCell)];

// //             // 4. Process each learner's payout math
// //             learners.forEach(learner => {
// //                 const key = learner.idNumber || learner.id;
// //                 const stats = learnerStats[key];

// //                 const presentCount = stats.present;
// //                 const partialCount = stats.partial;
// //                 const approvedLeaveCount = stats.approvedLeave;

// //                 const equivalentDaysPaid = presentCount + approvedLeaveCount + (partialCount * 0.5);
// //                 const unpaidDaysMissed = totalLoggedDays - presentCount - partialCount - approvedLeaveCount;

// //                 const cappedPaidDays = Math.min(equivalentDaysPaid, totalLoggedDays);
// //                 const payout = totalLoggedDays > 0 ? (cappedPaidDays / totalLoggedDays) * stipendAmount : 0;

// //                 dataRows.push([
// //                     learner.fullName,
// //                     learner.idNumber,
// //                     totalLoggedDays,
// //                     presentCount,
// //                     partialCount,
// //                     approvedLeaveCount,
// //                     Math.max(0, unpaidDaysMissed),
// //                     `R ${stipendAmount.toFixed(2)}`,
// //                     `R ${payout.toFixed(2)}`
// //                 ].map(createTextCell));
// //             });

// //             // 5. Generate the Excel Workbook
// //             const wb = XLSX.utils.book_new();

// //             const summarySheet = XLSX.utils.aoa_to_sheet([
// //                 ["STIPEND RECONCILIATION REPORT"],
// //                 ["Cohort:", cohortName],
// //                 ["Month:", selectedMonth],
// //                 ["Base Stipend:", `R ${stipendAmount.toFixed(2)}`],
// //                 ["Total Logged Training Days:", totalLoggedDays],
// //                 ["Note:", "Approved Paid Leave is calculated at 1.0 day rate. Partial attendance is calculated at 0.5 day rate."],
// //                 ["Export Date:", new Date().toLocaleDateString()]
// //             ].map(r => r.map(createTextCell)));

// //             const dataSheet = XLSX.utils.aoa_to_sheet(dataRows);

// //             XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');
// //             XLSX.utils.book_append_sheet(wb, dataSheet, 'Payroll Data');

// //             const fileName = `Stipends_${cohortName.replace(/[^a-zA-Z0-9]/g, '_')}_${selectedMonth}.xlsx`;
// //             XLSX.writeFile(wb, fileName);

// //             toast.success("Stipend export generated successfully!");
// //             onClose();

// //         } catch (error) {
// //             console.error("Export error:", error);
// //             toast.error("Failed to generate stipend export.");
// //         } finally {
// //             setIsGenerating(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 99999 }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
// //                 <div className="wm-modal__header" style={{ borderBottom: '3px solid var(--mlab-green)', paddingBottom: '1rem' }}>
// //                     <div className="wm-modal__header-icon" style={{ background: '#f0fdf4', color: '#166534' }}>
// //                         <DollarSign size={20} />
// //                     </div>
// //                     <div>
// //                         <h2 className="wm-modal__title">Export Monthly Stipends</h2>
// //                         <p className="wm-modal__subtitle">Calculate pro-rata payouts based on timesheets.</p>
// //                     </div>
// //                     <button className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// //                 </div>

// //                 <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                     <div className="wm-form-group">
// //                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <Calendar size={14} /> Select Month
// //                         </label>
// //                         <input
// //                             type="month"
// //                             className="wm-form-input"
// //                             value={selectedMonth}
// //                             onChange={e => setSelectedMonth(e.target.value)}
// //                         />
// //                     </div>

// //                     <div className="wm-form-group">
// //                         <label className="wm-form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <Calculator size={14} /> Monthly Base Stipend (ZAR)
// //                         </label>
// //                         <div style={{ position: 'relative' }}>
// //                             <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', fontWeight: 'bold' }}>R</span>
// //                             <input
// //                                 type="number"
// //                                 className="wm-form-input"
// //                                 style={{ paddingLeft: '32px' }}
// //                                 value={stipendAmount}
// //                                 onChange={e => setStipendAmount(Number(e.target.value))}
// //                                 min="0"
// //                                 step="100"
// //                             />
// //                         </div>
// //                         <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', lineHeight: 1.5, border: '1px solid #cbd5e1' }}>
// //                             <strong>Calculation Logic:</strong>
// //                             <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
// //                                 <li><strong>Present:</strong> 1.0 day rate</li>
// //                                 <li><strong style={{ color: 'var(--mlab-green)' }}>Approved Leave:</strong> 1.0 day rate (Paid)</li>
// //                                 <li><strong>Partial:</strong> 0.5 day rate</li>
// //                                 <li><strong>Absent:</strong> Unpaid</li>
// //                             </ul>
// //                         </div>
// //                     </div>
// //                 </div>

// //                 <div className="wm-modal__footer">
// //                     <button className="wm-btn wm-btn--ghost" onClick={onClose} disabled={isGenerating}>Cancel</button>
// //                     <button className="mlab-btn" style={{ background: 'var(--mlab-green)', color: 'white', border: 'none' }} onClick={handleExport} disabled={isGenerating || stipendAmount <= 0 || !selectedMonth}>
// //                         {isGenerating ? <Loader2 size={16} className="spin" /> : <DownloadCloud size={16} />} Generate Excel
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };


// // // ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
// // let cachedHistory: any[] | null = null;

// // export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
// //     const navigate = useNavigate();
// //     const toast = useToast();

// //     // URL Parameter Syncing
// //     const [searchParams, setSearchParams] = useSearchParams();

// //     const updateParam = (key: string, value: string) => {
// //         const params = new URLSearchParams(searchParams);
// //         if (value && value !== 'all') {
// //             params.set(key, value);
// //         } else {
// //             params.delete(key);
// //         }
// //         setSearchParams(params, { replace: true });
// //     };

// //     const activeTab = (searchParams.get('view') as 'registers' | 'leaves' | 'calendar') || 'registers';

// //     const selectedCohortId = searchParams.get('cohort') || '';
// //     const registerSearch = searchParams.get('date') || '';
// //     const leaveSearch = searchParams.get('leaveSearch') || '';
// //     const leaveStatusFilter = searchParams.get('leaveStatus') || 'all';
// //     const leaveTypeFilter = searchParams.get('leaveType') || 'all';

// //     const setActiveTab = (val: 'registers' | 'leaves' | 'calendar') => updateParam('view', val);

// //     const setSelectedCohortId = (val: string) => updateParam('cohort', val);
// //     const setRegisterSearch = (val: string) => updateParam('date', val);
// //     const setLeaveSearch = (val: string) => updateParam('leaveSearch', val);
// //     const setLeaveStatusFilter = (val: string) => updateParam('leaveStatus', val);
// //     const setLeaveTypeFilter = (val: string) => updateParam('leaveType', val);

// //     const user = useStore(s => s.user);
// //     const isAdmin = user?.role === 'admin' || (user as any)?.isSuperAdmin;

// //     const allCohorts = useStore(s => s.cohorts) || [];
// //     const allLearners = useStore(s => s.learners) || [];
// //     const fetchCohorts = useStore(s => s.fetchCohorts);

// //     useEffect(() => {
// //         if (allCohorts.length === 0 && fetchCohorts) {
// //             fetchCohorts();
// //         }
// //     }, [allCohorts.length, fetchCohorts]);

// //     const availableCohorts = useMemo(() => {
// //         if (isAdmin) return allCohorts;
// //         const targetId = facilitatorId || user?.uid;
// //         return allCohorts.filter(c =>
// //             c.facilitatorId === targetId ||
// //             c.supportFacilitatorId === targetId
// //         );
// //     }, [allCohorts, isAdmin, facilitatorId, user?.uid]);

// //     // Derived active learners for the selected cohort
// //     const activeCohortLearners = useMemo(() => {
// //         return allLearners.filter(l =>
// //             l.cohortId === selectedCohortId &&
// //             l.status !== 'dropped'
// //         );
// //     }, [allLearners, selectedCohortId]);

// //     const [reconcileDate, setReconcileDate] = useState<string>('');
// //     const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
// //     const leaveRequests = useStore(s => s.leaveRequests) || [];
// //     const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
// //     const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

// //     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
// //     const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
// //     const [error, setError] = useState<string | null>(null);

// //     const [liveKioskCount, setLiveKioskCount] = useState(0);
// //     const [holidays, setHolidays] = useState<string[]>([]);

// //     const [adminLeaves, setAdminLeaves] = useState<any[]>([]);
// //     const [loadingAdminLeaves, setLoadingAdminLeaves] = useState(false);
// //     const hasFetchedLeaves = useRef(false);

// //     // ─── CALENDAR STATE ───
// //     const [calendarMonth, setCalendarMonth] = useState(moment().startOf('month'));

// //     // ─── STIPEND MODAL STATE ───
// //     const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);

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

// //     // ── Fetch registers & live kiosks ──────────────────────────────────────────
// //     useEffect(() => {
// //         const fetchData = async () => {
// //             if (!user) return;

// //             if (cachedHistory === null) setLoadingRegisters(true);
// //             setError(null);

// //             try {
// //                 let qHist;
// //                 if (isAdmin) {
// //                     qHist = query(collection(db, 'attendance'), orderBy('date', 'desc'));
// //                 } else {
// //                     const myCohortIds = availableCohorts.map(c => c.id);
// //                     if (myCohortIds.length > 0) {
// //                         const chunk = myCohortIds.slice(0, 10);
// //                         qHist = query(collection(db, 'attendance'), where('cohortId', 'in', chunk));
// //                     } else {
// //                         qHist = query(collection(db, 'attendance'), where('cohortId', '==', 'NONE'));
// //                     }
// //                 }

// //                 const snap = await getDocs(qHist);
// //                 let fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));

// //                 if (!isAdmin) {
// //                     fresh.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
// //                 }

// //                 cachedHistory = fresh;
// //                 setHistory(fresh);

// //                 const todayStr = moment().format('YYYY-MM-DD');
// //                 let qKiosk;
// //                 if (isAdmin) {
// //                     qKiosk = query(collection(db, 'kiosk_sessions'), where('date', '==', todayStr), where('status', '==', 'active'));
// //                 } else {
// //                     const myCohortIds = availableCohorts.map(c => c.id);
// //                     if (myCohortIds.length > 0) {
// //                         const chunk = myCohortIds.slice(0, 10);
// //                         qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', 'in', chunk), where('date', '==', todayStr), where('status', '==', 'active'));
// //                     } else {
// //                         qKiosk = query(collection(db, 'kiosk_sessions'), where('cohortId', '==', 'NONE'));
// //                     }
// //                 }
// //                 const kioskSnap = await getDocs(qKiosk);
// //                 setLiveKioskCount(kioskSnap.size);

// //             } catch (err: any) {
// //                 console.error('Firestore Error:', err);
// //                 setError(err.message);
// //             } finally {
// //                 setLoadingRegisters(false);
// //             }
// //         };
// //         fetchData();
// //     }, [facilitatorId, isAdmin, user, availableCohorts]);

// //     // ── Fetch leaves on tab change ────────────────────────────────────────────
// //     useEffect(() => {
// //         if (activeTab === 'leaves' || activeTab === 'calendar') {
// //             if (isAdmin) {
// //                 if (!hasFetchedLeaves.current) {
// //                     setLoadingAdminLeaves(true);
// //                 }
// //                 getDocs(collection(db, 'leave_requests')).then(snap => {
// //                     setAdminLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })));
// //                     hasFetchedLeaves.current = true;
// //                 }).finally(() => setLoadingAdminLeaves(false));
// //             } else {
// //                 const targetId = facilitatorId || user?.uid;
// //                 if (targetId && leaveRequests.length === 0) {
// //                     fetchFacilitatorLeaveRequests(targetId);
// //                 }
// //             }
// //         }
// //     }, [activeTab]);

// //     const displayedLeavesData = isAdmin ? adminLeaves : leaveRequests;
// //     const isLeavesLoading = isAdmin ? loadingAdminLeaves : isFetchingLeaves;

// //     const { pendingLeaveCount, approvedLeaveCount, declinedLeaveCount } = useMemo(() => {
// //         let pending = 0, approved = 0, declined = 0;
// //         displayedLeavesData.forEach(r => {
// //             if (r.status === 'Pending') pending++;
// //             else if (r.status === 'Approved') approved++;
// //             else if (r.status === 'Declined') declined++;
// //         });
// //         return { pendingLeaveCount: pending, approvedLeaveCount: approved, declinedLeaveCount: declined };
// //     }, [displayedLeavesData]);

// //     const filteredHistory = useMemo(() => {
// //         let data = history;
// //         if (selectedCohortId) data = data.filter(r => r.cohortId === selectedCohortId);
// //         if (registerSearch) data = data.filter(r => r.date === registerSearch);
// //         return data;
// //     }, [history, registerSearch, selectedCohortId]);

// //     const globalStats = useMemo(() => {
// //         if (history.length === 0) return null;
// //         let totalExpectedScans = 0, totalPresentScans = 0;

// //         history.forEach(reg => {
// //             const present = reg.presentLearners?.length || 0;
// //             const absent = reg.absentLearners?.length || 0;
// //             const dailyTotal = present + absent;
// //             if (dailyTotal > 0) {
// //                 totalExpectedScans += dailyTotal;
// //                 totalPresentScans += present;
// //             }
// //         });

// //         return {
// //             totalRegisters: history.length,
// //             globalAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0,
// //             pendingLeaves: pendingLeaveCount,
// //             activeKiosks: liveKioskCount
// //         };
// //     }, [history, pendingLeaveCount, liveKioskCount]);

// //     const cohortStats = useMemo(() => {
// //         if (!selectedCohortId) return null;
// //         const cohort = availableCohorts.find(c => c.id === selectedCohortId);
// //         if (!cohort || !cohort.startDate || !cohort.endDate) return null;

// //         const cohortRegisters = history.filter(r => r.cohortId === selectedCohortId);
// //         let totalWeekdays = 0, holidaysCount = 0, recessCount = 0;

// //         const start = moment(cohort.startDate);
// //         const end = moment(cohort.endDate);
// //         const current = start.clone();

// //         while (current.isSameOrBefore(end, 'day')) {
// //             const dayOfWeek = current.day();
// //             if (dayOfWeek !== 0 && dayOfWeek !== 6) {
// //                 totalWeekdays++;
// //                 const dateStr = current.format('YYYY-MM-DD');
// //                 if (holidays.includes(dateStr)) holidaysCount++;
// //                 else if ((cohort.recessPeriods || []).some((p: any) => current.isBetween(p.start, p.end, 'day', '[]'))) recessCount++;
// //             }
// //             current.add(1, 'day');
// //         }

// //         let totalExpectedScans = 0, totalPresentScans = 0;
// //         cohortRegisters.forEach(reg => {
// //             const present = reg.presentLearners?.length || 0;
// //             const absent = reg.absentLearners?.length || 0;
// //             const dailyTotal = present + absent || (cohort.learnerIds?.length || 0);

// //             if (dailyTotal > 0) {
// //                 totalExpectedScans += dailyTotal;
// //                 totalPresentScans += present;
// //             }
// //         });

// //         return {
// //             netExpectedTermDays: totalWeekdays - holidaysCount - recessCount,
// //             daysCompleted: cohortRegisters.length,
// //             holidaysCount,
// //             recessCount,
// //             avgAttendanceRate: totalExpectedScans > 0 ? Math.round((totalPresentScans / totalExpectedScans) * 100) : 0
// //         };
// //     }, [selectedCohortId, availableCohorts, history, holidays]);

// //     const filteredLeaves = useMemo(() => {
// //         return displayedLeavesData.filter(req => {
// //             const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
// //             const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
// //             const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;
// //             return matchesSearch && matchesStatus && matchesType;
// //         });
// //     }, [displayedLeavesData, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

// //     const todayString = moment().format('YYYY-MM-DD');
// //     const isFinalizedToday = selectedCohortId ? history.some(r => r.cohortId === selectedCohortId && r.date === todayString) : false;

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
// //                     await updateLeaveStatus(id, status, { reviewedBy: user?.uid || 'Unknown', reviewedByName: user?.fullName || 'Unknown Admin' });
// //                     if (isAdmin) {
// //                         setAdminLeaves(prev => prev.map(req => req.id === id ? { ...req, status, reviewedBy: user?.uid, reviewedByName: user?.fullName } : req));
// //                     }
// //                     toast.success(`Leave request marked as ${status}.`);
// //                 } catch (err) {
// //                     toast.error('Failed to update the leave status.');
// //                 }
// //             }
// //         });
// //     };

// //     // ─── CALENDAR LOGIC ────────────────────────────────────────────────────────
// //     const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
// //     const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

// //     const calendarGrid = useMemo(() => {
// //         const startDay = calendarMonth.day();
// //         const diff = startDay === 0 ? 6 : startDay - 1;
// //         const startGrid = calendarMonth.clone().subtract(diff, 'days');

// //         const endOfMonth = calendarMonth.clone().endOf('month');
// //         const endDay = endOfMonth.day();
// //         const endDiff = endDay === 0 ? 0 : 7 - endDay;
// //         const endGrid = endOfMonth.clone().add(endDiff, 'days');

// //         const grid = [];
// //         let curr = startGrid.clone();
// //         while (curr.isSameOrBefore(endGrid)) {
// //             grid.push(curr.clone());
// //             curr.add(1, 'day');
// //         }
// //         return grid;
// //     }, [calendarMonth]);

// //     const calendarDataMap = useMemo(() => {
// //         const map = new Map();

// //         // 1. Map Holidays
// //         holidays.forEach(h => map.set(h, { isHoliday: true }));

// //         // 2. Map Recess
// //         if (selectedCohortId) {
// //             const cohort = availableCohorts.find(c => c.id === selectedCohortId);
// //             if (cohort?.recessPeriods) {
// //                 cohort.recessPeriods.forEach((p: any) => {
// //                     let curr = moment(p.start);
// //                     const end = moment(p.end);
// //                     while (curr.isSameOrBefore(end)) {
// //                         const dStr = curr.format('YYYY-MM-DD');
// //                         map.set(dStr, { ...(map.get(dStr) || {}), isRecess: true, label: p.reason || 'Recess' });
// //                         curr.add(1, 'day');
// //                     }
// //                 });
// //             }
// //         }

// //         // 3. Map Registers
// //         history.forEach(h => {
// //             if (!selectedCohortId || h.cohortId === selectedCohortId) {
// //                 const dStr = moment(h.date).format('YYYY-MM-DD');
// //                 const existing = map.get(dStr) || {};
// //                 existing.hasRegister = true;
// //                 existing.present = (existing.present || 0) + (h.presentLearners?.length || 0);
// //                 existing.absent = (existing.absent || 0) + (h.absentLearners?.length || 0);
// //                 map.set(dStr, existing);
// //             }
// //         });

// //         // 4. Map Leaves
// //         displayedLeavesData.forEach(l => {
// //             if (!selectedCohortId || l.cohortId === selectedCohortId) {
// //                 let curr = moment(l.startDate || l.dateAffected);
// //                 const end = moment(l.endDate || l.dateAffected);
// //                 while (curr.isSameOrBefore(end)) {
// //                     const dStr = curr.format('YYYY-MM-DD');
// //                     const existing = map.get(dStr) || {};
// //                     existing.leaves = (existing.leaves || 0) + 1;
// //                     if (l.status === 'Pending') existing.pendingLeaves = (existing.pendingLeaves || 0) + 1;
// //                     map.set(dStr, existing);
// //                     curr.add(1, 'day');
// //                 }
// //             }
// //         });

// //         return map;
// //     }, [holidays, history, displayedLeavesData, selectedCohortId, availableCohorts]);

// //     if (loadingRegisters) {
// //         return <div className="att-loader-wrap"><Loader message="Loading Dashboard…" /></div>;
// //     }

// //     return (
// //         <div className="att-root animate-fade-in">
// //             {/* ─── NEW STYLES & SVG GRADIENTS FOR RING CARDS ─── */}
// //             <style>{`
// //                 .mc-cards-wrapper { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 2rem; }
// //                 .mc { background: white; border: 1px solid var(--mlab-border);padding: 22px 20px 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 18px; transition: transform .22s ease, box-shadow .22s ease; cursor: default; }
// //                 .mc:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,.06); }
// //                 .mc-orb { position: absolute; top: -50px; right: -50px; width: 130px; height: 130px; border-radius: 50%; opacity: .15; filter: blur(28px); pointer-events: none; }
// //                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; }
// //                 .mc-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
// //                 .mc-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: .2em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
// //                 .mc-title { font-size: 14px; font-weight: 700; color: var(--mlab-midnight); letter-spacing: -0.2px; line-height: 1.2; }
// //                 .mc-pct { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; flex-shrink: 0; margin-top: 1px; color: var(--mlab-midnight); }
// //                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 6px 0; }
// //                 .mc-ring-svg { transform: rotate(-90deg); }
// //                 .mc-ring-track { fill: none; stroke: #f1f5f9; stroke-width: 8px; }
// //                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
// //                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
// //                 .mc-ring-num { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; color: var(--mlab-midnight); }
// //                 .mc-ring-denom { font-size: 10px; font-weight: 500; color: var(--mlab-grey); }
// //                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
// //                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
// //                 .mc-bar-lbl { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--mlab-grey); }
// //                 .mc-bar-val { font-size: 10px; font-weight: 700; color: var(--mlab-midnight); }
// //                 .mc-track { width: 100%; height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
// //                 .mc-fill { height: 100%; border-radius: 3px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
// //                 @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
// //                 .mc-fill-shimmer { background-size: 200% 100%; animation: shimmer 2.4s linear infinite .8s; }
// //                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--mlab-border); }
// //                 .mc-total { font-size: 11px; font-weight: 500; color: var(--mlab-grey); }
// //                 .mc-total strong { font-weight: 800; color: var(--mlab-midnight); }
// //                 .mc-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 10px; font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
// //                 @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.75); } }
// //                 .mc-dot { width: 5px; height: 5px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }

// //                 /* Light Mode Themes */
// //                 .mc-k .mc-orb { background: #f59e0b; } .mc-k .mc-icon { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-pct { color: #d97706; } .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background-image: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); } .mc-k .mc-fill-secondary { background: #fef3c7; } .mc-k .mc-status { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-dot { background: #d97706; }
// //                 .mc-p .mc-orb { background: #38bdf8; } .mc-p .mc-icon { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-pct { color: #0284c7; } .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background-image: linear-gradient(90deg,#7dd3fc,#0ea5e9,#7dd3fc); } .mc-p .mc-fill-secondary { background: #e0f2fe; } .mc-p .mc-status { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-dot { background: #0284c7; }
// //                 .mc-w .mc-orb { background: var(--mlab-green); } .mc-w .mc-icon { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-pct { color: #65a30d; } .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background-image: linear-gradient(90deg,#bef264,#84cc16,#bef264); } .mc-w .mc-fill-secondary { background: #ecfccb; } .mc-w .mc-status { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-dot { background: #65a30d; }
// //                 .mc-r .mc-orb { background: #ef4444; } .mc-r .mc-icon { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-pct { color: #b91c1c; } .mc-r .mc-ring-fill { stroke: url(#gR); } .mc-r .mc-fill-primary { background-image: linear-gradient(90deg,#fca5a5,#ef4444,#fca5a5); } .mc-r .mc-fill-secondary { background: #fee2e2; } .mc-r .mc-status { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-dot { background: #b91c1c; }
// //             `}</style>

// //             <svg width="0" height="0" style={{ position: 'absolute' }}>
// //                 <defs>
// //                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#d97706" /></linearGradient>
// //                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
// //                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></linearGradient>
// //                     <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fca5a5" /><stop offset="100%" stopColor="#b91c1c" /></linearGradient>
// //                 </defs>
// //             </svg>

// //             {modalConfig.isOpen && createPortal(
// //                 <div style={{ position: 'relative', zIndex: 999999 }}>
// //                     <StatusModal
// //                         type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} confirmText={modalConfig.confirmText}
// //                         onClose={() => { if (modalConfig.onConfirm) modalConfig.onConfirm(); else setModalConfig(p => ({ ...p, isOpen: false })); }}
// //                         onCancel={modalConfig.onCancel}
// //                     />
// //                 </div>,
// //                 document.body
// //             )}

// //             {/* 🚀 STIPEND EXPORT MODAL */}
// //             <StipendExportModal
// //                 isOpen={isStipendModalOpen}
// //                 onClose={() => setIsStipendModalOpen(false)}
// //                 cohortId={selectedCohortId || ''}
// //                 cohortName={availableCohorts.find(c => c.id === selectedCohortId)?.name || 'Cohort'}
// //                 learners={activeCohortLearners}
// //                 attendanceMode="qcto"
// //                 initialMonth={calendarMonth.format('YYYY-MM')}
// //             />

// //             {/* 🚀 EXTENDED TABS WITH CALENDAR VIEW */}
// //             <div className="att-tabs" role="tablist">
// //                 <button role="tab" aria-selected={activeTab === 'registers'} className={`att-tab${activeTab === 'registers' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('registers')}>
// //                     <History size={14} /> Past Registers
// //                 </button>
// //                 <button role="tab" aria-selected={activeTab === 'calendar'} className={`att-tab${activeTab === 'calendar' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('calendar')}>
// //                     <Calendar size={14} /> Calendar View
// //                 </button>
// //                 <button role="tab" aria-selected={activeTab === 'leaves'} className={`att-tab${activeTab === 'leaves' ? ' att-tab--active' : ''}`} onClick={() => setActiveTab('leaves')}>
// //                     <FileText size={14} /> Leave Requests
// //                     {pendingLeaveCount > 0 && <span className="att-pending-badge">{pendingLeaveCount} New</span>}
// //                 </button>
// //             </div>

// //             {error && (
// //                 <div className="att-error">
// //                     <div className="att-error__title"><AlertTriangle size={15} /> Database Sync Error</div>
// //                     <p className="att-error__body">{error}</p>
// //                 </div>
// //             )}

// //             {/* 🚀 SHARED TOOLBAR (Hidden in leaves tab) */}
// //             {activeTab !== 'leaves' && (
// //                 <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// //                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
// //                         {activeTab === 'registers' && (
// //                             <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px', display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', background: '#f8fafc', border: '1px solid var(--mlab-border)', borderRadius: 0, height: 35 }}>
// //                                 <Calendar size={18} color="var(--mlab-grey)" />
// //                                 <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600, whiteSpace: 'nowrap' }}>Filter Date:</span>
// //                                 <input type="date" value={registerSearch} onChange={e => setRegisterSearch(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-blue)', fontWeight: 600, flex: 1, cursor: 'pointer' }} />
// //                                 {registerSearch && <button onClick={() => setRegisterSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}><XCircle size={16} color="#ef4444" /></button>}
// //                             </div>
// //                         )}
// //                     </div>

// //                     <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center', borderRadius: 0 }}>
// //                         <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--mlab-border)', background: 'white', fontFamily: 'var(--font-body)', color: 'var(--mlab-blue)', fontWeight: 600, maxWidth: '220px' }}>
// //                             <option value="">All Cohorts (Global)</option>
// //                             {availableCohorts.map(c => <option key={c.id} value={c.id}>{c.name} {isAdmin && (c as any).campusName ? `(${(c as any).campusName})` : ''}</option>)}
// //                         </select>

// //                         {selectedCohortId && (
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f1f5f9', padding: '4px 8px', borderRadius: 0, border: '1px solid #cbd5e1' }}>
// //                                 <History size={16} color="var(--mlab-grey)" />
// //                                 <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Time Machine:</span>
// //                                 <input type="date" max={moment().subtract(1, 'days').format('YYYY-MM-DD')} value={reconcileDate} onChange={e => setReconcileDate(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, cursor: 'pointer' }} />
// //                                 <button className="mlab-btn mlab-btn--sm" disabled={!reconcileDate} onClick={() => navigate(`/facilitator/attendance/${selectedCohortId}?date=${reconcileDate}`)} style={{ background: reconcileDate ? 'var(--mlab-blue)' : '#cbd5e1', color: 'white', border: 'none', padding: '4px 12px', fontSize: '0.75rem' }}>Reconcile</button>
// //                             </div>
// //                         )}

// //                         <button className="mlab-btn mlab-btn--outline" onClick={() => { const encodedAuth = btoa(JSON.stringify({ fid: facilitatorId || user?.uid || 'admin', cid: selectedCohortId })); window.open(`${window.location.origin}/kiosk?auth=${encodedAuth}`, '_blank'); }} style={{ whiteSpace: 'nowrap', borderColor: isFinalizedToday ? '#cbd5e1' : 'var(--mlab-grey)', color: isFinalizedToday ? '#94a3b8' : 'inherit', cursor: isFinalizedToday ? 'not-allowed' : 'pointer' }} disabled={!selectedCohortId || isFinalizedToday} title={isFinalizedToday ? "Attendance already closed for today" : !selectedCohortId ? "Select a specific cohort to launch" : ""}><Calendar size={16} /> Launch TV Kiosk</button>
// //                         <button className={`mlab-btn mlab-btn--outline ${!isFinalizedToday && selectedCohortId ? 'mlab-btn--primary' : 'mlab-btn--outline-blue'}`} onClick={() => navigate(`/facilitator/attendance/live?cohort=${selectedCohortId}`)} style={{ whiteSpace: 'nowrap', opacity: selectedCohortId ? 1 : 0.5 }} disabled={!selectedCohortId} title={!selectedCohortId ? "Select a specific cohort to view" : ""}><Clock size={16} /> {isFinalizedToday ? 'Live Dashboard' : 'View Live Board & Finalize'}</button>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* ── GLOBAL ANALYTICS PANEL (Uses Ring Cards) ── */}
// //             {activeTab === 'registers' && !selectedCohortId && globalStats && (
// //                 <div className="mc-cards-wrapper animate-fade-in">
// //                     <AttendanceRingCard
// //                         title="Global Attendance"
// //                         typeLabel="Overall Health"
// //                         mainValue={`${globalStats.globalAttendanceRate}%`}
// //                         totalValue="All Cohorts"
// //                         pct={globalStats.globalAttendanceRate}
// //                         theme="w"
// //                         icon={<BarChart2 size={18} />}
// //                         bar1Label="Present"
// //                         bar1Val={`${globalStats.globalAttendanceRate}%`}
// //                         bar1Pct={globalStats.globalAttendanceRate}
// //                         bar2Label="Absent"
// //                         bar2Val={`${100 - globalStats.globalAttendanceRate}%`}
// //                         bar2Pct={100 - globalStats.globalAttendanceRate}
// //                         statusText="System Wide"
// //                     />
// //                     <AttendanceRingCard
// //                         title="Total Registers"
// //                         typeLabel="System Activity"
// //                         mainValue={globalStats.totalRegisters}
// //                         totalValue="Finalized"
// //                         pct={100}
// //                         theme="p"
// //                         icon={<Layers size={18} />}
// //                         bar1Label="Logged"
// //                         bar1Val={`${globalStats.totalRegisters}`}
// //                         bar1Pct={100}
// //                         bar2Label="Pending"
// //                         bar2Val="0"
// //                         bar2Pct={0}
// //                         statusText="Up to date"
// //                     />
// //                     <AttendanceRingCard
// //                         title="Action Items"
// //                         typeLabel="Pending Tasks"
// //                         mainValue={globalStats.pendingLeaves + globalStats.activeKiosks}
// //                         totalValue="Tasks"
// //                         pct={globalStats.pendingLeaves > 0 || globalStats.activeKiosks > 0 ? 100 : 0}
// //                         theme={globalStats.pendingLeaves > 0 ? "r" : (globalStats.activeKiosks > 0 ? "k" : "p")}
// //                         icon={<MonitorPlay size={18} />}
// //                         bar1Label="Live Classes"
// //                         bar1Val={`${globalStats.activeKiosks}`}
// //                         bar1Pct={globalStats.activeKiosks > 0 ? 50 : 0}
// //                         bar2Label="Pending Leaves"
// //                         bar2Val={`${globalStats.pendingLeaves}`}
// //                         bar2Pct={globalStats.pendingLeaves > 0 ? 50 : 0}
// //                         statusText={globalStats.pendingLeaves > 0 ? "Needs Review" : (globalStats.activeKiosks > 0 ? "Live Now" : "All Clear")}
// //                     />
// //                 </div>
// //             )}

// //             {/* ── TERM ANALYTICS PANEL (Uses Ring Cards) ── */}
// //             {activeTab === 'registers' && selectedCohortId && cohortStats && (
// //                 <div className="mc-cards-wrapper animate-fade-in">
// //                     <AttendanceRingCard
// //                         title="Term Progress"
// //                         typeLabel="Timeline"
// //                         mainValue={cohortStats.daysCompleted}
// //                         totalValue={`${cohortStats.netExpectedTermDays} Days`}
// //                         pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
// //                         theme="p"
// //                         icon={<Target size={18} />}
// //                         bar1Label="Completed"
// //                         bar1Val={`${cohortStats.daysCompleted} days`}
// //                         bar1Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((cohortStats.daysCompleted / cohortStats.netExpectedTermDays) * 100) : 0}
// //                         bar2Label="Remaining"
// //                         bar2Val={`${Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted)} days`}
// //                         bar2Pct={cohortStats.netExpectedTermDays > 0 ? Math.round((Math.max(0, cohortStats.netExpectedTermDays - cohortStats.daysCompleted) / cohortStats.netExpectedTermDays) * 100) : 0}
// //                         statusText="Active Term"
// //                     />
// //                     <AttendanceRingCard
// //                         title="Average Attendance"
// //                         typeLabel="Cohort Health"
// //                         mainValue={`${cohortStats.avgAttendanceRate}%`}
// //                         totalValue="Target: 80%"
// //                         pct={cohortStats.avgAttendanceRate}
// //                         theme={cohortStats.avgAttendanceRate >= 80 ? "w" : (cohortStats.avgAttendanceRate >= 50 ? "k" : "r")}
// //                         icon={<BarChart2 size={18} />}
// //                         bar1Label="Present"
// //                         bar1Val="Avg"
// //                         bar1Pct={cohortStats.avgAttendanceRate}
// //                         bar2Label="Absent"
// //                         bar2Val="Avg"
// //                         bar2Pct={100 - cohortStats.avgAttendanceRate}
// //                         statusText={cohortStats.avgAttendanceRate >= 80 ? "On Track" : "Needs Attention"}
// //                     />
// //                     <AttendanceRingCard
// //                         title="Excluded Days"
// //                         typeLabel="Off-Campus"
// //                         mainValue={cohortStats.holidaysCount + cohortStats.recessCount}
// //                         totalValue="Total Off"
// //                         pct={cohortStats.holidaysCount + cohortStats.recessCount > 0 ? 100 : 0}
// //                         theme="k"
// //                         icon={<Coffee size={18} />}
// //                         bar1Label="Holidays"
// //                         bar1Val={`${cohortStats.holidaysCount} days`}
// //                         bar1Pct={cohortStats.holidaysCount > 0 ? 50 : 0}
// //                         bar2Label="Recess"
// //                         bar2Val={`${cohortStats.recessCount} days`}
// //                         bar2Pct={cohortStats.recessCount > 0 ? 50 : 0}
// //                         statusText="Term Breaks"
// //                     />
// //                 </div>
// //             )}

// //             {/* ─── TAB 1: REGISTERS TABLE ─── */}
// //             {activeTab === 'registers' && (
// //                 <div className="mlab-table-wrap">
// //                     <table className="mlab-table">
// //                         <thead>
// //                             <tr>
// //                                 <th>Date Recorded</th>
// //                                 {isAdmin && <th>Cohort</th>}
// //                                 <th>Attendance</th>
// //                                 <th>Proofs</th>
// //                                 <th className="att-th--right">Action</th>
// //                             </tr>
// //                         </thead>
// //                         <tbody>
// //                             {filteredHistory.length > 0 ? filteredHistory.map(record => {
// //                                 const proofCount = Object.keys(record.proofs || {}).length;
// //                                 const presentCount = record.presentLearners?.length || 0;
// //                                 const cohortName = record.cohortName || allCohorts.find(c => c.id === record.cohortId)?.name || 'Unknown Cohort';

// //                                 return (
// //                                     <tr key={record.id}>
// //                                         <td>
// //                                             <div className="att-date-cell">
// //                                                 <Calendar size={14} className="att-date-cell__icon" />
// //                                                 <span className="att-date-cell__label">{moment(record.date).format('DD MMM YYYY')}</span>
// //                                             </div>
// //                                         </td>
// //                                         {isAdmin && <td><span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>{cohortName}</span></td>}
// //                                         <td><span className="att-badge att-badge--present"><Users size={11} /> {presentCount} Present</span></td>
// //                                         <td>{proofCount > 0 ? <span className="att-badge att-badge--proof"><FileText size={11} /> {proofCount} Attached</span> : <span className="att-no-data">None</span>}</td>
// //                                         <td className="att-td--right">
// //                                             <button className="mlab-btn mlab-btn--outline mlab-btn--outline-blue att-open-btn" onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}>
// //                                                 Open Register <ArrowRight size={13} />
// //                                             </button>
// //                                         </td>
// //                                     </tr>
// //                                 );
// //                             }) : (
// //                                 <tr>
// //                                     <td colSpan={isAdmin ? 5 : 4} style={{ padding: '3rem', textAlign: 'center' }}>
// //                                         {history.length === 0 ? (
// //                                             <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><History size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No Records Yet</p><p className="mlab-empty__desc">Saved attendance registers will appear here.</p></div>
// //                                         ) : (
// //                                             <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => setRegisterSearch('')} style={{ marginTop: '1rem' }}>Clear Search</button></div>
// //                                         )}
// //                                     </td>
// //                                 </tr>
// //                             )}
// //                         </tbody>
// //                     </table>
// //                 </div>
// //             )}

// //             {/* ─── TAB 2: CALENDAR VIEW ─── */}
// //             {activeTab === 'calendar' && (
// //                 <div className="cdp-panel animate-fade-in" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>

// //                     {/* Header */}
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
// //                         <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                             <Calendar size={22} color="var(--mlab-blue)" />
// //                             Cohort Attendance Calendar
// //                         </h3>

// //                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                             {/* 🚀 EXPORT STIPEND BUTTON NEXT TO MONTH NAVIGATOR */}
// //                             {selectedCohortId && (
// //                                 <button
// //                                     className="mlab-btn mlab-btn--sm"
// //                                     onClick={() => setIsStipendModalOpen(true)}
// //                                     style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', fontWeight: 700 }}
// //                                 >
// //                                     <DownloadCloud size={14} /> Export {calendarMonth.format('MMM')} Stipends
// //                                 </button>
// //                             )}

// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: '#f8fafc', padding: '6px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
// //                                 <button onClick={handlePrevMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><ChevronLeft size={16} /></button>
// //                                 <span style={{ fontWeight: '800', width: '130px', textAlign: 'center', color: 'var(--mlab-midnight)', fontSize: '0.95rem' }}>{calendarMonth.format('MMMM YYYY')}</span>
// //                                 <button onClick={handleNextMonth} style={{ padding: '6px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}><ChevronRight size={16} /></button>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     {!selectedCohortId && (
// //                         <div style={{ marginBottom: '1.5rem', padding: '12px 16px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', color: '#b45309', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' }}>
// //                             <AlertTriangle size={18} /> Please select a specific cohort from the dropdown above to view accurate daily attendance metrics.
// //                         </div>
// //                     )}

// //                     {/* Grid Header */}
// //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
// //                         {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
// //                             <div key={d} style={{ textAlign: 'center', fontWeight: '800', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
// //                         ))}
// //                     </div>

// //                     {/* Grid Cells */}
// //                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
// //                         {calendarGrid.map((day) => {
// //                             const dateStr = day.format('YYYY-MM-DD');
// //                             const isCurrentMonth = day.month() === calendarMonth.month();
// //                             const isToday = dateStr === moment().format('YYYY-MM-DD');
// //                             const data = calendarDataMap.get(dateStr);

// //                             return (
// //                                 <div
// //                                     key={dateStr}
// //                                     onClick={() => {
// //                                         if (data?.hasRegister && selectedCohortId) {
// //                                             navigate(`/facilitator/attendance/${selectedCohortId}?date=${dateStr}`);
// //                                         } else if (data?.leaves > 0) {
// //                                             setLeaveSearch('');
// //                                             setActiveTab('leaves');
// //                                         } else {
// //                                             setRegisterSearch(dateStr);
// //                                             setActiveTab('registers');
// //                                         }
// //                                     }}
// //                                     style={{
// //                                         border: isToday ? '2px solid var(--mlab-blue)' : '1px solid #e2e8f0',
// //                                         borderRadius: '10px',
// //                                         minHeight: '110px',
// //                                         padding: '10px',
// //                                         backgroundColor: isCurrentMonth ? 'white' : '#f8fafc',
// //                                         opacity: isCurrentMonth ? 1 : 0.4,
// //                                         cursor: 'pointer',
// //                                         transition: 'all 0.2s',
// //                                         boxShadow: isToday ? '0 4px 12px rgba(7, 63, 78, 0.15)' : 'none'
// //                                     }}
// //                                     onMouseOver={e => e.currentTarget.style.borderColor = 'var(--mlab-green)'}
// //                                     onMouseOut={e => e.currentTarget.style.borderColor = isToday ? 'var(--mlab-blue)' : '#e2e8f0'}
// //                                 >
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                         <span style={{
// //                                             fontWeight: isToday ? '800' : '600',
// //                                             color: isToday ? 'white' : 'var(--mlab-midnight)',
// //                                             background: isToday ? 'var(--mlab-blue)' : 'transparent',
// //                                             width: '26px', height: '26px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: '0.85rem'
// //                                         }}>{day.format('D')}</span>
// //                                     </div>

// //                                     {data && (
// //                                         <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                             {data.isHoliday && <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0284c7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>Public Holiday</span>}
// //                                             {data.isRecess && <span style={{ fontSize: '0.65rem', background: '#f3e8ff', color: '#7e22ce', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.label || 'Recess'}</span>}

// //                                             {data.hasRegister && (
// //                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '2px' }}>
// //                                                     <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.present} Present</span>
// //                                                     {data.absent > 0 && <span style={{ fontSize: '0.7rem', color: '#991b1b', background: '#fee2e2', padding: '3px 6px', borderRadius: '4px', fontWeight: 'bold' }}>{data.absent} Absent</span>}
// //                                                 </div>
// //                                             )}

// //                                             {data.leaves > 0 && (
// //                                                 <span style={{ marginTop: '4px', fontSize: '0.7rem', background: data.pendingLeaves > 0 ? '#fef3c7' : '#f1f5f9', color: data.pendingLeaves > 0 ? '#b45309' : '#475569', padding: '3px 6px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
// //                                                     <FileText size={12} /> {data.leaves} Leave{data.leaves !== 1 ? 's' : ''}
// //                                                 </span>
// //                                             )}
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )
// //                         })}
// //                     </div>
// //                 </div>
// //             )}

// //             {/* ─── TAB 3: LEAVES ─── */}
// //             {activeTab === 'leaves' && (
// //                 <>
// //                     <div className="cdp-stat-row" style={{ marginBottom: '1.5rem', animation: 'fade-in 0.3s ease' }}>
// //                         <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><FileText size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{displayedLeavesData.length}</span><span className="cdp-stat-card__label">Total Requests</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: pendingLeaveCount > 0 ? 'var(--mlab-amber)' : 'inherit' }}>{pendingLeaveCount}</span><span className="cdp-stat-card__label">Pending Review</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><CheckCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{approvedLeaveCount}</span><span className="cdp-stat-card__label">Approved</span></div></div>
// //                         <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><XCircle size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value" style={{ color: declinedLeaveCount > 0 ? '#ef4444' : 'inherit' }}>{declinedLeaveCount}</span><span className="cdp-stat-card__label">Declined</span></div></div>
// //                     </div>

// //                     <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
// //                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
// //                             <div className="mlab-search" style={{ minWidth: '220px', borderRadius: 0 }}><Search size={18} color="var(--mlab-grey)" /><input type="text" placeholder="Search by learner name..." value={leaveSearch} onChange={e => setLeaveSearch(e.target.value)} /></div>
// //                             <div className="mlab-select-wrap" style={{ borderRadius: 0 }}><Filter size={16} color="var(--mlab-grey)" /><select value={leaveStatusFilter} onChange={e => setLeaveStatusFilter(e.target.value)}><option value="all">All Statuses</option><option value="Pending">Pending</option><option value="Approved">Approved</option><option value="Declined">Declined</option></select></div>
// //                             <div className="mlab-select-wrap" style={{ borderRadius: 0 }}><Filter size={16} color="var(--mlab-grey)" /><select value={leaveTypeFilter} onChange={e => setLeaveTypeFilter(e.target.value)}><option value="all">All Reasons</option><option value="Sick Leave">Sick Leave</option><option value="Personal Emergency">Personal Emergency</option><option value="Interview">Interview</option><option value="Other">Other</option></select></div>
// //                         </div>
// //                     </div>

// //                     <div className="mlab-table-wrap">
// //                         {isLeavesLoading ? (
// //                             <div className="att-loader-wrap att-loader-wrap--inline"><Loader message="Fetching requests…" /></div>
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
// //                                                 <td><span className="mlab-cell-name">{req.learnerName || req.learnerId}</span></td>
// //                                                 <td>
// //                                                     <div className="att-dates-cell">
// //                                                         <div className="att-dates-cell__start"><Calendar size={13} className="att-dates-cell__icon" /><span className="att-dates-cell__label">{fmtStart}</span></div>
// //                                                         {!isSameDay && <div className="att-dates-cell__end"><ArrowRightCircle size={12} className="att-dates-cell__arrow" /><span className="att-dates-cell__label--end">{fmtEnd}</span></div>}
// //                                                     </div>
// //                                                 </td>
// //                                                 <td><div className="att-reason-cell"><span className="att-reason-cell__type">{req.type}</span><span className="att-reason-cell__quote">"{req.reason}"</span></div></td>
// //                                                 <td>
// //                                                     {req.attachmentUrl ? (
// //                                                         <a href={req.attachmentUrl} target="_blank" rel="noopener noreferrer" className="att-attach-link" title={req.attachmentName || 'Download Document'}>
// //                                                             <DownloadCloud size={14} /><span className="att-attach-link__text">{req.attachmentName ? (req.attachmentName.length > 15 ? req.attachmentName.substring(0, 15) + '...' : req.attachmentName) : 'View File'}</span>
// //                                                         </a>
// //                                                     ) : <span className="att-no-data">No Attachment</span>}
// //                                                 </td>
// //                                                 <td>
// //                                                     {req.status === 'Pending' && <span className="att-badge att-badge--pending"><Clock size={11} /> Pending</span>}
// //                                                     {req.status === 'Approved' && <span className="att-badge att-badge--approved"><CheckCircle size={11} /> Approved</span>}
// //                                                     {req.status === 'Declined' && <span className="att-badge att-badge--declined"><XCircle size={11} /> Declined</span>}
// //                                                 </td>
// //                                                 <td className="att-td--right">
// //                                                     {req.status === 'Pending' ? (
// //                                                         <div className="att-action-btns">
// //                                                             <button className="att-btn att-btn--approve" onClick={() => handleLeaveAction(req.id, 'Approved')}><CheckCircle size={12} /> Approve</button>
// //                                                             <button className="att-btn att-btn--decline" onClick={() => handleLeaveAction(req.id, 'Declined')}><XCircle size={12} /> Decline</button>
// //                                                         </div>
// //                                                     ) : <span className="att-reviewed-label">Reviewed</span>}
// //                                                 </td>
// //                                             </tr>
// //                                         );
// //                                     }) : (
// //                                         <tr>
// //                                             <td colSpan={6} style={{ padding: '3rem', textAlign: 'center' }}>
// //                                                 {displayedLeavesData.length === 0 ? (
// //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><FileText size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">All Caught Up!</p><p className="mlab-empty__desc">No leave requests are pending review.</p></div>
// //                                                 ) : (
// //                                                     <div className="mlab-empty" style={{ border: 'none', background: 'transparent' }}><Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" /><p className="mlab-empty__title">No matches found</p><p className="mlab-empty__desc">Try adjusting your filters or search term.</p><button className="mlab-btn mlab-btn--outline" onClick={() => { setLeaveSearch(''); setLeaveStatusFilter('all'); setLeaveTypeFilter('all'); }} style={{ marginTop: '1rem' }}>Clear Filters</button></div>
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