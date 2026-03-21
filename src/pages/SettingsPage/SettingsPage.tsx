// src/pages/SettingsPage/SettingsPage.tsx


import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, GraduationCap, Link2, Bell,
    ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import './SettingsPage.css';

// Fallback assets in case the database is empty
import fallbackLogo from '../../assets/logo/mlab_logo.png';
import fallbackSignature from '../../assets/Signatue_Zack_.png';

// Campus Interface with Delivery Mode and SDP Number
export interface CampusLocation {
    id: string;
    name: string;
    type: 'physical' | 'online';
    address: string;
    siteAccreditationNumber: string; // The QCTO SDP Number
    isDefault: boolean;
}

// System Settings with CIPC instead of SDP
export interface SystemSettings {
    institutionName: string;
    companyRegistrationNumber: string; // CIPC Number
    phone: string;
    email: string;
    campuses: CampusLocation[];
    passMarkThreshold: number;
    attendanceRequirement: number;
    defaultCohortMonths: number;
    eisaLockEnabled: boolean;
    contractAddress: string;
    blockchainNetwork: string;
    rpcUrl: string;
    ipfsGateway: string;
    // 🚀 NEW: Brand Assets stored in Firebase
    logoUrl?: string;
    signatureUrl?: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
    institutionName: "mLab Southern Africa",
    companyRegistrationNumber: "2011/149875/08",
    phone: "+27 012 844 0240",
    email: "codetribe@mlab.co.za",
    campuses: [
        {
            id: "campus-1",
            name: "Kimberley Campus (Head Office)",
            type: "physical",
            address: "13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345",
            siteAccreditationNumber: "SDP070824115131",
            isDefault: true
        }
    ],
    passMarkThreshold: 50,
    attendanceRequirement: 80,
    defaultCohortMonths: 12,
    eisaLockEnabled: true,
    contractAddress: "0x1234567890abcdef1234567890abcdef12345678",
    blockchainNetwork: "polygon_amoy",
    rpcUrl: "https://rpc-amoy.polygon.technology/",
    ipfsGateway: "https://gateway.pinata.cloud",
    logoUrl: "",
    signatureUrl: "",
};

