import React, { useMemo } from 'react';
import moment from 'moment';


// ==========================================================================
// 🚀 PRINTABLE COMPONENT: MIMICS PAGES 30-34 OF THE QCTO LOGBOOK DOCUMENT
// ==========================================================================
interface WorkplaceLogPrintableProps {
    log: any;
    logVersions: any[];
    mentorName: string;
}

const WorkplaceLogPrintable: React.FC<WorkplaceLogPrintableProps> = ({ log, logVersions, mentorName }) => {
    // Sort versions oldest to newest so the printed audit trail reads chronologically
    const chronologicalVersions = useMemo(() => {
        return [...logVersions].reverse();
    }, [logVersions]);

    return (
        <div className="qcto-diary-print-container active-log-print">
            <style type="text/css">
                {`
                    /* Default state: Hide completely from screen layout */
                    .qcto-diary-print-container {
                        display: none !important;
                    }

                    @media print {
                        /* 1. Hide every top-level element under the document body */
                        body > * {
                            display: none !important;
                            height: 0 !important;
                            overflow: hidden !important;
                        }
                        
                        /* 2. Force ONLY the active, scoped print container to display */
                        body > .qcto-diary-print-container.active-log-print {
                            display: block !important;
                            height: auto !important;
                            overflow: visible !important;
                            position: absolute !important;
                            left: 0 !important;
                            top: 0 !important;
                            width: 100% !important;
                            background: #ffffff !important;
                            color: #000000 !important;
                            font-family: Arial, Helvetica, sans-serif !important;
                            font-size: 10pt !important;
                            line-height: 1.5 !important;
                        }

                        /* Revert default display metrics for children within the container */
                        .qcto-diary-print-container.active-log-print * {
                            display: revert;
                        }

                        .print-diary-page {
                            page-break-after: always !important;
                            page-break-inside: avoid !important;
                            padding-top: 5mm;
                            padding-bottom: 15mm;
                        }

                        /* Header Info Table Structure */
                        .print-header-table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                            margin-bottom: 22px !important;
                            border: 2px solid #000000 !important;
                        }

                        .print-header-table td {
                            border: 1px solid #000000 !important;
                            padding: 10px 14px !important;
                            font-weight: bold !important;
                            color: #000000 !important;
                            font-size: 10pt !important;
                        }

                        .print-header-table td span {
                            font-weight: normal !important;
                            margin-left: 12px !important;
                        }

                        /* Main Evidence Grid Structure */
                        .print-data-table {
                            width: 100% !important;
                            border-collapse: collapse !important;
                            margin-bottom: 22px !important;
                            border: 2px solid #000000 !important;
                        }

                        .print-data-table th, .print-data-table td {
                            border: 1px solid #000000 !important;
                            padding: 14px !important;
                            vertical-align: top !important;
                            color: #000000 !important;
                        }

                        .print-data-table th {
                            background-color: #f1f5f9 !important;
                            text-align: left !important;
                            font-weight: bold !important;
                            font-size: 9.5pt !important;
                            text-transform: uppercase !important;
                            letter-spacing: 0.5px !important;
                            -webkit-print-color-adjust: exact !important;
                            print-color-adjust: exact !important;
                        }

                        /* Remedial / Review Comment Block */
                        .print-comments-box {
                            border: 2px solid #000000 !important;
                            padding: 14px !important;
                            min-height: 130px !important;
                            margin-bottom: 25px !important;
                            color: #000000 !important;
                            background: #ffffff !important;
                        }

                        /* Official QCTO Physical Signatures Area */
                        .print-signatures-grid {
                            display: grid !important;
                            grid-template-columns: 1fr 1fr 1fr !important;
                            gap: 35px !important;
                            margin-top: 65px !important;
                        }

                        .print-sig-line {
                            border-top: 1.5px solid #000000 !important;
                            padding-top: 8px !important;
                            text-align: center !important;
                            font-size: 8.5pt !important;
                            font-weight: bold !important;
                            color: #000000 !important;
                            letter-spacing: 0.5px !important;
                        }

                        .html-content p { margin: 0 0 8px 0 !important; color: #000000 !important; }
                        .html-content ul, .html-content ol { margin: 0 !important; padding-left: 22px !important; color: #000000 !important; }
                        .html-content li { margin-bottom: 4px !important; }
                    }
                `}
            </style>

            {chronologicalVersions.map((version, index) => {
                const versionNumber = index + 1;
                const displayDate = log.dateString ? moment(log.dateString).format('DD MMMM YYYY') : '____________________';
                const formattedHours = version.totalHours || log.totalHours || '0';

                return (
                    <div key={version.updatedAt || index} className="print-diary-page">
                        {/* Upper Info Box */}
                        <table className="print-header-table">
                            <tbody>
                                <tr>
                                    <td style={{ width: '25%' }}>CANDIDATE NAME</td>
                                    <td style={{ width: '75%' }}>
                                        <span>{log.learnerName || '________________________________________'}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>SUPERVISOR NAME</td>
                                    <td>
                                        <span>{mentorName || '________________________________________'}</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td>JOURNAL PERIOD</td>
                                    <td>
                                        <span>FROM: {displayDate}</span>
                                        <span style={{ marginLeft: '30px' }}>TO: {displayDate}</span>
                                        <span style={{ float: 'right', fontStyle: 'italic', fontWeight: 'normal', fontSize: '9pt' }}>
                                            Revision Lifecycle: Page {versionNumber} of {chronologicalVersions.length}
                                        </span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Core Logbook Layout Entry */}
                        <table className="print-data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '20%' }}>DATE</th>
                                    <th style={{ width: '65%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE</th>
                                    <th style={{ width: '15%', textAlign: 'center' }}>TOTAL HOURS</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td>
                                        <strong style={{ fontSize: '10.5pt', display: 'block', marginBottom: '4px' }}>
                                            {log.dateString ? moment(log.dateString).format('DD/MM/YYYY') : 'N/A'}
                                        </strong>
                                        <div style={{ fontSize: '8.5pt', fontWeight: 'normal', color: '#000000' }}>
                                            Shift: {log.startTime || '??:??'} - {log.endTime || '??:??'}
                                        </div>
                                    </td>
                                    <td>
                                        {log.isQctoAligned && (
                                            <div style={{ marginBottom: '14px', paddingBottom: '10px', borderBottom: '1.5px dashed #000000', fontSize: '9.5pt' }}>
                                                <strong>Curriculum Unit:</strong> {log.workActivityCode} — {log.workActivityLabel || log.moduleName}
                                                {log.topicTitle && <div style={{ fontStyle: 'italic', marginTop: '3px', fontWeight: 'normal' }}>Topic: {log.topicTitle}</div>}
                                            </div>
                                        )}
                                        <div
                                            className="html-content"
                                            style={{ fontSize: '10pt', color: '#000000' }}
                                            dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<em>No tasks entered.</em>' }}
                                        />
                                        {version.evidenceUrl && (
                                            <div style={{ marginTop: '14px', fontSize: '8.5pt', fontStyle: 'italic', color: '#000000' }}>
                                                * Cloud Link Asset Verified Online: {version.evidenceUrl.substring(0, 65)}...
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12pt', verticalAlign: 'middle' }}>
                                        {formattedHours}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        {/* Supervisor Comments Block */}
                        <div className="print-comments-box">
                            <strong style={{ fontSize: '9.5pt', textTransform: 'uppercase' }}>SUPERVISOR COMMENTS: / REMEDIAL / IMPROVEMENT AREAS</strong>
                            <div className="html-content" style={{ marginTop: '12px', fontSize: '10pt', color: '#000000' }}>
                                {version.rejectionReason ? (
                                    <div dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
                                ) : version.status === 'Approved' ? (
                                    <p style={{ fontWeight: 'bold' }}>✓ Digitally authenticated and approved via system access matching secure profile validation keys.</p>
                                ) : (
                                    <p style={{ color: '#000000', fontStyle: 'italic' }}>No correction notes logged. Record preserved under structural verification state: "{version.status}".</p>
                                )}
                            </div>
                        </div>

                        {/* Signatures Footer */}
                        <div className="print-signatures-grid">
                            <div>
                                <div style={{ height: '40px' }}></div>
                                <div className="print-sig-line">SUPERVISOR SIGNATURE</div>
                            </div>
                            <div>
                                <div style={{ height: '40px' }}></div>
                                <div className="print-sig-line">ASSESSOR SIGNATURE</div>
                            </div>
                            <div>
                                <div style={{ height: '40px' }}></div>
                                <div className="print-sig-line">LEARNER SIGNATURE</div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};


// import React, { useMemo } from 'react';
// import moment from 'moment';

// interface WorkplaceLogPrintableProps {
//     log: any;
//     logVersions: any[];
//     mentorName: string;
// }

// export const WorkplaceLogPrintable: React.FC<WorkplaceLogPrintableProps> = ({ log, logVersions, mentorName }) => {
//     // 🚀 THE FIX: Generate a strictly unique, safe CSS class name based on this specific log ID
//     const safeLogId = useMemo(() => {
//         return String(log?.id || 'active-job').replace(/[^a-zA-Z0-9-_]/g, '');
//     }, [log?.id]);

//     const uniqueClassName = `qcto-print-scope-${safeLogId}`;

//     // Force chronological layout for the auditor (oldest version to newest version)
//     const chronologicalVersions = useMemo(() => {
//         return [...logVersions].reverse();
//     }, [logVersions]);

//     return (
//         <div className={`qcto-diary-single-print-engine ${uniqueClassName}`}>
//             <style type="text/css">
//                 {`
//                     /* Default state: Ensure it stays completely invisible on screen layouts */
//                     .qcto-diary-single-print-engine {
//                         display: none !important;
//                     }

//                     @media print {
//                         /* 1. Nuke absolutely every generic direct child under the body root */
//                         body > * {
//                             display: none !important;
//                             height: 0 !important;
//                             overflow: hidden !important;
//                         }
                        
//                         /* 2. SPECIFIC INSTANCE WHITELIST: Force reveal ONLY the print layout matching this exact log ID */
//                         body > .qcto-diary-single-print-engine.${uniqueClassName} {
//                             display: block !important;
//                             height: auto !important;
//                             overflow: visible !important;
//                             position: absolute !important;
//                             left: 0 !important;
//                             top: 0 !important;
//                             width: 100% !important;
//                             background: #ffffff !important;
//                             color: #000000 !important;
//                             font-family: Arial, sans-serif !important;
//                             font-size: 10pt !important;
//                             line-height: 1.5 !important;
//                         }

//                         /* Revert default rendering blocks specifically inside our isolated whitelist container */
//                         .qcto-diary-single-print-engine.${uniqueClassName} * {
//                             display: revert;
//                         }

//                         .print-diary-page {
//                             page-break-after: always !important;
//                             page-break-inside: avoid !important;
//                             padding-top: 10mm;
//                             padding-bottom: 15mm;
//                         }

//                         .print-header-table {
//                             width: 100% !important;
//                             border-collapse: collapse !important;
//                             margin-bottom: 20px !important;
//                             border: 2px solid #000000 !important;
//                         }

//                         .print-header-table td {
//                             border: 1px solid #000000 !important;
//                             padding: 8px 12px !important;
//                             font-weight: bold !important;
//                             color: #000000 !important;
//                         }

//                         .print-header-table td span {
//                             font-weight: normal !important;
//                             margin-left: 12px !important;
//                         }

//                         .print-data-table {
//                             width: 100% !important;
//                             border-collapse: collapse !important;
//                             margin-bottom: 20px !important;
//                             border: 2px solid #000000 !important;
//                         }

//                         .print-data-table th, .print-data-table td {
//                             border: 1px solid #000000 !important;
//                             padding: 12px !important;
//                             vertical-align: top !important;
//                             color: #000000 !important;
//                         }

//                         .print-data-table th {
//                             background-color: #f1f5f9 !important;
//                             text-align: left !important;
//                             font-weight: bold !important;
//                             font-size: 9.5pt !important;
//                             text-transform: uppercase !important;
//                         }

//                         .print-comments-box {
//                             border: 2px solid #000000 !important;
//                             padding: 14px !important;
//                             min-height: 120px !important;
//                             margin-bottom: 25px !important;
//                             color: #000000 !important;
//                         }

//                         .print-signatures-grid {
//                             display: grid !important;
//                             grid-template-columns: 1fr 1fr 1fr !important;
//                             gap: 30px !important;
//                             margin-top: 60px !important;
//                         }

//                         .print-sig-line {
//                             border-top: 1.5px solid #000000 !important;
//                             padding-top: 8px !important;
//                             text-align: center !important;
//                             font-size: 8.5pt !important;
//                             font-weight: bold !important;
//                             color: #000000 !important;
//                         }

//                         .html-content p { margin: 0 0 8px 0 !important; color: #000000 !important; }
//                         .html-content ul, .html-content ol { margin: 0 !important; padding-left: 20px !important; color: #000000 !important; }
//                     }
//                 `}
//             </style>

//             {chronologicalVersions.map((version, index) => {
//                 const displayDate = log.dateString ? moment(log.dateString).format('DD MMMM YYYY') : '____________________';
//                 return (
//                     <div key={version.updatedAt || index} className="print-diary-page">
//                         <table className="print-header-table">
//                             <tbody>
//                                 <tr>
//                                     <td style={{ width: '25%' }}>CANDIDATE NAME</td>
//                                     <td style={{ width: '75%' }}><span>{log.learnerName || '________________________________________'}</span></td>
//                                 </tr>
//                                 <tr>
//                                     <td>SUPERVISOR NAME</td>
//                                     <td><span>{mentorName || '________________________________________'}</span></td>
//                                 </tr>
//                                 <tr>
//                                     <td>JOURNAL PERIOD</td>
//                                     <td>
//                                         <span>FROM: {displayDate}</span>
//                                         <span style={{ marginLeft: '30px' }}>TO: {displayDate}</span>
//                                         <span style={{ float: 'right', fontStyle: 'italic', fontWeight: 'normal', fontSize: '9pt' }}>
//                                             Version {index + 1} of {chronologicalVersions.length}
//                                         </span>
//                                     </td>
//                                 </tr>
//                             </tbody>
//                         </table>

//                         <table className="print-data-table">
//                             <thead>
//                                 <tr>
//                                     <th style={{ width: '20%' }}>DATE</th>
//                                     <th style={{ width: '65%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE</th>
//                                     <th style={{ width: '15%', textAlign: 'center' }}>TOTAL HOURS</th>
//                                 </tr>
//                             </thead>
//                             <tbody>
//                                 <tr>
//                                     <td>
//                                         <strong>{log.dateString ? moment(log.dateString).format('DD/MM/YYYY') : 'N/A'}</strong>
//                                         <div style={{ fontSize: '8.5pt', marginTop: '6px', color: '#000' }}>
//                                             Shift: {log.startTime} - {log.endTime}
//                                         </div>
//                                     </td>
//                                     <td>
//                                         {log.isQctoAligned && (
//                                             <div style={{ marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px dashed #000', fontSize: '9pt' }}>
//                                                 <strong>Curriculum Alignment:</strong> {log.workActivityCode} — {log.workActivityLabel || log.moduleName}
//                                             </div>
//                                         )}
//                                         <div className="html-content" dangerouslySetInnerHTML={{ __html: version.tasksPerformed || '<em>No description.</em>' }} />
//                                     </td>
//                                     <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11pt', verticalAlign: 'middle' }}>
//                                         {version.totalHours || log.totalHours}
//                                     </td>
//                                 </tr>
//                             </tbody>
//                         </table>

//                         <div className="print-comments-box">
//                             <strong>SUPERVISOR COMMENTS: / REMEDIAL / IMPROVEMENT AREAS</strong>
//                             <div className="html-content" style={{ marginTop: '12px' }}>
//                                 {version.rejectionReason ? (
//                                     <div dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
//                                 ) : version.status === 'Approved' ? (
//                                     <p>✓ Digitally verified and endorsed by supervisor profile.</p>
//                                 ) : (
//                                     <p style={{ fontStyle: 'italic', color: '#666' }}>Record saved under state: {version.status}</p>
//                                 )}
//                             </div>
//                         </div>

//                         <div className="print-signatures-grid">
//                             <div className="print-sig-line">SUPERVISOR SIGNATURE</div>
//                             <div className="print-sig-line">ASSESSOR SIGNATURE</div>
//                             <div className="print-sig-line">LEARNER SIGNATURE</div>
//                         </div>
//                     </div>
//                 );
//             })}
//         </div>
//     );
// };

// // import React, { forwardRef } from 'react';
// // import moment from 'moment';

// // interface WorkplaceLogPrintableProps {
// //     log: any;
// //     logVersions: any[];
// //     mentorName: string;
// // }

// // export const WorkplaceLogPrintable = forwardRef<HTMLDivElement, WorkplaceLogPrintableProps>(({
// //     log,
// //     logVersions,
// //     mentorName
// // }, ref) => {
// //     // Sort versions oldest to newest so the printed document reads chronologically
// //     const chronologicalVersions = [...logVersions].reverse();

// //     return (
// //         <div ref={ref} className="qcto-print-container">
// //             <style type="text/css" media="print">
// //                 {`
// //                     @page { size: A4 portrait; margin: 15mm; }
// //                     body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
// //                     .qcto-print-container { display: block !important; font-family: Arial, sans-serif; font-size: 10pt; color: #000; line-height: 1.5; }
                    
// //                     /* Hide everything else on the screen when printing */
// //                     body > *:not(.lfm-overlay) { display: none !important; }
// //                     .lfm-modal { display: none !important; }

// //                     .print-diary-page { page-break-after: always; padding-bottom: 20px; }
// //                     .print-header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 2px solid #000; }
// //                     .print-header-table td { border: 1px solid #000; padding: 6px 10px; font-weight: bold; }
// //                     .print-header-table td span { font-weight: normal; margin-left: 10px; }
                    
// //                     .print-data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 2px solid #000; }
// //                     .print-data-table th, .print-data-table td { border: 1px solid #000; padding: 10px; vertical-align: top; }
// //                     .print-data-table th { background-color: #f2f2f2 !important; text-align: left; text-transform: uppercase; }
                    
// //                     .print-comments-box { border: 2px solid #000; padding: 10px; min-height: 120px; margin-bottom: 20px; }
// //                     .print-signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-top: 60px; }
// //                     .print-sig-line { border-top: 1px solid #000; padding-top: 5px; text-align: center; text-transform: uppercase; font-size: 9pt; font-weight: bold; }
                    
// //                     .print-version-badge { font-style: italic; color: #555; font-weight: normal; font-size: 10pt; }
                    
// //                     /* Clean up HTML formatting from Quill */
// //                     .html-content p { margin-top: 0; margin-bottom: 8px; }
// //                     .html-content ul { margin-top: 0; padding-left: 20px; }
// //                 `}
// //             </style>

// //             {chronologicalVersions.map((version, index) => {
// //                 const isLatest = index === chronologicalVersions.length - 1;

// //                 return (
// //                     <div key={index} className="print-diary-page">

// //                         <table className="print-header-table">
// //                             <tbody>
// //                                 <tr>
// //                                     <td style={{ width: '25%' }}>CANDIDATE NAME</td>
// //                                     <td style={{ width: '75%' }}><span>{log.learnerName || '________________________'}</span></td>
// //                                 </tr>
// //                                 <tr>
// //                                     <td>SUPERVISOR NAME</td>
// //                                     <td><span>{mentorName || '________________________'}</span></td>
// //                                 </tr>
// //                                 <tr>
// //                                     <td>JOURNAL PERIOD</td>
// //                                     <td>
// //                                         <span>FROM: {moment(log.dateString).format('DD MMM YYYY')}</span>
// //                                         <span style={{ marginLeft: '40px' }}>TO: {moment(log.dateString).format('DD MMM YYYY')}</span>
// //                                         <span style={{ float: 'right', fontWeight: 'normal', fontStyle: 'italic', fontSize: '9pt' }}>
// //                                             (Version {index + 1} of {chronologicalVersions.length})
// //                                         </span>
// //                                     </td>
// //                                 </tr>
// //                             </tbody>
// //                         </table>

// //                         <table className="print-data-table">
// //                             <thead>
// //                                 <tr>
// //                                     <th style={{ width: '15%' }}>DATE</th>
// //                                     <th style={{ width: '70%' }}>DIARY ENTRY OF WORKPLACE EVIDENCE</th>
// //                                     <th style={{ width: '15%', textAlign: 'center' }}>TOTAL HOURS</th>
// //                                 </tr>
// //                             </thead>
// //                             <tbody>
// //                                 <tr>
// //                                     <td>
// //                                         {moment(log.dateString).format('DD/MM/YYYY')}
// //                                         <br /><br />
// //                                         <span style={{ fontSize: '8pt', fontWeight: 'normal' }}>
// //                                             {log.startTime} to {log.endTime}
// //                                         </span>
// //                                     </td>
// //                                     <td>
// //                                         {log.isQctoAligned && (
// //                                             <div style={{ marginBottom: '10px', paddingBottom: '10px', borderBottom: '1px dashed #ccc' }}>
// //                                                 <strong>Curriculum Alignment:</strong> {log.workActivityCode} <br />
// //                                                 <em>{log.topicTitle}</em>
// //                                             </div>
// //                                         )}
// //                                         <div className="html-content" dangerouslySetInnerHTML={{ __html: version.tasksPerformed || 'No details provided.' }} />

// //                                         {version.evidenceUrl && (
// //                                             <div style={{ marginTop: '15px', fontStyle: 'italic', fontSize: '9pt', color: '#444' }}>
// //                                                 * Digital evidence document attached online.
// //                                             </div>
// //                                         )}
// //                                     </td>
// //                                     <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12pt' }}>
// //                                         {version.totalHours || log.totalHours}
// //                                     </td>
// //                                 </tr>
// //                             </tbody>
// //                         </table>

// //                         <div className="print-comments-box">
// //                             <strong>SUPERVISOR COMMENTS: / REMEDIAL / IMPROVEMENT AREAS</strong>
// //                             <div className="html-content" style={{ marginTop: '10px' }}>
// //                                 {version.rejectionReason ? (
// //                                     <div dangerouslySetInnerHTML={{ __html: version.rejectionReason }} />
// //                                 ) : (
// //                                     version.status === 'Approved' ? (
// //                                         <p><em>Officially Approved by Supervisor/Mentor via Digital Signature.</em></p>
// //                                     ) : (
// //                                         <p><em>_________________________________________________________________________</em></p>
// //                                     )
// //                                 )}
// //                             </div>
// //                         </div>

// //                         <div className="print-signatures">
// //                             <div style={{ marginTop: '50px' }}>
// //                                 <div className="print-sig-line">SUPERVISOR SIGNATURE</div>
// //                             </div>
// //                             <div style={{ marginTop: '50px' }}>
// //                                 <div className="print-sig-line">ASSESSOR SIGNATURE</div>
// //                             </div>
// //                             <div style={{ marginTop: '50px' }}>
// //                                 <div className="print-sig-line">LEARNER SIGNATURE</div>
// //                             </div>
// //                         </div>
// //                     </div>
// //                 );
// //             })}
// //         </div>
// //     );
// // });

// // WorkplaceLogPrintable.displayName = 'WorkplaceLogPrintable';