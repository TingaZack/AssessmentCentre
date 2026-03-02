import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { 
    Upload, FileSpreadsheet, X, Loader2, CheckCircle2, AlertTriangle, BookOpen, UploadCloud, FileText 
} from 'lucide-react';
import { 
    writeBatch, doc 
} from 'firebase/firestore';
// import './LearnerImportModal.css';
import { useStore } from '../../store/useStore';
import type { DashboardLearner, KnowledgeModule, PracticalModule, WorkExperienceModule } from '../../types';
import { db } from '../../lib/firebase';

interface LearnerImportModalProps {
    cohortId?: string; // Optional pre-selected cohort
    onClose: () => void;
    onSuccess: () => void;
}

export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({ cohortId, onClose, onSuccess }) => {
    // 🚀 Pull in global store data for the dropdowns
    const { cohorts, programmes } = useStore();
    
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<'upload' | 'processing' | 'complete'>('upload');
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [stats, setStats] = useState({ total: 0, skipped: 0 });
    
    // 🚀 State for the dropdown selection
    const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || '');

    const addToLog = (msg: string) => setDebugLog(prev => [...prev, msg]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setStep('processing');
        addToLog(`Reading file: ${file.name}...`);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (header) => header.trim(), 
            complete: async (results) => {
                const rawRows = results.data as any[];
                
                if (!rawRows || rawRows.length === 0) {
                    alert("File is empty or could not be read.");
                    setStep('upload');
                    return;
                }

                addToLog(`Parsed ${rawRows.length} rows. Analyzing data...`);

                const learnersMap = new Map<string, DashboardLearner>();
                let skipped = 0;

                rawRows.forEach((row, index) => {
                    const id = row['NationalId'] || row['ID_Number'] || row['idNumber'] || row['National_ID'];
                    
                    if (!id) {
                        skipped++;
                        if (skipped < 4) addToLog(`⚠️ Row ${index + 1}: Skipped (No ID found)`);
                        return; 
                    }

                    const safeId = String(id).trim();

                    // CREATE LEARNER SHELL
                    if (!learnersMap.has(safeId)) {
                        const newLearner: DashboardLearner = {
                            id: safeId, 
                            // 🚀 FIX: Add required relational placeholders for Staging
                            learnerId: safeId,
                            enrollmentId: safeId,

                            firstName: row['LearnerFirstName'] || 'Unknown',
                            lastName: row['LearnerLastName'] || 'Unknown',
                            fullName: `${row['LearnerFirstName']||''} ${row['LearnerLastName']||''}`.trim() || 'Unknown Learner',
                            
                            status: 'active', // Will be in staging initially
                            isDraft: true,     
                            authStatus: 'pending',
                            isArchived: false,

                            idNumber: safeId,
                            email: row['LearnerEmailAddress'] || '',
                            phone: row['LearnerCellPhoneNumber'] || '',
                            mobile: row['LearnerCellPhoneNumber'] || '',
                            dateOfBirth: row['LearnerBirthDate'] || '',
                            
                            cohortId: selectedCohortId || 'Unassigned',
                            
                            trainingStartDate: row['TrainingStartDate'] || new Date().toISOString().split('T')[0],
                            createdAt: new Date().toISOString(),
                            createdBy: 'admin-import',

                            qualification: {
                                name: row['Programme_Name'] || 'Unknown',
                                saqaId: row['SAQA_ID'] || '',
                                credits: parseInt(row['Total_Credits']) || 0,
                                totalNotionalHours: (parseInt(row['Total_Credits']) || 0) * 10,
                                nqfLevel: parseInt(row['NQF_Level']) || 0,
                                dateAssessed: ''
                            },
                            knowledgeModules: [],
                            practicalModules: [],
                            workExperienceModules: [],
                            eisaAdmission: false,
                            verificationCode: `SOR-${Math.floor(1000 + Math.random() * 9000)}`,
                            issueDate: null,
                        };
                        learnersMap.set(safeId, newLearner);
                    }
                    
                    // MODULE PARSING
                    const learner = learnersMap.get(safeId)!;
                    const modName = row['Module_Name'];
                    
                    if (modName) {
                         const baseMod = {
                            name: modName,
                            credits: parseInt(row['Module_Credits']) || 0,
                            notionalHours: (parseInt(row['Module_Credits']) || 0) * 10,
                            nqfLevel: parseInt(row['Module_NQF_Level']) || 0,
                        };
                        const type = (row['Module_Type'] || '').toLowerCase();
                        const result = row['Module_Result'] || '';
                        const date = row['Module_Date'] || '';

                        if (type.includes('knowledge')) {
                            learner.knowledgeModules?.push({
                                ...baseMod,
                                dateAssessed: date,
                                status: result === 'Competent' ? 'Competent' : 'Not Competent'
                            } as KnowledgeModule);
                        } 
                        else if (type.includes('practical')) {
                            learner.practicalModules?.push({
                                ...baseMod,
                                dateAssessed: date,
                                status: result === 'Pass' ? 'Pass' : 'Fail'
                            } as PracticalModule);
                        } 
                        else if (type.includes('work') || type.includes('experience')) {
                            learner.workExperienceModules?.push({
                                ...baseMod,
                                dateSignedOff: date,
                                status: result === 'Competent' ? 'Competent' : 'Not Competent'
                            } as WorkExperienceModule);
                        }
                    }
                });

                setStats({ total: learnersMap.size, skipped });
                addToLog(`Processed ${learnersMap.size} unique learners.`);
                
                if (learnersMap.size === 0) {
                    alert("No valid learners found. Please check your CSV headers.");
                    setStep('upload');
                    return;
                }

                // SAVE TO FIRESTORE STAGING
                await saveToStaging(learnersMap);
            },
            error: (err) => {
                alert(`CSV Parsing Error: ${err.message}`);
                setStep('upload');
            }
        });
    };

    const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
        addToLog(`Saving to 'staging_learners' collection...`);
        try {
            const batch = writeBatch(db);
            let count = 0;

            dataMap.forEach((learner) => {
                // Write to staging area
                const ref = doc(db, 'staging_learners', learner.id);
                batch.set(ref, learner);
                count++;
            });

            await batch.commit();
            addToLog(`✅ SUCCESS: ${count} records moved to Staging Area.`);
            setStep('complete');
            
            setTimeout(() => {
                onSuccess();
            }, 1500);

        } catch (error: any) {
            console.error(error);
            addToLog(`❌ DATABASE ERROR: ${error.message}`);
            alert("Error saving to database. Check console for details.");
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            if (fileInputRef.current) {
                 const dataTransfer = new DataTransfer();
                 dataTransfer.items.add(e.dataTransfer.files[0]);
                 fileInputRef.current.files = dataTransfer.files;
                 const event = new Event('change', { bubbles: true });
                 fileInputRef.current.dispatchEvent(event);
            }
        }
    };

    return (
        <div className="mlab-modal-overlay">
            <div className="mlab-modal mlab-modal--md">
                
                <div className="mlab-modal__header">
                    <div className="mlab-modal__title-group">
                        <UploadCloud size={20} className="mlab-modal__icon" />
                        <h2>Bulk Import Enrollments</h2>
                    </div>
                    <button className="mlab-modal__close" onClick={onClose} disabled={step === 'processing'}>
                        <X size={20} />
                    </button>
                </div>

                <div className="mlab-modal__body">
                    {step === 'upload' && (
                        <>
                            <div className="mlab-import-instructions" style={{ marginBottom: '1.5rem', fontSize: '0.85rem', color: '#64748b' }}>
                                <p>Upload a CSV file containing learner details. Ensure the headers match the required QCTO format.</p>
                                <a href="/templates/mlab_learner_import_template.csv" download style={{ color: 'var(--mlab-blue)', fontWeight: 600, textDecoration: 'none' }}>
                                    Download CSV Template
                                </a>
                            </div>

                            <div className="mlab-form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>
                                    <BookOpen size={14} /> Target Class / Cohort
                                </label>
                                <select 
                                    value={selectedCohortId} 
                                    onChange={(e) => setSelectedCohortId(e.target.value)} 
                                    className="mlab-input"
                                    style={{ borderColor: 'var(--mlab-blue)', backgroundColor: '#f0f9ff', padding: '0.65rem' }}
                                >
                                    <option value="">-- Add to Drafts / Unassigned --</option>
                                    {cohorts.filter(c => !c.isArchived).map(c => {
                                        const pId = c.qualificationId || c.programmeId;
                                        const pName = programmes.find(p => p.id === pId)?.name || 'Unknown Curriculum';
                                        return (
                                            <option key={c.id} value={c.id}>
                                                {c.name} ({pName})
                                            </option>
                                        );
                                    })}
                                </select>
                                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                                    Selected learners will be pushed to the Staging area. When approved, they will be formally linked to this class.
                                </p>
                            </div>

                            <div 
                                className="mlab-dropzone"
                                onDragOver={handleDragOver}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                style={{ 
                                    textAlign: 'center', padding: '2rem', border: '2px dashed #cbd5e1', 
                                    borderRadius: '8px', background: '#f8fafc', cursor: 'pointer', transition: 'all 0.2s' 
                                }}
                            >
                                <input 
                                    type="file" 
                                    accept=".csv" 
                                    ref={fileInputRef} 
                                    onChange={handleFileChange} 
                                    style={{ display: 'none' }} 
                                />
                                
                                <div className="mlab-dropzone__prompt">
                                    <UploadCloud size={40} color="#94a3b8" style={{ margin: '0 auto 1rem' }} />
                                    <p style={{ margin: 0, color: '#475569' }}><strong>Click to browse</strong> or drag and drop a CSV file here</p>
                                </div>
                            </div>
                        </>
                    )}

                    {step === 'processing' && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem', color: 'var(--mlab-blue)' }}>
                                <Loader2 className="spin" size={20} />
                                <span style={{ fontWeight: 600 }}>Processing Import...</span>
                            </div>
                            <div style={{
                                background: '#1e293b', color: '#10b981', 
                                padding: '1rem', borderRadius: '8px', 
                                fontFamily: 'monospace', fontSize: '0.8rem',
                                height: '200px', overflowY: 'auto'
                            }}>
                                {debugLog.map((log, i) => <div key={i} style={{ marginBottom: '4px' }}>{log}</div>)}
                            </div>
                        </div>
                    )}

                    {step === 'complete' && (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            <CheckCircle2 size={56} color="#10b981" style={{ margin: '0 auto 1.5rem' }} />
                            <h3 style={{ marginBottom: '0.5rem', color: '#1e293b' }}>Import Successful!</h3>
                            <p style={{ color: '#64748b' }}>
                                {stats.total} learners have been added to the <strong>Staging Area</strong> tab for final review and approval.
                            </p>
                        </div>
                    )}
                </div>

                <div className="mlab-modal__footer">
                    {step === 'upload' && (
                        <button className="mlab-btn mlab-btn--ghost" onClick={onClose}>
                            Cancel
                        </button>
                    )}
                    {step === 'complete' && (
                        <button className="mlab-btn mlab-btn--primary" onClick={onSuccess}>
                            Close & Refresh List
                        </button>
                    )}
                </div>

            </div>
        </div>
    );
};


