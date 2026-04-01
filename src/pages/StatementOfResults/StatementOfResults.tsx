// src/pages/StatementOfResults/StatementOfResults.tsx

// src/pages/StatementOfResults/StatementOfResults.tsx

import React, { useEffect, useState, useRef, useMemo } from 'react';
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

interface LearnerData {
    id: string;
    learnerId?: string;
    cohortId?: string;
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
    if (!status) return "Not Started";
    const s = status.toLowerCase().trim();
    if (s === "competent" || s === "pass" || s === "c") return "Competent";
    if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") return "Not Yet Competent";
    if (s === "not started") return "Not Started";
    if (s === "pending" || s === "in progress") return "In Progress";
    if (s === "graded" && marks !== undefined && totalMarks !== undefined) {
        return marks >= (totalMarks / 2) ? "Competent" : "Not Yet Competent";
    }
    return "In Progress";
};

const getStatusClass = (status: string): string => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'competent') return 'status-competent';
    if (statusLower === 'not yet competent') return 'status-not-competent';
    if (statusLower === 'not started') return 'status-pending';
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

    const { learners, cohorts, settings } = useStore();

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
                        cohortId: data.cohortId,
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

    const displayCampus = useMemo(() => {
        if (learnerData?.cohortId && settings?.campuses) {
            const cohort = cohorts.find(c => c.id === learnerData.cohortId);
            if (cohort?.campusId) {
                const specificCampus = settings.campuses.find(c => c.id === cohort.campusId);
                if (specificCampus) return specificCampus;
            }
        }
        if (settings?.campuses && settings.campuses.length > 0) {
            const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
            if (defaultCampus) return defaultCampus;
        }
        return {
            name: "Kimberley Campus (Head Office)",
            address: "13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345",
            siteAccreditationNumber: "SDP070824115131"
        };
    }, [learnerData, cohorts, settings]);

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
                    position = heightLeft - imgHeight;
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
        return <Loader message="Loading Statement of Results..." />;
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
                            <p>Issued securely by {settings?.institutionName || "mLab Southern Africa"}</p>
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
                                Please contact the Academic Department to verify this learner's status.
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
            <div className="sor-wrapper">
                {/* THE VERIFICATION CARD */}
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

                {/* A4 DOCUMENT CONTAINER */}
                <div className="container" ref={documentRef}>
                    <div className="accent-bar"></div>

                    <div className="letterhead">
                        <div className="letterhead-content">
                            <div className="provider-info">
                                <div className="logo-container">
                                    <img height={70} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
                                </div>
                                <div className="provider-details">
                                    <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
                                        {settings?.institutionName || "Mobile Applications Laboratory NPC"}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
                                        Reg: {settings?.companyRegistrationNumber || "2011/149875/08"}
                                    </div>

                                    <div style={{ fontWeight: '600', color: 'var(--mlab-blue)' }}>
                                        {displayCampus.name}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', lineHeight: '1.2', marginTop: '4px' }}>
                                        {displayCampus.address}
                                    </div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: '600', marginTop: '4px' }}>
                                        SDP Accreditation: {displayCampus.siteAccreditationNumber}
                                    </div>
                                </div>
                            </div>
                            <div className="contact-info">
                                <div><strong>Tel:</strong> {settings?.phone || "+27 012 844 0240"}</div>
                                <div><strong>Email:</strong> {settings?.email || "codetribe@mlab.co.za"}</div>
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
                                        <img src={(settings as any)?.signatureUrl || zackSignature} height={200} alt="Authorized Signature" />
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

            {/* FLOATING PRINT & MINT CONTROLS */}
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

// import React, { useEffect, useState, useRef, useMemo } from 'react';
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
// import type { SoRModule } from '../../types/learner.types';
// import { generateSorId } from '../utils/validation';

// import mLabLogo from '../../assets/logo/mlab_logo.png';
// import zackSignature from '../../assets/Signatue_Zack_.png';
// import Loader from '../../components/common/Loader/Loader';

