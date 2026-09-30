// src/pages/LearnerPortal/public/StudentVerification/StudentVerification.tsx

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { ShieldCheck, ShieldAlert, Award, Search, ExternalLink, Calendar, BookOpen, Building2, Copy, Check, Fingerprint } from 'lucide-react';
import { db } from '../../../../lib/firebase';
import Loader from '../../../../components/common/Loader/Loader';
import mLabLogo from '../../../../assets/logo/mlab_logo.png';
import moment from 'moment';

interface VerifiedCertificate {
    id: string;
    verificationCode: string;
    recipientName: string;
    courseName: string;
    type: string;
    issueDate: string;
    institutionName?: string;
    blockchainStatus?: string;
    blockchainTxHash?: string;
    ipfsHash?: string;
    pdfUrl?: string;
}

/* ------------------------------------------------------------------ */
/* Styles (scoped with the sv- prefix)                                 */
/* ------------------------------------------------------------------ */
const styles = `
@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

.sv-page {
    --sv-blue: var(--mlab-blue, #002b49);
    --sv-green: var(--mlab-green, #94c73d);
    --sv-ink: #0b1f33;
    --sv-muted: #5b6b7c;
    --sv-line: #e4eaf0;
    position: fixed;
    inset: 0;
    height: 100dvh;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    box-sizing: border-box;
    padding: 2rem 0.9rem 3rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    font-family: 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif;
    color: var(--sv-ink);
    background:
        radial-gradient(900px 420px at 50% -120px, color-mix(in srgb, var(--sv-blue) 16%, transparent), transparent 70%),
        radial-gradient(500px 300px at 100% 100%, color-mix(in srgb, var(--sv-green) 18%, transparent), transparent 70%),
        #f3f6f9;
}
.sv-page *, .sv-page *::before, .sv-page *::after { box-sizing: border-box; }

/* ---------- Card ---------- */
.sv-card {
    position: relative;
    width: 100%;
    max-width: 560px;
    margin: auto;
    flex-shrink: 0;
    background: #fff;
    border-radius: 24px;
    overflow: hidden;
    box-shadow:
        0 1px 2px rgba(0, 43, 73, 0.06),
        0 24px 60px -20px rgba(0, 43, 73, 0.35);
    animation: sv-card-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ---------- Header ---------- */
.sv-header {
    position: relative;
    padding: 1.9rem 1.25rem 4.2rem;
    text-align: center;
    color: #fff;
    background:
        radial-gradient(420px 220px at 85% 0%, color-mix(in srgb, var(--sv-green) 38%, transparent), transparent 65%),
        linear-gradient(135deg, var(--sv-blue) 0%, color-mix(in srgb, var(--sv-blue) 82%, #000) 100%);
    overflow: hidden;
}
.sv-header::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image:
        linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse at center, #000 20%, transparent 75%);
    -webkit-mask-image: radial-gradient(ellipse at center, #000 20%, transparent 75%);
    animation: sv-grid-drift 18s linear infinite;
}
.sv-header::after {
    content: '';
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 4px;
    background: linear-gradient(90deg, var(--sv-green), color-mix(in srgb, var(--sv-green) 40%, #fff), var(--sv-green));
    background-size: 200% 100%;
    animation: sv-shimmer-line 4s linear infinite;
}
.sv-header > * { position: relative; z-index: 1; }

.sv-logo {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    padding: 8px 18px;
    border-radius: 12px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
    margin-bottom: 1rem;
}
.sv-logo img { height: 28px; object-fit: contain; display: block; }

.sv-title {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 800;
    letter-spacing: -0.01em;
}
.sv-subtitle {
    margin: 4px 0 0;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.72);
    font-weight: 500;
}

/* ---------- Seal (the hero moment) ---------- */
.sv-seal-wrap {
    position: relative;
    z-index: 2;
    display: flex;
    justify-content: center;
    margin-top: -3.2rem;
}
.sv-seal {
    position: relative;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: #fff;
    box-shadow: 0 10px 30px -8px rgba(0, 43, 73, 0.45);
    animation: sv-pop 0.6s 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.sv-seal svg { display: block; }
.sv-seal-ring {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
    stroke-dasharray: 264;
    stroke-dashoffset: 264;
    transform: rotate(-90deg);
    transform-origin: 50% 50%;
    animation: sv-draw 0.9s 0.55s cubic-bezier(0.65, 0, 0.35, 1) forwards;
}
.sv-seal-check {
    fill: none;
    stroke-width: 5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 40;
    stroke-dashoffset: 40;
    animation: sv-draw 0.5s 1.3s cubic-bezier(0.65, 0, 0.35, 1) forwards;
}
.sv-seal-pulse {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid var(--sv-green);
    opacity: 0;
    animation: sv-pulse 2.6s 1.6s ease-out infinite;
}
.sv-seal--error { animation: sv-pop 0.5s 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) both, sv-shake 0.5s 0.75s ease-in-out; }

/* ---------- Body ---------- */
.sv-body { padding: 1.1rem 1.25rem 1.5rem; }
.sv-verified-title {
    margin: 1rem 0 0;
    text-align: center;
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: -0.015em;
    color: var(--sv-blue);
    animation: sv-rise 0.5s 1.0s ease both;
}
.sv-verified-sub {
    margin: 4px auto 0;
    max-width: 34ch;
    text-align: center;
    font-size: 0.85rem;
    line-height: 1.5;
    color: var(--sv-muted);
    animation: sv-rise 0.5s 1.08s ease both;
}

/* Recipient highlight */
.sv-recipient {
    margin-top: 1.4rem;
    padding: 1.1rem 1.1rem 1.15rem;
    border-radius: 16px;
    text-align: center;
    background: linear-gradient(180deg, color-mix(in srgb, var(--sv-green) 12%, #fff), #fff);
    border: 1px solid color-mix(in srgb, var(--sv-green) 35%, #fff);
    animation: sv-rise 0.5s 1.16s ease both;
}
.sv-label {
    display: block;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--sv-muted);
    margin-bottom: 2px;
}
.sv-recipient-name {
    margin: 0;
    font-size: 1.5rem;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--sv-ink);
    overflow-wrap: anywhere;
}

/* Detail rows */
.sv-details {
    margin-top: 1rem;
    border: 1px solid var(--sv-line);
    border-radius: 16px;
    overflow: hidden;
}
.sv-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 0.85rem 1rem;
    background: #fff;
    transition: background-color 0.2s ease;
    animation: sv-rise 0.5s ease both;
}
.sv-row + .sv-row { border-top: 1px solid var(--sv-line); }
.sv-row:hover { background: #f8fafc; }
.sv-row:nth-child(1) { animation-delay: 1.24s; }
.sv-row:nth-child(2) { animation-delay: 1.32s; }
.sv-row:nth-child(3) { animation-delay: 1.40s; }
.sv-row:nth-child(4) { animation-delay: 1.48s; }
.sv-icon {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    display: grid;
    place-items: center;
    color: var(--sv-blue);
    background: color-mix(in srgb, var(--sv-blue) 8%, #fff);
    transition: background-color 0.2s ease, color 0.2s ease, transform 0.2s ease;
}
.sv-row:hover .sv-icon { background: var(--sv-blue); color: var(--sv-green); transform: scale(1.06); }
.sv-row-text { min-width: 0; flex: 1; }
.sv-value {
    margin: 0;
    font-size: 0.92rem;
    line-height: 1.35;
    font-weight: 700;
    color: var(--sv-ink);
    overflow-wrap: anywhere;
}

/* Code chip */
.sv-code {
    margin-top: 0.9rem;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0.6rem 0.6rem 0.6rem 0.9rem;
    border-radius: 12px;
    background: #f3f6f9;
    border: 1px dashed #c5d0db;
    animation: sv-rise 0.5s 1.56s ease both;
}
.sv-code-text { flex: 1; min-width: 0; }
.sv-code-value {
    display: block;
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--sv-blue);
    overflow-wrap: anywhere;
    letter-spacing: 0.02em;
}
.sv-copy {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0.45rem 0.75rem;
    border: 1px solid var(--sv-line);
    background: #fff;
    border-radius: 9px;
    font: inherit;
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--sv-blue);
    cursor: pointer;
    transition: transform 0.15s ease, background-color 0.2s ease, border-color 0.2s ease;
}
.sv-copy:hover { border-color: var(--sv-blue); }
.sv-copy:active { transform: scale(0.96); }
.sv-copy--done { background: var(--sv-green); border-color: var(--sv-green); color: var(--sv-blue); }

/* Blockchain badge */
.sv-chain {
    position: relative;
    overflow: hidden;
    margin-top: 0.9rem;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0.8rem 1rem;
    border-radius: 14px;
    color: #fff;
    background: linear-gradient(135deg, var(--sv-blue), color-mix(in srgb, var(--sv-blue) 75%, #2563eb));
    animation: sv-rise 0.5s 1.64s ease both;
}
.sv-chain::after {
    content: '';
    position: absolute;
    top: 0; bottom: 0;
    width: 40%;
    left: -60%;
    background: linear-gradient(100deg, transparent, rgba(255,255,255,0.22), transparent);
    animation: sv-sweep 4.5s 2.4s ease-in-out infinite;
}
.sv-chain svg { flex-shrink: 0; color: var(--sv-green); }
.sv-chain-title { font-size: 0.82rem; font-weight: 700; line-height: 1.25; }
.sv-chain-sub { font-size: 0.72rem; color: rgba(255,255,255,0.7); margin-top: 1px; }

/* Buttons */
.sv-btn {
    position: relative;
    width: 100%;
    margin-top: 1rem;
    padding: 0.9rem 1.1rem;
    border: none;
    border-radius: 12px;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--sv-blue);
    background: var(--sv-green);
    box-shadow: 0 10px 22px -10px color-mix(in srgb, var(--sv-green) 90%, #000);
    transition: transform 0.18s ease, box-shadow 0.18s ease, filter 0.18s ease;
    animation: sv-rise 0.5s 1.72s ease both;
}
.sv-btn:hover { transform: translateY(-2px); filter: brightness(1.04); box-shadow: 0 16px 28px -12px color-mix(in srgb, var(--sv-green) 90%, #000); }
.sv-btn:active { transform: translateY(0) scale(0.99); }
.sv-btn--blue { color: #fff; background: var(--sv-blue); box-shadow: 0 10px 22px -10px var(--sv-blue); animation: none; margin-top: 0; }
.sv-btn--blue svg { color: var(--sv-green); }

/* Not found */
.sv-nf-title { margin: 1rem 0 0; text-align: center; font-size: 1.3rem; font-weight: 800; letter-spacing: -0.015em; color: #b42318; }
.sv-nf-text { margin: 6px auto 0; max-width: 36ch; text-align: center; font-size: 0.86rem; line-height: 1.5; color: var(--sv-muted); overflow-wrap: anywhere; }
.sv-form { margin-top: 1.4rem; display: flex; flex-direction: column; gap: 10px; }
.sv-input-wrap { position: relative; }
.sv-input-wrap svg { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; transition: color 0.2s ease; }
.sv-input {
    width: 100%;
    padding: 0.85rem 1rem 0.85rem 2.6rem;
    border-radius: 12px;
    border: 1.5px solid #d5dde6;
    background: #fff;
    font: inherit;
    font-size: 0.9rem;
    color: var(--sv-ink);
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
.sv-input::placeholder { color: #94a3b8; }
.sv-input:focus { border-color: var(--sv-green); box-shadow: 0 0 0 4px color-mix(in srgb, var(--sv-green) 28%, transparent); }
.sv-input-wrap:focus-within svg { color: var(--sv-blue); }

/* Footer */
.sv-footer {
    padding: 0.9rem;
    text-align: center;
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--sv-muted);
    background: #f8fafc;
    border-top: 1px solid var(--sv-line);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
}
.sv-footer-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--sv-green); animation: sv-blink 2.4s ease-in-out infinite; }

/* Focus visibility */
.sv-btn:focus-visible, .sv-copy:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--sv-green) 60%, #fff);
    outline-offset: 2px;
}

/* ---------- Keyframes ---------- */
@keyframes sv-card-in { from { opacity: 0; transform: translateY(24px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes sv-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes sv-pop { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: scale(1); } }
@keyframes sv-draw { to { stroke-dashoffset: 0; } }
@keyframes sv-pulse { 0% { opacity: 0.7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.55); } }
@keyframes sv-shake { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
@keyframes sv-grid-drift { to { background-position: 28px 28px, 28px 28px; } }
@keyframes sv-shimmer-line { to { background-position: -200% 0; } }
@keyframes sv-sweep { 0% { left: -60%; } 40%, 100% { left: 130%; } }
@keyframes sv-blink { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

@media (max-width: 420px) {
    .sv-recipient-name { font-size: 1.3rem; }
    .sv-code { flex-wrap: wrap; }
}

@media (prefers-reduced-motion: reduce) {
    .sv-page *, .sv-page *::before, .sv-page *::after {
        animation-duration: 0.01ms !important;
        animation-delay: 0ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */
export const StudentVerification: React.FC = () => {
    const { verificationCode } = useParams<{ verificationCode: string }>();
    const navigate = useNavigate();

    const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchedCode, setSearchedCode] = useState('');
    const [inputCode, setInputValue] = useState('');
    const [copied, setCopied] = useState(false);

    const cleanCode = (verificationCode || '').trim();

    useEffect(() => {
        let isMounted = true;

        const verifyCredential = async () => {
            if (!cleanCode || cleanCode.startsWith(':') || cleanCode === 'PREVIEW-SAMPLE-123456') {
                if (isMounted) {
                    setCertificate(null);
                    setIsLoading(false);
                }
                return;
            }

            setIsLoading(true);
            setSearchedCode(cleanCode);

            try {
                let foundData: VerifiedCertificate | null = null;

                // 1. SEARCH ad_hoc_certificates COLLECTION (Single & Bulk Studio Certs)
                const adHocRef = collection(db, 'ad_hoc_certificates');
                const qAdHocCode = query(adHocRef, where('verificationCode', '==', cleanCode));
                const snapAdHocCode = await getDocs(qAdHocCode);

                if (!snapAdHocCode.empty) {
                    const docData = snapAdHocCode.docs[0].data();
                    foundData = {
                        id: snapAdHocCode.docs[0].id,
                        verificationCode: docData.verificationCode || cleanCode,
                        recipientName: docData.recipientName || 'Valued Recipient',
                        courseName: docData.courseName || docData.programme || 'Specialized Program',
                        type: docData.type || 'Certificate of Achievement',
                        issueDate: docData.issueDate || 'N/A',
                        institutionName: docData.institutionName || 'mLab Southern Africa',
                        blockchainStatus: docData.blockchainStatus || 'pending',
                        blockchainTxHash: docData.blockchainTxHash || null,
                        ipfsHash: docData.ipfsHash || null,
                        pdfUrl: docData.pdfUrl || null
                    };
                } else {
                    const docDirect = await getDoc(doc(db, 'ad_hoc_certificates', cleanCode));
                    if (docDirect.exists()) {
                        const docData = docDirect.data();
                        foundData = {
                            id: docDirect.id,
                            verificationCode: docData.verificationCode || cleanCode,
                            recipientName: docData.recipientName || 'Valued Recipient',
                            courseName: docData.courseName || docData.programme || 'Specialized Program',
                            type: docData.type || 'Certificate of Achievement',
                            issueDate: docData.issueDate || 'N/A',
                            institutionName: docData.institutionName || 'mLab Southern Africa',
                            blockchainStatus: docData.blockchainStatus || 'pending',
                            blockchainTxHash: docData.blockchainTxHash || null,
                            ipfsHash: docData.ipfsHash || null,
                            pdfUrl: docData.pdfUrl || null
                        };
                    }
                }

                // 2. SEARCH enrollments COLLECTION (Statement of Results / Formal Qualifications)
                if (!foundData) {
                    const enrollRef = collection(db, 'enrollments');
                    const qEnrollCode = query(enrollRef, where('verificationCode', '==', cleanCode));
                    const snapEnroll = await getDocs(qEnrollCode);

                    if (!snapEnroll.empty) {
                        const docData = snapEnroll.docs[0].data();
                        foundData = {
                            id: snapEnroll.docs[0].id,
                            verificationCode: docData.verificationCode || cleanCode,
                            recipientName: docData.fullName || docData.learnerName || 'Learner',
                            courseName: docData.qualification?.name || docData.courseName || 'Occupational Qualification',
                            type: 'Official Statement of Results',
                            issueDate: docData.issueDate || 'N/A',
                            institutionName: 'mLab Southern Africa',
                            blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
                            blockchainTxHash: docData.blockchainFingerprint || null,
                            ipfsHash: docData.ipfsHash || null,
                            pdfUrl: docData.pdfUrl || null
                        };
                    }
                }

                // 3. SEARCH learners COLLECTION (Legacy Learners)
                if (!foundData) {
                    const learnersRef = collection(db, 'learners');
                    const qLearnerCode = query(learnersRef, where('verificationCode', '==', cleanCode));
                    const snapLearner = await getDocs(qLearnerCode);

                    if (!snapLearner.empty) {
                        const docData = snapLearner.docs[0].data();
                        foundData = {
                            id: snapLearner.docs[0].id,
                            verificationCode: docData.verificationCode || cleanCode,
                            recipientName: docData.fullName || 'Learner',
                            courseName: docData.qualification?.name || 'Occupational Qualification',
                            type: 'Official Qualification Certificate',
                            issueDate: docData.issueDate || 'N/A',
                            institutionName: 'mLab Southern Africa',
                            blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
                            blockchainTxHash: docData.blockchainFingerprint || null,
                            ipfsHash: docData.ipfsHash || null,
                            pdfUrl: docData.pdfUrl || null
                        };
                    }
                }

                if (isMounted) {
                    setCertificate(foundData);
                }
            } catch (error) {
                console.error("Public Verification Error:", error);
                if (isMounted) setCertificate(null);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        verifyCredential();
        return () => { isMounted = false; };
    }, [cleanCode]);

    const handleManualSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (inputCode.trim()) {
            navigate(`/verify/${inputCode.trim()}`);
        }
    };

    const handleCopy = async () => {
        if (!certificate) return;
        try {
            await navigator.clipboard.writeText(certificate.verificationCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard unavailable - ignore */
        }
    };

    if (isLoading) return <Loader message="Verifying Credential Authenticity..." />;

    const detailRows = certificate
        ? [
            { icon: <Award size={18} />, label: 'Award title', value: certificate.type },
            { icon: <BookOpen size={18} />, label: 'Programme / course', value: certificate.courseName },
            { icon: <Building2 size={18} />, label: 'Issuing institution', value: 'Mobile Applications Laboratory NPC' },
            { icon: <Calendar size={18} />, label: 'Date of issue', value: moment(certificate.issueDate).format("DD MMM YYYY") },
        ]
        : [];

    return (
        <div className="sv-page">
            <style>{styles}</style>

            <div className="sv-card">
                {/* Header */}
                <div className="sv-header">
                    <div className="sv-logo">
                        <img src={mLabLogo} alt="mLab Southern Africa" />
                    </div>
                    <h1 className="sv-title">Credential Verification</h1>
                    <p className="sv-subtitle">Official identity &amp; authenticity portal</p>
                </div>

                {certificate ? (
                    /* ---------------- SUCCESS ---------------- */
                    <>
                        <div className="sv-seal-wrap">
                            <div className="sv-seal" aria-hidden="true">
                                <span className="sv-seal-pulse" />
                                <svg width="88" height="88" viewBox="0 0 88 88">
                                    <circle className="sv-seal-ring" cx="44" cy="44" r="42" style={{ stroke: 'var(--mlab-green, #94c73d)' }} />
                                    <path className="sv-seal-check" d="M28 45 L39 56 L60 33" style={{ stroke: 'var(--mlab-blue, #002b49)' }} />
                                </svg>
                            </div>
                        </div>

                        <div className="sv-body" style={{ paddingTop: 0 }}>
                            <h2 className="sv-verified-title">Officially verified</h2>
                            <p className="sv-verified-sub">This document matches the official institution registry.</p>

                            <div className="sv-recipient">
                                <span className="sv-label">Issued to</span>
                                <p className="sv-recipient-name">{certificate.recipientName}</p>
                            </div>

                            <div className="sv-details">
                                {detailRows.map(row => (
                                    <div className="sv-row" key={row.label}>
                                        <div className="sv-icon">{row.icon}</div>
                                        <div className="sv-row-text">
                                            <span className="sv-label">{row.label}</span>
                                            <p className="sv-value">{row.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="sv-code">
                                <div className="sv-code-text">
                                    <span className="sv-label">Verification code</span>
                                    <span className="sv-code-value">{certificate.verificationCode}</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopy}
                                    className={`sv-copy ${copied ? 'sv-copy--done' : ''}`}
                                    aria-label="Copy verification code"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>

                            {certificate.blockchainStatus === 'anchored' && (
                                <div className="sv-chain">
                                    <Fingerprint size={22} />
                                    <div>
                                        <div className="sv-chain-title">Anchored to the Ethereum Sepolia blockchain</div>
                                        <div className="sv-chain-sub">Tamper-proof record of this credential</div>
                                    </div>
                                </div>
                            )}

                            {certificate.pdfUrl && (
                                <button
                                    type="button"
                                    className="sv-btn"
                                    onClick={() => window.open(certificate.pdfUrl, '_blank')}
                                >
                                    <ExternalLink size={16} /> View official PDF
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    /* ---------------- NOT FOUND ---------------- */
                    <>
                        <div className="sv-seal-wrap">
                            <div className="sv-seal sv-seal--error" aria-hidden="true" style={{ boxShadow: '0 10px 30px -8px rgba(180,35,24,0.4)' }}>
                                <ShieldAlert size={40} color="#ef4444" />
                            </div>
                        </div>

                        <div className="sv-body" style={{ paddingTop: 0 }}>
                            <h2 className="sv-nf-title">Credential not found</h2>
                            <p className="sv-nf-text">
                                {searchedCode
                                    ? `We couldn't find the code "${searchedCode}" in our registry. Check for typos and try again.`
                                    : 'Enter the verification code printed on the certificate to check it.'}
                            </p>

                            <form onSubmit={handleManualSearch} className="sv-form">
                                <div className="sv-input-wrap">
                                    <Search size={16} />
                                    <input
                                        className="sv-input"
                                        type="text"
                                        placeholder="Enter certificate code (e.g. CERT12345)"
                                        value={inputCode}
                                        onChange={e => setInputValue(e.target.value)}
                                        aria-label="Certificate verification code"
                                    />
                                </div>
                                <button type="submit" className="sv-btn sv-btn--blue">
                                    <ShieldCheck size={16} /> Verify credential
                                </button>
                            </form>
                        </div>
                    </>
                )}

                {/* Footer */}
                <div className="sv-footer">
                    <span className="sv-footer-dot" />
                    mLab Secure Identity &amp; Credential Engine
                </div>
            </div>
        </div>
    );
};

