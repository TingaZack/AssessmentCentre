
// src/components/admin/ProgrammeFormModal.tsx


import React, { useState, useRef } from 'react';
import {
    X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
    Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2, AlertCircle
} from 'lucide-react';
import Papa from 'papaparse';
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
    const [isDownloading, setIsDownloading] = useState(false);
    const [isImportingCSV, setIsImportingCSV] = useState(false);
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

    // ── Template downloader ──
    const handleDownloadTemplate = async () => {
        setIsDownloading(true);
        await new Promise(resolve => setTimeout(resolve, 500));

        const csvContent = [
            "Type,Category,ModuleCode,ModuleName,NQFLevel,Credits,TopicCode,TopicName,Weight,CriteriaCode,CriteriaDescription",
            "Module,Knowledge,251201-005-00-KM-01,\"Computers and Computing Systems\",4,12,,,,,",
            "Topic,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,\"Problem solving skills for IT Professionals\",5,,",
            "Criteria,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,,,KT 0101,\"Identification of the problem\"",
            "Criteria,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,,,KT 0102,\"Establishing a probable cause\"",
            "Module,Practical,251201-005-00-PM-01,\"Use Software to Communicate\",4,3,,,,,",
            "Topic,Practical,251201-005-00-PM-01,,,,PM-01-PS01,\"Use electronic communication\",0,,",
            "Module,Workplace,251201-005-00-WM-01,\"Technical Requirement Analysis\",5,15,,,,,"
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", "QCTO_Curriculum_Template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsDownloading(false);
    };

    // ── 🚀 CORE PARSER: FIXED TOPIC TITLE EXTRACTION 🚀 ──
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

    // ── Hybrid CSV upload ──
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsImportingCSV(true);
        setTimeout(() => {
            Papa.parse(file, {
                header: false, skipEmptyLines: true,
                complete: (results) => {
                    const rows = results.data as string[][];
                    if (!rows.length) { setIsImportingCSV(false); return; }

                    const headerRow = rows[0].map(h => (h || '').trim().toLowerCase());
                    const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

                    if (isStructured) {
                        Papa.parse(file, {
                            header: true, skipEmptyLines: true,
                            complete: (sr) => {
                                const sRows = sr.data as any[];
                                const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
                                const moduleMap = new Map<string, any>();
                                const topicMap = new Map<string, any>();
                                sRows.forEach(row => {
                                    const type = row['Type']?.trim();
                                    const cat = row['Category']?.trim();
                                    const mCode = row['ModuleCode']?.trim();
                                    const tCode = row['TopicCode']?.trim();
                                    if (!mCode) return;
                                    if (type === 'Module') {
                                        const m = { code: mCode, name: row['ModuleName']?.trim() || '', nqfLevel: parseInt(row['NQFLevel']) || 4, credits: parseInt(row['Credits']) || 0, notionalHours: 0, topics: [] };
                                        moduleMap.set(mCode, m);
                                        if (cat === 'Knowledge') parsed.knowledgeModules.push(m);
                                        else if (cat === 'Practical') parsed.practicalModules.push(m);
                                        else if (cat === 'Workplace' || cat === 'WorkExperience') parsed.workExperienceModules.push(m);
                                    } else if (type === 'Topic' && tCode) {
                                        const parent = moduleMap.get(mCode);
                                        if (parent) { const t = { code: tCode, title: row['TopicName']?.trim() || '', weight: parseInt(row['Weight']) || 0, criteria: [] }; parent.topics.push(t); topicMap.set(tCode, t); }
                                    } else if (type === 'Criteria') {
                                        const pt = topicMap.get(tCode);
                                        if (pt) pt.criteria.push({ code: row['CriteriaCode']?.trim() || '', description: row['CriteriaDescription']?.trim() || '' });
                                    }
                                });
                                setFormData(prev => ({
                                    ...prev,
                                    knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
                                    practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
                                    workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules],
                                }));
                                setIsImportingCSV(false);
                                if (fileInputRef.current) fileInputRef.current.value = '';

                                setStatusModal({
                                    type: 'success',
                                    title: 'Import Successful',
                                    message: 'Structured Curriculum CSV imported successfully!',
                                    onClose: () => setStatusModal(null)
                                });
                            },
                        });
                    } else {
                        const combinedText = rows.map(r => r.filter(c => c?.trim()).join(' ')).join('\n');
                        processRawTextData(combinedText);
                        setIsImportingCSV(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                    }
                },
                error: (err) => {
                    console.error(err);
                    setIsImportingCSV(false);
                    setStatusModal({
                        type: 'error',
                        title: 'Import Failed',
                        message: 'Failed to read the CSV file. Please check the format.',
                        onClose: () => setStatusModal(null)
                    });
                },
            });
        }, 100);
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

    // 🚀 FIXED: WRAPPED IN A REACT FRAGMENT (<>) 🚀
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
                                        <button type="button" className="pfm-import-btn" onClick={handleDownloadTemplate} disabled={isDownloading}>
                                            {isDownloading ? <><Loader2 size={12} className="pfm-spin" /> Preparing…</> : <><Download size={12} /> Template</>}
                                        </button>
                                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                                        <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImportingCSV}>
                                            {isImportingCSV ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import CSV</>}
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

            {/* 🚀 FIXED: StatusModal rendered OUTSIDE of the pfm-overlay 🚀 */}
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


// import React, { useState, useRef } from 'react';
// import {
//     X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
//     Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2
// } from 'lucide-react';
// import Papa from 'papaparse';
// import './ProgrammeFormModal.css';
// import type { ModuleCategory, ProgrammeTemplate } from '../../../types';
// import { StatusModal, type StatusModalProps } from '../../common/StatusModal';

// interface ProgrammeFormModalProps {
//     programme?: ProgrammeTemplate | null;
//     existingProgrammes: ProgrammeTemplate[];
//     onClose: () => void;
//     onSave: (programme: ProgrammeTemplate) => void;
//     title: string;
// }

// const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
//     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0,
//     knowledgeModules: [], practicalModules: [], workExperienceModules: [], isArchived: false,
// };

// const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
//     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
//     practical: { label: 'Practical', icon: <FileText size={13} /> },
//     workExperience: { label: 'Workplace', icon: <Briefcase size={13} /> },
// };

// export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
//     programme, existingProgrammes, onClose, onSave, title,
// }) => {
//     const [formData, setFormData] = useState<ProgrammeTemplate>(
//         programme ? { ...programme } : {
//             ...emptyProgramme,
//             curriculumCode: '',
//             programmeType: 'Occupational Certificate',
//             accreditingBody: 'QCTO',
//             id: ''
//         } as any
//     );
//     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
//     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
//     const [showTextParser, setShowTextParser] = useState(false);
//     const [rawText, setRawText] = useState('');

//     // ─── STATUS MODAL STATE ───
//     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

//     // Loading states
//     const [isDownloading, setIsDownloading] = useState(false);
//     const [isImportingCSV, setIsImportingCSV] = useState(false);
//     const [isProcessingText, setIsProcessingText] = useState(false);
//     const [isSaving, setIsSaving] = useState(false);

//     const fileInputRef = useRef<HTMLInputElement>(null);

//     const toggleExpandModule = (index: number) => {
//         const key = `${activeTab}-${index}`;
//         setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
//     };

//     const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
//         const { name, value, type } = e.target;

//         let finalValue: any = value;
//         if (type === 'number') {
//             finalValue = parseInt(value) || 0;
//         } else if (type === 'checkbox') {
//             finalValue = (e.target as HTMLInputElement).checked;
//         }

//         setFormData({
//             ...formData,
//             [name]: finalValue,
//         });
//     };

//     // ── Template downloader ──
//     const handleDownloadTemplate = async () => {
//         setIsDownloading(true);
//         await new Promise(resolve => setTimeout(resolve, 500));

//         const csvContent = [
//             "Type,Category,ModuleCode,ModuleName,NQFLevel,Credits,TopicCode,TopicName,Weight,CriteriaCode,CriteriaDescription",
//             "Module,Knowledge,251201-005-00-KM-01,\"Computers and Computing Systems\",4,12,,,,,",
//             "Topic,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,\"Problem solving skills for IT Professionals\",5,,",
//             "Criteria,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,,,KT 0101,\"Identification of the problem\"",
//             "Criteria,Knowledge,251201-005-00-KM-01,,,,KM-01-KT01,,,KT 0102,\"Establishing a probable cause\"",
//             "Module,Practical,251201-005-00-PM-01,\"Use Software to Communicate\",4,3,,,,,",
//             "Topic,Practical,251201-005-00-PM-01,,,,PM-01-PS01,\"Use electronic communication\",0,,",
//             "Module,Workplace,251201-005-00-WM-01,\"Technical Requirement Analysis\",5,15,,,,,"
//         ].join("\n");

//         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
//         const link = document.createElement("a");
//         link.setAttribute("href", URL.createObjectURL(blob));
//         link.setAttribute("download", "QCTO_Curriculum_Template.csv");
//         link.style.visibility = 'hidden';
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//         setIsDownloading(false);
//     };

//     // ── 🚀 CORE PARSER: FIXED TOPIC TITLE EXTRACTION 🚀 ──
//     const processRawTextData = (textToParse: string) => {
//         if (!textToParse.trim()) return;
//         let sanitized = textToParse
//             .replace(/pg\.?\s*\d+(-\d+)?/gi, ' ')
//             .replace(/P\s*M-/gi, 'PM-').replace(/K\s*M-/gi, 'KM-').replace(/W\s*M-/gi, 'WM-')
//             .replace(/Topic elements to be covered include:?/gi, ' ')
//             .replace(/SECTION\s+\w+:\s+[A-Z\s]+SPECIFICATIONS/gi, ' ');

//         const moduleRegex = /(251201-\d{3}-\d{2}-(KM|PM|WM)-\d{2})/i;
//         const moduleTokens = sanitized.split(moduleRegex);

//         let kMs: any[] = [...(formData.knowledgeModules || [])];
//         let pMs: any[] = [...(formData.practicalModules || [])];
//         let wMs: any[] = [...(formData.workExperienceModules || [])];

//         for (let i = 1; i < moduleTokens.length; i += 3) {
//             const mCode = moduleTokens[i];
//             const mType = moduleTokens[i + 1].toUpperCase();
//             const mText = moduleTokens[i + 2] || '';

//             const nqfMatch = mText.match(/NQF Level\s*(\d+)/i);
//             const credMatch = mText.match(/Credits\s*(\d+)/i);
//             const mNqf = nqfMatch ? parseInt(nqfMatch[1], 10) : (formData.nqfLevel || 4);
//             const mCredits = credMatch ? parseInt(credMatch[1], 10) : 0;

//             let nameEnd = mText.length;
//             if (nqfMatch?.index !== undefined) nameEnd = Math.min(nameEnd, nqfMatch.index);
//             const firstTopic = mText.match(/(KM|PM|WM)-\d{2}-(KT|PS|WE)\d{2}/i);
//             if (firstTopic?.index !== undefined) nameEnd = Math.min(nameEnd, firstTopic.index);
//             const mName = mText.substring(0, nameEnd).replace(/^[, \-]+|[, \-]+$/g, '').trim();