// interface LearnerData {
//     id: string;
//     learnerId?: string;
//     cohortId?: string;
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

// const formatDateSA = (dateInput: string | Date | undefined | null): string => {
//     if (!dateInput) {
//         const d = new Date();
//         const day = String(d.getDate()).padStart(2, '0');
//         const month = String(d.getMonth() + 1).padStart(2, '0');
//         return `${day}-${month}-${d.getFullYear()}`;
//     }

//     const d = new Date(dateInput);
//     if (isNaN(d.getTime())) return String(dateInput).trim();

//     const day = String(d.getDate()).padStart(2, '0');
//     const month = String(d.getMonth() + 1).padStart(2, '0');
//     const year = d.getFullYear();
//     return `${day}-${month}-${year}`;
// };

// // --- COMPONENT ---
// const StatementOfResults: React.FC = () => {
//     const { id } = useParams<{ id: string }>();
//     const navigate = useNavigate();

//     const currentUser = useStore((state) => state.user);

//     const { learners, cohorts, settings } = useStore();

//     const documentRef = useRef<HTMLDivElement>(null);

//     const [learnerData, setLearnerData] = useState<LearnerData | null>(null);
//     const [isLoading, setIsLoading] = useState(true);

//     const [verificationStatus, setVerificationStatus] = useState<'idle' | 'verifying' | 'authentic' | 'failed' | 'revoked'>('idle');
//     const [isPublicView, setIsPublicView] = useState(false);

//     const [mintingStatus, setMintingStatus] = useState<'idle' | 'generating_pdf' | 'uploading_ipfs' | 'signing_wallet' | 'success' | 'error'>('idle');
//     const [mintingError, setMintingError] = useState('');
//     const [showMetaMaskPrompt, setShowMetaMaskPrompt] = useState(false);

//     useEffect(() => {
//         let isMounted = true;

//         const loadData = async () => {
//             if (!id) return;
//             setIsLoading(true);

//             try {
//                 let data: any = null;
//                 let docId = "";

//                 const storeLearner = learners.find(l => l.id === id || l.verificationCode === id);

//                 if (storeLearner) {
//                     data = storeLearner;
//                     docId = storeLearner.id;
//                 } else {
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
//                     } else if (!data) {
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

//                     const finalIssueDate = data.issueDate || formatDateSA(null);
//                     const finalFullName = data.fullName || "Unknown Learner";

//                     setLearnerData({
//                         id: docId,
//                         learnerId: data.learnerId || docId,
//                         cohortId: data.cohortId,
//                         fullName: finalFullName,
//                         idNumber: data.idNumber || "N/A",
//                         dateOfBirth: data.dateOfBirth || "N/A",
//                         isOffline: data.isOffline || false,
//                         qualification: {
//                             name: data.qualification?.name || "Occupational Certificate",
//                             saqaId: data.qualification?.saqaId || "N/A",
//                             credits: (data.qualification?.credits || 0).toString(),
//                             nqfLevel: `Level ${data.qualification?.nqfLevel || 5}`,
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

//     // 🛡️ SAFE FALLBACK LOGIC FOR QCTO COMPLIANCE & MULTI-CAMPUS
//     const displayCampus = useMemo(() => {
//         // 1. Try to get the specific campus for the cohort (For new multi-site classes)
//         if (learnerData?.cohortId && settings?.campuses) {
//             const cohort = cohorts.find(c => c.id === learnerData.cohortId);
//             if (cohort?.campusId) {
//                 const specificCampus = settings.campuses.find(c => c.id === cohort.campusId);
//                 if (specificCampus) return specificCampus;
//             }
//         }

//         // 2. Fallback for RPL/Offline or Legacy Learners: Get the primary/default campus
//         if (settings?.campuses && settings.campuses.length > 0) {
//             const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
//             if (defaultCampus) return defaultCampus;
//         }

