import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, doc, getDoc, setDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import {
    Save, ArrowLeft, Trash2, AlignLeft, CheckSquare,
    Layout, Info, ChevronDown, BookOpen, FileText,
    Zap, Eye, Settings, GraduationCap, ListChecks,
    ClipboardList, BookMarked, Plus, Pencil, Check, X,
    AlertTriangle, RotateCcw, EyeOff, Clock, Database,
    ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code, Link as LinkIcon, CalendarRange, Timer,
    Building2,
    Type, Briefcase
} from 'lucide-react';
import Tooltip from '../../components/common/Tooltip/Tooltip';
import type { Cohort, ProgrammeTemplate, DashboardLearner } from '../../types';
import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';
import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './FacilitatorDashboard.css';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';

const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] };
const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// ─── TYPES ────────────────────────────────────────────────────────────────────
export type BlockType = 'section' | 'info' | 'mcq' | 'text' | 'task' | 'checklist' | 'logbook' | 'qcto_workplace';
type SidebarPanel = 'settings' | 'module' | 'topics' | 'guide' | 'outline';

interface Topic {
    id: string;
    code: string;
    title: string;
    weight: string | number;
}

// 🚀 NEW: Structured Types for Workplace Checkpoints
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

    // Multi-Modal Fields
    allowText?: boolean;
    allowUpload?: boolean;
    allowAudio?: boolean;
    allowUrl?: boolean;
    allowCode?: boolean;
    allowedFileTypes?: 'all' | 'image' | 'document' | 'video' | 'presentation';
    codeLanguage?: 'javascript' | 'python' | 'html' | 'sql' | 'other';

    // Practical Checklist Fields
    criteria?: string[];
    requireTimeTracking?: boolean;
    requirePerCriterionTiming?: boolean;
    requireObservationDeclaration?: boolean;
    requireEvidencePerCriterion?: boolean;

    // 🚀 UPDATED: QCTO Workplace Checkpoint Fields
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

const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
    section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
    info: { label: 'Reading', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
    text: { label: 'Written', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Standard free-text response' },
    mcq: { label: 'MCQ', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
    task: { label: 'Multi-Modal', color: '#8b5cf6', icon: <Layers size={14} />, desc: 'Allow file uploads, audio, code, or links' },
    checklist: { label: 'Checklist', color: '#14b8a6', icon: <ListChecks size={14} />, desc: 'Assessor C/NYC observation list' },
    logbook: { label: 'Basic Logbook', color: '#f97316', icon: <CalendarRange size={14} />, desc: 'Standard workplace hours logbook' },
    qcto_workplace: { label: 'QCTO Workplace Checkpoint', color: '#e11d48', icon: <Briefcase size={14} />, desc: 'SETA compliant workplace reflection & evidence' },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const AssessmentBuilder: React.FC = () => {
    const { assessmentId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    // Store Data
    const { user, cohorts, learners, programmes, fetchCohorts, fetchLearners, fetchProgrammes } = useStore();

    // UI States
    const [loading, setLoading] = useState(false);
    const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
    const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // STATUS TRACKING FOR STRICT MODE
    const [assessmentStatus, setAssessmentStatus] = useState<'draft' | 'scheduled' | 'active' | 'completed'>('draft');

    // Modals & Linking States
    const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('');
    const [selectedModuleCode, setSelectedModuleCode] = useState<string>('');
    const [showProgrammeModal, setShowProgrammeModal] = useState(false);
    const [showCohortModal, setShowCohortModal] = useState(false);

    // Data States
    const [title, setTitle] = useState('');
    const [cohortIds, setCohortIds] = useState<string[]>([]);
    const [instructions, setInstructions] = useState('');
    const [type, setType] = useState<'formative' | 'summative' | 'Practical Observation' | 'Workplace Logbook'>('formative');
    const [moduleType, setModuleType] = useState<'knowledge' | 'practical' | 'workplace'>('knowledge');

    // SCHEDULING STATES
    const [isScheduled, setIsScheduled] = useState<boolean>(false);
    const [scheduledDate, setScheduledDate] = useState<string>('');

    // Module & Guide States
    const [showModuleHeader, setShowModuleHeader] = useState(true);
    const [moduleInfo, setModuleInfo] = useState<ModuleDetails>({
        title: '', nqfLevel: '', credits: 0, notionalHours: 0,
        moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: '', timeLimit: 60
    });
    const [learnerNote, setLearnerNote] = useState('');
    const [modulePurpose, setModulePurpose] = useState('');
    const [entryRequirements, setEntryRequirements] = useState('');
    const [providerRequirements, setProviderRequirements] = useState('');
    const [exemptions, setExemptions] = useState('');
    const [stakeholderGuidelines, setStakeholderGuidelines] = useState('');

    // Content States
    const [topics, setTopics] = useState<Topic[]>([]);
    const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

    // CRUD States
    const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
    const [addingTopic, setAddingTopic] = useState(false);
    const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    // CALCULATE STRICT MODE
    const isDeployed = assessmentStatus !== 'draft' && assessmentId !== undefined;

    // ─── INITIAL LOAD ───
    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (programmes.length === 0) fetchProgrammes();

        const loadData = async () => {
            if (!assessmentId) return;

            setLoading(true);
            try {
                const docRef = doc(db, 'assessments', assessmentId);
                const snap = await getDoc(docRef);

                if (snap.exists()) {
                    const data = snap.data();
                    setTitle(data.title || '');
                    setCohortIds(data.cohortIds || (data.cohortId ? [data.cohortId] : []));
                    setInstructions(data.instructions || '');
                    setType(data.type || 'formative');
                    setModuleType(data.moduleType || 'knowledge');
                    setAssessmentStatus(data.status || 'draft');

                    if (data.scheduledDate) {
                        try {
                            const d = new Date(data.scheduledDate);
                            if (!isNaN(d.getTime())) {
                                const pad = (n: number) => n.toString().padStart(2, '0');
                                const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                                setScheduledDate(localStr);
                            } else {
                                setScheduledDate(data.scheduledDate);
                            }
                        } catch {
                            setScheduledDate(data.scheduledDate);
                        }
                    }
                    setIsScheduled(!!data.scheduledDate);

                    setSelectedProgrammeId(data.linkedProgrammeId || '');
                    setSelectedModuleCode(data.linkedModuleCode || '');
                    setModuleInfo(data.moduleInfo || {});
                    setShowModuleHeader(data.showModuleHeader ?? true);
                    setBlocks(data.blocks || []);

                    if (data.learnerGuide) {
                        setLearnerNote(data.learnerGuide.note || '');
                        setModulePurpose(data.learnerGuide.purpose || '');
                        setEntryRequirements(data.learnerGuide.entryRequirements || '');
                        setProviderRequirements(data.learnerGuide.providerRequirements || '');
                        setExemptions(data.learnerGuide.exemptions || '');
                        setStakeholderGuidelines(data.learnerGuide.stakeholderGuidelines || '');
                    }

                    if (data.topics && Array.isArray(data.topics)) {
                        setTopics(data.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
                    }

                    setSaveStatus('saved');
                    setLastSaved(new Date(data.lastUpdated || data.createdAt));
                } else {
                    toast.error('Assessment not found');
                    navigate('/facilitator/assessments');
                }
            } catch (error) {
                console.error("Failed to load assessment:", error);
                toast.error("Could not load the requested assessment.");
            } finally {
                setLoading(false);
            }
        };

        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assessmentId]);

    // ─── CURRICULUM SYNC LOGIC ───
    useEffect(() => {
        if (!selectedProgrammeId || !selectedModuleCode) return;
        if (assessmentId && topics.length > 0) return;

        const prog = programmes.find(p => p.id === selectedProgrammeId);
        if (!prog) return;

        const allMods = [
            ...(prog.knowledgeModules || []),
            ...(prog.practicalModules || []),
            ...(prog.workExperienceModules || [])
        ];

        const mod: any = allMods.find((moduleItem: any, idx: number) => {
            const uniqueVal = moduleItem.code || moduleItem.name || `mod-${idx}`;
            return uniqueVal === selectedModuleCode;
        });

        if (mod) {
            setModuleInfo({
                title: mod.name,
                nqfLevel: `Level ${mod.nqfLevel || prog.nqfLevel}`,
                credits: mod.credits || 0,
                notionalHours: mod.notionalHours || 0,
                moduleNumber: mod.code || '',
                occupationalCode: (prog as any).curriculumCode || prog.saqaId || '',
                saqaQualId: prog.saqaId || '',
                qualificationTitle: prog.name || '',
                timeLimit: moduleInfo.timeLimit || 60
            });

            if (mod.topics && mod.topics.length > 0) {
                const mappedTopics = mod.topics.map((t: any) => ({
                    id: mkId(),
                    code: t.code || '',
                    title: t.title || 'Unnamed Topic',
                    weight: t.weight || '0'
                }));
                setTopics(mappedTopics);
                toast.success(`Imported ${mappedTopics.length} topics from Curriculum!`);
            } else {
                setTopics([]);
            }
        }
    }, [selectedProgrammeId, selectedModuleCode]);

    // ─── AUTO-SAVE ───
    useEffect(() => {
        if (!assessmentId) return;
        setSaveStatus('unsaved');

        const autoSaveTimer = setTimeout(() => {
            if (saveStatus === 'unsaved' && !loading) {
                handleSave(assessmentStatus === 'draft' ? 'draft' : 'active', true);
            }
        }, 30000);

        return () => clearTimeout(autoSaveTimer);
    }, [
        title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
        learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
        topics, blocks, selectedProgrammeId, selectedModuleCode, scheduledDate, isScheduled
    ]);

    // ─── UNIFIED COHORT CREATION LOGIC ───
    const handleSaveNewCohort = async (
        cohortData: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
        reasons?: { facilitator?: string; assessor?: string; moderator?: string }
    ) => {
        try {
            const cohortRef = doc(collection(db, 'cohorts'));
            const newId = cohortRef.id;

            const finalCohort = {
                ...cohortData,
                id: newId,
                createdAt: new Date().toISOString(),
                isArchived: false,
                staffHistory: [],
                status: 'active',
                changeReasons: reasons || {}
            };

            await setDoc(cohortRef, finalCohort);
            await fetchCohorts();
            setCohortIds(prev => [...prev, newId]);

            toast.success(`Class "${cohortData.name}" created and assigned!`);
            setShowCohortModal(false);
        } catch (err: any) {
            console.error("New Cohort Error:", err);
            throw new Error(err.message);
        }
    };

    // ── TOPIC HANDLERS ──
    const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
    const commitEdit = () => {
        if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
        setTopics(prev => prev.map(t => t.id === editingTopicId ? { ...t, ...editDraft } as Topic : t));
        setEditingTopicId(null);
    };
    const cancelEdit = () => setEditingTopicId(null);
    const confirmDelete = (id: string) => setDeleteConfirmId(id);
    const executeDelete = () => {
        if (!deleteConfirmId) return;
        setBlocks(p => p.map(b => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
        setTopics(p => p.filter(t => t.id !== deleteConfirmId));
        setDeleteConfirmId(null);
    };
    const cancelDelete = () => setDeleteConfirmId(null);
    const commitAdd = () => {
        if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
        setTopics(p => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || '0%' }]);
        setNewTopic({ code: '', title: '', weight: '' });
        setAddingTopic(false);
    };
    const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

    // ── BLOCK HANDLERS ──
    const addBlock = (bType: string, linkedTopicId?: string) => {

        let actualType: BlockType = bType as BlockType;
        if (['upload', 'audio', 'code'].includes(bType)) actualType = 'task';

        const nb: AssessmentBlock = {
            id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: actualType,
            linkedTopicId,
            title: actualType === 'section' ? 'New Section' : '',
            content: '',
            question: '',
            marks: (actualType === 'text' || actualType === 'mcq' || actualType === 'task') ? 5 : (actualType === 'checklist' || actualType === 'qcto_workplace' ? 10 : 0),
            options: actualType === 'mcq' ? ['', '', '', ''] : [],
            correctOption: 0,
        };

        if (actualType === 'section') {
            nb.title = 'New Section';
            nb.content = '';
        } else if (actualType === 'checklist') {
            nb.title = 'Demonstrate the use of various functionalities:';
            nb.criteria = ['Task criterion 1', 'Task criterion 2'];
            nb.requireTimeTracking = true;
            nb.requirePerCriterionTiming = true;
            nb.requireObservationDeclaration = true;
            nb.requireEvidencePerCriterion = true;
        } else if (actualType === 'logbook') {
            nb.title = 'Workplace Logbook Entry';
            nb.content = 'Learner must log assignment tasks, start/finish times, and total hours.';
        } else if (actualType === 'qcto_workplace') {
            nb.title = 'Workplace Experience Checkpoint';
            nb.weCode = 'WM-01-WE01';
            nb.weTitle = 'Attend induction program and familiarise self with company processes';
            nb.workActivities = [
                {
                    id: mkId(),
                    code: 'WA0101',
                    description: 'Define the problem',
                    evidenceItems: [
                        { id: mkId(), code: 'SE0101', description: 'Logbook entry / Signed attendance register' }
                    ]
                }
            ];
            nb.requireSelfAssessment = true;
            nb.requireGoalPlanning = true;
        } else if (actualType === 'task') {
            nb.question = bType === 'upload' ? 'Please upload your evidence (PDF, Image, Video):' :
                bType === 'audio' ? 'Please record your verbal response:' :
                    bType === 'code' ? 'Please write your code or provide a repository link:' :
                        'Describe or demonstrate your solution:';
            nb.allowText = bType === 'task';
            nb.allowUpload = bType === 'upload' || bType === 'task';
            nb.allowAudio = bType === 'audio' || bType === 'task';
            nb.allowUrl = bType === 'code' || bType === 'task';
            nb.allowCode = bType === 'code' || bType === 'task';
            nb.allowedFileTypes = 'all';
            nb.codeLanguage = 'javascript';
        }

        setBlocks(p => [...p, nb]);
        setTimeout(() => {
            setFocusedBlock(nb.id);
            document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' as const });
        }, 60);
    };

    const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) =>
        setBlocks(p => p.map(b => b.id === id ? { ...b, [field]: val } : b));

    const updateOption = (blockId: string, idx: number, val: string) =>
        setBlocks(p => p.map(b => {
            if (b.id !== blockId || !b.options) return b;
            const o = [...b.options];
            o[idx] = val;
            return { ...b, options: o };
        }));

    const removeBlock = (id: string) => {
        if (window.confirm('Remove this block?')) {
            setBlocks(p => p.filter(b => b.id !== id));
            setFocusedBlock(null);
            toast.info('Block removed');
        }
    };

    const moveBlock = (id: string, dir: 'up' | 'down') =>
        setBlocks(p => {
            const i = p.findIndex(b => b.id === id);
            if ((dir === 'up' && i === 0) || (dir === 'down' && i === p.length - 1)) return p;
            const n = [...p], sw = dir === 'up' ? i - 1 : i + 1;
            [n[i], n[sw]] = [n[sw], n[i]];
            return n;
        });

    const resetModuleInfo = () => {
        if (window.confirm("Clear all module fields?")) {
            setModuleInfo({
                title: '', nqfLevel: '', credits: 0, notionalHours: 0,
                moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: '', timeLimit: 0
            });
            setSelectedProgrammeId('');
            setSelectedModuleCode('');
            setTopics([]);
        }
    };

    const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
    const qCount = blocks.filter(b => ['text', 'mcq', 'task', 'checklist', 'qcto_workplace'].includes(b.type)).length;
    const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

    // ─── PROGRAMME (BLUEPRINT) SAVE LOGIC ───
    const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
        try {
            let customId = (newProg as any).curriculumCode?.toString().trim() || newProg.saqaId?.toString().trim();
            if (!customId) throw new Error("A Curriculum Code or SAQA ID is required to save the Blueprint.");

            customId = customId.replace(/[\s/]+/g, '-');
            const progRef = doc(db, 'programmes', customId);

            const progToSave = {
                ...newProg,
                id: customId,
                createdAt: new Date().toISOString(),
                createdBy: user?.fullName || 'Facilitator'
            };

            await setDoc(progRef, progToSave, { merge: true });

            toast.success("Curriculum Blueprint created successfully!");
            setShowProgrammeModal(false);

            await fetchProgrammes();
            setSelectedProgrammeId(customId);
            setSelectedModuleCode('');
        } catch (err: any) {
            console.error("Failed to create programme:", err);
            toast.error(`Failed to create blueprint: ${err.message}`);
        }
    };

    // ─── MAIN WORKBOOK SAVE LOGIC ───
    const handleSave = async (status: 'draft' | 'active', isAutoSave = false) => {
        if (!title.trim() && !isAutoSave) {
            toast.warning('Please enter a Workbook Title.');
            return;
        }
        if (cohortIds.length === 0 && !isAutoSave && status === 'active') {
            toast.warning('Please select at least one Cohort before publishing.');
            return;
        }

        if (!isAutoSave) setLoading(true);
        setSaveStatus('saving');

        try {
            const sanitizedBlocks = blocks.map(b => {
                const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
                if (b.linkedTopicId) {
                    const t = topics.find(topic => topic.id === b.linkedTopicId);
                    if (t) c.linkedTopicCode = t.code;
                    c.linkedTopicId = b.linkedTopicId;
                }

                if (b.type === 'section') {
                    c.title = b.title || 'Untitled Section';
                    c.content = b.content || '';
                }
                if (b.type === 'checklist' || b.type === 'logbook' || b.type === 'qcto_workplace') c.title = b.title || 'Untitled';
                if (b.type === 'info' || b.type === 'logbook') c.content = b.content || '';
                if (b.type === 'text' || b.type === 'mcq' || b.type === 'task') c.question = b.question || '';

                if (b.type === 'mcq') {
                    c.options = b.options || ['', '', '', ''];
                    c.correctOption = b.correctOption || 0;
                }
                if (b.type === 'checklist') {
                    c.criteria = b.criteria || [];
                    c.requireTimeTracking = b.requireTimeTracking !== false;
                    c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
                    c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
                    c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
                }

                // 🚀 NEW QCTO SAVE LOGIC
                if (b.type === 'qcto_workplace') {
                    c.weCode = b.weCode || '';
                    c.weTitle = b.weTitle || '';
                    c.workActivities = b.workActivities || [];
                    c.requireSelfAssessment = b.requireSelfAssessment !== false;
                    c.requireGoalPlanning = b.requireGoalPlanning !== false;
                }

                if (b.type === 'task') {
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

            let finalStatus: string = status;
            let finalScheduledDate: string | null = null;

            if (isScheduled && scheduledDate) {
                if (status === 'draft') finalStatus = 'scheduled';
                finalScheduledDate = new Date(scheduledDate).toISOString();
            }

            if (isDeployed && status === 'draft' && !isAutoSave) {
                finalStatus = assessmentStatus;
            }

            const payload = {
                title, type, moduleType, cohortIds,
                linkedProgrammeId: selectedProgrammeId,
                linkedModuleCode: selectedModuleCode,
                scheduledDate: finalScheduledDate,
                instructions: instructions || '', moduleInfo, showModuleHeader,
                learnerGuide: {
                    note: learnerNote, purpose: modulePurpose, entryRequirements,
                    providerRequirements, exemptions, assessmentInfo: instructions,
                    stakeholderGuidelines
                },
                topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
                facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
            };

            const batch = writeBatch(db);
            let currentAssessmentId = assessmentId;

            if (currentAssessmentId) {
                const templateRef = doc(db, 'assessments', currentAssessmentId);
                batch.set(templateRef, payload, { merge: true });
            } else {
                const templateRef = doc(collection(db, 'assessments'));
                currentAssessmentId = templateRef.id;
                batch.set(templateRef, {
                    ...payload,
                    createdAt: new Date().toISOString(),
                    createdBy: user?.fullName || 'Facilitator',
                });
            }

            // READ-BEFORE-WRITE DEPLOYMENT LOGIC
            if (finalStatus === 'active' || finalStatus === 'scheduled') {
                const cohortLearners = learners.filter(l => {
                    const lId = String(l.cohortId || '').trim();
                    return cohortIds.includes(lId);
                });

                if (cohortLearners.length > 0) {
                    const existingSubsQ = query(
                        collection(db, 'learner_submissions'),
                        where('assessmentId', '==', currentAssessmentId)
                    );
                    const existingSubsSnap = await getDocs(existingSubsQ);
                    const existingSubIds = new Set(existingSubsSnap.docs.map(d => d.id));

                    cohortLearners.forEach((learner: DashboardLearner) => {
                        const enrolId = learner.enrollmentId || learner.id;
                        const humanId = learner.learnerId || learner.id;
                        const qualName = learner.qualification?.name || '';
                        const targetCohort = learner.cohortId || 'Unassigned';

                        const submissionId = `${targetCohort}_${humanId}_${currentAssessmentId}`;
                        const submissionRef = doc(db, 'learner_submissions', submissionId);

                        if (!existingSubIds.has(submissionId)) {
                            batch.set(submissionRef, {
                                learnerId: humanId,
                                enrollmentId: enrolId,
                                qualificationName: qualName,
                                assessmentId: currentAssessmentId,
                                cohortId: targetCohort,
                                title: title,
                                type: type,
                                moduleType: moduleType,
                                status: 'not_started',
                                assignedAt: new Date().toISOString(),
                                marks: 0,
                                totalMarks: totalMarks,
                                moduleNumber: moduleInfo.moduleNumber,
                                createdAt: new Date().toISOString(),
                                createdBy: user?.uid || 'System'
                            });
                        } else {
                            batch.set(submissionRef, {
                                title: title,
                                type: type,
                                moduleType: moduleType,
                                totalMarks: totalMarks,
                                moduleNumber: moduleInfo.moduleNumber
                            }, { merge: true });
                        }
                    });
                }
            }

            await batch.commit();
            setAssessmentStatus(finalStatus as any);
            setSaveStatus('saved');
            setLastSaved(new Date());

            if (!isAutoSave) {
                if (finalStatus === 'active') toast.success('Workbook Published & Assigned!');
                else if (finalStatus === 'scheduled') toast.success('Workbook Scheduled & Assigned!');
                else toast.success('Draft saved successfully!');
            }

            if (!assessmentId && currentAssessmentId && !isAutoSave) {
                navigate(`/facilitator/assessments/builder/${currentAssessmentId}`, { replace: true });
            }

        } catch (err: any) {
            console.error("Save Error:", err);
            setSaveStatus('unsaved');
            if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
        } finally {
            if (!isAutoSave) setLoading(false);
        }
    };

    const activeProgramme = programmes.find(p => p.id === selectedProgrammeId);

    return (
        <div className="ab-root animate-fade-in" style={{ margin: 0, paddingBottom: '100px' }} >
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <header className="ab-topbar">
                <Tooltip content="Return to assessments list" placement="bottom">
                    <button className="ab-back-btn" onClick={() => navigate(-1)}>
                        <ArrowLeft size={18} />
                        <span>Back</span>
                    </button>
                </Tooltip>
                <div className="ab-topbar-centre">
                    <BookOpen size={16} className="ab-topbar-icon" />
                    <span className="ab-topbar-title">{title || 'Untitled Workbook'}</span>
                    <span className={`ab-topbar-badge ${type}`}>{type}</span>
                </div>
                <div className="ab-topbar-actions">

                    <div className="ab-stats-pill">
                        <span><strong>{qCount}</strong> Qs</span>
                        <div className="ab-sdiv" />
                        <span><strong>{totalMarks}</strong> marks</span>
                    </div>

                    <div className={`ab-save-status ${saveStatus}`}>
                        {saveStatus === 'saved' && (
                            <>
                                <Check size={14} />
                                <span>Saved</span>
                                {lastSaved && (
                                    <span className="ab-save-time">
                                        {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </>
                        )}
                        {saveStatus === 'saving' && (
                            <>
                                <div className="ab-spinner" />
                                <span>Saving...</span>
                            </>
                        )}
                        {saveStatus === 'unsaved' && (
                            <>
                                <AlertTriangle size={14} />
                                <span>Unsaved</span>
                            </>
                        )}
                    </div>
                    {assessmentId && (
                        <Tooltip content="Preview what learners will see" placement="bottom">
                            <button
                                className="ab-btn ab-btn-ghost"
                                onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, '_blank')}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                            >
                                <Eye size={15} />
                                Preview
                            </button>
                        </Tooltip>
                    )}

                    {!isDeployed && (
                        <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Draft'}
                        </button>
                    )}
                    <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
                        <Zap size={15} />
                        {isDeployed ? 'Update Settings' : 'Publish'}
                    </button>
                </div>
            </header>

            <div className="ab-body">
                <aside className="ab-sidebar">
                    <nav className="ab-sidebar-nav" >
                        {([
                            { id: 'settings', icon: <Settings size={14} />, label: 'Settings', tooltip: 'Basic workbook settings' },
                            { id: 'module', icon: <GraduationCap size={14} />, label: 'Module', tooltip: 'QCTO module information' },
                            { id: 'topics', icon: <ListChecks size={14} />, label: 'Topics', tooltip: 'Manage topic elements' },
                            { id: 'guide', icon: <BookMarked size={14} />, label: 'Guide', tooltip: 'Learner guide content' },
                            { id: 'outline', icon: <Eye size={14} />, label: 'Outline', tooltip: 'View workbook structure' },
                        ] as const).map(t => (
                            <Tooltip key={t.id} content={t.tooltip} placement="bottom">
                                <button
                                    className={`ab-nav-btn ${activePanel === t.id ? 'active' : ''}`}
                                    onClick={() => setActivePanel(t.id)}
                                >
                                    {t.icon}
                                    <span>{t.label}</span>
                                </button>
                            </Tooltip>
                        ))}
                    </nav>

                    <div className="ab-sidebar-body">
                        {/* 1. SETTINGS */}
                        {activePanel === 'settings' && (
                            <>
                                <SectionHdr icon={<Database size={13} />} label="Curriculum Link" />
                                <FG label="Select Programme Template">
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <div className="ab-sel-wrap" style={{ flex: 1 }}>
                                            <select
                                                className="ab-input ab-sel"
                                                value={selectedProgrammeId}
                                                onChange={e => {
                                                    setSelectedProgrammeId(e.target.value);
                                                    setSelectedModuleCode('');
                                                }}
                                            >
                                                <option value="">-- Custom / Blank --</option>
                                                {programmes.filter(p => !p.isArchived).map(p => (
                                                    <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={12} className="ab-sel-arr" />
                                        </div>
                                        <Tooltip content="Create a new Curriculum Blueprint" placement="top">
                                            <button
                                                type="button"
                                                className="ab-btn ab-btn-ghost"
                                                style={{ padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1' }}
                                                onClick={() => setShowProgrammeModal(true)}
                                            >
                                                <Plus size={14} /> New
                                            </button>
                                        </Tooltip>
                                    </div>
                                </FG>

                                {selectedProgrammeId && activeProgramme && (
                                    <FG label="Select Module (Auto-populates Topics)">
                                        <div className="ab-sel-wrap">
                                            <select
                                                className="ab-input ab-sel"
                                                value={selectedModuleCode}
                                                onChange={e => setSelectedModuleCode(e.target.value)}
                                            >
                                                <option value="">-- Select Module --</option>
                                                {(activeProgramme.knowledgeModules || []).length > 0 && (
                                                    <optgroup label="Knowledge Modules (KM)">
                                                        {activeProgramme.knowledgeModules.map((moduleItem: any, idx: number) => {
                                                            const m = moduleItem as any;
                                                            const val = m.code || m.name || `mod-km-${idx}`;
                                                            return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
                                                        })}
                                                    </optgroup>
                                                )}
                                                {(activeProgramme.practicalModules || []).length > 0 && (
                                                    <optgroup label="Practical Modules (PM)">
                                                        {activeProgramme.practicalModules.map((moduleItem: any, idx: number) => {
                                                            const m = moduleItem as any;
                                                            const val = m.code || m.name || `mod-pm-${idx}`;
                                                            return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
                                                        })}
                                                    </optgroup>
                                                )}
                                                {(activeProgramme.workExperienceModules || []).length > 0 && (
                                                    <optgroup label="Workplace Modules (WM)">
                                                        {activeProgramme.workExperienceModules.map((moduleItem: any, idx: number) => {
                                                            const m = moduleItem as any;
                                                            const val = m.code || m.name || `mod-wm-${idx}`;
                                                            return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
                                                        })}
                                                    </optgroup>
                                                )}
                                            </select>
                                            <ChevronDown size={12} className="ab-sel-arr" />
                                        </div>
                                    </FG>
                                )}

                                <div style={{ borderBottom: '1px solid #e2e8f0', margin: '1rem 0' }} />

                                <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
                                    <div className="ab-form-group" style={{ marginBottom: 0 }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> Module Curriculum Type</label>
                                        <select className="ab-input" value={moduleType} onChange={e => setModuleType(e.target.value as any)} style={{ borderColor: 'var(--mlab-blue)', fontWeight: 'bold' }}>
                                            <option value="knowledge">Knowledge Module (Standard Questions)</option>
                                            <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
                                            <option value="workplace">Workplace Experience Module (Logbooks)</option>
                                        </select>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>* Helps categorize the assessment type in your database.</span>
                                    </div>
                                    <div className="ab-form-group" style={{ marginBottom: 0 }}>
                                        <label>Assessment Type Category</label>
                                        <select className="ab-input" value={type} onChange={e => setType(e.target.value as any)}>
                                            <option value="formative">Formative Assessment</option>
                                            <option value="summative">Summative Assessment</option>
                                            <option value="Practical Observation">Practical Observation</option>
                                            <option value="Workplace Logbook">Workplace Logbook</option>
                                        </select>
                                    </div>
                                </div>

                                <FG label="Title">
                                    <input className="ab-input" value={title} onChange={e => setTitle(e.target.value)} />
                                </FG>

                                <div className="ab-meta-grid-inputs">
                                    <FG label="Time Limit (Mins)">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Clock size={16} color="#64748b" />
                                            <input type="number" className="ab-input" placeholder="e.g. 60" value={moduleInfo.timeLimit || ''} onChange={e => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })} />
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>0 for no limit.</span>
                                    </FG>

                                    <FG label="Scheduling">
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: isScheduled ? '8px' : '4px' }}>
                                            <input type="checkbox" checked={isScheduled} onChange={(e) => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(''); }} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--mlab-blue)' }} />
                                            <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>Schedule specific date/time</span>
                                        </label>
                                        {isScheduled ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '23px' }}>
                                                <Calendar size={16} color="#64748b" />
                                                <input type="datetime-local" className="ab-input" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
                                            </div>
                                        ) : (
                                            <p style={{ margin: '0 0 0 23px', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>Available anytime after publishing.</p>
                                        )}
                                    </FG>
                                </div>

                                {/* ── 🚀 UNIFIED COHORT ASSIGNMENT PANEL 🚀 ── */}
                                <div style={{ marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label className="ab-fg-label" style={{ marginBottom: 0 }}>Assign to Cohorts</label>
                                        <button type="button" className="ab-text-btn" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 600 }} onClick={() => setShowCohortModal(true)}>+ Create New Class</button>
                                    </div>
                                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '130px', overflowY: 'auto', padding: '0.5rem', background: '#fff' }}>
                                        {cohorts.map(c => (
                                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', cursor: 'pointer' }}>
                                                <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={(e) => {
                                                    if (e.target.checked) setCohortIds(prev => [...prev, c.id]);
                                                    else setCohortIds(prev => prev.filter(id => id !== c.id));
                                                }} />
                                                <span style={{ fontSize: '0.85rem', color: '#334155', flex: 1 }}>{c.name}</span>
                                                <Tooltip content="View Class Register" placement="left">
                                                    <ExternalLink size={12} style={{ opacity: 0.5, color: '#334155' }} onClick={(e) => { e.preventDefault(); navigate(`/cohorts/${c.id}`); }} />
                                                </Tooltip>
                                            </label>
                                        ))}
                                        {cohorts.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No active classes available.</div>}
                                    </div>
                                </div>

                                <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
                                <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} />
                            </>
                        )}

                        {/* 2. MODULE */}
                        {activePanel === 'module' && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
                                    <Tooltip content={showModuleHeader ? "Hide module header" : "Show module header"} placement="left">
                                        <button className={`ab-toggle-icon ${!showModuleHeader ? 'off' : ''}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
                                            {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
                                        </button>
                                    </Tooltip>
                                </div>
                                {showModuleHeader ? (
                                    <div className="animate-fade-in">
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                                            <Tooltip content="Clear all module fields" placement="left">
                                                <button className="ab-text-btn danger" onClick={resetModuleInfo}>
                                                    <RotateCcw size={12} /> Clear
                                                </button>
                                            </Tooltip>
                                        </div>
                                        <FG label="Qualification Title"><input className="ab-input" value={moduleInfo.qualificationTitle} onChange={e => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} /></FG>
                                        <FG label="Module Number"><input className="ab-input" value={moduleInfo.moduleNumber} onChange={e => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} /></FG>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={e => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
                                            <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={e => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
                                        </div>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={e => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
                                            <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={e => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
                                        </div>
                                        <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={e => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
                                    </div>
                                ) : (
                                    <div className="ab-hidden-state"><EyeOff size={24} /><p>Header hidden.</p></div>
                                )}
                            </>
                        )}

                        {/* 3. TOPICS */}
                        {activePanel === 'topics' && (
                            <TopicsPanel
                                topics={topics}
                                coveredTopicIds={coveredTopicIds}
                                editingTopicId={editingTopicId}
                                editDraft={editDraft}
                                addingTopic={addingTopic}
                                newTopic={newTopic}
                                deleteConfirmId={deleteConfirmId}
                                isDeployed={isDeployed}
                                onStartEdit={startEdit}
                                onEditChange={p => setEditDraft(d => ({ ...d, ...p }))}
                                onCommitEdit={commitEdit}
                                onCancelEdit={cancelEdit}
                                onConfirmDelete={confirmDelete}
                                onExecuteDelete={executeDelete}
                                onCancelDelete={cancelDelete}
                                onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }}
                                onNewTopicChange={p => setNewTopic(d => ({ ...d, ...p }))}
                                onCommitAdd={commitAdd}
                                onCancelAdd={cancelAdd}
                                onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel('outline'); }}
                            />
                        )}

                        {/* 4. LEARNER GUIDE */}
                        {activePanel === 'guide' && (
                            <>
                                <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
                                <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={e => setLearnerNote(e.target.value)} /></FG>
                                <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={e => setModulePurpose(e.target.value)} /></FG>
                                <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={e => setEntryRequirements(e.target.value)} /></FG>

                                {/* 🚀 NEW RICH TEXT GUIDELINES BLOCK FOR MENTORS/EMPLOYERS */}
                                <FG label="Stakeholder Guidelines (Mentors, Employers, Providers)">
                                    <div className={`ab-quill-wrapper ${isDeployed ? 'locked' : ''}`} style={{ marginTop: '5px' }}>
                                        <ReactQuill
                                            theme="snow"
                                            value={stakeholderGuidelines}
                                            onChange={setStakeholderGuidelines}
                                            readOnly={isDeployed}
                                            modules={quillModules}
                                            formats={quillFormats}
                                            placeholder="Paste the Instructions to Mentor, Responsibilities of the Employer, and Training Provider Responsibility here..."
                                        />
                                    </div>
                                </FG>

                                <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={e => setExemptions(e.target.value)} /></FG>
                            </>
                        )}

                        {/* 5. OUTLINE */}
                        {activePanel === 'outline' && (
                            <>
                                <SectionHdr icon={<Eye size={13} />} label="Outline" />
                                {blocks.length === 0 ? (
                                    <p className="ab-prose sm">No blocks yet.</p>
                                ) : (
                                    <ol className="ab-outline-list">
                                        {blocks.map((b, i) => (
                                            <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`} onClick={() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                                                <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
                                                <div className="ab-ol-text">
                                                    <span className="ab-ol-main">
                                                        {b.type === 'section' ? (b.title || 'Section') : b.type === 'info' ? 'Reading Material' : (b.question?.slice(0, 40) || b.title || `Question ${i + 1}`)}
                                                    </span>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                )}
                            </>
                        )}
                    </div>
                </aside>

                <main className="ab-canvas">

                    {/* 🚀 FIXED BOTTOM FLOATING TOOLBAR */}
                    {!isDeployed && (
                        <div style={{
                            position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
                            background: 'white', padding: '0.75rem 1.25rem', borderRadius: '50px',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                            display: 'flex', gap: '0.5rem', zIndex: 1000, border: '1px solid #cbd5e1', alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginRight: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add:</span>

                            <Tooltip content="Add Section Title" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('section')}><Type size={16} /></button></Tooltip>
                            <Tooltip content="Add Reading Material" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('info')}><Info size={16} /></button></Tooltip>

                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

                            <Tooltip content="Add MCQ" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('mcq')}><CheckSquare size={16} /></button></Tooltip>
                            <Tooltip content="Add Written Question" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('text')}><AlignLeft size={16} /></button></Tooltip>

                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

                            <Tooltip content="Add File Upload" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#f5f3ff', color: '#8b5cf6' }} onClick={() => addBlock('upload')}><UploadCloud size={16} /></button></Tooltip>
                            <Tooltip content="Add Audio Recording" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#fdf4ff', color: '#d946ef' }} onClick={() => addBlock('audio')}><Mic size={16} /></button></Tooltip>
                            <Tooltip content="Add Code Submission" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#fdf2f8', color: '#ec4899' }} onClick={() => addBlock('code')}><Code size={16} /></button></Tooltip>
                            <Tooltip content="Advanced Multi-Modal Task" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px' }} onClick={() => addBlock('task')}><Layers size={16} /></button></Tooltip>

                            <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

                            <Tooltip content="Add Observation Checklist" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--practical" style={{ padding: '8px 12px' }} onClick={() => addBlock('checklist')}><ListChecks size={16} /></button></Tooltip>
                            <Tooltip content="Basic Logbook Table" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--practical" style={{ padding: '8px 12px' }} onClick={() => addBlock('logbook')}><CalendarRange size={16} /></button></Tooltip>
                            <Tooltip content="QCTO Workplace Checkpoint" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px', background: '#ffe4e6', color: '#e11d48' }} onClick={() => addBlock('qcto_workplace')}><Briefcase size={16} /></button></Tooltip>
                        </div>
                    )}

                    <div className="ab-canvas-inner">
                        {isDeployed && (
                            <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '10px 15px', borderRadius: '6px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
                                <AlertTriangle size={24} style={{ flexShrink: 0 }} />
                                <div>
                                    <strong>Strict Mode Enabled (Assessment Deployed):</strong> Structural changes (adding/removing blocks, adding/removing topics, changing mark values) are locked to protect learner data integrity. You may only edit text to fix typos, or update scheduled dates and cohort assignments via the settings panel.
                                </div>
                            </div>
                        )}

                        {showModuleHeader && (
                            <div className="ab-module-card clickable" onClick={() => setActivePanel('module')}>
                                <div className="ab-mc-left">
                                    <div className="ab-mc-badges">
                                        <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
                                        <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
                                        <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
                                        {moduleInfo.timeLimit ? (
                                            <span className="ab-mc-b" style={{ background: '#fef3c7', color: '#b45309' }}>
                                                <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
                                                {moduleInfo.timeLimit}m Limit
                                            </span>
                                        ) : null}
                                        <span className={`ab-mc-b type-${type}`}>{type}</span>
                                    </div>
                                    <h1 className="ab-mc-title">{title || 'Untitled Workbook'}</h1>
                                    <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
                                </div>
                                <div className="ab-mc-right">
                                    <div className="ab-mc-stat">
                                        <span className="ab-mc-val">{qCount}</span>
                                        <span className="ab-mc-lbl">Qs</span>
                                    </div>
                                    <div className="ab-mc-div" />
                                    <div className="ab-mc-stat">
                                        <span className="ab-mc-val">{totalMarks}</span>
                                        <span className="ab-mc-lbl">Marks</span>
                                    </div>
                                </div>
                                <div className="ab-mc-edit-hint"><Pencil size={12} /> Edit</div>
                            </div>
                        )}

                        {blocks.length === 0 ? (
                            <EmptyCanvas onAdd={addBlock} />
                        ) : (
                            <div className="ab-blocks-list">
                                {blocks.map((b, idx) => (
                                    <BlockCard
                                        key={b.id} block={b} index={idx} total={blocks.length} topics={topics}
                                        focused={focusedBlock === b.id} onFocus={() => setFocusedBlock(b.id)}
                                        isDeployed={isDeployed}
                                        onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>

            {deleteConfirmId && (
                <DeleteOverlay
                    topic={topics.find(t => t.id === deleteConfirmId)!}
                    linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
                    onConfirm={executeDelete} onCancel={cancelDelete}
                />
            )}

            {showProgrammeModal && (
                <ProgrammeFormModal
                    existingProgrammes={programmes}
                    onClose={() => setShowProgrammeModal(false)}
                    onSave={handleSaveNewProgramme}
                    title="Create Curriculum Blueprint"
                />
            )}

            {showCohortModal && (
                <CohortFormModal
                    onClose={() => setShowCohortModal(false)}
                    onSave={handleSaveNewCohort}
                />
            )}
        </div>
    );
};

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
            {!props.addingTopic && !props.isDeployed && (
                <Tooltip content="Add new topic element" placement="left">
                    <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}>
                        <Plus size={14} />
                    </button>
                </Tooltip>
            )}
        </div>
        {props.addingTopic && !props.isDeployed && (
            <div className="ab-topic-form">
                <div className="ab-topic-form-row">
                    <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ''} onChange={e => props.onNewTopicChange({ code: e.target.value })} />
                    <input className="ab-input sm" placeholder="Weight" style={{ width: '60px' }} value={props.newTopic.weight || ''} onChange={e => props.onNewTopicChange({ weight: e.target.value })} />
                </div>
                <textarea className="ab-input sm" rows={2} placeholder="Description..." value={props.newTopic.title || ''} onChange={e => props.onNewTopicChange({ title: e.target.value })} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
                    <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
                    <button className="ab-btn sm ab-btn-primary" onClick={props.onCommitAdd}>Add</button>
                </div>
            </div>
        )}
        <div className="ab-topics-list">
            {props.topics.length === 0 && <p className="ab-prose sm" style={{ fontStyle: 'italic', opacity: 0.7 }}>No topics found. Select a module from Settings.</p>}
            {props.topics.map((t: Topic) => {
                const covered = props.coveredTopicIds.has(t.id);
                const isEditing = props.editingTopicId === t.id;

                if (isEditing) return (
                    <div key={t.id} className="ab-topic-row editing">
                        <div className="ab-topic-edit-fields">
                            <input className="ab-topic-edit-input" value={props.editDraft.code || ''} onChange={e => props.onEditChange({ code: e.target.value })} />
                            <input className="ab-topic-edit-input" value={props.editDraft.title || ''} onChange={e => props.onEditChange({ title: e.target.value })} />
                        </div>
                        <div className="ab-topic-edit-actions">
                            <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={14} /></button>
                            <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={14} /></button>
                        </div>
                    </div>
                );

                return (
                    <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
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
                                    <Tooltip content="Add question for this topic" placement="top"><button className="ab-tadd-btn" onClick={() => props.onAddBlock('text', t.id)}>+Q</button></Tooltip>
                                    <Tooltip content="Add reading material for this topic" placement="top"><button className="ab-tadd-btn reading" onClick={() => props.onAddBlock('info', t.id)}>+R</button></Tooltip>
                                    <Tooltip content="Delete topic" placement="top"><button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button></Tooltip>
                                </>
                            )}
                            <Tooltip content="Edit topic details (Text only)" placement="top"><button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button></Tooltip>
                        </div>
                    </div>
                );
            })}
        </div>
    </>
);

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
    onMove: (id: string, dir: 'up' | 'down') => void;
}

