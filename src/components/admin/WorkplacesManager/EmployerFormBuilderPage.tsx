// src/components/admin/WorkplacesManager/EmployerFormBuilderModal.tsx

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Save, Loader2, ListPlus, Plus, Trash2, LayoutTemplate, ToggleLeft, ShieldAlert, X } from "lucide-react";
import { useToast } from "../../../components/common/Toast/Toast";
import { useStore } from "../../../store/useStore";

// Ensure the LearnerFormModal CSS is imported so we can reuse its perfect styling
import "../LearnerFormModal/LearnerFormModal.css";

// Blueprint for custom questions
export interface CustomFieldBlueprint {
    id: string;
    label: string;
    type: "text" | "dropdown" | "checkbox";
    required: boolean;
    options?: string[];
}

// Master Schema of your Application Form Defaults (Aligned with the EOI Public Form)
export const DEFAULT_CORE_FIELDS = [
    // Organisation Details
    { id: "tradingName", label: "Trading Name", section: "Organisation Details" },
    { id: "companyType", label: "Type of Business", section: "Organisation Details" },
    { id: "vatNumber", label: "VAT Number (If Applicable)", section: "Organisation Details" },
    { id: "bbbeeLevel", label: "B-BBEE Level Status", section: "Organisation Details" },
    { id: "website", label: "Company Website", section: "Organisation Details" },

    // Contact & Team Capacity
    { id: "employeeCount", label: "Current Team Size", section: "Contact & Team Capacity" },
    { id: "revenue", label: "Business Annual Revenue", section: "Contact & Team Capacity" },

    // Hosting Intent & Logistics
    { id: "hostedBefore", label: "Hosted placements before?", section: "Hosting Intent & Logistics" },
    { id: "specificRoles", label: "Specific roles looking to fill", section: "Hosting Intent & Logistics" },
    { id: "expectedStartDate", label: "Ideal Placement Start Date", section: "Hosting Intent & Logistics" },
    { id: "workArrangement", label: "Work Arrangement (On-site/Hybrid/Remote)", section: "Hosting Intent & Logistics" },
    { id: "hasDedicatedMentors", label: "Dedicated Mentors Available?", section: "Hosting Intent & Logistics" },

    // SETA, B-BBEE & Compliance Readiness
    { id: "interestedInBbbee", label: "Primary goal is B-BBEE / SETA compliance", section: "SETA, B-BBEE & Compliance Readiness" },
    { id: "etiAwareness", label: "Aware of / claiming Employment Tax Incentive (ETI)", section: "SETA, B-BBEE & Compliance Readiness" },
    { id: "requiresAdvisory", label: "Requires mLab Advisory Support", section: "SETA, B-BBEE & Compliance Readiness" },
    { id: "taxCompliant", label: "Tax Compliance Status", section: "SETA, B-BBEE & Compliance Readiness" },
    { id: "bbbeeAwareness", label: "Familiarity with B-BBEE Skills Dev requirements", section: "SETA, B-BBEE & Compliance Readiness" },

    // Referrals & Compliance
    { id: "willingToSignWBL", label: "Willing to sign formal WBL Agreements", section: "Referrals & Agreements" },
    { id: "hasHRPolicies", label: "Has basic HR & Code of Conduct policies", section: "Referrals & Agreements" }
];

interface EmployerFormBuilderModalProps {
    onClose: () => void;
}