//         // 3. Absolute worst-case scenario (Guarantees old QCTO links NEVER break or render blank)
//         return {
//             name: "Kimberley Campus (Head Office)",
//             address: "13 Corner Tyala &, Hulana, Galeshewe, Kimberley, 8345",
//             siteAccreditationNumber: "SDP070824115131"
//         };
//     }, [learnerData, cohorts, settings]);


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

//     const handleIssueToBlockchain = async () => {
//         if (!learnerData || !learnerData.id || !documentRef.current) return;

//         try {
//             setMintingError('');
//             let currentIpfsHash = learnerData.ipfsHash;

//             if (!currentIpfsHash) {
//                 setMintingStatus('generating_pdf');
//                 const canvas = await html2canvas(documentRef.current, {
//                     scale: 1.5,
//                     useCORS: true,
//                     logging: false,
//                     allowTaint: true
//                 });

//                 // Create multi-page PDF if content exceeds one page
//                 const pdf = new jsPDF('p', 'mm', 'a4');
//                 const pdfWidth = pdf.internal.pageSize.getWidth();
//                 const pdfHeight = pdf.internal.pageSize.getHeight();

//                 const imgData = canvas.toDataURL('image/jpeg', 0.75);
//                 const imgProps = pdf.getImageProperties(imgData);
//                 const imgWidth = pdfWidth;
//                 const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

//                 let heightLeft = imgHeight;
//                 let position = 0;

//                 pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
//                 heightLeft -= pdfHeight;

//                 while (heightLeft > 0) {
//                     position = heightLeft - imgHeight; // top of next page (negative)
//                     pdf.addPage();
//                     pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight, undefined, 'FAST');
//                     heightLeft -= pdfHeight;
//                 }

//                 const pdfBlob = pdf.output('blob');
//                 const pdfFile = new File([pdfBlob], `${learnerData.verificationCode}.pdf`, { type: 'application/pdf' });

//                 setMintingStatus('uploading_ipfs');
//                 currentIpfsHash = await uploadToIPFS(pdfFile);

//                 setLearnerData(prev => prev ? { ...prev, ipfsHash: currentIpfsHash } : null);
//                 try { await updateDoc(doc(db, "enrollments", learnerData.id), { ipfsHash: currentIpfsHash }); } catch (fbErr) { console.warn(fbErr); }
//             }

//             setMintingStatus('signing_wallet');
//             let fingerprint;
//             try {
//                 fingerprint = await issueBlockchainCertificate(
//                     learnerData.verificationCode, learnerData.fullName, learnerData.idNumber,
//                     learnerData.qualification.name, learnerData.issueDate,
//                     learnerData.eisaAdmission ? "YES" : "NO", currentIpfsHash
//                 );
//             } catch (blockchainError: any) {
//                 if (blockchainError.message?.includes("already exists") || blockchainError.data?.message?.includes("already exists")) {
//                     fingerprint = "ALREADY_MINTED";
//                 } else { throw blockchainError; }
//             }

//             const finalUpdates: any = {
//                 ipfsHash: currentIpfsHash,
//                 issueDate: learnerData.issueDate,
//                 "qualification.dateAssessed": learnerData.issueDate,
//                 isBlockchainVerified: true,
//                 blockchainFingerprint: fingerprint,
//                 blockchainTimestamp: new Date().toISOString()
//             };

//             if (learnerData.isOffline) {
//                 finalUpdates.knowledgeModules = learnerData.knowledgeModules.map(m => ({ ...m, dateAssessed: learnerData.issueDate }));
//                 finalUpdates.practicalModules = learnerData.practicalModules.map(m => ({ ...m, dateAssessed: learnerData.issueDate }));
//                 finalUpdates.workExperienceModules = learnerData.workExperienceModules.map(m => ({ ...m, dateSignedOff: learnerData.issueDate }));
//             }