//             const newModule: any = {
//                 code: mCode, name: mName || `${mType} Module`,
//                 nqfLevel: mNqf, credits: mCredits, notionalHours: mCredits * 10, topics: [],
//             };

//             const topicTokens = mText.split(/((?:KM|PM|WM)-\d{2}-(?:KT|PS|WE)\d{2})/i);
//             for (let j = 1; j < topicTokens.length; j += 2) {
//                 const tCode = topicTokens[j];
//                 const tText = topicTokens[j + 1] || '';

//                 const firstCriteriaIndex = tText.search(/•|(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
//                 let headerPart = firstCriteriaIndex !== -1 ? tText.substring(0, firstCriteriaIndex) : tText;
//                 const criteriaPart = firstCriteriaIndex !== -1 ? tText.substring(firstCriteriaIndex) : '';

//                 headerPart = headerPart.replace(/^[\s:]+/, '').trim();

//                 let tWeight = 0;
//                 const weightMatch = headerPart.match(/(\d+)\s*%$/);
//                 if (weightMatch) {
//                     tWeight = parseInt(weightMatch[1], 10);
//                     headerPart = headerPart.replace(/(\d+)\s*%$/, '').trim();
//                 }

//                 let tTitle = headerPart || 'Topic';
//                 if (tTitle.length > 150) tTitle = tTitle.substring(0, 150) + '...';

//                 const newTopic: any = { code: tCode, title: tTitle, weight: tWeight, criteria: [] };

//                 const lines = criteriaPart.split(/•/).map(l => l.trim()).filter(Boolean);
//                 lines.forEach(line => {
//                     const cMatch = line.match(/(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
//                     if (cMatch) {
//                         const cCode = cMatch[1].replace(/\s+/g, '');
//                         const cDesc = line.replace(cMatch[1], '').replace(/^[:\-]\s*/, '').trim();
//                         if (cDesc) newTopic.criteria.push({ code: cCode, description: cDesc });
//                     }
//                 });
//                 newModule.topics.push(newTopic);
//             }

//             if (mType === 'KM') kMs.push(newModule);
//             else if (mType === 'PM') pMs.push(newModule);
//             else if (mType === 'WM') wMs.push(newModule);
//         }

//         setFormData(prev => ({
//             ...prev,
//             knowledgeModules: kMs, practicalModules: pMs, workExperienceModules: wMs,
//         }));

//         setStatusModal({
//             type: 'success',
//             title: 'Parsing Complete',
//             message: 'QCTO Curriculum text parsed successfully!',
//             onClose: () => setStatusModal(null)
//         });
//     };

//     // ── Hybrid CSV upload ──
//     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
//         const file = event.target.files?.[0];
//         if (!file) return;
//         setIsImportingCSV(true);
//         setTimeout(() => {
//             Papa.parse(file, {
//                 header: false, skipEmptyLines: true,
//                 complete: (results) => {
//                     const rows = results.data as string[][];
//                     if (!rows.length) { setIsImportingCSV(false); return; }

//                     const headerRow = rows[0].map(h => (h || '').trim().toLowerCase());
//                     const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

//                     if (isStructured) {
//                         Papa.parse(file, {
//                             header: true, skipEmptyLines: true,
//                             complete: (sr) => {
//                                 const sRows = sr.data as any[];
//                                 const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
//                                 const moduleMap = new Map<string, any>();
//                                 const topicMap = new Map<string, any>();
//                                 sRows.forEach(row => {
//                                     const type = row['Type']?.trim();
//                                     const cat = row['Category']?.trim();
//                                     const mCode = row['ModuleCode']?.trim();
//                                     const tCode = row['TopicCode']?.trim();
//                                     if (!mCode) return;
//                                     if (type === 'Module') {
//                                         const m = { code: mCode, name: row['ModuleName']?.trim() || '', nqfLevel: parseInt(row['NQFLevel']) || 4, credits: parseInt(row['Credits']) || 0, notionalHours: 0, topics: [] };
//                                         moduleMap.set(mCode, m);
//                                         if (cat === 'Knowledge') parsed.knowledgeModules.push(m);
//                                         else if (cat === 'Practical') parsed.practicalModules.push(m);
//                                         else if (cat === 'Workplace' || cat === 'WorkExperience') parsed.workExperienceModules.push(m);
//                                     } else if (type === 'Topic' && tCode) {
//                                         const parent = moduleMap.get(mCode);
//                                         if (parent) { const t = { code: tCode, title: row['TopicName']?.trim() || '', weight: parseInt(row['Weight']) || 0, criteria: [] }; parent.topics.push(t); topicMap.set(tCode, t); }
//                                     } else if (type === 'Criteria') {
//                                         const pt = topicMap.get(tCode);
//                                         if (pt) pt.criteria.push({ code: row['CriteriaCode']?.trim() || '', description: row['CriteriaDescription']?.trim() || '' });
//                                     }
//                                 });
//                                 setFormData(prev => ({
//                                     ...prev,
//                                     knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
//                                     practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
//                                     workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules],
//                                 }));
//                                 setIsImportingCSV(false);
//                                 if (fileInputRef.current) fileInputRef.current.value = '';

//                                 setStatusModal({
//                                     type: 'success',
//                                     title: 'Import Successful',
//                                     message: 'Structured Curriculum CSV imported successfully!',
//                                     onClose: () => setStatusModal(null)
//                                 });
//                             },
//                         });
//                     } else {
//                         const combinedText = rows.map(r => r.filter(c => c?.trim()).join(' ')).join('\n');
//                         processRawTextData(combinedText);
//                         setIsImportingCSV(false);
//                         if (fileInputRef.current) fileInputRef.current.value = '';
//                     }
//                 },
//                 error: (err) => {
//                     console.error(err);
//                     setIsImportingCSV(false);
//                     setStatusModal({
//                         type: 'error',
//                         title: 'Import Failed',
//                         message: 'Failed to read the CSV file. Please check the format.',
//                         onClose: () => setStatusModal(null)
//                     });
//                 },
//             });
//         }, 100);
//     };

//     const handlePasteClick = () => {
//         setIsProcessingText(true);
//         setTimeout(() => {
//             processRawTextData(rawText);
//             setRawText('');
//             setShowTextParser(false);
//             setIsProcessingText(false);
//         }, 100);
//     };

//     // ── Manual Module Management ──
//     const addModule = () => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const newModules = [...(formData[key] as any[]), { name: '', code: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 4, topics: [] }];
//         setFormData({ ...formData, [key]: newModules });
//         setExpandedModules(prev => ({ ...prev, [`${activeTab}-${newModules.length - 1}`]: true }));
//     };

//     const updateModule = (index: number, field: string, value: string | number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         updated[index] = { ...updated[index], [field]: value };
//         setFormData({ ...formData, [key]: updated });
//     };

//     const removeModule = (index: number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
//     };

//     // ── 🚀 FIXED: DEEP-CLONING TOPIC MANAGEMENT 🚀 ──
//     const addTopic = (moduleIndex: number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };

//         updatedModule.topics = [...(updatedModule.topics || []), { code: '', title: '', weight: 0, criteria: [] }];
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     const updateTopic = (moduleIndex: number, topicIndex: number, field: string, value: string | number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };
//         const updatedTopics = [...(updatedModule.topics || [])];

//         updatedTopics[topicIndex] = { ...updatedTopics[topicIndex], [field]: value };
//         updatedModule.topics = updatedTopics;
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     const removeTopic = (moduleIndex: number, topicIndex: number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };

//         updatedModule.topics = (updatedModule.topics || []).filter((_: any, i: number) => i !== topicIndex);
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     // ── 🚀 FIXED: DEEP-CLONING CRITERIA MANAGEMENT 🚀 ──
//     const addCriteria = (moduleIndex: number, topicIndex: number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };
//         const updatedTopics = [...(updatedModule.topics || [])];
//         const updatedTopic = { ...updatedTopics[topicIndex] };

//         updatedTopic.criteria = [...(updatedTopic.criteria || []), { code: '', description: '' }];
//         updatedTopics[topicIndex] = updatedTopic;
//         updatedModule.topics = updatedTopics;
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     const updateCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number, field: string, value: string) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };
//         const updatedTopics = [...(updatedModule.topics || [])];
//         const updatedTopic = { ...updatedTopics[topicIndex] };
//         const updatedCriteria = [...(updatedTopic.criteria || [])];