export default StudentVerification;


// // src/pages/LearnerPortal/public/StudentVerification/StudentVerification.tsx

// import React, { useEffect, useState } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// import { ShieldCheck, ShieldAlert, Award, Search, CheckCircle, ExternalLink, Calendar, User, BookOpen, Building2 } from 'lucide-react';
// import { db } from '../../../../lib/firebase';
// import Loader from '../../../../components/common/Loader/Loader';
// import mLabLogo from '../../../../assets/logo/mlab_logo.png';

// interface VerifiedCertificate {
//     id: string;
//     verificationCode: string;
//     recipientName: string;
//     courseName: string;
//     type: string;
//     issueDate: string;
//     institutionName?: string;
//     blockchainStatus?: string;
//     blockchainTxHash?: string;
//     ipfsHash?: string;
//     pdfUrl?: string;
// }

// export const StudentVerification: React.FC = () => {
//     const { verificationCode } = useParams<{ verificationCode: string }>();
//     const navigate = useNavigate();

//     const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);
//     const [isLoading, setIsLoading] = useState(true);
//     const [searchedCode, setSearchedCode] = useState('');
//     const [inputCode, setInputValue] = useState('');

//     const cleanCode = (verificationCode || '').trim();

//     useEffect(() => {
//         let isMounted = true;

//         const verifyCredential = async () => {
//             if (!cleanCode || cleanCode.startsWith(':') || cleanCode === 'PREVIEW-SAMPLE-123456') {
//                 if (isMounted) {
//                     setCertificate(null);
//                     setIsLoading(false);
//                 }
//                 return;
//             }

//             setIsLoading(true);
//             setSearchedCode(cleanCode);

//             try {
//                 let foundData: VerifiedCertificate | null = null;

//                 // 🚀 1. SEARCH ad_hoc_certificates COLLECTION (Single & Bulk Studio Certs)
//                 const adHocRef = collection(db, 'ad_hoc_certificates');
//                 const qAdHocCode = query(adHocRef, where('verificationCode', '==', cleanCode));
//                 const snapAdHocCode = await getDocs(qAdHocCode);

//                 if (!snapAdHocCode.empty) {
//                     const docData = snapAdHocCode.docs[0].data();
//                     foundData = {
//                         id: snapAdHocCode.docs[0].id,
//                         verificationCode: docData.verificationCode || cleanCode,
//                         recipientName: docData.recipientName || 'Valued Recipient',
//                         courseName: docData.courseName || docData.programme || 'Specialized Program',
//                         type: docData.type || 'Certificate of Achievement',
//                         issueDate: docData.issueDate || 'N/A',
//                         institutionName: docData.institutionName || 'mLab Southern Africa',
//                         blockchainStatus: docData.blockchainStatus || 'pending',
//                         blockchainTxHash: docData.blockchainTxHash || null,
//                         ipfsHash: docData.ipfsHash || null,
//                         pdfUrl: docData.pdfUrl || null
//                     };
//                 } else {
//                     const docDirect = await getDoc(doc(db, 'ad_hoc_certificates', cleanCode));
//                     if (docDirect.exists()) {
//                         const docData = docDirect.data();
//                         foundData = {
//                             id: docDirect.id,
//                             verificationCode: docData.verificationCode || cleanCode,
//                             recipientName: docData.recipientName || 'Valued Recipient',
//                             courseName: docData.courseName || docData.programme || 'Specialized Program',
//                             type: docData.type || 'Certificate of Achievement',
//                             issueDate: docData.issueDate || 'N/A',
//                             institutionName: docData.institutionName || 'mLab Southern Africa',
//                             blockchainStatus: docData.blockchainStatus || 'pending',
//                             blockchainTxHash: docData.blockchainTxHash || null,
//                             ipfsHash: docData.ipfsHash || null,
//                             pdfUrl: docData.pdfUrl || null
//                         };
//                     }
//                 }

//                 // 🚀 2. SEARCH enrollments COLLECTION (Statement of Results / Formal Qualifications)
//                 if (!foundData) {
//                     const enrollRef = collection(db, 'enrollments');
//                     const qEnrollCode = query(enrollRef, where('verificationCode', '==', cleanCode));
//                     const snapEnroll = await getDocs(qEnrollCode);

//                     if (!snapEnroll.empty) {
//                         const docData = snapEnroll.docs[0].data();
//                         foundData = {
//                             id: snapEnroll.docs[0].id,
//                             verificationCode: docData.verificationCode || cleanCode,
//                             recipientName: docData.fullName || docData.learnerName || 'Learner',
//                             courseName: docData.qualification?.name || docData.courseName || 'Occupational Qualification',
//                             type: 'Official Statement of Results',
//                             issueDate: docData.issueDate || 'N/A',
//                             institutionName: 'mLab Southern Africa',
//                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
//                             blockchainTxHash: docData.blockchainFingerprint || null,
//                             ipfsHash: docData.ipfsHash || null,
//                             pdfUrl: docData.pdfUrl || null
//                         };
//                     }
//                 }

//                 // 🚀 3. SEARCH learners COLLECTION (Legacy Learners)
//                 if (!foundData) {
//                     const learnersRef = collection(db, 'learners');
//                     const qLearnerCode = query(learnersRef, where('verificationCode', '==', cleanCode));
//                     const snapLearner = await getDocs(qLearnerCode);

//                     if (!snapLearner.empty) {
//                         const docData = snapLearner.docs[0].data();
//                         foundData = {
//                             id: snapLearner.docs[0].id,
//                             verificationCode: docData.verificationCode || cleanCode,
//                             recipientName: docData.fullName || 'Learner',
//                             courseName: docData.qualification?.name || 'Occupational Qualification',
//                             type: 'Official Qualification Certificate',
//                             issueDate: docData.issueDate || 'N/A',
//                             institutionName: 'mLab Southern Africa',
//                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
//                             blockchainTxHash: docData.blockchainFingerprint || null,
//                             ipfsHash: docData.ipfsHash || null,
//                             pdfUrl: docData.pdfUrl || null
//                         };
//                     }
//                 }

//                 if (isMounted) {
//                     setCertificate(foundData);
//                 }
//             } catch (error) {
//                 console.error("Public Verification Error:", error);
//                 if (isMounted) setCertificate(null);
//             } finally {
//                 if (isMounted) setIsLoading(false);
//             }
//         };

//         verifyCredential();
//         return () => { isMounted = false; };
//     }, [cleanCode]);

//     const handleManualSearch = (e: React.FormEvent) => {
//         e.preventDefault();
//         if (inputCode.trim()) {
//             navigate(`/verify/${inputCode.trim()}`);
//         }
//     };

//     if (isLoading) return <Loader message="Verifying Credential Authenticity..." />;

//     return (
//         <div style={{
//             minHeight: '100vh',
//             width: '100%',
//             backgroundColor: 'whitesmoke',
//             display: 'flex',
//             flexDirection: 'column',
//             alignItems: 'center',
//             justifyContent: 'flex-start',
//             padding: '1.25rem 0.75rem 3rem 0.75rem',
//             boxSizing: 'border-box',
//             overflowY: 'auto',
//             position: "absolute",
//             top: 0,
//             bottom: 0,
//             left: 0,
//             right: 0,
//             WebkitOverflowScrolling: 'touch',
//             fontFamily: 'system-ui, -apple-system, sans-serif'
//         }}>
//             <div style={{
//                 width: '100%',
//                 maxWidth: '560px',
//                 backgroundColor: '#ffffff',
//                 borderRadius: '16px',
//                 boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
//                 overflow: 'hidden',
//                 margin: '0 auto',
//                 flexShrink: 0
//             }}>
//                 {/* Header Banner */}
//                 <div style={{
//                     backgroundColor: 'var(--mlab-blue, #002b49)',
//                     padding: '1.5rem 1rem',
//                     textAlign: 'center',
//                     color: 'white',
//                     borderBottom: '4px solid var(--mlab-green, #94c73d)'
//                 }}>
//                     {/* Official mLab Logo Badge */}
//                     <div style={{
//                         backgroundColor: '#ffffff',
//                         padding: '6px 16px',
//                         borderRadius: '8px',
//                         display: 'inline-flex',
//                         alignItems: 'center',
//                         justifyContent: 'center',
//                         margin: '0 auto 0.75rem auto',
//                         boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
//                     }}>
//                         <img
//                             src={mLabLogo}
//                             alt="mLab Southern Africa"
//                             style={{
//                                 height: '28px',
//                                 objectFit: 'contain'
//                             }}
//                         />
//                     </div>
//                     <h1 style={{ margin: 0, fontSize: '1.15rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
//                         Credential Verification
//                     </h1>
//                     <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#94a3b8' }}>
//                         Official Identity &amp; Authenticity Portal
//                     </p>
//                 </div>