//             await updateDoc(doc(db, "enrollments", learnerData.id), finalUpdates);

//             if (learnerData.learnerId) {
//                 await updateDoc(doc(db, "learners", learnerData.learnerId), {
//                     ipfsHash: currentIpfsHash, issueDate: learnerData.issueDate,
//                     isBlockchainVerified: true, blockchainFingerprint: fingerprint, blockchainTimestamp: finalUpdates.blockchainTimestamp
//                 });
//             }

//             setLearnerData(prev => prev ? { ...prev, ...finalUpdates, qualification: { ...prev.qualification, dateAssessed: learnerData.issueDate } } : null);
//             setMintingStatus('success');
//             setVerificationStatus('authentic');

//         } catch (error: any) {
//             console.error("Critical Minting Error:", error);
//             if (error.message && error.message.toLowerCase().includes('metamask')) {
//                 setShowMetaMaskPrompt(true);
//                 setMintingStatus('idle');
//                 return;
//             }
//             setMintingError(error.shortMessage || error.message || "Minting failed.");
//             setMintingStatus('error');
//         }
//     };

//     const calculateTotalCredits = (modules: SoRModule[]): number => {
//         return modules.reduce((total, module) => total + (module.credits || 0), 0);
//     };

//     if (isLoading) {
//         return <Loader message="Loading Statement of Results..." />;
//     }

//     if (!learnerData) {
//         return (
//             <div className="sor-not-found">
//                 <div className="sor-error-icon">⚠️</div>
//                 <h2>Record Not Found</h2>
//                 <p>We couldn't locate this Statement of Results. Ensure the URL is correct.</p>
//                 <button className="sor-btn" onClick={() => navigate(-1)}>Return to Dashboard</button>
//             </div>
//         );
//     }

//     const rawBaseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
//     const cleanBaseUrl = rawBaseUrl.replace(/\/$/, "");
//     const publicVerificationUrl = `${cleanBaseUrl}/sor/${learnerData.verificationCode}`;

