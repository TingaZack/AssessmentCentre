import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import * as XLSX from 'xlsx';
import { writeBatch, doc, collection } from 'firebase/firestore';
import { UploadCloud, CheckCircle2, X, Info, Loader2, Layers, FileSpreadsheet } from 'lucide-react';
import { db } from '../../../lib/firebase';
import { useToast } from '../../../components/common/Toast/Toast';
import type { DashboardLearner } from '../../../types';

interface ZoomAttendanceDropZoneProps {
    cohort: any;
    enrolledLearners: DashboardLearner[];
    isOpen: boolean;
    onClose: () => void;
}

export const ZoomAttendanceDropZone: React.FC<ZoomAttendanceDropZoneProps> = ({ cohort, enrolledLearners, isOpen, onClose }) => {
    const toast = useToast();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<'upload' | 'saving' | 'complete'>('upload');
    const [uploadStats, setUploadStats] = useState<{ sheetsProcessed: number, totalRecords: number } | null>(null);

    // Reset state when modal is toggled
    useEffect(() => {
        if (!isOpen) {
            setStep('upload');
            setUploadStats(null);
        }
    }, [isOpen]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep('saving');
        setUploadStats(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const allSessions: any[] = [];
                let totalRecordsParsed = 0;

                // 1. Iterate over every tab (worksheet) in the Excel file
                for (const sheetName of workbook.SheetNames) {
                    let sessionDate = '';

                    // Extract date from tab name (e.g., "2026_01_19" or "2026-01-19")
                    const dateMatch = sheetName.match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
                    if (dateMatch) {
                        sessionDate = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
                    } else {
                        console.warn(`Skipping tab "${sheetName}": Cannot extract YYYY-MM-DD date.`);
                        continue;
                    }

                    const worksheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

                    // Dynamically find the header row (Zoom puts it anywhere from row 0 to 5)
                    const headerIdx = rows.findIndex(row => row.some(cell => String(cell).toLowerCase().includes('duration (minutes)')));

                    if (headerIdx === -1) {
                        console.warn(`Skipping tab "${sheetName}": No 'Duration (Minutes)' column found.`);
                        continue;
                    }

                    const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
                    const emailIdx = headers.findIndex(h => h.includes('user email') || h === 'email');
                    const nameIdx = headers.findIndex(h => h.includes('name (original name)') || h === 'name');
                    const durationIdx = headers.findIndex(h => h.includes('duration (minutes)'));

                    const zoomData = new Map<string, { name: string, email: string, duration: number }>();

                    // Parse learner rows
                    for (let i = headerIdx + 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length === 0 || !row[nameIdx]) continue;

                        const email = String(row[emailIdx] || '').toLowerCase().trim();
                        const name = String(row[nameIdx] || '').trim();
                        const duration = parseInt(row[durationIdx]) || 0;

                        const key = email || name;
                        if (zoomData.has(key)) {
                            zoomData.get(key)!.duration += duration;
                        } else {
                            zoomData.set(key, { name, email, duration });
                        }
                    }

                    const rawZoomPayload = Array.from(zoomData.values());

                    if (rawZoomPayload.length > 0) {
                        allSessions.push({ date: sessionDate, rawData: rawZoomPayload });
                        totalRecordsParsed += rawZoomPayload.length;
                    }
                }

                if (allSessions.length === 0) {
                    toast.error("No valid attendance data or correctly named date tabs found.");
                    setStep('upload');
                    return;
                }

                // 2. Safe Batching to Firestore (Prevents 500 document limit crashes)
                const batches = [writeBatch(db)];
                let opCount = 0;

                const getSafeBatch = () => {
                    if (opCount >= 490) {
                        batches.push(writeBatch(db));
                        opCount = 0;
                    }
                    opCount++;
                    return batches[batches.length - 1];
                };

                const timestamp = new Date().toISOString();

                for (const session of allSessions) {
                    const { date, rawData } = session;

                    // Automatically determine Expected Duration based on the max time any learner spent
                    const maxDuration = Math.max(...rawData.map((r: any) => r.duration));
                    const expected = maxDuration > 30 ? maxDuration : 120; // Fallback to 120 if absurdly low

                    let presentCount = 0;
                    let partialCount = 0;
                    let absentCount = 0;

                    const logId = `${cohort.id}_${date}`;
                    const attendanceRef = doc(db, 'attendance_logs', logId);

                    enrolledLearners.forEach(learner => {
                        const learnerEmail = learner.email?.toLowerCase().trim();
                        const learnerName = learner.fullName?.toLowerCase().trim();

                        const zoomMatch = rawData.find((val: any) =>
                            (learnerEmail && val.email === learnerEmail) || val.name.toLowerCase() === learnerName
                        );

                        const duration = zoomMatch ? zoomMatch.duration : 0;
                        const pct = expected > 0 ? (duration / expected) * 100 : 0;
                        let status: 'Present' | 'Partial' | 'Absent' = 'Absent';

                        // Calculate compliance status
                        if (pct >= 80) status = 'Present';
                        else if (pct > 20) status = 'Partial';

                        if (status === 'Present') presentCount++;
                        else if (status === 'Partial') partialCount++;
                        else absentCount++;

                        const recordId = `${cohort.id}_${date}_${learner.id}`;
                        const recordRef = doc(db, 'attendance_records', recordId);

                        getSafeBatch().set(recordRef, {
                            attendanceLogId: logId,
                            cohortId: cohort.id,
                            learnerId: learner.id,
                            sessionDate: date,
                            expectedDuration: expected,
                            actualDuration: duration,
                            status: status,
                            compliancePct: Math.round(pct),
                            updatedAt: timestamp
                        }, { merge: true });
                    });

                    // Save parent log for the day
                    getSafeBatch().set(attendanceRef, {
                        cohortId: cohort.id,
                        sessionDate: date,
                        expectedDuration: expected,
                        updatedAt: timestamp,
                        totalEnrolled: enrolledLearners.length,
                        totalPresent: presentCount,
                        totalPartial: partialCount,
                        totalAbsent: absentCount,
                        rawZoomData: rawData
                    }, { merge: true });
                }

                // 3. Commit all batches simultaneously
                for (const batch of batches) {
                    await batch.commit();
                }

                setUploadStats({ sheetsProcessed: allSessions.length, totalRecords: totalRecordsParsed });
                toast.success(`Successfully uploaded ${allSessions.length} sessions!`);
                setStep('complete');

            } catch (err) {
                console.error("Parse/Save error:", err);
                toast.error("Failed to parse and save the file. Check format.");
                setStep('upload');
            }
        };
        reader.readAsArrayBuffer(file);
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="lfm-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="lfm-modal" style={{ maxWidth: '700px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>

                {/* HEADER */}
                <div className="lfm-header" style={{ background: 'var(--mlab-blue)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className="lfm-header__title" style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.1rem' }}>
                        <UploadCloud size={20} /> Bulk Multi-Tab Importer
                    </h2>
                    <button className="lfm-close-btn" onClick={onClose} disabled={step === 'saving'} style={{ background: 'transparent', border: 'none', cursor: step === 'saving' ? 'not-allowed' : 'pointer', display: 'flex' }}>
                        <X size={20} style={{ color: 'white', opacity: step === 'saving' ? 0.5 : 1 }} />
                    </button>
                </div>

                {/* SCROLLABLE BODY */}
                <div className="lfm-body" style={{ flex: 1, overflowY: 'auto', padding: '2rem 1.5rem' }}>
                    {step === 'complete' ? (
                        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                            <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 style={{ color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Attendance Captured</h3>

                            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: '10px', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', margin: '1rem 0 2rem' }}>
                                <span style={{ color: 'var(--mlab-blue)', fontWeight: 'bold', fontSize: '1.2rem' }}>{uploadStats?.sheetsProcessed} Dates Processed</span>
                                <span style={{ color: 'var(--mlab-grey)', fontSize: '0.9rem' }}>{uploadStats?.totalRecords} individual Zoom records mapped to {enrolledLearners.length} learners.</span>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
                                <button className="wm-btn wm-btn--ghost" onClick={onClose}>Close Window</button>
                                <button className="wm-btn wm-btn--primary" onClick={() => { setStep('upload'); }}>Upload Another Document</button>
                            </div>
                        </div>
                    ) : step === 'saving' ? (
                        <div style={{ textAlign: "center", padding: "4rem 0" }}>
                            <Loader2 className="spin" size={48} color="#0ea5e9" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 style={{ color: '#0f172a', fontWeight: 700, margin: '0 0 8px' }}>Processing Worksheets...</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem' }}>Mapping attendees and calculating compliance across all tabs.<br />Please don't close this window.</p>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)', textAlign: 'left' }}>
                                <h3 style={{ margin: '0 0 8px', color: 'var(--mlab-blue)' }}>Upload Multi-Tab Excel File</h3>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--mlab-grey)' }}>
                                    Upload a spreadsheet containing multiple sheets (tabs). The system will automatically detect the date from the tab name, calculate the expected session length, and assign attendance statuses.
                                </p>
                            </div>

                            <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />

                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{ border: '2px dashed #0ea5e9', borderRadius: '12px', padding: '4rem 2rem', cursor: 'pointer', background: '#f0f9ff', transition: 'all 0.2s ease', maxWidth: '600px', margin: '0 auto' }}
                            >
                                <Layers size={48} color="#0ea5e9" style={{ margin: '0 auto 1rem' }} />
                                <h4 style={{ color: '#0369a1', fontWeight: 700, margin: '0 0 8px', fontSize: '1.1rem' }}>Drop Excel Report Here</h4>
                                <span style={{ fontSize: '0.85rem', color: '#0284c7' }}>Ensure tabs are named like <strong>2026_01_19</strong> or <strong>2026-01-19</strong></span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '2rem', color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>
                                <Info size={14} /> <span>Ghost Login Defense Active: Requires 80% duration for a 'Present' flag.</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};



