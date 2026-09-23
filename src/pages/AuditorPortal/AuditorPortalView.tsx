// src/pages/AuditorPortal/AuditorPortalView.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    ShieldCheck, Search, Eye, Lock,
    FileCheck, UserCheck, X, CheckSquare,
    Briefcase, Activity, Users, Award,
    Loader2, ChevronLeft, ChevronRight,
    Printer, Flag, ExternalLink, AlertCircle, CheckCircle2,
    FileText, PieChart, BarChart3, TrendingUp, UserX,
    Scale, Filter, Bell, Download, RefreshCw,
    FileArchive,
    FileSignature,
    MessageSquare, NotebookPen, Tag,
    BookOpen, Layers, Clock, Calendar
} from 'lucide-react';
import { collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { useToast } from '../../components/common/Toast/Toast';
import Loader from '../../components/common/Loader/Loader';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import mLabLogo from '../../assets/logo/mlab_logo_white.png';

type TabOption = 'poe_vault' | 'mis_overview' | 'grievances' | 'policies';

interface SampledLearner {
    id: string;
    userId: string;
    fullName: string;
    idNumber: string;
    cohortId: string;
    cohortName: string;
    programmeName: string;
    overallProgress: number;
    attendance: { attended: number; total: number; pct: number };
    formatives: { completed: number; total: number };
    summatives: { completed: number; total: number };
    practicals: { completed: number; total: number };
    workplaces: { completed: number; total: number };
    sorStatus: string;
    popiaConsent: boolean;
    hasSignature: boolean;
    status: string;
    gender?: string;
    equityGroup?: string;
    disabilityStatus?: string;
    birthDate?: string;
    codeOfConductSigned?: boolean;
    appealsPolicySigned?: boolean;
}

interface AuditorLearnerFlag {
    flagged: boolean;
    note: string;
}

interface GrievanceRecord {
    docId: string;
    id: string;
    learnerName: string;
    cohortId: string;
    dateLogged: string;
    type: 'appeal' | 'complaint';
    status: 'open' | 'under_review' | 'resolved';
    description: string;
    resolutionNotes?: string;
}

interface ActiveExport {
    requestId: string;
    learnerId: string;
    progress: number;
    progressMessage: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    downloadUrl?: string;
    errorMessage?: string;
}

interface ExportProgressState {
    status: 'idle' | 'generating' | 'downloading';
    percent: number;
}

interface ReportCache {
    downloadUrl: string;
    generatedAt: string;
    totalRecords?: number;
}

const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

const MIDNIGHT = '#073f4e';
const GREEN = '#94c73d';

const downloadFileWithProgress = (
    url: string,
    filename: string,
    onProgress: (percent: number) => void
): Promise<void> => {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
            if (event.lengthComputable && event.total > 0) {
                const percent = Math.round((event.loaded / event.total) * 100);
                onProgress(percent);
            } else if (event.loaded > 0) {
                const estimatedTotal = event.loaded + 50000;
                const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
                onProgress(percent);
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const blob = xhr.response;
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(blobUrl);
                onProgress(100);
                resolve();
            } else {
                reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during file download.'));
        xhr.send();
    });
};

export const AuditorPortalView: React.FC = () => {
    const toast = useToast();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const {
        user: currentUser,
        cohorts: storeCohorts,
        learners: storeLearners,
        programmes: storeProgrammes,
        fetchProgrammes,
        fetchCohorts,
        fetchLearners
    } = useStore() as any;

    const initialCohortFromUrl = searchParams.get('cohort') || '';
    const initialSampleFromUrl = Number(searchParams.get('sample')) || 10;
    const initialSearchFromUrl = searchParams.get('search') || '';

    const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCohortId, setSelectedCohortId] = useState<string>(initialCohortFromUrl);
    const [samplePercentage, setSamplePercentage] = useState<number>(initialSampleFromUrl);
    const [searchTerm, setSearchTerm] = useState(initialSearchFromUrl);

    const [currentPage, setCurrentPage] = useState<number>(1);
    const [itemsPerPage, setItemsPerPage] = useState<number>(10);

    const [candidateFlags, setCandidateFlags] = useState<Record<string, AuditorLearnerFlag>>({});

    // AUDITOR LEARNER NOTE MODAL STATE
    const [notesModalLearner, setNotesModalLearner] = useState<SampledLearner | null>(null);
    const [learnerNoteInput, setLearnerNoteInput] = useState<string>('');

    const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
    const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);

    const [rawUsers, setRawUsers] = useState<any[]>([]);
    const [rawLearners, setRawLearners] = useState<any[]>([]);
    const [rawPolicySignoffs, setRawPolicySignoffs] = useState<any[]>([]);

    // REAL-TIME ATTENDANCE DATA STREAMS
    const [rawAttendance, setRawAttendance] = useState<any[]>([]);
    const [rawAttendanceLogs, setRawAttendanceLogs] = useState<any[]>([]);
    const [rawAttendanceRecords, setRawAttendanceRecords] = useState<any[]>([]);

    const [inspectedLearner, setInspectedLearner] = useState<SampledLearner | null>(null);

    const [selectedGrievance, setSelectedGrievance] = useState<GrievanceRecord | null>(null);
    const [grievanceResolutionNotes, setGrievanceResolutionNotes] = useState('');
    const [grievanceStatusInput, setGrievanceStatusInput] = useState<'open' | 'under_review' | 'resolved'>('open');
    const [isSavingGrievance, setIsSavingGrievance] = useState(false);
    const [grievanceFilterStatus, setGrievanceFilterStatus] = useState<string>('ALL');
    const [grievanceFilterType, setGrievanceFilterType] = useState<string>('ALL');

    const [policySearchTerm, setPolicySearchTerm] = useState('');

    const [showEndorseModal, setShowEndorseModal] = useState(false);
    const [auditOutcome, setAuditOutcome] = useState<'approved' | 'conditional' | 'rejected'>('approved');
    const [auditNotes, setAuditNotes] = useState('');
    const [isSavingEndorsement, setIsSavingEndorsement] = useState(false);

    const [statusModal, setStatusModal] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({
        isOpen: false,
        type: 'error',
        title: '',
        message: ''
    });

    const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
    const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
    const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
    const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

    const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

    useEffect(() => {
        if (!currentUser?.isTemporaryAuditor) {
            if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
            if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
            if (!storeLearners || storeLearners.length === 0) fetchLearners?.();
        } else {
            if (!storeCohorts || storeCohorts.length === 0) fetchCohorts?.();
            if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes?.();
        }
    }, [currentUser?.isTemporaryAuditor]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedCohortId, samplePercentage, searchTerm, itemsPerPage, activeTab, grievanceFilterStatus, grievanceFilterType, policySearchTerm]);

    useEffect(() => {
        setLastNlrdExport(null);
        setLastMatrixExport(null);
    }, [selectedCohortId]);

    // Real-Time Listener for Historical & Active PoE Exports
    useEffect(() => {
        const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
        const unsubPoe = onSnapshot(qPoe, (snap) => {
            const exportsMap: Record<string, ActiveExport> = {};
            snap.docs.forEach(docSnap => {
                const data = docSnap.data();
                const lId = data.learnerId;
                if (lId && !exportsMap[lId]) {
                    exportsMap[lId] = {
                        requestId: docSnap.id,
                        learnerId: lId,
                        progress: data.progress || 0,
                        progressMessage: data.progressMessage || '',
                        status: data.status || 'pending',
                        downloadUrl: data.downloadUrl,
                        errorMessage: data.errorMessage
                    };
                }
            });
            setActiveExports(prev => ({ ...exportsMap, ...prev }));
        });

        return () => unsubPoe();
    }, []);

    const syncQueryParams = useCallback((cohortId: string, samplePct: number, search: string) => {
        const newParams: Record<string, string> = {};
        if (cohortId) newParams.cohort = cohortId;
        if (samplePct && samplePct !== 10) newParams.sample = String(samplePct);
        if (search) newParams.search = search;

        setSearchParams(newParams, { replace: true });
    }, [setSearchParams]);

    const allowedCohortsForAuditor = useMemo(() => {
        if (!storeCohorts || storeCohorts.length === 0) return [];

        const isFullAdmin = ['admin', 'assistant_admin', 'super_admin'].includes(currentUser?.role) || currentUser?.isSuperAdmin === true;
        if (isFullAdmin) return storeCohorts;

        const allowedIds: string[] = Array.isArray(currentUser?.allowedCohortIds) ? currentUser.allowedCohortIds : [];

        if (allowedIds.length > 0) {
            return storeCohorts.filter((c: any) => allowedIds.includes(c.id));
        }

        return storeCohorts;
    }, [storeCohorts, currentUser?.role, currentUser?.isSuperAdmin, currentUser?.allowedCohortIds]);

    useEffect(() => {
        if (allowedCohortsForAuditor.length > 0) {
            const isValidSelection = allowedCohortsForAuditor.some((c: any) => c.id === selectedCohortId);

            if (!selectedCohortId || !isValidSelection) {
                const defaultCohortId = allowedCohortsForAuditor[0].id;
                setSelectedCohortId(defaultCohortId);
                syncQueryParams(defaultCohortId, samplePercentage, searchTerm);
            }
        } else {
            setSelectedCohortId('');
        }
    }, [allowedCohortsForAuditor, selectedCohortId, samplePercentage, searchTerm, syncQueryParams]);

    // Real-time Firestore Subscriptions
    useEffect(() => {
        setIsLoading(true);

        const handlePermissionError = (collectionName: string, err: any) => {
            console.warn(`[Firestore Permission Guard] Access to '${collectionName}' restricted:`, err);
            setIsLoading(false);
        };

        const unsubEnrollments = onSnapshot(
            collection(db, 'enrollments'),
            (snap) => {
                const enrolls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRawEnrollments(enrolls);
            },
            (err) => handlePermissionError('enrollments', err)
        );

        const unsubSubmissions = onSnapshot(
            collection(db, 'learner_submissions'),
            (snap) => {
                const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRawSubmissions(subs);
                setIsLoading(false);
            },
            (err) => handlePermissionError('learner_submissions', err)
        );

        const unsubUsers = onSnapshot(
            collection(db, 'users'),
            (snap) => {
                const users = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRawUsers(users);
            },
            (err) => handlePermissionError('users', err)
        );

        const unsubLearners = onSnapshot(
            collection(db, 'learners'),
            (snap) => {
                const learners = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRawLearners(learners);
            },
            (err) => handlePermissionError('learners', err)
        );

        const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
        const unsubGrievances = onSnapshot(
            qGrievances,
            (snap) => {
                const parsedGrievances: GrievanceRecord[] = [];
                snap.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    parsedGrievances.push({
                        docId: docSnap.id,
                        id: data.referenceId || docSnap.id.substring(0, 8).toUpperCase(),
                        learnerName: data.learnerName || 'Unknown Learner',
                        cohortId: data.cohortId || data.cohortRunId || '',
                        dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                        type: data.type || 'appeal',
                        status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
                        description: data.reason || data.description || 'No description provided',
                        resolutionNotes: data.resolutionNotes || ''
                    });
                });
                setRawGrievances(parsedGrievances);
            },
            (err) => handlePermissionError('assessment_appeals', err)
        );

        const unsubPolicies = onSnapshot(
            collection(db, 'learner_policy_signoffs'),
            (snap) => {
                const signoffs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setRawPolicySignoffs(signoffs);
            },
            (err) => handlePermissionError('learner_policy_signoffs', err)
        );

        // ATTENDANCE STREAMS
        const unsubAttendance = onSnapshot(
            collection(db, 'attendance'),
            (snap) => setRawAttendance(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => handlePermissionError('attendance', err)
        );

        const unsubAttLogs = onSnapshot(
            collection(db, 'attendance_logs'),
            (snap) => setRawAttendanceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => handlePermissionError('attendance_logs', err)
        );

        const unsubAttRecords = onSnapshot(
            collection(db, 'attendance_records'),
            (snap) => setRawAttendanceRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            (err) => handlePermissionError('attendance_records', err)
        );

        return () => {
            unsubEnrollments();
            unsubSubmissions();
            unsubUsers();
            unsubLearners();
            unsubGrievances();
            unsubPolicies();
            unsubAttendance();
            unsubAttLogs();
            unsubAttRecords();
        };
    }, []);

    const addCleanKey = (setObj: Set<string>, val: any) => {
        if (val && typeof val === 'string') {
            const cleaned = val.trim().toLowerCase();
            if (cleaned && cleaned !== 'n/a' && cleaned !== 'unassigned' && cleaned !== 'undefined') {
                setObj.add(cleaned);
            }
        }
    };

    const checkCocSignedInObject = (obj: any) => {
        if (!obj) return false;
        const demo = obj.demographics || {};
        return (
            obj.codeOfConductSigned === true ||
            obj.hasSignedCoc === true ||
            obj.cocSigned === true ||
            obj.policySigned === true ||
            obj.isPolicySigned === true ||
            demo.codeOfConductSigned === true ||
            demo.hasSignedCoc === true ||
            demo.cocSigned === true ||
            demo.policySigned === true ||
            !!obj.signatureUrl ||
            !!demo.signatureUrl
        );
    };

    const cocSignedKeysSet = useMemo(() => {
        const keys = new Set<string>();

        rawPolicySignoffs.forEach((d: any) => {
            addCleanKey(keys, d.id);
            addCleanKey(keys, d.userId);
            addCleanKey(keys, d.learnerId);
            addCleanKey(keys, d.authUid);
            addCleanKey(keys, d.idNumber);
            addCleanKey(keys, d.userEmail);
            addCleanKey(keys, d.email);
        });

        rawUsers.forEach((u: any) => {
            if (checkCocSignedInObject(u)) {
                addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
            }
        });

        rawLearners.forEach((l: any) => {
            if (checkCocSignedInObject(l)) {
                addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
            }
        });

        rawEnrollments.forEach((e: any) => {
            if (checkCocSignedInObject(e)) {
                addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
            }
        });

        return keys;
    }, [rawPolicySignoffs, rawUsers, rawLearners, rawEnrollments]);

    const appealsSignedKeysSet = useMemo(() => {
        const keys = new Set<string>();

        rawPolicySignoffs.forEach((d: any) => {
            const type = String(d.policyType || d.policyName || '').toLowerCase();
            if (type.includes('appeal')) {
                addCleanKey(keys, d.id); addCleanKey(keys, d.userId); addCleanKey(keys, d.learnerId); addCleanKey(keys, d.authUid); addCleanKey(keys, d.idNumber); addCleanKey(keys, d.userEmail); addCleanKey(keys, d.email);
            }
        });

        rawUsers.forEach((u: any) => {
            if (u.appealsPolicySigned === true || u.demographics?.appealsPolicySigned === true) {
                addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
            }
        });

        rawLearners.forEach((l: any) => {
            if (l.appealsPolicySigned === true || l.demographics?.appealsPolicySigned === true) {
                addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
            }
        });

        return keys;
    }, [rawPolicySignoffs, rawUsers, rawLearners]);

    const popiaConsentKeysSet = useMemo(() => {
        const keys = new Set<string>();

        rawUsers.forEach((u: any) => {
            const isConsent = u.popiaConsent === true || u.demographics?.popiaConsent === true || u.demographics?.popiActAgree === 'Y' || u.demographics?.popiActAgree === 'true';
            if (isConsent) {
                addCleanKey(keys, u.id); addCleanKey(keys, u.uid); addCleanKey(keys, u.authUid); addCleanKey(keys, u.userId); addCleanKey(keys, u.idNumber); addCleanKey(keys, u.email);
            }
        });

        rawLearners.forEach((l: any) => {
            const isConsent = l.popiaConsent === true || l.demographics?.popiaConsent === true || l.demographics?.popiActAgree === 'Y' || l.demographics?.popiActAgree === 'true';
            if (isConsent) {
                addCleanKey(keys, l.id); addCleanKey(keys, l.uid); addCleanKey(keys, l.authUid); addCleanKey(keys, l.userId); addCleanKey(keys, l.idNumber); addCleanKey(keys, l.email);
            }
        });

        rawEnrollments.forEach((e: any) => {
            const isConsent = e.popiaConsent === true || e.demographics?.popiaConsent === true || e.demographics?.popiActAgree === 'Y' || e.demographics?.popiActAgree === 'true';
            if (isConsent) {
                addCleanKey(keys, e.id); addCleanKey(keys, e.userId); addCleanKey(keys, e.learnerId); addCleanKey(keys, e.authUid); addCleanKey(keys, e.idNumber); addCleanKey(keys, e.email);
            }
        });

        return keys;
    }, [rawUsers, rawLearners, rawEnrollments]);

    // RESOLVE ACTIVE PROGRAMME DATA FOR THE CURRENTLY SELECTED COHORT SCOPE
    const activeProgrammeData = useMemo(() => {
        if (!selectedCohortId) return null;
        const cohort = allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId);
        if (!cohort) return null;

        return storeProgrammes?.find((p: any) =>
            p.id === cohort.programmeId ||
            p.id === cohort.qualificationId ||
            (p.saqaId && String(p.saqaId) === String(cohort.saqaId))
        ) || null;
    }, [allowedCohortsForAuditor, selectedCohortId, storeProgrammes]);

    // 🚀 UNIFIED ATTENDANCE AGGREGATOR (MIRRORS QCTOCOHORTVIEW)
    const dailyRegisters = useMemo(() => {
        const unifiedMap = new Map<string, any>();

        const matchCohort = (r: any) => {
            if (!selectedCohortId || selectedCohortId === 'ALL') return true;
            const rCohort = String(r.cohortId || r.cohortRunId || r.classId || '').trim();
            return rCohort === selectedCohortId;
        };

        const filteredAtt = rawAttendance.filter(matchCohort);
        const filteredLogs = rawAttendanceLogs.filter(matchCohort);
        const filteredRecords = rawAttendanceRecords.filter(matchCohort);

        // 1. Process Legacy / Ecosystem Individual Records (from 'attendance')
        filteredAtt.forEach(record => {
            if (record.presentLearners || record.absentLearners) {
                const dateKey = record.date || record.id;
                unifiedMap.set(record.id || dateKey, {
                    id: record.id || dateKey,
                    date: record.date || 'Unknown',
                    presentLearners: Array.isArray(record.presentLearners) ? record.presentLearners : [],
                    absentLearners: Array.isArray(record.absentLearners) ? record.absentLearners : [],
                    partialLearners: Array.isArray(record.partialLearners) ? record.partialLearners : []
                });
            } else if (record.learnerId && record.date) {
                const dateKey = `eco_${record.date}`;
                if (!unifiedMap.has(dateKey)) {
                    unifiedMap.set(dateKey, {
                        id: dateKey,
                        date: record.date,
                        presentLearners: [],
                        absentLearners: [],
                        partialLearners: []
                    });
                }
                const entry = unifiedMap.get(dateKey);
                const status = String(record.status || '').toLowerCase();

                if (status.includes('present')) entry.presentLearners.push(record.learnerId);
                else if (status.includes('absent')) entry.absentLearners.push(record.learnerId);
                else if (status.includes('partial')) entry.partialLearners.push(record.learnerId);
            }
        });

        // 2. Process Zoom / Session Logs Data (attendance_logs + attendance_records)
        filteredLogs.forEach(log => {
            const dateStr = log.sessionDate ? log.sessionDate.split('T')[0] : log.createdAt?.split('T')[0] || 'Unknown';
            const recordsForLog = filteredRecords.filter(r => r.sessionId === log.id || r.date === dateStr);

            const present: string[] = [];
            const absent: string[] = [];
            const partial: string[] = [];

            recordsForLog.forEach(r => {
                const status = String(r.status || '').toLowerCase();
                const lKey = r.learnerId || r.authUid || r.userId;
                if (lKey) {
                    if (status.includes('present')) present.push(lKey);
                    else if (status.includes('absent')) absent.push(lKey);
                    else if (status.includes('partial')) partial.push(lKey);
                }
            });

            unifiedMap.set(log.id, {
                id: log.id,
                date: dateStr,
                presentLearners: present,
                absentLearners: absent,
                partialLearners: partial
            });
        });

        const unifiedArray = Array.from(unifiedMap.values());
        unifiedArray.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return unifiedArray;
    }, [rawAttendance, rawAttendanceLogs, rawAttendanceRecords, selectedCohortId]);

    // 🚀 MAP ATTENDANCE STATS PER CANDIDATE GROUP (MIRRORS QCTOCOHORTVIEW)
    const rosterAttendanceMap = useMemo(() => {
        const keyAttendanceMap = new Map<string, number>();
        const totalSessions = dailyRegisters.length;

        // Group all known identifiers per candidate
        const candidateKeyGroups: string[][] = rawEnrollments.map(e => {
            const actualUserId = e.userId || e.learnerId || e.idNumber || e.id;
            const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.learnerId === actualUserId || (e.idNumber && l.idNumber === e.idNumber));
            const rawUser = rawUsers?.find((u: any) => u.id === actualUserId || u.authUid === actualUserId || (e.idNumber && u.idNumber === e.idNumber));
            const rawLearner = rawLearners?.find((rl: any) => rl.id === actualUserId || (e.idNumber && rl.idNumber === e.idNumber));

            const keys = [
                e.id,
                e.userId,
                e.learnerId,
                e.authUid,
                e.idNumber,
                actualUserId,
                storeLearner?.id,
                storeLearner?.learnerId,
                storeLearner?.authUid,
                storeLearner?.idNumber,
                rawUser?.id,
                rawUser?.authUid,
                rawUser?.idNumber,
                rawLearner?.id,
                rawLearner?.authUid,
                rawLearner?.idNumber
            ].filter((k): k is string => typeof k === 'string' && k.trim() !== '' && k !== 'N/A' && k !== 'undefined');

            return Array.from(new Set(keys.map(k => k.trim().toLowerCase())));
        });

        // Initialize keyAttendanceMap
        candidateKeyGroups.forEach(group => {
            group.forEach(k => {
                keyAttendanceMap.set(k, 0);
            });
        });

        // Loop registers and count present sessions
        dailyRegisters.forEach(reg => {
            const presentList = (reg.presentLearners || []).map((p: any) => String(p).trim().toLowerCase());

            candidateKeyGroups.forEach(group => {
                const isCandidatePresent = group.some(k => presentList.includes(k));
                if (isCandidatePresent) {
                    group.forEach(k => {
                        keyAttendanceMap.set(k, (keyAttendanceMap.get(k) || 0) + 1);
                    });
                }
            });
        });

        // Consolidate into final map
        const finalMap = new Map<string, { attended: number; total: number; pct: number }>();
        candidateKeyGroups.forEach(group => {
            const bestAttended = Math.max(...group.map(k => keyAttendanceMap.get(k) || 0), 0);
            const pct = totalSessions > 0 ? Math.round((bestAttended / totalSessions) * 100) : 0;
            const stats = { attended: bestAttended, total: totalSessions, pct };

            group.forEach(k => {
                finalMap.set(k, stats);
            });
        });

        return finalMap;
    }, [dailyRegisters, rawEnrollments, storeLearners, rawUsers, rawLearners]);

    const handleCohortChange = (cohortId: string) => {
        setSelectedCohortId(cohortId);
        syncQueryParams(cohortId, samplePercentage, searchTerm);
    };

    const handleSamplePercentageChange = (pct: number) => {
        setSamplePercentage(pct);
        setSearchTerm('');
        syncQueryParams(selectedCohortId, pct, '');
    };

    const handleSearchChange = (term: string) => {
        setSearchTerm(term);
        syncQueryParams(selectedCohortId, samplePercentage, term);
    };

    const handleToggleCandidateFlag = (candidateId: string, noteText: string = '') => {
        setCandidateFlags(prev => {
            const current = prev[candidateId];
            const isCurrentlyFlagged = current?.flagged;
            return {
                ...prev,
                [candidateId]: {
                    flagged: !isCurrentlyFlagged,
                    note: !isCurrentlyFlagged ? (noteText || current?.note || 'Spot-check flag raised by auditor.') : ''
                }
            };
        });
        toast.info("Candidate spot-check flag status updated.");
    };

    const handleUpdateFlagNote = (candidateId: string, noteText: string) => {
        setCandidateFlags(prev => ({
            ...prev,
            [candidateId]: {
                flagged: true,
                note: noteText
            }
        }));
    };

    const handleOpenNotesModal = (learner: SampledLearner) => {
        setNotesModalLearner(learner);
        setLearnerNoteInput(candidateFlags[learner.id]?.note || '');
    };

    const handleSaveLearnerNote = () => {
        if (!notesModalLearner) return;
        handleUpdateFlagNote(notesModalLearner.id, learnerNoteInput);
        toast.success(`Audit notes saved for ${notesModalLearner.fullName}.`);
        setNotesModalLearner(null);
    };

    const handleExportSampleManifest = () => {
        if (sampledLearners.length === 0) {
            setStatusModal({
                isOpen: true,
                type: 'info',
                title: 'No Sampled Records',
                message: 'There are currently no sampled records available in the selected cohort view to export.'
            });
            return;
        }

        const headers = ['Learner Name', 'ID Number', 'Status', 'Cohort Name', 'Programme Name', 'Progress %', 'Attendance %', 'Days Attended', 'Formatives Completed', 'Summatives Completed', 'Practicals Completed', 'Logbooks Completed', 'POPIA Consent', 'Audit Flag Status', 'Auditor Note'];

        const csvRows = sampledLearners.map(l => {
            const flag = candidateFlags[l.id];

            const rawIdStr = String(l.idNumber || '').trim();
            const paddedId = (rawIdStr.length > 0 && rawIdStr.length < 13 && /^\d+$/.test(rawIdStr))
                ? rawIdStr.padStart(13, '0')
                : rawIdStr;
            const textFormattedId = `="${paddedId}"`;

            return [
                `"${l.fullName.replace(/"/g, '""')}"`,
                textFormattedId,
                `"${l.status}"`,
                `"${l.cohortName.replace(/"/g, '""')}"`,
                `"${l.programmeName.replace(/"/g, '""')}"`,
                `${l.overallProgress}%`,
                `${l.attendance.pct}%`,
                `"${l.attendance.attended}/${l.attendance.total}"`,
                `"${l.formatives.completed}/${l.formatives.total}"`,
                `"${l.summatives.completed}/${l.summatives.total}"`,
                `"${l.practicals.completed}/${l.practicals.total}"`,
                `"${l.workplaces.completed}/${l.workplaces.total}"`,
                l.popiaConsent ? 'Signed' : 'Unsigned',
                flag?.flagged ? 'FLAGGED' : 'CLEAR',
                `"${(flag?.note || '').replace(/"/g, '""')}"`
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Audit_Sample_Manifest_${selectedCohortId}_${Date.now()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast.success("Sample Manifest exported to CSV.");
    };

    // Master PoE Request Handshake with Firestore Background Worker
    const handleGeneratePoE = async (learner: SampledLearner, forceRegenerate: boolean = false) => {
        const targetLearnerId = learner.userId || learner.id;
        const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

        if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
            toast.info(`An export for ${learner.fullName} is already in progress (${currentExport.progress}%).`);
            return;
        }

        if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
            window.open(currentExport.downloadUrl, '_blank');
            return;
        }

        try {
            toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.fullName}...`);

            const docRef = await addDoc(collection(db, 'poe_export_requests'), {
                learnerId: targetLearnerId,
                requestedBy: currentUser?.uid || currentUser?.id || 'auditor',
                status: 'pending',
                progress: 0,
                progressMessage: 'Initializing compliance engine...',
                createdAt: serverTimestamp()
            });

            setActiveExports(prev => ({
                ...prev,
                [learner.id]: {
                    requestId: docRef.id,
                    learnerId: targetLearnerId,
                    progress: 0,
                    progressMessage: 'Initializing compliance engine...',
                    status: 'pending'
                },
                [targetLearnerId]: {
                    requestId: docRef.id,
                    learnerId: targetLearnerId,
                    progress: 0,
                    progressMessage: 'Initializing compliance engine...',
                    status: 'pending'
                }
            }));
        } catch (error: any) {
            console.error('Error requesting PoE export:', error);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'Export Initialization Failed',
                message: error.message || `Failed to trigger PoE compilation for ${learner.fullName}.`
            });
        }
    };

    // Build Cohort Learner Pool
    const cohortPool = useMemo(() => {
        if (!selectedCohortId) return [];

        const filteredEnrollments = rawEnrollments.filter(e =>
            e.cohortId === selectedCohortId || e.cohortRunId === selectedCohortId
        );

        return filteredEnrollments.map((enrol): SampledLearner => {
            const enrolKeys = [
                enrol.userId,
                enrol.learnerId,
                enrol.authUid,
                enrol.idNumber,
                enrol.id,
                enrol.uid
            ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

            const enrolEmail = enrol.email ? String(enrol.email).trim().toLowerCase() : '';

            // Robust multi-field candidate matcher
            const matchesLearner = (candidate: any) => {
                if (!candidate) return false;
                const candidateKeys = [
                    candidate.id,
                    candidate.learnerId,
                    candidate.idNumber,
                    candidate.authUid,
                    candidate.uid,
                    candidate.userId
                ].filter((k): k is string => typeof k === 'string' && k.trim() !== '');

                const hasKeyMatch = enrolKeys.some(ek => candidateKeys.some(ck => ck.trim().toLowerCase() === ek.trim().toLowerCase()));
                const hasEmailMatch = enrolEmail !== '' && candidate.email && String(candidate.email).trim().toLowerCase() === enrolEmail;

                return hasKeyMatch || hasEmailMatch;
            };

            const storeLearner = storeLearners?.find(matchesLearner);
            const rawUser = rawUsers?.find(matchesLearner);
            const rawLearner = rawLearners?.find(matchesLearner);

            const activeCohortId = enrol.cohortId || enrol.cohortRunId;
            const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

            // ENRICHED PROGRAMME / QUALIFICATION LOOKUP
            let storeProgramme = storeProgrammes?.find((p: any) =>
                (p.id && (p.id === storeCohort?.programmeId || p.id === storeCohort?.qualificationId || p.id === enrol.programmeId || p.id === enrol.qualificationId)) ||
                (p.saqaId && (String(p.saqaId) === String(enrol.qualification?.saqaId) || String(p.saqaId) === String(enrol.saqaId)))
            );

            const mappedName =
                enrol.userName ||
                enrol.learnerName ||
                enrol.fullName ||
                enrol.name ||
                storeLearner?.fullName ||
                storeLearner?.name ||
                rawLearner?.fullName ||
                rawLearner?.name ||
                rawUser?.fullName ||
                rawUser?.name ||
                'Learner Candidate';

            const rawMappedId =
                enrol.idNumber ||
                storeLearner?.idNumber ||
                rawLearner?.idNumber ||
                rawUser?.idNumber ||
                enrol.learnerId ||
                enrol.userId ||
                enrol.id ||
                'N/A';

            const cleanIdStr = String(rawMappedId).trim();
            const mappedId = (cleanIdStr.length > 0 && cleanIdStr.length < 13 && /^\d+$/.test(cleanIdStr))
                ? cleanIdStr.padStart(13, '0')
                : cleanIdStr;

            const mappedCohort = enrol.cohortName || storeCohort?.name || activeCohortId || 'Active Cohort';

            // FULL ENRICHED PROGRAMME NAME BUILDER
            const progTitle = storeProgramme?.name || enrol.programmeName || enrol.qualification?.name || 'Occupational Qualification';
            const progNqf = storeProgramme?.nqfLevel || enrol.nqfLevel || enrol.qualification?.nqfLevel || '';
            const progSaqa = storeProgramme?.saqaId || enrol.saqaId || enrol.qualification?.saqaId || '';

            const progDetails: string[] = [];
            if (progNqf) progDetails.push(`NQF Level ${progNqf}`);
            if (progSaqa) progDetails.push(`SAQA ID ${progSaqa}`);

            const mappedProgramme = progDetails.length > 0
                ? `${progTitle} (${progDetails.join(' | ')})`
                : progTitle;

            const demo = enrol.demographics || storeLearner?.demographics || rawUser?.demographics || rawLearner?.demographics || {};

            const gender = enrol.gender || enrol.genderCode || demo.gender || demo.genderCode || storeLearner?.gender || rawUser?.gender || rawLearner?.gender || 'Unspecified';
            const equityGroup = enrol.equityGroup || enrol.equityCode || enrol.race || demo.equityGroup || demo.equityCode || demo.race || storeLearner?.equityGroup || storeLearner?.equityCode || rawUser?.equityGroup || rawUser?.race || rawLearner?.equityGroup || 'Unspecified';
            const disabilityStatus = enrol.disabilityStatus || enrol.disabilityStatusCode || demo.disabilityStatus || demo.disabilityStatusCode || storeLearner?.disabilityStatus || rawUser?.disabilityStatus || rawLearner?.disabilityStatus || 'None';

            let totalBlueprintKM = 0, totalBlueprintPM = 0, totalBlueprintWM = 0;

            if (storeProgramme) {
                if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
                if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
                if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

                if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
                    const flat = storeProgramme.modules;
                    totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
                    totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
                    totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
                }
            }

            let calculatedFA = 0, calculatedSA = 0, calculatedPM = 0, calculatedWM = 0;
            let totalAssignedFA = 0, totalAssignedSA = 0, totalAssignedPM = 0, totalAssignedWM = 0;

            const actualUserId = enrol.userId || enrol.learnerId || enrol.idNumber || enrol.id;
            const learnerSubs = rawSubmissions.filter(s =>
                (actualUserId && String(s.learnerId || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
                (actualUserId && String(s.authUid || '').toLowerCase() === String(actualUserId).toLowerCase()) ||
                (enrol.id && String(s.enrollmentId || '').toLowerCase() === String(enrol.id).toLowerCase())
            );

            learnerSubs.forEach(s => {
                const type = String(s.type || 'formative').toLowerCase();
                const moduleType = String(s.moduleType || '').toLowerCase();
                const subStatus = String(s.status || 'not_started').toLowerCase();

                if (INFORMAL_TYPES.some(it => type.includes(it))) return;

                const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);
                const isKnowledge = moduleType === 'knowledge' || moduleType === '';
                const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
                const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

                if (isKnowledge) {
                    if (type.includes('formative') || type.includes('fa')) {
                        totalAssignedFA++;
                        if (isDone) calculatedFA++;
                    } else if (type.includes('summative') || type.includes('sa')) {
                        totalAssignedSA++;
                        if (isDone) calculatedSA++;
                    }
                } else if (isPractical) {
                    totalAssignedPM++;
                    if (isDone) calculatedPM++;
                } else if (isWorkplace) {
                    totalAssignedWM++;
                    if (isDone) calculatedWM++;
                }
            });

            const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
            const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
            const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
            const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

            const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
            const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

            const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

            // 🚀 EXTRACT CANDIDATE ATTENDANCE METRICS
            const attStats = rosterAttendanceMap.get(enrol.id?.trim().toLowerCase()) ||
                rosterAttendanceMap.get(actualUserId?.trim().toLowerCase()) ||
                rosterAttendanceMap.get(mappedId?.trim().toLowerCase()) ||
                { attended: 0, total: dailyRegisters.length, pct: 0 };

            const candidateKeys = [
                actualUserId,
                enrol.id,
                enrol.userId,
                enrol.learnerId,
                enrol.authUid,
                enrol.idNumber,
                enrol.email,
                mappedId,
                storeLearner?.id,
                storeLearner?.uid,
                storeLearner?.authUid,
                storeLearner?.idNumber,
                storeLearner?.email,
                rawUser?.id,
                rawUser?.uid,
                rawUser?.authUid,
                rawUser?.idNumber,
                rawUser?.email,
                rawLearner?.id,
                rawLearner?.authUid,
                rawLearner?.idNumber,
                rawLearner?.email
            ];

            const isCocSigned = checkCocSignedInObject(enrol) || checkCocSignedInObject(storeLearner) || checkCocSignedInObject(rawLearner) || candidateKeys.some(k => k && typeof k === 'string' && cocSignedKeysSet.has(k.trim().toLowerCase()));
            const isAppealsSigned = candidateKeys.some(k => k && typeof k === 'string' && appealsSignedKeysSet.has(k.trim().toLowerCase()));
            const isPopiConsented = candidateKeys.some(k => k && typeof k === 'string' && popiaConsentKeysSet.has(k.trim().toLowerCase()));

            // 🚀 ROBUST DROPOUT & WITHDRAWAL RESOLUTION ENGINE
            const allStatuses = [
                enrol.status,
                storeLearner?.status,
                rawLearner?.status,
                rawUser?.status
            ].filter((s): s is string => typeof s === 'string' && s.trim() !== '').map(s => s.trim().toLowerCase());

            const isCandidateDropped = allStatuses.some(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s));
            const resolvedStatus = isCandidateDropped
                ? (allStatuses.find(s => ['dropped', 'withdrawn', 'terminated', 'archived'].includes(s)) || 'dropped')
                : (enrol.status || storeLearner?.status || rawLearner?.status || rawUser?.status || 'active');

            return {
                id: enrol.id,
                userId: actualUserId,
                fullName: mappedName,
                idNumber: mappedId,
                cohortId: activeCohortId,
                cohortName: mappedCohort,
                programmeName: mappedProgramme,
                overallProgress: Math.min(100, dynamicProgress),
                attendance: attStats,
                formatives: { completed: calculatedFA, total: ceilingFA },
                summatives: { completed: calculatedSA, total: ceilingSA },
                practicals: { completed: calculatedPM, total: ceilingPM },
                workplaces: { completed: calculatedWM, total: ceilingWM },
                sorStatus: enrol.sorStatus || (dynamicProgress >= 100 ? 'issued' : 'pending'),
                popiaConsent: isPopiConsented,
                hasSignature: !!(enrol.signatureUrl || enrol.demographics?.signatureUrl || storeLearner?.signatureUrl || isCocSigned),
                status: resolvedStatus,
                gender,
                equityGroup,
                disabilityStatus,
                birthDate: demo.birthDate || storeLearner?.birthDate,
                codeOfConductSigned: isCocSigned,
                appealsPolicySigned: isAppealsSigned
            };
        });
    }, [rawEnrollments, rawSubmissions, selectedCohortId, storeLearners, storeCohorts, storeProgrammes, cocSignedKeysSet, appealsSignedKeysSet, popiaConsentKeysSet, rawUsers, rawLearners, rosterAttendanceMap, dailyRegisters.length]);

    const sampledLearners = useMemo(() => {
        if (cohortPool.length === 0) return [];

        let filtered = cohortPool;
        if (searchTerm.trim()) {
            const q = searchTerm.toLowerCase();
            return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.includes(q));
        }

        if (samplePercentage >= 100) return filtered;

        const sampleSize = Math.max(1, Math.ceil((cohortPool.length * samplePercentage) / 100));
        return [...cohortPool]
            .sort((a, b) => a.id.localeCompare(b.id))
            .slice(0, sampleSize);
    }, [cohortPool, samplePercentage, searchTerm]);

    const totalPages = Math.max(1, Math.ceil(sampledLearners.length / itemsPerPage));
    const paginatedLearners = useMemo(() => {
        return sampledLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [sampledLearners, currentPage, itemsPerPage]);

    const cohortFilteredGrievances = useMemo(() => {
        let list = rawGrievances.filter(g => g.cohortId === selectedCohortId || selectedCohortId === 'ALL');

        if (grievanceFilterStatus !== 'ALL') {
            list = list.filter(g => g.status === grievanceFilterStatus);
        }
        if (grievanceFilterType !== 'ALL') {
            list = list.filter(g => g.type === grievanceFilterType);
        }

        return list;
    }, [rawGrievances, selectedCohortId, grievanceFilterStatus, grievanceFilterType]);

    const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
    const paginatedGrievances = useMemo(() => {
        return cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [cohortFilteredGrievances, currentPage, itemsPerPage]);

    const searchedPolicyLearners = useMemo(() => {
        if (!policySearchTerm.trim()) return cohortPool;
        const q = policySearchTerm.toLowerCase();
        return cohortPool.filter(l => l.fullName.toLowerCase().includes(q) || l.idNumber.toLowerCase().includes(q));
    }, [cohortPool, policySearchTerm]);

    const totalPagesPolicyLearners = Math.max(1, Math.ceil(searchedPolicyLearners.length / itemsPerPage));
    const paginatedPolicyLearners = useMemo(() => {
        return searchedPolicyLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [searchedPolicyLearners, currentPage, itemsPerPage]);

    const cohortMisDemographics = useMemo(() => {
        const stats = {
            total: cohortPool.length,
            sampleTotal: sampledLearners.length,
            equity: { African: 0, Coloured: 0, Indian: 0, White: 0, Other: 0 },
            gender: { Female: 0, Male: 0, Other: 0 },
            disability: { Yes: 0, No: 0 },
            youth: { Under35: 0, Adult35Plus: 0 },
            attendanceBands: { high: 0, mid: 0, low: 0 }
        };

        const currentYear = 2026;

        cohortPool.forEach(l => {
            // 1. EQUITY GROUP / RACE PARSING
            const eq = String(l.equityGroup || '').trim().toLowerCase();
            if (eq.includes('african') || eq.includes('black') || eq === 'ba' || eq === '01' || eq === 'a') {
                stats.equity.African++;
            } else if (eq.includes('coloured') || eq.includes('colored') || eq === 'bc' || eq === '02' || eq === 'c') {
                stats.equity.Coloured++;
            } else if (eq.includes('indian') || eq.includes('asian') || eq === 'bi' || eq === '03' || eq === 'i') {
                stats.equity.Indian++;
            } else if (eq.includes('white') || eq === 'wh' || eq === '04' || eq === 'w') {
                stats.equity.White++;
            } else {
                stats.equity.African++;
            }

            // 2. GENDER PARSING
            const g = String(l.gender || '').trim().toLowerCase();
            if (g.startsWith('f') || g.includes('female') || g === 'woman' || g === 'w') {
                stats.gender.Female++;
            } else if (g.startsWith('m') || g.includes('male') || g === 'man') {
                stats.gender.Male++;
            } else if (l.idNumber && l.idNumber.length >= 7) {
                const genderDigit = parseInt(l.idNumber.charAt(6), 10);
                if (!isNaN(genderDigit)) {
                    if (genderDigit >= 5) {
                        stats.gender.Male++;
                    } else {
                        stats.gender.Female++;
                    }
                } else {
                    stats.gender.Male++;
                }
            } else {
                stats.gender.Male++;
            }

            // 3. DISABILITY STATUS
            const d = String(l.disabilityStatus || '').trim().toLowerCase();
            if (d && d !== 'none' && d !== 'no' && d !== 'n' && d !== '00' && d !== '0' && d !== 'false' && d !== 'unspecified') {
                stats.disability.Yes++;
            } else {
                stats.disability.No++;
            }

            // 4. YOUTH STATUS (<35 YEARS)
            let birthYear = 0;
            if (l.idNumber && l.idNumber.length >= 6) {
                const yy = parseInt(l.idNumber.substring(0, 2), 10);
                birthYear = yy > 30 ? 1900 + yy : 2000 + yy;
            }
            if (birthYear > 0 && (currentYear - birthYear) <= 35) {
                stats.youth.Under35++;
            } else {
                stats.youth.Adult35Plus++;
            }

            // 5. ATTENDANCE BANDS
            const attPct = l.attendance?.pct || 0;
            if (attPct >= 75) stats.attendanceBands.high++;
            else if (attPct >= 40) stats.attendanceBands.mid++;
            else stats.attendanceBands.low++;
        });

        return stats;
    }, [cohortPool, sampledLearners]);

    // FULLY DECOUPLED INDEPENDENT CALCULATION FOR POLICIES & CONSENTS
    const displayStats = useMemo(() => {
        let active = 0, grad = 0, drop = 0;
        let codeOfConductSignedCount = 0;
        let appealsSignedCount = 0;
        let popiaConsentCount = 0;

        cohortPool.forEach(l => {
            const status = l.status.toLowerCase();
            if (status === 'active') active++;
            else if (status === 'graduated' || status === 'competent') grad++;
            else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

            if (l.codeOfConductSigned) codeOfConductSignedCount++;
            if (l.appealsPolicySigned) appealsSignedCount++;
            if (l.popiaConsent) popiaConsentCount++;
        });

        const total = cohortPool.length;
        const denominator = total > 0 ? total : 1;

        return {
            totalEnrolled: total,
            activeTraining: active,
            graduated: grad,
            droppedOut: drop,
            retentionRate: total > 0 ? Math.round(((total - drop) / total) * 100) : 0,
            activeGrievances: cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length,
            policySignedPct: Math.min(100, Math.round((codeOfConductSignedCount / denominator) * 100)),
            appealsSignedPct: Math.min(100, Math.round((appealsSignedCount / denominator) * 100)),
            popiaConsentPct: Math.min(100, Math.round((popiaConsentCount / denominator) * 100))
        };
    }, [cohortPool, cohortFilteredGrievances]);

    const inspectedLearnerSubmissions = useMemo(() => {
        if (!inspectedLearner) return [];
        const targetUserId = String(inspectedLearner.userId || inspectedLearner.id).toLowerCase();

        return rawSubmissions.filter(s =>
            (s.learnerId && String(s.learnerId).toLowerCase() === targetUserId) ||
            (s.authUid && String(s.authUid).toLowerCase() === targetUserId) ||
            (s.enrollmentId && String(s.enrollmentId).toLowerCase() === String(inspectedLearner.id).toLowerCase())
        );
    }, [inspectedLearner, rawSubmissions]);

    const activeCohortData = useMemo(() => {
        return allowedCohortsForAuditor?.find((c: any) => c.id === selectedCohortId) || null;
    }, [allowedCohortsForAuditor, selectedCohortId]);

    const handleSaveEndorsement = async () => {
        if (!auditNotes.trim()) {
            setStatusModal({
                isOpen: true,
                type: 'warning',
                title: 'Missing Audit Notes',
                message: 'Please enter auditor verification findings and notes before recording official sign-off.'
            });
            return;
        }

        setIsSavingEndorsement(true);
        try {
            await addDoc(collection(db, 'cohort_audit_endorsements'), {
                cohortId: selectedCohortId,
                cohortName: activeCohortData?.name || 'Cohort',
                auditorUid: currentUser?.uid || 'external_auditor',
                auditorName: currentUser?.fullName || 'External Quality Assurer',
                organization: currentUser?.organization || 'QCTO / SETA',
                sampleSizePercentage: samplePercentage,
                sampledRecordsCount: sampledLearners.length,
                totalCohortCount: cohortPool.length,
                outcome: auditOutcome,
                notes: auditNotes,
                flaggedCandidatesCount: Object.values(candidateFlags).filter(f => f.flagged).length,
                signedAt: serverTimestamp(),
                createdAt: new Date().toISOString()
            });

            toast.success("Audit verification & endorsement recorded successfully.");
            setShowEndorseModal(false);
            setAuditNotes('');
        } catch (err: any) {
            console.error("Failed to save endorsement:", err);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'Sign-Off Failed',
                message: err.message || 'Failed to record official audit verification sign-off record.'
            });
        } finally {
            setIsSavingEndorsement(false);
        }
    };

    const handleSaveGrievanceResolution = async () => {
        if (!selectedGrievance) return;
        setIsSavingGrievance(true);
        try {
            await updateDoc(doc(db, 'assessment_appeals', selectedGrievance.docId), {
                status: grievanceStatusInput,
                resolutionNotes: grievanceResolutionNotes,
                resolvedAt: serverTimestamp(),
                resolvedBy: currentUser?.uid || 'external_auditor'
            });

            toast.success(`Grievance ${selectedGrievance.id} updated to ${grievanceStatusInput.toUpperCase()}.`);
            setSelectedGrievance(null);
            setGrievanceResolutionNotes('');
        } catch (err: any) {
            console.error("Failed to update grievance:", err);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'Resolution Update Failed',
                message: err.message || 'Failed to save grievance resolution details.'
            });
        } finally {
            setIsSavingGrievance(false);
        }
    };

    // SAQA NLRD EXPORTER
    const handleExportNLRD = async () => {
        if (nlrdProgress.status !== 'idle') return;
        setNlrdProgress({ status: 'generating', percent: 15 });
        toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

        const timer = setInterval(() => {
            setNlrdProgress(prev => {
                if (prev.status !== 'generating') return prev;
                if (prev.percent >= 80) return prev;
                return { ...prev, percent: prev.percent + 5 };
            });
        }, 300);

        try {
            const functions = getFunctions();
            const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
            const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

            clearInterval(timer);

            if (response.data?.downloadUrl) {
                setNlrdProgress({ status: 'downloading', percent: 80 });
                const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

                await downloadFileWithProgress(
                    response.data.downloadUrl,
                    filename,
                    (bytePercent) => {
                        const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
                        setNlrdProgress({ status: 'downloading', percent: scaled });
                    }
                );

                setLastNlrdExport({
                    downloadUrl: response.data.downloadUrl,
                    generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
                    totalRecords: response.data.totalRecords
                });

                toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords || ''} records.`);
            }
        } catch (error: any) {
            clearInterval(timer);
            console.error('NLRD Export Failed:', error);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'NLRD Export Failed',
                message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
            });
        } finally {
            setNlrdProgress({ status: 'idle', percent: 0 });
        }
    };

    // THROUGHPUT MATRIX EXPORTER
    const handleExportThroughputMatrix = async () => {
        if (matrixProgress.status !== 'idle') return;
        setMatrixProgress({ status: 'generating', percent: 15 });
        toast.info('Compiling Learner Throughput & Compliance Matrix...');

        const timer = setInterval(() => {
            setMatrixProgress(prev => {
                if (prev.status !== 'generating') return prev;
                if (prev.percent >= 80) return prev;
                return { ...prev, percent: prev.percent + 5 };
            });
        }, 300);

        try {
            const functions = getFunctions();
            const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
            const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

            clearInterval(timer);

            if (response.data?.downloadUrl) {
                setMatrixProgress({ status: 'downloading', percent: 80 });
                const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

                await downloadFileWithProgress(
                    response.data.downloadUrl,
                    filename,
                    (bytePercent) => {
                        const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
                        setMatrixProgress({ status: 'downloading', percent: scaled });
                    }
                );

                setLastMatrixExport({
                    downloadUrl: response.data.downloadUrl,
                    generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
                    totalRecords: response.data.totalLearners
                });

                toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners || ''} learners!`);
            }
        } catch (error: any) {
            clearInterval(timer);
            console.error('Throughput Report Failed:', error);
            setStatusModal({
                isOpen: true,
                type: 'error',
                title: 'Report Generation Failed',
                message: error.message || 'Server error encountered while building the throughput matrix report.'
            });
        } finally {
            setMatrixProgress({ status: 'idle', percent: 0 });
        }
    };

    if (isLoading) {
        return <Loader message="Initializing Auditor Inspection Portal..." />;
    }

    const calcPct = (val: number, total: number) => total > 0 ? Math.round((val / total) * 100) : 0;

    return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#f8fafc', fontFamily: 'var(--font-body)', overflow: 'hidden' }}>

            <style dangerouslySetInnerHTML={{
                __html: `
                .mav-topbar { background: ${MIDNIGHT}; padding: 0 24px; height: 60px; display: flex; align-items: center; justify-content: space-between; border-bottom: 3px solid ${GREEN}; flex-shrink: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px); }
                .mav-brand { display: flex; align-items: center; gap: 14px; }
                .mav-topbar-title { font-family: system-ui, -apple-system, sans-serif; font-size: 11px; font-weight: 500; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255, 255, 255, 0.45); padding-left: 14px; border-left: 1px solid rgba(255, 255, 255, 0.15); }
                .mav-secure-pill { display: flex; align-items: center; gap: 7px; background: rgba(148, 199, 61, 0.1); border: 1px solid rgba(148, 199, 61, 0.25); border-radius: 20px; padding: 6px 14px; }
                .mav-secure-dot { width: 7px; height: 7px; border-radius: 50%; background: ${GREEN}; display: inline-block; }
                .mav-secure-txt { font-family: system-ui, -apple-system, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${GREEN}; }
                
                .ap-table-wrap { flex: 1; display: flex; flex-direction: column; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); min-height: 0; }
                .ap-table-scroll { flex: 1; overflow-y: auto; min-height: 0; }
                .ap-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                .ap-table th { position: sticky; top: 0; z-index: 10; background: ${MIDNIGHT}; color: #ffffff; padding: 12px 18px; font-family: var(--font-heading); text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; border-bottom: 3px solid ${GREEN}; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .ap-table td { padding: 12px 18px; border-bottom: 1px solid #e2e8f0; color: #0f172a; vertical-align: middle; }
                .ap-table tr:hover td { background-color: #f8fafc; }
                
                .ap-filter-select { height: 28px; border: 1px solid #cbd5e1; background: #ffffff; padding: 0 8px; font-size: 0.75rem; color: ${MIDNIGHT}; font-weight: 700; outline: none; border-radius: 4px; }
                .ap-tab-btn { padding: 12px 18px; background: transparent; border: none; font-weight: 800; font-size: 0.8rem; font-family: var(--font-heading); text-transform: uppercase; cursor: pointer; display: flex; align-items: center; gap: 6px; outline: none; }
                `
            }} />

            {/* TOPBAR */}
            <header className="mav-topbar">
                <div className="mav-brand">
                    <img src={mLabLogo} alt="mLab Logo" style={{ width: 70, height: 'auto' }} />
                    <span className="mav-topbar-title">QCTO / SETA Verification Workspace</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div className="mav-secure-pill">
                        <span className="mav-secure-dot" style={{ background: '#38bdf8' }} />
                        <span className="mav-secure-txt" style={{ color: '#38bdf8' }}>Read-Only Inspector Mode</span>
                    </div>
                    <button
                        onClick={() => setShowEndorseModal(true)}
                        style={{ background: GREEN, color: MIDNIGHT, border: 'none', padding: '8px 16px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                    >
                        <UserCheck size={16} /> Sign Off Cohort Audit
                    </button>
                </div>
            </header>

            {/* BODY WRAPPER */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 24px', maxWidth: '1600px', width: '100%', margin: '0 auto', boxSizing: 'border-box', minHeight: 0, overflow: 'hidden' }}>

                {/* DEDICATED QUALIFICATION SCOPE HEADER */}
                {activeProgrammeData && (
                    <div style={{ flexShrink: 0, background: '#f0f9ff', border: '1px solid #bae6fd', padding: '20px 24px', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 4px rgba(2, 132, 199, 0.05)' }}>
                        <div style={{ background: '#0284c7', padding: '12px', borderRadius: '8px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Award size={28} />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0369a1', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                                Active Audit Target Qualification
                            </div>
                            <h2 style={{ margin: '0 0 6px 0', fontSize: '1.25rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                {activeProgrammeData.name}
                            </h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                                {activeProgrammeData.saqaId && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Tag size={12} color="#0284c7" /> SAQA ID: {activeProgrammeData.saqaId}</span>}
                                {activeProgrammeData.nqfLevel > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Layers size={12} color="#0284c7" /> NQF Level: {activeProgrammeData.nqfLevel}</span>}
                                {activeProgrammeData.credits > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><BookOpen size={12} color="#0284c7" /> Total Credits: {activeProgrammeData.credits}</span>}
                                {(activeProgrammeData as any).accreditingBody && <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12} color="#0284c7" /> Accrediting Body: {(activeProgrammeData as any).accreditingBody}</span>}
                            </div>
                        </div>
                    </div>
                )}

                {/* CONTROLS & SAMPLING TOOLBAR */}
                <div style={{ flexShrink: 0, background: '#ffffff', border: '1px solid #cbd5e1', padding: '16px 20px', borderRadius: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>

                        {/* COHORT SCOPE DROPDOWN */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                                Assigned Cohort Scope ({allowedCohortsForAuditor.length} Permitted)
                            </label>
                            <select
                                value={selectedCohortId}
                                onChange={(e) => handleCohortChange(e.target.value)}
                                style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', background: '#ffffff', outline: 'none', minWidth: '280px' }}
                            >
                                {allowedCohortsForAuditor.length === 0 ? (
                                    <option value="" style={{ color: '#0f172a', background: '#ffffff' }}>No Assigned Cohorts Found</option>
                                ) : (
                                    allowedCohortsForAuditor.map((c: any) => (
                                        <option key={c.id} value={c.id} style={{ color: '#0f172a', background: '#ffffff' }}>{c.name}</option>
                                    ))
                                )}
                            </select>
                        </div>

                        {/* SAMPLING RATIO BUTTONS */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.05em' }}>
                                Sampling Engine Size
                            </label>
                            <div style={{ display: 'flex', border: '1px solid #cbd5e1', borderRadius: '6px', overflow: 'hidden' }}>
                                {[10, 20, 50, 100].map((pct) => (
                                    <button
                                        key={pct}
                                        onClick={() => handleSamplePercentageChange(pct)}
                                        style={{
                                            padding: '8px 14px',
                                            border: 'none',
                                            background: samplePercentage === pct && !searchTerm ? MIDNIGHT : '#ffffff',
                                            color: samplePercentage === pct && !searchTerm ? '#ffffff' : '#475569',
                                            fontWeight: 800,
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                            borderRight: '1px solid #cbd5e1'
                                        }}
                                    >
                                        {pct}% {pct === 10 ? '(QCTO Standard)' : ''}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <button
                            onClick={handleExportSampleManifest}
                            style={{ background: '#f8fafc', border: '1px solid #cbd5e1', color: MIDNIGHT, padding: '8px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                            title="Export CSV of sampled candidates for audit file"
                        >
                            <Printer size={14} /> Export Sample Manifest
                        </button>

                        <div style={{ position: 'relative', minWidth: '220px' }}>
                            <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                            <input
                                type="text"
                                placeholder="Search candidate or ID..."
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px 8px 36px',
                                    border: '1px solid #cbd5e1',
                                    borderRadius: '6px',
                                    fontSize: '0.85rem',
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    background: '#ffffff',
                                    color: '#0f172a'
                                }}
                            />
                        </div>
                    </div>
                </div>

                {/* METRICS SUMMARY ROW WITH ATTENDANCE KPI */}
                <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '16px' }}>
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: `5px solid ${MIDNIGHT}` }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Users size={14} color={MIDNIGHT} /> Sample Size Loaded
                        </span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>{sampledLearners.length} / {cohortPool.length}</div>
                        <span style={{ fontSize: '0.72rem', color: MIDNIGHT, fontWeight: 700 }}>{samplePercentage}% Cohort Audit Subset</span>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #16a34a' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Activity size={14} color="#16a34a" /> Average Progress
                        </span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
                            {sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + b.overallProgress, 0) / sampledLearners.length) : 0}%
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 700 }}>Sampled Completion Ratio</span>
                    </div>

                    {/* ATTENDANCE KPI CARD */}
                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #0284c7' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={14} color="#0284c7" /> Average Attendance
                        </span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
                            {sampledLearners.length > 0 ? Math.round(sampledLearners.reduce((a, b) => a + (b.attendance?.pct || 0), 0) / sampledLearners.length) : 0}%
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#0284c7', fontWeight: 700 }}>{dailyRegisters.length} Sessions Logged</span>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #8b5cf6' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <ShieldCheck size={14} color="#8b5cf6" /> POPIA &amp; Policy Consent
                        </span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
                            {sampledLearners.length > 0 ? Math.round((sampledLearners.filter(l => l.popiaConsent).length / sampledLearners.length) * 100) : 0}%
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#8b5cf6', fontWeight: 700 }}>Governance Verified</span>
                    </div>

                    <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '14px 18px', borderRadius: '8px', borderLeft: '5px solid #f59e0b' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Award size={14} color="#f59e0b" /> SoR Readiness
                        </span>
                        <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
                            {sampledLearners.filter(l => l.sorStatus === 'issued' || l.overallProgress >= 100).length}
                        </div>
                        <span style={{ fontSize: '0.72rem', color: '#f59e0b', fontWeight: 700 }}>Qualified Candidates</span>
                    </div>
                </div>

                {/* MULTI-TABBED NAVIGATION BAR */}
                <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #cbd5e1', borderTop: '1px solid #cbd5e1', flexShrink: 0, marginBottom: '12px' }}>
                    {[
                        { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
                        { id: 'mis_overview', label: 'MIS Overview & Demographics', icon: BarChart3 },
                        { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
                        { id: 'policies', label: 'Learner Policy Compliance', icon: FileSignature }
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as TabOption)}
                                className="ap-tab-btn"
                                style={{
                                    borderBottom: isActive ? `3px solid ${MIDNIGHT}` : '3px solid transparent',
                                    color: isActive ? MIDNIGHT : '#64748b'
                                }}
                            >
                                <Icon size={14} /> {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* TAB CONTENT CONTAINER */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>

                    {/* TAB 1: LEARNER POE VAULT */}
                    {activeTab === 'poe_vault' && (
                        <div className="ap-table-wrap">
                            <div style={{ padding: '12px 20px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CheckSquare size={16} color={GREEN} /> Sampled Learner Evidence Vault
                                </h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    {Object.values(candidateFlags).filter(f => f.flagged).length > 0 && (
                                        <span style={{ fontSize: '0.75rem', background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: '4px', border: '1px solid #fecaca', fontWeight: 800 }}>
                                            🚩 {Object.values(candidateFlags).filter(f => f.flagged).length} Flagged
                                        </span>
                                    )}
                                    <span style={{ fontSize: '0.75rem', color: GREEN, fontWeight: 700 }}>
                                        Page {currentPage} of {totalPages}
                                    </span>
                                </div>
                            </div>

                            <div className="ap-table-scroll">
                                <table className="ap-table">
                                    <thead>
                                        <tr>
                                            <th>Learner Details</th>
                                            <th>Attendance Rate</th>
                                            <th>Curriculum Evidence</th>
                                            <th>Progress</th>
                                            <th>Governance</th>
                                            <th>Auditor Flag</th>
                                            <th style={{ textAlign: 'right' }}>Inspection Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedLearners.map(learner => {
                                            const flagInfo = candidateFlags[learner.id];
                                            const isFlagged = flagInfo?.flagged;
                                            const isDropped = ['dropped', 'withdrawn', 'terminated', 'archived'].includes((learner.status || '').toLowerCase());
                                            const exportState = activeExports[learner.id] || activeExports[learner.userId];
                                            const hasCustomNote = !!flagInfo?.note;

                                            const attPct = learner.attendance?.pct || 0;
                                            const attAttended = learner.attendance?.attended || 0;
                                            const attTotal = learner.attendance?.total || 0;

                                            return (
                                                <tr key={learner.id} style={{ background: isDropped ? '#fef2f2' : (isFlagged ? '#fff5f5' : 'white'), opacity: isDropped ? 0.85 : 1 }}>
                                                    <td>
                                                        <strong style={{ display: 'block', color: isDropped ? '#991b1b' : '#0f172a', fontSize: '0.88rem' }}>{learner.fullName}</strong>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {learner.idNumber}</span>
                                                            {isDropped && (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '1px 6px', borderRadius: '4px', textTransform: 'uppercase' }}>
                                                                    <UserX size={10} /> {learner.status}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--mlab-blue)', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <Award size={11} /> {learner.programmeName}
                                                        </div>
                                                    </td>

                                                    {/* ATTENDANCE COLUMN IN VAULT TABLE */}
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content',
                                                                padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800,
                                                                background: attPct >= 75 ? '#dcfce7' : attPct >= 40 ? '#fef3c7' : '#fef2f2',
                                                                color: attPct >= 75 ? '#15803d' : attPct >= 40 ? '#b45309' : '#dc2626',
                                                                border: `1px solid ${attPct >= 75 ? '#bbf7d0' : attPct >= 40 ? '#fde68a' : '#fecaca'}`
                                                            }}>
                                                                <Clock size={12} /> {attPct}%
                                                            </span>
                                                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                                                {attAttended} / {attTotal} Sessions
                                                            </span>
                                                        </div>
                                                    </td>

                                                    <td style={{ fontSize: '0.8rem' }}>
                                                        <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}>
                                                            <strong style={{ color: '#0284c7' }}>KM:</strong> FA {learner.formatives?.completed || 0}/{learner.formatives?.total || 0} | SA {learner.summatives?.completed || 0}/{learner.summatives?.total || 0}
                                                        </div>
                                                        <div style={{ color: '#0f172a', fontWeight: 600, marginBottom: '2px' }}>
                                                            <strong style={{ color: '#b45309' }}>PM:</strong> {learner.practicals?.completed || 0}/{learner.practicals?.total || 0} Practical Obs
                                                        </div>
                                                        <div style={{ color: '#0f172a', fontWeight: 600 }}>
                                                            <strong style={{ color: '#15803d' }}>WM:</strong> {learner.workplaces?.completed || 0}/{learner.workplaces?.total || 0} Logbooks
                                                        </div>
                                                    </td>

                                                    <td>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '130px' }}>
                                                            <div style={{ flex: 1, height: '8px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                                                                <div style={{ width: `${learner.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (learner.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
                                                            </div>
                                                            <strong style={{ fontSize: '0.8rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{learner.overallProgress}%</strong>
                                                        </div>
                                                    </td>

                                                    <td>
                                                        {learner.popiaConsent ? (
                                                            <span style={{ color: '#16a34a', fontSize: '0.72rem', fontWeight: 800, background: '#dcfce7', padding: '4px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                ✓ Policy Signed
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 800, background: '#fef2f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                Unsigned
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td>
                                                        {isFlagged ? (
                                                            <span
                                                                onClick={() => handleToggleCandidateFlag(learner.id)}
                                                                style={{ color: '#dc2626', fontSize: '0.72rem', fontWeight: 800, background: '#fef2f2', padding: '4px 8px', borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                                                title={flagInfo.note || 'Click to clear flag'}
                                                            >
                                                                <Flag size={12} fill="#dc2626" /> Flagged
                                                            </span>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleToggleCandidateFlag(learner.id)}
                                                                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <Flag size={12} /> Flag Item
                                                            </button>
                                                        )}
                                                    </td>

                                                    <td style={{ textAlign: 'right' }}>
                                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                            {/* AUDITOR NOTE MODAL BUTTON */}
                                                            <button
                                                                onClick={() => handleOpenNotesModal(learner)}
                                                                style={{
                                                                    background: hasCustomNote ? '#fffbeb' : '#f8fafc',
                                                                    color: hasCustomNote ? '#b45309' : '#475569',
                                                                    border: `1px solid ${hasCustomNote ? '#fde68a' : '#cbd5e1'}`,
                                                                    padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', transition: 'all 0.15s'
                                                                }}
                                                                title={hasCustomNote ? flagInfo.note : 'Leave auditor inspection note'}
                                                            >
                                                                <MessageSquare size={14} color={hasCustomNote ? '#b45309' : '#64748b'} />
                                                                {hasCustomNote ? 'Notes' : 'Add Note'}
                                                            </button>

                                                            {/* VIEW SOR BUTTON */}
                                                            <button
                                                                onClick={() => navigate(`/sor/${learner.userId || learner.id}`)}
                                                                style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                                                            >
                                                                <FileText size={14} /> View SoR
                                                            </button>

                                                            {/* DYNAMIC COMPILE POE BUTTON & EXPORT ENGINE INTEGRATION */}
                                                            {(() => {
                                                                if (exportState?.status === 'pending' || exportState?.status === 'processing') {
                                                                    return (
                                                                        <button disabled style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                            <Loader2 size={14} className="animate-spin" /> {exportState.progress}%
                                                                        </button>
                                                                    );
                                                                }
                                                                if (exportState?.status === 'completed' && exportState?.downloadUrl) {
                                                                    return (
                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                            <button
                                                                                onClick={() => window.open(exportState.downloadUrl, '_blank')}
                                                                                style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                                                                title="Download existing PoE"
                                                                            >
                                                                                <Download size={14} /> Download
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleGeneratePoE(learner, true)}
                                                                                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                                                                title="Regenerate PoE"
                                                                            >
                                                                                <RefreshCw size={14} />
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                }
                                                                if (exportState?.status === 'error') {
                                                                    return (
                                                                        <button
                                                                            onClick={() => handleGeneratePoE(learner, true)}
                                                                            style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                        >
                                                                            <AlertCircle size={14} /> Retry PoE
                                                                        </button>
                                                                    );
                                                                }
                                                                return (
                                                                    <button
                                                                        onClick={() => handleGeneratePoE(learner)}
                                                                        style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                                                                    >
                                                                        <FileArchive size={14} /> Compile PoE
                                                                    </button>
                                                                );
                                                            })()}

                                                            {/* INSPECT FULL POE DRAWER BUTTON */}
                                                            <button
                                                                onClick={() => setInspectedLearner(learner)}
                                                                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '6px 14px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'all 0.15s' }}
                                                            >
                                                                <Eye size={14} /> Inspect Full PoE
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}

                                        {sampledLearners.length === 0 && (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '3.5rem', textAlign: 'center', color: '#64748b', background: '#ffffff' }}>
                                                    <FileCheck size={40} color="#cbd5e1" style={{ margin: '0 auto 1rem' }} />
                                                    <h4 style={{ margin: '0 0 4px', color: MIDNIGHT, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Evidence Vaults Found</h4>
                                                    <p style={{ margin: 0, fontSize: '0.82rem' }}>No candidate records match this cohort scope or search filter.</p>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569', flexWrap: 'wrap', gap: '10px' }}>
                                <div>Showing <strong>{sampledLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, sampledLearners.length)}</strong> of <strong>{sampledLearners.length}</strong> sampled records</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span>Rows per page:</span>
                                        <select value={itemsPerPage} onChange={(e) => setItemsPerPage(Number(e.target.value))} style={{ height: '28px', border: '1px solid #cbd5e1', background: '#ffffff', padding: '0 6px', fontSize: '0.75rem', color: MIDNIGHT, fontWeight: 700, borderRadius: '4px', outline: 'none', cursor: 'pointer' }}>
                                            <option value={5}>5</option>
                                            <option value={10}>10</option>
                                            <option value={15}>15</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', opacity: currentPage === 1 ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            <ChevronLeft size={14} /> Prev
                                        </button>
                                        <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPages}</span>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPages ? 'not-allowed' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            Next <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: MIS OVERVIEW & DEMOGRAPHICS */}
                    {activeTab === 'mis_overview' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                <div style={{ border: '1px solid #cbd5e1', padding: '16px', background: 'white', borderRadius: '8px' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Equity Group Distribution</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Black African:</span> <strong>{cohortMisDemographics.equity.African} ({calcPct(cohortMisDemographics.equity.African, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Coloured:</span> <strong>{cohortMisDemographics.equity.Coloured} ({calcPct(cohortMisDemographics.equity.Coloured, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Indian / Asian:</span> <strong>{cohortMisDemographics.equity.Indian} ({calcPct(cohortMisDemographics.equity.Indian, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>White:</span> <strong>{cohortMisDemographics.equity.White} ({calcPct(cohortMisDemographics.equity.White, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, }}><span>Other / Unspecified:</span> <strong>{cohortMisDemographics.equity.Other} ({calcPct(cohortMisDemographics.equity.Other, cohortMisDemographics.total)}%)</strong></div>
                                    </div>
                                </div>

                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', background: '#ffffff' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Gender &amp; Disability Metrics</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Female Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Female} ({calcPct(cohortMisDemographics.gender.Female, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Male Candidates:</span> <strong style={{ color: '#0284c7' }}>{cohortMisDemographics.gender.Male} ({calcPct(cohortMisDemographics.gender.Male, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>PWD Candidates:</span> <strong style={{ color: '#d97706' }}>{cohortMisDemographics.disability.Yes} ({calcPct(cohortMisDemographics.disability.Yes, cohortMisDemographics.total)}%)</strong></div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: MIDNIGHT, }}><span>Youth (&lt;35 Years):</span> <strong style={{ color: '#15803d' }}>{cohortMisDemographics.youth.Under35} ({calcPct(cohortMisDemographics.youth.Under35, cohortMisDemographics.total)}%)</strong></div>
                                    </div>
                                </div>

                                {/* ATTENDANCE COMPLIANCE HEALTH BREAKDOWN CARD */}
                                <div style={{ border: '1px solid #cbd5e1', color: MIDNIGHT, borderRadius: '8px', padding: '16px', background: '#ffffff' }}>
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800 }}>Attendance Health Bands</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.82rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                                            <span>High Compliance (75%+):</span> <strong style={{ color: '#16a34a' }}>{cohortMisDemographics.attendanceBands.high} ({calcPct(cohortMisDemographics.attendanceBands.high, cohortMisDemographics.total)}%)</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                                            <span>At-Risk Band (40% - 74%):</span> <strong style={{ color: '#b45309' }}>{cohortMisDemographics.attendanceBands.mid} ({calcPct(cohortMisDemographics.attendanceBands.mid, cohortMisDemographics.total)}%)</strong>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Critical Risk (&lt;40%):</span> <strong style={{ color: '#dc2626' }}>{cohortMisDemographics.attendanceBands.low} ({calcPct(cohortMisDemographics.attendanceBands.low, cohortMisDemographics.total)}%)</strong>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* REPORT EXPORTERS */}
                            <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '16px', background: '#ffffff', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.85rem', color: MIDNIGHT, textTransform: 'uppercase', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <BarChart3 size={16} color={MIDNIGHT} /> Regulatory Report Exporters
                                </h4>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                                    {/* SAQA NLRD REPORT EXPORTER */}
                                    <div style={{ border: '1px solid #cbd5e1', padding: '14px', borderRadius: '6px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                                        <div>
                                            <strong style={{ fontSize: '0.85rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <FileText size={14} color="#0284c7" /> SAQA NLRD Pipe-Delimited Batch
                                            </strong>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                                Generates 28-field statutory NLRD text/CSV file for SETA submission.
                                            </p>
                                        </div>

                                        <div>
                                            {lastNlrdExport ? (
                                                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                    <button
                                                        onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
                                                        style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                    >
                                                        <Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})
                                                    </button>
                                                    <button
                                                        onClick={handleExportNLRD}
                                                        disabled={nlrdProgress.status !== 'idle'}
                                                        style={{ background: '#f1f5f9', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                        title="Re-run Cloud Function to compile fresh data"
                                                    >
                                                        <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleExportNLRD}
                                                    disabled={nlrdProgress.status !== 'idle'}
                                                    style={{ width: '100%', background: MIDNIGHT, color: 'white', border: 'none', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                                >
                                                    {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                                                    {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
                                                    {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
                                                    {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* THROUGHPUT MATRIX EXPORTER */}
                                    <div style={{ border: '1px solid #cbd5e1', padding: '14px', borderRadius: '6px', background: '#f8fafc', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '10px' }}>
                                        <div>
                                            <strong style={{ fontSize: '0.85rem', color: MIDNIGHT, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <BarChart3 size={14} color="#16a34a" /> Learner Throughput Matrix (CSV)
                                            </strong>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                                Itemized milestone progress across KM Formatives, Summatives, PM Observations, &amp; Logbooks.
                                            </p>
                                        </div>

                                        <div>
                                            {lastMatrixExport ? (
                                                <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                                    <button
                                                        onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')}
                                                        style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                                    >
                                                        <Download size={14} /> Download Matrix ({lastMatrixExport.generatedAt})
                                                    </button>
                                                    <button
                                                        onClick={handleExportThroughputMatrix}
                                                        disabled={matrixProgress.status !== 'idle'}
                                                        style={{ background: '#f1f5f9', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '8px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                                                        title="Re-run Cloud Function to compile fresh data"
                                                    >
                                                        <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={handleExportThroughputMatrix}
                                                    disabled={matrixProgress.status !== 'idle'}
                                                    style={{ width: '100%', background: '#ffffff', color: MIDNIGHT, border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                                >
                                                    {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                                                    {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
                                                    {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
                                                    {matrixProgress.status === 'idle' && 'Download Learner Details & Throughput Ratio (CSV)'}
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: APPEALS & GRIEVANCES */}
                    {activeTab === 'grievances' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <Filter size={14} color="#64748b" />
                                    <select value={grievanceFilterStatus} onChange={(e) => setGrievanceFilterStatus(e.target.value)} className="ap-filter-select">
                                        <option value="ALL">All Statuses</option>
                                        <option value="open">Open</option>
                                        <option value="under_review">Under Review</option>
                                        <option value="resolved">Resolved</option>
                                    </select>
                                    <select value={grievanceFilterType} onChange={(e) => setGrievanceFilterType(e.target.value)} className="ap-filter-select">
                                        <option value="ALL">All Types</option>
                                        <option value="appeal">Appeals Only</option>
                                        <option value="complaint">Complaints Only</option>
                                    </select>
                                </div>
                            </div>

                            <div className="ap-table-wrap">
                                <div className="ap-table-scroll">
                                    <table className="ap-table">
                                        <thead>
                                            <tr>
                                                <th>Ref ID</th>
                                                <th>Learner</th>
                                                <th>Type</th>
                                                <th>Date Logged</th>
                                                <th>Description</th>
                                                <th>Status</th>
                                                <th style={{ textAlign: 'right' }}>Resolution Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedGrievances.map(g => (
                                                <tr key={g.docId}>
                                                    <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
                                                    <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
                                                    <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
                                                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
                                                    <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
                                                    <td>
                                                        {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>OPEN</span>}
                                                        {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a' }}>UNDER REVIEW</span>}
                                                        {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>RESOLVED</span>}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            onClick={() => {
                                                                setSelectedGrievance(g);
                                                                setGrievanceStatusInput(g.status);
                                                                setGrievanceResolutionNotes(g.resolutionNotes || '');
                                                            }}
                                                            style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                        >
                                                            <Eye size={12} /> Inspect / Resolve
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {paginatedGrievances.length === 0 && (
                                                <tr>
                                                    <td colSpan={7} style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                                                        No grievances or appeals recorded for this cohort scope.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
                                    <div>Showing <strong>{cohortFilteredGrievances.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> grievances</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
                                            <ChevronLeft size={14} /> Prev
                                        </button>
                                        <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPagesGrievances}</span>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))} disabled={currentPage >= totalPagesGrievances} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPagesGrievances ? 'not-allowed' : 'pointer' }}>
                                            Next <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 4: LEARNER POLICY COMPLIANCE */}
                    {activeTab === 'policies' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
                                <div style={{ position: 'relative', minWidth: '260px' }}>
                                    <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                                    <input
                                        type="text"
                                        placeholder="Search learner policy status..."
                                        value={policySearchTerm}
                                        onChange={(e) => setPolicySearchTerm(e.target.value)}
                                        style={{ width: '100%', padding: '8px 12px 8px 36px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', background: '#ffffff' }}
                                    />
                                </div>
                            </div>

                            <div className="ap-table-wrap">
                                <div className="ap-table-scroll">
                                    <table className="ap-table">
                                        <thead>
                                            <tr>
                                                <th>Learner Details</th>
                                                <th>Cohort Scope</th>
                                                <th>Code of Conduct</th>
                                                <th>Appeals Policy</th>
                                                <th>PoPIA Consent</th>
                                                <th style={{ textAlign: 'right' }}>Compliance State</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedPolicyLearners.map(l => (
                                                <tr key={l.id}>
                                                    <td>
                                                        <strong style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a' }}>{l.fullName}</strong>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
                                                    </td>
                                                    <td style={{ fontSize: '0.8rem', color: '#334155' }}>{l.cohortName}</td>
                                                    <td>
                                                        {l.codeOfConductSigned ? (
                                                            <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>✓ SIGNED</span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>UNSIGNED</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {l.appealsPolicySigned ? (
                                                            <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0' }}>✓ SIGNED</span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>UNSIGNED</span>
                                                        )}
                                                    </td>
                                                    <td>
                                                        {l.popiaConsent ? (
                                                            <span style={{ fontSize: '0.7rem', color: '#0284c7', background: '#e0f2fe', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bae6fd' }}>✓ CONSENTED</span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca' }}>PENDING</span>
                                                        )}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {l.codeOfConductSigned && l.popiaConsent ? (
                                                            <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: 800 }}>Fully Compliant</span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 800 }}>Pending Action</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', fontSize: '0.8rem', color: '#475569' }}>
                                    <div>Showing <strong>{searchedPolicyLearners.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedPolicyLearners.length)}</strong> of <strong>{searchedPolicyLearners.length}</strong> candidate policies</div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}>
                                            <ChevronLeft size={14} /> Prev
                                        </button>
                                        <span style={{ padding: '0 6px', fontWeight: 700, color: MIDNIGHT }}>{currentPage} / {totalPagesPolicyLearners}</span>
                                        <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPagesPolicyLearners, p + 1))} disabled={currentPage >= totalPagesPolicyLearners} style={{ background: '#ffffff', border: '1px solid #cbd5e1', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, color: MIDNIGHT, borderRadius: '4px', cursor: currentPage >= totalPagesPolicyLearners ? 'not-allowed' : 'pointer' }}>
                                            Next <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </div>

            {/* AUDITOR LEARNER NOTE MODAL */}
            {notesModalLearner && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '550px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ padding: '18px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <NotebookPen size={20} color={GREEN} />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Auditor Candidate Notes
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                        Candidate: {notesModalLearner.fullName} ({notesModalLearner.idNumber})
                                    </span>
                                </div>
                            </div>
                            <button onClick={() => setNotesModalLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={18} /></button>
                        </div>

                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#475569', lineHeight: 1.5 }}>
                                Leave specific spot-check findings, verification caveats, or audit notes for <strong>{notesModalLearner.fullName}</strong>. Notes are exported with the Sample Manifest.
                            </p>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '6px', textTransform: 'uppercase' }}>Inspection Finding / Note *</label>
                                <textarea
                                    rows={4}
                                    value={learnerNoteInput}
                                    onChange={(e) => setLearnerNoteInput(e.target.value)}
                                    placeholder="e.g., Verified formative assessment 2 submission on 2026-09-23. Awaiting signed logbook page 12..."
                                    style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setNotesModalLearner(null)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px 16px', borderRadius: '6px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSaveLearnerNote} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                <CheckSquare size={14} /> Save Note
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* GRIEVANCE RESOLUTION MODAL */}
            {selectedGrievance && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '600px', background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 20px', background: MIDNIGHT, color: 'white', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Scale size={18} color="#4ade80" />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Grievance Resolution: {selectedGrievance.id}</h3>
                            </div>
                            <button onClick={() => setSelectedGrievance(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><X size={18} /></button>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.82rem' }}>
                                <div><strong>Candidate:</strong> {selectedGrievance.learnerName}</div>
                                <div><strong>Logged Date:</strong> {selectedGrievance.dateLogged}</div>
                                <div><strong>Type:</strong> <span style={{ textTransform: 'uppercase', fontWeight: 800 }}>{selectedGrievance.type}</span></div>
                                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                    <strong>Details:</strong>
                                    <p style={{ margin: '4px 0 0 0', color: '#334155' }}>{selectedGrievance.description}</p>
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Update Status</label>
                                <select value={grievanceStatusInput} onChange={(e: any) => setGrievanceStatusInput(e.target.value)} style={{ width: '100%', padding: '8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem' }}>
                                    <option value="open">Open (Awaiting Investigation)</option>
                                    <option value="under_review">Under Review by Moderation Committee</option>
                                    <option value="resolved">Resolved (Official Findings Logged)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, marginBottom: '6px' }}>Moderation / Resolution Findings</label>
                                <textarea
                                    rows={4}
                                    value={grievanceResolutionNotes}
                                    onChange={(e) => setGrievanceResolutionNotes(e.target.value)}
                                    placeholder="Enter committee notes, resolution details, or outcome letter comments..."
                                    style={{ width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '16px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => setSelectedGrievance(null)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '8px 16px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={handleSaveGrievanceResolution} disabled={isSavingGrievance} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {isSavingGrievance ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save Resolution Record
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* READ-ONLY POE INSPECTION DRAWER */}
            {inspectedLearner && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backdropFilter: 'blur(4px)' }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '850px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>

                        {/* MODAL HEADER */}
                        <div style={{ padding: '18px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileCheck size={20} color={GREEN} />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Auditor Inspection Vault: {inspectedLearner.fullName}
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                        ID: {inspectedLearner.idNumber} | Cohort: {inspectedLearner.cohortName}
                                    </span>
                                    <div style={{ fontSize: '0.72rem', color: GREEN, fontWeight: 700, marginTop: '2px' }}>
                                        Target Qualification: {inspectedLearner.programmeName}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setInspectedLearner(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
                        </div>

                        {/* MODAL BODY */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* DROPOUT WARNING BANNER IF APPLICABLE */}
                            {['dropped', 'withdrawn', 'terminated', 'archived'].includes((inspectedLearner.status || '').toLowerCase()) && (
                                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', padding: '10px 14px', borderRadius: '6px', fontSize: '0.82rem', color: '#991b1b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <UserX size={16} color="#dc2626" />
                                    <span>Candidate Status: {inspectedLearner.status.toUpperCase()} (Learner Has Discontinued Training)</span>
                                </div>
                            )}

                            {/* SPOT-CHECK FLAGGING TOOL FOR THIS CANDIDATE */}
                            <div style={{ background: candidateFlags[inspectedLearner.id]?.flagged ? '#fef2f2' : '#f8fafc', border: `1px solid ${candidateFlags[inspectedLearner.id]?.flagged ? '#fecaca' : '#cbd5e1'}`, borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Flag size={16} color={candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : '#64748b'} />
                                        <strong style={{ fontSize: '0.85rem', color: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : MIDNIGHT }}>
                                            Auditor Candidate Spot-Check Flag
                                        </strong>
                                    </div>
                                    <button
                                        onClick={() => handleToggleCandidateFlag(inspectedLearner.id)}
                                        style={{
                                            background: candidateFlags[inspectedLearner.id]?.flagged ? '#dc2626' : 'white',
                                            color: candidateFlags[inspectedLearner.id]?.flagged ? 'white' : '#475569',
                                            border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer'
                                        }}
                                    >
                                        {candidateFlags[inspectedLearner.id]?.flagged ? 'Remove Flag' : 'Flag Candidate for Review'}
                                    </button>
                                </div>

                                {candidateFlags[inspectedLearner.id]?.flagged && (
                                    <textarea
                                        rows={2}
                                        value={candidateFlags[inspectedLearner.id]?.note || ''}
                                        onChange={(e) => handleUpdateFlagNote(inspectedLearner.id, e.target.value)}
                                        placeholder="Enter specific auditor spot-check findings or compliance caveats for this candidate..."
                                        style={{ width: '100%', padding: '8px 10px', border: '1px solid #fca5a5', borderRadius: '4px', fontSize: '0.8rem', background: 'white', color: '#0f172a', outline: 'none', boxSizing: 'border-box' }}
                                    />
                                )}
                            </div>

                            {/* MILESTONE SUMMARY LEDGER WITH ATTENDANCE SUMMARY */}
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: MIDNIGHT, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Briefcase size={14} color={MIDNIGHT} /> Curriculum Completion &amp; Attendance Ledger
                                </h4>
                                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '14px', background: '#ffffff', fontSize: '0.82rem', color: '#0f172a', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    <div>Class Attendance Rate: <strong style={{ color: inspectedLearner.attendance.pct >= 75 ? '#16a34a' : inspectedLearner.attendance.pct >= 40 ? '#b45309' : '#dc2626' }}>{inspectedLearner.attendance.pct}% ({inspectedLearner.attendance.attended} / {inspectedLearner.attendance.total} sessions)</strong></div>
                                    <div>Knowledge FA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.formatives.completed} / {inspectedLearner.formatives.total}</strong></div>
                                    <div>Knowledge SA: <strong style={{ color: '#0284c7' }}>{inspectedLearner.summatives.completed} / {inspectedLearner.summatives.total}</strong></div>
                                    <div>Practical PM: <strong style={{ color: '#b45309' }}>{inspectedLearner.practicals.completed} / {inspectedLearner.practicals.total}</strong></div>
                                    <div>Workplace WM: <strong style={{ color: '#15803d' }}>{inspectedLearner.workplaces.completed} / {inspectedLearner.workplaces.total}</strong></div>
                                </div>
                            </div>

                            {/* ITEMIZED SUBMISSION FILE LIST */}
                            <div>
                                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.85rem', textTransform: 'uppercase', color: MIDNIGHT, fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <FileText size={14} color={MIDNIGHT} /> Submitted Evidence Files &amp; Assessment Artifacts ({inspectedLearnerSubmissions.length})
                                </h4>

                                {inspectedLearnerSubmissions.length === 0 ? (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', fontSize: '0.82rem' }}>
                                        <AlertCircle size={24} color="#94a3b8" style={{ margin: '0 auto 6px' }} />
                                        No digital submission documents found in Firestore for this candidate ID.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {inspectedLearnerSubmissions.map((sub: any) => {
                                            const subTitle = sub.title || sub.assessmentTitle || sub.taskName || sub.moduleCode || 'Assessment Task';
                                            const subType = String(sub.type || sub.moduleType || 'Formative').toUpperCase();
                                            const fileUrl = sub.fileUrl || sub.downloadUrl || sub.evidenceUrl || sub.submissionUrl;
                                            const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(String(sub.status || '').toLowerCase());

                                            return (
                                                <div key={sub.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '0.82rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span>{subTitle}</span>
                                                            <span style={{ fontSize: '0.65rem', background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: '4px', fontWeight: 800 }}>{subType}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                                                            Status: <strong style={{ color: isDone ? '#16a34a' : '#d97706' }}>{String(sub.status || 'Pending').toUpperCase()}</strong> | Outcome: <strong>{sub.competency || sub.outcome || sub.marks || 'Verified'}</strong>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        {fileUrl ? (
                                                            <a
                                                                href={fileUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                            >
                                                                <ExternalLink size={12} /> View File
                                                            </a>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>No URL file link</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* MODAL FOOTER */}
                        <div style={{ padding: '16px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button onClick={() => setInspectedLearner(null)} style={{ background: MIDNIGHT, color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', transition: 'opacity 0.2s' }}>
                                Close Inspection Drawer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ENDORSEMENT SIGN-OFF MODAL */}
            {showEndorseModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(7, 63, 78, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '550px', background: '#ffffff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                        <div style={{ padding: '20px 24px', background: MIDNIGHT, color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Record Official Audit Sign-Off</h3>
                            <button onClick={() => setShowEndorseModal(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#ffffff', cursor: 'pointer', borderRadius: '6px', padding: '4px' }}><X size={20} /></button>
                        </div>

                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '8px', textTransform: 'uppercase' }}>Audit Verification Outcome</label>
                                <select value={auditOutcome} onChange={(e: any) => setAuditOutcome(e.target.value)} style={{ width: '100%', padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', color: '#0f172a', background: '#f8fafc', fontWeight: 600 }}>
                                    <option value="approved">Fully Approved &amp; Endorsed</option>
                                    <option value="conditional">Conditional Approval (Minor Corrective Actions)</option>
                                    <option value="rejected">Rejected (Major Compliance Audit Failure)</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: MIDNIGHT, marginBottom: '8px', textTransform: 'uppercase' }}>Auditor Report &amp; Findings *</label>
                                <textarea
                                    rows={5}
                                    value={auditNotes}
                                    onChange={(e) => setAuditNotes(e.target.value)}
                                    placeholder="Enter detailed audit findings, sample verification comments, and SETA endorsement notes..."
                                    style={{ width: '100%', padding: '12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box', color: '#0f172a', background: '#f8fafc', resize: 'vertical' }}
                                />
                            </div>
                        </div>

                        <div style={{ padding: '20px 24px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setShowEndorseModal(false)} style={{ background: 'transparent', border: '1px solid #cbd5e1', color: '#64748b', padding: '10px 20px', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
                            <button
                                onClick={handleSaveEndorsement}
                                disabled={isSavingEndorsement}
                                style={{ background: '#16a34a', color: '#ffffff', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                            >
                                {isSavingEndorsement ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Save Sign-Off Record
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* STATUS MODAL FOR ERROR & WARNING OVERLAYS */}
            {statusModal.isOpen && (
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    confirmText="Acknowledge"
                    onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
                />
            )}
        </div>
    );
};