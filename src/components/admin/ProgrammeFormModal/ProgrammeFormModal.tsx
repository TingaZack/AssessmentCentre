
// src/components/admin/ProgrammeFormModal.tsx

// src/components/admin/ProgrammeFormModal.tsx

import React, { useState, useRef } from 'react';
import {
    X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
    Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2, AlertCircle, FileSpreadsheet
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './ProgrammeFormModal.css';
import type { ModuleCategory, ProgrammeTemplate } from '../../../types';
import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

interface ProgrammeFormModalProps {
    programme?: ProgrammeTemplate | null;
    existingProgrammes: ProgrammeTemplate[];
    onClose: () => void;
    onSave: (programme: ProgrammeTemplate) => void;
    title: string;
}

const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
    name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0,
    knowledgeModules: [], practicalModules: [], workExperienceModules: [], isArchived: false,
};

const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
    knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
    practical: { label: 'Practical', icon: <FileText size={13} /> },
    workExperience: { label: 'Workplace', icon: <Briefcase size={13} /> },
};

export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
    programme, existingProgrammes, onClose, onSave, title,
}) => {
    const [formData, setFormData] = useState<ProgrammeTemplate>(
        programme ? { ...programme } : {
            ...emptyProgramme,
            curriculumCode: '',
            programmeType: 'Occupational Certificate',
            accreditingBody: 'QCTO',
            id: ''
        } as any
    );
    const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [showTextParser, setShowTextParser] = useState(false);
    const [rawText, setRawText] = useState('');

    // ─── STATUS MODAL STATE ───
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    // Loading states
    const [isImporting, setIsImporting] = useState(false);
    const [isProcessingText, setIsProcessingText] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const toggleExpandModule = (index: number) => {
        const key = `${activeTab}-${index}`;
        setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;

        let finalValue: any = value;
        if (type === 'number') {
            finalValue = parseInt(value) || 0;
        } else if (type === 'checkbox') {
            finalValue = (e.target as HTMLInputElement).checked;
        }

        setFormData({
            ...formData,
            [name]: finalValue,
        });
    };

    // ── TRIGGER LOCAL FILE DOWNLOADS ──
    const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
        // Ensure files are placed in the public/templates/ directory
        const fileUrl = format === 'csv'
            ? '/templates/programme/Learning_Matrix_Form2_Template.csv'
            : '/templates/programme/Learning_Matrix_Form2_Template.xlsx';

        const link = document.createElement("a");
        link.href = fileUrl;
        link.download = `Learning_Matrix_Form2_Template.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // ── CORE PARSER TOPIC TITLE EXTRACTION ──
    const processRawTextData = (textToParse: string) => {
        if (!textToParse.trim()) return;
        let sanitized = textToParse
            .replace(/pg\.?\s*\d+(-\d+)?/gi, ' ')
            .replace(/P\s*M-/gi, 'PM-').replace(/K\s*M-/gi, 'KM-').replace(/W\s*M-/gi, 'WM-')
            .replace(/Topic elements to be covered include:?/gi, ' ')
            .replace(/SECTION\s+\w+:\s+[A-Z\s]+SPECIFICATIONS/gi, ' ');

        const moduleRegex = /(251201-\d{3}-\d{2}-(KM|PM|WM)-\d{2})/i;
        const moduleTokens = sanitized.split(moduleRegex);

        let kMs: any[] = [...(formData.knowledgeModules || [])];
        let pMs: any[] = [...(formData.practicalModules || [])];
        let wMs: any[] = [...(formData.workExperienceModules || [])];

        for (let i = 1; i < moduleTokens.length; i += 3) {
            const mCode = moduleTokens[i];
            const mType = moduleTokens[i + 1].toUpperCase();
            const mText = moduleTokens[i + 2] || '';

            const nqfMatch = mText.match(/NQF Level\s*(\d+)/i);
            const credMatch = mText.match(/Credits\s*(\d+)/i);
            const mNqf = nqfMatch ? parseInt(nqfMatch[1], 10) : (formData.nqfLevel || 4);
            const mCredits = credMatch ? parseInt(credMatch[1], 10) : 0;

            let nameEnd = mText.length;
            if (nqfMatch?.index !== undefined) nameEnd = Math.min(nameEnd, nqfMatch.index);
            const firstTopic = mText.match(/(KM|PM|WM)-\d{2}-(KT|PS|WE)\d{2}/i);
            if (firstTopic?.index !== undefined) nameEnd = Math.min(nameEnd, firstTopic.index);
            const mName = mText.substring(0, nameEnd).replace(/^[, \-]+|[, \-]+$/g, '').trim();

            const newModule: any = {
                code: mCode, name: mName || `${mType} Module`,
                nqfLevel: mNqf, credits: mCredits, notionalHours: mCredits * 10, topics: [],
            };

            const topicTokens = mText.split(/((?:KM|PM|WM)-\d{2}-(?:KT|PS|WE)\d{2})/i);
            for (let j = 1; j < topicTokens.length; j += 2) {
                const tCode = topicTokens[j];
                const tText = topicTokens[j + 1] || '';

                const firstCriteriaIndex = tText.search(/•|(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
                let headerPart = firstCriteriaIndex !== -1 ? tText.substring(0, firstCriteriaIndex) : tText;
                const criteriaPart = firstCriteriaIndex !== -1 ? tText.substring(firstCriteriaIndex) : '';

                headerPart = headerPart.replace(/^[\s:]+/, '').trim();

                let tWeight = 0;
                const weightMatch = headerPart.match(/(\d+)\s*%$/);
                if (weightMatch) {
                    tWeight = parseInt(weightMatch[1], 10);
                    headerPart = headerPart.replace(/(\d+)\s*%$/, '').trim();
                }

                let tTitle = headerPart || 'Topic';
                if (tTitle.length > 150) tTitle = tTitle.substring(0, 150) + '...';

                const newTopic: any = { code: tCode, title: tTitle, weight: tWeight, criteria: [] };

                const lines = criteriaPart.split(/•/).map(l => l.trim()).filter(Boolean);
                lines.forEach(line => {
                    const cMatch = line.match(/(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
                    if (cMatch) {
                        const cCode = cMatch[1].replace(/\s+/g, '');
                        const cDesc = line.replace(cMatch[1], '').replace(/^[:\-]\s*/, '').trim();
                        if (cDesc) newTopic.criteria.push({ code: cCode, description: cDesc });
                    }
                });
                newModule.topics.push(newTopic);
            }

            if (mType === 'KM') kMs.push(newModule);
            else if (mType === 'PM') pMs.push(newModule);
            else if (mType === 'WM') wMs.push(newModule);
        }

        setFormData(prev => ({
            ...prev,
            knowledgeModules: kMs, practicalModules: pMs, workExperienceModules: wMs,
        }));

        setStatusModal({
            type: 'success',
            title: 'Parsing Complete',
            message: 'QCTO Curriculum text parsed successfully!',
            onClose: () => setStatusModal(null)
        });
    };

    // ── HYBRID EXCEL / CSV UPLOAD ──
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsImporting(true);

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                // Read file as ArrayBuffer for Excel processing
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                // Get the first worksheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Get raw array format first to check headers
                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

                if (!rawRows.length) {
                    setIsImporting(false);
                    return;
                }

                // Check if it matches our structured template
                const headerRow = (rawRows[0] || []).map(h => String(h).replace(/\s/g, '').toLowerCase());
                const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

                if (isStructured) {
                    // It is structured, convert to Object array
                    const sRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];
                    const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
                    const moduleMap = new Map<string, any>();
                    const topicMap = new Map<string, any>();

                    const getVal = (row: any, key: string) => {
                        const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
                        return exactKey ? String(row[exactKey] || "").trim() : "";
                    };

                    sRows.forEach(row => {
                        const type = getVal(row, 'type');
                        const cat = getVal(row, 'category').toLowerCase();
                        const mCode = getVal(row, 'modulecode');
                        const tCode = getVal(row, 'topiccode');

                        if (!mCode) return;

                        if (type.toLowerCase() === 'module') {
                            const credits = parseInt(getVal(row, 'credits')) || 0;
                            const m = {
                                code: mCode,
                                name: getVal(row, 'modulename') || '',
                                nqfLevel: parseInt(getVal(row, 'nqflevel')) || formData.nqfLevel || 4,
                                credits: credits,
                                notionalHours: credits * 10,
                                topics: []
                            };
                            moduleMap.set(mCode, m);
                            if (cat.includes('knowledge')) parsed.knowledgeModules.push(m);
                            else if (cat.includes('practical')) parsed.practicalModules.push(m);
                            else if (cat.includes('work')) parsed.workExperienceModules.push(m);
                        } else if (type.toLowerCase() === 'topic' && tCode) {
                            const parent = moduleMap.get(mCode);
                            if (parent) {
                                const t = {
                                    code: tCode,
                                    title: getVal(row, 'topicname') || '',
                                    weight: parseInt(getVal(row, 'weight')) || 0,
                                    criteria: []
                                };
                                parent.topics.push(t);
                                topicMap.set(tCode, t);
                            }
                        } else if (type.toLowerCase() === 'criteria') {
                            const pt = topicMap.get(tCode);
                            if (pt) {
                                pt.criteria.push({
                                    code: getVal(row, 'criteriacode') || '',
                                    description: getVal(row, 'criteriadescription') || ''
                                });
                            }
                        }
                    });

                    setFormData(prev => ({
                        ...prev,
                        knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
                        practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
                        workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules],
                    }));

                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';

                    setStatusModal({
                        type: 'success',
                        title: 'Import Successful',
                        message: 'Structured Curriculum spreadsheet imported successfully!',
                        onClose: () => setStatusModal(null)
                    });

                } else {
                    // Not structured, treat as raw text dump
                    const combinedText = rawRows.map(r => r.filter(c => String(c).trim()).join(' ')).join('\n');
                    processRawTextData(combinedText);

                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }

            } catch (err) {
                console.error(err);
                setIsImporting(false);
                setStatusModal({
                    type: 'error',
                    title: 'Import Failed',
                    message: 'Failed to read the file. Please check the format.',
                    onClose: () => setStatusModal(null)
                });
            }
        };

        reader.onerror = () => {
            setIsImporting(false);
            setStatusModal({
                type: 'error',
                title: 'Import Failed',
                message: 'Failed to read the file.',
                onClose: () => setStatusModal(null)
            });
        };

        reader.readAsArrayBuffer(file);
    };

    const handlePasteClick = () => {
        setIsProcessingText(true);
        setTimeout(() => {
            processRawTextData(rawText);
            setRawText('');
            setShowTextParser(false);
            setIsProcessingText(false);
        }, 100);
    };

    // ── Manual Module Management ──
    const addModule = () => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const newModules = [...(formData[key] as any[]), { name: '', code: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 4, topics: [] }];
        setFormData({ ...formData, [key]: newModules });
        setExpandedModules(prev => ({ ...prev, [`${activeTab}-${newModules.length - 1}`]: true }));
    };

    const updateModule = (index: number, field: string, value: string | number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        updated[index] = { ...updated[index], [field]: value };
        setFormData({ ...formData, [key]: updated });
    };

    const removeModule = (index: number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
    };

    // ── Deep-Cloning Topic Management ──
    const addTopic = (moduleIndex: number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };

        updatedModule.topics = [...(updatedModule.topics || []), { code: '', title: '', weight: 0, criteria: [] }];
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    const updateTopic = (moduleIndex: number, topicIndex: number, field: string, value: string | number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };
        const updatedTopics = [...(updatedModule.topics || [])];

        updatedTopics[topicIndex] = { ...updatedTopics[topicIndex], [field]: value };
        updatedModule.topics = updatedTopics;
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    const removeTopic = (moduleIndex: number, topicIndex: number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };

        updatedModule.topics = (updatedModule.topics || []).filter((_: any, i: number) => i !== topicIndex);
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    // ── Deep-Cloning Criteria Management ──
    const addCriteria = (moduleIndex: number, topicIndex: number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };
        const updatedTopics = [...(updatedModule.topics || [])];
        const updatedTopic = { ...updatedTopics[topicIndex] };

        updatedTopic.criteria = [...(updatedTopic.criteria || []), { code: '', description: '' }];
        updatedTopics[topicIndex] = updatedTopic;
        updatedModule.topics = updatedTopics;
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    const updateCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number, field: string, value: string) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };
        const updatedTopics = [...(updatedModule.topics || [])];
        const updatedTopic = { ...updatedTopics[topicIndex] };
        const updatedCriteria = [...(updatedTopic.criteria || [])];

        updatedCriteria[criteriaIndex] = { ...updatedCriteria[criteriaIndex], [field]: value };
        updatedTopic.criteria = updatedCriteria;
        updatedTopics[topicIndex] = updatedTopic;
        updatedModule.topics = updatedTopics;
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    const removeCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number) => {
        const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        const updatedModule = { ...updated[moduleIndex] };
        const updatedTopics = [...(updatedModule.topics || [])];
        const updatedTopic = { ...updatedTopics[topicIndex] };

        updatedTopic.criteria = (updatedTopic.criteria || []).filter((_: any, i: number) => i !== criteriaIndex);
        updatedTopics[topicIndex] = updatedTopic;
        updatedModule.topics = updatedTopics;
        updated[moduleIndex] = updatedModule;

        setFormData({ ...formData, [key]: updated });
    };

    // ── MANUAL SAVE FUNCTION ──
    const executeSave = async () => {
        try {
            const nameStr = formData.name?.toString() || '';
            const saqaStr = formData.saqaId?.toString() || '';
            const codeStr = (formData as any).curriculumCode?.toString() || '';

            if (!nameStr.trim() || !saqaStr.trim()) {
                setStatusModal({
                    type: 'warning',
                    title: 'Missing Details',
                    message: 'Please provide both a Programme Title and a SAQA ID before saving.',
                    onClose: () => setStatusModal(null)
                });
                return;
            }

            const formSaqa = saqaStr.trim();
            const formCode = codeStr.trim();

            const isDuplicate = (existingProgrammes || []).some(p => {
                if (programme && p.id === programme.id) return false;

                const existingSaqa = p.saqaId?.toString().trim();
                const existingCode = (p as any).curriculumCode?.toString().trim();

                const isSaqaMatch = formSaqa && existingSaqa && formSaqa === existingSaqa;
                const isCodeMatch = formCode && existingCode && formCode === existingCode;

                return isSaqaMatch || isCodeMatch;
            });

            if (isDuplicate) {
                setStatusModal({
                    type: 'error',
                    title: 'Duplicate Detected',
                    message: 'A qualification with this SAQA ID or Curriculum Code already exists in the system.',
                    onClose: () => setStatusModal(null)
                });
                return;
            }

            const rawId = formCode || formSaqa;
            const safeDocumentId = rawId.replace(/[\s/]+/g, '-');

            const dataToSave = {
                ...formData,
                id: formData.id || safeDocumentId
            };

            setIsSaving(true);
            await Promise.resolve(onSave(dataToSave));
            onClose();

        } catch (err: any) {
            console.error("Save failed:", err);
            setStatusModal({
                type: 'error',
                title: 'Save Failed',
                message: err.message || 'An unexpected error occurred while communicating with the database. Please try again.',
                onClose: () => setStatusModal(null)
            });
        } finally {
            setIsSaving(false);
        }
    };

    const currentModules = formData[`${activeTab}Modules`] as any[];

    return (
        <>
            <div className="pfm-overlay" onClick={onClose}>
                <div className="pfm-modal" onClick={e => e.stopPropagation()}>

                    <div className="pfm-header">
                        <h2 className="pfm-header__title"><BookOpen size={16} />{title}</h2>
                        <button className="pfm-close-btn" onClick={onClose} type="button" disabled={isSaving}><X size={20} /></button>
                    </div>

                    <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                        <div className="pfm-body">

                            {/* Metadata */}
                            <div>
                                <div className="pfm-section-hdr"><BookOpen size={13} />Qualification Metadata</div>
                                <div className="pfm-details-grid">
                                    <div className="pfm-fg pfm-fg--full">
                                        <label>Programme Title *</label>
                                        <input className="pfm-input" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Occupational Certificate: Software Developer" />
                                    </div>

                                    <div className="pfm-fg">
                                        <label>Programme Type *</label>
                                        <select className="pfm-input" name="programmeType" required value={(formData as any).programmeType || 'Occupational Certificate'} onChange={handleChange}>
                                            <option value="" disabled>Select Type...</option>
                                            <option value="Occupational Certificate">Occupational Certificate</option>
                                            <option value="Skills Programme">Skills Programme</option>
                                            <option value="Learnership">Learnership</option>
                                            <option value="Short Course">Short Course</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>
                                    <div className="pfm-fg">
                                        <label>Accrediting Body *</label>
                                        <select className="pfm-input" name="accreditingBody" required value={(formData as any).accreditingBody || 'QCTO'} onChange={handleChange}>
                                            <option value="" disabled>Select Body...</option>
                                            <option value="QCTO">QCTO</option>
                                            <option value="Umalusi">Umalusi</option>
                                            <option value="CHE">Council on Higher Education (CHE)</option>
                                            <option value="MICT SETA">MICT SETA</option>
                                            <option value="IITPSA">IITPSA</option>
                                            <option value="Services SETA">Services SETA</option>
                                            <option value="MERSETA">MERSETA</option>
                                            <option value="FASSET">FASSET</option>
                                            <option value="HWSETA">HWSETA</option>
                                            <option value="EWSETA">EWSETA</option>
                                            <option value="PSETA">PSETA</option>
                                            <option value="INSETA">INSETA</option>
                                            <option value="CATHSSETA">CATHSSETA</option>
                                            <option value="Other">Other</option>
                                        </select>
                                    </div>

                                    <div className="pfm-fg">
                                        <label>SAQA ID *</label>
                                        <input className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} />
                                    </div>
                                    <div className="pfm-fg">
                                        <label>Curriculum Code</label>
                                        <input className="pfm-input" type="text" name="curriculumCode" value={(formData as any).curriculumCode || ''} onChange={handleChange} placeholder="e.g. 251201005" />
                                    </div>

                                    <div className="pfm-fg"><label>NQF Level *</label><input className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} /></div>
                                    <div className="pfm-fg"><label>Total Credits *</label><input className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} /></div>

                                    <div className="pfm-fg"><label>Total Notional Hours *</label><input className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} /></div>
                                    {programme ? (
                                        <div className="pfm-fg" style={{ justifyContent: 'flex-end' }}>
                                            <label className="pfm-checkbox-row">
                                                <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange as any} />
                                                Archive this programme
                                            </label>
                                        </div>
                                    ) : (
                                        <div></div>
                                    )}
                                </div>
                            </div>

                            {/* Curriculum Matrix Header */}
                            <div>
                                <div className="pfm-modules-hdr">
                                    <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum Matrix</div>
                                    <div className="pfm-import-actions">

                                        {/* TWO TEMPLATE DOWNLOAD OPTIONS (Static Files) */}
                                        <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--mlab-border)', paddingRight: '8px', marginRight: '4px' }}>
                                            <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('xlsx')}>
                                                <FileSpreadsheet size={12} color="#10b981" /> .XLSX Template
                                            </button>
                                            <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('csv')}>
                                                <FileText size={12} color="#0ea5e9" /> .CSV
                                            </button>
                                        </div>

                                        <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                                        <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                                            {isImporting ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import File</>}
                                        </button>
                                        <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
                                            <ClipboardPaste size={12} /> Paste QCTO Text
                                        </button>
                                    </div>
                                </div>
                                <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

                                {/* Parser UI */}
                                {showTextParser && (
                                    <div className="pfm-parser-panel">
                                        <p className="pfm-parser-panel__hint">Paste raw text directly from the QCTO Form 2 PDF here.</p>
                                        <textarea className="pfm-parser-textarea" placeholder="Paste raw text here…" value={rawText} onChange={e => setRawText(e.target.value)} disabled={isProcessingText} />
                                        <div className="pfm-parser-panel__actions">
                                            <button type="button" className="pfm-btn pfm-btn--ghost" onClick={() => setShowTextParser(false)} disabled={isProcessingText}>Cancel</button>
                                            <button type="button" className="pfm-btn pfm-btn--primary" onClick={handlePasteClick} disabled={!rawText.trim() || isProcessingText}>
                                                {isProcessingText ? <><Loader2 size={13} className="pfm-spin" /> Processing…</> : 'Process Text'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Tabs */}
                                <div className="pfm-tabs">
                                    {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
                                        <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                                            {TAB_META[tab].icon}{TAB_META[tab].label}
                                            <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
                                        </button>
                                    ))}
                                </div>

                                {/* Module List */}
                                <div className="pfm-module-list">
                                    {currentModules.length === 0 ? (
                                        <div className="pfm-empty-state"><Layers size={32} style={{ opacity: 0.3, marginBottom: '0.6rem' }} /><div>No modules yet.</div></div>
                                    ) : currentModules.map((module, mIdx) => {
                                        const isExpanded = !!expandedModules[`${activeTab}-${mIdx}`];
                                        return (
                                            <div key={mIdx} className="pfm-module-card">
                                                <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
                                                    <button type="button" className="pfm-expand-btn" onClick={() => toggleExpandModule(mIdx)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                                                    <input className="pfm-module-input pfm-module-input--code" placeholder="Module Code" value={module.code || ''} onChange={e => updateModule(mIdx, 'code', e.target.value)} />
                                                    <input className="pfm-module-input pfm-module-input--name" placeholder="Module Name" value={module.name} onChange={e => updateModule(mIdx, 'name', e.target.value)} />
                                                    <input className="pfm-module-input pfm-module-input--credits" type="number" placeholder="Cr" value={module.credits || ''} onChange={e => updateModule(mIdx, 'credits', parseInt(e.target.value) || 0)} />
                                                    <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}><Trash2 size={15} /></button>
                                                </div>

                                                {isExpanded && (
                                                    <div className="pfm-module-card__body">
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                            <span className="pfm-topics-label">
                                                                {activeTab === 'workExperience' ? 'Logbook Entries / Tasks' : 'Assessed Topics'}
                                                            </span>
                                                            <button type="button" onClick={() => addTopic(mIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                <Plus size={12} /> {activeTab === 'workExperience' ? 'Add Task' : 'Add Topic'}
                                                            </button>
                                                        </div>

                                                        {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
                                                            <div key={tIdx} className="pfm-topic" style={{ borderLeft: `3px solid ${activeTab === 'practical' ? '#f59e0b' : activeTab === 'workExperience' ? 'var(--mlab-green)' : '#0ea5e9'}` }}>
                                                                <div className="pfm-topic__header" style={{ display: 'flex', gap: '6px' }}>
                                                                    <input className="pfm-input" style={{ width: '120px', padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Code" value={topic.code} onChange={e => updateTopic(mIdx, tIdx, 'code', e.target.value)} />
                                                                    <input className="pfm-input" style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Topic Title" value={topic.title} onChange={e => updateTopic(mIdx, tIdx, 'title', e.target.value)} />
                                                                    {activeTab !== 'workExperience' && (
                                                                        <input className="pfm-input" style={{ width: '60px', padding: '4px 6px', fontSize: '0.8rem' }} type="number" placeholder="%" value={topic.weight || ''} onChange={e => updateTopic(mIdx, tIdx, 'weight', parseInt(e.target.value) || 0)} />
                                                                    )}
                                                                    <button type="button" className="pfm-remove-btn" onClick={() => removeTopic(mIdx, tIdx)}><Trash2 size={14} /></button>
                                                                </div>

                                                                <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--mlab-border)', marginTop: '0.5rem' }}>
                                                                    {topic.criteria?.map((crit: any, cIdx: number) => (
                                                                        <div key={cIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                                                                            <input className="pfm-input" style={{ width: '90px', fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Code" value={crit.code} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'code', e.target.value)} />
                                                                            <input className="pfm-input" style={{ flex: 1, fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Criteria Description" value={crit.description} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'description', e.target.value)} />
                                                                            <button type="button" className="pfm-remove-btn" style={{ padding: '2px' }} onClick={() => removeCriteria(mIdx, tIdx, cIdx)}><X size={12} /></button>
                                                                        </div>
                                                                    ))}
                                                                    <button type="button" onClick={() => addCriteria(mIdx, tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#0ea5e9', padding: '4px 0', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' }}>
                                                                        <Plus size={10} /> Add Criteria
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )) : <p className="pfm-no-topics">No {activeTab === 'workExperience' ? 'tasks' : 'topics'} defined.</p>}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}

                                    <button type="button" className="pfm-add-module-btn" onClick={addModule}>
                                        <Plus size={14} /> Add Module Manually
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="pfm-footer">
                            <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="button" className="pfm-btn pfm-btn--primary" onClick={executeSave} disabled={isSaving}>
                                {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* StatusModal rendered OUTSIDE of the pfm-overlay */}
            {statusModal && (
                <StatusModal
                    type={statusModal.type}
                    title={statusModal.title}
                    message={statusModal.message}
                    onClose={statusModal.onClose}
                    onCancel={statusModal.onCancel}
                    confirmText={statusModal.confirmText}
                />
            )}
        </>
    );
};
