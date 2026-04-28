// src/components/views/LearnerProfileView/LearnerProfileView.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom'; // 🚀 IMPORTED CREATEPORTAL
import {
    User, Phone, MapPin, ShieldCheck,
    FileText, Edit3, Save, X, Fingerprint,
    GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, Plus, PenTool
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, onSnapshot } from 'firebase/firestore';
import Autocomplete from "react-google-autocomplete";
import './LearnerProfileView.css';
import { storage, db } from '../../../../lib/firebase';
import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
import { useToast } from '../../../../components/common/Toast/Toast';

import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
import { fetchStatssaCodes } from '../../../../services/qctoService';
import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

/* ── STRICT QCTO DICTIONARIES (LOCALLY DEFINED) ────────────────────────── */
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

    const [liveProfile, setLiveProfile] = useState<any>(profile || {});
    const [formData, setFormData] = useState<any>({});

    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

    const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
    const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

    const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

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

    // Push parent profile updates into liveProfile
    useEffect(() => {
        if (profile) {
            setLiveProfile((prev: any) => ({ ...prev, ...profile }));
        }
    }, [profile]);

    // 1. REAL-TIME LISTENER for the "users" collection
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
                        uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || []
                    };
                    return merged;
                });
            }
        });

        return () => unsubscribe();
    }, [targetId]);


    // 2. HYDRATE UI FROM LIVE PROFILE
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
                { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
                { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
            ];

            uploadedDocsArray.forEach((savedDoc: any) => {
                if (!['id', 'qual', 'cv'].includes(savedDoc.id)) {
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

    const handleAddressSelected = (place: any) => {
        const components = place.address_components;
        if (!components) return;

        const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
        const rawProv = getComp("administrative_area_level_1");
        const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

        const postal = getComp("postal_code");
        const townName = getComp("locality") || getComp("sublocality_level_1");

        const buildingName = place.name || "";
        const formatted = place.formatted_address || "";
        const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

        const match = allStatssaCodes.find(c => c.town.toLowerCase() === townName.toLowerCase());

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

    const openInMaps = () => {
        if (!formData.lat || formData.lat === 0) return;
        window.open(`http://googleusercontent.com/maps.google.com/?q=${formData.lat},${formData.lng}`, '_blank');
    };

    const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
    const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
    const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

    const handleSave = async () => {
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

            for (const docItem of docsList) {
                let finalUrl = docItem.url;
                if (docItem.file) {
                    const ext = docItem.file.name.split('.').pop();
                    const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
                    const snapshot = await uploadBytes(storageRef, docItem.file);
                    finalUrl = await getDownloadURL(snapshot.ref);
                }
                if (finalUrl) {
                    finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
                }
            }

            const updatedData = {
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                profilePhotoUrl: finalPhotoUrl,
                uploadedDocuments: finalUploadedDocs,
                demographics: {
                    ...(liveProfile.demographics || {}),
                    learnerPhoneNumber: formData.phone,
                    learnerTitle: formData.learnerTitle,
                    learnerMiddleName: formData.learnerMiddleName,
                    alternativeIdType: formData.alternativeIdType,
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    provinceCode: formData.provinceCode,
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
                    statssaAreaCode: formData.statssaAreaCode,
                    statsaaAreaCode: formData.statssaAreaCode,
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

            await onUpdate(targetId, updatedData);

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                        {docsList.map((docItem) => (
                            <DynamicDocUpload key={docItem.id} document={docItem} onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)} onRemove={() => handleRemoveDocument(docItem.id)} />
                        ))}
                    </div>
                ) : (
                    <>
                        {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
                        {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
                    </>
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
            {/* MODALS WRAPPED IN CREATEPORTAL */}
            {modalConfig.isOpen && createPortal(
                <StatusModal
                    type={modalConfig.type}
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
                />,
                document.body
            )}

            {/* Signature Modal */}
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
                            <button className={`lpv-edit-btn ${isEditing ? 'lpv-edit-btn--cancel' : ''}`} onClick={isEditing ? handleCancel : () => setIsEditing(true)}>
                                {isEditing ? <><X size={13} /> Cancel</> : <><Edit3 size={13} /> Edit Profile</>}
                            </button>
                        </div>

                        <div className="lpv-profile-header">
                            <div className="lpv-avatar-wrapper">
                                <div className="lpv-avatar">
                                    {photoPreview ? <img src={photoPreview} style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="Profile" /> : <User size={30} color="#94a3b8" />}
                                </div>
                                {isEditing && (
                                    <label className="lpv-avatar-upload">
                                        <Camera size={14} />
                                        <input type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
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
                        <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
                        <div className="lpv-grid-2">

                            <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

                            <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
                            <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
                            {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
                                <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
                            )}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <FormSelectWrapper
                                    label="STATS-SA Area Code"
                                    value={d.statssaAreaCode || d.statsaaAreaCode}
                                    isEditing={isEditing}
                                    options={statssaOptions}
                                    onChange={(v: string) => update('statssaAreaCode', v)}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
                            <MapPin size={16} /> Residential Address
                        </h3>

                        {isEditing && (
                            <div style={{ marginBottom: '1rem' }}>
                                <div className="lpv-field__label">Address Search (Google Verified)</div>
                                <Autocomplete
                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                    onPlaceSelected={handleAddressSelected}
                                    options={{ types: [], componentRestrictions: { country: "za" } }}
                                    className="lpv-input"
                                    defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
                                    placeholder="Start typing your street name..."
                                />
                            </div>
                        )}

                        <div className="lpv-grid-3">
                            <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                            <ROField label="City" value={displayData.city || d.learnerHomeAddress2} />
                            <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
                            <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />
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
                                <button className="lpv-edit-btn" style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={handleAddDocument}>
                                    <Plus size={12} /> Add
                                </button>
                            )}
                        </div>
                        {renderDocumentVault()}
                    </div>

                    {isEditing && (
                        <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
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
// import {
//     User, Phone, MapPin, ShieldCheck,
//     FileText, Edit3, Save, X, Fingerprint,
//     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, CheckCircle2, Globe, Edit2, Plus, PenTool
// } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { doc, onSnapshot } from 'firebase/firestore';
// import Autocomplete from "react-google-autocomplete";
// import './LearnerProfileView.css';
// import { storage, db } from '../../../../lib/firebase';
// import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// import { useToast } from '../../../../components/common/Toast/Toast';

// import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
// import { fetchStatssaCodes } from '../../../../services/qctoService';
// import { DynamicDocUpload, type DynamicDocument } from '../../LearnerProfileSetup/LearnerProfileSetup';
// import { SignatureSetupModal } from '../../../../components/auth/SignatureSetupModal';

// /* ── STRICT QCTO DICTIONARIES (LOCALLY DEFINED) ────────────────────────── */
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

//     const [liveProfile, setLiveProfile] = useState<any>(profile || {});
//     const [formData, setFormData] = useState<any>({});

//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);
//     const [docsList, setDocsList] = useState<DynamicDocument[]>([]);

//     const [modalConfig, setModalConfig] = useState<{ isOpen: boolean; type: StatusType; title: string; message: string; }>({ isOpen: false, type: 'info', title: '', message: '' });
//     const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

//     const targetId = profile?.authUid || profile?.userId || profile?.uid || profile?.id;

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

//     // Push parent profile updates into liveProfile
//     useEffect(() => {
//         if (profile) {
//             setLiveProfile((prev: any) => ({ ...prev, ...profile }));
//         }
//     }, [profile]);

//     // 1. REAL-TIME LISTENER for the "users" collection
//     useEffect(() => {
//         if (!targetId) return;

//         const unsubscribe = onSnapshot(doc(db, 'users', targetId), (docSnap) => {
//             if (docSnap.exists()) {
//                 const userData = docSnap.data();

//                 setLiveProfile((currentProfile: any) => {
//                     const merged = {
//                         ...currentProfile,
//                         ...userData,
//                         demographics: currentProfile.demographics || userData.demographics || {},
//                         nextOfKin: currentProfile.nextOfKin || userData.nextOfKin || {},
//                         uploadedDocuments: currentProfile.uploadedDocuments || userData.uploadedDocuments || []
//                     };
//                     return merged;
//                 });
//             }
//         });

//         return () => unsubscribe();
//     }, [targetId]);


//     // 2. HYDRATE UI FROM LIVE PROFILE
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
//                 { id: 'qual', name: 'Highest Qualification', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'qual')?.url || legacyDocs.qualUrl || '', isFixed: true, isRequired: true },
//                 { id: 'cv', name: 'Updated CV', file: null, url: uploadedDocsArray.find((d: any) => d.id === 'cv')?.url || legacyDocs.cvUrl || '', isFixed: true, isRequired: false }
//             ];

//             uploadedDocsArray.forEach((savedDoc: any) => {
//                 if (!['id', 'qual', 'cv'].includes(savedDoc.id)) {
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

//     const handleAddressSelected = (place: any) => {
//         const components = place.address_components;
//         if (!components) return;

//         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
//         const rawProv = getComp("administrative_area_level_1");
//         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

//         const postal = getComp("postal_code");
//         const townName = getComp("locality") || getComp("sublocality_level_1");

//         const buildingName = place.name || "";
//         const formatted = place.formatted_address || "";
//         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

//         const match = allStatssaCodes.find(c => c.town.toLowerCase() === townName.toLowerCase());

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

//     const openInMaps = () => {
//         if (!formData.lat || formData.lat === 0) return;
//         window.open(`http://googleusercontent.com/maps.google.com/?q=${formData.lat},${formData.lng}`, '_blank');
//     };

//     const handleAddDocument = () => setDocsList(prev => [...prev, { id: `doc_${Date.now()}`, name: '', file: null, url: '', isFixed: false, isRequired: false }]);
//     const handleRemoveDocument = (id: string) => setDocsList(prev => prev.filter(doc => doc.id !== id || doc.isFixed));
//     const handleDocUpdate = (id: string, field: keyof DynamicDocument, value: any) => setDocsList(prev => prev.map(doc => doc.id === id ? { ...doc, [field]: value } : doc));

//     const handleSave = async () => {
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

//             for (const docItem of docsList) {
//                 let finalUrl = docItem.url;
//                 if (docItem.file) {
//                     const ext = docItem.file.name.split('.').pop();
//                     const storageRef = ref(storage, `learners/${targetId}/${docItem.id}_${Date.now()}.${ext}`);
//                     const snapshot = await uploadBytes(storageRef, docItem.file);
//                     finalUrl = await getDownloadURL(snapshot.ref);
//                 }
//                 if (finalUrl) {
//                     finalUploadedDocs.push({ id: docItem.id, name: docItem.name || 'Untitled Document', url: finalUrl });
//                 }
//             }

//             const updatedData = {
//                 fullName: formData.fullName,
//                 email: formData.email,
//                 phone: formData.phone,
//                 profilePhotoUrl: finalPhotoUrl,
//                 uploadedDocuments: finalUploadedDocs,
//                 demographics: {
//                     ...(liveProfile.demographics || {}),
//                     learnerPhoneNumber: formData.phone,
//                     learnerTitle: formData.learnerTitle,
//                     learnerMiddleName: formData.learnerMiddleName,
//                     alternativeIdType: formData.alternativeIdType,
//                     learnerHomeAddress1: formData.streetAddress,
//                     learnerHomeAddress2: formData.city,
//                     provinceCode: formData.provinceCode,
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
//                     statssaAreaCode: formData.statssaAreaCode,
//                     statsaaAreaCode: formData.statssaAreaCode,
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

//             await onUpdate(targetId, updatedData);

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
//                     <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
//                         {docsList.map((docItem) => (
//                             <DynamicDocUpload key={docItem.id} document={docItem} onUpdate={(field, val) => handleDocUpdate(docItem.id, field, val)} onRemove={() => handleRemoveDocument(docItem.id)} />
//                         ))}
//                     </div>
//                 ) : (
//                     <>
//                         {docsList.map((docItem, index) => <DocVaultLink key={docItem.id || index} label={docItem.name || 'Custom Document'} url={docItem.url} />)}
//                         {docsList.length === 0 && <span style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>No documents uploaded.</span>}
//                     </>
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
//             {modalConfig.isOpen && <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} />}

//             {/* Signature Modal */}
//             {showSignatureModal && (
//                 <SignatureSetupModal
//                     userUid={targetId}
//                     existingSignatureUrl={liveProfile?.signatureUrl}
//                     onComplete={() => {
//                         setShowSignatureModal(false);
//                     }}
//                 />
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
//                                     {photoPreview ? <img src={photoPreview} style={{ objectFit: 'cover', width: '100%', height: '100%' }} alt="Profile" /> : <User size={30} color="#94a3b8" />}
//                                 </div>
//                                 {isEditing && (
//                                     <label className="lpv-avatar-upload">
//                                         <Camera size={14} />
//                                         <input type="file" accept="image/*" onChange={handlePhotoSelect} hidden />
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
//                         <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
//                         <div className="lpv-grid-2">

//                             <EditField label="Matric / Certificate Number" value={d.flcStatementOfResultNumber || d.flcResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

//                             <FormSelectWrapper label="Employment Status" value={d.socioeconomicStatusCode || d.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
//                             <FormSelectWrapper label="Disability Status" value={d.disabilityStatusCode || d.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
//                             {d.disabilityStatusCode !== 'N' && d.disabilityCode !== 'N' && (
//                                 <FormSelectWrapper label="Disability Rating" value={d.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
//                             )}
//                             <div style={{ gridColumn: '1 / -1' }}>
//                                 <FormSelectWrapper
//                                     label="STATS-SA Area Code"
//                                     value={d.statssaAreaCode || d.statsaaAreaCode}
//                                     isEditing={isEditing}
//                                     options={statssaOptions}
//                                     onChange={(v: string) => update('statssaAreaCode', v)}
//                                 />
//                             </div>
//                         </div>
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem', fontSize: '0.9rem', fontWeight: 600, color: 'var(--mlab-blue)' }}>
//                             <MapPin size={16} /> Residential Address
//                         </h3>

//                         {isEditing && (
//                             <div style={{ marginBottom: '1rem' }}>
//                                 <div className="lpv-field__label">Address Search (Google Verified)</div>
//                                 <Autocomplete
//                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                     onPlaceSelected={handleAddressSelected}
//                                     options={{ types: [], componentRestrictions: { country: "za" } }}
//                                     className="lpv-input"
//                                     defaultValue={displayData.streetAddress || d.learnerHomeAddress1}
//                                     placeholder="Start typing your street name..."
//                                 />
//                             </div>
//                         )}

//                         <div className="lpv-grid-3">
//                             <EditField label="Street Address" value={displayData.streetAddress || d.learnerHomeAddress1} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
//                             <ROField label="City" value={displayData.city || d.learnerHomeAddress2} />
//                             <EditField label="Province" value={displayData.provinceCode || d.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
//                             <ROField label="Postal Code" value={displayData.postalCode || d.learnerHomeAddressPostalCode} />
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
//                         <button className="lpv-save-btn" onClick={handleSave} disabled={saving}>
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



