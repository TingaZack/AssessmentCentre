// src/pages/SettingsPage/SettingsPage.tsx

// src/pages/SettingsPage/SettingsPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, GraduationCap, Link2, Bell,
    ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import './SettingsPage.css';

// 🚀 NEW: Campus Interface
export interface CampusLocation {
    id: string;
    name: string;
    address: string;
    isDefault: boolean;
}

// The structure of your Firestore document
interface SystemSettings {
    institutionName: string;
    sdpNumber: string;
    phone: string;
    email: string;
    campuses: CampusLocation[]; // 🚀 REPLACED single address with an array of locations
    passMarkThreshold: number;
    attendanceRequirement: number;
    defaultCohortMonths: number;
    eisaLockEnabled: boolean;
    contractAddress: string;
    blockchainNetwork: string;
    rpcUrl: string;
    ipfsGateway: string;
}

const DEFAULT_SETTINGS: SystemSettings = {
    institutionName: "mLab Southern Africa",
    sdpNumber: "SDP070824115131",
    phone: "+27 012 844 0240",
    email: "codetribe@mlab.co.za",
    // 🚀 Default Locations
    campuses: [
        {
            id: "campus-1",
            name: "Kimberley Campus (Head Office)",
            address: "13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345",
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
};

export const SettingsPage: React.FC = () => {
    const navigate = useNavigate();
    const { user, fetchSettings } = useStore();

    const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

    const [formData, setFormData] = useState<SystemSettings>(DEFAULT_SETTINGS);
    const [originalData, setOriginalData] = useState<SystemSettings>(DEFAULT_SETTINGS);

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const initSettings = async () => {
            try {
                const docRef = doc(db, "system_settings", "global");
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data() as SystemSettings;
                    // Handle legacy data where 'address' was a string
                    if ((data as any).address && !data.campuses) {
                        data.campuses = [{ id: 'legacy-1', name: 'Main Campus', address: (data as any).address, isDefault: true }];
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
                { id: `campus-${Date.now()}`, name: '', address: '', isDefault: prev.campuses.length === 0 }
            ]
        }));
        setIsDirty(true);
    };

    const handleCampusChange = (id: string, field: 'name' | 'address', value: string) => {
        setFormData(prev => ({
            ...prev,
            campuses: prev.campuses.map(c => c.id === id ? { ...c, [field]: value } : c)
        }));
        setIsDirty(true);
    };

    const handleRemoveCampus = (id: string) => {
        setFormData(prev => {
            const newCampuses = prev.campuses.filter(c => c.id !== id);
            // If we deleted the default, make the first remaining one the default
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
                                            <label>SDP Registration No.</label>
                                            <input type="text" name="sdpNumber" className="mlab-input" value={formData.sdpNumber} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Contact Email</label>
                                            <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
                                        </div>
                                        <div className="mlab-form-group">
                                            <label>Contact Phone</label>
                                            <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
                                        </div>
                                    </div>
                                </div>

                                {/* 🚀 DYNAMIC CAMPUS MANAGER */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '2rem', marginBottom: '1rem' }}>
                                    <div>
                                        <h2 className="settings-section__title" style={{ margin: 0 }}>Training Locations</h2>
                                        <p className="settings-section__desc" style={{ margin: 0, marginTop: '4px' }}>Manage your physical campuses. The default location is used if a cohort has no specific campus assigned.</p>
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
                                                <div className="mlab-form-group col-span-2">
                                                    <label>Campus Name (e.g., Tshwane Hub)</label>
                                                    <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Polokwane Campus" />
                                                </div>
                                                <div className="mlab-form-group col-span-2">
                                                    <label>Physical Address</label>
                                                    <textarea className="mlab-input" rows={2} value={campus.address} onChange={(e) => handleCampusChange(campus.id, 'address', e.target.value)} placeholder="Full street address..." />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <h2 className="settings-section__title" style={{ marginTop: '2rem' }}>Brand Assets</h2>
                                <div className="settings-card brand-assets-grid">
                                    <div className="asset-upload-box">
                                        <div className="asset-preview logo-preview"><img src="../../src/assets/logo/mlab_logo.png" alt="Logo" /></div>
                                        <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2"><UploadCloud size={14} /> Replace Logo</button>
                                    </div>
                                    <div className="asset-upload-box">
                                        <div className="asset-preview signature-preview"><img src="../../src/assets/Signatue_Zack_.png" alt="Signature" /></div>
                                        <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2"><UploadCloud size={14} /> Replace Signature</button>
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
//     ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle
// } from 'lucide-react';
// import { doc, getDoc, setDoc } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
// import PageHeader from '../../components/common/PageHeader/PageHeader';
// import './SettingsPage.css';

// // The structure of your Firestore document (db -> system_settings -> global)
// interface SystemSettings {
//     institutionName: string;
//     sdpNumber: string;
//     phone: string;
//     email: string;
//     address: string;
//     passMarkThreshold: number;
//     attendanceRequirement: number;
//     defaultCohortMonths: number;
//     eisaLockEnabled: boolean;
//     // Web3 & Blockchain Settings
//     contractAddress: string;
//     blockchainNetwork: string;
//     rpcUrl: string;
//     ipfsGateway: string;
// }

// const DEFAULT_SETTINGS: SystemSettings = {
//     institutionName: "",
//     sdpNumber: "",
//     phone: "",
//     email: "",
//     address: "",
//     passMarkThreshold: 0,
//     attendanceRequirement: 0,
//     defaultCohortMonths: 0,
//     eisaLockEnabled: true,
//     // Default Web3 Data
//     contractAddress: "",
//     blockchainNetwork: "", // Defaulting to Testnet for safety
//     rpcUrl: "",
//     ipfsGateway: "",
// };

// export const SettingsPage: React.FC = () => {
//     const navigate = useNavigate();

//     // 🚀 Grab user AND fetchSettings from the global store
//     const { user, fetchSettings } = useStore();

//     const [activeTab, setActiveTab] = useState<'org' | 'academic' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

//     const [formData, setFormData] = useState<SystemSettings>(DEFAULT_SETTINGS);
//     const [originalData, setOriginalData] = useState<SystemSettings>(DEFAULT_SETTINGS);

//     const [isDirty, setIsDirty] = useState(false);
//     const [isSaving, setIsSaving] = useState(false);

//     // 🚀 1. FETCH SETTINGS ON MOUNT
//     useEffect(() => {
//         const initSettings = async () => {
//             try {
//                 const docRef = doc(db, "system_settings", "global");
//                 const docSnap = await getDoc(docRef);

//                 if (docSnap.exists()) {
//                     const data = docSnap.data() as SystemSettings;
//                     // Merge fetched data with defaults in case we added new fields to the interface
//                     const mergedData = { ...DEFAULT_SETTINGS, ...data };
//                     setFormData(mergedData);
//                     setOriginalData(mergedData);
//                 } else {
//                     console.log("No custom settings found, using defaults.");
//                 }
//             } catch (error) {
//                 console.error("Error fetching system settings:", error);
//             }
//         };

//         initSettings();
//     }, []);

//     // 🚀 2. HANDLE INPUT CHANGES & INSTANTLY TRIGGER SAVE BAR
//     const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
//         const { name, value, type } = e.target;
//         setFormData(prev => ({
//             ...prev,
//             [name]: type === 'number' ? Number(value) : value
//         }));
//         setIsDirty(true); // 🔥 Instantly show the bar
//     };

//     const handleToggleChange = (name: keyof SystemSettings) => {
//         setFormData(prev => ({
//             ...prev,
//             [name]: !prev[name as keyof SystemSettings]
//         }));
//         setIsDirty(true); // 🔥 Instantly show the bar
//     };

//     const handleDiscard = () => {
//         setFormData(originalData);
//         setIsDirty(false); // 🔥 Hide the bar
//     };

//     // 🚀 3. SAVE TO FIREBASE & UPDATE GLOBAL STORE
//     const handleSave = async () => {
//         setIsSaving(true);
//         try {
//             const docRef = doc(db, "system_settings", "global");

//             // Add audit trails to the payload
//             const payload = {
//                 ...formData,
//                 updatedAt: new Date().toISOString(),
//                 updatedBy: user?.uid || 'unknown_admin'
//             };

//             // Use setDoc with merge: true to update or create the singleton document
//             await setDoc(docRef, payload, { merge: true });

//             // 🚀 Force the global store to sync the new settings immediately
//             if (fetchSettings) {
//                 await fetchSettings();
//             }

//             setOriginalData(formData);
//             setIsDirty(false);
//         } catch (error) {
//             console.error("Failed to save settings:", error);
//             alert("Failed to save settings to the database. Please check your permissions.");
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
//             <Sidebar
//                 role={user?.role}
//                 currentNav="settings"
//                 setCurrentNav={(nav) => navigate(`/admin?tab=${nav}`)}
//                 onLogout={() => navigate('/login')}
//             />

//             <main className="main-wrapper settings-wrapper">
//                 <PageHeader
//                     theme="default"
//                     variant="hero"
//                     eyebrow="System Configuration"
//                     title="Platform Settings"
//                     description="Manage global rules, templates, and blockchain infrastructure."
//                 />

//                 <div className="settings-container">

//                     {/* ── LEFT SIDEBAR MENU ── */}
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
//                                         <Icon size={18} className="settings-nav__icon" />
//                                         {tab.label}
//                                     </button>
//                                 );
//                             })}
//                         </nav>
//                     </aside>

//                     {/* ── RIGHT CONTENT AREA ── */}
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
//                                             <label>SDP Registration No.</label>
//                                             <input type="text" name="sdpNumber" className="mlab-input" value={formData.sdpNumber} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Contact Email</label>
//                                             <input type="email" name="email" className="mlab-input" value={formData.email} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group">
//                                             <label>Contact Phone</label>
//                                             <input type="text" name="phone" className="mlab-input" value={formData.phone} onChange={handleInputChange} />
//                                         </div>
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Physical Address</label>
//                                             <textarea name="address" className="mlab-input" rows={2} value={formData.address} onChange={handleInputChange} />
//                                         </div>
//                                     </div>
//                                 </div>

//                                 <h2 className="settings-section__title" style={{ marginTop: '2rem' }}>Brand Assets</h2>
//                                 <div className="settings-card brand-assets-grid">
//                                     <div className="asset-upload-box">
//                                         <div className="asset-preview logo-preview">
//                                             <img src="../../src/assets/logo/mlab_logo.png" alt="Logo" />
//                                         </div>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2">
//                                             <UploadCloud size={14} /> Replace Logo
//                                         </button>
//                                         <span className="asset-help">PNG or SVG, max 2MB</span>
//                                     </div>
//                                     <div className="asset-upload-box">
//                                         <div className="asset-preview signature-preview">
//                                             <img src="../../src/assets/Signatue_Zack_.png" alt="Signature" />
//                                         </div>
//                                         <button className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-2">
//                                             <UploadCloud size={14} /> Replace Signature
//                                         </button>
//                                         <span className="asset-help">Transparent PNG recommended</span>
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
//                                             <span className="input-help">Scores above this mark automatically map to "Competent".</span>
//                                         </div>

//                                         <div className="mlab-form-group">
//                                             <label>Minimum Attendance (%)</label>
//                                             <div className="input-with-suffix">
//                                                 <input type="number" name="attendanceRequirement" className="mlab-input" value={formData.attendanceRequirement} onChange={handleInputChange} min="0" max="100" />
//                                                 <span className="suffix">%</span>
//                                             </div>
//                                             <span className="input-help">Triggers warnings if learner falls below this threshold.</span>
//                                         </div>

//                                         <div className="mlab-form-group">
//                                             <label>Default Cohort Duration (Months)</label>
//                                             <div className="input-with-suffix">
//                                                 <input type="number" name="defaultCohortMonths" className="mlab-input" value={formData.defaultCohortMonths} onChange={handleInputChange} min="1" max="60" />
//                                                 <span className="suffix">Months</span>
//                                             </div>
//                                             <span className="input-help">Used to auto-calculate end dates when creating a new class.</span>
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
//                                             <input type="text" name="rpcUrl" className="mlab-input" placeholder="e.g., https://polygon-mainnet.g.alchemy.com/..." value={formData.rpcUrl} onChange={handleInputChange} />
//                                         </div>

//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Registry Smart Contract Address</label>
//                                             <input type="text" name="contractAddress" className="mlab-input" placeholder="0x..." value={formData.contractAddress} onChange={handleInputChange} />
//                                             <span className="input-help">The EVM address of the deployed mLab Certificate Registry smart contract. Ensure this matches the selected network above.</span>
//                                         </div>
//                                     </div>

//                                     <hr className="settings-divider" />

//                                     <h3 style={{ marginBottom: '1.5rem', color: 'var(--mlab-blue)', fontSize: '1.1rem', fontWeight: 600, fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Decentralized Storage (IPFS)</h3>
//                                     <div className="settings-form-grid">
//                                         <div className="mlab-form-group col-span-2">
//                                             <label>Pinata Dedicated Gateway URL</label>
//                                             <input type="text" name="ipfsGateway" className="mlab-input" placeholder="https://your-gateway.mypinata.cloud" value={formData.ipfsGateway} onChange={handleInputChange} />
//                                             <span className="input-help">Using a premium dedicated gateway significantly speeds up PDF uploads and QR code verification scans compared to public nodes.</span>
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>
//                         )}

//                         {/* PLACEHOLDERS FOR OTHER TABS */}
//                         {['notifications', 'audit', 'profile'].includes(activeTab) && (
//                             <div className="settings-section animate-fade-in empty-tab">
//                                 <IconPlaceholder tab={activeTab} />
//                                 <h2>Under Construction</h2>
//                                 <p>These settings are currently managed via environment variables and Firestore rules.</p>
//                             </div>
//                         )}

//                     </div>
//                 </div>
//             </main>

//             {/* 🚀 FLOATING SAVE BAR */}
//             <div className={`settings-save-bar ${isDirty ? 'visible' : ''}`}>
//                 <div className="save-bar-content">
//                     <div className="save-bar-text">
//                         <AlertCircle size={18} color="#d97706" />
//                         <span>You have unsaved changes.</span>
//                     </div>
//                     <div className="save-bar-actions">
//                         <button className="mlab-btn mlab-btn--ghost" onClick={handleDiscard} disabled={isSaving}>Discard</button>
//                         <button className="mlab-btn mlab-btn--green" onClick={handleSave} disabled={isSaving}>
//                             {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
//                             Save Changes
//                         </button>
//                     </div>
//                 </div>
//             </div>
//         </div>
//     );
// };

// // Quick helper for empty states
// const IconPlaceholder = ({ tab }: { tab: string }) => {
//     if (tab === 'notifications') return <Bell size={48} className="empty-icon" />;
//     if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon" />;
//     return <User size={48} className="empty-icon" />;
// };