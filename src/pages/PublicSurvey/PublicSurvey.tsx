// src/pages/PublicSurvey/PublicSurveyPage.tsx

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    Star, Send, MapPin, CheckCircle2, Loader2, AlertCircle,
    User, ClipboardList, ShieldCheck, Key, Lock
} from 'lucide-react';
import Autocomplete from "react-google-autocomplete";
import { db, auth } from '../../lib/firebase';
import { ToastContainer, useToast } from '../../components/common/Toast/Toast';
import type { SurveyTemplate, AddressAnswer } from '../../types/survey.types';
import mLabLogo from '../../assets/logo/mlab_logo_white.png';

const GoogleAddressInput: React.FC<{
    value: string;
    placeholder?: string;
    onPlaceSelected: (place: any) => void;
    onChangeText: (text: string) => void;
}> = ({ value, placeholder, onPlaceSelected, onChangeText }) => {
    const [isGoogleReady, setIsGoogleReady] = useState(
        () => typeof window !== 'undefined' && Boolean((window as any).google?.maps?.places)
    );

    useEffect(() => {
        if (isGoogleReady) return;
        const interval = setInterval(() => {
            if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
                setIsGoogleReady(true);
                clearInterval(interval);
            }
        }, 300);
        return () => clearInterval(interval);
    }, [isGoogleReady]);

    if (isGoogleReady) {
        return (
            <Autocomplete
                apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                onPlaceSelected={onPlaceSelected}
                options={{
                    types: ["address"],
                    componentRestrictions: { country: "za" },
                    fields: ["address_components", "geometry", "formatted_address"]
                }}
                className="lfm-input"
                placeholder={placeholder || "Search building, street, or suburb..."}
                defaultValue={value}
                style={{ paddingLeft: '36px' }}
            />
        );
    }

    return (
        <input
            type="text"
            className="lfm-input"
            value={value}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder={placeholder || "Type building, street, or suburb..."}
            style={{ paddingLeft: '36px' }}
        />
    );
};

