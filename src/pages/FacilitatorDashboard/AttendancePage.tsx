// src/pages/FacilitatorDashboard/AttendancePage.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
    doc, getDoc, getDocs, collection, query, where,
    updateDoc, arrayRemove, arrayUnion, setDoc
} from 'firebase/firestore';
import {
    ChevronLeft, Save, Edit3, Search,
    DownloadCloud, Calendar, Users, Filter,
    Lock, Clock, ShieldAlert, Activity, ShieldCheck, Target,
    FilterX, MapPin, ChevronRight, Globe, UserMinus,
    DollarSign, Calculator, Loader2, X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
import Loader from '../../components/common/Loader/Loader';
import { useToast } from '../../components/common/Toast/Toast';
import { StipendExportModal } from '../../components/common/StipendExportModal/StipendExportModal';



// ─── ATTENDANCE RING CARD COMPONENT ─────────────────────────────────────────

export interface AttendanceRingCardProps {
    title: string;
    typeLabel: string;
    mainValue: number | string;
    totalValue: number | string;
    pct: number;
    theme: 'k' | 'p' | 'w' | 'r';
    icon: React.ReactNode;
    bar1Label: string;
    bar1Val: string;
    bar1Pct: number;
    bar2Label: string;
    bar2Val: string;
    bar2Pct: number;
    statusText: string;
}

export const AttendanceRingCard: React.FC<AttendanceRingCardProps> = ({
    title, typeLabel, mainValue, totalValue, pct, theme, icon, bar1Label, bar1Val, bar1Pct, bar2Label, bar2Val, bar2Pct, statusText
}) => {
    const [animatedPct, setAnimatedPct] = useState(0);

    useEffect(() => {
        const t = setTimeout(() => setAnimatedPct(pct), 150);
        return () => clearTimeout(t);
    }, [pct]);

    const C = 282.6; // Circumference for r=45
    const offset = C - (C * animatedPct / 100);

    const config = {
        k: { cls: 'mc-k', fillId: 'rK' }, // Amber
        p: { cls: 'mc-p', fillId: 'rP' }, // Blue
        w: { cls: 'mc-w', fillId: 'rW' }, // Green
        r: { cls: 'mc-r', fillId: 'rR' }  // Red
    };

    const { cls, fillId } = config[theme];

    return (
        <div className={`mc ${cls}`} style={{ flex: 1, minWidth: '260px', borderTop: '5px solid #073f4e' }}>
            <div className="mc-orb"></div>
            <div className="mc-hdr">
                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div className="mc-icon">{icon}</div>
                    <div>
                        <div className="mc-label">{typeLabel}</div>
                        <div className="mc-title">{title}</div>
                    </div>
                </div>
                <div className="mc-pct">{animatedPct}%</div>
            </div>

            <div className="mc-ring-wrap">
                <svg className="mc-ring-svg" width="110" height="110" viewBox="0 0 100 100">
                    <circle className="mc-ring-track" cx="50" cy="50" r="45" />
                    <circle className="mc-ring-fill" id={fillId} cx="50" cy="50" r="45" style={{ strokeDashoffset: offset }} />
                </svg>
                <div className="mc-ring-center">
                    <div className="mc-ring-num">{mainValue}</div>
                    <div className="mc-ring-denom">{totalValue}</div>
                </div>
            </div>

            <div className="mc-bars">
                <div className="mc-bar-item">
                    <div className="mc-bar-meta"><span className="mc-bar-lbl">{bar1Label}</span><span className="mc-bar-val">{bar1Val}</span></div>
                    <div className="mc-track"><div className="mc-fill mc-fill-primary mc-fill-shimmer" style={{ width: `${bar1Pct}%` }}></div></div>
                </div>
                <div className="mc-bar-item">
                    <div className="mc-bar-meta"><span className="mc-bar-lbl">{bar2Label}</span><span className="mc-bar-val">{bar2Val}</span></div>
                    <div className="mc-track"><div className="mc-fill mc-fill-secondary" style={{ width: `${bar2Pct}%` }}></div></div>
                </div>
            </div>

            <div className="mc-footer">
                <span className="mc-total"><strong>{mainValue}</strong> of {totalValue}</span>
                <span className="mc-status">
                    <span className="mc-dot"></span>{statusText}
                </span>
            </div>
        </div>
    );
};

export const AttendancePage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const toast = useToast();

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

    const isEcosystemEvent = Boolean(masterLog?.isEcosystem) === true;

    // ─── UI CONTROLS ───
    const [isLocked, setIsLocked] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isStipendModalOpen, setIsStipendModalOpen] = useState(false);

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

                // 2. Fetch Enrollments & Map Enrollment Status
                const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('cohortId', '==', targetCohortId)));
                const enrollmentMap = new Map<string, any>();
                const enrolledLearnerIds: string[] = [];

                enrollmentsSnap.docs.forEach(d => {
                    const data = d.data();
                    const lId = data.learnerId;
                    if (lId) {
                        enrollmentMap.set(lId, data);
                        enrolledLearnerIds.push(lId);
                    }
                });

                const combinedIds = [...new Set([...cohortLearnerIds, ...enrolledLearnerIds])];

                const allLearnersSnap = await getDocs(collection(db, "learners"));
                const allLearners = allLearnersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

                // 🚀 FIXED: Check BOTH base learner status AND cohort enrollment status to filter out dropped learners
                const enrolledProfiles = allLearners.filter(l => {
                    const isLinkedToCohort = l.cohortId === targetCohortId || combinedIds.includes(l.id) || combinedIds.includes(l.idNumber);
                    const enrol = enrollmentMap.get(l.id) || enrollmentMap.get(l.idNumber) || (l.learnerId ? enrollmentMap.get(l.learnerId) : null);

                    const isDropped = l.status === 'dropped' || enrol?.status === 'dropped';

                    return isLinkedToCohort && !isDropped;
                });

                console.log("3. Active Enrolled Learners Found:", enrolledProfiles.length);

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

            <StipendExportModal
                isOpen={isStipendModalOpen}
                onClose={() => setIsStipendModalOpen(false)}
                cohortId={cohortId || ''}
                cohortName={cohortData?.name || 'Cohort'}
                learners={attendanceList}
                attendanceMode={attendanceMode}
            />

            {/* ─── NEW STYLES & SVG GRADIENTS FOR RING CARDS ─── */}
            <style>{`
                .mc-cards-wrapper { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 2rem; }
                .mc { background: white; border: 1px solid var(--mlab-border); padding: 22px 20px 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 18px; transition: transform .22s ease, box-shadow .22s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,.06); }
                .mc-orb { position: absolute; top: -50px; right: -50px; width: 130px; height: 130px; border-radius: 50%; opacity: .15; filter: blur(28px); pointer-events: none; }
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; }
                .mc-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
                .mc-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: .2em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-size: 14px; font-weight: 700; color: var(--mlab-midnight); letter-spacing: -0.2px; line-height: 1.2; }
                .mc-pct { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; flex-shrink: 0; margin-top: 1px; color: var(--mlab-midnight); }
                .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 6px 0; }
                .mc-ring-svg { transform: rotate(-90deg); }
                .mc-ring-track { fill: none; stroke: #f1f5f9; stroke-width: 8px; }
                .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
                .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
                .mc-ring-num { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; color: var(--mlab-midnight); }
                .mc-ring-denom { font-size: 10px; font-weight: 500; color: var(--mlab-grey); }
                .mc-bars { display: flex; flex-direction: column; gap: 8px; }
                .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
                .mc-bar-lbl { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--mlab-grey); }
                .mc-bar-val { font-size: 10px; font-weight: 700; color: var(--mlab-midnight); }
                .mc-track { width: 100%; height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
                .mc-fill { height: 100%; border-radius: 3px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
                .mc-fill-shimmer { background-size: 200% 100%; animation: shimmer 2.4s linear infinite .8s; }
                .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--mlab-border); }
                .mc-total { font-size: 11px; font-weight: 500; color: var(--mlab-grey); }
                .mc-total strong { font-weight: 800; color: var(--mlab-midnight); }
                .mc-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 10px; font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
                @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.75); } }
                .mc-dot { width: 5px; height: 5px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }

                /* Light Mode Themes */
                .mc-k .mc-orb { background: #f59e0b; } .mc-k .mc-icon { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-pct { color: #d97706; } .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background-image: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); } .mc-k .mc-fill-secondary { background: #fef3c7; } .mc-k .mc-status { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-dot { background: #d97706; }
                .mc-p .mc-orb { background: #38bdf8; } .mc-p .mc-icon { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-pct { color: #0284c7; } .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background-image: linear-gradient(90deg,#7dd3fc,#0ea5e9,#7dd3fc); } .mc-p .mc-fill-secondary { background: #e0f2fe; } .mc-p .mc-status { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-dot { background: #0284c7; }
                .mc-w .mc-orb { background: var(--mlab-green); } .mc-w .mc-icon { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-pct { color: #65a30d; } .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background-image: linear-gradient(90deg,#bef264,#84cc16,#bef264); } .mc-w .mc-fill-secondary { background: #ecfccb; } .mc-w .mc-status { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-dot { background: #65a30d; }
                .mc-r .mc-orb { background: #ef4444; } .mc-r .mc-icon { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-pct { color: #b91c1c; } .mc-r .mc-ring-fill { stroke: url(#gR); } .mc-r .mc-fill-primary { background-image: linear-gradient(90deg,#fca5a5,#ef4444,#fca5a5); } .mc-r .mc-fill-secondary { background: #fee2e2; } .mc-r .mc-status { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-dot { background: #b91c1c; }
            `}</style>

            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#d97706" /></linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></linearGradient>
                    <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fca5a5" /><stop offset="100%" stopColor="#b91c1c" /></linearGradient>
                </defs>
            </svg>

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
                            {/* 🚀 NEW STIPEND EXPORT BUTTON */}
                            <button
                                className="cdp-btn cdp-btn--outline"
                                onClick={() => setIsStipendModalOpen(true)}
                                style={{ marginRight: '8px', border: '1px solid var(--mlab-border)' }}
                            >
                                <DownloadCloud size={14} /> Export Stipends
                            </button>

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

                    {/* ─── NEW BEAUTIFUL CARDS ─── */}
                    <div className="mc-cards-wrapper">

                        {/* 1. PRESENT CARD (GREEN) */}
                        <AttendanceRingCard
                            title="Active Attendance"
                            typeLabel="Cohort Health"
                            mainValue={summaryStats.present}
                            totalValue={`${summaryStats.totalEnrolled} Enrolled`}
                            pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
                            theme="w"
                            icon={<Users size={18} />}
                            bar1Label="Present"
                            bar1Val={`${summaryStats.present} full`}
                            bar1Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
                            bar2Label="Partial"
                            bar2Val={`${summaryStats.partial} partial`}
                            bar2Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.partial / summaryStats.totalEnrolled) * 100) : 0}
                            statusText="Tracked"
                        />

                        {/* 2. DEMOGRAPHICS/ENGAGEMENT CARD (BLUE) */}
                        <AttendanceRingCard
                            title={attendanceMode === 'bootcamp' ? 'Avg Engagement' : 'Demographics'}
                            typeLabel={attendanceMode === 'bootcamp' ? 'Session Quality' : 'Class Makeup'}
                            mainValue={attendanceMode === 'bootcamp' ? `${summaryStats.averageEngagement}%` : summaryStats.femaleCount}
                            totalValue={attendanceMode === 'bootcamp' ? 'Target: 80%' : `${summaryStats.totalEnrolled} Enrolled`}
                            pct={attendanceMode === 'bootcamp' ? summaryStats.averageEngagement : summaryStats.femalePct}
                            theme="p"
                            icon={attendanceMode === 'bootcamp' ? <Activity size={18} /> : <Target size={18} />}
                            bar1Label="Females"
                            bar1Val={`${summaryStats.femaleCount} (${summaryStats.femalePct}%)`}
                            bar1Pct={summaryStats.femalePct}
                            bar2Label="Males"
                            bar2Val={`${summaryStats.maleCount} (${summaryStats.malePct}%)`}
                            bar2Pct={summaryStats.malePct}
                            statusText="Active Metrics"
                        />
                        {/* 3. ABSENT CARD (RED) */}
                        <AttendanceRingCard
                            title="Absent / Unlogged"
                            typeLabel="At Risk"
                            mainValue={summaryStats.absent}
                            totalValue={`${summaryStats.totalEnrolled} Enrolled`}
                            pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.absent / summaryStats.totalEnrolled) * 100) : 0}
                            theme="r"
                            icon={<UserMinus size={18} />}
                            bar1Label="Absent"
                            bar1Val={`${summaryStats.absent} missed`}
                            bar1Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.absent / summaryStats.totalEnrolled) * 100) : 0}
                            bar2Label="Present"
                            bar2Val={`${summaryStats.present} logged`}
                            bar2Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
                            statusText="Needs Attention"
                        />
                    </div>

                    {/* ─── TOOLBAR, SEARCH & FILTERS ─── */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'white', padding: '1rem 1.5rem', border: '1px solid var(--mlab-border)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                            <div className="mlab-search" style={{
                                border: '1px solid #cbd5e1', padding: '8px 16px', display: 'flex',
                                alignItems: 'center', gap: '8px', minWidth: '300px', flex: 1, borderRadius: 0,
                            }}>
                                <Search size={16} color="var(--mlab-grey)" />
                                <input
                                    type="text"
                                    placeholder="Search by applicant name, ID, or location..."
                                    value={localSearchTerm}
                                    onChange={(e) => setLocalSearchTerm(e.target.value)}
                                    style={{ border: 'none', outline: 'none', width: '100%', borderRadius: 0, fontSize: '0.85rem' }}
                                />
                            </div>

                            {/* Standard Status Filter */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: 0 }}>
                                <Filter size={14} color="var(--mlab-grey)" />
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Daily Status:</label>
                                <select value={statusFilter} onChange={(e) => updateUrlParams({ status: e.target.value })}
                                    style={{
                                        padding: '6px 12px', background: 'transparent', 'borderRadius': 0,
                                        fontSize: '0.85rem', color: 'grey', border: '1px solid #cbd5e1', outline: 'none'
                                    }}>
                                    <option value="all">All Statuses</option>
                                    <option value="present">Present (Full Time)</option>
                                    {attendanceMode === 'bootcamp' && <option value="partial">Partial (Short Hours)</option>}
                                    <option value="absent">Absent</option>
                                </select>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '8px 16px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
                                        <Lock size={14} /> Register is currently locked
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>


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
                                    padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-blue)',
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


