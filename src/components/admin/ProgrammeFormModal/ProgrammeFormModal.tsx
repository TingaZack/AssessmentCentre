// src/components/admin/ProgrammeFormModal.tsx

import React, { useState, useRef } from 'react';
import {
    X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
    Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2, AlertCircle, FileSpreadsheet,
    Wallet, Calendar, Tag, ShieldCheck, Zap
} from 'lucide-react';
import * as XLSX from 'xlsx';
import './ProgrammeFormModal.css';
import type { ProgrammeTemplate, ComplianceSchema, TrancheMilestone, EvidenceRequirement } from '../../../types';
import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

interface ProgrammeFormModalProps {
    programme?: ProgrammeTemplate | null;
    existingProgrammes: ProgrammeTemplate[];
    onClose: () => void;
    onSave: (programme: ProgrammeTemplate) => void;
    title: string;
}

// 🚀 DEFAULT SCHEMA
const defaultComplianceSchema: ComplianceSchema = {
    schemaId: 'default_tranche_1',
    schemaName: 'Standard Tranche Protocol',
    tranches: [
        {
            trancheId: 'tranche_0',
            title: 'Initial Registration',
            percentage: 0,
            dueAtMonth: 0,
            requirements: [
                { id: 'req_wblpa', label: 'WBLPA Contract', type: 'document', required: true, systemTag: 'wblpaAgreementUrl' },
                { id: 'req_id', label: 'Certified ID Document', type: 'document', required: true, systemTag: 'idDocumentUrl' }
            ]
        }
    ]
};

// 🚀 MICT SETA 6-TRANCHE SLA TEMPLATE
const mictSetaComplianceSchema: ComplianceSchema = {
    schemaId: 'mict_seta_6_tranche',
    schemaName: 'MICT SETA 6-Tranche Standard (Internship)',
    tranches: [
        {
            trancheId: 't1_mict', title: 'First Disbursement', percentage: 14, dueAtMonth: 1,
            requirements: [
                { id: 't1_req1', label: 'Workplace-Based Learning Programme/Internship Agreements', type: 'document', required: true, systemTag: 'wblpaAgreementUrl' },
                { id: 't1_req2', label: 'Certified copies of Qualifications', type: 'document', required: true, systemTag: 'qualificationUrl' },
                { id: 't1_req3', label: 'Certified copy of Identity Document (ID)', type: 'document', required: true, systemTag: 'idDocumentUrl' },
                { id: 't1_req4', label: 'Programme roll-out plan', type: 'document', required: true },
                { id: 't1_req5', label: 'Fixed Employment Contracts', type: 'document', required: true, systemTag: 'employmentContractUrl' },
                { id: 't1_req6', label: '1st Invoice', type: 'document', required: true },
                { id: 't1_req7', label: 'Stamped Bank Letter (Not older than 3 months)', type: 'document', required: true },
                { id: 't1_req8', label: 'Learner affidavit (Not enrolled on other SETAs)', type: 'document', required: true },
                { id: 't1_req9', label: 'SLA induction report', type: 'document', required: true },
                { id: 't1_req10', label: 'Induction register', type: 'document', required: true },
                { id: 't1_req11', label: 'Learner Induction Report', type: 'document', required: true }
            ]
        },
        {
            trancheId: 't2_mict', title: 'Second Disbursement', percentage: 14, dueAtMonth: 3,
            requirements: [
                { id: 't2_req1', label: '1 month proof of payment to the learners', type: 'pop', required: true },
                { id: 't2_req2', label: '2nd Invoice', type: 'document', required: true },
                { id: 't2_req3', label: 'Site visit report by MICT SETA', type: 'site_visit', required: true },
                { id: 't2_req4', label: 'Daily attendance registers/timesheets', type: 'report', required: true }
            ]
        },
        {
            trancheId: 't3_mict', title: 'Third Disbursement', percentage: 16, dueAtMonth: 6,
            requirements: [
                { id: 't3_req1', label: 'Quarterly Progress Report', type: 'report', required: true },
                { id: 't3_req2', label: 'Success stories', type: 'document', required: true },
                { id: 't3_req3', label: '2 months proofs of payment to the learners', type: 'pop', required: true },
                { id: 't3_req4', label: 'Site visit report by MICT SETA', type: 'site_visit', required: true },
                { id: 't3_req5', label: 'Daily attendance registers/timesheets', type: 'report', required: true }
            ]
        },
        {
            trancheId: 't4_mict', title: 'Fourth Disbursement', percentage: 16, dueAtMonth: 9,
            requirements: [
                { id: 't4_req1', label: '4th Invoice', type: 'document', required: true },
                { id: 't4_req2', label: '3 months proof of payment to the learners', type: 'pop', required: true },
                { id: 't4_req3', label: 'Quarterly Progress Report', type: 'report', required: true },
                { id: 't4_req4', label: 'Success stories', type: 'document', required: true },
                { id: 't4_req5', label: 'Daily attendance registers/timesheets', type: 'report', required: true },
                { id: 't4_req6', label: 'Site visit report by MICT SETA', type: 'site_visit', required: true }
            ]
        },
        {
            trancheId: 't5_mict', title: 'Fifth Disbursement', percentage: 18, dueAtMonth: 11,
            requirements: [
                { id: 't5_req1', label: '5th Invoice', type: 'document', required: true },
                { id: 't5_req2', label: 'Quarterly Progress Report', type: 'report', required: true },
                { id: 't5_req3', label: 'Success stories', type: 'document', required: true },
                { id: 't5_req4', label: '3 months proof of payment to the learners', type: 'pop', required: true },
                { id: 't5_req5', label: 'Daily attendance registers/timesheets', type: 'report', required: true },
                { id: 't5_req6', label: 'Site visit report by MICT SETA', type: 'site_visit', required: true }
            ]
        },
        {
            trancheId: 't6_mict', title: 'Sixth Disbursement (Completion)', percentage: 22, dueAtMonth: 12,
            requirements: [
                { id: 't6_req1', label: '6th Invoice', type: 'document', required: true },
                { id: 't6_req2', label: 'Success stories', type: 'document', required: true },
                { id: 't6_req3', label: 'Daily attendance registers/timesheets', type: 'report', required: true },
                { id: 't6_req4', label: 'Site visit report by MICT SETA', type: 'site_visit', required: true },
                { id: 't6_req5', label: '3 months proof of payment to the learners', type: 'pop', required: true },
                { id: 't6_req6', label: 'Completion letter', type: 'document', required: true }
            ]
        }
    ]
};

const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
    name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0,
    knowledgeModules: [], practicalModules: [], workExperienceModules: [], isArchived: false,
    complianceSchema: defaultComplianceSchema
};

type FormTabs = 'knowledge' | 'practical' | 'workExperience' | 'evidence';

const TAB_META: Record<FormTabs, { label: string; icon: React.ReactNode }> = {
    knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
    practical: { label: 'Practical', icon: <FileText size={13} /> },
    workExperience: { label: 'Workplace', icon: <Briefcase size={13} /> },
    evidence: { label: 'Funding & Tranches', icon: <Wallet size={13} /> },
};

