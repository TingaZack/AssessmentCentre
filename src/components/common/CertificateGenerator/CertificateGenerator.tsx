// src/components/common/CertificateGenerator/CertificateGenerator.tsx

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Award, Loader2, ChevronDown, Download, FileCheck, Hexagon,
    ZoomIn, ZoomOut, RotateCcw, ShieldCheck, Edit3, User, Building
} from 'lucide-react';
import { doc, updateDoc, arrayUnion, setDoc, serverTimestamp } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { buildAccreditationRegistry, type AccreditationSpec } from '../../../types/accreditation.types';
import './CertificateGenerator.css';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import zackSignature from '../../../assets/Signatue_Zack_.png';

interface CertificateGeneratorProps {
    learner: {
        id: string;
        idNumber: string;
        fullName: string;
        email?: string;
        accreditationBody?: string;
        qualification?: {
            name: string;
            nqfLevel?: string | number;
            credits?: string | number;
            saqaId?: string;
        };
    };
    onClose: () => void;
}

interface CertificateTypeOption {
    value: string;
    label: string;
    description: string;
}

const CERTIFICATE_TYPES: CertificateTypeOption[] = [
    {
        value: 'Competence',
        label: 'Certificate of Competence',
        description: 'has demonstrated competence and mastered all prescribed learning outcomes for'
    },
    {
        value: 'Completion',
        label: 'Certificate of Completion',
        description: 'has successfully completed all requirements and modules for'
    },
    {
        value: 'Attendance',
        label: 'Certificate of Attendance',
        description: 'has successfully attended and actively participated in'
    },
    {
        value: 'Achievement',
        label: 'Certificate of Achievement',
        description: 'has achieved outstanding academic performance in'
    }
];

