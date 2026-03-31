// src/components/views/LearnerProfileView/LearnerProfileView.tsx

import React, { useState, useEffect, useMemo } from 'react';
import {
    User, Phone, MapPin, ShieldCheck,
    FileText, Edit3, Save, X, Fingerprint,
    GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, CheckCircle2, Globe, Edit2
} from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import Autocomplete from "react-google-autocomplete";
import './LearnerProfileView.css';
import { storage, db } from '../../../../lib/firebase';
import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
import { useToast } from '../../../../components/common/Toast/Toast';

import { FormSelect } from '../../../../components/common/FormSelect/FormSelect';
import { fetchStatssaCodes } from '../../../../services/qctoService';

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

    const [formData, setFormData] = useState<any>({});
    const [initialData, setInitialData] = useState<any>({});
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        type: StatusType;
        title: string;
        message: string;
    }>({ isOpen: false, type: 'info', title: '', message: '' });

    // STATSSA Search State
    const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

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
            const d = profile.demographics || {};

            const initialLoadData = {
                fullName: profile.fullName || '',
                email: profile.email || '',
                phone: profile.phone || d.learnerPhoneNumber || '',
                idNumber: profile.idNumber || '',

                // Identity
                learnerTitle: d.learnerTitle || '',
                learnerMiddleName: d.learnerMiddleName || '',
                nationalityCode: d.nationalityCode || '',
                immigrantStatus: d.immigrantStatus || '03',
                alternativeIdType: d.alternativeIdType || '533',

                // Address
                streetAddress: d.learnerHomeAddress1 || '',
                city: d.learnerHomeAddress2 || '',
                provinceCode: d.provinceCode || '',
                postalCode: d.learnerHomeAddressPostalCode || '',
                statssaAreaCode: d.statsaaAreaCode || '',
                lat: d.lat || 0,
                lng: d.lng || 0,

                // Background & Demographics
                flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '', // 🚀 ADDED HERE
                equityCode: d.equityCode || '',
                genderCode: d.genderCode || '',
                homeLanguageCode: d.homeLanguageCode || '',
                citizenStatusCode: d.citizenResidentStatusCode || '',
                socioeconomicCode: d.socioeconomicStatusCode || '',
                disabilityCode: d.disabilityStatusCode || 'N',
                disabilityRating: d.disabilityRating || '',

                // NOK
                nokName: profile.nextOfKin?.name || '',
                nokRelationship: profile.nextOfKin?.relationship || '',
                nokPhone: profile.nextOfKin?.phone || '',
                profilePhotoUrl: profile.profilePhotoUrl || ''
            };

            setFormData(initialLoadData);
            setInitialData(initialLoadData);
            setPhotoPreview(profile.profilePhotoUrl || null);
        }
    }, [profile]);

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
        window.open(`https://www.google.com/maps?q=$${formData.lat},${formData.lng}`, '_blank');
    };

    const handleSave = async () => {
        if (!profile?.id) return;

        const hasFormChanges = JSON.stringify(formData) !== JSON.stringify(initialData);
        const hasPhotoChanges = profilePhoto !== null;

        if (!hasFormChanges && !hasPhotoChanges) {
            setIsEditing(false);
            toast.info("No changes detected. Editing mode closed.");
            return;
        }

        setSaving(true);

        try {
            let finalPhotoUrl = formData.profilePhotoUrl;
            if (profilePhoto && user?.uid) {
                const storageRef = ref(storage, `learners/${user.uid}/profile_${Date.now()}`);
                const snapshot = await uploadBytes(storageRef, profilePhoto);
                finalPhotoUrl = await getDownloadURL(snapshot.ref);
            }

            const updatedData = {
                fullName: formData.fullName,
                email: formData.email,
                phone: formData.phone,
                profilePhotoUrl: finalPhotoUrl,
                demographics: {
                    ...(profile.demographics || {}),
                    learnerPhoneNumber: formData.phone,
                    learnerTitle: formData.learnerTitle,
                    learnerMiddleName: formData.learnerMiddleName,
                    alternativeIdType: formData.alternativeIdType,
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    provinceCode: formData.provinceCode,
                    learnerHomeAddressPostalCode: formData.postalCode,
                    learnerPostalAddressPostCode: formData.postalCode,
                    equityCode: formData.equityCode,
                    genderCode: formData.genderCode,
                    homeLanguageCode: formData.homeLanguageCode,
                    citizenResidentStatusCode: formData.citizenStatusCode,
                    nationalityCode: formData.nationalityCode,
                    immigrantStatus: formData.immigrantStatus,
                    flcStatementOfResultNumber: formData.flcStatementOfResultNumber, // 🚀 ADDED HERE
                    socioeconomicStatusCode: formData.socioeconomicCode,
                    disabilityStatusCode: formData.disabilityCode,
                    disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
                    statsaaAreaCode: formData.statssaAreaCode,
                    lat: formData.lat,
                    lng: formData.lng
                },
                nextOfKin: {
                    name: formData.nokName,
                    relationship: formData.nokRelationship,
                    phone: formData.nokPhone
                },
                updatedAt: new Date().toISOString()
            };

            const learnerRef = doc(db, 'learners', profile.id);
            await updateDoc(learnerRef, updatedData);

            try {
                await onUpdate(profile.id, updatedData);
            } catch (localError: any) {
                if (!localError.message?.includes('Record not found in local state')) throw localError;
            }

            setIsEditing(false);
            setProfilePhoto(null);
            setInitialData(formData);

            setModalConfig({ isOpen: true, type: 'success', title: 'Profile Updated', message: 'Your profile has been successfully updated and securely synchronized.' });
        } catch (error) {
            console.error('❌ Update failed', error);
            setModalConfig({ isOpen: true, type: 'error', title: 'Update Failed', message: 'Failed to save profile to the database. Please check your connection and try again.' });
        } finally {
            setSaving(false);
        }
    };

    const update = (field: string, val: string) => setFormData((prev: any) => ({ ...prev, [field]: val }));
    const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';
    const isVerified = profile?.profileCompleted;

    const handleCancel = () => {
        setFormData(initialData);
        setPhotoPreview(profile?.profilePhotoUrl || null);
        setProfilePhoto(null);
        setIsEditing(false);
    };

    return (
        <div className="lpv-wrapper animate-fade-in">
            {modalConfig.isOpen && (
                <StatusModal type={modalConfig.type} title={modalConfig.title} message={modalConfig.message} onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))} />
            )}

            <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
                <ShieldCheck size={22} className="lpv-banner__icon" />
                <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
                        {profile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(profile.updatedAt).toLocaleDateString()}</span>}
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
                                        <input type="file" accept="image/*" onChange={(e) => {
                                            if (e.target.files && e.target.files[0]) {
                                                setProfilePhoto(e.target.files[0]);
                                                setPhotoPreview(URL.createObjectURL(e.target.files[0]));
                                            }
                                        }} hidden />
                                    </label>
                                )}
                            </div>
                            <div>
                                <h4 className="lpv-display-name">{formData.fullName}</h4>
                                <p className="lpv-display-sub">{getLabel(formData.genderCode, QCTO_GENDER)} • {getLabel(formData.equityCode, QCTO_EQUITY)}</p>
                            </div>
                        </div>

                        <div className="lpv-grid-2">
                            <ROField label="National ID" value={formData.idNumber} icon={<Fingerprint size={13} />} />
                            <EditField label="Contact Number" value={formData.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />

                            <FormSelectWrapper label="Title" value={formData.learnerTitle} isEditing={isEditing} options={QCTO_TITLES} onChange={(v: string) => update('learnerTitle', v)} isSearchable={false} />
                            <EditField label="Middle Name" value={formData.learnerMiddleName} isEditing={isEditing} onChange={(v: string) => update('learnerMiddleName', v)} />

                            <FormSelectWrapper label="Gender Code" value={formData.genderCode} isEditing={isEditing} options={QCTO_GENDER} onChange={(v: string) => update('genderCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Equity Code" value={formData.equityCode} isEditing={isEditing} options={QCTO_EQUITY} onChange={(v: string) => update('equityCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Home Language" value={formData.homeLanguageCode} isEditing={isEditing} options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
                            <FormSelectWrapper label="Citizenship Status" value={formData.citizenStatusCode} isEditing={isEditing} options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} isSearchable={false} />
                            <FormSelectWrapper label="Nationality Code" value={formData.nationalityCode} isEditing={isEditing} options={QCTO_NATIONALITY} onChange={(v: string) => update('nationalityCode', v)} />
                            <FormSelectWrapper label="Immigrant Status" value={formData.immigrantStatus} isEditing={isEditing} options={QCTO_IMMIGRANT} onChange={(v: string) => update('immigrantStatus', v)} isSearchable={false} />
                            <FormSelectWrapper label="Alternative ID Type" value={formData.alternativeIdType} isEditing={isEditing} options={QCTO_ALT_ID_TYPE} onChange={(v: string) => update('alternativeIdType', v)} isSearchable={false} />
                        </div>
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
                        <div className="lpv-grid-2">
                            {/* 🚀 ADDED MATRIC CERTIFICATE FIELD HERE */}
                            <EditField label="Matric / Certificate Number" value={formData.flcStatementOfResultNumber} isEditing={isEditing} onChange={(v: string) => update('flcStatementOfResultNumber', v)} placeholder="e.g. 123456789" />

                            <FormSelectWrapper label="Employment Status" value={formData.socioeconomicCode} isEditing={isEditing} options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
                            <FormSelectWrapper label="Disability Status" value={formData.disabilityCode} isEditing={isEditing} options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} isSearchable={false} />
                            {formData.disabilityCode !== 'N' && (
                                <FormSelectWrapper label="Disability Rating" value={formData.disabilityRating} isEditing={isEditing} options={QCTO_DISABILITY_RATING} onChange={(v: string) => update('disabilityRating', v)} isSearchable={false} />
                            )}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <FormSelectWrapper
                                    label="STATS-SA Area Code"
                                    value={formData.statssaAreaCode}
                                    isEditing={isEditing}
                                    options={statssaOptions}
                                    onChange={(v: string) => update('statssaAreaCode', v)}
                                />
                            </div>
                        </div>
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>
                        {isEditing && (
                            <div className="lpv-search-box">
                                <label className="lpv-field__label" style={{ color: 'var(--mlab-blue)' }}><Globe size={12} /> Google Search Verification</label>
                                <Autocomplete
                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                    onPlaceSelected={handleAddressSelected}
                                    options={{
                                        types: [],
                                        componentRestrictions: { country: "za" },
                                        fields: ["address_components", "geometry", "formatted_address", "name"]
                                    }}
                                    className="lpv-input lpv-search-input"
                                    placeholder="Verify your address here..."
                                />
                            </div>
                        )}
                        <div className={`lpv-address-editor ${isEditing ? 'lpv-address-editor--editing' : ''}`}>
                            {isEditing && (
                                <div className="editor-header">
                                    <div className="editor-title"><Edit2 size={12} /> <span>Override Address</span></div>
                                    {formData.lat !== 0 && (
                                        <button className="v-pill" onClick={openInMaps} type="button">
                                            <CheckCircle2 size={11} /> GPS Verified
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="lpv-full-field" style={{ marginTop: isEditing ? '1rem' : 0 }}>
                                <EditField label="Street Line" value={formData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
                            </div>
                            <div className="lpv-grid-3" style={{ marginTop: '1rem' }}>
                                <EditField label="City" value={formData.city} isEditing={isEditing} onChange={(v: string) => update('city', v)} />
                                <FormSelectWrapper label="Province" value={formData.provinceCode} isEditing={isEditing} options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} isSearchable={false} />
                                <EditField label="Postal Code" value={formData.postalCode} isEditing={isEditing} onChange={(v: string) => update('postalCode', v)} />
                            </div>
                        </div>
                    </section>

                    <section className="lpv-panel">
                        <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
                        <div className="lpv-grid-3">
                            <EditField label="Contact Name" value={formData.nokName} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
                            <EditField label="Relationship" value={formData.nokRelationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
                            <EditField label="Contact Phone" value={formData.nokPhone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
                        </div>
                    </section>
                </div>

                <aside className="lpv-aside">
                    <div className="lpv-qual-card">
                        <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
                        <p className="lpv-qual-card__name">{profile?.qualification?.name || 'Programme Pending'}</p>
                        <span className="lpv-qual-card__saqa">SAQA ID: {profile?.qualification?.saqaId || '—'}</span>
                    </div>

                    <div className="lpv-vault-card">
                        <h4 className="lpv-vault-card__title"><FileText size={15} /> Document Vault</h4>
                        <div className="lpv-vault-links">
                            <DocVaultLink label="Certified ID" url={profile?.documents?.idUrl} />
                            <DocVaultLink label="School Certificate" url={profile?.documents?.qualUrl} />
                            <DocVaultLink label="Latest CV" url={profile?.documents?.cvUrl} />
                        </div>
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

interface EditFieldProps {
    label: string;
    value?: string;
    isEditing: boolean;
    onChange: (val: string) => void;
    icon?: React.ReactNode;
    type?: 'text' | 'select';
    options?: { label: string; value: string }[];
    placeholder?: string;
}

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

// WRAPPER FOR REUSABLE FORM SELECT TO HANDLE READ-ONLY STATE
interface FormSelectWrapperProps {
    label: string;
    value?: string;
    isEditing: boolean;
    options: { label: string; value: string; subLabel?: string }[];
    onChange: (val: string) => void;
    isSearchable?: boolean;
    placeholder?: string;
}

const FormSelectWrapper: React.FC<FormSelectWrapperProps> = ({ label, value, isEditing, options, onChange, isSearchable = true, placeholder = "Select..." }) => {
    const displayValue = options.find(o => o.value === value)?.label || value;

    return (
        <div className="lpv-field">
            {isEditing ? (
                <FormSelect
                    label={label}
                    value={value || ""}
                    options={options}
                    onChange={onChange}
                    isSearchable={isSearchable}
                    placeholder={placeholder}
                />
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


// import React, { useState, useEffect } from 'react';
// import {
//     User, Phone, MapPin, ShieldCheck,
//     FileText, Edit3, Save, X, Fingerprint,
//     GraduationCap, AlertCircle, Info, Loader2, Camera, Heart, Briefcase, CheckCircle2, Globe, Edit2
// } from 'lucide-react';
// import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import { doc, updateDoc } from 'firebase/firestore';
// import Autocomplete from "react-google-autocomplete";
// import './LearnerProfileView.css';
// import { storage, db } from '../../../../lib/firebase';
// import { StatusModal, type StatusType } from '../../../../components/common/StatusModal/StatusModal';
// import { useToast } from '../../../../components/common/Toast/Toast';

// /* ── QCTO DICTIONARIES ─────────────────────────────────────────────────── */
// const QCTO_EQUITY = [{ label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" }, { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" }, { label: "Other", value: "Oth" }];
// const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
// const QCTO_LANGUAGES = [{ label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" }, { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" }, { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" }, { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" }, { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" }, { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" }, { label: "Other", value: "Oth" }];
// const QCTO_CITIZEN_STATUS = [{ label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" }, { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }];
// const QCTO_SOCIOECONOMIC = [{ label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" }, { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" }, { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" }, { label: "Not working - disabled", value: "08" }];
// const QCTO_DISABILITY_STATUS = [{ label: "None", value: "N" }, { label: "Sight", value: "01" }, { label: "Hearing", value: "02" }, { label: "Communication", value: "03" }, { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" }, { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" }];
// const QCTO_PROVINCES = [{ label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" }, { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" }, { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" }, { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" }, { label: "Limpopo", value: "9" }];

// // SMART STATS-SA LOOKUP (Prefix Matcher)
// const getAreaCode = (postal: string) => {
//     if (!postal) return "";
//     const p = postal.trim();
//     if (p.startsWith("00") || p.startsWith("01") || p.startsWith("02")) return "TSH"; // Tshwane (includes 0002)
//     if (p.startsWith("14") || p.startsWith("15") || p.startsWith("16")) return "EKU"; // Ekurhuleni
//     if (p.startsWith("20") || p.startsWith("21")) return "JHB"; // Johannesburg
//     if (p.startsWith("40") || p.startsWith("41")) return "ETH"; // eThekwini
//     if (p.startsWith("7") || p.startsWith("80")) return "CPT";  // Cape Town
//     if (p.startsWith("93")) return "MAN"; // Mangaung
//     if (p.startsWith("83")) return "NC091"; // Sol Plaatje
//     return "";
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

//     const [formData, setFormData] = useState<any>({});
//     const [initialData, setInitialData] = useState<any>({});
//     const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
//     const [photoPreview, setPhotoPreview] = useState<string | null>(null);

//     const [modalConfig, setModalConfig] = useState<{
//         isOpen: boolean;
//         type: StatusType;
//         title: string;
//         message: string;
//     }>({ isOpen: false, type: 'info', title: '', message: '' });

//     useEffect(() => {
//         if (profile) {
//             const d = profile.demographics || {};

//             // Try database first, fallback to Smart Prefix matcher
//             const savedAreaCode = d.statssaAreaCode || d.statsaaAreaCode || '';
//             const calculatedAreaCode = savedAreaCode || getAreaCode(d.learnerHomeAddressPostalCode);

//             const initialLoadData = {
//                 fullName: profile.fullName || '',
//                 email: profile.email || '',
//                 phone: profile.phone || d.learnerPhoneNumber || '',
//                 idNumber: profile.idNumber || '',
//                 streetAddress: d.learnerHomeAddress1 || '',
//                 city: d.learnerHomeAddress2 || '',
//                 provinceCode: d.provinceCode || '',
//                 postalCode: d.learnerHomeAddressPostalCode || '',
//                 equityCode: d.equityCode || '',
//                 genderCode: d.genderCode || '',
//                 homeLanguageCode: d.homeLanguageCode || '',
//                 citizenStatusCode: d.citizenResidentStatusCode || '',
//                 socioeconomicCode: d.socioeconomicStatusCode || '',
//                 disabilityCode: d.disabilityStatusCode || 'N',
//                 disabilityRating: d.disabilityRating || '',
//                 statssaAreaCode: calculatedAreaCode,
//                 lat: d.lat || 0,
//                 lng: d.lng || 0,
//                 nokName: profile.nextOfKin?.name || '',
//                 nokRelationship: profile.nextOfKin?.relationship || '',
//                 nokPhone: profile.nextOfKin?.phone || '',
//                 profilePhotoUrl: profile.profilePhotoUrl || ''
//             };

//             setFormData(initialLoadData);
//             setInitialData(initialLoadData); // Lock in the comparison object
//             setPhotoPreview(profile.profilePhotoUrl || null);
//         }
//     }, [profile]);

//     const handleAddressSelected = (place: any) => {
//         const components = place.address_components;
//         if (!components) return;

//         const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
//         const rawProv = getComp("administrative_area_level_1");
//         const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));

//         const postal = getComp("postal_code");
//         const areaCode = getAreaCode(postal);

//         const buildingName = place.name || "";
//         const formatted = place.formatted_address || "";
//         const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

//         // STRICT COORDINATE EXTRACTION
//         let extractedLat = 0;
//         let extractedLng = 0;

//         if (place.geometry && place.geometry.location) {
//             extractedLat = typeof place.geometry.location.lat === 'function'
//                 ? place.geometry.location.lat()
//                 : place.geometry.location.lat;

//             extractedLng = typeof place.geometry.location.lng === 'function'
//                 ? place.geometry.location.lng()
//                 : place.geometry.location.lng;
//         }

//         setFormData((prev: any) => ({
//             ...prev,
//             streetAddress: streetLine,
//             city: getComp("locality") || getComp("sublocality_level_1"),
//             provinceCode: provinceMatch ? provinceMatch.value : prev.provinceCode,
//             postalCode: postal,
//             statssaAreaCode: areaCode || prev.statssaAreaCode,
//             lat: extractedLat,
//             lng: extractedLng
//         }));
//     };

//     const handlePostalManualChange = (val: string) => {
//         const areaCode = getAreaCode(val) || formData.statssaAreaCode;
//         setFormData((prev: any) => ({ ...prev, postalCode: val, statssaAreaCode: areaCode }));
//     };

//     const openInMaps = () => {
//         if (!formData.lat || formData.lat === 0) return;
//         window.open(`https://www.google.com/maps?q=$${formData.lat},${formData.lng}`, '_blank');
//     };

//     const handleSave = async () => {
//         if (!profile?.id) return;

//         // CHECK FOR CHANGES
//         const hasFormChanges = JSON.stringify(formData) !== JSON.stringify(initialData);
//         const hasPhotoChanges = profilePhoto !== null;

//         if (!hasFormChanges && !hasPhotoChanges) {
//             setIsEditing(false);
//             toast.info("No changes detected. Editing mode closed.");
//             return;
//         }

//         setSaving(true);

//         try {
//             let finalPhotoUrl = formData.profilePhotoUrl;
//             if (profilePhoto && user?.uid) {
//                 const storageRef = ref(storage, `learners/${user.uid}/profile_${Date.now()}`);
//                 const snapshot = await uploadBytes(storageRef, profilePhoto);
//                 finalPhotoUrl = await getDownloadURL(snapshot.ref);
//             }

//             const updatedData = {
//                 fullName: formData.fullName,
//                 email: formData.email,
//                 phone: formData.phone,
//                 profilePhotoUrl: finalPhotoUrl,
//                 demographics: {
//                     ...(profile.demographics || {}),
//                     learnerPhoneNumber: formData.phone,
//                     learnerHomeAddress1: formData.streetAddress,
//                     learnerHomeAddress2: formData.city,
//                     provinceCode: formData.provinceCode,
//                     learnerHomeAddressPostalCode: formData.postalCode,
//                     learnerPostalAddressPostCode: formData.postalCode,
//                     equityCode: formData.equityCode,
//                     genderCode: formData.genderCode,
//                     homeLanguageCode: formData.homeLanguageCode,
//                     citizenResidentStatusCode: formData.citizenStatusCode,
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
//                 updatedAt: new Date().toISOString()
//             };

//             // BYPASS LOCAL STATE CRASH: Direct Database Update
//             const learnerRef = doc(db, 'learners', profile.id);
//             await updateDoc(learnerRef, updatedData);

//             // Attempt to sync Zustand local state, ignore missing array error
//             try {
//                 await onUpdate(profile.id, updatedData);
//             } catch (localError: any) {
//                 if (!localError.message?.includes('Record not found in local state')) {
//                     throw localError;
//                 }
//             }

//             setIsEditing(false);
//             setProfilePhoto(null);

//             // UPDATE INITIAL STATE SO FUTURE SAVES DON'T TRIGGER UNLESS EDITED AGAIN
//             setInitialData(formData);

//             // SUCCESS MODAL
//             setModalConfig({
//                 isOpen: true,
//                 type: 'success',
//                 title: 'Profile Updated',
//                 message: 'Your profile has been successfully updated and securely synchronized.'
//             });

//         } catch (error) {
//             console.error('❌ Update failed', error);

//             // ERROR MODAL
//             setModalConfig({
//                 isOpen: true,
//                 type: 'error',
//                 title: 'Update Failed',
//                 message: 'Failed to save profile to the database. Please check your connection and try again.'
//             });
//         } finally {
//             setSaving(false);
//         }
//     };

//     const update = (field: string, val: string) => setFormData((prev: any) => ({ ...prev, [field]: val }));
//     const getLabel = (value: string, list: any[]) => list.find(i => i.value === value)?.label || value || '—';
//     const isVerified = profile?.profileCompleted;

//     // Reset edits if cancelled
//     const handleCancel = () => {
//         setFormData(initialData);
//         setPhotoPreview(profile?.profilePhotoUrl || null);
//         setProfilePhoto(null);
//         setIsEditing(false);
//     };

//     return (
//         <div className="lpv-wrapper animate-fade-in">

//             {/* RENDER STATUS MODAL ON TOP */}
//             {modalConfig.isOpen && (
//                 <StatusModal
//                     type={modalConfig.type}
//                     title={modalConfig.title}
//                     message={modalConfig.message}
//                     onClose={() => setModalConfig(prev => ({ ...prev, isOpen: false }))}
//                 />
//             )}

//             <div className={`lpv-banner ${isVerified ? 'lpv-banner--verified' : 'lpv-banner--pending'}`}>
//                 <ShieldCheck size={22} className="lpv-banner__icon" />
//                 <div style={{ flex: 1 }}>
//                     <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                         <span className="lpv-banner__title">Compliance Status: {isVerified ? 'Fully Compliant' : 'Verification Required'}</span>
//                         {profile?.updatedAt && <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Last Synced: {new Date(profile.updatedAt).toLocaleDateString()}</span>}
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
//                                         <input type="file" accept="image/*" onChange={(e) => {
//                                             if (e.target.files && e.target.files[0]) {
//                                                 setProfilePhoto(e.target.files[0]);
//                                                 setPhotoPreview(URL.createObjectURL(e.target.files[0]));
//                                             }
//                                         }} hidden />
//                                     </label>
//                                 )}
//                             </div>
//                             <div>
//                                 <h4 className="lpv-display-name">{formData.fullName}</h4>
//                                 <p className="lpv-display-sub">{getLabel(formData.genderCode, QCTO_GENDER)} • {getLabel(formData.equityCode, QCTO_EQUITY)}</p>
//                             </div>
//                         </div>

//                         <div className="lpv-grid-2">
//                             <ROField label="National ID" value={formData.idNumber} icon={<Fingerprint size={13} />} />
//                             <EditField label="Citizenship" value={formData.citizenStatusCode} isEditing={isEditing} type="select" options={QCTO_CITIZEN_STATUS} onChange={(v: string) => update('citizenStatusCode', v)} />
//                             <EditField label="Home Language" value={formData.homeLanguageCode} isEditing={isEditing} type="select" options={QCTO_LANGUAGES} onChange={(v: string) => update('homeLanguageCode', v)} />
//                             <EditField label="Contact Number" value={formData.phone} icon={<Phone size={13} />} isEditing={isEditing} onChange={(v: string) => update('phone', v)} />
//                         </div>
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title"><Briefcase size={16} /> Background & STATS-SA</h3>
//                         <div className="lpv-grid-2">
//                             <EditField label="Employment Status" value={formData.socioeconomicCode} isEditing={isEditing} type="select" options={QCTO_SOCIOECONOMIC} onChange={(v: string) => update('socioeconomicCode', v)} />
//                             <EditField label="Disability Status" value={formData.disabilityCode} isEditing={isEditing} type="select" options={QCTO_DISABILITY_STATUS} onChange={(v: string) => update('disabilityCode', v)} />
//                             <EditField
//                                 label="STATS-SA Area Code"
//                                 value={formData.statssaAreaCode}
//                                 isEditing={isEditing}
//                                 onChange={(v: string) => update('statssaAreaCode', v)}
//                                 placeholder="Area/Municipality Code..."
//                             />
//                         </div>
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>
//                         {isEditing && (
//                             <div className="lpv-search-box">
//                                 <label className="lpv-field__label" style={{ color: 'var(--mlab-blue)' }}><Globe size={12} /> Google Search Verification</label>
//                                 <Autocomplete
//                                     apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
//                                     onPlaceSelected={handleAddressSelected}
//                                     options={{
//                                         types: [],
//                                         componentRestrictions: { country: "za" },
//                                         fields: ["address_components", "geometry", "formatted_address", "name"]
//                                     }}
//                                     className="lpv-input lpv-search-input"
//                                     placeholder="Verify your address here..."
//                                 />
//                             </div>
//                         )}
//                         <div className={`lpv-address-editor ${isEditing ? 'lpv-address-editor--editing' : ''}`}>
//                             {isEditing && (
//                                 <div className="editor-header">
//                                     <div className="editor-title"><Edit2 size={12} /> <span>Override Address</span></div>
//                                     {formData.lat !== 0 && (
//                                         <button className="v-pill" onClick={openInMaps} type="button">
//                                             <CheckCircle2 size={11} /> GPS Verified
//                                         </button>
//                                     )}
//                                 </div>
//                             )}

//                             <div className="lpv-full-field" style={{ marginTop: isEditing ? '1rem' : 0 }}>
//                                 <EditField label="Street Line" value={formData.streetAddress} isEditing={isEditing} onChange={(v: string) => update('streetAddress', v)} />
//                             </div>
//                             <div className="lpv-grid-3" style={{ marginTop: '1rem' }}>
//                                 <EditField label="City" value={formData.city} isEditing={isEditing} onChange={(v: string) => update('city', v)} />
//                                 <EditField label="Province" value={formData.provinceCode} isEditing={isEditing} type="select" options={QCTO_PROVINCES} onChange={(v: string) => update('provinceCode', v)} />
//                                 <EditField label="Postal Code" value={formData.postalCode} isEditing={isEditing} onChange={handlePostalManualChange} />
//                             </div>
//                         </div>
//                     </section>

//                     <section className="lpv-panel">
//                         <h3 className="lp-section-title"><Heart size={16} /> Emergency Contact</h3>
//                         <div className="lpv-grid-3">
//                             <EditField label="Contact Name" value={formData.nokName} isEditing={isEditing} onChange={(v: string) => update('nokName', v)} />
//                             <EditField label="Relationship" value={formData.nokRelationship} isEditing={isEditing} onChange={(v: string) => update('nokRelationship', v)} />
//                             <EditField label="Contact Phone" value={formData.nokPhone} isEditing={isEditing} onChange={(v: string) => update('nokPhone', v)} />
//                         </div>
//                     </section>
//                 </div>

//                 <aside className="lpv-aside">
//                     <div className="lpv-qual-card">
//                         <div className="lpv-qual-card__label"><GraduationCap size={13} /> Enrollment</div>
//                         <p className="lpv-qual-card__name">{profile?.qualification?.name || 'Programme Pending'}</p>
//                         <span className="lpv-qual-card__saqa">SAQA ID: {profile?.qualification?.saqaId || '—'}</span>
//                     </div>

//                     <div className="lpv-vault-card">
//                         <h4 className="lpv-vault-card__title"><FileText size={15} /> Document Vault</h4>
//                         <div className="lpv-vault-links">
//                             <DocVaultLink label="Certified ID" url={profile?.documents?.idUrl} />
//                             <DocVaultLink label="School Certificate" url={profile?.documents?.qualUrl} />
//                             <DocVaultLink label="Latest CV" url={profile?.documents?.cvUrl} />
//                         </div>
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

// interface EditFieldProps {
//     label: string;
//     value?: string;
//     isEditing: boolean;
//     onChange: (val: string) => void;
//     icon?: React.ReactNode;
//     type?: 'text' | 'select';
//     options?: { label: string; value: string }[];
//     placeholder?: string;
// }

// const ROField = ({ label, value, icon }: { label: string; value?: string; icon?: React.ReactNode }) => (
//     <div className="lpv-field">
//         <div className="lpv-field__label">{icon}{label}</div>
//         <div className="lpv-field__value">{value || '—'}</div>
//     </div>
// );

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

// const DocVaultLink = ({ label, url }: { label: string; url?: string }) => (
//     <a href={url || '#'} target="_blank" rel="noopener noreferrer" className={`lpv-doc-link ${url ? 'lpv-doc-link--available' : 'lpv-doc-link--missing'}`}>
//         <span className="lpv-doc-link__name"><FileText size={13} /> {label}</span>
//         {url ? <Info size={13} color="var(--mlab-blue)" /> : <AlertCircle size={13} />}
//     </a>
// );