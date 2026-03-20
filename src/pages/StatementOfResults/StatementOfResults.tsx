// src/pages/StatementOfResults/StatementOfResults.tsx

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useStore } from '../../store/useStore';
import { QRCodeSVG } from 'qrcode.react';
import { verifyBlockchainCertificate, issueBlockchainCertificate } from '../utils/lib/web3/blockchainService';
import { uploadToIPFS } from '../utils/lib/pinata';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './StatementOfResults.css';
import type { SoRModule } from '../../types/learner.types';
import { generateSorId } from '../utils/validation';


import mLabLogo from '../../assets/logo/mlab_logo.png';
import zackSignature from '../../assets/Signatue_Zack_.png';
import Loader from '../../components/common/Loader/Loader';

// --- INTERFACES ---
interface LearnerData {
    id: string;
    learnerId?: string;
    fullName: string;
    idNumber: string;
    dateOfBirth?: string;
    isOffline: boolean;
    qualification: {
        name: string;
        saqaId: string;
        credits: string | number;
        nqfLevel: string | number;
        dateAssessed: string;
    };
    knowledgeModules: SoRModule[];
    practicalModules: SoRModule[];
    workExperienceModules: SoRModule[];
    eisaAdmission: boolean;
    verificationCode: string;
    issueDate: string;
    nextEISADate: string;
    ipfsHash?: string;
    isBlockchainVerified?: boolean;
    blockchainFingerprint?: string;
    issuedBy: {
        name: string;
        title: string;
    };
}

// --- HELPERS ---
const mapStatus = (status?: string, marks?: number, totalMarks?: number) => {
    if (!status) return "In Progress";
    const s = status.toLowerCase().trim();
    if (s === "competent" || s === "pass" || s === "c") return "Competent";
    if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") return "Not Yet Competent";
    if (s === "pending" || s === "not started" || s === "in progress" || s === "") return "In Progress";
    if (s === "graded" && marks !== undefined && totalMarks !== undefined) {
        return marks >= (totalMarks / 2) ? "Competent" : "Not Yet Competent";
    }
    return "In Progress";
};

const getStatusClass = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'competent') return 'status-competent';
    if (statusLower === 'not yet competent') return 'status-not-competent';
    return 'status-pending';
};

const formatDateSA = (dateInput: string | Date | undefined | null): string => {
    if (!dateInput) {
        const d = new Date();
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        return `${day}-${month}-${d.getFullYear()}`;
    }

    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput).trim();

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
};

