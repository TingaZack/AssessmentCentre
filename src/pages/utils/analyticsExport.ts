// src/utils/analyticsExport.ts

import * as XLSX from "xlsx";
import type { DashboardLearner } from "../../types";

// ─── POPIA MASKING HELPERS ──────────────────────────────────────────────────

export const maskIdNumber = (id: string): string => {
  if (!id || id.length < 6) return "******";
  const clean = id.trim();
  if (clean.length === 13) {
    return `${clean.substring(0, 6)}****${clean.substring(10)}`;
  }
  return `${clean.substring(0, 3)}****${clean.substring(clean.length - 3)}`;
};

export const maskEmail = (email: string): string => {
  if (!email || !email.includes("@")) return "*****@*****";
  const parts = email.trim().split("@");
  const local = parts[0];
  const domain = parts[1];
  const maskedLocal =
    local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : "***";
  return `${maskedLocal}@${domain}`;
};

export const maskPhone = (phone: string): string => {
  if (!phone || phone.length < 7) return "***-***-****";
  const clean = phone.trim();
  return `${clean.substring(0, 3)}****${clean.substring(clean.length - 3)}`;
};

export const getAgeFromId = (idNumber: string): number | null => {
  if (!idNumber || idNumber.length < 6) return null;
  const yearStr = idNumber.substring(0, 2);
  const monthStr = idNumber.substring(2, 4);
  const dayStr = idNumber.substring(4, 6);
  const currentYear = new Date().getFullYear();
  let year = parseInt(yearStr, 10);
  year += year > currentYear % 100 ? 1900 : 2000;
  const birthDate = new Date(
    year,
    parseInt(monthStr, 10) - 1,
    parseInt(dayStr, 10),
  );
  if (isNaN(birthDate.getTime())) return null;
  const ageDiffMs = Date.now() - birthDate.getTime();
  const ageDate = new Date(ageDiffMs);
  return Math.abs(ageDate.getUTCFullYear() - 1970);
};

// ─── EXPORT OPTIONS INTERFACE ────────────────────────────────────────────────

export interface ExportOptions {
  dataScope: "filtered" | "full";
  preset: "csi" | "ddm" | "seta" | "master";
  popiaEnabled: boolean;
  includeSummaryTab: boolean;
  fileFormat: "xlsx" | "csv";
  cohortName: string;

  // Optional Survey Fields
  selectedSurveyId?: string;
  surveyTemplates?: any[];
  cohortSurveyResponses?: any[];
}

// ─── MAIN EXPORT GENERATOR FUNCTION ─────────────────────────────────────────

