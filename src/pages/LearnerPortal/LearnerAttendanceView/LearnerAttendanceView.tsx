// src/components/views/LearnerAttendanceView/LearnerAttendanceView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    CalendarCheck, Clock, CheckCircle, AlertTriangle, Calendar, XCircle,
    ArrowDownToLine, BookOpen, Layers, Briefcase, Plus, History,
    FileText, Pencil, Search, ChevronDown, ChevronUp,
    Maximize2, Paperclip, Landmark, Loader2,
    FileCode, MapPin, Phone, Mail, Building2, UserCircle, Users,
    Award, Video, AlertCircle, MonitorCheck, MapPinCheck,
    CheckSquare, CheckCircle2, ShieldCheck
} from 'lucide-react';
import moment from 'moment';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

import './LearnerAttendanceView.css';
import { useStore } from '../../../store/useStore';
import { WorkplaceLogViewerModal } from '../../../components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal';

const MIDNIGHT = '#073f4e';

export interface AbsenceRecord {
    date: string;
    cohortId?: string;
    cohortName?: string;
}

export interface LearnerAttendanceViewProps {
    formattedScanHistory: any[];
    virtualAttendance?: any[];
    absenceDates: (AbsenceRecord | string)[];
    attendancePercentage: string;
    cohorts: any[];
    workplaceLogs: any[];
    learnerHasEmployer: boolean;
    stipendAmount?: number;
    onOpenLogModal: (log?: any, placementContext?: { placementId?: string, employerId?: string, mentorId?: string, cohortId?: string }) => void;
}

const getSAWorkingDaysInMonth = (year: number, month: number, holidaysList: string[]) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidaysList.includes(current.format('YYYY-MM-DD'))) {
                days++;
            }
        }
        current.add(1, 'days');
    }
    return days;
};