// // src/pages/FacilitatorDashboard/AttendancePage.tsx

// import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
// import {
//     doc, getDoc, getDocs, collection, query, where,
//     updateDoc, arrayRemove, arrayUnion, setDoc
// } from 'firebase/firestore';
// import {
//     ChevronLeft, Save, Edit3, Search,
//     DownloadCloud, Calendar, Users, Filter,
//     Lock, Clock, ShieldAlert, Activity, ShieldCheck, Target, FilterX, MapPin, ChevronRight, Globe, UserMinus
// } from 'lucide-react';
// import { db } from '../../lib/firebase';
// import '../FacilitatorDashboard/FacilitatorDashboard/FacilitatorDashboard.css';
// import Loader from '../../components/common/Loader/Loader';


// export interface AttendanceRingCardProps {
//     title: string;
//     typeLabel: string;
//     mainValue: number | string;
//     totalValue: number | string;
//     pct: number;
//     theme: 'k' | 'p' | 'w' | 'r';
//     icon: React.ReactNode;
//     bar1Label: string;
//     bar1Val: string;
//     bar1Pct: number;
//     bar2Label: string;
//     bar2Val: string;
//     bar2Pct: number;
//     statusText: string;
// }

// export const AttendanceRingCard: React.FC<AttendanceRingCardProps> = ({
//     title, typeLabel, mainValue, totalValue, pct, theme, icon, bar1Label, bar1Val, bar1Pct, bar2Label, bar2Val, bar2Pct, statusText
// }) => {
//     const [animatedPct, setAnimatedPct] = useState(0);

//     useEffect(() => {
//         const t = setTimeout(() => setAnimatedPct(pct), 150);
//         return () => clearTimeout(t);
//     }, [pct]);

//     const C = 282.6; // Circumference for r=45
//     const offset = C - (C * animatedPct / 100);

//     const config = {
//         k: { cls: 'mc-k', fillId: 'rK' }, // Amber
//         p: { cls: 'mc-p', fillId: 'rP' }, // Blue
//         w: { cls: 'mc-w', fillId: 'rW' }, // Green
//         r: { cls: 'mc-r', fillId: 'rR' }  // Red
//     };

//     const { cls, fillId } = config[theme];

//     return (
//         <div className={`mc ${cls}`} style={{ flex: 1, minWidth: '260px', borderTop: '5px solid #073f4e' }}>
//             <div className="mc-orb"></div>
//             <div className="mc-hdr">
//                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                     <div className="mc-icon">{icon}</div>
//                     <div>
//                         <div className="mc-label">{typeLabel}</div>
//                         <div className="mc-title">{title}</div>
//                     </div>
//                 </div>
//                 <div className="mc-pct">{animatedPct}%</div>
//             </div>

//             <div className="mc-ring-wrap">
//                 <svg className="mc-ring-svg" width="110" height="110" viewBox="0 0 100 100">
//                     <circle className="mc-ring-track" cx="50" cy="50" r="45" />
//                     <circle className="mc-ring-fill" id={fillId} cx="50" cy="50" r="45" style={{ strokeDashoffset: offset }} />
//                 </svg>
//                 <div className="mc-ring-center">
//                     <div className="mc-ring-num">{mainValue}</div>
//                     <div className="mc-ring-denom">{totalValue}</div>
//                 </div>
//             </div>

//             <div className="mc-bars">
//                 <div className="mc-bar-item">
//                     <div className="mc-bar-meta"><span className="mc-bar-lbl">{bar1Label}</span><span className="mc-bar-val">{bar1Val}</span></div>
//                     <div className="mc-track"><div className="mc-fill mc-fill-primary mc-fill-shimmer" style={{ width: `${bar1Pct}%` }}></div></div>
//                 </div>
//                 <div className="mc-bar-item">
//                     <div className="mc-bar-meta"><span className="mc-bar-lbl">{bar2Label}</span><span className="mc-bar-val">{bar2Val}</span></div>
//                     <div className="mc-track"><div className="mc-fill mc-fill-secondary" style={{ width: `${bar2Pct}%` }}></div></div>
//                 </div>
//             </div>

//             <div className="mc-footer">
//                 <span className="mc-total"><strong>{mainValue}</strong> of {totalValue}</span>
//                 <span className="mc-status">
//                     <span className="mc-dot"></span>{statusText}
//                 </span>
//             </div>
//         </div>
//     );
// };

// export const AttendancePage: React.FC = () => {
//     const { cohortId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();
//     const [searchParams, setSearchParams] = useSearchParams();

//     // 🚀 STRICT DATE NORMALIZATION 
//     const rawUrlDate = new URLSearchParams(location.search).get('date') || new Date().toISOString();
//     const registerDate = rawUrlDate.split('T')[0];

//     // ─── DATA STATES ───
//     const [attendanceList, setAttendanceList] = useState<any[]>([]);
//     const [cohortData, setCohortData] = useState<any>(null);
//     const [recordId, setRecordId] = useState<string | null>(null);
//     const [loading, setLoading] = useState(true);
//     const [attendanceMode, setAttendanceMode] = useState<'qcto' | 'bootcamp'>('qcto');
//     const [masterLog, setMasterLog] = useState<any | null>(null);

//     const isEcosystemEvent = Boolean(masterLog?.isEcosystem) === true;

//     // ─── UI CONTROLS ───
//     const [isLocked, setIsLocked] = useState(true);
//     const [isSaving, setIsSaving] = useState(false);

//     // ─── PAGINATION STATE ───
//     const [currentPage, setCurrentPage] = useState(1);
//     const ITEMS_PER_PAGE = 50;

//     // ─── URL-BOUND FILTER STATES ───
//     const urlSearchTerm = searchParams.get('search') || '';
//     const statusFilter = (searchParams.get('status') as 'all' | 'present' | 'partial' | 'absent') || 'all';
//     const complianceFilter = (searchParams.get('compliance') as 'all' | 'high' | 'mid' | 'low' | 'zero') || 'all';
//     const overrideFilter = (searchParams.get('override') as 'all' | 'system' | 'overridden') || 'all';
//     const locationFilter = searchParams.get('location') || 'all';

//     // 🚀 DEBOUNCED SEARCH STATE
//     const [localSearchTerm, setLocalSearchTerm] = useState(urlSearchTerm);

//     useEffect(() => {
//         const handler = setTimeout(() => {
//             updateUrlParams({ search: localSearchTerm || null });
//         }, 400);
//         return () => clearTimeout(handler);
//     }, [localSearchTerm]);

//     useEffect(() => {
//         setLocalSearchTerm(urlSearchTerm);
//     }, [urlSearchTerm]);

//     useEffect(() => {
//         setCurrentPage(1);
//     }, [urlSearchTerm, statusFilter, complianceFilter, overrideFilter, locationFilter]);

//     const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
//         setSearchParams(prev => {
//             const newParams = new URLSearchParams(prev);
//             Object.entries(updates).forEach(([key, value]) => {
//                 if (value === null || value === '' || value === 'all') {
//                     newParams.delete(key);
//                 } else {
//                     newParams.set(key, String(value));
//                 }
//             });
//             if (rawUrlDate) {
//                 newParams.set('date', rawUrlDate);
//             }
//             return newParams;
//         }, { replace: true });
//     }, [setSearchParams, rawUrlDate]);

//     const handleClearFilters = () => {
//         setLocalSearchTerm('');
//         setSearchParams(new URLSearchParams({ date: rawUrlDate }), { replace: true });
//     };

//     const hasActiveFilters = Boolean(urlSearchTerm || statusFilter !== 'all' || complianceFilter !== 'all' || overrideFilter !== 'all' || locationFilter !== 'all');

//     useEffect(() => {
//         const getAttendance = async () => {
//             try {
//                 setMasterLog(null); // Reset log state on load

//                 const targetCohortId = cohortId || "vc2Q2VxJHMnWBhgcIITg";

//                 const searchDates = Array.from(new Set([
//                     registerDate,
//                     `${registerDate}T00:00:00.000Z`,
//                     rawUrlDate
//                 ]));

