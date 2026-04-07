// src/components/admin/LearnerFormModal.tsx

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
    X, Save, Loader2, AlertCircle, Users, BookOpen, Layers,
    FileText, Briefcase, ChevronDown, ChevronUp, RefreshCw,
    Plus, UploadCloud, MapPin, ShieldCheck, Globe, Search, FileSpreadsheet
} from "lucide-react";
import { collection, query, where, getDocs, doc, setDoc } from "firebase/firestore";
import Autocomplete from "react-google-autocomplete";
import * as XLSX from "xlsx";
import { ModuleEditor } from "../../common/ModuleEditor/ModuleEditor";
import { useStore } from "../../../store/useStore";
import type { DashboardLearner, LearnerDemographics, ModuleCategory, ProgrammeTemplate, Qualification, Cohort } from "../../../types";
import "./LearnerFormModal.css";
import { StatusModal, type StatusModalProps } from "../../common/StatusModal/StatusModal";
import { db } from "../../../lib/firebase";
import { CohortFormModal } from "../CohortFormModal/CohortFormModal";
import { generateSorId } from "../../../pages/utils/validation";

// GOOGLE SHEETS FETCH FUNCTION
import { fetchStatssaCodes } from "../../../services/qctoService";

interface LearnerFormModalProps {
    learner?: DashboardLearner | null;
    onClose: () => void;
    onSave: (learner: Partial<DashboardLearner>) => Promise<void>;
    title: string;
    programmes: ProgrammeTemplate[];
    cohorts: Cohort[];
    currentCohortId?: string;
}

const GLOBAL_SDP_CODE = import.meta.env.VITE_SDP_CODE || "SDP070824115131";

/* ── STRICT QCTO DICTIONARIES (DEFINED LOCALLY TO PREVENT TS(2304) ERRORS) ── */
const QCTO_EQUITY = [
    { label: "Black African", value: "BA" }, { label: "Coloured", value: "BC" },
    { label: "Indian / Asian", value: "BI" }, { label: "White", value: "Wh" },
    { label: "Other", value: "Oth" }, { label: "Unknown", value: "U" }
];
const QCTO_GENDER = [{ label: "Male", value: "M" }, { label: "Female", value: "F" }];
const QCTO_LANGUAGES = [
    { label: "English", value: "Eng" }, { label: "Afrikaans", value: "Afr" },
    { label: "isiZulu", value: "Zul" }, { label: "isiXhosa", value: "Xho" },
    { label: "sePedi", value: "Sep" }, { label: "seSotho", value: "Ses" },
    { label: "seTswana", value: "Set" }, { label: "siSwati", value: "Swa" },
    { label: "tshiVenda", value: "Tsh" }, { label: "xiTsonga", value: "Xit" },
    { label: "isiNdebele", value: "Nde" }, { label: "Sign Language", value: "SASL" },
    { label: "Other", value: "Oth" }
];
const QCTO_CITIZEN_STATUS = [
    { label: "South African Citizen", value: "SA" }, { label: "Permanent Resident", value: "PR" },
    { label: "Dual Citizenship", value: "D" }, { label: "Other", value: "O" }, { label: "Unknown", value: "U" }
];
const QCTO_NATIONALITY = [
    { label: "South Africa", value: "SA" }, { label: "SADC except SA", value: "SDC" },
    { label: "Zimbabwe", value: "ZIM" }, { label: "Namibia", value: "NAM" },
    { label: "Botswana", value: "BOT" }, { label: "Angola", value: "ANG" },
    { label: "Mozambique", value: "MOZ" }, { label: "Lesotho", value: "LES" },
    { label: "Swaziland", value: "SWA" }, { label: "Malawi", value: "MAL" },
    { label: "Zambia", value: "ZAM" }, { label: "Rest of Africa", value: "ROA" },
    { label: "European countries", value: "EUR" }, { label: "Asian countries", value: "AIS" },
    { label: "North American", value: "NOR" }, { label: "Central/South American", value: "SOU" },
    { label: "Unspecified", value: "U" }, { label: "N/A: Institution", value: "NOT" }
];
const QCTO_SOCIOECONOMIC = [
    { label: "Employed", value: "01" }, { label: "Unemployed, looking for work", value: "02" },
    { label: "Not working - not looking", value: "03" }, { label: "Home-maker", value: "04" },
    { label: "Scholar / Student", value: "06" }, { label: "Pensioner / Retired", value: "07" },
    { label: "Not working - disabled", value: "08" }, { label: "Not working - not wishing to work", value: "09" },
    { label: "Not elsewhere classified", value: "10" }, { label: "N/A Aged <15", value: "97" },
    { label: "N/A Institution", value: "98" }, { label: "Unspecified", value: "U" }
];
const QCTO_IMMIGRANT = [
    { label: "01 - Immigrant", value: "01" }, { label: "02 - Refugee", value: "02" }, { label: "03 - SA Citizen", value: "03" }
];
const QCTO_DISABILITY_STATUS = [
    { label: "None", value: "N" }, { label: "Sight", value: "01" },
    { label: "Hearing", value: "02" }, { label: "Communication", value: "03" },
    { label: "Physical", value: "04" }, { label: "Intellectual", value: "05" },
    { label: "Emotional", value: "06" }, { label: "Multiple", value: "07" },
    { label: "Disabled but Unspecified", value: "09" }
];
const QCTO_DISABILITY_RATING = [
    { label: "01 - No difficulty", value: "01" }, { label: "02 - Some difficulty", value: "02" },
    { label: "03 - A lot of difficulty", value: "03" }, { label: "04 - Cannot do at all", value: "04" },
    { label: "06 - Cannot yet be determined", value: "06" }, { label: "60 - Part of multiple difficulties", value: "60" },
    { label: "70 - May have difficulty", value: "70" }, { label: "80 - Former difficulty", value: "80" }
];
const QCTO_PROVINCES = [
    { label: "Western Cape", value: "1" }, { label: "Eastern Cape", value: "2" },
    { label: "Northern Cape", value: "3" }, { label: "Free State", value: "4" },
    { label: "KwaZulu-Natal", value: "5" }, { label: "North West", value: "6" },
    { label: "Gauteng", value: "7" }, { label: "Mpumalanga", value: "8" },
    { label: "Limpopo", value: "9" }, { label: "SA National", value: "N" }, { label: "Outside SA", value: "X" }
];
const QCTO_TITLES = [
    { label: "Mr", value: "Mr" }, { label: "Mrs", value: "Mrs" }, { label: "Ms", value: "Ms" },
    { label: "Miss", value: "Miss" }, { label: "Dr", value: "Dr" }, { label: "Prof", value: "Prof" }, { label: "Rev", value: "Rev" }
];
const QCTO_ALT_ID_TYPE = [
    { label: "533 - None", value: "533" }, { label: "527 - Passport Number", value: "527" },
    { label: "565 - Refugee Number", value: "565" }, { label: "538 - Work Permit Number", value: "538" },
    { label: "540 - Birth Certificate", value: "540" }
];

const getAreaCode = (postal: string) => {
    if (!postal) return "";
    const p = postal.trim();
    if (p.startsWith("00") || p.startsWith("01") || p.startsWith("02")) return "TSH";
    if (p.startsWith("14") || p.startsWith("15") || p.startsWith("16")) return "EKU";
    if (p.startsWith("20") || p.startsWith("21")) return "JHB";
    if (p.startsWith("40") || p.startsWith("41")) return "ETH";
    if (p.startsWith("7") || p.startsWith("80")) return "CPT";
    if (p.startsWith("93")) return "MAN";
    if (p.startsWith("83")) return "NC091";
    return "";
};

const emptyQualification: Qualification = { name: "", saqaId: "", credits: 0, totalNotionalHours: 0, nqfLevel: 0, dateAssessed: "" };

