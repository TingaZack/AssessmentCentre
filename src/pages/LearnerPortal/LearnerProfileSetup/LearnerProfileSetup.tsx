
// src/pages/LearnerPortal/LearnerProfileSetup.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Autocomplete from "react-google-autocomplete";
import {
    User, Upload, FileText, CheckCircle,
    Save, ChevronRight, ShieldCheck, MapPin, Loader2, Phone, Heart, Info, Camera
} from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useStore } from '../../../store/useStore';
import { db, storage } from '../../../lib/firebase';
import './LearnerProfileSetup.css';

const NOK_RELATIONSHIPS = [
    "Mother", "Father", "Sister", "Brother", "Guardian",
    "Spouse", "Partner", "Aunt", "Uncle", "Grandparent", "Cousin"
];

interface LearnerProfileData {
    idNumber: string;
    nationality: string;
    homeLanguage: string;
    equity: string;
    gender: string;
    disabilityStatus: 'None' | 'Yes';
    disabilityType?: string;
    phone: string;
    streetAddress: string;
    city: string;
    province: string;
    postalCode: string;
    nokName: string;
    nokRelationship: string;
    nokPhone: string;
    employmentStatus: 'Employed' | 'Unemployed' | 'Student';
    highestQualification: string;
    popiaConsent: boolean;
    profilePhotoUrl?: string; // ✅ Added to interface
}

