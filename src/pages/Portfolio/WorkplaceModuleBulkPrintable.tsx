// src/components/views/ViewPortfolio/WorkplaceModuleBulkPrintable.tsx

import React, { useMemo } from 'react';
import moment from 'moment';
import { BulkPrintPdfUnroller } from './BulkPrintPdfUnroller';

interface GroupedModulePrintProps {
    moduleCode: string;
    moduleTopics: any[];
    logs: any[];
    learnerName: string;
    learnerIdNumber: string;
    learnerSig: string;
    mentorSig: string;
    assessorSig: string;
    mentorName: string;
    assessorName: string;
    employerDetails?: {
        companyName: string;
        address: string;
        workTelephone: string;
        email: string;
    };
}

const isPrintableImage = (url: string): boolean => {
    if (!url) return false;
    const cleanUrl = url.split('?')[0].toLowerCase();
    return cleanUrl.endsWith('.jpg') || cleanUrl.endsWith('.jpeg') || cleanUrl.endsWith('.png') || cleanUrl.endsWith('.webp') || cleanUrl.endsWith('.gif');
};

export const WorkplaceModuleBulkPrintable: React.FC<GroupedModulePrintProps> = ({
    moduleCode,
    moduleTopics,
    logs,
    learnerName,
    learnerIdNumber,
    learnerSig,
    mentorSig,
    assessorSig,
    mentorName,
    assessorName,
    employerDetails
}) => {
    if (!logs || logs.length === 0) return null;

    const chronologicalLogs = useMemo(() => {
        return [...logs].sort((a, b) =>
            new Date(a.dateString || 0).getTime() - new Date(b.dateString || 0).getTime()
        );
    }, [logs]);

    const totalAccumulatedHours = chronologicalLogs.reduce((acc, current) => acc + (Number(current.totalHours) || 0), 0);

    // ─── 100% DYNAMIC CURRICULUM DESCRIPTION TRANSLATION DICTIONARY ───
    const milestoneDescriptionsLookup = useMemo(() => {
        const dictionaryMap: Record<string, string> = {};

        // 1. Recover database inline translation objects stamped into historical snapshots within the bulk list
        if (logs && Array.isArray(logs)) {
            logs.forEach((logItem: any) => {
                if (logItem?.milestoneLabels) {
                    Object.entries(logItem.milestoneLabels).forEach(([code, label]) => {
                        if (label) dictionaryMap[code] = label as string;
                    });
                }
                if (logItem?.milestoneTranslations) {
                    Object.entries(logItem.milestoneTranslations).forEach(([code, label]) => {
                        if (label) dictionaryMap[code] = label as string;
                    });
                }
            });
        }

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
    }, [moduleTopics, logs]);

    // ─── ⚡ DEDUPLICATED MASTER PORTFOLIO EVIDENCE EXTRACTOR ───
    const moduleCompiledEvidenceRegistry = useMemo(() => {
        const uniqueEvidenceMap = new Map<string, any>();

        chronologicalLogs.forEach(log => {
            // Extract Relational Bound Custom Evidence Items
            if (Array.isArray(log.customEvidenceTracking)) {
                log.customEvidenceTracking.forEach((item: any) => {
                    if (item && item.code) {
                        uniqueEvidenceMap.set(item.code, item);
                    }
                });
            }

            // Extract Contextual Workplace Knowledge (CWK) Attached Evidence
            if (log.cwkEvidence && typeof log.cwkEvidence === 'object') {
                Object.entries(log.cwkEvidence).forEach(([cwkCode, fileUrl]) => {
                    if (fileUrl && typeof fileUrl === 'string') {
                        const uniqueCwkKey = `${log.id}_${cwkCode}`;
                        uniqueEvidenceMap.set(uniqueCwkKey, {
                            code: cwkCode,
                            description: `Contextual Workplace Knowledge Proof Validation`,
                            type: 'file',
                            fileUrl: fileUrl,
                            linkedWorkActivities: [cwkCode]
                        });
                    }
                });
            }

            // Fallback backward compatibility tracker for standalone legacy uploads
            if (log.evidenceUrl && !log.customEvidenceTracking?.some((i: any) => i.fileUrl === log.evidenceUrl)) {
                const legacyReferenceTokenCode = `EVIDENCE-LEGACY-${log.dateString ? moment(log.dateString).format('YYYYMMDD') : log.id}`;
                uniqueEvidenceMap.set(legacyReferenceTokenCode, {
                    code: legacyReferenceTokenCode,
                    description: `Historical portfolio evidence profile document authenticated on shift assignment: ${log.dateString || 'N/A'}.`,
                    type: 'file',
                    fileUrl: log.evidenceUrl,
                    linkedWorkActivities: log.selectedMilestones || []
                });
            }
        });

        return Array.from(uniqueEvidenceMap.values());
    }, [chronologicalLogs]);

    // Gather unique CWK codes dynamically targeted across this module batch
    const allCwkCodes = useMemo(() => {
        return Array.from(new Set(
            chronologicalLogs.flatMap(log => log.selectedMilestones?.filter((m: string) => m.startsWith('CWK')) || [])
        )).sort();
    }, [chronologicalLogs]);

    return (
        <div className="qcto-grouped-module-print-wrapper active-bulk-print">
            <style type="text/css">
                {`
                    .qcto-grouped-module-print-wrapper { display: none !important; }

                    @media print {
                        @page {
                            size: A4 landscape !important;
                            margin: 10mm 12mm 10mm 12mm !important;
                        }

                        #root, .admin-layout, .main-wrapper, .lfm-overlay, .lfm-modal, .admin-mobile-header, .admin-sidebar-wrapper {
                            display: none !important; height: 0 !important; overflow: hidden !important; visibility: hidden !important;
                        }
                        
                        body > .qcto-grouped-module-print-wrapper.active-bulk-print {
                            display: block !important; visibility: visible !important; height: auto !important; overflow: visible !important;
                            position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important;
                            background: #ffffff !important; color: #000000 !important; font-family: Arial, Helvetica, sans-serif !important;
                            font-size: 10pt !important; line-height: 1.4 !important; box-sizing: border-box !important;
                        }

                        .qcto-grouped-module-print-wrapper.active-bulk-print * { display: revert; visibility: visible !important; box-sizing: border-box !important; }

                        .print-page-break {
                            page-break-after: always !important;
                            break-after: page !important;
                            width: 100% !important;
                            clear: both !important;
                        }

                        .bulk-header-block {
                            width: 100% !important; border-collapse: collapse !important; margin-bottom: 20px !important; border: 2px solid #000000 !important;
                        }

                        .bulk-header-block td {
                            border: 1px solid #000000 !important; padding: 10px 14px !important; font-weight: bold !important; font-size: 10pt !important;
                        }

                        .bulk-header-block td span { font-weight: normal !important; margin-left: 12px !important; display: inline-block !important; }

                        .statutory-declaration-box {
                            border: 2px solid #000000 !important; padding: 14px !important; margin-bottom: 20px !important; background: #ffffff !important;
                            page-break-inside: avoid !important; break-inside: avoid !important;
                        }

                        .bulk-ledger-table {
                            width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; border: 2px solid #000000 !important; margin-bottom: 20px !important;
                        }

                        .bulk-ledger-table th, .bulk-ledger-table td {
                            border: 1px solid #000000 !important; padding: 10px !important; vertical-align: top !important;
                            word-break: break-word !important; line-break: anywhere !important; overflow-wrap: break-word !important; white-space: normal !important;
                        }

                        .bulk-ledger-table th {
                            background-color: #f1f5f9 !important; text-align: left !important; font-weight: bold !important; font-size: 9.5pt !important; text-transform: uppercase !important;
                            -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
                        }

                        .ledger-html-content { 
                            display: block !important; 
                            word-wrap: break-word !important; 
                            overflow-wrap: break-word !important; 
                            word-break: break-word !important; 
                            max-width: 100% !important;
                        }
                        .ledger-html-content *, .ledger-html-content p, .ledger-html-content span, .ledger-html-content li {
                            font-size: 9.5pt !important; 
                            word-wrap: break-word !important; 
                            overflow-wrap: break-word !important; 
                            word-break: break-word !important; 
                            max-width: 100% !important;
                            line-height: 1.4 !important;
                        }
                        .ledger-html-content p { margin: 0 0 4px 0 !important; }
                        
                        .ledger-html-content pre { 
                            white-space: pre-wrap !important; 
                            word-wrap: break-word !important; 
                            word-break: break-all !important;
                            overflow-x: visible !important; 
                            background-color: #f8fafc !important;
                            color: #000000 !important;
                            border: 1px solid #000000 !important;
                            padding: 8px !important;
                            font-family: monospace !important;
                            font-size: 8.5pt !important;
                            margin: 8px 0 !important;
                            display: block !important;
                            page-break-inside: avoid !important;
                            break-inside: avoid !important;
                        }

                        .row-sig-container { display: flex !important; flex-direction: column !important; gap: 6px !important; font-size: 7.5pt !important; }
                        .row-sig-item { display: flex !important; align-items: center !important; justify-content: space-between !important; border-bottom: 1px dashed #cbd5e1 !important; padding-bottom: 3px !important; }
                        .row-sig-item:last-child { border-bottom: none !important; padding-bottom: 0 !important; }
                        .row-sig-img { max-height: 22px !important; max-width: 80px !important; object-fit: contain !important; }

                        .bulk-signatures-strip {
                            display: table !important; width: 100% !important; margin-top: 30px !important; table-layout: fixed !important; page-break-inside: avoid !important; break-inside: avoid !important;
                        }
                        .bulk-sig-col { display: table-cell !important; width: 33.33% !important; padding: 0 15px !important; vertical-align: bottom !important; text-align: center !important; }
                        .bulk-sig-img-wrap { height: 45px !important; display: flex !important; align-items: center !important; justify-content: center !important; margin-bottom: 4px !important; }
                        .bulk-sig-img-wrap img { max-height: 45px !important; max-width: 120px !important; object-fit: contain !important; }
                        .bulk-sig-line { border-top: 1.5px solid #000000 !important; padding-top: 6px !important; font-size: 8.5pt !important; font-weight: bold !important; text-transform: uppercase !important; }
                        
                        .bulk-print-se-block { margin-top: 8px !important; padding: 6px 10px !important; background: #ffffff !important; border: 1px solid #000000 !important; display: flex !important; flex-direction: column !important; gap: 4px !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        .bulk-print-se-tag { background: #000000 !important; color: #ffffff !important; font-weight: 800; font-size: 7pt !important; padding: 1px 4px !important; border-radius: 2px; font-family: monospace !important; }
                        
                        /* ─── ✔️ FULL WIDTH DEDICATED PRINT APPENDIX STYLES ─── */
                        .bulk-print-appendix-envelope-sheet { page-break-before: always !important; padding-top: 4mm !important; width: 100% !important; }
                        .bulk-print-evidence-frame { width: 100% !important; border: 2px solid #000000 !important; padding: 12px; text-align: center; background: #ffffff; margin-top: 12px; box-sizing: border-box !important; page-break-inside: avoid !important; break-inside: avoid !important; }
                        .bulk-print-evidence-img-payload { max-width: 100% !important; max-height: 130mm !important; object-fit: contain !important; display: block !important; margin: 0 auto !important; }
                    }
                `}
            </style>

            {/* ─── PAGE LAYER 1: REGISTRY LOGBOOK META DECLARATIONS ─── */}
            <div className="print-page-break">
                <div style={{ textAlign: 'center', marginBottom: '25px', borderBottom: '2px dashed #000', paddingBottom: '15px' }}>
                    <h1 style={{ fontSize: '18pt', margin: '0 0 4px 0', letterSpacing: '0.5px' }}>OFFICIAL LOGBOOK STATEMENT OF WORK EXPERIENCE</h1>
                    <h2 style={{ fontSize: '12pt', fontWeight: 'bold', color: '#333', margin: '0 0 6px 0', textTransform: 'uppercase' }}>
                        Occupational Certificate: Software Developer (SAQA ID: 118707)
                    </h2>
                    <span style={{ fontSize: '10pt', fontWeight: 'bold', background: '#f1f5f9', padding: '3px 10px', borderRadius: '4px' }}>
                        NQF LEVEL 5 | DESIGNATED COMPLIANCE SCOPE NOTIONAL HOURS: 150
                    </span>
                </div>

                <table className="bulk-header-block">
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9' }}><th colSpan={4} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '10pt' }}>LEARNER AND EMPLOYER MASTER REGISTRY</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ width: '20%' }}>CANDIDATE NAME</td>
                            <td style={{ width: '30%' }}><span>{learnerName}</span></td>
                            <td style={{ width: '20%' }}>COMPANY NAME</td>
                            <td style={{ width: '30%' }}><span>{employerDetails?.companyName || 'Registered Host Employer'}</span></td>
                        </tr>
                        <tr>
                            <td>CURRICULUM SPEC</td>
                            <td><span>{moduleCode}</span></td>
                            <td>PHYSICAL ADDRESS</td>
                            <td><span>{employerDetails?.address || 'N/A'}</span></td>
                        </tr>
                        <tr>
                            <td>SUPERVISOR NAME</td>
                            <td><span>{mentorName}</span></td>
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
                        <tr>
                            <td colSpan={2}>TOTAL TARGET HOURS: <span style={{ fontWeight: 'normal', marginLeft: '8px' }}>150 Hours</span></td>
                            <td colSpan={2}>ACCUMULATED HOURS: <span style={{ fontWeight: 'normal', marginLeft: '8px' }}>{totalAccumulatedHours.toFixed(1)} Hours Verified</span></td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="statutory-declaration-box">
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '10pt', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '4px' }}>
                            Acknowledgment of Receipt
                        </h3>
                        <p style={{ fontSize: '9pt', margin: '0 0 15px 0', lineHeight: '1.45', textAlign: 'justify' }}>
                            I hereby acknowledge receipt of the official Work Experience Module logbook guidelines.
                            The operational frameworks, expected milestones, and continuous tracking protocols have been explicitly outlined and communicated to me.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px' }}>
                            <div>
                                <div className="bulk-sig-img-wrap" style={{ justifyContent: 'flex-start', height: '30px' }}>
                                    {learnerSig ? <img src={learnerSig} style={{ maxHeight: '30px' }} alt="" /> : null}
                                </div>
                                <div style={{ borderTop: '1px solid #000', width: '220px', fontSize: '7.5pt', fontWeight: 'bold' }}>CANDIDATE SIGNATURE</div>
                                <div style={{ fontSize: '7.5pt', color: '#475569', marginTop: '2px' }}>ID No: {learnerIdNumber}</div>
                            </div>
                            <div style={{ fontSize: '8.5pt' }}>DATE: {moment().format('DD/MM/YYYY')}</div>
                        </div>
                    </div>

                    <div className="statutory-declaration-box">
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '10pt', textTransform: 'uppercase', borderBottom: '1px solid #000', paddingBottom: '4px' }}>
                            Declaration of Authenticity
                        </h3>
                        <p style={{ fontSize: '9pt', margin: '0 0 15px 0', lineHeight: '1.45', textAlign: 'justify' }}>
                            I hereby declare that the logged workplace activities, descriptive entries, and submitted evidence metrics constitute a true and accurate reflection of my own practical work exposure and professional output inside the enterprise environment.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px' }}>
                            <div>
                                <div className="bulk-sig-img-wrap" style={{ justifyContent: 'flex-start', height: '30px' }}>
                                    {mentorSig ? <img src={mentorSig} style={{ maxHeight: '30px' }} alt="" /> : null}
                                </div>
                                <div style={{ borderTop: '1px solid #000', width: '220px', fontSize: '7.5pt', fontWeight: 'bold' }}>MENTOR SIGNATURE</div>
                            </div>
                            <div style={{ fontSize: '8.5pt' }}>DATE: {moment().format('DD/MM/YYYY')}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ─── PAGE LAYER 2: DYNAMIC REQS VERIFICATION MATRIX CHECKS ─── */}
            <div className="print-page-break">
                <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    QCTO Module Specification Matrix &amp; Milestone Checklist
                </h3>
                <p style={{ fontSize: '8.5pt', margin: '0 0 12px 0', color: '#333', textAlign: 'justify' }}>
                    The matrix array below maps dynamically fetched requirements to your verified log entries.
                    The supervisor signature column validates completed exposure in the targeted registry scope items.
                </p>

                <table className="bulk-ledger-table" style={{ fontSize: '9pt' }}>
                    <thead>
                        <tr>
                            <th style={{ width: '15%' }}>CODE</th>
                            <th style={{ width: '57%' }}>WORK EXPERIENCE MODULE ACTIVITY METRICS SPECIFICATION</th>
                            <th style={{ width: '14%', textAlign: 'center' }}>CONTROL DATA</th>
                            <th style={{ width: '14%', textAlign: 'center' }}>STATUS VALIDATION</th>
                        </tr>
                    </thead>
                    <tbody>
                        {moduleTopics.length === 0 ? (
                            <tr>
                                <td colSpan={4} style={{ textTransform: 'uppercase', textAlign: 'center', padding: '20px', fontStyle: 'italic' }}>
                                    No dynamic roadmap milestones found on the connected programme template.
                                </td>
                            </tr>
                        ) : (
                            moduleTopics.map((topic: any) => (
                                <React.Fragment key={topic.code}>
                                    <tr style={{ backgroundColor: '#f8fafc' }}>
                                        <td colSpan={4} style={{ fontWeight: 'bold', fontSize: '8.5pt', borderBottom: '2px solid #000' }}>
                                            SUB-SECTION UNIT: {topic.code} — {topic.title}
                                        </td>
                                    </tr>
                                    {(topic.criteria || []).map((spec: any) => {
                                        const isApprovedElsewhere = chronologicalLogs.some(l =>
                                            l.status === 'Approved' && l.selectedMilestones?.includes(spec.code)
                                        );
                                        const isPendingElsewhere = !isApprovedElsewhere && chronologicalLogs.some(l =>
                                            l.status !== 'Rejected' && l.selectedMilestones?.includes(spec.code)
                                        );

                                        return (
                                            <tr key={spec.code} style={{ height: '26px' }}>
                                                <td><strong>{spec.code}</strong></td>
                                                <td>{spec.description || spec.label || spec.title}</td>
                                                <td style={{ textAlign: 'center', fontSize: '8pt', verticalAlign: 'middle' }}>Dynamic Trace</td>
                                                <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>
                                                    {isApprovedElsewhere ? (
                                                        mentorSig ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                                <img src={mentorSig} style={{ maxHeight: '15px', objectFit: 'contain' }} alt="" />
                                                                <span style={{ fontSize: '7.5pt', color: '#166534' }}>SIGNED</span>
                                                            </div>
                                                        ) : <span style={{ color: '#166534' }}>✔️ APPROVED</span>
                                                    ) : isPendingElsewhere ? (
                                                        <span style={{ color: '#d97706' }}> PENDING SIGNATURE</span>
                                                    ) : (
                                                        <span style={{ color: '#dc2626' }}>❌ MISSING</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            ))
                        )}

                        {/* ─── 🚀 INLINE CONTEXTUAL KNOWLEDGE DYNAMIC MATRIX BLOCK ─── */}
                        {allCwkCodes.length > 0 && (
                            <React.Fragment>
                                <tr style={{ backgroundColor: '#f0f9ff' }}>
                                    <td colSpan={4} style={{ fontWeight: 'bold', fontSize: '8.5pt', borderBottom: '2px solid #000', color: '#0369a1' }}>
                                        SUB-SECTION UNIT: CWK — CONTEXTUALIZED WORKPLACE KNOWLEDGE VALIDATIONS
                                    </td>
                                </tr>
                                {allCwkCodes.map(cwkCode => {
                                    const specDesc = milestoneDescriptionsLookup[cwkCode] || 'Contextual Framework Concept';
                                    const isApprovedElsewhere = chronologicalLogs.some(l => l.status === 'Approved' && l.selectedMilestones?.includes(cwkCode));
                                    const isPendingElsewhere = !isApprovedElsewhere && chronologicalLogs.some(l => l.status !== 'Rejected' && l.selectedMilestones?.includes(cwkCode));

                                    return (
                                        <tr key={cwkCode} style={{ height: '26px' }}>
                                            <td><strong style={{ color: '#0369a1' }}>{cwkCode}</strong></td>
                                            <td>{specDesc}</td>
                                            <td style={{ textAlign: 'center', fontSize: '8pt', verticalAlign: 'middle' }}>Dynamic Trace</td>
                                            <td style={{ textAlign: 'center', verticalAlign: 'middle', fontWeight: 'bold' }}>
                                                {isApprovedElsewhere ? (
                                                    mentorSig ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                                            <img src={mentorSig} style={{ maxHeight: '15px', objectFit: 'contain' }} alt="" />
                                                            <span style={{ fontSize: '7.5pt', color: '#166534' }}>SIGNED</span>
                                                        </div>
                                                    ) : <span style={{ color: '#166534' }}>✔️ APPROVED</span>
                                                ) : isPendingElsewhere ? (
                                                    <span style={{ color: '#d97706' }}> PENDING SIGNATURE</span>
                                                ) : (
                                                    <span style={{ color: '#dc2626' }}>❌ MISSING</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        )}
                    </tbody>
                </table>

                {/* ─── ADDITIONAL ASSIGNMENTS BLOCK ─── */}
                <div style={{ marginTop: '30px' }}>
                    <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Additional Assignments to be Assessed Externally
                    </h3>
                    <table className="bulk-ledger-table" style={{ fontSize: '9pt', marginBottom: '0' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '10%', textAlign: 'center' }}>#</th>
                                <th style={{ width: '50%' }}>ASSIGNMENT DETAILS</th>
                                <th style={{ width: '20%', textAlign: 'center' }}>DATE</th>
                                <th style={{ width: '20%', textAlign: 'center' }}>ASSESSOR SIGNATURE</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>1</td>
                                <td style={{ fontStyle: 'italic', color: '#64748b', verticalAlign: 'middle' }}>None specified for this module</td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>-</td>
                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                    {assessorSig ? (
                                        <img src={assessorSig} style={{ maxHeight: '18px', objectFit: 'contain' }} alt="Assessor Signed" />
                                    ) : (
                                        <span style={{ color: '#d97706', fontSize: '7.5pt', fontWeight: 'bold' }}>Pending</span>
                                    )}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── PAGE LAYER 3: DAILY SHIFT TIMELINE DIARY LEDGER ─── */}
            <div className="print-page-break">
                <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Granular Daily Activity Diary &amp; Evidence Ledger
                </h3>

                <table className="bulk-ledger-table">
                    <thead>
                        <tr>
                            <th style={{ width: '12%' }}>DATE / SHIFT</th>
                            <th style={{ width: '56%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE &amp; PERFORMED TASKS</th>
                            <th style={{ width: '8%', textAlign: 'center' }}>HOURS</th>
                            <th style={{ width: '24%', textAlign: 'left' }}>AUTHENTICATION &amp; VERIFICATION MAP</th>
                        </tr>
                    </thead>
                    <tbody>
                        {chronologicalLogs.map((entry, idx) => {
                            const currentLearnerSig = entry.learnerSignatureUrl || entry.signatureUrl || entry.learnerSignature || entry.signature || learnerSig;
                            const currentMentorSig = entry.mentorSignatureUrl || (entry.status === 'Approved' ? mentorSig : '');
                            const entryCwkCodes = entry.selectedMilestones?.filter((m: string) => m.startsWith('CWK')) || [];

                            return (
                                <tr key={entry.id || idx} style={{ pageBreakInside: 'avoid' }}>
                                    <td>
                                        <strong>{entry.dateString ? moment(entry.dateString).format('DD/MM/YYYY') : 'N/A'}</strong>
                                        <div style={{ fontSize: '8pt', marginTop: '4px', color: '#475569' }}>
                                            Shift: {entry.startTime || '08:00'} - {entry.endTime || '16:00'}
                                        </div>
                                    </td>
                                    <td>
                                        {entry.topicTitle && (
                                            <div style={{ fontSize: '8.5pt', fontWeight: 'bold', marginBottom: '6px', borderBottom: '1px dashed #cbd5e1', paddingBottom: '4px', color: '#073f4e' }}>
                                                Topic Element: <span style={{ fontWeight: 'normal', color: '#334155' }}>{entry.topicTitle}</span>
                                            </div>
                                        )}

                                        <div className="ledger-html-content" dangerouslySetInnerHTML={{ __html: entry.tasksPerformed || '<em>No descriptive logs recorded.</em>' }} />

                                        {/* CONTEXTUAL KNOWLEDGE PROOF TRACE */}
                                        {entry.isQctoAligned && entryCwkCodes.length > 0 && (
                                            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                                <div style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#0369a1', marginBottom: '4px' }}>
                                                    📘 Contextual Knowledge Proof Documents:
                                                </div>
                                                {entryCwkCodes.map((cwkCode: string) => {
                                                    const cwkUrl = entry.cwkEvidence?.[cwkCode];
                                                    const textDescriptorLabel = milestoneDescriptionsLookup[cwkCode] || 'Contextual Framework Concept';
                                                    return (
                                                        <div key={cwkCode} className="bulk-print-se-block" style={{ borderColor: '#bae6fd', background: '#f0fdf4' }}>
                                                            <div>
                                                                <span className="bulk-print-se-tag" style={{ background: '#0284c7' }}>{cwkCode}</span>
                                                                <strong style={{ fontSize: '8.5pt', marginLeft: '4px', color: '#0f172a' }}>{textDescriptorLabel}</strong>
                                                                <span style={{ fontStyle: 'italic', fontSize: '7.5pt', color: '#475569', marginLeft: '6px' }}>({cwkUrl ? 'file' : 'missing'})</span>
                                                            </div>
                                                            <div style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: '#334155', wordBreak: 'break-all', background: '#ffffff', padding: '2px 4px', marginTop: '2px', border: '1px solid #bae6fd' }}>
                                                                Location URI: {cwkUrl || 'MISSING REQUIRED DOCUMENT'}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Relational Inline Metadata Mappings */}
                                        {entry.customEvidenceTracking && entry.customEvidenceTracking.length > 0 && (
                                            <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
                                                <div style={{ fontSize: '8pt', fontWeight: 'bold', textTransform: 'uppercase', color: '#4f46e5', marginBottom: '4px' }}>
                                                    📎 Version Bound Artifact Evidence ({entry.customEvidenceTracking.length}):
                                                </div>
                                                {entry.customEvidenceTracking.map((seItem: any, seIdx: number) => (
                                                    <div key={seIdx} className="bulk-print-se-block">
                                                        <div>
                                                            <span className="bulk-print-se-tag">{seItem.code}</span>
                                                            <strong style={{ fontSize: '8.5pt', marginLeft: '4px' }}>{seItem.description}</strong>
                                                            <span style={{ fontStyle: 'italic', fontSize: '7.5pt', color: '#475569', marginLeft: '6px' }}>({seItem.type || 'file'})</span>
                                                        </div>

                                                        {seItem.linkedWorkActivities && seItem.linkedWorkActivities.length > 0 && (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                                                {seItem.linkedWorkActivities.map((wCode: string) => {
                                                                    const textDescriptorLabel = milestoneDescriptionsLookup[wCode] || 'Work Activity Objective Performance Metric';
                                                                    return (
                                                                        <div key={wCode} style={{ fontSize: '7.5pt', color: '#1e293b', display: 'flex', gap: '4px' }}>
                                                                            <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>• [{wCode}]</span>
                                                                            <span>{textDescriptorLabel}</span>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                        <div style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: '#334155', wordBreak: 'break-all', background: '#f8fafc', padding: '2px 4px', marginTop: '2px', border: '1px solid #cbd5e1' }}>
                                                            Location URI: {seItem.fileUrl || 'N/A'}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {entry.rejectionReason && entry.status === 'Rejected' && (
                                            <div style={{ marginTop: '8px', fontSize: '8.5pt', padding: '8px', border: '1px dashed #ef4444', background: '#fef2f2', borderRadius: '4px' }}>
                                                <strong>Correction Notice:</strong> <span dangerouslySetInnerHTML={{ __html: entry.rejectionReason }} />
                                            </div>
                                        )}

                                        {entry.reason && entry.status === 'Approved' && (
                                            <div style={{ marginTop: '8px', fontSize: '8.5pt', padding: '8px', border: '1px dashed #bbf7d0', background: '#f0fdf4', borderRadius: '4px' }}>
                                                <strong style={{ color: '#166534' }}>Supervisor Validations:</strong> <span style={{ color: '#14532d' }} dangerouslySetInnerHTML={{ __html: entry.reason }} />
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textTransform: 'uppercase', textAlign: 'center', fontWeight: 'bold', verticalAlign: 'middle', fontSize: '10.5pt' }}>
                                        {entry.totalHours || '0'}
                                    </td>
                                    <td style={{ verticalAlign: 'middle' }}>
                                        <div className="row-sig-container">
                                            <div className="row-sig-item">
                                                <span>Learner:</span>
                                                {currentLearnerSig ? (
                                                    <img src={currentLearnerSig} className="row-sig-img" alt="" />
                                                ) : (
                                                    <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '7pt' }}>System Authenticated</span>
                                                )}
                                            </div>
                                            <div className="row-sig-item">
                                                <span>Supervisor:</span>
                                                {entry.status === 'Approved' && currentMentorSig ? (
                                                    <img src={currentMentorSig} className="row-sig-img" alt="" />
                                                ) : entry.status === 'Rejected' ? (
                                                    <span style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: '7pt' }}>Returned Spec</span>
                                                ) : (
                                                    <span style={{ color: '#d97706', fontStyle: 'italic', fontSize: '7pt' }}>Awaiting Review</span>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div className="bulk-signatures-strip">
                    <div className="bulk-sig-col">
                        <div className="bulk-sig-img-wrap">
                            {mentorSig ? <img src={mentorSig} alt="Supervisor Certified Stamp" /> : <div style={{ height: '35px' }}></div>}
                        </div>
                        <div className="bulk-sig-line">SUPERVISOR SIGNATURE</div>
                        <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{mentorName}</div>
                    </div>
                    <div className="bulk-sig-col">
                        <div className="bulk-sig-img-wrap">
                            {assessorSig ? (
                                <img src={assessorSig} alt="Internal Assessor Stamp" />
                            ) : (
                                <div style={{ height: '35px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '8pt', fontStyle: 'italic', fontWeight: 'bold' }}>
                                    Pending Review
                                </div>
                            )}
                        </div>
                        <div className="bulk-sig-line">ASSESSOR SIGNATURE</div>
                        <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>
                            {assessorName || 'Internal/External Quality Assessor'}
                        </div>
                    </div>
                    <div className="bulk-sig-col">
                        <div className="bulk-sig-img-wrap">
                            {learnerSig ? <img src={learnerSig} alt="Candidate Signature" /> : <div style={{ height: '35px' }}></div>}
                        </div>
                        <div className="bulk-sig-line">LEARNER SIGNATURE</div>
                        <div style={{ fontSize: '7.5pt', marginTop: '2px', color: '#333' }}>{learnerName}</div>
                    </div>
                </div>
            </div>

            {/* ─── ✔️ PAGE LAYER 4: DEDICATED PHYSICAL EVIDENCE APPENDIX PAGES (AT THE END) ─── */}
            {moduleCompiledEvidenceRegistry.map((evidenceItem: any, envelopeIdx: number) => {
                const isImg = isPrintableImage(evidenceItem.fileUrl);
                const isHyperlink = evidenceItem.type === 'link';

                return (
                    <div key={envelopeIdx} className="bulk-print-appendix-envelope-sheet">
                        <table className="bulk-header-block" style={{ marginBottom: '14px' }}>
                            <tbody>
                                <tr style={{ backgroundColor: '#000000' }}>
                                    <td colSpan={2} style={{ color: '#ffffff', textAlign: 'center', fontSize: '10pt', padding: '6px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                        PORTFOLIO EVIDENCE APPENDIX — REF: {evidenceItem.code}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ width: '25%', fontSize: '8.5pt' }}>ARTIFACT REGISTRY CATEGORY</td>
                                    <td style={{ width: '75%', fontWeight: 'bold', fontSize: '9pt', textTransform: 'uppercase' }}>{evidenceItem.type || 'FILE'}</td>
                                </tr>
                                <tr>
                                    <td style={{ fontSize: '8.5pt' }}>EVIDENCE LABEL DESCRIPTION</td>
                                    <td style={{ fontWeight: 'normal', fontSize: '9pt' }}>{evidenceItem.description}</td>
                                </tr>
                                <tr>
                                    <td style={{ fontSize: '8.5pt' }}>CONNECTED CURRICULUM OBJECTIVES</td>
                                    <td style={{ fontWeight: 'normal', fontSize: '9pt', fontFamily: 'monospace' }}>
                                        {evidenceItem.linkedWorkActivities?.map((c: string) => {
                                            const milestoneDescriptionText = milestoneDescriptionsLookup[c] || '';
                                            return milestoneDescriptionText ? `${c} (${milestoneDescriptionText})` : c;
                                        }).join(' | ') || 'No standalone objectives bound.'}
                                    </td>
                                </tr>
                                <tr>
                                    <td style={{ fontSize: '8.5pt' }}>SECURE CLOUD STORAGE TARGET LOCATION</td>
                                    <td style={{ fontWeight: 'normal', fontSize: '8pt', fontFamily: 'monospace', wordBreak: 'break-all' }}>{evidenceItem.fileUrl || 'No remote storage path traced.'}</td>
                                </tr>
                            </tbody>
                        </table>

                        {isHyperlink ? (
                            <div style={{ padding: '25px 20px', border: '2px dashed #000000', background: '#ffffff', textAlign: 'center', margin: '15px auto', maxWidth: '800px', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                                <div style={{ fontSize: '24pt', marginBottom: '6px' }}>🔗</div>
                                <h3 style={{ margin: '0 0 6px 0', fontSize: '11pt', fontWeight: 'bold', color: '#000000', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    EXTERNAL COMPLIANCE SOURCE REFERENCE INDEXED
                                </h3>
                                <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', lineHeight: 1.5, textAlign: 'left' }}>
                                    This specific piece of evidence traces back to a live, external cloud-hosted workspace asset (such as an active deployment instance, project roadmap kanban board, or a collaborative design canvas) that cannot be natively rendered inside a static print engine context.
                                </p>
                                <p style={{ margin: '0 auto 10px', fontSize: '9.5pt', color: '#000000', lineHeight: 1.5, textAlign: 'left' }}>
                                    External moderators and SETA verification audit teams reviewing this physical logbook folder can inspect the complete interactive version history path directly by utilizing their digital system consoles to parse the uniform target location URI string mapped above.
                                </p>
                                <div style={{ borderTop: '1px solid #000000', paddingTop: '8px', marginTop: '12px', textAlign: 'left', fontSize: '8.5pt' }}>
                                    <strong>Institutional Compliance Note:</strong> Audit point successfully bound under registry token reference <strong>{evidenceItem.code}</strong>.
                                </div>
                            </div>
                        ) : isImg ? (
                            <div className="bulk-print-evidence-frame">
                                <img src={evidenceItem.fileUrl} className="bulk-print-evidence-img-payload" alt="Portfolio Artifact" />
                            </div>
                        ) : (
                            <div className="bulk-print-evidence-frame" style={{ textAlign: 'left', padding: '0' }}>
                                <BulkPrintPdfUnroller url={evidenceItem.fileUrl} />
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};