//                 // 1. Fetch Cohort Basics
//                 const cohortSnap = await getDoc(doc(db, "cohorts", targetCohortId));
//                 let cohortLearnerIds: string[] = [];
//                 if (cohortSnap.exists()) {
//                     setCohortData(cohortSnap.data());
//                     cohortLearnerIds = cohortSnap.data().learnerIds || [];
//                 }

//                 // 2. Fetch Enrollments & Map Enrollment Status
//                 const enrollmentsSnap = await getDocs(query(collection(db, 'enrollments'), where('cohortId', '==', targetCohortId)));
//                 const enrollmentMap = new Map<string, any>();
//                 const enrolledLearnerIds: string[] = [];

//                 enrollmentsSnap.docs.forEach(d => {
//                     const data = d.data();
//                     const lId = data.learnerId;
//                     if (lId) {
//                         enrollmentMap.set(lId, data);
//                         enrolledLearnerIds.push(lId);
//                     }
//                 });

//                 const combinedIds = [...new Set([...cohortLearnerIds, ...enrolledLearnerIds])];

//                 const allLearnersSnap = await getDocs(collection(db, "learners"));
//                 const allLearners = allLearnersSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

//                 // 🚀 FIXED: Check BOTH base learner status AND cohort enrollment status to filter out dropped learners
//                 const enrolledProfiles = allLearners.filter(l => {
//                     const isLinkedToCohort = l.cohortId === targetCohortId || combinedIds.includes(l.id) || combinedIds.includes(l.idNumber);
//                     const enrol = enrollmentMap.get(l.id) || enrollmentMap.get(l.idNumber) || (l.learnerId ? enrollmentMap.get(l.learnerId) : null);

//                     const isDropped = l.status === 'dropped' || enrol?.status === 'dropped';

//                     return isLinkedToCohort && !isDropped;
//                 });

//                 // 3. 🚀 STRICT LOG FETCHING (Prioritizes Exact Matches to prevent Overwriting!)
//                 const logQuery = query(collection(db, 'attendance_logs'), where('cohortId', '==', targetCohortId));
//                 const logQuerySnap = await getDocs(logQuery);

//                 let exactMatch: any = null;
//                 let partialMatch: any = null;

//                 logQuerySnap.docs.forEach(docSnap => {
//                     const data = docSnap.data();
//                     const cleanSessionDate = data.sessionDate ? data.sessionDate.split('T')[0] : '';

//                     if (data.sessionDate === rawUrlDate) {
//                         exactMatch = data;
//                     } else if (searchDates.includes(data.sessionDate) || searchDates.includes(cleanSessionDate)) {
//                         partialMatch = data;
//                     }
//                 });

//                 // Always trust the exact match first
//                 const logData = exactMatch || partialMatch;

//                 const isBootcamp = !!logData;
//                 setAttendanceMode(isBootcamp ? 'bootcamp' : 'qcto');

//                 if (isBootcamp) {
//                     setMasterLog(logData);
//                 }

//                 let roster: any[] = [];

//                 if (isBootcamp) {
//                     const expectedDuration = logData.expectedDuration || 120;
//                     const rawZoomData: any[] = logData.rawZoomData || [];

//                     // INDEX-SAFE RECORDS FETCHING
//                     const recordsQuery = query(collection(db, 'attendance_records'), where('cohortId', '==', targetCohortId));
//                     const recordsSnap = await getDocs(recordsQuery);
//                     const recordsMap = new Map();

//                     recordsSnap.docs.forEach(d => {
//                         const data = d.data();
//                         const cleanRecDate = data.sessionDate ? data.sessionDate.split('T')[0] : '';

//                         if (searchDates.includes(data.sessionDate) || searchDates.includes(cleanRecDate)) {
//                             recordsMap.set(data.learnerId, { id: d.id, ...data });
//                         }
//                     });

//                     roster = enrolledProfiles.map(learner => {
//                         const learnerEmail = String(learner.email || '').toLowerCase().trim();
//                         const learnerName = String(learner.fullName || '').toLowerCase().trim();

//                         const zoomMatch = rawZoomData.find(z =>
//                             (learnerEmail && String(z.email).toLowerCase().trim() === learnerEmail) ||
//                             String(z.name).toLowerCase().trim() === learnerName
//                         );

//                         const rec = recordsMap.get(learner.id) || recordsMap.get(learner.idNumber);

//                         let actualDuration = 0;
//                         let finalStatus: 'Present' | 'Partial' | 'Absent' = 'Absent';

//                         if (rec) {
//                             actualDuration = rec.actualDuration || 0;
//                             finalStatus = rec.status || 'Absent';
//                         } else if (zoomMatch) {
//                             actualDuration = zoomMatch.duration;
//                             const pct = expectedDuration > 0 ? Math.round((actualDuration / expectedDuration) * 100) : 0;
//                             if (pct >= 80) finalStatus = 'Present';
//                             else if (pct > 20) finalStatus = 'Partial';
//                         }

//                         if (rec?.overridden) {
//                             finalStatus = rec.status;
//                         }

//                         const compliancePct = expectedDuration > 0 ? Math.round((actualDuration / expectedDuration) * 100) : 0;

//                         return {
//                             ...learner,
//                             recordDocId: rec?.id || `${targetCohortId}_${registerDate}_${learner.id}`,
//                             isPresent: finalStatus === 'Present' || finalStatus === 'Partial',
//                             status: finalStatus,
//                             actualDuration: actualDuration,
//                             expectedDuration: expectedDuration,
//                             compliancePct: compliancePct,
//                             overridden: rec?.overridden || false
//                         };
//                     });

//                 } else {
//                     // QCTO Fallback Logic
//                     const attQuery = query(collection(db, "attendance"), where("cohortId", "==", targetCohortId));
//                     const attSnaps = await getDocs(attQuery);
//                     let qctoData: any = { presentLearners: [], absentLearners: [], reasons: {}, proofs: {} };

//                     attSnaps.docs.forEach(d => {
//                         const data = d.data();
//                         const cleanDate = data.date ? data.date.split('T')[0] : '';
//                         if (searchDates.includes(data.date) || searchDates.includes(cleanDate)) {
//                             setRecordId(d.id);
//                             qctoData = data;
//                         }
//                     });

//                     roster = enrolledProfiles.map(learner => {
//                         const id = learner.idNumber;
//                         const isPresent = qctoData.presentLearners?.includes(id) || false;
//                         return {
//                             ...learner,
//                             isPresent: isPresent,
//                             status: isPresent ? 'Present' : 'Absent',
//                             reason: qctoData.reasons?.[id] || '',
//                             proof: qctoData.proofs?.[id] || null
//                         };
//                     });
//                 }

//                 roster.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
//                 setAttendanceList(roster);
//                 setLoading(false);

//             } catch (error) {
//                 console.error("Fetch error:", error);
//                 setLoading(false);
//             }
//         };

//         getAttendance();
//     }, [cohortId, registerDate, rawUrlDate]);

//     // 🚀 DYNAMIC STATS COMPONENT COUNTER
//     const summaryStats = useMemo(() => {
//         let present = 0;
//         let partial = 0;
//         let absent = 0;
//         let totalCohortHours = 0;

//         let maleCount = 0;
//         let femaleCount = 0;

//         attendanceList.forEach(l => {
//             if (l.status === 'Present') present++;
//             else if (l.status === 'Partial') partial++;
//             else absent++;

//             if (l.actualDuration) totalCohortHours += (l.actualDuration / 60);

//             const rawGender = String(l.demographics?.genderCode || (l.demographics as any)?.gender || l.gender || '').trim().toLowerCase();
//             const isMale = rawGender === 'm' || (rawGender.includes('male') && rawGender !== 'female');
//             const isFemale = rawGender === 'f' || rawGender.includes('female');

