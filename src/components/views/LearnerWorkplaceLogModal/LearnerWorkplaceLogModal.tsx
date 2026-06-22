// src/components/views/LearnerWorkplaceLogModal/LearnerWorkplaceLogModal.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, Loader2, Briefcase, Calendar, Layers, Info, AlertTriangle, UploadCloud, CheckCircle, ExternalLink, CheckSquare, Square, History, Plus, Trash2, Tag, Link2, FileText } from 'lucide-react';
import { collection, addDoc, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../../lib/firebase';
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
    type: 'file' | 'link';
    file: File | null;
    fileUrl?: string;
    linkedWorkActivities: string[];
    uploadedAt: string;
}

interface LearnerWorkplaceLogModalProps {
    learner: any;
    existingLog?: any;
    // 🚀 Context payload containing the specific employment bounds mapped from the unified view
    placementContext?: { placementId?: string, employerId?: string, mentorId?: string };
    onClose: () => void;
}

export const LearnerWorkplaceLogModal: React.FC<LearnerWorkplaceLogModalProps> = ({ learner, existingLog, placementContext, onClose }) => {
    const toast = useToast();
    const { cohorts, fetchCohorts } = useStore() as any;
    const [isSaving, setIsSaving] = useState(false);

    // ─── 🚀 DEBUG INJECTION: LOG CONTEXT ON MOUNT ───
    useEffect(() => {
        console.group('🚀 [DEBUG] MODAL MOUNT: INJECTED PLACEMENT CONTEXT');
        console.log('Raw Placement Context Prop:', placementContext);
        console.log('Fallback Learner Object IDs:', {
            employerId: learner?.employerId,
            mentorId: learner?.mentorId
        });
        console.log('Final Resolved Mentor ID:', placementContext?.mentorId || learner?.mentorId);
        console.log('Final Resolved Employer ID:', placementContext?.employerId || learner?.employerId);
        console.groupEnd();
    }, [placementContext, learner]);

    // ─── FORM STATE ───
    const [selectedCohortId, setSelectedCohortId] = useState(existingLog ? existingLog.cohortId : (learner.cohortId || ''));
    const [dateString, setDateString] = useState(existingLog ? existingLog.dateString : moment().format('YYYY-MM-DD'));
    const [startTime, setStartTime] = useState(existingLog ? existingLog.startTime : '08:00');
    const [endTime, setEndTime] = useState(existingLog ? existingLog.endTime : '16:00');
    const [isQctoAligned, setIsQctoAligned] = useState(existingLog ? existingLog.isQctoAligned : true);
    const [selectedModuleCode, setSelectedModuleCode] = useState(existingLog ? existingLog.workActivityCode : '');
    const [selectedTopicCode, setSelectedTopicCode] = useState(existingLog ? existingLog.topicCode : '');
    const [tasksPerformed, setTasksPerformed] = useState(existingLog ? existingLog.tasksPerformed : '');

    // Dynamic Curriculum Blueprints
    const [dynamicModules, setDynamicModules] = useState<any[]>([]);
    const [isTemplateLoading, setIsTemplateLoading] = useState<boolean>(false);

    // Checked Work Activities (WA codes) + Contextual Knowledge Codes (CWK)
    const [selectedMilestones, setSelectedMilestones] = useState<string[]>(existingLog?.selectedMilestones || []);

    // Supporting Evidence Portfolio Lines
    const [evidenceLines, setEvidenceLines] = useState<EvidenceLineItem[]>([]);

    // ─── CWK DEDICATED EVIDENCE STATE ───
    const [cwkFiles, setCwkFiles] = useState<Record<string, File | null>>({});
    const [cwkUrls, setCwkUrls] = useState<Record<string, string>>(existingLog?.cwkEvidence || {});

    // Historical Exposure Analytics
    const [historicalMilestoneMetrics, setHistoricalMilestoneMetrics] = useState<Record<string, HistoricalMetrics>>({});
    const [isHistoryLoading, setIsHistoryLoading] = useState<boolean>(false);

    // Global Log Level Summary Attachment
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
    const [evidenceUrl, setEvidenceUrl] = useState(existingLog ? existingLog.evidenceUrl : '');

    // Sync store cohorts
    useEffect(() => {
        if (!cohorts || cohorts.length === 0) {
            if (typeof fetchCohorts === 'function') fetchCohorts();
        }
    }, [cohorts, fetchCohorts]);

    // Hydrate evidence matrix if editing
    useEffect(() => {
        if (existingLog && Array.isArray(existingLog.customEvidenceTracking)) {
            setEvidenceLines(existingLog.customEvidenceTracking.map((item: any) => ({
                code: item.code,
                description: item.description || '',
                type: item.type || 'file',
                file: null,
                fileUrl: item.fileUrl || '',
                linkedWorkActivities: item.linkedWorkActivities || [],
                uploadedAt: item.uploadedAt || new Date().toISOString()
            })));
        } else {
            setEvidenceLines([]);
        }
    }, [existingLog]);

    // Historical Metrics Pipeline
    useEffect(() => {
        const analyzeHistoricalLogsPipeline = async () => {
            if (!learner?.id) return;
            setIsHistoryLoading(true);
            try {
                const logsQuery = query(
                    collection(db, 'workplace_logs'),
                    where('learnerId', '==', learner.id),
                    where('status', '==', 'Approved')
                );

                const querySnapshot = await getDocs(logsQuery);
                const metricsMap: Record<string, HistoricalMetrics> = {};

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

                setHistoricalMilestoneMetrics(metricsMap);
            } catch (err) {
                console.error("Error aggregating historical milestones:", err);
            } finally {
                setIsHistoryLoading(false);
            }
        };

        analyzeHistoricalLogsPipeline();
    }, [learner.id, existingLog]);

    // Filter Cohorts
    const studentCohorts = useMemo(() => {
        if (!cohorts || cohorts.length === 0) return [];
        return cohorts.filter((c: any) => {
            const isPrimaryCohort = c.id === learner.cohortId;
            const inCohortIdArray = Array.isArray(learner.cohortIds) && learner.cohortIds.includes(c.id);
            const listedInsideCohortMembers = Array.isArray(c.learnerIds) && c.learnerIds.includes(learner.id);
            return isPrimaryCohort || inCohortIdArray || listedInsideCohortMembers;
        });
    }, [cohorts, learner]);

    useEffect(() => {
        if (studentCohorts.length === 1 && !selectedCohortId) {
            setSelectedCohortId(studentCohorts[0].id);
        }
    }, [studentCohorts, selectedCohortId]);

    // Resolve curriculum templates
    useEffect(() => {
        const fetchCurriculumForSelectedCohort = async () => {
            if (!selectedCohortId) {
                setDynamicModules([]);
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
                            setDynamicModules(progSnap.data().workExperienceModules || []);
                            setIsTemplateLoading(false);
                            return;
                        }
                        const qualSnap = await getDoc(doc(db, 'qualifications', targetProgId));
                        if (qualSnap.exists()) {
                            setDynamicModules(qualSnap.data().workExperienceModules || []);
                            setIsTemplateLoading(false);
                            return;
                        }
                    }
                }
                setDynamicModules(learner.workExperienceModules || []);
            } catch (err) {
                console.error("Failed to map blueprint modules:", err);
                setDynamicModules(learner.workExperienceModules || []);
            } finally {
                setIsTemplateLoading(false);
            }
        };

        fetchCurriculumForSelectedCohort();
    }, [selectedCohortId, learner.workExperienceModules]);

    const activeModule = useMemo(() => {
        if (!selectedModuleCode || !dynamicModules.length) return null;
        return dynamicModules.find((m: any) => (m.code || m.name) === selectedModuleCode);
    }, [dynamicModules, selectedModuleCode]);

    const moduleTopics = useMemo(() => {
        if (!activeModule) return [];
        return activeModule.topics || [];
    }, [activeModule]);

    // ─── 🚀 PARSE WORK ACTIVITIES DYNAMICALLY FROM TOPIC BLUEPRINT ───
    const filteredWorkActivities = useMemo(() => {
        if (!isQctoAligned || !selectedTopicCode || !moduleTopics.length) return [];

        const chosenTopic = moduleTopics.find((t: any) => t.code === selectedTopicCode);
        if (!chosenTopic || !chosenTopic.criteria || !Array.isArray(chosenTopic.criteria)) return [];

        const waCriteria = chosenTopic.criteria.filter((c: any) => c.code?.startsWith('WA'));

        return waCriteria.map((c: any) => {
            const historyStats = historicalMilestoneMetrics[c.code];
            const wasCoveredInPastLogs = !!historyStats && historyStats.count > 0;

            return {
                id: c.code,
                label: `${c.code}: ${c.description || c.label || c.title || c.code}`,
                isPreviouslyApproved: wasCoveredInPastLogs,
                loggedCount: historyStats?.count || 0,
                accumulatedHours: historyStats?.totalHours || 0
            };
        }).sort((a: any, b: any) => a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' }));
    }, [isQctoAligned, selectedTopicCode, moduleTopics, historicalMilestoneMetrics]);

    // ─── 🚀 NEW: PARSE CONTEXTUAL KNOWLEDGE METRICS DYNAMICALLY FROM TOPIC BLUEPRINT ───
    const dynamicCwkMetrics = useMemo(() => {
        if (!isQctoAligned || !selectedTopicCode || !moduleTopics.length) return [];

        const chosenTopic = moduleTopics.find((t: any) => t.code === selectedTopicCode);
        if (!chosenTopic || !chosenTopic.criteria || !Array.isArray(chosenTopic.criteria)) return [];

        const cwkCriteria = chosenTopic.criteria.filter((c: any) => c.code?.startsWith('CWK'));

        return cwkCriteria.map((c: any) => ({
            code: c.code,
            label: c.description || c.label || c.title || c.code
        })).sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }, [isQctoAligned, selectedTopicCode, moduleTopics]);

    // Create a dictionary of all metrics to quickly translate codes to labels
    const milestoneDescriptionsLookup = useMemo(() => {
        const dictionaryMap: Record<string, string> = {};
        if (!moduleTopics || !Array.isArray(moduleTopics)) return dictionaryMap;

        moduleTopics.forEach((topic: any) => {
            if (topic.criteria && Array.isArray(topic.criteria)) {
                topic.criteria.forEach((criterion: any) => {
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
        const chosenTopic = moduleTopics.find((t: any) => t.code === selectedTopicCode);
        const sampleWa = chosenTopic?.criteria?.find((c: any) => c.code?.startsWith('WA'))?.code || '';
        return sampleWa ? sampleWa.substring(2, 4) : '01';
    }, [selectedTopicCode, moduleTopics]);

    // ─── EVIDENCE ACTIONS ───
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
                return { ...item, type: value, file: null, fileUrl: '' };
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
            setSelectedModuleCode(dynamicModules[0].code || dynamicModules[0].name);
        }
    }, [dynamicModules, selectedModuleCode]);

    useEffect(() => {
        if (moduleTopics.length > 0 && !selectedTopicCode) {
            setSelectedTopicCode(moduleTopics[0].code || '');
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

    // ─── PERSISTENCE STORAGE SAVING ENGINE ───
    const handleSaveLog = async (e: React.FormEvent, targetStatus: 'Draft' | 'Pending_Mentor_Approval') => {
        e.preventDefault();

        const finalMentorId = placementContext?.mentorId || learner.mentorId;
        const finalEmployerId = placementContext?.employerId || learner.employerId;

        if (!selectedCohortId) {
            toast.error("Compliance lock: You must select your active training cohort.");
            return;
        }

        const totalHours = calculateHours();
        if (totalHours <= 0) {
            toast.error("End time must be after start time.");
            return;
        }

        const plainTextDescription = tasksPerformed.replace(/(<([^>]+)>)/gi, "").trim();

        if (targetStatus === 'Pending_Mentor_Approval' && plainTextDescription.length < 20) {
            toast.error("Please provide a more detailed narrative description of tasks completed.");
            return;
        }

        if (isQctoAligned && targetStatus === 'Pending_Mentor_Approval' && selectedMilestones.length === 0) {
            toast.error("Compliance rules require you to map at least one complete curriculum metric.");
            return;
        }

        // ─── 🚀 STRICT INLINE DYNAMIC CWK EVIDENCE VALIDATION ───
        if (isQctoAligned && targetStatus === 'Pending_Mentor_Approval') {
            const selectedCwkCodes = selectedMilestones.filter(code => code.startsWith('CWK'));

            for (const cwkCode of selectedCwkCodes) {
                if (!cwkFiles[cwkCode] && !cwkUrls[cwkCode]) {
                    // 🚀 Translation read directly from dynamic parsed lookup maps
                    const dynamicLabelStr = milestoneDescriptionsLookup[cwkCode] || cwkCode;
                    toast.error(`Missing Evidence: You checked "${dynamicLabelStr}". You must upload proof directly below the checkbox.`);
                    return;
                }
            }
        }

        if (evidenceLines.length > 0) {
            for (let i = 0; i < evidenceLines.length; i++) {
                const line = evidenceLines[i];
                if (!line.description.trim()) {
                    toast.error(`Compliance breach: ${line.code} requires a clear context summary name.`);
                    return;
                }
                if (line.type === 'link') {
                    if (!line.fileUrl || !line.fileUrl.trim().startsWith('http')) {
                        toast.error(`Compliance breach: ${line.code} requires a secure web link URL address.`);
                        return;
                    }
                } else {
                    if (!line.file && !line.fileUrl) {
                        toast.error(`Compliance breach: ${line.code} has no active physical document file attached.`);
                        return;
                    }
                }
                if (line.linkedWorkActivities.length === 0) {
                    toast.error(`Compliance breach: ${line.code} must be linked to at least one valid Work Activity chip.`);
                    return;
                }
            }
        }

        if (!finalMentorId || !finalEmployerId) {
            toast.error("You must be assigned to an active Employer and Mentor to log pipeline entries.");
            return;
        }

        setIsSaving(true);

        try {
            const storageInstance = getStorage();
            let finalEvidenceUrl = evidenceUrl;

            // Upload Global Attachment
            if (evidenceFile) {
                try {
                    const fileExtension = evidenceFile.name.split('.').pop();
                    const storageRef = ref(storageInstance, `workplace_evidence/${learner.id}/${Date.now()}_summary_proof.${fileExtension}`);
                    const snapshot = await uploadBytes(storageRef, evidenceFile);
                    finalEvidenceUrl = await getDownloadURL(snapshot.ref);
                } catch (err) {
                    console.error("Summary attachment error:", err);
                }
            }

            // Upload Custom SE Lines
            const finalizedCustomTrackingPayload: any[] = [];
            for (const item of evidenceLines) {
                if (item.type === 'link') {
                    finalizedCustomTrackingPayload.push({
                        code: item.code,
                        description: item.description,
                        type: 'link',
                        fileUrl: item.fileUrl?.trim() || '',
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
                        linkedWorkActivities: item.linkedWorkActivities,
                        uploadedAt: item.uploadedAt
                    });
                    continue;
                }

                if (item.type === 'file' && item.file) {
                    try {
                        const fileExt = item.file.name.split('.').pop();
                        const fileRef = ref(storageInstance, `workplace_evidence/${learner.id}/${Date.now()}_${item.code}_doc.${fileExt}`);
                        const uploadSnapshot = await uploadBytes(fileRef, item.file);
                        const secureUrl = await getDownloadURL(uploadSnapshot.ref);

                        finalizedCustomTrackingPayload.push({
                            code: item.code,
                            description: item.description,
                            type: 'file',
                            fileUrl: secureUrl,
                            linkedWorkActivities: item.linkedWorkActivities,
                            uploadedAt: item.uploadedAt
                        });
                    } catch (err) {
                        console.error(`Error processing file node ${item.code}:`, err);
                    }
                }
            }

            // Upload CWK Specific Evidence Files
            const finalCwkUrls = { ...cwkUrls };
            const selectedCwkCodes = selectedMilestones.filter(code => code.startsWith('CWK'));

            for (const cwkCode of selectedCwkCodes) {
                const cwkFile = cwkFiles[cwkCode];
                if (cwkFile) {
                    try {
                        const fileExt = cwkFile.name.split('.').pop();
                        const fileRef = ref(storageInstance, `workplace_evidence/${learner.id}/${Date.now()}_${cwkCode}_proof.${fileExt}`);
                        const uploadSnapshot = await uploadBytes(fileRef, cwkFile);
                        finalCwkUrls[cwkCode] = await getDownloadURL(uploadSnapshot.ref);
                    } catch (err) {
                        console.error(`Error processing CWK file ${cwkCode}:`, err);
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

            const chosenTopic = moduleTopics.find((t: any) => t.code === selectedTopicCode);

            const payload = {
                learnerId: learner.id,
                learnerName: learner.fullName,
                cohortId: selectedCohortId,
                mentorId: finalMentorId,
                employerId: finalEmployerId,
                placementId: placementContext?.placementId || existingLog?.placementId || null,
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

            // 🚀 DEBUG: DUMP THE ENTIRE PAYLOAD BEFORE WRITE
            console.group('🚀 [DEBUG] LOG ENTRY DB PAYLOAD READY FOR COMMIT');
            console.log('Target Collection: workplace_logs');
            console.log('Mapped Employer ID:', payload.employerId);
            console.log('Mapped Mentor ID:', payload.mentorId);
            console.log('Mapped Placement ID:', payload.placementId);
            console.log('Full Payload object:', payload);
            console.groupEnd();

            if (existingLog?.id) {
                await setDoc(doc(db, 'workplace_logs', existingLog.id), payload, { merge: true });
            } else {
                await addDoc(collection(db, 'workplace_logs'), payload);
            }

            if (targetStatus === 'Draft') {
                toast.success("Timesheet progress successfully updated as a draft.");
            } else {
                toast.success("Log submission finalized for supervisor review.");
            }

            onClose();
        } catch (error) {
            console.error("Critical write error on logbook entry:", error);
            toast.error("Could not write record data changes safely to storage ledger.");
        } finally {
            setIsSaving(false);
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
            `}} />

            <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '850px' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <Briefcase size={16} />
                        {existingLog?.status === 'Rejected' || existingLog?.rejectionReason ? 'Fix Rejected Timesheet' : (existingLog ? 'Resume Draft Entry' : 'Log Workplace Hours')}
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                </div>

                <form onSubmit={(e) => handleSaveLog(e, 'Pending_Mentor_Approval')} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="lfm-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>

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

                        {!(placementContext?.mentorId || learner.mentorId) && (
                            <div className="lfm-error-banner" style={{ marginBottom: '1rem' }}>
                                <AlertTriangle size={16} />
                                <span>You are currently not assigned to a Mentor. Your logs cannot be approved.</span>
                            </div>
                        )}

                        <div className="lfm-section-hdr"><Layers size={13} /> Cohort Assignment</div>
                        <div className="lfm-grid" style={{ gridTemplateColumns: '1fr', marginBottom: '0.5rem' }}>
                            <div className="lfm-fg">
                                <label>Select Enrolled Training Cohort Provider *</label>
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
                                    }}
                                >
                                    <option value="">-- Choose Your Active Registered Cohort --</option>
                                    {studentCohorts.map((c: any) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

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
                        </div>

                        <div className="lfm-section-hdr" style={{ marginTop: '0.5rem' }}><Layers size={13} /> QCTO Alignment</div>
                        <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                            <label className="lfm-checkbox-row">
                                <input type="checkbox" checked={isQctoAligned} onChange={(e) => setIsQctoAligned(e.target.checked)} />
                                <span>Align this entry to official QCTO curriculum milestones</span>
                            </label>
                        </div>

                        {isQctoAligned && selectedCohortId && (
                            <div className="lfm-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
                                <div className="lfm-fg">
                                    <label>Select Work Activity Module *</label>
                                    {isTemplateLoading ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.5rem', color: '#64748b', fontSize: '0.85rem' }}>
                                            <Loader2 size={14} className="lfm-spin" /> Fetching core guideline blueprints...
                                        </div>
                                    ) : (
                                        <select className="lfm-input lfm-select" required value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
                                            <option value="">-- Select Module --</option>
                                            {dynamicModules.map((m: any, idx: number) => (
                                                <option key={idx} value={m.code || m.name}>{m.code ? `${m.code} - ` : ''}{m.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>

                                {!isTemplateLoading && moduleTopics.length > 0 && (
                                    <div className="lfm-fg animate-fade-in">
                                        <label>Select Specific Topic Element / Activity *</label>
                                        <select className="lfm-input lfm-select" required value={selectedTopicCode} onChange={(e) => setSelectedTopicCode(e.target.value)} style={{ borderLeft: '3px solid var(--mlab-blue)' }}>
                                            <option value="">-- Select Topic Element --</option>
                                            {moduleTopics.map((t: any, idx: number) => (
                                                <option key={idx} value={t.code}>{t.code ? `${t.code} - ` : ''}{t.title}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* ─── SECTION 1: WORK ACTIVITIES ─── */}
                                {!isTemplateLoading && filteredWorkActivities.length > 0 && (
                                    <div className="lfm-fg animate-fade-in" style={{ marginTop: '0.25rem' }}>
                                        <label style={{ color: 'var(--mlab-blue)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            Select Completed Work Activities (WA) Covered Today *
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

                                {/* ─── 🚀 SECTION 1.5: CONTEXTUALIZED WORKPLACE KNOWLEDGE (CWK) RENDER PANEL ─── */}
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

                                                        {/* INLINE DEDICATED UPLOADER FOR CWK */}
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

                        {/* ─── SECTION 2: PORTFOLIO BINDER ─── */}
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
                                        No specific artifact assets or links are bound to this shift. If you have generated code repos, diagrams, or signed registers, click the button above to add multiple labeled SE records.
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
                                                        placeholder={item.type === 'link' ? "e.g., GitHub Branch Repository Link" : "e.g., Machine Pre-start Checklist Log Sheet..."}
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

                                                {/* DYNAMIC RELATIONAL CHIP MAPPING CONTAINER */}
                                                <div className="chip-mapping-zone">
                                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Tag size={11} /> Link this SE artifact to today's Work Activities (Select at least one) *
                                                    </span>
                                                    {selectedMilestones.length === 0 ? (
                                                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontStyle: 'italic' }}>
                                                            ⚠️ Please check at least one Work Activity (WA) checkbox above to reveal target linking chips.
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

                        <div className="lfm-section-hdr" style={{ marginTop: '1rem' }}><Info size={13} /> Tasks Performed / Narrative Notes</div>

                        <div className="lfm-fg">
                            <label>Detailed Reflection Summary *</label>
                            <div style={{ background: 'white', borderRadius: '4px', border: '1px solid var(--mlab-border)', overflow: 'hidden' }}>
                                <ReactQuill
                                    theme="snow"
                                    value={tasksPerformed}
                                    onChange={setTasksPerformed}
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
                                        rel="noopener noreferrer"
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
                            disabled={isSaving || !(placementContext?.mentorId || learner.mentorId) || !selectedCohortId}
                            style={{ background: '#cbd5e1', color: '#1e293b', border: 'none', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {isSaving ? <Loader2 size={13} className="lfm-spin" /> : <Save size={13} />} Save Draft
                        </button>

                        <button
                            type="submit"
                            className="lfm-btn lfm-btn--primary"
                            disabled={isSaving || !(placementContext?.mentorId || learner.mentorId) || !selectedCohortId}
                        >
                            {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Submitting…</> : <><Save size={13} /> {existingLog?.rejectionReason ? 'Resubmit to Mentor' : 'Submit Timesheet'}</>}
                        </button>
                    </div>
                </form>

            </div>
        </div>
    );
};