const BlockCard: React.FC<BlockCardProps> = ({ block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove }) => {
    const meta = BLOCK_META[block.type];
    const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

    const updateCriterion = (i: number, val: string) => {
        const c = [...(block.criteria || [])];
        c[i] = val;
        onUpdate(block.id, 'criteria', c);
    };

    const removeCriterion = (i: number) => {
        const c = (block.criteria || []).filter((_, idx) => idx !== i);
        onUpdate(block.id, 'criteria', c);
    };

    const addCriterion = () => {
        onUpdate(block.id, 'criteria', [...(block.criteria || []), '']);
    };

    // 🚀 QCTO WORKPLACE SUB-ARRAY HANDLERS
    const updateWA = (waIndex: number, field: 'code' | 'description', val: string) => {
        const waList = [...(block.workActivities || [])];
        waList[waIndex] = { ...waList[waIndex], [field]: val };
        onUpdate(block.id, 'workActivities', waList);
    };

    const removeWA = (waIndex: number) => {
        const waList = (block.workActivities || []).filter((_, idx) => idx !== waIndex);
        onUpdate(block.id, 'workActivities', waList);
    };

    const addWA = () => {
        const waList = [...(block.workActivities || [])];
        waList.push({ id: mkId(), code: '', description: '', evidenceItems: [] });
        onUpdate(block.id, 'workActivities', waList);
    };

    // 🚀 NESTED SUPPORTING EVIDENCE HANDLERS
    const updateSE = (waIndex: number, seIndex: number, field: 'code' | 'description', val: string) => {
        const waList = [...(block.workActivities || [])];
        const seList = [...(waList[waIndex].evidenceItems || [])];
        seList[seIndex] = { ...seList[seIndex], [field]: val };
        waList[waIndex] = { ...waList[waIndex], evidenceItems: seList };
        onUpdate(block.id, 'workActivities', waList);
    };

    const removeSE = (waIndex: number, seIndex: number) => {
        const waList = [...(block.workActivities || [])];
        const seList = (waList[waIndex].evidenceItems || []).filter((_, idx) => idx !== seIndex);
        waList[waIndex] = { ...waList[waIndex], evidenceItems: seList };
        onUpdate(block.id, 'workActivities', waList);
    };

    const addSE = (waIndex: number) => {
        const waList = [...(block.workActivities || [])];
        const seList = [...(waList[waIndex].evidenceItems || [])];
        seList.push({ id: mkId(), code: '', description: '' });
        waList[waIndex] = { ...waList[waIndex], evidenceItems: seList };
        onUpdate(block.id, 'workActivities', waList);
    };

    return (
        <div id={`block-${block.id}`} className={`ab-block ${focused ? 'is-focused' : ''} ${isDeployed ? 'is-locked' : ''}`} style={{ '--block-accent': meta.color } as React.CSSProperties} onClick={onFocus}>
            <div className="ab-block-strip" style={{ background: meta.color }} />
            <div className="ab-block-ctrl-row">
                <div className="ab-block-left">
                    <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
                    {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
                    {isDeployed && <span title="Structure Locked" style={{ marginLeft: '8px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}><Lock size={12} /></span>}
                </div>
                {!isDeployed && (
                    <div className="ab-block-actions">
                        <Tooltip content="Move block up" placement="top"><button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }} disabled={index === 0}>↑</button></Tooltip>
                        <Tooltip content="Move block down" placement="top"><button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }} disabled={index === total - 1}>↓</button></Tooltip>
                        <Tooltip content="Delete block" placement="top"><button className="ab-ctrl-btn ab-ctrl-del" onClick={e => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button></Tooltip>
                    </div>
                )}
            </div>

            {/* 🚀 SECTION */}
            {block.type === 'section' && (
                <div className="ab-q-body" onClick={e => e.stopPropagation()}>
                    <div className="ab-form-group" style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Section Outline Label (Short Title)</label>
                        <input className="ab-input" value={block.title || ''} placeholder="e.g. SECTION B- PM-01-PS02" onChange={e => onUpdate(block.id, 'title', e.target.value)} disabled={isDeployed} />
                    </div>
                    <div className={`ab-quill-wrapper ${isDeployed ? 'locked' : ''}`}>
                        <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', display: 'block' }}>Section Content / Criteria details</label>
                        <ReactQuill
                            theme="snow"
                            value={block.content || ''}
                            onChange={(content) => onUpdate(block.id, 'content', content)}
                            readOnly={isDeployed}
                            modules={quillModules}
                            formats={quillFormats}
                            placeholder="e.g. PM-01-PS02: Use software packages...&#10;Applied Knowledge...&#10;Internal Assessment Criteria..."
                        />
                    </div>
                </div>
            )}

            {/* INFO */}
            {block.type === 'info' && <div className="ab-info-body"><textarea className="ab-textarea-block" rows={5} value={block.content || ''} onChange={e => onUpdate(block.id, 'content', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Enter reading material..." /></div>}

            {/* WRITTEN QUESTION */}
            {block.type === 'text' && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num">Q{index + 1}</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>
                    <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Type question here..." />
                    <div className="ab-answer-placeholder"><FileText size={14} /><span>Learner types answer here</span></div>
                </div>
            )}

            {/* MCQ */}
            {block.type === 'mcq' && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num">Q{index + 1}</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>
                    <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Type question here..." />
                    <div className="ab-mcq-opts">
                        {block.options?.map((opt, i) => (
                            <div key={i} className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`} onClick={e => { if (isDeployed) return; e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}>
                                <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
                                <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
                                <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={e => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={e => e.stopPropagation()} />
                                {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 🚀 MULTI-MODAL TASK BLOCK */}
            {block.type === 'task' && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num" style={{ background: '#ede9fe', color: '#8b5cf6' }}>Q{index + 1}</span>
                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>
                    <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Describe the task or evidence request..." />

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }} onClick={e => e.stopPropagation()}>
                        <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '10px', fontSize: '0.85rem' }}>Allowed Evidence Types (Learner can choose any combination)</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={block.allowText} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowText', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                <AlignLeft size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Rich Text Typing</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={block.allowAudio} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowAudio', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                <Mic size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Audio Recording</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={block.allowUrl} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowUrl', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                <LinkIcon size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>External URL/Link</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={block.allowUpload} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowUpload', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                <UploadCloud size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>File Upload</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" checked={block.allowCode} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowCode', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
                                <Code size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Code Editor</span>
                            </label>
                        </div>
                        {(block.allowUpload || block.allowCode) && (
                            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                {block.allowUpload && (
                                    <div className="ab-form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                        <label style={{ fontSize: '0.75rem' }}>Restrict File Type (Uploads)</label>
                                        <select className="ab-input" value={block.allowedFileTypes || 'all'} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowedFileTypes', e.target.value)}>
                                            <option value="all">Any File (Images, Docs, Video, Presentations)</option>
                                            <option value="presentation">Presentations Only (.pptx, .pdf)</option>
                                            <option value="video">Video Evidence Only (.mp4, .mov)</option>
                                            <option value="image">Images Only (.png, .jpg)</option>
                                        </select>
                                    </div>
                                )}
                                {block.allowCode && (
                                    <div className="ab-form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
                                        <label style={{ fontSize: '0.75rem' }}>Syntax Highlighting (Code)</label>
                                        <select className="ab-input" value={block.codeLanguage || 'javascript'} disabled={isDeployed} onChange={e => onUpdate(block.id, 'codeLanguage', e.target.value)}>
                                            <option value="javascript">JavaScript / TypeScript</option>
                                            <option value="python">Python</option>
                                            <option value="html">HTML / CSS</option>
                                            <option value="sql">SQL</option>
                                            <option value="other">Other / Plain Text</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 🚀 PRACTICAL CHECKLIST BLOCK */}
            {block.type === 'checklist' && (
                <div className="ab-q-body">
                    <div className="ab-q-top" style={{ marginBottom: '10px' }}>
                        <span className="ab-q-num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>

                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks || 0}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
                        </div>

                        <div className="ab-topic-sel-wrap">
                            <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
                            </select>
                            {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="ab-form-group" style={{ flex: 1, marginBottom: '10px' }}>
                            <label>Practical Task Outcome / Instruction</label>
                            <input type="text" className="ab-input" value={block.title} onChange={e => onUpdate(block.id, 'title', e.target.value)} placeholder="e.g. PA0101 Demonstrate the use of various functionalities:" />
                        </div>
                    </div>

                    {/* 🚀 TOGGLES */}
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px', background: '#fffbeb', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px' }} onClick={e => e.stopPropagation()}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                            <input type="checkbox" disabled={isDeployed} checked={block.requirePerCriterionTiming !== false} onChange={e => onUpdate(block.id, 'requirePerCriterionTiming', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
                            <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>Require Timers per task</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer', borderLeft: '1px solid #fcd34d', paddingLeft: '15px' }}>
                            <input type="checkbox" disabled={isDeployed} checked={block.requireEvidencePerCriterion !== false} onChange={e => onUpdate(block.id, 'requireEvidencePerCriterion', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
                            <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>Require Learner Evidence per task</span>
                        </label>
                    </div>

                    <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
                        <label style={{ fontWeight: 'bold', color: '#334155', marginBottom: '15px', display: 'block', fontSize: '0.85rem' }}>Evaluation Criterions to Observe:</label>
                        {block.criteria?.map((criterion, i) => (
                            <div key={i} style={{ marginBottom: '1.5rem', padding: '15px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                    <div style={{ background: '#e2e8f0', padding: '8px 12px', borderRadius: '4px', color: '#475569', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>{i + 1}</div>
                                    <input type="text" className="ab-input" style={{ flex: 1, fontWeight: 'bold', color: '#0f172a' }} value={criterion} disabled={isDeployed} onChange={e => updateCriterion(i, e.target.value)} placeholder="e.g. Open files and folders" />
                                    {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeCriterion(i)}><X size={16} /></button>}
                                </div>

                                {/* 🚀 UI PREVIEW FOR FACILITATOR */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '45px', opacity: 0.6, pointerEvents: 'none' }}>

                                    {block.requireEvidencePerCriterion !== false && (
                                        <div style={{ padding: '8px', background: '#f1f5f9', borderRadius: '4px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '10px', color: '#475569', fontSize: '0.75rem' }}>
                                            <UploadCloud size={14} /> <em>Learner will be able to upload a file or link evidence here...</em>
                                        </div>
                                    )}

                                    {block.requirePerCriterionTiming !== false && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', alignSelf: 'flex-start' }}>
                                            <Timer size={14} color="#64748b" />
                                            <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>Task Timer:</span>
                                            <button className="ab-btn sm" disabled style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '2px 10px', borderRadius: '4px', fontSize: '0.7rem' }}>Start Task</button>
                                            <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>00:00:00</span>
                                        </div>
                                    )}

                                    <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#f0fdf4', padding: '6px 10px', borderRadius: '4px', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 'bold' }}>
                                                <input type="radio" disabled /> Competent (C)
                                            </label>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#fef2f2', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 'bold' }}>
                                                <input type="radio" disabled /> NYC
                                            </label>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <input type="text" className="ab-input" disabled placeholder="Assessor comments..." style={{ fontSize: '0.8rem', padding: '6px 10px', background: '#f1f5f9' }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {!isDeployed && <button className="ab-btn-text" onClick={addCriterion} style={{ marginTop: '5px' }}><Plus size={14} /> Add Criterion</button>}

                        <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1', opacity: 0.8, pointerEvents: 'none' }}>
                            <h4 style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '10px', textTransform: 'uppercase' }}>Global Assessor / Mentor Sign-off Preview</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                                <input type="text" className="ab-input" disabled placeholder="Date..." />
                                <input type="text" className="ab-input" disabled placeholder="Overall Time Started..." />
                                <input type="text" className="ab-input" disabled placeholder="Overall Time Completed..." />
                            </div>
                            <textarea className="ab-input" rows={2} disabled placeholder="General Comments of Observer..."></textarea>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.8rem', color: '#334155', fontWeight: 'bold' }}>
                                <input type="checkbox" disabled checked style={{ accentColor: 'var(--mlab-blue)' }} />
                                I declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* 🚀 BASIC LOGBOOK BLOCK */}
            {block.type === 'logbook' && (
                <div className="ab-q-body">
                    <div className="ab-q-top" style={{ marginBottom: '10px' }}>
                        <span className="ab-q-num" style={{ background: '#ffedd5', color: '#ea580c' }}>LOG</span>
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '6px' }}>
                        <h4 style={{ margin: '0 0 10px 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarRange size={18} /> Standard Logbook Table Inserted</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: 1.5 }}>
                            When the learner takes this assessment, they will be presented with a dynamic table to log their Date, Assignment Task, Start Time, Finish Time, and Total Hours.<br /><br />
                            No further configuration is needed here.
                        </p>
                    </div>
                </div>
            )}

            {/* 🚀 QCTO WORKPLACE CHECKPOINT BLOCK 🚀 */}
            {block.type === 'qcto_workplace' && (
                <div className="ab-q-body">
                    <div className="ab-q-top" style={{ marginBottom: '10px' }}>
                        <span className="ab-q-num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>

                        <div className="ab-marks-stepper">
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
                            <span className="ab-step-val">{block.marks || 0}</span>
                            <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
                        </div>
                    </div>

                    <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }} onClick={e => e.stopPropagation()}>

                        <div className="ab-form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#9f1239', fontWeight: 'bold' }}>Work Experience Module Code (WE Code)</label>
                            <input type="text" className="ab-input" value={block.weCode || ''} onChange={e => onUpdate(block.id, 'weCode', e.target.value)} disabled={isDeployed} placeholder="e.g. WM-01-WE01" style={{ borderColor: '#fecdd3' }} />
                        </div>

                        <div className="ab-form-group" style={{ marginBottom: '1rem' }}>
                            <label style={{ color: '#9f1239', fontWeight: 'bold' }}>Work Experience Title</label>
                            <input type="text" className="ab-input" value={block.weTitle || ''} onChange={e => onUpdate(block.id, 'weTitle', e.target.value)} disabled={isDeployed} placeholder="e.g. Attend induction program and familiarise self with company..." style={{ borderColor: '#fecdd3' }} />
                        </div>

                        {/* WORK ACTIVITIES ARRAY */}
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fecdd3', marginBottom: '1rem' }}>
                            <label style={{ display: 'block', color: '#be123c', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.85rem' }}>Workplace Activities (WA Codes) & Evidence Links</label>

                            {(block.workActivities || []).map((wa, waIndex) => (
                                <div key={wa.id} style={{ background: '#fffbfa', border: '1px solid #ffe4e6', padding: '10px', borderRadius: '4px', marginBottom: '1rem' }}>
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        <input type="text" className="ab-input" style={{ width: '100px' }} value={wa.code} onChange={e => updateWA(waIndex, 'code', e.target.value)} disabled={isDeployed} placeholder="WA0101" />
                                        <input type="text" className="ab-input" style={{ flex: 1 }} value={wa.description} onChange={e => updateWA(waIndex, 'description', e.target.value)} disabled={isDeployed} placeholder="Description of the activity..." />
                                        {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeWA(waIndex)}><X size={16} /></button>}
                                    </div>

                                    {/* NESTED EVIDENCE ARRAY */}
                                    <div style={{ marginLeft: '20px', paddingLeft: '15px', borderLeft: '2px solid #fecdd3' }}>
                                        <label style={{ display: 'block', color: '#e11d48', fontWeight: 'bold', marginBottom: '8px', fontSize: '0.75rem', textTransform: 'uppercase' }}>Required Supporting Evidence (SE)</label>
                                        {(wa.evidenceItems || []).map((se, seIndex) => (
                                            <div key={se.id} style={{ display: 'flex', gap: '10px', marginBottom: '6px' }}>
                                                <input type="text" className="ab-input sm" style={{ width: '80px', fontSize: '0.75rem' }} value={se.code} onChange={e => updateSE(waIndex, seIndex, 'code', e.target.value)} disabled={isDeployed} placeholder="SE0101" />
                                                <input type="text" className="ab-input sm" style={{ flex: 1, fontSize: '0.75rem' }} value={se.description} onChange={e => updateSE(waIndex, seIndex, 'description', e.target.value)} disabled={isDeployed} placeholder="Describe expected evidence (e.g. Signed attendance register)" />
                                                {!isDeployed && <button className="ab-btn-icon-danger" style={{ padding: '4px' }} onClick={() => removeSE(waIndex, seIndex)}><Trash2 size={12} /></button>}
                                            </div>
                                        ))}
                                        {!isDeployed && <button className="ab-btn-text" style={{ color: '#e11d48', fontSize: '0.75rem', marginTop: '4px' }} onClick={() => addSE(waIndex)}><Plus size={12} /> Add Evidence Requirement</button>}
                                    </div>
                                </div>
                            ))}
                            {!isDeployed && <button className="ab-btn-text" style={{ color: '#be123c', fontWeight: 'bold' }} onClick={addWA}><Plus size={14} /> Add Workplace Activity</button>}
                        </div>

                        {/* TOGGLES */}
                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', borderTop: '1px dashed #fda4af', paddingTop: '15px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" disabled={isDeployed} checked={block.requireSelfAssessment !== false} onChange={e => onUpdate(block.id, 'requireSelfAssessment', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
                                <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>Require Learner Self-Assessment</span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
                                <input type="checkbox" disabled={isDeployed} checked={block.requireGoalPlanning !== false} onChange={e => onUpdate(block.id, 'requireGoalPlanning', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
                                <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>Require Goal Planning</span>
                            </label>
                        </div>

                        <p style={{ margin: '15px 0 0 0', fontSize: '0.75rem', color: '#be123c', fontStyle: 'italic' }}>
                            * When taking the assessment, learners will see a formal QCTO Checkpoint form mapping their uploads to these specific WA and SE codes, alongside mentor sign-off.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
    <div className="ab-overlay-backdrop" onClick={onCancel}>
        <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
            <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
            <h3 className="ab-dd-title">Delete Topic?</h3>
            <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
            {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
            <div className="ab-dd-actions">
                <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={14} /> Delete</button>
            </div>
        </div>
    </div>
);

const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (<div className="ab-section-hdr">{icon}<span>{label}</span></div>);
const FG: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (<div className="ab-fg" style={style}>{label && <label className="ab-fg-label">{label}</label>}{children}</div>);
const EmptyCanvas: React.FC<{ onAdd: (t: string) => void }> = ({ onAdd }) => (
    <div className="ab-empty-canvas">
        <div className="ab-empty-inner">
            <div className="ab-empty-icon"><BookOpen size={30} /></div>
            <h2 className="ab-empty-title">Drafting Surface</h2>
            <p className="ab-empty-sub">Choose a block type to begin</p>
            <div className="ab-empty-grid">
                {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
                    <button key={bt} className="ab-empty-card" style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
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



// import React, { useState, useEffect, useRef } from 'react';
// import { useNavigate, useParams } from 'react-router-dom';
// import { collection, doc, getDoc, setDoc, writeBatch, query, where, getDocs } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import {
//     Save, ArrowLeft, Trash2, AlignLeft, CheckSquare,
//     Layout, Info, ChevronDown, BookOpen, FileText,
//     Zap, Eye, Settings, GraduationCap, ListChecks,
//     ClipboardList, BookMarked, Plus, Pencil, Check, X,
//     AlertTriangle, RotateCcw, EyeOff, Clock, Database,
//     ExternalLink, Calendar, Lock, Layers, UploadCloud, Mic, Code, Link as LinkIcon, CalendarRange, Timer,
//     Building2,
//     Type, Briefcase
// } from 'lucide-react';
// import Tooltip from '../../components/common/Tooltip/Tooltip';
// import type { Cohort, ProgrammeTemplate, DashboardLearner } from '../../types';
// import { CohortFormModal } from '../../components/admin/CohortFormModal/CohortFormModal';
// import { ProgrammeFormModal } from '../../components/admin/ProgrammeFormModal/ProgrammeFormModal';
// import ReactQuill from 'react-quill-new';
// import 'react-quill-new/dist/quill.snow.css';
// import './FacilitatorDashboard.css';
// import { ToastContainer, useToast } from '../../components/common/Toast/Toast';

// const quillModules = { toolbar: [['bold', 'italic', 'underline', 'code-block'], [{ 'list': 'ordered' }, { 'list': 'bullet' }], ['clean']] };
// const quillFormats = ['bold', 'italic', 'underline', 'code-block', 'list', 'bullet'];

// // ─── TYPES ────────────────────────────────────────────────────────────────────
// export type BlockType = 'section' | 'info' | 'mcq' | 'text' | 'task' | 'checklist' | 'logbook' | 'qcto_workplace';
// type SidebarPanel = 'settings' | 'module' | 'topics' | 'guide' | 'outline';

// interface Topic {
//     id: string;
//     code: string;
//     title: string;
//     weight: string | number;
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

//     // Multi-Modal Fields
//     allowText?: boolean;
//     allowUpload?: boolean;
//     allowAudio?: boolean;
//     allowUrl?: boolean;
//     allowCode?: boolean;
//     allowedFileTypes?: 'all' | 'image' | 'document' | 'video' | 'presentation';
//     codeLanguage?: 'javascript' | 'python' | 'html' | 'sql' | 'other';

//     // Practical Checklist Fields
//     criteria?: string[];
//     requireTimeTracking?: boolean;
//     requirePerCriterionTiming?: boolean;
//     requireObservationDeclaration?: boolean;
//     requireEvidencePerCriterion?: boolean;

//     // 🚀 NEW: QCTO Workplace Checkpoint Fields
//     weCode?: string;
//     workActivities?: { id: string; code: string; description: string }[];
//     expectedDocuments?: string[];
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

// const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
//     section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
//     info: { label: 'Reading', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
//     text: { label: 'Written', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Standard free-text response' },
//     mcq: { label: 'MCQ', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
//     task: { label: 'Multi-Modal', color: '#8b5cf6', icon: <Layers size={14} />, desc: 'Allow file uploads, audio, code, or links' },
//     checklist: { label: 'Checklist', color: '#14b8a6', icon: <ListChecks size={14} />, desc: 'Assessor C/NYC observation list' },
//     logbook: { label: 'Basic Logbook', color: '#f97316', icon: <CalendarRange size={14} />, desc: 'Standard workplace hours logbook' },
//     qcto_workplace: { label: 'QCTO Workplace Checkpoint', color: '#e11d48', icon: <Briefcase size={14} />, desc: 'SETA compliant workplace reflection & evidence' },
// };

// // ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// export const AssessmentBuilder: React.FC = () => {
//     const { assessmentId } = useParams();
//     const navigate = useNavigate();
//     const toast = useToast();

//     // Store Data
//     const { user, cohorts, learners, programmes, fetchCohorts, fetchLearners, fetchProgrammes } = useStore();

//     // UI States
//     const [loading, setLoading] = useState(false);
//     const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
//     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
//     const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
//     const [lastSaved, setLastSaved] = useState<Date | null>(null);

//     // STATUS TRACKING FOR STRICT MODE
//     const [assessmentStatus, setAssessmentStatus] = useState<'draft' | 'scheduled' | 'active' | 'completed'>('draft');

//     // Modals & Linking States
//     const [selectedProgrammeId, setSelectedProgrammeId] = useState<string>('');
//     const [selectedModuleCode, setSelectedModuleCode] = useState<string>('');
//     const [showProgrammeModal, setShowProgrammeModal] = useState(false);
//     const [showCohortModal, setShowCohortModal] = useState(false);

//     // Data States
//     const [title, setTitle] = useState('');
//     const [cohortIds, setCohortIds] = useState<string[]>([]);
//     const [instructions, setInstructions] = useState('');
//     const [type, setType] = useState<'formative' | 'summative' | 'Practical Observation' | 'Workplace Logbook'>('formative');
//     const [moduleType, setModuleType] = useState<'knowledge' | 'practical' | 'workplace'>('knowledge');

//     // SCHEDULING STATES
//     const [isScheduled, setIsScheduled] = useState<boolean>(false);
//     const [scheduledDate, setScheduledDate] = useState<string>('');

//     // Module & Guide States
//     const [showModuleHeader, setShowModuleHeader] = useState(true);
//     const [moduleInfo, setModuleInfo] = useState<ModuleDetails>({
//         title: '', nqfLevel: '', credits: 0, notionalHours: 0,
//         moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: '', timeLimit: 60
//     });
//     const [learnerNote, setLearnerNote] = useState('');
//     const [modulePurpose, setModulePurpose] = useState('');
//     const [entryRequirements, setEntryRequirements] = useState('');
//     const [providerRequirements, setProviderRequirements] = useState('');
//     const [exemptions, setExemptions] = useState('');
//     const [stakeholderGuidelines, setStakeholderGuidelines] = useState('');

//     // Content States
//     const [topics, setTopics] = useState<Topic[]>([]);
//     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

//     // CRUD States
//     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
//     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
//     const [addingTopic, setAddingTopic] = useState(false);
//     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
//     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

//     // CALCULATE STRICT MODE
//     const isDeployed = assessmentStatus !== 'draft' && assessmentId !== undefined;

//     // ─── INITIAL LOAD ───
//     useEffect(() => {
//         if (cohorts.length === 0) fetchCohorts();
//         if (learners.length === 0) fetchLearners();
//         if (programmes.length === 0) fetchProgrammes();

//         const loadData = async () => {
//             if (!assessmentId) return;

//             setLoading(true);
//             try {
//                 const docRef = doc(db, 'assessments', assessmentId);
//                 const snap = await getDoc(docRef);

//                 if (snap.exists()) {
//                     const data = snap.data();
//                     setTitle(data.title || '');
//                     setCohortIds(data.cohortIds || (data.cohortId ? [data.cohortId] : []));
//                     setInstructions(data.instructions || '');
//                     setType(data.type || 'formative');
//                     setModuleType(data.moduleType || 'knowledge');
//                     setAssessmentStatus(data.status || 'draft');

//                     if (data.scheduledDate) {
//                         try {
//                             const d = new Date(data.scheduledDate);
//                             if (!isNaN(d.getTime())) {
//                                 const pad = (n: number) => n.toString().padStart(2, '0');
//                                 const localStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
//                                 setScheduledDate(localStr);
//                             } else {
//                                 setScheduledDate(data.scheduledDate);
//                             }
//                         } catch {
//                             setScheduledDate(data.scheduledDate);
//                         }
//                     }
//                     setIsScheduled(!!data.scheduledDate);

//                     setSelectedProgrammeId(data.linkedProgrammeId || '');
//                     setSelectedModuleCode(data.linkedModuleCode || '');
//                     setModuleInfo(data.moduleInfo || {});
//                     setShowModuleHeader(data.showModuleHeader ?? true);
//                     setBlocks(data.blocks || []);

//                     if (data.learnerGuide) {
//                         setLearnerNote(data.learnerGuide.note || '');
//                         setModulePurpose(data.learnerGuide.purpose || '');
//                         setEntryRequirements(data.learnerGuide.entryRequirements || '');
//                         setProviderRequirements(data.learnerGuide.providerRequirements || '');
//                         setExemptions(data.learnerGuide.exemptions || '');
//                         setStakeholderGuidelines(data.learnerGuide.stakeholderGuidelines || '');
//                     }

//                     if (data.topics && Array.isArray(data.topics)) {
//                         setTopics(data.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
//                     }

//                     setSaveStatus('saved');
//                     setLastSaved(new Date(data.lastUpdated || data.createdAt));
//                 } else {
//                     toast.error('Assessment not found');
//                     navigate('/facilitator/assessments');
//                 }
//             } catch (error) {
//                 console.error("Failed to load assessment:", error);
//                 toast.error("Could not load the requested assessment.");
//             } finally {
//                 setLoading(false);
//             }
//         };

//         loadData();
//         // eslint-disable-next-line react-hooks/exhaustive-deps
//     }, [assessmentId]);

//     // ─── CURRICULUM SYNC LOGIC ───
//     useEffect(() => {
//         if (!selectedProgrammeId || !selectedModuleCode) return;
//         if (assessmentId && topics.length > 0) return;

//         const prog = programmes.find(p => p.id === selectedProgrammeId);
//         if (!prog) return;

//         const allMods = [
//             ...(prog.knowledgeModules || []),
//             ...(prog.practicalModules || []),
//             ...(prog.workExperienceModules || [])
//         ];

//         const mod: any = allMods.find((moduleItem: any, idx: number) => {
//             const uniqueVal = moduleItem.code || moduleItem.name || `mod-${idx}`;
//             return uniqueVal === selectedModuleCode;
//         });

//         if (mod) {
//             setModuleInfo({
//                 title: mod.name,
//                 nqfLevel: `Level ${mod.nqfLevel || prog.nqfLevel}`,
//                 credits: mod.credits || 0,
//                 notionalHours: mod.notionalHours || 0,
//                 moduleNumber: mod.code || '',
//                 occupationalCode: (prog as any).curriculumCode || prog.saqaId || '',
//                 saqaQualId: prog.saqaId || '',
//                 qualificationTitle: prog.name || '',
//                 timeLimit: moduleInfo.timeLimit || 60
//             });

//             if (mod.topics && mod.topics.length > 0) {
//                 const mappedTopics = mod.topics.map((t: any) => ({
//                     id: mkId(),
//                     code: t.code || '',
//                     title: t.title || 'Unnamed Topic',
//                     weight: t.weight || '0'
//                 }));
//                 setTopics(mappedTopics);
//                 toast.success(`Imported ${mappedTopics.length} topics from Curriculum!`);
//             } else {
//                 setTopics([]);
//             }
//         }
//     }, [selectedProgrammeId, selectedModuleCode]);


//     // ─── AUTO-SAVE ───
//     useEffect(() => {
//         if (!assessmentId) return;
//         setSaveStatus('unsaved');

//         const autoSaveTimer = setTimeout(() => {
//             if (saveStatus === 'unsaved' && !loading) {
//                 handleSave(assessmentStatus === 'draft' ? 'draft' : 'active', true);
//             }
//         }, 30000);

//         return () => clearTimeout(autoSaveTimer);
//     }, [
//         title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions, stakeholderGuidelines,
//         topics, blocks, selectedProgrammeId, selectedModuleCode, scheduledDate, isScheduled
//     ]);

//     // ─── UNIFIED COHORT CREATION LOGIC ───
//     const handleSaveNewCohort = async (
//         cohortData: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
//         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
//     ) => {
//         try {
//             const cohortRef = doc(collection(db, 'cohorts'));
//             const newId = cohortRef.id;

//             const finalCohort = {
//                 ...cohortData,
//                 id: newId,
//                 createdAt: new Date().toISOString(),
//                 isArchived: false,
//                 staffHistory: [],
//                 status: 'active',
//                 changeReasons: reasons || {}
//             };

//             await setDoc(cohortRef, finalCohort);
//             await fetchCohorts();
//             setCohortIds(prev => [...prev, newId]);

//             toast.success(`Class "${cohortData.name}" created and assigned!`);
//             setShowCohortModal(false);
//         } catch (err: any) {
//             console.error("New Cohort Error:", err);
//             throw new Error(err.message);
//         }
//     };

//     // ── TOPIC HANDLERS ──
//     const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
//     const commitEdit = () => {
//         if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
//         setTopics(prev => prev.map(t => t.id === editingTopicId ? { ...t, ...editDraft } as Topic : t));
//         setEditingTopicId(null);
//     };
//     const cancelEdit = () => setEditingTopicId(null);
//     const confirmDelete = (id: string) => setDeleteConfirmId(id);
//     const executeDelete = () => {
//         if (!deleteConfirmId) return;
//         setBlocks(p => p.map(b => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
//         setTopics(p => p.filter(t => t.id !== deleteConfirmId));
//         setDeleteConfirmId(null);
//     };
//     const cancelDelete = () => setDeleteConfirmId(null);
//     const commitAdd = () => {
//         if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
//         setTopics(p => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || '0%' }]);
//         setNewTopic({ code: '', title: '', weight: '' });
//         setAddingTopic(false);
//     };
//     const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

//     // ── BLOCK HANDLERS ──
//     const addBlock = (bType: string, linkedTopicId?: string) => {

//         let actualType: BlockType = bType as BlockType;
//         if (['upload', 'audio', 'code'].includes(bType)) actualType = 'task';

//         const nb: AssessmentBlock = {
//             id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
//             type: actualType,
//             linkedTopicId,
//             title: actualType === 'section' ? 'New Section' : '',
//             content: '',
//             question: '',
//             marks: (actualType === 'text' || actualType === 'mcq' || actualType === 'task') ? 5 : (actualType === 'checklist' || actualType === 'qcto_workplace' ? 10 : 0),
//             options: actualType === 'mcq' ? ['', '', '', ''] : [],
//             correctOption: 0,
//         };

//         if (actualType === 'section') {
//             nb.title = 'New Section';
//             nb.content = '';
//         } else if (actualType === 'checklist') {
//             nb.title = 'Demonstrate the use of various functionalities:';
//             nb.criteria = ['Task criterion 1', 'Task criterion 2'];
//             nb.requireTimeTracking = true;
//             nb.requirePerCriterionTiming = true;
//             nb.requireObservationDeclaration = true;
//             nb.requireEvidencePerCriterion = true;
//         } else if (actualType === 'logbook') {
//             nb.title = 'Workplace Logbook Entry';
//             nb.content = 'Learner must log assignment tasks, start/finish times, and total hours.';
//         } else if (actualType === 'qcto_workplace') {
//             nb.title = 'Workplace Experience Activity';
//             nb.weCode = 'WM-01-WE01: Determine requirements for different software...';
//             nb.workActivities = [{ id: mkId(), code: 'WA0101', description: 'Define the problem' }];
//             nb.expectedDocuments = ['Requirements specification document'];
//             nb.requireSelfAssessment = true;
//             nb.requireGoalPlanning = true;
//         } else if (actualType === 'task') {
//             nb.question = bType === 'upload' ? 'Please upload your evidence (PDF, Image, Video):' :
//                 bType === 'audio' ? 'Please record your verbal response:' :
//                     bType === 'code' ? 'Please write your code or provide a repository link:' :
//                         'Describe or demonstrate your solution:';
//             nb.allowText = bType === 'task';
//             nb.allowUpload = bType === 'upload' || bType === 'task';
//             nb.allowAudio = bType === 'audio' || bType === 'task';
//             nb.allowUrl = bType === 'code' || bType === 'task';
//             nb.allowCode = bType === 'code' || bType === 'task';
//             nb.allowedFileTypes = 'all';
//             nb.codeLanguage = 'javascript';
//         }

//         setBlocks(p => [...p, nb]);
//         setTimeout(() => {
//             setFocusedBlock(nb.id);
//             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' as const });
//         }, 60);
//     };

//     const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) =>
//         setBlocks(p => p.map(b => b.id === id ? { ...b, [field]: val } : b));

//     const updateOption = (blockId: string, idx: number, val: string) =>
//         setBlocks(p => p.map(b => {
//             if (b.id !== blockId || !b.options) return b;
//             const o = [...b.options];
//             o[idx] = val;
//             return { ...b, options: o };
//         }));

//     const removeBlock = (id: string) => {
//         if (window.confirm('Remove this block?')) {
//             setBlocks(p => p.filter(b => b.id !== id));
//             setFocusedBlock(null);
//             toast.info('Block removed');
//         }
//     };

//     const moveBlock = (id: string, dir: 'up' | 'down') =>
//         setBlocks(p => {
//             const i = p.findIndex(b => b.id === id);
//             if ((dir === 'up' && i === 0) || (dir === 'down' && i === p.length - 1)) return p;
//             const n = [...p], sw = dir === 'up' ? i - 1 : i + 1;
//             [n[i], n[sw]] = [n[sw], n[i]];
//             return n;
//         });

//     const resetModuleInfo = () => {
//         if (window.confirm("Clear all module fields?")) {
//             setModuleInfo({
//                 title: '', nqfLevel: '', credits: 0, notionalHours: 0,
//                 moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: '', timeLimit: 0
//             });
//             setSelectedProgrammeId('');
//             setSelectedModuleCode('');
//             setTopics([]);
//         }
//     };

//     const totalMarks = blocks.reduce((s, b) => s + (Number(b.marks) || 0), 0);
//     const qCount = blocks.filter(b => ['text', 'mcq', 'task', 'checklist', 'qcto_workplace'].includes(b.type)).length;
//     const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

//     // ─── PROGRAMME (BLUEPRINT) SAVE LOGIC ───
//     const handleSaveNewProgramme = async (newProg: ProgrammeTemplate) => {
//         try {
//             let customId = (newProg as any).curriculumCode?.toString().trim() || newProg.saqaId?.toString().trim();
//             if (!customId) throw new Error("A Curriculum Code or SAQA ID is required to save the Blueprint.");

//             customId = customId.replace(/[\s/]+/g, '-');
//             const progRef = doc(db, 'programmes', customId);

//             const progToSave = {
//                 ...newProg,
//                 id: customId,
//                 createdAt: new Date().toISOString(),
//                 createdBy: user?.fullName || 'Facilitator'
//             };

//             await setDoc(progRef, progToSave, { merge: true });

//             toast.success("Curriculum Blueprint created successfully!");
//             setShowProgrammeModal(false);

//             await fetchProgrammes();
//             setSelectedProgrammeId(customId);
//             setSelectedModuleCode('');
//         } catch (err: any) {
//             console.error("Failed to create programme:", err);
//             toast.error(`Failed to create blueprint: ${err.message}`);
//         }
//     };


//     // ─── MAIN WORKBOOK SAVE LOGIC ───
//     const handleSave = async (status: 'draft' | 'active', isAutoSave = false) => {
//         if (!title.trim() && !isAutoSave) {
//             toast.warning('Please enter a Workbook Title.');
//             return;
//         }
//         if (cohortIds.length === 0 && !isAutoSave && status === 'active') {
//             toast.warning('Please select at least one Cohort before publishing.');
//             return;
//         }

//         if (!isAutoSave) setLoading(true);
//         setSaveStatus('saving');

//         try {
//             const sanitizedBlocks = blocks.map(b => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.linkedTopicId) {
//                     const t = topics.find(topic => topic.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }

//                 if (b.type === 'section') {
//                     c.title = b.title || 'Untitled Section';
//                     c.content = b.content || '';
//                 }
//                 if (b.type === 'checklist' || b.type === 'logbook' || b.type === 'qcto_workplace') c.title = b.title || 'Untitled';
//                 if (b.type === 'info' || b.type === 'logbook') c.content = b.content || '';
//                 if (b.type === 'text' || b.type === 'mcq' || b.type === 'task') c.question = b.question || '';
//                 if (b.type === 'mcq') {
//                     c.options = b.options || ['', '', '', ''];
//                     c.correctOption = b.correctOption || 0;
//                 }
//                 if (b.type === 'checklist') {
//                     c.criteria = b.criteria || [];
//                     c.requireTimeTracking = b.requireTimeTracking !== false;
//                     c.requirePerCriterionTiming = b.requirePerCriterionTiming !== false;
//                     c.requireObservationDeclaration = b.requireObservationDeclaration !== false;
//                     c.requireEvidencePerCriterion = b.requireEvidencePerCriterion !== false;
//                 }
//                 if (b.type === 'qcto_workplace') {
//                     c.weCode = b.weCode || '';
//                     c.workActivities = b.workActivities || [];
//                     c.expectedDocuments = b.expectedDocuments || [];
//                     c.requireSelfAssessment = b.requireSelfAssessment !== false;
//                     c.requireGoalPlanning = b.requireGoalPlanning !== false;
//                 }
//                 if (b.type === 'task') {
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

//             let finalStatus: string = status;
//             let finalScheduledDate: string | null = null;

//             if (isScheduled && scheduledDate) {
//                 if (status === 'draft') finalStatus = 'scheduled';
//                 finalScheduledDate = new Date(scheduledDate).toISOString();
//             }

//             if (isDeployed && status === 'draft' && !isAutoSave) {
//                 finalStatus = assessmentStatus;
//             }

//             const payload = {
//                 title, type, moduleType, cohortIds,
//                 linkedProgrammeId: selectedProgrammeId,
//                 linkedModuleCode: selectedModuleCode,
//                 scheduledDate: finalScheduledDate,
//                 instructions: instructions || '', moduleInfo, showModuleHeader,
//                 learnerGuide: {
//                     note: learnerNote, purpose: modulePurpose, entryRequirements,
//                     providerRequirements, exemptions, assessmentInfo: instructions,
//                     stakeholderGuidelines
//                 },
//                 topics, blocks: sanitizedBlocks, totalMarks, status: finalStatus,
//                 facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
//             };

//             const batch = writeBatch(db);
//             let currentAssessmentId = assessmentId;

//             if (currentAssessmentId) {
//                 const templateRef = doc(db, 'assessments', currentAssessmentId);
//                 batch.set(templateRef, payload, { merge: true });
//             } else {
//                 const templateRef = doc(collection(db, 'assessments'));
//                 currentAssessmentId = templateRef.id;
//                 batch.set(templateRef, {
//                     ...payload,
//                     createdAt: new Date().toISOString(),
//                     createdBy: user?.fullName || 'Facilitator',
//                 });
//             }

//             // READ-BEFORE-WRITE DEPLOYMENT LOGIC
//             if (finalStatus === 'active' || finalStatus === 'scheduled') {
//                 const cohortLearners = learners.filter(l => {
//                     const lId = String(l.cohortId || '').trim();
//                     return cohortIds.includes(lId);
//                 });

//                 if (cohortLearners.length > 0) {
//                     const existingSubsQ = query(
//                         collection(db, 'learner_submissions'),
//                         where('assessmentId', '==', currentAssessmentId)
//                     );
//                     const existingSubsSnap = await getDocs(existingSubsQ);
//                     const existingSubIds = new Set(existingSubsSnap.docs.map(d => d.id));

//                     cohortLearners.forEach((learner: DashboardLearner) => {
//                         const enrolId = learner.enrollmentId || learner.id;
//                         const humanId = learner.learnerId || learner.id;
//                         const qualName = learner.qualification?.name || '';
//                         const targetCohort = learner.cohortId || 'Unassigned';

//                         const submissionId = `${targetCohort}_${humanId}_${currentAssessmentId}`;
//                         const submissionRef = doc(db, 'learner_submissions', submissionId);

//                         if (!existingSubIds.has(submissionId)) {
//                             batch.set(submissionRef, {
//                                 learnerId: humanId,
//                                 enrollmentId: enrolId,
//                                 qualificationName: qualName,
//                                 assessmentId: currentAssessmentId,
//                                 cohortId: targetCohort,
//                                 title: title,
//                                 type: type,
//                                 moduleType: moduleType,
//                                 status: 'not_started',
//                                 assignedAt: new Date().toISOString(),
//                                 marks: 0,
//                                 totalMarks: totalMarks,
//                                 moduleNumber: moduleInfo.moduleNumber,
//                                 createdAt: new Date().toISOString(),
//                                 createdBy: user?.uid || 'System'
//                             });
//                         } else {
//                             batch.set(submissionRef, {
//                                 title: title,
//                                 type: type,
//                                 moduleType: moduleType,
//                                 totalMarks: totalMarks,
//                                 moduleNumber: moduleInfo.moduleNumber
//                             }, { merge: true });
//                         }
//                     });
//                 }
//             }

//             await batch.commit();
//             setAssessmentStatus(finalStatus as any);
//             setSaveStatus('saved');
//             setLastSaved(new Date());

//             if (!isAutoSave) {
//                 if (finalStatus === 'active') toast.success('Workbook Published & Assigned!');
//                 else if (finalStatus === 'scheduled') toast.success('Workbook Scheduled & Assigned!');
//                 else toast.success('Draft saved successfully!');
//             }

//             if (!assessmentId && currentAssessmentId && !isAutoSave) {
//                 navigate(`/facilitator/assessments/builder/${currentAssessmentId}`, { replace: true });
//             }

//         } catch (err: any) {
//             console.error("Save Error:", err);
//             setSaveStatus('unsaved');
//             if (!isAutoSave) toast.error(`Failed to save: ${err.message}`);
//         } finally {
//             if (!isAutoSave) setLoading(false);
//         }
//     };

//     const activeProgramme = programmes.find(p => p.id === selectedProgrammeId);

//     return (
//         <div className="ab-root animate-fade-in" style={{ margin: 0, paddingBottom: '100px' }} >
//             <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

//             <header className="ab-topbar">
//                 <Tooltip content="Return to assessments list" placement="bottom">
//                     <button className="ab-back-btn" onClick={() => navigate(-1)}>
//                         <ArrowLeft size={18} />
//                         <span>Back</span>
//                     </button>
//                 </Tooltip>
//                 <div className="ab-topbar-centre">
//                     <BookOpen size={16} className="ab-topbar-icon" />
//                     <span className="ab-topbar-title">{title || 'Untitled Workbook'}</span>
//                     <span className={`ab-topbar-badge ${type}`}>{type}</span>
//                 </div>
//                 <div className="ab-topbar-actions">

//                     <div className="ab-stats-pill">
//                         <span><strong>{qCount}</strong> Qs</span>
//                         <div className="ab-sdiv" />
//                         <span><strong>{totalMarks}</strong> marks</span>
//                     </div>

//                     <div className={`ab-save-status ${saveStatus}`}>
//                         {saveStatus === 'saved' && (
//                             <>
//                                 <Check size={14} />
//                                 <span>Saved</span>
//                                 {lastSaved && (
//                                     <span className="ab-save-time">
//                                         {new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
//                                     </span>
//                                 )}
//                             </>
//                         )}
//                         {saveStatus === 'saving' && (
//                             <>
//                                 <div className="ab-spinner" />
//                                 <span>Saving...</span>
//                             </>
//                         )}
//                         {saveStatus === 'unsaved' && (
//                             <>
//                                 <AlertTriangle size={14} />
//                                 <span>Unsaved</span>
//                             </>
//                         )}
//                     </div>
//                     {assessmentId && (
//                         <Tooltip content="Preview what learners will see" placement="bottom">
//                             <button
//                                 className="ab-btn ab-btn-ghost"
//                                 onClick={() => window.open(`/admin/assessment/preview/${assessmentId}`, '_blank')}
//                                 style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
//                             >
//                                 <Eye size={15} />
//                                 Preview
//                             </button>
//                         </Tooltip>
//                     )}

//                     {!isDeployed && (
//                         <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
//                             {loading ? 'Saving...' : 'Save Draft'}
//                         </button>
//                     )}
//                     <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
//                         <Zap size={15} />
//                         {isDeployed ? 'Update Settings' : 'Publish'}
//                     </button>
//                 </div>
//             </header>

//             <div className="ab-body">
//                 <aside className="ab-sidebar">
//                     <nav className="ab-sidebar-nav" >
//                         {([
//                             { id: 'settings', icon: <Settings size={14} />, label: 'Settings', tooltip: 'Basic workbook settings' },
//                             { id: 'module', icon: <GraduationCap size={14} />, label: 'Module', tooltip: 'QCTO module information' },
//                             { id: 'topics', icon: <ListChecks size={14} />, label: 'Topics', tooltip: 'Manage topic elements' },
//                             { id: 'guide', icon: <BookMarked size={14} />, label: 'Guide', tooltip: 'Learner guide content' },
//                             { id: 'outline', icon: <Eye size={14} />, label: 'Outline', tooltip: 'View workbook structure' },
//                         ] as const).map(t => (
//                             <Tooltip key={t.id} content={t.tooltip} placement="bottom">
//                                 <button
//                                     className={`ab-nav-btn ${activePanel === t.id ? 'active' : ''}`}
//                                     onClick={() => setActivePanel(t.id)}
//                                 >
//                                     {t.icon}
//                                     <span>{t.label}</span>
//                                 </button>
//                             </Tooltip>
//                         ))}
//                     </nav>

//                     <div className="ab-sidebar-body">
//                         {/* 1. SETTINGS */}
//                         {activePanel === 'settings' && (
//                             <>
//                                 <SectionHdr icon={<Database size={13} />} label="Curriculum Link" />
//                                 <FG label="Select Programme Template">
//                                     <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
//                                         <div className="ab-sel-wrap" style={{ flex: 1 }}>
//                                             <select
//                                                 className="ab-input ab-sel"
//                                                 value={selectedProgrammeId}
//                                                 onChange={e => {
//                                                     setSelectedProgrammeId(e.target.value);
//                                                     setSelectedModuleCode('');
//                                                 }}
//                                             >
//                                                 <option value="">-- Custom / Blank --</option>
//                                                 {programmes.filter(p => !p.isArchived).map(p => (
//                                                     <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>
//                                                 ))}
//                                             </select>
//                                             <ChevronDown size={12} className="ab-sel-arr" />
//                                         </div>
//                                         <Tooltip content="Create a new Curriculum Blueprint" placement="top">
//                                             <button
//                                                 type="button"
//                                                 className="ab-btn ab-btn-ghost"
//                                                 style={{ padding: '0.45rem 0.75rem', border: '1px solid #cbd5e1' }}
//                                                 onClick={() => setShowProgrammeModal(true)}
//                                             >
//                                                 <Plus size={14} /> New
//                                             </button>
//                                         </Tooltip>
//                                     </div>
//                                 </FG>

//                                 {selectedProgrammeId && activeProgramme && (
//                                     <FG label="Select Module (Auto-populates Topics)">
//                                         <div className="ab-sel-wrap">
//                                             <select
//                                                 className="ab-input ab-sel"
//                                                 value={selectedModuleCode}
//                                                 onChange={e => setSelectedModuleCode(e.target.value)}
//                                             >
//                                                 <option value="">-- Select Module --</option>
//                                                 {(activeProgramme.knowledgeModules || []).length > 0 && (
//                                                     <optgroup label="Knowledge Modules (KM)">
//                                                         {activeProgramme.knowledgeModules.map((moduleItem: any, idx: number) => {
//                                                             const m = moduleItem as any;
//                                                             const val = m.code || m.name || `mod-km-${idx}`;
//                                                             return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                                 {(activeProgramme.practicalModules || []).length > 0 && (
//                                                     <optgroup label="Practical Modules (PM)">
//                                                         {activeProgramme.practicalModules.map((moduleItem: any, idx: number) => {
//                                                             const m = moduleItem as any;
//                                                             const val = m.code || m.name || `mod-pm-${idx}`;
//                                                             return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                                 {(activeProgramme.workExperienceModules || []).length > 0 && (
//                                                     <optgroup label="Workplace Modules (WM)">
//                                                         {activeProgramme.workExperienceModules.map((moduleItem: any, idx: number) => {
//                                                             const m = moduleItem as any;
//                                                             const val = m.code || m.name || `mod-wm-${idx}`;
//                                                             return <option key={val} value={val}>{m.code ? `${m.code} - ` : ''}{m.name || 'Unnamed Module'}</option>
//                                                         })}
//                                                     </optgroup>
//                                                 )}
//                                             </select>
//                                             <ChevronDown size={12} className="ab-sel-arr" />
//                                         </div>
//                                     </FG>
//                                 )}

//                                 <div style={{ borderBottom: '1px solid #e2e8f0', margin: '1rem 0' }} />

//                                 <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />

//                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem' }}>
//                                     <div className="ab-form-group" style={{ marginBottom: 0 }}>
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><BookOpen size={14} /> Module Curriculum Type</label>
//                                         <select className="ab-input" value={moduleType} onChange={e => setModuleType(e.target.value as any)} style={{ borderColor: 'var(--mlab-blue)', fontWeight: 'bold' }}>
//                                             <option value="knowledge">Knowledge Module (Standard Questions)</option>
//                                             <option value="practical">Practical Skill Module (Checklists/Tasks)</option>
//                                             <option value="workplace">Workplace Experience Module (Logbooks)</option>
//                                         </select>
//                                         <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '4px' }}>* Helps categorize the assessment type in your database.</span>
//                                     </div>
//                                     <div className="ab-form-group" style={{ marginBottom: 0 }}>
//                                         <label>Assessment Type Category</label>
//                                         <select className="ab-input" value={type} onChange={e => setType(e.target.value as any)}>
//                                             <option value="formative">Formative Assessment</option>
//                                             <option value="summative">Summative Assessment</option>
//                                             <option value="Practical Observation">Practical Observation</option>
//                                             <option value="Workplace Logbook">Workplace Logbook</option>
//                                         </select>
//                                     </div>
//                                 </div>

//                                 <FG label="Title">
//                                     <input className="ab-input" value={title} onChange={e => setTitle(e.target.value)} />
//                                 </FG>

//                                 <div className="ab-meta-grid-inputs">
//                                     <FG label="Time Limit (Mins)">
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                                             <Clock size={16} color="#64748b" />
//                                             <input type="number" className="ab-input" placeholder="e.g. 60" value={moduleInfo.timeLimit || ''} onChange={e => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })} />
//                                         </div>
//                                         <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px', display: 'block' }}>0 for no limit.</span>
//                                     </FG>

//                                     <FG label="Scheduling">
//                                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: isScheduled ? '8px' : '4px' }}>
//                                             <input type="checkbox" checked={isScheduled} onChange={(e) => { setIsScheduled(e.target.checked); if (!e.target.checked) setScheduledDate(''); }} style={{ width: '15px', height: '15px', cursor: 'pointer', accentColor: 'var(--mlab-blue)' }} />
//                                             <span style={{ fontSize: '0.85rem', color: '#334155', fontWeight: 600 }}>Schedule specific date/time</span>
//                                         </label>
//                                         {isScheduled ? (
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '23px' }}>
//                                                 <Calendar size={16} color="#64748b" />
//                                                 <input type="datetime-local" className="ab-input" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
//                                             </div>
//                                         ) : (
//                                             <p style={{ margin: '0 0 0 23px', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>Available anytime after publishing.</p>
//                                         )}
//                                     </FG>
//                                 </div>

//                                 {/* ── 🚀 UNIFIED COHORT ASSIGNMENT PANEL 🚀 ── */}
//                                 <div style={{ marginBottom: '1rem' }}>
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
//                                         <label className="ab-fg-label" style={{ marginBottom: 0 }}>Assign to Cohorts</label>
//                                         <button type="button" className="ab-text-btn" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 600 }} onClick={() => setShowCohortModal(true)}>+ Create New Class</button>
//                                     </div>
//                                     <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', maxHeight: '130px', overflowY: 'auto', padding: '0.5rem', background: '#fff' }}>
//                                         {cohorts.map(c => (
//                                             <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', cursor: 'pointer' }}>
//                                                 <input type="checkbox" checked={cohortIds.includes(c.id)} onChange={(e) => {
//                                                     if (e.target.checked) setCohortIds(prev => [...prev, c.id]);
//                                                     else setCohortIds(prev => prev.filter(id => id !== c.id));
//                                                 }} />
//                                                 <span style={{ fontSize: '0.85rem', color: '#334155', flex: 1 }}>{c.name}</span>
//                                                 <Tooltip content="View Class Register" placement="left">
//                                                     <ExternalLink size={12} style={{ opacity: 0.5, color: '#334155' }} onClick={(e) => { e.preventDefault(); navigate(`/cohorts/${c.id}`); }} />
//                                                 </Tooltip>
//                                             </label>
//                                         ))}
//                                         {cohorts.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No active classes available.</div>}
//                                     </div>
//                                 </div>

//                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
//                                 <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} />
//                             </>
//                         )}

//                         {/* 2. MODULE */}
//                         {activePanel === 'module' && (
//                             <>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
//                                     <Tooltip content={showModuleHeader ? "Hide module header" : "Show module header"} placement="left">
//                                         <button className={`ab-toggle-icon ${!showModuleHeader ? 'off' : ''}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
//                                             {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
//                                         </button>
//                                     </Tooltip>
//                                 </div>
//                                 {showModuleHeader ? (
//                                     <div className="animate-fade-in">
//                                         <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
//                                             <Tooltip content="Clear all module fields" placement="left">
//                                                 <button className="ab-text-btn danger" onClick={resetModuleInfo}>
//                                                     <RotateCcw size={12} /> Clear
//                                                 </button>
//                                             </Tooltip>
//                                         </div>
//                                         <FG label="Qualification Title"><input className="ab-input" value={moduleInfo.qualificationTitle} onChange={e => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} /></FG>
//                                         <FG label="Module Number"><input className="ab-input" value={moduleInfo.moduleNumber} onChange={e => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} /></FG>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={e => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
//                                             <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={e => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
//                                         </div>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={e => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
//                                             <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={e => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
//                                         </div>
//                                         <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={e => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
//                                     </div>
//                                 ) : (
//                                     <div className="ab-hidden-state"><EyeOff size={24} /><p>Header hidden.</p></div>
//                                 )}
//                             </>
//                         )}

//                         {/* 3. TOPICS */}
//                         {activePanel === 'topics' && (
//                             <TopicsPanel
//                                 topics={topics}
//                                 coveredTopicIds={coveredTopicIds}
//                                 editingTopicId={editingTopicId}
//                                 editDraft={editDraft}
//                                 addingTopic={addingTopic}
//                                 newTopic={newTopic}
//                                 deleteConfirmId={deleteConfirmId}
//                                 isDeployed={isDeployed}
//                                 onStartEdit={startEdit}
//                                 onEditChange={p => setEditDraft(d => ({ ...d, ...p }))}
//                                 onCommitEdit={commitEdit}
//                                 onCancelEdit={cancelEdit}
//                                 onConfirmDelete={confirmDelete}
//                                 onExecuteDelete={executeDelete}
//                                 onCancelDelete={cancelDelete}
//                                 onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }}
//                                 onNewTopicChange={p => setNewTopic(d => ({ ...d, ...p }))}
//                                 onCommitAdd={commitAdd}
//                                 onCancelAdd={cancelAdd}
//                                 onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel('outline'); }}
//                             />
//                         )}

//                         {/* 4. LEARNER GUIDE */}
//                         {activePanel === 'guide' && (
//                             <>
//                                 <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
//                                 <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={e => setLearnerNote(e.target.value)} /></FG>
//                                 <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={e => setModulePurpose(e.target.value)} /></FG>
//                                 <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={e => setEntryRequirements(e.target.value)} /></FG>

//                                 {/* 🚀 NEW RICH TEXT GUIDELINES BLOCK FOR MENTORS/EMPLOYERS */}
//                                 <FG label="Stakeholder Guidelines (Mentors, Employers, Providers)">
//                                     <div className={`ab-quill-wrapper ${isDeployed ? 'locked' : ''}`} style={{ marginTop: '5px' }}>
//                                         <ReactQuill
//                                             theme="snow"
//                                             value={stakeholderGuidelines}
//                                             onChange={setStakeholderGuidelines}
//                                             readOnly={isDeployed}
//                                             modules={quillModules}
//                                             formats={quillFormats}
//                                             placeholder="Paste the Instructions to Mentor, Responsibilities of the Employer, and Training Provider Responsibility here..."
//                                         />
//                                     </div>
//                                 </FG>

//                                 <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={e => setExemptions(e.target.value)} /></FG>
//                             </>
//                         )}

//                         {/* 5. OUTLINE */}
//                         {activePanel === 'outline' && (
//                             <>
//                                 <SectionHdr icon={<Eye size={13} />} label="Outline" />
//                                 {blocks.length === 0 ? (
//                                     <p className="ab-prose sm">No blocks yet.</p>
//                                 ) : (
//                                     <ol className="ab-outline-list">
//                                         {blocks.map((b, i) => (
//                                             <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`} onClick={() => document.getElementById(`block-${b.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
//                                                 <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
//                                                 <div className="ab-ol-text">
//                                                     <span className="ab-ol-main">
//                                                         {b.type === 'section' ? (b.title || 'Section') : b.type === 'info' ? 'Reading Material' : (b.question?.slice(0, 40) || b.title || `Question ${i + 1}`)}
//                                                     </span>
//                                                 </div>
//                                             </li>
//                                         ))}
//                                     </ol>
//                                 )}
//                             </>
//                         )}
//                     </div>
//                 </aside>

//                 <main className="ab-canvas">

//                     {/* 🚀 FIXED BOTTOM FLOATING TOOLBAR */}
//                     {!isDeployed && (
//                         <div style={{
//                             position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
//                             padding: '0.75rem 1.25rem', borderRadius: '50px',
//                             boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
//                             display: 'flex', gap: '0.5rem', zIndex: 1000, border: '1px solid #cbd5e1', alignItems: 'center'
//                         }}>
//                             <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', marginRight: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add:</span>

//                             <Tooltip content="Add Section Title" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('section')}><Type size={16} /></button></Tooltip>
//                             <Tooltip content="Add Reading Material" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('info')}><Info size={16} /></button></Tooltip>

//                             <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

//                             <Tooltip content="Add MCQ" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('mcq')}><CheckSquare size={16} /></button></Tooltip>
//                             <Tooltip content="Add Written Question" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px' }} onClick={() => addBlock('text')}><AlignLeft size={16} /></button></Tooltip>

//                             <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

//                             <Tooltip content="Add File Upload" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#f5f3ff', color: '#8b5cf6' }} onClick={() => addBlock('upload')}><UploadCloud size={16} /></button></Tooltip>
//                             <Tooltip content="Add Audio Recording" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#fdf4ff', color: '#d946ef' }} onClick={() => addBlock('audio')}><Mic size={16} /></button></Tooltip>
//                             <Tooltip content="Add Code Submission" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px', background: '#fdf2f8', color: '#ec4899' }} onClick={() => addBlock('code')}><Code size={16} /></button></Tooltip>
//                             <Tooltip content="Advanced Multi-Modal Task" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--primary" style={{ padding: '8px 12px' }} onClick={() => addBlock('task')}><Layers size={16} /></button></Tooltip>

//                             <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 4px' }} />

//                             <Tooltip content="Add Observation Checklist" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--practical" style={{ padding: '8px 12px' }} onClick={() => addBlock('checklist')}><ListChecks size={16} /></button></Tooltip>
//                             <Tooltip content="Basic Logbook Table" placement="top"><button className="ab-tool-btn icon-only ab-tool-btn--practical" style={{ padding: '8px 12px' }} onClick={() => addBlock('logbook')}><CalendarRange size={16} /></button></Tooltip>
//                             <Tooltip content="QCTO Workplace Checkpoint" placement="top"><button className="ab-tool-btn icon-only" style={{ padding: '8px 12px', background: '#ffe4e6', color: '#e11d48' }} onClick={() => addBlock('qcto_workplace')}><Briefcase size={16} /></button></Tooltip>
//                         </div>
//                     )}


//                     <div className="ab-canvas-inner">
//                         {isDeployed && (
//                             <div style={{ background: '#fef2f2', border: '1px solid #ef4444', padding: '10px 15px', borderRadius: '6px', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.5rem', fontSize: '0.85rem' }}>
//                                 <AlertTriangle size={24} style={{ flexShrink: 0 }} />
//                                 <div>
//                                     <strong>Strict Mode Enabled (Assessment Deployed):</strong> Structural changes (adding/removing blocks, adding/removing topics, changing mark values) are locked to protect learner data integrity. You may only edit text to fix typos, or update scheduled dates and cohort assignments via the settings panel.
//                                 </div>
//                             </div>
//                         )}

//                         {showModuleHeader && (
//                             <div className="ab-module-card clickable" onClick={() => setActivePanel('module')}>
//                                 <div className="ab-mc-left">
//                                     <div className="ab-mc-badges">
//                                         <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
//                                         <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
//                                         <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
//                                         {moduleInfo.timeLimit ? (
//                                             <span className="ab-mc-b" style={{ background: '#fef3c7', color: '#b45309' }}>
//                                                 <Clock size={12} style={{ display: 'inline', marginRight: '4px' }} />
//                                                 {moduleInfo.timeLimit}m Limit
//                                             </span>
//                                         ) : null}
//                                         <span className={`ab-mc-b type-${type}`}>{type}</span>
//                                     </div>
//                                     <h1 className="ab-mc-title">{title || 'Untitled Workbook'}</h1>
//                                     <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
//                                 </div>
//                                 <div className="ab-mc-right">
//                                     <div className="ab-mc-stat">
//                                         <span className="ab-mc-val">{qCount}</span>
//                                         <span className="ab-mc-lbl">Qs</span>
//                                     </div>
//                                     <div className="ab-mc-div" />
//                                     <div className="ab-mc-stat">
//                                         <span className="ab-mc-val">{totalMarks}</span>
//                                         <span className="ab-mc-lbl">Marks</span>
//                                     </div>
//                                 </div>
//                                 <div className="ab-mc-edit-hint"><Pencil size={12} /> Edit</div>
//                             </div>
//                         )}

//                         {blocks.length === 0 ? (
//                             <EmptyCanvas onAdd={addBlock} />
//                         ) : (
//                             <div className="ab-blocks-list">
//                                 {blocks.map((b, idx) => (
//                                     <BlockCard
//                                         key={b.id} block={b} index={idx} total={blocks.length} topics={topics}
//                                         focused={focusedBlock === b.id} onFocus={() => setFocusedBlock(b.id)}
//                                         isDeployed={isDeployed}
//                                         onUpdate={updateBlock} onUpdateOption={updateOption} onRemove={removeBlock} onMove={moveBlock}
//                                     />
//                                 ))}
//                             </div>
//                         )}
//                     </div>
//                 </main>
//             </div>

//             {deleteConfirmId && (
//                 <DeleteOverlay
//                     topic={topics.find(t => t.id === deleteConfirmId)!}
//                     linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
//                     onConfirm={executeDelete} onCancel={cancelDelete}
//                 />
//             )}

//             {showProgrammeModal && (
//                 <ProgrammeFormModal
//                     existingProgrammes={programmes}
//                     onClose={() => setShowProgrammeModal(false)}
//                     onSave={handleSaveNewProgramme}
//                     title="Create Curriculum Blueprint"
//                 />
//             )}

//             {showCohortModal && (
//                 <CohortFormModal
//                     onClose={() => setShowCohortModal(false)}
//                     onSave={handleSaveNewCohort}
//                 />
//             )}
//         </div>
//     );
// };

// // ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

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
//         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//             <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
//             {!props.addingTopic && !props.isDeployed && (
//                 <Tooltip content="Add new topic element" placement="left">
//                     <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}>
//                         <Plus size={14} />
//                     </button>
//                 </Tooltip>
//             )}
//         </div>
//         {props.addingTopic && !props.isDeployed && (
//             <div className="ab-topic-form">
//                 <div className="ab-topic-form-row">
//                     <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ''} onChange={e => props.onNewTopicChange({ code: e.target.value })} />
//                     <input className="ab-input sm" placeholder="Weight" style={{ width: '60px' }} value={props.newTopic.weight || ''} onChange={e => props.onNewTopicChange({ weight: e.target.value })} />
//                 </div>
//                 <textarea className="ab-input sm" rows={2} placeholder="Description..." value={props.newTopic.title || ''} onChange={e => props.onNewTopicChange({ title: e.target.value })} />
//                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
//                     <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
//                     <button className="ab-btn sm ab-btn-primary" onClick={props.onCommitAdd}>Add</button>
//                 </div>
//             </div>
//         )}
//         <div className="ab-topics-list">
//             {props.topics.length === 0 && <p className="ab-prose sm" style={{ fontStyle: 'italic', opacity: 0.7 }}>No topics found. Select a module from Settings.</p>}
//             {props.topics.map((t: Topic) => {
//                 const covered = props.coveredTopicIds.has(t.id);
//                 const isEditing = props.editingTopicId === t.id;

//                 if (isEditing) return (
//                     <div key={t.id} className="ab-topic-row editing">
//                         <div className="ab-topic-edit-fields">
//                             <input className="ab-topic-edit-input" value={props.editDraft.code || ''} onChange={e => props.onEditChange({ code: e.target.value })} />
//                             <input className="ab-topic-edit-input" value={props.editDraft.title || ''} onChange={e => props.onEditChange({ title: e.target.value })} />
//                         </div>
//                         <div className="ab-topic-edit-actions">
//                             <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={14} /></button>
//                             <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={14} /></button>
//                         </div>
//                     </div>
//                 );

//                 return (
//                     <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
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
//                                     <Tooltip content="Add question for this topic" placement="top"><button className="ab-tadd-btn" onClick={() => props.onAddBlock('text', t.id)}>+Q</button></Tooltip>
//                                     <Tooltip content="Add reading material for this topic" placement="top"><button className="ab-tadd-btn reading" onClick={() => props.onAddBlock('info', t.id)}>+R</button></Tooltip>
//                                     <Tooltip content="Delete topic" placement="top"><button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button></Tooltip>
//                                 </>
//                             )}
//                             <Tooltip content="Edit topic details (Text only)" placement="top"><button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button></Tooltip>
//                         </div>
//                     </div>
//                 );
//             })}
//         </div>
//     </>
// );

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
//     onMove: (id: string, dir: 'up' | 'down') => void;
// }

// const BlockCard: React.FC<BlockCardProps> = ({ block, index, total, focused, topics, isDeployed, onFocus, onUpdate, onUpdateOption, onRemove, onMove }) => {
//     const meta = BLOCK_META[block.type];
//     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

//     const updateCriterion = (i: number, val: string) => {
//         const c = [...(block.criteria || [])];
//         c[i] = val;
//         onUpdate(block.id, 'criteria', c);
//     };

//     const removeCriterion = (i: number) => {
//         const c = (block.criteria || []).filter((_, idx) => idx !== i);
//         onUpdate(block.id, 'criteria', c);
//     };

//     const addCriterion = () => {
//         onUpdate(block.id, 'criteria', [...(block.criteria || []), '']);
//     };

//     // 🚀 QCTO WORKPLACE SUB-ARRAY HANDLERS
//     const updateWA = (i: number, field: 'code' | 'description', val: string) => {
//         const wa = [...(block.workActivities || [])];
//         wa[i] = { ...wa[i], [field]: val };
//         onUpdate(block.id, 'workActivities', wa);
//     };
//     const removeWA = (i: number) => {
//         const wa = (block.workActivities || []).filter((_, idx) => idx !== i);
//         onUpdate(block.id, 'workActivities', wa);
//     };
//     const addWA = () => {
//         onUpdate(block.id, 'workActivities', [...(block.workActivities || []), { id: mkId(), code: '', description: '' }]);
//     };

//     const updateDoc = (i: number, val: string) => {
//         const d = [...(block.expectedDocuments || [])];
//         d[i] = val;
//         onUpdate(block.id, 'expectedDocuments', d);
//     };
//     const removeDoc = (i: number) => {
//         const d = (block.expectedDocuments || []).filter((_, idx) => idx !== i);
//         onUpdate(block.id, 'expectedDocuments', d);
//     };
//     const addDoc = () => {
//         onUpdate(block.id, 'expectedDocuments', [...(block.expectedDocuments || []), '']);
//     };

//     return (
//         <div id={`block-${block.id}`} className={`ab-block ${focused ? 'is-focused' : ''} ${isDeployed ? 'is-locked' : ''}`} style={{ '--block-accent': meta.color } as React.CSSProperties} onClick={onFocus}>
//             <div className="ab-block-strip" style={{ background: meta.color }} />
//             <div className="ab-block-ctrl-row">
//                 <div className="ab-block-left">
//                     <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
//                     {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
//                     {isDeployed && <span title="Structure Locked" style={{ marginLeft: '8px', color: '#94a3b8', display: 'flex', alignItems: 'center' }}><Lock size={12} /></span>}
//                 </div>
//                 {!isDeployed && (
//                     <div className="ab-block-actions">
//                         <Tooltip content="Move block up" placement="top"><button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }} disabled={index === 0}>↑</button></Tooltip>
//                         <Tooltip content="Move block down" placement="top"><button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }} disabled={index === total - 1}>↓</button></Tooltip>
//                         <Tooltip content="Delete block" placement="top"><button className="ab-ctrl-btn ab-ctrl-del" onClick={e => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button></Tooltip>
//                     </div>
//                 )}
//             </div>

//             {/* 🚀 SECTION */}
//             {block.type === 'section' && (
//                 <div className="ab-q-body" onClick={e => e.stopPropagation()}>
//                     <div className="ab-form-group" style={{ marginBottom: '10px' }}>
//                         <label style={{ fontSize: '0.75rem', color: '#64748b' }}>Section Outline Label (Short Title)</label>
//                         <input className="ab-input" value={block.title || ''} placeholder="e.g. SECTION B- PM-01-PS02" onChange={e => onUpdate(block.id, 'title', e.target.value)} disabled={isDeployed} />
//                     </div>
//                     <div className={`ab-quill-wrapper ${isDeployed ? 'locked' : ''}`}>
//                         <label style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', display: 'block' }}>Section Content / Criteria details</label>
//                         <ReactQuill
//                             theme="snow"
//                             value={block.content || ''}
//                             onChange={(content) => onUpdate(block.id, 'content', content)}
//                             readOnly={isDeployed}
//                             modules={quillModules}
//                             formats={quillFormats}
//                             placeholder="e.g. PM-01-PS02: Use software packages...&#10;Applied Knowledge...&#10;Internal Assessment Criteria..."
//                         />
//                     </div>
//                 </div>
//             )}

//             {/* INFO */}
//             {block.type === 'info' && <div className="ab-info-body"><textarea className="ab-textarea-block" rows={5} value={block.content || ''} onChange={e => onUpdate(block.id, 'content', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Enter reading material..." /></div>}

//             {/* WRITTEN QUESTION */}
//             {block.type === 'text' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num">Q{index + 1}</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>
//                     <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Type question here..." />
//                     <div className="ab-answer-placeholder"><FileText size={14} /><span>Learner types answer here</span></div>
//                 </div>
//             )}

//             {/* MCQ */}
//             {block.type === 'mcq' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num">Q{index + 1}</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>
//                     <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Type question here..." />
//                     <div className="ab-mcq-opts">
//                         {block.options?.map((opt, i) => (
//                             <div key={i} className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`} onClick={e => { if (isDeployed) return; e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}>
//                                 <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
//                                 <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
//                                 <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={e => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={e => e.stopPropagation()} />
//                                 {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
//                             </div>
//                         ))}
//                     </div>
//                 </div>
//             )}

//             {/* 🚀 MULTI-MODAL TASK BLOCK */}
//             {block.type === 'task' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num" style={{ background: '#ede9fe', color: '#8b5cf6' }}>Q{index + 1}</span>
//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>
//                     <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Describe the task or evidence request..." />

//                     <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '1rem', marginTop: '1rem' }} onClick={e => e.stopPropagation()}>
//                         <label style={{ display: 'block', fontWeight: 'bold', color: '#334155', marginBottom: '10px', fontSize: '0.85rem' }}>Allowed Evidence Types (Learner can choose any combination)</label>
//                         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" checked={block.allowText} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowText', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
//                                 <AlignLeft size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Rich Text Typing</span>
//                             </label>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" checked={block.allowAudio} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowAudio', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
//                                 <Mic size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Audio Recording</span>
//                             </label>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" checked={block.allowUrl} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowUrl', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
//                                 <LinkIcon size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>External URL/Link</span>
//                             </label>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" checked={block.allowUpload} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowUpload', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
//                                 <UploadCloud size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>File Upload</span>
//                             </label>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" checked={block.allowCode} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowCode', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)' }} />
//                                 <Code size={16} color="#64748b" /> <span style={{ fontSize: '0.85rem' }}>Code Editor</span>
//                             </label>
//                         </div>
//                         {(block.allowUpload || block.allowCode) && (
//                             <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px dashed #cbd5e1', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
//                                 {block.allowUpload && (
//                                     <div className="ab-form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
//                                         <label style={{ fontSize: '0.75rem' }}>Restrict File Type (Uploads)</label>
//                                         <select className="ab-input" value={block.allowedFileTypes || 'all'} disabled={isDeployed} onChange={e => onUpdate(block.id, 'allowedFileTypes', e.target.value)}>
//                                             <option value="all">Any File (Images, Docs, Video, Presentations)</option>
//                                             <option value="presentation">Presentations Only (.pptx, .pdf)</option>
//                                             <option value="video">Video Evidence Only (.mp4, .mov)</option>
//                                             <option value="image">Images Only (.png, .jpg)</option>
//                                         </select>
//                                     </div>
//                                 )}
//                                 {block.allowCode && (
//                                     <div className="ab-form-group" style={{ flex: 1, minWidth: '200px', marginBottom: 0 }}>
//                                         <label style={{ fontSize: '0.75rem' }}>Syntax Highlighting (Code)</label>
//                                         <select className="ab-input" value={block.codeLanguage || 'javascript'} disabled={isDeployed} onChange={e => onUpdate(block.id, 'codeLanguage', e.target.value)}>
//                                             <option value="javascript">JavaScript / TypeScript</option>
//                                             <option value="python">Python</option>
//                                             <option value="html">HTML / CSS</option>
//                                             <option value="sql">SQL</option>
//                                             <option value="other">Other / Plain Text</option>
//                                         </select>
//                                     </div>
//                                 )}
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             )}

//             {/* 🚀 PRACTICAL CHECKLIST BLOCK */}
//             {block.type === 'checklist' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top" style={{ marginBottom: '10px' }}>
//                         <span className="ab-q-num" style={{ background: '#ccfbf1', color: '#0d9488' }}>CHK</span>

//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
//                         </div>

//                         <div className="ab-topic-sel-wrap">
//                             <select className="ab-topic-sel" value={block.linkedTopicId || ''} disabled={isDeployed} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
//                             </select>
//                             {!isDeployed && <ChevronDown size={11} className="ab-topic-sel-arr" />}
//                         </div>
//                     </div>

//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
//                         <div className="ab-form-group" style={{ flex: 1, marginBottom: '10px' }}>
//                             <label>Practical Task Outcome / Instruction</label>
//                             <input type="text" className="ab-input" value={block.title} onChange={e => onUpdate(block.id, 'title', e.target.value)} placeholder="e.g. PA0101 Demonstrate the use of various functionalities:" />
//                         </div>
//                     </div>

//                     {/* 🚀 TOGGLES */}
//                     <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '15px', background: '#fffbeb', border: '1px solid #fde68a', padding: '10px', borderRadius: '6px' }} onClick={e => e.stopPropagation()}>
//                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                             <input type="checkbox" disabled={isDeployed} checked={block.requirePerCriterionTiming !== false} onChange={e => onUpdate(block.id, 'requirePerCriterionTiming', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
//                             <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>Require Timers per task</span>
//                         </label>
//                         <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer', borderLeft: '1px solid #fcd34d', paddingLeft: '15px' }}>
//                             <input type="checkbox" disabled={isDeployed} checked={block.requireEvidencePerCriterion !== false} onChange={e => onUpdate(block.id, 'requireEvidencePerCriterion', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#d97706' }} />
//                             <span style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 'bold' }}>Require Learner Evidence per task</span>
//                         </label>
//                     </div>

//                     <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
//                         <label style={{ fontWeight: 'bold', color: '#334155', marginBottom: '15px', display: 'block', fontSize: '0.85rem' }}>Evaluation Criterions to Observe:</label>
//                         {block.criteria?.map((criterion, i) => (
//                             <div key={i} style={{ marginBottom: '1.5rem', padding: '15px', background: 'white', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
//                                 <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
//                                     <div style={{ background: '#e2e8f0', padding: '8px 12px', borderRadius: '4px', color: '#475569', fontSize: '0.85rem', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>{i + 1}</div>
//                                     <input type="text" className="ab-input" style={{ flex: 1, fontWeight: 'bold', color: '#0f172a' }} value={criterion} disabled={isDeployed} onChange={e => updateCriterion(i, e.target.value)} placeholder="e.g. Open files and folders" />
//                                     {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeCriterion(i)}><X size={16} /></button>}
//                                 </div>

//                                 {/* 🚀 UI PREVIEW FOR FACILITATOR */}
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '45px', opacity: 0.6, pointerEvents: 'none' }}>

//                                     {block.requireEvidencePerCriterion !== false && (
//                                         <div style={{ padding: '8px', background: '#f1f5f9', borderRadius: '4px', border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: '10px', color: '#475569', fontSize: '0.75rem' }}>
//                                             <UploadCloud size={14} /> <em>Learner will be able to upload a file or link evidence here...</em>
//                                         </div>
//                                     )}

//                                     {block.requirePerCriterionTiming !== false && (
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f1f5f9', padding: '6px 10px', borderRadius: '4px', border: '1px solid #cbd5e1', alignSelf: 'flex-start' }}>
//                                             <Timer size={14} color="#64748b" />
//                                             <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#475569' }}>Task Timer:</span>
//                                             <button className="ab-btn sm" disabled style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '2px 10px', borderRadius: '4px', fontSize: '0.7rem' }}>Start Task</button>
//                                             <span style={{ fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>00:00:00</span>
//                                         </div>
//                                     )}

//                                     <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-start' }}>
//                                         <div style={{ display: 'flex', gap: '10px' }}>
//                                             <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#f0fdf4', padding: '6px 10px', borderRadius: '4px', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 'bold' }}>
//                                                 <input type="radio" disabled /> Competent (C)
//                                             </label>
//                                             <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', background: '#fef2f2', padding: '6px 10px', borderRadius: '4px', border: '1px solid #fecaca', color: '#991b1b', fontWeight: 'bold' }}>
//                                                 <input type="radio" disabled /> NYC
//                                             </label>
//                                         </div>
//                                         <div style={{ flex: 1 }}>
//                                             <input type="text" className="ab-input" disabled placeholder="Assessor comments..." style={{ fontSize: '0.8rem', padding: '6px 10px', background: '#f1f5f9' }} />
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         ))}
//                         {!isDeployed && <button className="ab-btn-text" onClick={addCriterion} style={{ marginTop: '5px' }}><Plus size={14} /> Add Criterion</button>}

//                         <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px dashed #cbd5e1', opacity: 0.8, pointerEvents: 'none' }}>
//                             <h4 style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '10px', textTransform: 'uppercase' }}>Global Assessor / Mentor Sign-off Preview</h4>
//                             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
//                                 <input type="text" className="ab-input" disabled placeholder="Date..." />
//                                 <input type="text" className="ab-input" disabled placeholder="Overall Time Started..." />
//                                 <input type="text" className="ab-input" disabled placeholder="Overall Time Completed..." />
//                             </div>
//                             <textarea className="ab-input" rows={2} disabled placeholder="General Comments of Observer..."></textarea>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '0.8rem', color: '#334155', fontWeight: 'bold' }}>
//                                 <input type="checkbox" disabled checked style={{ accentColor: 'var(--mlab-blue)' }} />
//                                 I declare that I have observed the learner performing these tasks and that the evidence was submitted by the learner.
//                             </label>
//                         </div>
//                     </div>
//                 </div>
//             )}

//             {/* 🚀 BASIC LOGBOOK BLOCK */}
//             {block.type === 'logbook' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top" style={{ marginBottom: '10px' }}>
//                         <span className="ab-q-num" style={{ background: '#ffedd5', color: '#ea580c' }}>LOG</span>
//                     </div>
//                     <div style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1.5rem', borderRadius: '6px' }}>
//                         <h4 style={{ margin: '0 0 10px 0', color: '#b45309', display: 'flex', alignItems: 'center', gap: '8px' }}><CalendarRange size={18} /> Standard Logbook Table Inserted</h4>
//                         <p style={{ margin: 0, fontSize: '0.85rem', color: '#92400e', lineHeight: 1.5 }}>
//                             When the learner takes this assessment, they will be presented with a dynamic table to log their Date, Assignment Task, Start Time, Finish Time, and Total Hours.<br /><br />
//                             No further configuration is needed here.
//                         </p>
//                     </div>
//                 </div>
//             )}

//             {/* 🚀 QCTO WORKPLACE CHECKPOINT BLOCK 🚀 */}
//             {block.type === 'qcto_workplace' && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top" style={{ marginBottom: '10px' }}>
//                         <span className="ab-q-num" style={{ background: '#ffe4e6', color: '#e11d48' }}>QCTO</span>

//                         <div className="ab-marks-stepper">
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
//                             <span className="ab-step-val">{block.marks || 0}</span>
//                             <button className="ab-step-btn" disabled={isDeployed} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
//                         </div>
//                     </div>

//                     <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', padding: '1.5rem', borderRadius: '6px' }} onClick={e => e.stopPropagation()}>

//                         <div className="ab-form-group" style={{ marginBottom: '1rem' }}>
//                             <label style={{ color: '#9f1239', fontWeight: 'bold' }}>Work Experience Module Title (WE Code)</label>
//                             <input type="text" className="ab-input" value={block.weCode || ''} onChange={e => onUpdate(block.id, 'weCode', e.target.value)} disabled={isDeployed} placeholder="e.g. WM-01-WE01: Attend induction program..." style={{ borderColor: '#fecdd3' }} />
//                         </div>

//                         {/* WORK ACTIVITIES ARRAY */}
//                         <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fecdd3', marginBottom: '1rem' }}>
//                             <label style={{ display: 'block', color: '#be123c', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.85rem' }}>Workplace Activities (WA Codes)</label>
//                             {(block.workActivities || []).map((wa, i) => (
//                                 <div key={wa.id} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
//                                     <input type="text" className="ab-input" style={{ width: '100px' }} value={wa.code} onChange={e => updateWA(i, 'code', e.target.value)} disabled={isDeployed} placeholder="WA0101" />
//                                     <input type="text" className="ab-input" style={{ flex: 1 }} value={wa.description} onChange={e => updateWA(i, 'description', e.target.value)} disabled={isDeployed} placeholder="Description of the activity..." />
//                                     {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeWA(i)}><X size={16} /></button>}
//                                 </div>
//                             ))}
//                             {!isDeployed && <button className="ab-btn-text" style={{ color: '#e11d48' }} onClick={addWA}><Plus size={14} /> Add Activity</button>}
//                         </div>

//                         {/* EXPECTED DOCUMENTS ARRAY */}
//                         <div style={{ background: 'white', padding: '1rem', borderRadius: '6px', border: '1px solid #fecdd3', marginBottom: '1rem' }}>
//                             <label style={{ display: 'block', color: '#be123c', fontWeight: 'bold', marginBottom: '10px', fontSize: '0.85rem' }}>Expected Workplace Documents (Scope)</label>
//                             {(block.expectedDocuments || []).map((docStr, i) => (
//                                 <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
//                                     <input type="text" className="ab-input" style={{ flex: 1 }} value={docStr} onChange={e => updateDoc(i, e.target.value)} disabled={isDeployed} placeholder="e.g. Requirements specification document" />
//                                     {!isDeployed && <button className="ab-btn-icon-danger" onClick={() => removeDoc(i)}><X size={16} /></button>}
//                                 </div>
//                             ))}
//                             {!isDeployed && <button className="ab-btn-text" style={{ color: '#e11d48' }} onClick={addDoc}><Plus size={14} /> Add Expected Document</button>}
//                         </div>

//                         {/* TOGGLES */}
//                         <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', borderTop: '1px dashed #fda4af', paddingTop: '15px' }}>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" disabled={isDeployed} checked={block.requireSelfAssessment !== false} onChange={e => onUpdate(block.id, 'requireSelfAssessment', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
//                                 <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>Require Learner Self-Assessment</span>
//                             </label>
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: isDeployed ? 'not-allowed' : 'pointer' }}>
//                                 <input type="checkbox" disabled={isDeployed} checked={block.requireGoalPlanning !== false} onChange={e => onUpdate(block.id, 'requireGoalPlanning', e.target.checked)} style={{ width: '16px', height: '16px', accentColor: '#e11d48' }} />
//                                 <span style={{ fontSize: '0.85rem', color: '#9f1239', fontWeight: 'bold' }}>Require Goal Planning</span>
//                             </label>
//                         </div>

