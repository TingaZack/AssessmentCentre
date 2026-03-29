// src/pages/SettingsPage/SettingsPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, GraduationCap, Link2, Bell,
    ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin, Database, Lock, CheckCircle2, Edit2, Globe
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import Autocomplete from "react-google-autocomplete";
import './SettingsPage.css';

// Fallback assets
import fallbackLogo from '../../assets/logo/mlab_logo.png';
import fallbackSignature from '../../assets/Signatue_Zack_.png';

// ─── DICTIONARIES ─────────────────────────────────────────────────────────

const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
];

const CORE_MAPPINGS = [
    { key: 'fullName', label: 'Full Name' },
    { key: 'idNumber', label: 'ID Number / Passport' },
    { key: 'email', label: 'Email Address' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'startDate', label: 'Start Date' },
    { key: 'endDate', label: 'Completion Date' },
    { key: 'issueDate', label: 'SoR Issue Date' },
    { key: 'cohort', label: 'Cohort / Class Name' },
    { key: 'sdpCode', label: 'SDP Code' },
    { key: 'qualificationTitle', label: 'Qualification Title' },
    { key: 'saqaId', label: 'SAQA Qual ID' },
    { key: 'nqfLevel', label: 'NQF Level' },
    { key: 'credits', label: 'Credits' }
];

const DEFAULT_SETTINGS: any = {
    institutionName: "mLab Southern Africa",
    companyRegistrationNumber: "2011/149875/08",
    phone: "+27 012 844 0240",
    email: "codetribe@mlab.co.za",
    institutionAddress: "",
    institutionCity: "",
    institutionProvince: "",
    institutionPostalCode: "",
    institutionLat: 0,
    institutionLng: 0,
    campuses: [
        {
            id: "campus-1",
            name: "Head Office",
            type: "physical",
            address: "",
            province: "",
            city: "",
            postalCode: "",
            lat: 0,
            lng: 0,
            siteAccreditationNumber: "",
            isDefault: true
        }
    ],
    passMarkThreshold: 50,
    attendanceRequirement: 80,
    defaultCohortMonths: 12,
    eisaLockEnabled: true,
    logoUrl: "",
    signatureUrl: "",
    csvMappings: {
        fullName: "Learner Name",
        idNumber: "ID Number",
        email: "Email Address",
        phone: "Phone Number",
        startDate: "Start Date",
        endDate: "Completion Date",
        issueDate: "Issue Date",
        cohort: "Cohort",
        sdpCode: "SDP Code",
        qualificationTitle: "Qualification Title",
        saqaId: "SAQA Qual ID",
        nqfLevel: "NQF Level",
        credits: "Credits"
    },
    customCsvMappings: []
};