// import React, { useState, useRef } from 'react';
// import Papa from 'papaparse';
// import { 
//     Upload, FileSpreadsheet, X, Loader2, CheckCircle2, AlertTriangle 
// } from 'lucide-react';
// import { 
//     writeBatch, doc 
// } from 'firebase/firestore';
// import { db } from '../../lib/firebase';
// import type { DashboardLearner, KnowledgeModule, PracticalModule, WorkExperienceModule } from '../../types';

// interface Props {
//     cohortId: string;
//     onClose: () => void;
//     onSuccess: () => void;
// }

// export const LearnerImportModal: React.FC<Props> = ({ cohortId, onClose, onSuccess }) => {
//     const fileInputRef = useRef<HTMLInputElement>(null);
//     const [step, setStep] = useState<'upload' | 'processing' | 'complete'>('upload');
//     const [debugLog, setDebugLog] = useState<string[]>([]);
//     const [stats, setStats] = useState({ total: 0, skipped: 0 });

//     const addToLog = (msg: string) => setDebugLog(prev => [...prev, msg]);

//     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
//         const file = e.target.files?.[0];
//         if (!file) return;

//         setStep('processing');
//         addToLog(`Reading file: ${file.name}...`);

//         Papa.parse(file, {
//             header: true,
//             skipEmptyLines: true,
//             // 🛠️ FIX: Trims whitespace from headers (e.g., " NationalId " -> "NationalId")
//             transformHeader: (header) => header.trim(), 
//             complete: async (results) => {
//                 const rawRows = results.data as any[];
                