export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
    programme, existingProgrammes, onClose, onSave, title,
}) => {
    const [formData, setFormData] = useState<ProgrammeTemplate>(
        programme ? {
            ...programme,
            complianceSchema: programme.complianceSchema || defaultComplianceSchema
        } : {
            ...emptyProgramme,
            curriculumCode: '',
            programmeType: 'Occupational Certificate',
            accreditingBody: 'QCTO',
            id: ''
        } as any
    );

    const [activeTab, setActiveTab] = useState<FormTabs>('knowledge');
    const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
    const [showTextParser, setShowTextParser] = useState(false);
    const [rawText, setRawText] = useState('');

    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

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
        if (type === 'number') finalValue = parseInt(value) || 0;
        else if (type === 'checkbox') finalValue = (e.target as HTMLInputElement).checked;
        setFormData({ ...formData, [name]: finalValue });
    };

    const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
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

    const processRawTextData = (textToParse: string) => {
        if (!textToParse.trim()) return;

        let kMs: any[] = [...(formData.knowledgeModules || [])];
        let pMs: any[] = [...(formData.practicalModules || [])];
        let wMs: any[] = [...(formData.workExperienceModules || [])];

        let currentModule: any = null;
        let currentTopic: any = null;

        let sanitized = textToParse
            .replace(/pg\.?\s*\d+(-\d+)?/gi, ' ')
            .replace(/P\s*M-/gi, 'PM-').replace(/K\s*M-/gi, 'KM-').replace(/W\s*M-/gi, 'WM-')
            .replace(/Topic elements to be covered include:?/gi, ' ')
            .replace(/SECTION\s+\w+:\s+[A-Z\s]+SPECIFICATIONS/gi, ' ');

        const lines = sanitized.split('\n').map(l => l.trim()).filter(Boolean);

        const saveCurrentModule = () => {
            if (currentModule) {
                if (currentTopic) {
                    currentModule.topics.push(currentTopic);
                    currentTopic = null;
                }
                if (currentModule.type === 'KM') kMs.push(currentModule);
                else if (currentModule.type === 'PM') pMs.push(currentModule);
                else wMs.push(currentModule);
            }
        };

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            let modMatch = line.match(/^(251201-\d{3}-\d{2}-(KM|PM|WM)-\d{2}|US-\d{6})\s*(KM|PM|WM)?/i);
            if (!modMatch) {
                modMatch = line.match(/^([A-Z0-9\-]+)\s+(KM|PM|WM)\b/i);
            }

            if (modMatch) {
                saveCurrentModule();

                const code = modMatch[1].toUpperCase();
                let type = modMatch[3]?.toUpperCase() || modMatch[2]?.toUpperCase();

                if (!type) {
                    if (code.includes('-KM-')) type = 'KM';
                    else if (code.includes('-PM-')) type = 'PM';
                    else if (code.includes('-WM-')) type = 'WM';
                    else type = 'WM';
                }

                currentModule = {
                    code: code,
                    type: type,
                    name: line.replace(modMatch[0], '').trim(),
                    nqfLevel: formData.nqfLevel || 4,
                    credits: 0,
                    notionalHours: 0,
                    topics: []
                };
                continue;
            }

            if (!currentModule) continue;

            if (!currentTopic) {
                if (!line.match(/^([A-Z0-9\-]+-(?:KT|PS|WE)\d{2}|SO\d+)/i)) {
                    const nqfMatch = line.match(/NQF Level\s*(\d+)/i);
                    const credMatch = line.match(/Credits\s*(\d+)/i);

                    if (nqfMatch) currentModule.nqfLevel = parseInt(nqfMatch[1], 10);
                    if (credMatch) {
                        currentModule.credits = parseInt(credMatch[1], 10);
                        currentModule.notionalHours = currentModule.credits * 10;
                    }

                    const cleanName = line.replace(/NQF Level\s*\d+/i, '').replace(/Credits\s*\d+/i, '').trim();
                    if (cleanName) {
                        currentModule.name = currentModule.name ? `${currentModule.name} ${cleanName}` : cleanName;
                    }
                    continue;
                }
            }

            const topicMatch = line.match(/^([A-Z0-9\-]+-(?:KT|PS|WE)\d{2,4}|SO\d+)(.*)/i);
            if (topicMatch) {
                if (currentTopic) currentModule.topics.push(currentTopic);

                const tCode = topicMatch[1].toUpperCase();
                let remainder = topicMatch[2].trim();

                let tWeight = 0;
                const weightMatch = remainder.match(/(\d+)\s*%$/);
                if (weightMatch) {
                    tWeight = parseInt(weightMatch[1], 10);
                    remainder = remainder.replace(/(\d+)\s*%$/, '').trim();
                }

                currentTopic = {
                    code: tCode,
                    title: remainder || 'Topic',
                    weight: tWeight,
                    criteria: []
                };
                continue;
            }

            if (currentTopic) {
                const critMatch = line.match(/^(?:•\s*)?((?:KT|PS|WE)\s*\d{2,4}|AC\d+\.\d+)?(.*)/i);

                if (critMatch && (critMatch[1] || line.startsWith('•') || line.match(/^AC\d+/i))) {
                    let cCode = critMatch[1] ? critMatch[1].replace(/\s+/g, '').toUpperCase() : '';
                    let cDesc = critMatch[2].replace(/^[:\-]\s*/, '').trim();

                    if (!cCode && !cDesc) cDesc = line.replace(/^•\s*/, '').trim();

                    if (cCode || cDesc) {
                        currentTopic.criteria.push({ code: cCode, description: cDesc });
                    }
                } else if (line.trim()) {
                    if (currentTopic.criteria.length > 0) {
                        currentTopic.criteria[currentTopic.criteria.length - 1].description += ' ' + line.trim();
                    } else {
                        currentTopic.title += ' ' + line.trim();
                    }
                }
            }
        }

        saveCurrentModule();

        setFormData(prev => ({
            ...prev,
            knowledgeModules: kMs,
            practicalModules: pMs,
            workExperienceModules: wMs
        }));

        setStatusModal({ type: 'success', title: 'Parsing Complete', message: 'Curriculum text parsed successfully. Please review the tabs.', onClose: () => setStatusModal(null) });
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setIsImporting(true);

        const reader = new FileReader();

        reader.onload = async (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
                if (!rawRows.length) { setIsImporting(false); return; }

                const headerRow = (rawRows[0] || []).map(h => String(h).replace(/\s/g, '').toLowerCase());
                const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

                if (isStructured) {
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
                            const m = { code: mCode, name: getVal(row, 'modulename') || '', nqfLevel: parseInt(getVal(row, 'nqflevel')) || formData.nqfLevel || 4, credits: credits, notionalHours: credits * 10, topics: [] };
                            moduleMap.set(mCode, m);
                            if (cat.includes('knowledge')) parsed.knowledgeModules.push(m);
                            else if (cat.includes('practical')) parsed.practicalModules.push(m);
                            else if (cat.includes('work')) parsed.workExperienceModules.push(m);
                        } else if (type.toLowerCase() === 'topic' && tCode) {
                            const parent = moduleMap.get(mCode);
                            if (parent) {
                                const t = { code: tCode, title: getVal(row, 'topicname') || '', weight: parseInt(getVal(row, 'weight')) || 0, criteria: [] };
                                parent.topics.push(t);
                                topicMap.set(tCode, t);
                            }
                        } else if (type.toLowerCase() === 'criteria') {
                            const pt = topicMap.get(tCode);
                            if (pt) pt.criteria.push({ code: getVal(row, 'criteriacode') || '', description: getVal(row, 'criteriadescription') || '' });
                        }
                    });

                    setFormData(prev => ({
                        ...prev,
                        knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
                        practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
                        workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules]
                    }));

                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    setStatusModal({ type: 'success', title: 'Import Successful', message: 'Structured Curriculum spreadsheet imported successfully!', onClose: () => setStatusModal(null) });

                } else {
                    const combinedText = rawRows.map(r => r.filter(c => String(c).trim()).join(' ')).join('\n');
                    processRawTextData(combinedText);
                    setIsImporting(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }

            } catch (err) {
                console.error(err);
                setIsImporting(false);
                setStatusModal({ type: 'error', title: 'Import Failed', message: 'Failed to read the file. Please check the format.', onClose: () => setStatusModal(null) });
            }
        };

        reader.onerror = () => {
            setIsImporting(false);
            setStatusModal({ type: 'error', title: 'Import Failed', message: 'Failed to read the file.', onClose: () => setStatusModal(null) });
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

    // ─── 🚀 IMMUTABLE TRANCHE BUILDER FUNCTIONS ───

    const loadMictSetaSchema = () => {
        setFormData(prev => ({
            ...prev,
            complianceSchema: mictSetaComplianceSchema
        }));
        setStatusModal({ type: 'success', title: 'Template Loaded', message: 'The standard 6-Tranche MICT SETA SLA schema has been loaded successfully.', onClose: () => setStatusModal(null) });
    };

    const addTranche = () => {
        setFormData(prev => {
            const currentTranches = [...(prev.complianceSchema?.tranches || [])];
            const newTrancheId = `tranche_${Date.now()}`;

            currentTranches.push({
                trancheId: newTrancheId,
                title: `Tranche ${currentTranches.length + 1}`,
                percentage: 0,
                dueAtMonth: currentTranches.length * 3,
                requirements: []
            });

            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches: currentTranches }
            };
        });
    };

    const updateTranche = (tIdx: number, field: keyof TrancheMilestone, value: any) => {
        setFormData(prev => {
            const tranches = [...(prev.complianceSchema?.tranches || [])];
            tranches[tIdx] = { ...tranches[tIdx], [field]: value };
            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches }
            };
        });
    };

    const removeTranche = (tIdx: number) => {
        setFormData(prev => {
            const tranches = (prev.complianceSchema?.tranches || []).filter((_, i) => i !== tIdx);
            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches }
            };
        });
    };

    const addRequirement = (tIdx: number) => {
        setFormData(prev => {
            const tranches = [...(prev.complianceSchema?.tranches || [])];
            const reqs = [...(tranches[tIdx].requirements || [])];

            reqs.push({
                id: `req_${Date.now()}`,
                label: '',
                type: 'document',
                required: true
            });

            tranches[tIdx] = { ...tranches[tIdx], requirements: reqs };

            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches }
            };
        });
    };

    const updateRequirement = (tIdx: number, rIdx: number, field: keyof EvidenceRequirement, value: any) => {
        setFormData(prev => {
            const tranches = [...(prev.complianceSchema?.tranches || [])];
            const reqs = [...(tranches[tIdx].requirements || [])];

            reqs[rIdx] = { ...reqs[rIdx], [field]: value };
            tranches[tIdx] = { ...tranches[tIdx], requirements: reqs };

            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches }
            };
        });
    };

    const removeRequirement = (tIdx: number, rIdx: number) => {
        setFormData(prev => {
            const tranches = [...(prev.complianceSchema?.tranches || [])];
            const reqs = (tranches[tIdx].requirements || []).filter((_, i) => i !== rIdx);

            tranches[tIdx] = { ...tranches[tIdx], requirements: reqs };

            return {
                ...prev,
                complianceSchema: { ...prev.complianceSchema!, tranches }
            };
        });
    };

    // ── MANUAL SAVE FUNCTION ──
    const executeSave = async () => {
        try {
            const nameStr = formData.name?.toString() || '';
            const saqaStr = formData.saqaId?.toString() || '';
            const codeStr = (formData as any).curriculumCode?.toString() || '';

            if (!nameStr.trim() || !saqaStr.trim()) {
                setStatusModal({ type: 'warning', title: 'Missing Details', message: 'Please provide both a Programme Title and a SAQA ID before saving.', onClose: () => setStatusModal(null) });
                return;
            }

            const formSaqa = saqaStr.trim();
            const formCode = codeStr.trim();

            const isDuplicate = (existingProgrammes || []).some(p => {
                if (programme && p.id === programme.id) return false;
                const existingSaqa = p.saqaId?.toString().trim();
                const existingCode = (p as any).curriculumCode?.toString().trim();
                return (formSaqa && existingSaqa && formSaqa === existingSaqa) || (formCode && existingCode && formCode === existingCode);
            });

            if (isDuplicate) {
                setStatusModal({ type: 'error', title: 'Duplicate Detected', message: 'A qualification with this SAQA ID or Curriculum Code already exists in the system.', onClose: () => setStatusModal(null) });
                return;
            }

            const rawId = formCode || formSaqa;
            const safeDocumentId = rawId.replace(/[\s/]+/g, '-');

            const dataToSave = { ...formData, id: formData.id || safeDocumentId };

            setIsSaving(true);
            await Promise.resolve(onSave(dataToSave));
            onClose();

        } catch (err: any) {
            console.error("Save failed:", err);
            setStatusModal({ type: 'error', title: 'Save Failed', message: err.message || 'An unexpected error occurred while communicating with the database. Please try again.', onClose: () => setStatusModal(null) });
        } finally {
            setIsSaving(false);
        }
    };

    const currentModules = activeTab !== 'evidence' ? (formData[`${activeTab}Modules`] as any[]) : [];
    const currentSchema = formData.complianceSchema || defaultComplianceSchema;

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
                                            <option value="Internship">Internship</option>
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

                            {/* Main Interactive Header */}
                            <div>
                                <div className="pfm-modules-hdr">
                                    <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum & Compliance Matrices</div>

                                    {/* Only show Curriculum tools if not on Evidence Tab */}
                                    {activeTab !== 'evidence' && (
                                        <div className="pfm-import-actions">
                                            <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--mlab-border)', paddingRight: '8px', marginRight: '4px' }}>
                                                <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('xlsx')}><FileSpreadsheet size={12} color="#10b981" /> .XLSX Template</button>
                                                <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('csv')}><FileText size={12} color="#0ea5e9" /> .CSV</button>
                                            </div>
                                            <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
                                            <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
                                                {isImporting ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import File</>}
                                            </button>
                                            <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
                                                <ClipboardPaste size={12} /> Paste QCTO Text
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

                                {/* Parser UI */}
                                {showTextParser && activeTab !== 'evidence' && (
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
                                    {(Object.keys(TAB_META) as FormTabs[]).map(tab => (
                                        <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                                            {TAB_META[tab].icon}{TAB_META[tab].label}
                                            {tab !== 'evidence' && (
                                                <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
                                            )}
                                        </button>
                                    ))}
                                </div>

                                {/* ─── THE NEW TRANCHE BUILDER TAB ─── */}
                                {activeTab === 'evidence' ? (
                                    <div className="pfm-module-list" style={{ padding: '0 0.5rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem', padding: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 800 }}>
                                                    <ShieldCheck size={16} color="var(--mlab-blue)" /> Funding & Disbursement Schema Configuration
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={loadMictSetaSchema}
                                                    style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}
                                                >
                                                    <Zap size={14} /> Load MICT SETA 6-Tranche Standard
                                                </button>
                                            </div>
                                            <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
                                                Define the tranches, milestones, and required evidence needed to unlock disbursements for learners placed on this programme. Placements will inherit this blueprint to power their visual timeline and ZIP exports.
                                            </p>
                                        </div>

                                        <div className="wm-form-group wm-form-group--full" style={{ marginBottom: '1.5rem' }}>
                                            <label className="wm-form-label">Schema Label (Identifier)</label>
                                            <input
                                                className="pfm-input"
                                                style={{ width: '100%' }}
                                                placeholder="e.g. MICT SETA 6-Tranche Standard"
                                                value={currentSchema.schemaName}
                                                onChange={e => setFormData(p => ({ ...p, complianceSchema: { ...p.complianceSchema!, schemaName: e.target.value } }))}
                                            />
                                        </div>

                                        {currentSchema.tranches.map((tranche, tIdx) => (
                                            <div key={tranche.trancheId} className="pfm-module-card" style={{ borderLeft: '3px solid var(--mlab-blue)' }}>
                                                <div className="pfm-module-card__hdr expanded" style={{ background: '#f8fafc', padding: '10px 12px' }}>
                                                    <input className="pfm-module-input pfm-module-input--name" style={{ fontWeight: 800, color: 'var(--mlab-midnight)' }} placeholder="Tranche Title" value={tranche.title} onChange={e => updateTranche(tIdx, 'title', e.target.value)} />

                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', paddingLeft: '8px' }}>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Yield:</span>
                                                            <input className="pfm-module-input" style={{
                                                                width: '50px', border: 'none', color: 'black', textAlign: 'right',
                                                                padding: '4px'
                                                            }} type="number" value={tranche.percentage || ''}
                                                                onChange={e => updateTranche(tIdx, 'percentage', parseInt(e.target.value) || 0)} />
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', paddingRight: '8px' }}>%</span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', paddingLeft: '8px' }}>
                                                            <Calendar size={12} color="#64748b" />
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>Due at Month:</span>
                                                            <input className="pfm-module-input" style={{ width: '40px', color: 'black', border: 'none', textAlign: 'center', padding: '4px' }} type="number" value={tranche.dueAtMonth} onChange={e => updateTranche(tIdx, 'dueAtMonth', parseInt(e.target.value) || 0)} />
                                                        </div>

                                                        <button type="button" className="pfm-remove-btn" onClick={() => removeTranche(tIdx)}><Trash2 size={15} /></button>
                                                    </div>
                                                </div>

                                                <div className="pfm-module-card__body" style={{ background: 'white', padding: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
                                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Required Evidence Log</span>
                                                        <button type="button" onClick={() => addRequirement(tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: 'var(--mlab-blue)', border: '1px solid #bfdbfe', padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>
                                                            <Plus size={12} /> Add Requirement
                                                        </button>
                                                    </div>

                                                    {tranche.requirements.length > 0 ? tranche.requirements.map((req, rIdx) => (
                                                        <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', padding: '6px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                                                                <input type="checkbox" checked={req.required} onChange={e => updateRequirement(tIdx, rIdx, 'required', e.target.checked)} title="Is this strictly required?" style={{ cursor: 'pointer' }} />
                                                                <input className="pfm-input" style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }} placeholder="Document or Task Name" value={req.label} onChange={e => updateRequirement(tIdx, rIdx, 'label', e.target.value)} />
                                                            </div>

                                                            <select className="pfm-input" style={{ width: '130px', padding: '4px 8px', fontSize: '0.75rem', color: '#475569' }} value={req.type} onChange={e => updateRequirement(tIdx, rIdx, 'type', e.target.value)}>
                                                                <option value="document">PDF Upload</option>
                                                                <option value="site_visit">Site Visit Module</option>
                                                                <option value="report">Report Writer</option>
                                                                <option value="pop">Proof of Payment</option>
                                                            </select>

                                                            <div style={{ position: 'relative' }}>
                                                                <select className="pfm-input" style={{ width: '150px', padding: '4px 8px 4px 24px', fontSize: '0.75rem', color: req.systemTag ? 'var(--mlab-blue)' : '#94a3b8' }} value={req.systemTag || ''} onChange={e => updateRequirement(tIdx, rIdx, 'systemTag', e.target.value || undefined)}>
                                                                    <option value="">No System Tag</option>
                                                                    <option value="wblpaAgreementUrl">WBLPA Agreement</option>
                                                                    <option value="employmentContractUrl">Employment Contract</option>
                                                                    <option value="idDocumentUrl">Certified ID</option>
                                                                    <option value="qualificationUrl">Highest Qual.</option>
                                                                </select>
                                                                <Tag size={10} color={req.systemTag ? 'var(--mlab-blue)' : '#94a3b8'} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
                                                            </div>

                                                            <button type="button" className="pfm-remove-btn" onClick={() => removeRequirement(tIdx, rIdx)}><X size={14} /></button>
                                                        </div>
                                                    )) : (
                                                        <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '4px' }}>
                                                            No evidence required for this tranche. Click 'Add Requirement' above.
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}

                                        <button type="button" onClick={addTranche} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '12px', background: 'white', border: '1px dashed var(--mlab-blue)', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#eff6ff'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
                                            <Plus size={14} /> Append New Tranche Milestone
                                        </button>
                                    </div>
                                ) : (
                                    /* ─── STANDARD CURRICULUM MODULES LIST ─── */
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
                                )}
                            </div>
                        </div>

                        <div className="pfm-footer">
                            <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="button" className="pfm-btn pfm-btn--primary" onClick={executeSave} disabled={isSaving}>
                                {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum Blueprint</>}
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

// // src/components/admin/ProgrammeFormModal.tsx

// import React, { useState, useRef } from 'react';
// import {
//     X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
//     Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2, AlertCircle, FileSpreadsheet,
//     Wallet, Calendar, Tag, ShieldCheck
// } from 'lucide-react';
// import * as XLSX from 'xlsx';
// import './ProgrammeFormModal.css';
// import type { ProgrammeTemplate, ComplianceSchema, TrancheMilestone, EvidenceRequirement } from '../../../types';
// import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

// interface ProgrammeFormModalProps {
//     programme?: ProgrammeTemplate | null;
//     existingProgrammes: ProgrammeTemplate[];
//     onClose: () => void;
//     onSave: (programme: ProgrammeTemplate) => void;
//     title: string;
// }

// // 🚀 NEW: Default Compliance Schema (If building a new programme from scratch)
// const defaultComplianceSchema: ComplianceSchema = {
//     schemaId: 'default_tranche_1',
//     schemaName: 'Standard Tranche Protocol',
//     tranches: [
//         {
//             trancheId: 'tranche_0',
//             title: 'Initial Registration',
//             percentage: 0,
//             dueAtMonth: 0,
//             requirements: [
//                 { id: 'req_wblpa', label: 'WBLPA Contract', type: 'document', required: true, systemTag: 'wblpaAgreementUrl' },
//                 { id: 'req_id', label: 'Certified ID Document', type: 'document', required: true, systemTag: 'idDocumentUrl' }
//             ]
//         }
//     ]
// };

// const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
//     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0,
//     knowledgeModules: [], practicalModules: [], workExperienceModules: [], isArchived: false,
//     complianceSchema: defaultComplianceSchema
// };

// // Added Evidence / Tranches Tab
// type FormTabs = 'knowledge' | 'practical' | 'workExperience' | 'evidence';

// const TAB_META: Record<FormTabs, { label: string; icon: React.ReactNode }> = {
//     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
//     practical: { label: 'Practical', icon: <FileText size={13} /> },
//     workExperience: { label: 'Workplace', icon: <Briefcase size={13} /> },
//     evidence: { label: 'Funding & Tranches', icon: <Wallet size={13} /> },
// };

// export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
//     programme, existingProgrammes, onClose, onSave, title,
// }) => {
//     const [formData, setFormData] = useState<ProgrammeTemplate>(
//         programme ? {
//             ...programme,
//             complianceSchema: programme.complianceSchema || defaultComplianceSchema
//         } : {
//             ...emptyProgramme,
//             curriculumCode: '',
//             programmeType: 'Occupational Certificate',
//             accreditingBody: 'QCTO',
//             id: ''
//         } as any
//     );

//     const [activeTab, setActiveTab] = useState<FormTabs>('knowledge');
//     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
//     const [showTextParser, setShowTextParser] = useState(false);
//     const [rawText, setRawText] = useState('');

//     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

//     const [isImporting, setIsImporting] = useState(false);
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
//         if (type === 'number') finalValue = parseInt(value) || 0;
//         else if (type === 'checkbox') finalValue = (e.target as HTMLInputElement).checked;
//         setFormData({ ...formData, [name]: finalValue });
//     };

//     const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
//         const fileUrl = format === 'csv'
//             ? '/templates/programme/Learning_Matrix_Form2_Template.csv'
//             : '/templates/programme/Learning_Matrix_Form2_Template.xlsx';
//         const link = document.createElement("a");
//         link.href = fileUrl;
//         link.download = `Learning_Matrix_Form2_Template.${format}`;
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//     };

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

//             const newModule: any = { code: mCode, name: mName || `${mType} Module`, nqfLevel: mNqf, credits: mCredits, notionalHours: mCredits * 10, topics: [] };

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

//         setFormData(prev => ({ ...prev, knowledgeModules: kMs, practicalModules: pMs, workExperienceModules: wMs }));
//         setStatusModal({ type: 'success', title: 'Parsing Complete', message: 'QCTO Curriculum text parsed successfully!', onClose: () => setStatusModal(null) });
//     };

//     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
//         const file = event.target.files?.[0];
//         if (!file) return;
//         setIsImporting(true);

//         const reader = new FileReader();

//         reader.onload = async (e) => {
//             try {
//                 const data = new Uint8Array(e.target?.result as ArrayBuffer);
//                 const workbook = XLSX.read(data, { type: 'array' });
//                 const firstSheetName = workbook.SheetNames[0];
//                 const worksheet = workbook.Sheets[firstSheetName];

//                 const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];
//                 if (!rawRows.length) { setIsImporting(false); return; }

//                 const headerRow = (rawRows[0] || []).map(h => String(h).replace(/\s/g, '').toLowerCase());
//                 const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

//                 if (isStructured) {
//                     const sRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];
//                     const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
//                     const moduleMap = new Map<string, any>();
//                     const topicMap = new Map<string, any>();

//                     const getVal = (row: any, key: string) => {
//                         const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
//                         return exactKey ? String(row[exactKey] || "").trim() : "";
//                     };

//                     sRows.forEach(row => {
//                         const type = getVal(row, 'type');
//                         const cat = getVal(row, 'category').toLowerCase();
//                         const mCode = getVal(row, 'modulecode');
//                         const tCode = getVal(row, 'topiccode');

//                         if (!mCode) return;

//                         if (type.toLowerCase() === 'module') {
//                             const credits = parseInt(getVal(row, 'credits')) || 0;
//                             const m = { code: mCode, name: getVal(row, 'modulename') || '', nqfLevel: parseInt(getVal(row, 'nqflevel')) || formData.nqfLevel || 4, credits: credits, notionalHours: credits * 10, topics: [] };
//                             moduleMap.set(mCode, m);
//                             if (cat.includes('knowledge')) parsed.knowledgeModules.push(m);
//                             else if (cat.includes('practical')) parsed.practicalModules.push(m);
//                             else if (cat.includes('work')) parsed.workExperienceModules.push(m);
//                         } else if (type.toLowerCase() === 'topic' && tCode) {
//                             const parent = moduleMap.get(mCode);
//                             if (parent) {
//                                 const t = { code: tCode, title: getVal(row, 'topicname') || '', weight: parseInt(getVal(row, 'weight')) || 0, criteria: [] };
//                                 parent.topics.push(t);
//                                 topicMap.set(tCode, t);
//                             }
//                         } else if (type.toLowerCase() === 'criteria') {
//                             const pt = topicMap.get(tCode);
//                             if (pt) pt.criteria.push({ code: getVal(row, 'criteriacode') || '', description: getVal(row, 'criteriadescription') || '' });
//                         }
//                     });

//                     setFormData(prev => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules], practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules], workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules] }));
//                     setIsImporting(false);
//                     if (fileInputRef.current) fileInputRef.current.value = '';
//                     setStatusModal({ type: 'success', title: 'Import Successful', message: 'Structured Curriculum spreadsheet imported successfully!', onClose: () => setStatusModal(null) });

//                 } else {
//                     const combinedText = rawRows.map(r => r.filter(c => String(c).trim()).join(' ')).join('\n');
//                     processRawTextData(combinedText);
//                     setIsImporting(false);
//                     if (fileInputRef.current) fileInputRef.current.value = '';
//                 }

//             } catch (err) {
//                 console.error(err);
//                 setIsImporting(false);
//                 setStatusModal({ type: 'error', title: 'Import Failed', message: 'Failed to read the file. Please check the format.', onClose: () => setStatusModal(null) });
//             }
//         };

//         reader.onerror = () => {
//             setIsImporting(false);
//             setStatusModal({ type: 'error', title: 'Import Failed', message: 'Failed to read the file.', onClose: () => setStatusModal(null) });
//         };
//         reader.readAsArrayBuffer(file);
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

//     // ─── 🚀 DYNAMIC TRANCHE BUILDER FUNCTIONS ───

//     const addTranche = () => {
//         const currentTranches = formData.complianceSchema?.tranches || [];
//         const newTrancheId = `tranche_${Date.now()}`;

//         const newTranche: TrancheMilestone = {
//             trancheId: newTrancheId,
//             title: `Tranche ${currentTranches.length + 1}`,
//             percentage: 0,
//             dueAtMonth: currentTranches.length * 3, // Auto-spacing out by quarters
//             requirements: []
//         };

//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: {
//                 ...prev.complianceSchema!,
//                 tranches: [...currentTranches, newTranche]
//             }
//         }));
//     };

//     const updateTranche = (tIdx: number, field: keyof TrancheMilestone, value: any) => {
//         const updatedTranches = [...(formData.complianceSchema?.tranches || [])];
//         updatedTranches[tIdx] = { ...updatedTranches[tIdx], [field]: value };
//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: { ...prev.complianceSchema!, tranches: updatedTranches }
//         }));
//     };

//     const removeTranche = (tIdx: number) => {
//         const updatedTranches = (formData.complianceSchema?.tranches || []).filter((_, i) => i !== tIdx);
//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: { ...prev.complianceSchema!, tranches: updatedTranches }
//         }));
//     };

//     const addRequirement = (tIdx: number) => {
//         const updatedTranches = [...(formData.complianceSchema?.tranches || [])];
//         const reqId = `req_${Date.now()}`;

//         updatedTranches[tIdx].requirements.push({
//             id: reqId,
//             label: '',
//             type: 'document',
//             required: true
//         });

//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: { ...prev.complianceSchema!, tranches: updatedTranches }
//         }));
//     };

//     const updateRequirement = (tIdx: number, rIdx: number, field: keyof EvidenceRequirement, value: any) => {
//         const updatedTranches = [...(formData.complianceSchema?.tranches || [])];
//         updatedTranches[tIdx].requirements[rIdx] = {
//             ...updatedTranches[tIdx].requirements[rIdx],
//             [field]: value
//         };
//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: { ...prev.complianceSchema!, tranches: updatedTranches }
//         }));
//     };

//     const removeRequirement = (tIdx: number, rIdx: number) => {
//         const updatedTranches = [...(formData.complianceSchema?.tranches || [])];
//         updatedTranches[tIdx].requirements = updatedTranches[tIdx].requirements.filter((_, i) => i !== rIdx);
//         setFormData(prev => ({
//             ...prev,
//             complianceSchema: { ...prev.complianceSchema!, tranches: updatedTranches }
//         }));
//     };


//     // ── MANUAL SAVE FUNCTION ──
//     const executeSave = async () => {
//         try {
//             const nameStr = formData.name?.toString() || '';
//             const saqaStr = formData.saqaId?.toString() || '';
//             const codeStr = (formData as any).curriculumCode?.toString() || '';

//             if (!nameStr.trim() || !saqaStr.trim()) {
//                 setStatusModal({ type: 'warning', title: 'Missing Details', message: 'Please provide both a Programme Title and a SAQA ID before saving.', onClose: () => setStatusModal(null) });
//                 return;
//             }

//             const formSaqa = saqaStr.trim();
//             const formCode = codeStr.trim();

//             const isDuplicate = (existingProgrammes || []).some(p => {
//                 if (programme && p.id === programme.id) return false;
//                 const existingSaqa = p.saqaId?.toString().trim();
//                 const existingCode = (p as any).curriculumCode?.toString().trim();
//                 return (formSaqa && existingSaqa && formSaqa === existingSaqa) || (formCode && existingCode && formCode === existingCode);
//             });

//             if (isDuplicate) {
//                 setStatusModal({ type: 'error', title: 'Duplicate Detected', message: 'A qualification with this SAQA ID or Curriculum Code already exists in the system.', onClose: () => setStatusModal(null) });
//                 return;
//             }

//             const rawId = formCode || formSaqa;
//             const safeDocumentId = rawId.replace(/[\s/]+/g, '-');

//             const dataToSave = { ...formData, id: formData.id || safeDocumentId };

//             setIsSaving(true);
//             await Promise.resolve(onSave(dataToSave));
//             onClose();

//         } catch (err: any) {
//             console.error("Save failed:", err);
//             setStatusModal({ type: 'error', title: 'Save Failed', message: err.message || 'An unexpected error occurred while communicating with the database. Please try again.', onClose: () => setStatusModal(null) });
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     const currentModules = activeTab !== 'evidence' ? (formData[`${activeTab}Modules`] as any[]) : [];
//     const currentSchema = formData.complianceSchema || defaultComplianceSchema;

//     return (
//         <>
//             <div className="pfm-overlay" onClick={onClose}>
//                 <div className="pfm-modal" onClick={e => e.stopPropagation()}>

//                     <div className="pfm-header">
//                         <h2 className="pfm-header__title"><BookOpen size={16} />{title}</h2>
//                         <button className="pfm-close-btn" onClick={onClose} type="button" disabled={isSaving}><X size={20} /></button>
//                     </div>

//                     <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
//                         <div className="pfm-body">

//                             {/* Metadata */}
//                             <div>
//                                 <div className="pfm-section-hdr"><BookOpen size={13} />Qualification Metadata</div>
//                                 <div className="pfm-details-grid">
//                                     <div className="pfm-fg pfm-fg--full">
//                                         <label>Programme Title *</label>
//                                         <input className="pfm-input" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Occupational Certificate: Software Developer" />
//                                     </div>

//                                     <div className="pfm-fg">
//                                         <label>Programme Type *</label>
//                                         <select className="pfm-input" name="programmeType" required value={(formData as any).programmeType || 'Occupational Certificate'} onChange={handleChange}>
//                                             <option value="" disabled>Select Type...</option>
//                                             <option value="Occupational Certificate">Occupational Certificate</option>
//                                             <option value="Skills Programme">Skills Programme</option>
//                                             <option value="Learnership">Learnership</option>
//                                             <option value="Short Course">Short Course</option>
//                                             <option value="Other">Other</option>
//                                         </select>
//                                     </div>
//                                     <div className="pfm-fg">
//                                         <label>Accrediting Body *</label>
//                                         <select className="pfm-input" name="accreditingBody" required value={(formData as any).accreditingBody || 'QCTO'} onChange={handleChange}>
//                                             <option value="" disabled>Select Body...</option>
//                                             <option value="QCTO">QCTO</option>
//                                             <option value="Umalusi">Umalusi</option>
//                                             <option value="CHE">Council on Higher Education (CHE)</option>
//                                             <option value="MICT SETA">MICT SETA</option>
//                                             <option value="IITPSA">IITPSA</option>
//                                             <option value="Services SETA">Services SETA</option>
//                                             <option value="MERSETA">MERSETA</option>
//                                             <option value="FASSET">FASSET</option>
//                                             <option value="HWSETA">HWSETA</option>
//                                             <option value="EWSETA">EWSETA</option>
//                                             <option value="PSETA">PSETA</option>
//                                             <option value="INSETA">INSETA</option>
//                                             <option value="CATHSSETA">CATHSSETA</option>
//                                             <option value="Other">Other</option>
//                                         </select>
//                                     </div>

//                                     <div className="pfm-fg">
//                                         <label>SAQA ID *</label>
//                                         <input className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} />
//                                     </div>
//                                     <div className="pfm-fg">
//                                         <label>Curriculum Code</label>
//                                         <input className="pfm-input" type="text" name="curriculumCode" value={(formData as any).curriculumCode || ''} onChange={handleChange} placeholder="e.g. 251201005" />
//                                     </div>

//                                     <div className="pfm-fg"><label>NQF Level *</label><input className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} /></div>
//                                     <div className="pfm-fg"><label>Total Credits *</label><input className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} /></div>

//                                     <div className="pfm-fg"><label>Total Notional Hours *</label><input className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} /></div>
//                                     {programme ? (
//                                         <div className="pfm-fg" style={{ justifyContent: 'flex-end' }}>
//                                             <label className="pfm-checkbox-row">
//                                                 <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange as any} />
//                                                 Archive this programme
//                                             </label>
//                                         </div>
//                                     ) : (
//                                         <div></div>
//                                     )}
//                                 </div>
//                             </div>

//                             {/* Main Interactive Header */}
//                             <div>
//                                 <div className="pfm-modules-hdr">
//                                     <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum & Compliance Matrices</div>

//                                     {/* Only show Curriculum tools if not on Evidence Tab */}
//                                     {activeTab !== 'evidence' && (
//                                         <div className="pfm-import-actions">
//                                             <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--mlab-border)', paddingRight: '8px', marginRight: '4px' }}>
//                                                 <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('xlsx')}><FileSpreadsheet size={12} color="#10b981" /> .XLSX Template</button>
//                                                 <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('csv')}><FileText size={12} color="#0ea5e9" /> .CSV</button>
//                                             </div>
//                                             <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
//                                             <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
//                                                 {isImporting ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import File</>}
//                                             </button>
//                                             <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
//                                                 <ClipboardPaste size={12} /> Paste QCTO Text
//                                             </button>
//                                         </div>
//                                     )}
//                                 </div>
//                                 <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

//                                 {/* Parser UI */}
//                                 {showTextParser && activeTab !== 'evidence' && (
//                                     <div className="pfm-parser-panel">
//                                         <p className="pfm-parser-panel__hint">Paste raw text directly from the QCTO Form 2 PDF here.</p>
//                                         <textarea className="pfm-parser-textarea" placeholder="Paste raw text here…" value={rawText} onChange={e => setRawText(e.target.value)} disabled={isProcessingText} />
//                                         <div className="pfm-parser-panel__actions">
//                                             <button type="button" className="pfm-btn pfm-btn--ghost" onClick={() => setShowTextParser(false)} disabled={isProcessingText}>Cancel</button>
//                                             <button type="button" className="pfm-btn pfm-btn--primary" onClick={handlePasteClick} disabled={!rawText.trim() || isProcessingText}>
//                                                 {isProcessingText ? <><Loader2 size={13} className="pfm-spin" /> Processing…</> : 'Process Text'}
//                                             </button>
//                                         </div>
//                                     </div>
//                                 )}

//                                 {/* Tabs */}
//                                 <div className="pfm-tabs">
//                                     {(Object.keys(TAB_META) as FormTabs[]).map(tab => (
//                                         <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
//                                             {TAB_META[tab].icon}{TAB_META[tab].label}
//                                             {tab !== 'evidence' && (
//                                                 <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
//                                             )}
//                                         </button>
//                                     ))}
//                                 </div>

//                                 {/* ─── THE NEW TRANCHE BUILDER TAB ─── */}
//                                 {activeTab === 'evidence' ? (
//                                     <div className="pfm-module-list" style={{ padding: '0 0.5rem' }}>
//                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem', padding: '1rem', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--mlab-midnight)', fontWeight: 800 }}>
//                                                 <ShieldCheck size={16} color="var(--mlab-blue)" /> Funding & Disbursement Schema Configuration
//                                             </div>
//                                             <p style={{ fontSize: '0.75rem', color: '#64748b', margin: 0, lineHeight: 1.4 }}>
//                                                 Define the tranches, milestones, and required evidence needed to unlock disbursements for learners placed on this programme. Placements will inherit this blueprint to power their visual timeline and ZIP exports.
//                                             </p>
//                                         </div>

//                                         <div className="wm-form-group wm-form-group--full" style={{ marginBottom: '1.5rem' }}>
//                                             <label className="wm-form-label">Schema Label (Identifier)</label>
//                                             <input
//                                                 className="pfm-input"
//                                                 style={{ width: '100%' }}
//                                                 placeholder="e.g. MICT SETA 6-Tranche Standard"
//                                                 value={currentSchema.schemaName}
//                                                 onChange={e => setFormData(p => ({ ...p, complianceSchema: { ...p.complianceSchema!, schemaName: e.target.value } }))}
//                                             />
//                                         </div>

//                                         {currentSchema.tranches.map((tranche, tIdx) => (
//                                             <div key={tranche.trancheId} className="pfm-module-card" style={{ borderLeft: '3px solid var(--mlab-blue)' }}>
//                                                 <div className="pfm-module-card__hdr expanded" style={{ background: '#f8fafc', padding: '10px 12px' }}>
//                                                     <input className="pfm-module-input pfm-module-input--name" style={{ fontWeight: 800, color: 'var(--mlab-midnight)' }} placeholder="Tranche Title" value={tranche.title} onChange={e => updateTranche(tIdx, 'title', e.target.value)} />

//                                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                         <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', paddingLeft: '8px' }}>
//                                                             <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Yield:</span>
//                                                             <input className="pfm-module-input" style={{
//                                                                 width: '50px', border: 'none', color: 'black', textAlign: 'right',
//                                                                 padding: '4px'
//                                                             }} type="number" value={tranche.percentage || ''}
//                                                                 onChange={e => updateTranche(tIdx, 'percentage', parseInt(e.target.value) || 0)} />
//                                                             <span style={{ fontSize: '0.7rem', color: '#64748b', paddingRight: '8px' }}>%</span>
//                                                         </div>

//                                                         <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #cbd5e1', borderRadius: '4px', paddingLeft: '8px' }}>
//                                                             <Calendar size={12} color="#64748b" />
//                                                             <span style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, marginLeft: '4px' }}>Due at Month:</span>
//                                                             <input className="pfm-module-input" style={{ width: '40px', color: 'black', border: 'none', textAlign: 'center', padding: '4px' }} type="number" value={tranche.dueAtMonth} onChange={e => updateTranche(tIdx, 'dueAtMonth', parseInt(e.target.value) || 0)} />
//                                                         </div>

//                                                         <button type="button" className="pfm-remove-btn" onClick={() => removeTranche(tIdx)}><Trash2 size={15} /></button>
//                                                     </div>
//                                                 </div>

//                                                 <div className="pfm-module-card__body" style={{ background: 'white', padding: '12px' }}>
//                                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', borderBottom: '1px solid #f1f5f9', paddingBottom: '8px' }}>
//                                                         <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Required Evidence Log</span>
//                                                         <button type="button" onClick={() => addRequirement(tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#eff6ff', color: 'var(--mlab-blue)', border: '1px solid #bfdbfe', padding: '4px 8px', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 700 }}>
//                                                             <Plus size={12} /> Add Requirement
//                                                         </button>
//                                                     </div>

//                                                     {tranche.requirements.length > 0 ? tranche.requirements.map((req, rIdx) => (
//                                                         <div key={req.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', padding: '6px', background: '#f8fafc', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
//                                                                 <input type="checkbox" checked={req.required} onChange={e => updateRequirement(tIdx, rIdx, 'required', e.target.checked)} title="Is this strictly required?" style={{ cursor: 'pointer' }} />
//                                                                 <input className="pfm-input" style={{ flex: 1, padding: '4px 8px', fontSize: '0.8rem' }} placeholder="Document or Task Name" value={req.label} onChange={e => updateRequirement(tIdx, rIdx, 'label', e.target.value)} />
//                                                             </div>

//                                                             <select className="pfm-input" style={{ width: '130px', padding: '4px 8px', fontSize: '0.75rem', color: '#475569' }} value={req.type} onChange={e => updateRequirement(tIdx, rIdx, 'type', e.target.value)}>
//                                                                 <option value="document">PDF Upload</option>
//                                                                 <option value="site_visit">Site Visit Module</option>
//                                                                 <option value="report">Report Writer</option>
//                                                                 <option value="pop">Proof of Payment</option>
//                                                             </select>

//                                                             <div style={{ position: 'relative' }}>
//                                                                 <select className="pfm-input" style={{ width: '150px', padding: '4px 8px 4px 24px', fontSize: '0.75rem', color: req.systemTag ? 'var(--mlab-blue)' : '#94a3b8' }} value={req.systemTag || ''} onChange={e => updateRequirement(tIdx, rIdx, 'systemTag', e.target.value || undefined)}>
//                                                                     <option value="">No System Tag</option>
//                                                                     <option value="wblpaAgreementUrl">WBLPA Agreement</option>
//                                                                     <option value="employmentContractUrl">Employment Contract</option>
//                                                                     <option value="idDocumentUrl">Certified ID</option>
//                                                                     <option value="qualificationUrl">Highest Qual.</option>
//                                                                 </select>
//                                                                 <Tag size={10} color={req.systemTag ? 'var(--mlab-blue)' : '#94a3b8'} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
//                                                             </div>

//                                                             <button type="button" className="pfm-remove-btn" onClick={() => removeRequirement(tIdx, rIdx)}><X size={14} /></button>
//                                                         </div>
//                                                     )) : (
//                                                         <div style={{ padding: '12px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '4px' }}>
//                                                             No evidence required for this tranche. Click 'Add Requirement' above.
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             </div>
//                                         ))}

//                                         <button type="button" onClick={addTranche} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%', padding: '12px', background: 'white', border: '1px dashed var(--mlab-blue)', color: 'var(--mlab-blue)', fontSize: '0.8rem', fontWeight: 700, borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }} onMouseOver={e => e.currentTarget.style.background = '#eff6ff'} onMouseOut={e => e.currentTarget.style.background = 'white'}>
//                                             <Plus size={14} /> Append New Tranche Milestone
//                                         </button>
//                                     </div>
//                                 ) : (
//                                     /* ─── STANDARD CURRICULUM MODULES LIST ─── */
//                                     <div className="pfm-module-list">
//                                         {currentModules.length === 0 ? (
//                                             <div className="pfm-empty-state"><Layers size={32} style={{ opacity: 0.3, marginBottom: '0.6rem' }} /><div>No modules yet.</div></div>
//                                         ) : currentModules.map((module, mIdx) => {
//                                             const isExpanded = !!expandedModules[`${activeTab}-${mIdx}`];
//                                             return (
//                                                 <div key={mIdx} className="pfm-module-card">
//                                                     <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
//                                                         <button type="button" className="pfm-expand-btn" onClick={() => toggleExpandModule(mIdx)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
//                                                         <input className="pfm-module-input pfm-module-input--code" placeholder="Module Code" value={module.code || ''} onChange={e => updateModule(mIdx, 'code', e.target.value)} />
//                                                         <input className="pfm-module-input pfm-module-input--name" placeholder="Module Name" value={module.name} onChange={e => updateModule(mIdx, 'name', e.target.value)} />
//                                                         <input className="pfm-module-input pfm-module-input--credits" type="number" placeholder="Cr" value={module.credits || ''} onChange={e => updateModule(mIdx, 'credits', parseInt(e.target.value) || 0)} />
//                                                         <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}><Trash2 size={15} /></button>
//                                                     </div>

//                                                     {isExpanded && (
//                                                         <div className="pfm-module-card__body">
//                                                             <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
//                                                                 <span className="pfm-topics-label">
//                                                                     {activeTab === 'workExperience' ? 'Logbook Entries / Tasks' : 'Assessed Topics'}
//                                                                 </span>
//                                                                 <button type="button" onClick={() => addTopic(mIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
//                                                                     <Plus size={12} /> {activeTab === 'workExperience' ? 'Add Task' : 'Add Topic'}
//                                                                 </button>
//                                                             </div>

//                                                             {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
//                                                                 <div key={tIdx} className="pfm-topic" style={{ borderLeft: `3px solid ${activeTab === 'practical' ? '#f59e0b' : activeTab === 'workExperience' ? 'var(--mlab-green)' : '#0ea5e9'}` }}>
//                                                                     <div className="pfm-topic__header" style={{ display: 'flex', gap: '6px' }}>
//                                                                         <input className="pfm-input" style={{ width: '120px', padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Code" value={topic.code} onChange={e => updateTopic(mIdx, tIdx, 'code', e.target.value)} />
//                                                                         <input className="pfm-input" style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Topic Title" value={topic.title} onChange={e => updateTopic(mIdx, tIdx, 'title', e.target.value)} />
//                                                                         {activeTab !== 'workExperience' && (
//                                                                             <input className="pfm-input" style={{ width: '60px', padding: '4px 6px', fontSize: '0.8rem' }} type="number" placeholder="%" value={topic.weight || ''} onChange={e => updateTopic(mIdx, tIdx, 'weight', parseInt(e.target.value) || 0)} />
//                                                                         )}
//                                                                         <button type="button" className="pfm-remove-btn" onClick={() => removeTopic(mIdx, tIdx)}><Trash2 size={14} /></button>
//                                                                     </div>

//                                                                     <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--mlab-border)', marginTop: '0.5rem' }}>
//                                                                         {topic.criteria?.map((crit: any, cIdx: number) => (
//                                                                             <div key={cIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
//                                                                                 <input className="pfm-input" style={{ width: '90px', fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Code" value={crit.code} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'code', e.target.value)} />
//                                                                                 <input className="pfm-input" style={{ flex: 1, fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Criteria Description" value={crit.description} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'description', e.target.value)} />
//                                                                                 <button type="button" className="pfm-remove-btn" style={{ padding: '2px' }} onClick={() => removeCriteria(mIdx, tIdx, cIdx)}><X size={12} /></button>
//                                                                             </div>
//                                                                         ))}
//                                                                         <button type="button" onClick={() => addCriteria(mIdx, tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#0ea5e9', padding: '4px 0', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' }}>
//                                                                             <Plus size={10} /> Add Criteria
//                                                                         </button>
//                                                                     </div>
//                                                                 </div>
//                                                             )) : <p className="pfm-no-topics">No {activeTab === 'workExperience' ? 'tasks' : 'topics'} defined.</p>}
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             );
//                                         })}

//                                         <button type="button" className="pfm-add-module-btn" onClick={addModule}>
//                                             <Plus size={14} /> Add Module Manually
//                                         </button>
//                                     </div>
//                                 )}
//                             </div>
//                         </div>

//                         <div className="pfm-footer">
//                             <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
//                             <button type="button" className="pfm-btn pfm-btn--primary" onClick={executeSave} disabled={isSaving}>
//                                 {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum Blueprint</>}
//                             </button>
//                         </div>
//                     </form>
//                 </div>
//             </div>

//             {/* StatusModal rendered OUTSIDE of the pfm-overlay */}
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
//         </>
//     );
// };



// // // src/components/admin/ProgrammeFormModal.tsx

// // // src/components/admin/ProgrammeFormModal.tsx

// // import React, { useState, useRef } from 'react';
// // import {
// //     X, Save, Upload, Download, Plus, Trash2, ChevronDown, ChevronRight,
// //     Layers, FileText, Briefcase, BookOpen, ClipboardPaste, Loader2, AlertCircle, FileSpreadsheet
// // } from 'lucide-react';
// // import * as XLSX from 'xlsx';
// // import './ProgrammeFormModal.css';
// // import type { ModuleCategory, ProgrammeTemplate } from '../../../types';
// // import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';

// // interface ProgrammeFormModalProps {
// //     programme?: ProgrammeTemplate | null;
// //     existingProgrammes: ProgrammeTemplate[];
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
// //     programme, existingProgrammes, onClose, onSave, title,
// // }) => {
// //     const [formData, setFormData] = useState<ProgrammeTemplate>(
// //         programme ? { ...programme } : {
// //             ...emptyProgramme,
// //             curriculumCode: '',
// //             programmeType: 'Occupational Certificate',
// //             accreditingBody: 'QCTO',
// //             id: ''
// //         } as any
// //     );
// //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
// //     const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({});
// //     const [showTextParser, setShowTextParser] = useState(false);
// //     const [rawText, setRawText] = useState('');

// //     // ─── STATUS MODAL STATE ───
// //     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

// //     // Loading states
// //     const [isImporting, setIsImporting] = useState(false);
// //     const [isProcessingText, setIsProcessingText] = useState(false);
// //     const [isSaving, setIsSaving] = useState(false);

// //     const fileInputRef = useRef<HTMLInputElement>(null);

// //     const toggleExpandModule = (index: number) => {
// //         const key = `${activeTab}-${index}`;
// //         setExpandedModules(prev => ({ ...prev, [key]: !prev[key] }));
// //     };

// //     const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
// //         const { name, value, type } = e.target;

// //         let finalValue: any = value;
// //         if (type === 'number') {
// //             finalValue = parseInt(value) || 0;
// //         } else if (type === 'checkbox') {
// //             finalValue = (e.target as HTMLInputElement).checked;
// //         }

// //         setFormData({
// //             ...formData,
// //             [name]: finalValue,
// //         });
// //     };

// //     // ── TRIGGER LOCAL FILE DOWNLOADS ──
// //     const handleDownloadTemplate = (format: 'csv' | 'xlsx') => {
// //         // Ensure files are placed in the public/templates/ directory
// //         const fileUrl = format === 'csv'
// //             ? '/templates/programme/Learning_Matrix_Form2_Template.csv'
// //             : '/templates/programme/Learning_Matrix_Form2_Template.xlsx';

// //         const link = document.createElement("a");
// //         link.href = fileUrl;
// //         link.download = `Learning_Matrix_Form2_Template.${format}`;
// //         document.body.appendChild(link);
// //         link.click();
// //         document.body.removeChild(link);
// //     };

// //     // ── CORE PARSER TOPIC TITLE EXTRACTION ──
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

// //                 const firstCriteriaIndex = tText.search(/•|(KT\s*\d{4}|PS\s*\d{2}|WE\s*\d{2})/i);
// //                 let headerPart = firstCriteriaIndex !== -1 ? tText.substring(0, firstCriteriaIndex) : tText;
// //                 const criteriaPart = firstCriteriaIndex !== -1 ? tText.substring(firstCriteriaIndex) : '';

// //                 headerPart = headerPart.replace(/^[\s:]+/, '').trim();

// //                 let tWeight = 0;
// //                 const weightMatch = headerPart.match(/(\d+)\s*%$/);
// //                 if (weightMatch) {
// //                     tWeight = parseInt(weightMatch[1], 10);
// //                     headerPart = headerPart.replace(/(\d+)\s*%$/, '').trim();
// //                 }

// //                 let tTitle = headerPart || 'Topic';
// //                 if (tTitle.length > 150) tTitle = tTitle.substring(0, 150) + '...';

// //                 const newTopic: any = { code: tCode, title: tTitle, weight: tWeight, criteria: [] };

// //                 const lines = criteriaPart.split(/•/).map(l => l.trim()).filter(Boolean);
// //                 lines.forEach(line => {
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

// //         setStatusModal({
// //             type: 'success',
// //             title: 'Parsing Complete',
// //             message: 'QCTO Curriculum text parsed successfully!',
// //             onClose: () => setStatusModal(null)
// //         });
// //     };

// //     // ── HYBRID EXCEL / CSV UPLOAD ──
// //     const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = event.target.files?.[0];
// //         if (!file) return;
// //         setIsImporting(true);

// //         const reader = new FileReader();

// //         reader.onload = async (e) => {
// //             try {
// //                 // Read file as ArrayBuffer for Excel processing
// //                 const data = new Uint8Array(e.target?.result as ArrayBuffer);
// //                 const workbook = XLSX.read(data, { type: 'array' });

// //                 // Get the first worksheet
// //                 const firstSheetName = workbook.SheetNames[0];
// //                 const worksheet = workbook.Sheets[firstSheetName];

// //                 // Get raw array format first to check headers
// //                 const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

// //                 if (!rawRows.length) {
// //                     setIsImporting(false);
// //                     return;
// //                 }

// //                 // Check if it matches our structured template
// //                 const headerRow = (rawRows[0] || []).map(h => String(h).replace(/\s/g, '').toLowerCase());
// //                 const isStructured = headerRow.includes('modulecode') && headerRow.includes('type');

// //                 if (isStructured) {
// //                     // It is structured, convert to Object array
// //                     const sRows = XLSX.utils.sheet_to_json(worksheet, { defval: "", raw: false }) as any[];
// //                     const parsed = { knowledgeModules: [] as any[], practicalModules: [] as any[], workExperienceModules: [] as any[] };
// //                     const moduleMap = new Map<string, any>();
// //                     const topicMap = new Map<string, any>();

// //                     const getVal = (row: any, key: string) => {
// //                         const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/\s/g, '') === key.toLowerCase());
// //                         return exactKey ? String(row[exactKey] || "").trim() : "";
// //                     };

// //                     sRows.forEach(row => {
// //                         const type = getVal(row, 'type');
// //                         const cat = getVal(row, 'category').toLowerCase();
// //                         const mCode = getVal(row, 'modulecode');
// //                         const tCode = getVal(row, 'topiccode');

// //                         if (!mCode) return;

// //                         if (type.toLowerCase() === 'module') {
// //                             const credits = parseInt(getVal(row, 'credits')) || 0;
// //                             const m = {
// //                                 code: mCode,
// //                                 name: getVal(row, 'modulename') || '',
// //                                 nqfLevel: parseInt(getVal(row, 'nqflevel')) || formData.nqfLevel || 4,
// //                                 credits: credits,
// //                                 notionalHours: credits * 10,
// //                                 topics: []
// //                             };
// //                             moduleMap.set(mCode, m);
// //                             if (cat.includes('knowledge')) parsed.knowledgeModules.push(m);
// //                             else if (cat.includes('practical')) parsed.practicalModules.push(m);
// //                             else if (cat.includes('work')) parsed.workExperienceModules.push(m);
// //                         } else if (type.toLowerCase() === 'topic' && tCode) {
// //                             const parent = moduleMap.get(mCode);
// //                             if (parent) {
// //                                 const t = {
// //                                     code: tCode,
// //                                     title: getVal(row, 'topicname') || '',
// //                                     weight: parseInt(getVal(row, 'weight')) || 0,
// //                                     criteria: []
// //                                 };
// //                                 parent.topics.push(t);
// //                                 topicMap.set(tCode, t);
// //                             }
// //                         } else if (type.toLowerCase() === 'criteria') {
// //                             const pt = topicMap.get(tCode);
// //                             if (pt) {
// //                                 pt.criteria.push({
// //                                     code: getVal(row, 'criteriacode') || '',
// //                                     description: getVal(row, 'criteriadescription') || ''
// //                                 });
// //                             }
// //                         }
// //                     });

// //                     setFormData(prev => ({
// //                         ...prev,
// //                         knowledgeModules: [...(prev.knowledgeModules || []), ...parsed.knowledgeModules],
// //                         practicalModules: [...(prev.practicalModules || []), ...parsed.practicalModules],
// //                         workExperienceModules: [...(prev.workExperienceModules || []), ...parsed.workExperienceModules],
// //                     }));

// //                     setIsImporting(false);
// //                     if (fileInputRef.current) fileInputRef.current.value = '';

// //                     setStatusModal({
// //                         type: 'success',
// //                         title: 'Import Successful',
// //                         message: 'Structured Curriculum spreadsheet imported successfully!',
// //                         onClose: () => setStatusModal(null)
// //                     });

// //                 } else {
// //                     // Not structured, treat as raw text dump
// //                     const combinedText = rawRows.map(r => r.filter(c => String(c).trim()).join(' ')).join('\n');
// //                     processRawTextData(combinedText);

// //                     setIsImporting(false);
// //                     if (fileInputRef.current) fileInputRef.current.value = '';
// //                 }

// //             } catch (err) {
// //                 console.error(err);
// //                 setIsImporting(false);
// //                 setStatusModal({
// //                     type: 'error',
// //                     title: 'Import Failed',
// //                     message: 'Failed to read the file. Please check the format.',
// //                     onClose: () => setStatusModal(null)
// //                 });
// //             }
// //         };

// //         reader.onerror = () => {
// //             setIsImporting(false);
// //             setStatusModal({
// //                 type: 'error',
// //                 title: 'Import Failed',
// //                 message: 'Failed to read the file.',
// //                 onClose: () => setStatusModal(null)
// //             });
// //         };

// //         reader.readAsArrayBuffer(file);
// //     };

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

// //     // ── Deep-Cloning Topic Management ──
// //     const addTopic = (moduleIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };

// //         updatedModule.topics = [...(updatedModule.topics || []), { code: '', title: '', weight: 0, criteria: [] }];
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const updateTopic = (moduleIndex: number, topicIndex: number, field: string, value: string | number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };
// //         const updatedTopics = [...(updatedModule.topics || [])];

// //         updatedTopics[topicIndex] = { ...updatedTopics[topicIndex], [field]: value };
// //         updatedModule.topics = updatedTopics;
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const removeTopic = (moduleIndex: number, topicIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };

// //         updatedModule.topics = (updatedModule.topics || []).filter((_: any, i: number) => i !== topicIndex);
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     // ── Deep-Cloning Criteria Management ──
// //     const addCriteria = (moduleIndex: number, topicIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };
// //         const updatedTopics = [...(updatedModule.topics || [])];
// //         const updatedTopic = { ...updatedTopics[topicIndex] };

// //         updatedTopic.criteria = [...(updatedTopic.criteria || []), { code: '', description: '' }];
// //         updatedTopics[topicIndex] = updatedTopic;
// //         updatedModule.topics = updatedTopics;
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const updateCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number, field: string, value: string) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };
// //         const updatedTopics = [...(updatedModule.topics || [])];
// //         const updatedTopic = { ...updatedTopics[topicIndex] };
// //         const updatedCriteria = [...(updatedTopic.criteria || [])];