//             if (isMale) maleCount++;
//             if (isFemale) femaleCount++;
//         });

//         const totalEnrolled = attendanceList.length;
//         const averageEngagement = totalEnrolled > 0
//             ? Math.round((attendanceList.reduce((acc, curr) => acc + (curr.compliancePct || 0), 0) / totalEnrolled))
//             : 0;

//         const femalePct = totalEnrolled > 0 ? Math.round((femaleCount / totalEnrolled) * 100) : 0;
//         const malePct = totalEnrolled > 0 ? Math.round((maleCount / totalEnrolled) * 100) : 0;

//         return { present, partial, absent, totalEnrolled, averageEngagement, femaleCount, maleCount, femalePct, malePct };
//     }, [attendanceList]);

//     // 🚀 DYNAMIC LOCATION EXTRACTOR
//     const uniqueLocations = useMemo(() => {
//         const locations = new Set<string>();
//         attendanceList.forEach(l => {
//             const loc = l.demographics?.province || l.demographics?.municipality || l.demographics?.city || l.province || l.city || 'Not specified';
//             locations.add(loc);
//         });
//         return Array.from(locations).sort();
//     }, [attendanceList]);

//     // 🚀 DYNAMIC TOGGLE HANDLER
//     const handleToggle = async (learner: any) => {
//         if (isLocked) return;

//         if (attendanceMode === 'bootcamp') {
//             const newStatus = learner.status === 'Present' || learner.status === 'Partial' ? 'Absent' : 'Present';
//             const attRef = doc(db, "attendance_records", learner.recordDocId);

//             try {
//                 await setDoc(attRef, {
//                     status: newStatus,
//                     overridden: true,
//                     cohortId: cohortId || "vc2Q2VxJHMnWBhgcIITg",
//                     learnerId: learner.id,
//                     sessionDate: registerDate,
//                     updatedAt: new Date().toISOString()
//                 }, { merge: true });

//                 setAttendanceList(prev => prev.map(l => {
//                     if (l.id === learner.id || l.idNumber === learner.idNumber) {
//                         return { ...l, isPresent: newStatus === 'Present', status: newStatus, overridden: true };
//                     }
//                     return l;
//                 }));
//             } catch (error) {
//                 console.error("Firebase update failed:", error);
//                 alert("Failed to update status on server.");
//             }
//         } else {
//             if (!recordId) {
//                 alert("No QCTO register found for this date. Please ensure it was finalized from the dashboard.");
//                 return;
//             }

//             const idNumber = learner.idNumber;
//             const currentlyPresent = learner.isPresent;
//             const attRef = doc(db, "attendance", recordId);

//             try {
//                 if (currentlyPresent) {
//                     await updateDoc(attRef, {
//                         presentLearners: arrayRemove(idNumber),
//                         absentLearners: arrayUnion(idNumber)
//                     });
//                 } else {
//                     await updateDoc(attRef, {
//                         absentLearners: arrayRemove(idNumber),
//                         presentLearners: arrayUnion(idNumber)
//                     });
//                 }

//                 setAttendanceList(prev => prev.map(l => {
//                     if (l.idNumber === idNumber) {
//                         return { ...l, isPresent: !currentlyPresent, status: !currentlyPresent ? 'Present' : 'Absent' };
//                     }
//                     return l;
//                 }));

//             } catch (error) {
//                 console.error("Firebase update failed:", error);
//                 alert("Failed to update status on server.");
//             }
//         }
//     };

//     const handleSaveUpdates = async () => {
//         setIsSaving(true);
//         setTimeout(() => {
//             setIsLocked(true);
//             setIsSaving(false);
//         }, 600);
//     };

//     const filteredLearners = useMemo(() => {
//         return attendanceList.filter(l => {
//             const locationStr = String(l.demographics?.province || l.demographics?.municipality || l.demographics?.city || l.province || l.city || 'Not specified');

//             const matchesSearch = String(l.fullName || '').toLowerCase().includes(urlSearchTerm.toLowerCase()) ||
//                 String(l.idNumber || '').includes(urlSearchTerm) ||
//                 locationStr.toLowerCase().includes(urlSearchTerm.toLowerCase());

//             let matchesStatus = true;
//             if (statusFilter !== 'all') {
//                 matchesStatus = String(l.status).toLowerCase() === statusFilter;
//             }

//             let matchesLocation = true;
//             if (locationFilter !== 'all') {
//                 matchesLocation = locationStr === locationFilter;
//             }

//             let matchesCompliance = true;
//             if (attendanceMode === 'bootcamp' && complianceFilter !== 'all') {
//                 if (complianceFilter === 'high') matchesCompliance = l.compliancePct >= 80;
//                 else if (complianceFilter === 'mid') matchesCompliance = l.compliancePct >= 50 && l.compliancePct < 80;
//                 else if (complianceFilter === 'low') matchesCompliance = l.compliancePct > 0 && l.compliancePct < 50;
//                 else if (complianceFilter === 'zero') matchesCompliance = l.compliancePct === 0;
//             }

//             let matchesOverride = true;
//             if (attendanceMode === 'bootcamp' && overrideFilter !== 'all') {
//                 if (overrideFilter === 'overridden') matchesOverride = l.overridden === true;
//                 else if (overrideFilter === 'system') matchesOverride = l.overridden === false;
//             }

//             return matchesSearch && matchesStatus && matchesCompliance && matchesOverride && matchesLocation;
//         });
//     }, [attendanceList, urlSearchTerm, statusFilter, complianceFilter, overrideFilter, locationFilter, attendanceMode]);

//     // 🚀 CALCULATE PAGINATION
//     const totalPages = Math.ceil(filteredLearners.length / ITEMS_PER_PAGE);
//     const paginatedLearners = filteredLearners.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

//     if (loading) {
//         return (
//             <div className="cdp-layout">
//                 <main className="cdp-main cdp-main--centered">
//                     <Loader message='Loading register...' />
//                 </main>
//             </div>
//         );
//     }

//     return (
//         <div className="cdp-layout">

//             {/* ─── NEW STYLES & SVG GRADIENTS FOR RING CARDS ─── */}
//             <style>{`
//                 .mc-cards-wrapper { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 2rem; }
//                 .mc { background: white; border: 1px solid var(--mlab-border);padding: 22px 20px 18px; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 18px; transition: transform .22s ease, box-shadow .22s ease; cursor: default; }
//                 .mc:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,.06); }
//                 .mc-orb { position: absolute; top: -50px; right: -50px; width: 130px; height: 130px; border-radius: 50%; opacity: .15; filter: blur(28px); pointer-events: none; }
//                 .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; }
//                 .mc-icon { width: 38px; height: 38px; border-radius: 11px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
//                 .mc-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 400; letter-spacing: .2em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
//                 .mc-title { font-size: 14px; font-weight: 700; color: var(--mlab-midnight); letter-spacing: -0.2px; line-height: 1.2; }
//                 .mc-pct { font-family: 'Oswald', sans-serif; font-size: 24px; font-weight: 600; letter-spacing: -0.5px; flex-shrink: 0; margin-top: 1px; color: var(--mlab-midnight); }
//                 .mc-ring-wrap { display: flex; align-items: center; justify-content: center; position: relative; padding: 6px 0; }
//                 .mc-ring-svg { transform: rotate(-90deg); }
//                 .mc-ring-track { fill: none; stroke: #f1f5f9; stroke-width: 8px; }
//                 .mc-ring-fill { fill: none; stroke-width: 8px; stroke-linecap: round; stroke-dasharray: 282.6; transition: stroke-dashoffset 1.5s cubic-bezier(.4,0,.2,1) .15s; }
//                 .mc-ring-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
//                 .mc-ring-num { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1; color: var(--mlab-midnight); }
//                 .mc-ring-denom { font-size: 10px; font-weight: 500; color: var(--mlab-grey); }
//                 .mc-bars { display: flex; flex-direction: column; gap: 8px; }
//                 .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
//                 .mc-bar-lbl { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--mlab-grey); }
//                 .mc-bar-val { font-size: 10px; font-weight: 700; color: var(--mlab-midnight); }
//                 .mc-track { width: 100%; height: 5px; background: #f1f5f9; border-radius: 3px; overflow: hidden; }
//                 .mc-fill { height: 100%; border-radius: 3px; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
//                 @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
//                 .mc-fill-shimmer { background-size: 200% 100%; animation: shimmer 2.4s linear infinite .8s; }
//                 .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; border-top: 1px solid var(--mlab-border); }
//                 .mc-total { font-size: 11px; font-weight: 500; color: var(--mlab-grey); }
//                 .mc-total strong { font-weight: 800; color: var(--mlab-midnight); }
//                 .mc-status { display: inline-flex; align-items: center; gap: 5px; border-radius: 20px; padding: 4px 10px; font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; }
//                 @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.75); } }
//                 .mc-dot { width: 5px; height: 5px; border-radius: 50%; animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }

//                 /* Light Mode Themes */
//                 .mc-k .mc-orb { background: #f59e0b; } .mc-k .mc-icon { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-pct { color: #d97706; } .mc-k .mc-ring-fill { stroke: url(#gK); } .mc-k .mc-fill-primary { background-image: linear-gradient(90deg,#fbbf24,#f59e0b,#fbbf24); } .mc-k .mc-fill-secondary { background: #fef3c7; } .mc-k .mc-status { background: #fffbeb; border: 1px solid #fde68a; color: #d97706; } .mc-k .mc-dot { background: #d97706; }
//                 .mc-p .mc-orb { background: #38bdf8; } .mc-p .mc-icon { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-pct { color: #0284c7; } .mc-p .mc-ring-fill { stroke: url(#gP); } .mc-p .mc-fill-primary { background-image: linear-gradient(90deg,#7dd3fc,#0ea5e9,#7dd3fc); } .mc-p .mc-fill-secondary { background: #e0f2fe; } .mc-p .mc-status { background: #e0f2fe; border: 1px solid #bae6fd; color: #0284c7; } .mc-p .mc-dot { background: #0284c7; }
//                 .mc-w .mc-orb { background: var(--mlab-green); } .mc-w .mc-icon { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-pct { color: #65a30d; } .mc-w .mc-ring-fill { stroke: url(#gW); } .mc-w .mc-fill-primary { background-image: linear-gradient(90deg,#bef264,#84cc16,#bef264); } .mc-w .mc-fill-secondary { background: #ecfccb; } .mc-w .mc-status { background: #f7fee7; border: 1px solid #d9f99d; color: #65a30d; } .mc-w .mc-dot { background: #65a30d; }
//                 .mc-r .mc-orb { background: #ef4444; } .mc-r .mc-icon { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-pct { color: #b91c1c; } .mc-r .mc-ring-fill { stroke: url(#gR); } .mc-r .mc-fill-primary { background-image: linear-gradient(90deg,#fca5a5,#ef4444,#fca5a5); } .mc-r .mc-fill-secondary { background: #fee2e2; } .mc-r .mc-status { background: #fef2f2; border: 1px solid #fca5a5; color: #b91c1c; } .mc-r .mc-dot { background: #b91c1c; }
//             `}</style>

//             <svg width="0" height="0" style={{ position: 'absolute' }}>
//                 <defs>
//                     <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fde68a" /><stop offset="100%" stopColor="#d97706" /></linearGradient>
//                     <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#bae6fd" /><stop offset="100%" stopColor="#0284c7" /></linearGradient>
//                     <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#d9f99d" /><stop offset="100%" stopColor="#65a30d" /></linearGradient>
//                     <linearGradient id="gR" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stopColor="#fca5a5" /><stop offset="100%" stopColor="#b91c1c" /></linearGradient>
//                 </defs>
//             </svg>

//             <main className="cdp-main">

//                 {/* ─── HEADER ─── */}
//                 <header className="cdp-header">
//                     <div className="cdp-header__left">
//                         <button className="cdp-header__back" onClick={() => navigate(-1)}>
//                             <ChevronLeft size={14} /> Back
//                         </button>
//                         <div className="cdp-header__eyebrow">
//                             <Calendar size={12} /> {attendanceMode === 'bootcamp' ? 'Bootcamp Analytics Register' : 'Daily Attendance Register'}
//                         </div>

//                         {/* 🚀 ECOSYSTEM BADGE */}
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <h1 className="cdp-header__title">{masterLog?.sessionTitle || cohortData?.name || 'Cohort Register'}</h1>
//                             {isEcosystemEvent && (
//                                 <span style={{ fontSize: '0.65rem', background: '#f5f3ff', color: '#7c3aed', padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ddd6fe', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                     <Globe size={12} /> ECOSYSTEM EVENT
//                                 </span>
//                             )}
//                         </div>

//                         <p className="cdp-header__sub">
//                             {new Date(registerDate).toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
//                         </p>
//                     </div>

//                     <div className="cdp-header__right">
//                         <div className="cdp-header__actions">
//                             {isLocked ? (
//                                 <button
//                                     className="cdp-btn"
//                                     onClick={() => setIsLocked(false)}
//                                     style={{ background: 'rgba(217, 119, 6, 0.15)', color: '#fcd34d', border: '1px solid #f59e0b' }}
//                                 >
//                                     <Edit3 size={14} /> Unlock to Edit
//                                 </button>
//                             ) : (
//                                 <button
//                                     className="cdp-btn cdp-btn--primary"
//                                     onClick={handleSaveUpdates}
//                                     disabled={isSaving}
//                                     style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)' }}
//                                 >
//                                     {isSaving ? "Saving..." : <><Save size={14} /> Lock & Save Updates</>}
//                                 </button>
//                             )}
//                         </div>
//                     </div>
//                 </header>

//                 <div className="cdp-content">

//                     {/* ─── NEW BEAUTIFUL CARDS ─── */}
//                     <div className="mc-cards-wrapper">

//                         {/* 1. PRESENT CARD (GREEN) */}
//                         <AttendanceRingCard
//                             title="Active Attendance"
//                             typeLabel="Cohort Health"
//                             mainValue={summaryStats.present}
//                             totalValue={`${summaryStats.totalEnrolled} Enrolled`}
//                             pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
//                             theme="w"
//                             icon={<Users size={18} />}
//                             bar1Label="Present"
//                             bar1Val={`${summaryStats.present} full`}
//                             bar1Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
//                             bar2Label="Partial"
//                             bar2Val={`${summaryStats.partial} partial`}
//                             bar2Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.partial / summaryStats.totalEnrolled) * 100) : 0}
//                             statusText="Tracked"
//                         />