export const generateAnalyticsExport = (
  allLearners: DashboardLearner[],
  filteredLearners: DashboardLearner[],
  cohortAnalytics: any,
  options: ExportOptions,
) => {
  const dataset =
    options.dataScope === "filtered" ? filteredLearners : allLearners;
  const isPopia = options.popiaEnabled;

  const fileName = `${options.cohortName.replace(/[^a-zA-Z0-9]/g, "_")}_Analytics_${options.dataScope === "filtered" ? "Filtered" : "Full"}_${new Date().toISOString().split("T")[0]}`;

  // ─── 🚀 DYNAMIC SURVEY MAPPING ───
  const surveyAnswersMap = new Map<string, any>();
  if (
    options.selectedSurveyId &&
    options.surveyTemplates &&
    options.cohortSurveyResponses
  ) {
    const template = options.surveyTemplates.find(
      (s) => s.id === options.selectedSurveyId,
    );
    if (template) {
      const questionMap = new Map<string, string>();
      template.questions?.forEach((q: any) => questionMap.set(q.id, q.label));

      options.cohortSurveyResponses.forEach((r) => {
        if (r.surveyId === options.selectedSurveyId) {
          const flattened: any = {};
          Object.entries(r.answers || {}).forEach(([qId, val]) => {
            const label = questionMap.get(qId) || qId;
            // Format Addresses cleanly
            if (val && typeof val === "object" && "formattedAddress" in val) {
              flattened[`Survey: ${label} (Address)`] =
                val.formattedAddress || "";
              flattened[`Survey: ${label} (City)`] = val.city || "";
            } else {
              flattened[`Survey: ${label}`] =
                val !== undefined && val !== null ? val : "";
            }
          });

          // Link to learner by learnerId or fallback to email
          if (r.learnerId) {
            surveyAnswersMap.set(r.learnerId, flattened);
          } else if (r.learnerEmail) {
            surveyAnswersMap.set(r.learnerEmail.toLowerCase(), flattened);
          }
        }
      });
    }
  }

  // ── FLAT CSV EXPORT ──
  if (options.fileFormat === "csv") {
    const csvRows = dataset.map((l) => {
      const demos = l.demographics || (l as any);
      const stats = cohortAnalytics?.rosterAttendanceMap?.get(
        l.learnerId || l.id,
      );
      const pct = stats ? Math.round(stats.pct) : 0;
      const totalMins = stats ? stats.totalMinutes : 0;
      const age = getAgeFromId(l.idNumber);

      // Extract this specific learner's survey answers (if any)
      const surveyData =
        surveyAnswersMap.get(l.learnerId || l.id) ||
        surveyAnswersMap.get(
          (l.email || demos.learnerEmailAddress || "").toLowerCase(),
        ) ||
        {};

      return {
        "Full Name": l.fullName,
        "ID Number": isPopia ? maskIdNumber(l.idNumber) : l.idNumber,
        Email: isPopia
          ? maskEmail(l.email || demos.learnerEmailAddress)
          : l.email || demos.learnerEmailAddress || "N/A",
        Phone: isPopia
          ? maskPhone(l.phone || l.mobile || demos.learnerPhoneNumber)
          : l.phone || l.mobile || demos.learnerPhoneNumber || "N/A",
        Gender:
          demos.genderCode === "M"
            ? "Male"
            : demos.genderCode === "F"
              ? "Female"
              : "Unspecified",
        "Equity Group": demos.equityCode || "Unspecified",
        Age: age !== null ? age : "N/A",
        "Youth Status":
          age !== null ? (age < 35 ? "Youth (<35)" : "Adult (35+)") : "Unknown",
        Province: demos.provinceName || demos.province || "Unspecified",
        "District / Metro": demos.districtOrMetro || "Unspecified",
        "Local Municipality": demos.localMunicipality || "Unspecified",
        "City / Town":
          demos.learnerHomeAddress2 ||
          demos.city ||
          demos.town ||
          "Unspecified",
        "STATS-SA Code": demos.statssaAreaCode || "N/A",
        Latitude: demos.lat || "N/A",
        Longitude: demos.lng || "N/A",
        "Attendance %": `${pct}%`,
        "Total Hours Logged": (totalMins / 60).toFixed(1),
        Status:
          l.status === "dropped"
            ? "Withdrawn"
            : totalMins > 0
              ? "Active"
              : "Not Started",
        ...surveyData, // Inject Survey Columns
      };
    });

    const ws = XLSX.utils.json_to_sheet(csvRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Learner Export");
    XLSX.writeFile(wb, `${fileName}.csv`);
    return;
  }

  // ── MULTI-TAB WORKBOOK EXPORT (.xlsx) ──
  const wb = XLSX.utils.book_new();

  // ── TAB 1: EXECUTIVE & GEOGRAPHIC SUMMARY ──
  if (options.includeSummaryTab) {
    // Dynamically calculate KPIs based strictly on the current dataset
    let systemActiveCount = 0;
    let totalActivatedLearners = 0;
    let activeFemaleCount = 0;
    let activeMaleCount = 0;
    let highPerformers = 0;
    let atRisk = 0;
    let sumActiveAttendancePct = 0;
    let totalCohortHours = 0;

    dataset.forEach((l) => {
      const isDropped = l.status === "dropped";
      if (!isDropped) systemActiveCount++;

      const stats = cohortAnalytics?.rosterAttendanceMap?.get(
        l.learnerId || l.id,
      );
      const totalMins = stats ? stats.totalMinutes : 0;
      const pct = stats ? Math.round(stats.pct) : 0;
      const isActivated = totalMins > 0;

      const rawGender = String(l.demographics?.genderCode || "").toUpperCase();
      const isFemale = rawGender === "F";
      const isMale = rawGender === "M";

      if (isActivated && !isDropped) {
        totalActivatedLearners++;
        totalCohortHours += totalMins / 60;
        sumActiveAttendancePct += pct;

        if (isFemale) activeFemaleCount++;
        if (isMale) activeMaleCount++;

        if (pct >= 80) highPerformers++;
        if (pct < 50) atRisk++;
      }
    });

    const totalCount = dataset.length;
    const globalRetention =
      totalCount > 0 ? Math.round((systemActiveCount / totalCount) * 100) : 0;
    const activationRate =
      totalCount > 0
        ? Math.round((totalActivatedLearners / totalCount) * 100)
        : 0;
    const activeFemalePct =
      totalActivatedLearners > 0
        ? Math.round((activeFemaleCount / totalActivatedLearners) * 100)
        : 0;
    const activeMalePct =
      totalActivatedLearners > 0
        ? Math.round((activeMaleCount / totalActivatedLearners) * 100)
        : 0;
    const avgAttendance =
      totalActivatedLearners > 0
        ? Math.round(sumActiveAttendancePct / totalActivatedLearners)
        : 0;
    const avgHoursPerLearner =
      totalActivatedLearners > 0
        ? (totalCohortHours / totalActivatedLearners).toFixed(1)
        : "0.0";

    const summaryData: any[][] = [];

    // Title Block
    summaryData.push([
      `EXECUTIVE & GEOGRAPHIC IMPACT SUMMARY - ${options.cohortName.toUpperCase()}`,
    ]);
    summaryData.push([
      `Export Date: ${new Date().toLocaleString("en-ZA")} | Scope: ${options.dataScope.toUpperCase()} | POPIA Protection: ${isPopia ? "ENABLED" : "DISABLED"}`,
    ]);
    summaryData.push([]);

    // KPI Highlights
    summaryData.push(["EXECUTIVE KPI HIGHLIGHTS"]);
    summaryData.push(["Metric Name", "Value", "Percentage / Context"]);
    summaryData.push(["Total Export Roster Count", totalCount, "100%"]);
    summaryData.push([
      "Active (Retained) Learners",
      systemActiveCount,
      `${globalRetention}% Retained`,
    ]);
    summaryData.push([
      "Activated (Started) Learners",
      totalActivatedLearners,
      `${activationRate}% Activated`,
    ]);
    summaryData.push([
      "Female Active Representation",
      activeFemaleCount,
      `${activeFemalePct}% of Active`,
    ]);
    summaryData.push([
      "Male Active Representation",
      activeMaleCount,
      `${activeMalePct}% of Active`,
    ]);
    summaryData.push([
      "High Compliance Learners (80%+)",
      highPerformers,
      "Satisfactory Track",
    ]);
    summaryData.push([
      "At-Risk Learners (<50%)",
      atRisk,
      "Requires Intervention",
    ]);
    summaryData.push([
      "Average Cohort Attendance",
      `${avgAttendance}%`,
      "Active Average",
    ]);
    summaryData.push([
      "Total Cohort Hours Logged",
      `${Math.round(totalCohortHours)} hrs`,
      `${avgHoursPerLearner} hrs / learner`,
    ]);
    summaryData.push([]);

    // Geographic DDM Breakdown
    summaryData.push(["DISTRICT DEVELOPMENT MODEL (DDM) GEOGRAPHIC BREAKDOWN"]);
    summaryData.push([
      "Province",
      "District / Metro",
      "Local Municipality",
      "City / Town",
      "Learner Count",
      "Active Count",
      "Female Count",
      "Youth (<35) Count",
    ]);

    const geoGroupMap = new Map<
      string,
      {
        prov: string;
        dist: string;
        muni: string;
        city: string;
        total: number;
        active: number;
        female: number;
        youth: number;
      }
    >();

    dataset.forEach((l) => {
      const demos = l.demographics || (l as any);
      const prov = String(
        demos.provinceName || demos.province || "Unspecified",
      ).trim();
      const dist = String(demos.districtOrMetro || "Unspecified").trim();
      const muni = String(demos.localMunicipality || "Unspecified").trim();
      const city = String(
        demos.learnerHomeAddress2 || demos.city || demos.town || "Unspecified",
      ).trim();
      const key = `${prov}|${dist}|${muni}|${city}`;

      if (!geoGroupMap.has(key)) {
        geoGroupMap.set(key, {
          prov,
          dist,
          muni,
          city,
          total: 0,
          active: 0,
          female: 0,
          youth: 0,
        });
      }

      const stats = cohortAnalytics?.rosterAttendanceMap?.get(
        l.learnerId || l.id,
      );
      const isActivated = stats ? stats.totalMinutes > 0 : false;
      const isFemale = String(demos.genderCode || "").toUpperCase() === "F";
      const age = getAgeFromId(l.idNumber);
      const isYouth = age !== null && age < 35;

      const entry = geoGroupMap.get(key)!;
      entry.total++;
      if (isActivated && l.status !== "dropped") entry.active++;
      if (isFemale) entry.female++;
      if (isYouth) entry.youth++;
    });

    geoGroupMap.forEach((g) => {
      summaryData.push([
        g.prov,
        g.dist,
        g.muni,
        g.city,
        g.total,
        g.active,
        g.female,
        g.youth,
      ]);
    });

    summaryData.push([]);

    // Equity Cross Tabulation
    summaryData.push(["DEMOGRAPHIC EQUITY & GENDER CROSS-TABULATION"]);
    summaryData.push([
      "Equity Group",
      "Male Count",
      "Female Count",
      "Total Learners",
      "% of Total",
    ]);

    const equityMap = new Map<
      string,
      { male: number; female: number; total: number }
    >();
    dataset.forEach((l) => {
      const demos = l.demographics || (l as any);
      const eq = String(demos.equityCode || "Unspecified").trim();
      const isFemale = String(demos.genderCode || "").toUpperCase() === "F";

      if (!equityMap.has(eq))
        equityMap.set(eq, { male: 0, female: 0, total: 0 });
      const entry = equityMap.get(eq)!;
      entry.total++;
      if (isFemale) entry.female++;
      else entry.male++;
    });

    equityMap.forEach((v, k) => {
      const pct =
        dataset.length > 0 ? Math.round((v.total / dataset.length) * 100) : 0;
      summaryData.push([k, v.male, v.female, v.total, `${pct}%`]);
    });

    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, "Executive Summary");
  }

  // ── TAB 2: GRANULAR LEARNER ROSTER ──
  const rosterRows = dataset.map((l) => {
    const demos = l.demographics || (l as any);
    const stats = cohortAnalytics?.rosterAttendanceMap?.get(
      l.learnerId || l.id,
    );
    const pct = stats ? Math.round(stats.pct) : 0;
    const totalMins = stats ? stats.totalMinutes : 0;
    const attended = stats ? stats.attended : 0;
    const age = getAgeFromId(l.idNumber);

    // Extract this specific learner's survey answers (if any)
    const surveyData =
      surveyAnswersMap.get(l.learnerId || l.id) ||
      surveyAnswersMap.get(
        (l.email || demos.learnerEmailAddress || "").toLowerCase(),
      ) ||
      {};

    return {
      "Full Name": l.fullName,
      "SA ID Number": isPopia ? maskIdNumber(l.idNumber) : l.idNumber,
      "Email Address": isPopia
        ? maskEmail(l.email || demos.learnerEmailAddress)
        : l.email || demos.learnerEmailAddress || "N/A",
      "Contact Phone": isPopia
        ? maskPhone(l.phone || l.mobile || demos.learnerPhoneNumber)
        : l.phone || l.mobile || demos.learnerPhoneNumber || "N/A",
      "Date of Birth": l.dateOfBirth || "N/A",
      "Calculated Age": age !== null ? age : "N/A",
      "Youth Status":
        age !== null ? (age < 35 ? "Youth (<35)" : "Adult (35+)") : "Unknown",
      Title: demos.learnerTitle || "N/A",
      Gender:
        demos.genderCode === "M"
          ? "Male"
          : demos.genderCode === "F"
            ? "Female"
            : "Unspecified",
      "Equity Group": demos.equityCode || "Unspecified",
      "Home Language": demos.homeLanguageCode || "Unspecified",
      "Citizenship Status": demos.citizenResidentStatusCode || "Unspecified",
      Nationality: demos.nationalityCode || "Unspecified",
      "Socioeconomic Status": demos.socioeconomicStatusCode || "Unspecified",
      "Disability Status": demos.disabilityStatusCode || "None",
      "Disability Rating": demos.disabilityRating || "N/A",
      "Province Name": demos.provinceName || demos.province || "Unspecified",
      "District / Metro": demos.districtOrMetro || "Unspecified",
      "Local Municipality": demos.localMunicipality || "Unspecified",
      "City / Suburb / Town":
        demos.learnerHomeAddress2 || demos.city || demos.town || "Unspecified",
      "Street Address": demos.learnerHomeAddress1 || "N/A",
      "Postal Code": demos.learnerHomeAddressPostalCode || "N/A",
      "STATS-SA Area Code": demos.statssaAreaCode || "N/A",
      "GPS Latitude": demos.lat || "N/A",
      "GPS Longitude": demos.lng || "N/A",
      "Assigned Class": l.cohortId || options.cohortName,
      "Activation Status": totalMins > 0 ? "Started" : "Never Attended",
      "Classes Attended": `${attended}/${cohortAnalytics?.baseLength || 0}`,
      "Attendance Score %": `${pct}%`,
      "Total Minutes Logged": totalMins,
      "Total Hours Logged": (totalMins / 60).toFixed(1),
      "Funnel Status":
        l.status === "dropped"
          ? "Withdrawn"
          : totalMins > 0
            ? "Active Applicant"
            : "Not Started",
      "Enrollment Date": l.createdAt ? l.createdAt.split("T")[0] : "",
      ...surveyData, // Inject Survey Columns
    };
  });

  const rosterWs = XLSX.utils.json_to_sheet(rosterRows);
  XLSX.utils.book_append_sheet(wb, rosterWs, "Learner Roster");

  // ── TAB 3: QCTO & SETA COMPLIANCE REGISTER ──
  const complianceRows = dataset.map((l) => {
    const demos = l.demographics || (l as any);
    const qual = l.qualification || {};

    return {
      "Full Name": l.fullName,
      "ID Number": isPopia ? maskIdNumber(l.idNumber) : l.idNumber,
      "SDP Provider Code": demos.sdpCode || "SDP070824115131",
      "Campus / Site Name": l.campusId || "Main Site",
      "Qualification Name": qual.name || "N/A",
      "SAQA Qual ID": qual.saqaId || "N/A",
      "NQF Level": qual.nqfLevel || "N/A",
      "Total Credits": qual.credits || 0,
      "Total Notional Hours": qual.totalNotionalHours || 0,
      "SOR Verification Code": l.verificationCode || "N/A",
      "SOR Status":
        demos.sorStatus === "01" ? "01 - Issued" : "02 - Not Issued",
      "SOR Issue Date": demos.sorIssueDate || l.issueDate || "N/A",
      "FLC Status": demos.flcStatus || "06 - N/A",
      "FLC Certificate #": demos.flcStatementOfResultNumber || "N/A",
      "EISA Readiness Type": demos.eisaReadinessId || "1 - Enrolled",
      "Scheduled EISA Date": l.nextEisaDate || "N/A",
      "POPIA Consent Status": demos.popiActAgree || "Yes",
      "POPIA Consent Date": demos.popiActDate || "N/A",
    };
  });

  const complianceWs = XLSX.utils.json_to_sheet(complianceRows);
  XLSX.utils.book_append_sheet(wb, complianceWs, "QCTO & SETA Compliance");

  // Save File
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};
