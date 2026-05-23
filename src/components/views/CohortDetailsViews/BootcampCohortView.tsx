// src/pages/CohortDetailsPage/views/BootcampCohortView.tsx

import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, ChevronLeft, Mail, Phone, Award, DownloadCloud, FolderOpen, UserCheck, Clock, CheckCircle2, AlertCircle, XCircle, UploadCloud, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
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

    const [attendanceLogs, setAttendanceLogs] = useState<any[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);

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
        const map = new Map<string, { attended: number; total: number; pct: number }>();
        const totalSessions = attendanceLogs.length;

        attendanceRecords.forEach(rec => {
            if (!rec.learnerId) return;
            if (!map.has(rec.learnerId)) {
                map.set(rec.learnerId, { attended: 0, total: totalSessions, pct: 0 });
            }
            const entry = map.get(rec.learnerId)!;
            if (rec.status === 'Present' || rec.status === 'Partial') {
                entry.attended += 1;
            }
        });

        map.forEach(value => {
            value.total = totalSessions;
            value.pct = totalSessions > 0 ? Math.round((value.attended / totalSessions) * 100) : 0;
        });

        return map;
    }, [attendanceRecords, attendanceLogs.length]);

    //  PIPELINE MATRIX: Computes active searches and filter intersections cleanly
    const filteredLearners = useMemo(() => {
        return enrolledLearners.filter(learner => {
            // Pass 1: Multi-field string text match
            const searchLower = searchTerm.toLowerCase().trim();
            const dbEmail = (learner.email || learner.demographics?.learnerEmailAddress || '').toLowerCase();
            const matchesSearch = !searchLower ||
                learner.fullName.toLowerCase().includes(searchLower) ||
                learner.idNumber.includes(searchLower) ||
                dbEmail.includes(searchLower);

            // Pass 2: Status checking intersection
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' && learner.status !== 'dropped') ||
                (statusFilter === 'dropped' && learner.status === 'dropped');

            // Pass 3: Compliance threshold metric match
            const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
            let matchesAttendance = true;
            if (attendanceFilter === 'high') matchesAttendance = stats.pct >= 75;
            else if (attendanceFilter === 'mid') matchesAttendance = stats.pct >= 40 && stats.pct < 75;
            else if (attendanceFilter === 'low') matchesAttendance = stats.pct < 40;

            return matchesSearch && matchesStatus && matchesAttendance;
        });
    }, [enrolledLearners, searchTerm, statusFilter, attendanceFilter, rosterAttendanceMap, attendanceLogs.length]);

    const handleExport = () => {
        if (filteredLearners.length === 0) {
            toast.error('No matching records to export.');
            return;
        }

        const dataRows = filteredLearners.map(l => {
            const att = rosterAttendanceMap.get(l.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };
            return {
                "Full Name": l.fullName,
                "ID Number": l.idNumber,
                "Email Address": l.email || l.demographics?.learnerEmailAddress || 'N/A',
                "Phone Number": l.phone || l.mobile || l.demographics?.learnerPhoneNumber || 'N/A',
                "Attendance Score": `${att.attended}/${att.total} (${att.pct}%)`,
                "Status": l.status === 'dropped' ? 'Withdrawn' : 'Active Applicant',
                "Enrolled Date": l.createdAt?.split('T')[0] || ''
            };
        });

        const ws = XLSX.utils.json_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Bootcamp Roster');
        XLSX.writeFile(wb, `Bootcamp_Applicants_${cohort.name.replace(/\s+/g, '_')}.xlsx`);
        toast.success('Roster exported successfully with tracking metrics.');
    };

    if (!cohort) return null;

    return (
        <div className="cdp-layout">

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
                        <div className="cdp-header__eyebrow"><Users size={12} /> Bootcamp Funnel</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className="cdp-header__status cdp-header__status--active">Bootcamp Active</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        <button className="cdp-btn cdp-btn--outline" onClick={handleExport}>
                            <DownloadCloud size={13} /> Export List
                        </button>
                    </div>
                </header>

                <div className="cdp-content">
                    <div className="cdp-stat-row">
                        <div className="cdp-stat-card cdp-stat-card--blue">
                            <div className="cdp-stat-card__icon"><Users size={20} /></div>
                            <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Applicants</span></div>
                        </div>
                        <div className="cdp-stat-card cdp-stat-card--grey">
                            <div className="cdp-stat-card__icon"><Award size={20} /></div>
                            <div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Withdrawn</span></div>
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

                                {/* : MASTER INTEGRATED FILTER CONTROLS BAR */}
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '1rem',
                                    padding: '1rem 1.5rem',
                                    backgroundColor: '#f8fafc',
                                    borderBottom: '1px solid var(--mlab-border)',
                                    alignItems: 'center',
                                    justifyContent: 'space-between'
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
                                        {/* Status Filtering */}
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

                                        {/* Compliance Metrics Selector */}
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
                                                <th>Attendance Score</th>
                                                <th style={{ textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLearners.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                                        <Search size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                        <p style={{ margin: 0, fontWeight: 500 }}>No applicants match your current query parameter thresholds.</p>
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLearners.map(learner => {
                                                    const isDropped = learner.status === 'dropped';
                                                    const routingId = learner.enrollmentId || learner.id;
                                                    const stats = rosterAttendanceMap.get(learner.learnerId) || { attended: 0, total: attendanceLogs.length, pct: 0 };

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
                                                                        border: stats.pct >= 75 ? '1px solid #bbf7d0' : stats.pct >= 40 ? '1px solid #fde68a' : '1px solid #fca5a5'
                                                                    }}>
                                                                        {stats.pct}%
                                                                    </span>
                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>
                                                                        {stats.attended} / {stats.total} classes
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
                                <div className="vp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className="vp-card-title-group">
                                        <Calendar size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Historical Session Ledger
                                        </h3>
                                    </div>

                                    <button
                                        className="cdp-btn"
                                        style={{ background: 'var(--mlab-blue)', color: 'white', border: 'none' }}
                                        onClick={() => setIsDropZoneOpen(true)}
                                    >
                                        <UploadCloud size={14} /> Upload Zoom CSV
                                    </button>
                                </div>
                                <div className="mlab-table-wrap">
                                    {attendanceLogs.length === 0 ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <Clock size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p>No attendance records have been logged for this cohort yet.</p>
                                        </div>
                                    ) : (
                                        <table className="mlab-table">
                                            <thead>
                                                <tr>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Session Date</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Expected Duration</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Total Captured</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Present (80%+)</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Short Hours</th>
                                                    <th style={{ color: 'var(--mlab-midnight)' }}>Absent</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {attendanceLogs.map((log) => (
                                                    <tr key={log.id}>
                                                        <td style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>
                                                            {new Date(log.sessionDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
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

