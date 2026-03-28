// src/components/views/AssessmentBuilder/AssessmentBuilder.tsx


// src/components/views/AssessmentBuilder/AssessmentBuilder.tsx

import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
    collection, doc, getDoc, setDoc, writeBatch, query, where, getDocs,
} from "firebase/firestore";
import {
    getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
} from "firebase/storage";
import { db } from "../../../lib/firebase";
import { useStore } from "../../../store/useStore";
import {
    ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
    FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
    BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
    Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
    Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive, ShieldAlert
} from "lucide-react";
import Tooltip from "../../../components/common/Tooltip/Tooltip";
import type { Cohort, ProgrammeTemplate, DashboardLearner } from "../../../types";
import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import "./AssessmentBuilder.css";
import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";

const quillModules = {
    toolbar: [
        ["bold", "italic", "underline", "code-block"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["clean"],
    ],
};
const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace";
type SidebarPanel = "settings" | "module" | "topics" | "guide" | "outline";

interface Topic {
    id: string;
    code: string;
    title: string;
    weight: string | number;
}
export interface WorkplaceEvidenceItem {
    id: string;
    code: string;
    description: string;
}
export interface WorkplaceActivity {
    id: string;
    code: string;
    description: string;
    evidenceItems?: WorkplaceEvidenceItem[];
}

export interface AssessmentBlock {
    id: string;
    type: BlockType;
    title?: string;
    content?: string;
    question?: string;
    marks?: number;
    options?: string[];
    correctOption?: number;
    linkedTopicId?: string;
    allowText?: boolean;
    allowUpload?: boolean;
    allowAudio?: boolean;
    allowUrl?: boolean;
    allowCode?: boolean;
    allowedFileTypes?: "all" | "image" | "document" | "video" | "presentation";
    codeLanguage?: "javascript" | "python" | "html" | "sql" | "other";
    criteria?: string[];
    requireTimeTracking?: boolean;
    requirePerCriterionTiming?: boolean;
    requireObservationDeclaration?: boolean;
    requireEvidencePerCriterion?: boolean;
    weCode?: string;
    weTitle?: string;
    workActivities?: WorkplaceActivity[];
    requireSelfAssessment?: boolean;
    requireGoalPlanning?: boolean;
}

interface ModuleDetails {
    title: string;
    nqfLevel: string;
    credits: number;
    notionalHours: number;
    moduleNumber: string;
    occupationalCode: string;
    saqaQualId: string;
    qualificationTitle: string;
    timeLimit?: number;
}

type AssessmentStatusType = "draft" | "scheduled" | "active" | "completed";

const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const BLOCK_META: Record<
    BlockType,
    { label: string; color: string; icon: React.ReactNode; desc: string }
> = {
    section: { label: "Section", color: "#6366f1", icon: <Layout size={14} />, desc: "Organises blocks under a heading" },
    info: { label: "Reading", color: "#0ea5e9", icon: <Info size={14} />, desc: "Context or learning material" },
    text: { label: "Written", color: "#f59e0b", icon: <AlignLeft size={14} />, desc: "Standard free-text response" },
    mcq: { label: "MCQ", color: "#10b981", icon: <CheckSquare size={14} />, desc: "Select the correct option" },
    task: { label: "Multi-Modal", color: "#8b5cf6", icon: <Layers size={14} />, desc: "File uploads, audio, code, or links" },
    checklist: { label: "Checklist", color: "#14b8a6", icon: <ListChecks size={14} />, desc: "Assessor C/NYC observation list" },
    logbook: { label: "Basic Logbook", color: "#f97316", icon: <CalendarRange size={14} />, desc: "Standard workplace hours logbook" },
    qcto_workplace: { label: "QCTO Workplace Checkpoint", color: "#e11d48", icon: <Briefcase size={14} />, desc: "SETA compliant workplace checkpoint" },
};

export const AssessmentBuilder: React.FC = () => {
    const { assessmentId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const {
        user,
        cohorts,
        learners,
        programmes,
        fetchCohorts,
        fetchLearners,
        fetchProgrammes,
    } = useStore();

    const [loading, setLoading] = useState(false);
    const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
    const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");

    const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
    const [selectedModuleCode, setSelectedModuleCode] = useState("");
    const [showProgrammeModal, setShowProgrammeModal] = useState(false);
    const [showCohortModal, setShowCohortModal] = useState(false);
    const [title, setTitle] = useState("");
    const [cohortIds, setCohortIds] = useState<string[]>([]);
    const [instructions, setInstructions] = useState("");
    const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook">("formative");
    const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");

    // 🚀 NEW: Security Settings
    const [requiresInvigilation, setRequiresInvigilation] = useState(true);

    const [isOpenBook, setIsOpenBook] = useState(false);
    const [referenceManualUrl, setReferenceManualUrl] = useState("");
    const [isUploadingManual, setIsUploadingManual] = useState(false);
    const [isScheduled, setIsScheduled] = useState(false);
    const [scheduledDate, setScheduledDate] = useState("");
    const [showModuleHeader, setShowModuleHeader] = useState(true);
    const [moduleInfo, setModuleInfo] = useState<ModuleDetails>({
        title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
        occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 60,
    });
    const [learnerNote, setLearnerNote] = useState("");
    const [modulePurpose, setModulePurpose] = useState("");
    const [entryRequirements, setEntryRequirements] = useState("");
    const [providerRequirements, setProviderRequirements] = useState("");
    const [exemptions, setExemptions] = useState("");
    const [stakeholderGuidelines, setStakeholderGuidelines] = useState("");
    const [topics, setTopics] = useState<Topic[]>([]);
    const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);
    const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
    const [addingTopic, setAddingTopic] = useState(false);
    const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: "", title: "", weight: "" });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const isDeployed = assessmentStatus !== "draft" && assessmentId !== undefined;

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (programmes.length === 0) fetchProgrammes();
        const loadData = async () => {
            if (!assessmentId) return;
            setLoading(true);
            try {
                const snap = await getDoc(doc(db, "assessments", assessmentId));
                if (snap.exists()) {
                    const d = snap.data();
                    setTitle(d.title || "");
                    setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
                    setInstructions(d.instructions || "");
                    setType(d.type || "formative");
                    setModuleType(d.moduleType || "knowledge");
                    setAssessmentStatus(d.status || "draft");

                    // 🚀 Load Proctored State (default to true if knowledge module)
                    if (d.requiresInvigilation !== undefined) {
                        setRequiresInvigilation(d.requiresInvigilation);
                    } else {
                        setRequiresInvigilation(d.moduleType === "knowledge" || !d.moduleType);
                    }

                    setIsOpenBook(d.isOpenBook || false);
                    setReferenceManualUrl(d.referenceManualUrl || "");
                    if (d.scheduledDate) {
                        try {
                            const dt = new Date(d.scheduledDate);
                            if (!isNaN(dt.getTime())) {
                                const p = (n: number) => n.toString().padStart(2, "0");
                                setScheduledDate(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`);
                            } else setScheduledDate(d.scheduledDate);
                        } catch {
                            setScheduledDate(d.scheduledDate);
                        }
                    }
                    setIsScheduled(!!d.scheduledDate);
                    setSelectedProgrammeId(d.linkedProgrammeId || "");
                    setSelectedModuleCode(d.linkedModuleCode || "");
                    setModuleInfo(d.moduleInfo || {});
                    setShowModuleHeader(d.showModuleHeader ?? true);
                    setBlocks(d.blocks || []);
                    if (d.learnerGuide) {
                        setLearnerNote(d.learnerGuide.note || "");
                        setModulePurpose(d.learnerGuide.purpose || "");
                        setEntryRequirements(d.learnerGuide.entryRequirements || "");
                        setProviderRequirements(d.learnerGuide.providerRequirements || "");
                        setExemptions(d.learnerGuide.exemptions || "");
                        setStakeholderGuidelines(d.learnerGuide.stakeholderGuidelines || "");
                    }
                    if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
                    setSaveStatus("saved");
                    setLastSaved(new Date(d.lastUpdated || d.createdAt));
                } else {
                    toast.error("Assessment not found");
                    navigate("/facilitator/assessments");
                }
            } catch {
                toast.error("Could not load the requested assessment.");
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [assessmentId]);

    useEffect(() => {
        if (!selectedProgrammeId || !selectedModuleCode) return;
        if (assessmentId && topics.length > 0) return;
        const prog = programmes.find((p) => p.id === selectedProgrammeId);
        if (!prog) return;
        const allMods = [...(prog.knowledgeModules || []), ...(prog.practicalModules || []), ...(prog.workExperienceModules || [])];
        const mod: any = allMods.find((m: any, idx: number) => (m.code || m.name || `mod-${idx}`) === selectedModuleCode);
        if (mod) {
            setModuleInfo({
                title: mod.name,
                nqfLevel: `Level ${mod.nqfLevel || prog.nqfLevel}`,
                credits: mod.credits || 0,
                notionalHours: mod.notionalHours || 0,
                moduleNumber: mod.code || "",
                occupationalCode: (prog as any).curriculumCode || prog.saqaId || "",
                saqaQualId: prog.saqaId || "",
                qualificationTitle: prog.name || "",
                timeLimit: moduleInfo.timeLimit || 60,
            });
            if (mod.topics?.length) {
                const t = mod.topics.map((t: any) => ({ id: mkId(), code: t.code || "", title: t.title || "Unnamed Topic", weight: t.weight || "0" }));
                setTopics(t);
                toast.success(`Imported ${t.length} topics!`);
            } else setTopics([]);
        }
    }, [selectedProgrammeId, selectedModuleCode]);

    useEffect(() => {
        if (!assessmentId) return;
        setSaveStatus("unsaved");
        const t = setTimeout(() => {
            if (saveStatus === "unsaved" && !loading) handleSave(assessmentStatus === "draft" ? "draft" : "active", true);
        }, 30000);
        return () => clearTimeout(t);
    }, [
        title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
        learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
        stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
        scheduledDate, isScheduled, isOpenBook, referenceManualUrl, requiresInvigilation // Added requiresInvigilation to autosave watch
    ]);

    const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingManual(true);
        toast.info("Uploading reference manual...");
        try {
            const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/manuals/${Date.now()}_${file.name}`), file);
            task.on("state_changed", null, () => {
                toast.error("Upload failed.");
                setIsUploadingManual(false);
            }, async () => {
                setReferenceManualUrl(await getDownloadURL(task.snapshot.ref));
                toast.success("Manual uploaded!");
                setIsUploadingManual(false);
            });
        } catch {
            toast.error("Upload failed.");
            setIsUploadingManual(false);
        }
    };

    // 🚀 Intelligent Module Type Switcher
    const handleModuleTypeChange = (newType: "knowledge" | "practical" | "workplace") => {
        setModuleType(newType);
        if (newType !== 'knowledge') {
            setRequiresInvigilation(false); // Force turn off proctoring for practical/workplace
        } else {
            setRequiresInvigilation(true); // Default back to ON for knowledge modules
        }
    };

    const handleSaveNewCohort = async (cohortData: Omit<Cohort, "id" | "createdAt" | "staffHistory" | "isArchived">, reasons?: any) => {
        const ref = doc(collection(db, "cohorts"));
        const id = ref.id;
        await setDoc(ref, {
            ...cohortData,
            id,
            createdAt: new Date().toISOString(),
            isArchived: false,
            staffHistory: [],
            status: "active",
            changeReasons: reasons || {},
        });
        await fetchCohorts();
        setCohortIds((p) => [...p, id]);
        toast.success(`Class "${cohortData.name}" created!`);
        setShowCohortModal(false);
    };

    const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
    const commitEdit = () => {
        if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
        setTopics((p) => p.map((t) => t.id === editingTopicId ? ({ ...t, ...editDraft } as Topic) : t));
        setEditingTopicId(null);
    };
    const cancelEdit = () => setEditingTopicId(null);
    const confirmDelete = (id: string) => setDeleteConfirmId(id);
    const executeDelete = () => {
        if (!deleteConfirmId) return;
        setBlocks((p) => p.map((b) => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
        setTopics((p) => p.filter((t) => t.id !== deleteConfirmId));
        setDeleteConfirmId(null);
    };
    const cancelDelete = () => setDeleteConfirmId(null);
    const commitAdd = () => {
        if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
        setTopics((p) => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || "0%" }]);
        setNewTopic({ code: "", title: "", weight: "" });
        setAddingTopic(false);
    };
    const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

    const addBlock = (bType: string, linkedTopicId?: string) => {
        let actualType: BlockType = bType as BlockType;
        if (["upload", "audio", "code"].includes(bType)) actualType = "task";
        const nb: AssessmentBlock = {
            id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: actualType,
            linkedTopicId,
            title: actualType === "section" ? "New Section" : "",
            content: "",
            question: "",
            marks: ["text", "mcq", "task"].includes(actualType) ? 5 : ["checklist", "qcto_workplace"].includes(actualType) ? 10 : 0,
            options: actualType === "mcq" ? ["", "", "", ""] : [],
            correctOption: 0,
        };
        if (actualType === "checklist") {
            nb.title = "Demonstrate the use of various functionalities:";
            nb.criteria = ["Task criterion 1", "Task criterion 2"];
            nb.requireTimeTracking = true;
            nb.requirePerCriterionTiming = true;
            nb.requireObservationDeclaration = true;
            nb.requireEvidencePerCriterion = true;
        } else if (actualType === "logbook") {
            nb.title = "Workplace Logbook Entry";
            nb.content = "Learner must log assignment tasks, start/finish times, and total hours.";
        } else if (actualType === "qcto_workplace") {
            nb.title = "Workplace Experience Checkpoint";
            nb.weCode = "WM-01-WE01";
            nb.weTitle = "Attend induction program";
            nb.workActivities = [
                {
                    id: mkId(),
                    code: "WA0101",
                    description: "Define the problem",
                    evidenceItems: [{ id: mkId(), code: "SE0101", description: "Logbook entry / Signed attendance register" }],
                },
            ];
            nb.requireSelfAssessment = true;
            nb.requireGoalPlanning = true;
        } else if (actualType === "task") {
            nb.question = bType === "upload" ? "Please upload your evidence:" : bType === "audio" ? "Please record your verbal response:" : bType === "code" ? "Please write your code:" : "Describe or demonstrate your solution:";
            nb.allowText = bType === "task";
            nb.allowUpload = ["upload", "task"].includes(bType);
            nb.allowAudio = ["audio", "task"].includes(bType);
            nb.allowUrl = ["code", "task"].includes(bType);
            nb.allowCode = ["code", "task"].includes(bType);
            nb.allowedFileTypes = "all";
            nb.codeLanguage = "javascript";
        }
        setBlocks((p) => [...p, nb]);
        setTimeout(() => {
            setFocusedBlock(nb.id);
            document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60);
    };

    const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) => setBlocks((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
    const updateOption = (bid: string, idx: number, val: string) => setBlocks((p) => p.map((b) => { if (b.id !== bid || !b.options) return b; const o = [...b.options]; o[idx] = val; return { ...b, options: o }; }));
    const removeBlock = (id: string) => {
        if (window.confirm("Remove this block?")) {
            setBlocks((p) => p.filter((b) => b.id !== id));
            setFocusedBlock(null);
            toast.info("Block removed");
        }
    };
    const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
        const i = p.findIndex((b) => b.id === id);
        if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
        const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
        [n[i], n[sw]] = [n[sw], n[i]];
        return n;
    });
    const resetModuleInfo = () => {
        if (window.confirm("Clear all module fields?")) {
            setModuleInfo({
                title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
                occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
            });
            setSelectedProgrammeId("");
            setSelectedModuleCode("");
            setTopics([]);
        }
    };

    const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
    const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
    const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

    const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
        let id = ((newProg as any).curriculumCode || newProg.saqaId || "").toString().trim().replace(/[\s/]+/g, "-");
        if (!id) throw new Error("Curriculum Code or SAQA ID required.");
        await setDoc(
            doc(db, "programmes", id),
            { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
            { merge: true },
        );
        toast.success("Blueprint created!");
        setShowProgrammeModal(false);
        await fetchProgrammes();
        setSelectedProgrammeId(id);
        setSelectedModuleCode("");
    };

    // Parameter now strictly matches AssessmentStatusType
    const handleSave = async (status: AssessmentStatusType, isAutoSave = false) => {
        if (!title.trim() && !isAutoSave) {
            toast.warning("Please enter a Workbook Title.");
            return;
        }
        if (cohortIds.length === 0 && !isAutoSave && status === "active") {
            toast.warning("Please select at least one Cohort.");
            return;
        }
        if (!isAutoSave) setLoading(true);
        setSaveStatus("saving");
        try {
            const sanitizedBlocks = blocks.map((b) => {
                const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
                if (b.linkedTopicId) {
                    const t = topics.find((tp) => tp.id === b.linkedTopicId);
                    if (t) c.linkedTopicCode = t.code;
                    c.linkedTopicId = b.linkedTopicId;
                }
                if (b.type === "section") {
                    c.title = b.title || "Untitled Section";
                    c.content = b.content || "";
                }
                if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
                if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
                if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
                if (b.type === "mcq") {
                    c.options = b.options || ["", "", "", ""];
                    c.correctOption = b.correctOption || 0;
                }
                if (b.type === "checklist") {
                    c.criteria = b.criteria || [];
                    c.requireTimeTracking = b.requireTimeTracking !== false;
                    c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
                    c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
                    c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
                }
                if (b.type === "qcto_workplace") {
                    c.weCode = b.weCode || "";
                    c.weTitle = b.weTitle || "";
                    c.workActivities = b.workActivities || [];
                    c.requireSelfAssessment = b.requireSelfAssessment !== false;
                    c.requireGoalPlanning = b.requireGoalPlanning !== false;
                }
                if (b.type === "task") {
                    c.allowText = b.allowText;
                    c.allowUpload = b.allowUpload;
                    c.allowAudio = b.allowAudio;
                    c.allowUrl = b.allowUrl;
                    c.allowCode = b.allowCode;
                    c.allowedFileTypes = b.allowedFileTypes;
                    c.codeLanguage = b.codeLanguage;
                }
                return c;
            });
            let finalStatus: AssessmentStatusType = status;
            let finalScheduledDate: string | null = null;
            if (isScheduled && scheduledDate) {
                if (status === "draft") finalStatus = "scheduled";
                finalScheduledDate = new Date(scheduledDate).toISOString();
            }
            if (isDeployed && status === "draft" && !isAutoSave) finalStatus = assessmentStatus;
            const payload = {
                title, type, moduleType, cohortIds,
                linkedProgrammeId: selectedProgrammeId,
                linkedModuleCode: selectedModuleCode,
                scheduledDate: finalScheduledDate,
                instructions: instructions || "",
                // 🚀 Added to Payload
                requiresInvigilation: moduleType === 'knowledge' ? requiresInvigilation : false,
                moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
                learnerGuide: {
                    note: learnerNote, purpose: modulePurpose, entryRequirements,
                    providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
                },
                topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
                facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
            };
            const batch = writeBatch(db);
            let curId = assessmentId;
            if (curId) {
                batch.set(doc(db, "assessments", curId), payload, { merge: true });
            } else {
                const r = doc(collection(db, "assessments"));
                curId = r.id;
                batch.set(r, {
                    ...payload, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator",
                });
            }
            if (["active", "scheduled"].includes(finalStatus)) {
                const cohortLearners = learners.filter((l) => cohortIds.includes(String(l.cohortId || "").trim()));
                if (cohortLearners.length > 0) {
                    const existingIds = new Set((await getDocs(query(collection(db, "learner_submissions"), where("assessmentId", "==", curId)))).docs.map((d) => d.id));
                    cohortLearners.forEach((l: DashboardLearner) => {
                        const sid = `${l.cohortId || "Unassigned"}_${l.learnerId || l.id}_${curId}`;
                        const ref = doc(db, "learner_submissions", sid);
                        if (!existingIds.has(sid))
                            batch.set(ref, {
                                learnerId: l.learnerId || l.id,
                                enrollmentId: l.enrollmentId || l.id,
                                qualificationName: l.qualification?.name || "",
                                assessmentId: curId,
                                cohortId: l.cohortId || "Unassigned",
                                title, type, moduleType, status: "not_started",
                                assignedAt: new Date().toISOString(),
                                marks: 0, totalMarks, moduleNumber: moduleInfo.moduleNumber,
                                createdAt: new Date().toISOString(),
                                createdBy: user?.uid || "System",
                            });
                        else
                            batch.set(ref, { title, type, moduleType, totalMarks, moduleNumber: moduleInfo.moduleNumber }, { merge: true });
                    });
                }
            }
            await batch.commit();
            setAssessmentStatus(finalStatus);
            setSaveStatus("saved");
            setLastSaved(new Date());
            if (!isAutoSave) {
                if (finalStatus === "active") toast.success("Workbook Published & Assigned!");
                else if (finalStatus === "scheduled") toast.success("Workbook Scheduled!");
                else toast.success("Draft saved!");
            }
            if (!assessmentId && curId && !isAutoSave) navigate(`/facilitator/assessments/builder/${curId}`, { replace: true });
        } catch (err: any) {
            setSaveStatus("unsaved");
            if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
        } finally {
            if (!isAutoSave) setLoading(false);
        }
    };

    const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

    return (
        <div className="ab-root animate-fade-in">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            {/* ── TOPBAR ── */}
            <header className="ab-topbar">
                <div className="ab-topbar-left">
                    <button className="ab-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
                        <Menu size={20} />
                    </button>
                    <Tooltip content="Return to assessments list" placement="bottom">
                        <button className="ab-back-btn" onClick={() => navigate(-1)}>
                            <ArrowLeft size={18} />
                            <span className="ab-hide-mobile">Back</span>
                        </button>
                    </Tooltip>
                </div>
                <div className="ab-topbar-centre">
                    <BookOpen size={16} className="ab-topbar-icon" />
                    <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
                    <span className={`ab-topbar-badge ${type} ab-hide-mobile`}>{type}</span>
                </div>
                <div className="ab-topbar-actions">
                    <div className="ab-stats-pill ab-hide-mobile">
                        <span><strong>{qCount}</strong> Qs</span>
                        <div className="ab-sdiv" />
                        <span><strong>{totalMarks}</strong> marks</span>
                    </div>
                    <div className={`ab-save-status ${saveStatus} ab-hide-mobile`}>
                        {saveStatus === "saved" && (
                            <>
                                <Check size={13} />
                                <span>Saved</span>
                                {lastSaved && <span className="ab-save-time">{new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                            </>
                        )}
                        {saveStatus === "saving" && (
                            <>
                                <div className="ab-spinner" />
                                <span>Saving…</span>
                            </>
                        )}
                        {saveStatus === "unsaved" && (
                            <>
                                <AlertTriangle size={13} />
                                <span>Unsaved</span>
                            </>
                        )}
                    </div>
                    {assessmentId && (
                        <Tooltip content="Preview what learners will see" placement="bottom">
                            <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
                                <Eye size={15} />
                                <span className="ab-hide-mobile">Preview</span>
                            </button>
                        </Tooltip>
                    )}
                    {!isDeployed && (
                        <button className="ab-btn ab-btn-ghost ab-hide-mobile" onClick={() => handleSave("draft")} disabled={loading}>
                            {loading ? "Saving…" : "Save Draft"}
                        </button>
                    )}
                    <button className="ab-btn ab-btn-primary" onClick={() => handleSave("active")} disabled={loading}>
                        <Zap size={15} />
                        <span className="ab-hide-mobile">{isDeployed ? "Update" : "Publish"}</span>
                    </button>
                </div>
            </header>

            <div className="ab-body">
                {isMobileMenuOpen && <div className="ab-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

                {/* ── SIDEBAR ── */}
                <aside className={`ab-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
                    <button className="ab-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
                        <X size={22} />
                    </button>
                    <nav className="ab-sidebar-nav">
                        {(
                            [
                                { id: "settings", icon: <Settings size={14} />, label: "Settings", tooltip: "Basic workbook settings" },
                                { id: "module", icon: <GraduationCap size={14} />, label: "Module", tooltip: "QCTO module info" },
                                { id: "topics", icon: <ListChecks size={14} />, label: "Topics", tooltip: "Manage topic elements" },
                                { id: "guide", icon: <BookMarked size={14} />, label: "Guide", tooltip: "Learner guide content" },
                                { id: "outline", icon: <Eye size={14} />, label: "Outline", tooltip: "View workbook structure" },
                            ] as const
                        ).map((t) => (
                            <Tooltip key={t.id} content={t.tooltip} placement="bottom">
                                <button className={`ab-nav-btn ${activePanel === t.id ? "active" : ""}`} onClick={() => { setActivePanel(t.id); setIsMobileMenuOpen(false); }}>
                                    {t.icon}
                                    <span>{t.label}</span>
                                </button>
                            </Tooltip>
                        ))}
                    </nav>

                    <div className="ab-sidebar-body">
                        {/* ── SETTINGS PANEL ── */}
                        {activePanel === "settings" && (
                            <>
                                <SectionHdr icon={<Database size={13} />} label="Curriculum Link" />
                                <FG label="Programme Template">
                                    <div className="ab-row-gap">
                                        <div className="ab-sel-wrap ab-flex-1">
                                            <select className="ab-input ab-sel" value={selectedProgrammeId} onChange={(e) => { setSelectedProgrammeId(e.target.value); setSelectedModuleCode(""); }}>
                                                <option value="">-- Custom / Blank --</option>
                                                {programmes.filter((p) => !p.isArchived).map((p) => (
                                                    <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} className="ab-sel-arr" />
                                        </div>
                                        <Tooltip content="Create Blueprint" placement="top">
                                            <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
                                                <Plus size={13} /> New
                                            </button>
                                        </Tooltip>
                                    </div>
                                </FG>
                                {selectedProgrammeId && activeProgramme && (
                                    <FG label="Module (auto-populates topics)">
                                        <div className="ab-sel-wrap">
                                            <select className="ab-input ab-sel" value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
                                                <option value="">-- Select Module --</option>
                                                {(activeProgramme.knowledgeModules || []).length > 0 && (
                                                    <optgroup label="Knowledge Modules (KM)">
                                                        {activeProgramme.knowledgeModules.map((m: any, i: number) => {
                                                            const v = m.code || m.name || `mod-km-${i}`;
                                                            return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
                                                        })}
                                                    </optgroup>
                                                )}
                                                {(activeProgramme.practicalModules || []).length > 0 && (
                                                    <optgroup label="Practical Modules (PM)">
                                                        {activeProgramme.practicalModules.map((m: any, i: number) => {
                                                            const v = m.code || m.name || `mod-pm-${i}`;
                                                            return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
                                                        })}
                                                    </optgroup>
                                                )}
                                                {(activeProgramme.workExperienceModules || []).length > 0 && (
                                                    <optgroup label="Workplace Modules (WM)">
                                                        {activeProgramme.workExperienceModules.map((m: any, i: number) => {
                                                            const v = m.code || m.name || `mod-wm-${i}`;
                                                            return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
                                                        })}
                                                    </optgroup>
                                                )}
                                            </select>
                                            <ChevronDown size={12} className="ab-sel-arr" />
                                        </div>
                                    </FG>
                                )}

                                <div className="ab-divider" />
                                <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />

                                <div className="ab-meta-card">
                                    <div className="ab-form-group">
                                        <label className="ab-fg-label ab-label-icon">
                                            <BookOpen size={12} /> Module Curriculum Type
                                        </label>
                                        {/* 🚀 Intelligent Change Handler */}
                                        <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => handleModuleTypeChange(e.target.value as any)}>
                                            <option value="knowledge">Knowledge Module (Standard Questions)</option>
                                            <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
                                            <option value="workplace">Workplace Experience Module (Logbooks)</option>
                                        </select>
                                        <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
                                    </div>
                                    <div className="ab-form-group">
                                        <label className="ab-fg-label">Assessment Type Category</label>
                                        <select className="ab-input" value={type} onChange={(e) => setType(e.target.value as any)}>
                                            <option value="formative">Formative Assessment</option>
                                            <option value="summative">Summative Assessment</option>
                                            <option value="Practical Observation">Practical Observation</option>
                                            <option value="Workplace Logbook">Workplace Logbook</option>
                                        </select>
                                    </div>
                                </div>

                                <FG label="Title">
                                    <input className="ab-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Workbook title…" />
                                </FG>

                                <div className="ab-meta-grid-inputs">
                                    <FG label="Time Limit (Mins)">
                                        <div className="ab-row-gap">
                                            <Clock size={15} className="ab-input-icon" />
                                            <input type="number" className="ab-input" placeholder="60" value={moduleInfo.timeLimit || ""} onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })} />
                                        </div>
                                        <span className="ab-input-hint">0 = no limit</span>
                                    </FG>
                                    <FG label="Scheduling">
                                        <label className="ab-check-row">
                                            <input type="checkbox" checked={isScheduled} onChange={(e) => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(""); }} className="ab-checkbox" />
                                            <span className="ab-check-label">Schedule date/time</span>
                                        </label>
                                        {isScheduled ? (
                                            <div className="ab-row-gap">
                                                <Calendar size={15} className="ab-input-icon" />
                                                <input type="datetime-local" className="ab-input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
                                            </div>
                                        ) : (
                                            <span className="ab-input-hint ab-indent">Available anytime after publishing.</span>
                                        )}
                                    </FG>
                                </div>

                                {/* 🚀 NEW: Security Settings / Proctoring */}
                                <div className="ab-openbook-card" style={{ marginTop: '0', marginBottom: '1rem', borderLeftColor: moduleType === 'knowledge' ? '#e11d48' : '#cbd5e1', background: requiresInvigilation ? '#fff1f2' : undefined }}>
                                    <label className={`ab-check-row ${moduleType !== 'knowledge' ? 'ab-disabled' : ''}`}>
                                        <input
                                            type="checkbox"
                                            checked={requiresInvigilation}
                                            onChange={(e) => setRequiresInvigilation(e.target.checked)}
                                            disabled={moduleType !== 'knowledge' || isDeployed}
                                            className="ab-checkbox"
                                            style={requiresInvigilation ? { accentColor: '#e11d48' } : undefined}
                                        />
                                        <span className="ab-check-label" style={{ color: requiresInvigilation ? '#be123c' : 'inherit' }}>
                                            <ShieldAlert size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                            Enable Live Web Proctoring (Invigilation)
                                        </span>
                                    </label>
                                    {moduleType !== 'knowledge' ? (
                                        <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px' }}>Live proctoring is automatically disabled for Practical and Workplace logbooks.</p>
                                    ) : (
                                        <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px', color: requiresInvigilation ? '#9f1239' : 'inherit' }}>Locks the browser to fullscreen and records webcam snapshots of tab-switching violations.</p>
                                    )}
                                </div>

                                {/* Open Book Reference Manual */}
                                <div className="ab-openbook-card">
                                    <label className="ab-check-row">
                                        <input type="checkbox" checked={isOpenBook} onChange={(e) => { setIsOpenBook(e.target.checked); if (!e.target.checked) setReferenceManualUrl(""); }} className="ab-checkbox" />
                                        <span className="ab-check-label ab-check-label--sky">Enable Open Book Reference Manual</span>
                                    </label>
                                    {isOpenBook && (
                                        <div className="ab-openbook-body">
                                            {referenceManualUrl ? (
                                                <div className="ab-manual-linked">
                                                    <span className="ab-manual-linked__name"><FileArchive size={13} /> Manual Linked</span>
                                                    <button onClick={() => setReferenceManualUrl("")} className="ab-manual-linked__remove"><Trash2 size={13} /></button>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className="ab-input-hint">Upload a PDF learners can view inside the assessment player.</p>
                                                    <label className={`ab-btn ab-btn-primary ab-btn-upload ${isUploadingManual ? "ab-btn--disabled" : ""}`}>
                                                        {isUploadingManual ? "Uploading…" : <><UploadCloud size={13} /> Select PDF Manual</>}
                                                        <input type="file" accept="application/pdf" hidden disabled={isUploadingManual} onChange={handleManualUpload} />
                                                    </label>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Cohort Assignment */}
                                <div className="ab-fg">
                                    <div className="ab-fg-header">
                                        <label className="ab-fg-label">Assign to Cohorts</label>
                                        <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
                                    </div>
                                    <div className="ab-cohort-panel">
                                        {cohorts.map((c) => (
                                            <label key={c.id} className="ab-cohort-row">
                                                <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={(e) => { if (e.target.checked) setCohortIds((p) => [...p, c.id]); else setCohortIds((p) => p.filter((id) => id !== c.id)); }} className="ab-checkbox" />
                                                <span className="ab-cohort-row__name">{c.name}</span>
                                                <Tooltip content="View Class Register" placement="left">
                                                    <ExternalLink size={11} className="ab-cohort-row__link" onClick={(e) => { e.preventDefault(); navigate(`/cohorts/${c.id}`); }} />
                                                </Tooltip>
                                            </label>
                                        ))}
                                        {cohorts.length === 0 && <span className="ab-empty-hint">No active classes available.</span>}
                                    </div>
                                </div>

                                <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
                                <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Add instructions for learners…" />
                            </>
                        )}

                        {/* ── MODULE PANEL ── */}
                        {activePanel === "module" && (
                            <>
                                <div className="ab-row-space">
                                    <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
                                    <Tooltip content={showModuleHeader ? "Hide" : "Show"} placement="left">
                                        <button className={`ab-toggle-icon ${!showModuleHeader ? "off" : ""}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
                                            {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                    </Tooltip>
                                </div>
                                {showModuleHeader ? (
                                    <div className="animate-fade-in">
                                        <div className="ab-row-end">
                                            <Tooltip content="Clear all fields" placement="left">
                                                <button className="ab-text-btn danger" onClick={resetModuleInfo}>
                                                    <RotateCcw size={12} /> Clear
                                                </button>
                                            </Tooltip>
                                        </div>
                                        <FG label="Qualification Title"><input className="ab-input" value={moduleInfo.qualificationTitle} onChange={(e) => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} /></FG>
                                        <FG label="Module Number"><input className="ab-input" value={moduleInfo.moduleNumber} onChange={(e) => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} /></FG>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={(e) => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
                                            <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={(e) => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
                                        </div>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={(e) => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
                                            <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={(e) => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
                                        </div>
                                        <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={(e) => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
                                    </div>
                                ) : (
                                    <div className="ab-hidden-state"><EyeOff size={22} /><p>Header hidden from canvas.</p></div>
                                )}
                            </>
                        )}

                        {/* ── TOPICS PANEL ── */}
                        {activePanel === "topics" && (
                            <TopicsPanel
                                topics={topics} coveredTopicIds={coveredTopicIds} editingTopicId={editingTopicId} editDraft={editDraft} addingTopic={addingTopic} newTopic={newTopic} deleteConfirmId={deleteConfirmId} isDeployed={isDeployed}
                                onStartEdit={startEdit} onEditChange={(p) => setEditDraft((d) => ({ ...d, ...p }))} onCommitEdit={commitEdit} onCancelEdit={cancelEdit} onConfirmDelete={confirmDelete} onExecuteDelete={executeDelete} onCancelDelete={cancelDelete}
                                onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }} onNewTopicChange={(p) => setNewTopic((d) => ({ ...d, ...p }))} onCommitAdd={commitAdd} onCancelAdd={cancelAdd}
                                onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel("outline"); }}
                            />
                        )}

                        {/* ── GUIDE PANEL ── */}
                        {activePanel === "guide" && (
                            <>
                                <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
                                <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={(e) => setLearnerNote(e.target.value)} /></FG>
                                <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={(e) => setModulePurpose(e.target.value)} /></FG>
                                <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={(e) => setEntryRequirements(e.target.value)} /></FG>
                                <FG label="Stakeholder Guidelines">
                                    <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
                                        <ReactQuill theme="snow" value={stakeholderGuidelines} onChange={setStakeholderGuidelines} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Instructions to Mentor, Employer responsibilities…" />
                                    </div>
                                </FG>
                                <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={(e) => setExemptions(e.target.value)} /></FG>
                            </>
                        )}

                        {/* ── OUTLINE PANEL ── */}
                        {activePanel === "outline" && (
                            <>
                                <SectionHdr icon={<Eye size={13} />} label="Outline" />
                                {blocks.length === 0 ? <p className="ab-prose sm">No blocks yet.</p> : (
                                    <ol className="ab-outline-list">
                                        {blocks.map((b, i) => (
                                            <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? "focused" : ""}`} onClick={() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                                                <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
                                                <div className="ab-ol-text">
                                                    <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.slice(0, 40) || b.title || `Question ${i + 1}`}</span>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </>
                        )}
                    </div>
                </aside>

                {/* ── CANVAS ── */}
                <main className="ab-canvas">
                    {!isDeployed && (
                        <div className="ab-floating-toolbar">
                            <span className="ab-toolbar-label ab-hide-mobile">Add:</span>
                            <Tooltip content="Section Title" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("section")}><Type size={15} /></button></Tooltip>
                            <Tooltip content="Reading Material" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("info")}><Info size={15} /></button></Tooltip>
                            <div className="ab-toolbar-divider" />
                            <Tooltip content="MCQ" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("mcq")}><CheckSquare size={15} /></button></Tooltip>
                            <Tooltip content="Written Question" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("text")}><AlignLeft size={15} /></button></Tooltip>
                            <div className="ab-toolbar-divider" />
                            <Tooltip content="File Upload" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("upload")}><UploadCloud size={15} /></button></Tooltip>
                            <Tooltip content="Audio Recording" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("audio")}><Mic size={15} /></button></Tooltip>
                            <Tooltip content="Code Submission" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("code")}><Code size={15} /></button></Tooltip>
                            <Tooltip content="Multi-Modal Task" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("task")}><Layers size={15} /></button></Tooltip>
                            <div className="ab-toolbar-divider" />
                            <Tooltip content="Observation Checklist" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("checklist")}><ListChecks size={15} /></button></Tooltip>
                            <Tooltip content="Basic Logbook" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("logbook")}><CalendarRange size={15} /></button></Tooltip>
                            <Tooltip content="QCTO Workplace Checkpoint" placement="top"><button className="ab-tool-btn ab-tool-btn--qcto" onClick={() => addBlock("qcto_workplace")}><Briefcase size={15} /></button></Tooltip>
                        </div>
                    )}

                    <div className="ab-canvas-inner">
                        {isDeployed && (
                            <div className="ab-deployed-banner">
                                <AlertTriangle size={20} />
                                <div><strong>Strict Mode — Assessment Deployed.</strong> Structural changes are locked to protect learner data. You may edit text only.</div>
                            </div>
                        )}

                        {showModuleHeader && (
                            <div className="ab-module-card clickable" onClick={() => setActivePanel("module")}>
                                <div className="ab-mc-left">
                                    <div className="ab-mc-badges">
                                        <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
                                        <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
                                        <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
                                        {moduleInfo.timeLimit ? (
                                            <span className="ab-mc-b ab-mc-b--timer"><Clock size={11} /> {moduleInfo.timeLimit}m</span>
                                        ) : null}
                                        <span className={`ab-mc-b type-${type}`}>{type}</span>
                                    </div>
                                    <h1 className="ab-mc-title">{title || "Untitled Workbook"}</h1>
                                    <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
                                </div>
                                <div className="ab-mc-right">
                                    <div className="ab-mc-stat"><span className="ab-mc-val">{qCount}</span><span className="ab-mc-lbl">Qs</span></div>
                                    <div className="ab-mc-div" />
                                    <div className="ab-mc-stat"><span className="ab-mc-val">{totalMarks}</span><span className="ab-mc-lbl">Marks</span></div>
                                </div>
                                <div className="ab-mc-edit-hint"><Pencil size={11} /> Edit</div>
                            </div>
                        )}

                        {blocks.length === 0 ? (
                            <EmptyCanvas onAdd={addBlock} />
                        ) : (
                            <div className="ab-blocks-list">
                                {blocks.map((b, idx) => (
                                    <BlockCard
                                        key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} onFocus={() => setFocusedBlock(b.id)} isDeployed={isDeployed}
                                        onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {deleteConfirmId && (
                <DeleteOverlay topic={topics.find((t) => t.id === deleteConfirmId)!} linkedCount={blocks.filter((b) => b.linkedTopicId === deleteConfirmId).length} onConfirm={executeDelete} onCancel={cancelDelete} />
            )}
            {showProgrammeModal && (
                <ProgrammeFormModal existingProgrammes={programmes} onClose={() => setShowProgrammeModal(false)} onSave={handleSaveNewProgramme} title="Create Curriculum Blueprint" />
            )}
            {showCohortModal && (
                <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleSaveNewCohort} />
            )}
        </div>
    );
};

// ─── TOPICS PANEL ─────────────────────────────────────────────────────────────
interface TopicsPanelProps {
    topics: Topic[];
    coveredTopicIds: Set<string>;
    editingTopicId: string | null;
    editDraft: Partial<Topic>;
    addingTopic: boolean;
    newTopic: Partial<Topic>;
    deleteConfirmId: string | null;
    isDeployed: boolean;
    onStartEdit: (t: Topic) => void;
    onEditChange: (p: Partial<Topic>) => void;
    onCommitEdit: () => void;
    onCancelEdit: () => void;
    onConfirmDelete: (id: string) => void;
    onExecuteDelete: () => void;
    onCancelDelete: () => void;
    onStartAdd: () => void;
    onNewTopicChange: (p: Partial<Topic>) => void;
    onCommitAdd: () => void;
    onCancelAdd: () => void;
    onAddBlock: (bt: BlockType | string, tid?: string) => void;
}

const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
    <>
        <div className="ab-row-space">
            <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
            {!props.addingTopic && !props.isDeployed && (
                <Tooltip content="Add topic" placement="left">
                    <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}><Plus size={14} /></button>
                </Tooltip>
            )}
        </div>
        {props.addingTopic && !props.isDeployed && (
            <div className="ab-topic-form">
                <div className="ab-topic-form-row">
                    <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ""} onChange={(e) => props.onNewTopicChange({ code: e.target.value })} />
                    <input className="ab-input sm ab-w-60" placeholder="Weight %" value={props.newTopic.weight || ""} onChange={(e) => props.onNewTopicChange({ weight: e.target.value })} />
                </div>
                <textarea className="ab-input sm" rows={2} placeholder="Description…" value={props.newTopic.title || ""} onChange={(e) => props.onNewTopicChange({ title: e.target.value })} />
                <div className="ab-row-end ab-row-gap-sm">
                    <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
                    <button className="ab-btn ab-btn-primary ab-btn-sm" onClick={props.onCommitAdd}>Add</button>
                </div>
            </div>
        )}
        <div className="ab-topics-list">
            {props.topics.length === 0 && <p className="ab-prose sm ab-italic ab-muted">No topics. Select a module in Settings.</p>}
            {props.topics.map((t: Topic) => {
                const covered = props.coveredTopicIds.has(t.id);
                const isEditing = props.editingTopicId === t.id;
                if (isEditing) return (
                    <div key={t.id} className="ab-topic-row editing">
                        <div className="ab-topic-edit-fields">
                            <input className="ab-topic-edit-input" value={props.editDraft.code || ""} onChange={(e) => props.onEditChange({ code: e.target.value })} placeholder="Code" />
                            <input className="ab-topic-edit-input" value={props.editDraft.title || ""} onChange={(e) => props.onEditChange({ title: e.target.value })} placeholder="Title" />
                        </div>
                        <div className="ab-topic-edit-actions">
                            <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={13} /></button>
                            <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={13} /></button>
                        </div>
                    </div>
                );
                return (
                    <div key={t.id} className={`ab-topic-row ${covered ? "covered" : ""}`}>
                        <div className="ab-topic-main">
                            <div className="ab-topic-top-row">
                                <span className="ab-topic-code">{t.code}</span>
                                <span className="ab-topic-weight">{t.weight}%</span>
                            </div>
                            <span className="ab-topic-title">{t.title}</span>
                        </div>
                        <div className="ab-topic-actions">
                            {!props.isDeployed && (
                                <>
                                    <Tooltip content="+Question" placement="top"><button className="ab-tadd-btn" onClick={() => props.onAddBlock("text", t.id)}>+Q</button></Tooltip>
                                    <Tooltip content="+Reading" placement="top"><button className="ab-tadd-btn reading" onClick={() => props.onAddBlock("info", t.id)}>+R</button></Tooltip>
                                    <Tooltip content="Delete" placement="top"><button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button></Tooltip>
                                </>
                            )}
                            <Tooltip content="Edit" placement="top"><button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button></Tooltip>
                        </div>
                    </div>
                );
            })}
        </div>
    </>
);

// ─── BLOCK CARD ───────────────────────────────────────────────────────────────
interface BlockCardProps {
    block: AssessmentBlock;
    index: number;
    total: number;
    focused: boolean;
    isDeployed: boolean;
    topics: Topic[];
    onFocus: () => void;
    onUpdate: (id: string, field: keyof AssessmentBlock, val: any) => void;
    onUpdateOption: (bid: string, idx: number, val: string) => void;
    onRemove: (id: string) => void;
    onMove: (id: string, dir: "up" | "down") => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
    block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
}) => {
    const meta = BLOCK_META[block.type];
    const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

    const updateCriterion = (i: number, v: string) => { const c = [...(block.criteria || [])]; c[i] = v; onUpdate(block.id, "criteria", c); };
    const removeCriterion = (i: number) => onUpdate(block.id, "criteria", (block.criteria || []).filter((_, idx) => idx !== i));
    const addCriterion = () => onUpdate(block.id, "criteria", [...(block.criteria || []), ""]);

    const updateWA = (wi: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], [f]: v }; onUpdate(block.id, "workActivities", l); };
    const removeWA = (wi: number) => onUpdate(block.id, "workActivities", (block.workActivities || []).filter((_, i) => i !== wi));
    const addWA = () => onUpdate(block.id, "workActivities", [...(block.workActivities || []), { id: mkId(), code: "", description: "", evidenceItems: [] }]);
    const updateSE = (wi: number, si: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; const s = [...(l[wi].evidenceItems || [])]; s[si] = { ...s[si], [f]: v }; l[wi] = { ...l[wi], evidenceItems: s }; onUpdate(block.id, "workActivities", l); };
    const removeSE = (wi: number, si: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: (l[wi].evidenceItems || []).filter((_, i) => i !== si) }; onUpdate(block.id, "workActivities", l); };
    const addSE = (wi: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: [...(l[wi].evidenceItems || []), { id: mkId(), code: "", description: "" }] }; onUpdate(block.id, "workActivities", l); };

    return (
        <div id={`block-${block.id}`} className={`ab-block ${focused ? "is-focused" : ""} ${isDeployed ? "is-locked" : ""}`} style={{ "--block-accent": meta.color } as React.CSSProperties} onClick={onFocus}>
            <div className="ab-block-strip" style={{ background: meta.color }} />
            <div className="ab-block-ctrl-row">
                <div className="ab-block-left">
                    <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
                    {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
                    {isDeployed && <span className="ab-locked-icon" title="Structure Locked"><Lock size={11} /></span>}
                </div>
                {!isDeployed && (
                    <div className="ab-block-actions">
                        <Tooltip content="Move up" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "up"); }} disabled={index === 0}>↑</button></Tooltip>
                        <Tooltip content="Move down" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "down"); }} disabled={index === total - 1}>↓</button></Tooltip>
                        <Tooltip content="Delete block" placement="top"><button className="ab-ctrl-btn ab-ctrl-del" onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button></Tooltip>
                    </div>
                )}
            </div>

            {/* SECTION */}
            {block.type === "section" && (
                <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
                    <div className="ab-form-group">
                        <label className="ab-field-lbl">Section Outline Label</label>
                        <input className="ab-input" value={block.title || ""} placeholder="e.g. SECTION B – PM-01-PS02" onChange={(e) => onUpdate(block.id, "title", e.target.value)} disabled={isDeployed} />
                    </div>
                    <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
                        <label className="ab-field-lbl">Section Content / Criteria Details</label>
                        <ReactQuill theme="snow" value={block.content || ""} onChange={(v) => onUpdate(block.id, "content", v)} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Section content or assessment criteria…" />
                    </div>
                </div>
            )}

            {/* INFO */}
            {block.type === "info" && (
                <div className="ab-info-body">
                    <textarea className="ab-textarea-block" rows={5} value={block.content || ""} onChange={(e) => onUpdate(block.id, "content", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Enter reading material…" />
                </div>
            )}

            {/* WRITTEN / MCQ / TASK */}
            {["text", "mcq", "task"].includes(block.type) && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={block.type === "task" ? { background: "rgba(139,92,246,.18)", color: "#a78bfa" } : undefined}>Q{index + 1}</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>
                    <textarea className="ab-q-input" rows={2} value={block.question || ""} onChange={(e) => onUpdate(block.id, "question", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type question here…"} />

                    {block.type === "text" && (
                        <div className="ab-answer-placeholder"><FileText size={13} /><span>Learner types answer here</span></div>
                    )}

                    {block.type === "mcq" && (
                        <div className="ab-mcq-opts">
                            {block.options?.map((opt, i) => (
                                <div key={i} className={`ab-opt-row ${block.correctOption === i ? "correct" : ""}`} onClick={(e) => { if (isDeployed) return; e.stopPropagation(); onUpdate(block.id, "correctOption", i); }}>
                                    <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
                                    <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
                                    <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={(e) => e.stopPropagation()} />
                                    {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
                                </div>
                            ))}
                        </div>
                    )}

                    {block.type === "task" && (
                        <div className="ab-evidence-card" onClick={(e) => e.stopPropagation()}>
                            <span className="ab-evidence-card-title">Allowed Evidence Types</span>
                            <div className="ab-evidence-grid">
                                {[
                                    { key: "allowText", icon: <AlignLeft size={14} />, label: "Rich Text" },
                                    { key: "allowAudio", icon: <Mic size={14} />, label: "Audio" },
                                    { key: "allowUrl", icon: <LinkIcon size={14} />, label: "URL/Link" },
                                    { key: "allowUpload", icon: <UploadCloud size={14} />, label: "File Upload" },
                                    { key: "allowCode", icon: <Code size={14} />, label: "Code Editor" },
                                ].map(({ key, icon, label }) => (
                                    <label key={key} className={`ab-evidence-row ${isDeployed ? "ab-disabled" : ""}`}>
                                        <input type="checkbox" checked={(block as any)[key]} disabled={isDeployed} onChange={(e) => onUpdate(block.id, key as keyof AssessmentBlock, e.target.checked)} className="ab-checkbox" />
                                        {icon}<span>{label}</span>
                                    </label>
                                ))}
                            </div>
                            {(block.allowUpload || block.allowCode) && (
                                <div className="ab-evidence-sub">
                                    {block.allowUpload && (
                                        <div className="ab-form-group ab-flex-1">
                                            <label className="ab-field-lbl">File Type Restriction</label>
                                            <select className="ab-input" value={block.allowedFileTypes || "all"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "allowedFileTypes", e.target.value)}>
                                                <option value="all">Any File</option>
                                                <option value="presentation">Presentations (.pptx, .pdf)</option>
                                                <option value="video">Video (.mp4, .mov)</option>
                                                <option value="image">Images (.png, .jpg)</option>
                                            </select>
                                        </div>
                                    )}
                                    {block.allowCode && (
                                        <div className="ab-form-group ab-flex-1">
                                            <label className="ab-field-lbl">Syntax Highlighting</label>
                                            <select className="ab-input" value={block.codeLanguage || "javascript"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "codeLanguage", e.target.value)}>
                                                <option value="javascript">JavaScript / TypeScript</option>
                                                <option value="python">Python</option>
                                                <option value="html">HTML / CSS</option>
                                                <option value="sql">SQL</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* CHECKLIST */}
            {block.type === "checklist" && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={{ background: "rgba(20,184,166,.18)", color: "#2dd4bf" }}>CHK</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks || 0}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>

                    <div className="ab-form-group" onClick={(e) => e.stopPropagation()}>
                        <label className="ab-field-lbl">Practical Task Outcome / Instruction</label>
                        <input type="text" className="ab-input" value={block.title || ""} onChange={(e) => onUpdate(block.id, "title", e.target.value)} placeholder="e.g. PA0101 Demonstrate the use of…" />
                    </div>

                    <div className="ab-checklist-toggles" onClick={(e) => e.stopPropagation()}>
                        <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
                            <input type="checkbox" disabled={isDeployed} checked={block.requirePerCriterionTiming !== false} onChange={(e) => onUpdate(block.id, "requirePerCriterionTiming", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
                            Require Timers per task
                        </label>
                        <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
                            <input type="checkbox" disabled={isDeployed} checked={block.requireEvidencePerCriterion !== false} onChange={(e) => onUpdate(block.id, "requireEvidencePerCriterion", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
                            Require Evidence per task
                        </label>
                    </div>

                    <div className="ab-criteria-body" onClick={(e) => e.stopPropagation()}>
                        <span className="ab-criteria-body-title">Evaluation Criteria to Observe:</span>
                        {block.criteria?.map((criterion, i) => (
                            <div key={i} className="ab-criterion-item">
                                <div className="ab-criterion-header">
                                    <span className="ab-criterion-num">{i + 1}</span>
                                    <input type="text" className="ab-input ab-input--bold" value={criterion} disabled={isDeployed} onChange={(e) => updateCriterion(i, e.target.value)} placeholder="e.g. Open files and folders" />
                                    {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeCriterion(i)}><X size={15} /></button>}
                                </div>
                                <div className="ab-criterion-preview-stack">
                                    {block.requireEvidencePerCriterion !== false && (
                                        <div className="ab-criterion-preview">
                                            <UploadCloud size={13} />
                                            <em>Learner uploads evidence here…</em>
                                        </div>
                                    )}
                                    {block.requirePerCriterionTiming !== false && (
                                        <div className="ab-criterion-timer">
                                            <Timer size={13} />
                                            <span className="ab-criterion-timer-label">Task Timer:</span>
                                            <span className="ab-btn ab-btn-sm" style={{ background: "rgba(59,130,246,.35)", color: "#93c5fd", border: "none", cursor: "default", padding: "2px 8px", borderRadius: "4px", fontSize: "0.68rem" }}>Start</span>
                                            <span className="ab-criterion-timer-clock">00:00:00</span>
                                        </div>
                                    )}
                                    <div className="ab-criterion-radios">
                                        <span className="ab-crit-competent"><input type="radio" disabled /> C — Competent</span>
                                        <span className="ab-crit-nyc"><input type="radio" disabled /> NYC</span>
                                        <input type="text" className="ab-input ab-input-ghost" disabled placeholder="Assessor comments…" />
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!isDeployed && <button className="ab-btn-text" onClick={addCriterion}><Plus size={13} /> Add Criterion</button>}

                        <div className="ab-signoff-preview">
                            <span className="ab-signoff-title">Global Assessor / Mentor Sign-off Preview</span>
                            <div className="ab-signoff-grid">
                                <input type="text" className="ab-input" disabled placeholder="Date…" />
                                <input type="text" className="ab-input" disabled placeholder="Time Started…" />
                                <input type="text" className="ab-input" disabled placeholder="Time Completed…" />
                            </div>
                            <textarea className="ab-input" rows={2} disabled placeholder="General Comments of Observer…" />
                            <label className="ab-signoff-declaration">
                                <input type="checkbox" disabled checked className="ab-checkbox" />
                                I declare that I have observed the learner performing these tasks.
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* LOGBOOK */}
            {block.type === "logbook" && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={{ background: "rgba(249,115,22,.18)", color: "#fb923c" }}>LOG</span>
                    </div>
                    <div className="ab-logbook-card">
                        <div className="ab-logbook-title"><CalendarRange size={17} /> Standard Logbook Table Inserted</div>
                        <p className="ab-logbook-body">Learners will log Date, Assignment Task, Start / Finish Times, and Total Hours. No further configuration needed.</p>
                    </div>
                </div>
            )}

            {/* QCTO WORKPLACE CHECKPOINT */}
            {block.type === "qcto_workplace" && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={{ background: "rgba(225,29,72,.18)", color: "#fb7185" }}>QCTO</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks || 0}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
                        </div>
                    </div>
                    <div className="ab-qcto-card" onClick={(e) => e.stopPropagation()}>
                        <div className="ab-form-group">
                            <label className="ab-qcto-label">WE Module Code</label>
                            <input type="text" className="ab-input ab-qcto-input" value={block.weCode || ""} onChange={(e) => onUpdate(block.id, "weCode", e.target.value)} disabled={isDeployed} placeholder="e.g. WM-01-WE01" />
                        </div>
                        <div className="ab-form-group">
                            <label className="ab-qcto-label">Work Experience Title</label>
                            <input type="text" className="ab-input ab-qcto-input" value={block.weTitle || ""} onChange={(e) => onUpdate(block.id, "weTitle", e.target.value)} disabled={isDeployed} placeholder="e.g. Attend induction program…" />
                        </div>
                        <div className="ab-qcto-activities">
                            <span className="ab-qcto-activities-title">Workplace Activities (WA) & Evidence Links</span>
                            {(block.workActivities || []).map((wa, wi) => (
                                <div key={wa.id} className="ab-wa-row">
                                    <div className="ab-wa-inputs">
                                        <input type="text" className="ab-input ab-w-80" value={wa.code} onChange={(e) => updateWA(wi, "code", e.target.value)} disabled={isDeployed} placeholder="WA0101" />
                                        <input type="text" className="ab-input ab-flex-1" value={wa.description} onChange={(e) => updateWA(wi, "description", e.target.value)} disabled={isDeployed} placeholder="Activity description…" />
                                        {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeWA(wi)}><X size={15} /></button>}
                                    </div>
                                    <div className="ab-se-list">
                                        <span className="ab-se-title">Required Supporting Evidence (SE)</span>
                                        {(wa.evidenceItems || []).map((se, si) => (
                                            <div key={se.id} className="ab-se-row">
                                                <input type="text" className="ab-input sm ab-w-70" value={se.code} onChange={(e) => updateSE(wi, si, "code", e.target.value)} disabled={isDeployed} placeholder="SE0101" />
                                                <input type="text" className="ab-input sm ab-flex-1" value={se.description} onChange={(e) => updateSE(wi, si, "description", e.target.value)} disabled={isDeployed} placeholder="Describe expected evidence…" />
                                                {!isDeployed && <button className="ab-btn-icon-danger ab-btn-icon-sm" onClick={() => removeSE(wi, si)}><Trash2 size={11} /></button>}
                                            </div>
                                        ))}
                                        {!isDeployed && <button className="ab-btn-text ab-btn-text--sm ab-btn-text--rose" onClick={() => addSE(wi)}><Plus size={11} /> Add Evidence</button>}
                                    </div>
                                </div>
                            ))}
                            {!isDeployed && <button className="ab-btn-text ab-btn-text--rose" onClick={addWA}><Plus size={13} /> Add Workplace Activity</button>}
                        </div>
                        <div className="ab-qcto-toggles">
                            <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
                                <input type="checkbox" disabled={isDeployed} checked={block.requireSelfAssessment !== false} onChange={(e) => onUpdate(block.id, "requireSelfAssessment", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
                                Require Self-Assessment
                            </label>
                            <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
                                <input type="checkbox" disabled={isDeployed} checked={block.requireGoalPlanning !== false} onChange={(e) => onUpdate(block.id, "requireGoalPlanning", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
                                Require Goal Planning
                            </label>
                        </div>
                        <p className="ab-qcto-footnote">* Learners will see a QCTO Checkpoint form mapping their uploads to WA and SE codes, alongside mentor sign-off.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── OVERLAYS & UTILITY COMPONENTS ───────────────────────────────────────────
const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void; }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
    <div className="ab-overlay-backdrop" onClick={onCancel}>
        <div className="ab-delete-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
            <h3 className="ab-dd-title">Delete Topic?</h3>
            <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
            {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
            <div className="ab-dd-actions">
                <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={13} /> Delete</button>
            </div>
        </div>
    </div>
);

const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="ab-section-hdr">{icon}<span>{label}</span></div>
);

const FG: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties; }> = ({ label, children, style }) => (
    <div className="ab-fg" style={style}>
        {label && <label className="ab-fg-label">{label}</label>}
        {children}
    </div>
);

const EmptyCanvas: React.FC<{ onAdd: (t: string) => void }> = ({ onAdd }) => (
    <div className="ab-empty-canvas">
        <div className="ab-empty-inner">
            <div className="ab-empty-icon"><BookOpen size={28} /></div>
            <h2 className="ab-empty-title">Drafting Surface</h2>
            <p className="ab-empty-sub">Choose a block type to begin building</p>
            <div className="ab-empty-grid">
                {(Object.keys(BLOCK_META) as BlockType[]).map((bt) => (
                    <button key={bt} className="ab-empty-card" style={{ "--block-color": BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
                        <span className="ab-empty-icon-bt">{BLOCK_META[bt].icon}</span>
                        <span className="ab-empty-lbl">{BLOCK_META[bt].label}</span>
                        <span className="ab-empty-desc">{BLOCK_META[bt].desc}</span>
                    </button>
                ))}
            </div>
        </div>
    </div>
);

export default AssessmentBuilder;



// import React, { useState, useEffect } from "react";
// import { useNavigate, useParams } from "react-router-dom";
// import {
//     collection, doc, getDoc, setDoc, writeBatch, query, where, getDocs,
// } from "firebase/firestore";
// import {
//     getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
// } from "firebase/storage";
// import { db } from "../../../lib/firebase";
// import { useStore } from "../../../store/useStore";
// import {
//     ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
//     FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
//     BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
//     Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
//     Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive,
// } from "lucide-react";
// import Tooltip from "../../../components/common/Tooltip/Tooltip";
// import type { Cohort, ProgrammeTemplate, DashboardLearner } from "../../../types";
// import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
// import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
// import ReactQuill from "react-quill-new";
// import "react-quill-new/dist/quill.snow.css";
// import "./AssessmentBuilder.css";
// import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";

// const quillModules = {
//     toolbar: [
//         ["bold", "italic", "underline", "code-block"],
//         [{ list: "ordered" }, { list: "bullet" }],
//         ["clean"],
//     ],
// };
// const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

// export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace";
// type SidebarPanel = "settings" | "module" | "topics" | "guide" | "outline";

// interface Topic {
//     id: string;
//     code: string;
//     title: string;
//     weight: string | number;
// }
// export interface WorkplaceEvidenceItem {
//     id: string;
//     code: string;
//     description: string;
// }
// export interface WorkplaceActivity {
//     id: string;
//     code: string;
//     description: string;
//     evidenceItems?: WorkplaceEvidenceItem[];
// }

// export interface AssessmentBlock {
//     id: string;
//     type: BlockType;
//     title?: string;
//     content?: string;
//     question?: string;
//     marks?: number;
//     options?: string[];
//     correctOption?: number;
//     linkedTopicId?: string;
//     allowText?: boolean;
//     allowUpload?: boolean;
//     allowAudio?: boolean;
//     allowUrl?: boolean;
//     allowCode?: boolean;
//     allowedFileTypes?: "all" | "image" | "document" | "video" | "presentation";
//     codeLanguage?: "javascript" | "python" | "html" | "sql" | "other";
//     criteria?: string[];
//     requireTimeTracking?: boolean;
//     requirePerCriterionTiming?: boolean;
//     requireObservationDeclaration?: boolean;
//     requireEvidencePerCriterion?: boolean;
//     weCode?: string;
//     weTitle?: string;
//     workActivities?: WorkplaceActivity[];
//     requireSelfAssessment?: boolean;
//     requireGoalPlanning?: boolean;
// }

// interface ModuleDetails {
//     title: string;
//     nqfLevel: string;
//     credits: number;
//     notionalHours: number;
//     moduleNumber: string;
//     occupationalCode: string;
//     saqaQualId: string;
//     qualificationTitle: string;
//     timeLimit?: number;
// }

// type AssessmentStatusType = "draft" | "scheduled" | "active" | "completed";

// const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// const BLOCK_META: Record<
//     BlockType,
//     { label: string; color: string; icon: React.ReactNode; desc: string }
// > = {
//     section: { label: "Section", color: "#6366f1", icon: <Layout size={14} />, desc: "Organises blocks under a heading" },
//     info: { label: "Reading", color: "#0ea5e9", icon: <Info size={14} />, desc: "Context or learning material" },
//     text: { label: "Written", color: "#f59e0b", icon: <AlignLeft size={14} />, desc: "Standard free-text response" },
//     mcq: { label: "MCQ", color: "#10b981", icon: <CheckSquare size={14} />, desc: "Select the correct option" },
//     task: { label: "Multi-Modal", color: "#8b5cf6", icon: <Layers size={14} />, desc: "File uploads, audio, code, or links" },
//     checklist: { label: "Checklist", color: "#14b8a6", icon: <ListChecks size={14} />, desc: "Assessor C/NYC observation list" },
//     logbook: { label: "Basic Logbook", color: "#f97316", icon: <CalendarRange size={14} />, desc: "Standard workplace hours logbook" },
//     qcto_workplace: { label: "QCTO Workplace Checkpoint", color: "#e11d48", icon: <Briefcase size={14} />, desc: "SETA compliant workplace checkpoint" },
// };

// export const AssessmentBuilder: React.FC = () => {
//     const { assessmentId } = useParams();
//     const navigate = useNavigate();
//     const toast = useToast();
//     const {
//         user,
//         cohorts,
//         learners,
//         programmes,
//         fetchCohorts,
//         fetchLearners,
//         fetchProgrammes,
//     } = useStore();

//     const [loading, setLoading] = useState(false);
//     const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
//     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
//     const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
//     const [lastSaved, setLastSaved] = useState<Date | null>(null);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

//     const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");

//     const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
//     const [selectedModuleCode, setSelectedModuleCode] = useState("");
//     const [showProgrammeModal, setShowProgrammeModal] = useState(false);
//     const [showCohortModal, setShowCohortModal] = useState(false);
//     const [title, setTitle] = useState("");
//     const [cohortIds, setCohortIds] = useState<string[]>([]);
//     const [instructions, setInstructions] = useState("");
//     const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook">("formative");
//     const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");
//     const [isOpenBook, setIsOpenBook] = useState(false);
//     const [referenceManualUrl, setReferenceManualUrl] = useState("");
//     const [isUploadingManual, setIsUploadingManual] = useState(false);
//     const [isScheduled, setIsScheduled] = useState(false);
//     const [scheduledDate, setScheduledDate] = useState("");
//     const [showModuleHeader, setShowModuleHeader] = useState(true);
//     const [moduleInfo, setModuleInfo] = useState<ModuleDetails>({
//         title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
//         occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 60,
//     });
//     const [learnerNote, setLearnerNote] = useState("");
//     const [modulePurpose, setModulePurpose] = useState("");
//     const [entryRequirements, setEntryRequirements] = useState("");
//     const [providerRequirements, setProviderRequirements] = useState("");
//     const [exemptions, setExemptions] = useState("");
//     const [stakeholderGuidelines, setStakeholderGuidelines] = useState("");
//     const [topics, setTopics] = useState<Topic[]>([]);
//     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);
//     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
//     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
//     const [addingTopic, setAddingTopic] = useState(false);
//     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: "", title: "", weight: "" });
//     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

//     const isDeployed = assessmentStatus !== "draft" && assessmentId !== undefined;

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (programmes.length === 0) fetchProgrammes();
//         const loadData = async () => {
//             if (!assessmentId) return;
//             setLoading(true);
//             try {
//                 const snap = await getDoc(doc(db, "assessments", assessmentId));
//                 if (snap.exists()) {
//                     const d = snap.data();
//                     setTitle(d.title || "");
//                     setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
//                     setInstructions(d.instructions || "");
//                     setType(d.type || "formative");
//                     setModuleType(d.moduleType || "knowledge");
//                     setAssessmentStatus(d.status || "draft");
//                     setIsOpenBook(d.isOpenBook || false);
//                     setReferenceManualUrl(d.referenceManualUrl || "");
//                     if (d.scheduledDate) {
//                         try {
//                             const dt = new Date(d.scheduledDate);
//                             if (!isNaN(dt.getTime())) {
//                                 const p = (n: number) => n.toString().padStart(2, "0");
//                                 setScheduledDate(`${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`);
//                             } else setScheduledDate(d.scheduledDate);
//                         } catch {
//                             setScheduledDate(d.scheduledDate);
//                         }
//                     }
//                     setIsScheduled(!!d.scheduledDate);
//                     setSelectedProgrammeId(d.linkedProgrammeId || "");
//                     setSelectedModuleCode(d.linkedModuleCode || "");
//                     setModuleInfo(d.moduleInfo || {});
//                     setShowModuleHeader(d.showModuleHeader ?? true);
//                     setBlocks(d.blocks || []);
//                     if (d.learnerGuide) {
//                         setLearnerNote(d.learnerGuide.note || "");
//                         setModulePurpose(d.learnerGuide.purpose || "");
//                         setEntryRequirements(d.learnerGuide.entryRequirements || "");
//                         setProviderRequirements(d.learnerGuide.providerRequirements || "");
//                         setExemptions(d.learnerGuide.exemptions || "");
//                         setStakeholderGuidelines(d.learnerGuide.stakeholderGuidelines || "");
//                     }
//                     if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
//                     setSaveStatus("saved");
//                     setLastSaved(new Date(d.lastUpdated || d.createdAt));
//                 } else {
//                     toast.error("Assessment not found");
//                     navigate("/facilitator/assessments");
//                 }
//             } catch {
//                 toast.error("Could not load the requested assessment.");
//             } finally {
//                 setLoading(false);
//             }
//         };
//         loadData();
//     }, [assessmentId]);

//     useEffect(() => {
//         if (!selectedProgrammeId || !selectedModuleCode) return;
//         if (assessmentId && topics.length > 0) return;
//         const prog = programmes.find((p) => p.id === selectedProgrammeId);
//         if (!prog) return;
//         const allMods = [...(prog.knowledgeModules || []), ...(prog.practicalModules || []), ...(prog.workExperienceModules || [])];
//         const mod: any = allMods.find((m: any, idx: number) => (m.code || m.name || `mod-${idx}`) === selectedModuleCode);
//         if (mod) {
//             setModuleInfo({
//                 title: mod.name,
//                 nqfLevel: `Level ${mod.nqfLevel || prog.nqfLevel}`,
//                 credits: mod.credits || 0,
//                 notionalHours: mod.notionalHours || 0,
//                 moduleNumber: mod.code || "",
//                 occupationalCode: (prog as any).curriculumCode || prog.saqaId || "",
//                 saqaQualId: prog.saqaId || "",
//                 qualificationTitle: prog.name || "",
//                 timeLimit: moduleInfo.timeLimit || 60,
//             });
//             if (mod.topics?.length) {
//                 const t = mod.topics.map((t: any) => ({ id: mkId(), code: t.code || "", title: t.title || "Unnamed Topic", weight: t.weight || "0" }));
//                 setTopics(t);
//                 toast.success(`Imported ${t.length} topics!`);
//             } else setTopics([]);
//         }
//     }, [selectedProgrammeId, selectedModuleCode]);

//     useEffect(() => {
//         if (!assessmentId) return;
//         setSaveStatus("unsaved");
//         const t = setTimeout(() => {
//             if (saveStatus === "unsaved" && !loading) handleSave(assessmentStatus === "draft" ? "draft" : "active", true);
//         }, 30000);
//         return () => clearTimeout(t);
//     }, [
//         title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//         stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
//         scheduledDate, isScheduled, isOpenBook, referenceManualUrl,
//     ]);

//     const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         setIsUploadingManual(true);
//         toast.info("Uploading reference manual...");
//         try {
//             const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/manuals/${Date.now()}_${file.name}`), file);
//             task.on("state_changed", null, () => {
//                 toast.error("Upload failed.");
//                 setIsUploadingManual(false);
//             }, async () => {
//                 setReferenceManualUrl(await getDownloadURL(task.snapshot.ref));
//                 toast.success("Manual uploaded!");
//                 setIsUploadingManual(false);
//             });
//         } catch {
//             toast.error("Upload failed.");
//             setIsUploadingManual(false);
//         }
//     };

//     const handleSaveNewCohort = async (cohortData: Omit<Cohort, "id" | "createdAt" | "staffHistory" | "isArchived">, reasons?: any) => {
//         const ref = doc(collection(db, "cohorts"));
//         const id = ref.id;
//         await setDoc(ref, {
//             ...cohortData,
//             id,
//             createdAt: new Date().toISOString(),
//             isArchived: false,
//             staffHistory: [],
//             status: "active",
//             changeReasons: reasons || {},
//         });
//         await fetchCohorts();
//         setCohortIds((p) => [...p, id]);
//         toast.success(`Class "${cohortData.name}" created!`);
//         setShowCohortModal(false);
//     };

//     const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
//     const commitEdit = () => {
//         if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
//         setTopics((p) => p.map((t) => t.id === editingTopicId ? ({ ...t, ...editDraft } as Topic) : t));
//         setEditingTopicId(null);
//     };
//     const cancelEdit = () => setEditingTopicId(null);
//     const confirmDelete = (id: string) => setDeleteConfirmId(id);
//     const executeDelete = () => {
//         if (!deleteConfirmId) return;
//         setBlocks((p) => p.map((b) => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
//         setTopics((p) => p.filter((t) => t.id !== deleteConfirmId));
//         setDeleteConfirmId(null);
//     };
//     const cancelDelete = () => setDeleteConfirmId(null);
//     const commitAdd = () => {
//         if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
//         setTopics((p) => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || "0%" }]);
//         setNewTopic({ code: "", title: "", weight: "" });
//         setAddingTopic(false);
//     };
//     const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

//     const addBlock = (bType: string, linkedTopicId?: string) => {
//         let actualType: BlockType = bType as BlockType;
//         if (["upload", "audio", "code"].includes(bType)) actualType = "task";
//         const nb: AssessmentBlock = {
//             id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
//             type: actualType,
//             linkedTopicId,
//             title: actualType === "section" ? "New Section" : "",
//             content: "",
//             question: "",
//             marks: ["text", "mcq", "task"].includes(actualType) ? 5 : ["checklist", "qcto_workplace"].includes(actualType) ? 10 : 0,
//             options: actualType === "mcq" ? ["", "", "", ""] : [],
//             correctOption: 0,
//         };
//         if (actualType === "checklist") {
//             nb.title = "Demonstrate the use of various functionalities:";
//             nb.criteria = ["Task criterion 1", "Task criterion 2"];
//             nb.requireTimeTracking = true;
//             nb.requirePerCriterionTiming = true;
//             nb.requireObservationDeclaration = true;
//             nb.requireEvidencePerCriterion = true;
//         } else if (actualType === "logbook") {
//             nb.title = "Workplace Logbook Entry";
//             nb.content = "Learner must log assignment tasks, start/finish times, and total hours.";
//         } else if (actualType === "qcto_workplace") {
//             nb.title = "Workplace Experience Checkpoint";
//             nb.weCode = "WM-01-WE01";
//             nb.weTitle = "Attend induction program";
//             nb.workActivities = [
//                 {
//                     id: mkId(),
//                     code: "WA0101",
//                     description: "Define the problem",
//                     evidenceItems: [{ id: mkId(), code: "SE0101", description: "Logbook entry / Signed attendance register" }],
//                 },
//             ];
//             nb.requireSelfAssessment = true;
//             nb.requireGoalPlanning = true;
//         } else if (actualType === "task") {
//             nb.question = bType === "upload" ? "Please upload your evidence:" : bType === "audio" ? "Please record your verbal response:" : bType === "code" ? "Please write your code:" : "Describe or demonstrate your solution:";
//             nb.allowText = bType === "task";
//             nb.allowUpload = ["upload", "task"].includes(bType);
//             nb.allowAudio = ["audio", "task"].includes(bType);
//             nb.allowUrl = ["code", "task"].includes(bType);
//             nb.allowCode = ["code", "task"].includes(bType);
//             nb.allowedFileTypes = "all";
//             nb.codeLanguage = "javascript";
//         }
//         setBlocks((p) => [...p, nb]);
//         setTimeout(() => {
//             setFocusedBlock(nb.id);
//             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
//         }, 60);
//     };

//     const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) => setBlocks((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
//     const updateOption = (bid: string, idx: number, val: string) => setBlocks((p) => p.map((b) => { if (b.id !== bid || !b.options) return b; const o = [...b.options]; o[idx] = val; return { ...b, options: o }; }));
//     const removeBlock = (id: string) => {
//         if (window.confirm("Remove this block?")) {
//             setBlocks((p) => p.filter((b) => b.id !== id));
//             setFocusedBlock(null);
//             toast.info("Block removed");
//         }
//     };
//     const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
//         const i = p.findIndex((b) => b.id === id);
//         if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
//         const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
//         [n[i], n[sw]] = [n[sw], n[i]];
//         return n;
//     });
//     const resetModuleInfo = () => {
//         if (window.confirm("Clear all module fields?")) {
//             setModuleInfo({
//                 title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
//                 occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
//             });
//             setSelectedProgrammeId("");
//             setSelectedModuleCode("");
//             setTopics([]);
//         }
//     };

//     const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
//     const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
//     const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

//     const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
//         let id = ((newProg as any).curriculumCode || newProg.saqaId || "").toString().trim().replace(/[\s/]+/g, "-");
//         if (!id) throw new Error("Curriculum Code or SAQA ID required.");
//         await setDoc(
//             doc(db, "programmes", id),
//             { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
//             { merge: true },
//         );
//         toast.success("Blueprint created!");
//         setShowProgrammeModal(false);
//         await fetchProgrammes();
//         setSelectedProgrammeId(id);
//         setSelectedModuleCode("");
//     };

//     // Parameter now strictly matches AssessmentStatusType
//     const handleSave = async (status: AssessmentStatusType, isAutoSave = false) => {
//         if (!title.trim() && !isAutoSave) {
//             toast.warning("Please enter a Workbook Title.");
//             return;
//         }
//         if (cohortIds.length === 0 && !isAutoSave && status === "active") {
//             toast.warning("Please select at least one Cohort.");
//             return;
//         }
//         if (!isAutoSave) setLoading(true);
//         setSaveStatus("saving");
//         try {
//             const sanitizedBlocks = blocks.map((b) => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.linkedTopicId) {
//                     const t = topics.find((tp) => tp.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }
//                 if (b.type === "section") {
//                     c.title = b.title || "Untitled Section";
//                     c.content = b.content || "";
//                 }
//                 if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
//                 if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
//                 if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
//                 if (b.type === "mcq") {
//                     c.options = b.options || ["", "", "", ""];
//                     c.correctOption = b.correctOption || 0;
//                 }
//                 if (b.type === "checklist") {
//                     c.criteria = b.criteria || [];
//                     c.requireTimeTracking = b.requireTimeTracking !== false;
//                     c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
//                     c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
//                     c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
//                 }
//                 if (b.type === "qcto_workplace") {
//                     c.weCode = b.weCode || "";
//                     c.weTitle = b.weTitle || "";
//                     c.workActivities = b.workActivities || [];
//                     c.requireSelfAssessment = b.requireSelfAssessment !== false;
//                     c.requireGoalPlanning = b.requireGoalPlanning !== false;
//                 }
//                 if (b.type === "task") {
//                     c.allowText = b.allowText;
//                     c.allowUpload = b.allowUpload;
//                     c.allowAudio = b.allowAudio;
//                     c.allowUrl = b.allowUrl;
//                     c.allowCode = b.allowCode;
//                     c.allowedFileTypes = b.allowedFileTypes;
//                     c.codeLanguage = b.codeLanguage;
//                 }
//                 return c;
//             });
//             let finalStatus: AssessmentStatusType = status;
//             let finalScheduledDate: string | null = null;
//             if (isScheduled && scheduledDate) {
//                 if (status === "draft") finalStatus = "scheduled";
//                 finalScheduledDate = new Date(scheduledDate).toISOString();
//             }
//             if (isDeployed && status === "draft" && !isAutoSave) finalStatus = assessmentStatus;
//             const payload = {
//                 title, type, moduleType, cohortIds,
//                 linkedProgrammeId: selectedProgrammeId,
//                 linkedModuleCode: selectedModuleCode,
//                 scheduledDate: finalScheduledDate,
//                 instructions: instructions || "",
//                 moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
//                 learnerGuide: {
//                     note: learnerNote, purpose: modulePurpose, entryRequirements,
//                     providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
//                 },
//                 topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
//                 facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
//             };
//             const batch = writeBatch(db);
//             let curId = assessmentId;
//             if (curId) {
//                 batch.set(doc(db, "assessments", curId), payload, { merge: true });
//             } else {
//                 const r = doc(collection(db, "assessments"));
//                 curId = r.id;
//                 batch.set(r, {
//                     ...payload, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator",
//                 });
//             }
//             if (["active", "scheduled"].includes(finalStatus)) {
//                 const cohortLearners = learners.filter((l) => cohortIds.includes(String(l.cohortId || "").trim()));
//                 if (cohortLearners.length > 0) {
//                     const existingIds = new Set((await getDocs(query(collection(db, "learner_submissions"), where("assessmentId", "==", curId)))).docs.map((d) => d.id));
//                     cohortLearners.forEach((l: DashboardLearner) => {
//                         const sid = `${l.cohortId || "Unassigned"}_${l.learnerId || l.id}_${curId}`;
//                         const ref = doc(db, "learner_submissions", sid);
//                         if (!existingIds.has(sid))
//                             batch.set(ref, {
//                                 learnerId: l.learnerId || l.id,
//                                 enrollmentId: l.enrollmentId || l.id,
//                                 qualificationName: l.qualification?.name || "",
//                                 assessmentId: curId,
//                                 cohortId: l.cohortId || "Unassigned",
//                                 title, type, moduleType, status: "not_started",
//                                 assignedAt: new Date().toISOString(),
//                                 marks: 0, totalMarks, moduleNumber: moduleInfo.moduleNumber,
//                                 createdAt: new Date().toISOString(),
//                                 createdBy: user?.uid || "System",
//                             });
//                         else
//                             batch.set(ref, { title, type, moduleType, totalMarks, moduleNumber: moduleInfo.moduleNumber }, { merge: true });
//                     });
//                 }
//             }
//             await batch.commit();
//             setAssessmentStatus(finalStatus);
//             setSaveStatus("saved");
//             setLastSaved(new Date());
//             if (!isAutoSave) {
//                 if (finalStatus === "active") toast.success("Workbook Published & Assigned!");
//                 else if (finalStatus === "scheduled") toast.success("Workbook Scheduled!");
//                 else toast.success("Draft saved!");
//             }
//             if (!assessmentId && curId && !isAutoSave) navigate(`/facilitator/assessments/builder/${curId}`, { replace: true });
//         } catch (err: any) {
//             setSaveStatus("unsaved");
//             if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
//         } finally {
//             if (!isAutoSave) setLoading(false);
//         }
//     };

//     const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

//     return (
//         <div className="ab-root animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* ── TOPBAR ── */}
//             <header className="ab-topbar">
//                 <div className="ab-topbar-left">
//                     {/* Added onClick to trigger mobile drawer */}
//                     <button className="ab-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                         <Menu size={20} />
//                     </button>
//                     <Tooltip content="Return to assessments list" placement="bottom">
//                         <button className="ab-back-btn" onClick={() => navigate(-1)}>
//                             <ArrowLeft size={18} />
//                             <span className="ab-hide-mobile">Back</span>
//                         </button>
//                     </Tooltip>
//                 </div>
//                 <div className="ab-topbar-centre">
//                     <BookOpen size={16} className="ab-topbar-icon" />
//                     <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
//                     <span className={`ab-topbar-badge ${type} ab-hide-mobile`}>{type}</span>
//                 </div>
//                 <div className="ab-topbar-actions">
//                     <div className="ab-stats-pill ab-hide-mobile">
//                         <span><strong>{qCount}</strong> Qs</span>
//                         <div className="ab-sdiv" />
//                         <span><strong>{totalMarks}</strong> marks</span>
//                     </div>
//                     <div className={`ab-save-status ${saveStatus} ab-hide-mobile`}>
//                         {saveStatus === "saved" && (
//                             <>
//                                 <Check size={13} />
//                                 <span>Saved</span>
//                                 {lastSaved && <span className="ab-save-time">{new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
//                             </>
//                         )}
//                         {saveStatus === "saving" && (
//                             <>
//                                 <div className="ab-spinner" />
//                                 <span>Saving…</span>
//                             </>
//                         )}
//                         {saveStatus === "unsaved" && (
//                             <>
//                                 <AlertTriangle size={13} />
//                                 <span>Unsaved</span>
//                             </>
//                         )}
//                     </div>
//                     {assessmentId && (
//                         <Tooltip content="Preview what learners will see" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
//                                 <Eye size={15} />
//                                 <span className="ab-hide-mobile">Preview</span>
//                             </button>
//                         </Tooltip>
//                     )}
//                     {!isDeployed && (
//                         <button className="ab-btn ab-btn-ghost ab-hide-mobile" onClick={() => handleSave("draft")} disabled={loading}>
//                             {loading ? "Saving…" : "Save Draft"}
//                         </button>
//                     )}
//                     <button className="ab-btn ab-btn-primary" onClick={() => handleSave("active")} disabled={loading}>
//                         <Zap size={15} />
//                         <span className="ab-hide-mobile">{isDeployed ? "Update" : "Publish"}</span>
//                     </button>
//                 </div>
//             </header>

//             <div className="ab-body">
//                 {isMobileMenuOpen && <div className="ab-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

//                 {/* ── SIDEBAR ── */}
//                 <aside className={`ab-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
//                     <button className="ab-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
//                         <X size={22} />
//                     </button>
//                     <nav className="ab-sidebar-nav">
//                         {(
//                             [
//                                 { id: "settings", icon: <Settings size={14} />, label: "Settings", tooltip: "Basic workbook settings" },
//                                 { id: "module", icon: <GraduationCap size={14} />, label: "Module", tooltip: "QCTO module info" },
//                                 { id: "topics", icon: <ListChecks size={14} />, label: "Topics", tooltip: "Manage topic elements" },
//                                 { id: "guide", icon: <BookMarked size={14} />, label: "Guide", tooltip: "Learner guide content" },
//                                 { id: "outline", icon: <Eye size={14} />, label: "Outline", tooltip: "View workbook structure" },
//                             ] as const
//                         ).map((t) => (
//                             <Tooltip key={t.id} content={t.tooltip} placement="bottom">
//                                 <button className={`ab-nav-btn ${activePanel === t.id ? "active" : ""}`} onClick={() => { setActivePanel(t.id); setIsMobileMenuOpen(false); }}>
//                                     {t.icon}
//                                     <span>{t.label}</span>
//                                 </button>
//                             </Tooltip>
//                         ))}
//                     </nav>

//                     <div className="ab-sidebar-body">
//                         {/* ── SETTINGS PANEL ── */}
//                         {activePanel === "settings" && (
//                             <>
//                                 <SectionHdr icon={<Database size={13} />} label="Curriculum Link" />
//                                 <FG label="Programme Template">
//                                     <div className="ab-row-gap">
//                                         <div className="ab-sel-wrap ab-flex-1">
//                                             <select className="ab-input ab-sel" value={selectedProgrammeId} onChange={(e) => { setSelectedProgrammeId(e.target.value); setSelectedModuleCode(""); }}>
//                                                 <option value="">-- Custom / Blank --</option>
//                                                 {programmes.filter((p) => !p.isArchived).map((p) => (
//                                                     <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>
//                                                 ))}
//                                             </select>
//                                             <ChevronDown size={12} className="ab-sel-arr" />
//                                         </div>
//                                         <Tooltip content="Create Blueprint" placement="top">
//                                             <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
//                                                 <Plus size={13} /> New
//                                             </button>
//                                         </Tooltip>
//                                     </div>
//                                 </FG>
//                                 {selectedProgrammeId && activeProgramme && (
//                                     <FG label="Module (auto-populates topics)">
//                                         <div className="ab-sel-wrap">
//                                             <select className="ab-input ab-sel" value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
//                                                 <option value="">-- Select Module --</option>
//                                                 {(activeProgramme.knowledgeModules || []).length > 0 && (
//                                                     <optgroup label="Knowledge Modules (KM)">
//                                                         {activeProgramme.knowledgeModules.map((m: any, i: number) => {
//                                                             const v = m.code || m.name || `mod-km-${i}`;
//                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                                 {(activeProgramme.practicalModules || []).length > 0 && (
//                                                     <optgroup label="Practical Modules (PM)">
//                                                         {activeProgramme.practicalModules.map((m: any, i: number) => {
//                                                             const v = m.code || m.name || `mod-pm-${i}`;
//                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                                 {(activeProgramme.workExperienceModules || []).length > 0 && (
//                                                     <optgroup label="Workplace Modules (WM)">
//                                                         {activeProgramme.workExperienceModules.map((m: any, i: number) => {
//                                                             const v = m.code || m.name || `mod-wm-${i}`;
//                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                             </select>
//                                             <ChevronDown size={12} className="ab-sel-arr" />
//                                         </div>
//                                     </FG>
//                                 )}

//                                 <div className="ab-divider" />
//                                 <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />

//                                 <div className="ab-meta-card">
//                                     <div className="ab-form-group">
//                                         <label className="ab-fg-label ab-label-icon">
//                                             <BookOpen size={12} /> Module Curriculum Type
//                                         </label>
//                                         <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => setModuleType(e.target.value as any)}>
//                                             <option value="knowledge">Knowledge Module (Standard Questions)</option>
//                                             <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
//                                             <option value="workplace">Workplace Experience Module (Logbooks)</option>
//                                         </select>
//                                         <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
//                                     </div>
//                                     <div className="ab-form-group">
//                                         <label className="ab-fg-label">Assessment Type Category</label>
//                                         <select className="ab-input" value={type} onChange={(e) => setType(e.target.value as any)}>
//                                             <option value="formative">Formative Assessment</option>
//                                             <option value="summative">Summative Assessment</option>
//                                             <option value="Practical Observation">Practical Observation</option>
//                                             <option value="Workplace Logbook">Workplace Logbook</option>
//                                         </select>
//                                     </div>
//                                 </div>

//                                 <FG label="Title">
//                                     <input className="ab-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Workbook title…" />
//                                 </FG>

//                                 <div className="ab-meta-grid-inputs">
//                                     <FG label="Time Limit (Mins)">
//                                         <div className="ab-row-gap">
//                                             <Clock size={15} className="ab-input-icon" />
//                                             <input type="number" className="ab-input" placeholder="60" value={moduleInfo.timeLimit || ""} onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })} />
//                                         </div>
//                                         <span className="ab-input-hint">0 = no limit</span>
//                                     </FG>
//                                     <FG label="Scheduling">
//                                         <label className="ab-check-row">
//                                             <input type="checkbox" checked={isScheduled} onChange={(e) => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(""); }} className="ab-checkbox" />
//                                             <span className="ab-check-label">Schedule date/time</span>
//                                         </label>
//                                         {isScheduled ? (
//                                             <div className="ab-row-gap">
//                                                 <Calendar size={15} className="ab-input-icon" />
//                                                 <input type="datetime-local" className="ab-input" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
//                                             </div>
//                                         ) : (
//                                             <span className="ab-input-hint ab-indent">Available anytime after publishing.</span>
//                                         )}
//                                     </FG>
//                                 </div>

//                                 {/* Open Book Reference Manual */}
//                                 <div className="ab-openbook-card">
//                                     <label className="ab-check-row">
//                                         <input type="checkbox" checked={isOpenBook} onChange={(e) => { setIsOpenBook(e.target.checked); if (!e.target.checked) setReferenceManualUrl(""); }} className="ab-checkbox" />
//                                         <span className="ab-check-label ab-check-label--sky">Enable Open Book Reference Manual</span>
//                                     </label>
//                                     {isOpenBook && (
//                                         <div className="ab-openbook-body">
//                                             {referenceManualUrl ? (
//                                                 <div className="ab-manual-linked">
//                                                     <span className="ab-manual-linked__name"><FileArchive size={13} /> Manual Linked</span>
//                                                     <button onClick={() => setReferenceManualUrl("")} className="ab-manual-linked__remove"><Trash2 size={13} /></button>
//                                                 </div>
//                                             ) : (
//                                                 <>
//                                                     <p className="ab-input-hint">Upload a PDF learners can view inside the assessment player.</p>
//                                                     <label className={`ab-btn ab-btn-primary ab-btn-upload ${isUploadingManual ? "ab-btn--disabled" : ""}`}>
//                                                         {isUploadingManual ? "Uploading…" : <><UploadCloud size={13} /> Select PDF Manual</>}
//                                                         <input type="file" accept="application/pdf" hidden disabled={isUploadingManual} onChange={handleManualUpload} />
//                                                     </label>
//                                                 </>
//                                             )}
//                                         </div>
//                                     )}
//                                 </div>

//                                 {/* Cohort Assignment */}
//                                 <div className="ab-fg">
//                                     <div className="ab-fg-header">
//                                         <label className="ab-fg-label">Assign to Cohorts</label>
//                                         <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
//                                     </div>
//                                     <div className="ab-cohort-panel">
//                                         {cohorts.map((c) => (
//                                             <label key={c.id} className="ab-cohort-row">
//                                                 <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={(e) => { if (e.target.checked) setCohortIds((p) => [...p, c.id]); else setCohortIds((p) => p.filter((id) => id !== c.id)); }} className="ab-checkbox" />
//                                                 <span className="ab-cohort-row__name">{c.name}</span>
//                                                 <Tooltip content="View Class Register" placement="left">
//                                                     <ExternalLink size={11} className="ab-cohort-row__link" onClick={(e) => { e.preventDefault(); navigate(`/cohorts/${c.id}`); }} />
//                                                 </Tooltip>
//                                             </label>
//                                         ))}
//                                         {cohorts.length === 0 && <span className="ab-empty-hint">No active classes available.</span>}
//                                     </div>
//                                 </div>

//                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
//                                 <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Add instructions for learners…" />
//                             </>
//                         )}

//                         {/* ── MODULE PANEL ── */}
//                         {activePanel === "module" && (
//                             <>
//                                 <div className="ab-row-space">
//                                     <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
//                                     <Tooltip content={showModuleHeader ? "Hide" : "Show"} placement="left">
//                                         <button className={`ab-toggle-icon ${!showModuleHeader ? "off" : ""}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
//                                             {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
//                                         </button>
//                                     </Tooltip>
//                                 </div>
//                                 {showModuleHeader ? (
//                                     <div className="animate-fade-in">
//                                         <div className="ab-row-end">
//                                             <Tooltip content="Clear all fields" placement="left">
//                                                 <button className="ab-text-btn danger" onClick={resetModuleInfo}>
//                                                     <RotateCcw size={12} /> Clear
//                                                 </button>
//                                             </Tooltip>
//                                         </div>
//                                         <FG label="Qualification Title"><input className="ab-input" value={moduleInfo.qualificationTitle} onChange={(e) => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} /></FG>
//                                         <FG label="Module Number"><input className="ab-input" value={moduleInfo.moduleNumber} onChange={(e) => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} /></FG>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={(e) => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
//                                             <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={(e) => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
//                                         </div>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={(e) => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
//                                             <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={(e) => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
//                                         </div>
//                                         <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={(e) => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
//                                     </div>
//                                 ) : (
//                                     <div className="ab-hidden-state"><EyeOff size={22} /><p>Header hidden from canvas.</p></div>
//                                 )}
//                             </>
//                         )}

//                         {/* ── TOPICS PANEL ── */}
//                         {activePanel === "topics" && (
//                             <TopicsPanel
//                                 topics={topics} coveredTopicIds={coveredTopicIds} editingTopicId={editingTopicId} editDraft={editDraft} addingTopic={addingTopic} newTopic={newTopic} deleteConfirmId={deleteConfirmId} isDeployed={isDeployed}
//                                 onStartEdit={startEdit} onEditChange={(p) => setEditDraft((d) => ({ ...d, ...p }))} onCommitEdit={commitEdit} onCancelEdit={cancelEdit} onConfirmDelete={confirmDelete} onExecuteDelete={executeDelete} onCancelDelete={cancelDelete}
//                                 onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }} onNewTopicChange={(p) => setNewTopic((d) => ({ ...d, ...p }))} onCommitAdd={commitAdd} onCancelAdd={cancelAdd}
//                                 onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel("outline"); }}
//                             />
//                         )}

//                         {/* ── GUIDE PANEL ── */}
//                         {activePanel === "guide" && (
//                             <>
//                                 <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
//                                 <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={(e) => setLearnerNote(e.target.value)} /></FG>
//                                 <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={(e) => setModulePurpose(e.target.value)} /></FG>
//                                 <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={(e) => setEntryRequirements(e.target.value)} /></FG>
//                                 <FG label="Stakeholder Guidelines">
//                                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                                         <ReactQuill theme="snow" value={stakeholderGuidelines} onChange={setStakeholderGuidelines} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Instructions to Mentor, Employer responsibilities…" />
//                                     </div>
//                                 </FG>
//                                 <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={(e) => setExemptions(e.target.value)} /></FG>
//                             </>
//                         )}

//                         {/* ── OUTLINE PANEL ── */}
//                         {activePanel === "outline" && (
//                             <>
//                                 <SectionHdr icon={<Eye size={13} />} label="Outline" />
//                                 {blocks.length === 0 ? <p className="ab-prose sm">No blocks yet.</p> : (
//                                     <ol className="ab-outline-list">
//                                         {blocks.map((b, i) => (
//                                             <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? "focused" : ""}`} onClick={() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
//                                                 <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
//                                                 <div className="ab-ol-text">
//                                                     <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.slice(0, 40) || b.title || `Question ${i + 1}`}</span>
//                                                 </div>
//                                             </li>
//                                         ))}
//                                     </ol>
//                                 )}
//                             </>
//                         )}
//                     </div>
//                 </aside>

//                 {/* ── CANVAS ── */}
//                 <main className="ab-canvas">
//                     {!isDeployed && (
//                         <div className="ab-floating-toolbar">
//                             <span className="ab-toolbar-label ab-hide-mobile">Add:</span>
//                             <Tooltip content="Section Title" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("section")}><Type size={15} /></button></Tooltip>
//                             <Tooltip content="Reading Material" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("info")}><Info size={15} /></button></Tooltip>
//                             <div className="ab-toolbar-divider" />
//                             <Tooltip content="MCQ" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("mcq")}><CheckSquare size={15} /></button></Tooltip>
//                             <Tooltip content="Written Question" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("text")}><AlignLeft size={15} /></button></Tooltip>
//                             <div className="ab-toolbar-divider" />
//                             <Tooltip content="File Upload" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("upload")}><UploadCloud size={15} /></button></Tooltip>
//                             <Tooltip content="Audio Recording" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("audio")}><Mic size={15} /></button></Tooltip>
//                             <Tooltip content="Code Submission" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("code")}><Code size={15} /></button></Tooltip>
//                             <Tooltip content="Multi-Modal Task" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("task")}><Layers size={15} /></button></Tooltip>
//                             <div className="ab-toolbar-divider" />
//                             <Tooltip content="Observation Checklist" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("checklist")}><ListChecks size={15} /></button></Tooltip>
//                             <Tooltip content="Basic Logbook" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("logbook")}><CalendarRange size={15} /></button></Tooltip>
//                             <Tooltip content="QCTO Workplace Checkpoint" placement="top"><button className="ab-tool-btn ab-tool-btn--qcto" onClick={() => addBlock("qcto_workplace")}><Briefcase size={15} /></button></Tooltip>
//                         </div>
//                     )}

//                     <div className="ab-canvas-inner">
//                         {isDeployed && (
//                             <div className="ab-deployed-banner">
//                                 <AlertTriangle size={20} />
//                                 <div><strong>Strict Mode — Assessment Deployed.</strong> Structural changes are locked to protect learner data. You may edit text only.</div>
//                             </div>
//                         )}

//                         {showModuleHeader && (
//                             <div className="ab-module-card clickable" onClick={() => setActivePanel("module")}>
//                                 <div className="ab-mc-left">
//                                     <div className="ab-mc-badges">
//                                         <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
//                                         <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
//                                         <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
//                                         {moduleInfo.timeLimit ? (
//                                             <span className="ab-mc-b ab-mc-b--timer"><Clock size={11} /> {moduleInfo.timeLimit}m</span>
//                                         ) : null}
//                                         <span className={`ab-mc-b type-${type}`}>{type}</span>
//                                     </div>
//                                     <h1 className="ab-mc-title">{title || "Untitled Workbook"}</h1>
//                                     <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
//                                 </div>
//                                 <div className="ab-mc-right">
//                                     <div className="ab-mc-stat"><span className="ab-mc-val">{qCount}</span><span className="ab-mc-lbl">Qs</span></div>
//                                     <div className="ab-mc-div" />
//                                     <div className="ab-mc-stat"><span className="ab-mc-val">{totalMarks}</span><span className="ab-mc-lbl">Marks</span></div>
//                                 </div>
//                                 <div className="ab-mc-edit-hint"><Pencil size={11} /> Edit</div>
//                             </div>
//                         )}

//                         {blocks.length === 0 ? (
//                             <EmptyCanvas onAdd={addBlock} />
//                         ) : (
//                             <div className="ab-blocks-list">
//                                 {blocks.map((b, idx) => (
//                                     <BlockCard
//                                         key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} onFocus={() => setFocusedBlock(b.id)} isDeployed={isDeployed}
//                                         onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
//                                     />
//                                 ))}
//                             </div>
//                         )}
//                     </div>
//                 </main>
//             </div>

//             {deleteConfirmId && (
//                 <DeleteOverlay topic={topics.find((t) => t.id === deleteConfirmId)!} linkedCount={blocks.filter((b) => b.linkedTopicId === deleteConfirmId).length} onConfirm={executeDelete} onCancel={cancelDelete} />
//             )}
//             {showProgrammeModal && (
//                 <ProgrammeFormModal existingProgrammes={programmes} onClose={() => setShowProgrammeModal(false)} onSave={handleSaveNewProgramme} title="Create Curriculum Blueprint" />
//             )}
//             {showCohortModal && (
//                 <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleSaveNewCohort} />
//             )}
//         </div>
//     );
// };

// // ─── TOPICS PANEL ─────────────────────────────────────────────────────────────
// interface TopicsPanelProps {
//     topics: Topic[];
//     coveredTopicIds: Set<string>;
//     editingTopicId: string | null;
//     editDraft: Partial<Topic>;
//     addingTopic: boolean;
//     newTopic: Partial<Topic>;
//     deleteConfirmId: string | null;
//     isDeployed: boolean;
//     onStartEdit: (t: Topic) => void;
//     onEditChange: (p: Partial<Topic>) => void;
//     onCommitEdit: () => void;
//     onCancelEdit: () => void;
//     onConfirmDelete: (id: string) => void;
//     onExecuteDelete: () => void;
//     onCancelDelete: () => void;
//     onStartAdd: () => void;
//     onNewTopicChange: (p: Partial<Topic>) => void;
//     onCommitAdd: () => void;
//     onCancelAdd: () => void;
//     onAddBlock: (bt: BlockType | string, tid?: string) => void;
// }

// const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
//     <>
//         <div className="ab-row-space">
//             <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
//             {!props.addingTopic && !props.isDeployed && (
//                 <Tooltip content="Add topic" placement="left">
//                     <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}><Plus size={14} /></button>
//                 </Tooltip>
//             )}
//         </div>
//         {props.addingTopic && !props.isDeployed && (
//             <div className="ab-topic-form">
//                 <div className="ab-topic-form-row">
//                     <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ""} onChange={(e) => props.onNewTopicChange({ code: e.target.value })} />
//                     <input className="ab-input sm ab-w-60" placeholder="Weight %" value={props.newTopic.weight || ""} onChange={(e) => props.onNewTopicChange({ weight: e.target.value })} />
//                 </div>
//                 <textarea className="ab-input sm" rows={2} placeholder="Description…" value={props.newTopic.title || ""} onChange={(e) => props.onNewTopicChange({ title: e.target.value })} />
//                 <div className="ab-row-end ab-row-gap-sm">
//                     <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
//                     <button className="ab-btn ab-btn-primary ab-btn-sm" onClick={props.onCommitAdd}>Add</button>
//                 </div>
//             </div>
//         )}
//         <div className="ab-topics-list">
//             {props.topics.length === 0 && <p className="ab-prose sm ab-italic ab-muted">No topics. Select a module in Settings.</p>}
//             {props.topics.map((t: Topic) => {
//                 const covered = props.coveredTopicIds.has(t.id);
//                 const isEditing = props.editingTopicId === t.id;
//                 if (isEditing) return (
//                     <div key={t.id} className="ab-topic-row editing">
//                         <div className="ab-topic-edit-fields">
//                             <input className="ab-topic-edit-input" value={props.editDraft.code || ""} onChange={(e) => props.onEditChange({ code: e.target.value })} placeholder="Code" />
//                             <input className="ab-topic-edit-input" value={props.editDraft.title || ""} onChange={(e) => props.onEditChange({ title: e.target.value })} placeholder="Title" />
//                         </div>
//                         <div className="ab-topic-edit-actions">
//                             <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={13} /></button>
//                             <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={13} /></button>
//                         </div>
//                     </div>
//                 );
//                 return (
//                     <div key={t.id} className={`ab-topic-row ${covered ? "covered" : ""}`}>
//                         <div className="ab-topic-main">
//                             <div className="ab-topic-top-row">
//                                 <span className="ab-topic-code">{t.code}</span>
//                                 <span className="ab-topic-weight">{t.weight}%</span>
//                             </div>
//                             <span className="ab-topic-title">{t.title}</span>
//                         </div>
//                         <div className="ab-topic-actions">
//                             {!props.isDeployed && (
//                                 <>
//                                     <Tooltip content="+Question" placement="top"><button className="ab-tadd-btn" onClick={() => props.onAddBlock("text", t.id)}>+Q</button></Tooltip>
//                                     <Tooltip content="+Reading" placement="top"><button className="ab-tadd-btn reading" onClick={() => props.onAddBlock("info", t.id)}>+R</button></Tooltip>
//                                     <Tooltip content="Delete" placement="top"><button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button></Tooltip>
//                                 </>
//                             )}
//                             <Tooltip content="Edit" placement="top"><button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button></Tooltip>
//                         </div>
//                     </div>
//                 );
//             })}
//         </div>
//     </>
// );

// // ─── BLOCK CARD ───────────────────────────────────────────────────────────────
// interface BlockCardProps {
//     block: AssessmentBlock;
//     index: number;
//     total: number;
//     focused: boolean;
//     isDeployed: boolean;
//     topics: Topic[];
//     onFocus: () => void;
//     onUpdate: (id: string, field: keyof AssessmentBlock, val: any) => void;
//     onUpdateOption: (bid: string, idx: number, val: string) => void;
//     onRemove: (id: string) => void;
//     onMove: (id: string, dir: "up" | "down") => void;
// }

// const BlockCard: React.FC<BlockCardProps> = ({
//     block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
// }) => {
//     const meta = BLOCK_META[block.type];
//     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

//     const updateCriterion = (i: number, v: string) => { const c = [...(block.criteria || [])]; c[i] = v; onUpdate(block.id, "criteria", c); };
//     const removeCriterion = (i: number) => onUpdate(block.id, "criteria", (block.criteria || []).filter((_, idx) => idx !== i));
//     const addCriterion = () => onUpdate(block.id, "criteria", [...(block.criteria || []), ""]);

//     const updateWA = (wi: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], [f]: v }; onUpdate(block.id, "workActivities", l); };
//     const removeWA = (wi: number) => onUpdate(block.id, "workActivities", (block.workActivities || []).filter((_, i) => i !== wi));
//     const addWA = () => onUpdate(block.id, "workActivities", [...(block.workActivities || []), { id: mkId(), code: "", description: "", evidenceItems: [] }]);
//     const updateSE = (wi: number, si: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; const s = [...(l[wi].evidenceItems || [])]; s[si] = { ...s[si], [f]: v }; l[wi] = { ...l[wi], evidenceItems: s }; onUpdate(block.id, "workActivities", l); };
//     const removeSE = (wi: number, si: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: (l[wi].evidenceItems || []).filter((_, i) => i !== si) }; onUpdate(block.id, "workActivities", l); };
//     const addSE = (wi: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: [...(l[wi].evidenceItems || []), { id: mkId(), code: "", description: "" }] }; onUpdate(block.id, "workActivities", l); };

//     return (
//         <div id={`block-${block.id}`} className={`ab-block ${focused ? "is-focused" : ""} ${isDeployed ? "is-locked" : ""}`} style={{ "--block-accent": meta.color } as React.CSSProperties} onClick={onFocus}>
//             <div className="ab-block-strip" style={{ background: meta.color }} />
//             <div className="ab-block-ctrl-row">
//                 <div className="ab-block-left">
//                     <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
//                     {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
//                     {isDeployed && <span className="ab-locked-icon" title="Structure Locked"><Lock size={11} /></span>}
//                 </div>
//                 {!isDeployed && (
//                     <div className="ab-block-actions">
//                         <Tooltip content="Move up" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "up"); }} disabled={index === 0}>↑</button></Tooltip>
//                         <Tooltip content="Move down" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "down"); }} disabled={index === total - 1}>↓</button></Tooltip>
//                         <Tooltip content="Delete block" placement="top"><button className="ab-ctrl-btn ab-ctrl-del" onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button></Tooltip>
//                     </div>
//                 )}
//             </div>

//             {/* SECTION */}
//             {block.type === "section" && (
//                 <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
//                     <div className="ab-form-group">
//                         <label className="ab-field-lbl">Section Outline Label</label>
//                         <input className="ab-input" value={block.title || ""} placeholder="e.g. SECTION B – PM-01-PS02" onChange={(e) => onUpdate(block.id, "title", e.target.value)} disabled={isDeployed} />
//                     </div>
//                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                         <label className="ab-field-lbl">Section Content / Criteria Details</label>
//                         <ReactQuill theme="snow" value={block.content || ""} onChange={(v) => onUpdate(block.id, "content", v)} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Section content or assessment criteria…" />
//                     </div>
//                 </div>
//             )}

//             {/* INFO */}
//             {block.type === "info" && (
//                 <div className="ab-info-body">
//                     <textarea className="ab-textarea-block" rows={5} value={block.content || ""} onChange={(e) => onUpdate(block.id, "content", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Enter reading material…" />
//                 </div>
//             )}

//             {/* WRITTEN / MCQ / TASK */}
//             {["text", "mcq", "task"].includes(block.type) && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={block.type === "task" ? { background: "rgba(139,92,246,.18)", color: "#a78bfa" } : undefined}>Q{index + 1}</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>
//                     <textarea className="ab-q-input" rows={2} value={block.question || ""} onChange={(e) => onUpdate(block.id, "question", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type question here…"} />

//                     {block.type === "text" && (
//                         <div className="ab-answer-placeholder"><FileText size={13} /><span>Learner types answer here</span></div>
//                     )}

//                     {block.type === "mcq" && (
//                         <div className="ab-mcq-opts">
//                             {block.options?.map((opt, i) => (
//                                 <div key={i} className={`ab-opt-row ${block.correctOption === i ? "correct" : ""}`} onClick={(e) => { if (isDeployed) return; e.stopPropagation(); onUpdate(block.id, "correctOption", i); }}>
//                                     <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
//                                     <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
//                                     <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={(e) => e.stopPropagation()} />
//                                     {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
//                                 </div>
//                             ))}
//                         </div>
//                     )}

//                     {block.type === "task" && (
//                         <div className="ab-evidence-card" onClick={(e) => e.stopPropagation()}>
//                             <span className="ab-evidence-card-title">Allowed Evidence Types</span>
//                             <div className="ab-evidence-grid">
//                                 {[
//                                     { key: "allowText", icon: <AlignLeft size={14} />, label: "Rich Text" },
//                                     { key: "allowAudio", icon: <Mic size={14} />, label: "Audio" },
//                                     { key: "allowUrl", icon: <LinkIcon size={14} />, label: "URL/Link" },
//                                     { key: "allowUpload", icon: <UploadCloud size={14} />, label: "File Upload" },
//                                     { key: "allowCode", icon: <Code size={14} />, label: "Code Editor" },
//                                 ].map(({ key, icon, label }) => (
//                                     <label key={key} className={`ab-evidence-row ${isDeployed ? "ab-disabled" : ""}`}>
//                                         <input type="checkbox" checked={(block as any)[key]} disabled={isDeployed} onChange={(e) => onUpdate(block.id, key as keyof AssessmentBlock, e.target.checked)} className="ab-checkbox" />
//                                         {icon}<span>{label}</span>
//                                     </label>
//                                 ))}
//                             </div>
//                             {(block.allowUpload || block.allowCode) && (
//                                 <div className="ab-evidence-sub">
//                                     {block.allowUpload && (
//                                         <div className="ab-form-group ab-flex-1">
//                                             <label className="ab-field-lbl">File Type Restriction</label>
//                                             <select className="ab-input" value={block.allowedFileTypes || "all"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "allowedFileTypes", e.target.value)}>
//                                                 <option value="all">Any File</option>
//                                                 <option value="presentation">Presentations (.pptx, .pdf)</option>
//                                                 <option value="video">Video (.mp4, .mov)</option>
//                                                 <option value="image">Images (.png, .jpg)</option>
//                                             </select>
//                                         </div>
//                                     )}
//                                     {block.allowCode && (
//                                         <div className="ab-form-group ab-flex-1">
//                                             <label className="ab-field-lbl">Syntax Highlighting</label>
//                                             <select className="ab-input" value={block.codeLanguage || "javascript"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "codeLanguage", e.target.value)}>
//                                                 <option value="javascript">JavaScript / TypeScript</option>
//                                                 <option value="python">Python</option>
//                                                 <option value="html">HTML / CSS</option>
//                                                 <option value="sql">SQL</option>
//                                                 <option value="other">Other</option>
//                                             </select>
//                                         </div>
//                                     )}
//                                 </div>
//                             )}
//                         </div>
//                     )}
//                 </div>
//             )}

//             {/* CHECKLIST */}
//             {block.type === "checklist" && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: "rgba(20,184,166,.18)", color: "#2dd4bf" }}>CHK</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>

//                     <div className="ab-form-group" onClick={(e) => e.stopPropagation()}>
//                         <label className="ab-field-lbl">Practical Task Outcome / Instruction</label>
//                         <input type="text" className="ab-input" value={block.title || ""} onChange={(e) => onUpdate(block.id, "title", e.target.value)} placeholder="e.g. PA0101 Demonstrate the use of…" />
//                     </div>

//                     <div className="ab-checklist-toggles" onClick={(e) => e.stopPropagation()}>
//                         <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
//                             <input type="checkbox" disabled={isDeployed} checked={block.requirePerCriterionTiming !== false} onChange={(e) => onUpdate(block.id, "requirePerCriterionTiming", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
//                             Require Timers per task
//                         </label>
//                         <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
//                             <input type="checkbox" disabled={isDeployed} checked={block.requireEvidencePerCriterion !== false} onChange={(e) => onUpdate(block.id, "requireEvidencePerCriterion", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
//                             Require Evidence per task
//                         </label>
//                     </div>

//                     <div className="ab-criteria-body" onClick={(e) => e.stopPropagation()}>
//                         <span className="ab-criteria-body-title">Evaluation Criteria to Observe:</span>
//                         {block.criteria?.map((criterion, i) => (
//                             <div key={i} className="ab-criterion-item">
//                                 <div className="ab-criterion-header">
//                                     <span className="ab-criterion-num">{i + 1}</span>
//                                     <input type="text" className="ab-input ab-input--bold" value={criterion} disabled={isDeployed} onChange={(e) => updateCriterion(i, e.target.value)} placeholder="e.g. Open files and folders" />
//                                     {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeCriterion(i)}><X size={15} /></button>}
//                                 </div>
//                                 <div className="ab-criterion-preview-stack">
//                                     {block.requireEvidencePerCriterion !== false && (
//                                         <div className="ab-criterion-preview">
//                                             <UploadCloud size={13} />
//                                             <em>Learner uploads evidence here…</em>
//                                         </div>
//                                     )}
//                                     {block.requirePerCriterionTiming !== false && (
//                                         <div className="ab-criterion-timer">
//                                             <Timer size={13} />
//                                             <span className="ab-criterion-timer-label">Task Timer:</span>
//                                             <span className="ab-btn ab-btn-sm" style={{ background: "rgba(59,130,246,.35)", color: "#93c5fd", border: "none", cursor: "default", padding: "2px 8px", borderRadius: "4px", fontSize: "0.68rem" }}>Start</span>
//                                             <span className="ab-criterion-timer-clock">00:00:00</span>
//                                         </div>
//                                     )}
//                                     <div className="ab-criterion-radios">
//                                         <span className="ab-crit-competent"><input type="radio" disabled /> C — Competent</span>
//                                         <span className="ab-crit-nyc"><input type="radio" disabled /> NYC</span>
//                                         <input type="text" className="ab-input ab-input-ghost" disabled placeholder="Assessor comments…" />
//                                     </div>
//                                 </div>
//                             </div>
//                         ))}
//                         {!isDeployed && <button className="ab-btn-text" onClick={addCriterion}><Plus size={13} /> Add Criterion</button>}

//                         <div className="ab-signoff-preview">
//                             <span className="ab-signoff-title">Global Assessor / Mentor Sign-off Preview</span>
//                             <div className="ab-signoff-grid">
//                                 <input type="text" className="ab-input" disabled placeholder="Date…" />
//                                 <input type="text" className="ab-input" disabled placeholder="Time Started…" />
//                                 <input type="text" className="ab-input" disabled placeholder="Time Completed…" />
//                             </div>
//                             <textarea className="ab-input" rows={2} disabled placeholder="General Comments of Observer…" />
//                             <label className="ab-signoff-declaration">
//                                 <input type="checkbox" disabled checked className="ab-checkbox" />
//                                 I declare that I have observed the learner performing these tasks.
//                             </label>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* LOGBOOK */}
//             {block.type === "logbook" && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: "rgba(249,115,22,.18)", color: "#fb923c" }}>LOG</span>
//                     </div>
//                     <div className="ab-logbook-card">
//                         <div className="ab-logbook-title"><CalendarRange size={17} /> Standard Logbook Table Inserted</div>
//                         <p className="ab-logbook-body">Learners will log Date, Assignment Task, Start / Finish Times, and Total Hours. No further configuration needed.</p>
//                     </div>
//                 </div>
//             )}

//             {/* QCTO WORKPLACE CHECKPOINT */}
//             {block.type === "qcto_workplace" && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: "rgba(225,29,72,.18)", color: "#fb7185" }}>QCTO</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                     </div>
//                     <div className="ab-qcto-card" onClick={(e) => e.stopPropagation()}>
//                         <div className="ab-form-group">
//                             <label className="ab-qcto-label">WE Module Code</label>
//                             <input type="text" className="ab-input ab-qcto-input" value={block.weCode || ""} onChange={(e) => onUpdate(block.id, "weCode", e.target.value)} disabled={isDeployed} placeholder="e.g. WM-01-WE01" />
//                         </div>
//                         <div className="ab-form-group">
//                             <label className="ab-qcto-label">Work Experience Title</label>
//                             <input type="text" className="ab-input ab-qcto-input" value={block.weTitle || ""} onChange={(e) => onUpdate(block.id, "weTitle", e.target.value)} disabled={isDeployed} placeholder="e.g. Attend induction program…" />
//                         </div>
//                         <div className="ab-qcto-activities">
//                             <span className="ab-qcto-activities-title">Workplace Activities (WA) & Evidence Links</span>
//                             {(block.workActivities || []).map((wa, wi) => (
//                                 <div key={wa.id} className="ab-wa-row">
//                                     <div className="ab-wa-inputs">
//                                         <input type="text" className="ab-input ab-w-80" value={wa.code} onChange={(e) => updateWA(wi, "code", e.target.value)} disabled={isDeployed} placeholder="WA0101" />
//                                         <input type="text" className="ab-input ab-flex-1" value={wa.description} onChange={(e) => updateWA(wi, "description", e.target.value)} disabled={isDeployed} placeholder="Activity description…" />
//                                         {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeWA(wi)}><X size={15} /></button>}
//                                     </div>
//                                     <div className="ab-se-list">
//                                         <span className="ab-se-title">Required Supporting Evidence (SE)</span>
//                                         {(wa.evidenceItems || []).map((se, si) => (
//                                             <div key={se.id} className="ab-se-row">
//                                                 <input type="text" className="ab-input sm ab-w-70" value={se.code} onChange={(e) => updateSE(wi, si, "code", e.target.value)} disabled={isDeployed} placeholder="SE0101" />
//                                                 <input type="text" className="ab-input sm ab-flex-1" value={se.description} onChange={(e) => updateSE(wi, si, "description", e.target.value)} disabled={isDeployed} placeholder="Describe expected evidence…" />
//                                                 {!isDeployed && <button className="ab-btn-icon-danger ab-btn-icon-sm" onClick={() => removeSE(wi, si)}><Trash2 size={11} /></button>}
//                                             </div>
//                                         ))}
//                                         {!isDeployed && <button className="ab-btn-text ab-btn-text--sm ab-btn-text--rose" onClick={() => addSE(wi)}><Plus size={11} /> Add Evidence</button>}
//                                     </div>
//                                 </div>
//                             ))}
//                             {!isDeployed && <button className="ab-btn-text ab-btn-text--rose" onClick={addWA}><Plus size={13} /> Add Workplace Activity</button>}
//                         </div>
//                         <div className="ab-qcto-toggles">
//                             <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
//                                 <input type="checkbox" disabled={isDeployed} checked={block.requireSelfAssessment !== false} onChange={(e) => onUpdate(block.id, "requireSelfAssessment", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
//                                 Require Self-Assessment
//                             </label>
//                             <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
//                                 <input type="checkbox" disabled={isDeployed} checked={block.requireGoalPlanning !== false} onChange={(e) => onUpdate(block.id, "requireGoalPlanning", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
//                                 Require Goal Planning
//                             </label>
//                         </div>
//                         <p className="ab-qcto-footnote">* Learners will see a QCTO Checkpoint form mapping their uploads to WA and SE codes, alongside mentor sign-off.</p>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// // ─── OVERLAYS & UTILITY COMPONENTS ───────────────────────────────────────────
// const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void; }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
//     <div className="ab-overlay-backdrop" onClick={onCancel}>
//         <div className="ab-delete-dialog" onClick={(e) => e.stopPropagation()}>
//             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
//             <h3 className="ab-dd-title">Delete Topic?</h3>
//             <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
//             {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
//             <div className="ab-dd-actions">
//                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
//                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={13} /> Delete</button>
//             </div>
//         </div>
//     </div>
// );

// const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
//     <div className="ab-section-hdr">{icon}<span>{label}</span></div>
// );

// const FG: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties; }> = ({ label, children, style }) => (
//     <div className="ab-fg" style={style}>
//         {label && <label className="ab-fg-label">{label}</label>}
//         {children}
//     </div>
// );

// const EmptyCanvas: React.FC<{ onAdd: (t: string) => void }> = ({ onAdd }) => (
//     <div className="ab-empty-canvas">
//         <div className="ab-empty-inner">
//             <div className="ab-empty-icon"><BookOpen size={28} /></div>
//             <h2 className="ab-empty-title">Drafting Surface</h2>
//             <p className="ab-empty-sub">Choose a block type to begin building</p>
//             <div className="ab-empty-grid">
//                 {(Object.keys(BLOCK_META) as BlockType[]).map((bt) => (
//                     <button key={bt} className="ab-empty-card" style={{ "--block-color": BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
//                         <span className="ab-empty-icon-bt">{BLOCK_META[bt].icon}</span>
//                         <span className="ab-empty-lbl">{BLOCK_META[bt].label}</span>
//                         <span className="ab-empty-desc">{BLOCK_META[bt].desc}</span>
//                     </button>
//                 ))}
//             </div>
//         </div>
//     </div>
// );

// export default AssessmentBuilder;