//     if (isPublicView) {
//         return (
//             <div className="public-verify-wrap">
//                 <div className={`public-verify-card ${verificationStatus === 'authentic' ? 'authentic' : verificationStatus === 'failed' || verificationStatus === 'revoked' ? 'failed' : ''}`}>
//                     {verificationStatus === 'verifying' && (
//                         <div className="verify-state">
//                             <div className="sor-spinner" style={{ borderColor: '#e0f2fe', borderTopColor: '#0ea5e9' }} />
//                             <h1>Verifying...</h1>
//                             <p>Connecting to Web3 Registry</p>
//                         </div>
//                     )}
//                     {verificationStatus === 'authentic' && (
//                         <div className="verify-state">
//                             <div className="verify-icon success">✓</div>
//                             <h1>Credential Verified</h1>
//                             <p>Issued securely by {settings?.institutionName || "mLab Southern Africa"}</p>
//                             <div className="verify-details">
//                                 <div className="detail-row">
//                                     <label>Learner Name</label>
//                                     <span>{learnerData.fullName}</span>
//                                 </div>
//                                 <div className="detail-grid">
//                                     <div className="detail-row">
//                                         <label>ID Number</label>
//                                         <span>{learnerData.idNumber.substring(0, 6)}*******</span>
//                                     </div>
//                                     <div className="detail-row">
//                                         <label>EISA Admission</label>
//                                         <span className={learnerData.eisaAdmission ? 'text-green' : 'text-red'}>
//                                             {learnerData.eisaAdmission ? 'YES' : 'NO'}
//                                         </span>
//                                     </div>
//                                 </div>
//                             </div>
//                             <button className="sor-btn-secondary" onClick={() => setIsPublicView(false)}>View Official Document</button>
//                         </div>
//                     )}
//                     {(verificationStatus === 'failed' || verificationStatus === 'revoked') && (
//                         <div className="verify-state">
//                             <div className="verify-icon error">✕</div>
//                             <h1>{verificationStatus === 'revoked' ? 'Credential Withdrawn' : 'Invalid Credential'}</h1>
//                             <p className="error-text">
//                                 {verificationStatus === 'revoked'
//                                     ? 'This document has been officially withdrawn and is no longer valid.'
//                                     : 'This document could not be matched against our official digital registry. It may be altered.'}
//                             </p>
//                             <div className="verify-notice">
//                                 Please contact the Academic Department to verify this learner's status.
//                             </div>
//                         </div>
//                     )}
//                     {verificationStatus === 'idle' && (
//                         <div className="verify-state">
//                             <div className="verify-icon pending">⏳</div>
//                             <h1>Verification Pending</h1>
//                             <p>This document is awaiting final digital certification.</p>
//                             <button className="sor-btn-secondary" onClick={() => setIsPublicView(false)}>View Provisional Document</button>
//                         </div>
//                     )}
//                     <div className="verify-footer">
//                         <p className="verify-id">ID: {learnerData.verificationCode}</p>
//                     </div>
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div className="sor-layout">
//             <div className="sor-wrapper">
//                 {/* THE VERIFICATION CARD */}
//                 <div className="no-print status-banner-container">
//                     {verificationStatus === 'verifying' && (
//                         <div className="status-banner banner-info">
//                             <div className="sor-spinner-mini" />
//                             <span className="banner-text">Verifying Web3 Authenticity...</span>
//                         </div>
//                     )}
//                     {verificationStatus === 'authentic' && (
//                         <div className="status-banner banner-success">
//                             <span className="banner-icon">✅</span>
//                             <div>
//                                 <p className="banner-title">Officially Verified</p>
//                                 <p className="banner-sub">This record is secured by the blockchain and matches the official registry.</p>
//                             </div>
//                         </div>
//                     )}
//                     {verificationStatus === 'idle' && !learnerData.ipfsHash && (
//                         <div className="status-banner banner-warning">
//                             <span className="banner-icon">⏳</span>
//                             <div>
//                                 <p className="banner-title">Draft Record</p>
//                                 <p className="banner-sub">This record has not yet been minted to the blockchain.</p>
//                             </div>
//                         </div>
//                     )}
//                     {mintingStatus === 'error' && (
//                         <div className="status-banner banner-error">
//                             <span className="banner-icon">⚠️</span>
//                             <div>
//                                 <p className="banner-title">Minting Failed</p>
//                                 <p className="banner-sub">{mintingError}</p>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 {/* A4 DOCUMENT CONTAINER */}
//                 <div className="container" ref={documentRef}>
//                     <div className="accent-bar"></div>

//                     {/* DYNAMIC LETTERHEAD WITH BRAND ASSET FALLBACKS */}
//                     <div className="letterhead">
//                         <div className="letterhead-content">
//                             <div className="provider-info">
//                                 <div className="logo-container">
//                                     {/* LOGO FALLBACK APPLIED HERE */}
//                                     <img height={70} src={(settings as any)?.logoUrl || mLabLogo} alt="Institution Logo" />
//                                 </div>
//                                 <div className="provider-details">
//                                     <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>
//                                         {settings?.institutionName || "Mobile Applications Laboratory NPC"}
//                                     </div>
//                                     <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '8px' }}>
//                                         Reg: {settings?.companyRegistrationNumber || "2011/149875/08"}
//                                     </div>

//                                     <div style={{ fontWeight: '600', color: 'var(--mlab-blue)' }}>
//                                         {displayCampus.name}
//                                     </div>
//                                     <div style={{ fontSize: '0.85rem', lineHeight: '1.2', marginTop: '4px' }}>
//                                         {displayCampus.address}
//                                     </div>
//                                     <div style={{ fontSize: '0.85rem', fontWeight: '600', marginTop: '4px' }}>
//                                         SDP Accreditation: {displayCampus.siteAccreditationNumber}
//                                     </div>
//                                 </div>
//                             </div>
//                             <div className="contact-info">
//                                 <div><strong>Tel:</strong> {settings?.phone || "+27 012 844 0240"}</div>
//                                 <div><strong>Email:</strong> {settings?.email || "codetribe@mlab.co.za"}</div>
//                                 <div><strong>Web:</strong> www.mlab.co.za</div>
//                             </div>
//                         </div>
//                     </div>