//         updatedCriteria[criteriaIndex] = { ...updatedCriteria[criteriaIndex], [field]: value };
//         updatedTopic.criteria = updatedCriteria;
//         updatedTopics[topicIndex] = updatedTopic;
//         updatedModule.topics = updatedTopics;
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     const removeCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number) => {
//         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
//         const updated = [...(formData[key] as any[])];
//         const updatedModule = { ...updated[moduleIndex] };
//         const updatedTopics = [...(updatedModule.topics || [])];
//         const updatedTopic = { ...updatedTopics[topicIndex] };

//         updatedTopic.criteria = (updatedTopic.criteria || []).filter((_: any, i: number) => i !== criteriaIndex);
//         updatedTopics[topicIndex] = updatedTopic;
//         updatedModule.topics = updatedTopics;
//         updated[moduleIndex] = updatedModule;

//         setFormData({ ...formData, [key]: updated });
//     };

//     // ── 🚀 FIXED: MANUAL SAVE FUNCTION (BYPASSING FORM SUBMIT BUGS) 🚀 ──
//     const executeSave = async () => {
//         try {
//             // 1. Manually check for missing required fields safely
//             const nameStr = formData.name?.toString() || '';
//             const saqaStr = formData.saqaId?.toString() || '';

//             if (!nameStr.trim() || !saqaStr.trim()) {
//                 setStatusModal({
//                     type: 'warning',
//                     title: 'Missing Details',
//                     message: 'Please provide both a Programme Title and a SAQA ID before saving.',
//                     onClose: () => setStatusModal(null)
//                 });
//                 return;
//             }

//             // 2. Check for duplicates securely
//             const formSaqa = saqaStr.trim();
//             const formCode = (formData as any).curriculumCode?.toString().trim();

//             const isDuplicate = (existingProgrammes || []).some(p => {
//                 // If editing existing, ignore itself
//                 if (programme && p.id === programme.id) return false;

//                 const existingSaqa = p.saqaId?.toString().trim();
//                 const existingCode = (p as any).curriculumCode?.toString().trim();

//                 // Only trigger duplicate error if they actually have values to compare
//                 const isSaqaMatch = formSaqa && existingSaqa && formSaqa === existingSaqa;
//                 const isCodeMatch = formCode && existingCode && formCode === existingCode;

//                 return isSaqaMatch || isCodeMatch;
//             });

//             if (isDuplicate) {
//                 setStatusModal({
//                     type: 'error',
//                     title: 'Duplicate Detected',
//                     message: 'A qualification with this SAQA ID or Curriculum Code already exists in the system. Please ensure you are not creating a duplicate.',
//                     onClose: () => setStatusModal(null)
//                 });
//                 return;
//             }

//             // 3. Perform the save
//             setIsSaving(true);
//             await Promise.resolve(onSave(formData));
//             // Assuming parent handles closing modal on success or resolving promise

//         } catch (err: any) {
//             console.error("Save failed:", err);
//             setStatusModal({
//                 type: 'error',
//                 title: 'Save Failed',
//                 message: err.message || 'An unexpected error occurred while communicating with the database. Please try again.',
//                 onClose: () => setStatusModal(null)
//             });
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     const currentModules = formData[`${activeTab}Modules`] as any[];

//     return (
//         <div className="pfm-overlay" onClick={onClose}>
//             <div className="pfm-modal" onClick={e => e.stopPropagation()}>

//                 <div className="pfm-header">
//                     <h2 className="pfm-header__title"><BookOpen size={16} />{title}</h2>
//                     <button className="pfm-close-btn" onClick={onClose} type="button" disabled={isSaving}><X size={20} /></button>
//                 </div>

//                 {/* 🚀 FIXED: Prevent default submit to stop silent failing 🚀 */}
//                 <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
//                     <div className="pfm-body">

//                         {/* Metadata */}
//                         <div>
//                             <div className="pfm-section-hdr"><BookOpen size={13} />Qualification Metadata</div>
//                             <div className="pfm-details-grid">
//                                 <div className="pfm-fg pfm-fg--full">
//                                     <label>Programme Title *</label>
//                                     <input className="pfm-input" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Occupational Certificate: Software Developer" />
//                                 </div>

//                                 <div className="pfm-fg">
//                                     <label>Programme Type *</label>
//                                     <select className="pfm-input" name="programmeType" required value={(formData as any).programmeType || 'Occupational Certificate'} onChange={handleChange}>
//                                         <option value="" disabled>Select Type...</option>
//                                         <option value="Occupational Certificate">Occupational Certificate</option>
//                                         <option value="Skills Programme">Skills Programme</option>
//                                         <option value="Learnership">Learnership</option>
//                                         <option value="Short Course">Short Course</option>
//                                         <option value="Other">Other</option>
//                                     </select>
//                                 </div>
//                                 <div className="pfm-fg">
//                                     <label>Accrediting Body *</label>
//                                     <select className="pfm-input" name="accreditingBody" required value={(formData as any).accreditingBody || 'QCTO'} onChange={handleChange}>
//                                         <option value="" disabled>Select Body...</option>
//                                         <option value="QCTO">QCTO</option>
//                                         <option value="Umalusi">Umalusi</option>
//                                         <option value="CHE">Council on Higher Education (CHE)</option>
//                                         <option value="MICT SETA">MICT SETA</option>
//                                         <option value="IITPSA">IITPSA</option>
//                                         <option value="Services SETA">Services SETA</option>
//                                         <option value="MERSETA">MERSETA</option>
//                                         <option value="FASSET">FASSET</option>
//                                         <option value="HWSETA">HWSETA</option>
//                                         <option value="EWSETA">EWSETA</option>
//                                         <option value="PSETA">PSETA</option>
//                                         <option value="INSETA">INSETA</option>
//                                         <option value="CATHSSETA">CATHSSETA</option>
//                                         <option value="Other">Other</option>
//                                     </select>
//                                 </div>

//                                 <div className="pfm-fg">
//                                     <label>SAQA ID *</label>
//                                     <input className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} />
//                                 </div>
//                                 <div className="pfm-fg">
//                                     <label>Curriculum Code</label>
//                                     <input className="pfm-input" type="text" name="curriculumCode" value={(formData as any).curriculumCode || ''} onChange={handleChange} placeholder="e.g. 251201005" />
//                                 </div>

//                                 <div className="pfm-fg"><label>NQF Level *</label><input className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} /></div>
//                                 <div className="pfm-fg"><label>Total Credits *</label><input className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} /></div>

//                                 <div className="pfm-fg"><label>Total Notional Hours *</label><input className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} /></div>
//                                 {programme ? (
//                                     <div className="pfm-fg" style={{ justifyContent: 'flex-end' }}>
//                                         <label className="pfm-checkbox-row">
//                                             <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange as any} />
//                                             Archive this programme
//                                         </label>
//                                     </div>
//                                 ) : (
//                                     <div></div>
//                                 )}
//                             </div>
//                         </div>

//                         {/* Curriculum Matrix Header */}
//                         <div>
//                             <div className="pfm-modules-hdr">
//                                 <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum Matrix</div>
//                                 <div className="pfm-import-actions">
//                                     <button type="button" className="pfm-import-btn" onClick={handleDownloadTemplate} disabled={isDownloading}>
//                                         {isDownloading ? <><Loader2 size={12} className="pfm-spin" /> Preparing…</> : <><Download size={12} /> Template</>}
//                                     </button>
//                                     <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
//                                     <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImportingCSV}>
//                                         {isImportingCSV ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import CSV</>}
//                                     </button>
//                                     <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
//                                         <ClipboardPaste size={12} /> Paste QCTO Text
//                                     </button>
//                                 </div>
//                             </div>
//                             <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

//                             {/* Parser UI */}
//                             {showTextParser && (
//                                 <div className="pfm-parser-panel">
//                                     <p className="pfm-parser-panel__hint">Paste raw text directly from the QCTO Form 2 PDF here.</p>
//                                     <textarea className="pfm-parser-textarea" placeholder="Paste raw text here…" value={rawText} onChange={e => setRawText(e.target.value)} disabled={isProcessingText} />
//                                     <div className="pfm-parser-panel__actions">
//                                         <button type="button" className="pfm-btn pfm-btn--ghost" onClick={() => setShowTextParser(false)} disabled={isProcessingText}>Cancel</button>
//                                         <button type="button" className="pfm-btn pfm-btn--primary" onClick={handlePasteClick} disabled={!rawText.trim() || isProcessingText}>
//                                             {isProcessingText ? <><Loader2 size={13} className="pfm-spin" /> Processing…</> : 'Process Text'}
//                                         </button>
//                                     </div>
//                                 </div>
//                             )}

//                             {/* Tabs */}
//                             <div className="pfm-tabs">
//                                 {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
//                                     <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
//                                         {TAB_META[tab].icon}{TAB_META[tab].label}
//                                         <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
//                                     </button>
//                                 ))}
//                             </div>

//                             {/* Module List */}
//                             <div className="pfm-module-list">
//                                 {currentModules.length === 0 ? (
//                                     <div className="pfm-empty-state"><Layers size={32} style={{ opacity: 0.3, marginBottom: '0.6rem' }} /><div>No modules yet.</div></div>
//                                 ) : currentModules.map((module, mIdx) => {
//                                     const isExpanded = !!expandedModules[`${activeTab}-${mIdx}`];
//                                     return (
//                                         <div key={mIdx} className="pfm-module-card">
//                                             <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
//                                                 <button type="button" className="pfm-expand-btn" onClick={() => toggleExpandModule(mIdx)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
//                                                 <input className="pfm-module-input pfm-module-input--code" placeholder="Module Code" value={module.code || ''} onChange={e => updateModule(mIdx, 'code', e.target.value)} />
//                                                 <input className="pfm-module-input pfm-module-input--name" placeholder="Module Name" value={module.name} onChange={e => updateModule(mIdx, 'name', e.target.value)} />
//                                                 <input className="pfm-module-input pfm-module-input--credits" type="number" placeholder="Cr" value={module.credits || ''} onChange={e => updateModule(mIdx, 'credits', parseInt(e.target.value) || 0)} />
//                                                 <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}><Trash2 size={15} /></button>
//                                             </div>

//                                             {isExpanded && (
//                                                 <div className="pfm-module-card__body">
//                                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
//                                                         <span className="pfm-topics-label">
//                                                             {activeTab === 'workExperience' ? 'Logbook Entries / Tasks' : 'Assessed Topics'}
//                                                         </span>
//                                                         <button type="button" onClick={() => addTopic(mIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
//                                                             <Plus size={12} /> {activeTab === 'workExperience' ? 'Add Task' : 'Add Topic'}
//                                                         </button>
//                                                     </div>

//                                                     {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
//                                                         <div key={tIdx} className="pfm-topic" style={{ borderLeft: `3px solid ${activeTab === 'practical' ? '#f59e0b' : activeTab === 'workExperience' ? 'var(--mlab-green)' : '#0ea5e9'}` }}>
//                                                             <div className="pfm-topic__header" style={{ display: 'flex', gap: '6px' }}>
//                                                                 <input className="pfm-input" style={{ width: '120px', padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Code" value={topic.code} onChange={e => updateTopic(mIdx, tIdx, 'code', e.target.value)} />
//                                                                 <input className="pfm-input" style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Topic Title" value={topic.title} onChange={e => updateTopic(mIdx, tIdx, 'title', e.target.value)} />
//                                                                 {activeTab !== 'workExperience' && (
//                                                                     <input className="pfm-input" style={{ width: '60px', padding: '4px 6px', fontSize: '0.8rem' }} type="number" placeholder="%" value={topic.weight || ''} onChange={e => updateTopic(mIdx, tIdx, 'weight', parseInt(e.target.value) || 0)} />
//                                                                 )}
//                                                                 <button type="button" className="pfm-remove-btn" onClick={() => removeTopic(mIdx, tIdx)}><Trash2 size={14} /></button>
//                                                             </div>

//                                                             <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--mlab-border)', marginTop: '0.5rem' }}>
//                                                                 {topic.criteria?.map((crit: any, cIdx: number) => (
//                                                                     <div key={cIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
//                                                                         <input className="pfm-input" style={{ width: '90px', fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Code" value={crit.code} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'code', e.target.value)} />
//                                                                         <input className="pfm-input" style={{ flex: 1, fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Criteria Description" value={crit.description} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'description', e.target.value)} />
//                                                                         <button type="button" className="pfm-remove-btn" style={{ padding: '2px' }} onClick={() => removeCriteria(mIdx, tIdx, cIdx)}><X size={12} /></button>
//                                                                     </div>
//                                                                 ))}
//                                                                 <button type="button" onClick={() => addCriteria(mIdx, tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#0ea5e9', padding: '4px 0', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' }}>
//                                                                     <Plus size={10} /> Add Criteria
//                                                                 </button>
//                                                             </div>
//                                                         </div>
//                                                     )) : <p className="pfm-no-topics">No {activeTab === 'workExperience' ? 'tasks' : 'topics'} defined.</p>}
//                                                 </div>
//                                             )}
//                                         </div>
//                                     );
//                                 })}

//                                 <button type="button" className="pfm-add-module-btn" onClick={addModule}>
//                                     <Plus size={14} /> Add Module Manually
//                                 </button>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="pfm-footer">
//                         <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>

//                         {/* ── 🚀 FIXED: CHANGED TO type="button" AND BOUND onClick TO executeSave 🚀 ── */}
//                         <button type="button" className="pfm-btn pfm-btn--primary" onClick={executeSave} disabled={isSaving}>
//                             {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum</>}
//                         </button>
//                     </div>
//                 </form>
//             </div>

//             {/* Render the Custom Status Modal on top if active */}
//             {statusModal && (
//                 <StatusModal
//                     type={statusModal.type}
//                     title={statusModal.title}
//                     message={statusModal.message}
//                     onClose={statusModal.onClose}
//                     onCancel={statusModal.onCancel}
//                     confirmText={statusModal.confirmText}
//                 />
//             )}
//         </div>
//     );
// };


// // // src/components/admin/ProgrammeFormModal.tsx
// // // mLab CI v2.1 — ViewPortfolio aesthetic

// // import React, { useState, useRef } from 'react';
// // import {
// //     X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
// //     Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2
// // } from 'lucide-react';
// // import Papa from 'papaparse';
// // import './ProgrammeFormModal.css';
// // import type { ModuleCategory, ProgrammeTemplate } from '../../../types';

// // interface ProgrammeFormModalProps {
// //     programme?: ProgrammeTemplate | null;
// //     onClose: () => void;
// //     onSave: (programme: ProgrammeTemplate) => void;
// //     title: string;
// // }

// // const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
// //     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0,
// //     knowledgeModules: [], practicalModules: [], workExperienceModules: [], isArchived: false,
// // };

// // const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
// //     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
// //     practical: { label: 'Practical', icon: <FileText size={13} /> },
// //     workExperience: { label: 'Workplace', icon: <Briefcase size={13} /> },
// // };

// // export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
// //     programme, onClose, onSave, title,
// // }) => {
// //     const [formData, setFormData] = useState<ProgrammeTemplate>(
// //         programme ? { ...programme } : { ...emptyProgramme, id: '' } as ProgrammeTemplate
// //     );
// //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
// //     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
// //     const [showTextParser, setShowTextParser] = useState(false);
// //     const [rawText, setRawText] = useState('');

// //     // Loading states
// //     const [isDownloading, setIsDownloading] = useState(false);
// //     const [isImportingCSV, setIsImportingCSV] = useState(false);
// //     const [isProcessingText, setIsProcessingText] = useState(false);
// //     const [isSaving, setIsSaving] = useState(false);

// //     const fileInputRef = useRef<HTMLInputElement>(null);

// //     const toggleExpandModule = (index: number) => {
// //         const key = `${activeTab}-${index}`;
// //         setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
// //     };

// //     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const { name, value, type, checked } = e.target;
// //         setFormData({
// //             ...formData,
// //             [name]: type === 'number' ? (parseInt(value) || 0) : type === 'checkbox' ? checked : value,
// //         });
// //     };

// //     // ── Template downloader ──
// //     const handleDownloadTemplate = async () => {
// //         setIsDownloading(true);
// //         await new Promise(resolve => setTimeout(resolve, 500));
// //         const csvContent = [
// //             "Type,Category,ModuleCode,ModuleName,NQFLevel,Credits,TopicCode,TopicName,Weight,CriteriaCode,CriteriaDescription",
// //             "Module,Knowledge,251201-005-00-KM-01,Computers and Computing Systems,4,12,,,,,",
// //             "Topic,Knowledge,251201-005-00-KM-01,,,KM-01-KT01,Problem solving skills for IT Professionals,5,,",
// //             "Criteria,Knowledge,251201-005-00-KM-01,,,KM-01-KT01,,,KT 0101,Identification of the problem",
// //             "Criteria,Knowledge,251201-005-00-KM-01,,,KM-01-KT01,,,KT 0102,Establishing a probable cause",
// //             "Module,Practical,251201-005-00-PM-01,Use Software to Communicate,4,3,,,,,",
// //             "Topic,Practical,251201-005-00-PM-01,,,PM-01-PS01,Use electronic communication,0,,",
// //             "Module,Workplace,251201-005-00-WM-01,Technical Requirement Analysis,5,15,,,,,",
// //         ].join("\n");
// //         const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
// //         const link = document.createElement("a");
// //         link.setAttribute("href", URL.createObjectURL(blob));
// //         link.setAttribute("download", "QCTO_Curriculum_Template.csv");
// //         link.style.visibility = 'hidden';
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //         setIsDownloading(false);
// //     };

// //     // ── Core regex parser (shared by paste + unformatted CSV) ──
// //     const processRawTextData = (textToParse: string) => {
// //         if (!textToParse.trim()) return;
// //         let sanitized = textToParse
// //             .replace(/pg\.?\s*\d+(-\d+)?/gi, ' ')
// //             .replace(/P\s*M-/gi, 'PM-').replace(/K\s*M-/gi, 'KM-').replace(/W\s*M-/gi, 'WM-')
// //             .replace(/Topic elements to be covered include:?/gi, ' ')
// //             .replace(/SECTION\s+\w+:\s+[A-Z\s]+SPECIFICATIONS/gi, ' ');

// //         const moduleRegex = /(251201-\d{3}-\d{2}-(KM|PM|WM)-\d{2})/i;
// //         const moduleTokens = sanitized.split(moduleRegex);

// //         let kMs: any[] = [...(formData.knowledgeModules || [])];
// //         let pMs: any[] = [...(formData.practicalModules || [])];
// //         let wMs: any[] = [...(formData.workExperienceModules || [])];

// //         for (let i = 1; i < moduleTokens.length; i += 3) {
// //             const mCode = moduleTokens[i];
// //             const mType = moduleTokens[i + 1].toUpperCase();
// //             const mText = moduleTokens[i + 2] || '';

// //             const nqfMatch = mText.match(/NQF Level\s*(\d+)/i);
// //             const credMatch = mText.match(/Credits\s*(\d+)/i);
// //             const mNqf = nqfMatch ? parseInt(nqfMatch[1], 10) : (formData.nqfLevel || 4);
// //             const mCredits = credMatch ? parseInt(credMatch[1], 10) : 0;

// //             let nameEnd = mText.length;
// //             if (nqfMatch?.index !== undefined) nameEnd = Math.min(nameEnd, nqfMatch.index);
// //             const firstTopic = mText.match(/(KM|PM|WM)-\d{2}-(KT|PS|WE)\d{2}/i);
// //             if (firstTopic?.index !== undefined) nameEnd = Math.min(nameEnd, firstTopic.index);
// //             const mName = mText.substring(0, nameEnd).replace(/^[, \-]+|[, \-]+$/g, '').trim();

// //             const newModule: any = {
// //                 code: mCode, name: mName || `${mType} Module`,
// //                 nqfLevel: mNqf, credits: mCredits, notionalHours: mCredits * 10, topics: [],
// //             };

// //             const topicTokens = mText.split(/((?:KM|PM|WM)-\d{2}-(?:KT|PS|WE)\d{2})/i);
// //             for (let j = 1; j < topicTokens.length; j += 2) {
// //                 const tCode = topicTokens[j];
// //                 const tText = topicTokens[j + 1] || '';
// //                 const tMeta = tText.match(/^[\s:]*(.*?)(?:(\d+)\s*%)?(?:•|$)/i);
// //                 let tTitle = tMeta ? tMeta[1].trim() : 'Topic';
// //                 if (tTitle.length > 150) tTitle = tTitle.substring(0, 150) + '...';
// //                 const tWeight = tMeta && tMeta[2] ? parseInt(tMeta[2], 10) : 0;
// //                 const newTopic: any = { code: tCode, title: tTitle, weight: tWeight, criteria: [] };
// //                 tText.split(/•/).map(l => l.trim()).filter(Boolean).forEach(line => {
// //                     const cMatch = line.match(/(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
// //                     if (cMatch) {
// //                         const cCode = cMatch[1].replace(/\s+/g, '');
// //                         const cDesc = line.replace(cMatch[1], '').replace(/^[:\-]\s*/, '').trim();
// //                         if (cDesc) newTopic.criteria.push({ code: cCode, description: cDesc });
// //                     }
// //                 });
// //                 newModule.topics.push(newTopic);
// //             }

// //             if (mType === 'KM') kMs.push(newModule);
// //             else if (mType === 'PM') pMs.push(newModule);
// //             else if (mType === 'WM') wMs.push(newModule);
// //         }

// //         setFormData(prev => ({
// //             ...prev,
// //             knowledgeModules: kMs, practicalModules: pMs, workExperienceModules: wMs,
// //         }));
// //     };

// //     // ── Hybrid CSV upload (structured or PDF table export) ──
// //     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = event.target.files?.[0];
// //         if (!file) return;
// //         setIsImportingCSV(true);
// //         setTimeout(() => {
// //             Papa.parse(file, {
// //                 header: false, skipEmptyLines: true,
// //                 complete: (results) => {
// //                     const rows = results.data as string[][];
// //                     if (!rows.length) { setIsImportingCSV(false); return; }
// //                     const headerRow = rows[0].map(h => (h || '').trim().toLowerCase());
// //                     const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

// //                     if (isStructured) {
// //                         Papa.parse(file, {
// //                             header: true, skipEmptyLines: true,
// //                             complete: (sr) => {
// //                                 const sRows = sr.data as any[];
// //                                 const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
// //                                 const moduleMap = new Map<string, any>();
// //                                 const topicMap = new Map<string, any>();
// //                                 sRows.forEach(row => {
// //                                     const type = row['Type']?.trim();
// //                                     const cat = row['Category']?.trim();
// //                                     const mCode = row['ModuleCode']?.trim();
// //                                     const tCode = row['TopicCode']?.trim();
// //                                     if (!mCode) return;
// //                                     if (type === 'Module') {
// //                                         const m = { code: mCode, name: row['ModuleName']?.trim() || '', nqfLevel: parseInt(row['NQFLevel']) || 4, credits: parseInt(row['Credits']) || 0, notionalHours: 0, topics: [] };
// //                                         moduleMap.set(mCode, m);
// //                                         if (cat === 'Knowledge') parsed.knowledgeModules.push(m);
// //                                         else if (cat === 'Practical') parsed.practicalModules.push(m);
// //                                         else if (cat === 'Workplace' || cat === 'WorkExperience') parsed.workExperienceModules.push(m);
// //                                     } else if (type === 'Topic' && tCode) {
// //                                         const parent = moduleMap.get(mCode);
// //                                         if (parent) { const t = { code: tCode, title: row['TopicName']?.trim() || '', weight: parseInt(row['Weight']) || 0, criteria: [] }; parent.topics.push(t); topicMap.set(tCode, t); }
// //                                     } else if (type === 'Criteria') {
// //                                         const pt = topicMap.get(tCode);
// //                                         if (pt) pt.criteria.push({ code: row['CriteriaCode']?.trim() || '', description: row['CriteriaDescription']?.trim() || '' });
// //                                     }
// //                                 });
// //                                 setFormData(prev => ({
// //                                     ...prev,
// //                                     knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
// //                                     practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
// //                                     workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules],
// //                                 }));
// //                                 setIsImportingCSV(false);
// //                                 if (fileInputRef.current) fileInputRef.current.value = '';
// //                             },
// //                         });
// //                     } else {
// //                         const combinedText = rows.map(r => r.filter(c => c?.trim()).join(' ')).join('\n');
// //                         processRawTextData(combinedText);
// //                         setIsImportingCSV(false);
// //                         if (fileInputRef.current) fileInputRef.current.value = '';
// //                     }
// //                 },
// //                 error: (err) => { console.error(err); setIsImportingCSV(false); alert("Failed to read the CSV file."); },
// //             });
// //         }, 100);
// //     };

// //     // ── Paste handler ──
// //     const handlePasteClick = () => {
// //         setIsProcessingText(true);
// //         setTimeout(() => {
// //             processRawTextData(rawText);
// //             setRawText('');
// //             setShowTextParser(false);
// //             setIsProcessingText(false);
// //         }, 100);
// //     };

// //     // ── Manual Module Management ──
// //     const addModule = () => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const newModules = [...(formData[key] as any[]), { name: '', code: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 4, topics: [] }];
// //         setFormData({ ...formData, [key]: newModules });
// //         setExpandedModules(prev => ({ ...prev, [`${activeTab}-${newModules.length - 1}`]: true }));
// //     };

// //     const updateModule = (index: number, field: string, value: string | number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         updated[index] = { ...updated[index], [field]: value };
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const removeModule = (index: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
// //     };

// //     // ── Manual Topic Management ──
// //     const addTopic = (moduleIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         if (!updated[moduleIndex].topics) updated[moduleIndex].topics = [];
// //         updated[moduleIndex].topics.push({ code: '', title: '', weight: 0, criteria: [] });
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const updateTopic = (moduleIndex: number, topicIndex: number, field: string, value: string | number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         updated[moduleIndex].topics[topicIndex] = { ...updated[moduleIndex].topics[topicIndex], [field]: value };
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const removeTopic = (moduleIndex: number, topicIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         updated[moduleIndex].topics = updated[moduleIndex].topics.filter((_: any, i: number) => i !== topicIndex);
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     // ── Manual Criteria Management ──
// //     const addCriteria = (moduleIndex: number, topicIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         if (!updated[moduleIndex].topics[topicIndex].criteria) updated[moduleIndex].topics[topicIndex].criteria = [];
// //         updated[moduleIndex].topics[topicIndex].criteria.push({ code: '', description: '' });
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const updateCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number, field: string, value: string) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         updated[moduleIndex].topics[topicIndex].criteria[criteriaIndex] = { ...updated[moduleIndex].topics[topicIndex].criteria[criteriaIndex], [field]: value };
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const removeCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         updated[moduleIndex].topics[topicIndex].criteria = updated[moduleIndex].topics[topicIndex].criteria.filter((_: any, i: number) => i !== criteriaIndex);
// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setIsSaving(true);
// //         await new Promise(resolve => setTimeout(resolve, 300));
// //         try { await Promise.resolve(onSave(formData)); } finally { setIsSaving(false); }
// //     };

// //     const currentModules = formData[`${activeTab}Modules`] as any[];

// //     return (
// //         <div className="pfm-overlay" onClick={onClose}>
// //             <div className="pfm-modal" onClick={e => e.stopPropagation()}>

// //                 <div className="pfm-header">
// //                     <h2 className="pfm-header__title"><BookOpen size={16} />{title}</h2>
// //                     <button className="pfm-close-btn" onClick={onClose} type="button" disabled={isSaving}><X size={20} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
// //                     <div className="pfm-body">

// //                         {/* Metadata */}
// //                         <div>
// //                             <div className="pfm-section-hdr"><BookOpen size={13} />Qualification Metadata</div>
// //                             <div className="pfm-details-grid">
// //                                 <div className="pfm-fg pfm-fg--full">
// //                                     <label>Programme Title *</label>
// //                                     <input className="pfm-input" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Occupational Certificate: Software Developer" />
// //                                 </div>
// //                                 <div className="pfm-fg"><label>SAQA ID *</label><input className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} /></div>
// //                                 <div className="pfm-fg"><label>NQF Level *</label><input className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} /></div>
// //                                 <div className="pfm-fg"><label>Total Credits *</label><input className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} /></div>
// //                                 <div className="pfm-fg"><label>Total Notional Hours *</label><input className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} /></div>
// //                             </div>
// //                         </div>

// //                         {/* Curriculum Matrix Header */}
// //                         <div>
// //                             <div className="pfm-modules-hdr">
// //                                 <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum Matrix</div>
// //                                 <div className="pfm-import-actions">
// //                                     <button type="button" className="pfm-import-btn" onClick={handleDownloadTemplate} disabled={isDownloading}>
// //                                         {isDownloading ? <><Loader2 size={12} className="pfm-spin" /> Preparing…</> : <><Download size={12} /> Template</>}
// //                                     </button>
// //                                     <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
// //                                     <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImportingCSV}>
// //                                         {isImportingCSV ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import CSV</>}
// //                                     </button>
// //                                     <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
// //                                         <ClipboardPaste size={12} /> Paste QCTO Text
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                             <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

// //                             {/* Parser UI */}
// //                             {showTextParser && (
// //                                 <div className="pfm-parser-panel">
// //                                     <p className="pfm-parser-panel__hint">Paste raw text directly from the QCTO Form 2 PDF here.</p>
// //                                     <textarea className="pfm-parser-textarea" placeholder="Paste raw text here…" value={rawText} onChange={e => setRawText(e.target.value)} disabled={isProcessingText} />
// //                                     <div className="pfm-parser-panel__actions">
// //                                         <button type="button" className="pfm-btn pfm-btn--ghost" onClick={() => setShowTextParser(false)} disabled={isProcessingText}>Cancel</button>
// //                                         <button type="button" className="pfm-btn pfm-btn--primary" onClick={handlePasteClick} disabled={!rawText.trim() || isProcessingText}>
// //                                             {isProcessingText ? <><Loader2 size={13} className="pfm-spin" /> Processing…</> : 'Process Text'}
// //                                         </button>
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             {/* Tabs */}
// //                             <div className="pfm-tabs">
// //                                 {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
// //                                     <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
// //                                         {TAB_META[tab].icon}{TAB_META[tab].label}
// //                                         <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
// //                                     </button>
// //                                 ))}
// //                             </div>

// //                             {/* Module List */}
// //                             <div className="pfm-module-list">
// //                                 {currentModules.length === 0 ? (
// //                                     <div className="pfm-empty-state"><Layers size={32} style={{ opacity: 0.3, marginBottom: '0.6rem' }} /><div>No modules yet.</div></div>
// //                                 ) : currentModules.map((module, mIdx) => {
// //                                     const isExpanded = !!expandedModules[`${activeTab}-${mIdx}`];
// //                                     return (
// //                                         <div key={mIdx} className="pfm-module-card">
// //                                             <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
// //                                                 <button type="button" className="pfm-expand-btn" onClick={() => toggleExpandModule(mIdx)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
// //                                                 <input className="pfm-module-input pfm-module-input--code" placeholder="Module Code" value={module.code || ''} onChange={e => updateModule(mIdx, 'code', e.target.value)} />
// //                                                 <input className="pfm-module-input pfm-module-input--name" placeholder="Module Name" value={module.name} onChange={e => updateModule(mIdx, 'name', e.target.value)} />
// //                                                 <input className="pfm-module-input pfm-module-input--credits" type="number" placeholder="Cr" value={module.credits || ''} onChange={e => updateModule(mIdx, 'credits', parseInt(e.target.value) || 0)} />
// //                                                 <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}><Trash2 size={15} /></button>
// //                                             </div>

// //                                             {isExpanded && activeTab !== 'workExperience' && (
// //                                                 <div className="pfm-module-card__body">
// //                                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
// //                                                         <span className="pfm-topics-label">Assessed Topics</span>
// //                                                         <button type="button" className="pfm-add-topic-btn" onClick={() => addTopic(mIdx)}><Plus size={12} /> Add Topic</button>
// //                                                     </div>

// //                                                     {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
// //                                                         <div key={tIdx} className="pfm-topic">
// //                                                             <div className="pfm-topic__header" style={{ display: 'flex', gap: '6px' }}>
// //                                                                 <input className="pfm-input" style={{ width: '120px' }} placeholder="Code" value={topic.code} onChange={e => updateTopic(mIdx, tIdx, 'code', e.target.value)} />
// //                                                                 <input className="pfm-input" style={{ flex: 1 }} placeholder="Topic Title" value={topic.title} onChange={e => updateTopic(mIdx, tIdx, 'title', e.target.value)} />
// //                                                                 <input className="pfm-input" style={{ width: '60px' }} type="number" placeholder="%" value={topic.weight || ''} onChange={e => updateTopic(mIdx, tIdx, 'weight', parseInt(e.target.value) || 0)} />
// //                                                                 <button type="button" className="pfm-remove-btn" onClick={() => removeTopic(mIdx, tIdx)}><Trash2 size={14} /></button>
// //                                                             </div>

// //                                                             <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--mlab-border)', marginTop: '0.5rem' }}>
// //                                                                 {topic.criteria?.map((crit: any, cIdx: number) => (
// //                                                                     <div key={cIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
// //                                                                         <input className="pfm-input" style={{ width: '80px', fontSize: '0.75rem', padding: '4px' }} placeholder="Code" value={crit.code} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'code', e.target.value)} />
// //                                                                         <input className="pfm-input" style={{ flex: 1, fontSize: '0.75rem', padding: '4px' }} placeholder="Criteria Description" value={crit.description} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'description', e.target.value)} />
// //                                                                         <button type="button" className="pfm-remove-btn" style={{ padding: '2px' }} onClick={() => removeCriteria(mIdx, tIdx, cIdx)}><X size={12} /></button>
// //                                                                     </div>
// //                                                                 ))}
// //                                                                 <button type="button" style={{ color: '#052e3a' }} className="pfm-add-criteria-btn" onClick={() => addCriteria(mIdx, tIdx)}><Plus size={10} /> Add Criteria</button>
// //                                                             </div>
// //                                                         </div>
// //                                                     )) : <p className="pfm-no-topics">No topics defined.</p>}
// //                                                 </div>
// //                                             )}
// //                                         </div>
// //                                     );
// //                                 })}

// //                                 <button type="button" className="pfm-add-module-btn" onClick={addModule}>
// //                                     <Plus size={14} /> Add Module Manually
// //                                 </button>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="pfm-footer">
// //                         <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
// //                         <button type="submit" className="pfm-btn pfm-btn--primary" disabled={isSaving}>
// //                             {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>
// //     );
// // };



// // // import React, { useState, useRef } from 'react';
// // // import {
// // //     X, Save, Upload, Trash2, ChevronDown, ChevronRight,
// // //     Layers, FileText, Briefcase, BookOpen
// // // } from 'lucide-react';
// // // import Papa from 'papaparse';
// // // import type { ModuleCategory, ProgrammeTemplate } from '../../types';
// // // import './ProgrammeFormModal/ProgrammeFormModal.css';

// // // interface ProgrammeFormModalProps {
// // //     programme?: ProgrammeTemplate | null;
// // //     onClose: () => void;
// // //     onSave: (programme: ProgrammeTemplate) => void;
// // //     title: string;
// // // }

// // // const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
// // //     name: '',
// // //     saqaId: '',
// // //     credits: 0,
// // //     totalNotionalHours: 0,
// // //     nqfLevel: 0,
// // //     knowledgeModules: [],
// // //     practicalModules: [],
// // //     workExperienceModules: [],
// // //     isArchived: false,
// // // };

// // // const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
// // //     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
// // //     practical: { label: 'Practical', icon: <FileText size={13} /> },
// // //     workExperience: { label: 'Work Experience', icon: <Briefcase size={13} /> },
// // // };

// // // export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
// // //     programme, onClose, onSave, title,
// // // }) => {
// // //     const [formData, setFormData] = useState<ProgrammeTemplate>(
// // //         programme ? { ...programme } : { ...emptyProgramme, id: '' } as ProgrammeTemplate
// // //     );
// // //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
// // //     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
// // //     const fileInputRef = useRef<HTMLInputElement>(null);

// // //     const toggleExpand = (index: number) => {
// // //         const key = `${activeTab}-${index}`;
// // //         setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
// // //     };

// // //     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const { name, value, type, checked } = e.target;
// // //         setFormData({
// // //             ...formData,
// // //             [name]: type === 'checkbox' ? checked : type === 'number' ? (parseInt(value) || 0) : value,
// // //         });
// // //     };

// // //     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = event.target.files?.[0];
// // //         if (!file) return;

// // //         Papa.parse(file, {
// // //             header: true,
// // //             skipEmptyLines: true,
// // //             complete: (results) => {
// // //                 const rows = results.data as any[];
// // //                 let kModules = [...(formData.knowledgeModules || [])];
// // //                 let pModules = [...(formData.practicalModules || [])];
// // //                 let wModules = [...(formData.workExperienceModules || [])];
// // //                 let currentModule: any = null;
// // //                 let currentTopic: any = null;
// // //                 let currentCategory: ModuleCategory | null = null;

// // //                 rows.forEach((row) => {
// // //                     const componentText = (row['Module/Component'] || '').trim();
// // //                     const moduleCode = (row['Module Code'] || '').trim();

// // //                     if (moduleCode && moduleCode.includes('251201')) {
// // //                         const isKM = moduleCode.includes('-KM-');
// // //                         const isPM = moduleCode.includes('-PM-');
// // //                         const isWM = moduleCode.includes('-WM-');
// // //                         currentCategory = isKM ? 'knowledge' : isPM ? 'practical' : isWM ? 'workExperience' : null;
// // //                         if (currentCategory) {
// // //                             currentModule = {
// // //                                 name: componentText.split(',')[0].trim(),
// // //                                 code: moduleCode,
// // //                                 credits: 0,
// // //                                 notionalHours: 0,
// // //                                 nqfLevel: formData.nqfLevel || 4,
// // //                                 topics: [],
// // //                             };
// // //                             if (isKM) kModules.push(currentModule);
// // //                             if (isPM) pModules.push(currentModule);
// // //                             if (isWM) wModules.push(currentModule);
// // //                         }
// // //                         currentTopic = null;
// // //                     } else if (!moduleCode && componentText.match(/(KM|PM|WM)-\d+-(KT|PS|WE)/)) {
// // //                         if (currentModule) {
// // //                             const weightMatch = componentText.match(/(\d+)%/);
// // //                             const parts = componentText.split(':');
// // //                             currentTopic = {
// // //                                 code: parts[0].trim(),
// // //                                 title: parts.length > 1 ? parts[1].replace(/\d+%/, '').trim() : componentText,
// // //                                 weight: weightMatch ? parseInt(weightMatch[1]) : 0,
// // //                                 criteria: [],
// // //                             };
// // //                             currentModule.topics.push(currentTopic);
// // //                         }
// // //                     } else if (moduleCode && currentTopic) {
// // //                         currentTopic.criteria.push({ code: moduleCode, description: componentText });
// // //                     }
// // //                 });

// // //                 setFormData(prev => ({
// // //                     ...prev,
// // //                     knowledgeModules: kModules,
// // //                     practicalModules: pModules,
// // //                     workExperienceModules: wModules,
// // //                 }));
// // //                 if (fileInputRef.current) fileInputRef.current.value = '';
// // //                 alert('Curriculum Matrix imported successfully!');
// // //             },
// // //         });
// // //     };

// // //     const updateModule = (index: number, field: string, value: string | number) => {
// // //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // //         const updated = [...(formData[key] as any[])];
// // //         updated[index] = { ...updated[index], [field]: value };
// // //         setFormData({ ...formData, [key]: updated });
// // //     };

// // //     const removeModule = (index: number) => {
// // //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // //         setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
// // //     };

// // //     const handleSubmit = (e: React.FormEvent) => {
// // //         e.preventDefault();
// // //         onSave(formData);
// // //     };

// // //     const currentModules = formData[`${activeTab}Modules`] as any[];

// // //     return (
// // //         <div className="pfm-overlay" onClick={onClose}>
// // //             <div className="pfm-modal" onClick={e => e.stopPropagation()}>

// // //                 {/* ── Header ── */}
// // //                 <div className="pfm-header">
// // //                     <h2 className="pfm-header__title">
// // //                         <BookOpen size={16} />
// // //                         {title}
// // //                     </h2>
// // //                     <button className="pfm-close-btn" onClick={onClose} type="button">
// // //                         <X size={20} />
// // //                     </button>
// // //                 </div>

// // //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
// // //                     <div className="pfm-body">

// // //                         {/* ── Programme Details ── */}
// // //                         <div>
// // //                             <div className="pfm-section-hdr">
// // //                                 <BookOpen size={13} />
// // //                                 Programme Details
// // //                             </div>
// // //                             <div className="pfm-details-grid">
// // //                                 <div className="pfm-fg pfm-fg--full">
// // //                                     <label htmlFor="pfm-name">Programme Name *</label>
// // //                                     <input
// // //                                         id="pfm-name"
// // //                                         className="pfm-input"
// // //                                         type="text"
// // //                                         name="name"
// // //                                         required
// // //                                         value={formData.name}
// // //                                         onChange={handleChange}
// // //                                         placeholder="e.g. Occupational Certificate: Software Developer"
// // //                                     />
// // //                                 </div>
// // //                                 <div className="pfm-fg">
// // //                                     <label htmlFor="pfm-saqa">SAQA ID *</label>
// // //                                     <input id="pfm-saqa" className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} placeholder="e.g. 118707" />
// // //                                 </div>
// // //                                 <div className="pfm-fg">
// // //                                     <label htmlFor="pfm-nqf">NQF Level *</label>
// // //                                     <input id="pfm-nqf" className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} />
// // //                                 </div>
// // //                                 <div className="pfm-fg">
// // //                                     <label htmlFor="pfm-credits">Total Credits *</label>
// // //                                     <input id="pfm-credits" className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} />
// // //                                 </div>
// // //                                 <div className="pfm-fg">
// // //                                     <label htmlFor="pfm-hours">Total Notional Hours *</label>
// // //                                     <input id="pfm-hours" className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} />
// // //                                 </div>
// // //                                 {programme && (
// // //                                     <div className="pfm-fg" style={{ justifyContent: 'flex-end' }}>
// // //                                         <label className="pfm-checkbox-row">
// // //                                             <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange} />
// // //                                             Archive this programme
// // //                                         </label>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         </div>

// // //                         {/* ── Template Modules ── */}
// // //                         <div>
// // //                             <div className="pfm-modules-hdr">
// // //                                 <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}>
// // //                                     <Layers size={13} />
// // //                                     Template Modules
// // //                                 </div>
// // //                                 <div>
// // //                                     <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
// // //                                     <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()}>
// // //                                         <Upload size={12} />
// // //                                         Import QCTO Matrix (CSV)
// // //                                     </button>
// // //                                 </div>
// // //                             </div>
// // //                             {/* divider under section header */}
// // //                             <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

// // //                             {/* ── Tabs ── */}
// // //                             <div className="pfm-tabs">
// // //                                 {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
// // //                                     <button
// // //                                         key={tab}
// // //                                         type="button"
// // //                                         className={`pfm-tab ${activeTab === tab ? 'active' : ''}`}
// // //                                         onClick={() => setActiveTab(tab)}
// // //                                     >
// // //                                         {TAB_META[tab].icon}
// // //                                         {TAB_META[tab].label}
// // //                                         {/* Count badge */}
// // //                                         {(() => {
// // //                                             const count = (formData[`${tab}Modules`] as any[])?.length || 0;
// // //                                             return count > 0 ? (
// // //                                                 <span style={{
// // //                                                     background: activeTab === tab ? 'var(--mlab-green)' : 'var(--mlab-border)',
// // //                                                     color: activeTab === tab ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
// // //                                                     fontSize: '0.6rem',
// // //                                                     fontWeight: 700,
// // //                                                     padding: '1px 6px',
// // //                                                     marginLeft: '2px',
// // //                                                 }}>
// // //                                                     {count}
// // //                                                 </span>
// // //                                             ) : null;
// // //                                         })()}
// // //                                     </button>
// // //                                 ))}
// // //                             </div>

// // //                             {/* ── Module list ── */}
// // //                             <div className="pfm-module-list">
// // //                                 {currentModules.length === 0 ? (
// // //                                     <div className="pfm-empty-state">
// // //                                         <div className="pfm-empty-state__icon">
// // //                                             <Layers size={32} />
// // //                                         </div>
// // //                                         <div className="pfm-empty-state__title">No modules yet</div>
// // //                                         <div className="pfm-empty-state__sub">
// // //                                             Upload a QCTO Matrix CSV to auto-populate, or add modules manually.
// // //                                         </div>
// // //                                     </div>
// // //                                 ) : (
// // //                                     currentModules.map((module, mIdx) => {
// // //                                         const key = `${activeTab}-${mIdx}`;
// // //                                         const isExpanded = !!expandedModules[key];
// // //                                         return (
// // //                                             <div key={mIdx} className="pfm-module-card">

// // //                                                 {/* Module header row */}
// // //                                                 <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
// // //                                                     <button
// // //                                                         type="button"
// // //                                                         className="pfm-expand-btn"
// // //                                                         onClick={() => toggleExpand(mIdx)}
// // //                                                     >
// // //                                                         {isExpanded
// // //                                                             ? <ChevronDown size={16} />
// // //                                                             : <ChevronRight size={16} />
// // //                                                         }
// // //                                                     </button>
// // //                                                     <input
// // //                                                         className="pfm-module-input pfm-module-input--code"
// // //                                                         placeholder="Module Code"
// // //                                                         value={module.code || ''}
// // //                                                         onChange={e => updateModule(mIdx, 'code', e.target.value)}
// // //                                                     />
// // //                                                     <input
// // //                                                         className="pfm-module-input pfm-module-input--name"
// // //                                                         placeholder="Module Name"
// // //                                                         value={module.name}
// // //                                                         onChange={e => updateModule(mIdx, 'name', e.target.value)}
// // //                                                     />
// // //                                                     <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}>
// // //                                                         <Trash2 size={15} />
// // //                                                     </button>
// // //                                                 </div>

// // //                                                 {/* Module body: topics & criteria */}
// // //                                                 {isExpanded && (
// // //                                                     <div className="pfm-module-card__body">
// // //                                                         <span className="pfm-topics-label">Assessed Topics</span>

// // //                                                         {module.topics?.length > 0 ? (
// // //                                                             module.topics.map((topic: any, tIdx: number) => (
// // //                                                                 <div key={tIdx} className="pfm-topic">
// // //                                                                     <div className="pfm-topic__header">
// // //                                                                         <span className="pfm-topic__code">{topic.code}</span>
// // //                                                                         <span className="pfm-topic__title">{topic.title}</span>
// // //                                                                         {topic.weight > 0 && (
// // //                                                                             <span className="pfm-topic__weight">{topic.weight}% Weight</span>
// // //                                                                         )}
// // //                                                                     </div>
// // //                                                                     {topic.criteria?.length > 0 && (
// // //                                                                         <ul className="pfm-criteria-list">
// // //                                                                             {topic.criteria.map((crit: any, cIdx: number) => (
// // //                                                                                 <li key={cIdx} className="pfm-criteria-item">
// // //                                                                                     <span className="pfm-criteria-item__code">{crit.code}</span>
// // //                                                                                     <span>{crit.description}</span>
// // //                                                                                 </li>
// // //                                                                             ))}
// // //                                                                         </ul>
// // //                                                                     )}
// // //                                                                 </div>
// // //                                                             ))
// // //                                                         ) : (
// // //                                                             <p className="pfm-no-topics">
// // //                                                                 No topics found. Upload a CSV to populate.
// // //                                                             </p>
// // //                                                         )}
// // //                                                     </div>
// // //                                                 )}
// // //                                             </div>
// // //                                         );
// // //                                     })
// // //                                 )}
// // //                             </div>
// // //                         </div>

// // //                     </div>

// // //                     {/* ── Footer ── */}
// // //                     <div className="pfm-footer">
// // //                         <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose}>
// // //                             Cancel
// // //                         </button>
// // //                         <button type="submit" className="pfm-btn pfm-btn--primary">
// // //                             <Save size={14} />
// // //                             Save Programme
// // //                         </button>
// // //                     </div>
// // //                 </form>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // // import React, { useState, useRef } from 'react';
// // // // import { X, Save, Upload, Trash2, ChevronDown, ChevronRight, Layers, FileText, Briefcase } from 'lucide-react';
// // // // import Papa from 'papaparse';
// // // // import type { ModuleCategory, ProgrammeTemplate } from '../../types';

// // // // interface ProgrammeFormModalProps {
// // // //     programme?: ProgrammeTemplate | null;
// // // //     onClose: () => void;
// // // //     onSave: (programme: ProgrammeTemplate) => void;
// // // //     title: string;
// // // // }

// // // // // Empty programme template for creation
// // // // const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
// // // //     name: '',
// // // //     saqaId: '',
// // // //     credits: 0,
// // // //     totalNotionalHours: 0,
// // // //     nqfLevel: 0,
// // // //     knowledgeModules: [],
// // // //     practicalModules: [],
// // // //     workExperienceModules: [],
// // // //     isArchived: false,
// // // // };

// // // // export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
// // // //     programme,
// // // //     onClose,
// // // //     onSave,
// // // //     title,
// // // // }) => {
// // // //     // Form state
// // // //     const [formData, setFormData] = useState<ProgrammeTemplate>(
// // // //         programme ? { ...programme } : { ...emptyProgramme, id: '' } as ProgrammeTemplate
// // // //     );
// // // //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');

// // // //     // UI State for expanding/collapsing modules and topics
// // // //     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
// // // //     const fileInputRef = useRef<HTMLInputElement>(null);

// // // //     const toggleExpandModule = (index: number) => {
// // // //         const key = `${activeTab}-${index}`;
// // // //         setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
// // // //     };

// // // //     // Handle input changes for simple fields
// // // //     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // //         const { name, value, type, checked } = e.target;
// // // //         const newValue = type === 'checkbox' ? checked : value;
// // // //         setFormData({
// // // //             ...formData,
// // // //             [name]: type === 'number' ? (parseInt(value) || 0) : newValue,
// // // //         });
// // // //     };

// // // //     // ─── 🚀 CSV UPLOAD & PARSING LOGIC 🚀 ───
// // // //     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
// // // //         const file = event.target.files?.[0];
// // // //         if (!file) return;

// // // //         Papa.parse(file, {
// // // //             header: true, // Expects 'Module/Component', 'Module Code', 'Status'
// // // //             skipEmptyLines: true,
// // // //             complete: (results) => {
// // // //                 const rows = results.data as any[];

// // // //                 let currentKnowledgeModules = [...(formData.knowledgeModules || [])];
// // // //                 let currentPracticalModules = [...(formData.practicalModules || [])];
// // // //                 let currentWorkModules = [...(formData.workExperienceModules || [])];

// // // //                 let currentModule: any = null;
// // // //                 let currentTopic: any = null;
// // // //                 let currentCategory: ModuleCategory | null = null;

// // // //                 rows.forEach((row) => {
// // // //                     const componentText = (row['Module/Component'] || '').trim();
// // // //                     const moduleCode = (row['Module Code'] || '').trim();

// // // //                     // 1. DETECT A NEW MODULE (e.g. 251201-005-00-KM-01)
// // // //                     if (moduleCode && moduleCode.includes('251201')) {
// // // //                         const isKM = moduleCode.includes('-KM-');
// // // //                         const isPM = moduleCode.includes('-PM-');
// // // //                         const isWM = moduleCode.includes('-WM-');

// // // //                         currentCategory = isKM ? 'knowledge' : isPM ? 'practical' : isWM ? 'workExperience' : null;

// // // //                         if (currentCategory) {
// // // //                             currentModule = {
// // // //                                 name: componentText.split(',')[0].trim(), // Gets "Computers and Computing Systems"
// // // //                                 code: moduleCode,
// // // //                                 credits: 0,
// // // //                                 notionalHours: 0,
// // // //                                 nqfLevel: formData.nqfLevel || 4,
// // // //                                 topics: [] // Initialize topics array
// // // //                             };

// // // //                             if (isKM) currentKnowledgeModules.push(currentModule);
// // // //                             if (isPM) currentPracticalModules.push(currentModule);
// // // //                             if (isWM) currentWorkModules.push(currentModule);
// // // //                         }
// // // //                         currentTopic = null; // Reset topic when new module starts
// // // //                     }
// // // //                     // 2. DETECT A TOPIC HEADER (e.g. KM-01-KT01 : Problem solving... 5%)
// // // //                     else if (!moduleCode && componentText.match(/(KM|PM|WM)-\d+-(KT|PS|WE)/)) {
// // // //                         if (currentModule) {
// // // //                             const weightMatch = componentText.match(/(\d+)%/);
// // // //                             const weight = weightMatch ? parseInt(weightMatch[1]) : 0;

// // // //                             const parts = componentText.split(':');
// // // //                             const code = parts[0].trim();
// // // //                             const title = parts.length > 1 ? parts[1].replace(/\d+%/, '').trim() : componentText;

// // // //                             currentTopic = { code, title, weight, criteria: [] };
// // // //                             currentModule.topics.push(currentTopic);
// // // //                         }
// // // //                     }
// // // //                     // 3. DETECT SUB-CRITERIA (e.g. KT 0101 - Identification of the problem)
// // // //                     else if (moduleCode && currentTopic) {
// // // //                         currentTopic.criteria.push({
// // // //                             code: moduleCode,
// // // //                             description: componentText
// // // //                         });
// // // //                     }
// // // //                 });

// // // //                 // Update form state with parsed data
// // // //                 setFormData(prev => ({
// // // //                     ...prev,
// // // //                     knowledgeModules: currentKnowledgeModules,
// // // //                     practicalModules: currentPracticalModules,
// // // //                     workExperienceModules: currentWorkModules
// // // //                 }));

// // // //                 // Reset file input
// // // //                 if (fileInputRef.current) fileInputRef.current.value = '';
// // // //                 alert('Curriculum Matrix imported successfully!');
// // // //             }
// // // //         });
// // // //     };

// // // //     // ─── MANUAL MODULE MANAGEMENT ───
// // // //     const updateModule = (index: number, field: string, value: string | number) => {
// // // //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // // //         const updated = [...(formData[key] as any[])];
// // // //         updated[index] = { ...updated[index], [field]: value };
// // // //         setFormData({ ...formData, [key]: updated });
// // // //     };

// // // //     const removeModule = (index: number) => {
// // // //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // // //         setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
// // // //     };

// // // //     const handleSubmit = (e: React.FormEvent) => {
// // // //         e.preventDefault();
// // // //         onSave(formData);
// // // //     };

// // // //     const currentModules = formData[`${activeTab}Modules`] as any[];

// // // //     return (
// // // //         <div className="modal-overlay" onClick={onClose}>
// // // //             <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
// // // //                 <div className="modal-header">
// // // //                     <h2>{title}</h2>
// // // //                     <button type="button" className="icon-btn" onClick={onClose}>
// // // //                         <X size={24} />
// // // //                     </button>
// // // //                 </div>

// // // //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
// // // //                     <div className="modal-body" style={{ overflowY: 'auto' }}>
// // // //                         <h3 className="section-title">Programme Details</h3>
// // // //                         <div className="edit-grid">
// // // //                             <div className="input-group" style={{ gridColumn: '1 / -1' }}>
// // // //                                 <label>Programme Name *</label>
// // // //                                 <input type="text" name="name" required value={formData.name} onChange={handleChange} />
// // // //                             </div>
// // // //                             <div className="input-group">
// // // //                                 <label>SAQA ID *</label>
// // // //                                 <input type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} />
// // // //                             </div>
// // // //                             <div className="input-group">
// // // //                                 <label>NQF Level *</label>
// // // //                                 <input type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} />
// // // //                             </div>
// // // //                             <div className="input-group">
// // // //                                 <label>Total Credits *</label>
// // // //                                 <input type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} />
// // // //                             </div>
// // // //                             <div className="input-group">
// // // //                                 <label>Total Notional Hours *</label>
// // // //                                 <input type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} />
// // // //                             </div>
// // // //                             {programme && (
// // // //                                 <div className="input-group">
// // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // // //                                         <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange} /> Archived
// // // //                                     </label>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>

// // // //                         {/* ── HEADER WITH UPLOAD BUTTON ── */}
// // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2rem', marginBottom: '1rem' }}>
// // // //                             <h3 className="section-title" style={{ margin: 0 }}>Template Modules</h3>
// // // //                             <div>
// // // //                                 <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
// // // //                                 <button type="button" className="btn btn-outline" onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                                     <Upload size={14} /> Import QCTO Matrix (CSV)
// // // //                                 </button>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div className="tab-buttons">
// // // //                             <button type="button" className={`btn ${activeTab === 'knowledge' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('knowledge')}>
// // // //                                 <Layers size={16} style={{ marginRight: '6px' }} /> Knowledge
// // // //                             </button>
// // // //                             <button type="button" className={`btn ${activeTab === 'practical' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('practical')}>
// // // //                                 <FileText size={16} style={{ marginRight: '6px' }} /> Practical
// // // //                             </button>
// // // //                             <button type="button" className={`btn ${activeTab === 'workExperience' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('workExperience')}>
// // // //                                 <Briefcase size={16} style={{ marginRight: '6px' }} /> Work Experience
// // // //                             </button>
// // // //                         </div>

// // // //                         {/* ── NESTED MODULE RENDERER ── */}
// // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
// // // //                             {currentModules.length === 0 && (
// // // //                                 <div style={{ textAlign: 'center', padding: '2rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#64748b' }}>
// // // //                                     No modules found. Upload a QCTO Matrix CSV to auto-populate this section.
// // // //                                 </div>
// // // //                             )}

// // // //                             {currentModules.map((module, mIdx) => {
// // // //                                 const isExpanded = expandedModules[`${activeTab}-${mIdx}`];
// // // //                                 return (
// // // //                                     <div key={mIdx} style={{ border: '1px solid #e2e8f0', borderRadius: '6px', background: 'white', overflow: 'hidden' }}>
// // // //                                         {/* Module Header */}
// // // //                                         <div style={{ display: 'flex', gap: '10px', padding: '10px', background: '#f8fafc', alignItems: 'center' }}>
// // // //                                             <button type="button" onClick={() => toggleExpandModule(mIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
// // // //                                                 {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
// // // //                                             </button>
// // // //                                             <input type="text" placeholder="Module Code" value={module.code || ''} onChange={(e) => updateModule(mIdx, 'code', e.target.value)} style={{ width: '180px', padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
// // // //                                             <input type="text" placeholder="Module Name" value={module.name} onChange={(e) => updateModule(mIdx, 'name', e.target.value)} style={{ flex: 1, padding: '6px', border: '1px solid #cbd5e1', borderRadius: '4px' }} />
// // // //                                             <button type="button" onClick={() => removeModule(mIdx)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}><Trash2 size={18} /></button>
// // // //                                         </div>

// // // //                                         {/* Module Body (Topics & Criteria) */}
// // // //                                         {isExpanded && (
// // // //                                             <div style={{ padding: '15px 15px 15px 40px', borderTop: '1px solid #e2e8f0' }}>
// // // //                                                 <h4 style={{ margin: '0 0 10px 0', color: '#475569', fontSize: '0.85rem', textTransform: 'uppercase' }}>Assessed Topics</h4>

// // // //                                                 {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
// // // //                                                     <div key={tIdx} style={{ marginBottom: '15px', background: '#f1f5f9', padding: '10px', borderRadius: '6px' }}>
// // // //                                                         <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
// // // //                                                             <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{topic.code}:</strong>
// // // //                                                             <span style={{ flex: 1, fontSize: '0.9rem', color: '#334155' }}>{topic.title}</span>
// // // //                                                             {topic.weight > 0 && <span style={{ background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>{topic.weight}% Weight</span>}
// // // //                                                         </div>

// // // //                                                         {/* Render Criteria inside the Topic */}
// // // //                                                         {topic.criteria?.length > 0 && (
// // // //                                                             <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.8rem', color: '#64748b' }}>
// // // //                                                                 {topic.criteria.map((crit: any, cIdx: number) => (
// // // //                                                                     <li key={cIdx} style={{ marginBottom: '4px' }}>
// // // //                                                                         <strong>{crit.code}</strong> - {crit.description}
// // // //                                                                     </li>
// // // //                                                                 ))}
// // // //                                                             </ul>
// // // //                                                         )}
// // // //                                                     </div>
// // // //                                                 )) : (
// // // //                                                     <p style={{ fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic' }}>No topics found. Upload a CSV to populate.</p>
// // // //                                                 )}
// // // //                                             </div>
// // // //                                         )}
// // // //                                     </div>
// // // //                                 );
// // // //                             })}
// // // //                         </div>
// // // //                     </div>

// // // //                     <div className="modal-footer">
// // // //                         <button type="button" className="btn btn-outline" onClick={onClose}>
// // // //                             Cancel
// // // //                         </button>
// // // //                         <button type="submit" className="btn btn-primary">
// // // //                             <Save size={18} /> Save Programme
// // // //                         </button>
// // // //                     </div>
// // // //                 </form>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // // import React, { useState } from 'react';
// // // // // import { X, Save } from 'lucide-react';
// // // // // import { ModuleEditor } from '../common/ModuleEditor';
// // // // // import type { ModuleCategory, ProgrammeTemplate } from '../../types';

// // // // // interface ProgrammeFormModalProps {
// // // // //     programme?: ProgrammeTemplate | null;
// // // // //     onClose: () => void;
// // // // //     onSave: (programme: ProgrammeTemplate) => void;
// // // // //     title: string;
// // // // // }

// // // // // // Empty programme template for creation
// // // // // const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
// // // // //     name: '',
// // // // //     saqaId: '',
// // // // //     credits: 0,
// // // // //     totalNotionalHours: 0,
// // // // //     nqfLevel: 0,
// // // // //     knowledgeModules: [],
// // // // //     practicalModules: [],
// // // // //     workExperienceModules: [],
// // // // //     isArchived: false,
// // // // // };

// // // // // export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
// // // // //     programme,
// // // // //     onClose,
// // // // //     onSave,
// // // // //     title,
// // // // // }) => {
// // // // //     // Form state
// // // // //     const [formData, setFormData] = useState<ProgrammeTemplate>(
// // // // //         programme || { ...emptyProgramme, id: '' } as ProgrammeTemplate
// // // // //     );
// // // // //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');

// // // // //     // Handle input changes for simple fields
// // // // //     const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // // //         const { name, value, type, checked } = e.target;
// // // // //         const newValue = type === 'checkbox' ? checked : value;
// // // // //         setFormData({
// // // // //             ...formData,
// // // // //             [name]: type === 'number' ? (parseInt(value) || 0) : newValue,
// // // // //         });
// // // // //     };

// // // // //     // Module management
// // // // //     const addModule = (type: ModuleCategory) => {
// // // // //         const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // // // //         const newModule = { name: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 5 };
// // // // //         setFormData({
// // // // //             ...formData,
// // // // //             [key]: [...(formData[key] as any[]), newModule],
// // // // //         });
// // // // //     };

// // // // //     const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
// // // // //         const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // // // //         const updated = [...(formData[key] as any[])];
// // // // //         updated[index] = { ...updated[index], [field]: value };
// // // // //         setFormData({ ...formData, [key]: updated });
// // // // //     };

// // // // //     const removeModule = (type: ModuleCategory, index: number) => {
// // // // //         const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// // // // //         setFormData({
// // // // //             ...formData,
// // // // //             [key]: (formData[key] as any[]).filter((_, i) => i !== index),
// // // // //         });
// // // // //     };

// // // // //     // Submit handler
// // // // //     const handleSubmit = (e: React.FormEvent) => {
// // // // //         e.preventDefault();
// // // // //         onSave(formData);
// // // // //     };

// // // // //     return (
// // // // //         <div className="modal-overlay" onClick={onClose}>
// // // // //             <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
// // // // //                 <div className="modal-header">
// // // // //                     <h2>{title}</h2>
// // // // //                     <button type="button" className="icon-btn" onClick={onClose}>
// // // // //                         <X size={24} />
// // // // //                     </button>
// // // // //                 </div>

// // // // //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
// // // // //                     <div className="modal-body">
// // // // //                         <h3 className="section-title">Programme Details</h3>
// // // // //                         <div className="edit-grid">
// // // // //                             <div className="input-group" style={{ gridColumn: '1 / -1' }}>
// // // // //                                 <label>Programme Name *</label>
// // // // //                                 <input
// // // // //                                     type="text"
// // // // //                                     name="name"
// // // // //                                     required
// // // // //                                     value={formData.name}
// // // // //                                     onChange={handleChange}
// // // // //                                 />
// // // // //                             </div>
// // // // //                             <div className="input-group">
// // // // //                                 <label>SAQA ID *</label>
// // // // //                                 <input
// // // // //                                     type="text"
// // // // //                                     name="saqaId"
// // // // //                                     required
// // // // //                                     value={formData.saqaId}
// // // // //                                     onChange={handleChange}
// // // // //                                 />
// // // // //                             </div>
// // // // //                             <div className="input-group">
// // // // //                                 <label>NQF Level *</label>
// // // // //                                 <input
// // // // //                                     type="number"
// // // // //                                     name="nqfLevel"
// // // // //                                     required
// // // // //                                     min="1"
// // // // //                                     max="10"
// // // // //                                     value={formData.nqfLevel}
// // // // //                                     onChange={handleChange}
// // // // //                                 />
// // // // //                             </div>
// // // // //                             <div className="input-group">
// // // // //                                 <label>Total Credits *</label>
// // // // //                                 <input
// // // // //                                     type="number"
// // // // //                                     name="credits"
// // // // //                                     required
// // // // //                                     min="0"
// // // // //                                     value={formData.credits}
// // // // //                                     onChange={handleChange}
// // // // //                                 />
// // // // //                             </div>
// // // // //                             <div className="input-group">
// // // // //                                 <label>Total Notional Hours *</label>
// // // // //                                 <input
// // // // //                                     type="number"
// // // // //                                     name="totalNotionalHours"
// // // // //                                     required
// // // // //                                     min="0"
// // // // //                                     value={formData.totalNotionalHours}
// // // // //                                     onChange={handleChange}
// // // // //                                 />
// // // // //                             </div>
// // // // //                             {programme && (
// // // // //                                 <div className="input-group">
// // // // //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
// // // // //                                         <input
// // // // //                                             type="checkbox"
// // // // //                                             name="isArchived"
// // // // //                                             checked={formData.isArchived || false}
// // // // //                                             onChange={handleChange}
// // // // //                                         />
// // // // //                                         Archived
// // // // //                                     </label>
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>

// // // // //                         <h3 className="section-title">Template Modules</h3>
// // // // //                         <div className="tab-buttons">
// // // // //                             <button
// // // // //                                 type="button"
// // // // //                                 className={`btn ${activeTab === 'knowledge' ? 'btn-primary' : 'btn-outline'}`}
// // // // //                                 onClick={() => setActiveTab('knowledge')}
// // // // //                             >
// // // // //                                 Knowledge
// // // // //                             </button>
// // // // //                             <button
// // // // //                                 type="button"
// // // // //                                 className={`btn ${activeTab === 'practical' ? 'btn-primary' : 'btn-outline'}`}
// // // // //                                 onClick={() => setActiveTab('practical')}
// // // // //                             >
// // // // //                                 Practical
// // // // //                             </button>
// // // // //                             <button
// // // // //                                 type="button"
// // // // //                                 className={`btn ${activeTab === 'workExperience' ? 'btn-primary' : 'btn-outline'}`}
// // // // //                                 onClick={() => setActiveTab('workExperience')}
// // // // //                             >
// // // // //                                 Work Experience
// // // // //                             </button>
// // // // //                         </div>

// // // // //                         <ModuleEditor
// // // // //                             isTemplate
// // // // //                             modules={formData[`${activeTab}Modules`]}
// // // // //                             type={activeTab}
// // // // //                             onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
// // // // //                             onRemove={(i) => removeModule(activeTab, i)}
// // // // //                             onAdd={() => addModule(activeTab)}
// // // // //                         />
// // // // //                     </div>

// // // // //                     <div className="modal-footer">
// // // // //                         <button type="button" className="btn btn-outline" onClick={onClose}>
// // // // //                             Cancel
// // // // //                         </button>
// // // // //                         <button type="submit" className="btn btn-primary">
// // // // //                             <Save size={18} /> Save Programme
// // // // //                         </button>
// // // // //                     </div>
// // // // //                 </form>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };
