// src/components/common/CertificateGenerator/CertificateGenerator.tsx


// src/components/common/CertificateGenerator/CertificateGenerator.tsx

import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Award, Loader2, ChevronDown, Download, FileCheck, Hexagon, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { db } from '../../../lib/firebase';
import { useStore } from '../../../store/useStore';
import { useToast } from '../Toast/Toast';
import './CertificateGenerator.css';

import mLabLogo from '../../../assets/logo/mlab_logo.png';
import zackSignature from '../../../assets/Signatue_Zack_.png';

// nqfLevel and credits now accept string OR number
interface CertificateGeneratorProps {
    learner: {
        id: string;
        idNumber: string;
        fullName: string;
        qualification?: {
            name: string;
            nqfLevel?: string | number;
            credits?: string | number;
        };
    };
    onClose: () => void;
}

interface CertificateType {
    value: string;
    label: string;
    description: string;
}

const CERTIFICATE_TYPES: CertificateType[] = [
    {
        value: 'Competence',
        label: 'Certificate of Competence',
        description: 'has demonstrated competence and mastered all requirements for'
    },
    {
        value: 'Completion',
        label: 'Certificate of Completion',
        description: 'has successfully completed all requirements for'
    },
    {
        value: 'Attendance',
        label: 'Certificate of Attendance',
        description: 'has successfully attended and participated in'
    },
    {
        value: 'Achievement',
        label: 'Certificate of Achievement',
        description: 'has achieved outstanding performance in'
    }
];

export const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({ learner, onClose }) => {
    const { settings } = useStore();
    const toast = useToast();

    const [certType, setCertType] = useState('Competence');
    const [customType, setCustomType] = useState('');
    const [customDescription, setCustomDescription] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
    const [zoom, setZoom] = useState(0.65); // Default zoom to fit most screens

    const certRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // White-label settings with fallbacks
    const institutionName = settings?.institutionName || "mLab Southern Africa";
    const logoUrl = mLabLogo;
    const sigUrl = (settings as any)?.signatureUrl || zackSignature;
    const signatoryName = (settings as any)?.signatoryName || 'Zakhele Tinga';
    const signatoryTitle = (settings as any)?.signatoryTitle || 'Academic Manager';

    const selectedCertType = CERTIFICATE_TYPES.find(c => c.value === certType) || CERTIFICATE_TYPES[0];

    const finalCertType = certType === 'Other' ? (customType || 'Custom') : selectedCertType.label.replace('Certificate of ', '');
    const finalDescription = certType === 'Other'
        ? (customDescription || 'has successfully met the requirements for')
        : selectedCertType.description;

    const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
    const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
    const handleResetZoom = () => setZoom(0.65);

    const handleGenerate = useCallback(async () => {
        if (!certRef.current) return;

        if (certType === 'Other' && !customType.trim()) {
            toast.error('Please enter a custom certificate title');
            return;
        }

        setIsGenerating(true);
        toast.info('Generating secure certificate…');

        try {
            // Store current zoom and reset to 1 for capture
            const currentZoom = zoom;
            setZoom(1);

            // Wait for render
            await new Promise(resolve => setTimeout(resolve, 100));

            const canvas = await html2canvas(certRef.current, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                imageTimeout: 0,
                width: 1123,
                height: 794
            });

            // Restore zoom
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
            const fileName = `Certificate_${safeType}_${learner.idNumber}_${Date.now()}.pdf`;
            const pdfBlob = pdf.output('blob');

            const storage = getStorage();
            const storageRef = ref(storage, `certificates/${learner.id}/${fileName}`);
            await uploadBytes(storageRef, pdfBlob);
            const downloadUrl = await getDownloadURL(storageRef);

            await updateDoc(doc(db, 'learners', learner.id), {
                certificates: arrayUnion({
                    id: Date.now().toString(),
                    type: finalCertType,
                    courseName: learner.qualification?.name || 'Assigned Programme',
                    issueDate: new Date().toISOString(),
                    pdfUrl: downloadUrl,
                }),
            });

            toast.success(`${finalCertType} Certificate issued successfully`);
            onClose();
        } catch (error) {
            console.error('Certificate generation failed:', error);
            toast.error('Failed to generate certificate. Please try again.');
            setIsGenerating(false);
        }
    }, [certRef, certType, customType, finalCertType, learner, toast, onClose, zoom]);

    const issueDate = new Date().toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const certNumber = `MLAB-${learner.idNumber}-${new Date().getFullYear()}`;

    return createPortal(
        <div className="cert-overlay">
            <div className="cert-modal">
                {/* Header */}
                <div className="cert-modal__header">
                    <div className="cert-modal__brand">
                        <div className="cert-modal__brand-icon">
                            <Hexagon size={32} strokeWidth={2.5} />
                            <Award size={16} className="cert-modal__brand-logo" />
                        </div>
                        <div className="cert-modal__brand-text">
                            <h2>Certificate Studio</h2>
                            <p>Issue official mLab credentials</p>
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



                {/* Body */}
                <div className="cert-modal__body">
                    {/* Controls Sidebar */}
                    <div className="cert-controls">
                        <div className="cert-controls__tabs">
                            <button
                                className={`cert-controls__tab ${activeTab === 'preview' ? 'active' : ''}`}
                                onClick={() => setActiveTab('preview')}
                            >
                                Preview
                            </button>
                            <button
                                className={`cert-controls__tab ${activeTab === 'settings' ? 'active' : ''}`}
                                onClick={() => setActiveTab('settings')}
                            >
                                Configure
                            </button>
                        </div>

                        <div className={`cert-controls__content ${activeTab === 'settings' ? 'active' : ''}`}>
                            <div className="cert-control-group">
                                <label className="cert-control-label">
                                    <FileCheck size={14} />
                                    Certificate Type
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
                                        <option value="Other">Other (Custom)</option>
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
                                            placeholder="e.g., Excellence in Innovation"
                                            value={customType}
                                            onChange={e => setCustomType(e.target.value)}
                                            disabled={isGenerating}
                                        />
                                    </div>
                                    <div className="cert-control-group">
                                        <label className="cert-control-label">Description Text</label>
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

                            <div className="cert-info-card">
                                <div className="cert-info-item">
                                    <span className="cert-info-label">Recipient</span>
                                    <span className="cert-info-value">{learner.fullName}</span>
                                </div>
                                <div className="cert-info-item">
                                    <span className="cert-info-label">Programme</span>
                                    <span className="cert-info-value">{learner.qualification?.name || 'N/A'}</span>
                                </div>
                                <div className="cert-info-item">
                                    <span className="cert-info-label">Cert Number</span>
                                    <span className="cert-info-value mono">{certNumber}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Preview Area */}
                    <div className="cert-preview-container" ref={containerRef}>
                        <div className="cert-zoom-controls">
                            <button onClick={handleZoomOut} className="cert-zoom-btn" title="Zoom Out">
                                <ZoomOut size={18} />
                            </button>
                            <span className="cert-zoom-level">{Math.round(zoom * 100)}%</span>
                            <button onClick={handleZoomIn} className="cert-zoom-btn" title="Zoom In">
                                <ZoomIn size={18} style={{ color: 'red' }} color='red' />
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
                                {/* Background Pattern */}
                                <div className="cert-bg-luxury">
                                    <div className="cert-pattern-grid" />
                                    <div className="cert-pattern-hex" />
                                    <div className="cert-gradient-overlay" />
                                </div>

                                {/* Main Container - Fixed dimensions to ensure borders show */}
                                <div className="cert-main">
                                    {/* Top Border Accent */}
                                    <div className="cert-top-accent">
                                        <div className="cert-accent-line green" />
                                        <div className="cert-accent-line blue" />
                                    </div>

                                    {/* Header */}
                                    <header className="cert-header">
                                        <div className="cert-logo-container">
                                            <img src={logoUrl} alt="Institution Logo" className="cert-logo" />
                                        </div>
                                        <div className="cert-institution">
                                            <h3>{institutionName}</h3>
                                            <div className="cert-divider-diamond">
                                                <span className="diamond" />
                                            </div>
                                        </div>
                                    </header>

                                    {/* Content - Centered */}
                                    <main className="cert-content">
                                        <div className="cert-pretitle">This is to certify that</div>

                                        <h1 className="cert-recipient-name">{learner.fullName}</h1>

                                        <div className="cert-description">
                                            {finalDescription}
                                        </div>

                                        <div className="cert-programme-name">
                                            {learner.qualification?.name || 'Assigned Programme'}
                                        </div>

                                        {(learner.qualification?.nqfLevel || learner.qualification?.credits) && (
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
                                            </div>
                                        )}

                                        <div className="cert-type-badge">
                                            <span className="cert-type-text">Certificate of</span>
                                            <span className="cert-type-value">{finalCertType}</span>
                                        </div>
                                    </main>

                                    {/* Footer - Ensure it's at bottom */}
                                    <footer className="cert-footer-new">
                                        <div className="cert-signature-block">
                                            <div className="cert-signature-image-container">
                                                <img src={sigUrl} alt="Signature" className="cert-signature-img" />
                                            </div>
                                            <div className="cert-signature-line" />
                                            <div className="cert-signature-name">{signatoryName}</div>
                                            <div className="cert-signature-title">{signatoryTitle}</div>
                                        </div>

                                        <div className="cert-seal-container">
                                            <div className="cert-seal-ring">
                                                <div className="cert-seal-inner">
                                                    <Hexagon size={40} strokeWidth={3} className="cert-seal-icon" />
                                                    <span className="cert-seal-text">OFFICIAL</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="cert-date-block">
                                            <div className="cert-date-value">{issueDate}</div>
                                            <div className="cert-signature-line" />
                                            <div className="cert-date-label">Date of Issue</div>
                                            <div className="cert-cert-number">Ref: {certNumber}</div>
                                        </div>
                                    </footer>

                                    {/* Bottom Border */}
                                    <div className="cert-bottom-accent" />
                                </div>

                                {/* Corner Decorations */}
                                <div className="cert-corner top-left" />
                                <div className="cert-corner top-right" />
                                <div className="cert-corner bottom-left" />
                                <div className="cert-corner bottom-right" />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
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
                                <span>Generating PDF...</span>
                            </>
                        ) : (
                            <>
                                <Download size={18} />
                                <span>Issue Certificate</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};


// import React, { useState, useRef, useCallback } from 'react';
// import { createPortal } from 'react-dom';
// import { X, Award, Loader2, ChevronDown, Download, FileCheck, Hexagon, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
// import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
// import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
// import html2canvas from 'html2canvas';
// import jsPDF from 'jspdf';
// import { db } from '../../../lib/firebase';
// import { useStore } from '../../../store/useStore';
// import { useToast } from '../Toast/Toast';
// import './CertificateGenerator.css';

// import mLabLogo from '../../../assets/logo/mlab_logo.png';
// import zackSignature from '../../../assets/Signatue_Zack_.png';

// interface CertificateGeneratorProps {
//     learner: {
//         id: string;
//         idNumber: string;
//         fullName: string;
//         qualification?: {
//             name: string;
//             nqfLevel?: string;
//             credits?: string;
//         };
//     };
//     onClose: () => void;
// }

// interface CertificateType {
//     value: string;
//     label: string;
//     description: string;
// }

// const CERTIFICATE_TYPES: CertificateType[] = [
//     {
//         value: 'Competence',
//         label: 'Certificate of Competence',
//         description: 'has demonstrated competence and mastered all requirements for'
//     },
//     {
//         value: 'Completion',
//         label: 'Certificate of Completion',
//         description: 'has successfully completed all requirements for'
//     },
//     {
//         value: 'Attendance',
//         label: 'Certificate of Attendance',
//         description: 'has successfully attended and participated in'
//     },
//     {
//         value: 'Achievement',
//         label: 'Certificate of Achievement',
//         description: 'has achieved outstanding performance in'
//     }
// ];

// export const CertificateGenerator: React.FC<CertificateGeneratorProps> = ({ learner, onClose }) => {
//     const { settings } = useStore();
//     const toast = useToast();

//     const [certType, setCertType] = useState('Competence');
//     const [customType, setCustomType] = useState('');
//     const [customDescription, setCustomDescription] = useState('');
//     const [isGenerating, setIsGenerating] = useState(false);
//     const [activeTab, setActiveTab] = useState<'preview' | 'settings'>('preview');
//     const [zoom, setZoom] = useState(0.65); // Default zoom to fit most screens

//     const certRef = useRef<HTMLDivElement>(null);
//     const containerRef = useRef<HTMLDivElement>(null);