// // src/components/admin/attendance/ZoomAttendanceDropZone.tsx

// import React, { useState, useRef } from 'react';
// import { createPortal } from 'react-dom';
// import * as XLSX from 'xlsx';
// import { writeBatch, doc } from 'firebase/firestore';
// import { UploadCloud, CheckCircle2, Save, X, Timer, Info, Loader2 } from 'lucide-react';
// import { db } from '../../../lib/firebase';
// import { useToast } from '../../../components/common/Toast/Toast';
// import type { DashboardLearner } from '../../../types';

// interface ZoomAttendanceDropZoneProps {
//     cohort: any;
//     enrolledLearners: DashboardLearner[];
//     isOpen: boolean;
//     onClose: () => void;
// }

// interface AttendanceRecord {
//     learnerId: string | null;
//     fullName: string;
//     email: string;
//     zoomDuration: number;
//     status: 'Present' | 'Partial' | 'Absent';
//     compliancePct: number;
//     isMatched: boolean;
// }

// export const ZoomAttendanceDropZone: React.FC<ZoomAttendanceDropZoneProps> = ({ cohort, enrolledLearners, isOpen, onClose }) => {
//     const toast = useToast();
//     const fileInputRef = useRef<HTMLInputElement>(null);

//     const [step, setStep] = useState<'upload' | 'review' | 'saving' | 'complete'>('upload');
//     const [records, setRecords] = useState<AttendanceRecord[]>([]);
//     const [rawZoomPayload, setRawZoomPayload] = useState<any[]>([]);
//     const [sessionDate, setSessionDate] = useState<string>(new Date().toISOString().split('T')[0]);
//     const [expectedDuration, setExpectedDuration] = useState<number>(120);

//     // Reset everything if the modal is closed and reopened
//     React.useEffect(() => {
//         if (!isOpen) {
//             setStep('upload');
//             setRecords([]);
//             setRawZoomPayload([]);
//         }
//     }, [isOpen]);

//     const calculateStatus = (duration: number, expected: number): { status: 'Present' | 'Partial' | 'Absent', pct: number } => {
//         const pct = expected > 0 ? (duration / expected) * 100 : 0;
//         if (pct >= 80) return { status: 'Present', pct };
//         if (pct > 20) return { status: 'Partial', pct };
//         return { status: 'Absent', pct };
//     };

//     const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         const dateMatch = file.name.match(/(\d{4})[_-](\d{2})[_-](\d{2})/);
//         if (dateMatch) {
//             setSessionDate(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
//         }

//         const reader = new FileReader();
//         reader.onload = (event) => {
//             try {
//                 const data = new Uint8Array(event.target?.result as ArrayBuffer);
//                 const workbook = XLSX.read(data, { type: 'array' });
//                 const worksheet = workbook.Sheets[workbook.SheetNames[0]];
//                 const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as any[][];

//                 const headerIdx = rows.findIndex(row => row.some(cell => String(cell).toLowerCase().includes('duration (minutes)')));

//                 if (headerIdx === -1) {
//                     toast.error("Invalid Zoom CSV. Could not find 'Duration (Minutes)' column.");
//                     return;
//                 }

//                 const headers = rows[headerIdx].map(h => String(h).toLowerCase().trim());
//                 const emailIdx = headers.findIndex(h => h.includes('user email') || h === 'email');
//                 const nameIdx = headers.findIndex(h => h.includes('name (original name)') || h === 'name');
//                 const durationIdx = headers.findIndex(h => h.includes('duration (minutes)'));

//                 const zoomData = new Map<string, { name: string, email: string, duration: number }>();

//                 for (let i = headerIdx + 1; i < rows.length; i++) {
//                     const row = rows[i];
//                     if (!row || row.length === 0 || !row[nameIdx]) continue;

//                     const email = String(row[emailIdx] || '').toLowerCase().trim();
//                     const name = String(row[nameIdx] || '').trim();
//                     const duration = parseInt(row[durationIdx]) || 0;

//                     const key = email || name;
//                     if (zoomData.has(key)) {
//                         zoomData.get(key)!.duration += duration;
//                     } else {
//                         zoomData.set(key, { name, email, duration });
//                     }
//                 }

//                 setRawZoomPayload(Array.from(zoomData.values()));
//                 const matchedRecords: AttendanceRecord[] = [];

//                 enrolledLearners.forEach(learner => {
//                     const learnerEmail = learner.email?.toLowerCase().trim();
//                     const learnerName = learner.fullName?.toLowerCase().trim();

//                     let zoomMatch = Array.from(zoomData.entries()).find(([key, val]) =>
//                         (learnerEmail && key === learnerEmail) || val.name.toLowerCase().trim() === learnerName
//                     );

//                     const duration = zoomMatch ? zoomMatch[1].duration : 0;
//                     const { status, pct } = calculateStatus(duration, expectedDuration);

//                     matchedRecords.push({
//                         learnerId: learner.id,
//                         fullName: learner.fullName,
//                         email: learner.email || '',
//                         zoomDuration: duration,
//                         status,
//                         compliancePct: Math.round(pct),
//                         isMatched: !!zoomMatch
//                     });
//                 });

//                 setRecords(matchedRecords);
//                 setStep('review');
//             } catch (err) {
//                 console.error("Parse error:", err);
//                 toast.error("Failed to parse the file.");
//             }
//         };
//         reader.readAsArrayBuffer(file);
//     };

//     const handleDurationChange = (newDuration: number) => {
//         setExpectedDuration(newDuration);
//         setRecords(prev => prev.map(rec => {
//             const { status, pct } = calculateStatus(rec.zoomDuration, newDuration);
//             return { ...rec, status, compliancePct: Math.round(pct) };
//         }));
//     };

//     const handleSave = async () => {
//         setStep('saving');
//         try {
//             const batch = writeBatch(db);
//             const timestamp = new Date().toISOString();

//             const logId = `${cohort.id}_${sessionDate}`;
//             const attendanceRef = doc(db, 'attendance_logs', logId);

//             batch.set(attendanceRef, {
//                 cohortId: cohort.id,
//                 sessionDate: sessionDate,
//                 expectedDuration: expectedDuration,
//                 updatedAt: timestamp,
//                 totalEnrolled: enrolledLearners.length,
//                 totalPresent: records.filter(r => r.status === 'Present').length,
//                 totalPartial: records.filter(r => r.status === 'Partial').length,
//                 totalAbsent: records.filter(r => r.status === 'Absent').length,
//                 rawZoomData: rawZoomPayload
//             }, { merge: true });

//             records.forEach(rec => {
//                 const recordId = `${cohort.id}_${sessionDate}_${rec.learnerId}`;
//                 const recordRef = doc(db, 'attendance_records', recordId);

//                 batch.set(recordRef, {
//                     attendanceLogId: logId,
//                     cohortId: cohort.id,
//                     learnerId: rec.learnerId,
//                     sessionDate: sessionDate,
//                     expectedDuration: expectedDuration,
//                     actualDuration: rec.zoomDuration,
//                     status: rec.status,
//                     compliancePct: rec.compliancePct,
//                     updatedAt: timestamp
//                 }, { merge: true });
//             });

//             await batch.commit();
//             toast.success("Attendance synced to global ledger.");
//             setStep('complete');
//         } catch (error) {
//             console.error("Error saving attendance", error);
//             toast.error("Failed to save attendance.");
//             setStep('review');
//         }
//     };

//     if (!isOpen) return null;

//     return createPortal(
//         <div className="lfm-overlay" style={{ zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
//             <div className="lfm-modal" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'white', overflow: 'hidden' }}>

//                 {/* HEADER */}
//                 <div className="lfm-header" style={{ background: 'var(--mlab-blue)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//                     <h2 className="lfm-header__title" style={{ color: 'white', display: 'flex', alignItems: 'center', gap: '8px', margin: 0, fontSize: '1.1rem' }}>
//                         <UploadCloud size={20} /> Zoom Intelligence Engine
//                     </h2>
//                     <button className="lfm-close-btn" onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
//                         <X size={20} style={{ color: 'white' }} />
//                     </button>
//                 </div>

//                 {/* SCROLLABLE BODY */}
//                 <div className="lfm-body" style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
//                     {step === 'complete' ? (
//                         <div style={{ textAlign: 'center', padding: '4rem 0' }}>
//                             <CheckCircle2 size={64} color="var(--mlab-green)" style={{ margin: '0 auto 1.5rem' }} />
//                             <h3 style={{ color: 'var(--mlab-midnight)', fontFamily: 'var(--font-heading)', textTransform: 'uppercase' }}>Attendance Captured</h3>
//                             <p style={{ color: 'var(--mlab-grey)', marginBottom: '2rem' }}>The session matrix and raw file payload have been securely stored.</p>
//                             <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
//                                 <button className="wm-btn wm-btn--ghost" onClick={onClose}>Close Window</button>
//                                 <button className="wm-btn wm-btn--primary" onClick={() => { setStep('upload'); setRecords([]); }}>Log Another Session</button>
//                             </div>
//                         </div>
//                     ) : (
//                         <>
//                             <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--mlab-border)' }}>
//                                 <div>
//                                     <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--mlab-grey)' }}>Upload participant CSVs to calculate precise compliance.</p>
//                                 </div>

//                                 <div style={{ display: 'flex', gap: '1rem', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                         <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Session Date</label>
//                                         <input type="date" value={sessionDate} onChange={e => setSessionDate(e.target.value)} disabled={step !== 'upload'} className="lfm-input" style={{ padding: '6px', height: 'auto', fontSize: '0.85rem', width: '140px' }} />
//                                     </div>
//                                     <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
//                                         <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Expected Minutes</label>
//                                         <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                             <Timer size={14} color="#0ea5e9" />
//                                             <input type="number" min="1" max="480" value={expectedDuration} onChange={e => handleDurationChange(parseInt(e.target.value) || 120)} disabled={step !== 'upload' && step !== 'review'} className="lfm-input" style={{ padding: '6px', height: 'auto', fontSize: '0.85rem', width: '90px' }} />
//                                         </div>
//                                     </div>
//                                 </div>
//                             </div>

//                             {step === 'upload' && (
//                                 <div style={{ textAlign: 'center', padding: '1rem' }}>
//                                     <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
//                                     <div
//                                         onClick={() => fileInputRef.current?.click()}
//                                         style={{ border: '2px dashed #0ea5e9', borderRadius: '12px', padding: '4rem 2rem', cursor: 'pointer', background: '#f0f9ff', transition: 'all 0.2s ease', maxWidth: '600px', margin: '0 auto' }}
//                                     >
//                                         <UploadCloud size={48} color="#0ea5e9" style={{ margin: '0 auto 1rem' }} />
//                                         <h4 style={{ color: '#0369a1', fontWeight: 700, margin: '0 0 8px', fontSize: '1.1rem' }}>Drop Zoom Report Here</h4>
//                                         <span style={{ fontSize: '0.85rem', color: '#0284c7' }}>The system will permanently retain the file data so you never have to re-upload.</span>
//                                     </div>