export const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, fetchSettings } = useStore();

    const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

    const [formData, setFormData] = useState<SystemSettings>(DEFAULT_SETTINGS);
    const [originalData, setOriginalData] = useState<SystemSettings>(DEFAULT_SETTINGS);

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // 🚀 State for uploading brand assets
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);

    useEffect(() => {
        const initSettings = async () => {
            try {
                const docRef = doc(db, "system_settings", "global");
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data() as SystemSettings;

                    // Legacy migration: If old sdpNumber exists but no companyReg, swap it safely
                    if ((data as any).sdpNumber && !data.companyRegistrationNumber) {
                        data.companyRegistrationNumber = (data as any).sdpNumber;
                    }

                    const mergedData = { ...DEFAULT_SETTINGS, ...data };
                    setFormData(mergedData);
                    setOriginalData(mergedData);
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'number' ? Number(value) : value }));
        setIsDirty(true);
    };

    const handleToggleChange = (name: keyof SystemSettings) => {
        setFormData(prev => ({ ...prev, [name]: !prev[name as keyof SystemSettings] }));
        setIsDirty(true);
    };

    // 🚀 DYNAMIC LOCATION HANDLERS
    const handleAddCampus = () => {
        setFormData(prev => ({
            ...prev,
            campuses: [
                ...prev.campuses,
                { id: `campus-${Date.now()}`, name: '', type: 'physical', address: '', siteAccreditationNumber: '', isDefault: prev.campuses.length === 0 }
            ]
        }));
        setIsDirty(true);
    };

    const handleCampusChange = (id: string, field: keyof CampusLocation, value: string) => {
        setFormData(prev => ({
            ...prev,
            campuses: prev.campuses.map(c => c.id === id ? { ...c, [field]: value } : c)
        }));
        setIsDirty(true);
    };

    const handleRemoveCampus = (id: string) => {
        setFormData(prev => {
            const newCampuses = prev.campuses.filter(c => c.id !== id);
            if (newCampuses.length > 0 && !newCampuses.some(c => c.isDefault)) {
                newCampuses[0].isDefault = true;
            }
            return { ...prev, campuses: newCampuses };
        });
        setIsDirty(true);
    };

    const handleSetDefaultCampus = (id: string) => {
        setFormData(prev => ({
            ...prev,
            campuses: prev.campuses.map(c => ({ ...c, isDefault: c.id === id }))
        }));
        setIsDirty(true);
    };

    // 🚀 FILE UPLOAD HANDLER FOR FIREBASE STORAGE
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'logoUrl' | 'signatureUrl') => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isLogo = field === 'logoUrl';
        isLogo ? setIsUploadingLogo(true) : setIsUploadingSignature(true);

        try {
            const storage = getStorage();
            // Create a unique file path: brand_assets/logoUrl_12345678_logo.png
            const fileRef = ref(storage, `brand_assets/${field}_${Date.now()}_${file.name}`);

            // Upload to Firebase Storage
            await uploadBytes(fileRef, file);

            // Get the public URL
            const downloadURL = await getDownloadURL(fileRef);

            // Update local form state (triggers the floating save bar)
            setFormData(prev => ({ ...prev, [field]: downloadURL }));
            setIsDirty(true);

        } catch (error) {
            console.error(`Failed to upload ${field}:`, error);
            alert("Failed to upload image. Please try again.");
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
            const payload = { ...formData, updatedAt: new Date().toISOString(), updatedBy: user?.uid || 'unknown_admin' };
            await setDoc(docRef, payload, { merge: true });

            if (fetchSettings) await fetchSettings();

            setOriginalData(formData);
            setIsDirty(false);
        } catch (error) {
            console.error("Failed to save settings:", error);
            alert("Failed to save settings. Check your permissions.");
        } finally {
            setIsSaving(false);
        }
    };

    const TABS = [
        { id: 'org', label: 'Organization', icon: Building2 },
        { id: 'academic', label: 'Academic Rules', icon: GraduationCap },
        { id: 'web3', label: 'Web3 & Blockchain', icon: Link2 },
        { id: 'notifications', label: 'Notifications', icon: Bell },
        { id: 'audit', label: 'Security & Audit', icon: ShieldAlert },
        { id: 'profile', label: 'My Profile', icon: User },
    ] as const;

    return (
        <div className="admin-layout" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            <Sidebar role={user?.role} currentNav="settings" setCurrentNav={(nav) => navigate(`/admin?tab=${nav}`)} onLogout={() => navigate('/login')} />

            <main className="main-wrapper settings-wrapper">
                <PageHeader theme="default" variant="hero" eyebrow="System Configuration" title="Platform Settings" description="Manage global rules, templates, and blockchain infrastructure." />

                <div className="settings-container">

                    <aside className="settings-sidebar">
                        <nav className="settings-nav">
                            {TABS.map(tab => {
                                const Icon = tab.icon;
                                return (
                                    <button key={tab.id} className={`settings-nav__item ${activeTab === tab.id ? 'active' : ''}`} onClick={() => setActiveTab(tab.id as any)}>
                                        <Icon size={18} className="settings-nav__icon" /> {tab.label}
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    <div className="settings-content">

                        {/* 🏢 ORGANIZATION SETTINGS */}
                        {activeTab === 'org' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Organization Profile</h2>
                                <p className="settings-section__desc">This information appears on generated Statements of Results and public portals.</p>

                                <div className="settings-card">
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group col-span-2">
                                            <label>Institution Name</label>
                                            <input type="text" name="institutionName" className="mlab-input" value={formData.institutionName} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Company Registration No. (CIPC)</label>
                                            <input type="text" name="companyRegistrationNumber" className="mlab-input" placeholder="e.g., 2012/123456/08" value={formData.companyRegistrationNumber} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Global Contact Email</label>
                                            <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Global Contact Phone</label>
                                            <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', marginBottom: '1rem' }}>
                                    <div>
                                        <h2 className="settings-section__title" style={{ margin: 0 }}>Accredited Delivery Sites</h2>
                                        <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Manage your physical campuses and online delivery modes. Each site requires its own QCTO SDP number.</p>
                                    </div>
                                    <button className="mlab-btn mlab-btn--outline-blue" onClick={handleAddCampus}>
                                        <Plus size={16} /> Add Location
                                    </button>
                                </div>

                                <div className="settings-locations-list">
                                    {formData.campuses.map((campus, index) => (
                                        <div key={campus.id} className={`location-card ${campus.isDefault ? 'location-card--default' : ''}`}>
                                            <div className="location-card__header">
                                                <div className="location-card__title">
                                                    <MapPin size={16} color={campus.isDefault ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)'} />
                                                    <span className="badge-number">{index + 1}</span>
                                                    {campus.isDefault && <span className="default-badge">Primary Location</span>}
                                                </div>
                                                <div className="location-card__actions">
                                                    {!campus.isDefault && (
                                                        <button className="location-action-btn text-blue" onClick={() => handleSetDefaultCampus(campus.id)}>Set as Primary</button>
                                                    )}
                                                    <button className="location-action-btn text-red" onClick={() => handleRemoveCampus(campus.id)} disabled={formData.campuses.length === 1}>
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="settings-form-grid" style={{ marginTop: '1rem' }}>
                                                <div className="mlab-form-group">
                                                    <label>Campus Name</label>
                                                    <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Tshwane Hub" />
                                                </div>
                                                <div className="mlab-form-group">
                                                    <label>Delivery Mode</label>
                                                    <select className="mlab-input" value={campus.type} onChange={(e) => handleCampusChange(campus.id, 'type', e.target.value)}>
                                                        <option value="physical">Physical Campus</option>
                                                        <option value="online">Online / Distance</option>
                                                    </select>
                                                </div>
                                                <div className="mlab-form-group col-span-2">
                                                    <label>Site Accreditation No. (SDP)</label>
                                                    <input type="text" className="mlab-input" value={campus.siteAccreditationNumber || ''} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP070824115131" />
                                                </div>
                                                <div className="mlab-form-group col-span-2">
                                                    <label>Physical Address {campus.type === 'online' && <span style={{ color: '#94a3b8', fontWeight: 'normal' }}>(Optional for Online)</span>}</label>
                                                    <textarea className="mlab-input" rows={2} value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} placeholder="Full street address..." />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 className="settings-section__title" style={{ marginTop: '2rem' }}>Brand Assets</h2>
                                <div className="settings-card brand-assets-grid">

                                    {/* 🚀 DYNAMIC LOGO UPLOAD */}
                                    <div className="asset-upload-box">
                                        <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>Primary Institution Logo</h3>
                                        <div className="asset-preview logo-preview">
                                            <img src={formData.logoUrl || fallbackLogo} alt="Logo" />
                                        </div>

                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2" style={{ cursor: isUploadingLogo ? 'not-allowed' : 'pointer', display: 'inline-flex' }}>
                                            {isUploadingLogo ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
                                            {isUploadingLogo ? "Uploading..." : "Replace Logo"}
                                            <input type="file" accept="image/png, image/jpeg, image/svg+xml" hidden onChange={(e) => handleFileUpload(e, 'logoUrl')} disabled={isUploadingLogo} />
                                        </label>
                                        <span className="asset-help">PNG or SVG, max 2MB</span>
                                    </div>

                                    {/* 🚀 DYNAMIC SIGNATURE UPLOAD */}
                                    <div className="asset-upload-box">
                                        <h3 style={{ marginBottom: '10px', fontSize: '0.9rem', color: 'var(--mlab-blue)', fontWeight: 600 }}>Authorized Signature (Statement of Results)</h3>
                                        <div className="asset-preview signature-preview">
                                            <img src={formData.signatureUrl || fallbackSignature} alt="Signature" />
                                        </div>

                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2" style={{ cursor: isUploadingSignature ? 'not-allowed' : 'pointer', display: 'inline-flex' }}>
                                            {isUploadingSignature ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />}
                                            {isUploadingSignature ? "Uploading..." : "Replace Signature"}
                                            <input type="file" accept="image/png" hidden onChange={(e) => handleFileUpload(e, 'signatureUrl')} disabled={isUploadingSignature} />
                                        </label>
                                        <span className="asset-help">Transparent PNG recommended</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 🎓 ACADEMIC RULES */}
                        {activeTab === 'academic' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Academic Rules & Compliance</h2>
                                <p className="settings-section__desc">Configure standard thresholds and automation rules for cohorts and assessments.</p>
                                <div className="settings-card">
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group">
                                            <label>Pass Mark Threshold (%)</label>
                                            <div className="input-with-suffix">
                                                <input type="number" name="passMarkThreshold" className="mlab-input" value={formData.passMarkThreshold} onChange={handleInputChange} min="0" max="100" />
                                                <span className="suffix">%</span>
                                            </div>
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Minimum Attendance (%)</label>
                                            <div className="input-with-suffix">
                                                <input type="number" name="attendanceRequirement" className="mlab-input" value={formData.attendanceRequirement} onChange={handleInputChange} min="0" max="100" />
                                                <span className="suffix">%</span>
                                            </div>
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Default Cohort Duration (Months)</label>
                                            <div className="input-with-suffix">
                                                <input type="number" name="defaultCohortMonths" className="mlab-input" value={formData.defaultCohortMonths} onChange={handleInputChange} min="1" max="60" />
                                                <span className="suffix">Months</span>
                                            </div>
                                        </div>
                                    </div>
                                    <hr className="settings-divider" />
                                    <div className="setting-row-toggle">
                                        <div className="setting-toggle-text">
                                            <h4>Strict EISA Lock</h4>
                                            <p>Prevent facilitators from editing module grades once a learner has been marked as "EISA Admitted".</p>
                                        </div>
                                        <label className="mlab-toggle">
                                            <input type="checkbox" checked={formData.eisaLockEnabled} onChange={() => handleToggleChange('eisaLockEnabled')} />
                                            <span className="mlab-toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 🔗 WEB3 & BLOCKCHAIN */}
                        {activeTab === 'web3' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Web3 & Blockchain Infrastructure</h2>
                                <p className="settings-section__desc">Manage your decentralized registry, smart contract configurations, and IPFS gateways.</p>
                                <div className="settings-card">
                                    <h3 style={{ marginBottom: '1.5rem', color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Smart Contract Configuration</h3>
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group">
                                            <label>Blockchain Network</label>
                                            <select name="blockchainNetwork" className="mlab-input" value={formData.blockchainNetwork} onChange={handleInputChange}>
                                                <option value="polygon_mainnet">Polygon (Mainnet)</option>
                                                <option value="polygon_amoy">Polygon Amoy (Testnet)</option>
                                                <option value="ethereum_mainnet">Ethereum (Mainnet)</option>
                                                <option value="sepolia">Sepolia (Testnet)</option>
                                            </select>
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>RPC Provider URL</label>
                                            <input type="text" name="rpcUrl" className="mlab-input" value={formData.rpcUrl} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group col-span-2">
                                            <label>Registry Smart Contract Address</label>
                                            <input type="text" name="contractAddress" className="mlab-input" value={formData.contractAddress} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                    <hr className="settings-divider" />
                                    <div className="settings-form-grid">
                                        <div className="mlab-form-group col-span-2">
                                            <label>Pinata Dedicated Gateway URL</label>
                                            <input type="text" name="ipfsGateway" className="mlab-input" value={formData.ipfsGateway} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {['notifications', 'audit', 'profile'].includes(activeTab) && (
                            <div className="settings-section animate-fade-in empty-tab">
                                <IconPlaceholder tab={activeTab} />
                                <h2>Under Construction</h2>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            <div className={`settings-save-bar ${isDirty ? 'visible' : ''}`}>
                <div className="save-bar-content">
                    <div className="save-bar-text">
                        <AlertCircle size={18} color="#d97706" />
                        <span>You have unsaved changes.</span>
                    </div>
                    <div className="save-bar-actions">
                        <button className="mlab-btn mlab-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
                        <button className="mlab-btn mlab-btn--green" onClick={handleSave} disabled={isSaving}>
                            {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />} Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const IconPlaceholder = ({ tab }: { tab: string }) => {
    if (tab === 'notifications') return <Bell size={48} className="empty-icon" />;
    if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon" />;
    return <User size={48} className="empty-icon" />;
};



// import React, { useState, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import {
//     Building2, GraduationCap, Link2, Bell,
//     ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin
// } from 'lucide-react';
// import { doc, getDoc, setDoc } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import PageHeader from '../../components/common/PageHeader/PageHeader';
// import './SettingsPage.css';

// // Campus Interface with Delivery Mode and SDP Number
// export interface CampusLocation {
//     id: string;
//     name: string;
//     type: 'physical' | 'online';
//     address: string;
//     siteAccreditationNumber: string; // The QCTO SDP Number
//     isDefault: boolean;
// }

// // System Settings with CIPC instead of SDP
// interface SystemSettings {
//     institutionName: string;
//     companyRegistrationNumber: string; // CIPC Number
//     phone: string;
//     email: string;
//     campuses: CampusLocation[];
//     passMarkThreshold: number;
//     attendanceRequirement: number;
//     defaultCohortMonths: number;
//     eisaLockEnabled: boolean;
//     contractAddress: string;
//     blockchainNetwork: string;
//     rpcUrl: string;
//     ipfsGateway: string;
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
// };

// export const SettingsPage: React.FC = () => {
//     const navigate = useNavigate();
//     const { user, fetchSettings } = useStore();

//     const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

//     const [formData, setFormData] = useState<SystemSettings>(DEFAULT_SETTINGS);
//     const [originalData, setOriginalData] = useState<SystemSettings>(DEFAULT_SETTINGS);

//     const [isDirty, setIsDirty] = useState(false);
//     const [isSaving, setIsSaving] = useState(false);

//     useEffect(() => {
//         const initSettings = async () => {
//             try {
//                 const docRef = doc(db, "system_settings", "global");
//                 const docSnap = await getDoc(docRef);

//                 if (docSnap.exists()) {
//                     const data = docSnap.data() as SystemSettings;

//                     // Legacy migration: If old sdpNumber exists but no companyReg, swap it safely
//                     if ((data as any).sdpNumber && !data.companyRegistrationNumber) {
//                         data.companyRegistrationNumber = (data as any).sdpNumber;
//                     }

//                     const mergedData = { ...DEFAULT_SETTINGS, ...data };
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

//     // 🚀 DYNAMIC LOCATION HANDLERS
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
//         setFormData(prev => ({
//             ...prev,
//             campuses: prev.campuses.map(c => c.id === id ? { ...c, [field]: value } : c)
//         }));
//         setIsDirty(true);
//     };

//     const handleRemoveCampus = (id: string) => {
//         setFormData(prev => {
//             const newCampuses = prev.campuses.filter(c => c.id !== id);
//             if (newCampuses.length > 0 && !newCampuses.some(c => c.isDefault)) {
//                 newCampuses[0].isDefault = true;
//             }
//             return { ...prev, campuses: newCampuses };
//         });
//         setIsDirty(true);
//     };

//     const handleSetDefaultCampus = (id: string) => {
//         setFormData(prev => ({
//             ...prev,
//             campuses: prev.campuses.map(c => ({ ...c, isDefault: c.id === id }))
//         }));
//         setIsDirty(true);
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

//                         {/* 🏢 ORGANIZATION SETTINGS */}
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
//                                             {/* 🚀 CHANGED TO CIPC COMPANY REGISTRATION */}
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

//                                 {/* 🚀 DYNAMIC CAMPUS MANAGER */}
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', marginBottom: '1rem' }}>
//                                     <div>
//                                         <h2 className="settings-section__title" style={{ margin: 0 }}>Accredited Delivery Sites</h2>
//                                         <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Manage your physical campuses and online delivery modes. Each site requires its own QCTO SDP number.</p>
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
//                                                     {/* 🚀 SDP ACCREDITATION MOVED TO THE SPECIFIC SITE */}
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
//                                         <div className="asset-preview logo-preview"><img src="../../src/assets/logo/mlab_logo.png" alt="Logo" /></div>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2"><UploadCloud size={14} /> Replace Logo</button>
//                                     </div>
//                                     <div className="asset-upload-box">
//                                         <div className="asset-preview signature-preview"><img src="../../src/assets/Signatue_Zack_.png" alt="Signature" /></div>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2"><UploadCloud size={14} /> Replace Signature</button>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* 🎓 ACADEMIC RULES */}
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

//                         {/* 🔗 WEB3 & BLOCKCHAIN */}
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


