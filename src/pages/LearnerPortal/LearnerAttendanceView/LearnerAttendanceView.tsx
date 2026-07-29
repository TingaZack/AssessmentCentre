// src/components/views/LearnerAttendanceView/LearnerAttendanceView.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    CalendarCheck, Clock, CheckCircle, AlertTriangle, Calendar, XCircle,
    ArrowDownToLine, BookOpen, Layers, Briefcase, Plus, History,
    FileText, Pencil, Search, ChevronDown, ChevronUp,
    Maximize2, Paperclip, Landmark, Loader2,
    FileCode, MapPin, Phone, Mail, Building2, UserCircle,
    Activity, Square, CheckSquare, ShieldCheck, CheckCircle2, UploadCloud,
    Award
} from 'lucide-react';
import moment from 'moment';
import { collection, getDocs, query, where, doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';

import './LearnerAttendanceView.css';
import { useStore } from '../../../store/useStore';
import { WorkplaceLogViewerModal } from '../../../components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

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
    onOpenLogModal: (log?: any, placementContext?: { placementId?: string, employerId?: string, mentorId?: string }) => void;
}

// ─── 🚀 HELPER ACCEPTS DYNAMIC API HOLIDAY ARRAY ───
const getSAWorkingDaysInMonth = (year: number, month: number, holidaysList: string[]) => {
    const start = moment([year, month, 1]);
    const end = moment(start).endOf('month');
    let days = 0;

    let current = start.clone();
    while (current.isSameOrBefore(end)) {
        if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
            if (!holidaysList.includes(current.format('YYYY-MM-DD'))) {
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
    const toast = useToast();

    // ─── INTERNAL UI STATE ───
    const [activeTab, setActiveTab] = useState<'campus' | 'workplace'>('campus');
    const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
    const [selectedCohortId, setSelectedCohortId] = useState<string>('all');
    const [dateFilterMode, setDateFilterMode] = useState<'month' | 'week' | 'date'>('month');
    const [dateSearch, setDateSearch] = useState('');

    const [wpSearch, setWpSearch] = useState('');
    const [wpStatusFilter, setWpStatusFilter] = useState<string>('all');
    const [wpMonthFilter, setWpMonthFilter] = useState<string>('all');

    const [expandedWpMonths, setExpandedWpMonths] = useState<Set<string>>(new Set([moment().format('MMMM YYYY')]));
    const [expandedEmployers, setExpandedEmployers] = useState<Set<string>>(new Set());

    const [viewingLogDetails, setViewingLogDetails] = useState<any | null>(null);
    const [viewingLogEmployer, setViewingLogEmployer] = useState<any>(null);

    // ─── VAULT UPLOAD STATE ───
    const [uploadingTrancheKey, setUploadingTrancheKey] = useState<string | null>(null);
    const [pendingUpload, setPendingUpload] = useState<{
        file: File;
        trancheId: string;
        req: any;
        placementId: string;
    } | null>(null);

    // ─── EMPLOYMENT HISTORY & STIPEND PIPELINE STATE ───
    const [placementsHistory, setPlacementsHistory] = useState<any[]>([]);
    const [directStipend, setDirectStipend] = useState<number | null>(null);
    const [isEmploymentLoading, setIsEmploymentLoading] = useState<boolean>(false);

    // ─── DYNAMIC PUBLIC HOLIDAYS STATE ENGINE ───
    const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
    const [isHolidaysLoading, setIsHolidaysLoading] = useState<boolean>(true);

    const stableUserUid = user?.uid || '';
    const stableIdNumber = user?.idNumber || '';
    const fallbackSearchId = workplaceLogs.length > 0 ? workplaceLogs[0].learnerId : '';

    // ─── EFFECT 1: FETCH DYNAMIC SOUTH AFRICAN PUBLIC HOLIDAYS FROM API ───
    useEffect(() => {
        const fetchSAHolidaysFromApi = async () => {
            setIsHolidaysLoading(true);
            try {
                const queryYear = moment().year(); 
                const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${queryYear}/ZA`);

                if (response.ok) {
                    const data = await response.json();
                    const parsedDates = data.map((item: any) => item.date);
                    setPublicHolidays(parsedDates);
                } else {
                    throw new Error(`API Error response channel: ${response.status}`);
                }
            } catch (err) {
                console.warn("⚠️ Holiday API channel down. Injecting fallback matrix.", err);
                setPublicHolidays([
                    '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27',
                    '2026-05-01', '2026-06-16', '2026-08-09', '2026-08-10', '2026-09-24',
                    '2026-12-16', '2026-12-25', '2026-12-26'
                ]);
            } finally {
                setIsHolidaysLoading(false);
            }
        };

        fetchSAHolidaysFromApi();
    }, []);

    // Auto-expand most recent month
    useEffect(() => {
        if (workplaceLogs.length > 0) {
            const mostRecentLog = [...workplaceLogs].sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime())[0];
            if (mostRecentLog?.dateString) {
                const recentMonth = moment(mostRecentLog.dateString).format('MMMM YYYY');
                setExpandedWpMonths(prev => new Set(prev).add(recentMonth));
            }
        }
    }, [workplaceLogs]);

    // Auto-expand the active employer placement
    useEffect(() => {
        if (placementsHistory.length > 0) {
            const active = placementsHistory.find(p => ['active placement', 'active', 'pending match'].includes(String(p.status).toLowerCase()));
            if (active) {
                setExpandedEmployers(prev => new Set(prev).add(active.placementId));
            }
        }
    }, [placementsHistory]);

    // ─── UNIFIED EMPLOYMENT PIPELINE ───
    useEffect(() => {
        const fetchEmploymentProfile = async () => {
            const rawHumanId = stableIdNumber || stableUserUid || fallbackSearchId;
            if (!rawHumanId || !learnerHasEmployer) {
                setIsEmploymentLoading(false);
                return;
            }

            setIsEmploymentLoading(true);
            try {
                const searchPool = [rawHumanId];
                const enrollmentsQ = query(collection(db, "enrollments"), where("learnerId", "==", rawHumanId));
                const enrollmentsSnap = await getDocs(enrollmentsQ);
                if (!enrollmentsSnap.empty) {
                    searchPool.push(enrollmentsSnap.docs[0].id);
                    if (enrollmentsSnap.docs[0].data()?.id) {
                        searchPool.push(enrollmentsSnap.docs[0].data().id);
                    }
                }
                const validSearchPool = [...new Set(searchPool)].filter(Boolean);

                const placementsQ = query(collection(db, "placements"), where("learnerId", "in", validSearchPool));
                const placementsSnap = await getDocs(placementsQ);

                if (!placementsSnap.empty) {
                    const fetchedPlacements = placementsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                    const employerIds = [...new Set(fetchedPlacements.map((p: any) => p.employerId).filter(Boolean))];
                    const mentorIds = [...new Set(fetchedPlacements.map((p: any) => p.mentorId).filter(Boolean))];

                    const employersData: Record<string, any> = {};
                    const mentorsData: Record<string, any> = {};

                    if (employerIds.length > 0) {
                        const empDocs = await Promise.all(employerIds.map(id => getDoc(doc(db, 'employers', id))));
                        empDocs.forEach(d => { if (d.exists()) employersData[d.id] = d.data(); });
                    }

                    if (mentorIds.length > 0) {
                        const mDocs = await Promise.all(mentorIds.map(id => getDoc(doc(db, 'users', id))));
                        mDocs.forEach(d => { if (d.exists()) mentorsData[d.id] = d.data(); });
                    }

                    const compiledHistory = fetchedPlacements.map((p: any) => ({
                        placementId: p.id,
                        status: p.status || 'Past Placement',
                        startDate: p.startDate || p.createdAt,
                        endDate: p.endDate,
                        stipendAmount: p.stipendAmount ?? p.stipend ?? p.allowance ?? p.wage,
                        employer: p.employerId ? { id: p.employerId, ...employersData[p.employerId] } : null,
                        mentor: p.mentorId ? { id: p.mentorId, ...mentorsData[p.mentorId] } : null,
                        complianceSchema: p.complianceSchema || null,
                        evidenceMap: p.evidenceMap || {},
                        compliance: p.compliance || {}
                    }));

                    setPlacementsHistory(compiledHistory);

                    const activePlace = compiledHistory.find(h => ['active placement', 'active', 'pending match'].includes(String(h.status).toLowerCase()));
                    if (activePlace && activePlace.stipendAmount !== undefined && (!stipendAmount || stipendAmount === 0)) {
                        setDirectStipend(Number(activePlace.stipendAmount));
                    }
                }
            } catch (err) {
                console.error("Pipeline failure:", err);
            } finally {
                setIsEmploymentLoading(false);
            }
        };

        fetchEmploymentProfile();
    }, [stableIdNumber, stableUserUid, fallbackSearchId, learnerHasEmployer, stipendAmount]);

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat("en-ZA", {
            style: "currency",
            currency: "ZAR",
            maximumFractionDigits: 0,
        }).format(val || 0);

    const toggleWpMonthAccordion = (monthLabel: string) => {
        setExpandedWpMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthLabel)) next.delete(monthLabel);
            else next.add(monthLabel);
            return next;
        });
    };

    const toggleEmployerAccordion = (placementId: string) => {
        setExpandedEmployers(prev => {
            const next = new Set(prev);
            if (next.has(placementId)) next.delete(placementId); else next.add(placementId);
            return next;
        });
    };

    // ─── 🚀 COMPLIANCE VAULT: TRIGGER UPLOAD ALERT ───
    const triggerLearnerTrancheUpload = (e: React.ChangeEvent<HTMLInputElement>, trancheId: string, req: any, placementId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setPendingUpload({ file, trancheId, req, placementId });
        
        // Reset the input so they can select the same file again if they cancel
        if (e.target) e.target.value = '';
    };

    // ─── 🚀 COMPLIANCE VAULT: EXECUTE VERSION-CONTROLLED UPLOAD ───
    const executeTrancheUpload = async () => {
        if (!pendingUpload) return;
        const { file, trancheId, req, placementId } = pendingUpload;

        const compositeKey = `${trancheId}_${req.id}`;
        setUploadingTrancheKey(compositeKey);
        setPendingUpload(null);

        try {
            // 1. Grab the current placement and check if evidence already exists for version control
            const currentPlacement = placementsHistory.find(p => p.placementId === placementId);
            const existingEvidence = currentPlacement?.evidenceMap?.[compositeKey];

            // 2. Upload the new file to Firebase Storage
            const fileRef = ref(storage, `compliance/${placementId}/${compositeKey}_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);

            // 3. If there is an older version, bundle it up to archive it into the history array
            const pastRecord = existingEvidence ? {
                url: existingEvidence.url,
                uploadedAt: existingEvidence.uploadedAt,
                fileName: existingEvidence.fileName,
                uploadedBy: existingEvidence.uploadedBy,
                uploadedByName: existingEvidence.uploadedByName
            } : null;

            // 4. Create the new root payload with the updated history array
            const evidencePayload = {
                url: downloadUrl,
                uploadedAt: new Date().toISOString(),
                fileName: file.name,
                uploadedBy: user?.uid,
                uploadedByName: user?.fullName,
                history: existingEvidence ? [...(existingEvidence.history || []), pastRecord] : []
            };

            const placementRef = doc(db, 'placements', placementId);
            
            const updates: any = {
                [`evidenceMap.${compositeKey}`]: evidencePayload,
                updatedAt: new Date().toISOString()
            };

            if (req.systemTag) {
                updates[`compliance.${req.systemTag}`] = downloadUrl;
            }

            await updateDoc(placementRef, updates);

            // Update local state instantly so UI responds without full page reload
            setPlacementsHistory(prev => prev.map(p => {
                if (p.placementId === placementId) {
                    return {
                        ...p,
                        evidenceMap: {
                            ...(p.evidenceMap || {}),
                            [compositeKey]: evidencePayload
                        },
                        compliance: {
                            ...(p.compliance || {}),
                            ...(req.systemTag ? { [req.systemTag]: downloadUrl } : {})
                        }
                    };
                }
                return p;
            }));

            toast.success(`${req.label} uploaded successfully!`);
        } catch (err: any) {
            console.error(err);
            toast.error("Failed to upload evidence.");
        } finally {
            setUploadingTrancheKey(null);
        }
    };

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

    // ─── WORKPLACE LOGS & PLACEMENT MAPPING COMPUTATION ───
    const wpAvailableMonths = useMemo(() => {
        const months = new Set<string>();
        workplaceLogs.forEach(log => {
            if (log.dateString) months.add(moment(log.dateString).format('YYYY-MM'));
        });
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    }, [workplaceLogs]);

    const filteredWpLogs = useMemo(() => {
        return workplaceLogs.filter(log => {
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
    }, [workplaceLogs, wpStatusFilter, wpMonthFilter, wpSearch]);

    const { mappedPlacements, unassignedLogs } = useMemo(() => {
        const assignedLogIds = new Set<string>();

        const sortedPlacements = [...placementsHistory].sort((a, b) => 
            new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
        );

        const mapped = sortedPlacements.map(place => {
            const pLogs = filteredWpLogs.filter(log => {
                if (assignedLogIds.has(log.id)) return false;

                if (log.placementId && log.placementId === place.placementId) return true;

                const logEmpId = log.employerId || log.rawLogData?.employerId;
                const logMentorId = log.mentorId || log.rawLogData?.mentorId;
                const isEmployerMatch = logEmpId && place.employer?.id && logEmpId === place.employer.id;
                const isMentorMatch = logMentorId && place.mentor?.id && logMentorId === place.mentor.id;

                if (isEmployerMatch || isMentorMatch) {
                    if (log.dateString && place.startDate) {
                        const logDate = moment(log.dateString);
                        const start = moment(place.startDate);
                        const end = place.endDate ? moment(place.endDate) : moment().add(10, 'years');
                        
                        if (logDate.isSameOrAfter(start, 'day') && logDate.isSameOrBefore(end, 'day')) {
                            return true;
                        }
                    }
                }
                return false;
            });

            pLogs.forEach(l => assignedLogIds.add(l.id));

            const grouped: Record<string, any[]> = {};
            pLogs.forEach(log => {
                const monthYear = moment(log.dateString).format('MMMM YYYY');
                if (!grouped[monthYear]) grouped[monthYear] = [];
                grouped[monthYear].push(log);
            });

            return { ...place, logs: pLogs, groupedLogs: grouped };
        });

        mapped.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

        const unassigned = filteredWpLogs.filter(l => !assignedLogIds.has(l.id));
        const unassignedGrouped: Record<string, any[]> = {};
        unassigned.forEach(log => {
            const monthYear = moment(log.dateString).format('MMMM YYYY');
            if (!unassignedGrouped[monthYear]) unassignedGrouped[monthYear] = [];
            unassignedGrouped[monthYear].push(log);
        });

        return { mappedPlacements: mapped, unassignedLogs: unassignedGrouped };
    }, [placementsHistory, filteredWpLogs]);

    const hoursStats = useMemo(() => {
        const targetWpHours = 1600;
        let approved = 0, pending = 0, rejected = 0, draft = 0;

        workplaceLogs.forEach((log: any) => {
            const status = String(log.status || '').toLowerCase().trim();
            const hours = Number(log.totalHours) || 0;

            if (status === 'approved') approved += hours;
            else if (status === 'pending_mentor_approval' || status === 'pending') pending += hours;
            else if (status === 'rejected') rejected += hours;
            else draft += hours;
        });

        return {
            approvedWpHours: approved,
            pendingWpHours: pending,
            rejectedWpHours: rejected,
            draftWpHours: draft,
            totalWpHours: approved + pending,
            progressPct: Math.min(100, Math.round((approved / targetWpHours) * 100))
        };
    }, [workplaceLogs]);

    const stats = useMemo(() => {
        const presentCount = cohortFilteredLedger.filter(r => r.type === 'present').length;
        const absentCount = cohortFilteredLedger.filter(r => r.type === 'absent').length;
        const total = presentCount + absentCount;
        const ratio = total === 0 ? "100%" : Math.round((presentCount / total) * 100) + "%";

        const currentYear = moment().year();
        const currentMonth = moment().month();
        const currentMonthStr = moment().format('YYYY-MM');

        const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, publicHolidays);

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
            total, presentCount, absentCount, ratio,
            currentMonthApprovedDays, expectedWorkingDaysThisMonth,
            currentMonthEarnedStipend, baseStipendUsed: baseWageAmount
        };
    }, [cohortFilteredLedger, workplaceLogs, stipendAmount, directStipend, publicHolidays]);

    const renderLogsGroupedByMonth = (groupedLogs: Record<string, any[]>, passedEmployer?: any) => {
        if (Object.keys(groupedLogs).length === 0) {
            return (
                <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '0', border: '1px dashed #cbd5e1' }}>
                    <History size={32} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
                    <h4 style={{ fontFamily: 'var(--font-heading)', color: '#64748b', margin: 0 }}>No Logs Found</h4>
                    <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0', fontSize: '0.8rem', textTransform: 'none' }}>No entries match the current timeline or filters.</p>
                </div>
            );
        }

        return Object.keys(groupedLogs).map(monthLabel => {
            const monthLogs = groupedLogs[monthLabel];
            const isOpen = expandedWpMonths.has(monthLabel);
            const totalMonthHours = monthLogs.reduce((sum: number, log: any) => sum + (Number(log.totalHours) || 0), 0);

            return (
                <div key={monthLabel} style={{ background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
                    <div onClick={() => toggleWpMonthAccordion(monthLabel)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid var(--mlab-border)' : 'none', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ background: 'var(--mlab-blue-light)', padding: '6px', borderRadius: '0', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Calendar size={16} color={'white'} />
                            </div>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{monthLabel}</h4>
                                <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{monthLogs.length} Entry(s)</span>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '0', fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Clock size={12} /> {totalMonthHours.toFixed(1)} hrs
                            </div>
                            {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
                        </div>
                    </div>

                    {isOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', background: '#fafbfc' }}>
                            {monthLogs.map((log: any) => {
                                return (
                                    <div key={log.id} style={{ background: 'white', border: `1px solid ${log.status === 'Rejected' ? '#fecaca' : 'var(--mlab-border)'}`, borderRadius: '0', padding: '1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                                            <div>
                                                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: MIDNIGHT, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {moment(log.dateString).format('dddd, DD MMM YYYY')}
                                                    {(log.evidenceUrl || (log.customEvidenceTracking && log.customEvidenceTracking.length > 0)) && (
                                                        <span title="Supporting evidence attached" style={{ display: 'inline-flex' }}>
                                                            <Paperclip size={13} color="var(--mlab-blue)" />
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 600 }}>
                                                    <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: '#ea580c' }}>({log.totalHours} hrs)</span>
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {log.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '0', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
                                                {log.status === 'Pending_Mentor_Approval' && (
                                                    <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '0', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                        <Clock size={10} /> Pending
                                                    </span>
                                                )}
                                                {log.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '0', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0', display: 'flex', gap: '4px', alignItems: 'center' }}><CheckCircle size={10} /> Approved</span>}
                                                {log.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '0', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca', display: 'flex', gap: '4px', alignItems: 'center' }}><XCircle size={10} /> Rejected</span>}

                                                {['Draft', 'Rejected'].includes(log.status) && (
                                                    <button onClick={() => {
                                                        setViewingLogEmployer(passedEmployer || null);
                                                        onOpenLogModal(log);
                                                    }} style={{ background: log.status === 'Rejected' ? '#fef2f2' : 'var(--mlab-blue-light)', border: `1px solid ${log.status === 'Rejected' ? '#fca5a5' : 'transparent'}`, padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: log.status === 'Rejected' ? '#be123c' : 'var(--mlab-blue)' }}><Pencil size={10} /> Fix</button>
                                                )}

                                                <button onClick={() => {
                                                    setViewingLogDetails(log);
                                                    setViewingLogEmployer(passedEmployer || null);
                                                }} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '0', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#475569' }}><Maximize2 size={10} /> View</button>
                                            </div>
                                        </div>

                                        {log.isQctoAligned && (
                                            <div style={{ fontSize: '0.8rem', color: '#0369a1', background: '#e0f2fe', padding: '4px 10px', borderRadius: '0', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem', fontWeight: 600, border: '1px dashed #7dd3fc' }}><BookOpen size={12} /> {log.workActivityCode}: {log.workActivityLabel}</div>
                                        )}

                                        <div
                                            style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.6, background: '#f8fafc', padding: '12px', borderRadius: '0', borderLeft: '3px solid #cbd5e1', maxHeight: '100px', overflow: 'hidden' }}
                                            className="quill-content-display"
                                            dangerouslySetInnerHTML={{ __html: log.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">Empty description...</span>' }}
                                        />

                                        {((log.customEvidenceTracking && log.customEvidenceTracking.length > 0) || log.evidenceUrl) && (
                                            <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                                                {log.customEvidenceTracking?.length > 0 && (
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', padding: '2px 8px', borderRadius: '0' }}>
                                                        <FileCode size={10} /> {log.customEvidenceTracking.length} Custom Artifacts
                                                    </span>
                                                )}
                                                {log.evidenceUrl && (
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '0', border: '1px solid #cbd5e1' }}>
                                                        <Paperclip size={10} /> Legacy Attachment
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            );
        });
    };

    return (
        <div className="ld-animate" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

            <svg width="0" height="0" style={{ position: 'absolute' }}>
                <defs>
                    <linearGradient id="gK" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="var(--mlab-green)" />
                        <stop offset="100%" stopColor="var(--mlab-green-dark)" />
                    </linearGradient>
                    <linearGradient id="gP" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gW" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#f59e0b" />
                        <stop offset="100%" stopColor="#d97706" />
                    </linearGradient>
                    <linearGradient id="gA" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#38bdf8" />
                        <stop offset="100%" stopColor="#0284c7" />
                    </linearGradient>
                    <linearGradient id="gD" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94a3b8" />
                        <stop offset="100%" stopColor="#475569" />
                    </linearGradient>
                </defs>
            </svg>

            <style dangerouslySetInnerHTML={{
                __html: `
                /* 🚀 mLab Standard Card Stylings */
                .mc-cards-wrapper {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: 1.5rem;
                    margin-bottom: 2rem;
                }
                .mc { background: var(--mlab-white); border: 1px solid var(--mlab-border); border-radius: 0; padding: 1.5rem; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 1rem; transition: transform .2s ease; cursor: default; }
                .mc:hover { transform: translateY(-4px); }
                .mc-hdr { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; position: relative; border-bottom: 2px solid var(--mlab-border); padding-bottom: 0.75rem; }
                .mc-label { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--mlab-grey); margin-bottom: 4px; }
                .mc-title { font-family: var(--font-heading); font-size: 1.1rem; font-weight: 700; color: var(--mlab-blue); letter-spacing: 0.05em; text-transform: uppercase; line-height: 1.2; }
                .mc-pct { font-family: var(--font-heading); font-size: 1.5rem; font-weight: 700; flex-shrink: 0; margin-top: 1px; color: var(--mlab-blue); }
                
                .mc-bars { display: flex; flex-direction: column; gap: 8px; }
                .mc-bar-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
                .mc-bar-lbl { font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-grey); }
                .mc-bar-val { font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); }
                .mc-track { width: 100%; height: 6px; background: var(--mlab-border); border-radius: 0; overflow: hidden; }
                .mc-fill { height: 100%; border-radius: 0; transition: width 1.4s cubic-bezier(.4,0,.2,1) .35s; }
                .mc-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 1rem; border-top: 2px solid var(--mlab-border); }
                .mc-total { font-family: var(--font-body); font-size: 0.75rem; color: var(--mlab-grey); }
                .mc-total strong { font-weight: 700; color: var(--mlab-blue); }
                .mc-status { display: inline-flex; align-items: center; gap: 5px; font-family: var(--font-heading); font-size: 0.65rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--mlab-blue); }
                
                .mc-k .mc-fill-primary { background: var(--mlab-green); }
                
                /* Overrides for Flat UI */
                .mlab-table-wrap { border-radius: 0 !important; border: none !important; }

                /* Quill Render Styles */
                .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
                .quill-content-display *, .quill-content-display p, .quill-content-display span, .quill-content-display li { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
                .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 8px 0 !important; }
                .quill-content-display li { margin-bottom: 4px !important; }
                .quill-content-display a { color: #2563eb !important; text-decoration: underline !important; font-weight: 600 !important; cursor: pointer !important; transition: color 0.15s ease !important; }
                .quill-content-display a:hover { color: #1d4ed8 !important; }
            `}} />

            {/* Shared detail preview modal */}
            {viewingLogDetails && (
                <WorkplaceLogViewerModal
                    log={viewingLogDetails}
                    allowEdit={true}
                    preloadedEmployer={viewingLogEmployer ? {
                        companyName: viewingLogEmployer.name,
                        address: viewingLogEmployer.physicalAddress || viewingLogEmployer.address || 'Address missing in system',
                        workTelephone: viewingLogEmployer.contactPhone || 'Phone unlisted',
                        email: viewingLogEmployer.contactEmail || 'Email unlisted'
                    } : null}
                    onEdit={(logToEdit) => {
                        setViewingLogDetails(null);
                        setViewingLogEmployer(null);
                        onOpenLogModal(logToEdit);
                    }}
                    onClose={() => {
                        setViewingLogDetails(null);
                        setViewingLogEmployer(null);
                    }}
                />
            )}

            {/* 🚀 COMPLIANCE UPLOAD CONFIRMATION MODAL */}
            {pendingUpload && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal
                        type="info"
                        title={placementsHistory.find(p => p.placementId === pendingUpload.placementId)?.evidenceMap?.[`${pendingUpload.trancheId}_${pendingUpload.req.id}`] ? "Update Document" : "Confirm Upload"}
                        message={
                            placementsHistory.find(p => p.placementId === pendingUpload.placementId)?.evidenceMap?.[`${pendingUpload.trancheId}_${pendingUpload.req.id}`]
                                ? `You are about to upload a new version ("${pendingUpload.file.name}") for ${pendingUpload.req.label}. The previous document will be securely archived. Do you want to proceed?`
                                : `You are about to upload "${pendingUpload.file.name}" for ${pendingUpload.req.label}. Please ensure this is the correct and clearly legible document before confirming.`
                        }
                        onCancel={() => setPendingUpload(null)}
                        onClose={executeTrancheUpload}
                        confirmText="Yes, Upload File"
                    />
                </div>,
                document.body
            )}

            {/* ── HEADER ── */}
            <div className="ld-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div>
                        <h2 className="ld-section-title"><CalendarCheck size={20} /> Compliance &amp; Attendance</h2>
                        <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', margin: '4px 0 0 28px' }}>
                            A complete history of your daily campus check-ins and structured workplace logbook entries.
                        </p>
                    </div>
                </div>
            </div>

            {/* ── UNIFIED TABS ── */}
            <div className="lfm-tabs" style={{ marginBottom: 0 }}>
                <button className={`lfm-tab ${activeTab === 'campus' ? 'active' : ''}`} onClick={() => setActiveTab('campus')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}>
                    <CalendarCheck size={16} /> Campus Attendance
                </button>
                {learnerHasEmployer && (
                    <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')}>
                        <Briefcase size={16} /> Unified Workplace Logbook
                    </button>
                )}
            </div>

            {/* ════ CAMPUS ATTENDANCE VIEW ════ */}
            {activeTab === 'campus' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    
                    <div className="mc-cards-wrapper">
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Attendance Ratio</div>
                                </div>
                                <Award size={20} color="var(--mlab-blue)" />
                            </div>
                            <div className="mc-pct" style={{ color: MIDNIGHT }}>{stats.ratio}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Tracked Sessions</div>
                                </div>
                                <CalendarCheck size={20} color="var(--mlab-blue)" />
                            </div>
                            <div className="mc-pct" style={{ color: MIDNIGHT }}>{stats.total}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Days Present</div>
                                </div>
                                <CheckCircle2 size={20} color="var(--mlab-green)" />
                            </div>
                            <div className="mc-pct" style={{ color: '#16a34a' }}>{stats.presentCount}</div>
                        </div>
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Campus Attendance</div>
                                    <div className="mc-title">Days Absent</div>
                                </div>
                                <AlertTriangle size={20} color="var(--mlab-red)" />
                            </div>
                            <div className="mc-pct" style={{ color: '#dc2626' }}>{stats.absentCount}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '0', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', marginRight: 16, alignItems: 'center', borderRadius: 0 }}>
                                <Layers size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px 0 32px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Registered Classes</option>
                                    {uniqueLedgerCohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', alignItems: 'center', borderRadius: 0 }}>
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
                            <button className={`ld-filter-chip ${filterStatus === 'all' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setFilterStatus('all')}>All Statuses</button>
                            <button className={`ld-filter-chip ${filterStatus === 'present' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setFilterStatus('present')}>Present Only</button>
                            <button className={`ld-filter-chip ${filterStatus === 'absent' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setFilterStatus('absent')}>Absent Only</button>
                        </div>
                    </div>

                    <div className="mlab-table-wrap" style={{ border: '1px solid var(--mlab-border)', borderRadius: '0', background: 'white' }}>
                        <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                            <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                <tr>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Session Date</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Enrolled Cohort</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Status</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Check In</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Lunch Out</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Lunch In</th>
                                    <th style={{ color: 'var(--mlab-grey)', borderBottom: '2px solid var(--mlab-border)', borderTop: 'none', borderRadius: 0 }}>Check Out</th>
                                </tr>
                            </thead>
                            <tbody>
                                {finalFilteredDisplayLedger.map((record, idx) => (
                                    <tr key={idx} style={{ background: record.type === 'absent' ? '#fef2f2' : 'white' }}>
                                        <td><strong style={{ color: MIDNIGHT }}>{moment(record.dateObj).format('ddd, DD MMM YYYY')}</strong></td>
                                        <td><span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: MIDNIGHT, letterSpacing: '0.02em' }}>{record.cohortName}</span></td>
                                        <td>
                                            {record.type === 'present' ? (
                                                <span className="ld-badge" style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 0 }}><CheckCircle size={10} /> Present</span>
                                            ) : (
                                                <span className="ld-badge" style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca', borderRadius: 0 }}><AlertTriangle size={10} /> Absent</span>
                                            )}
                                        </td>
                                        {record.type === 'absent' ? (
                                            <td colSpan={4} style={{ color: '#dc2626', fontStyle: 'italic', fontSize: '0.85rem' }}>No scans recorded for this session. A compliance deduction penalty has been applied.</td>
                                        ) : (
                                            <>
                                                <td>{record.checkInAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#16a34a" /> {moment(record.checkInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.lunchOutAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchOutAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.lunchInAt ? <span style={{ color: '#ea580c', fontWeight: 600 }}>{moment(record.lunchInAt).format('HH:mm')}</span> : <span style={{ color: '#94a3b8' }}>--:--</span>}</td>
                                                <td>{record.checkOutAt ? <span style={{ color: MIDNIGHT, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}><ArrowDownToLine size={12} color="#dc2626" style={{ transform: 'rotate(180deg)' }} /> {moment(record.checkOutAt).format('HH:mm')}</span> : <span className="ld-badge" style={{ background: '#fef3c7', color: '#b45309', border: 'none', padding: '2px 6px', fontSize: '0.7rem', borderRadius: 0 }}>Missed</span>}</td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ════ WORKPLACE LOGS VIEW (UNIFIED WITH EMPLOYERS & COMPLIANCE VAULT) ════ */}
            {activeTab === 'workplace' && (
                <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

                    {/* 🚀 LOGBOOK HOURS TRACKER & STIPEND ROW USING MLAB CARDS */}
                    <div className="mc-cards-wrapper">
                        
                        {/* Hours Tracker Card */}
                        <div className="mc mc-k">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Workplace</div>
                                    <div className="mc-title">Logbook Hours Tracker</div>
                                </div>
                                <button 
                                    className="lfm-btn lfm-btn--primary" 
                                    onClick={() => onOpenLogModal()}
                                    style={{ border: 'none', padding: '6px 12px', fontSize: '0.75rem', borderRadius: 0, height: 'auto' }}
                                >
                                    <CheckSquare size={14} /> Log Hours
                                </button>
                            </div>
                            
                            <div className="mc-bars">
                                <div className="mc-bar-meta">
                                    <span className="mc-bar-lbl">Progress to 1600 Hrs</span>
                                    <span className="mc-bar-val">{hoursStats.progressPct}%</span>
                                </div>
                                <div className="mc-track">
                                    <div className="mc-fill mc-fill-primary" style={{ width: `${hoursStats.progressPct}%` }} title="Approved" />
                                </div>
                            </div>
                            
                            <div className="mc-footer" style={{ borderTop: 'none', paddingTop: 0, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', width: '100%', marginTop: 'auto' }}>
                                <div>
                                    <div style={{ fontSize: "0.65rem", color: "#166534", fontWeight: 700, marginBottom: '2px' }}>APPROVED</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#166534" }}>{hoursStats.approvedWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                                <div style={{ borderLeft: '1px solid var(--mlab-border)', paddingLeft: '8px' }}>
                                    <div style={{ fontSize: "0.65rem", color: "#b45309", fontWeight: 700, marginBottom: '2px' }}>PENDING</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#b45309" }}>{hoursStats.pendingWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                                <div style={{ borderLeft: '1px solid var(--mlab-border)', paddingLeft: '8px' }}>
                                    <div style={{ fontSize: "0.65rem", color: "var(--mlab-red)", fontWeight: 700, marginBottom: '2px' }}>REJECTED</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--mlab-red)" }}>{hoursStats.rejectedWpHours.toFixed(1)} <span style={{ fontSize: '0.65rem', fontWeight: 500 }}>hrs</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Stipend Card */}
                        <div className="mc">
                            <div className="mc-hdr">
                                <div>
                                    <div className="mc-label">Finance & Rebates</div>
                                    <div className="mc-title">Earned This Month</div>
                                </div>
                                <Landmark size={20} color="var(--mlab-blue)" />
                            </div>
                            
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '10px' }}>
                                <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', fontSize: '2rem' }}>
                                    {isEmploymentLoading || isHolidaysLoading ? (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem', color: '#64748b' }}>
                                            <Loader2 size={14} className="animate-spin" /> Verifying...
                                        </span>
                                    ) : formatCurrency(stats.currentMonthEarnedStipend)}
                                </h3>
                                {!isEmploymentLoading && !isHolidaysLoading && stats.currentMonthEarnedStipend < stats.baseStipendUsed && (
                                    <span style={{ fontSize: '0.85rem', color: '#94a3b8', textDecoration: 'line-through' }}>
                                        {formatCurrency(stats.baseStipendUsed)}
                                    </span>
                                )}
                            </div>
                            
                            <div className="mc-footer" style={{ marginTop: 'auto' }}>
                                <span className="mc-status" style={{ color: stats.currentMonthEarnedStipend < stats.baseStipendUsed ? '#dc2626' : '#16a34a' }}>
                                    <Calendar size={12} />
                                    {isHolidaysLoading ? 'Calculating Days...' : `${stats.currentMonthApprovedDays} / ${stats.expectedWorkingDaysThisMonth} Days Logged`}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* SEARCH & FILTERS TOOLBAR */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '1rem', borderRadius: '0', border: '1px solid var(--mlab-border)', flexWrap: 'wrap', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', flex: 1, minWidth: '220px', alignItems: 'center', borderRadius: 0 }}>
                                <Search size={16} style={{ marginLeft: '12px', color: 'var(--mlab-grey)' }} />
                                <input type="text" placeholder="Search tasks, codes, or topics..." value={wpSearch} onChange={(e) => setWpSearch(e.target.value)} className="ld-search-input" style={{ paddingLeft: '8px' }} />
                                {wpSearch && <button className="ld-clear-btn" onClick={() => setWpSearch('')}><XCircle size={14} /></button>}
                            </div>

                            <div className="ld-search-box" style={{ margin: 0, display: 'flex', minWidth: '150px', alignItems: 'center', borderRadius: 0 }}>
                                <Calendar size={16} style={{ marginLeft: '12px', color: 'var(--mlab-blue)' }} />
                                <select value={wpMonthFilter} onChange={(e) => setWpMonthFilter(e.target.value)} style={{ border: 'none', background: 'transparent', outline: 'none', color: MIDNIGHT, fontWeight: 700, fontSize: '0.82rem', padding: '0 8px', cursor: 'pointer', width: '100%', textTransform: 'uppercase' }}>
                                    <option value="all">All Months</option>
                                    {wpAvailableMonths.map(month => <option key={month} value={month}>{moment(month, 'YYYY-MM').format('MMMM YYYY')}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="ld-filter-chips">
                            <button className={`ld-filter-chip ${wpStatusFilter === 'all' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setWpStatusFilter('all')}>All</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Draft' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setWpStatusFilter('Draft')}>Drafts</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Pending_Mentor_Approval' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setWpStatusFilter('Pending_Mentor_Approval')}>Pending</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Approved' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setWpStatusFilter('Approved')}>Approved</button>
                            <button className={`ld-filter-chip ${wpStatusFilter === 'Rejected' ? 'active' : ''}`} style={{ borderRadius: 0 }} onClick={() => setWpStatusFilter('Rejected')}>Rejected</button>
                        </div>
                    </div>

                    {/* 🚀 UNIFIED EMPLOYMENT & LOGS ACCORDIONS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {isEmploymentLoading ? (
                            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
                                <Loader2 size={32} className="animate-spin" color="var(--mlab-blue)" />
                            </div>
                        ) : placementsHistory.length === 0 && unassignedLogs && Object.keys(unassignedLogs).length === 0 ? (
                            <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '0', border: '1px solid var(--mlab-border)' }}>
                                <History size={48} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT }}>No Entries Found</h3>
                                <p style={{ color: 'var(--mlab-grey)', margin: 0, fontSize: '0.9rem', textTransform: 'none' }}>No logbook or employment records match your current filters.</p>
                            </div>
                        ) : (
                            <>
                                {mappedPlacements.map((place: any, idx: number) => {
                                    const isActive = ['active placement', 'active', 'pending match'].includes(String(place.status).toLowerCase());
                                    const isEmpExpanded = expandedEmployers.has(place.placementId);

                                    return (
                                        <div key={place.placementId || idx} style={{ background: 'white', borderRadius: '0', border: `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

                                            {/* Employer Header / Trigger */}
                                            <div onClick={() => toggleEmployerAccordion(place.placementId)} style={{ padding: '1.25rem', background: isActive ? '#f0fdf4' : '#f8fafc', borderBottom: isEmpExpanded ? `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', cursor: 'pointer' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ background: isActive ? '#166534' : 'var(--mlab-midnight)', padding: '10px', borderRadius: '0', color: 'white' }}>
                                                        <Building2 size={20} />
                                                    </div>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '1.15rem', color: isActive ? '#14532d' : MIDNIGHT, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                            {place.employer?.name || 'Registered Host Employer'}
                                                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isActive ? '#166534' : 'var(--mlab-grey)', opacity: 0.8, textTransform: 'none' }}>
                                                                ({place.startDate ? moment(place.startDate).format('YYYY') : ''} Term)
                                                            </span>
                                                            <span style={{
                                                                background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#166534' : '#475569', padding: '2px 8px', borderRadius: '0', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: `1px solid ${isActive ? '#86efac' : '#cbd5e1'}`
                                                            }}>
                                                                {isActive ? 'Active Placement' : 'Past Placement'}
                                                            </span>
                                                        </h3>
                                                        <div style={{ fontSize: '0.8rem', color: isActive ? '#166534' : 'var(--mlab-grey)', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <Calendar size={12} />
                                                            Started: {place.startDate ? moment(place.startDate).format('DD MMM YYYY') : 'Unknown'}
                                                            {place.endDate && ` - Ended: ${moment(place.endDate).format('DD MMM YYYY')}`}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                    {/* ADD LOGBOOK ENTRY BUTTON */}
                                                    {isActive && (
                                                        <button
                                                            className="mlab-btn mlab-btn--primary"
                                                            onClick={(e) => {
                                                                e.stopPropagation(); 
                                                                onOpenLogModal(undefined, {
                                                                    placementId: place.placementId,
                                                                    employerId: place.employer?.id,
                                                                    mentorId: place.mentor?.id
                                                                });
                                                            }}
                                                            style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto', marginRight: '8px', borderRadius: 0 }}
                                                        >
                                                            <Plus size={14} /> Add Entry
                                                        </button>
                                                    )}
                                                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '0', border: '1px solid #e2e8f0' }}>
                                                        {place.logs.length} Total Log(s)
                                                    </span>
                                                    {isEmpExpanded ? <ChevronUp size={20} color={MIDNIGHT} /> : <ChevronDown size={20} color={MIDNIGHT} />}
                                                </div>
                                            </div>

                                            {/* Employer Body */}
                                            {isEmpExpanded && (
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>

                                                    {/* Company Metadata Row as mc-cards */}
                                                    <div className="mc-cards-wrapper" style={{ padding: '1.25rem', margin: 0, borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                                                        <div className="mc" style={{ padding: '1rem' }}>
                                                            <div className="mc-hdr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                                <div>
                                                                    <div className="mc-label">Organization Details</div>
                                                                    <div className="mc-title" style={{ fontSize: '0.9rem' }}>Contact Info</div>
                                                                </div>
                                                                <MapPin size={18} color="var(--mlab-blue)" />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <Phone size={14} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
                                                                    <span>{place.employer?.contactPhone || 'Phone unlisted'}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <Mail size={14} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
                                                                    <span>{place.employer?.contactEmail || 'Email unlisted'}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mc" style={{ padding: '1rem' }}>
                                                            <div className="mc-hdr" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                                                                <div>
                                                                    <div className="mc-label">Workplace Supervision</div>
                                                                    <div className="mc-title" style={{ fontSize: '0.9rem' }}>Assigned Mentor</div>
                                                                </div>
                                                                <UserCircle size={18} color="var(--mlab-blue)" />
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <strong style={{ color: MIDNIGHT }}>Name:</strong>
                                                                    <span>{place.mentor?.fullName || place.mentor?.firstName || 'Pending Assignment'}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.85rem', color: '#334155' }}>
                                                                    <strong style={{ color: MIDNIGHT }}>Contact:</strong>
                                                                    <span>{place.mentor?.email || place.mentor?.phone || 'N/A'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 🚀 COMPLIANCE VAULT & TRANCHES */}
                                                    {place.complianceSchema?.tranches && place.complianceSchema.tranches.length > 0 && (
                                                        <div style={{ padding: '1.25rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
                                                            <h4 style={{ margin: "0 0 1rem 0", fontSize: "0.85rem", textTransform: "uppercase", color: "var(--mlab-midnight)", display: "flex", alignItems: "center", gap: "8px" }}>
                                                                <ShieldCheck size={16} color="var(--mlab-blue)" /> Compliance Vault & Document Uploads
                                                            </h4>
                                                            
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                                {place.complianceSchema.tranches.map((tranche: any, index: number) => {
                                                                    const dueDate = moment(place.startDate).add(tranche.dueAtMonth, 'months');
                                                                    const isOverdue = moment().isAfter(dueDate) && tranche.requirements.some((r: any) => r.required && !place.evidenceMap?.[`${tranche.trancheId}_${r.id}`]);

                                                                    return (
                                                                        <div key={tranche.trancheId} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                    <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: isOverdue ? '#fef2f2' : 'var(--mlab-light-blue)', color: isOverdue ? '#dc2626' : 'var(--mlab-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 800, border: `1px solid ${isOverdue ? '#fca5a5' : 'var(--mlab-blue)'}` }}>
                                                                                        {index + 1}
                                                                                    </div>
                                                                                    <h5 style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-midnight)', fontWeight: 700 }}>{tranche.title}</h5>
                                                                                </div>
                                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '4px 8px', borderRadius: '0', background: isOverdue ? '#fef2f2' : '#f8fafc', color: isOverdue ? '#dc2626' : '#64748b', border: `1px solid ${isOverdue ? '#fecaca' : '#e2e8f0'}` }}>
                                                                                    Due: {dueDate.format('DD MMM YYYY')}
                                                                                </span>
                                                                            </div>

                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '16px', borderLeft: `2px solid ${isOverdue ? '#fca5a5' : '#cbd5e1'}`, marginLeft: '11px', marginTop: '4px' }}>
                                                                                {tranche.requirements.map((req: any) => {
                                                                                    const compositeKey = `${tranche.trancheId}_${req.id}`;
                                                                                    const evidence = place.evidenceMap?.[compositeKey];
                                                                                    const isComplete = !!evidence;
                                                                                    const isUploading = uploadingTrancheKey === compositeKey;

                                                                                    return (
                                                                                        <div key={req.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '8px 12px', borderRadius: '0' }}>
                                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--mlab-midnight)', fontWeight: 600 }}>
                                                                                                {isComplete ? <CheckSquare size={14} color="#16a34a" /> : <Square size={14} color="#94a3b8" />}
                                                                                                {req.label}
                                                                                                {!req.required && <span style={{ fontSize: '0.55rem', background: '#e2e8f0', color: '#64748b', padding: '2px 4px', borderRadius: '0', textTransform: 'uppercase' }}>Optional</span>}
                                                                                            </div>

                                                                                            <div>
                                                                                                {isComplete ? (
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                                        {evidence.history && evidence.history.length > 0 && (
                                                                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', fontWeight: 800 }}>
                                                                                                                v{evidence.history.length + 1}
                                                                                                            </span>
                                                                                                        )}
                                                                                                        
                                                                                                        <a href={evidence.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.7rem', color: 'var(--mlab-blue)', textDecoration: 'none', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                                            <FileText size={12} /> {evidence.history?.length > 0 ? "View Latest" : "View File"}
                                                                                                        </a>

                                                                                                        <label style={{ fontSize: '0.65rem', color: '#475569', background: 'white', border: '1px solid #cbd5e1', padding: '2px 8px', borderRadius: '0', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                                                                            {isUploading ? <Loader2 size={10} className="wm-spin" /> : <UploadCloud size={10} />}
                                                                                                            {isUploading ? 'Uploading...' : 'Update'}
                                                                                                            <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => triggerLearnerTrancheUpload(e, tranche.trancheId, req, place.placementId)} disabled={isUploading} />
                                                                                                        </label>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                        {req.type === 'site_visit' ? (
                                                                                                            <span style={{ fontSize: '0.65rem', color: '#d97706', background: '#fffbeb', border: '1px solid #fde68a', padding: '4px 8px', borderRadius: '0', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                                                                                                                <Activity size={10} /> Awaiting Mentor
                                                                                                            </span>
                                                                                                        ) : req.type === 'report' ? (
                                                                                                            <span style={{ fontSize: '0.65rem', color: '#64748b', background: '#e2e8f0', padding: '4px 8px', borderRadius: '0', fontWeight: 700, textTransform: 'uppercase' }}>Auto-Generated</span>
                                                                                                        ) : (
                                                                                                            <label style={{ fontSize: '0.7rem', color: 'white', background: 'var(--mlab-blue)', padding: '4px 10px', borderRadius: '0', fontWeight: 700, cursor: isUploading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                                                {isUploading ? <Loader2 size={12} className="wm-spin" /> : <UploadCloud size={12} />}
                                                                                                                {req.type === 'pop' ? 'Upload PoP' : 'Upload File'}
                                                                                                                <input type="file" hidden accept=".pdf,image/*,.doc,.docx" onChange={(e) => triggerLearnerTrancheUpload(e, tranche.trancheId, req, place.placementId)} disabled={isUploading} />
                                                                                                            </label>
                                                                                                        )}
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Logs mapped to this placement */}
                                                    <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
                                                        <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: MIDNIGHT, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <FileText size={14} color="var(--mlab-blue)" /> Logbook Entries for this Placement
                                                        </h4>

                                                        {renderLogsGroupedByMonth(place.groupedLogs, place.employer)}
                                                    </div>

                                                </div>
                                            )}
                                        </div>
                                    );
                                })}

                                {/* ─── UNASSIGNED / FALLBACK LOGS ─── */}
                                {unassignedLogs && Object.keys(unassignedLogs).length > 0 && (
                                    <div style={{ background: 'white', borderRadius: '0', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginTop: '1rem' }}>
                                        <div style={{ padding: '1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ background: '#e2e8f0', padding: '10px', borderRadius: '0', color: '#475569' }}>
                                                    <Layers size={20} />
                                                </div>
                                                <div>
                                                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#334155', fontFamily: 'var(--font-heading)' }}>
                                                        General / Unassigned Logs
                                                    </h3>
                                                    <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '4px', fontWeight: 500 }}>
                                                        Logs not directly linked to a specific employer contract timeline.
                                                    </div>
                                                </div>
                                            </div>
                                            {learnerHasEmployer && (
                                                <button
                                                    className="mlab-btn mlab-btn--outline"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenLogModal();
                                                    }}
                                                    style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto', borderRadius: 0 }}
                                                >
                                                    <Plus size={14} /> Add Unassigned Entry
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
                                            {renderLogsGroupedByMonth(unassignedLogs, null)}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// // src/components/components/views/LearnerAttendanceView/LearnerAttendanceView.tsx

// import React, { useState, useMemo, useEffect } from 'react';
// import {
//     CalendarCheck, Clock, CheckCircle, AlertTriangle, Calendar, XCircle,
//     ArrowDownToLine, BookOpen, Layers, Briefcase, Plus, History,
//     FileText, Pencil, Search, ChevronDown, ChevronUp, ExternalLink,
//     Maximize2, Paperclip, Landmark, Loader2,
//     EyeOff, Eye, FileCode, Link2, MapPin, Phone, Mail, Building2, UserCircle, BadgeCheck
// } from 'lucide-react';
// import moment from 'moment';
// import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';

// import './LearnerAttendanceView.css';
// import { useStore } from '../../../store/useStore';
// import { WorkplaceLogViewerModal } from '../../../components/views/WorkplaceLogViewerModal/WorkplaceLogViewerModal';

// const MIDNIGHT = '#073f4e';
// const GREEN = '#94c73d';

// export interface AbsenceRecord {
//     date: string;
//     cohortId?: string;
//     cohortName?: string;
// }

// export interface LearnerAttendanceViewProps {
//     formattedScanHistory: any[];
//     absenceDates: (AbsenceRecord | string)[];
//     attendancePercentage: string;
//     cohorts: any[];
//     workplaceLogs: any[];
//     learnerHasEmployer: boolean;
//     stipendAmount?: number;
//     onOpenLogModal: (log?: any, placementContext?: { placementId?: string, employerId?: string, mentorId?: string }) => void;
// }

// // ─── 🚀 UPDATED: HELPER NOW ACCEPTS DYNAMIC API HOLIDAY ARRAY ───
// const getSAWorkingDaysInMonth = (year: number, month: number, holidaysList: string[]) => {
//     const start = moment([year, month, 1]);
//     const end = moment(start).endOf('month');
//     let days = 0;

//     let current = start.clone();
//     while (current.isSameOrBefore(end)) {
//         if (current.isoWeekday() !== 6 && current.isoWeekday() !== 7) {
//             if (!holidaysList.includes(current.format('YYYY-MM-DD'))) {
//                 days++;
//             }
//         }
//         current.add(1, 'days');
//     }
//     return days;
// };

// export const LearnerAttendanceView: React.FC<LearnerAttendanceViewProps> = ({
//     formattedScanHistory = [],
//     absenceDates = [],
//     attendancePercentage = "100%",
//     cohorts = [],
//     workplaceLogs = [],
//     learnerHasEmployer = false,
//     stipendAmount,
//     onOpenLogModal
// }) => {
//     const { user } = useStore() as any;

//     // ─── INTERNAL UI STATE ───
//     const [activeTab, setActiveTab] = useState<'campus' | 'workplace'>('campus');
//     const [filterStatus, setFilterStatus] = useState<'all' | 'present' | 'absent'>('all');
//     const [selectedCohortId, setSelectedCohortId] = useState<string>('all');
//     const [dateFilterMode, setDateFilterMode] = useState<'month' | 'week' | 'date'>('month');
//     const [dateSearch, setDateSearch] = useState('');

//     const [wpSearch, setWpSearch] = useState('');
//     const [wpStatusFilter, setWpStatusFilter] = useState<string>('all');
//     const [wpMonthFilter, setWpMonthFilter] = useState<string>('all');

//     const [expandedWpMonths, setExpandedWpMonths] = useState<Set<string>>(new Set([moment().format('MMMM YYYY')]));
//     const [expandedEmployers, setExpandedEmployers] = useState<Set<string>>(new Set());

//     const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);
//     const [previewCustomSeId, setPreviewCustomSeId] = useState<string | null>(null);
//     const [viewingLogDetails, setViewingLogDetails] = useState<any | null>(null);
//     const [viewingLogEmployer, setViewingLogEmployer] = useState<any>(null);

//     const [expandedHistoryIds, setExpandedHistoryIds] = useState<Set<string>>(new Set());

//     // ─── EMPLOYMENT HISTORY & STIPEND PIPELINE STATE ───
//     const [placementsHistory, setPlacementsHistory] = useState<any[]>([]);
//     const [directStipend, setDirectStipend] = useState<number | null>(null);
//     const [isEmploymentLoading, setIsEmploymentLoading] = useState<boolean>(false);

//     // ─── 🚀 NEW: DYNAMIC PUBLIC HOLIDAYS STATE ENGINE ───
//     const [publicHolidays, setPublicHolidays] = useState<string[]>([]);
//     const [isHolidaysLoading, setIsHolidaysLoading] = useState<boolean>(true);

//     const stableUserUid = user?.uid || '';
//     const stableIdNumber = user?.idNumber || '';
//     const fallbackSearchId = workplaceLogs.length > 0 ? workplaceLogs[0].learnerId : '';

//     // ─── 🚀 EFFECT 1: FETCH DYNAMIC SOUTH AFRICAN PUBLIC HOLIDAYS FROM API ───
//     useEffect(() => {
//         const fetchSAHolidaysFromApi = async () => {
//             setIsHolidaysLoading(true);
//             try {
//                 const queryYear = moment().year(); // Detect current calendar execution year context
//                 const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${queryYear}/ZA`);

//                 if (response.ok) {
//                     const data = await response.json();
//                     // Extract exact date strings array matching 'YYYY-MM-DD'
//                     const parsedDates = data.map((item: any) => item.date);
//                     setPublicHolidays(parsedDates);
//                 } else {
//                     throw new Error(`API Error response channel: ${response.status}`);
//                 }
//             } catch (err) {
//                 console.warn("⚠️ Holiday API channel down. Injecting structural safety fallback matrix.", err);
//                 // Resilient local fallback matrix in case of runtime connection dropouts
//                 setPublicHolidays([
//                     '2026-01-01', '2026-03-21', '2026-04-03', '2026-04-06', '2026-04-27',
//                     '2026-05-01', '2026-06-16', '2026-08-09', '2026-08-10', '2026-09-24',
//                     '2026-12-16', '2026-12-25', '2026-12-26'
//                 ]);
//             } finally {
//                 setIsHolidaysLoading(false);
//             }
//         };

//         fetchSAHolidaysFromApi();
//     }, []);

//     // Auto-expand most recent month
//     useEffect(() => {
//         if (workplaceLogs.length > 0) {
//             const mostRecentLog = [...workplaceLogs].sort((a, b) => new Date(b.dateString).getTime() - new Date(a.dateString).getTime())[0];
//             if (mostRecentLog?.dateString) {
//                 const recentMonth = moment(mostRecentLog.dateString).format('MMMM YYYY');
//                 setExpandedWpMonths(prev => new Set(prev).add(recentMonth));
//             }
//         }
//     }, [workplaceLogs]);

//     // Auto-expand the active employer placement
//     useEffect(() => {
//         if (placementsHistory.length > 0) {
//             const active = placementsHistory.find(p => ['active placement', 'active', 'pending match'].includes(String(p.status).toLowerCase()));
//             if (active) {
//                 setExpandedEmployers(prev => new Set(prev).add(active.placementId));
//             }
//         }
//     }, [placementsHistory]);

//     // ─── 🚀 UNIFIED EMPLOYMENT PIPELINE ───
//     useEffect(() => {
//         const fetchEmploymentProfile = async () => {
//             const rawHumanId = stableIdNumber || stableUserUid || fallbackSearchId;
//             if (!rawHumanId || !learnerHasEmployer) {
//                 setIsEmploymentLoading(false);
//                 return;
//             }

//             setIsEmploymentLoading(true);
//             try {
//                 const searchPool = [rawHumanId];
//                 const enrollmentsQ = query(collection(db, "enrollments"), where("learnerId", "==", rawHumanId));
//                 const enrollmentsSnap = await getDocs(enrollmentsQ);
//                 if (!enrollmentsSnap.empty) {
//                     searchPool.push(enrollmentsSnap.docs[0].id);
//                     if (enrollmentsSnap.docs[0].data()?.id) {
//                         searchPool.push(enrollmentsSnap.docs[0].data().id);
//                     }
//                 }
//                 const validSearchPool = [...new Set(searchPool)].filter(Boolean);

//                 const placementsQ = query(collection(db, "placements"), where("learnerId", "in", validSearchPool));
//                 const placementsSnap = await getDocs(placementsQ);

//                 if (!placementsSnap.empty) {
//                     const fetchedPlacements = placementsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
//                         .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

//                     const employerIds = [...new Set(fetchedPlacements.map((p: any) => p.employerId).filter(Boolean))];
//                     const mentorIds = [...new Set(fetchedPlacements.map((p: any) => p.mentorId).filter(Boolean))];

//                     const employersData: Record<string, any> = {};
//                     const mentorsData: Record<string, any> = {};

//                     if (employerIds.length > 0) {
//                         const empDocs = await Promise.all(employerIds.map(id => getDoc(doc(db, 'employers', id))));
//                         empDocs.forEach(d => { if (d.exists()) employersData[d.id] = d.data(); });
//                     }

//                     if (mentorIds.length > 0) {
//                         const mDocs = await Promise.all(mentorIds.map(id => getDoc(doc(db, 'users', id))));
//                         mDocs.forEach(d => { if (d.exists()) mentorsData[d.id] = d.data(); });
//                     }

//                     const compiledHistory = fetchedPlacements.map((p: any) => ({
//                         placementId: p.id,
//                         status: p.status || 'Past Placement',
//                         startDate: p.startDate || p.createdAt,
//                         endDate: p.endDate,
//                         stipendAmount: p.stipendAmount ?? p.stipend ?? p.allowance ?? p.wage,
//                         employer: p.employerId ? { id: p.employerId, ...employersData[p.employerId] } : null,
//                         mentor: p.mentorId ? { id: p.mentorId, ...mentorsData[p.mentorId] } : null,
//                     }));

//                     setPlacementsHistory(compiledHistory);

//                     const activePlace = compiledHistory.find(h => ['active placement', 'active', 'pending match'].includes(String(h.status).toLowerCase()));
//                     if (activePlace && activePlace.stipendAmount !== undefined && (!stipendAmount || stipendAmount === 0)) {
//                         setDirectStipend(Number(activePlace.stipendAmount));
//                     }
//                 }
//             } catch (err) {
//                 console.error("Pipeline failure:", err);
//             } finally {
//                 setIsEmploymentLoading(false);
//             }
//         };

//         fetchEmploymentProfile();
//     }, [stableIdNumber, stableUserUid, fallbackSearchId, learnerHasEmployer, stipendAmount]);

//     // ─── HELPER FUNCTIONS ───
//     const formatCurrency = (val: number) =>
//         new Intl.NumberFormat("en-ZA", {
//             style: "currency",
//             currency: "ZAR",
//             maximumFractionDigits: 0,
//         }).format(val || 0);

//     const isImageFile = (url: string) => {
//         if (!url) return false;
//         return /\.(jpeg|jpg|gif|png|webp|svg)$/i.test(url) ||
//             url.toLowerCase().includes('.png') ||
//             url.toLowerCase().includes('.jpg') ||
//             url.toLowerCase().includes('.jpeg');
//     };

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

//     const toggleEmployerAccordion = (placementId: string) => {
//         setExpandedEmployers(prev => {
//             const next = new Set(prev);
//             if (next.has(placementId)) next.delete(placementId); else next.add(placementId);
//             return next;
//         });
//     };

//     // ─── CAMPUS LEDGER COMPUTATION ───
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
//             const cId = typeof item === 'string' ? '' : (item.cohortId || '');
//             const matchedCohort = cohorts.find(c => c.name === cName || c.id === cId);
//             return {
//                 dateString: dateStr,
//                 type: 'absent',
//                 dateObj: new Date(dateStr),
//                 cohortId: matchedCohort ? matchedCohort.id : cId,
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

//     // ─── WORKPLACE LOGS & PLACEMENT MAPPING COMPUTATION ───
//     const wpAvailableMonths = useMemo(() => {
//         const months = new Set<string>();
//         workplaceLogs.forEach(log => {
//             if (log.dateString) months.add(moment(log.dateString).format('YYYY-MM'));
//         });
//         return Array.from(months).sort((a, b) => b.localeCompare(a));
//     }, [workplaceLogs]);

//     const filteredWpLogs = useMemo(() => {
//         return workplaceLogs.filter(log => {
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
//     }, [workplaceLogs, wpStatusFilter, wpMonthFilter, wpSearch]);

//     const { mappedPlacements, unassignedLogs } = useMemo(() => {
//         const assignedLogIds = new Set<string>();

//         const mapped = placementsHistory.map(place => {
//             const pLogs = filteredWpLogs.filter(log => {
//                 const logEmpId = log.employerId || log.rawLogData?.employerId;
//                 const logMentorId = log.mentorId || log.rawLogData?.mentorId;

//                 if (logEmpId && place.employer?.id && logEmpId === place.employer.id) return true;
//                 if (logMentorId && place.mentor?.id && logMentorId === place.mentor.id) return true;

//                 if (log.dateString && place.startDate) {
//                     const logDate = moment(log.dateString);
//                     const start = moment(place.startDate);
//                     const end = place.endDate ? moment(place.endDate) : moment().add(10, 'years');
//                     return logDate.isSameOrAfter(start) && logDate.isSameOrBefore(end);
//                 }
//                 return false;
//             });

//             pLogs.forEach(l => assignedLogIds.add(l.id));

//             const grouped: Record<string, any[]> = {};
//             pLogs.forEach(log => {
//                 const monthYear = moment(log.dateString).format('MMMM YYYY');
//                 if (!grouped[monthYear]) grouped[monthYear] = [];
//                 grouped[monthYear].push(log);
//             });

//             return { ...place, logs: pLogs, groupedLogs: grouped };
//         });

//         const unassigned = filteredWpLogs.filter(l => !assignedLogIds.has(l.id));
//         const unassignedGrouped: Record<string, any[]> = {};
//         unassigned.forEach(log => {
//             const monthYear = moment(log.dateString).format('MMMM YYYY');
//             if (!unassignedGrouped[monthYear]) unassignedGrouped[monthYear] = [];
//             unassignedGrouped[monthYear].push(log);
//         });

//         return { mappedPlacements: mapped, unassignedLogs: unassignedGrouped };
//     }, [placementsHistory, filteredWpLogs]);

//     const totalWorkplaceHours = useMemo(() => {
//         return workplaceLogs
//             .filter(log => String(log.status || "").trim().toLowerCase() === 'approved')
//             .reduce((sum, log) => sum + (Number(log.totalHours) || 0), 0);
//     }, [workplaceLogs]);

//     const stats = useMemo(() => {
//         const presentCount = cohortFilteredLedger.filter(r => r.type === 'present').length;
//         const absentCount = cohortFilteredLedger.filter(r => r.type === 'absent').length;
//         const total = presentCount + absentCount;
//         const ratio = total === 0 ? "100%" : Math.round((presentCount / total) * 100) + "%";

//         const currentYear = moment().year();
//         const currentMonth = moment().month();
//         const currentMonthStr = moment().format('YYYY-MM');

//         // 🚀 INJECT REAL-TIME RESOLVED PUBLIC HOLIDAYS STATE MAPPED VIA API ENDPOINTS
//         const expectedWorkingDaysThisMonth = getSAWorkingDaysInMonth(currentYear, currentMonth, publicHolidays);

//         const approvedDatesThisMonth = new Set(
//             workplaceLogs
//                 .filter((l: any) => l.dateString && l.dateString.startsWith(currentMonthStr))
//                 .filter((l: any) => String(l.status || "").trim().toLowerCase() === "approved")
//                 .map((l: any) => l.dateString)
//         );
//         const currentMonthApprovedDays = approvedDatesThisMonth.size;
//         const baseWageAmount = Number(stipendAmount) || directStipend || 0;

//         let currentMonthEarnedStipend = baseWageAmount;
//         if (expectedWorkingDaysThisMonth > 0 && baseWageAmount > 0) {
//             const calculatedProRata = (currentMonthApprovedDays / expectedWorkingDaysThisMonth) * baseWageAmount;
//             currentMonthEarnedStipend = Math.min(calculatedProRata, baseWageAmount);
//         }

//         return {
//             total, presentCount, absentCount, ratio,
//             currentMonthApprovedDays, expectedWorkingDaysThisMonth,
//             currentMonthEarnedStipend, baseStipendUsed: baseWageAmount
//         };
//     }, [cohortFilteredLedger, workplaceLogs, stipendAmount, directStipend, publicHolidays]); // Added publicHolidays reactive link observer

//     // ─── RENDER HELPER FOR LOGS ───
//     const renderLogsGroupedByMonth = (groupedLogs: Record<string, any[]>, passedEmployer?: any) => {
//         if (Object.keys(groupedLogs).length === 0) {
//             return (
//                 <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '2rem 1rem', background: '#f8fafc', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
//                     <History size={32} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
//                     <h4 style={{ fontFamily: 'var(--font-heading)', color: '#64748b', margin: 0 }}>No Logs Found</h4>
//                     <p style={{ color: 'var(--mlab-grey)', margin: '4px 0 0', fontSize: '0.8rem', textTransform: 'none' }}>No entries match the current timeline or filters.</p>
//                 </div>
//             );
//         }

//         return Object.keys(groupedLogs).map(monthLabel => {
//             const monthLogs = groupedLogs[monthLabel];
//             const isOpen = expandedWpMonths.has(monthLabel);
//             const totalMonthHours = monthLogs.reduce((sum: number, log: any) => sum + (Number(log.totalHours) || 0), 0);

//             return (
//                 <div key={monthLabel} style={{ background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', marginBottom: '1rem' }}>
//                     <div onClick={() => toggleWpMonthAccordion(monthLabel)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', background: isOpen ? '#f8fafc' : 'white', borderBottom: isOpen ? '1px solid var(--mlab-border)' : 'none', cursor: 'pointer' }}>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                             <div style={{ background: 'var(--mlab-blue-light)', padding: '6px', borderRadius: '6px', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//                                 <Calendar size={16} color={'white'} />
//                             </div>
//                             <div>
//                                 <h4 style={{ margin: 0, fontSize: '1rem', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{monthLabel}</h4>
//                                 <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>{monthLogs.length} Entry(s)</span>
//                             </div>
//                         </div>
//                         <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                             <div style={{ background: '#f1f5f9', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                 <Clock size={12} /> {totalMonthHours.toFixed(1)} hrs
//                             </div>
//                             {isOpen ? <ChevronUp size={18} color="#64748b" /> : <ChevronDown size={18} color="#64748b" />}
//                         </div>
//                     </div>

//                     {isOpen && (
//                         <div style={{ display: 'flex', flexDirection: 'column', padding: '1rem', gap: '1rem', background: '#fafbfc' }}>
//                             {monthLogs.map((log: any) => {
//                                 const entryVersions = log.history && log.history.length > 0
//                                     ? [...log.history, log].sort((a: any, b: any) => {
//                                         const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
//                                         const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
//                                         return timeB - timeA;
//                                     })
//                                     : [log];

//                                 return (
//                                     <div key={log.id} style={{ background: 'white', border: `1px solid ${log.status === 'Rejected' ? '#fecaca' : 'var(--mlab-border)'}`, borderRadius: '8px', padding: '1rem' }}>
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
//                                             <div>
//                                                 <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: MIDNIGHT, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                     {moment(log.dateString).format('dddd, DD MMM YYYY')}
//                                                     {(log.evidenceUrl || (log.customEvidenceTracking && log.customEvidenceTracking.length > 0)) && (
//                                                         <span title="Supporting evidence attached" style={{ display: 'inline-flex' }}>
//                                                             <Paperclip size={13} color="var(--mlab-blue)" />
//                                                         </span>
//                                                     )}
//                                                 </div>
//                                                 <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', fontWeight: 600 }}>
//                                                     <Clock size={12} /> {log.startTime} - {log.endTime} <span style={{ color: '#ea580c' }}>({log.totalHours} hrs)</span>
//                                                 </div>
//                                             </div>

//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 {log.status === 'Draft' && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #cbd5e1' }}>Draft</span>}
//                                                 {log.status === 'Pending_Mentor_Approval' && (
//                                                     <span style={{ background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fde68a', display: 'flex', gap: '4px', alignItems: 'center' }}>
//                                                         <Clock size={10} /> Pending
//                                                     </span>
//                                                 )}
//                                                 {log.status === 'Approved' && <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #bbf7d0', display: 'flex', gap: '4px', alignItems: 'center' }}><CheckCircle size={10} /> Approved</span>}
//                                                 {log.status === 'Rejected' && <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', border: '1px solid #fecaca', display: 'flex', gap: '4px', alignItems: 'center' }}><XCircle size={10} /> Rejected</span>}

//                                                 {['Draft', 'Rejected'].includes(log.status) && (
//                                                     <button onClick={() => {
//                                                         setViewingLogEmployer(passedEmployer || null);
//                                                         onOpenLogModal(log);
//                                                     }} style={{ background: log.status === 'Rejected' ? '#fef2f2' : 'var(--mlab-blue-light)', border: `1px solid ${log.status === 'Rejected' ? '#fca5a5' : 'transparent'}`, padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: log.status === 'Rejected' ? '#be123c' : 'var(--mlab-blue)' }}><Pencil size={10} /> Fix</button>
//                                                 )}

//                                                 <button onClick={() => {
//                                                     setViewingLogDetails(log);
//                                                     setViewingLogEmployer(passedEmployer || null);
//                                                 }} style={{ background: 'white', border: '1px solid #cbd5e1', padding: '2px 6px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', color: '#475569' }}><Maximize2 size={10} /> View</button>
//                                             </div>
//                                         </div>

//                                         {log.isQctoAligned && (
//                                             <div style={{ fontSize: '0.8rem', color: '#0369a1', background: '#e0f2fe', padding: '4px 10px', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem', fontWeight: 600, border: '1px dashed #7dd3fc' }}><BookOpen size={12} /> {log.workActivityCode}: {log.workActivityLabel}</div>
//                                         )}

//                                         <div
//                                             style={{ margin: 0, fontSize: '0.8rem', color: '#475569', lineHeight: 1.6, background: '#f8fafc', padding: '12px', borderRadius: '6px', borderLeft: '3px solid #cbd5e1', maxHeight: '100px', overflow: 'hidden' }}
//                                             className="quill-content-display"
//                                             dangerouslySetInnerHTML={{ __html: log.tasksPerformed || '<span style="font-style:italic; color:#94a3b8">Empty description...</span>' }}
//                                         />

//                                         {((log.customEvidenceTracking && log.customEvidenceTracking.length > 0) || log.evidenceUrl) && (
//                                             <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
//                                                 {log.customEvidenceTracking?.length > 0 && (
//                                                     <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', padding: '2px 8px', borderRadius: '12px' }}>
//                                                         <FileCode size={10} /> {log.customEvidenceTracking.length} Custom Artifacts
//                                                     </span>
//                                                 )}
//                                                 {log.evidenceUrl && (
//                                                     <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '4px', background: '#f1f5f9', padding: '2px 8px', borderRadius: '12px', border: '1px solid #cbd5e1' }}>
//                                                         <Paperclip size={10} /> Legacy Attachment
//                                                     </span>
//                                                 )}
//                                             </div>
//                                         )}
//                                     </div>
//                                 );
//                             })}
//                         </div>
//                     )}
//                 </div>
//             );
//         });
//     };

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

//                 /* 🌐 Multi-line Dynamic Evidence CSS Blocks */
//                 .attendance-se-stack { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; width: 100%; }
//                 .attendance-se-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
//                 .attendance-se-meta-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; width: 100%; }
//                 .attendance-se-badge { background: #e0e7ff; color: #4338ca; font-weight: 800; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
//                 .attendance-se-chip-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
//                 .attendance-se-tag { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 700; font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; }
//             `}} />

//             {/* Shared detail preview modal canvas container invocation */}
//             {viewingLogDetails && (
//                 <WorkplaceLogViewerModal
//                     log={viewingLogDetails}
//                     allowEdit={true}
//                     preloadedEmployer={viewingLogEmployer ? {
//                         companyName: viewingLogEmployer.name,
//                         address: viewingLogEmployer.physicalAddress || viewingLogEmployer.address || 'Address missing in system',
//                         workTelephone: viewingLogEmployer.contactPhone || 'Phone unlisted',
//                         email: viewingLogEmployer.contactEmail || 'Email unlisted'
//                     } : null}
//                     onEdit={(logToEdit) => {
//                         setViewingLogDetails(null);
//                         setViewingLogEmployer(null);
//                         onOpenLogModal(logToEdit);
//                     }}
//                     onClose={() => {
//                         setViewingLogDetails(null);
//                         setViewingLogEmployer(null);
//                     }}
//                 />
//             )}

//             {/* ── HEADER ── */}
//             <div className="ld-section-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 0 }}>
//                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
//                     <div>
//                         <h2 className="ld-section-title"><CalendarCheck size={20} /> Compliance &amp; Attendance</h2>
//                         <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', margin: '4px 0 0 28px' }}>
//                             A complete history of your daily campus check-ins and structured workplace logbook entries.
//                         </p>
//                     </div>
//                 </div>
//             </div>

//             {/* ── UNIFIED TABS ── */}
//             <div className="lfm-tabs" style={{ marginBottom: 0 }}>
//                 <button className={`lfm-tab ${activeTab === 'campus' ? 'active' : ''}`} onClick={() => setActiveTab('campus')} style={{ fontSize: '0.8rem', padding: '0.75rem 1.5rem' }}>
//                     <CalendarCheck size={16} /> Campus Attendance
//                 </button>
//                 {learnerHasEmployer && (
//                     <button className={`lfm-tab ${activeTab === 'workplace' ? 'active' : ''}`} onClick={() => setActiveTab('workplace')}>
//                         <Briefcase size={16} /> Unified Workplace Logbook
//                     </button>
//                 )}
//             </div>

//             {/* ════ CAMPUS ATTENDANCE VIEW ════ */}
//             {activeTab === 'campus' && (
//                 <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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

//             {/* ════ WORKPLACE LOGS VIEW (UNIFIED WITH EMPLOYERS) ════ */}
//             {activeTab === 'workplace' && (
//                 <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

//                     {/* STATS ROW */}
//                     <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
//                         <div style={{ display: 'flex', gap: '1rem', background: '#f0fdf4', padding: '1.25rem', borderRadius: '12px', border: '1px solid #bbf7d0', alignItems: 'center' }}>
//                             <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '50%' }}>
//                                 <CheckCircle size={28} color="#166534" />
//                             </div>
//                             <div>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#166534', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verified Mentor Hours</p>
//                                 <h3 style={{ margin: '4px 0 0', color: '#14532d', fontSize: '2rem' }}>
//                                     {totalWorkplaceHours.toFixed(1)} <span style={{ fontSize: '1rem', color: '#15803d' }}>Hours Approved</span>
//                                 </h3>
//                             </div>
//                         </div>

//                         <div style={{ display: 'flex', gap: '1rem', background: 'white', padding: '1.25rem', borderRadius: '12px', border: '1px solid var(--mlab-border)', alignItems: 'center' }}>
//                             <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '50%' }}>
//                                 <Landmark size={28} color="var(--mlab-midnight)" />
//                             </div>
//                             <div style={{ flex: 1 }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--mlab-grey)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Earned This Month</p>
//                                     <span style={{ fontSize: '0.75rem', fontWeight: 600, color: stats.currentMonthEarnedStipend < stats.baseStipendUsed ? '#dc2626' : '#16a34a' }}>
//                                         {isHolidaysLoading ? (
//                                             <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Calculating Days...</span>
//                                         ) : `${stats.currentMonthApprovedDays} / ${stats.expectedWorkingDaysThisMonth} Days Logged`}
//                                     </span>
//                                 </div>
//                                 <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', margin: '4px 0 0' }}>
//                                     <h3 style={{ margin: 0, color: 'var(--mlab-midnight)', fontSize: '2rem' }}>
//                                         {isEmploymentLoading || isHolidaysLoading ? (
//                                             <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1.2rem', color: '#64748b' }}>
//                                                 <Loader2 size={16} className="animate-spin" /> Verifying...
//                                             </span>
//                                         ) : formatCurrency(stats.currentMonthEarnedStipend)}
//                                     </h3>
//                                     {!isEmploymentLoading && !isHolidaysLoading && stats.currentMonthEarnedStipend < stats.baseStipendUsed && (
//                                         <span style={{ fontSize: '0.9rem', color: '#94a3b8', textDecoration: 'line-through' }}>
//                                             {formatCurrency(stats.baseStipendUsed)}
//                                         </span>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>
//                     </div>

//                     {/* SEARCH & FILTERS TOOLBAR */}
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

//                     {/* 🚀 UNIFIED EMPLOYMENT & LOGS ACCORDIONS */}
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                         {isEmploymentLoading ? (
//                             <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
//                                 <Loader2 size={32} className="animate-spin" color="var(--mlab-blue)" />
//                             </div>
//                         ) : placementsHistory.length === 0 && unassignedLogs && Object.keys(unassignedLogs).length === 0 ? (
//                             <div style={{ textTransform: 'uppercase', textAlign: 'center', padding: '4rem 1rem', background: 'white', borderRadius: '12px', border: '1px solid var(--mlab-border)' }}>
//                                 <History size={48} color="var(--mlab-grey-lt)" style={{ margin: '0 auto 1rem' }} />
//                                 <h3 style={{ fontFamily: 'var(--font-heading)', color: MIDNIGHT }}>No Entries Found</h3>
//                                 <p style={{ color: 'var(--mlab-grey)', margin: 0, fontSize: '0.9rem', textTransform: 'none' }}>No logbook or employment records match your current filters.</p>
//                             </div>
//                         ) : (
//                             <>
//                                 {mappedPlacements.map((place: any, idx: number) => {
//                                     const isActive = ['active placement', 'active', 'pending match'].includes(String(place.status).toLowerCase());
//                                     const isEmpExpanded = expandedEmployers.has(place.placementId);

//                                     return (
//                                         <div key={place.placementId || idx} style={{ background: 'white', borderRadius: '12px', border: `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}`, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>

//                                             {/* Employer Header / Trigger */}
//                                             <div onClick={() => toggleEmployerAccordion(place.placementId)} style={{ padding: '1.25rem', background: isActive ? '#f0fdf4' : '#f8fafc', borderBottom: isEmpExpanded ? `1px solid ${isActive ? '#bbf7d0' : 'var(--mlab-border)'}` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', cursor: 'pointer' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                                     <div style={{ background: isActive ? '#166534' : 'var(--mlab-midnight)', padding: '10px', borderRadius: '8px', color: 'white' }}>
//                                                         <Building2 size={20} />
//                                                     </div>
//                                                     <div>
//                                                         <h3 style={{ margin: 0, fontSize: '1.15rem', color: isActive ? '#14532d' : MIDNIGHT, fontFamily: 'var(--font-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                             {place.employer?.name || 'Registered Host Employer'}
//                                                             <span style={{
//                                                                 background: isActive ? '#dcfce7' : '#f1f5f9', color: isActive ? '#166534' : '#475569', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', border: `1px solid ${isActive ? '#86efac' : '#cbd5e1'}`
//                                                             }}>
//                                                                 {isActive ? 'Active Placement' : 'Past Placement'}
//                                                             </span>
//                                                         </h3>
//                                                         <div style={{ fontSize: '0.8rem', color: isActive ? '#166534' : 'var(--mlab-grey)', marginTop: '4px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                             <Calendar size={12} />
//                                                             Started: {place.startDate ? moment(place.startDate).format('DD MMM YYYY') : 'Unknown'}
//                                                             {place.endDate && ` - Ended: ${moment(place.endDate).format('DD MMM YYYY')}`}
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
//                                                     {/* INJECTED "ADD LOGBOOK ENTRY" BUTTON */}
//                                                     {isActive && (
//                                                         <button
//                                                             className="mlab-btn mlab-btn--primary"
//                                                             onClick={(e) => {
//                                                                 e.stopPropagation(); // Don't collapse the layout container
//                                                                 onOpenLogModal(undefined, {
//                                                                     placementId: place.placementId,
//                                                                     employerId: place.employer?.id,
//                                                                     mentorId: place.mentor?.id
//                                                                 });
//                                                             }}
//                                                             style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto', marginRight: '8px' }}
//                                                         >
//                                                             <Plus size={14} /> Add Entry
//                                                         </button>
//                                                     )}
//                                                     <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', background: 'white', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
//                                                         {place.logs.length} Total Log(s)
//                                                     </span>
//                                                     {isEmpExpanded ? <ChevronUp size={20} color={MIDNIGHT} /> : <ChevronDown size={20} color={MIDNIGHT} />}
//                                                 </div>
//                                             </div>

//                                             {/* Employer Body */}
//                                             {isEmpExpanded && (
//                                                 <div style={{ display: 'flex', flexDirection: 'column' }}>

//                                                     {/* Company Metadata Row */}
//                                                     <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                             <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={12} /> Organization Details</span>
//                                                             <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                                 {/* <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
//                                                                     <MapPin size={12} color="var(--mlab-grey)" style={{ flexShrink: 0, marginTop: '2px' }} />
//                                                                     <span style={{ lineHeight: 1.4 }}>{place.employer?.physicalAddress || place.employer?.address || 'Physical address not on file'}</span>
//                                                                 </div> */}
//                                                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                                     <Phone size={12} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
//                                                                     <span>{place.employer?.contactPhone || 'Phone unlisted'}</span>
//                                                                 </div>
//                                                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                                     <Mail size={12} color="var(--mlab-grey)" style={{ flexShrink: 0 }} />
//                                                                     <span>{place.employer?.contactEmail || 'Email unlisted'}</span>
//                                                                 </div>
//                                                             </div>
//                                                         </div>

//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                             <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><UserCircle size={12} /> Workplace Supervision</span>
//                                                             <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                                     <strong style={{ color: MIDNIGHT }}>Assigned Mentor:</strong>
//                                                                     <span>{place.mentor?.fullName || place.mentor?.firstName || 'Pending Assignment'}</span>
//                                                                 </div>
//                                                                 <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                                                     <strong style={{ color: MIDNIGHT }}>Mentor Contact:</strong>
//                                                                     <span>{place.mentor?.email || place.mentor?.phone || 'N/A'}</span>
//                                                                 </div>
//                                                             </div>
//                                                         </div>

//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                                             <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}><Landmark size={12} /> Remuneration</span>
//                                                             <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
//                                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
//                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Monthly Base Stipend</span>
//                                                                     <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
//                                                                         {place.stipendAmount ? formatCurrency(Number(place.stipendAmount)) : 'Unspecified'}
//                                                                     </span>
//                                                                 </div>
//                                                             </div>
//                                                         </div>
//                                                     </div>

//                                                     {/* Logs mapped to this placement */}
//                                                     <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
//                                                         <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: MIDNIGHT, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                             <FileText size={14} color="var(--mlab-blue)" /> Logbook Entries for this Placement
//                                                         </h4>

//                                                         {renderLogsGroupedByMonth(place.groupedLogs, place.employer)}
//                                                     </div>

//                                                 </div>
//                                             )}
//                                         </div>
//                                     );
//                                 })}

//                                 {/* ─── UNASSIGNED / FALLBACK LOGS ─── */}
//                                 {unassignedLogs && Object.keys(unassignedLogs).length > 0 && (
//                                     <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginTop: '1rem' }}>
//                                         <div style={{ padding: '1.25rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                                 <div style={{ background: '#e2e8f0', padding: '10px', borderRadius: '8px', color: '#475569' }}>
//                                                     <Layers size={20} />
//                                                 </div>
//                                                 <div>
//                                                     <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#334155', fontFamily: 'var(--font-heading)' }}>
//                                                         General / Unassigned Logs
//                                                     </h3>
//                                                     <div style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginTop: '4px', fontWeight: 500 }}>
//                                                         Logs not directly linked to a specific employer contract timeline.
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                             {learnerHasEmployer && (
//                                                 <button
//                                                     className="mlab-btn mlab-btn--outline"
//                                                     onClick={(e) => {
//                                                         e.stopPropagation();
//                                                         onOpenLogModal();
//                                                     }}
//                                                     style={{ padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', height: 'auto' }}
//                                                 >
//                                                     <Plus size={14} /> Add Unassigned Entry
//                                                 </button>
//                                             )}
//                                         </div>
//                                         <div style={{ padding: '1.25rem', background: '#fafbfc' }}>
//                                             {renderLogsGroupedByMonth(unassignedLogs, null)}
//                                         </div>
//                                     </div>
//                                 )}
//                             </>
//                         )}
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };