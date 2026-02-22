import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
    Save, ArrowLeft, Trash2, AlignLeft, CheckSquare,
    Layout, Info, ChevronDown, BookOpen, FileText,
    Zap, Eye, Settings, GraduationCap, ListChecks,
    ClipboardList, BookMarked, Plus, Pencil, Check, X,
    AlertTriangle, RotateCcw, EyeOff, Clock
} from 'lucide-react';
import { collection, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import './FacilitatorDashboard.css'; // Adjust path if necessary
import { useStore } from '../../store/useStore';
import { db } from '../../lib/firebase';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import Tooltip from '../../components/common/Tooltip/Tooltip';

// ─── TYPES ────────────────────────────────────────────────────────────────────
type BlockType = 'section' | 'info' | 'mcq' | 'text';
type SidebarPanel = 'settings' | 'module' | 'topics' | 'guide' | 'outline';

interface Topic {
    id: string;
    code: string;
    title: string;
    weight: string;
}

interface AssessmentBlock {
    id: string;
    type: BlockType;
    title?: string;
    content?: string;
    question?: string;
    marks?: number;
    options?: string[];
    correctOption?: number;
    linkedTopicId?: string;
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
    timeLimit?: number; // ✅ ADDED: Time limit in minutes
}

// ─── DEFAULTS ─────────────────────────────────────────────────────────────────
const INITIAL_MODULE_INFO: ModuleDetails = {
    title: 'Computers and Computing Systems',
    nqfLevel: 'Level 4',
    credits: 12,
    notionalHours: 120,
    moduleNumber: '251201-005-00-KM-01',
    occupationalCode: '251201005',
    saqaQualId: '118707',
    qualificationTitle: 'Occupational Certificate: Software Developer',
    timeLimit: 60, // ✅ Default to 60 minutes
};

const LEARNER_NOTE = `This Learner Guide provides a comprehensive overview of the module. It is designed to improve the skills and knowledge of learners, and thus enabling them to effectively and efficiently complete specific tasks.`;

const MODULE_PURPOSE = `The main focus of the learning in this knowledge module is to build an understanding of what computers can do and the processes that make them function in terms of the four major parts: input, output, CPU (central processing unit) and memory.`;

const ASSESSMENT_NOTE = `The only way to establish whether you are competent and have accomplished the learning outcomes is through continuous assessments. This module includes assessments in the form of self-evaluations/activities and exercises. Listen carefully to the instructions of the facilitator and do the given activities in the time given to you.`;

const ENTRY_REQUIREMENTS = `NQF 4`;

const PROVIDER_REQUIREMENTS = `Physical Requirements:\nThe provider must have lesson plans and structured learning material or provide learners with access to structured learning material.\n\nHuman Resource Requirements:\nLecturer/learner ratio of 1:20 (Maximum)`;

const EXEMPTIONS = `No exemptions, but the module can be achieved in full through a normal RPL process`;

const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const DEFAULT_TOPICS: Topic[] = [
    { id: mkId(), code: 'KM-01-KT01', title: 'Problem solving skills for IT Professionals', weight: '5%' },
    { id: mkId(), code: 'KM-01-KT02', title: 'Techniques for safety', weight: '5%' },
];

const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
    section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
    info: { label: 'Reading', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
    text: { label: 'Open Answer', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Free-text response question' },
    mcq: { label: 'MCQ', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const AssessmentBuilder: React.FC = () => {
    const { assessmentId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    // UI States
    const [loading, setLoading] = useState(false);
    const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
    const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
    const [lastSaved, setLastSaved] = useState<Date | null>(null);

    // Data States
    const [title, setTitle] = useState(INITIAL_MODULE_INFO.title);
    const [cohortIds, setCohortIds] = useState<string[]>([]);
    const [instructions, setInstructions] = useState(ASSESSMENT_NOTE);
    const [type, setType] = useState<'formative' | 'summative'>('formative');
    const [moduleType, setModuleType] = useState<'knowledge' | 'practical' | 'workplace' | 'other'>('knowledge');

    // Module & Guide States
    const [showModuleHeader, setShowModuleHeader] = useState(true);
    const [moduleInfo, setModuleInfo] = useState<ModuleDetails>(INITIAL_MODULE_INFO);
    const [learnerNote, setLearnerNote] = useState(LEARNER_NOTE);
    const [modulePurpose, setModulePurpose] = useState(MODULE_PURPOSE);
    const [entryRequirements, setEntryRequirements] = useState(ENTRY_REQUIREMENTS);
    const [providerRequirements, setProviderRequirements] = useState(PROVIDER_REQUIREMENTS);
    const [exemptions, setExemptions] = useState(EXEMPTIONS);

    // Content States
    const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
    const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

    // CRUD States
    const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
    const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
    const [addingTopic, setAddingTopic] = useState(false);
    const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const { user, cohorts, learners, fetchCohorts, fetchLearners } = useStore();

    // ─── INITIAL LOAD ───
    useEffect(() => {
        fetchCohorts();
        if (learners.length === 0) fetchLearners();

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
                    setInstructions(data.instructions || ASSESSMENT_NOTE);
                    setType(data.type || 'formative');
                    setModuleType(data.moduleType || 'knowledge');
                    setModuleInfo(data.moduleInfo || INITIAL_MODULE_INFO);
                    setShowModuleHeader(data.showModuleHeader ?? true);
                    setBlocks(data.blocks || []);

                    if (data.learnerGuide) {
                        setLearnerNote(data.learnerGuide.note || LEARNER_NOTE);
                        setModulePurpose(data.learnerGuide.purpose || MODULE_PURPOSE);
                        setEntryRequirements(data.learnerGuide.entryRequirements || ENTRY_REQUIREMENTS);
                        setProviderRequirements(data.learnerGuide.providerRequirements || PROVIDER_REQUIREMENTS);
                        setExemptions(data.learnerGuide.exemptions || EXEMPTIONS);
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

    // ─── AUTO-SAVE ───
    useEffect(() => {
        if (!assessmentId) return;
        setSaveStatus('unsaved');

        const autoSaveTimer = setTimeout(() => {
            if (saveStatus === 'unsaved' && !loading) {
                handleAutoSave();
            }
        }, 30000);

        return () => clearTimeout(autoSaveTimer);
    }, [
        title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
        learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
        topics, blocks
    ]);

    // ─── LOCAL STORAGE BACKUP ───
    useEffect(() => {
        const backupData = {
            title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
            learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
            topics, blocks, timestamp: new Date().toISOString()
        };

        try {
            localStorage.setItem(`workbook-backup-${assessmentId || 'new'}`, JSON.stringify(backupData));
        } catch (error) {
            console.warn('Failed to backup to localStorage:', error);
        }
    }, [
        assessmentId, title, cohortIds, instructions, type, moduleType, moduleInfo, showModuleHeader,
        learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
        topics, blocks
    ]);

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
    const addBlock = (bType: BlockType, linkedTopicId?: string) => {
        const nb: AssessmentBlock = {
            id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            type: bType,
            linkedTopicId,
            title: bType === 'section' ? 'New Section' : '',
            content: '',
            question: '',
            marks: (bType === 'text' || bType === 'mcq') ? 5 : 0,
            options: bType === 'mcq' ? ['', '', '', ''] : [],
            correctOption: 0,
        };
        setBlocks(p => [...p, nb]);
        setTimeout(() => {
            setFocusedBlock(nb.id);
            document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        }
    };

    const totalMarks = blocks.reduce((s, b) => s + (b.marks || 0), 0);
    const qCount = blocks.filter(b => b.type === 'text' || b.type === 'mcq').length;
    const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

    // ── AUTO-SAVE HANDLER ──
    const handleAutoSave = async () => {
        if (!assessmentId || !title.trim() || cohortIds.length === 0) return;

        setSaveStatus('saving');
        try {
            const sanitizedBlocks = blocks.map(b => {
                const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
                if (b.linkedTopicId) {
                    const t = topics.find(topic => topic.id === b.linkedTopicId);
                    if (t) c.linkedTopicCode = t.code;
                    c.linkedTopicId = b.linkedTopicId;
                }
                if (b.type === 'section') c.title = b.title || 'Untitled Section';
                if (b.type === 'info') c.content = b.content || '';
                if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
                if (b.type === 'mcq') {
                    c.options = b.options || ['', '', '', ''];
                    c.correctOption = b.correctOption || 0;
                }
                return c;
            });

            const payload = {
                title, type, moduleType, cohortIds,
                instructions: instructions || '', moduleInfo, showModuleHeader,
                learnerGuide: {
                    note: learnerNote, purpose: modulePurpose, entryRequirements,
                    providerRequirements, exemptions, assessmentInfo: instructions
                },
                topics, blocks: sanitizedBlocks, totalMarks,
                facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
            };

            await setDoc(doc(db, 'assessments', assessmentId), payload, { merge: true });
            setSaveStatus('saved');
            setLastSaved(new Date());
        } catch (err: any) {
            console.error('Auto-save failed:', err);
            setSaveStatus('unsaved');
            toast.error('Auto-save failed. Please save manually.');
        }
    };

    // ─── MAIN SAVE LOGIC ───
    const handleSave = async (status: 'draft' | 'active') => {
        if (!title.trim()) {
            toast.warning('Please enter a Workbook Title.');
            return;
        }
        if (cohortIds.length === 0) {
            toast.warning('Please select at least one Cohort.');
            return;
        }

        setLoading(true);
        setSaveStatus('saving');

        try {
            const sanitizedBlocks = blocks.map(b => {
                const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
                if (b.linkedTopicId) {
                    const t = topics.find(topic => topic.id === b.linkedTopicId);
                    if (t) c.linkedTopicCode = t.code;
                    c.linkedTopicId = b.linkedTopicId;
                }
                if (b.type === 'section') c.title = b.title || 'Untitled Section';
                if (b.type === 'info') c.content = b.content || '';
                if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
                if (b.type === 'mcq') {
                    c.options = b.options || ['', '', '', ''];
                    c.correctOption = b.correctOption || 0;
                }
                return c;
            });

            const payload = {
                title, type, moduleType, cohortIds,
                instructions: instructions || '', moduleInfo, showModuleHeader,
                learnerGuide: {
                    note: learnerNote, purpose: modulePurpose, entryRequirements,
                    providerRequirements, exemptions, assessmentInfo: instructions
                },
                topics, blocks: sanitizedBlocks, totalMarks, status,
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

            if (status === 'active') {
                const cohortLearners = learners.filter(l => {
                    const lId = String(l.cohortId || '').trim();
                    return cohortIds.includes(lId);
                });

                if (cohortLearners.length === 0) {
                    toast.warning("No learners found in selected cohorts. Saved as Draft instead.");
                    setSaveStatus('saved');
                    setLoading(false);
                    return;
                }

                cohortLearners.forEach(learner => {
                    const submissionId = `${learner.id}_${currentAssessmentId}`;
                    const submissionRef = doc(db, 'learner_submissions', submissionId);

                    batch.set(submissionRef, {
                        learnerId: learner.id,
                        assessmentId: currentAssessmentId,
                        cohortId: learner.cohortId,
                        title: title,
                        type: type,
                        moduleType: moduleType,
                        status: 'not_started',
                        assignedAt: new Date().toISOString(),
                        marks: 0,
                        totalMarks: totalMarks,
                        moduleNumber: moduleInfo.moduleNumber
                    }, { merge: true });
                });
            }

            await batch.commit();
            setSaveStatus('saved');
            setLastSaved(new Date());

            if (status === 'active') {
                toast.success('Workbook Published & Assigned to Learners!');
            } else {
                toast.success('Draft saved successfully!');
            }

            if (!assessmentId && currentAssessmentId) {
                navigate(`/facilitator/assessments/builder/${currentAssessmentId}`, { replace: true });
            }

        } catch (err: any) {
            console.error("Save Error:", err);
            setSaveStatus('unsaved');
            toast.error(`Failed to save: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const scrollTo = (id: string) => {
        setFocusedBlock(id);
        document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="ab-root animate-fade-in">
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
                        <Tooltip content="Preview what learners will see (opens in new tab)" placement="bottom">
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

                    <Tooltip content="Save as draft without publishing" placement="bottom">
                        <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Draft'}
                        </button>
                    </Tooltip>
                    <Tooltip content={assessmentId ? "Update and publish workbook" : "Publish workbook to learners"} placement="bottom">
                        <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
                            <Zap size={15} />
                            {assessmentId ? 'Update' : 'Publish'}
                        </button>
                    </Tooltip>
                </div>
            </header>

            <div className="ab-body">
                <aside className="ab-sidebar">
                    <nav className="ab-sidebar-nav">
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
                                <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />
                                <FG label="Title">
                                    <input
                                        className="ab-input"
                                        value={title}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </FG>

                                {/* ✅ ADDED TIMER INPUT */}
                                <FG label="Time Limit (Minutes)">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Clock size={16} color="#64748b" />
                                        <input
                                            type="number"
                                            className="ab-input"
                                            placeholder="e.g. 60"
                                            style={{ width: '100px' }}
                                            value={moduleInfo.timeLimit || ''}
                                            onChange={e => setModuleInfo({ ...moduleInfo, timeLimit: Number(e.target.value) })}
                                        />
                                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                                            0 for no limit.
                                        </span>
                                    </div>
                                </FG>

                                <FG label="Assign to Cohorts">
                                    <div style={{
                                        border: '1px solid #cbd5e1', borderRadius: '6px',
                                        maxHeight: '130px', overflowY: 'auto', padding: '0.5rem',
                                        color: 'white'
                                    }}>
                                        {cohorts.map(c => (
                                            <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={cohortIds.includes(c.id)}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setCohortIds(prev => [...prev, c.id]);
                                                        } else {
                                                            setCohortIds(prev => prev.filter(id => id !== c.id));
                                                        }
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.85rem', color: '#334155' }}>{c.name}</span>
                                            </label>
                                        ))}
                                        {cohorts.length === 0 && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>No active cohorts available.</div>}
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
                                        {cohortIds.length} cohort(s) selected
                                    </span>
                                </FG>

                                <FG label="QCTO Module Type">
                                    <div className="ab-sel-wrap">
                                        <select
                                            className="ab-input ab-sel"
                                            value={moduleType}
                                            onChange={e => setModuleType(e.target.value as any)}
                                        >
                                            <option value="knowledge">Knowledge Module (KM)</option>
                                            <option value="practical">Practical Module (PM)</option>
                                            <option value="workplace">Workplace Module (WM)</option>
                                            <option value="other">Other / Practice Test</option>
                                        </select>
                                        <ChevronDown size={12} className="ab-sel-arr" />
                                    </div>
                                </FG>

                                <FG label="Type">
                                    <div className="ab-type-tog">
                                        <button
                                            className={`ab-type-btn ${type === 'formative' ? 'active' : ''}`}
                                            onClick={() => setType('formative')}
                                        >
                                            Formative
                                        </button>
                                        <button
                                            className={`ab-type-btn ${type === 'summative' ? 'active' : ''}`}
                                            onClick={() => setType('summative')}
                                        >
                                            Summative
                                        </button>
                                    </div>
                                </FG>
                                <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
                                <textarea
                                    className="ab-input ab-textarea"
                                    rows={5}
                                    value={instructions}
                                    onChange={e => setInstructions(e.target.value)}
                                />
                            </>
                        )}

                        {/* 2. MODULE */}
                        {activePanel === 'module' && (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
                                    <Tooltip content={showModuleHeader ? "Hide module header" : "Show module header"} placement="left">
                                        <button
                                            className={`ab-toggle-icon ${!showModuleHeader ? 'off' : ''}`}
                                            onClick={() => setShowModuleHeader(!showModuleHeader)}
                                        >
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
                                        <FG label="Qualification Title">
                                            <input
                                                className="ab-input"
                                                value={moduleInfo.qualificationTitle}
                                                onChange={e => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })}
                                            />
                                        </FG>
                                        <FG label="Module Number">
                                            <input
                                                className="ab-input"
                                                value={moduleInfo.moduleNumber}
                                                onChange={e => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })}
                                            />
                                        </FG>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Credits">
                                                <input
                                                    type="number"
                                                    className="ab-input"
                                                    value={moduleInfo.credits}
                                                    onChange={e => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })}
                                                />
                                            </FG>
                                            <FG label="Hours">
                                                <input
                                                    type="number"
                                                    className="ab-input"
                                                    value={moduleInfo.notionalHours}
                                                    onChange={e => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })}
                                                />
                                            </FG>
                                        </div>
                                        <div className="ab-meta-grid-inputs">
                                            <FG label="Occ. Code">
                                                <input
                                                    className="ab-input"
                                                    value={moduleInfo.occupationalCode}
                                                    onChange={e => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })}
                                                />
                                            </FG>
                                            <FG label="SAQA ID">
                                                <input
                                                    className="ab-input"
                                                    value={moduleInfo.saqaQualId}
                                                    onChange={e => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })}
                                                />
                                            </FG>
                                        </div>
                                        <FG label="NQF Level">
                                            <input
                                                className="ab-input"
                                                value={moduleInfo.nqfLevel}
                                                onChange={e => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })}
                                            />
                                        </FG>

                                        <SectionHdr icon={<Info size={13} />} label="Standard Text" />
                                        <p className="ab-prose sm">{learnerNote}</p>
                                        <p className="ab-prose sm" style={{ marginTop: '0.5rem' }}>{modulePurpose}</p>
                                    </div>
                                ) : (
                                    <div className="ab-hidden-state">
                                        <EyeOff size={24} />
                                        <p>Header hidden.</p>
                                    </div>
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
                                <FG label="Note to Learner">
                                    <textarea
                                        className="ab-input ab-textarea"
                                        rows={4}
                                        value={learnerNote}
                                        onChange={e => setLearnerNote(e.target.value)}
                                    />
                                </FG>
                                <FG label="Module Purpose">
                                    <textarea
                                        className="ab-input ab-textarea"
                                        rows={4}
                                        value={modulePurpose}
                                        onChange={e => setModulePurpose(e.target.value)}
                                    />
                                </FG>
                                <FG label="Entry Requirements">
                                    <textarea
                                        className="ab-input ab-textarea"
                                        rows={2}
                                        value={entryRequirements}
                                        onChange={e => setEntryRequirements(e.target.value)}
                                    />
                                </FG>
                                <FG label="Provider Requirements">
                                    <textarea
                                        className="ab-input ab-textarea"
                                        rows={8}
                                        value={providerRequirements}
                                        onChange={e => setProviderRequirements(e.target.value)}
                                    />
                                </FG>
                                <FG label="Exemptions">
                                    <textarea
                                        className="ab-input ab-textarea"
                                        rows={2}
                                        value={exemptions}
                                        onChange={e => setExemptions(e.target.value)}
                                    />
                                </FG>
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
                                            <li
                                                key={b.id}
                                                className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`}
                                                onClick={() => scrollTo(b.id)}
                                            >
                                                <span
                                                    className="ab-ol-dot"
                                                    style={{ background: BLOCK_META[b.type].color }}
                                                />
                                                <div className="ab-ol-text">
                                                    <span className="ab-ol-main">
                                                        {b.type === 'section'
                                                            ? (b.title || 'Section')
                                                            : b.type === 'info'
                                                                ? 'Reading Material'
                                                                : (b.question?.slice(0, 40) || `Question ${i + 1}`)}
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
                    {showModuleHeader && (
                        <div className="ab-module-card clickable" onClick={() => setActivePanel('module')}>
                            <div className="ab-mc-left">
                                <div className="ab-mc-badges">
                                    <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
                                    <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
                                    <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
                                    {/* ✅ TIMER BADGE */}
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
                            <div className="ab-mc-edit-hint">
                                <Pencil size={12} /> Edit
                            </div>
                        </div>
                    )}

                    {blocks.length === 0 ? (
                        <EmptyCanvas onAdd={addBlock} />
                    ) : (
                        <div className="ab-blocks-list">
                            {blocks.map((b, idx) => (
                                <BlockCard
                                    key={b.id}
                                    block={b}
                                    index={idx}
                                    total={blocks.length}
                                    topics={topics}
                                    focused={focusedBlock === b.id}
                                    onFocus={() => setFocusedBlock(b.id)}
                                    onUpdate={updateBlock}
                                    onUpdateOption={updateOption}
                                    onRemove={removeBlock}
                                    onMove={moveBlock}
                                />
                            ))}
                        </div>
                    )}

                    <div className="ab-add-toolbar">
                        <span className="ab-add-label">Insert</span>
                        {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
                            <Tooltip key={bt} content={BLOCK_META[bt].desc} placement="top">
                                <button
                                    className="ab-add-btn"
                                    style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
                                    onClick={() => addBlock(bt)}
                                >
                                    {BLOCK_META[bt].icon}
                                    <span>{BLOCK_META[bt].label}</span>
                                </button>
                            </Tooltip>
                        ))}
                    </div>
                </main>
            </div>

            {deleteConfirmId && (
                <DeleteOverlay
                    topic={topics.find(t => t.id === deleteConfirmId)!}
                    linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
                    onConfirm={executeDelete}
                    onCancel={cancelDelete}
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
    onAddBlock: (bt: BlockType, tid: string) => void;
}

const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
    <>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
            {!props.addingTopic && (
                <Tooltip content="Add new topic element" placement="left">
                    <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}>
                        <Plus size={14} />
                    </button>
                </Tooltip>
            )}
        </div>
        {props.addingTopic && (
            <div className="ab-topic-form">
                <div className="ab-topic-form-row">
                    <input
                        className="ab-input sm"
                        placeholder="Code"
                        value={props.newTopic.code || ''}
                        onChange={e => props.onNewTopicChange({ code: e.target.value })}
                    />
                    <input
                        className="ab-input sm"
                        placeholder="Weight"
                        style={{ width: '60px' }}
                        value={props.newTopic.weight || ''}
                        onChange={e => props.onNewTopicChange({ weight: e.target.value })}
                    />
                </div>
                <textarea
                    className="ab-input sm"
                    rows={2}
                    placeholder="Description..."
                    value={props.newTopic.title || ''}
                    onChange={e => props.onNewTopicChange({ title: e.target.value })}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
                    <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
                    <button className="ab-btn sm ab-btn-primary" onClick={props.onCommitAdd}>Add</button>
                </div>
            </div>
        )}
        <div className="ab-topics-list">
            {props.topics.map((t: Topic) => {
                const covered = props.coveredTopicIds.has(t.id);
                const isEditing = props.editingTopicId === t.id;

                if (isEditing) return (
                    <div key={t.id} className="ab-topic-row editing">
                        <div className="ab-topic-edit-fields">
                            <input
                                className="ab-topic-edit-input"
                                value={props.editDraft.code || ''}
                                onChange={e => props.onEditChange({ code: e.target.value })}
                            />
                            <input
                                className="ab-topic-edit-input"
                                value={props.editDraft.title || ''}
                                onChange={e => props.onEditChange({ title: e.target.value })}
                            />
                        </div>
                        <div className="ab-topic-edit-actions">
                            <button onClick={props.onCommitEdit} className="ab-te-btn save">
                                <Check size={14} />
                            </button>
                            <button onClick={props.onCancelEdit} className="ab-te-btn cancel">
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                );

                return (
                    <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
                        <div className="ab-topic-main">
                            <div className="ab-topic-top-row">
                                <span className="ab-topic-code">{t.code}</span>
                                <span className="ab-topic-weight">{t.weight}</span>
                            </div>
                            <span className="ab-topic-title">{t.title}</span>
                        </div>
                        <div className="ab-topic-actions">
                            <Tooltip content="Add question for this topic" placement="top">
                                <button className="ab-tadd-btn" onClick={() => props.onAddBlock('text', t.id)}>
                                    +Q
                                </button>
                            </Tooltip>
                            <Tooltip content="Add reading material for this topic" placement="top">
                                <button className="ab-tadd-btn reading" onClick={() => props.onAddBlock('info', t.id)}>
                                    +R
                                </button>
                            </Tooltip>
                            <Tooltip content="Edit topic" placement="top">
                                <button className="ab-icon-action" onClick={() => props.onStartEdit(t)}>
                                    <Pencil size={12} />
                                </button>
                            </Tooltip>
                            <Tooltip content="Delete topic" placement="top">
                                <button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}>
                                    <Trash2 size={12} />
                                </button>
                            </Tooltip>
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
    topics: Topic[];
    onFocus: () => void;
    onUpdate: (id: string, field: keyof AssessmentBlock, val: string | number | undefined) => void;
    onUpdateOption: (bid: string, idx: number, val: string) => void;
    onRemove: (id: string) => void;
    onMove: (id: string, dir: 'up' | 'down') => void;
}

const BlockCard: React.FC<BlockCardProps> = ({
    block, index, total, focused, topics, onFocus, onUpdate, onUpdateOption, onRemove, onMove
}) => {
    const meta = BLOCK_META[block.type];
    const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

    return (
        <div
            id={`block-${block.id}`}
            className={`ab-block ${focused ? 'is-focused' : ''}`}
            style={{ '--block-accent': meta.color } as React.CSSProperties}
            onClick={onFocus}
        >
            <div className="ab-block-strip" style={{ background: meta.color }} />
            <div className="ab-block-ctrl-row">
                <div className="ab-block-left">
                    <span
                        className="ab-block-type-badge"
                        style={{
                            color: meta.color,
                            background: `${meta.color}18`,
                            borderColor: `${meta.color}35`
                        }}
                    >
                        {meta.icon}
                        {meta.label}
                    </span>
                    {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
                </div>
                <div className="ab-block-actions">
                    <Tooltip content="Move block up" placement="top">
                        <button
                            className="ab-ctrl-btn"
                            onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }}
                            disabled={index === 0}
                        >
                            ↑
                        </button>
                    </Tooltip>
                    <Tooltip content="Move block down" placement="top">
                        <button
                            className="ab-ctrl-btn"
                            onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }}
                            disabled={index === total - 1}
                        >
                            ↓
                        </button>
                    </Tooltip>
                    <Tooltip content="Delete block" placement="top">
                        <button
                            className="ab-ctrl-btn ab-ctrl-del"
                            onClick={e => { e.stopPropagation(); onRemove(block.id); }}
                        >
                            <Trash2 size={13} />
                        </button>
                    </Tooltip>
                </div>
            </div>

            {block.type === 'section' && (
                <input
                    className="ab-section-input"
                    value={block.title || ''}
                    placeholder="Section title..."
                    onChange={e => onUpdate(block.id, 'title', e.target.value)}
                    onClick={e => e.stopPropagation()}
                />
            )}

            {block.type === 'info' && (
                <div className="ab-info-body">
                    <textarea
                        className="ab-textarea-block"
                        rows={5}
                        value={block.content || ''}
                        onChange={e => onUpdate(block.id, 'content', e.target.value)}
                        onClick={e => e.stopPropagation()}
                    />
                </div>
            )}

            {(block.type === 'text' || block.type === 'mcq') && (
                <div className="ab-q-body">
                    <div className="ab-q-top">
                        <span className="ab-q-num">Q{index + 1}</span>
                        <div className="ab-marks-stepper">
                            <button
                                className="ab-step-btn"
                                onClick={e => {
                                    e.stopPropagation();
                                    onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1));
                                }}
                            >
                                −
                            </button>
                            <span className="ab-step-val">{block.marks}</span>
                            <button
                                className="ab-step-btn"
                                onClick={e => {
                                    e.stopPropagation();
                                    onUpdate(block.id, 'marks', (block.marks || 0) + 1);
                                }}
                            >
                                +
                            </button>
                        </div>
                        <div className="ab-topic-sel-wrap">
                            <select
                                className="ab-topic-sel"
                                value={block.linkedTopicId || ''}
                                onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)}
                                onClick={e => e.stopPropagation()}
                            >
                                <option value="">Link topic…</option>
                                {topics.map((t: Topic) => (
                                    <option key={t.id} value={t.id}>{t.code}</option>
                                ))}
                            </select>
                            <ChevronDown size={11} className="ab-topic-sel-arr" />
                        </div>
                    </div>
                    <textarea
                        className="ab-q-input"
                        rows={2}
                        value={block.question || ''}
                        onChange={e => onUpdate(block.id, 'question', e.target.value)}
                        onClick={e => e.stopPropagation()}
                        placeholder="Type question here..."
                    />
                    {block.type === 'text' && (
                        <div className="ab-answer-placeholder">
                            <FileText size={14} />
                            <span>Learner types answer here</span>
                        </div>
                    )}
                    {block.type === 'mcq' && (
                        <div className="ab-mcq-opts">
                            {block.options?.map((opt, i) => (
                                <div
                                    key={i}
                                    className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`}
                                    onClick={e => { e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}
                                >
                                    <div className="ab-radio">
                                        {block.correctOption === i && <div className="ab-radio-dot" />}
                                    </div>
                                    <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
                                    <input
                                        className="ab-opt-input"
                                        value={opt}
                                        placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                        onChange={e => {
                                            e.stopPropagation();
                                            onUpdateOption(block.id, i, e.target.value);
                                        }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                    {block.correctOption === i && (
                                        <span className="ab-correct-tag">Correct</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

const DeleteOverlay: React.FC<{
    topic: Topic;
    linkedCount: number;
    onConfirm: () => void;
    onCancel: () => void
}> = ({ topic, linkedCount, onConfirm, onCancel }) => (
    <div className="ab-overlay-backdrop" onClick={onCancel}>
        <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
            <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
            <h3 className="ab-dd-title">Delete Topic?</h3>
            <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
            {linkedCount > 0 && (
                <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>
            )}
            <div className="ab-dd-actions">
                <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
                <button className="ab-btn ab-btn-danger" onClick={onConfirm}>
                    <Trash2 size={14} /> Delete
                </button>
            </div>
        </div>
    </div>
);

const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
    <div className="ab-section-hdr">
        {icon}
        <span>{label}</span>
    </div>
);

const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="ab-fg">
        {label && <label className="ab-fg-label">{label}</label>}
        {children}
    </div>
);

const EmptyCanvas: React.FC<{ onAdd: (t: BlockType) => void }> = ({ onAdd }) => (
    <div className="ab-empty-canvas">
        <div className="ab-empty-inner">
            <div className="ab-empty-icon"><BookOpen size={30} /></div>
            <h2 className="ab-empty-title">Drafting Surface</h2>
            <p className="ab-empty-sub">Choose a block type to begin</p>
            <div className="ab-empty-grid">
                {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
                    <button
                        key={bt}
                        className="ab-empty-card"
                        style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
                        onClick={() => onAdd(bt)}
                    >
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





// import React, { useState, useEffect } from 'react';
// import { useNavigate, useParams } from 'react-router-dom';
// import { useStore } from '../../store/useStore';
// import {
//     Save, ArrowLeft, Trash2, AlignLeft, CheckSquare,
//     Layout, Info, ChevronDown, BookOpen, FileText,
//     Zap, Eye, Settings, GraduationCap, ListChecks,
//     ClipboardList, Building2, ShieldCheck, BookMarked,
//     Plus, Pencil, Check, X, AlertTriangle,
//     RotateCcw, EyeOff
// } from 'lucide-react';
// import { collection, addDoc, doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import './FacilitatorDashboard.css';
// import Tooltip from '../../components/common/Tooltip/Tooltip';
// import { ToastContainer, useToast } from '../../components/common/Toast/Toast';

// // ─── TYPES ────────────────────────────────────────────────────────────────────
// type BlockType = 'section' | 'info' | 'mcq' | 'text';
// type SidebarPanel = 'settings' | 'module' | 'topics' | 'guide' | 'outline';

// interface Topic {
//     id: string;
//     code: string;
//     title: string;
//     weight: string;
// }

// interface AssessmentBlock {
//     id: string;
//     type: BlockType;
//     title?: string;
//     content?: string;
//     question?: string;
//     marks?: number;
//     options?: string[];
//     correctOption?: number;
//     linkedTopicId?: string;
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
// }

// // ─── DEFAULTS ─────────────────────────────────────────────────────────────────
// const INITIAL_MODULE_INFO: ModuleDetails = {
//     title: 'Computers and Computing Systems',
//     nqfLevel: 'Level 4',
//     credits: 12,
//     notionalHours: 120,
//     moduleNumber: '251201-005-00-KM-01',
//     occupationalCode: '251201005',
//     saqaQualId: '118707',
//     qualificationTitle: 'Occupational Certificate: Software Developer',
// };

// const LEARNER_NOTE = `This Learner Guide provides a comprehensive overview of the module. It is designed to improve the skills and knowledge of learners, and thus enabling them to effectively and efficiently complete specific tasks.`;

// const MODULE_PURPOSE = `The main focus of the learning in this knowledge module is to build an understanding of what computers can do and the processes that make them function in terms of the four major parts: input, output, CPU (central processing unit) and memory. It gives an overview of networks and connectivity as well as security issues pertaining to IT ecosystems.`;

// const ASSESSMENT_NOTE = `The only way to establish whether you are competent and have accomplished the learning outcomes is through continuous assessments. This assessment process involves interpreting evidence about your ability to perform certain tasks. You will be required to perform certain procedures and tasks during the training programmer and will be assessed on them to certify your competence.

// This module includes assessments in the form of self-evaluations/activities and exercises. The exercises, activities and self-assessments will be done in pairs, groups or on your own. These exercises/activities or self-assessments (Learner workbook) must be handed to the facilitator. It will be added to your portfolio of evidence, which will be proof signed by your facilitator that you have successfully performed these tasks.

// Listen carefully to the instructions of the facilitator and do the given activities in the time given to you.`;

// const ENTRY_REQUIREMENTS = `NQF 4`;

// const PROVIDER_REQUIREMENTS = `Physical Requirements:
// The provider must have lesson plans and structured learning material or provide learners with access to structured learning material that addresses all the topics in all the knowledge modules as well as the applied knowledge in the practical skills.

// QCTO/MICT SETA requirements

// Human Resource Requirements:
// Lecturer/learner ratio of 1:20 (Maximum)
// Qualification of lecturer (SME): NQF 6 in industry recognised qualifications with 1 year's experience in the IT industry
// AI vendor certification (where applicable)
// Assessors and moderators: accredited by the MICT SETA

// Legal Requirements:
// Legal (product) licences to use the software for learning and training (where applicable)
// OHS compliance certificate
// Ethical clearance (where necessary)`;

// const EXEMPTIONS = `No exemptions, but the module can be achieved in full through a normal RPL process`;

// const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// const DEFAULT_TOPICS: Topic[] = [
//     { id: mkId(), code: 'KM-01-KT01', title: 'Problem solving skills for IT Professionals', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT02', title: 'Techniques for safety', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT03', title: 'System components', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT04', title: 'Motherboards', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT05', title: 'Processors', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT06', title: 'Memory', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT07', title: 'BIOS and CMOS', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT08', title: 'Hard drives and storage devices', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT09', title: 'Power supplies and voltage', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT10', title: 'Ports, cables, and connectors', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT11', title: 'Networking and network operating systems', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT12', title: 'Networking and wireless connections', weight: '3%' },
//     { id: mkId(), code: 'KM-01-KT13', title: 'Input and output devices', weight: '3%' },
//     { id: mkId(), code: 'KM-01-KT14', title: 'Installing and managing printers', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT15', title: 'Mobile devices, multimedia, and laptop computers', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT16', title: 'Preventative maintenance', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT17', title: 'Troubleshooting procedures', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT18', title: 'Operating systems', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT19', title: 'Managing files', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT20', title: 'Applications utility, troubleshooting, and optimization', weight: '2%' },
//     { id: mkId(), code: 'KM-01-KT21', title: 'Configuring device drivers', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT22', title: 'Recovery', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT23', title: 'Cloud computing', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT24', title: 'Security fundamentals', weight: '5%' },
//     { id: mkId(), code: 'KM-01-KT25', title: 'Programming and development', weight: '5%' }
// ];

// const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
//     section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
//     info: { label: 'Reading', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
//     text: { label: 'Open Answer', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Free-text response question' },
//     mcq: { label: 'MCQ', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
// };

// // ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// export const AssessmentBuilder: React.FC = () => {
//     const { assessmentId } = useParams();
//     const navigate = useNavigate();
//     const toast = useToast();

//     // UI States
//     const [loading, setLoading] = useState(false);
//     const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
//     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
//     const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
//     const [lastSaved, setLastSaved] = useState<Date | null>(null);

//     // Data States
//     const [title, setTitle] = useState(INITIAL_MODULE_INFO.title);
//     const [cohortId, setCohortId] = useState('');
//     const [instructions, setInstructions] = useState(ASSESSMENT_NOTE);
//     const [type, setType] = useState<'formative' | 'summative'>('formative');

//     // Module & Guide States
//     const [showModuleHeader, setShowModuleHeader] = useState(true);
//     const [moduleInfo, setModuleInfo] = useState<ModuleDetails>(INITIAL_MODULE_INFO);
//     const [learnerNote, setLearnerNote] = useState(LEARNER_NOTE);
//     const [modulePurpose, setModulePurpose] = useState(MODULE_PURPOSE);
//     const [entryRequirements, setEntryRequirements] = useState(ENTRY_REQUIREMENTS);
//     const [providerRequirements, setProviderRequirements] = useState(PROVIDER_REQUIREMENTS);
//     const [exemptions, setExemptions] = useState(EXEMPTIONS);

//     // Content States
//     const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
//     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

//     // CRUD States
//     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
//     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
//     const [addingTopic, setAddingTopic] = useState(false);
//     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
//     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

//     const { user, cohorts, learners, fetchCohorts } = useStore();

//     // ─── INITIAL LOAD ───
//     useEffect(() => {
//         fetchCohorts();

//         const loadData = async () => {
//             if (!assessmentId) return;

//             setLoading(true);
//             try {
//                 const docRef = doc(db, 'assessments', assessmentId);
//                 const snap = await getDoc(docRef);

//                 if (snap.exists()) {
//                     const data = snap.data();
//                     setTitle(data.title || '');
//                     setCohortId(data.cohortId || '');
//                     setInstructions(data.instructions || ASSESSMENT_NOTE);
//                     setType(data.type || 'formative');
//                     setModuleInfo(data.moduleInfo || INITIAL_MODULE_INFO);
//                     setShowModuleHeader(data.showModuleHeader ?? true);
//                     setBlocks(data.blocks || []);

//                     // Restore learner guide data
//                     if (data.learnerGuide) {
//                         setLearnerNote(data.learnerGuide.note || LEARNER_NOTE);
//                         setModulePurpose(data.learnerGuide.purpose || MODULE_PURPOSE);
//                         setEntryRequirements(data.learnerGuide.entryRequirements || ENTRY_REQUIREMENTS);
//                         setProviderRequirements(data.learnerGuide.providerRequirements || PROVIDER_REQUIREMENTS);
//                         setExemptions(data.learnerGuide.exemptions || EXEMPTIONS);
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
//     }, [assessmentId, fetchCohorts]);

//     // ─── AUTO-SAVE ───
//     useEffect(() => {
//         // Only auto-save for existing assessments (not new ones)
//         if (!assessmentId) return;

//         // Mark as unsaved when any data changes
//         setSaveStatus('unsaved');

//         // Auto-save after 30 seconds of inactivity
//         const autoSaveTimer = setTimeout(() => {
//             if (saveStatus === 'unsaved' && !loading) {
//                 handleAutoSave();
//             }
//         }, 30000); // 30 seconds

//         return () => clearTimeout(autoSaveTimer);
//     }, [
//         title, cohortId, instructions, type, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//         topics, blocks
//     ]);

//     // ─── LOCAL STORAGE BACKUP ───
//     useEffect(() => {
//         // Backup to localStorage every time data changes
//         const backupData = {
//             title, cohortId, instructions, type, moduleInfo, showModuleHeader,
//             learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//             topics, blocks,
//             timestamp: new Date().toISOString()
//         };

//         try {
//             localStorage.setItem(`workbook-backup-${assessmentId || 'new'}`, JSON.stringify(backupData));
//         } catch (error) {
//             console.warn('Failed to backup to localStorage:', error);
//         }
//     }, [
//         assessmentId, title, cohortId, instructions, type, moduleInfo, showModuleHeader,
//         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
//         topics, blocks
//     ]);

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
//     const addBlock = (bType: BlockType, linkedTopicId?: string) => {
//         const nb: AssessmentBlock = {
//             id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
//             type: bType,
//             linkedTopicId,
//             title: bType === 'section' ? 'New Section' : '',
//             content: '',
//             question: '',
//             marks: (bType === 'text' || bType === 'mcq') ? 5 : 0,
//             options: bType === 'mcq' ? ['', '', '', ''] : [],
//             correctOption: 0,
//         };
//         setBlocks(p => [...p, nb]);
//         setTimeout(() => {
//             setFocusedBlock(nb.id);
//             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
//                 moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: ''
//             });
//         }
//     };

//     const totalMarks = blocks.reduce((s, b) => s + (b.marks || 0), 0);
//     const qCount = blocks.filter(b => b.type === 'text' || b.type === 'mcq').length;
//     const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

//     // ── AUTO-SAVE HANDLER ──
//     const handleAutoSave = async () => {
//         if (!assessmentId || !title.trim() || !cohortId) return;

//         setSaveStatus('saving');
//         try {
//             const sanitizedBlocks = blocks.map(b => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.linkedTopicId) {
//                     const t = topics.find(topic => topic.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }
//                 if (b.type === 'section') c.title = b.title || 'Untitled Section';
//                 if (b.type === 'info') c.content = b.content || '';
//                 if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
//                 if (b.type === 'mcq') {
//                     c.options = b.options || ['', '', '', ''];
//                     c.correctOption = b.correctOption || 0;
//                 }
//                 return c;
//             });

//             const payload = {
//                 title,
//                 type,
//                 cohortId,
//                 instructions: instructions || '',
//                 moduleInfo,
//                 showModuleHeader,
//                 learnerGuide: {
//                     note: learnerNote,
//                     purpose: modulePurpose,
//                     entryRequirements,
//                     providerRequirements,
//                     exemptions,
//                     assessmentInfo: instructions
//                 },
//                 topics,
//                 blocks: sanitizedBlocks,
//                 totalMarks,
//                 facilitatorId: user?.uid,
//                 lastUpdated: new Date().toISOString(),
//                 isWorkbook: true,
//             };

//             await setDoc(doc(db, 'assessments', assessmentId), payload, { merge: true });
//             setSaveStatus('saved');
//             setLastSaved(new Date());
//             // Auto-save is silent - no toast notification
//         } catch (err: any) {
//             console.error('Auto-save failed:', err);
//             setSaveStatus('unsaved');
//             toast.error('Auto-save failed. Please save manually.');
//         }
//     };

//     // ── SAVE LOGIC ──
//     // ─── SAVE LOGIC ───
//     const handleSave = async (status: 'draft' | 'active') => {
//         // 1. Validation
//         if (!title.trim()) {
//             toast.warning('Please enter a Workbook Title.');
//             return;
//         }
//         if (!cohortId) {
//             toast.warning('Please select a Cohort.');
//             return;
//         }

//         setLoading(true);
//         setSaveStatus('saving');

//         try {
//             // 2. Sanitize Blocks (Cleanup before saving)
//             const sanitizedBlocks = blocks.map(b => {
//                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
//                 if (b.linkedTopicId) {
//                     const t = topics.find(topic => topic.id === b.linkedTopicId);
//                     if (t) c.linkedTopicCode = t.code;
//                     c.linkedTopicId = b.linkedTopicId;
//                 }
//                 if (b.type === 'section') c.title = b.title || 'Untitled Section';
//                 if (b.type === 'info') c.content = b.content || '';
//                 if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
//                 if (b.type === 'mcq') {
//                     c.options = b.options || ['', '', '', ''];
//                     c.correctOption = b.correctOption || 0;
//                 }
//                 return c;
//             });

//             // 3. Prepare the main template payload
//             const payload = {
//                 title,
//                 type,
//                 cohortId,
//                 instructions: instructions || '',
//                 moduleInfo,
//                 showModuleHeader,
//                 learnerGuide: {
//                     note: learnerNote,
//                     purpose: modulePurpose,
//                     entryRequirements,
//                     providerRequirements,
//                     exemptions,
//                     assessmentInfo: instructions
//                 },
//                 topics,
//                 blocks: sanitizedBlocks,
//                 totalMarks,
//                 status,
//                 facilitatorId: user?.uid,
//                 lastUpdated: new Date().toISOString(),
//                 isWorkbook: true,
//             };

//             // 4. Initialize Firestore Batch
//             const batch = writeBatch(db);
//             let currentAssessmentId = assessmentId;

//             // 5. Add Template Save to Batch
//             if (currentAssessmentId) {
//                 // Updating existing assessment
//                 const templateRef = doc(db, 'assessments', currentAssessmentId);
//                 batch.set(templateRef, payload, { merge: true });
//             } else {
//                 // Creating new assessment
//                 const templateRef = doc(collection(db, 'assessments'));
//                 currentAssessmentId = templateRef.id;
//                 batch.set(templateRef, {
//                     ...payload,
//                     createdAt: new Date().toISOString(),
//                     createdBy: user?.fullName || 'Facilitator',
//                 });
//             }

//             // 6. 🚀 The Magic: Assign to Learners if "Publishing"
//             if (status === 'active') {
//                 // Find all learners enrolled in this specific cohort
//                 const cohortLearners = learners.filter(l => l.cohortId === cohortId);

//                 if (cohortLearners.length === 0) {
//                     console.warn("Published, but no learners found in this cohort yet.");
//                 }

//                 cohortLearners.forEach(learner => {
//                     // Create a composite ID so a learner only gets ONE copy of this assessment
//                     const submissionId = `${learner.id}_${currentAssessmentId}`;
//                     const submissionRef = doc(db, 'learner_submissions', submissionId);

//                     // Add learner assignment to the batch
//                     batch.set(submissionRef, {
//                         learnerId: learner.id,
//                         assessmentId: currentAssessmentId,
//                         cohortId: cohortId,
//                         title: title,
//                         type: type,
//                         status: 'not_started', // Learner sees this in their to-do list
//                         assignedAt: new Date().toISOString(),
//                         marks: 0,
//                         totalMarks: totalMarks,
//                         moduleNumber: moduleInfo.moduleNumber // Helpful for displaying in the portfolio
//                     }, { merge: true });
//                     // merge: true ensures we NEVER overwrite their answers if they already started it and you just hit 'update'
//                 });
//             }

//             // 7. Commit all writes to the database at exactly the same time
//             await batch.commit();

//             // 8. Update UI state
//             setSaveStatus('saved');
//             setLastSaved(new Date());

//             if (status === 'active') {
//                 toast.success('Workbook Published & Assigned to Learners!');
//             } else {
//                 toast.success('Draft saved successfully!');
//             }

//             // If it was a new creation, update the URL so we don't accidentally create duplicates on the next save
//             if (!assessmentId && currentAssessmentId) {
//                 navigate(`/facilitator/assessments/builder/${currentAssessmentId}`, { replace: true });
//             }

//         } catch (err: any) {
//             console.error("Save Error:", err);
//             setSaveStatus('unsaved');
//             toast.error(`Failed to save: ${err.message}`);
//         } finally {
//             setLoading(false);
//         }
//     };

//     const scrollTo = (id: string) => {
//         setFocusedBlock(id);
//         document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
//     };

//     return (
//         <div className="ab-root animate-fade-in">
//             {/* Toast Container */}
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

//                     {/* Save Status Indicator */}
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

//                     <Tooltip content="Save as draft without publishing" placement="bottom">
//                         <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
//                             {loading ? 'Saving...' : 'Save Draft'}
//                         </button>
//                     </Tooltip>
//                     <Tooltip content={assessmentId ? "Update and publish workbook" : "Publish workbook to learners"} placement="bottom">
//                         <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
//                             <Zap size={15} />
//                             {assessmentId ? 'Update' : 'Publish'}
//                         </button>
//                     </Tooltip>
//                 </div>
//             </header>

//             <div className="ab-body">
//                 <aside className="ab-sidebar">
//                     <nav className="ab-sidebar-nav">
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
//                                 <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />
//                                 <FG label="Title">
//                                     <input
//                                         className="ab-input"
//                                         value={title}
//                                         onChange={e => setTitle(e.target.value)}
//                                     />
//                                 </FG>
//                                 <FG label="Cohort">
//                                     <div className="ab-sel-wrap">
//                                         <select
//                                             className="ab-input ab-sel"
//                                             value={cohortId}
//                                             onChange={e => setCohortId(e.target.value)}
//                                         >
//                                             <option value="">Select cohort...</option>
//                                             {cohorts.map(c => (
//                                                 <option key={c.id} value={c.id}>{c.name}</option>
//                                             ))}
//                                         </select>
//                                         <ChevronDown size={12} className="ab-sel-arr" />
//                                     </div>
//                                 </FG>
//                                 <FG label="Type">
//                                     <div className="ab-type-tog">
//                                         <button
//                                             className={`ab-type-btn ${type === 'formative' ? 'active' : ''}`}
//                                             onClick={() => setType('formative')}
//                                         >
//                                             Formative
//                                         </button>
//                                         <button
//                                             className={`ab-type-btn ${type === 'summative' ? 'active' : ''}`}
//                                             onClick={() => setType('summative')}
//                                         >
//                                             Summative
//                                         </button>
//                                     </div>
//                                 </FG>
//                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
//                                 <textarea
//                                     className="ab-input ab-textarea"
//                                     rows={5}
//                                     value={instructions}
//                                     onChange={e => setInstructions(e.target.value)}
//                                 />
//                             </>
//                         )}

//                         {/* 2. MODULE */}
//                         {activePanel === 'module' && (
//                             <>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
//                                     <Tooltip content={showModuleHeader ? "Hide module header" : "Show module header"} placement="left">
//                                         <button
//                                             className={`ab-toggle-icon ${!showModuleHeader ? 'off' : ''}`}
//                                             onClick={() => setShowModuleHeader(!showModuleHeader)}
//                                         >
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
//                                         <FG label="Qualification Title">
//                                             <input
//                                                 className="ab-input"
//                                                 value={moduleInfo.qualificationTitle}
//                                                 onChange={e => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })}
//                                             />
//                                         </FG>
//                                         <FG label="Module Number">
//                                             <input
//                                                 className="ab-input"
//                                                 value={moduleInfo.moduleNumber}
//                                                 onChange={e => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })}
//                                             />
//                                         </FG>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Credits">
//                                                 <input
//                                                     type="number"
//                                                     className="ab-input"
//                                                     value={moduleInfo.credits}
//                                                     onChange={e => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })}
//                                                 />
//                                             </FG>
//                                             <FG label="Hours">
//                                                 <input
//                                                     type="number"
//                                                     className="ab-input"
//                                                     value={moduleInfo.notionalHours}
//                                                     onChange={e => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })}
//                                                 />
//                                             </FG>
//                                         </div>
//                                         <div className="ab-meta-grid-inputs">
//                                             <FG label="Occ. Code">
//                                                 <input
//                                                     className="ab-input"
//                                                     value={moduleInfo.occupationalCode}
//                                                     onChange={e => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })}
//                                                 />
//                                             </FG>
//                                             <FG label="SAQA ID">
//                                                 <input
//                                                     className="ab-input"
//                                                     value={moduleInfo.saqaQualId}
//                                                     onChange={e => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })}
//                                                 />
//                                             </FG>
//                                         </div>
//                                         <FG label="NQF Level">
//                                             <input
//                                                 className="ab-input"
//                                                 value={moduleInfo.nqfLevel}
//                                                 onChange={e => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })}
//                                             />
//                                         </FG>

//                                         <SectionHdr icon={<Info size={13} />} label="Standard Text" />
//                                         <p className="ab-prose sm">{learnerNote}</p>
//                                         <p className="ab-prose sm" style={{ marginTop: '0.5rem' }}>{modulePurpose}</p>
//                                     </div>
//                                 ) : (
//                                     <div className="ab-hidden-state">
//                                         <EyeOff size={24} />
//                                         <p>Header hidden.</p>
//                                     </div>
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

//                                 <FG label="Note to Learner">
//                                     <textarea
//                                         className="ab-input ab-textarea"
//                                         rows={4}
//                                         value={learnerNote}
//                                         onChange={e => setLearnerNote(e.target.value)}
//                                     />
//                                 </FG>

//                                 <FG label="Module Purpose">
//                                     <textarea
//                                         className="ab-input ab-textarea"
//                                         rows={4}
//                                         value={modulePurpose}
//                                         onChange={e => setModulePurpose(e.target.value)}
//                                     />
//                                 </FG>

//                                 <FG label="Entry Requirements">
//                                     <textarea
//                                         className="ab-input ab-textarea"
//                                         rows={2}
//                                         value={entryRequirements}
//                                         onChange={e => setEntryRequirements(e.target.value)}
//                                     />
//                                 </FG>

//                                 <FG label="Provider Requirements">
//                                     <textarea
//                                         className="ab-input ab-textarea"
//                                         rows={8}
//                                         value={providerRequirements}
//                                         onChange={e => setProviderRequirements(e.target.value)}
//                                     />
//                                 </FG>

//                                 <FG label="Exemptions">
//                                     <textarea
//                                         className="ab-input ab-textarea"
//                                         rows={2}
//                                         value={exemptions}
//                                         onChange={e => setExemptions(e.target.value)}
//                                     />
//                                 </FG>
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
//                                             <li
//                                                 key={b.id}
//                                                 className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`}
//                                                 onClick={() => scrollTo(b.id)}
//                                             >
//                                                 <span
//                                                     className="ab-ol-dot"
//                                                     style={{ background: BLOCK_META[b.type].color }}
//                                                 />
//                                                 <div className="ab-ol-text">
//                                                     <span className="ab-ol-main">
//                                                         {b.type === 'section'
//                                                             ? (b.title || 'Section')
//                                                             : b.type === 'info'
//                                                                 ? 'Reading Material'
//                                                                 : (b.question?.slice(0, 40) || `Question ${i + 1}`)}
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
//                     {showModuleHeader && (
//                         <div className="ab-module-card clickable" onClick={() => setActivePanel('module')}>
//                             <div className="ab-mc-left">
//                                 <div className="ab-mc-badges">
//                                     <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
//                                     <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
//                                     <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
//                                     <span className={`ab-mc-b type-${type}`}>{type}</span>
//                                 </div>
//                                 <h1 className="ab-mc-title">{title || 'Untitled Workbook'}</h1>
//                                 <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
//                             </div>
//                             <div className="ab-mc-right">
//                                 <div className="ab-mc-stat">
//                                     <span className="ab-mc-val">{qCount}</span>
//                                     <span className="ab-mc-lbl">Qs</span>
//                                 </div>
//                                 <div className="ab-mc-div" />
//                                 <div className="ab-mc-stat">
//                                     <span className="ab-mc-val">{totalMarks}</span>
//                                     <span className="ab-mc-lbl">Marks</span>
//                                 </div>
//                             </div>
//                             <div className="ab-mc-edit-hint">
//                                 <Pencil size={12} /> Edit
//                             </div>
//                         </div>
//                     )}

//                     {blocks.length === 0 ? (
//                         <EmptyCanvas onAdd={addBlock} />
//                     ) : (
//                         <div className="ab-blocks-list">
//                             {blocks.map((b, idx) => (
//                                 <BlockCard
//                                     key={b.id}
//                                     block={b}
//                                     index={idx}
//                                     total={blocks.length}
//                                     topics={topics}
//                                     focused={focusedBlock === b.id}
//                                     onFocus={() => setFocusedBlock(b.id)}
//                                     onUpdate={updateBlock}
//                                     onUpdateOption={updateOption}
//                                     onRemove={removeBlock}
//                                     onMove={moveBlock}
//                                 />
//                             ))}
//                         </div>
//                     )}

//                     <div className="ab-add-toolbar">
//                         <span className="ab-add-label">Insert</span>
//                         {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
//                             <Tooltip key={bt} content={BLOCK_META[bt].desc} placement="top">
//                                 <button
//                                     className="ab-add-btn"
//                                     style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
//                                     onClick={() => addBlock(bt)}
//                                 >
//                                     {BLOCK_META[bt].icon}
//                                     <span>{BLOCK_META[bt].label}</span>
//                                 </button>
//                             </Tooltip>
//                         ))}
//                     </div>
//                 </main>
//             </div>

//             {deleteConfirmId && (
//                 <DeleteOverlay
//                     topic={topics.find(t => t.id === deleteConfirmId)!}
//                     linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
//                     onConfirm={executeDelete}
//                     onCancel={cancelDelete}
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
//     onAddBlock: (bt: BlockType, tid: string) => void;
// }

// const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
//     <>
//         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//             <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
//             {!props.addingTopic && (
//                 <Tooltip content="Add new topic element" placement="left">
//                     <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}>
//                         <Plus size={14} />
//                     </button>
//                 </Tooltip>
//             )}
//         </div>
//         {props.addingTopic && (
//             <div className="ab-topic-form">
//                 <div className="ab-topic-form-row">
//                     <input
//                         className="ab-input sm"
//                         placeholder="Code"
//                         value={props.newTopic.code || ''}
//                         onChange={e => props.onNewTopicChange({ code: e.target.value })}
//                     />
//                     <input
//                         className="ab-input sm"
//                         placeholder="Weight"
//                         style={{ width: '60px' }}
//                         value={props.newTopic.weight || ''}
//                         onChange={e => props.onNewTopicChange({ weight: e.target.value })}
//                     />
//                 </div>
//                 <textarea
//                     className="ab-input sm"
//                     rows={2}
//                     placeholder="Description..."
//                     value={props.newTopic.title || ''}
//                     onChange={e => props.onNewTopicChange({ title: e.target.value })}
//                 />
//                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
//                     <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
//                     <button className="ab-btn sm ab-btn-primary" onClick={props.onCommitAdd}>Add</button>
//                 </div>
//             </div>
//         )}
//         <div className="ab-topics-list">
//             {props.topics.map((t: Topic) => {
//                 const covered = props.coveredTopicIds.has(t.id);
//                 const isEditing = props.editingTopicId === t.id;

//                 if (isEditing) return (
//                     <div key={t.id} className="ab-topic-row editing">
//                         <div className="ab-topic-edit-fields">
//                             <input
//                                 className="ab-topic-edit-input"
//                                 value={props.editDraft.code || ''}
//                                 onChange={e => props.onEditChange({ code: e.target.value })}
//                             />
//                             <input
//                                 className="ab-topic-edit-input"
//                                 value={props.editDraft.title || ''}
//                                 onChange={e => props.onEditChange({ title: e.target.value })}
//                             />
//                         </div>
//                         <div className="ab-topic-edit-actions">
//                             <button onClick={props.onCommitEdit} className="ab-te-btn save">
//                                 <Check size={14} />
//                             </button>
//                             <button onClick={props.onCancelEdit} className="ab-te-btn cancel">
//                                 <X size={14} />
//                             </button>
//                         </div>
//                     </div>
//                 );

//                 return (
//                     <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
//                         <div className="ab-topic-main">
//                             <div className="ab-topic-top-row">
//                                 <span className="ab-topic-code">{t.code}</span>
//                                 <span className="ab-topic-weight">{t.weight}</span>
//                             </div>
//                             <span className="ab-topic-title">{t.title}</span>
//                         </div>
//                         <div className="ab-topic-actions">
//                             <Tooltip content="Add question for this topic" placement="top">
//                                 <button className="ab-tadd-btn" onClick={() => props.onAddBlock('text', t.id)}>
//                                     +Q
//                                 </button>
//                             </Tooltip>
//                             <Tooltip content="Add reading material for this topic" placement="top">
//                                 <button className="ab-tadd-btn reading" onClick={() => props.onAddBlock('info', t.id)}>
//                                     +R
//                                 </button>
//                             </Tooltip>
//                             <Tooltip content="Edit topic" placement="top">
//                                 <button className="ab-icon-action" onClick={() => props.onStartEdit(t)}>
//                                     <Pencil size={12} />
//                                 </button>
//                             </Tooltip>
//                             <Tooltip content="Delete topic" placement="top">
//                                 <button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}>
//                                     <Trash2 size={12} />
//                                 </button>
//                             </Tooltip>
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
//     topics: Topic[];
//     onFocus: () => void;
//     onUpdate: (id: string, field: keyof AssessmentBlock, val: string | number | undefined) => void;
//     onUpdateOption: (bid: string, idx: number, val: string) => void;
//     onRemove: (id: string) => void;
//     onMove: (id: string, dir: 'up' | 'down') => void;
// }

// const BlockCard: React.FC<BlockCardProps> = ({
//     block, index, total, focused, topics, onFocus, onUpdate, onUpdateOption, onRemove, onMove
// }) => {
//     const meta = BLOCK_META[block.type];
//     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);

//     return (
//         <div
//             id={`block-${block.id}`}
//             className={`ab-block ${focused ? 'is-focused' : ''}`}
//             style={{ '--block-accent': meta.color } as React.CSSProperties}
//             onClick={onFocus}
//         >
//             <div className="ab-block-strip" style={{ background: meta.color }} />
//             <div className="ab-block-ctrl-row">
//                 <div className="ab-block-left">
//                     <span
//                         className="ab-block-type-badge"
//                         style={{
//                             color: meta.color,
//                             background: `${meta.color}18`,
//                             borderColor: `${meta.color}35`
//                         }}
//                     >
//                         {meta.icon}
//                         {meta.label}
//                     </span>
//                     {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
//                 </div>
//                 <div className="ab-block-actions">
//                     <Tooltip content="Move block up" placement="top">
//                         <button
//                             className="ab-ctrl-btn"
//                             onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }}
//                             disabled={index === 0}
//                         >
//                             ↑
//                         </button>
//                     </Tooltip>
//                     <Tooltip content="Move block down" placement="top">
//                         <button
//                             className="ab-ctrl-btn"
//                             onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }}
//                             disabled={index === total - 1}
//                         >
//                             ↓
//                         </button>
//                     </Tooltip>
//                     <Tooltip content="Delete block" placement="top">
//                         <button
//                             className="ab-ctrl-btn ab-ctrl-del"
//                             onClick={e => { e.stopPropagation(); onRemove(block.id); }}
//                         >
//                             <Trash2 size={13} />
//                         </button>
//                     </Tooltip>
//                 </div>
//             </div>

//             {block.type === 'section' && (
//                 <input
//                     className="ab-section-input"
//                     value={block.title || ''}
//                     placeholder="Section title..."
//                     onChange={e => onUpdate(block.id, 'title', e.target.value)}
//                     onClick={e => e.stopPropagation()}
//                 />
//             )}

//             {block.type === 'info' && (
//                 <div className="ab-info-body">
//                     <textarea
//                         className="ab-textarea-block"
//                         rows={5}
//                         value={block.content || ''}
//                         onChange={e => onUpdate(block.id, 'content', e.target.value)}
//                         onClick={e => e.stopPropagation()}
//                     />
//                 </div>
//             )}

//             {(block.type === 'text' || block.type === 'mcq') && (
//                 <div className="ab-q-body">
//                     <div className="ab-q-top">
//                         <span className="ab-q-num">Q{index + 1}</span>
//                         <div className="ab-marks-stepper">
//                             <button
//                                 className="ab-step-btn"
//                                 onClick={e => {
//                                     e.stopPropagation();
//                                     onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1));
//                                 }}
//                             >
//                                 −
//                             </button>
//                             <span className="ab-step-val">{block.marks}</span>
//                             <button
//                                 className="ab-step-btn"
//                                 onClick={e => {
//                                     e.stopPropagation();
//                                     onUpdate(block.id, 'marks', (block.marks || 0) + 1);
//                                 }}
//                             >
//                                 +
//                             </button>
//                         </div>
//                         <div className="ab-topic-sel-wrap">
//                             <select
//                                 className="ab-topic-sel"
//                                 value={block.linkedTopicId || ''}
//                                 onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)}
//                                 onClick={e => e.stopPropagation()}
//                             >
//                                 <option value="">Link topic…</option>
//                                 {topics.map((t: Topic) => (
//                                     <option key={t.id} value={t.id}>{t.code}</option>
//                                 ))}
//                             </select>
//                             <ChevronDown size={11} className="ab-topic-sel-arr" />
//                         </div>
//                     </div>
//                     <textarea
//                         className="ab-q-input"
//                         rows={2}
//                         value={block.question || ''}
//                         onChange={e => onUpdate(block.id, 'question', e.target.value)}
//                         onClick={e => e.stopPropagation()}
//                         placeholder="Type question here..."
//                     />
//                     {block.type === 'text' && (
//                         <div className="ab-answer-placeholder">
//                             <FileText size={14} />
//                             <span>Learner types answer here</span>
//                         </div>
//                     )}
//                     {block.type === 'mcq' && (
//                         <div className="ab-mcq-opts">
//                             {block.options?.map((opt, i) => (
//                                 <div
//                                     key={i}
//                                     className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`}
//                                     onClick={e => { e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}
//                                 >
//                                     <div className="ab-radio">
//                                         {block.correctOption === i && <div className="ab-radio-dot" />}
//                                     </div>
//                                     <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
//                                     <input
//                                         className="ab-opt-input"
//                                         value={opt}
//                                         placeholder={`Option ${String.fromCharCode(65 + i)}`}
//                                         onChange={e => {
//                                             e.stopPropagation();
//                                             onUpdateOption(block.id, i, e.target.value);
//                                         }}
//                                         onClick={e => e.stopPropagation()}
//                                     />
//                                     {block.correctOption === i && (
//                                         <span className="ab-correct-tag">Correct</span>
//                                     )}
//                                 </div>
//                             ))}
//                         </div>
//                     )}
//                 </div>
//             )}
//         </div>
//     );
// };

// const DeleteOverlay: React.FC<{
//     topic: Topic;
//     linkedCount: number;
//     onConfirm: () => void;
//     onCancel: () => void
// }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
//     <div className="ab-overlay-backdrop" onClick={onCancel}>
//         <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
//             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
//             <h3 className="ab-dd-title">Delete Topic?</h3>
//             <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
//             {linkedCount > 0 && (
//                 <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>
//             )}
//             <div className="ab-dd-actions">
//                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
//                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}>
//                     <Trash2 size={14} /> Delete
//                 </button>
//             </div>
//         </div>
//     </div>
// );

// const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
//     <div className="ab-section-hdr">
//         {icon}
//         <span>{label}</span>
//     </div>
// );

// const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
//     <div className="ab-fg">
//         {label && <label className="ab-fg-label">{label}</label>}
//         {children}
//     </div>
// );

// const EmptyCanvas: React.FC<{ onAdd: (t: BlockType) => void }> = ({ onAdd }) => (
//     <div className="ab-empty-canvas">
//         <div className="ab-empty-inner">
//             <div className="ab-empty-icon"><BookOpen size={30} /></div>
//             <h2 className="ab-empty-title">Drafting Surface</h2>
//             <p className="ab-empty-sub">Choose a block type to begin</p>
//             <div className="ab-empty-grid">
//                 {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
//                     <button
//                         key={bt}
//                         className="ab-empty-card"
//                         style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
//                         onClick={() => onAdd(bt)}
//                     >
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


// // import React, { useState, useEffect } from 'react';
// // import { useNavigate, useParams } from 'react-router-dom';
// // import { useStore } from '../../store/useStore';
// // import {
// //     Save, ArrowLeft, Trash2, AlignLeft, CheckSquare,
// //     Layout, Info, ChevronDown, BookOpen, FileText,
// //     Zap, Eye, Settings, GraduationCap, ListChecks,
// //     ClipboardList, Building2, ShieldCheck, BookMarked,
// //     Plus, Pencil, Check, X, AlertTriangle,
// //     RotateCcw, EyeOff, Calendar
// // } from 'lucide-react';
// // import { collection, addDoc, doc, getDoc, setDoc } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import './FacilitatorDashboard.css';

// // // ─── TYPES ────────────────────────────────────────────────────────────────────
// // type BlockType = 'section' | 'info' | 'mcq' | 'text';
// // type SidebarPanel = 'settings' | 'module' | 'topics' | 'guide' | 'outline';

// // interface Topic {
// //     id: string;
// //     code: string;
// //     title: string;
// //     weight: string;
// // }

// // interface AssessmentBlock {
// //     id: string;
// //     type: BlockType;
// //     title?: string;
// //     content?: string;
// //     question?: string;
// //     marks?: number;
// //     options?: string[];
// //     correctOption?: number;
// //     linkedTopicId?: string;
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
// // }

// // // ─── DEFAULTS ─────────────────────────────────────────────────────────────────
// // const INITIAL_MODULE_INFO: ModuleDetails = {
// //     title: 'Computers and Computing Systems',
// //     nqfLevel: 'Level 4',
// //     credits: 12,
// //     notionalHours: 120,
// //     moduleNumber: '251201-005-00-KM-01',
// //     occupationalCode: '251201005',
// //     saqaQualId: '118707',
// //     qualificationTitle: 'Occupational Certificate: Software Developer',
// // };

// // const LEARNER_NOTE = `This Learner Guide provides a comprehensive overview of the module. It is designed to improve the skills and knowledge of learners, and thus enabling them to effectively and efficiently complete specific tasks.`;
// // const MODULE_PURPOSE = `The main focus of the learning in this knowledge module is to build an understanding of what computers can do and the processes that make them function in terms of the four major parts: input, output, CPU (central processing unit) and memory. It gives an overview of networks and connectivity as well as security issues pertaining to IT ecosystems.`;
// // const ASSESSMENT_NOTE = `The only way to establish whether you are competent and have accomplished the learning outcomes is through continuous assessments. This assessment process involves interpreting evidence about your ability to perform certain tasks.`;
// // const ENTRY_REQUIREMENTS = `NQF 4`;
// // const PROVIDER_REQUIREMENTS = `Physical Requirements: Lesson plans and structured learning material addressing all knowledge module topics. QCTO/MICT SETA requirements apply.`;
// // const EXEMPTIONS = `No exemptions, but the module can be achieved in full through a normal RPL process`;

// // const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// // const DEFAULT_TOPICS: Topic[] = [
// //     { id: mkId(), code: 'KM-01-KT01', title: 'Problem solving skills for IT Professionals', weight: '5%' },
// //     { id: mkId(), code: 'KM-01-KT02', title: 'Techniques for safety', weight: '5%' },
// //     { id: mkId(), code: 'KM-01-KT03', title: 'System components', weight: '5%' },
// //     { id: mkId(), code: 'KM-01-KT04', title: 'Motherboards', weight: '5%' },
// // ];

// // const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
// //     section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
// //     info: { label: 'Reading', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
// //     text: { label: 'Open Answer', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Free-text response question' },
// //     mcq: { label: 'MCQ', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
// // };

// // // ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// // export const AssessmentBuilder: React.FC = () => {
// //     const { assessmentId } = useParams();
// //     const navigate = useNavigate();
// //     const { user, cohorts, fetchCohorts } = useStore();

// //     // UI States
// //     const [loading, setLoading] = useState(false);
// //     const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
// //     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);
// //     const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
// //     const [lastSaved, setLastSaved] = useState<Date | null>(null);

// //     // Data States
// //     const [title, setTitle] = useState(INITIAL_MODULE_INFO.title);
// //     const [cohortId, setCohortId] = useState('');
// //     const [scheduledDate, setScheduledDate] = useState(''); // NEW: Date State
// //     const [instructions, setInstructions] = useState(ASSESSMENT_NOTE);
// //     const [type, setType] = useState<'formative' | 'summative'>('formative');

// //     // Module & Guide States
// //     const [showModuleHeader, setShowModuleHeader] = useState(true);
// //     const [moduleInfo, setModuleInfo] = useState<ModuleDetails>(INITIAL_MODULE_INFO);
// //     const [learnerNote, setLearnerNote] = useState(LEARNER_NOTE);
// //     const [modulePurpose, setModulePurpose] = useState(MODULE_PURPOSE);
// //     const [entryRequirements, setEntryRequirements] = useState(ENTRY_REQUIREMENTS);
// //     const [providerRequirements, setProviderRequirements] = useState(PROVIDER_REQUIREMENTS);
// //     const [exemptions, setExemptions] = useState(EXEMPTIONS);

// //     // Content States
// //     const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
// //     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

// //     // CRUD States
// //     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
// //     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
// //     const [addingTopic, setAddingTopic] = useState(false);
// //     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
// //     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

// //     // ─── INITIAL LOAD ───
// //     useEffect(() => {
// //         fetchCohorts();

// //         const loadData = async () => {
// //             if (!assessmentId) return;

// //             setLoading(true);
// //             try {
// //                 const docRef = doc(db, 'assessments', assessmentId);
// //                 const snap = await getDoc(docRef);

// //                 if (snap.exists()) {
// //                     const data = snap.data();
// //                     setTitle(data.title || '');
// //                     setCohortId(data.cohortId || '');
// //                     setScheduledDate(data.scheduledDate || ''); // Load date
// //                     setInstructions(data.instructions || ASSESSMENT_NOTE);
// //                     setType(data.type || 'formative');
// //                     setModuleInfo(data.moduleInfo || INITIAL_MODULE_INFO);
// //                     setShowModuleHeader(data.showModuleHeader ?? true);
// //                     setBlocks(data.blocks || []);

// //                     if (data.learnerGuide) {
// //                         setLearnerNote(data.learnerGuide.note || LEARNER_NOTE);
// //                         setModulePurpose(data.learnerGuide.purpose || MODULE_PURPOSE);
// //                         setEntryRequirements(data.learnerGuide.entryRequirements || ENTRY_REQUIREMENTS);
// //                         setProviderRequirements(data.learnerGuide.providerRequirements || PROVIDER_REQUIREMENTS);
// //                         setExemptions(data.learnerGuide.exemptions || EXEMPTIONS);
// //                     }

// //                     if (data.topics && Array.isArray(data.topics)) {
// //                         setTopics(data.topics.map((t: any) => ({ ...t, id: t.id || mkId() })));
// //                     }

// //                     setSaveStatus('saved');
// //                     setLastSaved(new Date(data.lastUpdated || data.createdAt));
// //                 }
// //             } catch (error) {
// //                 console.error("Failed to load assessment:", error);
// //                 alert("Could not load the requested assessment.");
// //             } finally {
// //                 setLoading(false);
// //             }
// //         };

// //         loadData();
// //     }, [assessmentId, fetchCohorts]);

// //     // ─── AUTO-SAVE ───
// //     useEffect(() => {
// //         if (!assessmentId) return;
// //         setSaveStatus('unsaved');
// //         const autoSaveTimer = setTimeout(() => {
// //             if (saveStatus === 'unsaved' && !loading) {
// //                 handleAutoSave();
// //             }
// //         }, 30000);
// //         return () => clearTimeout(autoSaveTimer);
// //     }, [
// //         title, cohortId, scheduledDate, instructions, type, moduleInfo, showModuleHeader,
// //         learnerNote, modulePurpose, entryRequirements, providerRequirements, exemptions,
// //         topics, blocks
// //     ]);

// //     // ─── LOCAL STORAGE BACKUP ───
// //     useEffect(() => {
// //         const backupData = {
// //             title, cohortId, scheduledDate, instructions, type, moduleInfo, showModuleHeader,
// //             topics, blocks, timestamp: new Date().toISOString()
// //         };
// //         try {
// //             localStorage.setItem(`workbook-backup-${assessmentId || 'new'}`, JSON.stringify(backupData));
// //         } catch (error) {
// //             console.warn('Failed to backup to localStorage:', error);
// //         }
// //     }, [assessmentId, title, cohortId, scheduledDate, instructions, type, moduleInfo, showModuleHeader, topics, blocks]);

// //     // ── TOPIC HANDLERS ──
// //     const startEdit = (t: Topic) => { setEditingTopicId(t.id); setEditDraft({ ...t }); setAddingTopic(false); };
// //     const commitEdit = () => {
// //         if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
// //         setTopics(prev => prev.map(t => t.id === editingTopicId ? { ...t, ...editDraft } as Topic : t));
// //         setEditingTopicId(null);
// //     };
// //     const cancelEdit = () => setEditingTopicId(null);
// //     const confirmDelete = (id: string) => setDeleteConfirmId(id);
// //     const executeDelete = () => {
// //         if (!deleteConfirmId) return;
// //         setBlocks(p => p.map(b => b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b));
// //         setTopics(p => p.filter(t => t.id !== deleteConfirmId));
// //         setDeleteConfirmId(null);
// //     };
// //     const cancelDelete = () => setDeleteConfirmId(null);
// //     const commitAdd = () => {
// //         if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
// //         setTopics(p => [...p, { id: mkId(), code: newTopic.code!, title: newTopic.title!, weight: newTopic.weight || '0%' }]);
// //         setNewTopic({ code: '', title: '', weight: '' });
// //         setAddingTopic(false);
// //     };
// //     const cancelAdd = () => { setAddingTopic(false); setNewTopic({}); };

// //     // ── BLOCK HANDLERS ──
// //     const addBlock = (bType: BlockType, linkedTopicId?: string) => {
// //         const nb: AssessmentBlock = {
// //             id: `b-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
// //             type: bType, linkedTopicId,
// //             title: bType === 'section' ? 'New Section' : '',
// //             content: '', question: '',
// //             marks: (bType === 'text' || bType === 'mcq') ? 5 : 0,
// //             options: bType === 'mcq' ? ['', '', '', ''] : [],
// //             correctOption: 0,
// //         };
// //         setBlocks(p => [...p, nb]);
// //         setTimeout(() => {
// //             setFocusedBlock(nb.id);
// //             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
// //         }, 60);
// //     };

// //     const updateBlock = (id: string, field: keyof AssessmentBlock, val: any) =>
// //         setBlocks(p => p.map(b => b.id === id ? { ...b, [field]: val } : b));

// //     const updateOption = (blockId: string, idx: number, val: string) =>
// //         setBlocks(p => p.map(b => {
// //             if (b.id !== blockId || !b.options) return b;
// //             const o = [...b.options]; o[idx] = val; return { ...b, options: o };
// //         }));

// //     const removeBlock = (id: string) => {
// //         if (window.confirm('Remove this block?')) {
// //             setBlocks(p => p.filter(b => b.id !== id));
// //             setFocusedBlock(null);
// //         }
// //     };

// //     const moveBlock = (id: string, dir: 'up' | 'down') =>
// //         setBlocks(p => {
// //             const i = p.findIndex(b => b.id === id);
// //             if ((dir === 'up' && i === 0) || (dir === 'down' && i === p.length - 1)) return p;
// //             const n = [...p], sw = dir === 'up' ? i - 1 : i + 1;
// //             [n[i], n[sw]] = [n[sw], n[i]]; return n;
// //         });

// //     const resetModuleInfo = () => {
// //         if (window.confirm("Clear all module fields?")) {
// //             setModuleInfo({
// //                 title: '', nqfLevel: '', credits: 0, notionalHours: 0,
// //                 moduleNumber: '', occupationalCode: '', saqaQualId: '', qualificationTitle: ''
// //             });
// //         }
// //     };

// //     const totalMarks = blocks.reduce((s, b) => s + (b.marks || 0), 0);
// //     const qCount = blocks.filter(b => b.type === 'text' || b.type === 'mcq').length;
// //     const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

// //     // ── AUTO-SAVE HANDLER ──
// //     const handleAutoSave = async () => {
// //         if (!assessmentId || !title.trim() || !cohortId) return;
// //         setSaveStatus('saving');
// //         try {
// //             const sanitizedBlocks = blocks.map(b => {
// //                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
// //                 if (b.linkedTopicId) {
// //                     const t = topics.find(topic => topic.id === b.linkedTopicId);
// //                     if (t) c.linkedTopicCode = t.code;
// //                     c.linkedTopicId = b.linkedTopicId;
// //                 }
// //                 if (b.type === 'section') c.title = b.title || 'Untitled Section';
// //                 if (b.type === 'info') c.content = b.content || '';
// //                 if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
// //                 if (b.type === 'mcq') {
// //                     c.options = b.options || ['', '', '', ''];
// //                     c.correctOption = b.correctOption || 0;
// //                 }
// //                 return c;
// //             });

// //             const payload = {
// //                 title, type, cohortId, scheduledDate, instructions: instructions || '',
// //                 moduleInfo, showModuleHeader,
// //                 learnerGuide: {
// //                     note: learnerNote, purpose: modulePurpose, entryRequirements,
// //                     providerRequirements, exemptions, assessmentInfo: instructions
// //                 },
// //                 topics, blocks: sanitizedBlocks, totalMarks,
// //                 facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
// //             };

// //             await setDoc(doc(db, 'assessments', assessmentId), payload, { merge: true });
// //             setSaveStatus('saved');
// //             setLastSaved(new Date());
// //         } catch (err: any) {
// //             console.error('Auto-save failed:', err);
// //             setSaveStatus('unsaved');
// //         }
// //     };

// //     // ── SAVE LOGIC ──
// //     const handleSave = async (status: 'draft' | 'active') => {
// //         if (!title.trim()) return alert('Please enter a Workbook Title.');
// //         if (!cohortId) return alert('Please select a Cohort.');

// //         setLoading(true);
// //         setSaveStatus('saving');

// //         try {
// //             const sanitizedBlocks = blocks.map(b => {
// //                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
// //                 if (b.linkedTopicId) {
// //                     const t = topics.find(topic => topic.id === b.linkedTopicId);
// //                     if (t) c.linkedTopicCode = t.code;
// //                     c.linkedTopicId = b.linkedTopicId;
// //                 }
// //                 if (b.type === 'section') c.title = b.title || 'Untitled Section';
// //                 if (b.type === 'info') c.content = b.content || '';
// //                 if (b.type === 'text' || b.type === 'mcq') c.question = b.question || '';
// //                 if (b.type === 'mcq') {
// //                     c.options = b.options || ['', '', '', ''];
// //                     c.correctOption = b.correctOption || 0;
// //                 }
// //                 return c;
// //             });

// //             const payload = {
// //                 title, type, cohortId, scheduledDate, instructions: instructions || '',
// //                 moduleInfo, showModuleHeader,
// //                 learnerGuide: {
// //                     note: learnerNote, purpose: modulePurpose, entryRequirements,
// //                     providerRequirements, exemptions, assessmentInfo: instructions
// //                 },
// //                 topics, blocks: sanitizedBlocks, totalMarks, status,
// //                 facilitatorId: user?.uid, lastUpdated: new Date().toISOString(), isWorkbook: true,
// //             };

// //             if (assessmentId) {
// //                 await setDoc(doc(db, 'assessments', assessmentId), payload, { merge: true });
// //                 setSaveStatus('saved');
// //                 setLastSaved(new Date());
// //                 alert("Changes saved successfully!");
// //             } else {
// //                 const docRef = await addDoc(collection(db, 'assessments'), {
// //                     ...payload,
// //                     createdAt: new Date().toISOString(),
// //                     createdBy: user?.fullName || 'Facilitator',
// //                 });
// //                 setSaveStatus('saved');
// //                 setLastSaved(new Date());
// //                 alert("Workbook created successfully!");
// //                 navigate(`/facilitator/assessments/builder/${docRef.id}`, { replace: true });
// //             }
// //         } catch (err: any) {
// //             console.error(err);
// //             setSaveStatus('unsaved');
// //             alert(`Failed to save: ${err.message}`);
// //         } finally {
// //             setLoading(false);
// //         }
// //     };

// //     const scrollTo = (id: string) => {
// //         setFocusedBlock(id);
// //         document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
// //     };

// //     return (
// //         <div className="ab-root animate-fade-in">
// //             <header className="ab-topbar">
// //                 <button className="ab-back-btn" onClick={() => navigate(-1)}>
// //                     <ArrowLeft size={18} />
// //                     <span>Back</span>
// //                 </button>
// //                 <div className="ab-topbar-centre">
// //                     <BookOpen size={16} className="ab-topbar-icon" />
// //                     <span className="ab-topbar-title">{title || 'Untitled Workbook'}</span>
// //                     <span className={`ab-topbar-badge ${type}`}>{type}</span>
// //                 </div>
// //                 <div className="ab-topbar-actions">
// //                     <div className="ab-stats-pill">
// //                         <span><strong>{qCount}</strong> Qs</span>
// //                         <div className="ab-sdiv" />
// //                         <span><strong>{totalMarks}</strong> marks</span>
// //                     </div>

// //                     <div className={`ab-save-status ${saveStatus}`}>
// //                         {saveStatus === 'saved' && (
// //                             <>
// //                                 <Check size={14} />
// //                                 <span>Saved</span>
// //                                 {lastSaved && <span className="ab-save-time">{new Date(lastSaved).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
// //                             </>
// //                         )}
// //                         {saveStatus === 'saving' && <><div className="ab-spinner" /><span>Saving...</span></>}
// //                         {saveStatus === 'unsaved' && <><AlertTriangle size={14} /><span>Unsaved</span></>}
// //                     </div>

// //                     <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
// //                         {loading ? 'Saving...' : 'Save Draft'}
// //                     </button>
// //                     <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
// //                         <Zap size={15} />
// //                         {assessmentId ? 'Update' : 'Publish'}
// //                     </button>
// //                 </div>
// //             </header>

// //             <div className="ab-body">
// //                 <aside className="ab-sidebar">
// //                     <nav className="ab-sidebar-nav">
// //                         {([
// //                             { id: 'settings', icon: <Settings size={14} />, label: 'Settings' },
// //                             { id: 'module', icon: <GraduationCap size={14} />, label: 'Module' },
// //                             { id: 'topics', icon: <ListChecks size={14} />, label: 'Topics' },
// //                             { id: 'guide', icon: <BookMarked size={14} />, label: 'Guide' },
// //                             { id: 'outline', icon: <Eye size={14} />, label: 'Outline' },
// //                         ] as const).map(t => (
// //                             <button
// //                                 key={t.id}
// //                                 className={`ab-nav-btn ${activePanel === t.id ? 'active' : ''}`}
// //                                 onClick={() => setActivePanel(t.id)}
// //                             >
// //                                 {t.icon}
// //                                 <span>{t.label}</span>
// //                             </button>
// //                         ))}
// //                     </nav>

// //                     <div className="ab-sidebar-body">
// //                         {/* 1. SETTINGS */}
// //                         {activePanel === 'settings' && (
// //                             <>
// //                                 <SectionHdr icon={<BookOpen size={13} />} label="Workbook Metadata" />
// //                                 <FG label="Title">
// //                                     <input className="ab-input" value={title} onChange={e => setTitle(e.target.value)} />
// //                                 </FG>
// //                                 <FG label="Cohort">
// //                                     <div className="ab-sel-wrap">
// //                                         <select className="ab-input ab-sel" value={cohortId} onChange={e => setCohortId(e.target.value)}>
// //                                             <option value="">Select cohort...</option>
// //                                             {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// //                                         </select>
// //                                         <ChevronDown size={12} className="ab-sel-arr" />
// //                                     </div>
// //                                 </FG>
// //                                 <FG label="Scheduled Date">
// //                                     <div style={{ position: 'relative' }}>
// //                                         <input
// //                                             type="date"
// //                                             className="ab-input"
// //                                             value={scheduledDate}
// //                                             onChange={e => setScheduledDate(e.target.value)}
// //                                             style={{ paddingLeft: '2.4rem' }}
// //                                         />
// //                                         <Calendar size={14} style={{ position: 'absolute', left: '0.8rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
// //                                     </div>
// //                                 </FG>
// //                                 <FG label="Type">
// //                                     <div className="ab-type-tog">
// //                                         <button className={`ab-type-btn ${type === 'formative' ? 'active' : ''}`} onClick={() => setType('formative')}>Formative</button>
// //                                         <button className={`ab-type-btn ${type === 'summative' ? 'active' : ''}`} onClick={() => setType('summative')}>Summative</button>
// //                                     </div>
// //                                 </FG>
// //                                 <SectionHdr icon={<ClipboardList size={13} />} label="Instructions" />
// //                                 <textarea className="ab-input ab-textarea" rows={5} value={instructions} onChange={e => setInstructions(e.target.value)} />
// //                             </>
// //                         )}

// //                         {/* 2. MODULE */}
// //                         {activePanel === 'module' && (
// //                             <>
// //                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                     <SectionHdr icon={<GraduationCap size={13} />} label="Module Header" />
// //                                     <button className={`ab-toggle-icon ${!showModuleHeader ? 'off' : ''}`} onClick={() => setShowModuleHeader(!showModuleHeader)}>
// //                                         {showModuleHeader ? <Eye size={14} /> : <EyeOff size={14} />}
// //                                     </button>
// //                                 </div>
// //                                 {showModuleHeader ? (
// //                                     <div className="animate-fade-in">
// //                                         <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
// //                                             <button className="ab-text-btn danger" onClick={resetModuleInfo}><RotateCcw size={12} /> Clear</button>
// //                                         </div>
// //                                         <FG label="Qualification Title">
// //                                             <input className="ab-input" value={moduleInfo.qualificationTitle} onChange={e => setModuleInfo({ ...moduleInfo, qualificationTitle: e.target.value })} />
// //                                         </FG>
// //                                         <FG label="Module Number">
// //                                             <input className="ab-input" value={moduleInfo.moduleNumber} onChange={e => setModuleInfo({ ...moduleInfo, moduleNumber: e.target.value })} />
// //                                         </FG>
// //                                         <div className="ab-meta-grid-inputs">
// //                                             <FG label="Credits"><input type="number" className="ab-input" value={moduleInfo.credits} onChange={e => setModuleInfo({ ...moduleInfo, credits: Number(e.target.value) })} /></FG>
// //                                             <FG label="Hours"><input type="number" className="ab-input" value={moduleInfo.notionalHours} onChange={e => setModuleInfo({ ...moduleInfo, notionalHours: Number(e.target.value) })} /></FG>
// //                                         </div>
// //                                         <div className="ab-meta-grid-inputs">
// //                                             <FG label="Occ. Code"><input className="ab-input" value={moduleInfo.occupationalCode} onChange={e => setModuleInfo({ ...moduleInfo, occupationalCode: e.target.value })} /></FG>
// //                                             <FG label="SAQA ID"><input className="ab-input" value={moduleInfo.saqaQualId} onChange={e => setModuleInfo({ ...moduleInfo, saqaQualId: e.target.value })} /></FG>
// //                                         </div>
// //                                         <FG label="NQF Level"><input className="ab-input" value={moduleInfo.nqfLevel} onChange={e => setModuleInfo({ ...moduleInfo, nqfLevel: e.target.value })} /></FG>
// //                                         <SectionHdr icon={<Info size={13} />} label="Standard Text" />
// //                                         <p className="ab-prose sm">{learnerNote}</p>
// //                                         <p className="ab-prose sm" style={{ marginTop: '0.5rem' }}>{modulePurpose}</p>
// //                                     </div>
// //                                 ) : (
// //                                     <div className="ab-hidden-state"><EyeOff size={24} /><p>Header hidden.</p></div>
// //                                 )}
// //                             </>
// //                         )}

// //                         {/* 3. TOPICS */}
// //                         {activePanel === 'topics' && (
// //                             <TopicsPanel
// //                                 topics={topics} coveredTopicIds={coveredTopicIds} editingTopicId={editingTopicId} editDraft={editDraft}
// //                                 addingTopic={addingTopic} newTopic={newTopic} deleteConfirmId={deleteConfirmId}
// //                                 onStartEdit={startEdit} onEditChange={p => setEditDraft(d => ({ ...d, ...p }))} onCommitEdit={commitEdit} onCancelEdit={cancelEdit}
// //                                 onConfirmDelete={confirmDelete} onExecuteDelete={executeDelete} onCancelDelete={cancelDelete}
// //                                 onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }} onNewTopicChange={p => setNewTopic(d => ({ ...d, ...p }))}
// //                                 onCommitAdd={commitAdd} onCancelAdd={cancelAdd}
// //                                 onAddBlock={(bt, tid) => { addBlock(bt, tid); setActivePanel('outline'); }}
// //                             />
// //                         )}

// //                         {/* 4. LEARNER GUIDE */}
// //                         {activePanel === 'guide' && (
// //                             <>
// //                                 <SectionHdr icon={<BookMarked size={13} />} label="Learner Guide" />
// //                                 <FG label="Note to Learner"><textarea className="ab-input ab-textarea" rows={4} value={learnerNote} onChange={e => setLearnerNote(e.target.value)} /></FG>
// //                                 <FG label="Module Purpose"><textarea className="ab-input ab-textarea" rows={4} value={modulePurpose} onChange={e => setModulePurpose(e.target.value)} /></FG>
// //                                 <FG label="Entry Requirements"><textarea className="ab-input ab-textarea" rows={2} value={entryRequirements} onChange={e => setEntryRequirements(e.target.value)} /></FG>
// //                                 <FG label="Provider Requirements"><textarea className="ab-input ab-textarea" rows={8} value={providerRequirements} onChange={e => setProviderRequirements(e.target.value)} /></FG>
// //                                 <FG label="Exemptions"><textarea className="ab-input ab-textarea" rows={2} value={exemptions} onChange={e => setExemptions(e.target.value)} /></FG>
// //                             </>
// //                         )}

// //                         {/* 5. OUTLINE */}
// //                         {activePanel === 'outline' && (
// //                             <>
// //                                 <SectionHdr icon={<Eye size={13} />} label="Outline" />
// //                                 {blocks.length === 0 ? <p className="ab-prose sm">No blocks yet.</p> : <ol className="ab-outline-list">
// //                                     {blocks.map((b, i) => (
// //                                         <li key={b.id} className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`} onClick={() => scrollTo(b.id)}>
// //                                             <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
// //                                             <div className="ab-ol-text">
// //                                                 <span className="ab-ol-main">
// //                                                     {b.type === 'section' ? (b.title || 'Section') : b.type === 'info' ? 'Reading Material' : (b.question?.slice(0, 40) || `Question ${i + 1}`)}
// //                                                 </span>
// //                                             </div>
// //                                         </li>
// //                                     ))}
// //                                 </ol>}
// //                             </>
// //                         )}
// //                     </div>
// //                 </aside>

// //                 <main className="ab-canvas">
// //                     {showModuleHeader && (
// //                         <div className="ab-module-card clickable" onClick={() => setActivePanel('module')}>
// //                             <div className="ab-mc-left">
// //                                 <div className="ab-mc-badges">
// //                                     <span className="ab-mc-b nqf">{moduleInfo.nqfLevel}</span>
// //                                     <span className="ab-mc-b cr">{moduleInfo.credits} Credits</span>
// //                                     <span className="ab-mc-b hr">{moduleInfo.notionalHours}h</span>
// //                                     <span className={`ab-mc-b type-${type}`}>{type}</span>
// //                                 </div>
// //                                 <h1 className="ab-mc-title">{title || 'Untitled Workbook'}</h1>
// //                                 <p className="ab-mc-sub">{moduleInfo.qualificationTitle} · {moduleInfo.moduleNumber}</p>
// //                             </div>
// //                             <div className="ab-mc-right">
// //                                 <div className="ab-mc-stat"><span className="ab-mc-val">{qCount}</span><span className="ab-mc-lbl">Qs</span></div>
// //                                 <div className="ab-mc-div" />
// //                                 <div className="ab-mc-stat"><span className="ab-mc-val">{totalMarks}</span><span className="ab-mc-lbl">Marks</span></div>
// //                             </div>
// //                             <div className="ab-mc-edit-hint"><Pencil size={12} /> Edit</div>
// //                         </div>
// //                     )}

// //                     {blocks.length === 0 ? <EmptyCanvas onAdd={addBlock} /> : (
// //                         <div className="ab-blocks-list">
// //                             {blocks.map((b, idx) => (
// //                                 <BlockCard
// //                                     key={b.id} block={b} index={idx} total={blocks.length} topics={topics}
// //                                     focused={focusedBlock === b.id} onFocus={() => setFocusedBlock(b.id)}
// //                                     onUpdate={updateBlock} onUpdateOption={updateOption}
// //                                     onRemove={removeBlock} onMove={moveBlock}
// //                                 />
// //                             ))}
// //                         </div>
// //                     )}

// //                     <div className="ab-add-toolbar">
// //                         <span className="ab-add-label">Insert</span>
// //                         {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
// //                             <button key={bt} className="ab-add-btn" style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties} onClick={() => addBlock(bt)}>
// //                                 {BLOCK_META[bt].icon}<span>{BLOCK_META[bt].label}</span>
// //                             </button>
// //                         ))}
// //                     </div>
// //                 </main>
// //             </div>

// //             {deleteConfirmId && (
// //                 <DeleteOverlay
// //                     topic={topics.find(t => t.id === deleteConfirmId)!}
// //                     linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
// //                     onConfirm={executeDelete} onCancel={cancelDelete}
// //                 />
// //             )}
// //         </div>
// //     );
// // };

// // // ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

// // interface TopicsPanelProps {
// //     topics: Topic[]; coveredTopicIds: Set<string>;
// //     editingTopicId: string | null; editDraft: Partial<Topic>;
// //     addingTopic: boolean; newTopic: Partial<Topic>;
// //     deleteConfirmId: string | null;
// //     onStartEdit: (t: Topic) => void; onEditChange: (p: Partial<Topic>) => void;
// //     onCommitEdit: () => void; onCancelEdit: () => void;
// //     onConfirmDelete: (id: string) => void; onExecuteDelete: () => void; onCancelDelete: () => void;
// //     onStartAdd: () => void; onNewTopicChange: (p: Partial<Topic>) => void;
// //     onCommitAdd: () => void; onCancelAdd: () => void;
// //     onAddBlock: (bt: BlockType, tid: string) => void;
// // }

// // const TopicsPanel: React.FC<TopicsPanelProps> = (props) => (
// //     <>
// //         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //             <SectionHdr icon={<ListChecks size={13} />} label="Topic Elements" />
// //             {!props.addingTopic && <button className="ab-tadd-icon-btn" onClick={props.onStartAdd}><Plus size={14} /></button>}
// //         </div>
// //         {props.addingTopic && (
// //             <div className="ab-topic-form">
// //                 <div className="ab-topic-form-row">
// //                     <input className="ab-input sm" placeholder="Code" value={props.newTopic.code || ''} onChange={e => props.onNewTopicChange({ code: e.target.value })} />
// //                     <input className="ab-input sm" placeholder="Weight" style={{ width: '60px' }} value={props.newTopic.weight || ''} onChange={e => props.onNewTopicChange({ weight: e.target.value })} />
// //                 </div>
// //                 <textarea className="ab-input sm" rows={2} placeholder="Description..." value={props.newTopic.title || ''} onChange={e => props.onNewTopicChange({ title: e.target.value })} />
// //                 <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 5, marginTop: 5 }}>
// //                     <button className="ab-text-btn" onClick={props.onCancelAdd}>Cancel</button>
// //                     <button className="ab-btn sm ab-btn-primary" onClick={props.onCommitAdd}>Add</button>
// //                 </div>
// //             </div>
// //         )}
// //         <div className="ab-topics-list">
// //             {props.topics.map((t: Topic) => {
// //                 const covered = props.coveredTopicIds.has(t.id);
// //                 const isEditing = props.editingTopicId === t.id;
// //                 if (isEditing) return (
// //                     <div key={t.id} className="ab-topic-row editing">
// //                         <div className="ab-topic-edit-fields">
// //                             <input className="ab-topic-edit-input" value={props.editDraft.code || ''} onChange={e => props.onEditChange({ code: e.target.value })} />
// //                             <input className="ab-topic-edit-input" value={props.editDraft.title || ''} onChange={e => props.onEditChange({ title: e.target.value })} />
// //                         </div>
// //                         <div className="ab-topic-edit-actions">
// //                             <button onClick={props.onCommitEdit} className="ab-te-btn save"><Check size={14} /></button>
// //                             <button onClick={props.onCancelEdit} className="ab-te-btn cancel"><X size={14} /></button>
// //                         </div>
// //                     </div>
// //                 );
// //                 return (
// //                     <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
// //                         <div className="ab-topic-main">
// //                             <div className="ab-topic-top-row">
// //                                 <span className="ab-topic-code">{t.code}</span>
// //                                 <span className="ab-topic-weight">{t.weight}</span>
// //                             </div>
// //                             <span className="ab-topic-title">{t.title}</span>
// //                         </div>
// //                         <div className="ab-topic-actions">
// //                             <button className="ab-tadd-btn" onClick={() => props.onAddBlock('text', t.id)}>+Q</button>
// //                             <button className="ab-tadd-btn reading" onClick={() => props.onAddBlock('info', t.id)}>+R</button>
// //                             <button className="ab-icon-action" onClick={() => props.onStartEdit(t)}><Pencil size={12} /></button>
// //                             <button className="ab-icon-action danger" onClick={() => props.onConfirmDelete(t.id)}><Trash2 size={12} /></button>
// //                         </div>
// //                     </div>
// //                 );
// //             })}
// //         </div>
// //     </>
// // );

// // interface BlockCardProps {
// //     block: AssessmentBlock; index: number; total: number; focused: boolean; topics: Topic[];
// //     onFocus: () => void; onUpdate: (id: string, field: keyof AssessmentBlock, val: string | number | undefined) => void;
// //     onUpdateOption: (bid: string, idx: number, val: string) => void; onRemove: (id: string) => void; onMove: (id: string, dir: 'up' | 'down') => void;
// // }

// // const BlockCard: React.FC<BlockCardProps> = ({ block, index, total, focused, topics, onFocus, onUpdate, onUpdateOption, onRemove, onMove }) => {
// //     const meta = BLOCK_META[block.type];
// //     const topic = topics.find((t: Topic) => t.id === block.linkedTopicId);
// //     return (
// //         <div id={`block-${block.id}`} className={`ab-block ${focused ? 'is-focused' : ''}`} style={{ '--block-accent': meta.color } as React.CSSProperties} onClick={onFocus}>
// //             <div className="ab-block-strip" style={{ background: meta.color }} />
// //             <div className="ab-block-ctrl-row">
// //                 <div className="ab-block-left">
// //                     <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>{meta.icon}{meta.label}</span>
// //                     {topic && <span className="ab-block-topic-tag">{topic.code}</span>}
// //                 </div>
// //                 <div className="ab-block-actions">
// //                     <button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }} disabled={index === 0}>↑</button>
// //                     <button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }} disabled={index === total - 1}>↓</button>
// //                     <button className="ab-ctrl-btn ab-ctrl-del" onClick={e => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button>
// //                 </div>
// //             </div>
// //             {block.type === 'section' && <input className="ab-section-input" value={block.title || ''} placeholder="Section title..." onChange={e => onUpdate(block.id, 'title', e.target.value)} onClick={e => e.stopPropagation()} />}
// //             {block.type === 'info' && <div className="ab-info-body"><textarea className="ab-textarea-block" rows={5} value={block.content || ''} onChange={e => onUpdate(block.id, 'content', e.target.value)} onClick={e => e.stopPropagation()} /></div>}
// //             {(block.type === 'text' || block.type === 'mcq') && (
// //                 <div className="ab-q-body">
// //                     <div className="ab-q-top">
// //                         <span className="ab-q-num">Q{index + 1}</span>
// //                         <div className="ab-marks-stepper">
// //                             <button className="ab-step-btn" onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
// //                             <span className="ab-step-val">{block.marks}</span>
// //                             <button className="ab-step-btn" onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
// //                         </div>
// //                         <div className="ab-topic-sel-wrap">
// //                             <select className="ab-topic-sel" value={block.linkedTopicId || ''} onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)} onClick={e => e.stopPropagation()}>
// //                                 <option value="">Link topic…</option>
// //                                 {topics.map((t: Topic) => <option key={t.id} value={t.id}>{t.code}</option>)}
// //                             </select>
// //                             <ChevronDown size={11} className="ab-topic-sel-arr" />
// //                         </div>
// //                     </div>
// //                     <textarea className="ab-q-input" rows={2} value={block.question || ''} onChange={e => onUpdate(block.id, 'question', e.target.value)} onClick={e => e.stopPropagation()} placeholder="Type question here..." />
// //                     {block.type === 'text' && <div className="ab-answer-placeholder"><FileText size={14} /><span>Learner types answer here</span></div>}
// //                     {block.type === 'mcq' && <div className="ab-mcq-opts">{block.options?.map((opt, i) => (
// //                         <div key={i} className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`} onClick={e => { e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}>
// //                             <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
// //                             <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
// //                             <input className="ab-opt-input" value={opt} placeholder={`Option ${String.fromCharCode(65 + i)}`} onChange={e => { e.stopPropagation(); onUpdateOption(block.id, i, e.target.value); }} onClick={e => e.stopPropagation()} />
// //                             {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
// //                         </div>
// //                     ))}</div>}
// //                 </div>
// //             )}
// //         </div>
// //     );
// // };

// // const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void }> = ({ topic, linkedCount, onConfirm, onCancel }) => (
// //     <div className="ab-overlay-backdrop" onClick={onCancel}>
// //         <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
// //             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
// //             <h3 className="ab-dd-title">Delete Topic?</h3>
// //             <p className="ab-dd-topic"><strong>{topic.code}</strong>: {topic.title}</p>
// //             {linkedCount > 0 && <p className="ab-dd-warning">{linkedCount} block(s) will be unlinked.</p>}
// //             <div className="ab-dd-actions">
// //                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
// //                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}><Trash2 size={14} /> Delete</button>
// //             </div>
// //         </div>
// //     </div>
// // );

// // const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (<div className="ab-section-hdr">{icon}<span>{label}</span></div>);
// // const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (<div className="ab-fg">{label && <label className="ab-fg-label">{label}</label>}{children}</div>);
// // const EmptyCanvas: React.FC<{ onAdd: (t: BlockType) => void }> = ({ onAdd }) => (
// //     <div className="ab-empty-canvas">
// //         <div className="ab-empty-inner">
// //             <div className="ab-empty-icon"><BookOpen size={30} /></div>
// //             <h2 className="ab-empty-title">Drafting Surface</h2>
// //             <p className="ab-empty-sub">Choose a block type to begin</p>
// //             <div className="ab-empty-grid">
// //                 {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
// //                     <button key={bt} className="ab-empty-card" style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties} onClick={() => onAdd(bt)}>
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


// // // import React, { useState, useRef, useEffect } from 'react';
// // // import { useNavigate } from 'react-router-dom';
// // // import { useStore } from '../../store/useStore';
// // // import {
// // //     ArrowLeft, Trash2, AlignLeft, CheckSquare,
// // //     Layout, Info, ChevronDown, BookOpen, FileText,
// // //     Zap, Eye, Settings, GraduationCap, ListChecks,
// // //     ClipboardList, Building2, ShieldCheck, BookMarked,
// // //     Plus, Pencil, Check, X, GripVertical, AlertTriangle,
// // //     SquarePen,
// // //     Save
// // // } from 'lucide-react';
// // // import { collection, addDoc } from 'firebase/firestore';
// // // import { db } from '../../lib/firebase';
// // // import './FacilitatorDashboard.css';


// // // // ─── TYPES ────────────────────────────────────────────────────────────────────
// // // type BlockType = 'section' | 'info' | 'mcq' | 'text';
// // // type SidebarPanel = 'settings' | 'module' | 'topics' | 'outline';

// // // interface Topic {
// // //     id: string;       // stable internal id
// // //     code: string;     // e.g. KM-01-KT01
// // //     title: string;
// // //     weight: string;   // e.g. 5%
// // // }

// // // interface AssessmentBlock {
// // //     id: string; type: BlockType;
// // //     title?: string; content?: string; question?: string;
// // //     marks?: number; options?: string[]; correctOption?: number;
// // //     linkedTopicId?: string; // references Topic.id (stable even after code edits)
// // // }

// // // // ─── DEFAULTS ─────────────────────────────────────────────────────────────────
// // // const MODULE_INFO = {
// // //     title: 'Computers and Computing Systems',
// // //     nqfLevel: 'Level 4', credits: 12, notionalHours: 120,
// // //     moduleNumber: '251201-005-00-KM-01',
// // //     occupationalCode: '251201005', saqaQualId: '118707',
// // //     qualificationTitle: 'Occupational Certificate: Software Developer',
// // // };

// // // const LEARNER_NOTE = `This Learner Guide provides a comprehensive overview of the module. It is designed to improve the skills and knowledge of learners, and thus enabling them to effectively and efficiently complete specific tasks.`;
// // // const MODULE_PURPOSE = `The main focus of the learning in this knowledge module is to build an understanding of what computers can do and the processes that make them function in terms of the four major parts: input, output, CPU (central processing unit) and memory. It gives an overview of networks and connectivity as well as security issues pertaining to IT ecosystems.`;
// // // const ASSESSMENT_NOTE = `The only way to establish whether you are competent and have accomplished the learning outcomes is through continuous assessments. This process involves interpreting evidence about your ability to perform certain tasks.\n\nThis module includes self-evaluations, activities and exercises done in pairs, groups or individually. These must be handed to the facilitator and added to your portfolio of evidence.`;

// // // const mkId = () => `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// // // const DEFAULT_TOPICS: Topic[] = [
// // //     { id: mkId(), code: 'KM-01-KT01', title: 'Problem solving skills for IT Professionals', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT02', title: 'Techniques for safety', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT03', title: 'System components', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT04', title: 'Motherboards', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT05', title: 'Processors', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT06', title: 'Memory', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT07', title: 'BIOS and CMOS', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT08', title: 'Hard drives and storage devices', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT09', title: 'Power supplies and voltage', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT10', title: 'Ports, cables, and connectors', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT11', title: 'Networking and network operating systems', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT12', title: 'Networking and wireless connections', weight: '3%' },
// // //     { id: mkId(), code: 'KM-01-KT13', title: 'Input and output devices', weight: '3%' },
// // //     { id: mkId(), code: 'KM-01-KT14', title: 'Installing and managing printers', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT15', title: 'Mobile devices, multimedia, and laptop computers', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT16', title: 'Preventative maintenance', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT17', title: 'Troubleshooting procedures', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT18', title: 'Operating systems', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT19', title: 'Managing files', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT20', title: 'Applications utility, troubleshooting, and optimization', weight: '2%' },
// // //     { id: mkId(), code: 'KM-01-KT21', title: 'Configuring device drivers', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT22', title: 'Recovery', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT23', title: 'Cloud computing', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT24', title: 'Security fundamentals', weight: '5%' },
// // //     { id: mkId(), code: 'KM-01-KT25', title: 'Programming and development', weight: '5%' },
// // // ];

// // // const BLOCK_META: Record<BlockType, { label: string; color: string; icon: React.ReactNode; desc: string }> = {
// // //     section: { label: 'Section', color: '#6366f1', icon: <Layout size={14} />, desc: 'Organises blocks under a heading' },
// // //     info: { label: 'Reading Material', color: '#0ea5e9', icon: <Info size={14} />, desc: 'Context or learning material' },
// // //     text: { label: 'Open Answer', color: '#f59e0b', icon: <AlignLeft size={14} />, desc: 'Free-text response question' },
// // //     mcq: { label: 'Multiple Choice', color: '#10b981', icon: <CheckSquare size={14} />, desc: 'Select the correct option' },
// // // };

// // // // ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
// // // export const AssessmentBuilder: React.FC = () => {
// // //     const navigate = useNavigate();
// // //     // const { user, cohorts } = useStore();
// // //     const { user, cohorts, fetchCohorts } = useStore();

// // //     const [loading, setLoading] = useState(false);
// // //     const [activePanel, setActivePanel] = useState<SidebarPanel>('settings');
// // //     const [focusedBlock, setFocusedBlock] = useState<string | null>(null);

// // //     // settings
// // //     const [title, setTitle] = useState(MODULE_INFO.title);
// // //     const [cohortId, setCohortId] = useState('');
// // //     const [instructions, setInstructions] = useState(ASSESSMENT_NOTE);
// // //     const [type, setType] = useState<'formative' | 'summative'>('formative');

// // //     // content
// // //     const [blocks, setBlocks] = useState<AssessmentBlock[]>([]);

// // //     // ── TOPICS STATE (was static constants, now fully editable) ──────────────
// // //     const [topics, setTopics] = useState<Topic[]>(DEFAULT_TOPICS);
// // //     const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
// // //     const [editDraft, setEditDraft] = useState<Partial<Topic>>({});
// // //     const [addingTopic, setAddingTopic] = useState(false);
// // //     const [newTopic, setNewTopic] = useState<Partial<Topic>>({ code: '', title: '', weight: '' });
// // //     const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

// // //     // ── Topic CRUD ────────────────────────────────────────────────────────────
// // //     const startEdit = (t: Topic) => {
// // //         setEditingTopicId(t.id);
// // //         setEditDraft({ code: t.code, title: t.title, weight: t.weight });
// // //         setAddingTopic(false);
// // //     };

// // //     const commitEdit = () => {
// // //         if (!editDraft.code?.trim() || !editDraft.title?.trim()) return;
// // //         setTopics(prev => prev.map(t =>
// // //             t.id === editingTopicId
// // //                 ? { ...t, code: editDraft.code!.trim(), title: editDraft.title!.trim(), weight: editDraft.weight?.trim() || '0%' }
// // //                 : t
// // //         ));
// // //         setEditingTopicId(null);
// // //         setEditDraft({});
// // //     };

// // //     const cancelEdit = () => { setEditingTopicId(null); setEditDraft({}); };

// // //     const confirmDelete = (id: string) => setDeleteConfirmId(id);

// // //     const executDelete = () => {
// // //         if (!deleteConfirmId) return;
// // //         // unlink any blocks pointing to this topic
// // //         setBlocks(prev => prev.map(b =>
// // //             b.linkedTopicId === deleteConfirmId ? { ...b, linkedTopicId: undefined } : b
// // //         ));
// // //         setTopics(prev => prev.filter(t => t.id !== deleteConfirmId));
// // //         setDeleteConfirmId(null);
// // //     };

// // //     const cancelDelete = () => setDeleteConfirmId(null);

// // //     const commitAdd = () => {
// // //         if (!newTopic.code?.trim() || !newTopic.title?.trim()) return;
// // //         const fresh: Topic = {
// // //             id: mkId(),
// // //             code: newTopic.code.trim(),
// // //             title: newTopic.title.trim(),
// // //             weight: newTopic.weight?.trim() || '0%',
// // //         };
// // //         setTopics(prev => [...prev, fresh]);
// // //         setNewTopic({ code: '', title: '', weight: '' });
// // //         setAddingTopic(false);
// // //     };

// // //     useEffect(() => {
// // //         fetchCohorts();
// // //     }, [fetchCohorts]);

// // //     const cancelAdd = () => { setAddingTopic(false); setNewTopic({ code: '', title: '', weight: '' }); };

// // //     // ── Block handlers ────────────────────────────────────────────────────────
// // //     const addBlock = (bType: BlockType, linkedTopicId?: string) => {
// // //         const nb: AssessmentBlock = {
// // //             id: Date.now().toString(), type: bType, linkedTopicId,
// // //             title: bType === 'section' ? 'New Section' : '',
// // //             content: '', question: '',
// // //             marks: (bType === 'text' || bType === 'mcq') ? 5 : 0,
// // //             options: bType === 'mcq' ? ['', '', '', ''] : [],
// // //             correctOption: 0,
// // //         };
// // //         setBlocks(p => [...p, nb]);
// // //         setTimeout(() => {
// // //             setFocusedBlock(nb.id);
// // //             document.getElementById(`block-${nb.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
// // //         }, 60);
// // //     };

// // //     const updateBlock = (id: string, field: keyof AssessmentBlock, value: any) =>
// // //         setBlocks(p => p.map(b => b.id === id ? { ...b, [field]: value } : b));

// // //     const updateOption = (blockId: string, idx: number, val: string) =>
// // //         setBlocks(p => p.map(b => {
// // //             if (b.id !== blockId || !b.options) return b;
// // //             const o = [...b.options]; o[idx] = val; return { ...b, options: o };
// // //         }));

// // //     const removeBlock = (id: string) => {
// // //         if (window.confirm('Remove this block?')) { setBlocks(p => p.filter(b => b.id !== id)); setFocusedBlock(null); }
// // //     };

// // //     const moveBlock = (id: string, dir: 'up' | 'down') =>
// // //         setBlocks(p => {
// // //             const i = p.findIndex(b => b.id === id);
// // //             if (dir === 'up' && i === 0) return p;
// // //             if (dir === 'down' && i === p.length - 1) return p;
// // //             const n = [...p], sw = dir === 'up' ? i - 1 : i + 1;
// // //             [n[i], n[sw]] = [n[sw], n[i]]; return n;
// // //         });

// // //     const totalMarks = blocks.reduce((s, b) => s + (b.marks || 0), 0);
// // //     const qCount = blocks.filter(b => b.type === 'text' || b.type === 'mcq').length;
// // //     const coveredTopicIds = new Set(blocks.map(b => b.linkedTopicId).filter(Boolean) as string[]);

// // //     // ── Save ──────────────────────────────────────────────────────────────────
// // //     const handleSave = async (status: 'draft' | 'active') => {
// // //         if (!title.trim()) { alert('Please enter a Workbook Title.'); return; }
// // //         if (!cohortId) { alert('Please select a Cohort.'); return; }
// // //         setLoading(true);
// // //         try {
// // //             const sanitized = blocks.map(b => {
// // //                 const c: any = { id: b.id, type: b.type, marks: b.marks || 0 };
// // //                 if (b.linkedTopicId) {
// // //                     const t = topics.find(t => t.id === b.linkedTopicId);
// // //                     if (t) c.linkedTopic = t.code; // store human-readable code in Firestore
// // //                 }
// // //                 if (b.type === 'section') c.title = b.title || 'Untitled Section';
// // //                 if (b.type === 'info') c.content = b.content || '';
// // //                 if (b.type === 'text' || b.type === 'mcq') c.question = b.question || 'Untitled Question';
// // //                 if (b.type === 'mcq') { c.options = b.options || []; c.correctOption = b.correctOption || 0; }
// // //                 return c;
// // //             });
// // //             await addDoc(collection(db, 'assessments'), {
// // //                 title, type, cohortId, instructions: instructions || '',
// // //                 moduleInfo: MODULE_INFO,
// // //                 topics: topics.map(({ id, ...rest }) => rest), // strip internal id before storing
// // //                 blocks: sanitized, totalMarks, status,
// // //                 facilitatorId: user?.uid, createdAt: new Date().toISOString(),
// // //                 createdBy: user?.fullName || 'Facilitator', isWorkbook: true,
// // //             });
// // //             alert(`Workbook ${status === 'active' ? 'Published' : 'Saved as Draft'}!`);
// // //             navigate('/facilitator/assessments');
// // //         } catch (err: any) {
// // //             console.error(err); alert(`Failed to save: ${err.message}`);
// // //         } finally { setLoading(false); }
// // //     };

// // //     const scrollTo = (id: string) => {
// // //         setFocusedBlock(id);
// // //         document.getElementById(`block-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
// // //     };

// // //     // ─────────────────────────────────────────────────────────────────────────
// // //     return (
// // //         <div className="ab-root animate-fade-in">

// // //             {/* ── TOP BAR ── */}
// // //             <header className="ab-topbar">
// // //                 <button className="ab-back-btn" onClick={() => navigate(-1)}>
// // //                     <ArrowLeft size={18} /><span>Back</span>
// // //                 </button>
// // //                 <div className="ab-topbar-centre">
// // //                     <BookOpen size={16} className="ab-topbar-icon" />
// // //                     <span className="ab-topbar-title">{title || 'Untitled Workbook'}</span>
// // //                     <span className={`ab-topbar-badge ${type}`}>{type === 'formative' ? 'Formative' : 'Summative'}</span>
// // //                 </div>
// // //                 <div className="ab-topbar-actions">
// // //                     <div className="ab-stats-pill">
// // //                         <span><strong>{qCount}</strong> Qs</span>
// // //                         <div className="ab-sdiv" />
// // //                         <span><strong>{totalMarks}</strong> marks</span>
// // //                         <div className="ab-sdiv" />
// // //                         <span><strong>{coveredTopicIds.size}</strong>/{topics.length} topics</span>
// // //                     </div>
// // //                     <button className="ab-btn ab-btn-ghost" onClick={() => handleSave('draft')} disabled={loading}>
// // //                         {loading ? 'Saving…' : 'Save Draft'}
// // //                     </button>
// // //                     <button className="ab-btn ab-btn-primary" onClick={() => handleSave('active')} disabled={loading}>
// // //                         <Zap size={15} />{loading ? 'Publishing…' : 'Publish'}
// // //                     </button>
// // //                 </div>
// // //             </header>

// // //             <div className="ab-body">

// // //                 {/* ── SIDEBAR ── */}
// // //                 <aside className="ab-sidebar">
// // //                     <nav className="ab-sidebar-nav">
// // //                         {([
// // //                             { id: 'settings', icon: <Settings size={14} />, label: 'Settings' },
// // //                             { id: 'module', icon: <GraduationCap size={14} />, label: 'Module' },
// // //                             { id: 'topics', icon: <ListChecks size={14} />, label: `Topics (${topics.length})` },
// // //                             { id: 'outline', icon: <Eye size={14} />, label: 'Outline' },
// // //                         ] as { id: SidebarPanel; icon: React.ReactNode; label: string }[]).map(t => (
// // //                             <button key={t.id} className={`ab-nav-btn ${activePanel === t.id ? 'active' : ''}`}
// // //                                 onClick={() => setActivePanel(t.id)}>
// // //                                 {t.icon}<span>{t.label}</span>
// // //                             </button>
// // //                         ))}
// // //                     </nav>

// // //                     <div className="ab-sidebar-body">

// // //                         {/* ── SETTINGS ── */}
// // //                         {activePanel === 'settings' && <>
// // //                             <SectionHdr icon={<BookOpen size={13} />} label="Workbook Details" />
// // //                             <FG label="Title">
// // //                                 <input className="ab-input" type="text" placeholder="Workbook title…"
// // //                                     value={title} onChange={e => setTitle(e.target.value)} />
// // //                             </FG>
// // //                             <FG label="Cohort">
// // //                                 <div className="ab-sel-wrap">
// // //                                     <select className="ab-input ab-sel" value={cohortId} onChange={e => setCohortId(e.target.value)}>
// // //                                         <option value="">Select cohort…</option>
// // //                                         {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
// // //                                     </select>
// // //                                     <ChevronDown size={12} className="ab-sel-arr" />
// // //                                 </div>
// // //                             </FG>
// // //                             <FG label="Type">
// // //                                 <div className="ab-type-tog">
// // //                                     <button className={`ab-type-btn ${type === 'formative' ? 'active' : ''}`} onClick={() => setType('formative')}>Formative</button>
// // //                                     <button className={`ab-type-btn ${type === 'summative' ? 'active' : ''}`} onClick={() => setType('summative')}>Summative</button>
// // //                                 </div>
// // //                             </FG>
// // //                             <SectionHdr icon={<ClipboardList size={13} />} label="Learner Instructions" />
// // //                             <FG label="">
// // //                                 <textarea className="ab-input ab-textarea" rows={5}
// // //                                     placeholder="Instructions shown before learners begin…"
// // //                                     value={instructions} onChange={e => setInstructions(e.target.value)} />
// // //                             </FG>
// // //                             <div className="ab-score-card">
// // //                                 <div className="ab-score-row"><span>Questions</span><strong>{qCount}</strong></div>
// // //                                 <div className="ab-score-row"><span>Total Marks</span><strong className="ab-score-big">{totalMarks}</strong></div>
// // //                                 <div className="ab-score-row"><span>Topics covered</span><strong>{coveredTopicIds.size}/{topics.length}</strong></div>
// // //                             </div>
// // //                         </>}

// // //                         {/* ── MODULE ── */}
// // //                         {activePanel === 'module' && <>
// // //                             <SectionHdr icon={<GraduationCap size={13} />} label="Module Details" />
// // //                             <div className="ab-meta-grid">
// // //                                 <MC label="Module #" value={MODULE_INFO.moduleNumber} mono />
// // //                                 <MC label="NQF Level" value={MODULE_INFO.nqfLevel} />
// // //                                 <MC label="Credits" value={`Cr ${MODULE_INFO.credits}`} accent />
// // //                                 <MC label="Notional Hours" value={`${MODULE_INFO.notionalHours}h`} />
// // //                                 <MC label="Occ. Code" value={MODULE_INFO.occupationalCode} mono />
// // //                                 <MC label="SAQA Qual ID" value={MODULE_INFO.saqaQualId} mono />
// // //                             </div>
// // //                             <div className="ab-qual-box">
// // //                                 <span className="ab-qual-lbl">Qualification</span>
// // //                                 <span className="ab-qual-val">{MODULE_INFO.qualificationTitle}</span>
// // //                             </div>
// // //                             <SectionHdr icon={<Info size={13} />} label="Note to Learner" />
// // //                             <p className="ab-prose">{LEARNER_NOTE}</p>
// // //                             <SectionHdr icon={<BookMarked size={13} />} label="Purpose" />
// // //                             <p className="ab-prose">{MODULE_PURPOSE}</p>
// // //                             <SectionHdr icon={<ShieldCheck size={13} />} label="Entry Requirements" />
// // //                             <div className="ab-req-badge">NQF 4</div>
// // //                             <SectionHdr icon={<Building2 size={13} />} label="Provider Requirements" />
// // //                             <div className="ab-req-list">
// // //                                 <ReqGroup label="Physical" text="Lesson plans and structured learning material addressing all knowledge module topics. QCTO/MICT SETA requirements apply." />
// // //                                 <ReqGroup label="Human Resources" text="Lecturer:learner ratio 1:20 (max). NQF 6+ with 1 yr IT industry experience. AI vendor cert where applicable. Assessors & moderators accredited by MICT SETA." />
// // //                                 <ReqGroup label="Legal" text="Valid software licences, OHS compliance certificate, ethical clearance where required." />
// // //                                 <ReqGroup label="Exemptions" text="No exemptions, but the module can be achieved in full through a normal RPL process." />
// // //                                 <ReqGroup label="Venue / Time" text="Consult your facilitator for any venue or timetable changes." />
// // //                             </div>
// // //                             <SectionHdr icon={<ClipboardList size={13} />} label="Assessments" />
// // //                             <p className="ab-prose sm">{ASSESSMENT_NOTE}</p>
// // //                         </>}

// // //                         {/* ── TOPICS (FULL CRUD) ── */}
// // //                         {activePanel === 'topics' && (
// // //                             <TopicsPanel
// // //                                 topics={topics}
// // //                                 coveredTopicIds={coveredTopicIds}
// // //                                 editingTopicId={editingTopicId}
// // //                                 editDraft={editDraft}
// // //                                 addingTopic={addingTopic}
// // //                                 newTopic={newTopic}
// // //                                 deleteConfirmId={deleteConfirmId}
// // //                                 onStartEdit={startEdit}
// // //                                 onEditChange={patch => setEditDraft(d => ({ ...d, ...patch }))}
// // //                                 onCommitEdit={commitEdit}
// // //                                 onCancelEdit={cancelEdit}
// // //                                 onConfirmDelete={confirmDelete}
// // //                                 onExecuteDelete={executDelete}
// // //                                 onCancelDelete={cancelDelete}
// // //                                 onStartAdd={() => { setAddingTopic(true); setEditingTopicId(null); }}
// // //                                 onNewTopicChange={patch => setNewTopic(d => ({ ...d, ...patch }))}
// // //                                 onCommitAdd={commitAdd}
// // //                                 onCancelAdd={cancelAdd}
// // //                                 onAddBlock={(bType, topicId) => { addBlock(bType, topicId); setActivePanel('outline'); }}
// // //                             />
// // //                         )}

// // //                         {/* ── OUTLINE ── */}
// // //                         {activePanel === 'outline' && <>
// // //                             <SectionHdr icon={<Eye size={13} />} label="Workbook Outline" />
// // //                             {blocks.length === 0
// // //                                 ? <p className="ab-prose sm" style={{ fontStyle: 'italic' }}>No blocks yet.</p>
// // //                                 : <ol className="ab-outline-list">
// // //                                     {blocks.map((b, i) => {
// // //                                         const topic = topics.find(t => t.id === b.linkedTopicId);
// // //                                         return (
// // //                                             <li key={b.id}
// // //                                                 className={`ab-outline-item ${focusedBlock === b.id ? 'focused' : ''}`}
// // //                                                 onClick={() => scrollTo(b.id)}>
// // //                                                 <span className="ab-ol-dot" style={{ background: BLOCK_META[b.type].color }} />
// // //                                                 <div className="ab-ol-text">
// // //                                                     <span className="ab-ol-main">
// // //                                                         {b.type === 'section' && (b.title || 'Section')}
// // //                                                         {b.type === 'info' && 'Reading Material'}
// // //                                                         {(b.type === 'text' || b.type === 'mcq') && (b.question?.slice(0, 40) || `Question ${i + 1}`)}
// // //                                                     </span>
// // //                                                     {topic && <span className="ab-ol-topic">{topic.code}</span>}
// // //                                                 </div>
// // //                                                 {(b.type === 'text' || b.type === 'mcq') && (
// // //                                                     <span className="ab-ol-marks">{b.marks}m</span>
// // //                                                 )}
// // //                                             </li>
// // //                                         );
// // //                                     })}
// // //                                 </ol>
// // //                             }
// // //                         </>}
// // //                     </div>
// // //                 </aside>

// // //                 {/* ── CANVAS ── */}
// // //                 <main className="ab-canvas">
// // //                     <div className="ab-module-card">
// // //                         <div className="ab-mc-left">
// // //                             <div className="ab-mc-badges">
// // //                                 <span className="ab-mc-b nqf">NQF 4</span>
// // //                                 <span className="ab-mc-b cr">{MODULE_INFO.credits} Credits</span>
// // //                                 <span className="ab-mc-b hr">{MODULE_INFO.notionalHours}h Notional</span>
// // //                                 <span className={`ab-mc-b type-${type}`}>{type === 'formative' ? 'Formative' : 'Summative'}</span>
// // //                             </div>
// // //                             <h1 className="ab-mc-title">{title || 'Untitled Workbook'}</h1>
// // //                             <p className="ab-mc-sub">{MODULE_INFO.qualificationTitle} · {MODULE_INFO.moduleNumber}</p>
// // //                         </div>
// // //                         <div className="ab-mc-right">
// // //                             <div className="ab-mc-stat"><span className="ab-mc-val">{qCount}</span><span className="ab-mc-lbl">Questions</span></div>
// // //                             <div className="ab-mc-div" />
// // //                             <div className="ab-mc-stat"><span className="ab-mc-val">{totalMarks}</span><span className="ab-mc-lbl">Marks</span></div>
// // //                         </div>
// // //                     </div>

// // //                     {blocks.length === 0
// // //                         ? <EmptyCanvas onAdd={addBlock} />
// // //                         : <div className="ab-blocks-list">
// // //                             {blocks.map((b, idx) => (
// // //                                 <BlockCard key={b.id} block={b} index={idx} total={blocks.length}
// // //                                     topics={topics}
// // //                                     focused={focusedBlock === b.id}
// // //                                     onFocus={() => setFocusedBlock(b.id)}
// // //                                     onUpdate={updateBlock} onUpdateOption={updateOption}
// // //                                     onRemove={removeBlock} onMove={moveBlock} />
// // //                             ))}
// // //                         </div>
// // //                     }

// // //                     <div className="ab-add-toolbar">
// // //                         <span className="ab-add-label">Add block</span>
// // //                         {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
// // //                             <button key={bt} className="ab-add-btn"
// // //                                 style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
// // //                                 onClick={() => addBlock(bt)} title={BLOCK_META[bt].desc}>
// // //                                 {BLOCK_META[bt].icon}<span>{BLOCK_META[bt].label}</span>
// // //                             </button>
// // //                         ))}
// // //                     </div>
// // //                 </main>
// // //             </div>

// // //             {/* ── DELETE CONFIRM OVERLAY ── */}
// // //             {deleteConfirmId && (
// // //                 <DeleteOverlay
// // //                     topic={topics.find(t => t.id === deleteConfirmId)!}
// // //                     linkedCount={blocks.filter(b => b.linkedTopicId === deleteConfirmId).length}
// // //                     onConfirm={executDelete}
// // //                     onCancel={cancelDelete}
// // //                 />
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // // ─── TOPICS PANEL (extracted for clarity) ────────────────────────────────────
// // // interface TopicsPanelProps {
// // //     topics: Topic[];
// // //     coveredTopicIds: Set<string>;
// // //     editingTopicId: string | null;
// // //     editDraft: Partial<Topic>;
// // //     addingTopic: boolean;
// // //     newTopic: Partial<Topic>;
// // //     deleteConfirmId: string | null;
// // //     onStartEdit: (t: Topic) => void;
// // //     onEditChange: (patch: Partial<Topic>) => void;
// // //     onCommitEdit: () => void;
// // //     onCancelEdit: () => void;
// // //     onConfirmDelete: (id: string) => void;
// // //     onExecuteDelete: () => void;
// // //     onCancelDelete: () => void;
// // //     onStartAdd: () => void;
// // //     onNewTopicChange: (patch: Partial<Topic>) => void;
// // //     onCommitAdd: () => void;
// // //     onCancelAdd: () => void;
// // //     onAddBlock: (type: BlockType, topicId: string) => void;
// // // }

// // // const TopicsPanel: React.FC<TopicsPanelProps> = ({
// // //     topics, coveredTopicIds, editingTopicId, editDraft,
// // //     addingTopic, newTopic, onStartEdit, onEditChange,
// // //     onCommitEdit, onCancelEdit, onConfirmDelete, onStartAdd,
// // //     onNewTopicChange, onCommitAdd, onCancelAdd, onAddBlock,
// // // }) => {
// // //     const totalWeight = topics.reduce((s, t) => s + parseFloat(t.weight) || 0, 0);

// // //     return (
// // //         <>
// // //             {/* Header row */}
// // //             <div className="ab-topics-header">
// // //                 <SectionHdr icon={<ListChecks size={13} />} label={`Topic Elements · ${topics.length}`} />
// // //                 <div className="ab-topics-total-weight" title="Sum of all topic weights">
// // //                     {totalWeight.toFixed(0)}% total
// // //                 </div>
// // //             </div>

// // //             <p className="ab-prose sm tp-hint">
// // //                 <strong>Edit</strong> any topic inline. <strong>Delete</strong> removes it and unlinks related blocks. Use <strong>+Q</strong> / <strong>+R</strong> to add content.
// // //             </p>

// // //             {/* Topics list */}
// // //             <div className="ab-topics-list">
// // //                 {topics.map(t => {
// // //                     const covered = coveredTopicIds.has(t.id);
// // //                     const isEditing = editingTopicId === t.id;

// // //                     if (isEditing) {
// // //                         return (
// // //                             <div key={t.id} className="ab-topic-row editing">
// // //                                 <div className="ab-topic-edit-fields">
// // //                                     <div className="ab-topic-edit-row">
// // //                                         <input
// // //                                             className="ab-topic-edit-input code"
// // //                                             value={editDraft.code ?? ''}
// // //                                             onChange={e => onEditChange({ code: e.target.value })}
// // //                                             placeholder="Code e.g. KM-01-KT01"
// // //                                             autoFocus
// // //                                             onKeyDown={e => { if (e.key === 'Enter') onCommitEdit(); if (e.key === 'Escape') onCancelEdit(); }}
// // //                                         />
// // //                                         <input
// // //                                             className="ab-topic-edit-input weight"
// // //                                             value={editDraft.weight ?? ''}
// // //                                             onChange={e => onEditChange({ weight: e.target.value })}
// // //                                             placeholder="Weight e.g. 5%"
// // //                                             onKeyDown={e => { if (e.key === 'Enter') onCommitEdit(); if (e.key === 'Escape') onCancelEdit(); }}
// // //                                         />
// // //                                     </div>
// // //                                     <input
// // //                                         className="ab-topic-edit-input title"
// // //                                         value={editDraft.title ?? ''}
// // //                                         onChange={e => onEditChange({ title: e.target.value })}
// // //                                         placeholder="Topic title"
// // //                                         onKeyDown={e => { if (e.key === 'Enter') onCommitEdit(); if (e.key === 'Escape') onCancelEdit(); }}
// // //                                     />
// // //                                 </div>
// // //                                 <div className="ab-topic-edit-actions">
// // //                                     <button className="ab-te-btn save" onClick={onCommitEdit} title="Save (Enter)"><Check size={14} /></button>
// // //                                     <button className="ab-te-btn cancel" onClick={onCancelEdit} title="Cancel (Esc)"><X size={14} /></button>
// // //                                 </div>
// // //                             </div>
// // //                         );
// // //                     }

// // //                     return (
// // //                         <div key={t.id} className={`ab-topic-row ${covered ? 'covered' : ''}`}>
// // //                             <div className="ab-topic-main">
// // //                                 <div className="ab-topic-top-row">
// // //                                     <span className="ab-topic-code">{t.code}</span>
// // //                                     <span className="ab-topic-weight">{t.weight}</span>
// // //                                     {covered && <span className="ab-topic-tick" title="Has linked content">✓</span>}
// // //                                 </div>
// // //                                 <span className="ab-topic-title">{t.title}</span>
// // //                             </div>
// // //                             <div className="ab-topic-actions">
// // //                                 <button className="ab-tadd-btn" title="Add question" onClick={() => onAddBlock('text', t.id)}>+Q</button>
// // //                                 <button className="ab-tadd-btn info" title="Add reading" onClick={() => onAddBlock('info', t.id)}>+R</button>
// // //                                 <button className="ab-topic-icon-btn edit" title="Edit topic" onClick={() => onStartEdit(t)}>
// // //                                     <SquarePen size={12} />
// // //                                 </button>
// // //                                 <button className="ab-topic-icon-btn delete" title="Delete topic" onClick={() => onConfirmDelete(t.id)}>
// // //                                     <Trash2 size={12} />
// // //                                 </button>
// // //                             </div>
// // //                         </div>
// // //                     );
// // //                 })}

// // //                 {/* Add new topic form */}
// // //                 {addingTopic ? (
// // //                     <div className="ab-topic-row adding">
// // //                         <div className="ab-topic-edit-fields">
// // //                             <div className="ab-topic-edit-row">
// // //                                 <input
// // //                                     className="ab-topic-edit-input code"
// // //                                     value={newTopic.code ?? ''}
// // //                                     onChange={e => onNewTopicChange({ code: e.target.value })}
// // //                                     placeholder="Code e.g. KM-01-KT26"
// // //                                     autoFocus
// // //                                     onKeyDown={e => { if (e.key === 'Enter') onCommitAdd(); if (e.key === 'Escape') onCancelAdd(); }}
// // //                                 />
// // //                                 <input
// // //                                     className="ab-topic-edit-input weight"
// // //                                     value={newTopic.weight ?? ''}
// // //                                     onChange={e => onNewTopicChange({ weight: e.target.value })}
// // //                                     placeholder="5%"
// // //                                     onKeyDown={e => { if (e.key === 'Enter') onCommitAdd(); if (e.key === 'Escape') onCancelAdd(); }}
// // //                                 />
// // //                             </div>
// // //                             <input
// // //                                 className="ab-topic-edit-input title"
// // //                                 value={newTopic.title ?? ''}
// // //                                 onChange={e => onNewTopicChange({ title: e.target.value })}
// // //                                 placeholder="Topic title"
// // //                                 onKeyDown={e => { if (e.key === 'Enter') onCommitAdd(); if (e.key === 'Escape') onCancelAdd(); }}
// // //                             />
// // //                         </div>
// // //                         <div className="ab-topic-edit-actions">
// // //                             <button className="ab-te-btn save" onClick={onCommitAdd} title="Add (Enter)"><Check size={14} /></button>
// // //                             <button className="ab-te-btn cancel" onClick={onCancelAdd} title="Cancel (Esc)"><X size={14} /></button>
// // //                         </div>
// // //                     </div>
// // //                 ) : (
// // //                     <button className="ab-add-topic-btn" onClick={onStartAdd}>
// // //                         <Plus size={15} /> Add topic element
// // //                     </button>
// // //                 )}
// // //             </div>
// // //         </>
// // //     );
// // // };

// // // // ─── DELETE CONFIRMATION OVERLAY ──────────────────────────────────────────────
// // // const DeleteOverlay: React.FC<{ topic: Topic; linkedCount: number; onConfirm: () => void; onCancel: () => void }> = ({
// // //     topic, linkedCount, onConfirm, onCancel
// // // }) => (
// // //     <div className="ab-overlay-backdrop" onClick={onCancel}>
// // //         <div className="ab-delete-dialog" onClick={e => e.stopPropagation()}>
// // //             <div className="ab-dd-icon"><AlertTriangle size={22} /></div>
// // //             <h3 className="ab-dd-title">Delete Topic?</h3>
// // //             <div className="ab-dd-topic">
// // //                 <span className="ab-dd-code">{topic.code}</span>
// // //                 <span className="ab-dd-name">{topic.title}</span>
// // //             </div>
// // //             {linkedCount > 0 && (
// // //                 <div className="ab-dd-warning">
// // //                     <strong>{linkedCount} block{linkedCount > 1 ? 's' : ''}</strong> linked to this topic will be unlinked but not deleted.
// // //                 </div>
// // //             )}
// // //             <div className="ab-dd-actions">
// // //                 <button className="ab-btn ab-btn-ghost" onClick={onCancel}>Cancel</button>
// // //                 <button className="ab-btn ab-btn-danger" onClick={onConfirm}>
// // //                     <Trash2 size={14} /> Delete Topic
// // //                 </button>
// // //             </div>
// // //         </div>
// // //     </div>
// // // );

// // // // ─── BLOCK CARD ───────────────────────────────────────────────────────────────
// // // interface BCProps {
// // //     block: AssessmentBlock; index: number; total: number; focused: boolean;
// // //     topics: Topic[];
// // //     onFocus: () => void;
// // //     onUpdate: (id: string, field: keyof AssessmentBlock, val: any) => void;
// // //     onUpdateOption: (blockId: string, i: number, val: string) => void;
// // //     onRemove: (id: string) => void;
// // //     onMove: (id: string, dir: 'up' | 'down') => void;
// // // }

// // // const BlockCard: React.FC<BCProps> = ({ block, index, total, focused, topics, onFocus, onUpdate, onUpdateOption, onRemove, onMove }) => {
// // //     const meta = BLOCK_META[block.type];
// // //     const topic = topics.find(t => t.id === block.linkedTopicId);

// // //     return (
// // //         <div id={`block-${block.id}`}
// // //             className={`ab-block ${focused ? 'is-focused' : ''}`}
// // //             style={{ '--block-accent': meta.color } as React.CSSProperties}
// // //             onClick={onFocus}>
// // //             <div className="ab-block-strip" style={{ background: meta.color }} />
// // //             <div className="ab-block-ctrl-row">
// // //                 <div className="ab-block-left">
// // //                     <span className="ab-block-type-badge" style={{ color: meta.color, background: `${meta.color}18`, borderColor: `${meta.color}35` }}>
// // //                         {meta.icon}{meta.label}
// // //                     </span>
// // //                     {topic && <span className="ab-block-topic-tag">{topic.code} · {topic.weight}</span>}
// // //                 </div>
// // //                 <div className="ab-block-actions">
// // //                     <button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'up'); }} disabled={index === 0} title="Move up">↑</button>
// // //                     <button className="ab-ctrl-btn" onClick={e => { e.stopPropagation(); onMove(block.id, 'down'); }} disabled={index === total - 1} title="Move down">↓</button>
// // //                     <button className="ab-ctrl-btn ab-ctrl-del" onClick={e => { e.stopPropagation(); onRemove(block.id); }}><Trash2 size={13} /></button>
// // //                 </div>
// // //             </div>

// // //             {block.type === 'section' && (
// // //                 <input className="ab-section-input" type="text"
// // //                     value={block.title} placeholder="Section title"
// // //                     onChange={e => onUpdate(block.id, 'title', e.target.value)}
// // //                     onClick={e => e.stopPropagation()} />
// // //             )}

// // //             {block.type === 'info' && (
// // //                 <div className="ab-info-body">
// // //                     <div className="ab-info-lbl-row"><FileText size={13} /><span>Reading material — shown to learner before questions</span></div>
// // //                     <textarea className="ab-textarea-block" rows={5}
// // //                         placeholder="Paste or type the learning material here…"
// // //                         value={block.content}
// // //                         onChange={e => onUpdate(block.id, 'content', e.target.value)}
// // //                         onClick={e => e.stopPropagation()} />
// // //                 </div>
// // //             )}

// // //             {(block.type === 'text' || block.type === 'mcq') && (
// // //                 <div className="ab-q-body">
// // //                     <div className="ab-q-top">
// // //                         <span className="ab-q-num">Q{index + 1}</span>
// // //                         <div className="ab-marks-stepper">
// // //                             <button className="ab-step-btn" onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', Math.max(0, (block.marks || 0) - 1)); }}>−</button>
// // //                             <span className="ab-step-val">{block.marks}</span>
// // //                             <button className="ab-step-btn" onClick={e => { e.stopPropagation(); onUpdate(block.id, 'marks', (block.marks || 0) + 1); }}>+</button>
// // //                             <span className="ab-step-lbl">mark{block.marks !== 1 ? 's' : ''}</span>
// // //                         </div>
// // //                         <div className="ab-topic-sel-wrap">
// // //                             <select className="ab-topic-sel"
// // //                                 value={block.linkedTopicId || ''}
// // //                                 onChange={e => onUpdate(block.id, 'linkedTopicId', e.target.value || undefined)}
// // //                                 onClick={e => e.stopPropagation()}>
// // //                                 <option value="">Link topic…</option>
// // //                                 {topics.map(t => <option key={t.id} value={t.id}>{t.code} – {t.title}</option>)}
// // //                             </select>
// // //                             <ChevronDown size={11} className="ab-topic-sel-arr" />
// // //                         </div>
// // //                     </div>
// // //                     <textarea className="ab-q-input" rows={2}
// // //                         placeholder="Type the question here…"
// // //                         value={block.question}
// // //                         onChange={e => onUpdate(block.id, 'question', e.target.value)}
// // //                         onClick={e => e.stopPropagation()} />
// // //                     {block.type === 'text' && (
// // //                         <div className="ab-answer-ghost"><AlignLeft size={13} /><span>Learner types their answer here</span></div>
// // //                     )}
// // //                     {block.type === 'mcq' && block.options && (
// // //                         <div className="ab-mcq-opts">
// // //                             <p className="ab-mcq-hint">Click a row to mark it as the correct answer.</p>
// // //                             {block.options.map((opt, i) => (
// // //                                 <div key={i}
// // //                                     className={`ab-opt-row ${block.correctOption === i ? 'correct' : ''}`}
// // //                                     onClick={e => { e.stopPropagation(); onUpdate(block.id, 'correctOption', i); }}>
// // //                                     <div className="ab-radio">{block.correctOption === i && <div className="ab-radio-dot" />}</div>
// // //                                     <span className="ab-opt-letter">{String.fromCharCode(65 + i)}</span>
// // //                                     <input className="ab-opt-input" type="text"
// // //                                         placeholder={`Option ${String.fromCharCode(65 + i)}`}
// // //                                         value={opt}
// // //                                         onChange={e => onUpdateOption(block.id, i, e.target.value)}
// // //                                         onClick={e => e.stopPropagation()} />
// // //                                     {block.correctOption === i && <span className="ab-correct-tag">Correct</span>}
// // //                                 </div>
// // //                             ))}
// // //                         </div>
// // //                     )}
// // //                 </div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // // ─── MICRO HELPERS ────────────────────────────────────────────────────────────
// // // const SectionHdr: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
// // //     <div className="ab-section-hdr">{icon}<span>{label}</span></div>
// // // );
// // // const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
// // //     <div className="ab-fg">{label && <label className="ab-fg-label">{label}</label>}{children}</div>
// // // );
// // // const MC: React.FC<{ label: string; value: string; mono?: boolean; accent?: boolean }> = ({ label, value, mono, accent }) => (
// // //     <div className={`ab-mc-chip ${accent ? 'accent' : ''}`}>
// // //         <span className="ab-mc-chip-lbl">{label}</span>
// // //         <span className={`ab-mc-chip-val ${mono ? 'mono' : ''}`}>{value}</span>
// // //     </div>
// // // );
// // // const ReqGroup: React.FC<{ label: string; text: string }> = ({ label, text }) => (
// // //     <div className="ab-req-group"><span className="ab-req-group-lbl">{label}</span><p className="ab-prose sm">{text}</p></div>
// // // );
// // // const EmptyCanvas: React.FC<{ onAdd: (t: BlockType) => void }> = ({ onAdd }) => (
// // //     <div className="ab-empty-canvas">
// // //         <div className="ab-empty-inner">
// // //             <div className="ab-empty-icon"><BookOpen size={30} /></div>
// // //             <h2 className="ab-empty-title">Start building your workbook</h2>
// // //             <p className="ab-empty-sub">Add a block below, or link questions directly from the <strong>Topics</strong> panel.</p>
// // //             <div className="ab-empty-grid">
// // //                 {(Object.keys(BLOCK_META) as BlockType[]).map(bt => (
// // //                     <button key={bt} className="ab-empty-card"
// // //                         style={{ '--block-color': BLOCK_META[bt].color } as React.CSSProperties}
// // //                         onClick={() => onAdd(bt)}>
// // //                         <span className="ab-empty-icon-bt">{BLOCK_META[bt].icon}</span>
// // //                         <span className="ab-empty-lbl">{BLOCK_META[bt].label}</span>
// // //                         <span className="ab-empty-desc">{BLOCK_META[bt].desc}</span>
// // //                     </button>
// // //                 ))}
// // //             </div>
// // //         </div>
// // //     </div>
// // // );

// // // export default AssessmentBuilder;