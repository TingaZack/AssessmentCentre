// src/pages/CohortDetailsPage/views/BootcampCohortView.tsx

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, Mail, Phone, DownloadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    Search, X, Info, BarChart2, UserMinus, Edit2, Loader2, Video, Layers, History, ChevronDown, ChevronUp, MapPin, Filter, ChevronRight, Globe,
    Timer, PenTool, BookOpen, Award, ShieldCheck, User, Maximize, Minimize
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, updateDoc, writeBatch, increment, getDoc } from 'firebase/firestore';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useToast, ToastContainer } from '../../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../../types';
import { ModuleProgressCard } from '../../../components/common/ModuleProgressCard/ModuleProgressCard';
import { LearnerDropoutModal } from './LearnerDropoutModal';
import moment from 'moment';
import Loader from '../../common/Loader/Loader';

// ─── UTILS & SUB-COMPONENTS ─────────────────────────────────────────────────

// 🚀 MAPPING QCTO PROVINCE CODES TO NAMES & FALLBACK COORDINATES
const PROVINCE_MAP: Record<string, { name: string, lat: number, lng: number }> = {
    '1': { name: 'Western Cape', lat: -33.9249, lng: 18.4241 },
    '2': { name: 'Eastern Cape', lat: -33.9608, lng: 25.6022 },
    '3': { name: 'Northern Cape', lat: -28.7282, lng: 24.7630 },
    '4': { name: 'Free State', lat: -29.1141, lng: 26.2208 },
    '5': { name: 'KwaZulu-Natal', lat: -29.8587, lng: 31.0218 },
    '6': { name: 'North West', lat: -25.8640, lng: 25.6442 },
    '7': { name: 'Gauteng', lat: -26.2041, lng: 28.0473 },
    '8': { name: 'Mpumalanga', lat: -25.4753, lng: 30.9853 },
    '9': { name: 'Limpopo', lat: -23.9045, lng: 29.4688 },
    'N': { name: 'SA National', lat: -28.4793, lng: 24.6727 },
    'X': { name: 'Outside SA', lat: 0, lng: 0 }
};

// Helper to find province info regardless of whether DB stored code ("7") or name ("Gauteng")
const getProvInfo = (provStr: string) => {
    if (!provStr) return null;
    const lowerStr = provStr.toLowerCase();
    const byCode = PROVINCE_MAP[provStr];
    if (byCode) return byCode;
    const byName = Object.values(PROVINCE_MAP).find(p => p.name.toLowerCase() === lowerStr);
    return byName || null;
};

const getLocationString = (l: DashboardLearner): string => {
    const demos = l.demographics || (l as any);
    const provStr = String(demos.provinceCode || demos.province || '').trim();
    const provInfo = getProvInfo(provStr);
    const provName = provInfo?.name || provStr || '';
    const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();
    return town ? `${town}, ${provName}` : (provName || 'Not specified');
};

