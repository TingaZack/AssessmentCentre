// src/pages/mentor/MentorDashboard/MentorDashboard.tsx

import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    CheckCircle,
    Clock,
    Search,
    FileText,
    ChevronRight,
    ChevronLeft,
    Activity,
    Users,
    CheckCircle2,
    Filter,
    RotateCcw,
    RefreshCw,
    XCircle,
    Briefcase,
    Calendar,
    UserCheck
} from 'lucide-react';
import moment from 'moment';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { ToastContainer, useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import Loader from '../../../components/common/Loader/Loader';

export const MentorDashboard: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();

    const {
        user,
        learners = [],
        enrollments = [],
        cohorts = [],
        employers = [],
        staff = [],
        placements = [],
        fetchLearners,
        fetchEnrollments,
        fetchCohorts,
        fetchEmployers,
        fetchStaff,
        fetchPlacements
    } = useStore() as any;

    const userRole = (user?.role || '').toLowerCase();
    const isSuperAdmin = (user as any)?.isSuperAdmin === true || userRole.includes('super');
    const isAdminOrStaff = ['admin', 'assistant_admin', 'super_admin', 'superadmin', 'facilitator', 'assessor', 'moderator'].includes(userRole) || isSuperAdmin;

    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

    // REAL-TIME LOGS STATE
    const [localLogs, setLocalLogs] = useState<any[]>([]);

    // FILTER STATES
    const [selectedCohort, setSelectedCohort] = useState('ALL');
    const [selectedEmployer, setSelectedEmployer] = useState('ALL');
    const [selectedMentor, setSelectedMentor] = useState('ALL');
    const [selectedMonth, setSelectedMonth] = useState('ALL');
    const [resubmissionOnly, setResubmissionOnly] = useState(false);

    // 🚀 PAGINATION STATES
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    useEffect(() => {
        const loadDashboardData = async () => {
            setLoading(true);
            try {
                await Promise.all([
                    fetchLearners ? fetchLearners() : Promise.resolve(),
                    fetchEnrollments ? fetchEnrollments() : Promise.resolve(),
                    fetchCohorts ? fetchCohorts() : Promise.resolve(),
                    fetchEmployers ? fetchEmployers() : Promise.resolve(),
                    fetchStaff ? fetchStaff() : Promise.resolve(),
                    fetchPlacements ? fetchPlacements() : Promise.resolve()
                ]);
            } catch (error) {
                console.error("Mentor Dashboard Load Error:", error);
                toast.error("Failed to sync ecosystem data.");
            } finally {
                setLoading(false);
            }
        };

        if (user?.uid) {
            loadDashboardData();
        }
    }, [user?.uid, fetchLearners, fetchEnrollments, fetchCohorts, fetchEmployers, fetchStaff, fetchPlacements]);

    // REAL-TIME WORKPLACE LOGS LISTENER
    useEffect(() => {
        if (!user?.uid) return;

        const logsMap = new Map<string, any>();

        const updateState = () => {
            setLocalLogs(Array.from(logsMap.values()));
        };

        if (isAdminOrStaff) {
            // GLOBAL OVERVIEW FOR ADMINS & STAFF
            const qGlobal = collection(db, 'workplace_logs');
            const unsubGlobal = onSnapshot(qGlobal, (snap) => {
                logsMap.clear();
                snap.docs.forEach(d => logsMap.set(d.id, { id: d.id, ...d.data() }));
                updateState();
            }, (err) => console.warn("Global workplace logs query error:", err.message));

            return () => unsubGlobal();
        } else {
            // SCOPED OVERVIEW FOR INDIVIDUAL MENTORS
            const qPrimary = query(collection(db, 'workplace_logs'), where('mentorId', '==', user.uid));
            const unsubPrimary = onSnapshot(qPrimary, (snap) => {
                snap.docs.forEach(d => logsMap.set(d.id, { id: d.id, ...d.data() }));
                updateState();
            }, (err) => console.warn("Primary mentor logs query error:", err.message));

            const qSecondary = query(collection(db, 'workplace_logs'), where('secondaryMentorIds', 'array-contains', user.uid));
            const unsubSecondary = onSnapshot(qSecondary, (snap) => {
                snap.docs.forEach(d => logsMap.set(d.id, { id: d.id, ...d.data() }));
                updateState();
            }, (err) => console.warn("Secondary mentor logs query error:", err.message));

            return () => {
                unsubPrimary();
                unsubSecondary();
            };
        }
    }, [user?.uid, isAdminOrStaff]);

    const myLogs = useMemo(() => {
        return localLogs.filter((log: any) => log.status !== 'Draft');
    }, [localLogs]);

    // DYNAMIC FILTER OPTIONS
    const cohortOptions = useMemo(() => {
        const setMap = new Map<string, string>();
        myLogs.forEach((log: any) => {
            if (log.cohortId) {
                const match = cohorts.find((c: any) => c.id === log.cohortId);
                setMap.set(log.cohortId, match?.name || log.cohortName || 'Unnamed Cohort');
            }
        });
        return Array.from(setMap.entries()).map(([id, name]) => ({ id, name }));
    }, [myLogs, cohorts]);

    const employerOptions = useMemo(() => {
        const setMap = new Map<string, string>();
        myLogs.forEach((log: any) => {
            const empId = log.employerId;
            if (empId) {
                const match = employers.find((e: any) => e.id === empId);
                setMap.set(empId, match?.name || 'Partner Host Company');
            }
        });
        return Array.from(setMap.entries()).map(([id, name]) => ({ id, name }));
    }, [myLogs, employers]);

    const mentorOptions = useMemo(() => {
        const setMap = new Map<string, string>();
        myLogs.forEach((log: any) => {
            const mId = log.mentorId;
            if (mId) {
                const matchStaff = staff.find((s: any) => s.id === mId || s.authUid === mId || s.uid === mId);
                setMap.set(mId, matchStaff?.fullName || matchStaff?.name || log.mentorName || 'Assigned Mentor');
            }
        });
        return Array.from(setMap.entries()).map(([id, name]) => ({ id, name }));
    }, [myLogs, staff]);

    const monthOptions = useMemo(() => {
        const months = new Set<string>();
        myLogs.forEach((log: any) => {
            if (log.dateString) {
                months.add(moment(log.dateString).format('YYYY-MM'));
            }
        });
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    }, [myLogs]);

    // DATA TAB SPLIT
    const mentorData = useMemo(() => {
        const pending: any[] = [];
        const completed: any[] = [];

        myLogs.forEach((log: any) => {
            const learnerInfo = learners.find((l: any) => l.learnerId === log.learnerId || l.id === log.learnerId);
            const mentorInfo = staff.find((s: any) => s.id === log.mentorId || s.authUid === log.mentorId || s.uid === log.mentorId);

            const logExtended = {
                ...log,
                learner: learnerInfo || { fullName: log.learnerName || 'Unknown Learner' },
                assignedMentorName: mentorInfo?.fullName || mentorInfo?.name || log.mentorName || 'Assigned Mentor'
            };
            const status = String(log.status || '').toLowerCase();

            if (selectedCohort !== 'ALL' && log.cohortId !== selectedCohort) return;
            if (selectedEmployer !== 'ALL' && log.employerId !== selectedEmployer) return;
            if (selectedMentor !== 'ALL' && log.mentorId !== selectedMentor) return;

            if (selectedMonth !== 'ALL' && log.dateString) {
                if (moment(log.dateString).format('YYYY-MM') !== selectedMonth) return;
            }

            const isResubmission = log.rejectionReason || (Array.isArray(log.history) && log.history.length > 0);
            if (resubmissionOnly && !isResubmission) return;

            if (status === 'pending_mentor_approval' || status === 'pending') {
                pending.push(logExtended);
            } else if (['approved', 'rejected'].includes(status)) {
                completed.push(logExtended);
            }
        });

        return {
            pending: pending.sort((a, b) => new Date(b.dateString || 0).getTime() - new Date(a.dateString || 0).getTime()),
            completed: completed.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
        };
    }, [myLogs, learners, staff, selectedCohort, selectedEmployer, selectedMentor, selectedMonth, resubmissionOnly]);

    // Search Filter
    const filteredList = useMemo(() => {
        return (mentorData[activeTab] || []).filter((item: any) => {
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase().trim();
            return (
                item.learner?.fullName?.toLowerCase().includes(term) ||
                item.assignedMentorName?.toLowerCase().includes(term) ||
                item.moduleName?.toLowerCase().includes(term) ||
                item.topicTitle?.toLowerCase().includes(term) ||
                item.workActivityCode?.toLowerCase().includes(term)
            );
        });
    }, [mentorData, activeTab, searchTerm]);

    // RESET PAGINATION WHEN FILTERS OR TABS CHANGE
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, selectedCohort, selectedEmployer, selectedMentor, selectedMonth, resubmissionOnly, searchTerm]);

    // PAGINATED ITEMS COMPUTATION
    const totalPages = Math.max(1, Math.ceil(filteredList.length / itemsPerPage));

    const paginatedList = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredList.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredList, currentPage, itemsPerPage]);

    // ACCURATE ACTIVE PLACED INTERNS METRIC
    const totalAssignedLearners = useMemo(() => {
        const activeLearnerIds = new Set<string>();

        if (isAdminOrStaff) {
            (placements || []).forEach((p: any) => {
                const statusLower = String(p.status || '').toLowerCase();
                const isLive = statusLower.includes('active') || statusLower.includes('pending') || statusLower.includes('interview');
                if (isLive && p.learnerId) {
                    activeLearnerIds.add(p.learnerId);
                }
            });

            localLogs.forEach((log: any) => {
                if (log.learnerId) {
                    activeLearnerIds.add(log.learnerId);
                }
            });

            return activeLearnerIds.size;
        }

        const myUid = user?.uid || user?.id;

        (enrollments || []).forEach((e: any) => {
            if (e.mentorId === myUid || (Array.isArray(e.secondaryMentorIds) && e.secondaryMentorIds.includes(myUid))) {
                if (e.learnerId) activeLearnerIds.add(e.learnerId);
            }
        });

        (placements || []).forEach((p: any) => {
            if (p.mentorId === myUid || p.assignedMentorName === user?.fullName || (Array.isArray(p.secondaryMentorIds) && p.secondaryMentorIds.includes(myUid))) {
                if (p.learnerId) activeLearnerIds.add(p.learnerId);
            }
        });

        localLogs.forEach((log: any) => {
            if (log.mentorId === myUid || (Array.isArray(log.secondaryMentorIds) && log.secondaryMentorIds.includes(myUid))) {
                if (log.learnerId) activeLearnerIds.add(log.learnerId);
            }
        });

        return activeLearnerIds.size;
    }, [isAdminOrStaff, placements, localLogs, enrollments, user]);

    const hasActiveFilters = selectedCohort !== 'ALL' || selectedEmployer !== 'ALL' || selectedMentor !== 'ALL' || selectedMonth !== 'ALL' || resubmissionOnly || !!searchTerm;

    const handleResetFilters = () => {
        setSelectedCohort('ALL');
        setSelectedEmployer('ALL');
        setSelectedMentor('ALL');
        setSelectedMonth('ALL');
        setResubmissionOnly(false);
        setSearchTerm('');
    };

    if (loading) {
        return (
            <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', minHeight: '400px' }}>
                <Loader message="Loading Workplace Logbook Data..." />
            </div>
        );
    }

    const startIndex = (currentPage - 1) * itemsPerPage + 1;
    const endIndex = Math.min(currentPage * itemsPerPage, filteredList.length);

    return (
        <div style={{ padding: '1.5rem', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <style>{`
                .sm-table-container { 
                    background: #fff; 
                    border: 1px solid var(--mlab-border); 
                    border-top: 3px solid var(--mlab-blue); 
                    overflow: hidden; 
                    margin-top: 0px; 
                    border-radius: 4px; 
                    display: flex; 
                    flex-direction: column; 
                    flex: 1; /* 🚀 Stretches table container to absorb all remaining viewport height */
                    min-height: 420px; 
                }
                .sm-table-scroll { 
                    flex: 1; /* 🚀 Stretches table scroll view down to pagination bar */
                    overflow-y: auto; 
                    overflow-x: auto; 
                    display: flex; 
                    flex-direction: column; 
                }
                .sm-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; text-align: left; }
                .sm-table th { background: var(--mlab-light-blue); padding: 12px 16px; font-family: var(--font-heading); text-transform: uppercase; color: var(--mlab-blue); border-bottom: 1px solid var(--mlab-border); font-size: 0.8rem; letter-spacing: 0.05em; position: sticky; top: 0; z-index: 10; }
                .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
                .sm-table tr:hover td { background-color: #f8fafc; }
                
                .sm-badge-verified { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
                .sm-badge-pending { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
                .sm-badge-rejected { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; }
                
                .sm-btn-review { background: var(--mlab-blue); color: white; border: none; padding: 6px 14px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                .sm-btn-review:hover { background: var(--mlab-midnight); transform: translateY(-1px); }
                
                .sm-btn-view { background: white; color: #475569; border: 1px solid #cbd5e1; padding: 6px 14px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
                .sm-btn-view:hover { background: #f8fafc; border-color: #94a3b8; color: #0f172a; }

                .sm-filter-select { height: 34px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 10px; font-size: 0.78rem; font-family: var(--font-body); color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }

                /* PAGINATION STYLES */
                .sm-pagination-bar { 
                    display: flex; 
                    align-items: center; 
                    justify-content: space-between; 
                    padding: 10px 16px; 
                    background: #f8fafc; 
                    border-top: 1px solid #cbd5e1; 
                    font-size: 0.8rem; 
                    color: #475569; 
                    flex-wrap: wrap; 
                    gap: 10px;
                    margin-top: auto; /* 🚀 Pointers pagination bar at bottom of card */
                }
                .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; alignItems: center; gap: 4px; }
                .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                .sm-page-btn.active { background: var(--mlab-blue); color: #ffffff; border-color: var(--mlab-blue); }
            `}</style>

            <div className="wm-page-header">
                <div className="wm-page-header__left">
                    <div className="wm-page-header__icon"><Briefcase size={22} /></div>
                    <div>
                        <h1 className="wm-page-header__title">
                            {isAdminOrStaff ? 'Institutional Logbook Governance Hub' : 'Workplace Verification Hub'}
                        </h1>
                        <p className="wm-page-header__desc">
                            {isAdminOrStaff
                                ? 'Global institutional oversight: Inspect, audit, and approve workplace logbook submissions across all host employers and mentors.'
                                : user?.companyName ? `Assigned Host Employer: ${user.companyName}` : 'Inspect, verify, and digitally sign learner logbook submissions.'}
                        </p>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid #f97316', padding: '1.25rem', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Awaiting Verification</span>
                        <Clock size={20} color="#f97316" />
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                        {mentorData.pending.length}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', marginTop: '4px' }}>
                        {isAdminOrStaff ? 'Total institution-wide logbooks pending review' : 'Logbooks requiring mentor review'}
                    </div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-green)', padding: '1.25rem', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>Verified &amp; Signed</span>
                        <CheckCircle size={20} color="var(--mlab-green)" />
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                        {myLogs.filter((l: any) => String(l.status || '').toLowerCase() === 'approved').length}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', marginTop: '4px' }}>Completed logbook records</div>
                </div>

                <div style={{ background: '#fff', border: '1px solid var(--mlab-border)', borderTop: '3px solid var(--mlab-blue)', padding: '1.25rem', borderRadius: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-heading)', fontWeight: 700, textTransform: 'uppercase', color: 'var(--mlab-grey)' }}>
                            {isAdminOrStaff ? 'Active Placed Interns' : 'Assigned Learners'}
                        </span>
                        <Users size={20} color="var(--mlab-blue)" />
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)' }}>
                        {totalAssignedLearners}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', marginTop: '4px' }}>
                        {isAdminOrStaff ? 'Enrolled active interns across all host SMEs' : 'Active intern allocations'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', borderBottom: '2px solid var(--mlab-border)', marginBottom: '1.25rem', gap: '8px' }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('pending')}
                    style={{
                        padding: '10px 18px',
                        background: activeTab === 'pending' ? '#ffffff' : 'transparent',
                        border: 'none',
                        color: activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-heading)',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: activeTab === 'pending' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                        borderRadius: '0px'
                    }}
                >
                    <Clock size={15} color={activeTab === 'pending' ? 'var(--mlab-blue)' : '#64748b'} />
                    Pending Sign-off ({mentorData.pending.length})
                </button>

                <button
                    type="button"
                    onClick={() => setActiveTab('completed')}
                    style={{
                        padding: '10px 18px',
                        background: activeTab === 'completed' ? '#ffffff' : 'transparent',
                        border: 'none',
                        color: activeTab === 'completed' ? 'var(--mlab-blue)' : '#64748b',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        fontFamily: 'var(--font-heading)',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        borderBottom: activeTab === 'completed' ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                        borderRadius: '0px'
                    }}
                >
                    <CheckCircle size={15} color={activeTab === 'completed' ? 'var(--mlab-blue)' : '#64748b'} />
                    Verification History ({mentorData.completed.length})
                </button>
            </div>

            {/* FILTER CONTROLS BAR */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', background: '#ffffff', padding: '10px 14px', border: '1px solid var(--mlab-border)', marginBottom: '1rem', borderRadius: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--mlab-blue)', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                        <Filter size={14} color="var(--mlab-blue)" /> Filters:
                    </div>

                    {/* MENTOR FILTER DROPDOWN */}
                    {mentorOptions.length > 0 && (
                        <select value={selectedMentor} onChange={e => setSelectedMentor(e.target.value)} className="sm-filter-select">
                            <option value="ALL">All Mentors ({mentorOptions.length})</option>
                            {mentorOptions.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    )}

                    {cohortOptions.length > 0 && (
                        <select value={selectedCohort} onChange={e => setSelectedCohort(e.target.value)} className="sm-filter-select">
                            <option value="ALL">All Cohorts ({cohortOptions.length})</option>
                            {cohortOptions.map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    )}

                    {employerOptions.length > 0 && (
                        <select value={selectedEmployer} onChange={e => setSelectedEmployer(e.target.value)} className="sm-filter-select">
                            <option value="ALL">All Host Employers ({employerOptions.length})</option>
                            {employerOptions.map(e => (
                                <option key={e.id} value={e.id}>{e.name}</option>
                            ))}
                        </select>
                    )}

                    {monthOptions.length > 0 && (
                        <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="sm-filter-select">
                            <option value="ALL">All Months ({monthOptions.length})</option>
                            {monthOptions.map(m => (
                                <option key={m} value={m}>{moment(m, 'YYYY-MM').format('MMMM YYYY')}</option>
                            ))}
                        </select>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700, color: resubmissionOnly ? '#c2410c' : '#475569', cursor: 'pointer', background: resubmissionOnly ? '#fff7ed' : '#f8fafc', padding: '6px 10px', borderRadius: '4px', border: `1px solid ${resubmissionOnly ? '#fed7aa' : 'var(--mlab-border)'}`, userSelect: 'none' }}>
                        <input
                            type="checkbox"
                            checked={resubmissionOnly}
                            onChange={e => setResubmissionOnly(e.target.checked)}
                            style={{ accentColor: '#c2410c', cursor: 'pointer' }}
                        />
                        <RefreshCw size={12} color={resubmissionOnly ? '#c2410c' : '#64748b'} />
                        Revisions Only
                    </label>
                </div>

                {hasActiveFilters && (
                    <button
                        type="button"
                        onClick={handleResetFilters}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid #fca5a5', background: '#fef2f2', color: '#b91c1c', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase' }}
                    >
                        <RotateCcw size={12} /> Clear Filters
                    </button>
                )}
            </div>

            {/* FULLY STRETCHED TABLE CONTAINER */}
            <div className="sm-table-container">
                <div style={{
                    padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {activeTab === 'pending' ? `Pending Logbook Queue (${filteredList.length})` : `Verified Submissions History (${filteredList.length})`}
                        </h3>
                    </div>

                    <div style={{ position: 'relative', width: '280px' }}>
                        <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            placeholder="Search learner, mentor or task..."
                            style={{ paddingLeft: '32px', borderRadius: '4px', border: 'none', width: '100%', fontSize: '0.8rem', height: '34px', background: '#fff', color: 'var(--mlab-blue)', outline: 'none' }}
                        />
                    </div>
                </div>

                {filteredList.length === 0 ? (
                    <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Activity size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
                        <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Logbook Submissions Found</h4>
                        <p style={{ margin: 0, fontSize: '0.82rem' }}>
                            {hasActiveFilters ? 'No logbooks match the active filter criteria. Try resetting filters.' : (activeTab === 'pending' ? 'There are currently no workplace logbooks awaiting verification.' : 'No verified logbooks match your search criteria.')}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* 🚀 SCROLLABLE & STRETCHED BODY */}
                        <div className="sm-table-scroll">
                            <table className="sm-table">
                                <thead>
                                    <tr>
                                        <th>Learner Details</th>
                                        {isAdminOrStaff && <th>Assigned Mentor</th>}
                                        <th>Log Date &amp; Time</th>
                                        <th>Workplace Task / Module</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedList.map((log: any) => {
                                        const isResubmission = !!log.rejectionReason || (Array.isArray(log.history) && log.history.length > 0);
                                        const statusLower = String(log.status || '').toLowerCase();

                                        return (
                                            <tr key={log.id}>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{ width: '32px', height: '32px', background: 'var(--mlab-light-blue)', color: 'var(--mlab-blue)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.8rem', flexShrink: 0 }}>
                                                            {log.learner?.fullName?.charAt(0) || 'L'}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                {log.learner?.fullName || 'Unknown Learner'}
                                                                {isResubmission && (
                                                                    <span style={{ fontSize: '0.62rem', background: '#e0e7ff', color: '#3730a3', padding: '1px 5px', borderRadius: '4px', fontWeight: 800, textTransform: 'uppercase', border: '1px solid #c7d2fe' }}>
                                                                        Resubmitted
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)' }}>ID: {log.learner?.idNumber || 'N/A'}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {isAdminOrStaff && (
                                                    <td>
                                                        <div style={{ fontWeight: 700, color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                            <UserCheck size={13} color="var(--mlab-blue)" />
                                                            {log.assignedMentorName}
                                                        </div>
                                                    </td>
                                                )}

                                                <td>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Calendar size={13} color="var(--mlab-green)" />
                                                        {moment(log.dateString).format('DD MMM YYYY')}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Clock size={11} /> {log.startTime} - {log.endTime} <span style={{ color: '#ea580c', fontWeight: 700 }}>({log.totalHours} hrs)</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ fontWeight: 'bold', color: 'var(--mlab-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <FileText size={13} color="var(--mlab-green)" />
                                                        {log.moduleName || 'General Workplace Duties'}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--mlab-grey)', marginTop: '2px' }}>
                                                        {log.isQctoAligned ? log.topicTitle : 'Custom Task Logging'}
                                                    </div>
                                                </td>
                                                <td>
                                                    {statusLower === 'approved' && (
                                                        <span className="sm-badge-verified">
                                                            <CheckCircle2 size={11} /> Verified &amp; Signed
                                                        </span>
                                                    )}
                                                    {statusLower === 'rejected' && (
                                                        <span className="sm-badge-rejected">
                                                            <XCircle size={11} /> Revisions Requested
                                                        </span>
                                                    )}
                                                    {(statusLower === 'pending_mentor_approval' || statusLower === 'pending') && (
                                                        <span className="sm-badge-pending">
                                                            <Clock size={11} /> Pending Review
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => navigate(`/mentor-verify/${log.id}${activeTab === 'completed' ? '?readOnly=true' : ''}`)}
                                                        className={activeTab === 'pending' ? 'sm-btn-review' : 'sm-btn-view'}
                                                    >
                                                        {activeTab === 'pending' ? 'Review & Sign' : 'View Record'} <ChevronRight size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* 🚀 PAGINATION CONTROLS PINNED AT BOTTOM */}
                        <div className="sm-pagination-bar">
                            <div>
                                Showing <strong>{startIndex}</strong> to <strong>{endIndex}</strong> of <strong>{filteredList.length}</strong> logbook entries
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>Rows per page:</span>
                                    <select
                                        className="sm-filter-select"
                                        style={{ height: '28px', padding: '0 6px', fontSize: '0.75rem' }}
                                        value={itemsPerPage}
                                        onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                    </select>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <button
                                        type="button"
                                        className="sm-page-btn"
                                        disabled={currentPage === 1}
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    >
                                        <ChevronLeft size={14} /> Prev
                                    </button>

                                    <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
                                        {currentPage} / {totalPages}
                                    </span>

                                    <button
                                        type="button"
                                        className="sm-page-btn"
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    >
                                        Next <ChevronRight size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};