// src/components/views/LearnerWorkplaceLogModal/LearnerWorkplaceLogModal.tsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    X, Save, Loader2, Briefcase, Calendar, Layers, Info, AlertTriangle,
    UploadCloud, CheckCircle, ExternalLink, CheckSquare, Square, History,
    Plus, Trash2, Tag, Link2, FileText, Code2, UserCheck, Users, Clock, ShieldCheck
} from 'lucide-react';
import { collection, addDoc, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../../../lib/firebase';
import { useToast } from '../../common/Toast/Toast';
import { useStore } from '../../../store/useStore';
import moment from 'moment';

import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

import '../../admin/LearnerFormModal/LearnerFormModal.css';

const MIDNIGHT = '#073f4e';

interface HistoricalMetrics {
    count: number;
    totalHours: number;
}

interface EvidenceLineItem {
    code: string;
    description: string;
    type: 'file' | 'link' | 'assessment';
    file: File | null;
    fileUrl?: string;
    linkedAssessmentId?: string;
    linkedSubmissionId?: string;
    linkedWorkActivities: string[];
    uploadedAt: string;
}

interface AttendanceScanResult {
    hasScan: boolean;
    status: string;
    source: 'kiosk' | 'register' | 'none';
    checkInTime?: string | null;
}

interface LearnerWorkplaceLogModalProps {
    learner: any;
    existingLog?: any;
    placementContext?: { placementId?: string, employerId?: string, mentorId?: string, cohortId?: string };
    onClose: () => void;
}

export const LearnerWorkplaceLogModal: React.FC<LearnerWorkplaceLogModalProps> = ({ learner, existingLog, placementContext, onClose }) => {
    const toast = useToast();
    const { user, cohorts, fetchCohorts, fetchWorkplaceLogs } = useStore() as any;
    const modalBodyRef = useRef<HTMLDivElement>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [submissionError, setSubmissionError] = useState<string | null>(null);

    // ─── FORM STATE ───
    const [selectedCohortId, setSelectedCohortId] = useState(existingLog ? existingLog.cohortId : (placementContext?.cohortId || learner?.cohortId || ''));
    const [selectedMentorId, setSelectedMentorId] = useState<string>(existingLog?.mentorId || placementContext?.mentorId || '');
    const [dateString, setDateString] = useState(existingLog ? existingLog.dateString : moment().format('YYYY-MM-DD'));
    const [startTime, setStartTime] = useState(existingLog ? existingLog.startTime : '08:00');
    const [endTime, setEndTime] = useState(existingLog ? existingLog.endTime : '16:00');
    const [isQctoAligned, setIsQctoAligned] = useState(existingLog ? existingLog.isQctoAligned : true);
    const [selectedModuleCode, setSelectedModuleCode] = useState(existingLog ? existingLog.workActivityCode : '');
    const [selectedTopicCode, setSelectedTopicCode] = useState(existingLog ? existingLog.topicCode : '');
    const [tasksPerformed, setTasksPerformed] = useState(existingLog ? existingLog.tasksPerformed : '');

    // ─── ATTENDANCE CROSS-VERIFICATION STATE ───
    const [attendanceScan, setAttendanceScan] = useState<AttendanceScanResult | null>(null);
    const [isCheckingScan, setIsCheckingScan] = useState<boolean>(false);

    // Calculate plain text character length for Quill Reflection Narrative
    const plainTextLength = useMemo(() => {
        return tasksPerformed.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length;
    }, [tasksPerformed]);

    // Global Log Level Linked Assessment
    const [linkedSubmissionId, setLinkedSubmissionId] = useState<string>(existingLog?.linkedSubmissionId || '');

    // Dynamic Curriculum Blueprints
    const [dynamicModules, setDynamicModules] = useState<any[]>([]);
    const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);

    // Placements & Enrollments Linked Data
    const [allLearnerPlacements, setAllLearnerPlacements] = useState<any[]>([]);
    const [placementCohortIds, setPlacementCohortIds] = useState<string[]>([]);
    const [fetchedExtraCohorts, setFetchedExtraCohorts] = useState<any[]>([]);
    const [hasIndependentPlacements, setHasIndependentPlacements] = useState<boolean>(false);

    // Dynamic Supervision Mentors Pipeline State
    const [assignedMentors, setAssignedMentors] = useState<Array<{ id: string; name: string; type: string; email?: string }>>([]);
    const [isMentorsLoading, setIsMentorsLoading] = useState<boolean>(false);

    // Learner's Submitted Assessments / Code Projects State
    const [learnerSubmissions, setLearnerSubmissions] = useState<any[]>([]);

    // Checked Work Activities & Contextual Knowledge Codes
    const [selectedMilestones, setSelectedMilestones] = useState<string[]>(existingLog?.selectedMilestones || []);

    // Supporting Evidence Portfolio Lines
    const [evidenceLines, setEvidenceLines] = useState<EvidenceLineItem[]>([]);

    // CWK Dedicated Evidence State
    const [cwkFiles, setCwkFiles] = useState<Record<string, File | null>>({});
    const [cwkUrls] = useState<Record<string, string>>(existingLog?.cwkEvidence || {});

    // Historical Exposure Analytics
    const [historicalMilestoneMetrics, setHistoricalMilestoneMetrics] = useState<Record<string, HistoricalMetrics>>({});
    const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);

    // Global Log Level Summary Attachment
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [evidenceUrl] = useState(existingLog ? existingLog.evidenceUrl : '');

    // Sync store cohorts
    useEffect(() => {
        if (!cohorts || cohorts.length === 0) {
            if (typeof fetchCohorts === 'function') fetchCohorts();
        }
    }, [cohorts, fetchCohorts]);

    // 🚀 ATTENDANCE CROSS-VERIFICATION ENGINE
    useEffect(() => {
        const runAttendanceVerification = async () => {
            const targetLearnerId = learner?.id || learner?.idNumber || user?.uid;
            if (!selectedCohortId || !dateString || !targetLearnerId) {
                setAttendanceScan(null);
                return;
            }

            setIsCheckingScan(true);
            try {
                // 1. Digital Kiosk / Zoom Scan check
                const recsQ = query(
                    collection(db, 'attendance_records'),
                    where('cohortId', '==', selectedCohortId),
                    where('sessionDate', '==', dateString)
                );
                const recsSnap = await getDocs(recsQ);
                const matchedRec = recsSnap.docs.find(d => {
                    const data = d.data();
                    return data.learnerId === targetLearnerId ||
                        data.learnerId === learner?.id ||
                        data.idNumber === learner?.idNumber;
                });

                if (matchedRec) {
                    const data = matchedRec.data();
                    const st = data.status || 'Present';
                    setAttendanceScan({
                        hasScan: ['Present', 'Partial', 'Excused_Absent'].includes(st),
                        status: st,
                        source: 'kiosk',
                        checkInTime: data.checkInTime || data.timestamp || null
                    });
                    setIsCheckingScan(false);
                    return;
                }

                // 2. QCTO Register check
                const attQ = query(
                    collection(db, 'attendance'),
                    where('cohortId', '==', selectedCohortId),
                    where('date', '==', dateString)
                );
                const attSnap = await getDocs(attQ);
                if (!attSnap.empty) {
                    const attData = attSnap.docs[0].data();
                    const idNum = learner?.idNumber || learner?.id;
                    const isPres = Array.isArray(attData.presentLearners) && (attData.presentLearners.includes(idNum) || attData.presentLearners.includes(learner?.id));
                    const isPart = Array.isArray(attData.partialLearners) && (attData.partialLearners.includes(idNum) || attData.partialLearners.includes(learner?.id));
                    const isExc = Array.isArray(attData.excusedLearners) && (attData.excusedLearners.includes(idNum) || attData.excusedLearners.includes(learner?.id));

                    let resolvedStatus = 'Absent';
                    if (isPres) resolvedStatus = 'Present';
                    else if (isPart) resolvedStatus = 'Partial';
                    else if (isExc) resolvedStatus = 'Excused_Absent';

                    setAttendanceScan({
                        hasScan: resolvedStatus !== 'Absent',
                        status: resolvedStatus,
                        source: 'register'
                    });
                    setIsCheckingScan(false);
                    return;
                }

                setAttendanceScan({ hasScan: false, status: 'Unverified', source: 'none' });
            } catch (err) {
                console.error('Attendance verification check error:', err);
                setAttendanceScan({ hasScan: false, status: 'Unverified', source: 'none' });
            } finally {
                setIsCheckingScan(false);
            }
        };

        runAttendanceVerification();
    }, [selectedCohortId, dateString, learner, user]);

    // PERMISSION-SAFE SUBMISSIONS QUERY
    useEffect(() => {
        const fetchLearnerCodeProjectsAndAssessments = async () => {
            const currentAuthUid = auth.currentUser?.uid || user?.uid;

            if (!currentAuthUid) return;

            try {
                const submissionsMap = new Map<string, any>();

                try {
                    const qAuth = query(collection(db, 'learner_submissions'), where('authUid', '==', currentAuthUid));
                    const snapAuth = await getDocs(qAuth);
                    snapAuth.docs.forEach(d => submissionsMap.set(d.id, { id: d.id, ...d.data() }));
                } catch (q1Err: any) {
                    console.warn('Query by authUid failed:', q1Err.message || q1Err);
                }

                try {
                    const qLearner = query(collection(db, 'learner_submissions'), where('learnerId', '==', currentAuthUid));
                    const snapLearner = await getDocs(qLearner);
                    snapLearner.docs.forEach(d => submissionsMap.set(d.id, { id: d.id, ...d.data() }));
                } catch (q2Err: any) {
                    console.warn('Query by learnerId failed:', q2Err.message || q2Err);
                }

                const projectList = Array.from(submissionsMap.values()).sort((a, b) =>
                    new Date(b.submittedAt || b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
                );

                setLearnerSubmissions(projectList);

            } catch (err: any) {
                console.error('Error in assessment submission pipeline:', err);
            }
        };

        fetchLearnerCodeProjectsAndAssessments();
    }, [learner, user]);

    // MULTI-IDENTIFIER ECOSYSTEM DISCOVERY ENGINE
    useEffect(() => {
        const fetchLearnerEcosystemCohorts = async () => {
            const currentAuthUid = auth.currentUser?.uid || user?.uid;

            const learnerCandidateIds = new Set<string>();
            if (currentAuthUid) learnerCandidateIds.add(currentAuthUid);
            if (learner?.id) learnerCandidateIds.add(learner.id);
            if (learner?.idNumber) learnerCandidateIds.add(learner.idNumber);
            if (learner?.uid) learnerCandidateIds.add(learner.uid);

            const initialSearchArray = Array.from(learnerCandidateIds);
            if (initialSearchArray.length === 0) return;

            try {
                const collectedCohortIds = new Set<string>();
                const fetchedPlacementsList: any[] = [];
                let foundIndependent = false;

                if (learner?.cohortId) collectedCohortIds.add(learner.cohortId);
                if (Array.isArray(learner?.cohortIds)) learner.cohortIds.forEach((id: string) => collectedCohortIds.add(id));
                if (placementContext?.cohortId) collectedCohortIds.add(placementContext.cohortId);

                const expandedPlacementSearchIds = new Set<string>(initialSearchArray);

                for (const candidateId of initialSearchArray) {
                    try {
                        const enrolQ = query(collection(db, "enrollments"), where("learnerId", "==", candidateId));
                        const enrolSnap = await getDocs(enrolQ);
                        enrolSnap.docs.forEach(d => {
                            const data = d.data();
                            if (data.cohortId) collectedCohortIds.add(data.cohortId);
                            if (Array.isArray(data.cohortIds)) data.cohortIds.forEach((id: string) => collectedCohortIds.add(id));
                            expandedPlacementSearchIds.add(d.id);
                        });
                    } catch (e: any) {
                        console.warn(`Enrollment query warning for ${candidateId}:`, e.message);
                    }
                }

                for (const pSearchId of Array.from(expandedPlacementSearchIds)) {
                    try {
                        const placeQ = query(collection(db, "placements"), where("learnerId", "==", pSearchId));
                        const placeSnap = await getDocs(placeQ);
                        placeSnap.docs.forEach(d => {
                            const pData: any = { id: d.id, ...d.data() };
                            fetchedPlacementsList.push(pData);
                            if (pData.cohortId) {
                                collectedCohortIds.add(pData.cohortId);
                            } else {
                                foundIndependent = true;
                            }
                        });
                    } catch (e: any) {
                        console.warn(`Placement query warning for ${pSearchId}:`, e.message);
                    }
                }

                setAllLearnerPlacements(fetchedPlacementsList);
                setHasIndependentPlacements(foundIndependent);

                const finalCollectedCohortIds = Array.from(collectedCohortIds);

                const storeCohortIds = new Set((cohorts || []).map((c: any) => c.id));
                const missingCohortIds = finalCollectedCohortIds.filter(id => !storeCohortIds.has(id));

                if (missingCohortIds.length > 0) {
                    const fetchedDocs = await Promise.all(
                        missingCohortIds.map(id => getDoc(doc(db, 'cohorts', id)))
                    );
                    const extras = fetchedDocs
                        .filter(d => d.exists())
                        .map(d => ({ id: d.id, ...(d.data() as any) }));

                    setFetchedExtraCohorts(extras);
                }

                setPlacementCohortIds(finalCollectedCohortIds);
            } catch (err) {
                console.error('Error during ecosystem cohort discovery:', err);
            }
        };

        fetchLearnerEcosystemCohorts();
    }, [learner, user, placementContext, cohorts]);

    // DYNAMIC PER-PROGRAMME/PLACEMENT MENTOR RESOLVER
    useEffect(() => {
        const resolveMentorsForSelectedProgramme = async () => {
            setIsMentorsLoading(true);

            try {
                let targetPlacement = allLearnerPlacements.find(p =>
                    (placementContext?.placementId && p.id === placementContext.placementId) ||
                    (selectedCohortId && p.cohortId === selectedCohortId)
                );

                if (!targetPlacement && allLearnerPlacements.length > 0) {
                    targetPlacement = allLearnerPlacements.find(p =>
                        ['active placement', 'active', 'pending match'].includes(String(p.status || '').toLowerCase())
                    ) || allLearnerPlacements[0];
                }

                const mentorMap = new Map<string, { id: string; name: string; type: string; email?: string }>();

                if (targetPlacement) {
                    if (targetPlacement.mentorId) {
                        mentorMap.set(targetPlacement.mentorId, {
                            id: targetPlacement.mentorId,
                            name: targetPlacement.mentorName || targetPlacement.assignedMentorName || targetPlacement.mentor?.fullName || 'Primary Mentor',
                            type: 'Primary Mentor'
                        });
                    }

                    const secIds = Array.isArray(targetPlacement.secondaryMentorIds) ? targetPlacement.secondaryMentorIds : [];
                    const secObjList = Array.isArray(targetPlacement.secondaryMentors) ? targetPlacement.secondaryMentors : [];

                    secIds.forEach((secId: string) => {
                        const foundObj = secObjList.find((m: any) => m.id === secId);
                        mentorMap.set(secId, {
                            id: secId,
                            name: foundObj?.name || foundObj?.fullName || 'Co-Mentor',
                            type: 'Co-Mentor / Secondary Supervisor'
                        });
                    });
                } else {
                    if (placementContext?.mentorId) {
                        mentorMap.set(placementContext.mentorId, { id: placementContext.mentorId, name: 'Primary Mentor', type: 'Primary Mentor' });
                    } else if (learner?.mentorId) {
                        mentorMap.set(learner.mentorId, { id: learner.mentorId, name: learner.mentorName || 'Primary Mentor', type: 'Primary Mentor' });
                    }
                }

                const mentorIdsToFetch = Array.from(mentorMap.keys());

                if (mentorIdsToFetch.length > 0) {
                    const userDocs = await Promise.all(
                        mentorIdsToFetch.map(id => getDoc(doc(db, 'users', id)))
                    );

                    userDocs.forEach(d => {
                        if (d.exists()) {
                            const uData = d.data();
                            if (uData.status === 'archived') {
                                mentorMap.delete(d.id);
                                return;
                            }
                            const existing = mentorMap.get(d.id);
                            if (existing) {
                                mentorMap.set(d.id, {
                                    ...existing,
                                    name: uData.fullName || uData.firstName || uData.email || existing.name,
                                    email: uData.email || ''
                                });
                            }
                        }
                    });
                }

                const resolvedMentorList = Array.from(mentorMap.values());
                setAssignedMentors(resolvedMentorList);

                if (existingLog?.mentorId && resolvedMentorList.some(m => m.id === existingLog.mentorId)) {
                    setSelectedMentorId(existingLog.mentorId);
                } else if (resolvedMentorList.length > 0) {
                    const primary = resolvedMentorList.find(m => m.type.startsWith('Primary')) || resolvedMentorList[0];
                    setSelectedMentorId(primary.id);
                } else {
                    setSelectedMentorId('');
                }

            } catch (err) {
                console.error("Failed resolving mentors for selected programme:", err);
            } finally {
                setIsMentorsLoading(false);
            }
        };

        resolveMentorsForSelectedProgramme();
    }, [selectedCohortId, allLearnerPlacements, placementContext, learner, existingLog]);

    const allAvailableEcosystemCohorts = useMemo(() => {
        const map = new Map<string, any>();
        (cohorts || []).forEach((c: any) => { if (c?.id) map.set(c.id, c); });
        fetchedExtraCohorts.forEach((c: any) => { if (c?.id) map.set(c.id, c); });
        return Array.from(map.values());
    }, [cohorts, fetchedExtraCohorts]);

    const studentCohorts = useMemo(() => {
        const list: any[] = [];

        if (allAvailableEcosystemCohorts.length > 0) {
            const searchIds = new Set([
                learner?.id,
                learner?.idNumber,
                learner?.uid,
                learner?.authUid,
                user?.uid,
                user?.idNumber
            ].filter(Boolean));

            const filtered = allAvailableEcosystemCohorts.filter((c: any) => {
                const isPrimaryCohort = c.id === learner?.cohortId;
                const inCohortIdArray = Array.isArray(learner?.cohortIds) && learner.cohortIds.includes(c.id);
                const listedInsideCohortMembers = Array.isArray(c.learnerIds) && Array.from(searchIds).some(id => c.learnerIds.includes(id));
                const inPlacementCohorts = placementCohortIds.includes(c.id);
                const isContextCohort = placementContext?.cohortId && c.id === placementContext.cohortId;

                return isPrimaryCohort || inCohortIdArray || listedInsideCohortMembers || inPlacementCohorts || isContextCohort;
            });

            list.push(...(filtered.length > 0 ? filtered : allAvailableEcosystemCohorts));
        }

        if (hasIndependentPlacements) {
            list.push({
                id: 'independent_placement',
                name: '⚡ Independent / Unregulated Placement Track'
            });
        }

        return list;
    }, [allAvailableEcosystemCohorts, learner, user, placementCohortIds, placementContext, hasIndependentPlacements]);

    useEffect(() => {
        if (!selectedCohortId && studentCohorts.length > 0) {
            setSelectedCohortId(studentCohorts[0].id);
        }
    }, [studentCohorts, selectedCohortId]);

    const categorizedSubmissions = useMemo(() => {
        if (learnerSubmissions.length === 0) return [];

        const groupsMap: Record<string, { label: string; isCurrentCohort: boolean; items: any[] }> = {};

        learnerSubmissions.forEach(sub => {
            const cohortId = sub.cohortId;
            const matchedCohort = allAvailableEcosystemCohorts.find(c => c.id === cohortId);

            const isCurrentCohort = cohortId === selectedCohortId;
            const groupKey = (cohortId && matchedCohort) ? cohortId : 'unassigned';

            let groupLabel = 'Unassigned / Independent Assessments & Projects';
            if (cohortId && matchedCohort) {
                groupLabel = `${matchedCohort.name || matchedCohort.cohortName || 'Training Cohort'}${isCurrentCohort ? ' ★ (Current Selection)' : ''}`;
            }

            if (!groupsMap[groupKey]) {
                groupsMap[groupKey] = {
                    label: groupLabel,
                    isCurrentCohort,
                    items: []
                };
            }

            groupsMap[groupKey].items.push(sub);
        });

        return Object.values(groupsMap).sort((a, b) => {
            if (a.isCurrentCohort) return -1;
            if (b.isCurrentCohort) return 1;
            if (a.label.startsWith('Unassigned')) return 1;
            if (b.label.startsWith('Unassigned')) return -1;
            return a.label.localeCompare(b.label);
        });
    }, [learnerSubmissions, allAvailableEcosystemCohorts, selectedCohortId]);

    useEffect(() => {
        if (existingLog && Array.isArray(existingLog.customEvidenceTracking)) {
            setEvidenceLines(existingLog.customEvidenceTracking.map((item: any) => ({
                code: item.code,
                description: item.description || '',
                type: item.type || 'file',
                file: null,
                fileUrl: item.fileUrl || '',
                linkedAssessmentId: item.linkedAssessmentId || '',
                linkedSubmissionId: item.linkedSubmissionId || '',
                linkedWorkActivities: item.linkedWorkActivities || [],
                uploadedAt: item.uploadedAt || new Date().toISOString()
            })));
        } else {
            setEvidenceLines([]);
        }
    }, [existingLog]);

    // 🚀 FIXED: GRACEFUL FALLBACK FOR HISTORICAL ANALYTICS (Bypasses rules issue)
    useEffect(() => {
        const analyzeHistoricalLogsPipeline = async () => {
            const currentAuthUid = auth.currentUser?.uid || user?.uid;
            if (!learner?.id && !currentAuthUid) return;

            setIsHistoryLoading(true);
            try {
                let querySnapshot;
                try {
                    // Try exact authUid match first to satisfy modern rules
                    const logsQuery = query(
                        collection(db, 'workplace_logs'),
                        where('learnerId', '==', currentAuthUid),
                        where('status', '==', 'Approved')
                    );
                    querySnapshot = await getDocs(logsQuery);
                } catch (primaryErr: any) {
                    console.warn("Primary historical logs query bypassed:", primaryErr.message);
                    // Fallback to profile ID
                    const fallbackQuery = query(
                        collection(db, 'workplace_logs'),
                        where('learnerId', '==', learner.id),
                        where('status', '==', 'Approved')
                    );
                    querySnapshot = await getDocs(fallbackQuery);
                }

                const metricsMap: Record<string, HistoricalMetrics> = {};

                if (querySnapshot && !querySnapshot.empty) {
                    querySnapshot.docs.forEach(docSnap => {
                        const logData = docSnap.data();
                        if (existingLog?.id && docSnap.id === existingLog.id) return;

                        const milestones = logData.selectedMilestones || [];
                        const associatedHours = Number(logData.totalHours) || 0;

                        milestones.forEach((code: string) => {
                            if (!metricsMap[code]) {
                                metricsMap[code] = { count: 0, totalHours: 0 };
                            }
                            metricsMap[code].count += 1;
                            metricsMap[code].totalHours += associatedHours;
                        });
                    });
                }

                setHistoricalMilestoneMetrics(metricsMap);
            } catch (err: any) {
                console.warn("Historical milestones bypassed completely due to rules:", err.message);
                setHistoricalMilestoneMetrics({});
            } finally {
                setIsHistoryLoading(false);
            }
        };

        analyzeHistoricalLogsPipeline();
    }, [learner?.id, user?.uid, existingLog]);

    useEffect(() => {
        const fetchCurriculumForSelectedCohort = async () => {
            if (!selectedCohortId || selectedCohortId.startsWith('independent_')) {
                setDynamicModules(learner.workExperienceModules || learner.modules || []);
                return;
            }
            setIsTemplateLoading(true);
            try {
                const cohortSnap = await getDoc(doc(db, 'cohorts', selectedCohortId));
                if (cohortSnap.exists()) {
                    const cData = cohortSnap.data();
                    const targetProgId = cData.programmeId || cData.qualificationId;

                    if (targetProgId) {
                        const progSnap = await getDoc(doc(db, 'programmes', targetProgId));
                        if (progSnap.exists()) {
                            const pData = progSnap.data();
                            const mods = pData.workExperienceModules
                                || pData.modules
                                || pData.curriculum
                                || pData.unitStandards
                                || pData.topics
                                || [];
                            setDynamicModules(mods);
                            setIsTemplateLoading(false);
                            return;
                        }
                        const qualSnap = await getDoc(doc(db, 'qualifications', targetProgId));
                        if (qualSnap.exists()) {
                            const qData = qualSnap.data();
                            const mods = qData.workExperienceModules
                                || qData.modules
                                || qData.curriculum
                                || qData.unitStandards
                                || qData.topics
                                || [];
                            setDynamicModules(mods);
                            setIsTemplateLoading(false);
                            return;
                        }
                    }
                }
                setDynamicModules(learner.workExperienceModules || learner.modules || []);
            } catch (err) {
                console.error("Failed to map blueprint modules:", err);
                setDynamicModules(learner.workExperienceModules || learner.modules || []);
            } finally {
                setIsTemplateLoading(false);
            }
        };

        fetchCurriculumForSelectedCohort();
    }, [selectedCohortId, learner.workExperienceModules, learner.modules]);

    const activeModule = useMemo(() => {
        if (!selectedModuleCode || !dynamicModules.length) return null;
        return dynamicModules.find((m: any) => (m.code || m.id || m.name) === selectedModuleCode);
    }, [dynamicModules, selectedModuleCode]);

    const moduleTopics = useMemo(() => {
        if (!activeModule) return [];
        return activeModule.topics || activeModule.units || activeModule.subjects || activeModule.items || [];
    }, [activeModule]);

    const filteredWorkActivities = useMemo(() => {
        if (!selectedTopicCode || !moduleTopics.length) return [];

        const chosenTopic = moduleTopics.find((t: any) => (t.code || t.id || t.title) === selectedTopicCode);
        const criteriaList = chosenTopic?.criteria || chosenTopic?.activities || chosenTopic?.outcomes || chosenTopic?.tasks || [];

        if (!Array.isArray(criteriaList) || criteriaList.length === 0) return [];

        const waCriteria = criteriaList.filter((c: any) => {
            const code = String(c.code || c.id || '');
            return !code.startsWith('CWK');
        });

        return waCriteria.map((c: any) => {
            const code = c.code || c.id || 'ACT';
            const historyStats = historicalMilestoneMetrics[code];
            const wasCoveredInPastLogs = !!historyStats && historyStats.count > 0;

            return {
                id: code,
                label: `${code}: ${c.description || c.label || c.title || code}`,
                isPreviouslyApproved: wasCoveredInPastLogs,
                loggedCount: historyStats?.count || 0,
                accumulatedHours: historyStats?.totalHours || 0
            };
        }).sort((a: any, b: any) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    }, [selectedTopicCode, moduleTopics, historicalMilestoneMetrics]);

    const dynamicCwkMetrics = useMemo(() => {
        if (!selectedTopicCode || !moduleTopics.length) return [];

        const chosenTopic = moduleTopics.find((t: any) => (t.code || t.id || t.title) === selectedTopicCode);
        const criteriaList = chosenTopic?.criteria || chosenTopic?.activities || [];
        if (!Array.isArray(criteriaList)) return [];

        const cwkCriteria = criteriaList.filter((c: any) => String(c.code || '').startsWith('CWK'));

        return cwkCriteria.map((c: any) => ({
            code: c.code,
            label: c.description || c.label || c.title || c.code
        })).sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [selectedTopicCode, moduleTopics]);

    const milestoneDescriptionsLookup = useMemo(() => {
        const dictionaryMap: Record<string, string> = {};
        if (!moduleTopics || !Array.isArray(moduleTopics)) return dictionaryMap;

        moduleTopics.forEach((topic: any) => {
            const list = topic.criteria || topic.activities || [];
            if (Array.isArray(list)) {
                list.forEach((criterion: any) => {
                    if (criterion.code) {
                        dictionaryMap[criterion.code] = criterion.description || criterion.label || criterion.title || '';
                    }
                });
            }
        });
        return dictionaryMap;
    }, [moduleTopics]);

    const calculatedTopicGroupNum = useMemo(() => {
        if (!selectedTopicCode || !moduleTopics.length) return '01';
        const chosenTopic = moduleTopics.find((t: any) => (t.code || t.id || t.title) === selectedTopicCode);
        const sampleWa = (chosenTopic?.criteria || chosenTopic?.activities || [])?.find((c: any) => String(c.code || '').startsWith('WA'))?.code || '';
        return sampleWa ? sampleWa.substring(2, 4) : '01';
    }, [selectedTopicCode, moduleTopics]);

    const handleAddNewEmptyEvidenceLine = () => {
        const nextRunningIndex = evidenceLines.length + 1;
        const indexPaddingStr = nextRunningIndex < 10 ? `0${nextRunningIndex}` : `${nextRunningIndex}`;
        const autoStampedSeCode = `SE${calculatedTopicGroupNum}${indexPaddingStr}`;

        const newEmptyRow: EvidenceLineItem = {
            code: autoStampedSeCode,
            description: '',
            type: 'file',
            file: null,
            fileUrl: '',
            linkedAssessmentId: '',
            linkedSubmissionId: '',
            linkedWorkActivities: [],
            uploadedAt: new Date().toISOString()
        };

        setEvidenceLines(prev => [...prev, newEmptyRow]);
        toast.success(`Generated designated evidence slot: ${autoStampedSeCode}`);
    };

    const handleRemoveEvidenceLine = (idxToRemove: number) => {
        setEvidenceLines(prev => {
            const remaining = prev.filter((_, idx) => idx !== idxToRemove);
            return remaining.map((item, index) => {
                const updatedSeq = index + 1;
                const updatedSeqStr = updatedSeq < 10 ? `0${updatedSeq}` : `${updatedSeq}`;
                return {
                    ...item,
                    code: `SE${calculatedTopicGroupNum}${updatedSeqStr}`
                };
            });
        });
    };

    const handleUpdateEvidenceMeta = (idx: number, field: keyof EvidenceLineItem, value: any) => {
        setEvidenceLines(prev => prev.map((item, i) => {
            if (i !== idx) return item;
            if (field === 'type') {
                return { ...item, type: value, file: null, fileUrl: '', linkedAssessmentId: '', linkedSubmissionId: '' };
            }
            if (field === 'linkedSubmissionId') {
                const sub = learnerSubmissions.find(s => s.id === value);
                const subTitle = sub ? `${sub.title || 'Assessment Project'}${sub.moduleNumber ? ` (${sub.moduleNumber})` : ''}` : '';
                return {
                    ...item,
                    linkedSubmissionId: value,
                    linkedAssessmentId: sub?.assessmentId || '',
                    description: item.description || subTitle
                };
            }
            return { ...item, [field]: value };
        }));
    };

    const handleToggleWaLinkToEvidence = (lineIdx: number, waCode: string) => {
        setEvidenceLines(prev => prev.map((item, i) => {
            if (i !== lineIdx) return item;
            const alreadyLinked = item.linkedWorkActivities.includes(waCode);
            const updatedLinks = alreadyLinked
                ? item.linkedWorkActivities.filter(code => code !== waCode)
                : [...item.linkedWorkActivities, waCode];
            return { ...item, linkedWorkActivities: updatedLinks };
        }));
    };

    useEffect(() => {
        if (dynamicModules.length > 0 && !selectedModuleCode) {
            setSelectedModuleCode(dynamicModules[0].code || dynamicModules[0].id || dynamicModules[0].name);
        }
    }, [dynamicModules, selectedModuleCode]);

    useEffect(() => {
        if (moduleTopics.length > 0 && !selectedTopicCode) {
            setSelectedTopicCode(moduleTopics[0].code || moduleTopics[0].id || '');
        }
    }, [moduleTopics, selectedTopicCode]);

    useEffect(() => {
        if (!existingLog) {
            setSelectedMilestones([]);
            setEvidenceLines([]);
        } else {
            if (existingLog.topicCode !== selectedTopicCode || existingLog.cohortId !== selectedCohortId) {
                setSelectedMilestones([]);
                setEvidenceLines([]);
            }
        }
    }, [selectedModuleCode, selectedTopicCode, selectedCohortId, existingLog]);

    const calculateHours = () => {
        const start = moment(`${dateString} ${startTime}`, 'YYYY-MM-DD HH:mm');
        const end = moment(`${dateString} ${endTime}`, 'YYYY-MM-DD HH:mm');
        const duration = moment.duration(end.diff(start));
        return Math.max(0, duration.asHours());
    };

    const handleToggleMilestone = (id: string) => {
        setSelectedMilestones(prev => {
            const updated = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
            if (prev.includes(id)) {
                setEvidenceLines(currentLines => currentLines.map(line => ({
                    ...line,
                    linkedWorkActivities: line.linkedWorkActivities.filter(code => code !== id)
                })));
            }
            return updated;
        });
    };

    // Helper to trigger scroll to top on validation failure
    const triggerValidationError = (errorMsg: string) => {
        setSubmissionError(errorMsg);
        toast.error(errorMsg);
        if (modalBodyRef.current) {
            modalBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // 🚀 SAVE & SUBMIT LOG ENGINE
    const handleSaveLog = async (e: React.FormEvent, targetStatus: 'Draft' | 'Pending_Mentor_Approval') => {
        e.preventDefault();
        setSubmissionError(null);

        console.group('🚀 [LearnerWorkplaceLogModal] Submission Pipeline');
        console.log('Target Submit Status:', targetStatus);

        const targetPlacement = allLearnerPlacements.find(p =>
            (placementContext?.placementId && p.id === placementContext.placementId) ||
            (selectedCohortId && p.cohortId === selectedCohortId)
        ) || allLearnerPlacements[0];

        const finalMentorId = selectedMentorId || targetPlacement?.mentorId || placementContext?.mentorId || learner.mentorId;
        const finalEmployerId = targetPlacement?.employerId || placementContext?.employerId || learner.employerId;

        if (!selectedCohortId) {
            console.warn('⚠️ Submission blocked: Missing cohort ID selection.');
            triggerValidationError("Compliance lock: You must select your active training cohort.");
            console.groupEnd();
            return;
        }

        if (!finalMentorId) {
            console.warn('⚠️ Submission blocked: Missing mentor ID selection.');
            triggerValidationError("Supervision lock: Please select a target Workplace Supervisor / Mentor.");
            console.groupEnd();
            return;
        }

        const totalHours = calculateHours();
        if (totalHours <= 0) {
            console.warn('⚠️ Submission blocked: Hours calculated is <= 0.');
            triggerValidationError("End time must be after start time.");
            console.groupEnd();
            return;
        }

        if (targetStatus === 'Pending_Mentor_Approval' && plainTextLength < 20) {
            console.warn(`⚠️ Submission blocked: Narrative description too short (${plainTextLength}/20 min characters).`);
            triggerValidationError(`Your narrative reflection summary is too short (${plainTextLength}/20 characters). Please provide more detail on your tasks performed.`);
            console.groupEnd();
            return;
        }

        if (isQctoAligned && targetStatus === 'Pending_Mentor_Approval' && selectedMilestones.length === 0) {
            console.warn('⚠️ Submission blocked: QCTO aligned entry missing milestone selection.');
            triggerValidationError("Compliance rules require you to map at least one complete curriculum metric.");
            console.groupEnd();
            return;
        }

        // CWK Evidence Validation
        if (isQctoAligned && targetStatus === 'Pending_Mentor_Approval') {
            const selectedCwkCodes = selectedMilestones.filter(code => code.startsWith('CWK'));

            for (const cwkCode of selectedCwkCodes) {
                if (!cwkFiles[cwkCode] && !cwkUrls[cwkCode]) {
                    const dynamicLabelStr = milestoneDescriptionsLookup[cwkCode] || cwkCode;
                    console.warn(`⚠️ Submission blocked: CWK milestone "${cwkCode}" missing required file proof.`);
                    triggerValidationError(`Missing Evidence: You checked "${dynamicLabelStr}". You must upload proof directly below the checkbox.`);
                    console.groupEnd();
                    return;
                }
            }
        }

        if (evidenceLines.length > 0) {
            for (let i = 0; i < evidenceLines.length; i++) {
                const line = evidenceLines[i];
                if (!line.description.trim()) {
                    triggerValidationError(`Compliance breach: ${line.code} requires a clear context summary name.`);
                    console.groupEnd();
                    return;
                }
                if (line.type === 'link') {
                    if (!line.fileUrl || !line.fileUrl.trim().startsWith('http')) {
                        triggerValidationError(`Compliance breach: ${line.code} requires a secure web link URL address.`);
                        console.groupEnd();
                        return;
                    }
                } else if (line.type === 'assessment') {
                    if (!line.linkedSubmissionId) {
                        triggerValidationError(`Compliance breach: ${line.code} requires you to select a linked code project / assessment.`);
                        console.groupEnd();
                        return;
                    }
                } else {
                    if (!line.file && !line.fileUrl) {
                        triggerValidationError(`Compliance breach: ${line.code} has no active physical document file attached.`);
                        console.groupEnd();
                        return;
                    }
                }
                if (line.linkedWorkActivities.length === 0) {
                    triggerValidationError(`Compliance breach: ${line.code} must be linked to at least one valid Work Activity chip.`);
                    console.groupEnd();
                    return;
                }
            }
        }

        setIsSaving(true);

        try {
            let finalEvidenceUrl = evidenceUrl;

            // Step 1: Upload Global Attachment
            if (evidenceFile) {
                console.log('Uploading summary verification attachment to Firebase Storage...');
                try {
                    const fileExtension = evidenceFile.name.split('.').pop();
                    const storageRef = ref(storage, `workplace_evidence/${learner.id}/${Date.now()}_summary_proof.${fileExtension}`);
                    const snapshot = await uploadBytes(storageRef, evidenceFile);
                    finalEvidenceUrl = await getDownloadURL(snapshot.ref);
                    console.log('Summary proof URL obtained:', finalEvidenceUrl);
                } catch (err) {
                    console.error("Summary attachment upload failed:", err);
                }
            }

            // Step 2: Upload Custom SE Lines
            const finalizedCustomTrackingPayload: any[] = [];
            for (const item of evidenceLines) {
                if (item.type === 'link' || item.type === 'assessment') {
                    finalizedCustomTrackingPayload.push({
                        code: item.code,
                        description: item.description,
                        type: item.type,
                        fileUrl: item.fileUrl?.trim() || '',
                        linkedAssessmentId: item.linkedAssessmentId || null,
                        linkedSubmissionId: item.linkedSubmissionId || null,
                        linkedWorkActivities: item.linkedWorkActivities,
                        uploadedAt: item.uploadedAt
                    });
                    continue;
                }

                if (item.type === 'file' && item.fileUrl && !item.file) {
                    finalizedCustomTrackingPayload.push({
                        code: item.code,
                        description: item.description,
                        type: 'file',
                        fileUrl: item.fileUrl,
                        linkedAssessmentId: null,
                        linkedSubmissionId: null,
                        linkedWorkActivities: item.linkedWorkActivities,
                        uploadedAt: item.uploadedAt
                    });
                    continue;
                }

                if (item.type === 'file' && item.file) {
                    try {
                        const fileExt = item.file.name.split('.').pop();
                        const fileRef = ref(storage, `workplace_evidence/${learner.id}/${Date.now()}_${item.code}_doc.${fileExt}`);
                        const uploadSnapshot = await uploadBytes(fileRef, item.file);
                        const secureUrl = await getDownloadURL(uploadSnapshot.ref);

                        finalizedCustomTrackingPayload.push({
                            code: item.code,
                            description: item.description,
                            type: 'file',
                            fileUrl: secureUrl,
                            linkedAssessmentId: null,
                            linkedSubmissionId: null,
                            linkedWorkActivities: item.linkedWorkActivities,
                            uploadedAt: item.uploadedAt
                        });
                    } catch (err) {
                        console.error(`Error uploading custom evidence file ${item.code}:`, err);
                    }
                }
            }

            // Step 3: Upload CWK Specific Evidence Files
            const finalCwkUrls = { ...cwkUrls };
            const selectedCwkCodes = selectedMilestones.filter(code => code.startsWith('CWK'));

            for (const cwkCode of selectedCwkCodes) {
                const cwkFile = cwkFiles[cwkCode];
                if (cwkFile) {
                    try {
                        console.log(`Uploading CWK evidence file for ${cwkCode}...`);
                        const fileExt = cwkFile.name.split('.').pop();
                        const fileRef = ref(storage, `workplace_evidence/${learner.id}/${Date.now()}_${cwkCode}_proof.${fileExt}`);
                        const uploadSnapshot = await uploadBytes(fileRef, cwkFile);
                        finalCwkUrls[cwkCode] = await getDownloadURL(uploadSnapshot.ref);
                    } catch (err) {
                        console.error(`Error uploading CWK proof file ${cwkCode}:`, err);
                    }
                }
            }

            const structuralHistory = [...(existingLog?.history || [])];
            if (existingLog && existingLog.status === 'Rejected') {
                const alreadyArchived = structuralHistory.some((h: any) => h.updatedAt === existingLog.updatedAt);
                if (!alreadyArchived) {
                    structuralHistory.push({
                        tasksPerformed: existingLog.tasksPerformed,
                        evidenceUrl: existingLog.evidenceUrl || '',
                        rejectionReason: existingLog.rejectionReason || '',
                        status: existingLog.status,
                        selectedMilestones: existingLog.selectedMilestones || [],
                        customEvidenceTracking: existingLog.customEvidenceTracking || [],
                        cwkEvidence: existingLog.cwkEvidence || {},
                        updatedAt: existingLog.updatedAt || new Date().toISOString()
                    });
                }
            }

            const chosenTopic = moduleTopics.find((t: any) => (t.code || t.id || t.title) === selectedTopicCode);

            // 🚀 INJECTED AUTH UID TO SATISFY FIRESTORE RULE
            const payload = {
                learnerId: learner.id,
                authUid: user?.uid || auth?.currentUser?.uid || learner.authUid,
                learnerName: learner.fullName,
                cohortId: selectedCohortId,
                mentorId: finalMentorId,
                employerId: finalEmployerId,
                placementId: targetPlacement?.id || placementContext?.placementId || existingLog?.placementId || null,
                linkedSubmissionId: linkedSubmissionId || null,
                dateString,
                startTime,
                endTime,
                totalHours,
                isQctoAligned,
                workActivityCode: activeModule?.code || selectedModuleCode || '',
                workActivityLabel: activeModule?.name || '',
                moduleName: activeModule?.name || 'General Workplace Duties',
                topicCode: chosenTopic?.code || selectedTopicCode || '',
                topicTitle: chosenTopic?.title || 'General Workplace Activity',
                tasksPerformed,
                evidenceUrl: finalEvidenceUrl || '',
                status: targetStatus,
                selectedMilestones: isQctoAligned ? selectedMilestones : [],
                customEvidenceTracking: finalizedCustomTrackingPayload,
                cwkEvidence: finalCwkUrls,
                history: structuralHistory,
                rejectionReason: existingLog?.rejectionReason || null,
                createdAt: existingLog?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            if (existingLog?.id) {
                await setDoc(doc(db, 'workplace_logs', existingLog.id), payload, { merge: true });
            } else {
                const docRef = await addDoc(collection(db, 'workplace_logs'), payload);
                console.log('New log document successfully generated with ID:', docRef.id);
            }

            if (typeof fetchWorkplaceLogs === 'function') {
                await fetchWorkplaceLogs();
            }

            if (targetStatus === 'Draft') {
                toast.success("Timesheet progress successfully updated as a draft.");
            } else {
                toast.success("Log submission finalized for supervisor review.");
            }

            onClose();

        } catch (error: any) {
            console.error("❌ Critical error during workplace log save/submission:", error);
            triggerValidationError(error?.message || "Could not write record data changes safely to storage ledger.");
        } finally {
            setIsSaving(false);
            console.groupEnd();
        }
    };

    const quillModules = {
        toolbar: [
            [{ 'header': [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            ['blockquote', 'code-block'],
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],
            [{ 'script': 'sub' }, { 'script': 'super' }],
            [{ 'align': [] }],
            [{ 'color': [] }, { 'background': [] }],
            ['link', 'table'],
            ['clean']
        ]
    };

    const renderCategorizedSubmissionOptions = () => {
        return categorizedSubmissions.map((group, gIdx) => (
            <optgroup key={gIdx} label={group.label}>
                {group.items.map((sub: any) => (
                    <option key={sub.id} value={sub.id}>
                        {sub.moduleNumber ? `[${sub.moduleNumber}] ` : ''}{sub.title || 'Assessment Project'} - {sub.status?.replace(/_/g, ' ').toUpperCase() || 'SUBMITTED'}
                    </option>
                ))}
            </optgroup>
        ));
    };

    const activeSelectedMentor = assignedMentors.find(m => m.id === selectedMentorId);

    return (
        <div className="lfm-overlay" onClick={onClose}>
            <style dangerouslySetInnerHTML={{
                __html: `
                .quill-content-display { word-wrap: break-word !important; overflow-wrap: break-word !important; max-width: 100% !important; }
                .quill-content-display *, .quill-content-display p, .quill-content-display span { word-wrap: break-word !important; overflow-wrap: break-word !important; line-break: anywhere !important; }
                .quill-content-display ul, .quill-content-display ol { padding-left: 20px !important; margin: 6px 0 !important; }
                
                .ql-container.ql-snow { background-color: #ffffff !important; }
                .ql-editor { color: #1e293b !important; background-color: #ffffff !important; font-family: inherit !important; font-size: 0.9rem !important; }
                .ql-editor.ql-blank::before { color: #94a3b8 !important; font-style: normal !important; }
                .ql-toolbar.ql-snow { background-color: #f8fafc !important; border-bottom: 1px solid var(--mlab-border) !important; }
                .ql-toolbar.ql-snow .ql-stroke { stroke: #475569 !important; }
                .ql-toolbar.ql-snow .ql-fill { fill: #475569 !important; }
                .ql-toolbar.ql-snow .ql-picker { color: #475569 !important; }

                .milestones-grid-wrapper {
                    display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto;
                    background: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; margin-top: 8px;
                }
                .milestone-selection-row {
                    display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border-radius: 4px;
                    cursor: pointer; transition: background 0.15s, border 0.15s; user-select: none; border: 1px solid transparent;
                }
                .milestone-selection-row:hover { background: #f1f5f9; }
                .milestone-selection-row.is-checked { background: #e0f2fe; border: 1px solid #bae6fd; border-left: 4px solid #0284c7; }
                .milestone-selection-row.has-history { border-left: 4px solid #16a34a; background: #f0fdf4; }
                .milestone-selection-row.has-history.is-checked { background: #e0f2fe; border-left: 4px solid #0284c7; }
                .milestone-label-text { font-size: 0.8rem; font-weight: 600; color: #334155; line-height: 1.45; }

                .se-card-item {
                    background: #ffffff; border: 1px solid #cbd5e1; border-left: 5px solid #4f46e5;
                    border-radius: 6px; padding: 14px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.05); position: relative;
                }
                .se-card-header { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f1f5f9; padding-bottom: 6px; }
                .se-badge-label { background: #e0e7ff; color: #4338ca; font-weight: 800; font-size: 0.75rem; padding: 3px 8px; border-radius: 4px; }
                
                .se-type-toggle-group { display: inline-flex; background: #f1f5f9; border-radius: 6px; padding: 2px; border: 1px solid #e2e8f0; }
                .se-toggle-btn {
                    display: flex; align-items: center; gap: 4px; font-size: 0.72rem; font-weight: 700;
                    padding: 4px 10px; border-radius: 4px; border: none; cursor: pointer; background: transparent; color: #64748b; transition: all 0.15s;
                }
                .se-toggle-btn.is-active { background: #ffffff; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }

                .chip-mapping-zone { display: flex; flex-direction: column; gap: 6px; background: #f8fafc; padding: 10px; border-radius: 4px; border: 1px solid #e2e8f0; }
                .chip-group { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
                
                .tag-mapping-chip {
                    display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; font-weight: 700;
                    padding: 4px 10px; border-radius: 100px; background: #ffffff; border: 1px solid #cbd5e1;
                    color: #475569; cursor: pointer; transition: all 0.15s ease; user-select: none;
                }
                .tag-mapping-chip:hover { border-color: #94a3b8; background: #f1f5f9; }
                .tag-mapping-chip.is-linked { background: #e0e7ff; color: #4338ca; border-color: #b4c6ff; }
                .tag-mapping-chip.is-linked:hover { background: #ef4444; color: #ffffff; border-color: #ef4444; }
                .chip-action-icon { font-size: 0.68rem; font-weight: 800; opacity: 0.7; }
                
                .se-file-wrapper { display: flex; align-items: center; gap: 10px; margin-top: 2px; }
                .custom-upload-trigger {
                    display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; background: #ffffff;
                    border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.78rem; font-weight: 600; cursor: pointer; color: #344054;
                }
                .custom-upload-trigger:hover { background: #f9fafb; border-color: #b2ddff; }
            ` }} />

            <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Briefcase size={16} />
                        {existingLog?.status === 'Rejected' || existingLog?.rejectionReason ? 'Fix Rejected Timesheet' : (existingLog ? 'Resume Draft Entry' : 'Log Workplace Hours')}
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <form onSubmit={(e) => handleSaveLog(e, 'Pending_Mentor_Approval')} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="lfm-body" ref={modalBodyRef} style={{ maxHeight: '72vh', overflowY: 'auto' }}>

                        {/* 🚀 SUBMISSION ERROR BANNER */}
                        {submissionError && (
                            <div className="lfm-error-banner animate-fade-in" style={{ background: '#fef2f2', color: '#be123c', border: '1px solid #fecaca', padding: '12px', borderRadius: '4px', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{submissionError}</span>
                            </div>
                        )}

                        {existingLog?.rejectionReason && (
                            <div className="lfm-error-banner" style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecaca', marginBottom: '1rem', alignItems: 'flex-start', display: 'flex', gap: '8px' }}>
                                <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div style={{ width: '100%' }}>
                                    <strong style={{ display: 'block', textTransform: 'uppercase', fontSize: '0.75rem', marginBottom: '4px' }}>Mentor's Rejection Note</strong>
                                    <div
                                        className="quill-content-display"
                                        style={{ fontSize: '0.85rem', lineHeight: 1.4, color: '#9f1239' }}
                                        dangerouslySetInnerHTML={{ __html: existingLog.rejectionReason }}
                                    />
                                </div>
                            </div>
                        )}

                        {assignedMentors.length === 0 && !isMentorsLoading && (
                            <div className="lfm-error-banner" style={{ marginBottom: '1rem' }}>
                                <AlertTriangle size={16} />
                                <span>You are currently not assigned to a Mentor for this selection. Your logs cannot be approved.</span>
                            </div>
                        )}

                        {/* WORKPLACE SUPERVISION ROUTING & COHORT ASSIGNMENT */}
                        <div className="lfm-section-hdr"><Users size={13} /> Workplace Supervision &amp; Cohort Routing</div>

                        <div className="lfm-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '0.5rem' }}>
                            {/* COHORT SELECTION */}
                            <div className="lfm-fg">
                                <label style={{ fontWeight: 700, color: MIDNIGHT }}>Select Enrolled Training Cohort Provider *</label>
                                <select
                                    className="lfm-input lfm-select"
                                    required
                                    value={selectedCohortId}
                                    onChange={(e) => {
                                        setSelectedCohortId(e.target.value);
                                        setSelectedModuleCode('');
                                        setSelectedTopicCode('');
                                        setSelectedMilestones([]);
                                        setEvidenceLines([]);
                                        setSubmissionError(null);
                                    }}
                                >
                                    <option value="">-- Choose Your Active Registered Cohort --</option>
                                    {studentCohorts.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.name || c.cohortName || c.title || c.id}</option>
                                    ))}
                                </select>
                            </div>

                            {/* TARGET WORKPLACE SUPERVISOR / MENTOR DROPDOWN */}
                            <div className="lfm-fg">
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: MIDNIGHT }}>
                                    <UserCheck size={14} color="var(--mlab-blue)" /> Target Workplace Supervisor / Mentor *
                                </label>
                                {isMentorsLoading ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                                        <Loader2 size={14} className="lfm-spin" /> Resolving mentors for selected programme...
                                    </div>
                                ) : (
                                    <select
                                        className="lfm-input lfm-select"
                                        required
                                        value={selectedMentorId}
                                        onChange={(e) => {
                                            setSelectedMentorId(e.target.value);
                                            setSubmissionError(null);
                                        }}
                                        style={{ background: 'white', borderLeft: '3px solid var(--mlab-blue)' }}
                                    >
                                        <option value="">-- Choose Target Supervisor --</option>
                                        {assignedMentors.map((m) => (
                                            <option key={m.id} value={m.id}>
                                                {m.name} [{m.type}]{m.email ? ` - ${m.email}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {activeSelectedMentor && (
                                    <span style={{ fontSize: '0.72rem', color: '#166534', fontWeight: 600, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <CheckCircle size={11} /> Routing logbook review to {activeSelectedMentor.name} ({activeSelectedMentor.type})
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* CATEGORIZED ASSESSMENT & CODE PROJECT LINKING SELECTOR */}
                        {learnerSubmissions.length > 0 && (
                            <div className="animate-fade-in" style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '12px', borderRadius: '4px', marginBottom: '1rem' }}>
                                <div className="lfm-fg" style={{ margin: 0 }}>
                                    <label style={{ color: MIDNIGHT, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Code2 size={15} color="var(--mlab-blue)" /> Link Entire Logbook Shift to a Submitted Code Project / Assessment (Optional)
                                    </label>
                                    <select
                                        className="lfm-input lfm-select"
                                        value={linkedSubmissionId}
                                        onChange={(e) => setLinkedSubmissionId(e.target.value)}
                                        style={{ background: 'white', marginTop: '4px' }}
                                    >
                                        <option value="">-- No Direct Assessment Linked --</option>
                                        {renderCategorizedSubmissionOptions()}
                                    </select>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px', display: 'block' }}>
                                        Linking your shift to an assessment submission validates your practical workplace hours against your LMS coursework.
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* DATE & TIME SECTION */}
                        <div className="lfm-section-hdr"><Calendar size={13} /> Date &amp; Time</div>
                        <div className="lfm-grid">
                            <div className="lfm-fg">
                                <label>Date of Work *</label>
                                <input className="lfm-input" type="date" required max={moment().format('YYYY-MM-DD')} value={dateString} onChange={(e) => setDateString(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>Start Time *</label>
                                <input className="lfm-input" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>End Time *</label>
                                <input className="lfm-input" type="time" required value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                            </div>
                            <div className="lfm-fg">
                                <label>Total Hours</label>
                                <div style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '0.55rem 0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.88rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>
                                    {calculateHours().toFixed(1)} hrs
                                </div>
                            </div>

                            {/* 🚀 LIVE ATTENDANCE CROSS-VERIFICATION BANNER */}
                            <div className="lfm-fg" style={{ gridColumn: 'span 4', marginTop: '-4px' }}>
                                {isCheckingScan ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', fontSize: '0.75rem', color: '#64748b' }}>
                                        <Loader2 size={13} className="lfm-spin" color="var(--mlab-blue)" /> Cross-referencing kiosk check-ins and registers for {dateString}...
                                    </div>
                                ) : attendanceScan?.hasScan ? (
                                    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontSize: '0.78rem', fontWeight: 600 }}>
                                        <ShieldCheck size={16} color="#16a34a" style={{ flexShrink: 0 }} />
                                        <span>
                                            ✔️ Attendance Verified ({attendanceScan.status.replace('_', ' ')}): Checked in via {attendanceScan.source === 'kiosk' ? 'TV Kiosk' : 'Class Register'} for {dateString}.
                                        </span>
                                    </div>
                                ) : (
                                    <div className="animate-fade-in" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c', fontSize: '0.78rem', fontWeight: 600 }}>
                                        <AlertTriangle size={16} color="#f97316" style={{ flexShrink: 0 }} />
                                        <span>
                                            ⚠️ Unverified Scan: No check-in record found on file for {dateString}. Ensure you scanned at the kiosk or were marked present on the class register.
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><Layers size={13} /> Curriculum Alignment</div>
                        <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                            <label className="lfm-checkbox-row">
                                <input type="checkbox" checked={isQctoAligned} onChange={(e) => setIsQctoAligned(e.target.checked)} />
                                <span>Align this entry to official curriculum milestones &amp; modules</span>
                            </label>
                        </div>

                        {isQctoAligned && selectedCohortId && (
                            <div className="lfm-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
                                <div className="lfm-fg">
                                    <label>Select Work Activity / Module *</label>
                                    {isTemplateLoading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                                            <Loader2 size={14} className="lfm-spin" /> Fetching core guideline blueprints...
                                        </div>
                                    ) : (
                                        <select className="lfm-input lfm-select" required value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
                                            <option value="">-- Select Module --</option>
                                            {dynamicModules.map((m: any, idx: number) => {
                                                const codeVal = m.code || m.id || m.name;
                                                const labelVal = m.name || m.title || m.label || codeVal;
                                                return (
                                                    <option key={idx} value={codeVal}>{m.code ? `${m.code} - ` : ''}{labelVal}</option>
                                                );
                                            })}
                                        </select>
                                    )}
                                </div>

                                {!isTemplateLoading && moduleTopics.length > 0 && (
                                    <div className="lfm-fg animate-fade-in">
                                        <label>Select Specific Topic Element / Activity *</label>
                                        <select className="lfm-input lfm-select" required value={selectedTopicCode} onChange={(e) => setSelectedTopicCode(e.target.value)} style={{ borderLeft: '3px solid var(--mlab-blue)' }}>
                                            <option value="">-- Select Topic Element --</option>
                                            {moduleTopics.map((t: any, idx: number) => {
                                                const codeVal = t.code || t.id || t.title || '';
                                                const titleVal = t.title || t.name || t.label || codeVal;
                                                return (
                                                    <option key={idx} value={codeVal}>{codeVal ? `${codeVal} - ` : ''}{titleVal}</option>
                                                );
                                            })}
                                        </select>
                                    </div>
                                )}

                                {/* WORK ACTIVITIES / PRACTICAL CRITERIA */}
                                {!isTemplateLoading && filteredWorkActivities.length > 0 && (
                                    <div className="lfm-fg animate-fade-in" style={{ marginTop: '0.25rem' }}>
                                        <label style={{ color: 'var(--mlab-blue)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            Select Completed Work Activities Covered Today *
                                            {isHistoryLoading && <Loader2 size={12} className="lfm-spin" color="#64748b" />}
                                        </label>
                                        <div className="milestones-grid-wrapper">
                                            {filteredWorkActivities.map((milestone: any) => {
                                                const isChecked = selectedMilestones.includes(milestone.id);
                                                return (
                                                    <div
                                                        key={milestone.id}
                                                        className={`milestone-selection-row ${isChecked ? 'is-checked' : ''} ${milestone.isPreviouslyApproved ? 'has-history' : ''}`}
                                                        onClick={() => handleToggleMilestone(milestone.id)}
                                                    >
                                                        <div style={{ marginTop: '2px', color: isChecked ? '#0284c7' : (milestone.isPreviouslyApproved ? '#16a34a' : '#94a3b8'), display: 'flex', alignItems: 'center' }}>
                                                            {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                                                        </div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                            <span className="milestone-label-text">{milestone.label}</span>
                                                            {milestone.isPreviouslyApproved && (
                                                                <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                                    <History size={11} /> ✔️ Approved across {milestone.loggedCount} previous logs (~{milestone.accumulatedHours.toFixed(1)} total hours exposure)
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* CONTEXTUAL KNOWLEDGE (CWK) PANEL */}
                                {!isTemplateLoading && dynamicCwkMetrics.length > 0 && (
                                    <div className="lfm-fg animate-fade-in" style={{ marginTop: '0.75rem' }}>
                                        <label style={{ color: '#0f766e', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            Select Contextualized Workplace Knowledge Addressed
                                        </label>
                                        <div className="milestones-grid-wrapper" style={{ maxHeight: 'auto', borderColor: '#ccfbf1', background: '#f0fdf4' }}>
                                            {dynamicCwkMetrics.map((milestone: any) => {
                                                const isChecked = selectedMilestones.includes(milestone.code);
                                                const historyStats = historicalMilestoneMetrics[milestone.code];
                                                const wasCoveredInPastLogs = !!historyStats && historyStats.count > 0;

                                                return (
                                                    <div key={milestone.code} style={{ display: 'flex', flexDirection: 'column' }}>
                                                        <div
                                                            className={`milestone-selection-row ${isChecked ? 'is-checked' : ''} ${wasCoveredInPastLogs ? 'has-history' : ''}`}
                                                            onClick={() => handleToggleMilestone(milestone.code)}
                                                            style={{ marginBottom: isChecked ? '0' : '4px', borderBottomLeftRadius: isChecked ? '0' : '4px', borderBottomRightRadius: isChecked ? '0' : '4px' }}
                                                        >
                                                            <div style={{ marginTop: '2px', color: isChecked ? '#0284c7' : (wasCoveredInPastLogs ? '#16a34a' : '#94a3b8'), display: 'flex', alignItems: 'center' }}>
                                                                {isChecked ? <CheckSquare size={16} /> : <Square size={16} />}
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                                                <span className="milestone-label-text">{milestone.code}: {milestone.label}</span>
                                                                {wasCoveredInPastLogs && (
                                                                    <span style={{ fontSize: '0.68rem', color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                                        <History size={11} /> ✔️ Approved across {historyStats.count} previous logs
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* CWK DEDICATED UPLOADER */}
                                                        {isChecked && (
                                                            <div className="animate-fade-in" style={{ padding: '10px 12px', background: '#fff1f2', border: '1px solid #fecdd3', borderTop: 'none', borderBottomLeftRadius: '4px', borderBottomRightRadius: '4px', marginBottom: '8px' }}>
                                                                <div style={{ fontSize: '0.72rem', color: '#be123c', fontWeight: 700, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <AlertTriangle size={12} /> Specific Proof Document Required
                                                                </div>
                                                                <div className="se-file-wrapper" style={{ marginTop: 0 }}>
                                                                    <input
                                                                        type="file"
                                                                        id={`cwk-file-${milestone.code}`}
                                                                        style={{ display: 'none' }}
                                                                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                                                                        onChange={(e) => {
                                                                            if (e.target.files && e.target.files[0]) {
                                                                                setCwkFiles(prev => ({ ...prev, [milestone.code]: e.target.files![0] }));
                                                                            }
                                                                        }}
                                                                    />
                                                                    <label htmlFor={`cwk-file-${milestone.code}`} className="custom-upload-trigger" style={{ borderColor: '#fecaca', color: '#9f1239', background: '#fff' }}>
                                                                        <UploadCloud size={13} />
                                                                        {cwkFiles[milestone.code] ? 'Replace Proof File' : 'Upload*'}
                                                                    </label>

                                                                    {cwkFiles[milestone.code] && (
                                                                        <span style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600 }}>
                                                                            📎 {cwkFiles[milestone.code]?.name}
                                                                        </span>
                                                                    )}

                                                                    {cwkUrls[milestone.code] && !cwkFiles[milestone.code] && (
                                                                        <a
                                                                            href={cwkUrls[milestone.code]}
                                                                            target="_blank"
                                                                            rel="noreferrer"
                                                                            style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                                        >
                                                                            <CheckCircle size={12} color="#16a34a" /> View Saved Proof
                                                                        </a>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {isQctoAligned && !selectedCohortId && (
                            <div style={{ fontSize: '0.8rem', color: '#0284c7', background: '#e0f2fe', padding: '0.75rem', border: '1px solid #bae6fd', borderRadius: '4px' }}>
                                💡 Please select your active training cohort above to unlock and inspect qualification curriculum structures.
                            </div>
                        )}

                        {/* PORTFOLIO BINDER WITH CATEGORIZED CODE PROJECT / ASSESSMENT OPTION */}
                        {isQctoAligned && selectedTopicCode && (
                            <div className="lfm-fg animate-fade-in" style={{ marginTop: '1.25rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <label style={{ color: '#4f46e5', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <Tag size={14} /> Supporting Evidence Portfolio Binder (Optional)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleAddNewEmptyEvidenceLine}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', background: '#e0e7ff', color: '#4338ca', border: 'none', padding: '5px 10px', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        <Plus size={12} /> Add Supporting Evidence Asset (SE)
                                    </button>
                                </div>

                                {evidenceLines.length === 0 ? (
                                    <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '6px', padding: '16px', textAlign: 'center', fontSize: '0.8rem', color: '#64748b' }}>
                                        No specific artifact assets or links are bound to this shift. If you have generated code repos, diagrams, or submitted code projects, click the button above to add multiple labeled SE records.
                                    </div>
                                ) : (
                                    <div>
                                        {evidenceLines.map((item, index) => (
                                            <div key={index} className="se-card-item">
                                                <div className="se-card-header">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span className="se-badge-label">{item.code}</span>

                                                        <div className="se-type-toggle-group">
                                                            <button
                                                                type="button"
                                                                className={`se-toggle-btn ${item.type === 'file' ? 'is-active' : ''}`}
                                                                onClick={() => handleUpdateEvidenceMeta(index, 'type', 'file')}
                                                            >
                                                                <FileText size={11} /> File
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className={`se-toggle-btn ${item.type === 'link' ? 'is-active' : ''}`}
                                                                onClick={() => handleUpdateEvidenceMeta(index, 'type', 'link')}
                                                            >
                                                                <Link2 size={11} /> Web Link
                                                            </button>
                                                            {learnerSubmissions.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    className={`se-toggle-btn ${item.type === 'assessment' ? 'is-active' : ''}`}
                                                                    onClick={() => handleUpdateEvidenceMeta(index, 'type', 'assessment')}
                                                                >
                                                                    <Code2 size={11} /> Code Project
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveEvidenceLine(index)}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }}
                                                        title="Remove Evidence Item"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Evidence Name / Context Title *</span>
                                                    <input
                                                        type="text"
                                                        className="lfm-input"
                                                        placeholder={item.type === 'link' ? "e.g., GitHub Branch Repository Link" : item.type === 'assessment' ? "e.g., Assessment Submission Project" : "e.g., Machine Pre-start Checklist Log Sheet..."}
                                                        value={item.description}
                                                        onChange={(e) => handleUpdateEvidenceMeta(index, 'description', e.target.value)}
                                                        style={{ height: '34px', fontSize: '0.8rem' }}
                                                    />
                                                </div>

                                                {item.type === 'file' ? (
                                                    <div className="se-file-wrapper">
                                                        <input
                                                            type="file"
                                                            id={`file-picker-${index}`}
                                                            style={{ display: 'none' }}
                                                            accept=".pdf,.png,.jpg,.jpeg,.webp"
                                                            onChange={(e) => {
                                                                if (e.target.files && e.target.files[0]) {
                                                                    handleUpdateEvidenceMeta(index, 'file', e.target.files[0]);
                                                                }
                                                            }}
                                                        />
                                                        <label htmlFor={`file-picker-${index}`} className="custom-upload-trigger">
                                                            <UploadCloud size={13} />
                                                            {item.file ? 'Replace File' : 'Upload Document *'}
                                                        </label>

                                                        {item.file && (
                                                            <span style={{ fontSize: '0.75rem', color: '#0f172a', fontWeight: 600 }}>
                                                                📎 {item.file.name} ({(item.file.size / 1024 / 1024).toFixed(2)}MB)
                                                            </span>
                                                        )}

                                                        {item.fileUrl && !item.file && (
                                                            <a
                                                                href={item.fileUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ fontSize: '0.75rem', color: '#2563eb', textDecoration: 'underline', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                            >
                                                                <CheckCircle size={12} color="#16a34a" /> View Saved Cloud File
                                                            </a>
                                                        )}
                                                    </div>
                                                ) : item.type === 'assessment' ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Select Submitted Assessment Project *</span>
                                                        <select
                                                            className="lfm-input lfm-select"
                                                            value={item.linkedSubmissionId || ''}
                                                            onChange={(e) => handleUpdateEvidenceMeta(index, 'linkedSubmissionId', e.target.value)}
                                                            style={{ height: '34px', fontSize: '0.8rem' }}
                                                        >
                                                            <option value="">-- Choose Assessment Project --</option>
                                                            {renderCategorizedSubmissionOptions()}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569' }}>Paste Hyperlink Address (URL) *</span>
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                                            <Link2 size={13} color="#94a3b8" style={{ position: 'absolute', left: '10px' }} />
                                                            <input
                                                                type="url"
                                                                className="lfm-input"
                                                                placeholder="https://github.com/workspace/project-repo"
                                                                value={item.fileUrl || ''}
                                                                onChange={(e) => handleUpdateEvidenceMeta(index, 'fileUrl', e.target.value)}
                                                                style={{ height: '34px', fontSize: '0.8rem', paddingLeft: '30px' }}
                                                            />
                                                        </div>
                                                        {item.fileUrl && item.fileUrl.startsWith('http') && (
                                                            <a
                                                                href={item.fileUrl}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                style={{ fontSize: '0.72rem', color: '#4f46e5', fontWeight: 600, marginTop: '2px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                                                            >
                                                                🔗 Test Destination Redirect URL <ExternalLink size={10} />
                                                            </a>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="chip-mapping-zone">
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Tag size={11} /> Link this SE artifact to today's Work Activities (Select at least one) *
                                                    </span>
                                                    {selectedMilestones.length === 0 ? (
                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                            ⚠️ Please check at least one Work Activity checkbox above to reveal target linking chips.
                                                        </span>
                                                    ) : (
                                                        <div className="chip-group">
                                                            {selectedMilestones.map(waCode => {
                                                                if (waCode.startsWith('CWK')) return null;

                                                                const isLinked = item.linkedWorkActivities.includes(waCode);
                                                                return (
                                                                    <div
                                                                        key={waCode}
                                                                        className={`tag-mapping-chip ${isLinked ? 'is-linked' : ''}`}
                                                                        onClick={() => handleToggleWaLinkToEvidence(index, waCode)}
                                                                        title={isLinked ? "Click to close/remove link" : "Click to add link"}
                                                                    >
                                                                        {waCode}
                                                                        <span className="chip-action-icon">
                                                                            {isLinked ? '✕' : '+'}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* TASKS PERFORMED WITH LIVE CHARACTER COUNTER */}
                        <div className="lfm-section-hdr" style={{ marginTop: '1rem' }}><Info size={13} /> Tasks Performed / Narrative Notes</div>

                        <div className="lfm-fg">
                            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>Detailed Reflection Summary *</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: plainTextLength >= 20 ? '#16a34a' : '#dc2626' }}>
                                    {plainTextLength} / 20 min chars {plainTextLength >= 20 ? '✓' : '⚠️'}
                                </span>
                            </label>
                            <div style={{ background: 'white', borderRadius: '4px', border: `1px solid ${submissionError && plainTextLength < 20 ? '#ef4444' : 'var(--mlab-border)'}`, overflow: 'hidden' }}>
                                <ReactQuill
                                    theme="snow"
                                    value={tasksPerformed}
                                    onChange={(content) => {
                                        setTasksPerformed(content);
                                        if (submissionError) setSubmissionError(null);
                                    }}
                                    modules={quillModules}
                                    placeholder="Describe tasks completed, tools used, and outcomes achieved..."
                                    style={{ height: '150px', marginBottom: '42px' }}
                                />
                            </div>
                        </div>

                        <div className="lfm-fg" style={{ marginTop: '0.5rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <UploadCloud size={14} color="var(--mlab-grey)" /> Attach Overall Global Timesheet Verification (Optional Summary Attachment)
                            </label>

                            {evidenceUrl && !evidenceFile && (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ background: '#dcfce7', padding: '6px', borderRadius: '4px' }}>
                                            <CheckCircle size={16} color="#166534" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: MIDNIGHT }}>Existing Summary Attached</div>
                                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: '2px' }}>Uploading a new file below will replace this template.</div>
                                        </div>
                                    </div>
                                    <a
                                        href={evidenceUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ background: 'white', border: '1px solid #cbd5e1', color: '#0f172a', padding: '6px 12px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                                    >
                                        <ExternalLink size={14} /> View File
                                    </a>
                                </div>
                            )}

                            <input
                                type="file"
                                className="lfm-input"
                                style={{ padding: '8px', fontSize: '0.85rem' }}
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const file = e.target.files[0];
                                        const maxBytes = 5 * 1024 * 1024;

                                        if (file.size > maxBytes) {
                                            toast.error("File is too large. Please upload an image or PDF under 5MB.");
                                            e.target.value = "";
                                            return;
                                        }
                                        setEvidenceFile(file);
                                    }
                                }}
                            />
                        </div>

                    </div>

                    <div className="lfm-footer" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving} style={{ marginRight: 'auto' }}>Cancel</button>

                        <button
                            type="button"
                            className="lfm-btn"
                            onClick={(e) => handleSaveLog(e, 'Draft')}
                            disabled={isSaving || !selectedMentorId || !selectedCohortId}
                            style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <Save size={13} />} Save Draft
                        </button>

                        <button
                            type="submit"
                            className="lfm-btn lfm-btn--primary"
                            disabled={isSaving || !selectedMentorId || !selectedCohortId}
                        >
                            {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Submitting…</> : <><Save size={13} /> {existingLog?.rejectionReason ? 'Resubmit to Mentor' : 'Submit Logbook'}</>}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
};