//     // White-label settings with fallbacks
//     const institutionName = settings?.institutionName || "mLab Southern Africa";
//     const logoUrl = mLabLogo;
//     const sigUrl = (settings as any)?.signatureUrl || zackSignature;
//     const signatoryName = (settings as any)?.signatoryName || 'Zakhele Tinga';
//     const signatoryTitle = (settings as any)?.signatoryTitle || 'Academic Manager';

//     const selectedCertType = CERTIFICATE_TYPES.find(c => c.value === certType) || CERTIFICATE_TYPES[0];

//     const finalCertType = certType === 'Other' ? (customType || 'Custom') : selectedCertType.label.replace('Certificate of ', '');
//     const finalDescription = certType === 'Other'
//         ? (customDescription || 'has successfully met the requirements for')
//         : selectedCertType.description;

//     const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.1, 1.5));
//     const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.4));
//     const handleResetZoom = () => setZoom(0.65);

//     const handleGenerate = useCallback(async () => {
//         if (!certRef.current) return;

//         if (certType === 'Other' && !customType.trim()) {
//             toast.error('Please enter a custom certificate title');
//             return;
//         }

//         setIsGenerating(true);
//         toast.info('Generating secure certificate…');

//         try {
//             // Store current zoom and reset to 1 for capture
//             const currentZoom = zoom;
//             setZoom(1);

//             // Wait for render
//             await new Promise(resolve => setTimeout(resolve, 100));

//             const canvas = await html2canvas(certRef.current, {
//                 scale: 2,
//                 useCORS: true,
//                 logging: false,
//                 backgroundColor: '#ffffff',
//                 imageTimeout: 0,
//                 width: 1123,
//                 height: 794
//             });

//             // Restore zoom
//             setZoom(currentZoom);

//             const pdf = new jsPDF({
//                 orientation: 'landscape',
//                 unit: 'mm',
//                 format: 'a4',
//                 compress: true
//             });

//             const imgData = canvas.toDataURL('image/jpeg', 1.0);
//             pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);

//             const safeType = finalCertType.replace(/[^a-zA-Z0-9]/g, '_');
//             const fileName = `Certificate_${safeType}_${learner.idNumber}_${Date.now()}.pdf`;
//             const pdfBlob = pdf.output('blob');

//             const storage = getStorage();
//             const storageRef = ref(storage, `certificates/${learner.id}/${fileName}`);
//             await uploadBytes(storageRef, pdfBlob);
//             const downloadUrl = await getDownloadURL(storageRef);

//             await updateDoc(doc(db, 'learners', learner.id), {
//                 certificates: arrayUnion({
//                     id: Date.now().toString(),
//                     type: finalCertType,
//                     courseName: learner.qualification?.name || 'Assigned Programme',
//                     issueDate: new Date().toISOString(),
//                     pdfUrl: downloadUrl,
//                 }),
//             });

//             toast.success(`${finalCertType} Certificate issued successfully`);
//             onClose();
//         } catch (error) {
//             console.error('Certificate generation failed:', error);
//             toast.error('Failed to generate certificate. Please try again.');
//             setIsGenerating(false);
//         }
//     }, [certRef, certType, customType, finalCertType, learner, toast, onClose, zoom]);

//     const issueDate = new Date().toLocaleDateString('en-ZA', {
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric'
//     });

//     const certNumber = `MLAB-${learner.idNumber}-${new Date().getFullYear()}`;

//     return createPortal(
//         <div className="cert-overlay">
//             <div className="cert-modal">
//                 {/* Header */}
//                 <div className="cert-modal__header">
//                     <div className="cert-modal__brand">
//                         <div className="cert-modal__brand-icon">
//                             <Hexagon size={32} strokeWidth={2.5} />
//                             <Award size={16} className="cert-modal__brand-logo" />
//                         </div>
//                         <div className="cert-modal__brand-text">
//                             <h2>Certificate Studio</h2>
//                             <p>Issue official mLab credentials</p>
//                         </div>
//                     </div>
//                     <button
//                         className="cert-modal__close"
//                         onClick={onClose}
//                         disabled={isGenerating}
//                         aria-label="Close modal"
//                     >
//                         <X size={24} />
//                     </button>
//                 </div>