export const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, fetchSettings } = useStore();

    // Navigation state
    const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'data' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

    // Data state
    const [formData, setFormData] = useState<any>(DEFAULT_SETTINGS);
    const [originalData, setOriginalData] = useState<any>(DEFAULT_SETTINGS);

    // UI State
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);

    // Load settings from Firestore on mount
    useEffect(() => {
        const initSettings = async () => {
            try {
                const docRef = doc(db, "system_settings", "global");
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const mergedData = {
                        ...DEFAULT_SETTINGS,
                        ...data,
                        csvMappings: { ...DEFAULT_SETTINGS.csvMappings, ...(data.csvMappings || {}) },
                        customCsvMappings: data.customCsvMappings || []
                    };
                    setFormData(mergedData);
                    setOriginalData(mergedData);
                }
            } catch (error) {
                console.error("Error fetching system settings:", error);
            }
        };
        initSettings();
    }, []);

    // Dirty check for save bar
    useEffect(() => {
        const hasChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
        setIsDirty(hasChanged);
    }, [formData, originalData]);

    // ─── GOOGLE MAPS HANDLER ────────────────────────────────────────────────

    const openInGoogleMaps = (lat: number, lng: number) => {
        if (!lat || !lng || lat === 0 || lng === 0) return;
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    };

    // ─── ADDRESS PARSER ─────────────────────────────────────────────────────

    const getAddressMetadata = (place: any) => {
        const components = place.address_components;
        if (!components) return null;

        const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";

        const rawProv = getComp("administrative_area_level_1");
        const matchedProv = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.toLowerCase())) || rawProv;

        return {
            fullAddress: place.formatted_address || "",
            buildingName: place.name || "",
            city: getComp("locality") || getComp("sublocality_level_1") || getComp("city"),
            province: matchedProv,
            postalCode: getComp("postal_code"),
            lat: typeof place.geometry?.location?.lat === 'function' ? place.geometry.location.lat() : 0,
            lng: typeof place.geometry?.location?.lng === 'function' ? place.geometry.location.lng() : 0
        };
    };

    // ─── HANDLERS ─────────────────────────────────────────────────────────

    const handleMainAddressSelected = (place: any) => {
        const meta = getAddressMetadata(place);
        if (!meta) return;

        const displayAddress = meta.fullAddress.includes(meta.buildingName)
            ? meta.fullAddress
            : `${meta.buildingName}, ${meta.fullAddress}`;

        setFormData((prev: any) => ({
            ...prev,
            institutionAddress: displayAddress,
            institutionCity: meta.city,
            institutionProvince: meta.province,
            institutionLat: meta.lat,
            institutionLng: meta.lng,
            institutionPostalCode: meta.postalCode
        }));
        setIsDirty(true);
    };

    const handleCampusAddressSelected = (id: string, place: any) => {
        const meta = getAddressMetadata(place);
        if (!meta) return;

        const displayAddress = meta.fullAddress.includes(meta.buildingName)
            ? meta.fullAddress
            : `${meta.buildingName}, ${meta.fullAddress}`;

        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => c.id === id ? {
                ...c,
                address: displayAddress,
                city: meta.city,
                province: meta.province,
                postalCode: meta.postalCode,
                lat: meta.lat,
                lng: meta.lng
            } : c)
        }));
        setIsDirty(true);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData((prev: any) => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
        setIsDirty(true);
    };

    const handleCampusChange = (id: string, field: string, value: any) => {
        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => c.id === id ? { ...c, [field]: value } : c)
        }));
        setIsDirty(true);
    };

    const handleAddCampus = () => {
        const newId = `campus-${Date.now()}`;
        setFormData((prev: any) => ({
            ...prev,
            campuses: [
                ...prev.campuses,
                { id: newId, name: '', type: 'physical', address: '', province: '', city: '', postalCode: '', siteAccreditationNumber: '', isDefault: prev.campuses.length === 0 }
            ]
        }));
        setIsDirty(true);
    };

    const handleRemoveCampus = (id: string) => {
        setFormData((prev: any) => {
            const newCampuses = prev.campuses.filter((c: any) => c.id !== id);
            if (newCampuses.length > 0 && !newCampuses.some((c: any) => c.isDefault)) {
                newCampuses[0].isDefault = true;
            }
            return { ...prev, campuses: newCampuses };
        });
        setIsDirty(true);
    };

    const handleSetDefaultCampus = (id: string) => {
        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => ({ ...c, isDefault: c.id === id }))
        }));
        setIsDirty(true);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'signatureUrl') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isLogo = field === 'logoUrl';
        isLogo ? setIsUploadingLogo(true) : setIsUploadingSignature(true);

        try {
            const storage = getStorage();
            const fileRef = ref(storage, `brand_assets/${field}_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadURL = await getDownloadURL(fileRef);
            setFormData((prev: any) => ({ ...prev, [field]: downloadURL }));
            setIsDirty(true);
        } catch (error) {
            console.error(`Failed to upload ${field}:`, error);
            alert("Upload failed. Please try again.");
        } finally {
            isLogo ? setIsUploadingLogo(false) : setIsUploadingSignature(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const docRef = doc(db, "system_settings", "global");
            const payload = {
                ...formData,
                updatedAt: new Date().toISOString(),
                updatedBy: user?.uid || 'admin'
            };
            await setDoc(docRef, payload, { merge: true });

            if (fetchSettings) await fetchSettings();

            setOriginalData(formData);
            setIsDirty(false);
        } catch (error) {
            console.error("Save failed:", error);
            alert("Failed to save settings. Check permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    const TABS = [
        { id: 'org', label: 'Organization', icon: Building2 },
        { id: 'academic', label: 'Academic Rules', icon: GraduationCap },
        { id: 'data', label: 'Data & Imports', icon: Database },
        { id: 'web3', label: 'Web3 & Blockchain', icon: Link2 },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'audit', label: 'Security & Audit', icon: ShieldAlert },
        { id: 'profile', label: 'My Profile', icon: User },
    ] as const;

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar
                role={user?.role}
                currentNav="settings"
                setCurrentNav={() => navigate(`/admin`)}
                onLogout={() => navigate('/login')}
            />

            <main className="main-wrapper settings-wrapper">
                <PageHeader
                    theme="default"
                    variant="hero"
                    eyebrow="System Configuration"
                    title="Platform Settings"
                    description="Institutional accreditation and global compliance infrastructure."
                />

                <div className="settings-container">

                    {/* ─── SETTINGS NAVIGATION ─── */}
                    <aside className="settings-sidebar">
                        <nav className="settings-nav">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        className={`settings-nav__item ${activeTab === tab.id ? 'active' : ''}`}
                                        onClick={() => setActiveTab(tab.id as any)}
                                    >
                                        <Icon size={18} className="settings-nav__icon" /> {tab.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    {/* ─── SETTINGS CONTENT ─── */}
                    <div className="settings-content">

                        {/* 1. ORGANIZATION PROFILE */}
                        {activeTab === 'org' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Institutional Identity</h2>
                                <p className="settings-section__desc">Core details used for QCTO LEISA reports and legal declarations.</p>

                                <div className="settings-card">
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group col-span-2">
                                            <label>Institution Name</label>
                                            <input type="text" name="institutionName" className="mlab-input" value={formData.institutionName} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>CIPC Registration Number</label>
                                            <input type="text" name="companyRegistrationNumber" className="mlab-input" value={formData.companyRegistrationNumber} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Official Contact Email</label>
                                            <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Official Contact Phone</label>
                                            <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
                                        </div>

                                        {/* Main Autocomplete & Manual Override Section */}
                                        <div className="mlab-form-group col-span-2">
                                            <label>Institution Physical Address (Main SDP Search)</label>
                                            <div className="input-with-verification">
                                                <Autocomplete
                                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                                    onPlaceSelected={handleMainAddressSelected}
                                                    options={{ types: [], componentRestrictions: { country: "za" } }}
                                                    className="mlab-input search-input"
                                                    placeholder="Search building name, hub, or street..."
                                                />

                                                {/* OFFICIAL ADDRESS EDITOR (MANUAL OVERRIDE) */}
                                                <div className="manual-address-edit mt-4 p-4 border rounded-lg bg-slate-50 shadow-sm border-slate-200">
                                                    <div className="address-editor-header">
                                                        <div className="editor-title"><Edit2 size={14} /> <span>Official Address Override (QCTO Compliant)</span></div>
                                                        {formData.institutionLat !== 0 && (
                                                            <button type="button" className="verification-pill" onClick={() => openInGoogleMaps(formData.institutionLat, formData.institutionLng)}>
                                                                <CheckCircle2 size={12} /> <span>GPS Verified</span>
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="settings-form-grid mt-3">
                                                        <div className="mlab-form-group col-span-2">
                                                            <label>Street Line (Manually insert street number if missing)</label>
                                                            <input type="text" name="institutionAddress" className="mlab-input bg-white" value={formData.institutionAddress} onChange={handleInputChange} placeholder="e.g. 123 Main Road, Suite 4..." />
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label>City</label>
                                                            <input type="text" name="institutionCity" className="mlab-input bg-white" value={formData.institutionCity} onChange={handleInputChange} />
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label>Province</label>
                                                            <select name="institutionProvince" className="mlab-input bg-white" value={formData.institutionProvince} onChange={handleInputChange}>
                                                                <option value="">Select...</option>
                                                                {QCTO_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label>Postal Code</label>
                                                            <input type="text" name="institutionPostalCode" className="mlab-input bg-white" value={formData.institutionPostalCode} onChange={handleInputChange} />
                                                        </div>
                                                        <div className="mlab-form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                                                            <button
                                                                type="button"
                                                                className="v-item-btn"
                                                                onClick={() => openInGoogleMaps(formData.institutionLat, formData.institutionLng)}
                                                                disabled={!formData.institutionLat}
                                                            >
                                                                <Globe size={14} /> <span>View Metadata</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Accredited Delivery Sites Section */}
                                <div className="section-header-flex mt-10">
                                    <div>
                                        <h2 className="settings-section__title" style={{ margin: 0 }}>Accredited Delivery Sites</h2>
                                        <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Specific accreditation numbers for individual physical hubs.</p>
                                    </div>
                                    <button className="mlab-btn mlab-btn--outline-blue" onClick={handleAddCampus}>
                                        <Plus size={16} /> Add New Site
                                    </button>
                                </div>

                                <div className="settings-locations-list mt-4">
                                    {formData.campuses.map((campus: any, index: number) => (
                                        <div key={campus.id} className={`location-card ${campus.isDefault ? 'location-card--default' : ''}`}>
                                            <div className="location-card__header">
                                                <div className="location-card__title">
                                                    <Building2 size={18} />
                                                    <span>Site {index + 1}: {campus.name || 'New Campus'} {campus.isDefault && "(Primary)"}</span>
                                                </div>
                                                <div className="location-card__actions">
                                                    {!campus.isDefault && (
                                                        <button className="location-action-btn text-blue" onClick={() => handleSetDefaultCampus(campus.id)}>Set as Primary</button>
                                                    )}
                                                    <button
                                                        className="location-action-btn text-red"
                                                        onClick={() => handleRemoveCampus(campus.id)}
                                                        disabled={formData.campuses.length === 1}
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="settings-form-grid mt-4">
                                                <div className="mlab-form-group">
                                                    <label>Campus Hub Name</label>
                                                    <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Kimberley Hub" />
                                                </div>
                                                <div className="mlab-form-group">
                                                    <label>QCTO SDP Accreditation No.</label>
                                                    <input type="text" className="mlab-input" value={campus.siteAccreditationNumber} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP0708..." />
                                                </div>

                                                {/* Campus Specific Autocomplete */}
                                                <div className="mlab-form-group col-span-2">
                                                    <label>Physical Address (Google Search)</label>
                                                    <Autocomplete
                                                        apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                                        onPlaceSelected={(place) => handleCampusAddressSelected(campus.id, place)}
                                                        options={{ types: [], componentRestrictions: { country: "za" } }}
                                                        className="mlab-input search-input"
                                                        placeholder="Search site address..."
                                                    />
                                                </div>

                                                {/* CAMPUS ADDRESS EDITOR (MANUAL OVERRIDE) */}
                                                <div className="mlab-form-group col-span-2 bg-white/50 p-4 rounded-lg border border-dashed border-slate-300 mt-2">
                                                    <div className="editor-title mb-3"><Edit2 size={13} /> <span>Site Address Editor</span></div>
                                                    <div className="mlab-form-group mb-3">
                                                        <label>Full Address (Edit to add street number)</label>
                                                        <input type="text" className="mlab-input bg-white" value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} />
                                                    </div>
                                                    <div className="settings-form-grid">
                                                        <div className="mlab-form-group">
                                                            <label>City</label>
                                                            <input type="text" className="mlab-input bg-white" value={campus.city} onChange={(e) => handleCampusChange(campus.id, 'city', e.target.value)} />
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label>Province</label>
                                                            <select className="mlab-input bg-white" value={campus.province} onChange={(e) => handleCampusChange(campus.id, 'province', e.target.value)}>
                                                                <option value="">Select...</option>
                                                                {QCTO_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label>Postal Code</label>
                                                            <input type="text" className="mlab-input bg-white" value={campus.postalCode} onChange={(e) => handleCampusChange(campus.id, 'postalCode', e.target.value)} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Institutional Brand Assets */}
                                <h2 className="settings-section__title mt-10">Institutional Branding</h2>
                                <div className="settings-card brand-assets-grid">
                                    <div className="asset-upload-box">
                                        <h3 className="asset-title">Primary Logo</h3>
                                        <div className="asset-preview"><img src={formData.logoUrl || fallbackLogo} alt="Institution Logo" /></div>
                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
                                            {isUploadingLogo ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Logo
                                            <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'logoUrl')} />
                                        </label>
                                    </div>
                                    <div className="asset-upload-box">
                                        <h3 className="asset-title">Authorized Signature</h3>
                                        <div className="asset-preview"><img src={formData.signatureUrl || fallbackSignature} alt="Authorized Signature" /></div>
                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
                                            {isUploadingSignature ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Signature
                                            <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'signatureUrl')} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. ACADEMIC RULES */}
                        {activeTab === 'academic' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Academic Governance</h2>
                                <p className="settings-section__desc">Global pass marks and duration rules for standard curricula.</p>
                                <div className="settings-card">
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group">
                                            <label>Pass Mark Threshold (%)</label>
                                            <input type="number" name="passMarkThreshold" className="mlab-input" value={formData.passMarkThreshold} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Minimum Attendance (%)</label>
                                            <input type="number" name="attendanceRequirement" className="mlab-input" value={formData.attendanceRequirement} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Default Cohort Months</label>
                                            <input type="number" name="defaultCohortMonths" className="mlab-input" value={formData.defaultCohortMonths} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                    <hr className="settings-divider mt-6 mb-6" />
                                    <div className="setting-row-toggle">
                                        <div className="setting-toggle-text">
                                            <h4>Strict EISA Lock</h4>
                                            <p>Prevent grade editing once a learner is marked as EISA Admitted.</p>
                                        </div>
                                        <label className="mlab-toggle">
                                            <input
                                                type="checkbox"
                                                checked={formData.eisaLockEnabled}
                                                onChange={() => setFormData({ ...formData, eisaLockEnabled: !formData.eisaLockEnabled })}
                                            />
                                            <span className="mlab-toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. DATA IMPORT MAPPINGS */}
                        {activeTab === 'data' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Data Translation Layer</h2>
                                <p className="settings-section__desc">Map your existing spreadsheet headers to internal system fields.</p>
                                <div className="settings-card p-0 overflow-hidden">
                                    <div className="mapping-table-header">
                                        <div>System Internal Field</div>
                                        <div>Expected CSV Column Header</div>
                                        <div className="text-center">Action</div>
                                    </div>
                                    {CORE_MAPPINGS.map(core => (
                                        <div key={core.key} className="mapping-row">
                                            <div className="font-medium text-slate-900">{core.label}</div>
                                            <input
                                                type="text"
                                                className="mlab-input m-0"
                                                value={formData.csvMappings[core.key] || ''}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    csvMappings: { ...formData.csvMappings, [core.key]: e.target.value }
                                                })}
                                            />
                                            <div className="text-center"><Lock size={14} color="#cbd5e1" /></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. WEB3 CONFIGURATION */}
                        {activeTab === 'web3' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Blockchain Protocol Settings</h2>
                                <div className="settings-card">
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group">
                                            <label>Decentralized Network</label>
                                            <select name="blockchainNetwork" className="mlab-input" value={formData.blockchainNetwork} onChange={handleInputChange}>
                                                <option value="polygon_mainnet">Polygon Mainnet</option>
                                                <option value="polygon_amoy">Polygon Amoy (Testnet)</option>
                                            </select>
                                        </div>
                                        <div className="mlab-form-group col-span-2">
                                            <label>Registry Smart Contract Address</label>
                                            <input type="text" name="contractAddress" className="mlab-input" value={formData.contractAddress} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group col-span-2">
                                            <label>Dedicated RPC URL</label>
                                            <input type="text" name="rpcUrl" className="mlab-input" value={formData.rpcUrl} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 5. EMPTY TABS */}
                        {['notifications', 'audit', 'profile'].includes(activeTab) && (
                            <div className="settings-section animate-fade-in empty-tab-wrapper">
                                <div className="empty-tab-content">
                                    <IconPlaceholder tab={activeTab} />
                                    <h2>Section Pending</h2>
                                    <p>This configuration module is currently under development for the QCTO Phase 2 rollout.</p>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </main>

            {/* ─── PERSISTENT SAVE BAR ─── */}
            <div className={`settings-save-bar ${isDirty ? 'visible' : ''}`}>
                <div className="save-bar-content">
                    <div className="save-bar-text">
                        <AlertCircle size={18} color="#d97706" />
                        <span>Institutional configuration has unsaved changes.</span>
                    </div>
                    <div className="save-bar-actions">
                        <button
                            className="mlab-btn mlab-btn--ghost"
                            onClick={() => { setFormData(originalData); setIsDirty(false); }}
                        >
                            Discard Changes
                        </button>
                        <button
                            className="mlab-btn mlab-btn--green"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            {isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IconPlaceholder = ({ tab }: { tab: string }) => {
    return <ShieldAlert size={64} className="opacity-20" />;
};



// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     Building2, GraduationCap, Link2, Bell,
//     ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin, Database, BookOpen, Lock
// } from 'lucide-react';
// import { doc, getDoc, setDoc } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import PageHeader from '../../components/common/PageHeader/PageHeader';
// import './SettingsPage.css';

// // Fallback assets
// import fallbackLogo from '../../assets/logo/mlab_logo.png';
// import fallbackSignature from '../../assets/Signatue_Zack_.png';
// import type { SystemSettings } from '../../types';


// export interface CustomCsvMapping {
//     id: string;
//     targetField: string;
//     csvHeader: string;
// }

// const DEFAULT_SETTINGS: SystemSettings = {
//     institutionName: "mLab Southern Africa",
//     companyRegistrationNumber: "2011/149875/08",
//     phone: "+27 012 844 0240",
//     email: "codetribe@mlab.co.za",
//     campuses: [
//         {
//             id: "campus-1",
//             name: "Kimberley Campus (Head Office)",
//             type: "physical",
//             address: "13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345",
//             siteAccreditationNumber: "SDP070824115131",
//             isDefault: true
//         }
//     ],
//     passMarkThreshold: 50,
//     attendanceRequirement: 80,
//     defaultCohortMonths: 12,
//     eisaLockEnabled: true,
//     contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
//     blockchainNetwork: "polygon_amoy",
//     rpcUrl: "https://rpc-amoy.polygon.technology/",
//     ipfsGateway: "https://gateway.pinata.cloud",
//     logoUrl: "",
//     signatureUrl: "",
//     csvMappings: {
//         fullName: "Learner Name",
//         idNumber: "ID Number",
//         email: "Email Address",
//         phone: "Phone Number",
//         startDate: "Start Date",
//         endDate: "Completion Date",
//         issueDate: "Issue Date",
//         cohort: "Cohort",
//         sdpCode: "SDP Code",
//         qualificationTitle: "Qualification Title",
//         saqaId: "SAQA Qual ID",
//         nqfLevel: "NQF Level",
//         credits: "Credits"
//     },
//     customCsvMappings: []
// };

// const CORE_MAPPINGS: { key: keyof SystemSettings['csvMappings'], label: string }[] = [
//     { key: 'fullName', label: 'Full Name' },
//     { key: 'idNumber', label: 'ID Number / Passport' },
//     { key: 'email', label: 'Email Address' },
//     { key: 'phone', label: 'Phone Number' },
//     { key: 'startDate', label: 'Start Date' },
//     { key: 'endDate', label: 'Completion Date' },
//     { key: 'issueDate', label: 'SoR Issue Date' },
//     { key: 'cohort', label: 'Cohort / Class Name' },
//     { key: 'sdpCode', label: 'SDP Code' },
//     { key: 'qualificationTitle', label: 'Qualification Title' },
//     { key: 'saqaId', label: 'SAQA Qual ID' },
//     { key: 'nqfLevel', label: 'NQF Level' },
//     { key: 'credits', label: 'Credits' }
// ];

// export const SettingsPage: React.FC = () => {
//     const navigate = useNavigate();
//     const { user, fetchSettings } = useStore();

//     const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'data' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

//     const [formData, setFormData] = useState<SystemSettings>(DEFAULT_SETTINGS);
//     const [originalData, setOriginalData] = useState<SystemSettings>(DEFAULT_SETTINGS);

//     const [isDirty, setIsDirty] = useState(false);
//     const [isSaving, setIsSaving] = useState(false);

//     const [isUploadingLogo, setIsUploadingLogo] = useState(false);
//     const [isUploadingSignature, setIsUploadingSignature] = useState(false);

//     useEffect(() => {
//         const initSettings = async () => {
//             try {
//                 const docRef = doc(db, "system_settings", "global");
//                 const docSnap = await getDoc(docRef);

//                 if (docSnap.exists()) {
//                     const data = docSnap.data() as SystemSettings;

//                     if ((data as any).sdpNumber && !data.companyRegistrationNumber) {
//                         data.companyRegistrationNumber = (data as any).sdpNumber;
//                     }

//                     // AGGRESSIVE DEFAULT ENFORCEMENT
//                     // If the database has empty strings saved from previous versions, overwrite them with defaults!
//                     const dbMappings: any = data.csvMappings || {};
//                     const safeMappings = { ...DEFAULT_SETTINGS.csvMappings };

//                     Object.keys(safeMappings).forEach(key => {
//                         const k = key as keyof typeof safeMappings;
//                         if (dbMappings[k] && dbMappings[k].trim() !== '') {
//                             safeMappings[k] = dbMappings[k];
//                         }
//                     });

//                     const mergedData = {
//                         ...DEFAULT_SETTINGS,
//                         ...data,
//                         csvMappings: safeMappings,
//                         customCsvMappings: data.customCsvMappings || []
//                     };

//                     setFormData(mergedData);
//                     setOriginalData(mergedData);
//                 }
//             } catch (error) {
//                 console.error("Error fetching system settings:", error);
//             }
//         };
//         initSettings();
//     }, []);

//     useEffect(() => {
//         const hasChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
//         setIsDirty(hasChanged);
//     }, [formData, originalData]);

//     const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
//         const { name, value, type } = e.target;
//         setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
//         setIsDirty(true);
//     };

//     const handleToggleChange = (name: keyof SystemSettings) => {
//         setFormData(prev => ({ ...prev, [name]: !prev[name as keyof SystemSettings] }));
//         setIsDirty(true);
//     };

//     const updateNested = (category: keyof SystemSettings, field: string, val: string) => {
//         setFormData(prev => ({
//             ...prev,
//             [category]: { ...(prev[category] as any), [field]: val }
//         }));
//         setIsDirty(true);
//     };

//     const handleAddCampus = () => {
//         setFormData(prev => ({
//             ...prev,
//             campuses: [
//                 ...prev.campuses,
//                 { id: `campus-${Date.now()}`, name: '', type: 'physical', address: '', siteAccreditationNumber: '', isDefault: prev.campuses.length === 0 }
//             ]
//         }));
//         setIsDirty(true);
//     };

//     const handleCampusChange = (id: string, field: keyof CampusLocation, value: string) => {
//         setFormData(prev => ({ ...prev, campuses: prev.campuses.map(c => c.id === id ? { ...c, [field]: value } : c) }));
//         setIsDirty(true);
//     };

//     const handleRemoveCampus = (id: string) => {
//         setFormData(prev => {
//             const newCampuses = prev.campuses.filter(c => c.id !== id);
//             if (newCampuses.length > 0 && !newCampuses.some(c => c.isDefault)) newCampuses[0].isDefault = true;
//             return { ...prev, campuses: newCampuses };
//         });
//         setIsDirty(true);
//     };

//     const handleSetDefaultCampus = (id: string) => {
//         setFormData(prev => ({ ...prev, campuses: prev.campuses.map(c => ({ ...c, isDefault: c.id === id })) }));
//         setIsDirty(true);
//     };

//     const handleAddCustomMapping = () => {
//         setFormData(prev => ({
//             ...prev,
//             customCsvMappings: [
//                 ...(prev.customCsvMappings || []),
//                 { id: `custom-${Date.now()}`, targetField: '', csvHeader: '' }
//             ]
//         }));
//         setIsDirty(true);
//     };

//     const handleCustomMappingChange = (id: string, field: 'targetField' | 'csvHeader', value: string) => {
//         setFormData(prev => ({
//             ...prev,
//             customCsvMappings: (prev.customCsvMappings || []).map(m => m.id === id ? { ...m, [field]: value } : m)
//         }));
//         setIsDirty(true);
//     };

//     const handleRemoveCustomMapping = (id: string) => {
//         setFormData(prev => ({
//             ...prev,
//             customCsvMappings: (prev.customCsvMappings || []).filter(m => m.id !== id)
//         }));
//         setIsDirty(true);
//     };

//     const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'signatureUrl') => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         const isLogo = field === 'logoUrl';
//         isLogo ? setIsUploadingLogo(true) : setIsUploadingSignature(true);

//         try {
//             const storage = getStorage();
//             const fileRef = ref(storage, `brand_assets/${field}_${Date.now()}_${file.name}`);
//             await uploadBytes(fileRef, file);
//             const downloadURL = await getDownloadURL(fileRef);
//             setFormData(prev => ({ ...prev, [field]: downloadURL }));
//             setIsDirty(true);
//         } catch (error) {
//             console.error(`Failed to upload ${field}:`, error);
//             alert("Failed to upload image. Please try again.");
//         } finally {
//             isLogo ? setIsUploadingLogo(false) : setIsUploadingSignature(false);
//         }
//     };

//     const handleDiscard = () => {
//         setFormData(originalData);
//         setIsDirty(false);
//     };

//     const handleSave = async () => {
//         setIsSaving(true);
//         try {
//             const docRef = doc(db, "system_settings", "global");
//             const payload = { ...formData, updatedAt: new Date().toISOString(), updatedBy: user?.uid || 'unknown_admin' };
//             await setDoc(docRef, payload, { merge: true });

//             if (fetchSettings) await fetchSettings();
//             setOriginalData(formData);
//             setIsDirty(false);
//         } catch (error) {
//             console.error("Failed to save settings:", error);
//             alert("Failed to save settings. Check your permissions.");
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     const TABS = [
//         { id: 'org', label: 'Organization', icon: Building2 },
//         { id: 'academic', label: 'Academic Rules', icon: GraduationCap },
//         { id: 'data', label: 'Data & Imports', icon: Database },
//         { id: 'web3', label: 'Web3 & Blockchain', icon: Link2 },
//         { id: 'notifications', label: 'Notifications', icon: Bell },
//         { id: 'audit', label: 'Security & Audit', icon: ShieldAlert },
//         { id: 'profile', label: 'My Profile', icon: User },
//     ] as const;

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
//             <Sidebar role={user?.role} currentNav="settings" setCurrentNav={(nav) => navigate(`/admin?tab=${nav}`)} onLogout={() => navigate('/login')} />

//             <main className="main-wrapper settings-wrapper">
//                 <PageHeader theme="default" variant="hero" eyebrow="System Configuration" title="Platform Settings" description="Manage global rules, templates, and blockchain infrastructure." />

//                 <div className="settings-container">

//                     <aside className="settings-sidebar">
//                         <nav className="settings-nav">
//                             {TABS.map(tab => {
//                                 const Icon = tab.icon;
//                                 return (
//                                     <button key={tab.id} className={`settings-nav__item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id as any)}>
//                                         <Icon size={18} className="settings-nav__icon" /> {tab.label}
//                                     </button>
//                                 );
//                             })}
//                         </nav>
//                     </aside>

