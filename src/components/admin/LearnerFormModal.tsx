// src/components/admin/LearnerFormModal.tsx

import React, { useState } from 'react';
import { X, Save, Loader, AlertCircle } from 'lucide-react';
import { ModuleEditor } from '../common/ModuleEditor';
import type { DashboardLearner, LearnerDemographics, ModuleCategory, ProgrammeTemplate, Qualification } from '../../types';

interface LearnerFormModalProps {
    learner?: DashboardLearner | null;
    onClose: () => void;
    onSave: (learner: DashboardLearner) => Promise<void>;
    title: string;
    programmes: ProgrammeTemplate[];
}

const emptyQualification: Qualification = {
    name: '',
    saqaId: '',
    credits: 0,
    totalNotionalHours: 0,
    nqfLevel: 0,
    dateAssessed: '',
};

const emptyLearner: Omit<DashboardLearner, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
    fullName: '',
    idNumber: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    trainingStartDate: '',
    isArchived: false,
    qualification: { ...emptyQualification },
    knowledgeModules: [],
    practicalModules: [],
    workExperienceModules: [],
    eisaAdmission: false,
    verificationCode: '',
    issueDate: null,
    status: 'in-progress',
    demographics: undefined,
};

export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
    learner,
    onClose,
    onSave,
    title,
    programmes,
}) => {
    const [formData, setFormData] = useState<DashboardLearner>(
        learner || { ...emptyLearner, id: '' } as DashboardLearner
    );
    const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');
    const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const updateField = (field: keyof DashboardLearner, value: string | boolean | null) => {
        setFormData({ ...formData, [field]: value });
    };

    const updateQualification = (field: keyof Qualification, value: string | number) => {
        const updatedQual = { ...formData.qualification, [field]: value };
        if (field === 'credits') {
            updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
        }
        setFormData({ ...formData, qualification: updatedQual });
    };

    const updateDemographics = (field: keyof LearnerDemographics, value: string | undefined) => {
        const current = formData.demographics || {};
        setFormData({
            ...formData,
            demographics: { ...current, [field]: value },
        });
    };

    const handleProgrammeSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const prog = programmes.find(p => p.id === e.target.value);
        if (!prog) return;

        setFormData(prev => ({
            ...prev,
            qualification: {
                name: prog.name,
                saqaId: prog.saqaId,
                credits: prog.credits,
                totalNotionalHours: prog.totalNotionalHours,
                nqfLevel: prog.nqfLevel,
                dateAssessed: prev.qualification.dateAssessed || '',
            },
            knowledgeModules: prog.knowledgeModules.map(m => ({
                ...m,
                dateAssessed: '',
                status: 'Not Competent' as const,
            })),
            practicalModules: prog.practicalModules.map(m => ({
                ...m,
                dateAssessed: '',
                status: 'Fail' as const,
            })),
            workExperienceModules: prog.workExperienceModules.map(m => ({
                ...m,
                dateSignedOff: '',
                status: 'Not Competent' as const,
            })),
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);

        try {
            if (!formData.verificationCode) {
                formData.verificationCode = `SOR-${Math.floor(Math.random() * 10000)}`;
            }
            await onSave(formData);
            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to save learner record.");
        } finally {
            setIsSaving(false);
        }
    };

    const addModule = (type: ModuleCategory) => {
        const key = `${type}Modules` as keyof Pick<DashboardLearner, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const newModule = type === 'practical'
            ? { name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, dateAssessed: '', status: 'Pass' as const }
            : { name: '', credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, dateAssessed: '', status: 'Competent' as const };
        if (type === 'workExperience') (newModule as any).dateSignedOff = '';
        setFormData({ ...formData, [key]: [...(formData[key] as any[]), newModule] });
    };

    const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
        const key = `${type}Modules` as keyof Pick<DashboardLearner, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        if (field === 'credits') {
            updated[index] = { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 };
        } else {
            updated[index] = { ...updated[index], [field]: value };
        }
        setFormData({ ...formData, [key]: updated });
    };

    const removeModule = (type: ModuleCategory, index: number) => {
        const key = `${type}Modules` as keyof Pick<DashboardLearner, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        setFormData({ ...formData, [key]: (formData[key] as any[]).filter((_, i) => i !== index) });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button type="button" className="icon-btn" onClick={onClose} disabled={isSaving}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
                    <div className="modal-body">

                        {errorMessage && (
                            <div className="error-alert" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem' }}>
                                <AlertCircle size={20} />
                                <span>{errorMessage}</span>
                            </div>
                        )}

                        <h3 className="section-title">Personal Details</h3>
                        <div className="edit-grid">
                            <div className="input-group">
                                <label>Full Name *</label>
                                <input type="text" required value={formData.fullName} onChange={(e) => updateField('fullName', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>ID Number *</label>
                                <input type="text" required value={formData.idNumber} onChange={(e) => updateField('idNumber', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>Email *</label>
                                <input type="email" required value={formData.email} onChange={(e) => updateField('email', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>Phone</label>
                                <input type="text" value={formData.phone} onChange={(e) => updateField('phone', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>Date of Birth</label>
                                <input type="date" value={formData.dateOfBirth} onChange={(e) => updateField('dateOfBirth', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>Training Start Date *</label>
                                <input type="date" required value={formData.trainingStartDate} onChange={(e) => updateField('trainingStartDate', e.target.value)} />
                            </div>
                        </div>

                        <h3 className="section-title">Qualification Details</h3>
                        <div className="input-group" style={{ marginBottom: '1rem' }}>
                            <label>Load from Template</label>
                            <select onChange={handleProgrammeSelect} value="">
                                <option value="" disabled>-- Select a Programme --</option>
                                {programmes.filter(p => !p.isArchived).map(prog => (
                                    <option key={prog.id} value={prog.id}>{prog.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="edit-grid">
                            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                <label>Qualification Name *</label>
                                <input type="text" required value={formData.qualification.name} onChange={(e) => updateQualification('name', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>SAQA ID *</label>
                                <input type="text" required value={formData.qualification.saqaId} onChange={(e) => updateQualification('saqaId', e.target.value)} />
                            </div>
                            <div className="input-group">
                                <label>NQF Level *</label>
                                <input type="number" required value={formData.qualification.nqfLevel} onChange={(e) => updateQualification('nqfLevel', parseInt(e.target.value) || 0)} />
                            </div>
                            <div className="input-group">
                                <label>Total Credits *</label>
                                <input type="number" required value={formData.qualification.credits} onChange={(e) => updateQualification('credits', parseInt(e.target.value) || 0)} />
                            </div>
                        </div>

                        <h3 className="section-title">Assessment Modules</h3>
                        <div className="tab-buttons" style={{ display: 'flex', gap: '1rem', padding: '1rem 0' }}>
                            <button type="button" className={`btn ${activeTab === 'knowledge' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('knowledge')}>Knowledge</button>
                            <button type="button" className={`btn ${activeTab === 'practical' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('practical')}>Practical</button>
                            <button type="button" className={`btn ${activeTab === 'workExperience' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveTab('workExperience')}>Work Experience</button>
                        </div>

                        <ModuleEditor
                            modules={formData[`${activeTab}Modules`]}
                            type={activeTab}
                            onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
                            onRemove={(i) => removeModule(activeTab, i)}
                            onAdd={() => addModule(activeTab)}
                        />

                        <div className="eisa-box" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <input type="checkbox" checked={formData.eisaAdmission} onChange={(e) => updateField('eisaAdmission', e.target.checked)} />
                                Learner has gained admission to the EISA
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <input type="checkbox" checked={formData.isArchived} onChange={(e) => updateField('isArchived', e.target.checked)} />
                                Archive this learner record
                            </label>
                        </div>

                        <div style={{ marginTop: '2rem' }}>
                            <button type="button" className="btn btn-outline" onClick={() => setShowDemographics(!showDemographics)}>
                                {showDemographics ? 'Hide' : 'Show'} Full QCTO Demographics
                            </button>
                        </div>

                        {showDemographics && (
                            <div style={{ marginTop: '1.5rem' }}>
                                <h3 className="section-title">QCTO Demographics</h3>
                                <div className="edit-grid">
                                    <div className="input-group"><label>SDP Code</label>
                                        <input type="text" value={formData.demographics?.sdpCode || ''} onChange={(e) => updateDemographics('sdpCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Equity Code</label>
                                        <input type="text" value={formData.demographics?.equityCode || ''} onChange={(e) => updateDemographics('equityCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Nationality Code</label>
                                        <input type="text" value={formData.demographics?.nationalityCode || ''} onChange={(e) => updateDemographics('nationalityCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Home Language Code</label>
                                        <input type="text" value={formData.demographics?.homeLanguageCode || ''} onChange={(e) => updateDemographics('homeLanguageCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Gender Code</label>
                                        <input type="text" value={formData.demographics?.genderCode || ''} onChange={(e) => updateDemographics('genderCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Citizen Resident Status</label>
                                        <input type="text" value={formData.demographics?.citizenResidentStatusCode || ''} onChange={(e) => updateDemographics('citizenResidentStatusCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Socioeconomic Status</label>
                                        <input type="text" value={formData.demographics?.socioeconomicStatusCode || ''} onChange={(e) => updateDemographics('socioeconomicStatusCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Disability Status</label>
                                        <input type="text" value={formData.demographics?.disabilityStatusCode || ''} onChange={(e) => updateDemographics('disabilityStatusCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Disability Rating</label>
                                        <input type="text" value={formData.demographics?.disabilityRating || ''} onChange={(e) => updateDemographics('disabilityRating', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Immigrant Status</label>
                                        <input type="text" value={formData.demographics?.immigrantStatus || ''} onChange={(e) => updateDemographics('immigrantStatus', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Middle Name</label>
                                        <input type="text" value={formData.demographics?.learnerMiddleName || ''} onChange={(e) => updateDemographics('learnerMiddleName', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Title</label>
                                        <input type="text" value={formData.demographics?.learnerTitle || ''} onChange={(e) => updateDemographics('learnerTitle', e.target.value)} />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: '1 / -1' }}><label>Home Address 1</label>
                                        <input type="text" value={formData.demographics?.learnerHomeAddress1 || ''} onChange={(e) => updateDemographics('learnerHomeAddress1', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Home Address 2</label>
                                        <input type="text" value={formData.demographics?.learnerHomeAddress2 || ''} onChange={(e) => updateDemographics('learnerHomeAddress2', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Home Address 3</label>
                                        <input type="text" value={formData.demographics?.learnerHomeAddress3 || ''} onChange={(e) => updateDemographics('learnerHomeAddress3', e.target.value)} />
                                    </div>
                                    <div className="input-group" style={{ gridColumn: '1 / -1' }}><label>Postal Address 1</label>
                                        <input type="text" value={formData.demographics?.learnerPostalAddress1 || ''} onChange={(e) => updateDemographics('learnerPostalAddress1', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Postal Address 2</label>
                                        <input type="text" value={formData.demographics?.learnerPostalAddress2 || ''} onChange={(e) => updateDemographics('learnerPostalAddress2', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Postal Address 3</label>
                                        <input type="text" value={formData.demographics?.learnerPostalAddress3 || ''} onChange={(e) => updateDemographics('learnerPostalAddress3', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Home Postal Code</label>
                                        <input type="text" value={formData.demographics?.learnerHomeAddressPostalCode || ''} onChange={(e) => updateDemographics('learnerHomeAddressPostalCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Postal Code</label>
                                        <input type="text" value={formData.demographics?.learnerPostalAddressPostCode || ''} onChange={(e) => updateDemographics('learnerPostalAddressPostCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Province Code</label>
                                        <input type="text" value={formData.demographics?.provinceCode || ''} onChange={(e) => updateDemographics('provinceCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>STATSAA Area Code</label>
                                        <input type="text" value={formData.demographics?.statsaaAreaCode || ''} onChange={(e) => updateDemographics('statsaaAreaCode', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Expected Completion</label>
                                        <input type="date" value={formData.demographics?.expectedTrainingCompletionDate || ''} onChange={(e) => updateDemographics('expectedTrainingCompletionDate', e.target.value)} />
                                    </div>
                                    <div className="input-group"><label>Assessment Centre Code</label>
                                        <input type="text" value={formData.demographics?.assessmentCentreCode || ''} onChange={(e) => updateDemographics('assessmentCentreCode', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose} disabled={isSaving}>Cancel</button>
                        <button type="submit" className="btn btn-primary" disabled={isSaving} style={{ minWidth: '140px' }}>
                            {isSaving ? <><Loader size={18} className="spin" /> Saving...</> : <><Save size={18} /> Save Learner</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// import React, { useState } from 'react';
// import { X, Save } from 'lucide-react';
// import { ModuleEditor } from '../common/ModuleEditor';
// import type { DashboardLearner, ModuleCategory, ProgrammeTemplate } from '../../types';

// interface LearnerFormModalProps {
//     learner?: DashboardLearner | null;
//     onClose: () => void;
//     onSave: (learner: DashboardLearner) => void;
//     title: string;
//     programmes: ProgrammeTemplate[];
// }

// export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
//     learner,
//     onClose,
//     onSave,
//     title,
//     programmes,
// }) => {
//     const [formData, setFormData] = useState<DashboardLearner>(
//         learner || {
//             id: 0,
//             fullName: '',
//             idNumber: '',
//             dateOfBirth: '',
//             email: '',
//             phone: '',
//             qualification: {
//                 name: '',
//                 saqaId: '',
//                 credits: 0,
//                 totalNotionalHours: 0,
//                 nqfLevel: 0,
//                 dateAssessed: '',
//             },
//             knowledgeModules: [],
//             practicalModules: [],
//             workExperienceModules: [],
//             eisaAdmission: false,
//             verificationCode: '',
//             issueDate: null,
//             status: 'in-progress',
//         }
//     );
//     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');

//     const updateField = (field: keyof DashboardLearner, value: string | boolean) =>
//         setFormData({ ...formData, [field]: value });

//     const updateQual = (field: keyof typeof formData.qualification, value: string | number) => {
//         const updatedQual = { ...formData.qualification, [field]: value };
//         if (field === 'credits') {
//             updatedQual.totalNotionalHours = Number(value) || 0;
//         }
//         setFormData({ ...formData, qualification: updatedQual });
//     };

//     const handleProgSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
//         const prog = programmes.find((p) => p.id === e.target.value);
//         if (!prog) return;
//         setFormData((prev) => ({
//             ...prev,
//             qualification: {
//                 name: prog.name,
//                 saqaId: prog.saqaId,
//                 credits: prog.credits,
//                 totalNotionalHours: prog.totalNotionalHours,
//                 nqfLevel: prog.nqfLevel,
//                 dateAssessed: prev.qualification.dateAssessed || '',
//             },
//             knowledgeModules: prog.knowledgeModules.map((m) => ({
//                 ...m,
//                 dateAssessed: '',
//                 status: 'Not Competent',
//             })),
//             practicalModules: prog.practicalModules.map((m) => ({
//                 ...m,
//                 dateAssessed: '',
//                 status: 'Fail',
//             })),
//             workExperienceModules: prog.workExperienceModules.map((m) => ({
//                 ...m,
//                 dateSignedOff: '',
//                 status: 'Not Competent',
//             })),
//         }));
//     };

//     const addMod = (type: ModuleCategory) => {
//         const key = `${type}Modules` as keyof Pick<
//             DashboardLearner,
//             'knowledgeModules' | 'practicalModules' | 'workExperienceModules'
//         >;
//         setFormData({
//             ...formData,
//             [key]: [
//                 ...(formData[key] as any[]),
//                 {
//                     name: '',
//                     credits: 0,
//                     notionalHours: 0,
//                     nqfLevel: formData.qualification.nqfLevel || 5,
//                     [type === 'workExperience' ? 'dateSignedOff' : 'dateAssessed']: '',
//                     status: type === 'practical' ? 'Pass' : 'Competent',
//                 },
//             ],
//         });
//     };

//     const updateMod = (type: ModuleCategory, i: number, field: string, value: string | number) => {
//         const key = `${type}Modules` as keyof Pick<
//             DashboardLearner,
//             'knowledgeModules' | 'practicalModules' | 'workExperienceModules'
//         >;
//         const updated = [...(formData[key] as any[])];
//         if (field === 'credits') {
//             updated[i] = { ...updated[i], credits: value, notionalHours: Number(value) || 0 };
//         } else {
//             updated[i] = { ...updated[i], [field]: value };
//         }
//         setFormData({ ...formData, [key]: updated });
//     };

//     const removeMod = (type: ModuleCategory, i: number) => {
//         const key = `${type}Modules` as keyof Pick<
//             DashboardLearner,
//             'knowledgeModules' | 'practicalModules' | 'workExperienceModules'
//         >;
//         setFormData({
//             ...formData,
//             [key]: (formData[key] as any[]).filter((_, idx) => idx !== i),
//         });
//     };

//     return (
//         <div className="modal-overlay" onClick={onClose}>
//             <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
//                 <div className="modal-header">
//                     <h2 style={{ margin: 0 }}>{title}</h2>
//                     <button type="button" className="icon-btn" onClick={onClose}>
//                         <X size={24} />
//                     </button>
//                 </div>
//                 <form
//                     onSubmit={(e) => {
//                         e.preventDefault();
//                         onSave(formData);
//                     }}
//                     style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}
//                 >
//                     <div className="modal-body">
//                         <h3 style={{ marginTop: 0, borderBottom: '2px solid #94c73d', display: 'inline-block', paddingBottom: '0.5rem' }}>
//                             Personal Details
//                         </h3>
//                         <div className="edit-grid" style={{ marginBottom: '2rem' }}>
//                             <div className="input-group">
//                                 <label>Full Name *</label>
//                                 <input
//                                     type="text"
//                                     required
//                                     value={formData.fullName}
//                                     onChange={(e) => updateField('fullName', e.target.value)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>ID Number *</label>
//                                 <input
//                                     type="text"
//                                     required
//                                     value={formData.idNumber}
//                                     onChange={(e) => updateField('idNumber', e.target.value)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>Email *</label>
//                                 <input
//                                     type="email"
//                                     required
//                                     value={formData.email}
//                                     onChange={(e) => updateField('email', e.target.value)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>Date of Birth</label>
//                                 <input
//                                     type="date"
//                                     value={formData.dateOfBirth}
//                                     onChange={(e) => updateField('dateOfBirth', e.target.value)}
//                                 />
//                             </div>
//                         </div>

//                         <h3 style={{ borderBottom: '2px solid #94c73d', display: 'inline-block', paddingBottom: '0.5rem' }}>
//                             Qualification Details
//                         </h3>
//                         <div className="input-group" style={{ marginBottom: '1.5rem' }}>
//                             <label>Load from Template (Auto-fills modules)</label>
//                             <select onChange={handleProgSelect} defaultValue="">
//                                 <option value="" disabled>
//                                     -- Select a Programme --
//                                 </option>
//                                 {programmes
//                                     .filter((p) => !p.isArchived)
//                                     .map((prog) => (
//                                         <option key={prog.id} value={prog.id}>
//                                             {prog.name} (SAQA: {prog.saqaId})
//                                         </option>
//                                     ))}
//                             </select>
//                         </div>
//                         <div className="edit-grid" style={{ marginBottom: '2rem' }}>
//                             <div className="input-group" style={{ gridColumn: '1 / -1' }}>
//                                 <label>Qualification Name *</label>
//                                 <input
//                                     type="text"
//                                     required
//                                     value={formData.qualification.name}
//                                     onChange={(e) => updateQual('name', e.target.value)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>SAQA ID *</label>
//                                 <input
//                                     type="text"
//                                     required
//                                     value={formData.qualification.saqaId}
//                                     onChange={(e) => updateQual('saqaId', e.target.value)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>NQF Level *</label>
//                                 <input
//                                     type="number"
//                                     required
//                                     value={formData.qualification.nqfLevel}
//                                     onChange={(e) => updateQual('nqfLevel', parseInt(e.target.value) || 0)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>Total Credits *</label>
//                                 <input
//                                     type="number"
//                                     required
//                                     value={formData.qualification.credits}
//                                     onChange={(e) => updateQual('credits', parseInt(e.target.value) || 0)}
//                                 />
//                             </div>
//                             <div className="input-group">
//                                 <label>Notional Hrs (Auto)</label>
//                                 <input
//                                     type="number"
//                                     value={formData.qualification.totalNotionalHours}
//                                     readOnly
//                                     style={{ backgroundColor: 'rgba(128,128,128,0.1)', cursor: 'not-allowed' }}
//                                 />
//                             </div>
//                         </div>

//                         <h3 style={{ borderBottom: '2px solid #94c73d', display: 'inline-block', paddingBottom: '0.5rem' }}>
//                             Assessment Modules
//                         </h3>
//                         <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
//                             <button
//                                 type="button"
//                                 className={`btn ${activeTab === 'knowledge' ? 'btn-primary' : 'btn-outline'}`}
//                                 onClick={() => setActiveTab('knowledge')}
//                             >
//                                 Knowledge
//                             </button>
//                             <button
//                                 type="button"
//                                 className={`btn ${activeTab === 'practical' ? 'btn-primary' : 'btn-outline'}`}
//                                 onClick={() => setActiveTab('practical')}
//                             >
//                                 Practical
//                             </button>
//                             <button
//                                 type="button"
//                                 className={`btn ${activeTab === 'workExperience' ? 'btn-primary' : 'btn-outline'}`}
//                                 onClick={() => setActiveTab('workExperience')}
//                             >
//                                 Work Experience
//                             </button>
//                         </div>

//                         <ModuleEditor
//                             modules={formData[`${activeTab}Modules`]}
//                             type={activeTab}
//                             onUpdate={(i, f, v) => updateMod(activeTab, i, f, v)}
//                             onRemove={(i) => removeMod(activeTab, i)}
//                             onAdd={() => addMod(activeTab)}
//                         />

//                         <div
//                             style={{
//                                 marginTop: '2.5rem',
//                                 padding: '1.5rem',
//                                 background: 'rgba(148, 199, 61, 0.1)',
//                                 borderRadius: '8px',
//                                 border: '1px solid rgba(148, 199, 61, 0.3)',
//                             }}
//                         >
//                             <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
//                                 <input
//                                     type="checkbox"
//                                     checked={formData.eisaAdmission}
//                                     onChange={(e) => updateField('eisaAdmission', e.target.checked)}
//                                     style={{ width: '20px', height: '20px' }}
//                                 />
//                                 Learner has gained admission to the EISA
//                             </label>
//                         </div>
//                     </div>
//                     <div className="modal-footer">
//                         <button type="button" className="btn btn-outline" onClick={onClose}>
//                             Cancel
//                         </button>
//                         <button type="submit" className="btn btn-primary">
//                             <Save size={18} /> Save Learner Data
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>
//     );
// };