//                 {/* Main Body */}
//                 <div style={{ padding: '1.25rem' }}>
//                     {certificate ? (
//                         /* SUCCESS STATE */
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                             <div style={{
//                                 backgroundColor: '#f0fdf4',
//                                 border: '1px solid #bbf7d0',
//                                 borderRadius: '12px',
//                                 padding: '0.85rem 1rem',
//                                 display: 'flex',
//                                 alignItems: 'center',
//                                 gap: '12px'
//                             }}>
//                                 <CheckCircle size={28} color="#16a34a" style={{ flexShrink: 0 }} />
//                                 <div>
//                                     <h2 style={{ margin: 0, color: '#166534', fontSize: '1rem', fontWeight: 700 }}>
//                                         Officially Verified
//                                     </h2>
//                                     <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.78rem', lineHeight: '1.3' }}>
//                                         This document matches the official institution registry.
//                                     </p>
//                                 </div>
//                             </div>

//                             {/* Details Grid */}
//                             <div style={{
//                                 backgroundColor: '#f8fafc',
//                                 border: '1px solid #e2e8f0',
//                                 borderRadius: '12px',
//                                 padding: '1rem',
//                                 display: 'flex',
//                                 flexDirection: 'column',
//                                 gap: '0.85rem'
//                             }}>
//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                     <User size={18} color="#002b49" style={{ marginTop: '2px', flexShrink: 0 }} />
//                                     <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
//                                         <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Recipient Name</span>
//                                         <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', lineHeight: '1.3' }}>{certificate.recipientName}</p>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                     <Award size={18} color="#002b49" style={{ marginTop: '2px', flexShrink: 0 }} />
//                                     <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
//                                         <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Award Title</span>
//                                         <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#002b49', lineHeight: '1.3' }}>{certificate.type}</p>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                     <BookOpen size={18} color="#002b49" style={{ marginTop: '2px', flexShrink: 0 }} />
//                                     <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
//                                         <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Programme / Course</span>
//                                         <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', fontWeight: 600, lineHeight: '1.3' }}>{certificate.courseName}</p>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                     <Building2 size={18} color="#002b49" style={{ marginTop: '2px', flexShrink: 0 }} />
//                                     <div style={{ minWidth: 0, flex: 1, wordBreak: 'break-word' }}>
//                                         <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Issuing Institution</span>
//                                         <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', fontWeight: 600, lineHeight: '1.3' }}>{'Mobile Applications Laboratory NPC'}</p>
//                                     </div>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
//                                     <Calendar size={18} color="#002b49" style={{ marginTop: '2px', flexShrink: 0 }} />
//                                     <div style={{ minWidth: 0, flex: 1 }}>
//                                         <span style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Date of Issue</span>
//                                         <p style={{ margin: 0, fontSize: '0.88rem', color: '#334155', fontWeight: 600 }}>{certificate.issueDate}</p>
//                                     </div>
//                                 </div>
//                             </div>

//                             {/* Blockchain Security Badge */}
//                             {certificate.blockchainStatus === 'anchored' && (
//                                 <div style={{
//                                     backgroundColor: '#eff6ff',
//                                     border: '1px solid #bfdbfe',
//                                     borderRadius: '10px',
//                                     padding: '10px 12px',
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     justifyContent: 'space-between',
//                                     flexWrap: 'wrap',
//                                     gap: '8px'
//                                 }}>
//                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
//                                         <ShieldCheck size={18} color="#2563eb" style={{ flexShrink: 0 }} />
//                                         <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1e40af', lineHeight: '1.2' }}>Anchored to Ethereum Sepolia Blockchain</span>
//                                     </div>
//                                     {/* {certificate.blockchainTxHash && (
//                                         <a
//                                             href={`https://sepolia.etherscan.io/tx/${certificate.blockchainTxHash}`}
//                                             target="_blank"
//                                             rel="noreferrer"
//                                             style={{ color: '#2563eb', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none', marginLeft: 'auto' }}
//                                         >
//                                             View <ExternalLink size={12} />
//                                         </a>
//                                     )} */}
//                                 </div>
//                             )}

//                             {/* View Original PDF Button */}
//                             {certificate.pdfUrl && (
//                                 <button
//                                     onClick={() => window.open(certificate.pdfUrl, '_blank')}
//                                     style={{
//                                         width: '100%',
//                                         padding: '0.8rem 1rem',
//                                         backgroundColor: '#002b49',
//                                         color: 'white',
//                                         border: 'none',
//                                         borderRadius: '8px',
//                                         fontWeight: 700,
//                                         fontSize: '0.85rem',
//                                         cursor: 'pointer',
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'center',
//                                         gap: '8px',
//                                         boxSizing: 'border-box'
//                                     }}
//                                 >
//                                     <ExternalLink size={16} /> View Official PDF Document
//                                 </button>
//                             )}
//                         </div>
//                     ) : (
//                         /* INVALID / NOT FOUND STATE */
//                         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
//                             <div style={{
//                                 width: '56px',
//                                 height: '56px',
//                                 borderRadius: '50%',
//                                 backgroundColor: '#fef2f2',
//                                 border: '1px solid #fecaca',
//                                 display: 'flex',
//                                 alignItems: 'center',
//                                 justifyContent: 'center',
//                                 margin: '0 auto'
//                             }}>
//                                 <ShieldAlert size={32} color="#ef4444" />
//                             </div>

//                             <div>
//                                 <h2 style={{ margin: 0, color: '#991b1b', fontSize: '1.15rem', fontWeight: 800 }}>
//                                     Credential Not Found
//                                 </h2>
//                                 <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.82rem', lineHeight: '1.4' }}>
//                                     {searchedCode ? `The code "${searchedCode}" was not recognized in our database.` : 'Please enter a valid credential verification code below.'}
//                                 </p>
//                             </div>

//                             {/* Manual Lookup Input */}
//                             <form onSubmit={handleManualSearch} style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem' }}>
//                                 <input
//                                     type="text"
//                                     placeholder="Enter Certificate Code (e.g. CERT12345)"
//                                     value={inputCode}
//                                     onChange={e => setInputValue(e.target.value)}
//                                     style={{
//                                         width: '100%',
//                                         padding: '0.65rem 0.8rem',
//                                         borderRadius: '8px',
//                                         border: '1px solid #cbd5e1',
//                                         fontSize: '0.85rem',
//                                         outline: 'none',
//                                         boxSizing: 'border-box'
//                                     }}
//                                 />
//                                 <button
//                                     type="submit"
//                                     style={{
//                                         width: '100%',
//                                         padding: '0.65rem 1rem',
//                                         backgroundColor: '#002b49',
//                                         color: 'white',
//                                         border: 'none',
//                                         borderRadius: '8px',
//                                         fontWeight: 700,
//                                         fontSize: '0.85rem',
//                                         cursor: 'pointer',
//                                         display: 'flex',
//                                         alignItems: 'center',
//                                         justifyContent: 'center',
//                                         gap: '6px',
//                                         boxSizing: 'border-box'
//                                     }}
//                                 >
//                                     <Search size={14} /> Verify
//                                 </button>
//                             </form>
//                         </div>
//                     )}
//                 </div>

//                 {/* Footer */}
//                 <div style={{
//                     backgroundColor: '#f8fafc',
//                     borderTop: '1px solid #e2e8f0',
//                     padding: '0.75rem',
//                     textAlign: 'center',
//                     fontSize: '0.72rem',
//                     color: '#64748b'
//                 }}>
//                     <strong>mLab Secure Identity &amp; Credential Engine</strong>
//                 </div>
//             </div>
//         </div>
//     );
// };

// export default StudentVerification;
// // // src/pages/LearnerPortal/public/StudentVerification/StudentVerification.tsx

// // import React, { useEffect, useState } from 'react';
// // import { useParams, useNavigate } from 'react-router-dom';
// // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // import { ShieldCheck, ShieldAlert, Award, Search, CheckCircle, ExternalLink, Calendar, User, BookOpen } from 'lucide-react';
// // import { db } from '../../../../lib/firebase';
// // import Loader from '../../../../components/common/Loader/Loader';

// // interface VerifiedCertificate {
// //     id: string;
// //     verificationCode: string;
// //     recipientName: string;
// //     courseName: string;
// //     type: string;
// //     issueDate: string;
// //     institutionName?: string;
// //     blockchainStatus?: string;
// //     blockchainTxHash?: string;
// //     ipfsHash?: string;
// //     pdfUrl?: string;
// // }

// // export const StudentVerification: React.FC = () => {
// //     const { verificationCode } = useParams<{ verificationCode: string }>();
// //     const navigate = useNavigate();

// //     const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);
// //     const [isLoading, setIsLoading] = useState(true);
// //     const [searchedCode, setSearchedCode] = useState('');
// //     const [inputCode, setInputValue] = useState('');

// //     const cleanCode = (verificationCode || '').trim();

// //     useEffect(() => {
// //         let isMounted = true;

// //         const verifyCredential = async () => {
// //             // Ignore route placeholders like ":verificationCode" or empty strings
// //             if (!cleanCode || cleanCode.startsWith(':') || cleanCode === 'PREVIEW-SAMPLE-123456') {
// //                 if (isMounted) {
// //                     setCertificate(null);
// //                     setIsLoading(false);
// //                 }
// //                 return;
// //             }

// //             setIsLoading(true);
// //             setSearchedCode(cleanCode);

// //             try {
// //                 let foundData: VerifiedCertificate | null = null;

// //                 // 🚀 1. SEARCH ad_hoc_certificates COLLECTION (Single & Bulk Studio Certs)
// //                 const adHocRef = collection(db, 'ad_hoc_certificates');
// //                 const qAdHocCode = query(adHocRef, where('verificationCode', '==', cleanCode));
// //                 const snapAdHocCode = await getDocs(qAdHocCode);

// //                 if (!snapAdHocCode.empty) {
// //                     const docData = snapAdHocCode.docs[0].data();
// //                     foundData = {
// //                         id: snapAdHocCode.docs[0].id,
// //                         verificationCode: docData.verificationCode || cleanCode,
// //                         recipientName: docData.recipientName || 'Valued Recipient',
// //                         courseName: docData.courseName || docData.programme || 'Specialized Program',
// //                         type: docData.type || 'Certificate of Achievement',
// //                         issueDate: docData.issueDate || 'N/A',
// //                         institutionName: docData.institutionName || 'mLab Southern Africa',
// //                         blockchainStatus: docData.blockchainStatus || 'pending',
// //                         blockchainTxHash: docData.blockchainTxHash || null,
// //                         ipfsHash: docData.ipfsHash || null,
// //                         pdfUrl: docData.pdfUrl || null
// //                     };
// //                 } else {
// //                     // Try by document ID
// //                     const docDirect = await getDoc(doc(db, 'ad_hoc_certificates', cleanCode));
// //                     if (docDirect.exists()) {
// //                         const docData = docDirect.data();
// //                         foundData = {
// //                             id: docDirect.id,
// //                             verificationCode: docData.verificationCode || cleanCode,
// //                             recipientName: docData.recipientName || 'Valued Recipient',
// //                             courseName: docData.courseName || docData.programme || 'Specialized Program',
// //                             type: docData.type || 'Certificate of Achievement',
// //                             issueDate: docData.issueDate || 'N/A',
// //                             institutionName: docData.institutionName || 'mLab Southern Africa',
// //                             blockchainStatus: docData.blockchainStatus || 'pending',
// //                             blockchainTxHash: docData.blockchainTxHash || null,
// //                             ipfsHash: docData.ipfsHash || null,
// //                             pdfUrl: docData.pdfUrl || null
// //                         };
// //                     }
// //                 }

// //                 // 🚀 2. SEARCH enrollments COLLECTION (Statement of Results / Formal Qualifications)
// //                 if (!foundData) {
// //                     const enrollRef = collection(db, 'enrollments');
// //                     const qEnrollCode = query(enrollRef, where('verificationCode', '==', cleanCode));
// //                     const snapEnroll = await getDocs(qEnrollCode);

// //                     if (!snapEnroll.empty) {
// //                         const docData = snapEnroll.docs[0].data();
// //                         foundData = {
// //                             id: snapEnroll.docs[0].id,
// //                             verificationCode: docData.verificationCode || cleanCode,
// //                             recipientName: docData.fullName || docData.learnerName || 'Learner',
// //                             courseName: docData.qualification?.name || docData.courseName || 'Occupational Qualification',
// //                             type: 'Official Statement of Results',
// //                             issueDate: docData.issueDate || 'N/A',
// //                             institutionName: 'mLab Southern Africa',
// //                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
// //                             blockchainTxHash: docData.blockchainFingerprint || null,
// //                             ipfsHash: docData.ipfsHash || null,
// //                             pdfUrl: docData.pdfUrl || null
// //                         };
// //                     }
// //                 }

// //                 // 🚀 3. SEARCH learners COLLECTION (Legacy Learners)
// //                 if (!foundData) {
// //                     const learnersRef = collection(db, 'learners');
// //                     const qLearnerCode = query(learnersRef, where('verificationCode', '==', cleanCode));
// //                     const snapLearner = await getDocs(qLearnerCode);

// //                     if (!snapLearner.empty) {
// //                         const docData = snapLearner.docs[0].data();
// //                         foundData = {
// //                             id: snapLearner.docs[0].id,
// //                             verificationCode: docData.verificationCode || cleanCode,
// //                             recipientName: docData.fullName || 'Learner',
// //                             courseName: docData.qualification?.name || 'Occupational Qualification',
// //                             type: 'Official Qualification Certificate',
// //                             issueDate: docData.issueDate || 'N/A',
// //                             institutionName: 'mLab Southern Africa',
// //                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
// //                             blockchainTxHash: docData.blockchainFingerprint || null,
// //                             ipfsHash: docData.ipfsHash || null,
// //                             pdfUrl: docData.pdfUrl || null
// //                         };
// //                     }
// //                 }

// //                 if (isMounted) {
// //                     setCertificate(foundData);
// //                 }
// //             } catch (error) {
// //                 console.error("Public Verification Error:", error);
// //                 if (isMounted) setCertificate(null);
// //             } finally {
// //                 if (isMounted) setIsLoading(false);
// //             }
// //         };

// //         verifyCredential();
// //         return () => { isMounted = false; };
// //     }, [cleanCode]);

// //     const handleManualSearch = (e: React.FormEvent) => {
// //         e.preventDefault();
// //         if (inputCode.trim()) {
// //             navigate(`/verify/${inputCode.trim()}`);
// //         }
// //     };

// //     if (isLoading) return <Loader message="Verifying Credential Authenticity..." />;

// //     return (
// //         <div style={{
// //             minHeight: '100vh',
// //             width: '100%',
// //             backgroundColor: '#0f172a',
// //             display: 'flex',
// //             flexDirection: 'column',
// //             alignItems: 'center',
// //             justifyContent: 'flex-start',
// //             padding: '2rem 1rem',
// //             boxSizing: 'border-box',
// //             overflowY: 'auto',
// //             fontFamily: 'system-ui, -apple-system, sans-serif'
// //         }}>
// //             <div style={{
// //                 width: '100%',
// //                 maxWidth: '560px',
// //                 backgroundColor: '#ffffff',
// //                 borderRadius: '16px',
// //                 boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
// //                 overflow: 'hidden',
// //                 margin: 'auto 0'
// //             }}>
// //                 {/* Header Banner */}
// //                 <div style={{
// //                     backgroundColor: 'var(--mlab-blue, #002b49)',
// //                     padding: '1.5rem',
// //                     textAlign: 'center',
// //                     color: 'white',
// //                     borderBottom: '4px solid var(--mlab-green, #94c73d)'
// //                 }}>
// //                     <div style={{
// //                         width: '48px',
// //                         height: '48px',
// //                         borderRadius: '50%',
// //                         backgroundColor: 'rgba(255,255,255,0.1)',
// //                         display: 'flex',
// //                         alignItems: 'center',
// //                         justifyContent: 'center',
// //                         margin: '0 auto 0.75rem'
// //                     }}>
// //                         <Award size={26} color="#94c73d" />
// //                     </div>
// //                     <h1 style={{ margin: 0, fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
// //                         <span style={{ textTransform: 'none', }}>mLab</span> Credential Verification
// //                     </h1>
// //                     <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
// //                         Official Identity &amp; Authenticity Portal
// //                     </p>
// //                 </div>

// //                 {/* Main Body */}
// //                 <div style={{ padding: '2rem' }}>
// //                     {certificate ? (
// //                         /* SUCCESS STATE */
// //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// //                             <div style={{
// //                                 backgroundColor: '#f0fdf4',
// //                                 border: '1px solid #bbf7d0',
// //                                 borderRadius: '12px',
// //                                 padding: '1rem',
// //                                 display: 'flex',
// //                                 alignItems: 'center',
// //                                 gap: '12px'
// //                             }}>
// //                                 <CheckCircle size={32} color="#16a34a" style={{ flexShrink: 0 }} />
// //                                 <div>
// //                                     <h2 style={{ margin: 0, color: '#166534', fontSize: '1.05rem', fontWeight: 700 }}>
// //                                         Officially Verified
// //                                     </h2>
// //                                     <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.8rem' }}>
// //                                         This document matches the official institution registry.
// //                                     </p>
// //                                 </div>
// //                             </div>

// //                             {/* Details Grid */}
// //                             <div style={{
// //                                 backgroundColor: '#f8fafc',
// //                                 border: '1px solid #e2e8f0',
// //                                 borderRadius: '12px',
// //                                 padding: '1.25rem',
// //                                 display: 'flex',
// //                                 flexDirection: 'column',
// //                                 gap: '1rem'
// //                             }}>
// //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// //                                     <User size={18} color="#002b49" style={{ marginTop: '2px' }} />
// //                                     <div>
// //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Recipient Name</span>
// //                                         <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{certificate.recipientName}</p>
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// //                                     <Award size={18} color="#002b49" style={{ marginTop: '2px' }} />
// //                                     <div>
// //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Award Title</span>
// //                                         <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#002b49' }}>{certificate.type}</p>
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// //                                     <BookOpen size={18} color="#002b49" style={{ marginTop: '2px' }} />
// //                                     <div>
// //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Programme / Course</span>
// //                                         <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{certificate.courseName}</p>
// //                                     </div>
// //                                 </div>

// //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// //                                     <Calendar size={18} color="#002b49" style={{ marginTop: '2px' }} />
// //                                     <div>
// //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Date of Issue</span>
// //                                         <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{certificate.issueDate}</p>
// //                                     </div>
// //                                 </div>
// //                             </div>

// //                             {/* Blockchain Security Badge */}
// //                             {certificate.blockchainStatus === 'anchored' && (
// //                                 <div style={{
// //                                     backgroundColor: '#eff6ff',
// //                                     border: '1px solid #bfdbfe',
// //                                     borderRadius: '10px',
// //                                     padding: '10px 14px',
// //                                     display: 'flex',
// //                                     alignItems: 'center',
// //                                     justifyContent: 'space-between'
// //                                 }}>
// //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// //                                         <ShieldCheck size={20} color="#2563eb" />
// //                                         <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>Anchored to Ethereum Sepolia Blockchain</span>
// //                                     </div>
// //                                     {certificate.blockchainTxHash && (
// //                                         <a
// //                                             href={`https://sepolia.etherscan.io/tx/${certificate.blockchainTxHash}`}
// //                                             target="_blank"
// //                                             rel="noreferrer"
// //                                             style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}
// //                                         >
// //                                             View <ExternalLink size={12} />
// //                                         </a>
// //                                     )}
// //                                 </div>
// //                             )}

// //                             {/* View Original PDF Button */}
// //                             {certificate.pdfUrl && (
// //                                 <button
// //                                     onClick={() => window.open(certificate.pdfUrl, '_blank')}
// //                                     style={{
// //                                         padding: '0.75rem',
// //                                         backgroundColor: '#002b49',
// //                                         color: 'white',
// //                                         border: 'none',
// //                                         borderRadius: '8px',
// //                                         fontWeight: 700,
// //                                         fontSize: '0.85rem',
// //                                         cursor: 'pointer',
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         justifyContent: 'center',
// //                                         gap: '8px'
// //                                     }}
// //                                 >
// //                                     <ExternalLink size={16} /> View Official PDF Document
// //                                 </button>
// //                             )}
// //                         </div>
// //                     ) : (
// //                         /* INVALID / NOT FOUND STATE */
// //                         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// //                             <div style={{
// //                                 width: '64px',
// //                                 height: '64px',
// //                                 borderRadius: '50%',
// //                                 backgroundColor: '#fef2f2',
// //                                 border: '1px solid #fecaca',
// //                                 display: 'flex',
// //                                 alignItems: 'center',
// //                                 justifyContent: 'center',
// //                                 margin: '0 auto'
// //                             }}>
// //                                 <ShieldAlert size={36} color="#ef4444" />
// //                             </div>

// //                             <div>
// //                                 <h2 style={{ margin: 0, color: '#991b1b', fontSize: '1.2rem', fontWeight: 800 }}>
// //                                     Credential Not Found
// //                                 </h2>
// //                                 <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
// //                                     {searchedCode ? `The code "${searchedCode}" was not recognized in our database.` : 'Please enter a valid credential verification code below.'}
// //                                 </p>
// //                             </div>

// //                             {/* Manual Lookup Input */}
// //                             <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
// //                                 <input
// //                                     type="text"
// //                                     placeholder="Enter Certificate Code (e.g. CERT12345)"
// //                                     value={inputCode}
// //                                     onChange={e => setInputValue(e.target.value)}
// //                                     style={{
// //                                         flex: 1,
// //                                         padding: '0.6rem 0.8rem',
// //                                         borderRadius: '8px',
// //                                         border: '1px solid #cbd5e1',
// //                                         fontSize: '0.85rem',
// //                                         outline: 'none'
// //                                     }}
// //                                 />
// //                                 <button
// //                                     type="submit"
// //                                     style={{
// //                                         padding: '0.6rem 1rem',
// //                                         backgroundColor: '#002b49',
// //                                         color: 'white',
// //                                         border: 'none',
// //                                         borderRadius: '8px',
// //                                         fontWeight: 700,
// //                                         fontSize: '0.85rem',
// //                                         cursor: 'pointer',
// //                                         display: 'flex',
// //                                         alignItems: 'center',
// //                                         gap: '6px'
// //                                     }}
// //                                 >
// //                                     <Search size={14} /> Verify
// //                                 </button>
// //                             </form>
// //                         </div>
// //                     )}
// //                 </div>

// //                 {/* Footer */}
// //                 <div style={{
// //                     backgroundColor: '#f8fafc',
// //                     borderTop: '1px solid #e2e8f0',
// //                     padding: '0.85rem',
// //                     textAlign: 'center',
// //                     fontSize: '0.75rem',
// //                     color: '#64748b'
// //                 }}>
// //                     <strong>mLab Secure Identity &amp; Credential Engine</strong>
// //                 </div>
// //             </div>
// //         </div>
// //     );
// // };

// // export default StudentVerification;



// // // // src/pages/LearnerPortal/public/StudentVerification/StudentVerification.tsx

// // // import React, { useEffect, useState } from 'react';
// // // import { useParams, useNavigate } from 'react-router-dom';
// // // import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
// // // import { ShieldCheck, ShieldAlert, Award, Search, CheckCircle, ExternalLink, Calendar, User, BookOpen } from 'lucide-react';
// // // import { db } from '../../../../lib/firebase';
// // // import Loader from '../../../../components/common/Loader/Loader';

// // // interface VerifiedCertificate {
// // //     id: string;
// // //     verificationCode: string;
// // //     recipientName: string;
// // //     courseName: string;
// // //     type: string;
// // //     issueDate: string;
// // //     institutionName?: string;
// // //     blockchainStatus?: string;
// // //     blockchainTxHash?: string;
// // //     ipfsHash?: string;
// // //     pdfUrl?: string;
// // // }

// // // export const StudentVerification: React.FC = () => {
// // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // //     const navigate = useNavigate();

// // //     const [certificate, setCertificate] = useState<VerifiedCertificate | null>(null);
// // //     const [isLoading, setIsLoading] = useState(true);
// // //     const [searchedCode, setSearchedCode] = useState('');
// // //     const [inputCode, setInputValue] = useState('');

// // //     const cleanCode = (verificationCode || '').trim();

// // //     useEffect(() => {
// // //         let isMounted = true;

// // //         const verifyCredential = async () => {
// // //             // Ignore route placeholders like ":verificationCode" or empty strings
// // //             if (!cleanCode || cleanCode.startsWith(':') || cleanCode === 'PREVIEW-SAMPLE-123456') {
// // //                 if (isMounted) {
// // //                     setCertificate(null);
// // //                     setIsLoading(false);
// // //                 }
// // //                 return;
// // //             }

// // //             setIsLoading(true);
// // //             setSearchedCode(cleanCode);

// // //             try {
// // //                 let foundData: VerifiedCertificate | null = null;

// // //                 // 🚀 1. SEARCH ad_hoc_certificates COLLECTION (Single & Bulk Studio Certs)
// // //                 const adHocRef = collection(db, 'ad_hoc_certificates');
// // //                 const qAdHocCode = query(adHocRef, where('verificationCode', '==', cleanCode));
// // //                 const snapAdHocCode = await getDocs(qAdHocCode);

// // //                 if (!snapAdHocCode.empty) {
// // //                     const docData = snapAdHocCode.docs[0].data();
// // //                     foundData = {
// // //                         id: snapAdHocCode.docs[0].id,
// // //                         verificationCode: docData.verificationCode || cleanCode,
// // //                         recipientName: docData.recipientName || 'Valued Recipient',
// // //                         courseName: docData.courseName || docData.programme || 'Specialized Program',
// // //                         type: docData.type || 'Certificate of Achievement',
// // //                         issueDate: docData.issueDate || 'N/A',
// // //                         institutionName: docData.institutionName || 'mLab Southern Africa',
// // //                         blockchainStatus: docData.blockchainStatus || 'pending',
// // //                         blockchainTxHash: docData.blockchainTxHash || null,
// // //                         ipfsHash: docData.ipfsHash || null,
// // //                         pdfUrl: docData.pdfUrl || null
// // //                     };
// // //                 } else {
// // //                     // Try by document ID
// // //                     const docDirect = await getDoc(doc(db, 'ad_hoc_certificates', cleanCode));
// // //                     if (docDirect.exists()) {
// // //                         const docData = docDirect.data();
// // //                         foundData = {
// // //                             id: docDirect.id,
// // //                             verificationCode: docData.verificationCode || cleanCode,
// // //                             recipientName: docData.recipientName || 'Valued Recipient',
// // //                             courseName: docData.courseName || docData.programme || 'Specialized Program',
// // //                             type: docData.type || 'Certificate of Achievement',
// // //                             issueDate: docData.issueDate || 'N/A',
// // //                             institutionName: docData.institutionName || 'mLab Southern Africa',
// // //                             blockchainStatus: docData.blockchainStatus || 'pending',
// // //                             blockchainTxHash: docData.blockchainTxHash || null,
// // //                             ipfsHash: docData.ipfsHash || null,
// // //                             pdfUrl: docData.pdfUrl || null
// // //                         };
// // //                     }
// // //                 }

// // //                 // 🚀 2. SEARCH enrollments COLLECTION (Statement of Results / Formal Qualifications)
// // //                 if (!foundData) {
// // //                     const enrollRef = collection(db, 'enrollments');
// // //                     const qEnrollCode = query(enrollRef, where('verificationCode', '==', cleanCode));
// // //                     const snapEnroll = await getDocs(qEnrollCode);

// // //                     if (!snapEnroll.empty) {
// // //                         const docData = snapEnroll.docs[0].data();
// // //                         foundData = {
// // //                             id: snapEnroll.docs[0].id,
// // //                             verificationCode: docData.verificationCode || cleanCode,
// // //                             recipientName: docData.fullName || docData.learnerName || 'Learner',
// // //                             courseName: docData.qualification?.name || docData.courseName || 'Occupational Qualification',
// // //                             type: 'Official Statement of Results',
// // //                             issueDate: docData.issueDate || 'N/A',
// // //                             institutionName: 'mLab Southern Africa',
// // //                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
// // //                             blockchainTxHash: docData.blockchainFingerprint || null,
// // //                             ipfsHash: docData.ipfsHash || null,
// // //                             pdfUrl: docData.pdfUrl || null
// // //                         };
// // //                     }
// // //                 }

// // //                 // 🚀 3. SEARCH learners COLLECTION (Legacy Learners)
// // //                 if (!foundData) {
// // //                     const learnersRef = collection(db, 'learners');
// // //                     const qLearnerCode = query(learnersRef, where('verificationCode', '==', cleanCode));
// // //                     const snapLearner = await getDocs(qLearnerCode);

// // //                     if (!snapLearner.empty) {
// // //                         const docData = snapLearner.docs[0].data();
// // //                         foundData = {
// // //                             id: snapLearner.docs[0].id,
// // //                             verificationCode: docData.verificationCode || cleanCode,
// // //                             recipientName: docData.fullName || 'Learner',
// // //                             courseName: docData.qualification?.name || 'Occupational Qualification',
// // //                             type: 'Official Qualification Certificate',
// // //                             issueDate: docData.issueDate || 'N/A',
// // //                             institutionName: 'mLab Southern Africa',
// // //                             blockchainStatus: docData.isBlockchainVerified ? 'anchored' : 'pending',
// // //                             blockchainTxHash: docData.blockchainFingerprint || null,
// // //                             ipfsHash: docData.ipfsHash || null,
// // //                             pdfUrl: docData.pdfUrl || null
// // //                         };
// // //                     }
// // //                 }

// // //                 if (isMounted) {
// // //                     setCertificate(foundData);
// // //                 }
// // //             } catch (error) {
// // //                 console.error("Public Verification Error:", error);
// // //                 if (isMounted) setCertificate(null);
// // //             } finally {
// // //                 if (isMounted) setIsLoading(false);
// // //             }
// // //         };

// // //         verifyCredential();
// // //         return () => { isMounted = false; };
// // //     }, [cleanCode]);

// // //     const handleManualSearch = (e: React.FormEvent) => {
// // //         e.preventDefault();
// // //         if (inputCode.trim()) {
// // //             navigate(`/verify/${inputCode.trim()}`);
// // //         }
// // //     };

// // //     if (isLoading) return <Loader message="Verifying Credential Authenticity..." />;

// // //     return (
// // //         <div style={{
// // //             minHeight: '100vh',
// // //             backgroundColor: '#0f172a',
// // //             display: 'flex',
// // //             flexDirection: 'column',
// // //             alignItems: 'center',
// // //             justifyContent: 'center',
// // //             padding: '1.5rem',
// // //             fontFamily: 'system-ui, -apple-system, sans-serif'
// // //         }}>
// // //             <div style={{
// // //                 width: '100%',
// // //                 maxWidth: '560px',
// // //                 backgroundColor: '#ffffff',
// // //                 borderRadius: '16px',
// // //                 boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
// // //                 overflow: 'hidden'
// // //             }}>
// // //                 {/* Header Banner */}
// // //                 <div style={{
// // //                     backgroundColor: 'var(--mlab-blue, #002b49)',
// // //                     padding: '1.5rem',
// // //                     textAlign: 'center',
// // //                     color: 'white',
// // //                     borderBottom: '4px solid var(--mlab-green, #94c73d)'
// // //                 }}>
// // //                     <div style={{
// // //                         width: '48px',
// // //                         height: '48px',
// // //                         borderRadius: '50%',
// // //                         backgroundColor: 'rgba(255,255,255,0.1)',
// // //                         display: 'flex',
// // //                         alignItems: 'center',
// // //                         justifyContent: 'center',
// // //                         margin: '0 auto 0.75rem'
// // //                     }}>
// // //                         <Award size={26} color="#94c73d" />
// // //                     </div>
// // //                     <h1 style={{ margin: 0, fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
// // //                         Credential Verification
// // //                     </h1>
// // //                     <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
// // //                         Official Identity &amp; Authenticity Portal
// // //                     </p>
// // //                 </div>

// // //                 {/* Main Body */}
// // //                 <div style={{ padding: '2rem' }}>
// // //                     {certificate ? (
// // //                         /* SUCCESS STATE */
// // //                         <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
// // //                             <div style={{
// // //                                 backgroundColor: '#f0fdf4',
// // //                                 border: '1px solid #bbf7d0',
// // //                                 borderRadius: '12px',
// // //                                 padding: '1rem',
// // //                                 display: 'flex',
// // //                                 alignItems: 'center',
// // //                                 gap: '12px'
// // //                             }}>
// // //                                 <CheckCircle size={32} color="#16a34a" style={{ flexShrink: 0 }} />
// // //                                 <div>
// // //                                     <h2 style={{ margin: 0, color: '#166534', fontSize: '1.05rem', fontWeight: 700 }}>
// // //                                         Officially Verified
// // //                                     </h2>
// // //                                     <p style={{ margin: '2px 0 0', color: '#15803d', fontSize: '0.8rem' }}>
// // //                                         This document matches the official institution registry.
// // //                                     </p>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Details Grid */}
// // //                             <div style={{
// // //                                 backgroundColor: '#f8fafc',
// // //                                 border: '1px solid #e2e8f0',
// // //                                 borderRadius: '12px',
// // //                                 padding: '1.25rem',
// // //                                 display: 'flex',
// // //                                 flexDirection: 'column',
// // //                                 gap: '1rem'
// // //                             }}>
// // //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// // //                                     <User size={18} color="#002b49" style={{ marginTop: '2px' }} />
// // //                                     <div>
// // //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Recipient Name</span>
// // //                                         <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>{certificate.recipientName}</p>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// // //                                     <Award size={18} color="#002b49" style={{ marginTop: '2px' }} />
// // //                                     <div>
// // //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Award Title</span>
// // //                                         <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#002b49' }}>{certificate.type}</p>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// // //                                     <BookOpen size={18} color="#002b49" style={{ marginTop: '2px' }} />
// // //                                     <div>
// // //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Programme / Course</span>
// // //                                         <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{certificate.courseName}</p>
// // //                                     </div>
// // //                                 </div>

// // //                                 <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
// // //                                     <Calendar size={18} color="#002b49" style={{ marginTop: '2px' }} />
// // //                                     <div>
// // //                                         <span style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Date of Issue</span>
// // //                                         <p style={{ margin: 0, fontSize: '0.9rem', color: '#334155', fontWeight: 600 }}>{certificate.issueDate}</p>
// // //                                     </div>
// // //                                 </div>
// // //                             </div>

// // //                             {/* Blockchain Security Badge */}
// // //                             {certificate.blockchainStatus === 'anchored' && (
// // //                                 <div style={{
// // //                                     backgroundColor: '#eff6ff',
// // //                                     border: '1px solid #bfdbfe',
// // //                                     borderRadius: '10px',
// // //                                     padding: '10px 14px',
// // //                                     display: 'flex',
// // //                                     alignItems: 'center',
// // //                                     justifyContent: 'space-between'
// // //                                 }}>
// // //                                     <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
// // //                                         <ShieldCheck size={20} color="#2563eb" />
// // //                                         <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e40af' }}>Anchored to Ethereum Sepolia Blockchain</span>
// // //                                     </div>
// // //                                     {certificate.blockchainTxHash && (
// // //                                         <a
// // //                                             href={`https://sepolia.etherscan.io/tx/${certificate.blockchainTxHash}`}
// // //                                             target="_blank"
// // //                                             rel="noreferrer"
// // //                                             style={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 700, textDecoration: 'none' }}
// // //                                         >
// // //                                             View <ExternalLink size={12} />
// // //                                         </a>
// // //                                     )}
// // //                                 </div>
// // //                             )}

// // //                             {/* View Original PDF Button */}
// // //                             {certificate.pdfUrl && (
// // //                                 <button
// // //                                     onClick={() => window.open(certificate.pdfUrl, '_blank')}
// // //                                     style={{
// // //                                         padding: '0.75rem',
// // //                                         backgroundColor: '#002b49',
// // //                                         color: 'white',
// // //                                         border: 'none',
// // //                                         borderRadius: '8px',
// // //                                         fontWeight: 700,
// // //                                         fontSize: '0.85rem',
// // //                                         cursor: 'pointer',
// // //                                         display: 'flex',
// // //                                         alignItems: 'center',
// // //                                         justifyContent: 'center',
// // //                                         gap: '8px'
// // //                                     }}
// // //                                 >
// // //                                     <ExternalLink size={16} /> View Official PDF Document
// // //                                 </button>
// // //                             )}
// // //                         </div>
// // //                     ) : (
// // //                         /* INVALID / NOT FOUND STATE */
// // //                         <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
// // //                             <div style={{
// // //                                 width: '64px',
// // //                                 height: '64px',
// // //                                 borderRadius: '50%',
// // //                                 backgroundColor: '#fef2f2',
// // //                                 border: '1px solid #fecaca',
// // //                                 display: 'flex',
// // //                                 alignItems: 'center',
// // //                                 justifyContent: 'center',
// // //                                 margin: '0 auto'
// // //                             }}>
// // //                                 <ShieldAlert size={36} color="#ef4444" />
// // //                             </div>

// // //                             <div>
// // //                                 <h2 style={{ margin: 0, color: '#991b1b', fontSize: '1.2rem', fontWeight: 800 }}>
// // //                                     Credential Not Found
// // //                                 </h2>
// // //                                 <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: '0.85rem' }}>
// // //                                     {searchedCode ? `The code "${searchedCode}" was not recognized in our database.` : 'Please enter a valid credential verification code below.'}
// // //                                 </p>
// // //                             </div>

// // //                             {/* Manual Lookup Input */}
// // //                             <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: '8px', marginTop: '0.5rem' }}>
// // //                                 <input
// // //                                     type="text"
// // //                                     placeholder="Enter Certificate Code (e.g. CERT12345)"
// // //                                     value={inputCode}
// // //                                     onChange={e => setInputValue(e.target.value)}
// // //                                     style={{
// // //                                         flex: 1,
// // //                                         padding: '0.6rem 0.8rem',
// // //                                         borderRadius: '8px',
// // //                                         border: '1px solid #cbd5e1',
// // //                                         fontSize: '0.85rem',
// // //                                         outline: 'none'
// // //                                     }}
// // //                                 />
// // //                                 <button
// // //                                     type="submit"
// // //                                     style={{
// // //                                         padding: '0.6rem 1rem',
// // //                                         backgroundColor: '#002b49',
// // //                                         color: 'white',
// // //                                         border: 'none',
// // //                                         borderRadius: '8px',
// // //                                         fontWeight: 700,
// // //                                         fontSize: '0.85rem',
// // //                                         cursor: 'pointer',
// // //                                         display: 'flex',
// // //                                         alignItems: 'center',
// // //                                         gap: '6px'
// // //                                     }}
// // //                                 >
// // //                                     <Search size={14} /> Verify
// // //                                 </button>
// // //                             </form>
// // //                         </div>
// // //                     )}
// // //                 </div>

// // //                 {/* Footer */}
// // //                 <div style={{
// // //                     backgroundColor: '#f8fafc',
// // //                     borderTop: '1px solid #e2e8f0',
// // //                     padding: '0.85rem',
// // //                     textAlign: 'center',
// // //                     fontSize: '0.75rem',
// // //                     color: '#64748b'
// // //                 }}>
// // //                     <strong>mLab Secure Identity &amp; Credential Engine</strong>
// // //                 </div>
// // //             </div>
// // //         </div>
// // //     );
// // // };

// // // export default StudentVerification;



// // // // // src/pages/Public/StudentVerification.tsx

// // // // import React, { useEffect, useState } from 'react';
// // // // import { useParams } from 'react-router-dom';
// // // // import { ShieldCheck, ShieldAlert, Loader2, Calendar, MapPin, User, CheckCircle2, XCircle, AlertCircle, Fingerprint } from 'lucide-react';
// // // // import moment from 'moment';

// // // // import { getFunctions, httpsCallable } from 'firebase/functions';
// // // // import '../../../../components/admin/LearnerFormModal/LearnerFormModal.css';

// // // // export const StudentVerification: React.FC = () => {
// // // //     const { verificationCode } = useParams<{ verificationCode: string }>();
// // // //     const [status, setStatus] = useState<'loading' | 'valid' | 'invalid' | 'expired'>('loading');
// // // //     const [studentData, setStudentData] = useState<any>(null);

// // // //     useEffect(() => {
// // // //         const verifyStudent = async () => {
// // // //             if (!verificationCode) {
// // // //                 setStatus('invalid');
// // // //                 return;
// // // //             }

// // // //             try {
// // // //                 // CALL THE SECURE FIREBASE CLOUD FUNCTION
// // // //                 // This bypasses local security rules by asking the server to check the database for us
// // // //                 const functions = getFunctions();
// // // //                 const verifyStudentCard = httpsCallable(functions, 'verifyStudentCard');

// // // //                 const response = await verifyStudentCard({ code: verificationCode });
// // // //                 const result = response.data as any;

// // // //                 if (result.status === 'valid' || result.status === 'expired') {
// // // //                     setStudentData(result.studentData);
// // // //                     setStatus(result.status);
// // // //                 } else {
// // // //                     setStatus('invalid');
// // // //                 }

// // // //             } catch (error) {
// // // //                 console.error("Cloud Verification failed:", error);
// // // //                 setStatus('invalid');
// // // //             }
// // // //         };

// // // //         verifyStudent();
// // // //     }, [verificationCode]);

// // // //     // ─── LOADING STATE ───
// // // //     if (status === 'loading') {
// // // //         return (
// // // //             <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // //                 <div className="lfm-modal" style={{ maxWidth: '400px', margin: 'auto' }}>
// // // //                     <div className="lfm-header" style={{ justifyContent: 'center' }}>
// // // //                         <h2 className="lfm-header__title">System Query</h2>
// // // //                     </div>
// // // //                     <div className="lfm-body" style={{ alignItems: 'center', padding: '4rem 2rem', textAlign: 'center' }}>
// // // //                         <Loader2 size={48} className="lfm-spin" color="var(--mlab-blue)" />
// // // //                         <p style={{
// // // //                             marginTop: '1.5rem',
// // // //                             fontFamily: 'var(--font-heading)',
// // // //                             color: 'var(--mlab-blue)',
// // // //                             letterSpacing: '0.1em',
// // // //                             textTransform: 'uppercase',
// // // //                             fontWeight: 700
// // // //                         }}>
// // // //                             Authenticating Registry...
// // // //                         </p>
// // // //                     </div>
// // // //                 </div>
// // // //             </div>
// // // //         );
// // // //     }

// // // //     const isSuccess = status === 'valid';

// // // //     // ─── LOADED STATE ───
// // // //     return (
// // // //         <div className="lfm-overlay" style={{ position: 'fixed', inset: 0, zIndex: 99999 }}>
// // // //             <div className="lfm-modal" style={{ maxWidth: '480px', margin: 'auto' }}>

// // // //                 {/* STRICT HEADER */}
// // // //                 <div className="lfm-header" style={!isSuccess ? { borderBottomColor: 'var(--mlab-red)' } : {}}>
// // // //                     <h2 className="lfm-header__title">
// // // //                         {isSuccess ? <ShieldCheck size={18} color="var(--mlab-green)" /> : <ShieldAlert size={18} color="var(--mlab-red)" />}
// // // //                         Identity Verification
// // // //                     </h2>
// // // //                 </div>

// // // //                 <div className="lfm-body" style={{ padding: '2rem 1.5rem' }}>

// // // //                     {/* TRAFFIC LIGHT STATUS BANNER */}
// // // //                     <div style={{
// // // //                         display: 'flex',
// // // //                         flexDirection: 'column',
// // // //                         alignItems: 'center',
// // // //                         padding: '2rem 1.5rem',
// // // //                         background: isSuccess ? 'var(--mlab-green-bg)' : '#fef2f2',
// // // //                         border: `2px solid ${isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)'}`,
// // // //                         marginBottom: '1.5rem',
// // // //                         textAlign: 'center'
// // // //                     }}>
// // // //                         {isSuccess ? <CheckCircle2 size={56} color="var(--mlab-green-dark)" /> : <XCircle size={56} color="var(--mlab-red)" />}

// // // //                         <h1 style={{
// // // //                             fontFamily: 'var(--font-heading)',
// // // //                             fontSize: '1.8rem',
// // // //                             fontWeight: 700,
// // // //                             color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // //                             textTransform: 'uppercase',
// // // //                             letterSpacing: '0.05em',
// // // //                             margin: '1rem 0 0.5rem 0'
// // // //                         }}>
// // // //                             {isSuccess ? 'Verified Active' : status === 'expired' ? 'Card Expired' : 'Invalid Card'}
// // // //                         </h1>

// // // //                         <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.95rem', color: 'var(--mlab-blue)', margin: 0, lineHeight: 1.5 }}>
// // // //                             {isSuccess
// // // //                                 ? "This digital identity card is authentic and currently active in the mLab registry."
// // // //                                 : "This digital identity card is not recognized or has expired. Access should be denied."}
// // // //                         </p>
// // // //                     </div>

// // // //                     {/* STUDENT DEMOGRAPHICS PANEL */}
// // // //                     {studentData && status !== 'invalid' && (
// // // //                         <div className="lfm-demographics-panel" style={{
// // // //                             borderLeftColor: isSuccess ? 'var(--mlab-green)' : 'var(--mlab-red)',
// // // //                             padding: '1.5rem'
// // // //                         }}>
// // // //                             <div className="lfm-section-hdr" style={{ marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
// // // //                                 <User size={14} color="var(--mlab-blue)" /> Student Profile
// // // //                             </div>

// // // //                             {/* Name Block */}
// // // //                             <div style={{
// // // //                                 marginBottom: '1.5rem',
// // // //                                 padding: '1rem',
// // // //                                 background: 'var(--mlab-white)',
// // // //                                 border: '1px solid var(--mlab-border)'
// // // //                             }}>
// // // //                                 <div style={{
// // // //                                     fontFamily: 'var(--font-heading)',
// // // //                                     fontSize: '1.4rem',
// // // //                                     fontWeight: 700,
// // // //                                     color: 'var(--mlab-blue)',
// // // //                                     textTransform: 'uppercase',
// // // //                                     letterSpacing: '0.05em',
// // // //                                     marginBottom: '0.25rem'
// // // //                                 }}>
// // // //                                     {studentData.name}
// // // //                                 </div>
// // // //                                 <div style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', fontFamily: 'var(--font-body)', fontWeight: 600 }}>
// // // //                                     {studentData.cohort}
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* Form Grid for Details */}
// // // //                             <div className="lfm-grid">

// // // //                                 <div className="lfm-fg lfm-fg--full" style={{ marginBottom: '0.5rem' }}>
// // // //                                     <label>Generated Student Number</label>
// // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // //                                         <Fingerprint size={14} color="var(--mlab-blue)" />
// // // //                                         <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '1.1rem', letterSpacing: '0.1em', color: 'var(--mlab-blue)' }}>
// // // //                                             {studentData.studentNumber}
// // // //                                         </span>
// // // //                                     </div>
// // // //                                 </div>

// // // //                                 <div className="lfm-fg">
// // // //                                     <label>Delivery Site (Campus)</label>
// // // //                                     <div className="lfm-input" style={{ background: 'var(--mlab-white)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'default' }}>
// // // //                                         <MapPin size={14} color="var(--mlab-grey)" />
// // // //                                         <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
// // // //                                             {studentData.campus}
// // // //                                         </span>
// // // //                                     </div>
// // // //                                 </div>
// // // //                                 <div className="lfm-fg">
// // // //                                     <label>Valid Thru</label>
// // // //                                     <div className="lfm-input" style={{
// // // //                                         background: 'var(--mlab-white)',
// // // //                                         color: isSuccess ? 'var(--mlab-green-dark)' : 'var(--mlab-red)',
// // // //                                         fontWeight: 700,
// // // //                                         display: 'flex',
// // // //                                         alignItems: 'center',
// // // //                                         gap: '8px',
// // // //                                         cursor: 'default'
// // // //                                     }}>
// // // //                                         <Calendar size={14} /> {moment(studentData.validThru).format('MM/YY')}
// // // //                                     </div>
// // // //                                 </div>
// // // //                             </div>

// // // //                             {/* Error Banner for Expired */}
// // // //                             {!isSuccess && status === 'expired' && (
// // // //                                 <div className="lfm-error-banner" style={{ marginTop: '1.5rem' }}>
// // // //                                     <AlertCircle size={16} />
// // // //                                     <span>This student's training period has concluded.</span>
// // // //                                 </div>
// // // //                             )}
// // // //                         </div>
// // // //                     )}
// // // //                 </div>

// // // //                 {/* STRICT FOOTER */}
// // // //                 <div className="lfm-footer" style={{ justifyContent: 'center', padding: '1rem' }}>
// // // //                     <div style={{
// // // //                         fontFamily: 'var(--font-heading)',
// // // //                         fontSize: '0.75rem',
// // // //                         color: 'var(--mlab-grey)',
// // // //                         letterSpacing: '0.1em',
// // // //                         textTransform: 'uppercase',
// // // //                         display: 'flex',
// // // //                         alignItems: 'center',
// // // //                         gap: '6px'
// // // //                     }}>
// // // //                         <ShieldCheck size={14} color="var(--mlab-green)" />
// // // //                         mLab Secure Identity Engine
// // // //                     </div>
// // // //                 </div>

// // // //             </div>
// // // //         </div>
// // // //     );
// // // // };
