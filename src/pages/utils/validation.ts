// // src/utils/helpers.ts

// export const generateSorId = (
//   learnerName: string,
//   issueDateString: string,
//   sdpCode?: string,
// ): string => {
//   // 1. Grab the last 4 characters of the SDP Code. If missing, fallback to "MLAB"
//   let prefix = "MLAB";
//   if (sdpCode && sdpCode.length > 4) {
//     prefix = sdpCode.slice(-4).toUpperCase(); // "SDP070824115131" -> "5131"
//   } else if (sdpCode) {
//     prefix = sdpCode.toUpperCase();
//   }

//   // 2. Format Date to YYMM (e.g., "2026-03-16" -> "2603")
//   const date = new Date(issueDateString);
//   const yy = String(date.getFullYear()).slice(-2); // "26"
//   const mm = String(date.getMonth() + 1).padStart(2, "0"); // "03"
//   const yearMonth = `${yy}${mm}`;

//   // 3. Get up to 2 initials (e.g., "Galaletsang Morokonyana" -> "GM")
//   const initials = learnerName
//     .split(" ")
//     .filter(Boolean) // Ignores extra spaces
//     .map((name) => name.charAt(0))
//     .join("")
//     .toUpperCase()
//     .substring(0, 2);

//   // 4. Generate a 4-character random alphanumeric string for absolute uniqueness
//   const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();

//   return `${prefix}-${yearMonth}-${initials}-${randomChars}`;
// };

// src/utils/helpers.ts

export const generateSorId = (
  learnerName: string,
  issueDateString: string,
  sdpCode?: string,
): string => {
  // 1. Grab the last 4 characters of the SDP Code. If missing, fallback to "MLAB"
  let prefix = "MLAB";
  if (sdpCode && sdpCode.length > 4) {
    prefix = sdpCode.slice(-4).toUpperCase(); // "SDP070824115131" -> "5131"
  } else if (sdpCode) {
    prefix = sdpCode.toUpperCase();
  }

  // 2. Format Date to YYMM securely (Handling both YYYY-MM-DD and DD-MM-YYYY)
  let yy = "00";
  let mm = "00";

  if (issueDateString && issueDateString.includes("-")) {
    const parts = issueDateString.split("-");
    if (parts[2] && parts[2].length === 4) {
      // It's DD-MM-YYYY (e.g., 16-03-2026)
      yy = parts[2].slice(-2); // "26"
      mm = parts[1]; // "03"
    } else if (parts[0] && parts[0].length === 4) {
      // It's YYYY-MM-DD (e.g., 2026-03-16)
      yy = parts[0].slice(-2); // "26"
      mm = parts[1]; // "03"
    }
  }

  // Fallback if the string was empty or in a completely different format
  if (yy === "00") {
    const d = new Date(issueDateString);
    if (!isNaN(d.getTime())) {
      yy = String(d.getFullYear()).slice(-2);
      mm = String(d.getMonth() + 1).padStart(2, "0");
    }
  }

  const yearMonth = `${yy}${mm}`;

  // 3. Get up to 2 initials (e.g., "Galaletsang Morokonyana" -> "GM")
  const initials = learnerName
    .split(" ")
    .filter(Boolean) // Ignores extra spaces
    .map((name) => name.charAt(0))
    .join("")
    .toUpperCase()
    .substring(0, 2);

  // 4. Generate a 4-character random alphanumeric string for absolute uniqueness
  const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();

  return `${prefix}-${yearMonth}-${initials}-${randomChars}`;
};