//                 {/* Body */}
//                 <div className="cert-modal__body">
//                     {/* Controls Sidebar */}
//                     <div className="cert-controls">
//                         <div className="cert-controls__tabs">
//                             <button
//                                 className={`cert-controls__tab ${activeTab === 'preview' ? 'active' : ''}`}
//                                 onClick={() => setActiveTab('preview')}
//                             >
//                                 Preview
//                             </button>
//                             <button
//                                 className={`cert-controls__tab ${activeTab === 'settings' ? 'active' : ''}`}
//                                 onClick={() => setActiveTab('settings')}
//                             >
//                                 Configure
//                             </button>
//                         </div>

//                         <div className={`cert-controls__content ${activeTab === 'settings' ? 'active' : ''}`}>
//                             <div className="cert-control-group">
//                                 <label className="cert-control-label">
//                                     <FileCheck size={14} />
//                                     Certificate Type
//                                 </label>
//                                 <div className="cert-select-wrapper">
//                                     <select
//                                         value={certType}
//                                         onChange={e => setCertType(e.target.value)}
//                                         disabled={isGenerating}
//                                         className="cert-select"
//                                     >
//                                         {CERTIFICATE_TYPES.map(type => (
//                                             <option key={type.value} value={type.value}>{type.label}</option>
//                                         ))}
//                                         <option value="Other">Other (Custom)</option>
//                                     </select>
//                                     <ChevronDown size={16} className="cert-select-icon" />
//                                 </div>
//                             </div>

//                             {certType === 'Other' && (
//                                 <div className="cert-custom-fields animate-fade-in">
//                                     <div className="cert-control-group">
//                                         <label className="cert-control-label">
//                                             Custom Title <span className="required">*</span>
//                                         </label>
//                                         <input
//                                             type="text"
//                                             className="cert-input"
//                                             placeholder="e.g., Excellence in Innovation"
//                                             value={customType}
//                                             onChange={e => setCustomType(e.target.value)}
//                                             disabled={isGenerating}
//                                         />
//                                     </div>
//                                     <div className="cert-control-group">
//                                         <label className="cert-control-label">Description Text</label>
//                                         <textarea
//                                             className="cert-textarea"
//                                             placeholder="has demonstrated exceptional skills in..."
//                                             value={customDescription}
//                                             onChange={e => setCustomDescription(e.target.value)}
//                                             disabled={isGenerating}
//                                             rows={3}
//                                         />
//                                     </div>
//                                 </div>
//                             )}

//                             <div className="cert-info-card">
//                                 <div className="cert-info-item">
//                                     <span className="cert-info-label">Recipient</span>
//                                     <span className="cert-info-value">{learner.fullName}</span>
//                                 </div>
//                                 <div className="cert-info-item">
//                                     <span className="cert-info-label">Programme</span>
//                                     <span className="cert-info-value">{learner.qualification?.name || 'N/A'}</span>
//                                 </div>
//                                 <div className="cert-info-item">
//                                     <span className="cert-info-label">Cert Number</span>
//                                     <span className="cert-info-value mono">{certNumber}</span>
//                                 </div>
//                             </div>
//                         </div>
//                     </div>

//                     {/* Preview Area */}
//                     <div className="cert-preview-container" ref={containerRef}>
//                         <div className="cert-zoom-controls">
//                             <button onClick={handleZoomOut} className="cert-zoom-btn" title="Zoom Out">
//                                 <ZoomOut size={18} />
//                             </button>
//                             <span className="cert-zoom-level">{Math.round(zoom * 100)}%</span>
//                             <button onClick={handleZoomIn} className="cert-zoom-btn" title="Zoom In">
//                                 <ZoomIn size={18} style={{ color: 'red' }} color='red' />
//                             </button>
//                             <button onClick={handleResetZoom} className="cert-zoom-btn" title="Reset Zoom">
//                                 <RotateCcw size={18} />
//                             </button>
//                         </div>

//                         <div className="cert-canvas-wrapper">
//                             <div
//                                 className="cert-canvas"
//                                 ref={certRef}
//                                 style={{
//                                     transform: `scale(${zoom})`,
//                                     transformOrigin: 'center center'
//                                 }}
//                             >
//                                 {/* Background Pattern */}
//                                 <div className="cert-bg-luxury">
//                                     <div className="cert-pattern-grid" />
//                                     <div className="cert-pattern-hex" />
//                                     <div className="cert-gradient-overlay" />
//                                 </div>

