// src/components/admin/LearnerFormModal.tsx


import React, { useState, useEffect } from 'react';
import {
    X, Save, Loader2, AlertCircle, Users, BookOpen, Layers,
    FileText, Briefcase, ChevronDown, ChevronUp, RefreshCw, Plus
} from 'lucide-react';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
import { ModuleEditor } from '../../common/ModuleEditor/ModuleEditor';
import { useStore } from '../../../store/useStore';
import type {
    DashboardLearner,
    LearnerDemographics,
    ModuleCategory,
    ProgrammeTemplate,
    Qualification,
    Cohort
} from '../../../types';
import './LearnerFormModal.css';
import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';
import { db } from '../../../lib/firebase';
import { CohortFormModal } from '../CohortFormModal/CohortFormModal';

interface LearnerFormModalProps {
    learner?: DashboardLearner | null;
    onClose: () => void;
    onSave: (learner: Partial<DashboardLearner>) => Promise<void>; // Updated type to accept Partial
    title: string;
    programmes: ProgrammeTemplate[];
    cohorts: Cohort[];
    currentCohortId?: string;
}

const emptyQualification: Qualification = {
    name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0, dateAssessed: '',
};

const emptyLearner = {
    fullName: '', firstName: '', lastName: '', idNumber: '',
    dateOfBirth: '', email: '', phone: '', mobile: '',
    cohortId: 'Unassigned',
    trainingStartDate: new Date().toISOString().split('T')[0],
    isArchived: false, authStatus: 'pending', status: 'active',
    qualification: { ...emptyQualification },
    knowledgeModules: [], practicalModules: [], workExperienceModules: [],
    eisaAdmission: false, verificationCode: '', issueDate: null,
    demographics: undefined, createdAt: '', createdBy: ''
};

const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
    knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
    practical: { label: 'Practical', icon: <FileText size={13} /> },
    workExperience: { label: 'Work Experience', icon: <Briefcase size={13} /> },
};

