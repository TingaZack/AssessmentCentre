// src/components/admin/LearnerImportModal.tsx

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import {
    UploadCloud, X, Loader2, CheckCircle2, BookOpen,
    FileSpreadsheet, Terminal, Info, Layers, AlertTriangle, DatabaseZap, PlusCircle, AlertCircle
} from "lucide-react";
import { writeBatch, doc, getDocs, collection, query, where } from "firebase/firestore";
import { useStore } from "../../store/useStore";
import type { DashboardLearner, LearnerDemographics } from "../../types";
import { db } from "../../lib/firebase";
import { generateSorId } from "../../pages/utils/validation";

import '../views/LearnersView/LearnersView.css';

interface LearnerImportModalProps {
    cohortId?: string;
    onClose: () => void;
    onSuccess: () => void;
}

interface ImportConflict {
    row: number;
    idNumber: string;
    fullName: string;
    reason: string;
    existingCohortId: string;
    learnerData: DashboardLearner;
}

interface RowError {
    row: number;
    fullName: string;
    idNumber: string;
    reason: string;
}

export const LearnerImportModal: React.FC<LearnerImportModalProps> = ({
    cohortId,
    onClose,
    onSuccess,
}) => {
    const { cohorts, fetchStagingLearners, fetchLearners } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [step, setStep] = useState<"upload" | "processing" | "conflict_resolution" | "complete">("upload");
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [selectedCohortId, setSelectedCohortId] = useState<string>(cohortId || "");
    const [pipelineMode, setPipelineMode] = useState<'standard' | 'bootcamp' | null>(null);

    const [conflicts, setConflicts] = useState<ImportConflict[]>([]);
    const [rowErrors, setRowErrors] = useState<RowError[]>([]);
    const [parsedValidMap, setParsedValidMap] = useState<Map<string, DashboardLearner>>(new Map());

    const [errorCount, setErrorCount] = useState(0);
    const [successCount, setSuccessCount] = useState(0);

    const addToLog = (msg: string) => setDebugLog((prev) => [...prev, msg]);

    const EXPECTED_COLUMNS = [
        "National Id (*)", "Learner First Name", "Learner Last Name",
        "Qualification Title", "Statement of Results Issue Date", "FLC Statement of result number"
    ];

    useEffect(() => {
        if (selectedCohortId) {
            const selectedCohort = cohorts.find(c => c.id === selectedCohortId);
            if (selectedCohort && (selectedCohort as any).type === 'bootcamp') setPipelineMode('bootcamp');
            else if (selectedCohort && (selectedCohort as any).type === 'standard') setPipelineMode('standard');
            else setPipelineMode(null);
        } else {
            setPipelineMode(null);
        }
    }, [selectedCohortId, cohorts]);

    const parseQCTODate = (val: any): string => {
        const str = String(val || "").trim();
        if (!str) return "";
        if (str.length === 8 && !str.includes("-") && !str.includes("/")) {
            return `${str.substring(6, 8)}-${str.substring(4, 6)}-${str.substring(0, 4)}`;
        }
        if (str.includes("-") && str.split("-")[0].length === 4) {
            const [y, m, d] = str.split("-");
            return `${d}-${m}-${y}`;
        }
        if (str.includes("/")) {
            const parts = str.split("/");
            if (parts[2].length === 4) return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
        }
        return str;
    };

    const getTodaySA = (): string => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    };

    const cleanObject = (obj: any) => JSON.parse(JSON.stringify(obj));

    const mapProvinceFuzzy = (rawStr: string): string => {
        if (!rawStr) return "Not specified";
        const cleanInput = rawStr.toLowerCase().replace(/[^a-z]/g, "");

        const provinceAliases = [
            { name: "KwaZulu-Natal", aliases: ["kzn", "kwazulu", "natal"] },
            { name: "Limpopo", aliases: ["lp", "limp", "limpopo", "lmpp"] },
            { name: "Gauteng", aliases: ["gp", "gauteng", "gtg", "jhb", "pta"] },
            { name: "Western Cape", aliases: ["wc", "westerncape", "cape town", "cpt"] },
            { name: "Mpumalanga", aliases: ["mp", "mpumalanga", "mpu"] },
            { name: "North West", aliases: ["nw", "northwest"] },
            { name: "Free State", aliases: ["fs", "freestate"] },
            { name: "Northern Cape", aliases: ["nc", "northerncape"] },
            { name: "Eastern Cape", aliases: ["ec", "easterncape"] }
        ];

        for (const prov of provinceAliases) {
            for (const alias of prov.aliases) {
                if (cleanInput.includes(alias.replace(/[^a-z]/g, ""))) {
                    return prov.name;
                }
            }
        }
        return rawStr.trim();
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const droppedFile = e.dataTransfer.files[0];
            const validTypes = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"];
            if (!validTypes.includes(droppedFile.type) && !droppedFile.name.match(/\.(csv|xlsx|xls)$/i)) {
                alert("Invalid file type. Please drop a .csv or .xlsx file.");
                return;
            }
            if (fileInputRef.current) {
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(droppedFile);
                fileInputRef.current.files = dataTransfer.files;
                fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
            }
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!pipelineMode) return;
        const file = e.target.files?.[0];
        if (!file) return;

        setStep("processing");
        setDebugLog([]);
        setErrorCount(0);
        setSuccessCount(0);
        setConflicts([]);
        setRowErrors([]);
        setParsedValidMap(new Map());

        addToLog(`Initializing Smart Data Pipeline: ${file.name}`);

        const existingIds = new Set<string>();
        const existingEmails = new Set<string>();
        const existingLearnersMap = new Map<string, any>();
        const stagingIds = new Set<string>();
        const validSaqaIds = new Set<string>();
        const validProgNames = new Set<string>();

        try {
            const learnersSnap = await getDocs(collection(db, "learners"));
            learnersSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.idNumber) {
                    const cleanId = String(data.idNumber).trim();
                    existingIds.add(cleanId);
                    existingLearnersMap.set(cleanId, data);
                }
                if (data.email) existingEmails.add(String(data.email).toLowerCase().trim());
            });
            const stagingSnap = await getDocs(collection(db, "staging_learners"));
            stagingSnap.forEach(docSnap => { if (docSnap.data().idNumber) stagingIds.add(String(docSnap.data().idNumber).trim()); });
            const progSnap = await getDocs(collection(db, "programmes"));
            progSnap.forEach(docSnap => {
                const data = docSnap.data();
                if (data.saqaId) validSaqaIds.add(String(data.saqaId).trim());
                if (data.name) validProgNames.add(String(data.name).toLowerCase().trim());
            });
        } catch (err) {
            addToLog(`❌ FATAL: Pipeline could not authenticate deep database lookups.`);
            setStep("upload");
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                let targetSheetName = workbook.SheetNames[0];
                let foundHeader = false;

                if (workbook.SheetNames.includes("Learner Enrolment and EISA")) targetSheetName = "Learner Enrolment and EISA";
                else {
                    for (const sheetName of workbook.SheetNames) {
                        const tempRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, blankrows: false }) as any[][];
                        for (let i = 0; i < Math.min(tempRows.length, 5); i++) {
                            const headers = (tempRows[i] || []).map((h: any) => String(h).toLowerCase().replace(/[\s_*-?()]/g, ''));
                            if (headers.includes("nationalid") || headers.includes("idnumber") || headers.includes("emailaddress") || headers.includes("email")) {
                                targetSheetName = sheetName; foundHeader = true; break;
                            }
                        }
                        if (foundHeader) break;
                    }
                }

                addToLog(` Ingesting from row schema: "${targetSheetName}"`);

                const rows = XLSX.utils.sheet_to_json(workbook.Sheets[targetSheetName], { defval: "", raw: true }) as any[];

                if (rows.length === 0) {
                    addToLog(`❌ Error: Document empty or has unreadable row schema.`);
                    setStep("upload");
                    return;
                }

                // 🔍 HEADER DIAGNOSTIC SCAN
                const sheetHeaders = Object.keys(rows[0] || {}).map(k => k.trim());
                addToLog(`🔍 Column Scan: Identified ${sheetHeaders.length} headers in sheet.`);

                const cleanHeaders = sheetHeaders.map(h => h.toLowerCase().replace(/[\s_*-?()]/g, ''));
                const hasIdCol = cleanHeaders.some(h => h.includes("nationalid") || h.includes("idnumber") || h.includes("identitynumber") || h.includes("learneralternateid") || h === "id");
                const hasNameCol = cleanHeaders.some(h => h.includes("firstname") || h.includes("lastname") || h.includes("fullname") || h.includes("name") || h.includes("surname"));

                if (!hasIdCol) {
                    addToLog(`⚠️ Header Warning: Missing explicit 'National ID' or 'ID Number' column header. System will fallback to fuzzy matching.`);
                }
                if (!hasNameCol) {
                    addToLog(`⚠️ Header Warning: Missing explicit 'First Name' or 'Full Name' column header. System will fallback to fuzzy matching.`);
                }

                const validLearnersMap = new Map<string, DashboardLearner>();
                const conflictLearnersList: ImportConflict[] = [];
                const rowErrorsList: RowError[] = [];
                const todaySA = getTodaySA();
                let hardErrors = 0;

                rows.forEach((row, index) => {
                    const excelRowNumber = index + 2;

                    const getVal = (possibleSubstrings: string[]) => {
                        for (const targetSub of possibleSubstrings) {
                            const cleanTarget = targetSub.toLowerCase().replace(/[\s_*-?()]/g, "");
                            const exactKey = Object.keys(row).find(k => k.toLowerCase().replace(/[\s_*-?()]/g, "").includes(cleanTarget));

                            if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null && String(row[exactKey]).trim() !== "") {
                                let cellVal = row[exactKey];

                                if (typeof cellVal === 'number') {
                                    cellVal = cellVal.toLocaleString('fullwide', { useGrouping: false });
                                } else if (typeof cellVal === 'string' && cellVal.toUpperCase().includes('E')) {
                                    const parsedNum = Number(cellVal);
                                    if (!isNaN(parsedNum)) {
                                        cellVal = parsedNum.toLocaleString('fullwide', { useGrouping: false });
                                    }
                                }
                                return String(cellVal).trim();
                            }
                        }
                        return "";
                    };

                    const rawIdNumber = getVal(["idnumber", "nationalid", "learneralternateid", "identitynumber", "id"]);
                    let idNumber = rawIdNumber.replace(/[^0-9]/g, "");
                    const firstName = getVal(["firstname", "learnerfirstname", "name", "first"]).trim();
                    const lastName = getVal(["lastname", "surname", "learnerlastname", "last"]).trim();
                    let fullName = getVal(["fullname", "learnerfullname"]).trim();
                    if (!fullName && firstName) fullName = `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");

                    const email = String(getVal(["emailaddress", "email", "learneremailaddress"]) || "").toLowerCase().trim();
                    let phone = getVal(["phonenumber", "phone", "cellphonenumber", "mobile", "learnercellphonenumber"]).replace(/[^0-9]/g, "");

                    if (idNumber && idNumber.length > 0 && idNumber.length < 13) {
                        idNumber = idNumber.padStart(13, '0');
                    }
                    if (phone && phone.length === 9) {
                        phone = "0" + phone;
                    }

                    // 🔍 DETAILED ROW-LEVEL REJECTION CHECKS
                    const rowFailures: string[] = [];

                    if (!rawIdNumber) {
                        rowFailures.push("Missing 'National ID / ID Number' value");
                    } else if (idNumber.length !== 13) {
                        rowFailures.push(`Invalid ID length ('${rawIdNumber}' has ${idNumber.length} digits, must be 13 digits)`);
                    }

                    if (!fullName) {
                        rowFailures.push("Missing 'Learner Name' (First Name / Last Name / Full Name columns empty)");
                    }

                    let saqaId = "";
                    let progName = "Bootcamp / Pre-selection";
                    let issueDateSA = "";
                    let sdpCode = "";

                    if (pipelineMode === 'standard') {
                        saqaId = getVal(["qualificationid", "saqaid"]);
                        progName = getVal(["qualificationtitle", "programmename", "qualificationname"]);
                        issueDateSA = parseQCTODate(getVal(["statementofresultsissuedate", "issuedate"]));
                        sdpCode = getVal(["sdpcode", "providercode"]);

                        const isSaqaMatch = saqaId !== "" && validSaqaIds.has(saqaId);
                        const isNameMatch = progName !== "" && validProgNames.has(progName.toLowerCase().trim());

                        if (!saqaId && !progName) {
                            rowFailures.push("Missing 'Qualification Title' / 'SAQA ID' column value");
                        } else if (!isSaqaMatch && !isNameMatch) {
                            rowFailures.push(`Unrecognized Qualification Title '${progName || saqaId}' (Not found in system blueprints)`);
                        }
                    }

                    // If row has structural errors, log and reject
                    if (rowFailures.length > 0) {
                        const errReason = rowFailures.join("; ");
                        addToLog(`❌ Row ${excelRowNumber}: Rejected — ${errReason}`);
                        rowErrorsList.push({
                            row: excelRowNumber,
                            fullName: fullName || "N/A",
                            idNumber: rawIdNumber || "N/A",
                            reason: errReason
                        });
                        hardErrors++;
                        return;
                    }

                    // CONFLICT CHECKING (Existing profiles / emails)
                    let isConflict = false;
                    let conflictReason = "";
                    let existingCohortId = "Unassigned";

                    if (existingIds.has(idNumber)) {
                        isConflict = true; conflictReason = "Profile exists in Live Matrix";
                        existingCohortId = existingLearnersMap.get(idNumber)?.cohortId || "Unassigned";
                    } else if (email && existingEmails.has(email)) {
                        isConflict = true; conflictReason = "Email already linked to another user";
                    } else if (pipelineMode === 'standard' && stagingIds.has(idNumber)) {
                        isConflict = true; conflictReason = "Profile already pending in Staging Area";
                    }

                    const rawLocationString = getVal(["nearesttoyou", "nearesttoyourresidence", "whichprovince", "provincecode", "province", "residentialaddress"]).trim();
                    const normalizedProvince = mapProvinceFuzzy(rawLocationString);

                    const activeCohortId = selectedCohortId || "Unassigned";
                    const generatedEnrollmentId = activeCohortId !== "Unassigned" ? `${activeCohortId}_${idNumber}` : "";

                    let extractedDOB = getVal(["learnerbirthdate", "dateofbirth", "dob", "age"]);
                    if (idNumber.length === 13 && (!extractedDOB || extractedDOB.length < 5)) {
                        const yy = idNumber.substring(0, 2);
                        const mm = idNumber.substring(2, 4);
                        const dd = idNumber.substring(4, 6);
                        const century = parseInt(yy) >= 0 && parseInt(yy) <= 30 ? "20" : "19";
                        extractedDOB = `${dd}-${mm}-${century}${yy}`;
                    } else {
                        extractedDOB = parseQCTODate(extractedDOB);
                    }

                    const bootcampProfileObj = pipelineMode === 'bootcamp' ? {
                        highestQualification: getVal(["tertiaryqualification", "highestlevel", "qualification"]),
                        hasProgrammingBackground: getVal(["backgroundinprogramming", "coding", "background"]),
                        githubProfileUrl: getVal(["github"]),
                        hasLaptopOrComputer: getVal(["laptop", "computer", "personalcomputer"]),
                        hasInternetConnection: getVal(["internet"]),
                        requiresSubsidyOrStipend: getVal(["subsidy", "stipend"]),
                        whyJoinTech: getVal(["whytech", "whydoyouwanttobeintech"]),
                        cvDocumentUrl: getVal(["cv", "uploadcv"])
                    } : null;

                    let rawGender = getVal(["gender", "gendercode"]).trim();
                    if (!rawGender) rawGender = "Unspecified";
                    else if (rawGender.toLowerCase().startsWith('m')) rawGender = "Male";
                    else if (rawGender.toLowerCase().startsWith('f')) rawGender = "Female";

                    const newLearner: any = {
                        id: idNumber,
                        learnerId: idNumber,
                        idNumber: idNumber,
                        enrollmentId: generatedEnrollmentId,
                        firstName,
                        lastName,
                        fullName,
                        email,
                        phone,
                        mobile: phone,
                        status: "active",
                        isDraft: pipelineMode === 'standard',
                        authStatus: "pending",
                        isArchived: false,
                        isBootcamp: pipelineMode === 'bootcamp',
                        nearestCodeTribe: rawLocationString,
                        province: normalizedProvince,
                        dateOfBirth: extractedDOB,
                        cohortId: activeCohortId,
                        trainingStartDate: "",
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                        createdBy: "bulk-import",

                        _geocoded: false,
                        geoData: null,

                        ...(bootcampProfileObj && { bootcampProfile: bootcampProfileObj }),

                        qualification: {
                            name: progName,
                            saqaId,
                            credits: 0,
                            totalNotionalHours: 0,
                            nqfLevel: 0,
                            dateAssessed: pipelineMode === 'standard' ? issueDateSA : ""
                        },
                        knowledgeModules: [],
                        practicalModules: [],
                        workExperienceModules: [],
                        eisaAdmission: false,
                        verificationCode: generateSorId(fullName || "Learner", pipelineMode === 'standard' ? issueDateSA : todaySA, sdpCode || "BOOTCAMP"),
                        issueDate: pipelineMode === 'standard' ? issueDateSA : "",
                        demographics: {
                            sdpCode: sdpCode || "",
                            genderCode: rawGender,
                            equityCode: getVal(["race", "ethnicity", "equitycode"]).trim() || "African",
                            disabilityStatusCode: getVal(["disabilities", "disability", "disabilitystatuscode"]).trim() || "No",
                            provinceCode: normalizedProvince,
                            province: normalizedProvince,
                            citizenResidentStatusCode: getVal(["citizen", "resident"]).trim() || "South African citizen",
                            homeLanguageCode: getVal(["languagecode", "language"]).trim() || "",
                            nationalityCode: getVal(["nationality"]).trim() || "",
                            socioeconomicStatusCode: getVal(["socioeconomic"]).trim() || "",
                            flc: getVal(["flc"]).trim() || "",
                            flcStatementOfResultNumber: getVal(["flcstatementofresultnumber"]).trim() || "",
                            statementOfResultsStatus: getVal(["statementofresultsstatus"]).trim() || "",
                            statementOfResultsIssueDate: pipelineMode === 'standard' ? issueDateSA : "",
                            learnerHomeAddress1: getVal(["address1", "residentialaddress", "homeaddress"]).trim(),
                            learnerPostalAddressPostCode: getVal(["postalcode", "zip"]).trim()
                        } as LearnerDemographics
                    };

                    if (isConflict) {
                        conflictLearnersList.push({ row: excelRowNumber, idNumber, fullName, reason: conflictReason, existingCohortId, learnerData: newLearner });
                    } else {
                        validLearnersMap.set(idNumber, newLearner);
                    }
                });

                setErrorCount(hardErrors);
                setRowErrors(rowErrorsList);
                setParsedValidMap(validLearnersMap);
                setConflicts(conflictLearnersList);

                if (conflictLearnersList.length > 0) setStep("conflict_resolution");
                else if (validLearnersMap.size > 0) { setSuccessCount(validLearnersMap.size); saveToDatabase(validLearnersMap); }
                else { addToLog(`Parse halt. No valid clean rows found. Rejected: ${hardErrors}.`); setStep("complete"); }

            } catch (err: any) { addToLog(`❌ SCHEMATIC UNRECOGNIZED: ${err.message}`); setStep("complete"); }
        };

        reader.onerror = () => { addToLog(`❌ ERROR: Buffer transmission failed.`); setStep("upload"); };
        reader.readAsArrayBuffer(file);
    };

    const handleResolveConflicts = (action: 'skip' | 'overwrite' | 'multi_enroll') => {
        setStep("processing");
        const finalMap = new Map(parsedValidMap);

        if (action === 'overwrite' || action === 'multi_enroll') {
            conflicts.forEach(c => {
                if (action === 'multi_enroll') c.learnerData.cohortId = c.existingCohortId;
                finalMap.set(c.idNumber, c.learnerData);
            });
            addToLog(`⚡ Processing ${conflicts.length} conflicting records as [${action.toUpperCase()}].`);
        } else {
            addToLog(` SKIPPING ${conflicts.length} conflicting records.`);
            setErrorCount(prev => prev + conflicts.length);
        }

        setSuccessCount(finalMap.size);
        if (finalMap.size > 0) saveToDatabase(finalMap);
        else { addToLog(` Import halt: No profiles left to import.`); setStep("complete"); }
    };

    // CHUNKED BATCHING & GHOST PURGE LOGIC
    const saveToDatabase = async (dataMap: Map<string, DashboardLearner>) => {
        const isBootcamp = pipelineMode === 'bootcamp';
        addToLog(` Syncing ${dataMap.size} documents to ${isBootcamp ? 'LIVE BOOTCAMP' : 'SERVER STAGING'}...`);

        try {
            const commitPromises: Promise<void>[] = [];
            let currentBatch = writeBatch(db);
            let operationCount = 0;

            const commitAndResetBatch = () => {
                if (operationCount > 0) {
                    commitPromises.push(currentBatch.commit());
                    currentBatch = writeBatch(db);
                    operationCount = 0;
                }
            };

            const trackOperation = () => {
                operationCount++;
                if (operationCount >= 450) {
                    commitAndResetBatch();
                }
            };

            // SURGICAL GHOST PURGE
            if (isBootcamp && selectedCohortId) {
                addToLog(`⏳ Scanning target directory for damaged index IDs...`);
                try {
                    const existingLearnersQ = query(collection(db, "learners"), where("cohortId", "==", selectedCohortId));
                    const snap = await getDocs(existingLearnersQ);

                    let purgeCount = 0;
                    snap.forEach(d => {
                        const recId = d.id;
                        if (recId.includes('E') || recId.includes('+') || recId.length < 13) {
                            currentBatch.delete(doc(db, "learners", recId));
                            trackOperation();

                            const badEnrollmentId = `${selectedCohortId}_${recId}`;
                            currentBatch.delete(doc(db, "enrollments", badEnrollmentId));
                            trackOperation();

                            purgeCount++;
                        }
                    });

                    if (purgeCount > 0) {
                        addToLog(`🧹 SURGICAL PURGE: Removed ${purgeCount} broken ghost profiles from cohort.`);
                    }
                } catch (e) {
                    addToLog(`⚠️ Warning: Could not execute pre-purge scan.`);
                }
            }

            // DATA INGESTION
            dataMap.forEach((learner) => {
                const cleanedLearner = cleanObject(learner);

                if (isBootcamp) {
                    currentBatch.set(doc(db, "learners", String(learner.id)), cleanedLearner, { merge: true });
                    trackOperation();

                    if (learner.enrollmentId) {
                        currentBatch.set(doc(db, "enrollments", String(learner.enrollmentId)), {
                            id: learner.enrollmentId,
                            learnerId: learner.id,
                            cohortId: selectedCohortId || "Unassigned",
                            status: "active",
                            createdAt: new Date().toISOString(),
                            isBootcamp: true
                        }, { merge: true });
                        trackOperation();
                    }

                    currentBatch.delete(doc(db, "staging_learners", String(learner.id)));
                    trackOperation();
                } else {
                    currentBatch.set(doc(db, "staging_learners", String(learner.id)), cleanedLearner, { merge: true });
                    trackOperation();
                }
            });

            commitAndResetBatch();

            addToLog(`⏳ Dispatching ${commitPromises.length} network packets to Google Cloud...`);

            await Promise.all(commitPromises);

            addToLog(`✅ COMPLETE: System successfully updated.`);
            setStep("complete");

            if (isBootcamp && fetchLearners) fetchLearners(true);
            if (fetchStagingLearners) fetchStagingLearners();

        } catch (error: any) {
            console.error("Batch Error:", error);
            addToLog(`❌ BATCH ERROR: ${error.message}`);
            setStep("complete");
        }
    };

    return createPortal(
        <div className="mlab-modal-overlay">
            <div className="mlab-modal animate-fade-in" style={{ width: '90%', maxWidth: '1000px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--mlab-bg)', padding: 0, overflow: 'hidden' }}>
                <div className="mlab-modal__header" style={{ flexShrink: 0, borderBottom: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem', background: 'white' }}>
                    <div className="mlab-modal__title-group">
                        <div style={{ background: '#e0f2fe', padding: '8px', borderRadius: '6px', color: '#0ea5e9' }}><FileSpreadsheet size={22} /></div>
                        <div style={{ marginLeft: '12px' }}>
                            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.04em', color: 'var(--mlab-blue)', textTransform: 'uppercase', margin: 0 }}>Data Pipeline Importer</h2>
                            <span style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', fontWeight: 600 }}>FUZZY HEADER CONFIGURATION LIVE</span>
                        </div>
                    </div>
                    <button className="mlab-modal__close" onClick={onClose} disabled={step === "processing"}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', flex: 1, minHeight: 0, overflowY: 'auto', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1 1 380px', maxWidth: '380px', background: 'white', borderRight: '1px solid var(--mlab-border)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <BookOpen size={16} /> 1. Target Cohort Assignment
                            </h3>
                            <select value={selectedCohortId} onChange={(e) => setSelectedCohortId(e.target.value)} className="lfm-input" style={{ margin: 0, padding: '10px', background: '#f8fafc', border: '1px solid #cbd5e1' }} disabled={step !== "upload"}>
                                <option value="">-- DRAFT DIRECTORY (Unassigned) --</option>
                                {cohorts.filter((c) => !c.isArchived).map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
                            </select>
                        </div>
                        <div>
                            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', color: 'var(--mlab-blue)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Layers size={16} /> 2. Core Ingestion Pathway
                            </h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', opacity: step !== "upload" ? 0.6 : 1, pointerEvents: step !== "upload" ? 'none' : 'auto' }}>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'standard' ? 'var(--mlab-blue)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'standard' ? '#f0f9ff' : 'white', transition: 'all 0.2s ease' }}>
                                    <input type="radio" checked={pipelineMode === 'standard'} onChange={() => setPipelineMode('standard')} style={{ marginTop: '2px', accentColor: 'var(--mlab-blue)' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-blue)' }}>Standard Programme Ingestion</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Enforces rigid SAQA blueprint cross-checks. Routes to Staging Area.</div>
                                    </div>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px', border: `2px solid ${pipelineMode === 'bootcamp' ? 'var(--mlab-green)' : 'var(--mlab-border)'}`, borderRadius: '8px', cursor: 'pointer', background: pipelineMode === 'bootcamp' ? '#f0fdf4' : 'white', transition: 'all 0.2s ease' }}>
                                    <input type="radio" checked={pipelineMode === 'bootcamp'} onChange={() => setPipelineMode('bootcamp')} style={{ marginTop: '2px', accentColor: 'var(--mlab-green)' }} />
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mlab-green-dark)' }}>Bootcamp / Pre-selection Funnel</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--mlab-grey)', marginTop: '4px', lineHeight: 1.3 }}>Bypasses staging logic. Injects profiles directly into active Bootcamp view.</div>
                                    </div>
                                </label>
                            </div>
                        </div>
                        <div style={{ marginTop: 'auto' }}>
                            {pipelineMode === 'standard' && (
                                <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', padding: '12px', borderRadius: '6px' }}>
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                        <Info size={16} color="#0ea5e9" style={{ flexShrink: 0 }} />
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#0369a1', lineHeight: 1.4 }}>Upload a spreadsheet (<b>.xlsx</b> or <b>.csv</b>). Automatically blocks duplicates and flags column errors.</p>
                                    </div>
                                </div>
                            )}
                            {pipelineMode === 'bootcamp' && (
                                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '6px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <Info size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.75rem', color: '#166534', lineHeight: 1.4 }}><strong>System Note:</strong> Fuzzy containment maps custom survey fields onto your database layout.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column', minWidth: '320px', background: step === 'conflict_resolution' ? '#fffbeb' : 'transparent', transition: 'background 0.3s ease' }}>
                        {step === "upload" && (
                            <div
                                onDragOver={pipelineMode ? handleDragOver : undefined} onDrop={pipelineMode ? handleDrop : undefined} onClick={() => pipelineMode && fileInputRef.current?.click()}
                                style={{
                                    border: `2px dashed ${pipelineMode ? '#cbd5e1' : '#f87171'}`, borderRadius: '12px', padding: '4rem 2rem', textAlign: 'center', backgroundColor: pipelineMode ? 'white' : '#fef2f2',
                                    cursor: pipelineMode ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <input type="file" accept=".csv, .xlsx, .xls" ref={fileInputRef} onChange={handleFileChange} style={{ display: "none" }} disabled={!pipelineMode} />
                                <UploadCloud size={56} color={pipelineMode ? "var(--mlab-blue)" : "var(--mlab-red)"} style={{ margin: '0 auto 1rem', opacity: 0.5 }} />
                                <h3 style={{ fontFamily: 'var(--font-heading)', color: pipelineMode ? 'var(--mlab-blue)' : 'var(--mlab-red)', margin: '0 0 8px', fontSize: '1.5rem' }}>{pipelineMode ? "Drag Spreadsheet Log Here" : "Action Required"}</h3>
                            </div>
                        )}

                        {step === "conflict_resolution" && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', border: '1px solid #fcd34d', borderRadius: '12px', background: 'white', overflow: 'hidden' }}>
                                <div style={{ background: '#fef3c7', padding: '1.25rem', borderBottom: '1px solid #fcd34d', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                    <AlertTriangle size={32} color="#d97706" style={{ flexShrink: 0 }} />
                                    <div><h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', color: '#b45309', fontSize: '1.25rem' }}>Identity Conflicts Detected</h3><p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#92400e' }}>The system flagged <strong>{conflicts.length} profiles</strong>.</p></div>
                                </div>
                                <div style={{ flex: 1, overflowY: 'auto', padding: '0', background: 'white' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                        <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: '#f8fafc' }}>
                                            <tr>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Row</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Name</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>ID Number</th>
                                                <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#64748b' }}>Current Cohort</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {conflicts.map((c, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                                                    <td style={{ padding: '10px 12px', color: '#64748b' }}>#{c.row}</td>
                                                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e293b' }}>{c.fullName}</td>
                                                    <td style={{ padding: '10px 12px', color: '#475569' }}>{c.idNumber}</td>
                                                    <td style={{ padding: '10px 12px', color: '#b45309', fontWeight: 600 }}>{cohorts.find(ch => ch.id === c.existingCohortId)?.name || 'Unassigned'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ background: '#f8fafc', padding: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                    <button onClick={() => handleResolveConflicts('skip')} className="wm-btn wm-btn--ghost">Skip</button>
                                    <button onClick={() => handleResolveConflicts('multi_enroll')} className="wm-btn wm-btn--primary" style={{ background: '#0ea5e9', borderColor: '#0ea5e9', display: 'flex', gap: '6px', alignItems: 'center' }}><PlusCircle size={14} /> Add Additional</button>
                                    <button onClick={() => handleResolveConflicts('overwrite')} className="wm-btn wm-btn--primary" style={{ background: '#d97706', borderColor: '#d97706', display: 'flex', gap: '6px', alignItems: 'center' }}><DatabaseZap size={14} /> Overwrite</button>
                                </div>
                            </div>
                        )}

                        {(step === "processing" || step === "complete") && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: '1rem', background: 'white', borderRadius: '8px', border: '1px solid var(--mlab-border)' }}>
                                    {step === "processing" ? <Loader2 className="spin" size={24} color="var(--mlab-blue)" /> : <CheckCircle2 size={24} color="var(--mlab-green)" />}
                                    <h4 style={{ fontFamily: 'var(--font-heading)', color: step === "processing" ? 'var(--mlab-blue)' : 'var(--mlab-green)', margin: 0, textTransform: 'uppercase' }}>{step === "processing" ? "Compiling Matrix Array..." : "Import Cycle Complete"}</h4>
                                </div>

                                {step === "complete" && (
                                    <>
                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                            <div style={{ flex: 1, padding: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#16a34a' }}>{successCount}</div><div style={{ fontSize: '0.8rem', color: '#15803d', fontWeight: 600 }}>Profiles Migrated</div></div>
                                            <div style={{ flex: 1, padding: '1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', textAlign: 'center' }}><div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#dc2626' }}>{errorCount}</div><div style={{ fontSize: '0.8rem', color: '#b91c1c', fontWeight: 600 }}>Rows Rejected / Blocked</div></div>
                                        </div>

                                        {/* 🚀 REJECTED ROWS BREAKDOWN TABLE */}
                                        {rowErrors.length > 0 && (
                                            <div style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '1rem', maxHeight: '180px', overflowY: 'auto' }}>
                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#991b1b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', fontFamily: 'var(--font-heading)' }}>
                                                    <AlertCircle size={14} color="#dc2626" /> Rejected Rows Breakdown ({rowErrors.length})
                                                </div>
                                                <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                    <thead>
                                                        <tr style={{ borderBottom: '1px solid #fda4af', color: '#991b1b' }}>
                                                            <th style={{ padding: '4px' }}>Row</th>
                                                            <th style={{ padding: '4px' }}>Name</th>
                                                            <th style={{ padding: '4px' }}>ID / Ref</th>
                                                            <th style={{ padding: '4px' }}>Error Issue</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {rowErrors.map((e, idx) => (
                                                            <tr key={idx} style={{ borderBottom: '1px solid #ffe4e6' }}>
                                                                <td style={{ padding: '4px', fontWeight: 'bold', color: '#991b1b' }}>#{e.row}</td>
                                                                <td style={{ padding: '4px', color: '#334155' }}>{e.fullName}</td>
                                                                <td style={{ padding: '4px', color: '#64748b' }}>{e.idNumber}</td>
                                                                <td style={{ padding: '4px', color: '#dc2626', fontWeight: 600 }}>{e.reason}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* TERMINAL OUTPUT */}
                                <div style={{ background: "#0f172a", color: "#a3e635", padding: "1rem", borderRadius: "8px", fontFamily: "monospace", fontSize: "0.8rem", flex: 1, minHeight: "200px", overflowY: "auto" }}>
                                    {debugLog.map((log, i) => (
                                        <div key={i} style={{ marginBottom: "4px", color: log.includes("❌") ? '#f87171' : log.includes("⚠️") ? '#facc15' : log.includes("✅") ? '#4ade80' : '#a3e635' }}>
                                            <span style={{ color: '#38bdf8', marginRight: '6px' }}>&gt;</span>{log}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>s
                </div>

                <div className="mlab-modal__footer" style={{ flexShrink: 0, background: 'white', borderTop: '1px solid var(--mlab-border)', padding: '1.25rem 1.5rem' }}>
                    {step === "upload" || step === "conflict_resolution" ? <button className="wm-btn wm-btn--ghost" onClick={onClose}>Cancel</button> : <button className="wm-btn wm-btn--primary" style={{ background: 'var(--mlab-green)', color: 'white' }} onClick={onSuccess}>Done</button>}
                </div>
            </div>
        </div>,
        document.body
    );
};