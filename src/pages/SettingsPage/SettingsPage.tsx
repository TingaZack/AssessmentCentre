// src/pages/SettingsPage/SettingsPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, GraduationCap, Link2, Bell,
    ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin, Database, Lock, CheckCircle2, Edit2, Globe, BookOpen, Wifi
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
    institutionName: "",
    companyRegistrationNumber: "",
    phone: "",
    email: "",
    institutionAddress: "",
    institutionCity: "",
    institutionProvince: "",
    institutionPostalCode: "",
    logoUrl: "",
    signatureUrl: "",
    contractAddress: "",
    rpcUrl: "",
    institutionLat: 0,
    institutionLng: 0,
    campuses: [],
    customCsvMappings: [],
    passMarkThreshold: 50,
    attendanceRequirement: 80,
    defaultCohortMonths: 12,
    eisaLockEnabled: true,
    blockchainNetwork: "polygon_amoy",
    ipfsGateway: "https://gateway.pinata.cloud",
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
    }
};

export const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, fetchSettings } = useStore();

    // IDENTIFY ROLE
    const isSuperAdmin = (user as any)?.isSuperAdmin === true;

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

                    const dbMappings: any = data.csvMappings || {};
                    const safeMappings = { ...DEFAULT_SETTINGS.csvMappings };

                    Object.keys(safeMappings).forEach(key => {
                        const k = key as keyof typeof safeMappings;
                        if (dbMappings[k] && dbMappings[k].trim() !== '') {
                            safeMappings[k] = dbMappings[k];
                        }
                    });

                    let loadedCampuses = data.campuses || DEFAULT_SETTINGS.campuses;
                    const seenIds = new Set();
                    let foundDuplicates = false;

                    loadedCampuses = loadedCampuses.map((campus: any, index: number) => {
                        let finalId = campus.id || `campus-${Date.now()}-${index}`;
                        if (seenIds.has(finalId)) {
                            finalId = `campus-fixed-${Date.now()}-${index}`;
                            foundDuplicates = true;
                        }
                        seenIds.add(finalId);

                        // DECODE BSSIDs from Base64 for viewing in UI
                        const decodedBssids = (campus.wifiSettings?.allowedBssids || []).map((b: string) => {
                            try { return atob(b); } catch { return b; }
                        });

                        return {
                            ...campus,
                            id: finalId,
                            wifiSettings: {
                                ...campus.wifiSettings,
                                allowedBssids: decodedBssids
                            }
                        };
                    });

                    const mergedData = {
                        ...DEFAULT_SETTINGS,
                        ...data,
                        campuses: loadedCampuses,
                        csvMappings: safeMappings,
                        customCsvMappings: data.customCsvMappings || []
                    };

                    setFormData(mergedData);
                    setOriginalData(mergedData);

                    if (foundDuplicates) {
                        setIsDirty(true);
                    }
                }
            } catch (error) {
                console.error("Error fetching system settings:", error);
            }
        };
        initSettings();
    }, []);

    useEffect(() => {
        const hasChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
        setIsDirty(hasChanged);
    }, [formData, originalData]);

    const openInGoogleMaps = (lat: number, lng: number) => {
        if (!lat || !lng || lat === 0 || lng === 0) return;
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    };

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

    const updateNested = (category: string, field: string, val: string) => {
        setFormData((prev: any) => ({
            ...prev,
            [category]: { ...(prev[category] || {}), [field]: val }
        }));
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
                {
                    id: newId,
                    name: '',
                    type: 'physical',
                    address: '',
                    province: '',
                    city: '',
                    postalCode: '',
                    siteAccreditationNumber: '',
                    isDefault: prev.campuses.length === 0,
                    wifiSettings: { enforceWifi: false, ssid: '', allowedBssids: [] }
                }
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

    const handleAddCustomMapping = () => {
        setFormData((prev: any) => ({
            ...prev,
            customCsvMappings: [
                ...(prev.customCsvMappings || []),
                { id: `custom-${Date.now()}`, targetField: '', csvHeader: '' }
            ]
        }));
        setIsDirty(true);
    };

    const handleCustomMappingChange = (id: string, field: 'targetField' | 'csvHeader', value: string) => {
        setFormData((prev: any) => ({
            ...prev,
            customCsvMappings: (prev.customCsvMappings || []).map((m: any) => m.id === id ? { ...m, [field]: value } : m)
        }));
        setIsDirty(true);
    };

    const handleRemoveCustomMapping = (id: string) => {
        setFormData((prev: any) => ({
            ...prev,
            customCsvMappings: (prev.customCsvMappings || []).filter((m: any) => m.id !== id)
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

    const handleDiscard = () => {
        setFormData(originalData);
        setIsDirty(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const docRef = doc(db, "system_settings", "global");

            // ENCODE BSSIDs before saving to DB
            const securedCampuses = formData.campuses.map((c: any) => ({
                ...c,
                wifiSettings: {
                    ...c.wifiSettings,
                    allowedBssids: (c.wifiSettings?.allowedBssids || []).map((b: string) => btoa(b))
                }
            }));

            const payload = {
                ...formData,
                campuses: securedCampuses,
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
        { id: 'web3', label: 'Blockchain', icon: Link2 },
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
                                                    <MapPin size={18} color={campus.isDefault ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)'} />
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
                                                    <label>Delivery Mode</label>
                                                    <select className="mlab-input" value={campus.type || 'physical'} onChange={(e) => handleCampusChange(campus.id, 'type', e.target.value)}>
                                                        <option value="physical">Physical Campus</option>
                                                        <option value="online">Online / Distance</option>
                                                    </select>
                                                </div>
                                                <div className="mlab-form-group col-span-2">
                                                    <label>QCTO SDP Accreditation No.</label>
                                                    <input type="text" className="mlab-input" value={campus.siteAccreditationNumber} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP0708..." />
                                                </div>

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

                                                {/* CAMPUS CONFIG EDITOR (ADDRESS & WIFI SHIELD) */}
                                                <div className="mlab-form-group col-span-2 bg-slate-50 p-5 rounded-lg mt-2">
                                                    <div className="editor-title mb-4"><Edit2 size={14} /> <span>Site Configuration (Address & Security)</span></div>

                                                    {/* Address Overrides */}
                                                    <div className="mlab-form-group mb-4">
                                                        <label className="text-slate-700">Full Address (Edit to add street number)</label>
                                                        <input type="text" className="mlab-input bg-white" value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} />
                                                    </div>
                                                    <div className="settings-form-grid">
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">City</label>
                                                            <input type="text" className="mlab-input bg-white" value={campus.city || ''} onChange={(e) => handleCampusChange(campus.id, 'city', e.target.value)} />
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Province</label>
                                                            <select className="mlab-input bg-white" value={campus.province || ''} onChange={(e) => handleCampusChange(campus.id, 'province', e.target.value)}>
                                                                <option value="">Select...</option>
                                                                {QCTO_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Postal Code</label>
                                                            <input type="text" className="mlab-input bg-white" value={campus.postalCode || ''} onChange={(e) => handleCampusChange(campus.id, 'postalCode', e.target.value)} />
                                                        </div>
                                                    </div>

                                                    <hr className="my-6 border-slate-200" />

                                                    {/* Wi-Fi Security Shield */}
                                                    <div className="editor-title mb-4">
                                                        <Wifi size={16} /> SECURITY: NETWORK SHIELD (WIFI GEOFENCE)
                                                    </div>
                                                    <div className="settings-form-grid">
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">SSID (Wi-Fi Name)</label>
                                                            <input
                                                                type="text"
                                                                className="mlab-input bg-white"
                                                                placeholder="e.g. Computer Room"
                                                                value={campus.wifiSettings?.ssid || ''}
                                                                onChange={(e) => handleCampusChange(campus.id, 'wifiSettings', { ...campus.wifiSettings, ssid: e.target.value })}
                                                            />
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Enforce Wi-Fi Check</label>
                                                            <select
                                                                className="mlab-input bg-white"
                                                                value={campus.wifiSettings?.enforceWifi ? 'yes' : 'no'}
                                                                onChange={(e) => handleCampusChange(campus.id, 'wifiSettings', { ...campus.wifiSettings, enforceWifi: e.target.value === 'yes' })}
                                                            >
                                                                <option value="no">GPS Only (Relaxed)</option>
                                                                <option value="yes">GPS + Wi-Fi (Strict)</option>
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group col-span-2">
                                                            <label className="text-slate-700">Authorized Router BSSIDs (Physical MACs - Comma Separated)</label>
                                                            <input
                                                                type="text"
                                                                className="mlab-input bg-white"
                                                                style={{ fontFamily: 'monospace' }}
                                                                placeholder="f4:1e:57:5d:e7:df, a1:b2:c3:d4:e5:f6"
                                                                value={Array.isArray(campus.wifiSettings?.allowedBssids) ? campus.wifiSettings.allowedBssids.join(', ') : ''}
                                                                onChange={(e) => handleCampusChange(campus.id, 'wifiSettings', { ...campus.wifiSettings, allowedBssids: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(s => s !== '') })}
                                                            />
                                                        </div>
                                                    </div>

                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

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
                                    <div style={{ padding: '1.5rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                            <GraduationCap size={20} color="var(--mlab-blue)" />
                                            <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600 }}>Statement of Results (SoR) Mapper</h3>
                                        </div>
                                        <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Map the columns for learner enrollments and offline historical records.</p>
                                    </div>

                                    <div className="mapping-table-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>
                                        <div>System Internal Field</div>
                                        <div>Expected CSV Column Header</div>
                                        <div className="text-center">Action</div>
                                    </div>

                                    {CORE_MAPPINGS.map(core => (
                                        <div key={core.key} className="mapping-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div className="font-medium text-slate-900">{core.label}</div>
                                                <span style={{ fontSize: '0.7rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>Required</span>
                                            </div>
                                            <input
                                                type="text"
                                                className="mlab-input m-0"
                                                style={{ padding: '0.5rem' }}
                                                value={formData.csvMappings[core.key] || ''}
                                                onChange={(e) => updateNested('csvMappings', core.key, e.target.value)}
                                            />
                                            <div className="text-center"><Lock size={14} color="#cbd5e1" /></div>
                                        </div>
                                    ))}

                                    {formData.customCsvMappings?.map((custom: any) => (
                                        <div key={custom.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fcfcfd' }}>
                                            <input
                                                type="text"
                                                className="mlab-input"
                                                style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
                                                placeholder="Target (e.g. Demographics: Gender)"
                                                value={custom.targetField}
                                                onChange={(e) => handleCustomMappingChange(custom.id, 'targetField', e.target.value)}
                                            />
                                            <input
                                                type="text"
                                                className="mlab-input"
                                                style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
                                                placeholder="CSV Header (e.g. Gender Code)"
                                                value={custom.csvHeader}
                                                onChange={(e) => handleCustomMappingChange(custom.id, 'csvHeader', e.target.value)}
                                            />
                                            <div style={{ textAlign: 'center' }}>
                                                <button
                                                    className="mlab-icon-btn text-red"
                                                    onClick={() => handleRemoveCustomMapping(custom.id)}
                                                    style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
                                                    title="Remove mapping"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <div style={{ padding: '1rem 1.5rem', background: 'white' }}>
                                        <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm" onClick={handleAddCustomMapping}>
                                            <Plus size={14} /> Add Custom Field Mapping
                                        </button>
                                    </div>
                                </div>

                                <div className="settings-card mt-6" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <BookOpen size={20} color="var(--mlab-grey)" />
                                            <h3 style={{ margin: 0, color: 'var(--mlab-grey)', fontSize: '1.1rem', fontWeight: 600 }}>Programme & Curriculum Import</h3>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', background: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', fontWeight: 600, color: '#64748b' }}>Coming Soon</span>
                                    </div>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Configure column mappings for bulk importing QCTO curriculum blueprints.</p>
                                </div>
                            </div>
                        )}

                        {/* 4. WEB3 CONFIGURATION */}
                        {activeTab === 'web3' && (
                            <div className="settings-section animate-fade-in">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                    <div>
                                        <h2 className="settings-section__title" style={{ margin: 0 }}>Blockchain Protocol Settings</h2>
                                        <p className="settings-section__desc" style={{ margin: 0 }}>Core cryptographic infrastructure and decentralized registry settings.</p>
                                    </div>
                                    {!isSuperAdmin && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', color: '#ef4444', padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
                                            <Lock size={14} /> System Owner Only
                                        </div>
                                    )}
                                </div>

                                <div className="settings-card" style={{ opacity: isSuperAdmin ? 1 : 0.8 }}>
                                    <h3 style={{
                                        marginBottom: '1.5rem',
                                        color: isSuperAdmin ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
                                        fontSize: '1.1rem',
                                        fontWeight: 600,
                                        fontFamily: 'var(--font-heading)',
                                        textTransform: 'uppercase',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px'
                                    }}>
                                        <Link2 size={18} /> Smart Contract Configuration
                                    </h3>

                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group">
                                            <label>Decentralized Network</label>
                                            <select
                                                name="blockchainNetwork"
                                                className="mlab-input"
                                                value={formData.blockchainNetwork}
                                                onChange={handleInputChange}
                                                disabled={!isSuperAdmin}
                                                style={!isSuperAdmin ? { cursor: 'not-allowed', background: '#f8fafc', color: 'var(--mlab-grey)' } : {}}
                                            >
                                                <option value="polygon_mainnet">Polygon Mainnet</option>
                                                <option value="polygon_amoy">Polygon Amoy (Testnet)</option>
                                                <option value="ethereum_mainnet">Ethereum (Mainnet)</option>
                                                <option value="sepolia">Sepolia (Testnet)</option>
                                            </select>
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Dedicated RPC URL</label>
                                            <input
                                                type="text"
                                                name="rpcUrl"
                                                className="mlab-input"
                                                value={formData.rpcUrl}
                                                onChange={handleInputChange}
                                                disabled={!isSuperAdmin}
                                                style={!isSuperAdmin ? { cursor: 'not-allowed', background: '#f8fafc', color: 'var(--mlab-grey)' } : {}}
                                            />
                                        </div>
                                        <div className="mlab-form-group col-span-2">
                                            <label>Registry Smart Contract Address</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    name="contractAddress"
                                                    className="mlab-input"
                                                    value={formData.contractAddress}
                                                    onChange={handleInputChange}
                                                    disabled={!isSuperAdmin}
                                                    style={{
                                                        fontFamily: 'monospace',
                                                        paddingRight: !isSuperAdmin ? '2.5rem' : '1rem',
                                                        cursor: !isSuperAdmin ? 'not-allowed' : 'text',
                                                        background: !isSuperAdmin ? '#f8fafc' : 'white',
                                                        color: !isSuperAdmin ? 'var(--mlab-grey)' : 'inherit'
                                                    }}
                                                />
                                                {!isSuperAdmin && <Lock size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }} />}
                                            </div>
                                        </div>
                                    </div>

                                    <hr className="settings-divider mt-6 mb-6" />

                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group col-span-2">
                                            <label>Pinata Dedicated Gateway URL (IPFS)</label>
                                            <div style={{ position: 'relative' }}>
                                                <input
                                                    type="text"
                                                    name="ipfsGateway"
                                                    className="mlab-input"
                                                    value={formData.ipfsGateway}
                                                    onChange={handleInputChange}
                                                    placeholder="https://gateway.pinata.cloud"
                                                    disabled={!isSuperAdmin}
                                                    style={{
                                                        paddingRight: !isSuperAdmin ? '2.5rem' : '1rem',
                                                        cursor: !isSuperAdmin ? 'not-allowed' : 'text',
                                                        background: !isSuperAdmin ? '#f8fafc' : 'white',
                                                        color: !isSuperAdmin ? 'var(--mlab-grey)' : 'inherit'
                                                    }}
                                                />
                                                {!isSuperAdmin && <Lock size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }} />}
                                            </div>
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
                            onClick={handleDiscard}
                            disabled={isSaving}
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
    if (tab === 'notifications') return <Bell size={48} className="empty-icon text-slate-300" />;
    if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon text-slate-300" />;
    return <User size={48} className="empty-icon text-slate-300" />;
};



// // src/pages/SettingsPage/SettingsPage.tsx

// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     Building2, GraduationCap, Link2, Bell,
//     ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin, Database, Lock, CheckCircle2, Edit2, Globe, BookOpen
// } from 'lucide-react';
// import { doc, getDoc, setDoc } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import PageHeader from '../../components/common/PageHeader/PageHeader';
// import Autocomplete from "react-google-autocomplete";
// import './SettingsPage.css';

// // Fallback assets
// import fallbackLogo from '../../assets/logo/mlab_logo.png';
// import fallbackSignature from '../../assets/Signatue_Zack_.png';

// // ─── DICTIONARIES ─────────────────────────────────────────────────────────

// const QCTO_PROVINCES = [
//     "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
//     "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
// ];

// const CORE_MAPPINGS = [
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

// const DEFAULT_SETTINGS: any = {
//     // Strings (Text fields) - Hollowed out safely
//     institutionName: "",
//     companyRegistrationNumber: "",
//     phone: "",
//     email: "",
//     institutionAddress: "",
//     institutionCity: "",
//     institutionProvince: "",
//     institutionPostalCode: "",
//     logoUrl: "",
//     signatureUrl: "",
//     contractAddress: "",
//     rpcUrl: "",

//     // Doubles (Coordinates) - Safe zero defaults
//     institutionLat: 0,
//     institutionLng: 0,

//     // Arrays - Empty brackets to prevent .map() crashes
//     campuses: [],
//     customCsvMappings: [],

//     // Int64 (Numbers) - Standard fallback logic
//     passMarkThreshold: 50,
//     attendanceRequirement: 80,
//     defaultCohortMonths: 12,

//     // Booleans (Toggles)
//     eisaLockEnabled: true,

//     // Generic System Defaults (Safe to keep as strings)
//     blockchainNetwork: "polygon_amoy",
//     ipfsGateway: "https://gateway.pinata.cloud",

//     // Maps (Objects) - Required to prevent undefined object crashes
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
//     }
// };

// export const SettingsPage: React.FC = () => {
//     const navigate = useNavigate();
//     const { user, fetchSettings } = useStore();

//     // IDENTIFY ROLE
//     const isSuperAdmin = (user as any)?.isSuperAdmin === true;

//     // Navigation state
//     const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'data' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

//     // Data state
//     const [formData, setFormData] = useState<any>(DEFAULT_SETTINGS);
//     const [originalData, setOriginalData] = useState<any>(DEFAULT_SETTINGS);

//     // UI State
//     const [isDirty, setIsDirty] = useState(false);
//     const [isSaving, setIsSaving] = useState(false);
//     const [isUploadingLogo, setIsUploadingLogo] = useState(false);
//     const [isUploadingSignature, setIsUploadingSignature] = useState(false);

//     // Load settings from Firestore on mount
//     useEffect(() => {
//         const initSettings = async () => {
//             try {
//                 const docRef = doc(db, "system_settings", "global");
//                 const docSnap = await getDoc(docRef);

//                 if (docSnap.exists()) {
//                     const data = docSnap.data();

//                     // AGGRESSIVE DEFAULT ENFORCEMENT for Mappings
//                     const dbMappings: any = data.csvMappings || {};
//                     const safeMappings = { ...DEFAULT_SETTINGS.csvMappings };

//                     Object.keys(safeMappings).forEach(key => {
//                         const k = key as keyof typeof safeMappings;
//                         if (dbMappings[k] && dbMappings[k].trim() !== '') {
//                             safeMappings[k] = dbMappings[k];
//                         }
//                     });

//                     // FIX: SELF-HEALING CAMPUS IDs 🚀
//                     // Scans the array. If it finds duplicate IDs (e.g., multiple "campus-1"s), 
//                     // it generates fresh, unique IDs for them.
//                     let loadedCampuses = data.campuses || DEFAULT_SETTINGS.campuses;
//                     const seenIds = new Set();
//                     let foundDuplicates = false;

//                     loadedCampuses = loadedCampuses.map((campus: any, index: number) => {
//                         let finalId = campus.id || `campus-${Date.now()}-${index}`;

//                         // If we already saw this ID, it's a duplicate! Fix it.
//                         if (seenIds.has(finalId)) {
//                             finalId = `campus-fixed-${Date.now()}-${index}`;
//                             foundDuplicates = true;
//                         }

//                         seenIds.add(finalId);
//                         return { ...campus, id: finalId };
//                     });

//                     const mergedData = {
//                         ...DEFAULT_SETTINGS,
//                         ...data,
//                         campuses: loadedCampuses, // Inject the cleaned campuses
//                         csvMappings: safeMappings,
//                         customCsvMappings: data.customCsvMappings || []
//                     };

//                     setFormData(mergedData);
//                     setOriginalData(mergedData);

//                     // Trigger the "Save Changes" bar automatically if we fixed broken data
//                     if (foundDuplicates) {
//                         setIsDirty(true);
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error fetching system settings:", error);
//             }
//         };
//         initSettings();
//     }, []);

//     // Dirty check for save bar
//     useEffect(() => {
//         const hasChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
//         setIsDirty(hasChanged);
//     }, [formData, originalData]);

//     // ─── GOOGLE MAPS HANDLER ────────────────────────────────────────────────

//     const openInGoogleMaps = (lat: number, lng: number) => {
//         if (!lat || !lng || lat === 0 || lng === 0) return;
//         window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
//     };

//     // ─── ADDRESS PARSER ─────────────────────────────────────────────────────

//     const getAddressMetadata = (place: any) => {
//         const components = place.address_components;
//         if (!components) return null;

//         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";

//         const rawProv = getComp("administrative_area_level_1");
//         const matchedProv = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.toLowerCase())) || rawProv;

//         return {
//             fullAddress: place.formatted_address || "",
//             buildingName: place.name || "",
//             city: getComp("locality") || getComp("sublocality_level_1") || getComp("city"),
//             province: matchedProv,
//             postalCode: getComp("postal_code"),
//             lat: typeof place.geometry?.location?.lat === 'function' ? place.geometry.location.lat() : 0,
//             lng: typeof place.geometry?.location?.lng === 'function' ? place.geometry.location.lng() : 0
//         };
//     };

//     // ─── HANDLERS ─────────────────────────────────────────────────────────

//     const handleMainAddressSelected = (place: any) => {
//         const meta = getAddressMetadata(place);
//         if (!meta) return;

//         const displayAddress = meta.fullAddress.includes(meta.buildingName)
//             ? meta.fullAddress
//             : `${meta.buildingName}, ${meta.fullAddress}`;

//         setFormData((prev: any) => ({
//             ...prev,
//             institutionAddress: displayAddress,
//             institutionCity: meta.city,
//             institutionProvince: meta.province,
//             institutionLat: meta.lat,
//             institutionLng: meta.lng,
//             institutionPostalCode: meta.postalCode
//         }));
//         setIsDirty(true);
//     };

//     const handleCampusAddressSelected = (id: string, place: any) => {
//         const meta = getAddressMetadata(place);
//         if (!meta) return;

//         const displayAddress = meta.fullAddress.includes(meta.buildingName)
//             ? meta.fullAddress
//             : `${meta.buildingName}, ${meta.fullAddress}`;

//         setFormData((prev: any) => ({
//             ...prev,
//             campuses: prev.campuses.map((c: any) => c.id === id ? {
//                 ...c,
//                 address: displayAddress,
//                 city: meta.city,
//                 province: meta.province,
//                 postalCode: meta.postalCode,
//                 lat: meta.lat,
//                 lng: meta.lng
//             } : c)
//         }));
//         setIsDirty(true);
//     };

//     const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
//         const { name, value, type } = e.target;
//         setFormData((prev: any) => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
//         setIsDirty(true);
//     };

//     const updateNested = (category: string, field: string, val: string) => {
//         setFormData((prev: any) => ({
//             ...prev,
//             [category]: { ...(prev[category] || {}), [field]: val }
//         }));
//         setIsDirty(true);
//     };

//     const handleCampusChange = (id: string, field: string, value: any) => {
//         setFormData((prev: any) => ({
//             ...prev,
//             campuses: prev.campuses.map((c: any) => c.id === id ? { ...c, [field]: value } : c)
//         }));
//         setIsDirty(true);
//     };

//     const handleAddCampus = () => {
//         const newId = `campus-${Date.now()}`;
//         setFormData((prev: any) => ({
//             ...prev,
//             campuses: [
//                 ...prev.campuses,
//                 { id: newId, name: '', type: 'physical', address: '', province: '', city: '', postalCode: '', siteAccreditationNumber: '', isDefault: prev.campuses.length === 0 }
//             ]
//         }));
//         setIsDirty(true);
//     };

//     const handleRemoveCampus = (id: string) => {
//         setFormData((prev: any) => {
//             const newCampuses = prev.campuses.filter((c: any) => c.id !== id);
//             if (newCampuses.length > 0 && !newCampuses.some((c: any) => c.isDefault)) {
//                 newCampuses[0].isDefault = true;
//             }
//             return { ...prev, campuses: newCampuses };
//         });
//         setIsDirty(true);
//     };

//     const handleSetDefaultCampus = (id: string) => {
//         setFormData((prev: any) => ({
//             ...prev,
//             campuses: prev.campuses.map((c: any) => ({ ...c, isDefault: c.id === id }))
//         }));
//         setIsDirty(true);
//     };

//     const handleAddCustomMapping = () => {
//         setFormData((prev: any) => ({
//             ...prev,
//             customCsvMappings: [
//                 ...(prev.customCsvMappings || []),
//                 { id: `custom-${Date.now()}`, targetField: '', csvHeader: '' }
//             ]
//         }));
//         setIsDirty(true);
//     };

//     const handleCustomMappingChange = (id: string, field: 'targetField' | 'csvHeader', value: string) => {
//         setFormData((prev: any) => ({
//             ...prev,
//             customCsvMappings: (prev.customCsvMappings || []).map((m: any) => m.id === id ? { ...m, [field]: value } : m)
//         }));
//         setIsDirty(true);
//     };

//     const handleRemoveCustomMapping = (id: string) => {
//         setFormData((prev: any) => ({
//             ...prev,
//             customCsvMappings: (prev.customCsvMappings || []).filter((m: any) => m.id !== id)
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
//             setFormData((prev: any) => ({ ...prev, [field]: downloadURL }));
//             setIsDirty(true);
//         } catch (error) {
//             console.error(`Failed to upload ${field}:`, error);
//             alert("Upload failed. Please try again.");
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
//             const payload = {
//                 ...formData,
//                 updatedAt: new Date().toISOString(),
//                 updatedBy: user?.uid || 'admin'
//             };
//             await setDoc(docRef, payload, { merge: true });

//             if (fetchSettings) await fetchSettings();

//             setOriginalData(formData);
//             setIsDirty(false);
//         } catch (error) {
//             console.error("Save failed:", error);
//             alert("Failed to save settings. Check permissions.");
//         } finally {
//             setIsSaving(false);
//         }
//     };

//     const TABS = [
//         { id: 'org', label: 'Organization', icon: Building2 },
//         { id: 'academic', label: 'Academic Rules', icon: GraduationCap },
//         { id: 'data', label: 'Data & Imports', icon: Database },
//         { id: 'notifications', label: 'Notifications', icon: Bell },
//         { id: 'audit', label: 'Security & Audit', icon: ShieldAlert },
//         { id: 'profile', label: 'My Profile', icon: User },
//     ] as const;

//     return (
//         <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
//             <Sidebar
//                 role={user?.role}
//                 currentNav="settings"
//                 setCurrentNav={() => navigate(`/admin`)}
//                 onLogout={() => navigate('/login')}
//             />

//             <main className="main-wrapper settings-wrapper">
//                 <PageHeader
//                     theme="default"
//                     variant="hero"
//                     eyebrow="System Configuration"
//                     title="Platform Settings"
//                     description="Institutional accreditation and global compliance infrastructure."
//                 />

//                 <div className="settings-container">

//                     {/* ─── SETTINGS NAVIGATION ─── */}
//                     <aside className="settings-sidebar">
//                         <nav className="settings-nav">
//                             {TABS.map(tab => {
//                                 const Icon = tab.icon;
//                                 return (
//                                     <button
//                                         key={tab.id}
//                                         className={`settings-nav__item ${activeTab === tab.id ? 'active' : ''}`}
//                                         onClick={() => setActiveTab(tab.id as any)}
//                                     >
//                                         <Icon size={18} className="settings-nav__icon" /> {tab.label}
//                                     </button>
//                                 );
//                             })}
//                         </nav>
//                     </aside>

//                     {/* ─── SETTINGS CONTENT ─── */}
//                     <div className="settings-content">

//                         {/* 1. ORGANIZATION PROFILE */}
//                         {activeTab === 'org' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Institutional Identity</h2>
//                                 <p className="settings-section__desc">Core details used for QCTO LEISA reports and legal declarations.</p>

//                                 <div className="settings-card">
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Institution Name</label>
//                                             <input type="text" name="institutionName" className="mlab-input" value={formData.institutionName} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>CIPC Registration Number</label>
//                                             <input type="text" name="companyRegistrationNumber" className="mlab-input" value={formData.companyRegistrationNumber} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Official Contact Email</label>
//                                             <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Official Contact Phone</label>
//                                             <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
//                                         </div>

//                                         {/* Main Autocomplete & Manual Override Section */}
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Institution Physical Address (Main SDP Search)</label>
//                                             <div className="input-with-verification">
//                                                 <Autocomplete
//                                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                                     onPlaceSelected={handleMainAddressSelected}
//                                                     options={{ types: [], componentRestrictions: { country: "za" } }}
//                                                     className="mlab-input search-input"
//                                                     placeholder="Search building name, hub, or street..."
//                                                 />

//                                                 {/* OFFICIAL ADDRESS EDITOR (MANUAL OVERRIDE) */}
//                                                 <div className="manual-address-edit mt-4 p-4 border rounded-lg bg-slate-50 shadow-sm border-slate-200">
//                                                     <div className="address-editor-header">
//                                                         <div className="editor-title"><Edit2 size={14} /> <span>Official Address Override (QCTO Compliant)</span></div>
//                                                         {formData.institutionLat !== 0 && (
//                                                             <button type="button" className="verification-pill" onClick={() => openInGoogleMaps(formData.institutionLat, formData.institutionLng)}>
//                                                                 <CheckCircle2 size={12} /> <span>GPS Verified</span>
//                                                             </button>
//                                                         )}
//                                                     </div>

//                                                     <div className="settings-form-grid mt-3">
//                                                         <div className="mlab-form-group col-span-2">
//                                                             <label>Street Line (Manually insert street number if missing)</label>
//                                                             <input type="text" name="institutionAddress" className="mlab-input bg-white" value={formData.institutionAddress} onChange={handleInputChange} placeholder="e.g. 123 Main Road, Suite 4..." />
//                                                         </div>
//                                                         <div className="mlab-form-group">
//                                                             <label>City</label>
//                                                             <input type="text" name="institutionCity" className="mlab-input bg-white" value={formData.institutionCity} onChange={handleInputChange} />
//                                                         </div>
//                                                         <div className="mlab-form-group">
//                                                             <label>Province</label>
//                                                             <select name="institutionProvince" className="mlab-input bg-white" value={formData.institutionProvince} onChange={handleInputChange}>
//                                                                 <option value="">Select...</option>
//                                                                 {QCTO_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
//                                                             </select>
//                                                         </div>
//                                                         <div className="mlab-form-group">
//                                                             <label>Postal Code</label>
//                                                             <input type="text" name="institutionPostalCode" className="mlab-input bg-white" value={formData.institutionPostalCode} onChange={handleInputChange} />
//                                                         </div>
//                                                         <div className="mlab-form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
//                                                             <button
//                                                                 type="button"
//                                                                 className="v-item-btn"
//                                                                 onClick={() => openInGoogleMaps(formData.institutionLat, formData.institutionLng)}
//                                                                 disabled={!formData.institutionLat}
//                                                             >
//                                                                 <Globe size={14} /> <span>View Metadata</span>
//                                                             </button>
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </div>

//                                 {/* Accredited Delivery Sites Section */}
//                                 <div className="section-header-flex mt-10">
//                                     <div>
//                                         <h2 className="settings-section__title" style={{ margin: 0 }}>Accredited Delivery Sites</h2>
//                                         <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Specific accreditation numbers for individual physical hubs.</p>
//                                     </div>
//                                     <button className="mlab-btn mlab-btn--outline-blue" onClick={handleAddCampus}>
//                                         <Plus size={16} /> Add New Site
//                                     </button>
//                                 </div>

//                                 <div className="settings-locations-list mt-4">
//                                     {formData.campuses.map((campus: any, index: number) => (
//                                         <div key={campus.id} className={`location-card ${campus.isDefault ? 'location-card--default' : ''}`}>
//                                             <div className="location-card__header">
//                                                 <div className="location-card__title">
//                                                     <MapPin size={18} color={campus.isDefault ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)'} />
//                                                     <span>Site {index + 1}: {campus.name || 'New Campus'} {campus.isDefault && "(Primary)"}</span>
//                                                 </div>
//                                                 <div className="location-card__actions">
//                                                     {!campus.isDefault && (
//                                                         <button className="location-action-btn text-blue" onClick={() => handleSetDefaultCampus(campus.id)}>Set as Primary</button>
//                                                     )}
//                                                     <button
//                                                         className="location-action-btn text-red"
//                                                         onClick={() => handleRemoveCampus(campus.id)}
//                                                         disabled={formData.campuses.length === 1}
//                                                     >
//                                                         <Trash2 size={16} />
//                                                     </button>
//                                                 </div>
//                                             </div>

//                                             <div className="settings-form-grid mt-4">
//                                                 <div className="mlab-form-group">
//                                                     <label>Campus Hub Name</label>
//                                                     <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Kimberley Hub" />
//                                                 </div>
//                                                 <div className="mlab-form-group">
//                                                     <label>Delivery Mode</label>
//                                                     <select className="mlab-input" value={campus.type || 'physical'} onChange={(e) => handleCampusChange(campus.id, 'type', e.target.value)}>
//                                                         <option value="physical">Physical Campus</option>
//                                                         <option value="online">Online / Distance</option>
//                                                     </select>
//                                                 </div>
//                                                 <div className="mlab-form-group col-span-2">
//                                                     <label>QCTO SDP Accreditation No.</label>
//                                                     <input type="text" className="mlab-input" value={campus.siteAccreditationNumber} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP0708..." />
//                                                 </div>

//                                                 {/* Campus Specific Autocomplete */}
//                                                 <div className="mlab-form-group col-span-2">
//                                                     <label>Physical Address (Google Search)</label>
//                                                     <Autocomplete
//                                                         apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                                         onPlaceSelected={(place) => handleCampusAddressSelected(campus.id, place)}
//                                                         options={{ types: [], componentRestrictions: { country: "za" } }}
//                                                         className="mlab-input search-input"
//                                                         placeholder="Search site address..."
//                                                     />
//                                                 </div>

//                                                 {/* CAMPUS ADDRESS EDITOR (MANUAL OVERRIDE) */}
//                                                 <div className="mlab-form-group col-span-2 bg-white/50 p-4 rounded-lg border border-dashed border-slate-300 mt-2">
//                                                     <div className="editor-title mb-3"><Edit2 size={13} /> <span>Site Address Editor</span></div>
//                                                     <div className="mlab-form-group mb-3">
//                                                         <label>Full Address (Edit to add street number)</label>
//                                                         <input type="text" className="mlab-input bg-white" value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} />
//                                                     </div>
//                                                     <div className="settings-form-grid">
//                                                         <div className="mlab-form-group">
//                                                             <label>City</label>
//                                                             <input type="text" className="mlab-input bg-white" value={campus.city || ''} onChange={(e) => handleCampusChange(campus.id, 'city', e.target.value)} />
//                                                         </div>
//                                                         <div className="mlab-form-group">
//                                                             <label>Province</label>
//                                                             <select className="mlab-input bg-white" value={campus.province || ''} onChange={(e) => handleCampusChange(campus.id, 'province', e.target.value)}>
//                                                                 <option value="">Select...</option>
//                                                                 {QCTO_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
//                                                             </select>
//                                                         </div>
//                                                         <div className="mlab-form-group">
//                                                             <label>Postal Code</label>
//                                                             <input type="text" className="mlab-input bg-white" value={campus.postalCode || ''} onChange={(e) => handleCampusChange(campus.id, 'postalCode', e.target.value)} />
//                                                         </div>
//                                                     </div>
//                                                 </div>
//                                             </div>
//                                         </div>
//                                     ))}
//                                 </div>

//                                 {/* Institutional Brand Assets */}
//                                 <h2 className="settings-section__title mt-10">Institutional Branding</h2>
//                                 <div className="settings-card brand-assets-grid">
//                                     <div className="asset-upload-box">
//                                         <h3 className="asset-title">Primary Logo</h3>
//                                         <div className="asset-preview"><img src={formData.logoUrl || fallbackLogo} alt="Institution Logo" /></div>
//                                         <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
//                                             {isUploadingLogo ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Logo
//                                             <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'logoUrl')} />
//                                         </label>
//                                     </div>
//                                     <div className="asset-upload-box">
//                                         <h3 className="asset-title">Authorized Signature</h3>
//                                         <div className="asset-preview"><img src={formData.signatureUrl || fallbackSignature} alt="Authorized Signature" /></div>
//                                         <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
//                                             {isUploadingSignature ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Signature
//                                             <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'signatureUrl')} />
//                                         </label>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* 2. ACADEMIC RULES */}
//                         {activeTab === 'academic' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Academic Governance</h2>
//                                 <p className="settings-section__desc">Global pass marks and duration rules for standard curricula.</p>
//                                 <div className="settings-card">
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group">
//                                             <label>Pass Mark Threshold (%)</label>
//                                             <input type="number" name="passMarkThreshold" className="mlab-input" value={formData.passMarkThreshold} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Minimum Attendance (%)</label>
//                                             <input type="number" name="attendanceRequirement" className="mlab-input" value={formData.attendanceRequirement} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Default Cohort Months</label>
//                                             <input type="number" name="defaultCohortMonths" className="mlab-input" value={formData.defaultCohortMonths} onChange={handleInputChange} />
//                                         </div>
//                                     </div>
//                                     <hr className="settings-divider mt-6 mb-6" />
//                                     <div className="setting-row-toggle">
//                                         <div className="setting-toggle-text">
//                                             <h4>Strict EISA Lock</h4>
//                                             <p>Prevent grade editing once a learner is marked as EISA Admitted.</p>
//                                         </div>
//                                         <label className="mlab-toggle">
//                                             <input
//                                                 type="checkbox"
//                                                 checked={formData.eisaLockEnabled}
//                                                 onChange={() => setFormData({ ...formData, eisaLockEnabled: !formData.eisaLockEnabled })}
//                                             />
//                                             <span className="mlab-toggle-slider"></span>
//                                         </label>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* 3. DATA IMPORT MAPPINGS */}
//                         {activeTab === 'data' && (
//                             <div className="settings-section animate-fade-in">
//                                 <h2 className="settings-section__title">Data Translation Layer</h2>
//                                 <p className="settings-section__desc">Map your existing spreadsheet headers to internal system fields.</p>
//                                 <div className="settings-card p-0 overflow-hidden">
//                                     <div style={{ padding: '1.5rem', background: 'white', borderBottom: '1px solid #e2e8f0' }}>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
//                                             <GraduationCap size={20} color="var(--mlab-blue)" />
//                                             <h3 style={{ margin: 0, color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600 }}>Statement of Results (SoR) Mapper</h3>
//                                         </div>
//                                         <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>Map the columns for learner enrollments and offline historical records.</p>
//                                     </div>

//                                     <div className="mapping-table-header" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>
//                                         <div>System Internal Field</div>
//                                         <div>Expected CSV Column Header</div>
//                                         <div className="text-center">Action</div>
//                                     </div>

//                                     {/* CORE SYSTEM MAPPINGS */}
//                                     {CORE_MAPPINGS.map(core => (
//                                         <div key={core.key} className="mapping-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}>
//                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                 <div className="font-medium text-slate-900">{core.label}</div>
//                                                 <span style={{ fontSize: '0.7rem', background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px', color: '#64748b', fontWeight: 600 }}>Required</span>
//                                             </div>
//                                             <input
//                                                 type="text"
//                                                 className="mlab-input m-0"
//                                                 style={{ padding: '0.5rem' }}
//                                                 value={formData.csvMappings[core.key] || ''}
//                                                 onChange={(e) => updateNested('csvMappings', core.key, e.target.value)}
//                                             />
//                                             <div className="text-center"><Lock size={14} color="#cbd5e1" /></div>
//                                         </div>
//                                     ))}

//                                     {/* CUSTOM ADDED ROWS */}
//                                     {formData.customCsvMappings?.map((custom: any) => (
//                                         <div key={custom.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: '1rem', padding: '0.75rem 1.5rem', alignItems: 'center', borderBottom: '1px solid #f1f5f9', background: '#fcfcfd' }}>
//                                             <input
//                                                 type="text"
//                                                 className="mlab-input"
//                                                 style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
//                                                 placeholder="Target (e.g. Demographics: Gender)"
//                                                 value={custom.targetField}
//                                                 onChange={(e) => handleCustomMappingChange(custom.id, 'targetField', e.target.value)}
//                                             />
//                                             <input
//                                                 type="text"
//                                                 className="mlab-input"
//                                                 style={{ margin: 0, padding: '0.5rem', border: '1px dashed #cbd5e1' }}
//                                                 placeholder="CSV Header (e.g. Gender Code)"
//                                                 value={custom.csvHeader}
//                                                 onChange={(e) => handleCustomMappingChange(custom.id, 'csvHeader', e.target.value)}
//                                             />
//                                             <div style={{ textAlign: 'center' }}>
//                                                 <button
//                                                     className="mlab-icon-btn text-red"
//                                                     onClick={() => handleRemoveCustomMapping(custom.id)}
//                                                     style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer' }}
//                                                     title="Remove mapping"
//                                                 >
//                                                     <Trash2 size={16} />
//                                                 </button>
//                                             </div>
//                                         </div>
//                                     ))}

//                                     <div style={{ padding: '1rem 1.5rem', background: 'white' }}>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm" onClick={handleAddCustomMapping}>
//                                             <Plus size={14} /> Add Custom Field Mapping
//                                         </button>
//                                     </div>
//                                 </div>

//                                 {/* PROGRAMME IMPORT PLACEHOLDER */}
//                                 <div className="settings-card mt-6" style={{ opacity: 0.6, cursor: 'not-allowed' }}>
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

//                         {/* 4. WEB3 CONFIGURATION - UPDATED WITH SECURITY LOGIC */}
//                         {activeTab === 'web3' && (
//                             <div className="settings-section animate-fade-in">
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
//                                     <div>
//                                         <h2 className="settings-section__title" style={{ margin: 0 }}>Blockchain Protocol Settings</h2>
//                                         <p className="settings-section__desc" style={{ margin: 0 }}>Core cryptographic infrastructure and decentralized registry settings.</p>
//                                     </div>
//                                     {!isSuperAdmin && (
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fef2f2', color: '#ef4444', padding: '6px 12px', border: '1px solid #fecaca', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>
//                                             <Lock size={14} /> System Owner Only
//                                         </div>
//                                     )}
//                                 </div>

//                                 <div className="settings-card" style={{ opacity: isSuperAdmin ? 1 : 0.8 }}>
//                                     <h3 style={{
//                                         marginBottom: '1.5rem',
//                                         color: isSuperAdmin ? 'var(--mlab-blue)' : 'var(--mlab-grey)',
//                                         fontSize: '1.1rem',
//                                         fontWeight: 600,
//                                         fontFamily: 'var(--font-heading)',
//                                         textTransform: 'uppercase',
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         gap: '8px'
//                                     }}>
//                                         <Link2 size={18} /> Smart Contract Configuration
//                                     </h3>

//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group">
//                                             <label>Decentralized Network</label>
//                                             <select
//                                                 name="blockchainNetwork"
//                                                 className="mlab-input"
//                                                 value={formData.blockchainNetwork}
//                                                 onChange={handleInputChange}
//                                                 disabled={!isSuperAdmin}
//                                                 style={!isSuperAdmin ? { cursor: 'not-allowed', background: '#f8fafc', color: 'var(--mlab-grey)' } : {}}
//                                             >
//                                                 <option value="polygon_mainnet">Polygon Mainnet</option>
//                                                 <option value="polygon_amoy">Polygon Amoy (Testnet)</option>
//                                                 <option value="ethereum_mainnet">Ethereum (Mainnet)</option>
//                                                 <option value="sepolia">Sepolia (Testnet)</option>
//                                             </select>
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Dedicated RPC URL</label>
//                                             <input
//                                                 type="text"
//                                                 name="rpcUrl"
//                                                 className="mlab-input"
//                                                 value={formData.rpcUrl}
//                                                 onChange={handleInputChange}
//                                                 disabled={!isSuperAdmin}
//                                                 style={!isSuperAdmin ? { cursor: 'not-allowed', background: '#f8fafc', color: 'var(--mlab-grey)' } : {}}
//                                             />
//                                         </div>
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Registry Smart Contract Address</label>
//                                             <div style={{ position: 'relative' }}>
//                                                 <input
//                                                     type="text"
//                                                     name="contractAddress"
//                                                     className="mlab-input"
//                                                     value={formData.contractAddress}
//                                                     onChange={handleInputChange}
//                                                     disabled={!isSuperAdmin}
//                                                     style={{
//                                                         fontFamily: 'monospace',
//                                                         paddingRight: !isSuperAdmin ? '2.5rem' : '1rem',
//                                                         cursor: !isSuperAdmin ? 'not-allowed' : 'text',
//                                                         background: !isSuperAdmin ? '#f8fafc' : 'white',
//                                                         color: !isSuperAdmin ? 'var(--mlab-grey)' : 'inherit'
//                                                     }}
//                                                 />
//                                                 {!isSuperAdmin && <Lock size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }} />}
//                                             </div>
//                                         </div>
//                                     </div>

//                                     <hr className="settings-divider mt-6 mb-6" />

//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Pinata Dedicated Gateway URL (IPFS)</label>
//                                             <div style={{ position: 'relative' }}>
//                                                 <input
//                                                     type="text"
//                                                     name="ipfsGateway"
//                                                     className="mlab-input"
//                                                     value={formData.ipfsGateway}
//                                                     onChange={handleInputChange}
//                                                     placeholder="https://gateway.pinata.cloud"
//                                                     disabled={!isSuperAdmin}
//                                                     style={{
//                                                         paddingRight: !isSuperAdmin ? '2.5rem' : '1rem',
//                                                         cursor: !isSuperAdmin ? 'not-allowed' : 'text',
//                                                         background: !isSuperAdmin ? '#f8fafc' : 'white',
//                                                         color: !isSuperAdmin ? 'var(--mlab-grey)' : 'inherit'
//                                                     }}
//                                                 />
//                                                 {!isSuperAdmin && <Lock size={16} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#cbd5e1' }} />}
//                                             </div>
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* 5. EMPTY TABS */}
//                         {['notifications', 'audit', 'profile'].includes(activeTab) && (
//                             <div className="settings-section animate-fade-in empty-tab-wrapper">
//                                 <div className="empty-tab-content">
//                                     <IconPlaceholder tab={activeTab} />
//                                     <h2>Section Pending</h2>
//                                     <p>This configuration module is currently under development for the QCTO Phase 2 rollout.</p>
//                                 </div>
//                             </div>
//                         )}

//                     </div>
//                 </div>
//             </main>

//             {/* ─── PERSISTENT SAVE BAR ─── */}
//             <div className={`settings-save-bar ${isDirty ? 'visible' : ''}`}>
//                 <div className="save-bar-content">
//                     <div className="save-bar-text">
//                         <AlertCircle size={18} color="#d97706" />
//                         <span>Institutional configuration has unsaved changes.</span>
//                     </div>
//                     <div className="save-bar-actions">
//                         <button
//                             className="mlab-btn mlab-btn--ghost"
//                             onClick={handleDiscard}
//                             disabled={isSaving}
//                         >
//                             Discard Changes
//                         </button>
//                         <button
//                             className="mlab-btn mlab-btn--green"
//                             onClick={handleSave}
//                             disabled={isSaving}
//                         >
//                             {isSaving ? <Loader2 className="spin" size={16} /> : <Save size={16} />} Save Changes
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// const IconPlaceholder = ({ tab }: { tab: string }) => {
//     if (tab === 'notifications') return <Bell size={48} className="empty-icon text-slate-300" />;
//     if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon text-slate-300" />;
//     return <User size={48} className="empty-icon text-slate-300" />;
// };