// ─── SEARCHABLE DROPDOWN COMPONENT ──────────────────────────────────────────
const SearchableLocationDropdown: React.FC<{
    selected: string | null;
    onSelect: (loc: string | null) => void;
    provinces: string[];
    cities: string[];
    hasUnspecified?: boolean;
}> = ({ selected, onSelect, provinces, cities, hasUnspecified }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredProvinces = provinces.filter(p => p.toLowerCase().includes(search.toLowerCase()));
    const filteredCities = cities.filter(c => c.toLowerCase().includes(search.toLowerCase()));

    const handleSelect = (loc: string | null) => {
        onSelect(loc);
        setSearch('');
        setIsOpen(false);
    };

    return (
        <div ref={ref} style={{ position: 'relative', zIndex: 1001 }}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
                    color: 'var(--mlab-white)', fontFamily: 'var(--font-heading)', fontWeight: 700,
                    fontSize: '0.75rem', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0, outline: 'none',
                    display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between', minWidth: '220px'
                }}
            >
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <MapPin size={14} />
                    {selected || 'All Locations'}
                </span>
                <ChevronDown size={14} style={{ flexShrink: 0 }} />
            </button>

            {isOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', zIndex: 1002 }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-bg)' }}>
                        <Search size={14} color="var(--mlab-grey)" />
                        <input
                            type="text"
                            autoFocus
                            placeholder="Search location..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}
                        />
                    </div>
                    <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        <div
                            onClick={() => handleSelect(null)}
                            style={{ padding: '8px 12px', cursor: 'pointer', background: !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: !selected ? 700 : 500, fontSize: '0.8rem' }}
                            onMouseOver={(e) => e.currentTarget.style.background = !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'}
                            onMouseOut={(e) => e.currentTarget.style.background = !selected ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}
                        >
                            All Locations
                        </div>

                        {filteredProvinces.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)', background: 'var(--mlab-bg)', letterSpacing: '0.05em' }}>
                                    Provinces
                                </div>
                                {filteredProvinces.map(loc => (
                                    <div
                                        key={loc}
                                        onClick={() => handleSelect(loc)}
                                        style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}
                                    >
                                        {loc}
                                    </div>
                                ))}
                            </>
                        )}

                        {filteredCities.length > 0 && (
                            <>
                                <div style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)', background: 'var(--mlab-bg)', letterSpacing: '0.05em' }}>
                                    Cities & Municipalities
                                </div>
                                {filteredCities.map(loc => (
                                    <div
                                        key={loc}
                                        onClick={() => handleSelect(loc)}
                                        style={{ padding: '8px 12px', cursor: 'pointer', background: selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === loc ? 700 : 500, fontSize: '0.8rem' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-bg)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = selected === loc ? 'var(--mlab-light-blue)' : 'var(--mlab-white)'}
                                    >
                                        {loc}
                                    </div>
                                ))}
                            </>
                        )}

                        {hasUnspecified && search.toLowerCase().includes('not') && (
                            <div
                                onClick={() => handleSelect('Not specified')}
                                style={{ padding: '8px 12px', cursor: 'pointer', background: selected === 'Not specified' ? 'var(--mlab-light-blue)' : 'var(--mlab-white)', color: 'var(--mlab-blue)', fontWeight: selected === 'Not specified' ? 700 : 500, fontSize: '0.8rem' }}
                            >
                                Not specified
                            </div>
                        )}

                        {filteredProvinces.length === 0 && filteredCities.length === 0 && (!hasUnspecified || !search.toLowerCase().includes('not')) && (
                            <div style={{ padding: '12px', textAlign: 'center', color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>
                                No locations found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── MAP CONTROLLER ─────────────────────────────────────────────────────────
const MapController: React.FC<{ target: [number, number] | null, zoomLevel: number, isFullscreen: boolean }> = ({ target, zoomLevel, isFullscreen }) => {
    const map = useMap();

    useEffect(() => {
        if (target) {
            map.flyTo(target, zoomLevel, { duration: 1.5 });
        } else {
            map.flyTo([-28.4793, 24.6727], isFullscreen ? 6 : 5, { duration: 1.5 });
        }
    }, [target, zoomLevel, isFullscreen, map]);

    return null;
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const activeTab = (searchParams.get('tab') as 'learners' | 'calendar' | 'attendance') || 'learners';
    const setActiveTab = (tab: 'learners' | 'calendar' | 'attendance') => updateUrlParams({ tab });

    const [isMatrixExpanded, setIsMatrixExpanded] = useState(true);
    const [isMapFullscreen, setIsMapFullscreen] = useState(false);

    const urlSearchTerm = searchParams.get('search') || '';
    const statusFilter = (searchParams.get('status') as 'all' | 'active' | 'dropped') || 'all';
    const attendanceFilter = searchParams.get('attendance') || 'all';
    const activationFilter = (searchParams.get('activation') as 'all' | 'activated' | 'never') || 'all';
    const locationFilter = searchParams.get('location') || 'all';
    const customMinPct = searchParams.get('minPct') !== null ? Number(searchParams.get('minPct')) : '';
    const customMaxPct = searchParams.get('maxPct') !== null ? Number(searchParams.get('maxPct')) : '';

    // Sync Map Dropdown directly to the URL parameter
    const [selectedMapLocation, setSelectedMapLocation] = useState<string | null>(locationFilter === 'all' ? null : locationFilter);

    useEffect(() => {
        setSelectedMapLocation(locationFilter === 'all' ? null : locationFilter);
    }, [locationFilter]);

    const [editingLog, setEditingLog] = useState<any | null>(null);
    const [editLogTitle, setEditLogTitle] = useState('');
    const [editLogDesc, setEditLogDesc] = useState('');
    const [editLogZoomLink, setEditLogZoomLink] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const [showKPIs, setShowKPIs] = useState(true);

    const [liveEnrollments, setLiveEnrollments] = useState<any[]>([]);
    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
    const [enrolledLearners, setEnrolledLearners] = useState<DashboardLearner[]>([]);
    const [cohortAnalytics, setCohortAnalytics] = useState<any>(null);
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);

    const [learnerToDrop, setLearnerToDrop] = useState<DashboardLearner | null>(null);

    const [calendarMonth, setCalendarMonth] = useState(moment());
    const handlePrevMonth = () => setCalendarMonth(prev => prev.clone().subtract(1, 'month'));
    const handleNextMonth = () => setCalendarMonth(prev => prev.clone().add(1, 'month'));

    const calendarGrid = useMemo(() => {
        const startDay = calendarMonth.clone().startOf('month').startOf('week');
        const endDay = calendarMonth.clone().endOf('month').endOf('week');
        const day = startDay.clone().subtract(1, 'day');
        const grid = [];
        while (day.isBefore(endDay, 'day')) {
            grid.push(day.add(1, 'day').clone());
        }
        return grid;
    }, [calendarMonth]);

    const logsByDate = useMemo(() => {
        const map = new Map<string, any[]>();
        attendanceLogs.forEach(log => {
            if (!log.sessionDate) return;
            const d = log.sessionDate.split('T')[0];
            if (!map.has(d)) map.set(d, []);
            map.get(d)!.push(log);
        });
        return map;
    }, [attendanceLogs]);

    useEffect(() => {
        if (!cohort?.id) return;
        const qEnrollments = query(collection(db, 'enrollments'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(qEnrollments, (snapshot) => {
            setLiveEnrollments(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [cohort?.id]);

    useEffect(() => {
        if (!cohort?.id || learners.length === 0) return;

        const uniqueMap = new Map<string, DashboardLearner>();

        liveEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);

            if (profile) {
                uniqueMap.set(profile.idNumber || profile.id, {
                    ...profile,
                    ...enrollment,
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

    const [submissions, setSubmissions] = useState<any[]>([]);
    const [isGrantingTime, setIsGrantingTime] = useState(false);
    const [isAssessmentsExpanded, setIsAssessmentsExpanded] = useState<boolean>(false);
    const [assessmentFilter, setAssessmentFilter] = useState<'all' | 'writing' | 'pending'>('all');
    const [expandedAssessments, setExpandedAssessments] = useState<Set<string>>(new Set());

    const toggleAssessmentAccordion = (id: string) => {
        setExpandedAssessments(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    const [attendanceBands] = useState([
        { id: 'pct_0', min: 0, max: 0, label: 'No Attendance / Not Started (0%)', color: '#94a3b8' },
        { id: 'pct_1_49', min: 1, max: 49, label: 'Critical Risk (1% - 49%)', color: '#ef4444' },
        { id: 'pct_50_59', min: 50, max: 59, label: 'Low Engagement (50% - 59%)', color: '#f97316' },
        { id: 'pct_60_69', min: 60, max: 69, label: 'Moderate Engagement (60% - 69%)', color: '#facc15' },
        { id: 'pct_70_79', min: 70, max: 79, label: 'Satisfactory (70% - 79%)', color: '#3b82f6' },
        { id: 'pct_80_89', min: 80, max: 89, label: 'High Compliance (80% - 89%)', color: '#22c55e' },
        { id: 'pct_90_100', min: 90, max: 100, label: 'Exceptional (90%+)', color: '#15803d' }
    ]);

    const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);

    useEffect(() => {
        const handler = setTimeout(() => {
            updateUrlParams({ search: localSearchTerm || null });
        }, 400);
        return () => clearTimeout(handler);
    }, [localSearchTerm]);

    useEffect(() => {
        setLocalSearchTerm(urlSearchTerm);
    }, [urlSearchTerm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [urlSearchTerm, statusFilter, attendanceFilter, activationFilter, locationFilter, customMinPct, customMaxPct]);

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

    const isAdmin = user?.role === 'admin';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

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

        const qRecords = query(collection(db, 'attendance_records'), where('cohortId', '==', cohort.id));
        const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
            setAttendanceRecords(snapshot.docs.map(doc => doc.data()));
        });

        return () => unsubscribeRecords();
    }, [cohort]);

    useEffect(() => {
        if (!cohort?.id) return;
        const q = query(collection(db, 'learner_submissions'), where('cohortId', '==', cohort.id));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setSubmissions(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (error) => {
            console.error('Error fetching submissions:', error);
        });
        return () => unsubscribe();
    }, [cohort.id]);

    useEffect(() => {
        if (enrolledLearners.length === 0) return;

        const map = new Map<string, { attended: number; total: number; pct: number; totalMinutes: number }>();
        const totalSessions = attendanceLogs.length;

        attendanceRecords.forEach(rec => {
            if (!rec.learnerId) return;
            if (!map.has(rec.learnerId)) {
                map.set(rec.learnerId, { attended: 0, total: totalSessions, pct: 0, totalMinutes: 0 });
            }
            const entry = map.get(rec.learnerId)!;
            if (rec.status === 'Present' || rec.status === 'Partial') {
                entry.attended += 1;
            }
            entry.totalMinutes += (rec.actualDuration || rec.durationRecorded || 0);
        });

        map.forEach(value => {
            value.total = totalSessions;
            value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
        });

        let totalCohortHours = 0;
        let sumActiveAttendancePct = 0;
        let highPerformers = 0;
        let atRisk = 0;
        let ghosting = 0;

        let totalMaleCount = 0;
        let totalFemaleCount = 0;

        let activeMaleCount = 0;
        let activeFemaleCount = 0;
        let totalActivatedLearners = 0;

        const bandResults = attendanceBands.map(b => ({ ...b, total: 0, male: 0, female: 0 }));
        const totalExpectedMinutes = attendanceLogs.reduce((acc, log) => acc + (log.expectedDuration || 120), 0);

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
                if (pct < 50 && attendanceLogs.length > 0) atRisk++;

                if (totalExpectedMinutes > 200 && totalMins < 200) {
                    ghosting++;
                }

                if (isMale) activeMaleCount++;
                if (isFemale) activeFemaleCount++;
            }

            let bandIndex = 0;
            if (pct === 0) bandIndex = 0;
            else if (pct > 0 && pct < 50) bandIndex = 1;
            else if (pct >= 50 && pct < 60) bandIndex = 2;
            else if (pct >= 60 && pct < 70) bandIndex = 3;
            else if (pct >= 70 && pct < 80) bandIndex = 4;
            else if (pct >= 80 && pct < 90) bandIndex = 5;
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
            rosterAttendanceMap: map,
            totalCohortHours: Math.round(totalCohortHours),
            avgAttendance,
            highPerformers,
            atRisk,
            ghosting,
            avgHoursPerLearner,
            totalMaleCount,
            totalFemaleCount,
            totalFemalePct,
            totalMalePct,
            activeMaleCount,
            activeFemaleCount,
            activeFemalePct,
            activeMalePct,
            totalActivatedLearners,
            activationRate,
            systemActiveCount,
            droppedCount,
            totalCount,
            globalRetention,
            bandResults,
            baseLength: enrolledLearners.length
        });

    }, [enrolledLearners, attendanceRecords, attendanceLogs, attendanceBands]);

    // 🚀 DYNAMIC PROVINCES & CITIES EXTRACTION
    const dynamicLocations = useMemo(() => {
        const provinces = new Set<string>();
        const cities = new Set<string>();
        let hasUnspecified = false;

        enrolledLearners.forEach(l => {
            const demos = l.demographics || (l as any);
            const provStr = String(demos.provinceCode || demos.province || '').trim();
            const provInfo = getProvInfo(provStr);
            const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();

            if (provInfo) {
                provinces.add(provInfo.name);
            } else if (provStr) {
                provinces.add(provStr);
            } else if (!town) {
                hasUnspecified = true;
            }

            if (town) {
                cities.add(town);
            } else if (!provStr) {
                hasUnspecified = true;
            }
        });

        return {
            provinces: Array.from(provinces).sort(),
            cities: Array.from(cities).sort(),
            hasUnspecified
        };
    }, [enrolledLearners]);

    const locationStats = useMemo(() => {
        const stats = new Map<string, { lat: number, lng: number, count: number, name: string, latLngs: [number, number][] }>();

        enrolledLearners.forEach(l => {
            const demos = l.demographics || (l as any);
            const provStr = String(demos.provinceCode || demos.province || '').trim();
            const provInfo = getProvInfo(provStr) || { name: 'Unknown', lat: -28.4793, lng: 24.6727 };
            const town = String(demos.learnerHomeAddress2 || demos.city || '').trim();

            let lat = typeof demos.lat === 'number' ? demos.lat : parseFloat(demos.lat);
            let lng = typeof demos.lng === 'number' ? demos.lng : parseFloat(demos.lng);
            if (isNaN(lat)) lat = null;
            if (isNaN(lng)) lng = null;

            const groupName = town || `Unknown Area (${provInfo.name})`;

            if (!stats.has(groupName)) {
                stats.set(groupName, { lat: provInfo.lat, lng: provInfo.lng, count: 0, name: groupName, latLngs: [] });
            }
            const entry = stats.get(groupName)!;
            entry.count++;
            if (lat !== null && lng !== null) entry.latLngs.push([lat, lng]);
        });

        return Array.from(stats.values()).map(stat => {
            if (stat.latLngs.length > 0) {
                const avgLat = stat.latLngs.reduce((sum, l) => sum + l[0], 0) / stat.latLngs.length;
                const avgLng = stat.latLngs.reduce((sum, l) => sum + l[1], 0) / stat.latLngs.length;
                return { ...stat, lat: avgLat, lng: avgLng };
            }
            return stat;
        });
    }, [enrolledLearners]);

    // 🚀 TARGET COORDINATES LOOKUP (FOR BOTH PROVINCES AND CITIES)
    const targetCoordsLookup = useMemo(() => {
        const lookup = new Map<string, [number, number]>();
        const provData = new Map<string, { latLngs: [number, number][] }>();
        const cityData = new Map<string, { latLngs: [number, number][] }>();

        enrolledLearners.forEach(l => {
            const demos = l.demographics || (l as any);
            const provStr = String(demos.provinceCode || demos.province || '').trim();
            const provInfo = getProvInfo(provStr);
            const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();

            let lat = typeof demos.lat === 'number' ? demos.lat : parseFloat(demos.lat);
            let lng = typeof demos.lng === 'number' ? demos.lng : parseFloat(demos.lng);
            if (isNaN(lat)) lat = null;
            if (isNaN(lng)) lng = null;

            if (provInfo) {
                if (!provData.has(provInfo.name)) provData.set(provInfo.name, { latLngs: [] });
                if (lat !== null && lng !== null) provData.get(provInfo.name)!.latLngs.push([lat, lng]);
            } else if (provStr) {
                if (!provData.has(provStr)) provData.set(provStr, { latLngs: [] });
                if (lat !== null && lng !== null) provData.get(provStr)!.latLngs.push([lat, lng]);
            }

            if (town) {
                if (!cityData.has(town)) cityData.set(town, { latLngs: [] });
                if (lat !== null && lng !== null) cityData.get(town)!.latLngs.push([lat, lng]);
            }
        });

        provData.forEach((data, name) => {
            if (data.latLngs.length > 0) {
                const avgLat = data.latLngs.reduce((s, l) => s + l[0], 0) / data.latLngs.length;
                const avgLng = data.latLngs.reduce((s, l) => s + l[1], 0) / data.latLngs.length;
                lookup.set(name, [avgLat, avgLng]);
            } else {
                const info = Object.values(PROVINCE_MAP).find(p => p.name === name);
                if (info) {
                    lookup.set(name, [info.lat, info.lng]);
                }
            }
        });

        cityData.forEach((data, name) => {
            if (data.latLngs.length > 0) {
                const avgLat = data.latLngs.reduce((s, l) => s + l[0], 0) / data.latLngs.length;
                const avgLng = data.latLngs.reduce((s, l) => s + l[1], 0) / data.latLngs.length;
                lookup.set(name, [avgLat, avgLng]);
            }
        });

        return lookup;
    }, [enrolledLearners]);

    const targetCoords = useMemo(() => {
        if (!selectedMapLocation) return null;
        return targetCoordsLookup.get(selectedMapLocation) || null;
    }, [selectedMapLocation, targetCoordsLookup]);

    const filteredLearners = useMemo(() => {
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

            // 🚀 ROBUST LOCATION MATCHING (Complements other filters)
            const matchesLocation = locationFilter === 'all' || (() => {
                const demos = learner.demographics || (learner as any);
                const provStr = String(demos.provinceCode || demos.province || '').trim();
                const provInfo = getProvInfo(provStr);
                const provName = provInfo?.name || provStr;
                const town = String(demos.learnerHomeAddress2 || demos.city || demos.town || '').trim();

                if (locationFilter === 'Not specified') {
                    return !provStr && !town;
                }

                const filterLower = locationFilter.toLowerCase().trim();

                if (provName && provName.toLowerCase() === filterLower) return true;
                if (town && town.toLowerCase() === filterLower) return true;

                // Fallback: check if the combined string contains it
                const fullLocStr = locationString.toLowerCase();
                if (fullLocStr.includes(filterLower)) return true;

                return false;
            })();

            if (!matchesSearch || !matchesStatus || !matchesLocation) return false;

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
    }, [enrolledLearners, urlSearchTerm, statusFilter, attendanceFilter, activationFilter, locationFilter, customMinPct, customMaxPct, cohortAnalytics]);

    const totalPages = Math.ceil(filteredLearners.length / ITEMS_PER_PAGE);
    const paginatedLearners = filteredLearners.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    const filteredAttendanceLogs = useMemo(() => {
        if (ledgerDates.length === 0) return attendanceLogs;
        return attendanceLogs.filter(log => {
            const logDate = log.sessionDate ? log.sessionDate.split('T')[0] : '';
            return ledgerDates.includes(logDate);
        });
    }, [attendanceLogs, ledgerDates]);

    const handleAddLedgerDate = (e: React.ChangeEvent<HTMLInputElement>) => {
        const date = e.target.value;
        if (date && !ledgerDates.includes(date)) {
            setLedgerDates([...ledgerDates, date]);
        }
    };

    const removeLedgerDate = (dateToRemove: string) => {
        setLedgerDates(ledgerDates.filter(d => d !== dateToRemove));
    };

    const assessmentStatsMap = useMemo(() => {
        const map = new Map<string, {
            assessmentId: string,
            title: string,
            writing: any[],
            pending: any[],
            graded: any[],
            learnerNamesWriting: string[]
        }>();

        submissions.forEach(s => {
            if (!['in_progress', 'submitted', 'graded', 'moderated'].includes(s.status)) return;

            if (!map.has(s.assessmentId)) {
                map.set(s.assessmentId, {
                    assessmentId: s.assessmentId,
                    title: s.title || 'Unknown Assessment',
                    writing: [], pending: [], graded: [], learnerNamesWriting: []
                });
            }

            const entry = map.get(s.assessmentId)!;

            if (s.status === 'in_progress') {
                entry.writing.push(s);
                const matchedLearner = enrolledLearners.find(l => l.learnerId === s.learnerId || l.id === s.learnerId || l.enrollmentId === s.enrollmentId);
                if (matchedLearner) entry.learnerNamesWriting.push(matchedLearner.fullName);
            } else if (s.status === 'submitted') {
                entry.pending.push(s);
            } else if (s.status === 'graded' || s.status === 'moderated') {
                entry.graded.push(s);
            }
        });

        return Array.from(map.values()).filter(e => e.writing.length > 0 || e.pending.length > 0);
    }, [submissions, enrolledLearners]);

    const filteredAssessments = useMemo(() => {
        if (assessmentFilter === 'writing') return assessmentStatsMap.filter(a => a.writing.length > 0);
        if (assessmentFilter === 'pending') return assessmentStatsMap.filter(a => a.pending.length > 0);
        return assessmentStatsMap;
    }, [assessmentStatsMap, assessmentFilter]);

    const totalWriting = assessmentStatsMap.reduce((acc, curr) => acc + curr.writing.length, 0);
    const totalPending = assessmentStatsMap.reduce((acc, curr) => acc + curr.pending.length, 0);

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

    const handleExport = () => {
        if (filteredLearners.length === 0 || !cohortAnalytics) {
            toast.error('No matching records to export.');
            return;
        }

        const dataRows = filteredLearners.map(l => {
            const stats = cohortAnalytics.rosterAttendanceMap.get(l.learnerId || l.id);
            const pct = stats ? Math.round(stats.pct) : 0;
            const totalMins = stats ? stats.totalMinutes : 0;
            const attended = stats ? stats.attended : 0;
            const isActivated = totalMins > 0;
            const isDropped = l.status === 'dropped';

            const locationStr = getLocationString(l);

            return {
                "Full Name": l.fullName,
                "ID Number": l.idNumber,
                "Email Address": l.email || l.demographics?.learnerEmailAddress || 'N/A',
                "Phone Number": l.phone || l.mobile || l.demographics?.learnerPhoneNumber || 'N/A',
                "Location": locationStr,
                "Activation Status": isActivated ? 'Started' : 'Never Attended',
                "Attendance Score": `${attended}/${attendanceLogs.length} (${pct}%)`,
                "Total Time (Mins)": totalMins,
                "Total Time (Hrs)": (totalMins / 60).toFixed(1),
                "Status": isDropped ? 'Withdrawn' : (isActivated ? 'Active Applicant' : 'Not Started'),
                "Enrolled Date": l.createdAt?.split('T')[0] || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bootcamp Roster');
        XLSX.writeFile(wb, `Bootcamp_Analytics_${cohort.name.replace(/\s+/g, '_')}.xlsx`);
        toast.success('Roster exported successfully with tracking metrics.');
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
            await updateDoc(doc(db, 'attendance_logs', editingLog.id), {
                sessionTitle: editLogTitle.trim(),
                sessionDescription: editLogDesc.trim(),
                sessionZoomLink: editLogZoomLink.trim(),
                lastEditedBy: user?.uid,
                lastEditedAt: new Date().toISOString()
            });
            toast.success("Session details updated successfully.");
            setEditingLog(null);
        } catch (err) {
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

    if (!cohortAnalytics) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />
                <main className="cdp-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader message='Loading Deep Analytics..' />
                </main>
            </div>
        )
    }

    const renderMapComponent = (isFullscreen: boolean) => (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--mlab-white)' }}>

            <div
                className="lfm-header"
                style={{
                    padding: isFullscreen ? '1rem 1.5rem' : '1rem', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap'
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <MapPin size={isFullscreen ? 20 : 16} />
                    <h2 style={{
                        margin: 0, fontFamily: 'var(--font-heading)',
                        fontSize: isFullscreen ? '1.2rem' : '0.9rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em'
                    }}>
                        Applicant Geo-Concentration {isFullscreen ? "(Full Screen View)" : ""}
                    </h2>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <SearchableLocationDropdown
                        selected={selectedMapLocation}
                        onSelect={(loc) => updateUrlParams({ location: loc })}
                        provinces={dynamicLocations.provinces}
                        cities={dynamicLocations.cities}
                        hasUnspecified={dynamicLocations.hasUnspecified}
                    />

                    {isFullscreen ? (
                        <button
                            onClick={() => setIsMapFullscreen(false)}
                            style={{
                                background: 'var(--mlab-red)', color: 'white', border: 'none',
                                padding: '8px 16px', cursor: 'pointer', display: 'flex',
                                alignItems: 'center', gap: '8px', fontWeight: 700,
                                fontFamily: 'var(--font-heading)', textTransform: 'uppercase',
                                borderRadius: 0, boxShadow: '0 4px 12px rgba(239,68,68,0.4)'
                            }}
                        >
                            <Minimize size={16} /> Exit
                        </button>
                    ) : (
                        <button
                            onClick={() => setIsMapFullscreen(true)}
                            style={{
                                background: 'var(--mlab-white)', border: '2px solid var(--mlab-blue)',
                                padding: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: 'var(--mlab-blue)', borderRadius: 0
                            }}
                            title="View Full Screen"
                        >
                            <Maximize size={16} />
                        </button>
                    )}
                </div>
            </div>

            <div style={{ height: isFullscreen ? 'calc(100vh - 65px)' : '350px', width: '100%', position: 'relative', flex: isFullscreen ? 1 : 'none' }}>
                <MapContainer
                    key={isFullscreen ? "fullscreen-cohort-map" : "inline-cohort-map"}
                    center={[-28.4793, 24.6727]}
                    zoom={isFullscreen ? 6 : 5}
                    style={{ height: '100%', width: '100%', zIndex: 1 }}
                    zoomControl={false}
                >
                    <TileLayer
                        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                        attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
                    />
                    {isFullscreen && <ZoomControl position="bottomleft" />}

                    <MapController
                        target={targetCoords}
                        zoomLevel={isFullscreen ? 10 : 8}
                        isFullscreen={isFullscreen}
                    />

                    {locationStats.map((loc, i) => (
                        <CircleMarker
                            key={i}
                            center={[loc.lat, loc.lng]}
                            radius={Math.max(8, Math.min(30, loc.count * 2))}
                            fillColor="var(--mlab-green)"
                            color="var(--mlab-green-dark)"
                            weight={1}
                            opacity={0.8}
                            fillOpacity={0.6}
                        >
                            <LeafletTooltip>
                                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem' }}>
                                    <strong>{loc.name}</strong><br />
                                    {loc.count} Learner{loc.count !== 1 ? 's' : ''}
                                </div>
                            </LeafletTooltip>
                        </CircleMarker>
                    ))}
                </MapContainer>
            </div>
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
            `}</style>

            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {learnerToDrop && (
                <LearnerDropoutModal
                    learner={learnerToDrop}
                    onClose={() => setLearnerToDrop(null)}
                    onConfirm={handleConfirmDrop}
                />
            )}

            {editingLog && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setEditingLog(null)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', borderRadius: 0, border: '2px solid var(--mlab-border)' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                            <div className="wm-modal__header-icon" style={{ background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: 0, border: '1px solid var(--mlab-border)' }}><Edit2 size={20} /></div>
                            <div>
                                <h2 className="wm-modal__title">Edit Session Details</h2>
                                <p className="wm-modal__subtitle">
                                    {new Date(editingLog.sessionDate.split('T')[0]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
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
                </div>,
                document.body
            )}

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header" style={{ borderBottom: '3px solid var(--mlab-green)' }}>
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack} style={{ borderRadius: 0 }}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Analytics & Funnel</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className="cdp-header__status cdp-header__status--active" style={{ borderRadius: 0 }}>Bootcamp Active</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        <button className="cdp-btn cdp-btn--outline" style={{ borderRadius: 0 }} onClick={handleExport}>
                            <DownloadCloud size={13} /> Export Analytics
                        </button>
                    </div>
                </header>

                <div className="cdp-content">

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
                        <button
                            onClick={() => setShowKPIs(!showKPIs)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                background: 'transparent', border: 'none', color: 'var(--mlab-grey)',
                                fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700,
                                textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'pointer', transition: 'color 0.2s'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.color = 'var(--mlab-blue)'}
                            onMouseOut={(e) => e.currentTarget.style.color = 'var(--mlab-grey)'}
                        >
                            {showKPIs ? <><ChevronUp size={14} /> Hide Performance Insights</> : <><ChevronDown size={14} /> Show Performance Insights</>}
                        </button>
                    </div>

                    {showKPIs && cohortAnalytics && (
                        <>
                            <div className="mc-cards-wrapper animate-slide-down">
                                <ModuleProgressCard
                                    type="Global Retention"
                                    data={{ total: cohortAnalytics.totalCount || 1, logged: cohortAnalytics.systemActiveCount || 0 }}
                                />
                                <ModuleProgressCard
                                    type="Pipeline Activation"
                                    data={{ total: cohortAnalytics.totalCount || 1, logged: cohortAnalytics.totalActivatedLearners || 0 }}
                                />
                                <ModuleProgressCard
                                    type="Active Attendance"
                                    data={{ total: 100, logged: cohortAnalytics.avgAttendance || 0 }}
                                />
                                <ModuleProgressCard
                                    type="Total Training Time"
                                    data={{ total: cohortAnalytics.totalCohortHours > 0 ? cohortAnalytics.totalCohortHours : 1, logged: cohortAnalytics.totalCohortHours || 0 }}
                                />
                            </div>

                            {/* INTERACTIVE MAP + MATRIX ROW */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>

                                {/* DOM-BOUND INLINE MAP */}
                                <div style={{ border: '2px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column' }}>
                                    {!isMapFullscreen && renderMapComponent(false)}
                                </div>

                                {/*  WORMHOLE-BOUND FULLSCREEN MAP */}
                                {isMapFullscreen && createPortal(
                                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999999, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column' }}>
                                        {renderMapComponent(true)}
                                    </div>,
                                    document.body
                                )}

                                {/* Right Side: Matrix */}
                                <div style={{ border: '2px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)', display: 'flex', flexDirection: 'column' }}>
                                    <div
                                        className="lfm-header"
                                        onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <h2 className="lfm-header__title">
                                            <BarChart2 size={18} /> Interactive Compliance Distribution Matrix (Click to Filter)
                                        </h2>
                                        <div style={{ color: 'var(--mlab-white)' }}>
                                            {isMatrixExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                        </div>
                                    </div>

                                    {isMatrixExpanded && (
                                        <div className="lfm-body animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem 1.5rem', background: 'var(--mlab-white)', overflowY: 'auto', maxHeight: '350px' }}>
                                            {cohortAnalytics.bandResults.filter((b: any) => b.total > 0).map((band: any) => {
                                                const totalPct = cohortAnalytics.baseLength > 0 ? Math.round((band.total / cohortAnalytics.baseLength) * 100) : 0;
                                                const malePct = band.total > 0 ? Math.round((band.male / band.total) * 100) : 0;
                                                const femalePct = band.total > 0 ? Math.round((band.female / band.total) * 100) : 0;
                                                const isActive = attendanceFilter === band.id;

                                                return (
                                                    <div
                                                        key={band.id}
                                                        onClick={() => updateUrlParams({ attendance: isActive ? 'all' : band.id, tab: 'learners' })}
                                                        style={{
                                                            display: 'grid', gridTemplateColumns: '1fr', gap: '8px',
                                                            padding: '10px 16px', borderRadius: 0, cursor: 'pointer',
                                                            background: isActive ? `${band.color}15` : 'var(--mlab-bg)',
                                                            borderStyle: 'solid',
                                                            borderWidth: '1px 1px 1px 4px',
                                                            borderColor: isActive ? `${band.color}40 ${band.color}40 ${band.color}40 ${band.color}` : 'var(--mlab-border)',
                                                            transition: 'all 0.2s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isActive ? band.color : 'var(--mlab-midnight)' }}>{band.label}</span>
                                                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{band.total} learners ({totalPct}%)</span>
                                                        </div>
                                                        <div>
                                                            <div style={{ width: '100%', background: '#e2e8f0', height: '6px', borderRadius: 0, overflow: 'hidden', marginBottom: '6px' }}>
                                                                <div style={{ width: `${totalPct}%`, background: band.color, height: '100%', transition: 'width 0.5s ease' }} />
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.7rem', fontWeight: 600 }}>
                                                                <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={10} /> M: <strong>{band.male}</strong> ({malePct}%)</span>
                                                                <span style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: '4px' }}><User size={10} /> F: <strong>{band.female}</strong> ({femalePct}%)</span>
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

                    {/* PERMANENTLY VISIBLE COHORT META DATA */}
                    <div className="mc-cards-wrapper">

                        {/* Timeline Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Duration</div>
                                    <div className="mc-title">Cohort Timeline</div>
                                </div>
                                <Calendar size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
                                <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Start Date</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.startDate}</div>
                                </div>
                                <div style={{ background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '10px', flex: 1 }}>
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>End Date</div>
                                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>{cohort.endDate}</div>
                                </div>
                            </div>
                        </div>

                        {/* Facilitator Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Facilitator</div>
                                </div>
                                <Users size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '1px solid var(--mlab-border)', flexShrink: 0 }}>
                                    {facName === 'Unassigned' || facName === 'Loading...' ? '?' : facName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{facName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Primary Instructor</span>
                                </div>
                            </div>
                        </div>

                        {/* Assessor Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Assessor</div>
                                </div>
                                <Award size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '1px solid var(--mlab-border)', flexShrink: 0 }}>
                                    {assName === 'Unassigned' || assName === 'Loading...' ? '?' : assName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: 'var(--mlab-blue)' }}>{assName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Grading & Evaluation</span>
                                </div>
                            </div>
                        </div>

                        {/* Moderator Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Assigned Staff</div>
                                    <div className="mc-title">Moderator</div>
                                </div>
                                <ShieldCheck size={20} color="var(--mlab-blue)" />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto', background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', padding: '12px' }}>
                                <div style={{ width: '36px', height: '36px', background: 'var(--mlab-white)', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontWeight: 'bold', fontSize: '1rem', border: '1px solid var(--mlab-border)', flexShrink: 0 }}>
                                    {modName === 'Unassigned' || modName === 'Loading...' ? '?' : modName.charAt(0)}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', fontWeight: 700, color: modName === 'Unassigned' ? 'var(--mlab-grey)' : 'var(--mlab-blue)' }}>{modName}</span>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Internal Quality Assurance</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {assessmentStatsMap.length > 0 && (
                        <div style={{ border: '2px solid var(--mlab-blue)', background: 'var(--mlab-white)', marginBottom: '2rem', borderRadius: 0 }}>

                            {/* MASTER HEADER */}
                            <div
                                className="lfm-header"
                                onClick={() => setIsAssessmentsExpanded(!isAssessmentsExpanded)}
                                style={{ cursor: 'pointer' }}
                            >
                                <h2 className="lfm-header__title">
                                    <BookOpen size={18} /> Assessment Operations Center
                                </h2>

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
                                    <div style={{ color: 'var(--mlab-white)' }}>
                                        {isAssessmentsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                    </div>
                                </div>
                            </div>

                            {/* EXPANDED CONTENT */}
                            {isAssessmentsExpanded && (
                                <div className="lfm-body animate-slide-down" style={{ padding: '1.5rem', background: 'var(--mlab-bg)' }}>

                                    {/* Filters */}
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--mlab-grey)', textTransform: 'uppercase', marginRight: '10px' }}><Filter size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> Filter Views:</span>
                                        <button onClick={() => setAssessmentFilter('all')} className={`lfm-btn ${assessmentFilter === 'all' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>All Operations</button>
                                        <button onClick={() => setAssessmentFilter('writing')} className={`lfm-btn ${assessmentFilter === 'writing' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Live Sessions Only</button>
                                        <button onClick={() => setAssessmentFilter('pending')} className={`lfm-btn ${assessmentFilter === 'pending' ? 'lfm-btn--primary' : 'lfm-btn--ghost'}`}>Awaiting Marking</button>
                                    </div>

                                    {/* Flat List */}
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
                                                    <div key={exam.assessmentId} className="animate-fade-in" style={{
                                                        background: 'var(--mlab-white)',
                                                        border: isLive ? '1px solid var(--mlab-red)' : hasPending ? '1px solid #f59e0b' : '1px solid var(--mlab-border)',
                                                        borderRadius: 0,
                                                        overflow: 'hidden',
                                                        transition: 'all 0.3s ease'
                                                    }}>
                                                        <div onClick={() => toggleAssessmentAccordion(exam.assessmentId)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--mlab-border)' : 'none', background: isExpanded ? 'var(--mlab-bg)' : 'var(--mlab-white)' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1 }}>
                                                                <div style={{ color: 'var(--mlab-blue)' }}>
                                                                    <BookOpen size={20} />
                                                                </div>
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
                                                            <div style={{ color: 'var(--mlab-blue)' }}>
                                                                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                                            </div>
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

                    {/* TAB NAVIGATION */}
                    <div className="lfm-tabs" style={{ marginBottom: '2rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
                            <Users size={16} /> Applicant Roster
                        </button>
                        <button className={`lfm-tab ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>
                            <Calendar size={16} /> Calendar & Sessions
                        </button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
                            <UserCheck size={16} /> Attendance Tracker
                        </button>
                    </div>

                    {/* ─── TAB 1: LEARNER ROSTER ─── */}
                    {activeTab === 'learners' && (
                        <div className="animate-fade-in" style={{ border: '1px solid var(--mlab-border)', background: 'var(--mlab-white)', borderRadius: 0 }}>
                            <div className="lfm-header">
                                <h2 className="lfm-header__title"><Users size={16} /> Enrolled Learners ({filteredLearners.length})</h2>
                            </div>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem', backgroundColor: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                    <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input type="text" className="lfm-input" placeholder="Search name, ID or email..." value={localSearchTerm} onChange={(e) => setLocalSearchTerm(e.target.value)} style={{ paddingLeft: '36px', borderRadius: 0 }} />
                                </div>

                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Status:</label>
                                        <select className="lfm-input lfm-select" value={statusFilter} onChange={(e) => updateUrlParams({ status: e.target.value })} style={{ minWidth: '150px', borderRadius: 0 }}>
                                            <option value="all">All Applicants</option>
                                            <option value="active">Active Only</option>
                                            <option value="dropped">Withdrawn Only</option>
                                        </select>
                                    </div>

                                    <div className="lfm-fg" style={{ gap: '4px' }}>
                                        <label>Location:</label>
                                        <select className="lfm-input lfm-select" value={locationFilter} onChange={(e) => updateUrlParams({ location: e.target.value })} style={{ minWidth: '150px', borderRadius: 0 }}>
                                            <option value="all">All Locations</option>
                                            {dynamicLocations.provinces.length > 0 && (
                                                <optgroup label="Provinces">
                                                    {dynamicLocations.provinces.map(loc => <option key={loc} value={loc}>{loc}</option>)}
                                                </optgroup>
                                            )}
                                            {dynamicLocations.cities.length > 0 && (
                                                <optgroup label="Cities & Municipalities">
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
                                                {attendanceBands.map(b => (
                                                    <option key={b.id} value={b.id}>{b.label}</option>
                                                ))}
                                                <option value="custom">⚙️ Custom Range...</option>
                                            </select>

                                            {attendanceFilter === 'custom' && (
                                                <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                    <input
                                                        type="number" min="0" max="100" placeholder="Min %" value={customMinPct}
                                                        onChange={e => updateUrlParams({ minPct: e.target.value })}
                                                        style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid var(--mlab-border)', borderRadius: 0 }}
                                                    />
                                                    <span style={{ color: 'var(--mlab-grey)', fontWeight: 600 }}>-</span>
                                                    <input
                                                        type="number" min="0" max="100" placeholder="Max %" value={customMaxPct}
                                                        onChange={e => updateUrlParams({ maxPct: e.target.value })}
                                                        style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid var(--mlab-border)', borderRadius: 0 }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lfm-body" style={{ padding: 0 }}>
                                <div className="mlab-table-wrap">
                                    <table className="mlab-table" style={{ margin: 0 }}>
                                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                            <tr>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Learner</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Contact</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Location</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Status</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Attendance</th>
                                                <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Total Time</th>
                                                <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontFamily: 'var(--font-body)' }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                paginatedLearners.map((learner: any, index: number) => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const stats = cohortAnalytics.rosterAttendanceMap.get(learner.learnerId || learner.id);

                                                    const pct = stats ? Math.round(stats.pct) : 0;
                                                    const totalMinutes = stats ? stats.totalMinutes : 0;
                                                    const attended = stats ? stats.attended : 0;
                                                    const total = stats ? stats.total : attendanceLogs.length;

                                                    const isActivated = totalMinutes > 0;
                                                    const band = attendanceBands.find(b => pct >= b.min && pct <= b.max) || attendanceBands[0];

                                                    const locationStr = getLocationString(learner);

                                                    return (
                                                        <tr key={learner.idNumber || learner.id || index} className={`animate-fade-in ${isDropped ? 'mlab-tr--dropped' : ''}`} style={{ transition: 'all 0.3s ease', background: isDropped ? 'var(--mlab-bg)' : 'transparent', opacity: isDropped ? 0.6 : 1 }}>
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
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                                    <MapPin size={12} /> {locationStr}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {isDropped ? (
                                                                        <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-bg)', color: 'var(--mlab-grey)', border: '1px solid var(--mlab-border)', borderRadius: 0 }}>Withdrawn</span>
                                                                    ) : isActivated ? (
                                                                        <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', border: '1px solid var(--mlab-green)', borderRadius: 0 }}>Active</span>
                                                                    ) : (
                                                                        <span style={{ display: 'inline-block', padding: '4px 8px', fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 0 }}>
                                                                            Not Started
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    {pct === 0 ? (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.025em', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 0 }}>
                                                                            0%
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.025em',
                                                                            background: `${band.color}15`, color: band.color, border: `1px solid ${band.color}40`, borderRadius: 0
                                                                        }}>
                                                                            {pct}%
                                                                        </span>
                                                                    )}
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                        {attended} / {total} classes
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                                        {totalMinutes} mins
                                                                    </span>
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                                                        {(totalMinutes / 60).toFixed(1)} hrs
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex', gap: '8px' }}>
                                                                    <button
                                                                        className="lfm-btn lfm-btn--ghost"
                                                                        onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
                                                                        title="View Applicant Digital Portfolio"
                                                                        style={{ borderRadius: 0, padding: '6px 12px', fontSize: '0.7rem' }}
                                                                    >
                                                                        <FolderOpen size={12} /> Portfolio
                                                                    </button>

                                                                    {!isDropped && (
                                                                        <button
                                                                            onClick={() => setLearnerToDrop(learner)}
                                                                            title="Process Withdrawal / Dropout"
                                                                            className="lfm-btn"
                                                                            style={{
                                                                                background: 'var(--mlab-white)', color: 'var(--mlab-red)', border: '1px solid var(--mlab-red)', padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0
                                                                            }}
                                                                            onMouseOver={e => e.currentTarget.style.background = '#fef2f2'}
                                                                            onMouseOut={e => e.currentTarget.style.background = 'var(--mlab-white)'}
                                                                        >
                                                                            <UserMinus size={12} /> Withdraw
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* PAGINATION FOOTER */}
                                {totalPages > 1 && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '1rem 1.5rem', background: 'var(--mlab-bg)', borderTop: '1px solid var(--mlab-border)',
                                        marginTop: 'auto'
                                    }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                            Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredLearners.length)}</strong> of <strong>{filteredLearners.length}</strong> applicants
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1, borderRadius: 0 }}
                                            >
                                                <ChevronLeft size={14} /> Previous
                                            </button>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                Page {currentPage} of {totalPages}
                                            </div>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ padding: '6px 12px', border: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1, borderRadius: 0 }}
                                            >
                                                Next <ChevronRight size={14} />
                                            </button>
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
                                <h2 className="lfm-header__title">
                                    <Calendar size={18} /> Cohort Session Calendar
                                </h2>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(255,255,255,0.1)', padding: '4px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 0 }}>
                                    <button onClick={handlePrevMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-white)', display: 'flex' }}><ChevronLeft size={16} /></button>
                                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: '700', width: '130px', textAlign: 'center', color: 'var(--mlab-white)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{calendarMonth.format('MMMM YYYY')}</span>
                                    <button onClick={handleNextMonth} style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-white)', display: 'flex' }}><ChevronRight size={16} /></button>
                                </div>
                            </div>

                            <div className="lfm-body" style={{ padding: '1.5rem', background: 'var(--mlab-bg)', borderRadius: 0 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px', marginBottom: '10px' }}>
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                        <div key={d} style={{ textAlign: 'center', fontWeight: '700', fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>
                                    ))}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '10px' }}>
                                    {calendarGrid.map((day, idx) => {
                                        const dateStr = day.format('YYYY-MM-DD');
                                        const isCurrentMonth = day.month() === calendarMonth.month();
                                        const isToday = dateStr === moment().format('YYYY-MM-DD');
                                        const dayLogs = logsByDate.get(dateStr) || [];

                                        return (
                                            <div
                                                key={`${dateStr}-${idx}`}
                                                style={{
                                                    border: isToday ? '2px solid var(--mlab-blue)' : '1px solid var(--mlab-border)',
                                                    borderRadius: 0,
                                                    minHeight: '140px',
                                                    padding: '10px',
                                                    backgroundColor: isCurrentMonth ? 'var(--mlab-white)' : 'transparent',
                                                    opacity: isCurrentMonth ? 1 : 0.4,
                                                    transition: 'all 0.2s',
                                                    display: 'flex',
                                                    flexDirection: 'column'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                                    <span style={{
                                                        fontWeight: '700',
                                                        fontFamily: 'var(--font-heading)',
                                                        color: isToday ? 'var(--mlab-white)' : 'var(--mlab-blue)',
                                                        background: isToday ? 'var(--mlab-blue)' : 'transparent',
                                                        width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', borderRadius: 0
                                                    }}>{day.format('D')}</span>

                                                    {dayLogs.length > 0 && (
                                                        <span style={{ fontSize: '0.65rem', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 6px', fontWeight: 'bold', border: '1px solid var(--mlab-border)', borderRadius: 0 }}>
                                                            {dayLogs.length} Session{dayLogs.length !== 1 && 's'}
                                                        </span>
                                                    )}
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, overflowY: 'auto' }}>
                                                    {dayLogs.map((log: any) => (
                                                        <div
                                                            key={log.id}
                                                            onClick={() => navigate(`/facilitator/attendance/${cohort.id}?date=${dateStr}`)}
                                                            style={{
                                                                background: 'var(--mlab-bg)', border: '1px solid var(--mlab-border)', borderLeft: '3px solid var(--mlab-green',
                                                                padding: '8px', fontSize: '0.7rem', color: 'var(--mlab-midnight)', cursor: 'pointer',
                                                                display: 'flex', flexDirection: 'column', gap: '6px'
                                                            }}
                                                            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'var(--mlab-green)'; e.currentTarget.style.background = 'var(--mlab-white)'; }}
                                                            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'var(--mlab-border)'; e.currentTarget.style.borderLeftColor = 'var(--mlab-green)'; e.currentTarget.style.background = 'var(--mlab-bg)'; }}
                                                            title={log.sessionDescription}
                                                        >
                                                            <span style={{ fontWeight: 700, fontFamily: 'var(--font-heading)', letterSpacing: '0.05em', color: 'var(--mlab-blue)', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {log.sessionTitle || 'Bootcamp Session'}
                                                            </span>

                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                    <Clock size={10} /> {log.expectedDuration || 0} mins
                                                                </span>

                                                                {log.sessionZoomLink && (
                                                                    <a
                                                                        href={log.sessionZoomLink}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                            background: '#e0f2fe', color: '#0284c7', border: '1px solid #bae6fd',
                                                                            padding: '2px 6px', fontSize: '0.65rem', fontWeight: 800,
                                                                            textDecoration: 'none', borderRadius: 0, textTransform: 'uppercase'
                                                                        }}
                                                                    >
                                                                        <Video size={10} /> Video
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ─── TAB 4: ATTENDANCE TRACKER ─── */}
                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div style={{ border: '1px solid var(--mlab-border)', borderRadius: 0, backgroundColor: 'var(--mlab-white)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title">
                                        <History size={18} /> Historical Session Ledger
                                    </h2>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--mlab-white)', border: '1px solid var(--mlab-border)', padding: '4px 8px', borderRadius: 0 }}>
                                            <Calendar size={14} color="var(--mlab-blue)" />
                                            <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontWeight: 700, textTransform: 'uppercase' }}>Filter Dates:</span>
                                            <input type="date" max={new Date().toISOString().split('T')[0]} onChange={handleAddLedgerDate} style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'var(--font-body)' }} />
                                        </div>
                                    </div>
                                </div>

                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.75rem 1.5rem', background: 'var(--mlab-bg)', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-heading)', color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => (
                                            <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 600, border: '1px solid var(--mlab-border)', borderRadius: 0 }}>
                                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <X size={12} style={{ cursor: 'pointer', color: 'var(--mlab-red)' }} onClick={() => removeLedgerDate(date)} />
                                            </span>
                                        ))}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: 'var(--mlab-red)', fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: 0 }}>
                                            <XCircle size={12} /> Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="lfm-body" style={{ padding: 0 }}>
                                    <div className="mlab-table-wrap" style={{ border: 'none', margin: 0, borderRadius: 0 }}>
                                        {filteredAttendanceLogs.length === 0 ? (
                                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                                <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', margin: 0 }}>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance records have been logged for this cohort yet.'}</p>
                                            </div>
                                        ) : (
                                            <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                    <tr>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Details</th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Expected Duration
                                                                <span title="Automatically calculated based on the maximum time any single learner spent in this Zoom session." style={{ cursor: 'help', display: 'flex' }}>
                                                                    <Info size={14} color="var(--mlab-grey)" />
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Total Captured
                                                                <span title="The total number of applicants mapped and processed for this date." style={{ cursor: 'help', display: 'flex' }}>
                                                                    <Info size={14} color="var(--mlab-grey)" />
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Present (80%+)
                                                                <span title="Applicants who stayed for at least 80% of the Expected Duration." style={{ cursor: 'help', display: 'flex' }}>
                                                                    <Info size={14} color="var(--mlab-grey)" />
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Short Hours
                                                                <span title="Applicants who dropped off early or joined very late (between 21% and 79% of the session)." style={{ cursor: 'help', display: 'flex' }}>
                                                                    <Info size={14} color="var(--mlab-grey)" />
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <th style={{ color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                Absent
                                                                <span title="Applicants who did not attend, or were present for 20% or less of the session." style={{ cursor: 'help', display: 'flex' }}>
                                                                    <Info size={14} color="var(--mlab-grey)" />
                                                                </span>
                                                            </div>
                                                        </th>
                                                        <th style={{ textAlign: 'right', color: 'var(--mlab-grey)', borderBottom: '1px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Actions</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredAttendanceLogs.map((log) => (
                                                        <tr key={log.id} className="animate-fade-in" style={{ transition: 'all 0.3s ease' }}>
                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                                        {new Date(log.sessionDate.split('T')[0]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                                    </span>

                                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                                        {log.totalDaySessions > 1 && (
                                                                            <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', width: 'fit-content', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                <Layers size={10} style={{ display: 'inline', marginBottom: '-2px' }} /> {log.totalDaySessions} SESSIONS BATCHED
                                                                            </span>
                                                                        )}

                                                                        {log.importVersion > 1 && (
                                                                            <span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                <History size={10} /> RE-UPLOADED (v{log.importVersion})
                                                                            </span>
                                                                        )}

                                                                        {log.isEcosystem && (
                                                                            <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '0', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                                <Globe size={10} /> ECOSYSTEM EVENT
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    {log.sessionTitle && (
                                                                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                                                                            {log.sessionTitle}
                                                                        </span>
                                                                    )}
                                                                    {log.sessionDescription && (
                                                                        <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={log.sessionDescription}>
                                                                            {log.sessionDescription}
                                                                        </span>
                                                                    )}
                                                                    {log.sessionZoomLink && (
                                                                        <a
                                                                            href={log.sessionZoomLink}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#0ea5e9', textDecoration: 'none', marginTop: '2px', fontWeight: 600 }}
                                                                        >
                                                                            <Video size={12} /> View Recording / Link
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                                                    <Clock size={14} /> {log.expectedDuration || 0} mins
                                                                </span>
                                                            </td>
                                                            <td style={{ color: 'var(--mlab-midnight)' }}>{log.totalEnrolled || 0} Learners</td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: 'var(--mlab-green-bg)', color: 'var(--mlab-green-dark)', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid var(--mlab-green)' }}>
                                                                    <CheckCircle2 size={12} /> {log.totalPresent || 0}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fef3c7', color: '#b45309', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid #fde68a' }}>
                                                                    <AlertCircle size={12} /> {log.totalPartial || 0}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '2px 6px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600, borderRadius: '0', border: '1px solid #fca5a5' }}>
                                                                    <XCircle size={12} /> {log.totalAbsent || 0}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex', gap: '8px' }}>
                                                                    <button
                                                                        className="lfm-btn lfm-btn--ghost"
                                                                        style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0 }}
                                                                        onClick={() => openEditModal(log)}
                                                                        title="Edit Session Details"
                                                                    >
                                                                        <Edit2 size={14} color="var(--mlab-blue)" />
                                                                    </button>

                                                                    <button
                                                                        className="lfm-btn lfm-btn--ghost"
                                                                        style={{ padding: '6px 10px', fontSize: '0.7rem', borderRadius: 0 }}
                                                                        onClick={() => {
                                                                            const cleanDate = log.sessionDate.split('T')[0];
                                                                            navigate(`/facilitator/attendance/${cohort.id}?date=${cleanDate}`);
                                                                        }}
                                                                    >
                                                                        <FolderOpen size={12} /> View Register
                                                                    </button>
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
                </div>
            </main>
        </div>
    );
};