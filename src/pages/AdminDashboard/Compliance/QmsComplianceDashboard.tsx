// src/pages/AdminDashboard/QmsComplianceDashboard/QmsComplianceDashboard.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ShieldCheck, Download, Users, FileText, AlertCircle,
    FileCheck, Scale, FileSignature, BarChart3, Search,
    CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2,
    ChevronLeft, ChevronRight, Layers, UserX, X, RefreshCw, Lock
} from 'lucide-react';
import { collection, onSnapshot, query, orderBy, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import Loader from '../../../components/common/Loader/Loader';
import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

interface LearnerRecord {
    id: string;
    userId: string;
    name: string;
    idNumber: string;
    cohortId: string;
    cohortName: string;
    programmeName: string;
    overallProgress: number;
    formatives: { completed: number; total: number };
    summatives: { completed: number; total: number };
    practicals: { completed: number; total: number };
    workplaces: { completed: number; total: number };
    sorStatus: 'issued' | 'pending' | 'not_ready';
    status: string;
    isOffline?: boolean;
    isBootcamp?: boolean;
    saqaId?: string;
}

interface GrievanceRecord {
    id: string;
    learnerName: string;
    cohortId: string;
    dateLogged: string;
    type: 'appeal' | 'complaint';
    status: 'open' | 'under_review' | 'resolved';
    description: string;
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

export const QmsComplianceDashboard: React.FC = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    const [isQctoAuditMode, setIsQctoAuditMode] = useState(false);
    const [offlineModalLearner, setOfflineModalLearner] = useState<LearnerRecord | null>(null);

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

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(15);
    const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');

    const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

    const {
        user: currentUser,
        learners: storeLearners,
        cohorts: storeCohorts,
        programmes: storeProgrammes,
        fetchProgrammes,
        fetchCohorts,
        fetchLearners
    } = useStore() as any;

    const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
    const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
    const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
    const [policySignerIds, setPolicySignerIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes();
        if (!storeCohorts || storeCohorts.length === 0) fetchCohorts();
        if (!storeLearners || storeLearners.length === 0) fetchLearners();
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedCohortId, itemsPerPage, activeTab, isQctoAuditMode]);

    useEffect(() => {
        setLastNlrdExport(null);
        setLastMatrixExport(null);
    }, [selectedCohortId]);

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

    useEffect(() => {
        setIsLoading(true);

        const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
            const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawEnrollments(raw);
        });

        let submissionsQuery = collection(db, 'learner_submissions') as any;
        if (selectedCohortId !== 'ALL') {
            submissionsQuery = query(submissionsQuery, where('cohortId', '==', selectedCohortId));
        }

        const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
            const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawSubmissions(subs);
        });

        const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
        const unsubGrievances = onSnapshot(qGrievances, (snap) => {
            const parsedGrievances: GrievanceRecord[] = [];
            snap.docs.forEach(doc => {
                const data = doc.data();
                parsedGrievances.push({
                    id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
                    learnerName: data.learnerName || 'Unknown Learner',
                    cohortId: data.cohortId || data.cohortRunId || '',
                    dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    type: data.type || 'appeal',
                    status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
                    description: data.reason || data.description || 'No description provided'
                });
            });
            setRawGrievances(parsedGrievances);
        });

        const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
            const signers = new Set(snap.docs.map(d => d.data().userId));
            setPolicySignerIds(signers as Set<string>);
            setTimeout(() => setIsLoading(false), 500);
        });

        return () => {
            unsubEnrollments();
            unsubSubmissions();
            unsubGrievances();
            unsubPolicies();
        };
    }, [selectedCohortId]);

    const enrichedLearners = useMemo(() => {
        return rawEnrollments.map((data): LearnerRecord => {
            const actualUserId = data.userId || data.learnerId || data.idNumber || '';
            const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.idNumber === actualUserId);

            const activeCohortId = data.cohortId || data.cohortRunId;
            const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

            let storeProgramme = storeProgrammes?.find((p: any) =>
                p.id === storeCohort?.programmeId ||
                p.id === storeCohort?.qualificationId ||
                p.id === data.programmeId
            );

            if (!storeProgramme && data.qualification?.saqaId) {
                storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.qualification.saqaId));
            }
            if (!storeProgramme && data.saqaId) {
                storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.saqaId));
            }

            const mappedName = data.userName || data.learnerName || data.fullName || data.name || storeLearner?.fullName || storeLearner?.name || 'Unknown Learner';
            const mappedId = data.idNumber || actualUserId || 'N/A';
            const mappedCohort = data.cohortName || storeCohort?.name || activeCohortId || 'Unassigned Cohort';
            const mappedProgramme = storeProgramme?.name || 'Generic Framework';

            const isOffline = !!(data.isOffline || storeLearner?.isOffline);
            const isBootcamp = !!(data.isBootcamp || storeCohort?.isBootcamp || storeProgramme?.isBootcamp || (storeProgramme && !storeProgramme.saqaId));
            const saqaId = storeProgramme?.saqaId || data.qualification?.saqaId || data.saqaId || '';

            let totalBlueprintKM = 0;
            let totalBlueprintPM = 0;
            let totalBlueprintWM = 0;

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

            let calculatedFA = 0;
            let calculatedSA = 0;
            let calculatedPM = 0;
            let calculatedWM = 0;

            let totalAssignedFA = 0;
            let totalAssignedSA = 0;
            let totalAssignedPM = 0;
            let totalAssignedWM = 0;

            const learnerSubs = rawSubmissions.filter(s =>
                (actualUserId && s.learnerId === actualUserId) ||
                (actualUserId && s.authUid === actualUserId) ||
                (data.id && s.enrollmentId === data.id)
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

            return {
                id: data.id,
                userId: actualUserId,
                name: mappedName,
                idNumber: mappedId,
                cohortId: activeCohortId || 'unassigned',
                cohortName: mappedCohort,
                programmeName: mappedProgramme,
                overallProgress: dynamicProgress,
                formatives: { completed: calculatedFA, total: ceilingFA },
                summatives: { completed: calculatedSA, total: ceilingSA },
                practicals: { completed: calculatedPM, total: ceilingPM },
                workplaces: { completed: calculatedWM, total: ceilingWM },
                sorStatus: data.sorStatus || 'pending',
                status: data.status || 'active',
                isOffline,
                isBootcamp,
                saqaId
            };
        });
    }, [rawEnrollments, rawSubmissions, storeLearners, storeCohorts, storeProgrammes]);

    const cohortFilteredLearners = useMemo(() => {
        let list = selectedCohortId === 'ALL'
            ? enrichedLearners
            : enrichedLearners.filter(l => l.cohortId === selectedCohortId);

        if (isQctoAuditMode) {
            list = list.filter(l => !l.isBootcamp && l.saqaId && l.saqaId !== 'N/A');
        }

        return list;
    }, [enrichedLearners, selectedCohortId, isQctoAuditMode]);

    const cohortFilteredGrievances = useMemo(() => {
        if (selectedCohortId === 'ALL') return rawGrievances;
        return rawGrievances.filter(g => g.cohortId === selectedCohortId);
    }, [rawGrievances, selectedCohortId]);

    const searchedLearners = useMemo(() => {
        if (!searchTerm.trim()) return cohortFilteredLearners;
        const lowerSearch = searchTerm.toLowerCase();
        return cohortFilteredLearners.filter(l =>
            (l.name && l.name.toLowerCase().includes(lowerSearch)) ||
            (l.idNumber && l.idNumber.toLowerCase().includes(lowerSearch)) ||
            (l.cohortName && l.cohortName.toLowerCase().includes(lowerSearch))
        );
    }, [cohortFilteredLearners, searchTerm]);

    // 🚀 FULLY FIXED INDEPENDENT CALCULATION FOR POLICIES VS POPIA
    const displayStats = useMemo(() => {
        let active = 0;
        let grad = 0;
        let drop = 0;
        let codeOfConductSignedCount = 0; // Strictly learner_policy_signoffs
        let popiaConsentCount = 0; // Strictly POPIA/popiActAgree fields

        cohortFilteredLearners.forEach(l => {
            const status = l.status.toLowerCase();
            if (status === 'active') active++;
            else if (status === 'graduated' || status === 'competent') grad++;
            else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

            const storeLearner = storeLearners?.find((sl: any) => sl.id === l.userId || sl.idNumber === l.idNumber || sl.id === l.id);
            const rawEnrol = rawEnrollments?.find((re: any) => re.id === l.id || re.userId === l.userId);

            // 1. DEDICATED CODE OF CONDUCT CHECK (Uses original policySignerIds logic)
            if (l.userId && policySignerIds.has(l.userId)) {
                codeOfConductSignedCount++;
            }

            // 2. DEDICATED POPIA DATA CONSENT CHECK (Uses new global compliance flags)
            const hasPopia =
                storeLearner?.popiaConsent === true ||
                rawEnrol?.popiaConsent === true ||
                storeLearner?.demographics?.popiaConsent === true ||
                rawEnrol?.demographics?.popiaConsent === true ||
                storeLearner?.demographics?.popiActAgree === 'Y' ||
                rawEnrol?.demographics?.popiActAgree === 'Y';

            if (hasPopia) {
                popiaConsentCount++;
            }
        });

        const total = cohortFilteredLearners.length;
        const retentionRate = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;
        const denominator = total > 0 ? total : 1;

        const policySignedPct = Math.min(100, Math.round((codeOfConductSignedCount / denominator) * 100));
        const popiaConsentPct = Math.min(100, Math.round((popiaConsentCount / denominator) * 100));

        // Use same calculation for Appeals logic if historical signoffs covered both
        const appealsSignedPct = policySignedPct; 

        const activeGrievances = cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length;

        return {
            totalEnrolled: total,
            activeTraining: active,
            graduated: grad,
            droppedOut: drop,
            retentionRate,
            activeGrievances,
            policySignedPct,
            appealsSignedPct,
            popiaConsentPct
        };
    }, [cohortFilteredLearners, cohortFilteredGrievances, policySignerIds, storeLearners, rawEnrollments]);

    const totalPagesLearners = Math.max(1, Math.ceil(searchedLearners.length / itemsPerPage));
    const paginatedLearners = searchedLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
    const paginatedGrievances = cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

                toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords} records.`);
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

                toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners} learners!`);
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

    const handleGeneratePoE = async (learner: LearnerRecord, forceRegenerate: boolean = false) => {
        const targetLearnerId = learner.userId || learner.id;
        const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

        if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
            toast.info(`An export for ${learner.name} is already in progress (${currentExport.progress}%).`);
            return;
        }

        if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
            window.open(currentExport.downloadUrl, '_blank');
            return;
        }

        try {
            toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.name}...`);

            const docRef = await addDoc(collection(db, 'poe_export_requests'), {
                learnerId: targetLearnerId,
                requestedBy: currentUser?.uid || currentUser?.id || 'admin',
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
                message: error.message || `Failed to trigger PoE compilation for ${learner.name}.`
            });
        }
    };

    if (isLoading) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
                <Loader message="Syncing Compliance Ledger..." />
            </div>
        );
    }

    return (
        <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--mlab-bg, #f8fafc)', overflow: 'hidden' }}>

            <style>{`
                .sm-table-container { 
                    background: #fff; 
                    border: 1px solid var(--mlab-border); 
                    border-top: 3px solid var(--mlab-blue); 
                    overflow: hidden; 
                    border-radius: 4px; 
                    display: flex; 
                    flex-direction: column; 
                    flex: 1;
                    min-height: 400px;
                }
                .sm-table-scroll { 
                    flex: 1; 
                    overflow-y: auto; 
                    overflow-x: auto; 
                    display: flex; 
                    flex-direction: column; 
                }
                .sm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                
                .sm-table th { 
                    background: var(--mlab-midnight, #0f172a); 
                    padding: 12px 16px; 
                    font-family: var(--font-heading); 
                    text-transform: uppercase; 
                    color: white; 
                    border-bottom: 2px solid var(--mlab-green, #16a34a); 
                    font-size: 0.8rem; 
                    letter-spacing: 0.05em; 
                    position: sticky; 
                    top: 0; 
                    z-index: 10; 
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                
                .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
                .sm-table tr:hover td { background-color: #f8fafc; }
                
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
                    margin-top: auto; 
                }
                .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; }
                .sm-page-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
                .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
                .sm-filter-select { height: 28px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 6px; font-size: 0.75rem; color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }
            `}</style>

            {/* HEADER COMPONENT */}
            <header style={{ padding: '24px', background: 'var(--mlab-midnight)', color: 'white', borderBottom: '3px solid var(--mlab-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', flexShrink: 0 }}>
                <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <ShieldCheck size={14} /> Quality Management System (QMS)
                    </div>
                    <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
                        SETA &amp; QCTO Compliance Dashboard
                    </h1>
                    <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', maxWidth: '600px', lineHeight: 1.5 }}>
                        Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    
                    {/* QCTO AUDIT MODE TOGGLE */}
                    <button
                        onClick={() => setIsQctoAuditMode(!isQctoAuditMode)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: isQctoAuditMode ? '#16a34a' : 'rgba(255,255,255,0.1)',
                            color: 'white',
                            border: `1px solid ${isQctoAuditMode ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
                            padding: '6px 12px',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            borderRadius: '4px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}
                    >
                        <ShieldCheck size={14} color={isQctoAuditMode ? 'white' : '#4ade80'} />
                        QCTO Audit Mode: {isQctoAuditMode ? 'ACTIVE' : 'OFF'}
                    </button>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
                        <Layers size={14} color="#4ade80" />
                        <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Filter Cohort:</span>
                        <select
                            value={selectedCohortId}
                            onChange={(e) => setSelectedCohortId(e.target.value)}
                            style={{
                                background: 'transparent', color: 'white', border: 'none',
                                fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                                outline: 'none', maxWidth: '240px'
                            }}
                        >
                            <option value="ALL" style={{ color: 'black' }}>All Cohorts (Global View)</option>
                            {storeCohorts?.map((c: any) => (
                                <option key={c.id} value={c.id} style={{ color: 'black' }}>
                                    {c.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* TOP HEADER DUAL / SINGLE NLRD ACTION BUTTON */}
                    {lastNlrdExport ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <button
                                onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
                                style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            >
                                <Download size={14} /> Download Batch
                            </button>
                            <button
                                onClick={handleExportNLRD}
                                disabled={nlrdProgress.status !== 'idle'}
                                style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                title="Regenerate NLRD Batch"
                            >
                                <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    ) : (
                        <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {nlrdProgress.status !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                            {nlrdProgress.status === 'generating' && `Compiling Export (${nlrdProgress.percent}%)...`}
                            {nlrdProgress.status === 'downloading' && `Downloading (${nlrdProgress.percent}%)...`}
                            {nlrdProgress.status === 'idle' && 'Export NLRD Batch'}
                        </button>
                    )}
                </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} /> Learner Retention Rate
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.retentionRate}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {displayStats.totalEnrolled.toLocaleString()} enrollments</div>
                </div>
                <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileCheck size={14} /> Graduated Learners
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.graduated.toLocaleString()}</div>
                    <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
                </div>
                <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Scale size={14} /> Active Grievances &amp; Appeals
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.activeGrievances}</div>
                    <div style={{ fontSize: '0.75rem', color: displayStats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
                        {displayStats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
                    </div>
                </div>
                <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <FileSignature size={14} /> Policy Acknowledgment
                    </div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.policySignedPct}%</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
                </div>
            </div>

            {/* STICKY TABS WRAPPER */}
            <div style={{
                display: 'flex',
                background: 'white',
                border: '1px solid #cbd5e1',
                padding: '0 8px',
                flexWrap: 'wrap',
                position: 'sticky',
                top: 0,
                zIndex: 40,
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
            }}>
                {[
                    { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
                    { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
                    { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
                    { id: 'policies', label: 'Learner Policies', icon: FileSignature }
                ].map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabOption)}
                            style={{
                                padding: '16px 20px', background: 'transparent', border: 'none',
                                borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
                                color: isActive ? 'var(--mlab-blue)' : '#64748b',
                                fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
                                textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                                outline: 'none'
                            }}
                        >
                            <Icon size={16} /> {tab.label}
                        </button>
                    );
                })}
            </div>

            <div className="qcto-card" style={{ padding: '24px', background: 'white', flex: 1, display: 'flex', flexDirection: 'column' }}>

                {/* 1. MIS OVERVIEW */}
                {activeTab === 'mis_overview' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                            <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{displayStats.totalEnrolled.toLocaleString()}</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{displayStats.activeTraining.toLocaleString()}</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{displayStats.graduated.toLocaleString()}</strong></div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{displayStats.droppedOut.toLocaleString()}</strong></div>
                                </div>
                            </div>
                            <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
                                <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
                                <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
                                
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {lastNlrdExport ? (
                                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                            <button
                                                onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
                                                className="lfm-btn lfm-btn--primary"
                                                style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', justifyContent: 'center' }}
                                            >
                                                <Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})
                                            </button>
                                            <button
                                                onClick={handleExportNLRD}
                                                disabled={nlrdProgress.status !== 'idle'}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ justifyContent: 'center' }}
                                                title="Re-run Cloud Function to compile fresh data"
                                            >
                                                <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleExportNLRD}
                                            disabled={nlrdProgress.status !== 'idle'}
                                            className="lfm-btn lfm-btn--ghost"
                                            style={{ justifyContent: 'flex-start' }}
                                        >
                                            {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                                            {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
                                            {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
                                            {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
                                        </button>
                                    )}

                                    {lastMatrixExport ? (
                                        <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
                                            <button
                                                onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')}
                                                className="lfm-btn lfm-btn--primary"
                                                style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', justifyContent: 'center' }}
                                            >
                                                <Download size={14} /> Download Throughput Matrix ({lastMatrixExport.generatedAt})
                                            </button>
                                            <button
                                                onClick={handleExportThroughputMatrix}
                                                disabled={matrixProgress.status !== 'idle'}
                                                className="lfm-btn lfm-btn--ghost"
                                                style={{ justifyContent: 'center' }}
                                                title="Re-run Cloud Function to compile fresh data"
                                            >
                                                <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleExportThroughputMatrix}
                                            disabled={matrixProgress.status !== 'idle'}
                                            className="lfm-btn lfm-btn--ghost"
                                            style={{ justifyContent: 'flex-start' }}
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
                )}

                {/* 2. POE VAULT */}
                {activeTab === 'poe_vault' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                Learner Records &amp; Evidence Vault {isQctoAuditMode && <span style={{ fontSize: '0.75rem', color: '#16a34a', textTransform: 'none', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', marginLeft: '8px' }}>QCTO Filter Active</span>}
                            </h2>
                            <div className="mlab-search" style={{ margin: 0, width: '300px' }}>
                                <Search size={14} color="#94a3b8" />
                                <input type="text" placeholder="Search ID number or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            </div>
                        </div>

                        <div className="sm-table-container">
                            <div style={{
                                padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Learner Records ({searchedLearners.length})
                                    </h3>
                                </div>
                            </div>

                            {paginatedLearners.length === 0 ? (
                                <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <SearchX size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
                                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Learner Records Match</h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem' }}>Adjust your search, cohort filter, or QCTO Audit Mode toggle to find evidence vaults.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="sm-table-scroll">
                                        <table className="sm-table">
                                            <thead>
                                                <tr>
                                                    <th>Learner Details</th>
                                                    <th>Cohort &amp; Qualification</th>
                                                    <th>Curriculum Matrix</th>
                                                    <th>Overall Progress</th>
                                                    <th>Statement of Results</th>
                                                    <th style={{ textAlign: 'right' }}>Audit Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedLearners.map(l => {
                                                    const isDropped = ['dropped', 'withdrawn', 'terminated'].includes(l.status.toLowerCase());
                                                    const exportState = activeExports[l.id] || activeExports[l.userId];

                                                    return (
                                                        <tr key={l.id} style={{ background: isDropped ? '#fef2f2' : 'white', opacity: isDropped ? 0.85 : 1 }}>
                                                            <td>
                                                                <strong style={{ display: 'block', fontSize: '0.85rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{l.name}</strong>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                    <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
                                                                    {isDropped && (
                                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginTop: '2px' }}>
                                                                            <UserX size={10} /> {l.status}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {l.cohortName}
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {l.programmeName}
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div style={{ fontSize: '0.7rem', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    <div><strong style={{ color: '#0369a1' }}>KM:</strong> FA {l.formatives.completed}/{l.formatives.total} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span> SA {l.summatives.completed}/{l.summatives.total}</div>
                                                                    <div><strong style={{ color: '#b45309' }}>PM:</strong> {l.practicals.completed}/{l.practicals.total} Observations</div>
                                                                    <div><strong style={{ color: '#15803d' }}>WM:</strong> {l.workplaces.completed}/{l.workplaces.total} Logbooks</div>
                                                                </div>
                                                            </td>
                                                            <td style={{ width: '130px' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <div style={{ flex: 1, height: '6px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                                                                        <div style={{ width: `${l.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (l.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
                                                                    </div>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDropped ? '#991b1b' : 'inherit' }}>{Math.round(l.overallProgress)}%</span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #bbf7d0' }}>ISSUED</span>}
                                                                {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #fde68a' }}>PENDING MODERATION</span>}
                                                                {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #e2e8f0' }}>NOT READY</span>}
                                                            </td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                                    <button onClick={() => navigate(`/sor/${l.id}`)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                        <FileText size={12} /> View SoR
                                                                    </button>

                                                                    {(() => {
                                                                        if (l.isOffline) {
                                                                            return (
                                                                                <button onClick={() => setOfflineModalLearner(l)} style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                                    <FileArchive size={12} /> Physical PoE
                                                                                </button>
                                                                            );
                                                                        }
                                                                        if (exportState?.status === 'pending' || exportState?.status === 'processing') {
                                                                            return (
                                                                                <button disabled style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <Loader2 size={12} className="animate-spin" /> {exportState.progress}%
                                                                                </button>
                                                                            );
                                                                        }
                                                                        if (exportState?.status === 'completed' && exportState?.downloadUrl) {
                                                                            return (
                                                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                    <button 
                                                                                        onClick={() => window.open(exportState.downloadUrl, '_blank')} 
                                                                                        style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                                                                        title="Download existing PoE"
                                                                                    >
                                                                                        <Download size={12} /> Download
                                                                                    </button>
                                                                                    <button 
                                                                                        onClick={() => handleGeneratePoE(l, true)} 
                                                                                        style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
                                                                                        title="Regenerate PoE"
                                                                                    >
                                                                                        <RefreshCw size={12} /> Regenerate
                                                                                    </button>
                                                                                </div>
                                                                            );
                                                                        }
                                                                        if (exportState?.status === 'error') {
                                                                            return (
                                                                                <button 
                                                                                    onClick={() => handleGeneratePoE(l, true)} 
                                                                                    style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                                                                >
                                                                                    <AlertCircle size={12} /> Retry PoE
                                                                                </button>
                                                                            );
                                                                        }
                                                                        return (
                                                                            <button onClick={() => handleGeneratePoE(l)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                                                                                <FileArchive size={12} /> Compile PoE
                                                                            </button>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="sm-pagination-bar">
                                        <div>
                                            Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedLearners.length)}</strong> of <strong>{searchedLearners.length}</strong> records
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>Rows per page:</span>
                                                <select
                                                    className="sm-filter-select"
                                                    value={itemsPerPage}
                                                    onChange={(e) => setItemsPerPage(Number(e.target.value))}
                                                >
                                                    <option value={10}>10</option>
                                                    <option value={15}>15</option>
                                                    <option value={25}>25</option>
                                                    <option value={50}>50</option>
                                                </select>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="sm-page-btn"
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                >
                                                    <ChevronLeft size={14} /> Prev
                                                </button>
                                                <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
                                                    {currentPage} / {totalPagesLearners}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="sm-page-btn"
                                                    onClick={() => setCurrentPage(p => Math.min(totalPagesLearners, p + 1))}
                                                    disabled={currentPage >= totalPagesLearners}
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
                )}

                {/* 3. GRIEVANCES */}
                {activeTab === 'grievances' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals &amp; Grievance Register</h2>

                        <div className="sm-table-container">
                            <div style={{
                                padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
                                justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Active Grievances ({cohortFilteredGrievances.length})
                                    </h3>
                                </div>
                            </div>

                            {paginatedGrievances.length === 0 ? (
                                <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                    <CheckCircle2 size={36} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
                                    <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Active Grievances</h4>
                                    <p style={{ margin: 0, fontSize: '0.82rem' }}>There are no appeals or complaints lodged for this cohort.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="sm-table-scroll">
                                        <table className="sm-table">
                                            <thead>
                                                <tr>
                                                    <th>Ref ID</th>
                                                    <th>Learner</th>
                                                    <th>Type</th>
                                                    <th>Date Logged</th>
                                                    <th>Description</th>
                                                    <th style={{ textAlign: 'right' }}>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {paginatedGrievances.map(g => (
                                                    <tr key={g.id}>
                                                        <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
                                                        <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
                                                        <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
                                                        <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
                                                        <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
                                                            {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
                                                            {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="sm-pagination-bar">
                                        <div>
                                            Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> records
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                <button
                                                    type="button"
                                                    className="sm-page-btn"
                                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                    disabled={currentPage === 1}
                                                >
                                                    <ChevronLeft size={14} /> Prev
                                                </button>
                                                <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
                                                    {currentPage} / {totalPagesGrievances}
                                                </span>
                                                <button
                                                    type="button"
                                                    className="sm-page-btn"
                                                    onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))}
                                                    disabled={currentPage >= totalPagesGrievances}
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
                )}

                {/* 4. LEARNER POLICIES & CODE OF CONDUCT CALCULATED CARDS */}
                {activeTab === 'policies' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies &amp; Code of Conduct</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '10px' }}>
                            <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                    <FileSignature size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                                        <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                    <AlertCircle size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals &amp; Assessment Policy</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                                        <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.appealsSignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.appealsSignedPct}% Signed</span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
                                    <Lock size={20} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>PoPIA &amp; Data Protection</h3>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                                        <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.popiaConsentPct}%`, height: '100%', background: '#0284c7' }} /></div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.popiaConsentPct}% Consented</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* PHYSICAL POE RECORD NOTICE MODAL */}
            {offlineModalLearner && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '520px', background: 'white', borderRadius: '4px', borderTop: '5px solid var(--mlab-blue)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-light-blue)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileArchive size={20} color="var(--mlab-blue)" />
                                <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Physical PoE Record Notice
                                </h3>
                            </div>
                            <button onClick={() => setOfflineModalLearner(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #c2410c', padding: '12px 16px', borderRadius: '4px' }}>
                                <strong style={{ fontSize: '0.85rem', color: '#9a3412', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                    Offline / Physical Portfolio on File
                                </strong>
                                <p style={{ margin: 0, fontSize: '0.82rem', color: '#c2410c', lineHeight: 1.5 }}>
                                    <strong>{offlineModalLearner.name}</strong> (ID: {offlineModalLearner.idNumber}) was onboarded with a physical Lever Arch Portfolio of Evidence.
                                </p>
                            </div>

                            <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
                                <p style={{ margin: '0 0 10px 0' }}>
                                    A digital Master PoE compilation is currently unavailable for this candidate. For QCTO / SETA audit verification, please consult the physical academic archive at the local training campus.
                                </p>
                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
                                    Note: Assessment results and Statements of Results (SoR) remain available digitally on the ledger. Check back in the future for digitized portfolio updates.
                                </p>
                            </div>
                        </div>

                        <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button onClick={() => { const targetId = offlineModalLearner.id; setOfflineModalLearner(null); navigate(`/sor/${targetId}`); }} className="lfm-btn lfm-btn--primary" style={{ fontSize: '0.75rem', background: 'var(--mlab-blue)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <FileText size={12} /> View Digital SoR
                            </button>
                            <button onClick={() => setOfflineModalLearner(null)} className="sm-page-btn">
                                Close Notice
                            </button>
                        </div>
                    </div>
                </div>
            )}

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


// import React, { useState, useEffect, useMemo } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     ShieldCheck, Download, Users, FileText, AlertCircle,
//     FileCheck, Scale, FileSignature, BarChart3, Search,
//     CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2,
//     ChevronLeft, ChevronRight, Layers, UserX, Activity, X, Eye,
//     RefreshCw, Lock
// } from 'lucide-react';
// import { collection, onSnapshot, query, orderBy, where, addDoc, serverTimestamp, doc } from 'firebase/firestore';
// import { getFunctions, httpsCallable } from 'firebase/functions';
// import { db } from '../../../lib/firebase';
// import { useToast } from '../../../components/common/Toast/Toast';
// import { useStore } from '../../../store/useStore';
// import Loader from '../../../components/common/Loader/Loader';
// import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

// // --- Types ---
// type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

// interface LearnerRecord {
//     id: string;
//     userId: string;
//     name: string;
//     idNumber: string;
//     cohortId: string;
//     cohortName: string;
//     programmeName: string;
//     overallProgress: number;
//     formatives: { completed: number; total: number };
//     summatives: { completed: number; total: number };
//     practicals: { completed: number; total: number };
//     workplaces: { completed: number; total: number };
//     sorStatus: 'issued' | 'pending' | 'not_ready';
//     status: string;
//     isOffline?: boolean;
//     isBootcamp?: boolean;
//     saqaId?: string;
// }

// interface GrievanceRecord {
//     id: string;
//     learnerName: string;
//     cohortId: string;
//     dateLogged: string;
//     type: 'appeal' | 'complaint';
//     status: 'open' | 'under_review' | 'resolved';
//     description: string;
// }

// interface ActiveExport {
//     requestId: string;
//     learnerId: string;
//     progress: number;
//     progressMessage: string;
//     status: 'pending' | 'processing' | 'completed' | 'error';
//     downloadUrl?: string;
//     errorMessage?: string;
// }

// interface ExportProgressState {
//     status: 'idle' | 'generating' | 'downloading';
//     percent: number;
// }

// interface ReportCache {
//     downloadUrl: string;
//     generatedAt: string;
//     totalRecords?: number;
// }

// const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // --- Helper: Download Binary File with Real-Time Byte Progress ---
// const downloadFileWithProgress = (
//     url: string,
//     filename: string,
//     onProgress: (percent: number) => void
// ): Promise<void> => {
//     return new Promise((resolve, reject) => {
//         const xhr = new XMLHttpRequest();
//         xhr.open('GET', url, true);
//         xhr.responseType = 'blob';

//         xhr.onprogress = (event) => {
//             if (event.lengthComputable && event.total > 0) {
//                 const percent = Math.round((event.loaded / event.total) * 100);
//                 onProgress(percent);
//             } else if (event.loaded > 0) {
//                 const estimatedTotal = event.loaded + 50000;
//                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
//                 onProgress(percent);
//             }
//         };

//         xhr.onload = () => {
//             if (xhr.status === 200) {
//                 const blob = xhr.response;
//                 const blobUrl = window.URL.createObjectURL(blob);
//                 const link = document.createElement('a');
//                 link.href = blobUrl;
//                 link.download = filename;
//                 document.body.appendChild(link);
//                 link.click();
//                 document.body.removeChild(link);
//                 window.URL.revokeObjectURL(blobUrl);
//                 onProgress(100);
//                 resolve();
//             } else {
//                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
//             }
//         };

//         xhr.onerror = () => reject(new Error('Network error during file download.'));
//         xhr.send();
//     });
// };

// export const QmsComplianceDashboard: React.FC = () => {
//     const navigate = useNavigate();
//     const toast = useToast();
//     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
//     const [searchTerm, setSearchTerm] = useState('');
//     const [isLoading, setIsLoading] = useState(true);

//     // QCTO Audit Mode & Physical PoE Modal States
//     const [isQctoAuditMode, setIsQctoAuditMode] = useState(false);
//     const [offlineModalLearner, setOfflineModalLearner] = useState<LearnerRecord | null>(null);

//     // Status Modal State for Errors & Warnings
//     const [statusModal, setStatusModal] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//     }>({
//         isOpen: false,
//         type: 'error',
//         title: '',
//         message: ''
//     });

//     // Report Generation Progress States & Cache
//     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
//     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
//     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
//     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

//     // Pagination State
//     const [currentPage, setCurrentPage] = useState(1);
//     const [itemsPerPage, setItemsPerPage] = useState(15);

//     const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');

//     // PoE Active Export Tracking
//     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

//     // Global Store Context
//     const {
//         user: currentUser,
//         learners: storeLearners,
//         cohorts: storeCohorts,
//         programmes: storeProgrammes,
//         fetchProgrammes,
//         fetchCohorts,
//         fetchLearners
//     } = useStore() as any;

//     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
//     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
//     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
//     const [policySignerIds, setPolicySignerIds] = useState<Set<string>>(new Set());

//     // --- HYDRATE GLOBAL STORE IF EMPTY ---
//     useEffect(() => {
//         if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes();
//         if (!storeCohorts || storeCohorts.length === 0) fetchCohorts();
//         if (!storeLearners || storeLearners.length === 0) fetchLearners();
//     }, []);

//     useEffect(() => {
//         setCurrentPage(1);
//     }, [searchTerm, selectedCohortId, itemsPerPage, activeTab, isQctoAuditMode]);

//     // Clear export cache when cohort filter changes
//     useEffect(() => {
//         setLastNlrdExport(null);
//         setLastMatrixExport(null);
//     }, [selectedCohortId]);

//     // --- Real-Time Listener for Historical & Active PoE Exports ---
//     useEffect(() => {
//         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
//         const unsubPoe = onSnapshot(qPoe, (snap) => {
//             const exportsMap: Record<string, ActiveExport> = {};
//             snap.docs.forEach(docSnap => {
//                 const data = docSnap.data();
//                 const lId = data.learnerId;
//                 if (lId && !exportsMap[lId]) {
//                     exportsMap[lId] = {
//                         requestId: docSnap.id,
//                         learnerId: lId,
//                         progress: data.progress || 0,
//                         progressMessage: data.progressMessage || '',
//                         status: data.status || 'pending',
//                         downloadUrl: data.downloadUrl,
//                         errorMessage: data.errorMessage
//                     };
//                 }
//             });
//             setActiveExports(prev => ({ ...exportsMap, ...prev }));
//         });

//         return () => unsubPoe();
//     }, []);

//     // --- Firebase Subscriptions ---
//     useEffect(() => {
//         setIsLoading(true);

//         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
//             const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             setRawEnrollments(raw);
//         });

//         let submissionsQuery = collection(db, 'learner_submissions') as any;
//         if (selectedCohortId !== 'ALL') {
//             submissionsQuery = query(submissionsQuery, where('cohortId', '==', selectedCohortId));
//         }

//         const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
//             const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//             setRawSubmissions(subs);
//         });

//         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
//         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
//             const parsedGrievances: GrievanceRecord[] = [];
//             snap.docs.forEach(doc => {
//                 const data = doc.data();
//                 parsedGrievances.push({
//                     id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
//                     learnerName: data.learnerName || 'Unknown Learner',
//                     cohortId: data.cohortId || data.cohortRunId || '',
//                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
//                     type: data.type || 'appeal',
//                     status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
//                     description: data.reason || data.description || 'No description provided'
//                 });
//             });
//             setRawGrievances(parsedGrievances);
//         });

//         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
//             const signers = new Set(snap.docs.map(d => d.data().userId));
//             setPolicySignerIds(signers as Set<string>);
//             setTimeout(() => setIsLoading(false), 500);
//         });

//         return () => {
//             unsubEnrollments();
//             unsubSubmissions();
//             unsubGrievances();
//             unsubPolicies();
//         };
//     }, [selectedCohortId]);

//     // --- Cross-Reference Mappings ---
//     const enrichedLearners = useMemo(() => {
//         return rawEnrollments.map((data): LearnerRecord => {
//             const actualUserId = data.userId || data.learnerId || data.idNumber || '';
//             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.idNumber === actualUserId);

//             const activeCohortId = data.cohortId || data.cohortRunId;
//             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

//             let storeProgramme = storeProgrammes?.find((p: any) =>
//                 p.id === storeCohort?.programmeId ||
//                 p.id === storeCohort?.qualificationId ||
//                 p.id === data.programmeId
//             );

//             if (!storeProgramme && data.qualification?.saqaId) {
//                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.qualification.saqaId));
//             }
//             if (!storeProgramme && data.saqaId) {
//                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.saqaId));
//             }

//             const mappedName = data.userName || data.learnerName || data.fullName || data.name || storeLearner?.fullName || storeLearner?.name || 'Unknown Learner';
//             const mappedId = data.idNumber || actualUserId || 'N/A';
//             const mappedCohort = data.cohortName || storeCohort?.name || activeCohortId || 'Unassigned Cohort';
//             const mappedProgramme = storeProgramme?.name || 'Generic Framework';

//             const isOffline = !!(data.isOffline || storeLearner?.isOffline);
//             const isBootcamp = !!(data.isBootcamp || storeCohort?.isBootcamp || storeProgramme?.isBootcamp || (storeProgramme && !storeProgramme.saqaId));
//             const saqaId = storeProgramme?.saqaId || data.qualification?.saqaId || data.saqaId || '';

//             let totalBlueprintKM = 0;
//             let totalBlueprintPM = 0;
//             let totalBlueprintWM = 0;

//             if (storeProgramme) {
//                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
//                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
//                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

//                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
//                     const flat = storeProgramme.modules;
//                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
//                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
//                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
//                 }
//             }

//             let calculatedFA = 0;
//             let calculatedSA = 0;
//             let calculatedPM = 0;
//             let calculatedWM = 0;

//             let totalAssignedFA = 0;
//             let totalAssignedSA = 0;
//             let totalAssignedPM = 0;
//             let totalAssignedWM = 0;

//             const learnerSubs = rawSubmissions.filter(s =>
//                 (actualUserId && s.learnerId === actualUserId) ||
//                 (actualUserId && s.authUid === actualUserId) ||
//                 (data.id && s.enrollmentId === data.id)
//             );

//             learnerSubs.forEach(s => {
//                 const type = String(s.type || 'formative').toLowerCase();
//                 const moduleType = String(s.moduleType || '').toLowerCase();
//                 const subStatus = String(s.status || 'not_started').toLowerCase();

//                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

//                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);

//                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
//                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
//                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

//                 if (isKnowledge) {
//                     if (type.includes('formative') || type.includes('fa')) {
//                         totalAssignedFA++;
//                         if (isDone) calculatedFA++;
//                     } else if (type.includes('summative') || type.includes('sa')) {
//                         totalAssignedSA++;
//                         if (isDone) calculatedSA++;
//                     }
//                 } else if (isPractical) {
//                     totalAssignedPM++;
//                     if (isDone) calculatedPM++;
//                 } else if (isWorkplace) {
//                     totalAssignedWM++;
//                     if (isDone) calculatedWM++;
//                 }
//             });

//             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
//             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
//             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
//             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

//             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
//             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

//             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

//             return {
//                 id: data.id,
//                 userId: actualUserId,
//                 name: mappedName,
//                 idNumber: mappedId,
//                 cohortId: activeCohortId || 'unassigned',
//                 cohortName: mappedCohort,
//                 programmeName: mappedProgramme,
//                 overallProgress: dynamicProgress,
//                 formatives: { completed: calculatedFA, total: ceilingFA },
//                 summatives: { completed: calculatedSA, total: ceilingSA },
//                 practicals: { completed: calculatedPM, total: ceilingPM },
//                 workplaces: { completed: calculatedWM, total: ceilingWM },
//                 sorStatus: data.sorStatus || 'pending',
//                 status: data.status || 'active',
//                 isOffline,
//                 isBootcamp,
//                 saqaId
//             };
//         });

//     }, [rawEnrollments, rawSubmissions, storeLearners, storeCohorts, storeProgrammes]);

//     // Apply Filters & QCTO Audit Mode Logic
//     const cohortFilteredLearners = useMemo(() => {
//         let list = selectedCohortId === 'ALL'
//             ? enrichedLearners
//             : enrichedLearners.filter(l => l.cohortId === selectedCohortId);

//         if (isQctoAuditMode) {
//             list = list.filter(l => !l.isBootcamp && l.saqaId && l.saqaId !== 'N/A');
//         }

//         return list;
//     }, [enrichedLearners, selectedCohortId, isQctoAuditMode]);

//     const cohortFilteredGrievances = useMemo(() => {
//         if (selectedCohortId === 'ALL') return rawGrievances;
//         return rawGrievances.filter(g => g.cohortId === selectedCohortId);
//     }, [rawGrievances, selectedCohortId]);

//     const searchedLearners = useMemo(() => {
//         if (!searchTerm.trim()) return cohortFilteredLearners;
//         const lowerSearch = searchTerm.toLowerCase();
//         return cohortFilteredLearners.filter(l =>
//             (l.name && l.name.toLowerCase().includes(lowerSearch)) ||
//             (l.idNumber && l.idNumber.toLowerCase().includes(lowerSearch)) ||
//             (l.cohortName && l.cohortName.toLowerCase().includes(lowerSearch))
//         );
//     }, [cohortFilteredLearners, searchTerm]);

//     // Compute Dynamic Stats (Including PoPIA Consent % Pull)
//     const displayStats = useMemo(() => {
//         let active = 0;
//         let grad = 0;
//         let drop = 0;
//         let signedPolicyCount = 0;
//         let popiaConsentCount = 0;

//         cohortFilteredLearners.forEach(l => {
//             const status = l.status.toLowerCase();
//             if (status === 'active') active++;
//             else if (status === 'graduated' || status === 'competent') grad++;
//             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

//             if (l.userId && policySignerIds.has(l.userId)) {
//                 signedPolicyCount++;
//             }

//             // Check PoPIA Consent stored in learner/user demographics
//             const storeLearner = storeLearners?.find((sl: any) => sl.id === l.userId || sl.idNumber === l.idNumber || sl.id === l.id);
//             const rawEnrol = rawEnrollments?.find((re: any) => re.id === l.id || re.userId === l.userId);

//             const hasPopia =
//                 storeLearner?.demographics?.popiActAgree === 'Y' ||
//                 rawEnrol?.demographics?.popiActAgree === 'Y' ||
//                 storeLearner?.popiaConsent === true ||
//                 rawEnrol?.popiaConsent === true ||
//                 storeLearner?.demographics?.popiaConsent === true;

//             if (hasPopia) {
//                 popiaConsentCount++;
//             }
//         });

//         const total = cohortFilteredLearners.length;
//         const retentionRate = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;

//         const baseForPolicies = (active + grad) > 0 ? (active + grad) : (total > 0 ? total : 1);
//         const policySignedPct = total === 0 ? 0 : Math.min(100, Math.round((signedPolicyCount / baseForPolicies) * 100));
//         const popiaConsentPct = total === 0 ? 0 : Math.min(100, Math.round((popiaConsentCount / baseForPolicies) * 100));

//         const activeGrievances = cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length;

//         return {
//             totalEnrolled: total,
//             activeTraining: active,
//             graduated: grad,
//             droppedOut: drop,
//             retentionRate,
//             activeGrievances,
//             policySignedPct,
//             popiaConsentPct
//         };
//     }, [cohortFilteredLearners, cohortFilteredGrievances, policySignerIds, storeLearners, rawEnrollments]);

//     const totalPagesLearners = Math.max(1, Math.ceil(searchedLearners.length / itemsPerPage));
//     const paginatedLearners = searchedLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

//     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
//     const paginatedGrievances = cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

//     // --- REPORT GENERATION WITH REAL-TIME PERCENTAGE INDICATORS & CACHING ---
//     const handleExportNLRD = async () => {
//         if (nlrdProgress.status !== 'idle') return;
//         setNlrdProgress({ status: 'generating', percent: 15 });
//         toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

//         const timer = setInterval(() => {
//             setNlrdProgress(prev => {
//                 if (prev.status !== 'generating') return prev;
//                 if (prev.percent >= 80) return prev;
//                 return { ...prev, percent: prev.percent + 5 };
//             });
//         }, 300);

//         try {
//             const functions = getFunctions();
//             const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
//             const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

//             clearInterval(timer);

//             if (response.data?.downloadUrl) {
//                 setNlrdProgress({ status: 'downloading', percent: 80 });
//                 const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

//                 await downloadFileWithProgress(
//                     response.data.downloadUrl,
//                     filename,
//                     (bytePercent) => {
//                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
//                         setNlrdProgress({ status: 'downloading', percent: scaled });
//                     }
//                 );

//                 setLastNlrdExport({
//                     downloadUrl: response.data.downloadUrl,
//                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
//                     totalRecords: response.data.totalRecords
//                 });

//                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords} records.`);
//             }
//         } catch (error: any) {
//             clearInterval(timer);
//             console.error('NLRD Export Failed:', error);
//             setStatusModal({
//                 isOpen: true,
//                 type: 'error',
//                 title: 'NLRD Export Failed',
//                 message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
//             });
//         } finally {
//             setNlrdProgress({ status: 'idle', percent: 0 });
//         }
//     };

//     const handleExportThroughputMatrix = async () => {
//         if (matrixProgress.status !== 'idle') return;
//         setMatrixProgress({ status: 'generating', percent: 15 });
//         toast.info('Compiling Learner Throughput & Compliance Matrix...');

//         const timer = setInterval(() => {
//             setMatrixProgress(prev => {
//                 if (prev.status !== 'generating') return prev;
//                 if (prev.percent >= 80) return prev;
//                 return { ...prev, percent: prev.percent + 5 };
//             });
//         }, 300);

//         try {
//             const functions = getFunctions();
//             const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
//             const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

//             clearInterval(timer);

//             if (response.data?.downloadUrl) {
//                 setMatrixProgress({ status: 'downloading', percent: 80 });
//                 const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

//                 await downloadFileWithProgress(
//                     response.data.downloadUrl,
//                     filename,
//                     (bytePercent) => {
//                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
//                         setMatrixProgress({ status: 'downloading', percent: scaled });
//                     }
//                 );

//                 setLastMatrixExport({
//                     downloadUrl: response.data.downloadUrl,
//                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
//                     totalRecords: response.data.totalLearners
//                 });

//                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners} learners!`);
//             }
//         } catch (error: any) {
//             clearInterval(timer);
//             console.error('Throughput Report Failed:', error);
//             setStatusModal({
//                 isOpen: true,
//                 type: 'error',
//                 title: 'Report Generation Failed',
//                 message: error.message || 'Server error encountered while building the throughput matrix report.'
//             });
//         } finally {
//             setMatrixProgress({ status: 'idle', percent: 0 });
//         }
//     };

//     // --- MASTER POE GENERATION HANDSHAKE WITH CLOUD FUNCTIONS ---
//     const handleGeneratePoE = async (learner: LearnerRecord, forceRegenerate: boolean = false) => {
//         const targetLearnerId = learner.userId || learner.id;
//         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

//         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
//             toast.info(`An export for ${learner.name} is already in progress (${currentExport.progress}%).`);
//             return;
//         }

//         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
//             window.open(currentExport.downloadUrl, '_blank');
//             return;
//         }

//         try {
//             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.name}...`);

//             const docRef = await addDoc(collection(db, 'poe_export_requests'), {
//                 learnerId: targetLearnerId,
//                 requestedBy: currentUser?.uid || currentUser?.id || 'admin',
//                 status: 'pending',
//                 progress: 0,
//                 progressMessage: 'Initializing compliance engine...',
//                 createdAt: serverTimestamp()
//             });

//             setActiveExports(prev => ({
//                 ...prev,
//                 [learner.id]: {
//                     requestId: docRef.id,
//                     learnerId: targetLearnerId,
//                     progress: 0,
//                     progressMessage: 'Initializing compliance engine...',
//                     status: 'pending'
//                 },
//                 [targetLearnerId]: {
//                     requestId: docRef.id,
//                     learnerId: targetLearnerId,
//                     progress: 0,
//                     progressMessage: 'Initializing compliance engine...',
//                     status: 'pending'
//                 }
//             }));
//         } catch (error: any) {
//             console.error('Error requesting PoE export:', error);
//             setStatusModal({
//                 isOpen: true,
//                 type: 'error',
//                 title: 'Export Initialization Failed',
//                 message: error.message || `Failed to trigger PoE compilation for ${learner.name}.`
//             });
//         }
//     };

//     if (isLoading) {
//         return (
//             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
//                 <Loader message="Syncing Compliance Ledger..." />
//             </div>
//         );
//     }

//     return (
//         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--mlab-bg, #f8fafc)', overflow: 'hidden' }}>

//             <style>{`
//                 .sm-table-container { 
//                     background: #fff; 
//                     border: 1px solid var(--mlab-border); 
//                     border-top: 3px solid var(--mlab-blue); 
//                     overflow: hidden; 
//                     border-radius: 4px; 
//                     display: flex; 
//                     flex-direction: column; 
//                     flex: 1;
//                     min-height: 400px;
//                 }
//                 .sm-table-scroll { 
//                     flex: 1; 
//                     overflow-y: auto; 
//                     overflow-x: auto; 
//                     display: flex; 
//                     flex-direction: column; 
//                 }
//                 .sm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                
//                 .sm-table th { 
//                     background: var(--mlab-midnight, #0f172a); 
//                     padding: 12px 16px; 
//                     font-family: var(--font-heading); 
//                     text-transform: uppercase; 
//                     color: white; 
//                     border-bottom: 2px solid var(--mlab-green, #16a34a); 
//                     font-size: 0.8rem; 
//                     letter-spacing: 0.05em; 
//                     position: sticky; 
//                     top: 0; 
//                     z-index: 10; 
//                     box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
//                 }
                
//                 .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
//                 .sm-table tr:hover td { background-color: #f8fafc; }
                
//                 .sm-pagination-bar { 
//                     display: flex; 
//                     align-items: center; 
//                     justify-content: space-between; 
//                     padding: 10px 16px; 
//                     background: #f8fafc; 
//                     border-top: 1px solid #cbd5e1; 
//                     font-size: 0.8rem; 
//                     color: #475569; 
//                     flex-wrap: wrap; 
//                     gap: 10px;
//                     margin-top: auto; 
//                 }
//                 .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; }
//                 .sm-page-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
//                 .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
//                 .sm-filter-select { height: 28px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 6px; font-size: 0.75rem; color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }
//             `}</style>

//             {/* HEADER COMPONENT */}
//             <header style={{ padding: '24px', background: 'var(--mlab-midnight)', color: 'white', borderBottom: '3px solid var(--mlab-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', flexShrink: 0 }}>
//                 <div>
//                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                         <ShieldCheck size={14} /> Quality Management System (QMS)
//                     </div>
//                     <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
//                         SETA &amp; QCTO Compliance Dashboard
//                     </h1>
//                     <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', maxWidth: '600px', lineHeight: 1.5 }}>
//                         Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
//                     </p>
//                 </div>
//                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    
//                     {/* QCTO AUDIT MODE TOGGLE */}
//                     <button
//                         onClick={() => setIsQctoAuditMode(!isQctoAuditMode)}
//                         style={{
//                             display: 'flex',
//                             alignItems: 'center',
//                             gap: '8px',
//                             background: isQctoAuditMode ? '#16a34a' : 'rgba(255,255,255,0.1)',
//                             color: 'white',
//                             border: `1px solid ${isQctoAuditMode ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
//                             padding: '6px 12px',
//                             fontSize: '0.75rem',
//                             fontWeight: 800,
//                             cursor: 'pointer',
//                             borderRadius: '4px',
//                             textTransform: 'uppercase',
//                             letterSpacing: '0.05em'
//                         }}
//                     >
//                         <ShieldCheck size={14} color={isQctoAuditMode ? 'white' : '#4ade80'} />
//                         QCTO Audit Mode: {isQctoAuditMode ? 'ACTIVE' : 'OFF'}
//                     </button>

//                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
//                         <Layers size={14} color="#4ade80" />
//                         <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Filter Cohort:</span>
//                         <select
//                             value={selectedCohortId}
//                             onChange={(e) => setSelectedCohortId(e.target.value)}
//                             style={{
//                                 background: 'transparent', color: 'white', border: 'none',
//                                 fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
//                                 outline: 'none', maxWidth: '240px'
//                             }}
//                         >
//                             <option value="ALL" style={{ color: 'black' }}>All Cohorts (Global View)</option>
//                             {storeCohorts?.map((c: any) => (
//                                 <option key={c.id} value={c.id} style={{ color: 'black' }}>
//                                     {c.name}
//                                 </option>
//                             ))}
//                         </select>
//                     </div>

//                     {/* TOP HEADER DUAL / SINGLE NLRD ACTION BUTTON */}
//                     {lastNlrdExport ? (
//                         <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
//                             <button
//                                 onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
//                                 style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                             >
//                                 <Download size={14} /> Download Batch
//                             </button>
//                             <button
//                                 onClick={handleExportNLRD}
//                                 disabled={nlrdProgress.status !== 'idle'}
//                                 style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                 title="Regenerate NLRD Batch"
//                             >
//                                 <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} />
//                             </button>
//                         </div>
//                     ) : (
//                         <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             {nlrdProgress.status !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
//                             {nlrdProgress.status === 'generating' && `Compiling Export (${nlrdProgress.percent}%)...`}
//                             {nlrdProgress.status === 'downloading' && `Downloading (${nlrdProgress.percent}%)...`}
//                             {nlrdProgress.status === 'idle' && 'Export NLRD Batch'}
//                         </button>
//                     )}
//                 </div>
//             </header>

//             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
//                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                         <Users size={14} /> Learner Retention Rate
//                     </div>
//                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.retentionRate}%</div>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {displayStats.totalEnrolled.toLocaleString()} enrollments</div>
//                 </div>
//                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                         <FileCheck size={14} /> Graduated Learners
//                     </div>
//                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.graduated.toLocaleString()}</div>
//                     <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
//                 </div>
//                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                         <Scale size={14} /> Active Grievances &amp; Appeals
//                     </div>
//                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.activeGrievances}</div>
//                     <div style={{ fontSize: '0.75rem', color: displayStats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
//                         {displayStats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
//                     </div>
//                 </div>
//                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                         <FileSignature size={14} /> Policy Acknowledgment
//                     </div>
//                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.policySignedPct}%</div>
//                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
//                 </div>
//             </div>

//             {/* STICKY TABS WRAPPER */}
//             <div style={{
//                 display: 'flex',
//                 background: 'white',
//                 border: '1px solid #cbd5e1',
//                 padding: '0 8px',
//                 flexWrap: 'wrap',
//                 position: 'sticky',
//                 top: 0,
//                 zIndex: 40,
//                 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
//             }}>
//                 {[
//                     { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
//                     { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
//                     { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
//                     { id: 'policies', label: 'Learner Policies', icon: FileSignature }
//                 ].map(tab => {
//                     const Icon = tab.icon;
//                     const isActive = activeTab === tab.id;
//                     return (
//                         <button
//                             key={tab.id}
//                             onClick={() => setActiveTab(tab.id as TabOption)}
//                             style={{
//                                 padding: '16px 20px', background: 'transparent', border: 'none',
//                                 borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
//                                 color: isActive ? 'var(--mlab-blue)' : '#64748b',
//                                 fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
//                                 textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
//                                 outline: 'none'
//                             }}
//                         >
//                             <Icon size={16} /> {tab.label}
//                         </button>
//                     );
//                 })}
//             </div>

//             <div className="qcto-card" style={{ padding: '24px', background: 'white', flex: 1, display: 'flex', flexDirection: 'column' }}>

//                 {/* 1. MIS OVERVIEW */}
//                 {activeTab === 'mis_overview' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
//                         <div>
//                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
//                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>
//                         </div>

//                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
//                             <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
//                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{displayStats.totalEnrolled.toLocaleString()}</strong></div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{displayStats.activeTraining.toLocaleString()}</strong></div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{displayStats.graduated.toLocaleString()}</strong></div>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{displayStats.droppedOut.toLocaleString()}</strong></div>
//                                 </div>
//                             </div>
//                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
//                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
//                                 <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
                                
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    
//                                     {/* NLRD REPORT DUAL BUTTON GROUP */}
//                                     {lastNlrdExport ? (
//                                         <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
//                                             <button
//                                                 onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
//                                                 className="lfm-btn lfm-btn--primary"
//                                                 style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', justifyContent: 'center' }}
//                                             >
//                                                 <Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})
//                                             </button>
//                                             <button
//                                                 onClick={handleExportNLRD}
//                                                 disabled={nlrdProgress.status !== 'idle'}
//                                                 className="lfm-btn lfm-btn--ghost"
//                                                 style={{ justifyContent: 'center' }}
//                                                 title="Re-run Cloud Function to compile fresh data"
//                                             >
//                                                 <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
//                                             </button>
//                                         </div>
//                                     ) : (
//                                         <button
//                                             onClick={handleExportNLRD}
//                                             disabled={nlrdProgress.status !== 'idle'}
//                                             className="lfm-btn lfm-btn--ghost"
//                                             style={{ justifyContent: 'flex-start' }}
//                                         >
//                                             {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
//                                             {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
//                                             {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
//                                             {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
//                                         </button>
//                                     )}

//                                     {/* THROUGHPUT MATRIX DUAL BUTTON GROUP */}
//                                     {lastMatrixExport ? (
//                                         <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
//                                             <button
//                                                 onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')}
//                                                 className="lfm-btn lfm-btn--primary"
//                                                 style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', justifyContent: 'center' }}
//                                             >
//                                                 <Download size={14} /> Download Throughput Matrix ({lastMatrixExport.generatedAt})
//                                             </button>
//                                             <button
//                                                 onClick={handleExportThroughputMatrix}
//                                                 disabled={matrixProgress.status !== 'idle'}
//                                                 className="lfm-btn lfm-btn--ghost"
//                                                 style={{ justifyContent: 'center' }}
//                                                 title="Re-run Cloud Function to compile fresh data"
//                                             >
//                                                 <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
//                                             </button>
//                                         </div>
//                                     ) : (
//                                         <button
//                                             onClick={handleExportThroughputMatrix}
//                                             disabled={matrixProgress.status !== 'idle'}
//                                             className="lfm-btn lfm-btn--ghost"
//                                             style={{ justifyContent: 'flex-start' }}
//                                         >
//                                             {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
//                                             {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
//                                             {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
//                                             {matrixProgress.status === 'idle' && 'Download Learner Details & Throughput Ratio (CSV)'}
//                                         </button>
//                                     )}

//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 )}

//                 {/* 2. POE VAULT */}
//                 {activeTab === 'poe_vault' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
//                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                 Learner Records &amp; Evidence Vault {isQctoAuditMode && <span style={{ fontSize: '0.75rem', color: '#16a34a', textTransform: 'none', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', marginLeft: '8px' }}>QCTO Filter Active</span>}
//                             </h2>
//                             <div className="mlab-search" style={{ margin: 0, width: '300px' }}>
//                                 <Search size={14} color="#94a3b8" />
//                                 <input type="text" placeholder="Search ID number or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
//                             </div>
//                         </div>

//                         <div className="sm-table-container">
//                             <div style={{
//                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
//                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
//                             }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                         Learner Records ({searchedLearners.length})
//                                     </h3>
//                                 </div>
//                             </div>

//                             {paginatedLearners.length === 0 ? (
//                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
//                                     <SearchX size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
//                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Learner Records Match</h4>
//                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>Adjust your search, cohort filter, or QCTO Audit Mode toggle to find evidence vaults.</p>
//                                 </div>
//                             ) : (
//                                 <>
//                                     <div className="sm-table-scroll">
//                                         <table className="sm-table">
//                                             <thead>
//                                                 <tr>
//                                                     <th>Learner Details</th>
//                                                     <th>Cohort &amp; Qualification</th>
//                                                     <th>Curriculum Matrix</th>
//                                                     <th>Overall Progress</th>
//                                                     <th>Statement of Results</th>
//                                                     <th style={{ textAlign: 'right' }}>Audit Action</th>
//                                                 </tr>
//                                             </thead>
//                                             <tbody>
//                                                 {paginatedLearners.map(l => {
//                                                     const isDropped = ['dropped', 'withdrawn', 'terminated'].includes(l.status.toLowerCase());
//                                                     const exportState = activeExports[l.id] || activeExports[l.userId];

//                                                     return (
//                                                         <tr key={l.id} style={{ background: isDropped ? '#fef2f2' : 'white', opacity: isDropped ? 0.85 : 1 }}>
//                                                             <td>
//                                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{l.name}</strong>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
//                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
//                                                                     {isDropped && (
//                                                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginTop: '2px' }}>
//                                                                             <UserX size={10} /> {l.status}
//                                                                         </span>
//                                                                     )}
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                                     {l.cohortName}
//                                                                 </div>
//                                                                 <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                                                     {l.programmeName}
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 <div style={{ fontSize: '0.7rem', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                                     <div><strong style={{ color: '#0369a1' }}>KM:</strong> FA {l.formatives.completed}/{l.formatives.total} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span> SA {l.summatives.completed}/{l.summatives.total}</div>
//                                                                     <div><strong style={{ color: '#b45309' }}>PM:</strong> {l.practicals.completed}/{l.practicals.total} Observations</div>
//                                                                     <div><strong style={{ color: '#15803d' }}>WM:</strong> {l.workplaces.completed}/{l.workplaces.total} Logbooks</div>
//                                                                 </div>
//                                                             </td>
//                                                             <td style={{ width: '130px' }}>
//                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                     <div style={{ flex: 1, height: '6px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
//                                                                         <div style={{ width: `${l.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (l.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
//                                                                     </div>
//                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDropped ? '#991b1b' : 'inherit' }}>{Math.round(l.overallProgress)}%</span>
//                                                                 </div>
//                                                             </td>
//                                                             <td>
//                                                                 {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #bbf7d0' }}>ISSUED</span>}
//                                                                 {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #fde68a' }}>PENDING MODERATION</span>}
//                                                                 {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #e2e8f0' }}>NOT READY</span>}
//                                                             </td>
//                                                             <td style={{ textAlign: 'right' }}>
//                                                                 <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
//                                                                     <button onClick={() => navigate(`/sor/${l.id}`)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                                                                         <FileText size={12} /> View SoR
//                                                                     </button>

//                                                                     {/* DYNAMIC MASTER POE BUTTON / PHYSICAL POE INTERCEPT */}
//                                                                     {(() => {
//                                                                         if (l.isOffline) {
//                                                                             return (
//                                                                                 <button onClick={() => setOfflineModalLearner(l)} style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                                                                                     <FileArchive size={12} /> Physical PoE
//                                                                                 </button>
//                                                                             );
//                                                                         }
//                                                                         if (exportState?.status === 'pending' || exportState?.status === 'processing') {
//                                                                             return (
//                                                                                 <button disabled style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
//                                                                                     <Loader2 size={12} className="animate-spin" /> {exportState.progress}%
//                                                                                 </button>
//                                                                             );
//                                                                         }
//                                                                         if (exportState?.status === 'completed' && exportState?.downloadUrl) {
//                                                                             return (
//                                                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
//                                                                                     <button 
//                                                                                         onClick={() => window.open(exportState.downloadUrl, '_blank')} 
//                                                                                         style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
//                                                                                         title="Download existing PoE"
//                                                                                     >
//                                                                                         <Download size={12} /> Download
//                                                                                     </button>
//                                                                                     <button 
//                                                                                         onClick={() => handleGeneratePoE(l, true)} 
//                                                                                         style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
//                                                                                         title="Regenerate PoE"
//                                                                                     >
//                                                                                         <RefreshCw size={12} /> Regenerate
//                                                                                     </button>
//                                                                                 </div>
//                                                                             );
//                                                                         }
//                                                                         if (exportState?.status === 'error') {
//                                                                             return (
//                                                                                 <button 
//                                                                                     onClick={() => handleGeneratePoE(l, true)} 
//                                                                                     style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
//                                                                                 >
//                                                                                     <AlertCircle size={12} /> Retry PoE
//                                                                                 </button>
//                                                                             );
//                                                                         }
//                                                                         return (
//                                                                             <button onClick={() => handleGeneratePoE(l)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
//                                                                                 <FileArchive size={12} /> Compile PoE
//                                                                             </button>
//                                                                         );
//                                                                     })()}
//                                                                 </div>
//                                                             </td>
//                                                         </tr>
//                                                     );
//                                                 })}
//                                             </tbody>
//                                         </table>
//                                     </div>

//                                     <div className="sm-pagination-bar">
//                                         <div>
//                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedLearners.length)}</strong> of <strong>{searchedLearners.length}</strong> records
//                                         </div>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                                 <span>Rows per page:</span>
//                                                 <select
//                                                     className="sm-filter-select"
//                                                     value={itemsPerPage}
//                                                     onChange={(e) => setItemsPerPage(Number(e.target.value))}
//                                                 >
//                                                     <option value={10}>10</option>
//                                                     <option value={15}>15</option>
//                                                     <option value={25}>25</option>
//                                                     <option value={50}>50</option>
//                                                 </select>
//                                             </div>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <button
//                                                     type="button"
//                                                     className="sm-page-btn"
//                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                                                     disabled={currentPage === 1}
//                                                 >
//                                                     <ChevronLeft size={14} /> Prev
//                                                 </button>
//                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
//                                                     {currentPage} / {totalPagesLearners}
//                                                 </span>
//                                                 <button
//                                                     type="button"
//                                                     className="sm-page-btn"
//                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesLearners, p + 1))}
//                                                     disabled={currentPage >= totalPagesLearners}
//                                                 >
//                                                     Next <ChevronRight size={14} />
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </>
//                             )}
//                         </div>
//                     </div>
//                 )}

//                 {/* 3. GRIEVANCES */}
//                 {activeTab === 'grievances' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
//                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals &amp; Grievance Register</h2>

//                         <div className="sm-table-container">
//                             <div style={{
//                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
//                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
//                             }}>
//                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                         Active Grievances ({cohortFilteredGrievances.length})
//                                     </h3>
//                                 </div>
//                             </div>

//                             {paginatedGrievances.length === 0 ? (
//                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
//                                     <CheckCircle2 size={36} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
//                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Active Grievances</h4>
//                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>There are no appeals or complaints lodged for this cohort.</p>
//                                 </div>
//                             ) : (
//                                 <>
//                                     <div className="sm-table-scroll">
//                                         <table className="sm-table">
//                                             <thead>
//                                                 <tr>
//                                                     <th>Ref ID</th>
//                                                     <th>Learner</th>
//                                                     <th>Type</th>
//                                                     <th>Date Logged</th>
//                                                     <th>Description</th>
//                                                     <th style={{ textAlign: 'right' }}>Status</th>
//                                                 </tr>
//                                             </thead>
//                                             <tbody>
//                                                 {paginatedGrievances.map(g => (
//                                                     <tr key={g.id}>
//                                                         <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
//                                                         <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
//                                                         <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
//                                                         <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
//                                                         <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
//                                                         <td style={{ textAlign: 'right' }}>
//                                                             {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
//                                                             {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
//                                                             {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
//                                                         </td>
//                                                     </tr>
//                                                 ))}
//                                             </tbody>
//                                         </table>
//                                     </div>

//                                     <div className="sm-pagination-bar">
//                                         <div>
//                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> records
//                                         </div>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
//                                                 <button
//                                                     type="button"
//                                                     className="sm-page-btn"
//                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
//                                                     disabled={currentPage === 1}
//                                                 >
//                                                     <ChevronLeft size={14} /> Prev
//                                                 </button>
//                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
//                                                     {currentPage} / {totalPagesGrievances}
//                                                 </span>
//                                                 <button
//                                                     type="button"
//                                                     className="sm-page-btn"
//                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))}
//                                                     disabled={currentPage >= totalPagesGrievances}
//                                                 >
//                                                     Next <ChevronRight size={14} />
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </>
//                             )}
//                         </div>
//                     </div>
//                 )}

//                 {/* 4. LEARNER POLICIES */}
//                 {activeTab === 'policies' && (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
//                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies &amp; Code of Conduct</h2>
//                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

//                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginTop: '10px' }}>
//                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
//                                 <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
//                                     <FileSignature size={20} />
//                                 </div>
//                                 <div style={{ flex: 1 }}>
//                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
//                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
//                                     </div>
//                                 </div>
//                             </div>

//                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
//                                 <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
//                                     <AlertCircle size={20} />
//                                 </div>
//                                 <div style={{ flex: 1 }}>
//                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals &amp; Assessment Policy</h3>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
//                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* 🚀 PoPIA & DATA PROTECTION CONSENT CARD */}
//                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
//                                 <div style={{ width: '40px', height: '40px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
//                                     <Lock size={20} />
//                                 </div>
//                                 <div style={{ flex: 1 }}>
//                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>PoPIA &amp; Data Protection</h3>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
//                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.popiaConsentPct}%`, height: '100%', background: '#0284c7' }} /></div>
//                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.popiaConsentPct}% Consented</span>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 )}
//             </div>

//             {/* PHYSICAL POE RECORD NOTICE MODAL */}
//             {offlineModalLearner && (
//                 <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
//                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '520px', background: 'white', borderRadius: '4px', borderTop: '5px solid var(--mlab-blue)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
//                         <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-light-blue)' }}>
//                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
//                                 <FileArchive size={20} color="var(--mlab-blue)" />
//                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
//                                     Physical PoE Record Notice
//                                 </h3>
//                             </div>
//                             <button onClick={() => setOfflineModalLearner(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
//                                 <X size={18} />
//                             </button>
//                         </div>

//                         <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
//                             <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #c2410c', padding: '12px 16px', borderRadius: '4px' }}>
//                                 <strong style={{ fontSize: '0.85rem', color: '#9a3412', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
//                                     Offline / Physical Portfolio on File
//                                 </strong>
//                                 <p style={{ margin: 0, fontSize: '0.82rem', color: '#c2410c', lineHeight: 1.5 }}>
//                                     <strong>{offlineModalLearner.name}</strong> (ID: {offlineModalLearner.idNumber}) was onboarded with a physical Lever Arch Portfolio of Evidence.
//                                 </p>
//                             </div>

//                             <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
//                                 <p style={{ margin: '0 0 10px 0' }}>
//                                     A digital Master PoE compilation is currently unavailable for this candidate. For QCTO / SETA audit verification, please consult the physical academic archive at the local training campus.
//                                 </p>
//                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
//                                     Note: Assessment results and Statements of Results (SoR) remain available digitally on the ledger. Check back in the future for digitized portfolio updates.
//                                 </p>
//                             </div>
//                         </div>

//                         <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
//                             <button onClick={() => { const targetId = offlineModalLearner.id; setOfflineModalLearner(null); navigate(`/sor/${targetId}`); }} className="lfm-btn lfm-btn--primary" style={{ fontSize: '0.75rem', background: 'var(--mlab-blue)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
//                                 <FileText size={12} /> View Digital SoR
//                             </button>
//                             <button onClick={() => setOfflineModalLearner(null)} className="sm-page-btn">
//                                 Close Notice
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* STATUS MODAL FOR SYSTEM & EXPORT ERRORS */}
//             {statusModal.isOpen && (
//                 <StatusModal
//                     type={statusModal.type}
//                     title={statusModal.title}
//                     message={statusModal.message}
//                     confirmText="Acknowledge"
//                     onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
//                 />
//             )}
//         </div>
//     );
// };


// // import React, { useState, useEffect, useMemo } from 'react';
// // import { useNavigate } from 'react-router-dom';
// // import {
// //     ShieldCheck, Download, Users, FileText, AlertCircle,
// //     FileCheck, Scale, FileSignature, BarChart3, Search,
// //     CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2,
// //     ChevronLeft, ChevronRight, Layers, UserX, Activity, X, Eye,
// //     RefreshCw
// // } from 'lucide-react';
// // import { collection, onSnapshot, query, orderBy, where, addDoc, serverTimestamp, doc } from 'firebase/firestore';
// // import { getFunctions, httpsCallable } from 'firebase/functions';
// // import { db } from '../../../lib/firebase';
// // import { useToast } from '../../../components/common/Toast/Toast';
// // import { useStore } from '../../../store/useStore';
// // import Loader from '../../../components/common/Loader/Loader';
// // import { StatusModal, type StatusType } from '../../../components/common/StatusModal/StatusModal';

// // // --- Types ---
// // type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

// // interface LearnerRecord {
// //     id: string;
// //     userId: string;
// //     name: string;
// //     idNumber: string;
// //     cohortId: string;
// //     cohortName: string;
// //     programmeName: string;
// //     overallProgress: number;
// //     formatives: { completed: number; total: number };
// //     summatives: { completed: number; total: number };
// //     practicals: { completed: number; total: number };
// //     workplaces: { completed: number; total: number };
// //     sorStatus: 'issued' | 'pending' | 'not_ready';
// //     status: string;
// //     isOffline?: boolean;
// //     isBootcamp?: boolean;
// //     saqaId?: string;
// // }

// // interface GrievanceRecord {
// //     id: string;
// //     learnerName: string;
// //     cohortId: string;
// //     dateLogged: string;
// //     type: 'appeal' | 'complaint';
// //     status: 'open' | 'under_review' | 'resolved';
// //     description: string;
// // }

// // interface ActiveExport {
// //     requestId: string;
// //     learnerId: string;
// //     progress: number;
// //     progressMessage: string;
// //     status: 'pending' | 'processing' | 'completed' | 'error';
// //     downloadUrl?: string;
// //     errorMessage?: string;
// // }

// // interface ExportProgressState {
// //     status: 'idle' | 'generating' | 'downloading';
// //     percent: number;
// // }

// // interface ReportCache {
// //     downloadUrl: string;
// //     generatedAt: string;
// //     totalRecords?: number;
// // }

// // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // // --- Helper: Download Binary File with Real-Time Byte Progress ---
// // const downloadFileWithProgress = (
// //     url: string,
// //     filename: string,
// //     onProgress: (percent: number) => void
// // ): Promise<void> => {
// //     return new Promise((resolve, reject) => {
// //         const xhr = new XMLHttpRequest();
// //         xhr.open('GET', url, true);
// //         xhr.responseType = 'blob';

// //         xhr.onprogress = (event) => {
// //             if (event.lengthComputable && event.total > 0) {
// //                 const percent = Math.round((event.loaded / event.total) * 100);
// //                 onProgress(percent);
// //             } else if (event.loaded > 0) {
// //                 const estimatedTotal = event.loaded + 50000;
// //                 const percent = Math.min(99, Math.round((event.loaded / estimatedTotal) * 100));
// //                 onProgress(percent);
// //             }
// //         };

// //         xhr.onload = () => {
// //             if (xhr.status === 200) {
// //                 const blob = xhr.response;
// //                 const blobUrl = window.URL.createObjectURL(blob);
// //                 const link = document.createElement('a');
// //                 link.href = blobUrl;
// //                 link.download = filename;
// //                 document.body.appendChild(link);
// //                 link.click();
// //                 document.body.removeChild(link);
// //                 window.URL.revokeObjectURL(blobUrl);
// //                 onProgress(100);
// //                 resolve();
// //             } else {
// //                 reject(new Error(`Failed to download file: HTTP ${xhr.status}`));
// //             }
// //         };

// //         xhr.onerror = () => reject(new Error('Network error during file download.'));
// //         xhr.send();
// //     });
// // };

// // export const QmsComplianceDashboard: React.FC = () => {
// //     const navigate = useNavigate();
// //     const toast = useToast();
// //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// //     const [searchTerm, setSearchTerm] = useState('');
// //     const [isLoading, setIsLoading] = useState(true);

// //     // QCTO Audit Mode & Physical PoE Modal States
// //     const [isQctoAuditMode, setIsQctoAuditMode] = useState(false);
// //     const [offlineModalLearner, setOfflineModalLearner] = useState<LearnerRecord | null>(null);

// //     // Status Modal State for Errors & Warnings
// //     const [statusModal, setStatusModal] = useState<{
// //         isOpen: boolean;
// //         type: StatusType;
// //         title: string;
// //         message: string;
// //     }>({
// //         isOpen: false,
// //         type: 'error',
// //         title: '',
// //         message: ''
// //     });

// //     // Report Generation Progress States & Cache
// //     const [nlrdProgress, setNlrdProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// //     const [matrixProgress, setMatrixProgress] = useState<ExportProgressState>({ status: 'idle', percent: 0 });
// //     const [lastNlrdExport, setLastNlrdExport] = useState<ReportCache | null>(null);
// //     const [lastMatrixExport, setLastMatrixExport] = useState<ReportCache | null>(null);

// //     // Pagination State
// //     const [currentPage, setCurrentPage] = useState(1);
// //     const [itemsPerPage, setItemsPerPage] = useState(15);

// //     const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');

// //     // PoE Active Export Tracking
// //     const [activeExports, setActiveExports] = useState<Record<string, ActiveExport>>({});

// //     // Global Store Context
// //     const {
// //         user: currentUser,
// //         learners: storeLearners,
// //         cohorts: storeCohorts,
// //         programmes: storeProgrammes,
// //         fetchProgrammes,
// //         fetchCohorts,
// //         fetchLearners
// //     } = useStore() as any;

// //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
// //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// //     const [policySignerIds, setPolicySignerIds] = useState<Set<string>>(new Set());

// //     // --- HYDRATE GLOBAL STORE IF EMPTY ---
// //     useEffect(() => {
// //         if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes();
// //         if (!storeCohorts || storeCohorts.length === 0) fetchCohorts();
// //         if (!storeLearners || storeLearners.length === 0) fetchLearners();
// //     }, []);

// //     useEffect(() => {
// //         setCurrentPage(1);
// //     }, [searchTerm, selectedCohortId, itemsPerPage, activeTab, isQctoAuditMode]);

// //     // Clear export cache when cohort filter changes
// //     useEffect(() => {
// //         setLastNlrdExport(null);
// //         setLastMatrixExport(null);
// //     }, [selectedCohortId]);

// //     // --- Real-Time Listener for Historical & Active PoE Exports ---
// //     useEffect(() => {
// //         const qPoe = query(collection(db, 'poe_export_requests'), orderBy('createdAt', 'desc'));
// //         const unsubPoe = onSnapshot(qPoe, (snap) => {
// //             const exportsMap: Record<string, ActiveExport> = {};
// //             snap.docs.forEach(docSnap => {
// //                 const data = docSnap.data();
// //                 const lId = data.learnerId;
// //                 if (lId && !exportsMap[lId]) {
// //                     exportsMap[lId] = {
// //                         requestId: docSnap.id,
// //                         learnerId: lId,
// //                         progress: data.progress || 0,
// //                         progressMessage: data.progressMessage || '',
// //                         status: data.status || 'pending',
// //                         downloadUrl: data.downloadUrl,
// //                         errorMessage: data.errorMessage
// //                     };
// //                 }
// //             });
// //             setActiveExports(prev => ({ ...exportsMap, ...prev }));
// //         });

// //         return () => unsubPoe();
// //     }, []);

// //     // --- Firebase Subscriptions ---
// //     useEffect(() => {
// //         setIsLoading(true);

// //         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
// //             const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //             setRawEnrollments(raw);
// //         });

// //         let submissionsQuery = collection(db, 'learner_submissions') as any;
// //         if (selectedCohortId !== 'ALL') {
// //             submissionsQuery = query(submissionsQuery, where('cohortId', '==', selectedCohortId));
// //         }

// //         const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
// //             const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //             setRawSubmissions(subs);
// //         });

// //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// //         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
// //             const parsedGrievances: GrievanceRecord[] = [];
// //             snap.docs.forEach(doc => {
// //                 const data = doc.data();
// //                 parsedGrievances.push({
// //                     id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
// //                     learnerName: data.learnerName || 'Unknown Learner',
// //                     cohortId: data.cohortId || data.cohortRunId || '',
// //                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// //                     type: data.type || 'appeal',
// //                     status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// //                     description: data.reason || data.description || 'No description provided'
// //                 });
// //             });
// //             setRawGrievances(parsedGrievances);
// //         });

// //         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
// //             const signers = new Set(snap.docs.map(d => d.data().userId));
// //             setPolicySignerIds(signers as Set<string>);
// //             setTimeout(() => setIsLoading(false), 500);
// //         });

// //         return () => {
// //             unsubEnrollments();
// //             unsubSubmissions();
// //             unsubGrievances();
// //             unsubPolicies();
// //         };
// //     }, [selectedCohortId]);

// //     // --- Cross-Reference Mappings ---
// //     const enrichedLearners = useMemo(() => {
// //         return rawEnrollments.map((data): LearnerRecord => {
// //             const actualUserId = data.userId || data.learnerId || data.idNumber || '';
// //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.idNumber === actualUserId);

// //             const activeCohortId = data.cohortId || data.cohortRunId;
// //             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

// //             let storeProgramme = storeProgrammes?.find((p: any) =>
// //                 p.id === storeCohort?.programmeId ||
// //                 p.id === storeCohort?.qualificationId ||
// //                 p.id === data.programmeId
// //             );

// //             if (!storeProgramme && data.qualification?.saqaId) {
// //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.qualification.saqaId));
// //             }
// //             if (!storeProgramme && data.saqaId) {
// //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.saqaId));
// //             }

// //             const mappedName = data.userName || data.learnerName || data.fullName || data.name || storeLearner?.fullName || storeLearner?.name || 'Unknown Learner';
// //             const mappedId = data.idNumber || actualUserId || 'N/A';
// //             const mappedCohort = data.cohortName || storeCohort?.name || activeCohortId || 'Unassigned Cohort';
// //             const mappedProgramme = storeProgramme?.name || 'Generic Framework';

// //             const isOffline = !!(data.isOffline || storeLearner?.isOffline);
// //             const isBootcamp = !!(data.isBootcamp || storeCohort?.isBootcamp || storeProgramme?.isBootcamp || (storeProgramme && !storeProgramme.saqaId));
// //             const saqaId = storeProgramme?.saqaId || data.qualification?.saqaId || data.saqaId || '';

// //             let totalBlueprintKM = 0;
// //             let totalBlueprintPM = 0;
// //             let totalBlueprintWM = 0;

// //             if (storeProgramme) {
// //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// //                     const flat = storeProgramme.modules;
// //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// //                 }
// //             }

// //             let calculatedFA = 0;
// //             let calculatedSA = 0;
// //             let calculatedPM = 0;
// //             let calculatedWM = 0;

// //             let totalAssignedFA = 0;
// //             let totalAssignedSA = 0;
// //             let totalAssignedPM = 0;
// //             let totalAssignedWM = 0;

// //             const learnerSubs = rawSubmissions.filter(s =>
// //                 (actualUserId && s.learnerId === actualUserId) ||
// //                 (actualUserId && s.authUid === actualUserId) ||
// //                 (data.id && s.enrollmentId === data.id)
// //             );

// //             learnerSubs.forEach(s => {
// //                 const type = String(s.type || 'formative').toLowerCase();
// //                 const moduleType = String(s.moduleType || '').toLowerCase();
// //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);

// //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// //                 if (isKnowledge) {
// //                     if (type.includes('formative') || type.includes('fa')) {
// //                         totalAssignedFA++;
// //                         if (isDone) calculatedFA++;
// //                     } else if (type.includes('summative') || type.includes('sa')) {
// //                         totalAssignedSA++;
// //                         if (isDone) calculatedSA++;
// //                     }
// //                 } else if (isPractical) {
// //                     totalAssignedPM++;
// //                     if (isDone) calculatedPM++;
// //                 } else if (isWorkplace) {
// //                     totalAssignedWM++;
// //                     if (isDone) calculatedWM++;
// //                 }
// //             });

// //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// //             return {
// //                 id: data.id,
// //                 userId: actualUserId,
// //                 name: mappedName,
// //                 idNumber: mappedId,
// //                 cohortId: activeCohortId || 'unassigned',
// //                 cohortName: mappedCohort,
// //                 programmeName: mappedProgramme,
// //                 overallProgress: dynamicProgress,
// //                 formatives: { completed: calculatedFA, total: ceilingFA },
// //                 summatives: { completed: calculatedSA, total: ceilingSA },
// //                 practicals: { completed: calculatedPM, total: ceilingPM },
// //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// //                 sorStatus: data.sorStatus || 'pending',
// //                 status: data.status || 'active',
// //                 isOffline,
// //                 isBootcamp,
// //                 saqaId
// //             };
// //         });

// //     }, [rawEnrollments, rawSubmissions, storeLearners, storeCohorts, storeProgrammes]);

// //     // Apply Filters & QCTO Audit Mode Logic
// //     const cohortFilteredLearners = useMemo(() => {
// //         let list = selectedCohortId === 'ALL'
// //             ? enrichedLearners
// //             : enrichedLearners.filter(l => l.cohortId === selectedCohortId);

// //         if (isQctoAuditMode) {
// //             list = list.filter(l => !l.isBootcamp && l.saqaId && l.saqaId !== 'N/A');
// //         }

// //         return list;
// //     }, [enrichedLearners, selectedCohortId, isQctoAuditMode]);

// //     const cohortFilteredGrievances = useMemo(() => {
// //         if (selectedCohortId === 'ALL') return rawGrievances;
// //         return rawGrievances.filter(g => g.cohortId === selectedCohortId);
// //     }, [rawGrievances, selectedCohortId]);

// //     const searchedLearners = useMemo(() => {
// //         if (!searchTerm.trim()) return cohortFilteredLearners;
// //         const lowerSearch = searchTerm.toLowerCase();
// //         return cohortFilteredLearners.filter(l =>
// //             (l.name && l.name.toLowerCase().includes(lowerSearch)) ||
// //             (l.idNumber && l.idNumber.toLowerCase().includes(lowerSearch)) ||
// //             (l.cohortName && l.cohortName.toLowerCase().includes(lowerSearch))
// //         );
// //     }, [cohortFilteredLearners, searchTerm]);

// //     // Compute Dynamic Stats
// //     const displayStats = useMemo(() => {
// //         let active = 0;
// //         let grad = 0;
// //         let drop = 0;
// //         let signedPolicyCount = 0;

// //         cohortFilteredLearners.forEach(l => {
// //             const status = l.status.toLowerCase();
// //             if (status === 'active') active++;
// //             else if (status === 'graduated' || status === 'competent') grad++;
// //             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

// //             if (l.userId && policySignerIds.has(l.userId)) {
// //                 signedPolicyCount++;
// //             }
// //         });

// //         const total = cohortFilteredLearners.length;
// //         const retentionRate = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;

// //         const baseForPolicies = (active + grad) > 0 ? (active + grad) : (total > 0 ? total : 1);
// //         const policySignedPct = total === 0 ? 0 : Math.min(100, Math.round((signedPolicyCount / baseForPolicies) * 100));

// //         const activeGrievances = cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length;

// //         return {
// //             totalEnrolled: total,
// //             activeTraining: active,
// //             graduated: grad,
// //             droppedOut: drop,
// //             retentionRate,
// //             activeGrievances,
// //             policySignedPct
// //         };
// //     }, [cohortFilteredLearners, cohortFilteredGrievances, policySignerIds]);

// //     const totalPagesLearners = Math.max(1, Math.ceil(searchedLearners.length / itemsPerPage));
// //     const paginatedLearners = searchedLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// //     const paginatedGrievances = cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// //     // --- REPORT GENERATION WITH REAL-TIME PERCENTAGE INDICATORS & CACHING ---
// //     const handleExportNLRD = async () => {
// //         if (nlrdProgress.status !== 'idle') return;
// //         setNlrdProgress({ status: 'generating', percent: 15 });
// //         toast.info(`Requesting NLRD Pipe-Delimited Batch for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}...`);

// //         const timer = setInterval(() => {
// //             setNlrdProgress(prev => {
// //                 if (prev.status !== 'generating') return prev;
// //                 if (prev.percent >= 80) return prev;
// //                 return { ...prev, percent: prev.percent + 5 };
// //             });
// //         }, 300);

// //         try {
// //             const functions = getFunctions();
// //             const generateNlrdFn = httpsCallable(functions, 'generateNlrdExport');
// //             const response: any = await generateNlrdFn({ cohortId: selectedCohortId });

// //             clearInterval(timer);

// //             if (response.data?.downloadUrl) {
// //                 setNlrdProgress({ status: 'downloading', percent: 80 });
// //                 const filename = `NLRD_SAQA_Export_${selectedCohortId}_${Date.now()}.csv`;

// //                 await downloadFileWithProgress(
// //                     response.data.downloadUrl,
// //                     filename,
// //                     (bytePercent) => {
// //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// //                         setNlrdProgress({ status: 'downloading', percent: scaled });
// //                     }
// //                 );

// //                 setLastNlrdExport({
// //                     downloadUrl: response.data.downloadUrl,
// //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// //                     totalRecords: response.data.totalRecords
// //                 });

// //                 toast.success(`NLRD Export completed! Downloaded ${response.data.totalRecords} records.`);
// //             }
// //         } catch (error: any) {
// //             clearInterval(timer);
// //             console.error('NLRD Export Failed:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'NLRD Export Failed',
// //                 message: error.message || 'An error occurred while attempting to compile the NLRD export batch.'
// //             });
// //         } finally {
// //             setNlrdProgress({ status: 'idle', percent: 0 });
// //         }
// //     };

// //     const handleExportThroughputMatrix = async () => {
// //         if (matrixProgress.status !== 'idle') return;
// //         setMatrixProgress({ status: 'generating', percent: 15 });
// //         toast.info('Compiling Learner Throughput & Compliance Matrix...');

// //         const timer = setInterval(() => {
// //             setMatrixProgress(prev => {
// //                 if (prev.status !== 'generating') return prev;
// //                 if (prev.percent >= 80) return prev;
// //                 return { ...prev, percent: prev.percent + 5 };
// //             });
// //         }, 300);

// //         try {
// //             const functions = getFunctions();
// //             const generateMatrixFn = httpsCallable(functions, 'generateThroughputReport');
// //             const response: any = await generateMatrixFn({ cohortId: selectedCohortId });

// //             clearInterval(timer);

// //             if (response.data?.downloadUrl) {
// //                 setMatrixProgress({ status: 'downloading', percent: 80 });
// //                 const filename = `Throughput_Matrix_${selectedCohortId}_${Date.now()}.csv`;

// //                 await downloadFileWithProgress(
// //                     response.data.downloadUrl,
// //                     filename,
// //                     (bytePercent) => {
// //                         const scaled = Math.min(100, 80 + Math.round((bytePercent / 100) * 20));
// //                         setMatrixProgress({ status: 'downloading', percent: scaled });
// //                     }
// //                 );

// //                 setLastMatrixExport({
// //                     downloadUrl: response.data.downloadUrl,
// //                     generatedAt: new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }),
// //                     totalRecords: response.data.totalLearners
// //                 });

// //                 toast.success(`Throughput Matrix downloaded for ${response.data.totalLearners} learners!`);
// //             }
// //         } catch (error: any) {
// //             clearInterval(timer);
// //             console.error('Throughput Report Failed:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Report Generation Failed',
// //                 message: error.message || 'Server error encountered while building the throughput matrix report.'
// //             });
// //         } finally {
// //             setMatrixProgress({ status: 'idle', percent: 0 });
// //         }
// //     };

// //     // --- MASTER POE GENERATION HANDSHAKE WITH CLOUD FUNCTIONS ---
// //     const handleGeneratePoE = async (learner: LearnerRecord, forceRegenerate: boolean = false) => {
// //         const targetLearnerId = learner.userId || learner.id;
// //         const currentExport = activeExports[learner.id] || activeExports[targetLearnerId];

// //         if (currentExport?.status === 'processing' || currentExport?.status === 'pending') {
// //             toast.info(`An export for ${learner.name} is already in progress (${currentExport.progress}%).`);
// //             return;
// //         }

// //         if (!forceRegenerate && currentExport?.status === 'completed' && currentExport?.downloadUrl) {
// //             window.open(currentExport.downloadUrl, '_blank');
// //             return;
// //         }

// //         try {
// //             toast.info(`${forceRegenerate ? 'Re-compiling' : 'Initiating'} Master PoE for ${learner.name}...`);

// //             const docRef = await addDoc(collection(db, 'poe_export_requests'), {
// //                 learnerId: targetLearnerId,
// //                 requestedBy: currentUser?.uid || currentUser?.id || 'admin',
// //                 status: 'pending',
// //                 progress: 0,
// //                 progressMessage: 'Initializing compliance engine...',
// //                 createdAt: serverTimestamp()
// //             });

// //             setActiveExports(prev => ({
// //                 ...prev,
// //                 [learner.id]: {
// //                     requestId: docRef.id,
// //                     learnerId: targetLearnerId,
// //                     progress: 0,
// //                     progressMessage: 'Initializing compliance engine...',
// //                     status: 'pending'
// //                 },
// //                 [targetLearnerId]: {
// //                     requestId: docRef.id,
// //                     learnerId: targetLearnerId,
// //                     progress: 0,
// //                     progressMessage: 'Initializing compliance engine...',
// //                     status: 'pending'
// //                 }
// //             }));
// //         } catch (error: any) {
// //             console.error('Error requesting PoE export:', error);
// //             setStatusModal({
// //                 isOpen: true,
// //                 type: 'error',
// //                 title: 'Export Initialization Failed',
// //                 message: error.message || `Failed to trigger PoE compilation for ${learner.name}.`
// //             });
// //         }
// //     };

// //     if (isLoading) {
// //         return (
// //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
// //                 <Loader message="Syncing Compliance Ledger..." />
// //             </div>
// //         );
// //     }

// //     return (
// //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--mlab-bg, #f8fafc)', overflow: 'hidden' }}>

// //             <style>{`
// //                 .sm-table-container { 
// //                     background: #fff; 
// //                     border: 1px solid var(--mlab-border); 
// //                     border-top: 3px solid var(--mlab-blue); 
// //                     overflow: hidden; 
// //                     border-radius: 4px; 
// //                     display: flex; 
// //                     flex-direction: column; 
// //                     flex: 1;
// //                     min-height: 400px;
// //                 }
// //                 .sm-table-scroll { 
// //                     flex: 1; 
// //                     overflow-y: auto; 
// //                     overflow-x: auto; 
// //                     display: flex; 
// //                     flex-direction: column; 
// //                 }
// //                 .sm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                
// //                 .sm-table th { 
// //                     background: var(--mlab-midnight, #0f172a); 
// //                     padding: 12px 16px; 
// //                     font-family: var(--font-heading); 
// //                     text-transform: uppercase; 
// //                     color: white; 
// //                     border-bottom: 2px solid var(--mlab-green, #16a34a); 
// //                     font-size: 0.8rem; 
// //                     letter-spacing: 0.05em; 
// //                     position: sticky; 
// //                     top: 0; 
// //                     z-index: 10; 
// //                     box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
// //                 }
                
// //                 .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
// //                 .sm-table tr:hover td { background-color: #f8fafc; }
                
// //                 .sm-pagination-bar { 
// //                     display: flex; 
// //                     align-items: center; 
// //                     justify-content: space-between; 
// //                     padding: 10px 16px; 
// //                     background: #f8fafc; 
// //                     border-top: 1px solid #cbd5e1; 
// //                     font-size: 0.8rem; 
// //                     color: #475569; 
// //                     flex-wrap: wrap; 
// //                     gap: 10px;
// //                     margin-top: auto; 
// //                 }
// //                 .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; }
// //                 .sm-page-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
// //                 .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
// //                 .sm-filter-select { height: 28px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 6px; font-size: 0.75rem; color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }
// //             `}</style>

// //             {/* HEADER COMPONENT */}
// //             <header style={{ padding: '24px', background: 'var(--mlab-midnight)', color: 'white', borderBottom: '3px solid var(--mlab-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', flexShrink: 0 }}>
// //                 <div>
// //                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                         <ShieldCheck size={14} /> Quality Management System (QMS)
// //                     </div>
// //                     <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', margin: '0 0 8px 0', textTransform: 'uppercase' }}>
// //                         SETA &amp; QCTO Compliance Dashboard
// //                     </h1>
// //                     <p style={{ fontFamily: 'var(--font-body)', color: 'whitesmoke', margin: 0, fontSize: '0.85rem', maxWidth: '600px', lineHeight: 1.5 }}>
// //                         Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
// //                     </p>
// //                 </div>
// //                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    
// //                     {/* QCTO AUDIT MODE TOGGLE */}
// //                     <button
// //                         onClick={() => setIsQctoAuditMode(!isQctoAuditMode)}
// //                         style={{
// //                             display: 'flex',
// //                             alignItems: 'center',
// //                             gap: '8px',
// //                             background: isQctoAuditMode ? '#16a34a' : 'rgba(255,255,255,0.1)',
// //                             color: 'white',
// //                             border: `1px solid ${isQctoAuditMode ? '#4ade80' : 'rgba(255,255,255,0.2)'}`,
// //                             padding: '6px 12px',
// //                             fontSize: '0.75rem',
// //                             fontWeight: 800,
// //                             cursor: 'pointer',
// //                             borderRadius: '4px',
// //                             textTransform: 'uppercase',
// //                             letterSpacing: '0.05em'
// //                         }}
// //                     >
// //                         <ShieldCheck size={14} color={isQctoAuditMode ? 'white' : '#4ade80'} />
// //                         QCTO Audit Mode: {isQctoAuditMode ? 'ACTIVE' : 'OFF'}
// //                     </button>

// //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '4px' }}>
// //                         <Layers size={14} color="#4ade80" />
// //                         <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Filter Cohort:</span>
// //                         <select
// //                             value={selectedCohortId}
// //                             onChange={(e) => setSelectedCohortId(e.target.value)}
// //                             style={{
// //                                 background: 'transparent', color: 'white', border: 'none',
// //                                 fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
// //                                 outline: 'none', maxWidth: '240px'
// //                             }}
// //                         >
// //                             <option value="ALL" style={{ color: 'black' }}>All Cohorts (Global View)</option>
// //                             {storeCohorts?.map((c: any) => (
// //                                 <option key={c.id} value={c.id} style={{ color: 'black' }}>
// //                                     {c.name}
// //                                 </option>
// //                             ))}
// //                         </select>
// //                     </div>

// //                     {/* TOP HEADER DUAL / SINGLE NLRD ACTION BUTTON */}
// //                     {lastNlrdExport ? (
// //                         <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// //                             <button
// //                                 onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
// //                                 style={{ background: '#16a34a', color: 'white', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                             >
// //                                 <Download size={14} /> Download Batch
// //                             </button>
// //                             <button
// //                                 onClick={handleExportNLRD}
// //                                 disabled={nlrdProgress.status !== 'idle'}
// //                                 style={{ background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                 title="Regenerate NLRD Batch"
// //                             >
// //                                 <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} />
// //                             </button>
// //                         </div>
// //                     ) : (
// //                         <button onClick={handleExportNLRD} disabled={nlrdProgress.status !== 'idle'} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             {nlrdProgress.status !== 'idle' ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
// //                             {nlrdProgress.status === 'generating' && `Compiling Export (${nlrdProgress.percent}%)...`}
// //                             {nlrdProgress.status === 'downloading' && `Downloading (${nlrdProgress.percent}%)...`}
// //                             {nlrdProgress.status === 'idle' && 'Export NLRD Batch'}
// //                         </button>
// //                     )}
// //                 </div>
// //             </header>

// //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
// //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                         <Users size={14} /> Learner Retention Rate
// //                     </div>
// //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.retentionRate}%</div>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {displayStats.totalEnrolled.toLocaleString()} enrollments</div>
// //                 </div>
// //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                         <FileCheck size={14} /> Graduated Learners
// //                     </div>
// //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.graduated.toLocaleString()}</div>
// //                     <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
// //                 </div>
// //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                         <Scale size={14} /> Active Grievances &amp; Appeals
// //                     </div>
// //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.activeGrievances}</div>
// //                     <div style={{ fontSize: '0.75rem', color: displayStats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
// //                         {displayStats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
// //                     </div>
// //                 </div>
// //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                         <FileSignature size={14} /> Policy Acknowledgment
// //                     </div>
// //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.policySignedPct}%</div>
// //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
// //                 </div>
// //             </div>

// //             {/* STICKY TABS WRAPPER */}
// //             <div style={{
// //                 display: 'flex',
// //                 background: 'white',
// //                 border: '1px solid #cbd5e1',
// //                 padding: '0 8px',
// //                 flexWrap: 'wrap',
// //                 position: 'sticky',
// //                 top: 0,
// //                 zIndex: 40,
// //                 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
// //             }}>
// //                 {[
// //                     { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
// //                     { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// //                     { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// //                     { id: 'policies', label: 'Learner Policies', icon: FileSignature }
// //                 ].map(tab => {
// //                     const Icon = tab.icon;
// //                     const isActive = activeTab === tab.id;
// //                     return (
// //                         <button
// //                             key={tab.id}
// //                             onClick={() => setActiveTab(tab.id as TabOption)}
// //                             style={{
// //                                 padding: '16px 20px', background: 'transparent', border: 'none',
// //                                 borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// //                                 color: isActive ? 'var(--mlab-blue)' : '#64748b',
// //                                 fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
// //                                 textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
// //                                 outline: 'none'
// //                             }}
// //                         >
// //                             <Icon size={16} /> {tab.label}
// //                         </button>
// //                     );
// //                 })}
// //             </div>

// //             <div className="qcto-card" style={{ padding: '24px', background: 'white', flex: 1, display: 'flex', flexDirection: 'column' }}>

// //                 {/* 1. MIS OVERVIEW */}
// //                 {activeTab === 'mis_overview' && (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
// //                         <div>
// //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
// //                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>
// //                         </div>

// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
// //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
// //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{displayStats.totalEnrolled.toLocaleString()}</strong></div>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{displayStats.activeTraining.toLocaleString()}</strong></div>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{displayStats.graduated.toLocaleString()}</strong></div>
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{displayStats.droppedOut.toLocaleString()}</strong></div>
// //                                 </div>
// //                             </div>
// //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
// //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
// //                                 <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
                                
// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    
// //                                     {/* NLRD REPORT DUAL BUTTON GROUP */}
// //                                     {lastNlrdExport ? (
// //                                         <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// //                                             <button
// //                                                 onClick={() => window.open(lastNlrdExport.downloadUrl, '_blank')}
// //                                                 className="lfm-btn lfm-btn--primary"
// //                                                 style={{ flex: 1, background: '#16a34a', color: 'white', border: 'none', justifyContent: 'center' }}
// //                                             >
// //                                                 <Download size={14} /> Download NLRD Batch ({lastNlrdExport.generatedAt})
// //                                             </button>
// //                                             <button
// //                                                 onClick={handleExportNLRD}
// //                                                 disabled={nlrdProgress.status !== 'idle'}
// //                                                 className="lfm-btn lfm-btn--ghost"
// //                                                 style={{ justifyContent: 'center' }}
// //                                                 title="Re-run Cloud Function to compile fresh data"
// //                                             >
// //                                                 <RefreshCw size={14} className={nlrdProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
// //                                             </button>
// //                                         </div>
// //                                     ) : (
// //                                         <button
// //                                             onClick={handleExportNLRD}
// //                                             disabled={nlrdProgress.status !== 'idle'}
// //                                             className="lfm-btn lfm-btn--ghost"
// //                                             style={{ justifyContent: 'flex-start' }}
// //                                         >
// //                                             {nlrdProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
// //                                             {nlrdProgress.status === 'generating' && `Compiling SAQA NLRD Batch (${nlrdProgress.percent}%)...`}
// //                                             {nlrdProgress.status === 'downloading' && `Downloading NLRD File (${nlrdProgress.percent}%)...`}
// //                                             {nlrdProgress.status === 'idle' && 'Download SAQA NLRD Report (Pipe-Delimited)'}
// //                                         </button>
// //                                     )}

// //                                     {/* THROUGHPUT MATRIX DUAL BUTTON GROUP */}
// //                                     {lastMatrixExport ? (
// //                                         <div style={{ display: 'flex', gap: '8px', width: '100%' }}>
// //                                             <button
// //                                                 onClick={() => window.open(lastMatrixExport.downloadUrl, '_blank')}
// //                                                 className="lfm-btn lfm-btn--primary"
// //                                                 style={{ flex: 1, background: '#0284c7', color: 'white', border: 'none', justifyContent: 'center' }}
// //                                             >
// //                                                 <Download size={14} /> Download Throughput Matrix ({lastMatrixExport.generatedAt})
// //                                             </button>
// //                                             <button
// //                                                 onClick={handleExportThroughputMatrix}
// //                                                 disabled={matrixProgress.status !== 'idle'}
// //                                                 className="lfm-btn lfm-btn--ghost"
// //                                                 style={{ justifyContent: 'center' }}
// //                                                 title="Re-run Cloud Function to compile fresh data"
// //                                             >
// //                                                 <RefreshCw size={14} className={matrixProgress.status !== 'idle' ? 'animate-spin' : ''} /> Regenerate
// //                                             </button>
// //                                         </div>
// //                                     ) : (
// //                                         <button
// //                                             onClick={handleExportThroughputMatrix}
// //                                             disabled={matrixProgress.status !== 'idle'}
// //                                             className="lfm-btn lfm-btn--ghost"
// //                                             style={{ justifyContent: 'flex-start' }}
// //                                         >
// //                                             {matrixProgress.status !== 'idle' ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
// //                                             {matrixProgress.status === 'generating' && `Compiling Throughput Matrix (${matrixProgress.percent}%)...`}
// //                                             {matrixProgress.status === 'downloading' && `Downloading Throughput Matrix (${matrixProgress.percent}%)...`}
// //                                             {matrixProgress.status === 'idle' && 'Download Learner Details & Throughput Ratio (CSV)'}
// //                                         </button>
// //                                     )}

// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* 2. POE VAULT */}
// //                 {activeTab === 'poe_vault' && (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
// //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// //                                 Learner Records &amp; Evidence Vault {isQctoAuditMode && <span style={{ fontSize: '0.75rem', color: '#16a34a', textTransform: 'none', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', marginLeft: '8px' }}>QCTO Filter Active</span>}
// //                             </h2>
// //                             <div className="mlab-search" style={{ margin: 0, width: '300px' }}>
// //                                 <Search size={14} color="#94a3b8" />
// //                                 <input type="text" placeholder="Search ID number or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
// //                             </div>
// //                         </div>

// //                         <div className="sm-table-container">
// //                             <div style={{
// //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// //                             }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                         Learner Records ({searchedLearners.length})
// //                                     </h3>
// //                                 </div>
// //                             </div>

// //                             {paginatedLearners.length === 0 ? (
// //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// //                                     <SearchX size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
// //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Learner Records Match</h4>
// //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>Adjust your search, cohort filter, or QCTO Audit Mode toggle to find evidence vaults.</p>
// //                                 </div>
// //                             ) : (
// //                                 <>
// //                                     <div className="sm-table-scroll">
// //                                         <table className="sm-table">
// //                                             <thead>
// //                                                 <tr>
// //                                                     <th>Learner Details</th>
// //                                                     <th>Cohort &amp; Qualification</th>
// //                                                     <th>Curriculum Matrix</th>
// //                                                     <th>Overall Progress</th>
// //                                                     <th>Statement of Results</th>
// //                                                     <th style={{ textAlign: 'right' }}>Audit Action</th>
// //                                                 </tr>
// //                                             </thead>
// //                                             <tbody>
// //                                                 {paginatedLearners.map(l => {
// //                                                     const isDropped = ['dropped', 'withdrawn', 'terminated'].includes(l.status.toLowerCase());
// //                                                     const exportState = activeExports[l.id] || activeExports[l.userId];

// //                                                     return (
// //                                                         <tr key={l.id} style={{ background: isDropped ? '#fef2f2' : 'white', opacity: isDropped ? 0.85 : 1 }}>
// //                                                             <td>
// //                                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{l.name}</strong>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
// //                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
// //                                                                     {isDropped && (
// //                                                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginTop: '2px' }}>
// //                                                                             <UserX size={10} /> {l.status}
// //                                                                         </span>
// //                                                                     )}
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td>
// //                                                                 <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// //                                                                     {l.cohortName}
// //                                                                 </div>
// //                                                                 <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// //                                                                     {l.programmeName}
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td>
// //                                                                 <div style={{ fontSize: '0.7rem', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// //                                                                     <div><strong style={{ color: '#0369a1' }}>KM:</strong> FA {l.formatives.completed}/{l.formatives.total} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span> SA {l.summatives.completed}/{l.summatives.total}</div>
// //                                                                     <div><strong style={{ color: '#b45309' }}>PM:</strong> {l.practicals.completed}/{l.practicals.total} Observations</div>
// //                                                                     <div><strong style={{ color: '#15803d' }}>WM:</strong> {l.workplaces.completed}/{l.workplaces.total} Logbooks</div>
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td style={{ width: '130px' }}>
// //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                                                     <div style={{ flex: 1, height: '6px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// //                                                                         <div style={{ width: `${l.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (l.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// //                                                                     </div>
// //                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDropped ? '#991b1b' : 'inherit' }}>{Math.round(l.overallProgress)}%</span>
// //                                                                 </div>
// //                                                             </td>
// //                                                             <td>
// //                                                                 {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #bbf7d0' }}>ISSUED</span>}
// //                                                                 {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #fde68a' }}>PENDING MODERATION</span>}
// //                                                                 {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #e2e8f0' }}>NOT READY</span>}
// //                                                             </td>
// //                                                             <td style={{ textAlign: 'right' }}>
// //                                                                 <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' }}>
// //                                                                     <button onClick={() => navigate(`/sor/${l.id}`)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// //                                                                         <FileText size={12} /> View SoR
// //                                                                     </button>

// //                                                                     {/* DYNAMIC MASTER POE BUTTON / PHYSICAL POE INTERCEPT */}
// //                                                                     {(() => {
// //                                                                         if (l.isOffline) {
// //                                                                             return (
// //                                                                                 <button onClick={() => setOfflineModalLearner(l)} style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// //                                                                                     <FileArchive size={12} /> Physical PoE
// //                                                                                 </button>
// //                                                                             );
// //                                                                         }
// //                                                                         if (exportState?.status === 'pending' || exportState?.status === 'processing') {
// //                                                                             return (
// //                                                                                 <button disabled style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
// //                                                                                     <Loader2 size={12} className="animate-spin" /> {exportState.progress}%
// //                                                                                 </button>
// //                                                                             );
// //                                                                         }
// //                                                                         if (exportState?.status === 'completed' && exportState?.downloadUrl) {
// //                                                                             return (
// //                                                                                 <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
// //                                                                                     <button 
// //                                                                                         onClick={() => window.open(exportState.downloadUrl, '_blank')} 
// //                                                                                         style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #bbf7d0', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// //                                                                                         title="Download existing PoE"
// //                                                                                     >
// //                                                                                         <Download size={12} /> Download
// //                                                                                     </button>
// //                                                                                     <button 
// //                                                                                         onClick={() => handleGeneratePoE(l, true)} 
// //                                                                                         style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '6px 10px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}
// //                                                                                         title="Regenerate PoE"
// //                                                                                     >
// //                                                                                         <RefreshCw size={12} /> Regenerate
// //                                                                                     </button>
// //                                                                                 </div>
// //                                                                             );
// //                                                                         }
// //                                                                         if (exportState?.status === 'error') {
// //                                                                             return (
// //                                                                                 <button 
// //                                                                                     onClick={() => handleGeneratePoE(l, true)} 
// //                                                                                     style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
// //                                                                                 >
// //                                                                                     <AlertCircle size={12} /> Retry PoE
// //                                                                                 </button>
// //                                                                             );
// //                                                                         }
// //                                                                         return (
// //                                                                             <button onClick={() => handleGeneratePoE(l)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// //                                                                                 <FileArchive size={12} /> Compile PoE
// //                                                                             </button>
// //                                                                         );
// //                                                                     })()}
// //                                                                 </div>
// //                                                             </td>
// //                                                         </tr>
// //                                                     );
// //                                                 })}
// //                                             </tbody>
// //                                         </table>
// //                                     </div>

// //                                     <div className="sm-pagination-bar">
// //                                         <div>
// //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedLearners.length)}</strong> of <strong>{searchedLearners.length}</strong> records
// //                                         </div>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                                 <span>Rows per page:</span>
// //                                                 <select
// //                                                     className="sm-filter-select"
// //                                                     value={itemsPerPage}
// //                                                     onChange={(e) => setItemsPerPage(Number(e.target.value))}
// //                                                 >
// //                                                     <option value={10}>10</option>
// //                                                     <option value={15}>15</option>
// //                                                     <option value={25}>25</option>
// //                                                     <option value={50}>50</option>
// //                                                 </select>
// //                                             </div>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                 <button
// //                                                     type="button"
// //                                                     className="sm-page-btn"
// //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// //                                                     disabled={currentPage === 1}
// //                                                 >
// //                                                     <ChevronLeft size={14} /> Prev
// //                                                 </button>
// //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// //                                                     {currentPage} / {totalPagesLearners}
// //                                                 </span>
// //                                                 <button
// //                                                     type="button"
// //                                                     className="sm-page-btn"
// //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesLearners, p + 1))}
// //                                                     disabled={currentPage >= totalPagesLearners}
// //                                                 >
// //                                                     Next <ChevronRight size={14} />
// //                                                 </button>
// //                                             </div>
// //                                         </div>
// //                                     </div>
// //                                 </>
// //                             )}
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* 3. GRIEVANCES */}
// //                 {activeTab === 'grievances' && (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals &amp; Grievance Register</h2>

// //                         <div className="sm-table-container">
// //                             <div style={{
// //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// //                             }}>
// //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                         Active Grievances ({cohortFilteredGrievances.length})
// //                                     </h3>
// //                                 </div>
// //                             </div>

// //                             {paginatedGrievances.length === 0 ? (
// //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// //                                     <CheckCircle2 size={36} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
// //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Active Grievances</h4>
// //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>There are no appeals or complaints lodged for this cohort.</p>
// //                                 </div>
// //                             ) : (
// //                                 <>
// //                                     <div className="sm-table-scroll">
// //                                         <table className="sm-table">
// //                                             <thead>
// //                                                 <tr>
// //                                                     <th>Ref ID</th>
// //                                                     <th>Learner</th>
// //                                                     <th>Type</th>
// //                                                     <th>Date Logged</th>
// //                                                     <th>Description</th>
// //                                                     <th style={{ textAlign: 'right' }}>Status</th>
// //                                                 </tr>
// //                                             </thead>
// //                                             <tbody>
// //                                                 {paginatedGrievances.map(g => (
// //                                                     <tr key={g.id}>
// //                                                         <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// //                                                         <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// //                                                         <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
// //                                                         <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// //                                                         <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// //                                                         <td style={{ textAlign: 'right' }}>
// //                                                             {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
// //                                                             {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
// //                                                             {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
// //                                                         </td>
// //                                                     </tr>
// //                                                 ))}
// //                                             </tbody>
// //                                         </table>
// //                                     </div>

// //                                     <div className="sm-pagination-bar">
// //                                         <div>
// //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> records
// //                                         </div>
// //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// //                                                 <button
// //                                                     type="button"
// //                                                     className="sm-page-btn"
// //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// //                                                     disabled={currentPage === 1}
// //                                                 >
// //                                                     <ChevronLeft size={14} /> Prev
// //                                                 </button>
// //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// //                                                     {currentPage} / {totalPagesGrievances}
// //                                                 </span>
// //                                                 <button
// //                                                     type="button"
// //                                                     className="sm-page-btn"
// //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))}
// //                                                     disabled={currentPage >= totalPagesGrievances}
// //                                                 >
// //                                                     Next <ChevronRight size={14} />
// //                                                 </button>
// //                                             </div>
// //                                         </div>
// //                                     </div>
// //                                 </>
// //                             )}
// //                         </div>
// //                     </div>
// //                 )}

// //                 {/* 4. LEARNER POLICIES */}
// //                 {activeTab === 'policies' && (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
// //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies &amp; Code of Conduct</h2>
// //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

// //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
// //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// //                                 <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// //                                     <FileSignature size={20} />
// //                                 </div>
// //                                 <div style={{ flex: 1 }}>
// //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// //                                 <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// //                                     <AlertCircle size={20} />
// //                                 </div>
// //                                 <div style={{ flex: 1 }}>
// //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals &amp; Assessment Policy</h3>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 )}
// //             </div>

// //             {/* PHYSICAL POE RECORD NOTICE MODAL */}
// //             {offlineModalLearner && (
// //                 <div style={{ position: 'fixed', inset: 0, zIndex: 9999999, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
// //                     <div className="animate-fade-in" style={{ width: '100%', maxWidth: '520px', background: 'white', borderRadius: '4px', borderTop: '5px solid var(--mlab-blue)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
// //                         <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--mlab-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--mlab-light-blue)' }}>
// //                             <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// //                                 <FileArchive size={20} color="var(--mlab-blue)" />
// //                                 <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// //                                     Physical PoE Record Notice
// //                                 </h3>
// //                             </div>
// //                             <button onClick={() => setOfflineModalLearner(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--mlab-grey)' }}>
// //                                 <X size={18} />
// //                             </button>
// //                         </div>

// //                         <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
// //                             <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderLeft: '4px solid #c2410c', padding: '12px 16px', borderRadius: '4px' }}>
// //                                 <strong style={{ fontSize: '0.85rem', color: '#9a3412', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
// //                                     Offline / Physical Portfolio on File
// //                                 </strong>
// //                                 <p style={{ margin: 0, fontSize: '0.82rem', color: '#c2410c', lineHeight: 1.5 }}>
// //                                     <strong>{offlineModalLearner.name}</strong> (ID: {offlineModalLearner.idNumber}) was onboarded with a physical Lever Arch Portfolio of Evidence.
// //                                 </p>
// //                             </div>

// //                             <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.6 }}>
// //                                 <p style={{ margin: '0 0 10px 0' }}>
// //                                     A digital Master PoE compilation is currently unavailable for this candidate. For QCTO / SETA audit verification, please consult the physical academic archive at the local training campus.
// //                                 </p>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>
// //                                     Note: Assessment results and Statements of Results (SoR) remain available digitally on the ledger. Check back in the future for digitized portfolio updates.
// //                                 </p>
// //                             </div>
// //                         </div>

// //                         <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #cbd5e1', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
// //                             <button onClick={() => { const targetId = offlineModalLearner.id; setOfflineModalLearner(null); navigate(`/sor/${targetId}`); }} className="lfm-btn lfm-btn--primary" style={{ fontSize: '0.75rem', background: 'var(--mlab-blue)', color: 'white', border: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// //                                 <FileText size={12} /> View Digital SoR
// //                             </button>
// //                             <button onClick={() => setOfflineModalLearner(null)} className="sm-page-btn">
// //                                 Close Notice
// //                             </button>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* STATUS MODAL FOR SYSTEM & EXPORT ERRORS */}
// //             {statusModal.isOpen && (
// //                 <StatusModal
// //                     type={statusModal.type}
// //                     title={statusModal.title}
// //                     message={statusModal.message}
// //                     confirmText="Acknowledge"
// //                     onClose={() => setStatusModal(prev => ({ ...prev, isOpen: false }))}
// //                 />
// //             )}
// //         </div>
// //     );
// // };


// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { useNavigate } from 'react-router-dom';
// // // import {
// // //     ShieldCheck, Download, Users, FileText, AlertCircle,
// // //     FileCheck, Scale, FileSignature, BarChart3, Search,
// // //     CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2,
// // //     ChevronLeft, ChevronRight, Layers, UserX, Activity
// // // } from 'lucide-react';
// // // import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
// // // import { db } from '../../../lib/firebase';
// // // import { useToast } from '../../../components/common/Toast/Toast';
// // // import { useStore } from '../../../store/useStore';
// // // import Loader from '../../../components/common/Loader/Loader';

// // // // --- Types ---
// // // type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

// // // interface LearnerRecord {
// // //     id: string;
// // //     userId: string;
// // //     name: string;
// // //     idNumber: string;
// // //     cohortId: string;
// // //     cohortName: string;
// // //     programmeName: string;
// // //     overallProgress: number;
// // //     formatives: { completed: number; total: number };
// // //     summatives: { completed: number; total: number };
// // //     practicals: { completed: number; total: number };
// // //     workplaces: { completed: number; total: number };
// // //     sorStatus: 'issued' | 'pending' | 'not_ready';
// // //     status: string;
// // // }

// // // interface GrievanceRecord {
// // //     id: string;
// // //     learnerName: string;
// // //     cohortId: string;
// // //     dateLogged: string;
// // //     type: 'appeal' | 'complaint';
// // //     status: 'open' | 'under_review' | 'resolved';
// // //     description: string;
// // // }

// // // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // // export const QmsComplianceDashboard: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     const toast = useToast();
// // //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// // //     const [searchTerm, setSearchTerm] = useState('');
// // //     const [isLoading, setIsLoading] = useState(true);

// // //     // Pagination State
// // //     const [currentPage, setCurrentPage] = useState(1);
// // //     const [itemsPerPage, setItemsPerPage] = useState(15);

// // //     const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');

// // //     // Global Store Context
// // //     const {
// // //         learners: storeLearners,
// // //         cohorts: storeCohorts,
// // //         programmes: storeProgrammes,
// // //         fetchProgrammes,
// // //         fetchCohorts,
// // //         fetchLearners
// // //     } = useStore() as any;

// // //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// // //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
// // //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// // //     const [policySignerIds, setPolicySignerIds] = useState<Set<string>>(new Set());

// // //     // --- HYDRATE GLOBAL STORE IF EMPTY ---
// // //     useEffect(() => {
// // //         if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes();
// // //         if (!storeCohorts || storeCohorts.length === 0) fetchCohorts();
// // //         if (!storeLearners || storeLearners.length === 0) fetchLearners();
// // //     }, []);

// // //     useEffect(() => {
// // //         setCurrentPage(1);
// // //     }, [searchTerm, selectedCohortId, itemsPerPage, activeTab]);

// // //     // --- Firebase Subscriptions ---
// // //     useEffect(() => {
// // //         setIsLoading(true);

// // //         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
// // //             const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //             setRawEnrollments(raw);
// // //         });

// // //         let submissionsQuery = collection(db, 'learner_submissions') as any;
// // //         if (selectedCohortId !== 'ALL') {
// // //             submissionsQuery = query(submissionsQuery, where('cohortId', '==', selectedCohortId));
// // //         }

// // //         const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
// // //             const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // //             setRawSubmissions(subs);
// // //         });

// // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // //         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
// // //             const parsedGrievances: GrievanceRecord[] = [];
// // //             snap.docs.forEach(doc => {
// // //                 const data = doc.data();
// // //                 const status = data.status || 'open';
// // //                 parsedGrievances.push({
// // //                     id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
// // //                     learnerName: data.learnerName || 'Unknown Learner',
// // //                     cohortId: data.cohortId || data.cohortRunId || '',
// // //                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // //                     type: data.type || 'appeal',
// // //                     status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// // //                     description: data.reason || data.description || 'No description provided'
// // //                 });
// // //             });
// // //             setRawGrievances(parsedGrievances);
// // //         });

// // //         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
// // //             const signers = new Set(snap.docs.map(d => d.data().userId));
// // //             setPolicySignerIds(signers as Set<string>);
// // //             setTimeout(() => setIsLoading(false), 500);
// // //         });

// // //         return () => {
// // //             unsubEnrollments();
// // //             unsubSubmissions();
// // //             unsubGrievances();
// // //             unsubPolicies();
// // //         };
// // //     }, [selectedCohortId]);

// // //     // --- Cross-Reference Mappings ---
// // //     const enrichedLearners = useMemo(() => {
// // //         return rawEnrollments.map((data): LearnerRecord => {
// // //             const actualUserId = data.userId || data.learnerId || data.idNumber || '';
// // //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.idNumber === actualUserId);

// // //             const activeCohortId = data.cohortId || data.cohortRunId;
// // //             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

// // //             let storeProgramme = storeProgrammes?.find((p: any) =>
// // //                 p.id === storeCohort?.programmeId ||
// // //                 p.id === storeCohort?.qualificationId ||
// // //                 p.id === data.programmeId
// // //             );

// // //             if (!storeProgramme && data.qualification?.saqaId) {
// // //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.qualification.saqaId));
// // //             }
// // //             if (!storeProgramme && data.saqaId) {
// // //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.saqaId));
// // //             }

// // //             const mappedName = data.userName || data.learnerName || data.fullName || data.name || storeLearner?.fullName || storeLearner?.name || 'Unknown Learner';
// // //             const mappedId = data.idNumber || actualUserId || 'N/A';
// // //             const mappedCohort = data.cohortName || storeCohort?.name || activeCohortId || 'Unassigned Cohort';
// // //             const mappedProgramme = storeProgramme?.name || 'Generic Framework';

// // //             let totalBlueprintKM = 0;
// // //             let totalBlueprintPM = 0;
// // //             let totalBlueprintWM = 0;

// // //             if (storeProgramme) {
// // //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// // //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// // //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// // //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// // //                     const flat = storeProgramme.modules;
// // //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// // //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// // //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// // //                 }
// // //             }

// // //             let calculatedFA = 0;
// // //             let calculatedSA = 0;
// // //             let calculatedPM = 0;
// // //             let calculatedWM = 0;

// // //             let totalAssignedFA = 0;
// // //             let totalAssignedSA = 0;
// // //             let totalAssignedPM = 0;
// // //             let totalAssignedWM = 0;

// // //             const learnerSubs = rawSubmissions.filter(s =>
// // //                 (actualUserId && s.learnerId === actualUserId) ||
// // //                 (actualUserId && s.authUid === actualUserId) ||
// // //                 (data.id && s.enrollmentId === data.id)
// // //             );

// // //             learnerSubs.forEach(s => {
// // //                 const type = String(s.type || 'formative').toLowerCase();
// // //                 const moduleType = String(s.moduleType || '').toLowerCase();
// // //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// // //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// // //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);

// // //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// // //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// // //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// // //                 if (isKnowledge) {
// // //                     if (type.includes('formative') || type.includes('fa')) {
// // //                         totalAssignedFA++;
// // //                         if (isDone) calculatedFA++;
// // //                     } else if (type.includes('summative') || type.includes('sa')) {
// // //                         totalAssignedSA++;
// // //                         if (isDone) calculatedSA++;
// // //                     }
// // //                 } else if (isPractical) {
// // //                     totalAssignedPM++;
// // //                     if (isDone) calculatedPM++;
// // //                 } else if (isWorkplace) {
// // //                     totalAssignedWM++;
// // //                     if (isDone) calculatedWM++;
// // //                 }
// // //             });

// // //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// // //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// // //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// // //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// // //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// // //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// // //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// // //             return {
// // //                 id: data.id,
// // //                 userId: actualUserId,
// // //                 name: mappedName,
// // //                 idNumber: mappedId,
// // //                 cohortId: activeCohortId || 'unassigned',
// // //                 cohortName: mappedCohort,
// // //                 programmeName: mappedProgramme,
// // //                 overallProgress: dynamicProgress,
// // //                 formatives: { completed: calculatedFA, total: ceilingFA },
// // //                 summatives: { completed: calculatedSA, total: ceilingSA },
// // //                 practicals: { completed: calculatedPM, total: ceilingPM },
// // //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// // //                 sorStatus: data.sorStatus || 'pending',
// // //                 status: data.status || 'active'
// // //             };
// // //         });

// // //     }, [rawEnrollments, rawSubmissions, storeLearners, storeCohorts, storeProgrammes]);

// // //     // Apply Filters
// // //     const cohortFilteredLearners = useMemo(() => {
// // //         if (selectedCohortId === 'ALL') return enrichedLearners;
// // //         return enrichedLearners.filter(l => l.cohortId === selectedCohortId);
// // //     }, [enrichedLearners, selectedCohortId]);

// // //     const cohortFilteredGrievances = useMemo(() => {
// // //         if (selectedCohortId === 'ALL') return rawGrievances;
// // //         return rawGrievances.filter(g => g.cohortId === selectedCohortId);
// // //     }, [rawGrievances, selectedCohortId]);

// // //     const searchedLearners = useMemo(() => {
// // //         if (!searchTerm.trim()) return cohortFilteredLearners;
// // //         const lowerSearch = searchTerm.toLowerCase();
// // //         return cohortFilteredLearners.filter(l =>
// // //             (l.name && l.name.toLowerCase().includes(lowerSearch)) ||
// // //             (l.idNumber && l.idNumber.toLowerCase().includes(lowerSearch)) ||
// // //             (l.cohortName && l.cohortName.toLowerCase().includes(lowerSearch))
// // //         );
// // //     }, [cohortFilteredLearners, searchTerm]);

// // //     // Compute Dynamic Stats
// // //     const displayStats = useMemo(() => {
// // //         let active = 0;
// // //         let grad = 0;
// // //         let drop = 0;
// // //         let signedPolicyCount = 0;

// // //         cohortFilteredLearners.forEach(l => {
// // //             const status = l.status.toLowerCase();
// // //             if (status === 'active') active++;
// // //             else if (status === 'graduated' || status === 'competent') grad++;
// // //             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

// // //             if (l.userId && policySignerIds.has(l.userId)) {
// // //                 signedPolicyCount++;
// // //             }
// // //         });

// // //         const total = cohortFilteredLearners.length;
// // //         const retentionRate = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;

// // //         const baseForPolicies = (active + grad) > 0 ? (active + grad) : (total > 0 ? total : 1);
// // //         const policySignedPct = total === 0 ? 0 : Math.min(100, Math.round((signedPolicyCount / baseForPolicies) * 100));

// // //         const activeGrievances = cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length;

// // //         return {
// // //             totalEnrolled: total,
// // //             activeTraining: active,
// // //             graduated: grad,
// // //             droppedOut: drop,
// // //             retentionRate,
// // //             activeGrievances,
// // //             policySignedPct
// // //         };
// // //     }, [cohortFilteredLearners, cohortFilteredGrievances, policySignerIds]);

// // //     const totalPagesLearners = Math.max(1, Math.ceil(searchedLearners.length / itemsPerPage));
// // //     const paginatedLearners = searchedLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// // //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// // //     const paginatedGrievances = cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// // //     const handleExportNLRD = () => {
// // //         toast.success(`Compiling NLRD Export for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}. The CSV will download shortly.`);
// // //     };

// // //     const handleGeneratePoE = (learnerName: string) => {
// // //         toast.info(`Compiling Master Portfolio of Evidence (PoE) for ${learnerName}...`);
// // //     };

// // //     if (isLoading) {
// // //         return (
// // //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
// // //                 <Loader message='Syncing Compliance Ledger...' />
// // //             </div>
// // //         );
// // //     }

// // //     return (
// // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--mlab-bg, #f8fafc)', minHeight: '100vh' }}>

// // //             {/* EXACT STYLING REPLICATED FROM MENTOR DASHBOARD */}
// // //             <style>{`
// // //                 .sm-table-container { 
// // //                     background: #fff; 
// // //                     border: 1px solid var(--mlab-border); 
// // //                     border-top: 3px solid var(--mlab-blue); 
// // //                     overflow: hidden; 
// // //                     border-radius: 4px; 
// // //                     display: flex; 
// // //                     flex-direction: column; 
// // //                     flex: 1; /* Absorbs remaining viewport height */
// // //                     min-height: 400px;
// // //                 }
// // //                 .sm-table-scroll { 
// // //                     flex: 1; 
// // //                     overflow-y: auto; 
// // //                     overflow-x: auto; 
// // //                     display: flex; 
// // //                     flex-direction: column; 
// // //                 }
// // //                 .sm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                
// // //                 /* 🚀 TABLE HEADERS STICKY FIX */
// // //                 .sm-table th { 
// // //                     background: var(--mlab-midnight, #0f172a); 
// // //                     padding: 12px 16px; 
// // //                     font-family: var(--font-heading); 
// // //                     text-transform: uppercase; 
// // //                     color: white; 
// // //                     border-bottom: 2px solid var(--mlab-green, #16a34a); 
// // //                     font-size: 0.8rem; 
// // //                     letter-spacing: 0.05em; 
// // //                     position: sticky; 
// // //                     top: 0; 
// // //                     z-index: 10; 
// // //                     box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
// // //                 }
                
// // //                 .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
// // //                 .sm-table tr:hover td { background-color: #f8fafc; }
                
// // //                 .sm-pagination-bar { 
// // //                     display: flex; 
// // //                     align-items: center; 
// // //                     justify-content: space-between; 
// // //                     padding: 10px 16px; 
// // //                     background: #f8fafc; 
// // //                     border-top: 1px solid #cbd5e1; 
// // //                     font-size: 0.8rem; 
// // //                     color: #475569; 
// // //                     flex-wrap: wrap; 
// // //                     gap: 10px;
// // //                     margin-top: auto; 
// // //                 }
// // //                 .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; }
// // //                 .sm-page-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
// // //                 .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
// // //                 .sm-filter-select { height: 28px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 6px; font-size: 0.75rem; color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }
// // //             `}</style>

// // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--mlab-midnight)', color: 'white', padding: '24px', borderRadius: '0px', borderLeft: '6px solid #16a34a', flexWrap: 'wrap', gap: '16px' }}>
// // //                 <div>
// // //                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <ShieldCheck size={14} /> Quality Management System (QMS)
// // //                     </div>
// // //                     <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // //                         SETA & QCTO Compliance Dashboard
// // //                     </h1>
// // //                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '600px', lineHeight: 1.5 }}>
// // //                         Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
// // //                     </p>
// // //                 </div>
// // //                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
// // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)' }}>
// // //                         <Layers size={14} color="#4ade80" />
// // //                         <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Filter Cohort:</span>
// // //                         <select
// // //                             value={selectedCohortId}
// // //                             onChange={(e) => setSelectedCohortId(e.target.value)}
// // //                             style={{
// // //                                 background: 'transparent', color: 'white', border: 'none',
// // //                                 fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
// // //                                 outline: 'none', maxWidth: '240px'
// // //                             }}
// // //                         >
// // //                             <option value="ALL" style={{ color: 'black' }}>All Cohorts (Global View)</option>
// // //                             {storeCohorts?.map((c: any) => (
// // //                                 <option key={c.id} value={c.id} style={{ color: 'black' }}>
// // //                                     {c.name}
// // //                                 </option>
// // //                             ))}
// // //                         </select>
// // //                     </div>

// // //                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <Download size={16} /> Export NLRD Batch
// // //                     </button>
// // //                 </div>
// // //             </div>

// // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
// // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <Users size={14} /> Learner Retention Rate
// // //                     </div>
// // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.retentionRate}%</div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {displayStats.totalEnrolled.toLocaleString()} enrollments</div>
// // //                 </div>
// // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <FileCheck size={14} /> Graduated Learners
// // //                     </div>
// // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.graduated.toLocaleString()}</div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
// // //                 </div>
// // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <Scale size={14} /> Active Grievances & Appeals
// // //                     </div>
// // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.activeGrievances}</div>
// // //                     <div style={{ fontSize: '0.75rem', color: displayStats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
// // //                         {displayStats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
// // //                     </div>
// // //                 </div>
// // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                         <FileSignature size={14} /> Policy Acknowledgment
// // //                     </div>
// // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.policySignedPct}%</div>
// // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
// // //                 </div>
// // //             </div>

// // //             {/* 🚀 STICKY TABS WRAPPER */}
// // //             <div style={{
// // //                 display: 'flex',
// // //                 background: 'white',
// // //                 border: '1px solid #cbd5e1',
// // //                 padding: '0 8px',
// // //                 flexWrap: 'wrap',
// // //                 position: 'sticky',
// // //                 top: 0,
// // //                 zIndex: 40,
// // //                 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
// // //             }}>
// // //                 {[
// // //                     { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
// // //                     { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // //                     { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// // //                     { id: 'policies', label: 'Learner Policies', icon: FileSignature }
// // //                 ].map(tab => {
// // //                     const Icon = tab.icon;
// // //                     const isActive = activeTab === tab.id;
// // //                     return (
// // //                         <button
// // //                             key={tab.id}
// // //                             onClick={() => setActiveTab(tab.id as TabOption)}
// // //                             style={{
// // //                                 padding: '16px 20px', background: 'transparent', border: 'none',
// // //                                 borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// // //                                 color: isActive ? 'var(--mlab-blue)' : '#64748b',
// // //                                 fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
// // //                                 textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
// // //                                 outline: 'none'
// // //                             }}
// // //                         >
// // //                             <Icon size={16} /> {tab.label}
// // //                         </button>
// // //                     );
// // //                 })}
// // //             </div>

// // //             <div className="qcto-card" style={{ padding: '24px', background: 'white', flex: 1, display: 'flex', flexDirection: 'column' }}>

// // //                 {/* 1. MIS OVERVIEW */}
// // //                 {activeTab === 'mis_overview' && (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
// // //                         <div>
// // //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
// // //                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>
// // //                         </div>

// // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
// // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
// // //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{displayStats.totalEnrolled.toLocaleString()}</strong></div>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{displayStats.activeTraining.toLocaleString()}</strong></div>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{displayStats.graduated.toLocaleString()}</strong></div>
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{displayStats.droppedOut.toLocaleString()}</strong></div>
// // //                                 </div>
// // //                             </div>
// // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
// // //                                 <h3 style={{ margin: '0 0 16px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
// // //                                 <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><FileText size={14} /> Download Quarterly SETA Report (PDF)</button>
// // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><BarChart3 size={14} /> Download Learner Details Ratio (Excel)</button>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* 2. POE VAULT */}
// // //                 {activeTab === 'poe_vault' && (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
// // //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Records & Evidence Vault</h2>
// // //                             <div className="mlab-search" style={{ margin: 0, width: '300px' }}>
// // //                                 <Search size={14} color="#94a3b8" />
// // //                                 <input type="text" placeholder="Search ID number or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
// // //                             </div>
// // //                         </div>

// // //                         <div className="sm-table-container">
// // //                             <div style={{
// // //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// // //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// // //                             }}>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                                         Learner Records ({searchedLearners.length})
// // //                                     </h3>
// // //                                 </div>
// // //                             </div>

// // //                             {paginatedLearners.length === 0 ? (
// // //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// // //                                     <SearchX size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
// // //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Learner Records Match</h4>
// // //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>Adjust your search or cohort filter to find evidence vaults.</p>
// // //                                 </div>
// // //                             ) : (
// // //                                 <>
// // //                                     <div className="sm-table-scroll">
// // //                                         <table className="sm-table">
// // //                                             <thead>
// // //                                                 <tr>
// // //                                                     <th>Learner Details</th>
// // //                                                     <th>Cohort &amp; Qualification</th>
// // //                                                     <th>Curriculum Matrix</th>
// // //                                                     <th>Overall Progress</th>
// // //                                                     <th>Statement of Results</th>
// // //                                                     <th style={{ textAlign: 'right' }}>Audit Action</th>
// // //                                                 </tr>
// // //                                             </thead>
// // //                                             <tbody>
// // //                                                 {paginatedLearners.map(l => {
// // //                                                     const isDropped = ['dropped', 'withdrawn', 'terminated'].includes(l.status.toLowerCase());

// // //                                                     return (
// // //                                                         <tr key={l.id} style={{ background: isDropped ? '#fef2f2' : 'white', opacity: isDropped ? 0.85 : 1 }}>
// // //                                                             <td>
// // //                                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{l.name}</strong>
// // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
// // //                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
// // //                                                                     {isDropped && (
// // //                                                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginTop: '2px' }}>
// // //                                                                             <UserX size={10} /> {l.status}
// // //                                                                         </span>
// // //                                                                     )}
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>
// // //                                                                 <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // //                                                                     {l.cohortName}
// // //                                                                 </div>
// // //                                                                 <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // //                                                                     {l.programmeName}
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>
// // //                                                                 <div style={{ fontSize: '0.7rem', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // //                                                                     <div><strong style={{ color: '#0369a1' }}>KM:</strong> FA {l.formatives.completed}/{l.formatives.total} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span> SA {l.summatives.completed}/{l.summatives.total}</div>
// // //                                                                     <div><strong style={{ color: '#b45309' }}>PM:</strong> {l.practicals.completed}/{l.practicals.total} Observations</div>
// // //                                                                     <div><strong style={{ color: '#15803d' }}>WM:</strong> {l.workplaces.completed}/{l.workplaces.total} Logbooks</div>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td style={{ width: '130px' }}>
// // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                                                     <div style={{ flex: 1, height: '6px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// // //                                                                         <div style={{ width: `${l.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (l.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// // //                                                                     </div>
// // //                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDropped ? '#991b1b' : 'inherit' }}>{Math.round(l.overallProgress)}%</span>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                             <td>
// // //                                                                 {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #bbf7d0' }}>ISSUED</span>}
// // //                                                                 {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #fde68a' }}>PENDING MODERATION</span>}
// // //                                                                 {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #e2e8f0' }}>NOT READY</span>}
// // //                                                             </td>
// // //                                                             <td style={{ textAlign: 'right' }}>
// // //                                                                 <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
// // //                                                                     <button onClick={() => navigate(`/sor/${l.id}`)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// // //                                                                         <FileText size={12} /> View SoR
// // //                                                                     </button>
// // //                                                                     <button onClick={() => handleGeneratePoE(l.name)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// // //                                                                         <FileArchive size={12} /> Compile PoE
// // //                                                                     </button>
// // //                                                                 </div>
// // //                                                             </td>
// // //                                                         </tr>
// // //                                                     );
// // //                                                 })}
// // //                                             </tbody>
// // //                                         </table>
// // //                                     </div>

// // //                                     <div className="sm-pagination-bar">
// // //                                         <div>
// // //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedLearners.length)}</strong> of <strong>{searchedLearners.length}</strong> records
// // //                                         </div>
// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                                 <span>Rows per page:</span>
// // //                                                 <select
// // //                                                     className="sm-filter-select"
// // //                                                     value={itemsPerPage}
// // //                                                     onChange={(e) => setItemsPerPage(Number(e.target.value))}
// // //                                                 >
// // //                                                     <option value={10}>10</option>
// // //                                                     <option value={15}>15</option>
// // //                                                     <option value={25}>25</option>
// // //                                                     <option value={50}>50</option>
// // //                                                 </select>
// // //                                             </div>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="sm-page-btn"
// // //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// // //                                                     disabled={currentPage === 1}
// // //                                                 >
// // //                                                     <ChevronLeft size={14} /> Prev
// // //                                                 </button>
// // //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// // //                                                     {currentPage} / {totalPagesLearners}
// // //                                                 </span>
// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="sm-page-btn"
// // //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesLearners, p + 1))}
// // //                                                     disabled={currentPage >= totalPagesLearners}
// // //                                                 >
// // //                                                     Next <ChevronRight size={14} />
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>
// // //                                     </div>
// // //                                 </>
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* 3. GRIEVANCES */}
// // //                 {activeTab === 'grievances' && (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals & Grievance Register</h2>

// // //                         <div className="sm-table-container">
// // //                             <div style={{
// // //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// // //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// // //                             }}>
// // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // //                                         Active Grievances ({cohortFilteredGrievances.length})
// // //                                     </h3>
// // //                                 </div>
// // //                             </div>

// // //                             {paginatedGrievances.length === 0 ? (
// // //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// // //                                     <CheckCircle2 size={36} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
// // //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Active Grievances</h4>
// // //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>There are no appeals or complaints lodged for this cohort.</p>
// // //                                 </div>
// // //                             ) : (
// // //                                 <>
// // //                                     <div className="sm-table-scroll">
// // //                                         <table className="sm-table">
// // //                                             <thead>
// // //                                                 <tr>
// // //                                                     <th>Ref ID</th>
// // //                                                     <th>Learner</th>
// // //                                                     <th>Type</th>
// // //                                                     <th>Date Logged</th>
// // //                                                     <th>Description</th>
// // //                                                     <th style={{ textAlign: 'right' }}>Status</th>
// // //                                                 </tr>
// // //                                             </thead>
// // //                                             <tbody>
// // //                                                 {paginatedGrievances.map(g => (
// // //                                                     <tr key={g.id}>
// // //                                                         <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// // //                                                         <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// // //                                                         <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
// // //                                                         <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// // //                                                         <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // //                                                         <td style={{ textAlign: 'right' }}>
// // //                                                             {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
// // //                                                             {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
// // //                                                             {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
// // //                                                         </td>
// // //                                                     </tr>
// // //                                                 ))}
// // //                                             </tbody>
// // //                                         </table>
// // //                                     </div>

// // //                                     <div className="sm-pagination-bar">
// // //                                         <div>
// // //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> records
// // //                                         </div>
// // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="sm-page-btn"
// // //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// // //                                                     disabled={currentPage === 1}
// // //                                                 >
// // //                                                     <ChevronLeft size={14} /> Prev
// // //                                                 </button>
// // //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// // //                                                     {currentPage} / {totalPagesGrievances}
// // //                                                 </span>
// // //                                                 <button
// // //                                                     type="button"
// // //                                                     className="sm-page-btn"
// // //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))}
// // //                                                     disabled={currentPage >= totalPagesGrievances}
// // //                                                 >
// // //                                                     Next <ChevronRight size={14} />
// // //                                                 </button>
// // //                                             </div>
// // //                                         </div>
// // //                                     </div>
// // //                                 </>
// // //                             )}
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {/* 4. LEARNER POLICIES */}
// // //                 {activeTab === 'policies' && (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
// // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies & Code of Conduct</h2>
// // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

// // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
// // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // //                                 <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // //                                     <FileSignature size={20} />
// // //                                 </div>
// // //                                 <div style={{ flex: 1 }}>
// // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // //                                 <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // //                                     <AlertCircle size={20} />
// // //                                 </div>
// // //                                 <div style={{ flex: 1 }}>
// // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals & Assessment Policy</h3>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     );
// // // };


// // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // import {
// // // //     ShieldCheck, Download, Users, FileText, AlertCircle,
// // // //     FileCheck, Scale, FileSignature, BarChart3, Search,
// // // //     CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2,
// // // //     ChevronLeft, ChevronRight, Layers, UserX, Activity
// // // // } from 'lucide-react';
// // // // import { collection, onSnapshot, query, orderBy, where } from 'firebase/firestore';
// // // // import { db } from '../../../lib/firebase';
// // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // import { useStore } from '../../../store/useStore';
// // // // import Loader from '../../../components/common/Loader/Loader';

// // // // // --- Types ---
// // // // type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

// // // // interface LearnerRecord {
// // // //     id: string;
// // // //     userId: string;
// // // //     name: string;
// // // //     idNumber: string;
// // // //     cohortId: string;
// // // //     cohortName: string;
// // // //     programmeName: string;
// // // //     overallProgress: number;
// // // //     formatives: { completed: number; total: number };
// // // //     summatives: { completed: number; total: number };
// // // //     practicals: { completed: number; total: number };
// // // //     workplaces: { completed: number; total: number };
// // // //     sorStatus: 'issued' | 'pending' | 'not_ready';
// // // //     status: string;
// // // // }

// // // // interface GrievanceRecord {
// // // //     id: string;
// // // //     learnerName: string;
// // // //     cohortId: string;
// // // //     dateLogged: string;
// // // //     type: 'appeal' | 'complaint';
// // // //     status: 'open' | 'under_review' | 'resolved';
// // // //     description: string;
// // // // }

// // // // const INFORMAL_TYPES = ['practice', 'mock', 'informal', 'quiz', 'developmental activity', 'developmental'];

// // // // export const QmsComplianceDashboard: React.FC = () => {
// // // //     const toast = useToast();
// // // //     const [activeTab, setActiveTab] = useState<TabOption>('poe_vault');
// // // //     const [searchTerm, setSearchTerm] = useState('');
// // // //     const [isLoading, setIsLoading] = useState(true);

// // // //     // Pagination State
// // // //     const [currentPage, setCurrentPage] = useState(1);
// // // //     const [itemsPerPage, setItemsPerPage] = useState(15);

// // // //     const [selectedCohortId, setSelectedCohortId] = useState<string>('ALL');

// // // //     // Global Store Context
// // // //     const {
// // // //         learners: storeLearners,
// // // //         cohorts: storeCohorts,
// // // //         programmes: storeProgrammes,
// // // //         fetchProgrammes,
// // // //         fetchCohorts,
// // // //         fetchLearners
// // // //     } = useStore() as any;

// // // //     const [rawEnrollments, setRawEnrollments] = useState<any[]>([]);
// // // //     const [rawGrievances, setRawGrievances] = useState<GrievanceRecord[]>([]);
// // // //     const [rawSubmissions, setRawSubmissions] = useState<any[]>([]);
// // // //     const [policySignerIds, setPolicySignerIds] = useState<Set<string>>(new Set());

// // // //     // --- HYDRATE GLOBAL STORE IF EMPTY ---
// // // //     useEffect(() => {
// // // //         if (!storeProgrammes || storeProgrammes.length === 0) fetchProgrammes();
// // // //         if (!storeCohorts || storeCohorts.length === 0) fetchCohorts();
// // // //         if (!storeLearners || storeLearners.length === 0) fetchLearners();
// // // //     }, []);

// // // //     useEffect(() => {
// // // //         setCurrentPage(1);
// // // //     }, [searchTerm, selectedCohortId, itemsPerPage, activeTab]);

// // // //     // --- Firebase Subscriptions ---
// // // //     useEffect(() => {
// // // //         setIsLoading(true);

// // // //         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
// // // //             const raw = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // //             setRawEnrollments(raw);
// // // //         });

// // // //         let submissionsQuery = collection(db, 'learner_submissions') as any;
// // // //         if (selectedCohortId !== 'ALL') {
// // // //             submissionsQuery = query(submissionsQuery, where('cohortId', '==', selectedCohortId));
// // // //         }

// // // //         const unsubSubmissions = onSnapshot(submissionsQuery, (snap) => {
// // // //             const subs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// // // //             setRawSubmissions(subs);
// // // //         });

// // // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // // //         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
// // // //             const parsedGrievances: GrievanceRecord[] = [];
// // // //             snap.docs.forEach(doc => {
// // // //                 const data = doc.data();
// // // //                 const status = data.status || 'open';
// // // //                 parsedGrievances.push({
// // // //                     id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
// // // //                     learnerName: data.learnerName || 'Unknown Learner',
// // // //                     cohortId: data.cohortId || data.cohortRunId || '',
// // // //                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // // //                     type: data.type || 'appeal',
// // // //                     status: data.status === 'resolved' ? 'resolved' : (data.status === 'under_review' ? 'under_review' : 'open'),
// // // //                     description: data.reason || data.description || 'No description provided'
// // // //                 });
// // // //             });
// // // //             setRawGrievances(parsedGrievances);
// // // //         });

// // // //         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
// // // //             const signers = new Set(snap.docs.map(d => d.data().userId));
// // // //             setPolicySignerIds(signers as Set<string>);
// // // //             setTimeout(() => setIsLoading(false), 500);
// // // //         });

// // // //         return () => {
// // // //             unsubEnrollments();
// // // //             unsubSubmissions();
// // // //             unsubGrievances();
// // // //             unsubPolicies();
// // // //         };
// // // //     }, [selectedCohortId]);

// // // //     // --- Cross-Reference Mappings ---
// // // //     const enrichedLearners = useMemo(() => {
// // // //         return rawEnrollments.map((data): LearnerRecord => {
// // // //             const actualUserId = data.userId || data.learnerId || data.idNumber || '';
// // // //             const storeLearner = storeLearners?.find((l: any) => l.id === actualUserId || l.idNumber === actualUserId);

// // // //             const activeCohortId = data.cohortId || data.cohortRunId;
// // // //             const storeCohort = storeCohorts?.find((c: any) => c.id === activeCohortId);

// // // //             let storeProgramme = storeProgrammes?.find((p: any) =>
// // // //                 p.id === storeCohort?.programmeId ||
// // // //                 p.id === storeCohort?.qualificationId ||
// // // //                 p.id === data.programmeId
// // // //             );

// // // //             if (!storeProgramme && data.qualification?.saqaId) {
// // // //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.qualification.saqaId));
// // // //             }
// // // //             if (!storeProgramme && data.saqaId) {
// // // //                 storeProgramme = storeProgrammes?.find((p: any) => String(p.saqaId || '') === String(data.saqaId));
// // // //             }

// // // //             const mappedName = data.userName || data.learnerName || data.fullName || data.name || storeLearner?.fullName || storeLearner?.name || 'Unknown Learner';
// // // //             const mappedId = data.idNumber || actualUserId || 'N/A';
// // // //             const mappedCohort = data.cohortName || storeCohort?.name || activeCohortId || 'Unassigned Cohort';
// // // //             const mappedProgramme = storeProgramme?.name || 'Generic Framework';

// // // //             let totalBlueprintKM = 0;
// // // //             let totalBlueprintPM = 0;
// // // //             let totalBlueprintWM = 0;

// // // //             if (storeProgramme) {
// // // //                 if (Array.isArray(storeProgramme.knowledgeModules)) totalBlueprintKM = storeProgramme.knowledgeModules.length;
// // // //                 if (Array.isArray(storeProgramme.practicalModules)) totalBlueprintPM = storeProgramme.practicalModules.length;
// // // //                 if (Array.isArray(storeProgramme.workExperienceModules)) totalBlueprintWM = storeProgramme.workExperienceModules.length;

// // // //                 if (totalBlueprintKM === 0 && totalBlueprintPM === 0 && totalBlueprintWM === 0 && Array.isArray(storeProgramme.modules)) {
// // // //                     const flat = storeProgramme.modules;
// // // //                     totalBlueprintKM = flat.filter((m: any) => m.type === 'knowledge' || (m.moduleCode && m.moduleCode.includes('KM'))).length;
// // // //                     totalBlueprintPM = flat.filter((m: any) => m.type === 'practical' || (m.moduleCode && m.moduleCode.includes('PM'))).length;
// // // //                     totalBlueprintWM = flat.filter((m: any) => m.type === 'workplace' || (m.moduleCode && m.moduleCode.includes('WM'))).length;
// // // //                 }
// // // //             }

// // // //             let calculatedFA = 0;
// // // //             let calculatedSA = 0;
// // // //             let calculatedPM = 0;
// // // //             let calculatedWM = 0;

// // // //             let totalAssignedFA = 0;
// // // //             let totalAssignedSA = 0;
// // // //             let totalAssignedPM = 0;
// // // //             let totalAssignedWM = 0;

// // // //             const learnerSubs = rawSubmissions.filter(s =>
// // // //                 (actualUserId && s.learnerId === actualUserId) ||
// // // //                 (actualUserId && s.authUid === actualUserId) ||
// // // //                 (data.id && s.enrollmentId === data.id)
// // // //             );

// // // //             learnerSubs.forEach(s => {
// // // //                 const type = String(s.type || 'formative').toLowerCase();
// // // //                 const moduleType = String(s.moduleType || '').toLowerCase();
// // // //                 const subStatus = String(s.status || 'not_started').toLowerCase();

// // // //                 if (INFORMAL_TYPES.some(it => type.includes(it))) return;

// // // //                 const isDone = ['submitted', 'facilitator_reviewed', 'graded', 'moderated', 'appealed'].includes(subStatus);

// // // //                 const isKnowledge = moduleType === 'knowledge' || moduleType === '';
// // // //                 const isPractical = moduleType === 'practical' || type.includes('observation') || type.includes('pm');
// // // //                 const isWorkplace = moduleType === 'workplace' || type.includes('logbook') || type.includes('wm');

// // // //                 if (isKnowledge) {
// // // //                     if (type.includes('formative') || type.includes('fa')) {
// // // //                         totalAssignedFA++;
// // // //                         if (isDone) calculatedFA++;
// // // //                     } else if (type.includes('summative') || type.includes('sa')) {
// // // //                         totalAssignedSA++;
// // // //                         if (isDone) calculatedSA++;
// // // //                     }
// // // //                 } else if (isPractical) {
// // // //                     totalAssignedPM++;
// // // //                     if (isDone) calculatedPM++;
// // // //                 } else if (isWorkplace) {
// // // //                     totalAssignedWM++;
// // // //                     if (isDone) calculatedWM++;
// // // //                 }
// // // //             });

// // // //             const ceilingFA = Math.max(totalBlueprintKM, totalAssignedFA);
// // // //             const ceilingSA = Math.max(totalBlueprintKM, totalAssignedSA);
// // // //             const ceilingPM = Math.max(totalBlueprintPM, totalAssignedPM);
// // // //             const ceilingWM = Math.max(totalBlueprintWM, totalAssignedWM);

// // // //             const totalRequiredTasks = ceilingFA + ceilingSA + ceilingPM + ceilingWM;
// // // //             const totalCompletedTasks = calculatedFA + calculatedSA + calculatedPM + calculatedWM;

// // // //             const dynamicProgress = totalRequiredTasks > 0 ? Math.round((totalCompletedTasks / totalRequiredTasks) * 100) : 0;

// // // //             return {
// // // //                 id: data.id,
// // // //                 userId: actualUserId,
// // // //                 name: mappedName,
// // // //                 idNumber: mappedId,
// // // //                 cohortId: activeCohortId || 'unassigned',
// // // //                 cohortName: mappedCohort,
// // // //                 programmeName: mappedProgramme,
// // // //                 overallProgress: dynamicProgress,
// // // //                 formatives: { completed: calculatedFA, total: ceilingFA },
// // // //                 summatives: { completed: calculatedSA, total: ceilingSA },
// // // //                 practicals: { completed: calculatedPM, total: ceilingPM },
// // // //                 workplaces: { completed: calculatedWM, total: ceilingWM },
// // // //                 sorStatus: data.sorStatus || 'pending',
// // // //                 status: data.status || 'active'
// // // //             };
// // // //         });

// // // //     }, [rawEnrollments, rawSubmissions, storeLearners, storeCohorts, storeProgrammes]);

// // // //     // Apply Filters
// // // //     const cohortFilteredLearners = useMemo(() => {
// // // //         if (selectedCohortId === 'ALL') return enrichedLearners;
// // // //         return enrichedLearners.filter(l => l.cohortId === selectedCohortId);
// // // //     }, [enrichedLearners, selectedCohortId]);

// // // //     const cohortFilteredGrievances = useMemo(() => {
// // // //         if (selectedCohortId === 'ALL') return rawGrievances;
// // // //         return rawGrievances.filter(g => g.cohortId === selectedCohortId);
// // // //     }, [rawGrievances, selectedCohortId]);

// // // //     const searchedLearners = useMemo(() => {
// // // //         if (!searchTerm.trim()) return cohortFilteredLearners;
// // // //         const lowerSearch = searchTerm.toLowerCase();
// // // //         return cohortFilteredLearners.filter(l =>
// // // //             (l.name && l.name.toLowerCase().includes(lowerSearch)) ||
// // // //             (l.idNumber && l.idNumber.toLowerCase().includes(lowerSearch)) ||
// // // //             (l.cohortName && l.cohortName.toLowerCase().includes(lowerSearch))
// // // //         );
// // // //     }, [cohortFilteredLearners, searchTerm]);

// // // //     // Compute Dynamic Stats
// // // //     const displayStats = useMemo(() => {
// // // //         let active = 0;
// // // //         let grad = 0;
// // // //         let drop = 0;
// // // //         let signedPolicyCount = 0;

// // // //         cohortFilteredLearners.forEach(l => {
// // // //             const status = l.status.toLowerCase();
// // // //             if (status === 'active') active++;
// // // //             else if (status === 'graduated' || status === 'competent') grad++;
// // // //             else if (status === 'dropped' || status === 'archived' || status === 'withdrawn' || status === 'terminated') drop++;

// // // //             if (l.userId && policySignerIds.has(l.userId)) {
// // // //                 signedPolicyCount++;
// // // //             }
// // // //         });

// // // //         const total = cohortFilteredLearners.length;
// // // //         const retentionRate = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;

// // // //         const baseForPolicies = (active + grad) > 0 ? (active + grad) : (total > 0 ? total : 1);
// // // //         const policySignedPct = total === 0 ? 0 : Math.min(100, Math.round((signedPolicyCount / baseForPolicies) * 100));

// // // //         const activeGrievances = cohortFilteredGrievances.filter(g => g.status === 'open' || g.status === 'under_review').length;

// // // //         return {
// // // //             totalEnrolled: total,
// // // //             activeTraining: active,
// // // //             graduated: grad,
// // // //             droppedOut: drop,
// // // //             retentionRate,
// // // //             activeGrievances,
// // // //             policySignedPct
// // // //         };
// // // //     }, [cohortFilteredLearners, cohortFilteredGrievances, policySignerIds]);

// // // //     const totalPagesLearners = Math.max(1, Math.ceil(searchedLearners.length / itemsPerPage));
// // // //     const paginatedLearners = searchedLearners.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// // // //     const totalPagesGrievances = Math.max(1, Math.ceil(cohortFilteredGrievances.length / itemsPerPage));
// // // //     const paginatedGrievances = cohortFilteredGrievances.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

// // // //     const handleExportNLRD = () => {
// // // //         toast.success(`Compiling NLRD Export for ${selectedCohortId === 'ALL' ? 'All Cohorts' : 'selected cohort'}. The CSV will download shortly.`);
// // // //     };

// // // //     const handleGeneratePoE = (learnerName: string) => {
// // // //         toast.info(`Compiling Master Portfolio of Evidence (PoE) for ${learnerName}...`);
// // // //     };

// // // //     if (isLoading) {
// // // //         return (
// // // //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
// // // //                 {/* <Loader2 size={36} className="lfm-spin" style={{ marginBottom: '12px' }} />
// // // //                 <span style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                     Syncing Compliance Ledger...
// // // //                 </span> */}
// // // //                 <Loader message='Syncing Compliance Ledger...' />
// // // //             </div>
// // // //         );
// // // //     }

// // // //     return (
// // // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--mlab-bg, #f8fafc)', minHeight: '100vh' }}>

// // // //             {/* EXACT STYLING REPLICATED FROM MENTOR DASHBOARD */}
// // // //             <style>{`
// // // //                 .sm-table-container { 
// // // //                     background: #fff; 
// // // //                     border: 1px solid var(--mlab-border); 
// // // //                     border-top: 3px solid var(--mlab-blue); 
// // // //                     overflow: hidden; 
// // // //                     border-radius: 4px; 
// // // //                     display: flex; 
// // // //                     flex-direction: column; 
// // // //                     flex: 1; /* Absorbs remaining viewport height */
// // // //                     min-height: 400px;
// // // //                 }
// // // //                 .sm-table-scroll { 
// // // //                     flex: 1; 
// // // //                     overflow-y: auto; 
// // // //                     overflow-x: auto; 
// // // //                     display: flex; 
// // // //                     flex-direction: column; 
// // // //                 }
// // // //                 .sm-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 0.85rem; text-align: left; margin: 0; }
                
// // // //                 /* 🚀 TABLE HEADERS STICKY FIX */
// // // //                 .sm-table th { 
// // // //                     background: var(--mlab-midnight, #0f172a); 
// // // //                     padding: 12px 16px; 
// // // //                     font-family: var(--font-heading); 
// // // //                     text-transform: uppercase; 
// // // //                     color: white; 
// // // //                     border-bottom: 2px solid var(--mlab-green, #16a34a); 
// // // //                     font-size: 0.8rem; 
// // // //                     letter-spacing: 0.05em; 
// // // //                     position: sticky; 
// // // //                     top: 0; 
// // // //                     z-index: 10; 
// // // //                     box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
// // // //                 }
                
// // // //                 .sm-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: middle; }
// // // //                 .sm-table tr:hover td { background-color: #f8fafc; }
                
// // // //                 .sm-pagination-bar { 
// // // //                     display: flex; 
// // // //                     align-items: center; 
// // // //                     justify-content: space-between; 
// // // //                     padding: 10px 16px; 
// // // //                     background: #f8fafc; 
// // // //                     border-top: 1px solid #cbd5e1; 
// // // //                     font-size: 0.8rem; 
// // // //                     color: #475569; 
// // // //                     flex-wrap: wrap; 
// // // //                     gap: 10px;
// // // //                     margin-top: auto; 
// // // //                 }
// // // //                 .sm-page-btn { background: #ffffff; border: 1px solid #cbd5e1; padding: 4px 10px; font-size: 0.75rem; font-weight: 700; color: var(--mlab-blue); border-radius: 4px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s; }
// // // //                 .sm-page-btn:hover:not(:disabled) { background: #f1f5f9; border-color: #94a3b8; }
// // // //                 .sm-page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
// // // //                 .sm-filter-select { height: 28px; border: 1px solid var(--mlab-border); background: #ffffff; padding: 0 6px; font-size: 0.75rem; color: var(--mlab-blue); font-weight: 600; outline: none; border-radius: 4px; }
// // // //             `}</style>

// // // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--mlab-midnight)', color: 'white', padding: '24px', borderRadius: '0px', borderLeft: '6px solid #16a34a', flexWrap: 'wrap', gap: '16px' }}>
// // // //                 <div>
// // // //                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <ShieldCheck size={14} /> Quality Management System (QMS)
// // // //                     </div>
// // // //                     <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // //                         SETA & QCTO Compliance Dashboard
// // // //                     </h1>
// // // //                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '600px', lineHeight: 1.5 }}>
// // // //                         Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
// // // //                     </p>
// // // //                 </div>
// // // //                 <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
// // // //                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.2)' }}>
// // // //                         <Layers size={14} color="#4ade80" />
// // // //                         <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>Filter Cohort:</span>
// // // //                         <select
// // // //                             value={selectedCohortId}
// // // //                             onChange={(e) => setSelectedCohortId(e.target.value)}
// // // //                             style={{
// // // //                                 background: 'transparent', color: 'white', border: 'none',
// // // //                                 fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
// // // //                                 outline: 'none', maxWidth: '240px'
// // // //                             }}
// // // //                         >
// // // //                             <option value="ALL" style={{ color: 'black' }}>All Cohorts (Global View)</option>
// // // //                             {storeCohorts?.map((c: any) => (
// // // //                                 <option key={c.id} value={c.id} style={{ color: 'black' }}>
// // // //                                     {c.name}
// // // //                                 </option>
// // // //                             ))}
// // // //                         </select>
// // // //                     </div>

// // // //                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <Download size={16} /> Export NLRD Batch
// // // //                     </button>
// // // //                 </div>
// // // //             </div>

// // // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
// // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <Users size={14} /> Learner Retention Rate
// // // //                     </div>
// // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.retentionRate}%</div>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {displayStats.totalEnrolled.toLocaleString()} enrollments</div>
// // // //                 </div>
// // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <FileCheck size={14} /> Graduated Learners
// // // //                     </div>
// // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.graduated.toLocaleString()}</div>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
// // // //                 </div>
// // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <Scale size={14} /> Active Grievances & Appeals
// // // //                     </div>
// // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.activeGrievances}</div>
// // // //                     <div style={{ fontSize: '0.75rem', color: displayStats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
// // // //                         {displayStats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
// // // //                     </div>
// // // //                 </div>
// // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                         <FileSignature size={14} /> Policy Acknowledgment
// // // //                     </div>
// // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{displayStats.policySignedPct}%</div>
// // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
// // // //                 </div>
// // // //             </div>

// // // //             {/* 🚀 STICKY TABS WRAPPER */}
// // // //             <div style={{
// // // //                 display: 'flex',
// // // //                 background: 'white',
// // // //                 border: '1px solid #cbd5e1',
// // // //                 padding: '0 8px',
// // // //                 flexWrap: 'wrap',
// // // //                 position: 'sticky',
// // // //                 top: 0,
// // // //                 zIndex: 40,
// // // //                 boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)'
// // // //             }}>
// // // //                 {[
// // // //                     { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
// // // //                     { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // // //                     { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// // // //                     { id: 'policies', label: 'Learner Policies', icon: FileSignature }
// // // //                 ].map(tab => {
// // // //                     const Icon = tab.icon;
// // // //                     const isActive = activeTab === tab.id;
// // // //                     return (
// // // //                         <button
// // // //                             key={tab.id}
// // // //                             onClick={() => setActiveTab(tab.id as TabOption)}
// // // //                             style={{
// // // //                                 padding: '16px 20px', background: 'transparent', border: 'none',
// // // //                                 borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// // // //                                 color: isActive ? 'var(--mlab-blue)' : '#64748b',
// // // //                                 fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
// // // //                                 textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
// // // //                                 outline: 'none'
// // // //                             }}
// // // //                         >
// // // //                             <Icon size={16} /> {tab.label}
// // // //                         </button>
// // // //                     );
// // // //                 })}
// // // //             </div>

// // // //             <div className="qcto-card" style={{ padding: '24px', background: 'white', flex: 1, display: 'flex', flexDirection: 'column' }}>

// // // //                 {/* 1. MIS OVERVIEW */}
// // // //                 {activeTab === 'mis_overview' && (
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
// // // //                         <div>
// // // //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
// // // //                             <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>
// // // //                         </div>

// // // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
// // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
// // // //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{displayStats.totalEnrolled.toLocaleString()}</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{displayStats.activeTraining.toLocaleString()}</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{displayStats.graduated.toLocaleString()}</strong></div>
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{displayStats.droppedOut.toLocaleString()}</strong></div>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
// // // //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
// // // //                                 <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><FileText size={14} /> Download Quarterly SETA Report (PDF)</button>
// // // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><BarChart3 size={14} /> Download Learner Details Ratio (Excel)</button>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {/* 2. POE VAULT */}
// // // //                 {activeTab === 'poe_vault' && (
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Records & Evidence Vault</h2>

// // // //                         <div className="sm-table-container">
// // // //                             <div style={{
// // // //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// // // //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// // // //                             }}>
// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                                         Learner Records ({searchedLearners.length})
// // // //                                     </h3>
// // // //                                 </div>

// // // //                                 <div style={{ position: 'relative', width: '280px' }}>
// // // //                                     <Search size={14} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
// // // //                                     <input
// // // //                                         type="text"
// // // //                                         value={searchTerm}
// // // //                                         onChange={e => setSearchTerm(e.target.value)}
// // // //                                         placeholder="Search ID number or name..."
// // // //                                         style={{ paddingLeft: '32px', borderRadius: '4px', border: 'none', width: '100%', fontSize: '0.8rem', height: '34px', background: '#fff', color: 'var(--mlab-blue)', outline: 'none' }}
// // // //                                     />
// // // //                                 </div>
// // // //                             </div>

// // // //                             {paginatedLearners.length === 0 ? (
// // // //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// // // //                                     <SearchX size={36} color="var(--mlab-border)" style={{ margin: '0 auto 1rem' }} />
// // // //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Learner Records Match</h4>
// // // //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>Adjust your search or cohort filter to find evidence vaults.</p>
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <>
// // // //                                     <div className="sm-table-scroll">
// // // //                                         <table className="sm-table">
// // // //                                             <thead>
// // // //                                                 <tr>
// // // //                                                     <th>Learner Details</th>
// // // //                                                     <th>Cohort &amp; Qualification</th>
// // // //                                                     <th>Curriculum Matrix</th>
// // // //                                                     <th>Overall Progress</th>
// // // //                                                     <th>Statement of Results</th>
// // // //                                                     <th style={{ textAlign: 'right' }}>Audit Action</th>
// // // //                                                 </tr>
// // // //                                             </thead>
// // // //                                             <tbody>
// // // //                                                 {paginatedLearners.map(l => {
// // // //                                                     const isDropped = ['dropped', 'withdrawn', 'terminated'].includes(l.status.toLowerCase());

// // // //                                                     return (
// // // //                                                         <tr key={l.id} style={{ background: isDropped ? '#fef2f2' : 'white', opacity: isDropped ? 0.85 : 1 }}>
// // // //                                                             <td>
// // // //                                                                 <strong style={{ display: 'block', fontSize: '0.85rem', color: isDropped ? '#991b1b' : '#0f172a' }}>{l.name}</strong>
// // // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
// // // //                                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
// // // //                                                                     {isDropped && (
// // // //                                                                         <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.6rem', fontWeight: 800, background: '#ef4444', color: 'white', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', marginTop: '2px' }}>
// // // //                                                                             <UserX size={10} /> {l.status}
// // // //                                                                         </span>
// // // //                                                                     )}
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>
// // // //                                                                 <div style={{ fontSize: '0.8rem', color: '#334155', fontWeight: 700, maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // // //                                                                     {l.cohortName}
// // // //                                                                 </div>
// // // //                                                                 <div style={{ fontSize: '0.7rem', color: '#64748b', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // // //                                                                     {l.programmeName}
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>
// // // //                                                                 <div style={{ fontSize: '0.7rem', color: '#0f172a', display: 'flex', flexDirection: 'column', gap: '4px' }}>
// // // //                                                                     <div><strong style={{ color: '#0369a1' }}>KM:</strong> FA {l.formatives.completed}/{l.formatives.total} <span style={{ color: '#cbd5e1', margin: '0 4px' }}>|</span> SA {l.summatives.completed}/{l.summatives.total}</div>
// // // //                                                                     <div><strong style={{ color: '#b45309' }}>PM:</strong> {l.practicals.completed}/{l.practicals.total} Observations</div>
// // // //                                                                     <div><strong style={{ color: '#15803d' }}>WM:</strong> {l.workplaces.completed}/{l.workplaces.total} Logbooks</div>
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td style={{ width: '130px' }}>
// // // //                                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // //                                                                     <div style={{ flex: 1, height: '6px', background: isDropped ? '#fca5a5' : '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
// // // //                                                                         <div style={{ width: `${l.overallProgress}%`, height: '100%', background: isDropped ? '#dc2626' : (l.overallProgress >= 100 ? '#16a34a' : '#0284c7') }} />
// // // //                                                                     </div>
// // // //                                                                     <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isDropped ? '#991b1b' : 'inherit' }}>{Math.round(l.overallProgress)}%</span>
// // // //                                                                 </div>
// // // //                                                             </td>
// // // //                                                             <td>
// // // //                                                                 {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #bbf7d0' }}>ISSUED</span>}
// // // //                                                                 {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #fde68a' }}>PENDING MODERATION</span>}
// // // //                                                                 {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800, textTransform: 'uppercase', borderRadius: '4px', border: '1px solid #e2e8f0' }}>NOT READY</span>}
// // // //                                                             </td>
// // // //                                                             <td style={{ textAlign: 'right' }}>
// // // //                                                                 <button onClick={() => handleGeneratePoE(l.name)} style={{ background: isDropped ? 'white' : '#f0f9ff', color: isDropped ? '#475569' : '#0284c7', border: `1px solid ${isDropped ? '#cbd5e1' : '#bae6fd'}`, padding: '6px 12px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
// // // //                                                                     <FileArchive size={12} /> Compile PoE
// // // //                                                                 </button>
// // // //                                                             </td>
// // // //                                                         </tr>
// // // //                                                     );
// // // //                                                 })}
// // // //                                             </tbody>
// // // //                                         </table>
// // // //                                     </div>

// // // //                                     <div className="sm-pagination-bar">
// // // //                                         <div>
// // // //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, searchedLearners.length)}</strong> of <strong>{searchedLearners.length}</strong> records
// // // //                                         </div>
// // // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                                                 <span>Rows per page:</span>
// // // //                                                 <select
// // // //                                                     className="sm-filter-select"
// // // //                                                     value={itemsPerPage}
// // // //                                                     onChange={(e) => setItemsPerPage(Number(e.target.value))}
// // // //                                                 >
// // // //                                                     <option value={10}>10</option>
// // // //                                                     <option value={15}>15</option>
// // // //                                                     <option value={25}>25</option>
// // // //                                                     <option value={50}>50</option>
// // // //                                                 </select>
// // // //                                             </div>
// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 <button
// // // //                                                     type="button"
// // // //                                                     className="sm-page-btn"
// // // //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// // // //                                                     disabled={currentPage === 1}
// // // //                                                 >
// // // //                                                     <ChevronLeft size={14} /> Prev
// // // //                                                 </button>
// // // //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// // // //                                                     {currentPage} / {totalPagesLearners}
// // // //                                                 </span>
// // // //                                                 <button
// // // //                                                     type="button"
// // // //                                                     className="sm-page-btn"
// // // //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesLearners, p + 1))}
// // // //                                                     disabled={currentPage >= totalPagesLearners}
// // // //                                                 >
// // // //                                                     Next <ChevronRight size={14} />
// // // //                                                 </button>
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </>
// // // //                             )}
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {/* 3. GRIEVANCES */}
// // // //                 {activeTab === 'grievances' && (
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0 }}>
// // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals & Grievance Register</h2>

// // // //                         <div className="sm-table-container">
// // // //                             <div style={{
// // // //                                 padding: '14px 16px', background: 'var(--mlab-blue)', color: '#fff', display: 'flex',
// // // //                                 justifyContent: 'space-between', alignItems: 'center', borderBottom: '5px solid var(--mlab-green)', flexWrap: 'wrap', gap: '10px'
// // // //                             }}>
// // // //                                 <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
// // // //                                     <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
// // // //                                         Active Grievances ({cohortFilteredGrievances.length})
// // // //                                     </h3>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {paginatedGrievances.length === 0 ? (
// // // //                                 <div style={{ padding: '3.5rem', textAlign: 'center', color: 'var(--mlab-grey)', background: '#fff', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
// // // //                                     <CheckCircle2 size={36} color="var(--mlab-green)" style={{ margin: '0 auto 1rem' }} />
// // // //                                     <h4 style={{ margin: '0 0 4px 0', color: 'var(--mlab-blue)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>No Active Grievances</h4>
// // // //                                     <p style={{ margin: 0, fontSize: '0.82rem' }}>There are no appeals or complaints lodged for this cohort.</p>
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <>
// // // //                                     <div className="sm-table-scroll">
// // // //                                         <table className="sm-table">
// // // //                                             <thead>
// // // //                                                 <tr>
// // // //                                                     <th>Ref ID</th>
// // // //                                                     <th>Learner</th>
// // // //                                                     <th>Type</th>
// // // //                                                     <th>Date Logged</th>
// // // //                                                     <th>Description</th>
// // // //                                                     <th style={{ textAlign: 'right' }}>Status</th>
// // // //                                                 </tr>
// // // //                                             </thead>
// // // //                                             <tbody>
// // // //                                                 {paginatedGrievances.map(g => (
// // // //                                                     <tr key={g.id}>
// // // //                                                         <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// // // //                                                         <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// // // //                                                         <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
// // // //                                                         <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// // // //                                                         <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // // //                                                         <td style={{ textAlign: 'right' }}>
// // // //                                                             {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fecaca', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
// // // //                                                             {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
// // // //                                                             {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, borderRadius: '4px', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
// // // //                                                         </td>
// // // //                                                     </tr>
// // // //                                                 ))}
// // // //                                             </tbody>
// // // //                                         </table>
// // // //                                     </div>

// // // //                                     <div className="sm-pagination-bar">
// // // //                                         <div>
// // // //                                             Showing <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> to <strong>{Math.min(currentPage * itemsPerPage, cohortFilteredGrievances.length)}</strong> of <strong>{cohortFilteredGrievances.length}</strong> records
// // // //                                         </div>
// // // //                                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
// // // //                                             <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
// // // //                                                 <button
// // // //                                                     type="button"
// // // //                                                     className="sm-page-btn"
// // // //                                                     onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
// // // //                                                     disabled={currentPage === 1}
// // // //                                                 >
// // // //                                                     <ChevronLeft size={14} /> Prev
// // // //                                                 </button>
// // // //                                                 <span style={{ padding: '0 8px', fontWeight: 700, color: 'var(--mlab-blue)' }}>
// // // //                                                     {currentPage} / {totalPagesGrievances}
// // // //                                                 </span>
// // // //                                                 <button
// // // //                                                     type="button"
// // // //                                                     className="sm-page-btn"
// // // //                                                     onClick={() => setCurrentPage(p => Math.min(totalPagesGrievances, p + 1))}
// // // //                                                     disabled={currentPage >= totalPagesGrievances}
// // // //                                                 >
// // // //                                                     Next <ChevronRight size={14} />
// // // //                                                 </button>
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     </div>
// // // //                                 </>
// // // //                             )}
// // // //                         </div>
// // // //                     </div>
// // // //                 )}

// // // //                 {/* 4. LEARNER POLICIES */}
// // // //                 {activeTab === 'policies' && (
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
// // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies & Code of Conduct</h2>
// // // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

// // // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
// // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // // //                                 <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // // //                                     <FileSignature size={20} />
// // // //                                 </div>
// // // //                                 <div style={{ flex: 1 }}>
// // // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
// // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // // //                                 <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // // //                                     <AlertCircle size={20} />
// // // //                                 </div>
// // // //                                 <div style={{ flex: 1 }}>
// // // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals & Assessment Policy</h3>
// // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${displayStats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{displayStats.policySignedPct}% Signed</span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>
// // // //                         </div>
// // // //                     </div>
// // // //                 )}
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };


// // // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // // import {
// // // // //     ShieldCheck, Download, Users, FileText, AlertCircle,
// // // // //     FileCheck, Scale, FileSignature, BarChart3, Search,
// // // // //     CheckCircle2, AlertTriangle, FileArchive, SearchX, Loader2
// // // // // } from 'lucide-react';
// // // // // import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
// // // // // import { db } from '../../../lib/firebase';
// // // // // import { useToast } from '../../../components/common/Toast/Toast';
// // // // // import Loader from '../../../components/common/Loader/Loader';

// // // // // // --- Types ---
// // // // // type TabOption = 'mis_overview' | 'poe_vault' | 'grievances' | 'policies';

// // // // // interface LearnerRecord {
// // // // //     id: string;
// // // // //     name: string;
// // // // //     idNumber: string;
// // // // //     cohortName: string;
// // // // //     progress: number;
// // // // //     sorStatus: 'issued' | 'pending' | 'not_ready';
// // // // // }

// // // // // interface GrievanceRecord {
// // // // //     id: string;
// // // // //     learnerName: string;
// // // // //     dateLogged: string;
// // // // //     type: 'appeal' | 'complaint';
// // // // //     status: 'open' | 'under_review' | 'resolved';
// // // // //     description: string;
// // // // // }

// // // // // interface QmsStats {
// // // // //     totalEnrolled: number;
// // // // //     activeTraining: number;
// // // // //     graduated: number;
// // // // //     droppedOut: number;
// // // // //     retentionRate: number;
// // // // //     activeGrievances: number;
// // // // //     policySignedPct: number;
// // // // // }

// // // // // export const QmsComplianceDashboard: React.FC = () => {
// // // // //     const toast = useToast();
// // // // //     const [activeTab, setActiveTab] = useState<TabOption>('mis_overview');
// // // // //     const [searchTerm, setSearchTerm] = useState('');
// // // // //     const [isLoading, setIsLoading] = useState(true);

// // // // //     // --- Firebase State ---
// // // // //     const [learners, setLearners] = useState<LearnerRecord[]>([]);
// // // // //     const [grievances, setGrievances] = useState<GrievanceRecord[]>([]);
// // // // //     const [stats, setStats] = useState<QmsStats>({
// // // // //         totalEnrolled: 0,
// // // // //         activeTraining: 0,
// // // // //         graduated: 0,
// // // // //         droppedOut: 0,
// // // // //         retentionRate: 0,
// // // // //         activeGrievances: 0,
// // // // //         policySignedPct: 0
// // // // //     });

// // // // //     // --- Firebase Subscriptions ---
// // // // //     useEffect(() => {
// // // // //         setIsLoading(true);

// // // // //         // 1. Listen to Enrollments / Learner Profiles
// // // // //         const unsubEnrollments = onSnapshot(collection(db, 'enrollments'), (snap) => {
// // // // //             let total = 0;
// // // // //             let active = 0;
// // // // //             let grad = 0;
// // // // //             let drop = 0;

// // // // //             const parsedLearners: LearnerRecord[] = [];

// // // // //             snap.docs.forEach(doc => {
// // // // //                 const data = doc.data();
// // // // //                 const status = (data.status || 'active').toLowerCase();

// // // // //                 total++;
// // // // //                 if (status === 'active') active++;
// // // // //                 else if (status === 'graduated' || status === 'competent') grad++;
// // // // //                 else if (status === 'dropped' || status === 'archived') drop++;

// // // // //                 parsedLearners.push({
// // // // //                     id: doc.id,
// // // // //                     name: data.userName || data.learnerName || 'Unknown Learner',
// // // // //                     idNumber: data.idNumber || data.learnerId || 'N/A',
// // // // //                     cohortName: data.cohortName || 'Unassigned Cohort',
// // // // //                     progress: data.progress || data.watchPct || 0,
// // // // //                     sorStatus: data.sorStatus || 'pending'
// // // // //                 });
// // // // //             });

// // // // //             const retention = total > 0 ? Math.round(((total - drop) / total) * 100) : 0;

// // // // //             setStats(prev => ({
// // // // //                 ...prev,
// // // // //                 totalEnrolled: total,
// // // // //                 activeTraining: active,
// // // // //                 graduated: grad,
// // // // //                 droppedOut: drop,
// // // // //                 retentionRate: retention
// // // // //             }));

// // // // //             setLearners(parsedLearners);
// // // // //         });

// // // // //         // 2. Listen to Grievances & Appeals
// // // // //         const qGrievances = query(collection(db, 'assessment_appeals'), orderBy('createdAt', 'desc'));
// // // // //         const unsubGrievances = onSnapshot(qGrievances, (snap) => {
// // // // //             const parsedGrievances: GrievanceRecord[] = [];
// // // // //             let activeCount = 0;

// // // // //             snap.docs.forEach(doc => {
// // // // //                 const data = doc.data();
// // // // //                 const status = data.status || 'open';

// // // // //                 if (status === 'open' || status === 'under_review' || status === 'pending') {
// // // // //                     activeCount++;
// // // // //                 }

// // // // //                 parsedGrievances.push({
// // // // //                     id: data.referenceId || doc.id.substring(0, 8).toUpperCase(),
// // // // //                     learnerName: data.learnerName || 'Unknown Learner',
// // // // //                     dateLogged: data.createdAt?.toDate ? data.createdAt.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
// // // // //                     type: data.type || 'appeal',
// // // // //                     status: status === 'resolved' ? 'resolved' : (status === 'under_review' ? 'under_review' : 'open'),
// // // // //                     description: data.reason || data.description || 'No description provided'
// // // // //                 });
// // // // //             });

// // // // //             setStats(prev => ({ ...prev, activeGrievances: activeCount }));
// // // // //             setGrievances(parsedGrievances);
// // // // //         });

// // // // //         // 3. Listen to Policy Signoffs
// // // // //         const unsubPolicies = onSnapshot(collection(db, 'learner_policy_signoffs'), (snap) => {
// // // // //             const uniqueSigners = new Set(snap.docs.map(d => d.data().userId)).size;

// // // // //             setStats(prev => {
// // // // //                 // Calculate percentage based on current active learners
// // // // //                 const baseCount = prev.activeTraining > 0 ? prev.activeTraining : (prev.totalEnrolled > 0 ? prev.totalEnrolled : 1);
// // // // //                 const pct = Math.min(100, Math.round((uniqueSigners / baseCount) * 100));
// // // // //                 return { ...prev, policySignedPct: pct };
// // // // //             });

// // // // //             setIsLoading(false);
// // // // //         });

// // // // //         return () => {
// // // // //             unsubEnrollments();
// // // // //             unsubGrievances();
// // // // //             unsubPolicies();
// // // // //         };
// // // // //     }, []);

// // // // //     // --- Handlers & Computed Data ---
// // // // //     const filteredLearners = useMemo(() => {
// // // // //         if (!searchTerm.trim()) return learners;
// // // // //         const lowerSearch = searchTerm.toLowerCase();
// // // // //         return learners.filter(l =>
// // // // //             l.name.toLowerCase().includes(lowerSearch) ||
// // // // //             l.idNumber.toLowerCase().includes(lowerSearch) ||
// // // // //             l.cohortName.toLowerCase().includes(lowerSearch)
// // // // //         );
// // // // //     }, [learners, searchTerm]);

// // // // //     const handleExportNLRD = () => {
// // // // //         toast.success('Compiling NLRD Export. The CSV will download shortly.');
// // // // //         // Implementation for CSV generation goes here
// // // // //     };

// // // // //     const handleGeneratePoE = (learnerName: string) => {
// // // // //         toast.info(`Compiling Master Portfolio of Evidence (PoE) for ${learnerName}...`);
// // // // //         // Implementation for PDF/ZIP generation goes here
// // // // //     };

// // // // //     if (isLoading) {
// // // // //         return (
// // // // //             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--mlab-blue)' }}>
// // // // //                 {/* <Loader2 size={36} className="lfm-spin" style={{ marginBottom: '12px' }} />
// // // // //                 <span style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // // //                     Syncing Compliance Ledger...
// // // // //                 </span> */}
// // // // //                 <Loader message='Syncing Compliance Ledger...' />
// // // // //             </div>
// // // // //         );
// // // // //     }

// // // // //     return (
// // // // //         <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '24px', background: 'var(--mlab-bg, #f8fafc)', minHeight: '100vh' }}>

// // // // //             {/* Header */}
// // // // //             <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--mlab-midnight)', color: 'white', padding: '24px', borderRadius: '0px', borderLeft: '6px solid #16a34a' }}>
// // // // //                 <div>
// // // // //                     <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <ShieldCheck size={14} /> Quality Management System (QMS)
// // // // //                     </div>
// // // // //                     <h1 style={{ margin: '0 0 8px 0', fontSize: '1.5rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
// // // // //                         SETA & QCTO Compliance Dashboard
// // // // //                     </h1>
// // // // //                     <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8', maxWidth: '600px', lineHeight: 1.5 }}>
// // // // //                         Manage Management Information System (MIS) reporting, compile learner Portfolios of Evidence (PoE), and oversee institutional governance policies required for national accreditation audits.
// // // // //                     </p>
// // // // //                 </div>
// // // // //                 <div style={{ display: 'flex', gap: '12px' }}>
// // // // //                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--primary" style={{ background: '#16a34a', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <Download size={16} /> Export NLRD Batch (CSV)
// // // // //                     </button>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* KPI Cards */}
// // // // //             <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
// // // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #0ea5e9' }}>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <Users size={14} /> Learner Retention Rate
// // // // //                     </div>
// // // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{stats.retentionRate}%</div>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Based on {stats.totalEnrolled} total enrollments</div>
// // // // //                 </div>
// // // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #8b5cf6' }}>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <FileCheck size={14} /> Graduated Learners
// // // // //                     </div>
// // // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{stats.graduated}</div>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>Competent Records Issued</div>
// // // // //                 </div>
// // // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #f59e0b' }}>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <Scale size={14} /> Active Grievances & Appeals
// // // // //                     </div>
// // // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{stats.activeGrievances}</div>
// // // // //                     <div style={{ fontSize: '0.75rem', color: stats.activeGrievances > 0 ? '#d97706' : '#64748b', fontWeight: 700 }}>
// // // // //                         {stats.activeGrievances > 0 ? 'Requires attention' : 'All clear'}
// // // // //                     </div>
// // // // //                 </div>
// // // // //                 <div className="qcto-card" style={{ padding: '20px', borderTop: '4px solid #14b8a6' }}>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                         <FileSignature size={14} /> Policy Acknowledgment
// // // // //                     </div>
// // // // //                     <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'var(--font-heading)' }}>{stats.policySignedPct}%</div>
// // // // //                     <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>Signed Code of Conduct</div>
// // // // //                 </div>
// // // // //             </div>

// // // // //             {/* Navigation Tabs */}
// // // // //             <div style={{ display: 'flex', background: 'white', border: '1px solid #cbd5e1', padding: '0 8px' }}>
// // // // //                 {[
// // // // //                     { id: 'mis_overview', label: 'MIS Reporting Overview', icon: BarChart3 },
// // // // //                     { id: 'poe_vault', label: 'Learner PoE Vault', icon: FileArchive },
// // // // //                     { id: 'grievances', label: 'Appeals & Grievances', icon: Scale },
// // // // //                     { id: 'policies', label: 'Learner Policies', icon: FileSignature }
// // // // //                 ].map(tab => {
// // // // //                     const Icon = tab.icon;
// // // // //                     const isActive = activeTab === tab.id;
// // // // //                     return (
// // // // //                         <button
// // // // //                             key={tab.id}
// // // // //                             onClick={() => setActiveTab(tab.id as TabOption)}
// // // // //                             style={{
// // // // //                                 padding: '16px 20px', background: 'transparent', border: 'none',
// // // // //                                 borderBottom: isActive ? '3px solid var(--mlab-blue)' : '3px solid transparent',
// // // // //                                 color: isActive ? 'var(--mlab-blue)' : '#64748b',
// // // // //                                 fontWeight: 800, fontSize: '0.85rem', fontFamily: 'var(--font-heading)',
// // // // //                                 textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
// // // // //                                 outline: 'none'
// // // // //                             }}
// // // // //                         >
// // // // //                             <Icon size={16} /> {tab.label}
// // // // //                         </button>
// // // // //                     );
// // // // //                 })}
// // // // //             </div>

// // // // //             {/* Tab Contents */}
// // // // //             <div className="qcto-card" style={{ padding: '24px', background: 'white' }}>

// // // // //                 {/* 1. MIS OVERVIEW */}
// // // // //                 {activeTab === 'mis_overview' && (
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
// // // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Management Information System (MIS)</h2>
// // // // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>The MIS strictly tracks demographics, retention ratios, and completion throughput required for quarterly DHET and SETA reporting.</p>

// // // // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
// // // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px' }}>
// // // // //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Throughput Matrix (YTD)</h3>
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Total Enrolled:</span> <strong>{stats.totalEnrolled.toLocaleString()}</strong></div>
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Active in Training:</span> <strong style={{ color: '#0284c7' }}>{stats.activeTraining.toLocaleString()}</strong></div>
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}><span>Graduated / Competent:</span> <strong style={{ color: '#16a34a' }}>{stats.graduated.toLocaleString()}</strong></div>
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}><span>Dropped Out:</span> <strong style={{ color: '#dc2626' }}>{stats.droppedOut.toLocaleString()}</strong></div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', background: '#f8fafc' }}>
// // // // //                                 <h3 style={{ margin: '0 0 12px 0', fontSize: '0.85rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>Report Generation</h3>
// // // // //                                 <p style={{ margin: '0 0 16px 0', fontSize: '0.75rem', color: '#64748b' }}>Generate strictly formatted documentation for external auditors.</p>
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><FileText size={14} /> Download Quarterly SETA Report (PDF)</button>
// // // // //                                     <button onClick={handleExportNLRD} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'flex-start' }}><BarChart3 size={14} /> Download Learner Details Ratio (Excel)</button>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}

// // // // //                 {/* 2. PoE VAULT */}
// // // // //                 {activeTab === 'poe_vault' && (
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                             <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Records & Evidence Vault</h2>
// // // // //                             <div className="mlab-search" style={{ margin: 0, width: '300px' }}>
// // // // //                                 <Search size={14} color="#94a3b8" />
// // // // //                                 <input type="text" placeholder="Search ID number or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div className="mlab-table-wrap">
// // // // //                             <table className="mlab-table">
// // // // //                                 <thead>
// // // // //                                     <tr>
// // // // //                                         <th>Learner Details</th>
// // // // //                                         <th>Registered Cohort</th>
// // // // //                                         <th>Progress</th>
// // // // //                                         <th>Statement of Results</th>
// // // // //                                         <th style={{ textAlign: 'right' }}>Audit Action</th>
// // // // //                                     </tr>
// // // // //                                 </thead>
// // // // //                                 <tbody>
// // // // //                                     {filteredLearners.length === 0 ? (
// // // // //                                         <tr>
// // // // //                                             <td colSpan={5}>
// // // // //                                                 <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
// // // // //                                                     <SearchX size={32} style={{ opacity: 0.5, marginBottom: '10px' }} />
// // // // //                                                     <p style={{ margin: 0 }}>No learner records match your search.</p>
// // // // //                                                 </div>
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     ) : (
// // // // //                                         filteredLearners.map(l => (
// // // // //                                             <tr key={l.id}>
// // // // //                                                 <td>
// // // // //                                                     <strong style={{ display: 'block', fontSize: '0.85rem', color: '#0f172a' }}>{l.name}</strong>
// // // // //                                                     <span style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {l.idNumber}</span>
// // // // //                                                 </td>
// // // // //                                                 <td style={{ fontSize: '0.8rem', color: '#334155' }}>{l.cohortName}</td>
// // // // //                                                 <td style={{ width: '150px' }}>
// // // // //                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // // // //                                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}>
// // // // //                                                             <div style={{ width: `${l.progress}%`, height: '100%', background: l.progress >= 100 ? '#16a34a' : '#0284c7' }} />
// // // // //                                                         </div>
// // // // //                                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{Math.round(l.progress)}%</span>
// // // // //                                                     </div>
// // // // //                                                 </td>
// // // // //                                                 <td>
// // // // //                                                     {l.sorStatus === 'issued' && <span style={{ fontSize: '0.7rem', color: '#16a34a', background: '#dcfce7', padding: '2px 8px', fontWeight: 800 }}>✓ ISSUED</span>}
// // // // //                                                     {l.sorStatus === 'pending' && <span style={{ fontSize: '0.7rem', color: '#d97706', background: '#fef3c7', padding: '2px 8px', fontWeight: 800 }}>⏳ PENDING MODERATION</span>}
// // // // //                                                     {l.sorStatus === 'not_ready' && <span style={{ fontSize: '0.7rem', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', fontWeight: 800 }}>NOT READY</span>}
// // // // //                                                 </td>
// // // // //                                                 <td style={{ textAlign: 'right' }}>
// // // // //                                                     <button onClick={() => handleGeneratePoE(l.name)} style={{ background: '#f0f9ff', color: '#0284c7', border: '1px solid #bae6fd', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
// // // // //                                                         <FileArchive size={12} /> Compile PoE
// // // // //                                                     </button>
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         ))
// // // // //                                     )}
// // // // //                                 </tbody>
// // // // //                             </table>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}

// // // // //                 {/* 3. GRIEVANCES & APPEALS */}
// // // // //                 {activeTab === 'grievances' && (
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Appeals & Grievance Register</h2>

// // // // //                         <div className="mlab-table-wrap">
// // // // //                             <table className="mlab-table">
// // // // //                                 <thead>
// // // // //                                     <tr>
// // // // //                                         <th>Ref ID</th>
// // // // //                                         <th>Learner</th>
// // // // //                                         <th>Type</th>
// // // // //                                         <th>Date Logged</th>
// // // // //                                         <th>Description</th>
// // // // //                                         <th style={{ textAlign: 'right' }}>Status</th>
// // // // //                                     </tr>
// // // // //                                 </thead>
// // // // //                                 <tbody>
// // // // //                                     {grievances.length === 0 ? (
// // // // //                                         <tr>
// // // // //                                             <td colSpan={6}>
// // // // //                                                 <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
// // // // //                                                     <CheckCircle2 size={32} color="#16a34a" style={{ opacity: 0.8, marginBottom: '10px' }} />
// // // // //                                                     <p style={{ margin: 0 }}>No active grievances or appeals in the registry.</p>
// // // // //                                                 </div>
// // // // //                                             </td>
// // // // //                                         </tr>
// // // // //                                     ) : (
// // // // //                                         grievances.map(g => (
// // // // //                                             <tr key={g.id}>
// // // // //                                                 <td style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 700 }}>{g.id}</td>
// // // // //                                                 <td style={{ fontSize: '0.85rem', fontWeight: 800 }}>{g.learnerName}</td>
// // // // //                                                 <td><span style={{ fontSize: '0.7rem', background: '#f1f5f9', padding: '2px 6px', textTransform: 'uppercase', fontWeight: 700 }}>{g.type}</span></td>
// // // // //                                                 <td style={{ fontSize: '0.8rem', color: '#64748b' }}>{g.dateLogged}</td>
// // // // //                                                 <td style={{ fontSize: '0.8rem', color: '#334155', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.description}</td>
// // // // //                                                 <td style={{ textAlign: 'right' }}>
// // // // //                                                     {g.status === 'open' && <span style={{ fontSize: '0.7rem', color: '#dc2626', background: '#fef2f2', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertCircle size={11} /> OPEN</span>}
// // // // //                                                     {g.status === 'under_review' && <span style={{ fontSize: '0.7rem', color: '#92400e', background: '#fef3c7', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={11} /> REVIEWING</span>}
// // // // //                                                     {g.status === 'resolved' && <span style={{ fontSize: '0.7rem', color: '#166534', background: '#dcfce7', padding: '2px 8px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={11} /> RESOLVED</span>}
// // // // //                                                 </td>
// // // // //                                             </tr>
// // // // //                                         ))
// // // // //                                     )}
// // // // //                                 </tbody>
// // // // //                             </table>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}

// // // // //                 {/* 4. LEARNER POLICIES */}
// // // // //                 {activeTab === 'policies' && (
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
// // // // //                         <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#0f172a', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Learner Policies & Code of Conduct</h2>
// // // // //                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>Ensure all learners are informed and protected. Track digital signatures for mandatory compliance documents.</p>

// // // // //                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '10px' }}>
// // // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // // // //                                 <div style={{ width: '40px', height: '40px', background: '#f0fdf4', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // // // //                                     <FileSignature size={20} />
// // // // //                                 </div>
// // // // //                                 <div style={{ flex: 1 }}>
// // // // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Learner Code of Conduct</h3>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // // // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${stats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // // // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{stats.policySignedPct}% Signed</span>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                             <div style={{ border: '1px solid #e2e8f0', padding: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
// // // // //                                 <div style={{ width: '40px', height: '40px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px' }}>
// // // // //                                     <AlertCircle size={20} />
// // // // //                                 </div>
// // // // //                                 <div style={{ flex: 1 }}>
// // // // //                                     <h3 style={{ margin: '0 0 4px 0', fontSize: '0.9rem', color: '#0f172a', fontWeight: 800 }}>Appeals & Assessment Policy</h3>
// // // // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
// // // // //                                         <div style={{ flex: 1, height: '6px', background: '#e2e8f0' }}><div style={{ width: `${stats.policySignedPct}%`, height: '100%', background: '#16a34a' }} /></div>
// // // // //                                         <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{stats.policySignedPct}% Signed</span>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };