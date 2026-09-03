// src/components/views/LearnerProfileView/LearnerProfileView.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
    User, Phone, MapPin, ShieldCheck,
    FileText, Edit3, Save, X, Fingerprint,
    GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye, Globe, Building2, Search
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot } from 'firebase/firestore';
import Autocomplete from "react-google-autocomplete";
import { GoogleMap, Marker } from '@react-google-maps/api';
import './LearnerProfileView.css';
import { storage, db } from '../../../../lib/firebase';
import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
import { useToast } from '../../../../components/common/Toast/Toast';

import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
import { fetchStatssaCodes } from '../../../../services/qctoService';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

/* ── STRICT QCTO DICTIONARIES ────────────────────────── */
const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

const extractFilename = (url: string) => {
    if (!url) return 'Saved Document';
    try {
        const decoded = decodeURIComponent(url.split('?')[0]);
        const parts = decoded.split('/');
        return parts[parts.length - 1];
    } catch {
        return 'Saved Document';
    }
};

interface ProfileProps {
    profile: any;
    user: any;
    onUpdate: (id: string, updates: any) => Promise<void>;
}

export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
    const toast = useToast();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

    const [liveProfile, setLiveProfile] = useState<any>(profile || {});
    const [formData, setFormData] = useState<any>({});

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
    const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

    // 🚀 MAP & ADDRESS MODAL OVERLAY STATES
    const [isMapModalOpen, setIsMapModalOpen] = useState(false);
    const [isManualAddressModalOpen, setIsManualAddressModalOpen] = useState(false);
    const [tempCoords, setTempCoords] = useState({ lat: -26.2041, lng: 28.0473 });
    const [mapSearchText, setMapSearchText] = useState("");
    const [isGoogleReady, setIsGoogleReady] = useState(() => typeof window !== 'undefined' && Boolean((window as any).google?.maps?.places));

    const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

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

    useEffect(() => {
        const loadCodes = async () => {
            const codes = await fetchStatssaCodes();
            setAllStatssaCodes(codes);
        };
        loadCodes();
    }, []);

    const statssaOptions = useMemo(() => {
        return allStatssaCodes.map(c => ({
            value: c.statssa_area_code,
            label: `${c.statssa_area_code} - ${c.town}`,
            subLabel: `${c.area} (${c.local_municipality})`
        }));
    }, [allStatssaCodes]);

    useEffect(() => {
        if (profile) {
            setLiveProfile((prev: any) => ({ ...prev, ...profile }));
        }
    }, [profile]);

    // REAL-TIME FIRESTORE LISTENER
    useEffect(() => {
        if (!targetId) return;

        const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
            if (docSnap.exists()) {
                const userData = docSnap.data();

                setLiveProfile((currentProfile: any) => {
                    const merged = {
                        ...currentProfile,
                        ...userData,
                        demographics: currentProfile.demographics || userData.demographics || {},
                        nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
                        uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
                        documentHistory: currentProfile.documentHistory || userData.documentHistory || [],
                        addressHistory: currentProfile.addressHistory || userData.addressHistory || []
                    };
                    return merged;
                });
            }
        });

        return () => unsubscribe();
    }, [targetId]);

    // HYDRATE UI FROM LIVE PROFILE
    useEffect(() => {
        if (!isEditing && liveProfile) {
            const d = liveProfile.demographics || {};

            const sameAsRes = liveProfile.sameAsResidential !== undefined
                ? liveProfile.sameAsResidential
                : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

            const initialLoadData = {
                fullName: liveProfile.fullName || '',
                email: liveProfile.email || '',
                phone: liveProfile.phone || d.learnerPhoneNumber || '',
                idNumber: liveProfile.idNumber || '',
                sameAsResidential: sameAsRes,

                learnerTitle: d.learnerTitle || '',
                learnerMiddleName: d.learnerMiddleName || '',
                nationalityCode: d.nationalityCode || '',
                immigrantStatus: d.immigrantStatus || '03',
                alternativeIdType: d.alternativeIdType || '533',

                streetAddress: d.learnerHomeAddress1 || '',
                city: d.learnerHomeAddress2 || '',
                provinceCode: d.provinceCode || '',
                postalCode: d.learnerHomeAddressPostalCode || '',
                postalAddress: d.learnerPostalAddress1 || '',
                customPostalCode: d.learnerPostalAddressPostCode || '',
                statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
                lat: d.lat || 0,
                lng: d.lng || 0,

                flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
                equityCode: d.equityCode || '',
                genderCode: d.genderCode || '',
                homeLanguageCode: d.homeLanguageCode || '',
                citizenStatusCode: d.citizenResidentStatusCode || '',
                socioeconomicCode: d.socioeconomicStatusCode || '',
                disabilityCode: d.disabilityStatusCode || 'N',
                disabilityRating: d.disabilityRating || '',

                nokName: liveProfile.nextOfKin?.name || '',
                nokRelationship: liveProfile.nextOfKin?.relationship || '',
                nokPhone: liveProfile.nextOfKin?.phone || '',
                profilePhotoUrl: liveProfile.profilePhotoUrl || ''
            };

            setFormData(initialLoadData);
            setPhotoPreview(liveProfile.profilePhotoUrl || null);

            const legacyDocs = liveProfile.documents || {};
            const rawUploadedDocs = liveProfile.uploadedDocuments;
            const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

            const currentDocs: DynamicDocument[] = [
                { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
                { id: 'poa', name: 'Proof of Address (Utility/Bank/Affidavit)', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'poa')?.url || legacyDocs.poaUrl || '', isFixed: true, isRequired: true },
                { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
                { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
            ];

            uploadedDocsArray.forEach((savedDoc: any) => {
                if (!['id', 'poa', 'qual', 'cv'].includes(savedDoc.id)) {
                    currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
                }
            });

            setDocsList(currentDocs);
        }
    }, [liveProfile, isEditing]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    // DERIVED STATS-SA / MUNICIPALITY MATCH
    const currentStatssaCode = isEditing ? formData.statssaAreaCode : (liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode);

    const selectedStatssaMatch = useMemo(() => {
        if (!currentStatssaCode || allStatssaCodes.length === 0) return null;
        return allStatssaCodes.find(c => String(c.statssa_area_code).trim() === String(currentStatssaCode).trim());
    }, [allStatssaCodes, currentStatssaCode]);

    // MULTI-TIERED GOOGLE PLACES ADDRESS PARSER
    const handleAddressSelected = (place: any) => {
        const components = place.address_components;
        if (!components) return;

        const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
        const rawProv = getComp("administrative_area_level_1");
        const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

        const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
        const townName = getComp("locality") || suburb;
        const localMuni = getComp("administrative_area_level_3");
        const districtMuni = getComp("administrative_area_level_2");
        const postal = getComp("postal_code");

        const buildingName = place.name || "";
        const formatted = place.formatted_address || "";
        const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

        const searchTerms = [suburb, townName, localMuni, districtMuni]
            .map(s => s.toLowerCase().trim())
            .filter(Boolean);

        let match = null;

        if (allStatssaCodes.length > 0 && searchTerms.length > 0) {
            match = allStatssaCodes.find(c => {
                const cTown = (c.town || '').toLowerCase();
                const cArea = (c.area || '').toLowerCase();
                const cMuni = (c.local_municipality || '').toLowerCase();

                return searchTerms.some(term =>
                    term && (cTown === term || cArea === term || cMuni === term)
                );
            });

            if (!match) {
                match = allStatssaCodes.find(c => {
                    const cTown = (c.town || '').toLowerCase();
                    const cArea = (c.area || '').toLowerCase();
                    const cMuni = (c.local_municipality || '').toLowerCase();

                    return searchTerms.some(term =>
                        term && (cTown.includes(term) || term.includes(cTown) || cArea.includes(term) || cMuni.includes(term))
                    );
                });
            }
        }

        let extractedLat = 0;
        let extractedLng = 0;

        if (place.geometry && place.geometry.location) {
            extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
        }

        setFormData((prev: any) => ({
            ...prev,
            streetAddress: streetLine,
            city: townName,
            provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
            postalCode: postal,
            statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
            lat: extractedLat,
            lng: extractedLng
        }));
    };

    // 🚀 MAP MODAL CONTROLS
    const openMapModal = () => {
        const initialLat = formData.lat && formData.lat !== 0 ? formData.lat : -26.2041;
        const initialLng = formData.lng && formData.lng !== 0 ? formData.lng : 28.0473;
        setTempCoords({ lat: initialLat, lng: initialLng });
        setMapSearchText(formData.streetAddress || "");
        setIsMapModalOpen(true);
    };

    const handleModalAddressSelected = (place: any) => {
        if (place.geometry && place.geometry.location) {
            const newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            const newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
            setTempCoords({ lat: newLat, lng: newLng });
            handleAddressSelected(place); // Reuse existing address handler
        }
    };

    const confirmMapCoordinates = () => {
        setFormData((prev: any) => ({
            ...prev,
            lat: tempCoords.lat,
            lng: tempCoords.lng
        }));
        toast.success(`Exact coordinates pinned: ${tempCoords.lat.toFixed(6)}, ${tempCoords.lng.toFixed(6)}`);
        setIsMapModalOpen(false);
    };

    const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
    const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
    const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

    // Prevent default form behavior if button is clicked
    const handleSaveClick = (e?: React.MouseEvent) => {
        if (e) e.preventDefault();

        const missingRequired = docsList.filter(d => d.isRequired && !d.file && !d.url);
        if (missingRequired.length > 0) {
            toast.warning(`Please upload all required documents: ${missingRequired.map(d => d.name).join(', ')}`);
            return;
        }

        const isOverwriting = docsList.some(d => d.file && d.url);

        if (isOverwriting) {
            setConfirmDocOverwrite(true);
        } else {
            executeSave();
        }
    };

    const executeSave = async () => {
        if (!targetId) return;

        setSaving(true);

        try {
            let finalPhotoUrl = formData.profilePhotoUrl;
            if (profilePhoto) {
                const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
                const snapshot = await uploadBytes(storageRef, profilePhoto);
                finalPhotoUrl = await getDownloadURL(snapshot.ref);
            }

            const finalUploadedDocs = [];
            const newHistory = [...(liveProfile.documentHistory || [])];

            for (const docItem of docsList) {
                let finalUrl = docItem.url;

                if (docItem.file) {
                    if (docItem.url) {
                        newHistory.push({
                            id: docItem.id,
                            name: docItem.name || 'Legacy Document',
                            url: docItem.url,
                            replacedAt: new Date().toISOString()
                        });
                    }

                    const ext = docItem.file.name.split('.').pop();
                    const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
                    const snapshot = await uploadBytes(storageRef, docItem.file);
                    finalUrl = await getDownloadURL(snapshot.ref);
                }

                if (finalUrl) {
                    finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
                }
            }

            // ADDRESS HISTORY AUDIT TRAIL LOGGING
            const oldStreet = liveProfile?.demographics?.learnerHomeAddress1 || '';
            const newStreet = formData.streetAddress || '';
            const newAddressHistory = [...(liveProfile?.addressHistory || [])];

            if (oldStreet && oldStreet.trim() !== newStreet.trim()) {
                newAddressHistory.push({
                    streetAddress: oldStreet,
                    city: formData.city || liveProfile?.demographics?.learnerHomeAddress2 || '',
                    provinceCode: formData.provinceCode || liveProfile?.demographics?.provinceCode || '',
                    postalCode: formData.postalCode || liveProfile?.demographics?.learnerHomeAddressPostalCode || '',
                    statssaAreaCode: formData.statssaAreaCode || liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode || '',
                    lat: formData.lat || liveProfile?.demographics?.lat || 0,
                    lng: formData.lng || liveProfile?.demographics?.lng || 0,
                    replacedAt: new Date().toISOString()
                });
            }

            // 🚀 RESOLVE STATS-SA RECORD & PROVINCE NAME FOR EXPLICIT DATABASE PERSISTENCE
            const statssaMatch = allStatssaCodes.find(
                c => String(c.statssa_area_code).trim() === String(formData.statssaAreaCode).trim()
            );
            const provinceMatch = QCTO_PROVINCES.find(p => p.value === formData.provinceCode);

            const updatedData = {
                fullName: formData.fullName || liveProfile.fullName,
                email: formData.email || liveProfile.email,
                phone: formData.phone || liveProfile.phone,
                profilePhotoUrl: finalPhotoUrl,
                uploadedDocuments: finalUploadedDocs,
                documentHistory: newHistory,
                addressHistory: newAddressHistory,
                demographics: {
                    ...(liveProfile.demographics || {}),
                    learnerPhoneNumber: formData.phone || liveProfile.phone,
                    learnerTitle: formData.learnerTitle,
                    learnerMiddleName: formData.learnerMiddleName,
                    alternativeIdType: formData.alternativeIdType,
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    provinceCode: formData.provinceCode,
                    provinceName: provinceMatch ? provinceMatch.label : '',
                    learnerHomeAddressPostalCode: formData.postalCode,
                    learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
                    learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
                    equityCode: formData.equityCode,
                    genderCode: formData.genderCode,
                    homeLanguageCode: formData.homeLanguageCode,
                    citizenResidentStatusCode: formData.citizenStatusCode,
                    nationalityCode: formData.nationalityCode,
                    immigrantStatus: formData.immigrantStatus,
                    flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
                    socioeconomicStatusCode: formData.socioeconomicCode,
                    disabilityStatusCode: formData.disabilityCode,
                    disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,

                    // 🚀 STATS-SA CODE + EXPLICIT HUMAN-READABLE MUNICIPAL NAMES PERSISTED
                    statssaAreaCode: formData.statssaAreaCode,
                    statsaaAreaCode: formData.statssaAreaCode,
                    localMunicipality: statssaMatch?.local_municipality || statssaMatch?.area || '',
                    districtOrMetro: statssaMatch?.district_municipality || statssaMatch?.district || '',

                    lat: formData.lat,
                    lng: formData.lng
                },
                nextOfKin: {
                    name: formData.nokName,
                    relationship: formData.nokRelationship,
                    phone: formData.nokPhone
                },
                sameAsResidential: formData.sameAsResidential,
                updatedAt: new Date().toISOString()
            };

            await onUpdate(profile.id || targetId, updatedData);

            setIsEditing(false);
            setProfilePhoto(null);

            setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
        } catch (error) {
            console.error('❌ Update failed', error);
            setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
    const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

    const handleCancel = () => {
        setProfilePhoto(null);
        setPhotoPreview(liveProfile?.profilePhotoUrl || null);
        setIsEditing(false);
    };

    const renderDocumentVault = () => {
        return (
            <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {isEditing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                        <div style={{ padding: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e40af', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Info size={16} color="#2563eb" style={{ flexShrink: 0 }} />
                            <span><strong>Address Matching Note:</strong> Proof of Address must explicitly display your name and physical residential address as entered.</span>
                        </div>

                        {docsList.map((docItem) => (
                            <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <DynamicDocUpload
                                    document={docItem}
                                    onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
                                    onRemove={() => handleRemoveDocument(docItem.id)}
                                />
                                {docItem.url && !docItem.file && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            <FileText size={14} color="var(--mlab-blue)" />
                                            <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
                                        </span>
                                        <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                                            <Eye size={14} /> View File
                                        </a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
                        {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
                    </>
                )}

                {/* Document History Log Renderer */}
                {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
                    <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <History size={14} /> Document History Log
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
                                <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
                                        <FileText size={14} /> {hDoc.name || 'Archived Document'}
                                    </a>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const displayData = isEditing ? formData : liveProfile;
    const isVerified = liveProfile?.profileCompleted === true;
    const isPostalSame = displayData?.sameAsResidential !== false;
    const d = isEditing ? formData : (liveProfile?.demographics || {});

    return (
        <div className="lpv-wrapper animate-fade-in">
            {modalConfig.isOpen && createPortal(
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                />,
                document.body
            )}

            {confirmDocOverwrite && createPortal(
                <StatusModal
                    type="warning"
                    title="Overwrite Existing Documents?"
                    message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
                    confirmText="Yes, Overwrite"
                    onClose={() => {
                        setConfirmDocOverwrite(false);
                        executeSave();
                    }}
                    onCancel={() => setConfirmDocOverwrite(false)}
                />,
                document.body
            )}

            {/* 🚀 GOOGLE MAP MODAL OVERLAY */}
            {isMapModalOpen && createPortal(
                <div className="lfm-overlay" onClick={() => setIsMapModalOpen(false)} style={{ zIndex: 99999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title">
                                <MapPin size={16} /> Pinpoint Exact Residence Entrance
                            </h2>
                            <button type="button" className="lfm-close-btn" onClick={() => setIsMapModalOpen(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className="lfm-body">
                            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.4 }}>
                                Search for an area below, then click on the map or drag the red marker directly onto your exact building entrance for QCTO verification.
                            </p>
                            <div style={{ position: 'relative', marginBottom: '8px', marginTop: '8px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', zIndex: 10 }} />
                                {isGoogleReady ? (
                                    <Autocomplete
                                        key={`modal-search-learner-view`}
                                        onPlaceSelected={handleModalAddressSelected}
                                        options={{ types: [], componentRestrictions: { country: "za" } }}
                                        className="lfm-input"
                                        defaultValue={mapSearchText}
                                        placeholder="Search building, suburb or street..."
                                        style={{ paddingLeft: '38px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}
                                    />
                                ) : (
                                    <input
                                        type="text"
                                        className="lfm-input"
                                        defaultValue={mapSearchText}
                                        placeholder="Search building, suburb or street..."
                                        style={{ paddingLeft: '38px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}
                                    />
                                )}
                            </div>
                            <div style={{ width: '100%', height: '380px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--mlab-border)', position: 'relative' }}>
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
                                        <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
                                        <span style={{ marginLeft: '8px', color: '#64748b' }}>Loading Google Map...</span>
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#64748b', fontFamily: 'monospace', background: 'var(--mlab-bg)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--mlab-border)', width: 'max-content', marginTop: '6px' }}>
                                Lat: {tempCoords.lat.toFixed(6)}, Lng: {tempCoords.lng.toFixed(6)}
                            </div>
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsMapModalOpen(false)}>Cancel</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={confirmMapCoordinates}><Save size={13} /> Save Pin Location</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* 🚀 MANUAL ADDRESS FALLBACK MODAL OVERLAY */}
            {isManualAddressModalOpen && createPortal(
                <div className="lfm-overlay" onClick={() => setIsManualAddressModalOpen(false)} style={{ zIndex: 99999 }}>
                    <div className="lfm-modal animate-fade-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="lfm-header">
                            <h2 className="lfm-header__title"><MapPin size={16} /> Enter Address Manually</h2>
                            <button type="button" className="lfm-close-btn" onClick={() => setIsManualAddressModalOpen(false)}><X size={20} /></button>
                        </div>
                        <div className="lfm-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.5rem' }}>
                            <div style={{ background: '#fffbeb', color: '#b45309', padding: '10px', borderRadius: '6px', border: '1px solid #fde68a', fontSize: '0.85rem' }}>
                                <strong>Note:</strong> We highly recommend using the Google Search first to automatically pinpoint your coordinates. Only use this manual override if your address does not exist on Google Maps.
                            </div>
                            <EditField label="Street Address & Complex" value={formData.streetAddress} isEditing={true} onChange={(v) => update('streetAddress', v)} />
                            <EditField label="Suburb / City" value={formData.city} isEditing={true} onChange={(v) => update('city', v)} />
                            <FormSelectWrapper label="Province" value={formData.provinceCode} isEditing={true} options={QCTO_PROVINCES} onChange={(v) => update('provinceCode', v)} isSearchable={false} />
                            <EditField label="Postal Code" value={formData.postalCode} isEditing={true} onChange={(v) => update('postalCode', v)} />
                        </div>
                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsManualAddressModalOpen(false)}>Cancel</button>
                            <button type="button" className="lfm-btn lfm-btn--primary" onClick={() => setIsManualAddressModalOpen(false)}><Save size={13} /> Confirm Manual Entry</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {showSignatureModal && createPortal(
                <SignatureSetupModal
                    userUid={targetId}
                    existingSignatureUrl={liveProfile?.signatureUrl}
                    onComplete={() => {
                        setShowSignatureModal(false);
                    }}
                />,
                document.body
            )}

            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck size={22} className="lpv-banner__icon" />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
                        {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
                    </div>
                    <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
                </div>
            </div>

            <div className="lpv-layout">
                <div className="lpv-main-stack">

                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
                            <button type="button" className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
                                {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        <div className="lpv-profile-header">
                            <div className="lpv-avatar-wrapper">
                                <div className="lpv-avatar">
                                    {photoPreview ? (
                                        <img
                                            src={photoPreview}
                                            crossOrigin="anonymous"
                                            alt="Profile"
                                            style={{
                                                objectFit: "cover",
                                                width: "100%",
                                                height: "100%"
                                            }}
                                        />
                                    ) : (
                                        <User size={30} color="#94a3b8" />
                                    )}
                                </div>

                                {isEditing && (
                                    <label className="lpv-avatar-upload">
                                        <Camera size={16} />
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePhotoSelect}
                                            hidden
                                        />
                                    </label>
                                )}
                            </div>

                            <div>
                                <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
                                <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

                            <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
                            <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

                            <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
                            <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
                            <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
                            <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
                        </div>
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title"><Briefcase size={16} /> Background Details</h3>
                        <div className="lpv-grid-2">
                            <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

                            <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
                            <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
                            {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
                                <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
                            )}
                        </div>
                    </section>

                    {/* ════════════════════════════════════════════════════════════════════════════ */}
                    {/* RESIDENTIAL ADDRESS & MUNICIPALITY PANEL (EXPLICIT DISPLAY)                  */}
                    {/* ════════════════════════════════════════════════════════════════════════════ */}
                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                            <MapPin size={16} /> Residential Address & Municipal Metadata
                        </h3>

                        {isEditing && (
                            <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label className="lpv-field__label" style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: 0, color: 'var(--mlab-blue)' }}>
                                        <Globe size={13} /> Address Search (Google Verified)
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
                                    onPlaceSelected={handleAddressSelected}
                                    options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
                                    className="lpv-input"
                                    defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
                                    placeholder="Start typing your street name..."
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsManualAddressModalOpen(true)}
                                    style={{
                                        background: 'none', border: 'none', color: 'var(--mlab-blue)',
                                        textDecoration: 'underline', fontSize: '0.75rem', cursor: 'pointer',
                                        marginTop: '10px', padding: 0, fontWeight: 600
                                    }}
                                >
                                    Can't find your address on Google Maps? Enter it manually here.
                                </button>
                            </div>
                        )}

                        <div className="lpv-grid-3">
                            <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                            <EditField label="City / Suburb" value={displayData.city || d.learnerHomeAddress2} isEditing={isEditing} onChange={(v: string) => update('city', v)} />
                            <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
                            <EditField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} isEditing={isEditing} onChange={(v: string) => update('postalCode', v)} />

                            {/* EXPLICIT LOCAL MUNICIPALITY & DISTRICT DERIVED READOUTS */}
                            <ROField
                                label="Local Municipality"
                                value={d.localMunicipality || selectedStatssaMatch?.local_municipality || (selectedStatssaMatch?.area ? `${selectedStatssaMatch.area} Muni` : 'Auto-derived on selection')}
                                icon={<Building2 size={13} color="var(--mlab-blue)" />}
                            />
                            <ROField
                                label="District / Metro"
                                value={d.districtOrMetro || selectedStatssaMatch?.district_municipality || selectedStatssaMatch?.district || (selectedStatssaMatch?.town ? `${selectedStatssaMatch.town} Metro` : 'Auto-derived on selection')}
                                icon={<Building2 size={13} color="var(--mlab-blue)" />}
                            />
                        </div>

                        {/* STATS-SA AREA CODE SELECTOR / DISPLAY */}
                        <div style={{ marginTop: '1rem' }}>
                            <FormSelectWrapper
                                label="STATS-SA Area Code & Municipality"
                                value={d.statssaAreaCode || d.statsaaAreaCode}
                                isEditing={isEditing}
                                options={statssaOptions}
                                onChange={(v: string) => update('statssaAreaCode', v)}
                            />
                        </div>

                        {/* NOTICE BANNER FOR PROOF OF ADDRESS MATCHING */}
                        <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', color: '#713f12', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Info size={16} color="#ca8a04" style={{ flexShrink: 0 }} />
                            <span><strong>Proof of Address Requirement:</strong> Ensure your uploaded Proof of Address document in the Document Vault explicitly matches the residential address listed here.</span>
                        </div>

                        {isEditing ? (
                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
                                    <input
                                        type="checkbox"
                                        checked={displayData.sameAsResidential}
                                        onChange={e => update('sameAsResidential', e.target.checked)}
                                    />
                                    Postal Address is the same as Residential
                                </label>
                                {!displayData.sameAsResidential && (
                                    <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
                                        <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
                                        <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
                                <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
                                    Postal Address
                                    {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
                                </h4>
                                <div className="lpv-grid-2">
                                    <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
                                    <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
                                </div>
                            </>
                        )}

                        {/* Address History Log Renderer */}
                        {liveProfile?.addressHistory && liveProfile.addressHistory.length > 0 && !isEditing && (
                            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                                <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <History size={14} /> Address History Log
                                </h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {liveProfile.addressHistory.map((hAddr: any, idx: number) => (
                                        <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>{hAddr.streetAddress}</div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hAddr.city} • Code: {hAddr.statssaAreaCode || 'N/A'}</div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hAddr.replacedAt).toLocaleDateString()}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hAddr.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
                        <div className="lpv-grid-3">
                            <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
                            <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
                            <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
                        </div>
                    </section>

                    {/* SIGNATURE SECTION */}
                    <section className="lpv-panel">
                        <div className="lpv-panel__header">
                            <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
                            <button
                                type="button"
                                className="lpv-edit-btn"
                                onClick={() => setShowSignatureModal(true)}
                            >
                                <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
                            </button>
                        </div>
                        <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
                            {liveProfile?.signatureUrl ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <img
                                        src={liveProfile.signatureUrl}
                                        alt="Learner Signature"
                                        crossOrigin="anonymous"
                                        style={{
                                            height: 'auto',
                                            maxHeight: '120px',
                                            width: '100%',
                                            maxWidth: '400px',
                                            objectFit: 'contain',
                                            mixBlendMode: 'multiply',
                                            filter: 'grayscale(100%) contrast(400%)'
                                        }}
                                    />
                                    <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
                                        Authenticated Learner Signature (Black Ink)
                                    </span>
                                </div>
                            ) : (
                                <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <AlertCircle size={16} /> The learner has not registered their digital signature yet.
                                </div>
                            )}
                        </div>
                        <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
                            Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
                        </p>
                    </section>
                </div>

                <aside className="lpv-aside">
                    <div className="lpv-qual-card">
                        <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
                        <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
                        <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
                    </div>

                    <div className="lpv-vault-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
                            {isEditing && (
                                <button type="button" className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
                                    <Plus size={12} /> Add
                                </button>
                            )}
                        </div>
                        {renderDocumentVault()}
                    </div>

                    {isEditing && (
                        <button type="button" className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
                            {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
                        </button>
                    )}
                </aside>
            </div>
        </div>
    );
};

/* --- Field Components --- */

const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
    <div className="lpv-field">
        <div className="lpv-field__label">{icon}{label}</div>
        <div className="lpv-field__value">{value || '—'}</div>
    </div>
);

interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
    const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
    return (
        <div className="lpv-field">
            <div className="lpv-field__label">{icon}{label}</div>
            {isEditing ? (
                type === 'select' ? (
                    <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
                        <option value="">Select...</option>
                        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                ) : (
                    <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
                )
            ) : (
                <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
            )}
        </div>
    );
};

interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
    const displayValue = options.find(o => o.value === value)?.label || value;
    return (
        <div className="lpv-field">
            {isEditing ? (
                <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
            ) : (
                <>
                    <div className="lpv-field__label">{label}</div>
                    <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
                </>
            )}
        </div>
    );
};

const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
    <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
        <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
        {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
    </a>
);

export default LearnerProfileView;



// // src/components/views/LearnerProfileView/LearnerProfileView.tsx

// import React, { useState, useEffect, useMemo } from 'react';
// import { createPortal } from 'react-dom';
// import {
//     User, Phone, MapPin, ShieldCheck,
//     FileText, Edit3, Save, X, Fingerprint,
//     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye, Globe, Building2, Search
// } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { doc, onSnapshot } from 'firebase/firestore';
// import Autocomplete from "react-google-autocomplete";
// import { GoogleMap, Marker } from '@react-google-maps/api';
// import './LearnerProfileView.css';
// import { storage, db } from '../../../../lib/firebase';
// import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// import { useToast } from '../../../../components/common/Toast/Toast';

// import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// import { fetchStatssaCodes } from '../../../../services/qctoService';
// import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// /* ── STRICT QCTO DICTIONARIES ────────────────────────── */
// const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
// const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
// const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
// const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
// const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
// const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
// const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
// const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
// const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
// const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

// const extractFilename = (url: string) => {
//     if (!url) return 'Saved Document';
//     try {
//         const decoded = decodeURIComponent(url.split('?')[0]);
//         const parts = decoded.split('/');
//         return parts[parts.length - 1];
//     } catch {
//         return 'Saved Document';
//     }
// };

// interface ProfileProps {
//     profile: any;
//     user: any;
//     onUpdate: (id: string, updates: any) => Promise<void>;
// }

// export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
//     const toast = useToast();
//     const [isEditing, setIsEditing] = useState(false);
//     const [saving, setSaving] = useState(false);
//     const [showSignatureModal, setShowSignatureModal] = useState(false);
//     const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

//     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
//     const [formData, setFormData] = useState<any>({});

//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
//     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
//     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

//     // 🚀 MAP MODAL OVERLAY STATE
//     const [isMapModalOpen, setIsMapModalOpen] = useState(false);
//     const [tempCoords, setTempCoords] = useState({ lat: -26.2041, lng: 28.0473 });
//     const [mapSearchText, setMapSearchText] = useState("");
//     const [isGoogleReady, setIsGoogleReady] = useState(() => typeof window !== 'undefined' && Boolean((window as any).google?.maps?.places));

//     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

//     useEffect(() => {
//         if (isGoogleReady) return;
//         const checkGoogleInterval = setInterval(() => {
//             if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
//                 setIsGoogleReady(true);
//                 clearInterval(checkGoogleInterval);
//             }
//         }, 300);
//         return () => clearInterval(checkGoogleInterval);
//     }, [isGoogleReady]);

//     useEffect(() => {
//         const loadCodes = async () => {
//             const codes = await fetchStatssaCodes();
//             setAllStatssaCodes(codes);
//         };
//         loadCodes();
//     }, []);

//     const statssaOptions = useMemo(() => {
//         return allStatssaCodes.map(c => ({
//             value: c.statssa_area_code,
//             label: `${c.statssa_area_code} - ${c.town}`,
//             subLabel: `${c.area} (${c.local_municipality})`
//         }));
//     }, [allStatssaCodes]);

//     useEffect(() => {
//         if (profile) {
//             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
//         }
//     }, [profile]);

//     // REAL-TIME FIRESTORE LISTENER
//     useEffect(() => {
//         if (!targetId) return;

//         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
//             if (docSnap.exists()) {

//                 // console.log("UID: ", docSnap.id, "Data: ", docSnap.data());

//                 const userData = docSnap.data();

//                 setLiveProfile((currentProfile: any) => {
//                     const merged = {
//                         ...currentProfile,
//                         ...userData,
//                         demographics: currentProfile.demographics || userData.demographics || {},
//                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
//                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
//                         documentHistory: currentProfile.documentHistory || userData.documentHistory || [],
//                         addressHistory: currentProfile.addressHistory || userData.addressHistory || []
//                     };
//                     return merged;
//                 });
//             }
//         });

//         return () => unsubscribe();
//     }, [targetId]);

//     // HYDRATE UI FROM LIVE PROFILE
//     useEffect(() => {
//         if (!isEditing && liveProfile) {
//             const d = liveProfile.demographics || {};

//             const sameAsRes = liveProfile.sameAsResidential !== undefined
//                 ? liveProfile.sameAsResidential
//                 : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

//             const initialLoadData = {
//                 fullName: liveProfile.fullName || '',
//                 email: liveProfile.email || '',
//                 phone: liveProfile.phone || d.learnerPhoneNumber || '',
//                 idNumber: liveProfile.idNumber || '',
//                 sameAsResidential: sameAsRes,

//                 learnerTitle: d.learnerTitle || '',
//                 learnerMiddleName: d.learnerMiddleName || '',
//                 nationalityCode: d.nationalityCode || '',
//                 immigrantStatus: d.immigrantStatus || '03',
//                 alternativeIdType: d.alternativeIdType || '533',

//                 streetAddress: d.learnerHomeAddress1 || '',
//                 city: d.learnerHomeAddress2 || '',
//                 provinceCode: d.provinceCode || '',
//                 postalCode: d.learnerHomeAddressPostalCode || '',
//                 postalAddress: d.learnerPostalAddress1 || '',
//                 customPostalCode: d.learnerPostalAddressPostCode || '',
//                 statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
//                 lat: d.lat || 0,
//                 lng: d.lng || 0,

//                 flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
//                 equityCode: d.equityCode || '',
//                 genderCode: d.genderCode || '',
//                 homeLanguageCode: d.homeLanguageCode || '',
//                 citizenStatusCode: d.citizenResidentStatusCode || '',
//                 socioeconomicCode: d.socioeconomicStatusCode || '',
//                 disabilityCode: d.disabilityStatusCode || 'N',
//                 disabilityRating: d.disabilityRating || '',

//                 nokName: liveProfile.nextOfKin?.name || '',
//                 nokRelationship: liveProfile.nextOfKin?.relationship || '',
//                 nokPhone: liveProfile.nextOfKin?.phone || '',
//                 profilePhotoUrl: liveProfile.profilePhotoUrl || ''
//             };

//             setFormData(initialLoadData);
//             setPhotoPreview(liveProfile.profilePhotoUrl || null);

//             const legacyDocs = liveProfile.documents || {};
//             const rawUploadedDocs = liveProfile.uploadedDocuments;
//             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

//             const currentDocs: DynamicDocument[] = [
//                 { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
//                 { id: 'poa', name: 'Proof of Address (Utility/Bank/Affidavit)', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'poa')?.url || legacyDocs.poaUrl || '', isFixed: true, isRequired: true },
//                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
//                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
//             ];

//             uploadedDocsArray.forEach((savedDoc: any) => {
//                 if (!['id', 'poa', 'qual', 'cv'].includes(savedDoc.id)) {
//                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
//                 }
//             });

//             setDocsList(currentDocs);
//         }
//     }, [liveProfile, isEditing]);

//     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
//         if (e.target.files && e.target.files[0]) {
//             const file = e.target.files[0];
//             setProfilePhoto(file);
//             setPhotoPreview(URL.createObjectURL(file));
//         }
//     };

//     // DERIVED STATS-SA / MUNICIPALITY MATCH
//     const currentStatssaCode = isEditing ? formData.statssaAreaCode : (liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode);

//     const selectedStatssaMatch = useMemo(() => {
//         if (!currentStatssaCode || allStatssaCodes.length === 0) return null;
//         return allStatssaCodes.find(c => String(c.statssa_area_code).trim() === String(currentStatssaCode).trim());
//     }, [allStatssaCodes, currentStatssaCode]);

//     // MULTI-TIERED GOOGLE PLACES ADDRESS PARSER
//     const handleAddressSelected = (place: any) => {
//         const components = place.address_components;
//         if (!components) return;

//         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
//         const rawProv = getComp("administrative_area_level_1");
//         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

//         const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
//         const townName = getComp("locality") || suburb;
//         const localMuni = getComp("administrative_area_level_3");
//         const districtMuni = getComp("administrative_area_level_2");
//         const postal = getComp("postal_code");

//         const buildingName = place.name || "";
//         const formatted = place.formatted_address || "";
//         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

//         const searchTerms = [suburb, townName, localMuni, districtMuni]
//             .map(s => s.toLowerCase().trim())
//             .filter(Boolean);

//         let match = null;

//         if (allStatssaCodes.length > 0 && searchTerms.length > 0) {
//             match = allStatssaCodes.find(c => {
//                 const cTown = (c.town || '').toLowerCase();
//                 const cArea = (c.area || '').toLowerCase();
//                 const cMuni = (c.local_municipality || '').toLowerCase();

//                 return searchTerms.some(term =>
//                     term && (cTown === term || cArea === term || cMuni === term)
//                 );
//             });

//             if (!match) {
//                 match = allStatssaCodes.find(c => {
//                     const cTown = (c.town || '').toLowerCase();
//                     const cArea = (c.area || '').toLowerCase();
//                     const cMuni = (c.local_municipality || '').toLowerCase();

//                     return searchTerms.some(term =>
//                         term && (cTown.includes(term) || term.includes(cTown) || cArea.includes(term) || cMuni.includes(term))
//                     );
//                 });
//             }
//         }

//         let extractedLat = 0;
//         let extractedLng = 0;

//         if (place.geometry && place.geometry.location) {
//             extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
//             extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
//         }

//         setFormData((prev: any) => ({
//             ...prev,
//             streetAddress: streetLine,
//             city: townName,
//             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
//             postalCode: postal,
//             statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
//             lat: extractedLat,
//             lng: extractedLng
//         }));
//     };

//     // 🚀 MAP MODAL CONTROLS
//     const openMapModal = () => {
//         const initialLat = formData.lat && formData.lat !== 0 ? formData.lat : -26.2041;
//         const initialLng = formData.lng && formData.lng !== 0 ? formData.lng : 28.0473;
//         setTempCoords({ lat: initialLat, lng: initialLng });
//         setMapSearchText(formData.streetAddress || "");
//         setIsMapModalOpen(true);
//     };

//     const handleModalAddressSelected = (place: any) => {
//         if (place.geometry && place.geometry.location) {
//             const newLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
//             const newLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
//             setTempCoords({ lat: newLat, lng: newLng });
//             handleAddressSelected(place); // Reuse existing address handler
//         }
//     };

//     const confirmMapCoordinates = () => {
//         setFormData((prev: any) => ({
//             ...prev,
//             lat: tempCoords.lat,
//             lng: tempCoords.lng
//         }));
//         toast.success(`Exact coordinates pinned: ${tempCoords.lat.toFixed(6)}, ${tempCoords.lng.toFixed(6)}`);
//         setIsMapModalOpen(false);
//     };

//     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
//     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
//     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

//     const handleSaveClick = () => {
//         const missingRequired = docsList.filter(d => d.isRequired && !d.file && !d.url);
//         if (missingRequired.length > 0) {
//             toast.warning(`Please upload all required documents: ${missingRequired.map(d => d.name).join(', ')}`);
//             return;
//         }

//         const isOverwriting = docsList.some(d => d.file && d.url);

//         if (isOverwriting) {
//             setConfirmDocOverwrite(true);
//         } else {
//             executeSave();
//         }
//     };

//     const executeSave = async () => {
//         if (!targetId) return;

//         setSaving(true);

//         try {
//             let finalPhotoUrl = formData.profilePhotoUrl;
//             if (profilePhoto) {
//                 const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
//                 const snapshot = await uploadBytes(storageRef, profilePhoto);
//                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
//             }

//             const finalUploadedDocs = [];
//             const newHistory = [...(liveProfile.documentHistory || [])];

//             for (const docItem of docsList) {
//                 let finalUrl = docItem.url;

//                 if (docItem.file) {
//                     if (docItem.url) {
//                         newHistory.push({
//                             id: docItem.id,
//                             name: docItem.name || 'Legacy Document',
//                             url: docItem.url,
//                             replacedAt: new Date().toISOString()
//                         });
//                     }

//                     const ext = docItem.file.name.split('.').pop();
//                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
//                     const snapshot = await uploadBytes(storageRef, docItem.file);
//                     finalUrl = await getDownloadURL(snapshot.ref);
//                 }

//                 if (finalUrl) {
//                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
//                 }
//             }

//             // ADDRESS HISTORY AUDIT TRAIL LOGGING
//             const oldStreet = liveProfile?.demographics?.learnerHomeAddress1 || '';
//             const newStreet = formData.streetAddress || '';
//             const newAddressHistory = [...(liveProfile?.addressHistory || [])];

//             if (oldStreet && oldStreet.trim() !== newStreet.trim()) {
//                 newAddressHistory.push({
//                     streetAddress: oldStreet,
//                     city: liveProfile?.demographics?.learnerHomeAddress2 || '',
//                     provinceCode: liveProfile?.demographics?.provinceCode || '',
//                     postalCode: liveProfile?.demographics?.learnerHomeAddressPostalCode || '',
//                     statssaAreaCode: liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode || '',
//                     lat: liveProfile?.demographics?.lat || 0,
//                     lng: liveProfile?.demographics?.lng || 0,
//                     replacedAt: new Date().toISOString()
//                 });
//             }

//             // 🚀 RESOLVE STATS-SA RECORD & PROVINCE NAME FOR EXPLICIT DATABASE PERSISTENCE
//             const statssaMatch = allStatssaCodes.find(
//                 c => String(c.statssa_area_code).trim() === String(formData.statssaAreaCode).trim()
//             );
//             const provinceMatch = QCTO_PROVINCES.find(p => p.value === formData.provinceCode);

//             const updatedData = {
//                 fullName: formData.fullName,
//                 email: formData.email,
//                 phone: formData.phone,
//                 profilePhotoUrl: finalPhotoUrl,
//                 uploadedDocuments: finalUploadedDocs,
//                 documentHistory: newHistory,
//                 addressHistory: newAddressHistory,
//                 demographics: {
//                     ...(liveProfile.demographics || {}),
//                     learnerPhoneNumber: formData.phone,
//                     learnerTitle: formData.learnerTitle,
//                     learnerMiddleName: formData.learnerMiddleName,
//                     alternativeIdType: formData.alternativeIdType,
//                     learnerHomeAddress1: formData.streetAddress,
//                     learnerHomeAddress2: formData.city,
//                     provinceCode: formData.provinceCode,
//                     provinceName: provinceMatch ? provinceMatch.label : '',
//                     learnerHomeAddressPostalCode: formData.postalCode,
//                     learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
//                     learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
//                     equityCode: formData.equityCode,
//                     genderCode: formData.genderCode,
//                     homeLanguageCode: formData.homeLanguageCode,
//                     citizenResidentStatusCode: formData.citizenStatusCode,
//                     nationalityCode: formData.nationalityCode,
//                     immigrantStatus: formData.immigrantStatus,
//                     flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
//                     socioeconomicStatusCode: formData.socioeconomicCode,
//                     disabilityStatusCode: formData.disabilityCode,
//                     disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,

//                     // 🚀 STATS-SA CODE + EXPLICIT HUMAN-READABLE MUNICIPAL NAMES PERSISTED
//                     statssaAreaCode: formData.statssaAreaCode,
//                     statsaaAreaCode: formData.statssaAreaCode,
//                     localMunicipality: statssaMatch?.local_municipality || statssaMatch?.area || '',
//                     districtOrMetro: statssaMatch?.district_municipality || statssaMatch?.district || '',

//                     lat: formData.lat,
//                     lng: formData.lng
//                 },
//                 nextOfKin: {
//                     name: formData.nokName,
//                     relationship: formData.nokRelationship,
//                     phone: formData.nokPhone
//                 },
//                 sameAsResidential: formData.sameAsResidential,
//                 updatedAt: new Date().toISOString()
//             };

//             await onUpdate(profile.id || targetId, updatedData);

//             setIsEditing(false);
//             setProfilePhoto(null);

//             setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
//         } catch (error) {
//             console.error('❌ Update failed', error);
//             setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
//     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

//     const handleCancel = () => {
//         setProfilePhoto(null);
//         setPhotoPreview(liveProfile?.profilePhotoUrl || null);
//         setIsEditing(false);
//     };

//     const renderDocumentVault = () => {
//         return (
//             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
//                 {isEditing ? (
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
//                         <div style={{ padding: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e40af', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <Info size={16} color="#2563eb" style={{ flexShrink: 0 }} />
//                             <span><strong>Address Matching Note:</strong> Proof of Address must explicitly display your name and physical residential address as entered.</span>
//                         </div>

//                         {docsList.map((docItem) => (
//                             <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
//                                 <DynamicDocUpload
//                                     document={docItem}
//                                     onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
//                                     onRemove={() => handleRemoveDocument(docItem.id)}
//                                 />
//                                 {docItem.url && !docItem.file && (
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
//                                         <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
//                                             <FileText size={14} color="var(--mlab-blue)" />
//                                             <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
//                                         </span>
//                                         <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
//                                             <Eye size={14} /> View File
//                                         </a>
//                                     </div>
//                                 )}
//                             </div>
//                         ))}
//                     </div>
//                 ) : (
//                     <>
//                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
//                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
//                     </>
//                 )}

//                 {/* Document History Log Renderer */}
//                 {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
//                     <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
//                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                             <History size={14} /> Document History Log
//                         </h4>
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                             {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
//                                 <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                     <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
//                                         <FileText size={14} /> {hDoc.name || 'Archived Document'}
//                                     </a>
//                                     <div style={{ textAlign: 'right' }}>
//                                         <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
//                                         <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
//                                     </div>
//                                 </div>
//                             ))}
//                         </div>
//                     </div>
//                 )}
//             </div>
//         );
//     };

//     const displayData = isEditing ? formData : liveProfile;
//     const isVerified = liveProfile?.profileCompleted === true;
//     const isPostalSame = displayData?.sameAsResidential !== false;
//     const d = isEditing ? formData : (liveProfile?.demographics || {});

//     return (
//         <div className="lpv-wrapper animate-fade-in">
//             {modalConfig.isOpen && createPortal(
//                 <StatusModal
//                     type={modalConfig.type}
//                     title={modalConfig.title}
//                     message={modalConfig.message}
//                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
//                 />,
//                 document.body
//             )}

//             {confirmDocOverwrite && createPortal(
//                 <StatusModal
//                     type="warning"
//                     title="Overwrite Existing Documents?"
//                     message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
//                     confirmText="Yes, Overwrite"
//                     onClose={() => {
//                         setConfirmDocOverwrite(false);
//                         executeSave();
//                     }}
//                     onCancel={() => setConfirmDocOverwrite(false)}
//                 />,
//                 document.body
//             )}

//             {/* 🚀 GOOGLE MAP MODAL OVERLAY */}
//             {isMapModalOpen && createPortal(
//                 <div className="lfm-overlay" onClick={() => setIsMapModalOpen(false)} style={{ zIndex: 99999 }}>
//                     <div className="lfm-modal animate-fade-in" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px' }}>
//                         <div className="lfm-header">
//                             <h2 className="lfm-header__title">
//                                 <MapPin size={16} /> Pinpoint Exact Residence Entrance
//                             </h2>
//                             <button className="lfm-close-btn" type="button" onClick={() => setIsMapModalOpen(false)}>
//                                 <X size={20} />
//                             </button>
//                         </div>
//                         <div className="lfm-body">
//                             <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.4 }}>
//                                 Search for an area below, then click on the map or drag the red marker directly onto your exact building entrance for QCTO verification.
//                             </p>
//                             <div style={{ position: 'relative', marginBottom: '8px', marginTop: '8px' }}>
//                                 <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--mlab-grey)', zIndex: 10 }} />
//                                 {isGoogleReady ? (
//                                     <Autocomplete
//                                         key={`modal-search-learner-view`}
//                                         onPlaceSelected={handleModalAddressSelected}
//                                         options={{ types: [], componentRestrictions: { country: "za" } }}
//                                         className="lfm-input"
//                                         defaultValue={mapSearchText}
//                                         placeholder="Search building, suburb or street..."
//                                         style={{ paddingLeft: '38px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}
//                                     />
//                                 ) : (
//                                     <input
//                                         type="text"
//                                         className="lfm-input"
//                                         defaultValue={mapSearchText}
//                                         placeholder="Search building, suburb or street..."
//                                         style={{ paddingLeft: '38px', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}
//                                     />
//                                 )}
//                             </div>
//                             <div style={{ width: '100%', height: '380px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--mlab-border)', position: 'relative' }}>
//                                 {isGoogleReady ? (
//                                     <GoogleMap
//                                         mapContainerStyle={{ width: '100%', height: '100%' }}
//                                         center={tempCoords}
//                                         zoom={17}
//                                         onClick={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
//                                         options={{ disableDefaultUI: false, zoomControl: true, streetViewControl: false, mapTypeControl: false }}
//                                     >
//                                         <Marker position={tempCoords} draggable={true} onDragEnd={(e) => e.latLng && setTempCoords({ lat: e.latLng.lat(), lng: e.latLng.lng() })} />
//                                     </GoogleMap>
//                                 ) : (
//                                     <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
//                                         <Loader2 className="spin" size={24} color="var(--mlab-blue)" />
//                                         <span style={{ marginLeft: '8px', color: '#64748b' }}>Loading Google Map...</span>
//                                     </div>
//                                 )}
//                             </div>
//                             <div style={{ fontSize: '0.82rem', color: '#64748b', fontFamily: 'monospace', background: 'var(--mlab-bg)', padding: '6px 12px', borderRadius: '4px', border: '1px solid var(--mlab-border)', width: 'max-content', marginTop: '6px' }}>
//                                 Lat: {tempCoords.lat.toFixed(6)}, Lng: {tempCoords.lng.toFixed(6)}
//                             </div>
//                         </div>
//                         <div className="lfm-footer">
//                             <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setIsMapModalOpen(false)}>Cancel</button>
//                             <button type="button" className="lfm-btn lfm-btn--primary" onClick={confirmMapCoordinates}><Save size={13} /> Save Pin Location</button>
//                         </div>
//                     </div>
//                 </div>,
//                 document.body
//             )}

//             {showSignatureModal && createPortal(
//                 <SignatureSetupModal
//                     userUid={targetId}
//                     existingSignatureUrl={liveProfile?.signatureUrl}
//                     onComplete={() => {
//                         setShowSignatureModal(false);
//                     }}
//                 />,
//                 document.body
//             )}

//             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
//                 <ShieldCheck size={22} className="lpv-banner__icon" />
//                 <div style={{ flex: 1 }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
//                         {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
//                     </div>
//                     <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
//                 </div>
//             </div>

//             <div className="lpv-layout">
//                 <div className="lpv-main-stack">

//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
//                             <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
//                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
//                             </button>
//                         </div>

//                         <div className="lpv-profile-header">
//                             <div className="lpv-avatar-wrapper">
//                                 <div className="lpv-avatar">
//                                     {photoPreview ? (
//                                         <img
//                                             src={photoPreview}
//                                             crossOrigin="anonymous"
//                                             alt="Profile"
//                                             style={{
//                                                 objectFit: "cover",
//                                                 width: "100%",
//                                                 height: "100%"
//                                             }}
//                                         />
//                                     ) : (
//                                         <User size={30} color="#94a3b8" />
//                                     )}
//                                 </div>

//                                 {isEditing && (
//                                     <label className="lpv-avatar-upload">
//                                         <Camera size={16} />
//                                         <input
//                                             type="file"
//                                             accept="image/*"
//                                             onChange={handlePhotoSelect}
//                                             hidden
//                                         />
//                                     </label>
//                                 )}
//                             </div>

//                             <div>
//                                 <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
//                                 <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
//                             </div>
//                         </div>

//                         <div className="lpv-grid-2">
//                             <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
//                             <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

//                             <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
//                             <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

//                             <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
//                             <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
//                             <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
//                             <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
//                             <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
//                             <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
//                             <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
//                         </div>
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title"><Briefcase size={16} /> Background Details</h3>
//                         <div className="lpv-grid-2">
//                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

//                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
//                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
//                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
//                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
//                             )}
//                         </div>
//                     </section>

//                     {/* ════════════════════════════════════════════════════════════════════════════ */}
//                     {/* RESIDENTIAL ADDRESS & MUNICIPALITY PANEL (EXPLICIT DISPLAY)                  */}
//                     {/* ════════════════════════════════════════════════════════════════════════════ */}
//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
//                             <MapPin size={16} /> Residential Address & Municipal Metadata
//                         </h3>

//                         {isEditing && (
//                             <div style={{ marginBottom: '1rem', padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
//                                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
//                                     <label className="lpv-field__label" style={{ display: 'flex', alignItems: 'center', gap: '4px', margin: 0, color: 'var(--mlab-blue)' }}>
//                                         <Globe size={13} /> Address Search (Google Verified)
//                                     </label>
//                                     <button
//                                         type="button"
//                                         onClick={openMapModal}
//                                         style={{
//                                             background: '#e0f2fe', color: '#0369a1', border: '1px solid #bae6fd',
//                                             padding: '4px 10px', borderRadius: '6px', fontSize: '0.78rem',
//                                             fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
//                                         }}
//                                     >
//                                         <MapPin size={13} /> Adjust Pin on Map
//                                     </button>
//                                 </div>
//                                 <Autocomplete
//                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                     onPlaceSelected={handleAddressSelected}
//                                     options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
//                                     className="lpv-input"
//                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
//                                     placeholder="Start typing your street name..."
//                                 />
//                             </div>
//                         )}

//                         <div className="lpv-grid-3">
//                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
//                             <ROField label="City / Suburb" value={displayData.city || d.learnerHomeAddress2} />
//                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
//                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />

//                             {/* EXPLICIT LOCAL MUNICIPALITY & DISTRICT DERIVED READOUTS */}
//                             <ROField
//                                 label="Local Municipality"
//                                 value={d.localMunicipality || selectedStatssaMatch?.local_municipality || (selectedStatssaMatch?.area ? `${selectedStatssaMatch.area} Muni` : 'Auto-derived on selection')}
//                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
//                             />
//                             <ROField
//                                 label="District / Metro"
//                                 value={d.districtOrMetro || selectedStatssaMatch?.district_municipality || selectedStatssaMatch?.district || (selectedStatssaMatch?.town ? `${selectedStatssaMatch.town} Metro` : 'Auto-derived on selection')}
//                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
//                             />
//                         </div>

//                         {/* STATS-SA AREA CODE SELECTOR / DISPLAY */}
//                         <div style={{ marginTop: '1rem' }}>
//                             <FormSelectWrapper
//                                 label="STATS-SA Area Code & Municipality"
//                                 value={d.statssaAreaCode || d.statsaaAreaCode}
//                                 isEditing={isEditing}
//                                 options={statssaOptions}
//                                 onChange={(v: string) => update('statssaAreaCode', v)}
//                             />
//                         </div>

//                         {/* NOTICE BANNER FOR PROOF OF ADDRESS MATCHING */}
//                         <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', color: '#713f12', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             <Info size={16} color="#ca8a04" style={{ flexShrink: 0 }} />
//                             <span><strong>Proof of Address Requirement:</strong> Ensure your uploaded Proof of Address document in the Document Vault explicitly matches the residential address listed here.</span>
//                         </div>

//                         {isEditing ? (
//                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
//                                     <input
//                                         type="checkbox"
//                                         checked={displayData.sameAsResidential}
//                                         onChange={e => update('sameAsResidential', e.target.checked)}
//                                     />
//                                     Postal Address is the same as Residential
//                                 </label>
//                                 {!displayData.sameAsResidential && (
//                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
//                                         <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
//                                         <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
//                                     </div>
//                                 )}
//                             </div>
//                         ) : (
//                             <>
//                                 <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
//                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
//                                     Postal Address
//                                     {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
//                                 </h4>
//                                 <div className="lpv-grid-2">
//                                     <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
//                                     <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
//                                 </div>
//                             </>
//                         )}

//                         {/* Address History Log Renderer */}
//                         {liveProfile?.addressHistory && liveProfile.addressHistory.length > 0 && !isEditing && (
//                             <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
//                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
//                                     <History size={14} /> Address History Log
//                                 </h4>
//                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
//                                     {liveProfile.addressHistory.map((hAddr: any, idx: number) => (
//                                         <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                                             <div>
//                                                 <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>{hAddr.streetAddress}</div>
//                                                 <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hAddr.city} • Code: {hAddr.statssaAreaCode || 'N/A'}</div>
//                                             </div>
//                                             <div style={{ textAlign: 'right' }}>
//                                                 <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hAddr.replacedAt).toLocaleDateString()}</div>
//                                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hAddr.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
//                                             </div>
//                                         </div>
//                                     ))}
//                                 </div>
//                             </div>
//                         )}
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
//                         <div className="lpv-grid-3">
//                             <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
//                             <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
//                             <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
//                         </div>
//                     </section>

//                     {/* SIGNATURE SECTION */}
//                     <section className="lpv-panel">
//                         <div className="lpv-panel__header">
//                             <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
//                             <button
//                                 className="lpv-edit-btn"
//                                 onClick={() => setShowSignatureModal(true)}
//                             >
//                                 <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
//                             </button>
//                         </div>
//                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
//                             {liveProfile?.signatureUrl ? (
//                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//                                     <img
//                                         src={liveProfile.signatureUrl}
//                                         alt="Learner Signature"
//                                         crossOrigin="anonymous"
//                                         style={{
//                                             height: 'auto',
//                                             maxHeight: '120px',
//                                             width: '100%',
//                                             maxWidth: '400px',
//                                             objectFit: 'contain',
//                                             mixBlendMode: 'multiply',
//                                             filter: 'grayscale(100%) contrast(400%)'
//                                         }}
//                                     />
//                                     <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
//                                         Authenticated Learner Signature (Black Ink)
//                                     </span>
//                                 </div>
//                             ) : (
//                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
//                                     <AlertCircle size={16} /> The learner has not registered their digital signature yet.
//                                 </div>
//                             )}
//                         </div>
//                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
//                             Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
//                         </p>
//                     </section>
//                 </div>

//                 <aside className="lpv-aside">
//                     <div className="lpv-qual-card">
//                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
//                         <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
//                         <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
//                     </div>

//                     <div className="lpv-vault-card">
//                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
//                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
//                             {isEditing && (
//                                 <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
//                                     <Plus size={12} /> Add
//                                 </button>
//                             )}
//                         </div>
//                         {renderDocumentVault()}
//                     </div>

//                     {isEditing && (
//                         <button className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
//                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
//                         </button>
//                     )}
//                 </aside>
//             </div>
//         </div>
//     );
// };

// /* --- Field Components --- */

// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div className="lpv-field">
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className="lpv-field__value">{value || '—'}</div>
//     </div>
// );

// interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

// const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
//     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
//     return (
//         <div className="lpv-field">
//             <div className="lpv-field__label">{icon}{label}</div>
//             {isEditing ? (
//                 type === 'select' ? (
//                     <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
//                         <option value="">Select...</option>
//                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
//                     </select>
//                 ) : (
//                     <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
//                 )
//             ) : (
//                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
//             )}
//         </div>
//     );
// };

// interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

// const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
//     const displayValue = options.find(o => o.value === value)?.label || value;
//     return (
//         <div className="lpv-field">
//             {isEditing ? (
//                 <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
//             ) : (
//                 <>
//                     <div className="lpv-field__label">{label}</div>
//                     <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
//                 </>
//             )}
//         </div>
//     );
// };

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
//         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
//         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
//     </a>
// );

// export default LearnerProfileView;



// // // src/components/views/LearnerProfileView/LearnerProfileView.tsx

// // import React, { useState, useEffect, useMemo } from 'react';
// // import { createPortal } from 'react-dom';
// // import {
// //     User, Phone, MapPin, ShieldCheck,
// //     FileText, Edit3, Save, X, Fingerprint,
// //     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye, Globe, Building2
// // } from 'lucide-react';
// // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import { doc, onSnapshot } from 'firebase/firestore';
// // import Autocomplete from "react-google-autocomplete";
// // import './LearnerProfileView.css';
// // import { storage, db } from '../../../../lib/firebase';
// // import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// // import { useToast } from '../../../../components/common/Toast/Toast';

// // import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// // import { fetchStatssaCodes } from '../../../../services/qctoService';
// // import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// // import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// // /* ── STRICT QCTO DICTIONARIES ────────────────────────── */
// // const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
// // const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// // const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// // const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
// // const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
// // const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
// // const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
// // const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
// // const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
// // const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
// // const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
// // const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

// // const extractFilename = (url: string) => {
// //     if (!url) return 'Saved Document';
// //     try {
// //         const decoded = decodeURIComponent(url.split('?')[0]);
// //         const parts = decoded.split('/');
// //         return parts[parts.length - 1];
// //     } catch {
// //         return 'Saved Document';
// //     }
// // };

// // interface ProfileProps {
// //     profile: any;
// //     user: any;
// //     onUpdate: (id: string, updates: any) => Promise<void>;
// // }

// // export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
// //     const toast = useToast();
// //     const [isEditing, setIsEditing] = useState(false);
// //     const [saving, setSaving] = useState(false);
// //     const [showSignatureModal, setShowSignatureModal] = useState(false);
// //     const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

// //     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
// //     const [formData, setFormData] = useState<any>({});

// //     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
// //     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
// //     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

// //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
// //     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

// //     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

// //     useEffect(() => {
// //         const loadCodes = async () => {
// //             const codes = await fetchStatssaCodes();
// //             setAllStatssaCodes(codes);
// //         };
// //         loadCodes();
// //     }, []);

// //     const statssaOptions = useMemo(() => {
// //         return allStatssaCodes.map(c => ({
// //             value: c.statssa_area_code,
// //             label: `${c.statssa_area_code} - ${c.town}`,
// //             subLabel: `${c.area} (${c.local_municipality})`
// //         }));
// //     }, [allStatssaCodes]);

// //     useEffect(() => {
// //         if (profile) {
// //             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
// //         }
// //     }, [profile]);

// //     // REAL-TIME FIRESTORE LISTENER
// //     useEffect(() => {
// //         if (!targetId) return;

// //         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
// //             if (docSnap.exists()) {

// //                 // console.log("UID: ", docSnap.id, "Data: ", docSnap.data());

// //                 const userData = docSnap.data();

// //                 setLiveProfile((currentProfile: any) => {
// //                     const merged = {
// //                         ...currentProfile,
// //                         ...userData,
// //                         demographics: currentProfile.demographics || userData.demographics || {},
// //                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
// //                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
// //                         documentHistory: currentProfile.documentHistory || userData.documentHistory || [],
// //                         addressHistory: currentProfile.addressHistory || userData.addressHistory || []
// //                     };
// //                     return merged;
// //                 });
// //             }
// //         });

// //         return () => unsubscribe();
// //     }, [targetId]);

// //     // HYDRATE UI FROM LIVE PROFILE
// //     useEffect(() => {
// //         if (!isEditing && liveProfile) {
// //             const d = liveProfile.demographics || {};

// //             const sameAsRes = liveProfile.sameAsResidential !== undefined
// //                 ? liveProfile.sameAsResidential
// //                 : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

// //             const initialLoadData = {
// //                 fullName: liveProfile.fullName || '',
// //                 email: liveProfile.email || '',
// //                 phone: liveProfile.phone || d.learnerPhoneNumber || '',
// //                 idNumber: liveProfile.idNumber || '',
// //                 sameAsResidential: sameAsRes,

// //                 learnerTitle: d.learnerTitle || '',
// //                 learnerMiddleName: d.learnerMiddleName || '',
// //                 nationalityCode: d.nationalityCode || '',
// //                 immigrantStatus: d.immigrantStatus || '03',
// //                 alternativeIdType: d.alternativeIdType || '533',

// //                 streetAddress: d.learnerHomeAddress1 || '',
// //                 city: d.learnerHomeAddress2 || '',
// //                 provinceCode: d.provinceCode || '',
// //                 postalCode: d.learnerHomeAddressPostalCode || '',
// //                 postalAddress: d.learnerPostalAddress1 || '',
// //                 customPostalCode: d.learnerPostalAddressPostCode || '',
// //                 statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
// //                 lat: d.lat || 0,
// //                 lng: d.lng || 0,

// //                 flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
// //                 equityCode: d.equityCode || '',
// //                 genderCode: d.genderCode || '',
// //                 homeLanguageCode: d.homeLanguageCode || '',
// //                 citizenStatusCode: d.citizenResidentStatusCode || '',
// //                 socioeconomicCode: d.socioeconomicStatusCode || '',
// //                 disabilityCode: d.disabilityStatusCode || 'N',
// //                 disabilityRating: d.disabilityRating || '',

// //                 nokName: liveProfile.nextOfKin?.name || '',
// //                 nokRelationship: liveProfile.nextOfKin?.relationship || '',
// //                 nokPhone: liveProfile.nextOfKin?.phone || '',
// //                 profilePhotoUrl: liveProfile.profilePhotoUrl || ''
// //             };

// //             setFormData(initialLoadData);
// //             setPhotoPreview(liveProfile.profilePhotoUrl || null);

// //             const legacyDocs = liveProfile.documents || {};
// //             const rawUploadedDocs = liveProfile.uploadedDocuments;
// //             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

// //             const currentDocs: DynamicDocument[] = [
// //                 { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
// //                 { id: 'poa', name: 'Proof of Address (Utility/Bank/Affidavit)', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'poa')?.url || legacyDocs.poaUrl || '', isFixed: true, isRequired: true },
// //                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
// //                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
// //             ];

// //             uploadedDocsArray.forEach((savedDoc: any) => {
// //                 if (!['id', 'poa', 'qual', 'cv'].includes(savedDoc.id)) {
// //                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
// //                 }
// //             });

// //             setDocsList(currentDocs);
// //         }
// //     }, [liveProfile, isEditing]);

// //     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         if (e.target.files && e.target.files[0]) {
// //             const file = e.target.files[0];
// //             setProfilePhoto(file);
// //             setPhotoPreview(URL.createObjectURL(file));
// //         }
// //     };

// //     // DERIVED STATS-SA / MUNICIPALITY MATCH
// //     const currentStatssaCode = isEditing ? formData.statssaAreaCode : (liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode);

// //     const selectedStatssaMatch = useMemo(() => {
// //         if (!currentStatssaCode || allStatssaCodes.length === 0) return null;
// //         return allStatssaCodes.find(c => String(c.statssa_area_code).trim() === String(currentStatssaCode).trim());
// //     }, [allStatssaCodes, currentStatssaCode]);

// //     // MULTI-TIERED GOOGLE PLACES ADDRESS PARSER
// //     const handleAddressSelected = (place: any) => {
// //         const components = place.address_components;
// //         if (!components) return;

// //         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
// //         const rawProv = getComp("administrative_area_level_1");
// //         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

// //         const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
// //         const townName = getComp("locality") || suburb;
// //         const localMuni = getComp("administrative_area_level_3");
// //         const districtMuni = getComp("administrative_area_level_2");
// //         const postal = getComp("postal_code");

// //         const buildingName = place.name || "";
// //         const formatted = place.formatted_address || "";
// //         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

// //         const searchTerms = [suburb, townName, localMuni, districtMuni]
// //             .map(s => s.toLowerCase().trim())
// //             .filter(Boolean);

// //         let match = null;

// //         if (allStatssaCodes.length > 0 && searchTerms.length > 0) {
// //             match = allStatssaCodes.find(c => {
// //                 const cTown = (c.town || '').toLowerCase();
// //                 const cArea = (c.area || '').toLowerCase();
// //                 const cMuni = (c.local_municipality || '').toLowerCase();

// //                 return searchTerms.some(term =>
// //                     term && (cTown === term || cArea === term || cMuni === term)
// //                 );
// //             });

// //             if (!match) {
// //                 match = allStatssaCodes.find(c => {
// //                     const cTown = (c.town || '').toLowerCase();
// //                     const cArea = (c.area || '').toLowerCase();
// //                     const cMuni = (c.local_municipality || '').toLowerCase();

// //                     return searchTerms.some(term =>
// //                         term && (cTown.includes(term) || term.includes(cTown) || cArea.includes(term) || cMuni.includes(term))
// //                     );
// //                 });
// //             }
// //         }

// //         let extractedLat = 0;
// //         let extractedLng = 0;

// //         if (place.geometry && place.geometry.location) {
// //             extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// //             extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// //         }

// //         setFormData((prev: any) => ({
// //             ...prev,
// //             streetAddress: streetLine,
// //             city: townName,
// //             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
// //             postalCode: postal,
// //             statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
// //             lat: extractedLat,
// //             lng: extractedLng
// //         }));
// //     };

// //     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
// //     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
// //     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

// //     const handleSaveClick = () => {
// //         const missingRequired = docsList.filter(d => d.isRequired && !d.file && !d.url);
// //         if (missingRequired.length > 0) {
// //             toast.warning(`Please upload all required documents: ${missingRequired.map(d => d.name).join(', ')}`);
// //             return;
// //         }

// //         const isOverwriting = docsList.some(d => d.file && d.url);

// //         if (isOverwriting) {
// //             setConfirmDocOverwrite(true);
// //         } else {
// //             executeSave();
// //         }
// //     };

// //     const executeSave = async () => {
// //         if (!targetId) return;

// //         setSaving(true);

// //         try {
// //             let finalPhotoUrl = formData.profilePhotoUrl;
// //             if (profilePhoto) {
// //                 const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
// //                 const snapshot = await uploadBytes(storageRef, profilePhoto);
// //                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
// //             }

// //             const finalUploadedDocs = [];
// //             const newHistory = [...(liveProfile.documentHistory || [])];

// //             for (const docItem of docsList) {
// //                 let finalUrl = docItem.url;

// //                 if (docItem.file) {
// //                     if (docItem.url) {
// //                         newHistory.push({
// //                             id: docItem.id,
// //                             name: docItem.name || 'Legacy Document',
// //                             url: docItem.url,
// //                             replacedAt: new Date().toISOString()
// //                         });
// //                     }

// //                     const ext = docItem.file.name.split('.').pop();
// //                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
// //                     const snapshot = await uploadBytes(storageRef, docItem.file);
// //                     finalUrl = await getDownloadURL(snapshot.ref);
// //                 }

// //                 if (finalUrl) {
// //                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
// //                 }
// //             }

// //             // ADDRESS HISTORY AUDIT TRAIL LOGGING
// //             const oldStreet = liveProfile?.demographics?.learnerHomeAddress1 || '';
// //             const newStreet = formData.streetAddress || '';
// //             const newAddressHistory = [...(liveProfile?.addressHistory || [])];

// //             if (oldStreet && oldStreet.trim() !== newStreet.trim()) {
// //                 newAddressHistory.push({
// //                     streetAddress: oldStreet,
// //                     city: liveProfile?.demographics?.learnerHomeAddress2 || '',
// //                     provinceCode: liveProfile?.demographics?.provinceCode || '',
// //                     postalCode: liveProfile?.demographics?.learnerHomeAddressPostalCode || '',
// //                     statssaAreaCode: liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode || '',
// //                     lat: liveProfile?.demographics?.lat || 0,
// //                     lng: liveProfile?.demographics?.lng || 0,
// //                     replacedAt: new Date().toISOString()
// //                 });
// //             }

// //             // 🚀 RESOLVE STATS-SA RECORD & PROVINCE NAME FOR EXPLICIT DATABASE PERSISTENCE
// //             const statssaMatch = allStatssaCodes.find(
// //                 c => String(c.statssa_area_code).trim() === String(formData.statssaAreaCode).trim()
// //             );
// //             const provinceMatch = QCTO_PROVINCES.find(p => p.value === formData.provinceCode);

// //             const updatedData = {
// //                 fullName: formData.fullName,
// //                 email: formData.email,
// //                 phone: formData.phone,
// //                 profilePhotoUrl: finalPhotoUrl,
// //                 uploadedDocuments: finalUploadedDocs,
// //                 documentHistory: newHistory,
// //                 addressHistory: newAddressHistory,
// //                 demographics: {
// //                     ...(liveProfile.demographics || {}),
// //                     learnerPhoneNumber: formData.phone,
// //                     learnerTitle: formData.learnerTitle,
// //                     learnerMiddleName: formData.learnerMiddleName,
// //                     alternativeIdType: formData.alternativeIdType,
// //                     learnerHomeAddress1: formData.streetAddress,
// //                     learnerHomeAddress2: formData.city,
// //                     provinceCode: formData.provinceCode,
// //                     provinceName: provinceMatch ? provinceMatch.label : '',
// //                     learnerHomeAddressPostalCode: formData.postalCode,
// //                     learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
// //                     learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
// //                     equityCode: formData.equityCode,
// //                     genderCode: formData.genderCode,
// //                     homeLanguageCode: formData.homeLanguageCode,
// //                     citizenResidentStatusCode: formData.citizenStatusCode,
// //                     nationalityCode: formData.nationalityCode,
// //                     immigrantStatus: formData.immigrantStatus,
// //                     flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
// //                     socioeconomicStatusCode: formData.socioeconomicCode,
// //                     disabilityStatusCode: formData.disabilityCode,
// //                     disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,

// //                     // 🚀 STATS-SA CODE + EXPLICIT HUMAN-READABLE MUNICIPAL NAMES PERSISTED
// //                     statssaAreaCode: formData.statssaAreaCode,
// //                     statsaaAreaCode: formData.statssaAreaCode,
// //                     localMunicipality: statssaMatch?.local_municipality || statssaMatch?.area || '',
// //                     districtOrMetro: statssaMatch?.district_municipality || statssaMatch?.district || '',

// //                     lat: formData.lat,
// //                     lng: formData.lng
// //                 },
// //                 nextOfKin: {
// //                     name: formData.nokName,
// //                     relationship: formData.nokRelationship,
// //                     phone: formData.nokPhone
// //                 },
// //                 sameAsResidential: formData.sameAsResidential,
// //                 updatedAt: new Date().toISOString()
// //             };

// //             await onUpdate(profile.id || targetId, updatedData);

// //             setIsEditing(false);
// //             setProfilePhoto(null);

// //             setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
// //         } catch (error) {
// //             console.error('❌ Update failed', error);
// //             setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
// //         } finally {
// //             setSaving(false);
// //         }
// //     };

// //     const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
// //     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

// //     const handleCancel = () => {
// //         setProfilePhoto(null);
// //         setPhotoPreview(liveProfile?.profilePhotoUrl || null);
// //         setIsEditing(false);
// //     };

// //     const renderDocumentVault = () => {
// //         return (
// //             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// //                 {isEditing ? (
// //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
// //                         <div style={{ padding: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e40af', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                             <Info size={16} color="#2563eb" style={{ flexShrink: 0 }} />
// //                             <span><strong>Address Matching Note:</strong> Proof of Address must explicitly display your name and physical residential address as entered.</span>
// //                         </div>

// //                         {docsList.map((docItem) => (
// //                             <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// //                                 <DynamicDocUpload
// //                                     document={docItem}
// //                                     onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
// //                                     onRemove={() => handleRemoveDocument(docItem.id)}
// //                                 />
// //                                 {docItem.url && !docItem.file && (
// //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// //                                         <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// //                                             <FileText size={14} color="var(--mlab-blue)" />
// //                                             <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
// //                                         </span>
// //                                         <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
// //                                             <Eye size={14} /> View File
// //                                         </a>
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         ))}
// //                     </div>
// //                 ) : (
// //                     <>
// //                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
// //                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
// //                     </>
// //                 )}

// //                 {/* Document History Log Renderer */}
// //                 {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
// //                     <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// //                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                             <History size={14} /> Document History Log
// //                         </h4>
// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                             {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
// //                                 <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                     <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
// //                                         <FileText size={14} /> {hDoc.name || 'Archived Document'}
// //                                     </a>
// //                                     <div style={{ textAlign: 'right' }}>
// //                                         <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
// //                                         <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// //                                     </div>
// //                                 </div>
// //                             ))}
// //                         </div>
// //                     </div>
// //                 )}
// //             </div>
// //         );
// //     };

// //     const displayData = isEditing ? formData : liveProfile;
// //     const isVerified = liveProfile?.profileCompleted === true;
// //     const isPostalSame = displayData?.sameAsResidential !== false;
// //     const d = isEditing ? formData : (liveProfile?.demographics || {});

// //     return (
// //         <div className="lpv-wrapper animate-fade-in">
// //             {modalConfig.isOpen && createPortal(
// //                 <StatusModal
// //                     type={modalConfig.type}
// //                     title={modalConfig.title}
// //                     message={modalConfig.message}
// //                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
// //                 />,
// //                 document.body
// //             )}

// //             {confirmDocOverwrite && createPortal(
// //                 <StatusModal
// //                     type="warning"
// //                     title="Overwrite Existing Documents?"
// //                     message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
// //                     confirmText="Yes, Overwrite"
// //                     onClose={() => {
// //                         setConfirmDocOverwrite(false);
// //                         executeSave();
// //                     }}
// //                     onCancel={() => setConfirmDocOverwrite(false)}
// //                 />,
// //                 document.body
// //             )}

// //             {showSignatureModal && createPortal(
// //                 <SignatureSetupModal
// //                     userUid={targetId}
// //                     existingSignatureUrl={liveProfile?.signatureUrl}
// //                     onComplete={() => {
// //                         setShowSignatureModal(false);
// //                     }}
// //                 />,
// //                 document.body
// //             )}

// //             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
// //                 <ShieldCheck size={22} className="lpv-banner__icon" />
// //                 <div style={{ flex: 1 }}>
// //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
// //                         {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
// //                     </div>
// //                     <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
// //                 </div>
// //             </div>

// //             <div className="lpv-layout">
// //                 <div className="lpv-main-stack">

// //                     <section className="lpv-panel">
// //                         <div className="lpv-panel__header">
// //                             <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
// //                             <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
// //                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
// //                             </button>
// //                         </div>

// //                         <div className="lpv-profile-header">
// //                             <div className="lpv-avatar-wrapper">
// //                                 <div className="lpv-avatar">
// //                                     {photoPreview ? (
// //                                         <img
// //                                             src={photoPreview}
// //                                             crossOrigin="anonymous"
// //                                             alt="Profile"
// //                                             style={{
// //                                                 objectFit: "cover",
// //                                                 width: "100%",
// //                                                 height: "100%"
// //                                             }}
// //                                         />
// //                                     ) : (
// //                                         <User size={30} color="#94a3b8" />
// //                                     )}
// //                                 </div>

// //                                 {isEditing && (
// //                                     <label className="lpv-avatar-upload">
// //                                         <Camera size={16} />
// //                                         <input
// //                                             type="file"
// //                                             accept="image/*"
// //                                             onChange={handlePhotoSelect}
// //                                             hidden
// //                                         />
// //                                     </label>
// //                                 )}
// //                             </div>

// //                             <div>
// //                                 <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
// //                                 <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
// //                             </div>
// //                         </div>

// //                         <div className="lpv-grid-2">
// //                             <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
// //                             <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

// //                             <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
// //                             <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

// //                             <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
// //                             <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
// //                             <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
// //                             <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
// //                             <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
// //                             <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
// //                             <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
// //                         </div>
// //                     </section>

// //                     <section className="lpv-panel">
// //                         <h3 className="lp-section-title"><Briefcase size={16} /> Background Details</h3>
// //                         <div className="lpv-grid-2">
// //                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

// //                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
// //                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
// //                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
// //                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
// //                             )}
// //                         </div>
// //                     </section>

// //                     {/* ════════════════════════════════════════════════════════════════════════════ */}
// //                     {/* RESIDENTIAL ADDRESS & MUNICIPALITY PANEL (EXPLICIT DISPLAY)                  */}
// //                     {/* ════════════════════════════════════════════════════════════════════════════ */}
// //                     <section className="lpv-panel">
// //                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
// //                             <MapPin size={16} /> Residential Address & Municipal Metadata
// //                         </h3>

// //                         {isEditing && (
// //                             <div style={{ marginBottom: '1rem' }}>
// //                                 <div className="lpv-field__label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
// //                                     <Globe size={13} /> Address Search (Google Verified)
// //                                 </div>
// //                                 <Autocomplete
// //                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// //                                     onPlaceSelected={handleAddressSelected}
// //                                     options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
// //                                     className="lpv-input"
// //                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
// //                                     placeholder="Start typing your street name..."
// //                                 />
// //                             </div>
// //                         )}

// //                         <div className="lpv-grid-3">
// //                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
// //                             <ROField label="City / Suburb" value={displayData.city || d.learnerHomeAddress2} />
// //                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
// //                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />

// //                             {/* EXPLICIT LOCAL MUNICIPALITY & DISTRICT DERIVED READOUTS */}
// //                             <ROField
// //                                 label="Local Municipality"
// //                                 value={d.localMunicipality || selectedStatssaMatch?.local_municipality || (selectedStatssaMatch?.area ? `${selectedStatssaMatch.area} Muni` : 'Auto-derived on selection')}
// //                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
// //                             />
// //                             <ROField
// //                                 label="District / Metro"
// //                                 value={d.districtOrMetro || selectedStatssaMatch?.district_municipality || selectedStatssaMatch?.district || (selectedStatssaMatch?.town ? `${selectedStatssaMatch.town} Metro` : 'Auto-derived on selection')}
// //                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
// //                             />
// //                         </div>

// //                         {/* STATS-SA AREA CODE SELECTOR / DISPLAY */}
// //                         <div style={{ marginTop: '1rem' }}>
// //                             <FormSelectWrapper
// //                                 label="STATS-SA Area Code & Municipality"
// //                                 value={d.statssaAreaCode || d.statsaaAreaCode}
// //                                 isEditing={isEditing}
// //                                 options={statssaOptions}
// //                                 onChange={(v: string) => update('statssaAreaCode', v)}
// //                             />
// //                         </div>

// //                         {/* NOTICE BANNER FOR PROOF OF ADDRESS MATCHING */}
// //                         <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', color: '#713f12', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                             <Info size={16} color="#ca8a04" style={{ flexShrink: 0 }} />
// //                             <span><strong>Proof of Address Requirement:</strong> Ensure your uploaded Proof of Address document in the Document Vault explicitly matches the residential address listed here.</span>
// //                         </div>

// //                         {isEditing ? (
// //                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
// //                                     <input
// //                                         type="checkbox"
// //                                         checked={displayData.sameAsResidential}
// //                                         onChange={e => update('sameAsResidential', e.target.checked)}
// //                                     />
// //                                     Postal Address is the same as Residential
// //                                 </label>
// //                                 {!displayData.sameAsResidential && (
// //                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
// //                                         <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
// //                                         <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
// //                                     </div>
// //                                 )}
// //                             </div>
// //                         ) : (
// //                             <>
// //                                 <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
// //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
// //                                     Postal Address
// //                                     {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
// //                                 </h4>
// //                                 <div className="lpv-grid-2">
// //                                     <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
// //                                     <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
// //                                 </div>
// //                             </>
// //                         )}

// //                         {/* Address History Log Renderer */}
// //                         {liveProfile?.addressHistory && liveProfile.addressHistory.length > 0 && !isEditing && (
// //                             <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// //                                     <History size={14} /> Address History Log
// //                                 </h4>
// //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// //                                     {liveProfile.addressHistory.map((hAddr: any, idx: number) => (
// //                                         <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// //                                             <div>
// //                                                 <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>{hAddr.streetAddress}</div>
// //                                                 <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hAddr.city} • Code: {hAddr.statssaAreaCode || 'N/A'}</div>
// //                                             </div>
// //                                             <div style={{ textAlign: 'right' }}>
// //                                                 <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hAddr.replacedAt).toLocaleDateString()}</div>
// //                                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hAddr.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// //                                             </div>
// //                                         </div>
// //                                     ))}
// //                                 </div>
// //                             </div>
// //                         )}
// //                     </section>

// //                     <section className="lpv-panel">
// //                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
// //                         <div className="lpv-grid-3">
// //                             <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
// //                             <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
// //                             <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
// //                         </div>
// //                     </section>

// //                     {/* SIGNATURE SECTION */}
// //                     <section className="lpv-panel">
// //                         <div className="lpv-panel__header">
// //                             <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
// //                             <button
// //                                 className="lpv-edit-btn"
// //                                 onClick={() => setShowSignatureModal(true)}
// //                             >
// //                                 <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
// //                             </button>
// //                         </div>
// //                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
// //                             {liveProfile?.signatureUrl ? (
// //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
// //                                     <img
// //                                         src={liveProfile.signatureUrl}
// //                                         alt="Learner Signature"
// //                                         crossOrigin="anonymous"
// //                                         style={{
// //                                             height: 'auto',
// //                                             maxHeight: '120px',
// //                                             width: '100%',
// //                                             maxWidth: '400px',
// //                                             objectFit: 'contain',
// //                                             mixBlendMode: 'multiply',
// //                                             filter: 'grayscale(100%) contrast(400%)'
// //                                         }}
// //                                     />
// //                                     <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
// //                                         Authenticated Learner Signature (Black Ink)
// //                                     </span>
// //                                 </div>
// //                             ) : (
// //                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
// //                                     <AlertCircle size={16} /> The learner has not registered their digital signature yet.
// //                                 </div>
// //                             )}
// //                         </div>
// //                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
// //                             Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
// //                         </p>
// //                     </section>
// //                 </div>

// //                 <aside className="lpv-aside">
// //                     <div className="lpv-qual-card">
// //                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
// //                         <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
// //                         <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
// //                     </div>

// //                     <div className="lpv-vault-card">
// //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
// //                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
// //                             {isEditing && (
// //                                 <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
// //                                     <Plus size={12} /> Add
// //                                 </button>
// //                             )}
// //                         </div>
// //                         {renderDocumentVault()}
// //                     </div>

// //                     {isEditing && (
// //                         <button className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
// //                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
// //                         </button>
// //                     )}
// //                 </aside>
// //             </div>
// //         </div>
// //     );
// // };

// // /* --- Field Components --- */

// // const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
// //     <div className="lpv-field">
// //         <div className="lpv-field__label">{icon}{label}</div>
// //         <div className="lpv-field__value">{value || '—'}</div>
// //     </div>
// // );

// // interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

// // const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
// //     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
// //     return (
// //         <div className="lpv-field">
// //             <div className="lpv-field__label">{icon}{label}</div>
// //             {isEditing ? (
// //                 type === 'select' ? (
// //                     <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
// //                         <option value="">Select...</option>
// //                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
// //                     </select>
// //                 ) : (
// //                     <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
// //                 )
// //             ) : (
// //                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// //             )}
// //         </div>
// //     );
// // };

// // interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

// // const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
// //     const displayValue = options.find(o => o.value === value)?.label || value;
// //     return (
// //         <div className="lpv-field">
// //             {isEditing ? (
// //                 <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
// //             ) : (
// //                 <>
// //                     <div className="lpv-field__label">{label}</div>
// //                     <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// //                 </>
// //             )}
// //         </div>
// //     );
// // };

// // const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
// //     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
// //         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
// //         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
// //     </a>
// // );

// // export default LearnerProfileView;



// // // // src/components/views/LearnerProfileView/LearnerProfileView.tsx

// // // import React, { useState, useEffect, useMemo } from 'react';
// // // import { createPortal } from 'react-dom';
// // // import {
// // //     User, Phone, MapPin, ShieldCheck,
// // //     FileText, Edit3, Save, X, Fingerprint,
// // //     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye, Globe, Building2
// // // } from 'lucide-react';
// // // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // import { doc, onSnapshot } from 'firebase/firestore';
// // // import Autocomplete from "react-google-autocomplete";
// // // import './LearnerProfileView.css';
// // // import { storage, db } from '../../../../lib/firebase';
// // // import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// // // import { useToast } from '../../../../components/common/Toast/Toast';

// // // import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// // // import { fetchStatssaCodes } from '../../../../services/qctoService';
// // // import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// // // import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// // // /* ── STRICT QCTO DICTIONARIES ────────────────────────── */
// // // const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
// // // const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// // // const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// // // const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
// // // const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
// // // const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
// // // const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
// // // const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
// // // const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
// // // const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
// // // const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
// // // const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

// // // const extractFilename = (url: string) => {
// // //     if (!url) return 'Saved Document';
// // //     try {
// // //         const decoded = decodeURIComponent(url.split('?')[0]);
// // //         const parts = decoded.split('/');
// // //         return parts[parts.length - 1];
// // //     } catch {
// // //         return 'Saved Document';
// // //     }
// // // };

// // // interface ProfileProps {
// // //     profile: any;
// // //     user: any;
// // //     onUpdate: (id: string, updates: any) => Promise<void>;
// // // }

// // // export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
// // //     const toast = useToast();
// // //     const [isEditing, setIsEditing] = useState(false);
// // //     const [saving, setSaving] = useState(false);
// // //     const [showSignatureModal, setShowSignatureModal] = useState(false);
// // //     const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

// // //     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
// // //     const [formData, setFormData] = useState<any>({});

// // //     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
// // //     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
// // //     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

// // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
// // //     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

// // //     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

// // //     useEffect(() => {
// // //         const loadCodes = async () => {
// // //             const codes = await fetchStatssaCodes();
// // //             setAllStatssaCodes(codes);
// // //         };
// // //         loadCodes();
// // //     }, []);

// // //     const statssaOptions = useMemo(() => {
// // //         return allStatssaCodes.map(c => ({
// // //             value: c.statssa_area_code,
// // //             label: `${c.statssa_area_code} - ${c.town}`,
// // //             subLabel: `${c.area} (${c.local_municipality})`
// // //         }));
// // //     }, [allStatssaCodes]);

// // //     useEffect(() => {
// // //         if (profile) {
// // //             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
// // //         }
// // //     }, [profile]);

// // //     // REAL-TIME FIRESTORE LISTENER
// // //     useEffect(() => {
// // //         if (!targetId) return;

// // //         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
// // //             if (docSnap.exists()) {
// // //                 const userData = docSnap.data();

// // //                 setLiveProfile((currentProfile: any) => {
// // //                     const merged = {
// // //                         ...currentProfile,
// // //                         ...userData,
// // //                         demographics: currentProfile.demographics || userData.demographics || {},
// // //                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
// // //                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
// // //                         documentHistory: currentProfile.documentHistory || userData.documentHistory || [],
// // //                         addressHistory: currentProfile.addressHistory || userData.addressHistory || []
// // //                     };
// // //                     return merged;
// // //                 });
// // //             }
// // //         });

// // //         return () => unsubscribe();
// // //     }, [targetId]);

// // //     // HYDRATE UI FROM LIVE PROFILE
// // //     useEffect(() => {
// // //         if (!isEditing && liveProfile) {
// // //             const d = liveProfile.demographics || {};

// // //             const sameAsRes = liveProfile.sameAsResidential !== undefined
// // //                 ? liveProfile.sameAsResidential
// // //                 : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

// // //             const initialLoadData = {
// // //                 fullName: liveProfile.fullName || '',
// // //                 email: liveProfile.email || '',
// // //                 phone: liveProfile.phone || d.learnerPhoneNumber || '',
// // //                 idNumber: liveProfile.idNumber || '',
// // //                 sameAsResidential: sameAsRes,

// // //                 learnerTitle: d.learnerTitle || '',
// // //                 learnerMiddleName: d.learnerMiddleName || '',
// // //                 nationalityCode: d.nationalityCode || '',
// // //                 immigrantStatus: d.immigrantStatus || '03',
// // //                 alternativeIdType: d.alternativeIdType || '533',

// // //                 streetAddress: d.learnerHomeAddress1 || '',
// // //                 city: d.learnerHomeAddress2 || '',
// // //                 provinceCode: d.provinceCode || '',
// // //                 postalCode: d.learnerHomeAddressPostalCode || '',
// // //                 postalAddress: d.learnerPostalAddress1 || '',
// // //                 customPostalCode: d.learnerPostalAddressPostCode || '',
// // //                 statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
// // //                 lat: d.lat || 0,
// // //                 lng: d.lng || 0,

// // //                 flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
// // //                 equityCode: d.equityCode || '',
// // //                 genderCode: d.genderCode || '',
// // //                 homeLanguageCode: d.homeLanguageCode || '',
// // //                 citizenStatusCode: d.citizenResidentStatusCode || '',
// // //                 socioeconomicCode: d.socioeconomicStatusCode || '',
// // //                 disabilityCode: d.disabilityStatusCode || 'N',
// // //                 disabilityRating: d.disabilityRating || '',

// // //                 nokName: liveProfile.nextOfKin?.name || '',
// // //                 nokRelationship: liveProfile.nextOfKin?.relationship || '',
// // //                 nokPhone: liveProfile.nextOfKin?.phone || '',
// // //                 profilePhotoUrl: liveProfile.profilePhotoUrl || ''
// // //             };

// // //             setFormData(initialLoadData);
// // //             setPhotoPreview(liveProfile.profilePhotoUrl || null);

// // //             const legacyDocs = liveProfile.documents || {};
// // //             const rawUploadedDocs = liveProfile.uploadedDocuments;
// // //             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

// // //             const currentDocs: DynamicDocument[] = [
// // //                 { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
// // //                 { id: 'poa', name: 'Proof of Address (Utility/Bank/Affidavit)', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'poa')?.url || legacyDocs.poaUrl || '', isFixed: true, isRequired: true },
// // //                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
// // //                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
// // //             ];

// // //             uploadedDocsArray.forEach((savedDoc: any) => {
// // //                 if (!['id', 'poa', 'qual', 'cv'].includes(savedDoc.id)) {
// // //                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
// // //                 }
// // //             });

// // //             setDocsList(currentDocs);
// // //         }
// // //     }, [liveProfile, isEditing]);

// // //     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         if (e.target.files && e.target.files[0]) {
// // //             const file = e.target.files[0];
// // //             setProfilePhoto(file);
// // //             setPhotoPreview(URL.createObjectURL(file));
// // //         }
// // //     };

// // //     // ════════════════════════════════════════════════════════════════════════════
// // //     // DERIVED STATS-SA / MUNICIPALITY MATCH (For displaying Muni & District)
// // //     // ════════════════════════════════════════════════════════════════════════════
// // //     const currentStatssaCode = isEditing ? formData.statssaAreaCode : (liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode);

// // //     const selectedStatssaMatch = useMemo(() => {
// // //         if (!currentStatssaCode || allStatssaCodes.length === 0) return null;
// // //         return allStatssaCodes.find(c => String(c.statssa_area_code).trim() === String(currentStatssaCode).trim());
// // //     }, [allStatssaCodes, currentStatssaCode]);

// // //     // MULTI-TIERED GOOGLE PLACES ADDRESS PARSER
// // //     const handleAddressSelected = (place: any) => {
// // //         const components = place.address_components;
// // //         if (!components) return;

// // //         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
// // //         const rawProv = getComp("administrative_area_level_1");
// // //         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

// // //         const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
// // //         const townName = getComp("locality") || suburb;
// // //         const localMuni = getComp("administrative_area_level_3");
// // //         const districtMuni = getComp("administrative_area_level_2");
// // //         const postal = getComp("postal_code");

// // //         const buildingName = place.name || "";
// // //         const formatted = place.formatted_address || "";
// // //         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

// // //         const searchTerms = [suburb, townName, localMuni, districtMuni]
// // //             .map(s => s.toLowerCase().trim())
// // //             .filter(Boolean);

// // //         let match = null;

// // //         if (allStatssaCodes.length > 0 && searchTerms.length > 0) {
// // //             match = allStatssaCodes.find(c => {
// // //                 const cTown = (c.town || '').toLowerCase();
// // //                 const cArea = (c.area || '').toLowerCase();
// // //                 const cMuni = (c.local_municipality || '').toLowerCase();

// // //                 return searchTerms.some(term =>
// // //                     term && (cTown === term || cArea === term || cMuni === term)
// // //                 );
// // //             });

// // //             if (!match) {
// // //                 match = allStatssaCodes.find(c => {
// // //                     const cTown = (c.town || '').toLowerCase();
// // //                     const cArea = (c.area || '').toLowerCase();
// // //                     const cMuni = (c.local_municipality || '').toLowerCase();

// // //                     return searchTerms.some(term =>
// // //                         term && (cTown.includes(term) || term.includes(cTown) || cArea.includes(term) || cMuni.includes(term))
// // //                     );
// // //                 });
// // //             }
// // //         }

// // //         let extractedLat = 0;
// // //         let extractedLng = 0;

// // //         if (place.geometry && place.geometry.location) {
// // //             extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// // //             extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// // //         }

// // //         setFormData((prev: any) => ({
// // //             ...prev,
// // //             streetAddress: streetLine,
// // //             city: townName,
// // //             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
// // //             postalCode: postal,
// // //             statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
// // //             lat: extractedLat,
// // //             lng: extractedLng
// // //         }));
// // //     };

// // //     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
// // //     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
// // //     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

// // //     const handleSaveClick = () => {
// // //         const missingRequired = docsList.filter(d => d.isRequired && !d.file && !d.url);
// // //         if (missingRequired.length > 0) {
// // //             toast.warning(`Please upload all required documents: ${missingRequired.map(d => d.name).join(', ')}`);
// // //             return;
// // //         }

// // //         const isOverwriting = docsList.some(d => d.file && d.url);

// // //         if (isOverwriting) {
// // //             setConfirmDocOverwrite(true);
// // //         } else {
// // //             executeSave();
// // //         }
// // //     };

// // //     const executeSave = async () => {
// // //         if (!targetId) return;

// // //         setSaving(true);

// // //         try {
// // //             let finalPhotoUrl = formData.profilePhotoUrl;
// // //             if (profilePhoto) {
// // //                 const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
// // //                 const snapshot = await uploadBytes(storageRef, profilePhoto);
// // //                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
// // //             }

// // //             const finalUploadedDocs = [];
// // //             const newHistory = [...(liveProfile.documentHistory || [])];

// // //             for (const docItem of docsList) {
// // //                 let finalUrl = docItem.url;

// // //                 if (docItem.file) {
// // //                     if (docItem.url) {
// // //                         newHistory.push({
// // //                             id: docItem.id,
// // //                             name: docItem.name || 'Legacy Document',
// // //                             url: docItem.url,
// // //                             replacedAt: new Date().toISOString()
// // //                         });
// // //                     }

// // //                     const ext = docItem.file.name.split('.').pop();
// // //                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
// // //                     const snapshot = await uploadBytes(storageRef, docItem.file);
// // //                     finalUrl = await getDownloadURL(snapshot.ref);
// // //                 }

// // //                 if (finalUrl) {
// // //                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
// // //                 }
// // //             }

// // //             // ADDRESS HISTORY AUDIT TRAIL LOGGING
// // //             const oldStreet = liveProfile?.demographics?.learnerHomeAddress1 || '';
// // //             const newStreet = formData.streetAddress || '';
// // //             const newAddressHistory = [...(liveProfile?.addressHistory || [])];

// // //             if (oldStreet && oldStreet.trim() !== newStreet.trim()) {
// // //                 newAddressHistory.push({
// // //                     streetAddress: oldStreet,
// // //                     city: liveProfile?.demographics?.learnerHomeAddress2 || '',
// // //                     provinceCode: liveProfile?.demographics?.provinceCode || '',
// // //                     postalCode: liveProfile?.demographics?.learnerHomeAddressPostalCode || '',
// // //                     statssaAreaCode: liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode || '',
// // //                     lat: liveProfile?.demographics?.lat || 0,
// // //                     lng: liveProfile?.demographics?.lng || 0,
// // //                     replacedAt: new Date().toISOString()
// // //                 });
// // //             }

// // //             const updatedData = {
// // //                 fullName: formData.fullName,
// // //                 email: formData.email,
// // //                 phone: formData.phone,
// // //                 profilePhotoUrl: finalPhotoUrl,
// // //                 uploadedDocuments: finalUploadedDocs,
// // //                 documentHistory: newHistory,
// // //                 addressHistory: newAddressHistory,
// // //                 demographics: {
// // //                     ...(liveProfile.demographics || {}),
// // //                     learnerPhoneNumber: formData.phone,
// // //                     learnerTitle: formData.learnerTitle,
// // //                     learnerMiddleName: formData.learnerMiddleName,
// // //                     alternativeIdType: formData.alternativeIdType,
// // //                     learnerHomeAddress1: formData.streetAddress,
// // //                     learnerHomeAddress2: formData.city,
// // //                     provinceCode: formData.provinceCode,
// // //                     learnerHomeAddressPostalCode: formData.postalCode,
// // //                     learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
// // //                     learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
// // //                     equityCode: formData.equityCode,
// // //                     genderCode: formData.genderCode,
// // //                     homeLanguageCode: formData.homeLanguageCode,
// // //                     citizenResidentStatusCode: formData.citizenStatusCode,
// // //                     nationalityCode: formData.nationalityCode,
// // //                     immigrantStatus: formData.immigrantStatus,
// // //                     flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
// // //                     socioeconomicStatusCode: formData.socioeconomicCode,
// // //                     disabilityStatusCode: formData.disabilityCode,
// // //                     disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
// // //                     statssaAreaCode: formData.statssaAreaCode,
// // //                     statsaaAreaCode: formData.statssaAreaCode,
// // //                     lat: formData.lat,
// // //                     lng: formData.lng
// // //                 },
// // //                 nextOfKin: {
// // //                     name: formData.nokName,
// // //                     relationship: formData.nokRelationship,
// // //                     phone: formData.nokPhone
// // //                 },
// // //                 sameAsResidential: formData.sameAsResidential,
// // //                 updatedAt: new Date().toISOString()
// // //             };

// // //             await onUpdate(profile.id || targetId, updatedData);

// // //             setIsEditing(false);
// // //             setProfilePhoto(null);

// // //             setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
// // //         } catch (error) {
// // //             console.error('❌ Update failed', error);
// // //             setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
// // //         } finally {
// // //             setSaving(false);
// // //         }
// // //     };

// // //     const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
// // //     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

// // //     const handleCancel = () => {
// // //         setProfilePhoto(null);
// // //         setPhotoPreview(liveProfile?.profilePhotoUrl || null);
// // //         setIsEditing(false);
// // //     };

// // //     const renderDocumentVault = () => {
// // //         return (
// // //             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // //                 {isEditing ? (
// // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
// // //                         <div style={{ padding: '0.75rem', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', color: '#1e40af', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                             <Info size={16} color="#2563eb" style={{ flexShrink: 0 }} />
// // //                             <span><strong>Address Matching Note:</strong> Proof of Address must explicitly display your name and physical residential address as entered.</span>
// // //                         </div>

// // //                         {docsList.map((docItem) => (
// // //                             <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // //                                 <DynamicDocUpload
// // //                                     document={docItem}
// // //                                     onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
// // //                                     onRemove={() => handleRemoveDocument(docItem.id)}
// // //                                 />
// // //                                 {docItem.url && !docItem.file && (
// // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // //                                         <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // //                                             <FileText size={14} color="var(--mlab-blue)" />
// // //                                             <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
// // //                                         </span>
// // //                                         <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
// // //                                             <Eye size={14} /> View File
// // //                                         </a>
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         ))}
// // //                     </div>
// // //                 ) : (
// // //                     <>
// // //                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
// // //                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
// // //                     </>
// // //                 )}

// // //                 {/* Document History Log Renderer */}
// // //                 {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
// // //                     <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// // //                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                             <History size={14} /> Document History Log
// // //                         </h4>
// // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                             {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
// // //                                 <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                     <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
// // //                                         <FileText size={14} /> {hDoc.name || 'Archived Document'}
// // //                                     </a>
// // //                                     <div style={{ textAlign: 'right' }}>
// // //                                         <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
// // //                                         <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// // //                                     </div>
// // //                                 </div>
// // //                             ))}
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         );
// // //     };

// // //     const displayData = isEditing ? formData : liveProfile;
// // //     const isVerified = liveProfile?.profileCompleted === true;
// // //     const isPostalSame = displayData?.sameAsResidential !== false;
// // //     const d = isEditing ? formData : (liveProfile?.demographics || {});

// // //     return (
// // //         <div className="lpv-wrapper animate-fade-in">
// // //             {modalConfig.isOpen && createPortal(
// // //                 <StatusModal
// // //                     type={modalConfig.type}
// // //                     title={modalConfig.title}
// // //                     message={modalConfig.message}
// // //                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
// // //                 />,
// // //                 document.body
// // //             )}

// // //             {confirmDocOverwrite && createPortal(
// // //                 <StatusModal
// // //                     type="warning"
// // //                     title="Overwrite Existing Documents?"
// // //                     message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
// // //                     confirmText="Yes, Overwrite"
// // //                     onClose={() => {
// // //                         setConfirmDocOverwrite(false);
// // //                         executeSave();
// // //                     }}
// // //                     onCancel={() => setConfirmDocOverwrite(false)}
// // //                 />,
// // //                 document.body
// // //             )}

// // //             {showSignatureModal && createPortal(
// // //                 <SignatureSetupModal
// // //                     userUid={targetId}
// // //                     existingSignatureUrl={liveProfile?.signatureUrl}
// // //                     onComplete={() => {
// // //                         setShowSignatureModal(false);
// // //                     }}
// // //                 />,
// // //                 document.body
// // //             )}

// // //             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
// // //                 <ShieldCheck size={22} className="lpv-banner__icon" />
// // //                 <div style={{ flex: 1 }}>
// // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
// // //                         {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
// // //                     </div>
// // //                     <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
// // //                 </div>
// // //             </div>

// // //             <div className="lpv-layout">
// // //                 <div className="lpv-main-stack">

// // //                     <section className="lpv-panel">
// // //                         <div className="lpv-panel__header">
// // //                             <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
// // //                             <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
// // //                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
// // //                             </button>
// // //                         </div>

// // //                         <div className="lpv-profile-header">
// // //                             <div className="lpv-avatar-wrapper">
// // //                                 <div className="lpv-avatar">
// // //                                     {photoPreview ? (
// // //                                         <img
// // //                                             src={photoPreview}
// // //                                             crossOrigin="anonymous"
// // //                                             alt="Profile"
// // //                                             style={{
// // //                                                 objectFit: "cover",
// // //                                                 width: "100%",
// // //                                                 height: "100%"
// // //                                             }}
// // //                                         />
// // //                                     ) : (
// // //                                         <User size={30} color="#94a3b8" />
// // //                                     )}
// // //                                 </div>

// // //                                 {isEditing && (
// // //                                     <label className="lpv-avatar-upload">
// // //                                         <Camera size={16} />
// // //                                         <input
// // //                                             type="file"
// // //                                             accept="image/*"
// // //                                             onChange={handlePhotoSelect}
// // //                                             hidden
// // //                                         />
// // //                                     </label>
// // //                                 )}
// // //                             </div>

// // //                             <div>
// // //                                 <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
// // //                                 <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
// // //                             </div>
// // //                         </div>

// // //                         <div className="lpv-grid-2">
// // //                             <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
// // //                             <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

// // //                             <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
// // //                             <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

// // //                             <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
// // //                             <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
// // //                             <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
// // //                             <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
// // //                             <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
// // //                             <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
// // //                             <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
// // //                         </div>
// // //                     </section>

// // //                     <section className="lpv-panel">
// // //                         <h3 className="lp-section-title"><Briefcase size={16} /> Background Details</h3>
// // //                         <div className="lpv-grid-2">
// // //                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

// // //                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
// // //                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
// // //                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
// // //                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
// // //                             )}
// // //                         </div>
// // //                     </section>

// // //                     {/* ════════════════════════════════════════════════════════════════════════════ */}
// // //                     {/* RESIDENTIAL ADDRESS & MUNICIPALITY PANEL (EXPLICIT DISPLAY)                  */}
// // //                     {/* ════════════════════════════════════════════════════════════════════════════ */}
// // //                     <section className="lpv-panel">
// // //                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
// // //                             <MapPin size={16} /> Residential Address & Municipal Metadata
// // //                         </h3>

// // //                         {isEditing && (
// // //                             <div style={{ marginBottom: '1rem' }}>
// // //                                 <div className="lpv-field__label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
// // //                                     <Globe size={13} /> Address Search (Google Verified)
// // //                                 </div>
// // //                                 <Autocomplete
// // //                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// // //                                     onPlaceSelected={handleAddressSelected}
// // //                                     options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
// // //                                     className="lpv-input"
// // //                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
// // //                                     placeholder="Start typing your street name..."
// // //                                 />
// // //                             </div>
// // //                         )}

// // //                         <div className="lpv-grid-3">
// // //                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
// // //                             <ROField label="City / Suburb" value={displayData.city || d.learnerHomeAddress2} />
// // //                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
// // //                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />

// // //                             {/* EXPLICIT LOCAL MUNICIPALITY & DISTRICT DERIVED READOUTS */}
// // //                             <ROField
// // //                                 label="Local Municipality"
// // //                                 value={selectedStatssaMatch?.local_municipality || (selectedStatssaMatch?.area ? `${selectedStatssaMatch.area} Muni` : 'Auto-derived on selection')}
// // //                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
// // //                             />
// // //                             <ROField
// // //                                 label="District / Metro"
// // //                                 value={selectedStatssaMatch?.district_municipality || selectedStatssaMatch?.district || (selectedStatssaMatch?.town ? `${selectedStatssaMatch.town} Metro` : 'Auto-derived on selection')}
// // //                                 icon={<Building2 size={13} color="var(--mlab-blue)" />}
// // //                             />
// // //                         </div>

// // //                         {/* STATS-SA AREA CODE SELECTOR / DISPLAY */}
// // //                         <div style={{ marginTop: '1rem' }}>
// // //                             <FormSelectWrapper
// // //                                 label="STATS-SA Area Code & Municipality"
// // //                                 value={d.statssaAreaCode || d.statsaaAreaCode}
// // //                                 isEditing={isEditing}
// // //                                 options={statssaOptions}
// // //                                 onChange={(v: string) => update('statssaAreaCode', v)}
// // //                             />
// // //                         </div>

// // //                         {/* NOTICE BANNER FOR PROOF OF ADDRESS MATCHING */}
// // //                         <div style={{ marginTop: '1.25rem', padding: '0.75rem 1rem', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '6px', color: '#713f12', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                             <Info size={16} color="#ca8a04" style={{ flexShrink: 0 }} />
// // //                             <span><strong>Proof of Address Requirement:</strong> Ensure your uploaded Proof of Address document in the Document Vault explicitly matches the residential address listed here.</span>
// // //                         </div>

// // //                         {isEditing ? (
// // //                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
// // //                                     <input
// // //                                         type="checkbox"
// // //                                         checked={displayData.sameAsResidential}
// // //                                         onChange={e => update('sameAsResidential', e.target.checked)}
// // //                                     />
// // //                                     Postal Address is the same as Residential
// // //                                 </label>
// // //                                 {!displayData.sameAsResidential && (
// // //                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
// // //                                         <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
// // //                                         <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
// // //                                     </div>
// // //                                 )}
// // //                             </div>
// // //                         ) : (
// // //                             <>
// // //                                 <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
// // //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
// // //                                     Postal Address
// // //                                     {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
// // //                                 </h4>
// // //                                 <div className="lpv-grid-2">
// // //                                     <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
// // //                                     <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
// // //                                 </div>
// // //                             </>
// // //                         )}

// // //                         {/* Address History Log Renderer */}
// // //                         {liveProfile?.addressHistory && liveProfile.addressHistory.length > 0 && !isEditing && (
// // //                             <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// // //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // //                                     <History size={14} /> Address History Log
// // //                                 </h4>
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // //                                     {liveProfile.addressHistory.map((hAddr: any, idx: number) => (
// // //                                         <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // //                                             <div>
// // //                                                 <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>{hAddr.streetAddress}</div>
// // //                                                 <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hAddr.city} • Code: {hAddr.statssaAreaCode || 'N/A'}</div>
// // //                                             </div>
// // //                                             <div style={{ textAlign: 'right' }}>
// // //                                                 <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hAddr.replacedAt).toLocaleDateString()}</div>
// // //                                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hAddr.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// // //                                             </div>
// // //                                         </div>
// // //                                     ))}
// // //                                 </div>
// // //                             </div>
// // //                         )}
// // //                     </section>

// // //                     <section className="lpv-panel">
// // //                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
// // //                         <div className="lpv-grid-3">
// // //                             <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
// // //                             <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
// // //                             <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
// // //                         </div>
// // //                     </section>

// // //                     {/* SIGNATURE SECTION */}
// // //                     <section className="lpv-panel">
// // //                         <div className="lpv-panel__header">
// // //                             <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
// // //                             <button
// // //                                 className="lpv-edit-btn"
// // //                                 onClick={() => setShowSignatureModal(true)}
// // //                             >
// // //                                 <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
// // //                             </button>
// // //                         </div>
// // //                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
// // //                             {liveProfile?.signatureUrl ? (
// // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
// // //                                     <img
// // //                                         src={liveProfile.signatureUrl}
// // //                                         alt="Learner Signature"
// // //                                         crossOrigin="anonymous"
// // //                                         style={{
// // //                                             height: 'auto',
// // //                                             maxHeight: '120px',
// // //                                             width: '100%',
// // //                                             maxWidth: '400px',
// // //                                             objectFit: 'contain',
// // //                                             mixBlendMode: 'multiply',
// // //                                             filter: 'grayscale(100%) contrast(400%)'
// // //                                         }}
// // //                                     />
// // //                                     <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
// // //                                         Authenticated Learner Signature (Black Ink)
// // //                                     </span>
// // //                                 </div>
// // //                             ) : (
// // //                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
// // //                                     <AlertCircle size={16} /> The learner has not registered their digital signature yet.
// // //                                 </div>
// // //                             )}
// // //                         </div>
// // //                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
// // //                             Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
// // //                         </p>
// // //                     </section>
// // //                 </div>

// // //                 <aside className="lpv-aside">
// // //                     <div className="lpv-qual-card">
// // //                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
// // //                         <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
// // //                         <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
// // //                     </div>

// // //                     <div className="lpv-vault-card">
// // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
// // //                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
// // //                             {isEditing && (
// // //                                 <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
// // //                                     <Plus size={12} /> Add
// // //                                 </button>
// // //                             )}
// // //                         </div>
// // //                         {renderDocumentVault()}
// // //                     </div>

// // //                     {isEditing && (
// // //                         <button className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
// // //                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
// // //                         </button>
// // //                     )}
// // //                 </aside>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // /* --- Field Components --- */

// // // const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
// // //     <div className="lpv-field">
// // //         <div className="lpv-field__label">{icon}{label}</div>
// // //         <div className="lpv-field__value">{value || '—'}</div>
// // //     </div>
// // // );

// // // interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

// // // const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
// // //     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
// // //     return (
// // //         <div className="lpv-field">
// // //             <div className="lpv-field__label">{icon}{label}</div>
// // //             {isEditing ? (
// // //                 type === 'select' ? (
// // //                     <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
// // //                         <option value="">Select...</option>
// // //                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
// // //                     </select>
// // //                 ) : (
// // //                     <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
// // //                 )
// // //             ) : (
// // //                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

// // // const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
// // //     const displayValue = options.find(o => o.value === value)?.label || value;
// // //     return (
// // //         <div className="lpv-field">
// // //             {isEditing ? (
// // //                 <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
// // //             ) : (
// // //                 <>
// // //                     <div className="lpv-field__label">{label}</div>
// // //                     <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // //                 </>
// // //             )}
// // //         </div>
// // //     );
// // // };

// // // const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
// // //     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
// // //         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
// // //         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
// // //     </a>
// // // );

// // // export default LearnerProfileView;



// // // // // src/components/views/LearnerProfileView/LearnerProfileView.tsx

// // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // import { createPortal } from 'react-dom';
// // // // import {
// // // //     User, Phone, MapPin, ShieldCheck,
// // // //     FileText, Edit3, Save, X, Fingerprint,
// // // //     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye, Globe
// // // // } from 'lucide-react';
// // // // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // // import { doc, onSnapshot } from 'firebase/firestore';
// // // // import Autocomplete from "react-google-autocomplete";
// // // // import './LearnerProfileView.css';
// // // // import { storage, db } from '../../../../lib/firebase';
// // // // import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// // // // import { useToast } from '../../../../components/common/Toast/Toast';

// // // // import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// // // // import { fetchStatssaCodes } from '../../../../services/qctoService';
// // // // import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// // // // import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// // // // /* ── STRICT QCTO DICTIONARIES ────────────────────────── */
// // // // const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
// // // // const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// // // // const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// // // // const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
// // // // const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
// // // // const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
// // // // const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
// // // // const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
// // // // const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
// // // // const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
// // // // const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
// // // // const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

// // // // const extractFilename = (url: string) => {
// // // //     if (!url) return 'Saved Document';
// // // //     try {
// // // //         const decoded = decodeURIComponent(url.split('?')[0]);
// // // //         const parts = decoded.split('/');
// // // //         return parts[parts.length - 1];
// // // //     } catch {
// // // //         return 'Saved Document';
// // // //     }
// // // // };

// // // // interface ProfileProps {
// // // //     profile: any;
// // // //     user: any;
// // // //     onUpdate: (id: string, updates: any) => Promise<void>;
// // // // }

// // // // export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
// // // //     const toast = useToast();
// // // //     const [isEditing, setIsEditing] = useState(false);
// // // //     const [saving, setSaving] = useState(false);
// // // //     const [showSignatureModal, setShowSignatureModal] = useState(false);
// // // //     const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

// // // //     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
// // // //     const [formData, setFormData] = useState<any>({});

// // // //     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
// // // //     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
// // // //     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

// // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
// // // //     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

// // // //     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

// // // //     useEffect(() => {
// // // //         const loadCodes = async () => {
// // // //             const codes = await fetchStatssaCodes();
// // // //             setAllStatssaCodes(codes);
// // // //         };
// // // //         loadCodes();
// // // //     }, []);

// // // //     const statssaOptions = useMemo(() => {
// // // //         return allStatssaCodes.map(c => ({
// // // //             value: c.statssa_area_code,
// // // //             label: `${c.statssa_area_code} - ${c.town}`,
// // // //             subLabel: `${c.area} (${c.local_municipality})`
// // // //         }));
// // // //     }, [allStatssaCodes]);

// // // //     useEffect(() => {
// // // //         if (profile) {
// // // //             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
// // // //         }
// // // //     }, [profile]);

// // // //     // 1. REAL-TIME LISTENER
// // // //     useEffect(() => {
// // // //         if (!targetId) return;

// // // //         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
// // // //             if (docSnap.exists()) {
// // // //                 const userData = docSnap.data();

// // // //                 setLiveProfile((currentProfile: any) => {
// // // //                     const merged = {
// // // //                         ...currentProfile,
// // // //                         ...userData,
// // // //                         demographics: currentProfile.demographics || userData.demographics || {},
// // // //                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
// // // //                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
// // // //                         documentHistory: currentProfile.documentHistory || userData.documentHistory || [],
// // // //                         addressHistory: currentProfile.addressHistory || userData.addressHistory || []
// // // //                     };
// // // //                     return merged;
// // // //                 });
// // // //             }
// // // //         });

// // // //         return () => unsubscribe();
// // // //     }, [targetId]);

// // // //     // 2. HYDRATE UI FROM LIVE PROFILE
// // // //     useEffect(() => {
// // // //         if (!isEditing && liveProfile) {
// // // //             const d = liveProfile.demographics || {};

// // // //             const sameAsRes = liveProfile.sameAsResidential !== undefined
// // // //                 ? liveProfile.sameAsResidential
// // // //                 : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

// // // //             const initialLoadData = {
// // // //                 fullName: liveProfile.fullName || '',
// // // //                 email: liveProfile.email || '',
// // // //                 phone: liveProfile.phone || d.learnerPhoneNumber || '',
// // // //                 idNumber: liveProfile.idNumber || '',
// // // //                 sameAsResidential: sameAsRes,

// // // //                 learnerTitle: d.learnerTitle || '',
// // // //                 learnerMiddleName: d.learnerMiddleName || '',
// // // //                 nationalityCode: d.nationalityCode || '',
// // // //                 immigrantStatus: d.immigrantStatus || '03',
// // // //                 alternativeIdType: d.alternativeIdType || '533',

// // // //                 streetAddress: d.learnerHomeAddress1 || '',
// // // //                 city: d.learnerHomeAddress2 || '',
// // // //                 provinceCode: d.provinceCode || '',
// // // //                 postalCode: d.learnerHomeAddressPostalCode || '',
// // // //                 postalAddress: d.learnerPostalAddress1 || '',
// // // //                 customPostalCode: d.learnerPostalAddressPostCode || '',
// // // //                 statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
// // // //                 lat: d.lat || 0,
// // // //                 lng: d.lng || 0,

// // // //                 flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
// // // //                 equityCode: d.equityCode || '',
// // // //                 genderCode: d.genderCode || '',
// // // //                 homeLanguageCode: d.homeLanguageCode || '',
// // // //                 citizenStatusCode: d.citizenResidentStatusCode || '',
// // // //                 socioeconomicCode: d.socioeconomicStatusCode || '',
// // // //                 disabilityCode: d.disabilityStatusCode || 'N',
// // // //                 disabilityRating: d.disabilityRating || '',

// // // //                 nokName: liveProfile.nextOfKin?.name || '',
// // // //                 nokRelationship: liveProfile.nextOfKin?.relationship || '',
// // // //                 nokPhone: liveProfile.nextOfKin?.phone || '',
// // // //                 profilePhotoUrl: liveProfile.profilePhotoUrl || ''
// // // //             };

// // // //             setFormData(initialLoadData);
// // // //             setPhotoPreview(liveProfile.profilePhotoUrl || null);

// // // //             const legacyDocs = liveProfile.documents || {};
// // // //             const rawUploadedDocs = liveProfile.uploadedDocuments;
// // // //             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

// // // //             const currentDocs: DynamicDocument[] = [
// // // //                 { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
// // // //                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
// // // //                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
// // // //             ];

// // // //             uploadedDocsArray.forEach((savedDoc: any) => {
// // // //                 if (!['id', 'qual', 'cv'].includes(savedDoc.id)) {
// // // //                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
// // // //                 }
// // // //             });

// // // //             setDocsList(currentDocs);
// // // //         }
// // // //     }, [liveProfile, isEditing]);

// // // //     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // //         if (e.target.files && e.target.files[0]) {
// // // //             const file = e.target.files[0];
// // // //             setProfilePhoto(file);
// // // //             setPhotoPreview(URL.createObjectURL(file));
// // // //         }
// // // //     };

// // // //     // ════════════════════════════════════════════════════════════════════════════
// // // //     // MULTI-TIERED GOOGLE PLACES PREPOPULATION (TOWN, SUBURB, MUNICIPALITY, DISTRICT)
// // // //     // ════════════════════════════════════════════════════════════════════════════
// // // //     const handleAddressSelected = (place: any) => {
// // // //         const components = place.address_components;
// // // //         if (!components) return;

// // // //         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
// // // //         const rawProv = getComp("administrative_area_level_1");
// // // //         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

// // // //         const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
// // // //         const townName = getComp("locality") || suburb;
// // // //         const localMuni = getComp("administrative_area_level_3");
// // // //         const districtMuni = getComp("administrative_area_level_2");
// // // //         const postal = getComp("postal_code");

// // // //         const buildingName = place.name || "";
// // // //         const formatted = place.formatted_address || "";
// // // //         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

// // // //         const searchTerms = [suburb, townName, localMuni, districtMuni]
// // // //             .map(s => s.toLowerCase().trim())
// // // //             .filter(Boolean);

// // // //         let match = null;

// // // //         if (allStatssaCodes.length > 0 && searchTerms.length > 0) {
// // // //             // Tier 1: Exact matches against town, area, or local_municipality
// // // //             match = allStatssaCodes.find(c => {
// // // //                 const cTown = (c.town || '').toLowerCase();
// // // //                 const cArea = (c.area || '').toLowerCase();
// // // //                 const cMuni = (c.local_municipality || '').toLowerCase();

// // // //                 return searchTerms.some(term =>
// // // //                     term && (cTown === term || cArea === term || cMuni === term)
// // // //                 );
// // // //             });

// // // //             // Tier 2: Partial/substring matches if no exact match was found
// // // //             if (!match) {
// // // //                 match = allStatssaCodes.find(c => {
// // // //                     const cTown = (c.town || '').toLowerCase();
// // // //                     const cArea = (c.area || '').toLowerCase();
// // // //                     const cMuni = (c.local_municipality || '').toLowerCase();

// // // //                     return searchTerms.some(term =>
// // // //                         term && (cTown.includes(term) || term.includes(cTown) || cArea.includes(term) || cMuni.includes(term))
// // // //                     );
// // // //                 });
// // // //             }
// // // //         }

// // // //         let extractedLat = 0;
// // // //         let extractedLng = 0;

// // // //         if (place.geometry && place.geometry.location) {
// // // //             extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// // // //             extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// // // //         }

// // // //         setFormData((prev: any) => ({
// // // //             ...prev,
// // // //             streetAddress: streetLine,
// // // //             city: townName,
// // // //             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
// // // //             postalCode: postal,
// // // //             statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
// // // //             lat: extractedLat,
// // // //             lng: extractedLng
// // // //         }));
// // // //     };

// // // //     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
// // // //     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
// // // //     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

// // // //     const handleSaveClick = () => {
// // // //         const isOverwriting = docsList.some(d => d.file && d.url);

// // // //         if (isOverwriting) {
// // // //             setConfirmDocOverwrite(true);
// // // //         } else {
// // // //             executeSave();
// // // //         }
// // // //     };

// // // //     const executeSave = async () => {
// // // //         if (!targetId) return;

// // // //         setSaving(true);

// // // //         try {
// // // //             let finalPhotoUrl = formData.profilePhotoUrl;
// // // //             if (profilePhoto) {
// // // //                 const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
// // // //                 const snapshot = await uploadBytes(storageRef, profilePhoto);
// // // //                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
// // // //             }

// // // //             const finalUploadedDocs = [];
// // // //             const newHistory = [...(liveProfile.documentHistory || [])];

// // // //             for (const docItem of docsList) {
// // // //                 let finalUrl = docItem.url;

// // // //                 if (docItem.file) {
// // // //                     if (docItem.url) {
// // // //                         newHistory.push({
// // // //                             id: docItem.id,
// // // //                             name: docItem.name || 'Legacy Document',
// // // //                             url: docItem.url,
// // // //                             replacedAt: new Date().toISOString()
// // // //                         });
// // // //                     }

// // // //                     const ext = docItem.file.name.split('.').pop();
// // // //                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
// // // //                     const snapshot = await uploadBytes(storageRef, docItem.file);
// // // //                     finalUrl = await getDownloadURL(snapshot.ref);
// // // //                 }

// // // //                 if (finalUrl) {
// // // //                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
// // // //                 }
// // // //             }

// // // //             // ════════════════════════════════════════════════════════════════════════════
// // // //             // ADDRESS HISTORY AUDIT TRAIL LOGGING
// // // //             // ════════════════════════════════════════════════════════════════════════════
// // // //             const oldStreet = liveProfile?.demographics?.learnerHomeAddress1 || '';
// // // //             const newStreet = formData.streetAddress || '';
// // // //             const newAddressHistory = [...(liveProfile?.addressHistory || [])];

// // // //             if (oldStreet && oldStreet.trim() !== newStreet.trim()) {
// // // //                 newAddressHistory.push({
// // // //                     streetAddress: oldStreet,
// // // //                     city: liveProfile?.demographics?.learnerHomeAddress2 || '',
// // // //                     provinceCode: liveProfile?.demographics?.provinceCode || '',
// // // //                     postalCode: liveProfile?.demographics?.learnerHomeAddressPostalCode || '',
// // // //                     statssaAreaCode: liveProfile?.demographics?.statssaAreaCode || liveProfile?.demographics?.statsaaAreaCode || '',
// // // //                     lat: liveProfile?.demographics?.lat || 0,
// // // //                     lng: liveProfile?.demographics?.lng || 0,
// // // //                     replacedAt: new Date().toISOString()
// // // //                 });
// // // //             }

// // // //             const updatedData = {
// // // //                 fullName: formData.fullName,
// // // //                 email: formData.email,
// // // //                 phone: formData.phone,
// // // //                 profilePhotoUrl: finalPhotoUrl,
// // // //                 uploadedDocuments: finalUploadedDocs,
// // // //                 documentHistory: newHistory,
// // // //                 addressHistory: newAddressHistory,
// // // //                 demographics: {
// // // //                     ...(liveProfile.demographics || {}),
// // // //                     learnerPhoneNumber: formData.phone,
// // // //                     learnerTitle: formData.learnerTitle,
// // // //                     learnerMiddleName: formData.learnerMiddleName,
// // // //                     alternativeIdType: formData.alternativeIdType,
// // // //                     learnerHomeAddress1: formData.streetAddress,
// // // //                     learnerHomeAddress2: formData.city,
// // // //                     provinceCode: formData.provinceCode,
// // // //                     learnerHomeAddressPostalCode: formData.postalCode,
// // // //                     learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
// // // //                     learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
// // // //                     equityCode: formData.equityCode,
// // // //                     genderCode: formData.genderCode,
// // // //                     homeLanguageCode: formData.homeLanguageCode,
// // // //                     citizenResidentStatusCode: formData.citizenStatusCode,
// // // //                     nationalityCode: formData.nationalityCode,
// // // //                     immigrantStatus: formData.immigrantStatus,
// // // //                     flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
// // // //                     socioeconomicStatusCode: formData.socioeconomicCode,
// // // //                     disabilityStatusCode: formData.disabilityCode,
// // // //                     disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
// // // //                     statssaAreaCode: formData.statssaAreaCode,
// // // //                     statsaaAreaCode: formData.statssaAreaCode,
// // // //                     lat: formData.lat,
// // // //                     lng: formData.lng
// // // //                 },
// // // //                 nextOfKin: {
// // // //                     name: formData.nokName,
// // // //                     relationship: formData.nokRelationship,
// // // //                     phone: formData.nokPhone
// // // //                 },
// // // //                 sameAsResidential: formData.sameAsResidential,
// // // //                 updatedAt: new Date().toISOString()
// // // //             };

// // // //             await onUpdate(profile.id || targetId, updatedData);

// // // //             setIsEditing(false);
// // // //             setProfilePhoto(null);

// // // //             setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
// // // //         } catch (error) {
// // // //             console.error('❌ Update failed', error);
// // // //             setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
// // // //         } finally {
// // // //             setSaving(false);
// // // //         }
// // // //     };

// // // //     const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
// // // //     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

// // // //     const handleCancel = () => {
// // // //         setProfilePhoto(null);
// // // //         setPhotoPreview(liveProfile?.profilePhotoUrl || null);
// // // //         setIsEditing(false);
// // // //     };

// // // //     const renderDocumentVault = () => {
// // // //         return (
// // // //             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // // //                 {isEditing ? (
// // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
// // // //                         {docsList.map((docItem) => (
// // // //                             <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // //                                 <DynamicDocUpload
// // // //                                     document={docItem}
// // // //                                     onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
// // // //                                     onRemove={() => handleRemoveDocument(docItem.id)}
// // // //                                 />
// // // //                                 {docItem.url && !docItem.file && (
// // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // // //                                         <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // // //                                             <FileText size={14} color="var(--mlab-blue)" />
// // // //                                             <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
// // // //                                         </span>
// // // //                                         <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
// // // //                                             <Eye size={14} /> View File
// // // //                                         </a>
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         ))}
// // // //                     </div>
// // // //                 ) : (
// // // //                     <>
// // // //                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
// // // //                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
// // // //                     </>
// // // //                 )}

// // // //                 {/* Document History Log Renderer */}
// // // //                 {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
// // // //                     <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// // // //                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                             <History size={14} /> Document History Log
// // // //                         </h4>
// // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                             {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
// // // //                                 <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                     <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
// // // //                                         <FileText size={14} /> {hDoc.name || 'Archived Document'}
// // // //                                     </a>
// // // //                                     <div style={{ textAlign: 'right' }}>
// // // //                                         <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
// // // //                                         <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// // // //                                     </div>
// // // //                                 </div>
// // // //                             ))}
// // // //                         </div>
// // // //                     </div>
// // // //                 )}
// // // //             </div>
// // // //         );
// // // //     };

// // // //     const displayData = isEditing ? formData : liveProfile;
// // // //     const isVerified = liveProfile?.profileCompleted === true;
// // // //     const isPostalSame = displayData?.sameAsResidential !== false;
// // // //     const d = isEditing ? formData : (liveProfile?.demographics || {});

// // // //     return (
// // // //         <div className="lpv-wrapper animate-fade-in">
// // // //             {modalConfig.isOpen && createPortal(
// // // //                 <StatusModal
// // // //                     type={modalConfig.type}
// // // //                     title={modalConfig.title}
// // // //                     message={modalConfig.message}
// // // //                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
// // // //                 />,
// // // //                 document.body
// // // //             )}

// // // //             {confirmDocOverwrite && createPortal(
// // // //                 <StatusModal
// // // //                     type="warning"
// // // //                     title="Overwrite Existing Documents?"
// // // //                     message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
// // // //                     confirmText="Yes, Overwrite"
// // // //                     onClose={() => {
// // // //                         setConfirmDocOverwrite(false);
// // // //                         executeSave();
// // // //                     }}
// // // //                     onCancel={() => setConfirmDocOverwrite(false)}
// // // //                 />,
// // // //                 document.body
// // // //             )}

// // // //             {showSignatureModal && createPortal(
// // // //                 <SignatureSetupModal
// // // //                     userUid={targetId}
// // // //                     existingSignatureUrl={liveProfile?.signatureUrl}
// // // //                     onComplete={() => {
// // // //                         setShowSignatureModal(false);
// // // //                     }}
// // // //                 />,
// // // //                 document.body
// // // //             )}

// // // //             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
// // // //                 <ShieldCheck size={22} className="lpv-banner__icon" />
// // // //                 <div style={{ flex: 1 }}>
// // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
// // // //                         {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
// // // //                     </div>
// // // //                     <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
// // // //                 </div>
// // // //             </div>

// // // //             <div className="lpv-layout">
// // // //                 <div className="lpv-main-stack">

// // // //                     <section className="lpv-panel">
// // // //                         <div className="lpv-panel__header">
// // // //                             <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
// // // //                             <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
// // // //                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
// // // //                             </button>
// // // //                         </div>

// // // //                         <div className="lpv-profile-header">
// // // //                             <div className="lpv-avatar-wrapper">
// // // //                                 <div className="lpv-avatar">
// // // //                                     {photoPreview ? (
// // // //                                         <img
// // // //                                             src={photoPreview}
// // // //                                             crossOrigin="anonymous"
// // // //                                             alt="Profile"
// // // //                                             style={{
// // // //                                                 objectFit: "cover",
// // // //                                                 width: "100%",
// // // //                                                 height: "100%"
// // // //                                             }}
// // // //                                         />
// // // //                                     ) : (
// // // //                                         <User size={30} color="#94a3b8" />
// // // //                                     )}
// // // //                                 </div>

// // // //                                 {isEditing && (
// // // //                                     <label className="lpv-avatar-upload">
// // // //                                         <Camera size={16} />
// // // //                                         <input
// // // //                                             type="file"
// // // //                                             accept="image/*"
// // // //                                             onChange={handlePhotoSelect}
// // // //                                             hidden
// // // //                                         />
// // // //                                     </label>
// // // //                                 )}
// // // //                             </div>

// // // //                             <div>
// // // //                                 <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
// // // //                                 <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
// // // //                             </div>
// // // //                         </div>

// // // //                         <div className="lpv-grid-2">
// // // //                             <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
// // // //                             <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

// // // //                             <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
// // // //                             <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

// // // //                             <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
// // // //                             <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
// // // //                             <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
// // // //                             <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
// // // //                             <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
// // // //                             <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
// // // //                             <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
// // // //                         </div>
// // // //                     </section>

// // // //                     <section className="lpv-panel">
// // // //                         <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
// // // //                         <div className="lpv-grid-2">

// // // //                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

// // // //                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
// // // //                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
// // // //                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
// // // //                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
// // // //                             )}
// // // //                             <div style={{ gridColumn: '1 / -1' }}>
// // // //                                 <FormSelectWrapper
// // // //                                     label="STATS-SA Area Code"
// // // //                                     value={d.statssaAreaCode || d.statsaaAreaCode}
// // // //                                     isEditing={isEditing}
// // // //                                     options={statssaOptions}
// // // //                                     onChange={(v: string) => update('statssaAreaCode', v)}
// // // //                                 />
// // // //                             </div>
// // // //                         </div>
// // // //                     </section>

// // // //                     <section className="lpv-panel">
// // // //                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
// // // //                             <MapPin size={16} /> Residential Address
// // // //                         </h3>

// // // //                         {isEditing && (
// // // //                             <div style={{ marginBottom: '1rem' }}>
// // // //                                 <div className="lpv-field__label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
// // // //                                     <Globe size={13} /> Address Search (Google Verified)
// // // //                                 </div>
// // // //                                 <Autocomplete
// // // //                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// // // //                                     onPlaceSelected={handleAddressSelected}
// // // //                                     options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
// // // //                                     className="lpv-input"
// // // //                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
// // // //                                     placeholder="Start typing your street name..."
// // // //                                 />
// // // //                             </div>
// // // //                         )}

// // // //                         <div className="lpv-grid-3">
// // // //                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
// // // //                             <ROField label="City" value={displayData.city || d.learnerHomeAddress2} />
// // // //                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
// // // //                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />
// // // //                         </div>

// // // //                         {isEditing ? (
// // // //                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// // // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
// // // //                                     <input
// // // //                                         type="checkbox"
// // // //                                         checked={displayData.sameAsResidential}
// // // //                                         onChange={e => update('sameAsResidential', e.target.checked)}
// // // //                                     />
// // // //                                     Postal Address is the same as Residential
// // // //                                 </label>
// // // //                                 {!displayData.sameAsResidential && (
// // // //                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
// // // //                                         <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
// // // //                                         <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
// // // //                                     </div>
// // // //                                 )}
// // // //                             </div>
// // // //                         ) : (
// // // //                             <>
// // // //                                 <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
// // // //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
// // // //                                     Postal Address
// // // //                                     {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
// // // //                                 </h4>
// // // //                                 <div className="lpv-grid-2">
// // // //                                     <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
// // // //                                     <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
// // // //                                 </div>
// // // //                             </>
// // // //                         )}

// // // //                         {/* Address History Log Renderer */}
// // // //                         {liveProfile?.addressHistory && liveProfile.addressHistory.length > 0 && !isEditing && (
// // // //                             <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// // // //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // //                                     <History size={14} /> Address History Log
// // // //                                 </h4>
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // //                                     {liveProfile.addressHistory.map((hAddr: any, idx: number) => (
// // // //                                         <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // //                                             <div>
// // // //                                                 <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#0f172a' }}>{hAddr.streetAddress}</div>
// // // //                                                 <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{hAddr.city} • Code: {hAddr.statssaAreaCode || 'N/A'}</div>
// // // //                                             </div>
// // // //                                             <div style={{ textAlign: 'right' }}>
// // // //                                                 <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hAddr.replacedAt).toLocaleDateString()}</div>
// // // //                                                 <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hAddr.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// // // //                                             </div>
// // // //                                         </div>
// // // //                                     ))}
// // // //                                 </div>
// // // //                             </div>
// // // //                         )}
// // // //                     </section>

// // // //                     <section className="lpv-panel">
// // // //                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
// // // //                         <div className="lpv-grid-3">
// // // //                             <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
// // // //                             <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
// // // //                             <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
// // // //                         </div>
// // // //                     </section>

// // // //                     {/* SIGNATURE SECTION */}
// // // //                     <section className="lpv-panel">
// // // //                         <div className="lpv-panel__header">
// // // //                             <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
// // // //                             <button
// // // //                                 className="lpv-edit-btn"
// // // //                                 onClick={() => setShowSignatureModal(true)}
// // // //                             >
// // // //                                 <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
// // // //                             </button>
// // // //                         </div>
// // // //                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
// // // //                             {liveProfile?.signatureUrl ? (
// // // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
// // // //                                     <img
// // // //                                         src={liveProfile.signatureUrl}
// // // //                                         alt="Learner Signature"
// // // //                                         crossOrigin="anonymous"
// // // //                                         style={{
// // // //                                             height: 'auto',
// // // //                                             maxHeight: '120px',
// // // //                                             width: '100%',
// // // //                                             maxWidth: '400px',
// // // //                                             objectFit: 'contain',
// // // //                                             mixBlendMode: 'multiply',
// // // //                                             filter: 'grayscale(100%) contrast(400%)'
// // // //                                         }}
// // // //                                     />
// // // //                                     <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
// // // //                                         Authenticated Learner Signature (Black Ink)
// // // //                                     </span>
// // // //                                 </div>
// // // //                             ) : (
// // // //                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
// // // //                                     <AlertCircle size={16} /> The learner has not registered their digital signature yet.
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
// // // //                             Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
// // // //                         </p>
// // // //                     </section>
// // // //                 </div>

// // // //                 <aside className="lpv-aside">
// // // //                     <div className="lpv-qual-card">
// // // //                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
// // // //                         <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
// // // //                         <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
// // // //                     </div>

// // // //                     <div className="lpv-vault-card">
// // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
// // // //                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
// // // //                             {isEditing && (
// // // //                                 <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
// // // //                                     <Plus size={12} /> Add
// // // //                                 </button>
// // // //                             )}
// // // //                         </div>
// // // //                         {renderDocumentVault()}
// // // //                     </div>

// // // //                     {isEditing && (
// // // //                         <button className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
// // // //                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
// // // //                         </button>
// // // //                     )}
// // // //                 </aside>
// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };

// // // // /* --- Field Components --- */

// // // // const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
// // // //     <div className="lpv-field">
// // // //         <div className="lpv-field__label">{icon}{label}</div>
// // // //         <div className="lpv-field__value">{value || '—'}</div>
// // // //     </div>
// // // // );

// // // // interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

// // // // const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
// // // //     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
// // // //     return (
// // // //         <div className="lpv-field">
// // // //             <div className="lpv-field__label">{icon}{label}</div>
// // // //             {isEditing ? (
// // // //                 type === 'select' ? (
// // // //                     <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
// // // //                         <option value="">Select...</option>
// // // //                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
// // // //                     </select>
// // // //                 ) : (
// // // //                     <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
// // // //                 )
// // // //             ) : (
// // // //                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

// // // // const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
// // // //     const displayValue = options.find(o => o.value === value)?.label || value;
// // // //     return (
// // // //         <div className="lpv-field">
// // // //             {isEditing ? (
// // // //                 <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
// // // //             ) : (
// // // //                 <>
// // // //                     <div className="lpv-field__label">{label}</div>
// // // //                     <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // // //                 </>
// // // //             )}
// // // //         </div>
// // // //     );
// // // // };

// // // // const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
// // // //     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
// // // //         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
// // // //         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
// // // //     </a>
// // // // );

// // // // export default LearnerProfileView;



// // // // // // src/components/views/LearnerProfileView/LearnerProfileView.tsx

// // // // // import React, { useState, useEffect, useMemo } from 'react';
// // // // // import { createPortal } from 'react-dom';
// // // // // import {
// // // // //     User, Phone, MapPin, ShieldCheck,
// // // // //     FileText, Edit3, Save, X, Fingerprint,
// // // // //     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool, History, Eye
// // // // // } from 'lucide-react';
// // // // // import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // // // // import { doc, onSnapshot } from 'firebase/firestore';
// // // // // import Autocomplete from "react-google-autocomplete";
// // // // // import './LearnerProfileView.css';
// // // // // import { storage, db } from '../../../../lib/firebase';
// // // // // import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// // // // // import { useToast } from '../../../../components/common/Toast/Toast';

// // // // // import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// // // // // import { fetchStatssaCodes } from '../../../../services/qctoService';
// // // // // import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// // // // // import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// // // // // /* ── STRICT QCTO DICTIONARIES ────────────────────────── */
// // // // // const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }];
// // // // // const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// // // // // const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// // // // // const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }];
// // // // // const QCTO_NATIONALITY = [{ label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" }, { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" }, { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" }, { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" }, { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" }, { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" }, { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" }, { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" }, { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }];
// // // // // const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" }, { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" }, { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }];
// // // // // const QCTO_IMMIGRANT = [{ label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }];
// // // // // const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }, { label: "Disabled but Unspecified", value: "09" }];
// // // // // const QCTO_DISABILITY_RATING = [{ label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" }, { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" }, { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" }, { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }];
// // // // // const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }];
// // // // // const QCTO_TITLES = [{ label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" }, { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }];
// // // // // const QCTO_ALT_ID_TYPE = [{ label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" }, { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" }, { label: "540 - Birth Certificate", value: "540" }];

// // // // // // 🚀 NEW HELPER: Extracts the readable filename directly from the Firebase Storage URL
// // // // // const extractFilename = (url: string) => {
// // // // //     if (!url) return 'Saved Document';
// // // // //     try {
// // // // //         const decoded = decodeURIComponent(url.split('?')[0]);
// // // // //         const parts = decoded.split('/');
// // // // //         return parts[parts.length - 1]; // Returns e.g. "id_1776426375978.jpg"
// // // // //     } catch {
// // // // //         return 'Saved Document';
// // // // //     }
// // // // // };

// // // // // interface ProfileProps {
// // // // //     profile: any;
// // // // //     user: any;
// // // // //     onUpdate: (id: string, updates: any) => Promise<void>;
// // // // // }

// // // // // export const LearnerProfileView: React.FC<ProfileProps> = ({ profile, user, onUpdate }) => {
// // // // //     const toast = useToast();
// // // // //     const [isEditing, setIsEditing] = useState(false);
// // // // //     const [saving, setSaving] = useState(false);
// // // // //     const [showSignatureModal, setShowSignatureModal] = useState(false);
// // // // //     const [confirmDocOverwrite, setConfirmDocOverwrite] = useState(false);

// // // // //     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
// // // // //     const [formData, setFormData] = useState<any>({});

// // // // //     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
// // // // //     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
// // // // //     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

// // // // //     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
// // // // //     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

// // // // //     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

// // // // //     useEffect(() => {
// // // // //         const loadCodes = async () => {
// // // // //             const codes = await fetchStatssaCodes();
// // // // //             setAllStatssaCodes(codes);
// // // // //         };
// // // // //         loadCodes();
// // // // //     }, []);

// // // // //     const statssaOptions = useMemo(() => {
// // // // //         return allStatssaCodes.map(c => ({
// // // // //             value: c.statssa_area_code,
// // // // //             label: `${c.statssa_area_code} - ${c.town}`,
// // // // //             subLabel: `${c.area} (${c.local_municipality})`
// // // // //         }));
// // // // //     }, [allStatssaCodes]);

// // // // //     // Push parent profile updates into liveProfile
// // // // //     useEffect(() => {
// // // // //         if (profile) {
// // // // //             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
// // // // //         }
// // // // //     }, [profile]);

// // // // //     // 1. REAL-TIME LISTENER for the "users" collection
// // // // //     useEffect(() => {
// // // // //         if (!targetId) return;

// // // // //         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
// // // // //             if (docSnap.exists()) {
// // // // //                 const userData = docSnap.data();

// // // // //                 setLiveProfile((currentProfile: any) => {
// // // // //                     const merged = {
// // // // //                         ...currentProfile,
// // // // //                         ...userData,
// // // // //                         demographics: currentProfile.demographics || userData.demographics || {},
// // // // //                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
// // // // //                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || [],
// // // // //                         documentHistory: currentProfile.documentHistory || userData.documentHistory || []
// // // // //                     };
// // // // //                     return merged;
// // // // //                 });
// // // // //             }
// // // // //         });

// // // // //         return () => unsubscribe();
// // // // //     }, [targetId]);


// // // // //     // 2. HYDRATE UI FROM LIVE PROFILE
// // // // //     useEffect(() => {
// // // // //         if (!isEditing && liveProfile) {
// // // // //             const d = liveProfile.demographics || {};

// // // // //             const sameAsRes = liveProfile.sameAsResidential !== undefined
// // // // //                 ? liveProfile.sameAsResidential
// // // // //                 : (d.learnerPostalAddress1 === d.learnerHomeAddress1 || !d.learnerPostalAddress1);

// // // // //             const initialLoadData = {
// // // // //                 fullName: liveProfile.fullName || '',
// // // // //                 email: liveProfile.email || '',
// // // // //                 phone: liveProfile.phone || d.learnerPhoneNumber || '',
// // // // //                 idNumber: liveProfile.idNumber || '',
// // // // //                 sameAsResidential: sameAsRes,

// // // // //                 learnerTitle: d.learnerTitle || '',
// // // // //                 learnerMiddleName: d.learnerMiddleName || '',
// // // // //                 nationalityCode: d.nationalityCode || '',
// // // // //                 immigrantStatus: d.immigrantStatus || '03',
// // // // //                 alternativeIdType: d.alternativeIdType || '533',

// // // // //                 streetAddress: d.learnerHomeAddress1 || '',
// // // // //                 city: d.learnerHomeAddress2 || '',
// // // // //                 provinceCode: d.provinceCode || '',
// // // // //                 postalCode: d.learnerHomeAddressPostalCode || '',
// // // // //                 postalAddress: d.learnerPostalAddress1 || '',
// // // // //                 customPostalCode: d.learnerPostalAddressPostCode || '',
// // // // //                 statssaAreaCode: d.statsaaAreaCode || d.statssaAreaCode || '',
// // // // //                 lat: d.lat || 0,
// // // // //                 lng: d.lng || 0,

// // // // //                 flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',
// // // // //                 equityCode: d.equityCode || '',
// // // // //                 genderCode: d.genderCode || '',
// // // // //                 homeLanguageCode: d.homeLanguageCode || '',
// // // // //                 citizenStatusCode: d.citizenResidentStatusCode || '',
// // // // //                 socioeconomicCode: d.socioeconomicStatusCode || '',
// // // // //                 disabilityCode: d.disabilityStatusCode || 'N',
// // // // //                 disabilityRating: d.disabilityRating || '',

// // // // //                 nokName: liveProfile.nextOfKin?.name || '',
// // // // //                 nokRelationship: liveProfile.nextOfKin?.relationship || '',
// // // // //                 nokPhone: liveProfile.nextOfKin?.phone || '',
// // // // //                 profilePhotoUrl: liveProfile.profilePhotoUrl || ''
// // // // //             };

// // // // //             setFormData(initialLoadData);
// // // // //             setPhotoPreview(liveProfile.profilePhotoUrl || null);

// // // // //             const legacyDocs = liveProfile.documents || {};
// // // // //             const rawUploadedDocs = liveProfile.uploadedDocuments;
// // // // //             const uploadedDocsArray = Array.isArray(rawUploadedDocs) ? rawUploadedDocs : [];

// // // // //             const currentDocs: DynamicDocument[] = [
// // // // //                 { id: 'id', name: 'Certified ID Copy', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'id')?.url || legacyDocs.idUrl || '', isFixed: true, isRequired: true },
// // // // //                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
// // // // //                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
// // // // //             ];

// // // // //             uploadedDocsArray.forEach((savedDoc: any) => {
// // // // //                 if (!['id', 'qual', 'cv'].includes(savedDoc.id)) {
// // // // //                     currentDocs.push({ id: savedDoc.id, name: savedDoc.name, file: null, url: savedDoc.url, isFixed: false, isRequired: false });
// // // // //                 }
// // // // //             });

// // // // //             setDocsList(currentDocs);
// // // // //         }
// // // // //     }, [liveProfile, isEditing]);

// // // // //     const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
// // // // //         if (e.target.files && e.target.files[0]) {
// // // // //             const file = e.target.files[0];
// // // // //             setProfilePhoto(file);
// // // // //             setPhotoPreview(URL.createObjectURL(file));
// // // // //         }
// // // // //     };

// // // // //     const handleAddressSelected = (place: any) => {
// // // // //         const components = place.address_components;
// // // // //         if (!components) return;

// // // // //         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
// // // // //         const rawProv = getComp("administrative_area_level_1");
// // // // //         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

// // // // //         const postal = getComp("postal_code");
// // // // //         const townName = getComp("locality") || getComp("sublocality_level_1");

// // // // //         const buildingName = place.name || "";
// // // // //         const formatted = place.formatted_address || "";
// // // // //         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

// // // // //         const match = allStatssaCodes.find(c => c.town.toLowerCase() === townName.toLowerCase());

// // // // //         let extractedLat = 0;
// // // // //         let extractedLng = 0;

// // // // //         if (place.geometry && place.geometry.location) {
// // // // //             extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
// // // // //             extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
// // // // //         }

// // // // //         setFormData((prev: any) => ({
// // // // //             ...prev,
// // // // //             streetAddress: streetLine,
// // // // //             city: townName,
// // // // //             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
// // // // //             postalCode: postal,
// // // // //             statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
// // // // //             lat: extractedLat,
// // // // //             lng: extractedLng
// // // // //         }));
// // // // //     };

// // // // //     const openInMaps = () => {
// // // // //         if (!formData.lat || formData.lat === 0) return;
// // // // //         window.open(`http://googleusercontent.com/maps.google.com/?q=${formData.lat},${formData.lng}`, '_blank');
// // // // //     };

// // // // //     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
// // // // //     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
// // // // //     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

// // // // //     const handleSaveClick = () => {
// // // // //         // If they selected a new file but an existing URL is already in the database, it's an overwrite!
// // // // //         const isOverwriting = docsList.some(d => d.file && d.url);

// // // // //         if (isOverwriting) {
// // // // //             setConfirmDocOverwrite(true);
// // // // //         } else {
// // // // //             executeSave();
// // // // //         }
// // // // //     };

// // // // //     const executeSave = async () => {
// // // // //         if (!targetId) return;

// // // // //         setSaving(true);

// // // // //         try {
// // // // //             let finalPhotoUrl = formData.profilePhotoUrl;
// // // // //             if (profilePhoto) {
// // // // //                 const storageRef = ref(storage, `learners/${targetId}/profile_${Date.now()}`);
// // // // //                 const snapshot = await uploadBytes(storageRef, profilePhoto);
// // // // //                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
// // // // //             }

// // // // //             const finalUploadedDocs = [];
// // // // //             const newHistory = [...(liveProfile.documentHistory || [])];

// // // // //             for (const docItem of docsList) {
// // // // //                 let finalUrl = docItem.url;

// // // // //                 if (docItem.file) {
// // // // //                     // Archive the old document before overwriting
// // // // //                     if (docItem.url) {
// // // // //                         newHistory.push({
// // // // //                             id: docItem.id,
// // // // //                             name: docItem.name || 'Legacy Document',
// // // // //                             url: docItem.url,
// // // // //                             replacedAt: new Date().toISOString()
// // // // //                         });
// // // // //                     }

// // // // //                     const ext = docItem.file.name.split('.').pop();
// // // // //                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
// // // // //                     const snapshot = await uploadBytes(storageRef, docItem.file);
// // // // //                     finalUrl = await getDownloadURL(snapshot.ref);
// // // // //                 }

// // // // //                 if (finalUrl) {
// // // // //                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
// // // // //                 }
// // // // //             }

// // // // //             const updatedData = {
// // // // //                 fullName: formData.fullName,
// // // // //                 email: formData.email,
// // // // //                 phone: formData.phone,
// // // // //                 profilePhotoUrl: finalPhotoUrl,
// // // // //                 uploadedDocuments: finalUploadedDocs,
// // // // //                 documentHistory: newHistory,
// // // // //                 demographics: {
// // // // //                     ...(liveProfile.demographics || {}),
// // // // //                     learnerPhoneNumber: formData.phone,
// // // // //                     learnerTitle: formData.learnerTitle,
// // // // //                     learnerMiddleName: formData.learnerMiddleName,
// // // // //                     alternativeIdType: formData.alternativeIdType,
// // // // //                     learnerHomeAddress1: formData.streetAddress,
// // // // //                     learnerHomeAddress2: formData.city,
// // // // //                     provinceCode: formData.provinceCode,
// // // // //                     learnerHomeAddressPostalCode: formData.postalCode,
// // // // //                     learnerPostalAddressPostCode: formData.sameAsResidential ? formData.postalCode : formData.customPostalCode,
// // // // //                     learnerPostalAddress1: formData.sameAsResidential ? formData.streetAddress : formData.postalAddress,
// // // // //                     equityCode: formData.equityCode,
// // // // //                     genderCode: formData.genderCode,
// // // // //                     homeLanguageCode: formData.homeLanguageCode,
// // // // //                     citizenResidentStatusCode: formData.citizenStatusCode,
// // // // //                     nationalityCode: formData.nationalityCode,
// // // // //                     immigrantStatus: formData.immigrantStatus,
// // // // //                     flcStatementOfResultNumber: formData.flcStatementOfResultNumber,
// // // // //                     socioeconomicStatusCode: formData.socioeconomicCode,
// // // // //                     disabilityStatusCode: formData.disabilityCode,
// // // // //                     disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
// // // // //                     statssaAreaCode: formData.statssaAreaCode,
// // // // //                     statsaaAreaCode: formData.statssaAreaCode,
// // // // //                     lat: formData.lat,
// // // // //                     lng: formData.lng
// // // // //                 },
// // // // //                 nextOfKin: {
// // // // //                     name: formData.nokName,
// // // // //                     relationship: formData.nokRelationship,
// // // // //                     phone: formData.nokPhone
// // // // //                 },
// // // // //                 sameAsResidential: formData.sameAsResidential,
// // // // //                 updatedAt: new Date().toISOString()
// // // // //             };

// // // // //             await onUpdate(profile.id || targetId, updatedData);

// // // // //             setIsEditing(false);
// // // // //             setProfilePhoto(null);

// // // // //             setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
// // // // //         } catch (error) {
// // // // //             console.error('❌ Update failed', error);
// // // // //             setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
// // // // //         } finally {
// // // // //             setSaving(false);
// // // // //         }
// // // // //     };

// // // // //     const update = (field: string, val: string | boolean) => setFormData((prev: any) => ({ ...prev, [field]: val }));
// // // // //     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';

// // // // //     const handleCancel = () => {
// // // // //         setProfilePhoto(null);
// // // // //         setPhotoPreview(liveProfile?.profilePhotoUrl || null);
// // // // //         setIsEditing(false);
// // // // //     };

// // // // //     const renderDocumentVault = () => {
// // // // //         return (
// // // // //             <div className="lpv-vault-links" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
// // // // //                 {isEditing ? (
// // // // //                     <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
// // // // //                         {docsList.map((docItem) => (
// // // // //                             <div key={docItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
// // // // //                                 <DynamicDocUpload
// // // // //                                     document={docItem}
// // // // //                                     onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)}
// // // // //                                     onRemove={() => handleRemoveDocument(docItem.id)}
// // // // //                                 />
// // // // //                                 {/* 🚀 FIX: Visually display the existing file so it doesn't look empty */}
// // // // //                                 {docItem.url && !docItem.file && (
// // // // //                                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
// // // // //                                         <span style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
// // // // //                                             <FileText size={14} color="var(--mlab-blue)" />
// // // // //                                             <span style={{ fontWeight: 600 }}>{extractFilename(docItem.url)}</span>
// // // // //                                         </span>
// // // // //                                         <a href={docItem.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: 'var(--mlab-blue)', fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
// // // // //                                             <Eye size={14} /> View File
// // // // //                                         </a>
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         ))}
// // // // //                     </div>
// // // // //                 ) : (
// // // // //                     <>
// // // // //                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
// // // // //                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
// // // // //                     </>
// // // // //                 )}

// // // // //                 {/* Document History Log Renderer */}
// // // // //                 {liveProfile?.documentHistory && liveProfile.documentHistory.length > 0 && !isEditing && (
// // // // //                     <div style={{ marginTop: '1.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
// // // // //                         <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
// // // // //                             <History size={14} /> Document History Log
// // // // //                         </h4>
// // // // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
// // // // //                             {liveProfile.documentHistory.map((hDoc: any, idx: number) => (
// // // // //                                 <div key={idx} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                                     <a href={hDoc.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--mlab-blue)', textDecoration: 'none' }}>
// // // // //                                         <FileText size={14} /> {hDoc.name || 'Archived Document'}
// // // // //                                     </a>
// // // // //                                     <div style={{ textAlign: 'right' }}>
// // // // //                                         <div style={{ fontSize: '0.65rem', color: '#475569', fontWeight: 'bold' }}>{new Date(hDoc.replacedAt).toLocaleDateString()}</div>
// // // // //                                         <div style={{ fontSize: '0.6rem', color: '#94a3b8' }}>{new Date(hDoc.replacedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
// // // // //                                     </div>
// // // // //                                 </div>
// // // // //                             ))}
// // // // //                         </div>
// // // // //                     </div>
// // // // //                 )}
// // // // //             </div>
// // // // //         );
// // // // //     };

// // // // //     const displayData = isEditing ? formData : liveProfile;
// // // // //     const isVerified = liveProfile?.profileCompleted === true;
// // // // //     const isPostalSame = displayData?.sameAsResidential !== false;
// // // // //     const d = isEditing ? formData : (liveProfile?.demographics || {});

// // // // //     return (
// // // // //         <div className="lpv-wrapper animate-fade-in">
// // // // //             {modalConfig.isOpen && createPortal(
// // // // //                 <StatusModal
// // // // //                     type={modalConfig.type}
// // // // //                     title={modalConfig.title}
// // // // //                     message={modalConfig.message}
// // // // //                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
// // // // //                 />,
// // // // //                 document.body
// // // // //             )}

// // // // //             {confirmDocOverwrite && createPortal(
// // // // //                 <StatusModal
// // // // //                     type="warning"
// // // // //                     title="Overwrite Existing Documents?"
// // // // //                     message="You are about to replace one or more existing documents. The old versions will be securely archived in the Document History log. Do you want to proceed?"
// // // // //                     confirmText="Yes, Overwrite"
// // // // //                     onClose={() => {
// // // // //                         setConfirmDocOverwrite(false);
// // // // //                         executeSave();
// // // // //                     }}
// // // // //                     onCancel={() => setConfirmDocOverwrite(false)}
// // // // //                 />,
// // // // //                 document.body
// // // // //             )}

// // // // //             {/* Signature Modal */}
// // // // //             {showSignatureModal && createPortal(
// // // // //                 <SignatureSetupModal
// // // // //                     userUid={targetId}
// // // // //                     existingSignatureUrl={liveProfile?.signatureUrl}
// // // // //                     onComplete={() => {
// // // // //                         setShowSignatureModal(false);
// // // // //                     }}
// // // // //                 />,
// // // // //                 document.body
// // // // //             )}

// // // // //             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
// // // // //                 <ShieldCheck size={22} className="lpv-banner__icon" />
// // // // //                 <div style={{ flex: 1 }}>
// // // // //                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
// // // // //                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
// // // // //                         {liveProfile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(liveProfile.updatedAt).toLocaleDateString()}</span>}
// // // // //                     </div>
// // // // //                     <p className="lpv-banner__desc">Identity metadata is required for QCTO LEISA certification.</p>
// // // // //                 </div>
// // // // //             </div>

// // // // //             <div className="lpv-layout">
// // // // //                 <div className="lpv-main-stack">

// // // // //                     <section className="lpv-panel">
// // // // //                         <div className="lpv-panel__header">
// // // // //                             <h3 className="lpv-panel__title"><User size={16} /> Identity & Demographics</h3>
// // // // //                             <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
// // // // //                                 {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
// // // // //                             </button>
// // // // //                         </div>

// // // // //                         <div className="lpv-profile-header">
// // // // //                             <div className="lpv-avatar-wrapper">
// // // // //                                 <div className="lpv-avatar">
// // // // //                                     {photoPreview ? (
// // // // //                                         <img
// // // // //                                             src={photoPreview}
// // // // //                                             crossOrigin="anonymous"
// // // // //                                             alt="Profile"
// // // // //                                             style={{
// // // // //                                                 objectFit: "cover",
// // // // //                                                 width: "100%",
// // // // //                                                 height: "100%"
// // // // //                                             }}
// // // // //                                         />
// // // // //                                     ) : (
// // // // //                                         <User size={30} color="#94a3b8" />
// // // // //                                     )}
// // // // //                                 </div>

// // // // //                                 {isEditing && (
// // // // //                                     <label className="lpv-avatar-upload">
// // // // //                                         <Camera size={16} />
// // // // //                                         <input
// // // // //                                             type="file"
// // // // //                                             accept="image/*"
// // // // //                                             onChange={handlePhotoSelect}
// // // // //                                             hidden
// // // // //                                         />
// // // // //                                     </label>
// // // // //                                 )}
// // // // //                             </div>

// // // // //                             <div>
// // // // //                                 <h4 className="lpv-display-name">{displayData.fullName || liveProfile.fullName}</h4>
// // // // //                                 <p className="lpv-display-sub">{getLabel(d.genderCode, QCTO_GENDER)} • {getLabel(d.equityCode, QCTO_EQUITY)}</p>
// // // // //                             </div>
// // // // //                         </div>

// // // // //                         <div className="lpv-grid-2">
// // // // //                             <ROField label="National ID" value={liveProfile.idNumber} icon={<Fingerprint size={13} />} />
// // // // //                             <EditField label="Contact Number" value={displayData.phone || d.learnerPhoneNumber} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

// // // // //                             <FormSelectWrapper label="Title" value={d.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
// // // // //                             <EditField label="Middle Name" value={d.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

// // // // //                             <FormSelectWrapper label="Gender Code" value={d.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
// // // // //                             <FormSelectWrapper label="Equity Code" value={d.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
// // // // //                             <FormSelectWrapper label="Home Language" value={d.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
// // // // //                             <FormSelectWrapper label="Citizenship Status" value={d.citizenResidentStatusCode || d.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
// // // // //                             <FormSelectWrapper label="Nationality Code" value={d.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
// // // // //                             <FormSelectWrapper label="Immigrant Status" value={d.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
// // // // //                             <FormSelectWrapper label="Alternative ID Type" value={d.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
// // // // //                         </div>
// // // // //                     </section>

// // // // //                     <section className="lpv-panel">
// // // // //                         <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
// // // // //                         <div className="lpv-grid-2">

// // // // //                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

// // // // //                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
// // // // //                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
// // // // //                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
// // // // //                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
// // // // //                             )}
// // // // //                             <div style={{ gridColumn: '1 / -1' }}>
// // // // //                                 <FormSelectWrapper
// // // // //                                     label="STATS-SA Area Code"
// // // // //                                     value={d.statssaAreaCode || d.statsaaAreaCode}
// // // // //                                     isEditing={isEditing}
// // // // //                                     options={statssaOptions}
// // // // //                                     onChange={(v: string) => update('statssaAreaCode', v)}
// // // // //                                 />
// // // // //                             </div>
// // // // //                         </div>
// // // // //                     </section>

// // // // //                     <section className="lpv-panel">
// // // // //                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
// // // // //                             <MapPin size={16} /> Residential Address
// // // // //                         </h3>

// // // // //                         {isEditing && (
// // // // //                             <div style={{ marginBottom: '1rem' }}>
// // // // //                                 <div className="lpv-field__label">Address Search (Google Verified)</div>
// // // // //                                 <Autocomplete
// // // // //                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
// // // // //                                     onPlaceSelected={handleAddressSelected}
// // // // //                                     options={{ types: [], componentRestrictions: { country: "za" } }}
// // // // //                                     className="lpv-input"
// // // // //                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
// // // // //                                     placeholder="Start typing your street name..."
// // // // //                                 />
// // // // //                             </div>
// // // // //                         )}

// // // // //                         <div className="lpv-grid-3">
// // // // //                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
// // // // //                             <ROField label="City" value={displayData.city || d.learnerHomeAddress2} />
// // // // //                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
// // // // //                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />
// // // // //                         </div>

// // // // //                         {isEditing ? (
// // // // //                             <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
// // // // //                                 <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a', fontSize: '0.9rem' }}>
// // // // //                                     <input
// // // // //                                         type="checkbox"
// // // // //                                         checked={displayData.sameAsResidential}
// // // // //                                         onChange={e => update('sameAsResidential', e.target.checked)}
// // // // //                                     />
// // // // //                                     Postal Address is the same as Residential
// // // // //                                 </label>
// // // // //                                 {!displayData.sameAsResidential && (
// // // // //                                     <div className="animate-fade-in lpv-grid-2" style={{ marginTop: '1rem' }}>
// // // // //                                         <EditField label="Alternate Postal Address" value={displayData.postalAddress || d.learnerPostalAddress1} isEditing={true} onChange={(v: string) => update('postalAddress', v)} />
// // // // //                                         <EditField label="Alternate Postal Code" value={displayData.customPostalCode || d.learnerPostalAddressPostCode} isEditing={true} onChange={(v: string) => update('customPostalCode', v)} />
// // // // //                                     </div>
// // // // //                                 )}
// // // // //                             </div>
// // // // //                         ) : (
// // // // //                             <>
// // // // //                                 <div className="lpv-divider" style={{ marginTop: '1.5rem', marginBottom: '1rem', borderTop: '1px solid #e2e8f0' }} />
// // // // //                                 <h4 style={{ fontSize: '0.8rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center' }}>
// // // // //                                     Postal Address
// // // // //                                     {isPostalSame && <span style={{ fontSize: '0.65rem', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px', color: '#64748b', border: '1px solid #cbd5e1' }}>Same as Residential</span>}
// // // // //                                 </h4>
// // // // //                                 <div className="lpv-grid-2">
// // // // //                                     <ROField label="Address" value={isPostalSame ? (displayData.streetAddress || d.learnerHomeAddress1) : (displayData.postalAddress || d.learnerPostalAddress1)} />
// // // // //                                     <ROField label="Postal Code" value={isPostalSame ? (displayData.postalCode || d.learnerHomeAddressPostalCode) : (displayData.customPostalCode || d.learnerPostalAddressPostCode)} />
// // // // //                                 </div>
// // // // //                             </>
// // // // //                         )}
// // // // //                     </section>

// // // // //                     <section className="lpv-panel">
// // // // //                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
// // // // //                         <div className="lpv-grid-3">
// // // // //                             <EditField label="Contact Name" value={displayData.nokName || liveProfile.nextOfKin?.name} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
// // // // //                             <EditField label="Relationship" value={displayData.nokRelationship || liveProfile.nextOfKin?.relationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
// // // // //                             <EditField label="Contact Phone" value={displayData.nokPhone || liveProfile.nextOfKin?.phone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
// // // // //                         </div>
// // // // //                     </section>
// // // // //                     {/* SIGNATURE SECTION */}
// // // // //                     <section className="lpv-panel">
// // // // //                         <div className="lpv-panel__header">
// // // // //                             <h3 className="lpv-panel__title"><PenTool size={16} /> Digital Signature Certificate</h3>
// // // // //                             <button
// // // // //                                 className="lpv-edit-btn"
// // // // //                                 onClick={() => setShowSignatureModal(true)}
// // // // //                             >
// // // // //                                 <Edit3 size={13} /> {liveProfile?.signatureUrl ? 'Update Signature' : 'Add Signature'}
// // // // //                             </button>
// // // // //                         </div>
// // // // //                         <div style={{ padding: '1.5rem', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '8px', textAlign: 'center' }}>
// // // // //                             {liveProfile?.signatureUrl ? (
// // // // //                                 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
// // // // //                                     <img
// // // // //                                         src={liveProfile.signatureUrl}
// // // // //                                         alt="Learner Signature"
// // // // //                                         crossOrigin="anonymous"
// // // // //                                         style={{
// // // // //                                             height: 'auto',
// // // // //                                             maxHeight: '120px',
// // // // //                                             width: '100%',
// // // // //                                             maxWidth: '400px',
// // // // //                                             objectFit: 'contain',
// // // // //                                             mixBlendMode: 'multiply',
// // // // //                                             filter: 'grayscale(100%) contrast(400%)'
// // // // //                                         }}
// // // // //                                     />
// // // // //                                     <span style={{ fontSize: '0.7rem', color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'bold', marginTop: '10px' }}>
// // // // //                                         Authenticated Learner Signature (Black Ink)
// // // // //                                     </span>
// // // // //                                 </div>
// // // // //                             ) : (
// // // // //                                 <div style={{ color: 'var(--mlab-red)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
// // // // //                                     <AlertCircle size={16} /> The learner has not registered their digital signature yet.
// // // // //                                 </div>
// // // // //                             )}
// // // // //                         </div>
// // // // //                         <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
// // // // //                             Note: If an administrator is logged in, please hand the device to the learner so they can personally draw or upload their signature.
// // // // //                         </p>
// // // // //                     </section>
// // // // //                 </div>

// // // // //                 <aside className="lpv-aside">
// // // // //                     <div className="lpv-qual-card">
// // // // //                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
// // // // //                         <p className="lpv-qual-card__name">{liveProfile?.qualification?.name || 'Programme Pending'}</p>
// // // // //                         <span className="lpv-qual-card__saqa">SAQA ID: {liveProfile?.qualification?.saqaId || '—'}</span>
// // // // //                     </div>

// // // // //                     <div className="lpv-vault-card">
// // // // //                         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
// // // // //                             <h4 className="lpv-vault-card__title" style={{ margin: 0 }}><FileText size={15} /> Document Vault</h4>
// // // // //                             {isEditing && (
// // // // //                                 <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
// // // // //                                     <Plus size={12} /> Add
// // // // //                                 </button>
// // // // //                             )}
// // // // //                         </div>
// // // // //                         {renderDocumentVault()}
// // // // //                     </div>

// // // // //                     {isEditing && (
// // // // //                         <button className="lpv-save-btn" onClick={handleSaveClick} disabled={saving}>
// // // // //                             {saving ? <><Loader2 size={16} className="lpv-spin" /> Saving…</> : <><Save size={16} /> Save Profile</>}
// // // // //                         </button>
// // // // //                     )}
// // // // //                 </aside>
// // // // //             </div>
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // /* --- Field Components --- */

// // // // // const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
// // // // //     <div className="lpv-field">
// // // // //         <div className="lpv-field__label">{icon}{label}</div>
// // // // //         <div className="lpv-field__value">{value || '—'}</div>
// // // // //     </div>
// // // // // );

// // // // // interface EditFieldProps { label: string; value?: string; isEditing: boolean; onChange: (val: string) => void; icon?: React.ReactNode; type?: 'text' | 'select'; options?: { label: string; value: string }[]; placeholder?: string; }

// // // // // const EditField: React.FC<EditFieldProps> = ({ label, value, isEditing, onChange, icon, type = 'text', options = [], placeholder = "" }) => {
// // // // //     const displayValue = type === 'select' && !isEditing ? options.find(o => o.value === value)?.label : value;
// // // // //     return (
// // // // //         <div className="lpv-field">
// // // // //             <div className="lpv-field__label">{icon}{label}</div>
// // // // //             {isEditing ? (
// // // // //                 type === 'select' ? (
// // // // //                     <select className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
// // // // //                         <option value="">Select...</option>
// // // // //                         {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
// // // // //                     </select>
// // // // //                 ) : (
// // // // //                     <input type="text" className="lpv-input" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
// // // // //                 )
// // // // //             ) : (
// // // // //                 <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // interface FormSelectWrapperProps { label: string; value?: string; isEditing: boolean; options: { label: string; value: string; subLabel?: string }[]; onChange: (val: string) => void; isSearchable?: boolean; placeholder?: string; }

// // // // // const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
// // // // //     const displayValue = options.find(o => o.value === value)?.label || value;
// // // // //     return (
// // // // //         <div className="lpv-field">
// // // // //             {isEditing ? (
// // // // //                 <FormSelect label={label} value={value || ""} options={options} onChange={onChange} isSearchable={isSearchable} placeholder={placeholder} />
// // // // //             ) : (
// // // // //                 <>
// // // // //                     <div className="lpv-field__label">{label}</div>
// // // // //                     <div className={`lpv-field__value ${!displayValue ? 'lpv-field__value--empty' : ''}`}>{displayValue || '—'}</div>
// // // // //                 </>
// // // // //             )}
// // // // //         </div>
// // // // //     );
// // // // // };

// // // // // const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
// // // // //     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
// // // // //         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
// // // // //         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
// // // // //     </a>
// // // // // );

// // // // // export default LearnerProfileView;