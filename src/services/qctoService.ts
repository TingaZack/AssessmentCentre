// src/services/qctoService.ts
export const fetchStatssaCodes = async () => {
  const SPREADSHEET_ID = "1M_u0M4uCMeJiq6tvdzE8GYy4Tubzi30jIMaGUiRW-nQ";
  const URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json`;

  try {
    const response = await fetch(URL);
    let text = await response.text();
    const jsonStr = text
      .replace(/^\/\*.*?\*\/\s*google\.visualization\.Query\.setResponse\(/, "")
      .replace(/\);$/, "");

    const data = JSON.parse(jsonStr);
    const rows = data.table.rows || [];
    if (rows.length === 0) return [];

    // Map rows using your specific debug keys
    return rows.slice(1).map((row: any) => ({
      statssa_area_code: row.c[0]?.v ?? "",
      area: row.c[1]?.v ?? "",
      town: row.c[2]?.v ?? "",
      local_municipality: row.c[3]?.v ?? "",
      district_municipality: row.c[4]?.v ?? "",
      province: row.c[5]?.v ?? "",
    }));
  } catch (error) {
    console.error("Failed to fetch STATSSA codes:", error);
    return [];
  }
};