export const LearnerAttendanceView: React.FC<LearnerAttendanceViewProps> = ({
    formattedScanHistory = [],
    virtualAttendance = [],
    absenceDates = [],
    cohorts = [],
    workplaceLogs: propsWorkplaceLogs = [],
    learnerHasEmployer = false,
    stipendAmount,
    onOpenLogModal
}) => {
    const { user, workplaceLogs: storeWorkplaceLogs } = useStore() as any;
    const [searchParams, setSearchParams] = useSearchParams();

    const workplaceLogs = useMemo(() => {
        const map = new Map<string, any>();
        (propsWorkplaceLogs || []).forEach((l: any) => { if (l?.id) map.set(l.id, l); });
        (storeWorkplaceLogs || []).forEach((l: any) => { if (l?.id) map.set(l.id, l); });
        return Array.from(map.values());
    }, [propsWorkplaceLogs, storeWorkplaceLogs]);

    // ─── INTERNAL UI STATE (SYNCED WITH URL) ───
    const [activeTab, setActiveTab] = useState<'campus' | 'workplace'>((searchParams.get('subtab') as any) || 'campus');
    const [attendanceMode, setAttendanceMode] = useState<'all' | 'physical' | 'virtual'>((searchParams.get('attMode') as any) || 'all');
    const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>((searchParams.get('attStatus') as any) || 'all');
    const [selectedCohortId, setSelectedCohortId] = useState<string>(searchParams.get('attCohort') || 'all');
    const [dateFilterMode, setDateFilterMode] = useState<'month' | 'week' | 'date'>((searchParams.get('attDateMode') as any) || 'month');
    const [dateSearch, setDateSearch] = useState(searchParams.get('attDate') || '');

    const [wpSearch, setWpSearch] = useState(searchParams.get('wpSearch') || '');
    const [wpStatusFilter, setWpStatusFilter] = useState<string>(searchParams.get('wpStatus') || 'all');
    const [wpMonthFilter, setWpMonthFilter] = useState<string>(searchParams.get('wpMonth') || 'all');
    const [selectedPlacementFilter, setSelectedPlacementFilter] = useState<string>(searchParams.get('wpPlacement') || 'all');

    // 🚀 NEW: MENTOR FILTER STATE
    const [selectedMentorFilter, setSelectedMentorFilter] = useState<string>(searchParams.get('wpMentor') || 'all');

    // Mentors dictionary lookup store for user IDs -> Profile details
    const [mentorsDict, setMentorsDict] = useState<Record<string, any>>({});

    // Sync State Changes to URL
    useEffect(() => {
        setSearchParams(prev => {
            const params = new URLSearchParams(prev);

            params.set('tab', 'attendance');

            const updateParam = (key: string, val: string, defaultVal: string) => {
                if (val && val !== defaultVal) params.set(key, val);
                else params.delete(key);
            };

            updateParam('subtab', activeTab, 'campus');
            updateParam('attMode', attendanceMode, 'all');
            updateParam('attStatus', filterStatus, 'all');
            updateParam('attCohort', selectedCohortId, 'all');
            updateParam('attDateMode', dateFilterMode, 'month');
            updateParam('attDate', dateSearch, '');
            updateParam('wpSearch', wpSearch, '');
            updateParam('wpStatus', wpStatusFilter, 'all');
            updateParam('wpMonth', wpMonthFilter, 'all');
            updateParam('wpPlacement', selectedPlacementFilter, 'all');
            updateParam('wpMentor', selectedMentorFilter, 'all');

            return params;
        }, { replace: true });
    }, [
        activeTab, attendanceMode, filterStatus, selectedCohortId, dateFilterMode, dateSearch,
        wpSearch, wpStatusFilter, wpMonthFilter, selectedPlacementFilter, selectedMentorFilter, setSearchParams
    ]);

    const [expandedWpMonths, setExpandedWpMonths] = useState<Set<string>>(new Set());
    const [expandedEmployers, setExpandedEmployers] = useState<Set<string>>(new Set());

    const [viewingLogDetails, setViewingLogDetails] = useState<any | null>(null);
    const [viewingLogEmployer, setViewingLogEmployer] = useState<any>(null);

    // ─── EMPLOYMENT HISTORY & STIPEND PIPELINE STATE ───
    const [placementsHistory, setPlacementsHistory] = useState<any[]>([]);
    const [directStipend, setDirectStipend] = useState<number | null>(null);
    const [isEmploymentLoading, setIsEmploymentLoading] = useState<boolean>(false);

    // ─── DYNAMIC PUBLIC HOLIDAYS STATE ENGINE ───
    const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
    const [isHolidaysLoading, setIsHolidaysLoading] = useState<boolean>(true);

    const stableUserUid = user?.uid || '';
    const stableIdNumber = user?.idNumber || '';
    const fallbackSearchId = workplaceLogs.length > 0 ? workplaceLogs[0].learnerId : '';

    useEffect(() => {
        const fetchSAHolidaysFromApi = async () => {
            setIsHolidaysLoading(true);
            try {
                const queryYear = moment().year();
                const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${queryYear}/ZA`);

                if (response.ok) {
                    const data = await response.json();
                    const parsedDates = data.map((item: any) => item.date);
                    setPublicHolidays(parsedDates);
                } else {
                    throw new Error(`API Error response channel: ${response.status}`);
                }
            } catch (err) {
                console.warn("⚠️ Holiday API channel down. Injecting fallback matrix.", err);
                setPublicHolidays([
                    '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27',
                    '2026-05-01', '2026-06-16', '2026-08-09', '2026-08-10', '2026-09-24',
                    '2026-12-16', '2026-12-25', '2026-12-26'
                ]);
            } finally {
                setIsHolidaysLoading(false);
            }
        };

        fetchSAHolidaysFromApi();
    }, []);

    // AUTO-EXPAND ALL LOG MONTHS BY DEFAULT WHEN LOGS CHANGE
    useEffect(() => {
        if (workplaceLogs.length > 0) {
            const allLogMonths = new Set<string>();
            workplaceLogs.forEach(log => {
                if (log.dateString) {
                    allLogMonths.add(moment(log.dateString).format('MMMM YYYY'));
                }
            });
            setExpandedWpMonths(prev => {
                const next = new Set(prev);
                allLogMonths.forEach(m => next.add(m));
                return next;
            });
        }
    }, [workplaceLogs]);

    // AUTO-EXPAND ALL PLACEMENT ACCORDIONS BY DEFAULT
    useEffect(() => {
        if (placementsHistory.length > 0) {
            const allPlacementIds = placementsHistory.map(p => p.placementId);
            setExpandedEmployers(prev => {
                const next = new Set(prev);
                allPlacementIds.forEach(id => next.add(id));
                return next;
            });
        }
    }, [placementsHistory]);

    // 🚀 EXHAUSTIVE MULTI-KEY PLACEMENT & MENTOR DISCOVERY PIPELINE
    useEffect(() => {
        const fetchEmploymentProfile = async () => {
            const candidateIds = new Set<string>([
                stableUserUid,
                stableIdNumber,
                user?.id,
                user?.authUid,
                user?.learnerId,
                fallbackSearchId
            ].filter(Boolean) as string[]);

            workplaceLogs.forEach(l => {
                if (l.learnerId) candidateIds.add(l.learnerId);
                if (l.authUid) candidateIds.add(l.authUid);
            });

            if (candidateIds.size === 0) {
                setIsEmploymentLoading(false);
                return;
            }

            setIsEmploymentLoading(true);
            try {
                const expandedSearchIds = new Set<string>(candidateIds);

                for (const candidateId of Array.from(candidateIds)) {
                    try {
                        const enrollmentsQ = query(collection(db, "enrollments"), where("learnerId", "==", candidateId));
                        const enrollmentsSnap = await getDocs(enrollmentsQ);
                        enrollmentsSnap.docs.forEach(d => {
                            expandedSearchIds.add(d.id);
                            if (d.data()?.id) expandedSearchIds.add(d.data().id);
                        });
                    } catch (e: any) {
                        console.warn(`Enrollment query for learnerId "${candidateId}" warning:`, e.message);
                    }

                    try {
                        const enrollmentsAuthQ = query(collection(db, "enrollments"), where("authUid", "==", candidateId));
                        const enrollmentsAuthSnap = await getDocs(enrollmentsAuthQ);
                        enrollmentsAuthSnap.docs.forEach(d => {
                            expandedSearchIds.add(d.id);
                            if (d.data()?.id) expandedSearchIds.add(d.data().id);
                        });
                    } catch (e: any) {
                        // ignore
                    }
                }

                const finalSearchKeys = Array.from(expandedSearchIds);
                const placementsMap = new Map<string, any>();

                for (const searchKey of finalSearchKeys) {
                    try {
                        const placementsQ = query(collection(db, "placements"), where("learnerId", "==", searchKey));
                        const placementsSnap = await getDocs(placementsQ);
                        placementsSnap.docs.forEach(d => placementsMap.set(d.id, { id: d.id, ...d.data() }));
                    } catch (e: any) {
                        console.warn(`Placement query for learnerId "${searchKey}" warning:`, e.message);
                    }

                    try {
                        const placementsAuthQ = query(collection(db, "placements"), where("authUid", "==", searchKey));
                        const placementsAuthSnap = await getDocs(placementsAuthQ);
                        placementsAuthSnap.docs.forEach(d => placementsMap.set(d.id, { id: d.id, ...d.data() }));
                    } catch (e: any) {
                        // ignore
                    }
                }

                const fetchedPlacements = Array.from(placementsMap.values())
                    .sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

                if (fetchedPlacements.length > 0) {
                    const employerIds = [...new Set(fetchedPlacements.map((p: any) => p.employerId).filter(Boolean))];

                    const mentorIds = [
                        ...new Set([
                            ...fetchedPlacements.flatMap((p: any) => [
                                p.mentorId,
                                ...(Array.isArray(p.secondaryMentorIds) ? p.secondaryMentorIds : [])
                            ]),
                            ...workplaceLogs.flatMap((l: any) => [l.mentorId, l.verifiedBy, l.verifiedMentorId])
                        ].filter(Boolean))
                    ];

                    const employersData: Record<string, any> = {};
                    const mentorsData: Record<string, any> = {};

                    if (employerIds.length > 0) {
                        const empDocs = await Promise.all(employerIds.map(id => getDoc(doc(db, 'employers', id))));
                        empDocs.forEach(d => { if (d.exists()) employersData[d.id] = d.data(); });
                    }

                    if (mentorIds.length > 0) {
                        const mDocs = await Promise.all(mentorIds.map(id => getDoc(doc(db, 'users', id))));
                        mDocs.forEach(d => { if (d.exists()) mentorsData[d.id] = d.data(); });
                    }

                    setMentorsDict(mentorsData);

                    const compiledHistory = fetchedPlacements.map((p: any) => {
                        const secIds = Array.isArray(p.secondaryMentorIds) ? p.secondaryMentorIds : [];
                        const secondaryMentorsList = secIds.map((secId: string) => {
                            const m = mentorsData[secId] || {};
                            return {
                                id: secId,
                                fullName: m.fullName || m.firstName || 'Co-Mentor',
                                email: m.email || '',
                                phone: m.phone || ''
                            };
                        });

                        const primaryM = p.mentorId ? mentorsData[p.mentorId] : null;

                        return {
                            placementId: p.id,
                            cohortId: p.cohortId || '',
                            status: p.status || 'Past Placement',
                            placementType: p.placementType || p.customPlacementType || 'Workplace Module',
                            startDate: p.startDate || p.createdAt,
                            endDate: p.endDate,
                            stipendAmount: p.stipendAmount ?? p.stipend ?? p.allowance ?? p.wage,
                            employer: p.employerId ? { id: p.employerId, ...employersData[p.employerId] } : null,
                            mentor: p.mentorId ? {
                                id: p.mentorId,
                                fullName: primaryM?.fullName || primaryM?.firstName || p.mentorName || p.assignedMentorName || 'Primary Mentor',
                                email: primaryM?.email || '',
                                phone: primaryM?.phone || ''
                            } : null,
                            secondaryMentors: secondaryMentorsList,
                            compliance: p.compliance || {}
                        };
                    });

                    setPlacementsHistory(compiledHistory);

                    const activePlace = compiledHistory.find(h => ['active placement', 'active', 'pending match'].includes(String(h.status).toLowerCase()));
                    if (activePlace && activePlace.stipendAmount !== undefined && (!stipendAmount || stipendAmount === 0)) {
                        setDirectStipend(Number(activePlace.stipendAmount));
                    }
                } else {
                    setPlacementsHistory([]);
                }
            } catch (err) {
                console.error("Pipeline failure in fetchEmploymentProfile:", err);
            } finally {
                setIsEmploymentLoading(false);
            }
        };

        fetchSecureDataProfile();
        fetchEmploymentProfile();
    }, [stableIdNumber, stableUserUid, fallbackSearchId, stipendAmount, user, workplaceLogs]);

    const fetchSecureDataProfile = () => { };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-ZA", {
            style: "currency",
            currency: "ZAR",
            maximumFractionDigits: 0,
        }).format(val || 0);

    const toggleWpMonthAccordion = (monthLabel: string) => {
        setExpandedWpMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthLabel)) next.delete(monthLabel);
            else next.add(monthLabel);
            return next;
        });
    };

    const toggleEmployerAccordion = (placementId: string) => {
        setExpandedEmployers(prev => {
            const next = new Set(prev);
            if (next.has(placementId)) next.delete(placementId); else next.add(placementId);
            return next;
        });
    };

    // ─── COMBINED LEDGER ───
    const combinedLedger = useMemo(() => {
        const presentRecords = formattedScanHistory.map(scan => {
            const matchedCohort = cohorts.find(c => c.id === scan.cohortId);
            return {
                ...scan,
                type: 'present',
                dateObj: new Date(scan.dateString),
                cohortId: scan.cohortId || '',
                cohortName: matchedCohort ? matchedCohort.name : (scan.cohortName || 'General Campus Session')
            };
        });

        const virtualRecords = virtualAttendance.map(rec => {
            const matchedCohort = cohorts.find(c => c.id === rec.cohortId);
            const dateStr = rec.sessionDate || rec.dateString || rec.date || new Date().toISOString().split('T')[0];
            return {
                ...rec,
                type: 'virtual',
                dateString: dateStr,
                dateObj: new Date(dateStr),
                cohortId: rec.cohortId || '',
                cohortName: matchedCohort ? matchedCohort.name : (rec.cohortName || 'Virtual Bootcamp Session'),
                checkInAt: null,
                checkOutAt: null,
                actualDuration: rec.actualDuration || 0,
                expectedDuration: rec.expectedDuration || 0,
                virtualStatus: rec.status,
                sessionTitle: rec.sessionTitle || rec.title || '',
                sessionDescription: rec.sessionDescription || rec.description || '',
                sessionZoomLink: rec.sessionZoomLink || rec.zoomLink || rec.videoLink || ''
            };
        });

        const absentRecords = absenceDates.map(item => {
            const dateStr = typeof item === 'string' ? item : item.date;
            const cName = typeof item === 'string' ? 'Unknown Class' : (item.cohortName || 'Unknown Class');
            const cId = typeof item === 'string' ? '' : (item.cohortId || '');
            const matchedCohort = cohorts.find(c => c.name === cName || c.id === cId);
            return {
                dateString: dateStr,
                type: 'absent',
                dateObj: new Date(dateStr),
                cohortId: matchedCohort ? matchedCohort.id : cId,
                cohortName: cName
            };
        });

        const mergedMap = new Map();
        [...virtualRecords, ...presentRecords, ...absentRecords].forEach(rec => {
            const key = `${rec.dateString}_${rec.cohortId}`;
            if (!mergedMap.has(key)) {
                mergedMap.set(key, rec);
            } else {
                const existing = mergedMap.get(key);
                if ((existing.type === 'absent' || existing.virtualStatus === 'Absent') &&
                    (rec.type === 'present' || (rec.type === 'virtual' && rec.virtualStatus !== 'Absent'))) {
                    mergedMap.set(key, rec);
                }
            }
        });

        return Array.from(mergedMap.values()).sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    }, [formattedScanHistory, virtualAttendance, absenceDates, cohorts]);

    const uniqueLedgerCohorts = useMemo(() => {
        const seen = new Set<string>();
        const list: { id: string; name: string }[] = [];

        cohorts.forEach(c => {
            if (c.id && !seen.has(c.id)) {
                seen.add(c.id);
                list.push({ id: c.id, name: c.name || 'Enrolled Cohort' });
            }
        });

        combinedLedger.forEach(record => {
            const idKey = record.cohortId || record.cohortName;
            if (idKey && !seen.has(idKey)) {
                seen.add(idKey);
                list.push({ id: idKey, name: record.cohortName || idKey });
            }
        });

        return list;
    }, [cohorts, combinedLedger]);

    const cohortFilteredLedger = useMemo(() => {
        return combinedLedger.filter(record => {
            if (selectedCohortId === 'all') return true;
            return record.cohortId === selectedCohortId || record.cohortName === selectedCohortId;
        });
    }, [combinedLedger, selectedCohortId]);

    const finalFilteredDisplayLedger = useMemo(() => {
        return cohortFilteredLedger.filter(record => {
            if (attendanceMode === 'physical' && record.type === 'virtual') return false;
            if (attendanceMode === 'virtual' && record.type !== 'virtual') return false;

            if (filterStatus !== 'all') {
                if (filterStatus === 'present' && record.type !== 'present' && !(record.type === 'virtual' && record.virtualStatus !== 'Absent')) return false;
                if (filterStatus === 'absent' && record.type !== 'absent' && !(record.type === 'virtual' && record.virtualStatus === 'Absent')) return false;
            }
            if (dateSearch) {
                if (dateFilterMode === 'month' && moment(record.dateObj).format('YYYY-MM') !== dateSearch) return false;
                if (dateFilterMode === 'week' && moment(record.dateObj).format('YYYY-[W]WW') !== dateSearch) return false;
                if (dateFilterMode === 'date' && moment(record.dateObj).format('YYYY-MM-DD') !== dateSearch) return false;
            }
            return true;
        });
    }, [cohortFilteredLedger, attendanceMode, filterStatus, dateFilterMode, dateSearch]);

    // 🚀 DYNAMIC MENTORS LIST FOR FILTERING
    const mentorOptions = useMemo(() => {
        const map = new Map<string, string>();

        placementsHistory.forEach(p => {
            if (p.mentor?.id && p.mentor?.fullName) {
                map.set(p.mentor.id, p.mentor.fullName);
            }
            if (Array.isArray(p.secondaryMentors)) {
                p.secondaryMentors.forEach((sm: any) => {
                    if (sm.id && sm.fullName) map.set(sm.id, sm.fullName);
                });
            }
        });

        workplaceLogs.forEach(log => {
            if (log.mentorId && log.mentorName) {
                map.set(log.mentorId, log.mentorName);
            } else if (log.mentorId && mentorsDict[log.mentorId]) {
                const m = mentorsDict[log.mentorId];
                map.set(log.mentorId, m.fullName || m.firstName || m.email || log.mentorId);
            }
            if (log.verifiedBy && mentorsDict[log.verifiedBy]) {
                const vm = mentorsDict[log.verifiedBy];
                map.set(log.verifiedBy, vm.fullName || vm.firstName || vm.email || log.verifiedBy);
            }
        });

        return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
    }, [placementsHistory, workplaceLogs, mentorsDict]);

    // ─── WORKPLACE LOGS & PLACEMENT MAPPING COMPUTATION ───
    const wpAvailableMonths = useMemo(() => {
        const months = new Set<string>();
        workplaceLogs.forEach(log => {
            if (log.dateString) months.add(moment(log.dateString).format('YYYY-MM'));
        });
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    }, [workplaceLogs]);

    const filteredWpLogs = useMemo(() => {
        return workplaceLogs.filter(log => {
            if (wpStatusFilter !== 'all' && log.status !== wpStatusFilter) return false;
            if (wpMonthFilter !== 'all' && !log.dateString?.startsWith(wpMonthFilter)) return false;

            // 🚀 MENTOR FILTER CHECK
            if (selectedMentorFilter !== 'all') {
                const isAssigned = log.mentorId === selectedMentorFilter ||
                    (Array.isArray(log.secondaryMentorIds) && log.secondaryMentorIds.includes(selectedMentorFilter));
                const isVerifier = log.verifiedBy === selectedMentorFilter || log.verifiedMentorId === selectedMentorFilter;

                if (!isAssigned && !isVerifier) return false;
            }

            if (wpSearch.trim()) {
                const term = wpSearch.toLowerCase();
                const matchesSearch =
                    log.tasksPerformed?.toLowerCase().includes(term) ||
                    log.workActivityCode?.toLowerCase().includes(term) ||
                    log.workActivityLabel?.toLowerCase().includes(term) ||
                    log.topicTitle?.toLowerCase().includes(term) ||
                    log.mentorName?.toLowerCase().includes(term);
                if (!matchesSearch) return false;
            }
            return true;
        }).sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());
    }, [workplaceLogs, wpStatusFilter, wpMonthFilter, selectedMentorFilter, wpSearch]);

    // 🚀 STRICT PLACEMENT ID MAPPING ENGINE
    const { mappedPlacements, unassignedLogs } = useMemo(() => {
        const assignedLogIds = new Set<string>();

        const sortedPlacements = [...placementsHistory].sort((a, b) =>
            new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime()
        );

        const mapped = sortedPlacements.map(place => {
            const pLogs = filteredWpLogs.filter(log => {
                if (assignedLogIds.has(log.id)) return false;

                // 1. Strict Placement ID Match
                if (log.placementId) {
                    return log.placementId === place.placementId;
                }

                // 2. Fallback Match for Legacy Logs
                const logEmpId = log.employerId || log.rawLogData?.employerId;
                const logMentorId = log.mentorId || log.rawLogData?.mentorId;
                const isEmployerMatch = logEmpId && place.employer?.id && logEmpId === place.employer.id;
                const isMentorMatch = logMentorId && place.mentor?.id && logMentorId === place.mentor.id;

                if (isEmployerMatch || isMentorMatch) {
                    if (log.dateString && place.startDate) {
                        const logDate = moment(log.dateString);
                        const start = moment(place.startDate);
                        const end = place.endDate ? moment(place.endDate) : moment().add(10, 'years');

                        if (logDate.isSameOrAfter(start, 'day') && logDate.isSameOrBefore(end, 'day')) {
                            return true;
                        }
                    }
                }
                return false;
            });

            pLogs.forEach(l => assignedLogIds.add(l.id));

            const grouped: Record<string, any[]> = {};
            pLogs.forEach(log => {
                const monthYear = moment(log.dateString).format('MMMM YYYY');
                if (!grouped[monthYear]) grouped[monthYear] = [];
                grouped[monthYear].push(log);
            });

            return { ...place, logs: pLogs, groupedLogs: grouped };
        });

        const unassigned = filteredWpLogs.filter(l => !assignedLogIds.has(l.id));
        const unassignedGrouped: Record<string, any[]> = {};
        unassigned.forEach(log => {
            const monthYear = moment(log.dateString).format('MMMM YYYY');
            if (!unassignedGrouped[monthYear]) unassignedGrouped[monthYear] = [];
            unassignedGrouped[monthYear].push(log);
        });

        return { mappedPlacements: mapped, unassignedLogs: unassignedGrouped };
    }, [placementsHistory, filteredWpLogs]);

    const placementOptions = useMemo(() => {
        return placementsHistory.map(p => {
            const empName = p.employer?.name || 'Host Company';
            const isLive = ['active placement', 'active', 'pending match'].includes(String(p.status).toLowerCase());
            return {
                id: p.placementId,
                label: `${empName} (${p.placementType || 'Module'}) - [${isLive ? 'ACTIVE' : 'PAST'}]`,
                empName
            };
        });
    }, [placementsHistory]);

    const logsForStats = useMemo(() => {
        if (selectedPlacementFilter === 'all') return workplaceLogs;
        const targetPlacement = mappedPlacements.find(p => p.placementId === selectedPlacementFilter);
        return targetPlacement ? targetPlacement.logs : [];
    }, [selectedPlacementFilter, workplaceLogs, mappedPlacements]);

    const displayedMappedPlacements = useMemo(() => {
        if (selectedPlacementFilter === 'all') return mappedPlacements;
        return mappedPlacements.filter(p => p.placementId === selectedPlacementFilter);
    }, [mappedPlacements, selectedPlacementFilter]);

    const hoursStats = useMemo(() => {
        const targetWpHours = 1600;
        let approved = 0, pending = 0, rejected = 0, draft = 0;

        logsForStats.forEach((log: any) => {
            const status = String(log.status || '').toLowerCase().trim();
            const hours = Number(log.totalHours) || 0;

            if (status === 'approved') approved += hours;
            else if (status === 'pending_mentor_approval' || status === 'pending') pending += hours;
            else if (status === 'rejected') rejected += hours;
            else draft += hours;
        });

        return {
            approvedWpHours: approved,
            pendingWpHours: pending,
            rejectedWpHours: rejected,
            draftWpHours: draft,
            totalWpHours: approved + pending,
            progressPct: Math.min(100, Math.round((approved / targetWpHours) * 100))
        };
    }, [logsForStats]);

    const stats = useMemo(() => {
        const presentCount = cohortFilteredLedger.filter(r =>
            r.type === 'present' || (r.type === 'virtual' && r.virtualStatus !== 'Absent')
        ).length;

        const absentCount = cohortFilteredLedger.filter(r =>
            r.type === 'absent' || (r.type === 'virtual' && r.virtualStatus === 'Absent')
        ).length;

        const total = presentCount + absentCount;
        const ratio = total === 0 ? "100%" : Math.round((presentCount / total) * 100) + "%";

        const currentYear = moment().year();
        const currentMonth = moment().month();
        const currentMonthStr = moment().format('YYYY-MM');

        const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, publicHolidays);

        const approvedDatesThisMonth = new Set(
            logsForStats
                .filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr))
                .filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved")
                .map((l: any) => l.dateString)
        );
        const currentMonthApprovedDays = approvedDatesThisMonth.size;

        const selectedPlacementObj = selectedPlacementFilter !== 'all'
            ? placementsHistory.find(p => p.placementId === selectedPlacementFilter)
            : null;

        const baseWageAmount = selectedPlacementObj?.stipendAmount !== undefined
            ? Number(selectedPlacementObj.stipendAmount)
            : (Number(stipendAmount) || directStipend || 0);

        let currentMonthEarnedStipend = baseWageAmount;
        if (expectedWorkingDaysThisMonth > 0 && baseWageAmount > 0) {
            const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * baseWageAmount;
            currentMonthEarnedStipend = Math.min(calculatedProRata, baseWageAmount);
        }

        return {
            total, presentCount, absentCount, ratio,
            currentMonthApprovedDays, expectedWorkingDaysThisMonth,
            currentMonthEarnedStipend, baseStipendUsed: baseWageAmount
        };
    }, [cohortFilteredLedger, logsForStats, selectedPlacementFilter, placementsHistory, stipendAmount, directStipend, publicHolidays]);

    const renderLogsGroupedByMonth = (groupedLogs: Record<string, any[]>, passedEmployer?: any) => {
        if (Object.keys(groupedLogs).length === 0) {
            return (
                <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                    <History size={32} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
                    <h4 style={{ fontFamily: 'var(--font-heading)', color: '#64748b', margin: 0 }}>No Logs Found</h4>
                    <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0', fontSize: '0.8rem', textTransform: 'none' }}>No entries match the current timeline or filters.</p>
                </div>
            );
        }

        return Object.keys(groupedLogs).map(monthLabel => {
            const monthLogs = groupedLogs[monthLabel];
            const isOpen = expandedWpMonths.has(monthLabel);
            const totalMonthHours = monthLogs.reduce((sum: number, log: any) => sum + (Number(log.totalHours) || 0), 0);

            return (
                <div key={monthLabel} style={{ background: 'white', borderRadius: '4px', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                    <div onClick={() => toggleWpMonthAccordion(monthLabel)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid var(--mlab-border)' : 'none', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'var(--mlab-blue-light)', padding: '6px', borderRadius: '4px', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={16} color={'white'} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{monthLabel}</h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{monthLogs.length} Entry(s)</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Clock size={12} /> {totalMonthHours.toFixed(1)} hrs
                            </div>
                            {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                        </div>
                    </div>

                    {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', background: '#fafbfc' }}>
                            {monthLogs.map((log: any) => {
                                let statusBadge;
                                let statusBorderColor = 'var(--mlab-border)';

                                if (log.status === 'Draft') {
                                    statusBorderColor = '#cbd5e1';
                                    statusBadge = <span style={{ background: '#f8fafc', color: '#475569', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #cbd5e1', display: 'flex', gap: '4px', alignItems: 'center' }}><FileText size={10} /> Draft Entry</span>;
                                } else if (log.status === 'Pending_Mentor_Approval' || log.status === 'Pending') {
                                    statusBorderColor = '#fde68a';
                                    statusBadge = <span style={{ background: '#fffbeb', color: '#d97706', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #fde68a', display: 'flex', gap: '4px', alignItems: 'center' }}><Clock size={10} /> Pending Review</span>;
                                } else if (log.status === 'Approved') {
                                    statusBorderColor = '#bbf7d0';
                                    statusBadge = <span style={{ background: '#f0fdf4', color: '#15803d', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #bbf7d0', display: 'flex', gap: '4px', alignItems: 'center' }}><CheckCircle size={10} /> Approved</span>;
                                } else if (log.status === 'Rejected') {
                                    statusBorderColor = '#fca5a5';
                                    statusBadge = <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #fecaca', display: 'flex', gap: '4px', alignItems: 'center' }}><XCircle size={10} /> Needs Revision</span>;
                                }

                                // 🚀 RESOLVE ASSIGNED MENTOR NAME
                                const assignedMentorName =
                                    log.mentorName ||
                                    mentorsDict[log.mentorId]?.fullName ||
                                    mentorsDict[log.mentorId]?.firstName ||
                                    passedEmployer?.mentor?.fullName ||
                                    'Assigned Mentor';

                                // 🚀 RESOLVE VERIFIER / APPROVER NAME & TIMESTAMP
                                const verifierProfile = log.verifiedBy ? mentorsDict[log.verifiedBy] : null;
                                const verifierName =
                                    verifierProfile?.fullName ||
                                    verifierProfile?.firstName ||
                                    log.verifiedMentorName ||
                                    log.processedBy ||
                                    assignedMentorName;

                                return (
                                    <div key={log.id} style={{ background: 'white', border: `1px solid ${statusBorderColor}`, borderRadius: '4px', padding: '1.25rem', position: 'relative', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: MIDNIGHT, fontWeight: 800, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {moment(log.dateString).format('dddd, DD MMM YYYY')}
                                                    {statusBadge}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontWeight: 600 }}>
                                                    <Clock size={13} color="var(--mlab-blue)" /> {log.startTime} - {log.endTime} <span style={{ color: 'var(--mlab-green-dark)', fontWeight: 800 }}>({log.totalHours} hrs)</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* 🚀 MENTOR & APPROVER BADGES */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '0.85rem', fontSize: '0.78rem', color: '#475569', background: '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <UserCircle size={14} color="var(--mlab-blue)" />
                                                <span style={{ color: '#64748b' }}>Assigned Mentor:</span>
                                                <strong style={{ color: MIDNIGHT }}>{assignedMentorName}</strong>
                                            </div>

                                            {(log.status === 'Approved' || log.status === 'Rejected') && (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', borderLeft: '1px solid #cbd5e1', paddingLeft: '10px' }}>
                                                    <ShieldCheck size={14} color={log.status === 'Approved' ? '#16a34a' : '#dc2626'} />
                                                    <span style={{ color: '#64748b' }}>{log.status === 'Approved' ? 'Approved By:' : 'Reviewed By:'}</span>
                                                    <strong style={{ color: log.status === 'Approved' ? '#15803d' : '#991b1b' }}>{verifierName}</strong>
                                                    {log.verifiedAt && (
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 500 }}>
                                                            ({moment(log.verifiedAt).format('DD MMM YYYY, HH:mm')})
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {log.isQctoAligned && (
                                            <div style={{ fontSize: '0.8rem', color: '#0369a1', background: '#e0f2fe', padding: '6px 12px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '0.75rem', fontWeight: 700, border: '1px solid #bae6fd' }}>
                                                <BookOpen size={13} /> {log.workActivityCode}: {log.workActivityLabel}
                                            </div>
                                        )}

                                        <div
                                            style={{ margin: 0, fontSize: '0.85rem', color: '#334155', lineHeight: 1.6, background: '#f8fafc', padding: '12px', borderRadius: '4px', border: '1px solid #e2e8f0', maxHeight: '100px', overflow: 'hidden' }}
                                            className="quill-content-display"
                                            dangerouslySetInnerHTML={{ __html: log.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }}
                                        />

                                        {((log.customEvidenceTracking && log.customEvidenceTracking.length > 0) || log.evidenceUrl) && (
                                            <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                                {log.customEvidenceTracking?.length > 0 && (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4338ca', display: 'flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', padding: '4px 10px', borderRadius: '4px', border: '1px solid #c7d2fe' }}>
                                                        <FileCode size={12} /> {log.customEvidenceTracking.length} Evidence Artifacts
                                                    </span>
                                                )}
                                                {log.evidenceUrl && (
                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '4px 10px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                                        <Paperclip size={12} /> Global Attachment
                                                    </span>
                                                )}
                                            </div>
                                        )}

                                        {/* ACTION BUTTONS */}
                                        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
                                            {log.status === 'Draft' && (
                                                <button onClick={() => { setViewingLogEmployer(passedEmployer || null); onOpenLogModal(log); }}
                                                    style={{ background: '#f1f5f9', border: '1px solid #94a3b8', padding: '6px 14px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#334155', transition: 'all 0.2s' }}>
                                                    <Pencil size={13} /> Resume Draft
                                                </button>
                                            )}
                                            {log.status === 'Rejected' && (
                                                <button onClick={() => { setViewingLogEmployer(passedEmployer || null); onOpenLogModal(log); }}
                                                    style={{ background: '#ef4444', border: 'none', padding: '6px 14px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'white', transition: 'all 0.2s', boxShadow: '0 2px 4px rgba(239, 68, 68, 0.2)' }}>
                                                    <AlertTriangle size={13} /> Fix & Resubmit
                                                </button>
                                            )}
                                            <button onClick={() => { setViewingLogDetails(log); setViewingLogEmployer(passedEmployer || null); }}
                                                style={{ background: 'white', border: '1px solid #cbd5e1', padding: '6px 14px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: '#475569', transition: 'all 0.2s' }}>
                                                <Maximize2 size={13} /> View Log Details
                                            </button>
                                        </div>

                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        });
    };

    const hasPlacementEcosystem = learnerHasEmployer || placementsHistory.length > 0 || workplaceLogs.length > 0;

    return (
        <div className="ld-animate" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--mlab-green)" />
                        <stop offset="100%" stopColor="var(--mlab-green-dark)" />
                    </linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="100%" stopColor="#475569" />
                    </linearGradient>
                </defs>
            </svg>

            <style dangerouslySetInnerHTML={{
                __html: `
                .mc-cards-wrapper {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }
                .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 4px; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); }
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
                .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
                .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
                .mc-bars { display: flex; flex-direction: column; gap: 8px; }
                .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
                .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
                .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
                .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 4px; overflow: hidden; }
                .mc-fill { height: 100%; border-radius: 4px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
                .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
                .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
                .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
                
                .mc-k .mc-fill-primary { background: var(--mlab-green); }
                .mlab-table-wrap { border-radius: 4px !important; border: none !important; overflow: hidden; }

                .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
                .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
                .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
                .quill-content-display li { margin-bottom: 4px !important; }
                .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; transition: color 0.15s ease !important; }
                .quill-content-display a:hover { color: #1d4ed8 !important; }
            ` }} />

            {/* Shared detail preview modal */}
            {viewingLogDetails && (
                <WorkplaceLogViewerModal
                    log={viewingLogDetails}
                    allowEdit={true}
                    preloadedEmployer={viewingLogEmployer ? {
                        companyName: viewingLogEmployer.name,
                        address: viewingLogEmployer.physicalAddress || viewingLogEmployer.address || 'Address missing in system',
                        workTelephone: viewingLogEmployer.contactPhone || 'Phone unlisted',
                        email: viewingLogEmployer.contactEmail || 'Email unlisted'
                    } : null}
                    onEdit={(logToEdit) => {
                        setViewingLogDetails(null);
                        setViewingLogEmployer(null);
                        onOpenLogModal(logToEdit);
                    }}
                    onClose={() => {
                        setViewingLogDetails(null);
                        setViewingLogEmployer(null);
                    }}
                />
            )}

            {/* ── HEADER ── */}
            <div className="ld-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h2 className="ld-section-title"><CalendarCheck size={20} /> Compliance &amp; Attendance</h2>
                        <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', margin: '4px 0 0 28px' }}>
                            A complete history of your daily campus check-ins and structured workplace logbook entries.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── UNIFIED TABS ── */}
            <div className="lfm-tabs" style={{ marginBottom: 0 }}>
                <button className={`lfm-tab ${activeTab === 'campus' ? 'active' : ''}`} onClick={() => setActiveTab('campus')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}>
                    <CalendarCheck size={16} /> Campus Attendance
                </button>
                {hasPlacementEcosystem && (
                    <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')}>
                        <Briefcase size={16} /> Unified Workplace Logbook
                    </button>
                )}
            </div>

            {/* ════ CAMPUS ATTENDANCE VIEW ════ */}
            {activeTab === 'campus' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    <div className="mc-cards-wrapper">
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Attendance Ratio</div>
                                </div>
                                <Award size={20} color="var(--mlab-blue)" />
                            </div>
                            <div className="mc-pct" style={{ color: MIDNIGHT }}>{stats.ratio}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Tracked Sessions</div>
                                </div>
                                <CalendarCheck size={20} color="var(--mlab-blue)" />
                            </div>
                            <div className="mc-pct" style={{ color: MIDNIGHT }}>{stats.total}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Days Present</div>
                                </div>
                                <CheckCircle2 size={20} color="var(--mlab-green)" />
                            </div>
                            <div className="mc-pct" style={{ color: '#16a34a' }}>{stats.presentCount}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Days Absent</div>
                                </div>
                                <AlertTriangle size={20} color="var(--mlab-red)" />
                            </div>
                            <div className="mc-pct" style={{ color: '#dc2626' }}>{stats.absentCount}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '4px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', marginRight: 16, alignItems: 'center' }}>
                                <Layers size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px 0 32px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Registered Classes</option>
                                    {uniqueLedgerCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                                    <Calendar size={16} color="var(--mlab-grey)" />
                                    <select value={dateFilterMode} onChange={(e) => { setDateFilterMode(e.target.value as any); setDateSearch(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-grey)', fontWeight: 600, fontSize: '0.8rem', padding: '0 4px', cursor: 'pointer', textTransform: 'uppercase' }}>
                                        <option value="month">Month</option>
                                        <option value="week">Week</option>
                                        <option value="date">Day</option>
                                    </select>
                                </div>
                                <div style={{ width: '1px', height: '20px', background: 'var(--mlab-border)', margin: '0 6px' }} />
                                <input type={dateFilterMode} value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '4px', paddingRight: dateSearch ? '30px' : '12px' }} />
                                {dateSearch && <button className="ld-clear-btn" onClick={() => setDateSearch('')}><XCircle size={14} /></button>}
                            </div>
                        </div>

                        {/* FORMAT MODE TOGGLE SWITCH */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '6px', border: '1px solid var(--mlab-border)' }}>
                            <button
                                className={`ld-filter-chip ${attendanceMode === 'all' ? 'active' : ''}`}
                                style={{ borderRadius: '4px', padding: '4px 12px', fontSize: '0.75rem', background: attendanceMode === 'all' ? MIDNIGHT : 'transparent', color: attendanceMode === 'all' ? 'white' : 'var(--mlab-grey)' }}
                                onClick={() => setAttendanceMode('all')}
                            >
                                All Formats
                            </button>
                            <button
                                className={`ld-filter-chip ${attendanceMode === 'physical' ? 'active' : ''}`}
                                style={{ borderRadius: '4px', padding: '4px 12px', fontSize: '0.75rem', background: attendanceMode === 'physical' ? MIDNIGHT : 'transparent', color: attendanceMode === 'physical' ? 'white' : 'var(--mlab-grey)' }}
                                onClick={() => setAttendanceMode('physical')}
                            >
                                <MapPinCheck size={12} style={{ marginRight: '4px' }} /> Physical
                            </button>
                            <button
                                className={`ld-filter-chip ${attendanceMode === 'virtual' ? 'active' : ''}`}
                                style={{ borderRadius: '4px', padding: '4px 12px', fontSize: '0.75rem', background: attendanceMode === 'virtual' ? MIDNIGHT : 'transparent', color: attendanceMode === 'virtual' ? 'white' : 'var(--mlab-grey)' }}
                                onClick={() => setAttendanceMode('virtual')}
                            >
                                <MonitorCheck size={12} style={{ marginRight: '4px' }} /> Virtual (Zoom)
                            </button>
                        </div>

                        {/* STATUS FILTER CHIPS */}
                        <div className="ld-filter-chips">
                            <button className={`ld-filter-chip ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>All Statuses</button>
                            <button className={`ld-filter-chip ${filterStatus === 'present' ? 'active' : ''}`} onClick={() => setFilterStatus('present')}>Present</button>
                            <button className={`ld-filter-chip ${filterStatus === 'absent' ? 'active' : ''}`} onClick={() => setFilterStatus('absent')}>Absent Only</button>
                        </div>
                    </div>

                    <div className="mlab-table-wrap" style={{ border: '1px solid var(--mlab-border)', background: 'white' }}>
                        <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                            <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                {attendanceMode === 'virtual' ? (
                                    <tr>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Session Date</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Session Details &amp; Topic</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Status</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', textAlign: 'center' }}>Time Attended</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', textAlign: 'center' }}>Session Duration</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', textAlign: 'center' }}>Compliance &amp; Recording</th>
                                    </tr>
                                ) : attendanceMode === 'physical' ? (
                                    <tr>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Session Date</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Enrolled Cohort</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Status</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Check In</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Lunch Out</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Lunch In</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Check Out</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Session Date</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Session Details &amp; Topic</th>
                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none' }}>Status</th>
                                        <th colSpan={4} style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', textAlign: 'center' }}>Session Timings &amp; Compliance Metrics</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {finalFilteredDisplayLedger.length === 0 ? (
                                    <tr>
                                        <td colSpan={attendanceMode === 'virtual' ? 6 : 7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <Calendar size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>No attendance records match your current filters.</p>
                                        </td>
                                    </tr>
                                ) : (
                                    finalFilteredDisplayLedger.map((record, idx) => {
                                        const title = record.sessionTitle || record.title;
                                        const desc = record.sessionDescription || record.description;
                                        const videoLink = record.sessionZoomLink || record.zoomLink || record.videoLink;

                                        return (
                                            <tr key={idx} style={{ background: record.type === 'absent' || record.virtualStatus === 'Absent' ? '#fef2f2' : 'white' }}>
                                                <td><strong style={{ color: MIDNIGHT }}>{moment(record.dateObj).format('ddd, DD MMM YYYY')}</strong></td>

                                                <td>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: MIDNIGHT, letterSpacing: '0.02em' }}>
                                                                {record.cohortName}
                                                            </span>
                                                            {record.type === 'virtual' && (
                                                                <span style={{ fontSize: '0.62rem', background: '#f5f3ff', color: '#7c3aed', padding: '1px 6px', fontWeight: 800, border: '1px solid #ddd6fe', borderRadius: '4px', textTransform: 'uppercase' }}>
                                                                    Virtual Session
                                                                </span>
                                                            )}
                                                        </div>

                                                        {title && (
                                                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                                                                {title}
                                                            </span>
                                                        )}

                                                        {desc && (
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', maxWidth: '280px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={desc}>
                                                                {desc}
                                                            </span>
                                                        )}

                                                        {videoLink && (
                                                            <div style={{ marginTop: '2px' }}>
                                                                <a
                                                                    href={videoLink}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                        fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none',
                                                                        marginTop: '2px', fontWeight: 600
                                                                    }}
                                                                >
                                                                    <Video size={12} /> View Recording / Link
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>

                                                <td>
                                                    {record.type === 'virtual' ? (
                                                        <span className="ld-badge" style={{
                                                            background: record.virtualStatus === 'Present' ? '#dcfce7' : record.virtualStatus === 'Partial' ? '#fef3c7' : '#fee2e2',
                                                            color: record.virtualStatus === 'Present' ? '#166534' : record.virtualStatus === 'Partial' ? '#b45309' : '#991b1b',
                                                            border: `1px solid ${record.virtualStatus === 'Present' ? '#bbf7d0' : record.virtualStatus === 'Partial' ? '#fde68a' : '#fecaca'}`
                                                        }}>
                                                            {record.virtualStatus === 'Present' ? <CheckCircle size={10} /> : record.virtualStatus === 'Partial' ? <AlertCircle size={10} /> : <AlertTriangle size={10} />}
                                                            {record.virtualStatus} (Virtual)
                                                        </span>
                                                    ) : record.type === 'present' ? (
                                                        <span className="ld-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={10} /> Present</span>
                                                    ) : (
                                                        <span className="ld-badge" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}><AlertTriangle size={10} /> Absent</span>
                                                    )}
                                                </td>

                                                {attendanceMode === 'virtual' ? (
                                                    <>
                                                        <td style={{ textAlign: 'center', fontWeight: 700, color: record.virtualStatus === 'Absent' ? '#dc2626' : MIDNIGHT }}>{record.actualDuration} mins</td>
                                                        <td style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>{record.expectedDuration} mins</td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--mlab-border)', background: '#f8fafc', color: record.virtualStatus === 'Present' ? '#16a34a' : record.virtualStatus === 'Partial' ? '#ea580c' : '#dc2626' }}>
                                                                    {record.expectedDuration > 0 ? Math.round((record.actualDuration / record.expectedDuration) * 100) : 0}% Compliance
                                                                </span>
                                                                {videoLink && (
                                                                    <a
                                                                        href={videoLink}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                            fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none',
                                                                            fontWeight: 600
                                                                        }}
                                                                    >
                                                                        <Video size={12} /> View Recording / Link
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : record.type === 'absent' ? (
                                                    <td colSpan={4} style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '0.85rem' }}>No scans recorded for this session. A compliance deduction penalty has been applied.</td>
                                                ) : record.type === 'virtual' ? (
                                                    <td colSpan={4} style={{ textAlign: 'center', background: '#f8fafc', color: 'var(--mlab-midnight)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '0.85rem', fontWeight: 600, flexWrap: 'wrap' }}>
                                                            <Video size={14} color="var(--mlab-blue)" />
                                                            Zoom Session Attended:
                                                            <span style={{ color: record.virtualStatus === 'Present' ? '#16a34a' : record.virtualStatus === 'Partial' ? '#ea580c' : '#dc2626' }}>
                                                                {record.actualDuration} / {record.expectedDuration} mins
                                                            </span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', background: 'white', padding: '2px 8px', borderRadius: '4px', border: '1px solid var(--mlab-border)' }}>
                                                                {record.expectedDuration > 0 ? Math.round((record.actualDuration / record.expectedDuration) * 100) : 0}% Compliance
                                                            </span>
                                                            {videoLink && (
                                                                <a
                                                                    href={videoLink}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                        fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none',
                                                                        fontWeight: 600
                                                                    }}
                                                                >
                                                                    <Video size={12} /> View Recording / Link
                                                                </a>
                                                            )}
                                                        </div>
                                                    </td>
                                                ) : (
                                                    <>
                                                        <td>{record.checkInAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#16a34a" /> {moment(record.checkInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                        <td>{record.lunchOutAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchOutAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                        <td>{record.lunchInAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                        <td>{record.checkOutAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#dc2626" style={{ transform: 'rotate(180deg)' }} /> {moment(record.checkOutAt).format('HH:mm')}</span> : <span className="ld-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '2px 6px', fontSize: '0.7rem' }}>Missed</span>}</td>
                                                    </>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════ WORKPLACE LOGS VIEW (UNIFIED WITH EMPLOYERS) ════ */}
            {activeTab === 'workplace' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* LOGBOOK HOURS TRACKER & STIPEND ROW USING MLAB CARDS */}
                    <div className="mc-cards-wrapper">

                        {/* Hours Tracker Card */}
                        <div className="mc mc-k">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Workplace</div>
                                    <div className="mc-title">
                                        {selectedPlacementFilter !== 'all'
                                            ? `Logbook Tracker (${placementOptions.find(o => o.id === selectedPlacementFilter)?.empName || 'Filtered'})`
                                            : 'Logbook Hours Tracker (Overall)'}
                                    </div>
                                </div>
                                <button
                                    className="mlab-btn mlab-btn--primary"
                                    onClick={() => {
                                        const activePlacement = placementsHistory.find(p => ['active placement', 'active', 'pending match'].includes(String(p.status).toLowerCase())) || placementsHistory[0];
                                        onOpenLogModal(undefined, activePlacement ? {
                                            placementId: activePlacement.placementId,
                                            employerId: activePlacement.employer?.id,
                                            mentorId: activePlacement.mentor?.id,
                                            cohortId: activePlacement.cohortId
                                        } : undefined);
                                    }}
                                    style={{ border: 'none', padding: '6px 16px', fontSize: '0.75rem', height: 'auto' }}
                                >
                                    <CheckSquare size={14} /> Log Hours
                                </button>
                            </div>

                            <div className="mc-bars">
                                <div className="mc-bar-meta">
                                    <span className="mc-bar-lbl">Progress to 1600 Hrs</span>
                                    <span className="mc-bar-val">{hoursStats.progressPct}%</span>
                                </div>
                                <div className="mc-track">
                                    <div className="mc-fill mc-fill-primary" style={{ width: `${hoursStats.progressPct}%` }} title="Approved" />
                                </div>
                            </div>

                            <div className="mc-footer" style={{ borderTop: 'none', paddingTop: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', width: '100%', marginTop: 'auto' }}>
                                <div>
                                    <div style={{ fontSize: "0.65rem", color: "#166534", fontWeight: 700, marginBottom: '2px' }}>APPROVED</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#166534" }}>{hoursStats.approvedWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                                <div style={{ borderLeft: '1px solid var(--mlab-border)', paddingLeft: '8px' }}>
                                    <div style={{ fontSize: "0.65rem", color: "#b45309", fontWeight: 700, marginBottom: '2px' }}>PENDING</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#b45309" }}>{hoursStats.pendingWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                                <div style={{ borderLeft: '1px solid var(--mlab-border)', paddingLeft: '8px' }}>
                                    <div style={{ fontSize: "0.65rem", color: "var(--mlab-red)", fontWeight: 700, marginBottom: '2px' }}>REJECTED</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--mlab-red)" }}>{hoursStats.rejectedWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Stipend Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Finance &amp; Rebates</div>
                                    <div className="mc-title">Earned This Month</div>
                                </div>
                                <Landmark size={20} color="var(--mlab-blue)" />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
                                <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', fontSize: '2rem' }}>
                                    {isEmploymentLoading || isHolidaysLoading ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', color: '#64748b' }}>
                                            <Loader2 size={14} className="animate-spin" /> Verifying...
                                        </span>
                                    ) : formatCurrency(stats.currentMonthEarnedStipend)}
                                </h3>
                                {!isEmploymentLoading && !isHolidaysLoading && stats.currentMonthEarnedStipend < stats.baseStipendUsed && (
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                                        {formatCurrency(stats.baseStipendUsed)}
                                    </span>
                                )}
                            </div>

                            <div className="mc-footer" style={{ marginTop: 'auto' }}>
                                <span className="mc-status" style={{ color: stats.currentMonthEarnedStipend < stats.baseStipendUsed ? '#dc2626' : '#16a34a' }}>
                                    <Calendar size={12} />
                                    {isHolidaysLoading ? 'Calculating Days...' : `${stats.currentMonthApprovedDays} / ${stats.expectedWorkingDaysThisMonth} Days Logged`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* SEARCH & FILTERS TOOLBAR WITH PROGRAMME & MENTOR DROPDOWNS */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '4px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', flex: 1, minWidth: '220px', alignItems: 'center' }}>
                                <Search size={16} style={{ marginLeft: '12px', color: 'var(--mlab-grey)' }} />
                                <input type="text" placeholder="Search tasks, codes, or topics..." value={wpSearch} onChange={(e) => setWpSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '8px' }} />
                                {wpSearch && <button className="ld-clear-btn" onClick={() => setWpSearch('')}><XCircle size={14} /></button>}
                            </div>

                            {/* PROGRAMME / PLACEMENT SPECIFIC FILTER */}
                            {placementsHistory.length > 0 && (
                                <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '200px', alignItems: 'center' }}>
                                    <Briefcase size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                    <select
                                        value={selectedPlacementFilter}
                                        onChange={(e) => setSelectedPlacementFilter(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}
                                    >
                                        <option value="all">All Programmes</option>
                                        {placementOptions.map(opt => (
                                            <option key={opt.id} value={opt.id}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* 🚀 MENTOR SPECIFIC FILTER DROPDOWN */}
                            {mentorOptions.length > 0 && (
                                <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '180px', alignItems: 'center' }}>
                                    <Users size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                    <select
                                        value={selectedMentorFilter}
                                        onChange={(e) => setSelectedMentorFilter(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}
                                    >
                                        <option value="all">All Mentors</option>
                                        {mentorOptions.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '140px', alignItems: 'center' }}>
                                <Calendar size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={wpMonthFilter} onChange={(e) => setWpMonthFilter(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Months</option>
                                    {wpAvailableMonths.map(month => <option key={month} value={month}>{moment(month, 'YYYY-MM').format('MMMM YYYY')}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="ld-filter-chips">
                            <button className={`ld-filter-chip ${wpStatusFilter === 'all' ? 'active' : ''}`} onClick={() => setWpStatusFilter('all')}>All Statuses</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Draft' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Draft')}>Drafts</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Pending_Mentor_Approval' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Pending_Mentor_Approval')}>Pending</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Approved' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Approved')}>Approved</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Rejected' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Rejected')}>Rejected</button>
                        </div>
                    </div>

                    {/* UNIFIED EMPLOYMENT & LOGS ACCORDIONS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {isEmploymentLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                                <Loader2 size={32} className="animate-spin" color="var(--mlab-blue)" />
                            </div>
                        ) : displayedMappedPlacements.length === 0 && unassignedLogs && Object.keys(unassignedLogs).length === 0 ? (
                            <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '4px', border: '1px solid var(--mlab-border)' }}>
                                <History size={48} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT }}>No Entries Found</h3>
                                <p style={{ color: 'var(--mlab-grey)', margin: 0, fontSize: '0.9rem', textTransform: 'none' }}>No logbook or employment records match your current filters.</p>
                            </div>
                        ) : (
                            <>
                                {displayedMappedPlacements.map((place: any, idx: number) => {
                                    const isActive = ['active placement', 'active', 'pending match'].includes(String(place.status).toLowerCase());
                                    const isEmpExpanded = expandedEmployers.has(place.placementId);

                                    return (
                                        <div key={place.placementId || idx} style={{ background: 'white', borderRadius: '4px', border: `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

                                            {/* Employer Header / Trigger */}
                                            <div onClick={() => toggleEmployerAccordion(place.placementId)} style={{ padding: '1.25rem', background: isActive ? '#f0fdf4' : '#f8fafc', borderBottom: isEmpExpanded ? `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ background: isActive ? '#166534' : 'var(--mlab-midnight)', padding: '10px', borderRadius: '4px', color: 'white' }}>
                                                        <Building2 size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: isActive ? '#14532d' : MIDNIGHT, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            {place.employer?.name || 'Registered Host Employer'}
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isActive ? '#166534' : 'var(--mlab-grey)', opacity: 0.8, textTransform: 'none' }}>
                                                                ({place.startDate ? moment(place.startDate).format('YYYY') : ''} Term)
                                                            </span>
                                                            <span style={{
                                                                background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#166534' : '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: `1px solid ${isActive ? '#86efac' : '#cbd5e1'}`
                                                            }}>
                                                                {isActive ? 'Active Placement' : 'Past Placement'}
                                                            </span>
                                                        </h3>
                                                        <div style={{ fontSize: '0.8rem', color: isActive ? '#166534' : 'var(--mlab-grey)', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Calendar size={12} />
                                                            Started: {place.startDate ? moment(place.startDate).format('DD MMM YYYY') : 'Unknown'}
                                                            {place.endDate && ` - Ended: ${moment(place.endDate).format('DD MMM YYYY')}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {/* ADD LOGBOOK ENTRY BUTTON */}
                                                    {isActive && (
                                                        <button
                                                            className="mlab-btn mlab-btn--primary"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onOpenLogModal(undefined, {
                                                                    placementId: place.placementId,
                                                                    employerId: place.employer?.id,
                                                                    mentorId: place.mentor?.id,
                                                                    cohortId: place.cohortId
                                                                });
                                                            }}
                                                            style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto', marginRight: '8px' }}
                                                        >
                                                            <Plus size={14} /> Add Entry
                                                        </button>
                                                    )}
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                        {place.logs.length} Total Log(s)
                                                    </span>
                                                    {isEmpExpanded ? <ChevronUp size={20} color={MIDNIGHT} /> : <ChevronDown size={20} color={MIDNIGHT} />}
                                                </div>
                                            </div>

                                            {/* Employer Body */}
                                            {isEmpExpanded && (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>

                                                    {/* Company Metadata Row as mc-cards */}
                                                    <div className="mc-cards-wrapper" style={{ padding: '1.25rem', margin: 0, borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                                                        <div className="mc" style={{ padding: '1rem' }}>
                                                            <div className="mc-hdr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                                <div>
                                                                    <div className="mc-label">Organization Details</div>
                                                                    <div className="mc-title" style={{ fontSize: '0.9rem' }}>Contact Info</div>
                                                                </div>
                                                                <MapPin size={18} color="var(--mlab-blue)" />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <Phone size={14} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
                                                                    <span>{place.employer?.contactPhone || 'Phone unlisted'}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <Mail size={14} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
                                                                    <span>{place.employer?.contactEmail || 'Email unlisted'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* WORKPLACE SUPERVISION TEAM CARD (PRIMARY + CO-MENTORS) */}
                                                        <div className="mc" style={{ padding: '1rem' }}>
                                                            <div className="mc-hdr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                                <div>
                                                                    <div className="mc-label">Workplace Supervision</div>
                                                                    <div className="mc-title" style={{ fontSize: '0.9rem' }}>Supervision Team</div>
                                                                </div>
                                                                <UserCircle size={18} color="var(--mlab-blue)" />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>

                                                                {/* Primary Mentor Details */}
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#334155' }}>
                                                                        <UserCircle size={14} color="#0284c7" />
                                                                        <strong style={{ color: MIDNIGHT }}>Primary:</strong>
                                                                        <span>{place.mentor?.fullName || place.mentor?.firstName || 'Pending Assignment'}</span>
                                                                    </div>
                                                                    {place.mentor && (place.mentor.email || place.mentor.phone) && (
                                                                        <div style={{ fontSize: '0.75rem', color: '#64748b', paddingLeft: '20px' }}>
                                                                            {place.mentor.email} {place.mentor.phone ? `• ${place.mentor.phone}` : ''}
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {/* Secondary Co-Mentors / Backup Supervisors */}
                                                                {place.secondaryMentors && place.secondaryMentors.length > 0 && (
                                                                    <div style={{ borderTop: '1px dashed #e2e8f0', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <Users size={12} color="#6366f1" /> Co-Mentors / Secondary Supervisors:
                                                                        </div>
                                                                        {place.secondaryMentors.map((secM: any) => (
                                                                            <div key={secM.id} style={{ fontSize: '0.78rem', color: '#334155', background: '#f8fafc', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}>
                                                                                <div style={{ fontWeight: 600, color: MIDNIGHT }}>{secM.fullName}</div>
                                                                                {(secM.email || secM.phone) && (
                                                                                    <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                                        {secM.email} {secM.phone ? `• ${secM.phone}` : ''}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Logs mapped to this placement */}
                                                    <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
                                                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: MIDNIGHT, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <FileText size={14} color="var(--mlab-blue)" /> Logbook Entries for this Placement
                                                        </h4>

                                                        {renderLogsGroupedByMonth(place.groupedLogs, place.employer)}
                                                    </div>

                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* ─── UNASSIGNED / FALLBACK LOGS ─── */}
                                {selectedPlacementFilter === 'all' && unassignedLogs && Object.keys(unassignedLogs).length > 0 && (
                                    <div style={{ background: 'white', borderRadius: '4px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginTop: '1rem' }}>
                                        <div style={{ padding: '1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: '#e2e8f0', padding: '10px', borderRadius: '4px', color: '#475569' }}>
                                                    <Layers size={20} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#334155', fontFamily: 'var(--font-heading)' }}>
                                                        General / Unassigned Logs
                                                    </h3>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '4px', fontWeight: 500 }}>
                                                        Logs not directly linked to a specific employer contract timeline.
                                                    </div>
                                                </div>
                                            </div>
                                            {hasPlacementEcosystem && (
                                                <button
                                                    className="mlab-btn mlab-btn--outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenLogModal();
                                                    }}
                                                    style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto' }}
                                                >
                                                    <Plus size={14} /> Add Unassigned Entry
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
                                            {renderLogsGroupedByMonth(unassignedLogs, null)}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};