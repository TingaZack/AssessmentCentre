// src/pages/FacilitatorDashboard/AttendancePage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import {
    doc, getDoc, getDocs, collection, query, where,
    updateDoc, arrayRemove, arrayUnion, setDoc
} from 'firebase/firestore';
import {
    ChevronLeft, Save, Edit3, Search,
    DownloadCloud, Calendar, Users, Filter,
    Lock, Clock, ShieldAlert, Activity, ShieldCheck, Target, BarChart2, FilterX, MapPin, ChevronRight, Globe
} from 'lucide-react';
import { db } from '../../lib/firebase';
import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
import Loader from '../../components/common/Loader/Loader';

export const AttendancePage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    // 🚀 STRICT DATE NORMALIZATION 
    const rawUrlDate = new URLSearchParams(location.search).get('date') || new Date().toISOString();
    const registerDate = rawUrlDate.split('T')[0];

    // ─── DATA STATES ───
    const [attendanceList, setAttendanceList] = useState<any[]>([]);
    const [cohortData, setCohortData] = useState<any>(null);
    const [recordId, setRecordId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [attendanceMode, setAttendanceMode] = useState<'qcto' | 'bootcamp'>('qcto');
    const [masterLog, setMasterLog] = useState<any | null>(null);

    // 🚀 STRICT BOOLEAN CHECK FOR CONDITIONAL UI
    const isEcosystemEvent = Boolean(masterLog?.isEcosystem) === true;

    // ─── UI CONTROLS ───
    const [isLocked, setIsLocked] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // ─── PAGINATION STATE ───
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 50;

    // ─── URL-BOUND FILTER STATES ───
    const urlSearchTerm = searchParams.get('search') || '';
    const statusFilter = (searchParams.get('status') as 'all' | 'present' | 'partial' | 'absent') || 'all';
    const complianceFilter = (searchParams.get('compliance') as 'all' | 'high' | 'mid' | 'low' | 'zero') || 'all';
    const overrideFilter = (searchParams.get('override') as 'all' | 'system' | 'overridden') || 'all';
    const locationFilter = searchParams.get('location') || 'all';

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
    }, [urlSearchTerm, statusFilter, complianceFilter, overrideFilter, locationFilter]);

    const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const newParams = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null || value === '' || value === 'all') {
                    newParams.delete(key);
                } else {
                    newParams.set(key, String(value));
                }
            });
            if (rawUrlDate) {
                newParams.set('date', rawUrlDate);
            }
            return newParams;
        }, { replace: true });
    }, [setSearchParams, rawUrlDate]);

    const handleClearFilters = () => {
        setLocalSearchTerm('');
        setSearchParams(new URLSearchParams({ date: rawUrlDate }), { replace: true });
    };

    const hasActiveFilters = Boolean(urlSearchTerm || statusFilter !== 'all' || complianceFilter !== 'all' || overrideFilter !== 'all' || locationFilter !== 'all');

    useEffect(() => {
        const getAttendance = async () => {
            try {
                setMasterLog(null); // Reset log state on load

                const targetCohortId = cohortId || "vc2Q2VxJHMnWBhgcIITg";

                const searchDates = Array.from(new Set([
                    registerDate,
                    `${registerDate}T00:00:00.000Z`,
                    rawUrlDate
                ]));

                console.group("🔍 ATTENDANCE ENGINE DEBUG LOG");
                console.log("1. Cohort ID:", targetCohortId);
                console.log("2. Searching for Dates:", searchDates);

                // 1. Fetch Cohort Basics
                const cohortSnap = await getDoc(doc(db, "cohorts", targetCohortId));
                let cohortLearnerIds: string[] = [];
                if (cohortSnap.exists()) {
                    setCohortData(cohortSnap.data());
                    cohortLearnerIds = cohortSnap.data().learnerIds || [];
                }

                // 2. Fetch Enrollments
                const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('cohortId', '==', targetCohortId)));
                const enrolledLearnerIds = enrollmentsSnap.docs.map(d => d.data().learnerId);
                const combinedIds = [...new Set([...cohortLearnerIds, ...enrolledLearnerIds])];

                const allLearnersSnap = await getDocs(collection(db, "learners"));
                const allLearners = allLearnersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const enrolledProfiles = allLearners.filter(l =>
                    l.cohortId === targetCohortId ||
                    combinedIds.includes(l.id) ||
                    combinedIds.includes(l.idNumber)
                );

                console.log("3. Enrolled Learners Found:", enrolledProfiles.length);

                // 3. 🚀 STRICT LOG FETCHING (Prioritizes Exact Matches to prevent Overwriting!)
                const logQuery = query(collection(db, 'attendance_logs'), where('cohortId', '==', targetCohortId));
                const logQuerySnap = await getDocs(logQuery);

                let exactMatch: any = null;
                let partialMatch: any = null;

                logQuerySnap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    const cleanSessionDate = data.sessionDate ? data.sessionDate.split('T')[0] : '';

                    if (data.sessionDate === rawUrlDate) {
                        exactMatch = data;
                    } else if (searchDates.includes(data.sessionDate) || searchDates.includes(cleanSessionDate)) {
                        partialMatch = data;
                    }
                });

                // Always trust the exact match first
                const logData = exactMatch || partialMatch;

                console.log("4. Master Log Selected:", logData);
                console.log("Is Ecosystem Event?", Boolean(logData?.isEcosystem));

                const isBootcamp = !!logData;
                setAttendanceMode(isBootcamp ? 'bootcamp' : 'qcto');

                if (isBootcamp) {
                    setMasterLog(logData);
                }

                let roster: any[] = [];

                if (isBootcamp) {
                    const expectedDuration = logData.expectedDuration || 120;
                    const rawZoomData: any[] = logData.rawZoomData || [];

                    // INDEX-SAFE RECORDS FETCHING
                    const recordsQuery = query(collection(db, 'attendance_records'), where('cohortId', '==', targetCohortId));
                    const recordsSnap = await getDocs(recordsQuery);
                    const recordsMap = new Map();

                    recordsSnap.docs.forEach(d => {
                        const data = d.data();
                        const cleanRecDate = data.sessionDate ? data.sessionDate.split('T')[0] : '';

                        if (searchDates.includes(data.sessionDate) || searchDates.includes(cleanRecDate)) {
                            recordsMap.set(data.learnerId, { id: d.id, ...data });
                        }
                    });

                    console.log("5. Database Records matched to Date:", recordsMap.size);

                    roster = enrolledProfiles.map(learner => {
                        const learnerEmail = String(learner.email || '').toLowerCase().trim();
                        const learnerName = String(learner.fullName || '').toLowerCase().trim();

                        const zoomMatch = rawZoomData.find(z =>
                            (learnerEmail && String(z.email).toLowerCase().trim() === learnerEmail) ||
                            String(z.name).toLowerCase().trim() === learnerName
                        );

                        const rec = recordsMap.get(learner.id) || recordsMap.get(learner.idNumber);

                        let actualDuration = 0;
                        let finalStatus: 'Present' | 'Partial' | 'Absent' = 'Absent';

                        if (rec) {
                            actualDuration = rec.actualDuration || 0;
                            finalStatus = rec.status || 'Absent';
                        } else if (zoomMatch) {
                            actualDuration = zoomMatch.duration;
                            const pct = expectedDuration > 0 ? Math.round((actualDuration / expectedDuration) * 100) : 0;
                            if (pct >= 80) finalStatus = 'Present';
                            else if (pct > 20) finalStatus = 'Partial';
                        }

                        if (rec?.overridden) {
                            finalStatus = rec.status;
                        }

                        const compliancePct = expectedDuration > 0 ? Math.round((actualDuration / expectedDuration) * 100) : 0;

                        return {
                            ...learner,
                            recordDocId: rec?.id || `${targetCohortId}_${registerDate}_${learner.id}`,
                            isPresent: finalStatus === 'Present' || finalStatus === 'Partial',
                            status: finalStatus,
                            actualDuration: actualDuration,
                            expectedDuration: expectedDuration,
                            compliancePct: compliancePct,
                            overridden: rec?.overridden || false
                        };
                    });

                } else {
                    // QCTO Fallback Logic
                    const attQuery = query(collection(db, "attendance"), where("cohortId", "==", targetCohortId));
                    const attSnaps = await getDocs(attQuery);
                    let qctoData: any = { presentLearners: [], absentLearners: [], reasons: {}, proofs: {} };

                    attSnaps.docs.forEach(d => {
                        const data = d.data();
                        const cleanDate = data.date ? data.date.split('T')[0] : '';
                        if (searchDates.includes(data.date) || searchDates.includes(cleanDate)) {
                            setRecordId(d.id);
                            qctoData = data;
                        }
                    });

                    roster = enrolledProfiles.map(learner => {
                        const id = learner.idNumber;
                        const isPresent = qctoData.presentLearners?.includes(id) || false;
                        return {
                            ...learner,
                            isPresent: isPresent,
                            status: isPresent ? 'Present' : 'Absent',
                            reason: qctoData.reasons?.[id] || '',
                            proof: qctoData.proofs?.[id] || null
                        };
                    });
                }

                console.log("6. Roster Processing Complete. Length:", roster.length);
                console.groupEnd();

                roster.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
                setAttendanceList(roster);
                setLoading(false);

            } catch (error) {
                console.error("Fetch error:", error);
                setLoading(false);
            }
        };

        getAttendance();
    }, [cohortId, registerDate, rawUrlDate]);

    // 🚀 DYNAMIC STATS COMPONENT COUNTER
    const summaryStats = useMemo(() => {
        let present = 0;
        let partial = 0;
        let absent = 0;
        let totalCohortHours = 0;

        let maleCount = 0;
        let femaleCount = 0;

        attendanceList.forEach(l => {
            if (l.status === 'Present') present++;
            else if (l.status === 'Partial') partial++;
            else absent++;

            if (l.actualDuration) totalCohortHours += (l.actualDuration / 60);

            const rawGender = String(l.demographics?.genderCode || (l.demographics as any)?.gender || l.gender || '').trim().toLowerCase();
            const isMale = rawGender === 'm' || (rawGender.includes('male') && rawGender !== 'female');
            const isFemale = rawGender === 'f' || rawGender.includes('female');

            if (isMale) maleCount++;
            if (isFemale) femaleCount++;
        });

        const totalEnrolled = attendanceList.length;
        const averageEngagement = totalEnrolled > 0
            ? Math.round((attendanceList.reduce((acc, curr) => acc + (curr.compliancePct || 0), 0) / totalEnrolled))
            : 0;

        const femalePct = totalEnrolled > 0 ? Math.round((femaleCount / totalEnrolled) * 100) : 0;
        const malePct = totalEnrolled > 0 ? Math.round((maleCount / totalEnrolled) * 100) : 0;

        return { present, partial, absent, totalEnrolled, averageEngagement, femaleCount, maleCount, femalePct, malePct };
    }, [attendanceList]);

    // 🚀 DYNAMIC LOCATION EXTRACTOR
    const uniqueLocations = useMemo(() => {
        const locations = new Set<string>();
        attendanceList.forEach(l => {
            const loc = l.demographics?.province || l.demographics?.municipality || l.demographics?.city || l.province || l.city || 'Not specified';
            locations.add(loc);
        });
        return Array.from(locations).sort();
    }, [attendanceList]);

    // 🚀 DYNAMIC TOGGLE HANDLER
    const handleToggle = async (learner: any) => {
        if (isLocked) return;

        if (attendanceMode === 'bootcamp') {
            const newStatus = learner.status === 'Present' || learner.status === 'Partial' ? 'Absent' : 'Present';
            const attRef = doc(db, "attendance_records", learner.recordDocId);

            try {
                await setDoc(attRef, {
                    status: newStatus,
                    overridden: true,
                    cohortId: cohortId || "vc2Q2VxJHMnWBhgcIITg",
                    learnerId: learner.id,
                    sessionDate: registerDate,
                    updatedAt: new Date().toISOString()
                }, { merge: true });

                setAttendanceList(prev => prev.map(l => {
                    if (l.id === learner.id || l.idNumber === learner.idNumber) {
                        return { ...l, isPresent: newStatus === 'Present', status: newStatus, overridden: true };
                    }
                    return l;
                }));
            } catch (error) {
                console.error("Firebase update failed:", error);
                alert("Failed to update status on server.");
            }
        } else {
            if (!recordId) {
                alert("No QCTO register found for this date. Please ensure it was finalized from the dashboard.");
                return;
            }

            const idNumber = learner.idNumber;
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
                        return { ...l, isPresent: !currentlyPresent, status: !currentlyPresent ? 'Present' : 'Absent' };
                    }
                    return l;
                }));

            } catch (error) {
                console.error("Firebase update failed:", error);
                alert("Failed to update status on server.");
            }
        }
    };

    const handleSaveUpdates = async () => {
        setIsSaving(true);
        setTimeout(() => {
            setIsLocked(true);
            setIsSaving(false);
        }, 600);
    };

    const filteredLearners = useMemo(() => {
        return attendanceList.filter(l => {
            const locationStr = String(l.demographics?.province || l.demographics?.municipality || l.demographics?.city || l.province || l.city || 'Not specified');

            const matchesSearch = String(l.fullName || '').toLowerCase().includes(urlSearchTerm.toLowerCase()) ||
                String(l.idNumber || '').includes(urlSearchTerm) ||
                locationStr.toLowerCase().includes(urlSearchTerm.toLowerCase());

            let matchesStatus = true;
            if (statusFilter !== 'all') {
                matchesStatus = String(l.status).toLowerCase() === statusFilter;
            }

            let matchesLocation = true;
            if (locationFilter !== 'all') {
                matchesLocation = locationStr === locationFilter;
            }

            let matchesCompliance = true;
            if (attendanceMode === 'bootcamp' && complianceFilter !== 'all') {
                if (complianceFilter === 'high') matchesCompliance = l.compliancePct >= 80;
                else if (complianceFilter === 'mid') matchesCompliance = l.compliancePct >= 50 && l.compliancePct < 80;
                else if (complianceFilter === 'low') matchesCompliance = l.compliancePct > 0 && l.compliancePct < 50;
                else if (complianceFilter === 'zero') matchesCompliance = l.compliancePct === 0;
            }

            let matchesOverride = true;
            if (attendanceMode === 'bootcamp' && overrideFilter !== 'all') {
                if (overrideFilter === 'overridden') matchesOverride = l.overridden === true;
                else if (overrideFilter === 'system') matchesOverride = l.overridden === false;
            }

            return matchesSearch && matchesStatus && matchesCompliance && matchesOverride && matchesLocation;
        });
    }, [attendanceList, urlSearchTerm, statusFilter, complianceFilter, overrideFilter, locationFilter, attendanceMode]);

    // 🚀 CALCULATE PAGINATION
    const totalPages = Math.ceil(filteredLearners.length / ITEMS_PER_PAGE);
    const paginatedLearners = filteredLearners.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    if (loading) {
        return (
            <div className="cdp-layout">
                <main className="cdp-main cdp-main--centered">
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
                            <Calendar size={12} /> {attendanceMode === 'bootcamp' ? 'Bootcamp Analytics Register' : 'Daily Attendance Register'}
                        </div>

                        {/* 🚀 ECOSYSTEM BADGE */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h1 className="cdp-header__title">{masterLog?.sessionTitle || cohortData?.name || 'Cohort Register'}</h1>
                            {isEcosystemEvent && (
                                <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <Globe size={12} /> ECOSYSTEM EVENT
                                </span>
                            )}
                        </div>

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

                    {/* ─── METRICS SUMMARIES PANELS ROW ─── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-blue)' }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Total Enrolled</p>
                            <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.5rem' }}>{summaryStats.totalEnrolled} <span style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--mlab-grey)' }}>Students</span></h3>
                        </div>

                        {/* 🚀 DEMOGRAPHICS CARD */}
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid #ec4899' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Demographics
                                    </p>
                                    <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-midnight)', fontSize: '1.4rem', fontWeight: 800, display: 'flex', gap: '6px', alignItems: 'baseline' }}>
                                        <span style={{ color: '#ec4899' }}>👩 {summaryStats.femalePct}%</span>
                                        <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 400 }}>|</span>
                                        <span style={{ color: '#0284c7' }}>👨 {summaryStats.malePct}%</span>
                                    </h3>
                                </div>
                            </div>
                            <div style={{ width: '100%', background: '#0284c7', height: '6px', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
                                <div style={{ width: `${summaryStats.femalePct}%`, background: '#ec4899', height: '100%' }} />
                                <div style={{ width: `${summaryStats.malePct}%`, background: '#0284c7', height: '100%' }} />
                            </div>
                            <p style={{ margin: '8px 0 0', fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>
                                {summaryStats.femaleCount} Females <span style={{ color: '#cbd5e1' }}>•</span> {summaryStats.maleCount} Males
                            </p>
                        </div>

                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-green)' }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Present (Full Session)</p>
                            <h3 style={{ margin: '4px 0 0', color: 'var(--mlab-green-dark)', fontSize: '1.5rem' }}>{summaryStats.present}</h3>
                        </div>
                        {attendanceMode === 'bootcamp' && (
                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid #f59e0b' }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Partial Engagement</p>
                                <h3 style={{ margin: '4px 0 0', color: '#b45309', fontSize: '1.5rem' }}>{summaryStats.partial}</h3>
                            </div>
                        )}
                        <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid var(--mlab-red)' }}>
                            <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Absent / Unlogged</p>
                            <h3 style={{ margin: '4px 0 0', color: '#b91c1c', fontSize: '1.5rem' }}>{summaryStats.absent}</h3>
                        </div>
                        {attendanceMode === 'bootcamp' && (
                            <div style={{ background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '8px', borderLeft: '4px solid #8b5cf6' }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase' }}>Avg Engagement Rate</p>
                                <h3 style={{ margin: '4px 0 0', color: '#6d28d9', fontSize: '1.5rem' }}>{summaryStats.averageEngagement}%</h3>
                            </div>
                        )}
                    </div>

                    {/* ─── TOOLBAR, SEARCH & FILTERS ─── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'white', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div className="mlab-search" style={{ border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '300px', flex: 1 }}>
                                <Search size={16} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by applicant name, ID, or location..."
                                    value={localSearchTerm}
                                    onChange={(e) => setLocalSearchTerm(e.target.value)}
                                    style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {hasActiveFilters && (
                                    <button
                                        onClick={handleClearFilters}
                                        className="mlab-btn mlab-btn--sm animate-fade-in"
                                        style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
                                    >
                                        <FilterX size={14} /> Clear Filters
                                    </button>
                                )}

                                {isLocked && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <Lock size={14} /> Register is currently locked
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                            {/* Standard Status Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Filter size={14} color="var(--mlab-grey)" />
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Daily Status:</label>
                                <select value={statusFilter} onChange={(e) => updateUrlParams({ status: e.target.value })} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
                                    <option value="all">All Statuses</option>
                                    <option value="present">Present (Full Time)</option>
                                    {attendanceMode === 'bootcamp' && <option value="partial">Partial (Short Hours)</option>}
                                    <option value="absent">Absent</option>
                                </select>
                            </div>

                            {/* Conditional Location Filter */}
                            {isEcosystemEvent && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Location:</label>
                                    <select
                                        value={locationFilter}
                                        onChange={(e) => updateUrlParams({ location: e.target.value })}
                                        style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
                                    >
                                        <option value="all">All Locations</option>
                                        {uniqueLocations.map(loc => (
                                            <option key={loc} value={loc}>{loc}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Bootcamp Specific Deep Filters */}
                            {attendanceMode === 'bootcamp' && (
                                <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={12} /> Compliance:</label>
                                        <select value={complianceFilter} onChange={(e) => updateUrlParams({ compliance: e.target.value })} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
                                            <option value="all">All Performance Bands</option>
                                            <option value="high">High Compliance (80%+)</option>
                                            <option value="mid">Moderate Risk (50% - 79%)</option>
                                            <option value="low">Critical Risk (1% - 49%)</option>
                                            <option value="zero">Zero Engagement (0%)</option>
                                        </select>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Record Integrity:</label>
                                        <select value={overrideFilter} onChange={(e) => updateUrlParams({ override: e.target.value })} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
                                            <option value="all">All Records</option>
                                            <option value="system">System Calculated (Zoom)</option>
                                            <option value="overridden">Manually Overridden</option>
                                        </select>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* ─── TABLE ─── */}
                    <div className="cdp-panel animate-fade-in" style={{ opacity: isLocked ? 0.75 : 1, transition: 'opacity 0.3s ease' }}>
                        <div className="vp-card" style={{ marginBottom: 0, border: 'none', minHeight: '650px', display: 'flex', flexDirection: 'column' }}>
                            <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: 'var(--mlab-bg)' }}>
                                <div className="vp-card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={16} color="var(--mlab-blue)" />
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontSize: '0.9rem' }}>
                                        Showing {filteredLearners.length} Records
                                    </h3>
                                </div>
                            </div>

                            <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                <table className="mlab-table" style={{ tableLayout: 'fixed' }}>
                                    <colgroup>
                                        <col style={{ width: '25%' }} />
                                        {isEcosystemEvent && <col style={{ width: '15%' }} />}
                                        <col style={{ width: '15%' }} />
                                        <col style={{ width: '10%' }} />
                                        <col style={{ width: '25%' }} />
                                        <col style={{ width: '10%' }} />
                                    </colgroup>
                                    <thead>
                                        <tr>
                                            <th>Learner Identity</th>
                                            {isEcosystemEvent && <th>Location</th>}
                                            <th>ID Number</th>
                                            <th>Current Status</th>
                                            <th>{attendanceMode === 'bootcamp' ? 'Duration & Compliance' : 'Evidence / Note'}</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedLearners.length > 0 ? paginatedLearners.map(learner => {
                                            const locationStr = String(learner.demographics?.province || learner.demographics?.municipality || learner.demographics?.city || learner.province || learner.city || 'Not specified');

                                            return (
                                                <tr key={learner.idNumber || learner.id} className="animate-fade-in" style={{ borderLeft: learner.status === 'Partial' ? '4px solid #f59e0b' : learner.isPresent ? '4px solid var(--mlab-green)' : '4px solid var(--mlab-red)', transition: 'all 0.3s ease' }}>

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

                                                    {/* Location Column (Conditional) */}
                                                    {isEcosystemEvent && (
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
                                                                <MapPin size={12} /> {locationStr}
                                                            </div>
                                                        </td>
                                                    )}

                                                    {/* ID Number */}
                                                    <td>
                                                        <span style={{ fontFamily: 'monospace', color: 'var(--mlab-blue)', fontWeight: 600, letterSpacing: '0.05em' }}>
                                                            {learner.idNumber || 'N/A'}
                                                        </span>
                                                    </td>

                                                    {/* Status Badge */}
                                                    <td>
                                                        <span
                                                            className={`cdp-status-badge ${learner.status === 'Present' ? 'cdp-status-badge--active' : 'cdp-status-badge--dropped'}`}
                                                            style={learner.status === 'Partial' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : {}}
                                                        >
                                                            {learner.status}
                                                        </span>
                                                    </td>

                                                    {/* Unified Evidence / Duration Column */}
                                                    <td style={{ maxWidth: '300px' }}>
                                                        {attendanceMode === 'bootcamp' ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

                                                                {/* 🚀 CONDITIONAL UI FOR ECOSYSTEM EVENT VS ZOOM EVENT */}
                                                                {isEcosystemEvent ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                                                        <Globe size={14} color="var(--mlab-grey)" />
                                                                        <strong>Full-Day Ecosystem Event</strong>
                                                                    </div>
                                                                ) : (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
                                                                        <Clock size={14} color="var(--mlab-grey)" />
                                                                        <strong>{learner.actualDuration} mins</strong>
                                                                        <span style={{ color: 'var(--mlab-grey)' }}>/ {learner.expectedDuration} mins expected</span>
                                                                    </div>
                                                                )}

                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                    {isEcosystemEvent ? (
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700,
                                                                            background: learner.isPresent ? '#dcfce7' : '#fee2e2',
                                                                            color: learner.isPresent ? '#166534' : '#991b1b',
                                                                            borderRadius: '4px'
                                                                        }}>
                                                                            {learner.isPresent ? '100% Attended' : '0% Attended'}
                                                                        </span>
                                                                    ) : (
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700,
                                                                            background: learner.compliancePct >= 80 ? '#dcfce7' : learner.compliancePct >= 50 ? '#fef3c7' : '#fee2e2',
                                                                            color: learner.compliancePct >= 80 ? '#166534' : learner.compliancePct >= 50 ? '#b45309' : '#991b1b',
                                                                            borderRadius: '4px'
                                                                        }}>
                                                                            {learner.compliancePct}% Compliance
                                                                        </span>
                                                                    )}

                                                                    {learner.overridden && (
                                                                        <span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <ShieldAlert size={10} /> Manual Override
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
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
                                                        )}
                                                    </td>

                                                    {/* Actions */}
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            disabled={isLocked}
                                                            className={`cdp-btn ${learner.isPresent ? 'cdp-btn--danger' : 'cdp-btn--sky'}`}
                                                            onClick={() => handleToggle(learner)}
                                                            style={{
                                                                cursor: isLocked ? 'not-allowed' : 'pointer',
                                                                opacity: isLocked ? 0.4 : 1
                                                            }}
                                                        >
                                                            {learner.isPresent ? 'Mark Absent' : 'Mark Present'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        }) : (
                                            <tr>
                                                <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
                                                    <Filter size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
                                                    <p style={{ margin: 0, fontWeight: 500 }}>No learners match your current filter settings.</p>
                                                </td>
                                            </tr>
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
                                        Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredLearners.length)}</strong> of <strong>{filteredLearners.length}</strong> records
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

                </div>
            </main>
        </div>
    );
};