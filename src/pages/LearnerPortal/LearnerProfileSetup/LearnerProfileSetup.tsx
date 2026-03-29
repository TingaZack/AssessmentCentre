// src/pages/LearnerPortal/LearnerProfileSetup.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, FileText, CheckCircle,
    Save, ChevronRight, ShieldCheck, MapPin, Loader2, Heart, Camera,
    Briefcase
} from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './LearnerProfileSetup.css';
import { StatusModal } from '../../../components/common/StatusModal/StatusModal';

import mLabLogo from '../../../assets/logo/mlab_logo.png';

// ════════════════════════════════════════════════════════════════════════════
// QCTO DICTIONARIES
// ════════════════════════════════════════════════════════════════════════════
const QCTO_EQUITY = [
    { label: "Black African", value: "BA" },
    { label: "Coloured", value: "BC" },
    { label: "Indian / Asian", value: "BI" },
    { label: "White", value: "Wh" },
    { label: "Other", value: "Oth" }
];

const QCTO_GENDER = [
    { label: "Male", value: "M" },
    { label: "Female", value: "F" }
];

const QCTO_LANGUAGES = [
    { label: "English", value: "Eng" },
    { label: "Afrikaans", value: "Afr" },
    { label: "isiZulu", value: "Zul" },
    { label: "isiXhosa", value: "Xho" },
    { label: "sePedi (Northern Sotho)", value: "Sep" },
    { label: "seSotho", value: "Ses" },
    { label: "seTswana", value: "Set" },
    { label: "siSwati", value: "Swa" },
    { label: "tshiVenda", value: "Tsh" },
    { label: "xiTsonga", value: "Xit" },
    { label: "isiNdebele", value: "Nde" },
    { label: "Sign Language", value: "SASL" },
    { label: "Other", value: "Oth" }
];

const QCTO_CITIZEN_STATUS = [
    { label: "South African Citizen", value: "SA" },
    { label: "Permanent Resident", value: "PR" },
    { label: "Dual Citizenship", value: "D" },
    { label: "Other", value: "O" }
];

const QCTO_SOCIOECONOMIC = [
    { label: "Employed", value: "01" },
    { label: "Unemployed, looking for work", value: "02" },
    { label: "Not working - not looking for work", value: "03" },
    { label: "Home-maker", value: "04" },
    { label: "Scholar / Student", value: "06" },
    { label: "Pensioner / Retired", value: "07" },
    { label: "Not working - disabled", value: "08" }
];

const QCTO_DISABILITY_STATUS = [
    { label: "None", value: "N" },
    { label: "Sight (even with glasses)", value: "01" },
    { label: "Hearing (even with hearing aid)", value: "02" },
    { label: "Communication (talking, listening)", value: "03" },
    { label: "Physical (moving, standing)", value: "04" },
    { label: "Intellectual (learning difficulty)", value: "05" },
    { label: "Emotional (psychological)", value: "06" },
    { label: "Multiple", value: "07" }
];

const QCTO_DISABILITY_RATING = [
    { label: "No difficulty", value: "01" },
    { label: "Some difficulty", value: "02" },
    { label: "A lot of difficulty", value: "03" },
    { label: "Cannot do at all", value: "04" }
];

const QCTO_PROVINCES = [
    { label: "Western Cape", value: "1" },
    { label: "Eastern Cape", value: "2" },
    { label: "Northern Cape", value: "3" },
    { label: "Free State", value: "4" },
    { label: "KwaZulu-Natal", value: "5" },
    { label: "North West", value: "6" },
    { label: "Gauteng", value: "7" },
    { label: "Mpumalanga", value: "8" },
    { label: "Limpopo", value: "9" }
];

const NOK_RELATIONSHIPS = ["Mother", "Father", "Sister", "Brother", "Guardian", "Spouse", "Partner", "Aunt", "Uncle", "Grandparent", "Cousin"];

interface LearnerProfileData {
    idNumber: string;
    phone: string;
    highestQualification: string;
    streetAddress: string;
    city: string;
    provinceCode: string;
    postalCode: string;
    sameAsResidential: boolean;
    postalAddress: string;
    customPostalCode: string;
    nokName: string;
    nokRelationship: string;
    nokPhone: string;
    popiaConsent: boolean;
    profilePhotoUrl?: string;
    equityCode: string;
    genderCode: string;
    homeLanguageCode: string;
    citizenStatusCode: string;
    socioeconomicCode: string;
    disabilityCode: string;
    disabilityRating: string;
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