//                     <div className="document-header">
//                         <div className="document-title">Statement of Results</div>
//                         <div className="document-subtitle">Not an Occupational Certificate</div>
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

//                         <div className="assessment-wrapper">
//                             {learnerData.knowledgeModules.length > 0 && (
//                                 <AssessmentCategory title="Knowledge Modules" totalCredits={calculateTotalCredits(learnerData.knowledgeModules)} modules={learnerData.knowledgeModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
//                             )}

//                             {learnerData.practicalModules.length > 0 && (
//                                 <AssessmentCategory title="Practical Skills Modules" totalCredits={calculateTotalCredits(learnerData.practicalModules)} modules={learnerData.practicalModules} dateLabel="Date Assessed" getStatusClass={getStatusClass} />
//                             )}

//                             {learnerData.workExperienceModules.length > 0 && (
//                                 <AssessmentCategory title="Work Experience Modules" totalCredits={calculateTotalCredits(learnerData.workExperienceModules)} modules={learnerData.workExperienceModules} dateLabel="Date Signed Off" getStatusClass={getStatusClass} />
//                             )}
//                         </div>

//                         <div className="summary-box page-break-avoid">
//                             <div className="summary-text">Learner has gained admission to the External Integrated Summative Assessment (EISA)</div>
//                             <div className="eisa-status">
//                                 <span className="eisa-label">Status:</span>
//                                 <span className={`eisa-badge ${learnerData.eisaAdmission ? '' : 'no'}`}>
//                                     {learnerData.eisaAdmission ? 'YES' : 'NO'}
//                                 </span>
//                             </div>
//                         </div>

//                         <div className="important-notice page-break-avoid">
//                             <div className="notice-title">⚠️ Important Notice</div>
//                             <div className="notice-text">
//                                 <p><strong>This Statement of Results is not an Occupational Certificate.</strong></p>
//                                 <p>The learner has complied with the requirements of the Knowledge, Practical and Workplace Components of the qualification. The Quality Council for Trades and Occupations (QCTO) may issue the Occupational Certificate after the candidate has successfully completed the External Integrated Summative Assessment (EISA) requirements.</p>
//                                 <p><strong>This SoR is valid for a period of two years from date of issue.</strong></p>
//                                 <p><strong>Date of Next EISA:</strong> {learnerData.nextEISADate}</p>
//                                 <p style={{ fontStyle: 'italic' }}>Learners must bring this SoR together with their IDs when writing the EISA.</p>
//                             </div>
//                         </div>

//                         <div className="attachments-box page-break-avoid">
//                             <div className="attachments-title">Required Attachments</div>
//                             <ul className="attachments-list">
//                                 <li>Learner's ID Document</li>
//                                 {learnerData.isOffline ? (
//                                     <li>Signed Portfolio of Evidence (Physical/External Copy)</li>
//                                 ) : (
//                                     <li>Proof of passing Mathematics and English (for Level 3 & 4 qualifications)</li>
//                                 )}
//                             </ul>
//                         </div>

//                         <div className="footer-section page-break-avoid">
//                             <div className="signature-area">
//                                 <div className="signature-block">
//                                     <div className="signature-image-container">
//                                         {/* SIGNATURE FALLBACK APPLIED HERE */}
//                                         <img src={(settings as any)?.signatureUrl || zackSignature} height={200} alt="Authorized Signature" />
//                                     </div>
//                                     <div className="signature-line"></div>
//                                     <div className="signature-name">{learnerData.issuedBy.name}</div>
//                                     <div className="signature-title">{learnerData.issuedBy.title}</div>
//                                     <div className="signature-title" style={{ marginTop: '0.5rem', fontWeight: 600 }}>Date Issued: {learnerData.issueDate}</div>
//                                 </div>