//                 if (!rawRows || rawRows.length === 0) {
//                     alert("File is empty or could not be read.");
//                     setStep('upload');
//                     return;
//                 }

//                 addToLog(`Parsed ${rawRows.length} rows. Analyzing data...`);

//                 const learnersMap = new Map<string, DashboardLearner>();
//                 let skipped = 0;

//                 rawRows.forEach((row, index) => {
//                     // 1. FLEXIBLE ID CHECK: Look for common variations of ID column
//                     const id = row['NationalId'] || row['ID_Number'] || row['idNumber'] || row['National_ID'];
                    
//                     if (!id) {
//                         skipped++;
//                         // Only log first few errors to avoid spamming
//                         if (skipped < 4) addToLog(`⚠️ Row ${index + 1}: Skipped (No NationalId found)`);
//                         return; 
//                     }

//                     const safeId = String(id).trim();

//                     // 2. CREATE LEARNER SHELL (If not exists)
//                     if (!learnersMap.has(safeId)) {
//                         const newLearner: DashboardLearner = {
//                             id: safeId, // Use National ID as Doc ID
//                             firstName: row['LearnerFirstName'] || 'Unknown',
//                             lastName: row['LearnerLastName'] || 'Unknown',
//                             fullName: `${row['LearnerFirstName']||''} ${row['LearnerLastName']||''}`.trim() || 'Unknown Learner',
                            
//                             // 🟢 STAGING FLAGS (Crucial for Safe Staging)
//                             status: 'pending',
//                             isDraft: true,     
//                             authStatus: 'pending',
//                             isArchived: false,

//                             idNumber: safeId,
//                             email: row['LearnerEmailAddress'] || '',
//                             phone: row['LearnerCellPhoneNumber'] || '',
//                             mobile: row['LearnerCellPhoneNumber'] || '',
//                             dateOfBirth: row['LearnerBirthDate'] || '',
                            
//                             // Use 'Unassigned' if no cohort selected to prevent empty string issues
//                             cohortId: cohortId || 'Unassigned',
                            
//                             trainingStartDate: row['TrainingStartDate'] || new Date().toISOString(),
//                             createdAt: new Date().toISOString(),
//                             createdBy: 'admin-import',

//                             qualification: {
//                                 name: row['Programme_Name'] || 'Unknown',
//                                 saqaId: row['SAQA_ID'] || '',
//                                 credits: parseInt(row['Total_Credits']) || 0,
//                                 totalNotionalHours: (parseInt(row['Total_Credits']) || 0) * 10,
//                                 nqfLevel: parseInt(row['NQF_Level']) || 0,
//                                 dateAssessed: ''
//                             },
//                             knowledgeModules: [],
//                             practicalModules: [],
//                             workExperienceModules: [],
//                             eisaAdmission: false,
//                             verificationCode: `SOR-${Math.floor(1000 + Math.random() * 9000)}`,
//                             issueDate: null,
//                         };
//                         learnersMap.set(safeId, newLearner);
//                     }
                    