    const [formData, setFormData] = useState<Partial<LearnerProfileData>>({
        popiaConsent: false,
        disabilityCode: 'N',
        sameAsResidential: true,
    });

    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [qualDoc, setQualDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);
    const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

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
                        highestQualification: learnerData.highestQualification || '',
                        streetAddress: d.learnerHomeAddress1 || '',
                        city: d.learnerHomeAddress2 || '',
                        provinceCode: d.provinceCode || '',
                        postalCode: d.learnerHomeAddressPostalCode || '',
                        sameAsResidential: !isPostalCustom,
                        postalAddress: isPostalCustom ? d.learnerPostalAddress1 : '',
                        customPostalCode: isPostalCustom ? d.learnerPostalAddressPostCode : '',
                        equityCode: d.equityCode || '',
                        genderCode: d.genderCode || '',
                        homeLanguageCode: d.homeLanguageCode || '',
                        citizenStatusCode: d.citizenResidentStatusCode || 'SA',
                        socioeconomicCode: d.socioeconomicStatusCode || '',
                        disabilityCode: d.disabilityStatusCode || 'N',
                        disabilityRating: d.disabilityRating || '',
                        popiaConsent: d.popiActAgree === 'Y',
                        profilePhotoUrl: learnerData.profilePhotoUrl || '',

                        nokName: nok.name || '',
                        nokRelationship: nok.relationship || '',
                        nokPhone: nok.phone || '',