export const EmployerFormBuilderModal: React.FC<EmployerFormBuilderModalProps> = ({ onClose }) => {
    const toast = useToast();
    const { settings, updateSettings } = useStore();
    const [isSaving, setIsSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');

    const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
    const [coreVisibility, setCoreVisibility] = useState<Record<string, boolean>>({});

    // Load existing blueprint from global settings on mount
    useEffect(() => {
        if (settings) {
            setCustomFields((settings as any)?.employerFormBlueprint?.customFields || []);

            const savedVisibility = (settings as any)?.employerFormBlueprint?.coreFieldVisibility || {};
            const initialVisibility: Record<string, boolean> = {};
            DEFAULT_CORE_FIELDS.forEach(f => {
                initialVisibility[f.id] = savedVisibility[f.id] !== undefined ? savedVisibility[f.id] : true;
            });
            setCoreVisibility(initialVisibility);
        }
    }, [settings]);

    const toggleCoreField = (id: string) => {
        setCoreVisibility(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const addCustomField = () => {
        const newField: CustomFieldBlueprint = {
            id: `emp_field_${Date.now()}`,
            label: "",
            type: "text",
            required: false,
            options: []
        };
        setCustomFields([...customFields, newField]);
    };

    const updateCustomField = (id: string, key: keyof CustomFieldBlueprint, value: any) => {
        setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
    };

    const removeCustomField = (id: string) => {
        setCustomFields(prev => prev.filter(f => f.id !== id));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();

        const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.length === 0));
        if (invalidDropdown) {
            toast.error(`Please provide comma-separated options for the dropdown: "${invalidDropdown.label || 'Untitled'}"`);
            return;
        }

        setIsSaving(true);
        try {
            const cleanedCustomFields = customFields
                .filter(f => f.label.trim() !== "")
                .map(f => ({
                    ...f,
                    options: f.type === 'dropdown' && f.options ? f.options.map(opt => opt.trim()).filter(Boolean) : []
                }));

            await updateSettings({
                ...settings,
                employerFormBlueprint: {
                    coreFieldVisibility: coreVisibility,
                    customFields: cleanedCustomFields
                }
            });

            toast.success("Public Employer Application form configured successfully!");
            onClose(); // Automatically close modal on success
        } catch (error) {
            console.error(error);
            toast.error("Failed to update application form.");
        } finally {
            setIsSaving(false);
        }
    };

    // Group core fields by section for rendering
    const groupedCoreFields = DEFAULT_CORE_FIELDS.reduce((acc, field) => {
        if (!acc[field.section]) acc[field.section] = [];
        acc[field.section].push(field);
        return acc;
    }, {} as Record<string, typeof DEFAULT_CORE_FIELDS>);

    return createPortal(
        <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>

            <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', height: '90%', width: '95vw', display: 'flex', flexDirection: 'column' }}>

                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <LayoutTemplate size={18} /> Application Form Builder
                    </h2>
                    <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving} title="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className="lfm-tabs">
                    <button type="button" className={`lfm-tab ${activeTab === 'core' ? "active" : ""}`} onClick={() => setActiveTab('core')} style={{ flex: 1, justifyContent: 'center' }}>
                        <ToggleLeft size={14} /> Standard Sections Config
                    </button>
                    <button type="button" className={`lfm-tab ${activeTab === 'custom' ? "active" : ""}`} onClick={() => setActiveTab('custom')} style={{ flex: 1, justifyContent: 'center' }}>
                        <ListPlus size={14} /> Dynamic Custom Questions
                        {customFields.length > 0 && <span className={`lfm-tab__badge ${activeTab === 'custom' ? 'active' : ''}`}>{customFields.length}</span>}
                    </button>
                </div>

                <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: 'hidden' }}>
                    <div className="lfm-body" style={{ background: '#f8fafc' }}>

                        {activeTab === 'core' && (
                            <>
                                <div className="lfm-error-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a', marginBottom: '1rem' }}>
                                    <ShieldAlert size={16} color="#1d4ed8" />
                                    <span><strong>MANDATORY SYSTEM FIELDS:</strong> Fields such as Company Name, Registration Number, Industry Sector, Physical Address, Intern Capacity, Contact Person details, and Data Consent are hardcoded as mandatory. They cannot be turned off because the platform's mapping and matching engine relies on them.</span>
                                </div>

                                {Object.entries(groupedCoreFields).map(([section, fields]) => (
                                    <div key={section} style={{ marginBottom: '1rem', background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '6px' }}>
                                        <div className="lfm-section-hdr">{section}</div>
                                        <div className="lfm-grid">
                                            {fields.map(field => (
                                                <label
                                                    key={field.id}
                                                    className="lfm-checkbox-row"
                                                    style={{
                                                        background: coreVisibility[field.id] ? '#f0fdf4' : 'var(--mlab-light-blue)',
                                                        padding: '0.65rem 0.85rem',
                                                        border: `1px solid ${coreVisibility[field.id] ? '#bbf7d0' : 'var(--mlab-border)'}`,
                                                        borderRadius: '4px',
                                                        margin: 0
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={coreVisibility[field.id] || false}
                                                        onChange={() => toggleCoreField(field.id)}
                                                    />
                                                    <span style={{ fontWeight: coreVisibility[field.id] ? 600 : 400 }}>{field.label}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}

                        {activeTab === 'custom' && (
                            <>
                                <div className="lfm-section-hdr"><ListPlus size={13} /> Additional Information Configuration</div>
                                <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '-0.5rem 0 1rem 0' }}>
                                    These custom questions will be appended to the bottom of the public application form. Useful for capturing specific Funder or SETA requirements.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                    {customFields.length === 0 && (
                                        <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--mlab-bg)', border: '1px dashed var(--mlab-border)', borderRadius: '4px', color: 'var(--mlab-grey)' }}>
                                            <ListPlus size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', marginInline: 'auto' }} />
                                            <span style={{ fontSize: '0.85rem' }}>No custom questions configured. Click below to add your first dynamic field.</span>
                                        </div>
                                    )}

                                    {customFields.map((field, idx) => (
                                        <div key={field.id} className="lfm-flags-panel" style={{ position: 'relative', borderLeftColor: 'var(--mlab-green)', background: 'var(--mlab-white)' }}>
                                            <button type="button" onClick={() => removeCustomField(field.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}>
                                                <Trash2 size={16} />
                                            </button>

                                            <div className="lfm-grid">
                                                <div className="lfm-fg lfm-fg--full" style={{ paddingRight: '2rem' }}>
                                                    <label>Question Label *</label>
                                                    <input className="lfm-input" type="text" placeholder="e.g. Do you have a dedicated intern workspace?" value={field.label} onChange={(e) => updateCustomField(field.id, 'label', e.target.value)} required />
                                                </div>

                                                <div className="lfm-fg">
                                                    <label>Answer Type *</label>
                                                    <select className="lfm-input lfm-select" value={field.type} onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}>
                                                        <option value="text">Short Text / Paragraph</option>
                                                        <option value="dropdown">Dropdown Options</option>
                                                        <option value="checkbox">Yes / No Checkbox</option>
                                                    </select>
                                                </div>

                                                <div className="lfm-fg" style={{ justifyContent: 'flex-end', paddingBottom: '0.4rem' }}>
                                                    <label className="lfm-checkbox-row" style={{ background: field.required ? '#fef2f2' : 'transparent', padding: field.required ? '0.4rem' : '0', border: field.required ? '1px solid #fecaca' : '1px solid transparent', borderRadius: '4px', width: 'fit-content' }}>
                                                        <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)} />
                                                        <span style={{ color: field.required ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Required Answer</span>
                                                    </label>
                                                </div>

                                                {field.type === 'dropdown' && (
                                                    <div className="lfm-fg lfm-fg--full" style={{ marginTop: '0.5rem', background: 'var(--mlab-light-blue)', padding: '0.75rem', border: '1px solid var(--mlab-border)' }}>
                                                        <label>Dropdown Options (Comma Separated) *</label>
                                                        <input className="lfm-input" type="text" placeholder="e.g. Desk, Lab, Open Plan, Remote" value={field.options?.join(",") || ""} onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))} required />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}

                                    <button type="button" onClick={addCustomField} className="lfm-btn lfm-btn--ghost" style={{ alignSelf: 'center', marginTop: '0.5rem' }}>
                                        <Plus size={14} /> Add New Question
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="lfm-footer">
                        <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>
                            Cancel
                        </button>
                        <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                            {isSaving ? <><Loader2 className="lfm-spin" size={13} /> Saving Blueprint…</> : <><Save size={13} /> Save Form Configuration</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};


// // src/components/admin/WorkplacesManager/EmployerFormBuilderModal.tsx

// import React, { useState, useEffect } from "react";
// import { createPortal } from "react-dom";
// import { Save, Loader2, ListPlus, Plus, Trash2, LayoutTemplate, ToggleLeft, ShieldAlert, X } from "lucide-react";
// import { useToast } from "../../../components/common/Toast/Toast";
// import { useStore } from "../../../store/useStore";

// import "../LearnerFormModal/LearnerFormModal.css";

// export interface CustomFieldBlueprint {
//     id: string;
//     label: string;
//     type: "text" | "dropdown" | "checkbox";
//     required: boolean;
//     options?: string[];
// }

// // Master Schema of your Application Form Defaults (Aligned with the EOI Public Form)
// export const DEFAULT_CORE_FIELDS = [
//     // Organisation Details
//     { id: "tradingName", label: "Trading Name", section: "Organisation Details" },
//     { id: "vatNumber", label: "VAT Number (If Applicable)", section: "Organisation Details" },
//     { id: "bbbeeLevel", label: "B-BBEE Level Status", section: "Organisation Details" },
//     { id: "website", label: "Company Website", section: "Organisation Details" },

//     // Contact & Team Capacity
//     { id: "employeeCount", label: "Current Team Size", section: "Contact & Team Capacity" },

//     // Hosting Intent & Logistics
//     { id: "expectedStartDate", label: "Ideal Placement Start Date", section: "Hosting Intent & Logistics" },
//     { id: "workArrangement", label: "Work Arrangement (On-site/Hybrid/Remote)", section: "Hosting Intent & Logistics" },
//     { id: "hasDedicatedMentors", label: "Dedicated Mentors Available?", section: "Hosting Intent & Logistics" },

//     // SETA, B-BBEE & Compliance Readiness
//     { id: "interestedInBbbee", label: "Primary goal is B-BBEE / SETA compliance", section: "SETA, B-BBEE & Compliance Readiness" },
//     { id: "etiAwareness", label: "Aware of / claiming Employment Tax Incentive (ETI)", section: "SETA, B-BBEE & Compliance Readiness" },
//     { id: "requiresAdvisory", label: "Requires mLab Advisory Support", section: "SETA, B-BBEE & Compliance Readiness" },
//     { id: "taxCompliant", label: "Tax Compliance Status", section: "SETA, B-BBEE & Compliance Readiness" },
//     { id: "bbbeeAwareness", label: "Familiarity with B-BBEE Skills Dev requirements", section: "SETA, B-BBEE & Compliance Readiness" },

//     // Referrals & Compliance
//     { id: "willingToSignWBL", label: "Willing to sign formal WBL Agreements", section: "Referrals & Agreements" },
//     { id: "hasHRPolicies", label: "Has basic HR & Code of Conduct policies", section: "Referrals & Agreements" }
// ];

// interface EmployerFormBuilderModalProps {
//     onClose: () => void;
// }

// export const EmployerFormBuilderModal: React.FC<EmployerFormBuilderModalProps> = ({ onClose }) => {
//     const toast = useToast();
//     const { settings, updateSettings } = useStore();
//     const [isSaving, setIsSaving] = useState(false);
//     const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');

//     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
//     const [coreVisibility, setCoreVisibility] = useState<Record<string, boolean>>({});

//     // Load existing blueprint from global settings on mount
//     useEffect(() => {
//         if (settings) {
//             setCustomFields((settings as any)?.employerFormBlueprint?.customFields || []);

//             const savedVisibility = (settings as any)?.employerFormBlueprint?.coreFieldVisibility || {};
//             const initialVisibility: Record<string, boolean> = {};
//             DEFAULT_CORE_FIELDS.forEach(f => {
//                 initialVisibility[f.id] = savedVisibility[f.id] !== undefined ? savedVisibility[f.id] : true;
//             });
//             setCoreVisibility(initialVisibility);
//         }
//     }, [settings]);

//     const toggleCoreField = (id: string) => {
//         setCoreVisibility(prev => ({ ...prev, [id]: !prev[id] }));
//     };

//     const addCustomField = () => {
//         const newField: CustomFieldBlueprint = {
//             id: `emp_field_${Date.now()}`,
//             label: "",
//             type: "text",
//             required: false,
//             options: []
//         };
//         setCustomFields([...customFields, newField]);
//     };

//     const updateCustomField = (id: string, key: keyof CustomFieldBlueprint, value: any) => {
//         setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
//     };

//     const removeCustomField = (id: string) => {
//         setCustomFields(prev => prev.filter(f => f.id !== id));
//     };

//     const handleSave = async (e: React.FormEvent) => {
//         e.preventDefault();

//         const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.length === 0));
//         if (invalidDropdown) {
//             toast.error(`Please provide comma-separated options for the dropdown: "${invalidDropdown.label || 'Untitled'}"`);
//             return;
//         }

//         setIsSaving(true);
//         try {
//             const cleanedCustomFields = customFields
//                 .filter(f => f.label.trim() !== "")
//                 .map(f => ({
//                     ...f,
//                     options: f.type === 'dropdown' && f.options ? f.options.map(opt => opt.trim()).filter(Boolean) : []
//                 }));

//             await updateSettings({
//                 ...settings,
//                 employerFormBlueprint: {
//                     coreFieldVisibility: coreVisibility,
//                     customFields: cleanedCustomFields
//                 }
//             });

//             toast.success("Public Employer Application form configured successfully!");
//             onClose(); // Automatically close modal on success
//         } catch (error) {
//             console.error(error);
//             toast.error("Failed to update application form.");
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     // Group core fields by section for rendering
//     const groupedCoreFields = DEFAULT_CORE_FIELDS.reduce((acc, field) => {
//         if (!acc[field.section]) acc[field.section] = [];
//         acc[field.section].push(field);
//         return acc;
//     }, {} as Record<string, typeof DEFAULT_CORE_FIELDS>);

//     return createPortal(
//         <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>

//             <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', height: '90%', width: '95vw', display: 'flex', flexDirection: 'column' }}>

//                 <div className="lfm-header">
//                     <h2 className="lfm-header__title">
//                         <LayoutTemplate size={18} /> Application Form Builder
//                     </h2>
//                     <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving} title="Close">
//                         <X size={20} />
//                     </button>
//                 </div>

//                 <div className="lfm-tabs">
//                     <button type="button" className={`lfm-tab ${activeTab === 'core' ? "active" : ""}`} onClick={() => setActiveTab('core')} style={{ flex: 1, justifyContent: 'center' }}>
//                         <ToggleLeft size={14} /> Standard Sections Config
//                     </button>
//                     <button type="button" className={`lfm-tab ${activeTab === 'custom' ? "active" : ""}`} onClick={() => setActiveTab('custom')} style={{ flex: 1, justifyContent: 'center' }}>
//                         <ListPlus size={14} /> Dynamic Custom Questions
//                         {customFields.length > 0 && <span className={`lfm-tab__badge ${activeTab === 'custom' ? 'active' : ''}`}>{customFields.length}</span>}
//                     </button>
//                 </div>

//                 <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: 'hidden' }}>
//                     <div className="lfm-body" style={{ background: '#f8fafc' }}>

//                         {activeTab === 'core' && (
//                             <>
//                                 <div className="lfm-error-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a', marginBottom: '1rem' }}>
//                                     <ShieldAlert size={16} color="#1d4ed8" />
//                                     <span><strong>MANDATORY SYSTEM FIELDS:</strong> Fields such as Company Name, Registration Number, Industry Sector, Physical Address, Intern Capacity, Contact Person details, and Data Consent are hardcoded as mandatory. They cannot be turned off because the platform's mapping and matching engine relies on them.</span>
//                                 </div>

//                                 {Object.entries(groupedCoreFields).map(([section, fields]) => (
//                                     <div key={section} style={{ marginBottom: '1rem', background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '6px' }}>
//                                         <div className="lfm-section-hdr">{section}</div>
//                                         <div className="lfm-grid">
//                                             {fields.map(field => (
//                                                 <label
//                                                     key={field.id}
//                                                     className="lfm-checkbox-row"
//                                                     style={{
//                                                         background: coreVisibility[field.id] ? '#f0fdf4' : 'var(--mlab-light-blue)',
//                                                         padding: '0.65rem 0.85rem',
//                                                         border: `1px solid ${coreVisibility[field.id] ? '#bbf7d0' : 'var(--mlab-border)'}`,
//                                                         borderRadius: '4px',
//                                                         margin: 0
//                                                     }}
//                                                 >
//                                                     <input
//                                                         type="checkbox"
//                                                         checked={coreVisibility[field.id] || false}
//                                                         onChange={() => toggleCoreField(field.id)}
//                                                     />
//                                                     <span style={{ fontWeight: coreVisibility[field.id] ? 600 : 400 }}>{field.label}</span>
//                                                 </label>
//                                             ))}
//                                         </div>
//                                     </div>
//                                 ))}
//                             </>
//                         )}

//                         {activeTab === 'custom' && (
//                             <>
//                                 <div className="lfm-section-hdr"><ListPlus size={13} /> Additional Information Configuration</div>
//                                 <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '-0.5rem 0 1rem 0' }}>
//                                     These custom questions will be appended to the bottom of the public application form. Useful for capturing specific Funder or SETA requirements.
//                                 </p>

//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
//                                     {customFields.length === 0 && (
//                                         <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--mlab-bg)', border: '1px dashed var(--mlab-border)', borderRadius: '4px', color: 'var(--mlab-grey)' }}>
//                                             <ListPlus size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', marginInline: 'auto' }} />
//                                             <span style={{ fontSize: '0.85rem' }}>No custom questions configured. Click below to add your first dynamic field.</span>
//                                         </div>
//                                     )}

//                                     {customFields.map((field, idx) => (
//                                         <div key={field.id} className="lfm-flags-panel" style={{ position: 'relative', borderLeftColor: 'var(--mlab-green)', background: 'var(--mlab-white)' }}>
//                                             <button type="button" onClick={() => removeCustomField(field.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}>
//                                                 <Trash2 size={16} />
//                                             </button>

//                                             <div className="lfm-grid">
//                                                 <div className="lfm-fg lfm-fg--full" style={{ paddingRight: '2rem' }}>
//                                                     <label>Question Label *</label>
//                                                     <input className="lfm-input" type="text" placeholder="e.g. Do you have a dedicated intern workspace?" value={field.label} onChange={(e) => updateCustomField(field.id, 'label', e.target.value)} required />
//                                                 </div>

//                                                 <div className="lfm-fg">
//                                                     <label>Answer Type *</label>
//                                                     <select className="lfm-input lfm-select" value={field.type} onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}>
//                                                         <option value="text">Short Text / Paragraph</option>
//                                                         <option value="dropdown">Dropdown Options</option>
//                                                         <option value="checkbox">Yes / No Checkbox</option>
//                                                     </select>
//                                                 </div>

//                                                 <div className="lfm-fg" style={{ justifyContent: 'flex-end', paddingBottom: '0.4rem' }}>
//                                                     <label className="lfm-checkbox-row" style={{ background: field.required ? '#fef2f2' : 'transparent', padding: field.required ? '0.4rem' : '0', border: field.required ? '1px solid #fecaca' : '1px solid transparent', borderRadius: '4px', width: 'fit-content' }}>
//                                                         <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)} />
//                                                         <span style={{ color: field.required ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Required Answer</span>
//                                                     </label>
//                                                 </div>

//                                                 {field.type === 'dropdown' && (
//                                                     <div className="lfm-fg lfm-fg--full" style={{ marginTop: '0.5rem', background: 'var(--mlab-light-blue)', padding: '0.75rem', border: '1px solid var(--mlab-border)' }}>
//                                                         <label>Dropdown Options (Comma Separated) *</label>
//                                                         <input className="lfm-input" type="text" placeholder="e.g. Desk, Lab, Open Plan, Remote" value={field.options?.join(",") || ""} onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))} required />
//                                                     </div>
//                                                 )}
//                                             </div>
//                                         </div>
//                                     ))}

//                                     <button type="button" onClick={addCustomField} className="lfm-btn lfm-btn--ghost" style={{ alignSelf: 'center', marginTop: '0.5rem' }}>
//                                         <Plus size={14} /> Add New Question
//                                     </button>
//                                 </div>
//                             </>
//                         )}
//                     </div>

//                     <div className="lfm-footer">
//                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>
//                             Cancel
//                         </button>
//                         <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
//                             {isSaving ? <><Loader2 className="lfm-spin" size={13} /> Saving Blueprint…</> : <><Save size={13} /> Save Form Configuration</>}
//                         </button>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };



// // // src/components/admin/WorkplacesManager/EmployerFormBuilderModal.tsx

// // import React, { useState, useEffect } from "react";
// // import { createPortal } from "react-dom";
// // import { Save, Loader2, ListPlus, Plus, Trash2, LayoutTemplate, ToggleLeft, ShieldAlert, X } from "lucide-react";
// // import { useToast } from "../../../components/common/Toast/Toast";
// // import { useStore } from "../../../store/useStore";

// // // Ensure the LearnerFormModal CSS is imported so we can reuse its perfect styling
// // import "../LearnerFormModal/LearnerFormModal.css";

// // // Blueprint for custom questions
// // export interface CustomFieldBlueprint {
// //     id: string;
// //     label: string;
// //     type: "text" | "dropdown" | "checkbox";
// //     required: boolean;
// //     options?: string[];
// // }

// // // Master Schema of your Application Form Defaults
// // export const DEFAULT_CORE_FIELDS = [
// //     { id: "tradingName", label: "Trading Name", section: "Organisation Information" },
// //     { id: "taxNumber", label: "Tax Number", section: "Organisation Information" },
// //     { id: "vatNumber", label: "VAT Number", section: "Organisation Information" },
// //     { id: "bbbeeLevel", label: "B-BBEE Level", section: "Organisation Information" },
// //     { id: "industrySector", label: "Industry Sector", section: "Organisation Information" },
// //     { id: "website", label: "Website / Online Presence", section: "Organisation Information" },
// //     { id: "yearEstablished", label: "Year Established", section: "Organisation Information" },

// //     { id: "alternativeContact", label: "Alternative Contact", section: "Primary Contact Person" },

// //     { id: "employeeCount", label: "Number of Employees", section: "Organisation Capacity & Work Environment" },
// //     { id: "workArrangement", label: "Work Arrangement (On-site/Remote)", section: "Organisation Capacity & Work Environment" },
// //     { id: "hasDedicatedMentors", label: "Do you have dedicated mentors?", section: "Organisation Capacity & Work Environment" },
// //     { id: "workEnvironmentDesc", label: "Describe work environment", section: "Organisation Capacity & Work Environment" },
// //     { id: "techStack", label: "Tools / Technologies used", section: "Organisation Capacity & Work Environment" },

// //     { id: "hostingMotivations", label: "Why do you want to host learners?", section: "Learner Hosting Intent" },
// //     { id: "preferredLearnerLevel", label: "Preferred learner level", section: "Learner Hosting Intent" },
// //     { id: "preferredDisciplines", label: "Preferred disciplines", section: "Learner Hosting Intent" },
// //     { id: "expectedStartDate", label: "Expected start date", section: "Learner Hosting Intent" },
// //     { id: "expectedDuration", label: "Expected duration", section: "Learner Hosting Intent" },

// //     { id: "supervisorName", label: "Who will supervise learners?", section: "Mentorship & Supervision" },
// //     { id: "mentorExperienceLevel", label: "Mentor experience level", section: "Mentorship & Supervision" },
// //     { id: "weeklyCheckIns", label: "Available for weekly check-ins?", section: "Mentorship & Supervision" },
// //     { id: "mentorshipStructureDesc", label: "Describe mentorship structure", section: "Mentorship & Supervision" },

// //     { id: "projectTypesDesc", label: "Describe projects learners will work on", section: "Projects & Work Exposure" },
// //     { id: "productionAccess", label: "Access to real production systems?", section: "Projects & Work Exposure" },
// //     { id: "contributionAreas", label: "Will learners contribute to live projects?", section: "Projects & Work Exposure" },

// //     { id: "willingToSignWBL", label: "Willing to sign WBL Agreement?", section: "Compliance & Readiness" },
// //     { id: "taxCompliant", label: "Compliant with tax requirements?", section: "Compliance & Readiness" },
// //     { id: "hasHRPolicies", label: "HR policies in place?", section: "Compliance & Readiness" },
// //     { id: "bbbeeAwareness", label: "Familiar with B-BBEE requirements?", section: "Compliance & Readiness" },

// //     { id: "interestedInBbbee", label: "Interested in B-BBEE recognition?", section: "B-BBEE & Incentives Awareness" },
// //     { id: "etiAwareness", label: "Aware of ETI (Employment Tax Incentive)?", section: "B-BBEE & Incentives Awareness" },
// //     { id: "requiresAdvisory", label: "Would you like advisory support?", section: "B-BBEE & Incentives Awareness" },

// //     { id: "additionalComments", label: "Additional comments or requirements", section: "Additional Information" }
// // ];

// // interface EmployerFormBuilderModalProps {
// //     onClose: () => void;
// // }

// // export const EmployerFormBuilderModal: React.FC<EmployerFormBuilderModalProps> = ({ onClose }) => {
// //     const toast = useToast();
// //     const { settings, updateSettings } = useStore();
// //     const [isSaving, setIsSaving] = useState(false);
// //     const [activeTab, setActiveTab] = useState<'core' | 'custom'>('core');

// //     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
// //     const [coreVisibility, setCoreVisibility] = useState<Record<string, boolean>>({});

// //     // Load existing blueprint from global settings on mount
// //     useEffect(() => {
// //         if (settings) {
// //             setCustomFields((settings as any)?.employerFormBlueprint?.customFields || []);

// //             const savedVisibility = (settings as any)?.employerFormBlueprint?.coreFieldVisibility || {};
// //             const initialVisibility: Record<string, boolean> = {};
// //             DEFAULT_CORE_FIELDS.forEach(f => {
// //                 initialVisibility[f.id] = savedVisibility[f.id] !== undefined ? savedVisibility[f.id] : true;
// //             });
// //             setCoreVisibility(initialVisibility);
// //         }
// //     }, [settings]);

// //     const toggleCoreField = (id: string) => {
// //         setCoreVisibility(prev => ({ ...prev, [id]: !prev[id] }));
// //     };

// //     const addCustomField = () => {
// //         const newField: CustomFieldBlueprint = {
// //             id: `emp_field_${Date.now()}`,
// //             label: "",
// //             type: "text",
// //             required: false,
// //             options: []
// //         };
// //         setCustomFields([...customFields, newField]);
// //     };

// //     const updateCustomField = (id: string, key: keyof CustomFieldBlueprint, value: any) => {
// //         setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
// //     };

// //     const removeCustomField = (id: string) => {
// //         setCustomFields(prev => prev.filter(f => f.id !== id));
// //     };

// //     const handleSave = async (e: React.FormEvent) => {
// //         e.preventDefault();

// //         const invalidDropdown = customFields.find(f => f.type === 'dropdown' && (!f.options || f.options.length === 0));
// //         if (invalidDropdown) {
// //             toast.error(`Please provide comma-separated options for the dropdown: "${invalidDropdown.label || 'Untitled'}"`);
// //             return;
// //         }

// //         setIsSaving(true);
// //         try {
// //             const cleanedCustomFields = customFields
// //                 .filter(f => f.label.trim() !== "")
// //                 .map(f => ({
// //                     ...f,
// //                     options: f.type === 'dropdown' && f.options ? f.options.map(opt => opt.trim()).filter(Boolean) : []
// //                 }));

// //             await updateSettings({
// //                 ...settings,
// //                 employerFormBlueprint: {
// //                     coreFieldVisibility: coreVisibility,
// //                     customFields: cleanedCustomFields
// //                 }
// //             });

// //             toast.success("Public Employer Application form configured successfully!");
// //             onClose(); // Automatically close modal on success
// //         } catch (error) {
// //             console.error(error);
// //             toast.error("Failed to update application form.");
// //         } finally {
// //             setIsSaving(false);
// //         }
// //     };

// //     // Group core fields by section for rendering
// //     const groupedCoreFields = DEFAULT_CORE_FIELDS.reduce((acc, field) => {
// //         if (!acc[field.section]) acc[field.section] = [];
// //         acc[field.section].push(field);
// //         return acc;
// //     }, {} as Record<string, typeof DEFAULT_CORE_FIELDS>);

// //     return createPortal(
// //         <div className="lfm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999, }}>

// //             <div className="lfm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', height: '90%', width: '95vw', display: 'flex', flexDirection: 'column' }}>

// //                 <div className="lfm-header">
// //                     <h2 className="lfm-header__title">
// //                         <LayoutTemplate size={18} /> Application Form Builder
// //                     </h2>
// //                     <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving} title="Close">
// //                         <X size={20} />
// //                     </button>
// //                 </div>

// //                 <div className="lfm-tabs">
// //                     <button type="button" className={`lfm-tab ${activeTab === 'core' ? "active" : ""}`} onClick={() => setActiveTab('core')} style={{ flex: 1, justifyContent: 'center' }}>
// //                         <ToggleLeft size={14} /> Standard Sections Config
// //                     </button>
// //                     <button type="button" className={`lfm-tab ${activeTab === 'custom' ? "active" : ""}`} onClick={() => setActiveTab('custom')} style={{ flex: 1, justifyContent: 'center' }}>
// //                         <ListPlus size={14} /> Dynamic Custom Questions
// //                         {customFields.length > 0 && <span className={`lfm-tab__badge ${activeTab === 'custom' ? 'active' : ''}`}>{customFields.length}</span>}
// //                     </button>
// //                 </div>

// //                 <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: 'hidden' }}>
// //                     <div className="lfm-body" style={{ background: '#f8fafc' }}>

// //                         {activeTab === 'core' && (
// //                             <>
// //                                 <div className="lfm-error-banner" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e3a8a', marginBottom: '1rem' }}>
// //                                     <ShieldAlert size={16} color="#1d4ed8" />
// //                                     <span><strong>MANDATORY SYSTEM FIELDS:</strong> Fields such as Company Name, Registration Number, Physical Address, Intern Capacity, Contact Person details, and Data Consent are hardcoded as mandatory. They cannot be turned off because the platform's mapping and matching engine relies on them.</span>
// //                                 </div>

// //                                 {Object.entries(groupedCoreFields).map(([section, fields]) => (
// //                                     <div key={section} style={{ marginBottom: '1rem', background: 'white', padding: '1.25rem', border: '1px solid var(--mlab-border)', borderRadius: '6px' }}>
// //                                         <div className="lfm-section-hdr">{section}</div>
// //                                         <div className="lfm-grid">
// //                                             {fields.map(field => (
// //                                                 <label
// //                                                     key={field.id}
// //                                                     className="lfm-checkbox-row"
// //                                                     style={{
// //                                                         background: coreVisibility[field.id] ? '#f0fdf4' : 'var(--mlab-light-blue)',
// //                                                         padding: '0.65rem 0.85rem',
// //                                                         border: `1px solid ${coreVisibility[field.id] ? '#bbf7d0' : 'var(--mlab-border)'}`,
// //                                                         borderRadius: '4px',
// //                                                         margin: 0
// //                                                     }}
// //                                                 >
// //                                                     <input
// //                                                         type="checkbox"
// //                                                         checked={coreVisibility[field.id] || false}
// //                                                         onChange={() => toggleCoreField(field.id)}
// //                                                     />
// //                                                     <span style={{ fontWeight: coreVisibility[field.id] ? 600 : 400 }}>{field.label}</span>
// //                                                 </label>
// //                                             ))}
// //                                         </div>
// //                                     </div>
// //                                 ))}
// //                             </>
// //                         )}

// //                         {activeTab === 'custom' && (
// //                             <>
// //                                 <div className="lfm-section-hdr"><ListPlus size={13} /> Additional Information Configuration</div>
// //                                 <p style={{ fontSize: '0.8rem', color: 'var(--mlab-grey)', margin: '-0.5rem 0 1rem 0' }}>
// //                                     These custom questions will be appended to the bottom of the public application form. Useful for capturing specific Funder or SETA requirements.
// //                                 </p>

// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
// //                                     {customFields.length === 0 && (
// //                                         <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--mlab-bg)', border: '1px dashed var(--mlab-border)', borderRadius: '4px', color: 'var(--mlab-grey)' }}>
// //                                             <ListPlus size={24} style={{ opacity: 0.3, marginBottom: '0.5rem', display: 'block', marginInline: 'auto' }} />
// //                                             <span style={{ fontSize: '0.85rem' }}>No custom questions configured. Click below to add your first dynamic field.</span>
// //                                         </div>
// //                                     )}

// //                                     {customFields.map((field, idx) => (
// //                                         <div key={field.id} className="lfm-flags-panel" style={{ position: 'relative', borderLeftColor: 'var(--mlab-green)', background: 'var(--mlab-white)' }}>
// //                                             <button type="button" onClick={() => removeCustomField(field.id)} style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer' }}>
// //                                                 <Trash2 size={16} />
// //                                             </button>

// //                                             <div className="lfm-grid">
// //                                                 <div className="lfm-fg lfm-fg--full" style={{ paddingRight: '2rem' }}>
// //                                                     <label>Question Label *</label>
// //                                                     <input className="lfm-input" type="text" placeholder="e.g. Do you have a dedicated intern workspace?" value={field.label} onChange={(e) => updateCustomField(field.id, 'label', e.target.value)} required />
// //                                                 </div>

// //                                                 <div className="lfm-fg">
// //                                                     <label>Answer Type *</label>
// //                                                     <select className="lfm-input lfm-select" value={field.type} onChange={(e) => updateCustomField(field.id, 'type', e.target.value)}>
// //                                                         <option value="text">Short Text / Paragraph</option>
// //                                                         <option value="dropdown">Dropdown Options</option>
// //                                                         <option value="checkbox">Yes / No Checkbox</option>
// //                                                     </select>
// //                                                 </div>

// //                                                 <div className="lfm-fg" style={{ justifyContent: 'flex-end', paddingBottom: '0.4rem' }}>
// //                                                     <label className="lfm-checkbox-row" style={{ background: field.required ? '#fef2f2' : 'transparent', padding: field.required ? '0.4rem' : '0', border: field.required ? '1px solid #fecaca' : '1px solid transparent', borderRadius: '4px', width: 'fit-content' }}>
// //                                                         <input type="checkbox" checked={field.required} onChange={(e) => updateCustomField(field.id, 'required', e.target.checked)} />
// //                                                         <span style={{ color: field.required ? 'var(--mlab-red)' : 'var(--mlab-blue)' }}>Required Answer</span>
// //                                                     </label>
// //                                                 </div>

// //                                                 {field.type === 'dropdown' && (
// //                                                     <div className="lfm-fg lfm-fg--full" style={{ marginTop: '0.5rem', background: 'var(--mlab-light-blue)', padding: '0.75rem', border: '1px solid var(--mlab-border)' }}>
// //                                                         <label>Dropdown Options (Comma Separated) *</label>
// //                                                         <input className="lfm-input" type="text" placeholder="e.g. Desk, Lab, Open Plan, Remote" value={field.options?.join(",") || ""} onChange={(e) => updateCustomField(field.id, 'options', e.target.value.split(","))} required />
// //                                                     </div>
// //                                                 )}
// //                                             </div>
// //                                         </div>
// //                                     ))}

// //                                     <button type="button" onClick={addCustomField} className="lfm-btn lfm-btn--ghost" style={{ alignSelf: 'center', marginTop: '0.5rem' }}>
// //                                         <Plus size={14} /> Add New Question
// //                                     </button>
// //                                 </div>
// //                             </>
// //                         )}
// //                     </div>

// //                     <div className="lfm-footer">
// //                         <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>
// //                             Cancel
// //                         </button>
// //                         <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
// //                             {isSaving ? <><Loader2 className="lfm-spin" size={13} /> Saving Blueprint…</> : <><Save size={13} /> Save Form Configuration</>}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };