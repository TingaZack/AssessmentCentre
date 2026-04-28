// src/pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.tsx

import '../../../pages/FacilitatorDashboard/SubmissionReview/SubmissionReview.css'

import 'react-quill-new/dist/quill.snow.css';
import { Clock, Lock } from 'lucide-react';
// ─── REUSABLE REVIEW STAGE CARD ───────────────────────────────────────────
const ReviewStageCard = ({
    colorTheme, title, status,
    lockedMessage, awaitingTitle, awaitingMessage,
    showScore, scoreAwarded, scoreMax, scorePct,
    activeControls,
    feedbackLabel, feedbackValue, onFeedbackChange, feedbackPlaceholder,
    signatureLabel, signatureUrl, signatureName, signatureDate, signatureMeta, signatureTagline,
    onSubmit, submitLabel, isSaving
}: any) => {
    const colorHex = colorTheme === 'blue' ? '#3b82f6' : colorTheme === 'red' ? '#ef4444' : '#22c55e';
    const colorHexDark = colorTheme === 'blue' ? '#1d4ed8' : colorTheme === 'red' ? '#b91c1c' : '#15803d';
    const bgLight = colorTheme === 'blue' ? '#eff6ff' : colorTheme === 'red' ? '#fef2f2' : '#f0fdf4';

    // Convert theme string directly to CSS variable for dynamic styling
    const themeVar = `var(--mlab-${colorTheme})`;

    return (
        <div className="sr-summary-card" style={{ marginBottom: '1.5rem', borderTop: `4px solid ${themeVar}` }}>
            <h3 className="sr-summary-title" style={{ color: themeVar }}>{title}</h3>

            {status === 'locked' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Lock size={24} color="#94a3b8" style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: '#334155', display: 'block', fontSize: '0.9rem' }}>Locked</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{lockedMessage}</p>
                </div>
            )}

            {status === 'awaiting' && (
                <div style={{ background: '#f8fafc', padding: '1.5rem', borderRadius: '6px', textAlign: 'center', border: '1px dashed #cbd5e1', marginTop: '1rem' }}>
                    <Clock size={24} color={colorHex} style={{ margin: '0 auto 10px' }} />
                    <strong style={{ color: colorHexDark, display: 'block', fontSize: '0.9rem' }}>{awaitingTitle}</strong>
                    <p style={{ color: '#64748b', fontSize: '0.8rem', margin: '4px 0 0 0', lineHeight: 1.4 }}>{awaitingMessage}</p>
                </div>
            )}

            {(status === 'active' || status === 'done') && (
                <>
                    {showScore && (
                        <div className="sr-score-display" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                            <div className="sr-score-circle" style={{ borderColor: themeVar }}>
                                <span className="sr-score-val" style={{ color: themeVar }}>{scoreAwarded}</span>
                                <span className="sr-score-max" style={{ color: themeVar }}>/ {scoreMax}</span>
                            </div>
                            <div className="sr-score-percent" style={{ color: themeVar }}>{scorePct}%</div>
                        </div>
                    )}

                    {activeControls}

                    <div className="sr-overall-feedback" style={{ marginTop: showScore || activeControls ? '1.5rem' : '1rem' }}>
                        <label className="sr-sidebar-label" style={{ color: themeVar }}>{feedbackLabel}</label>
                        {status === 'active' ? (
                            <textarea
                                className="sr-textarea" rows={3}
                                style={{ color: themeVar, fontStyle: 'italic', borderColor: themeVar, background: 'whitesmoke', fontWeight: 500 }}
                                placeholder={feedbackPlaceholder}
                                value={feedbackValue}
                                onChange={e => onFeedbackChange(e.target.value)}
                            />
                        ) : (
                            <div style={{ background: bgLight, padding: '10px', borderRadius: '6px', color: colorHexDark, fontStyle: 'italic', fontSize: '0.85rem', borderLeft: `3px solid ${colorHex}`, whiteSpace: 'pre-wrap' }}>
                                {feedbackValue || "No overall remarks provided."}
                            </div>
                        )}
                    </div>

                    {status === 'active' ? (
                        <div className="sr-action-area" style={{ marginTop: '1rem' }}>
                            <button className="sr-submit-btn" style={{ background: themeVar }} onClick={onSubmit} disabled={isSaving}>{submitLabel}</button>
                        </div>
                    ) : (
                        <div style={{ background: 'white', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '1rem' }}>
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.75rem', fontWeight: 'bold', color: themeVar, textTransform: 'uppercase' }}>{signatureLabel}</p>
                            {signatureUrl ? (
                                <img src={signatureUrl} alt="Signature" style={{ height: '40px', objectFit: 'contain', filter: `brightness(0) saturate(100%) ${colorTheme === 'blue' ? 'invert(31%) sepia(94%) saturate(1413%) hue-rotate(185deg) brightness(101%) contrast(101%)' : colorTheme === 'red' ? 'invert(13%) sepia(94%) saturate(7454%) hue-rotate(0deg) brightness(94%) contrast(116%)' : 'invert(29%) sepia(96%) saturate(1352%) hue-rotate(120deg) brightness(92%) contrast(101%)'}`, marginBottom: '8px' }} />
                            ) : (
                                <div style={{ height: '40px', color: themeVar, display: 'flex', alignItems: 'center', fontSize: '0.8rem', fontStyle: 'italic' }}>System Authenticated</div>
                            )}
                            <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem', fontWeight: 'bold', color: themeVar }}>{signatureName}</p>
                            {signatureMeta && <p style={{ margin: '0 0 4px 0', fontSize: '0.8rem', color: themeVar }}>{signatureMeta}</p>}
                            {signatureDate && <p style={{ margin: 0, fontSize: '0.75rem', color: themeVar }}><Clock size={10} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />{signatureDate}</p>}
                            {signatureTagline && <div className="sr-sig-line" style={{ borderTop: `1px dashed ${themeVar}`, paddingTop: '6px', marginTop: '6px', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: themeVar }}>{signatureTagline}</div>}
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default ReviewStageCard;