export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
    learner, onClose, onSave, title, programmes, cohorts, currentCohortId
}) => {
    // 🚀 NEW: Import enrollLearnerInCohort from the store
    const { fetchCohorts, enrollLearnerInCohort } = useStore();

    const [formData, setFormData] = useState<DashboardLearner>(
        learner
            ? { ...learner }
            : { ...emptyLearner, id: '', cohortId: currentCohortId || 'Unassigned' } as unknown as DashboardLearner
    );

    const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
    const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false); 
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // For Manual Template Loading (RPL/Offline)
    const [selectedTemplateId, setSelectedTemplateId] = useState('');
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

    // --- 🚀 NEW STATE: COHORT MODAL 🚀 ---
    const [showCohortModal, setShowCohortModal] = useState(false);
    
    const updateField = (field: keyof DashboardLearner, value: any) =>
        setFormData(prev => ({ ...prev, [field]: value }));

    const updateQualification = (field: keyof Qualification, value: string | number) => {
        setFormData(prev => {
            const updatedQual = { ...prev.qualification, [field]: value };
            if (field === 'credits') updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
            return { ...prev, qualification: updatedQual };
        });
    };

    const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) =>
        setFormData(prev => ({ ...prev, demographics: { ...(prev.demographics || {}), [field]: value } }));

    // ─── 🚀 0. CREATE NEW COHORT (SINGLE SOURCE OF TRUTH) 🚀 ───
    const handleQuickCohortCreate = async (
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
            updateField('cohortId', newId);
            setShowCohortModal(false);

            setStatusModal({
                type: 'success',
                title: 'Class Created',
                message: `New class "${cohortData.name}" created and assigned to this learner.`,
                onClose: () => setStatusModal(null)
            });
        } catch (err: any) {
            console.error("Cohort Quick Create Error:", err);
            throw new Error(err.message || 'Could not save the new class to the database.');
        }
    };

    // ─── 🚀 1. SYNC COHORT RESULTS (100% AUTHENTIC & LOCKED) 🚀 ───
    const handleSyncCohortResults = async () => {
        if (!formData.cohortId || formData.cohortId === 'Unassigned') {
            setStatusModal({ type: 'warning', title: 'No Cohort Selected', message: 'Please assign the learner to a valid cohort first.', onClose: () => setStatusModal(null) });
            return;
        }

        const cohort = cohorts.find(c => c.id === formData.cohortId);
        if (!cohort) return;

        const templateId = (cohort as any).programmeId || (cohort as any).qualificationId || selectedTemplateId;
        const template = programmes.find(p => p.id === templateId);

        if (!template) {
            setStatusModal({
                type: 'warning',
                title: 'No Curriculum Linked',
                message: `Cohort "${cohort.name}" does not have a linked Programme Template. Please edit the Cohort settings or manually load a template below.`,
                onClose: () => setStatusModal(null)
            });
            return;
        }

        setIsSyncing(true);

        try {
            let submissions: any[] = [];
            if (formData.id) {
                const subRef = collection(db, 'learner_submissions');
                const q = query(subRef, where('learnerId', '==', formData.learnerId || formData.id), where('cohortId', '==', cohort.id));
                const snap = await getDocs(q);
                submissions = snap.docs.map(d => d.data());
            }

            const lockSystemModules = (modules: any[]) => {
                return (modules || []).map(m => {
                    const sub = submissions.find(s => s.moduleNumber === m.code || s.moduleNumber === m.name);
                    let status = 'Not Started';
                    let dateAssessed = '';

                    if (sub) {
                        dateAssessed = sub.assignedAt ? new Date(sub.assignedAt).toISOString().split('T')[0] : '';
                        if (sub.status === 'graded') {
                            status = (sub.marks >= (sub.totalMarks / 2)) ? 'Competent' : 'Not Yet Competent';
                        } else {
                            status = 'Pending Grading';
                        }
                    }

                    return {
                        ...m,
                        isSystemLocked: true, 
                        status,
                        dateAssessed,
                        dateSignedOff: dateAssessed,
                        cohortName: cohort.name
                    };
                }) as any[];
            };

            setFormData(prev => ({
                ...prev,
                qualification: {
                    name: template.name,
                    saqaId: template.saqaId,
                    credits: template.credits,
                    totalNotionalHours: template.totalNotionalHours,
                    nqfLevel: template.nqfLevel,
                    dateAssessed: prev.qualification.dateAssessed || ''
                },
                knowledgeModules: lockSystemModules(template.knowledgeModules),
                practicalModules: lockSystemModules(template.practicalModules),
                workExperienceModules: lockSystemModules(template.workExperienceModules),
            }));

            setStatusModal({
                type: 'success',
                title: 'Sync Complete',
                message: `Successfully synced curriculum from "${cohort.name}" and pulled ${submissions.length} authentic assessment result(s).`,
                onClose: () => setStatusModal(null)
            });

        } catch (error) {
            console.error("Sync Error:", error);
            setStatusModal({ type: 'error', title: 'Sync Failed', message: 'Could not retrieve database results. Please check your connection.', onClose: () => setStatusModal(null) });
        } finally {
            setIsSyncing(false);
        }
    };

    // ─── 🚀 2. MANUAL TEMPLATE LOAD 🚀 ───
    const handleLoadFromTemplate = () => {
        if (!selectedTemplateId) return;
        const template = programmes.find(p => p.id === selectedTemplateId);
        if (!template) return;

        setStatusModal({
            type: 'warning',
            title: 'Load Offline Curriculum',
            message: `Load the "${template.name}" blueprint? Module names and credits will be locked to ensure SAQA compliance, but you can manually enter dates and statuses for offline/RPL capture.`,
            confirmText: 'Yes, Load It',
            onCancel: () => setStatusModal(null),
            onClose: () => {
                const lockModules = (modules: any[]) => {
                    return (modules || []).map(m => ({
                        ...m,
                        isTemplateLocked: true,
                        status: 'Not Started',
                        dateAssessed: '',
                        dateSignedOff: '',
                        cohortName: `Imported Blueprint: ${template.name}`
                    })) as any[];
                };

                setFormData(prev => ({
                    ...prev,
                    qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || '' },
                    knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)],
                    practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)],
                    workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
                }));

                setSelectedTemplateId('');
                setStatusModal(null);
            }
        });
    };

    // ─── 🚀 3. SUBMIT WITH RELATIONAL SYNC 🚀 ───
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);
        
        try {
            if (!formData.verificationCode) formData.verificationCode = `SOR-${Math.floor(Math.random() * 10000)}`;
            let fName = formData.firstName;
            let lName = formData.lastName;
            if (formData.fullName && (!fName || !lName)) {
                const parts = formData.fullName.trim().split(' ');
                fName = parts[0] || '';
                lName = parts.slice(1).join(' ') || '';
            }

            // Save the base profile & enrollment via standard props
            const savedLearner = { ...formData, firstName: fName, lastName: lName, authStatus: formData.authStatus || 'pending' };
            await onSave(savedLearner);

            // 🚀 FIRE THE RELATIONAL STORE SYNC 🚀
            // If they selected a cohort, we MUST ensure the new store function builds the enrollmentHistory array
            if (formData.cohortId && formData.cohortId !== 'Unassigned') {
                const cohort = cohorts.find(c => c.id === formData.cohortId);
                const pId = cohort?.programmeId || cohort?.qualificationId;

                // Make sure we have the correct identifier. If it's a new learner, onSave handles it. 
                // If it's an existing learner being updated to a new cohort:
                if (learner?.id && learner.cohortId !== formData.cohortId && pId) {
                    await enrollLearnerInCohort(learner.learnerId || learner.id, formData.cohortId, pId);
                }
            }

            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to save learner record.");
        } finally {
            setIsSaving(false);
        }
    };

    // Auto-derive Date of Birth from South African ID Number
    useEffect(() => {
        if (formData.idNumber && formData.idNumber.length >= 6 && !formData.dateOfBirth) {
            const yearStr = formData.idNumber.substring(0, 2);
            const month = formData.idNumber.substring(2, 4);
            const day = formData.idNumber.substring(4, 6);
            
            const currentYear = new Date().getFullYear() % 100;
            const yearNum = parseInt(yearStr, 10);
            const fullYear = yearNum > currentYear ? `19${yearStr}` : `20${yearStr}`;
            
            if (parseInt(month) > 0 && parseInt(month) <= 12 && parseInt(day) > 0 && parseInt(day) <= 31) {
                setFormData(prev => ({ ...prev, dateOfBirth: `${fullYear}-${month}-${day}` }));
            }
        }
    }, [formData.idNumber]);

    // Add Custom Modules
    const addModule = (type: ModuleCategory) => {
        const base = {
            code: '', name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: []
        };
        if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
        else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
        else setFormData(prev => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: '', status: 'Not Started' } as any] }));
    };

    const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
        const patch = (list: any[]) => {
            const updated = [...list];
            updated[index] = field === 'credits'
                ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 }
                : { ...updated[index], [field]: value };
            return updated;
        };
        if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
        else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
        else setFormData(prev => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
    };

    const removeModule = (type: ModuleCategory, index: number) => {
        if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
        else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
        else setFormData(prev => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
    };

    const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

    return (
        <>
            <div className="lfm-overlay" onClick={onClose}>
                <div className="lfm-modal" onClick={e => e.stopPropagation()}>

                    {/* ── Header ── */}
                    <div className="lfm-header">
                        <h2 className="lfm-header__title"><Users size={16} />{title}</h2>
                        <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
                        <div className="lfm-body">

                            {errorMessage && (
                                <div className="lfm-error-banner">
                                    <AlertCircle size={16} /><span>{errorMessage}</span>
                                </div>
                            )}

                            {/* ── Personal & Enrolment ── */}
                            <div>
                                <div className="lfm-section-hdr"><Users size={13} />Personal &amp; Enrolment Details</div>
                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full"><label>Full Name *</label><input className="lfm-input" type="text" required value={formData.fullName} onChange={e => updateField('fullName', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>ID Number *</label><input className="lfm-input" type="text" required value={formData.idNumber} onChange={e => updateField('idNumber', e.target.value)} /></div>
                                    
                                    {/* 🚀 QUICK-ADD COHORT TRIGGER 🚀 */}
                                    <div className="lfm-fg">
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <label style={{ marginBottom: 0 }}>Assigned Cohort *</label>
                                            <button 
                                                type="button" 
                                                onClick={() => setShowCohortModal(true)}
                                                style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
                                            >
                                                <Plus size={10} /> New Class
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                            <select className="lfm-input lfm-select" required style={{ flex: 1 }} value={formData.cohortId} onChange={e => updateField('cohortId', e.target.value)}>
                                                <option value="Unassigned">-- Unassigned --</option>
                                                {cohorts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.startDate})</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="lfm-fg"><label>Email *</label><input className="lfm-input" type="email" required value={formData.email} onChange={e => updateField('email', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>Mobile *</label><input className="lfm-input" type="text" required value={formData.mobile || ''} onChange={e => updateField('mobile', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>Date of Birth</label><input className="lfm-input" type="date" value={formData.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>Training Start Date *</label><input className="lfm-input" type="date" required value={formData.trainingStartDate} onChange={e => updateField('trainingStartDate', e.target.value)} /></div>
                                </div>
                            </div>

                            {/* ── Cohort Sync Engine ── */}
                            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                <div>
                                    <h4 style={{ margin: '0 0 0.25rem 0', color: '#166534', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <RefreshCw size={16} /> Authentic Cohort Synchronization
                                    </h4>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
                                        Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
                                    </p>
                                </div>
                                <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === 'Unassigned'} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
                                    {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : 'Sync Database Results'}
                                </button>
                            </div>

                            {/* ── Qualification Details ── */}
                            <div>
                                <div className="lfm-section-hdr"><BookOpen size={13} />Qualification Details</div>

                                {/* ── OFFLINE CURRICULUM IMPORT PANEL ── */}
                                <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
                                    <div>
                                        <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>Offline RPL Capture (Manual Load)</h4>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Importing a template will lock module names/credits to ensure compliance, but allow you to capture dates/results manually.</p>
                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                        <select className="lfm-input lfm-select" style={{ minWidth: '250px', margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                                            <option value="">-- Select Programme Template --</option>
                                            {programmes.filter(p => !p.isArchived).map(p => <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>)}
                                        </select>
                                        <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: '0.55rem 1rem' }}>
                                            Load Template
                                        </button>
                                    </div>
                                </div>

                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full"><label>Qualification Name *</label><input className="lfm-input" type="text" required value={formData.qualification.name} onChange={e => updateQualification('name', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>SAQA ID *</label><input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={e => updateQualification('saqaId', e.target.value)} /></div>
                                    <div className="lfm-fg"><label>NQF Level *</label><input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={e => updateQualification('nqfLevel', parseInt(e.target.value) || 0)} /></div>
                                    <div className="lfm-fg"><label>Total Credits *</label><input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={e => updateQualification('credits', parseInt(e.target.value) || 0)} /></div>
                                </div>
                            </div>

                            {/* ── Assessment Modules ── */}
                            <div>
                                <div className="lfm-section-hdr"><Layers size={13} />Statement of Results</div>
                                <div className="lfm-tabs">
                                    {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
                                        <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                                            {TAB_META[tab].icon}{TAB_META[tab].label}
                                            {currentModuleCount(tab) > 0 && <span className={`lfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{currentModuleCount(tab)}</span>}
                                        </button>
                                    ))}
                                </div>
                                <div className="lfm-module-editor-wrap">
                                    <ModuleEditor
                                        modules={activeTab === 'knowledge' ? formData.knowledgeModules : activeTab === 'practical' ? formData.practicalModules : formData.workExperienceModules}
                                        type={activeTab}
                                        onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
                                        onRemove={i => removeModule(activeTab, i)}
                                        onAdd={() => addModule(activeTab)}
                                    />
                                </div>
                            </div>

                            {/* ── Flags ── */}
                            <div className="lfm-flags-panel">
                                <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.eisaAdmission} onChange={e => updateField('eisaAdmission', e.target.checked)} /> Learner has gained admission to the EISA</label>
                                <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.isArchived} onChange={e => updateField('isArchived', e.target.checked)} /> Archive this learner record</label>
                            </div>

                            {/* ── Demographics ── */}
                            <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics(v => !v)}>
                                {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? 'Hide' : 'Show'} Full QCTO Demographics
                            </button>

                            {showDemographics && (
                                <div className="lfm-demographics-panel">
                                    <div className="lfm-section-hdr" style={{ marginBottom: '0.85rem' }}>QCTO Demographics</div>
                                    <div className="lfm-grid">
                                        {[['sdpCode', 'SDP Code'], ['equityCode', 'Equity Code'], ['nationalityCode', 'Nationality Code'], ['homeLanguageCode', 'Home Language Code'], ['genderCode', 'Gender Code'], ['citizenResidentStatusCode', 'Citizen Resident Status'], ['socioeconomicStatusCode', 'Socioeconomic Status'], ['disabilityStatusCode', 'Disability Status'], ['disabilityRating', 'Disability Rating'], ['immigrantStatus', 'Immigrant Status'], ['learnerMiddleName', 'Middle Name'], ['learnerTitle', 'Title']].map(([field, label]) => (
                                            <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
                                        ))}
                                        {[['learnerHomeAddress1', 'Home Address 1'], ['learnerPostalAddress1', 'Postal Address 1']].map(([field, label]) => (
                                            <div key={field} className="lfm-fg lfm-fg--full"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
                                        ))}
                                        {[['learnerHomeAddress2', 'Home Address 2'], ['learnerHomeAddress3', 'Home Address 3'], ['learnerPostalAddress2', 'Postal Address 2'], ['learnerPostalAddress3', 'Postal Address 3'], ['learnerHomeAddressPostalCode', 'Home Postal Code'], ['learnerPostalAddressPostCode', 'Postal Code'], ['provinceCode', 'Province Code'], ['statsaaAreaCode', 'STATSAA Area Code'], ['assessmentCentreCode', 'Assessment Centre Code']].map(([field, label]) => (
                                            <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
                                        ))}
                                        <div className="lfm-fg"><label>Expected Completion</label><input className="lfm-input" type="date" value={formData.demographics?.expectedTrainingCompletionDate || ''} onChange={e => updateDemographics('expectedTrainingCompletionDate', e.target.value)} /></div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                                {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

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

            {/* ─── 🚀 THE UNIFIED COHORT MODAL 🚀 ─── */}
            {showCohortModal && (
                <CohortFormModal
                    onClose={() => setShowCohortModal(false)} 
                    onSave={handleQuickCohortCreate} 
                />
            )}
        </>
    );
};

// import React, { useState } from 'react';
// import {
//     X, Save, Loader2, AlertCircle, Users, BookOpen, Layers,
//     FileText, Briefcase, ChevronDown, ChevronUp, RefreshCw, Plus
// } from 'lucide-react';
// import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
// import { ModuleEditor } from '../../common/ModuleEditor/ModuleEditor';
// import { useStore } from '../../../store/useStore';
// import type {
//     DashboardLearner,
//     LearnerDemographics,
//     ModuleCategory,
//     ProgrammeTemplate,
//     Qualification,
//     Cohort
// } from '../../../types';
// import './LearnerFormModal.css';
// import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';
// import { db } from '../../../lib/firebase';
// import { CohortFormModal } from '../CohortFormModal/CohortFormModal';

// interface LearnerFormModalProps {
//     learner?: DashboardLearner | null;
//     onClose: () => void;
//     onSave: (learner: DashboardLearner) => Promise<void>;
//     title: string;
//     programmes: ProgrammeTemplate[];
//     cohorts: Cohort[];
//     currentCohortId?: string;
// }

// const emptyQualification: Qualification = {
//     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0, dateAssessed: '',
// };

// const emptyLearner = {
//     fullName: '', firstName: '', lastName: '', idNumber: '',
//     dateOfBirth: '', email: '', phone: '', mobile: '',
//     cohortId: 'Unassigned',
//     trainingStartDate: new Date().toISOString().split('T')[0],
//     isArchived: false, authStatus: 'pending', status: 'active',
//     qualification: { ...emptyQualification },
//     knowledgeModules: [], practicalModules: [], workExperienceModules: [],
//     eisaAdmission: false, verificationCode: '', issueDate: null,
//     demographics: undefined, createdAt: '', createdBy: ''
// };

// const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
//     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
//     practical: { label: 'Practical', icon: <FileText size={13} /> },
//     workExperience: { label: 'Work Experience', icon: <Briefcase size={13} /> },
// };

// export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
//     learner, onClose, onSave, title, programmes, cohorts, currentCohortId
// }) => {
//     // Sync the global store after creating a new cohort
//     const { fetchCohorts } = useStore();

//     const [formData, setFormData] = useState<DashboardLearner>(
//         learner
//             ? { ...learner }
//             : { ...emptyLearner, id: '', cohortId: currentCohortId || 'Unassigned' } as unknown as DashboardLearner
//     );

//     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
//     const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
//     const [isSaving, setIsSaving] = useState(false);
//     const [isSyncing, setIsSyncing] = useState(false); 
//     const [errorMessage, setErrorMessage] = useState<string | null>(null);

//     // For Manual Template Loading (RPL/Offline)
//     const [selectedTemplateId, setSelectedTemplateId] = useState('');
//     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

//     // --- 🚀 NEW STATE: COHORT MODAL 🚀 ---
//     const [showCohortModal, setShowCohortModal] = useState(false);
    
//     const updateField = (field: keyof DashboardLearner, value: any) =>
//         setFormData(prev => ({ ...prev, [field]: value }));

//     const updateQualification = (field: keyof Qualification, value: string | number) => {
//         setFormData(prev => {
//             const updatedQual = { ...prev.qualification, [field]: value };
//             if (field === 'credits') updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
//             return { ...prev, qualification: updatedQual };
//         });
//     };

//     const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) =>
//         setFormData(prev => ({ ...prev, demographics: { ...(prev.demographics || {}), [field]: value } }));

//     // ─── 🚀 0. CREATE NEW COHORT (SINGLE SOURCE OF TRUTH) 🚀 ───
//     const handleQuickCohortCreate = async (
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

//             // 1. Save directly to Firebase
//             await setDoc(cohortRef, finalCohort);

//             // 2. Fetch so the dropdown updates with the new data
//             await fetchCohorts(); 

//             // 3. Auto-select the newly created cohort for THIS learner
//             updateField('cohortId', newId);
            
//             setShowCohortModal(false);

//             // 4. Show success
//             setStatusModal({
//                 type: 'success',
//                 title: 'Class Created',
//                 message: `New class "${cohortData.name}" created and assigned to this learner.`,
//                 onClose: () => setStatusModal(null)
//             });
//         } catch (err: any) {
//             console.error("Cohort Quick Create Error:", err);
//             // We throw the error so the CohortFormModal's internal try/catch can display it.
//             throw new Error(err.message || 'Could not save the new class to the database.');
//         }
//     };

//     // ─── 🚀 1. SYNC COHORT RESULTS (100% AUTHENTIC & LOCKED) 🚀 ───
//     const handleSyncCohortResults = async () => {
//         if (!formData.cohortId || formData.cohortId === 'Unassigned') {
//             setStatusModal({ type: 'warning', title: 'No Cohort Selected', message: 'Please assign the learner to a valid cohort first.', onClose: () => setStatusModal(null) });
//             return;
//         }

//         const cohort = cohorts.find(c => c.id === formData.cohortId);
//         if (!cohort) return;

//         // Ensure the Cohort is actually linked to a Programme Template
//         const templateId = (cohort as any).programmeId || selectedTemplateId;
//         const template = programmes.find(p => p.id === templateId);

//         if (!template) {
//             setStatusModal({
//                 type: 'warning',
//                 title: 'No Curriculum Linked',
//                 message: `Cohort "${cohort.name}" does not have a linked Programme Template. Please edit the Cohort settings or manually load a template below.`,
//                 onClose: () => setStatusModal(null)
//             });
//             return;
//         }

//         setIsSyncing(true);

//         try {
//             // 1. Fetch the actual Assessment Submissions for this Learner in this Cohort
//             let submissions: any[] = [];
//             if (formData.id) {
//                 const subRef = collection(db, 'learner_submissions');
//                 const q = query(subRef, where('learnerId', '==', formData.id), where('cohortId', '==', cohort.id));
//                 const snap = await getDocs(q);
//                 submissions = snap.docs.map(d => d.data());
//             }

//             // 2. Helper to map curriculum modules to real database results
//             const lockSystemModules = (modules: any[]) => {
//                 return (modules || []).map(m => {
//                     // Match the module by code or name
//                     const sub = submissions.find(s => s.moduleNumber === m.code || s.moduleNumber === m.name);

//                     let status = 'Not Started';
//                     let dateAssessed = '';

//                     // If we found a real submission, calculate the status
//                     if (sub) {
//                         dateAssessed = sub.assignedAt ? new Date(sub.assignedAt).toISOString().split('T')[0] : '';
//                         if (sub.status === 'graded') {
//                             // Example threshold: >= 50% is Competent
//                             status = (sub.marks >= (sub.totalMarks / 2)) ? 'Competent' : 'Not Yet Competent';
//                         } else {
//                             status = 'Pending Grading';
//                         }
//                     }

//                     return {
//                         ...m,
//                         isSystemLocked: true, // <--- LEVEL 1 SECURITY LOCK. CANNOT BE EDITED.
//                         status,
//                         dateAssessed,
//                         dateSignedOff: dateAssessed,
//                         cohortName: cohort.name
//                     };
//                 }) as any[];
//             };

//             // 3. Inject into state
//             setFormData(prev => ({
//                 ...prev,
//                 qualification: {
//                     name: template.name,
//                     saqaId: template.saqaId,
//                     credits: template.credits,
//                     totalNotionalHours: template.totalNotionalHours,
//                     nqfLevel: template.nqfLevel,
//                     dateAssessed: prev.qualification.dateAssessed || ''
//                 },
//                 knowledgeModules: lockSystemModules(template.knowledgeModules),
//                 practicalModules: lockSystemModules(template.practicalModules),
//                 workExperienceModules: lockSystemModules(template.workExperienceModules),
//             }));

//             setStatusModal({
//                 type: 'success',
//                 title: 'Sync Complete',
//                 message: `Successfully synced curriculum from "${cohort.name}" and pulled ${submissions.length} authentic assessment result(s).`,
//                 onClose: () => setStatusModal(null)
//             });

//         } catch (error) {
//             console.error("Sync Error:", error);
//             setStatusModal({ type: 'error', title: 'Sync Failed', message: 'Could not retrieve database results. Please check your connection.', onClose: () => setStatusModal(null) });
//         } finally {
//             setIsSyncing(false);
//         }
//     };

//     // ─── 🚀 2. MANUAL TEMPLATE LOAD (RPL / OFFLINE CAPTURE - PARTIALLY LOCKED) 🚀 ───
//     const handleLoadFromTemplate = () => {
//         if (!selectedTemplateId) return;
//         const template = programmes.find(p => p.id === selectedTemplateId);
//         if (!template) return;

//         setStatusModal({
//             type: 'warning',
//             title: 'Load Offline Curriculum',
//             message: `Load the "${template.name}" blueprint? Module names and credits will be locked to ensure SAQA compliance, but you can manually enter dates and statuses for offline/RPL capture.`,
//             confirmText: 'Yes, Load It',
//             onCancel: () => setStatusModal(null),
//             onClose: () => {
//                 const lockModules = (modules: any[]) => {
//                     return (modules || []).map(m => ({
//                         ...m,
//                         isTemplateLocked: true, // <--- LEVEL 2 LOCK. Meta is locked, results are editable.
//                         status: 'Not Started',
//                         dateAssessed: '',
//                         dateSignedOff: '',
//                         cohortName: `Imported Blueprint: ${template.name}`
//                     })) as any[];
//                 };

//                 setFormData(prev => ({
//                     ...prev,
//                     qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || '' },
//                     knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)],
//                     practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)],
//                     workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
//                 }));

//                 setSelectedTemplateId('');
//                 setStatusModal(null);
//             }
//         });
//     };

//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setIsSaving(true);
//         setErrorMessage(null);
//         try {
//             if (!formData.verificationCode) formData.verificationCode = `SOR-${Math.floor(Math.random() * 10000)}`;
//             let fName = formData.firstName;
//             let lName = formData.lastName;
//             if (formData.fullName && (!fName || !lName)) {
//                 const parts = formData.fullName.trim().split(' ');
//                 fName = parts[0] || '';
//                 lName = parts.slice(1).join(' ') || '';
//             }
//             await onSave({ ...formData, firstName: fName, lastName: lName, authStatus: formData.authStatus || 'pending' });
//             onClose();
//         } catch (err: any) {
//             setErrorMessage(err.message || "Failed to save learner record.");
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     // ─── 🚀 3. ADD CUSTOM RECORD (FULLY EDITABLE) 🚀 ───
//     const addModule = (type: ModuleCategory) => {
//         const base = {
//             code: '', name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: []
//         };
//         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
//         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
//         else setFormData(prev => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: '', status: 'Not Started' } as any] }));
//     };

//     const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
//         const patch = (list: any[]) => {
//             const updated = [...list];
//             updated[index] = field === 'credits'
//                 ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 }
//                 : { ...updated[index], [field]: value };
//             return updated;
//         };
//         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
//         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
//         else setFormData(prev => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
//     };

//     const removeModule = (type: ModuleCategory, index: number) => {
//         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
//         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
//         else setFormData(prev => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
//     };

//     const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

//     return (
//         <>
//             <div className="lfm-overlay" onClick={onClose}>
//                 <div className="lfm-modal" onClick={e => e.stopPropagation()}>

//                     {/* ── Header ── */}
//                     <div className="lfm-header">
//                         <h2 className="lfm-header__title"><Users size={16} />{title}</h2>
//                         <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
//                     </div>

//                     <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
//                         <div className="lfm-body">

//                             {errorMessage && (
//                                 <div className="lfm-error-banner">
//                                     <AlertCircle size={16} /><span>{errorMessage}</span>
//                                 </div>
//                             )}

//                             {/* ── Personal & Enrolment ── */}
//                             <div>
//                                 <div className="lfm-section-hdr"><Users size={13} />Personal &amp; Enrolment Details</div>
//                                 <div className="lfm-grid">
//                                     <div className="lfm-fg lfm-fg--full"><label>Full Name *</label><input className="lfm-input" type="text" required value={formData.fullName} onChange={e => updateField('fullName', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>ID Number *</label><input className="lfm-input" type="text" required value={formData.idNumber} onChange={e => updateField('idNumber', e.target.value)} /></div>
                                    
//                                     {/* 🚀 QUICK-ADD COHORT TRIGGER 🚀 */}
//                                     <div className="lfm-fg">
//                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                             <label style={{ marginBottom: 0 }}>Assigned Cohort *</label>
//                                             <button 
//                                                 type="button" 
//                                                 onClick={() => setShowCohortModal(true)}
//                                                 style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
//                                             >
//                                                 <Plus size={10} /> New Class
//                                             </button>
//                                         </div>
//                                         <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
//                                             <select className="lfm-input lfm-select" required style={{ flex: 1 }} value={formData.cohortId} onChange={e => updateField('cohortId', e.target.value)}>
//                                                 <option value="Unassigned">-- Unassigned --</option>
//                                                 {cohorts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.startDate})</option>)}
//                                             </select>
//                                         </div>
//                                     </div>
                                    
//                                     <div className="lfm-fg"><label>Email *</label><input className="lfm-input" type="email" required value={formData.email} onChange={e => updateField('email', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>Mobile *</label><input className="lfm-input" type="text" required value={formData.mobile || ''} onChange={e => updateField('mobile', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>Date of Birth</label><input className="lfm-input" type="date" value={formData.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>Training Start Date *</label><input className="lfm-input" type="date" required value={formData.trainingStartDate} onChange={e => updateField('trainingStartDate', e.target.value)} /></div>
//                                 </div>
//                             </div>

//                             {/* ── Cohort Sync Engine ── */}
//                             <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
//                                 <div>
//                                     <h4 style={{ margin: '0 0 0.25rem 0', color: '#166534', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                         <RefreshCw size={16} /> Authentic Cohort Synchronization
//                                     </h4>
//                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
//                                         Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
//                                     </p>
//                                 </div>
//                                 <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === 'Unassigned'} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
//                                     {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : 'Sync Database Results'}
//                                 </button>
//                             </div>

//                             {/* ── Qualification Details ── */}
//                             <div>
//                                 <div className="lfm-section-hdr"><BookOpen size={13} />Qualification Details</div>

//                                 {/* ── OFFLINE CURRICULUM IMPORT PANEL ── */}
//                                 <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
//                                     <div>
//                                         <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>Offline RPL Capture (Manual Load)</h4>
//                                         <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Importing a template will lock module names/credits to ensure compliance, but allow you to capture dates/results manually.</p>
//                                     </div>
//                                     <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
//                                         <select className="lfm-input lfm-select" style={{ minWidth: '250px', margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
//                                             <option value="">-- Select Programme Template --</option>
//                                             {programmes.filter(p => !p.isArchived).map(p => <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>)}
//                                         </select>
//                                         <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: '0.55rem 1rem' }}>
//                                             Load Template
//                                         </button>
//                                     </div>
//                                 </div>

//                                 <div className="lfm-grid">
//                                     <div className="lfm-fg lfm-fg--full"><label>Qualification Name *</label><input className="lfm-input" type="text" required value={formData.qualification.name} onChange={e => updateQualification('name', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>SAQA ID *</label><input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={e => updateQualification('saqaId', e.target.value)} /></div>
//                                     <div className="lfm-fg"><label>NQF Level *</label><input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={e => updateQualification('nqfLevel', parseInt(e.target.value) || 0)} /></div>
//                                     <div className="lfm-fg"><label>Total Credits *</label><input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={e => updateQualification('credits', parseInt(e.target.value) || 0)} /></div>
//                                 </div>
//                             </div>

//                             {/* ── Assessment Modules ── */}
//                             <div>
//                                 <div className="lfm-section-hdr"><Layers size={13} />Statement of Results</div>
//                                 <div className="lfm-tabs">
//                                     {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
//                                         <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
//                                             {TAB_META[tab].icon}{TAB_META[tab].label}
//                                             {currentModuleCount(tab) > 0 && <span className={`lfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{currentModuleCount(tab)}</span>}
//                                         </button>
//                                     ))}
//                                 </div>
//                                 <div className="lfm-module-editor-wrap">
//                                     <ModuleEditor
//                                         modules={activeTab === 'knowledge' ? formData.knowledgeModules : activeTab === 'practical' ? formData.practicalModules : formData.workExperienceModules}
//                                         type={activeTab}
//                                         onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
//                                         onRemove={i => removeModule(activeTab, i)}
//                                         onAdd={() => addModule(activeTab)}
//                                     />
//                                 </div>
//                             </div>

//                             {/* ── Flags ── */}
//                             <div className="lfm-flags-panel">
//                                 <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.eisaAdmission} onChange={e => updateField('eisaAdmission', e.target.checked)} /> Learner has gained admission to the EISA</label>
//                                 <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.isArchived} onChange={e => updateField('isArchived', e.target.checked)} /> Archive this learner record</label>
//                             </div>

//                             {/* ── Demographics ── */}
//                             <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics(v => !v)}>
//                                 {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? 'Hide' : 'Show'} Full QCTO Demographics
//                             </button>

//                             {showDemographics && (
//                                 <div className="lfm-demographics-panel">
//                                     <div className="lfm-section-hdr" style={{ marginBottom: '0.85rem' }}>QCTO Demographics</div>
//                                     <div className="lfm-grid">
//                                         {[['sdpCode', 'SDP Code'], ['equityCode', 'Equity Code'], ['nationalityCode', 'Nationality Code'], ['homeLanguageCode', 'Home Language Code'], ['genderCode', 'Gender Code'], ['citizenResidentStatusCode', 'Citizen Resident Status'], ['socioeconomicStatusCode', 'Socioeconomic Status'], ['disabilityStatusCode', 'Disability Status'], ['disabilityRating', 'Disability Rating'], ['immigrantStatus', 'Immigrant Status'], ['learnerMiddleName', 'Middle Name'], ['learnerTitle', 'Title']].map(([field, label]) => (
//                                             <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
//                                         ))}
//                                         {[['learnerHomeAddress1', 'Home Address 1'], ['learnerPostalAddress1', 'Postal Address 1']].map(([field, label]) => (
//                                             <div key={field} className="lfm-fg lfm-fg--full"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
//                                         ))}
//                                         {[['learnerHomeAddress2', 'Home Address 2'], ['learnerHomeAddress3', 'Home Address 3'], ['learnerPostalAddress2', 'Postal Address 2'], ['learnerPostalAddress3', 'Postal Address 3'], ['learnerHomeAddressPostalCode', 'Home Postal Code'], ['learnerPostalAddressPostCode', 'Postal Code'], ['provinceCode', 'Province Code'], ['statsaaAreaCode', 'STATSAA Area Code'], ['assessmentCentreCode', 'Assessment Centre Code']].map(([field, label]) => (
//                                             <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
//                                         ))}
//                                         <div className="lfm-fg"><label>Expected Completion</label><input className="lfm-input" type="date" value={formData.demographics?.expectedTrainingCompletionDate || ''} onChange={e => updateDemographics('expectedTrainingCompletionDate', e.target.value)} /></div>
//                                     </div>
//                                 </div>
//                             )}
//                         </div>

//                         <div className="lfm-footer">
//                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
//                             <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
//                                 {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
//                             </button>
//                         </div>
//                     </form>
//                 </div>
//             </div>

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

//             {/* ─── 🚀 THE UNIFIED COHORT MODAL 🚀 ─── */}
//             {showCohortModal && (
//                 <CohortFormModal
//                     onClose={() => setShowCohortModal(false)} 
//                     onSave={handleQuickCohortCreate} 
//                 />
//             )}
//         </>
//     );
// };


// // import React, { useState } from 'react';
// // import {
// //     X, Save, Loader2, AlertCircle, Users, BookOpen, Layers,
// //     FileText, Briefcase, ChevronDown, ChevronUp, RefreshCw, Plus
// // } from 'lucide-react';
// // import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';
// // import { ModuleEditor } from '../../common/ModuleEditor/ModuleEditor';
// // import { useStore } from '../../../store/useStore';
// // import type {
// //     DashboardLearner,
// //     LearnerDemographics,
// //     ModuleCategory,
// //     ProgrammeTemplate,
// //     Qualification,
// //     Cohort
// // } from '../../../types';
// // import './LearnerFormModal.css';
// // import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';
// // import { db } from '../../../lib/firebase';
// // import { CohortFormModal } from '../CohortFormModal/CohortFormModal';

// // interface LearnerFormModalProps {
// //     learner?: DashboardLearner | null;
// //     onClose: () => void;
// //     onSave: (learner: DashboardLearner) => Promise<void>;
// //     title: string;
// //     programmes: ProgrammeTemplate[];
// //     cohorts: Cohort[];
// //     currentCohortId?: string;
// // }

// // const emptyQualification: Qualification = {
// //     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0, dateAssessed: '',
// // };

// // const emptyLearner = {
// //     fullName: '', firstName: '', lastName: '', idNumber: '',
// //     dateOfBirth: '', email: '', phone: '', mobile: '',
// //     cohortId: 'Unassigned',
// //     trainingStartDate: new Date().toISOString().split('T')[0],
// //     isArchived: false, authStatus: 'pending', status: 'active',
// //     qualification: { ...emptyQualification },
// //     knowledgeModules: [], practicalModules: [], workExperienceModules: [],
// //     eisaAdmission: false, verificationCode: '', issueDate: null,
// //     demographics: undefined, createdAt: '', createdBy: ''
// // };

// // const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
// //     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
// //     practical: { label: 'Practical', icon: <FileText size={13} /> },
// //     workExperience: { label: 'Work Experience', icon: <Briefcase size={13} /> },
// // };

// // export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
// //     learner, onClose, onSave, title, programmes, cohorts, currentCohortId
// // }) => {
// //     // We import fetchCohorts to sync the global store after creating a new cohort
// //     const { fetchCohorts } = useStore();

// //     const [formData, setFormData] = useState<DashboardLearner>(
// //         learner
// //             ? { ...learner }
// //             : { ...emptyLearner, id: '', cohortId: currentCohortId || 'Unassigned' } as unknown as DashboardLearner
// //     );

// //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
// //     const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
// //     const [isSaving, setIsSaving] = useState(false);
// //     const [isSyncing, setIsSyncing] = useState(false); 
// //     const [errorMessage, setErrorMessage] = useState<string | null>(null);

// //     // For Manual Template Loading (RPL/Offline)
// //     const [selectedTemplateId, setSelectedTemplateId] = useState('');
// //     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);

// //     // --- 🚀 NEW STATE: COHORT MODAL 🚀 ---
// //     const [showCohortModal, setShowCohortModal] = useState(false);
    

// //     const updateField = (field: keyof DashboardLearner, value: any) =>
// //         setFormData(prev => ({ ...prev, [field]: value }));

// //     const updateQualification = (field: keyof Qualification, value: string | number) => {
// //         setFormData(prev => {
// //             const updatedQual = { ...prev.qualification, [field]: value };
// //             if (field === 'credits') updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
// //             return { ...prev, qualification: updatedQual };
// //         });
// //     };

// //     const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) =>
// //         setFormData(prev => ({ ...prev, demographics: { ...(prev.demographics || {}), [field]: value } }));


// //     // ─── 🚀 0. CREATE NEW COHORT (SINGLE SOURCE OF TRUTH) 🚀 ───
// //     const handleQuickCohortCreate = async (
// //         cohortData: Omit<Cohort, 'id' | 'createdAt' | 'staffHistory' | 'isArchived'>,
// //         reasons?: { facilitator?: string; assessor?: string; moderator?: string }
// //     ) => {
// //         try {
// //             const cohortRef = doc(collection(db, 'cohorts'));
// //             const newId = cohortRef.id;

// //             const finalCohort = {
// //                 ...cohortData,
// //                 id: newId,
// //                 createdAt: new Date().toISOString(),
// //                 isArchived: false,
// //                 staffHistory: [],
// //                 status: 'active',
// //                 changeReasons: reasons || {}
// //             };

// //             // 1. Save directly to Firebase
// //             await setDoc(cohortRef, finalCohort);

// //             // 2. Fetch so the dropdown updates with the new data
// //             await fetchCohorts(); 

// //             // 3. Auto-select the newly created cohort for THIS learner
// //             updateField('cohortId', newId);
            
// //             setShowCohortModal(false);

// //             // 4. Show success
// //             setStatusModal({
// //                 type: 'success',
// //                 title: 'Class Created',
// //                 message: `New class "${cohortData.name}" created and assigned to this learner.`,
// //                 onClose: () => setStatusModal(null)
// //             });
// //         } catch (err: any) {
// //             console.error("Cohort Quick Create Error:", err);
// //             setStatusModal({
// //                 type: 'error',
// //                 title: 'Error Creating Class',
// //                 message: err.message || 'Could not save the new class to the database.',
// //                 onClose: () => setStatusModal(null)
// //             });
// //         }
// //     };


// //     // ─── 🚀 1. SYNC COHORT RESULTS (100% AUTHENTIC & LOCKED) 🚀 ───
// //     const handleSyncCohortResults = async () => {
// //         if (!formData.cohortId || formData.cohortId === 'Unassigned') {
// //             setStatusModal({ type: 'warning', title: 'No Cohort Selected', message: 'Please assign the learner to a valid cohort first.', onClose: () => setStatusModal(null) });
// //             return;
// //         }

// //         const cohort = cohorts.find(c => c.id === formData.cohortId);
// //         if (!cohort) return;

// //         // Ensure the Cohort is actually linked to a Programme Template
// //         const templateId = (cohort as any).programmeId || selectedTemplateId;
// //         const template = programmes.find(p => p.id === templateId);

// //         if (!template) {
// //             setStatusModal({
// //                 type: 'warning',
// //                 title: 'No Curriculum Linked',
// //                 message: `Cohort "${cohort.name}" does not have a linked Programme Template. Please edit the Cohort settings or manually load a template below.`,
// //                 onClose: () => setStatusModal(null)
// //             });
// //             return;
// //         }

// //         setIsSyncing(true);

// //         try {
// //             // 1. Fetch the actual Assessment Submissions for this Learner in this Cohort
// //             let submissions: any[] = [];
// //             if (formData.id) {
// //                 const subRef = collection(db, 'learner_submissions');
// //                 const q = query(subRef, where('learnerId', '==', formData.id), where('cohortId', '==', cohort.id));
// //                 const snap = await getDocs(q);
// //                 submissions = snap.docs.map(d => d.data());
// //             }

// //             // 2. Helper to map curriculum modules to real database results
// //             const lockSystemModules = (modules: any[]) => {
// //                 return (modules || []).map(m => {
// //                     // Match the module by code or name
// //                     const sub = submissions.find(s => s.moduleNumber === m.code || s.moduleNumber === m.name);

// //                     let status = 'Not Started';
// //                     let dateAssessed = '';

// //                     // If we found a real submission, calculate the status
// //                     if (sub) {
// //                         dateAssessed = sub.assignedAt ? new Date(sub.assignedAt).toISOString().split('T')[0] : '';
// //                         if (sub.status === 'graded') {
// //                             // Example threshold: >= 50% is Competent
// //                             status = (sub.marks >= (sub.totalMarks / 2)) ? 'Competent' : 'Not Yet Competent';
// //                         } else {
// //                             status = 'Pending Grading';
// //                         }
// //                     }

// //                     return {
// //                         ...m,
// //                         isSystemLocked: true, // <--- LEVEL 1 SECURITY LOCK. CANNOT BE EDITED.
// //                         status,
// //                         dateAssessed,
// //                         dateSignedOff: dateAssessed,
// //                         cohortName: cohort.name
// //                     };
// //                 }) as any[];
// //             };

// //             // 3. Inject into state
// //             setFormData(prev => ({
// //                 ...prev,
// //                 qualification: {
// //                     name: template.name,
// //                     saqaId: template.saqaId,
// //                     credits: template.credits,
// //                     totalNotionalHours: template.totalNotionalHours,
// //                     nqfLevel: template.nqfLevel,
// //                     dateAssessed: prev.qualification.dateAssessed || ''
// //                 },
// //                 knowledgeModules: lockSystemModules(template.knowledgeModules),
// //                 practicalModules: lockSystemModules(template.practicalModules),
// //                 workExperienceModules: lockSystemModules(template.workExperienceModules),
// //             }));

// //             setStatusModal({
// //                 type: 'success',
// //                 title: 'Sync Complete',
// //                 message: `Successfully synced curriculum from "${cohort.name}" and pulled ${submissions.length} authentic assessment result(s).`,
// //                 onClose: () => setStatusModal(null)
// //             });

// //         } catch (error) {
// //             console.error("Sync Error:", error);
// //             setStatusModal({ type: 'error', title: 'Sync Failed', message: 'Could not retrieve database results. Please check your connection.', onClose: () => setStatusModal(null) });
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     // ─── 🚀 2. MANUAL TEMPLATE LOAD (RPL / OFFLINE CAPTURE - PARTIALLY LOCKED) 🚀 ───
// //     const handleLoadFromTemplate = () => {
// //         if (!selectedTemplateId) return;
// //         const template = programmes.find(p => p.id === selectedTemplateId);
// //         if (!template) return;

// //         setStatusModal({
// //             type: 'warning',
// //             title: 'Load Offline Curriculum',
// //             message: `Load the "${template.name}" blueprint? Module names and credits will be locked to ensure SAQA compliance, but you can manually enter dates and statuses for offline/RPL capture.`,
// //             confirmText: 'Yes, Load It',
// //             onCancel: () => setStatusModal(null),
// //             onClose: () => {
// //                 const lockModules = (modules: any[]) => {
// //                     return (modules || []).map(m => ({
// //                         ...m,
// //                         isTemplateLocked: true, // <--- LEVEL 2 LOCK. Meta is locked, results are editable.
// //                         status: 'Not Started',
// //                         dateAssessed: '',
// //                         dateSignedOff: '',
// //                         cohortName: `Imported Blueprint: ${template.name}`
// //                     })) as any[];
// //                 };

// //                 setFormData(prev => ({
// //                     ...prev,
// //                     qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || '' },
// //                     knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)],
// //                     practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)],
// //                     workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
// //                 }));

// //                 setSelectedTemplateId('');
// //                 setStatusModal(null);
// //             }
// //         });
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setIsSaving(true);
// //         setErrorMessage(null);
// //         try {
// //             if (!formData.verificationCode) formData.verificationCode = `SOR-${Math.floor(Math.random() * 10000)}`;
// //             let fName = formData.firstName;
// //             let lName = formData.lastName;
// //             if (formData.fullName && (!fName || !lName)) {
// //                 const parts = formData.fullName.trim().split(' ');
// //                 fName = parts[0] || '';
// //                 lName = parts.slice(1).join(' ') || '';
// //             }
// //             await onSave({ ...formData, firstName: fName, lastName: lName, authStatus: formData.authStatus || 'pending' });
// //             onClose();
// //         } catch (err: any) {
// //             setErrorMessage(err.message || "Failed to save learner record.");
// //         } finally {
// //             setIsSaving(false);
// //         }
// //     };

// //     // ─── 🚀 3. ADD CUSTOM RECORD (FULLY EDITABLE) 🚀 ───
// //     const addModule = (type: ModuleCategory) => {
// //         const base = {
// //             code: '', name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: []
// //         };
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: '', status: 'Not Started' } as any] }));
// //     };

// //     const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
// //         const patch = (list: any[]) => {
// //             const updated = [...list];
// //             updated[index] = field === 'credits'
// //                 ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 }
// //                 : { ...updated[index], [field]: value };
// //             return updated;
// //         };
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
// //     };

// //     const removeModule = (type: ModuleCategory, index: number) => {
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
// //     };

// //     const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

// //     return (
// //         <>
// //             <div className="lfm-overlay" onClick={onClose}>
// //                 <div className="lfm-modal" onClick={e => e.stopPropagation()}>

// //                     {/* ── Header ── */}
// //                     <div className="lfm-header">
// //                         <h2 className="lfm-header__title"><Users size={16} />{title}</h2>
// //                         <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
// //                     </div>

// //                     <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
// //                         <div className="lfm-body">

// //                             {errorMessage && (
// //                                 <div className="lfm-error-banner">
// //                                     <AlertCircle size={16} /><span>{errorMessage}</span>
// //                                 </div>
// //                             )}

// //                             {/* ── Personal & Enrolment ── */}
// //                             <div>
// //                                 <div className="lfm-section-hdr"><Users size={13} />Personal &amp; Enrolment Details</div>
// //                                 <div className="lfm-grid">
// //                                     <div className="lfm-fg lfm-fg--full"><label>Full Name *</label><input className="lfm-input" type="text" required value={formData.fullName} onChange={e => updateField('fullName', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>ID Number *</label><input className="lfm-input" type="text" required value={formData.idNumber} onChange={e => updateField('idNumber', e.target.value)} /></div>
                                    
// //                                     {/* 🚀 QUICK-ADD COHORT TRIGGER 🚀 */}
// //                                     <div className="lfm-fg">
// //                                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                             <label style={{ marginBottom: 0 }}>Assigned Cohort *</label>
// //                                             <button 
// //                                                 type="button" 
// //                                                 onClick={() => setShowCohortModal(true)}
// //                                                 style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}
// //                                             >
// //                                                 <Plus size={10} /> New Class
// //                                             </button>
// //                                         </div>
// //                                         <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
// //                                             <select className="lfm-input lfm-select" required style={{ flex: 1 }} value={formData.cohortId} onChange={e => updateField('cohortId', e.target.value)}>
// //                                                 <option value="Unassigned">-- Unassigned --</option>
// //                                                 {cohorts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.startDate})</option>)}
// //                                             </select>
// //                                         </div>
// //                                     </div>
                                    
// //                                     <div className="lfm-fg"><label>Email *</label><input className="lfm-input" type="email" required value={formData.email} onChange={e => updateField('email', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>Mobile *</label><input className="lfm-input" type="text" required value={formData.mobile || ''} onChange={e => updateField('mobile', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>Date of Birth</label><input className="lfm-input" type="date" value={formData.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>Training Start Date *</label><input className="lfm-input" type="date" required value={formData.trainingStartDate} onChange={e => updateField('trainingStartDate', e.target.value)} /></div>
// //                                 </div>
// //                             </div>

// //                             {/* ── Cohort Sync Engine ── */}
// //                             <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
// //                                 <div>
// //                                     <h4 style={{ margin: '0 0 0.25rem 0', color: '#166534', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                         <RefreshCw size={16} /> Authentic Cohort Synchronization
// //                                     </h4>
// //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
// //                                         Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
// //                                     </p>
// //                                 </div>
// //                                 <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === 'Unassigned'} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
// //                                     {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : 'Sync Database Results'}
// //                                 </button>
// //                             </div>

// //                             {/* ── Qualification Details ── */}
// //                             <div>
// //                                 <div className="lfm-section-hdr"><BookOpen size={13} />Qualification Details</div>

// //                                 {/* ── OFFLINE CURRICULUM IMPORT PANEL ── */}
// //                                 <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
// //                                     <div>
// //                                         <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>Offline RPL Capture (Manual Load)</h4>
// //                                         <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Importing a template will lock module names/credits to ensure compliance, but allow you to capture dates/results manually.</p>
// //                                     </div>
// //                                     <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
// //                                         <select className="lfm-input lfm-select" style={{ minWidth: '250px', margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
// //                                             <option value="">-- Select Programme Template --</option>
// //                                             {programmes.filter(p => !p.isArchived).map(p => <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>)}
// //                                         </select>
// //                                         <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: '0.55rem 1rem' }}>
// //                                             Load Template
// //                                         </button>
// //                                     </div>
// //                                 </div>

// //                                 <div className="lfm-grid">
// //                                     <div className="lfm-fg lfm-fg--full"><label>Qualification Name *</label><input className="lfm-input" type="text" required value={formData.qualification.name} onChange={e => updateQualification('name', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>SAQA ID *</label><input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={e => updateQualification('saqaId', e.target.value)} /></div>
// //                                     <div className="lfm-fg"><label>NQF Level *</label><input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={e => updateQualification('nqfLevel', parseInt(e.target.value) || 0)} /></div>
// //                                     <div className="lfm-fg"><label>Total Credits *</label><input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={e => updateQualification('credits', parseInt(e.target.value) || 0)} /></div>
// //                                 </div>
// //                             </div>

// //                             {/* ── Assessment Modules ── */}
// //                             <div>
// //                                 <div className="lfm-section-hdr"><Layers size={13} />Statement of Results</div>
// //                                 <div className="lfm-tabs">
// //                                     {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
// //                                         <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
// //                                             {TAB_META[tab].icon}{TAB_META[tab].label}
// //                                             {currentModuleCount(tab) > 0 && <span className={`lfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{currentModuleCount(tab)}</span>}
// //                                         </button>
// //                                     ))}
// //                                 </div>
// //                                 <div className="lfm-module-editor-wrap">
// //                                     <ModuleEditor
// //                                         modules={activeTab === 'knowledge' ? formData.knowledgeModules : activeTab === 'practical' ? formData.practicalModules : formData.workExperienceModules}
// //                                         type={activeTab}
// //                                         onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
// //                                         onRemove={i => removeModule(activeTab, i)}
// //                                         onAdd={() => addModule(activeTab)}
// //                                     />
// //                                 </div>
// //                             </div>

// //                             {/* ── Flags ── */}
// //                             <div className="lfm-flags-panel">
// //                                 <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.eisaAdmission} onChange={e => updateField('eisaAdmission', e.target.checked)} /> Learner has gained admission to the EISA</label>
// //                                 <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.isArchived} onChange={e => updateField('isArchived', e.target.checked)} /> Archive this learner record</label>
// //                             </div>

// //                             {/* ── Demographics ── */}
// //                             <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics(v => !v)}>
// //                                 {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? 'Hide' : 'Show'} Full QCTO Demographics
// //                             </button>

// //                             {showDemographics && (
// //                                 <div className="lfm-demographics-panel">
// //                                     <div className="lfm-section-hdr" style={{ marginBottom: '0.85rem' }}>QCTO Demographics</div>
// //                                     <div className="lfm-grid">
// //                                         {[['sdpCode', 'SDP Code'], ['equityCode', 'Equity Code'], ['nationalityCode', 'Nationality Code'], ['homeLanguageCode', 'Home Language Code'], ['genderCode', 'Gender Code'], ['citizenResidentStatusCode', 'Citizen Resident Status'], ['socioeconomicStatusCode', 'Socioeconomic Status'], ['disabilityStatusCode', 'Disability Status'], ['disabilityRating', 'Disability Rating'], ['immigrantStatus', 'Immigrant Status'], ['learnerMiddleName', 'Middle Name'], ['learnerTitle', 'Title']].map(([field, label]) => (
// //                                             <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                         ))}
// //                                         {[['learnerHomeAddress1', 'Home Address 1'], ['learnerPostalAddress1', 'Postal Address 1']].map(([field, label]) => (
// //                                             <div key={field} className="lfm-fg lfm-fg--full"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                         ))}
// //                                         {[['learnerHomeAddress2', 'Home Address 2'], ['learnerHomeAddress3', 'Home Address 3'], ['learnerPostalAddress2', 'Postal Address 2'], ['learnerPostalAddress3', 'Postal Address 3'], ['learnerHomeAddressPostalCode', 'Home Postal Code'], ['learnerPostalAddressPostCode', 'Postal Code'], ['provinceCode', 'Province Code'], ['statsaaAreaCode', 'STATSAA Area Code'], ['assessmentCentreCode', 'Assessment Centre Code']].map(([field, label]) => (
// //                                             <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                         ))}
// //                                         <div className="lfm-fg"><label>Expected Completion</label><input className="lfm-input" type="date" value={formData.demographics?.expectedTrainingCompletionDate || ''} onChange={e => updateDemographics('expectedTrainingCompletionDate', e.target.value)} /></div>
// //                                     </div>
// //                                 </div>
// //                             )}
// //                         </div>

// //                         <div className="lfm-footer">
// //                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
// //                             <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
// //                                 {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
// //                             </button>
// //                         </div>
// //                     </form>
// //                 </div>
// //             </div>

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

// //             {/* ─── 🚀 THE UNIFIED COHORT MODAL 🚀 ─── */}
// //             {showCohortModal && (
// //                 <CohortFormModal
// //                     onClose={() => setShowCohortModal(false)} 
// //                     onSave={handleQuickCohortCreate} 
// //                 />
// //             )}
// //         </>
// //     );
// // };

// // import React, { useState } from 'react';
// // import {
// //     X, Save, Loader2, AlertCircle, Users, BookOpen, Layers,
// //     FileText, Briefcase, ChevronDown, ChevronUp, RefreshCw
// // } from 'lucide-react';
// // import { collection, query, where, getDocs } from 'firebase/firestore';
// // import { ModuleEditor } from '../../common/ModuleEditor/ModuleEditor';
// // import type {
// //     DashboardLearner,
// //     LearnerDemographics,
// //     ModuleCategory,
// //     ProgrammeTemplate,
// //     Qualification,
// //     Cohort
// // } from '../../../types';
// // import './LearnerFormModal.css';
// // import { StatusModal, type StatusModalProps } from '../../common/StatusModal/StatusModal';
// // import { db } from '../../../lib/firebase';

// // interface LearnerFormModalProps {
// //     learner?: DashboardLearner | null;
// //     onClose: () => void;
// //     onSave: (learner: DashboardLearner) => Promise<void>;
// //     title: string;
// //     programmes: ProgrammeTemplate[];
// //     cohorts: Cohort[];
// //     currentCohortId?: string;
// // }

// // const emptyQualification: Qualification = {
// //     name: '', saqaId: '', credits: 0, totalNotionalHours: 0, nqfLevel: 0, dateAssessed: '',
// // };

// // const emptyLearner = {
// //     fullName: '', firstName: '', lastName: '', idNumber: '',
// //     dateOfBirth: '', email: '', phone: '', mobile: '',
// //     cohortId: 'Unassigned',
// //     trainingStartDate: new Date().toISOString().split('T')[0],
// //     isArchived: false, authStatus: 'pending', status: 'active',
// //     qualification: { ...emptyQualification },
// //     knowledgeModules: [], practicalModules: [], workExperienceModules: [],
// //     eisaAdmission: false, verificationCode: '', issueDate: null,
// //     demographics: undefined, createdAt: '', createdBy: ''
// // };

// // const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
// //     knowledge: { label: 'Knowledge', icon: <Layers size={13} /> },
// //     practical: { label: 'Practical', icon: <FileText size={13} /> },
// //     workExperience: { label: 'Work Experience', icon: <Briefcase size={13} /> },
// // };

// // export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
// //     learner, onClose, onSave, title, programmes, cohorts, currentCohortId
// // }) => {
// //     const [formData, setFormData] = useState<DashboardLearner>(
// //         learner
// //             ? { ...learner }
// //             : { ...emptyLearner, id: '', cohortId: currentCohortId || 'Unassigned' } as unknown as DashboardLearner
// //     );

// //     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
// //     const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
// //     const [isSaving, setIsSaving] = useState(false);
// //     const [isSyncing, setIsSyncing] = useState(false); // NEW: For the Sync button
// //     const [errorMessage, setErrorMessage] = useState<string | null>(null);

// //     // For Manual Template Loading (RPL/Offline)
// //     const [selectedTemplateId, setSelectedTemplateId] = useState('');
// //     const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);
    

// //     const updateField = (field: keyof DashboardLearner, value: any) =>
// //         setFormData(prev => ({ ...prev, [field]: value }));

// //     const updateQualification = (field: keyof Qualification, value: string | number) => {
// //         setFormData(prev => {
// //             const updatedQual = { ...prev.qualification, [field]: value };
// //             if (field === 'credits') updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
// //             return { ...prev, qualification: updatedQual };
// //         });
// //     };

// //     const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) =>
// //         setFormData(prev => ({ ...prev, demographics: { ...(prev.demographics || {}), [field]: value } }));

// //     // ─── 🚀 1. SYNC COHORT RESULTS (100% AUTHENTIC & LOCKED) 🚀 ───
// //     const handleSyncCohortResults = async () => {
// //         if (!formData.cohortId || formData.cohortId === 'Unassigned') {
// //             setStatusModal({ type: 'warning', title: 'No Cohort Selected', message: 'Please assign the learner to a valid cohort first.', onClose: () => setStatusModal(null) });
// //             return;
// //         }

// //         const cohort = cohorts.find(c => c.id === formData.cohortId);
// //         if (!cohort) return;

// //         // Ensure the Cohort is actually linked to a Programme Template
// //         const templateId = (cohort as any).programmeId || selectedTemplateId;
// //         const template = programmes.find(p => p.id === templateId);

// //         if (!template) {
// //             setStatusModal({
// //                 type: 'warning',
// //                 title: 'No Curriculum Linked',
// //                 message: `Cohort "${cohort.name}" does not have a linked Programme Template. Please edit the Cohort settings or manually load a template below.`,
// //                 onClose: () => setStatusModal(null)
// //             });
// //             return;
// //         }

// //         setIsSyncing(true);

// //         try {
// //             // 1. Fetch the actual Assessment Submissions for this Learner in this Cohort
// //             let submissions: any[] = [];
// //             if (formData.id) {
// //                 const subRef = collection(db, 'learner_submissions');
// //                 const q = query(subRef, where('learnerId', '==', formData.id), where('cohortId', '==', cohort.id));
// //                 const snap = await getDocs(q);
// //                 submissions = snap.docs.map(d => d.data());
// //             }

// //             // 2. Helper to map curriculum modules to real database results
// //             const lockSystemModules = (modules: any[]) => {
// //                 return (modules || []).map(m => {
// //                     // Match the module by code or name
// //                     const sub = submissions.find(s => s.moduleNumber === m.code || s.moduleNumber === m.name);

// //                     let status = 'Not Started';
// //                     let dateAssessed = '';

// //                     // If we found a real submission, calculate the status
// //                     if (sub) {
// //                         dateAssessed = sub.assignedAt ? new Date(sub.assignedAt).toISOString().split('T')[0] : '';
// //                         if (sub.status === 'graded') {
// //                             // Example threshold: >= 50% is Competent
// //                             status = (sub.marks >= (sub.totalMarks / 2)) ? 'Competent' : 'Not Yet Competent';
// //                         } else {
// //                             status = 'Pending Grading';
// //                         }
// //                     }

// //                     return {
// //                         ...m,
// //                         isSystemLocked: true, // <--- LEVEL 1 SECURITY LOCK. CANNOT BE EDITED.
// //                         status,
// //                         dateAssessed,
// //                         dateSignedOff: dateAssessed,
// //                         cohortName: cohort.name
// //                     };
// //                 }) as any[];
// //             };

// //             // 3. Inject into state
// //             setFormData(prev => ({
// //                 ...prev,
// //                 qualification: {
// //                     name: template.name,
// //                     saqaId: template.saqaId,
// //                     credits: template.credits,
// //                     totalNotionalHours: template.totalNotionalHours,
// //                     nqfLevel: template.nqfLevel,
// //                     dateAssessed: prev.qualification.dateAssessed || ''
// //                 },
// //                 knowledgeModules: lockSystemModules(template.knowledgeModules),
// //                 practicalModules: lockSystemModules(template.practicalModules),
// //                 workExperienceModules: lockSystemModules(template.workExperienceModules),
// //             }));

// //             setStatusModal({
// //                 type: 'success',
// //                 title: 'Sync Complete',
// //                 message: `Successfully synced curriculum from "${cohort.name}" and pulled ${submissions.length} authentic assessment result(s).`,
// //                 onClose: () => setStatusModal(null)
// //             });

// //         } catch (error) {
// //             console.error("Sync Error:", error);
// //             setStatusModal({ type: 'error', title: 'Sync Failed', message: 'Could not retrieve database results. Please check your connection.', onClose: () => setStatusModal(null) });
// //         } finally {
// //             setIsSyncing(false);
// //         }
// //     };

// //     // ─── 🚀 2. MANUAL TEMPLATE LOAD (RPL / OFFLINE CAPTURE - PARTIALLY LOCKED) 🚀 ───
// //     const handleLoadFromTemplate = () => {
// //         if (!selectedTemplateId) return;
// //         const template = programmes.find(p => p.id === selectedTemplateId);
// //         if (!template) return;

// //         setStatusModal({
// //             type: 'warning',
// //             title: 'Load Offline Curriculum',
// //             message: `Load the "${template.name}" blueprint? Module names and credits will be locked to ensure SAQA compliance, but you can manually enter dates and statuses for offline/RPL capture.`,
// //             confirmText: 'Yes, Load It',
// //             onCancel: () => setStatusModal(null),
// //             onClose: () => {
// //                 const lockModules = (modules: any[]) => {
// //                     return (modules || []).map(m => ({
// //                         ...m,
// //                         isTemplateLocked: true, // <--- LEVEL 2 LOCK. Meta is locked, results are editable.
// //                         status: 'Not Started',
// //                         dateAssessed: '',
// //                         dateSignedOff: '',
// //                         cohortName: `Imported Blueprint: ${template.name}`
// //                     })) as any[];
// //                 };

// //                 setFormData(prev => ({
// //                     ...prev,
// //                     qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || '' },
// //                     knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)],
// //                     practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)],
// //                     workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
// //                 }));

// //                 setSelectedTemplateId('');
// //                 setStatusModal(null);
// //             }
// //         });
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setIsSaving(true);
// //         setErrorMessage(null);
// //         try {
// //             if (!formData.verificationCode) formData.verificationCode = `SOR-${Math.floor(Math.random() * 10000)}`;
// //             let fName = formData.firstName;
// //             let lName = formData.lastName;
// //             if (formData.fullName && (!fName || !lName)) {
// //                 const parts = formData.fullName.trim().split(' ');
// //                 fName = parts[0] || '';
// //                 lName = parts.slice(1).join(' ') || '';
// //             }
// //             await onSave({ ...formData, firstName: fName, lastName: lName, authStatus: formData.authStatus || 'pending' });
// //             onClose();
// //         } catch (err: any) {
// //             setErrorMessage(err.message || "Failed to save learner record.");
// //         } finally {
// //             setIsSaving(false);
// //         }
// //     };

// //     // ─── 🚀 3. ADD CUSTOM RECORD (FULLY EDITABLE) 🚀 ───
// //     const addModule = (type: ModuleCategory) => {
// //         const base = {
// //             code: '', name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: []
// //         };
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: '', status: 'Not Started' } as any] }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: '', status: 'Not Started' } as any] }));
// //     };

