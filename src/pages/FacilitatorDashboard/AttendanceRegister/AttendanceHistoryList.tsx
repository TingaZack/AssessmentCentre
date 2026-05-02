// src/components/FacilitatorPortal/AttendanceDashboard/AttendanceDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import {
    FileText, Calendar, ArrowRight, AlertTriangle, History,
    Users, Search, Clock, CheckCircle, XCircle, ArrowRightCircle,
    DownloadCloud, Filter, ScanLine
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db } from '../../../lib/firebase';
import Loader from '../../../components/common/Loader/Loader';
import moment from 'moment';
import '../../../components/views/LearnersView/LearnersView.css';
import './AttendanceHistoryList.css';
import { useStore } from '../../../store/useStore';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

// ─── MODULE-LEVEL REGISTER CACHE ─────────────────────────────────────────────
let cachedHistory: any[] | null = null;

export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
    const navigate = useNavigate();

    const fetchFacilitatorLeaveRequests = useStore(s => s.fetchFacilitatorLeaveRequests);
    const leaveRequests = useStore(s => s.leaveRequests) || [];
    const isFetchingLeaves = useStore(s => s.isFetchingLeaves);
    const updateLeaveStatus = useStore(s => s.updateLeaveStatus);

    const [activeTab, setActiveTab] = useState<'registers' | 'leaves'>('registers');
    const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
    const [loadingRegisters, setLoadingRegisters] = useState<boolean>(() => cachedHistory === null);
    const [error, setError] = useState<string | null>(null);

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

    // ── Fetch registers ───────────────────────────────────────────────────────
    useEffect(() => {
        const fetchHistory = async () => {
            if (!facilitatorId) return;
            if (cachedHistory === null) setLoadingRegisters(true);
            setError(null);
            try {
                const snap = await getDocs(query(
                    collection(db, 'attendance'),
                    where('facilitatorId', '==', facilitatorId),
                    orderBy('date', 'desc')
                ));
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
    }, [facilitatorId]);

    // ── Fetch leaves on tab change ────────────────────────────────────────────
    useEffect(() => {
        if (activeTab === 'leaves' && facilitatorId && leaveRequests.length === 0) {
            fetchFacilitatorLeaveRequests(facilitatorId);
        }
    }, [activeTab, facilitatorId, fetchFacilitatorLeaveRequests, leaveRequests.length]);

    // ── Register Filtering ────────────────────────────────────────────────────
    const filteredHistory = useMemo(() => {
        if (!registerSearch) return history;
        const lower = registerSearch.toLowerCase();
        return history.filter(r =>
            moment(r.date).format('DD MMM YYYY').toLowerCase().includes(lower) ||
            r.date.includes(lower)
        );
    }, [history, registerSearch]);

    // ── Leave Filtering ───────────────────────────────────────────────────────
    const filteredLeaves = useMemo(() => {
        return leaveRequests.filter(req => {
            const matchesSearch = (req.learnerName || req.learnerId).toLowerCase().includes(leaveSearch.toLowerCase());
            const matchesStatus = leaveStatusFilter === 'all' || req.status === leaveStatusFilter;
            const matchesType = leaveTypeFilter === 'all' || req.type === leaveTypeFilter;

            return matchesSearch && matchesStatus && matchesType;
        });
    }, [leaveRequests, leaveSearch, leaveStatusFilter, leaveTypeFilter]);

    const pendingLeaveCount = leaveRequests.filter(r => r.status === 'Pending').length;

    // ── Leave action (Using Custom Modal) ─────────────────────────────────────
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
                } catch (err) {
                    setModalConfig({
                        isOpen: true,
                        type: 'error',
                        title: 'Update Failed',
                        message: 'Failed to update the leave status. Please check your connection and try again.',
                        confirmText: 'Okay',
                        onConfirm: () => setModalConfig(prev => ({ ...prev, isOpen: false }))
                    });
                }
            }
        });
    };

    // ── Loading state ─────────────────────────────────────────────────────────
    if (loadingRegisters || !facilitatorId) {
        return (
            <div className="att-loader-wrap">
                <Loader message="Loading Dashboard…" />
            </div>
        );
    }

    return (
        <div className="att-root animate-fade-in">

            {/* 🚀 Z-INDEX SAFEGUARD FOR STATUS MODAL 🚀 */}
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

            {/* ── TABS ── */}
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

            {/* ── ERROR BANNER ── */}
            {error && (
                <div className="att-error">
                    <div className="att-error__title">
                        <AlertTriangle size={15} /> Database Sync Error
                    </div>
                    <p className="att-error__body">{error}</p>
                </div>
            )}

            {/* ════════════════════════════════════════
                TAB 1 — REGISTERS
            ════════════════════════════════════════ */}
            {activeTab === 'registers' && (
                <>
                    {/* ── REGISTERS TOOLBAR ── */}
                    <div className="mlab-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', flex: 1 }}>
                            <div className="mlab-search" style={{ minWidth: '250px', maxWidth: '350px' }}>
                                <Search size={18} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by date (e.g. 12 Oct)..."
                                    value={registerSearch}
                                    onChange={e => setRegisterSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            className="mlab-btn mlab-btn--primary"
                            onClick={() => navigate('/facilitator/attendance/scanner')}
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            <ScanLine size={16} /> Scan Attendance
                        </button>
                    </div>

                    <div className="mlab-table-wrap">
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Date Recorded</th>
                                    <th>Attendance</th>
                                    <th>Proofs</th>
                                    <th className="att-th--right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredHistory.length > 0 ? filteredHistory.map(record => {
                                    const proofCount = Object.keys(record.proofs || {}).length;
                                    const presentCount = record.presentLearners?.length || 0;
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
                                        <td colSpan={4} style={{ padding: '3rem', textAlign: 'center' }}>
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
                                                    <p className="mlab-empty__desc">Try adjusting your date search.</p>
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

            {/* ════════════════════════════════════════
                TAB 2 — LEAVE REQUESTS
            ════════════════════════════════════════ */}
            {activeTab === 'leaves' && (
                <>
                    {/* ── LEAVE REQUESTS TOOLBAR ── */}
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
                        {isFetchingLeaves ? (
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
                                                {leaveRequests.length === 0 ? (
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




// // src/components/FacilitatorPortal/AttendanceHistoryList/AttendanceHistoryList.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
// import { FileText, Calendar, ArrowRight, AlertTriangle, History, Users, Search } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
// import { db } from '../../../lib/firebase';
// import Loader from '../../../components/common/Loader/Loader';
// import moment from 'moment';
// import '../../../components/views/LearnersView/LearnersView.css';

// // MODULE-LEVEL CACHE
// let cachedHistory: any[] | null = null;

// export const AttendanceHistoryList: React.FC<{ facilitatorId?: string }> = ({ facilitatorId }) => {
//     const navigate = useNavigate();

//     // Check cache strictly on mount
//     const [history, setHistory] = useState<any[]>(() => cachedHistory || []);
//     const [loading, setLoading] = useState<boolean>(() => cachedHistory === null);
//     const [error, setError] = useState<string | null>(null);

//     const [searchTerm, setSearchTerm] = useState('');

//     useEffect(() => {
//         const fetchHistory = async () => {
//             if (!facilitatorId) return;

//             if (cachedHistory === null) {
//                 setLoading(true);
//             }

//             setError(null);

//             try {
//                 const q = query(
//                     collection(db, 'attendance'),
//                     where('facilitatorId', '==', facilitatorId),
//                     orderBy('date', 'desc')
//                 );
//                 const snapshot = await getDocs(q);
//                 const freshData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

//                 cachedHistory = freshData;
//                 setHistory(freshData);
//             } catch (err: any) {
//                 console.error('Firestore Error:', err);
//                 setError(err.message);
//             } finally {
//                 setLoading(false);
//             }
//         };

//         fetchHistory();
//     }, [facilitatorId]);

//     const filteredHistory = useMemo(() => {
//         if (!searchTerm) return history;
//         const lower = searchTerm.toLowerCase();
//         return history.filter(record => {
//             const formattedDate = moment(record.date).format('DD MMM YYYY').toLowerCase();
//             return formattedDate.includes(lower) || record.date.includes(lower);
//         });
//     }, [history, searchTerm]);

//     if (loading || !facilitatorId) return (
//         <div className="animate-fade-in" style={{ padding: '4rem 0', display: 'flex', justifyContent: 'center', width: '100%' }}>
//             <Loader message="Loading History..." />
//         </div>
//     );

//     if (error) return (
//         <div style={{ padding: '2rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', margin: '1rem 0' }}>
//             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', marginBottom: '8px' }}>
//                 <AlertTriangle size={16} /> Database Sync Error
//             </div>
//             <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
//         </div>
//     );

//     return (
//         <div className="mlab-learners animate-fade-in" style={{ paddingBottom: 16, margin: 0 }}>

//             <div className="mlab-toolbar">
//                 <div className="mlab-search">
//                     <Search size={18} color="var(--mlab-grey)" />
//                     <input
//                         type="text"
//                         placeholder="Search by date (e.g. 12 Oct)..."
//                         value={searchTerm}
//                         onChange={e => setSearchTerm(e.target.value)}
//                     />
//                 </div>
//             </div>

//             <div className="mlab-table-wrap">
//                 <table className="mlab-table">
//                     <thead>
//                         <tr>
//                             <th>Date Recorded</th>
//                             <th>Attendance</th>
//                             <th>Proofs</th>
//                             <th style={{ textAlign: 'right' }}>Action</th>
//                         </tr>
//                     </thead>
//                     <tbody>
//                         {filteredHistory.length > 0 ? (
//                             filteredHistory.map(record => {
//                                 const proofCount = Object.keys(record.proofs || {}).length;
//                                 const presentCount = record.presentLearners?.length || 0;
//                                 return (
//                                     <tr key={record.id}>
//                                         <td>
//                                             <div className="mlab-cell-content" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
//                                                 <Calendar size={15} color="var(--mlab-blue)" />
//                                                 <span className="mlab-cell-name">{moment(record.date).format('DD MMM YYYY')}</span>
//                                             </div>
//                                         </td>
//                                         <td>
//                                             <span className="mlab-badge mlab-badge--active" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                                 <Users size={11} /> {presentCount} Present
//                                             </span>
//                                         </td>
//                                         <td>
//                                             {proofCount > 0 ? (
//                                                 <span className="mlab-badge" style={{ background: '#f1f5f9', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                                     <FileText size={11} /> {proofCount} Attached
//                                                 </span>
//                                             ) : (
//                                                 <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>None</span>
//                                             )}
//                                         </td>
//                                         <td style={{ textAlign: 'right' }}>
//                                             <button
//                                                 className="mlab-btn mlab-btn--outline mlab-btn--outline-blue"
//                                                 onClick={() => navigate(`/facilitator/attendance/${record.cohortId}?date=${record.date}`)}
//                                             >
//                                                 Open Register <ArrowRight size={13} />
//                                             </button>
//                                         </td>
//                                     </tr>
//                                 );
//                             })
//                         ) : (
//                             <tr>
//                                 <td colSpan={4}>
//                                     {history.length === 0 ? (
//                                         <div className="mlab-empty">
//                                             <History size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                             <p className="mlab-empty__title">No Records Yet</p>
//                                             <p className="mlab-empty__desc">Saved attendance registers will appear here.</p>
//                                         </div>
//                                     ) : (
//                                         <div className="mlab-empty">
//                                             <Search size={40} color="var(--mlab-green)" className="mlab-empty-icon" />
//                                             <p className="mlab-empty__title">No matches found</p>
//                                             <p className="mlab-empty__desc">Try adjusting your search term.</p>
//                                             <button
//                                                 className="mlab-btn mlab-btn--outline"
//                                                 onClick={() => setSearchTerm('')}
//                                                 style={{ marginTop: '1rem' }}
//                                             >
//                                                 Clear Search
//                                             </button>
//                                         </div>
//                                     )}
//                                 </td>
//                             </tr>
//                         )}
//                     </tbody>
//                 </table>
//             </div>
//         </div>
//     );
// };