//                         {/* 2. DEMOGRAPHICS/ENGAGEMENT CARD (BLUE) */}
//                         <AttendanceRingCard
//                             title={attendanceMode === 'bootcamp' ? 'Avg Engagement' : 'Demographics'}
//                             typeLabel={attendanceMode === 'bootcamp' ? 'Session Quality' : 'Class Makeup'}
//                             mainValue={attendanceMode === 'bootcamp' ? `${summaryStats.averageEngagement}%` : summaryStats.femaleCount}
//                             totalValue={attendanceMode === 'bootcamp' ? 'Target: 80%' : `${summaryStats.totalEnrolled} Enrolled`}
//                             pct={attendanceMode === 'bootcamp' ? summaryStats.averageEngagement : summaryStats.femalePct}
//                             theme="p"
//                             icon={attendanceMode === 'bootcamp' ? <Activity size={18} /> : <Target size={18} />}
//                             bar1Label="Females"
//                             bar1Val={`${summaryStats.femaleCount} (${summaryStats.femalePct}%)`}
//                             bar1Pct={summaryStats.femalePct}
//                             bar2Label="Males"
//                             bar2Val={`${summaryStats.maleCount} (${summaryStats.malePct}%)`}
//                             bar2Pct={summaryStats.malePct}
//                             statusText="Active Metrics"
//                         />
//                         {/* 3. ABSENT CARD (RED) */}
//                         <AttendanceRingCard
//                             title="Absent / Unlogged"
//                             typeLabel="At Risk"
//                             mainValue={summaryStats.absent}
//                             totalValue={`${summaryStats.totalEnrolled} Enrolled`}
//                             pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.absent / summaryStats.totalEnrolled) * 100) : 0}
//                             theme="r"
//                             icon={<UserMinus size={18} />}
//                             bar1Label="Absent"
//                             bar1Val={`${summaryStats.absent} missed`}
//                             bar1Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.absent / summaryStats.totalEnrolled) * 100) : 0}
//                             bar2Label="Present"
//                             bar2Val={`${summaryStats.present} logged`}
//                             bar2Pct={summaryStats.totalEnrolled > 0 ? Math.round((summaryStats.present / summaryStats.totalEnrolled) * 100) : 0}
//                             statusText="Needs Attention"
//                         />
//                     </div>

//                     {/* ─── TOOLBAR, SEARCH & FILTERS ─── */}
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem', background: 'white', padding: '1rem 1.5rem', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
//                             <div className="mlab-search" style={{ border: '1px solid #cbd5e1', padding: '8px 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '300px', flex: 1 }}>
//                                 <Search size={16} color="var(--mlab-grey)" />
//                                 <input
//                                     type="text"
//                                     placeholder="Search by applicant name, ID, or location..."
//                                     value={localSearchTerm}
//                                     onChange={(e) => setLocalSearchTerm(e.target.value)}
//                                     style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.85rem' }}
//                                 />
//                             </div>

//                             {/* Standard Status Filter */}
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <Filter size={14} color="var(--mlab-grey)" />
//                                 <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Daily Status:</label>
//                                 <select value={statusFilter} onChange={(e) => updateUrlParams({ status: e.target.value })} style={{ padding: '6px 12px', background: 'transparent', fontSize: '0.85rem', color: 'grey', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
//                                     <option value="all">All Statuses</option>
//                                     <option value="present">Present (Full Time)</option>
//                                     {attendanceMode === 'bootcamp' && <option value="partial">Partial (Short Hours)</option>}
//                                     <option value="absent">Absent</option>
//                                 </select>
//                             </div>

//                             <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                 {hasActiveFilters && (
//                                     <button
//                                         onClick={handleClearFilters}
//                                         className="mlab-btn mlab-btn--sm animate-fade-in"
//                                         style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}
//                                     >
//                                         <FilterX size={14} /> Clear Filters
//                                     </button>
//                                 )}

//                                 {isLocked && (
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#f8fafc', padding: '8px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', color: '#64748b', fontSize: '0.8rem', fontWeight: 600 }}>
//                                         <Lock size={14} /> Register is currently locked
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>


//                             {/* Conditional Location Filter */}
//                             {isEcosystemEvent && (
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                     <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> Location:</label>
//                                     <select
//                                         value={locationFilter}
//                                         onChange={(e) => updateUrlParams({ location: e.target.value })}
//                                         style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}
//                                     >
//                                         <option value="all">All Locations</option>
//                                         {uniqueLocations.map(loc => (
//                                             <option key={loc} value={loc}>{loc}</option>
//                                         ))}
//                                     </select>
//                                 </div>
//                             )}

//                             {/* Bootcamp Specific Deep Filters */}
//                             {attendanceMode === 'bootcamp' && (
//                                 <>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><Activity size={12} /> Compliance:</label>
//                                         <select value={complianceFilter} onChange={(e) => updateUrlParams({ compliance: e.target.value })} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
//                                             <option value="all">All Performance Bands</option>
//                                             <option value="high">High Compliance (80%+)</option>
//                                             <option value="mid">Moderate Risk (50% - 79%)</option>
//                                             <option value="low">Critical Risk (1% - 49%)</option>
//                                             <option value="zero">Zero Engagement (0%)</option>
//                                         </select>
//                                     </div>

//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                         <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} /> Record Integrity:</label>
//                                         <select value={overrideFilter} onChange={(e) => updateUrlParams({ override: e.target.value })} style={{ padding: '6px 12px', fontSize: '0.85rem', border: '1px solid #cbd5e1', borderRadius: '6px', outline: 'none' }}>
//                                             <option value="all">All Records</option>
//                                             <option value="system">System Calculated (Zoom)</option>
//                                             <option value="overridden">Manually Overridden</option>
//                                         </select>
//                                     </div>
//                                 </>
//                             )}
//                         </div>
//                     </div>

//                     {/* ─── TABLE ─── */}
//                     <div className="cdp-panel animate-fade-in" style={{ opacity: isLocked ? 0.75 : 1, transition: 'opacity 0.3s ease' }}>
//                         <div className="vp-card" style={{ marginBottom: 0, border: 'none', minHeight: '650px', display: 'flex', flexDirection: 'column' }}>
//                             <div className="vp-card-header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '1rem 1.5rem', background: 'var(--mlab-bg)' }}>
//                                 <div className="vp-card-title-group" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                     <Users size={16} color="var(--mlab-blue)" />
//                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', fontSize: '0.9rem' }}>
//                                         Showing {filteredLearners.length} Records
//                                     </h3>
//                                 </div>
//                             </div>

//                             <div className="mlab-table-wrap" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
//                                 <table className="mlab-table" style={{ tableLayout: 'fixed' }}>
//                                     <colgroup>
//                                         <col style={{ width: '25%' }} />
//                                         {isEcosystemEvent && <col style={{ width: '15%' }} />}
//                                         <col style={{ width: '15%' }} />
//                                         <col style={{ width: '10%' }} />
//                                         <col style={{ width: '25%' }} />
//                                         <col style={{ width: '10%' }} />
//                                     </colgroup>
//                                     <thead>
//                                         <tr>
//                                             <th>Learner Identity</th>
//                                             {isEcosystemEvent && <th>Location</th>}
//                                             <th>ID Number</th>
//                                             <th>Current Status</th>
//                                             <th>{attendanceMode === 'bootcamp' ? 'Duration & Compliance' : 'Evidence / Note'}</th>
//                                             <th style={{ textAlign: 'right' }}>Actions</th>
//                                         </tr>
//                                     </thead>
//                                     <tbody>
//                                         {paginatedLearners.length > 0 ? paginatedLearners.map(learner => {
//                                             const locationStr = String(learner.demographics?.province || learner.demographics?.municipality || learner.demographics?.city || learner.province || learner.city || 'Not specified');

//                                             return (
//                                                 <tr key={learner.idNumber || learner.id} className="animate-fade-in" style={{ borderLeft: learner.status === 'Partial' ? '4px solid #f59e0b' : learner.isPresent ? '4px solid var(--mlab-green)' : '4px solid var(--mlab-red)', transition: 'all 0.3s ease' }}>

//                                                     {/* Learner Info */}
//                                                     <td>
//                                                         <div className="cdp-learner-cell">
//                                                             <div className="cdp-learner-avatar" style={{ background: learner.isPresent ? 'var(--mlab-light-blue)' : '#fee2e2', color: learner.isPresent ? 'var(--mlab-blue)' : '#991b1b' }}>
//                                                                 {learner.fullName.charAt(0)}
//                                                             </div>
//                                                             <div className="cdp-learner-cell__info">
//                                                                 <span className="cdp-learner-cell__name">{learner.fullName}</span>
//                                                                 <span className="cdp-learner-cell__id" style={{ fontSize: '0.65rem', textTransform: 'uppercase' }}>Enrolled Student</span>
//                                                             </div>
//                                                         </div>
//                                                     </td>

//                                                     {/* Location Column (Conditional) */}
//                                                     {isEcosystemEvent && (
//                                                         <td>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-grey)' }}>
//                                                                 <MapPin size={12} /> {locationStr}
//                                                             </div>
//                                                         </td>
//                                                     )}

//                                                     {/* ID Number */}
//                                                     <td>
//                                                         <span style={{ fontFamily: 'monospace', color: 'var(--mlab-blue)', fontWeight: 600, letterSpacing: '0.05em' }}>
//                                                             {learner.idNumber || 'N/A'}
//                                                         </span>
//                                                     </td>

//                                                     {/* Status Badge */}
//                                                     <td>
//                                                         <span
//                                                             className={`cdp-status-badge ${learner.status === 'Present' ? 'cdp-status-badge--active' : 'cdp-status-badge--dropped'}`}
//                                                             style={learner.status === 'Partial' ? { background: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' } : {}}
//                                                         >
//                                                             {learner.status}
//                                                         </span>
//                                                     </td>

//                                                     {/* Unified Evidence / Duration Column */}
//                                                     <td style={{ maxWidth: '300px' }}>
//                                                         {attendanceMode === 'bootcamp' ? (
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>

//                                                                 {/* 🚀 CONDITIONAL UI FOR ECOSYSTEM EVENT VS ZOOM EVENT */}
//                                                                 {isEcosystemEvent ? (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                                                         <Globe size={14} color="var(--mlab-grey)" />
//                                                                         <strong>Full-Day Ecosystem Event</strong>
//                                                                     </div>
//                                                                 ) : (
//                                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--mlab-midnight)' }}>
//                                                                         <Clock size={14} color="var(--mlab-grey)" />
//                                                                         <strong>{learner.actualDuration} mins</strong>
//                                                                         <span style={{ color: 'var(--mlab-grey)' }}>/ {learner.expectedDuration} mins expected</span>
//                                                                     </div>
//                                                                 )}

//                                                                 <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
//                                                                     {isEcosystemEvent ? (
//                                                                         <span style={{
//                                                                             display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700,
//                                                                             background: learner.isPresent ? '#dcfce7' : '#fee2e2',
//                                                                             color: learner.isPresent ? '#166534' : '#991b1b',
//                                                                             borderRadius: '4px'
//                                                                         }}>
//                                                                             {learner.isPresent ? '100% Attended' : '0% Attended'}
//                                                                         </span>
//                                                                     ) : (
//                                                                         <span style={{
//                                                                             display: 'inline-flex', alignItems: 'center', padding: '2px 8px', fontSize: '0.7rem', fontWeight: 700,
//                                                                             background: learner.compliancePct >= 80 ? '#dcfce7' : learner.compliancePct >= 50 ? '#fef3c7' : '#fee2e2',
//                                                                             color: learner.compliancePct >= 80 ? '#166534' : learner.compliancePct >= 50 ? '#b45309' : '#991b1b',
//                                                                             borderRadius: '4px'
//                                                                         }}>
//                                                                             {learner.compliancePct}% Compliance
//                                                                         </span>
//                                                                     )}

//                                                                     {learner.overridden && (
//                                                                         <span style={{ fontSize: '0.65rem', background: '#fff7ed', color: '#c2410c', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                                             <ShieldAlert size={10} /> Manual Override
//                                                                         </span>
//                                                                     )}
//                                                                 </div>
//                                                             </div>
//                                                         ) : (
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                                 <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontStyle: 'italic', lineHeight: 1.4 }}>
//                                                                     "{learner.reason || 'No specific reason provided'}"
//                                                                 </span>
//                                                                 {learner.proof && (
//                                                                     <a
//                                                                         href={learner.proof.url}
//                                                                         target="_blank"
//                                                                         rel="noreferrer"
//                                                                         style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#2563eb', fontWeight: 'bold', textDecoration: 'none', background: '#eff6ff', padding: '4px 8px', borderRadius: '4px', alignSelf: 'flex-start', border: '1px solid #bfdbfe' }}
//                                                                     >
//                                                                         <DownloadCloud size={12} /> View Attached Proof
//                                                                     </a>
//                                                                 )}
//                                                             </div>
//                                                         )}
//                                                     </td>

//                                                     {/* Actions */}
//                                                     <td style={{ textAlign: 'right' }}>
//                                                         <button
//                                                             disabled={isLocked}
//                                                             className={`cdp-btn ${learner.isPresent ? 'cdp-btn--danger' : 'cdp-btn--sky'}`}
//                                                             onClick={() => handleToggle(learner)}
//                                                             style={{
//                                                                 cursor: isLocked ? 'not-allowed' : 'pointer',
//                                                                 opacity: isLocked ? 0.4 : 1
//                                                             }}
//                                                         >
//                                                             {learner.isPresent ? 'Mark Absent' : 'Mark Present'}
//                                                         </button>
//                                                     </td>
//                                                 </tr>
//                                             )
//                                         }) : (
//                                             <tr>
//                                                 <td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: 'var(--mlab-grey)' }}>
//                                                     <Filter size={32} style={{ margin: '0 auto 1rem', opacity: 0.4 }} />
//                                                     <p style={{ margin: 0, fontWeight: 500 }}>No learners match your current filter settings.</p>
//                                                 </td>
//                                             </tr>
//                                         )}
//                                     </tbody>
//                                 </table>
//                             </div>

//                             {/* 🚀 PAGINATION FOOTER */}
//                             {totalPages > 1 && (
//                                 <div style={{
//                                     display: 'flex', justifyContent: 'space-between', alignItems: 'center',
//                                     padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)',
//                                     marginTop: 'auto'
//                                 }}>
//                                     <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontWeight: 500 }}>
//                                         Showing <strong>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</strong> to <strong>{Math.min(currentPage * ITEMS_PER_PAGE, filteredLearners.length)}</strong> of <strong>{filteredLearners.length}</strong> records
//                                     </div>
//                                     <div style={{ display: 'flex', gap: '8px' }}>
//                                         <button
//                                             onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                                             disabled={currentPage === 1}
//                                             className="wm-btn wm-btn--ghost"
//                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === 1 ? 0.5 : 1 }}
//                                         >
//                                             <ChevronLeft size={14} /> Previous
//                                         </button>
//                                         <div style={{ display: 'flex', alignItems: 'center', padding: '0 8px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--mlab-midnight)' }}>
//                                             Page {currentPage} of {totalPages}
//                                         </div>
//                                         <button
//                                             onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
//                                             disabled={currentPage === totalPages}
//                                             className="wm-btn wm-btn--ghost"
//                                             style={{ padding: '6px 12px', border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', opacity: currentPage === totalPages ? 0.5 : 1 }}
//                                         >
//                                             Next <ChevronRight size={14} />
//                                         </button>
//                                     </div>
//                                 </div>
//                             )}

//                         </div>
//                     </div>

//                 </div>
//             </main>
//         </div>
//     );
// };