// //     const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
// //         const patch = (list: any[]) => {
// //             const updated = [...list];
// //             updated[index] = field === 'credits'
// //                 ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 }
// //                 : { ...updated[index], [field]: value };
// //             return updated;
// //         };
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
// //     };

// //     const removeModule = (type: ModuleCategory, index: number) => {
// //         if (type === 'knowledge') setFormData(prev => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
// //         else if (type === 'practical') setFormData(prev => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
// //         else setFormData(prev => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
// //     };

// //     const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

// //     return (
// //         <div className="lfm-overlay" onClick={onClose}>
// //             <div className="lfm-modal" onClick={e => e.stopPropagation()}>

// //                 {/* ── Header ── */}
// //                 <div className="lfm-header">
// //                     <h2 className="lfm-header__title"><Users size={16} />{title}</h2>
// //                     <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
// //                     <div className="lfm-body">

// //                         {errorMessage && (
// //                             <div className="lfm-error-banner">
// //                                 <AlertCircle size={16} /><span>{errorMessage}</span>
// //                             </div>
// //                         )}

// //                         {/* ── Personal & Enrolment ── */}
// //                         <div>
// //                             <div className="lfm-section-hdr"><Users size={13} />Personal &amp; Enrolment Details</div>
// //                             <div className="lfm-grid">
// //                                 <div className="lfm-fg lfm-fg--full"><label>Full Name *</label><input className="lfm-input" type="text" required value={formData.fullName} onChange={e => updateField('fullName', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>ID Number *</label><input className="lfm-input" type="text" required value={formData.idNumber} onChange={e => updateField('idNumber', e.target.value)} /></div>
// //                                 <div className="lfm-fg">
// //                                     <label>Assigned Cohort *</label>
// //                                     <div style={{ display: 'flex', gap: '8px' }}>
// //                                         <select className="lfm-input lfm-select" required style={{ flex: 1 }} value={formData.cohortId} onChange={e => updateField('cohortId', e.target.value)}>
// //                                             <option value="Unassigned">-- Unassigned --</option>
// //                                             {cohorts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.startDate})</option>)}
// //                                         </select>
// //                                     </div>
// //                                 </div>
// //                                 <div className="lfm-fg"><label>Email *</label><input className="lfm-input" type="email" required value={formData.email} onChange={e => updateField('email', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>Mobile *</label><input className="lfm-input" type="text" required value={formData.mobile || ''} onChange={e => updateField('mobile', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>Date of Birth</label><input className="lfm-input" type="date" value={formData.dateOfBirth} onChange={e => updateField('dateOfBirth', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>Training Start Date *</label><input className="lfm-input" type="date" required value={formData.trainingStartDate} onChange={e => updateField('trainingStartDate', e.target.value)} /></div>
// //                             </div>
// //                         </div>

