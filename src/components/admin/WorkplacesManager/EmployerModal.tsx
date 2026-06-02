// src/components/admin/WorkplacesManager/EmployerModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";
import {
    Building2, MapPin, User, X, Loader2, Save,
    ShieldCheck, ShieldAlert, Target, ListPlus, MonitorPlay, FileBadge, Lock, CheckCircle, Zap
} from 'lucide-react';

import { useToast } from '../../../components/common/Toast/Toast';
import type { Employer, CustomFieldBlueprint } from '../../../types';

interface EmployerModalProps {
    editing: Employer | null;
    onClose: () => void;
    onSaved: () => void;
}

export const EmployerModal: React.FC<EmployerModalProps> = ({ editing, onClose, onSaved }) => {
    const toast = useToast();
    const [saving, setSaving] = useState(false);

    const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
    const [customResponses, setCustomResponses] = useState<Record<string, any>>((editing as any)?.customResponses || {});

    const [form, setForm] = useState({
        // Organisation Info
        name: editing?.name || '',
        tradingName: (editing as any)?.tradingName || '',
        registrationNumber: editing?.registrationNumber || '',
        companyType: (editing as any)?.companyType || '',
        vatNumber: (editing as any)?.vatNumber || '',
        bbbeeLevel: (editing as any)?.bbbeeLevel || '',
        website: (editing as any)?.website || '',
        industrySectorStr: Array.isArray((editing as any)?.industrySector) ? (editing as any).industrySector.join(', ') : ((editing as any)?.industrySector || ''),
        businessDescription: (editing as any)?.businessDescription || '',

        // Contact & Capacity
        contactPerson: editing?.contactPerson || '',
        contactEmail: editing?.contactEmail || '',
        contactPhone: editing?.contactPhone || '',
        employeeCount: (editing as any)?.employeeCount || '',
        revenue: (editing as any)?.revenue || '',

        // Hosting Intent & Logistics
        hostedBefore: (editing as any)?.hostedBefore || 'No',
        internCapacity: (editing as any)?.internCapacity || 1,
        specificRolesStr: Array.isArray((editing as any)?.specificRoles) ? (editing as any).specificRoles.join(', ') : ((editing as any)?.specificRoles || ''),
        fundingModel: (editing as any)?.fundingModel || 'We require fully funded placements (SETA / mLab funded)',
        remuneration: (editing as any)?.remuneration || '',
        provideLaptop: (editing as any)?.provideLaptop || 'No',
        expectedStartDate: (editing as any)?.expectedStartDate || '',
        workArrangement: (editing as any)?.workArrangement || 'On-site',
        daysAtOffice: (editing as any)?.daysAtOffice || '',
        likelihoodToHire: (editing as any)?.likelihoodToHire || 'Medium',
        hasDedicatedMentors: (editing as any)?.hasDedicatedMentors || 'No',

        // Digital Needs
        topNeededSolutions: (editing as any)?.topNeededSolutions || '',
        certificationsNeeded: (editing as any)?.certificationsNeeded || '',

        // SETA & Compliance
        taxCompliant: (editing as any)?.taxCompliant || 'Yes',
        bbbeeAwareness: (editing as any)?.bbbeeAwareness || 'Somewhat',
        interestedInBbbee: (editing as any)?.interestedInBbbee || false,
        etiAwareness: (editing as any)?.etiAwareness || false,
        requiresAdvisory: (editing as any)?.requiresAdvisory || false,

        // Referrals & Agreements
        partOfMlabBefore: (editing as any)?.partOfMlabBefore || 'No',
        whereDidYouHear: (editing as any)?.whereDidYouHear || '',
        referredBy: (editing as any)?.referredBy || '',
        interestInED: (editing as any)?.interestInED || false,

        // Legal & Declarations
        willingToSignWBL: (editing as any)?.willingToSignWBL ?? true,
        hasHRPolicies: (editing as any)?.hasHRPolicies ?? false,
        dataConsent: (editing as any)?.dataConsent ?? true,

        // Internal mLab Evaluation
        mlabTier: (editing as any)?.mlabTier || 'Tier 2 (Established SME)',
        mlabRiskRating: (editing as any)?.mlabRiskRating || 'Pending',
        matchingPriorityScore: (editing as any)?.matchingPriorityScore || 50,
        internalNotes: (editing as any)?.internalNotes || '',

        // Location State
        physicalAddress: editing?.physicalAddress || '',
        province: (editing as any)?.province || '',
        lat: editing?.lat || null as number | null,
        lng: editing?.lng || null as number | null,
    });

    useEffect(() => {
        const fetchBlueprint = async () => {
            try {
                const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
                if (settingsSnap.exists()) {
                    const data = settingsSnap.data();
                    if (data.employerFormBlueprint?.customFields) {
                        setCustomFields(data.employerFormBlueprint.customFields);
                    }
                }
            } catch (err) {
                console.error("Failed to load blueprint", err);
            }
        };
        fetchBlueprint();
    }, []);

    const handlePlaceSelected = (place: any) => {
        let newLat = form.lat;
        let newLng = form.lng;
        if (place.geometry?.location) {
            newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
        }
        const components = place.address_components;
        const provString = components?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
        setForm(p => ({ ...p, physicalAddress: place.formatted_address || "", province: provString, lat: newLat, lng: newLng }));
    };

    const handleCustomResponseChange = (fieldId: string, value: any) => {
        setCustomResponses(prev => ({ ...prev, [fieldId]: value }));
    };

    // 🤖 HIGHLY DETAILED AUTO-ASSESSMENT ENGINE 🤖
    const runAutoAssessment = () => {
        let tier = "Tier 2 (Established SME)";
        let risk = "Medium";
        let score = 30; // Base standard score
        const notes: string[] = [];

        notes.push(`[System Auto-Assessment | ${new Date().toLocaleDateString()}]`);

        // --- 1. ASSESS TIER ---
        notes.push("\n--- TIER JUSTIFICATION ---");
        const empCount = parseInt(form.employeeCount) || 0;
        const rev = form.revenue || "";

        if (empCount >= 50 || rev.includes("Over R50 Million")) {
            tier = "Tier 1 (Enterprise)";
            notes.push(`• Tier 1 assigned: High capacity metrics detected (${empCount} employees / ${rev}).`);
        } else if (empCount < 10 || rev.includes("Under R1 Million") || rev.includes("Pre-Revenue")) {
            tier = "Tier 3 (Startup/Micro)";
            notes.push(`• Tier 3 assigned: Micro/Startup metrics detected (${empCount} employees / ${rev}).`);
        } else {
            notes.push(`• Tier 2 assigned: Fits standard SME baseline.`);
        }

        // --- 2. ASSESS RISK ---
        notes.push("\n--- RISK JUSTIFICATION ---");
        if (!form.willingToSignWBL) {
            risk = "Critical";
            notes.push("• [CRITICAL FLAG]: Partner is unwilling to sign WBL agreements. Dealbreaker for SETA compliance.");
        } else if (form.taxCompliant === "No" || !form.hasHRPolicies) {
            risk = "High";
            if (form.taxCompliant === "No") notes.push("• [HIGH RISK]: Partner is currently not tax compliant. ETI/Stipends at risk.");
            if (!form.hasHRPolicies) notes.push("• [HIGH RISK]: Partner lacks fundamental HR and Code of Conduct policies.");
        } else if (form.taxCompliant === "In progress") {
            risk = "Medium";
            notes.push("• [MEDIUM RISK]: Tax compliance is pending/in-progress. Requires verification before contracting.");
        } else {
            risk = "Low";
            notes.push("• Low Risk: Partner is tax compliant, has HR policies, and is willing to sign WBL.");
        }

        // --- 3. ASSESS PRIORITY SCORE ---
        notes.push("\n--- PRIORITY SCORE JUSTIFICATION ---");
        notes.push("• Starting Base Score: 30 pts");

        const funding = form.fundingModel || "";
        if (funding.includes("ourselves") || funding.includes("fully fund")) {
            score += 25;
            notes.push("• +25 pts: Partner is fully funding placements independently.");
        } else if (funding.includes("co-fund") || funding.includes("top-up")) {
            score += 15;
            notes.push("• +15 pts: Partner is willing to co-fund/top-up stipends.");
        } else {
            notes.push("• +0 pts: Partner requires fully mLab/SETA funded placements.");
        }

        const likelihood = form.likelihoodToHire || "";
        if (likelihood.includes("High")) {
            score += 15;
            notes.push("• +15 pts: High likelihood of permanent job offers post-placement.");
        }

        if (form.provideLaptop === "Yes") {
            score += 15;
            notes.push("• +15 pts: Organisation is providing hardware (Laptops) to learners.");
        }

        const mentors = form.hasDedicatedMentors || "";
        if (mentors.includes("Yes")) {
            score += 10;
            notes.push("• +10 pts: Dedicated mentorship capacity is explicitly assigned.");
        }

        if (form.interestedInBbbee) {
            score += 5;
            notes.push("• +5 pts: Partner is strategically driven by B-BBEE / SETA compliance points.");
        }

        const finalScore = Math.min(score, 100);
        notes.push(`\n=> Final Algorithm Score: ${finalScore}/100`);

        // Safely wipe out older auto-assessments so we don't infinitely stack them, but keep manual notes
        let existingNotes = form.internalNotes || "";
        if (existingNotes.includes("--- MANUAL STAFF NOTES ---")) {
            existingNotes = existingNotes.split("--- MANUAL STAFF NOTES ---")[1].trim();
        } else if (existingNotes.includes("[System Auto-Assessment")) {
            existingNotes = "";
        }

        const newNotesText = existingNotes
            ? `${notes.join('\n')}\n\n--- MANUAL STAFF NOTES ---\n${existingNotes}`
            : notes.join('\n');

        setForm(p => ({
            ...p,
            mlabTier: tier,
            mlabRiskRating: risk,
            matchingPriorityScore: finalScore,
            internalNotes: newNotesText
        }));

        toast.info("Detailed assessment generated! Review the internal notes below.");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const finalForm = {
                ...form,
                industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                specificRoles: form.specificRolesStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                customResponses
            };
            delete (finalForm as any).industrySectorStr;
            delete (finalForm as any).specificRolesStr;

            await updateDoc(doc(db, 'employers', editing!.id), { ...finalForm, updatedAt: new Date().toISOString() });
            toast.success('Employer profile synchronized.');
            onSaved();
            onClose();
        } catch {
            toast.error('Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleApproveAndSave = async () => {
        setSaving(true);
        try {
            const finalForm = {
                ...form,
                industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                specificRoles: form.specificRolesStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                status: 'active'
            };
            await updateDoc(doc(db, 'employers', editing!.id), { ...finalForm, updatedAt: new Date().toISOString() });
            toast.success('Partner Application Approved!');
            onSaved();
            onClose();
        } catch { toast.error('Approval failed.'); } finally { setSaving(false); }
    };

    const isLocked = !!editing;
    const isPending = editing && (editing as any).status === 'Pending Review';

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>

                {/* HEADER */}
                <div className="wm-modal__header" style={{ flexShrink: 0 }}>
                    <div className="wm-modal__header-icon"><Building2 size={20} /></div>
                    <div>
                        <h2 className="wm-modal__title">{editing ? 'Review Partner Profile' : 'Onboard Partner'}</h2>
                        <p className="wm-modal__subtitle">Organisation data and internal matrix assessment</p>
                    </div>
                    <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
                </div>

                {/* SCROLLABLE BODY */}
                <form id="employer-modal-form" onSubmit={handleSubmit} className="wm-modal__form" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <div className="wm-modal__body" style={{ background: '#f8fafc', overflowY: 'auto', padding: '1.5rem' }}>

                        {/* SECTION 1-6: REVERTED TO STANDARD BLUE STYLING */}
                        <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                            <div className="wm-form-section__label"><Building2 size={14} color="var(--mlab-blue)" /> Organisation Handles</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group"><label className="wm-form-label">Business Name *</label><input className="wm-form-input" required type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Trading Name</label><input className="wm-form-input" type="text" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">CIPC / Reg Number</label><input className="wm-form-input" type="text" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">VAT Number</label><input className="wm-form-input" type="text" value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} /></div>
                                <div className="wm-form-group wm-form-group--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}><MapPin size={13} /> Office Location Autocomplete</label>
                                    <Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ componentRestrictions: { country: "za" } }} className="wm-form-input" defaultValue={form.physicalAddress} />
                                </div>
                            </div>
                        </div>

                        {/* SECTION 2: CONTACT */}
                        <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                            <div className="wm-form-section__label"><User size={14} color="var(--mlab-blue)" /> Contact Details</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group"><label className="wm-form-label">Contact Person *</label><input className="wm-form-input" required type="text" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Email *</label><input className="wm-form-input" required type="email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Phone</label><input className="wm-form-input" required type="text" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} /></div>
                            </div>
                        </div>

                        {/* SECTION 3: HOSTING LOGISTICS */}
                        <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                            <div className="wm-form-section__label"><Target size={14} color="var(--mlab-blue)" /> Hosting Intent</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group"><label className="wm-form-label">Intern Capacity *</label><input className="wm-form-input" required type="number" value={form.internCapacity} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Work Arrangement</label><select className="wm-form-input" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}><option value="On-site">On-site</option><option value="Hybrid">Hybrid</option><option value="Remote">Remote</option></select></div>
                                <div className="wm-form-group wm-form-group--full"><label className="wm-form-label">Specific Roles (Comma Separated)</label><input className="wm-form-input" type="text" value={form.specificRolesStr} onChange={e => setForm(p => ({ ...p, specificRolesStr: e.target.value }))} /></div>
                            </div>
                        </div>

                        {/* SECTION 8: THE "SLIDE" AREA - WARM COLOURS IMPLEMENTED HERE */}
                        <div className="wm-form-section" style={{ background: '#fffbeb', padding: '1.5rem', borderRadius: '12px', border: '1px solid #fde68a', marginTop: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
                            <div className="wm-form-section__label" style={{ color: '#92400e', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #fef3c7', paddingBottom: '10px', marginBottom: '1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 700 }}>
                                    <Target size={16} color="#d97706" /> Internal Evaluation Matrix (Staff Restricted)
                                </div>
                                <button type="button" onClick={runAutoAssessment} style={{ background: '#fbbf24', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 2px 4px rgba(217, 119, 6, 0.2)' }}>
                                    <Zap size={12} fill="currentColor" /> Run Auto-Assessment
                                </button>
                            </div>

                            <div className="wm-form-grid">
                                <div className="wm-form-group">
                                    <label className="wm-form-label" style={{ color: '#b45309' }}>mLab Portfolio Tier</label>
                                    <select className="wm-form-input" style={{ background: '#fff', borderColor: '#fcd34d' }} value={form.mlabTier} onChange={e => setForm(p => ({ ...p, mlabTier: e.target.value }))}>
                                        <option value="Tier 1 (Enterprise)">Tier 1 (Enterprise)</option>
                                        <option value="Tier 2 (Established SME)">Tier 2 (SME)</option>
                                        <option value="Tier 3 (Startup/Micro)">Tier 3 (Startup)</option>
                                    </select>
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label" style={{ color: '#b45309' }}>Compliance Risk Rating</label>
                                    <select className="wm-form-input" style={{ background: '#fff', borderColor: '#fcd34d' }} value={form.mlabRiskRating} onChange={e => setForm(p => ({ ...p, mlabRiskRating: e.target.value }))}>
                                        <option value="Low">Low Risk</option>
                                        <option value="Medium">Medium Risk</option>
                                        <option value="High">High Risk</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>

                                {/* THE ACTUAL SLIDER (WARM COLOURS) */}
                                <div className="wm-form-group wm-form-group--full" style={{ marginTop: '1rem', background: '#fef3c7', padding: '1.5rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <label className="wm-form-label" style={{ color: '#92400e', marginBottom: 0, fontWeight: 700 }}>Matching Priority Score</label>
                                        <div style={{ background: '#d97706', color: 'white', padding: '4px 12px', borderRadius: '20px', fontSize: '1.1rem', fontWeight: 900, boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                            {form.matchingPriorityScore}%
                                        </div>
                                    </div>

                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={form.matchingPriorityScore}
                                        onChange={e => setForm(p => ({ ...p, matchingPriorityScore: parseInt(e.target.value) }))}
                                        style={{
                                            width: '100%',
                                            accentColor: '#ea580c',
                                            height: '8px',
                                            cursor: 'pointer'
                                        }}
                                    />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '0.7rem', color: '#b45309', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        <span>Baseline (0)</span>
                                        <span>Standard (50)</span>
                                        <span>High Priority (100)</span>
                                    </div>
                                </div>

                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label" style={{ color: '#b45309' }}>Internal Assessment Notes</label>
                                    <textarea className="wm-form-input" rows={10} style={{ background: '#fff', borderColor: '#fcd34d', fontFamily: 'monospace', fontSize: '0.8rem', lineHeight: 1.5 }} value={form.internalNotes} onChange={e => setForm(p => ({ ...p, internalNotes: e.target.value }))} />
                                </div>
                            </div>
                        </div>

                    </div>

                    {/* FOOTER */}
                    <div className="wm-modal__footer" style={{ flexShrink: 0, background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                        <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Dismiss</button>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
                                {saving ? <Loader2 className="wm-spin" size={14} /> : 'Save Changes'}
                            </button>
                            {isPending && (
                                <button type="button" className="wm-btn wm-btn--primary" onClick={handleApproveAndSave} disabled={saving} style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green-dark)' }}>
                                    {saving ? <Loader2 className="wm-spin" size={14} /> : <><CheckCircle size={14} /> Approve Partner</>}
                                </button>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};


// // src/components/admin/WorkplacesManager/EmployerModal.tsx

// import React, { useState, useEffect } from 'react';
// import { createPortal } from 'react-dom';
// import { collection, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
// import { db } from '../../../lib/firebase';
// import Autocomplete from "react-google-autocomplete";
// import {
//     Building2, MapPin, User, X, Loader2, Save,
//     ShieldCheck, ShieldAlert, Target, ListPlus, MonitorPlay, FileBadge, Lock, CheckCircle
// } from 'lucide-react';

// import { useToast } from '../../../components/common/Toast/Toast';
// import type { Employer, CustomFieldBlueprint } from '../../../types';

// interface EmployerModalProps {
//     editing: Employer | null;
//     onClose: () => void;
//     onSaved: () => void;
// }

// export const EmployerModal: React.FC<EmployerModalProps> = ({ editing, onClose, onSaved }) => {
//     const toast = useToast();
//     const [saving, setSaving] = useState(false);

//     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
//     const [customResponses, setCustomResponses] = useState<Record<string, any>>((editing as any)?.customResponses || {});

//     // We use temporary string fields for arrays to make admin editing easier
//     const [form, setForm] = useState({
//         // Organisation Info
//         name: editing?.name || '',
//         tradingName: (editing as any)?.tradingName || '',
//         registrationNumber: editing?.registrationNumber || '',
//         companyType: (editing as any)?.companyType || '',
//         vatNumber: (editing as any)?.vatNumber || '',
//         bbbeeLevel: (editing as any)?.bbbeeLevel || '',
//         website: (editing as any)?.website || '',
//         industrySectorStr: Array.isArray((editing as any)?.industrySector) ? (editing as any).industrySector.join(', ') : ((editing as any)?.industrySector || ''),
//         businessDescription: (editing as any)?.businessDescription || '',

//         // Contact & Capacity
//         contactPerson: editing?.contactPerson || '',
//         contactEmail: editing?.contactEmail || '',
//         contactPhone: editing?.contactPhone || '',
//         employeeCount: (editing as any)?.employeeCount || '',
//         revenue: (editing as any)?.revenue || '',

//         // Hosting Intent & Logistics
//         hostedBefore: (editing as any)?.hostedBefore || 'No',
//         internCapacity: (editing as any)?.internCapacity || 1,
//         specificRolesStr: Array.isArray((editing as any)?.specificRoles) ? (editing as any).specificRoles.join(', ') : ((editing as any)?.specificRoles || ''),
//         fundingModel: (editing as any)?.fundingModel || 'We require fully funded placements (SETA / mLab funded)',
//         remuneration: (editing as any)?.remuneration || '',
//         provideLaptop: (editing as any)?.provideLaptop || 'No',
//         expectedStartDate: (editing as any)?.expectedStartDate || '',
//         workArrangement: (editing as any)?.workArrangement || 'On-site',
//         daysAtOffice: (editing as any)?.daysAtOffice || '',
//         likelihoodToHire: (editing as any)?.likelihoodToHire || 'Medium',
//         hasDedicatedMentors: (editing as any)?.hasDedicatedMentors || 'No',

//         // Digital Needs
//         topNeededSolutions: (editing as any)?.topNeededSolutions || '',
//         certificationsNeeded: (editing as any)?.certificationsNeeded || '',

//         // SETA & Compliance
//         taxCompliant: (editing as any)?.taxCompliant || 'Yes',
//         bbbeeAwareness: (editing as any)?.bbbeeAwareness || 'Somewhat',
//         interestedInBbbee: (editing as any)?.interestedInBbbee || false,
//         etiAwareness: (editing as any)?.etiAwareness || false,
//         requiresAdvisory: (editing as any)?.requiresAdvisory || false,

//         // Referrals & Agreements
//         partOfMlabBefore: (editing as any)?.partOfMlabBefore || 'No',
//         whereDidYouHear: (editing as any)?.whereDidYouHear || '',
//         referredBy: (editing as any)?.referredBy || '',
//         interestInED: (editing as any)?.interestInED || false,

//         // Legal & Declarations (Locked upon editing)
//         willingToSignWBL: (editing as any)?.willingToSignWBL ?? true,
//         hasHRPolicies: (editing as any)?.hasHRPolicies ?? false,
//         dataConsent: (editing as any)?.dataConsent ?? true,

//         // Internal mLab Evaluation
//         mlabTier: (editing as any)?.mlabTier || 'Tier 2 (Established SME)',
//         mlabRiskRating: (editing as any)?.mlabRiskRating || 'Pending',
//         matchingPriorityScore: (editing as any)?.matchingPriorityScore || 50,
//         internalNotes: (editing as any)?.internalNotes || '',

//         // Location State
//         physicalAddress: editing?.physicalAddress || '',
//         province: (editing as any)?.province || '',
//         lat: editing?.lat || null as number | null,
//         lng: editing?.lng || null as number | null,
//     });

//     useEffect(() => {
//         const fetchBlueprint = async () => {
//             try {
//                 const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
//                 if (settingsSnap.exists()) {
//                     const data = settingsSnap.data();
//                     if (data.employerFormBlueprint?.customFields) {
//                         setCustomFields(data.employerFormBlueprint.customFields);
//                     }
//                 }
//             } catch (err) {
//                 console.error("Failed to load blueprint", err);
//             }
//         };
//         fetchBlueprint();
//     }, []);

//     const handlePlaceSelected = (place: any) => {
//         let newLat = form.lat;
//         let newLng = form.lng;

//         if (place.geometry?.location) {
//             newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
//             newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
//         }

//         const components = place.address_components;
//         const provString = components?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
//         const formatted = place.formatted_address || "";

//         setForm(p => ({
//             ...p,
//             physicalAddress: formatted,
//             province: provString,
//             lat: newLat,
//             lng: newLng
//         }));
//     };

//     const handleCustomResponseChange = (fieldId: string, value: any) => {
//         setCustomResponses(prev => ({ ...prev, [fieldId]: value }));
//     };

//     // STANDARD SAVE (Keeps status as is)
//     const handleSubmit = async (e: React.FormEvent) => {
//         e.preventDefault();
//         setSaving(true);
//         try {
//             const finalForm = {
//                 ...form,
//                 industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
//                 specificRoles: form.specificRolesStr.split(',').map((s: any) => s.trim()).filter(Boolean),
//                 customResponses
//             };

//             delete (finalForm as any).industrySectorStr;
//             delete (finalForm as any).specificRolesStr;

//             if (editing) {
//                 await updateDoc(doc(db, 'employers', editing.id), { ...finalForm, updatedAt: new Date().toISOString() });
//                 toast.success('Workplace Partner database attributes synchronized successfully.');
//             } else {
//                 const ref = doc(collection(db, 'employers'));
//                 await setDoc(ref, { ...finalForm, id: ref.id, status: 'active', createdAt: new Date().toISOString() });
//                 toast.success('New internal Partner node safely instantiated.');
//             }
//             onSaved();
//             onClose();
//         } catch {
//             toast.error('Failed to parse database write operation.');
//         } finally {
//             setSaving(false);
//         }
//     };

//     // EXPLICIT APPROVE & SAVE (Changes status to active)
//     const handleApproveAndSave = async () => {
//         if (!editing) return;
//         setSaving(true);
//         try {
//             const finalForm = {
//                 ...form,
//                 industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
//                 specificRoles: form.specificRolesStr.split(',').map((s: any) => s.trim()).filter(Boolean),
//                 customResponses,
//                 status: 'active' // FORCE APPROVAL
//             };

//             delete (finalForm as any).industrySectorStr;
//             delete (finalForm as any).specificRolesStr;

//             await updateDoc(doc(db, 'employers', editing.id), { ...finalForm, updatedAt: new Date().toISOString() });
//             toast.success('Application officially approved and synchronized!');
//             onSaved();
//             onClose();
//         } catch {
//             toast.error('Failed to parse database write operation.');
//         } finally {
//             setSaving(false);
//         }
//     };

//     // Helper flag: True if we are viewing an existing submitted application
//     const isLocked = !!editing;
//     const isPending = editing && (editing as any).status === 'Pending Review';

//     return createPortal(
//         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
//             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '850px', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>

//                 {/* HEADER */}
//                 <div className="wm-modal__header" style={{ flexShrink: 0 }}>
//                     <div className="wm-modal__header-icon"><Building2 size={20} /></div>
//                     <div>
//                         <h2 className="wm-modal__title">{editing ? 'Review / Edit Host Application' : 'Onboard Partner Entity'}</h2>
//                         <p className="wm-modal__subtitle">Enterprise structural records & Expression of Interest (EOI) data</p>
//                     </div>
//                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
//                 </div>

//                 {/* SCROLLABLE BODY */}
//                 <form id="employer-modal-form" onSubmit={handleSubmit} className="wm-modal__form" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
//                     <div className="wm-modal__body" style={{ background: '#f8fafc', overflowY: 'auto', padding: '1.5rem' }}>

//                         {/* SECTION 1: ORG INFO */}
//                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><Building2 size={14} color="var(--mlab-blue)" /> Organisation Registry Handles</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Business Name *</label>
//                                     <input className="wm-form-input" required type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Trading Name</label>
//                                     <input className="wm-form-input" type="text" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">CIPC Registration Signature</label>
//                                     <input className="wm-form-input" type="text" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Type of Business</label>
//                                     <input className="wm-form-input" type="text" value={form.companyType} onChange={e => setForm(p => ({ ...p, companyType: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">VAT Number</label>
//                                     <input className="wm-form-input" type="text" value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Website</label>
//                                     <input className="wm-form-input" type="text" value={form.website} onChange={e => setForm(p => ({ ...p, website: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Industry Sectors (Comma Separated)</label>
//                                     <input className="wm-form-input" type="text" value={form.industrySectorStr} onChange={e => setForm(p => ({ ...p, industrySectorStr: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Brief Business Description</label>
//                                     <textarea className="wm-form-input" rows={2} value={form.businessDescription} onChange={e => setForm(p => ({ ...p, businessDescription: e.target.value }))} />
//                                 </div>

//                                 <div className="wm-form-group wm-form-group--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}>
//                                         <MapPin size={13} /> Geospatial Coordinates Autocomplete Validation *
//                                     </label>
//                                     <Autocomplete
//                                         apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                         onPlaceSelected={handlePlaceSelected}
//                                         options={{ componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address"] }}
//                                         className="wm-form-input"
//                                         placeholder={form.physicalAddress || "Resolve location markers..."}
//                                         defaultValue={form.physicalAddress}
//                                     />
//                                     {form.lat && (
//                                         <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                             <ShieldCheck size={14} /> GIS Markers Anchored. (Lat: {form.lat.toFixed(4)}, Lng: {form.lng?.toFixed(4)})
//                                         </div>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 2: CONTACT & CAPACITY */}
//                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><User size={14} color="var(--mlab-blue)" /> Contact & Team Capacity</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Primary Stakeholder Name *</label>
//                                     <input className="wm-form-input" required type="text" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Contact Endpoint Mail *</label>
//                                     <input className="wm-form-input" required type="email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Contact Phone</label>
//                                     <input className="wm-form-input" required type="text" value={form.contactPhone} onChange={e => setForm(p => ({ ...p, contactPhone: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Current Team Size</label>
//                                     <input className="wm-form-input" type="text" value={form.employeeCount} onChange={e => setForm(p => ({ ...p, employeeCount: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Business Annual Revenue</label>
//                                     <input className="wm-form-input" type="text" value={form.revenue} onChange={e => setForm(p => ({ ...p, revenue: e.target.value }))} />
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 3: HOSTING INTENT & LOGISTICS */}
//                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><Target size={14} color="var(--mlab-blue)" /> Hosting Intent & Logistics</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Intern Seat Allocation Upper Bound *</label>
//                                     <input className="wm-form-input" required type="number" style={{ background: '#f0f9ff', fontWeight: 'bold' }} value={form.internCapacity} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Hosted placements before?</label>
//                                     <select className="wm-form-input" value={form.hostedBefore} onChange={e => setForm(p => ({ ...p, hostedBefore: e.target.value }))}>
//                                         <option value="Yes">Yes</option>
//                                         <option value="No">No</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Specific roles looking to fill (Comma separated)</label>
//                                     <input className="wm-form-input" type="text" value={form.specificRolesStr} onChange={e => setForm(p => ({ ...p, specificRolesStr: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Placement Funding Model</label>
//                                     <input className="wm-form-input" type="text" value={form.fundingModel} onChange={e => setForm(p => ({ ...p, fundingModel: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Monthly Remuneration / Top-up</label>
//                                     <input className="wm-form-input" type="text" value={form.remuneration} onChange={e => setForm(p => ({ ...p, remuneration: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Provide a laptop to candidates?</label>
//                                     <select className="wm-form-input" value={form.provideLaptop} onChange={e => setForm(p => ({ ...p, provideLaptop: e.target.value }))}>
//                                         <option value="Yes">Yes</option>
//                                         <option value="No">No</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Ideal Start Date</label>
//                                     <input className="wm-form-input" type="text" value={form.expectedStartDate} onChange={e => setForm(p => ({ ...p, expectedStartDate: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Work Arrangement Mode</label>
//                                     <select className="wm-form-input" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
//                                         <option value="On-site">On-site Execution</option>
//                                         <option value="Hybrid">Hybrid Pipeline</option>
//                                         <option value="Remote">Fully Dispersed (Remote)</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Days per week at the office?</label>
//                                     <input className="wm-form-input" type="text" value={form.daysAtOffice} onChange={e => setForm(p => ({ ...p, daysAtOffice: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Likelihood to offer a job post-placement?</label>
//                                     <input className="wm-form-input" type="text" value={form.likelihoodToHire} onChange={e => setForm(p => ({ ...p, likelihoodToHire: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Dedicated Mentors Available?</label>
//                                     <select className="wm-form-input" value={form.hasDedicatedMentors} onChange={e => setForm(p => ({ ...p, hasDedicatedMentors: e.target.value }))}>
//                                         <option value="Yes">Yes, assigned capacity</option>
//                                         <option value="Partially">Partially / Shared</option>
//                                         <option value="No">No</option>
//                                     </select>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 4: DIGITAL NEEDS */}
//                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><MonitorPlay size={14} color="var(--mlab-blue)" /> Business Digitisation Needs</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Top Needed Digital Solutions</label>
//                                     <input className="wm-form-input" type="text" value={form.topNeededSolutions} onChange={e => setForm(p => ({ ...p, topNeededSolutions: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Preferred Certifications for Talent</label>
//                                     <input className="wm-form-input" type="text" value={form.certificationsNeeded} onChange={e => setForm(p => ({ ...p, certificationsNeeded: e.target.value }))} />
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 5: SETA & COMPLIANCE */}
//                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', color: 'black', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><FileBadge size={14} color="var(--mlab-blue)" /> SETA, B-BBEE & Compliance</div>
//                             <div className="wm-form-grid">
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
//                                     <input type="checkbox" checked={form.interestedInBbbee} onChange={e => setForm(p => ({ ...p, interestedInBbbee: e.target.checked }))} />
//                                     Primary goal is B-BBEE / SETA compliance
//                                 </label>
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
//                                     <input type="checkbox" checked={form.etiAwareness} onChange={e => setForm(p => ({ ...p, etiAwareness: e.target.checked }))} />
//                                     Aware of / claiming Employment Tax Incentive (ETI)
//                                 </label>
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
//                                     <input type="checkbox" checked={form.requiresAdvisory} onChange={e => setForm(p => ({ ...p, requiresAdvisory: e.target.checked }))} />
//                                     Requires mLab Advisory Support
//                                 </label>

//                                 <div className="wm-form-group" style={{ marginTop: '0.5rem' }}>
//                                     <label className="wm-form-label">Tax Compliance Status</label>
//                                     <input className="wm-form-input" type="text" value={form.taxCompliant} onChange={e => setForm(p => ({ ...p, taxCompliant: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group" style={{ marginTop: '0.5rem' }}>
//                                     <label className="wm-form-label">Familiarity with B-BBEE</label>
//                                     <input className="wm-form-input" type="text" value={form.bbbeeAwareness} onChange={e => setForm(p => ({ ...p, bbbeeAwareness: e.target.value }))} />
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 6: REFERRALS & AGREEMENTS */}
//                         <div className="wm-form-section" style={{ background: 'white', color: 'black', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                             <div className="wm-form-section__label"><ShieldAlert size={14} color="var(--mlab-blue)" /> Referrals & Agreements</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Previously part of an mLab initiative?</label>
//                                     <input className="wm-form-input" type="text" value={form.partOfMlabBefore} onChange={e => setForm(p => ({ ...p, partOfMlabBefore: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Where did you hear about us?</label>
//                                     <input className="wm-form-input" type="text" value={form.whereDidYouHear} onChange={e => setForm(p => ({ ...p, whereDidYouHear: e.target.value }))} />
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Referred By</label>
//                                     <input className="wm-form-input" type="text" value={form.referredBy} onChange={e => setForm(p => ({ ...p, referredBy: e.target.value }))} />
//                                 </div>

//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', gridColumn: '1 / -1' }}>
//                                     <input type="checkbox" checked={form.interestInED} onChange={e => setForm(p => ({ ...p, interestInED: e.target.checked }))} />
//                                     Interested in Enterprise Development Programme
//                                 </label>

//                                 {/* LOCKED COMPLIANCE FIELDS */}
//                                 <div className="wm-form-group wm-form-group--full" style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '0.5rem' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
//                                         <ShieldCheck size={14} color="#15803d" />
//                                         <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#15803d', textTransform: 'uppercase' }}>Legal & Compliance Declarations</span>
//                                     </div>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', opacity: isLocked ? 0.6 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}>
//                                         <input type="checkbox" disabled={isLocked} checked={form.willingToSignWBL} onChange={e => setForm(p => ({ ...p, willingToSignWBL: e.target.checked }))} />
//                                         Willing to sign formal WBL Agreements
//                                         {isLocked && <span style={{ marginLeft: 'auto' }} title="Locked for audit purposes"><Lock size={12} color="#64748b" /></span>}
//                                     </label>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', opacity: isLocked ? 0.6 : 1, cursor: isLocked ? 'not-allowed' : 'pointer' }}>
//                                         <input type="checkbox" disabled={isLocked} checked={form.hasHRPolicies} onChange={e => setForm(p => ({ ...p, hasHRPolicies: e.target.checked }))} />
//                                         Has basic HR policies and Code of Conduct
//                                         {isLocked && <span style={{ marginLeft: 'auto' }} title="Locked for audit purposes"><Lock size={12} color="#64748b" /></span>}
//                                     </label>

//                                     <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', opacity: isLocked ? 0.6 : 1, cursor: isLocked ? 'not-allowed' : 'pointer', borderTop: '1px solid #e2e8f0', paddingTop: '8px' }}>
//                                         <input type="checkbox" disabled={isLocked} checked={form.dataConsent} onChange={e => setForm(p => ({ ...p, dataConsent: e.target.checked }))} />
//                                         <strong>Consented to Data Processing (POPIA)</strong>
//                                         {isLocked && <span style={{ marginLeft: 'auto' }} title="Locked for audit purposes"><Lock size={12} color="#64748b" /></span>}
//                                     </label>

//                                     {isLocked && (
//                                         <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic' }}>
//                                             * Legal declarations are locked after submission to maintain audit integrity. Please attach an internal note if the client formally withdraws consent.
//                                         </p>
//                                     )}
//                                 </div>
//                             </div>
//                         </div>

//                         {/* SECTION 7: CUSTOM FIELDS */}
//                         {customFields.length > 0 && (
//                             <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
//                                 <div className="wm-form-section__label"><ListPlus size={14} color="var(--mlab-blue)" /> Custom Funder Questions Logs</div>
//                                 <div className="wm-form-grid" style={{ gridTemplateColumns: '1fr' }}>
//                                     {customFields.map((field) => (
//                                         <div key={field.id} className="wm-form-group">
//                                             <label className="wm-form-label">{field.label}</label>
//                                             {field.type === 'text' && (
//                                                 <input className="wm-form-input" type="text" value={customResponses[field.id] || ''} onChange={(e) => handleCustomResponseChange(field.id, e.target.value)} />
//                                             )}
//                                             {field.type === 'dropdown' && (
//                                                 <select className="wm-form-input" value={customResponses[field.id] || ''} onChange={(e) => handleCustomResponseChange(field.id, e.target.value)}>
//                                                     <option value="">-- No Value Mapped --</option>
//                                                     {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
//                                                 </select>
//                                             )}
//                                             {field.type === 'checkbox' && (
//                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
//                                                     <input type="checkbox" checked={!!customResponses[field.id]} onChange={(e) => handleCustomResponseChange(field.id, e.target.checked)} />
//                                                     Confirmed
//                                                 </label>
//                                             )}
//                                         </div>
//                                     ))}
//                                 </div>
//                             </div>
//                         )}

//                         {/* SECTION 8: MLAB INTERNAL SCORECARD (ADMIN ONLY) */}
//                         <div className="wm-form-section" style={{ background: '#eff6ff', padding: '1.25rem', borderRadius: '8px', border: '1px solid #bfdbfe', marginTop: '1rem' }}>
//                             <div className="wm-form-section__label" style={{ color: '#1e3a8a' }}><Target size={14} color="#1e3a8a" /> Internal Evaluation Matrix (Staff Restricted)</div>
//                             <div className="wm-form-grid">
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">mLab Portfolio Tier Placement</label>
//                                     <select className="wm-form-input" value={form.mlabTier} onChange={e => setForm(p => ({ ...p, mlabTier: e.target.value }))}>
//                                         <option value="Tier 1 (Enterprise)">Tier 1 (Enterprise / Corporate)</option>
//                                         <option value="Tier 2 (Established SME)">Tier 2 (Established SME)</option>
//                                         <option value="Tier 3 (Startup/Micro)">Tier 3 (Startup / Micro)</option>
//                                         <option value="Pending Assessment">Pending Assessment</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group">
//                                     <label className="wm-form-label">Ecosystem Compliance Risk Rating</label>
//                                     <select className="wm-form-input" style={{ borderColor: form.mlabRiskRating === 'High' || form.mlabRiskRating === 'Critical' ? '#fca5a5' : '#cbd5e1', background: form.mlabRiskRating === 'High' || form.mlabRiskRating === 'Critical' ? '#fef2f2' : 'white', fontWeight: 'bold', color: form.mlabRiskRating === 'High' || form.mlabRiskRating === 'Critical' ? '#b91c1c' : 'inherit' }} value={form.mlabRiskRating} onChange={e => setForm(p => ({ ...p, mlabRiskRating: e.target.value }))}>
//                                         <option value="Low">Low Risk Threshold</option>
//                                         <option value="Medium">Medium Variance</option>
//                                         <option value="High">High Exposure Caution</option>
//                                         <option value="Critical">Critical Constraint Locked</option>
//                                         <option value="Pending">Pending Evaluation</option>
//                                     </select>
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Matching Priority Score (0-100) <span style={{ textTransform: 'none', color: '#64748b', fontWeight: 400 }}>Higher score = algorithm prioritizes them first.</span></label>
//                                     <input className="wm-form-input" type="range" min="0" max="100" value={form.matchingPriorityScore} onChange={e => setForm(p => ({ ...p, matchingPriorityScore: parseInt(e.target.value) }))} style={{ width: '100%', accentColor: '#2563eb' }} />
//                                     <div style={{ textAlign: 'center', fontSize: '1.2rem', fontWeight: 800, color: '#1d4ed8' }}>{form.matchingPriorityScore} / 100</div>
//                                 </div>
//                                 <div className="wm-form-group wm-form-group--full">
//                                     <label className="wm-form-label">Internal Assessment Notes</label>
//                                     <textarea className="wm-form-input" rows={3} placeholder="Observations on capacity, past performance, or compliance issues..." value={form.internalNotes} onChange={e => setForm(p => ({ ...p, internalNotes: e.target.value }))} style={{ borderColor: '#bfdbfe' }} />
//                                 </div>
//                             </div>
//                         </div>

//                     </div>

//                     {/* FOOTER */}
//                     <div className="wm-modal__footer" style={{ flexShrink: 0 }}>
//                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Dismiss</button>
//                         <div style={{ display: 'flex', gap: '8px' }}>
//                             <button type="submit" form="employer-modal-form" className="wm-btn wm-btn--primary" disabled={saving}>
//                                 {saving ? <Loader2 className="wm-spin" size={14} /> : 'Synchronize Record'}
//                             </button>
//                             {isPending && (
//                                 <button type="button" className="wm-btn wm-btn--primary" onClick={handleApproveAndSave} disabled={saving} style={{ background: '#16a34a', borderColor: '#15803d' }}>
//                                     {saving ? <Loader2 className="wm-spin" size={14} /> : <><CheckCircle size={14} /> Approve Application</>}
//                                 </button>
//                             )}
//                         </div>
//                     </div>
//                 </form>
//             </div>
//         </div>,
//         document.body
//     );
// };




// // // src/components/admin/WorkplacesManager/EmployerModal.tsx

// // import React, { useState, useEffect } from 'react';
// // import { createPortal } from 'react-dom';
// // import { collection, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
// // import { db } from '../../../lib/firebase';
// // import Autocomplete from "react-google-autocomplete";
// // import {
// //     Building2, MapPin, User, X, Loader2, Save,
// //     ShieldCheck, ShieldAlert, Target, ListPlus
// // } from 'lucide-react';

// // import { useToast } from '../../../components/common/Toast/Toast';
// // import type { Employer, CustomFieldBlueprint } from '../../../types';

// // interface EmployerModalProps {
// //     editing: Employer | null;
// //     onClose: () => void;
// //     onSaved: () => void;
// // }

// // export const EmployerModal: React.FC<EmployerModalProps> = ({ editing, onClose, onSaved }) => {
// //     const toast = useToast();
// //     const [saving, setSaving] = useState(false);

// //     const [customFields, setCustomFields] = useState<CustomFieldBlueprint[]>([]);
// //     const [customResponses, setCustomResponses] = useState<Record<string, any>>((editing as any)?.customResponses || {});

// //     const [form, setForm] = useState({
// //         name: editing?.name || '',
// //         tradingName: editing?.tradingName || '',
// //         registrationNumber: editing?.registrationNumber || '',
// //         vatNumber: editing?.vatNumber || '',
// //         bbbeeLevel: editing?.bbbeeLevel || '',
// //         website: editing?.website || '',
// //         contactPerson: editing?.contactPerson || '',
// //         contactEmail: editing?.contactEmail || '',
// //         contactPhone: editing?.contactPhone || '',
// //         industrySectorStr: editing?.industrySector?.join(', ') || '',
// //         techStackStr: editing?.techStack?.join(', ') || '',
// //         employeeCount: editing?.employeeCount || 0,
// //         internCapacity: editing?.internCapacity || 1,
// //         workArrangement: editing?.workArrangement || 'On-site',
// //         hasDedicatedMentors: editing?.hasDedicatedMentors || 'No',
// //         willingToSignWBL: editing?.willingToSignWBL ?? true,
// //         taxCompliant: editing?.taxCompliant || 'Yes',
// //         hasHRPolicies: editing?.hasHRPolicies ?? false,
// //         etiAwareness: editing?.etiAwareness ?? false,
// //         mlabTier: editing?.mlabTier || 'Tier 2 (Established SME)',
// //         mlabRiskRating: editing?.mlabRiskRating || 'Medium',
// //         matchingPriorityScore: editing?.matchingPriorityScore || 50,
// //         internalNotes: editing?.internalNotes || '',
// //         physicalAddress: editing?.physicalAddress || '',
// //         province: editing?.province || '',
// //         lat: editing?.lat || null as number | null,
// //         lng: editing?.lng || null as number | null,
// //     });

// //     useEffect(() => {
// //         const fetchBlueprint = async () => {
// //             try {
// //                 const settingsSnap = await getDoc(doc(db, 'settings', 'global'));
// //                 if (settingsSnap.exists()) {
// //                     const data = settingsSnap.data();
// //                     if (data.employerFormBlueprint?.customFields) {
// //                         setCustomFields(data.employerFormBlueprint.customFields);
// //                     }
// //                 }
// //             } catch (err) {
// //                 console.error("Failed to load blueprint", err);
// //             }
// //         };
// //         fetchBlueprint();
// //     }, []);

// //     const handlePlaceSelected = (place: any) => {
// //         let newLat = form.lat;
// //         let newLng = form.lng;

// //         if (place.geometry?.location) {
// //             newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// //             newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// //         }

// //         const components = place.address_components;
// //         const provString = components?.find((c: any) => c.types.includes("administrative_area_level_1"))?.long_name || "";
// //         const formatted = place.formatted_address || "";

// //         setForm(p => ({
// //             ...p,
// //             physicalAddress: formatted,
// //             province: provString,
// //             lat: newLat,
// //             lng: newLng
// //         }));
// //     };

// //     const handleCustomResponseChange = (fieldId: string, value: any) => {
// //         setCustomResponses(prev => ({ ...prev, [fieldId]: value }));
// //     };

// //     const handleSubmit = async (e: React.FormEvent) => {
// //         e.preventDefault();
// //         setSaving(true);
// //         try {
// //             const finalForm = {
// //                 ...form,
// //                 industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
// //                 techStack: form.techStackStr.split(',').map((s: any) => s.trim()).filter(Boolean),
// //                 customResponses
// //             };

// //             delete (finalForm as any).industrySectorStr;
// //             delete (finalForm as any).techStackStr;

// //             if (editing) {
// //                 await updateDoc(doc(db, 'employers', editing.id), { ...finalForm, updatedAt: new Date().toISOString() });
// //                 toast.success('Workplace Partner database attributes synchronized successfully.');
// //             } else {
// //                 const ref = doc(collection(db, 'employers'));
// //                 await setDoc(ref, { ...finalForm, id: ref.id, status: 'active', createdAt: new Date().toISOString() });
// //                 toast.success('New internal Partner node safely instantiated.');
// //             }
// //             onSaved();
// //             onClose();
// //         } catch {
// //             toast.error('Failed to parse database write operation.');
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     return createPortal(
// //         <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
// //             <div className="wm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '750px' }}>
// //                 <div className="wm-modal__header">
// //                     <div className="wm-modal__header-icon"><Building2 size={20} /></div>
// //                     <div>
// //                         <h2 className="wm-modal__title">{editing ? 'Modify Host Matrix Node' : 'Onboard Partner Entity'}</h2>
// //                         <p className="wm-modal__subtitle">Enterprise structural records system tracking parameters</p>
// //                     </div>
// //                     <button type="button" className="wm-modal__close" onClick={onClose}><X size={18} /></button>
// //                 </div>

// //                 <form onSubmit={handleSubmit} className="wm-modal__form">
// //                     <div className="wm-modal__body" style={{ background: '#f8fafc' }}>
// //                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// //                             <div className="wm-form-section__label"><Building2 size={14} color="var(--mlab-blue)" /> Organisation Registry Handles</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Registered Corporate Handle *</label>
// //                                     <input className="wm-form-input" required type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Trading Name</label>
// //                                     <input className="wm-form-input" type="text" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">CIPC Registration Signature</label>
// //                                     <input className="wm-form-input" type="text" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">B-BBEE Tier Matrix</label>
// //                                     <select className="wm-form-input" value={form.bbbeeLevel} onChange={e => setForm(p => ({ ...p, bbbeeLevel: e.target.value }))}>
// //                                         <option value="">Unknown / Pending</option>
// //                                         <option value="Level 1">Level 1</option>
// //                                         <option value="Level 2">Level 2</option>
// //                                         <option value="Level 3">Level 3</option>
// //                                         <option value="Level 4">Level 4</option>
// //                                         <option value="Non-Compliant">Non-Compliant</option>
// //                                     </select>
// //                                 </div>

// //                                 <div className="wm-form-group wm-form-group--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
// //                                     <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}>
// //                                         <MapPin size={13} /> Geospatial Coordinates Autocomplete Validation *
// //                                     </label>
// //                                     <Autocomplete
// //                                         apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// //                                         onPlaceSelected={handlePlaceSelected}
// //                                         options={{ componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address"] }}
// //                                         className="wm-form-input"
// //                                         placeholder="Resolve location markers..."
// //                                         defaultValue={form.physicalAddress}
// //                                     />
// //                                     {form.lat && (
// //                                         <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                             <ShieldCheck size={14} /> GIS Markers Anchored. (Lat: {form.lat.toFixed(4)})
// //                                         </div>
// //                                     )}
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// //                             <div className="wm-form-section__label"><User size={14} color="var(--mlab-blue)" /> Core Capacity & Operational Footprint</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Primary Stakeholder Name *</label>
// //                                     <input className="wm-form-input" required type="text" value={form.contactPerson} onChange={e => setForm(p => ({ ...p, contactPerson: e.target.value }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Contact Endpoint Mail *</label>
// //                                     <input className="wm-form-input" required type="email" value={form.contactEmail} onChange={e => setForm(p => ({ ...p, contactEmail: e.target.value }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Intern Seat Allocation Upper Bound *</label>
// //                                     <input className="wm-form-input" required type="number" value={form.internCapacity} onChange={e => setForm(p => ({ ...p, internCapacity: parseInt(e.target.value) || 1 }))} />
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Operational Arrangement Mode</label>
// //                                     <select className="wm-form-input" value={form.workArrangement} onChange={e => setForm(p => ({ ...p, workArrangement: e.target.value }))}>
// //                                         <option value="On-site">On-site Execution</option>
// //                                         <option value="Hybrid">Hybrid Pipeline</option>
// //                                         <option value="Remote">Fully Dispersed (Remote)</option>
// //                                     </select>
// //                                 </div>
// //                             </div>
// //                         </div>

// //                         {customFields.length > 0 && (
// //                             <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
// //                                 <div className="wm-form-section__label"><ListPlus size={14} color="var(--mlab-blue)" /> Contextual Inbound Submissions Logs</div>
// //                                 <div className="wm-form-grid" style={{ gridTemplateColumns: '1fr' }}>
// //                                     {customFields.map((field) => (
// //                                         <div key={field.id} className="wm-form-group">
// //                                             <label className="wm-form-label">{field.label}</label>
// //                                             {field.type === 'text' && (
// //                                                 <input className="wm-form-input" type="text" value={customResponses[field.id] || ''} onChange={(e) => handleCustomResponseChange(field.id, e.target.value)} />
// //                                             )}
// //                                             {field.type === 'dropdown' && (
// //                                                 <select className="wm-form-input" value={customResponses[field.id] || ''} onChange={(e) => handleCustomResponseChange(field.id, e.target.value)}>
// //                                                     <option value="">-- No Value Mapped --</option>
// //                                                     {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
// //                                                 </select>
// //                                             )}
// //                                             {field.type === 'checkbox' && (
// //                                                 <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
// //                                                     <input type="checkbox" checked={!!customResponses[field.id]} onChange={(e) => handleCustomResponseChange(field.id, e.target.checked)} />
// //                                                     Confirmed
// //                                                 </label>
// //                                             )}
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>
// //                         )}

// //                         <div className="wm-form-section" style={{ background: '#eff6ff', padding: '1.25rem', borderRadius: '8px', border: '1px solid #bfdbfe', marginTop: '1rem' }}>
// //                             <div className="wm-form-section__label" style={{ color: '#1e3a8a' }}><Target size={14} color="#1e3a8a" /> Internal Evaluation Matrix (Staff Restricted)</div>
// //                             <div className="wm-form-grid">
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label"> mLab Portfolio Tier Placement</label>
// //                                     <select className="wm-form-input" value={form.mlabTier} onChange={e => setForm(p => ({ ...p, mlabTier: e.target.value }))}>
// //                                         <option value="Tier 1 (Enterprise)">Tier 1 (Enterprise)</option>
// //                                         <option value="Tier 2 (Established SME)">Tier 2 (Established SME)</option>
// //                                         <option value="Tier 3 (Startup/Micro)">Tier 3 (Startup / Micro)</option>
// //                                     </select>
// //                                 </div>
// //                                 <div className="wm-form-group">
// //                                     <label className="wm-form-label">Ecosystem Compliance Risk Rating</label>
// //                                     <select className="wm-form-input" value={form.mlabRiskRating} onChange={e => setForm(p => ({ ...p, mlabRiskRating: e.target.value }))}>
// //                                         <option value="Low">Low Risk Threshold</option>
// //                                         <option value="Medium">Medium Variance</option>
// //                                         <option value="High">High Exposure Caution</option>
// //                                         <option value="Critical">Critical Constraint Locked</option>
// //                                     </select>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     <div className="wm-modal__footer">
// //                         <button type="button" className="wm-btn wm-btn--ghost" onClick={onClose}>Dismiss</button>
// //                         <button type="submit" className="wm-btn wm-btn--primary" disabled={saving}>
// //                             {saving ? <Loader2 className="wm-spin" size={14} /> : 'Synchronize Node Records'}
// //                         </button>
// //                     </div>
// //                 </form>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };