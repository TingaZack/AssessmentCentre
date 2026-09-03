// src/pages/CohortDetailsPage/views/BootcampCohortView.tsx

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, Mail, Phone, DownloadCloud, UploadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    Search, X, Info, BarChart2, UserMinus, Edit2, Loader2, Video, History,
    ChevronDown, ChevronUp, MapPin, Filter, ChevronRight, Globe,
    Timer, PenTool, BookOpen, Award, ShieldCheck,
    FileText, Briefcase, AlertTriangle, ClipboardList, HelpCircle, Star, Eye, Link as LinkIcon, Trash2, MinusCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, increment, getDoc, deleteDoc } from 'firebase/firestore';

import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useToast, ToastContainer } from '../../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../../types';
import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
import { LearnerDropoutModal } from './LearnerDropoutModal';
import moment from 'moment';
import Loader from '../../common/Loader/Loader';
import { WorkplacePlacementModal } from '../../admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { SessionAudienceModal } from '../attendance/SessionAudienceModal';
import { ZoomAttendanceDropZone } from '../attendance/ZoomAttendanceDropZone';
import { CohortGeoMap, getLocationString, extractGeoLevels } from '../../../components/common/CohortMap/CohortGeoMap';
import { AdvancedMapFilters, type AdvancedMapFilterState } from '../../../components/common/CohortMap/AdvancedMapFilters';
import { ExportAnalyticsModal } from '../../../components/common/ExportModal/ExportAnalyticsModal';

// ─── UTILS ─────────────────────────────────────────────────────────

const getTimestampMs = (val: any): number => {
    if (!val) return 0;
    if (typeof val?.toDate === 'function') return val.toDate().getTime();
    if (val?.seconds) return val.seconds * 1000;
    const t = new Date(val).getTime();
    return isNaN(t) ? 0 : t;
};

const formatLastLogin = (lastLoginAt: any): string => {
    const ms = getTimestampMs(lastLoginAt);
    if (!ms) return 'Never';

    const date = new Date(ms);
    return date.toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const getAgeFromId = (idNumber: string): number | null => {
    if (!idNumber || idNumber.length < 6) return null;
    const yearStr = idNumber.substring(0, 2);
    const monthStr = idNumber.substring(2, 4);
    const dayStr = idNumber.substring(4, 6);
    const currentYear = new Date().getFullYear();
    let year = parseInt(yearStr, 10);
    year += (year > currentYear % 100) ? 1900 : 2000;
    const birthDate = new Date(year, parseInt(monthStr, 10) - 1, parseInt(dayStr, 10));
    if (isNaN(birthDate.getTime())) return null;
    const ageDiffMs = Date.now() - birthDate.getTime();
    const ageDate = new Date(ageDiffMs);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
};

const renderWithdrawalEmailBadge = (learner: any) => {
    if (learner.status !== 'dropped') {
        return <span style={{ color: 'var(--mlab-grey)' }}>—</span>;
    }

    const emailStatus = learner.withdrawalEmailStatus;
    const targetEmail = learner.email || learner.demographics?.learnerEmailAddress;
    const hasEmail = Boolean(targetEmail?.trim());

    if (!hasEmail) {
        return (
            <span title="No email address found on profile" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', textTransform: 'uppercase', borderRadius: 0 }}>
                <AlertTriangle size={10} /> No Email
            </span>
        );
    }

    if (emailStatus?.sent === true) {
        return (
            <span title={`Successfully delivered to ${emailStatus.recipient || targetEmail}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', textTransform: 'uppercase', borderRadius: 0 }}>
                <CheckCircle2 size={10} /> Email Sent
            </span>
        );
    }

    if (emailStatus?.error) {
        return (
            <span title={`Delivery Error: ${emailStatus.error}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', textTransform: 'uppercase', borderRadius: 0 }}>
                <AlertTriangle size={10} /> Failed
            </span>
        );
    }

    return (
        <span title="Exit survey email has not been sent yet" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', fontSize: '0.65rem', fontWeight: 700, background: '#f8fafc', color: '#64748b', border: '1px solid #cbd5e1', textTransform: 'uppercase', borderRadius: 0 }}>
            <Mail size={10} /> Unsent
        </span>
    );
};

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────

export const BootcampCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

    const { user, learners, fetchLearners } = useStore();

    useEffect(() => {
        if (fetchLearners) {
            fetchLearners(true);
        }
    }, [fetchLearners]);

    // UI & TAB STATES
    const activeTab = (searchParams.get('tab') as 'learners' | 'calendar' | 'attendance' | 'surveys') || 'learners';
    const [isMatrixExpanded, setIsMatrixExpanded] = useState(true);
    const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState(false);
    const [showKPIs, setShowKPIs] = useState(true);
    const [showZoomUploadModal, setShowZoomUploadModal] = useState(false);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);
    const [showExportAnalyticsModal, setShowExportAnalyticsModal] = useState(false);

    // FILTER STATES
    const urlSearchTerm = searchParams.get('search') || '';
    const statusFilter = (searchParams.get('status') as 'all' | 'active' | 'dropped') || 'all';
    const attendanceFilter = searchParams.get('attendance') || 'all';
    const activationFilter = (searchParams.get('activation') as 'all' | 'activated' | 'never') || 'all';
    const locationFilter = searchParams.get('location') || 'all';
    const customMinPct = searchParams.get('minPct') !== null ? Number(searchParams.get('minPct')) : '';
    const customMaxPct = searchParams.get('maxPct') !== null ? Number(searchParams.get('maxPct')) : '';
    const exitEmailFilter = searchParams.get('exitEmail') || 'all';

    const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);
    const [selectedMapLocation, setSelectedMapLocation] = useState<string | null>(locationFilter === 'all' ? null : locationFilter);

    useEffect(() => {
        setSelectedMapLocation(locationFilter === 'all' ? null : locationFilter);
    }, [locationFilter]);

    useEffect(() => {
        setLocalSearchTerm(urlSearchTerm);
    }, [urlSearchTerm]);

    const updateUrlParams = useCallback((updates: Record<string, string | number | null>) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null || value === '' || value === 'all') {
                    newParams.delete(key);
                } else {
                    newParams.set(key, String(value));
                }
            });
            return newParams;
        }, { replace: true });
    }, [setSearchParams]);

    useEffect(() => {
        const handler = setTimeout(() => {
            updateUrlParams({ search: localSearchTerm || null });
        }, 400);
        return () => clearTimeout(handler);
    }, [localSearchTerm, updateUrlParams]);

    // PAGINATION
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    useEffect(() => {
        setCurrentPage(1);
    }, [urlSearchTerm, statusFilter, attendanceFilter, activationFilter, locationFilter, customMinPct, customMaxPct, exitEmailFilter]);

    const setActiveTab = (tab: 'learners' | 'calendar' | 'attendance' | 'surveys') => updateUrlParams({ tab });
    const handleMapLocationSelect = (loc: string | null) => updateUrlParams({ location: loc, tab: 'learners' });

    // MODAL & ACTION STATES
    const [selectedSessionForAudience, setSelectedSessionForAudience] = useState<any | null>(null);
    const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);
    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const [editingLog, setEditingLog] = useState<any | null>(null);
    const [editLogTitle, setEditLogTitle] = useState('');
    const [editLogDesc, setEditLogDesc] = useState('');
    const [editLogZoomLink, setEditLogZoomLink] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [promotingLearners, setPromotingLearners] = useState<any[] | null>(null);
    const [promoteCohortId, setPromoteCohortId] = useState('');
    const [isPromoting, setIsPromoting] = useState(false);
    const [autoSendInvite, setAutoSendInvite] = useState(true);

    const [calendarMonth, setCalendarMonth] = useState(moment());
    const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
    const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

    // DATA STATES
    const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
    const [enrolledLearners, setEnrolledLearners] = useState<DashboardLearner[]>([]);
    const [cohortAnalytics, setCohortAnalytics] = useState<any>(null);
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);
    const [submissions, setSubmissions] = useState<any[]>([]);
    const [isGrantingTime, setIsGrantingTime] = useState(false);

    // SURVEY STATES
    const [surveySubTab, setSurveySubTab] = useState<'templates' | 'responses'>('templates');
    const [rawAllSurveyResponses, setRawAllSurveyResponses] = useState<any[]>([]);
    const [cohortSurveyResponses, setCohortSurveyResponses] = useState<any[]>([]);
    const [surveyTemplates, setSurveyTemplates] = useState<any[]>([]);
    const [viewingSurveyResponse, setViewingSurveyResponse] = useState<any | null>(null);
    const [surveySearchQuery, setSurveySearchQuery] = useState('');

    const [attendanceBands] = useState([
        { id: 'pct_0', min: 0, max: 0, label: 'No Attendance / Not Started (0%)', color: '#94a3b8' },
        { id: 'pct_1_49', min: 1, max: 49, label: 'Critical Risk (1% - 49%)', color: '#ef4444' },
        { id: 'pct_50_59', min: 50, max: 59, label: 'Low Engagement (50% - 59%)', color: '#f97316' },
        { id: 'pct_60_69', min: 60, max: 69, label: 'Moderate Engagement (60% - 69%)', color: '#facc15' },
        { id: 'pct_70_79', min: 70, max: 79, label: 'Satisfactory (70% - 79%)', color: '#3b82f6' },
        { id: 'pct_80_89', min: 80, max: 89, label: 'High Compliance (80% - 89%)', color: '#22c55e' },
        { id: 'pct_90_100', min: 90, max: 100, label: 'Exceptional (90%+)', color: '#15803d' }
    ]);

    const isAdmin = user?.role === 'admin';
    const storeCohorts = (useStore(s => (s as any).cohorts) || []) as any[];
    const activeCohorts = storeCohorts.filter(c => !c.isArchived);

    // ─── DATA FETCHING EFFECTS ───
    useEffect(() => {
        if (!cohort?.id) return;
        const qRecords = query(collection(db, 'attendance_records'), where('cohortId', '==', cohort.id));
        const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
            setAttendanceRecords(snapshot.docs.map(doc => doc.data()));
        });
        return () => unsubscribeRecords();
    }, [cohort]);

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'attendance_logs'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logs.sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
            setAttendanceLogs(logs);
        });
        return () => unsubscribe();
    }, [cohort]);

    useEffect(() => {
        if (!cohort?.id) return;
        const qEnrollments = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(qEnrollments, (snapshot) => {
            setLiveEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [cohort?.id]);

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error('Error fetching submissions:', error);
        });
        return () => unsubscribe();
    }, [cohort?.id]);

    // Robust Survey Fetching Strategy
    useEffect(() => {
        const unsubResponses = onSnapshot(collection(db, 'survey_responses'), (snap) => {
            setRawAllSurveyResponses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        const unsubSurveys = onSnapshot(collection(db, 'surveys'), (snap) => {
            setSurveyTemplates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubResponses();
            unsubSurveys();
        };
    }, []);

    // ─── DERIVED DATA & ANALYTICS ───
    useEffect(() => {
        if (!cohort?.id || learners.length === 0) return;

        const uniqueMap = new Map<string, DashboardLearner>();

        liveEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile) {
                uniqueMap.set(profile.idNumber || profile.id, {
                    ...profile,
                    ...enrollment,
                    id: profile.id,
                    demographics: { ...profile.demographics, ...(enrollment.demographics || {}) },
                    enrollmentId: enrollment.id,
                    learnerId: profile.id,
                    status: enrollment.status || profile.status
                } as DashboardLearner);
            }
        });

        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && !uniqueMap.has(profile.idNumber || profile.id)) {
                uniqueMap.set(profile.idNumber || profile.id, { ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        const compiledRoster = Array.from(uniqueMap.values()).sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
        setEnrolledLearners(compiledRoster);
    }, [learners, liveEnrollments, cohort]);

    // Match Responses specifically to THIS cohort's roster
    useEffect(() => {
        if (!cohort?.id || enrolledLearners.length === 0) return;

        const cohortLearnerIds = new Set(enrolledLearners.map(l => l.learnerId || l.id));
        const cohortLearnerEmails = new Set(
            enrolledLearners.map(l => String(l.email || l.demographics?.learnerEmailAddress || '').toLowerCase()).filter(e => e)
        );

        const matchedResponses = rawAllSurveyResponses.filter(r => {
            if (r.cohortId === cohort.id) return true; // Direct Match
            if (r.learnerId && cohortLearnerIds.has(r.learnerId)) return true; // ID Match
            if (r.learnerEmail && cohortLearnerEmails.has(String(r.learnerEmail).toLowerCase())) return true; // Email Match (Public links)
            return false;
        });

        matchedResponses.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        setCohortSurveyResponses(matchedResponses);
    }, [rawAllSurveyResponses, cohort?.id, enrolledLearners]);

    const activeCount = useMemo(() => cohortAnalytics?.systemActiveCount || enrolledLearners.filter(l => l.status !== 'dropped').length, [cohortAnalytics, enrolledLearners]);

    const calendarGrid = useMemo(() => {
        const startDay = calendarMonth.clone().startOf('month').startOf('week');
        const endDay = calendarMonth.clone().endOf('month').endOf('week');
        const day = startDay.clone().subtract(1, 'day');
        const grid = [];
        while (day.isBefore(endDay, 'day')) grid.push(day.add(1, 'day').clone());
        return grid;
    }, [calendarMonth]);

    const processedAttendanceLogs = useMemo(() => {
        const unrolled: any[] = [];
        attendanceLogs.forEach((log) => {
            if (Array.isArray(log.sessions) && log.sessions.length > 0) {
                log.sessions.forEach((sub: any, subIdx: number) => {
                    unrolled.push({
                        ...log, ...sub,
                        id: sub.id || `${log.id}_sub_${subIdx}`,
                        parentLogId: log.id,
                        subIndex: subIdx,
                        sessionDate: sub.sessionDate || sub.startTime || log.sessionDate,
                        startTime: sub.startTime || sub.sessionTime || log.sessionDate,
                    });
                });
            } else {
                unrolled.push(log);
            }
        });

        const dayMap = new Map<string, any[]>();
        unrolled.forEach(item => {
            const dateKey = item.sessionDate ? String(item.sessionDate).split('T')[0] : 'unknown';
            if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
            dayMap.get(dateKey)!.push(item);
        });

        dayMap.forEach((daySessions) => {
            daySessions.sort((a, b) => {
                const tA = new Date(a.startTime || a.sessionDate || a.createdAt || 0).getTime();
                const tB = new Date(b.startTime || b.sessionDate || b.createdAt || 0).getTime();
                if (tA !== tB) return tA - tB;
                return (a.subIndex ?? 0) - (b.subIndex ?? 0);
            });
            const totalForDay = daySessions.length;
            daySessions.forEach((session, idx) => {
                session.sessionNumber = idx + 1;
                session.totalDaySessions = totalForDay;
            });
        });

        unrolled.sort((a, b) => {
            const dateA = a.sessionDate ? a.sessionDate.split('T')[0] : '';
            const dateB = b.sessionDate ? b.sessionDate.split('T')[0] : '';
            if (dateA !== dateB) return dateB.localeCompare(dateA);
            return (a.sessionNumber || 0) - (b.sessionNumber || 0);
        });

        return unrolled;
    }, [attendanceLogs]);

    const logsByDate = useMemo(() => {
        const map = new Map<string, any[]>();
        processedAttendanceLogs.forEach(log => {
            if (!log.sessionDate) return;
            const d = log.sessionDate.split('T')[0];
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(log);
        });
        return map;
    }, [processedAttendanceLogs]);

    useEffect(() => {
        if (enrolledLearners.length === 0) return;

        const map = new Map<string, { attended: number; totalValid: number; exempt: number; pct: number; totalMinutes: number }>();
        const totalSessions = processedAttendanceLogs.length;

        attendanceRecords.forEach(rec => {
            if (!rec.learnerId) return;
            if (!map.has(rec.learnerId)) {
                map.set(rec.learnerId, { attended: 0, totalValid: totalSessions, exempt: 0, pct: 0, totalMinutes: 0 });
            }
            const entry = map.get(rec.learnerId)!;

            if (rec.status === 'Exempt' || rec.isExempt === true) {
                entry.exempt += 1;
            } else {
                if (rec.status === 'Present' || rec.status === 'Partial') {
                    entry.attended += 1;
                }
                entry.totalMinutes += (rec.actualDuration || rec.durationRecorded || 0);
            }
        });

        map.forEach(value => {
            const validDenominator = Math.max(1, totalSessions - value.exempt);
            value.totalValid = validDenominator;
            value.pct = Math.min(100, Math.round((value.attended / validDenominator) * 100));
        });

        let totalCohortHours = 0, sumActiveAttendancePct = 0, highPerformers = 0, atRisk = 0, ghosting = 0;
        let totalMaleCount = 0, totalFemaleCount = 0, activeMaleCount = 0, activeFemaleCount = 0, totalActivatedLearners = 0;

        const bandResults = attendanceBands.map(b => ({ ...b, total: 0, male: 0, female: 0 }));
        const totalExpectedMinutes = processedAttendanceLogs.reduce((acc, log) => acc + (log.expectedDuration || 120), 0);

        enrolledLearners.forEach(l => {
            const stats = map.get(l.learnerId || l.id);
            const pct = stats ? Math.round(stats.pct) : 0;
            const totalMins = stats ? stats.totalMinutes : 0;

            const rawGender = String(l.demographics?.genderCode || (l.demographics as any)?.gender || (l as any).gender || '').trim().toLowerCase();
            const isMale = rawGender === 'm' || (rawGender.includes('male') && rawGender !== 'female');
            const isFemale = rawGender === 'f' || rawGender.includes('female');

            if (isMale) totalMaleCount++;
            if (isFemale) totalFemaleCount++;

            const isActivated = totalMins > 0;

            if (isActivated && l.status !== 'dropped') {
                totalActivatedLearners++;
                totalCohortHours += (totalMins / 60);
                sumActiveAttendancePct += pct;

                if (pct >= 80) highPerformers++;
                if (pct < 50 && processedAttendanceLogs.length > 0) atRisk++;

                if (totalExpectedMinutes > 200 && totalMins < 200) ghosting++;

                if (isMale) activeMaleCount++;
                if (isFemale) activeFemaleCount++;
            }

            let bandIndex = 0;
            if (pct === 0) bandIndex = 0;
            else if (pct < 50) bandIndex = 1;
            else if (pct < 60) bandIndex = 2;
            else if (pct < 70) bandIndex = 3;
            else if (pct < 80) bandIndex = 4;
            else if (pct < 90) bandIndex = 5;
            else bandIndex = 6;

            bandResults[bandIndex].total++;
            if (isMale) bandResults[bandIndex].male++;
            if (isFemale) bandResults[bandIndex].female++;
        });

        const systemActiveCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
        const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
        const totalCount = systemActiveCount + droppedCount;

        const avgAttendance = totalActivatedLearners > 0 ? Math.round(sumActiveAttendancePct / totalActivatedLearners) : 0;
        const avgHoursPerLearner = totalActivatedLearners > 0 ? (totalCohortHours / totalActivatedLearners).toFixed(1) : "0.0";
        const activeFemalePct = totalActivatedLearners > 0 ? Math.round((activeFemaleCount / totalActivatedLearners) * 100) : 0;
        const activeMalePct = totalActivatedLearners > 0 ? Math.round((activeMaleCount / totalActivatedLearners) * 100) : 0;
        const totalFemalePct = totalCount > 0 ? Math.round((totalFemaleCount / totalCount) * 100) : 0;
        const totalMalePct = totalCount > 0 ? Math.round((totalMaleCount / totalCount) * 100) : 0;
        const activationRate = totalCount > 0 ? Math.round((totalActivatedLearners / totalCount) * 100) : 0;
        const globalRetention = totalCount > 0 ? Math.round((systemActiveCount / totalCount) * 100) : 0;

        setCohortAnalytics({
            rosterAttendanceMap: map, totalCohortHours: Math.round(totalCohortHours), avgAttendance, highPerformers, atRisk, ghosting, avgHoursPerLearner,
            totalMaleCount, totalFemaleCount, activeMaleCount, activeFemaleCount, activeFemalePct, activeMalePct, totalFemalePct, totalMalePct, totalActivatedLearners, activationRate,
            systemActiveCount, droppedCount, totalCount, globalRetention, bandResults, baseLength: enrolledLearners.length
        });
    }, [enrolledLearners, attendanceRecords, processedAttendanceLogs, attendanceBands]);

    const dynamicLocations = useMemo(() => extractGeoLevels(enrolledLearners), [enrolledLearners]);

    const learnersForMap = useMemo(() => {
        if (!cohortAnalytics) return [];
        return enrolledLearners.filter(learner => {
            const searchLower = urlSearchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const locationString = getLocationString(learner);

            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower) ||
                locationString.toLowerCase().includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            const matchesExitEmail = exitEmailFilter === 'all' || (() => {
                if (learner.status !== 'dropped') return false;
                const emailStatus = learner.withdrawalEmailStatus;
                const targetEmail = learner.email || learner.demographics?.learnerEmailAddress;
                const hasEmail = Boolean(targetEmail?.trim());

                if (exitEmailFilter === 'no_email') return !hasEmail;
                if (!hasEmail) return false;
                if (exitEmailFilter === 'sent') return emailStatus?.sent === true;
                if (exitEmailFilter === 'failed') return Boolean(emailStatus?.error);
                if (exitEmailFilter === 'unsent') return !emailStatus?.sent && !emailStatus?.error;
                return true;
            })();

            if (!matchesSearch || !matchesStatus || !matchesExitEmail) return false;

            const stats = cohortAnalytics.rosterAttendanceMap.get(learner.learnerId || learner.id);
            const pct = stats ? Math.round(stats.pct) : 0;
            const hasStarted = stats ? stats.totalMinutes > 0 : false;

            let matchesActivation = true;
            if (activationFilter === 'activated') matchesActivation = hasStarted;
            if (activationFilter === 'never') matchesActivation = !hasStarted;
            if (!matchesActivation) return false;

            let matchesAttendance = true;
            if (attendanceFilter === 'custom') {
                const min = customMinPct === '' ? 0 : Number(customMinPct);
                const max = customMaxPct === '' ? 100 : Number(customMaxPct);
                matchesAttendance = pct >= min && pct <= max;
            } else if (attendanceFilter !== 'all') {
                if (attendanceFilter === 'pct_0') matchesAttendance = pct === 0;
                else if (attendanceFilter === 'pct_1_49') matchesAttendance = pct > 0 && pct < 50;
                else if (attendanceFilter === 'pct_50_59') matchesAttendance = pct >= 50 && pct < 60;
                else if (attendanceFilter === 'pct_60_69') matchesAttendance = pct >= 60 && pct < 70;
                else if (attendanceFilter === 'pct_70_79') matchesAttendance = pct >= 70 && pct < 80;
                else if (attendanceFilter === 'pct_80_89') matchesAttendance = pct >= 80 && pct < 90;
                else if (attendanceFilter === 'pct_90_100') matchesAttendance = pct >= 90;
                else matchesAttendance = false;
            }

            return matchesAttendance;
        });
    }, [enrolledLearners, urlSearchTerm, statusFilter, activationFilter, exitEmailFilter, customMinPct, customMaxPct, attendanceFilter, cohortAnalytics]);

    // ADVANCED MAP FILTER STATE
    const [mapFilters, setMapFilters] = useState<AdvancedMapFilterState>({
        genders: [],
        equityGroups: [],
        performance: [],
        minAge: 16,
        maxAge: 65,
        geoLevels: ['province', 'district', 'municipality', 'city']
    });

    // 🚀 FULLY ROBUST DATA ENGINE FOR THE MAP SIDEBAR FILTERS
    const advancedFilteredLearners = useMemo(() => {
        return learnersForMap.filter(l => {
            const demos = l.demographics || (l as any);

            // 1. Safe Gender Filter
            if (mapFilters.genders.length > 0) {
                const rawGender = String(demos.genderCode || demos.gender || (l as any).gender || '').toUpperCase().trim();
                const gender = rawGender.startsWith('F') ? 'F' : rawGender.startsWith('M') ? 'M' : 'U';
                if (!mapFilters.genders.includes(gender)) return false;
            }

            // 2. Equity Filter
            if (mapFilters.equityGroups.length > 0) {
                const equity = String(demos.equityCode || '');
                if (!mapFilters.equityGroups.includes(equity)) return false;
            }

            // 3. Age Filter
            const age = getAgeFromId(l.idNumber);
            if (age !== null) {
                if (age < mapFilters.minAge || age > mapFilters.maxAge) return false;
            }

            // 4. Strict Survey Participation & Answer Drill-down Filter
            if (mapFilters.surveyId) {
                const learnerEmail = String(l.email || demos.learnerEmailAddress || '').toLowerCase().trim();
                const learnerId = l.learnerId || l.id;

                const learnerResponses = cohortSurveyResponses.filter(r => {
                    if (r.surveyId !== mapFilters.surveyId) return false;
                    const rEmail = String(r.learnerEmail || '').toLowerCase().trim();
                    const idMatch = Boolean(r.learnerId && r.learnerId === learnerId);
                    const emailMatch = Boolean(rEmail && learnerEmail && rEmail === learnerEmail);
                    return idMatch || emailMatch;
                });

                const hasCompleted = learnerResponses.length > 0;

                if (mapFilters.surveyStatus === 'completed' && !hasCompleted) return false;
                if (mapFilters.surveyStatus === 'pending' && hasCompleted) return false;

                if (hasCompleted && mapFilters.surveyQuestionId && mapFilters.surveyAnswerValues && mapFilters.surveyAnswerValues.length > 0) {
                    const filterValuesLower = mapFilters.surveyAnswerValues.map(v => String(v).trim().toLowerCase());
                    const hasMatchingAnswer = learnerResponses.some(response => {
                        const rawAnswer = response.answers?.[mapFilters.surveyQuestionId as string];
                        if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return false;
                        if (Array.isArray(rawAnswer)) {
                            return rawAnswer.some(val => filterValuesLower.includes(String(val).trim().toLowerCase()));
                        }
                        const stringAnswer = String(rawAnswer).trim().toLowerCase();
                        return filterValuesLower.includes(stringAnswer);
                    });
                    if (!hasMatchingAnswer) return false;
                }
            }

            return true;
        });
    }, [learnersForMap, mapFilters, cohortSurveyResponses]);

    const fullyFilteredLearners = useMemo(() => {
        return advancedFilteredLearners.filter(learner => {
            if (locationFilter === 'all') return true;

            const demos = learner.demographics || (learner as any);
            const provName = String(demos.provinceName || demos.province || '').trim();
            const district = String(demos.districtOrMetro || demos.districtMunicipality || demos.district || '').trim();
            const muni = String(demos.localMunicipality || demos.municipality || '').trim();
            const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();

            if (locationFilter === 'Not specified') {
                return !provName && !district && !muni && !town;
            }

            const filterLower = locationFilter.toLowerCase().trim();

            if (provName && provName.toLowerCase() === filterLower) return true;
            if (district && district.toLowerCase() === filterLower) return true;
            if (muni && muni.toLowerCase() === filterLower) return true;
            if (town && town.toLowerCase() === filterLower) return true;

            const allGeoParts = [provName, district, muni, town].filter(Boolean).join(', ').toLowerCase();
            if (allGeoParts.includes(filterLower)) return true;

            return false;
        });
    }, [advancedFilteredLearners, locationFilter]);

    // 🚀 NEW: Generate the Hierarchical Geographic Data Tree
    const geoTree = useMemo(() => {
        const tree: Record<string, any> = {};

        advancedFilteredLearners.forEach(l => {
            const demos = l.demographics || (l as any);
            const prov = String(demos.provinceName || demos.province || 'Unspecified').trim();
            const dist = String(demos.districtOrMetro || demos.districtMunicipality || demos.district || 'Unspecified').trim();
            const muni = String(demos.localMunicipality || demos.municipality || 'Unspecified').trim();

            if (!tree[prov]) tree[prov] = { count: 0, districts: {} };
            tree[prov].count++;

            if (!tree[prov].districts[dist]) tree[prov].districts[dist] = { count: 0, municipalities: {} };
            tree[prov].districts[dist].count++;

            if (!tree[prov].districts[dist].municipalities[muni]) tree[prov].districts[dist].municipalities[muni] = 0;
            tree[prov].districts[dist].municipalities[muni]++;
        });

        return tree;
    }, [advancedFilteredLearners]);

    const activeLocationsCount = useMemo(() => {
        const uniqueGroups = new Set<string>();
        fullyFilteredLearners.forEach(l => {
            const demos = l.demographics || (l as any);
            let groupName = 'Not specified';
            if (mapFilters.geoLevels.includes('city')) {
                const city = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();
                if (city) groupName = city;
            }
            if (groupName === 'Not specified' && mapFilters.geoLevels.includes('municipality')) {
                const muni = String(demos.localMunicipality || demos.municipality || '').trim();
                if (muni) groupName = muni;
            }
            if (groupName === 'Not specified' && mapFilters.geoLevels.includes('district')) {
                const district = String(demos.districtOrMetro || demos.districtMunicipality || demos.district || '').trim();
                if (district) groupName = district;
            }
            if (groupName === 'Not specified' && mapFilters.geoLevels.includes('province')) {
                const provName = String(demos.provinceName || demos.province || '').trim();
                if (provName) groupName = provName;
            }
            uniqueGroups.add(groupName);
        });
        return uniqueGroups.size;
    }, [fullyFilteredLearners, mapFilters.geoLevels]);

    const totalPages = Math.ceil(fullyFilteredLearners.length / ITEMS_PER_PAGE);
    const paginatedLearners = fullyFilteredLearners.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const filteredAttendanceLogs = useMemo(() => {
        if (ledgerDates.length === 0) return processedAttendanceLogs;
        return processedAttendanceLogs.filter(log => {
            const logDate = log.sessionDate ? log.sessionDate.split('T')[0] : '';
            return ledgerDates.includes(logDate);
        });
    }, [processedAttendanceLogs, ledgerDates]);

    const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        if (date && !ledgerDates.includes(date)) setLedgerDates([...ledgerDates, date]);
    };
    const removeLedgerDate = (dateToRemove: string) => setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));

    const assessmentStatsMap = useMemo(() => {
        const map = new Map<string, { assessmentId: string, title: string, writing: any[], pending: any[], graded: any[], learnerNamesWriting: string[] }>();
        submissions.forEach(s => {
            if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;
            if (!map.has(s.assessmentId)) map.set(s.assessmentId, { assessmentId: s.assessmentId, title: s.title || 'Unknown Assessment', writing: [], pending: [], graded: [], learnerNamesWriting: [] });
            const entry = map.get(s.assessmentId)!;
            if (s.status === 'in_progress') {
                entry.writing.push(s);
                const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
                if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
            } else if (s.status === 'submitted') entry.pending.push(s);
            else if (s.status === 'graded' || s.status === 'moderated') entry.graded.push(s);
        });
        return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
    }, [submissions, enrolledLearners]);

    const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
    const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

    const toggleAssessmentAccordion = (id: string) => {
        setExpandedAssessments(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const filteredAssessments = useMemo(() => {
        if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
        if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
        return assessmentStatsMap;
    }, [assessmentStatsMap, assessmentFilter]);

    const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
    const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

    const cohortTargetedSurveys = useMemo(() => {
        const cohortAssessmentIds = new Set(submissions.map(s => s.assessmentId).filter(Boolean));
        const cohortSubmissionSurveyIds = new Set(submissions.map(s => s.surveyId).filter(Boolean));
        const cohortResponseSurveyIds = new Set(cohortSurveyResponses.map(r => r.surveyId).filter(Boolean));

        return surveyTemplates.filter(s => {
            if (s.isActive === false) return false;
            const cIds = s.cohortIds || [];
            return (
                cIds.includes('ALL') ||
                cIds.includes(cohort.id) ||
                s.cohortId === cohort.id ||
                s.cohortId === 'ALL' ||
                (s.assessmentId && cohortAssessmentIds.has(s.assessmentId)) ||
                cohortSubmissionSurveyIds.has(s.id) ||
                cohortResponseSurveyIds.has(s.id)
            );
        });
    }, [surveyTemplates, cohort?.id, submissions, cohortSurveyResponses]);

    const filteredSurveyResponses = useMemo(() => {
        if (!surveySearchQuery.trim()) return cohortSurveyResponses;
        const lower = surveySearchQuery.toLowerCase().trim();
        return cohortSurveyResponses.filter(r =>
            (r.learnerName || '').toLowerCase().includes(lower) ||
            (r.learnerEmail || '').toLowerCase().includes(lower)
        );
    }, [cohortSurveyResponses, surveySearchQuery]);

    const cohortSurveyMetrics = useMemo(() => {
        const totalSubmissions = cohortSurveyResponses.length;
        const completionRate = activeCount > 0 ? Math.round((totalSubmissions / activeCount) * 100) : 0;
        let starRatingSum = 0;
        let starRatingCount = 0;

        cohortSurveyResponses.forEach(r => {
            Object.values(r.answers || {}).forEach((val: any) => {
                if (typeof val === 'number' && val <= 5) {
                    starRatingSum += val;
                    starRatingCount++;
                }
            });
        });
        const avgScore = starRatingCount > 0 ? (starRatingSum / starRatingCount).toFixed(1) : 'N/A';
        return { totalSubmissions, completionRate, avgScore };
    }, [cohortSurveyResponses, activeCount]);

    // ─── ACTION HANDLERS ───
    const handleBack = () => {
        if (isAdmin) navigate('/admin', { state: { activeTab: 'cohorts' } });
        else navigate(-1);
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            const validPageLearners = paginatedLearners.filter((l: any) => l.status !== 'dropped');
            if (e.target.checked) validPageLearners.forEach((l: any) => next.add(l.id));
            else validPageLearners.forEach((l: any) => next.delete(l.id));
            return next;
        });
    };

    const handleSelectOne = (id: string) => {
        const next = new Set(selectedIds);
        next.has(id) ? next.delete(id) : next.add(id);
        setSelectedIds(next);
    };

    const handleConfirmPromote = async () => {
        if (!promotingLearners || promotingLearners.length === 0 || !promoteCohortId) return;
        setIsPromoting(true);
        try {
            const batch = writeBatch(db);
            const timestamp = new Date().toISOString();

            promotingLearners.forEach(learner => {
                const trueLearnerId = learner.learnerId || (learner.id?.includes('_') ? learner.id.substring(learner.id.indexOf('_') + 1) : learner.id);
                const learnerRef = doc(db, "learners", trueLearnerId);
                const newEnrollmentId = `${promoteCohortId}_${trueLearnerId}`;
                const enrollmentRef = doc(db, "enrollments", newEnrollmentId);

                batch.set(learnerRef, {
                    isBootcamp: false,
                    cohortId: promoteCohortId,
                    enrollmentId: newEnrollmentId,
                    authStatus: autoSendInvite ? "invite_pending" : "pending",
                    status: "active",
                    updatedAt: timestamp,
                    ...(autoSendInvite ? { inviteRequestedAt: timestamp } : {})
                }, { merge: true });

                batch.set(enrollmentRef, {
                    id: newEnrollmentId,
                    learnerId: trueLearnerId,
                    cohortId: promoteCohortId,
                    status: "active",
                    enrolledAt: timestamp,
                    updatedAt: timestamp,
                    assignedBy: user?.uid || "admin"
                }, { merge: true });

                const oldEnrollmentId = learner.enrollmentId || (learner.id?.includes('_') ? learner.id : null);
                if (oldEnrollmentId && oldEnrollmentId !== newEnrollmentId) {
                    batch.set(doc(db, "enrollments", oldEnrollmentId), {
                        status: "transferred",
                        transferredTo: promoteCohortId,
                        updatedAt: timestamp
                    }, { merge: true });
                }
            });

            await batch.commit();
            if (fetchLearners) fetchLearners(true);
            setPromotingLearners(null);
            setPromoteCohortId('');
            setSelectedIds(new Set());

            toast.success(
                autoSendInvite
                    ? `Promoted ${promotingLearners.length} learner(s) and triggered welcome emails!`
                    : `Promoted ${promotingLearners.length} learner(s) to active enrollment!`
            );
        } catch (error) {
            console.error("Promotion failed", error);
            toast.error("Failed to promote learners.");
        } finally {
            setIsPromoting(false);
        }
    };

    const grantExtraTimeToExam = async (subsToUpdate: any[], minutes: number, examTitle: string) => {
        if (subsToUpdate.length === 0) return;
        if (!window.confirm(`Add ${minutes} minutes to the clock for ${subsToUpdate.length} learner(s) taking ${examTitle}?`)) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);
            subsToUpdate.forEach(sub => {
                batch.update(doc(db, 'learner_submissions', sub.id), {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });
            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes to ${examTitle}!`);
        } catch (error) {
            toast.error("Failed to grant extra time.");
        } finally {
            setIsGrantingTime(false);
        }
    };

    const handleConfirmDrop = async (data: { date: string, reason: string, notes: string, evidenceUrl: string, resignationUrl: string }) => {
        if (!learnerToDrop) return;
        try {
            const batch = writeBatch(db);
            const routingId = learnerToDrop.enrollmentId || learnerToDrop.id;
            const enrollRef = doc(db, 'enrollments', routingId);

            batch.set(enrollRef, {
                status: 'dropped',
                exitDate: data.date,
                exitReasonCategory: data.reason,
                exitNotes: data.notes,
                exitEvidenceUrl: data.evidenceUrl,
                resignationLetterUrl: data.resignationUrl,
                updatedAt: new Date().toISOString()
            }, { merge: true });

            const humanId = learnerToDrop.learnerId || learnerToDrop.id;
            const learnerRef = doc(db, 'learners', humanId);

            batch.set(learnerRef, {
                status: 'dropped',
                updatedAt: new Date().toISOString()
            }, { merge: true });

            await batch.commit();
            toast.success(`${learnerToDrop.fullName} has been officially withdrawn.`);
            if (fetchLearners) fetchLearners(true);
            setLearnerToDrop(null);
        } catch (err: any) {
            console.error("Error in handleConfirmDrop:", err);
            toast.error(err.message || 'Failed to complete withdrawal process.');
        }
    };

    const handleCopySurveyLink = (surveyId: string) => {
        const publicUrl = `${window.location.origin}/survey/${surveyId}`;
        navigator.clipboard.writeText(publicUrl);
        toast.success("Public survey link copied to clipboard!");
    };

    const handleDeleteCohortResponse = async (id: string) => {
        if (!window.confirm("Delete this survey response permanently?")) return;
        try {
            await deleteDoc(doc(db, 'survey_responses', id));
            toast.success("Response deleted successfully.");
        } catch {
            toast.error("Failed to delete response.");
        }
    };

    const exportCohortSurveyExcel = () => {
        if (cohortSurveyResponses.length === 0) return toast.warning("No survey responses available to export.");

        const rows = cohortSurveyResponses.map(r => {
            const template = surveyTemplates.find(s => s.id === r.surveyId);
            const questionMap = new Map<string, string>();
            template?.questions?.forEach((q: any) => questionMap.set(q.id, q.label));

            const flattenedAnswers: Record<string, any> = {};
            Object.entries(r.answers || {}).forEach(([qId, val]) => {
                const label = questionMap.get(qId) || qId;
                if (val && typeof val === 'object' && 'formattedAddress' in val) {
                    flattenedAnswers[`${label} - Address`] = val.formattedAddress || '';
                    flattenedAnswers[`${label} - City`] = val.city || '';
                } else {
                    flattenedAnswers[label] = val;
                }
            });

            return {
                "Response ID": r.id,
                "Participant": r.learnerName || 'Anonymous',
                "Email": r.learnerEmail || 'N/A',
                "Survey Title": template?.title || r.surveyId,
                "Submitted At": new Date(r.submittedAt).toLocaleString('en-ZA'),
                ...flattenedAnswers
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Cohort Feedback");
        XLSX.writeFile(wb, `Cohort_Feedback_${cohort.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
        toast.success("Cohort feedback exported!");
    };

    const openEditModal = (log: any) => {
        setEditingLog(log);
        setEditLogTitle(log.sessionTitle || '');
        setEditLogDesc(log.sessionDescription || '');
        setEditLogZoomLink(log.sessionZoomLink || '');
    };

    const handleSaveLogDetails = async () => {
        if (!editingLog) return;
        const wordCount = editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount > 250) {
            toast.error(`Description is too long (${wordCount} words). Maximum is 250 words.`);
            return;
        }

        setIsSavingLog(true);
        try {
            const targetDocId = editingLog.parentLogId || editingLog.id;

            if (editingLog.parentLogId && editingLog.subIndex !== undefined) {
                const parentSnap = await getDoc(doc(db, 'attendance_logs', targetDocId));
                if (parentSnap.exists()) {
                    const parentData = parentSnap.data();
                    const sessions = parentData.sessions || [];
                    if (sessions[editingLog.subIndex]) {
                        sessions[editingLog.subIndex] = {
                            ...sessions[editingLog.subIndex],
                            sessionTitle: editLogTitle.trim(),
                            sessionDescription: editLogDesc.trim(),
                            sessionZoomLink: editLogZoomLink.trim()
                        };
                        await updateDoc(doc(db, 'attendance_logs', targetDocId), {
                            sessions,
                            lastEditedBy: user?.uid,
                            lastEditedAt: new Date().toISOString()
                        });
                    }
                }
            } else {
                await updateDoc(doc(db, 'attendance_logs', targetDocId), {
                    sessionTitle: editLogTitle.trim(),
                    sessionDescription: editLogDesc.trim(),
                    sessionZoomLink: editLogZoomLink.trim(),
                    lastEditedBy: user?.uid,
                    lastEditedAt: new Date().toISOString()
                });
            }

            toast.success("Session details updated successfully.");
            setEditingLog(null);
        } catch (err) {
            console.error("Save log error:", err);
            toast.error("Failed to update session details.");
        } finally {
            setIsSavingLog(false);
        }
    };

    const getStaffName = async (id: string) => {
        const cachedStaff = useStore.getState().staff;
        const match = cachedStaff.find(s => s.id === id);
        if (match) return match.fullName;
        try {
            const userSnap = await getDoc(doc(db, 'users', id));
            if (userSnap.exists()) return userSnap.data().fullName;
        } catch { }
        return 'Unassigned';
    };

    const [facName, setFacName] = useState('Loading...');
    const [assName, setAssName] = useState('Loading...');
    const [modName, setModName] = useState('Loading...');

    useEffect(() => {
        if (!cohort) return;
        getStaffName(cohort.facilitatorId).then(setFacName);
        getStaffName(cohort.assessorId).then(setAssName);
        getStaffName(cohort.moderatorId).then(setModName);
    }, [cohort]);

    if (!cohort) return null;

    if (!cohortAnalytics) return (
        <div className="cdp-layout">
            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />
            <main className="cdp-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader message='Loading Deep Analytics..' />
            </main>
        </div>
    );

    return (
        <div className="cdp-layout">
            <style>{`
                .mc-cards-wrapper { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
                .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); }
                .mc-orb { display: none; }
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: '1px solid var(--mlab-border)'; padding-bottom: '0.75rem'; }
                .mc-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: flex-start; flex-shrink: 0; color: var(--mlab-blue); }
                .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
                .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                .mlab-table-wrap { border-radius: 0 !important; border: none !important; }
                @keyframes live-dot-ping {
                    0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
                    50% { transform: scale(1.2); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
                    100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
                }
                .sm-badge-verified { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 0.65rem; font-weight: 700; background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; text-transform: uppercase; border-radius: 0; }
                .sm-badge-unverified { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 0.65rem; font-weight: 700; background: #f8fafc; color: #64748b; border: 1px solid #cbd5e1; text-transform: uppercase; border-radius: 0; }
            `}</style>

            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <ZoomAttendanceDropZone cohort={cohort} enrolledLearners={enrolledLearners} isOpen={showZoomUploadModal} onClose={() => setShowZoomUploadModal(false)} />

            {selectedSessionForAudience && (
                <SessionAudienceModal
                    cohort={cohort}
                    session={selectedSessionForAudience}
                    enrolledLearners={enrolledLearners}
                    isOpen={!!selectedSessionForAudience}
                    onClose={() => setSelectedSessionForAudience(null)}
                    onSuccess={() => { if (fetchLearners) fetchLearners(true); }}
                />
            )}

            {learnerToDrop && (
                <LearnerDropoutModal learner={learnerToDrop} onClose={() => setLearnerToDrop(null)} onConfirm={handleConfirmDrop} />
            )}

            {learnerToPlace && createPortal(
                <WorkplacePlacementModal
                    learner={learnerToPlace}
                    // @ts-ignore - cohort is passed for internal context but not strictly typed in the modal interface
                    cohort={cohort}
                    onClose={() => setLearnerToPlace(null)}
                />,
                document.body
            )}

            {editingLog && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setEditingLog(null)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: 0, border: '2px solid var(--mlab-border)' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                            <div className="wm-modal__header-icon" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: 0, border: '1px solid var(--mlab-border)' }}><Edit2 size={20} /></div>
                            <div>
                                <h2 className="wm-modal__title">Edit Session Details</h2>
                                <p className="wm-modal__subtitle">
                                    {new Date(editingLog?.sessionDate?.split('T')[0] || '').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                            <button className="wm-modal__close" onClick={() => setEditingLog(null)}><X size={18} /></button>
                        </div>
                        <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session Title
                                </label>
                                <input type="text" className="wm-form-input" style={{ borderRadius: 0 }} placeholder="e.g. Intro to MS Word" value={editLogTitle} onChange={e => setEditLogTitle(e.target.value)} maxLength={100} />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session / Recording Link (Optional)
                                </label>
                                <input type="url" className="wm-form-input" style={{ borderRadius: 0 }} placeholder="https://zoom.us/rec/share/..." value={editLogZoomLink} onChange={e => setEditLogZoomLink(e.target.value)} />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session Description
                                    <span style={{ color: editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length > 250 ? '#ef4444' : 'var(--mlab-grey)' }}>
                                        {editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length} / 250 words
                                    </span>
                                </label>
                                <textarea className="wm-form-input" style={{ borderRadius: 0 }} placeholder="e.g. Covered creating documents, basic formatting, and introduction to Mail Merge..." rows={5} value={editLogDesc} onChange={e => setEditLogDesc(e.target.value)} />
                            </div>
                        </div>
                        <div className="wm-modal__footer" style={{ borderTop: '1px solid var(--mlab-border)' }}>
                            <button type="button" className="wm-btn wm-btn--ghost" style={{ borderRadius: 0 }} onClick={() => setEditingLog(null)} disabled={isSavingLog}>Cancel</button>
                            <button type="button" className="mlab-btn mlab-btn--primary" style={{ borderRadius: 0 }} onClick={handleSaveLogDetails} disabled={isSavingLog}>
                                {isSavingLog ? <><Loader2 size={16} className="spin" /> Saving...</> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {promotingLearners && promotingLearners.length > 0 && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setPromotingLearners(null)} style={{ zIndex: 999999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: '0', border: '2px solid var(--mlab-blue)' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem', background: '#f8fafc' }}>
                            <div className="wm-modal__header-icon" style={{ background: '#dcfce7', color: '#16a34a', borderRadius: '0' }}><UserCheck size={20} /></div>
                            <div>
                                <h2 className="wm-modal__title" style={{ color: "var(--mlab-blue)" }}>Promote {promotingLearners.length} Applicant{promotingLearners.length > 1 ? 's' : ''}</h2>
                                <p className="wm-modal__subtitle" style={{ color: "var(--mlab-grey)" }}>Transfer bootcamp learners into an official active class.</p>
                            </div>
                            <button className="wm-modal__close" onClick={() => setPromotingLearners(null)} disabled={isPromoting}><X size={18} /></button>
                        </div>
                        <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '1.5rem' }}>
                            <div style={{ background: '#e0f2fe', padding: '12px', borderRadius: '0', border: '1px solid #bae6fd', fontSize: '0.85rem', color: '#0369a1', fontWeight: 500 }}>
                                These learners will be officially enrolled into the Active pipeline. <strong>Their historical data and attendance will remain permanently visible in this Bootcamp roster for your records.</strong> In the main system, they will be marked as <strong>Pending Setup</strong> so you can send them email invitations to log in.
                            </div>
                            <div className="mlab-form-group">
                                <label style={{ fontWeight: 700, color: 'var(--mlab-midnight)', fontSize: '0.85rem', marginBottom: '8px', display: 'block', textTransform: 'uppercase' }}>
                                    Assign to Class / Cohort <span style={{ color: 'var(--mlab-red)' }}>*</span>
                                </label>
                                <select
                                    className="mlab-input lfm-select"
                                    value={promoteCohortId}
                                    onChange={e => setPromoteCohortId(e.target.value)}
                                    style={{ width: '100%', padding: '10px', borderRadius: '0', border: '1px solid var(--mlab-border)', outline: 'none' }}
                                    disabled={isPromoting}
                                >
                                    <option value="">-- Select Destination Cohort --</option>
                                    {activeCohorts.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <label style={{
                                display: 'flex', alignItems: 'center', gap: '12px', cursor: isPromoting ? 'not-allowed' : 'pointer',
                                background: autoSendInvite ? '#f0fdf4' : '#f8fafc', padding: '12px 16px',
                                border: `1px solid ${autoSendInvite ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: '0', marginTop: '4px',
                                transition: 'all 0.2s ease'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={autoSendInvite}
                                    onChange={(e) => setAutoSendInvite(e.target.checked)}
                                    style={{ width: '18px', height: '18px', accentColor: 'var(--mlab-green)', cursor: 'pointer' }}
                                    disabled={isPromoting}
                                />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: autoSendInvite ? '#166534' : 'var(--mlab-midnight)' }}>
                                        Automatically send registration emails
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                        Learners will immediately receive an invitation link to set their password.
                                    </span>
                                </div>
                            </label>
                        </div>
                        <div className="wm-modal__footer" style={{ borderTop: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: 'var(--mlab-bg)' }}>
                            <button className="wm-btn wm-btn--ghost" style={{ borderRadius: '0' }} onClick={() => setPromotingLearners(null)} disabled={isPromoting}>Cancel</button>
                            <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green-dark)', borderRadius: '0' }} onClick={handleConfirmPromote} disabled={isPromoting || !promoteCohortId}>
                                {isPromoting ? <><Loader2 className="spin" size={16} /> Promoting...</> : <><UserCheck size={16} /> Confirm Promotion</>}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {viewingSurveyResponse && createPortal(
                <div className="lfm-overlay" onClick={() => setViewingSurveyResponse(null)} style={{ zIndex: 9999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><HelpCircle size={16} /> Participant Feedback</h2>
                            <button className="lfm-close-btn" onClick={() => setViewingSurveyResponse(null)}><X size={20} /></button>
                        </div>

                        <div className="lfm-body" style={{ background: '#f8fafc', padding: 0 }}>
                            <div style={{ padding: '1.25rem', background: '#fff', borderBottom: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.2rem', textTransform: 'uppercase' }}>
                                        {viewingSurveyResponse.response.learnerName || 'Anonymous'}
                                    </h3>
                                    {viewingSurveyResponse.response.isVerifiedRespondent
                                        ? <span className="sm-badge-verified"><CheckCircle2 size={12} /> Verified Contact</span>
                                        : <span className="sm-badge-unverified">Unverified</span>
                                    }
                                </div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <span><strong>Survey Form:</strong> {viewingSurveyResponse.template?.title || viewingSurveyResponse.response.surveyId}</span>
                                    <span><strong>Submitted:</strong> {new Date(viewingSurveyResponse.response.submittedAt).toLocaleString('en-ZA')}</span>
                                    {viewingSurveyResponse.response.learnerEmail && <span><strong>Email:</strong> {viewingSurveyResponse.response.learnerEmail}</span>}
                                </div>
                            </div>

                            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Feedback Breakdown</h4>

                                {viewingSurveyResponse.template?.questions?.map((q: any, idx: number) => {
                                    const answer = viewingSurveyResponse.response.answers?.[q.id];

                                    return (
                                        <div key={q.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem' }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', marginBottom: '8px' }}>
                                                {idx + 1}. {q.label}
                                            </div>

                                            <div style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                {answer === undefined || answer === '' ? (
                                                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Skipped / No Answer</span>
                                                ) : q.type === 'rating' ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Star size={16} color="#f59e0b" fill="#f59e0b" />
                                                        <strong>{answer}</strong> / {q.maxStars || 5}
                                                    </div>
                                                ) : q.type === 'address' ? (
                                                    <div style={{ background: 'var(--mlab-bg)', padding: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.8rem' }}>
                                                        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={12} /> {answer.formattedAddress}</div>
                                                        {answer.localMunicipality && <div style={{ color: 'var(--mlab-grey)' }}>Municipality: {answer.localMunicipality}</div>}
                                                        {answer.districtOrMetro && <div style={{ color: 'var(--mlab-grey)' }}>District: {answer.districtOrMetro}</div>}
                                                        {answer.province && <div style={{ color: 'var(--mlab-grey)' }}>Province: {answer.province}</div>}
                                                    </div>
                                                ) : (
                                                    <span style={{ whiteSpace: 'pre-wrap' }}>{String(answer)}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="lfm-footer" style={{ justifyContent: 'flex-end' }}>
                            <button type="button" className="lfm-btn lfm-btn--outline" onClick={() => setViewingSurveyResponse(null)} style={{ background: '#fff', border: '1px solid var(--mlab-border)' }}>Close View</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 🚀 FULLSCREEN MAP WITH ADVANCED FILTER SIDEBAR */}
            {isMapFullscreen && createPortal(
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'row' }}>
                    <AdvancedMapFilters
                        filters={mapFilters}
                        setFilters={setMapFilters}
                        activeFemaleCount={cohortAnalytics.activeFemaleCount}
                        activeMaleCount={cohortAnalytics.activeMaleCount}
                        totalActive={cohortAnalytics.totalActivatedLearners}
                        availableSurveys={cohortTargetedSurveys}
                        cohortSurveyResponses={cohortSurveyResponses}
                        filteredCount={fullyFilteredLearners.length}
                        locationCount={activeLocationsCount}
                        geoTree={geoTree}
                        selectedLocation={selectedMapLocation}
                        onSelectLocation={handleMapLocationSelect}
                        onClose={() => setIsMapFullscreen(false)}
                    />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <CohortGeoMap
                            learners={fullyFilteredLearners}
                            allLearners={advancedFilteredLearners}
                            selectedLocation={selectedMapLocation}
                            onSelectLocation={handleMapLocationSelect}
                            isFullscreen={true}
                            onToggleFullscreen={() => setIsMapFullscreen(false)}
                            visibleGeoLevels={mapFilters.geoLevels}
                            onExport={() => setShowExportAnalyticsModal(true)}
                        />
                    </div>
                </div>, document.body
            )}

            {/* 🚀 EXPORT ANALYTICS MODAL */}
            <ExportAnalyticsModal
                isOpen={showExportAnalyticsModal}
                onClose={() => setShowExportAnalyticsModal(false)}
                allLearners={enrolledLearners}
                filteredLearners={fullyFilteredLearners}
                cohortAnalytics={cohortAnalytics}
                cohortName={cohort.name}
                surveyTemplates={cohortTargetedSurveys}
                cohortSurveyResponses={cohortSurveyResponses}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}><ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}</button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Analytics & Funnel</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub"><Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}<span className="cdp-header__status cdp-header__status--active">Bootcamp Active</span></p>
                    </div>
                    <div className="cdp-header__right">
                        <button className="cdp-btn cdp-btn--outline" style={{ borderRadius: 0 }} onClick={() => setShowExportAnalyticsModal(true)}>
                            <DownloadCloud size={13} /> Export Analytics
                        </button>
                    </div>
                </header>

                <div className="cdp-content">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button onClick={() => setShowKPIs(!showKPIs)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: 'var(--mlab-grey)', fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer' }}>{showKPIs ? <><ChevronUp size={14} /> Hide</> : <><ChevronDown size={14} /> Show</>}</button>
                    </div>

                    {showKPIs && cohortAnalytics && (
                        <>
                            <div className="mc-cards-wrapper animate-slide-down">
                                <ModuleProgressCard type="Global Retention" data={{ total: cohortAnalytics.totalCount || 1, logged: cohortAnalytics.systemActiveCount || 0, subValue: `${cohortAnalytics.globalRetention}% Retained`, segments: [{ label: 'Active', value: cohortAnalytics.systemActiveCount, color: '#10b981' }, { label: 'Withdrawn', value: cohortAnalytics.droppedCount, color: '#ef4444' }] }} />
                                <ModuleProgressCard type="Pipeline Activation" data={{ total: cohortAnalytics.totalCount || 1, logged: cohortAnalytics.totalActivatedLearners || 0, subValue: `${cohortAnalytics.activationRate}% Activated`, segments: [{ label: 'Started', value: cohortAnalytics.totalActivatedLearners, color: '#0ea5e9' }, { label: 'Not Started', value: (cohortAnalytics.totalCount || 0) - (cohortAnalytics.totalActivatedLearners || 0), color: '#94a3b8' }] }} />
                                <ModuleProgressCard type="Gender Diversity" data={{ total: cohortAnalytics.totalActivatedLearners || 1, logged: cohortAnalytics.activeFemaleCount || 0, subValue: `${cohortAnalytics.activeFemalePct}% Female (Active)`, segments: [{ label: 'Female', value: cohortAnalytics.activeFemaleCount, color: '#ec4899' }, { label: 'Male', value: cohortAnalytics.activeMaleCount, color: '#3b82f6' }] }} />
                                <ModuleProgressCard type="Performance Risk" data={{ total: cohortAnalytics.totalActivatedLearners || 1, logged: cohortAnalytics.highPerformers || 0, subValue: `${cohortAnalytics.atRisk + cohortAnalytics.ghosting} At Risk`, segments: [{ label: 'High (>80%)', value: cohortAnalytics.highPerformers, color: '#10b981' }, { label: 'At-Risk (<50%)', value: cohortAnalytics.atRisk, color: '#f59e0b' }, { label: 'Ghosting', value: cohortAnalytics.ghosting, color: '#ef4444' }] }} />
                                <ModuleProgressCard type="Active Attendance" data={{ total: 100, logged: cohortAnalytics.avgAttendance || 0, subValue: `${cohortAnalytics.avgAttendance}% Average`, segments: [{ label: 'Attended', value: cohortAnalytics.avgAttendance || 0, color: '#8b5cf6' }, { label: 'Missed', value: 100 - (cohortAnalytics.avgAttendance || 0), color: '#e2e8f0' }] }} />
                                <ModuleProgressCard type="Total Training Time" data={{ total: cohortAnalytics.totalCohortHours > 0 ? cohortAnalytics.totalCohortHours : 1, logged: cohortAnalytics.totalCohortHours || 0, subValue: `${cohortAnalytics.avgHoursPerLearner} hrs / learner`, segments: [{ label: 'Total Hours', value: cohortAnalytics.totalCohortHours || 0, color: '#f59e0b' }] }} />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                                <div style={{ border: '2px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column' }}>
                                    {!isMapFullscreen && (
                                        <CohortGeoMap
                                            learners={fullyFilteredLearners}
                                            allLearners={advancedFilteredLearners}
                                            selectedLocation={selectedMapLocation}
                                            onSelectLocation={handleMapLocationSelect}
                                            isFullscreen={false}
                                            onToggleFullscreen={() => setIsMapFullscreen(true)}
                                            visibleGeoLevels={mapFilters.geoLevels}
                                        />
                                    )}
                                </div>
                                <div style={{ border: '2px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column' }}>
                                    <div className="lfm-header" onClick={() => setIsMatrixExpanded(!isMatrixExpanded)} style={{ cursor: 'pointer' }}>
                                        <h2 className="lfm-header__title"><BarChart2 size={18} /> Compliance Matrix</h2>
                                        <div style={{ color: 'var(--mlab-white)' }}>{isMatrixExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                                    </div>
                                    {isMatrixExpanded && (
                                        <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem 1.5rem', background: 'var(--mlab-white)', overflowY: 'auto', maxHeight: '350px' }}>
                                            {cohortAnalytics.bandResults.filter((b: any) => b.total > 0).map((band: any) => {
                                                const totalPct = cohortAnalytics.baseLength > 0 ? Math.round((band.total / cohortAnalytics.baseLength) * 100) : 0;
                                                const malePct = band.total > 0 ? Math.round((band.male / band.total) * 100) : 0;
                                                const femalePct = band.total > 0 ? Math.round((band.female / band.total) * 100) : 0;
                                                const isActive = attendanceFilter === band.id;
                                                return (
                                                    <div key={band.id} onClick={() => updateUrlParams({ attendance: isActive ? 'all' : band.id, tab: 'learners' })} style={{ display: 'grid', gap: '8px', padding: '10px 16px', cursor: 'pointer', background: isActive ? `${band.color}15` : 'var(--mlab-bg)', border: '1px solid', borderLeft: `4px solid ${band.color}`, borderColor: isActive ? `${band.color}40` : 'var(--mlab-border)', transition: 'all 0.2s ease' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.8rem', fontWeight: 700, color: isActive ? band.color : 'var(--mlab-midnight)' }}>{band.label}</span><span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{band.total} ({totalPct}%)</span></div>
                                                        <div>
                                                            <div style={{ width: '100%', background: '#e2e8f0', height: '6px', overflow: 'hidden' }}><div style={{ width: `${totalPct}%`, background: band.color, height: '100%' }} /></div>
                                                            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.7rem', marginTop: '4px' }}>
                                                                <span style={{ color: '#0284c7' }}>M: <strong>{band.male}</strong> ({malePct}%)</span>
                                                                <span style={{ color: '#ec4899' }}>F: <strong>{band.female}</strong> ({femalePct}%)</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {cohortAnalytics.bandResults.filter((b: any) => b.total > 0).length === 0 && (
                                                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--mlab-grey)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                                    No learners match the current search or status filter.
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </>
                    )}

                    {/* COHORT META DATA */}
                    <div className="mc-cards-wrapper">
                        <div className="mc"><div className="mc-hdr"><div><div className="mc-label">Duration</div><div className="mc-title">Timeline</div></div><Calendar size={20} color="var(--mlab-blue)" /></div><div style={{ display: 'flex', gap: '12px' }}><div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}><div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)' }}>Start</div><div style={{ color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div></div><div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}><div style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)' }}>End</div><div style={{ color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div></div></div></div>
                        <div className="mc"><div className="mc-hdr"><div><div className="mc-label">Staff</div><div className="mc-title">Facilitator</div></div><Users size={20} color="var(--mlab-blue)" /></div><div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}><div style={{ width: '36px', height: '36px', background: 'white', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>{facName === 'Unassigned' ? '?' : facName.charAt(0)}</div><div><span style={{ fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span><br /><span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)' }}>Primary</span></div></div></div>
                        <div className="mc"><div className="mc-hdr"><div><div className="mc-label">Staff</div><div className="mc-title">Assessor</div></div><Award size={20} color="var(--mlab-blue)" /></div><div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}><div style={{ width: '36px', height: '36px', background: 'white', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>{assName === 'Unassigned' ? '?' : assName.charAt(0)}</div><div><span style={{ fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span><br /><span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)' }}>Grading</span></div></div></div>
                        <div className="mc"><div className="mc-hdr"><div><div className="mc-label">Staff</div><div className="mc-title">Moderator</div></div><ShieldCheck size={20} color="var(--mlab-blue)" /></div><div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}><div style={{ width: '36px', height: '36px', background: 'white', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', border: '1px solid var(--mlab-border)' }}>{modName === 'Unassigned' ? '?' : modName.charAt(0)}</div><div><span style={{ fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span><br /><span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)' }}>QA</span></div></div></div>
                    </div>

                    {assessmentStatsMap.length > 0 && (
                        <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem', borderRadius: 0 }}>
                            <div className="lfm-header" onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)} style={{ cursor: 'pointer' }}>
                                <h2 className="lfm-header__title"><BookOpen size={18} /> Assessment Operations Center</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, background: 'rgba(255,255,255,0.1)', color: 'var(--mlab-white)', padding: '4px 10px', border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase' }}>{assessmentStatsMap.length} Active</span>
                                        {totalWriting > 0 ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '4px 10px', borderRadius: 0, border: '1px solid var(--mlab-red)', textTransform: 'uppercase' }}>
                                                <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                {totalWriting} Writing
                                            </span>
                                        ) : (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', padding: '4px 10px', borderRadius: 0, border: '1px solid var(--mlab-border)', textTransform: 'uppercase' }}>
                                                {totalWriting} Writing
                                            </span>
                                        )}
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '4px 10px', borderRadius: 0, border: '1px solid #fde68a', textTransform: 'uppercase' }}>
                                            <Clock size={10} /> {totalPending} Pending Marking
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--mlab-white)' }}>{isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                                </div>
                            </div>

                            {isAssessmentsExpanded && (
                                <div className="lfm-body animate-slide-down" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
                                        <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
                                        <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
                                        <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
                                    </div>

                                    {filteredAssessments.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--mlab-grey)', background: 'var(--mlab-white)', borderRadius: 0, border: '1px dashed var(--mlab-border)' }}>
                                            No assessments match this filter.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                            {filteredAssessments.map(exam => {
                                                const isExpanded = expandedAssessments.has(exam.assessmentId);
                                                const isLive = exam.writing.length > 0;
                                                const hasPending = exam.pending.length > 0;

                                                return (
                                                    <div key={exam.assessmentId} className="animate-fade-in" style={{ background: 'var(--mlab-white)', border: isLive ? '1px solid var(--mlab-red)' : hasPending ? '1px solid #f59e0b' : '1px solid var(--mlab-border)', borderRadius: 0, overflow: 'hidden', transition: 'all 0.3s ease' }}>
                                                        <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                                                                <div style={{ color: 'var(--mlab-blue)' }}><BookOpen size={20} /></div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase' }}>{exam.title}</h3>
                                                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                                        {isLive && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 800, background: '#fef2f2', color: 'var(--mlab-red)', padding: '2px 8px', borderRadius: 0, textTransform: 'uppercase', border: '1px solid #fca5a5' }}>
                                                                                <span style={{ width: '6px', height: '6px', background: 'var(--mlab-red)', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                {exam.writing.length} Writing
                                                                            </span>
                                                                        )}
                                                                        {hasPending && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: '#fffbeb', color: '#b45309', padding: '2px 8px', borderRadius: 0, textTransform: 'uppercase', border: '1px solid #fde68a' }}>
                                                                                <Clock size={10} /> {exam.pending.length} Awaiting Marking
                                                                            </span>
                                                                        )}
                                                                        {exam.graded.length > 0 && (
                                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-heading)', fontSize: '0.65rem', fontWeight: 700, background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', padding: '2px 8px', borderRadius: 0, textTransform: 'uppercase', border: '1px solid var(--mlab-green)' }}>
                                                                                <CheckCircle2 size={10} /> {exam.graded.length} Graded
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div style={{ color: 'var(--mlab-blue)' }}>{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}</div>
                                                        </div>

                                                        {isExpanded && (
                                                            <div style={{ padding: '1.25rem', background: 'var(--mlab-white)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                {isLive && (
                                                                    <div style={{ border: '1px solid var(--mlab-red)', borderLeft: '4px solid var(--mlab-red)', background: '#fef2f2', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                                                                        <div>
                                                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 800, color: 'var(--mlab-red)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                                <span style={{ width: '8px', height: '8px', background: 'var(--mlab-red)', borderRadius: '50%', animation: 'live-dot-ping 1.5s infinite' }} />
                                                                                Currently Live ({exam.writing.length})
                                                                            </span>
                                                                            <p style={{ margin: '6px 0 0 0', color: '#7f1d1d', fontFamily: 'var(--font-body)', fontSize: '0.85rem', lineHeight: '1.5', fontWeight: 600 }}>
                                                                                {exam.learnerNamesWriting.join(', ')}
                                                                            </p>
                                                                        </div>
                                                                        <div style={{ display: 'flex', gap: '8px' }}>
                                                                            <button className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '1px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 15, exam.title)} disabled={isGrantingTime}>
                                                                                {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +15 Mins
                                                                            </button>
                                                                            <button className="lfm-btn" style={{ background: 'var(--mlab-red)', color: 'var(--mlab-white)', border: '1px solid var(--mlab-red)' }} onClick={() => grantExtraTimeToExam(exam.writing, 30, exam.title)} disabled={isGrantingTime}>
                                                                                {isGrantingTime ? <Loader2 size={14} className="lfm-spin" /> : <Timer size={14} />} +30 Mins
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {hasPending && (
                                                                    <div style={{ border: '1px solid #f59e0b', borderLeft: '4px solid #ea580c', background: '#fffbeb', padding: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                                        <div>
                                                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action Required</span>
                                                                            <p style={{ margin: '4px 0 0 0', color: '#78350f', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>
                                                                                <strong>{exam.pending.length}</strong> submissions have been handed in and require your attention.
                                                                            </p>
                                                                        </div>
                                                                        <button className="lfm-btn" style={{ background: '#f59e0b', color: 'var(--mlab-white)', border: 'none' }} onClick={() => navigate(isAdmin ? '/admin?tab=submissions' : `/${user?.role}?tab=submissions`)}>
                                                                            <PenTool size={14} /> Go to Grading Queue
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TABS */}
                    <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}><Users size={16} /> Roster</button>
                        <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}><Calendar size={16} /> Calendar</button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}><UserCheck size={16} /> Attendance</button>
                        <button className={`lfm-tab ${activeTab === 'surveys' ? 'active' : ''}`} onClick={() => setActiveTab('surveys')}><ClipboardList size={16} /> Surveys</button>
                    </div>

                    {/* ─── TAB 1: LEARNER ROSTER ─── */}
                    {activeTab === 'learners' && (
                        <div className="animate-fade-in" style={{ border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', borderRadius: 0 }}>
                            <div className="lfm-header"><h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({fullyFilteredLearners.length})</h2></div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ position: 'relative', width: '300px', minWidth: '200px', marginTop: 20 }}>
                                    <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={localSearchTerm} onChange={(e) => setLocalSearchTerm(e.target.value)} style={{ paddingLeft: '36px', borderRadius: 0 }} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Exit Email:</label>
                                        <select className="lfm-input lfm-select" value={exitEmailFilter} onChange={(e) => updateUrlParams({ exitEmail: e.target.value })} style={{ minWidth: '160px', borderRadius: 0 }}>
                                            <option value="all">All Email Statuses</option>
                                            <option value="sent">Email Sent</option>
                                            <option value="failed">Delivery Failed</option>
                                            <option value="unsent">Not Sent Yet</option>
                                            <option value="no_email">No Email on Profile</option>
                                        </select>
                                    </div>
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Status:</label>
                                        <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => updateUrlParams({ status: e.target.value })} style={{ minWidth: '150px', borderRadius: 0 }}>
                                            <option value="all">All Applicants</option>
                                            <option value="active">Active Only</option>
                                            <option value="dropped">Withdrawn Only</option>
                                        </select>
                                    </div>

                                    {/* 🚀 DYNAMIC LOCATION DROPDOWN */}
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Location:</label>
                                        <select className="lfm-input lfm-select" value={locationFilter} onChange={(e) => updateUrlParams({ location: e.target.value })} style={{ minWidth: '150px', borderRadius: 0 }}>
                                            <option value="all">All Locations</option>
                                            {dynamicLocations.provinces.length > 0 && (
                                                <optgroup label="Provinces">
                                                    {dynamicLocations.provinces.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </optgroup>
                                            )}
                                            {dynamicLocations.districts.length > 0 && (
                                                <optgroup label="Districts & Metros">
                                                    {dynamicLocations.districts.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </optgroup>
                                            )}
                                            {dynamicLocations.municipalities.length > 0 && (
                                                <optgroup label="Local Municipalities">
                                                    {dynamicLocations.municipalities.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </optgroup>
                                            )}
                                            {dynamicLocations.cities.length > 0 && (
                                                <optgroup label="Cities & Towns">
                                                    {dynamicLocations.cities.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </optgroup>
                                            )}
                                            {dynamicLocations.hasUnspecified && <option value="Not specified">Not specified</option>}
                                        </select>
                                    </div>

                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Activation:</label>
                                        <select className="lfm-input lfm-select" value={activationFilter} onChange={(e) => updateUrlParams({ activation: e.target.value })} style={{ minWidth: '150px', borderRadius: 0 }}>
                                            <option value="all">All Profiles</option>
                                            <option value="activated">Started Program</option>
                                            <option value="never">Never Attended</option>
                                        </select>
                                    </div>
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Attendance:</label>
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <select className="lfm-input lfm-select" value={attendanceFilter} onChange={(e) => updateUrlParams({ attendance: e.target.value })} style={{ minWidth: '180px', borderRadius: 0 }}>
                                                <option value="all">All Attendance</option>
                                                {attendanceBands.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
                                                <option value="custom">⚙️ Custom Range...</option>
                                            </select>
                                            {attendanceFilter === 'custom' && (
                                                <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                    <input type="number" min="0" max="100" placeholder="Min %" value={customMinPct} onChange={e => updateUrlParams({ minPct: e.target.value })} style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid var(--mlab-border)', borderRadius: 0 }} />
                                                    <span style={{ color: 'var(--mlab-grey)', fontWeight: 600 }}>-</span>
                                                    <input type="number" min="0" max="100" placeholder="Max %" value={customMaxPct} onChange={e => updateUrlParams({ maxPct: e.target.value })} style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid var(--mlab-border)', borderRadius: 0 }} />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* BULK ACTION BAR */}
                            {selectedIds.size > 0 && (
                                <div style={{ padding: '10px 1.5rem', background: '#e0f2fe', borderBottom: '1px solid #bae6fd', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{selectedIds.size} Applicant(s) Selected</span>
                                    <button className="lfm-btn lfm-btn--primary" style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green-dark)', padding: '6px 12px', fontSize: '0.75rem' }} onClick={() => { const selected = fullyFilteredLearners.filter((l: any) => selectedIds.has(l.id)); setPromotingLearners(selected); }}><UserCheck size={14} /> Promote to Active Enrollment</button>
                                </div>
                            )}

                            <div className="lfm-body" style={{ padding: 0 }}>
                                <div className="mlab-table-wrap">
                                    <table className="mlab-table" style={{ margin: 0 }}>
                                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                            <tr>
                                                <th style={{ width: '40px', textAlign: 'center', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><input type="checkbox" onChange={handleSelectAll} checked={paginatedLearners.length > 0 && paginatedLearners.filter((l: any) => l.status !== 'dropped').length > 0 && paginatedLearners.filter((l: any) => l.status !== 'dropped').every((l: any) => selectedIds.has(l.id))} /></th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Learner</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Contact</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Location</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Status</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Last Active</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Exit Email</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Attendance</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Time</th>
                                                <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedLearners.length === 0 ? (
                                                <tr><td colSpan={10} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} /><p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p></td></tr>
                                            ) : (
                                                paginatedLearners.map((learner: any, index: number) => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const stats = cohortAnalytics.rosterAttendanceMap.get(learner.learnerId || learner.id);
                                                    const learnerLogin = learner.lastLoginAt || (learner as any).lastLoginAt || null;
                                                    const pct = stats ? Math.round(stats.pct) : 0;
                                                    const totalMinutes = stats ? stats.totalMinutes : 0;
                                                    const attended = stats ? stats.attended : 0;
                                                    const total = stats ? stats.totalValid : processedAttendanceLogs.length;
                                                    const isPlaced = !!learner.employerId;
                                                    const isActivated = totalMinutes > 0;
                                                    const band = attendanceBands.find(b => pct >= b.min && pct <= b.max) || attendanceBands[0];
                                                    const locationStr = getLocationString(learner);

                                                    return (
                                                        <tr key={learner.idNumber || learner.id || index} className={`animate-fade-in ${isDropped ? 'mlab-tr--dropped' : ''}`} style={{ transition: 'all 0.3s ease', background: isDropped ? 'var(--mlab-bg)' : 'transparent', opacity: isDropped ? 0.6 : 1 }}>
                                                            <td style={{ textAlign: 'center' }}><input type="checkbox" checked={selectedIds.has(learner.id)} onChange={() => handleSelectOne(learner.id)} disabled={isDropped} /></td>
                                                            <td>
                                                                <div className="cdp-learner-cell">
                                                                    <div className="cdp-learner-avatar" style={{ borderRadius: 0, background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', border: '1px solid var(--mlab-border)' }}>{learner.fullName.charAt(0)}</div>
                                                                    <div className="cdp-learner-cell__info">
                                                                        <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`} style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>{learner.fullName}</span>
                                                                        <span className="cdp-learner-cell__id" style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{learner.idNumber}</span>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }} title={learner.email}><Mail size={12} color="var(--mlab-grey)" style={{ flexShrink: 0 }} /> {learner.email || 'No Email Attached'}</span>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="var(--mlab-grey)" /> {learner.phone || learner.mobile || 'No Contact Number'}</span>
                                                                </div>
                                                            </td>
                                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}><MapPin size={12} /> {locationStr}</div></td>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {isDropped ? <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', borderRadius: 0 }}>Withdrawn</span>
                                                                        : isActivated ? <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', borderRadius: 0 }}>Active</span>
                                                                            : <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 0 }}>Not Started</span>}
                                                                </div>
                                                            </td>
                                                            <td><div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: learnerLogin ? 'var(--mlab-midnight)' : 'var(--mlab-grey-light)' }}><Clock size={12} color={learnerLogin ? "var(--mlab-blue)" : "var(--mlab-grey-light)"} /><span style={{ fontFamily: 'var(--font-body)', fontWeight: learnerLogin ? 500 : 400 }}>{formatLastLogin(learnerLogin)}</span></div></td>
                                                            <td>{renderWithdrawalEmailBadge(learner)}</td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    {pct === 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.025em', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 0 }}>0%</span>
                                                                        : <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.025em', background: `${band.color}15`, color: band.color, border: `1px solid ${band.color}40`, borderRadius: 0 }}>{pct}%</span>}
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{attended} / {total} classes{stats && stats.exempt > 0 && (<span style={{ fontSize: '0.7rem', color: '#8b5cf6', marginLeft: '4px' }}>({stats.exempt} exempt)</span>)}</span>
                                                                </div>
                                                            </td>
                                                            <td><div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}><span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>{totalMinutes} mins</span><span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>{(totalMinutes / 60).toFixed(1)} hrs</span></div></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                                    {isAdmin && !isDropped && (<button className="lfm-btn" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setPromotingLearners([learner])} title="Promote to Active Class"><UserCheck size={12} /> Promote</button>)}
                                                                    {isAdmin && !isDropped && <button className={`lfm-btn ${isPlaced ? 'lfm-btn--ghost' : 'lfm-btn--primary'}`} style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem' }} onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>
                                                                    {isDropped ? (<button onClick={() => setLearnerToDrop(learner)} title="View Withdrawal Details" className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem', color: 'var(--mlab-grey)', borderColor: 'var(--mlab-border)' }}><FileText size={12} /> View Exit</button>)
                                                                        : (<button onClick={() => setLearnerToDrop(learner)} title="Process Withdrawal / Dropout" className="lfm-btn" style={{ background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '2px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem' }} onMouseOver={e => e.currentTarget.style.background = '#fef2f2'} onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}><UserMinus size={12} /> Withdraw</button>)}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {totalPages > 1 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', background: 'var(--mlab-bg)', borderTop: '1px solid var(--mlab-border)', marginTop: 'auto' }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, fullyFilteredLearners.length)}</strong> of <strong>{fullyFilteredLearners.length}</strong> applicants</div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1, borderRadius: 0 }}><ChevronLeft size={14} /> Previous</button>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>Page {currentPage} of {totalPages}</div>
                                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1, borderRadius: 0 }}>Next <ChevronRight size={14} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 2: CALENDAR VIEW ─── */}
                    {activeTab === 'calendar' && (
                        <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', marginBottom: '2rem' }}>
                            <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 className="lfm-header__title"><Calendar size={18} /> Cohort Session Calendar</h2>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.1)', padding: '4px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 0 }}>
                                    <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-white)', display: 'flex' }}><ChevronLeft size={16} /></button>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-white)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{calendarMonth.format('MMMM YYYY')}</span>
                                    <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-white)', display: 'flex' }}><ChevronRight size={16} /></button>
                                </div>
                            </div>
                            <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)', borderRadius: 0 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>)}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                                    {calendarGrid.map((day, idx) => {
                                        const dateStr = day.format('YYYY-MM-DD');
                                        const isCurrentMonth = day.month() === calendarMonth.month();
                                        const isToday = dateStr === moment().format('YYYY-MM-DD');
                                        const dayLogs = logsByDate.get(dateStr) || [];
                                        return (
                                            <div key={`${dateStr}-${idx}`} style={{ border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)', borderRadius: 0, minHeight: '140px', padding: '10px', backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent', opacity: isCurrentMonth ? 1 : 0.4, display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                    <span style={{ fontWeight: '700', fontFamily: 'var(--font-heading)', color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)', background: isToday ? 'var(--mlab-blue)' : 'transparent', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', borderRadius: 0 }}>{day.format('D')}</span>
                                                    {dayLogs.length > 0 && (<span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 6px', fontWeight: 'bold', border: '1px solid var(--mlab-border)', borderRadius: 0 }}>{dayLogs.length} Session{dayLogs.length !== 1 && 's'}</span>)}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
                                                    {dayLogs.map((log: any) => (
                                                        <div key={log.id} onClick={() => navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`)} style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', borderLeft: '3px solid var(--mlab-green)', padding: '8px', fontSize: '0.7rem', color: 'var(--mlab-midnight)', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--mlab-green)'; e.currentTarget.style.background = 'var(--mlab-white)'; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--mlab-border)'; e.currentTarget.style.borderLeftColor = 'var(--mlab-green)'; e.currentTarget.style.background = 'var(--mlab-bg)'; }} title={log.sessionDescription}>
                                                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', color: 'var(--mlab-blue)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.sessionTitle || `Session ${log.sessionNumber || 1}`}</span>
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--mlab-grey)', fontWeight: 600 }}><Clock size={10} /> {log.expectedDuration || 0} mins</span>
                                                                {log.sessionZoomLink && (<a href={log.sessionZoomLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '2px 6px', fontSize: '0.65rem', fontWeight: 800, textDecoration: 'none', borderRadius: 0, textTransform: 'uppercase' }}><Video size={10} /> Video</a>)}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 3: ATTENDANCE TRACKER ─── */}
                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ border: '1px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
                                <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <h2 className="lfm-header__title"><History size={18} /> Historical Session Ledger</h2>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <button className="lfm-btn" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-white)', border: 'none', padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', borderRadius: 0 }} onClick={() => setShowZoomUploadModal(true)}><UploadCloud size={14} /> Upload Zoom Attendance</button>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px', borderRadius: 0 }}>
                                            <Calendar size={14} color="var(--mlab-blue)" /><span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
                                            <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
                                        </div>
                                    </div>
                                </div>
                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)', borderRadius: 0 }}>{new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}<X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} /></span>)}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: 0 }}><XCircle size={12} /> Clear All</button>
                                    </div>
                                )}
                                <div className="lfm-body" style={{ padding: 0 }}>
                                    <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                                        {filteredAttendanceLogs.length === 0 ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance records have been logged for this cohort yet.'}</p></div>
                                        ) : (
                                            <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                    <tr>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Details</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Expected Duration<span title="Automatically calculated based on the maximum time any single learner spent in this Zoom session." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Total Captured<span title="The total number of applicants mapped and processed for this date." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Present (80%+)<span title="Applicants who stayed for at least 80% of the Expected Duration." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Short Hours<span title="Applicants who dropped off early or joined very late (between 21% and 79% of the session)." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Absent<span title="Applicants who did not attend, or were present for 20% or less of the session." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}><div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>Exempt (N/A)<span title="Learners who were not invited to this targeted session." style={{ cursor: 'help', display: 'flex' }}><Info size={14} color="var(--mlab-grey)" /></span></div></th>
                                                        <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredAttendanceLogs.map((log) => (
                                                        <tr key={log.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{new Date(log.sessionDate.split('T')[0]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                        {log.totalDaySessions > 1 && (<span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', width: 'fit-content', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Clock size={10} style={{ display: 'inline', marginBottom: '-1px' }} /> SESSION {log.sessionNumber || 1} OF {log.totalDaySessions}</span>)}
                                                                        {log.sessionScope === 'targeted' && (<span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><UserCheck size={10} /> TARGETED ({log.invitedLearnerIds?.length || 0} INVITED)</span>)}
                                                                        {log.importVersion > 1 && (<span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><History size={10} /> RE-UPLOADED (v{log.importVersion})</span>)}
                                                                        {log.isEcosystem && (<span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '2px' }}><Globe size={10} /> ECOSYSTEM EVENT</span>)}
                                                                    </div>
                                                                    {log.sessionTitle && (<span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>{log.sessionTitle}</span>)}
                                                                    {log.sessionDescription && (<span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.sessionDescription}>{log.sessionDescription}</span>)}
                                                                    {log.sessionZoomLink && (<a href={log.sessionZoomLink} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none', marginTop: '2px', fontWeight: 600 }}><Video size={12} /> View Recording / Link</a>)}
                                                                </div>
                                                            </td>
                                                            <td><span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}><Clock size={14} /> {log.expectedDuration || 0} mins</span></td>
                                                            <td style={{ color: 'var(--mlab-midnight)' }}>{log.totalEnrolled || enrolledLearners.length} Learners</td>
                                                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid var(--mlab-green)' }}><CheckCircle2 size={12} /> {log.totalPresent || 0}</span></td>
                                                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef3c7', color: '#b45309', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid #fde68a' }}><AlertCircle size={12} /> {log.totalPartial || 0}</span></td>
                                                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid #fca5a5' }}><XCircle size={12} /> {log.totalAbsent || 0}</span></td>
                                                            <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#f1f5f9', color: '#64748b', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid #cbd5e1' }}><MinusCircle size={12} /> {log.totalExempt || 0}</span></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex', gap: '6px' }}>
                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0, color: 'var(--mlab-blue)' }} onClick={() => setSelectedSessionForAudience(log)} title="Manage Invited Audience"><Users size={14} /> Audience</button>
                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0 }} onClick={() => openEditModal(log)} title="Edit Session Details"><Edit2 size={14} color="var(--mlab-blue)" /></button>
                                                                    <button className="lfm-btn lfm-btn--ghost" style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0 }} onClick={() => { const cleanDate = log.sessionDate.split('T')[0]; navigate(`/facilitator/attendance/${cohort.id}?date=${cleanDate}${log.id ? `&sessionId=${log.id}` : ''}`); }}><FolderOpen size={12} /> View Register</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 4: SURVEYS & FEEDBACK ─── */}
                    {activeTab === 'surveys' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-green)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Average Feedback Rating</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}><Star size={28} color="#f59e0b" fill="#f59e0b" /><span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.avgScore}</span><span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>/ 5.0</span></div>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Cohort Participation Rate</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}><Users size={24} color="var(--mlab-blue)" /><span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.completionRate}%</span><span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>({cohortSurveyMetrics.totalSubmissions} / {activeCount})</span></div>
                                </div>
                                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem' }}>
                                    <div style={{ fontSize: '0.7rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Feedback Submissions</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}><HelpCircle size={24} color="var(--mlab-green)" /><span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)' }}>{cohortSurveyMetrics.totalSubmissions}</span><span style={{ color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>Log Entries</span></div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', borderBottom: '2px solid var(--mlab-border)', paddingBottom: '0px' }}>
                                <button onClick={() => setSurveySubTab('templates')} style={{ padding: '8px 16px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', background: surveySubTab === 'templates' ? 'var(--mlab-blue)' : 'transparent', color: surveySubTab === 'templates' ? 'var(--mlab-white)' : 'var(--mlab-grey)', border: 'none', borderBottom: surveySubTab === 'templates' ? '3px solid var(--mlab-green)' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}><HelpCircle size={14} /> Assigned Surveys ({cohortTargetedSurveys.length})</button>
                                <button onClick={() => setSurveySubTab('responses')} style={{ padding: '8px 16px', fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', background: surveySubTab === 'responses' ? 'var(--mlab-blue)' : 'transparent', color: surveySubTab === 'responses' ? 'var(--mlab-white)' : 'var(--mlab-grey)', border: 'none', borderBottom: surveySubTab === 'responses' ? '3px solid var(--mlab-green)' : '3px solid transparent', display: 'flex', alignItems: 'center', gap: '6px' }}><ClipboardList size={14} /> Survey Submissions ({filteredSurveyResponses.length})</button>
                            </div>

                            {surveySubTab === 'templates' && (
                                <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                    <div className="lfm-header"><h2 className="lfm-header__title"><HelpCircle size={18} /> Assigned Survey Forms ({cohortTargetedSurveys.length})</h2></div>
                                    <div className="lfm-body" style={{ padding: 0 }}>
                                        <div className="mlab-table-wrap">
                                            <table className="mlab-table" style={{ margin: 0 }}>
                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                    <tr>
                                                        <th style={{ color: 'var(--mlab-blue)' }}>Form Title</th>
                                                        <th style={{ color: 'var(--mlab-blue)' }}>Description</th>
                                                        <th style={{ color: 'var(--mlab-blue)' }}>Questions</th>
                                                        <th style={{ color: 'var(--mlab-blue)' }}>Participation</th>
                                                        <th style={{ textAlign: 'right', color: 'var(--mlab-blue)' }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {cohortTargetedSurveys.length === 0 ? (
                                                        <tr><td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>No survey forms assigned strictly to this cohort or its assessments.</td></tr>
                                                    ) : (
                                                        cohortTargetedSurveys.map(survey => {
                                                            const subCount = cohortSurveyResponses.filter(r => r.surveyId === survey.id).length;
                                                            return (
                                                                <tr key={survey.id}>
                                                                    <td><div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{survey.title}</div></td>
                                                                    <td><div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{survey.description || 'No description'}</div></td>
                                                                    <td style={{ fontWeight: 600 }}>{survey.questions?.length || 0} Questions</td>
                                                                    <td><span style={{ fontWeight: 700, color: subCount > 0 ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)' }}>{subCount} / {activeCount}</span></td>
                                                                    <td style={{ textAlign: 'right' }}>
                                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                                            <button onClick={() => handleCopySurveyLink(survey.id)} className="lfm-btn lfm-btn--ghost" style={{ fontSize: '0.72rem', padding: '6px 10px' }}><LinkIcon size={12} /> Share Link</button>
                                                                            <button onClick={() => window.open(`/survey/${survey.id}`, '_blank')} className="lfm-btn lfm-btn--primary" style={{ fontSize: '0.72rem', padding: '6px 10px' }}><Eye size={12} /> Preview</button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {surveySubTab === 'responses' && (
                                <div className="animate-fade-in" style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)' }}>
                                    <div className="lfm-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                        <h2 className="lfm-header__title"><ClipboardList size={18} /> Cohort Survey Submissions ({filteredSurveyResponses.length})</h2>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <div style={{ position: 'relative', width: '220px' }}>
                                                <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                                                <input type="text" className="lfm-input" value={surveySearchQuery} onChange={e => setSurveySearchQuery(e.target.value)} placeholder="Search participant..." style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem' }} />
                                            </div>
                                            <button className="lfm-btn" style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: 'none' }} onClick={exportCohortSurveyExcel}><DownloadCloud size={14} /> Export Feedback</button>
                                        </div>
                                    </div>
                                    <div className="lfm-body" style={{ padding: 0 }}>
                                        <div className="mlab-table-wrap">
                                            {filteredSurveyResponses.length === 0 ? (
                                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}><HelpCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} /><p style={{ fontFamily: 'var(--font-body)', margin: 0 }}>No survey feedback logs found for this cohort.</p></div>
                                            ) : (
                                                <table className="mlab-table" style={{ margin: 0 }}>
                                                    <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                        <tr>
                                                            <th>Date Submitted</th>
                                                            <th>Participant</th>
                                                            <th>Survey Template</th>
                                                            <th>Verification Status</th>
                                                            <th style={{ textAlign: 'center' }}>Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredSurveyResponses.map(resp => {
                                                            const template = surveyTemplates.find(s => s.id === resp.surveyId);
                                                            return (
                                                                <tr key={resp.id}>
                                                                    <td style={{ whiteSpace: 'nowrap' }}>{new Date(resp.submittedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                                                    <td><div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)' }}>{resp.learnerName || 'Anonymous Participant'}</div><div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{resp.learnerEmail || resp.learnerPhone || 'N/A'}</div></td>
                                                                    <td><span style={{ fontWeight: 600, color: 'var(--mlab-blue)' }}>{template?.title || resp.surveyId}</span></td>
                                                                    <td>{resp.isVerifiedRespondent ? <span className="sm-badge-verified"><CheckCircle2 size={12} /> Verified</span> : <span className="sm-badge-unverified">Unverified</span>}</td>
                                                                    <td style={{ textAlign: 'center' }}>
                                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                                                                            <button onClick={() => setViewingSurveyResponse({ response: resp, template })} title="View Submission Details" style={{ background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}><Eye size={14} /></button>
                                                                            <button onClick={() => handleDeleteCohortResponse(resp.id)} title="Delete Response" style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px', borderRadius: '4px', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* MODAL: VIEW COHORT SURVEY RESPONSE DETAILS */}
                    {viewingSurveyResponse && createPortal(
                        <div className="lfm-overlay" onClick={() => setViewingSurveyResponse(null)} style={{ zIndex: 9999 }}>
                            <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '85vh' }}>
                                <div className="lfm-header"><h2 className="lfm-header__title"><HelpCircle size={16} /> Participant Feedback</h2><button className="lfm-close-btn" onClick={() => setViewingSurveyResponse(null)}><X size={20} /></button></div>
                                <div className="lfm-body" style={{ background: '#f8fafc', padding: 0 }}>
                                    <div style={{ padding: '1.25rem', background: '#fff', borderBottom: '1px solid var(--mlab-border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1.2rem', textTransform: 'uppercase' }}>{viewingSurveyResponse.response.learnerName || 'Anonymous'}</h3>
                                            {viewingSurveyResponse.response.isVerifiedRespondent ? <span className="sm-badge-verified"><CheckCircle2 size={12} /> Verified Contact</span> : <span className="sm-badge-unverified">Unverified</span>}
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <span><strong>Survey Form:</strong> {viewingSurveyResponse.template?.title || viewingSurveyResponse.response.surveyId}</span>
                                            <span><strong>Submitted:</strong> {new Date(viewingSurveyResponse.response.submittedAt).toLocaleString('en-ZA')}</span>
                                            {viewingSurveyResponse.response.learnerEmail && <span><strong>Email:</strong> {viewingSurveyResponse.response.learnerEmail}</span>}
                                        </div>
                                    </div>
                                    <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        <h4 style={{ margin: '0 0 0.5rem 0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '0.05em' }}>Feedback Breakdown</h4>
                                        {viewingSurveyResponse.template?.questions?.map((q: any, idx: number) => {
                                            const answer = viewingSurveyResponse.response.answers?.[q.id];
                                            return (
                                                <div key={q.id} style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '1rem' }}>
                                                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'var(--mlab-midnight)', marginBottom: '8px' }}>{idx + 1}. {q.label}</div>
                                                    <div style={{ fontSize: '0.9rem', color: 'var(--mlab-blue)' }}>
                                                        {answer === undefined || answer === '' ? (<span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Skipped / No Answer</span>)
                                                            : q.type === 'rating' ? (<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Star size={16} color="#f59e0b" fill="#f59e0b" /><strong>{answer}</strong> / {q.maxStars || 5}</div>)
                                                                : q.type === 'address' ? (<div style={{ background: 'var(--mlab-bg)', padding: '8px', border: '1px solid var(--mlab-border)', fontSize: '0.8rem' }}><div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}><MapPin size={12} /> {answer.formattedAddress}</div>{answer.localMunicipality && <div style={{ color: 'var(--mlab-grey)' }}>Municipality: {answer.localMunicipality}</div>}{answer.districtOrMetro && <div style={{ color: 'var(--mlab-grey)' }}>District: {answer.districtOrMetro}</div>}{answer.province && <div style={{ color: 'var(--mlab-grey)' }}>Province: {answer.province}</div>}</div>)
                                                                    : (<span style={{ whiteSpace: 'pre-wrap' }}>{String(answer)}</span>)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="lfm-footer" style={{ justifyContent: 'flex-end' }}>
                                    <button type="button" className="lfm-btn lfm-btn--outline" onClick={() => setViewingSurveyResponse(null)} style={{ background: '#fff', border: '1px solid var(--mlab-border)' }}>Close View</button>
                                </div>
                            </div>
                        </div>, document.body
                    )}
                </div>
            </main>
        </div>
    );
};

