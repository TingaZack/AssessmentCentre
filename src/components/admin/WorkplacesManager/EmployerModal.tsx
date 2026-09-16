// src/components/admin/WorkplacesManager/EmployerModal.tsx

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, doc, setDoc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import Autocomplete from "react-google-autocomplete";
import { GoogleMap, Marker } from '@react-google-maps/api';
import {
    Building2, MapPin, User, X, Loader2, Save,
    ShieldCheck, Target, ListPlus, MonitorPlay, FileBadge, Lock, CheckCircle, Zap, Globe, Search, Info
} from 'lucide-react';

import { useToast } from '../../../components/common/Toast/Toast';
import type { Employer, CustomFieldBlueprint } from '../../../types';
import Loader from '../../common/Loader/Loader';

const SA_PROVINCES = [
    { label: "Gauteng", value: "Gauteng" },
    { label: "Western Cape", value: "Western Cape" },
    { label: "Eastern Cape", value: "Eastern Cape" },
    { label: "KwaZulu-Natal", value: "KwaZulu-Natal" },
    { label: "Free State", value: "Free State" },
    { label: "North West", value: "North West" },
    { label: "Northern Cape", value: "Northern Cape" },
    { label: "Mpumalanga", value: "Mpumalanga" },
    { label: "Limpopo", value: "Limpopo" }
];

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

    // Map Modal State
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [tempCoords, setTempCoords] = useState({ lat: -26.2041, lng: 28.0473 });
    const [mapSearchText, setMapSearchText] = useState("");
    const [isGoogleReady, setIsGoogleReady] = useState(() => typeof window !== 'undefined' && Boolean((window as any).google?.maps?.places));

    useEffect(() => {
        if (isGoogleReady) return;
        const checkGoogleInterval = setInterval(() => {
            if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
                setIsGoogleReady(true);
                clearInterval(checkGoogleInterval);
            }
        }, 300);
        return () => clearInterval(checkGoogleInterval);
    }, [isGoogleReady]);

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

        // Detailed Location State
        unitNumber: (editing as any)?.unitNumber || '',
        buildingName: (editing as any)?.buildingName || '',
        streetAddress: (editing as any)?.streetAddress || '',
        city: (editing as any)?.city || '',
        postalCode: (editing as any)?.postalCode || '',
        province: (editing as any)?.province || '',
        physicalAddress: editing?.physicalAddress || '',
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

    const buildFullAddress = (updated: {
        unitNumber?: string;
        buildingName?: string;
        streetAddress?: string;
        city?: string;
        province?: string;
        postalCode?: string;
        physicalAddress?: string;
    }) => {
        const parts = [
            updated.unitNumber ? `Unit / Suite ${updated.unitNumber}` : '',
            updated.buildingName,
            updated.streetAddress,
            updated.city,
            updated.province,
            updated.postalCode
        ].filter(Boolean);

        return parts.length > 0 ? parts.join(', ') : (updated.physicalAddress || '');
    };

    const handleAddressFieldChange = (field: string, value: string) => {
        setForm(prev => {
            const updated = { ...prev, [field]: value };
            const fullAddress = buildFullAddress(updated);
            return { ...updated, physicalAddress: fullAddress };
        });
    };

    const handlePlaceSelected = (place: any) => {
        if (!place || !place.address_components) return;

        let newLat = form.lat;
        let newLng = form.lng;
        if (place.geometry?.location) {
            newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
        }

        const components = place.address_components;
        const getComp = (type: string) => components?.find((c: any) => c.types.includes(type))?.long_name || "";

        const streetNum = getComp("street_number");
        const route = getComp("route");
        const subpremise = getComp("subpremise");
        const premise = getComp("premise");
        const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
        const townName = getComp("locality") || suburb;
        const provString = getComp("administrative_area_level_1");
        const postal = getComp("postal_code");
        const formatted = place.formatted_address || "";

        const extractedStreet = [streetNum, route].filter(Boolean).join(" ");

        setForm(prev => {
            const updated = {
                ...prev,
                unitNumber: subpremise || prev.unitNumber,
                buildingName: premise || prev.buildingName,
                streetAddress: extractedStreet || prev.streetAddress || formatted,
                city: townName || prev.city,
                province: provString || prev.province,
                postalCode: postal || prev.postalCode,
                lat: newLat,
                lng: newLng
            };
            const fullAddress = buildFullAddress(updated);
            return { ...updated, physicalAddress: fullAddress };
        });
    };

    const openMapModal = () => {
        const initialLat = form.lat && form.lat !== 0 ? form.lat : -26.2041;
        const initialLng = form.lng && form.lng !== 0 ? form.lng : 28.0473;
        setTempCoords({ lat: initialLat, lng: initialLng });
        setMapSearchText(form.physicalAddress || form.streetAddress || "");
        setIsMapModalOpen(true);
    };

    const handleModalAddressSelected = (place: any) => {
        if (place.geometry && place.geometry.location) {
            const newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            const newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
            setTempCoords({ lat: newLat, lng: newLng });
            handlePlaceSelected(place);
        }
    };

    const confirmMapCoordinates = () => {
        setForm(prev => ({
            ...prev,
            lat: tempCoords.lat,
            lng: tempCoords.lng
        }));
        toast.success(`Coordinates pinned: ${tempCoords.lat.toFixed(6)}, ${tempCoords.lng.toFixed(6)}`);
        setIsMapModalOpen(false);
    };

    const runAutoAssessment = () => {
        let tier = "Tier 2 (Established SME)";
        let risk = "Medium";
        let score = 30;
        const notes: string[] = [];

        notes.push(`[System Auto-Assessment | ${new Date().toLocaleDateString()}]`);

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

        notes.push("\n--- PRIORITY SCORE JUSTIFICATION ---");
        notes.push("• Starting Base Score: 30 pts");

        const funding = form.fundingModel || "";
        if (funding.includes("ourselves") || funding.includes("fully fund")) {
            score += 25;
            notes.push("• +25 pts: Partner is fully funding placements independently.");
        } else if (funding.includes("co-fund") || funding.includes("top-up")) {
            score += 15;
            notes.push("• +15 pts: Partner is willing to co-fund/top-up stipends.");
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

            if (editing) {
                await updateDoc(doc(db, 'employers', editing.id), { ...finalForm, updatedAt: new Date().toISOString() });
                toast.success('Employer profile synchronized.');
            } else {
                const newRef = doc(collection(db, 'employers'));
                await setDoc(newRef, { ...finalForm, id: newRef.id, status: 'active', createdAt: new Date().toISOString() });
                toast.success('New Partner profile created.');
            }

            onSaved();
            onClose();
        } catch {
            toast.error('Failed to save changes.');
        } finally {
            setSaving(false);
        }
    };

    const handleApproveAndSave = async () => {
        if (!editing) return;
        setSaving(true);
        try {
            const finalForm = {
                ...form,
                industrySector: form.industrySectorStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                specificRoles: form.specificRolesStr.split(',').map((s: any) => s.trim()).filter(Boolean),
                status: 'active'
            };
            await updateDoc(doc(db, 'employers', editing.id), { ...finalForm, updatedAt: new Date().toISOString() });
            toast.success('Partner Application Approved!');
            onSaved();
            onClose();
        } catch { toast.error('Approval failed.'); } finally { setSaving(false); }
    };

    const isLocked = !!editing;
    const isPending = editing && (editing as any).status === 'Pending Review';

    return createPortal(
        <div className="wm-overlay animate-fade-in" onClick={onClose} style={{ zIndex: 9999 }}>
            {/* Global CSS Override to bring Google Places Autocomplete dropdown above Modal Portal */}
            <style>{`
                .pac-container {
                    z-index: 100000 !important;
                    pointer-events: auto !important;
                }
            `}</style>

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

                        {/* SECTION 1: ORG & DETAILED LOCATION */}
                        <div className="wm-form-section" style={{ background: 'white', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
                            <div className="wm-form-section__label"><Building2 size={14} color="var(--mlab-blue)" /> Organisation & Physical Address</div>
                            <div className="wm-form-grid">
                                <div className="wm-form-group"><label className="wm-form-label">Business Name *</label><input className="wm-form-input" required type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">Trading Name</label><input className="wm-form-input" type="text" value={form.tradingName} onChange={e => setForm(p => ({ ...p, tradingName: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">CIPC / Reg Number</label><input className="wm-form-input" type="text" value={form.registrationNumber} onChange={e => setForm(p => ({ ...p, registrationNumber: e.target.value }))} /></div>
                                <div className="wm-form-group"><label className="wm-form-label">VAT Number</label><input className="wm-form-input" type="text" value={form.vatNumber} onChange={e => setForm(p => ({ ...p, vatNumber: e.target.value }))} /></div>

                                {/* LOCATION AUTOCOMPLETE & PINPOINT MAP */}
                                <div className="wm-form-group wm-form-group--full" style={{ padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', margin: 0 }}>
                                            <Globe size={13} /> Office Location Search & GIS Pinpoint
                                        </label>
                                        <button
                                            type="button"
                                            onClick={openMapModal}
                                            style={{
                                                background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
                                                padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem',
                                                fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                            }}
                                        >
                                            <MapPin size={13} /> Adjust Pin on Map
                                        </button>
                                    </div>
                                    <Autocomplete
                                        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                        onPlaceSelected={handlePlaceSelected}
                                        options={{ componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address"] }}
                                        className="wm-form-input"
                                        placeholder="Search building, office park or street..."
                                        defaultValue={form.physicalAddress}
                                    />
                                </div>

                                {/* GRANULAR LOCATION FIELDS */}
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Unit / Suite / Apartment #</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        placeholder="e.g., Unit 4B / Suite 12"
                                        value={form.unitNumber}
                                        onChange={e => handleAddressFieldChange('unitNumber', e.target.value)}
                                    />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Building / Block / Office Park</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        placeholder="e.g., Block B, Westway Office Park"
                                        value={form.buildingName}
                                        onChange={e => handleAddressFieldChange('buildingName', e.target.value)}
                                    />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Street Address</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        placeholder="e.g., 123 Main Road"
                                        value={form.streetAddress}
                                        onChange={e => handleAddressFieldChange('streetAddress', e.target.value)}
                                    />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">City / Suburb</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        placeholder="e.g., Sandton, Johannesburg"
                                        value={form.city}
                                        onChange={e => handleAddressFieldChange('city', e.target.value)}
                                    />
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Province</label>
                                    <select
                                        className="wm-form-input"
                                        value={form.province}
                                        onChange={e => handleAddressFieldChange('province', e.target.value)}
                                    >
                                        <option value="">-- Select Province --</option>
                                        {SA_PROVINCES.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="wm-form-group">
                                    <label className="wm-form-label">Postal Code</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        placeholder="e.g., 2196"
                                        value={form.postalCode}
                                        onChange={e => handleAddressFieldChange('postalCode', e.target.value)}
                                    />
                                </div>

                                <div className="wm-form-group wm-form-group--full">
                                    <label className="wm-form-label">Full Physical Address Overview (Auto-Compiled)</label>
                                    <input
                                        className="wm-form-input"
                                        type="text"
                                        value={form.physicalAddress}
                                        onChange={e => setForm(p => ({ ...p, physicalAddress: e.target.value }))}
                                        placeholder="Auto-generated formatted address..."
                                        style={{ background: '#f8fafc', fontWeight: 600 }}
                                    />
                                    {form.lat && form.lng && (
                                        <div style={{ marginTop: '6px', fontSize: '0.75rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <ShieldCheck size={14} /> GIS Anchored: Lat {form.lat.toFixed(6)}, Lng {form.lng.toFixed(6)}
                                        </div>
                                    )}
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

                        {/* SECTION 4: INTERNAL EVALUATION MATRIX */}
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

            {/* MAP PINPOINT MODAL OVERLAY */}
            {isMapModalOpen && (
                <div className="wm-overlay animate-fade-in" onClick={() => setIsMapModalOpen(false)} style={{ zIndex: 99999 }}>
                    <div className="wm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px', background: 'white', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
                        <div className="wm-modal__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem' }}>
                            <h2 className="wm-modal__title" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.1rem' }}>
                                <MapPin size={18} color="var(--mlab-blue)" /> Pinpoint Exact Office Park / Building Entrance
                            </h2>
                            <button className="wm-modal__close" type="button" onClick={() => setIsMapModalOpen(false)}><X size={18} /></button>
                        </div>
                        <div className="wm-modal__body" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: 1.4 }}>
                                Search for your office park, building, or street below, then click on the map or drag the marker directly onto the building entrance.
                            </p>
                            <div style={{ position: 'relative' }}>
                                {isGoogleReady ? (
                                    <Autocomplete
                                        key={`modal-search-employer`}
                                        onPlaceSelected={handleModalAddressSelected}
                                        options={{ types: [], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address"] }}
                                        className="wm-form-input"
                                        defaultValue={mapSearchText}
                                        placeholder="Search building, office park or street..."
                                        style={{ paddingLeft: '38px', borderRadius: '6px' }}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        className="wm-form-input"
                                        defaultValue={mapSearchText}
                                        placeholder="Search building, office park or street..."
                                        style={{ paddingLeft: '38px', borderRadius: '6px' }}
                                    />
                                )}
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                            </div>

                            <div style={{ width: '100%', height: '360px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #cbd5e1', position: 'relative' }}>
                                {isGoogleReady ? (
                                    <GoogleMap
                                        mapContainerStyle={{ width: '100%', height: '100%' }}
                                        center={tempCoords}
                                        zoom={17}
                                        onClick={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
                                        options={{ disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false }}
                                    >
                                        <Marker position={tempCoords} draggable={true} onDragEnd={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })} />
                                    </GoogleMap>
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                                        <Loader message="Loading Map..." fullScreen={false} />
                                    </div>
                                )}
                            </div>

                            <div style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace', background: '#f1f5f9', padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1', width: 'fit-content' }}>
                                Lat: {tempCoords.lat.toFixed(6)}, Lng: {tempCoords.lng.toFixed(6)}
                            </div>
                        </div>

                        <div className="wm-modal__footer" style={{ padding: '1rem', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button type="button" className="wm-btn wm-btn--ghost" onClick={() => setIsMapModalOpen(false)}>Cancel</button>
                            <button type="button" className="wm-btn wm-btn--primary" onClick={confirmMapCoordinates}>
                                <Save size={14} /> Confirm Coordinates
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};