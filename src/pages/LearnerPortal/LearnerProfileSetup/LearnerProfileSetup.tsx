// src/pages/LearnerPortal/LearnerProfileSetup.tsx

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, FileText, CheckCircle,
    Save, ChevronRight, ShieldCheck, MapPin, Loader2, Heart, Camera,
    Briefcase, Globe, Lock
} from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './LearnerProfileSetup.css';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import { FormSelect } from '../../../components/common/FormSelect/FormSelect';

// FETCH STATSSA CODES DYNAMICALLY
import { fetchStatssaCodes } from '../../../services/qctoService';

// ════════════════════════════════════════════════════════════════════════════
// QCTO DICTIONARIES (Strictly defined locally to prevent import errors)
// ════════════════════════════════════════════════════════════════════════════
const QCTO_EQUITY = [
    { label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" },
    { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" },
    { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }
];

const QCTO_GENDER = [
    { label: "Male", value: "M" }, { label: "Female", value: "F" }
];

const QCTO_LANGUAGES = [
    { label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" },
    { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" },
    { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" },
    { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" },
    { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" },
    { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" },
    { label: "Other", value: "Oth" }
];

const QCTO_CITIZEN_STATUS = [
    { label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" },
    { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }
];

const QCTO_NATIONALITY = [
    { label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" },
    { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" },
    { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" },
    { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" },
    { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" },
    { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" },
    { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" },
    { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" },
    { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }
];

const QCTO_SOCIOECONOMIC = [
    { label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" },
    { label: "Not working - not looking for work", value: "03" }, { label: "Home-maker", value: "04" },
    { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" },
    { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" },
    { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" },
    { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }
];

const QCTO_DISABILITY_STATUS = [
    { label: "None", value: "N" }, { label: "Sight", value: "01" },
    { label: "Hearing", value: "02" }, { label: "Communication", value: "03" },
    { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" },
    { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" },
    { label: "Disabled but Unspecified", value: "09" }
];

const QCTO_DISABILITY_RATING = [
    { label: "No difficulty", value: "01" }, { label: "Some difficulty", value: "02" },
    { label: "A lot of difficulty", value: "03" }, { label: "Cannot do at all", value: "04" },
    { label: "Cannot yet be determined", value: "06" }, { label: "Part of multiple difficulties", value: "60" },
    { label: "May have difficulty", value: "70" }, { label: "Former difficulty", value: "80" }
];

const QCTO_PROVINCES = [
    { label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" },
    { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" },
    { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" },
    { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" },
    { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }
];

const QCTO_TITLES = [
    { label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" },
    { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }
];

const QCTO_IMMIGRANT = [
    { label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }
];

const QCTO_ALT_ID_TYPE = [
    { label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" },
    { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" },
    { label: "540 - Birth Certificate", value: "540" }
];

const NOK_RELATIONSHIPS = ["Mother", "Father", "Sister", "Brother", "Guardian", "Spouse", "Partner", "Aunt", "Uncle", "Grandparent", "Cousin"];

interface LearnerProfileData {
    // Identity
    idNumber: string;
    phone: string;
    profilePhotoUrl?: string;
    learnerTitle: string;
    learnerMiddleName: string;
    genderCode: string;
    equityCode: string;
    homeLanguageCode: string;
    citizenStatusCode: string;
    nationalityCode: string;
    immigrantStatus: string;
    alternativeIdType: string;

    // Background
    highestQualification: string;
    flcStatementOfResultNumber: string;
    socioeconomicCode: string;
    disabilityCode: string;
    disabilityRating: string;

    // Address
    streetAddress: string;
    city: string;
    provinceCode: string;
    postalCode: string;
    statssaAreaCode: string;
    lat: number;
    lng: number;

    // Postal Address
    sameAsResidential: boolean;
    postalAddress1: string;
    postalAddress2: string;
    postalAddress3: string;
    customPostalCode: string;

    // Next of Kin
    nokName: string;
    nokRelationship: string;
    nokPhone: string;

    // Compliance
    popiaConsent: boolean;
    hasIdDoc?: boolean;
    hasQualDoc?: boolean;
    hasCvDoc?: boolean;
}

const getQCTODate = () => {
    const d = new Date();
    return d.getFullYear().toString() +
        (d.getMonth() + 1).toString().padStart(2, '0') +
        d.getDate().toString().padStart(2, '0');
};

const formatAsText = (val?: string, expectedLength?: number) => {
    if (!val) return "";
    const clean = String(val).trim();
    if (expectedLength && clean.length < expectedLength) {
        return clean.padStart(expectedLength, '0');
    }
    return clean;
};

export const LearnerProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser, setUser, settings } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [fetchingInitial, setFetchingInitial] = useState(true);
    const [learnerDocId, setLearnerDocId] = useState<string | null>(null);
    const [showLegacyModal, setShowLegacyModal] = useState(false);

    // Dynamic STATSSA State
    const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);

    const [formData, setFormData] = useState<Partial<LearnerProfileData>>({
        popiaConsent: false,
        disabilityCode: 'N',
        sameAsResidential: true,
        alternativeIdType: '533',
        immigrantStatus: '03'
    });

    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [qualDoc, setQualDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    // Load STATSSA codes globally for this modal
    useEffect(() => {
        const loadCodes = async () => {
            const codes = await fetchStatssaCodes();
            setAllStatssaCodes(codes);
        };
        loadCodes();
    }, []);

    // Map dynamically fetched codes to FormSelect format
    const statssaOptions = useMemo(() => {
        return allStatssaCodes.map(c => ({
            value: c.statssa_area_code,
            label: `${c.statssa_area_code} - ${c.town}`,
            subLabel: `${c.area} (${c.local_municipality})`
        }));
    }, [allStatssaCodes]);

    // Load User Data
    useEffect(() => {
        const fetchExistingData = async () => {
            if (!user?.uid || !user?.email) return;
            try {
                let learnerData: any = null;
                let docId = null;

                const authQ = query(collection(db, 'learners'), where('authUid', '==', user.uid));
                const authSnap = await getDocs(authQ);

                if (!authSnap.empty) {
                    learnerData = authSnap.docs[0].data();
                    docId = authSnap.docs[0].id;
                } else {
                    const emailQ = query(collection(db, 'learners'), where('email', '==', user.email));
                    const emailSnap = await getDocs(emailQ);
                    if (!emailSnap.empty) {
                        learnerData = emailSnap.docs[0].data();
                        docId = emailSnap.docs[0].id;
                        await updateDoc(emailSnap.docs[0].ref, { authUid: user.uid });
                    }
                }

                if (learnerData) {
                    setLearnerDocId(docId);
                    const d = learnerData.demographics || {};
                    const nok = learnerData.nextOfKin || {};
                    const docs = learnerData.documents || {};

                    const isPostalCustom = d.learnerPostalAddress1 && d.learnerPostalAddress1 !== d.learnerHomeAddress1;

                    setFormData({
                        idNumber: learnerData.idNumber || '',
                        phone: learnerData.phone || d.learnerPhoneNumber || '',

                        // Background
                        highestQualification: learnerData.highestQualification || '',
                        flcStatementOfResultNumber: d.flcStatementOfResultNumber || d.flcResultNumber || '',

                        // Identity
                        learnerTitle: d.learnerTitle || '',
                        learnerMiddleName: d.learnerMiddleName || '',
                        nationalityCode: d.nationalityCode || '',
                        immigrantStatus: d.immigrantStatus || '03',
                        alternativeIdType: d.alternativeIdType || '533',
                        statssaAreaCode: d.statssaAreaCode || d.statsaaAreaCode || '',

                        // Address
                        streetAddress: d.learnerHomeAddress1 || '',
                        city: d.learnerHomeAddress2 || '',
                        provinceCode: d.provinceCode || '',
                        postalCode: d.learnerHomeAddressPostalCode || '',
                        lat: d.lat || 0,
                        lng: d.lng || 0,

                        // Postal
                        sameAsResidential: !isPostalCustom,
                        postalAddress1: isPostalCustom ? d.learnerPostalAddress1 : '',
                        postalAddress2: isPostalCustom ? d.learnerPostalAddress2 : '',
                        postalAddress3: isPostalCustom ? d.learnerPostalAddress3 : '',
                        customPostalCode: isPostalCustom ? d.learnerPostalAddressPostCode : '',

                        // Demographics
                        equityCode: d.equityCode || '',
                        genderCode: d.genderCode || '',
                        homeLanguageCode: d.homeLanguageCode || '',
                        citizenStatusCode: d.citizenResidentStatusCode || 'SA',
                        socioeconomicCode: d.socioeconomicStatusCode || '',
                        disabilityCode: d.disabilityStatusCode || 'N',
                        disabilityRating: d.disabilityRating || '',
                        popiaConsent: d.popiActAgree === 'Y',
                        profilePhotoUrl: learnerData.profilePhotoUrl || '',

                        // NOK
                        nokName: nok.name || '',
                        nokRelationship: nok.relationship || '',
                        nokPhone: nok.phone || '',

                        // Docs
                        hasIdDoc: !!docs.idUrl,
                        hasQualDoc: !!docs.qualUrl,
                        hasCvDoc: !!docs.cvUrl
                    });

                    if (learnerData.profilePhotoUrl) setPhotoPreview(learnerData.profilePhotoUrl);

                    if (learnerData.profileCompleted === true && (!d.equityCode || !d.provinceCode || (!d.statssaAreaCode && !d.statsaaAreaCode) || !d.learnerTitle)) {
                        setShowLegacyModal(true);
                    }
                }
            } catch (err) {
                console.error('Error re-hydrating form:', err);
            } finally {
                setFetchingInitial(false);
            }
        };
        fetchExistingData();
    }, [user]);

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handlePlaceSelected = (place: any) => {
        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        const provString = getComp("administrative_area_level_1");
        const matchedProv = QCTO_PROVINCES.find(p => provString.includes(p.label))?.value || '';
        const townName = getComp("locality") || getComp("sublocality_level_1");
        const postal = getComp("postal_code");
        const formattedAddress = place.formatted_address || "";

        // Auto-match STATSSA Code via Google Map string
        const match = allStatssaCodes.find(c => c.town.toLowerCase() === townName.toLowerCase());

        setFormData(prev => ({
            ...prev,
            streetAddress: formattedAddress,
            city: townName,
            provinceCode: matchedProv,
            postalCode: postal,
            statssaAreaCode: match ? match.statssa_area_code : prev.statssaAreaCode,
            lat: place.geometry?.location?.lat() || 0,
            lng: place.geometry?.location?.lng() || 0
        }));
    };

    const handleChange = (field: keyof LearnerProfileData, value: string | boolean) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleFileUpload = async (file: File, path: string) => {
        const storageRef = ref(storage, path);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    };

    const handleSubmit = async () => {
        if (!user?.uid) return;

        const hasId = idDoc || formData.hasIdDoc;
        const hasQual = qualDoc || formData.hasQualDoc;

        if (!hasId || !hasQual) return alert('Certified ID and Qualification are mandatory.');
        if (!formData.popiaConsent) return alert('You must accept the POPIA consent to continue.');
        if (!formData.statssaAreaCode) return alert('You must select a STATS-SA Area Code.');

        setLoading(true);
        try {
            const getExt = (f: File) => f.name.split('.').pop();

            let finalPhotoUrl = formData.profilePhotoUrl;
            if (profilePhoto) {
                finalPhotoUrl = await handleFileUpload(profilePhoto, `learners/${user.uid}/profile_${Date.now()}.${getExt(profilePhoto)}`);
            }

            const idUrl = idDoc ? await handleFileUpload(idDoc, `learners/${user.uid}/id_doc_${Date.now()}.${getExt(idDoc)}`) : null;
            const qualUrl = qualDoc ? await handleFileUpload(qualDoc, `learners/${user.uid}/qual_${Date.now()}.${getExt(qualDoc)}`) : null;
            const cvUrl = cvDoc ? await handleFileUpload(cvDoc, `learners/${user.uid}/cv_${Date.now()}.${getExt(cvDoc)}`) : null;

            const cleanedPhone = formatAsText(formData.phone, 10);

            // Determine Postal Logic
            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress1;
            const postalLine2 = formData.sameAsResidential ? formData.city : formData.postalAddress2;
            const residentialZip = formatAsText(formData.postalCode, 4);
            const postalCodeFinal = formData.sameAsResidential ? residentialZip : formatAsText(formData.customPostalCode, 4);

            const finalData: any = {
                phone: cleanedPhone,
                idNumber: String(formData.idNumber),
                profilePhotoUrl: finalPhotoUrl,
                highestQualification: formData.highestQualification,
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
                demographics: {
                    learnerTitle: formData.learnerTitle,
                    learnerMiddleName: formData.learnerMiddleName,
                    genderCode: formData.genderCode,
                    equityCode: formData.equityCode,
                    homeLanguageCode: formData.homeLanguageCode,
                    citizenResidentStatusCode: formData.citizenStatusCode,
                    nationalityCode: formData.nationalityCode,
                    immigrantStatus: formData.immigrantStatus,
                    alternativeIdType: formData.alternativeIdType,
                    socioeconomicStatusCode: formData.socioeconomicCode,
                    disabilityStatusCode: formData.disabilityCode,
                    disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
                    provinceCode: formData.provinceCode,

                    flcStatementOfResultNumber: formData.flcStatementOfResultNumber,

                    // Core QCTO Address Link
                    statssaAreaCode: formData.statssaAreaCode,
                    statsaaAreaCode: formData.statssaAreaCode,

                    // Residential
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    learnerHomeAddressPostalCode: residentialZip,
                    lat: formData.lat,
                    lng: formData.lng,

                    // Postal
                    learnerPostalAddress1: postalLine1,
                    learnerPostalAddress2: postalLine2,
                    learnerPostalAddress3: formData.postalAddress3 || '',
                    learnerPostalAddressPostCode: postalCodeFinal,

                    learnerPhoneNumber: cleanedPhone,
                    popiActAgree: "Y",
                    popiActDate: getQCTODate()
                },
                nextOfKin: {
                    name: formData.nokName,
                    relationship: formData.nokRelationship,
                    phone: formatAsText(formData.nokPhone, 10)
                }
            };

            const currentDocs: any = { ...(user as any).documents || {} };
            if (idUrl) currentDocs.idUrl = idUrl;
            if (qualUrl) currentDocs.qualUrl = qualUrl;
            if (cvUrl) currentDocs.cvUrl = cvUrl;
            if (Object.keys(currentDocs).length > 0) {
                finalData.documents = { ...currentDocs, updatedAt: new Date().toISOString() };
            }

            await updateDoc(doc(db, 'users', user.uid), finalData);
            if (learnerDocId) await updateDoc(doc(db, 'learners', learnerDocId), finalData);

            if (setUser) {
                setUser({ ...user, ...finalData, profileCompleted: true } as any);
            }

            await refreshUser();
            navigate('/portal', { replace: true });

        } catch (error) {
            console.error('Final Submission Error:', error);
            alert('Error saving profile. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    if (fetchingInitial) return (
        <div className="lp-loading" style={{ position: 'absolute', right: 0, left: 0, bottom: 0, top: 0 }}>
            <Loader2 className="spin" size={40} color="var(--mlab-green)" />
            <h2 className="lp-loading__title">Syncing Record</h2>
            <p className="lp-loading__sub">Connecting to the mLab Secure Cloud...</p>
        </div>
    );

    return (
        <>
            {showLegacyModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                    <StatusModal
                        type="info"
                        title="Compliance Update Required"
                        message="To meet new QCTO government regulations, we require a few additional demographic details. Please quickly verify your information to access your dashboard."
                        onClose={() => setShowLegacyModal(false)}
                        confirmText="Let's do it"
                    />
                </div>
            )}

            <div className="lp-container animate-fade-in">
                <div className="lp-card">
                    <div className="lp-header">
                        <img height={50} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                        <h1 className="lp-header__title">Compliance Profile</h1>
                        <p className="lp-header__sub">Step {step} of 3: Ensure your details are QCTO-ready.</p>
                        <div className="lp-stepper">
                            <div className={`lp-step ${step >= 1 ? 'active' : ''}`}>1. Identity</div>
                            <div className="lp-step-line" />
                            <div className={`lp-step ${step >= 2 ? 'active' : ''}`}>2. Background</div>
                            <div className="lp-step-line" />
                            <div className={`lp-step ${step >= 3 ? 'active' : ''}`}>3. Compliance</div>
                        </div>
                    </div>

                    {step === 1 && (
                        <div className="lp-form-body animate-fade-in">
                            <h3 className="lp-section-title"><User size={16} /> Identity Details</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                                <div style={{ position: 'relative' }}>
                                    <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                        {photoPreview ? <img src={photoPreview} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <User size={40} color="#94a3b8" />}
                                    </div>
                                    <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-blue)', color: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white' }}>
                                        <Camera size={16} /><input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                                    </label>
                                </div>
                                <div><h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a' }}>Profile Picture</h4><p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem' }}>Upload a clear headshot.</p></div>
                            </div>

                            <div className="lp-grid">
                                <FormSelect label="Title" value={formData.learnerTitle || ""} options={QCTO_TITLES} onChange={v => handleChange('learnerTitle', v)} isSearchable={false} />
                                <FG label="Middle Name"><input className="lp-input" value={formData.learnerMiddleName || ''} onChange={e => handleChange('learnerMiddleName', e.target.value)} /></FG>

                                <FG label="ID / Passport Number"><input className="lp-input" value={formData.idNumber || ''} onChange={e => handleChange('idNumber', e.target.value)} /></FG>
                                <FormSelect label="Alternative ID Type" value={formData.alternativeIdType || "533"} options={QCTO_ALT_ID_TYPE} onChange={v => handleChange('alternativeIdType', v)} isSearchable={false} />
                                <FG label="Contact Number"><input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} /></FG>

                                <FormSelect label="Gender" value={formData.genderCode || ""} options={QCTO_GENDER} onChange={v => handleChange('genderCode', v)} isSearchable={false} />
                                <FormSelect label="Equity Group" value={formData.equityCode || ""} options={QCTO_EQUITY} onChange={v => handleChange('equityCode', v)} isSearchable={false} />
                                <FormSelect label="Home Language" value={formData.homeLanguageCode || ""} options={QCTO_LANGUAGES} onChange={v => handleChange('homeLanguageCode', v)} />

                                <FormSelect label="Citizenship Status" value={formData.citizenStatusCode || ""} options={QCTO_CITIZEN_STATUS} onChange={v => handleChange('citizenStatusCode', v)} isSearchable={false} />
                                <FormSelect label="Nationality" value={formData.nationalityCode || ""} options={QCTO_NATIONALITY} onChange={v => handleChange('nationalityCode', v)} />
                                <FormSelect label="Immigrant Status" value={formData.immigrantStatus || "03"} options={QCTO_IMMIGRANT} onChange={v => handleChange('immigrantStatus', v)} isSearchable={false} />
                            </div>
                            <div className="lp-actions"><div /><button className="lp-btn-primary" onClick={() => setStep(2)}>Next <ChevronRight size={15} /></button></div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="lp-form-body animate-fade-in">
                            <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>

                            <div style={{ marginBottom: '1.2rem', padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}>
                                    <Globe size={13} /> Secure Google Maps Search
                                </label>
                                <Autocomplete
                                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                    onPlaceSelected={handlePlaceSelected}
                                    options={{ types: ["address"], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address"] }}
                                    className="lp-input"
                                    placeholder="Search for your street or building..."
                                />
                            </div>

                            <div className="lp-grid mt-4">
                                <FG label="Street Address"><input className="lp-input" value={formData.streetAddress || ''} onChange={e => handleChange('streetAddress', e.target.value)} /></FG>
                                <FG label="City / Town"><input className="lp-input" value={formData.city || ''} onChange={e => handleChange('city', e.target.value)} /></FG>
                                <FormSelect label="Province" value={formData.provinceCode || ""} options={QCTO_PROVINCES} onChange={v => handleChange('provinceCode', v)} isSearchable={false} />
                                <FG label="Postal Code"><input className="lp-input" value={formData.postalCode || ''} onChange={e => handleChange('postalCode', e.target.value)} /></FG>

                                <div style={{ gridColumn: '1 / -1' }}>
                                    <FormSelect
                                        label="STATS-SA Area Code (Municipality) *"
                                        value={formData.statssaAreaCode || ""}
                                        options={statssaOptions}
                                        onChange={v => handleChange('statssaAreaCode', v)}
                                        placeholder="Search by town or code..."
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a' }}>
                                    <input type="checkbox" checked={formData.sameAsResidential} onChange={e => handleChange('sameAsResidential', e.target.checked)} />
                                    My Postal Address is the same as my Residential Address
                                </label>

                                {!formData.sameAsResidential && (
                                    <div className="animate-fade-in lp-grid" style={{ marginTop: '1rem' }}>
                                        <FG label="Postal Address Line 1"><input className="lp-input" value={formData.postalAddress1 || ''} onChange={e => handleChange('postalAddress1', e.target.value)} /></FG>
                                        <FG label="Postal Address Line 2"><input className="lp-input" value={formData.postalAddress2 || ''} onChange={e => handleChange('postalAddress2', e.target.value)} /></FG>
                                        <FG label="Postal Address Line 3"><input className="lp-input" value={formData.postalAddress3 || ''} onChange={e => handleChange('postalAddress3', e.target.value)} /></FG>
                                        <FG label="Postal Code"><input className="lp-input" value={formData.customPostalCode || ''} onChange={e => handleChange('customPostalCode', e.target.value)} /></FG>
                                    </div>
                                )}
                            </div>

                            <h3 className="lp-section-title mt-8"><Briefcase size={16} /> Background Details</h3>
                            <div className="lp-grid">
                                <FG label="Highest Qualification"><input className="lp-input" value={formData.highestQualification || ''} onChange={e => handleChange('highestQualification', e.target.value)} /></FG>

                                {/* MATRIC CERTIFICATE / FLC NUMBER FIELD */}
                                <FG label="Matric / Certificate Number"><input className="lp-input" value={formData.flcStatementOfResultNumber || ''} onChange={e => handleChange('flcStatementOfResultNumber', e.target.value)} placeholder="e.g. 123456789" /></FG>

                                <FormSelect label="Employment Status" value={formData.socioeconomicCode || ""} options={QCTO_SOCIOECONOMIC} onChange={v => handleChange('socioeconomicCode', v)} />
                                <FormSelect label="Disability Status" value={formData.disabilityCode || "N"} options={QCTO_DISABILITY_STATUS} onChange={v => handleChange('disabilityCode', v)} isSearchable={false} />
                                {formData.disabilityCode !== 'N' && (
                                    <FormSelect label="Disability Rating" value={formData.disabilityRating || ""} options={QCTO_DISABILITY_RATING} onChange={v => handleChange('disabilityRating', v)} isSearchable={false} />
                                )}
                            </div>
                            <div className="lp-actions"><button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button><button className="lp-btn-primary" onClick={() => setStep(3)}>Next <ChevronRight size={15} /></button></div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="lp-form-body animate-fade-in">
                            <h3 className="lp-section-title"><Heart size={16} /> Next of Kin</h3>
                            <div className="lp-grid mb-6">
                                <FG label="Full Name"><input className="lp-input" value={formData.nokName || ''} onChange={e => handleChange('nokName', e.target.value)} /></FG>
                                <FG label="Relationship"><select className="lp-input" value={formData.nokRelationship || ''} onChange={e => handleChange('nokRelationship', e.target.value)}><option value="">Select...</option>{NOK_RELATIONSHIPS.map(rel => <option key={rel} value={rel}>{rel}</option>)}</select></FG>
                                <FG label="Contact Number"><input className="lp-input" value={formData.nokPhone || ''} onChange={e => handleChange('nokPhone', e.target.value)} /></FG>
                            </div>
                            <h3 className="lp-section-title"><FileText size={16} /> Compliance Uploads</h3>
                            <div className="lp-upload-grid">
                                <DocUpload label="Certified ID Copy" file={idDoc} hasExisting={formData.hasIdDoc} onUpload={setIdDoc} />
                                <DocUpload label="Highest Qualification" file={qualDoc} hasExisting={formData.hasQualDoc} onUpload={setQualDoc} />
                                <DocUpload label="Updated CV" file={cvDoc} hasExisting={formData.hasCvDoc} onUpload={setCvDoc} />
                            </div>

                            {/* ENHANCED POPIA LEGAL CHECKPOINT */}
                            <div style={{
                                display: 'flex', gap: '1rem', alignItems: 'flex-start',
                                background: formData.popiaConsent ? '#f0fdf4' : '#f8fafc',
                                padding: '1.25rem', border: `1px solid ${formData.popiaConsent ? '#bbf7d0' : '#e2e8f0'}`,
                                borderRadius: '8px', marginTop: '2rem', transition: 'all 0.3s ease'
                            }}>
                                <input
                                    type="checkbox"
                                    id="popia-consent"
                                    checked={formData.popiaConsent}
                                    onChange={(e) => handleChange('popiaConsent', e.target.checked)}
                                    style={{ marginTop: '0.25rem', width: '20px', height: '20px', cursor: 'pointer', flexShrink: 0 }}
                                />
                                <div>
                                    <label htmlFor="popia-consent" style={{ fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', cursor: 'pointer' }}>
                                        <ShieldCheck size={18} color={formData.popiaConsent ? "#16a34a" : "#64748b"} />
                                        POPIA Consent & Terms of Service
                                    </label>
                                    <p style={{ fontSize: '0.85rem', color: '#475569', margin: 0, lineHeight: 1.5 }}>
                                        <strong>I formally consent to the processing of my data for QCTO compliance.</strong> By checking this box, I confirm that I have read and agree to the <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>Terms & Conditions</a> and the <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', textDecoration: 'underline' }}>POPIA Privacy Policy</a>.
                                    </p>
                                </div>
                            </div>

                            <div className="lp-actions" style={{ marginTop: '2rem' }}>
                                <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                                <button 
                                    className="lp-btn-primary" 
                                    onClick={handleSubmit} 
                                    disabled={loading || !formData.popiaConsent || !formData.statssaAreaCode}
                                    style={{ 
                                        opacity: (!formData.popiaConsent || loading || !formData.statssaAreaCode) ? 0.6 : 1, 
                                        cursor: (!formData.popiaConsent || loading || !formData.statssaAreaCode) ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '0.5rem'
                                    }}
                                >
                                    {loading ? 'Saving Compliance...' : 'Complete Profile'} 
                                    {formData.popiaConsent ? <Save size={16} /> : <Lock size={16} />}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="lp-fg"><label className="lp-fg-label">{label}</label>{children}</div>
);

const DocUpload: React.FC<{ label: string; file: File | null; hasExisting?: boolean; onUpload: (f: File) => void }> = ({ label, file, hasExisting, onUpload }) => (
    <div className={`lp-doc-card${(file || hasExisting) ? ' uploaded' : ''}`}>
        <div className="lp-doc-icon">{(file || hasExisting) ? <CheckCircle size={22} /> : <Upload size={22} />}</div>
        <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : (hasExisting ? 'Document on file' : 'Select PDF or Image')}</span></div>
        <input type="file" accept=".pdf,image/*" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);