                        hasIdDoc: !!docs.idUrl,
                        hasQualDoc: !!docs.qualUrl,
                        hasCvDoc: !!docs.cvUrl
                    });

                    if (learnerData.profilePhotoUrl) setPhotoPreview(learnerData.profilePhotoUrl);

                    if (learnerData.profileCompleted === true && (!d.equityCode || !d.provinceCode)) {
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

        setFormData(prev => ({
            ...prev,
            streetAddress: `${getComp("street_number")} ${getComp("route")}`.trim(),
            city: getComp("locality") || getComp("sublocality_level_1"),
            provinceCode: matchedProv,
            postalCode: getComp("postal_code")
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

            // Determine Postal Logic including dynamic Zip Code
            const postalLine1 = formData.sameAsResidential ? formData.streetAddress : formData.postalAddress;
            const postalLine2 = formData.sameAsResidential ? formData.city : "";
            const residentialZip = formatAsText(formData.postalCode, 4);
            const postalCodeFinal = formData.sameAsResidential ? residentialZip : formatAsText(formData.customPostalCode, 4);

            const finalData: any = {
                phone: cleanedPhone,
                idNumber: String(formData.idNumber),
                profilePhotoUrl: finalPhotoUrl,
                profileCompleted: true,
                updatedAt: new Date().toISOString(),
                demographics: {
                    genderCode: formData.genderCode,
                    equityCode: formData.equityCode,
                    homeLanguageCode: formData.homeLanguageCode,
                    citizenResidentStatusCode: formData.citizenStatusCode,
                    socioeconomicStatusCode: formData.socioeconomicCode,
                    disabilityStatusCode: formData.disabilityCode,
                    disabilityRating: formData.disabilityCode === 'N' ? '' : formData.disabilityRating,
                    provinceCode: formData.provinceCode,

                    // Residential
                    learnerHomeAddress1: formData.streetAddress,
                    learnerHomeAddress2: formData.city,
                    learnerHomeAddressPostalCode: residentialZip,

                    // Postal
                    learnerPostalAddress1: postalLine1,
                    learnerPostalAddress2: postalLine2,
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
                setUser({
                    ...user,
                    ...finalData,
                    profileCompleted: true
                } as any);
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
                                <FG label="ID / Passport Number"><input className="lp-input" value={formData.idNumber || ''} onChange={e => handleChange('idNumber', e.target.value)} /></FG>
                                <FG label="Contact Number"><input className="lp-input" type="tel" value={formData.phone || ''} onChange={e => handleChange('phone', e.target.value)} /></FG>
                                <FG label="Gender"><select className="lp-input" value={formData.genderCode || ''} onChange={e => handleChange('genderCode', e.target.value)}><option value="">Select...</option>{QCTO_GENDER.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                <FG label="Equity Group"><select className="lp-input" value={formData.equityCode || ''} onChange={e => handleChange('equityCode', e.target.value)}><option value="">Select...</option>{QCTO_EQUITY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                <FG label="Home Language"><select className="lp-input" value={formData.homeLanguageCode || ''} onChange={e => handleChange('homeLanguageCode', e.target.value)}><option value="">Select...</option>{QCTO_LANGUAGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                <FG label="Citizenship"><select className="lp-input" value={formData.citizenStatusCode || ''} onChange={e => handleChange('citizenStatusCode', e.target.value)}><option value="">Select...</option>{QCTO_CITIZEN_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                            </div>
                            <div className="lp-actions"><div /><button className="lp-btn-primary" onClick={() => setStep(2)}>Next <ChevronRight size={15} /></button></div>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="lp-form-body animate-fade-in">
                            <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>
                            <FG label="Physical Address Search"><Autocomplete apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} onPlaceSelected={handlePlaceSelected} options={{ types: ["address"], componentRestrictions: { country: "za" } }} className="lp-input" defaultValue={formData.streetAddress} placeholder="Type your street name..." /></FG>
                            <div className="lp-grid mt-4">
                                <FG label="City / Town"><input className="lp-input readonly-field" value={formData.city || ''} readOnly /></FG>
                                <FG label="Province"><select className="lp-input" value={formData.provinceCode || ''} onChange={e => handleChange('provinceCode', e.target.value)}><option value="">Select...</option>{QCTO_PROVINCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                <FG label="Postal Code"><input className="lp-input readonly-field" value={formData.postalCode || ''} readOnly /></FG>
                            </div>

                            <div style={{ marginTop: '1.5rem', background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 500, color: '#0f172a' }}>
                                    <input
                                        type="checkbox"
                                        checked={formData.sameAsResidential}
                                        onChange={e => handleChange('sameAsResidential', e.target.checked)}
                                    />
                                    My Postal Address is the same as my Residential Address
                                </label>

                                {!formData.sameAsResidential && (
                                    <div className="animate-fade-in" style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 2 }}>
                                            <FG label="Alternate Postal Address (e.g. P.O. Box)">
                                                <input
                                                    className="lp-input"
                                                    placeholder="P.O. Box 1234..."
                                                    value={formData.postalAddress || ''}
                                                    onChange={e => handleChange('postalAddress', e.target.value)}
                                                />
                                            </FG>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <FG label="Postal Code">
                                                <input
                                                    className="lp-input"
                                                    placeholder="0000"
                                                    value={formData.customPostalCode || ''}
                                                    onChange={e => handleChange('customPostalCode', e.target.value)}
                                                />
                                            </FG>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <h3 className="lp-section-title mt-8"><Briefcase size={16} /> Background Details</h3>
                            <div className="lp-grid">
                                <FG label="Highest Qualification"><input className="lp-input" value={formData.highestQualification || ''} onChange={e => handleChange('highestQualification', e.target.value)} /></FG>
                                <FG label="Employment Status"><select className="lp-input" value={formData.socioeconomicCode || ''} onChange={e => handleChange('socioeconomicCode', e.target.value)}><option value="">Select...</option>{QCTO_SOCIOECONOMIC.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                <FG label="Disability Status"><select className="lp-input" value={formData.disabilityCode || 'N'} onChange={e => handleChange('disabilityCode', e.target.value)}>{QCTO_DISABILITY_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
                                {formData.disabilityCode !== 'N' && (
                                    <FG label="Disability Rating"><select className="lp-input" value={formData.disabilityRating || ''} onChange={e => handleChange('disabilityRating', e.target.value)}><option value="">Select...</option>{QCTO_DISABILITY_RATING.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></FG>
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
                            <div className="lp-popia-box" style={{ color: 'grey' }}>
                                <ShieldCheck size={20} color="var(--mlab-blue)" /><h4>POPIA Consent</h4>
                                <p>I formally consent to the processing of my data for QCTO compliance.</p>
                                <label className="lp-popia-checkbox" style={{ color: 'black' }}>
                                    <input type="checkbox" checked={formData.popiaConsent} onChange={e => handleChange('popiaConsent', e.target.checked)} />
                                    <span>I agree to the terms.</span>
                                </label>
                            </div>
                            <div className="lp-actions"><button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button><button className="lp-btn-primary" onClick={handleSubmit} disabled={loading || !formData.popiaConsent}>{loading ? 'Saving Compliance...' : 'Complete Profile'} <Save size={15} /></button></div>
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