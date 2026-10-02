// src/hooks/useSheetData.ts

import { useState, useEffect, useCallback } from "react";

export interface LearnerRecord {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  email: string;
  pathway: string;
  status: string;
  readiness: string;
  finalScore: number;
  [key: string]: any;
}

// Converts raw numeric codes (0, 1, 100) into clear wording for funders
const normalizeAttemptValue = (headerName: string, rawVal: string): string => {
  const cleanHeader = headerName.toLowerCase();
  const val = rawVal.trim();

  // Preserve numerical scores, averages, emails, IDs, and phone numbers
  if (
    cleanHeader.includes("score") ||
    cleanHeader.includes("average") ||
    cleanHeader.includes("email") ||
    cleanHeader.includes("id") ||
    cleanHeader.includes("phone")
  ) {
    return val;
  }

  // Convert attempt codes
  if (val === "100" || val === "100.0") {
    return "Passed";
  }
  if (val === "1" || val === "1.0") {
    return "Failed";
  }
  if (val === "0" || val === "0.0") {
    return "Not Attempted";
  }

  return val;
};

// Simple browser-native CSV line parser that handles quoted strings
const parseCSV = (csvText: string): LearnerRecord[] => {
  console.log(
    "[CSV Parser] Raw Text Received (First 300 chars):",
    csvText.substring(0, 300),
  );

  const lines = csvText.split(/\r\n|\n/).filter((line) => line.trim() !== "");
  if (lines.length < 2) return [];

  // Extract headers
  const parseLine = (line: string) => {
    const result: string[] = [];
    let start = 0;
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        inQuotes = !inQuotes;
      } else if (line[i] === "," && !inQuotes) {
        result.push(line.substring(start, i).replace(/^"|"$/g, "").trim());
        start = i + 1;
      }
    }
    result.push(line.substring(start).replace(/^"|"$/g, "").trim());
    return result;
  };

  // Find the header row (looks for 'First Name' or 'Gender')
  let headerIdx = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    const row = parseLine(lines[i]);
    if (
      row.includes("First Name") ||
      row.includes("Gender") ||
      row.includes("Email") ||
      row.includes("first_name")
    ) {
      headerIdx = i;
      break;
    }
  }

  const headers = parseLine(lines[headerIdx]);
  console.log("[CSV Parser] Headers Found:", headers);

  const records: LearnerRecord[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length < 3) continue;

    const rowMap: Record<string, any> = {};
    headers.forEach((h, idx) => {
      const cleanHeader = h.trim();
      const rawVal = values[idx] || "";
      // Apply normalization
      rowMap[cleanHeader] = normalizeAttemptValue(cleanHeader, rawVal);
    });

    // Skip completely empty rows
    if (!rowMap["First Name"] && !rowMap["Last Name"] && !rowMap["Email"])
      continue;

    const firstName = rowMap["First Name"] || rowMap["first_name"] || "Learner";
    const lastName = rowMap["Last Name"] || rowMap["last_name"] || "";
    const email = rowMap["Email"] || rowMap["email"] || "";
    const gender = (
      rowMap["Gender"] ||
      rowMap["gender"] ||
      "Unspecified"
    ).toUpperCase();
    const pathway = rowMap["Pathway"] || rowMap["pathway"] || "General";
    const status =
      rowMap["Programme Status"] || rowMap["status"] || "In Progress";
    const readiness =
      rowMap["Overall Readiness"] ||
      rowMap["readiness"] ||
      "Pending Evaluation";

    // Handle Final Score logic
    const rawScore = parseFloat(
      rowMap["Final Score"] || rowMap["CodeTribe Average"] || "0",
    );
    const finalScore = isNaN(rawScore)
      ? 0
      : Number((rawScore > 1 ? rawScore : rawScore * 100).toFixed(1));

    records.push({
      id: `sheet_row_${i}`,
      firstName,
      lastName,
      gender: gender.startsWith("F")
        ? "F"
        : gender.startsWith("M")
          ? "M"
          : gender,
      email,
      pathway,
      status: status === "#ERROR!" ? "In Progress" : status,
      readiness,
      finalScore,
      ...rowMap,
    });
  }

  console.log(
    `[CSV Parser] Successfully parsed ${records.length} valid records.`,
  );
  return records;
};