//                                 <div className="qr-verification">
//                                     <QRCodeSVG value={publicVerificationUrl} size={100} level={"H"} includeMargin={false} />
//                                     <div className="qr-label">Scan to Verify</div>
//                                     <div className="verification-code">{learnerData.verificationCode}</div>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>
//                 </div>
//             </div>

//             {/* FLOATING PRINT & MINT CONTROLS */}
//             <div className="print-controls no-print">
//                 <button onClick={() => navigate(-1)} className="control-btn control-btn-back">
//                     Back
//                 </button>
//                 <button onClick={() => window.print()} className="control-btn control-btn-print">
//                     🖨️ Print PDF
//                 </button>

//                 {currentUser?.role === 'admin' &&
//                     !learnerData.isBlockchainVerified &&
//                     mintingStatus !== 'success' && (
//                         <button
//                             onClick={handleIssueToBlockchain}
//                             disabled={mintingStatus !== 'idle' && mintingStatus !== 'error'}
//                             className={`control-btn control-btn-mint ${mintingStatus !== 'idle' && mintingStatus !== 'error' ? 'disabled' : ''}`}
//                         >
//                             {mintingStatus === 'idle' && (
//                                 learnerData.ipfsHash
//                                     ? "🔗 Finalize Securement"
//                                     : "🚀 Issue to Blockchain"
//                             )}
//                             {mintingStatus === 'generating_pdf' && "📄 Generating..."}
//                             {mintingStatus === 'uploading_ipfs' && "☁️ Uploading to IPFS..."}
//                             {mintingStatus === 'signing_wallet' && "🦊 Sign in MetaMask..."}
//                             {mintingStatus === 'error' && "⚠️ Retry Issuance"}
//                         </button>
//                     )}

//                 {learnerData.isBlockchainVerified && (
//                     <div className="control-badge-verified">
//                         ✅ Secured on-chain
//                     </div>
//                 )}
//             </div>

//             {/* METAMASK INSTALLATION MODAL */}
//             {showMetaMaskPrompt && (
//                 <div className="mm-modal-overlay">
//                     <div className="mm-modal">
//                         <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" alt="MetaMask" />
//                         <h2>MetaMask Required</h2>
//                         <p>To issue secure, tamper-proof credentials to the blockchain, you need to install the MetaMask browser extension.</p>
//                         <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer" className="mm-btn">Download MetaMask</a>
//                         <button onClick={() => setShowMetaMaskPrompt(false)} className="mm-btn-cancel">Cancel</button>
//                     </div>
//                 </div>
//             )}
//         </div>
//     );
// };

// const AssessmentCategory: React.FC<{ title: string, totalCredits: number, modules: SoRModule[], dateLabel: string, getStatusClass: (s: string) => string }> = ({ title, totalCredits, modules, dateLabel, getStatusClass }) => {
//     if (modules.length === 0) return null;
//     return (
//         <div className="assessment-category page-break-avoid">
//             <div className="category-header">
//                 <span>{title}</span>
//                 <span className="category-badge">{totalCredits} Credits</span>
//             </div>
//             <table className="assessment-table">
//                 <thead>
//                     <tr>
//                         <th style={{ width: '50%' }}>Module Name</th>
//                         <th>Credits</th>
//                         <th>{dateLabel}</th>
//                         <th>Achievement</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {modules.map((module, index) => (
//                         <tr key={index}>
//                             <td className="module-name">{module.name}</td>
//                             <td><span className="credits-badge">{module.credits}</span></td>
//                             <td style={{ color: '#334155', fontWeight: 500 }}>{'dateAssessed' in module ? module.dateAssessed : module.dateSignedOff}</td>
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