//                                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '2rem', color: 'var(--mlab-grey)', fontSize: '0.8rem' }}>
//                                         <Info size={14} /> <span>Ghost Login Defense Active: Requires 80% duration for a 'Present' flag.</span>
//                                     </div>
//                                 </div>
//                             )}

//                             {step === 'saving' && (
//                                 <div style={{ textAlign: "center", padding: "4rem 0" }}>
//                                     <Loader2 className="spin" size={48} color="#0ea5e9" style={{ margin: '0 auto 1rem' }} />
//                                     <h3 style={{ color: '#0f172a', fontWeight: 700 }}>Saving Records to Database...</h3>
//                                 </div>
//                             )}

//                             {step === 'review' && (
//                                 <div className="animate-fade-in">
//                                     <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
//                                         <div style={{ display: 'flex', gap: '1rem' }}>
//                                             <span style={{ padding: '4px 10px', background: '#dcfce7', color: '#166534', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{records.filter(r => r.status === 'Present').length} Present</span>
//                                             <span style={{ padding: '4px 10px', background: '#fef3c7', color: '#b45309', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{records.filter(r => r.status === 'Partial').length} Short Hours</span>
//                                             <span style={{ padding: '4px 10px', background: '#fee2e2', color: '#991b1b', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>{records.filter(r => r.status === 'Absent').length} Absent</span>
//                                         </div>
//                                         <div style={{ display: 'flex', gap: '10px' }}>
//                                             <button className="wm-btn wm-btn--ghost" onClick={() => { setStep('upload'); setRecords([]); }}>Go Back</button>
//                                             <button className="wm-btn wm-btn--primary" onClick={handleSave} style={{ background: 'var(--mlab-green)', borderColor: 'var(--mlab-green)' }}><Save size={14} /> Commit to Ledger</button>
//                                         </div>
//                                     </div>

//                                     <div className="mlab-table-wrap">
//                                         <table className="mlab-table">
//                                             <thead>
//                                                 <tr>
//                                                     <th>Learner</th>
//                                                     <th>Zoom Identity Match</th>
//                                                     <th>Duration Logged</th>
//                                                     <th>Calculated Status</th>
//                                                 </tr>
//                                             </thead>
//                                             <tbody>
//                                                 {records.map((rec, i) => (
//                                                     <tr key={i}>
//                                                         <td style={{ fontWeight: 600, color: 'var(--mlab-midnight)' }}>{rec.fullName}</td>
//                                                         <td>
//                                                             {rec.isMatched ? <span style={{ color: '#16a34a', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><CheckCircle2 size={12} /> Sync Successful</span> : <span style={{ color: '#94a3b8', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={12} /> Not Found in CSV</span>}
//                                                         </td>
//                                                         <td>
//                                                             <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
//                                                                 <span style={{ fontSize: '0.85rem', fontWeight: 700, color: rec.zoomDuration > 0 ? 'var(--mlab-blue)' : '#94a3b8' }}>{rec.zoomDuration} mins</span>
//                                                                 <span style={{ fontSize: '0.7rem', color: '#64748b' }}>({rec.compliancePct}%)</span>
//                                                             </div>
//                                                         </td>
//                                                         <td>
//                                                             <span style={{
//                                                                 padding: '4px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
//                                                                 background: rec.status === 'Present' ? '#dcfce7' : rec.status === 'Partial' ? '#fef3c7' : '#fee2e2',
//                                                                 color: rec.status === 'Present' ? '#166534' : rec.status === 'Partial' ? '#b45309' : '#991b1b'
//                                                             }}>
//                                                                 {rec.status === 'Partial' ? 'Short Hours' : rec.status}
//                                                             </span>
//                                                         </td>
//                                                     </tr>
//                                                 ))}
//                                             </tbody>
//                                         </table>
//                                     </div>
//                                 </div>
//                             )}
//                         </>
//                     )}
//                 </div>
//             </div>
//         </div>,
//         document.body
//     );
// };