//                     <div className="settings-content">

//                         {/* ORGANIZATION SETTINGS */}
//                         {activeTab === 'org' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Organization Profile</h2>
//                                 <p className="settings-section__desc">This information appears on generated Statements of Results and public portals.</p>

//                                 <div className="settings-card">
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Institution Name</label>
//                                             <input type="text" name="institutionName" className="mlab-input" value={formData.institutionName} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Company Registration No. (CIPC)</label>
//                                             <input type="text" name="companyRegistrationNumber" className="mlab-input" placeholder="e.g., 2012/123456/08" value={formData.companyRegistrationNumber} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Global Contact Email</label>
//                                             <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Global Contact Phone</label>
//                                             <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', marginBottom: '1rem' }}>
//                                     <div>
//                                         <h2 className="settings-section__title" style={{ margin: 0 }}>Accredited Delivery Sites</h2>
//                                         <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Manage your physical campuses and online delivery modes.</p>
//                                     </div>
//                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={handleAddCampus}>
//                                         <Plus size={16} /> Add Location
//                                     </button>
//                                 </div>

//                                 <div className="settings-locations-list">
//                                     {formData.campuses.map((campus, index) => (
//                                         <div key={campus.id} className={`location-card ${campus.isDefault ? 'location-card--default' : ''}`}>
//                                             <div className="location-card__header">
//                                                 <div className="location-card__title">
//                                                     <MapPin size={16} color={campus.isDefault ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)'} />
//                                                     <span className="badge-number">{index + 1}</span>
//                                                     {campus.isDefault && <span className="default-badge">Primary Location</span>}
//                                                 </div>
//                                                 <div className="location-card__actions">
//                                                     {!campus.isDefault && (
//                                                         <button className="location-action-btn text-blue" onClick={() => handleSetDefaultCampus(campus.id)}>Set as Primary</button>
//                                                     )}
//                                                     <button className="location-action-btn text-red" onClick={() => handleRemoveCampus(campus.id)} disabled={formData.campuses.length === 1}>
//                                                         <Trash2 size={16} />
//                                                     </button>
//                                                 </div>
//                                             </div>
//                                             <div className="settings-form-grid" style={{ marginTop: '1rem' }}>
//                                                 <div className="mlab-form-group">
//                                                     <label>Campus Name</label>
//                                                     <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Tshwane Hub" />
//                                                 </div>
//                                                 <div className="mlab-form-group">
//                                                     <label>Delivery Mode</label>
//                                                     <select className="mlab-input" value={campus.type} onChange={(e) => handleCampusChange(campus.id, 'type', e.target.value)}>
//                                                         <option value="physical">Physical Campus</option>
//                                                         <option value="online">Online / Distance</option>
//                                                     </select>
//                                                 </div>
//                                                 <div className="mlab-form-group col-span-2">
//                                                     <label>Site Accreditation No. (SDP)</label>
//                                                     <input type="text" className="mlab-input" value={campus.siteAccreditationNumber || ''} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP070824115131" />
//                                                 </div>
//                                                 <div className="mlab-form-group col-span-2">
//                                                     <label>Physical Address {campus.type === 'online' && <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>(Optional for Online)</span>}</label>
//                                                     <textarea className="mlab-input" rows={2} value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} placeholder="Full street address..." />
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     ))}
//                                 </div>

