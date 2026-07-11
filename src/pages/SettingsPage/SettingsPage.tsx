// src/pages/SettingsPage/SettingsPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Building2, GraduationCap, Link2, Bell,
    ShieldAlert, User, Save, UploadCloud, Loader2, AlertCircle, Plus, Trash2, MapPin, Database, Lock, CheckCircle2, Edit2, Globe, BookOpen, Wifi, X, Search, Clock, Send, MessageSquare, History, ListPlus, MonitorPlay, Calendar
} from 'lucide-react';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { Sidebar } from '../../components/dashboard/Sidebar/Sidebar';
import PageHeader from '../../components/common/PageHeader/PageHeader';
import Autocomplete from "react-google-autocomplete";
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import './SettingsPage.css';

import '../../components/admin/LearnerFormModal/LearnerFormModal.css';

import fallbackLogo from '../../assets/logo/mlab_logo.png';
import fallbackSignature from '../../assets/Signatue_Zack_.png';

// ─── DICTIONARIES ─────────────────────────────────────────────────────────

const QCTO_PROVINCES = [
    "Western Cape", "Eastern Cape", "Northern Cape", "Free State",
    "KwaZulu-Natal", "North West", "Gauteng", "Mpumalanga", "Limpopo"
];

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

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

const NOTIFICATION_TRIGGERS = [
    { key: 'checkInStart', label: 'Morning Campus Open', description: 'Fires when check-in opens for the day.' },
    { key: 'checkInLate', label: 'Late Arrival Warning', description: 'Fires when the late threshold is reached.' },
    { key: 'lunchSoon', label: 'Lunch Approaching', description: 'Fires 10 mins before lunch starts.' },
    { key: 'lunchStart', label: 'Lunch Break Starts', description: 'Fires exactly when lunch begins.' },
    { key: 'lunchEnd', label: 'Lunch Break Ends', description: 'Fires when the afternoon session resumes.' },
    { key: 'checkoutSoon', label: 'Dismissal Approaching', description: 'Fires 10 mins before checkout is allowed.' },
    { key: 'checkoutStart', label: 'Campus Closing', description: 'Fires exactly at the checkout start time.' },
    { key: 'weeklyMonday', label: 'Monday Kickoff', description: 'Fires every Monday at 07:30.' },
    { key: 'weeklyFriday', label: 'Friday Wrap-up', description: 'Fires every Friday before checkout.' }
];

