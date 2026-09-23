import React, { useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import {
    ShieldCheck, CheckCircle, Loader2, AlertTriangle,
    Maximize2, Minimize2, ExternalLink
} from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../Toast/Toast';

const getQCTODate = () => {
    const d = new Date();
    return d.getFullYear().toString() +
        (d.getMonth() + 1).toString().padStart(2, '0') +
        d.getDate().toString().padStart(2, '0');
};

export const MandatoryPolicyModal: React.FC = () => {
    const { user, setUser } = useStore() as any;
    const toast = useToast();
    const location = useLocation();
    const [isChecked, setIsChecked] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // STRICT LEARNER-ONLY CONSENT EVALUATION
    const needsConsent = useMemo(() => {
        if (!user || user.role !== 'learner') return false;

        const bypassPaths = [
            '/setup-profile',
            '/code-of-conduct',
            '/privacy-policy',
            '/terms',
            '/login',
            '/reset-password'
        ];
        if (bypassPaths.some(path => location.pathname.startsWith(path))) return false;

        const d = user.demographics || {};
        const hasConsented =
            user.popiaConsent === true ||
            d.popiaConsent === true;

        return !hasConsented;
    }, [user, location.pathname]);

    if (!needsConsent) return null;

    const handleAccept = async () => {
        if (!isChecked) return;
        setIsSaving(true);

        try {
            const nowIso = new Date().toISOString();
            const qctoDate = getQCTODate();

            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                popiaConsent: true,
                'demographics.popiaConsent': true,
                'demographics.popiActAgree': 'Y',
                'demographics.popiActDate': qctoDate,
                updatedAt: nowIso
            });

            const qAuth = query(collection(db, 'learners'), where('authUid', '==', user.uid));
            let snap = await getDocs(qAuth);

            if (snap.empty && user.email) {
                const qEmail = query(collection(db, 'learners'), where('email', '==', user.email));
                snap = await getDocs(qEmail);
            }

            if (!snap.empty) {
                await updateDoc(snap.docs[0].ref, {
                    popiaConsent: true,
                    'demographics.popiaConsent': true,
                    'demographics.popiActAgree': 'Y',
                    'demographics.popiActDate': qctoDate,
                    updatedAt: nowIso
                });
            }

            setUser({
                ...user,
                popiaConsent: true,
                demographics: {
                    ...(user.demographics || {}),
                    popiaConsent: true,
                    popiActAgree: 'Y',
                    popiActDate: qctoDate
                },
                updatedAt: nowIso
            });

            toast.success("Code of Conduct & POPIA agreement recorded successfully!");
        } catch (error: any) {
            console.error("Failed to save policy consent:", error);
            toast.error("Failed to save agreement. Please check your network connection and try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'rgba(15, 23, 42, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isFullscreen ? '0' : '20px',
            backdropFilter: 'blur(4px)',
            transition: 'padding 0.2s ease'
        }}>
            <div
                className="animate-fade-in"
                style={{
                    width: isFullscreen ? '100vw' : '100%',
                    maxWidth: isFullscreen ? '100vw' : '850px',
                    height: isFullscreen ? '100vh' : 'auto',
                    maxHeight: isFullscreen ? '100vh' : '95vh',
                    background: 'white',
                    borderRadius: isFullscreen ? '0px' : '8px',
                    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    transition: 'all 0.2s ease'
                }}
            >
                {/* HEADER */}
                <div style={{ padding: '16px 24px', background: 'var(--mlab-midnight, #0f172a)', color: 'white', borderBottom: '4px solid var(--mlab-green, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <ShieldCheck size={26} color="#4ade80" />
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'var(--font-heading)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Mandatory Learner Compliance Policy
                            </h2>
                            <p style={{ margin: 0, fontSize: '0.82rem', color: '#cbd5e1' }}>
                                Action required for {user?.fullName || 'Trainee'}: Digitally acknowledge CodeTribe Code of Conduct &amp; POPIA terms to proceed.
                            </p>
                        </div>
                    </div>

                    {/* HEADER CONTROLS (FULLSCREEN & NEW TAB) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <a
                            href="/code-of-conduct"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                background: 'rgba(255, 255, 255, 0.1)',
                                color: 'white',
                                border: '1px solid rgba(255, 255, 255, 0.2)',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'background 0.2s'
                            }}
                            title="Open Code of Conduct in new browser tab"
                        >
                            <ExternalLink size={14} /> Open in New Tab
                        </a>
                        <button
                            type="button"
                            onClick={() => setIsFullscreen(!isFullscreen)}
                            style={{
                                background: 'var(--mlab-blue, #0284c7)',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'background 0.2s'
                            }}
                            title={isFullscreen ? "Exit full screen view" : "View full screen reader"}
                        >
                            {isFullscreen ? (
                                <><Minimize2 size={14} /> Exit Full Screen</>
                            ) : (
                                <><Maximize2 size={14} /> Full Screen</>
                            )}
                        </button>
                    </div>
                </div>

                {/* IFRAME DOCUMENT READER - Added ?mode=embed parameter */}
                <div style={{ flex: 1, padding: '16px 20px', background: '#f1f5f9', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '10px 14px', borderRadius: '6px', marginBottom: '12px', fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <AlertTriangle size={18} style={{ flexShrink: 0 }} color="#d97706" />
                            <span><strong>QCTO Policy Requirement:</strong> To maintain active enrollment, all trainees must digitally acknowledge the CodeTribe Code of Conduct and POPIA data consent terms.</span>
                        </div>
                    </div>

                    <div style={{ border: '1px solid #cbd5e1', borderRadius: '6px', background: 'white', overflow: 'hidden', flex: 1, minHeight: isFullscreen ? 'calc(100vh - 280px)' : '400px' }}>
                        <iframe
                            src="/code-of-conduct?mode=embed"
                            title="Code of Conduct Document Viewer"
                            style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                        />
                    </div>
                </div>

                {/* FOOTER & CONSENT ACTION */}
                <div style={{ padding: '16px 24px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer', marginBottom: '16px', padding: '12px 16px', background: isChecked ? '#f0fdf4' : '#f8fafc', border: `1px solid ${isChecked ? '#bbf7d0' : '#cbd5e1'}`, borderRadius: '6px', transition: 'all 0.2s' }}>
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => setIsChecked(e.target.checked)}
                            style={{ width: '20px', height: '20px', cursor: 'pointer', marginTop: '2px', accentColor: '#16a34a' }}
                        />
                        <div style={{ flex: 1 }}>
                            <strong style={{ display: 'block', color: '#0f172a', fontSize: '0.9rem', marginBottom: '3px' }}>
                                I Have Read and Formally Accept the Terms &amp; Policies
                            </strong>
                            <span style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.5, display: 'block' }}>
                                I formally consent to the processing of my demographic data for QCTO compliance. I confirm that I have read, understood, and agree to abide by all the provisions of the mLab CodeTribe Code of Conduct and POPIA Data Protection terms.
                            </span>
                        </div>
                    </label>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleAccept}
                            disabled={!isChecked || isSaving}
                            style={{
                                background: isChecked ? '#16a34a' : '#cbd5e1',
                                color: isChecked ? 'white' : '#64748b',
                                border: 'none',
                                padding: '12px 24px',
                                borderRadius: '6px',
                                fontSize: '0.9rem',
                                fontWeight: 800,
                                cursor: isChecked && !isSaving ? 'pointer' : 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.2s'
                            }}
                        >
                            {isSaving ? (
                                <><Loader2 size={18} className="animate-spin" /> Recording Digital Signature...</>
                            ) : (
                                <><CheckCircle size={18} /> Digitally Sign &amp; Acknowledge Policy</>
                            )}
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};