//                                 <h2 className="settings-section__title" style={{ marginTop: '2rem' }}>Brand Assets</h2>
//                                 <div className="settings-card brand-assets-grid">
//                                     <div className="asset-upload-box">
//                                         <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>Primary Institution Logo</h3>
//                                         <div className="asset-preview logo-preview">
//                                             <img src={formData.logoUrl || fallbackLogo} alt="Logo" />
//                                         </div>
//                                         <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2" style={{ cursor: isUploadingLogo ? 'not-allowed' : 'pointer', display: 'inline-flex' }}>
//                                             {isUploadingLogo ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
//                                             {isUploadingLogo ? "Uploading..." : "Replace Logo"}
//                                             <input type="file" accept="image/png, image/jpeg, image/svg+xml" hidden onChange={(e) => handleFileUpload(e, 'logoUrl')} disabled={isUploadingLogo} />
//                                         </label>
//                                     </div>
//                                     <div className="asset-upload-box">
//                                         <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>Authorized Signature (Statement of Results)</h3>
//                                         <div className="asset-preview signature-preview">
//                                             <img src={formData.signatureUrl || fallbackSignature} alt="Signature" />
//                                         </div>
//                                         <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2" style={{ cursor: isUploadingSignature ? 'not-allowed' : 'pointer', display: 'inline-flex' }}>
//                                             {isUploadingSignature ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
//                                             {isUploadingSignature ? "Uploading..." : "Replace Signature"}
//                                             <input type="file" accept="image/png" hidden onChange={(e) => handleFileUpload(e, 'signatureUrl')} disabled={isUploadingSignature} />
//                                         </label>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* ACADEMIC RULES */}
//                         {activeTab === 'academic' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Academic Rules & Compliance</h2>
//                                 <p className="settings-section__desc">Configure standard thresholds and automation rules for cohorts and assessments.</p>
//                                 <div className="settings-card">
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group">
//                                             <label>Pass Mark Threshold (%)</label>
//                                             <div className="input-with-suffix">
//                                                 <input type="number" name="passMarkThreshold" className="mlab-input" value={formData.passMarkThreshold} onChange={handleInputChange} min="0" max="100" />
//                                                 <span className="suffix">%</span>
//                                             </div>
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Minimum Attendance (%)</label>
//                                             <div className="input-with-suffix">
//                                                 <input type="number" name="attendanceRequirement" className="mlab-input" value={formData.attendanceRequirement} onChange={handleInputChange} min="0" max="100" />
//                                                 <span className="suffix">%</span>
//                                             </div>
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Default Cohort Duration (Months)</label>
//                                             <div className="input-with-suffix">
//                                                 <input type="number" name="defaultCohortMonths" className="mlab-input" value={formData.defaultCohortMonths} onChange={handleInputChange} min="1" max="60" />
//                                                 <span className="suffix">Months</span>
//                                             </div>
//                                         </div>
//                                     </div>
//                                     <hr className="settings-divider" />
//                                     <div className="setting-row-toggle">
//                                         <div className="setting-toggle-text">
//                                             <h4>Strict EISA Lock</h4>
//                                             <p>Prevent facilitators from editing module grades once a learner has been marked as "EISA Admitted".</p>
//                                         </div>
//                                         <label className="mlab-toggle">
//                                             <input type="checkbox" checked={formData.eisaLockEnabled} onChange={() => handleToggleChange('eisaLockEnabled')} />
//                                             <span className="mlab-toggle-slider"></span>
//                                         </label>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* DATA & IMPORTS (DYNAMIC BUILDER) */}
//                         {activeTab === 'data' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Data Import Mappings</h2>
//                                 <p className="settings-section__desc">
//                                     Configure the exact column headers the system should look for when importing spreadsheets.
//                                     You can map required system fields to external column names, or add entirely new custom columns.
//                                 </p>

//                                 <div className="settings-card" style={{ marginBottom: '2rem', padding: 0, overflow: 'hidden' }}>
//                                     <div style={{ padding: '1.5rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
//                                             <GraduationCap size={20} color="var(--mlab-blue)" />
//                                             <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600 }}>Statement of Results (SoR) Mapper</h3>
//                                         </div>
//                                         <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Map the columns for learner enrollments and offline historical records.</p>
//                                     </div>

//                                     <div style={{ display: 'flex', flexDirection: 'column' }}>
//                                         {/* TABLE HEADER */}
//                                         <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>
//                                             <div>System Data Target</div>
//                                             <div>Expected CSV Column Header</div>
//                                             <div style={{ textAlign: 'center' }}>Action</div>
//                                         </div>

//                                         {/* CORE LOCKED ROWS WITH PLACEHOLDERS */}
//                                         {CORE_MAPPINGS.map(core => (
//                                             <div key={core.key} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
//                                                 <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                     <div style={{ fontWeight: 500, color: '#0f172a', fontSize: '0.95rem' }}>{core.label}</div>
//                                                     <span style={{ fontSize: '0.7rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>Required</span>
//                                                 </div>
//                                                 <input
//                                                     type="text"
//                                                     className="mlab-input"
//                                                     style={{ margin: 0, padding: '0.5rem' }}
//                                                     value={formData.csvMappings?.[core.key] || ''}
//                                                     placeholder={`e.g., ${DEFAULT_SETTINGS.csvMappings[core.key]}`}
//                                                     onChange={(e) => updateNested('csvMappings', core.key, e.target.value)}
//                                                 />
//                                                 <div style={{ textAlign: 'center' }} title="System core fields cannot be removed">
//                                                     <Lock size={16} color="#cbd5e1" />
//                                                 </div>
//                                             </div>
//                                         ))}

//                                         {/* CUSTOM ADDED ROWS */}
//                                         {formData.customCsvMappings?.map(custom => (
//                                             <div key={custom.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fcfcfd' }}>
//                                                 <input
//                                                     type="text"
//                                                     className="mlab-input"
//                                                     style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
//                                                     placeholder="Target (e.g. Demographics: Gender)"
//                                                     value={custom.targetField}
//                                                     onChange={(e) => handleCustomMappingChange(custom.id, 'targetField', e.target.value)}
//                                                 />
//                                                 <input
//                                                     type="text"
//                                                     className="mlab-input"
//                                                     style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
//                                                     placeholder="CSV Header (e.g. Gender Code)"
//                                                     value={custom.csvHeader}
//                                                     onChange={(e) => handleCustomMappingChange(custom.id, 'csvHeader', e.target.value)}
//                                                 />
//                                                 <div style={{ textAlign: 'center' }}>
//                                                     <button
//                                                         className="mlab-icon-btn text-red"
//                                                         onClick={() => handleRemoveCustomMapping(custom.id)}
//                                                         style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
//                                                         title="Remove mapping"
//                                                     >
//                                                         <Trash2 size={16} />
//                                                     </button>
//                                                 </div>
//                                             </div>
//                                         ))}
//                                     </div>

//                                     {/* ADD ROW BUTTON */}
//                                     <div style={{ padding: '1rem 1.5rem', background: 'white' }}>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm" onClick={handleAddCustomMapping}>
//                                             <Plus size={14} /> Add Custom Field Mapping
//                                         </button>
//                                     </div>
//                                 </div>

//                                 {/* PROGRAMME IMPORT PLACEHOLDER */}
//                                 <div className="settings-card" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
//                                             <BookOpen size={20} color="var(--mlab-grey)" />
//                                             <h3 style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '1.1rem', fontWeight: 600 }}>Programme & Curriculum Import</h3>
//                                         </div>
//                                         <span style={{ fontSize: '0.7rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, color: '#64748b' }}>Coming Soon</span>
//                                     </div>
//                                     <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Configure column mappings for bulk importing QCTO curriculum blueprints.</p>
//                                 </div>

//                             </div>
//                         )}

//                         {/* WEB3 & BLOCKCHAIN */}
//                         {activeTab === 'web3' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Web3 & Blockchain Infrastructure</h2>
//                                 <p className="settings-section__desc">Manage your decentralized registry, smart contract configurations, and IPFS gateways.</p>
//                                 <div className="settings-card">
//                                     <h3 style={{ marginBottom: '1.5rem', color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Smart Contract Configuration</h3>
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group">
//                                             <label>Blockchain Network</label>
//                                             <select name="blockchainNetwork" className="mlab-input" value={formData.blockchainNetwork} onChange={handleInputChange}>
//                                                 <option value="polygon_mainnet">Polygon (Mainnet)</option>
//                                                 <option value="polygon_amoy">Polygon Amoy (Testnet)</option>
//                                                 <option value="ethereum_mainnet">Ethereum (Mainnet)</option>
//                                                 <option value="sepolia">Sepolia (Testnet)</option>
//                                             </select>
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>RPC Provider URL</label>
//                                             <input type="text" name="rpcUrl" className="mlab-input" value={formData.rpcUrl} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Registry Smart Contract Address</label>
//                                             <input type="text" name="contractAddress" className="mlab-input" value={formData.contractAddress} onChange={handleInputChange} />
//                                         </div>
//                                     </div>
//                                     <hr className="settings-divider" />
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Pinata Dedicated Gateway URL</label>
//                                             <input type="text" name="ipfsGateway" className="mlab-input" value={formData.ipfsGateway} onChange={handleInputChange} />
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {['notifications', 'audit', 'profile'].includes(activeTab) && (
//                             <div className="settings-section animate-fade-in empty-tab">
//                                 <IconPlaceholder tab={activeTab} />
//                                 <h2>Under Construction</h2>
//                             </div>
//                         )}
//                     </div>
//                 </div>
//             </main>

//             <div className={`settings-save-bar ${isDirty ? 'visible' : ''}`}>
//                 <div className="save-bar-content">
//                     <div className="save-bar-text">
//                         <AlertCircle size={18} color="#d97706" />
//                         <span>You have unsaved changes.</span>
//                     </div>
//                     <div className="save-bar-actions">
//                         <button className="mlab-btn mlab-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
//                         <button className="mlab-btn mlab-btn--green" onClick={handleSave} disabled={isSaving}>
//                             {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save Changes
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// const IconPlaceholder = ({ tab }: { tab: string }) => {
//     if (tab === 'notifications') return <Bell size={48} className="empty-icon" />;
//     if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon" />;
//     return <User size={48} className="empty-icon" />;
// };