const DEFAULT_CAMPUS_TIMES = {
    checkInStart: "06:00",
    checkInLate: "08:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    checkoutStart: "15:30"
};

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

    globalDemographicFields: ["gender", "race", "disability"],

    passMarkThreshold: 50,
    attendanceRequirement: 80,
    defaultCohortMonths: 12,
    eisaLockEnabled: true,
    blockchainNetwork: "polygon_amoy",
    ipfsGateway: "https://gateway.pinata.cloud",
    notificationSettings: {
        globalMasterSwitch: true,
        dailyRemindersEnabled: true,
        weeklyMotivationEnabled: true
    },
    notificationTemplates: {
        checkInStart: { title: "☀️ Campus is Open", body: "Don't forget to scan the Kiosk once you arrive!" },
        checkInLate: { title: "⏰ Attendance Check", body: "Just a reminder to scan in for the morning session if you haven't yet." },
        lunchSoon: { title: "🍔 Lunch Break Soon", body: "Preparing for lunch? Remember to scan out at the Kiosk." },
        lunchStart: { title: "🍴 Lunch Reminder", body: "Please ensure your lunch break scan is recorded on the Kiosk." },
        lunchEnd: { title: "👔 Back to Work", body: "Lunch is over! Please remember to scan back in for the afternoon session." },
        checkoutSoon: { title: "🌙 Wrapping Up", body: "The lab is closing soon. Please prepare for your final scan." },
        checkoutStart: { title: "👋 Time to Head Out", body: "Don't forget your checkout scan to finalize your hours for today!" },
        weeklyMonday: { title: "🚀 Kickstart Your Week!", body: "Welcome to a new week at CodeTribe! Set your goals, grab your coffee, and let's build something amazing." },
        weeklyFriday: { title: "🎉 Week Complete!", body: "Great job this week! Make sure your final scan is done, rest up, and recharge for the weekend." }
    },
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

    const isSuperAdmin = (user as any)?.isSuperAdmin === true;

    const [activeTab, setActiveTab] = useState<'org' | 'ecosystem' | 'academic' | 'data' | 'web3' | 'notifications' | 'audit' | 'profile'>('org');

    const [formData, setFormData] = useState<any>(DEFAULT_SETTINGS);
    const [originalData, setOriginalData] = useState<any>(DEFAULT_SETTINGS);

    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);
    const [isUploadingSignature, setIsUploadingSignature] = useState(false);

    const [broadcastPayload, setBroadcastPayload] = useState({ title: '', message: '', target: 'all_learners', environment: 'dev' });
    const [isBroadcasting, setIsBroadcasting] = useState(false);

    const [recentBroadcasts, setRecentBroadcasts] = useState<any[]>([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);

    const [newDemographicField, setNewDemographicField] = useState("");

    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [mapTargetId, setMapTargetId] = useState<string | null>(null);
    const [tempCoords, setTempCoords] = useState({ lat: -25.7479, lng: 28.2293 });
    const [mapSearchText, setMapSearchText] = useState("");

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    });

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

                        const decodedBssids = (campus.wifiSettings?.allowedBssids || []).map((b: string) => {
                            try { return atob(b); } catch { return b; }
                        });

                        return {
                            ...campus,
                            id: finalId,
                            campusTimes: campus.campusTimes || DEFAULT_CAMPUS_TIMES,
                            virtualSchedules: campus.virtualSchedules || [], // Ensure virtual schedules exist
                            notificationSettings: {
                                globalMasterSwitch: campus.notificationSettings?.globalMasterSwitch ?? true,
                                dailyRemindersEnabled: campus.notificationSettings?.dailyRemindersEnabled ?? true,
                                weeklyMotivationEnabled: campus.notificationSettings?.weeklyMotivationEnabled ?? true,
                            },
                            wifiSettings: {
                                ...campus.wifiSettings,
                                allowedBssids: decodedBssids
                            }
                        };
                    });

                    const mergedData = {
                        ...DEFAULT_SETTINGS,
                        ...data,
                        notificationSettings: {
                            ...DEFAULT_SETTINGS.notificationSettings,
                            ...(data.notificationSettings || {})
                        },
                        notificationTemplates: {
                            ...DEFAULT_SETTINGS.notificationTemplates,
                            ...(data.notificationTemplates || {})
                        },
                        campuses: loadedCampuses,
                        csvMappings: safeMappings,
                        customCsvMappings: data.customCsvMappings || [],
                        globalDemographicFields: data.globalDemographicFields || DEFAULT_SETTINGS.globalDemographicFields
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

    const fetchBroadcastHistory = async () => {
        setIsLoadingHistory(true);
        try {
            const q = query(
                collection(db, "notifications"),
                where("type", "==", "system"),
                orderBy("timestamp", "desc"),
                limit(10)
            );
            const snap = await getDocs(q);
            const history = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRecentBroadcasts(history);
        } catch (error: any) {
            console.error("Error fetching broadcast history:", error);
        } finally {
            setIsLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'notifications') {
            fetchBroadcastHistory();
        }
    }, [activeTab]);

    useEffect(() => {
        const hasChanged = JSON.stringify(formData) !== JSON.stringify(originalData);
        setIsDirty(hasChanged);
    }, [formData, originalData]);

    const openInGoogleMaps = (lat: number, lng: number) => {
        if (!lat || !lng || lat === 0 || lng === 0) return;
        window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank', 'noopener,noreferrer');
    };

    const openMapModal = (target: string, lat: number, lng: number, address: string) => {
        setMapTargetId(target);
        if (lat !== 0 && lng !== 0) {
            setTempCoords({ lat, lng });
        } else {
            setTempCoords({ lat: -25.7479, lng: 28.2293 });
        }
        setMapSearchText(address || "");
        setIsMapModalOpen(true);
    };

    const confirmMapCoordinates = () => {
        if (mapTargetId === 'main') {
            setFormData((prev: any) => ({
                ...prev,
                institutionLat: tempCoords.lat,
                institutionLng: tempCoords.lng,
            }));
        } else {
            setFormData((prev: any) => ({
                ...prev,
                campuses: prev.campuses.map((c: any) => c.id === mapTargetId ? {
                    ...c,
                    lat: tempCoords.lat,
                    lng: tempCoords.lng
                } : c)
            }));
        }
        setIsDirty(true);
        setIsMapModalOpen(false);
    };

    const handleModalAddressSelected = (place: any) => {
        if (place.geometry && place.geometry.location) {
            const newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            const newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
            setTempCoords({ lat: newLat, lng: newLng });
        }
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

    const updateNested = (category: string, field: string, val: any) => {
        setFormData((prev: any) => ({
            ...prev,
            [category]: { ...(prev[category] || {}), [field]: val }
        }));
        setIsDirty(true);
    };

    const updateNestedTemplate = (triggerKey: string, field: 'title' | 'body', value: string) => {
        setFormData((prev: any) => ({
            ...prev,
            notificationTemplates: {
                ...prev.notificationTemplates,
                [triggerKey]: {
                    ...prev.notificationTemplates?.[triggerKey],
                    [field]: value
                }
            }
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
                    wifiSettings: { enforceWifi: false, ssid: '', allowedBssids: [] },
                    campusTimes: DEFAULT_CAMPUS_TIMES,
                    virtualSchedules: [],
                    notificationSettings: {
                        globalMasterSwitch: true,
                        dailyRemindersEnabled: true,
                        weeklyMotivationEnabled: true
                    }
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

    // ─── VIRTUAL SCHEDULE HANDLERS ───
    const handleAddVirtualSchedule = (campusId: string) => {
        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => c.id === campusId ? {
                ...c,
                virtualSchedules: [...(c.virtualSchedules || []), { dayOfWeek: 'Monday', startTime: '09:00', endTime: '11:00' }]
            } : c)
        }));
        setIsDirty(true);
    };

    const handleUpdateVirtualSchedule = (campusId: string, index: number, field: string, value: string) => {
        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => {
                if (c.id !== campusId) return c;
                const newSchedules = [...(c.virtualSchedules || [])];
                newSchedules[index] = { ...newSchedules[index], [field]: value };
                return { ...c, virtualSchedules: newSchedules };
            })
        }));
        setIsDirty(true);
    };

    const handleRemoveVirtualSchedule = (campusId: string, index: number) => {
        setFormData((prev: any) => ({
            ...prev,
            campuses: prev.campuses.map((c: any) => {
                if (c.id !== campusId) return c;
                const newSchedules = (c.virtualSchedules || []).filter((_: any, i: number) => i !== index);
                return { ...c, virtualSchedules: newSchedules };
            })
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

    const handleAddDemographicField = () => {
        if (!newDemographicField.trim()) return;
        const formattedKey = newDemographicField.trim().toLowerCase().replace(/\s+/g, '_');

        if (formData.globalDemographicFields?.includes(formattedKey)) {
            alert("This demographic field already exists.");
            return;
        }

        setFormData((prev: any) => ({
            ...prev,
            globalDemographicFields: [...(prev.globalDemographicFields || []), formattedKey]
        }));
        setNewDemographicField('');
        setIsDirty(true);
    };

    const handleRemoveDemographicField = (fieldToRemove: string) => {
        setFormData((prev: any) => ({
            ...prev,
            globalDemographicFields: (prev.globalDemographicFields || []).filter((f: string) => f !== fieldToRemove)
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
        setNewDemographicField('');
        setIsDirty(false);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const docRef = doc(db, "system_settings", "global");

            const securedCampuses = formData.campuses.map((c: any) => ({
                ...c,
                wifiSettings: {
                    ...c.wifiSettings,
                    allowedBssids: (c.wifiSettings?.allowedBssids || [])
                        .map((b: string) => b.trim().toLowerCase())
                        .filter((b: string) => b !== '')
                        .map((b: string) => btoa(b))
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

    const handleSendBroadcast = async () => {
        if (!broadcastPayload.title.trim() || !broadcastPayload.message.trim()) {
            alert("Please fill in both title and message to send a broadcast.");
            return;
        }

        setIsBroadcasting(true);
        try {
            const targetWithEnv = `${broadcastPayload.target}_${broadcastPayload.environment}`;

            await addDoc(collection(db, "notifications"), {
                recipientId: targetWithEnv,
                type: "system",
                title: broadcastPayload.title,
                message: broadcastPayload.message,
                timestamp: serverTimestamp(),
                read: false,
                sentBy: user?.uid || 'admin'
            });

            alert(`Broadcast sent successfully to ${targetWithEnv}!`);
            setBroadcastPayload({ ...broadcastPayload, title: '', message: '' });

            fetchBroadcastHistory();

        } catch (error) {
            console.error("Broadcast failed:", error);
            alert("Failed to queue broadcast message. Please check Firestore permissions.");
        } finally {
            setIsBroadcasting(false);
        }
    };

    const formatTimestamp = (ts: any) => {
        if (!ts) return 'Just now';
        const date = ts.toDate ? ts.toDate() : new Date(ts);
        return date.toLocaleString('en-ZA', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const TABS = [
        { id: 'org', label: 'Organization', icon: Building2 },
        { id: 'ecosystem', label: 'Ecosystem CRM', icon: ListPlus },
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

            {/* GOOGLE MAP MODAL OVERLAY */}
            {isMapModalOpen && (
                <div className="lfm-overlay" onClick={() => setIsMapModalOpen(false)}>
                    <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title">
                                <MapPin size={16} /> Adjust Exact Location
                            </h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setIsMapModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="lfm-body">
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
                                Use the search bar to jump to an area, then click or drag the red marker to pinpoint the exact building entrance. This strict coordinate is used for the Zero-Trust Geofence security.
                            </p>
                            <div style={{ position: 'relative', marginBottom: '4px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', zIndex: 10 }} />
                                <Autocomplete
                                    key={`modal-search-${mapTargetId}`}
                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                    onPlaceSelected={handleModalAddressSelected}
                                    options={{ types: [], componentRestrictions: { country: "za" } }}
                                    className="lfm-input"
                                    defaultValue={mapSearchText}
                                    placeholder="Search specific building or street..."
                                    style={{ paddingLeft: '38px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}
                                />
                            </div>
                            <div style={{ width: '100%', height: '400px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--mlab-border)', position: 'relative' }}>
                                {isLoaded ? (
                                    <GoogleMap
                                        mapContainerStyle={{ width: '100%', height: '100%' }}
                                        center={tempCoords}
                                        zoom={18}
                                        onClick={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
                                        options={{ disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false }}
                                    >
                                        <Marker position={tempCoords} draggable={true} onDragEnd={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })} />
                                    </GoogleMap>
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                                        <Loader2 size={32} color="var(--mlab-blue)" className="lfm-spin" />
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', fontFamily: 'monospace', background: 'var(--mlab-bg)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--mlab-border)', width: 'max-content' }}>
                                Lat: {tempCoords.lat.toFixed(6)}, Lng: {tempCoords.lng.toFixed(6)}
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsMapModalOpen(false)}>Cancel</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={confirmMapCoordinates}><Save size={13} /> Save Pin Location</button>
                        </div>
                    </div>
                </div>
            )}

            <main className="main-wrapper settings-wrapper">
                <PageHeader
                    theme="default"
                    variant="hero"
                    eyebrow="System Configuration"
                    title="Platform Settings"
                    description="Institutional accreditation and global compliance infrastructure."
                />

                <div className="settings-container">
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
                                                    <div className="address-editor-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <div className="editor-title"><Edit2 size={14} /> <span>Official Address Override (QCTO Compliant)</span></div>
                                                        {formData.institutionLat !== 0 && (
                                                            <div className="verification-pill bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                                                                <CheckCircle2 size={12} /> <span>GPS Verified</span>
                                                            </div>
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
                                                        <div className="mlab-form-group col-span-2 mt-2" style={{ display: 'flex', gap: '12px' }}>
                                                            <button
                                                                type="button"
                                                                className="mlab-btn mlab-btn--outline-blue mlab-btn--sm"
                                                                onClick={() => openInGoogleMaps(formData.institutionLat, formData.institutionLng)}
                                                                disabled={!formData.institutionLat}
                                                            >
                                                                <Globe size={14} /> <span>View Map</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="mlab-btn mlab-btn--outline-blue mlab-btn--sm"
                                                                style={{ color: 'var(--mlab-blue)', borderColor: 'var(--mlab-blue)' }}
                                                                onClick={() => openMapModal('main', formData.institutionLat, formData.institutionLng, formData.institutionAddress)}
                                                            >
                                                                <MapPin size={14} /> <span>Adjust Pin</span>
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
                                                    {campus.type === 'online' ? (
                                                        <MonitorPlay size={18} color="var(--mlab-purple)" />
                                                    ) : (
                                                        <MapPin size={18} color={campus.isDefault ? 'var(--mlab-green-dark)' : 'var(--mlab-grey)'} />
                                                    )}
                                                    <span>Site {index + 1}: {campus.name || 'New Campus'} {campus.isDefault && "(Primary)"}</span>
                                                    {campus.type === 'online' && (
                                                        <span style={{ marginLeft: '8px', fontSize: '0.7rem', background: '#fdf4ff', color: '#c026d3', padding: '2px 8px', borderRadius: '4px', border: '1px solid #f5d0fe' }}>Virtual / Online</span>
                                                    )}
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
                                                    <input type="text" className="mlab-input" value={campus.name} onChange={(e) => handleCampusChange(campus.id, 'name', e.target.value)} placeholder="e.g., Kimberley Hub or Virtual Cohort" />
                                                </div>
                                                <div className="mlab-form-group">
                                                    <label>Delivery Mode</label>
                                                    <select className="mlab-input" value={campus.type || 'physical'} onChange={(e) => handleCampusChange(campus.id, 'type', e.target.value)}>
                                                        <option value="physical">Physical Campus</option>
                                                        <option value="online">Online / Distance</option>
                                                    </select>
                                                </div>
                                                <div className="mlab-form-group col-span-2">
                                                    <label>QCTO SDP Accreditation No. (Optional for Virtual)</label>
                                                    <input type="text" className="mlab-input" value={campus.siteAccreditationNumber} onChange={(e) => handleCampusChange(campus.id, 'siteAccreditationNumber', e.target.value)} placeholder="e.g., SDP0708..." />
                                                </div>

                                                {/* PHYSICAL CAMPUS UI */}
                                                {campus.type !== 'online' && (
                                                    <>
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

                                                        <div className="mlab-form-group col-span-2 bg-slate-50 p-5 rounded-lg mt-2">
                                                            <div style={{ display: 'flex', flexDirection: 'row', justifyContent: 'space-between' }}>
                                                                <div className="editor-title mb-4" style={{ width: '50%' }}><Edit2 size={14} /> <span>Site Configuration</span></div>
                                                                <div>
                                                                    <div className="mlab-form-group col-span-2 mt-2" style={{ display: 'flex', gap: '12px', flexDirection: 'row' }}>
                                                                        <button
                                                                            type="button"
                                                                            className="mlab-btn mlab-btn--outline-blue mlab-btn--sm"
                                                                            onClick={() => openInGoogleMaps(campus.lat, campus.lng)}
                                                                            disabled={!campus.lat}
                                                                        >
                                                                            <Globe size={14} /> <span>View Map</span>
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="mlab-btn mlab-btn--outline-blue mlab-btn--sm"
                                                                            style={{ color: 'var(--mlab-blue)', borderColor: 'var(--mlab-blue)' }}
                                                                            onClick={() => openMapModal(campus.id, campus.lat, campus.lng, campus.address)}
                                                                        >
                                                                            <MapPin size={14} /> <span>Adjust Pin</span>
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>

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
                                                        </div>

                                                        {/* PHYSICAL: CAMPUS OPERATING HOURS */}
                                                        <div className="mlab-form-group col-span-2">
                                                            <hr className="my-6 border-slate-200" />
                                                            <div className="editor-title mb-4">
                                                                <Clock size={16} /> CAMPUS OPERATING HOURS
                                                            </div>
                                                            <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                                                                These daily boundaries are synced to the Kiosk and Mobile App to enforce check-in and checkout rules dynamically.
                                                            </p>
                                                            <div className="settings-form-grid">
                                                                <div className="mlab-form-group">
                                                                    <label className="text-slate-700">Campus Opens</label>
                                                                    <input type="time" className="mlab-input bg-white" value={campus.campusTimes?.checkInStart || ''} onChange={(e) => handleCampusChange(campus.id, 'campusTimes', { ...campus.campusTimes, checkInStart: e.target.value })} />
                                                                </div>
                                                                <div className="mlab-form-group">
                                                                    <label className="text-slate-700">Late Arrival Threshold</label>
                                                                    <input type="time" className="mlab-input bg-white" value={campus.campusTimes?.checkInLate || ''} onChange={(e) => handleCampusChange(campus.id, 'campusTimes', { ...campus.campusTimes, checkInLate: e.target.value })} />
                                                                </div>
                                                                <div className="mlab-form-group">
                                                                    <label className="text-slate-700">Lunch Break Starts</label>
                                                                    <input type="time" className="mlab-input bg-white" value={campus.campusTimes?.lunchStart || ''} onChange={(e) => handleCampusChange(campus.id, 'campusTimes', { ...campus.campusTimes, lunchStart: e.target.value })} />
                                                                </div>
                                                                <div className="mlab-form-group">
                                                                    <label className="text-slate-700">Lunch Break Ends</label>
                                                                    <input type="time" className="mlab-input bg-white" value={campus.campusTimes?.lunchEnd || ''} onChange={(e) => handleCampusChange(campus.id, 'campusTimes', { ...campus.campusTimes, lunchEnd: e.target.value })} />
                                                                </div>
                                                                <div className="mlab-form-group">
                                                                    <label className="text-slate-700">Dismissal (Checkout Allowed)</label>
                                                                    <input type="time" className="mlab-input bg-white" value={campus.campusTimes?.checkoutStart || ''} onChange={(e) => handleCampusChange(campus.id, 'campusTimes', { ...campus.campusTimes, checkoutStart: e.target.value })} />
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* PHYSICAL: WIFI SHIELD */}
                                                        <div className="mlab-form-group col-span-2">
                                                            <hr className="my-6 border-slate-200" />
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
                                                                        onChange={(e) => handleCampusChange(campus.id, 'wifiSettings', {
                                                                            ...campus.wifiSettings,
                                                                            allowedBssids: e.target.value.split(',')
                                                                        })}
                                                                        onBlur={(e) => handleCampusChange(campus.id, 'wifiSettings', {
                                                                            ...campus.wifiSettings,
                                                                            allowedBssids: e.target.value.split(',').map(s => s.trim().toLowerCase()).filter(s => s !== '')
                                                                        })}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </>
                                                )}

                                                {/* VIRTUAL/ONLINE CAMPUS UI: DYNAMIC SCHEDULE */}
                                                {campus.type === 'online' && (
                                                    <div className="mlab-form-group col-span-2">
                                                        <hr className="my-6 border-slate-200" />
                                                        <div className="editor-title mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <Calendar size={16} /> VIRTUAL SESSION SCHEDULE
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="mlab-btn mlab-btn--sm mlab-btn--outline-blue"
                                                                onClick={() => handleAddVirtualSchedule(campus.id)}
                                                            >
                                                                <Plus size={14} /> Add Session Day
                                                            </button>
                                                        </div>
                                                        <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                                                            Define the exact recurring weekly days and time windows for this online class (e.g., Mon, Wed, Fri from 10:00 - 12:00). The system uses this exact window to calculate expected Zoom attendance duration.
                                                        </p>

                                                        {(!campus.virtualSchedules || campus.virtualSchedules.length === 0) ? (
                                                            <div style={{ background: '#f8fafc', padding: '1.5rem', textAlign: 'center', borderRadius: '8px', color: '#64748b', border: '1px dashed #cbd5e1' }}>
                                                                No recurring sessions defined. Click "Add Session Day" to start.
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                                {campus.virtualSchedules.map((schedule: any, sIdx: number) => (
                                                                    <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                                                                        <div style={{ flex: 1 }}>
                                                                            <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Day of Week</label>
                                                                            <select
                                                                                className="mlab-input bg-white m-0"
                                                                                value={schedule.dayOfWeek}
                                                                                onChange={(e) => handleUpdateVirtualSchedule(campus.id, sIdx, 'dayOfWeek', e.target.value)}
                                                                            >
                                                                                {WEEKDAYS.map(day => <option key={day} value={day}>{day}</option>)}
                                                                            </select>
                                                                        </div>
                                                                        <div style={{ width: '150px' }}>
                                                                            <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Start Time</label>
                                                                            <input
                                                                                type="time"
                                                                                className="mlab-input bg-white m-0"
                                                                                value={schedule.startTime}
                                                                                onChange={(e) => handleUpdateVirtualSchedule(campus.id, sIdx, 'startTime', e.target.value)}
                                                                            />
                                                                        </div>
                                                                        <div style={{ color: '#94a3b8', marginTop: '16px' }}>to</div>
                                                                        <div style={{ width: '150px' }}>
                                                                            <label style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '4px' }}>End Time</label>
                                                                            <input
                                                                                type="time"
                                                                                className="mlab-input bg-white m-0"
                                                                                value={schedule.endTime}
                                                                                onChange={(e) => handleUpdateVirtualSchedule(campus.id, sIdx, 'endTime', e.target.value)}
                                                                            />
                                                                        </div>
                                                                        <div style={{ marginTop: '16px' }}>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleRemoveVirtualSchedule(campus.id, sIdx)}
                                                                                style={{ padding: '8px', background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', borderRadius: '6px', cursor: 'pointer' }}
                                                                                title="Remove Session"
                                                                            >
                                                                                <Trash2 size={16} />
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <div className="mlab-form-group col-span-2">
                                                    <hr className="my-6 border-slate-200" />
                                                    <div className="editor-title mb-4">
                                                        <Bell size={16} /> CAMPUS-SPECIFIC NOTIFICATION OVERRIDES
                                                    </div>
                                                    <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                                                        Toggle these settings to silence automated mobile app reminders for this campus only.
                                                    </p>
                                                    <div className="settings-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Enable Local Alerts</label>
                                                            <select
                                                                className="mlab-input bg-white"
                                                                value={campus.notificationSettings?.globalMasterSwitch === false ? 'no' : 'yes'}
                                                                onChange={(e) => handleCampusChange(campus.id, 'notificationSettings', { ...campus.notificationSettings, globalMasterSwitch: e.target.value === 'yes' })}
                                                            >
                                                                <option value="yes">Enabled (Normal)</option>
                                                                <option value="no">Silenced (Muted)</option>
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Daily Reminders</label>
                                                            <select
                                                                className="mlab-input bg-white"
                                                                value={campus.notificationSettings?.dailyRemindersEnabled === false ? 'no' : 'yes'}
                                                                disabled={campus.notificationSettings?.globalMasterSwitch === false}
                                                                onChange={(e) => handleCampusChange(campus.id, 'notificationSettings', { ...campus.notificationSettings, dailyRemindersEnabled: e.target.value === 'yes' })}
                                                                style={{ opacity: campus.notificationSettings?.globalMasterSwitch === false ? 0.5 : 1 }}
                                                            >
                                                                <option value="yes">Enabled</option>
                                                                <option value="no">Disabled</option>
                                                            </select>
                                                        </div>
                                                        <div className="mlab-form-group">
                                                            <label className="text-slate-700">Weekly Motivation</label>
                                                            <select
                                                                className="mlab-input bg-white"
                                                                value={campus.notificationSettings?.weeklyMotivationEnabled === false ? 'no' : 'yes'}
                                                                disabled={campus.notificationSettings?.globalMasterSwitch === false}
                                                                onChange={(e) => handleCampusChange(campus.id, 'notificationSettings', { ...campus.notificationSettings, weeklyMotivationEnabled: e.target.value === 'yes' })}
                                                                style={{ opacity: campus.notificationSettings?.globalMasterSwitch === false ? 0.5 : 1 }}
                                                            >
                                                                <option value="yes">Enabled</option>
                                                                <option value="no">Disabled</option>
                                                            </select>
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
                                        <div className="asset-preview"><img src={formData.logoUrl || fallbackLogo} alt="Institution Logo" crossOrigin="anonymous" /></div>
                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
                                            {isUploadingLogo ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Logo
                                            <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'logoUrl')} />
                                        </label>
                                    </div>
                                    <div className="asset-upload-box">
                                        <h3 className="asset-title">Authorized Signature</h3>
                                        <div className="asset-preview"><img src={formData.signatureUrl || fallbackSignature} alt="Authorized Signature" crossOrigin="anonymous" /></div>
                                        <label className="mlab-btn mlab-btn--outline-blue mlab-btn--sm mt-3 cursor-pointer">
                                            {isUploadingSignature ? <Loader2 className="spin" size={14} /> : <UploadCloud size={14} />} Replace Signature
                                            <input type="file" accept="image/*" hidden onChange={(e) => handleFileUpload(e, 'signatureUrl')} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ECOSYSTEM CRM CONFIGURATION */}
                        {activeTab === 'ecosystem' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Ecosystem CRM Settings</h2>
                                <p className="settings-section__desc">Manage global demographic data requirements across all ecosystem events.</p>

                                <div className="settings-card">
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--mlab-midnight)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Database size={18} /> Global Demographic Fields
                                    </h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                        These fields will automatically appear in every Kiosk check-in form and drive your global impact analytics. Core identity fields (Name, Email, Mobile) are permanently locked to guarantee CRM integrity.
                                    </p>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '1.5rem' }}>
                                        {['First Name', 'Last Name', 'Email Address', 'Mobile Number'].map(f => (
                                            <span key={f} style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', color: '#94a3b8', fontSize: '0.75rem', padding: '6px 12px', borderRadius: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Lock size={12} /> {f}
                                            </span>
                                        ))}

                                        {formData.globalDemographicFields?.map((field: string) => (
                                            <span key={field} style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-blue)', color: 'var(--mlab-blue)', fontSize: '0.75rem', padding: '6px 12px', borderRadius: '20px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {field.replace(/_/g, ' ').toUpperCase()}
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDemographicField(field)}
                                                    style={{ background: 'none', border: 'none', color: 'var(--mlab-red)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                    title="Remove Global Field"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px dashed #cbd5e1' }}>
                                        <div className="mlab-form-group" style={{ flex: 1, margin: 0 }}>
                                            <label>Add New Global Demographic Field</label>
                                            <input
                                                type="text"
                                                className="mlab-input bg-white"
                                                placeholder="e.g. Highest Education Level"
                                                value={newDemographicField}
                                                onChange={(e) => setNewDemographicField(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        handleAddDemographicField();
                                                    }
                                                }}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            className="mlab-btn mlab-btn--primary"
                                            onClick={handleAddDemographicField}
                                            disabled={!newDemographicField.trim()}
                                        >
                                            <Plus size={16} /> Add Field
                                        </button>
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

                        {/* 5. NOTIFICATIONS CENTER */}
                        {activeTab === 'notifications' && (
                            <div className="settings-section animate-fade-in">
                                <h2 className="settings-section__title">Notification Preferences</h2>
                                <p className="settings-section__desc">Manage automated mobile app reminders and send global live broadcasts.</p>

                                {/* PART A: GLOBAL AUTOMATED SCHEDULES */}
                                <div className="settings-card">
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--mlab-midnight)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Clock size={18} /> Automated Scheduling Controls
                                    </h3>

                                    {/* Global Master Switch */}
                                    <div className="setting-row-toggle">
                                        <div className="setting-toggle-text">
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <ShieldAlert size={16} color="var(--mlab-red)" /> Global Master Switch
                                            </h4>
                                            <p>Master kill-switch. Disables all automated schedule-based notifications across all campuses instantly.</p>
                                        </div>
                                        <label className="mlab-toggle">
                                            <input
                                                type="checkbox"
                                                checked={formData.notificationSettings?.globalMasterSwitch ?? true}
                                                onChange={(e) => updateNested('notificationSettings', 'globalMasterSwitch', e.target.checked)}
                                            />
                                            <span className="mlab-toggle-slider"></span>
                                        </label>
                                    </div>

                                    <hr className="settings-divider mt-6 mb-6" />

                                    {/* Daily Reminders */}
                                    <div className="setting-row-toggle" style={{ opacity: formData.notificationSettings?.globalMasterSwitch === false ? 0.5 : 1 }}>
                                        <div className="setting-toggle-text">
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Bell size={16} color="var(--mlab-blue)" /> Daily Operational Reminders
                                            </h4>
                                            <p>Automated alerts for check-in opens, late thresholds, lunch breaks, and checkout times.</p>
                                        </div>
                                        <label className="mlab-toggle">
                                            <input
                                                type="checkbox"
                                                checked={formData.notificationSettings?.dailyRemindersEnabled ?? true}
                                                disabled={formData.notificationSettings?.globalMasterSwitch === false}
                                                onChange={(e) => updateNested('notificationSettings', 'dailyRemindersEnabled', e.target.checked)}
                                            />
                                            <span className="mlab-toggle-slider"></span>
                                        </label>
                                    </div>

                                    <hr className="settings-divider mt-6 mb-6" />

                                    {/* Weekly Motivation */}
                                    <div className="setting-row-toggle" style={{ opacity: formData.notificationSettings?.globalMasterSwitch === false ? 0.5 : 1 }}>
                                        <div className="setting-toggle-text">
                                            <h4 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <CheckCircle2 size={16} color="var(--mlab-green)" /> Weekly Motivational Bookends
                                            </h4>
                                            <p>High-energy kick-off messages on Monday mornings and wrap-up celebrations on Friday afternoons.</p>
                                        </div>
                                        <label className="mlab-toggle">
                                            <input
                                                type="checkbox"
                                                checked={formData.notificationSettings?.weeklyMotivationEnabled ?? true}
                                                disabled={formData.notificationSettings?.globalMasterSwitch === false}
                                                onChange={(e) => updateNested('notificationSettings', 'weeklyMotivationEnabled', e.target.checked)}
                                            />
                                            <span className="mlab-toggle-slider"></span>
                                        </label>
                                    </div>
                                </div>

                                {/* PART B: NOTIFICATION TEMPLATES */}
                                <div className="settings-card mt-6">
                                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--mlab-midnight)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <MessageSquare size={18} /> Automated Message Templates
                                    </h3>
                                    <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.5rem' }}>
                                        Customize the text for automated mobile app reminders.
                                    </p>

                                    <div className="settings-form-grid" style={{ gap: '2rem' }}>
                                        {NOTIFICATION_TRIGGERS.map(trigger => (
                                            <div key={trigger.key} className="mlab-form-group col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--mlab-midnight)', margin: 0 }}>{trigger.label}</h4>
                                                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{trigger.description}</span>
                                                </div>
                                                <div className="settings-form-grid">
                                                    <div className="mlab-form-group col-span-2">
                                                        <label>Notification Title</label>
                                                        <input
                                                            type="text"
                                                            className="mlab-input bg-white"
                                                            value={formData.notificationTemplates?.[trigger.key]?.title || ''}
                                                            onChange={(e) => updateNestedTemplate(trigger.key, 'title', e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="mlab-form-group col-span-2">
                                                        <label>Notification Body</label>
                                                        <textarea
                                                            className="mlab-input bg-white"
                                                            rows={2}
                                                            value={formData.notificationTemplates?.[trigger.key]?.body || ''}
                                                            onChange={(e) => updateNestedTemplate(trigger.key, 'body', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* PART C: LIVE PUSH BROADCAST */}
                                <h2 className="settings-section__title mt-10">Manual Broadcast Center</h2>
                                <p className="settings-section__desc">Send immediate push notifications to mobile devices via Firebase Cloud Messaging.</p>

                                <div className="settings-card bg-slate-50 border border-slate-200">
                                    <div className="settings-form-grid">

                                        <div className="mlab-form-group">
                                            <label>Target Environment</label>
                                            <select
                                                className="mlab-input bg-white"
                                                value={broadcastPayload.environment}
                                                onChange={(e) => setBroadcastPayload({ ...broadcastPayload, environment: e.target.value })}
                                            >
                                                <option value="dev">Development (Safe Local Testing)</option>
                                                <option value="beta">Beta (Live App Testers)</option>
                                                <option value="prod">Production (App Store Users)</option>
                                            </select>
                                        </div>

                                        <div className="mlab-form-group">
                                            <label>Broadcast Group</label>
                                            <select
                                                className="mlab-input bg-white"
                                                value={broadcastPayload.target}
                                                onChange={(e) => setBroadcastPayload({ ...broadcastPayload, target: e.target.value })}
                                            >
                                                <option value="all_learners">All Campuses (Global)</option>
                                                {formData.campuses.map((c: any) => (
                                                    <option key={c.id} value={`campus_${c.id}`}>{c.name || 'Unnamed'} Campus Only</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div className="mlab-form-group col-span-2">
                                            <label>Announcement Title</label>
                                            <input
                                                type="text"
                                                className="mlab-input bg-white"
                                                placeholder="e.g. CodeTribe Hackathon Tomorrow!"
                                                value={broadcastPayload.title}
                                                onChange={(e) => setBroadcastPayload({ ...broadcastPayload, title: e.target.value })}
                                            />
                                        </div>
                                        <div className="mlab-form-group col-span-2">
                                            <label>Message Body</label>
                                            <textarea
                                                className="mlab-input bg-white"
                                                rows={3}
                                                placeholder="Enter the full message details here..."
                                                value={broadcastPayload.message}
                                                onChange={(e) => setBroadcastPayload({ ...broadcastPayload, message: e.target.value })}
                                            />
                                        </div>
                                        <div className="mlab-form-group col-span-2 flex justify-end mt-2">
                                            <button
                                                className="mlab-btn mlab-btn--primary"
                                                onClick={handleSendBroadcast}
                                                disabled={isBroadcasting || !broadcastPayload.title || !broadcastPayload.message}
                                            >
                                                {isBroadcasting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                                                Transmit Push Notification
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* PART D: RECENT BROADCASTS UI */}
                                <div className="settings-card mt-6">
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
                                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--mlab-midnight)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                                            <History size={18} /> Recent Broadcast Log
                                        </h3>
                                        <button
                                            className="mlab-btn mlab-btn--outline-blue mlab-btn--sm"
                                            onClick={fetchBroadcastHistory}
                                            disabled={isLoadingHistory}
                                        >
                                            {isLoadingHistory ? <Loader2 size={14} className="spin" /> : "Refresh Log"}
                                        </button>
                                    </div>

                                    {isLoadingHistory ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading history...</div>
                                    ) : recentBroadcasts.length === 0 ? (
                                        <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
                                            No recent broadcasts found in the database.
                                        </div>
                                    ) : (
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                <thead>
                                                    <tr style={{ background: '#f1f5f9', color: '#475569', textAlign: 'left' }}>
                                                        <th style={{ padding: '10px 12px', fontWeight: 600, width: '20%' }}>Sent At</th>
                                                        <th style={{ padding: '10px 12px', fontWeight: 600, width: '20%' }}>Environment</th>
                                                        <th style={{ padding: '10px 12px', fontWeight: 600, width: '60%' }}>Announcement Details</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {recentBroadcasts.map((b) => (
                                                        <tr key={b.id} style={{ borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' }}>
                                                            <td style={{ padding: '16px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                                {formatTimestamp(b.timestamp)}
                                                            </td>
                                                            <td style={{ padding: '16px 12px' }}>
                                                                <span style={{
                                                                    background: b.recipientId?.includes('_prod') ? '#dcfce7' : (b.recipientId?.includes('_beta') ? '#fef3c7' : '#e0e7ff'),
                                                                    color: b.recipientId?.includes('_prod') ? '#166534' : (b.recipientId?.includes('_beta') ? '#92400e' : '#3730a3'),
                                                                    padding: '4px 8px', borderRadius: '4px', fontWeight: 600, fontSize: '0.75rem',
                                                                    display: 'inline-block'
                                                                }}>
                                                                    {b.recipientId}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '16px 12px' }}>
                                                                <div style={{ color: 'var(--mlab-midnight)', fontWeight: 600, marginBottom: '4px', fontSize: '0.9rem' }}>
                                                                    {b.title}
                                                                </div>
                                                                <div style={{ color: '#64748b', lineHeight: '1.4' }}>
                                                                    {b.message}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 6. EMPTY TABS */}
                        {['audit', 'profile'].includes(activeTab) && (
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
    if (tab === 'audit') return <ShieldAlert size={48} className="empty-icon text-slate-300" />;
    return <User size={48} className="empty-icon text-slate-300" />;
};