export const PublicSurveyPage: React.FC = () => {
    const { surveyId } = useParams<{ surveyId: string }>();
    const toast = useToast();

    const [survey, setSurvey] = useState<SurveyTemplate | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [respondentName, setRespondentName] = useState('');
    const [respondentEmail, setRespondentEmail] = useState('');
    const [respondentPhone, setRespondentPhone] = useState('');

    const [isVerified, setIsVerified] = useState(false);
    const [showOtpModal, setShowOtpModal] = useState(false);
    const [userOtpInput, setUserOtpInput] = useState('');
    const [sendingOtp, setSendingOtp] = useState(false);
    const [verifyingOtp, setVerifyingOtp] = useState(false);

    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [alreadyCompleted, setAlreadyCompleted] = useState(false); // 🚀 NEW STATE

    useEffect(() => {
        const fetchSurvey = async () => {
            if (!surveyId) {
                setLoading(false);
                return;
            }
            try {
                const snap = await getDoc(doc(db, 'surveys', surveyId));
                if (snap.exists() && snap.data().isActive !== false) {
                    const surveyData = { id: snap.id, ...snap.data() } as SurveyTemplate;
                    setSurvey(surveyData);

                    // 🚀 CHECK SINGLE-RESPONSE CONFIG & LOCAL STORAGE
                    const hasSubmittedBefore = localStorage.getItem(`mlab_survey_completed_${surveyId}`);
                    if (surveyData.allowMultipleResponses === false && hasSubmittedBefore) {
                        setAlreadyCompleted(true);
                    }
                }
            } catch (err) {
                console.error("Failed to load public survey:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchSurvey();
    }, [surveyId]);

    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

    const handleAnswerChange = (qId: string, val: any) => {
        setAnswers(prev => ({ ...prev, [qId]: val }));
    };

    const handleAddressSelected = (qId: string, place: any) => {
        if (!place || !place.address_components) return;

        const addressComponents = place.address_components;
        const getComp = (t: string) => addressComponents?.find((c: any) => c.types.includes(t))?.long_name || "";

        const formattedAddress = place.formatted_address || "";
        const provString = getComp("administrative_area_level_1");
        const districtMuni = getComp("administrative_area_level_2");
        const localMuni = getComp("administrative_area_level_3") || getComp("locality");
        const suburb = getComp("sublocality_level_1") || getComp("sublocality") || getComp("neighborhood");
        const townName = getComp("locality") || suburb;
        const postal = getComp("postal_code");

        const lat = place.geometry?.location?.lat
            ? (typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat)
            : 0;

        const lng = place.geometry?.location?.lng
            ? (typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng)
            : 0;

        const addressPayload: AddressAnswer = {
            formattedAddress,
            suburb,
            city: townName,
            localMunicipality: localMuni,
            districtOrMetro: districtMuni,
            province: provString,
            postalCode: postal,
            lat,
            lng
        };

        handleAnswerChange(qId, addressPayload);
    };

    const handleSendVerificationCode = async () => {
        if (!isValidEmail(respondentEmail)) {
            toast.warning("Please enter a valid email address to receive the verification code.");
            return;
        }

        setSendingOtp(true);
        try {
            const functionsInstance = getFunctions();
            const requestOtpFn = httpsCallable<{ email: string }, { success: boolean; message: string }>(
                functionsInstance,
                'requestGuestOTP'
            );

            await requestOtpFn({ email: respondentEmail });

            setShowOtpModal(true);
            setUserOtpInput('');
            toast.info(`Verification code dispatched to ${respondentEmail}. Please check your inbox.`);
        } catch (err: any) {
            console.error("Failed to request OTP:", err);
            toast.error(err.message || "Failed to send verification code.");
        } finally {
            setSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        const cleanOtp = userOtpInput.trim();
        if (!cleanOtp || cleanOtp.length !== 6) {
            toast.warning("Please enter the 6-digit verification code sent to your email.");
            return;
        }

        setVerifyingOtp(true);
        try {
            const functionsInstance = getFunctions();
            const verifyOtpFn = httpsCallable<{ email: string; otp: string }, { success: boolean; message: string }>(
                functionsInstance,
                'verifyGuestOTP'
            );

            await verifyOtpFn({ email: respondentEmail, otp: cleanOtp });

            setIsVerified(true);
            setShowOtpModal(false);
            toast.success("Email verified successfully!");
        } catch (err: any) {
            console.error("OTP Verification Error:", err);
            toast.error(err.message || "Invalid or expired verification code.");
        } finally {
            setVerifyingOtp(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (respondentEmail && !isVerified) {
            toast.warning("Please verify your email address before submitting.");
            return;
        }

        for (const q of survey?.questions || []) {
            const val = answers[q.id];
            const isMissing = q.type === 'address'
                ? (!val || (!val.formattedAddress && typeof val !== 'string'))
                : (val === undefined || val === '');

            if (q.required && isMissing) {
                toast.warning(`Please answer "${q.label}" before submitting.`);
                return;
            }
        }

        setSubmitting(true);
        try {
            const guestUid = auth.currentUser?.uid || `guest_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const responseId = `pub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

            await setDoc(doc(db, 'survey_responses', responseId), {
                surveyId,
                assessmentId: 'public_link',
                cohortId: 'external_share',
                learnerId: guestUid,
                authUid: guestUid,
                learnerName: respondentName.trim() || 'External Respondent',
                learnerEmail: respondentEmail.trim() || 'N/A',
                learnerPhone: respondentPhone.trim() || 'N/A',
                isVerifiedRespondent: isVerified,
                answers,
                isExternalResponse: true,
                submittedAt: new Date().toISOString()
            });

            // 🚀 RECORD COMPLETION IN LOCAL STORAGE
            if (surveyId) {
                localStorage.setItem(`mlab_survey_completed_${surveyId}`, 'true');
            }

            setSubmitted(true);
        } catch (err: any) {
            console.error("Public submission failed:", err);
            toast.error("Failed to submit survey. Please check your connection.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="pub-survey-overlay">
            <ToastContainer toasts={toast.toasts} onClose={toast.closeToast} />

            <style>{`
                @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap");

                :root {
                  --mlab-blue: #073f4e;
                  --mlab-blue-dark: #052e3a;
                  --mlab-green: #94c73d;
                  --mlab-green-dark: #7aaa2e;
                  --mlab-green-bg: #f0f7e1;
                  --mlab-grey: #6b6b6b;
                  --mlab-grey-lt: #9b9b9b;
                  --mlab-white: #ffffff;
                  --mlab-bg: #f0f4f6;
                  --mlab-border: #dde4e8;
                  --mlab-light-blue: #e8f0f3;
                  --mlab-red: #ef4444;
                  --font-heading: "Oswald", "Trebuchet MS", sans-serif;
                  --font-body: "Trebuchet MS", "Lucida Grande", Arial, sans-serif;
                }

                @keyframes lfm-spin { to { transform: rotate(360deg); } }
                @keyframes lfm-fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

                .lfm-spin { animation: lfm-spin 0.75s linear infinite; display: inline-block; }

                .pub-survey-overlay {
                  position: fixed;
                  inset: 0;
                  background: rgba(5, 46, 58, 0.95);
                  backdrop-filter: blur(4px);
                  overflow-y: auto;
                  -webkit-overflow-scrolling: touch;
                  box-sizing: border-box;
                  z-index: 99999;
                }

                .pub-survey-viewport {
                  min-height: 100%;
                  width: 100%;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  padding: 0 1rem 3rem 1rem;
                  box-sizing: border-box;
                }

                .pub-survey-card {
                  background: var(--mlab-white);
                  width: 100%;
                  max-width: 720px;
                  display: flex;
                  flex-direction: column;
                  border: 2px solid var(--mlab-blue);
                  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                  animation: lfm-fadeIn 0.22s ease both;
                  overflow: hidden;
                  box-sizing: border-box;
                }

                .pub-survey-header {
                  background: var(--mlab-blue);
                  padding: 1.25rem 1.5rem;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                  flex-shrink: 0;
                  border-bottom: 3px solid var(--mlab-green);
                }

                .pub-survey-header__title {
                  font-family: var(--font-heading);
                  font-size: 1.1rem;
                  font-weight: 700;
                  letter-spacing: 0.1em;
                  text-transform: uppercase;
                  color: var(--mlab-white);
                  margin: 0;
                  display: flex;
                  align-items: center;
                  gap: 0.6rem;
                }

                .pub-survey-body {
                  padding: 1.5rem;
                  display: flex;
                  flex-direction: column;
                  gap: 1.5rem;
                  box-sizing: border-box;
                }

                .lfm-section-hdr {
                  display: flex;
                  align-items: center;
                  gap: 0.5rem;
                  font-family: var(--font-heading);
                  font-size: 0.75rem;
                  font-weight: 700;
                  letter-spacing: 0.16em;
                  text-transform: uppercase;
                  color: var(--mlab-blue);
                  padding-bottom: 0.5rem;
                  border-bottom: 2px solid var(--mlab-blue);
                  margin-bottom: 0.75rem;
                }

                .lfm-grid {
                  display: grid;
                  grid-template-columns: 1fr 1fr;
                  gap: 0.85rem 1.25rem;
                }

                .lfm-fg {
                  display: flex;
                  flex-direction: column;
                  gap: 0.35rem;
                }
                .lfm-fg label {
                  font-family: var(--font-heading);
                  font-size: 0.7rem;
                  font-weight: 600;
                  letter-spacing: 0.12em;
                  text-transform: uppercase;
                  color: var(--mlab-grey);
                }

                .lfm-input {
                  font-family: var(--font-body);
                  font-size: 0.88rem;
                  color: var(--mlab-blue);
                  background: var(--mlab-white);
                  border: 1px solid var(--mlab-border);
                  padding: 0.6rem 0.75rem;
                  outline: none;
                  transition: border-color 0.15s;
                  width: 100%;
                  border-radius: 0;
                  box-sizing: border-box;
                }

                .pub-question-card {
                  background: var(--mlab-bg);
                  border: 1px solid var(--mlab-border);
                  border-left: 4px solid var(--mlab-blue);
                  padding: 1.1rem;
                  display: flex;
                  flex-direction: column;
                  gap: 0.75rem;
                  box-sizing: border-box;
                }

                .pub-question-label {
                  font-family: var(--font-heading);
                  font-size: 0.82rem;
                  font-weight: 700;
                  letter-spacing: 0.08em;
                  text-transform: uppercase;
                  color: var(--mlab-blue);
                  margin: 0;
                  line-height: 1.4;
                }

                .pub-nps-grid {
                  display: grid;
                  grid-template-columns: repeat(auto-fit, minmax(36px, 1fr));
                  gap: 4px;
                  width: 100%;
                }

                .pub-nps-btn {
                  height: 38px;
                  border: 1px solid var(--mlab-border);
                  background: var(--mlab-white);
                  color: var(--mlab-blue);
                  font-family: var(--font-heading);
                  font-weight: 700;
                  font-size: 0.85rem;
                  cursor: pointer;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  border-radius: 0;
                }
                .pub-nps-btn.selected {
                  background: var(--mlab-blue);
                  color: var(--mlab-white);
                  border-color: var(--mlab-blue);
                }

                .lfm-checkbox-row {
                  display: flex;
                  align-items: center;
                  gap: 0.6rem;
                  font-family: var(--font-body);
                  font-size: 0.88rem;
                  color: var(--mlab-blue);
                  cursor: pointer;
                }

                .lfm-btn {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 0.5rem;
                  font-family: var(--font-heading);
                  font-size: 0.78rem;
                  font-weight: 700;
                  letter-spacing: 0.1em;
                  text-transform: uppercase;
                  padding: 0.75rem 1.5rem;
                  border: none;
                  cursor: pointer;
                  border-radius: 0;
                  transition: background 0.15s, color 0.15s;
                }

                .lfm-btn--accent {
                  background: var(--mlab-green);
                  color: var(--mlab-blue);
                }

                @media (max-width: 640px) {
                  .lfm-grid { grid-template-columns: 1fr; }
                  .pub-survey-body { padding: 1rem; }
                }
            `}</style>

            <div className="pub-survey-viewport">
                <header style={{ width: '100%', padding: '1.5rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                    <img height={45} src={mLabLogo} alt="mLab Logo" style={{ objectFit: 'contain' }} />
                </header>

                {loading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', paddingTop: '3rem' }}>
                        <Loader2 size={36} className="lfm-spin" color="var(--mlab-green)" />
                    </div>
                ) : !survey ? (
                    <div className="pub-survey-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                        <AlertCircle size={56} color="var(--mlab-red)" style={{ margin: '0 auto 1rem auto' }} />
                        <h1 style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '1.4rem', color: 'var(--mlab-blue)', margin: '0 0 0.5rem 0' }}>Survey Unavailable</h1>
                        <p style={{ color: 'var(--mlab-grey)', maxWidth: '420px', lineHeight: 1.5, fontSize: '0.9rem', margin: '0 auto' }}>This survey link may have expired, been deactivated, or removed by an administrator.</p>
                    </div>
                ) : alreadyCompleted ? (
                    /* 🚀 ALREADY COMPLETED STATE */
                    <div className="pub-survey-card" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
                        <Lock size={56} color="var(--mlab-blue)" style={{ margin: '0 auto 1rem auto' }} />
                        <h1 style={{ fontFamily: 'var(--font-heading)', textTransform: 'uppercase', fontSize: '1.4rem', color: 'var(--mlab-blue)', margin: '0 0 0.5rem 0' }}>Survey Already Completed</h1>
                        <p style={{ color: 'var(--mlab-grey)', maxWidth: '440px', lineHeight: 1.5, fontSize: '0.9rem', margin: '0 auto' }}>
                            You have already submitted a response for <strong>"{survey.title}"</strong>. Multiple submissions are disabled for this survey.
                        </p>
                    </div>
                ) : (
                    <main className="pub-survey-card">
                        <header className="pub-survey-header">
                            <h2 className="pub-survey-header__title">
                                <ClipboardList size={18} /> {survey.title}
                            </h2>
                        </header>

                        <div className="pub-survey-body">
                            {submitted ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
                                    <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem auto' }} />
                                    <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: '0 0 0.5rem 0', fontSize: '1.4rem', letterSpacing: '0.08em' }}>
                                        Feedback Received!
                                    </h2>
                                    <p style={{ color: 'var(--mlab-grey)', fontSize: '0.95rem', lineHeight: 1.6, margin: 0 }}>
                                        Thank you for completing this survey. Your responses have been securely recorded.
                                    </p>
                                </div>
                            ) : (
                                <>
                                    {survey.description && (
                                        <div style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '0.85rem 1rem', fontSize: '0.88rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
                                            {survey.description}
                                        </div>
                                    )}

                                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

                                        {/* RESPONDENT INFO */}
                                        <div>
                                            <div className="lfm-section-hdr"><User size={13} /> Participant Verification</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                <div className="lfm-fg">
                                                    <label>Full Name</label>
                                                    <input
                                                        type="text"
                                                        className="lfm-input"
                                                        value={respondentName}
                                                        onChange={e => setRespondentName(e.target.value)}
                                                        placeholder="Full Name"
                                                    />
                                                </div>

                                                <div className="lfm-grid">
                                                    <div className="lfm-fg">
                                                        <label>Email Address</label>
                                                        <input
                                                            type="email"
                                                            className="lfm-input"
                                                            value={respondentEmail}
                                                            disabled={isVerified || sendingOtp}
                                                            onChange={e => {
                                                                setRespondentEmail(e.target.value);
                                                                setIsVerified(false);
                                                            }}
                                                            placeholder="name@example.com"
                                                        />
                                                    </div>

                                                    <div className="lfm-fg">
                                                        <label>Phone Number (Optional)</label>
                                                        <input
                                                            type="tel"
                                                            className="lfm-input"
                                                            value={respondentPhone}
                                                            disabled={isVerified}
                                                            onChange={e => {
                                                                setRespondentPhone(e.target.value);
                                                            }}
                                                            placeholder="0821234567"
                                                        />
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isVerified ? 'var(--mlab-green-bg)' : '#f8fafc', padding: '10px 14px', border: '1px solid var(--mlab-border)' }}>
                                                    {isVerified ? (
                                                        <span style={{ color: 'var(--mlab-blue)', fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <ShieldCheck size={16} color="var(--mlab-green-dark)" /> Email Authenticated & Verified
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span style={{ fontSize: '0.78rem', color: 'var(--mlab-grey)' }}>
                                                                {respondentEmail ? 'Verify email address via OTP to unlock submission.' : 'Optional email verification for auditing.'}
                                                            </span>
                                                            {respondentEmail && (
                                                                <button
                                                                    type="button"
                                                                    className="lfm-btn lfm-btn--primary"
                                                                    style={{ padding: '6px 12px', fontSize: '0.7rem' }}
                                                                    onClick={handleSendVerificationCode}
                                                                    disabled={sendingOtp}
                                                                >
                                                                    {sendingOtp ? <Loader2 size={12} className="lfm-spin" /> : <Key size={12} />}
                                                                    {sendingOtp ? 'Sending...' : 'Send Verification OTP'}
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {showOtpModal && (
                                            <div style={{ background: 'var(--mlab-light-blue)', border: '2px solid var(--mlab-blue)', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--mlab-blue)', textTransform: 'uppercase' }}>
                                                    Enter 6-Digit Email Code Sent to {respondentEmail}
                                                </span>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        maxLength={6}
                                                        className="lfm-input"
                                                        value={userOtpInput}
                                                        onChange={e => setUserOtpInput(e.target.value)}
                                                        placeholder="e.g. 123456"
                                                        disabled={verifyingOtp}
                                                        style={{ width: '140px', letterSpacing: '0.2em', fontWeight: 'bold', textTransform: 'uppercase' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        className="lfm-btn lfm-btn--accent"
                                                        onClick={handleVerifyOtp}
                                                        disabled={verifyingOtp || userOtpInput.length !== 6}
                                                    >
                                                        {verifyingOtp ? <Loader2 size={12} className="lfm-spin" /> : 'Confirm Code'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* DYNAMIC QUESTIONS */}
                                        <div>
                                            <div className="lfm-section-hdr"><ClipboardList size={13} /> Survey Questions</div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                                {survey.questions?.map((q, idx) => (
                                                    <div key={q.id} className="pub-question-card">
                                                        <label className="pub-question-label">
                                                            {idx + 1}. {q.label} {q.required && <span style={{ color: 'var(--mlab-red)' }}>*</span>}
                                                        </label>

                                                        {/* GOOGLE ADDRESS AUTOCOMPLETE */}
                                                        {q.type === 'address' && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                <div style={{ position: 'relative', width: '100%' }}>
                                                                    <MapPin size={18} color="var(--mlab-grey)" style={{
                                                                        position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 1
                                                                    }} />
                                                                    <GoogleAddressInput
                                                                        value={typeof answers[q.id] === 'object' ? answers[q.id]?.formattedAddress : (answers[q.id] || '')}
                                                                        placeholder={q.placeholder}
                                                                        onPlaceSelected={(place) => handleAddressSelected(q.id, place)}
                                                                        onChangeText={(text) => handleAnswerChange(q.id, { formattedAddress: text, city: '', province: '', postalCode: '', lat: 0, lng: 0 })}
                                                                    />
                                                                </div>
                                                                {answers[q.id]?.formattedAddress && (
                                                                    <div style={{
                                                                        fontSize: '0.8rem', background: 'var(--mlab-green-bg)', color: 'var(--mlab-blue)', padding: '8px 12px',
                                                                        border: '1px solid var(--mlab-green)', display: 'flex', flexDirection: 'column', gap: '2px'
                                                                    }}>
                                                                        <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                            <CheckCircle2 size={14} color="var(--mlab-green-dark)" /> Address Captured:
                                                                        </span>
                                                                        <span>{answers[q.id].formattedAddress}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* STAR RATING */}
                                                        {q.type === 'rating' && (
                                                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                                {[...Array(q.maxStars || 5)].map((_, i) => {
                                                                    const val = i + 1;
                                                                    return (
                                                                        <Star
                                                                            key={val}
                                                                            size={28}
                                                                            color={val <= (answers[q.id] || 0) ? '#f59e0b' : '#cbd5e1'}
                                                                            fill={val <= (answers[q.id] || 0) ? '#f59e0b' : 'none'}
                                                                            style={{ cursor: 'pointer', transition: 'transform 0.1s' }}
                                                                            onClick={() => handleAnswerChange(q.id, val)}
                                                                        />
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* SINGLE CHOICE */}
                                                        {q.type === 'single_choice' && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                {q.options?.map((opt: string) => (
                                                                    <label key={opt} className="lfm-checkbox-row">
                                                                        <input
                                                                            type="radio"
                                                                            name={q.id}
                                                                            checked={answers[q.id] === opt}
                                                                            onChange={() => handleAnswerChange(q.id, opt)}
                                                                        />
                                                                        {opt}
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        )}

                                                        {/* NPS SCALE */}
                                                        {q.type === 'nps' && (
                                                            <div className="pub-nps-grid">
                                                                {[...Array((q.max || 10) - (q.min || 0) + 1)].map((_, i) => {
                                                                    const num = (q.min || 0) + i;
                                                                    const isSelected = answers[q.id] === num;
                                                                    return (
                                                                        <button
                                                                            key={num}
                                                                            type="button"
                                                                            className={`pub-nps-btn ${isSelected ? 'selected' : ''}`}
                                                                            onClick={() => handleAnswerChange(q.id, num)}
                                                                        >
                                                                            {num}
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* FREE TEXT */}
                                                        {q.type === 'text' && (
                                                            <textarea
                                                                rows={3}
                                                                className="lfm-input"
                                                                value={answers[q.id] || ''}
                                                                placeholder={q.placeholder || 'Type your response here...'}
                                                                onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                                                                style={{ resize: 'vertical' }}
                                                            />
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <button
                                            type="submit"
                                            className="lfm-btn lfm-btn--accent"
                                            style={{ marginTop: '0.5rem', width: '100%', minHeight: '46px', color: 'var(--mlab-blue)', fontSize: '0.85rem' }}
                                            disabled={submitting}
                                        >
                                            {submitting ? <Loader2 size={16} className="lfm-spin" /> : <Send size={16} />}
                                            {submitting ? 'Submitting...' : 'Submit Feedback'}
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>
                    </main>
                )}
            </div>
        </div>
    );
};

export default PublicSurveyPage;