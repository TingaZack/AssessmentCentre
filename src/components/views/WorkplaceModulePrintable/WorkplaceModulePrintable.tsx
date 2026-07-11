// src/components/views/WorkplaceModulePrintable/WorkplaceModulePrintable.tsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import moment from 'moment';

// ─── Types ───────────────────────────────────────────────────────────

interface HistoricalMetrics {
    count: number;
    totalHours: number;
}

interface AdditionalAttachment {
    url: string;
    label?: string;
    description?: string;
}

interface WorkplaceLogPrintableProps {
    log: any;
    logVersions: any[];
    mentorName: string;
    assessorName?: string;
    learnerSig?: string;
    mentorSig?: string;
    assessorSig?: string;
    employerDetails?: {
        companyName: string;
        address: string;
        workTelephone: string;
        email: string;
    };
    historicalMilestoneMetrics?: Record<string, HistoricalMetrics>;
    additionalAttachments?: AdditionalAttachment[];
    moduleTopics?: any[];
    onReady?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const isPrintableImage = (url: string): boolean => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.gif');
};

const getFileName = (url: string): string => {
    if (!url) return 'Unknown';
    try {
        const parsed = new URL(url);
        return decodeURIComponent(parsed.pathname.split('/').pop() || 'document');
    } catch {
        return url.split('/').pop() || 'document';
    }
};

// ─── Enhanced PDF Unroller Component ─────────────────────────────────

const PrintablePdfUnroller: React.FC<{ url: string }> = ({ url }) => {
    const [failed, setFailed] = useState(false);
    const cleanUrl = url?.replace(/\s+/g, '');
    const inlineUrl = cleanUrl ? `${cleanUrl}&response-content-disposition=inline` : cleanUrl;

    if (!cleanUrl || failed) {
        return (
            <div style={{ padding: '25px 20px', border: '2px solid #000000', background: '#fafbfc', textAlign: 'center', fontFamily: 'Arial, sans-serif', marginTop: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <div style={{ fontSize: '22pt', marginBottom: '6px' }}>📋</div>
                <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase' }}>
                    SECURE ATTACHMENT PORTFOLIO INDEXED
                </h3>
                <p style={{ margin: '0 auto 12px', fontSize: '9.5pt', color: '#334155', maxWidth: '600px', lineHeight: 1.5 }}>
                    This document could not be embedded automatically. Please verify or print the original file directly via your dashboard console, or insert the original document physically behind this reference tracker page.
                </p>
                <div style={{ fontSize: '8pt', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '6px 12px', display: 'inline-block', borderRadius: '4px', maxWidth: '100%', wordBreak: 'break-all' }}>
                    System URI Token: {cleanUrl}
                </div>
            </div>
        );
    }

    return (
        <div style={{ pageBreakBefore: 'always', marginTop: '20px', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}>
            <div style={{ fontSize: '8pt', fontWeight: 'bold', textAlign: 'left', marginBottom: '6px', textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #000000', paddingBottom: '3px' }}>
                Document Attachment Component
            </div>
            <embed
                src={inlineUrl}
                type="application/pdf"
                style={{ width: '100%', height: '520px', border: 'none', display: 'block' }}
                onError={() => setFailed(true)}
            />
        </div>
    );
};

// ─── Main Printable Document Component ────────────────────────────────

export const WorkplaceLogPrintable: React.FC<WorkplaceLogPrintableProps> = ({
    log,
    logVersions,
    mentorName,
    assessorName,
    learnerSig,
    mentorSig,
    assessorSig,
    employerDetails,
    historicalMilestoneMetrics = {},
    additionalAttachments = [],
    moduleTopics = [],
    onReady
}) => {
    const chronologicalVersions = useMemo(() => [...logVersions].reverse(), [logVersions]);

    // ─── 🚀 100% DYNAMIC CURRICULUM DESCRIPTION TRANSLATION DICTIONARY ───
    const milestoneDescriptionsLookup = useMemo(() => {
        const dictionaryMap: Record<string, string> = {};

        // 1. Recover database inline translation objects stamped into historical snapshots
        if (log?.milestoneLabels) {
            Object.entries(log.milestoneLabels).forEach(([code, label]) => {
                if (label) dictionaryMap[code] = label as string;
            });
        }

        chronologicalVersions.forEach((v: any) => {
            if (v?.milestoneLabels) {
                Object.entries(v.milestoneLabels).forEach(([code, label]) => {
                    if (label) dictionaryMap[code] = label as string;
                });
            }
            if (v?.milestoneTranslations) {
                Object.entries(v.milestoneTranslations).forEach(([code, label]) => {
                    if (label) dictionaryMap[code] = label as string;
                });
            }
        });

        // 2. Layer live qualification curriculum blueprints over document tokens if available
        if (moduleTopics && Array.isArray(moduleTopics)) {
            moduleTopics.forEach((topic: any) => {
                if (topic.criteria && Array.isArray(topic.criteria)) {
                    topic.criteria.forEach((criterion: any) => {
                        if (criterion.code) {
                            dictionaryMap[criterion.code] = criterion.description || criterion.label || criterion.title || '';
                        }
                    });
                }
            });
        }
        return dictionaryMap;
    }, [moduleTopics, log, chronologicalVersions]);

    const totalPdfCount = useMemo(() => {
        let count = 0;
        chronologicalVersions.forEach(v => {
            if (v.evidenceUrl && !isPrintableImage(v.evidenceUrl)) count++;
            if (Array.isArray(v.customEvidenceTracking)) {
                v.customEvidenceTracking.forEach((item: any) => {
                    if (item.type !== 'link' && item.fileUrl && !isPrintableImage(item.fileUrl)) {
                        count++;
                    }
                });
            }
            if (v.cwkEvidence && typeof v.cwkEvidence === 'object') {
                Object.values(v.cwkEvidence).forEach(url => {
                    if (typeof url === 'string' && !isPrintableImage(url)) count++;
                });
            }
        });
        additionalAttachments.forEach(a => { if (!isPrintableImage(a.url)) count++; });
        return count;
    }, [chronologicalVersions, additionalAttachments]);

    const [loadedPdfCount, setLoadedPdfCount] = useState(0);

    useEffect(() => {
        if (totalPdfCount === 0 || loadedPdfCount === totalPdfCount) {
            onReady?.();
        }
    }, [loadedPdfCount, totalPdfCount, onReady]);

    const handlePdfLoaded = useCallback(() => {
        setLoadedPdfCount(prev => prev + 1);
    }, []);

    return (
        <div className="qcto-diary-print-container active-log-print">
            <style type="text/css">
                {`
                    .qcto-diary-print-container { display: none !important; }
                    
                    @media print {
                        @page { 
                            size: A4 landscape !important; 
                            margin: 10mm 12mm 10mm 12mm !important; 
                        }

                        body > * { display: none !important; height: 0 !important; overflow: hidden !important; }
                        body > .qcto-diary-print-container.active-log-print { display: block !important; height: auto !important; overflow: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 10pt !important; line-height: 1.4 !important; }
                        .qcto-diary-print-container.active-log-print * { display: revert; }
                        
                        .print-diary-page { page-break-after: always !important; padding-top: 2mm; padding-bottom: 4mm; }
                        .print-diary-page:last-of-type { page-break-after: auto !important; }
                        
                        .print-header-table, .print-data-table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 16px !important; border: 2px solid #000000 !important; }
                        .print-header-table td, .print-data-table th, .print-data-table td { border: 1px solid #000000 !important; padding: 8px 12px !important; color: #000000 !important; }
                        .print-header-table td { font-weight: bold !important; font-size: 10pt !important; }
                        .print-header-table td span { font-weight: normal !important; margin-left: 12px !important; display: inline-block; }
                        .print-data-table th { background-color: #f1f5f9 !important; text-align: left !important; font-weight: bold !important; font-size: 9.5pt !important; text-transform: uppercase !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        
                        .print-comments-box { border: 2px solid #000000 !important; padding: 10px 12px !important; min-height: 80px !important; margin-bottom: 16px !important; color: #000000 !important; background: #ffffff !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        
                        .print-signatures-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 40px !important; margin-top: 30px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        .bulk-sig-col { text-align: center !important; }
                        .bulk-sig-img-wrap { height: 45px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 4px !important; }
                        .bulk-sig-img-wrap img { max-height: 45px !important; max-width: 120px !important; object-fit: contain !important; }
                        .print-sig-line { border-top: 1.5px solid #000000 !important; padding-top: 6px !important; font-size: 8.5pt !important; font-weight: bold !important; color: #000000 !important; text-transform: uppercase !important; }
                        
                        .html-content { width: 100% !important; max-width: 100% !important; word-wrap: break-word !important; overflow-wrap: break-word !important; }
                        .html-content p, .html-content span, .html-content li { margin: 0 0 6px 0 !important; color: #000000 !important; font-size: 10pt !important; line-height: 1.5 !important; white-space: normal !important; word-break: break-word !important; }
                        .html-content ul, .html-content ol { margin: 0 0 10px 0 !important; padding-left: 22px !important; color: #000000 !important; list-style-position: outside !important; }
                        .html-content li { margin-bottom: 4px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        
                        .html-content pre {
                            white-space: pre-wrap !important;
                            word-wrap: break-word !important;
                            word-break: break-all !important;
                            overflow-x: visible !important;
                            background-color: #f8fafc !important;
                            color: #000000 !important;
                            border: 1px solid #000000 !important;
                            padding: 10px !important;
                            border-radius: 4px !important;
                            font-family: monospace !important;
                            font-size: 8.5pt !important;
                            line-height: 1.4 !important;
                            margin: 10px 0 !important;
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                            display: block !important;
                        }
                        .html-content code { background-color: #f1f5f9 !important; color: #000000 !important; padding: 2px 4px !important; border-radius: 3px !important; font-size: 9pt !important; }
                        
                        .print-badge-item { border: 1px solid #000000 !important; padding: 2px 6px !important; font-size: 8.5pt !important; font-family: monospace !important; font-weight: bold !important; background: #ffffff !important; display: inline-block; }
                        .print-badge-item.prior-covered { border: 1px dashed #475569 !important; background: #f8fafc !important; font-weight: normal !important; color: #334155 !important; }
                        .print-badge-item.cwk-badge { background: #0284c7 !important; color: #ffffff !important; border: 1px solid #0369a1 !important; }
                        
                        /* ─── ✔️ FULL WIDTH UNROLLED WA REQUIREMENTS ROW LAYOUTS ─── */
                        .print-wa-description-row { display: flex !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 6px !important; font-size: 9.5pt !important; line-height: 1.4 !important; page-break-inside: avoid !important; break-inside: avoid !important; text-align: left !important; }
                        
                        .print-evidence-appendix-page { page-break-before: always !important; padding-top: 4mm; width: 100% !important; }
                        .print-evidence-frame-box { width: 100% !important; border: 2px solid #000000 !important; padding: 12px; text-align: center; background: #ffffff; margin-top: 12px; box-sizing: border-box !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        .print-evidence-embedded-image { max-width: 100% !important; max-height: 135mm !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }
                        
                        .print-additional-attachments-divider { page-break-before: always !important; page-break-after: always !important; padding-top: 25mm; text-align: center; }
                        .print-additional-attachments-divider h2 { font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #000000; margin: 0 0 8px 0; }
                        .print-additional-attachments-divider p { font-size: 9pt; color: #475569; margin: 0; }
                        .print-additional-attachment-page { page-break-before: always !important; padding-top: 4mm; width: 100% !important; }
                        
                        h1, h2, h3, h4 { break-after: avoid !important; page-break-after: avoid !important; }
                        tr { page-break-inside: avoid !important; break-inside: avoid !important; }
                    }
                `}
            </style>

            {chronologicalVersions.map((version, index) => {
                const versionNumber = index + 1;
                const displayDate = log.dateString ? moment(log.dateString).format('DD MMMM YYYY') : '____________________';
                const formattedHours = version.totalHours || log.totalHours || '0';

                const currentMilestones: string[] = version.selectedMilestones || [];
                const currentWaCodes = currentMilestones.filter(m => m.startsWith('WA'));
                const currentCwkCodes = currentMilestones.filter(m => m.startsWith('CWK'));
                
                const priorCoveredMilestones = Object.keys(historicalMilestoneMetrics).filter(code => !currentMilestones.includes(code));

                const associatedCustomEvidence: any[] = version.customEvidenceTracking || [];
                
                // Inject CWK Files into the main physical evidence ledger dynamically
                if (version.cwkEvidence && typeof version.cwkEvidence === 'object') {
                    Object.entries(version.cwkEvidence).forEach(([cwkCode, url]) => {
                        if (url && typeof url === 'string') {
                            associatedCustomEvidence.push({
                                code: cwkCode,
                                description: `Contextual Workplace Knowledge Proof Validation`,
                                type: 'file',
                                fileUrl: url,
                                linkedWorkActivities: [cwkCode]
                            });
                        }
                    });
                }

                // Resolve Contextual Signatures for specific historical version renders
                const currentLearnerSig = version.learnerSignatureUrl || version.signatureUrl || version.learnerSignature || version.signature || log.learnerSignatureUrl || learnerSig;
                const currentMentorSig = version.mentorSignatureUrl || (version.status === 'Approved' ? (log.mentorSignatureUrl || mentorSig) : '');

                return (
                    <React.Fragment key={version.updatedAt || index}>

                        {/* ─── PAGE LAYER 1: JOURNAL VIEW ─── */}
                        <div className="print-diary-page">
                            
                            {/* MASTER REGISTRY HEADER BLOCK */}
                            <table className="print-header-table">
                                <tbody>
                                    <tr style={{ backgroundColor: '#000000' }}>
                                        <td colSpan={4} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                            LEARNER AND EMPLOYER MASTER REGISTRY
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style={{ width: '20%' }}>CANDIDATE NAME</td>
                                        <td style={{ width: '30%' }}><span>{log.learnerName || '________________________'}</span></td>
                                        <td style={{ width: '20%' }}>COMPANY NAME</td>
                                        <td style={{ width: '30%' }}><span>{employerDetails?.companyName || 'Registered Host Employer'}</span></td>
                                    </tr>
                                    <tr>
                                        <td>CURRICULUM SPEC</td>
                                        <td><span>{log.workActivityCode || 'General'}</span></td>
                                        <td>PHYSICAL ADDRESS</td>
                                        <td><span>{employerDetails?.address || 'N/A'}</span></td>
                                    </tr>
                                    <tr>
                                        <td>SUPERVISOR NAME</td>
                                        <td><span>{mentorName || '________________________'}</span></td>
                                        <td>WORK TELEPHONE</td>
                                        <td><span>{employerDetails?.workTelephone || 'N/A'}</span></td>
                                    </tr>
                                    <tr>
                                        <td>ASSESSOR NAME</td>
                                        <td>
                                            {assessorName ? <span>{assessorName}</span> : <span style={{ color: '#d97706', fontStyle: 'italic', fontWeight: 'bold' }}>Pending Assignment</span>}
                                        </td>
                                        <td>E-MAIL</td>
                                        <td><span>{employerDetails?.email || 'N/A'}</span></td>
                                    </tr>
                                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                                        <td colSpan={2}>JOURNAL PERIOD: <span>{displayDate}</span></td>
                                        <td colSpan={2}>REVISION TRACK: <span style={{ fontStyle: 'italic', fontWeight: 'normal' }}>Page {versionNumber} of {chronologicalVersions.length}</span></td>
                                    </tr>
                                </tbody>
                            </table>

                            <table className="print-data-table">
                                <thead><tr><th style={{ width: '18%' }}>DATE</th><th style={{ width: '70%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE</th><th style={{ width: '12%', textAlign: 'center' }}>TOTAL HOURS</th></tr></thead>
                                <tbody>
                                    <tr>
                                        <td>
                                            <strong style={{ fontSize: '10.5pt', display: 'block', marginBottom: '4px' }}>{log.dateString ? moment(log.dateString).format('DD/MM/YYYY') : 'N/A'}</strong>
                                            <div style={{ fontSize: '8.5pt', fontWeight: 'normal', color: '#000000' }}>Shift: {log.startTime || '??:??'} - {log.endTime || '??:??'}</div>
                                        </td>
                                        <td>
                                            {log.isQctoAligned && (
                                                <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1.5px dashed #000000', fontSize: '9.5pt' }}>
                                                    <strong>Curriculum Unit:</strong> {log.workActivityCode} — {log.workActivityLabel || log.moduleName}
                                                    {log.topicTitle && <div style={{ fontStyle: 'italic', marginTop: '3px', fontWeight: 'normal' }}>Topic: {log.topicTitle}</div>}
                                                </div>
                                            )}

                                            <div className="html-content" style={{ fontSize: '10pt', color: '#000000', marginBottom: '16px' }} dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<em>No tasks entered.</em>' }} />

                                            {log.isQctoAligned && (
                                                <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
                                                    {/* ─── ✔️ UNROLLED WORK ACTIVITIES WITH FULL TEXT METRICS RENDER ─── */}
                                                    <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#000000', marginBottom: '6px', letterSpacing: '0.3px' }}>
                                                        Checked QCTO Work Activities (WA) Completed In This Shift:
                                                    </div>

                                                    {currentWaCodes.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                                                            {currentWaCodes.map(code => {
                                                                const textStringDescription = milestoneDescriptionsLookup[code] || 'Dynamic Curricular Workplace Milestone Objective';
                                                                return (
                                                                    <div key={code} className="print-wa-description-row">
                                                                        <span className="print-badge-item" style={{ flexShrink: 0 }}>✓ {code}</span>
                                                                        <span style={{ color: '#000000', fontWeight: 600 }}>{textStringDescription}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '8.5pt', fontStyle: 'italic', color: '#475569', marginBottom: '12px' }}>No activity codes checkmarked inside this revision timeline slot.</div>
                                                    )}

                                                    {/* ─── CONTEXTUAL KNOWLEDGE (CWK) UNROLLED RENDER ─── */}
                                                    {currentCwkCodes.length > 0 && (
                                                        <>
                                                            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#0369a1', marginBottom: '6px', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #bae6fd' }}>
                                                                Contextualized Workplace Knowledge Addressed:
                                                            </div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
                                                                {currentCwkCodes.map(code => {
                                                                    const textStringDescription = milestoneDescriptionsLookup[code] || 'Contextual Knowledge Framework Protocol';
                                                                    return (
                                                                        <div key={code} className="print-wa-description-row">
                                                                            <span className="print-badge-item cwk-badge" style={{ flexShrink: 0 }}>✓ {code}</span>
                                                                            <span style={{ color: '#000000', fontWeight: 600 }}>{textStringDescription}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </>
                                                    )}

                                                    {/* Prior Completed Milestones References */}
                                                    {priorCoveredMilestones.length > 0 && (
                                                        <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
                                                            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#475569', marginBottom: '4px' }}>Curriculum Objectives Credited Across Previous Shifts:</div>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                {priorCoveredMilestones.slice(0, 8).map(code => {
                                                                    const meta = historicalMilestoneMetrics[code];
                                                                    const priorTextDesc = milestoneDescriptionsLookup[code] || 'Secured Objective Metric';
                                                                    return (
                                                                        <div key={code} className="print-wa-description-row" style={{ opacity: 0.85 }}>
                                                                            <span className="print-badge-item prior-covered" style={{ flexShrink: 0, opacity: 0.8 }}>{code}</span>
                                                                            <span style={{ color: '#334155', fontSize: '9pt' }}>
                                                                                {priorTextDesc} <span style={{ fontWeight: 'bold', color: '#475569' }}>({meta?.count} shifts logged)</span>
                                                                            </span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12pt', verticalAlign: 'middle' }}>{formattedHours}</td>
                                    </tr>
                                </tbody>
                            </table>

                            <div className="print-comments-box">
                                <strong style={{ fontSize: '9.5pt', textTransform: 'uppercase' }}>SUPERVISOR COMMENTS / REMEDIAL / IMPROVEMENT AREAS</strong>
                                <div className="html-content" style={{ marginTop: '8px', fontSize: '10pt', color: '#000000' }}>
                                    {version.rejectionReason ? (
                                        <div dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
                                    ) : version.status === 'Approved' ? (
                                        <>
                                            <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>✓ Digitally authenticated and verified via system access matching secure user profile validation keys.</p>
                                            {version.reason && <div dangerouslySetInnerHTML={{ __html: version.reason }} style={{ fontStyle: 'italic', color: '#166534', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }} />}
                                        </>
                                    ) : (
                                        <p style={{ color: '#000000', fontStyle: 'italic' }}>No correction notes logged. Record preserved under verification state: "{version.status}".</p>
                                    )}
                                </div>
                            </div>

                            {/* DIGITAL SIGNATURE RENDER GRID WITH PROPS */}
                            <div className="print-signatures-grid">
                                <div className="bulk-sig-col">
                                    <div className="bulk-sig-img-wrap">
                                        {currentMentorSig ? <img src={currentMentorSig} alt="Supervisor Certified Stamp" crossOrigin="anonymous" /> : <div style={{ height: '35px' }}></div>}
                                    </div>
                                    <div className="print-sig-line">SUPERVISOR SIGNATURE</div>
                                    <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{mentorName || '________________________'}</div>
                                </div>
                                <div className="bulk-sig-col">
                                    <div className="bulk-sig-img-wrap">
                                        {assessorSig ? (
                                            <img src={assessorSig} alt="Internal Assessor Stamp" crossOrigin="anonymous" />
                                        ) : (
                                            <div style={{ height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '8pt', fontStyle: 'italic', fontWeight: 'bold' }}>
                                                Pending Assignment
                                            </div>
                                        )}
                                    </div>
                                    <div className="print-sig-line">ASSESSOR SIGNATURE</div>
                                    <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>
                                        {assessorName || 'Internal/External Quality Assessor'}
                                    </div>
                                </div>
                                <div className="bulk-sig-col">
                                    <div className="bulk-sig-img-wrap">
                                        {currentLearnerSig ? <img src={currentLearnerSig} alt="Candidate Signature" crossOrigin="anonymous" /> : <div style={{ height: '35px' }}></div>}
                                    </div>
                                    <div className="print-sig-line">LEARNER SIGNATURE</div>
                                    <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{log.learnerName || '________________________'}</div>
                                </div>
                            </div>
                        </div>

                        {/* ─── PAGE LAYER 2: EVIDENCE REFERENCE MASTER REGISTRY INDEX ─── */}
                        {associatedCustomEvidence.length > 0 && (
                            <div className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
                                <table className="print-header-table" style={{ marginBottom: '14px' }}>
                                    <tbody>
                                        <tr style={{ backgroundColor: '#000000' }}>
                                            <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>
                                                EVIDENCE INTEGRITY REGISTRY — PORTFOLIO REFERENCE MASTER SHEET (LANDSCAPE MODE)
                                            </td>
                                        </tr>
                                        <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>LOG SHIFT DATE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{displayDate}</td></tr>
                                        <tr><td style={{ fontSize: '8.5pt' }}>TOTAL TRACKED ARTIFACTS</td><td style={{ fontSize: '9pt', fontWeight: 'bold' }}>{associatedCustomEvidence.length} Item(s) Linked</td></tr>
                                    </tbody>
                                </table>

                                {associatedCustomEvidence.map((seItem: any, innerSeIdx: number) => {
                                    const isCwkProof = seItem.code.startsWith('CWK');
                                    
                                    return (
                                        <div key={innerSeIdx} style={{ border: `2px solid ${isCwkProof ? '#0284c7' : '#000000'}`, padding: '12px', background: isCwkProof ? '#f0f9ff' : '#ffffff', marginBottom: '12px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${isCwkProof ? '#bae6fd' : '#000000'}`, paddingBottom: '4px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: isCwkProof ? '#0369a1' : '#000000' }}>Artifact Reference Code: {seItem.code}</span>
                                                <span style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#475569' }}>Category: {seItem.type || 'file'}</span>
                                            </div>
                                            <div style={{ fontSize: '9.5pt', color: '#000000', marginBottom: '6px' }}>
                                                <strong>Evidence Description Name:</strong> {seItem.description}
                                            </div>

                                            {/* ─── ✔️ UNROLLED ARTIFACT TARGET RELATION MAPPING TRACE ─── */}
                                            {seItem.linkedWorkActivities && seItem.linkedWorkActivities.length > 0 && (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', background: isCwkProof ? '#ffffff' : '#f8fafc', padding: '6px 10px', border: `1px solid ${isCwkProof ? '#bae6fd' : '#e2e8f0'}` }}>
                                                    <span style={{ fontSize: '8pt', fontWeight: 'bold', color: isCwkProof ? '#0284c7' : '#475569', textTransform: 'uppercase' }}>Relational Assessor Trace — This Proof Item Validates WAs:</span>
                                                    {seItem.linkedWorkActivities.map((wCode: string) => {
                                                        const boundWaDescriptionText = milestoneDescriptionsLookup[wCode] || 'Work Activity Criterion Objective';
                                                        return (
                                                            <div key={wCode} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '8.5pt', lineHeight: 1.35 }}>
                                                                <span style={{ background: isCwkProof ? '#0284c7' : '#000000', color: '#ffffff', fontSize: '7pt', fontFamily: 'monospace', padding: '1px 4px', fontWeight: 'bold', borderRadius: '2px', flexShrink: 0 }}>{wCode}</span>
                                                                <span style={{ color: '#1e293b' }}>{boundWaDescriptionText}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <div style={{ fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all', color: '#000000', background: '#ffffff', padding: '6px 10px', border: `1px solid ${isCwkProof ? '#bae6fd' : '#cbd5e1'}` }}>
                                                <strong>Storage Location URI:</strong> {seItem.fileUrl || 'No digital reference found.'}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ─── PAGE LAYER 3: DEDICATED FULL APPENDIX ENVELOPES ─── */}
                        {associatedCustomEvidence.map((seItem: any, innerFileIdx: number) => {
                            const isImage = isPrintableImage(seItem.fileUrl);
                            const isLink = seItem.type === 'link';
                            const isCwkProof = seItem.code.startsWith('CWK');

                            return (
                                <div key={innerFileIdx} className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
                                    <table className="print-header-table" style={{ marginBottom: '12px' }}>
                                        <tbody>
                                            <tr style={{ backgroundColor: isCwkProof ? '#0369a1' : '#000000' }}>
                                                <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '9.5pt', padding: '5px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                                    PORTFOLIO EVIDENCE ENVELOPE — REF: {seItem.code}
                                                </td>
                                            </tr>
                                            <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>ARTIFACT TYPE</td><td style={{ width: '75%', fontWeight: 'bold', fontSize: '9pt', textTransform: 'uppercase' }}>{seItem.type || 'FILE'}</td></tr>
                                            <tr><td style={{ fontSize: '8.5pt' }}>DESCRIPTION / LABEL</td><td style={{ fontWeight: 'normal', fontSize: '9pt' }}>{seItem.description}</td></tr>
                                            <tr>
                                                <td style={{ fontSize: '8.5pt' }}>CONNECTED OBJECTIVES</td>
                                                <td style={{ fontWeight: 'normal', fontSize: '9pt' }}>
                                                    {seItem.linkedWorkActivities?.map((c: string) => {
                                                        const miniDesc = milestoneDescriptionsLookup[c] || '';
                                                        return miniDesc ? `${c} (${miniDesc})` : c;
                                                    }).join(' | ') || 'None'}
                                                </td>
                                            </tr>
                                            <tr><td style={{ fontSize: '8.5pt' }}>DIGITAL ENDPOINT TARGET</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all', color: '#000000' }}>{seItem.fileUrl || 'N/A'}</td></tr>
                                        </tbody>
                                    </table>

                                    {isLink ? (
                                        <div style={{ padding: '25px 20px', border: '2px dashed #000000', background: '#ffffff', textAlign: 'center', marginTop: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                            <div style={{ fontSize: '24pt', marginBottom: '6px' }}>🔗</div>
                                            <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                EXTERNAL SYSTEM RESOURCE RECORD INDEXED
                                            </h3>
                                            <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', maxWidth: '750px', lineHeight: 1.5, textAlign: 'left' }}>
                                                This specific piece of evidence traces back to a live, external cloud-hosted workspace asset (such as an active deployment instance, project roadmap kanban board, or a collaborative design canvas).
                                            </p>
                                            <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', maxWidth: '750px', lineHeight: 1.5, textAlign: 'left' }}>
                                                External moderators and audit team members reviewing this physical log folder can inspect the complete interactive version history path directly by utilizing their digital system consoles to parse the uniform target URI string mapped above.
                                            </p>
                                            <div style={{ borderTop: '1px solid #000000', paddingTop: '8px', marginTop: '12px', textAlign: 'left', fontSize: '8.5pt' }}>
                                                <strong>Institutional Compliance Note:</strong> Audit point successfully bound under registry token reference <strong>{seItem.code}</strong>.
                                            </div>
                                        </div>
                                    ) : isImage ? (
                                        <div className="print-evidence-frame-box">
                                            <img src={seItem.fileUrl} className="print-evidence-embedded-image" alt="file" crossOrigin="anonymous" onLoad={handlePdfLoaded} />
                                        </div>
                                    ) : (
                                        <PrintablePdfUnroller url={seItem.fileUrl} />
                                    )}
                                </div>
                            );
                        })}

                        {/* Backward Compatibility Summary Fallback Sheet */}
                        {version.evidenceUrl && (
                            <div className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
                                <table className="print-header-table" style={{ marginBottom: '10px' }}>
                                    <tbody>
                                        <tr style={{ backgroundColor: '#000000' }}>
                                            <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>
                                                EVIDENCE INTEGRITY REGISTRY — PORTFOLIO ARTIFACT SUMMARY
                                            </td>
                                        </tr>
                                        <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>LOG SHIFT DATE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{displayDate}</td></tr>
                                        <tr><td style={{ fontSize: '8.5pt' }}>SECURE CLOUD STORAGE URL</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all' }}>{version.evidenceUrl}</td></tr>
                                    </tbody>
                                </table>

                                {isPrintableImage(version.evidenceUrl) ? (
                                    <div className="print-evidence-frame-box">
                                        <img src={version.evidenceUrl} className="print-evidence-embedded-image" alt="Evidence" crossOrigin="anonymous" onLoad={handlePdfLoaded} />
                                    </div>
                                ) : (
                                    <PrintablePdfUnroller url={version.evidenceUrl} />
                                )}
                            </div>
                        )}
                    </React.Fragment>
                );
            })}

            {/* Supplementary Multi-Document Attachments Blocks */}
            {additionalAttachments.length > 0 && (
                <>
                    <div className="print-additional-attachments-divider">
                        <h2>SUPPLEMENTARY ATTACHMENTS</h2>
                        <p>{additionalAttachments.length} additional document(s) follow this page</p>
                    </div>

                    {additionalAttachments.map((attachment, idx) => (
                        <div key={idx} className="print-additional-attachment-page">
                            <table className="print-header-table" style={{ marginBottom: '10px' }}>
                                <tbody>
                                    <tr style={{ backgroundColor: '#000000' }}><td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>SUPPLEMENTARY ATTACHMENT {idx + 1} OF {additionalAttachments.length}</td></tr>
                                    <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>DOCUMENT TITLE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{attachment.label || getFileName(attachment.url)}</td></tr>
                                    {attachment.description && (<tr><td style={{ fontSize: '8.5pt' }}>DESCRIPTION</td><td style={{ fontWeight: 'normal', fontSize: '9pt' }}>{attachment.description}</td></tr>)}
                                    <tr><td style={{ fontSize: '8.5pt' }}>SOURCE URI</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all' }}>{attachment.url}</td></tr>
                                </tbody>
                            </table>

                            {isPrintableImage(attachment.url) ? (
                                <div className="print-evidence-frame-box">
                                    <img src={attachment.url} className="print-evidence-embedded-image" alt="Supplementary Attachment" crossOrigin="anonymous" onLoad={handlePdfLoaded} />
                                </div>
                            ) : (
                                <PrintablePdfUnroller url={attachment.url} />
                            )}
                        </div>
                    ))}
                </>
            )}
        </div>
    );
};



// // src/components/views/WorkplaceModulePrintable/WorkplaceModulePrintable.tsx

// import React, { useState, useEffect, useMemo, useCallback } from 'react';
// import moment from 'moment';

// // ─── Types ───────────────────────────────────────────────────────────

// interface HistoricalMetrics {
//     count: number;
//     totalHours: number;
// }

// interface AdditionalAttachment {
//     url: string;
//     label?: string;
//     description?: string;
// }

// interface WorkplaceLogPrintableProps {
//     log: any;
//     logVersions: any[];
//     mentorName: string;
//     assessorName?: string;
//     learnerSig?: string;
//     mentorSig?: string;
//     assessorSig?: string;
//     employerDetails?: {
//         companyName: string;
//         address: string;
//         workTelephone: string;
//         email: string;
//     };
//     historicalMilestoneMetrics?: Record<string, HistoricalMetrics>;
//     additionalAttachments?: AdditionalAttachment[];
//     moduleTopics?: any[];
//     onReady?: () => void;
// }

// const MILESTONE_LABEL_MAP: Record<string, string> = {
//     'WA0101': 'Attend induction program and familiarise self with company culture',
//     'WA0102': 'Familiarise self with legislation in the workplace',
//     'WA0103': 'Apply protocols and work etiquette',
//     'WA0104': 'Attend company specific information sharing sessions',
//     'WA0105': 'Familiarise self with and apply "working from anywhere" protocols',
//     'WA0106': 'Comply with governance protocols, code of ethics, and data privacy (POPIA)',
//     'WA0107': 'Observe department process flows and do process modeling mapping',
//     'WA0108': 'Understand management requirements and software solutions expectations',
//     'WA0109': 'Understand business computer systems and engineering team workflows',
//     'WA0110': 'Manage timesheets and apply self-management skills',
//     'WA0111': 'Collaborate with team members throughout the work experience period',

//     'CWK01': 'Workplace Hazard Inspection and Risk Assessment procedures',
//     'CWK02': 'Material request and storage procedures',
//     'CWK03': 'Equipment handling and storage procedures',
//     'CWK04': 'Conditions of employment',
// };

// // ─── Helpers ─────────────────────────────────────────────────────────

// const isPrintableImage = (url: string): boolean => {
//     if (!url) return false;
//     const cleanUrl = url.split('?')[0].toLowerCase();
//     return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.gif');
// };

// const getFileName = (url: string): string => {
//     if (!url) return 'Unknown';
//     try {
//         const parsed = new URL(url);
//         return decodeURIComponent(parsed.pathname.split('/').pop() || 'document');
//     } catch {
//         return url.split('/').pop() || 'document';
//     }
// };

// // ─── Enhanced PDF Unroller Component ─────────────────────────────────

// const PrintablePdfUnroller: React.FC<{ url: string }> = ({ url }) => {
//     const [failed, setFailed] = useState(false);
//     const cleanUrl = url?.replace(/\s+/g, '');
//     const inlineUrl = cleanUrl ? `${cleanUrl}&response-content-disposition=inline` : cleanUrl;

//     if (!cleanUrl || failed) {
//         return (
//             <div style={{ padding: '25px 20px', border: '2px solid #000000', background: '#fafbfc', textAlign: 'center', fontFamily: 'Arial, sans-serif', marginTop: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
//                 <div style={{ fontSize: '22pt', marginBottom: '6px' }}>📋</div>
//                 <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase' }}>
//                     SECURE ATTACHMENT PORTFOLIO INDEXED
//                 </h3>
//                 <p style={{ margin: '0 auto 12px', fontSize: '9.5pt', color: '#334155', maxWidth: '600px', lineHeight: 1.5 }}>
//                     This document could not be embedded automatically. Please verify or print the original file directly via your dashboard console, or insert the original document physically behind this reference tracker page.
//                 </p>
//                 <div style={{ fontSize: '8pt', fontFamily: 'monospace', color: '#4b5563', background: '#f3f4f6', padding: '6px 12px', display: 'inline-block', borderRadius: '4px', maxWidth: '100%', wordBreak: 'break-all' }}>
//                     System URI Token: {cleanUrl}
//                 </div>
//             </div>
//         );
//     }

//     return (
//         <div style={{ pageBreakBefore: 'always', marginTop: '20px', width: '100%', textAlign: 'center', boxSizing: 'border-box' }}>
//             <div style={{ fontSize: '8pt', fontWeight: 'bold', textAlign: 'left', marginBottom: '6px', textTransform: 'uppercase', color: '#475569', borderBottom: '1px solid #000000', paddingBottom: '3px' }}>
//                 Document Attachment Component
//             </div>
//             <embed
//                 src={inlineUrl}
//                 type="application/pdf"
//                 style={{ width: '100%', height: '520px', border: 'none', display: 'block' }}
//                 onError={() => setFailed(true)}
//             />
//         </div>
//     );
// };

// // ─── Main Printable Document Component ────────────────────────────────

// export const WorkplaceLogPrintable: React.FC<WorkplaceLogPrintableProps> = ({
//     log,
//     logVersions,
//     mentorName,
//     assessorName,
//     learnerSig,
//     mentorSig,
//     assessorSig,
//     employerDetails,
//     historicalMilestoneMetrics = {},
//     additionalAttachments = [],
//     moduleTopics = [],
//     onReady
// }) => {
//     const chronologicalVersions = useMemo(() => [...logVersions].reverse(), [logVersions]);

//     // ─── ⚡ REAL-TIME CURRICULUM DESCRIPTION TRANSLATION DICTIONARY ───
//     const milestoneDescriptionsLookup = useMemo(() => {
//         const dictionaryMap: Record<string, string> = { ...MILESTONE_LABEL_MAP };
//         if (!moduleTopics || !Array.isArray(moduleTopics)) return dictionaryMap;

//         moduleTopics.forEach((topic: any) => {
//             if (topic.criteria && Array.isArray(topic.criteria)) {
//                 topic.criteria.forEach((criterion: any) => {
//                     if (criterion.code) {
//                         dictionaryMap[criterion.code] = criterion.description || criterion.label || criterion.title || '';
//                     }
//                 });
//             }
//         });
//         return dictionaryMap;
//     }, [moduleTopics]);

//     const totalPdfCount = useMemo(() => {
//         let count = 0;
//         chronologicalVersions.forEach(v => {
//             if (v.evidenceUrl && !isPrintableImage(v.evidenceUrl)) count++;
//             if (Array.isArray(v.customEvidenceTracking)) {
//                 v.customEvidenceTracking.forEach((item: any) => {
//                     if (item.type !== 'link' && item.fileUrl && !isPrintableImage(item.fileUrl)) {
//                         count++;
//                     }
//                 });
//             }
//             if (v.cwkEvidence && typeof v.cwkEvidence === 'object') {
//                 Object.values(v.cwkEvidence).forEach(url => {
//                     if (typeof url === 'string' && !isPrintableImage(url)) count++;
//                 });
//             }
//         });
//         additionalAttachments.forEach(a => { if (!isPrintableImage(a.url)) count++; });
//         return count;
//     }, [chronologicalVersions, additionalAttachments]);

//     const [loadedPdfCount, setLoadedPdfCount] = useState(0);

//     useEffect(() => {
//         if (totalPdfCount === 0 || loadedPdfCount === totalPdfCount) {
//             onReady?.();
//         }
//     }, [loadedPdfCount, totalPdfCount, onReady]);

//     const handlePdfLoaded = useCallback(() => {
//         setLoadedPdfCount(prev => prev + 1);
//     }, []);

//     return (
//         <div className="qcto-diary-print-container active-log-print">
//             <style type="text/css">
//                 {`
//                     .qcto-diary-print-container { display: none !important; }
                    
//                     @media print {
//                         @page { 
//                             size: A4 landscape !important; 
//                             margin: 10mm 12mm 10mm 12mm !important; 
//                         }

//                         body > * { display: none !important; height: 0 !important; overflow: hidden !important; }
//                         body > .qcto-diary-print-container.active-log-print { display: block !important; height: auto !important; overflow: visible !important; position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important; font-size: 10pt !important; line-height: 1.4 !important; }
//                         .qcto-diary-print-container.active-log-print * { display: revert; }
                        
//                         .print-diary-page { page-break-after: always !important; padding-top: 2mm; padding-bottom: 4mm; }
//                         .print-diary-page:last-of-type { page-break-after: auto !important; }
                        
//                         .print-header-table, .print-data-table { width: 100% !important; border-collapse: collapse !important; margin-bottom: 16px !important; border: 2px solid #000000 !important; }
//                         .print-header-table td, .print-data-table th, .print-data-table td { border: 1px solid #000000 !important; padding: 8px 12px !important; color: #000000 !important; }
//                         .print-header-table td { font-weight: bold !important; font-size: 10pt !important; }
//                         .print-header-table td span { font-weight: normal !important; margin-left: 12px !important; display: inline-block; }
//                         .print-data-table th { background-color: #f1f5f9 !important; text-align: left !important; font-weight: bold !important; font-size: 9.5pt !important; text-transform: uppercase !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        
//                         .print-comments-box { border: 2px solid #000000 !important; padding: 10px 12px !important; min-height: 80px !important; margin-bottom: 16px !important; color: #000000 !important; background: #ffffff !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        
//                         .print-signatures-grid { display: grid !important; grid-template-columns: 1fr 1fr 1fr !important; gap: 40px !important; margin-top: 30px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
//                         .bulk-sig-col { text-align: center !important; }
//                         .bulk-sig-img-wrap { height: 45px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 4px !important; }
//                         .bulk-sig-img-wrap img { max-height: 45px !important; max-width: 120px !important; object-fit: contain !important; }
//                         .print-sig-line { border-top: 1.5px solid #000000 !important; padding-top: 6px !important; font-size: 8.5pt !important; font-weight: bold !important; color: #000000 !important; text-transform: uppercase !important; }
                        
//                         .html-content { width: 100% !important; max-width: 100% !important; word-wrap: break-word !important; overflow-wrap: break-word !important; }
//                         .html-content p, .html-content span, .html-content li { margin: 0 0 6px 0 !important; color: #000000 !important; font-size: 10pt !important; line-height: 1.5 !important; white-space: normal !important; word-break: break-word !important; }
//                         .html-content ul, .html-content ol { margin: 0 0 10px 0 !important; padding-left: 22px !important; color: #000000 !important; list-style-position: outside !important; }
//                         .html-content li { margin-bottom: 4px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        
//                         .html-content pre {
//                             white-space: pre-wrap !important;
//                             word-wrap: break-word !important;
//                             word-break: break-all !important;
//                             overflow-x: visible !important;
//                             background-color: #f8fafc !important;
//                             color: #000000 !important;
//                             border: 1px solid #000000 !important;
//                             padding: 10px !important;
//                             border-radius: 4px !important;
//                             font-family: monospace !important;
//                             font-size: 8.5pt !important;
//                             line-height: 1.4 !important;
//                             margin: 10px 0 !important;
//                             page-break-inside: avoid !important;
//                             break-inside: avoid !important;
//                             display: block !important;
//                         }
//                         .html-content code { background-color: #f1f5f9 !important; color: #000000 !important; padding: 2px 4px !important; border-radius: 3px !important; font-size: 9pt !important; }
                        
//                         .print-badge-item { border: 1px solid #000000 !important; padding: 2px 6px !important; font-size: 8.5pt !important; font-family: monospace !important; font-weight: bold !important; background: #ffffff !important; display: inline-block; }
//                         .print-badge-item.prior-covered { border: 1px dashed #475569 !important; background: #f8fafc !important; font-weight: normal !important; color: #334155 !important; }
//                         .print-badge-item.cwk-badge { background: #0284c7 !important; color: #ffffff !important; border: 1px solid #0369a1 !important; }
                        
//                         /* ─── ✔️ FULL WIDTH UNROLLED WA REQUIREMENTS ROW LAYOUTS ─── */
//                         .print-wa-description-row { display: flex !important; align-items: flex-start !important; gap: 8px !important; margin-bottom: 6px !important; font-size: 9.5pt !important; line-height: 1.4 !important; page-break-inside: avoid !important; break-inside: avoid !important; text-align: left !important; }
                        
//                         .print-evidence-appendix-page { page-break-before: always !important; padding-top: 4mm; width: 100% !important; }
//                         .print-evidence-frame-box { width: 100% !important; border: 2px solid #000000 !important; padding: 12px; text-align: center; background: #ffffff; margin-top: 12px; box-sizing: border-box !important; page-break-inside: avoid !important; break-inside: avoid !important; }
//                         .print-evidence-embedded-image { max-width: 100% !important; max-height: 135mm !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }
                        
//                         .print-additional-attachments-divider { page-break-before: always !important; page-break-after: always !important; padding-top: 25mm; text-align: center; }
//                         .print-additional-attachments-divider h2 { font-size: 14pt; font-weight: bold; text-transform: uppercase; letter-spacing: 2px; color: #000000; margin: 0 0 8px 0; }
//                         .print-additional-attachments-divider p { font-size: 9pt; color: #475569; margin: 0; }
//                         .print-additional-attachment-page { page-break-before: always !important; padding-top: 4mm; width: 100% !important; }
                        
//                         h1, h2, h3, h4 { break-after: avoid !important; page-break-after: avoid !important; }
//                         tr { page-break-inside: avoid !important; break-inside: avoid !important; }
//                     }
//                 `}
//             </style>

//             {chronologicalVersions.map((version, index) => {
//                 const versionNumber = index + 1;
//                 const displayDate = log.dateString ? moment(log.dateString).format('DD MMMM YYYY') : '____________________';
//                 const formattedHours = version.totalHours || log.totalHours || '0';

//                 const currentMilestones: string[] = version.selectedMilestones || [];
//                 const currentWaCodes = currentMilestones.filter(m => m.startsWith('WA'));
//                 const currentCwkCodes = currentMilestones.filter(m => m.startsWith('CWK'));

//                 const priorCoveredMilestones = Object.keys(historicalMilestoneMetrics).filter(code => !currentMilestones.includes(code));

//                 const associatedCustomEvidence: any[] = version.customEvidenceTracking || [];

//                 // Inject CWK Files into the main physical evidence ledger dynamically
//                 if (version.cwkEvidence && typeof version.cwkEvidence === 'object') {
//                     Object.entries(version.cwkEvidence).forEach(([cwkCode, url]) => {
//                         if (url && typeof url === 'string') {
//                             associatedCustomEvidence.push({
//                                 code: cwkCode,
//                                 description: `Contextual Workplace Knowledge Proof Validation`,
//                                 type: 'file',
//                                 fileUrl: url,
//                                 linkedWorkActivities: [cwkCode]
//                             });
//                         }
//                     });
//                 }

//                 // 🚀 Resolve Contextual Signatures for specific historical version renders
//                 const currentLearnerSig = version.learnerSignatureUrl || version.signatureUrl || version.learnerSignature || version.signature || log.learnerSignatureUrl || learnerSig;
//                 const currentMentorSig = version.mentorSignatureUrl || (version.status === 'Approved' ? (log.mentorSignatureUrl || mentorSig) : '');

//                 return (
//                     <React.Fragment key={version.updatedAt || index}>

//                         {/* ─── PAGE LAYER 1: JOURNAL VIEW ─── */}
//                         <div className="print-diary-page">

//                             {/* 🚀 NEW EXTENDED MASTER REGISTRY HEADER BLOCK */}
//                             <table className="print-header-table">
//                                 <tbody>
//                                     <tr style={{ backgroundColor: '#000000' }}>
//                                         <td colSpan={4} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
//                                             LEARNER AND EMPLOYER MASTER REGISTRY
//                                         </td>
//                                     </tr>
//                                     <tr>
//                                         <td style={{ width: '20%' }}>CANDIDATE NAME</td>
//                                         <td style={{ width: '30%' }}><span>{log.learnerName || '________________________'}</span></td>
//                                         <td style={{ width: '20%' }}>COMPANY NAME</td>
//                                         <td style={{ width: '30%' }}><span>{employerDetails?.companyName || 'Registered Host Employer'}</span></td>
//                                     </tr>
//                                     <tr>
//                                         <td>CURRICULUM SPEC</td>
//                                         <td><span>{log.workActivityCode || 'General'}</span></td>
//                                         <td>PHYSICAL ADDRESS</td>
//                                         <td><span>{employerDetails?.address || 'N/A'}</span></td>
//                                     </tr>
//                                     <tr>
//                                         <td>SUPERVISOR NAME</td>
//                                         <td><span>{mentorName || '________________________'}</span></td>
//                                         <td>WORK TELEPHONE</td>
//                                         <td><span>{employerDetails?.workTelephone || 'N/A'}</span></td>
//                                     </tr>
//                                     <tr>
//                                         <td>ASSESSOR NAME</td>
//                                         <td>
//                                             {assessorName ? <span>{assessorName}</span> : <span style={{ color: '#d97706', fontStyle: 'italic', fontWeight: 'bold' }}>Pending Assignment</span>}
//                                         </td>
//                                         <td>E-MAIL</td>
//                                         <td><span>{employerDetails?.email || 'N/A'}</span></td>
//                                     </tr>
//                                     <tr style={{ backgroundColor: '#f1f5f9' }}>
//                                         <td colSpan={2}>JOURNAL PERIOD: <span>{displayDate}</span></td>
//                                         <td colSpan={2}>REVISION TRACK: <span style={{ fontStyle: 'italic', fontWeight: 'normal' }}>Page {versionNumber} of {chronologicalVersions.length}</span></td>
//                                     </tr>
//                                 </tbody>
//                             </table>

//                             <table className="print-data-table">
//                                 <thead><tr><th style={{ width: '18%' }}>DATE</th><th style={{ width: '70%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE</th><th style={{ width: '12%', textAlign: 'center' }}>TOTAL HOURS</th></tr></thead>
//                                 <tbody>
//                                     <tr>
//                                         <td>
//                                             <strong style={{ fontSize: '10.5pt', display: 'block', marginBottom: '4px' }}>{log.dateString ? moment(log.dateString).format('DD/MM/YYYY') : 'N/A'}</strong>
//                                             <div style={{ fontSize: '8.5pt', fontWeight: 'normal', color: '#000000' }}>Shift: {log.startTime || '??:??'} - {log.endTime || '??:??'}</div>
//                                         </td>
//                                         <td>
//                                             {log.isQctoAligned && (
//                                                 <div style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1.5px dashed #000000', fontSize: '9.5pt' }}>
//                                                     <strong>Curriculum Unit:</strong> {log.workActivityCode} — {log.workActivityLabel || log.moduleName}
//                                                     {log.topicTitle && <div style={{ fontStyle: 'italic', marginTop: '3px', fontWeight: 'normal' }}>Topic: {log.topicTitle}</div>}
//                                                 </div>
//                                             )}

//                                             <div className="html-content" style={{ fontSize: '10pt', color: '#000000', marginBottom: '16px' }} dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<em>No tasks entered.</em>' }} />

//                                             {log.isQctoAligned && (
//                                                 <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid #e2e8f0' }}>
//                                                     {/* ─── ✔️ UNROLLED WORK ACTIVITIES WITH FULL TEXT METRICS RENDER ─── */}
//                                                     <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#000000', marginBottom: '6px', letterSpacing: '0.3px' }}>
//                                                         Checked QCTO Work Activities (WA) Completed In This Shift:
//                                                     </div>

//                                                     {currentWaCodes.length > 0 ? (
//                                                         <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
//                                                             {currentWaCodes.map(code => {
//                                                                 const textStringDescription = milestoneDescriptionsLookup[code] || 'Dynamic Curricular Workplace Milestone Performance Objective';
//                                                                 return (
//                                                                     <div key={code} className="print-wa-description-row">
//                                                                         <span className="print-badge-item" style={{ flexShrink: 0 }}>✓ {code}</span>
//                                                                         <span style={{ color: '#000000', fontWeight: 600 }}>{textStringDescription}</span>
//                                                                     </div>
//                                                                 );
//                                                             })}
//                                                         </div>
//                                                     ) : (
//                                                         <div style={{ fontSize: '8.5pt', fontStyle: 'italic', color: '#475569', marginBottom: '12px' }}>No activity codes checkmarked inside this revision timeline slot.</div>
//                                                     )}

//                                                     {/* ─── 🚀 CONTEXTUAL KNOWLEDGE (CWK) UNROLLED RENDER ─── */}
//                                                     {currentCwkCodes.length > 0 && (
//                                                         <>
//                                                             <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#0369a1', marginBottom: '6px', marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #bae6fd' }}>
//                                                                 Contextualized Workplace Knowledge Addressed:
//                                                             </div>
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
//                                                                 {currentCwkCodes.map(code => {
//                                                                     const textStringDescription = milestoneDescriptionsLookup[code] || 'Contextual Knowledge Framework Protocol';
//                                                                     return (
//                                                                         <div key={code} className="print-wa-description-row">
//                                                                             <span className="print-badge-item cwk-badge" style={{ flexShrink: 0 }}>✓ {code}</span>
//                                                                             <span style={{ color: '#000000', fontWeight: 600 }}>{textStringDescription}</span>
//                                                                         </div>
//                                                                     );
//                                                                 })}
//                                                             </div>
//                                                         </>
//                                                     )}

//                                                     {/* Prior Completed Milestones References */}
//                                                     {priorCoveredMilestones.length > 0 && (
//                                                         <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e8f0', paddingTop: '6px' }}>
//                                                             <div style={{ fontSize: '8.5pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#475569', marginBottom: '4px' }}>Curriculum Objectives Credited Across Previous Shifts:</div>
//                                                             <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                                                 {priorCoveredMilestones.slice(0, 8).map(code => {
//                                                                     const meta = historicalMilestoneMetrics[code];
//                                                                     const priorTextDesc = milestoneDescriptionsLookup[code] || 'Secured Objective Metric';
//                                                                     const isCwk = code.startsWith('CWK');
//                                                                     return (
//                                                                         <div key={code} className="print-wa-description-row" style={{ opacity: 0.85 }}>
//                                                                             <span className={`print-badge-item prior-covered ${isCwk ? 'cwk-badge' : ''}`} style={{ flexShrink: 0, opacity: 0.8 }}>{code}</span>
//                                                                             <span style={{ color: '#334155', fontSize: '9pt' }}>
//                                                                                 {priorTextDesc} <span style={{ fontWeight: 'bold', color: '#475569' }}>({meta?.count} shifts logged)</span>
//                                                                             </span>
//                                                                         </div>
//                                                                     );
//                                                                 })}
//                                                                 {priorCoveredMilestones.length > 8 && (
//                                                                     <div style={{ fontSize: '8.5pt', fontStyle: 'italic', color: '#64748b', paddingLeft: '4px', marginTop: '2px' }}>
//                                                                         ...and {priorCoveredMilestones.length - 8} additional curriculum milestone markers verified across core past logs.
//                                                                     </div>
//                                                                 )}
//                                                             </div>
//                                                         </div>
//                                                     )}
//                                                 </div>
//                                             )}
//                                         </td>
//                                         <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12pt', verticalAlign: 'middle' }}>{formattedHours}</td>
//                                     </tr>
//                                 </tbody>
//                             </table>

//                             <div className="print-comments-box">
//                                 <strong style={{ fontSize: '9.5pt', textTransform: 'uppercase' }}>SUPERVISOR COMMENTS / REMEDIAL / IMPROVEMENT AREAS</strong>
//                                 <div className="html-content" style={{ marginTop: '8px', fontSize: '10pt', color: '#000000' }}>
//                                     {version.rejectionReason ? (
//                                         <div dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
//                                     ) : version.status === 'Approved' ? (
//                                         <>
//                                             <p style={{ fontWeight: 'bold', marginBottom: '8px' }}>✓ Digitally authenticated and verified via system access matching secure user profile validation keys.</p>
//                                             {version.reason && <div dangerouslySetInnerHTML={{ __html: version.reason }} style={{ fontStyle: 'italic', color: '#166534', borderTop: '1px dashed #cbd5e1', paddingTop: '6px' }} />}
//                                         </>
//                                     ) : (
//                                         <p style={{ color: '#000000', fontStyle: 'italic' }}>No correction notes logged. Record preserved under verification state: "{version.status}".</p>
//                                     )}
//                                 </div>
//                             </div>

//                             {/* 🚀 FIXED DIGITAL SIGNATURE RENDER GRID WITH PROPS */}
//                             <div className="print-signatures-grid">
//                                 <div className="bulk-sig-col">
//                                     <div className="bulk-sig-img-wrap">
//                                         {currentMentorSig ? <img src={currentMentorSig} alt="Supervisor Certified Stamp" /> : <div style={{ height: '35px' }}></div>}
//                                     </div>
//                                     <div className="print-sig-line">SUPERVISOR SIGNATURE</div>
//                                     <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{mentorName || '________________________'}</div>
//                                 </div>
//                                 <div className="bulk-sig-col">
//                                     <div className="bulk-sig-img-wrap">
//                                         {assessorSig ? (
//                                             <img src={assessorSig} alt="Internal Assessor Stamp" />
//                                         ) : (
//                                             <div style={{ height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '8pt', fontStyle: 'italic', fontWeight: 'bold' }}>
//                                                 Pending Assignment
//                                             </div>
//                                         )}
//                                     </div>
//                                     <div className="print-sig-line">ASSESSOR SIGNATURE</div>
//                                     <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>
//                                         {assessorName || 'Internal/External Quality Assessor'}
//                                     </div>
//                                 </div>
//                                 <div className="bulk-sig-col">
//                                     <div className="bulk-sig-img-wrap">
//                                         {currentLearnerSig ? <img src={currentLearnerSig} alt="Candidate Signature" /> : <div style={{ height: '35px' }}></div>}
//                                     </div>
//                                     <div className="print-sig-line">LEARNER SIGNATURE</div>
//                                     <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{log.learnerName || '________________________'}</div>
//                                 </div>
//                             </div>
//                         </div>

//                         {/* ─── PAGE LAYER 2: EVIDENCE REFERENCE MASTER REGISTRY INDEX ─── */}
//                         {associatedCustomEvidence.length > 0 && (
//                             <div className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
//                                 <table className="print-header-table" style={{ marginBottom: '14px' }}>
//                                     <tbody>
//                                         <tr style={{ backgroundColor: '#000000' }}>
//                                             <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>
//                                                 EVIDENCE INTEGRITY REGISTRY — PORTFOLIO REFERENCE MASTER SHEET (LANDSCAPE MODE)
//                                             </td>
//                                         </tr>
//                                         <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>LOG SHIFT DATE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{displayDate}</td></tr>
//                                         <tr><td style={{ fontSize: '8.5pt' }}>TOTAL TRACKED ARTIFACTS</td><td style={{ fontSize: '9pt', fontWeight: 'bold' }}>{associatedCustomEvidence.length} Item(s) Linked</td></tr>
//                                     </tbody>
//                                 </table>

//                                 {associatedCustomEvidence.map((seItem: any, innerSeIdx: number) => {
//                                     const isCwkProof = seItem.code.startsWith('CWK');

//                                     return (
//                                         <div key={innerSeIdx} style={{ border: `2px solid ${isCwkProof ? '#0284c7' : '#000000'}`, padding: '12px', background: isCwkProof ? '#f0f9ff' : '#ffffff', marginBottom: '12px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
//                                             <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `1px solid ${isCwkProof ? '#bae6fd' : '#000000'}`, paddingBottom: '4px', marginBottom: '6px' }}>
//                                                 <span style={{ fontSize: '9.5pt', fontWeight: 'bold', color: isCwkProof ? '#0369a1' : '#000000' }}>Artifact Reference Code: {seItem.code}</span>
//                                                 <span style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#475569' }}>Category: {seItem.type || 'file'}</span>
//                                             </div>
//                                             <div style={{ fontSize: '9.5pt', color: '#000000', marginBottom: '6px' }}>
//                                                 <strong>Evidence Description Name:</strong> {seItem.description}
//                                             </div>

//                                             {/* ─── ✔️ UNROLLED ARTIFACT TARGET RELATION MAPPING TRACE ─── */}
//                                             {seItem.linkedWorkActivities && seItem.linkedWorkActivities.length > 0 && (
//                                                 <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px', background: isCwkProof ? '#ffffff' : '#f8fafc', padding: '6px 10px', border: `1px solid ${isCwkProof ? '#bae6fd' : '#e2e8f0'}` }}>
//                                                     <span style={{ fontSize: '8pt', fontWeight: 'bold', color: isCwkProof ? '#0284c7' : '#475569', textTransform: 'uppercase' }}>Relational Assessor Trace — This Proof Item Validates WAs:</span>
//                                                     {seItem.linkedWorkActivities.map((wCode: string) => {
//                                                         const boundWaDescriptionText = milestoneDescriptionsLookup[wCode] || 'Work Activity Criterion Objective';
//                                                         return (
//                                                             <div key={wCode} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '8.5pt', lineHeight: 1.35 }}>
//                                                                 <span style={{ background: isCwkProof ? '#0284c7' : '#000000', color: '#ffffff', fontSize: '7pt', fontFamily: 'monospace', padding: '1px 4px', fontWeight: 'bold', borderRadius: '2px', flexShrink: 0 }}>{wCode}</span>
//                                                                 <span style={{ color: '#1e293b' }}>{boundWaDescriptionText}</span>
//                                                             </div>
//                                                         );
//                                                     })}
//                                                 </div>
//                                             )}
//                                             <div style={{ fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all', color: '#000000', background: '#ffffff', padding: '6px 10px', border: `1px solid ${isCwkProof ? '#bae6fd' : '#cbd5e1'}` }}>
//                                                 <strong>Storage Location URI:</strong> {seItem.fileUrl || 'No digital reference found.'}
//                                             </div>
//                                         </div>
//                                     );
//                                 })}
//                             </div>
//                         )}

//                         {/* ─── PAGE LAYER 3: DEDICATED FULL APPENDIX ENVELOPES ─── */}
//                         {associatedCustomEvidence.map((seItem: any, innerFileIdx: number) => {
//                             const isImage = isPrintableImage(seItem.fileUrl);
//                             const isLink = seItem.type === 'link';
//                             const isCwkProof = seItem.code.startsWith('CWK');

//                             return (
//                                 <div key={innerFileIdx} className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
//                                     <table className="print-header-table" style={{ marginBottom: '12px' }}>
//                                         <tbody>
//                                             <tr style={{ backgroundColor: isCwkProof ? '#0369a1' : '#000000' }}>
//                                                 <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '9.5pt', padding: '5px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
//                                                     PORTFOLIO EVIDENCE ENVELOPE — REF: {seItem.code}
//                                                 </td>
//                                             </tr>
//                                             <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>ARTIFACT TYPE</td><td style={{ width: '75%', fontWeight: 'bold', fontSize: '9pt', textTransform: 'uppercase' }}>{seItem.type || 'FILE'}</td></tr>
//                                             <tr><td style={{ fontSize: '8.5pt' }}>DESCRIPTION / LABEL</td><td style={{ fontWeight: 'normal', fontSize: '9pt' }}>{seItem.description}</td></tr>
//                                             <tr>
//                                                 <td style={{ fontSize: '8.5pt' }}>CONNECTED OBJECTIVES</td>
//                                                 <td style={{ fontWeight: 'normal', fontSize: '9pt' }}>
//                                                     {seItem.linkedWorkActivities?.map((c: string) => {
//                                                         const miniDesc = milestoneDescriptionsLookup[c] || '';
//                                                         return miniDesc ? `${c} (${miniDesc})` : c;
//                                                     }).join(' | ') || 'None'}
//                                                 </td>
//                                             </tr>
//                                             <tr><td style={{ fontSize: '8.5pt' }}>DIGITAL ENDPOINT TARGET</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all', color: '#000000' }}>{seItem.fileUrl || 'N/A'}</td></tr>
//                                         </tbody>
//                                     </table>

//                                     {isLink ? (
//                                         <div style={{ padding: '25px 20px', border: '2px dashed #000000', background: '#ffffff', textAlign: 'center', marginTop: '15px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
//                                             <div style={{ fontSize: '24pt', marginBottom: '6px' }}>🔗</div>
//                                             <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
//                                                 EXTERNAL SYSTEM RESOURCE RECORD INDEXED
//                                             </h3>
//                                             <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', maxWidth: '750px', lineHeight: 1.5, textAlign: 'left' }}>
//                                                 This specific piece of evidence traces back to a live, external cloud-hosted workspace asset (such as an active deployment instance, project roadmap kanban board, or a collaborative design canvas).
//                                             </p>
//                                             <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', maxWidth: '750px', lineHeight: 1.5, textAlign: 'left' }}>
//                                                 External moderators and audit team members reviewing this physical log folder can inspect the complete interactive version history path directly by utilizing their digital system consoles to parse the uniform target URI string mapped above.
//                                             </p>
//                                             <div style={{ borderTop: '1px solid #000000', paddingTop: '8px', marginTop: '12px', textAlign: 'left', fontSize: '8.5pt' }}>
//                                                 <strong>Institutional Compliance Note:</strong> Audit point successfully bound under registry token reference <strong>{seItem.code}</strong>.
//                                             </div>
//                                         </div>
//                                     ) : isImage ? (
//                                         <div className="print-evidence-frame-box">
//                                             <img src={seItem.fileUrl} className="print-evidence-embedded-image" alt="" onLoad={handlePdfLoaded} onError={handlePdfLoaded} />
//                                         </div>
//                                     ) : (
//                                         <PrintablePdfUnroller url={seItem.fileUrl} />
//                                     )}
//                                 </div>
//                             );
//                         })}

//                         {/* Backward Compatibility Singleton File Fallback Summary Sheet */}
//                         {version.evidenceUrl && (
//                             <div className="print-evidence-appendix-page" style={{ pageBreakBefore: 'always' }}>
//                                 <table className="print-header-table" style={{ marginBottom: '10px' }}>
//                                     <tbody>
//                                         <tr style={{ backgroundColor: '#000000' }}>
//                                             <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>
//                                                 EVIDENCE INTEGRITY REGISTRY — PORTFOLIO ARTIFACT SUMMARY
//                                             </td>
//                                         </tr>
//                                         <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>LOG SHIFT DATE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{displayDate}</td></tr>
//                                         <tr><td style={{ fontSize: '8.5pt' }}>SECURE CLOUD STORAGE URL</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all' }}>{version.evidenceUrl}</td></tr>
//                                     </tbody>
//                                 </table>

//                                 {isPrintableImage(version.evidenceUrl) ? (
//                                     <div className="print-evidence-frame-box">
//                                         <img src={version.evidenceUrl} className="print-evidence-embedded-image" alt="" onLoad={handlePdfLoaded} onError={handlePdfLoaded} />
//                                     </div>
//                                 ) : (
//                                     <PrintablePdfUnroller url={version.evidenceUrl} />
//                                 )}
//                             </div>
//                         )}
//                     </React.Fragment>
//                 );
//             })}

//             {/* Supplementary Multi-Document Attachments Blocks */}
//             {additionalAttachments.length > 0 && (
//                 <>
//                     <div className="print-additional-attachments-divider">
//                         <h2>SUPPLEMENTARY ATTACHMENTS</h2>
//                         <p>{additionalAttachments.length} additional document(s) follow this page</p>
//                     </div>

//                     {additionalAttachments.map((attachment, idx) => (
//                         <div key={idx} className="print-additional-attachment-page">
//                             <table className="print-header-table" style={{ marginBottom: '10px' }}>
//                                 <tbody>
//                                     <tr style={{ backgroundColor: '#000000' }}><td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px' }}>SUPPLEMENTARY ATTACHMENT {idx + 1} OF {additionalAttachments.length}</td></tr>
//                                     <tr><td style={{ width: '25%', fontSize: '8.5pt' }}>DOCUMENT TITLE</td><td style={{ width: '75%', fontWeight: 'normal', fontSize: '9pt' }}>{attachment.label || getFileName(attachment.url)}</td></tr>
//                                     {attachment.description && (<tr><td style={{ fontSize: '8.5pt' }}>DESCRIPTION</td><td style={{ fontWeight: 'normal', fontSize: '9pt' }}>{attachment.description}</td></tr>)}
//                                     <tr><td style={{ fontSize: '8.5pt' }}>SOURCE URI</td><td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all' }}>{attachment.url}</td></tr>
//                                 </tbody>
//                             </table>

//                             {isPrintableImage(attachment.url) ? (
//                                 <div className="print-evidence-frame-box">
//                                     <img src={attachment.url} className="print-evidence-embedded-image" alt="" onLoad={handlePdfLoaded} onError={handlePdfLoaded} />
//                                 </div>
//                             ) : (
//                                 <PrintablePdfUnroller url={attachment.url} />
//                             )}
//                         </div>
//                     ))}
//                 </>
//             )}
//         </div>
//     );
// };