// //                         {/* ── Cohort Sync Engine ── */}
// //                         <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
// //                             <div>
// //                                 <h4 style={{ margin: '0 0 0.25rem 0', color: '#166534', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <RefreshCw size={16} /> Authentic Cohort Synchronization
// //                                 </h4>
// //                                 <p style={{ margin: 0, fontSize: '0.8rem', color: '#15803d' }}>
// //                                     Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
// //                                 </p>
// //                             </div>
// //                             <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === 'Unassigned'} style={{ background: '#16a34a', color: 'white', border: 'none', padding: '0.55rem 1rem', whiteSpace: 'nowrap' }}>
// //                                 {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : 'Sync Database Results'}
// //                             </button>
// //                         </div>

// //                         {/* ── Qualification Details ── */}
// //                         <div>
// //                             <div className="lfm-section-hdr"><BookOpen size={13} />Qualification Details</div>

// //                             {/* ── OFFLINE CURRICULUM IMPORT PANEL ── */}
// //                             <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
// //                                 <div>
// //                                     <h4 style={{ margin: '0 0 0.25rem 0', color: 'var(--mlab-blue)', fontSize: '0.9rem' }}>Offline RPL Capture (Manual Load)</h4>
// //                                     <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Importing a template will lock module names/credits to ensure compliance, but allow you to capture dates/results manually.</p>
// //                                 </div>
// //                                 <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
// //                                     <select className="lfm-input lfm-select" style={{ minWidth: '250px', margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
// //                                         <option value="">-- Select Programme Template --</option>
// //                                         {programmes.filter(p => !p.isArchived).map(p => <option key={p.id} value={p.id}>{p.name} ({p.saqaId})</option>)}
// //                                     </select>
// //                                     <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: '0.55rem 1rem' }}>
// //                                         Load Template
// //                                     </button>
// //                                 </div>
// //                             </div>