//                                 {/* Main Container - Fixed dimensions to ensure borders show */}
//                                 <div className="cert-main">
//                                     {/* Top Border Accent */}
//                                     <div className="cert-top-accent">
//                                         <div className="cert-accent-line green" />
//                                         <div className="cert-accent-line blue" />
//                                     </div>

//                                     {/* Header */}
//                                     <header className="cert-header">
//                                         <div className="cert-logo-container">
//                                             <img src={logoUrl} alt="Institution Logo" className="cert-logo" />
//                                         </div>
//                                         <div className="cert-institution">
//                                             <h3>{institutionName}</h3>
//                                             <div className="cert-divider-diamond">
//                                                 <span className="diamond" />
//                                             </div>
//                                         </div>
//                                     </header>

//                                     {/* Content - Centered */}
//                                     <main className="cert-content">
//                                         <div className="cert-pretitle">This is to certify that</div>

//                                         <h1 className="cert-recipient-name">{learner.fullName}</h1>

//                                         <div className="cert-description">
//                                             {finalDescription}
//                                         </div>

//                                         <div className="cert-programme-name">
//                                             {learner.qualification?.name || 'Assigned Programme'}
//                                         </div>

//                                         {(learner.qualification?.nqfLevel || learner.qualification?.credits) && (
//                                             <div className="cert-meta">
//                                                 {learner.qualification?.nqfLevel && (
//                                                     <span className="cert-meta-item">NQF Level {learner.qualification.nqfLevel}</span>
//                                                 )}
//                                                 {learner.qualification?.nqfLevel && learner.qualification?.credits && (
//                                                     <span className="cert-meta-dot" />
//                                                 )}
//                                                 {learner.qualification?.credits && (
//                                                     <span className="cert-meta-item">{learner.qualification.credits} Credits</span>
//                                                 )}
//                                             </div>
//                                         )}

//                                         <div className="cert-type-badge">
//                                             <span className="cert-type-text">Certificate of</span>
//                                             <span className="cert-type-value">{finalCertType}</span>
//                                         </div>
//                                     </main>

//                                     {/* Footer - Ensure it's at bottom */}
//                                     <footer className="cert-footer-new">
//                                         <div className="cert-signature-block">
//                                             <div className="cert-signature-image-container">
//                                                 <img src={sigUrl} alt="Signature" className="cert-signature-img" />
//                                             </div>
//                                             <div className="cert-signature-line" />
//                                             <div className="cert-signature-name">{signatoryName}</div>
//                                             <div className="cert-signature-title">{signatoryTitle}</div>
//                                         </div>

//                                         <div className="cert-seal-container">
//                                             <div className="cert-seal-ring">
//                                                 <div className="cert-seal-inner">
//                                                     <Hexagon size={40} strokeWidth={3} className="cert-seal-icon" />
//                                                     <span className="cert-seal-text">OFFICIAL</span>
//                                                 </div>
//                                             </div>
//                                         </div>

//                                         <div className="cert-date-block">
//                                             <div className="cert-date-value">{issueDate}</div>
//                                             <div className="cert-signature-line" />
//                                             <div className="cert-date-label">Date of Issue</div>
//                                             <div className="cert-cert-number">Ref: {certNumber}</div>
//                                         </div>
//                                     </footer>

//                                     {/* Bottom Border */}
//                                     <div className="cert-bottom-accent" />
//                                 </div>

//                                 {/* Corner Decorations */}
//                                 <div className="cert-corner top-left" />
//                                 <div className="cert-corner top-right" />
//                                 <div className="cert-corner bottom-left" />
//                                 <div className="cert-corner bottom-right" />
//                             </div>
//                         </div>
//                     </div>
//                 </div>

//                 {/* Footer */}
//                 <div className="cert-modal__footer">
//                     <button
//                         className="cert-btn cert-btn--secondary"
//                         onClick={onClose}
//                         disabled={isGenerating}
//                     >
//                         Cancel
//                     </button>
//                     <button
//                         className="cert-btn cert-btn--primary"
//                         onClick={handleGenerate}
//                         disabled={isGenerating}
//                     >
//                         {isGenerating ? (
//                             <>
//                                 <Loader2 className="spin" size={18} />
//                                 <span>Generating PDF...</span>
//                             </>
//                         ) : (
//                             <>
//                                 <Download size={18} />
//                                 <span>Issue Certificate</span>
//                             </>
//                         )}
//                     </button>
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };