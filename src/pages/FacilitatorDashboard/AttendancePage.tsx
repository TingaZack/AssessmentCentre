// src/pages/FacilitatorDashboard/AttendancePage.tsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
    doc, getDoc, getDocs, collection, query, where,
    updateDoc, arrayRemove, arrayUnion
} from 'firebase/firestore';
import {
    ChevronLeft, Save, Edit3, Search,
    DownloadCloud, Calendar, Users, Filter, // Imported Filter icon
    Lock
} from 'lucide-react';
import { db } from '../../lib/firebase';
import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
import Loader from '../../components/common/Loader/Loader';

export const AttendancePage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // DYNAMIC DATE FROM URL 
    const urlParams = new URLSearchParams(location.search);
    const registerDate = urlParams.get('date') || new Date().toISOString().split('T')[0];

    // ─── DATA STATES ───
    const [attendanceList, setAttendanceList] = useState<any[]>([]);
    const [cohortData, setCohortData] = useState<any>(null);
    const [recordId, setRecordId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    // ─── UI CONTROLS ───
    const [isLocked, setIsLocked] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    // NEW: Status Filter State
    const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');

    useEffect(() => {
        const getAttendance = async () => {
            try {
                const targetCohortId = cohortId || "vc2Q2VxJHMnWBhgcIITg";

                // Find the exact address (doc ID) for this specific register
                const attQuery = query(
                    collection(db, "attendance"),
                    where("cohortId", "==", targetCohortId),
                    where("date", "==", registerDate)
                );

                const attSnaps = await getDocs(attQuery);
                let attData: any = { presentLearners: [], absentLearners: [], reasons: {}, proofs: {} };

                if (!attSnaps.empty) {
                    const docSnap = attSnaps.docs[0];
                    setRecordId(docSnap.id);
                    attData = docSnap.data();
                } else {
                    setRecordId(null);
                }

                // Fetch the Cohort to get the list of ALL students and the class name
                const cohortSnap = await getDoc(doc(db, "cohorts", targetCohortId));
                let cohortLearnerIds: string[] = [];

                if (cohortSnap.exists()) {
                    setCohortData(cohortSnap.data());
                    cohortLearnerIds = cohortSnap.data().learnerIds || [];
                }

                // Fetch all learner profiles for this cohort
                if (cohortLearnerIds.length > 0) {
                    const learnerQuery = query(collection(db, "learners"), where("idNumber", "in", cohortLearnerIds));
                    const learnerSnaps = await getDocs(learnerQuery);

                    const roster = learnerSnaps.docs.map(d => {
                        const profile = d.data();
                        const id = profile.idNumber;

                        // Determine if they are currently marked present or absent in the DB
                        const isPresent = attData.presentLearners?.includes(id) || false;

                        return {
                            ...profile,
                            isPresent: isPresent,
                            reason: attData.reasons?.[id] || '',
                            proof: attData.proofs?.[id] || null
                        };
                    });

                    // Sort alphabetically
                    roster.sort((a: any, b: any) => a.fullName.localeCompare(b.fullName));
                    setAttendanceList(roster);
                }
                setLoading(false);
            } catch (error) {
                console.error("Fetch error:", error);
                setLoading(false);
            }
        };

        getAttendance();
    }, [cohortId, registerDate]);

    const handleToggle = async (idNumber: string) => {
        if (isLocked) return;
        if (!recordId) {
            alert("No register found for this date. Please ensure it was finalized from the dashboard.");
            return;
        }

        const learner = attendanceList.find(l => l.idNumber === idNumber);
        if (!learner) return;

        const currentlyPresent = learner.isPresent;
        const attRef = doc(db, "attendance", recordId);

        try {
            if (currentlyPresent) {
                await updateDoc(attRef, {
                    presentLearners: arrayRemove(idNumber),
                    absentLearners: arrayUnion(idNumber)
                });
            } else {
                await updateDoc(attRef, {
                    absentLearners: arrayRemove(idNumber),
                    presentLearners: arrayUnion(idNumber)
                });
            }

            setAttendanceList(prev => prev.map(l => {
                if (l.idNumber === idNumber) {
                    return { ...l, isPresent: !currentlyPresent };
                }
                return l;
            }));

        } catch (error) {
            console.error("Firebase update failed:", error);
            alert("Failed to update status on server.");
        }
    };

    const handleSaveUpdates = async () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsLocked(true);
            setIsSaving(false);
        }, 600);
    };

    // COMBINED FILTER: Search Term + Status Dropdown
    const filteredLearners = attendanceList.filter(l => {
        const matchesSearch = l.fullName.toLowerCase().includes(searchTerm.toLowerCase()) || l.idNumber.includes(searchTerm);
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'present' && l.isPresent) ||
            (statusFilter === 'absent' && !l.isPresent);

        return matchesSearch && matchesStatus;
    });

    if (loading) {
        return (
            <div className="cdp-layout">
                <main className="cdp-main cdp-main--centered">
                    {/* <div className="cdp-loading-state">
                        <span className="cdp-loading-state__label">Loading Register...</span>
                    </div> */}
                    <Loader message='Loading register...' />
                </main>
            </div>
        );
    }

    return (
        <div className="cdp-layout">
            <main className="cdp-main">

                {/* ─── HEADER ─── */}
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={() => navigate(-1)}>
                            <ChevronLeft size={14} /> Back
                        </button>
                        <div className="cdp-header__eyebrow">
                            <Calendar size={12} /> Daily Attendance Register
                        </div>
                        <h1 className="cdp-header__title">{cohortData?.name || 'Cohort Register'}</h1>
                        <p className="cdp-header__sub">
                            {new Date(registerDate).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </p>
                    </div>

                    <div className="cdp-header__right">
                        <div className="cdp-header__actions">
                            {isLocked ? (
                                <button
                                    className="cdp-btn"
                                    onClick={() => setIsLocked(false)}
                                    style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#fcd34d', border: '1px solid #f59e0b' }}
                                >
                                    <Edit3 size={14} /> Unlock to Edit
                                </button>
                            ) : (
                                <button
                                    className="cdp-btn cdp-btn--primary"
                                    onClick={handleSaveUpdates}
                                    disabled={isSaving}
                                    style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)' }}
                                >
                                    {isSaving ? "Saving..." : <><Save size={14} /> Lock & Save Updates</>}
                                </button>
                            )}
                        </div>
                    </div>
                </header>

                <div className="cdp-content">

                    {/* ─── TOOLBAR, SEARCH & FILTERS ─── */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                            {/* Search Box */}
                            <div className="mlab-search" style={{ background: 'white', border: '1px solid var(--mlab-border)', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '250px' }}>
                                <Search size={16} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by name or ID..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>

                            {/* NEW: Status Dropdown Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'white', border: '1px solid var(--mlab-border)', padding: '6px 12px', borderRadius: '8px' }}>
                                <Filter size={16} color="var(--mlab-grey)" />
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value as any)}
                                    style={{
                                        border: 'none', outline: 'none', background: 'transparent',
                                        fontSize: '0.85rem', color: 'var(--mlab-blue)', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    <option value="all">All Statuses</option>
                                    <option value="present">Present Only</option>
                                    <option value="absent">Absent Only</option>
                                </select>
                            </div>
                        </div>

                        {isLocked && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '6px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                                <Lock size={14} /> Register is currently locked
                            </div>
                        )}
                    </div>

                    {/* ─── TABLE ─── */}
                    <div className="cdp-panel animate-fade-in" style={{ opacity: isLocked ? 0.75 : 1, transition: 'opacity 0.3s ease' }}>
                        <div className="vp-card" style={{ marginBottom: 0, border: 'none' }}>
                            <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: 'var(--mlab-bg)' }}>
                                <div className="vp-card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={16} color="var(--mlab-blue)" />
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                                        Enrolled Learners ({filteredLearners.length})
                                    </h3>
                                </div>
                            </div>

                            <div className="mlab-table-wrap">
                                <table className="mlab-table">
                                    <thead>
                                        <tr>
                                            <th>Learner Identity</th>
                                            <th>ID Number</th>
                                            <th>Current Status</th>
                                            <th>Evidence / Note</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredLearners.length > 0 ? filteredLearners.map(learner => (
                                            <tr key={learner.idNumber} style={{ borderLeft: learner.isPresent ? '4px solid var(--mlab-green)' : '4px solid var(--mlab-red)' }}>

                                                {/* Learner Info */}
                                                <td>
                                                    <div className="cdp-learner-cell">
                                                        <div className="cdp-learner-avatar" style={{ background: learner.isPresent ? 'var(--mlab-light-blue)' : '#fee2e2', color: learner.isPresent ? 'var(--mlab-blue)' : '#991b1b' }}>
                                                            {learner.fullName.charAt(0)}
                                                        </div>
                                                        <div className="cdp-learner-cell__info">
                                                            <span className="cdp-learner-cell__name">{learner.fullName}</span>
                                                            <span className="cdp-learner-cell__id" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Enrolled Student</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* ID Number */}
                                                <td>
                                                    <span style={{ fontFamily: 'monospace', color: 'var(--mlab-blue)', fontWeight: 600, letterSpacing: '0.05em' }}>
                                                        {learner.idNumber}
                                                    </span>
                                                </td>

                                                {/* Status Badge */}
                                                <td>
                                                    <span className={`cdp-status-badge ${learner.isPresent ? 'cdp-status-badge--active' : 'cdp-status-badge--dropped'}`}>
                                                        {learner.isPresent ? 'Present' : 'Absent'}
                                                    </span>
                                                </td>

                                                {/* Evidence / Reason */}
                                                <td style={{ maxWidth: '300px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontStyle: 'italic', lineHeight: 1.4 }}>
                                                            "{learner.reason || 'No specific reason provided'}"
                                                        </span>

                                                        {learner.proof && (
                                                            <a
                                                                href={learner.proof.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 'bold', textDecoration: 'none', background: '#eff6ff', padding: '4px 8px', borderRadius: '4px', alignSelf: 'flex-start', border: '1px solid #bfdbfe' }}
                                                            >
                                                                <DownloadCloud size={12} /> View Attached Proof
                                                            </a>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        disabled={isLocked}
                                                        className={`cdp-btn ${learner.isPresent ? 'cdp-btn--danger' : 'cdp-btn--sky'}`}
                                                        onClick={() => handleToggle(learner.idNumber)}
                                                        style={{
                                                            cursor: isLocked ? 'not-allowed' : 'pointer',
                                                            opacity: isLocked ? 0.4 : 1
                                                        }}
                                                    >
                                                        {learner.isPresent ? 'Mark Absent' : 'Mark Present'}
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr>
                                                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
                                                    No learners match your search criteria.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                </div>
            </main>
        </div>
    );
};