const emptyLearner = {
    fullName: "", firstName: "", lastName: "", idNumber: "", dateOfBirth: "", email: "", phone: "", mobile: "",
    cohortId: "Unassigned", campusId: "", trainingStartDate: "", trainingEndDate: "", isArchived: false,
    authStatus: "pending", status: "active", isOffline: false, qualification: { ...emptyQualification },
    knowledgeModules: [], practicalModules: [], workExperienceModules: [], eisaAdmission: false, nextEisaDate: "",
    verificationCode: "", issueDate: null, demographics: {
        sdpCode: GLOBAL_SDP_CODE, eisaReadinessId: "1", sorStatus: "02", flcStatus: "06",
        alternativeIdType: "533", popiActAgree: "Yes"
    } as LearnerDemographics,
    createdAt: "", createdBy: "",
};

const TAB_META: Record<ModuleCategory, { label: string; icon: React.ReactNode }> = {
    knowledge: { label: "Knowledge", icon: <Layers size={13} /> },
    practical: { label: "Practical", icon: <FileText size={13} /> },
    workExperience: { label: "Work Experience", icon: <Briefcase size={13} /> },
};

const parseLocalToSA = (dStr: string | null | undefined): string => {
    if (!dStr) return "";
    const str = String(dStr).trim();
    const parts = str.split("-");
    if (parts.length === 3 && parts[2].length === 4) return str;
    const d = new Date(str);
    if (isNaN(d.getTime())) return str;
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}-${month}-${d.getFullYear()}`;
};

const dateToHtml = (saDate: string | undefined): string => {
    if (!saDate) return "";
    const parts = saDate.split("-");
    if (parts.length === 3 && parts[2].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return saDate;
};

const htmlToDate = (isoDate: string): string => {
    if (!isoDate) return "";
    const parts = isoDate.split("-");
    if (parts.length === 3 && parts[0].length === 4) return `${parts[2]}-${parts[1]}-${parts[0]}`;
    return isoDate;
};

export const LearnerFormModal: React.FC<LearnerFormModalProps> = ({
    learner, onClose, onSave, title, programmes, cohorts, currentCohortId,
}) => {
    const { fetchCohorts, enrollLearnerInCohort, settings } = useStore();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState<DashboardLearner>(() => {
        if (learner) {
            const d = learner.demographics || {};
            return {
                ...learner,
                dateOfBirth: parseLocalToSA(learner.dateOfBirth),
                trainingStartDate: parseLocalToSA(learner.trainingStartDate),
                trainingEndDate: parseLocalToSA(learner.trainingEndDate || (d as any)?.expectedTrainingCompletionDate),
                nextEisaDate: parseLocalToSA(learner.nextEisaDate),
                issueDate: parseLocalToSA(learner.issueDate),
                campusId: learner.campusId || "",
                knowledgeModules: learner.knowledgeModules || [],
                practicalModules: learner.practicalModules || [],
                workExperienceModules: learner.workExperienceModules || [],
                qualification: {
                    ...(learner.qualification || emptyQualification),
                    dateAssessed: parseLocalToSA(learner.qualification?.dateAssessed),
                },
                demographics: {
                    ...d,
                    sdpCode: d.sdpCode || GLOBAL_SDP_CODE,
                    expectedTrainingCompletionDate: parseLocalToSA(d.expectedTrainingCompletionDate),
                    sorIssueDate: parseLocalToSA((d as any)?.sorIssueDate),
                    popiActDate: parseLocalToSA((d as any)?.popiActDate),
                    statssaAreaCode: d.statsaaAreaCode || (d as any)?.statsaaAreaCode || "",
                    flcStatementOfResultNumber: d.flcStatementOfResultNumber || (d as any).flcResultNumber || ""
                },
            } as DashboardLearner;
        }
        return { ...emptyLearner, id: "", cohortId: currentCohortId || "Unassigned" } as unknown as DashboardLearner;
    });

    const [activeTab, setActiveTab] = useState<ModuleCategory>("knowledge");
    const [showDemographics, setShowDemographics] = useState(!!learner?.demographics);
    const [isSaving, setIsSaving] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [selectedTemplateId, setSelectedTemplateId] = useState("");
    const [statusModal, setStatusModal] = useState<StatusModalProps | null>(null);
    const [showCohortModal, setShowCohortModal] = useState(false);

    // MULTI-SHEET EXCEL SUPPORT STATE
    const [sheetSelection, setSheetSelection] = useState<{ workbook: XLSX.WorkBook, sheetNames: string[] } | null>(null);

    const [isPostalSameAsHome, setIsPostalSameAsHome] = useState(() => {
        if (!learner) return true;
        const d = learner.demographics || {};
        if (d.learnerPostalAddress1 && d.learnerPostalAddress1 !== d.learnerHomeAddress1) {
            return false;
        }
        return true;
    });

    const [allStatssaCodes, setAllStatssaCodes] = useState<any[]>([]);
    const [areaSearch, setAreaSearch] = useState("");
    const [isSearchingArea, setIsSearchingArea] = useState(false);
    const [showAreaDropdown, setShowAreaDropdown] = useState(false);

    useEffect(() => {
        const loadCodes = async () => {
            setIsSearchingArea(true);
            const codes = await fetchStatssaCodes();
            setAllStatssaCodes(codes);
            setIsSearchingArea(false);

            const existingCode = formData.demographics?.statsaaAreaCode || (formData.demographics as any)?.statsaaAreaCode;
            if (existingCode) {
                const match = codes.find((c: any) => c.statssa_area_code === existingCode);
                if (match) {
                    setAreaSearch(`${match.statssa_area_code} (${match.town} - ${match.district_municipality} - ${match.area})`);
                } else {
                    setAreaSearch(existingCode);
                }
            }
        };
        loadCodes();
    }, []);

    const filteredStatssaCodes = useMemo(() => {
        if (!areaSearch) return allStatssaCodes.slice(0, 20);
        const term = areaSearch.toLowerCase();
        return allStatssaCodes.filter(c =>
            c.town.toLowerCase().includes(term) ||
            c.area.toLowerCase().includes(term) ||
            c.local_municipality.toLowerCase().includes(term) ||
            c.statssa_area_code.includes(term)
        ).slice(0, 20);
    }, [areaSearch, allStatssaCodes]);

    const handleStatssaSelect = (codeObj: any) => {
        updateDemographics("statssaAreaCode", codeObj.statssa_area_code);
        updateDemographics("statsaaAreaCode", codeObj.statssa_area_code);
        setAreaSearch(`${codeObj.statssa_area_code} (${codeObj.town} - ${codeObj.district_municipality} - ${codeObj.area})`);
        setShowAreaDropdown(false);
    };

    useEffect(() => {
        if (!learner && !formData.campusId && settings?.campuses) {
            const defaultCampus = settings.campuses.find(c => c.isDefault) || settings.campuses[0];
            if (defaultCampus) setFormData(prev => ({ ...prev, campusId: defaultCampus.id }));
        }
    }, [learner, settings, formData.campusId]);

    const updateField = (field: keyof DashboardLearner, value: any) =>
        setFormData((prev) => ({ ...prev, [field]: value }));

    const updateQualification = (field: keyof Qualification, value: string | number) => {
        setFormData((prev) => {
            const updatedQual = { ...prev.qualification, [field]: value };
            if (field === "credits") updatedQual.totalNotionalHours = (Number(value) || 0) * 10;
            return { ...prev, qualification: updatedQual };
        });
    };

    const updateDemographics = (field: string, value: string | undefined | number) =>
        setFormData((prev) => ({
            ...prev, demographics: { ...(prev.demographics || {}), [field]: value } as any,
        }));

    const handleHomeAddressChange = (field: string, value: string) => {
        setFormData((prev: any) => {
            const updatedDemos = { ...prev.demographics, [field]: value };

            if (field === 'learnerHomeAddressPostalCode') {
                const areaCode = getAreaCode(value) || updatedDemos.statssaAreaCode;
                updatedDemos.statssaAreaCode = areaCode;
                updatedDemos.statsaaAreaCode = areaCode;
            }

            if (isPostalSameAsHome) {
                if (field === 'learnerHomeAddress1') updatedDemos.learnerPostalAddress1 = value;
                if (field === 'learnerHomeAddress2') updatedDemos.learnerPostalAddress2 = value;
                if (field === 'learnerHomeAddress3') updatedDemos.learnerPostalAddress3 = value;
                if (field === 'learnerHomeAddressPostalCode') updatedDemos.learnerPostalAddressPostCode = value;
            }
            return { ...prev, demographics: updatedDemos };
        });
    };

    const handlePostalManualChange = (field: string, value: string) => {
        setIsPostalSameAsHome(false);
        updateDemographics(field, value);
    };

    const handleAddressSelected = (place: any) => {
        const components = place.address_components;
        if (!components) return;

        const getComp = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";
        const rawProv = getComp("administrative_area_level_1");
        const provinceMatch = QCTO_PROVINCES.find(p => rawProv.toLowerCase().includes(p.label.toLowerCase()));
        const postal = getComp("postal_code");
        const town = getComp("locality") || getComp("sublocality_level_1");

        const buildingName = place.name || "";
        const formatted = place.formatted_address || "";
        const streetLine = formatted.includes(buildingName) ? formatted : `${buildingName}, ${formatted}`;

        const match = allStatssaCodes.find(c => c.town.toLowerCase() === town.toLowerCase());
        if (match) {
            setFormData(prev => ({
                ...prev, demographics: { ...prev.demographics, statssaAreaCode: match.statssa_area_code, statsaaAreaCode: match.statssa_area_code }
            }));
            setAreaSearch(`${match.statssa_area_code} (${match.town} - ${match.district_municipality} - ${match.area})`);
        }

        let extractedLat = 0;
        let extractedLng = 0;
        if (place.geometry && place.geometry.location) {
            extractedLat = typeof place.geometry.location.lat === 'function' ? place.geometry.location.lat() : place.geometry.location.lat;
            extractedLng = typeof place.geometry.location.lng === 'function' ? place.geometry.location.lng() : place.geometry.location.lng;
        }

        setFormData((prev: any) => {
            const updatedDemos = {
                ...prev.demographics,
                learnerHomeAddress1: streetLine,
                learnerHomeAddress2: town,
                provinceCode: provinceMatch ? provinceMatch.value : prev.demographics?.provinceCode,
                learnerHomeAddressPostalCode: postal,
                lat: extractedLat, lng: extractedLng
            };

            if (isPostalSameAsHome) {
                updatedDemos.learnerPostalAddress1 = streetLine;
                updatedDemos.learnerPostalAddress2 = town;
                updatedDemos.learnerPostalAddressPostCode = postal;
            }

            return { ...prev, demographics: updatedDemos };
        });
    };

    // ── SMART MULTI-SHEET UPLOAD HANDLER ──
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });

                const sheetNames = workbook.SheetNames;

                // If only 1 sheet exists, just process it immediately
                if (sheetNames.length === 1) {
                    processSpecificSheet(workbook, sheetNames[0]);
                    return;
                }

                // If multiple sheets, try to auto-match using the learner's ID Number
                let matchedSheet = null;
                if (formData.idNumber) {
                    for (const sheetName of sheetNames) {
                        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" }) as any[][];
                        const idRow = rows.find(r => String(r[0]).toLowerCase().includes("id number"));

                        if (idRow && String(idRow[1]).trim() === formData.idNumber.trim()) {
                            matchedSheet = sheetName;
                            break;
                        }
                    }
                }

                // If a perfect match is found, import it immediately
                if (matchedSheet) {
                    processSpecificSheet(workbook, matchedSheet);
                } else {
                    // OPEN THE NEW UI POPUP TO LET USER CHOOSE WHICH SHEET TO USE
                    setSheetSelection({ workbook, sheetNames });
                }

            } catch (err: any) {
                console.error("Spreadsheet Parse Error:", err);
                setStatusModal({
                    type: "error",
                    title: "Import Failed",
                    message: "Could not parse the file. Please ensure it is a valid .csv or .xlsx file.",
                    onClose: () => setStatusModal(null)
                });
            }
        };

        reader.readAsArrayBuffer(file);
    };

    const processSpecificSheet = (workbook: XLSX.WorkBook, sheetName: string) => {
        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" }) as string[][];
        setSheetSelection(null); // Close the modal
        parseCSVRows(rows);
    };

    const parseCSVRows = (rows: string[][]) => {
        try {
            let fullName = "", qualName = "", nqfLevel = 0, saqaId = "", totalCredits = 0;
            let idNumber = "", emailAddress = "", phoneNumber = "", startDateStr = "", completionDateStr = "", issueDateStr = "";
            let importedCohortName = "", importedSdpCode = GLOBAL_SDP_CODE;
            const knowledgeModules: any[] = [], practicalModules: any[] = [], workExperienceModules: any[] = [];
            let currentSection = "K", isModuleSection = false;

            rows.forEach((cols) => {
                if (!cols || cols.length === 0 || (cols.length === 1 && cols[0] === "")) return;
                const col0 = String(cols[0] || "").trim();
                const col1 = String(cols[1] || "").trim();
                const col0Lower = col0.toLowerCase();

                if (!isModuleSection) {
                    if (col0Lower.includes("qualification title")) qualName = String(cols[1] || "").trim();
                    else if (col0Lower.includes("nqf level")) nqfLevel = parseInt(cols[1]) || 0;
                    else if (col0Lower.includes("saqa qual id")) saqaId = String(cols[1] || "").trim();
                    else if (col0Lower.includes("credits")) totalCredits = parseInt(cols[1]) || 0;
                    else if (col0Lower.includes("name") && (col0Lower.includes("learner") || col0Lower.includes("leaner"))) fullName = String(cols[1] || "").trim();
                    else if (col0Lower.includes("id number")) idNumber = String(cols[1] || "").trim();
                    else if (col0Lower.includes("email address")) emailAddress = String(cols[1] || "").trim();
                    else if (col0Lower.includes("phone number")) phoneNumber = String(cols[1] || "").trim();
                    else if (col0Lower.includes("start date")) startDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("completion date")) completionDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("issue date")) issueDateStr = parseLocalToSA(cols[1]);
                    else if (col0Lower.includes("cohort")) importedCohortName = String(cols[1] || "").trim();
                    else if (col0Lower.includes("sdp code") || col0Lower.includes("provider code")) importedSdpCode = String(cols[1] || "").trim() || GLOBAL_SDP_CODE;

                    if ((col0Lower === "modules" || col0Lower === "") && col1.toLowerCase() === "module name") {
                        isModuleSection = true; return;
                    }
                }

                if (isModuleSection) {
                    if (col0Lower.includes("knowledge") || col0Lower.includes("knowlege")) currentSection = "K";
                    else if (col0Lower.includes("practical") || col0Lower.includes("skills")) currentSection = "P";
                    else if (col0Lower.includes("work") || col0Lower.includes("experience")) currentSection = "W";

                    if (col1 && col1.toLowerCase() !== "module name") {
                        const modCode = String(cols[2] || "").trim();
                        // Catch-all normalizer for the inline dropdowns
                        let rawStatus = String(cols[8] || cols[7] || "").trim() || "Not Started";
                        const s = rawStatus.toLowerCase();
                        let status = "Not Started";
                        if (s === "competent" || s === "pass" || s === "c") status = "Competent";
                        else if (s === "not yet competent" || s === "not competent" || s === "fail" || s === "nyc") status = "Not Yet Competent";
                        else if (s && s !== "not started") status = "In Progress";

                        const mod = {
                            name: col1.replace(/\n|\r/g, " ").trim(), code: modCode, nqfLevel: parseInt(cols[3]) || nqfLevel || 5,
                            credits: parseInt(cols[4]) || 0, notionalHours: (parseInt(cols[4]) || 0) * 10, status: status,
                            dateAssessed: issueDateStr, dateSignedOff: issueDateStr, isTemplateLocked: false,
                        };

                        let targetSection = currentSection;
                        if (modCode.toUpperCase().startsWith("KM")) targetSection = "K";
                        else if (modCode.toUpperCase().startsWith("PM")) targetSection = "P";
                        else if (modCode.toUpperCase().startsWith("WM") || modCode.toUpperCase().startsWith("WE")) targetSection = "W";

                        if (targetSection === "K") knowledgeModules.push(mod);
                        else if (targetSection === "P") practicalModules.push(mod);
                        else workExperienceModules.push(mod);
                    }
                }
            });

            if (!idNumber) {
                setStatusModal({ type: "error", title: "Missing ID", message: "Failed: No ID Number found in the imported file.", onClose: () => setStatusModal(null) });
                if (fileInputRef.current) fileInputRef.current.value = "";
                return;
            }

            if (!issueDateStr) issueDateStr = parseLocalToSA(new Date().toISOString());

            const matchedCohort = importedCohortName ? cohorts.find(c => c.name.toLowerCase().trim() === importedCohortName.toLowerCase().trim()) : null;
            let matchedCampusId = "";
            let usedFallbackCampus = false;

            if (settings?.campuses) {
                const cMatch = settings.campuses.find(c => c.siteAccreditationNumber === importedSdpCode);
                if (cMatch) { matchedCampusId = cMatch.id; }
                else {
                    const defCampus = settings.campuses.find(c => c.isDefault);
                    if (defCampus) { matchedCampusId = defCampus.id; usedFallbackCampus = true; }
                }
            }

            setFormData((prev) => ({
                ...prev,
                fullName: fullName || prev.fullName, firstName: fullName ? fullName.split(' ')[0] : prev.firstName, lastName: fullName ? fullName.split(' ').slice(1).join(' ') : prev.lastName,
                idNumber: idNumber || prev.idNumber, email: emailAddress || prev.email, mobile: phoneNumber || prev.mobile,
                trainingStartDate: startDateStr || prev.trainingStartDate, trainingEndDate: completionDateStr || prev.trainingEndDate,
                cohortId: matchedCohort ? matchedCohort.id : prev.cohortId, campusId: matchedCampusId || prev.campusId, isOffline: true,
                qualification: { ...prev.qualification, name: qualName || prev.qualification.name, saqaId: saqaId || prev.qualification.saqaId, nqfLevel: nqfLevel || prev.qualification.nqfLevel, credits: totalCredits || prev.qualification.credits, totalNotionalHours: (totalCredits || 0) * 10, dateAssessed: issueDateStr },
                demographics: { ...(prev.demographics || {}), sdpCode: importedSdpCode, expectedTrainingCompletionDate: completionDateStr || prev.demographics?.expectedTrainingCompletionDate || "" },
                knowledgeModules, practicalModules, workExperienceModules,
                verificationCode: generateSorId(fullName || "Unknown", issueDateStr, importedSdpCode), issueDate: issueDateStr,
            }));

            let successMessage = `Successfully populated details for ${fullName || "Learner"}. Review the fields below and click "Save Learner".`;
            if (usedFallbackCampus) successMessage += `\n\n⚠️ Note: The imported SDP Code (${importedSdpCode}) did not match any of your Accredited Sites in Settings. The learner was assigned to your Default Campus instead.`;

            setStatusModal({ type: "success", title: "Import Successful", message: successMessage, onClose: () => setStatusModal(null) });
            if (fileInputRef.current) fileInputRef.current.value = "";
        } catch (error) {
            console.error("CSV/Excel Parse Error:", error);
            setStatusModal({ type: "error", title: "Import Failed", message: "Could not map the data accurately. Please ensure it matches the standard layout.", onClose: () => setStatusModal(null) });
        }
    };

    const handleQuickCohortCreate = async (cohortData: Omit<Cohort, "id" | "createdAt" | "staffHistory" | "isArchived">, reasons?: { facilitator?: string; assessor?: string; moderator?: string }) => {
        try {
            const cohortRef = doc(collection(db, "cohorts"));
            const newId = cohortRef.id;
            const finalCohort = { ...cohortData, id: newId, createdAt: new Date().toISOString(), isArchived: false, staffHistory: [], status: "active", changeReasons: reasons || {} };

            await setDoc(cohortRef, finalCohort);
            await fetchCohorts();
            updateField("cohortId", newId);
            if (cohortData.campusId) updateField("campusId", cohortData.campusId);
            setShowCohortModal(false);

            setStatusModal({ type: "success", title: "Class Created", message: `New class "${cohortData.name}" created and assigned.`, onClose: () => setStatusModal(null) });
        } catch (err: any) {
            throw new Error(err.message || "Could not save the new class to the database.");
        }
    };

    const handleSyncCohortResults = async () => {
        if (!formData.cohortId || formData.cohortId === "Unassigned") {
            setStatusModal({ type: "warning", title: "No Cohort Selected", message: "Please assign the learner to a valid cohort first.", onClose: () => setStatusModal(null) });
            return;
        }

        const cohort = cohorts.find((c) => c.id === formData.cohortId);
        if (!cohort) return;

        const templateId = (cohort as any).programmeId || (cohort as any).qualificationId || selectedTemplateId;
        const template = programmes.find((p) => p.id === templateId);

        if (!template) {
            setStatusModal({ type: "warning", title: "No Curriculum Linked", message: `Cohort "${cohort.name}" does not have a linked Programme Template.`, onClose: () => setStatusModal(null) });
            return;
        }

        setIsSyncing(true);

        try {
            let submissions: any[] = [];
            if (formData.id) {
                const subRef = collection(db, "learner_submissions");
                const q = query(subRef, where("learnerId", "==", formData.learnerId || formData.id), where("cohortId", "==", cohort.id));
                const snap = await getDocs(q);
                submissions = snap.docs.map((d) => d.data());
            }

            const lockSystemModules = (modules: any[]) => {
                return (modules || []).map((m) => {
                    const sub = submissions.find((s) => s.moduleNumber === m.code || s.moduleNumber === m.name);
                    let status = "Not Started", dateAssessed = "";
                    if (sub) {
                        dateAssessed = sub.assignedAt ? parseLocalToSA(sub.assignedAt) : "";
                        status = sub.status === "graded" ? (sub.marks >= sub.totalMarks / 2 ? "Competent" : "Not Yet Competent") : "Pending Grading";
                    }
                    return { ...m, isSystemLocked: true, status, dateAssessed, dateSignedOff: dateAssessed, cohortName: cohort.name };
                }) as any[];
            };

            setFormData((prev) => ({
                ...prev,
                qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || "" },
                knowledgeModules: lockSystemModules(template.knowledgeModules), practicalModules: lockSystemModules(template.practicalModules), workExperienceModules: lockSystemModules(template.workExperienceModules),
            }));

            setStatusModal({ type: "success", title: "Sync Complete", message: `Pulled ${submissions.length} authentic assessment result(s).`, onClose: () => setStatusModal(null) });
        } catch (error) {
            setStatusModal({ type: "error", title: "Sync Failed", message: "Could not retrieve database results.", onClose: () => setStatusModal(null) });
        } finally {
            setIsSyncing(false);
        }
    };

    const handleLoadFromTemplate = () => {
        if (!selectedTemplateId) return;
        const template = programmes.find((p) => p.id === selectedTemplateId);
        if (!template) return;

        setStatusModal({
            type: "warning", title: "Load Offline Curriculum", message: `Load the "${template.name}" blueprint?`, confirmText: "Yes, Load It", onCancel: () => setStatusModal(null),
            onClose: () => {
                const lockModules = (modules: any[]) => (modules || []).map((m) => ({ ...m, isTemplateLocked: true, status: "Not Started", dateAssessed: "", dateSignedOff: "", cohortName: `Imported Blueprint: ${template.name}` })) as any[];
                setFormData((prev) => ({
                    ...prev,
                    qualification: { name: template.name, saqaId: template.saqaId, credits: template.credits, totalNotionalHours: template.totalNotionalHours, nqfLevel: template.nqfLevel, dateAssessed: prev.qualification.dateAssessed || "" },
                    knowledgeModules: [...(prev.knowledgeModules || []), ...lockModules(template.knowledgeModules)], practicalModules: [...(prev.practicalModules || []), ...lockModules(template.practicalModules)], workExperienceModules: [...(prev.workExperienceModules || []), ...lockModules(template.workExperienceModules)],
                }));
                setSelectedTemplateId(""); setStatusModal(null);
            },
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setErrorMessage(null);

        try {
            const finalIssueDate = formData.issueDate || parseLocalToSA(new Date().toISOString());
            let fName = formData.firstName, lName = formData.lastName;
            if (formData.fullName && (!fName || !lName)) {
                const parts = formData.fullName.trim().split(" ");
                fName = parts[0] || ""; lName = parts.slice(1).join(" ") || "";
            }

            let finalVerificationCode = formData.verificationCode;
            if (!finalVerificationCode || finalVerificationCode.startsWith("SOR-")) {
                const sdpCode = formData.demographics?.sdpCode || GLOBAL_SDP_CODE;
                finalVerificationCode = generateSorId(formData.fullName || "Unknown", finalIssueDate, sdpCode);
            }

            const updatedQual = { ...formData.qualification };
            if (!updatedQual.dateAssessed) updatedQual.dateAssessed = finalIssueDate;

            const savedLearner: any = {
                ...formData,
                firstName: fName,
                lastName: lName,
                authStatus: formData.authStatus || "pending",
                issueDate: finalIssueDate,
                verificationCode: finalVerificationCode,
                qualification: updatedQual,
                demographics: {
                    ...formData.demographics,
                    statsaaAreaCode: (formData.demographics as any)?.statssaAreaCode,
                    flcStatementOfResultNumber: formData.demographics?.flcStatementOfResultNumber || (formData.demographics as any)?.flcResultNumber || ""
                }
            };

            Object.keys(savedLearner).forEach((key) => { if (savedLearner[key] === undefined) delete savedLearner[key]; });
            await onSave(savedLearner as Partial<DashboardLearner>);

            if (formData.cohortId && formData.cohortId !== "Unassigned") {
                const cohort = cohorts.find((c) => c.id === formData.cohortId);
                const pId = cohort?.programmeId || cohort?.qualificationId;
                if (learner?.id && learner.cohortId !== formData.cohortId && pId) {
                    await enrollLearnerInCohort(learner.learnerId || learner.id, formData.cohortId, pId);
                }
            }
            onClose();
        } catch (err: any) {
            setErrorMessage(err.message || "Failed to save learner record.");
        } finally {
            setIsSaving(false);
        }
    };


    useEffect(() => {
        if (formData.idNumber && formData.idNumber.length >= 6 && !formData.dateOfBirth) {
            const yearStr = formData.idNumber.substring(0, 2), month = formData.idNumber.substring(2, 4), day = formData.idNumber.substring(4, 6);
            const currentYear = new Date().getFullYear() % 100;
            const fullYear = parseInt(yearStr, 10) > currentYear ? `19${yearStr}` : `20${yearStr}`;
            if (parseInt(month) > 0 && parseInt(month) <= 12 && parseInt(day) > 0 && parseInt(day) <= 31) {
                setFormData((prev) => ({ ...prev, dateOfBirth: `${day}-${month}-${fullYear}` }));
            }
        }
    }, [formData.idNumber]);

    const addModule = (type: ModuleCategory) => {
        const base = { code: "", name: "", credits: 0, notionalHours: 0, nqfLevel: formData.qualification.nqfLevel || 5, topics: [] };
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: [...(prev.knowledgeModules || []), { ...base, dateAssessed: "", status: "Not Started" } as any] }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: [...(prev.practicalModules || []), { ...base, dateAssessed: "", status: "Not Started" } as any] }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: [...(prev.workExperienceModules || []), { ...base, dateSignedOff: "", status: "Not Started" } as any] }));
    };

    const updateModule = (type: ModuleCategory, index: number, field: string, value: string | number) => {
        const patch = (list: any[]) => {
            const updated = [...list];
            updated[index] = field === "credits" ? { ...updated[index], credits: value, notionalHours: (Number(value) || 0) * 10 } : { ...updated[index], [field]: value };
            return updated;
        };
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: patch(prev.knowledgeModules) }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: patch(prev.practicalModules) }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: patch(prev.workExperienceModules) }));
    };

    const removeModule = (type: ModuleCategory, index: number) => {
        if (type === "knowledge") setFormData((prev) => ({ ...prev, knowledgeModules: prev.knowledgeModules.filter((_, i) => i !== index) }));
        else if (type === "practical") setFormData((prev) => ({ ...prev, practicalModules: prev.practicalModules.filter((_, i) => i !== index) }));
        else setFormData((prev) => ({ ...prev, workExperienceModules: prev.workExperienceModules.filter((_, i) => i !== index) }));
    };

    const currentModuleCount = (tab: ModuleCategory) => (formData[`${tab}Modules`] as any[])?.length || 0;

    // EISA Admission Rule
    const isEisaReadyAllowed = (formData.demographics as any)?.sorStatus === "01" && !!(formData.demographics as any)?.sorIssueDate;

    return (
        <>
            <div className="lfm-overlay" onClick={onClose}>
                <div className="lfm-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="lfm-header">
                        <h2 className="lfm-header__title"><Users size={16} /> {title}</h2>
                        <button className="lfm-close-btn" type="button" onClick={onClose} disabled={isSaving}><X size={20} /></button>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                        <div className="lfm-body">
                            {errorMessage && (
                                <div className="lfm-error-banner"><AlertCircle size={16} /><span>{errorMessage}</span></div>
                            )}

                            {/* ── Personal & Enrolment ── */}
                            <div>
                                <div className="lfm-section-hdr"><Users size={13} /> Personal &amp; Enrolment Details</div>
                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Full Name *</label>
                                        <input className="lfm-input" type="text" required value={formData.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>ID Number *</label>
                                        <input className="lfm-input" type="text" required value={formData.idNumber} onChange={(e) => updateField("idNumber", e.target.value)} />
                                    </div>

                                    {/* CLASS & CAMPUS */}
                                    <div className="lfm-fg">
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <label style={{ marginBottom: 0 }}>Assigned Cohort *</label>
                                            <button type="button" onClick={() => setShowCohortModal(true)} style={{ background: "none", border: "none", color: "#2563eb", fontSize: "0.75rem", fontWeight: "bold", cursor: "pointer", display: "flex", alignItems: "center", gap: "3px" }}>
                                                <Plus size={10} /> New Class
                                            </button>
                                        </div>
                                        <select className="lfm-input lfm-select" required value={formData.cohortId} onChange={(e) => updateField("cohortId", e.target.value)} style={{ marginTop: "4px" }}>
                                            <option value="Unassigned">-- Unassigned --</option>
                                            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.startDate})</option>)}
                                        </select>
                                    </div>
                                    <div className="lfm-fg">
                                        <label style={{ display: "flex", alignItems: "center", gap: "4px" }}><MapPin size={12} /> Delivery Site (Campus)</label>
                                        <select className="lfm-input lfm-select" value={formData.campusId || ""} onChange={(e) => updateField("campusId", e.target.value)} style={{ marginTop: "4px" }}>
                                            <option value="">-- Inherit from Class / Default --</option>
                                            {settings?.campuses?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="lfm-fg">
                                        <label>Email</label>
                                        <input className="lfm-input" type="email" value={formData.email} onChange={(e) => updateField("email", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Mobile</label>
                                        <input className="lfm-input" type="text" value={formData.mobile || ""} onChange={(e) => updateField("mobile", e.target.value)} />
                                    </div>

                                    <div className="lfm-fg">
                                        <label>Date of Birth</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.dateOfBirth)} onChange={(e) => updateField("dateOfBirth", htmlToDate(e.target.value))} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Training Start Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.trainingStartDate)} onChange={(e) => updateField("trainingStartDate", htmlToDate(e.target.value))} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Training End Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.trainingEndDate)} onChange={(e) => updateField("trainingEndDate", htmlToDate(e.target.value))} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>SDP Provider Code *</label>
                                        <input className="lfm-input" type="text" required value={formData.demographics?.sdpCode || ""} onChange={(e) => updateDemographics("sdpCode", e.target.value)} style={{ border: "1px solid #0ea5e9", backgroundColor: "#f0f9ff" }} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Authentic Sync & Offline RPL Capture ── */}
                            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                                <div>
                                    <h4 style={{ margin: "0 0 0.25rem 0", color: "#166534", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                                        <RefreshCw size={16} /> Authentic Cohort Synchronization
                                    </h4>
                                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#15803d" }}>
                                        Pull this learner's actual graded assessments directly from the system database. <strong>Results imported this way will be fully secured and read-only.</strong>
                                    </p>
                                </div>
                                <button type="button" className="lfm-btn" onClick={handleSyncCohortResults} disabled={isSyncing || formData.cohortId === "Unassigned"} style={{ background: "#16a34a", color: "white", border: "none", padding: "0.55rem 1rem", whiteSpace: "nowrap" }}>
                                    {isSyncing ? <Loader2 size={16} className="lfm-spin" /> : "Sync Database Results"}
                                </button>
                            </div>

                            <div>
                                <div className="lfm-section-hdr"><BookOpen size={13} /> Offline / RPL Curriculum Source</div>
                                <div style={{ background: "#f8fafc", border: "1px solid #cbd5e1", padding: "1rem", borderRadius: "8px", marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                                    <div style={{ borderRight: "1px solid #e2e8f0", paddingRight: "1rem" }}>
                                        <h4 style={{ margin: "0 0 0.5rem 0", color: "var(--mlab-blue)", fontSize: "0.85rem" }}>Load Blank Blueprint</h4>
                                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                                            <select className="lfm-input lfm-select" style={{ flex: 1, margin: 0 }} value={selectedTemplateId} onChange={(e) => setSelectedTemplateId(e.target.value)}>
                                                <option value="">-- Select Template --</option>
                                                {programmes.filter((p) => !p.isArchived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                            </select>
                                            <button type="button" className="lfm-btn lfm-btn--primary" disabled={!selectedTemplateId} onClick={handleLoadFromTemplate} style={{ padding: "0.55rem 1rem" }}>Load</button>
                                        </div>
                                    </div>
                                    <div style={{ paddingLeft: "0.5rem" }}>
                                        <h4 style={{ margin: "0 0 0.5rem 0", color: "#16a34a", fontSize: "0.85rem" }}>Import External Results (.CSV / .XLSX)</h4>
                                        <input type="file" accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" ref={fileInputRef} onChange={handleFileUpload} style={{ display: "none" }} />
                                        <button type="button" className="lfm-btn" onClick={() => fileInputRef.current?.click()} style={{ background: "#f0fdf4", border: "1px solid #16a34a", color: "#16a34a", width: "100%", display: "flex", justifyContent: "center" }}>
                                            <UploadCloud size={16} /> Upload SoR File
                                        </button>
                                    </div>
                                </div>

                                <div className="lfm-grid">
                                    <div className="lfm-fg lfm-fg--full">
                                        <label>Qualification Name *</label>
                                        <input className="lfm-input" type="text" required value={formData.qualification.name} onChange={(e) => updateQualification("name", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>SAQA ID *</label>
                                        <input className="lfm-input" type="text" required value={formData.qualification.saqaId} onChange={(e) => updateQualification("saqaId", e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>NQF Level *</label>
                                        <input className="lfm-input" type="number" required value={formData.qualification.nqfLevel} onChange={(e) => updateQualification("nqfLevel", parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Total Credits *</label>
                                        <input className="lfm-input" type="number" required value={formData.qualification.credits} onChange={(e) => updateQualification("credits", parseInt(e.target.value) || 0)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Date Assessed</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.qualification.dateAssessed)} onChange={(e) => updateQualification("dateAssessed", htmlToDate(e.target.value))} />
                                    </div>
                                </div>
                            </div>

                            {/* ── Assessment Modules ── */}
                            <div>
                                <div className="lfm-section-hdr"><Layers size={13} /> Statement of Results / Module Scores</div>
                                <div className="lfm-tabs">
                                    {(Object.keys(TAB_META) as ModuleCategory[]).map((tab) => (
                                        <button key={tab} type="button" className={`lfm-tab ${activeTab === tab ? "active" : ""}`} onClick={() => setActiveTab(tab)}>
                                            {TAB_META[tab].icon} {TAB_META[tab].label}
                                            {currentModuleCount(tab) > 0 && <span className={`lfm-tab__badge ${activeTab === tab ? "active" : ""}`}>{currentModuleCount(tab)}</span>}
                                        </button>
                                    ))}
                                </div>
                                <div className="lfm-module-editor-wrap">
                                    <ModuleEditor
                                        modules={activeTab === "knowledge" ? (formData.knowledgeModules || []) : activeTab === "practical" ? (formData.practicalModules || []) : (formData.workExperienceModules || [])}
                                        type={activeTab}
                                        onUpdate={(i, f, v) => updateModule(activeTab, i, f, v)}
                                        onRemove={(i) => removeModule(activeTab, i)}
                                        onAdd={() => addModule(activeTab)}
                                    />
                                </div>
                            </div>

                            {/* ── QCTO EISA & FLC COMPLIANCE BLOCK ── */}
                            <div className="lfm-section-hdr" style={{ marginTop: '1.5rem', color: 'var(--mlab-blue)' }}>
                                <ShieldCheck size={13} /> EISA & FLC Readiness (QCTO Export Data)
                            </div>
                            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #cbd5e1', marginBottom: '1.5rem' }}>
                                <div className="lfm-grid">
                                    <div className="lfm-fg">
                                        <label>Readiness for EISA Type *</label>
                                        <select className="lfm-input lfm-select" value={(formData.demographics as any)?.eisaReadinessId || "1"} onChange={e => updateDemographics('eisaReadinessId', e.target.value)}>
                                            <option value="1">1 - Enrolled</option>
                                            <option value="2">2 - RPL for Access to EISA (SDP)</option>
                                            <option value="3">3 - Mixed Mode to EISA</option>
                                            <option value="4">4 - SDP Training and Assessment</option>
                                            <option value="5">5 - SDP e-learning training and assessment</option>
                                            <option value="6">6 - RPL for Access to EISA (AQP)</option>
                                        </select>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Assessment Centre Code</label>
                                        <input type="text" className="lfm-input" placeholder="Accreditation Number..." value={(formData.demographics as any)?.assessmentCentreCode || ""} onChange={e => updateDemographics('assessmentCentreCode', e.target.value)} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>Statement of Results Status *</label>
                                        <select className="lfm-input lfm-select" value={(formData.demographics as any)?.sorStatus || "02"} onChange={e => {
                                            updateDemographics('sorStatus', e.target.value);
                                            if (e.target.value === "02") {
                                                updateDemographics('sorIssueDate', "");
                                                updateField('eisaAdmission', false);
                                            }
                                        }}>
                                            <option value="02">02 - Not yet issued</option>
                                            <option value="01">01 - Issued</option>
                                        </select>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>SOR Issue Date {(formData.demographics as any)?.sorStatus === "01" && "*"}</label>
                                        <input type="date" className="lfm-input" value={dateToHtml((formData.demographics as any)?.sorIssueDate)} onChange={e => {
                                            const newDate = htmlToDate(e.target.value);
                                            updateDemographics('sorIssueDate', newDate);
                                            if (newDate) updateDemographics('sorStatus', "01");
                                            else updateField('eisaAdmission', false);
                                        }} disabled={(formData.demographics as any)?.sorStatus === "02"} required={(formData.demographics as any)?.sorStatus === "01"} />
                                    </div>
                                    <div className="lfm-fg">
                                        <label>FLC Status *</label>
                                        <select className="lfm-input lfm-select" value={(formData.demographics as any)?.flcStatus || (formData.demographics as any)?.flc || "06"} onChange={e => {
                                            updateDemographics('flcStatus', e.target.value);
                                            updateDemographics('flc', e.target.value);
                                        }}>
                                            {[{ v: "01", l: "01 - FLC certificate (competent)" }, { v: "02", l: "02 - RPL" }, { v: "03", l: "03 - Grade 12/NCV Level 4 pass" }, { v: "04", l: "04 - Not yet competent" }, { v: "05", l: "05 - FLC not completed yet" }, { v: "06", l: "06 - Not applicable (NQF 5+)" }, { v: "07", l: "07 - Enrolled for FLC" }, { v: "08", l: "08 - N3 Mathematics and Business Lang" }].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                                        </select>
                                    </div>
                                    <div className="lfm-fg">
                                        <label>FLC Result/Certificate Number</label>
                                        <input
                                            type="text"
                                            className="lfm-input"
                                            placeholder="Matric / Certificate Number..."
                                            value={formData.demographics?.flcStatementOfResultNumber || ""}
                                            onChange={e => {
                                                updateDemographics('flcStatementOfResultNumber', e.target.value);
                                                updateDemographics('flcResultNumber', e.target.value);
                                            }}
                                            disabled={["04", "05", "06", "07"].includes((formData.demographics as any)?.flcStatus || (formData.demographics as any)?.flc)}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* ── System Flags & EISA Admission ── */}
                            <div className="lfm-flags-panel" style={{ marginTop: 0 }}>
                                <label className="lfm-checkbox-row" title={!isEisaReadyAllowed ? "Statement of Results must be 'Issued' and dated before admission." : ""}>
                                    <input type="checkbox" checked={formData.eisaAdmission} disabled={!isEisaReadyAllowed} onChange={(e) => updateField("eisaAdmission", e.target.checked)} />
                                    <span style={{ color: !isEisaReadyAllowed ? '#94a3b8' : 'inherit' }}>
                                        Learner has gained admission to the EISA {!isEisaReadyAllowed && " (Requires Issued SOR Date)"}
                                    </span>
                                </label>
                                {formData.eisaAdmission && (
                                    <div className="lfm-fg" style={{ marginTop: "10px", marginLeft: "24px", maxWidth: "200px" }}>
                                        <label>Scheduled EISA Date</label>
                                        <input className="lfm-input" type="date" value={dateToHtml(formData.nextEisaDate)} onChange={(e) => updateField("nextEisaDate", htmlToDate(e.target.value))} />
                                    </div>
                                )}
                                <label className="lfm-checkbox-row" style={{ marginTop: '1rem' }}>
                                    <input type="checkbox" checked={formData.isOffline} onChange={(e) => updateField("isOffline", e.target.checked)} /> Mark as Offline / RPL Learner
                                </label>
                                <label className="lfm-checkbox-row">
                                    <input type="checkbox" checked={formData.isArchived} onChange={(e) => updateField("isArchived", e.target.checked)} /> Archive this learner record
                                </label>
                            </div>

                            {/* ── Demographics ── */}
                            <button type="button" className="lfm-demographics-toggle" onClick={() => setShowDemographics((v) => !v)}>
                                {showDemographics ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {showDemographics ? "Hide" : "Show"} Full QCTO Demographics
                            </button>

                            {showDemographics && (
                                <div className="lfm-demographics-panel">
                                    <div className="lfm-section-hdr" style={{ marginBottom: "0.85rem" }}>QCTO Demographics</div>

                                    <div style={{ marginBottom: '1.2rem', padding: '1rem', background: '#f0f9ff', border: '1px dashed #0ea5e9', borderRadius: '8px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', fontWeight: 600, color: 'var(--mlab-blue)', marginBottom: '6px' }}>
                                            <Globe size={13} /> Google Search & GPS Verification
                                        </label>
                                        <Autocomplete
                                            apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
                                            onPlaceSelected={handleAddressSelected}
                                            options={{ types: [], componentRestrictions: { country: "za" }, fields: ["address_components", "geometry", "formatted_address", "name"] }}
                                            className="lfm-input"
                                            placeholder="Search to auto-fill address and extract GPS coordinates..."
                                        />
                                    </div>

                                    {/* STRICT QCTO DROPDOWNS MAP SECTION */}
                                    <div className="lfm-grid">
                                        <div className="lfm-fg">
                                            <label>Title</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.learnerTitle || ""} onChange={e => updateDemographics('learnerTitle', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_TITLES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Middle Name</label>
                                            <input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerMiddleName || ""} onChange={e => updateDemographics('learnerMiddleName', e.target.value)} />
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Gender Code</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.genderCode || ""} onChange={e => updateDemographics('genderCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_GENDER.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Equity Code</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.equityCode || ""} onChange={e => updateDemographics('equityCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_EQUITY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Home Language</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.homeLanguageCode || ""} onChange={e => updateDemographics('homeLanguageCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_LANGUAGES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Citizen / Resident Status</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.citizenResidentStatusCode || ""} onChange={e => updateDemographics('citizenResidentStatusCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_CITIZEN_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Nationality Code</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.nationalityCode || ""} onChange={e => updateDemographics('nationalityCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_NATIONALITY.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Immigrant Status</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.immigrantStatus || ""} onChange={e => updateDemographics('immigrantStatus', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_IMMIGRANT.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Socioeconomic Status</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.socioeconomicStatusCode || ""} onChange={e => updateDemographics('socioeconomicStatusCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_SOCIOECONOMIC.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Disability Status</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.disabilityStatusCode || ""} onChange={e => updateDemographics('disabilityStatusCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_DISABILITY_STATUS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Disability Rating</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.disabilityRating || ""} onChange={e => updateDemographics('disabilityRating', e.target.value)} disabled={(formData.demographics as any)?.disabilityStatusCode === 'N'}>
                                                <option value="">Select...</option>
                                                {QCTO_DISABILITY_RATING.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>Alternative ID Type</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.alternativeIdType || "533"} onChange={e => updateDemographics('alternativeIdType', e.target.value)}>
                                                {QCTO_ALT_ID_TYPE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>

                                        {/* Address Fields */}
                                        <div className="lfm-fg lfm-fg--full"><label>Home Address 1</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerHomeAddress1 || ""} onChange={(e) => handleHomeAddressChange("learnerHomeAddress1", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Home Address 2</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerHomeAddress2 || ""} onChange={(e) => handleHomeAddressChange("learnerHomeAddress2", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Home Address 3</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerHomeAddress3 || ""} onChange={(e) => handleHomeAddressChange("learnerHomeAddress3", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Home Postal Code</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerHomeAddressPostalCode || ""} onChange={(e) => handleHomeAddressChange("learnerHomeAddressPostalCode", e.target.value)} /></div>

                                        {/* POSTAL ADDRESS SYNC CHECKBOX */}
                                        <div className="lfm-fg lfm-fg--full" style={{ display: 'flex', alignItems: 'center', margin: '0.5rem 0' }}>
                                            <label className="lfm-checkbox-row" style={{ margin: 0, fontWeight: 'bold', color: 'var(--mlab-blue)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isPostalSameAsHome}
                                                    onChange={(e) => {
                                                        const checked = e.target.checked;
                                                        setIsPostalSameAsHome(checked);
                                                        if (checked) {
                                                            setFormData((prev: any) => ({
                                                                ...prev,
                                                                demographics: {
                                                                    ...prev.demographics,
                                                                    learnerPostalAddress1: prev.demographics?.learnerHomeAddress1 || "",
                                                                    learnerPostalAddress2: prev.demographics?.learnerHomeAddress2 || "",
                                                                    learnerPostalAddress3: prev.demographics?.learnerHomeAddress3 || "",
                                                                    learnerPostalAddressPostCode: prev.demographics?.learnerHomeAddressPostalCode || "",
                                                                }
                                                            }));
                                                        }
                                                    }}
                                                />
                                                Postal Address is the same as Home Address
                                            </label>
                                        </div>

                                        <div className="lfm-fg lfm-fg--full"><label>Postal Address 1</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerPostalAddress1 || ""} onChange={(e) => handlePostalManualChange("learnerPostalAddress1", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Postal Address 2</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerPostalAddress2 || ""} onChange={(e) => handlePostalManualChange("learnerPostalAddress2", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Postal Address 3</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerPostalAddress3 || ""} onChange={(e) => handlePostalManualChange("learnerPostalAddress3", e.target.value)} /></div>
                                        <div className="lfm-fg"><label>Postal Address Code</label><input className="lfm-input" type="text" value={(formData.demographics as any)?.learnerPostalAddressPostCode || ""} onChange={(e) => handlePostalManualChange("learnerPostalAddressPostCode", e.target.value)} /></div>

                                        <div className="lfm-fg">
                                            <label>Province Code</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.provinceCode || ""} onChange={e => updateDemographics('provinceCode', e.target.value)}>
                                                <option value="">Select...</option>
                                                {QCTO_PROVINCES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                            </select>
                                        </div>

                                        {/* INLINE SEARCHABLE STATSSA AREA CODE DROPDOWN */}
                                        <div className="lfm-fg" style={{ position: 'relative' }}>
                                            <label>STATSSA Area Code *</label>
                                            <div
                                                className="lfm-search-input-wrapper"
                                                onClick={() => setShowAreaDropdown(!showAreaDropdown)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    background: 'white',
                                                    border: '1px solid #cbd5e1',
                                                    borderRadius: '6px',
                                                    padding: '0 12px',
                                                    minHeight: '38px',
                                                    cursor: 'text'
                                                }}
                                            >
                                                <Search size={14} className="lfm-search-icon" style={{ color: '#94a3b8', marginRight: '8px', flexShrink: 0 }} />
                                                <input
                                                    className="lfm-input"
                                                    style={{
                                                        border: 'none',
                                                        background: 'transparent',
                                                        padding: '0',
                                                        margin: '0',
                                                        boxShadow: 'none',
                                                        width: '100%',
                                                        outline: 'none'
                                                    }}
                                                    placeholder={isSearchingArea ? "Loading data..." : "Search Town, Area, Code..."}
                                                    value={areaSearch}
                                                    onChange={e => {
                                                        setAreaSearch(e.target.value);
                                                        setShowAreaDropdown(true);
                                                    }}
                                                    disabled={isSearchingArea}
                                                    onFocus={() => setShowAreaDropdown(true)}
                                                />
                                            </div>
                                            {showAreaDropdown && filteredStatssaCodes.length > 0 && (
                                                <div className="lfm-search-results">
                                                    {filteredStatssaCodes.map(c => (
                                                        <div key={c.statssa_area_code} className="lfm-search-item" onClick={() => handleStatssaSelect(c)}>
                                                            <strong>{c.statssa_area_code}</strong>
                                                            <span>{c.town} - ({c.local_municipality}) - {c.district_municipality} - {c.area}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="lfm-fg">
                                            <label>POPI Act Agree</label>
                                            <select className="lfm-input lfm-select" value={(formData.demographics as any)?.popiActAgree || "Yes"} onChange={e => updateDemographics('popiActAgree', e.target.value)}>
                                                <option value="Yes">Yes</option>
                                                <option value="No">No</option>
                                            </select>
                                        </div>
                                        <div className="lfm-fg">
                                            <label>POPI Act Date</label>
                                            <input className="lfm-input" type="date" value={dateToHtml((formData.demographics as any)?.popiActDate)} onChange={(e) => updateDemographics("popiActDate", htmlToDate(e.target.value))} disabled={(formData.demographics as any)?.popiActAgree === "No"} />
                                        </div>

                                        <div className="lfm-fg">
                                            <label>Expected Completion</label>
                                            <input className="lfm-input" type="date" value={dateToHtml(formData.demographics?.expectedTrainingCompletionDate)} onChange={(e) => updateDemographics("expectedTrainingCompletionDate", htmlToDate(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="lfm-footer">
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={onClose} disabled={isSaving}>Cancel</button>
                            <button type="submit" className="lfm-btn lfm-btn--primary" disabled={isSaving}>
                                {isSaving ? <><Loader2 size={13} className="lfm-spin" /> Saving…</> : <><Save size={13} /> Save Learner</>}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {/* SHEET SELECTOR MODAL (TRIGGERS IF MULTIPLE SHEETS ARE FOUND AND ID DOES NOT MATCH) */}
            {sheetSelection && (
                <div className="lfm-overlay" style={{ zIndex: 2000 }}>
                    <div className="lfm-modal mlab-modal--sm animate-fade-in" style={{ padding: 0 }}>
                        <div className="lfm-header" style={{ borderBottom: '1px solid var(--mlab-border)', padding: '16px' }}>
                            <h2 className="lfm-header__title" style={{ fontSize: '1.1rem', color: 'var(--mlab-blue)' }}>Select Learner Data</h2>
                            <button className="lfm-close-btn" type="button" onClick={() => setSheetSelection(null)}><X size={18} /></button>
                        </div>
                        <div className="lfm-body" style={{ padding: '16px' }}>
                            <p style={{ fontSize: '0.85rem', color: 'var(--mlab-grey)', margin: '0 0 12px 0' }}>
                                We found <strong>{sheetSelection.sheetNames.length}</strong> sheets in this file. Since we couldn't find an exact match for the ID Number, please select which sheet you want to import into this profile.
                            </p>
                            <div style={{ border: '1px solid var(--mlab-border)', borderRadius: '6px', maxHeight: '300px', overflowY: 'auto', background: '#f8fafc' }}>
                                {sheetSelection.sheetNames.map((name, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            width: '100%',
                                            padding: '12px 16px',
                                            textAlign: 'left',
                                            background: 'none',
                                            border: 'none',
                                            borderBottom: idx !== sheetSelection.sheetNames.length - 1 ? '1px solid var(--mlab-border)' : 'none',
                                            cursor: 'pointer',
                                            color: 'var(--mlab-blue)',
                                            fontWeight: 600,
                                            fontSize: '0.9rem'
                                        }}
                                        onClick={() => processSpecificSheet(sheetSelection.workbook, name)}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                    >
                                        <FileSpreadsheet size={16} color="#10b981" /> {name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="lfm-footer" style={{ padding: '12px 16px', borderTop: '1px solid var(--mlab-border)', justifyContent: 'flex-end' }}>
                            <button type="button" className="lfm-btn lfm-btn--ghost" onClick={() => setSheetSelection(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {statusModal && (
                <StatusModal type={statusModal.type} title={statusModal.title} message={statusModal.message} onClose={statusModal.onClose} onCancel={statusModal.onCancel} confirmText={statusModal.confirmText} />
            )}

            {showCohortModal && (
                <CohortFormModal onClose={() => setShowCohortModal(false)} onSave={handleQuickCohortCreate} />
            )}
        </>
    );
};


