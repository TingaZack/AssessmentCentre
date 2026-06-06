// src/pages/CohortDetailsPage/views/BootcampCohortView.tsx

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, Mail, Phone, DownloadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    UploadCloud, Search, X, Info, BarChart2, Target, Activity, UserMinus, Edit2, Loader2, Video, Layers, History, ChevronDown, ChevronUp, Bug, CheckCircle, MapPin, Filter, FilterX, ChevronRight, Globe
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { Sidebar } from '../../../components/dashboard/Sidebar/Sidebar';
import { useToast } from '../../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../../types';
import { ZoomAttendanceDropZone } from '../attendance/ZoomAttendanceDropZone';

export const BootcampCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();
    const { user, learners, enrollments } = useStore();

    // 🚀 BIND ACTIVE TAB TO URL
    const activeTab = (searchParams.get('tab') as 'learners' | 'attendance') || 'learners';
    const setActiveTab = (tab: 'learners' | 'attendance') => updateUrlParams({ tab });

    const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);
    const [isMatrixExpanded, setIsMatrixExpanded] = useState(true);

    const [editingLog, setEditingLog] = useState<any | null>(null);
    const [editLogTitle, setEditLogTitle] = useState('');
    const [editLogDesc, setEditLogDesc] = useState('');
    const [editLogZoomLink, setEditLogZoomLink] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
    const [enrolledLearners, setEnrolledLearners] = useState<DashboardLearner[]>([]);
    const [cohortAnalytics, setCohortAnalytics] = useState<any>(null);
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);

    // 🚀 PAGINATION STATE
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

    // 🚀 BIND FILTERS TO URL PARAMS
    const urlSearchTerm = searchParams.get('search') || '';
    const statusFilter = (searchParams.get('status') as 'all' | 'active' | 'dropped') || 'all';
    const attendanceFilter = searchParams.get('attendance') || 'all';
    const activationFilter = (searchParams.get('activation') as 'all' | 'activated' | 'never') || 'all';
    const locationFilter = searchParams.get('location') || 'all';
    const customMinPct = searchParams.get('minPct') !== null ? Number(searchParams.get('minPct')) : '';
    const customMaxPct = searchParams.get('maxPct') !== null ? Number(searchParams.get('maxPct')) : '';

    // 🚀 DEBOUNCED SEARCH STATE
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

    const handleClearFilters = () => {
        setLocalSearchTerm('');
        setSearchParams(new URLSearchParams({ tab: activeTab }), { replace: true });
    };

    const hasActiveFilters = Boolean(urlSearchTerm || statusFilter !== 'all' || attendanceFilter !== 'all' || activationFilter !== 'all' || locationFilter !== 'all' || customMinPct !== '' || customMaxPct !== '');

    const isAdmin = user?.role === 'admin';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    useEffect(() => {
        if (!cohort || !cohort.id) return [];

        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
        const uniqueMap = new Map<string, DashboardLearner>();

        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) {
                uniqueMap.set(profile.idNumber, { ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && profile.fullName && profile.idNumber && !uniqueMap.has(profile.idNumber)) {
                uniqueMap.set(profile.idNumber, { ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        const compiledRoster = Array.from(uniqueMap.values()).sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
        setEnrolledLearners(compiledRoster);

    }, [learners, enrollments, cohort]);

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

    const uniqueLocations = useMemo(() => {
        const locations = new Set<string>();
        enrolledLearners.forEach(l => {
            const loc = l.demographics?.province || l.demographics?.municipality || l.demographics?.city || (l as any).province || (l as any).city || 'Not specified';
            locations.add(loc);
        });
        return Array.from(locations).sort();
    }, [enrolledLearners]);

    const filteredLearners = useMemo(() => {
        if (!cohortAnalytics) return [];

        return enrolledLearners.filter(learner => {
            const searchLower = urlSearchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const locationString = String(learner.demographics?.province || learner.demographics?.municipality || learner.demographics?.city || (learner as any).province || (learner as any).city || 'Not specified');

            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower) ||
                locationString.toLowerCase().includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            const matchesLocation = locationFilter === 'all' || locationString === locationFilter;

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

            const locationStr = l.demographics?.province || l.demographics?.municipality || l.demographics?.city || (l as any).province || (l as any).city || 'Not specified';

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

    if (!cohort) return null;

    if (!cohortAnalytics) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />
                <main className="cdp-main" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ textAlign: 'center', color: 'var(--mlab-grey)' }}>
                        <Loader2 className="spin" size={40} style={{ margin: '0 auto 1rem' }} />
                        <p>Loading Deep Analytics...</p>
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="cdp-layout">

            {editingLog && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setEditingLog(null)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                            <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit2 size={20} /></div>
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
                                <input type="text" className="wm-form-input" placeholder="e.g. Intro to MS Word" value={editLogTitle} onChange={e => setEditLogTitle(e.target.value)} maxLength={100} />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session / Recording Link (Optional)
                                </label>
                                <input type="url" className="wm-form-input" placeholder="https://zoom.us/rec/share/..." value={editLogZoomLink} onChange={e => setEditLogZoomLink(e.target.value)} />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session Description
                                    <span style={{ color: editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length > 250 ? '#ef4444' : 'var(--mlab-grey)' }}>
                                        {editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length} / 250 words
                                    </span>
                                </label>
                                <textarea className="wm-form-input" placeholder="e.g. Covered creating documents, basic formatting, and introduction to Mail Merge..." rows={5} value={editLogDesc} onChange={e => setEditLogDesc(e.target.value)} />
                            </div>
                        </div>
                        <div className="wm-modal__footer">
                            <button type="button" className="wm-btn wm-btn--ghost" onClick={() => setEditingLog(null)} disabled={isSavingLog}>Cancel</button>
                            <button type="button" className="mlab-btn mlab-btn--primary" onClick={handleSaveLogDetails} disabled={isSavingLog}>
                                {isSavingLog ? <><Loader2 size={16} className="spin" /> Saving...</> : 'Save Details'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ZoomAttendanceDropZone
                isOpen={isDropZoneOpen}
                onClose={() => setIsDropZoneOpen(false)}
                cohort={cohort}
                enrolledLearners={enrolledLearners}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Analytics & Funnel</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className="cdp-header__status cdp-header__status--active">Bootcamp Active</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        <button className="cdp-btn cdp-btn--outline" onClick={handleExport}>
                            <DownloadCloud size={13} /> Export Analytics
                        </button>
                    </div>
                </header>

                <div className="cdp-content">

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-blue)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Users size={14} /> Global Retention
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.globalRetention}%
                                    </h3>
                                </div>
                                <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    {cohortAnalytics.systemActiveCount} / {cohortAnalytics.totalCount} Active
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${cohortAnalytics.globalRetention}%`, background: 'var(--mlab-blue)', height: '100%' }}></div>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{cohortAnalytics.droppedCount} withdrawn globally</p>
                        </div>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid #ec4899' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Users size={14} /> Pipeline Activation
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.4rem', fontWeight: 800, display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                                        <span style={{ color: '#ec4899' }}>👩 {cohortAnalytics.activeFemalePct}%</span>
                                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 400 }}>|</span>
                                        <span style={{ color: '#0284c7' }}>👨 {cohortAnalytics.activeMalePct}%</span>
                                    </h3>
                                </div>
                                <div style={{ background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    {cohortAnalytics.activationRate}% Started
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#0284c7', height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${cohortAnalytics.activeFemalePct}%`, background: '#ec4899', height: '100%' }} />
                                <div style={{ width: `${cohortAnalytics.activeMalePct}%`, background: '#0284c7', height: '100%' }} />
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                                Active: {cohortAnalytics.activeFemaleCount} F <span style={{ color: '#cbd5e1' }}>•</span> {cohortAnalytics.activeMaleCount} M
                                <span style={{ float: 'right', color: '#94a3b8', fontWeight: 500 }}>Applied: {cohortAnalytics.totalFemaleCount}F / {cohortAnalytics.totalMaleCount}M</span>
                            </p>
                        </div>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-green)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <BarChart2 size={14} /> Active Attendance
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.avgAttendance}%
                                    </h3>
                                </div>
                                <div style={{ background: '#dcfce7', color: '#166534', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    Avg. Engagement
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${cohortAnalytics.avgAttendance}%`, background: 'var(--mlab-green)', height: '100%' }}></div>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Across {attendanceLogs.length} tracked sessions</p>
                        </div>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Target size={14} /> Total Training Time
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: '#6d28d9', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.totalCohortHours} <span style={{ fontSize: '1rem', color: '#8b5cf6', fontWeight: 600 }}>Hrs</span>
                                    </h3>
                                </div>
                                <div style={{ background: '#f3e8ff', color: '#a21caf', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    Impact
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: '100%', background: '#8b5cf6', height: '100%', opacity: 0.2 }}></div>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{cohortAnalytics.avgHoursPerLearner} hours logged per active learner</p>
                        </div>
                    </div>

                    <div style={{ background: 'white', border: '1px solid var(--mlab-border)', borderRadius: '8px', marginBottom: '2rem', overflow: 'hidden' }}>
                        <button
                            onClick={() => setIsMatrixExpanded(!isMatrixExpanded)}
                            style={{
                                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '1.25rem 1.5rem', background: isMatrixExpanded ? '#f8fafc' : 'white',
                                border: 'none', cursor: 'pointer', borderBottom: isMatrixExpanded ? '1px solid var(--mlab-border)' : 'none',
                                transition: 'background 0.2s'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BarChart2 size={18} color="var(--mlab-blue)" />
                                <h3 style={{ margin: '0', fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontSize: '0.9rem', letterSpacing: '0.05em' }}>
                                    Interactive Compliance Distribution Matrix (Click to Filter)
                                </h3>
                            </div>
                            {isMatrixExpanded ? <ChevronUp size={18} color="var(--mlab-grey)" /> : <ChevronDown size={18} color="var(--mlab-grey)" />}
                        </button>

                        {isMatrixExpanded && (
                            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '1rem 1.5rem' }}>
                                {cohortAnalytics.bandResults.filter((b: any) => b.total > 0).map((band: any) => {
                                    const totalPct = cohortAnalytics.baseLength > 0 ? Math.round((band.total / cohortAnalytics.baseLength) * 100) : 0;
                                    const malePct = band.total > 0 ? Math.round((band.male / band.total) * 100) : 0;
                                    const femalePct = band.total > 0 ? Math.round((band.female / band.total) * 100) : 0;

                                    const isActive = attendanceFilter === band.id;

                                    return (
                                        <div
                                            key={band.id}
                                            onClick={() => {
                                                updateUrlParams({ attendance: isActive ? 'all' : band.id, tab: 'learners' });
                                            }}
                                            style={{
                                                display: 'grid', gridTemplateColumns: '240px 1fr', gap: '1.5rem', alignItems: 'center',
                                                padding: '10px 16px', borderRadius: '6px', cursor: 'pointer',
                                                background: isActive ? `${band.color}15` : 'transparent',
                                                borderStyle: 'solid',
                                                borderWidth: '1px 1px 1px 4px',
                                                borderColor: isActive ? `${band.color}40 ${band.color}40 ${band.color}40 ${band.color}` : 'transparent',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: isActive ? band.color : 'var(--mlab-midnight)' }}>{band.label}</span>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '2px', fontWeight: 600 }}>
                                                    Total: <strong>{band.total}</strong> ({totalPct}% of cohort)
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ width: '100%', background: '#e2e8f0', height: '8px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' }}>
                                                    <div style={{ width: `${totalPct}%`, background: band.color, height: '100%', transition: 'width 0.5s ease' }} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.75rem', fontWeight: 600 }}>
                                                    <span style={{ color: '#0284c7', display: 'flex', alignItems: 'center', gap: '4px' }}>👨 Male: <strong>{band.male}</strong> ({malePct}% of band)</span>
                                                    <span style={{ color: '#ec4899', display: 'flex', alignItems: 'center', gap: '4px' }}>👩 Female: <strong>{band.female}</strong> ({femalePct}% of band)</span>
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

                    <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
                            <Users size={16} /> Applicant Roster
                        </button>
                        <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
                            <UserCheck size={16} /> Attendance Tracker
                        </button>
                    </div>

                    {activeTab === 'learners' && (
                        <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                            <div className="vp-card" style={{ marginBottom: 0, minHeight: '650px', display: 'flex', flexDirection: 'column' }}>

                                {/* 🚀 HEADER WITH CLEAR FILTERS BUTTON */}
                                <div className="vp-card-header">
                                    <div className="vp-card-title-group" style={{ width: '100%', justifyContent: 'space-between', display: 'flex' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <Users size={18} color="var(--mlab-blue)" />
                                            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                                Registered Applicants ({filteredLearners.length})
                                            </h3>
                                        </div>
                                        {hasActiveFilters && (
                                            <button
                                                onClick={handleClearFilters}
                                                className="mlab-btn mlab-btn--sm animate-fade-in"
                                                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                            >
                                                <FilterX size={14} /> Clear All Filters
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div style={{
                                    display: 'flex', flexWrap: 'wrap', gap: '1rem', padding: '1rem 1.5rem',
                                    backgroundColor: '#f8fafc', borderBottom: '1px solid var(--mlab-border)',
                                    alignItems: 'center', justifyContent: 'space-between'
                                }}>
                                    <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
                                        <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                        <input
                                            type="text"
                                            placeholder="Search name, ID or email..."
                                            value={localSearchTerm}
                                            onChange={(e) => setLocalSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 12px 8px 36px', fontSize: '0.85rem',
                                                color: 'var(--mlab-midnight)', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', outline: 'none'
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => updateUrlParams({ status: e.target.value })}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Applicants</option>
                                                <option value="active">Active Only</option>
                                                <option value="dropped">Withdrawn Only</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Location:</label>
                                            <select
                                                value={locationFilter}
                                                onChange={(e) => updateUrlParams({ location: e.target.value })}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Locations</option>
                                                {uniqueLocations.map(loc => (
                                                    <option key={loc} value={loc}>{loc}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Activation:</label>
                                            <select
                                                value={activationFilter}
                                                onChange={(e) => updateUrlParams({ activation: e.target.value })}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Profiles</option>
                                                <option value="activated">Started Program</option>
                                                <option value="never">Never Attended</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attendance:</label>
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                <select
                                                    value={attendanceFilter}
                                                    onChange={(e) => updateUrlParams({ attendance: e.target.value })}
                                                    style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                                >
                                                    <option value="all">All Attendance</option>
                                                    {attendanceBands.map(b => (
                                                        <option key={b.id} value={b.id}>{b.label}</option>
                                                    ))}
                                                    <option value="custom">⚙️ Custom Range...</option>
                                                </select>

                                                {attendanceFilter === 'custom' && (
                                                    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                        <input
                                                            type="number"
                                                            min="0" max="100"
                                                            placeholder="Min %"
                                                            value={customMinPct}
                                                            onChange={e => updateUrlParams({ minPct: e.target.value })}
                                                            style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid #cbd5e1' }}
                                                        />
                                                        <span style={{ color: '#64748b', fontWeight: 600 }}>-</span>
                                                        <input
                                                            type="number"
                                                            min="0" max="100"
                                                            placeholder="Max %"
                                                            value={customMaxPct}
                                                            onChange={e => updateUrlParams({ maxPct: e.target.value })}
                                                            style={{ width: '60px', padding: '6px', fontSize: '0.8rem', border: '1px solid #cbd5e1' }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* 🚀 PAGINATED TABLE WRAPPER */}
                                <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <table className="mlab-table" style={{ tableLayout: 'fixed' }}>
                                        <colgroup>
                                            <col style={{ width: '25%' }} />
                                            <col style={{ width: '20%' }} />
                                            <col style={{ width: '15%' }} />
                                            <col style={{ width: '10%' }} />
                                            <col style={{ width: '12%' }} />
                                            <col style={{ width: '10%' }} />
                                            <col style={{ width: '8%' }} />
                                        </colgroup>
                                        <thead>
                                            <tr>
                                                <th>Applicant Details</th>
                                                <th>Contact Information</th>
                                                <th>Location</th>
                                                <th>Status</th>
                                                <th>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Attendance Score
                                                        <span title="The percentage of Zoom sessions this applicant has attended (marked as Present or Short Hours)." style={{ cursor: 'help', display: 'flex' }}>
                                                            <Info size={14} color="var(--mlab-grey)" />
                                                        </span>
                                                    </div>
                                                </th>
                                                <th>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        Total Time
                                                        <span title="Total cumulative time the applicant has spent in Zoom sessions across the entire programme." style={{ cursor: 'help', display: 'flex' }}>
                                                            <Info size={14} color="var(--mlab-grey)" />
                                                        </span>
                                                    </div>
                                                </th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
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

                                                    const locationStr = learner.demographics?.province || learner.demographics?.municipality || learner.demographics?.city || (learner as any).province || (learner as any).city || 'Not specified';

                                                    return (
                                                        <tr
                                                            key={learner.idNumber || learner.id || index}
                                                            className={`animate-fade-in ${isDropped ? 'mlab-tr--dropped' : ''}`}
                                                            style={{ transition: 'all 0.3s ease' }}
                                                        >
                                                            <td>
                                                                <div className="cdp-learner-cell">
                                                                    <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
                                                                    <div className="cdp-learner-cell__info">
                                                                        <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
                                                                        <span className="cdp-learner-cell__id">{learner.idNumber}</span>
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
                                                                        <span className="cdp-status-badge cdp-status-badge--dropped">Withdrawn</span>
                                                                    ) : isActivated ? (
                                                                        <span className="cdp-status-badge cdp-status-badge--active">Active</span>
                                                                    ) : (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', fontSize: '0.7rem', fontWeight: 700, background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', width: 'fit-content', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                            Not Started
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>

                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    {pct === 0 ? (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1' }}>
                                                                            0%
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.025em',
                                                                            background: `${band.color}15`, color: band.color, border: `1px solid ${band.color}40`,
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
                                                                <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
                                                                    <button
                                                                        className="mlab-btn mlab-btn--sm mlab-btn--ghost"
                                                                        onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
                                                                        title="View Applicant Digital Portfolio"
                                                                    >
                                                                        <FolderOpen size={12} /> Portfolio
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {/* 🚀 PAGINATION FOOTER */}
                                {totalPages > 1 && (
                                    <div style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)',
                                        marginTop: 'auto'
                                    }}>
                                        <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
                                            Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredLearners.length)}</strong> of <strong>{filteredLearners.length}</strong> applicants
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="wm-btn wm-btn--ghost"
                                                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1 }}
                                            >
                                                <ChevronLeft size={14} /> Previous
                                            </button>
                                            <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                Page {currentPage} of {totalPages}
                                            </div>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="wm-btn wm-btn--ghost"
                                                style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1 }}
                                            >
                                                Next <ChevronRight size={14} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'attendance' && (
                        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                            <div className="vp-card" style={{ marginBottom: '2rem' }}>
                                <div className="vp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                    <div className="vp-card-title-group">
                                        <Calendar size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Historical Session Ledger
                                        </h3>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid var(--mlab-border)', padding: '6px 12px' }}>
                                            <Calendar size={16} color="var(--mlab-grey)" />
                                            <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>Filter Dates:</span>
                                            <input
                                                type="date"
                                                onChange={handleAddLedgerDate}
                                                style={{ border: 'none', outline: 'none', background: 'transparent', color: 'var(--mlab-blue)', fontSize: '0.85rem', cursor: 'pointer' }}
                                            />
                                        </div>
                                        <button
                                            className="cdp-btn"
                                            style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}
                                            onClick={() => setIsDropZoneOpen(true)}
                                        >
                                            <UploadCloud size={14} /> Upload Zoom CSV
                                        </button>
                                    </div>
                                </div>

                                {ledgerDates.length > 0 && (
                                    <div style={{ padding: '0.5rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid var(--mlab-border)', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mlab-grey)', textTransform: 'uppercase' }}>Showing:</span>
                                        {ledgerDates.map(date => (
                                            <span key={date} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#e0f2fe', color: '#0284c7', padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                                                {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                <X size={12} style={{ cursor: 'pointer' }} onClick={() => removeLedgerDate(date)} />
                                            </span>
                                        ))}
                                        <button onClick={() => setLedgerDates([])} style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <XCircle size={12} /> Clear All
                                        </button>
                                    </div>
                                )}

                                <div className="mlab-table-wrap">
                                    {filteredAttendanceLogs.length === 0 ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p>{ledgerDates.length > 0 ? 'No attendance records match the selected dates.' : 'No attendance records have been logged for this cohort yet.'}</p>
                                        </div>
                                    ) : (
                                        <table className="mlab-table">
                                            <thead>
                                                <tr>
                                                    <th>Session Details</th>
                                                    <th>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            Expected Duration
                                                            <span title="Automatically calculated based on the maximum time any single learner spent in this Zoom session." style={{ cursor: 'help', display: 'flex' }}>
                                                                <Info size={14} color="var(--mlab-grey)" />
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            Total Captured
                                                            <span title="The total number of applicants mapped and processed for this date." style={{ cursor: 'help', display: 'flex' }}>
                                                                <Info size={14} color="var(--mlab-grey)" />
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            Present (80%+)
                                                            <span title="Applicants who stayed for at least 80% of the Expected Duration." style={{ cursor: 'help', display: 'flex' }}>
                                                                <Info size={14} color="var(--mlab-grey)" />
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            Short Hours
                                                            <span title="Applicants who dropped off early or joined very late (between 21% and 79% of the session)." style={{ cursor: 'help', display: 'flex' }}>
                                                                <Info size={14} color="var(--mlab-grey)" />
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            Absent
                                                            <span title="Applicants who did not attend, or were present for 20% or less of the session." style={{ cursor: 'help', display: 'flex' }}>
                                                                <Info size={14} color="var(--mlab-grey)" />
                                                            </span>
                                                        </div>
                                                    </th>
                                                    <th style={{ textAlign: 'right' }}>Actions</th>
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
                                                                    {/* MULTI-SESSION MASTER BADGE */}
                                                                    {log.totalDaySessions > 1 && (
                                                                        <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', width: 'fit-content', border: '1px solid #bae6fd', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                            <Layers size={10} style={{ display: 'inline', marginBottom: '-2px' }} /> {log.totalDaySessions} SESSIONS BATCHED
                                                                        </span>
                                                                    )}

                                                                    {/* OVERWRITTEN / MODIFIED VERSION INDICATOR PILL */}
                                                                    {log.importVersion > 1 && (
                                                                        <span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #fed7aa', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                                                            <History size={10} /> RE-UPLOADED (v{log.importVersion})
                                                                        </span>
                                                                    )}

                                                                    {/* 🚀 ECOSYSTEM EVENT BADGE */}
                                                                    {log.isEcosystem && (
                                                                        <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
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
                                                                <Clock size={14} /> {log.expectedDuration} mins
                                                            </span>
                                                        </td>
                                                        <td style={{ color: 'var(--mlab-midnight)' }}>{log.totalEnrolled || 0} Learners</td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <CheckCircle2 size={12} /> {log.totalPresent || 0}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fef3c7', color: '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <AlertCircle size={12} /> {log.totalPartial || 0}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
                                                                <XCircle size={12} /> {log.totalAbsent || 0}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
                                                                <button
                                                                    className="mlab-icon-btn"
                                                                    style={{ border: '1px solid #e2e8f0', background: 'white' }}
                                                                    onClick={() => openEditModal(log)}
                                                                    title="Edit Session Details"
                                                                >
                                                                    <Edit2 size={14} color="var(--mlab-blue)" />
                                                                </button>

                                                                {/* 🚀 FIXED VIEW REGISTER ROUTE: PREVENTS T00:00:00.000Z FROM BREAKING THE ATTENDANCE PAGE */}
                                                                <button
                                                                    className="mlab-btn mlab-btn--sm mlab-btn--ghost"
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
                    )}
                </div>
            </main>
        </div>
    );
};