export const LearnerProfileSetup: React.FC = () => {
    const navigate = useNavigate();
    const { user, refreshUser } = useStore();

    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [fetchingInitial, setFetchingInitial] = useState(true);
    const [formData, setFormData] = useState<Partial<LearnerProfileData>>({
        popiaConsent: false
    });
    const [learnerDocId, setLearnerDocId] = useState<string | null>(null);

    // Document States
    const [idDoc, setIdDoc] = useState<File | null>(null);
    const [qualDoc, setQualDoc] = useState<File | null>(null);
    const [cvDoc, setCvDoc] = useState<File | null>(null);

    // ✅ Photo Upload States
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
                    const rawGender = learnerData.demographics?.genderCode || learnerData.gender || '';
                    let translatedGender = '';
                    if (rawGender.toUpperCase() === 'F') translatedGender = 'Female';
                    else if (rawGender.toUpperCase() === 'M') translatedGender = 'Male';
                    else translatedGender = rawGender;

                    setFormData({
                        idNumber: learnerData.idNumber || learnerData.id || '',
                        phone: learnerData.phone || learnerData.demographics?.learnerPhoneNumber || '',
                        nationality: learnerData.demographics?.nationalityCode || 'South African',
                        gender: translatedGender,
                        equity: learnerData.demographics?.equityCode || learnerData.equity || '',
                        highestQualification: learnerData.qualification?.name || '',
                        streetAddress: learnerData.demographics?.learnerHomeAddress1 || '',
                        city: learnerData.demographics?.learnerHomeAddress2 || '',
                        province: learnerData.demographics?.provinceCode || '',
                        postalCode: learnerData.demographics?.learnerHomeAddressPostalCode || '',
                        homeLanguage: learnerData.demographics?.homeLanguageCode || 'English',
                        employmentStatus: 'Unemployed',
                        popiaConsent: false,
                        profilePhotoUrl: learnerData.profilePhotoUrl || ''
                    });

                    // Set existing photo preview if available
                    if (learnerData.profilePhotoUrl) {
                        setPhotoPreview(learnerData.profilePhotoUrl);
                    }
                }
            } catch (err) {
                console.error('Error pre-filling data:', err);
            } finally {
                setFetchingInitial(false);
            }
        };
        fetchExistingData();
    }, [user]);

    // ✅ Photo Selection Handler
    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProfilePhoto(file);
            setPhotoPreview(URL.createObjectURL(file)); // Create local preview
        }
    };

    const handlePlaceSelected = (place: any) => {
        const addressComponents = place.address_components;
        const getComp = (type: string) => addressComponents?.find((c: any) => c.types.includes(type))?.long_name || "";

        const streetNumber = getComp("street_number");
        const route = getComp("route");

        setFormData(prev => ({
            ...prev,
            streetAddress: `${streetNumber} ${route}`.trim(),
            city: getComp("locality") || getComp("sublocality_level_1"),
            province: getComp("administrative_area_level_1"),
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
        if (!idDoc || !qualDoc) return alert('Certified ID and Qualification are mandatory.');
        if (!formData.popiaConsent) return alert('You must accept the POPIA consent to continue.');

        setLoading(true);
        try {
            let finalPhotoUrl = formData.profilePhotoUrl;
            if (profilePhoto) {
                const ext = profilePhoto.name.split('.').pop();
                finalPhotoUrl = await handleFileUpload(profilePhoto, `learners/${user.uid}/profile_${Date.now()}.${ext}`);
            }

            const idUrl = await handleFileUpload(idDoc, `learners/${user.uid}/id_doc_${Date.now()}.pdf`);
            const qualUrl = await handleFileUpload(qualDoc, `learners/${user.uid}/qual_${Date.now()}.pdf`);
            const cvUrl = cvDoc ? await handleFileUpload(cvDoc, `learners/${user.uid}/cv_${Date.now()}.pdf`) : null;

            const finalData = {
                ...formData,
                profilePhotoUrl: finalPhotoUrl,
                profileCompleted: true,
                popiaConsentDate: new Date().toISOString(),
                documents: { idUrl, qualUrl, cvUrl, updatedAt: new Date().toISOString() },
                updatedAt: new Date().toISOString(),
            };

            await updateDoc(doc(db, 'users', user.uid), finalData);
            if (learnerDocId) await updateDoc(doc(db, 'learners', learnerDocId), finalData);

            await refreshUser();
            navigate('/portal');
        } catch (error) {
            console.error('Save error:', error);
            alert('Error saving profile. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    if (fetchingInitial) return (
        <div className="lp-loading">
            <Loader2 className="spin" size={40} color="var(--mlab-green)" />
            <h2 className="lp-loading__title">Syncing Record</h2>
            <p className="lp-loading__sub">Connecting to the mLab Secure Cloud...</p>
        </div>
    );

    return (
        <div className="lp-container animate-fade-in">
            <div className="lp-card">
                <div className="lp-header">
                    <span className="lp-logo"><span className="lp-logo__m">m</span>lab</span>
                    <h1 className="lp-header__title">Compliance Profile</h1>
                    <p className="lp-header__sub">Complete your details to access your learning dashboard.</p>

                    <div className="lp-stepper">
                        <div className={`lp-step ${step >= 1 ? 'active' : ''}`}>1. Personal</div>
                        <div className="lp-step-line" />
                        <div className={`lp-step ${step >= 2 ? 'active' : ''}`}>2. Contact</div>
                        <div className="lp-step-line" />
                        <div className={`lp-step ${step >= 3 ? 'active' : ''}`}>3. Compliance</div>
                    </div>
                </div>

                {step === 1 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><User size={16} /> Identity Details</h3>

                        {/* PROFILE PHOTO UPLOADER */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', padding: '1rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ position: 'relative' }}>
                                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#e2e8f0', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Profile Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <User size={40} color="#94a3b8" />
                                    )}
                                </div>
                                <label style={{ position: 'absolute', bottom: '-4px', right: '-4px', background: 'var(--mlab-blue)', color: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', transition: 'background 0.2s' }}>
                                    <Camera size={16} />
                                    <input type="file" accept="image/*" onChange={handlePhotoSelect} style={{ display: 'none' }} />
                                </label>
                            </div>
                            <div>
                                <h4 style={{ margin: '0 0 0.25rem 0', color: '#0f172a', fontSize: '1.05rem' }}>Profile Picture</h4>
                                <p style={{ margin: 0, color: '#64748b', fontSize: '0.85rem', lineHeight: '1.4' }}>Upload a clear headshot. This will be used on your portfolio and assessments.</p>
                            </div>
                        </div>

                        <div className="lp-grid">
                            <FG label="ID / Passport Number">
                                <input className="lp-input" value={formData.idNumber || ''} onChange={e => handleChange('idNumber', e.target.value)} />
                            </FG>
                            <FG label="Highest Qualification">
                                <input className="lp-input" value={formData.highestQualification || ''} onChange={e => handleChange('highestQualification', e.target.value)} />
                            </FG>
                            <FG label="Equity Group">
                                <select className="lp-input" value={formData.equity || ''} onChange={e => handleChange('equity', e.target.value)}>
                                    <option value="">Select Group...</option>
                                    <option value="African">African</option>
                                    <option value="Coloured">Coloured</option>
                                    <option value="Indian">Indian</option>
                                    <option value="White">White</option>
                                </select>
                            </FG>
                            <FG label="Gender">
                                <select className="lp-input" value={formData.gender || ''} onChange={e => handleChange('gender', e.target.value)}>
                                    <option value="">Select Gender...</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                </select>
                            </FG>
                        </div>
                        <div className="lp-actions">
                            <div />
                            <button className="lp-btn-primary" onClick={() => setStep(2)}>Next <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><MapPin size={16} /> Residential Address</h3>
                        <FG label="Physical Address Search (Google Verified)">
                            <Autocomplete
                                apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                onPlaceSelected={handlePlaceSelected}
                                options={{ types: ["address"], componentRestrictions: { country: "za" } }}
                                className="lp-input"
                                defaultValue={formData.streetAddress}
                                placeholder="Start typing your street name..."
                            />
                        </FG>

                        <div className="lp-grid mt-4">
                            <FG label="City / Town">
                                <input className="lp-input readonly-field" value={formData.city || ''} readOnly />
                            </FG>
                            <FG label="Province">
                                <input className="lp-input readonly-field" value={formData.province || ''} readOnly />
                            </FG>
                            <FG label="Postal Code">
                                <input className="lp-input readonly-field" value={formData.postalCode || ''} readOnly />
                            </FG>
                        </div>

                        <h3 className="lp-section-title mt-8"><Heart size={16} /> Next of Kin</h3>
                        <div className="lp-grid">
                            <FG label="Full Name">
                                <input className="lp-input" value={formData.nokName || ''} onChange={e => handleChange('nokName', e.target.value)} />
                            </FG>
                            <FG label="Relationship">
                                <select className="lp-input" value={formData.nokRelationship || ''} onChange={e => handleChange('nokRelationship', e.target.value)}>
                                    <option value="">Select Relationship...</option>
                                    {NOK_RELATIONSHIPS.map(rel => <option key={rel} value={rel}>{rel}</option>)}
                                </select>
                            </FG>
                            <FG label="Contact Number">
                                <input className="lp-input" value={formData.nokPhone || ''} onChange={e => handleChange('nokPhone', e.target.value)} />
                            </FG>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(1)}>Back</button>
                            <button className="lp-btn-primary" onClick={() => setStep(3)}>Next <ChevronRight size={15} /></button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className="lp-form-body animate-fade-in">
                        <h3 className="lp-section-title"><FileText size={16} /> Compliance Uploads</h3>
                        <div className="lp-upload-grid">
                            <DocUpload label="Certified ID Copy" file={idDoc} onUpload={setIdDoc} />
                            <DocUpload label="Highest Qualification" file={qualDoc} onUpload={setQualDoc} />
                            <DocUpload label="Updated CV" file={cvDoc} onUpload={setCvDoc} />
                        </div>

                        {/*POPIA CONSENT SECTION */}
                        <div className="lp-popia-box" style={{ color: 'grey' }}>
                            <div className="lp-popia-header">
                                <ShieldCheck size={20} color="var(--mlab-blue)" />
                                <h4>POPIA Act Consent</h4>
                            </div>
                            <div className="lp-popia-content">
                                <p>
                                    I hereby grant mLab and its authorized agents permission to process my personal information
                                    provided herein. This information is collected solely for the purposes of training administration,
                                    SETA/QCTO registration, and NLRD verification in accordance with the
                                    Protection of Personal Information Act (POPIA).
                                </p>
                            </div>
                            <label className="lp-popia-checkbox" style={{ color: 'black' }}>
                                <input
                                    type="checkbox"
                                    checked={formData.popiaConsent}
                                    onChange={e => handleChange('popiaConsent', e.target.checked)}
                                />
                                <span>I understand and agree to the processing of my data.</span>
                            </label>
                        </div>

                        <div className="lp-actions">
                            <button className="lp-btn-ghost" onClick={() => setStep(2)}>Back</button>
                            <button
                                className="lp-btn-primary"
                                onClick={handleSubmit}
                                disabled={loading || !formData.popiaConsent}
                            >
                                {loading ? 'Saving...' : 'Complete Profile'} <Save size={15} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const FG: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="lp-fg"><label className="lp-fg-label">{label}</label>{children}</div>
);

const DocUpload: React.FC<{ label: string; file: File | null; onUpload: (f: File) => void }> = ({ label, file, onUpload }) => (
    <div className={`lp-doc-card${file ? ' uploaded' : ''}`}>
        <div className="lp-doc-icon">{file ? <CheckCircle size={22} /> : <Upload size={22} />}</div>
        <div className="lp-doc-info"><h4>{label}</h4><span>{file ? file.name : 'Select PDF'}</span></div>
        <input type="file" accept=".pdf" className="lp-file-input" onChange={e => e.target.files && onUpload(e.target.files[0])} />
    </div>
);

