// src/pages/StatementOfResults/StatementOfResults.tsx

import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../../store/useStore';
import './StatementOfResults.css';
import type { AssessmentCategoryProps, AnyAssessmentModule, LearnerData } from '../../types/learner.types';

// Helper to map Store Status to UI Status
const mapStatus = (status: string) => {
    const s = status?.toLowerCase() || "";
    if (s === "competent" || s === "pass") return s === "pass" ? "Competent" : "Competent";
    return "Not Yet Competent";
};

const StatementOfResults: React.FC = () => {
    const { id } = useParams<{ id: string }>(); // Get ID from URL
    const navigate = useNavigate();
    const { learners, fetchLearners } = useStore();
    const qrCanvasRef = useRef<HTMLCanvasElement>(null);

    // Initialize state as null initially
    const [learnerData, setLearnerData] = useState<LearnerData | null>(null);

    // Fetch and Find Learner
    useEffect(() => {
        const loadLearner = async () => {
            // Ensure we have data
            if (learners.length === 0) {
                await fetchLearners();
            }

            // Find specific learner
            const foundLearner = learners.find(l => l.id === id);

            if (foundLearner) {
                // Map DashboardLearner (Store) to LearnerData (SOR View)
                setLearnerData({
                    fullName: foundLearner.fullName,
                    idNumber: foundLearner.idNumber,
                    dateOfBirth: foundLearner.dateOfBirth,
                    qualification: {
                        name: foundLearner.qualification.name,
                        saqaId: foundLearner.qualification.saqaId,
                        credits: foundLearner.qualification.credits.toString(),
                        nqfLevel: `Level ${foundLearner.qualification.nqfLevel}`,
                        dateAssessed: foundLearner.qualification.dateAssessed || new Date().toISOString().split('T')[0]
                    },
                    // Map Modules
                    knowledgeModules: foundLearner.knowledgeModules.map(m => ({
                        name: m.name,
                        credits: m.credits,
                        dateAssessed: m.dateAssessed,
                        status: mapStatus(m.status) as any
                    })),
                    practicalModules: foundLearner.practicalModules.map(m => ({
                        name: m.name,
                        credits: m.credits,
                        dateAssessed: m.dateAssessed,
                        status: mapStatus(m.status) as any
                    })),
                    workExperienceModules: foundLearner.workExperienceModules.map(m => ({
                        name: m.name,
                        credits: m.credits,
                        dateSignedOff: m.dateSignedOff,
                        status: mapStatus(m.status) as any
                    })),
                    eisaAdmission: foundLearner.eisaAdmission,
                    verificationCode: foundLearner.verificationCode,
                    issueDate: foundLearner.issueDate || new Date().toISOString().split('T')[0],
                    nextEISADate: "TBA", // Default or calculate based on logic
                    issuedBy: {
                        name: "Mr. Nomvula Dlamini", // Static or from Auth Store
                        title: "Academic Manager"
                    }
                });
            } else {
                // Handle case where learner is not found after fetch
                // alert("Learner not found!");
                // navigate("/");
            }
        };

        loadLearner();
    }, [id, learners, fetchLearners, navigate]);

    // QR Code Effect (Depends on learnerData)
    useEffect(() => {
        if (learnerData) {
            // Small timeout to ensure DOM is ready
            setTimeout(() => generateQRCode(), 100);
        }
    }, [learnerData]);

    const generateQRCode = (): void => {
        if (!learnerData) return;

        const canvas = qrCanvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas before drawing
        ctx.clearRect(0, 0, 150, 150);

        const size = 150;
        const moduleSize = 5;
        const modules = size / moduleSize;

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // mLab midnight blue for QR pattern
        ctx.fillStyle = '#073f4e';

        // Draw corner position markers
        const drawCornerMarker = (x: number, y: number) => {
            ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize * 7, moduleSize * 7);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect((x + 1) * moduleSize, (y + 1) * moduleSize, moduleSize * 5, moduleSize * 5);
            ctx.fillStyle = '#073f4e';
            ctx.fillRect((x + 2) * moduleSize, (y + 2) * moduleSize, moduleSize * 3, moduleSize * 3);
        };

        drawCornerMarker(0, 0);
        drawCornerMarker(modules - 7, 0);
        drawCornerMarker(0, modules - 7);

        // Generate data pattern
        const seed = 12345;
        let random = seed;

        for (let y = 0; y < modules; y++) {
            for (let x = 0; x < modules; x++) {
                if ((x < 8 && y < 8) || (x >= modules - 8 && y < 8) || (x < 8 && y >= modules - 8)) {
                    continue;
                }

                random = (random * 9301 + 49297) % 233280;
                if (random / 233280 > 0.5) {
                    ctx.fillStyle = '#073f4e';
                    ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
                }
            }
        }

        // Center with mLab green
        const centerStart = (modules - 8) / 2;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(centerStart * moduleSize, centerStart * moduleSize, moduleSize * 8, moduleSize * 8);
        ctx.fillStyle = '#94c73d';
        ctx.fillRect((centerStart + 1) * moduleSize, (centerStart + 1) * moduleSize, moduleSize * 6, moduleSize * 6);

        // Draw 'm' in center
        ctx.fillStyle = '#073f4e';
        ctx.font = 'bold 16px Oswald';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('m', size / 2, size / 2);
    };

    const handlePrint = (): void => {
        window.print();
    };

    const calculateTotalCredits = (modules: AnyAssessmentModule[]): number => {
        return modules.reduce((total, module) => total + module.credits, 0);
    };

    const getStatusClass = (status: string): string => {
        const statusLower = status.toLowerCase();
        if (statusLower === 'competent') return 'status-competent';
        if (statusLower === 'pass') return 'status-pass';
        if (statusLower === 'not competent') return 'status-not-competent';
        if (statusLower === 'fail') return 'status-fail';
        return '';
    };

    // Render Loading State if data isn't ready
    if (!learnerData) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', gap: '1rem' }}>
                <div className="loader"></div>
                <p>Loading Statement of Results...</p>
                <button className="btn btn-outline" onClick={() => navigate(-1)}>Go Back</button>
            </div>
        );
    }

    // Render Main Component
    return (
        <div className="sor-wrapper">
            <div className="container">
                {/* Green accent bar */}
                <div className="accent-bar"></div>

                {/* Letterhead */}
                <div className="letterhead">
                    <div className="letterhead-content">
                        <div className="provider-info">
                            <div className="logo-container">
                                <div className="logo">
                                    <div className="logo-text">
                                        <span className="logo-m">m</span>
                                        <span className="logo-lab">lab</span>
                                    </div>
                                    <div className="tagline">Southern Africa</div>
                                </div>
                            </div>
                            <div className="provider-details">
                                <div>123 Innovation Drive, Cape Town, 8001</div>
                                <div>Registration No: SDP-2024-MLAB</div>
                            </div>
                        </div>
                        <div className="contact-info">
                            <div><strong>Tel:</strong> +27 21 555 7890</div>
                            <div><strong>Email:</strong> training@mlab.co.za</div>
                            <div><strong>Web:</strong> www.mlab.co.za</div>
                        </div>
                    </div>
                </div>

                {/* Document Header */}
                <div className="document-header">
                    <div className="document-title">Statement of Results</div>
                    <div className="document-subtitle">Not an Occupational Certificate</div>
                </div>

                {/* Main Content */}
                <div className="content">
                    {/* Qualification Information */}
                    <div className="qualification-box">
                        <div className="qualification-title">
                            Occupational Certificate: {learnerData.qualification.name}
                        </div>
                        <div className="qualification-meta">
                            <div className="meta-item">
                                <span className="meta-label">SAQA ID</span>
                                <span className="meta-value">{learnerData.qualification.saqaId}</span>
                            </div>
                            <div className="meta-item">
                                <span className="meta-label">Credits</span>
                                <span className="meta-value">{learnerData.qualification.credits}</span>
                            </div>
                            <div className="meta-item">
                                <span className="meta-label">NQF Level</span>
                                <span className="meta-value">{learnerData.qualification.nqfLevel}</span>
                            </div>
                            <div className="meta-item">
                                <span className="meta-label">Date Assessed</span>
                                <span className="meta-value">{learnerData.qualification.dateAssessed}</span>
                            </div>
                        </div>
                    </div>

                    {/* Learner Information */}
                    <div className="learner-section">
                        <h2 className="section-title">Learner Information</h2>
                        <div className="learner-info">
                            <div className="info-field">
                                <span className="field-label">Full Names</span>
                                <span className="field-value">{learnerData.fullName}</span>
                            </div>
                            <div className="info-field">
                                <span className="field-label">ID Number</span>
                                <span className="field-value">{learnerData.idNumber}</span>
                            </div>
                            <div className="info-field">
                                <span className="field-label">Date of Birth</span>
                                <span className="field-value">{learnerData.dateOfBirth}</span>
                            </div>
                        </div>
                    </div>

                    {/* Knowledge Modules */}
                    {learnerData.knowledgeModules.length > 0 && (
                        <AssessmentCategory
                            title="Knowledge Modules"
                            totalCredits={calculateTotalCredits(learnerData.knowledgeModules)}
                            modules={learnerData.knowledgeModules}
                            dateLabel="Date Assessed"
                            getStatusClass={getStatusClass}
                        />
                    )}

                    {/* Practical Skills Modules */}
                    {learnerData.practicalModules.length > 0 && (
                        <AssessmentCategory
                            title="Practical Skills Modules"
                            totalCredits={calculateTotalCredits(learnerData.practicalModules)}
                            modules={learnerData.practicalModules}
                            dateLabel="Date Assessed"
                            getStatusClass={getStatusClass}
                        />
                    )}

                    {/* Work Experience Modules */}
                    {learnerData.workExperienceModules.length > 0 && (
                        <AssessmentCategory
                            title="Work Experience Modules"
                            totalCredits={calculateTotalCredits(learnerData.workExperienceModules)}
                            modules={learnerData.workExperienceModules}
                            dateLabel="Date Signed Off"
                            getStatusClass={getStatusClass}
                        />
                    )}

                    {/* EISA Admission Summary */}
                    <div className="summary-box">
                        <div className="summary-text">
                            Learner has gained admission to the External Integrated Summative Assessment (EISA)
                        </div>
                        <div className="eisa-status">
                            <span className="eisa-label">Status:</span>
                            <span className={`eisa-badge ${learnerData.eisaAdmission ? '' : 'no'}`}>
                                {learnerData.eisaAdmission ? 'YES' : 'NO'}
                            </span>
                        </div>
                    </div>

                    {/* Important Notice */}
                    <div className="important-notice">
                        <div className="notice-title">⚠️ Important Notice</div>
                        <div className="notice-text">
                            <p><strong>This Statement of Results is not an Occupational Certificate.</strong></p>
                            <p>The learner has complied with the requirements of the Knowledge, Practical and Workplace Components of the qualification. The Quality Council for Trades and Occupations (QCTO) may issue the Occupational Certificate after the candidate has successfully completed the External Integrated Summative Assessment (EISA) requirements.</p>
                            <p><strong>This SoR is valid for a period of two years from date of issue.</strong></p>
                            <p><strong>Date of Next EISA:</strong> {learnerData.nextEISADate}</p>
                            <p style={{ fontStyle: 'italic' }}>Learners must bring this SoR together with their IDs when writing the EISA.</p>
                        </div>
                    </div>

                    {/* Required Attachments */}
                    <div className="attachments-box">
                        <div className="attachments-title">Required Attachments</div>
                        <ul className="attachments-list">
                            <li>Learner's ID Document</li>
                            <li>Proof of passing Mathematics and English (for Level 3 & 4 qualifications):
                                <ul style={{ listStyle: 'none', marginLeft: '1.5rem', marginTop: '0.5rem' }}>
                                    <li>• Grade 12 Certificate (or equivalent) with pass marks for Maths and English, OR</li>
                                    <li>• FLC Statement of Results for Numeracy and Literacy - Competent</li>
                                </ul>
                            </li>
                        </ul>
                    </div>

                    {/* Footer Section */}
                    <div className="footer-section">
                        <div className="signature-area">
                            <div className="signature-block">
                                <div className="signature-image-container">
                                    <img src={'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fwww.pngall.com%2Fwp-content%2Fuploads%2F14%2FSignature-PNG-File.png&f=1&nofb=1&ipt=75017af4ba090a777ead887e3f252d149d949b8ed2b07d8a2f6c1b85a3081e8c'} alt="Authorized Signature" />
                                </div>
                                <div className="signature-line"></div>
                                <div className="signature-name">{learnerData.issuedBy.name}</div>
                                <div className="signature-title">{learnerData.issuedBy.title}</div>
                                <div className="signature-title" style={{ marginTop: '0.5rem', fontWeight: 600 }}>
                                    Date Issued: {learnerData.issueDate}
                                </div>
                            </div>
                            <div className="signature-block">
                                <div className="qr-verification">
                                    <canvas ref={qrCanvasRef} width="150" height="150"></canvas>
                                    <div className="qr-label">Scan to Verify</div>
                                    <div className="verification-code">{learnerData.verificationCode}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Button */}
            <button className="print-button" onClick={handlePrint}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                <span>Print</span>
            </button>
        </div>
    );
};

// --- Subcomponents ---

const AssessmentCategory: React.FC<AssessmentCategoryProps> = ({
    title,
    totalCredits,
    modules,
    dateLabel,
    getStatusClass
}) => {
    return (
        <div className="assessment-category">
            <div className="category-header">
                <span>{title}</span>
                <span className="category-badge">{totalCredits} Credits</span>
            </div>
            <table className="assessment-table">
                <thead>
                    <tr>
                        <th>Module Name</th>
                        <th>Credits</th>
                        <th>{dateLabel}</th>
                        <th>Achievement</th>
                    </tr>
                </thead>
                <tbody>
                    {modules.map((module, index) => (
                        <tr key={index}>
                            <td className="module-name" width={'50%'}>{module.name}</td>
                            <td>
                                <span className="credits-badge">{module.credits}</span>
                            </td>
                            {/* Safely check if dateAssessed exists, otherwise use dateSignedOff */}
                            <td style={{ color: 'black' }}>{'dateAssessed' in module ? module.dateAssessed : module.dateSignedOff}</td>
                            <td className="achievement-status">
                                <span className={`status-badge ${getStatusClass(module.status)}`}>
                                    {module.status}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default StatementOfResults;