//                     // 3. MODULE PARSING
//                     const learner = learnersMap.get(safeId)!;
//                     const modName = row['Module_Name'];
                    
//                     if (modName) {
//                          const baseMod = {
//                             name: modName,
//                             credits: parseInt(row['Module_Credits']) || 0,
//                             notionalHours: (parseInt(row['Module_Credits']) || 0) * 10,
//                             nqfLevel: parseInt(row['Module_NQF_Level']) || 0,
//                         };
//                         const type = (row['Module_Type'] || '').toLowerCase();
//                         const result = row['Module_Result'] || '';
//                         const date = row['Module_Date'] || '';

//                         if (type.includes('knowledge')) {
//                             learner.knowledgeModules.push({
//                                 ...baseMod,
//                                 dateAssessed: date,
//                                 status: result === 'Competent' ? 'Competent' : 'Not Competent'
//                             } as KnowledgeModule);
//                         } 
//                         else if (type.includes('practical')) {
//                             learner.practicalModules.push({
//                                 ...baseMod,
//                                 dateAssessed: date,
//                                 status: result === 'Pass' ? 'Pass' : 'Fail'
//                             } as PracticalModule);
//                         } 
//                         else if (type.includes('work') || type.includes('experience')) {
//                             learner.workExperienceModules.push({
//                                 ...baseMod,
//                                 dateSignedOff: date,
//                                 status: result === 'Competent' ? 'Competent' : 'Not Competent'
//                             } as WorkExperienceModule);
//                         }
//                     }
//                 });

//                 setStats({ total: learnersMap.size, skipped });
//                 addToLog(`Processed ${learnersMap.size} unique learners.`);
                
//                 if (learnersMap.size === 0) {
//                     alert("No valid learners found. Please check your CSV headers.");
//                     setStep('upload');
//                     return;
//                 }

//                 // 4. SAVE TO FIRESTORE
//                 await saveToStaging(learnersMap);
//             },
//             error: (err) => {
//                 alert(`CSV Parsing Error: ${err.message}`);
//                 setStep('upload');
//             }
//         });
//     };

//     const saveToStaging = async (dataMap: Map<string, DashboardLearner>) => {
//         addToLog(`Saving to 'staging_learners' collection...`);
//         try {
//             const batch = writeBatch(db);
//             let count = 0;

//             dataMap.forEach((learner) => {
//                 // 🛡️ SAFE SAVE: We write to 'staging_learners', NOT 'learners'
//                 const ref = doc(db, 'staging_learners', learner.id);
//                 batch.set(ref, learner);
//                 count++;
//             });

//             await batch.commit();
//             addToLog(`✅ SUCCESS: ${count} records moved to Staging Area.`);
//             setStep('complete');
            
//             // Auto-trigger success after a short delay
//             setTimeout(() => {
//                 onSuccess();
//             }, 1500);

//         } catch (error: any) {
//             console.error(error);
//             addToLog(`❌ DATABASE ERROR: ${error.message}`);
//             alert("Error saving to database. Check console for details.");
//         }
//     };

//     return (
//         <div className="modal-overlay">
//             <div className="modal-content animate-scale-in" style={{maxWidth:'600px'}}>
//                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
//                     <h2>Import Data</h2>
//                     <button onClick={onClose}><X size={20}/></button>
//                 </div>

//                 {step === 'upload' && (
//                     <div style={{textAlign:'center', padding:'2rem', border:'2px dashed #cbd5e1', borderRadius:'12px', background:'#f8fafc'}}>
//                         <FileSpreadsheet size={48} color="#6366f1" style={{marginBottom:'1rem'}}/>
//                         <h3 style={{fontSize:'1.1rem', marginBottom:'0.5rem'}}>Upload QCTO CSV</h3>
//                         <p style={{marginBottom:'1.5rem', color:'#64748b', fontSize:'0.9rem'}}>
//                             This will upload learners to the <strong>Staging Area</strong>.<br/>
//                             Existing active records will NOT be overwritten until you approve them.
//                         </p>
//                         <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" style={{display:'none'}} />
//                         <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} style={{width:'100%', maxWidth:'200px'}}>
//                             <Upload size={18} style={{marginRight:8}}/> Select CSV File
//                         </button>
//                     </div>
//                 )}

//                 {step === 'processing' && (
//                     <div>
//                         <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'1rem'}}>
//                             <Loader2 className="spin" size={20} color="#6366f1"/>
//                             <span style={{fontWeight:500}}>Processing Import...</span>
//                         </div>
//                         <div style={{
//                             background:'#1e293b', color:'#10b981', 
//                             padding:'1rem', borderRadius:'8px', 
//                             fontFamily:'monospace', fontSize:'0.85rem',
//                             height:'200px', overflowY:'auto'
//                         }}>
//                             {debugLog.map((log, i) => <div key={i} style={{marginBottom:'4px'}}>{log}</div>)}
//                         </div>
//                     </div>
//                 )}

//                 {step === 'complete' && (
//                     <div style={{textAlign:'center', padding:'2rem'}}>
//                         <CheckCircle2 size={56} color="#10b981" style={{margin:'0 auto 1.5rem'}}/>
//                         <h3 style={{marginBottom:'0.5rem'}}>Import Successful!</h3>
//                         <p style={{color:'#64748b'}}>
//                             {stats.total} learners have been added to the <strong>Staging Area</strong> tab.
//                         </p>
//                     </div>
//                 )}
//             </div>
//         </div>
//     );
// };



// // import React, { useState, useRef } from 'react';
// // import Papa from 'papaparse';
// // import { 
// //     Upload, AlertTriangle, FileSpreadsheet, 
// //     X, Loader2, CheckCircle2 
// // } from 'lucide-react';
// // import { 
// //     collection, query, where, getDocs, 
// //     writeBatch, doc 
// // } from 'firebase/firestore';
// // import { db } from '../../lib/firebase';
// // import type { DashboardLearner } from '../../types';

// // interface Props {
// //     cohortId: string;
// //     onClose: () => void;
// //     onSuccess: () => void;
// // }

// // export const LearnerImportModal: React.FC<Props> = ({ cohortId, onClose, onSuccess }) => {
// //     const fileInputRef = useRef<HTMLInputElement>(null);
// //     const [step, setStep] = useState<'upload' | 'conflict' | 'processing' | 'complete'>('upload');
// //     const [pendingData, setPendingData] = useState<Map<string, DashboardLearner>>(new Map());
// //     const [conflictCount, setConflictCount] = useState(0);
// //     const [progress, setProgress] = useState(0);
// //     const [debugLog, setDebugLog] = useState<string[]>([]);

// //     const addToLog = (msg: string) => setDebugLog(prev => [...prev, msg]);

// //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// //         const file = e.target.files?.[0];
// //         if (!file) return;

// //         setStep('processing');
// //         addToLog(`File selected: ${file.name} (${file.size} bytes)`);

// //         Papa.parse(file, {
// //             header: true,
// //             skipEmptyLines: true,
// //             // ✨ MAGIC FIX: Trims spaces from headers to fix " NationalId" issues
// //             transformHeader: (header) => header.trim(), 
// //             complete: async (results) => {
// //                 const rawRows = results.data as any[];
                
// //                 addToLog(`Parsed ${rawRows.length} rows.`);
// //                 addToLog(`Headers found: ${results.meta.fields?.join(', ')}`);

// //                 if (!rawRows || rawRows.length === 0) {
// //                     alert("File appears empty or unreadable.");
// //                     setStep('upload');
// //                     return;
// //                 }

// //                 // Group rows by NationalId
// //                 const learnersMap = new Map<string, DashboardLearner>();
// //                 let skippedCount = 0;

// //                 rawRows.forEach((row, index) => {
// //                     // Try multiple common variations of ID column
// //                     const id = row['NationalId'] || row['ID_Number'] || row['idNumber'] || row['National_ID'];
                    
// //                     if (!id) {
// //                         skippedCount++;
// //                         if (index < 3) addToLog(`⚠️ Skipped Row ${index + 1}: No ID found. Row data: ${JSON.stringify(row)}`);
// //                         return; 
// //                     }

// //                     const safeId = String(id).trim();

// //                     if (!learnersMap.has(safeId)) {
// //                         // Create New Learner Draft
// //                         const newLearner: DashboardLearner = {
// //                             id: safeId,
// //                             firstName: row['LearnerFirstName'] || row['First_Name'] || 'Unknown',
// //                             lastName: row['LearnerLastName'] || row['Last_Name'] || 'Unknown',
// //                             fullName: `${row['LearnerFirstName']||''} ${row['LearnerLastName']||''}`.trim() || 'Unknown Learner',
                            
// //                             // 🟢 CRITICAL FLAGS
// //                             status: 'pending',
// //                             isDraft: true,
// //                             authStatus: 'pending',
// //                             isArchived: false,
// //                             dateOfBirth: row['LearnerBirthDate'] || '',

// //                             idNumber: safeId,
// //                             email: row['LearnerEmailAddress'] || row['Email'] || '',
// //                             phone: row['LearnerCellPhoneNumber'] || row['Phone'] || '',
// //                             mobile: row['LearnerCellPhoneNumber'] || '',
                            
// //                             cohortId: cohortId || 'Unassigned',
// //                             trainingStartDate: row['TrainingStartDate'] || new Date().toISOString(),
// //                             createdAt: new Date().toISOString(),
// //                             createdBy: 'admin-import',

// //                             qualification: {
// //                                 name: row['Programme_Name'] || 'Unknown',
// //                                 saqaId: row['SAQA_ID'] || '',
// //                                 credits: parseInt(row['Total_Credits']) || 0,
// //                                 totalNotionalHours: 0,
// //                                 nqfLevel: parseInt(row['NQF_Level']) || 0,
// //                                 dateAssessed: ''
// //                             },
// //                             knowledgeModules: [],
// //                             practicalModules: [],
// //                             workExperienceModules: [],
// //                             eisaAdmission: false,
// //                             verificationCode: '',
// //                             issueDate: null,
// //                         };
// //                         learnersMap.set(safeId, newLearner);
// //                     }
                    
// //                     // (Module parsing logic omitted for brevity in debug mode, but learner is created)
// //                 });

// //                 addToLog(`Successfully grouped ${learnersMap.size} unique learners.`);
// //                 addToLog(`Skipped ${skippedCount} rows due to missing ID.`);

// //                 if (learnersMap.size === 0) {
// //                     alert("No valid learners found! Check the 'NationalId' column header.");
// //                     setStep('upload');
// //                     return;
// //                 }

// //                 setPendingData(learnersMap);
// //                 saveToFirestore(learnersMap);
// //             },
// //             error: (err) => {
// //                 alert(`CSV Error: ${err.message}`);
// //                 setStep('upload');
// //             }
// //         });
// //     };

// //     const saveToFirestore = async (dataMap: Map<string, DashboardLearner>) => {
// //         addToLog(`Starting Database Save for ${dataMap.size} records...`);
// //         try {
// //             const batch = writeBatch(db);
// //             let count = 0;

// //             dataMap.forEach((learner) => {
// //                 // FORCE the ID to be the ID Number
// //                 const ref = doc(db, 'learners', learner.id); 
// //                 batch.set(ref, learner, { merge: true });
// //                 count++;
// //             });

// //             await batch.commit();
// //             addToLog(`✅ Successfully wrote ${count} records to Firestore.`);
            
// //             setTimeout(() => {
// //                 onSuccess();
// //             }, 1000);

// //         } catch (error: any) {
// //             console.error(error);
// //             addToLog(`❌ SAVE FAILED: ${error.message}`);
// //             alert("Database Error: " + error.message);
// //         }
// //     };

// //     return (
// //         <div className="modal-overlay">
// //             <div className="modal-content animate-scale-in" style={{maxWidth:'600px'}}>
// //                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
// //                     <h2>Import Debugger</h2>
// //                     <button onClick={onClose}><X size={20}/></button>
// //                 </div>

// //                 {step === 'upload' && (
// //                     <div style={{textAlign:'center', padding:'2rem', border:'2px dashed #ccc'}}>
// //                          <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" style={{display:'none'}} />
// //                         <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
// //                             <Upload size={18} style={{marginRight:8}}/> Select CSV File
// //                         </button>
// //                     </div>
// //                 )}

// //                 {step === 'processing' && (
// //                     <div>
// //                         <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'1rem'}}>
// //                             <Loader2 className="spin" size={20}/>
// //                             <span>Processing...</span>
// //                         </div>
// //                         <div style={{
// //                             background:'#1e293b', color:'#10b981', 
// //                             padding:'1rem', borderRadius:'8px', 
// //                             fontFamily:'monospace', fontSize:'0.85rem',
// //                             height:'200px', overflowY:'auto'
// //                         }}>
// //                             {debugLog.map((log, i) => <div key={i}>{log}</div>)}
// //                         </div>
// //                     </div>
// //                 )}
// //             </div>
// //         </div>
// //     );
// // };




// // // import React, { useState, useRef } from 'react';
// // // import Papa from 'papaparse';
// // // import { 
// // //     Upload, AlertTriangle, FileSpreadsheet, 
// // //     X, Loader2 
// // // } from 'lucide-react';
// // // import { 
// // //     collection, query, where, getDocs, 
// // //     writeBatch, doc 
// // // } from 'firebase/firestore';
// // // import { db } from '../../lib/firebase';
// // // import type { DashboardLearner, KnowledgeModule, PracticalModule, WorkExperienceModule } from '../../types';

// // // interface Props {
// // //     cohortId: string;
// // //     onClose: () => void;
// // //     onSuccess: () => void;
// // // }

// // // // Map the CSV Raw Data Headers exactly as they appear in your spreadsheet
// // // interface QCTOCsvRow {
// // //     NationalId: string;
// // //     LearnerFirstName: string;
// // //     LearnerLastName: string;
// // //     LearnerEmailAddress: string;
// // //     LearnerCellPhoneNumber: string;
// // //     LearnerPhoneNumber?: string; // Added optional distinct phone column
// // //     LearnerBirthDate: string;
// // //     TrainingStartDate: string;
    
// // //     // Qualification
// // //     Programme_Name: string;
// // //     SAQA_ID: string;
// // //     NQF_Level: string;
// // //     Total_Credits: string;
    
// // //     // Module Data
// // //     Module_Type?: string; 
// // //     Module_Name?: string;
// // //     Module_Credits?: string;
// // //     Module_NQF_Level?: string;
// // //     Module_Result?: string;
// // //     Module_Date?: string;
// // // }

// // // export const LearnerImportModal: React.FC<Props> = ({ cohortId, onClose, onSuccess }) => {
// // //     const fileInputRef = useRef<HTMLInputElement>(null);
// // //     const [step, setStep] = useState<'upload' | 'conflict' | 'processing'>('upload');
// // //     const [pendingData, setPendingData] = useState<Map<string, DashboardLearner>>(new Map());
// // //     const [conflictCount, setConflictCount] = useState(0);
// // //     const [progress, setProgress] = useState(0);

// // //     // ─── 1. PARSE & GROUP DATA ───
// // //     const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
// // //         const file = e.target.files?.[0];
// // //         if (!file) return;

// // //         Papa.parse<QCTOCsvRow>(file, {
// // //             header: true,
// // //             skipEmptyLines: true,
// // //             complete: async (results) => {
// // //                 const rawRows = results.data;
// // //                 if (!rawRows || rawRows.length === 0) {
// // //                     alert("File is empty.");
// // //                     return;
// // //                 }

// // //                 // Group rows by ID Number (handling multiple rows per learner)
// // //                 const learnersMap = new Map<string, DashboardLearner>();

// // //                 rawRows.forEach(row => {
// // //                     const id = row.NationalId?.trim();
// // //                     if (!id) return; // Skip invalid rows

// // //                     // Create or Get existing learner object
// // //                     if (!learnersMap.has(id)) {
// // //                         learnersMap.set(id, {
// // //                             id: id, // Use ID Number as Doc ID
// // //                             firstName: row.LearnerFirstName?.trim() || '',
// // //                             lastName: row.LearnerLastName?.trim() || '',
// // //                             fullName: `${row.LearnerFirstName || ''} ${row.LearnerLastName || ''}`.trim(),
// // //                             idNumber: id,
// // //                             email: row.LearnerEmailAddress?.trim() || '',
// // //                             mobile: row.LearnerCellPhoneNumber?.trim(),
// // //                             // FIX: Added 'phone' to satisfy DashboardLearner interface
// // //                             phone: row.LearnerPhoneNumber?.trim() || row.LearnerCellPhoneNumber?.trim() || '', 
// // //                             dateOfBirth: row.LearnerBirthDate || '',
// // //                             trainingStartDate: row.TrainingStartDate || new Date().toISOString(),
// // //                             cohortId: cohortId || 'Unassigned',
                            
// // //                             // Defaults matching DashboardLearner Type
// // //                             status: 'active',
// // //                             authStatus: 'pending',
// // //                             isArchived: false,
// // //                             eisaAdmission: false,
// // //                             verificationCode: `SOR-${Math.floor(Math.random()*10000)}`,
// // //                             issueDate: null,
// // //                             createdAt: new Date().toISOString(),
// // //                             createdBy: 'admin-import',

// // //                             // Qualification (From CSV)
// // //                             qualification: {
// // //                                 name: row.Programme_Name || 'Unknown Qualification',
// // //                                 saqaId: row.SAQA_ID || '',
// // //                                 credits: parseInt(row.Total_Credits) || 0,
// // //                                 totalNotionalHours: (parseInt(row.Total_Credits) || 0) * 10,
// // //                                 nqfLevel: parseInt(row.NQF_Level) || 0
// // //                             },
                            
// // //                             // Arrays to be populated
// // //                             knowledgeModules: [],
// // //                             practicalModules: [],
// // //                             workExperienceModules: []
// // //                         });
// // //                     }

// // //                     // Add Module Data if present in this row
// // //                     const learner = learnersMap.get(id)!;
// // //                     if (row.Module_Name && row.Module_Type) {
// // //                         const modType = row.Module_Type.toLowerCase();
// // //                         const baseMod = {
// // //                             name: row.Module_Name,
// // //                             credits: parseInt(row.Module_Credits || '0'),
// // //                             notionalHours: (parseInt(row.Module_Credits || '0')) * 10,
// // //                             nqfLevel: parseInt(row.Module_NQF_Level || '0'),
// // //                         };

// // //                         if (modType.includes('knowledge')) {
// // //                             learner.knowledgeModules.push({
// // //                                 ...baseMod,
// // //                                 dateAssessed: row.Module_Date || '',
// // //                                 status: 'Not Competent' // Default, allows update later
// // //                             } as KnowledgeModule);
// // //                         } else if (modType.includes('practical')) {
// // //                             learner.practicalModules.push({
// // //                                 ...baseMod,
// // //                                 dateAssessed: row.Module_Date || '',
// // //                                 status: 'Fail'
// // //                             } as PracticalModule);
// // //                         } else {
// // //                             // Assumes Work Experience if not Knowledge/Practical
// // //                             learner.workExperienceModules.push({
// // //                                 ...baseMod,
// // //                                 dateSignedOff: row.Module_Date || '',
// // //                                 status: 'Not Competent'
// // //                             } as WorkExperienceModule);
// // //                         }
// // //                     }
// // //                 });

// // //                 setPendingData(learnersMap);
// // //                 checkForConflicts(learnersMap.size);
// // //             },
// // //             error: (err) => alert(`Error parsing CSV: ${err.message}`)
// // //         });
// // //     };

// // //     // ─── 2. CONFLICT CHECK ───
// // //     const checkForConflicts = async (importCount: number) => {
// // //         setStep('processing');
// // //         try {
// // //             if (cohortId) {
// // //                 // IMPORTANT: Ensure this collection name matches what you use elsewhere ('learners' or 'users')
// // //                 const q = query(collection(db, 'learners'), where('cohortId', '==', cohortId));
// // //                 const snap = await getDocs(q);
// // //                 if (!snap.empty) {
// // //                     setConflictCount(snap.size);
// // //                     setStep('conflict'); 
// // //                     return;
// // //                 }
// // //             }
// // //             saveData('append');
// // //         } catch (error) {
// // //             console.error(error);
// // //             setStep('upload');
// // //         }
// // //     };

// // //     // ─── 3. BATCH SAVE ───
// // //     const saveData = async (mode: 'append' | 'overwrite') => {
// // //         setStep('processing');
// // //         setProgress(10);

// // //         try {
// // //             const learnersArray = Array.from(pendingData.values());

// // //             // A. Overwrite Logic
// // //             if (mode === 'overwrite' && cohortId) {
// // //                 const q = query(collection(db, 'learners'), where('cohortId', '==', cohortId));
// // //                 const snap = await getDocs(q);
// // //                 const chunks = chunkArray(snap.docs, 400);
// // //                 for (const chunk of chunks) {
// // //                     const batch = writeBatch(db);
// // //                     chunk.forEach(d => batch.delete(d.ref));
// // //                     await batch.commit();
// // //                 }
// // //             }
// // //             setProgress(30);

// // //             // B. Write Logic
// // //             const chunks = chunkArray(learnersArray, 400);
// // //             let processed = 0;

// // //             for (const chunk of chunks) {
// // //                 const batch = writeBatch(db);
// // //                 chunk.forEach(l => {
// // //                     // Using 'learners' collection as decided earlier
// // //                     const ref = doc(db, 'learners', l.id); 
// // //                     batch.set(ref, l, { merge: true });
// // //                 });
// // //                 await batch.commit();
// // //                 processed += chunk.length;
// // //                 setProgress(30 + Math.round((processed / learnersArray.length) * 70));
// // //             }

// // //             setProgress(100);
// // //             setTimeout(onSuccess, 800);

// // //         } catch (error) {
// // //             console.error("Save failed:", error);
// // //             alert("Import failed. Check console.");
// // //             setStep('upload');
// // //         }
// // //     };

// // //     const chunkArray = (arr: any[], size: number) => {
// // //         const res = [];
// // //         for (let i=0; i<arr.length; i+=size) res.push(arr.slice(i, i+size));
// // //         return res;
// // //     };

// // //     return (
// // //         <div className="modal-overlay">
// // //             <div className="modal-content animate-scale-in">
// // //                 <div style={{display:'flex', justifyContent:'space-between', marginBottom:'1.5rem'}}>
// // //                     <h2 style={{margin:0}}>Import Learners</h2>
// // //                     {step !== 'processing' && <button onClick={onClose} style={{border:'none', background:'none'}}><X size={20}/></button>}
// // //                 </div>

// // //                 {step === 'upload' && (
// // //                     <div className="upload-zone">
// // //                         <div className="icon-circle"><FileSpreadsheet size={32} color="#6366f1"/></div>
// // //                         <h3>Upload QCTO Spreadsheet</h3>
// // //                         <p>Supports .csv files with standard headers.</p>
// // //                         <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" style={{display:'none'}} />
// // //                         <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
// // //                             <Upload size={18} style={{marginRight:8}}/> Select CSV
// // //                         </button>
// // //                     </div>
// // //                 )}

// // //                 {step === 'conflict' && (
// // //                     <div className="conflict-zone">
// // //                         <div className="warning-box" style={{display:'flex', gap:'1rem', background:'#fffbeb', padding:'1rem', borderRadius:'8px', border:'1px solid #fcd34d'}}>
// // //                             <AlertTriangle size={24} color="#b45309" />
// // //                             <div>
// // //                                 <h4 style={{margin:'0 0 0.5rem 0', color:'#92400e'}}>Existing Data Found</h4>
// // //                                 <p style={{margin:0, fontSize:'0.9rem', color:'#b45309'}}>
// // //                                     There are already <strong>{conflictCount}</strong> learners in this cohort.
// // //                                 </p>
// // //                             </div>
// // //                         </div>
// // //                         <div className="conflict-options" style={{marginTop:'1.5rem', display:'flex', flexDirection:'column', gap:'0.75rem'}}>
// // //                             <div className="conflict-card" onClick={() => saveData('append')}>
// // //                                 <div className="cc-text">
// // //                                     <strong>Append / Update</strong>
// // //                                     <span>Add new learners and update existing ones.</span>
// // //                                 </div>
// // //                             </div>
// // //                             <div className="conflict-card danger" onClick={() => saveData('overwrite')}>
// // //                                 <div className="cc-text">
// // //                                     <strong>Overwrite Cohort</strong>
// // //                                     <span>Delete ALL existing learners in this cohort and replace.</span>
// // //                                 </div>
// // //                             </div>
// // //                         </div>
// // //                     </div>
// // //                 )}

// // //                 {step === 'processing' && (
// // //                     <div className="processing-zone" style={{textAlign:'center', padding:'2rem'}}>
// // //                         <Loader2 size={48} className="spinner" color="#6366f1" />
// // //                         <p>Processing {pendingData.size} learners...</p>
// // //                         <div style={{width:'100%', height:'8px', background:'#e2e8f0', borderRadius:'4px', marginTop:'1rem'}}>
// // //                             <div style={{width:`${progress}%`, height:'100%', background:'#6366f1', borderRadius:'4px', transition:'width 0.3s'}} />
// // //                         </div>
// // //                     </div>
// // //                 )}
// // //             </div>
// // //         </div>
// // //     );
// // // };