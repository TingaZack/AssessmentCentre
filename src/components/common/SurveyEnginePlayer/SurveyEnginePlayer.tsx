// src/components/common/SurveyEngine/SurveyEnginePlayer.tsx

import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { Star, Send, X, MapPin, CheckCircle2, ClipboardList, Loader2 } from 'lucide-react';
import Autocomplete from "react-google-autocomplete";
import { createPortal } from 'react-dom';
import { db, auth } from '../../../lib/firebase';
import { useToast } from '../Toast/Toast';
import type { SurveyTemplate, AddressAnswer } from '../../../types/survey.types';

// 🚀 SAFE GOOGLE ADDRESS AUTOCOMPLETE WITH FALLBACK
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
                style={{ paddingLeft: '34px' }}
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
            style={{ paddingLeft: '34px' }}
        />
    );
};

interface SurveyEnginePlayerProps {
    surveyId: string;
    context: {
        assessmentId?: string;
        cohortId?: string;
        learnerId: string;
        learnerName?: string;
        submissionId?: string;
    };
    onComplete: () => void;
    onSkip?: () => void;
    portalTarget?: HTMLElement;
}

export const SurveyEnginePlayer: React.FC<SurveyEnginePlayerProps> = ({
    surveyId,
    context,
    onComplete,
    onSkip,
    portalTarget
}) => {
    const toast = useToast();
    const [survey, setSurvey] = useState<SurveyTemplate | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        const fetchSurvey = async () => {
            try {
                const snap = await getDoc(doc(db, 'surveys', surveyId));
                if (snap.exists() && snap.data().isActive !== false) {
                    const surveyData = { id: snap.id, ...snap.data() } as SurveyTemplate;

                    if (surveyData.allowMultipleResponses === false) {
                        const responseId = `${context.submissionId || context.learnerId}_${surveyId}`;
                        const existingSnap = await getDoc(doc(db, 'survey_responses', responseId));
                        if (existingSnap.exists()) {
                            onComplete();
                            return;
                        }
                    }

                    setSurvey(surveyData);
                } else {
                    onComplete();
                }
            } catch (err) {
                console.warn("Survey template load skipped:", err);
                onComplete();
            } finally {
                setLoading(false);
            }
        };
        fetchSurvey();
    }, [surveyId]);

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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

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
            const responseId = `${context.submissionId || context.learnerId}_${surveyId}`;
            const currentUid = auth.currentUser?.uid || context.learnerId;

            await setDoc(doc(db, 'survey_responses', responseId), {
                surveyId,
                assessmentId: context.assessmentId || '',
                cohortId: context.cohortId || '',
                learnerId: context.learnerId,
                authUid: currentUid,
                learnerName: context.learnerName || 'Learner',
                submissionId: context.submissionId || '',
                answers,
                submittedAt: new Date().toISOString()
            });

            toast.success("Thank you for your feedback!");
            onComplete();
        } catch (err) {
            toast.error("Failed to submit feedback.");
            onComplete();
        } finally {
            setSubmitting(false);
        }
    };

    if (loading || !survey) return null;

    return createPortal(
        <div className="lfm-overlay" style={{ zIndex: 9999999 }}>
            <div className="lfm-modal animate-fade-in" style={{ maxWidth: '580px' }}>
                {/* HEADER */}
                <div className="lfm-header">
                    <h2 className="lfm-header__title">
                        <ClipboardList size={18} />
                        {survey.title}
                    </h2>
                    {onSkip && (
                        <button
                            type="button"
                            className="lfm-close-btn"
                            onClick={onSkip}
                            disabled={submitting}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* BODY */}
                <div className="lfm-body">
                    {survey.description && (
                        <div style={{ background: 'var(--mlab-light-blue)', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', padding: '0.85rem 1rem', fontSize: '0.88rem', color: 'var(--mlab-blue)', lineHeight: 1.5 }}>
                            {survey.description}
                        </div>
                    )}

                    <form id="survey-engine-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        {survey.questions?.map((q, idx) => (
                            <div key={q.id} style={{ background: 'var(--mlab-bg)', padding: '1rem', border: '1px solid var(--mlab-border)', borderLeft: '4px solid var(--mlab-blue)', boxSizing: 'border-box' }}>
                                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, fontFamily: 'var(--font-heading)', textTransform: 'uppercase', marginBottom: '10px', color: 'var(--mlab-blue)', lineHeight: 1.4 }}>
                                    {idx + 1}. {q.label} {q.required && <span style={{ color: 'var(--mlab-red)' }}>*</span>}
                                </label>

                                {/* GOOGLE ADDRESS AUTOCOMPLETE */}
                                {q.type === 'address' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ position: 'relative', width: '100%' }}>
                                            <MapPin size={18} color="var(--mlab-grey)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} />
                                            <GoogleAddressInput
                                                value={typeof answers[q.id] === 'object' ? answers[q.id]?.formattedAddress : (answers[q.id] || '')}
                                                placeholder={q.placeholder}
                                                onPlaceSelected={(place) => handleAddressSelected(q.id, place)}
                                                onChangeText={(text) => handleAnswerChange(q.id, { formattedAddress: text, city: '', province: '', postalCode: '', lat: 0, lng: 0 })}
                                            />
                                        </div>
                                        {answers[q.id]?.formattedAddress && (
                                            <div style={{ fontSize: '0.78rem', background: 'var(--mlab-green-bg)', color: 'var(--mlab-blue)', padding: '8px 12px', border: '1px solid var(--mlab-green)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(36px, 1fr))', gap: '4px', width: '100%' }}>
                                        {[...Array((q.max || 10) - (q.min || 0) + 1)].map((_, i) => {
                                            const num = (q.min || 0) + i;
                                            const isSelected = answers[q.id] === num;
                                            return (
                                                <button
                                                    key={num}
                                                    type="button"
                                                    onClick={() => handleAnswerChange(q.id, num)}
                                                    style={{
                                                        height: '38px',
                                                        border: `1px solid ${isSelected ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`,
                                                        background: isSelected ? 'var(--mlab-blue)' : '#fff',
                                                        color: isSelected ? '#fff' : 'var(--mlab-blue)',
                                                        fontFamily: 'var(--font-heading)',
                                                        fontWeight: 'bold',
                                                        fontSize: '0.85rem',
                                                        cursor: 'pointer'
                                                    }}
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
                    </form>
                </div>

                {/* FOOTER */}
                <div className="lfm-footer">
                    {onSkip && (
                        <button
                            type="button"
                            onClick={onSkip}
                            className="lfm-btn lfm-btn--ghost"
                            disabled={submitting}
                        >
                            Skip
                        </button>
                    )}
                    <button
                        type="submit"
                        form="survey-engine-form"
                        className="lfm-btn lfm-btn--primary"
                        disabled={submitting}
                    >
                        {submitting ? <Loader2 size={14} className="lfm-spin" /> : <Send size={14} />}
                        {submitting ? 'Submitting...' : 'Submit Feedback'}
                    </button>
                </div>
            </div>
        </div>,
        portalTarget || document.body
    );
};