// //                             <div className="lfm-grid">
// //                                 <div className="lfm-fg lfm-fg--full"><label>Qualification Name *</label><input className="lfm-input" type="text" required value={formData.qualification.name} onChange={e => updateQualification('name', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>SAQA ID *</label><input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={e => updateQualification('saqaId', e.target.value)} /></div>
// //                                 <div className="lfm-fg"><label>NQF Level *</label><input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={e => updateQualification('nqfLevel', parseInt(e.target.value) || 0)} /></div>
// //                                 <div className="lfm-fg"><label>Total Credits *</label><input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={e => updateQualification('credits', parseInt(e.target.value) || 0)} /></div>
// //                             </div>
// //                         </div>

// //                         {/* ── Assessment Modules ── */}
// //                         <div>
// //                             <div className="lfm-section-hdr"><Layers size={13} />Statement of Results</div>
// //                             <div className="lfm-tabs">
// //                                 {(Object.keys(TAB_META) as ModuleCategory[]).map(tab => (
// //                                     <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
// //                                         {TAB_META[tab].icon}{TAB_META[tab].label}
// //                                         {currentModuleCount(tab) > 0 && <span className={`lfm-tab__badge ${activeTab === tab ? 'active' : ''}`}>{currentModuleCount(tab)}</span>}
// //                                     </button>
// //                                 ))}
// //                             </div>
// //                             <div className="lfm-module-editor-wrap">
// //                                 <ModuleEditor
// //                                     modules={activeTab === 'knowledge' ? formData.knowledgeModules : activeTab === 'practical' ? formData.practicalModules : formData.workExperienceModules}
// //                                     type={activeTab}
// //                                     onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
// //                                     onRemove={i => removeModule(activeTab, i)}
// //                                     onAdd={() => addModule(activeTab)}
// //                                 />
// //                             </div>
// //                         </div>

