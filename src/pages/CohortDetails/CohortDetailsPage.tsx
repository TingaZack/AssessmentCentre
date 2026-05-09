// src/pages/CohortDetailsPage/CohortDetailsPage.tsx

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Users, Calendar, Clock, Loader2, RefreshCcw, DownloadCloud,
    Briefcase, FolderOpen, UserMinus, AlertCircle, ChevronLeft,
    CheckCircle, BookOpen, Building2, Award, Timer, Layers, LayoutList,
    ChevronDown, ChevronUp, Sparkles, Link as LinkIcon, Plus, Trash2, Edit3, X, PenTool,
    FileText
} from 'lucide-react';
import { writeBatch, doc, collection, query, where, getDocs, increment, onSnapshot, updateDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as XLSX from 'xlsx';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import './CohortDetailsPage.css';
import { StatusModal, type StatusType } from '../../components/common/StatusModal/StatusModal';
import { WorkplacePlacementModal } from '../../components/admin/WorkplacePlacementModal/WorkplacePlacementModal';
import { useToast } from '../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../types';
import { createPortal } from 'react-dom';
import { NotificationBell } from '../../components/common/NotificationBell/NotificationBell';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

const quillModules = {
    toolbar: [
        [{ 'header': [1, 2, 3, 4, false] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'table': true }],
        ['blockquote', 'code-block'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        ['clean']
    ],
    table: true
};

// ─── QCTO HELPERS ────────────────────────────────────────────────────────────
const formatQCTODate = (d?: string) => {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return '';
    return `${dt.getFullYear()}${String(dt.getMonth() + 1).padStart(2, '0')}${String(dt.getDate()).padStart(2, '0')}`;
};

const getDOBFromID = (id: string) => {
    const clean = String(id || '').replace(/\s/g, '');
    if (clean.length !== 13) return '';
    try {
        let y = parseInt(clean.substring(0, 2), 10);
        const m = clean.substring(2, 4), d2 = clean.substring(4, 6);
        y += y <= new Date().getFullYear() % 100 ? 2000 : 1900;
        return `${y}${m}${d2}`;
    } catch { return ''; }
};

const createTextCell = (val: any) => ({ t: 's', v: String(val ?? ''), z: '@' });

const ModuleChip: React.FC<{ label: string; count: number; variant: 'k' | 'p' | 'w' }> = ({ label, count, variant }) => (
    <span className={`cdp-chip cdp-chip--${variant}`}>{label}: {count}</span>
);

// ─── AI LESSON PLAN MODAL ─────────────────────────────────────────────────────
const AILessonPlanModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (planHtml: string, evidence: any[], isEdit: boolean, reportId?: string) => void;
    onShowStatus: (type: StatusType, title: string, message: string) => void;
    selectedTopics: Record<string, string>;
    curriculumItems: any[];
    activeProgramme: any;
    cohort: any;
    user: any;
    existingReport: any | null;
}> = ({ isOpen, onClose, onSave, onShowStatus, selectedTopics, curriculumItems, activeProgramme, cohort, user, existingReport }) => {
    const [isGenerating, setIsGenerating] = useState(true);
    const [isEnhancing, setIsEnhancing] = useState(false);
    const [planHtml, setPlanHtml] = useState('');
    const [evidenceItems, setEvidenceItems] = useState<{ url: string, description: string }[]>([{ url: '', description: '' }]);

    const [loadingStep, setLoadingStep] = useState(0);
    const loadingMessages = [
        "Initializing OpenAI GPT-4o engine...",
        "Analyzing QCTO Programme & NQF Levels...",
        "Structuring learning outcomes and objectives...",
        "Adapting to your specific teaching style...",
        "Drafting compliant evidence & assessment strategies...",
        "Finalizing professional session report..."
    ];

    const quillRef = useRef<ReactQuill>(null);
    const hasGeneratedRef = useRef(false);

    useEffect(() => {
        if (!isGenerating) return;
        const interval = setInterval(() => {
            setLoadingStep(prev => (prev < loadingMessages.length - 1 ? prev + 1 : prev));
        }, 1500);
        return () => clearInterval(interval);
    }, [isGenerating, loadingMessages.length]);

    useEffect(() => {
        if (!isOpen) {
            hasGeneratedRef.current = false;
            setLoadingStep(0);
            return;
        }

        if (existingReport) {
            setPlanHtml(existingReport.reportHtml || '');
            setEvidenceItems(existingReport.evidenceLinks?.length ? existingReport.evidenceLinks : [{ url: '', description: '' }]);
            setIsGenerating(false);
            hasGeneratedRef.current = true;
        } else {
            if (!hasGeneratedRef.current) {
                hasGeneratedRef.current = true;

                const generateFromAI = async () => {
                    setIsGenerating(true);
                    setLoadingStep(0);

                    const selectedDefs = Object.keys(selectedTopics).map(id => curriculumItems.find(i => i.id === id)).filter(Boolean);
                    const moduleNames = Array.from(new Set(selectedDefs.map(d => d.moduleName))).join(', ');
                    const topicList = selectedDefs.map(d => `<li style="color: #000000;">${d.code ? `${d.code}: ` : ''}${d.title}</li>`).join('');

                    try {
                        const functions = getFunctions();
                        const draftSessionReport = httpsCallable(functions, 'draftSessionReport');

                        const response = await draftSessionReport({
                            topics: selectedDefs,
                            moduleNames,
                            programmeName: activeProgramme?.name || cohort?.name,
                            nqfLevel: activeProgramme?.nqfLevel || 'N/A',
                            saqaId: activeProgramme?.saqaId || 'N/A',
                            qctoId: activeProgramme?.qctoId || activeProgramme?.curriculumCode || 'N/A',
                            credits: activeProgramme?.credits || 'N/A',
                            facilitatorName: user?.fullName,
                            preferences: user?.preferences ? `Teaching style: ${user.preferences.teachingStyle}. Resources: ${user.preferences.resources}` : null
                        });

                        const data = response.data as any;
                        if (data.success && data.html) {
                            let finalHtml = data.html;
                            if (user?.signatureUrl) {
                                finalHtml = finalHtml.replace(
                                    `<strong>Delivered By:</strong> ${user?.fullName}</p>`,
                                    `<strong>Delivered By:</strong> ${user?.fullName}</p><img src="${user.signatureUrl}" style="max-height: 50px; display: block; margin: 10px 0;" alt="Digital Signature" />`
                                );
                            }
                            setPlanHtml(finalHtml);
                            onShowStatus('success', 'AI Generation Complete', 'OpenAI has successfully drafted your lesson plan. Please review and edit before saving.');
                        } else {
                            throw new Error("Invalid HTML returned from AI");
                        }
                    } catch (error: any) {
                        console.error("AI Generation Failed:", error);

                        let errorMessage = "The AI service is currently unavailable due to a network error. We have loaded a standard QCTO template for you.";
                        if (error.message && error.message.includes('429')) {
                            errorMessage = "OpenAI rate limit exceeded (Too Many Requests). We have loaded a standard QCTO template for you to use instead.";
                        }

                        onShowStatus('warning', 'AI Temporarily Unavailable', errorMessage);

                        // 🚀 FALLBACK TEMPLATE 🚀
                        const fallbackTemplate = `
                            <h3 style="color: #000000;">1. Programme & Module Information</h3>
                            <p style="color: #000000;"><strong>Programme:</strong> ${activeProgramme?.name || cohort?.name}</p>
                            <p style="color: #000000;"><strong>SAQA ID:</strong> ${activeProgramme?.saqaId || 'N/A'} | <strong>QCTO / Curriculum ID:</strong> ${activeProgramme?.qctoId || activeProgramme?.curriculumCode || 'N/A'}</p>
                            <p style="color: #000000;"><strong>NQF Level:</strong> ${activeProgramme?.nqfLevel || 'N/A'} | <strong>Total Credits:</strong> ${activeProgramme?.credits || 'N/A'}</p>
                            <p style="color: #000000;"><strong>Module(s) Covered:</strong> ${moduleNames}</p>
                            
                            <h3 style="color: #000000;">2 & 3. Outcomes & Objectives</h3>
                            <p style="color: #000000;">By the end of this session, learners will be able to demonstrate applied knowledge in:</p>
                            <ul style="color: #000000;">${topicList}</ul>

                            <h3 style="color: #000000;">4. Content / Key Learning Areas</h3>
                            <p style="color: #000000;">Core focus areas covered in today's delivery:</p>
                            <ul style="color: #000000;">${topicList}</ul>

                            <h3 style="color: #000000;">5 & 10. Teaching Activities & Facilitation Approach</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: Type your facilitation approach here. Example: Interactive lecture followed by pair-programming... ]</p>

                            <h3 style="color: #000000;">6. Resources & Materials</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: List resources used. Example: Laptops, VS Code IDE, Whiteboard, Slide Deck... ]</p>

                            <h3 style="color: #000000;">7. Time Allocation</h3>
                            <ul style="color: #000000;">
                                <li style="color: #000000; font-style: italic;">[ Theory & Instruction: XX% ]</li>
                                <li style="color: #000000; font-style: italic;">[ Practical Application: XX% ]</li>
                                <li style="color: #000000; font-style: italic;">[ Assessment / Q&A: XX% ]</li>
                            </ul>

                            <h3 style="color: #000000;">8 & 9. Assessment Strategy & Evidence</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: Describe how learning was measured. Example: Formative observation during practical labs. Code commits uploaded to portal... ]</p>

                            <h3 style="color: #000000;">11. Learner Support & Remediation</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: Detail any one-on-one coaching or support provided to struggling learners... ]</p>

                            <h3 style="color: #000000;">12. Evaluation & Reflection</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: Add your personal reflection notes here on how the session went and if objectives were met... ]</p>

                            <h3 style="color: #000000;">13. Alignment to Workplace</h3>
                            <p style="color: #000000; font-style: italic;">[ INSTRUCTION: Explain how today's skills translate to real-world tasks or projects... ]</p>

                            <hr />
                            <p style="color: #000000;"><strong>14. Compliance Sign-Off</strong></p>
                            <p style="color: #000000;"><strong>Delivered By:</strong> ${user?.fullName}</p>
                            ${user?.signatureUrl ? `<img src="${user.signatureUrl}" style="max-height: 50px; display: block; margin: 10px 0;" alt="Digital Signature" />` : ''}
                            <p style="color: #000000;"><strong>Date Logged:</strong> ${new Date().toLocaleDateString()}</p>
                            <p style="color: #000000;"><em>Digitally Authenticated by mLab Assessment Centre</em></p>
                        `;
                        setPlanHtml(fallbackTemplate);

                    } finally {
                        setIsGenerating(false);
                    }
                };

                generateFromAI();
            }
        }
    }, [isOpen, existingReport, selectedTopics, curriculumItems, activeProgramme, cohort, user, onShowStatus]);

    const handleEnhanceText = async () => {
        const editor = quillRef.current?.getEditor();
        if (!editor) return;

        const range = editor.getSelection();
        if (!range || range.length === 0) {
            return onShowStatus('info', 'No Text Selected', 'Please highlight the specific text in the editor that you want the AI to enhance.');
        }

        const selectedText = editor.getText(range.index, range.length);
        setIsEnhancing(true);

        try {
            const functions = getFunctions();
            const enhanceTextFn = httpsCallable(functions, 'enhanceText');
            const response = await enhanceTextFn({ text: selectedText });
            const data = response.data as any;

            if (data.success && data.text) {
                editor.deleteText(range.index, range.length);
                editor.insertText(range.index, data.text);
                setPlanHtml(editor.root.innerHTML);
                onShowStatus('success', 'Text Enhanced', 'The highlighted text has been professionally rewritten by OpenAI.');
            }
        } catch (error) {
            console.error("Enhance error:", error);
            onShowStatus('error', 'Enhancement Failed', 'The AI service is currently busy or unavailable. Please try again in a few moments.');
        } finally {
            setIsEnhancing(false);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="lfm-overlay" style={{ zIndex: 99999 }}>
            <style>
                {`
                    @keyframes aiPulse {
                        0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(148, 199, 61, 0.4); }
                        70% { transform: scale(1); box-shadow: 0 0 0 15px rgba(148, 199, 61, 0); }
                        100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(148, 199, 61, 0); }
                    }
                `}
            </style>
            <div className="lfm-modal" style={{ maxWidth: '1000px', height: '90vh' }}>
                <div className="lfm-header" style={{ background: 'var(--mlab-blue)' }}>
                    <h2 className="lfm-header__title">
                        {existingReport ? <Edit3 size={18} color="var(--mlab-green)" /> : <Sparkles size={18} color="var(--mlab-green)" />}
                        {existingReport ? 'Edit Session Report' : 'Smart Session Report'}
                    </h2>
                    <button className="lfm-close-btn" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f8fafc', padding: 0 }}>
                    {isGenerating ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '450px', color: 'var(--mlab-blue)' }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px',
                                background: 'rgba(148, 199, 61, 0.1)', borderRadius: '50%', marginBottom: '1.5rem',
                                animation: 'aiPulse 2s infinite'
                            }}>
                                <Sparkles size={40} color="var(--mlab-green)" />
                            </div>

                            <h3 style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
                                Crafting Lesson Plan...
                            </h3>

                            <div style={{ width: '280px', background: '#e2e8f0', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '1rem' }}>
                                <div style={{
                                    height: '100%', background: 'var(--mlab-green)',
                                    width: `${Math.max(10, ((loadingStep + 1) / loadingMessages.length) * 100)}%`,
                                    transition: 'width 0.8s ease-in-out'
                                }} />
                            </div>

                            <p style={{ color: 'var(--mlab-grey)', fontSize: '0.85rem', fontStyle: 'italic', transition: 'opacity 0.3s' }}>
                                {loadingMessages[loadingStep]}
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', height: '100%', animation: 'fadeIn 0.4s ease-out' }}>
                            <div style={{ flex: 2, padding: '1.5rem', borderRight: '1px solid var(--mlab-border)', display: 'flex', flexDirection: 'column' }}>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div style={{ background: '#e0f2fe', border: '1px solid #bae6fd', borderLeft: '4px solid #0ea5e9', padding: '8px 12px', borderRadius: '4px', fontSize: '0.8rem', color: '#0369a1', flex: 1, marginRight: '1rem' }}>
                                        {!existingReport ? <strong>Automated QCTO Compliance:</strong> : <strong>Edit Mode:</strong>} Review and tweak your content below.
                                    </div>

                                    <button
                                        onClick={handleEnhanceText}
                                        disabled={isEnhancing}
                                        className="lfm-btn"
                                        style={{ background: '#fdf4ff', color: '#c026d3', border: '1px solid #f0abfc', borderRadius: '4px', padding: '6px 12px', fontSize: '0.75rem', cursor: isEnhancing ? 'not-allowed' : 'pointer' }}
                                    >
                                        {isEnhancing ? <Loader2 size={14} className="lfm-spin" /> : <Sparkles size={14} />}
                                        Enhance Highlighted Text
                                    </button>
                                </div>

                                <div style={{ background: 'white', color: '#000000', border: '1px solid var(--mlab-border)', borderRadius: '8px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <ReactQuill
                                        ref={quillRef}
                                        theme="snow"
                                        value={planHtml}
                                        onChange={setPlanHtml}
                                        modules={quillModules}
                                        style={{ height: '350px', display: 'flex', flexDirection: 'column' }}
                                    />
                                </div>
                            </div>

                            <div style={{ flex: 1, padding: '1.5rem', background: 'white', overflowY: 'auto', borderLeft: '1px solid var(--mlab-border)' }}>

                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', borderLeft: '4px solid var(--mlab-green)' }}>
                                    <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: '#166534', textTransform: 'uppercase', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <PenTool size={16} /> Digital Authentication
                                    </h4>
                                    {user?.signatureUrl ? (
                                        <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #bbf7d0', textAlign: 'center' }}>
                                            <img src={user.signatureUrl} alt="Signature" style={{ maxHeight: '60px', maxWidth: '100%', objectFit: 'contain', mixBlendMode: 'multiply' }} />
                                            <div style={{ fontSize: '0.65rem', color: '#166534', marginTop: '6px', fontWeight: 'bold', letterSpacing: '0.05em' }}>VERIFIED SIGNATURE ATTACHED</div>
                                        </div>
                                    ) : (
                                        <div style={{ background: 'white', padding: '12px', borderRadius: '4px', border: '1px dashed #fca5a5', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>No signature found</div>
                                            <div style={{ fontSize: '0.7rem', color: '#7f1d1d', marginTop: '4px' }}>Please update your profile settings for full compliance reporting.</div>
                                        </div>
                                    )}
                                </div>

                                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 1rem' }}>
                                    <LinkIcon size={16} style={{ display: 'inline', verticalAlign: 'text-bottom', marginRight: '6px' }} />
                                    Session Evidence
                                </h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', marginBottom: '1rem' }}>Attach links to Jira, GitHub, or Drive registers.</p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {evidenceItems.map((item, idx) => (
                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid var(--mlab-border)', padding: '10px', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--mlab-grey)' }}>Item {idx + 1}</span>
                                                {evidenceItems.length > 1 && (
                                                    <button onClick={() => setEvidenceItems(p => p.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}><Trash2 size={14} /></button>
                                                )}
                                            </div>
                                            <input type="url" className="lfm-input" placeholder="https://..." value={item.url} onChange={e => { const n = [...evidenceItems]; n[idx].url = e.target.value; setEvidenceItems(n); }} style={{ marginBottom: '8px', fontSize: '0.8rem', padding: '6px' }} />
                                            <input type="text" className="lfm-input" placeholder="Description (e.g. Code Repository)" value={item.description} onChange={e => { const n = [...evidenceItems]; n[idx].description = e.target.value; setEvidenceItems(n); }} style={{ fontSize: '0.8rem', padding: '6px' }} />
                                        </div>
                                    ))}
                                    <button onClick={() => setEvidenceItems(p => [...p, { url: '', description: '' }])} className="lfm-btn lfm-btn--ghost" style={{ justifyContent: 'center', padding: '8px', fontSize: '0.8rem' }}>
                                        <Plus size={14} /> Add Another Link
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="lfm-footer" style={{ background: 'var(--mlab-bg)' }}>
                    <button className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isGenerating || isEnhancing}>Cancel</button>
                    <button className="lfm-btn lfm-btn--primary" onClick={() => onSave(planHtml, evidenceItems.filter(e => e.url), !!existingReport, existingReport?.id)} disabled={isGenerating || isEnhancing}>
                        <CheckCircle size={16} /> {existingReport ? 'Update Session Report' : 'Save Log & Publish Topics'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const CohortDetailsPage: React.FC = () => {
    const { cohortId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const {
        user, cohorts, learners, staff, employers, settings, programmes, enrollments,
        fetchCohorts, fetchLearners, fetchStaff, fetchEmployers, fetchEnrollments, fetchProgrammes
    } = useStore();

    const [activeTab, setActiveTab] = useState<'learners' | 'curriculum'>('learners');
    const [isSyncing, setIsSyncing] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isGrantingTime, setIsGrantingTime] = useState(false);
    const [isLogging, setIsLogging] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);

    const [submissions, setSubmissions] = useState<any[]>([]);
    const [curriculumLogs, setCurriculumLogs] = useState<any[]>([]);
    const [sessionReports, setSessionReports] = useState<any[]>([]);
    const [editingReport, setEditingReport] = useState<any | null>(null);

    const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
    const [selectedTopics, setSelectedTopics] = useState<Record<string, string>>({});
    const [globalCoveredDate, setGlobalCoveredDate] = useState<string>(new Date().toISOString().split('T')[0]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string }>({ isOpen: false, type: 'info', title: '', message: '' });
    const [learnerToPlace, setLearnerToPlace] = useState<DashboardLearner | null>(null);

    const showStatusPopup = (type: StatusType, title: string, message: string) => {
        setModalConfig({ isOpen: true, type, title, message });
    };

    const isAdmin = user?.role === 'admin';
    const isFacilitator = user?.role === 'facilitator';
    const cohort = cohorts.find(c => c.id === cohortId);

    // 🚀 CRITICAL FIX: Robust Programme ID Matching 🚀
    const activeProgramme = useMemo(() => {
        if (!cohort || !programmes.length) return null;

        // Grab the ID saved directly on the cohort
        const templateId = String((cohort as any).programmeId || (cohort as any).qualificationId || '').trim();
        if (!templateId) return null;

        // Try to match the Auto-ID, SAQA ID, OR the old Curriculum Code!
        return programmes.find(p => {
            const pId = String(p.id || '').trim();
            const pSaqa = String((p as any).saqaId || '').trim();
            const pCode = String((p as any).curriculumCode || '').trim();

            return pId === templateId || pSaqa === templateId || pCode === templateId;
        }) || null;
    }, [cohort, programmes]);

    const groupedCurriculum = useMemo(() => {
        if (!activeProgramme) return {};
        const groups: Record<string, { moduleName: string, moduleType: string, items: any[] }> = {};

        const extractItems = (modules: any[], type: string) => {
            (modules || []).forEach(mod => {
                const subElements = mod.topics || mod.practicalSkills || mod.workActivities || [];
                const modCode = mod.code || 'General';

                if (!groups[modCode]) groups[modCode] = { moduleName: mod.name || 'Unnamed Module', moduleType: type, items: [] };

                subElements.forEach((sub: any) => {
                    const uniqueId = sub.id || sub.code || Math.random().toString(36).substring(7);
                    groups[modCode].items.push({
                        id: uniqueId, code: sub.code || '', title: sub.title || sub.name || sub.description || 'Unnamed Item',
                        moduleCode: modCode, moduleName: mod.name || '', moduleType: type, weight: sub.weight || sub.percentage || ''
                    });
                });
            });
        };

        extractItems(activeProgramme.knowledgeModules, 'Knowledge');
        extractItems(activeProgramme.practicalModules, 'Practical');
        extractItems(activeProgramme.workExperienceModules, 'Workplace');

        return groups;
    }, [activeProgramme]);

    const curriculumItems = useMemo(() => Object.values(groupedCurriculum).flatMap(g => g.items), [groupedCurriculum]);

    const moduleProgress = useMemo(() => {
        const stats = {
            Knowledge: { total: 0, logged: 0 },
            Practical: { total: 0, logged: 0 },
            Workplace: { total: 0, logged: 0 }
        };

        Object.values(groupedCurriculum).forEach(group => {
            const type = group.moduleType as 'Knowledge' | 'Practical' | 'Workplace';
            if (stats[type]) {
                stats[type].total += group.items.length;
                stats[type].logged += group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
            }
        });

        return stats;
    }, [groupedCurriculum, curriculumLogs]);

    const enrolledLearners = useMemo(() => {
        if (!cohortId) return [];
        const cohortEnrollments = enrollments.filter(e => e.cohortId === cohortId);
        const merged: DashboardLearner[] = [];
        cohortEnrollments.forEach(enrollment => {
            const profile = learners.find(l => l.id === enrollment.learnerId || l.learnerId === enrollment.learnerId);
            if (profile?.fullName && profile?.idNumber) merged.push({ ...profile, ...enrollment, enrollmentId: enrollment.id, learnerId: profile.id } as DashboardLearner);
        });
        learners.forEach(profile => {
            if (profile.cohortId === cohortId && !merged.some(m => m.learnerId === profile.id) && profile.fullName && profile.idNumber) {
                merged.push({ ...profile, enrollmentId: profile.id, learnerId: profile.id } as DashboardLearner);
            }
        });
        return merged.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    }, [learners, enrollments, cohortId]);

    const activeCount = enrolledLearners.filter(l => l.status !== 'dropped').length;

    useEffect(() => {
        if (cohorts.length === 0) fetchCohorts();
        if (learners.length === 0) fetchLearners();
        if (staff.length === 0) fetchStaff();
        if (employers.length === 0) fetchEmployers();
        if (enrollments.length === 0) fetchEnrollments();
        if (programmes.length === 0) fetchProgrammes();
    }, [cohorts, learners, staff, employers, enrollments, programmes]);

    const fetchSubmissions = async () => {
        if (!cohortId) return;
        try {
            const snap = await getDocs(query(collection(db, 'learner_submissions'), where('cohortId', '==', cohortId)));
            setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) { console.error('Error fetching submissions:', e); }
    };

    useEffect(() => {
        fetchSubmissions();
        if (cohortId) {
            const logsQ = query(collection(db, 'curriculum_logs'), where('cohortId', '==', cohortId));
            const unsubLogs = onSnapshot(logsQ, (snap) => {
                setCurriculumLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            });

            const reportsQ = query(collection(db, 'session_reports'), where('cohortId', '==', cohortId));
            const unsubReports = onSnapshot(reportsQ, (snap) => {
                const reps = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
                reps.sort((a, b) => new Date(b.dateLogged).getTime() - new Date(a.dateLogged).getTime());
                setSessionReports(reps);
            });

            return () => { unsubLogs(); unsubReports(); };
        }
    }, [cohortId]);

    const toggleModuleAccordion = (moduleCode: string) => {
        setExpandedModules(prev => {
            const next = new Set(prev);
            if (next.has(moduleCode)) next.delete(moduleCode);
            else next.add(moduleCode);
            return next;
        });
    };

    const toggleTopicSelection = (topicId: string) => {
        setSelectedTopics(prev => {
            const next = { ...prev };
            if (next[topicId]) delete next[topicId];
            else next[topicId] = globalCoveredDate;
            return next;
        });
    };

    const handleIndividualDateChange = (topicId: string, newDate: string) => {
        setSelectedTopics(prev => ({ ...prev, [topicId]: newDate }));
    };

    const handleGlobalDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value;
        setGlobalCoveredDate(newDate);
        setSelectedTopics(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(key => { next[key] = newDate; });
            return next;
        });
    };

    const handleSaveReport = async (planHtml: string, evidenceLinks: any[], isEdit: boolean, reportId?: string) => {
        if (isEdit && reportId) {
            setIsLogging(true);
            try {
                await updateDoc(doc(db, 'session_reports', reportId), {
                    reportHtml: planHtml,
                    evidenceLinks,
                    lastEditedAt: new Date().toISOString(),
                    lastEditedBy: user?.uid
                });
                toast.success("Session report updated successfully.");
                setShowAIModal(false);
                setEditingReport(null);
            } catch (error) {
                toast.error("Failed to update report.");
            } finally {
                setIsLogging(false);
            }
        } else {
            const selectedTopicIds = Object.keys(selectedTopics);
            if (selectedTopicIds.length === 0) return;

            setShowAIModal(false);
            setIsLogging(true);

            try {
                const batch = writeBatch(db);
                const now = new Date();
                const deadline = new Date(now.getTime() + (48 * 60 * 60 * 1000));

                const reportRef = doc(collection(db, 'session_reports'));
                batch.set(reportRef, {
                    cohortId,
                    facilitatorId: user?.uid,
                    facilitatorName: user?.fullName,
                    dateLogged: now.toISOString(),
                    reportHtml: planHtml,
                    evidenceLinks,
                    topicsCovered: selectedTopicIds
                });

                selectedTopicIds.forEach(topicId => {
                    const itemDef = curriculumItems.find(i => i.id === topicId);
                    if (!itemDef) return;

                    const specificCoveredDate = selectedTopics[topicId];
                    const logRef = doc(collection(db, 'curriculum_logs'));

                    batch.set(logRef, {
                        cohortId: cohortId,
                        topicId: itemDef.id,
                        topicCode: itemDef.code,
                        topicTitle: itemDef.title,
                        moduleCode: itemDef.moduleCode,
                        moduleName: itemDef.moduleName,
                        moduleType: itemDef.moduleType,
                        coveredAt: specificCoveredDate,
                        loggedAt: now.toISOString(),
                        deadlineAt: deadline.toISOString(),
                        loggedBy: user?.uid,
                        loggedByName: user?.fullName,
                        sessionReportId: reportRef.id,
                        acknowledgedBy: [],
                        penalizeLearners: []
                    });
                });

                await batch.commit();
                setSelectedTopics({});
                showStatusPopup('success', 'Topics Logged & Published', `Session Report saved and ${selectedTopicIds.length} topics published to Learners.`);

            } catch (error) {
                console.error("Failed to log curriculum:", error);
                showStatusPopup('error', 'Publish Failed', 'Failed to publish topics. Please check your connection and try again.');
            } finally {
                setIsLogging(false);
            }
        }
    };

    const activeExams = useMemo(() => submissions.filter(s => s.status === 'in_progress'), [submissions]);

    const grantExtraTimeToCohort = async (minutes: number) => {
        if (activeExams.length === 0) return;
        const confirmation = window.confirm(`Are you sure you want to add ${minutes} minutes to the clock for all ${activeExams.length} active exam sessions?`);
        if (!confirmation) return;

        setIsGrantingTime(true);
        try {
            const batch = writeBatch(db);
            activeExams.forEach(sub => {
                batch.update(doc(db, 'learner_submissions', sub.id), {
                    extraTimeGranted: increment(minutes),
                    lastStaffEditAt: new Date().toISOString()
                });
            });
            await batch.commit();
            toast.success(`Successfully granted +${minutes} minutes!`);
            await fetchSubmissions();
        } catch (error) { toast.error("Failed to grant extra time."); } finally { setIsGrantingTime(false); }
    };

    const handleQCTOExport = async () => {
        if (!cohort || enrolledLearners.length === 0) { toast.error('Cannot export an empty cohort.'); return; }
        setIsExporting(true);
        try {
            const activeCampus = settings?.campuses?.find((c: any) => c.id === cohort.campusId) || settings?.campuses?.find((c: any) => c.isDefault) || settings?.campuses?.[0];
            const mainInstitutionName = settings?.institutionName || 'mLab_Southern_Africa';
            const rawSdpCode = activeCampus?.siteAccreditationNumber?.trim() || 'SDP_PENDING';
            const targetProgId = (cohort as any).programmeId || (cohort as any).qualificationId;
            const qualObj = programmes.find(p => p.id === targetProgId || (p as any).saqaId === targetProgId || (p as any).curriculumCode === targetProgId);
            const saqaId = String((qualObj as any)?.saqaId || targetProgId || '000000');
            const qualNameForHeader = String(qualObj?.name || 'Qualification Name Missing');
            const todayQCTO = formatQCTODate(new Date().toISOString());
            const expectedCompletion = formatQCTODate(cohort.endDate);

            const headers = ["SDP Code", "Qualification Id", "National Id", "Learner Alternate ID", "Alternative Id Type", "Equity Code", "Nationality Code", "Home Language Code", "Gender Code", "Citizen Resident Status Code", "Socioeconomic Status Code", "Disability Status Code", "Disability Rating", "Immigrant Status", "Learner Last Name", "Learner First Name", "Learner Middle Name", "Learner Title", "Learner Birth Date", "Learner Home Address 1", "Learner Home Address 2", "Learner Home Address 3", "Learner Postal Address 1", "Learner Postal Address 2", "Learner Postal Address 3", "Learner Home Address Postal Code", "Learner Postal Address Post Code", "Learner Phone Number", "Learner Cell Phone Number", "Learner Fax Number", "Learner Email Address", "Province Code", "STATSSA Area Code", "POPI Act Agree", "POPI Act Date", "Expected Training Completion Date", "Statement of Results Status", "Statement of Results Issue Date", "Assessment Centre Code", "Learner Readiness for EISA Type Id", "FLC", "FLC Statement of result number", "Date Stamp"];

            const dataRows = [headers.map(createTextCell)];
            enrolledLearners.forEach(learner => {
                const d = learner.demographics || {};
                const names = (learner.fullName || '').trim().split(' ');
                const lastName = names.length > 1 ? names.pop() : '';
                const firstNames = names.join(' ');
                const title = d.learnerTitle || (d.genderCode === 'F' ? 'Ms' : 'Mr');
                const cleanDate = (v?: string) => { if (!v) return ''; const p = v.split('-'); if (p.length === 3) { if (p[0].length === 4) return `${p[0]}${p[1]}${p[2]}`; if (p[2].length === 4) return `${p[2]}${p[1]}${p[0]}`; } return v.replace(/-/g, ''); };
                const sorStatus = d.statementOfResultsStatus || (d as any).sorStatus || '02';
                const sorIssueDate = d.statementOfResultsIssueDate || (d as any).sorIssueDate || '';
                dataRows.push([rawSdpCode, saqaId, learner.idNumber, d.learnerAlternateId || '', d.alternativeIdType || '533', d.equityCode || '', d.nationalityCode || (d.citizenResidentStatusCode === 'SA' ? 'SA' : 'O'), d.homeLanguageCode || '', d.genderCode || '', d.citizenResidentStatusCode || 'SA', d.socioeconomicStatusCode || '01', d.disabilityStatusCode || 'N', d.disabilityRating || '', d.immigrantStatus || '03', lastName, firstNames, d.learnerMiddleName || '', title, getDOBFromID(learner.idNumber), d.learnerHomeAddress1 || '', d.learnerHomeAddress2 || '', d.learnerHomeAddress3 || '', d.learnerPostalAddress1 || d.learnerHomeAddress1 || '', d.learnerPostalAddress2 || d.learnerHomeAddress2 || '', d.learnerPostalAddress3 || '', d.learnerHomeAddressPostalCode || '', d.learnerPostalAddressPostCode || d.learnerHomeAddressPostalCode || '', d.learnerPhoneNumber || learner.phone || '', d.learnerPhoneNumber || learner.phone || '', d.learnerFaxNumber || '', d.learnerEmailAddress || learner.email || '', d.provinceCode || '', d.statsaaAreaCode || (d as any).statssaAreaCode || '', d.popiActAgree === 'No' ? 'N' : 'Y', cleanDate(d.popiActDate) || todayQCTO, cleanDate(d.expectedTrainingCompletionDate) || expectedCompletion, sorStatus, sorStatus === '01' ? cleanDate(sorIssueDate) : '', d.assessmentCentreCode || '', d.learnerReadinessForEISATypeId || (d as any).eisaReadinessId || '1', d.flc || (d as any).flcStatus || '06', String(d.flcStatementOfResultNumber || (d as any).flcResultNumber || ''), d.dateStamp || todayQCTO].map(createTextCell));
            });

            const wb = XLSX.utils.book_new();
            const wsI = XLSX.utils.aoa_to_sheet([["DETAILS: (COMPULSORY INFORMATION)"], ["Compiler:", user?.fullName || ''], ["Email:", user?.email || ''], ["Institution:", mainInstitutionName], ["Qualification:", qualNameForHeader], ["SAQA ID:", saqaId], ["SDP Code:", rawSdpCode], ["Total Learners:", enrolledLearners.length], ["Export Date:", new Date().toLocaleDateString()]].map(r => r.map(createTextCell)));
            XLSX.utils.book_append_sheet(wb, wsI, 'Instructions');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataRows), 'Learner Enrolment and EISA');
            const fileName = `LEISA${todayQCTO}-${mainInstitutionName.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
            XLSX.writeFile(wb, fileName);
            toast.success(`Export successful: ${fileName}`);
        } catch (e) { toast.error('Export failed. Check console for details.'); }
        finally { setIsExporting(false); }
    };

    const syncLearnerWorkbooks = async () => {
        if (!cohortId) return;
        setIsSyncing(true);
        try {
            const batch = writeBatch(db);
            const aRef = collection(db, 'assessments');
            const [snapA, snapS] = await Promise.all([
                getDocs(query(aRef, where('cohortIds', 'array-contains', cohortId), where('status', 'in', ['active', 'scheduled']))),
                getDocs(query(aRef, where('cohortId', '==', cohortId), where('status', 'in', ['active', 'scheduled']))),
            ]);
            const allAssessments = new Map<string, any>();
            snapA.docs.forEach(d => allAssessments.set(d.id, d));
            snapS.docs.forEach(d => allAssessments.set(d.id, d));

            if (allAssessments.size === 0) { setIsSyncing(false); return toast.info('No active assessments found to sync.'); }

            let count = 0;
            for (const learner of enrolledLearners) {
                const enrolId = learner.enrollmentId || learner.id;
                const humanId = learner.learnerId || learner.id;
                const authUid = learner.authUid || learner.idNumber || humanId;
                for (const [astId, astDoc] of allAssessments.entries()) {
                    const exists = submissions.some(s => s.assessmentId === astId && s.cohortId === cohortId && (s.enrollmentId === enrolId || s.learnerId === humanId));
                    if (!exists) {
                        const data = astDoc.data();
                        batch.set(doc(db, 'learner_submissions', `${cohortId}_${humanId}_${astId}`), { learnerId: humanId, enrollmentId: enrolId, authUid, qualificationName: learner.qualification?.name || '', assessmentId: astId, cohortId, title: data.title, type: data.type || 'formative', moduleNumber: data.moduleInfo?.moduleNumber || '', moduleType: data.moduleType || 'knowledge', status: 'not_started', answers: {}, assignedAt: new Date().toISOString(), totalMarks: data.totalMarks || 0, marks: 0, createdAt: new Date().toISOString() });
                        count++;
                    }
                }
            }
            if (count > 0) { await batch.commit(); await fetchSubmissions(); toast.success(`Generated ${count} missing workbook(s).`); }
            else toast.success('All learners are synced.');
        } catch (e: any) { toast.error('Sync failed.'); } finally { setIsSyncing(false); }
    };

    const getStaffName = (id: string) => staff.find(s => s.id === id)?.fullName || 'Unassigned';

    const handleDropLearner = async (learnerId: string, learnerName: string) => {
        const reason = window.prompt(`QCTO EXIT REASON: Why is ${learnerName} leaving?`);
        if (reason?.trim() && window.confirm(`Mark ${learnerName} as dropped?`)) {
            await useStore.getState().dropLearnerFromCohort(learnerId, cohort!.id, reason);
        }
    };

    const handleBack = () => {
        if (isAdmin) {
            navigate('/admin', { state: { activeTab: 'cohorts' } });
        } else {
            navigate(-1);
        }
    };

    if (!cohort) {
        return (
            <div className="cdp-layout">
                <Sidebar role={user?.role} currentNav="cohorts" onLogout={() => navigate('/login')} />
                <main className="cdp-main cdp-main--centered">
                    <Loader2 size={40} className="cdp-spinner" />
                </main>
            </div>
        );
    }

    const droppedCount = enrolledLearners.filter(l => l.status === 'dropped').length;
    const placedCount = enrolledLearners.filter(l => l.employerId && employers.find(e => e.id === l.employerId)).length;
    const pendingTotal = submissions.filter(s => s.status === 'submitted').length;
    const selectedTopicCount = Object.keys(selectedTopics).length;

    // 🚀 PROGRESS CARD RENDERER 🚀
    const renderProgressCard = (title: string, data: { total: number, logged: number }, themeColor: string, bgColor: string) => {
        const pct = data.total > 0 ? Math.round((data.logged / data.total) * 100) : 0;
        return (
            <div style={{ flex: 1, minWidth: '220px', background: 'white', padding: '1.25rem', borderRadius: '8px', border: `1px solid var(--mlab-border)`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--mlab-midnight)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
                    <span style={{ fontWeight: 800, fontSize: '1.2rem', color: themeColor }}>{pct}%</span>
                </div>
                <div style={{ height: '8px', background: bgColor, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: themeColor, width: `${pct}%`, transition: 'width 0.5s ease-in-out' }} />
                </div>
                <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--mlab-grey)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Progress</span>
                    <span style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{data.logged} / {data.total} Topics</span>
                </div>
            </div>
        );
    };

    return (
        <div className="cdp-layout">

            {/* Z-INDEX SAFEGUARD FOR GLOBAL STATUS MODALS */}
            {modalConfig.isOpen && createPortal(
                <div style={{ position: 'relative', zIndex: 999999 }}>
                    <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(p => ({ ...p, isOpen: false }))} />
                </div>,
                document.body
            )}

            {learnerToPlace && createPortal(<WorkplacePlacementModal learner={learnerToPlace} onClose={() => setLearnerToPlace(null)} />, document.body)}

            <AILessonPlanModal
                isOpen={showAIModal || !!editingReport}
                onClose={() => { setShowAIModal(false); setEditingReport(null); }}
                onSave={handleSaveReport}
                onShowStatus={showStatusPopup}
                selectedTopics={selectedTopics}
                curriculumItems={curriculumItems}
                activeProgramme={activeProgramme}
                cohort={cohort}
                user={user}
                existingReport={editingReport}
            />

            <Sidebar role={user?.role} currentNav="cohorts" setCurrentNav={nav => navigate(isAdmin ? `/admin?tab=${nav}` : `/${user?.role}`)} onLogout={() => navigate('/login')} />

            <main className="cdp-main">
                <header className="cdp-header">
                    <div className="cdp-header__left">
                        <button className="cdp-header__back" onClick={handleBack}>
                            <ChevronLeft size={14} /> {isAdmin ? 'Back to Dashboard' : 'Back'}
                        </button>
                        <div className="cdp-header__eyebrow"><Users size={12} /> Cohort Overview</div>
                        <h1 className="cdp-header__title">{cohort.name}</h1>
                        <p className="cdp-header__sub">
                            <Calendar size={12} className="cdp-header__sub-icon" /> {cohort.startDate} — {cohort.endDate}
                            <span className={`cdp-header__status${cohort.isArchived ? ' cdp-header__status--archived' : ' cdp-header__status--active'}`}>{cohort.isArchived ? 'Archived' : 'Active Class'}</span>
                        </p>
                    </div>
                    <div className="cdp-header__right">
                        {(isAdmin || isFacilitator) && (
                            <div className="cdp-header__actions">
                                <button className="cdp-btn cdp-btn--outline" onClick={handleQCTOExport} disabled={isExporting}>
                                    {isExporting ? <Loader2 size={13} className="cdp-spinner" /> : <DownloadCloud size={13} />} Export LEISA
                                </button>
                                <button className="cdp-btn cdp-btn--outline" onClick={syncLearnerWorkbooks} disabled={isSyncing}>
                                    {isSyncing ? <Loader2 size={13} className="cdp-spinner" /> : <RefreshCcw size={13} />} Sync Workbooks
                                </button>
                            </div>
                        )}
                        <NotificationBell />
                    </div>
                </header>

                <div className="cdp-content">
                    {activeExams.length > 0 && (
                        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ background: '#3b82f6', padding: '8px', borderRadius: '50%' }}><Timer size={20} color="white" /></div>
                                <div>
                                    <h3 style={{ margin: 0, color: '#1e3a8a', fontSize: '1rem', fontWeight: 700 }}>Live Exam in Progress</h3>
                                    <p style={{ margin: '4px 0 0 0', color: '#2563eb', fontSize: '0.85rem' }}>{activeExams.length} learner(s) currently taking an assessment.</p>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button className="cdp-btn" style={{ background: 'white', color: '#2563eb', border: '1px solid #bfdbfe' }} onClick={() => grantExtraTimeToCohort(15)} disabled={isGrantingTime}>
                                    {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +15 Mins
                                </button>
                                <button className="cdp-btn" style={{ background: '#2563eb', color: 'white', border: '1px solid #2563eb' }} onClick={() => grantExtraTimeToCohort(30)} disabled={isGrantingTime}>
                                    {isGrantingTime ? <Loader2 size={14} className="cdp-spinner" /> : <Timer size={14} />} +30 Mins
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="cdp-stat-row">
                        <div className="cdp-stat-card cdp-stat-card--blue"><div className="cdp-stat-card__icon"><Users size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{activeCount}</span><span className="cdp-stat-card__label">Active Learners</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--green"><div className="cdp-stat-card__icon"><Building2 size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{placedCount}</span><span className="cdp-stat-card__label">Workplace Placements</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--amber"><div className="cdp-stat-card__icon"><Clock size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{pendingTotal}</span><span className="cdp-stat-card__label">Pending Marking</span></div></div>
                        <div className="cdp-stat-card cdp-stat-card--grey"><div className="cdp-stat-card__icon"><Award size={20} /></div><div className="cdp-stat-card__body"><span className="cdp-stat-card__value">{droppedCount}</span><span className="cdp-stat-card__label">Dropped / Exited</span></div></div>
                    </div>

                    <div className="mlab-summary-card">
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label"><Calendar size={12} /> Training Period</span>
                            <span className="mlab-summary-item__value">{cohort.startDate} — {cohort.endDate}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Facilitator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.facilitatorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Assessor</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.assessorId)}</span>
                        </div>
                        <div className="mlab-summary-item">
                            <span className="mlab-summary-item__label">Moderator</span>
                            <span className="mlab-summary-item__value">{getStaffName(cohort.moderatorId)}</span>
                        </div>
                    </div>

                    <div className="lfm-tabs" style={{ marginBottom: '1.5rem' }}>
                        <button className={`lfm-tab ${activeTab === 'learners' ? 'active' : ''}`} onClick={() => setActiveTab('learners')}><Users size={16} /> Learner Roster</button>
                        <button className={`lfm-tab ${activeTab === 'curriculum' ? 'active' : ''}`} onClick={() => setActiveTab('curriculum')}><LayoutList size={16} /> Curriculum Tracker</button>
                    </div>

                    {activeTab === 'learners' && (
                        <div className="cdp-panel animate-fade-in" style={{ border: 'none', background: 'transparent' }}>
                            <div className="vp-card" style={{ marginBottom: 0 }}>
                                <div className="vp-card-header">
                                    <div className="vp-card-title-group">
                                        <Users size={18} color="var(--mlab-blue)" />
                                        <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                            Enrolled Learners ({enrolledLearners.length})
                                        </h3>
                                    </div>
                                </div>
                                <div className="mlab-table-wrap">
                                    <table className="mlab-table">
                                        <thead><tr><th>Learner</th><th>Workplace</th><th>Module Progress</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
                                        <tbody>
                                            {enrolledLearners.map(learner => {
                                                const isDropped = learner.status === 'dropped';
                                                const routingId = learner.enrollmentId || learner.id;
                                                const learnerSubs = submissions.filter(s => s.enrollmentId === routingId || s.learnerId === learner.id);
                                                const pendingCount = learnerSubs.filter(s => s.status === 'submitted').length;
                                                const isPlaced = !!learner.employerId;

                                                return (
                                                    <tr key={learner.id} className={isDropped ? 'mlab-tr--dropped' : ''}>
                                                        <td>
                                                            <div className="cdp-learner-cell">
                                                                <div className="cdp-learner-avatar">{learner.fullName.charAt(0)}</div>
                                                                <div className="cdp-learner-cell__info">
                                                                    <span className={`cdp-learner-cell__name${isDropped ? ' cdp-learner-cell__name--dropped' : ''}`}>{learner.fullName}</span>
                                                                    <span className="cdp-learner-cell__id">{learner.idNumber}</span>
                                                                    {!isDropped && pendingCount > 0 && <span className="cdp-pending-chip"><Clock size={10} /> {pendingCount} marking pending</span>}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>{isPlaced ? <span className="cdp-placement__employer">{employers.find(e => e.id === learner.employerId)?.name}</span> : <span className="cdp-placement--pending"><AlertCircle size={12} /> Pending</span>}</td>
                                                        <td>
                                                            <div className="cdp-chips">
                                                                <ModuleChip label="K" count={learnerSubs.filter(s => s.moduleType === 'knowledge' && s.status !== 'not_started').length} variant="k" />
                                                                <ModuleChip label="P" count={learnerSubs.filter(s => s.moduleType === 'practical' && s.status !== 'not_started').length} variant="p" />
                                                                <ModuleChip label="W" count={learnerSubs.filter(s => s.moduleType === 'workplace' && s.status !== 'not_started').length} variant="w" />
                                                            </div>
                                                        </td>
                                                        <td><span className={`cdp-status-badge${isDropped ? ' cdp-status-badge--dropped' : ' cdp-status-badge--active'}`}>{isDropped ? 'Dropped' : 'Active'}</span></td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div className="cdp-actions">
                                                                {isAdmin && <button className={`mlab-btn mlab-btn--sm ${isPlaced ? 'mlab-btn--ghost' : 'mlab-btn--primary'}`} onClick={() => setLearnerToPlace(learner)}><Briefcase size={12} /> {isPlaced ? 'Reassign' : 'Place'}</button>}
                                                                <button className="mlab-btn mlab-btn--sm mlab-btn--ghost" onClick={() => navigate(`/portfolio/${routingId}`, { state: { cohortId: cohort.id } })}><FolderOpen size={12} /> Portfolio</button>
                                                                {isAdmin && !isDropped && <button className="mlab-btn mlab-btn--sm mlab-btn--error" onClick={() => handleDropLearner(learner.id, learner.fullName)}><UserMinus size={12} /></button>}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'curriculum' && (
                        <div className="animate-fade-in" style={{ paddingBottom: selectedTopicCount > 0 ? '80px' : '0' }}>

                            {activeProgramme && (
                                <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                    {renderProgressCard('Knowledge Modules', moduleProgress.Knowledge, '#f59e0b', '#fef3c7')}
                                    {renderProgressCard('Practical Modules', moduleProgress.Practical, '#0ea5e9', '#e0f2fe')}
                                    {renderProgressCard('Workplace Modules', moduleProgress.Workplace, '#10b981', '#dcfce7')}
                                </div>
                            )}

                            <div style={{ borderRadius: '8px', overflow: 'hidden', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                                <div className="lfm-header">
                                    <h2 className="lfm-header__title"><BookOpen size={18} /> Curriculum Blueprint Tracker</h2>
                                </div>
                                <div className="lfm-body" style={{ background: 'white', border: '2px solid var(--mlab-blue)', borderTop: 'none', padding: '1.5rem', borderRadius: '0 0 8px 8px' }}>
                                    {!activeProgramme ? (
                                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--mlab-grey)' }}>
                                            <AlertCircle size={40} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                            <p>No formal Qualification Blueprint is linked to this cohort.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                            {Object.keys(groupedCurriculum).map(modCode => {
                                                const group = groupedCurriculum[modCode];
                                                const isOpen = expandedModules.has(modCode);
                                                const totalItems = group.items.length;
                                                const loggedItems = group.items.filter(i => curriculumLogs.some(l => l.topicId === i.id)).length;
                                                const isComplete = loggedItems === totalItems && totalItems > 0;

                                                return (
                                                    <div key={modCode}>
                                                        <div className="lfm-section-hdr" style={{ cursor: 'pointer', borderBottomColor: isComplete ? 'var(--mlab-green)' : 'var(--mlab-blue)', opacity: isOpen ? 1 : 0.85 }} onClick={() => toggleModuleAccordion(modCode)}>
                                                            <Layers size={16} color={isComplete ? "var(--mlab-green)" : "var(--mlab-blue)"} />
                                                            <span style={{ flex: 1 }}>{modCode} <span style={{ color: 'var(--mlab-grey)', paddingLeft: '8px' }}>{group.moduleName}</span></span>
                                                            <span style={{ fontSize: '0.7rem', color: 'var(--mlab-grey)', letterSpacing: '0.1em', fontWeight: 700, background: isComplete ? 'var(--mlab-green-bg)' : 'transparent', padding: '2px 8px', borderRadius: '4px' }}>
                                                                {loggedItems} / {totalItems} COVERED
                                                            </span>
                                                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                        </div>
                                                        {isOpen && (
                                                            <div className="lfm-module-editor-wrap" style={{ borderTop: '2px solid var(--mlab-blue)', padding: 0, marginTop: '-0.75rem' }}>
                                                                <div className="mlab-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                                                                    <table className="mlab-table" style={{ margin: 0, border: 'none' }}>
                                                                        <thead style={{ background: 'var(--mlab-light-blue)' }}>
                                                                            <tr>
                                                                                <th style={{ width: '50px', color: 'grey', textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>Log</th>
                                                                                <th style={{ color: 'grey' }}>Topic / Activity</th>
                                                                                <th style={{ width: '280px', color: 'grey' }}>Status / Session Report</th>
                                                                                <th style={{ width: '180px', color: 'grey' }}>Engagement</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {group.items.map(item => {
                                                                                const logRecord = curriculumLogs.find(log => log.topicId === item.id);
                                                                                const isLogged = !!logRecord;
                                                                                const isSelected = selectedTopics.hasOwnProperty(item.id);
                                                                                const ackPct = activeCount > 0 ? Math.round(((logRecord?.acknowledgedBy?.length || 0) / activeCount) * 100) : 0;

                                                                                const associatedReport = isLogged ? sessionReports.find(r => r.id === logRecord.sessionReportId) : null;

                                                                                return (
                                                                                    <tr key={item.id} style={{ background: isLogged ? '#f0fdf4' : (isSelected ? '#eff6ff' : 'white') }}>
                                                                                        <td style={{ textAlign: 'center', borderRight: '1px solid var(--mlab-border)' }}>
                                                                                            {isLogged ? <CheckCircle size={18} color="var(--mlab-green)" style={{ margin: '0 auto' }} /> : <input type="checkbox" checked={isSelected} onChange={() => toggleTopicSelection(item.id)} style={{ width: '16px', height: '16px', accentColor: 'var(--mlab-blue)', cursor: 'pointer' }} />}
                                                                                        </td>
                                                                                        <td>
                                                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                                                <span style={{ fontWeight: 600, color: isLogged ? '#166534' : 'var(--mlab-midnight)', fontSize: '0.85rem' }}>{item.code ? `${item.code}: ` : ''}{item.title}</span>
                                                                                                <span style={{ fontSize: '0.65rem', color: 'var(--mlab-grey)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginTop: '2px' }}>{item.moduleType}</span>
                                                                                            </div>
                                                                                        </td>
                                                                                        <td>
                                                                                            {isLogged ? (
                                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                                                    <span style={{ display: 'inline-block', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>
                                                                                                        Covered {new Date(logRecord.coveredAt).toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })}
                                                                                                    </span>
                                                                                                    {associatedReport && (
                                                                                                        <button
                                                                                                            onClick={() => setEditingReport(associatedReport)}
                                                                                                            style={{ background: 'transparent', border: '1px solid #86efac', color: '#15803d', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                                                                                        >
                                                                                                            <FileText size={12} /> View Report
                                                                                                        </button>
                                                                                                    )}
                                                                                                </div>
                                                                                            ) : isSelected ? (
                                                                                                <input type="date" className="lfm-input" value={selectedTopics[item.id]} max={new Date().toISOString().split('T')[0]} onChange={(e) => handleIndividualDateChange(item.id, e.target.value)} style={{ padding: '4px 8px', fontSize: '0.75rem', width: '130px', height: '28px' }} />
                                                                                            ) : <span style={{ display: 'inline-block', background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase' }}>Pending</span>}
                                                                                        </td>
                                                                                        <td>
                                                                                            {isLogged ? (
                                                                                                <div className="cdp-progress-col" style={{ width: '100%' }}>
                                                                                                    <div className="cdp-progress-text"><span style={{ fontFamily: 'var(--font-heading)', color: 'grey' }}>{logRecord?.acknowledgedBy?.length || 0} / {activeCount} ACKD </span><span style={{ fontWeight: 'bold', color: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444') }}>{ackPct}%</span></div>
                                                                                                    <div className="cdp-progress-track" style={{ height: '4px', borderRadius: '0' }}><div className="cdp-progress-fill" style={{ width: `${ackPct}%`, background: ackPct >= 80 ? 'var(--mlab-green)' : (ackPct >= 50 ? '#f59e0b' : '#ef4444'), borderRadius: '0' }} /></div>
                                                                                                </div>
                                                                                            ) : <span style={{ fontSize: '0.8rem', color: 'var(--mlab-grey-light)' }}>—</span>}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {selectedTopicCount > 0 && createPortal(
                                <div className="animate-slide-up" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--mlab-blue)', backgroundImage: 'repeating-linear-gradient(-45deg, transparent, transparent 40px, rgba(255, 255, 255, 0.015) 40px, rgba(255, 255, 255, 0.015) 41px)', borderTop: '3px solid var(--mlab-green)', padding: '1rem 2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 9999, boxShadow: '0 -10px 20px rgba(0,0,0,0.15)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px', borderRadius: '50%', display: 'flex' }}><CheckCircle size={24} color="var(--mlab-green)" /></div>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 700, color: 'var(--mlab-white)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{selectedTopicCount} Topic{selectedTopicCount !== 1 ? 's' : ''} Selected</span>
                                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>Learners will have 48 hours to acknowledge.</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', color: 'var(--mlab-green)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>Batch Date:</label>
                                            <input type="date" className="lfm-input" value={globalCoveredDate} max={new Date().toISOString().split('T')[0]} onChange={handleGlobalDateChange} style={{ width: '130px', padding: '4px 8px', height: 'auto', fontSize: '0.8rem', background: 'var(--mlab-white)', color: 'var(--mlab-blue)' }} />
                                        </div>
                                        <button className="lfm-btn" onClick={() => setSelectedTopics({})} style={{ background: 'transparent', color: 'var(--mlab-white)', border: '2px solid rgba(255,255,255,0.3)' }}>Cancel</button>
                                        <button className="lfm-btn" onClick={() => setShowAIModal(true)} disabled={isLogging} style={{ background: 'var(--mlab-green)', color: 'var(--mlab-blue)', border: '2px solid var(--mlab-green)' }}>
                                            {isLogging ? <Loader2 size={16} className="lfm-spin" /> : <Sparkles size={16} />} Generate Session Report
                                        </button>
                                    </div>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default CohortDetailsPage;