export const useSheetData = (
  sheetCsvUrl: string,
  refreshIntervalMs = 60000,
) => {
  const [data, setData] = useState<LearnerRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!sheetCsvUrl) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // 🚀 Add cache-busting timestamp so the browser never serves a stale CSV
      const cacheBusterUrl = sheetCsvUrl.includes("?")
        ? `${sheetCsvUrl}&_t=${Date.now()}`
        : `${sheetCsvUrl}?_t=${Date.now()}`;

      const response = await fetch(cacheBusterUrl, {
        cache: "no-store",
        headers: {
          Pragma: "no-cache",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Google Sheet CSV: ${response.statusText}`,
        );
      }

      const csvText = await response.text();
      const parsedRecords = parseCSV(csvText);
      setData(parsedRecords);
    } catch (err: any) {
      console.error("[useSheetData Error]:", err);
      setError(err.message || "Error fetching spreadsheet data.");
    } finally {
      setLoading(false);
    }
  }, [sheetCsvUrl]);

  useEffect(() => {
    fetchData();

    if (refreshIntervalMs > 0) {
      const interval = setInterval(fetchData, refreshIntervalMs);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshIntervalMs]);

  return { data, loading, error, refetch: fetchData };
};

// // src/hooks/useSheetData.ts

// import { useState, useEffect, useCallback } from "react";

// export interface LearnerRecord {
//   id: string;
//   firstName: string;
//   lastName: string;
//   gender: string;
//   email: string;
//   pathway: string;
//   status: string;
//   readiness: string;
//   finalScore: number;
//   [key: string]: any;
// }

// // Simple browser-native CSV line parser that handles quoted strings
// const parseCSV = (csvText: string): LearnerRecord[] => {
//   const lines = csvText.split(/\r\n|\n/).filter((line) => line.trim() !== "");
//   if (lines.length < 2) return [];

//   // Extract headers (Row 2 in GIZ Analytics or Row 1 in standard exports)
//   const parseLine = (line: string) => {
//     const result: string[] = [];
//     let start = 0;
//     let inQuotes = false;
//     for (let i = 0; i < line.length; i++) {
//       if (line[i] === '"') {
//         inQuotes = !inQuotes;
//       } else if (line[i] === "," && !inQuotes) {
//         result.push(line.substring(start, i).replace(/^"|"$/g, "").trim());
//         start = i + 1;
//       }
//     }
//     result.push(line.substring(start).replace(/^"|"$/g, "").trim());
//     return result;
//   };

//   // Find the header row (looks for 'First Name' or 'Gender')
//   let headerIdx = 0;
//   for (let i = 0; i < Math.min(5, lines.length); i++) {
//     const row = parseLine(lines[i]);
//     if (
//       row.includes("First Name") ||
//       row.includes("Gender") ||
//       row.includes("Email")
//     ) {
//       headerIdx = i;
//       break;
//     }
//   }

//   const headers = parseLine(lines[headerIdx]);

//   const records: LearnerRecord[] = [];

//   for (let i = headerIdx + 1; i < lines.length; i++) {
//     const values = parseLine(lines[i]);
//     if (values.length < 3) continue;

//     const rowMap: Record<string, any> = {};
//     headers.forEach((h, idx) => {
//       rowMap[h] = values[idx] || "";
//     });

//     const firstName = rowMap["First Name"] || rowMap["first_name"] || "Learner";
//     const lastName = rowMap["Last Name"] || rowMap["last_name"] || "";
//     const email = rowMap["Email"] || rowMap["email"] || "";
//     const gender = (
//       rowMap["Gender"] ||
//       rowMap["gender"] ||
//       "Unspecified"
//     ).toUpperCase();
//     const pathway = rowMap["Pathway"] || rowMap["pathway"] || "General";
//     const status =
//       rowMap["Programme Status"] || rowMap["status"] || "In Progress";
//     const readiness =
//       rowMap["Overall Readiness"] ||
//       rowMap["readiness"] ||
//       "Pending Evaluation";

//     const rawScore = parseFloat(
//       rowMap["Final Score"] || rowMap["CodeTribe Average"] || "0",
//     );
//     const finalScore = isNaN(rawScore)
//       ? 0
//       : Number((rawScore > 1 ? rawScore : rawScore * 100).toFixed(1));

//     records.push({
//       id: `sheet_row_${i}`,
//       firstName,
//       lastName,
//       gender: gender.startsWith("F")
//         ? "F"
//         : gender.startsWith("M")
//           ? "M"
//           : gender,
//       email,
//       pathway,
//       status: status === "#ERROR!" ? "In Progress" : status,
//       readiness,
//       finalScore,
//       ...rowMap,
//     });
//   }

//   return records;
// };

// export const useSheetData = (
//   sheetCsvUrl: string,
//   refreshIntervalMs = 60000,
// ) => {
//   const [data, setData] = useState<LearnerRecord[]>([]);
//   const [loading, setLoading] = useState<boolean>(true);
//   const [error, setError] = useState<string | null>(null);

//   const fetchData = useCallback(async () => {
//     if (!sheetCsvUrl) {
//       setLoading(false);
//       return;
//     }

//     try {
//       setError(null);
//       const response = await fetch(sheetCsvUrl);
//       if (!response.ok) {
//         throw new Error(
//           `Failed to fetch Google Sheet CSV: ${response.statusText}`,
//         );
//       }
//       const csvText = await response.text();
//       const parsedRecords = parseCSV(csvText);
//       setData(parsedRecords);
//     } catch (err: any) {
//       console.error("[useSheetData Error]:", err);
//       setError(err.message || "Error fetching spreadsheet data.");
//     } finally {
//       setLoading(false);
//     }
//   }, [sheetCsvUrl]);

//   useEffect(() => {
//     fetchData();

//     if (refreshIntervalMs > 0) {
//       const interval = setInterval(fetchData, refreshIntervalMs);
//       return () => clearInterval(interval);
//     }
//   }, [fetchData, refreshIntervalMs]);

//   return { data, loading, error, refetch: fetchData };
// }
// ;