export const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({ learner, onClose }) => {
    const { settings } = useStore();
    const accreditationRegistry = buildAccreditationRegistry(settings?.accreditationBodies);

    // Default Accreditation selection
    const defaultAccreditationKey = learner.accreditationBody || Object.keys(accreditationRegistry)[0] || 'qcto';
    const initialSpec: AccreditationSpec = accreditationRegistry[defaultAccreditationKey] || Object.values(accreditationRegistry)[0];

    // Editable State
    const [accreditationKey, setAccreditationKey] = useState<string>(defaultAccreditationKey);
    const [recipientName, setRecipientName] = useState<string>(learner.fullName || '');
    const [courseName, setCourseName] = useState<string>(learner.qualification?.name || 'Assigned Programme');
    const [certType, setCertType] = useState<string>('Competence');
    const [customType, setCustomType] = useState<string>('');
    const [customDescription, setCustomDescription] = useState<string>('');

    // Signatory & Accreditation overrides
    const [signatoryName, setSignatoryName] = useState<string>(initialSpec?.defaultSignatoryName || 'Zakhele Tinga');
    const [signatoryTitle, setSignatoryTitle] = useState<string>(initialSpec?.defaultSignatoryTitle || 'Academic Manager');
    const [issuerName, setIssuerName] = useState<string>(initialSpec?.issuerName || settings?.institutionName || 'mLab Southern Africa');

    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('settings');
    const [zoom, setZoom] = useState(0.65);

    const certRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update signatory defaults when Accreditation Body changes
    useEffect(() => {
        const spec = accreditationRegistry[accreditationKey];
        if (spec) {
            setSignatoryName(spec.defaultSignatoryName || '');
            setSignatoryTitle(spec.defaultSignatoryTitle || '');
            setIssuerName(spec.issuerName || settings?.institutionName || 'mLab Southern Africa');
        }
    }, [accreditationKey]);

    const selectedAccreditationSpec = accreditationRegistry[accreditationKey] || initialSpec;
    const selectedCertType = CERTIFICATE_TYPES.find(c => c.value === certType) || CERTIFICATE_TYPES[0];

    const finalCertType = certType === 'Other' ? (customType || 'Custom Certificate') : selectedCertType.label.replace('Certificate of ', '');
    const finalDescription = certType === 'Other'
        ? (customDescription || 'has successfully met all assessment requirements for')
        : selectedCertType.description;

    const logoUrl = selectedAccreditationSpec?.logoUrl || settings?.logoUrl || mLabLogo;
    const sigUrl = settings?.signatureUrl || zackSignature;

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
    const handleResetZoom = () => setZoom(0.65);

    const handleGenerate = useCallback(async () => {
        if (!certRef.current) return;

        if (certType === 'Other' && !customType.trim()) {
            alert('Please enter a custom certificate title.');
            return;
        }

        setIsGenerating(true);

        try {
            const currentZoom = zoom;
            setZoom(1);

            await new Promise(resolve => setTimeout(resolve, 150));

            const canvas = await html2canvas(certRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                width: 1123,
                height: 794
            });

            setZoom(currentZoom);

            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            const imgData = canvas.toDataURL('image/jpeg', 1.0);
            pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);

            const safeType = finalCertType.replace(/[^a-zA-Z0-9]/g, '_');
            const timestamp = Date.now();
            const fileName = `Certificate_${safeType}_${learner.idNumber}_${timestamp}.pdf`;
            const pdfBlob = pdf.output('blob');

            const storage = getStorage();
            const storageRef = ref(storage, `certificates/${learner.id}/${fileName}`);
            await uploadBytes(storageRef, pdfBlob);
            const downloadUrl = await getDownloadURL(storageRef);

            const certRecord = {
                id: `cert_${timestamp}`,
                recipientName,
                recipientEmail: learner.email || '',
                type: finalCertType,
                courseName,
                accreditationBodyKey: accreditationKey,
                issuerName,
                saqaQualificationId: learner.qualification?.saqaId || selectedAccreditationSpec?.saqaQualificationId || '',
                signatoryName,
                signatoryTitle,
                issueDate: new Date().toISOString(),
                pdfUrl: downloadUrl,
                createdAt: serverTimestamp()
            };

            // 1. Write to centralized issued_certificates collection
            await setDoc(doc(db, 'issued_certificates', certRecord.id), certRecord);

            // 2. Append to learner's personal record array
            await updateDoc(doc(db, 'learners', learner.id), {
                certificates: arrayUnion(certRecord),
            });

            alert(`${finalCertType} Certificate issued and stored successfully!`);
            onClose();
        } catch (error) {
            console.error('Certificate generation failed:', error);
            alert('Failed to generate and store certificate. Please check database permissions.');
            setIsGenerating(false);
        }
    }, [certRef, certType, customType, finalCertType, recipientName, courseName, accreditationKey, issuerName, signatoryName, signatoryTitle, learner, selectedAccreditationSpec, onClose, zoom]);

    const issueDateFormatted = new Date().toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const certNumber = `REF-${accreditationKey.toUpperCase()}-${learner.idNumber}-${new Date().getFullYear()}`;

    return createPortal(
        <div className="cert-overlay">
            <div className="cert-modal">
                {/* Modal Header */}
                <div className="cert-modal__header">
                    <div className="cert-modal__brand">
                        <div className="cert-modal__brand-icon">
                            <Hexagon size={32} strokeWidth={2.5} />
                            <Award size={16} className="cert-modal__brand-logo" />
                        </div>
                        <div className="cert-modal__brand-text">
                            <h2>Certificate Studio & Editor</h2>
                            <p>Customize wording, signatories, and accreditation parameters before issuance.</p>
                        </div>
                    </div>
                    <button
                        className="cert-modal__close"
                        onClick={onClose}
                        disabled={isGenerating}
                        aria-label="Close modal"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Workspace Body */}
                <div className="cert-modal__body">
                    {/* Controls Sidebar */}
                    <div className="cert-controls">
                        <div className="cert-controls__tabs">
                            <button
                                className={`cert-controls__tab ${activeTab === 'settings' ? 'active' : ''}`}
                                onClick={() => setActiveTab('settings')}
                            >
                                <Edit3 size={14} /> Configure
                            </button>
                            <button
                                className={`cert-controls__tab ${activeTab === 'preview' ? 'active' : ''}`}
                                onClick={() => setActiveTab('preview')}
                            >
                                <Award size={14} /> Preview
                            </button>
                        </div>

                        <div className={`cert-controls__content ${activeTab === 'settings' ? 'active' : ''}`}>

                            {/* RECIPIENT & COURSE DETAILS */}
                            <div className="cert-control-group">
                                <label className="cert-control-label">
                                    <User size={14} />
                                    Recipient Name
                                </label>
                                <input
                                    type="text"
                                    className="cert-input"
                                    value={recipientName}
                                    onChange={e => setRecipientName(e.target.value)}
                                    disabled={isGenerating}
                                />
                            </div>

                            <div className="cert-control-group">
                                <label className="cert-control-label">
                                    <Building size={14} />
                                    Programme / Qualification Title
                                </label>
                                <input
                                    type="text"
                                    className="cert-input"
                                    value={courseName}
                                    onChange={e => setCourseName(e.target.value)}
                                    disabled={isGenerating}
                                />
                            </div>

                            {/* ACCREDITATION BODY SELECTION */}
                            <div className="cert-control-group">
                                <label className="cert-control-label">
                                    <ShieldCheck size={14} />
                                    Accreditation Endorsement Body
                                </label>
                                <div className="cert-select-wrapper">
                                    <select
                                        value={accreditationKey}
                                        onChange={e => setAccreditationKey(e.target.value)}
                                        disabled={isGenerating}
                                        className="cert-select"
                                    >
                                        {Object.values(accreditationRegistry).map(spec => (
                                            <option key={spec.id} value={spec.id}>{spec.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={16} className="cert-select-icon" />
                                </div>
                            </div>

                            {/* CERTIFICATE TYPE */}
                            <div className="cert-control-group">
                                <label className="cert-control-label">
                                    <FileCheck size={14} />
                                    Certificate Classification
                                </label>
                                <div className="cert-select-wrapper">
                                    <select
                                        value={certType}
                                        onChange={e => setCertType(e.target.value)}
                                        disabled={isGenerating}
                                        className="cert-select"
                                    >
                                        {CERTIFICATE_TYPES.map(type => (
                                            <option key={type.value} value={type.value}>{type.label}</option>
                                        ))}
                                        <option value="Other">Custom Certificate Type</option>
                                    </select>
                                    <ChevronDown size={16} className="cert-select-icon" />
                                </div>
                            </div>

                            {certType === 'Other' && (
                                <div className="cert-custom-fields animate-fade-in">
                                    <div className="cert-control-group">
                                        <label className="cert-control-label">
                                            Custom Title <span className="required">*</span>
                                        </label>
                                        <input
                                            type="text"
                                            className="cert-input"
                                            placeholder="e.g., Excellence in Software Engineering"
                                            value={customType}
                                            onChange={e => setCustomType(e.target.value)}
                                            disabled={isGenerating}
                                        />
                                    </div>
                                    <div className="cert-control-group">
                                        <label className="cert-control-label">Description Wording</label>
                                        <textarea
                                            className="cert-textarea"
                                            placeholder="has demonstrated exceptional skills in..."
                                            value={customDescription}
                                            onChange={e => setCustomDescription(e.target.value)}
                                            disabled={isGenerating}
                                            rows={3}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* SIGNATORY OVERRIDES */}
                            <div className="cert-control-group grid grid-cols-2 gap-2">
                                <div>
                                    <label className="cert-control-label">Signatory Name</label>
                                    <input
                                        type="text"
                                        className="cert-input"
                                        value={signatoryName}
                                        onChange={e => setSignatoryName(e.target.value)}
                                        disabled={isGenerating}
                                    />
                                </div>
                                <div>
                                    <label className="cert-control-label">Signatory Title</label>
                                    <input
                                        type="text"
                                        className="cert-input"
                                        value={signatoryTitle}
                                        onChange={e => setSignatoryTitle(e.target.value)}
                                        disabled={isGenerating}
                                    />
                                </div>
                            </div>

                            {/* METADATA SUMMARY CARD */}
                            <div className="cert-info-card">
                                <div className="cert-info-item">
                                    <span className="cert-info-label">Issuer</span>
                                    <span className="cert-info-value">{issuerName}</span>
                                </div>
                                <div className="cert-info-item">
                                    <span className="cert-info-label">ID Anchor</span>
                                    <span className="cert-info-value">{learner.idNumber}</span>
                                </div>
                                <div className="cert-info-item">
                                    <span className="cert-info-label">Reference</span>
                                    <span className="cert-info-value mono">{certNumber}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Canvas Preview Area */}
                    <div className="cert-preview-container" ref={containerRef}>
                        <div className="cert-zoom-controls">
                            <button onClick={handleZoomOut} className="cert-zoom-btn" title="Zoom Out">
                                <ZoomOut size={18} />
                            </button>
                            <span className="cert-zoom-level">{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} className="cert-zoom-btn" title="Zoom In">
                                <ZoomIn size={18} />
                            </button>
                            <button onClick={handleResetZoom} className="cert-zoom-btn" title="Reset Zoom">
                                <RotateCcw size={18} />
                            </button>
                        </div>

                        <div className="cert-canvas-wrapper">
                            <div
                                className="cert-canvas"
                                ref={certRef}
                                style={{
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'center center'
                                }}
                            >
                                {/* Background Pattern Layer */}
                                <div className="cert-bg-luxury">
                                    <div className="cert-pattern-grid" />
                                    <div className="cert-pattern-hex" />
                                    <div className="cert-gradient-overlay" />
                                </div>

                                {/* Main Certificate Frame */}
                                <div className="cert-main">
                                    {/* Top Border Accent */}
                                    <div className="cert-top-accent">
                                        <div className="cert-accent-line green" />
                                        <div className="cert-accent-line blue" />
                                    </div>

                                    {/* Header Section */}
                                    <header className="cert-header">
                                        <div className="cert-logo-container">
                                            <img src={logoUrl} crossOrigin="anonymous" alt="Accreditation Logo" className="cert-logo" />
                                        </div>
                                        <div className="cert-institution">
                                            <h3>{issuerName}</h3>
                                            <div className="cert-divider-diamond">
                                                <span className="diamond" />
                                            </div>
                                        </div>
                                    </header>

                                    {/* Body Wording Section */}
                                    <main className="cert-content">
                                        <div className="cert-pretitle">This is to officially certify that</div>

                                        <h1 className="cert-recipient-name">{recipientName}</h1>

                                        <div className="cert-description">
                                            {finalDescription}
                                        </div>

                                        <div className="cert-programme-name">
                                            {courseName}
                                        </div>

                                        {(learner.qualification?.nqfLevel || learner.qualification?.credits || selectedAccreditationSpec?.saqaQualificationId) && (
                                            <div className="cert-meta">
                                                {learner.qualification?.nqfLevel && (
                                                    <span className="cert-meta-item">NQF Level {learner.qualification.nqfLevel}</span>
                                                )}
                                                {learner.qualification?.nqfLevel && learner.qualification?.credits && (
                                                    <span className="cert-meta-dot" />
                                                )}
                                                {learner.qualification?.credits && (
                                                    <span className="cert-meta-item">{learner.qualification.credits} Credits</span>
                                                )}
                                                {(selectedAccreditationSpec?.saqaQualificationId || learner.qualification?.saqaId) && (
                                                    <>
                                                        <span className="cert-meta-dot" />
                                                        <span className="cert-meta-item">SAQA ID: {learner.qualification?.saqaId || selectedAccreditationSpec?.saqaQualificationId}</span>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        <div className="cert-type-badge">
                                            <span className="cert-type-text">Certificate of</span>
                                            <span className="cert-type-value">{finalCertType}</span>
                                        </div>
                                    </main>

                                    {/* Footer Signatures & Official Seal */}
                                    <footer className="cert-footer-new">
                                        <div className="cert-signature-block">
                                            <div className="cert-signature-image-container">
                                                <img src={sigUrl} alt="Signature" crossOrigin="anonymous" className="cert-signature-img" />
                                            </div>
                                            <div className="cert-signature-line" />
                                            <div className="cert-signature-name">{signatoryName}</div>
                                            <div className="cert-signature-title">{signatoryTitle}</div>
                                        </div>

                                        <div className="cert-seal-container">
                                            <div className="cert-seal-ring">
                                                <div className="cert-seal-inner">
                                                    <Hexagon size={40} strokeWidth={3} className="cert-seal-icon" />
                                                    <span className="cert-seal-text">ACCREDITED</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="cert-date-block">
                                            <div className="cert-date-value">{issueDateFormatted}</div>
                                            <div className="cert-signature-line" />
                                            <div className="cert-date-label">Date of Issue</div>
                                            <div className="cert-cert-number">{certNumber}</div>
                                        </div>
                                    </footer>

                                    <div className="cert-bottom-accent" />
                                </div>

                                {/* Frame Corners */}
                                <div className="cert-corner top-left" />
                                <div className="cert-corner top-right" />
                                <div className="cert-corner bottom-left" />
                                <div className="cert-corner bottom-right" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Bar Footer */}
                <div className="cert-modal__footer">
                    <button
                        className="cert-btn cert-btn--secondary"
                        onClick={onClose}
                        disabled={isGenerating}
                    >
                        Cancel
                    </button>
                    <button
                        className="cert-btn cert-btn--primary"
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="spin" size={18} />
                                <span>Generating & Storing PDF...</span>
                            </>
                        ) : (
                            <>
                                <Download size={18} />
                                <span>Issue & Store Certificate</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// // src/components/certificates/CertificateGeneratorModal.tsx

// import React from 'react';
// import { X, Award, CheckCircle2 } from 'lucide-react';
// import { useCertificateData } from '../../../services/useCertificateData';
// import { issueCertificate } from '../../../services/certificateService';

// interface CertificateGeneratorModalProps {
//     isOpen: boolean;
//     onClose: () => void;
//     learner: any;
//     container?: any;
// }

// export const CertificateGeneratorModal: React.FC<CertificateGeneratorModalProps> = ({
//     isOpen,
//     onClose,
//     learner,
//     container
// }) => {
//     const { payload, setPayload, registry } = useCertificateData(learner, container);
//     const [isIssuing, setIsIssuing] = React.useState(false);
//     const [issuedSuccess, setIsIssuedSuccess] = React.useState(false);

//     if (!isOpen) return null;

//     const handleIssue = async () => {
//         setIsIssuing(true);
//         try {
//             await issueCertificate(payload, 'official');
//             setIsIssuedSuccess(true);
//             setTimeout(() => {
//                 setIsIssuedSuccess(false);
//                 onClose();
//             }, 1500);
//         } catch (error) {
//             console.error("Failed to issue certificate:", error);
//             alert("Error issuing certificate. Please check database permissions.");
//         } finally {
//             setIsIssuing(false);
//         }
//     };

//     return (
//         <div className="lfm-overlay" onClick={onClose}>
//             <div className="lfm-modal max-w-2xl" onClick={e => e.stopPropagation()}>
//                 <div className="lfm-header">
//                     <h3 className="lfm-header__title flex items-center gap-2">
//                         <Award size={18} /> Issue Accredited Certificate
//                     </h3>
//                     <button className="lfm-close-btn" onClick={onClose}><X size={18} /></button>
//                 </div>

//                 <div className="lfm-body">
//                     {issuedSuccess ? (
//                         <div className="text-center py-8">
//                             <CheckCircle2 size={48} className="text-green-500 mx-auto mb-2" />
//                             <h4 className="text-lg font-bold text-slate-800">Certificate Issued Successfully!</h4>
//                         </div>
//                     ) : (
//                         <div className="space-y-4">
//                             <div>
//                                 <label className="block text-xs font-bold text-slate-700 mb-1">Recipient Name</label>
//                                 <input
//                                     type="text"
//                                     className="mlab-input"
//                                     value={payload.recipientName}
//                                     onChange={e => setPayload({ ...payload, recipientName: e.target.value })}
//                                 />
//                             </div>

//                             <div>
//                                 <label className="block text-xs font-bold text-slate-700 mb-1">Programme / Qualification</label>
//                                 <input
//                                     type="text"
//                                     className="mlab-input"
//                                     value={payload.courseName}
//                                     onChange={e => setPayload({ ...payload, courseName: e.target.value })}
//                                 />
//                             </div>

//                             <div>
//                                 <label className="block text-xs font-bold text-slate-700 mb-1">Accreditation Endorsement</label>
//                                 <select
//                                     className="mlab-input"
//                                     value={payload.accreditationKey}
//                                     onChange={e => {
//                                         const key = e.target.value;
//                                         const spec = registry[key];
//                                         setPayload({
//                                             ...payload,
//                                             accreditationKey: key,
//                                             spec,
//                                             signatoryName: spec?.defaultSignatoryName || payload.signatoryName,
//                                             signatoryTitle: spec?.defaultSignatoryTitle || payload.signatoryTitle,
//                                             logoUrl: spec?.logoUrl || payload.logoUrl
//                                         });
//                                     }}
//                                 >
//                                     {Object.values(registry).map(spec => (
//                                         <option key={spec.id} value={spec.id}>{spec.label}</option>
//                                     ))}
//                                 </select>
//                             </div>

//                             <div className="grid grid-cols-2 gap-4">
//                                 <div>
//                                     <label className="block text-xs font-bold text-slate-700 mb-1">Signatory Name</label>
//                                     <input
//                                         type="text"
//                                         className="mlab-input"
//                                         value={payload.signatoryName}
//                                         onChange={e => setPayload({ ...payload, signatoryName: e.target.value })}
//                                     />
//                                 </div>
//                                 <div>
//                                     <label className="block text-xs font-bold text-slate-700 mb-1">Signatory Title</label>
//                                     <input
//                                         type="text"
//                                         className="mlab-input"
//                                         value={payload.signatoryTitle}
//                                         onChange={e => setPayload({ ...payload, signatoryTitle: e.target.value })}
//                                     />
//                                 </div>
//                             </div>
//                         </div>
//                     )}
//                 </div>

//                 <div className="lfm-footer">
//                     <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>Cancel</button>
//                     <button className="mlab-btn mlab-btn--primary" onClick={handleIssue} disabled={isIssuing || issuedSuccess}>
//                         {isIssuing ? 'Issuing...' : 'Generate & Store Certificate'}
//                     </button>
//                 </div>
//             </div>
//         </div>
//     );
// };



// // // src/components/common/CertificateGenerator/CertificateGenerator.tsx

// // import React, { useState, useRef, useCallback } from 'react';
// // import { createPortal } from 'react-dom';
// // import { X, Award, Loader2, ChevronDown, Download, FileCheck, Hexagon, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
// // import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
// // import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// // import html2canvas from 'html2canvas';
// // import jsPDF from 'jspdf';
// // import { db } from '../../../lib/firebase';
// // import { useStore } from '../../../store/useStore';
// // import { useToast } from '../Toast/Toast';
// // import './CertificateGenerator.css';

// // import mLabLogo from '../../../assets/logo/mlab_logo.png';
// // import zackSignature from '../../../assets/Signatue_Zack_.png';

// // // nqfLevel and credits now accept string OR number
// // interface CertificateGeneratorProps {
// //     learner: {
// //         id: string;
// //         idNumber: string;
// //         fullName: string;
// //         qualification?: {
// //             name: string;
// //             nqfLevel?: string | number;
// //             credits?: string | number;
// //         };
// //     };
// //     onClose: () => void;
// // }

// // interface CertificateType {
// //     value: string;
// //     label: string;
// //     description: string;
// // }

// // const CERTIFICATE_TYPES: CertificateType[] = [
// //     {
// //         value: 'Competence',
// //         label: 'Certificate of Competence',
// //         description: 'has demonstrated competence and mastered all requirements for'
// //     },
// //     {
// //         value: 'Completion',
// //         label: 'Certificate of Completion',
// //         description: 'has successfully completed all requirements for'
// //     },
// //     {
// //         value: 'Attendance',
// //         label: 'Certificate of Attendance',
// //         description: 'has successfully attended and participated in'
// //     },
// //     {
// //         value: 'Achievement',
// //         label: 'Certificate of Achievement',
// //         description: 'has achieved outstanding performance in'
// //     }
// // ];

// // export const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({ learner, onClose }) => {
// //     const { settings } = useStore();
// //     const toast = useToast();

// //     const [certType, setCertType] = useState('Competence');
// //     const [customType, setCustomType] = useState('');
// //     const [customDescription, setCustomDescription] = useState('');
// //     const [isGenerating, setIsGenerating] = useState(false);
// //     const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
// //     const [zoom, setZoom] = useState(0.65); // Default zoom to fit most screens

// //     const certRef = useRef<HTMLDivElement>(null);
// //     const containerRef = useRef<HTMLDivElement>(null);

// //     // White-label settings with fallbacks
// //     const institutionName = settings?.institutionName || "mLab Southern Africa";
// //     const logoUrl = mLabLogo;
// //     const sigUrl = (settings as any)?.signatureUrl || zackSignature;
// //     const signatoryName = (settings as any)?.signatoryName || 'Zakhele Tinga';
// //     const signatoryTitle = (settings as any)?.signatoryTitle || 'Academic Manager';

// //     const selectedCertType = CERTIFICATE_TYPES.find(c => c.value === certType) || CERTIFICATE_TYPES[0];

// //     const finalCertType = certType === 'Other' ? (customType || 'Custom') : selectedCertType.label.replace('Certificate of ', '');
// //     const finalDescription = certType === 'Other'
// //         ? (customDescription || 'has successfully met the requirements for')
// //         : selectedCertType.description;

// //     const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
// //     const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
// //     const handleResetZoom = () => setZoom(0.65);

// //     const handleGenerate = useCallback(async () => {
// //         if (!certRef.current) return;

// //         if (certType === 'Other' && !customType.trim()) {
// //             toast.error('Please enter a custom certificate title');
// //             return;
// //         }

// //         setIsGenerating(true);
// //         toast.info('Generating secure certificate…');

// //         try {
// //             // Store current zoom and reset to 1 for capture
// //             const currentZoom = zoom;
// //             setZoom(1);

// //             // Wait for render
// //             await new Promise(resolve => setTimeout(resolve, 100));

// //             const canvas = await html2canvas(certRef.current, {
// //                 scale: 2,
// //                 useCORS: true,
// //                 logging: false,
// //                 backgroundColor: '#ffffff',
// //                 imageTimeout: 0,
// //                 width: 1123,
// //                 height: 794
// //             });

// //             // Restore zoom
// //             setZoom(currentZoom);

// //             const pdf = new jsPDF({
// //                 orientation: 'landscape',
// //                 unit: 'mm',
// //                 format: 'a4',
// //                 compress: true
// //             });

// //             const imgData = canvas.toDataURL('image/jpeg', 1.0);
// //             pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);

// //             const safeType = finalCertType.replace(/[^a-zA-Z0-9]/g, '_');
// //             const fileName = `Certificate_${safeType}_${learner.idNumber}_${Date.now()}.pdf`;
// //             const pdfBlob = pdf.output('blob');

// //             const storage = getStorage();
// //             const storageRef = ref(storage, `certificates/${learner.id}/${fileName}`);
// //             await uploadBytes(storageRef, pdfBlob);
// //             const downloadUrl = await getDownloadURL(storageRef);

// //             await updateDoc(doc(db, 'learners', learner.id), {
// //                 certificates: arrayUnion({
// //                     id: Date.now().toString(),
// //                     type: finalCertType,
// //                     courseName: learner.qualification?.name || 'Assigned Programme',
// //                     issueDate: new Date().toISOString(),
// //                     pdfUrl: downloadUrl,
// //                 }),
// //             });

// //             toast.success(`${finalCertType} Certificate issued successfully`);
// //             onClose();
// //         } catch (error) {
// //             console.error('Certificate generation failed:', error);
// //             toast.error('Failed to generate certificate. Please try again.');
// //             setIsGenerating(false);
// //         }
// //     }, [certRef, certType, customType, finalCertType, learner, toast, onClose, zoom]);

// //     const issueDate = new Date().toLocaleDateString('en-ZA', {
// //         year: 'numeric',
// //         month: 'long',
// //         day: 'numeric'
// //     });

// //     const certNumber = `MLAB-${learner.idNumber}-${new Date().getFullYear()}`;

// //     return createPortal(
// //         <div className="cert-overlay">
// //             <div className="cert-modal">
// //                 {/* Header */}
// //                 <div className="cert-modal__header">
// //                     <div className="cert-modal__brand">
// //                         <div className="cert-modal__brand-icon">
// //                             <Hexagon size={32} strokeWidth={2.5} />
// //                             <Award size={16} className="cert-modal__brand-logo" />
// //                         </div>
// //                         <div className="cert-modal__brand-text">
// //                             <h2>Certificate Studio</h2>
// //                             <p>Issue official mLab credentials</p>
// //                         </div>
// //                     </div>
// //                     <button
// //                         className="cert-modal__close"
// //                         onClick={onClose}
// //                         disabled={isGenerating}
// //                         aria-label="Close modal"
// //                     >
// //                         <X size={24} />
// //                     </button>
// //                 </div>



// //                 {/* Body */}
// //                 <div className="cert-modal__body">
// //                     {/* Controls Sidebar */}
// //                     <div className="cert-controls">
// //                         <div className="cert-controls__tabs">
// //                             <button
// //                                 className={`cert-controls__tab ${activeTab === 'preview' ? 'active' : ''}`}
// //                                 onClick={() => setActiveTab('preview')}
// //                             >
// //                                 Preview
// //                             </button>
// //                             <button
// //                                 className={`cert-controls__tab ${activeTab === 'settings' ? 'active' : ''}`}
// //                                 onClick={() => setActiveTab('settings')}
// //                             >
// //                                 Configure
// //                             </button>
// //                         </div>

// //                         <div className={`cert-controls__content ${activeTab === 'settings' ? 'active' : ''}`}>
// //                             <div className="cert-control-group">
// //                                 <label className="cert-control-label">
// //                                     <FileCheck size={14} />
// //                                     Certificate Type
// //                                 </label>
// //                                 <div className="cert-select-wrapper">
// //                                     <select
// //                                         value={certType}
// //                                         onChange={e => setCertType(e.target.value)}
// //                                         disabled={isGenerating}
// //                                         className="cert-select"
// //                                     >
// //                                         {CERTIFICATE_TYPES.map(type => (
// //                                             <option key={type.value} value={type.value}>{type.label}</option>
// //                                         ))}
// //                                         <option value="Other">Other (Custom)</option>
// //                                     </select>
// //                                     <ChevronDown size={16} className="cert-select-icon" />
// //                                 </div>
// //                             </div>

// //                             {certType === 'Other' && (
// //                                 <div className="cert-custom-fields animate-fade-in">
// //                                     <div className="cert-control-group">
// //                                         <label className="cert-control-label">
// //                                             Custom Title <span className="required">*</span>
// //                                         </label>
// //                                         <input
// //                                             type="text"
// //                                             className="cert-input"
// //                                             placeholder="e.g., Excellence in Innovation"
// //                                             value={customType}
// //                                             onChange={e => setCustomType(e.target.value)}
// //                                             disabled={isGenerating}
// //                                         />
// //                                     </div>
// //                                     <div className="cert-control-group">
// //                                         <label className="cert-control-label">Description Text</label>
// //                                         <textarea
// //                                             className="cert-textarea"
// //                                             placeholder="has demonstrated exceptional skills in..."
// //                                             value={customDescription}
// //                                             onChange={e => setCustomDescription(e.target.value)}
// //                                             disabled={isGenerating}
// //                                             rows={3}
// //                                         />
// //                                     </div>
// //                                 </div>
// //                             )}

// //                             <div className="cert-info-card">
// //                                 <div className="cert-info-item">
// //                                     <span className="cert-info-label">Recipient</span>
// //                                     <span className="cert-info-value">{learner.fullName}</span>
// //                                 </div>
// //                                 <div className="cert-info-item">
// //                                     <span className="cert-info-label">Programme</span>
// //                                     <span className="cert-info-value">{learner.qualification?.name || 'N/A'}</span>
// //                                 </div>
// //                                 <div className="cert-info-item">
// //                                     <span className="cert-info-label">Cert Number</span>
// //                                     <span className="cert-info-value mono">{certNumber}</span>
// //                                 </div>
// //                             </div>
// //                         </div>
// //                     </div>

// //                     {/* Preview Area */}
// //                     <div className="cert-preview-container" ref={containerRef}>
// //                         <div className="cert-zoom-controls">
// //                             <button onClick={handleZoomOut} className="cert-zoom-btn" title="Zoom Out">
// //                                 <ZoomOut size={18} />
// //                             </button>
// //                             <span className="cert-zoom-level">{Math.round(zoom * 100)}%</span>
// //                             <button onClick={handleZoomIn} className="cert-zoom-btn" title="Zoom In">
// //                                 <ZoomIn size={18} style={{ color: 'red' }} color='red' />
// //                             </button>
// //                             <button onClick={handleResetZoom} className="cert-zoom-btn" title="Reset Zoom">
// //                                 <RotateCcw size={18} />
// //                             </button>
// //                         </div>

// //                         <div className="cert-canvas-wrapper">
// //                             <div
// //                                 className="cert-canvas"
// //                                 ref={certRef}
// //                                 style={{
// //                                     transform: `scale(${zoom})`,
// //                                     transformOrigin: 'center center'
// //                                 }}
// //                             >
// //                                 {/* Background Pattern */}
// //                                 <div className="cert-bg-luxury">
// //                                     <div className="cert-pattern-grid" />
// //                                     <div className="cert-pattern-hex" />
// //                                     <div className="cert-gradient-overlay" />
// //                                 </div>

// //                                 {/* Main Container - Fixed dimensions to ensure borders show */}
// //                                 <div className="cert-main">
// //                                     {/* Top Border Accent */}
// //                                     <div className="cert-top-accent">
// //                                         <div className="cert-accent-line green" />
// //                                         <div className="cert-accent-line blue" />
// //                                     </div>

// //                                     {/* Header */}
// //                                     <header className="cert-header">
// //                                         <div className="cert-logo-container">
// //                                             <img src={logoUrl} crossOrigin="anonymous" alt="Institution Logo" className="cert-logo" />
// //                                         </div>
// //                                         <div className="cert-institution">
// //                                             <h3>{institutionName}</h3>
// //                                             <div className="cert-divider-diamond">
// //                                                 <span className="diamond" />
// //                                             </div>
// //                                         </div>
// //                                     </header>

// //                                     {/* Content - Centered */}
// //                                     <main className="cert-content">
// //                                         <div className="cert-pretitle">This is to certify that</div>

// //                                         <h1 className="cert-recipient-name">{learner.fullName}</h1>

// //                                         <div className="cert-description">
// //                                             {finalDescription}
// //                                         </div>

// //                                         <div className="cert-programme-name">
// //                                             {learner.qualification?.name || 'Assigned Programme'}
// //                                         </div>

// //                                         {(learner.qualification?.nqfLevel || learner.qualification?.credits) && (
// //                                             <div className="cert-meta">
// //                                                 {learner.qualification?.nqfLevel && (
// //                                                     <span className="cert-meta-item">NQF Level {learner.qualification.nqfLevel}</span>
// //                                                 )}
// //                                                 {learner.qualification?.nqfLevel && learner.qualification?.credits && (
// //                                                     <span className="cert-meta-dot" />
// //                                                 )}
// //                                                 {learner.qualification?.credits && (
// //                                                     <span className="cert-meta-item">{learner.qualification.credits} Credits</span>
// //                                                 )}
// //                                             </div>
// //                                         )}

// //                                         <div className="cert-type-badge">
// //                                             <span className="cert-type-text">Certificate of</span>
// //                                             <span className="cert-type-value">{finalCertType}</span>
// //                                         </div>
// //                                     </main>

// //                                     {/* Footer - Ensure it's at bottom */}
// //                                     <footer className="cert-footer-new">
// //                                         <div className="cert-signature-block">
// //                                             <div className="cert-signature-image-container">
// //                                                 <img src={sigUrl} alt="Signature" crossOrigin="anonymous" className="cert-signature-img" />
// //                                             </div>
// //                                             <div className="cert-signature-line" />
// //                                             <div className="cert-signature-name">{signatoryName}</div>
// //                                             <div className="cert-signature-title">{signatoryTitle}</div>
// //                                         </div>

// //                                         <div className="cert-seal-container">
// //                                             <div className="cert-seal-ring">
// //                                                 <div className="cert-seal-inner">
// //                                                     <Hexagon size={40} strokeWidth={3} className="cert-seal-icon" />
// //                                                     <span className="cert-seal-text">OFFICIAL</span>
// //                                                 </div>
// //                                             </div>
// //                                         </div>

// //                                         <div className="cert-date-block">
// //                                             <div className="cert-date-value">{issueDate}</div>
// //                                             <div className="cert-signature-line" />
// //                                             <div className="cert-date-label">Date of Issue</div>
// //                                             <div className="cert-cert-number">Ref: {certNumber}</div>
// //                                         </div>
// //                                     </footer>

// //                                     {/* Bottom Border */}
// //                                     <div className="cert-bottom-accent" />
// //                                 </div>

// //                                 {/* Corner Decorations */}
// //                                 <div className="cert-corner top-left" />
// //                                 <div className="cert-corner top-right" />
// //                                 <div className="cert-corner bottom-left" />
// //                                 <div className="cert-corner bottom-right" />
// //                             </div>
// //                         </div>
// //                     </div>
// //                 </div>

// //                 {/* Footer */}
// //                 <div className="cert-modal__footer">
// //                     <button
// //                         className="cert-btn cert-btn--secondary"
// //                         onClick={onClose}
// //                         disabled={isGenerating}
// //                     >
// //                         Cancel
// //                     </button>
// //                     <button
// //                         className="cert-btn cert-btn--primary"
// //                         onClick={handleGenerate}
// //                         disabled={isGenerating}
// //                     >
// //                         {isGenerating ? (
// //                             <>
// //                                 <Loader2 className="spin" size={18} />
// //                                 <span>Generating PDF...</span>
// //                             </>
// //                         ) : (
// //                             <>
// //                                 <Download size={18} />
// //                                 <span>Issue Certificate</span>
// //                             </>
// //                         )}
// //                     </button>
// //                 </div>
// //             </div>
// //         </div>,
// //         document.body
// //     );
// // };