// //         updatedCriteria[criteriaIndex] = { ...updatedCriteria[criteriaIndex], [field]: value };
// //         updatedTopic.criteria = updatedCriteria;
// //         updatedTopics[topicIndex] = updatedTopic;
// //         updatedModule.topics = updatedTopics;
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     const removeCriteria = (moduleIndex: number, topicIndex: number, criteriaIndex: number) => {
// //         const key = `${activeTab}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
// //         const updated = [...(formData[key] as any[])];
// //         const updatedModule = { ...updated[moduleIndex] };
// //         const updatedTopics = [...(updatedModule.topics || [])];
// //         const updatedTopic = { ...updatedTopics[topicIndex] };

// //         updatedTopic.criteria = (updatedTopic.criteria || []).filter((_: any, i: number) => i !== criteriaIndex);
// //         updatedTopics[topicIndex] = updatedTopic;
// //         updatedModule.topics = updatedTopics;
// //         updated[moduleIndex] = updatedModule;

// //         setFormData({ ...formData, [key]: updated });
// //     };

// //     // ── MANUAL SAVE FUNCTION ──
// //     const executeSave = async () => {
// //         try {
// //             const nameStr = formData.name?.toString() || '';
// //             const saqaStr = formData.saqaId?.toString() || '';
// //             const codeStr = (formData as any).curriculumCode?.toString() || '';

// //             if (!nameStr.trim() || !saqaStr.trim()) {
// //                 setStatusModal({
// //                     type: 'warning',
// //                     title: 'Missing Details',
// //                     message: 'Please provide both a Programme Title and a SAQA ID before saving.',
// //                     onClose: () => setStatusModal(null)
// //                 });
// //                 return;
// //             }

// //             const formSaqa = saqaStr.trim();
// //             const formCode = codeStr.trim();

// //             const isDuplicate = (existingProgrammes || []).some(p => {
// //                 if (programme && p.id === programme.id) return false;

// //                 const existingSaqa = p.saqaId?.toString().trim();
// //                 const existingCode = (p as any).curriculumCode?.toString().trim();

// //                 const isSaqaMatch = formSaqa && existingSaqa && formSaqa === existingSaqa;
// //                 const isCodeMatch = formCode && existingCode && formCode === existingCode;

// //                 return isSaqaMatch || isCodeMatch;
// //             });

// //             if (isDuplicate) {
// //                 setStatusModal({
// //                     type: 'error',
// //                     title: 'Duplicate Detected',
// //                     message: 'A qualification with this SAQA ID or Curriculum Code already exists in the system.',
// //                     onClose: () => setStatusModal(null)
// //                 });
// //                 return;
// //             }

// //             const rawId = formCode || formSaqa;
// //             const safeDocumentId = rawId.replace(/[\s/]+/g, '-');

// //             const dataToSave = {
// //                 ...formData,
// //                 id: formData.id || safeDocumentId
// //             };

// //             setIsSaving(true);
// //             await Promise.resolve(onSave(dataToSave));
// //             onClose();

// //         } catch (err: any) {
// //             console.error("Save failed:", err);
// //             setStatusModal({
// //                 type: 'error',
// //                 title: 'Save Failed',
// //                 message: err.message || 'An unexpected error occurred while communicating with the database. Please try again.',
// //                 onClose: () => setStatusModal(null)
// //             });
// //         } finally {
// //             setIsSaving(false);
// //         }
// //     };

// //     const currentModules = formData[`${activeTab}Modules`] as any[];

// //     return (
// //         <>
// //             <div className="pfm-overlay" onClick={onClose}>
// //                 <div className="pfm-modal" onClick={e => e.stopPropagation()}>

// //                     <div className="pfm-header">
// //                         <h2 className="pfm-header__title"><BookOpen size={16} />{title}</h2>
// //                         <button className="pfm-close-btn" onClick={onClose} type="button" disabled={isSaving}><X size={20} /></button>
// //                     </div>

// //                     <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
// //                         <div className="pfm-body">

// //                             {/* Metadata */}
// //                             <div>
// //                                 <div className="pfm-section-hdr"><BookOpen size={13} />Qualification Metadata</div>
// //                                 <div className="pfm-details-grid">
// //                                     <div className="pfm-fg pfm-fg--full">
// //                                         <label>Programme Title *</label>
// //                                         <input className="pfm-input" type="text" name="name" required value={formData.name} onChange={handleChange} placeholder="e.g. Occupational Certificate: Software Developer" />
// //                                     </div>

// //                                     <div className="pfm-fg">
// //                                         <label>Programme Type *</label>
// //                                         <select className="pfm-input" name="programmeType" required value={(formData as any).programmeType || 'Occupational Certificate'} onChange={handleChange}>
// //                                             <option value="" disabled>Select Type...</option>
// //                                             <option value="Occupational Certificate">Occupational Certificate</option>
// //                                             <option value="Skills Programme">Skills Programme</option>
// //                                             <option value="Learnership">Learnership</option>
// //                                             <option value="Short Course">Short Course</option>
// //                                             <option value="Other">Other</option>
// //                                         </select>
// //                                     </div>
// //                                     <div className="pfm-fg">
// //                                         <label>Accrediting Body *</label>
// //                                         <select className="pfm-input" name="accreditingBody" required value={(formData as any).accreditingBody || 'QCTO'} onChange={handleChange}>
// //                                             <option value="" disabled>Select Body...</option>
// //                                             <option value="QCTO">QCTO</option>
// //                                             <option value="Umalusi">Umalusi</option>
// //                                             <option value="CHE">Council on Higher Education (CHE)</option>
// //                                             <option value="MICT SETA">MICT SETA</option>
// //                                             <option value="IITPSA">IITPSA</option>
// //                                             <option value="Services SETA">Services SETA</option>
// //                                             <option value="MERSETA">MERSETA</option>
// //                                             <option value="FASSET">FASSET</option>
// //                                             <option value="HWSETA">HWSETA</option>
// //                                             <option value="EWSETA">EWSETA</option>
// //                                             <option value="PSETA">PSETA</option>
// //                                             <option value="INSETA">INSETA</option>
// //                                             <option value="CATHSSETA">CATHSSETA</option>
// //                                             <option value="Other">Other</option>
// //                                         </select>
// //                                     </div>

// //                                     <div className="pfm-fg">
// //                                         <label>SAQA ID *</label>
// //                                         <input className="pfm-input" type="text" name="saqaId" required value={formData.saqaId} onChange={handleChange} />
// //                                     </div>
// //                                     <div className="pfm-fg">
// //                                         <label>Curriculum Code</label>
// //                                         <input className="pfm-input" type="text" name="curriculumCode" value={(formData as any).curriculumCode || ''} onChange={handleChange} placeholder="e.g. 251201005" />
// //                                     </div>

// //                                     <div className="pfm-fg"><label>NQF Level *</label><input className="pfm-input" type="number" name="nqfLevel" required min="1" max="10" value={formData.nqfLevel} onChange={handleChange} /></div>
// //                                     <div className="pfm-fg"><label>Total Credits *</label><input className="pfm-input" type="number" name="credits" required min="0" value={formData.credits} onChange={handleChange} /></div>

// //                                     <div className="pfm-fg"><label>Total Notional Hours *</label><input className="pfm-input" type="number" name="totalNotionalHours" required min="0" value={formData.totalNotionalHours} onChange={handleChange} /></div>
// //                                     {programme ? (
// //                                         <div className="pfm-fg" style={{ justifyContent: 'flex-end' }}>
// //                                             <label className="pfm-checkbox-row">
// //                                                 <input type="checkbox" name="isArchived" checked={formData.isArchived || false} onChange={handleChange as any} />
// //                                                 Archive this programme
// //                                             </label>
// //                                         </div>
// //                                     ) : (
// //                                         <div></div>
// //                                     )}
// //                                 </div>
// //                             </div>

// //                             {/* Curriculum Matrix Header */}
// //                             <div>
// //                                 <div className="pfm-modules-hdr">
// //                                     <div className="pfm-section-hdr" style={{ margin: 0, border: 'none', paddingBottom: 0 }}><Layers size={13} />Curriculum Matrix</div>
// //                                     <div className="pfm-import-actions">

// //                                         {/* TWO TEMPLATE DOWNLOAD OPTIONS (Static Files) */}
// //                                         <div style={{ display: 'flex', gap: '4px', borderRight: '1px solid var(--mlab-border)', paddingRight: '8px', marginRight: '4px' }}>
// //                                             <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('xlsx')}>
// //                                                 <FileSpreadsheet size={12} color="#10b981" /> .XLSX Template
// //                                             </button>
// //                                             <button type="button" className="pfm-import-btn" onClick={() => handleDownloadTemplate('csv')}>
// //                                                 <FileText size={12} color="#0ea5e9" /> .CSV
// //                                             </button>
// //                                         </div>

// //                                         <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
// //                                         <button type="button" className="pfm-import-btn" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
// //                                             {isImporting ? <><Loader2 size={12} className="pfm-spin" /> Importing…</> : <><Upload size={12} /> Import File</>}
// //                                         </button>
// //                                         <button type="button" className={`pfm-import-btn pfm-import-btn--primary ${showTextParser ? 'active' : ''}`} onClick={() => setShowTextParser(v => !v)} disabled={isProcessingText}>
// //                                             <ClipboardPaste size={12} /> Paste QCTO Text
// //                                         </button>
// //                                     </div>
// //                                 </div>
// //                                 <div style={{ borderBottom: '2px solid var(--mlab-blue)', marginBottom: '1rem', marginTop: '0.5rem' }} />

// //                                 {/* Parser UI */}
// //                                 {showTextParser && (
// //                                     <div className="pfm-parser-panel">
// //                                         <p className="pfm-parser-panel__hint">Paste raw text directly from the QCTO Form 2 PDF here.</p>
// //                                         <textarea className="pfm-parser-textarea" placeholder="Paste raw text here…" value={rawText} onChange={e => setRawText(e.target.value)} disabled={isProcessingText} />
// //                                         <div className="pfm-parser-panel__actions">
// //                                             <button type="button" className="pfm-btn pfm-btn--ghost" onClick={() => setShowTextParser(false)} disabled={isProcessingText}>Cancel</button>
// //                                             <button type="button" className="pfm-btn pfm-btn--primary" onClick={handlePasteClick} disabled={!rawText.trim() || isProcessingText}>
// //                                                 {isProcessingText ? <><Loader2 size={13} className="pfm-spin" /> Processing…</> : 'Process Text'}
// //                                             </button>
// //                                         </div>
// //                                     </div>
// //                                 )}

// //                                 {/* Tabs */}
// //                                 <div className="pfm-tabs">
// //                                     {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
// //                                         <button key={tab} type="button" className={`pfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
// //                                             {TAB_META[tab].icon}{TAB_META[tab].label}
// //                                             <span className={`pfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{(formData[`${tab}Modules`] as any[])?.length || 0}</span>
// //                                         </button>
// //                                     ))}
// //                                 </div>

// //                                 {/* Module List */}
// //                                 <div className="pfm-module-list">
// //                                     {currentModules.length === 0 ? (
// //                                         <div className="pfm-empty-state"><Layers size={32} style={{ opacity: 0.3, marginBottom: '0.6rem' }} /><div>No modules yet.</div></div>
// //                                     ) : currentModules.map((module, mIdx) => {
// //                                         const isExpanded = !!expandedModules[`${activeTab}-${mIdx}`];
// //                                         return (
// //                                             <div key={mIdx} className="pfm-module-card">
// //                                                 <div className={`pfm-module-card__hdr ${isExpanded ? 'expanded' : ''}`}>
// //                                                     <button type="button" className="pfm-expand-btn" onClick={() => toggleExpandModule(mIdx)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
// //                                                     <input className="pfm-module-input pfm-module-input--code" placeholder="Module Code" value={module.code || ''} onChange={e => updateModule(mIdx, 'code', e.target.value)} />
// //                                                     <input className="pfm-module-input pfm-module-input--name" placeholder="Module Name" value={module.name} onChange={e => updateModule(mIdx, 'name', e.target.value)} />
// //                                                     <input className="pfm-module-input pfm-module-input--credits" type="number" placeholder="Cr" value={module.credits || ''} onChange={e => updateModule(mIdx, 'credits', parseInt(e.target.value) || 0)} />
// //                                                     <button type="button" className="pfm-remove-btn" onClick={() => removeModule(mIdx)}><Trash2 size={15} /></button>
// //                                                 </div>

// //                                                 {isExpanded && (
// //                                                     <div className="pfm-module-card__body">
// //                                                         <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
// //                                                             <span className="pfm-topics-label">
// //                                                                 {activeTab === 'workExperience' ? 'Logbook Entries / Tasks' : 'Assessed Topics'}
// //                                                             </span>
// //                                                             <button type="button" onClick={() => addTopic(mIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: '1px solid #cbd5e1', color: '#475569', padding: '0.3rem 0.6rem', fontSize: '0.7rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
// //                                                                 <Plus size={12} /> {activeTab === 'workExperience' ? 'Add Task' : 'Add Topic'}
// //                                                             </button>
// //                                                         </div>

// //                                                         {module.topics?.length > 0 ? module.topics.map((topic: any, tIdx: number) => (
// //                                                             <div key={tIdx} className="pfm-topic" style={{ borderLeft: `3px solid ${activeTab === 'practical' ? '#f59e0b' : activeTab === 'workExperience' ? 'var(--mlab-green)' : '#0ea5e9'}` }}>
// //                                                                 <div className="pfm-topic__header" style={{ display: 'flex', gap: '6px' }}>
// //                                                                     <input className="pfm-input" style={{ width: '120px', padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Code" value={topic.code} onChange={e => updateTopic(mIdx, tIdx, 'code', e.target.value)} />
// //                                                                     <input className="pfm-input" style={{ flex: 1, padding: '4px 6px', fontSize: '0.8rem' }} placeholder="Topic Title" value={topic.title} onChange={e => updateTopic(mIdx, tIdx, 'title', e.target.value)} />
// //                                                                     {activeTab !== 'workExperience' && (
// //                                                                         <input className="pfm-input" style={{ width: '60px', padding: '4px 6px', fontSize: '0.8rem' }} type="number" placeholder="%" value={topic.weight || ''} onChange={e => updateTopic(mIdx, tIdx, 'weight', parseInt(e.target.value) || 0)} />
// //                                                                     )}
// //                                                                     <button type="button" className="pfm-remove-btn" onClick={() => removeTopic(mIdx, tIdx)}><Trash2 size={14} /></button>
// //                                                                 </div>

// //                                                                 <div style={{ paddingLeft: '1rem', borderLeft: '2px solid var(--mlab-border)', marginTop: '0.5rem' }}>
// //                                                                     {topic.criteria?.map((crit: any, cIdx: number) => (
// //                                                                         <div key={cIdx} style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
// //                                                                             <input className="pfm-input" style={{ width: '90px', fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Code" value={crit.code} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'code', e.target.value)} />
// //                                                                             <input className="pfm-input" style={{ flex: 1, fontSize: '0.75rem', padding: '4px', background: '#f8fafc' }} placeholder="Criteria Description" value={crit.description} onChange={e => updateCriteria(mIdx, tIdx, cIdx, 'description', e.target.value)} />
// //                                                                             <button type="button" className="pfm-remove-btn" style={{ padding: '2px' }} onClick={() => removeCriteria(mIdx, tIdx, cIdx)}><X size={12} /></button>
// //                                                                         </div>
// //                                                                     ))}
// //                                                                     <button type="button" onClick={() => addCriteria(mIdx, tIdx)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'transparent', border: 'none', color: '#0ea5e9', padding: '4px 0', fontSize: '0.7rem', cursor: 'pointer', fontWeight: 'bold', marginTop: '4px' }}>
// //                                                                         <Plus size={10} /> Add Criteria
// //                                                                     </button>
// //                                                                 </div>
// //                                                             </div>
// //                                                         )) : <p className="pfm-no-topics">No {activeTab === 'workExperience' ? 'tasks' : 'topics'} defined.</p>}
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         );
// //                                     })}

// //                                     <button type="button" className="pfm-add-module-btn" onClick={addModule}>
// //                                         <Plus size={14} /> Add Module Manually
// //                                     </button>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         <div className="pfm-footer">
// //                             <button type="button" className="pfm-btn pfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
// //                             <button type="button" className="pfm-btn pfm-btn--primary" onClick={executeSave} disabled={isSaving}>
// //                                 {isSaving ? <><Loader2 size={13} className="pfm-spin" /> Saving…</> : <><Save size={13} /> Save Curriculum</>}
// //                             </button>
// //                         </div>
// //                     </form>
// //                 </div>
// //             </div>

// //             {/* StatusModal rendered OUTSIDE of the pfm-overlay */}
// //             {statusModal && (
// //                 <StatusModal
// //                     type={statusModal.type}
// //                     title={statusModal.title}
// //                     message={statusModal.message}
// //                     onClose={statusModal.onClose}
// //                     onCancel={statusModal.onCancel}
// //                     confirmText={statusModal.confirmText}
// //                 />
// //             )}
// //         </>
// //     );
// // };
