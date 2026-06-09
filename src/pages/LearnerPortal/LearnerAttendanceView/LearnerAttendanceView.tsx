// src/pages/LearnerPortal/LearnerAttendanceView/LearnerAttendanceView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    CalendarCheck, Clock, CheckCircle, AlertTriangle, Calendar, XCircle,
    ArrowDownToLine, BookOpen, Layers, Briefcase, Plus, History,
    FileText, Pencil, Search, ChevronDown, ChevronUp, ExternalLink, 
    Maximize2, X, Paperclip, Landmark, Loader2,
    EyeOff,
    Eye
} from 'lucide-react';
import moment from 'moment';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../lib/firebase';

import './LearnerAttendanceView.css';
import { useStore } from '../../../store/useStore';

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

export interface AbsenceRecord {
    date: string;
    cohortId?: string;
    cohortName?: string;
}

export interface LearnerAttendanceViewProps {
    formattedScanHistory: any[];
    absenceDates: (AbsenceRecord | string)[]; 
    attendancePercentage: string;
    cohorts: any[];
    workplaceLogs: any[];
    learnerHasEmployer: boolean;
    stipendAmount?: number; 
    onOpenLogModal: (log?: any) => void;
}

const getSAWorkingDaysInMonth = (year: number, month: number) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;
    
    const holidays = [
        '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27', 
        '2026-05-01', '2026-06-16', '2026-08-09', '2026-08-10', '2026-09-24', 
        '2026-12-16', '2026-12-25', '2026-12-26'
    ];

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidays.includes(current.format('YYYY-MM-DD'))) {
                days++;
            }
        }
        current.add(1, 'days');
    }
    return days;
};

export const LearnerAttendanceView: React.FC<LearnerAttendanceViewProps> = ({
    formattedScanHistory = [],
    absenceDates = [],
    attendancePercentage = "100%",
    cohorts = [],
    workplaceLogs = [],
    learnerHasEmployer = false,
    stipendAmount,
    onOpenLogModal
}) => {
    const { user } = useStore() as any;

    // ─── INTERNAL UI STATE ───
    const [activeTab, setActiveTab] = useState<'campus' | 'workplace'>('campus');
    const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
    const [selectedCohortId, setSelectedCohortId] = useState<string>('all');
    const [dateFilterMode, setDateFilterMode] = useState<'month' | 'week' | 'date'>('month');
    const [dateSearch, setDateSearch] = useState('');

    const [wpSearch, setWpSearch] = useState('');
    const [wpStatusFilter, setWpStatusFilter] = useState<string>('all');
    const [wpMonthFilter, setWpMonthFilter] = useState<string>('all');
    const [expandedWpMonths, setExpandedWpMonths] = useState<Set<string>>(new Set());

    const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);
    const [viewingLogDetails, setViewingLogDetails] = useState<any | null>(null);
    const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

    // ─── 🚀 DEEP STIPEND SCANNER STATE ───
    const [directStipend, setDirectStipend] = useState<number | null>(null);
    const [isStipendLoading, setIsStipendLoading] = useState<boolean>(false);

    // Stable primitives for the hook dependency array
    const stableUserUid = user?.uid || '';
    const stableIdNumber = user?.idNumber || '';
    const fallbackSearchId = workplaceLogs.length > 0 ? workplaceLogs[0].learnerId : '';

    useEffect(() => {
    const fetchStipendDirectly = async () => {
        const rawHumanId = stableIdNumber || stableUserUid || fallbackSearchId;
        
        console.group("🔍 [DEEP STIPEND SCANNER - ROOT CAUSE SOLVED]");
        console.log("1. Starting direct database pipeline query.");
        console.log("   - Raw Candidate Target ID:", rawHumanId);

        if (!rawHumanId) {
            console.warn("   ✕ Aborting scan. No raw lookup identifier could be resolved.");
            console.groupEnd();
            return;
        }

        setIsStipendLoading(true);

        try {
            // STEP A: Fetch the enrollment record to resolve the compound ID mapping mismatch
            console.log("2. Querying 'enrollments' to resolve the compound key mapping...");
            const enrollmentsQ = query(collection(db, "enrollments"), where("learnerId", "==", rawHumanId));
            const enrollmentsSnap = await getDocs(enrollmentsQ);
            
            let compoundId = "";
            if (!enrollmentsSnap.empty) {
                const enrollmentDoc = enrollmentsSnap.docs[0];
                const enrollmentData = enrollmentDoc.data();
                // Extract the true compound key string (cohortId_idNumber)
                compoundId = enrollmentData?.id || enrollmentDoc.id;
                console.log("   ✓ Enrollment compound string successfully resolved:", compoundId);
            } else {
                console.log("   ✕ No matching document found in 'enrollments'. Will try searching placements by raw ID only.");
            }

            // STEP B: Build a lookup pool containing both the raw ID and the compound ID formats
            const searchPool = [rawHumanId];
            if (compoundId) {
                searchPool.push(compoundId);
            }
            console.log("3. Executing lookups on 'placements' collection using lookup pool:", searchPool);

            // Query placements checking for either matching key structure
            const placementsQ = query(collection(db, "placements"), where("learnerId", "in", searchPool));
            const placementsSnap = await getDocs(placementsQ);

            if (!placementsSnap.empty) {
                const data = placementsSnap.docs[0].data();
                console.log("   ✓ Success! Found matching document in 'placements' collection:", data);
                
                // Inspecting payroll data targets
                const stipend = data?.stipendAmount ?? data?.stipend ?? data?.allowance ?? data?.wage;
                if (stipend !== undefined && stipend !== null) {
                    console.log("   🎯 Valid Stipend Value extracted:", stipend);
                    setDirectStipend(Number(stipend));
                    console.groupEnd();
                    return;
                } else {
                    console.log("   ✕ Placement doc exists, but contains no valid stipend fields.");
                }
            } else {
                console.log("   ✕ Vector empty. No matching records found inside 'placements' collection for this search pool.");
            }

            console.warn("⚠️ Scanner complete. All identifier variations checked but no matching stipend value was resolved.");
        } catch (err) {
            console.error("❌ Transactional scanner loop hit a critical execution error:", err);
        } finally {
            setIsStipendLoading(false);
            console.groupEnd();
        }
    };

    if (learnerHasEmployer && (!stipendAmount || stipendAmount === 0)) {
        fetchStipendDirectly();
    }
}, [stableUserUid, stableIdNumber, fallbackSearchId, learnerHasEmployer, stipendAmount]);

    // ─── HELPER FUNCTIONS ───
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-ZA", {
            style: "currency",
            currency: "ZAR",
            maximumFractionDigits: 0,
        }).format(val || 0);

    const isImageFile = (url: string) => {
        if (!url) return false;
        return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url) ||
            url.toLowerCase().includes('.png') ||
            url.toLowerCase().includes('.jpg') ||
            url.toLowerCase().includes('.jpeg');
    };

    const toggleWpMonthAccordion = (monthLabel: string) => {
        setExpandedWpMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthLabel)) next.delete(monthLabel);
            else next.add(monthLabel);
            return next;
        });
    };

    const toggleHistoryAccordion = (logId: string) => {
        setExpandedHistoryIds(prev => {
            const next = new Set(prev);
            if (next.has(logId)) next.delete(logId); else next.add(logId);
            return next;
        });
    };

    // ─── 🚀 THE MISSING VARIABLE: MODAL TIMELINE ENGINE ───
    const logVersions = useMemo(() => {
        if (!viewingLogDetails) return [];
        if (viewingLogDetails.history && viewingLogDetails.history.length > 0) {
            return [...viewingLogDetails.history, viewingLogDetails].sort((a, b) => {
                const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return timeB - timeA; 
            });
        }
        return [viewingLogDetails];
    }, [viewingLogDetails]);

    // ─── CAMPUS LEDGER COMPUTATION ───
    const combinedLedger = useMemo(() => {
        const presentRecords = formattedScanHistory.map(scan => {
            const matchedCohort = cohorts.find(c => c.id === scan.cohortId);
            return {
                ...scan,
                type: 'present',
                dateObj: new Date(scan.dateString),
                cohortId: scan.cohortId || '',
                cohortName: matchedCohort ? matchedCohort.name : (scan.cohortName || 'General Campus Session')
            };
        });

        const absentRecords = absenceDates.map(item => {
            const dateStr = typeof item === 'string' ? item : item.date;
            const cName = typeof item === 'string' ? 'Unknown Class' : (item.cohortName || 'Unknown Class');
            const cId = typeof item === 'string' ? '' : (item.cohortId || '');
            const matchedCohort = cohorts.find(c => c.name === cName || c.id === cId);
            return {
                dateString: dateStr,
                type: 'absent',
                dateObj: new Date(dateStr),
                cohortId: matchedCohort ? matchedCohort.id : cId,
                cohortName: cName
            };
        });

        return [...presentRecords, ...absentRecords].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    }, [formattedScanHistory, absenceDates, cohorts]);

    const uniqueLedgerCohorts = useMemo(() => {
        const seen = new Set<string>();
        const list: { id: string; name: string }[] = [];
        combinedLedger.forEach(record => {
            const idKey = record.cohortId || record.cohortName;
            if (idKey && !seen.has(idKey)) {
                seen.add(idKey);
                list.push({ id: idKey, name: record.cohortName });
            }
        });
        return list;
    }, [combinedLedger]);

    const cohortFilteredLedger = useMemo(() => {
        return combinedLedger.filter(record => {
            if (selectedCohortId === 'all') return true;
            return record.cohortId === selectedCohortId || record.cohortName === selectedCohortId;
        });
    }, [combinedLedger, selectedCohortId]);

    const stats = useMemo(() => {
        const presentCount = cohortFilteredLedger.filter(r => r.type === 'present').length;
        const absentCount = cohortFilteredLedger.filter(r => r.type === 'absent').length;
        const total = presentCount + absentCount;
        const ratio = total === 0 ? "100%" : Math.round((presentCount / total) * 100) + "%";

        const currentYear = moment().year();
        const currentMonth = moment().month(); 
        const currentMonthStr = moment().format('YYYY-MM');

        const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth);

        const approvedDatesThisMonth = new Set(
            workplaceLogs
                .filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr))
                .filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved")
                .map((l: any) => l.dateString)
        );
        const currentMonthApprovedDays = approvedDatesThisMonth.size;

        const baseWageAmount = Number(stipendAmount) || directStipend || 0;

        let currentMonthEarnedStipend = baseWageAmount; 
        if (expectedWorkingDaysThisMonth > 0 && baseWageAmount > 0) {
            const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * baseWageAmount;
            currentMonthEarnedStipend = Math.min(calculatedProRata, baseWageAmount); 
        }

        return { 
            total, 
            presentCount, 
            absentCount, 
            ratio,
            currentMonthApprovedDays,
            expectedWorkingDaysThisMonth,
            currentMonthEarnedStipend,
            baseStipendUsed: baseWageAmount
        };
    }, [cohortFilteredLedger, workplaceLogs, stipendAmount, directStipend]);

    const finalFilteredDisplayLedger = useMemo(() => {
        return cohortFilteredLedger.filter(record => {
            if (filterStatus !== 'all' && record.type !== filterStatus) return false;
            if (dateSearch) {
                if (dateFilterMode === 'month' && moment(record.dateObj).format('YYYY-MM') !== dateSearch) return false;
                if (dateFilterMode === 'week' && moment(record.dateObj).format('YYYY-[W]WW') !== dateSearch) return false;
                if (dateFilterMode === 'date' && moment(record.dateObj).format('YYYY-MM-DD') !== dateSearch) return false;
            }
            return true;
        });
    }, [cohortFilteredLedger, filterStatus, dateFilterMode, dateSearch]);

    // ─── WORKPLACE LOGS COMPUTATION & GROUPING ───
    const wpAvailableMonths = useMemo(() => {
        const months = new Set<string>();
        workplaceLogs.forEach(log => {
            if (log.dateString) months.add(moment(log.dateString).format('YYYY-MM'));
        });
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    }, [workplaceLogs]);

    const totalWorkplaceHours = useMemo(() => {
        return workplaceLogs
            .filter(log => String(log.status || "").trim().toLowerCase() === 'approved')
            .reduce((sum, log) => sum + (Number(log.totalHours) || 0), 0);
    }, [workplaceLogs]);

    const hasActiveWpFilters = wpSearch.trim() !== '' || wpStatusFilter !== 'all' || wpMonthFilter !== 'all';

    const filteredAndGroupedWpLogs = useMemo(() => {
        const filtered = workplaceLogs.filter(log => {
            if (wpStatusFilter !== 'all' && log.status !== wpStatusFilter) return false;
            if (wpMonthFilter !== 'all' && !log.dateString?.startsWith(wpMonthFilter)) return false;

            if (wpSearch.trim()) {
                const term = wpSearch.toLowerCase();
                const matchesSearch =
                    log.tasksPerformed?.toLowerCase().includes(term) ||
                    log.workActivityCode?.toLowerCase().includes(term) ||
                    log.workActivityLabel?.toLowerCase().includes(term) ||
                    log.topicTitle?.toLowerCase().includes(term);
                if (!matchesSearch) return false;
            }
            return true;
        }).sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());

        const groups: Record<string, any[]> = {};
        filtered.forEach(log => {
            const monthYear = moment(log.dateString).format('MMMM YYYY');
            if (!groups[monthYear]) {
                groups[monthYear] = [];
            }
            groups[monthYear].push(log);
        });

        return groups;
    }, [workplaceLogs, wpStatusFilter, wpMonthFilter, wpSearch]);

    useEffect(() => {
        const months = Object.keys(filteredAndGroupedWpLogs);
        if (months.length > 0) {
            if (hasActiveWpFilters) {
                setExpandedWpMonths(new Set(months));
            } else if (expandedWpMonths.size === 0) {
                setExpandedWpMonths(new Set([months[0]]));
            }
        }
    }, [filteredAndGroupedWpLogs, hasActiveWpFilters]);

    return (
        <div className="ld-animate" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <style dangerouslySetInnerHTML={{
                __html: `
                .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
                .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
                .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
                .quill-content-display li { margin-bottom: 4px !important; }
                
                .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; transition: color 0.15s ease !important; }
                .quill-content-display a:hover { color: #1d4ed8 !important; }
                .quill-content-display code { background-color: #f1f5f9 !important; color: #0f172a !important; padding: 3px 6px !important; borderRadius: 4px !important; font-family: monospace !important; font-size: 0.85em !important; }
                .quill-content-display pre { background-color: #1e293b !important; color: #f8fafc !important; padding: 12px 16px !important; borderRadius: 6px !important; font-family: monospace !important; font-size: 0.85rem !important; line-height: 1.5 !important; overflow-x: auto !important; margin: 10px 0 !important; border: 1px solid #334155 !important; white-space: pre-wrap !important; }
                .quill-content-display blockquote { border-left: 4px solid #94a3b8 !important; padding-left: 12px !important; margin: 12px 0 !important; color: #475569 !important; font-style: italic !important; }
                .quill-content-display table { border-collapse: collapse !important; width: 100% !important; margin: 12px 0 !important; font-size: 0.85rem !important; }
                .quill-content-display table th, .quill-content-display table td { border: 1px solid #cbd5e1 !important; padding: 8px 12px !important; text-align: left !important; }
                .quill-content-display table th { background-color: #f8fafc !important; font-weight: 700 !important; color: #0f172a !important; }
                .quill-content-display table tr:nth-child(even) { background-color: #f8fafc !important; }
            `}} />

            {/* COMPREHENSIVE FULL DETAILS MODAL POPUP */}
            {viewingLogDetails && createPortal(
                <div className="lfm-overlay" onClick={() => setViewingLogDetails(null)} style={{ zIndex: 999999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <FileText size={18} /> Workplace Log Details & Revision History
                            </h2>
                            <button className="lfm-close-btn" onClick={() => setViewingLogDetails(null)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="lfm-body" style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{ background: MIDNIGHT, width: 40, height: 40, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                                        <Calendar size={20} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, color: MIDNIGHT, fontSize: '1.1rem' }}>
                                            {moment(viewingLogDetails.dateString).format('dddd, DD MMMM YYYY')}
                                        </div>
                                        <div style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Clock size={12} /> {viewingLogDetails.startTime} - {viewingLogDetails.endTime} ({viewingLogDetails.totalHours} hrs)
                                        </div>
                                    </div>
                                </div>
                                {viewingLogDetails.isQctoAligned && (
                                    <div style={{ textTransform: 'uppercase', textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 700 }}>Curriculum Alignment</div>
                                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: MIDNIGHT }}>{viewingLogDetails.workActivityCode}</div>
                                    </div>
                                )}
                            </div>

                            {/* QCTO Alignment */}
                            {viewingLogDetails.isQctoAligned && (
                                <div style={{ marginTop: '-1rem' }}>
                                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                        <div style={{ color: MIDNIGHT, fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>
                                            {viewingLogDetails.workActivityCode}: {viewingLogDetails.workActivityLabel}
                                        </div>
                                        <div style={{ color: '#475569', fontSize: '0.85rem' }}>
                                            <strong>Module:</strong> {viewingLogDetails.moduleName}
                                        </div>
                                        <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '4px' }}>
                                            <strong>Topic:</strong> {viewingLogDetails.topicTitle}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* MODAL TIMELINE ENGINE */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                {logVersions.map((version: any, idx: number) => {
                                    const isLatest = idx === 0;
                                    const versionNumber = logVersions.length - idx;

                                    return (
                                        <div key={version.updatedAt || idx} style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--mlab-border)' }}>
                                            <div style={{ position: 'absolute', left: '-8px', top: '0px', width: '14px', height: '14px', borderRadius: '50%', background: isLatest ? 'var(--mlab-blue)' : '#cbd5e1', border: '3px solid white' }} />

                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                                <h3 style={{ margin: 0, fontSize: '1.05rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    Version {versionNumber}
                                                    {isLatest && <span style={{ fontSize: '0.7rem', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', fontWeight: 700 }}>Latest</span>}
                                                </h3>

                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {version.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
                                                    {version.status === 'Pending_Mentor_Approval' && <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Pending Review</span>}
                                                    {version.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>Approved</span>}
                                                    {version.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}>Rejected</span>}
                                                </div>
                                            </div>

                                            <div style={{ marginBottom: '1rem' }}>
                                                <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Tasks Performed</h4>
                                                <div
                                                    style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', color: '#334155', fontSize: '0.9rem', lineHeight: 1.6 }}
                                                    className="quill-content-display"
                                                    dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }}
                                                />
                                            </div>

                                            {version.evidenceUrl && (
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Attached Evidence</h4>
                                                    <div style={{ padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '8px', background: '#f8fafc' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
                                                            <a
                                                                href={version.evidenceUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1' }}
                                                            >
                                                                <ExternalLink size={12} /> Open File in Full Tab
                                                            </a>
                                                        </div>
                                                        <div style={{ width: '100%', minHeight: '250px', background: 'white', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                            {isImageFile(version.evidenceUrl) ? (
                                                                <img src={version.evidenceUrl} alt={`Evidence for Version ${versionNumber}`} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
                                                            ) : (
                                                                <iframe src={version.evidenceUrl} title={`Evidence Frame ${versionNumber}`} style={{ width: '100%', height: '350px', border: 'none' }} />
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {version.rejectionReason && version.status !== 'Approved' && (
                                                <div style={{ background: version.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${version.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '14px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                    <AlertTriangle size={18} color={version.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                                    <div style={{ width: '100%' }}>
                                                        <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: version.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>
                                                            {version.status === 'Rejected' ? "Mentor's Correction Notice" : "Resolved Revision Notes"}
                                                        </strong>
                                                        <div
                                                            className="quill-content-display"
                                                            style={{ color: version.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.9rem', lineHeight: 1.5 }}
                                                            dangerouslySetInnerHTML={{ __html: version.rejectionReason }}
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                        </div>
                        <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)' }}>
                            <button className="mlab-btn mlab-btn--ghost" onClick={() => setViewingLogDetails(null)}>Close Window</button>
                            {['Draft', 'Rejected'].includes(viewingLogDetails.status) && (
                                <button
                                    onClick={() => {
                                        setViewingLogDetails(null);
                                        onOpenLogModal(viewingLogDetails);
                                    }}
                                    className="mlab-btn mlab-btn--primary"
                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}
                                >
                                    <Pencil size={14} /> Edit &amp; Resubmit
                                </button>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── HEADER ── */}
            <div className="ld-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h2 className="ld-section-title"><CalendarCheck size={20} /> Compliance &amp; Attendance</h2>
                        <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', margin: '4px 0 0 28px' }}>
                            A complete history of your daily campus check-ins and workplace logbook entries.
                        </p>
                    </div>
                    {learnerHasEmployer && (
                        <button
                            className="mlab-btn mlab-btn--primary"
                            onClick={() => onOpenLogModal()}
                            style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
                        >
                            <Plus size={16} /> Add Logbook Entry
                        </button>
                    )}
                </div>
            </div>

            {/* ── UNIFIED TABS ── */}
            <div className="lfm-tabs" style={{ marginBottom: 0 }}>
                <button className={`lfm-tab ${activeTab === 'campus' ? 'active' : ''}`} onClick={() => setActiveTab('campus')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}><CalendarCheck size={16} /> Campus Attendance</button>
                {/* <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}><Briefcase size={16} /> Workplace Logbook</button> */}
                {learnerHasEmployer && (
                    <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')}>
                        <Briefcase size={16} /> Workplace Logbook
                    </button>
                )}
            </div>

            {/* ════ CAMPUS ATTENDANCE VIEW ════ */}
            {activeTab === 'campus' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* STATS ROW */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid ${GREEN}` }}>
                            <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Class Attendance Ratio</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: MIDNIGHT }}>{stats.ratio}</div>
                        </div>
                        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid ${MIDNIGHT}` }}>
                            <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Tracked Sessions</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: MIDNIGHT }}>{stats.total}</div>
                        </div>
                        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid #16a34a` }}>
                            <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Days Present</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a' }}>{stats.presentCount}</div>
                        </div>
                        <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid #dc2626` }}>
                            <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Days Absent</div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{stats.absentCount}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', marginRight: 16, alignItems: 'center' }}>
                                <Layers size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px 0 32px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Registered Classes</option>
                                    {uniqueLedgerCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
                                    <Calendar size={16} color="var(--mlab-grey)" />
                                    <select value={dateFilterMode} onChange={(e) => { setDateFilterMode(e.target.value as any); setDateSearch(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-grey)', fontWeight: 600, fontSize: '0.8rem', padding: '0 4px', cursor: 'pointer', textTransform: 'uppercase' }}>
                                        <option value="month">Month</option>
                                        <option value="week">Week</option>
                                        <option value="date">Day</option>
                                    </select>
                                </div>
                                <div style={{ width: '1px', height: '20px', background: 'var(--mlab-border)', margin: '0 6px' }} />
                                <input type={dateFilterMode} value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '4px', paddingRight: dateSearch ? '30px' : '12px' }} />
                                {dateSearch && <button className="ld-clear-btn" onClick={() => setDateSearch('')}><XCircle size={14} /></button>}
                            </div>
                        </div>

                        <div className="ld-filter-chips">
                            <button className={`ld-filter-chip ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>All Statuses</button>
                            <button className={`ld-filter-chip ${filterStatus === 'present' ? 'active' : ''}`} onClick={() => setFilterStatus('present')}>Present Only</button>
                            <button className={`ld-filter-chip ${filterStatus === 'absent' ? 'active' : ''}`} onClick={() => setFilterStatus('absent')}>Absent Only</button>
                        </div>
                    </div>

                    <div className="mlab-table-wrap" style={{ border: '1px solid var(--mlab-border)', borderRadius: '12px', background: 'white' }}>
                        <table className="mlab-table">
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Enrolled Cohort</th>
                                    <th>Status</th>
                                    <th>Check In</th>
                                    <th>Lunch Out</th>
                                    <th>Lunch In</th>
                                    <th>Check Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finalFilteredDisplayLedger.map((record, idx) => (
                                    <tr key={idx} style={{ background: record.type === 'absent' ? '#fef2f2' : 'white' }}>
                                        <td><strong style={{ color: MIDNIGHT }}>{moment(record.dateObj).format('ddd, DD MMM YYYY')}</strong></td>
                                        <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: MIDNIGHT, letterSpacing: '0.02em' }}>{record.cohortName}</span></td>
                                        <td>
                                            {record.type === 'present' ? (
                                                <span className="ld-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={10} /> Present</span>
                                            ) : (
                                                <span className="ld-badge" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}><AlertTriangle size={10} /> Absent</span>
                                            )}
                                        </td>
                                        {record.type === 'absent' ? (
                                            <td colSpan={4} style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '0.85rem' }}>No scans recorded for this session. A compliance deduction penalty has been applied.</td>
                                        ) : (
                                            <>
                                                <td>{record.checkInAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#16a34a" /> {moment(record.checkInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.lunchOutAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchOutAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.lunchInAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.checkOutAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#dc2626" style={{ transform: 'rotate(180deg)' }} /> {moment(record.checkOutAt).format('HH:mm')}</span> : <span className="ld-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '2px 6px', fontSize: '0.7rem' }}>Missed</span>}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════ WORKPLACE LOGS VIEW ════ */}
            {activeTab === 'workplace' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* STATS HERO */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                        
                        <div style={{ display: 'flex', gap: '1rem', background: '#f0fdf4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #bbf7d0', alignItems: 'center' }}>
                            <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '50%' }}>
                                <CheckCircle size={28} color="#166534" />
                            </div>
                            <div>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Mentor Hours</p>
                                <h3 style={{ margin: '4px 0 0', color: '#14532d', fontSize: '2rem' }}>
                                    {totalWorkplaceHours.toFixed(1)} <span style={{ fontSize: '1rem', color: '#15803d' }}>Hours Approved</span>
                                </h3>
                            </div>
                        </div>

                        {/* MONTHLY EARNED STIPEND CARD */}
                        <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', alignItems: 'center' }}>
                            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '50%' }}>
                                <Landmark size={28} color="var(--mlab-midnight)" />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earned This Month</p>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: stats.currentMonthEarnedStipend < stats.baseStipendUsed ? '#dc2626' : '#16a34a' }}>
                                        {stats.currentMonthApprovedDays} / {stats.expectedWorkingDaysThisMonth} Days Logged
                                    </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '4px 0 0' }}>
                                    <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', fontSize: '2rem' }}>
                                        {isStipendLoading ? (
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1.2rem', color: '#64748b' }}>
                                                <Loader2 size={16} className="animate-spin" /> Verifying...
                                            </span>
                                        ) : formatCurrency(stats.currentMonthEarnedStipend)}
                                    </h3>
                                    {!isStipendLoading && stats.currentMonthEarnedStipend < stats.baseStipendUsed && (
                                        <span style={{ fontSize: '0.9rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                                            {formatCurrency(stats.baseStipendUsed)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* WORKPLACE FILTERS BAR */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', flex: 1, minWidth: '220px', alignItems: 'center' }}>
                                <Search size={16} style={{ marginLeft: '12px', color: 'var(--mlab-grey)' }} />
                                <input type="text" placeholder="Search tasks, codes, or topics..." value={wpSearch} onChange={(e) => setWpSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '8px' }} />
                                {wpSearch && <button className="ld-clear-btn" onClick={() => setWpSearch('')}><XCircle size={14} /></button>}
                            </div>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '150px', alignItems: 'center' }}>
                                <Calendar size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={wpMonthFilter} onChange={(e) => setWpMonthFilter(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Months</option>
                                    {wpAvailableMonths.map(month => <option key={month} value={month}>{moment(month, 'YYYY-MM').format('MMMM YYYY')}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="ld-filter-chips">
                            <button className={`ld-filter-chip ${wpStatusFilter === 'all' ? 'active' : ''}`} onClick={() => setWpStatusFilter('all')}>All</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Draft' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Draft')}>Drafts</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Pending_Mentor_Approval' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Pending_Mentor_Approval')}>Pending</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Approved' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Approved')}>Approved</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Rejected' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Rejected')}>Rejected</button>
                        </div>
                    </div>

                    {/* MONTHLY ACCORDION FEED */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {Object.keys(filteredAndGroupedWpLogs).length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)' }}>
                                <History size={48} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>No Entries Found</h3>
                                <p style={{ color: 'var(--mlab-grey)', margin: 0, fontSize: '0.9rem' }}>No logs match your current metrics.</p>
                            </div>
                        ) : (
                            Object.keys(filteredAndGroupedWpLogs).map(monthLabel => {
                                const monthLogs = filteredAndGroupedWpLogs[monthLabel];
                                const isOpen = expandedWpMonths.has(monthLabel);
                                const totalMonthHours = monthLogs.reduce((sum: number, log: any) => sum + (Number(log.totalHours) || 0), 0);

                                return (
                                    <div key={monthLabel} style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>

                                        <div onClick={() => toggleWpMonthAccordion(monthLabel)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid var(--mlab-border)' : 'none', cursor: 'pointer' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: 'var(--mlab-blue-light)', padding: '8px', borderRadius: '8px', width: 35, height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <Calendar size={18} color={'white'} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{monthLabel}</h3>
                                                    <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{monthLogs.length} Entry(s)</span>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Clock size={12} /> {totalMonthHours.toFixed(1)} hrs
                                                </div>
                                                {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                                            </div>
                                        </div>

                                        {isOpen && (
                                            <div style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: '1rem', background: '#fafbfc' }}>
                                                {monthLogs.map((log: any) => {
                                                    const entryVersions = log.history && log.history.length > 0
                                                        ? [...log.history, log].sort((a: any, b: any) => {
                                                            const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                                                            const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                                                            return timeB - timeA; 
                                                        })
                                                        : [log];

                                                    return (
                                                        <div key={log.id} style={{ background: 'white', border: `1px solid ${log.status === 'Rejected' ? '#fecaca' : 'var(--mlab-border)'}`, borderRadius: '8px', padding: '1.25rem' }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                                                <div>
                                                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: MIDNIGHT, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        {moment(log.dateString).format('dddd, DD MMM YYYY')}
                                                                        {log.evidenceUrl && (
                                                                            <span title="Supporting evidence attached" style={{ display: 'inline-flex' }}>
                                                                                <Paperclip size={13} color="var(--mlab-blue)" />
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 600 }}>
                                                                        <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: '#ea580c' }}>({log.totalHours} hrs)</span>
                                                                    </div>
                                                                </div>

                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    {log.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}><FileText size={12} /> Draft</span>}

                                                                    {log.status === 'Pending_Mentor_Approval' && (
                                                                        <>
                                                                            <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}><Clock size={12} /> Pending</span>
                                                                            {log.rejectionReason && <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #c7d2fe' }}><History size={12} /> Resubmitted (v2)</span>}
                                                                        </>
                                                                    )}

                                                                    {log.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Approved</span>}
                                                                    {log.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}><XCircle size={12} /> Rejected</span>}

                                                                    {['Draft', 'Rejected'].includes(log.status) && (
                                                                        <button onClick={() => onOpenLogModal(log)} style={{ background: log.status === 'Rejected' ? '#fef2f2' : 'var(--mlab-blue-light)', border: `1px solid ${log.status === 'Rejected' ? '#fca5a5' : 'transparent'}`, padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: log.status === 'Rejected' ? '#be123c' : 'var(--mlab-blue)' }}><Pencil size={11} /> {log.status === 'Rejected' ? 'Fix & Resubmit' : 'Resume'}</button>
                                                                    )}

                                                                    <button onClick={() => setViewingLogDetails(log)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#475569' }}><Maximize2 size={11} /> View Details</button>
                                                                </div>
                                                            </div>

                                                            {log.isQctoAligned && (
                                                                <div style={{ fontSize: '0.85rem', color: '#0369a1', background: '#e0f2fe', padding: '6px 12px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '1rem', fontWeight: 600, border: '1px dashed #7dd3fc' }}><BookOpen size={14} /> {log.workActivityCode}: {log.workActivityLabel}</div>
                                                            )}

                                                            {log.history && log.history.length > 0 && (
                                                                <div style={{ marginBottom: '12px' }}>
                                                                    <button
                                                                        onClick={() => toggleHistoryAccordion(log.id)}
                                                                        style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                                                                    >
                                                                        <History size={12} /> {expandedHistoryIds.has(log.id) ? "Hide Full Audit History" : `View Full Audit History Trail (${entryVersions.length} Versions)`}
                                                                    </button>

                                                                    {expandedHistoryIds.has(log.id) && (
                                                                        <div className="animate-fade-in" style={{ padding: '16px 12px 12px 12px', background: '#fafbfc', borderRadius: '8px', marginTop: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                                                            {entryVersions.map((hist: any, hIdx: number) => {
                                                                                const isLatest = hIdx === 0;
                                                                                const versionNumber = entryVersions.length - hIdx;

                                                                                return (
                                                                                    <div key={hist.updatedAt || hIdx} style={{ position: 'relative', paddingLeft: '16px', borderLeft: '2px solid #cbd5e1' }}>
                                                                                        <div style={{ position: 'absolute', left: '-7px', top: '0px', width: '12px', height: '12px', borderRadius: '50%', background: isLatest ? 'var(--mlab-blue)' : '#94a3b8', border: '2px solid white' }} />

                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                                                            <div style={{ fontWeight: 700, color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                                                                                                Version {versionNumber}
                                                                                                <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--mlab-grey)' }}>({moment(hist.updatedAt).format('DD MMM YYYY')})</span>
                                                                                                {isLatest && <span style={{ fontSize: '0.65rem', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>Latest</span>}
                                                                                            </div>

                                                                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                                                                {hist.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
                                                                                                {hist.status === 'Pending_Mentor_Approval' && <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Pending Review</span>}
                                                                                                {hist.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>Approved</span>}
                                                                                                {hist.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}>Rejected</span>}
                                                                                            </div>
                                                                                        </div>

                                                                                        <div className="quill-content-display" dangerouslySetInnerHTML={{ __html: hist.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }} style={{ background: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.85rem' }} />

                                                                                        {hist.evidenceUrl && (
                                                                                            <div style={{ marginTop: '8px' }}>
                                                                                                <a href={hist.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1' }}>
                                                                                                    <ExternalLink size={12} /> View Evidence Attachment
                                                                                                </a>
                                                                                            </div>
                                                                                        )}

                                                                                        {hist.rejectionReason && hist.status !== 'Approved' && (
                                                                                            <div style={{ background: hist.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${hist.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '10px 14px', borderRadius: '6px', marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                                                                <AlertTriangle size={14} color={hist.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                                                                                <div style={{ width: '100%' }}>
                                                                                                    <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: hist.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '2px' }}>
                                                                                                        {hist.status === 'Rejected' ? "Mentor's Correction Notice" : "Resolved Revision Notes"}
                                                                                                    </strong>
                                                                                                    <div className="quill-content-display" style={{ color: hist.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.8rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: hist.rejectionReason }} />
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {!expandedHistoryIds.has(log.id) && (
                                                                <>
                                                                    {log.rejectionReason && log.status !== 'Approved' && (
                                                                        <div style={{ background: log.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${log.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '10px 14px', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                                                            <AlertTriangle size={16} color={log.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
                                                                            <div style={{ width: '100%' }}>
                                                                                <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: log.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '2px' }}>
                                                                                    {log.status === 'Rejected' ? "Mentor's Note" : "Previous Revision History Notes"}
                                                                                </strong>
                                                                                <div
                                                                                    className="quill-content-display"
                                                                                    style={{ color: log.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.85rem', lineHeight: 1.5 }}
                                                                                    dangerouslySetInnerHTML={{ __html: log.rejectionReason }}
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div
                                                                        style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #cbd5e1', maxHeight: '150px', overflow: 'hidden' }}
                                                                        className="quill-content-display"
                                                                        dangerouslySetInnerHTML={{ __html: log.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">Empty entry description text...</span>' }}
                                                                    />

                                                                    {log.evidenceUrl && (
                                                                        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                                <button onClick={() => setPreviewEvidenceId(previewEvidenceId === log.id ? null : log.id)} style={{ background: 'var(--mlab-blue-light)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                                                                                    {previewEvidenceId === log.id ? <EyeOff size={14} /> : <Eye size={14} />}
                                                                                    {previewEvidenceId === log.id ? 'Close Preview' : 'Preview Evidence'}
                                                                                </button>
                                                                                <a href={log.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '5px 12px', borderRadius: '6px', textDecoration: 'none', border: '1px solid #cbd5e1' }}><ExternalLink size={14} /> Open Full View</a>
                                                                            </div>

                                                                            {previewEvidenceId === log.id && (
                                                                                <div className="animate-fade-in" style={{ padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '8px', background: '#f8fafc', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
                                                                                    {isImageFile(log.evidenceUrl) ? (
                                                                                        <img src={log.evidenceUrl} alt="Evidence Render inline" style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain' }} />
                                                                                    ) : (
                                                                                        <iframe src={log.evidenceUrl} title="Evidence Preview Frame" style={{ width: '100%', height: '350px', border: 'none', background: 'white' }} />
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// // src/pages/LearnerPortal/LearnerAttendanceView/LearnerAttendanceView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     CalendarCheck, Clock, CheckCircle, AlertTriangle, Calendar, XCircle,
//     ArrowDownToLine, BookOpen, Layers, Briefcase, Plus, History, Bug,
//     FileText, Pencil, Search, Filter, ChevronDown, ChevronUp, Link as LinkIcon,
//     Eye, EyeOff, ExternalLink, Maximize2, X, Paperclip
// } from 'lucide-react';
// import moment from 'moment';

// import './LearnerAttendanceView.css';

// const MIDNIGHT = '#073f4e';
// const GREEN = '#94c73d';

// interface AbsenceRecord {
//     date: string;
//     cohortId?: string;
//     cohortName?: string;
// }

// interface LearnerAttendanceViewProps {
//     formattedScanHistory: any[];
//     absenceDates: AbsenceRecord[];
//     attendancePercentage: string;
//     cohorts: any[];
//     workplaceLogs: any[];
//     learnerHasEmployer: boolean;
//     onOpenLogModal: (log?: any) => void;
// }

// export const LearnerAttendanceView: React.FC<LearnerAttendanceViewProps> = ({
//     formattedScanHistory = [],
//     absenceDates = [],
//     attendancePercentage = "100%",
//     cohorts = [],
//     workplaceLogs = [],
//     learnerHasEmployer = false,
//     onOpenLogModal
// }) => {
//     // ─── REAL-TIME DIAGNOSTIC DEBUGNER BLOCK ───
//     useEffect(() => {
//         console.group("🔍 [Compliance Hub Debugger]");
//         console.log("👤 PROP: learnerHasEmployer =", learnerHasEmployer);
//         console.log("💼 PROP: workplaceLogs count =", workplaceLogs.length);
//         console.groupEnd();
//     }, [learnerHasEmployer, workplaceLogs, cohorts, absenceDates, formattedScanHistory]);

//     // ─── INTERNAL TAB STATE ───
//     const [activeTab, setActiveTab] = useState<'campus' | 'workplace'>('campus');

//     // ─── CAMPUS ATTENDANCE STATE ───
//     const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
//     const [selectedCohortId, setSelectedCohortId] = useState<string>('all');
//     const [dateFilterMode, setDateFilterMode] = useState<'month' | 'week' | 'date'>('month');
//     const [dateSearch, setDateSearch] = useState('');

//     // ─── WORKPLACE LOGS FILTER & ACCORDION STATE ───
//     const [wpSearch, setWpSearch] = useState('');
//     const [wpStatusFilter, setWpStatusFilter] = useState<string>('all');
//     const [wpMonthFilter, setWpMonthFilter] = useState<string>('all');
//     const [expandedWpMonths, setExpandedWpMonths] = useState<Set<string>>(new Set());

//     const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);
//     const [viewingLogDetails, setViewingLogDetails] = useState<any | null>(null);
//     const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

//     // 🚀 ROBUST IMAGE DETECTOR
//     const isImageFile = (url: string) => {
//         if (!url) return false;
//         return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url) ||
//             url.toLowerCase().includes('.png') ||
//             url.toLowerCase().includes('.jpg') ||
//             url.toLowerCase().includes('.jpeg');
//     };

//     // ─── 1. CAMPUS LEDGER COMPUTATION ───
//     const combinedLedger = useMemo(() => {
//         const presentRecords = formattedScanHistory.map(scan => {
//             const matchedCohort = cohorts.find(c => c.id === scan.cohortId);
//             return {
//                 ...scan,
//                 type: 'present',
//                 dateObj: new Date(scan.dateString),
//                 cohortId: scan.cohortId || '',
//                 cohortName: matchedCohort ? matchedCohort.name : (scan.cohortName || 'General Campus Session')
//             };
//         });

//         const absentRecords = absenceDates.map(item => {
//             const dateStr = typeof item === 'string' ? item : item.date;
//             const cName = typeof item === 'string' ? 'Unknown Class' : (item.cohortName || 'Unknown Class');
//             const matchedCohort = cohorts.find(c => c.name === cName || c.id === item.cohortId);
//             return {
//                 dateString: dateStr,
//                 type: 'absent',
//                 dateObj: new Date(dateStr),
//                 cohortId: matchedCohort ? matchedCohort.id : (item.cohortId || ''),
//                 cohortName: cName
//             };
//         });

//         return [...presentRecords, ...absentRecords].sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
//     }, [formattedScanHistory, absenceDates, cohorts]);

//     const uniqueLedgerCohorts = useMemo(() => {
//         const seen = new Set<string>();
//         const list: { id: string; name: string }[] = [];
//         combinedLedger.forEach(record => {
//             const idKey = record.cohortId || record.cohortName;
//             if (idKey && !seen.has(idKey)) {
//                 seen.add(idKey);
//                 list.push({ id: idKey, name: record.cohortName });
//             }
//         });
//         return list;
//     }, [combinedLedger]);

//     const cohortFilteredLedger = useMemo(() => {
//         return combinedLedger.filter(record => {
//             if (selectedCohortId === 'all') return true;
//             return record.cohortId === selectedCohortId || record.cohortName === selectedCohortId;
//         });
//     }, [combinedLedger, selectedCohortId]);

//     const stats = useMemo(() => {
//         const presentCount = cohortFilteredLedger.filter(r => r.type === 'present').length;
//         const absentCount = cohortFilteredLedger.filter(r => r.type === 'absent').length;
//         const total = presentCount + absentCount;
//         const ratio = total === 0 ? "100%" : Math.round((presentCount / total) * 100) + "%";
//         return { total, presentCount, absentCount, ratio };
//     }, [cohortFilteredLedger]);

//     const finalFilteredDisplayLedger = useMemo(() => {
//         return cohortFilteredLedger.filter(record => {
//             if (filterStatus !== 'all' && record.type !== filterStatus) return false;
//             if (dateSearch) {
//                 if (dateFilterMode === 'month' && moment(record.dateObj).format('YYYY-MM') !== dateSearch) return false;
//                 if (dateFilterMode === 'week' && moment(record.dateObj).format('YYYY-[W]WW') !== dateSearch) return false;
//                 if (dateFilterMode === 'date' && moment(record.dateObj).format('YYYY-MM-DD') !== dateSearch) return false;
//             }
//             return true;
//         });
//     }, [cohortFilteredLedger, filterStatus, dateFilterMode, dateSearch]);


//     // ─── 2. WORKPLACE LOGS COMPUTATION & GROUPING ───

//     const wpAvailableMonths = useMemo(() => {
//         const months = new Set<string>();
//         workplaceLogs.forEach(log => {
//             if (log.dateString) months.add(moment(log.dateString).format('YYYY-MM'));
//         });
//         return Array.from(months).sort((a, b) => b.localeCompare(a));
//     }, [workplaceLogs]);

//     const totalWorkplaceHours = useMemo(() => {
//         return workplaceLogs
//             .filter(log => log.status === 'Approved')
//             .reduce((sum, log) => sum + (Number(log.totalHours) || 0), 0);
//     }, [workplaceLogs]);

//     const hasActiveWpFilters = wpSearch.trim() !== '' || wpStatusFilter !== 'all' || wpMonthFilter !== 'all';

//     const filteredAndGroupedWpLogs = useMemo(() => {
//         const filtered = workplaceLogs.filter(log => {
//             if (wpStatusFilter !== 'all' && log.status !== wpStatusFilter) return false;
//             if (wpMonthFilter !== 'all' && !log.dateString?.startsWith(wpMonthFilter)) return false;

//             if (wpSearch.trim()) {
//                 const term = wpSearch.toLowerCase();
//                 const matchesSearch =
//                     log.tasksPerformed?.toLowerCase().includes(term) ||
//                     log.workActivityCode?.toLowerCase().includes(term) ||
//                     log.workActivityLabel?.toLowerCase().includes(term) ||
//                     log.topicTitle?.toLowerCase().includes(term);
//                 if (!matchesSearch) return false;
//             }
//             return true;
//         }).sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime());

//         const groups: Record<string, any[]> = {};
//         filtered.forEach(log => {
//             const monthYear = moment(log.dateString).format('MMMM YYYY');
//             if (!groups[monthYear]) {
//                 groups[monthYear] = [];
//             }
//             groups[monthYear].push(log);
//         });

//         return groups;
//     }, [workplaceLogs, wpStatusFilter, wpMonthFilter, wpSearch]);

//     useEffect(() => {
//         const months = Object.keys(filteredAndGroupedWpLogs);
//         if (months.length > 0) {
//             if (hasActiveWpFilters) {
//                 setExpandedWpMonths(new Set(months));
//             } else if (expandedWpMonths.size === 0) {
//                 setExpandedWpMonths(new Set([months[0]]));
//             }
//         }
//     }, [filteredAndGroupedWpLogs, hasActiveWpFilters]);

//     const toggleWpMonthAccordion = (monthLabel: string) => {
//         setExpandedWpMonths(prev => {
//             const next = new Set(prev);
//             if (next.has(monthLabel)) next.delete(monthLabel);
//             else next.add(monthLabel);
//             return next;
//         });
//     };

//     const toggleHistoryAccordion = (logId: string) => {
//         setExpandedHistoryIds(prev => {
//             const next = new Set(prev);
//             if (next.has(logId)) next.delete(logId); else next.add(logId);
//             return next;
//         });
//     };

//     // 🚀 FIXED FOR MODAL: Explictly sorts by time to absolutely guarantee newest is at top (Index 0)
//     const logVersions = useMemo(() => {
//         if (!viewingLogDetails) return [];
//         if (viewingLogDetails.history && viewingLogDetails.history.length > 0) {
//             return [...viewingLogDetails.history, viewingLogDetails].sort((a, b) => {
//                 const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
//                 const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
//                 return timeB - timeA; // Descending (Newest First)
//             });
//         }
//         return [viewingLogDetails];
//     }, [viewingLogDetails]);

//     return (
//         <div className="ld-animate" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//             <style dangerouslySetInnerHTML={{
//                 __html: `
//                 .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
//                 .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
//                 .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
//                 .quill-content-display li { margin-bottom: 4px !important; }
                
//                 .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; transition: color 0.15s ease !important; }
//                 .quill-content-display a:hover { color: #1d4ed8 !important; }
//                 .quill-content-display code { background-color: #f1f5f9 !important; color: #0f172a !important; padding: 3px 6px !important; borderRadius: 4px !important; font-family: monospace !important; font-size: 0.85em !important; }
//                 .quill-content-display pre { background-color: #1e293b !important; color: #f8fafc !important; padding: 12px 16px !important; borderRadius: 6px !important; font-family: monospace !important; font-size: 0.85rem !important; line-height: 1.5 !important; overflow-x: auto !important; margin: 10px 0 !important; border: 1px solid #334155 !important; white-space: pre-wrap !important; }
//                 .quill-content-display blockquote { border-left: 4px solid #94a3b8 !important; padding-left: 12px !important; margin: 12px 0 !important; color: #475569 !important; font-style: italic !important; }
//                 .quill-content-display table { border-collapse: collapse !important; width: 100% !important; margin: 12px 0 !important; font-size: 0.85rem !important; }
//                 .quill-content-display table th, .quill-content-display table td { border: 1px solid #cbd5e1 !important; padding: 8px 12px !important; text-align: left !important; }
//                 .quill-content-display table th { background-color: #f8fafc !important; font-weight: 700 !important; color: #0f172a !important; }
//                 .quill-content-display table tr:nth-child(even) { background-color: #f8fafc !important; }
//             `}} />

//             {/* COMPREHENSIVE FULL DETAILS MODAL POPUP */}
//             {viewingLogDetails && createPortal(
//                 <div className="lfm-overlay" onClick={() => setViewingLogDetails(null)} style={{ zIndex: 999999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                 <FileText size={18} /> Workplace Log Details & Revision History
//                             </h2>
//                             <button className="lfm-close-btn" onClick={() => setViewingLogDetails(null)}><X size={20} /></button>
//                         </div>

//                         <div className="lfm-body" style={{ overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

//                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                     <div style={{ background: MIDNIGHT, width: 40, height: 40, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
//                                         <Calendar size={20} />
//                                     </div>
//                                     <div>
//                                         <div style={{ fontWeight: 700, color: MIDNIGHT, fontSize: '1.1rem' }}>{moment(viewingLogDetails.dateString).format('dddd, DD MMMM YYYY')}</div>
//                                         <div style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Clock size={12} /> {viewingLogDetails.startTime} - {viewingLogDetails.endTime} ({viewingLogDetails.totalHours} hrs)
//                                         </div>
//                                     </div>
//                                 </div>
//                                 {viewingLogDetails.isQctoAligned && (
//                                     <div style={{ textAlign: 'right' }}>
//                                         <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', fontWeight: 700 }}>Curriculum Alignment</div>
//                                         <div style={{ fontSize: '0.85rem', fontWeight: 600, color: MIDNIGHT }}>{viewingLogDetails.workActivityCode}</div>
//                                     </div>
//                                 )}
//                             </div>

//                             {/* QCTO Alignment */}
//                             {viewingLogDetails.isQctoAligned && (
//                                 <div style={{ marginTop: '-1rem' }}>
//                                     <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
//                                         <div style={{ color: MIDNIGHT, fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>
//                                             {viewingLogDetails.workActivityCode}: {viewingLogDetails.workActivityLabel}
//                                         </div>
//                                         <div style={{ color: '#475569', fontSize: '0.85rem' }}>
//                                             <strong>Module:</strong> {viewingLogDetails.moduleName}
//                                         </div>
//                                         <div style={{ color: '#475569', fontSize: '0.85rem', marginTop: '4px' }}>
//                                             <strong>Topic:</strong> {viewingLogDetails.topicTitle}
//                                         </div>
//                                     </div>
//                                 </div>
//                             )}

//                             {/* 🚀 MODAL TIMELINE ENGINE: EXPLICIT TIMESTAMP SORT */}
//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
//                                 {logVersions.map((version: any, idx: number) => {
//                                     const isLatest = idx === 0;
//                                     const versionNumber = logVersions.length - idx;

//                                     return (
//                                         <div key={version.updatedAt || idx} style={{ position: 'relative', paddingLeft: '20px', borderLeft: '2px solid var(--mlab-border)' }}>
//                                             <div style={{ position: 'absolute', left: '-8px', top: '0px', width: '14px', height: '14px', borderRadius: '50%', background: isLatest ? 'var(--mlab-blue)' : '#cbd5e1', border: '3px solid white' }} />

//                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
//                                                 <h3 style={{ margin: 0, fontSize: '1.05rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                     Version {versionNumber}
//                                                     {isLatest && <span style={{ fontSize: '0.7rem', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase', fontWeight: 700 }}>Latest</span>}
//                                                 </h3>

//                                                 <div style={{ display: 'flex', gap: '4px' }}>
//                                                     {version.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
//                                                     {version.status === 'Pending_Mentor_Approval' && <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Pending Review</span>}
//                                                     {version.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>Approved</span>}
//                                                     {version.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}>Rejected</span>}
//                                                 </div>
//                                             </div>

//                                             <div style={{ marginBottom: '1rem' }}>
//                                                 <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Tasks Performed</h4>
//                                                 <div
//                                                     style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--mlab-border)', color: '#334155', fontSize: '0.9rem', lineHeight: 1.6 }}
//                                                     className="quill-content-display"
//                                                     dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }}
//                                                 />
//                                             </div>

//                                             {version.evidenceUrl && (
//                                                 <div style={{ marginBottom: '1rem' }}>
//                                                     <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--mlab-grey)', margin: '0 0 8px 0', letterSpacing: '0.05em' }}>Attached Evidence</h4>
//                                                     <div style={{ padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '8px', background: '#f8fafc' }}>
//                                                         <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
//                                                             <a
//                                                                 href={version.evidenceUrl}
//                                                                 target="_blank"
//                                                                 rel="noopener noreferrer"
//                                                                 style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1' }}
//                                                             >
//                                                                 <ExternalLink size={12} /> Open File in Full Tab
//                                                             </a>
//                                                         </div>
//                                                         <div style={{ width: '100%', minHeight: '250px', background: 'white', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
//                                                             {isImageFile(version.evidenceUrl) ? (
//                                                                 <img src={version.evidenceUrl} alt={`Evidence for Version ${versionNumber}`} style={{ maxWidth: '100%', maxHeight: '400px', objectFit: 'contain' }} />
//                                                             ) : (
//                                                                 <iframe src={version.evidenceUrl} title={`Evidence Frame ${versionNumber}`} style={{ width: '100%', height: '350px', border: 'none' }} />
//                                                             )}
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                             )}

//                                             {/* Hide rejection notes if the iteration was explicitly approved */}
//                                             {version.rejectionReason && version.status !== 'Approved' && (
//                                                 <div style={{ background: version.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${version.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '14px', borderRadius: '8px', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                                     <AlertTriangle size={18} color={version.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
//                                                     <div style={{ width: '100%' }}>
//                                                         <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: version.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '4px', letterSpacing: '0.05em' }}>
//                                                             {version.status === 'Rejected' ? "Mentor's Correction Notice" : "Resolved Revision Notes"}
//                                                         </strong>
//                                                         <div
//                                                             className="quill-content-display"
//                                                             style={{ color: version.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.9rem', lineHeight: 1.5 }}
//                                                             dangerouslySetInnerHTML={{ __html: version.rejectionReason }}
//                                                         />
//                                                     </div>
//                                                 </div>
//                                             )}
//                                         </div>
//                                     );
//                                 })}
//                             </div>

//                         </div>
//                         <div className="lfm-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '1rem 1.5rem', background: '#f8fafc', borderTop: '1px solid var(--mlab-border)' }}>
//                             <button className="mlab-btn mlab-btn--ghost" onClick={() => setViewingLogDetails(null)}>Close Window</button>
//                             {['Draft', 'Rejected'].includes(viewingLogDetails.status) && (
//                                 <button
//                                     onClick={() => {
//                                         setViewingLogDetails(null);
//                                         onOpenLogModal(viewingLogDetails);
//                                     }}
//                                     className="mlab-btn mlab-btn--primary"
//                                     style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '10px' }}
//                                 >
//                                     <Pencil size={14} /> Edit &amp; Resubmit
//                                 </button>
//                             )}
//                         </div>
//                     </div>
//                 </div>,
//                 document.body
//             )}

//             {/* ── HEADER ── */}
//             <div className="ld-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
//                     <div>
//                         <h2 className="ld-section-title"><CalendarCheck size={20} /> Compliance &amp; Attendance</h2>
//                         <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', margin: '4px 0 0 28px' }}>
//                             A complete history of your daily campus check-ins and workplace logbook entries.
//                         </p>
//                     </div>
//                     {learnerHasEmployer && (
//                         <button
//                             className="mlab-btn mlab-btn--primary"
//                             onClick={() => onOpenLogModal()}
//                             style={{ padding: '0.6rem 1.25rem', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
//                         >
//                             <Plus size={16} /> Add Logbook Entry
//                         </button>
//                     )}
//                 </div>
//             </div>

//             {/* ── UNIFIED TABS ── */}
//             <div className="lfm-tabs" style={{ marginBottom: 0 }}>
//                 <button className={`lfm-tab ${activeTab === 'campus' ? 'active' : ''}`} onClick={() => setActiveTab('campus')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}><CalendarCheck size={16} /> Campus Attendance</button>
//                 <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}><Briefcase size={16} /> Workplace Logbook</button>
//             </div>

//             {/* ════ CAMPUS ATTENDANCE VIEW ════ */}
//             {activeTab === 'campus' && (
//                 <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                     {/* STATS ROW */}
//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
//                         <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid ${GREEN}` }}>
//                             <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Class Attendance Ratio</div>
//                             <div style={{ fontSize: '2rem', fontWeight: 800, color: MIDNIGHT }}>{stats.ratio}</div>
//                         </div>
//                         <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid ${MIDNIGHT}` }}>
//                             <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Tracked Sessions</div>
//                             <div style={{ fontSize: '2rem', fontWeight: 800, color: MIDNIGHT }}>{stats.total}</div>
//                         </div>
//                         <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid #16a34a` }}>
//                             <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Days Present</div>
//                             <div style={{ fontSize: '2rem', fontWeight: 800, color: '#16a34a' }}>{stats.presentCount}</div>
//                         </div>
//                         <div style={{ background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', borderBottom: `4px solid #dc2626` }}>
//                             <div style={{ color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.5rem' }}>Days Absent</div>
//                             <div style={{ fontSize: '2rem', fontWeight: 800, color: '#dc2626' }}>{stats.absentCount}</div>
//                         </div>
//                     </div>

//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
//                             <div className="ld-search-box" style={{ margin: 0, display: 'flex', marginRight: 16, alignItems: 'center' }}>
//                                 <Layers size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
//                                 <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px 0 32px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
//                                     <option value="all">All Registered Classes</option>
//                                     {uniqueLedgerCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//                                 </select>
//                             </div>

//                             <div className="ld-search-box" style={{ margin: 0, display: 'flex', alignItems: 'center' }}>
//                                 <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
//                                     <Calendar size={16} color="var(--mlab-grey)" />
//                                     <select value={dateFilterMode} onChange={(e) => { setDateFilterMode(e.target.value as any); setDateSearch(''); }} style={{ border: 'none', background: 'transparent', outline: 'none', color: 'var(--mlab-grey)', fontWeight: 600, fontSize: '0.8rem', padding: '0 4px', cursor: 'pointer', textTransform: 'uppercase' }}>
//                                         <option value="month">Month</option>
//                                         <option value="week">Week</option>
//                                         <option value="date">Day</option>
//                                     </select>
//                                 </div>
//                                 <div style={{ width: '1px', height: '20px', background: 'var(--mlab-border)', margin: '0 6px' }} />
//                                 <input type={dateFilterMode} value={dateSearch} onChange={(e) => setDateSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '4px', paddingRight: dateSearch ? '30px' : '12px' }} />
//                                 {dateSearch && <button className="ld-clear-btn" onClick={() => setDateSearch('')}><XCircle size={14} /></button>}
//                             </div>
//                         </div>

//                         <div className="ld-filter-chips">
//                             <button className={`ld-filter-chip ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>All Statuses</button>
//                             <button className={`ld-filter-chip ${filterStatus === 'present' ? 'active' : ''}`} onClick={() => setFilterStatus('present')}>Present Only</button>
//                             <button className={`ld-filter-chip ${filterStatus === 'absent' ? 'active' : ''}`} onClick={() => setFilterStatus('absent')}>Absent Only</button>
//                         </div>
//                     </div>

//                     <div className="mlab-table-wrap" style={{ border: '1px solid var(--mlab-border)', borderRadius: '12px', background: 'white' }}>
//                         <table className="mlab-table">
//                             <thead>
//                                 <tr>
//                                     <th>Date</th>
//                                     <th>Enrolled Cohort</th>
//                                     <th>Status</th>
//                                     <th>Check In</th>
//                                     <th>Lunch Out</th>
//                                     <th>Lunch In</th>
//                                     <th>Check Out</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 {finalFilteredDisplayLedger.map((record, idx) => (
//                                     <tr key={idx} style={{ background: record.type === 'absent' ? '#fef2f2' : 'white' }}>
//                                         <td><strong style={{ color: MIDNIGHT }}>{moment(record.dateObj).format('ddd, DD MMM YYYY')}</strong></td>
//                                         <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: MIDNIGHT, letterSpacing: '0.02em' }}>{record.cohortName}</span></td>
//                                         <td>
//                                             {record.type === 'present' ? (
//                                                 <span className="ld-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0' }}><CheckCircle size={10} /> Present</span>
//                                             ) : (
//                                                 <span className="ld-badge" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}><AlertTriangle size={10} /> Absent</span>
//                                             )}
//                                         </td>
//                                         {record.type === 'absent' ? (
//                                             <td colSpan={4} style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '0.85rem' }}>No scans recorded for this session. A compliance deduction penalty has been applied.</td>
//                                         ) : (
//                                             <>
//                                                 <td>{record.checkInAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#16a34a" /> {moment(record.checkInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
//                                                 <td>{record.lunchOutAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchOutAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
//                                                 <td>{record.lunchInAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
//                                                 <td>{record.checkOutAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#dc2626" style={{ transform: 'rotate(180deg)' }} /> {moment(record.checkOutAt).format('HH:mm')}</span> : <span className="ld-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '2px 6px', fontSize: '0.7rem' }}>Missed</span>}</td>
//                                             </>
//                                         )}
//                                     </tr>
//                                 ))}
//                             </tbody>
//                         </table>
//                     </div>
//                 </div>
//             )}

//             {/* ════ WORKPLACE LOGS VIEW ════ */}
//             {activeTab === 'workplace' && (
//                 <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//                     {/* STATS HERO */}
//                     <div style={{ display: 'flex', gap: '1rem', background: '#f0fdf4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #bbf7d0', alignItems: 'center' }}>
//                         <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '50%' }}>
//                             <CheckCircle size={28} color="#166534" />
//                         </div>
//                         <div>
//                             <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Mentor Hours</p>
//                             <h3 style={{ margin: '4px 0 0', color: '#14532d', fontSize: '2rem' }}>
//                                 {totalWorkplaceHours.toFixed(1)} <span style={{ fontSize: '1rem', color: '#15803d' }}>Hours Approved</span>
//                             </h3>
//                         </div>
//                     </div>

//                     {/* WORKPLACE FILTERS BAR */}
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>

//                             <div className="ld-search-box" style={{ margin: 0, display: 'flex', flex: 1, minWidth: '220px', alignItems: 'center' }}>
//                                 <Search size={16} style={{ marginLeft: '12px', color: 'var(--mlab-grey)' }} />
//                                 <input type="text" placeholder="Search tasks, codes, or topics..." value={wpSearch} onChange={(e) => setWpSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '8px' }} />
//                                 {wpSearch && <button className="ld-clear-btn" onClick={() => setWpSearch('')}><XCircle size={14} /></button>}
//                             </div>

//                             <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '150px', alignItems: 'center' }}>
//                                 <Calendar size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
//                                 <select value={wpMonthFilter} onChange={(e) => setWpMonthFilter(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
//                                     <option value="all">All Months</option>
//                                     {wpAvailableMonths.map(month => <option key={month} value={month}>{moment(month, 'YYYY-MM').format('MMMM YYYY')}</option>)}
//                                 </select>
//                             </div>
//                         </div>

//                         <div className="ld-filter-chips">
//                             <button className={`ld-filter-chip ${wpStatusFilter === 'all' ? 'active' : ''}`} onClick={() => setWpStatusFilter('all')}>All</button>
//                             <button className={`ld-filter-chip ${wpStatusFilter === 'Draft' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Draft')}>Drafts</button>
//                             <button className={`ld-filter-chip ${wpStatusFilter === 'Pending_Mentor_Approval' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Pending_Mentor_Approval')}>Pending</button>
//                             <button className={`ld-filter-chip ${wpStatusFilter === 'Approved' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Approved')}>Approved</button>
//                             <button className={`ld-filter-chip ${wpStatusFilter === 'Rejected' ? 'active' : ''}`} onClick={() => setWpStatusFilter('Rejected')}>Rejected</button>
//                         </div>
//                     </div>

//                     {/* MONTHLY ACCORDION FEED */}
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                         {Object.keys(filteredAndGroupedWpLogs).length === 0 ? (
//                             <div style={{ textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)' }}>
//                                 <History size={48} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
//                                 <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT, textTransform: 'uppercase' }}>No Entries Found</h3>
//                                 <p style={{ color: 'var(--mlab-grey)', margin: 0, fontSize: '0.9rem' }}>No logs match your current metrics.</p>
//                             </div>
//                         ) : (
//                             Object.keys(filteredAndGroupedWpLogs).map(monthLabel => {
//                                 const monthLogs = filteredAndGroupedWpLogs[monthLabel];
//                                 const isOpen = expandedWpMonths.has(monthLabel);
//                                 const totalMonthHours = monthLogs.reduce((sum, log) => sum + (Number(log.totalHours) || 0), 0);

//                                 return (
//                                     <div key={monthLabel} style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>

//                                         <div onClick={() => toggleWpMonthAccordion(monthLabel)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid var(--mlab-border)' : 'none', cursor: 'pointer' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                                 <div style={{ background: 'var(--mlab-blue-light)', padding: '8px', borderRadius: '8px', width: 35, height: 35, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                                     <Calendar size={18} color={'white'} />
//                                                 </div>
//                                                 <div>
//                                                     <h3 style={{ margin: 0, fontSize: '1.1rem', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{monthLabel}</h3>
//                                                     <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{monthLogs.length} Entry(s)</span>
//                                                 </div>
//                                             </div>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                                 <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                     <Clock size={12} /> {totalMonthHours.toFixed(1)} hrs
//                                                 </div>
//                                                 {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
//                                             </div>
//                                         </div>

//                                         {isOpen && (
//                                             <div style={{ display: 'flex', flexDirection: 'column', padding: '1.25rem', gap: '1rem', background: '#fafbfc' }}>
//                                                 {monthLogs.map(log => {
//                                                     // 🚀 DYNAMIC TIMELINE INTEGRATION FOR FRONT-FACING FEED
//                                                     // By explicitly sorting by Timestamp, we absolutely guarantee the newest log is at index 0 (Top)
//                                                     const entryVersions = log.history && log.history.length > 0
//                                                         ? [...log.history, log].sort((a, b) => {
//                                                             const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
//                                                             const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
//                                                             return timeB - timeA; // Descending (Newest First)
//                                                         })
//                                                         : [log];

//                                                     return (
//                                                         <div key={log.id} style={{ background: 'white', border: `1px solid ${log.status === 'Rejected' ? '#fecaca' : 'var(--mlab-border)'}`, borderRadius: '8px', padding: '1.25rem' }}>
//                                                             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
//                                                                 <div>
//                                                                     <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', color: MIDNIGHT, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                         {moment(log.dateString).format('dddd, DD MMM YYYY')}
//                                                                         {/* TS COMPLIANT PAPERCLIP WRAPPER */}
//                                                                         {log.evidenceUrl && (
//                                                                             <span title="Supporting evidence attached" style={{ display: 'inline-flex' }}>
//                                                                                 <Paperclip size={13} color="var(--mlab-blue)" />
//                                                                             </span>
//                                                                         )}
//                                                                     </div>
//                                                                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 600 }}>
//                                                                         <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: '#ea580c' }}>({log.totalHours} hrs)</span>
//                                                                     </div>
//                                                                 </div>

//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                     {log.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}><FileText size={12} /> Draft</span>}

//                                                                     {log.status === 'Pending_Mentor_Approval' && (
//                                                                         <>
//                                                                             <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}><Clock size={12} /> Pending</span>
//                                                                             {log.rejectionReason && <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #c7d2fe' }}><History size={12} /> Resubmitted (v2)</span>}
//                                                                         </>
//                                                                     )}

//                                                                     {log.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}><CheckCircle size={12} /> Approved</span>}
//                                                                     {log.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}><XCircle size={12} /> Rejected</span>}

//                                                                     {['Draft', 'Rejected'].includes(log.status) && (
//                                                                         <button onClick={() => onOpenLogModal(log)} style={{ background: log.status === 'Rejected' ? '#fef2f2' : 'var(--mlab-blue-light)', border: `1px solid ${log.status === 'Rejected' ? '#fca5a5' : 'transparent'}`, padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: log.status === 'Rejected' ? '#be123c' : 'var(--mlab-blue)' }}><Pencil size={11} /> {log.status === 'Rejected' ? 'Fix & Resubmit' : 'Resume'}</button>
//                                                                     )}

//                                                                     <button onClick={() => setViewingLogDetails(log)} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#475569' }}><Maximize2 size={11} /> View Details</button>
//                                                                 </div>
//                                                             </div>

//                                                             {log.isQctoAligned && (
//                                                                 <div style={{ fontSize: '0.85rem', color: '#0369a1', background: '#e0f2fe', padding: '6px 12px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '1rem', fontWeight: 600, border: '1px dashed #7dd3fc' }}><BookOpen size={14} /> {log.workActivityCode}: {log.workActivityLabel}</div>
//                                                             )}

//                                                             {/* 🚀 ACTIVE BACK-AND-FORTH AUDITINGTRAIL: Collapsible Revision Engine */}
//                                                             {log.history && log.history.length > 0 && (
//                                                                 <div style={{ marginBottom: '12px' }}>
//                                                                     <button
//                                                                         onClick={() => toggleHistoryAccordion(log.id)}
//                                                                         style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
//                                                                     >
//                                                                         <History size={12} /> {expandedHistoryIds.has(log.id) ? "Hide Full Audit History" : `View Full Audit History Trail (${entryVersions.length} Versions)`}
//                                                                     </button>

//                                                                     {expandedHistoryIds.has(log.id) && (
//                                                                         <div className="animate-fade-in" style={{ padding: '16px 12px 12px 12px', background: '#fafbfc', borderRadius: '8px', marginTop: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
//                                                                             {entryVersions.map((hist: any, hIdx: number) => {
//                                                                                 // Time sort guarantees index 0 is the newest
//                                                                                 const isLatest = hIdx === 0;
//                                                                                 // Math ensures the highest number goes to index 0
//                                                                                 const versionNumber = entryVersions.length - hIdx;

//                                                                                 return (
//                                                                                     <div key={hist.updatedAt || hIdx} style={{ position: 'relative', paddingLeft: '16px', borderLeft: '2px solid #cbd5e1' }}>
//                                                                                         <div style={{ position: 'absolute', left: '-7px', top: '0px', width: '12px', height: '12px', borderRadius: '50%', background: isLatest ? 'var(--mlab-blue)' : '#94a3b8', border: '2px solid white' }} />

//                                                                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                                                                             <div style={{ fontWeight: 700, color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
//                                                                                                 Version {versionNumber}
//                                                                                                 <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--mlab-grey)' }}>({moment(hist.updatedAt).format('DD MMM YYYY')})</span>
//                                                                                                 {isLatest && <span style={{ fontSize: '0.65rem', background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: '12px', textTransform: 'uppercase' }}>Latest</span>}
//                                                                                             </div>

//                                                                                             {/* Status Badge */}
//                                                                                             <div style={{ display: 'flex', gap: '4px' }}>
//                                                                                                 {hist.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
//                                                                                                 {hist.status === 'Pending_Mentor_Approval' && <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a' }}>Pending Review</span>}
//                                                                                                 {hist.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0' }}>Approved</span>}
//                                                                                                 {hist.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca' }}>Rejected</span>}
//                                                                                             </div>
//                                                                                         </div>

//                                                                                         <div className="quill-content-display" dangerouslySetInnerHTML={{ __html: hist.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">No description provided...</span>' }} style={{ background: 'white', padding: '12px', borderRadius: '6px', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.85rem' }} />

//                                                                                         {hist.evidenceUrl && (
//                                                                                             <div style={{ marginTop: '8px' }}>
//                                                                                                 <a href={hist.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '4px', textDecoration: 'none', border: '1px solid #cbd5e1' }}>
//                                                                                                     <ExternalLink size={12} /> View Evidence Attachment
//                                                                                                 </a>
//                                                                                             </div>
//                                                                                         )}

//                                                                                         {/* Hide rejection notes if the iteration was explicitly approved */}
//                                                                                         {hist.rejectionReason && hist.status !== 'Approved' && (
//                                                                                             <div style={{ background: hist.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${hist.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '10px 14px', borderRadius: '6px', marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                                                                                                 <AlertTriangle size={14} color={hist.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
//                                                                                                 <div style={{ width: '100%' }}>
//                                                                                                     <strong style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: hist.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '2px' }}>
//                                                                                                         {hist.status === 'Rejected' ? "Mentor's Correction Notice" : "Resolved Revision Notes"}
//                                                                                                     </strong>
//                                                                                                     <div className="quill-content-display" style={{ color: hist.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.8rem', lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: hist.rejectionReason }} />
//                                                                                                 </div>
//                                                                                             </div>
//                                                                                         )}
//                                                                                     </div>
//                                                                                 );
//                                                                             })}
//                                                                         </div>
//                                                                     )}
//                                                                 </div>
//                                                             )}

//                                                             {/* 🚀 ONLY SHOW STANDALONE ROOT TASKS IF THE TIMELINE ACCORDION IS HIDDEN */}
//                                                             {!expandedHistoryIds.has(log.id) && (
//                                                                 <>
//                                                                     {/* 🚀 Hide rejection note from the root collapsed view if it has been formally approved */}
//                                                                     {log.rejectionReason && log.status !== 'Approved' && (
//                                                                         <div style={{ background: log.status === 'Rejected' ? '#fff1f2' : '#f8fafc', border: `1px dashed ${log.status === 'Rejected' ? '#fca5a5' : '#cbd5e1'}`, padding: '10px 14px', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                                                                             <AlertTriangle size={16} color={log.status === 'Rejected' ? '#be123c' : '#475569'} style={{ marginTop: '2px', flexShrink: 0 }} />
//                                                                             <div style={{ width: '100%' }}>
//                                                                                 <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: log.status === 'Rejected' ? '#be123c' : '#475569', display: 'block', marginBottom: '2px' }}>
//                                                                                     {log.status === 'Rejected' ? "Mentor's Note" : "Previous Revision History Notes"}
//                                                                                 </strong>
//                                                                                 <div
//                                                                                     className="quill-content-display"
//                                                                                     style={{ color: log.status === 'Rejected' ? '#9f1239' : '#334155', fontSize: '0.85rem', lineHeight: 1.5 }}
//                                                                                     dangerouslySetInnerHTML={{ __html: log.rejectionReason }}
//                                                                                 />
//                                                                             </div>
//                                                                         </div>
//                                                                     )}

//                                                                     <div
//                                                                         style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.6, background: '#f8fafc', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid #cbd5e1', maxHeight: '150px', overflow: 'hidden' }}
//                                                                         className="quill-content-display"
//                                                                         dangerouslySetInnerHTML={{ __html: log.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">Empty entry description text...</span>' }}
//                                                                     />

//                                                                     {/* Inline File Preview Controller */}
//                                                                     {log.evidenceUrl && (
//                                                                         <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                                                                 <button onClick={() => setPreviewEvidenceId(previewEvidenceId === log.id ? null : log.id)} style={{ background: 'var(--mlab-blue-light)', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
//                                                                                     {previewEvidenceId === log.id ? <EyeOff size={14} /> : <Eye size={14} />}
//                                                                                     {previewEvidenceId === log.id ? 'Close Preview' : 'Preview Evidence'}
//                                                                                 </button>
//                                                                                 <a href={log.evidenceUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '5px 12px', borderRadius: '6px', textDecoration: 'none', border: '1px solid #cbd5e1' }}><ExternalLink size={14} /> Open Full View</a>
//                                                                             </div>

//                                                                             {previewEvidenceId === log.id && (
//                                                                                 <div className="animate-fade-in" style={{ padding: '8px', border: '1px solid var(--mlab-border)', borderRadius: '8px', background: '#f8fafc', marginTop: '4px', display: 'flex', justifyContent: 'center' }}>
//                                                                                     {isImageFile(log.evidenceUrl) ? (
//                                                                                         <img src={log.evidenceUrl} alt="Evidence Render inline" style={{ maxWidth: '100%', maxHeight: '350px', objectFit: 'contain' }} />
//                                                                                     ) : (
//                                                                                         <iframe src={log.evidenceUrl} title="Evidence Preview Frame" style={{ width: '100%', height: '350px', border: 'none', background: 'white' }} />
//                                                                                     )}
//                                                                                 </div>
//                                                                             )}
//                                                                         </div>
//                                                                     )}
//                                                                 </>
//                                                             )}
//                                                         </div>
//                                                     );
//                                                 })}
//                                             </div>
//                                         )}
//                                     </div>
//                                 );
//                             })
//                         )}
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };