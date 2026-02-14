// src/components/admin/ProgrammeFormModal.tsx

import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import { ModuleEditor } from '../common/ModuleEditor';
import type { ModuleCategory, ProgrammeTemplate } from '../../types';

interface ProgrammeFormModalProps {
    programme?: ProgrammeTemplate | null;
    onClose: () => void;
    onSave: (programme: ProgrammeTemplate) => void;
    title: string;
}

// Empty programme template for creation
const emptyProgramme: Omit<ProgrammeTemplate, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'> = {
    name: '',
    saqaId: '',
    credits: 0,
    totalNotionalHours: 0,
    nqfLevel: 0,
    knowledgeModules: [],
    practicalModules: [],
    workExperienceModules: [],
    isArchived: false,
};

export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
    programme,
    onClose,
    onSave,
    title,
}) => {
    // Form state
    const [formData, setFormData] = useState<ProgrammeTemplate>(
        programme || { ...emptyProgramme, id: '' } as ProgrammeTemplate
    );
    const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');

    // Handle input changes for simple fields
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value, type, checked } = e.target;
        const newValue = type === 'checkbox' ? checked : value;
        setFormData({
            ...formData,
            [name]: type === 'number' ? (parseInt(value) || 0) : newValue,
        });
    };

    // Module management
    const addModule = (type: ModuleCategory) => {
        const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const newModule = { name: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 5 };
        setFormData({
            ...formData,
            [key]: [...(formData[key] as any[]), newModule],
        });
    };

    const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
        const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        const updated = [...(formData[key] as any[])];
        updated[index] = { ...updated[index], [field]: value };
        setFormData({ ...formData, [key]: updated });
    };

    const removeModule = (type: ModuleCategory, index: number) => {
        const key = `${type}Modules` as keyof Pick<ProgrammeTemplate, 'knowledgeModules' | 'practicalModules' | 'workExperienceModules'>;
        setFormData({
            ...formData,
            [key]: (formData[key] as any[]).filter((_, i) => i !== index),
        });
    };

    // Submit handler
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSave(formData);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button type="button" className="icon-btn" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexGrow: 1 }}>
                    <div className="modal-body">
                        <h3 className="section-title">Programme Details</h3>
                        <div className="edit-grid">
                            <div className="input-group" style={{ gridColumn: '1 / -1' }}>
                                <label>Programme Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    required
                                    value={formData.name}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="input-group">
                                <label>SAQA ID *</label>
                                <input
                                    type="text"
                                    name="saqaId"
                                    required
                                    value={formData.saqaId}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="input-group">
                                <label>NQF Level *</label>
                                <input
                                    type="number"
                                    name="nqfLevel"
                                    required
                                    min="1"
                                    max="10"
                                    value={formData.nqfLevel}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="input-group">
                                <label>Total Credits *</label>
                                <input
                                    type="number"
                                    name="credits"
                                    required
                                    min="0"
                                    value={formData.credits}
                                    onChange={handleChange}
                                />
                            </div>
                            <div className="input-group">
                                <label>Total Notional Hours *</label>
                                <input
                                    type="number"
                                    name="totalNotionalHours"
                                    required
                                    min="0"
                                    value={formData.totalNotionalHours}
                                    onChange={handleChange}
                                />
                            </div>
                            {programme && (
                                <div className="input-group">
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <input
                                            type="checkbox"
                                            name="isArchived"
                                            checked={formData.isArchived || false}
                                            onChange={handleChange}
                                        />
                                        Archived
                                    </label>
                                </div>
                            )}
                        </div>

                        <h3 className="section-title">Template Modules</h3>
                        <div className="tab-buttons">
                            <button
                                type="button"
                                className={`btn ${activeTab === 'knowledge' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setActiveTab('knowledge')}
                            >
                                Knowledge
                            </button>
                            <button
                                type="button"
                                className={`btn ${activeTab === 'practical' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setActiveTab('practical')}
                            >
                                Practical
                            </button>
                            <button
                                type="button"
                                className={`btn ${activeTab === 'workExperience' ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => setActiveTab('workExperience')}
                            >
                                Work Experience
                            </button>
                        </div>

                        <ModuleEditor
                            isTemplate
                            modules={formData[`${activeTab}Modules`]}
                            type={activeTab}
                            onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
                            onRemove={(i) => removeModule(activeTab, i)}
                            onAdd={() => addModule(activeTab)}
                        />
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            <Save size={18} /> Save Programme
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// // src/components/admin/ProgrammeFormModal.tsx

// import React, { useState } from 'react';
// import { X, Save } from 'lucide-react';
// import { ModuleEditor } from '../common/ModuleEditor';
// import type { ModuleCategory, ProgrammeTemplate } from '../../types';

// interface ProgrammeFormModalProps {
//     programme?: ProgrammeTemplate | null;
//     onClose: () => void;
//     onSave: (programme: ProgrammeTemplate) => void;
//     title: string;
// }

// export const ProgrammeFormModal: React.FC<ProgrammeFormModalProps> = ({
//     programme,
//     onClose,
//     onSave,
//     title,
// }) => {
//     const [formData, setFormData] = useState<ProgrammeTemplate>(
//         programme || {
//             id: '',
//             name: '',
//             saqaId: '',
//             credits: 0,
//             totalNotionalHours: 0,
//             nqfLevel: 0,
//             knowledgeModules: [],
//             practicalModules: [],
//             workExperienceModules: [],
//             isArchived: false,
//         }
//     );
//     const [activeTab, setActiveTab] = useState<ModuleCategory>('knowledge');

//     const handleProgChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const { name, value } = e.target;
//         if (name === 'credits' || name === 'totalNotionalHours' || name === 'nqfLevel') {
//             setFormData({ ...formData, [name]: parseInt(value) || 0 });
//         } else {
//             setFormData({ ...formData, [name]: value });
//         }
//     };

//     const addMod = (type: ModuleCategory) => {
//         const key = `${type}Modules` as keyof Pick<
//             ProgrammeTemplate,
//             'knowledgeModules' | 'practicalModules' | 'workExperienceModules'
//         >;
//         const newModule = { name: '', credits: 0, notionalHours: 0, nqfLevel: formData.nqfLevel || 5 };
//         setFormData({ ...formData, [key]: [...(formData[key] as any[]), newModule] });
//     };

//     const updateMod = (type: ModuleCategory, i: number, field: string, value: string | number) => {
//         const key = `${type}Modules` as keyof Pick<
//             ProgrammeTemplate,
//             'knowledgeModules' | 'practicalModules' | 'workExperienceModules'
//         >;
//         const updated = [...(formData[key] as any[])];
//         updated[i] = { ...updated[i], [field]: value };
//         setFormData({ ...formData, [key]: updated });
//     };

//     const removeMod = (type: ModuleCategory, i: number) => {
//         const key = `${type}Modules` as keyof Pick<
//             ProgrammeTemplate,
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
//                             Programme Details
//                         </h3>
//                         <div className="edit-grid" style={{ marginBottom: '2rem' }}>
//                             <div className="input-group" style={{ gridColumn: '1 / -1' }}>
//                                 <label>Programme Name *</label>
//                                 <input type="text" name="name" required value={formData.name} onChange={handleProgChange} />
//                             </div>
//                             <div className="input-group">
//                                 <label>SAQA ID *</label>
//                                 <input type="text" name="saqaId" required value={formData.saqaId} onChange={handleProgChange} />
//                             </div>
//                             <div className="input-group">
//                                 <label>NQF Level *</label>
//                                 <input type="number" name="nqfLevel" required value={formData.nqfLevel} onChange={handleProgChange} />
//                             </div>
//                             <div className="input-group">
//                                 <label>Total Credits *</label>
//                                 <input type="number" name="credits" required value={formData.credits} onChange={handleProgChange} />
//                             </div>
//                             <div className="input-group">
//                                 <label>Total Notional Hrs (Manual)</label>
//                                 <input
//                                     type="number"
//                                     name="totalNotionalHours"
//                                     value={formData.totalNotionalHours}
//                                     onChange={handleProgChange}
//                                 />
//                             </div>
//                         </div>

//                         <h3 style={{ borderBottom: '2px solid #94c73d', display: 'inline-block', paddingBottom: '0.5rem' }}>
//                             Template Modules
//                         </h3>
//                         <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
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
//                             isTemplate
//                             modules={formData[`${activeTab}Modules`]}
//                             type={activeTab}
//                             onUpdate={(i, f, v) => updateMod(activeTab, i, f, v)}
//                             onRemove={(i) => removeMod(activeTab, i)}
//                             onAdd={() => addMod(activeTab)}
//                         />
//                     </div>
//                     <div className="modal-footer">
//                         <button type="button" className="btn btn-outline" onClick={onClose}>
//                             Cancel
//                         </button>
//                         <button type="submit" className="btn btn-primary">
//                             <Save size={18} /> Save Template
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>
//     );
// };