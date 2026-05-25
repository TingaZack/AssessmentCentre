// src/pages/CohortDetailsPage/views/BootcampCohortView.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    Users, Calendar, ChevronLeft, Mail, Phone, Award, DownloadCloud,
    FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle,
    UploadCloud, Search, X, Info, BarChart2, Target, Activity, UserMinus, Edit2, Loader2, Video
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
    const toast = useToast();
    const { user, learners, enrollments } = useStore();

    const [activeTab, setActiveTab] = useState<'learners' | 'attendance'>('learners');

    // Controls the Zoom Drop Zone popup
    const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);

    // Edit Log Details State
    const [editingLog, setEditingLog] = useState<any | null>(null);
    const [editLogTitle, setEditLogTitle] = useState('');
    const [editLogDesc, setEditLogDesc] = useState('');
    const [editLogZoomLink, setEditLogZoomLink] = useState('');
    const [isSavingLog, setIsSavingLog] = useState(false);

    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

    // Multi-Date Selection State for Historical Ledger Filter
    const [ledgerDates, setLedgerDates] = useState<string[]>([]);

    //  FILTER STATES
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
    const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

    const isAdmin = user?.role === 'admin';

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    const enrolledLearners = useMemo(() => {
        if (!cohort || !cohort.id) return [];

        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
        const merged: DashboardLearner[] = [];

        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) {
                merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        learners.forEach(profile => {
            if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });

        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, enrollments, cohort]);

    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
    const totalCount = activeCount + droppedCount;

    useEffect(() => {
        if (!cohort?.id) return;

        const q = query(
            collection(db, 'attendance_logs'),
            where('cohortId', '==', cohort.id)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            logs.sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
            setAttendanceLogs(logs);
        });

        return () => unsubscribe();
    }, [cohort]);

    useEffect(() => {
        if (!cohort?.id) return;

        const qRecords = query(
            collection(db, 'attendance_records'),
            where('cohortId', '==', cohort.id)
        );

        const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
            setAttendanceRecords(snapshot.docs.map(doc => doc.data()));
        });

        return () => unsubscribeRecords();
    }, [cohort]);

    const rosterAttendanceMap = useMemo(() => {
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

        return map;
    }, [attendanceRecords, attendanceLogs.length]);

    const cohortAnalytics = useMemo(() => {
        let totalCohortHours = 0;
        let sumActiveAttendancePct = 0;
        let highPerformers = 0;
        let atRisk = 0;
        let ghosting = 0;

        const totalExpectedMinutes = attendanceLogs.reduce((acc, log) => acc + (log.expectedDuration || 120), 0);

        enrolledLearners.forEach(l => {
            if (l.status !== 'dropped') {
                const stats = rosterAttendanceMap.get(l.learnerId || l.id) || { pct: 0, totalMinutes: 0 };
                totalCohortHours += (stats.totalMinutes / 60);
                sumActiveAttendancePct += stats.pct;

                if (stats.pct >= 80) highPerformers++;
                if (stats.pct < 50 && attendanceLogs.length > 0) atRisk++;

                if (totalExpectedMinutes > 200 && stats.totalMinutes < 200) {
                    ghosting++;
                }
            }
        });

        const avgAttendance = activeCount > 0 ? Math.round(sumActiveAttendancePct / activeCount) : 0;
        const retentionRate = totalCount > 0 ? Math.round((activeCount / totalCount) * 100) : 0;
        const avgHoursPerLearner = activeCount > 0 ? (totalCohortHours / activeCount).toFixed(1) : "0.0";

        return {
            totalCohortHours: Math.round(totalCohortHours),
            avgAttendance,
            retentionRate,
            highPerformers,
            atRisk,
            ghosting,
            avgHoursPerLearner
        };
    }, [enrolledLearners, rosterAttendanceMap, activeCount, totalCount, attendanceLogs]);

    const filteredLearners = useMemo(() => {
        return enrolledLearners.filter(learner => {
            const searchLower = searchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower);

            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0, totalMinutes: 0 };
            let matchesAttendance = true;
            if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
            else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
            else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

            return matchesSearch && matchesStatus && matchesAttendance;
        });
    }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, attendanceLogs.length]);

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
        if (filteredLearners.length === 0) {
            toast.error('No matching records to export.');
            return;
        }

        const dataRows = filteredLearners.map(l => {
            const att = rosterAttendanceMap.get(l.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0, totalMinutes: 0 };
            return {
                "Full Name": l.fullName,
                "ID Number": l.idNumber,
                "Email Address": l.email || l.demographics?.learnerEmailAddress || 'N/A',
                "Phone Number": l.phone || l.mobile || l.demographics?.learnerPhoneNumber || 'N/A',
                "Attendance Score": `${att.attended}/${att.total} (${att.pct}%)`,
                "Total Time (Mins)": att.totalMinutes,
                "Total Time (Hrs)": (att.totalMinutes / 60).toFixed(1),
                "Status": l.status === 'dropped' ? 'Withdrawn' : 'Active Applicant',
                "Enrolled Date": l.createdAt?.split('T')[0] || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bootcamp Roster');
        XLSX.writeFile(wb, `Bootcamp_Analytics_${cohort.name.replace(/\s+/g, '_')}.xlsx`);
        toast.success('Roster exported successfully with tracking metrics.');
    };

    // 🚀 NEW: Edit Session Details Logic with Zoom Link
    const openEditModal = (log: any) => {
        setEditingLog(log);
        setEditLogTitle(log.sessionTitle || '');
        setEditLogDesc(log.sessionDescription || '');
        setEditLogZoomLink(log.sessionZoomLink || '');
    };

    const handleSaveLogDetails = async () => {
        if (!editingLog) return;

        // Word count validation
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

    return (
        <div className="cdp-layout">

            {/* 🚀 NEW: Edit Session Details Modal */}
            {editingLog && createPortal(
                <div className="wm-overlay animate-fade-in" onClick={() => setEditingLog(null)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="wm-modal__header" style={{ borderBottom: '1px solid var(--mlab-border)', paddingBottom: '1rem' }}>
                            <div className="wm-modal__header-icon" style={{ background: '#e0f2fe', color: '#0ea5e9' }}><Edit2 size={20} /></div>
                            <div>
                                <h2 className="wm-modal__title">Edit Session Details</h2>
                                <p className="wm-modal__subtitle">
                                    {new Date(editingLog.sessionDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                            </div>
                            <button className="wm-modal__close" onClick={() => setEditingLog(null)}><X size={18} /></button>
                        </div>
                        <div className="wm-modal__body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session Title
                                </label>
                                <input
                                    type="text"
                                    className="wm-form-input"
                                    placeholder="e.g. Intro to MS Word"
                                    value={editLogTitle}
                                    onChange={e => setEditLogTitle(e.target.value)}
                                    maxLength={100}
                                />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session / Recording Link (Optional)
                                </label>
                                <input
                                    type="url"
                                    className="wm-form-input"
                                    placeholder="https://zoom.us/rec/share/..."
                                    value={editLogZoomLink}
                                    onChange={e => setEditLogZoomLink(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="wm-form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    Session Description
                                    <span style={{ color: editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length > 250 ? '#ef4444' : 'var(--mlab-grey)' }}>
                                        {editLogDesc.trim().split(/\s+/).filter(w => w.length > 0).length} / 250 words
                                    </span>
                                </label>
                                <textarea
                                    className="wm-form-input"
                                    placeholder="e.g. Covered creating documents, basic formatting, and introduction to Mail Merge..."
                                    rows={5}
                                    value={editLogDesc}
                                    onChange={e => setEditLogDesc(e.target.value)}
                                />
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
                                        <Users size={14} /> Pipeline Retention
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.retentionRate}%
                                    </h3>
                                </div>
                                <div style={{ background: '#e0f2fe', color: '#0284c7', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold' }}>
                                    {activeCount} / {totalCount} Active
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${cohortAnalytics.retentionRate}%`, background: 'var(--mlab-blue)', height: '100%' }}></div>
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>{droppedCount} withdrawn so far</p>
                        </div>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-green)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <BarChart2 size={14} /> Global Attendance
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

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: `4px solid ${cohortAnalytics.atRisk > 0 ? '#f59e0b' : 'var(--mlab-grey-light)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Activity size={14} /> Cohort Health
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.highPerformers} <span style={{ fontSize: '0.9rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>High Perf.</span>
                                    </h3>
                                </div>
                                <div style={{ background: cohortAnalytics.atRisk > 0 ? '#fef3c7' : '#f8fafc', color: cohortAnalytics.atRisk > 0 ? '#b45309' : '#94a3b8', padding: '6px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {cohortAnalytics.atRisk > 0 && <AlertCircle size={12} />}
                                    {cohortAnalytics.atRisk} At Risk
                                </div>
                            </div>

                            <div style={{ width: '100%', background: '#f1f5f9', height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${(cohortAnalytics.highPerformers / activeCount) * 100}%`, background: 'var(--mlab-green)', height: '100%' }}></div>
                                <div style={{ width: `${((activeCount - cohortAnalytics.highPerformers - cohortAnalytics.atRisk) / activeCount) * 100}%`, background: '#fbbf24', height: '100%' }}></div>
                                <div style={{ width: `${(cohortAnalytics.atRisk / activeCount) * 100}%`, background: '#ef4444', height: '100%' }}></div>
                            </div>

                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)' }}>Green: &gt;80% | Amber: 50-79% | Red: &lt;50%</p>
                        </div>

                        <div style={{ background: '#fff1f2', padding: '1.25rem', border: '1px solid #fecaca', borderRadius: '8px', borderLeft: '4px solid #ef4444' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.75rem', color: '#991b1b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <UserMinus size={14} /> Early Warning System
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: '1.8rem' }}>
                                        {cohortAnalytics.ghosting} <span style={{ fontSize: '0.9rem', color: '#dc2626', fontWeight: 500 }}>Learners</span>
                                    </h3>
                                </div>
                            </div>
                            <p style={{ margin: '14px 0 0', fontSize: '0.75rem', color: '#991b1b', lineHeight: 1.4 }}>
                                <strong>Ghosting Detected:</strong> Active learners with less than 200 minutes of total engagement across the programme.
                            </p>
                        </div>

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
                            <div className="vp-card" style={{ marginBottom: 0 }}>
                                <div className="vp-card-header">
                                    <div className="vp-card-title-group">
                                        <Users size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Registered Applicants ({filteredLearners.length})
                                        </h3>
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
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '8px 12px 8px 36px',
                                                fontSize: '0.85rem',
                                                color: 'var(--mlab-midnight)',
                                                backgroundColor: '#ffffff',
                                                border: '1px solid #cbd5e1',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
                                            <select
                                                value={statusFilter}
                                                onChange={(e) => setStatusFilter(e.target.value as any)}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Applicants</option>
                                                <option value="active">Active Only</option>
                                                <option value="dropped">Withdrawn Only</option>
                                            </select>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attendance:</label>
                                            <select
                                                value={attendanceFilter}
                                                onChange={(e) => setAttendanceFilter(e.target.value as any)}
                                                style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
                                            >
                                                <option value="all">All Attendance Bands</option>
                                                <option value="high">High Compliance (75%+)</option>
                                                <option value="mid">Average Compliance (40% - 74%)</option>
                                                <option value="low">Critical Risk (&lt; 40%)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="mlab-table-wrap">
                                    <table className="mlab-table">
                                        <thead>
                                            <tr>
                                                <th>Applicant Details</th>
                                                <th>Contact Information</th>
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
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLearners.map(learner => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0, totalMinutes: 0 };

                                                    return (
                                                        <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
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
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} color="var(--mlab-grey)" /> {learner.email || 'No Email Attached'}</span>
                                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="var(--mlab-grey)" /> {learner.phone || learner.mobile || 'No Contact Number'}</span>
                                                                </div>
                                                            </td>
                                                            <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Withdrawn' : 'Active'}</span></td>

                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        padding: '4px 10px',
                                                                        fontSize: '0.75rem',
                                                                        fontWeight: 700,
                                                                        letterSpacing: '0.025em',
                                                                        background: stats.pct >= 75 ? '#dcfce7' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
                                                                        color: stats.pct >= 75 ? '#166534' : stats.pct >= 40 ? '#b45309' : '#991b1b',
                                                                        border: stats.pct >= 75 ? '1px solid #bbf7d0' : stats.pct >= 40 ? '1px solid #fde68a' : '1px solid #fca5a5',
                                                                    }}>
                                                                        {stats.pct}%
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                        {stats.attended} / {stats.total} classes
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            <td>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                                        {stats.totalMinutes} mins
                                                                    </span>
                                                                    <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)' }}>
                                                                        {(stats.totalMinutes / 60).toFixed(1)} hrs
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

                                    {/* Multi-Date Filter UI */}
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

                                {/* Selected Date Chips */}
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
                                                    <tr key={log.id}>
                                                        <td>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                                    {new Date(log.sessionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
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
                                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                                <button
                                                                    className="mlab-icon-btn"
                                                                    style={{ border: '1px solid #e2e8f0', background: 'white' }}
                                                                    onClick={() => openEditModal(log)}
                                                                    title="Edit Session Details"
                                                                >
                                                                    <Edit2 size={14} color="var(--mlab-blue)" />
                                                                </button>
                                                                <button
                                                                    className="mlab-btn mlab-btn--sm mlab-btn--ghost"
                                                                    onClick={() => navigate(`/facilitator/attendance/${cohort.id}?date=${log.sessionDate}`)}
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




// export const BootcampCohortView: React.FC<{ cohort: any }> = ({ cohort }) => {
//     const navigate = useNavigate();
//     const toast = useToast();
//     const { user, learners, enrollments } = useStore();

//     const [activeTab, setActiveTab] = useState<'learners' | 'attendance'>('learners');

//     // Controls the Zoom Drop Zone popup
//     const [isDropZoneOpen, setIsDropZoneOpen] = useState(false);

//     const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
//     const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

//     //  FILTER STATES
//     const [searchTerm, setSearchTerm] = useState('');
//     const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'dropped'>('all');
//     const [attendanceFilter, setAttendanceFilter] = useState<'all' | 'high' | 'mid' | 'low'>('all');

//     const isAdmin = user?.role === 'admin';

//     const handleBack = () => {
//         if (isAdmin) {
//             navigate('/admin', { state: { activeTab: 'cohorts' } });
//         } else {
//             navigate(-1);
//         }
//     };

//     const enrolledLearners = useMemo(() => {
//         if (!cohort || !cohort.id) return [];

//         const cohortEnrollments = enrollments.filter(e => e.cohortId === cohort.id);
//         const merged: DashboardLearner[] = [];

//         cohortEnrollments.forEach(enrollment => {
//             const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
//             if (profile?.fullName && profile?.idNumber) {
//                 merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });

//         learners.forEach(profile => {
//             if (profile.cohortId === cohort.id && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
//                 merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
//             }
//         });

//         return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
//     }, [learners, enrollments, cohort]);

//     const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;
//     const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;

//     useEffect(() => {
//         if (!cohort?.id) return;

//         const q = query(
//             collection(db, 'attendance_logs'),
//             where('cohortId', '==', cohort.id)
//         );

//         const unsubscribe = onSnapshot(q, (snapshot) => {
//             const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             logs.sort((a: any, b: any) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime());
//             setAttendanceLogs(logs);
//         });

//         return () => unsubscribe();
//     }, [cohort]);

//     useEffect(() => {
//         if (!cohort?.id) return;

//         const qRecords = query(
//             collection(db, 'attendance_records'),
//             where('cohortId', '==', cohort.id)
//         );

//         const unsubscribeRecords = onSnapshot(qRecords, (snapshot) => {
//             setAttendanceRecords(snapshot.docs.map(doc => doc.data()));
//         });

//         return () => unsubscribeRecords();
//     }, [cohort]);

//     const rosterAttendanceMap = useMemo(() => {
//         const map = new Map<string, { attended: number; total: number; pct: number }>();
//         const totalSessions = attendanceLogs.length;

//         attendanceRecords.forEach(rec => {
//             if (!rec.learnerId) return;
//             if (!map.has(rec.learnerId)) {
//                 map.set(rec.learnerId, { attended: 0, total: totalSessions, pct: 0 });
//             }
//             const entry = map.get(rec.learnerId)!;
//             if (rec.status === 'Present' || rec.status === 'Partial') {
//                 entry.attended += 1;
//             }
//         });

//         map.forEach(value => {
//             value.total = totalSessions;
//             value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
//         });

//         return map;
//     }, [attendanceRecords, attendanceLogs.length]);

//     //  PIPELINE MATRIX: Computes active searches and filter intersections cleanly
//     const filteredLearners = useMemo(() => {
//         return enrolledLearners.filter(learner => {
//             // Pass 1: Multi-field string text match
//             const searchLower = searchTerm.toLowerCase().trim();
//             const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
//             const matchesSearch = !searchLower ||
//                 learner.fullName.toLowerCase().includes(searchLower) ||
//                 learner.idNumber.includes(searchLower) ||
//                 dbEmail.includes(searchLower);

//             // Pass 2: Status checking intersection
//             const matchesStatus = statusFilter === 'all' ||
//                 (statusFilter === 'active' && learner.status !== 'dropped') ||
//                 (statusFilter === 'dropped' && learner.status === 'dropped');

//             // Pass 3: Compliance threshold metric match
//             const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
//             let matchesAttendance = true;
//             if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
//             else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
//             else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

//             return matchesSearch && matchesStatus && matchesAttendance;
//         });
//     }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, attendanceLogs.length]);

//     const handleExport = () => {
//         if (filteredLearners.length === 0) {
//             toast.error('No matching records to export.');
//             return;
//         }

//         const dataRows = filteredLearners.map(l => {
//             const att = rosterAttendanceMap.get(l.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
//             return {
//                 "Full Name": l.fullName,
//                 "ID Number": l.idNumber,
//                 "Email Address": l.email || l.demographics?.learnerEmailAddress || 'N/A',
//                 "Phone Number": l.phone || l.mobile || l.demographics?.learnerPhoneNumber || 'N/A',
//                 "Attendance Score": `${att.attended}/${att.total} (${att.pct}%)`,
//                 "Status": l.status === 'dropped' ? 'Withdrawn' : 'Active Applicant',
//                 "Enrolled Date": l.createdAt?.split('T')[0] || ''
//             };
//         });

//         const ws = XLSX.utils.json_to_sheet(dataRows);
//         const wb = XLSX.utils.book_new();
//         XLSX.utils.book_append_sheet(wb, ws, 'Bootcamp Roster');
//         XLSX.writeFile(wb, `Bootcamp_Applicants_${cohort.name.replace(/\s+/g, '_')}.xlsx`);
//         toast.success('Roster exported successfully with tracking metrics.');
//     };

//     if (!cohort) return null;

//     return (
//         <div className="cdp-layout">

//             <ZoomAttendanceDropZone
//                 isOpen={isDropZoneOpen}
//                 onClose={() => setIsDropZoneOpen(false)}
//                 cohort={cohort}
//                 enrolledLearners={enrolledLearners}
//             />

//             <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

//             <main className="cdp-main">
//                 <header className="cdp-header">
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={handleBack}>
//                             <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
//                         </button>
//                         <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Funnel</div>
//                         <h1 className="cdp-header__title">{cohort.name}</h1>
//                         <p className="cdp-header__sub">
//                             <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
//                             <span className="cdp-header__status cdp-header__status--active">Bootcamp Active</span>
//                         </p>
//                     </div>
//                     <div className="cdp-header__right">
//                         <button className="cdp-btn cdp-btn--outline" onClick={handleExport}>
//                             <DownloadCloud size={13} /> Export List
//                         </button>
//                     </div>
//                 </header>

//                 <div className="cdp-content">
//                     <div className="cdp-stat-row">
//                         <div className="cdp-stat-card cdp-stat-card--blue">
//                             <div className="cdp-stat-card__icon"><Users size={20} /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Applicants</span></div>
//                         </div>
//                         <div className="cdp-stat-card cdp-stat-card--grey">
//                             <div className="cdp-stat-card__icon"><Award size={20} /></div>
//                             <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Withdrawn</span></div>
//                         </div>
//                     </div>

//                     <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
//                         <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}>
//                             <Users size={16} /> Applicant Roster
//                         </button>
//                         <button className={`lfm-tab ${activeTab === 'attendance' ? 'active' : ''}`} onClick={() => setActiveTab('attendance')}>
//                             <UserCheck size={16} /> Attendance Tracker
//                         </button>
//                     </div>

//                     {activeTab === 'learners' && (
//                         <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
//                             <div className="vp-card" style={{ marginBottom: 0 }}>
//                                 <div className="vp-card-header">
//                                     <div className="vp-card-title-group">
//                                         <Users size={18} color="var(--mlab-blue)" />
//                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                             Registered Applicants ({filteredLearners.length})
//                                         </h3>
//                                     </div>
//                                 </div>

//                                 {/* : MASTER INTEGRATED FILTER CONTROLS BAR */}
//                                 <div style={{
//                                     display: 'flex',
//                                     flexWrap: 'wrap',
//                                     gap: '1rem',
//                                     padding: '1rem 1.5rem',
//                                     backgroundColor: '#f8fafc',
//                                     borderBottom: '1px solid var(--mlab-border)',
//                                     alignItems: 'center',
//                                     justifyContent: 'space-between'
//                                 }}>
//                                     <div style={{ position: 'relative', width: '300px', minWidth: '200px' }}>
//                                         <Search size={16} color="var(--mlab-grey)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
//                                         <input
//                                             type="text"
//                                             placeholder="Search name, ID or email..."
//                                             value={searchTerm}
//                                             onChange={(e) => setSearchTerm(e.target.value)}
//                                             style={{
//                                                 width: '100%',
//                                                 padding: '8px 12px 8px 36px',
//                                                 fontSize: '0.85rem',
//                                                 color: 'var(--mlab-midnight)',
//                                                 backgroundColor: '#ffffff',
//                                                 border: '1px solid #cbd5e1',
//                                                 outline: 'none'
//                                             }}
//                                         />
//                                     </div>

//                                     <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                                         {/* Status Filtering */}
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Status:</label>
//                                             <select
//                                                 value={statusFilter}
//                                                 onChange={(e) => setStatusFilter(e.target.value as any)}
//                                                 style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
//                                             >
//                                                 <option value="all">All Applicants</option>
//                                                 <option value="active">Active Only</option>
//                                                 <option value="dropped">Withdrawn Only</option>
//                                             </select>
//                                         </div>

//                                         {/* Compliance Metrics Selector */}
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Attendance:</label>
//                                             <select
//                                                 value={attendanceFilter}
//                                                 onChange={(e) => setAttendanceFilter(e.target.value as any)}
//                                                 style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', backgroundColor: '#ffffff', color: 'var(--mlab-midnight)' }}
//                                             >
//                                                 <option value="all">All Attendance Bands</option>
//                                                 <option value="high">High Compliance (75%+)</option>
//                                                 <option value="mid">Average Compliance (40% - 74%)</option>
//                                                 <option value="low">Critical Risk (&lt; 40%)</option>
//                                             </select>
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div className="mlab-table-wrap">
//                                     <table className="mlab-table">
//                                         <thead>
//                                             <tr>
//                                                 <th>Applicant Details</th>
//                                                 <th>Contact Information</th>
//                                                 <th>Status</th>
//                                                 <th>Attendance Score</th>
//                                                 <th style={{ textAlign: 'right' }}>Actions</th>
//                                             </tr>
//                                         </thead>
//                                         <tbody>
//                                             {filteredLearners.length === 0 ? (
//                                                 <tr>
//                                                     <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                                         <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
//                                                         <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
//                                                     </td>
//                                                 </tr>
//                                             ) : (
//                                                 filteredLearners.map(learner => {
//                                                     const isDropped = learner.status === 'dropped';
//                                                     const routingId = learner.enrollmentId || learner.id;
//                                                     const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };

//                                                     return (
//                                                         <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
//                                                             <td>
//                                                                 <div className="cdp-learner-cell">
//                                                                     <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
//                                                                     <div className="cdp-learner-cell__info">
//                                                                         <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
//                                                                         <span className="cdp-learner-cell__id">{learner.idNumber}</span>
//                                                                     </div>
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} color="var(--mlab-grey)" /> {learner.email || 'No Email Attached'}</span>
//                                                                     <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={12} color="var(--mlab-grey)" /> {learner.phone || learner.mobile || 'No Contact Number'}</span>
//                                                                 </div>
//                                                             </td>
//                                                             <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Withdrawn' : 'Active'}</span></td>

//                                                             <td>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                                     <span style={{
//                                                                         display: 'inline-flex',
//                                                                         alignItems: 'center',
//                                                                         padding: '4px 10px',
//                                                                         fontSize: '0.75rem',
//                                                                         fontWeight: 700,
//                                                                         letterSpacing: '0.025em',
//                                                                         background: stats.pct >= 75 ? '#dcfce7' : stats.pct >= 40 ? '#fef3c7' : '#fee2e2',
//                                                                         color: stats.pct >= 75 ? '#166534' : stats.pct >= 40 ? '#b45309' : '#991b1b',
//                                                                         border: stats.pct >= 75 ? '1px solid #bbf7d0' : stats.pct >= 40 ? '1px solid #fde68a' : '1px solid #fca5a5'
//                                                                     }}>
//                                                                         {stats.pct}%
//                                                                     </span>
//                                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
//                                                                         {stats.attended} / {stats.total} classes
//                                                                     </span>
//                                                                 </div>
//                                                             </td>

//                                                             <td style={{ textAlign: 'right' }}>
//                                                                 <div className="cdp-actions" style={{ justifyContent: 'flex-end', display: 'flex' }}>
//                                                                     <button
//                                                                         className="mlab-btn mlab-btn--sm mlab-btn--ghost"
//                                                                         onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}
//                                                                         title="View Applicant Digital Portfolio"
//                                                                     >
//                                                                         <FolderOpen size={12} /> Portfolio
//                                                                     </button>
//                                                                 </div>
//                                                             </td>
//                                                         </tr>
//                                                     );
//                                                 })
//                                             )}
//                                         </tbody>
//                                     </table>
//                                 </div>
//                             </div>
//                         </div>
//                     )}

//                     {activeTab === 'attendance' && (
//                         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
//                             <div className="vp-card" style={{ marginBottom: '2rem' }}>
//                                 <div className="vp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <div className="vp-card-title-group">
//                                         <Calendar size={18} color="var(--mlab-blue)" />
//                                         <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
//                                             Historical Session Ledger
//                                         </h3>
//                                     </div>

//                                     <button
//                                         className="cdp-btn"
//                                         style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}
//                                         onClick={() => setIsDropZoneOpen(true)}
//                                     >
//                                         <UploadCloud size={14} /> Upload Zoom CSV
//                                     </button>
//                                 </div>
//                                 <div className="mlab-table-wrap">
//                                     {attendanceLogs.length === 0 ? (
//                                         <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
//                                             <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
//                                             <p>No attendance records have been logged for this cohort yet.</p>
//                                         </div>
//                                     ) : (
//                                         <table className="mlab-table">
//                                             <thead>
//                                                 <tr>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Session Date</th>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Expected Duration</th>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Total Captured</th>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Present (80%+)</th>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Short Hours</th>
//                                                     <th style={{ color: 'var(--mlab-midnight)' }}>Absent</th>
//                                                 </tr>
//                                             </thead>
//                                             <tbody>
//                                                 {attendanceLogs.map((log) => (
//                                                     <tr key={log.id}>
//                                                         <td style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
//                                                             {new Date(log.sessionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
//                                                         </td>
//                                                         <td>
//                                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                                                 <Clock size={14} /> {log.expectedDuration} mins
//                                                             </span>
//                                                         </td>
//                                                         <td style={{ color: 'var(--mlab-midnight)' }}>{log.totalEnrolled || 0} Learners</td>
//                                                         <td>
//                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#dcfce7', color: '#166534', fontSize: '0.8rem', fontWeight: 600 }}>
//                                                                 <CheckCircle2 size={12} /> {log.totalPresent || 0}
//                                                             </span>
//                                                         </td>
//                                                         <td>
//                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fef3c7', color: '#b45309', fontSize: '0.8rem', fontWeight: 600 }}>
//                                                                 <AlertCircle size={12} /> {log.totalPartial || 0}
//                                                             </span>
//                                                         </td>
//                                                         <td>
//                                                             <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#fee2e2', color: '#991b1b', fontSize: '0.8rem', fontWeight: 600 }}>
//                                                                 <XCircle size={12} /> {log.totalAbsent || 0}
//                                                             </span>
//                                                         </td>
//                                                     </tr>
//                                                 ))}
//                                             </tbody>
//                                         </table>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             </main>
//         </div>
//     );
// };