// --- COMPONENT ---
const StatementOfResults: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const currentUser = useStore((state) => state.user);
    const { learners } = useStore();

    const documentRef = useRef<HTMLDivElement>(null);

    const [learnerData, setLearnerData] = useState<LearnerData | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'authentic' | 'failed' | 'revoked'>('idle');
    const [isPublicView, setIsPublicView] = useState(false);

    const [mintingStatus, setMintingStatus] = useState<'idle' | 'generating_pdf' | 'uploading_ipfs' | 'signing_wallet' | 'success' | 'error'>('idle');
    const [mintingError, setMintingError] = useState('');
    const [showMetaMaskPrompt, setShowMetaMaskPrompt] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadData = async () => {
            if (!id) return;
            setIsLoading(true);

            try {
                let data: any = null;
                let docId = "";

                const storeLearner = learners.find(l => l.id === id || l.verificationCode === id);

                if (storeLearner) {
                    data = storeLearner;
                    docId = storeLearner.id;
                } else {
                    let enrolRef = doc(db, "enrollments", id);
                    let enrolSnap = await getDoc(enrolRef);

                    if (enrolSnap.exists()) {
                        data = enrolSnap.data();
                        docId = enrolSnap.id;
                    } else {
                        const q = query(collection(db, "enrollments"), where("verificationCode", "==", id));
                        const qSnap = await getDocs(q);
                        if (!qSnap.empty) {
                            data = qSnap.docs[0].data();
                            docId = qSnap.docs[0].id;
                        }
                    }

                    if (data && data.learnerId) {
                        const profileSnap = await getDoc(doc(db, "learners", data.learnerId));
                        if (profileSnap.exists()) {
                            data = { ...profileSnap.data(), ...data };
                        }
                    } else if (!data) {
                        const legacyRef = doc(db, "learners", id);
                        const legacySnap = await getDoc(legacyRef);
                        if (legacySnap.exists()) {
                            data = legacySnap.data();
                            docId = legacySnap.id;
                        } else {
                            const lq = query(collection(db, "learners"), where("verificationCode", "==", id));
                            const lqSnap = await getDocs(lq);
                            if (!lqSnap.empty) {
                                data = lqSnap.docs[0].data();
                                docId = lqSnap.docs[0].id;
                            }
                        }
                    }
                }

                if (data && isMounted) {
                    setIsPublicView(data.verificationCode === id);

                    const finalIssueDate = data.issueDate || formatDateSA(null);
                    const finalFullName = data.fullName || "Unknown Learner";

                    setLearnerData({
                        id: docId,
                        learnerId: data.learnerId || docId,
                        fullName: finalFullName,
                        idNumber: data.idNumber || "N/A",
                        dateOfBirth: data.dateOfBirth || "N/A",
                        isOffline: data.isOffline || false,
                        qualification: {
                            name: data.qualification?.name || "Occupational Certificate",
                            saqaId: data.qualification?.saqaId || "N/A",
                            credits: (data.qualification?.credits || 0).toString(),
                            nqfLevel: `Level ${data.qualification?.nqfLevel || 5}`,
                            dateAssessed: data.qualification?.dateAssessed || finalIssueDate
                        },
                        knowledgeModules: (data.knowledgeModules || []).map((m: any) => ({
                            ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
                        })),
                        practicalModules: (data.practicalModules || []).map((m: any) => ({
                            ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
                        })),
                        workExperienceModules: (data.workExperienceModules || []).map((m: any) => ({
                            ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
                        })),
                        eisaAdmission: data.eisaAdmission || false,
                        verificationCode: data.verificationCode || generateSorId(finalFullName, finalIssueDate),
                        issueDate: finalIssueDate,
                        nextEISADate: data.nextEisaDate || "TBA",
                        ipfsHash: data.ipfsHash || "",
                        isBlockchainVerified: data.isBlockchainVerified || false,
                        blockchainFingerprint: data.blockchainFingerprint || "",
                        issuedBy: { name: "Zakhele Tinga", title: "Academic Manager" }
                    });
                } else {
                    if (isMounted) setLearnerData(null);
                }
            } catch (error) {
                console.error("Data Load Error:", error);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadData();
        return () => { isMounted = false; };
    }, [id, learners]);

    useEffect(() => {
        const verifyWeb3 = async () => {
            if (!learnerData || !learnerData.isBlockchainVerified) {
                setVerificationStatus('idle');
                return;
            }

            setVerificationStatus('verifying');
            try {
                const result = await verifyBlockchainCertificate(learnerData.verificationCode, {
                    learnerName: learnerData.fullName,
                    idNumber: learnerData.idNumber,
                    qualification: learnerData.qualification.name,
                    issueDate: learnerData.issueDate,
                    eisaStatus: learnerData.eisaAdmission ? "YES" : "NO",
                    ipfsHash: learnerData.ipfsHash || ""
                });

                if (result.isRevoked) setVerificationStatus('revoked');
                else if (result.isAuthentic) setVerificationStatus('authentic');
                else setVerificationStatus('failed');
            } catch (error) {
                console.error("Web3 Verification failed:", error);
                setVerificationStatus('failed');
            }
        };

        verifyWeb3();
    }, [learnerData]);

    const handleIssueToBlockchain = async () => {
        if (!learnerData || !learnerData.id || !documentRef.current) return;

        try {
            setMintingError('');
            let currentIpfsHash = learnerData.ipfsHash;

            if (!currentIpfsHash) {
                setMintingStatus('generating_pdf');
                const canvas = await html2canvas(documentRef.current, {
                    scale: 1.5,
                    useCORS: true,
                    logging: false,
                    allowTaint: true
                });

                // Create multi-page PDF if content exceeds one page
                const pdf = new jsPDF('p', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = pdf.internal.pageSize.getHeight();

                const imgData = canvas.toDataURL('image/jpeg', 0.75);
                const imgProps = pdf.getImageProperties(imgData);
                const imgWidth = pdfWidth;
                const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

                let heightLeft = imgHeight;
                let position = 0;

                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                heightLeft -= pdfHeight;

                while (heightLeft > 0) {
                    position = heightLeft - imgHeight; // top of next page (negative)
                    pdf.addPage();
                    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
                    heightLeft -= pdfHeight;
                }

                const pdfBlob = pdf.output('blob');
                const pdfFile = new File([pdfBlob], `${learnerData.verificationCode}.pdf`, { type: 'application/pdf' });

                setMintingStatus('uploading_ipfs');
                currentIpfsHash = await uploadToIPFS(pdfFile);

                setLearnerData(prev => prev ? { ...prev, ipfsHash: currentIpfsHash } : null);
                try { await updateDoc(doc(db, "enrollments", learnerData.id), { ipfsHash: currentIpfsHash }); } catch (fbErr) { console.warn(fbErr); }
            }

            setMintingStatus('signing_wallet');
            let fingerprint;
            try {
                fingerprint = await issueBlockchainCertificate(
                    learnerData.verificationCode, learnerData.fullName, learnerData.idNumber,
                    learnerData.qualification.name, learnerData.issueDate,
                    learnerData.eisaAdmission ? "YES" : "NO", currentIpfsHash
                );
            } catch (blockchainError: any) {
                if (blockchainError.message?.includes("already exists") || blockchainError.data?.message?.includes("already exists")) {
                    fingerprint = "ALREADY_MINTED";
                } else { throw blockchainError; }
            }

            const finalUpdates: any = {
                ipfsHash: currentIpfsHash,
                issueDate: learnerData.issueDate,
                "qualification.dateAssessed": learnerData.issueDate,
                isBlockchainVerified: true,
                blockchainFingerprint: fingerprint,
                blockchainTimestamp: new Date().toISOString()
            };

            if (learnerData.isOffline) {
                finalUpdates.knowledgeModules = learnerData.knowledgeModules.map(m => ({ ...m, dateAssessed: learnerData.issueDate }));
                finalUpdates.practicalModules = learnerData.practicalModules.map(m => ({ ...m, dateAssessed: learnerData.issueDate }));
                finalUpdates.workExperienceModules = learnerData.workExperienceModules.map(m => ({ ...m, dateSignedOff: learnerData.issueDate }));
            }

            await updateDoc(doc(db, "enrollments", learnerData.id), finalUpdates);

            if (learnerData.learnerId) {
                await updateDoc(doc(db, "learners", learnerData.learnerId), {
                    ipfsHash: currentIpfsHash, issueDate: learnerData.issueDate,
                    isBlockchainVerified: true, blockchainFingerprint: fingerprint, blockchainTimestamp: finalUpdates.blockchainTimestamp
                });
            }

            setLearnerData(prev => prev ? { ...prev, ...finalUpdates, qualification: { ...prev.qualification, dateAssessed: learnerData.issueDate } } : null);
            setMintingStatus('success');
            setVerificationStatus('authentic');

        } catch (error: any) {
            console.error("Critical Minting Error:", error);
            if (error.message && error.message.toLowerCase().includes('metamask')) {
                setShowMetaMaskPrompt(true);
                setMintingStatus('idle');
                return;
            }
            setMintingError(error.shortMessage || error.message || "Minting failed.");
            setMintingStatus('error');
        }
    };

    const calculateTotalCredits = (modules: SoRModule[]): number => {
        return modules.reduce((total, module) => total + (module.credits || 0), 0);
    };

    if (isLoading) {
        return (
            // <div className="sor-loading" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
            //     <div className="sor-spinner" />
            //     <p style={{ color: '#073f4e' }}>Loading Statement of Results...</p>
            // </div>
            <Loader message="Loading Statement of Results..." />
        );
    }

    if (!learnerData) {
        return (
            <div className="sor-not-found">
                <div className="sor-error-icon">⚠️</div>
                <h2>Record Not Found</h2>
                <p>We couldn't locate this Statement of Results. Ensure the URL is correct.</p>
                <button className="sor-btn" onClick={() => navigate(-1)}>Return to Dashboard</button>
            </div>
        );
    }

    const rawBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    const cleanBaseUrl = rawBaseUrl.replace(/\/$/, "");
    const publicVerificationUrl = `${cleanBaseUrl}/sor/${learnerData.verificationCode}`;

    if (isPublicView) {
        return (
            <div className="public-verify-wrap">
                <div className={`public-verify-card ${verificationStatus === 'authentic' ? 'authentic' : verificationStatus === 'failed' || verificationStatus === 'revoked' ? 'failed' : ''}`}>
                    {verificationStatus === 'verifying' && (
                        <div className="verify-state">
                            <div className="sor-spinner" style={{ borderColor: '#e0f2fe', borderTopColor: '#0ea5e9' }} />
                            <h1>Verifying...</h1>
                            <p>Connecting to Web3 Registry</p>
                        </div>
                    )}
                    {verificationStatus === 'authentic' && (
                        <div className="verify-state">
                            <div className="verify-icon success">✓</div>
                            <h1>Credential Verified</h1>
                            <p>Issued securely by mLab Southern Africa</p>
                            <div className="verify-details">
                                <div className="detail-row">
                                    <label>Learner Name</label>
                                    <span>{learnerData.fullName}</span>
                                </div>
                                <div className="detail-grid">
                                    <div className="detail-row">
                                        <label>ID Number</label>
                                        <span>{learnerData.idNumber.substring(0, 6)}*******</span>
                                    </div>
                                    <div className="detail-row">
                                        <label>EISA Admission</label>
                                        <span className={learnerData.eisaAdmission ? 'text-green' : 'text-red'}>
                                            {learnerData.eisaAdmission ? 'YES' : 'NO'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button className="sor-btn-secondary" onClick={() => setIsPublicView(false)}>View Official Document</button>
                        </div>
                    )}
                    {(verificationStatus === 'failed' || verificationStatus === 'revoked') && (
                        <div className="verify-state">
                            <div className="verify-icon error">✕</div>
                            <h1>{verificationStatus === 'revoked' ? 'Credential Withdrawn' : 'Invalid Credential'}</h1>
                            <p className="error-text">
                                {verificationStatus === 'revoked'
                                    ? 'This document has been officially withdrawn and is no longer valid.'
                                    : 'This document could not be matched against our official digital registry. It may be altered.'}
                            </p>
                            <div className="verify-notice">
                                Please contact mLab Academic Department to verify this learner's status.
                            </div>
                        </div>
                    )}
                    {verificationStatus === 'idle' && (
                        <div className="verify-state">
                            <div className="verify-icon pending">⏳</div>
                            <h1>Verification Pending</h1>
                            <p>This document is awaiting final digital certification.</p>
                            <button className="sor-btn-secondary" onClick={() => setIsPublicView(false)}>View Provisional Document</button>
                        </div>
                    )}
                    <div className="verify-footer">
                        <p className="verify-id">ID: {learnerData.verificationCode}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="sor-layout">

            {/* <div className="sor-wrapper" style={{ position: 'absolute', top: 0, right: 0, left: 0, bottom: 0 }}> */}
            <div className="sor-wrapper">

                {/* 🚀 THE VERIFICATION CARD (Placed back where it belongs, above the document) */}
                <div className="no-print status-banner-container">
                    {verificationStatus === 'verifying' && (
                        <div className="status-banner banner-info">
                            <div className="sor-spinner-mini" />
                            <span className="banner-text">Verifying Web3 Authenticity...</span>
                        </div>
                    )}
                    {verificationStatus === 'authentic' && (
                        <div className="status-banner banner-success">
                            <span className="banner-icon">✅</span>
                            <div>
                                <p className="banner-title">Officially Verified</p>
                                <p className="banner-sub">This record is secured by the blockchain and matches the official registry.</p>
                            </div>
                        </div>
                    )}
                    {verificationStatus === 'idle' && !learnerData.ipfsHash && (
                        <div className="status-banner banner-warning">
                            <span className="banner-icon">⏳</span>
                            <div>
                                <p className="banner-title">Draft Record</p>
                                <p className="banner-sub">This record has not yet been minted to the blockchain.</p>
                            </div>
                        </div>
                    )}
                    {mintingStatus === 'error' && (
                        <div className="status-banner banner-error">
                            <span className="banner-icon">⚠️</span>
                            <div>
                                <p className="banner-title">Minting Failed</p>
                                <p className="banner-sub">{mintingError}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* 🚀 A4 DOCUMENT CONTAINER */}
                <div className="container" ref={documentRef}>
                    <div className="accent-bar"></div>

                    <div className="letterhead">
                        <div className="letterhead-content">
                            <div className="provider-info">
                                <div className="logo-container">
                                    <img height={70} src={mLabLogo} alt="mLab Logo" />
                                </div>
                                <div className="provider-details">
                                    <div>13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345</div>
                                    <div>Registration No: SDP070824115131</div>
                                </div>
                            </div>
                            <div className="contact-info">
                                <div><strong>Tel:</strong> +27 012 844 0240</div>
                                <div><strong>Email:</strong> codetribe@mlab.co.za</div>
                                <div><strong>Web:</strong> www.mlab.co.za</div>
                            </div>
                        </div>
                    </div>

                    <div className="document-header">
                        <div className="document-title">Statement of Results</div>
                        <div className="document-subtitle">Not an Occupational Certificate</div>
                    </div>

                    <div className="content">
                        <div className="qualification-box">
                            <div className="qualification-title">
                                {learnerData.qualification.name.toLowerCase().includes('certificate')
                                    ? learnerData.qualification.name
                                    : `Occupational Certificate: ${learnerData.qualification.name}`}
                            </div>
                            <div className="qualification-meta">
                                <div className="meta-item"><span className="meta-label">SAQA ID</span><span className="meta-value">{learnerData.qualification.saqaId}</span></div>
                                <div className="meta-item"><span className="meta-label">Credits</span><span className="meta-value">{learnerData.qualification.credits}</span></div>
                                <div className="meta-item"><span className="meta-label">NQF Level</span><span className="meta-value">{learnerData.qualification.nqfLevel}</span></div>
                                <div className="meta-item"><span className="meta-label">Date Assessed</span><span className="meta-value">{learnerData.qualification.dateAssessed}</span></div>
                            </div>
                        </div>

                        <div className="learner-section">
                            <h2 className="section-title">Learner Information</h2>
                            <div className="learner-info">
                                <div className="info-field"><span className="field-label">Full Name</span><span className="field-value">{learnerData.fullName}</span></div>
                                <div className="info-field"><span className="field-label">ID Number</span><span className="field-value">{learnerData.idNumber}</span></div>
                                <div className="info-field"><span className="field-label">Date of Birth</span><span className="field-value">{learnerData.dateOfBirth}</span></div>
                            </div>
                        </div>

                        <div className="assessment-wrapper">
                            {learnerData.knowledgeModules.length > 0 && (
                                <AssessmentCategory title="Knowledge Modules" totalCredits={calculateTotalCredits(learnerData.knowledgeModules)} modules={learnerData.knowledgeModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
                            )}

                            {learnerData.practicalModules.length > 0 && (
                                <AssessmentCategory title="Practical Skills Modules" totalCredits={calculateTotalCredits(learnerData.practicalModules)} modules={learnerData.practicalModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
                            )}

                            {learnerData.workExperienceModules.length > 0 && (
                                <AssessmentCategory title="Work Experience Modules" totalCredits={calculateTotalCredits(learnerData.workExperienceModules)} modules={learnerData.workExperienceModules} dateLabel="Date Signed Off" getStatusClass={getStatusClass} />
                            )}
                        </div>

                        <div className="summary-box page-break-avoid">
                            <div className="summary-text">Learner has gained admission to the External Integrated Summative Assessment (EISA)</div>
                            <div className="eisa-status">
                                <span className="eisa-label">Status:</span>
                                <span className={`eisa-badge ${learnerData.eisaAdmission ? '' : 'no'}`}>
                                    {learnerData.eisaAdmission ? 'YES' : 'NO'}
                                </span>
                            </div>
                        </div>

                        <div className="important-notice page-break-avoid">
                            <div className="notice-title">⚠️ Important Notice</div>
                            <div className="notice-text">
                                <p><strong>This Statement of Results is not an Occupational Certificate.</strong></p>
                                <p>The learner has complied with the requirements of the Knowledge, Practical and Workplace Components of the qualification. The Quality Council for Trades and Occupations (QCTO) may issue the Occupational Certificate after the candidate has successfully completed the External Integrated Summative Assessment (EISA) requirements.</p>
                                <p><strong>This SoR is valid for a period of two years from date of issue.</strong></p>
                                <p><strong>Date of Next EISA:</strong> {learnerData.nextEISADate}</p>
                                <p style={{ fontStyle: 'italic' }}>Learners must bring this SoR together with their IDs when writing the EISA.</p>
                            </div>
                        </div>

                        <div className="attachments-box page-break-avoid">
                            <div className="attachments-title">Required Attachments</div>
                            <ul className="attachments-list">
                                <li>Learner's ID Document</li>
                                {learnerData.isOffline ? (
                                    <li>Signed Portfolio of Evidence (Physical/External Copy)</li>
                                ) : (
                                    <li>Proof of passing Mathematics and English (for Level 3 & 4 qualifications)</li>
                                )}
                            </ul>
                        </div>

                        <div className="footer-section page-break-avoid">
                            <div className="signature-area">
                                <div className="signature-block">
                                    <div className="signature-image-container">
                                        <img src={zackSignature} height={200} alt="Authorized Signature" />
                                    </div>
                                    <div className="signature-line"></div>
                                    <div className="signature-name">{learnerData.issuedBy.name}</div>
                                    <div className="signature-title">{learnerData.issuedBy.title}</div>
                                    <div className="signature-title" style={{ marginTop: '0.5rem', fontWeight: 600 }}>Date Issued: {learnerData.issueDate}</div>
                                </div>

                                <div className="qr-verification">
                                    <QRCodeSVG value={publicVerificationUrl} size={100} level={"H"} includeMargin={false} />
                                    <div className="qr-label">Scan to Verify</div>
                                    <div className="verification-code">{learnerData.verificationCode}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 🚀 FLOATING PRINT & MINT CONTROLS (Placed back where they were) */}
            <div className="print-controls no-print">
                <button onClick={() => navigate(-1)} className="control-btn control-btn-back">
                    Back
                </button>
                <button onClick={() => window.print()} className="control-btn control-btn-print">
                    🖨️ Print PDF
                </button>

                {currentUser?.role === 'admin' &&
                    !learnerData.isBlockchainVerified &&
                    mintingStatus !== 'success' && (
                        <button
                            onClick={handleIssueToBlockchain}
                            disabled={mintingStatus !== 'idle' && mintingStatus !== 'error'}
                            className={`control-btn control-btn-mint ${mintingStatus !== 'idle' && mintingStatus !== 'error' ? 'disabled' : ''}`}
                        >
                            {mintingStatus === 'idle' && (
                                learnerData.ipfsHash
                                    ? "🔗 Finalize Securement"
                                    : "🚀 Issue to Blockchain"
                            )}
                            {mintingStatus === 'generating_pdf' && "📄 Generating..."}
                            {mintingStatus === 'uploading_ipfs' && "☁️ Uploading to IPFS..."}
                            {mintingStatus === 'signing_wallet' && "🦊 Sign in MetaMask..."}
                            {mintingStatus === 'error' && "⚠️ Retry Issuance"}
                        </button>
                    )}

                {learnerData.isBlockchainVerified && (
                    <div className="control-badge-verified">
                        ✅ Secured on-chain
                    </div>
                )}
            </div>

            {/* METAMASK INSTALLATION MODAL */}
            {showMetaMaskPrompt && (
                <div className="mm-modal-overlay">
                    <div className="mm-modal">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" />
                        <h2>MetaMask Required</h2>
                        <p>To issue secure, tamper-proof credentials to the blockchain, you need to install the MetaMask browser extension.</p>
                        <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="mm-btn">Download MetaMask</a>
                        <button onClick={() => setShowMetaMaskPrompt(false)} className="mm-btn-cancel">Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
};

const AssessmentCategory: React.FC<{ title: string, totalCredits: number, modules: SoRModule[], dateLabel: string, getStatusClass: (s: string) => string }> = ({ title, totalCredits, modules, dateLabel, getStatusClass }) => {
    if (modules.length === 0) return null;
    return (
        <div className="assessment-category page-break-avoid">
            <div className="category-header">
                <span>{title}</span>
                <span className="category-badge">{totalCredits} Credits</span>
            </div>
            <table className="assessment-table">
                <thead>
                    <tr>
                        <th style={{ width: '50%' }}>Module Name</th>
                        <th>Credits</th>
                        <th>{dateLabel}</th>
                        <th>Achievement</th>
                    </tr>
                </thead>
                <tbody>
                    {modules.map((module, index) => (
                        <tr key={index}>
                            <td className="module-name">{module.name}</td>
                            <td><span className="credits-badge">{module.credits}</span></td>
                            <td style={{ color: '#334155', fontWeight: 500 }}>{'dateAssessed' in module ? module.dateAssessed : module.dateSignedOff}</td>
                            <td className="achievement-status">
                                <span className={`status-badge ${getStatusClass(module.status)}`}>{module.status}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default StatementOfResults;



// import React, { useEffect, useState, useRef } from 'react';
// import { useParams, useNavigate } from 'react-router-dom';
// import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import { useStore } from '../../store/useStore';
// import { QRCodeSVG } from 'qrcode.react';
// import { verifyBlockchainCertificate, issueBlockchainCertificate } from '../utils/lib/web3/blockchainService';
// import { uploadToIPFS } from '../utils/lib/pinata';
// import html2canvas from 'html2canvas';
// import jsPDF from 'jspdf';
// import './StatementOfResults.css';
// import type { SoRModule } from '../../types/learner.types'; // Assuming this exists
// import { generateSorId } from '../utils/validation'; // 🚀 ADDED IMPORT FOR GENERATOR

// // --- INTERFACES ---
// interface LearnerData {
//     id: string;
//     learnerId?: string;
//     fullName: string;
//     idNumber: string;
//     dateOfBirth?: string;
//     isOffline: boolean;
//     qualification: {
//         name: string;
//         saqaId: string;
//         credits: string | number;
//         nqfLevel: string | number;
//         dateAssessed: string;
//     };
//     knowledgeModules: SoRModule[];
//     practicalModules: SoRModule[];
//     workExperienceModules: SoRModule[];
//     eisaAdmission: boolean;
//     verificationCode: string;
//     issueDate: string;
//     nextEISADate: string;
//     ipfsHash?: string;
//     isBlockchainVerified?: boolean;
//     blockchainFingerprint?: string;
//     issuedBy: {
//         name: string;
//         title: string;
//     };
// }

// // --- HELPERS ---
// const mapStatus = (status?: string, marks?: number, totalMarks?: number) => {
//     if (!status) return "In Progress";
//     const s = status.toLowerCase().trim();
//     if (s === "competent" || s === "pass" || s === "c") return "Competent";
//     if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") return "Not Yet Competent";
//     if (s === "pending" || s === "not started" || s === "in progress" || s === "") return "In Progress";
//     if (s === "graded" && marks !== undefined && totalMarks !== undefined) {
//         return marks >= (totalMarks / 2) ? "Competent" : "Not Yet Competent";
//     }
//     return "In Progress";
// };

// const getStatusClass = (status: string): string => {
//     const statusLower = status.toLowerCase();
//     if (statusLower === 'competent') return 'status-competent';
//     if (statusLower === 'not yet competent') return 'status-not-competent';
//     return 'status-pending';
// };

// // --- COMPONENT ---
// const StatementOfResults: React.FC = () => {
//     const { id } = useParams<{ id: string }>();
//     const navigate = useNavigate();

//     const currentUser = useStore((state) => state.user);
//     const { learners } = useStore();

//     const documentRef = useRef<HTMLDivElement>(null);

//     const [learnerData, setLearnerData] = useState<LearnerData | null>(null);
//     const [isLoading, setIsLoading] = useState(true);

//     const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'authentic' | 'failed' | 'revoked'>('idle');
//     const [isPublicView, setIsPublicView] = useState(false);

//     const [mintingStatus, setMintingStatus] = useState<'idle' | 'generating_pdf' | 'uploading_ipfs' | 'signing_wallet' | 'success' | 'error'>('idle');
//     const [mintingError, setMintingError] = useState('');

//     const [showMetaMaskPrompt, setShowMetaMaskPrompt] = useState(false);

//     // 🚀 EFFECT 1: ADVANCED RELATIONAL FETCHING
//     useEffect(() => {
//         let isMounted = true;

//         const loadData = async () => {
//             if (!id) return;
//             setIsLoading(true);

//             try {
//                 let data: any = null;
//                 let docId = "";

//                 // 1. FAST PATH: Check Global Store First
//                 const storeLearner = learners.find(l => l.id === id || l.verificationCode === id);

//                 if (storeLearner) {
//                     data = storeLearner;
//                     docId = storeLearner.id;
//                 }
//                 // 2. FALLBACK PATH: Direct Firebase query
//                 else {
//                     let enrolRef = doc(db, "enrollments", id);
//                     let enrolSnap = await getDoc(enrolRef);

//                     if (enrolSnap.exists()) {
//                         data = enrolSnap.data();
//                         docId = enrolSnap.id;
//                     } else {
//                         const q = query(collection(db, "enrollments"), where("verificationCode", "==", id));
//                         const qSnap = await getDocs(q);
//                         if (!qSnap.empty) {
//                             data = qSnap.docs[0].data();
//                             docId = qSnap.docs[0].id;
//                         }
//                     }

//                     if (data && data.learnerId) {
//                         const profileSnap = await getDoc(doc(db, "learners", data.learnerId));
//                         if (profileSnap.exists()) {
//                             data = { ...profileSnap.data(), ...data };
//                         }
//                     }
//                     else if (!data) {
//                         const legacyRef = doc(db, "learners", id);
//                         const legacySnap = await getDoc(legacyRef);
//                         if (legacySnap.exists()) {
//                             data = legacySnap.data();
//                             docId = legacySnap.id;
//                         } else {
//                             const lq = query(collection(db, "learners"), where("verificationCode", "==", id));
//                             const lqSnap = await getDocs(lq);
//                             if (!lqSnap.empty) {
//                                 data = lqSnap.docs[0].data();
//                                 docId = lqSnap.docs[0].id;
//                             }
//                         }
//                     }
//                 }

//                 if (data && isMounted) {
//                     setIsPublicView(data.verificationCode === id);

//                     const finalIssueDate = data.issueDate || new Date().toISOString().split('T')[0];
//                     const finalFullName = data.fullName || "Unknown Learner";

//                     setLearnerData({
//                         id: docId,
//                         learnerId: data.learnerId || docId,
//                         fullName: finalFullName,
//                         idNumber: data.idNumber || "N/A",
//                         dateOfBirth: data.dateOfBirth || "N/A",
//                         isOffline: data.isOffline || false,
//                         qualification: {
//                             name: data.qualification?.name || "Occupational Certificate",
//                             saqaId: data.qualification?.saqaId || "N/A",
//                             credits: (data.qualification?.credits || 0).toString(),
//                             nqfLevel: `Level ${data.qualification?.nqfLevel || 5}`,
//                             // 🚀 SYNC DATE ASSESSED WITH ISSUE DATE
//                             dateAssessed: data.qualification?.dateAssessed || finalIssueDate
//                         },
//                         knowledgeModules: (data.knowledgeModules || []).map((m: any) => ({
//                             ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
//                         })),
//                         practicalModules: (data.practicalModules || []).map((m: any) => ({
//                             ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
//                         })),
//                         workExperienceModules: (data.workExperienceModules || []).map((m: any) => ({
//                             ...m, status: mapStatus(m.status, m.marks, m.totalMarks)
//                         })),
//                         eisaAdmission: data.eisaAdmission || false,
//                         // 🚀 USE PROPER ID GENERATOR FALLBACK INSTEAD OF MATH.RANDOM
//                         verificationCode: data.verificationCode || generateSorId(finalFullName, finalIssueDate),
//                         issueDate: finalIssueDate,
//                         nextEISADate: data.nextEisaDate || "TBA",
//                         ipfsHash: data.ipfsHash || "",
//                         isBlockchainVerified: data.isBlockchainVerified || false,
//                         blockchainFingerprint: data.blockchainFingerprint || "",
//                         issuedBy: { name: "Zakhele Tinga", title: "Academic Manager" }
//                     });
//                 } else {
//                     if (isMounted) setLearnerData(null);
//                 }
//             } catch (error) {
//                 console.error("Data Load Error:", error);
//             } finally {
//                 if (isMounted) setIsLoading(false);
//             }
//         };

//         loadData();
//         return () => { isMounted = false; };
//     }, [id, learners]);

//     // 🚀 EFFECT 2: WEB3 AUTHENTICITY CHECK
//     useEffect(() => {
//         const verifyWeb3 = async () => {
//             if (!learnerData || !learnerData.isBlockchainVerified) {
//                 setVerificationStatus('idle');
//                 return;
//             }

//             setVerificationStatus('verifying');
//             try {
//                 const result = await verifyBlockchainCertificate(learnerData.verificationCode, {
//                     learnerName: learnerData.fullName,
//                     idNumber: learnerData.idNumber,
//                     qualification: learnerData.qualification.name,
//                     issueDate: learnerData.issueDate,
//                     eisaStatus: learnerData.eisaAdmission ? "YES" : "NO",
//                     ipfsHash: learnerData.ipfsHash || ""
//                 });

//                 if (result.isRevoked) setVerificationStatus('revoked');
//                 else if (result.isAuthentic) setVerificationStatus('authentic');
//                 else setVerificationStatus('failed');
//             } catch (error) {
//                 console.error("Web3 Verification failed:", error);
//                 setVerificationStatus('failed');
//             }
//         };

//         verifyWeb3();
//     }, [learnerData]);

//     // 🚀 FULLY OPTIMIZED BLOCKCHAIN ISSUANCE FLOW
//     const handleIssueToBlockchain = async () => {
//         if (!learnerData || !learnerData.id || !documentRef.current) return;

//         try {
//             setMintingError('');
//             let currentIpfsHash = learnerData.ipfsHash;

//             // 1. GENERATE & UPLOAD PDF TO IPFS (If not already done)
//             if (!currentIpfsHash) {
//                 setMintingStatus('generating_pdf');
//                 const canvas = await html2canvas(documentRef.current, { scale: 2 });
//                 const pdf = new jsPDF('p', 'mm', 'a4');
//                 const pdfWidth = pdf.internal.pageSize.getWidth();
//                 const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

//                 pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pdfWidth, pdfHeight);

//                 const pdfBlob = pdf.output('blob');
//                 const pdfFile = new File(
//                     [pdfBlob],
//                     `${learnerData.verificationCode}.pdf`,
//                     { type: 'application/pdf' }
//                 );

//                 setMintingStatus('uploading_ipfs');
//                 currentIpfsHash = await uploadToIPFS(pdfFile);

//                 // Pre-save IPFS hash to local state and Firebase
//                 setLearnerData(prev => prev ? { ...prev, ipfsHash: currentIpfsHash } : null);

//                 try {
//                     await updateDoc(doc(db, "enrollments", learnerData.id), { ipfsHash: currentIpfsHash });
//                 } catch (fbErr) {
//                     console.warn("Firebase update delayed, proceeding to blockchain...", fbErr);
//                 }
//             }

//             // 2. MINT TO BLOCKCHAIN
//             setMintingStatus('signing_wallet');

//             let fingerprint;
//             try {
//                 // We use learnerData.issueDate here (which was established when the page loaded)
//                 fingerprint = await issueBlockchainCertificate(
//                     learnerData.verificationCode,
//                     learnerData.fullName,
//                     learnerData.idNumber,
//                     learnerData.qualification.name,
//                     learnerData.issueDate,
//                     learnerData.eisaAdmission ? "YES" : "NO",
//                     currentIpfsHash
//                 );
//             } catch (blockchainError: any) {
//                 const isAlreadyMinted =
//                     blockchainError.message?.includes("Certificate ID already exists") ||
//                     blockchainError.data?.message?.includes("Certificate ID already exists");

//                 if (isAlreadyMinted) {
//                     console.log("🎯 Record already exists on blockchain. Syncing local state...");
//                     fingerprint = "ALREADY_MINTED";
//                 } else {
//                     throw blockchainError;
//                 }
//             }

//             // 3. FINALIZE RECORD IN FIREBASE
//             const finalUpdates = {
//                 ipfsHash: currentIpfsHash,
//                 issueDate: learnerData.issueDate, // 🚀 CRITICAL FIX: Save the exact date used for the hash!
//                 isBlockchainVerified: true,
//                 blockchainFingerprint: fingerprint,
//                 blockchainTimestamp: new Date().toISOString()
//             };

//             // Update Enrollment Record
//             const enrolRef = doc(db, "enrollments", learnerData.id);
//             await updateDoc(enrolRef, finalUpdates);

//             // Update Learner Profile Record (if it exists)
//             if (learnerData.learnerId) {
//                 const learnerRef = doc(db, "learners", learnerData.learnerId);
//                 await updateDoc(learnerRef, finalUpdates);
//             }

//             // 4. UPDATE UI
//             setLearnerData(prev => prev ? { ...prev, ...finalUpdates } : null);
//             setMintingStatus('success');
//             setVerificationStatus('authentic');

//         } catch (error: any) {
//             console.error("Critical Minting Error:", error);
//             if (error.message && error.message.toLowerCase().includes('metamask')) {
//                 setShowMetaMaskPrompt(true);
//                 setMintingStatus('idle');
//                 return;
//             }
//             const errorMsg = error.shortMessage || error.message || "Minting failed. Please try again.";
//             setMintingError(errorMsg);
//             setMintingStatus('error');
//         }
//     };

//     const calculateTotalCredits = (modules: SoRModule[]): number => {
//         return modules.reduce((total, module) => total + (module.credits || 0), 0);
//     };

//     // ─── RENDERS ───

//     if (isLoading) {
//         return (
//             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, height: '100vh', flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
//                 <div style={{ border: '4px solid #e2e8f0', borderTop: '4px solid #0284c7', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite' }} />
//                 <p style={{ color: '#475569', fontWeight: 'bold' }}>Loading Statement of Results...</p>
//             </div>
//         );
//     }

//     if (!learnerData) {
//         return (
//             <div style={{ display: 'flex', justifyContent: 'center', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', background: '#f8fafc' }}>
//                 <div style={{ color: '#ef4444', fontSize: '48px' }}>⚠️</div>
//                 <h2 style={{ color: '#0f172a', margin: 0 }}>Record Not Found</h2>
//                 <p style={{ color: '#64748b', maxWidth: '400px', textAlign: 'center' }}>
//                     We couldn't locate this Statement of Results. If you are scanning a QR code, ensure the platform's security rules allow public verification.
//                 </p>
//                 <button onClick={() => navigate(-1)} style={{ padding: '10px 20px', background: '#0284c7', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', marginTop: '10px' }}>
//                     Return to Dashboard
//                 </button>
//             </div>
//         );
//     }

//     const rawBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
//     const cleanBaseUrl = rawBaseUrl.replace(/\/$/, "");
//     const publicVerificationUrl = `${cleanBaseUrl}/sor/${learnerData.verificationCode}`;

//     // 🚀 PUBLIC VERIFICATION VIEW (Scanned from QR)
//     if (isPublicView) {
//         return (
//             <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px', backgroundColor: '#f9fafb', fontFamily: 'system-ui, sans-serif' }}>
//                 <div style={{ width: '100%', maxWidth: '400px', backgroundColor: 'white', borderRadius: '16px', padding: '32px 24px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', textAlign: 'center', border: verificationStatus === 'authentic' ? '1px solid #dcfce7' : '1px solid #fee2e2' }}>

//                     {verificationStatus === 'verifying' && (
//                         <div>
//                             <div style={{ border: '4px solid #e0f2fe', borderTop: '4px solid #0ea5e9', borderRadius: '50%', width: '60px', height: '60px', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }} />
//                             <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0' }}>Verifying...</h1>
//                             <p style={{ color: '#6b7280', fontSize: '14px' }}>Connecting to blockchain registry</p>
//                         </div>
//                     )}

//                     {verificationStatus === 'authentic' && (
//                         <div>
//                             <div style={{ width: '80px', height: '80px', backgroundColor: '#dcfce7', color: '#16a34a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '40px' }}>✓</div>
//                             <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: '0 0 8px 0' }}>Credential Verified</h1>
//                             <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>Issued securely by mLab Southern Africa</p>

//                             <div style={{ textAlign: 'left', borderTop: '1px solid #f3f4f6', paddingTop: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
//                                 <div>
//                                     <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>Learner Name</p>
//                                     <p style={{ fontSize: '18px', fontWeight: '600', color: '#1f2937', margin: 0 }}>{learnerData.fullName}</p>
//                                 </div>
//                                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
//                                     <div>
//                                         <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>ID Number</p>
//                                         <p style={{ fontSize: '14px', fontWeight: '500', color: '#374151', margin: 0 }}>{learnerData.idNumber.substring(0, 6)}*******</p>
//                                     </div>
//                                     <div>
//                                         <p style={{ fontSize: '11px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 4px 0' }}>EISA Admission</p>
//                                         <p style={{ fontSize: '14px', fontWeight: 'bold', color: learnerData.eisaAdmission ? '#16a34a' : '#dc2626', margin: 0 }}>{learnerData.eisaAdmission ? 'YES' : 'NO'}</p>
//                                     </div>
//                                 </div>
//                             </div>

//                             <button onClick={() => setIsPublicView(false)} style={{ marginTop: '24px', padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>
//                                 View Full Document
//                             </button>
//                         </div>
//                     )}

//                     {(verificationStatus === 'failed' || verificationStatus === 'revoked') && (
//                         <div>
//                             <div style={{ width: '80px', height: '80px', backgroundColor: '#fee2e2', color: '#dc2626', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '40px' }}>✕</div>

//                             <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#dc2626', margin: '0 0 8px 0' }}>
//                                 {verificationStatus === 'revoked' ? 'Credential Withdrawn' : 'Invalid Credential'}
//                             </h1>

//                             <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
//                                 {verificationStatus === 'revoked'
//                                     ? 'This document has been officially withdrawn by mLab Southern Africa and is no longer considered a valid record of results.'
//                                     : 'This document could not be matched against our official digital registry. This may be due to a tampered file or an unauthorized record.'}
//                             </p>

//                             <div style={{ padding: '12px', background: '#fff1f2', borderRadius: '8px', border: '1px solid #fecdd3' }}>
//                                 <p style={{ color: '#9f1239', fontSize: '12px', margin: 0, fontWeight: '600' }}>
//                                     Notice to Employer: Please contact mLab Academic Department to verify the authenticity of this learner's status.
//                                 </p>
//                             </div>
//                         </div>
//                     )}

//                     {verificationStatus === 'idle' && (
//                         <div>
//                             <div style={{ width: '80px', height: '80px', backgroundColor: '#fef9c3', color: '#d97706', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', fontSize: '40px' }}>⏳</div>
//                             <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706', margin: '0 0 8px 0' }}>Verification Pending</h1>
//                             <p style={{ color: '#b45309', fontSize: '14px', marginBottom: '24px', lineHeight: '1.5' }}>
//                                 This learner's results are registered in our system, but the document is currently awaiting final official digital certification by mLab.
//                             </p>
//                             <button onClick={() => setIsPublicView(false)} style={{ marginTop: '8px', padding: '10px 20px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', width: '100%' }}>
//                                 View Provisional Document
//                             </button>
//                         </div>
//                     )}

//                     <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #f3f4f6' }}>
//                         <img src="../../src/assets/logo/mlab_logo.png" alt="mLab" style={{ height: '24px', margin: '0 auto', opacity: 0.5, filter: 'grayscale(100%)' }} />
//                         <p style={{ fontSize: '10px', color: '#d1d5db', marginTop: '8px', fontFamily: 'monospace' }}>ID: {learnerData.verificationCode}</p>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     // 🚀 ADMIN / PRINT VIEW
//     return (
//         <>
//             <div className="sor-wrapper">

//                 <div className="no-print" style={{ maxWidth: '210mm', margin: '0 auto 1rem auto' }}>
//                     {verificationStatus === 'verifying' && (
//                         <div style={{ padding: '1rem', background: '#e0f2fe', borderLeft: '4px solid #0ea5e9', borderRadius: '4px', display: 'flex', gap: '10px', alignItems: 'center' }}>
//                             <div style={{ border: '2px solid #0ea5e9', borderTop: '2px solid transparent', borderRadius: '50%', width: '20px', height: '20px', animation: 'spin 1s linear infinite' }} />
//                             <span style={{ color: '#0369a1', fontWeight: 'bold' }}>Verifying Web3 Authenticity...</span>
//                         </div>
//                     )}
//                     {verificationStatus === 'authentic' && (
//                         <div style={{ padding: '1rem', background: '#dcfce7', borderLeft: '4px solid #22c55e', borderRadius: '4px', display: 'flex', gap: '10px', alignItems: 'center' }}>
//                             <span style={{ fontSize: '1.5rem' }}>✅</span>
//                             <div>
//                                 <p style={{ color: '#166534', fontWeight: 'bold', margin: 0 }}>Officially Verified</p>
//                                 <p style={{ color: '#15803d', fontSize: '0.875rem', margin: 0 }}>This record is secured by the blockchain and matches the official registry.</p>
//                             </div>
//                         </div>
//                     )}
//                     {verificationStatus === 'idle' && !learnerData.ipfsHash && (
//                         <div style={{ padding: '1rem', background: '#fef9c3', borderLeft: '4px solid #eab308', borderRadius: '4px', display: 'flex', gap: '10px', alignItems: 'center' }}>
//                             <span style={{ fontSize: '1.5rem' }}>⏳</span>
//                             <div>
//                                 <p style={{ color: '#854d0e', fontWeight: 'bold', margin: 0 }}>Draft Record</p>
//                                 <p style={{ color: '#a16207', fontSize: '0.875rem', margin: 0 }}>This record has not yet been minted to the blockchain.</p>
//                             </div>
//                         </div>
//                     )}
//                     {mintingStatus === 'error' && (
//                         <div style={{ padding: '1rem', background: '#fee2e2', borderLeft: '4px solid #ef4444', borderRadius: '4px', marginTop: '0.5rem' }}>
//                             <p style={{ color: '#991b1b', fontWeight: 'bold', fontSize: '0.875rem' }}>Minting Failed: {mintingError}</p>
//                         </div>
//                     )}
//                 </div>

//                 <div className="container" ref={documentRef} style={{ background: 'white' }}>
//                     <div className="accent-bar"></div>

//                     <div className="letterhead">
//                         <div className="letterhead-content">
//                             <div className="provider-info">
//                                 <div className="logo-container">
//                                     <img height={70} src="../../src/assets/logo/mlab_logo.png" alt="mLab Logo" />
//                                 </div>
//                                 <div className="provider-details">
//                                     <div>13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345</div>
//                                     <div>Registration No: SDP070824115131</div>
//                                 </div>
//                             </div>
//                             <div className="contact-info">
//                                 <div><strong>Tel:</strong> +27 012 844 0240</div>
//                                 <div><strong>Email:</strong> codetribe@mlab.co.za</div>
//                                 <div><strong>Web:</strong> www.mlab.co.za</div>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="document-header">
//                         <div className="document-title">Statement of Results</div>
//                         <div className="document-subtitle">
//                             {learnerData.isOffline ? 'Recognition of Prior Learning (RPL) Record' : 'Not an Occupational Certificate'}
//                         </div>
//                     </div>

//                     <div className="content">
//                         <div className="qualification-box">
//                             <div className="qualification-title">
//                                 {learnerData.qualification.name.toLowerCase().includes('certificate')
//                                     ? learnerData.qualification.name
//                                     : `Occupational Certificate: ${learnerData.qualification.name}`}
//                             </div>
//                             <div className="qualification-meta">
//                                 <div className="meta-item"><span className="meta-label">SAQA ID</span><span className="meta-value">{learnerData.qualification.saqaId}</span></div>
//                                 <div className="meta-item"><span className="meta-label">Credits</span><span className="meta-value">{learnerData.qualification.credits}</span></div>
//                                 <div className="meta-item"><span className="meta-label">NQF Level</span><span className="meta-value">{learnerData.qualification.nqfLevel}</span></div>
//                                 <div className="meta-item"><span className="meta-label">Date Assessed</span><span className="meta-value">{learnerData.qualification.dateAssessed}</span></div>
//                             </div>
//                         </div>

//                         <div className="learner-section">
//                             <h2 className="section-title">Learner Information</h2>
//                             <div className="learner-info">
//                                 <div className="info-field"><span className="field-label">Full Name</span><span className="field-value">{learnerData.fullName}</span></div>
//                                 <div className="info-field"><span className="field-label">ID Number</span><span className="field-value">{learnerData.idNumber}</span></div>
//                                 <div className="info-field"><span className="field-label">Date of Birth</span><span className="field-value">{learnerData.dateOfBirth}</span></div>
//                             </div>
//                         </div>

//                         {learnerData.knowledgeModules.length > 0 && (
//                             <AssessmentCategory title="Knowledge Modules" totalCredits={calculateTotalCredits(learnerData.knowledgeModules)} modules={learnerData.knowledgeModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
//                         )}

//                         {learnerData.practicalModules.length > 0 && (
//                             <AssessmentCategory title="Practical Skills Modules" totalCredits={calculateTotalCredits(learnerData.practicalModules)} modules={learnerData.practicalModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
//                         )}

//                         {learnerData.workExperienceModules.length > 0 && (
//                             <AssessmentCategory title="Work Experience Modules" totalCredits={calculateTotalCredits(learnerData.workExperienceModules)} modules={learnerData.workExperienceModules} dateLabel="Date Signed Off" getStatusClass={getStatusClass} />
//                         )}

//                         <div className="summary-box">
//                             <div className="summary-text">Learner has gained admission to the External Integrated Summative Assessment (EISA)</div>
//                             <div className="eisa-status">
//                                 <span className="eisa-label">Status:</span>
//                                 <span className={`eisa-badge ${learnerData.eisaAdmission ? '' : 'no'}`}>
//                                     {learnerData.eisaAdmission ? 'YES' : 'NO'}
//                                 </span>
//                             </div>
//                         </div>

//                         <div className="important-notice">
//                             <div className="notice-title">⚠️ Important Notice</div>
//                             <div className="notice-text">
//                                 <p><strong>This Statement of Results is not an Occupational Certificate.</strong></p>
//                                 <p>The learner has complied with the requirements of the Knowledge, Practical and Workplace Components of the qualification. The Quality Council for Trades and Occupations (QCTO) may issue the Occupational Certificate after the candidate has successfully completed the External Integrated Summative Assessment (EISA) requirements.</p>

//                                 <p><strong>This SoR is valid for a period of two years from date of issue.</strong></p>
//                                 <p><strong>Date of Next EISA:</strong> {learnerData.nextEISADate}</p>
//                                 <p style={{ fontStyle: 'italic' }}>Learners must bring this SoR together with their IDs when writing the EISA.</p>
//                             </div>
//                         </div>

//                         <div className="attachments-box">
//                             <div className="attachments-title">Required Attachments</div>
//                             <ul className="attachments-list">
//                                 <li>Learner's ID Document</li>
//                                 {learnerData.isOffline ? (
//                                     <li>Signed Portfolio of Evidence (Physical/External Copy)</li>
//                                 ) : (
//                                     <li>Proof of passing Mathematics and English (for Level 3 & 4 qualifications):
//                                         <ul style={{ listStyle: 'none', marginLeft: '1.5rem', marginTop: '0.5rem' }}>
//                                             <li>• Grade 12 Certificate (or equivalent) with pass marks for Maths and English, OR</li>
//                                             <li>• FLC Statement of Results for Numeracy and Literacy - Competent</li>
//                                         </ul>
//                                     </li>
//                                 )}
//                             </ul>
//                         </div>

//                         <div className="footer-section">
//                             <div className="signature-area">
//                                 <div className="signature-block">
//                                     <div className="signature-image-container">
//                                         <img src="../../src/assets/Signatue_Zack_.png" alt="Authorized Signature" />
//                                     </div>
//                                     <div className="signature-line"></div>
//                                     <div className="signature-name">{learnerData.issuedBy.name}</div>
//                                     <div className="signature-title">{learnerData.issuedBy.title}</div>
//                                     <div className="signature-title" style={{ marginTop: '0.5rem', fontWeight: 600 }}>Date Issued: {learnerData.issueDate}</div>
//                                 </div>

//                                 <div className="signature-block">
//                                     <div className="qr-verification" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
//                                         <QRCodeSVG
//                                             value={publicVerificationUrl}
//                                             size={120}
//                                             level={"H"}
//                                             includeMargin={false}
//                                         />
//                                         <div className="qr-label" style={{ marginTop: '10px' }}>Scan to Verify</div>
//                                         <div className="verification-code" style={{ fontFamily: 'monospace', fontSize: '10px', marginTop: '5px' }}>{learnerData.verificationCode}</div>
//                                     </div>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 </div>

//                 {/* 🚀 FIXED: BUTTON LOGIC NOW RELIES ON isBlockchainVerified */}
//                 <div className="print-controls no-print" style={{ position: 'fixed', bottom: '20px', right: '20px', display: 'flex', gap: '10px', background: 'rgba(255,255,255,0.9)', padding: '10px', borderRadius: '60px', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}>
//                     <button onClick={() => navigate(-1)} style={{ background: 'white', color: '#0f172a', border: '1px solid #cbd5e1', padding: '12px 20px', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         Back
//                     </button>
//                     <button onClick={() => window.print()} style={{ background: 'white', color: '#0284c7', border: '1px solid #0284c7', padding: '12px 24px', borderRadius: '50px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                         🖨️ Print PDF
//                     </button>

//                     {currentUser?.role === 'admin' &&
//                         !learnerData.isBlockchainVerified &&
//                         mintingStatus !== 'success' && (
//                             <button
//                                 onClick={handleIssueToBlockchain}
//                                 disabled={mintingStatus !== 'idle' && mintingStatus !== 'error'}
//                                 style={{
//                                     background: (mintingStatus !== 'idle' && mintingStatus !== 'error') ? '#94a3b8' : '#0ea5e9',
//                                     color: 'white',
//                                     border: 'none',
//                                     padding: '12px 24px',
//                                     borderRadius: '50px',
//                                     cursor: (mintingStatus !== 'idle' && mintingStatus !== 'error') ? 'not-allowed' : 'pointer',
//                                     fontWeight: 'bold',
//                                     display: 'flex',
//                                     alignItems: 'center',
//                                     gap: '8px',
//                                     transition: 'all 0.2s'
//                                 }}
//                             >
//                                 {mintingStatus === 'idle' && (
//                                     learnerData.ipfsHash
//                                         ? "🔗 Finalize Blockchain Securement"
//                                         : "🚀 Issue to Blockchain"
//                                 )}
//                                 {mintingStatus === 'generating_pdf' && "📄 Generating Document..."}
//                                 {mintingStatus === 'uploading_ipfs' && "☁️ Uploading to IPFS..."}
//                                 {mintingStatus === 'signing_wallet' && "🦊 Please Sign in MetaMask..."}
//                                 {mintingStatus === 'error' && "⚠️ Retry Issuance"}
//                             </button>
//                         )}

//                     {learnerData.isBlockchainVerified && (
//                         <div style={{ background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', padding: '12px 24px', borderRadius: '50px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
//                             ✅ Secured on-chain
//                         </div>
//                     )}
//                 </div>
//             </div>

//             {/* 🚀 METAMASK INSTALLATION MODAL */}
//             {showMetaMaskPrompt && (
//                 <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, backdropFilter: 'blur(4px)' }}>
//                     <div style={{ background: 'white', padding: '40px', borderRadius: '16px', maxWidth: '400px', width: '90%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
//                         <img
//                             src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg"
//                             alt="MetaMask Logo"
//                             style={{ width: '100px', height: '100px', marginBottom: '20px' }}
//                         />
//                         <h2 style={{ margin: '0 0 12px 0', color: '#0f172a', fontSize: '24px' }}>MetaMask Required</h2>
//                         <p style={{ color: '#475569', marginBottom: '32px', fontSize: '15px', lineHeight: '1.5' }}>
//                             To issue secure, tamper-proof credentials to the blockchain, you need to install the MetaMask browser extension.
//                         </p>
//                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
//                             <a
//                                 href="https://metamask.io/download/"
//                                 target="_blank"
//                                 rel="noopener noreferrer"
//                                 style={{ display: 'block', padding: '14px 20px', background: '#f6851b', color: 'white', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', transition: 'background 0.2s' }}
//                                 onClick={() => setShowMetaMaskPrompt(false)}
//                             >
//                                 Download MetaMask
//                             </a>
//                             <button
//                                 onClick={() => setShowMetaMaskPrompt(false)}
//                                 style={{ padding: '12px 20px', border: 'none', background: 'transparent', color: '#64748b', cursor: 'pointer', fontWeight: '600', fontSize: '15px' }}
//                             >
//                                 Cancel
//                             </button>
//                         </div>
//                     </div>
//                 </div>
//             )}
//         </>
//     );
// };

// const AssessmentCategory: React.FC<{ title: string, totalCredits: number, modules: SoRModule[], dateLabel: string, getStatusClass: (s: string) => string }> = ({ title, totalCredits, modules, dateLabel, getStatusClass }) => {
//     if (modules.length === 0) return null;
//     return (
//         <div className="assessment-category">
//             <div className="category-header">
//                 <span>{title}</span>
//                 <span className="category-badge">{totalCredits} Credits</span>
//             </div>
//             <table className="assessment-table">
//                 <thead>
//                     <tr>
//                         <th>Module Name</th>
//                         <th>Credits</th>
//                         <th>{dateLabel}</th>
//                         <th>Achievement</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {modules.map((module, index) => (
//                         <tr key={index}>
//                             <td className="module-name" width="50%">{module.name}</td>
//                             <td><span className="credits-badge">{module.credits}</span></td>
//                             <td style={{ color: '#334155' }}>{'dateAssessed' in module ? module.dateAssessed : module.dateSignedOff}</td>
//                             <td className="achievement-status">
//                                 <span className={`status-badge ${getStatusClass(module.status)}`}>{module.status}</span>
//                             </td>
//                         </tr>
//                     ))}
//                 </tbody>
//             </table>
//         </div>
//     );
// };

// export default StatementOfResults;