// //                         {/* ── Flags ── */}
// //                         <div className="lfm-flags-panel">
// //                             <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.eisaAdmission} onChange={e => updateField('eisaAdmission', e.target.checked)} /> Learner has gained admission to the EISA</label>
// //                             <label className="lfm-checkbox-row"><input type="checkbox" checked={formData.isArchived} onChange={e => updateField('isArchived', e.target.checked)} /> Archive this learner record</label>
// //                         </div>

// //                         {/* ── Demographics ── */}
// //                         <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics(v => !v)}>
// //                             {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? 'Hide' : 'Show'} Full QCTO Demographics
// //                         </button>

// //                         {showDemographics && (
// //                             <div className="lfm-demographics-panel">
// //                                 <div className="lfm-section-hdr" style={{ marginBottom: '0.85rem' }}>QCTO Demographics</div>
// //                                 <div className="lfm-grid">
// //                                     {[['sdpCode', 'SDP Code'], ['equityCode', 'Equity Code'], ['nationalityCode', 'Nationality Code'], ['homeLanguageCode', 'Home Language Code'], ['genderCode', 'Gender Code'], ['citizenResidentStatusCode', 'Citizen Resident Status'], ['socioeconomicStatusCode', 'Socioeconomic Status'], ['disabilityStatusCode', 'Disability Status'], ['disabilityRating', 'Disability Rating'], ['immigrantStatus', 'Immigrant Status'], ['learnerMiddleName', 'Middle Name'], ['learnerTitle', 'Title']].map(([field, label]) => (
// //                                         <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                     ))}
// //                                     {[['learnerHomeAddress1', 'Home Address 1'], ['learnerPostalAddress1', 'Postal Address 1']].map(([field, label]) => (
// //                                         <div key={field} className="lfm-fg lfm-fg--full"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                     ))}
// //                                     {[['learnerHomeAddress2', 'Home Address 2'], ['learnerHomeAddress3', 'Home Address 3'], ['learnerPostalAddress2', 'Postal Address 2'], ['learnerPostalAddress3', 'Postal Address 3'], ['learnerHomeAddressPostalCode', 'Home Postal Code'], ['learnerPostalAddressPostCode', 'Postal Code'], ['provinceCode', 'Province Code'], ['statsaaAreaCode', 'STATSAA Area Code'], ['assessmentCentreCode', 'Assessment Centre Code']].map(([field, label]) => (
// //                                         <div key={field} className="lfm-fg"><label>{label}</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.[field] || ''} onChange={e => updateDemographics(field as keyof LearnerDemographics, e.target.value)} /></div>
// //                                     ))}
// //                                     <div className="lfm-fg"><label>Expected Completion</label><input className="lfm-input" type="date" value={formData.demographics?.expectedTrainingCompletionDate || ''} onChange={e => updateDemographics('expectedTrainingCompletionDate', e.target.value)} /></div>
// //                                 </div>
// //                             </div>
// //                         )}
// //                     </div>

// //                     <div className="lfm-footer">
// //                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
// //                         <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
// //                             {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>

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
// //         </div>
// //     );
// // };
