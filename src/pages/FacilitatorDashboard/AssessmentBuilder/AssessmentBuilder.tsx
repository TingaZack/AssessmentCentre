// src/components/views/AssessmentBuilder/AssessmentBuilder.tsx

import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import {
    collection, doc, setDoc, writeBatch, query, where, getDocs, onSnapshot
} from "firebase/firestore";
import {
    getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
} from "firebase/storage";
import { getFunctions, httpsCallable } from "firebase/functions";
import { db } from "../../../lib/firebase";
import { useStore, type StaffMember } from "../../../store/useStore";
import {
    ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
    FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
    BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
    Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
    Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive, ShieldAlert, Image as ImageIcon,
    Users, Activity, Mail, Copy, CheckSquare as CheckSquareIcon, Square, Github, FolderArchive, Loader2
} from "lucide-react";
import Tooltip from "../../../components/common/Tooltip/Tooltip";
import type { Cohort, ProgrammeTemplate, StackBlitzTemplate } from "../../../types";
import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import "./AssessmentBuilder.css";
import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";
import { StatusModal } from "../../../components/common/StatusModal/StatusModal";
import { createPortal } from "react-dom";
import JSZip from "jszip";

const quillModules = {
    toolbar: [
        ["bold", "italic", "underline", "code-block"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["clean"],
    ],
};
const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace" | "code_sandbox";

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
    imageUrl?: string;
    imageCaption?: string;

    // Code Sandbox Properties ---
    template?: "create-react-app" | "vite-react" | "node" | "javascript" | "typescript" | "html" | "python" | "sql";
    initialFiles?: Record<string, string>;
    dependencies?: Record<string, string>;
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

export interface CodeSandboxConfig {
    template: StackBlitzTemplate;
    initialFiles: Record<string, string>;
    dependencies?: Record<string, string>;
}

export interface CodeSandboxBlock {
    id: string;
    type: 'code_sandbox';
    title: string;
    instructions?: string;
    marks: number;
    config: CodeSandboxConfig;
}

export interface CodeSandboxAnswer {
    snapshot: Record<string, string>;
    lastSavedAt: string;
}

type AssessmentStatusType = "draft" | "upcoming" | "scheduled" | "active" | "completed";

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
    code_sandbox: { label: "Code Sandbox", color: "#3b82f6", icon: <Code size={14} />, desc: "Live embedded IDE for coding assessments" },
};

// 🚀 RE-ENGINEERED: Boilerplates designed specifically for Sandpack (React) and Piston (Python/Node/SQL)
const CODESANDBOX_BOILERPLATES: Record<string, { files: Record<string, string>; dependencies: Record<string, string> }> = {
    javascript: {
        files: { "/index.js": "// Pure JavaScript Environment\nconsole.log('Vanilla JS workspace ready.');\n" },
        dependencies: {}
    },
    typescript: {
        files: { "/index.ts": "// TypeScript Environment\nconst msg: string = 'TS ready!';\nconsole.log(msg);\n" },
        dependencies: {}
    },
    html: {
        files: {
            "/index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <link rel=\"stylesheet\" href=\"styles.css\">\n</head>\n<body>\n  <div id=\"app\">\n    <h1>HTML/JS Sandbox</h1>\n    <p>Edit these files to see the live preview update.</p>\n  </div>\n  <script src=\"index.js\"></script>\n</body>\n</html>",
            "/index.js": "console.log('DOM Sandbox ready.');\n",
            "/styles.css": "body {\n  font-family: sans-serif;\n  background: #0f172a;\n  color: #f8fafc;\n  padding: 2rem;\n}"
        },
        dependencies: {}
    },
    "create-react-app": {
        files: {
            "/App.js": "export default function App() {\n  return (\n    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>\n      <h1>React Blueprint Working!</h1>\n      <p>Start building your UI components here.</p>\n    </div>\n  );\n}\n",
            "/index.js": "import React, { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\nconst root = createRoot(document.getElementById('root'));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n",
            "/styles.css": "body {\n  margin: 0;\n  background: #f8fafc;\n}\n"
        },
        dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" }
    },
    "vite-react": {
        files: {
            "/index.html": "<!DOCTYPE html>\n<html lang=\"en\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <title>Vite App</title>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script type=\"module\" src=\"/src/main.jsx\"></script>\n  </body>\n</html>",
            "/src/App.jsx": "export default function App() {\n  return <h1>Vite + React Canvas Online!</h1>;\n}\n",
            "/src/main.jsx": "import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App.jsx';\n\nReactDOM.createRoot(document.getElementById('root')).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>,\n);\n"
        },
        dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" }
    },
    node: {
        files: {
            "/index.js": "import axios from 'axios';\n\nconsole.log('Node execution engine ready.');\nconsole.log('Fetching dummy data to prove NPM works...');\n\naxios.get('https://jsonplaceholder.typicode.com/todos/1')\n  .then(res => console.log('\\nData received:', res.data));\n"
        },
        dependencies: { "axios": "latest" }
    },
    python: {
        files: {
            "/main.py": "# Python 3 Environment with PyPI Auto-Installer\nimport numpy as np\n\ndef main():\n    print('Python workspace ready!')\n    arr = np.array([1, 2, 3, 4, 5])\n    print('\\nNumpy Array correctly installed and executed:')\n    print(arr)\n\nif __name__ == '__main__':\n    main()\n"
        },
        dependencies: {}
    },
    sql: {
        files: { "/main.sql": "-- SQLite Execution Environment\n\nCREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');\n\n-- Write your queries below:\nSELECT * FROM employees;\n" },
        dependencies: {}
    }
};

export const AssessmentBuilder: React.FC = () => {
    const { assessmentId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const toast = useToast();
    const {
        user, staff, cohorts, learners, programmes,
        fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff
    } = useStore();

    const [loading, setLoading] = useState(false);
    const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
    const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
    const [lastSaved, setLastSaved] = useState<Date | null>(null);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
    const [isLiveSyncing, setIsLiveSyncing] = useState(false);

    const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");
    const [sendNotification, setSendNotification] = useState(true);

    const statusRef = useRef<AssessmentStatusType>("draft");
    useEffect(() => { statusRef.current = assessmentStatus; }, [assessmentStatus]);

    const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
    const [selectedModuleCode, setSelectedModuleCode] = useState("");
    const [showProgrammeModal, setShowProgrammeModal] = useState(false);
    const [showCohortModal, setShowCohortModal] = useState(false);
    const [title, setTitle] = useState("");

    const [cohortIds, setCohortIds] = useState<string[]>([]);
    const [notifiedCohortIds, setNotifiedCohortIds] = useState<string[]>([]);

    const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
    const [instructions, setInstructions] = useState("");
    const [creatorId, setCreatorId] = useState<string | null>(null);
    const [publisherId, setPublisherId] = useState<string | null>(null);
    const [autoCloseTaskId, setAutoCloseTaskId] = useState<string | null>(null);

    const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook" | "Developmental Activity" | "Practice Set" | "Task">("formative");
    const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");

    const [requiresInvigilation, setRequiresInvigilation] = useState(true);
    const [isOpenBook, setIsOpenBook] = useState(false);
    const [referenceManualUrl, setReferenceManualUrl] = useState("");
    const [isUploadingManual, setIsUploadingManual] = useState(false);

    const [releaseState, setReleaseState] = useState<"active" | "upcoming" | "scheduled">("active");
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

    const isDeployed = (assessmentStatus === "active" || assessmentStatus === "completed" || assessmentStatus === "scheduled" || assessmentStatus === "upcoming") && assessmentId !== undefined;
    const isInitialLoad = useRef(true);

    const handleBackNavigation = () => {
        if (window.history.state && window.history.state.idx > 0) {
            navigate(-1);
        } else {
            navigate('/facilitator/assessments', { replace: true });
        }
    };

    const handleClone = () => {
        if (!window.confirm("Duplicate this workbook? You will be redirected to a new, unsaved copy.")) return;

        const cloneData = {
            title: title + " (Copy)",
            type, moduleType, instructions, requiresInvigilation, isOpenBook, referenceManualUrl, showModuleHeader,
            moduleInfo, learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
            selectedProgrammeId, selectedModuleCode, topics, blocks, releaseState
        };

        navigate('/facilitator/assessments/builder', { state: { cloneData } });
    };

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (programmes.length === 0) fetchProgrammes();
        if (staff.length === 0) fetchStaff();

        if (!assessmentId) {
            if (location.state?.cloneData && isInitialLoad.current) {
                const cd = location.state.cloneData;
                setTitle(cd.title);
                setType(cd.type);
                setModuleType(cd.moduleType);
                setInstructions(cd.instructions);
                setRequiresInvigilation(cd.requiresInvigilation);
                setIsOpenBook(cd.isOpenBook);
                setReferenceManualUrl(cd.referenceManualUrl);
                setShowModuleHeader(cd.showModuleHeader);
                setModuleInfo(cd.moduleInfo);
                setLearnerNote(cd.learnerNote);
                setModulePurpose(cd.modulePurpose);
                setEntryRequirements(cd.entryRequirements);
                setProviderRequirements(cd.providerRequirements);
                setExemptions(cd.exemptions);
                setStakeholderGuidelines(cd.stakeholderGuidelines);
                setSelectedProgrammeId(cd.selectedProgrammeId);
                setSelectedModuleCode(cd.selectedModuleCode);
                setReleaseState(cd.releaseState || "active");

                const newTopics = cd.topics.map((t: any) => ({ ...t, id: mkId() }));
                setTopics(newTopics);

                const newBlocks = cd.blocks.map((b: any) => {
                    const newId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                    let newLinkedTopicId = b.linkedTopicId;
                    if (b.linkedTopicId) {
                        const oldTopicIdx = cd.topics.findIndex((t: any) => t.id === b.linkedTopicId);
                        if (oldTopicIdx !== -1) newLinkedTopicId = newTopics[oldTopicIdx].id;
                    }
                    return { ...b, id: newId, linkedTopicId: newLinkedTopicId };
                });
                setBlocks(newBlocks);

                setCreatorId(user?.uid || null);
                setAutoCloseTaskId(null);
                setSaveStatus("unsaved");
                isInitialLoad.current = false;

                window.history.replaceState({}, document.title);
            } else {
                setCreatorId(user?.uid || null);
            }
            return;
        }

        setLoading(true);

        const unsubscribe = onSnapshot(doc(db, "assessments", assessmentId), (snap) => {
            if (snap.exists()) {
                const d = snap.data();

                let formattedDate = "";
                if (d.scheduledDate) {
                    try {
                        const dt = new Date(d.scheduledDate);
                        if (!isNaN(dt.getTime())) {
                            const p = (n: number) => n.toString().padStart(2, "0");
                            formattedDate = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
                        } else {
                            formattedDate = d.scheduledDate;
                        }
                    } catch {
                        formattedDate = d.scheduledDate;
                    }
                }

                if (isInitialLoad.current) {
                    setTitle(d.title || "");
                    setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
                    setNotifiedCohortIds(d.notifiedCohortIds || []);
                    setCollaboratorIds(d.collaboratorIds || []);
                    setCreatorId(d.createdBy || d.facilitatorId || null);
                    setPublisherId(d.publishedBy || null);
                    setAutoCloseTaskId(d.autoCloseTaskId || null);
                    setInstructions(d.instructions || "");
                    setType(d.type || "formative");
                    setModuleType(d.moduleType || "knowledge");
                    setAssessmentStatus(d.status || "draft");
                    setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
                    setIsOpenBook(d.isOpenBook || false);
                    setReferenceManualUrl(d.referenceManualUrl || "");

                    if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
                    else if (d.status === "upcoming") setReleaseState("upcoming");
                    else setReleaseState("active");

                    setScheduledDate(formattedDate);
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

                    isInitialLoad.current = false;
                    setLoading(false);
                } else {
                    if (d.lastUpdatedBy && d.lastUpdatedBy !== user?.uid) {
                        setIsLiveSyncing(true);
                        toast.info("A collaborator updated the workbook. Syncing changes...");

                        setAssessmentStatus(d.status || "draft");
                        setType(d.type || "formative");
                        setModuleType(d.moduleType || "knowledge");
                        setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
                        setIsOpenBook(d.isOpenBook || false);
                        setReferenceManualUrl(d.referenceManualUrl || "");
                        setAutoCloseTaskId(d.autoCloseTaskId || null);

                        if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
                        else if (d.status === "upcoming") setReleaseState("upcoming");
                        else setReleaseState("active");

                        setBlocks(d.blocks || []);
                        if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
                        setTitle(d.title || "");
                        setCollaboratorIds(d.collaboratorIds || []);
                        setNotifiedCohortIds(d.notifiedCohortIds || []);
                        setInstructions(d.instructions || "");
                        setModuleInfo(d.moduleInfo || {});

                        setSaveStatus("saved");
                        setLastSaved(new Date(d.lastUpdated || d.createdAt));

                        setTimeout(() => setIsLiveSyncing(false), 2000);
                    }
                }
            } else {
                toast.error("Assessment not found or was deleted by a collaborator.");
                navigate("/facilitator/assessments");
            }
        }, (err) => {
            console.error("Real-time listener error:", err);
            toast.error("Lost connection to the live workbook.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [assessmentId, user?.uid, location.state]);

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
        if (!assessmentId || isInitialLoad.current) return;
        setSaveStatus("unsaved");

        const t = setTimeout(() => {
            if (saveStatus === "unsaved" && !loading) {
                handleSave(statusRef.current, true);
            }
        }, 15000);

        return () => clearTimeout(t);
    }, [
        title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
        learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
        stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
        scheduledDate, releaseState, isOpenBook, referenceManualUrl, requiresInvigilation,
        collaboratorIds, assessmentStatus
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

    const handleModuleTypeChange = (newType: "knowledge" | "practical" | "workplace") => {
        setModuleType(newType);
        if (newType !== 'knowledge') {
            setRequiresInvigilation(false);
        } else {
            setRequiresInvigilation(true);
        }
    };

    const handleTypeChange = (newType: string) => {
        setType(newType as any);
        if (["Developmental Activity", "Practice Set", "Task"].includes(newType)) {
            setRequiresInvigilation(false);
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

    const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
        try {
            const newRef = doc(collection(db, "programmes"));
            const id = newRef.id;

            await setDoc(
                newRef,
                { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
                { merge: true },
            );

            toast.success("Blueprint created!");
            setShowProgrammeModal(false);
            await fetchProgrammes();
            setSelectedProgrammeId(id);
            setSelectedModuleCode("");
        } catch (err: any) {
            toast.error(`Error saving blueprint: ${err.message}`);
        }
    };

    const toggleSelectAllCohorts = () => {
        if (cohortIds.length === cohorts.length) {
            setCohortIds([]); // Deselect all
        } else {
            setCohortIds(cohorts.map(c => c.id)); // Select all
        }
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
        } else if (actualType === "code_sandbox") {
            nb.title = "Practical Coding Task";
            nb.question = "Follow the instructions and write your solution in the editor below:";
            nb.template = "javascript"; // Default to basic JS environment
            nb.marks = 20;
            nb.initialFiles = CODESANDBOX_BOILERPLATES.javascript.files;
            nb.dependencies = {};
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
        setBlockToRemove(id);
    };

    const executeRemoveBlock = () => {
        if (!blockToRemove) return;
        setBlocks((p) => p.filter((b) => b.id !== blockToRemove));
        setFocusedBlock(null);
        toast.info("Block removed");
        setBlockToRemove(null);
    };

    const resetModuleInfo = () => {
        setShowResetConfirm(true);
    };

    const executeResetModuleInfo = () => {
        setModuleInfo({
            title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
            occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
        });
        setSelectedProgrammeId("");
        setSelectedModuleCode("");
        setTopics([]);
        setShowResetConfirm(false);
    };

    const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
        const i = p.findIndex((b) => b.id === id);
        if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
        const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
        [n[i], n[sw]] = [n[sw], n[i]];
        return n;
    });

    const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
    const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
    const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

    const handleSave = async (status: AssessmentStatusType | "force_draft", isAutoSave = false) => {
        if (!title.trim() && !isAutoSave) {
            toast.warning("Please enter a Workbook Title.");
            return;
        }

        if (cohortIds.length === 0 && !isAutoSave && (status === "active" || status === "scheduled" || status === "upcoming")) {
            toast.warning("Please select at least one Cohort to publish this to.");
            return;
        }

        if (!isAutoSave) setLoading(true);
        setSaveStatus("saving");

        try {
            const sanitizedBlocks = blocks.map((b) => {
                const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
                if (b.imageUrl) c.imageUrl = b.imageUrl;
                if (b.imageCaption) c.imageCaption = b.imageCaption;
                if (b.linkedTopicId) {
                    const t = topics.find((tp) => tp.id === b.linkedTopicId);
                    if (t) c.linkedTopicCode = t.code;
                    c.linkedTopicId = b.linkedTopicId;
                }
                if (b.type === "section") { c.title = b.title || "Untitled Section"; c.content = b.content || ""; }
                if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
                if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
                if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
                if (b.type === "mcq") { c.options = b.options || ["", "", "", ""]; c.correctOption = b.correctOption || 0; }
                if (b.type === "checklist") {
                    c.criteria = b.criteria || [];
                    c.requireTimeTracking = b.requireTimeTracking !== false;
                    c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
                    c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
                    c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
                }
                if (b.type === "qcto_workplace") {
                    c.weCode = b.weCode || ""; c.weTitle = b.weTitle || "";
                    c.workActivities = b.workActivities || [];
                    c.requireSelfAssessment = b.requireSelfAssessment !== false;
                    c.requireGoalPlanning = b.requireGoalPlanning !== false;
                }
                if (b.type === "task") {
                    c.allowText = b.allowText; c.allowUpload = b.allowUpload; c.allowAudio = b.allowAudio;
                    c.allowUrl = b.allowUrl; c.allowCode = b.allowCode; c.allowedFileTypes = b.allowedFileTypes;
                    c.codeLanguage = b.codeLanguage;
                }

                // Sanitize Code Sandbox
                if (b.type === "code_sandbox") {
                    c.question = b.question || "";
                    c.template = b.template || "javascript";
                    c.initialFiles = b.initialFiles || {};
                    c.dependencies = b.dependencies || {};
                }
                return c;
            });

            let finalStatus: AssessmentStatusType = status === "force_draft" ? "draft" : status;
            let finalScheduledDate: string | null = null;

            if (releaseState === "scheduled" && scheduledDate) {
                finalScheduledDate = new Date(scheduledDate).toISOString();
            }

            if (isAutoSave) {
                finalStatus = statusRef.current;
            } else if (isDeployed && status === "draft") {
                finalStatus = statusRef.current;
            } else if (status === "active") {
                if (releaseState === "scheduled" && finalScheduledDate) finalStatus = "scheduled";
                else if (releaseState === "upcoming") finalStatus = "upcoming";
                else finalStatus = "active";
            } else if (status === "force_draft") {
                if (!window.confirm("Are you sure you want to unpublish this workbook? It will be hidden from learners and reverted to a Draft.")) {
                    setSaveStatus("saved");
                    setLoading(false);
                    return;
                }
                finalStatus = "draft";
                finalScheduledDate = null;
                setReleaseState("active");
                setScheduledDate("");
            }

            let targetDocId = assessmentId;

            if (!targetDocId) {
                const sanitizedModuleCode = selectedModuleCode ? selectedModuleCode.replace(/[\s/]+/g, "-").toUpperCase() : null;
                const sanitizedType = type ? type.replace(/[\s/]+/g, "-").toLowerCase() : null;

                const baseComposite = (sanitizedModuleCode && sanitizedType)
                    ? `${sanitizedModuleCode}_${sanitizedType}`
                    : null;

                const uniqueTag = Math.random().toString(36).slice(2, 6).toUpperCase();

                targetDocId = baseComposite ? `${baseComposite}_${uniqueTag}` : doc(collection(db, "assessments")).id;
            }

            let newTaskId = autoCloseTaskId;
            try {
                const functions = getFunctions();

                if ((status === "force_draft" || finalStatus === "draft") && autoCloseTaskId) {
                    const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
                    await cancelTask({ taskId: autoCloseTaskId }).catch((e) => console.log(e));
                    newTaskId = null;
                    setAutoCloseTaskId(null);
                }
                else if (finalStatus === "scheduled" && releaseState === "scheduled" && finalScheduledDate && moduleInfo.timeLimit) {
                    const startTime = new Date(finalScheduledDate);
                    const endTimeMs = startTime.getTime() + (moduleInfo.timeLimit * 60000);
                    const endTime = new Date(endTimeMs);

                    if (endTime.getTime() > Date.now()) {
                        if (autoCloseTaskId) {
                            const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
                            await cancelTask({ taskId: autoCloseTaskId }).catch(() => { });
                        }

                        const scheduleTask = httpsCallable(functions, "scheduleAssessmentSweep");
                        const res = await scheduleTask({
                            assessmentId: targetDocId,
                            scheduledEndTimeISO: endTime.toISOString()
                        });
                        newTaskId = (res.data as any).taskId;
                        setAutoCloseTaskId(newTaskId);
                    }
                }
            } catch (err) {
                console.error("Failed to manage Cloud Tasks for Auto-Sweep:", err);
                if (!isAutoSave) toast.warning("Saved, but failed to sync timer with Cloud Tasks. Check logs.");
            }

            const isFirstPublish = finalStatus !== "draft" && statusRef.current === "draft";
            const unnotifiedCohorts = cohortIds.filter(id => !notifiedCohortIds.includes(id));
            const isReadyToNotify = ["active", "scheduled", "upcoming"].includes(finalStatus) && status !== "force_draft";

            const nextNotifiedArray = (isReadyToNotify && unnotifiedCohorts.length > 0)
                ? [...notifiedCohortIds, ...unnotifiedCohorts]
                : notifiedCohortIds;

            const payload: any = {
                id: targetDocId,
                title, type, moduleType, cohortIds,
                notifiedCohortIds: nextNotifiedArray,
                collaboratorIds,
                linkedProgrammeId: selectedProgrammeId,
                linkedModuleCode: selectedModuleCode,
                scheduledDate: finalScheduledDate,
                isScheduled: releaseState === "scheduled",
                instructions: instructions || "",
                requiresInvigilation: moduleType === 'knowledge' ? requiresInvigilation : false,
                moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
                learnerGuide: {
                    note: learnerNote, purpose: modulePurpose, entryRequirements,
                    providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
                },
                topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
                lastUpdated: new Date().toISOString(),
                lastUpdatedBy: user?.uid,
                isWorkbook: true,
                autoCloseTaskId: newTaskId || null,
            };

            if (targetDocId !== assessmentId) {
                payload.createdAt = new Date().toISOString();
            }

            if (creatorId) {
                payload.createdBy = creatorId;
                payload.facilitatorId = creatorId;
            } else {
                payload.createdBy = user?.uid;
                payload.facilitatorId = user?.uid;
            }

            if (isFirstPublish) {
                payload.publishedBy = user?.uid;
            } else if (publisherId) {
                payload.publishedBy = publisherId;
            }

            const batch = writeBatch(db);

            const assessmentRef = doc(db, "assessments", targetDocId);
            batch.set(assessmentRef, payload, { merge: true });

            if (["active", "scheduled", "upcoming", "completed"].includes(finalStatus)) {
                const allEnrollments: any[] = [];
                for (const cid of cohortIds) {
                    const enrolQuery = query(collection(db, "enrollments"), where("cohortId", "==", cid), where("status", "==", "active"));
                    const enrolSnap = await getDocs(enrolQuery);
                    enrolSnap.docs.forEach(d => allEnrollments.push({ id: d.id, ...d.data() }));
                }

                if (allEnrollments.length > 0) {
                    const existingSubQuery = query(collection(db, "learner_submissions"), where("assessmentId", "==", targetDocId));
                    const existingSubSnap = await getDocs(existingSubQuery);
                    const existingIds = new Set(existingSubSnap.docs.map((d) => d.id));

                    allEnrollments.forEach((enrol) => {
                        const targetLearnerId = enrol.learnerId || enrol.id;
                        const sid = `${enrol.cohortId}_${targetLearnerId}_${targetDocId}`;
                        const ref = doc(db, "learner_submissions", sid);

                        const subData: any = {
                            title: payload.title,
                            type: payload.type,
                            moduleType: payload.moduleType,
                            totalMarks: payload.totalMarks,
                            moduleNumber: payload.moduleInfo?.moduleNumber || "",
                            updatedAt: new Date().toISOString()
                        };

                        if (!existingIds.has(sid)) {
                            batch.set(ref, {
                                ...subData,
                                learnerId: targetLearnerId,
                                enrollmentId: enrol.id,
                                authUid: targetLearnerId,
                                assessmentId: targetDocId,
                                cohortId: enrol.cohortId,
                                status: "not_started",
                                assignedAt: new Date().toISOString(),
                                marks: 0,
                                createdAt: new Date().toISOString(),
                                createdBy: user?.uid || "System",
                            });
                        } else {
                            batch.set(ref, subData, { merge: true });
                        }
                    });
                }
            }

            await batch.commit();

            if (isReadyToNotify && unnotifiedCohorts.length > 0 && !isAutoSave) {
                if (sendNotification) {
                    const inviteDate = finalScheduledDate;
                    toast.info(`Sending email notifications to ${unnotifiedCohorts.length} assigned cohort(s)...`);

                    try {
                        const functions = getFunctions();
                        const sendCalendarInvites = httpsCallable(functions, "sendAssessmentCalendarInvites");

                        sendCalendarInvites({
                            assessmentId: targetDocId,
                            title: payload.title,
                            scheduledDate: inviteDate,
                            timeLimit: payload.moduleInfo?.timeLimit || 60,
                            cohortIds: unnotifiedCohorts,
                            platformLink: `${window.location.origin}/learner/assessment/${targetDocId}`,
                            moduleType: payload.moduleType,
                            assessmentType: payload.type,
                            moduleNumber: payload.moduleInfo?.moduleNumber,
                            qualificationTitle: payload.moduleInfo?.qualificationTitle
                        }).then(() => {
                            toast.success("Learners notified successfully.");
                            setNotifiedCohortIds(nextNotifiedArray);
                        }).catch(err => {
                            console.error("Cloud function error:", err);
                            toast.error("Workbook saved, but notification failed to send.");
                        });
                    } catch (err) {
                        console.error("Failed to call cloud function:", err);
                    }
                } else {
                    setNotifiedCohortIds(nextNotifiedArray);
                    toast.success("Workbook published silently (no emails sent).");
                }
            } else if (!isAutoSave) {
                if (status === "force_draft") toast.success("Workbook Unpublished & Reverted to Draft!");
                else if (finalStatus === "active") toast.success("Workbook Published & Updated!");
                else if (finalStatus === "scheduled") toast.success("Workbook Scheduled Successfully!");
                else if (finalStatus === "upcoming") toast.success("Workbook Saved as Coming Soon!");
                else toast.success("Draft saved!");
            }

            setAssessmentStatus(finalStatus);
            if (isFirstPublish) setPublisherId(user?.uid || null);
            if (!creatorId) setCreatorId(user?.uid || null);

            setSaveStatus("saved");
            setLastSaved(new Date());

            if (!isAutoSave && targetDocId !== assessmentId) {
                navigate(`/facilitator/assessments/builder/${targetDocId}`, { replace: true });
            }

        } catch (err: any) {
            console.error("[SAVE ERROR]:", err);
            setSaveStatus("unsaved");
            if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
        } finally {
            if (!isAutoSave) setLoading(false);
        }
    };


    const toggleCollaborator = (staffId: string) => {
        setCollaboratorIds(prev => {
            if (prev.includes(staffId)) return prev.filter(id => id !== staffId);
            return [...prev, staffId];
        });
    };

    const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

    const handleTemplateChange = (blockId: string, templateKey: string) => {
        const boilerplate = CODESANDBOX_BOILERPLATES[templateKey] || CODESANDBOX_BOILERPLATES.javascript;

        setBlocks((prev) => prev.map((b) => {
            if (b.id !== blockId) return b;
            return {
                ...b,
                template: templateKey as any,
                initialFiles: boilerplate.files,
                dependencies: boilerplate.dependencies
            };
        }));
    };

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
                        <button className="ab-back-btn" onClick={handleBackNavigation}>
                            <ArrowLeft size={18} />
                            <span className="ab-hide-mobile">Back</span>
                        </button>
                    </Tooltip>
                </div>
                <div className="ab-topbar-centre">
                    <BookOpen size={16} className="ab-topbar-icon" />
                    <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
                    <span className={`ab-topbar-badge ${type.toLowerCase().replace(/ /g, '-')} ab-hide-mobile`}>{type}</span>

                    {isLiveSyncing && (
                        <span className="ab-topbar-badge active" style={{ animation: 'pulse 1.5s infinite', marginLeft: '8px' }}>
                            <Activity size={12} style={{ marginRight: '4px' }} /> Syncing Remote Changes...
                        </span>
                    )}
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

                    <Tooltip content="Share with other staff" placement="bottom">
                        <button className={`ab-btn ab-btn-ghost ${collaboratorIds.length > 0 ? 'ab-btn-ghost--active' : ''}`} onClick={() => setShowCollaboratorModal(true)}>
                            <Users size={15} />
                            <span className="ab-hide-mobile">Share {collaboratorIds.length > 0 && `(${collaboratorIds.length})`}</span>
                        </button>
                    </Tooltip>

                    {/* CLONE BUTTON */}
                    {assessmentId && (
                        <Tooltip content="Duplicate this workbook" placement="bottom">
                            <button className="ab-btn ab-btn-ghost" onClick={handleClone}>
                                <Copy size={15} />
                                <span className="ab-hide-mobile">Clone</span>
                            </button>
                        </Tooltip>
                    )}

                    {assessmentId && (
                        <Tooltip content="Preview what learners will see" placement="bottom">
                            <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
                                <Eye size={15} />
                                <span className="ab-hide-mobile">Preview</span>
                            </button>
                        </Tooltip>
                    )}

                    {/* UNPUBLISH BUTTON */}
                    {isDeployed && (
                        <Tooltip content="Revert to Draft (Hide from Learners)" placement="bottom">
                            <button className="ab-btn ab-btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleSave("force_draft")}>
                                <EyeOff size={15} />
                                <span className="ab-hide-mobile">Unpublish</span>
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
                                        {user?.role === 'admin' && (
                                            <Tooltip content="Create Blueprint" placement="top">
                                                <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
                                                    <Plus size={13} /> New
                                                </button>
                                            </Tooltip>
                                        )}

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
                                        <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => handleModuleTypeChange(e.target.value as any)}>
                                            <option value="knowledge">Knowledge Module (Standard Questions)</option>
                                            <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
                                            <option value="workplace">Workplace Experience Module (Logbooks)</option>
                                        </select>
                                        <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
                                    </div>
                                    <div className="ab-form-group">
                                        <label className="ab-fg-label">Assessment Type Category</label>
                                        <select className="ab-input" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
                                            <optgroup label="Formal QCTO Assessments">
                                                <option value="formative">Formative Assessment (Internal)</option>
                                                <option value="summative">Summative Assessment (Internal/FISA)</option>
                                                <option value="Practical Observation">Practical Observation</option>
                                                <option value="Workplace Logbook">Workplace Logbook</option>
                                            </optgroup>
                                            <optgroup label="Informal / Practice">
                                                <option value="Developmental Activity">Developmental Activity</option>
                                                <option value="Practice Set">Practice Set / Mock Exam</option>
                                                <option value="Task">Learning Task</option>
                                            </optgroup>
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
                                            <input
                                                type="number"
                                                min="0"
                                                className="ab-input"
                                                placeholder="60"
                                                value={moduleInfo.timeLimit ?? ""}
                                                onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })}
                                            />
                                        </div>
                                        <span className="ab-input-hint">0 = no limit</span>
                                    </FG>
                                </div>

                                <div>
                                    <FG label="Learner Visibility & Release">
                                        <div className="ab-form-group">
                                            <select
                                                className="ab-input ab-input--accent"
                                                value={releaseState}
                                                onChange={(e) => setReleaseState(e.target.value as any)}
                                            >
                                                <option value="active">Open Immediately (Active)</option>
                                                <option value="upcoming">Locked (Show as 'Coming Soon')</option>
                                                <option value="scheduled">Scheduled (Strict Live Countdown)</option>
                                            </select>
                                        </div>

                                        {releaseState === "scheduled" && (
                                            <>
                                                <div className="ab-row-gap" style={{ marginTop: '8px' }}>
                                                    <Calendar size={15} className="ab-input-icon" />
                                                    <input
                                                        type="datetime-local"
                                                        className="ab-input"
                                                        value={scheduledDate}
                                                        onChange={(e) => setScheduledDate(e.target.value)}
                                                    />
                                                </div>
                                                {isDeployed && assessmentStatus === "scheduled" && (
                                                    <button
                                                        className="ab-text-btn"
                                                        style={{ color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                        onClick={() => { setReleaseState("upcoming"); toast.info("Click 'Update' to securely lock the assessment and cancel the schedule."); }}
                                                    >
                                                        <Lock size={13} /> Cancel Schedule & Lock Assessment
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {releaseState === "upcoming" && (
                                            <span className="ab-input-hint" style={{ color: 'var(--mlab-amber)', marginTop: '8px', display: 'block' }}>
                                                Learners will see this in their portfolio as "Coming Soon", but cannot open it until you change it to Active.
                                            </span>
                                        )}
                                    </FG>
                                </div>

                                {/* Security Settings / Proctoring */}
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

                                {/* Cohort Assignment & Notifications */}
                                <div className="ab-fg">
                                    <div className="ab-fg-header">
                                        <label className="ab-fg-label">Assign to Cohorts</label>
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                            {cohorts.length > 0 && (
                                                <button
                                                    className="ab-text-btn"
                                                    onClick={toggleSelectAllCohorts}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
                                                >
                                                    {cohortIds.length === cohorts.length ? <Square size={13} /> : <CheckSquareIcon size={13} />}
                                                    {cohortIds.length === cohorts.length ? "Deselect All" : "Select All"}
                                                </button>
                                            )}
                                            {user?.role === 'admin' && (
                                                <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
                                            )}
                                        </div>
                                    </div>

                                    {cohortIds.length > 0 && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontWeight: 'bold' }}>
                                            {cohortIds.length} Cohort(s) Selected
                                        </div>
                                    )}

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

                                    {/* SILENT PUBLISH TOGGLE */}
                                    <label className={`ab-check-row ${cohortIds.length === 0 ? 'ab-disabled' : ''}`} style={{ marginTop: '12px' }}>
                                        <input
                                            type="checkbox"
                                            checked={sendNotification}
                                            onChange={(e) => setSendNotification(e.target.checked)}
                                            disabled={cohortIds.length === 0}
                                            className="ab-checkbox ab-checkbox--amber"
                                        />
                                        <span className="ab-check-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Mail size={14} color={sendNotification ? "var(--mlab-blue)" : "var(--mlab-grey)"} />
                                            Send email notification to newly assigned learners upon publishing
                                        </span>
                                    </label>
                                </div>

                                <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />

                                <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
                                    <ReactQuill
                                        theme="snow"
                                        value={instructions}
                                        onChange={setInstructions}
                                        readOnly={isDeployed}
                                        modules={quillModules}
                                        formats={quillFormats}
                                        placeholder="Add instructions for learners…"
                                    />
                                </div>
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
                                <FG label="Note to Learner">
                                    <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
                                        <ReactQuill
                                            theme="snow"
                                            value={learnerNote}
                                            onChange={setLearnerNote}
                                            readOnly={isDeployed}
                                            modules={quillModules}
                                            formats={quillFormats}
                                            placeholder="Write a welcoming note or context for the learner…"
                                        />
                                    </div>
                                </FG>
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
                                                    <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.replace(/<[^>]*>?/gm, '').slice(0, 40) || b.title || `Question ${i + 1}`}</span>
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
                            <Tooltip content="Live Code Sandbox" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("code_sandbox")}><Code size={15} /></button></Tooltip>
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
                                        <span className={`ab-mc-b type-${type.toLowerCase().replace(/ /g, '-')}`}>{type}</span>
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
                                        onTemplateChange={handleTemplateChange}
                                        key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} isDeployed={isDeployed}
                                        onFocus={() => setFocusedBlock(b.id)} onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
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

            {blockToRemove && (
                <StatusModal
                    type="error"
                    title="Remove Block"
                    message="Are you sure you want to remove this block from the assessment?"
                    confirmText="Remove"
                    onClose={executeRemoveBlock}
                    onCancel={() => setBlockToRemove(null)}
                />
            )}

            {showResetConfirm && (
                <StatusModal
                    type="warning"
                    title="Clear Module Info"
                    message="Are you sure you want to clear all module fields? This will also remove any mapped topics."
                    confirmText="Clear Fields"
                    onClose={executeResetModuleInfo}
                    onCancel={() => setShowResetConfirm(false)}
                />
            )}

            {/* COLLABORATOR MODAL */}
            {showCollaboratorModal && createPortal(
                <div className="mlab-modal-overlay" onClick={() => setShowCollaboratorModal(false)}>
                    <div className="mlab-modal-window mlab-modal-window--sm" onClick={e => e.stopPropagation()}>

                        <div className="mlab-modal-header">
                            <h2 className="mlab-modal-title">
                                <Users size={18} /> Manage Access
                            </h2>
                            <button className="mlab-modal-close" onClick={() => setShowCollaboratorModal(false)}>
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mlab-modal-body">
                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
                                Select staff who can view and edit this workbook.
                            </p>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {staff.length === 0 ? (
                                    <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', textAlign: 'center', margin: '2rem 0' }}>
                                        No staff members found.
                                    </p>
                                ) : (
                                    staff.map((member: StaffMember) => {
                                        const isCreator = member.id === creatorId || member.authUid === creatorId;
                                        const isCurrentUser = member.id === user?.uid || member.authUid === user?.uid;

                                        if (isCreator || isCurrentUser) return null;

                                        const staffUid = member.authUid || member.id;
                                        const isCollab = collaboratorIds.includes(staffUid);

                                        return (
                                            <label
                                                key={member.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    padding: '10px 12px',
                                                    border: '1px solid',
                                                    borderColor: isCollab ? 'var(--mlab-green)' : 'var(--mlab-border)',
                                                    background: isCollab ? 'var(--mlab-green-bg)' : 'var(--mlab-bg)',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isCollab}
                                                    onChange={() => toggleCollaborator(staffUid)}
                                                    style={{
                                                        width: '16px',
                                                        height: '16px',
                                                        accentColor: 'var(--mlab-green)',
                                                        marginRight: '12px',
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <span style={{
                                                        display: 'block',
                                                        fontFamily: 'var(--font-heading)',
                                                        fontWeight: 600,
                                                        letterSpacing: '0.05em',
                                                        color: 'var(--mlab-blue)',
                                                        fontSize: '0.9rem',
                                                        textTransform: 'uppercase'
                                                    }}>
                                                        {member.fullName}
                                                    </span>
                                                    <span style={{ display: 'block', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'capitalize' }}>
                                                        {member.role}
                                                    </span>
                                                </div>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className="mlab-modal-footer">
                            <button className="mlab-btn mlab-btn--primary" onClick={() => setShowCollaboratorModal(false)}>
                                Done
                            </button>
                        </div>

                    </div>
                </div>,
                document.body
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
    onTemplateChange: (blockId: string, templateKey: string) => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
    block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
    onTemplateChange
}) => {
    const meta = BLOCK_META[block.type];
    const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

    const [isUploadingImage, setIsUploadingImage] = useState(false);

    // NEW STATES: GitHub & ZIP Imports
    const [gitUrl, setGitUrl] = useState("");
    const [isImportingGit, setIsImportingGit] = useState(false);
    const [isUploadingZip, setIsUploadingZip] = useState(false);

    const toast = useToast();

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingImage(true);
        toast.info("Uploading image...");
        try {
            const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/block_images/${Date.now()}_${file.name}`), file);
            task.on("state_changed", null, () => {
                toast.error("Image upload failed.");
                setIsUploadingImage(false);
            }, async () => {
                const url = await getDownloadURL(task.snapshot.ref);
                onUpdate(block.id, "imageUrl", url);
                toast.success("Image attached!");
                setIsUploadingImage(false);
            });
        } catch {
            toast.error("Upload failed.");
            setIsUploadingImage(false);
        }
    };

    const updateCriterion = (i: number, v: string) => { const c = [...(block.criteria || [])]; c[i] = v; onUpdate(block.id, "criteria", c); };
    const removeCriterion = (i: number) => onUpdate(block.id, "criteria", (block.criteria || []).filter((_, idx) => idx !== i));
    const addCriterion = () => onUpdate(block.id, "criteria", [...(block.criteria || []), ""]);

    const updateWA = (wi: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], [f]: v }; onUpdate(block.id, "workActivities", l); };
    const removeWA = (wi: number) => onUpdate(block.id, "workActivities", (block.workActivities || []).filter((_, i) => i !== wi));
    const addWA = () => onUpdate(block.id, "workActivities", [...(block.workActivities || []), { id: mkId(), code: "", description: "", evidenceItems: [] }]);
    const updateSE = (wi: number, si: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; const s = [...(l[wi].evidenceItems || [])]; s[si] = { ...s[si], [f]: v }; l[wi] = { ...l[wi], evidenceItems: s }; onUpdate(block.id, "workActivities", l); };
    const removeSE = (wi: number, si: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: (l[wi].evidenceItems || []).filter((_, i) => i !== si) }; onUpdate(block.id, "workActivities", l); };
    const addSE = (wi: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: [...(l[wi].evidenceItems || []), { id: mkId(), code: "", description: "" }] }; onUpdate(block.id, "workActivities", l); };

    // 🚀 SMART ZIP IMPORTER
    const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploadingZip(true);
        toast.info("Extracting ZIP file...");

        try {
            const zip = new JSZip();
            const contents = await zip.loadAsync(file);

            const newFiles: Record<string, string> = {};
            let isVite = false;
            let packageJsonDeps = {};

            const filePaths = Object.keys(contents.files).filter(p => !contents.files[p].dir);
            const validPaths = filePaths.filter(p => !p.includes('node_modules/') && !p.includes('.git/') && !p.includes('.DS_Store'));

            // Strip root wrapper folder if exists
            const firstSegments = new Set(validPaths.map(p => p.split('/')[0]));
            let prefixToStrip = "";
            if (firstSegments.size === 1 && validPaths[0].includes('/')) {
                prefixToStrip = Array.from(firstSegments)[0] + '/';
            }

            for (const path of validPaths) {
                const relativePath = path.replace(prefixToStrip, '');
                if (relativePath.startsWith('.')) continue; // Skip hidden root files

                const fileData = await contents.files[path].async('string');
                const finalPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
                newFiles[finalPath] = fileData;

                if (finalPath.includes('vite.config')) isVite = true;
                if (finalPath === '/package.json') {
                    try {
                        const pkg = JSON.parse(fileData);
                        if (pkg.dependencies) packageJsonDeps = pkg.dependencies;
                    } catch (e) { }
                }
            }

            onUpdate(block.id, "initialFiles", newFiles);
            onUpdate(block.id, "dependencies", packageJsonDeps);

            if (isVite) {
                onUpdate(block.id, "template", "vite-react");
            } else if (block.template !== "create-react-app" && block.template !== "node" && block.template !== "html") {
                onUpdate(block.id, "template", "create-react-app");
            }
            toast.success("Project imported successfully!");
        } catch (err: any) {
            toast.error("Failed to parse ZIP: " + err.message);
        } finally {
            setIsUploadingZip(false);
            e.target.value = '';
        }
    };

    // 🚀 SMART GITHUB IMPORTER
    const handleGitImport = async () => {
        if (!gitUrl.trim()) return;
        setIsImportingGit(true);
        toast.info("Fetching GitHub repository...");

        try {
            const match = gitUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
            if (!match) throw new Error("Invalid GitHub URL. Must be: https://github.com/owner/repo");
            const [, owner, repo] = match;

            // Fetch default branch
            const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
            if (!repoRes.ok) throw new Error("Repository not found or is private.");
            const repoData = await repoRes.json();
            const defaultBranch = repoData.default_branch;

            // Fetch file tree
            const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`);
            const treeData = await treeRes.json();

            const validFiles = treeData.tree.filter((f: any) =>
                f.type === 'blob' &&
                !f.path.includes('node_modules/') &&
                !f.path.includes('.git/') &&
                !f.path.includes('dist/') &&
                !f.path.includes('build/')
            );

            const newFiles: Record<string, string> = {};
            let isVite = false;
            let packageJsonDeps = {};

            if (validFiles.length > 50) {
                toast.warning("Large repository detected. Only fetching the first 50 files to prevent overload.");
            }
            const filesToFetch = validFiles.slice(0, 50);

            await Promise.all(filesToFetch.map(async (file: any) => {
                const rawRes = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${defaultBranch}/${file.path}`);
                const content = await rawRes.text();

                const finalPath = file.path.startsWith('/') ? file.path : `/${file.path}`;
                newFiles[finalPath] = content;

                if (finalPath.includes('vite.config')) isVite = true;
                if (finalPath === '/package.json') {
                    try {
                        const pkg = JSON.parse(content);
                        if (pkg.dependencies) packageJsonDeps = pkg.dependencies;
                    } catch (e) { }
                }
            }));

            onUpdate(block.id, "initialFiles", newFiles);
            onUpdate(block.id, "dependencies", packageJsonDeps);

            if (isVite) {
                onUpdate(block.id, "template", "vite-react");
            } else if (block.template !== "create-react-app" && block.template !== "node" && block.template !== "html") {
                onUpdate(block.id, "template", "create-react-app");
            }

            toast.success("GitHub project imported!");
            setGitUrl("");
        } catch (err: any) {
            toast.error("Import failed: " + err.message);
        } finally {
            setIsImportingGit(false);
        }
    };

    return (
        <div id={`block-${block.id}`} className={`ab-block ${focused ? "is-focused" : ""} ${isDeployed ? "is-locked" : ""}`} style={{ "--block-accent": meta.color } as React.CSSProperties} onClick={onFocus}>
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
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

                    <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ marginBottom: '1rem', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
                        <ReactQuill
                            theme="snow"
                            value={block.question || ""}
                            onChange={(v) => onUpdate(block.id, "question", v)}
                            readOnly={isDeployed}
                            modules={quillModules}
                            formats={quillFormats}
                            placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type your question here (Supports multiple lines, formatting, and lists)…"}
                        />
                    </div>

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

            {/* CODE SANDBOX (LIVE IDE) */}
            {block.type === "code_sandbox" && (
                <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={{ background: "rgba(59, 130, 246, 0.18)", color: "#3b82f6" }}>IDE</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks || 0}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>

                    <div className="ab-form-group">
                        <label className="ab-field-lbl">Environment Template (Sandpack / Code Engine)</label>
                        <select
                            className="ab-input"
                            value={block.template || "javascript"}
                            onChange={(e) => onTemplateChange(block.id, e.target.value)}
                            disabled={isDeployed}
                        >
                            <option value="javascript">JavaScript / TypeScript (Blank)</option>
                            <option value="html">HTML / CSS / JS</option>
                            <option value="create-react-app">React.js (Create-React-App)</option>
                            <option value="vite-react">React.js (Vite Native)</option>
                            <option value="node">Node.js (Terminal with NPM Support)</option>
                            <option value="python">Python (Terminal with PyPI Support)</option>
                            <option value="sql">SQL Database (Terminal)</option>
                        </select>
                    </div>

                    {/* 🚀 SMART PROJECT IMPORTER */}
                    {!isDeployed && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
                            <label className="ab-field-lbl" style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', color: '#0f172a' }}>
                                <FolderArchive size={14} color="#3b82f6" /> Import Custom Project (Optional)
                            </label>

                            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                {/* GitHub URL Importer */}
                                <div style={{ flex: 1, display: 'flex', gap: '6px', minWidth: '250px' }}>
                                    <input
                                        type="text"
                                        className="ab-input"
                                        placeholder="https://github.com/owner/repo"
                                        value={gitUrl}
                                        onChange={(e) => setGitUrl(e.target.value)}
                                        disabled={isImportingGit || isUploadingZip}
                                    />
                                    <button
                                        className="ab-btn ab-btn-primary"
                                        style={{ whiteSpace: 'nowrap' }}
                                        onClick={handleGitImport}
                                        disabled={isImportingGit || isUploadingZip || !gitUrl.trim()}
                                    >
                                        {isImportingGit ? <Loader2 size={14} className="ap-spin" /> : <Github size={14} />}
                                        Import
                                    </button>
                                </div>

                                <span style={{ color: '#94a3b8', display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontWeight: 'bold' }}>OR</span>

                                {/* ZIP Upload Importer */}
                                <label className={`ab-btn ab-btn-outline ${isUploadingZip || isImportingGit ? 'ab-disabled' : ''}`} style={{ cursor: 'pointer' }}>
                                    {isUploadingZip ? <Loader2 size={14} className="ap-spin" /> : <UploadCloud size={14} />}
                                    Upload .ZIP
                                    <input
                                        type="file"
                                        accept=".zip"
                                        hidden
                                        onChange={handleZipUpload}
                                        disabled={isUploadingZip || isImportingGit}
                                    />
                                </label>
                            </div>
                            <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                                The importer will automatically extract files, strip heavy folders (like node_modules), extract package.json dependencies, and auto-detect Vite vs CRA.
                            </p>
                        </div>
                    )}

                    {/* SQL ENGINE INJECTOR */}
                    {block.template === "sql" && (
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
                            <strong><Database size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> Database Environment Boilerplate:</strong>
                            <p style={{ margin: '4px 0 8px 0' }}>The runner executes raw SQL scripts sequentially. Inject a boilerplate structure containing sample table creations to get the learner started.</p>

                            {!isDeployed && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <button
                                        className="ab-btn ab-btn-primary ab-btn-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdate(block.id, "dependencies", {});
                                            onUpdate(block.id, "initialFiles", {
                                                "/main.sql": "-- Run sequential SQL queries here\n\nCREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');\n\n-- Write your target SELECT query below:\nSELECT * FROM employees;\n"
                                            });
                                            toast.success("SQL Boilerplate loaded!");
                                        }}
                                    >
                                        <Zap size={13} /> Inject Pure SQLite Script
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="ab-form-group">
                        <label className="ab-field-lbl">Challenge Instructions</label>
                        <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ background: '#fff' }}>
                            <ReactQuill
                                theme="snow"
                                value={block.question || ""}
                                onChange={(v) => onUpdate(block.id, "question", v)}
                                readOnly={isDeployed}
                                modules={quillModules}
                                formats={quillFormats}
                                placeholder="Describe the app or script the learner needs to build..."
                            />
                        </div>
                    </div>

                    <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                        <Info size={13} style={{ marginBottom: '-2px', marginRight: '4px' }} />
                        <strong>Environment Details:</strong> React/HTML tasks open in a live web preview. Node.js opens in a terminal with full NPM support. Python opens in a Wasm terminal with automatic PyPI package installation. SQL uses an in-memory SQLite database.
                    </div>
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
                        <input type="text" className="ab-input" value={block.title || ""} onChange={(e) => e.target.value ? onUpdate(block.id, "title", e.target.value) : onUpdate(block.id, "title", "")} placeholder="e.g. PA0101 Demonstrate the use of…" />
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
                                    {!isDeployed && <button className="ab-btn-transform-danger" onClick={() => removeCriterion(i)}><X size={15} /></button>}
                                </div>
                                <div className="ab-criterion-preview-stack">
                                    {block.requireEvidencePerCriterion !== false && (
                                        <div className="ab-criterion-preview"><UploadCloud size={13} /><em>Learner uploads evidence here…</em></div>
                                    )}
                                    {block.requirePerCriterionTiming !== false && (
                                        <div className="ab-criterion-timer">
                                            <Timer size={13} /><span className="ab-criterion-timer-label">Task Timer:</span>
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
                    <div className="ab-q-top"><span className="ab-q-num" style={{ background: "rgba(249,115,22,.18)", color: "#fb923c" }}>LOG</span></div>
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
                    </div>
                </div>
            )}

            {/* BLOCK IMAGE ATTACHMENT ZONE */}
            {["text", "mcq", "task", "info", "section", "code_sandbox"].includes(block.type) && (
                <div style={{ padding: "0 20px 20px 20px" }}>
                    {!block.imageUrl && !isUploadingImage ? (
                        <label className="ab-image-toggle">
                            <ImageIcon size={14} /> Attach Context Image
                            <input type="file" accept="image/*" hidden disabled={isDeployed} onChange={handleImageUpload} />
                        </label>
                    ) : isUploadingImage ? (
                        <div className="ab-image-upload-zone">
                            <div className="ab-spinner" style={{ margin: '0 auto', marginBottom: '8px', width: '20px', height: '20px' }} />
                            <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Uploading Image...</span>
                        </div>
                    ) : (
                        <div className="ab-image-upload-zone has-image" onClick={(e) => e.stopPropagation()}>
                            <img src={block.imageUrl} alt="Attached context" className="ab-image-preview" />
                            <div className="ab-image-meta">
                                <input
                                    className="ab-caption-input"
                                    placeholder="Add an optional caption or source credit..."
                                    value={block.imageCaption || ""}
                                    disabled={isDeployed}
                                    onChange={(e) => onUpdate(block.id, "imageCaption", e.target.value)}
                                />
                                {!isDeployed && (
                                    <button
                                        className="ab-btn-text ab-btn-text--rose"
                                        style={{ alignSelf: "flex-start", padding: 0 }}
                                        onClick={() => { onUpdate(block.id, "imageUrl", ""); onUpdate(block.id, "imageCaption", ""); }}
                                    >
                                        <Trash2 size={12} style={{ marginRight: '4px' }} /> Remove Image
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── UTILITY COMPONENTS ───────────────────────────────────────────────────────
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


// // src/components/views/AssessmentBuilder/AssessmentBuilder.tsx

// import React, { useState, useEffect, useRef } from "react";
// import { useNavigate, useParams, useLocation } from "react-router-dom";
// import {
//     collection, doc, setDoc, writeBatch, query, where, getDocs, onSnapshot
// } from "firebase/firestore";
// import {
//     getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
// } from "firebase/storage";
// import { getFunctions, httpsCallable } from "firebase/functions";
// import { db } from "../../../lib/firebase";
// import { useStore, type StaffMember } from "../../../store/useStore";
// import {
//     ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
//     FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
//     BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
//     Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
//     Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive, ShieldAlert, Image as ImageIcon,
//     Users, Activity, Mail, Copy, CheckSquare as CheckSquareIcon, Square
// } from "lucide-react";
// import Tooltip from "../../../components/common/Tooltip/Tooltip";
// import type { Cohort, ProgrammeTemplate, DashboardLearner, StackBlitzTemplate } from "../../../types";
// import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
// import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
// import ReactQuill from "react-quill-new";
// import "react-quill-new/dist/quill.snow.css";
// import "./AssessmentBuilder.css";
// import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";
// import { StatusModal } from "../../../components/common/StatusModal/StatusModal";
// import { createPortal } from "react-dom";

// const quillModules = {
//     toolbar: [
//         ["bold", "italic", "underline", "code-block"],
//         [{ list: "ordered" }, { list: "bullet" }],
//         ["clean"],
//     ],
// };
// const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

// export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace" | "code_sandbox";

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
//     imageUrl?: string;
//     imageCaption?: string;

//     // Code Sandbox Properties ---
//     template?: "create-react-app" | "node" | "javascript" | "typescript" | "html" | "python" | "sql";
//     initialFiles?: Record<string, string>;
//     dependencies?: Record<string, string>;
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

// export interface CodeSandboxConfig {
//     template: StackBlitzTemplate;
//     initialFiles: Record<string, string>;
//     dependencies?: Record<string, string>;
// }

// export interface CodeSandboxBlock {
//     id: string;
//     type: 'code_sandbox';
//     title: string;
//     instructions?: string;
//     marks: number;
//     config: CodeSandboxConfig;
// }

// export interface CodeSandboxAnswer {
//     snapshot: Record<string, string>;
//     lastSavedAt: string;
// }

// type AssessmentStatusType = "draft" | "upcoming" | "scheduled" | "active" | "completed";

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
//     code_sandbox: { label: "Code Sandbox", color: "#3b82f6", icon: <Code size={14} />, desc: "Live embedded IDE for coding assessments" },
// };

// // 🚀 RE-ENGINEERED: Boilerplates designed specifically for Sandpack (React) and Piston (Python/Node/SQL)
// const CODESANDBOX_BOILERPLATES: Record<string, { files: Record<string, string>; dependencies: Record<string, string> }> = {
//     javascript: {
//         files: { "index.js": "// Pure JavaScript Environment\nconsole.log('Vanilla JS workspace ready.');\n" },
//         dependencies: {}
//     },
//     typescript: {
//         files: { "index.ts": "// TypeScript Environment\nconst msg: string = 'TS ready!';\nconsole.log(msg);\n" },
//         dependencies: {}
//     },
//     html: {
//         files: {
//             "index.html": "<!DOCTYPE html>\n<html>\n<head>\n  <link rel=\"stylesheet\" href=\"styles.css\">\n</head>\n<body>\n  <div id=\"app\">\n    <h1>HTML/JS Sandbox</h1>\n    <p>Edit these files to see the live preview update.</p>\n  </div>\n  <script src=\"index.js\"></script>\n</body>\n</html>",
//             "index.js": "console.log('DOM Sandbox ready.');\n",
//             "styles.css": "body {\n  font-family: sans-serif;\n  background: #0f172a;\n  color: #f8fafc;\n  padding: 2rem;\n}"
//         },
//         dependencies: {}
//     },
//     "create-react-app": {
//         files: {
//             "/App.js": "export default function App() {\n  return (\n    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>\n      <h1>React Blueprint Working!</h1>\n      <p>Start building your UI components here.</p>\n    </div>\n  );\n}\n",
//             "/index.js": "import React, { StrictMode } from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport './styles.css';\n\nconst root = createRoot(document.getElementById('root'));\nroot.render(\n  <StrictMode>\n    <App />\n  </StrictMode>\n);\n",
//             "/styles.css": "body {\n  margin: 0;\n  background: #f8fafc;\n}\n"
//         },
//         dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" }
//     },
//     node: {
//         files: { "index.js": "// Node.js Backend Script\n\nconsole.log('Node execution engine ready.');\n" },
//         dependencies: {}
//     },
//     python: {
//         files: { "main.py": "# Python 3 Environment\n\ndef main():\n    print('Python workspace ready!')\n\nif __name__ == '__main__':\n    main()\n" },
//         dependencies: {}
//     },
//     sql: {
//         files: { "main.sql": "-- SQLite Execution Environment\n\nCREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');\n\n-- Write your queries below:\nSELECT * FROM employees;\n" },
//         dependencies: {}
//     }
// };

// export const AssessmentBuilder: React.FC = () => {
//     const { assessmentId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();
//     const toast = useToast();
//     const {
//         user, staff, cohorts, learners, programmes,
//         fetchCohorts, fetchLearners, fetchProgrammes, fetchStaff
//     } = useStore();

//     const [loading, setLoading] = useState(false);
//     const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
//     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
//     const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
//     const [lastSaved, setLastSaved] = useState<Date | null>(null);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
//     const [isLiveSyncing, setIsLiveSyncing] = useState(false);

//     const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
//     const [showResetConfirm, setShowResetConfirm] = useState(false);

//     const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");
//     const [sendNotification, setSendNotification] = useState(true);

//     const statusRef = useRef<AssessmentStatusType>("draft");
//     useEffect(() => { statusRef.current = assessmentStatus; }, [assessmentStatus]);

//     const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
//     const [selectedModuleCode, setSelectedModuleCode] = useState("");
//     const [showProgrammeModal, setShowProgrammeModal] = useState(false);
//     const [showCohortModal, setShowCohortModal] = useState(false);
//     const [title, setTitle] = useState("");

//     const [cohortIds, setCohortIds] = useState<string[]>([]);
//     const [notifiedCohortIds, setNotifiedCohortIds] = useState<string[]>([]);

//     const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
//     const [instructions, setInstructions] = useState("");
//     const [creatorId, setCreatorId] = useState<string | null>(null);
//     const [publisherId, setPublisherId] = useState<string | null>(null);
//     const [autoCloseTaskId, setAutoCloseTaskId] = useState<string | null>(null);

//     const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook" | "Developmental Activity" | "Practice Set" | "Task">("formative");
//     const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");

//     const [requiresInvigilation, setRequiresInvigilation] = useState(true);
//     const [isOpenBook, setIsOpenBook] = useState(false);
//     const [referenceManualUrl, setReferenceManualUrl] = useState("");
//     const [isUploadingManual, setIsUploadingManual] = useState(false);

//     const [releaseState, setReleaseState] = useState<"active" | "upcoming" | "scheduled">("active");
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

//     const isDeployed = (assessmentStatus === "active" || assessmentStatus === "completed" || assessmentStatus === "scheduled" || assessmentStatus === "upcoming") && assessmentId !== undefined;
//     const isInitialLoad = useRef(true);

//     const handleBackNavigation = () => {
//         if (window.history.state && window.history.state.idx > 0) {
//             navigate(-1);
//         } else {
//             navigate('/facilitator/assessments', { replace: true });
//         }
//     };

//     const handleClone = () => {
//         if (!window.confirm("Duplicate this workbook? You will be redirected to a new, unsaved copy.")) return;

//         const cloneData = {
//             title: title + " (Copy)",
//             type, moduleType, instructions, requiresInvigilation, isOpenBook, referenceManualUrl, showModuleHeader,
//             moduleInfo, learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
//             selectedProgrammeId, selectedModuleCode, topics, blocks, releaseState
//         };

//         navigate('/facilitator/assessments/builder', { state: { cloneData } });
//     };

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (programmes.length === 0) fetchProgrammes();
//         if (staff.length === 0) fetchStaff();

//         if (!assessmentId) {
//             if (location.state?.cloneData && isInitialLoad.current) {
//                 const cd = location.state.cloneData;
//                 setTitle(cd.title);
//                 setType(cd.type);
//                 setModuleType(cd.moduleType);
//                 setInstructions(cd.instructions);
//                 setRequiresInvigilation(cd.requiresInvigilation);
//                 setIsOpenBook(cd.isOpenBook);
//                 setReferenceManualUrl(cd.referenceManualUrl);
//                 setShowModuleHeader(cd.showModuleHeader);
//                 setModuleInfo(cd.moduleInfo);
//                 setLearnerNote(cd.learnerNote);
//                 setModulePurpose(cd.modulePurpose);
//                 setEntryRequirements(cd.entryRequirements);
//                 setProviderRequirements(cd.providerRequirements);
//                 setExemptions(cd.exemptions);
//                 setStakeholderGuidelines(cd.stakeholderGuidelines);
//                 setSelectedProgrammeId(cd.selectedProgrammeId);
//                 setSelectedModuleCode(cd.selectedModuleCode);
//                 setReleaseState(cd.releaseState || "active");

//                 const newTopics = cd.topics.map((t: any) => ({ ...t, id: mkId() }));
//                 setTopics(newTopics);

//                 const newBlocks = cd.blocks.map((b: any) => {
//                     const newId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
//                     let newLinkedTopicId = b.linkedTopicId;
//                     if (b.linkedTopicId) {
//                         const oldTopicIdx = cd.topics.findIndex((t: any) => t.id === b.linkedTopicId);
//                         if (oldTopicIdx !== -1) newLinkedTopicId = newTopics[oldTopicIdx].id;
//                     }
//                     return { ...b, id: newId, linkedTopicId: newLinkedTopicId };
//                 });
//                 setBlocks(newBlocks);

//                 setCreatorId(user?.uid || null);
//                 setAutoCloseTaskId(null);
//                 setSaveStatus("unsaved");
//                 isInitialLoad.current = false;

//                 window.history.replaceState({}, document.title);
//             } else {
//                 setCreatorId(user?.uid || null);
//             }
//             return;
//         }

//         setLoading(true);

//         const unsubscribe = onSnapshot(doc(db, "assessments", assessmentId), (snap) => {
//             if (snap.exists()) {
//                 const d = snap.data();

//                 let formattedDate = "";
//                 if (d.scheduledDate) {
//                     try {
//                         const dt = new Date(d.scheduledDate);
//                         if (!isNaN(dt.getTime())) {
//                             const p = (n: number) => n.toString().padStart(2, "0");
//                             formattedDate = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
//                         } else {
//                             formattedDate = d.scheduledDate;
//                         }
//                     } catch {
//                         formattedDate = d.scheduledDate;
//                     }
//                 }

//                 if (isInitialLoad.current) {
//                     setTitle(d.title || "");
//                     setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
//                     setNotifiedCohortIds(d.notifiedCohortIds || []);
//                     setCollaboratorIds(d.collaboratorIds || []);
//                     setCreatorId(d.createdBy || d.facilitatorId || null);
//                     setPublisherId(d.publishedBy || null);
//                     setAutoCloseTaskId(d.autoCloseTaskId || null);
//                     setInstructions(d.instructions || "");
//                     setType(d.type || "formative");
//                     setModuleType(d.moduleType || "knowledge");
//                     setAssessmentStatus(d.status || "draft");
//                     setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
//                     setIsOpenBook(d.isOpenBook || false);
//                     setReferenceManualUrl(d.referenceManualUrl || "");

//                     if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
//                     else if (d.status === "upcoming") setReleaseState("upcoming");
//                     else setReleaseState("active");

//                     setScheduledDate(formattedDate);
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

//                     isInitialLoad.current = false;
//                     setLoading(false);
//                 } else {
//                     if (d.lastUpdatedBy && d.lastUpdatedBy !== user?.uid) {
//                         setIsLiveSyncing(true);
//                         toast.info("A collaborator updated the workbook. Syncing changes...");

//                         setAssessmentStatus(d.status || "draft");
//                         setType(d.type || "formative");
//                         setModuleType(d.moduleType || "knowledge");
//                         setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
//                         setIsOpenBook(d.isOpenBook || false);
//                         setReferenceManualUrl(d.referenceManualUrl || "");
//                         setAutoCloseTaskId(d.autoCloseTaskId || null);

//                         if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
//                         else if (d.status === "upcoming") setReleaseState("upcoming");
//                         else setReleaseState("active");

//                         setBlocks(d.blocks || []);
//                         if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
//                         setTitle(d.title || "");
//                         setCollaboratorIds(d.collaboratorIds || []);
//                         setNotifiedCohortIds(d.notifiedCohortIds || []);
//                         setInstructions(d.instructions || "");
//                         setModuleInfo(d.moduleInfo || {});

//                         setSaveStatus("saved");
//                         setLastSaved(new Date(d.lastUpdated || d.createdAt));

//                         setTimeout(() => setIsLiveSyncing(false), 2000);
//                     }
//                 }
//             } else {
//                 toast.error("Assessment not found or was deleted by a collaborator.");
//                 navigate("/facilitator/assessments");
//             }
//         }, (err) => {
//             console.error("Real-time listener error:", err);
//             toast.error("Lost connection to the live workbook.");
//             setLoading(false);
//         });

//         return () => unsubscribe();
//     }, [assessmentId, user?.uid, location.state]);

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
//         if (!assessmentId || isInitialLoad.current) return;
//         setSaveStatus("unsaved");

//         const t = setTimeout(() => {
//             if (saveStatus === "unsaved" && !loading) {
//                 handleSave(statusRef.current, true);
//             }
//         }, 15000);

//         return () => clearTimeout(t);
//     }, [
//         title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//         stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
//         scheduledDate, releaseState, isOpenBook, referenceManualUrl, requiresInvigilation,
//         collaboratorIds, assessmentStatus
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

//     const handleModuleTypeChange = (newType: "knowledge" | "practical" | "workplace") => {
//         setModuleType(newType);
//         if (newType !== 'knowledge') {
//             setRequiresInvigilation(false);
//         } else {
//             setRequiresInvigilation(true);
//         }
//     };

//     const handleTypeChange = (newType: string) => {
//         setType(newType as any);
//         if (["Developmental Activity", "Practice Set", "Task"].includes(newType)) {
//             setRequiresInvigilation(false);
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

//     const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
//         try {
//             const newRef = doc(collection(db, "programmes"));
//             const id = newRef.id;

//             await setDoc(
//                 newRef,
//                 { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
//                 { merge: true },
//             );

//             toast.success("Blueprint created!");
//             setShowProgrammeModal(false);
//             await fetchProgrammes();
//             setSelectedProgrammeId(id);
//             setSelectedModuleCode("");
//         } catch (err: any) {
//             toast.error(`Error saving blueprint: ${err.message}`);
//         }
//     };

//     const toggleSelectAllCohorts = () => {
//         if (cohortIds.length === cohorts.length) {
//             setCohortIds([]); // Deselect all
//         } else {
//             setCohortIds(cohorts.map(c => c.id)); // Select all
//         }
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
//         } else if (actualType === "code_sandbox") {
//             nb.title = "Practical Coding Task";
//             nb.question = "Follow the instructions and write your solution in the editor below:";
//             nb.template = "javascript"; // Default to basic JS environment
//             nb.marks = 20;
//             nb.initialFiles = CODESANDBOX_BOILERPLATES.javascript.files;
//             nb.dependencies = {};
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
//         setBlockToRemove(id);
//     };

//     const executeRemoveBlock = () => {
//         if (!blockToRemove) return;
//         setBlocks((p) => p.filter((b) => b.id !== blockToRemove));
//         setFocusedBlock(null);
//         toast.info("Block removed");
//         setBlockToRemove(null);
//     };

//     const resetModuleInfo = () => {
//         setShowResetConfirm(true);
//     };

//     const executeResetModuleInfo = () => {
//         setModuleInfo({
//             title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
//             occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
//         });
//         setSelectedProgrammeId("");
//         setSelectedModuleCode("");
//         setTopics([]);
//         setShowResetConfirm(false);
//     };

//     const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
//         const i = p.findIndex((b) => b.id === id);
//         if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
//         const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
//         [n[i], n[sw]] = [n[sw], n[i]];
//         return n;
//     });

//     const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
//     const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
//     const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

//     const handleSave = async (status: AssessmentStatusType | "force_draft", isAutoSave = false) => {
//         if (!title.trim() && !isAutoSave) {
//             toast.warning("Please enter a Workbook Title.");
//             return;
//         }

//         if (cohortIds.length === 0 && !isAutoSave && (status === "active" || status === "scheduled" || status === "upcoming")) {
//             toast.warning("Please select at least one Cohort to publish this to.");
//             return;
//         }

//         if (!isAutoSave) setLoading(true);
//         setSaveStatus("saving");

//         try {
//             const sanitizedBlocks = blocks.map((b) => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.imageUrl) c.imageUrl = b.imageUrl;
//                 if (b.imageCaption) c.imageCaption = b.imageCaption;
//                 if (b.linkedTopicId) {
//                     const t = topics.find((tp) => tp.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }
//                 if (b.type === "section") { c.title = b.title || "Untitled Section"; c.content = b.content || ""; }
//                 if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
//                 if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
//                 if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
//                 if (b.type === "mcq") { c.options = b.options || ["", "", "", ""]; c.correctOption = b.correctOption || 0; }
//                 if (b.type === "checklist") {
//                     c.criteria = b.criteria || [];
//                     c.requireTimeTracking = b.requireTimeTracking !== false;
//                     c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
//                     c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
//                     c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
//                 }
//                 if (b.type === "qcto_workplace") {
//                     c.weCode = b.weCode || ""; c.weTitle = b.weTitle || "";
//                     c.workActivities = b.workActivities || [];
//                     c.requireSelfAssessment = b.requireSelfAssessment !== false;
//                     c.requireGoalPlanning = b.requireGoalPlanning !== false;
//                 }
//                 if (b.type === "task") {
//                     c.allowText = b.allowText; c.allowUpload = b.allowUpload; c.allowAudio = b.allowAudio;
//                     c.allowUrl = b.allowUrl; c.allowCode = b.allowCode; c.allowedFileTypes = b.allowedFileTypes;
//                     c.codeLanguage = b.codeLanguage;
//                 }

//                 // Sanitize Code Sandbox
//                 if (b.type === "code_sandbox") {
//                     c.question = b.question || "";
//                     c.template = b.template || "javascript";
//                     c.initialFiles = b.initialFiles || {};
//                     c.dependencies = b.dependencies || {};
//                 }
//                 return c;
//             });

//             let finalStatus: AssessmentStatusType = status === "force_draft" ? "draft" : status;
//             let finalScheduledDate: string | null = null;

//             if (releaseState === "scheduled" && scheduledDate) {
//                 finalScheduledDate = new Date(scheduledDate).toISOString();
//             }

//             if (isAutoSave) {
//                 finalStatus = statusRef.current;
//             } else if (isDeployed && status === "draft") {
//                 finalStatus = statusRef.current;
//             } else if (status === "active") {
//                 if (releaseState === "scheduled" && finalScheduledDate) finalStatus = "scheduled";
//                 else if (releaseState === "upcoming") finalStatus = "upcoming";
//                 else finalStatus = "active";
//             } else if (status === "force_draft") {
//                 if (!window.confirm("Are you sure you want to unpublish this workbook? It will be hidden from learners and reverted to a Draft.")) {
//                     setSaveStatus("saved");
//                     setLoading(false);
//                     return;
//                 }
//                 finalStatus = "draft";
//                 finalScheduledDate = null;
//                 setReleaseState("active");
//                 setScheduledDate("");
//             }

//             let targetDocId = assessmentId;

//             if (!targetDocId) {
//                 const sanitizedModuleCode = selectedModuleCode ? selectedModuleCode.replace(/[\s/]+/g, "-").toUpperCase() : null;
//                 const sanitizedType = type ? type.replace(/[\s/]+/g, "-").toLowerCase() : null;

//                 const baseComposite = (sanitizedModuleCode && sanitizedType)
//                     ? `${sanitizedModuleCode}_${sanitizedType}`
//                     : null;

//                 const uniqueTag = Math.random().toString(36).slice(2, 6).toUpperCase();

//                 targetDocId = baseComposite ? `${baseComposite}_${uniqueTag}` : doc(collection(db, "assessments")).id;
//             }

//             // GOOGLE CLOUD TASKS: Auto-Sweeper Scheduling
//             // Only schedule the task if it is genuinely published as 'scheduled'.
//             // If it is 'draft' or 'force_draft', we aggressively cancel existing tasks and do not create new ones.
//             let newTaskId = autoCloseTaskId;
//             try {
//                 const functions = getFunctions();

//                 // If unpublishing OR saving as draft, cancel any existing task immediately
//                 if ((status === "force_draft" || finalStatus === "draft") && autoCloseTaskId) {
//                     const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
//                     await cancelTask({ taskId: autoCloseTaskId }).catch((e) => console.log(e));
//                     newTaskId = null;
//                     setAutoCloseTaskId(null);
//                 }
//                 // If genuinely publishing/scheduling, calculate the end time and create the task
//                 else if (finalStatus === "scheduled" && releaseState === "scheduled" && finalScheduledDate && moduleInfo.timeLimit) {
//                     const startTime = new Date(finalScheduledDate);
//                     const endTimeMs = startTime.getTime() + (moduleInfo.timeLimit * 60000);
//                     const endTime = new Date(endTimeMs);

//                     // Only schedule if the end time is genuinely in the future
//                     if (endTime.getTime() > Date.now()) {
//                         // Cancel any old task first just in case dates changed
//                         if (autoCloseTaskId) {
//                             const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
//                             await cancelTask({ taskId: autoCloseTaskId }).catch(() => { });
//                         }

//                         const scheduleTask = httpsCallable(functions, "scheduleAssessmentSweep");
//                         const res = await scheduleTask({
//                             assessmentId: targetDocId,
//                             scheduledEndTimeISO: endTime.toISOString()
//                         });
//                         newTaskId = (res.data as any).taskId;
//                         setAutoCloseTaskId(newTaskId);
//                     }
//                 }
//             } catch (err) {
//                 console.error("Failed to manage Cloud Tasks for Auto-Sweep:", err);
//                 if (!isAutoSave) toast.warning("Saved, but failed to sync timer with Cloud Tasks. Check logs.");
//             }

//             const isFirstPublish = finalStatus !== "draft" && statusRef.current === "draft";
//             const unnotifiedCohorts = cohortIds.filter(id => !notifiedCohortIds.includes(id));
//             const isReadyToNotify = ["active", "scheduled", "upcoming"].includes(finalStatus) && status !== "force_draft";

//             const nextNotifiedArray = (isReadyToNotify && unnotifiedCohorts.length > 0)
//                 ? [...notifiedCohortIds, ...unnotifiedCohorts]
//                 : notifiedCohortIds;

//             const payload: any = {
//                 id: targetDocId,
//                 title, type, moduleType, cohortIds,
//                 notifiedCohortIds: nextNotifiedArray,
//                 collaboratorIds,
//                 linkedProgrammeId: selectedProgrammeId,
//                 linkedModuleCode: selectedModuleCode,
//                 scheduledDate: finalScheduledDate,
//                 isScheduled: releaseState === "scheduled",
//                 instructions: instructions || "",
//                 requiresInvigilation: moduleType === 'knowledge' ? requiresInvigilation : false,
//                 moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
//                 learnerGuide: {
//                     note: learnerNote, purpose: modulePurpose, entryRequirements,
//                     providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
//                 },
//                 topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
//                 lastUpdated: new Date().toISOString(),
//                 lastUpdatedBy: user?.uid,
//                 isWorkbook: true,
//                 autoCloseTaskId: newTaskId || null,
//             };

//             if (targetDocId !== assessmentId) {
//                 payload.createdAt = new Date().toISOString();
//             }

//             if (creatorId) {
//                 payload.createdBy = creatorId;
//                 payload.facilitatorId = creatorId;
//             } else {
//                 payload.createdBy = user?.uid;
//                 payload.facilitatorId = user?.uid;
//             }

//             if (isFirstPublish) {
//                 payload.publishedBy = user?.uid;
//             } else if (publisherId) {
//                 payload.publishedBy = publisherId;
//             }

//             const batch = writeBatch(db);

//             const assessmentRef = doc(db, "assessments", targetDocId);
//             batch.set(assessmentRef, payload, { merge: true });

//             if (["active", "scheduled", "upcoming", "completed"].includes(finalStatus)) {
//                 const allEnrollments: any[] = [];
//                 for (const cid of cohortIds) {
//                     const enrolQuery = query(collection(db, "enrollments"), where("cohortId", "==", cid), where("status", "==", "active"));
//                     const enrolSnap = await getDocs(enrolQuery);
//                     enrolSnap.docs.forEach(d => allEnrollments.push({ id: d.id, ...d.data() }));
//                 }

//                 if (allEnrollments.length > 0) {
//                     const existingSubQuery = query(collection(db, "learner_submissions"), where("assessmentId", "==", targetDocId));
//                     const existingSubSnap = await getDocs(existingSubQuery);
//                     const existingIds = new Set(existingSubSnap.docs.map((d) => d.id));

//                     allEnrollments.forEach((enrol) => {
//                         const targetLearnerId = enrol.learnerId || enrol.id;
//                         const sid = `${enrol.cohortId}_${targetLearnerId}_${targetDocId}`;
//                         const ref = doc(db, "learner_submissions", sid);

//                         const subData: any = {
//                             title: payload.title,
//                             type: payload.type,
//                             moduleType: payload.moduleType,
//                             totalMarks: payload.totalMarks,
//                             moduleNumber: payload.moduleInfo?.moduleNumber || "",
//                             updatedAt: new Date().toISOString()
//                         };

//                         if (!existingIds.has(sid)) {
//                             batch.set(ref, {
//                                 ...subData,
//                                 learnerId: targetLearnerId,
//                                 enrollmentId: enrol.id,
//                                 authUid: targetLearnerId,
//                                 assessmentId: targetDocId,
//                                 cohortId: enrol.cohortId,
//                                 status: "not_started",
//                                 assignedAt: new Date().toISOString(),
//                                 marks: 0,
//                                 createdAt: new Date().toISOString(),
//                                 createdBy: user?.uid || "System",
//                             });
//                         } else {
//                             batch.set(ref, subData, { merge: true });
//                         }
//                     });
//                 }
//             }

//             await batch.commit();

//             if (isReadyToNotify && unnotifiedCohorts.length > 0 && !isAutoSave) {
//                 if (sendNotification) {
//                     const inviteDate = finalScheduledDate;
//                     toast.info(`Sending email notifications to ${unnotifiedCohorts.length} assigned cohort(s)...`);

//                     try {
//                         const functions = getFunctions();
//                         const sendCalendarInvites = httpsCallable(functions, "sendAssessmentCalendarInvites");

//                         sendCalendarInvites({
//                             assessmentId: targetDocId,
//                             title: payload.title,
//                             scheduledDate: inviteDate,
//                             timeLimit: payload.moduleInfo?.timeLimit || 60,
//                             cohortIds: unnotifiedCohorts,
//                             platformLink: `${window.location.origin}/learner/assessment/${targetDocId}`,
//                             moduleType: payload.moduleType,
//                             assessmentType: payload.type,
//                             moduleNumber: payload.moduleInfo?.moduleNumber,
//                             qualificationTitle: payload.moduleInfo?.qualificationTitle
//                         }).then(() => {
//                             toast.success("Learners notified successfully.");
//                             setNotifiedCohortIds(nextNotifiedArray);
//                         }).catch(err => {
//                             console.error("Cloud function error:", err);
//                             toast.error("Workbook saved, but notification failed to send.");
//                         });
//                     } catch (err) {
//                         console.error("Failed to call cloud function:", err);
//                     }
//                 } else {
//                     setNotifiedCohortIds(nextNotifiedArray);
//                     toast.success("Workbook published silently (no emails sent).");
//                 }
//             } else if (!isAutoSave) {
//                 if (status === "force_draft") toast.success("Workbook Unpublished & Reverted to Draft!");
//                 else if (finalStatus === "active") toast.success("Workbook Published & Updated!");
//                 else if (finalStatus === "scheduled") toast.success("Workbook Scheduled Successfully!");
//                 else if (finalStatus === "upcoming") toast.success("Workbook Saved as Coming Soon!");
//                 else toast.success("Draft saved!");
//             }

//             setAssessmentStatus(finalStatus);
//             if (isFirstPublish) setPublisherId(user?.uid || null);
//             if (!creatorId) setCreatorId(user?.uid || null);

//             setSaveStatus("saved");
//             setLastSaved(new Date());

//             if (!isAutoSave && targetDocId !== assessmentId) {
//                 navigate(`/facilitator/assessments/builder/${targetDocId}`, { replace: true });
//             }

//         } catch (err: any) {
//             console.error("[SAVE ERROR]:", err);
//             setSaveStatus("unsaved");
//             if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
//         } finally {
//             if (!isAutoSave) setLoading(false);
//         }
//     };


//     const toggleCollaborator = (staffId: string) => {
//         setCollaboratorIds(prev => {
//             if (prev.includes(staffId)) return prev.filter(id => id !== staffId);
//             return [...prev, staffId];
//         });
//     };

//     const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

//     const handleTemplateChange = (blockId: string, templateKey: string) => {
//         const boilerplate = CODESANDBOX_BOILERPLATES[templateKey] || CODESANDBOX_BOILERPLATES.javascript;

//         setBlocks((prev) => prev.map((b) => {
//             if (b.id !== blockId) return b;
//             return {
//                 ...b,
//                 template: templateKey as any,
//                 initialFiles: boilerplate.files,
//                 dependencies: boilerplate.dependencies
//             };
//         }));
//     };

//     return (
//         <div className="ab-root animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* ── TOPBAR ── */}
//             <header className="ab-topbar">
//                 <div className="ab-topbar-left">
//                     <button className="ab-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                         <Menu size={20} />
//                     </button>
//                     <Tooltip content="Return to assessments list" placement="bottom">
//                         <button className="ab-back-btn" onClick={handleBackNavigation}>
//                             <ArrowLeft size={18} />
//                             <span className="ab-hide-mobile">Back</span>
//                         </button>
//                     </Tooltip>
//                 </div>
//                 <div className="ab-topbar-centre">
//                     <BookOpen size={16} className="ab-topbar-icon" />
//                     <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
//                     <span className={`ab-topbar-badge ${type.toLowerCase().replace(/ /g, '-')} ab-hide-mobile`}>{type}</span>

//                     {isLiveSyncing && (
//                         <span className="ab-topbar-badge active" style={{ animation: 'pulse 1.5s infinite', marginLeft: '8px' }}>
//                             <Activity size={12} style={{ marginRight: '4px' }} /> Syncing Remote Changes...
//                         </span>
//                     )}
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

//                     <Tooltip content="Share with other staff" placement="bottom">
//                         <button className={`ab-btn ab-btn-ghost ${collaboratorIds.length > 0 ? 'ab-btn-ghost--active' : ''}`} onClick={() => setShowCollaboratorModal(true)}>
//                             <Users size={15} />
//                             <span className="ab-hide-mobile">Share {collaboratorIds.length > 0 && `(${collaboratorIds.length})`}</span>
//                         </button>
//                     </Tooltip>

//                     {/* CLONE BUTTON */}
//                     {assessmentId && (
//                         <Tooltip content="Duplicate this workbook" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" onClick={handleClone}>
//                                 <Copy size={15} />
//                                 <span className="ab-hide-mobile">Clone</span>
//                             </button>
//                         </Tooltip>
//                     )}

//                     {assessmentId && (
//                         <Tooltip content="Preview what learners will see" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
//                                 <Eye size={15} />
//                                 <span className="ab-hide-mobile">Preview</span>
//                             </button>
//                         </Tooltip>
//                     )}

//                     {/* UNPUBLISH BUTTON */}
//                     {isDeployed && (
//                         <Tooltip content="Revert to Draft (Hide from Learners)" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleSave("force_draft")}>
//                                 <EyeOff size={15} />
//                                 <span className="ab-hide-mobile">Unpublish</span>
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
//                                         {user?.role === 'admin' && (
//                                             <Tooltip content="Create Blueprint" placement="top">
//                                                 <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
//                                                     <Plus size={13} /> New
//                                                 </button>
//                                             </Tooltip>
//                                         )}

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
//                                         <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => handleModuleTypeChange(e.target.value as any)}>
//                                             <option value="knowledge">Knowledge Module (Standard Questions)</option>
//                                             <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
//                                             <option value="workplace">Workplace Experience Module (Logbooks)</option>
//                                         </select>
//                                         <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
//                                     </div>
//                                     <div className="ab-form-group">
//                                         <label className="ab-fg-label">Assessment Type Category</label>
//                                         <select className="ab-input" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
//                                             <optgroup label="Formal QCTO Assessments">
//                                                 <option value="formative">Formative Assessment (Internal)</option>
//                                                 <option value="summative">Summative Assessment (Internal/FISA)</option>
//                                                 <option value="Practical Observation">Practical Observation</option>
//                                                 <option value="Workplace Logbook">Workplace Logbook</option>
//                                             </optgroup>
//                                             <optgroup label="Informal / Practice">
//                                                 <option value="Developmental Activity">Developmental Activity</option>
//                                                 <option value="Practice Set">Practice Set / Mock Exam</option>
//                                                 <option value="Task">Learning Task</option>
//                                             </optgroup>
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
//                                             <input
//                                                 type="number"
//                                                 min="0"
//                                                 className="ab-input"
//                                                 placeholder="60"
//                                                 value={moduleInfo.timeLimit ?? ""}
//                                                 onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })}
//                                             />
//                                         </div>
//                                         <span className="ab-input-hint">0 = no limit</span>
//                                     </FG>
//                                 </div>

//                                 <div>
//                                     <FG label="Learner Visibility & Release">
//                                         <div className="ab-form-group">
//                                             {/* REMOVED disabled={isDeployed} SO THEY CAN CHANGE RELEASE STATE ANYTIME */}
//                                             <select
//                                                 className="ab-input ab-input--accent"
//                                                 value={releaseState}
//                                                 onChange={(e) => setReleaseState(e.target.value as any)}
//                                             >
//                                                 <option value="active">Open Immediately (Active)</option>
//                                                 <option value="upcoming">Locked (Show as 'Coming Soon')</option>
//                                                 <option value="scheduled">Scheduled (Strict Live Countdown)</option>
//                                             </select>
//                                         </div>

//                                         {releaseState === "scheduled" && (
//                                             <>
//                                                 <div className="ab-row-gap" style={{ marginTop: '8px' }}>
//                                                     <Calendar size={15} className="ab-input-icon" />
//                                                     <input
//                                                         type="datetime-local"
//                                                         className="ab-input"
//                                                         value={scheduledDate}
//                                                         onChange={(e) => setScheduledDate(e.target.value)}
//                                                     />
//                                                 </div>
//                                                 {/* QUICK ACTION: CANCEL SCHEDULE */}
//                                                 {isDeployed && assessmentStatus === "scheduled" && (
//                                                     <button
//                                                         className="ab-text-btn"
//                                                         style={{ color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
//                                                         onClick={() => { setReleaseState("upcoming"); toast.info("Click 'Update' to securely lock the assessment and cancel the schedule."); }}
//                                                     >
//                                                         <Lock size={13} /> Cancel Schedule & Lock Assessment
//                                                     </button>
//                                                 )}
//                                             </>
//                                         )}
//                                         {releaseState === "upcoming" && (
//                                             <span className="ab-input-hint" style={{ color: 'var(--mlab-amber)', marginTop: '8px', display: 'block' }}>
//                                                 Learners will see this in their portfolio as "Coming Soon", but cannot open it until you change it to Active.
//                                             </span>
//                                         )}
//                                     </FG>
//                                 </div>

//                                 {/* Security Settings / Proctoring */}
//                                 <div className="ab-openbook-card" style={{ marginTop: '0', marginBottom: '1rem', borderLeftColor: moduleType === 'knowledge' ? '#e11d48' : '#cbd5e1', background: requiresInvigilation ? '#fff1f2' : undefined }}>
//                                     <label className={`ab-check-row ${moduleType !== 'knowledge' ? 'ab-disabled' : ''}`}>
//                                         <input
//                                             type="checkbox"
//                                             checked={requiresInvigilation}
//                                             onChange={(e) => setRequiresInvigilation(e.target.checked)}
//                                             disabled={moduleType !== 'knowledge' || isDeployed}
//                                             className="ab-checkbox"
//                                             style={requiresInvigilation ? { accentColor: '#e11d48' } : undefined}
//                                         />
//                                         <span className="ab-check-label" style={{ color: requiresInvigilation ? '#be123c' : 'inherit' }}>
//                                             <ShieldAlert size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
//                                             Enable Live Web Proctoring (Invigilation)
//                                         </span>
//                                     </label>
//                                     {moduleType !== 'knowledge' ? (
//                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px' }}>Live proctoring is automatically disabled for Practical and Workplace logbooks.</p>
//                                     ) : (
//                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px', color: requiresInvigilation ? '#9f1239' : 'inherit' }}>Locks the browser to fullscreen and records webcam snapshots of tab-switching violations.</p>
//                                     )}
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

//                                 {/* Cohort Assignment & Notifications */}
//                                 <div className="ab-fg">
//                                     <div className="ab-fg-header">
//                                         <label className="ab-fg-label">Assign to Cohorts</label>
//                                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                             {/* SELECT ALL TOGGLE BUTTON */}
//                                             {cohorts.length > 0 && (
//                                                 <button
//                                                     className="ab-text-btn"
//                                                     onClick={toggleSelectAllCohorts}
//                                                     style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
//                                                 >
//                                                     {cohortIds.length === cohorts.length ? <Square size={13} /> : <CheckSquareIcon size={13} />}
//                                                     {cohortIds.length === cohorts.length ? "Deselect All" : "Select All"}
//                                                 </button>
//                                             )}
//                                             {user?.role === 'admin' && (
//                                                 <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
//                                             )}
//                                         </div>
//                                     </div>

//                                     {/* Visual counter of selected cohorts */}
//                                     {cohortIds.length > 0 && (
//                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontWeight: 'bold' }}>
//                                             {cohortIds.length} Cohort(s) Selected
//                                         </div>
//                                     )}

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

//                                     {/* SILENT PUBLISH TOGGLE */}
//                                     <label className={`ab-check-row ${cohortIds.length === 0 ? 'ab-disabled' : ''}`} style={{ marginTop: '12px' }}>
//                                         <input
//                                             type="checkbox"
//                                             checked={sendNotification}
//                                             onChange={(e) => setSendNotification(e.target.checked)}
//                                             disabled={cohortIds.length === 0}
//                                             className="ab-checkbox ab-checkbox--amber"
//                                         />
//                                         <span className="ab-check-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Mail size={14} color={sendNotification ? "var(--mlab-blue)" : "var(--mlab-grey)"} />
//                                             Send email notification to newly assigned learners upon publishing
//                                         </span>
//                                     </label>

//                                 </div>

//                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />

//                                 <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                                     <ReactQuill
//                                         theme="snow"
//                                         value={instructions}
//                                         onChange={setInstructions}
//                                         readOnly={isDeployed}
//                                         modules={quillModules}
//                                         formats={quillFormats}
//                                         placeholder="Add instructions for learners…"
//                                     />
//                                 </div>
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

//                                 <FG label="Note to Learner">
//                                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                                         <ReactQuill
//                                             theme="snow"
//                                             value={learnerNote}
//                                             onChange={setLearnerNote}
//                                             readOnly={isDeployed}
//                                             modules={quillModules}
//                                             formats={quillFormats}
//                                             placeholder="Write a welcoming note or context for the learner…"
//                                         />
//                                     </div>
//                                 </FG>

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
//                                                     <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.replace(/<[^>]*>?/gm, '').slice(0, 40) || b.title || `Question ${i + 1}`}</span>
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
//                             <Tooltip content="Live Code Sandbox" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("code_sandbox")}><Code size={15} /></button></Tooltip>
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
//                                         <span className={`ab-mc-b type-${type.toLowerCase().replace(/ /g, '-')}`}>{type}</span>
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
//                                         onTemplateChange={handleTemplateChange}
//                                         key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} isDeployed={isDeployed}
//                                         onFocus={() => setFocusedBlock(b.id)} onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
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

//             {blockToRemove && (
//                 <StatusModal
//                     type="error"
//                     title="Remove Block"
//                     message="Are you sure you want to remove this block from the assessment?"
//                     confirmText="Remove"
//                     onClose={executeRemoveBlock}
//                     onCancel={() => setBlockToRemove(null)}
//                 />
//             )}

//             {showResetConfirm && (
//                 <StatusModal
//                     type="warning"
//                     title="Clear Module Info"
//                     message="Are you sure you want to clear all module fields? This will also remove any mapped topics."
//                     confirmText="Clear Fields"
//                     onClose={executeResetModuleInfo}
//                     onCancel={() => setShowResetConfirm(false)}
//                 />
//             )}

//             {/* COLLABORATOR MODAL */}
//             {showCollaboratorModal && createPortal(
//                 <div className="mlab-modal-overlay" onClick={() => setShowCollaboratorModal(false)}>
//                     <div className="mlab-modal-window mlab-modal-window--sm" onClick={e => e.stopPropagation()}>

//                         <div className="mlab-modal-header">
//                             <h2 className="mlab-modal-title">
//                                 <Users size={18} /> Manage Access
//                             </h2>
//                             <button className="mlab-modal-close" onClick={() => setShowCollaboratorModal(false)}>
//                                 <X size={20} />
//                             </button>
//                         </div>

//                         <div className="mlab-modal-body">
//                             <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                 Select staff who can view and edit this workbook.
//                             </p>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {staff.length === 0 ? (
//                                     <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', textAlign: 'center', margin: '2rem 0' }}>
//                                         No staff members found.
//                                     </p>
//                                 ) : (
//                                     staff.map((member: StaffMember) => {
//                                         const isCreator = member.id === creatorId || member.authUid === creatorId;
//                                         const isCurrentUser = member.id === user?.uid || member.authUid === user?.uid;

//                                         if (isCreator || isCurrentUser) return null;

//                                         const staffUid = member.authUid || member.id;
//                                         const isCollab = collaboratorIds.includes(staffUid);

//                                         return (
//                                             <label
//                                                 key={member.id}
//                                                 style={{
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     padding: '10px 12px',
//                                                     border: '1px solid',
//                                                     borderColor: isCollab ? 'var(--mlab-green)' : 'var(--mlab-border)',
//                                                     background: isCollab ? 'var(--mlab-green-bg)' : 'var(--mlab-bg)',
//                                                     cursor: 'pointer',
//                                                     transition: 'all 0.15s'
//                                                 }}
//                                             >
//                                                 <input
//                                                     type="checkbox"
//                                                     checked={isCollab}
//                                                     onChange={() => toggleCollaborator(staffUid)}
//                                                     style={{
//                                                         width: '16px',
//                                                         height: '16px',
//                                                         accentColor: 'var(--mlab-green)',
//                                                         marginRight: '12px',
//                                                         cursor: 'pointer'
//                                                     }}
//                                                 />
//                                                 <div style={{ flex: 1 }}>
//                                                     <span style={{
//                                                         display: 'block',
//                                                         fontFamily: 'var(--font-heading)',
//                                                         fontWeight: 600,
//                                                         letterSpacing: '0.05em',
//                                                         color: 'var(--mlab-blue)',
//                                                         fontSize: '0.9rem',
//                                                         textTransform: 'uppercase'
//                                                     }}>
//                                                         {member.fullName}
//                                                     </span>
//                                                     <span style={{ display: 'block', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'capitalize' }}>
//                                                         {member.role}
//                                                     </span>
//                                                 </div>
//                                             </label>
//                                         );
//                                     })
//                                 )}
//                             </div>
//                         </div>

//                         <div className="mlab-modal-footer">
//                             <button className="mlab-btn mlab-btn--primary" onClick={() => setShowCollaboratorModal(false)}>
//                                 Done
//                             </button>
//                         </div>

//                     </div>
//                 </div>,
//                 document.body
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
//     onTemplateChange: (blockId: string, templateKey: string) => void;
// }

// const BlockCard: React.FC<BlockCardProps> = ({
//     block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
//     onTemplateChange
// }) => {
//     const meta = BLOCK_META[block.type];
//     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

//     const [isUploadingImage, setIsUploadingImage] = useState(false);
//     const toast = useToast();

//     const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         setIsUploadingImage(true);
//         toast.info("Uploading image...");
//         try {
//             const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/block_images/${Date.now()}_${file.name}`), file);
//             task.on("state_changed", null, () => {
//                 toast.error("Image upload failed.");
//                 setIsUploadingImage(false);
//             }, async () => {
//                 const url = await getDownloadURL(task.snapshot.ref);
//                 onUpdate(block.id, "imageUrl", url);
//                 toast.success("Image attached!");
//                 setIsUploadingImage(false);
//             });
//         } catch {
//             toast.error("Upload failed.");
//             setIsUploadingImage(false);
//         }
//     };


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
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
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

//                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ marginBottom: '1rem', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
//                         <ReactQuill
//                             theme="snow"
//                             value={block.question || ""}
//                             onChange={(v) => onUpdate(block.id, "question", v)}
//                             readOnly={isDeployed}
//                             modules={quillModules}
//                             formats={quillFormats}
//                             placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type your question here (Supports multiple lines, formatting, and lists)…"}
//                         />
//                     </div>

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

//             {/* CODE SANDBOX (LIVE IDE) */}
//             {block.type === "code_sandbox" && (
//                 <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: "rgba(59, 130, 246, 0.18)", color: "#3b82f6" }}>IDE</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>

//                     <div className="ab-form-group">
//                         <label className="ab-field-lbl">Environment Template (Sandpack / Code Engine)</label>
//                         <select
//                             className="ab-input"
//                             value={block.template || "javascript"}
//                             onChange={(e) => onTemplateChange(block.id, e.target.value)}
//                             disabled={isDeployed}
//                         >
//                             <option value="javascript">JavaScript / TypeScript (Blank)</option>
//                             <option value="html">HTML / CSS / JS</option>
//                             <option value="create-react-app">React.js</option>
//                             <option value="node">Node.js (Backend Terminal)</option>
//                             <option value="python">Python (Terminal)</option>
//                             <option value="sql">SQL Database (Terminal)</option>
//                         </select>
//                     </div>

//                     {/* SQL ENGINE INJECTOR */}
//                     {block.template === "sql" && (
//                         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
//                             <strong><Database size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> Database Environment Boilerplate:</strong>
//                             <p style={{ margin: '4px 0 8px 0' }}>The runner executes raw SQL scripts sequentially. Inject a boilerplate structure containing sample table creations to get the learner started.</p>

//                             {!isDeployed && (
//                                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                     <button
//                                         className="ab-btn ab-btn-primary ab-btn-sm"
//                                         onClick={(e) => {
//                                             e.stopPropagation();
//                                             onUpdate(block.id, "dependencies", {});
//                                             onUpdate(block.id, "initialFiles", {
//                                                 "main.sql": "-- Run sequential SQL queries here\n\nCREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');\n\n-- Write your target SELECT query below:\nSELECT * FROM employees;\n"
//                                             });
//                                             toast.success("SQL Boilerplate loaded!");
//                                         }}
//                                     >
//                                         <Zap size={13} /> Inject Pure SQLite Script
//                                     </button>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     <div className="ab-form-group">
//                         <label className="ab-field-lbl">Challenge Instructions</label>
//                         <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ background: '#fff' }}>
//                             <ReactQuill
//                                 theme="snow"
//                                 value={block.question || ""}
//                                 onChange={(v) => onUpdate(block.id, "question", v)}
//                                 readOnly={isDeployed}
//                                 modules={quillModules}
//                                 formats={quillFormats}
//                                 placeholder="Describe the app or script the learner needs to build..."
//                             />
//                         </div>
//                     </div>

//                     <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
//                         <Info size={13} style={{ marginBottom: '-2px', marginRight: '4px' }} />
//                         <strong>Note:</strong> React/HTML tasks will open in an interactive browser preview. Python, Node, and SQL tasks will open in a secure terminal engine runner.
//                     </div>
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
//                         <input type="text" className="ab-input" value={block.title || ""} onChange={(e) => e.target.value ? onUpdate(block.id, "title", e.target.value) : onUpdate(block.id, "title", "")} placeholder="e.g. PA0101 Demonstrate the use of…" />
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
//                                     {!isDeployed && <button className="ab-btn-transform-danger" onClick={() => removeCriterion(i)}><X size={15} /></button>}
//                                 </div>
//                                 <div className="ab-criterion-preview-stack">
//                                     {block.requireEvidencePerCriterion !== false && (
//                                         <div className="ab-criterion-preview"><UploadCloud size={13} /><em>Learner uploads evidence here…</em></div>
//                                     )}
//                                     {block.requirePerCriterionTiming !== false && (
//                                         <div className="ab-criterion-timer">
//                                             <Timer size={13} /><span className="ab-criterion-timer-label">Task Timer:</span>
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
//                     <div className="ab-q-top"><span className="ab-q-num" style={{ background: "rgba(249,115,22,.18)", color: "#fb923c" }}>LOG</span></div>
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
//                     </div>
//                 </div>
//             )}

//             {/* BLOCK IMAGE ATTACHMENT ZONE */}
//             {["text", "mcq", "task", "info", "section", "code_sandbox"].includes(block.type) && (
//                 <div style={{ padding: "0 20px 20px 20px" }}>
//                     {!block.imageUrl && !isUploadingImage ? (
//                         <label className="ab-image-toggle">
//                             <ImageIcon size={14} /> Attach Context Image
//                             <input type="file" accept="image/*" hidden disabled={isDeployed} onChange={handleImageUpload} />
//                         </label>
//                     ) : isUploadingImage ? (
//                         <div className="ab-image-upload-zone">
//                             <div className="ab-spinner" style={{ margin: '0 auto', marginBottom: '8px', width: '20px', height: '20px' }} />
//                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Uploading Image...</span>
//                         </div>
//                     ) : (
//                         <div className="ab-image-upload-zone has-image" onClick={(e) => e.stopPropagation()}>
//                             <img src={block.imageUrl} alt="Attached context" className="ab-image-preview" />
//                             <div className="ab-image-meta">
//                                 <input
//                                     className="ab-caption-input"
//                                     placeholder="Add an optional caption or source credit..."
//                                     value={block.imageCaption || ""}
//                                     disabled={isDeployed}
//                                     onChange={(e) => onUpdate(block.id, "imageCaption", e.target.value)}
//                                 />
//                                 {!isDeployed && (
//                                     <button
//                                         className="ab-btn-text ab-btn-text--rose"
//                                         style={{ alignSelf: "flex-start", padding: 0 }}
//                                         onClick={() => { onUpdate(block.id, "imageUrl", ""); onUpdate(block.id, "imageCaption", ""); }}
//                                     >
//                                         <Trash2 size={12} style={{ marginRight: '4px' }} /> Remove Image
//                                     </button>
//                                 )}
//                             </div>
//                         </div>
//                     )}
//                 </div>
//             )}
//         </div>
//     );
// };

// // ─── UTILITY COMPONENTS ───────────────────────────────────────────────────────
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



// // src/components/views/AssessmentBuilder/AssessmentBuilder.tsx

// import React, { useState, useEffect, useRef } from "react";
// import { useNavigate, useParams, useLocation } from "react-router-dom";
// import {
//     collection, doc, setDoc, writeBatch, query, where, getDocs, onSnapshot
// } from "firebase/firestore";
// import {
//     getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
// } from "firebase/storage";
// import { getFunctions, httpsCallable } from "firebase/functions";
// import { db } from "../../../lib/firebase";
// import { useStore, type StaffMember } from "../../../store/useStore";
// import {
//     ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
//     FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
//     BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
//     Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
//     Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive, ShieldAlert, Image as ImageIcon,
//     Users, Activity, Mail, Copy, CheckSquare as CheckSquareIcon, Square
// } from "lucide-react";
// import Tooltip from "../../../components/common/Tooltip/Tooltip";
// import type { Cohort, ProgrammeTemplate, DashboardLearner, StackBlitzTemplate } from "../../../types";
// import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
// import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
// import ReactQuill from "react-quill-new";
// import "react-quill-new/dist/quill.snow.css";
// import "./AssessmentBuilder.css";
// import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";
// import { StatusModal } from "../../../components/common/StatusModal/StatusModal";
// import { createPortal } from "react-dom";

// const quillModules = {
//     toolbar: [
//         ["bold", "italic", "underline", "code-block"],
//         [{ list: "ordered" }, { list: "bullet" }],
//         ["clean"],
//     ],
// };
// const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

// export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace" | "code_sandbox";

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
//     imageUrl?: string;
//     imageCaption?: string;

//     // Code Sandbox Properties ---
//     template?: "create-react-app" | "node" | "javascript" | "typescript" | "html" | "python" | "sql";
//     initialFiles?: Record<string, string>;
//     dependencies?: Record<string, string>;
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

// // The configuration set by the Facilitator
// export interface CodeSandboxConfig {
//     // The engine to boot up
//     template: StackBlitzTemplate;

//     // Key-Value pair of file paths to raw code strings.
//     // If blank slate, this might just be { "src/index.js": "// Start coding..." }
//     initialFiles: Record<string, string>;

//     // Optional: Pre-install specific NPM packages (e.g., { "axios": "^1.6.0" })
//     dependencies?: Record<string, string>;
// }

// // How it fits into your existing block schema
// export interface CodeSandboxBlock {
//     id: string;
//     type: 'code_sandbox';
//     title: string;
//     instructions?: string; // e.g., "Build a calculator app with React"
//     marks: number;
//     config: CodeSandboxConfig;
// }

// // The payload saved to Firebase when the learner submits
// export interface CodeSandboxAnswer {
//     // A complete dump of their working directory tree
//     // e.g., { "src/App.jsx": "...", "src/styles.css": "...", "package.json": "..." }
//     snapshot: Record<string, string>;

//     // Track when they last ran the code or saved
//     lastSavedAt: string;
// }

// type AssessmentStatusType = "draft" | "upcoming" | "scheduled" | "active" | "completed";

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
//     // the code sandbox meta 
//     code_sandbox: { label: "Code Sandbox", color: "#3b82f6", icon: <Code size={14} />, desc: "Live embedded IDE for coding assessments" },
// };

// const CODESANDBOX_BOILERPLATES: Record<string, { files: Record<string, string>; dependencies: Record<string, string> }> = {
//     javascript: {
//         files: { "index.js": "// Pure JavaScript\nconsole.log('Vanilla JS workspace ready.');" },
//         dependencies: {}
//     },
//     typescript: {
//         files: { "index.ts": "// TypeScript workspace\nconst msg: string = 'TS ready!';\nconsole.log(msg);" },
//         dependencies: {}
//     },
//     html: {
//         files: {
//             "index.html": "<!DOCTYPE html><html><body><div id='app'></div><script src='index.js'></script></body></html>",
//             "index.js": "console.log('DOM Sandbox ready.');"
//         },
//         dependencies: {}
//     },
//     "create-react-app": {
//         files: {
//             "public/index.html": "<!DOCTYPE html><html><body><div id='root'></div></body></html>",
//             "src/index.js": "import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nconst root = createRoot(document.getElementById('root'));\nroot.render(<App />);",
//             "src/App.js": "import React from 'react';\nexport default function App() { return <h1>React Blueprint Working!</h1>; }"
//         },
//         dependencies: { "react": "^18.2.0", "react-dom": "^18.2.0" }
//     }
// };

// export const AssessmentBuilder: React.FC = () => {
//     const { assessmentId } = useParams();
//     const navigate = useNavigate();
//     const location = useLocation();
//     const toast = useToast();
//     const {
//         user,
//         staff,
//         cohorts,
//         learners,
//         programmes,
//         fetchCohorts,
//         fetchLearners,
//         fetchProgrammes,
//         fetchStaff
//     } = useStore();

//     const [loading, setLoading] = useState(false);
//     const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
//     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
//     const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
//     const [lastSaved, setLastSaved] = useState<Date | null>(null);
//     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
//     const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
//     const [isLiveSyncing, setIsLiveSyncing] = useState(false);

//     const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
//     const [showResetConfirm, setShowResetConfirm] = useState(false);

//     const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");
//     const [sendNotification, setSendNotification] = useState(true);

//     const statusRef = useRef<AssessmentStatusType>("draft");
//     useEffect(() => { statusRef.current = assessmentStatus; }, [assessmentStatus]);

//     const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
//     const [selectedModuleCode, setSelectedModuleCode] = useState("");
//     const [showProgrammeModal, setShowProgrammeModal] = useState(false);
//     const [showCohortModal, setShowCohortModal] = useState(false);
//     const [title, setTitle] = useState("");

//     const [cohortIds, setCohortIds] = useState<string[]>([]);
//     const [notifiedCohortIds, setNotifiedCohortIds] = useState<string[]>([]);

//     const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
//     const [instructions, setInstructions] = useState("");
//     const [creatorId, setCreatorId] = useState<string | null>(null);
//     const [publisherId, setPublisherId] = useState<string | null>(null);
//     const [autoCloseTaskId, setAutoCloseTaskId] = useState<string | null>(null);

//     const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook" | "Developmental Activity" | "Practice Set" | "Task">("formative");
//     const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");

//     const [requiresInvigilation, setRequiresInvigilation] = useState(true);
//     const [isOpenBook, setIsOpenBook] = useState(false);
//     const [referenceManualUrl, setReferenceManualUrl] = useState("");
//     const [isUploadingManual, setIsUploadingManual] = useState(false);

//     const [releaseState, setReleaseState] = useState<"active" | "upcoming" | "scheduled">("active");
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

//     const isDeployed = (assessmentStatus === "active" || assessmentStatus === "completed" || assessmentStatus === "scheduled" || assessmentStatus === "upcoming") && assessmentId !== undefined;
//     const isInitialLoad = useRef(true);

//     const handleBackNavigation = () => {
//         if (window.history.state && window.history.state.idx > 0) {
//             navigate(-1);
//         } else {
//             navigate('/facilitator/assessments', { replace: true });
//         }
//     };

//     const handleClone = () => {
//         if (!window.confirm("Duplicate this workbook? You will be redirected to a new, unsaved copy.")) return;

//         const cloneData = {
//             title: title + " (Copy)",
//             type, moduleType, instructions, requiresInvigilation, isOpenBook, referenceManualUrl, showModuleHeader,
//             moduleInfo, learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
//             selectedProgrammeId, selectedModuleCode, topics, blocks, releaseState
//         };

//         navigate('/facilitator/assessments/builder', { state: { cloneData } });
//     };

//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (programmes.length === 0) fetchProgrammes();
//         if (staff.length === 0) fetchStaff();

//         if (!assessmentId) {
//             if (location.state?.cloneData && isInitialLoad.current) {
//                 const cd = location.state.cloneData;
//                 setTitle(cd.title);
//                 setType(cd.type);
//                 setModuleType(cd.moduleType);
//                 setInstructions(cd.instructions);
//                 setRequiresInvigilation(cd.requiresInvigilation);
//                 setIsOpenBook(cd.isOpenBook);
//                 setReferenceManualUrl(cd.referenceManualUrl);
//                 setShowModuleHeader(cd.showModuleHeader);
//                 setModuleInfo(cd.moduleInfo);
//                 setLearnerNote(cd.learnerNote);
//                 setModulePurpose(cd.modulePurpose);
//                 setEntryRequirements(cd.entryRequirements);
//                 setProviderRequirements(cd.providerRequirements);
//                 setExemptions(cd.exemptions);
//                 setStakeholderGuidelines(cd.stakeholderGuidelines);
//                 setSelectedProgrammeId(cd.selectedProgrammeId);
//                 setSelectedModuleCode(cd.selectedModuleCode);
//                 setReleaseState(cd.releaseState || "active");

//                 const newTopics = cd.topics.map((t: any) => ({ ...t, id: mkId() }));
//                 setTopics(newTopics);

//                 const newBlocks = cd.blocks.map((b: any) => {
//                     const newId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
//                     let newLinkedTopicId = b.linkedTopicId;
//                     if (b.linkedTopicId) {
//                         const oldTopicIdx = cd.topics.findIndex((t: any) => t.id === b.linkedTopicId);
//                         if (oldTopicIdx !== -1) newLinkedTopicId = newTopics[oldTopicIdx].id;
//                     }
//                     return { ...b, id: newId, linkedTopicId: newLinkedTopicId };
//                 });
//                 setBlocks(newBlocks);

//                 setCreatorId(user?.uid || null);
//                 setAutoCloseTaskId(null);
//                 setSaveStatus("unsaved");
//                 isInitialLoad.current = false;

//                 window.history.replaceState({}, document.title);
//             } else {
//                 setCreatorId(user?.uid || null);
//             }
//             return;
//         }

//         setLoading(true);

//         const unsubscribe = onSnapshot(doc(db, "assessments", assessmentId), (snap) => {
//             if (snap.exists()) {
//                 const d = snap.data();

//                 let formattedDate = "";
//                 if (d.scheduledDate) {
//                     try {
//                         const dt = new Date(d.scheduledDate);
//                         if (!isNaN(dt.getTime())) {
//                             const p = (n: number) => n.toString().padStart(2, "0");
//                             formattedDate = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
//                         } else {
//                             formattedDate = d.scheduledDate;
//                         }
//                     } catch {
//                         formattedDate = d.scheduledDate;
//                     }
//                 }

//                 if (isInitialLoad.current) {
//                     setTitle(d.title || "");
//                     setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
//                     setNotifiedCohortIds(d.notifiedCohortIds || []);
//                     setCollaboratorIds(d.collaboratorIds || []);
//                     setCreatorId(d.createdBy || d.facilitatorId || null);
//                     setPublisherId(d.publishedBy || null);
//                     setAutoCloseTaskId(d.autoCloseTaskId || null);
//                     setInstructions(d.instructions || "");
//                     setType(d.type || "formative");
//                     setModuleType(d.moduleType || "knowledge");
//                     setAssessmentStatus(d.status || "draft");
//                     setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
//                     setIsOpenBook(d.isOpenBook || false);
//                     setReferenceManualUrl(d.referenceManualUrl || "");

//                     if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
//                     else if (d.status === "upcoming") setReleaseState("upcoming");
//                     else setReleaseState("active");

//                     setScheduledDate(formattedDate);
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

//                     isInitialLoad.current = false;
//                     setLoading(false);
//                 } else {
//                     if (d.lastUpdatedBy && d.lastUpdatedBy !== user?.uid) {
//                         setIsLiveSyncing(true);
//                         toast.info("A collaborator updated the workbook. Syncing changes...");

//                         setAssessmentStatus(d.status || "draft");
//                         setType(d.type || "formative");
//                         setModuleType(d.moduleType || "knowledge");
//                         setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
//                         setIsOpenBook(d.isOpenBook || false);
//                         setReferenceManualUrl(d.referenceManualUrl || "");
//                         setAutoCloseTaskId(d.autoCloseTaskId || null);

//                         if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
//                         else if (d.status === "upcoming") setReleaseState("upcoming");
//                         else setReleaseState("active");

//                         setBlocks(d.blocks || []);
//                         if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
//                         setTitle(d.title || "");
//                         setCollaboratorIds(d.collaboratorIds || []);
//                         setNotifiedCohortIds(d.notifiedCohortIds || []);
//                         setInstructions(d.instructions || "");
//                         setModuleInfo(d.moduleInfo || {});

//                         setSaveStatus("saved");
//                         setLastSaved(new Date(d.lastUpdated || d.createdAt));

//                         setTimeout(() => setIsLiveSyncing(false), 2000);
//                     }
//                 }
//             } else {
//                 toast.error("Assessment not found or was deleted by a collaborator.");
//                 navigate("/facilitator/assessments");
//             }
//         }, (err) => {
//             console.error("Real-time listener error:", err);
//             toast.error("Lost connection to the live workbook.");
//             setLoading(false);
//         });

//         return () => unsubscribe();
//     }, [assessmentId, user?.uid, location.state]);

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
//         if (!assessmentId || isInitialLoad.current) return;
//         setSaveStatus("unsaved");

//         const t = setTimeout(() => {
//             if (saveStatus === "unsaved" && !loading) {
//                 handleSave(statusRef.current, true);
//             }
//         }, 15000);

//         return () => clearTimeout(t);
//     }, [
//         title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//         stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
//         scheduledDate, releaseState, isOpenBook, referenceManualUrl, requiresInvigilation,
//         collaboratorIds, assessmentStatus
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

//     const handleModuleTypeChange = (newType: "knowledge" | "practical" | "workplace") => {
//         setModuleType(newType);
//         if (newType !== 'knowledge') {
//             setRequiresInvigilation(false);
//         } else {
//             setRequiresInvigilation(true);
//         }
//     };

//     const handleTypeChange = (newType: string) => {
//         setType(newType as any);
//         if (["Developmental Activity", "Practice Set", "Task"].includes(newType)) {
//             setRequiresInvigilation(false);
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

//     const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
//         try {
//             const newRef = doc(collection(db, "programmes"));
//             const id = newRef.id;

//             await setDoc(
//                 newRef,
//                 { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
//                 { merge: true },
//             );

//             toast.success("Blueprint created!");
//             setShowProgrammeModal(false);
//             await fetchProgrammes();
//             setSelectedProgrammeId(id);
//             setSelectedModuleCode("");
//         } catch (err: any) {
//             toast.error(`Error saving blueprint: ${err.message}`);
//         }
//     };

//     const toggleSelectAllCohorts = () => {
//         if (cohortIds.length === cohorts.length) {
//             setCohortIds([]); // Deselect all
//         } else {
//             setCohortIds(cohorts.map(c => c.id)); // Select all
//         }
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
//         } else if (actualType === "code_sandbox") {
//             //  Default state for a  Code Sandbox
//             nb.title = "Practical Coding Task";
//             nb.question = "Follow the instructions and write your solution in the editor below:";
//             nb.template = "javascript"; // Default to basic JS environment
//             nb.marks = 20;
//             nb.initialFiles = {
//                 "index.js": "// Start coding here...\nconsole.log('Hello World!');"
//             };
//             nb.dependencies = {};
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
//         setBlockToRemove(id);
//     };

//     const executeRemoveBlock = () => {
//         if (!blockToRemove) return;
//         setBlocks((p) => p.filter((b) => b.id !== blockToRemove));
//         setFocusedBlock(null);
//         toast.info("Block removed");
//         setBlockToRemove(null);
//     };

//     const resetModuleInfo = () => {
//         setShowResetConfirm(true);
//     };

//     const executeResetModuleInfo = () => {
//         setModuleInfo({
//             title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
//             occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
//         });
//         setSelectedProgrammeId("");
//         setSelectedModuleCode("");
//         setTopics([]);
//         setShowResetConfirm(false);
//     };

//     const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
//         const i = p.findIndex((b) => b.id === id);
//         if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
//         const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
//         [n[i], n[sw]] = [n[sw], n[i]];
//         return n;
//     });

//     const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
//     const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
//     const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

//     const handleSave = async (status: AssessmentStatusType | "force_draft", isAutoSave = false) => {
//         if (!title.trim() && !isAutoSave) {
//             toast.warning("Please enter a Workbook Title.");
//             return;
//         }

//         if (cohortIds.length === 0 && !isAutoSave && (status === "active" || status === "scheduled" || status === "upcoming")) {
//             toast.warning("Please select at least one Cohort to publish this to.");
//             return;
//         }

//         if (!isAutoSave) setLoading(true);
//         setSaveStatus("saving");

//         try {
//             const sanitizedBlocks = blocks.map((b) => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.imageUrl) c.imageUrl = b.imageUrl;
//                 if (b.imageCaption) c.imageCaption = b.imageCaption;
//                 if (b.linkedTopicId) {
//                     const t = topics.find((tp) => tp.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }
//                 if (b.type === "section") { c.title = b.title || "Untitled Section"; c.content = b.content || ""; }
//                 if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
//                 if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
//                 if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
//                 if (b.type === "mcq") { c.options = b.options || ["", "", "", ""]; c.correctOption = b.correctOption || 0; }
//                 if (b.type === "checklist") {
//                     c.criteria = b.criteria || [];
//                     c.requireTimeTracking = b.requireTimeTracking !== false;
//                     c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
//                     c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
//                     c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
//                 }
//                 if (b.type === "qcto_workplace") {
//                     c.weCode = b.weCode || ""; c.weTitle = b.weTitle || "";
//                     c.workActivities = b.workActivities || [];
//                     c.requireSelfAssessment = b.requireSelfAssessment !== false;
//                     c.requireGoalPlanning = b.requireGoalPlanning !== false;
//                 }
//                 if (b.type === "task") {
//                     c.allowText = b.allowText; c.allowUpload = b.allowUpload; c.allowAudio = b.allowAudio;
//                     c.allowUrl = b.allowUrl; c.allowCode = b.allowCode; c.allowedFileTypes = b.allowedFileTypes;
//                     c.codeLanguage = b.codeLanguage;
//                 }

//                 // Sanitize Code Sandbox
//                 if (b.type === "code_sandbox") {
//                     c.question = b.question || "";
//                     c.template = b.template || "javascript";
//                     c.initialFiles = b.initialFiles || {};
//                     c.dependencies = b.dependencies || {};
//                 }
//                 return c;
//             });

//             let finalStatus: AssessmentStatusType = status === "force_draft" ? "draft" : status;
//             let finalScheduledDate: string | null = null;

//             if (releaseState === "scheduled" && scheduledDate) {
//                 finalScheduledDate = new Date(scheduledDate).toISOString();
//             }

//             if (isAutoSave) {
//                 finalStatus = statusRef.current;
//             } else if (isDeployed && status === "draft") {
//                 finalStatus = statusRef.current;
//             } else if (status === "active") {
//                 if (releaseState === "scheduled" && finalScheduledDate) finalStatus = "scheduled";
//                 else if (releaseState === "upcoming") finalStatus = "upcoming";
//                 else finalStatus = "active";
//             } else if (status === "force_draft") {
//                 if (!window.confirm("Are you sure you want to unpublish this workbook? It will be hidden from learners and reverted to a Draft.")) {
//                     setSaveStatus("saved");
//                     setLoading(false);
//                     return;
//                 }
//                 finalStatus = "draft";
//                 finalScheduledDate = null;
//                 setReleaseState("active");
//                 setScheduledDate("");
//             }

//             let targetDocId = assessmentId;

//             if (!targetDocId) {
//                 const sanitizedModuleCode = selectedModuleCode ? selectedModuleCode.replace(/[\s/]+/g, "-").toUpperCase() : null;
//                 const sanitizedType = type ? type.replace(/[\s/]+/g, "-").toLowerCase() : null;

//                 const baseComposite = (sanitizedModuleCode && sanitizedType)
//                     ? `${sanitizedModuleCode}_${sanitizedType}`
//                     : null;

//                 const uniqueTag = Math.random().toString(36).slice(2, 6).toUpperCase();

//                 targetDocId = baseComposite ? `${baseComposite}_${uniqueTag}` : doc(collection(db, "assessments")).id;
//             }

//             // GOOGLE CLOUD TASKS: Auto-Sweeper Scheduling
//             // Only schedule the task if it is genuinely published as 'scheduled'.
//             // If it is 'draft' or 'force_draft', we aggressively cancel existing tasks and do not create new ones.
//             let newTaskId = autoCloseTaskId;
//             try {
//                 const functions = getFunctions();

//                 // If unpublishing OR saving as draft, cancel any existing task immediately
//                 if ((status === "force_draft" || finalStatus === "draft") && autoCloseTaskId) {
//                     const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
//                     await cancelTask({ taskId: autoCloseTaskId }).catch((e) => console.log(e));
//                     newTaskId = null;
//                     setAutoCloseTaskId(null);
//                 }
//                 // If genuinely publishing/scheduling, calculate the end time and create the task
//                 else if (finalStatus === "scheduled" && releaseState === "scheduled" && finalScheduledDate && moduleInfo.timeLimit) {
//                     const startTime = new Date(finalScheduledDate);
//                     const endTimeMs = startTime.getTime() + (moduleInfo.timeLimit * 60000);
//                     const endTime = new Date(endTimeMs);

//                     // Only schedule if the end time is genuinely in the future
//                     if (endTime.getTime() > Date.now()) {
//                         // Cancel any old task first just in case dates changed
//                         if (autoCloseTaskId) {
//                             const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
//                             await cancelTask({ taskId: autoCloseTaskId }).catch(() => { });
//                         }

//                         const scheduleTask = httpsCallable(functions, "scheduleAssessmentSweep");
//                         const res = await scheduleTask({
//                             assessmentId: targetDocId,
//                             scheduledEndTimeISO: endTime.toISOString()
//                         });
//                         newTaskId = (res.data as any).taskId;
//                         setAutoCloseTaskId(newTaskId);
//                     }
//                 }
//             } catch (err) {
//                 console.error("Failed to manage Cloud Tasks for Auto-Sweep:", err);
//                 if (!isAutoSave) toast.warning("Saved, but failed to sync timer with Cloud Tasks. Check logs.");
//             }

//             const isFirstPublish = finalStatus !== "draft" && statusRef.current === "draft";
//             const unnotifiedCohorts = cohortIds.filter(id => !notifiedCohortIds.includes(id));
//             const isReadyToNotify = ["active", "scheduled", "upcoming"].includes(finalStatus) && status !== "force_draft";

//             const nextNotifiedArray = (isReadyToNotify && unnotifiedCohorts.length > 0)
//                 ? [...notifiedCohortIds, ...unnotifiedCohorts]
//                 : notifiedCohortIds;

//             const payload: any = {
//                 id: targetDocId,
//                 title, type, moduleType, cohortIds,
//                 notifiedCohortIds: nextNotifiedArray,
//                 collaboratorIds,
//                 linkedProgrammeId: selectedProgrammeId,
//                 linkedModuleCode: selectedModuleCode,
//                 scheduledDate: finalScheduledDate,
//                 isScheduled: releaseState === "scheduled",
//                 instructions: instructions || "",
//                 requiresInvigilation: moduleType === 'knowledge' ? requiresInvigilation : false,
//                 moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
//                 learnerGuide: {
//                     note: learnerNote, purpose: modulePurpose, entryRequirements,
//                     providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
//                 },
//                 topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
//                 lastUpdated: new Date().toISOString(),
//                 lastUpdatedBy: user?.uid,
//                 isWorkbook: true,
//                 autoCloseTaskId: newTaskId || null,
//             };

//             if (targetDocId !== assessmentId) {
//                 payload.createdAt = new Date().toISOString();
//             }

//             if (creatorId) {
//                 payload.createdBy = creatorId;
//                 payload.facilitatorId = creatorId;
//             } else {
//                 payload.createdBy = user?.uid;
//                 payload.facilitatorId = user?.uid;
//             }

//             if (isFirstPublish) {
//                 payload.publishedBy = user?.uid;
//             } else if (publisherId) {
//                 payload.publishedBy = publisherId;
//             }

//             const batch = writeBatch(db);

//             const assessmentRef = doc(db, "assessments", targetDocId);
//             batch.set(assessmentRef, payload, { merge: true });

//             if (["active", "scheduled", "upcoming", "completed"].includes(finalStatus)) {
//                 const allEnrollments: any[] = [];
//                 for (const cid of cohortIds) {
//                     const enrolQuery = query(collection(db, "enrollments"), where("cohortId", "==", cid), where("status", "==", "active"));
//                     const enrolSnap = await getDocs(enrolQuery);
//                     enrolSnap.docs.forEach(d => allEnrollments.push({ id: d.id, ...d.data() }));
//                 }

//                 if (allEnrollments.length > 0) {
//                     const existingSubQuery = query(collection(db, "learner_submissions"), where("assessmentId", "==", targetDocId));
//                     const existingSubSnap = await getDocs(existingSubQuery);
//                     const existingIds = new Set(existingSubSnap.docs.map((d) => d.id));

//                     allEnrollments.forEach((enrol) => {
//                         const targetLearnerId = enrol.learnerId || enrol.id;
//                         const sid = `${enrol.cohortId}_${targetLearnerId}_${targetDocId}`;
//                         const ref = doc(db, "learner_submissions", sid);

//                         const subData: any = {
//                             title: payload.title,
//                             type: payload.type,
//                             moduleType: payload.moduleType,
//                             totalMarks: payload.totalMarks,
//                             moduleNumber: payload.moduleInfo?.moduleNumber || "",
//                             updatedAt: new Date().toISOString()
//                         };

//                         if (!existingIds.has(sid)) {
//                             batch.set(ref, {
//                                 ...subData,
//                                 learnerId: targetLearnerId,
//                                 enrollmentId: enrol.id,
//                                 authUid: targetLearnerId,
//                                 assessmentId: targetDocId,
//                                 cohortId: enrol.cohortId,
//                                 status: "not_started",
//                                 assignedAt: new Date().toISOString(),
//                                 marks: 0,
//                                 createdAt: new Date().toISOString(),
//                                 createdBy: user?.uid || "System",
//                             });
//                         } else {
//                             batch.set(ref, subData, { merge: true });
//                         }
//                     });
//                 }
//             }

//             await batch.commit();

//             if (isReadyToNotify && unnotifiedCohorts.length > 0 && !isAutoSave) {
//                 if (sendNotification) {
//                     const inviteDate = finalScheduledDate;
//                     toast.info(`Sending email notifications to ${unnotifiedCohorts.length} assigned cohort(s)...`);

//                     try {
//                         const functions = getFunctions();
//                         const sendCalendarInvites = httpsCallable(functions, "sendAssessmentCalendarInvites");

//                         sendCalendarInvites({
//                             assessmentId: targetDocId,
//                             title: payload.title,
//                             scheduledDate: inviteDate,
//                             timeLimit: payload.moduleInfo?.timeLimit || 60,
//                             cohortIds: unnotifiedCohorts,
//                             platformLink: `${window.location.origin}/learner/assessment/${targetDocId}`,
//                             moduleType: payload.moduleType,
//                             assessmentType: payload.type,
//                             moduleNumber: payload.moduleInfo?.moduleNumber,
//                             qualificationTitle: payload.moduleInfo?.qualificationTitle
//                         }).then(() => {
//                             toast.success("Learners notified successfully.");
//                             setNotifiedCohortIds(nextNotifiedArray);
//                         }).catch(err => {
//                             console.error("Cloud function error:", err);
//                             toast.error("Workbook saved, but notification failed to send.");
//                         });
//                     } catch (err) {
//                         console.error("Failed to call cloud function:", err);
//                     }
//                 } else {
//                     setNotifiedCohortIds(nextNotifiedArray);
//                     toast.success("Workbook published silently (no emails sent).");
//                 }
//             } else if (!isAutoSave) {
//                 if (status === "force_draft") toast.success("Workbook Unpublished & Reverted to Draft!");
//                 else if (finalStatus === "active") toast.success("Workbook Published & Updated!");
//                 else if (finalStatus === "scheduled") toast.success("Workbook Scheduled Successfully!");
//                 else if (finalStatus === "upcoming") toast.success("Workbook Saved as Coming Soon!");
//                 else toast.success("Draft saved!");
//             }

//             setAssessmentStatus(finalStatus);
//             if (isFirstPublish) setPublisherId(user?.uid || null);
//             if (!creatorId) setCreatorId(user?.uid || null);

//             setSaveStatus("saved");
//             setLastSaved(new Date());

//             if (!isAutoSave && targetDocId !== assessmentId) {
//                 navigate(`/facilitator/assessments/builder/${targetDocId}`, { replace: true });
//             }

//         } catch (err: any) {
//             console.error("[SAVE ERROR]:", err);
//             setSaveStatus("unsaved");
//             if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
//         } finally {
//             if (!isAutoSave) setLoading(false);
//         }
//     };


//     const toggleCollaborator = (staffId: string) => {
//         setCollaboratorIds(prev => {
//             if (prev.includes(staffId)) return prev.filter(id => id !== staffId);
//             return [...prev, staffId];
//         });
//     };

//     const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

//     const handleTemplateChange = (blockId: string, templateKey: string) => {
//         const boilerplate = CODESANDBOX_BOILERPLATES[templateKey] || CODESANDBOX_BOILERPLATES.javascript;

//         setBlocks((prev) => prev.map((b) => {
//             if (b.id !== blockId) return b;
//             return {
//                 ...b,
//                 template: templateKey as any,
//                 initialFiles: boilerplate.files,
//                 dependencies: boilerplate.dependencies
//             };
//         }));
//     };

//     return (
//         <div className="ab-root animate-fade-in">
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             {/* ── TOPBAR ── */}
//             <header className="ab-topbar">
//                 <div className="ab-topbar-left">
//                     <button className="ab-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
//                         <Menu size={20} />
//                     </button>
//                     <Tooltip content="Return to assessments list" placement="bottom">
//                         <button className="ab-back-btn" onClick={handleBackNavigation}>
//                             <ArrowLeft size={18} />
//                             <span className="ab-hide-mobile">Back</span>
//                         </button>
//                     </Tooltip>
//                 </div>
//                 <div className="ab-topbar-centre">
//                     <BookOpen size={16} className="ab-topbar-icon" />
//                     <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
//                     <span className={`ab-topbar-badge ${type.toLowerCase().replace(/ /g, '-')} ab-hide-mobile`}>{type}</span>

//                     {isLiveSyncing && (
//                         <span className="ab-topbar-badge active" style={{ animation: 'pulse 1.5s infinite', marginLeft: '8px' }}>
//                             <Activity size={12} style={{ marginRight: '4px' }} /> Syncing Remote Changes...
//                         </span>
//                     )}
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

//                     <Tooltip content="Share with other staff" placement="bottom">
//                         <button className={`ab-btn ab-btn-ghost ${collaboratorIds.length > 0 ? 'ab-btn-ghost--active' : ''}`} onClick={() => setShowCollaboratorModal(true)}>
//                             <Users size={15} />
//                             <span className="ab-hide-mobile">Share {collaboratorIds.length > 0 && `(${collaboratorIds.length})`}</span>
//                         </button>
//                     </Tooltip>

//                     {/* CLONE BUTTON */}
//                     {assessmentId && (
//                         <Tooltip content="Duplicate this workbook" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" onClick={handleClone}>
//                                 <Copy size={15} />
//                                 <span className="ab-hide-mobile">Clone</span>
//                             </button>
//                         </Tooltip>
//                     )}

//                     {assessmentId && (
//                         <Tooltip content="Preview what learners will see" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
//                                 <Eye size={15} />
//                                 <span className="ab-hide-mobile">Preview</span>
//                             </button>
//                         </Tooltip>
//                     )}

//                     {/* UNPUBLISH BUTTON */}
//                     {isDeployed && (
//                         <Tooltip content="Revert to Draft (Hide from Learners)" placement="bottom">
//                             <button className="ab-btn ab-btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleSave("force_draft")}>
//                                 <EyeOff size={15} />
//                                 <span className="ab-hide-mobile">Unpublish</span>
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
//                                         {user?.role === 'admin' && (
//                                             <Tooltip content="Create Blueprint" placement="top">
//                                                 <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
//                                                     <Plus size={13} /> New
//                                                 </button>
//                                             </Tooltip>
//                                         )}

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
//                                         <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => handleModuleTypeChange(e.target.value as any)}>
//                                             <option value="knowledge">Knowledge Module (Standard Questions)</option>
//                                             <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
//                                             <option value="workplace">Workplace Experience Module (Logbooks)</option>
//                                         </select>
//                                         <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
//                                     </div>
//                                     <div className="ab-form-group">
//                                         <label className="ab-fg-label">Assessment Type Category</label>
//                                         <select className="ab-input" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
//                                             <optgroup label="Formal QCTO Assessments">
//                                                 <option value="formative">Formative Assessment (Internal)</option>
//                                                 <option value="summative">Summative Assessment (Internal/FISA)</option>
//                                                 <option value="Practical Observation">Practical Observation</option>
//                                                 <option value="Workplace Logbook">Workplace Logbook</option>
//                                             </optgroup>
//                                             <optgroup label="Informal / Practice">
//                                                 <option value="Developmental Activity">Developmental Activity</option>
//                                                 <option value="Practice Set">Practice Set / Mock Exam</option>
//                                                 <option value="Task">Learning Task</option>
//                                             </optgroup>
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
//                                             <input
//                                                 type="number"
//                                                 min="0"
//                                                 className="ab-input"
//                                                 placeholder="60"
//                                                 value={moduleInfo.timeLimit ?? ""}
//                                                 onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })}
//                                             />
//                                         </div>
//                                         <span className="ab-input-hint">0 = no limit</span>
//                                     </FG>
//                                 </div>

//                                 <div>
//                                     <FG label="Learner Visibility & Release">
//                                         <div className="ab-form-group">
//                                             {/* REMOVED disabled={isDeployed} SO THEY CAN CHANGE RELEASE STATE ANYTIME */}
//                                             <select
//                                                 className="ab-input ab-input--accent"
//                                                 value={releaseState}
//                                                 onChange={(e) => setReleaseState(e.target.value as any)}
//                                             >
//                                                 <option value="active">Open Immediately (Active)</option>
//                                                 <option value="upcoming">Locked (Show as 'Coming Soon')</option>
//                                                 <option value="scheduled">Scheduled (Strict Live Countdown)</option>
//                                             </select>
//                                         </div>

//                                         {releaseState === "scheduled" && (
//                                             <>
//                                                 <div className="ab-row-gap" style={{ marginTop: '8px' }}>
//                                                     <Calendar size={15} className="ab-input-icon" />
//                                                     <input
//                                                         type="datetime-local"
//                                                         className="ab-input"
//                                                         value={scheduledDate}
//                                                         onChange={(e) => setScheduledDate(e.target.value)}
//                                                     />
//                                                 </div>
//                                                 {/* QUICK ACTION: CANCEL SCHEDULE */}
//                                                 {isDeployed && assessmentStatus === "scheduled" && (
//                                                     <button
//                                                         className="ab-text-btn"
//                                                         style={{ color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
//                                                         onClick={() => { setReleaseState("upcoming"); toast.info("Click 'Update' to securely lock the assessment and cancel the schedule."); }}
//                                                     >
//                                                         <Lock size={13} /> Cancel Schedule & Lock Assessment
//                                                     </button>
//                                                 )}
//                                             </>
//                                         )}
//                                         {releaseState === "upcoming" && (
//                                             <span className="ab-input-hint" style={{ color: 'var(--mlab-amber)', marginTop: '8px', display: 'block' }}>
//                                                 Learners will see this in their portfolio as "Coming Soon", but cannot open it until you change it to Active.
//                                             </span>
//                                         )}
//                                     </FG>
//                                 </div>

//                                 {/* Security Settings / Proctoring */}
//                                 <div className="ab-openbook-card" style={{ marginTop: '0', marginBottom: '1rem', borderLeftColor: moduleType === 'knowledge' ? '#e11d48' : '#cbd5e1', background: requiresInvigilation ? '#fff1f2' : undefined }}>
//                                     <label className={`ab-check-row ${moduleType !== 'knowledge' ? 'ab-disabled' : ''}`}>
//                                         <input
//                                             type="checkbox"
//                                             checked={requiresInvigilation}
//                                             onChange={(e) => setRequiresInvigilation(e.target.checked)}
//                                             disabled={moduleType !== 'knowledge' || isDeployed}
//                                             className="ab-checkbox"
//                                             style={requiresInvigilation ? { accentColor: '#e11d48' } : undefined}
//                                         />
//                                         <span className="ab-check-label" style={{ color: requiresInvigilation ? '#be123c' : 'inherit' }}>
//                                             <ShieldAlert size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
//                                             Enable Live Web Proctoring (Invigilation)
//                                         </span>
//                                     </label>
//                                     {moduleType !== 'knowledge' ? (
//                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px' }}>Live proctoring is automatically disabled for Practical and Workplace logbooks.</p>
//                                     ) : (
//                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px', color: requiresInvigilation ? '#9f1239' : 'inherit' }}>Locks the browser to fullscreen and records webcam snapshots of tab-switching violations.</p>
//                                     )}
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

//                                 {/* Cohort Assignment & Notifications */}
//                                 <div className="ab-fg">
//                                     <div className="ab-fg-header">
//                                         <label className="ab-fg-label">Assign to Cohorts</label>
//                                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
//                                             {/* SELECT ALL TOGGLE BUTTON */}
//                                             {cohorts.length > 0 && (
//                                                 <button
//                                                     className="ab-text-btn"
//                                                     onClick={toggleSelectAllCohorts}
//                                                     style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
//                                                 >
//                                                     {cohortIds.length === cohorts.length ? <Square size={13} /> : <CheckSquareIcon size={13} />}
//                                                     {cohortIds.length === cohorts.length ? "Deselect All" : "Select All"}
//                                                 </button>
//                                             )}
//                                             {user?.role === 'admin' && (
//                                                 <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
//                                             )}
//                                         </div>
//                                     </div>

//                                     {/* Visual counter of selected cohorts */}
//                                     {cohortIds.length > 0 && (
//                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontWeight: 'bold' }}>
//                                             {cohortIds.length} Cohort(s) Selected
//                                         </div>
//                                     )}

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

//                                     {/* SILENT PUBLISH TOGGLE */}
//                                     <label className={`ab-check-row ${cohortIds.length === 0 ? 'ab-disabled' : ''}`} style={{ marginTop: '12px' }}>
//                                         <input
//                                             type="checkbox"
//                                             checked={sendNotification}
//                                             onChange={(e) => setSendNotification(e.target.checked)}
//                                             disabled={cohortIds.length === 0}
//                                             className="ab-checkbox ab-checkbox--amber"
//                                         />
//                                         <span className="ab-check-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <Mail size={14} color={sendNotification ? "var(--mlab-blue)" : "var(--mlab-grey)"} />
//                                             Send email notification to newly assigned learners upon publishing
//                                         </span>
//                                     </label>

//                                 </div>

//                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />

//                                 {/* 🚀 NEW: Replaced standard textarea with rich-text ReactQuill editor */}
//                                 <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                                     <ReactQuill
//                                         theme="snow"
//                                         value={instructions}
//                                         onChange={setInstructions}
//                                         readOnly={isDeployed}
//                                         modules={quillModules}
//                                         formats={quillFormats}
//                                         placeholder="Add instructions for learners…"
//                                     />
//                                 </div>
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

//                                 <FG label="Note to Learner">
//                                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
//                                         <ReactQuill
//                                             theme="snow"
//                                             value={learnerNote}
//                                             onChange={setLearnerNote}
//                                             readOnly={isDeployed}
//                                             modules={quillModules}
//                                             formats={quillFormats}
//                                             placeholder="Write a welcoming note or context for the learner…"
//                                         />
//                                     </div>
//                                 </FG>

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
//                                                     <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.replace(/<[^>]*>?/gm, '').slice(0, 40) || b.title || `Question ${i + 1}`}</span>
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
//                             <Tooltip content="Live Code Sandbox" placement="top"><button className="ab-tool-btn ab-tool-btn--primary"
//                                 // style={{ background: '#eff6ff', color: '#3b82f6', borderColor: '#bfdbfe' }} 
//                                 onClick={() => addBlock("code_sandbox")}><Code size={15} /></button></Tooltip>
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
//                                         <span className={`ab-mc-b type-${type.toLowerCase().replace(/ /g, '-')}`}>{type}</span>
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
//                                         onTemplateChange={handleTemplateChange}
//                                         key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} isDeployed={isDeployed}
//                                         onFocus={() => setFocusedBlock(b.id)} onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
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

//             {/* STATUS MODALS FOR DELETION & RESET */}
//             {blockToRemove && (
//                 <StatusModal
//                     type="error"
//                     title="Remove Block"
//                     message="Are you sure you want to remove this block from the assessment?"
//                     confirmText="Remove"
//                     onClose={executeRemoveBlock}
//                     onCancel={() => setBlockToRemove(null)}
//                 />
//             )}

//             {showResetConfirm && (
//                 <StatusModal
//                     type="warning"
//                     title="Clear Module Info"
//                     message="Are you sure you want to clear all module fields? This will also remove any mapped topics."
//                     confirmText="Clear Fields"
//                     onClose={executeResetModuleInfo}
//                     onCancel={() => setShowResetConfirm(false)}
//                 />
//             )}

//             {/* COLLABORATOR MODAL */}
//             {showCollaboratorModal && createPortal(
//                 <div className="mlab-modal-overlay" onClick={() => setShowCollaboratorModal(false)}>
//                     <div className="mlab-modal-window mlab-modal-window--sm" onClick={e => e.stopPropagation()}>

//                         <div className="mlab-modal-header">
//                             <h2 className="mlab-modal-title">
//                                 <Users size={18} /> Manage Access
//                             </h2>
//                             <button className="mlab-modal-close" onClick={() => setShowCollaboratorModal(false)}>
//                                 <X size={20} />
//                             </button>
//                         </div>

//                         <div className="mlab-modal-body">
//                             <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
//                                 Select staff who can view and edit this workbook.
//                             </p>

//                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                 {staff.length === 0 ? (
//                                     <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', textAlign: 'center', margin: '2rem 0' }}>
//                                         No staff members found.
//                                     </p>
//                                 ) : (
//                                     staff.map((member: StaffMember) => {
//                                         const isCreator = member.id === creatorId || member.authUid === creatorId;
//                                         const isCurrentUser = member.id === user?.uid || member.authUid === user?.uid;

//                                         if (isCreator || isCurrentUser) return null;

//                                         const staffUid = member.authUid || member.id;
//                                         const isCollab = collaboratorIds.includes(staffUid);

//                                         return (
//                                             <label
//                                                 key={member.id}
//                                                 style={{
//                                                     display: 'flex',
//                                                     alignItems: 'center',
//                                                     padding: '10px 12px',
//                                                     border: '1px solid',
//                                                     borderColor: isCollab ? 'var(--mlab-green)' : 'var(--mlab-border)',
//                                                     background: isCollab ? 'var(--mlab-green-bg)' : 'var(--mlab-bg)',
//                                                     cursor: 'pointer',
//                                                     transition: 'all 0.15s'
//                                                 }}
//                                             >
//                                                 <input
//                                                     type="checkbox"
//                                                     checked={isCollab}
//                                                     onChange={() => toggleCollaborator(staffUid)}
//                                                     style={{
//                                                         width: '16px',
//                                                         height: '16px',
//                                                         accentColor: 'var(--mlab-green)',
//                                                         marginRight: '12px',
//                                                         cursor: 'pointer'
//                                                     }}
//                                                 />
//                                                 <div style={{ flex: 1 }}>
//                                                     <span style={{
//                                                         display: 'block',
//                                                         fontFamily: 'var(--font-heading)',
//                                                         fontWeight: 600,
//                                                         letterSpacing: '0.05em',
//                                                         color: 'var(--mlab-blue)',
//                                                         fontSize: '0.9rem',
//                                                         textTransform: 'uppercase'
//                                                     }}>
//                                                         {member.fullName}
//                                                     </span>
//                                                     <span style={{ display: 'block', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'capitalize' }}>
//                                                         {member.role}
//                                                     </span>
//                                                 </div>
//                                             </label>
//                                         );
//                                     })
//                                 )}
//                             </div>
//                         </div>

//                         <div className="mlab-modal-footer">
//                             <button className="mlab-btn mlab-btn--primary" onClick={() => setShowCollaboratorModal(false)}>
//                                 Done
//                             </button>
//                         </div>

//                     </div>
//                 </div>,
//                 document.body
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
//     onTemplateChange: (blockId: string, templateKey: string) => void;
// }

// const BlockCard: React.FC<BlockCardProps> = ({
//     block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
//     onTemplateChange
// }) => {
//     const meta = BLOCK_META[block.type];
//     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

//     const [isUploadingImage, setIsUploadingImage] = useState(false);
//     const toast = useToast();

//     const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;
//         setIsUploadingImage(true);
//         toast.info("Uploading image...");
//         try {
//             const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/block_images/${Date.now()}_${file.name}`), file);
//             task.on("state_changed", null, () => {
//                 toast.error("Image upload failed.");
//                 setIsUploadingImage(false);
//             }, async () => {
//                 const url = await getDownloadURL(task.snapshot.ref);
//                 onUpdate(block.id, "imageUrl", url);
//                 toast.success("Image attached!");
//                 setIsUploadingImage(false);
//             });
//         } catch {
//             toast.error("Upload failed.");
//             setIsUploadingImage(false);
//         }
//     };


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
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
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

//                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ marginBottom: '1rem', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
//                         <ReactQuill
//                             theme="snow"
//                             value={block.question || ""}
//                             onChange={(v) => onUpdate(block.id, "question", v)}
//                             readOnly={isDeployed}
//                             modules={quillModules}
//                             formats={quillFormats}
//                             placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type your question here (Supports multiple lines, formatting, and lists)…"}
//                         />
//                     </div>

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

//                     {/* CODE SANDBOX (LIVE IDE) */}
//                     {block.type === "code_sandbox" && (
//                         <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
//                             <div className="ab-q-top">
//                                 <span className="ab-q-num" style={{ background: "rgba(59, 130, 246, 0.18)", color: "#3b82f6" }}>IDE</span>
//                                 <div className="ab-marks-stepper">
//                                     <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                                     <span className="ab-step-val">{block.marks || 0}</span>
//                                     <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                                 </div>
//                                 <div className="ab-topic-sel-wrap">
//                                     <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)}>
//                                         <option value="">Link topic…</option>
//                                         {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                                     </select>
//                                     {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                                 </div>
//                             </div>

//                             <div className="ab-form-group">
//                                 <label className="ab-field-lbl">Environment Template (StackBlitz WebContainer)</label>
//                                 {/* <select
//                                     className="ab-input"
//                                     value={block.template || "javascript"}
//                                     onChange={(e) => onUpdate(block.id, "template", e.target.value)}
//                                     disabled={isDeployed}
//                                 > */}
//                                 <select
//                                     value={block.template || "javascript"}
//                                     onChange={(e) => onTemplateChange(block.id, e.target.value)}
//                                     disabled={isDeployed}
//                                 >
//                                     <option value="javascript">JavaScript / TypeScript (Blank)</option>
//                                     <option value="html">HTML / CSS / JS</option>
//                                     <option value="create-react-app">React.js</option>
//                                     <option value="node">Node.js (Backend)</option>
//                                     <option value="python">Python</option>
//                                     <option value="sql">SQL Database (Emulated)</option>
//                                 </select>
//                             </div>

//                             {/* SMART SQL GUIDE & BOILERPLATE INJECTOR */}
//                             {block.template === "sql" && (
//                                 <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
//                                     <strong><Database size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> SQL Environment Guide:</strong>
//                                     <p style={{ margin: '4px 0 8px 0' }}>The browser executes SQL via a Node.js in-memory database (SQLite). You must provide a <code>schema.sql</code> file to define your tables, and a <code>run.js</code> execution script.</p>

//                                     {!isDeployed && (
//                                         <button
//                                             className="ab-btn ab-btn-primary ab-btn-sm"
//                                             onClick={(e) => {
//                                                 e.stopPropagation();
//                                                 onUpdate(block.id, "dependencies", { "better-sqlite3": "^8.0.0" });
//                                                 onUpdate(block.id, "initialFiles", {
//                                                     "package.json": JSON.stringify({ scripts: { start: "node run.js" } }),
//                                                     "schema.sql": "CREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');",
//                                                     "query.sql": "-- Write your SELECT query here to find all engineers:\nSELECT * FROM employees;\n",
//                                                     "run.js": "const Database = require('better-sqlite3');\nconst fs = require('fs');\nconst db = new Database(':memory:');\n\ndb.exec(fs.readFileSync('schema.sql', 'utf8'));\nconsole.log('--- YOUR QUERY RESULT ---');\nconst stmt = db.prepare(fs.readFileSync('query.sql', 'utf8'));\nconsole.table(stmt.all());"
//                                                 });
//                                                 toast.success("SQL Boilerplate loaded into memory!");
//                                             }}
//                                         >
//                                             <Zap size={13} /> Auto-Generate Required SQL Boilerplate
//                                         </button>
//                                     )}
//                                 </div>
//                             )}

//                             {/* SMART SQL GUIDE & BOILERPLATE INJECTOR */}
//                             {block.template === "sql" && (
//                                 <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
//                                     <strong><Database size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> SQL Environment Setup:</strong>
//                                     <p style={{ margin: '4px 0 8px 0' }}>Choose between an isolated local SQLite sandbox (great for basics) or a remote MySQL connection (requires an external database host).</p>

//                                     {!isDeployed && (
//                                         <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                             <button
//                                                 className="ab-btn ab-btn-primary ab-btn-sm"
//                                                 onClick={(e) => {
//                                                     e.stopPropagation();
//                                                     onUpdate(block.id, "dependencies", { "better-sqlite3": "^8.0.0" });
//                                                     onUpdate(block.id, "initialFiles", {
//                                                         "package.json": JSON.stringify({ scripts: { start: "node run.js" } }),
//                                                         "schema.sql": "CREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');",
//                                                         "query.sql": "-- Write your SELECT query here:\nSELECT * FROM employees;\n",
//                                                         "run.js": "const Database = require('better-sqlite3');\nconst fs = require('fs');\nconst db = new Database(':memory:');\ndb.exec(fs.readFileSync('schema.sql', 'utf8'));\nconsole.log('--- YOUR QUERY RESULT ---');\nconst stmt = db.prepare(fs.readFileSync('query.sql', 'utf8'));\nconsole.table(stmt.all());"
//                                                     });
//                                                     toast.success("SQLite Sandbox Boilerplate loaded!");
//                                                 }}
//                                             >
//                                                 <Zap size={13} /> Inject Local SQLite Sandbox
//                                             </button>

//                                             <button
//                                                 className="ab-btn ab-btn-outline ab-btn-sm"
//                                                 style={{ background: 'white', borderColor: '#93c5fd', color: '#1d4ed8' }}
//                                                 onClick={(e) => {
//                                                     e.stopPropagation();
//                                                     onUpdate(block.id, "dependencies", { "mysql2": "^3.9.0", "dotenv": "^16.4.5" });
//                                                     onUpdate(block.id, "initialFiles", {
//                                                         "package.json": JSON.stringify({ scripts: { start: "node run.js" } }),
//                                                         ".env": "DB_HOST=your-database-host.com\nDB_USER=student_user\nDB_PASS=student_pass\nDB_NAME=training_db",
//                                                         "query.sql": "-- Write your SELECT query here to fetch from the remote database:\nSELECT * FROM users LIMIT 5;\n",
//                                                         "run.js": "const mysql = require('mysql2/promise');\nconst fs = require('fs');\nrequire('dotenv').config();\n\nasync function run() {\n  try {\n    const connection = await mysql.createConnection({\n      host: process.env.DB_HOST,\n      user: process.env.DB_USER,\n      password: process.env.DB_PASS,\n      database: process.env.DB_NAME\n    });\n    const query = fs.readFileSync('query.sql', 'utf8');\n    const [rows] = await connection.execute(query);\n    console.log('--- REMOTE MYSQL RESULTS ---');\n    console.table(rows);\n    await connection.end();\n  } catch (err) {\n    console.error('Database connection failed:', err.message);\n  }\n}\nrun();"
//                                                     });
//                                                     toast.success("Remote MySQL Connector Boilerplate loaded!");
//                                                 }}
//                                             >
//                                                 <LinkIcon size={13} /> Inject Remote MySQL Connector
//                                             </button>
//                                         </div>
//                                     )}
//                                 </div>
//                             )}

//                             <div className="ab-form-group">
//                                 <label className="ab-field-lbl">Challenge Instructions</label>
//                                 <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ background: '#fff' }}>
//                                     <ReactQuill
//                                         theme="snow"
//                                         value={block.question || ""}
//                                         onChange={(v) => onUpdate(block.id, "question", v)}
//                                         readOnly={isDeployed}
//                                         modules={quillModules}
//                                         formats={quillFormats}
//                                         placeholder="Describe the app or script the learner needs to build..."
//                                     />
//                                 </div>
//                             </div>

//                             <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
//                                 <Info size={13} style={{ marginBottom: '-2px', marginRight: '4px' }} />
//                                 <strong>Note:</strong> File management and starter code editing will be available via the Global Settings dashboard in a future update. Current template uses default <code>initialFiles</code>.
//                             </div>
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

//             {/* CODE SANDBOX (LIVE IDE) */}
//             {block.type === "code_sandbox" && (
//                 <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: "rgba(59, 130, 246, 0.18)", color: "#3b82f6" }}>IDE</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>

//                     <div className="ab-form-group">
//                         <label className="ab-field-lbl">Environment Template (StackBlitz WebContainer)</label>
//                         <select
//                             className="ab-input"
//                             value={block.template || "javascript"}
//                             onChange={(e) => onUpdate(block.id, "template", e.target.value)}
//                             disabled={isDeployed}
//                         >
//                             <option value="javascript">JavaScript / TypeScript (Blank)</option>
//                             <option value="html">HTML / CSS / JS</option>
//                             <option value="create-react-app">React.js</option>
//                             <option value="node">Node.js (Backend)</option>
//                             <option value="python">Python</option>
//                             <option value="sql">SQL Database (Emulated)</option>
//                         </select>
//                     </div>

//                     {/* SMART SQL GUIDE & BOILERPLATE INJECTOR */}
//                     {block.template === "sql" && (
//                         <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '0.85rem', color: '#1e3a8a', lineHeight: 1.5 }}>
//                             <strong><Database size={14} style={{ display: 'inline', marginBottom: '-2px' }} /> SQL Environment Setup:</strong>
//                             <p style={{ margin: '4px 0 8px 0' }}>Choose between an isolated local SQLite sandbox (great for basics) or a remote MySQL connection (requires an external database host).</p>

//                             {!isDeployed && (
//                                 <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
//                                     <button
//                                         className="ab-btn ab-btn-primary ab-btn-sm"
//                                         onClick={(e) => {
//                                             e.stopPropagation();
//                                             onUpdate(block.id, "dependencies", { "better-sqlite3": "^8.0.0" });
//                                             onUpdate(block.id, "initialFiles", {
//                                                 "package.json": JSON.stringify({ scripts: { start: "node run.js" } }),
//                                                 "schema.sql": "CREATE TABLE employees (id INT, name TEXT, role TEXT);\nINSERT INTO employees VALUES (1, 'Alice', 'Engineer');\nINSERT INTO employees VALUES (2, 'Bob', 'Manager');",
//                                                 "query.sql": "-- Write your SELECT query here:\nSELECT * FROM employees;\n",
//                                                 "run.js": "const Database = require('better-sqlite3');\nconst fs = require('fs');\nconst db = new Database(':memory:');\ndb.exec(fs.readFileSync('schema.sql', 'utf8'));\nconsole.log('--- YOUR QUERY RESULT ---');\nconst stmt = db.prepare(fs.readFileSync('query.sql', 'utf8'));\nconsole.table(stmt.all());"
//                                             });
//                                             toast.success("SQLite Sandbox Boilerplate loaded!");
//                                         }}
//                                     >
//                                         <Zap size={13} /> Inject Local SQLite Sandbox
//                                     </button>

//                                     <button
//                                         className="ab-btn ab-btn-outline ab-btn-sm"
//                                         style={{ background: 'white', borderColor: '#93c5fd', color: '#1d4ed8' }}
//                                         onClick={(e) => {
//                                             e.stopPropagation();
//                                             onUpdate(block.id, "dependencies", { "mysql2": "^3.9.0", "dotenv": "^16.4.5" });
//                                             onUpdate(block.id, "initialFiles", {
//                                                 "package.json": JSON.stringify({ scripts: { start: "node run.js" } }),
//                                                 ".env": "DB_HOST=your-database-host.com\nDB_USER=student_user\nDB_PASS=student_pass\nDB_NAME=training_db",
//                                                 "query.sql": "-- Write your SELECT query here to fetch from the remote database:\nSELECT * FROM users LIMIT 5;\n",
//                                                 "run.js": "const mysql = require('mysql2/promise');\nconst fs = require('fs');\nrequire('dotenv').config();\n\nasync function run() {\n  try {\n    const connection = await mysql.createConnection({\n      host: process.env.DB_HOST,\n      user: process.env.DB_USER,\n      password: process.env.DB_PASS,\n      database: process.env.DB_NAME\n    });\n    const query = fs.readFileSync('query.sql', 'utf8');\n    const [rows] = await connection.execute(query);\n    console.log('--- REMOTE MYSQL RESULTS ---');\n    console.table(rows);\n    await connection.end();\n  } catch (err) {\n    console.error('Database connection failed:', err.message);\n  }\n}\nrun();"
//                                             });
//                                             toast.success("Remote MySQL Connector Boilerplate loaded!");
//                                         }}
//                                     >
//                                         <LinkIcon size={13} /> Inject Remote MySQL Connector
//                                     </button>
//                                 </div>
//                             )}
//                         </div>
//                     )}

//                     <div className="ab-form-group">
//                         <label className="ab-field-lbl">Challenge Instructions</label>
//                         <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ background: '#fff' }}>
//                             <ReactQuill
//                                 theme="snow"
//                                 value={block.question || ""}
//                                 onChange={(v) => onUpdate(block.id, "question", v)}
//                                 readOnly={isDeployed}
//                                 modules={quillModules}
//                                 formats={quillFormats}
//                                 placeholder="Describe the app or script the learner needs to build..."
//                             />
//                         </div>
//                     </div>

//                     <div style={{ marginTop: '12px', fontSize: '0.8rem', color: '#64748b', background: '#f8fafc', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
//                         <Info size={13} style={{ marginBottom: '-2px', marginRight: '4px' }} />
//                         <strong>Note:</strong> File management and starter code editing will be available via the Global Settings dashboard in a future update. Current template uses default <code>initialFiles</code>.
//                     </div>
//                 </div>
//             )}

//             {/* BLOCK IMAGE ATTACHMENT ZONE */}
//             {["text", "mcq", "task", "info", "section"].includes(block.type) && (
//                 <div style={{ padding: "0 20px 20px 20px" }}>
//                     {!block.imageUrl && !isUploadingImage ? (
//                         <label className="ab-image-toggle">
//                             <ImageIcon size={14} /> Attach Context Image
//                             <input type="file" accept="image/*" hidden disabled={isDeployed} onChange={handleImageUpload} />
//                         </label>
//                     ) : isUploadingImage ? (
//                         <div className="ab-image-upload-zone">
//                             <div className="ab-spinner" style={{ margin: '0 auto', marginBottom: '8px', width: '20px', height: '20px' }} />
//                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Uploading Image...</span>
//                         </div>
//                     ) : (
//                         <div className="ab-image-upload-zone has-image" onClick={(e) => e.stopPropagation()}>
//                             <img src={block.imageUrl} alt="Attached context" className="ab-image-preview" />
//                             <div className="ab-image-meta">
//                                 <input
//                                     className="ab-caption-input"
//                                     placeholder="Add an optional caption or source credit..."
//                                     value={block.imageCaption || ""}
//                                     disabled={isDeployed}
//                                     onChange={(e) => onUpdate(block.id, "imageCaption", e.target.value)}
//                                 />
//                                 {!isDeployed && (
//                                     <button
//                                         className="ab-btn-text ab-btn-text--rose"
//                                         style={{ alignSelf: "flex-start", padding: 0 }}
//                                         onClick={() => { onUpdate(block.id, "imageUrl", ""); onUpdate(block.id, "imageCaption", ""); }}
//                                     >
//                                         <Trash2 size={12} style={{ marginRight: '4px' }} /> Remove Image
//                                     </button>
//                                 )}
//                             </div>
//                         </div>
//                     )}
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


// // // src/components/views/AssessmentBuilder/AssessmentBuilder.tsx

// // import React, { useState, useEffect, useRef } from "react";
// // import { useNavigate, useParams, useLocation } from "react-router-dom";
// // import {
// //     collection, doc, setDoc, writeBatch, query, where, getDocs, onSnapshot
// // } from "firebase/firestore";
// // import {
// //     getStorage, ref as fbStorageRef, uploadBytesResumable, getDownloadURL,
// // } from "firebase/storage";
// // import { getFunctions, httpsCallable } from "firebase/functions";
// // import { db } from "../../../lib/firebase";
// // import { useStore, type StaffMember } from "../../../store/useStore";
// // import {
// //     ArrowLeft, Trash2, AlignLeft, CheckSquare, Layout, Info, ChevronDown, BookOpen,
// //     FileText, Zap, Eye, Settings, GraduationCap, ListChecks, ClipboardList,
// //     BookMarked, Plus, Pencil, Check, X, AlertTriangle, RotateCcw, EyeOff, Clock,
// //     Database, ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code,
// //     Link as LinkIcon, CalendarRange, Timer, Type, Briefcase, Menu, FileArchive, ShieldAlert, Image as ImageIcon,
// //     Users, Activity, Mail, Copy, CheckSquare as CheckSquareIcon, Square
// // } from "lucide-react";
// // import Tooltip from "../../../components/common/Tooltip/Tooltip";
// // import type { Cohort, ProgrammeTemplate, DashboardLearner } from "../../../types";
// // import { CohortFormModal } from "../../../components/admin/CohortFormModal/CohortFormModal";
// // import { ProgrammeFormModal } from "../../../components/admin/ProgrammeFormModal/ProgrammeFormModal";
// // import ReactQuill from "react-quill-new";
// // import "react-quill-new/dist/quill.snow.css";
// // import "./AssessmentBuilder.css";
// // import { ToastContainer, useToast } from "../../../components/common/Toast/Toast";
// // import { StatusModal } from "../../../components/common/StatusModal/StatusModal";
// // import { createPortal } from "react-dom";

// // const quillModules = {
// //     toolbar: [
// //         ["bold", "italic", "underline", "code-block"],
// //         [{ list: "ordered" }, { list: "bullet" }],
// //         ["clean"],
// //     ],
// // };
// // const quillFormats = ["bold", "italic", "underline", "code-block", "list", "bullet"];

// // export type BlockType = "section" | "info" | "mcq" | "text" | "task" | "checklist" | "logbook" | "qcto_workplace";
// // type SidebarPanel = "settings" | "module" | "topics" | "guide" | "outline";

// // interface Topic {
// //     id: string;
// //     code: string;
// //     title: string;
// //     weight: string | number;
// // }
// // export interface WorkplaceEvidenceItem {
// //     id: string;
// //     code: string;
// //     description: string;
// // }
// // export interface WorkplaceActivity {
// //     id: string;
// //     code: string;
// //     description: string;
// //     evidenceItems?: WorkplaceEvidenceItem[];
// // }

// // export interface AssessmentBlock {
// //     id: string;
// //     type: BlockType;
// //     title?: string;
// //     content?: string;
// //     question?: string;
// //     marks?: number;
// //     options?: string[];
// //     correctOption?: number;
// //     linkedTopicId?: string;
// //     allowText?: boolean;
// //     allowUpload?: boolean;
// //     allowAudio?: boolean;
// //     allowUrl?: boolean;
// //     allowCode?: boolean;
// //     allowedFileTypes?: "all" | "image" | "document" | "video" | "presentation";
// //     codeLanguage?: "javascript" | "python" | "html" | "sql" | "other";
// //     criteria?: string[];
// //     requireTimeTracking?: boolean;
// //     requirePerCriterionTiming?: boolean;
// //     requireObservationDeclaration?: boolean;
// //     requireEvidencePerCriterion?: boolean;
// //     weCode?: string;
// //     weTitle?: string;
// //     workActivities?: WorkplaceActivity[];
// //     requireSelfAssessment?: boolean;
// //     requireGoalPlanning?: boolean;
// //     imageUrl?: string;
// //     imageCaption?: string;
// // }

// // interface ModuleDetails {
// //     title: string;
// //     nqfLevel: string;
// //     credits: number;
// //     notionalHours: number;
// //     moduleNumber: string;
// //     occupationalCode: string;
// //     saqaQualId: string;
// //     qualificationTitle: string;
// //     timeLimit?: number;
// // }

// // type AssessmentStatusType = "draft" | "upcoming" | "scheduled" | "active" | "completed";

// // const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// // const BLOCK_META: Record<
// //     BlockType,
// //     { label: string; color: string; icon: React.ReactNode; desc: string }
// // > = {
// //     section: { label: "Section", color: "#6366f1", icon: <Layout size={14} />, desc: "Organises blocks under a heading" },
// //     info: { label: "Reading", color: "#0ea5e9", icon: <Info size={14} />, desc: "Context or learning material" },
// //     text: { label: "Written", color: "#f59e0b", icon: <AlignLeft size={14} />, desc: "Standard free-text response" },
// //     mcq: { label: "MCQ", color: "#10b981", icon: <CheckSquare size={14} />, desc: "Select the correct option" },
// //     task: { label: "Multi-Modal", color: "#8b5cf6", icon: <Layers size={14} />, desc: "File uploads, audio, code, or links" },
// //     checklist: { label: "Checklist", color: "#14b8a6", icon: <ListChecks size={14} />, desc: "Assessor C/NYC observation list" },
// //     logbook: { label: "Basic Logbook", color: "#f97316", icon: <CalendarRange size={14} />, desc: "Standard workplace hours logbook" },
// //     qcto_workplace: { label: "QCTO Workplace Checkpoint", color: "#e11d48", icon: <Briefcase size={14} />, desc: "SETA compliant workplace checkpoint" },
// // };

// // export const AssessmentBuilder: React.FC = () => {
// //     const { assessmentId } = useParams();
// //     const navigate = useNavigate();
// //     const location = useLocation();
// //     const toast = useToast();
// //     const {
// //         user,
// //         staff,
// //         cohorts,
// //         learners,
// //         programmes,
// //         fetchCohorts,
// //         fetchLearners,
// //         fetchProgrammes,
// //         fetchStaff
// //     } = useStore();

// //     const [loading, setLoading] = useState(false);
// //     const [activePanel, setActivePanel] = useState<SidebarPanel>("settings");
// //     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
// //     const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
// //     const [lastSaved, setLastSaved] = useState<Date | null>(null);
// //     const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
// //     const [showCollaboratorModal, setShowCollaboratorModal] = useState(false);
// //     const [isLiveSyncing, setIsLiveSyncing] = useState(false);

// //     const [blockToRemove, setBlockToRemove] = useState<string | null>(null);
// //     const [showResetConfirm, setShowResetConfirm] = useState(false);

// //     const [assessmentStatus, setAssessmentStatus] = useState<AssessmentStatusType>("draft");
// //     const [sendNotification, setSendNotification] = useState(true);

// //     const statusRef = useRef<AssessmentStatusType>("draft");
// //     useEffect(() => { statusRef.current = assessmentStatus; }, [assessmentStatus]);

// //     const [selectedProgrammeId, setSelectedProgrammeId] = useState("");
// //     const [selectedModuleCode, setSelectedModuleCode] = useState("");
// //     const [showProgrammeModal, setShowProgrammeModal] = useState(false);
// //     const [showCohortModal, setShowCohortModal] = useState(false);
// //     const [title, setTitle] = useState("");

// //     const [cohortIds, setCohortIds] = useState<string[]>([]);
// //     const [notifiedCohortIds, setNotifiedCohortIds] = useState<string[]>([]);

// //     const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
// //     const [instructions, setInstructions] = useState("");
// //     const [creatorId, setCreatorId] = useState<string | null>(null);
// //     const [publisherId, setPublisherId] = useState<string | null>(null);
// //     const [autoCloseTaskId, setAutoCloseTaskId] = useState<string | null>(null);

// //     const [type, setType] = useState<"formative" | "summative" | "Practical Observation" | "Workplace Logbook" | "Developmental Activity" | "Practice Set" | "Task">("formative");
// //     const [moduleType, setModuleType] = useState<"knowledge" | "practical" | "workplace">("knowledge");

// //     const [requiresInvigilation, setRequiresInvigilation] = useState(true);
// //     const [isOpenBook, setIsOpenBook] = useState(false);
// //     const [referenceManualUrl, setReferenceManualUrl] = useState("");
// //     const [isUploadingManual, setIsUploadingManual] = useState(false);

// //     const [releaseState, setReleaseState] = useState<"active" | "upcoming" | "scheduled">("active");
// //     const [scheduledDate, setScheduledDate] = useState("");

// //     const [showModuleHeader, setShowModuleHeader] = useState(true);
// //     const [moduleInfo, setModuleInfo] = useState<ModuleDetails>({
// //         title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
// //         occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 60,
// //     });
// //     const [learnerNote, setLearnerNote] = useState("");
// //     const [modulePurpose, setModulePurpose] = useState("");
// //     const [entryRequirements, setEntryRequirements] = useState("");
// //     const [providerRequirements, setProviderRequirements] = useState("");
// //     const [exemptions, setExemptions] = useState("");
// //     const [stakeholderGuidelines, setStakeholderGuidelines] = useState("");
// //     const [topics, setTopics] = useState<Topic[]>([]);
// //     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);
// //     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
// //     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
// //     const [addingTopic, setAddingTopic] = useState(false);
// //     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: "", title: "", weight: "" });
// //     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

// //     const isDeployed = (assessmentStatus === "active" || assessmentStatus === "completed" || assessmentStatus === "scheduled" || assessmentStatus === "upcoming") && assessmentId !== undefined;
// //     const isInitialLoad = useRef(true);

// //     const handleBackNavigation = () => {
// //         if (window.history.state && window.history.state.idx > 0) {
// //             navigate(-1);
// //         } else {
// //             navigate('/facilitator/assessments', { replace: true });
// //         }
// //     };

// //     const handleClone = () => {
// //         if (!window.confirm("Duplicate this workbook? You will be redirected to a new, unsaved copy.")) return;

// //         const cloneData = {
// //             title: title + " (Copy)",
// //             type, moduleType, instructions, requiresInvigilation, isOpenBook, referenceManualUrl, showModuleHeader,
// //             moduleInfo, learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
// //             selectedProgrammeId, selectedModuleCode, topics, blocks, releaseState
// //         };

// //         navigate('/facilitator/assessments/builder', { state: { cloneData } });
// //     };

// //     useEffect(() => {
// //         console.log('USERSAAA: ', user)
// //         if (cohorts.length === 0) fetchCohorts();
// //         if (learners.length === 0) fetchLearners();
// //         if (programmes.length === 0) fetchProgrammes();
// //         if (staff.length === 0) fetchStaff();

// //         if (!assessmentId) {
// //             if (location.state?.cloneData && isInitialLoad.current) {
// //                 const cd = location.state.cloneData;
// //                 setTitle(cd.title);
// //                 setType(cd.type);
// //                 setModuleType(cd.moduleType);
// //                 setInstructions(cd.instructions);
// //                 setRequiresInvigilation(cd.requiresInvigilation);
// //                 setIsOpenBook(cd.isOpenBook);
// //                 setReferenceManualUrl(cd.referenceManualUrl);
// //                 setShowModuleHeader(cd.showModuleHeader);
// //                 setModuleInfo(cd.moduleInfo);
// //                 setLearnerNote(cd.learnerNote);
// //                 setModulePurpose(cd.modulePurpose);
// //                 setEntryRequirements(cd.entryRequirements);
// //                 setProviderRequirements(cd.providerRequirements);
// //                 setExemptions(cd.exemptions);
// //                 setStakeholderGuidelines(cd.stakeholderGuidelines);
// //                 setSelectedProgrammeId(cd.selectedProgrammeId);
// //                 setSelectedModuleCode(cd.selectedModuleCode);
// //                 setReleaseState(cd.releaseState || "active");

// //                 const newTopics = cd.topics.map((t: any) => ({ ...t, id: mkId() }));
// //                 setTopics(newTopics);

// //                 const newBlocks = cd.blocks.map((b: any) => {
// //                     const newId = `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
// //                     let newLinkedTopicId = b.linkedTopicId;
// //                     if (b.linkedTopicId) {
// //                         const oldTopicIdx = cd.topics.findIndex((t: any) => t.id === b.linkedTopicId);
// //                         if (oldTopicIdx !== -1) newLinkedTopicId = newTopics[oldTopicIdx].id;
// //                     }
// //                     return { ...b, id: newId, linkedTopicId: newLinkedTopicId };
// //                 });
// //                 setBlocks(newBlocks);

// //                 setCreatorId(user?.uid || null);
// //                 setAutoCloseTaskId(null);
// //                 setSaveStatus("unsaved");
// //                 isInitialLoad.current = false;

// //                 window.history.replaceState({}, document.title);
// //             } else {
// //                 setCreatorId(user?.uid || null);
// //             }
// //             return;
// //         }

// //         setLoading(true);

// //         const unsubscribe = onSnapshot(doc(db, "assessments", assessmentId), (snap) => {
// //             if (snap.exists()) {
// //                 const d = snap.data();

// //                 let formattedDate = "";
// //                 if (d.scheduledDate) {
// //                     try {
// //                         const dt = new Date(d.scheduledDate);
// //                         if (!isNaN(dt.getTime())) {
// //                             const p = (n: number) => n.toString().padStart(2, "0");
// //                             formattedDate = `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}`;
// //                         } else {
// //                             formattedDate = d.scheduledDate;
// //                         }
// //                     } catch {
// //                         formattedDate = d.scheduledDate;
// //                     }
// //                 }

// //                 if (isInitialLoad.current) {
// //                     setTitle(d.title || "");
// //                     setCohortIds(d.cohortIds || (d.cohortId ? [d.cohortId] : []));
// //                     setNotifiedCohortIds(d.notifiedCohortIds || []);
// //                     setCollaboratorIds(d.collaboratorIds || []);
// //                     setCreatorId(d.createdBy || d.facilitatorId || null);
// //                     setPublisherId(d.publishedBy || null);
// //                     setAutoCloseTaskId(d.autoCloseTaskId || null);
// //                     setInstructions(d.instructions || "");
// //                     setType(d.type || "formative");
// //                     setModuleType(d.moduleType || "knowledge");
// //                     setAssessmentStatus(d.status || "draft");
// //                     setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
// //                     setIsOpenBook(d.isOpenBook || false);
// //                     setReferenceManualUrl(d.referenceManualUrl || "");

// //                     if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
// //                     else if (d.status === "upcoming") setReleaseState("upcoming");
// //                     else setReleaseState("active");

// //                     setScheduledDate(formattedDate);
// //                     setSelectedProgrammeId(d.linkedProgrammeId || "");
// //                     setSelectedModuleCode(d.linkedModuleCode || "");
// //                     setModuleInfo(d.moduleInfo || {});
// //                     setShowModuleHeader(d.showModuleHeader ?? true);
// //                     setBlocks(d.blocks || []);

// //                     if (d.learnerGuide) {
// //                         setLearnerNote(d.learnerGuide.note || "");
// //                         setModulePurpose(d.learnerGuide.purpose || "");
// //                         setEntryRequirements(d.learnerGuide.entryRequirements || "");
// //                         setProviderRequirements(d.learnerGuide.providerRequirements || "");
// //                         setExemptions(d.learnerGuide.exemptions || "");
// //                         setStakeholderGuidelines(d.learnerGuide.stakeholderGuidelines || "");
// //                     }
// //                     if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));

// //                     setSaveStatus("saved");
// //                     setLastSaved(new Date(d.lastUpdated || d.createdAt));

// //                     isInitialLoad.current = false;
// //                     setLoading(false);
// //                 } else {
// //                     if (d.lastUpdatedBy && d.lastUpdatedBy !== user?.uid) {
// //                         setIsLiveSyncing(true);
// //                         toast.info("A collaborator updated the workbook. Syncing changes...");

// //                         setAssessmentStatus(d.status || "draft");
// //                         setType(d.type || "formative");
// //                         setModuleType(d.moduleType || "knowledge");
// //                         setRequiresInvigilation(d.requiresInvigilation !== undefined ? d.requiresInvigilation : (d.moduleType === "knowledge" || !d.moduleType));
// //                         setIsOpenBook(d.isOpenBook || false);
// //                         setReferenceManualUrl(d.referenceManualUrl || "");
// //                         setAutoCloseTaskId(d.autoCloseTaskId || null);

// //                         if (d.status === "scheduled" && !!d.scheduledDate) setReleaseState("scheduled");
// //                         else if (d.status === "upcoming") setReleaseState("upcoming");
// //                         else setReleaseState("active");

// //                         setBlocks(d.blocks || []);
// //                         if (d.topics) setTopics(d.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
// //                         setTitle(d.title || "");
// //                         setCollaboratorIds(d.collaboratorIds || []);
// //                         setNotifiedCohortIds(d.notifiedCohortIds || []);
// //                         setInstructions(d.instructions || "");
// //                         setModuleInfo(d.moduleInfo || {});

// //                         setSaveStatus("saved");
// //                         setLastSaved(new Date(d.lastUpdated || d.createdAt));

// //                         setTimeout(() => setIsLiveSyncing(false), 2000);
// //                     }
// //                 }
// //             } else {
// //                 toast.error("Assessment not found or was deleted by a collaborator.");
// //                 navigate("/facilitator/assessments");
// //             }
// //         }, (err) => {
// //             console.error("Real-time listener error:", err);
// //             toast.error("Lost connection to the live workbook.");
// //             setLoading(false);
// //         });

// //         return () => unsubscribe();
// //     }, [assessmentId, user?.uid, location.state]);

// //     useEffect(() => {
// //         if (!selectedProgrammeId || !selectedModuleCode) return;
// //         if (assessmentId && topics.length > 0) return;
// //         const prog = programmes.find((p) => p.id === selectedProgrammeId);
// //         if (!prog) return;
// //         const allMods = [...(prog.knowledgeModules || []), ...(prog.practicalModules || []), ...(prog.workExperienceModules || [])];
// //         const mod: any = allMods.find((m: any, idx: number) => (m.code || m.name || `mod-${idx}`) === selectedModuleCode);
// //         if (mod) {
// //             setModuleInfo({
// //                 title: mod.name,
// //                 nqfLevel: `Level ${mod.nqfLevel || prog.nqfLevel}`,
// //                 credits: mod.credits || 0,
// //                 notionalHours: mod.notionalHours || 0,
// //                 moduleNumber: mod.code || "",
// //                 occupationalCode: (prog as any).curriculumCode || prog.saqaId || "",
// //                 saqaQualId: prog.saqaId || "",
// //                 qualificationTitle: prog.name || "",
// //                 timeLimit: moduleInfo.timeLimit || 60,
// //             });
// //             if (mod.topics?.length) {
// //                 const t = mod.topics.map((t: any) => ({ id: mkId(), code: t.code || "", title: t.title || "Unnamed Topic", weight: t.weight || "0" }));
// //                 setTopics(t);
// //                 toast.success(`Imported ${t.length} topics!`);
// //             } else setTopics([]);
// //         }
// //     }, [selectedProgrammeId, selectedModuleCode]);

// //     useEffect(() => {
// //         if (!assessmentId || isInitialLoad.current) return;
// //         setSaveStatus("unsaved");

// //         const t = setTimeout(() => {
// //             if (saveStatus === "unsaved" && !loading) {
// //                 handleSave(statusRef.current, true);
// //             }
// //         }, 15000);

// //         return () => clearTimeout(t);
// //     }, [
// //         title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
// //         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
// //         stakeholderGuidelines, topics, blocks, selectedProgrammeId, selectedModuleCode,
// //         scheduledDate, releaseState, isOpenBook, referenceManualUrl, requiresInvigilation,
// //         collaboratorIds, assessmentStatus
// //     ]);

// //     const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;
// //         setIsUploadingManual(true);
// //         toast.info("Uploading reference manual...");
// //         try {
// //             const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/manuals/${Date.now()}_${file.name}`), file);
// //             task.on("state_changed", null, () => {
// //                 toast.error("Upload failed.");
// //                 setIsUploadingManual(false);
// //             }, async () => {
// //                 setReferenceManualUrl(await getDownloadURL(task.snapshot.ref));
// //                 toast.success("Manual uploaded!");
// //                 setIsUploadingManual(false);
// //             });
// //         } catch {
// //             toast.error("Upload failed.");
// //             setIsUploadingManual(false);
// //         }
// //     };

// //     const handleModuleTypeChange = (newType: "knowledge" | "practical" | "workplace") => {
// //         setModuleType(newType);
// //         if (newType !== 'knowledge') {
// //             setRequiresInvigilation(false);
// //         } else {
// //             setRequiresInvigilation(true);
// //         }
// //     };

// //     const handleTypeChange = (newType: string) => {
// //         setType(newType as any);
// //         if (["Developmental Activity", "Practice Set", "Task"].includes(newType)) {
// //             setRequiresInvigilation(false);
// //         }
// //     };

// //     const handleSaveNewCohort = async (cohortData: Omit<Cohort, "id" | "createdAt" | "staffHistory" | "isArchived">, reasons?: any) => {
// //         const ref = doc(collection(db, "cohorts"));
// //         const id = ref.id;
// //         await setDoc(ref, {
// //             ...cohortData,
// //             id,
// //             createdAt: new Date().toISOString(),
// //             isArchived: false,
// //             staffHistory: [],
// //             status: "active",
// //             changeReasons: reasons || {},
// //         });
// //         await fetchCohorts();
// //         setCohortIds((p) => [...p, id]);
// //         toast.success(`Class "${cohortData.name}" created!`);
// //         setShowCohortModal(false);
// //     };

// //     const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
// //         try {
// //             const newRef = doc(collection(db, "programmes"));
// //             const id = newRef.id;

// //             await setDoc(
// //                 newRef,
// //                 { ...newProg, id, createdAt: new Date().toISOString(), createdBy: user?.fullName || "Facilitator" },
// //                 { merge: true },
// //             );

// //             toast.success("Blueprint created!");
// //             setShowProgrammeModal(false);
// //             await fetchProgrammes();
// //             setSelectedProgrammeId(id);
// //             setSelectedModuleCode("");
// //         } catch (err: any) {
// //             toast.error(`Error saving blueprint: ${err.message}`);
// //         }
// //     };

// //     const toggleSelectAllCohorts = () => {
// //         if (cohortIds.length === cohorts.length) {
// //             setCohortIds([]); // Deselect all
// //         } else {
// //             setCohortIds(cohorts.map(c => c.id)); // Select all
// //         }
// //     };

// //     const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
// //     const commitEdit = () => {
// //         if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
// //         setTopics((p) => p.map((t) => t.id === editingTopicId ? ({ ...t, ...editDraft } as Topic) : t));
// //         setEditingTopicId(null);
// //     };
// //     const cancelEdit = () => setEditingTopicId(null);
// //     const confirmDelete = (id: string) => setDeleteConfirmId(id);
// //     const executeDelete = () => {
// //         if (!deleteConfirmId) return;
// //         setBlocks((p) => p.map((b) => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
// //         setTopics((p) => p.filter((t) => t.id !== deleteConfirmId));
// //         setDeleteConfirmId(null);
// //     };
// //     const cancelDelete = () => setDeleteConfirmId(null);
// //     const commitAdd = () => {
// //         if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
// //         setTopics((p) => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || "0%" }]);
// //         setNewTopic({ code: "", title: "", weight: "" });
// //         setAddingTopic(false);
// //     };
// //     const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

// //     const addBlock = (bType: string, linkedTopicId?: string) => {
// //         let actualType: BlockType = bType as BlockType;
// //         if (["upload", "audio", "code"].includes(bType)) actualType = "task";
// //         const nb: AssessmentBlock = {
// //             id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
// //             type: actualType,
// //             linkedTopicId,
// //             title: actualType === "section" ? "New Section" : "",
// //             content: "",
// //             question: "",
// //             marks: ["text", "mcq", "task"].includes(actualType) ? 5 : ["checklist", "qcto_workplace"].includes(actualType) ? 10 : 0,
// //             options: actualType === "mcq" ? ["", "", "", ""] : [],
// //             correctOption: 0,
// //         };
// //         if (actualType === "checklist") {
// //             nb.title = "Demonstrate the use of various functionalities:";
// //             nb.criteria = ["Task criterion 1", "Task criterion 2"];
// //             nb.requireTimeTracking = true;
// //             nb.requirePerCriterionTiming = true;
// //             nb.requireObservationDeclaration = true;
// //             nb.requireEvidencePerCriterion = true;
// //         } else if (actualType === "logbook") {
// //             nb.title = "Workplace Logbook Entry";
// //             nb.content = "Learner must log assignment tasks, start/finish times, and total hours.";
// //         } else if (actualType === "qcto_workplace") {
// //             nb.title = "Workplace Experience Checkpoint";
// //             nb.weCode = "WM-01-WE01";
// //             nb.weTitle = "Attend induction program";
// //             nb.workActivities = [
// //                 {
// //                     id: mkId(),
// //                     code: "WA0101",
// //                     description: "Define the problem",
// //                     evidenceItems: [{ id: mkId(), code: "SE0101", description: "Logbook entry / Signed attendance register" }],
// //                 },
// //             ];
// //             nb.requireSelfAssessment = true;
// //             nb.requireGoalPlanning = true;
// //         } else if (actualType === "task") {
// //             nb.question = bType === "upload" ? "Please upload your evidence:" : bType === "audio" ? "Please record your verbal response:" : bType === "code" ? "Please write your code:" : "Describe or demonstrate your solution:";
// //             nb.allowText = bType === "task";
// //             nb.allowUpload = ["upload", "task"].includes(bType);
// //             nb.allowAudio = ["audio", "task"].includes(bType);
// //             nb.allowUrl = ["code", "task"].includes(bType);
// //             nb.allowCode = ["code", "task"].includes(bType);
// //             nb.allowedFileTypes = "all";
// //             nb.codeLanguage = "javascript";
// //         }
// //         setBlocks((p) => [...p, nb]);
// //         setTimeout(() => {
// //             setFocusedBlock(nb.id);
// //             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
// //         }, 60);
// //     };

// //     const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) => setBlocks((p) => p.map((b) => (b.id === id ? { ...b, [field]: val } : b)));
// //     const updateOption = (bid: string, idx: number, val: string) => setBlocks((p) => p.map((b) => { if (b.id !== bid || !b.options) return b; const o = [...b.options]; o[idx] = val; return { ...b, options: o }; }));

// //     const removeBlock = (id: string) => {
// //         setBlockToRemove(id);
// //     };

// //     const executeRemoveBlock = () => {
// //         if (!blockToRemove) return;
// //         setBlocks((p) => p.filter((b) => b.id !== blockToRemove));
// //         setFocusedBlock(null);
// //         toast.info("Block removed");
// //         setBlockToRemove(null);
// //     };

// //     const resetModuleInfo = () => {
// //         setShowResetConfirm(true);
// //     };

// //     const executeResetModuleInfo = () => {
// //         setModuleInfo({
// //             title: "", nqfLevel: "", credits: 0, notionalHours: 0, moduleNumber: "",
// //             occupationalCode: "", saqaQualId: "", qualificationTitle: "", timeLimit: 0,
// //         });
// //         setSelectedProgrammeId("");
// //         setSelectedModuleCode("");
// //         setTopics([]);
// //         setShowResetConfirm(false);
// //     };

// //     const moveBlock = (id: string, dir: "up" | "down") => setBlocks((p) => {
// //         const i = p.findIndex((b) => b.id === id);
// //         if ((dir === "up" && i === 0) || (dir === "down" && i === p.length - 1)) return p;
// //         const n = [...p], sw = dir === "up" ? i - 1 : i + 1;
// //         [n[i], n[sw]] = [n[sw], n[i]];
// //         return n;
// //     });

// //     const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
// //     const qCount = blocks.filter((b) => ["text", "mcq", "task", "checklist", "qcto_workplace"].includes(b.type)).length;
// //     const coveredTopicIds = new Set(blocks.map((b) => b.linkedTopicId).filter(Boolean) as string[]);

// //     const handleSave = async (status: AssessmentStatusType | "force_draft", isAutoSave = false) => {
// //         if (!title.trim() && !isAutoSave) {
// //             toast.warning("Please enter a Workbook Title.");
// //             return;
// //         }

// //         if (cohortIds.length === 0 && !isAutoSave && (status === "active" || status === "scheduled" || status === "upcoming")) {
// //             toast.warning("Please select at least one Cohort to publish this to.");
// //             return;
// //         }

// //         if (!isAutoSave) setLoading(true);
// //         setSaveStatus("saving");

// //         try {
// //             const sanitizedBlocks = blocks.map((b) => {
// //                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
// //                 if (b.imageUrl) c.imageUrl = b.imageUrl;
// //                 if (b.imageCaption) c.imageCaption = b.imageCaption;
// //                 if (b.linkedTopicId) {
// //                     const t = topics.find((tp) => tp.id === b.linkedTopicId);
// //                     if (t) c.linkedTopicCode = t.code;
// //                     c.linkedTopicId = b.linkedTopicId;
// //                 }
// //                 if (b.type === "section") { c.title = b.title || "Untitled Section"; c.content = b.content || ""; }
// //                 if (["checklist", "logbook", "qcto_workplace"].includes(b.type)) c.title = b.title || "Untitled";
// //                 if (["info", "logbook"].includes(b.type)) c.content = b.content || "";
// //                 if (["text", "mcq", "task"].includes(b.type)) c.question = b.question || "";
// //                 if (b.type === "mcq") { c.options = b.options || ["", "", "", ""]; c.correctOption = b.correctOption || 0; }
// //                 if (b.type === "checklist") {
// //                     c.criteria = b.criteria || [];
// //                     c.requireTimeTracking = b.requireTimeTracking !== false;
// //                     c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
// //                     c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
// //                     c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
// //                 }
// //                 if (b.type === "qcto_workplace") {
// //                     c.weCode = b.weCode || ""; c.weTitle = b.weTitle || "";
// //                     c.workActivities = b.workActivities || [];
// //                     c.requireSelfAssessment = b.requireSelfAssessment !== false;
// //                     c.requireGoalPlanning = b.requireGoalPlanning !== false;
// //                 }
// //                 if (b.type === "task") {
// //                     c.allowText = b.allowText; c.allowUpload = b.allowUpload; c.allowAudio = b.allowAudio;
// //                     c.allowUrl = b.allowUrl; c.allowCode = b.allowCode; c.allowedFileTypes = b.allowedFileTypes;
// //                     c.codeLanguage = b.codeLanguage;
// //                 }
// //                 return c;
// //             });

// //             let finalStatus: AssessmentStatusType = status === "force_draft" ? "draft" : status;
// //             let finalScheduledDate: string | null = null;

// //             if (releaseState === "scheduled" && scheduledDate) {
// //                 finalScheduledDate = new Date(scheduledDate).toISOString();
// //             }

// //             if (isAutoSave) {
// //                 finalStatus = statusRef.current;
// //             } else if (isDeployed && status === "draft") {
// //                 finalStatus = statusRef.current;
// //             } else if (status === "active") {
// //                 if (releaseState === "scheduled" && finalScheduledDate) finalStatus = "scheduled";
// //                 else if (releaseState === "upcoming") finalStatus = "upcoming";
// //                 else finalStatus = "active";
// //             } else if (status === "force_draft") {
// //                 if (!window.confirm("Are you sure you want to unpublish this workbook? It will be hidden from learners and reverted to a Draft.")) {
// //                     setSaveStatus("saved");
// //                     setLoading(false);
// //                     return;
// //                 }
// //                 finalStatus = "draft";
// //                 finalScheduledDate = null;
// //                 setReleaseState("active");
// //                 setScheduledDate("");
// //             }

// //             let targetDocId = assessmentId;

// //             if (!targetDocId) {
// //                 const sanitizedModuleCode = selectedModuleCode ? selectedModuleCode.replace(/[\s/]+/g, "-").toUpperCase() : null;
// //                 const sanitizedType = type ? type.replace(/[\s/]+/g, "-").toLowerCase() : null;

// //                 const baseComposite = (sanitizedModuleCode && sanitizedType)
// //                     ? `${sanitizedModuleCode}_${sanitizedType}`
// //                     : null;

// //                 const uniqueTag = Math.random().toString(36).slice(2, 6).toUpperCase();

// //                 targetDocId = baseComposite ? `${baseComposite}_${uniqueTag}` : doc(collection(db, "assessments")).id;
// //             }

// //             // GOOGLE CLOUD TASKS: Auto-Sweeper Scheduling
// //             // Only schedule the task if it is genuinely published as 'scheduled'.
// //             // If it is 'draft' or 'force_draft', we aggressively cancel existing tasks and do not create new ones.
// //             let newTaskId = autoCloseTaskId;
// //             try {
// //                 const functions = getFunctions();

// //                 // If unpublishing OR saving as draft, cancel any existing task immediately
// //                 if ((status === "force_draft" || finalStatus === "draft") && autoCloseTaskId) {
// //                     const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
// //                     await cancelTask({ taskId: autoCloseTaskId }).catch((e) => console.log(e));
// //                     newTaskId = null;
// //                     setAutoCloseTaskId(null);
// //                 }
// //                 // If genuinely publishing/scheduling, calculate the end time and create the task
// //                 else if (finalStatus === "scheduled" && releaseState === "scheduled" && finalScheduledDate && moduleInfo.timeLimit) {
// //                     const startTime = new Date(finalScheduledDate);
// //                     const endTimeMs = startTime.getTime() + (moduleInfo.timeLimit * 60000);
// //                     const endTime = new Date(endTimeMs);

// //                     // Only schedule if the end time is genuinely in the future
// //                     if (endTime.getTime() > Date.now()) {
// //                         // Cancel any old task first just in case dates changed
// //                         if (autoCloseTaskId) {
// //                             const cancelTask = httpsCallable(functions, "cancelAssessmentSweep");
// //                             await cancelTask({ taskId: autoCloseTaskId }).catch(() => { });
// //                         }

// //                         const scheduleTask = httpsCallable(functions, "scheduleAssessmentSweep");
// //                         const res = await scheduleTask({
// //                             assessmentId: targetDocId,
// //                             scheduledEndTimeISO: endTime.toISOString()
// //                         });
// //                         newTaskId = (res.data as any).taskId;
// //                         setAutoCloseTaskId(newTaskId);
// //                     }
// //                 }
// //             } catch (err) {
// //                 console.error("Failed to manage Cloud Tasks for Auto-Sweep:", err);
// //                 if (!isAutoSave) toast.warning("Saved, but failed to sync timer with Cloud Tasks. Check logs.");
// //             }

// //             const isFirstPublish = finalStatus !== "draft" && statusRef.current === "draft";
// //             const unnotifiedCohorts = cohortIds.filter(id => !notifiedCohortIds.includes(id));
// //             const isReadyToNotify = ["active", "scheduled", "upcoming"].includes(finalStatus) && status !== "force_draft";

// //             const nextNotifiedArray = (isReadyToNotify && unnotifiedCohorts.length > 0)
// //                 ? [...notifiedCohortIds, ...unnotifiedCohorts]
// //                 : notifiedCohortIds;

// //             const payload: any = {
// //                 id: targetDocId,
// //                 title, type, moduleType, cohortIds,
// //                 notifiedCohortIds: nextNotifiedArray,
// //                 collaboratorIds,
// //                 linkedProgrammeId: selectedProgrammeId,
// //                 linkedModuleCode: selectedModuleCode,
// //                 scheduledDate: finalScheduledDate,
// //                 isScheduled: releaseState === "scheduled",
// //                 instructions: instructions || "",
// //                 requiresInvigilation: moduleType === 'knowledge' ? requiresInvigilation : false,
// //                 moduleInfo, showModuleHeader, isOpenBook, referenceManualUrl,
// //                 learnerGuide: {
// //                     note: learnerNote, purpose: modulePurpose, entryRequirements,
// //                     providerRequirements, exemptions, assessmentInfo: instructions, stakeholderGuidelines,
// //                 },
// //                 topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
// //                 lastUpdated: new Date().toISOString(),
// //                 lastUpdatedBy: user?.uid,
// //                 isWorkbook: true,
// //                 autoCloseTaskId: newTaskId || null,
// //             };

// //             if (targetDocId !== assessmentId) {
// //                 payload.createdAt = new Date().toISOString();
// //             }

// //             if (creatorId) {
// //                 payload.createdBy = creatorId;
// //                 payload.facilitatorId = creatorId;
// //             } else {
// //                 payload.createdBy = user?.uid;
// //                 payload.facilitatorId = user?.uid;
// //             }

// //             if (isFirstPublish) {
// //                 payload.publishedBy = user?.uid;
// //             } else if (publisherId) {
// //                 payload.publishedBy = publisherId;
// //             }

// //             const batch = writeBatch(db);

// //             const assessmentRef = doc(db, "assessments", targetDocId);
// //             batch.set(assessmentRef, payload, { merge: true });

// //             if (["active", "scheduled", "upcoming", "completed"].includes(finalStatus)) {
// //                 const allEnrollments: any[] = [];
// //                 for (const cid of cohortIds) {
// //                     const enrolQuery = query(collection(db, "enrollments"), where("cohortId", "==", cid), where("status", "==", "active"));
// //                     const enrolSnap = await getDocs(enrolQuery);
// //                     enrolSnap.docs.forEach(d => allEnrollments.push({ id: d.id, ...d.data() }));
// //                 }

// //                 if (allEnrollments.length > 0) {
// //                     const existingSubQuery = query(collection(db, "learner_submissions"), where("assessmentId", "==", targetDocId));
// //                     const existingSubSnap = await getDocs(existingSubQuery);
// //                     const existingIds = new Set(existingSubSnap.docs.map((d) => d.id));

// //                     allEnrollments.forEach((enrol) => {
// //                         const targetLearnerId = enrol.learnerId || enrol.id;
// //                         const sid = `${enrol.cohortId}_${targetLearnerId}_${targetDocId}`;
// //                         const ref = doc(db, "learner_submissions", sid);

// //                         const subData: any = {
// //                             title: payload.title,
// //                             type: payload.type,
// //                             moduleType: payload.moduleType,
// //                             totalMarks: payload.totalMarks,
// //                             moduleNumber: payload.moduleInfo?.moduleNumber || "",
// //                             updatedAt: new Date().toISOString()
// //                         };

// //                         if (!existingIds.has(sid)) {
// //                             batch.set(ref, {
// //                                 ...subData,
// //                                 learnerId: targetLearnerId,
// //                                 enrollmentId: enrol.id,
// //                                 authUid: targetLearnerId,
// //                                 assessmentId: targetDocId,
// //                                 cohortId: enrol.cohortId,
// //                                 status: "not_started",
// //                                 assignedAt: new Date().toISOString(),
// //                                 marks: 0,
// //                                 createdAt: new Date().toISOString(),
// //                                 createdBy: user?.uid || "System",
// //                             });
// //                         } else {
// //                             batch.set(ref, subData, { merge: true });
// //                         }
// //                     });
// //                 }
// //             }

// //             await batch.commit();

// //             if (isReadyToNotify && unnotifiedCohorts.length > 0 && !isAutoSave) {
// //                 if (sendNotification) {
// //                     const inviteDate = finalScheduledDate;
// //                     toast.info(`Sending email notifications to ${unnotifiedCohorts.length} assigned cohort(s)...`);

// //                     try {
// //                         const functions = getFunctions();
// //                         const sendCalendarInvites = httpsCallable(functions, "sendAssessmentCalendarInvites");

// //                         sendCalendarInvites({
// //                             assessmentId: targetDocId,
// //                             title: payload.title,
// //                             scheduledDate: inviteDate,
// //                             timeLimit: payload.moduleInfo?.timeLimit || 60,
// //                             cohortIds: unnotifiedCohorts,
// //                             platformLink: `${window.location.origin}/learner/assessment/${targetDocId}`,
// //                             moduleType: payload.moduleType,
// //                             assessmentType: payload.type,
// //                             moduleNumber: payload.moduleInfo?.moduleNumber,
// //                             qualificationTitle: payload.moduleInfo?.qualificationTitle
// //                         }).then(() => {
// //                             toast.success("Learners notified successfully.");
// //                             setNotifiedCohortIds(nextNotifiedArray);
// //                         }).catch(err => {
// //                             console.error("Cloud function error:", err);
// //                             toast.error("Workbook saved, but notification failed to send.");
// //                         });
// //                     } catch (err) {
// //                         console.error("Failed to call cloud function:", err);
// //                     }
// //                 } else {
// //                     setNotifiedCohortIds(nextNotifiedArray);
// //                     toast.success("Workbook published silently (no emails sent).");
// //                 }
// //             } else if (!isAutoSave) {
// //                 if (status === "force_draft") toast.success("Workbook Unpublished & Reverted to Draft!");
// //                 else if (finalStatus === "active") toast.success("Workbook Published & Updated!");
// //                 else if (finalStatus === "scheduled") toast.success("Workbook Scheduled Successfully!");
// //                 else if (finalStatus === "upcoming") toast.success("Workbook Saved as Coming Soon!");
// //                 else toast.success("Draft saved!");
// //             }

// //             setAssessmentStatus(finalStatus);
// //             if (isFirstPublish) setPublisherId(user?.uid || null);
// //             if (!creatorId) setCreatorId(user?.uid || null);

// //             setSaveStatus("saved");
// //             setLastSaved(new Date());

// //             if (!isAutoSave && targetDocId !== assessmentId) {
// //                 navigate(`/facilitator/assessments/builder/${targetDocId}`, { replace: true });
// //             }

// //         } catch (err: any) {
// //             console.error("[SAVE ERROR]:", err);
// //             setSaveStatus("unsaved");
// //             if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
// //         } finally {
// //             if (!isAutoSave) setLoading(false);
// //         }
// //     };


// //     const toggleCollaborator = (staffId: string) => {
// //         setCollaboratorIds(prev => {
// //             if (prev.includes(staffId)) return prev.filter(id => id !== staffId);
// //             return [...prev, staffId];
// //         });
// //     };

// //     const activeProgramme = programmes.find((p) => p.id === selectedProgrammeId);

// //     return (
// //         <div className="ab-root animate-fade-in">
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

// //             {/* ── TOPBAR ── */}
// //             <header className="ab-topbar">
// //                 <div className="ab-topbar-left">
// //                     <button className="ab-hamburger-btn" onClick={() => setIsMobileMenuOpen(true)}>
// //                         <Menu size={20} />
// //                     </button>
// //                     <Tooltip content="Return to assessments list" placement="bottom">
// //                         <button className="ab-back-btn" onClick={handleBackNavigation}>
// //                             <ArrowLeft size={18} />
// //                             <span className="ab-hide-mobile">Back</span>
// //                         </button>
// //                     </Tooltip>
// //                 </div>
// //                 <div className="ab-topbar-centre">
// //                     <BookOpen size={16} className="ab-topbar-icon" />
// //                     <span className="ab-topbar-title">{title || "Untitled Workbook"}</span>
// //                     <span className={`ab-topbar-badge ${type.toLowerCase().replace(/ /g, '-')} ab-hide-mobile`}>{type}</span>

// //                     {isLiveSyncing && (
// //                         <span className="ab-topbar-badge active" style={{ animation: 'pulse 1.5s infinite', marginLeft: '8px' }}>
// //                             <Activity size={12} style={{ marginRight: '4px' }} /> Syncing Remote Changes...
// //                         </span>
// //                     )}
// //                 </div>
// //                 <div className="ab-topbar-actions">
// //                     <div className="ab-stats-pill ab-hide-mobile">
// //                         <span><strong>{qCount}</strong> Qs</span>
// //                         <div className="ab-sdiv" />
// //                         <span><strong>{totalMarks}</strong> marks</span>
// //                     </div>
// //                     <div className={`ab-save-status ${saveStatus} ab-hide-mobile`}>
// //                         {saveStatus === "saved" && (
// //                             <>
// //                                 <Check size={13} />
// //                                 <span>Saved</span>
// //                                 {lastSaved && <span className="ab-save-time">{new Date(lastSaved).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
// //                             </>
// //                         )}
// //                         {saveStatus === "saving" && (
// //                             <>
// //                                 <div className="ab-spinner" />
// //                                 <span>Saving…</span>
// //                             </>
// //                         )}
// //                         {saveStatus === "unsaved" && (
// //                             <>
// //                                 <AlertTriangle size={13} />
// //                                 <span>Unsaved</span>
// //                             </>
// //                         )}
// //                     </div>

// //                     <Tooltip content="Share with other staff" placement="bottom">
// //                         <button className={`ab-btn ab-btn-ghost ${collaboratorIds.length > 0 ? 'ab-btn-ghost--active' : ''}`} onClick={() => setShowCollaboratorModal(true)}>
// //                             <Users size={15} />
// //                             <span className="ab-hide-mobile">Share {collaboratorIds.length > 0 && `(${collaboratorIds.length})`}</span>
// //                         </button>
// //                     </Tooltip>

// //                     {/* CLONE BUTTON */}
// //                     {assessmentId && (
// //                         <Tooltip content="Duplicate this workbook" placement="bottom">
// //                             <button className="ab-btn ab-btn-ghost" onClick={handleClone}>
// //                                 <Copy size={15} />
// //                                 <span className="ab-hide-mobile">Clone</span>
// //                             </button>
// //                         </Tooltip>
// //                     )}

// //                     {assessmentId && (
// //                         <Tooltip content="Preview what learners will see" placement="bottom">
// //                             <button className="ab-btn ab-btn-ghost" onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, "_blank")}>
// //                                 <Eye size={15} />
// //                                 <span className="ab-hide-mobile">Preview</span>
// //                             </button>
// //                         </Tooltip>
// //                     )}

// //                     {/* UNPUBLISH BUTTON */}
// //                     {isDeployed && (
// //                         <Tooltip content="Revert to Draft (Hide from Learners)" placement="bottom">
// //                             <button className="ab-btn ab-btn-ghost" style={{ color: '#ef4444' }} onClick={() => handleSave("force_draft")}>
// //                                 <EyeOff size={15} />
// //                                 <span className="ab-hide-mobile">Unpublish</span>
// //                             </button>
// //                         </Tooltip>
// //                     )}

// //                     {!isDeployed && (
// //                         <button className="ab-btn ab-btn-ghost ab-hide-mobile" onClick={() => handleSave("draft")} disabled={loading}>
// //                             {loading ? "Saving…" : "Save Draft"}
// //                         </button>
// //                     )}
// //                     <button className="ab-btn ab-btn-primary" onClick={() => handleSave("active")} disabled={loading}>
// //                         <Zap size={15} />
// //                         <span className="ab-hide-mobile">{isDeployed ? "Update" : "Publish"}</span>
// //                     </button>
// //                 </div>
// //             </header>

// //             <div className="ab-body">
// //                 {isMobileMenuOpen && <div className="ab-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)} />}

// //                 {/* ── SIDEBAR ── */}
// //                 <aside className={`ab-sidebar ${isMobileMenuOpen ? "open" : ""}`}>
// //                     <button className="ab-close-btn" onClick={() => setIsMobileMenuOpen(false)}>
// //                         <X size={22} />
// //                     </button>
// //                     <nav className="ab-sidebar-nav">
// //                         {(
// //                             [
// //                                 { id: "settings", icon: <Settings size={14} />, label: "Settings", tooltip: "Basic workbook settings" },
// //                                 { id: "module", icon: <GraduationCap size={14} />, label: "Module", tooltip: "QCTO module info" },
// //                                 { id: "topics", icon: <ListChecks size={14} />, label: "Topics", tooltip: "Manage topic elements" },
// //                                 { id: "guide", icon: <BookMarked size={14} />, label: "Guide", tooltip: "Learner guide content" },
// //                                 { id: "outline", icon: <Eye size={14} />, label: "Outline", tooltip: "View workbook structure" },
// //                             ] as const
// //                         ).map((t) => (
// //                             <Tooltip key={t.id} content={t.tooltip} placement="bottom">
// //                                 <button className={`ab-nav-btn ${activePanel === t.id ? "active" : ""}`} onClick={() => { setActivePanel(t.id); setIsMobileMenuOpen(false); }}>
// //                                     {t.icon}
// //                                     <span>{t.label}</span>
// //                                 </button>
// //                             </Tooltip>
// //                         ))}
// //                     </nav>

// //                     <div className="ab-sidebar-body">
// //                         {/* ── SETTINGS PANEL ── */}
// //                         {activePanel === "settings" && (
// //                             <>
// //                                 <SectionHdr icon={<Database size={13} />} label="Curriculum Link" />
// //                                 <FG label="Programme Template">
// //                                     <div className="ab-row-gap">
// //                                         <div className="ab-sel-wrap ab-flex-1">
// //                                             <select className="ab-input ab-sel" value={selectedProgrammeId} onChange={(e) => { setSelectedProgrammeId(e.target.value); setSelectedModuleCode(""); }}>
// //                                                 <option value="">-- Custom / Blank --</option>
// //                                                 {programmes.filter((p) => !p.isArchived).map((p) => (
// //                                                     <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>
// //                                                 ))}
// //                                             </select>
// //                                             <ChevronDown size={12} className="ab-sel-arr" />
// //                                         </div>
// //                                         {user?.role === 'admin' && (
// //                                             <Tooltip content="Create Blueprint" placement="top">
// //                                                 <button className="ab-btn ab-btn-ghost ab-btn-sm" onClick={() => setShowProgrammeModal(true)}>
// //                                                     <Plus size={13} /> New
// //                                                 </button>
// //                                             </Tooltip>
// //                                         )}

// //                                     </div>
// //                                 </FG>
// //                                 {selectedProgrammeId && activeProgramme && (
// //                                     <FG label="Module (auto-populates topics)">
// //                                         <div className="ab-sel-wrap">
// //                                             <select className="ab-input ab-sel" value={selectedModuleCode} onChange={(e) => setSelectedModuleCode(e.target.value)}>
// //                                                 <option value="">-- Select Module --</option>
// //                                                 {(activeProgramme.knowledgeModules || []).length > 0 && (
// //                                                     <optgroup label="Knowledge Modules (KM)">
// //                                                         {activeProgramme.knowledgeModules.map((m: any, i: number) => {
// //                                                             const v = m.code || m.name || `mod-km-${i}`;
// //                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
// //                                                         })}
// //                                                     </optgroup>
// //                                                 )}
// //                                                 {(activeProgramme.practicalModules || []).length > 0 && (
// //                                                     <optgroup label="Practical Modules (PM)">
// //                                                         {activeProgramme.practicalModules.map((m: any, i: number) => {
// //                                                             const v = m.code || m.name || `mod-pm-${i}`;
// //                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
// //                                                         })}
// //                                                     </optgroup>
// //                                                 )}
// //                                                 {(activeProgramme.workExperienceModules || []).length > 0 && (
// //                                                     <optgroup label="Workplace Modules (WM)">
// //                                                         {activeProgramme.workExperienceModules.map((m: any, i: number) => {
// //                                                             const v = m.code || m.name || `mod-wm-${i}`;
// //                                                             return <option key={v} value={v}>{m.code ? `${m.code} - ` : ""}{m.name || "Unnamed"}</option>;
// //                                                         })}
// //                                                     </optgroup>
// //                                                 )}
// //                                             </select>
// //                                             <ChevronDown size={12} className="ab-sel-arr" />
// //                                         </div>
// //                                     </FG>
// //                                 )}

// //                                 <div className="ab-divider" />
// //                                 <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />

// //                                 <div className="ab-meta-card">
// //                                     <div className="ab-form-group">
// //                                         <label className="ab-fg-label ab-label-icon">
// //                                             <BookOpen size={12} /> Module Curriculum Type
// //                                         </label>
// //                                         <select className="ab-input ab-input--accent" value={moduleType} onChange={(e) => handleModuleTypeChange(e.target.value as any)}>
// //                                             <option value="knowledge">Knowledge Module (Standard Questions)</option>
// //                                             <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
// //                                             <option value="workplace">Workplace Experience Module (Logbooks)</option>
// //                                         </select>
// //                                         <span className="ab-input-hint">* Categorizes the assessment type in your database.</span>
// //                                     </div>
// //                                     <div className="ab-form-group">
// //                                         <label className="ab-fg-label">Assessment Type Category</label>
// //                                         <select className="ab-input" value={type} onChange={(e) => handleTypeChange(e.target.value)}>
// //                                             <optgroup label="Formal QCTO Assessments">
// //                                                 <option value="formative">Formative Assessment (Internal)</option>
// //                                                 <option value="summative">Summative Assessment (Internal/FISA)</option>
// //                                                 <option value="Practical Observation">Practical Observation</option>
// //                                                 <option value="Workplace Logbook">Workplace Logbook</option>
// //                                             </optgroup>
// //                                             <optgroup label="Informal / Practice">
// //                                                 <option value="Developmental Activity">Developmental Activity</option>
// //                                                 <option value="Practice Set">Practice Set / Mock Exam</option>
// //                                                 <option value="Task">Learning Task</option>
// //                                             </optgroup>
// //                                         </select>
// //                                     </div>
// //                                 </div>

// //                                 <FG label="Title">
// //                                     <input className="ab-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Workbook title…" />
// //                                 </FG>

// //                                 <div className="ab-meta-grid-inputs">
// //                                     <FG label="Time Limit (Mins)">
// //                                         <div className="ab-row-gap">
// //                                             <Clock size={15} className="ab-input-icon" />
// //                                             <input
// //                                                 type="number"
// //                                                 min="0"
// //                                                 className="ab-input"
// //                                                 placeholder="60"
// //                                                 value={moduleInfo.timeLimit ?? ""}
// //                                                 onChange={(e) => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })}
// //                                             />
// //                                         </div>
// //                                         <span className="ab-input-hint">0 = no limit</span>
// //                                     </FG>
// //                                 </div>

// //                                 <div>
// //                                     <FG label="Learner Visibility & Release">
// //                                         <div className="ab-form-group">
// //                                             {/* REMOVED disabled={isDeployed} SO THEY CAN CHANGE RELEASE STATE ANYTIME */}
// //                                             <select
// //                                                 className="ab-input ab-input--accent"
// //                                                 value={releaseState}
// //                                                 onChange={(e) => setReleaseState(e.target.value as any)}
// //                                             >
// //                                                 <option value="active">Open Immediately (Active)</option>
// //                                                 <option value="upcoming">Locked (Show as 'Coming Soon')</option>
// //                                                 <option value="scheduled">Scheduled (Strict Live Countdown)</option>
// //                                             </select>
// //                                         </div>

// //                                         {releaseState === "scheduled" && (
// //                                             <>
// //                                                 <div className="ab-row-gap" style={{ marginTop: '8px' }}>
// //                                                     <Calendar size={15} className="ab-input-icon" />
// //                                                     <input
// //                                                         type="datetime-local"
// //                                                         className="ab-input"
// //                                                         value={scheduledDate}
// //                                                         onChange={(e) => setScheduledDate(e.target.value)}
// //                                                     />
// //                                                 </div>
// //                                                 {/* QUICK ACTION: CANCEL SCHEDULE */}
// //                                                 {isDeployed && assessmentStatus === "scheduled" && (
// //                                                     <button
// //                                                         className="ab-text-btn"
// //                                                         style={{ color: '#ef4444', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
// //                                                         onClick={() => { setReleaseState("upcoming"); toast.info("Click 'Update' to securely lock the assessment and cancel the schedule."); }}
// //                                                     >
// //                                                         <Lock size={13} /> Cancel Schedule & Lock Assessment
// //                                                     </button>
// //                                                 )}
// //                                             </>
// //                                         )}
// //                                         {releaseState === "upcoming" && (
// //                                             <span className="ab-input-hint" style={{ color: 'var(--mlab-amber)', marginTop: '8px', display: 'block' }}>
// //                                                 Learners will see this in their portfolio as "Coming Soon", but cannot open it until you change it to Active.
// //                                             </span>
// //                                         )}
// //                                     </FG>
// //                                 </div>

// //                                 {/* Security Settings / Proctoring */}
// //                                 <div className="ab-openbook-card" style={{ marginTop: '0', marginBottom: '1rem', borderLeftColor: moduleType === 'knowledge' ? '#e11d48' : '#cbd5e1', background: requiresInvigilation ? '#fff1f2' : undefined }}>
// //                                     <label className={`ab-check-row ${moduleType !== 'knowledge' ? 'ab-disabled' : ''}`}>
// //                                         <input
// //                                             type="checkbox"
// //                                             checked={requiresInvigilation}
// //                                             onChange={(e) => setRequiresInvigilation(e.target.checked)}
// //                                             disabled={moduleType !== 'knowledge' || isDeployed}
// //                                             className="ab-checkbox"
// //                                             style={requiresInvigilation ? { accentColor: '#e11d48' } : undefined}
// //                                         />
// //                                         <span className="ab-check-label" style={{ color: requiresInvigilation ? '#be123c' : 'inherit' }}>
// //                                             <ShieldAlert size={14} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '4px' }} />
// //                                             Enable Live Web Proctoring (Invigilation)
// //                                         </span>
// //                                     </label>
// //                                     {moduleType !== 'knowledge' ? (
// //                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px' }}>Live proctoring is automatically disabled for Practical and Workplace logbooks.</p>
// //                                     ) : (
// //                                         <p className="ab-input-hint" style={{ marginTop: '4px', marginLeft: '24px', color: requiresInvigilation ? '#9f1239' : 'inherit' }}>Locks the browser to fullscreen and records webcam snapshots of tab-switching violations.</p>
// //                                     )}
// //                                 </div>

// //                                 {/* Open Book Reference Manual */}
// //                                 <div className="ab-openbook-card">
// //                                     <label className="ab-check-row">
// //                                         <input type="checkbox" checked={isOpenBook} onChange={(e) => { setIsOpenBook(e.target.checked); if (!e.target.checked) setReferenceManualUrl(""); }} className="ab-checkbox" />
// //                                         <span className="ab-check-label ab-check-label--sky">Enable Open Book Reference Manual</span>
// //                                     </label>
// //                                     {isOpenBook && (
// //                                         <div className="ab-openbook-body">
// //                                             {referenceManualUrl ? (
// //                                                 <div className="ab-manual-linked">
// //                                                     <span className="ab-manual-linked__name"><FileArchive size={13} /> Manual Linked</span>
// //                                                     <button onClick={() => setReferenceManualUrl("")} className="ab-manual-linked__remove"><Trash2 size={13} /></button>
// //                                                 </div>
// //                                             ) : (
// //                                                 <>
// //                                                     <p className="ab-input-hint">Upload a PDF learners can view inside the assessment player.</p>
// //                                                     <label className={`ab-btn ab-btn-primary ab-btn-upload ${isUploadingManual ? "ab-btn--disabled" : ""}`}>
// //                                                         {isUploadingManual ? "Uploading…" : <><UploadCloud size={13} /> Select PDF Manual</>}
// //                                                         <input type="file" accept="application/pdf" hidden disabled={isUploadingManual} onChange={handleManualUpload} />
// //                                                     </label>
// //                                                 </>
// //                                             )}
// //                                         </div>
// //                                     )}
// //                                 </div>

// //                                 {/* Cohort Assignment & Notifications */}
// //                                 <div className="ab-fg">
// //                                     <div className="ab-fg-header">
// //                                         <label className="ab-fg-label">Assign to Cohorts</label>
// //                                         <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
// //                                             {/* SELECT ALL TOGGLE BUTTON */}
// //                                             {cohorts.length > 0 && (
// //                                                 <button
// //                                                     className="ab-text-btn"
// //                                                     onClick={toggleSelectAllCohorts}
// //                                                     style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}
// //                                                 >
// //                                                     {cohortIds.length === cohorts.length ? <Square size={13} /> : <CheckSquareIcon size={13} />}
// //                                                     {cohortIds.length === cohorts.length ? "Deselect All" : "Select All"}
// //                                                 </button>
// //                                             )}
// //                                             {user?.role === 'admin' && (
// //                                                 <button className="ab-text-btn" onClick={() => setShowCohortModal(true)}>+ New Class</button>
// //                                             )}
// //                                         </div>
// //                                     </div>

// //                                     {/* Visual counter of selected cohorts */}
// //                                     {cohortIds.length > 0 && (
// //                                         <div style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', marginBottom: '8px', fontWeight: 'bold' }}>
// //                                             {cohortIds.length} Cohort(s) Selected
// //                                         </div>
// //                                     )}

// //                                     <div className="ab-cohort-panel">
// //                                         {cohorts.map((c) => (
// //                                             <label key={c.id} className="ab-cohort-row">
// //                                                 <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={(e) => { if (e.target.checked) setCohortIds((p) => [...p, c.id]); else setCohortIds((p) => p.filter((id) => id !== c.id)); }} className="ab-checkbox" />
// //                                                 <span className="ab-cohort-row__name">{c.name}</span>
// //                                                 <Tooltip content="View Class Register" placement="left">
// //                                                     <ExternalLink size={11} className="ab-cohort-row__link" onClick={(e) => { e.preventDefault(); navigate(`/cohorts/${c.id}`); }} />
// //                                                 </Tooltip>
// //                                             </label>
// //                                         ))}
// //                                         {cohorts.length === 0 && <span className="ab-empty-hint">No active classes available.</span>}
// //                                     </div>

// //                                     {/* SILENT PUBLISH TOGGLE */}
// //                                     <label className={`ab-check-row ${cohortIds.length === 0 ? 'ab-disabled' : ''}`} style={{ marginTop: '12px' }}>
// //                                         <input
// //                                             type="checkbox"
// //                                             checked={sendNotification}
// //                                             onChange={(e) => setSendNotification(e.target.checked)}
// //                                             disabled={cohortIds.length === 0}
// //                                             className="ab-checkbox ab-checkbox--amber"
// //                                         />
// //                                         <span className="ab-check-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                             <Mail size={14} color={sendNotification ? "var(--mlab-blue)" : "var(--mlab-grey)"} />
// //                                             Send email notification to newly assigned learners upon publishing
// //                                         </span>
// //                                     </label>

// //                                 </div>

// //                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
// //                                 <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Add instructions for learners…" />
// //                             </>
// //                         )}

// //                         {/* ── MODULE PANEL ── */}
// //                         {activePanel === "module" && (
// //                             <>
// //                                 <div className="ab-row-space">
// //                                     <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
// //                                     <Tooltip content={showModuleHeader ? "Hide" : "Show"} placement="left">
// //                                         <button className={`ab-toggle-icon ${!showModuleHeader ? "off" : ""}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
// //                                             {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
// //                                         </button>
// //                                     </Tooltip>
// //                                 </div>
// //                                 {showModuleHeader ? (
// //                                     <div className="animate-fade-in">
// //                                         <div className="ab-row-end">
// //                                             <Tooltip content="Clear all fields" placement="left">
// //                                                 <button className="ab-text-btn danger" onClick={resetModuleInfo}>
// //                                                     <RotateCcw size={12} /> Clear
// //                                                 </button>
// //                                             </Tooltip>
// //                                         </div>
// //                                         <FG label="Qualification Title"><input className="ab-input" value={moduleInfo.qualificationTitle} onChange={(e) => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} /></FG>
// //                                         <FG label="Module Number"><input className="ab-input" value={moduleInfo.moduleNumber} onChange={(e) => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} /></FG>
// //                                         <div className="ab-meta-grid-inputs">
// //                                             <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={(e) => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
// //                                             <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={(e) => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
// //                                         </div>
// //                                         <div className="ab-meta-grid-inputs">
// //                                             <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={(e) => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
// //                                             <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={(e) => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
// //                                         </div>
// //                                         <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={(e) => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ab-hidden-state"><EyeOff size={22} /><p>Header hidden from canvas.</p></div>
// //                                 )}
// //                             </>
// //                         )}

// //                         {/* ── TOPICS PANEL ── */}
// //                         {activePanel === "topics" && (
// //                             <TopicsPanel
// //                                 topics={topics} coveredTopicIds={coveredTopicIds} editingTopicId={editingTopicId} editDraft={editDraft} addingTopic={addingTopic} newTopic={newTopic} deleteConfirmId={deleteConfirmId} isDeployed={isDeployed}
// //                                 onStartEdit={startEdit} onEditChange={(p) => setEditDraft((d) => ({ ...d, ...p }))} onCommitEdit={commitEdit} onCancelEdit={cancelEdit} onConfirmDelete={confirmDelete} onExecuteDelete={executeDelete} onCancelDelete={cancelDelete}
// //                                 onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }} onNewTopicChange={(p) => setNewTopic((d) => ({ ...d, ...p }))} onCommitAdd={commitAdd} onCancelAdd={cancelAdd}
// //                                 onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel("outline"); }}
// //                             />
// //                         )}

// //                         {/* ── GUIDE PANEL ── */}
// //                         {activePanel === "guide" && (
// //                             <>
// //                                 <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
// //                                 <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={(e) => setLearnerNote(e.target.value)} /></FG>
// //                                 <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={(e) => setModulePurpose(e.target.value)} /></FG>
// //                                 <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={(e) => setEntryRequirements(e.target.value)} /></FG>
// //                                 <FG label="Stakeholder Guidelines">
// //                                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
// //                                         <ReactQuill theme="snow" value={stakeholderGuidelines} onChange={setStakeholderGuidelines} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Instructions to Mentor, Employer responsibilities…" />
// //                                     </div>
// //                                 </FG>
// //                                 <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={(e) => setExemptions(e.target.value)} /></FG>
// //                             </>
// //                         )}

// //                         {/* ── OUTLINE PANEL ── */}
// //                         {activePanel === "outline" && (
// //                             <>
// //                                 <SectionHdr icon={<Eye size={13} />} label="Outline" />
// //                                 {blocks.length === 0 ? <p className="ab-prose sm">No blocks yet.</p> : (
// //                                     <ol className="ab-outline-list">
// //                                         {blocks.map((b, i) => (
// //                                             <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? "focused" : ""}`} onClick={() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}>
// //                                                 <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
// //                                                 <div className="ab-ol-text">
// //                                                     <span className="ab-ol-main">{b.type === "section" ? b.title || "Section" : b.type === "info" ? "Reading Material" : b.question?.replace(/<[^>]*>?/gm, '').slice(0, 40) || b.title || `Question ${i + 1}`}</span>
// //                                                 </div>
// //                                             </li>
// //                                         ))}
// //                                     </ol>
// //                                 )}
// //                             </>
// //                         )}
// //                     </div>
// //                 </aside>

// //                 {/* ── CANVAS ── */}
// //                 <main className="ab-canvas">
// //                     {!isDeployed && (
// //                         <div className="ab-floating-toolbar">
// //                             <span className="ab-toolbar-label ab-hide-mobile">Add:</span>
// //                             <Tooltip content="Section Title" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("section")}><Type size={15} /></button></Tooltip>
// //                             <Tooltip content="Reading Material" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("info")}><Info size={15} /></button></Tooltip>
// //                             <div className="ab-toolbar-divider" />
// //                             <Tooltip content="MCQ" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("mcq")}><CheckSquare size={15} /></button></Tooltip>
// //                             <Tooltip content="Written Question" placement="top"><button className="ab-tool-btn" onClick={() => addBlock("text")}><AlignLeft size={15} /></button></Tooltip>
// //                             <div className="ab-toolbar-divider" />
// //                             <Tooltip content="File Upload" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("upload")}><UploadCloud size={15} /></button></Tooltip>
// //                             <Tooltip content="Audio Recording" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("audio")}><Mic size={15} /></button></Tooltip>
// //                             <Tooltip content="Code Submission" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("code")}><Code size={15} /></button></Tooltip>
// //                             <Tooltip content="Multi-Modal Task" placement="top"><button className="ab-tool-btn ab-tool-btn--primary" onClick={() => addBlock("task")}><Layers size={15} /></button></Tooltip>
// //                             <div className="ab-toolbar-divider" />
// //                             <Tooltip content="Observation Checklist" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("checklist")}><ListChecks size={15} /></button></Tooltip>
// //                             <Tooltip content="Basic Logbook" placement="top"><button className="ab-tool-btn ab-tool-btn--practical" onClick={() => addBlock("logbook")}><CalendarRange size={15} /></button></Tooltip>
// //                             <Tooltip content="QCTO Workplace Checkpoint" placement="top"><button className="ab-tool-btn ab-tool-btn--qcto" onClick={() => addBlock("qcto_workplace")}><Briefcase size={15} /></button></Tooltip>
// //                         </div>
// //                     )}

// //                     <div className="ab-canvas-inner">
// //                         {isDeployed && (
// //                             <div className="ab-deployed-banner">
// //                                 <AlertTriangle size={20} />
// //                                 <div><strong>Strict Mode — Assessment Deployed.</strong> Structural changes are locked to protect learner data. You may edit text only.</div>
// //                             </div>
// //                         )}

// //                         {showModuleHeader && (
// //                             <div className="ab-module-card clickable" onClick={() => setActivePanel("module")}>
// //                                 <div className="ab-mc-left">
// //                                     <div className="ab-mc-badges">
// //                                         <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
// //                                         <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
// //                                         <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
// //                                         {moduleInfo.timeLimit ? (
// //                                             <span className="ab-mc-b ab-mc-b--timer"><Clock size={11} /> {moduleInfo.timeLimit}m</span>
// //                                         ) : null}
// //                                         <span className={`ab-mc-b type-${type.toLowerCase().replace(/ /g, '-')}`}>{type}</span>
// //                                     </div>
// //                                     <h1 className="ab-mc-title">{title || "Untitled Workbook"}</h1>
// //                                     <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
// //                                 </div>
// //                                 <div className="ab-mc-right">
// //                                     <div className="ab-mc-stat"><span className="ab-mc-val">{qCount}</span><span className="ab-mc-lbl">Qs</span></div>
// //                                     <div className="ab-mc-div" />
// //                                     <div className="ab-mc-stat"><span className="ab-mc-val">{totalMarks}</span><span className="ab-mc-lbl">Marks</span></div>
// //                                 </div>
// //                                 <div className="ab-mc-edit-hint"><Pencil size={11} /> Edit</div>
// //                             </div>
// //                         )}

// //                         {blocks.length === 0 ? (
// //                             <EmptyCanvas onAdd={addBlock} />
// //                         ) : (
// //                             <div className="ab-blocks-list">
// //                                 {blocks.map((b, idx) => (
// //                                     <BlockCard
// //                                         key={b.id} block={b} index={idx} total={blocks.length} topics={topics} focused={focusedBlock === b.id} isDeployed={isDeployed}
// //                                         onFocus={() => setFocusedBlock(b.id)} onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
// //                                     />
// //                                 ))}
// //                             </div>
// //                         )}
// //                     </div>
// //                 </main>
// //             </div>

// //             {deleteConfirmId && (
// //                 <DeleteOverlay topic={topics.find((t) => t.id === deleteConfirmId)!} linkedCount={blocks.filter((b) => b.linkedTopicId === deleteConfirmId).length} onConfirm={executeDelete} onCancel={cancelDelete} />
// //             )}

// //             {showProgrammeModal && (
// //                 <ProgrammeFormModal existingProgrammes={programmes} onClose={() => setShowProgrammeModal(false)} onSave={handleSaveNewProgramme} title="Create Curriculum Blueprint" />
// //             )}

// //             {showCohortModal && (
// //                 <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleSaveNewCohort} />
// //             )}

// //             {/* STATUS MODALS FOR DELETION & RESET */}
// //             {blockToRemove && (
// //                 <StatusModal
// //                     type="error"
// //                     title="Remove Block"
// //                     message="Are you sure you want to remove this block from the assessment?"
// //                     confirmText="Remove"
// //                     onClose={executeRemoveBlock}
// //                     onCancel={() => setBlockToRemove(null)}
// //                 />
// //             )}

// //             {showResetConfirm && (
// //                 <StatusModal
// //                     type="warning"
// //                     title="Clear Module Info"
// //                     message="Are you sure you want to clear all module fields? This will also remove any mapped topics."
// //                     confirmText="Clear Fields"
// //                     onClose={executeResetModuleInfo}
// //                     onCancel={() => setShowResetConfirm(false)}
// //                 />
// //             )}

// //             {/* COLLABORATOR MODAL */}
// //             {showCollaboratorModal && createPortal(
// //                 <div className="mlab-modal-overlay" onClick={() => setShowCollaboratorModal(false)}>
// //                     <div className="mlab-modal-window mlab-modal-window--sm" onClick={e => e.stopPropagation()}>

// //                         <div className="mlab-modal-header">
// //                             <h2 className="mlab-modal-title">
// //                                 <Users size={18} /> Manage Access
// //                             </h2>
// //                             <button className="mlab-modal-close" onClick={() => setShowCollaboratorModal(false)}>
// //                                 <X size={20} />
// //                             </button>
// //                         </div>

// //                         <div className="mlab-modal-body">
// //                             <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>
// //                                 Select staff who can view and edit this workbook.
// //                             </p>

// //                             <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                 {staff.length === 0 ? (
// //                                     <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', textAlign: 'center', margin: '2rem 0' }}>
// //                                         No staff members found.
// //                                     </p>
// //                                 ) : (
// //                                     staff.map((member: StaffMember) => {
// //                                         const isCreator = member.id === creatorId || member.authUid === creatorId;
// //                                         const isCurrentUser = member.id === user?.uid || member.authUid === user?.uid;

// //                                         if (isCreator || isCurrentUser) return null;

// //                                         const staffUid = member.authUid || member.id;
// //                                         const isCollab = collaboratorIds.includes(staffUid);

// //                                         return (
// //                                             <label
// //                                                 key={member.id}
// //                                                 style={{
// //                                                     display: 'flex',
// //                                                     alignItems: 'center',
// //                                                     padding: '10px 12px',
// //                                                     border: '1px solid',
// //                                                     borderColor: isCollab ? 'var(--mlab-green)' : 'var(--mlab-border)',
// //                                                     background: isCollab ? 'var(--mlab-green-bg)' : 'var(--mlab-bg)',
// //                                                     cursor: 'pointer',
// //                                                     transition: 'all 0.15s'
// //                                                 }}
// //                                             >
// //                                                 <input
// //                                                     type="checkbox"
// //                                                     checked={isCollab}
// //                                                     onChange={() => toggleCollaborator(staffUid)}
// //                                                     style={{
// //                                                         width: '16px',
// //                                                         height: '16px',
// //                                                         accentColor: 'var(--mlab-green)',
// //                                                         marginRight: '12px',
// //                                                         cursor: 'pointer'
// //                                                     }}
// //                                                 />
// //                                                 <div style={{ flex: 1 }}>
// //                                                     <span style={{
// //                                                         display: 'block',
// //                                                         fontFamily: 'var(--font-heading)',
// //                                                         fontWeight: 600,
// //                                                         letterSpacing: '0.05em',
// //                                                         color: 'var(--mlab-blue)',
// //                                                         fontSize: '0.9rem',
// //                                                         textTransform: 'uppercase'
// //                                                     }}>
// //                                                         {member.fullName}
// //                                                     </span>
// //                                                     <span style={{ display: 'block', color: 'var(--mlab-grey)', fontSize: '0.75rem', textTransform: 'capitalize' }}>
// //                                                         {member.role}
// //                                                     </span>
// //                                                 </div>
// //                                             </label>
// //                                         );
// //                                     })
// //                                 )}
// //                             </div>
// //                         </div>

// //                         <div className="mlab-modal-footer">
// //                             <button className="mlab-btn mlab-btn--primary" onClick={() => setShowCollaboratorModal(false)}>
// //                                 Done
// //                             </button>
// //                         </div>

// //                     </div>
// //                 </div>,
// //                 document.body
// //             )}
// //         </div>
// //     );
// // };

// // // ─── TOPICS PANEL ─────────────────────────────────────────────────────────────
// // interface TopicsPanelProps {
// //     topics: Topic[];
// //     coveredTopicIds: Set<string>;
// //     editingTopicId: string | null;
// //     editDraft: Partial<Topic>;
// //     addingTopic: boolean;
// //     newTopic: Partial<Topic>;
// //     deleteConfirmId: string | null;
// //     isDeployed: boolean;
// //     onStartEdit: (t: Topic) => void;
// //     onEditChange: (p: Partial<Topic>) => void;
// //     onCommitEdit: () => void;
// //     onCancelEdit: () => void;
// //     onConfirmDelete: (id: string) => void;
// //     onExecuteDelete: () => void;
// //     onCancelDelete: () => void;
// //     onStartAdd: () => void;
// //     onNewTopicChange: (p: Partial<Topic>) => void;
// //     onCommitAdd: () => void;
// //     onCancelAdd: () => void;
// //     onAddBlock: (bt: BlockType | string, tid?: string) => void;
// // }

// // const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
// //     <>
// //         <div className="ab-row-space">
// //             <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
// //             {!props.addingTopic && !props.isDeployed && (
// //                 <Tooltip content="Add topic" placement="left">
// //                     <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}><Plus size={14} /></button>
// //                 </Tooltip>
// //             )}
// //         </div>
// //         {props.addingTopic && !props.isDeployed && (
// //             <div className="ab-topic-form">
// //                 <div className="ab-topic-form-row">
// //                     <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ""} onChange={(e) => props.onNewTopicChange({ code: e.target.value })} />
// //                     <input className="ab-input sm ab-w-60" placeholder="Weight %" value={props.newTopic.weight || ""} onChange={(e) => props.onNewTopicChange({ weight: e.target.value })} />
// //                 </div>
// //                 <textarea className="ab-input sm" rows={2} placeholder="Description…" value={props.newTopic.title || ""} onChange={(e) => props.onNewTopicChange({ title: e.target.value })} />
// //                 <div className="ab-row-end ab-row-gap-sm">
// //                     <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
// //                     <button className="ab-btn ab-btn-primary ab-btn-sm" onClick={props.onCommitAdd}>Add</button>
// //                 </div>
// //             </div>
// //         )}
// //         <div className="ab-topics-list">
// //             {props.topics.length === 0 && <p className="ab-prose sm ab-italic ab-muted">No topics. Select a module in Settings.</p>}
// //             {props.topics.map((t: Topic) => {
// //                 const covered = props.coveredTopicIds.has(t.id);
// //                 const isEditing = props.editingTopicId === t.id;
// //                 if (isEditing) return (
// //                     <div key={t.id} className="ab-topic-row editing">
// //                         <div className="ab-topic-edit-fields">
// //                             <input className="ab-topic-edit-input" value={props.editDraft.code || ""} onChange={(e) => props.onEditChange({ code: e.target.value })} placeholder="Code" />
// //                             <input className="ab-topic-edit-input" value={props.editDraft.title || ""} onChange={(e) => props.onEditChange({ title: e.target.value })} placeholder="Title" />
// //                         </div>
// //                         <div className="ab-topic-edit-actions">
// //                             <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={13} /></button>
// //                             <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={13} /></button>
// //                         </div>
// //                     </div>
// //                 );
// //                 return (
// //                     <div key={t.id} className={`ab-topic-row ${covered ? "covered" : ""}`}>
// //                         <div className="ab-topic-main">
// //                             <div className="ab-topic-top-row">
// //                                 <span className="ab-topic-code">{t.code}</span>
// //                                 <span className="ab-topic-weight">{t.weight}%</span>
// //                             </div>
// //                             <span className="ab-topic-title">{t.title}</span>
// //                         </div>
// //                         <div className="ab-topic-actions">
// //                             {!props.isDeployed && (
// //                                 <>
// //                                     <Tooltip content="+Question" placement="top"><button className="ab-tadd-btn" onClick={() => props.onAddBlock("text", t.id)}>+Q</button></Tooltip>
// //                                     <Tooltip content="+Reading" placement="top"><button className="ab-tadd-btn reading" onClick={() => props.onAddBlock("info", t.id)}>+R</button></Tooltip>
// //                                     <Tooltip content="Delete" placement="top"><button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button></Tooltip>
// //                                 </>
// //                             )}
// //                             <Tooltip content="Edit" placement="top"><button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button></Tooltip>
// //                         </div>
// //                     </div>
// //                 );
// //             })}
// //         </div>
// //     </>
// // );

// // // ─── BLOCK CARD ───────────────────────────────────────────────────────────────
// // interface BlockCardProps {
// //     block: AssessmentBlock;
// //     index: number;
// //     total: number;
// //     focused: boolean;
// //     isDeployed: boolean;
// //     topics: Topic[];
// //     onFocus: () => void;
// //     onUpdate: (id: string, field: keyof AssessmentBlock, val: any) => void;
// //     onUpdateOption: (bid: string, idx: number, val: string) => void;
// //     onRemove: (id: string) => void;
// //     onMove: (id: string, dir: "up" | "down") => void;
// // }

// // const BlockCard: React.FC<BlockCardProps> = ({
// //     block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove,
// // }) => {
// //     const meta = BLOCK_META[block.type];
// //     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

// //     const [isUploadingImage, setIsUploadingImage] = useState(false);
// //     const toast = useToast();

// //     const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;
// //         setIsUploadingImage(true);
// //         toast.info("Uploading image...");
// //         try {
// //             const task = uploadBytesResumable(fbStorageRef(getStorage(), `assessments/block_images/${Date.now()}_${file.name}`), file);
// //             task.on("state_changed", null, () => {
// //                 toast.error("Image upload failed.");
// //                 setIsUploadingImage(false);
// //             }, async () => {
// //                 const url = await getDownloadURL(task.snapshot.ref);
// //                 onUpdate(block.id, "imageUrl", url);
// //                 toast.success("Image attached!");
// //                 setIsUploadingImage(false);
// //             });
// //         } catch {
// //             toast.error("Upload failed.");
// //             setIsUploadingImage(false);
// //         }
// //     };


// //     const updateCriterion = (i: number, v: string) => { const c = [...(block.criteria || [])]; c[i] = v; onUpdate(block.id, "criteria", c); };
// //     const removeCriterion = (i: number) => onUpdate(block.id, "criteria", (block.criteria || []).filter((_, idx) => idx !== i));
// //     const addCriterion = () => onUpdate(block.id, "criteria", [...(block.criteria || []), ""]);

// //     const updateWA = (wi: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], [f]: v }; onUpdate(block.id, "workActivities", l); };
// //     const removeWA = (wi: number) => onUpdate(block.id, "workActivities", (block.workActivities || []).filter((_, i) => i !== wi));
// //     const addWA = () => onUpdate(block.id, "workActivities", [...(block.workActivities || []), { id: mkId(), code: "", description: "", evidenceItems: [] }]);
// //     const updateSE = (wi: number, si: number, f: "code" | "description", v: string) => { const l = [...(block.workActivities || [])]; const s = [...(l[wi].evidenceItems || [])]; s[si] = { ...s[si], [f]: v }; l[wi] = { ...l[wi], evidenceItems: s }; onUpdate(block.id, "workActivities", l); };
// //     const removeSE = (wi: number, si: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: (l[wi].evidenceItems || []).filter((_, i) => i !== si) }; onUpdate(block.id, "workActivities", l); };
// //     const addSE = (wi: number) => { const l = [...(block.workActivities || [])]; l[wi] = { ...l[wi], evidenceItems: [...(l[wi].evidenceItems || []), { id: mkId(), code: "", description: "" }] }; onUpdate(block.id, "workActivities", l); };

// //     return (
// //         <div id={`block-${block.id}`} className={`ab-block ${focused ? "is-focused" : ""} ${isDeployed ? "is-locked" : ""}`} style={{ "--block-accent": meta.color } as React.CSSProperties} onClick={onFocus}>
// //             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />
// //             <div className="ab-block-strip" style={{ background: meta.color }} />
// //             <div className="ab-block-ctrl-row">
// //                 <div className="ab-block-left">
// //                     <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
// //                     {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
// //                     {isDeployed && <span className="ab-locked-icon" title="Structure Locked"><Lock size={11} /></span>}
// //                 </div>
// //                 {!isDeployed && (
// //                     <div className="ab-block-actions">
// //                         <Tooltip content="Move up" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "up"); }} disabled={index === 0}>↑</button></Tooltip>
// //                         <Tooltip content="Move down" placement="top"><button className="ab-ctrl-btn" onClick={(e) => { e.stopPropagation(); onMove(block.id, "down"); }} disabled={index === total - 1}>↓</button></Tooltip>
// //                         <Tooltip content="Delete block" placement="top"><button className="ab-ctrl-btn ab-ctrl-del" onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button></Tooltip>
// //                     </div>
// //                 )}
// //             </div>

// //             {/* SECTION */}
// //             {block.type === "section" && (
// //                 <div className="ab-q-body" onClick={(e) => e.stopPropagation()}>
// //                     <div className="ab-form-group">
// //                         <label className="ab-field-lbl">Section Outline Label</label>
// //                         <input className="ab-input" value={block.title || ""} placeholder="e.g. SECTION B – PM-01-PS02" onChange={(e) => onUpdate(block.id, "title", e.target.value)} disabled={isDeployed} />
// //                     </div>
// //                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`}>
// //                         <label className="ab-field-lbl">Section Content / Criteria Details</label>
// //                         <ReactQuill theme="snow" value={block.content || ""} onChange={(v) => onUpdate(block.id, "content", v)} readOnly={isDeployed} modules={quillModules} formats={quillFormats} placeholder="Section content or assessment criteria…" />
// //                     </div>
// //                 </div>
// //             )}

// //             {/* INFO */}
// //             {block.type === "info" && (
// //                 <div className="ab-info-body">
// //                     <textarea className="ab-textarea-block" rows={5} value={block.content || ""} onChange={(e) => onUpdate(block.id, "content", e.target.value)} onClick={(e) => e.stopPropagation()} placeholder="Enter reading material…" />
// //                 </div>
// //             )}

// //             {/* WRITTEN / MCQ / TASK */}
// //             {["text", "mcq", "task"].includes(block.type) && (
// //                 <div className="ab-q-body">
// //                     <div className="ab-q-top">
// //                         <span className="ab-q-num" style={block.type === "task" ? { background: "rgba(139,92,246,.18)", color: "#a78bfa" } : undefined}>Q{index + 1}</span>
// //                         <div className="ab-marks-stepper">
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
// //                             <span className="ab-step-val">{block.marks}</span>
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
// //                         </div>
// //                         <div className="ab-topic-sel-wrap">
// //                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
// //                                 <option value="">Link topic…</option>
// //                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
// //                             </select>
// //                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
// //                         </div>
// //                     </div>

// //                     <div className={`ab-quill-wrapper ${isDeployed ? "locked" : ""}`} style={{ marginBottom: '1rem', background: '#fff' }} onClick={(e) => e.stopPropagation()}>
// //                         <ReactQuill
// //                             theme="snow"
// //                             value={block.question || ""}
// //                             onChange={(v) => onUpdate(block.id, "question", v)}
// //                             readOnly={isDeployed}
// //                             modules={quillModules}
// //                             formats={quillFormats}
// //                             placeholder={block.type === "task" ? "Describe the task or evidence request…" : "Type your question here (Supports multiple lines, formatting, and lists)…"}
// //                         />
// //                     </div>

// //                     {block.type === "text" && (
// //                         <div className="ab-answer-placeholder"><FileText size={13} /><span>Learner types answer here</span></div>
// //                     )}

// //                     {block.type === "mcq" && (
// //                         <div className="ab-mcq-opts">
// //                             {block.options?.map((opt, i) => (
// //                                 <div key={i} className={`ab-opt-row ${block.correctOption === i ? "correct" : ""}`} onClick={(e) => { if (isDeployed) return; e.stopPropagation(); onUpdate(block.id, "correctOption", i); }}>
// //                                     <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
// //                                     <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
// //                                     <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={(e) => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={(e) => e.stopPropagation()} />
// //                                     {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
// //                                 </div>
// //                             ))}
// //                         </div>
// //                     )}

// //                     {block.type === "task" && (
// //                         <div className="ab-evidence-card" onClick={(e) => e.stopPropagation()}>
// //                             <span className="ab-evidence-card-title">Allowed Evidence Types</span>
// //                             <div className="ab-evidence-grid">
// //                                 {[
// //                                     { key: "allowText", icon: <AlignLeft size={14} />, label: "Rich Text" },
// //                                     { key: "allowAudio", icon: <Mic size={14} />, label: "Audio" },
// //                                     { key: "allowUrl", icon: <LinkIcon size={14} />, label: "URL/Link" },
// //                                     { key: "allowUpload", icon: <UploadCloud size={14} />, label: "File Upload" },
// //                                     { key: "allowCode", icon: <Code size={14} />, label: "Code Editor" },
// //                                 ].map(({ key, icon, label }) => (
// //                                     <label key={key} className={`ab-evidence-row ${isDeployed ? "ab-disabled" : ""}`}>
// //                                         <input type="checkbox" checked={(block as any)[key]} disabled={isDeployed} onChange={(e) => onUpdate(block.id, key as keyof AssessmentBlock, e.target.checked)} className="ab-checkbox" />
// //                                         {icon}<span>{label}</span>
// //                                     </label>
// //                                 ))}
// //                             </div>
// //                             {(block.allowUpload || block.allowCode) && (
// //                                 <div className="ab-evidence-sub">
// //                                     {block.allowUpload && (
// //                                         <div className="ab-form-group ab-flex-1">
// //                                             <label className="ab-field-lbl">File Type Restriction</label>
// //                                             <select className="ab-input" value={block.allowedFileTypes || "all"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "allowedFileTypes", e.target.value)}>
// //                                                 <option value="all">Any File</option>
// //                                                 <option value="presentation">Presentations (.pptx, .pdf)</option>
// //                                                 <option value="video">Video (.mp4, .mov)</option>
// //                                                 <option value="image">Images (.png, .jpg)</option>
// //                                             </select>
// //                                         </div>
// //                                     )}
// //                                     {block.allowCode && (
// //                                         <div className="ab-form-group ab-flex-1">
// //                                             <label className="ab-field-lbl">Syntax Highlighting</label>
// //                                             <select className="ab-input" value={block.codeLanguage || "javascript"} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "codeLanguage", e.target.value)}>
// //                                                 <option value="javascript">JavaScript / TypeScript</option>
// //                                                 <option value="python">Python</option>
// //                                                 <option value="html">HTML / CSS</option>
// //                                                 <option value="sql">SQL</option>
// //                                                 <option value="other">Other</option>
// //                                             </select>
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             )}
// //                         </div>
// //                     )}
// //                 </div>
// //             )}

// //             {/* BLOCK IMAGE ATTACHMENT ZONE */}
// //             {["text", "mcq", "task", "info", "section"].includes(block.type) && (
// //                 <div style={{ padding: "0 20px 20px 20px" }}>
// //                     {!block.imageUrl && !isUploadingImage ? (
// //                         <label className="ab-image-toggle">
// //                             <ImageIcon size={14} /> Attach Context Image
// //                             <input type="file" accept="image/*" hidden disabled={isDeployed} onChange={handleImageUpload} />
// //                         </label>
// //                     ) : isUploadingImage ? (
// //                         <div className="ab-image-upload-zone">
// //                             <div className="ab-spinner" style={{ margin: '0 auto', marginBottom: '8px', width: '20px', height: '20px' }} />
// //                             <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Uploading Image...</span>
// //                         </div>
// //                     ) : (
// //                         <div className="ab-image-upload-zone has-image" onClick={(e) => e.stopPropagation()}>
// //                             <img src={block.imageUrl} alt="Attached context" className="ab-image-preview" />
// //                             <div className="ab-image-meta">
// //                                 <input
// //                                     className="ab-caption-input"
// //                                     placeholder="Add an optional caption or source credit..."
// //                                     value={block.imageCaption || ""}
// //                                     disabled={isDeployed}
// //                                     onChange={(e) => onUpdate(block.id, "imageCaption", e.target.value)}
// //                                 />
// //                                 {!isDeployed && (
// //                                     <button
// //                                         className="ab-btn-text ab-btn-text--rose"
// //                                         style={{ alignSelf: "flex-start", padding: 0 }}
// //                                         onClick={() => { onUpdate(block.id, "imageUrl", ""); onUpdate(block.id, "imageCaption", ""); }}
// //                                     >
// //                                         <Trash2 size={12} style={{ marginRight: '4px' }} /> Remove Image
// //                                     </button>
// //                                 )}
// //                             </div>
// //                         </div>
// //                     )}
// //                 </div>
// //             )}

// //             {/* CHECKLIST */}
// //             {block.type === "checklist" && (
// //                 <div className="ab-q-body">
// //                     <div className="ab-q-top">
// //                         <span className="ab-q-num" style={{ background: "rgba(20,184,166,.18)", color: "#2dd4bf" }}>CHK</span>
// //                         <div className="ab-marks-stepper">
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
// //                             <span className="ab-step-val">{block.marks || 0}</span>
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
// //                         </div>
// //                         <div className="ab-topic-sel-wrap">
// //                             <select className="ab-topic-sel" value={block.linkedTopicId || ""} disabled={isDeployed} onChange={(e) => onUpdate(block.id, "linkedTopicId", e.target.value || undefined)} onClick={(e) => e.stopPropagation()}>
// //                                 <option value="">Link topic…</option>
// //                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
// //                             </select>
// //                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
// //                         </div>
// //                     </div>

// //                     <div className="ab-form-group" onClick={(e) => e.stopPropagation()}>
// //                         <label className="ab-field-lbl">Practical Task Outcome / Instruction</label>
// //                         <input type="text" className="ab-input" value={block.title || ""} onChange={(e) => onUpdate(block.id, "title", e.target.value)} placeholder="e.g. PA0101 Demonstrate the use of…" />
// //                     </div>

// //                     <div className="ab-checklist-toggles" onClick={(e) => e.stopPropagation()}>
// //                         <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
// //                             <input type="checkbox" disabled={isDeployed} checked={block.requirePerCriterionTiming !== false} onChange={(e) => onUpdate(block.id, "requirePerCriterionTiming", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
// //                             Require Timers per task
// //                         </label>
// //                         <label className={`ab-checklist-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
// //                             <input type="checkbox" disabled={isDeployed} checked={block.requireEvidencePerCriterion !== false} onChange={(e) => onUpdate(block.id, "requireEvidencePerCriterion", e.target.checked)} className="ab-checkbox ab-checkbox--amber" />
// //                             Require Evidence per task
// //                         </label>
// //                     </div>

// //                     <div className="ab-criteria-body" onClick={(e) => e.stopPropagation()}>
// //                         <span className="ab-criteria-body-title">Evaluation Criteria to Observe:</span>
// //                         {block.criteria?.map((criterion, i) => (
// //                             <div key={i} className="ab-criterion-item">
// //                                 <div className="ab-criterion-header">
// //                                     <span className="ab-criterion-num">{i + 1}</span>
// //                                     <input type="text" className="ab-input ab-input--bold" value={criterion} disabled={isDeployed} onChange={(e) => updateCriterion(i, e.target.value)} placeholder="e.g. Open files and folders" />
// //                                     {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeCriterion(i)}><X size={15} /></button>}
// //                                 </div>
// //                                 <div className="ab-criterion-preview-stack">
// //                                     {block.requireEvidencePerCriterion !== false && (
// //                                         <div className="ab-criterion-preview">
// //                                             <UploadCloud size={13} />
// //                                             <em>Learner uploads evidence here…</em>
// //                                         </div>
// //                                     )}
// //                                     {block.requirePerCriterionTiming !== false && (
// //                                         <div className="ab-criterion-timer">
// //                                             <Timer size={13} />
// //                                             <span className="ab-criterion-timer-label">Task Timer:</span>
// //                                             <span className="ab-btn ab-btn-sm" style={{ background: "rgba(59,130,246,.35)", color: "#93c5fd", border: "none", cursor: "default", padding: "2px 8px", borderRadius: "4px", fontSize: "0.68rem" }}>Start</span>
// //                                             <span className="ab-criterion-timer-clock">00:00:00</span>
// //                                         </div>
// //                                     )}
// //                                     <div className="ab-criterion-radios">
// //                                         <span className="ab-crit-competent"><input type="radio" disabled /> C — Competent</span>
// //                                         <span className="ab-crit-nyc"><input type="radio" disabled /> NYC</span>
// //                                         <input type="text" className="ab-input ab-input-ghost" disabled placeholder="Assessor comments…" />
// //                                     </div>
// //                                 </div>
// //                             </div>
// //                         ))}
// //                         {!isDeployed && <button className="ab-btn-text" onClick={addCriterion}><Plus size={13} /> Add Criterion</button>}

// //                         <div className="ab-signoff-preview">
// //                             <span className="ab-signoff-title">Global Assessor / Mentor Sign-off Preview</span>
// //                             <div className="ab-signoff-grid">
// //                                 <input type="text" className="ab-input" disabled placeholder="Date…" />
// //                                 <input type="text" className="ab-input" disabled placeholder="Time Started…" />
// //                                 <input type="text" className="ab-input" disabled placeholder="Time Completed…" />
// //                             </div>
// //                             <textarea className="ab-input" rows={2} disabled placeholder="General Comments of Observer…" />
// //                             <label className="ab-signoff-declaration">
// //                                 <input type="checkbox" disabled checked className="ab-checkbox" />
// //                                 I declare that I have observed the learner performing these tasks.
// //                             </label>
// //                         </div>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* LOGBOOK */}
// //             {block.type === "logbook" && (
// //                 <div className="ab-q-body">
// //                     <div className="ab-q-top">
// //                         <span className="ab-q-num" style={{ background: "rgba(249,115,22,.18)", color: "#fb923c" }}>LOG</span>
// //                     </div>
// //                     <div className="ab-logbook-card">
// //                         <div className="ab-logbook-title"><CalendarRange size={17} /> Standard Logbook Table Inserted</div>
// //                         <p className="ab-logbook-body">Learners will log Date, Assignment Task, Start / Finish Times, and Total Hours. No further configuration needed.</p>
// //                     </div>
// //                 </div>
// //             )}

// //             {/* QCTO WORKPLACE CHECKPOINT */}
// //             {block.type === "qcto_workplace" && (
// //                 <div className="ab-q-body">
// //                     <div className="ab-q-top">
// //                         <span className="ab-q-num" style={{ background: "rgba(225,29,72,.18)", color: "#fb7185" }}>QCTO</span>
// //                         <div className="ab-marks-stepper">
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", Math.max(0, (block.marks || 0) - 1)); }}>−</button>
// //                             <span className="ab-step-val">{block.marks || 0}</span>
// //                             <button className="ab-step-btn" disabled={isDeployed} onClick={(e) => { e.stopPropagation(); onUpdate(block.id, "marks", (block.marks || 0) + 1); }}>+</button>
// //                         </div>
// //                     </div>
// //                     <div className="ab-qcto-card" onClick={(e) => e.stopPropagation()}>
// //                         <div className="ab-form-group">
// //                             <label className="ab-qcto-label">WE Module Code</label>
// //                             <input type="text" className="ab-input ab-qcto-input" value={block.weCode || ""} onChange={(e) => onUpdate(block.id, "weCode", e.target.value)} disabled={isDeployed} placeholder="e.g. WM-01-WE01" />
// //                         </div>
// //                         <div className="ab-form-group">
// //                             <label className="ab-qcto-label">Work Experience Title</label>
// //                             <input type="text" className="ab-input ab-qcto-input" value={block.weTitle || ""} onChange={(e) => onUpdate(block.id, "weTitle", e.target.value)} disabled={isDeployed} placeholder="e.g. Attend induction program…" />
// //                         </div>
// //                         <div className="ab-qcto-activities">
// //                             <span className="ab-qcto-activities-title">Workplace Activities (WA) & Evidence Links</span>
// //                             {(block.workActivities || []).map((wa, wi) => (
// //                                 <div key={wa.id} className="ab-wa-row">
// //                                     <div className="ab-wa-inputs">
// //                                         <input type="text" className="ab-input ab-w-80" value={wa.code} onChange={(e) => updateWA(wi, "code", e.target.value)} disabled={isDeployed} placeholder="WA0101" />
// //                                         <input type="text" className="ab-input ab-flex-1" value={wa.description} onChange={(e) => updateWA(wi, "description", e.target.value)} disabled={isDeployed} placeholder="Activity description…" />
// //                                         {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeWA(wi)}><X size={15} /></button>}
// //                                     </div>
// //                                     <div className="ab-se-list">
// //                                         <span className="ab-se-title">Required Supporting Evidence (SE)</span>
// //                                         {(wa.evidenceItems || []).map((se, si) => (
// //                                             <div key={se.id} className="ab-se-row">
// //                                                 <input type="text" className="ab-input sm ab-w-70" value={se.code} onChange={(e) => updateSE(wi, si, "code", e.target.value)} disabled={isDeployed} placeholder="SE0101" />
// //                                                 <input type="text" className="ab-input sm ab-flex-1" value={se.description} onChange={(e) => updateSE(wi, si, "description", e.target.value)} disabled={isDeployed} placeholder="Describe expected evidence…" />
// //                                                 {!isDeployed && <button className="ab-btn-icon-danger ab-btn-icon-sm" onClick={() => removeSE(wi, si)}><Trash2 size={11} /></button>}
// //                                             </div>
// //                                         ))}
// //                                         {!isDeployed && <button className="ab-btn-text ab-btn-text--sm ab-btn-text--rose" onClick={() => addSE(wi)}><Plus size={11} /> Add Evidence</button>}
// //                                     </div>
// //                                 </div>
// //                             ))}
// //                             {!isDeployed && <button className="ab-btn-text ab-btn-text--rose" onClick={addWA}><Plus size={13} /> Add Workplace Activity</button>}
// //                         </div>
// //                         <div className="ab-qcto-toggles">
// //                             <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
// //                                 <input type="checkbox" disabled={isDeployed} checked={block.requireSelfAssessment !== false} onChange={(e) => onUpdate(block.id, "requireSelfAssessment", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
// //                                 Require Self-Assessment
// //                             </label>
// //                             <label className={`ab-qcto-toggle-row ${isDeployed ? "ab-disabled" : ""}`}>
// //                                 <input type="checkbox" disabled={isDeployed} checked={block.requireGoalPlanning !== false} onChange={(e) => onUpdate(block.id, "requireGoalPlanning", e.target.checked)} className="ab-checkbox ab-checkbox--rose" />
// //                                 Require Goal Planning
// //                             </label>
// //                         </div>
// //                         <p className="ab-qcto-footnote">* Learners will see a QCTO Checkpoint form mapping their uploads to WA and SE codes, alongside mentor sign-off.</p>
// //                     </div>
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // // ─── OVERLAYS & UTILITY COMPONENTS ───────────────────────────────────────────
// // const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void; }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
// //     <div className="ab-overlay-backdrop" onClick={onCancel}>
// //         <div className="ab-delete-dialog" onClick={(e) => e.stopPropagation()}>
// //             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
// //             <h3 className="ab-dd-title">Delete Topic?</h3>
// //             <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
// //             {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
// //             <div className="ab-dd-actions">
// //                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
// //                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={13} /> Delete</button>
// //             </div>
// //         </div>
// //     </div>
// // );

// // const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
// //     <div className="ab-section-hdr">{icon}<span>{label}</span></div>
// // );

// // const FG: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties; }> = ({ label, children, style }) => (
// //     <div className="ab-fg" style={style}>
// //         {label && <label className="ab-fg-label">{label}</label>}
// //         {children}
// //     </div>
// // );

// // const EmptyCanvas: React.FC<{ onAdd: (t: string) => void }> = ({ onAdd }) => (
// //     <div className="ab-empty-canvas">
// //         <div className="ab-empty-inner">
// //             <div className="ab-empty-icon"><BookOpen size={28} /></div>
// //             <h2 className="ab-empty-title">Drafting Surface</h2>
// //             <p className="ab-empty-sub">Choose a block type to begin building</p>
// //             <div className="ab-empty-grid">
// //                 {(Object.keys(BLOCK_META) as BlockType[]).map((bt) => (
// //                     <button key={bt} className="ab-empty-card" style={{ "--block-color": BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
// //                         <span className="ab-empty-icon-bt">{BLOCK_META[bt].icon}</span>
// //                         <span className="ab-empty-lbl">{BLOCK_META[bt].label}</span>
// //                         <span className="ab-empty-desc">{BLOCK_META[bt].desc}</span>
// //                     </button>
// //                 ))}
// //             </div>
// //         </div>
// //     </div>
// // );

// // export default AssessmentBuilder;