//                         <p style={{ margin: '15px 0 0 0', fontSize: '0.75rem', color: '#be123c', fontStyle: 'italic' }}>
//                             * When taking the assessment, learners will see a formal QCTO Checkpoint form requiring them to map evidence, state areas covered, list remaining areas, and gather supervisor signatures.
//                         </p>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
//     <div className="ab-overlay-backdrop" onClick={onCancel}>
//         <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
//             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
//             <h3 className="ab-dd-title">Delete Topic?</h3>
//             <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
//             {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
//             <div className="ab-dd-actions">
//                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
//                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={14} /> Delete</button>
//             </div>
//         </div>
//     </div>
// );

// const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (<div className="ab-section-hdr">{icon}<span>{label}</span></div>);
// const FG: React.FC<{ label: string; children: React.ReactNode; style?: React.CSSProperties }> = ({ label, children, style }) => (<div className="ab-fg" style={style}>{label && <label className="ab-fg-label">{label}</label>}{children}</div>);
// const EmptyCanvas: React.FC<{ onAdd: (t: string) => void }> = ({ onAdd }) => (
//     <div className="ab-empty-canvas">
//         <div className="ab-empty-inner">
//             <div className="ab-empty-icon"><BookOpen size={30} /></div>
//             <h2 className="ab-empty-title">Drafting Surface</h2>
//             <p className="ab-empty-sub">Choose a block type to begin</p>
//             <div className="ab-empty-grid">
//                 {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
//                     <button key={bt} className="ab-empty-card" style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
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


