// functions/src/callable/resolveLearnerMunicipality.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { generateCompletion } from "../utils/aiClient";

interface LocationPayload {
  statsSaAreaCode?: string;
  streetAddress?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}

export const resolveLearnerMunicipalityAI = onCall(
  {
    cors: true,
    secrets: ["OPENROUTER_API_KEY", "HF_TOKEN"],
  },
  async (request) => {
    // 1. Ensure caller is authenticated
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to perform AI location resolution.",
      );
    }

    const { statsSaAreaCode, streetAddress, city, province, postalCode } =
      request.data as LocationPayload;

    if (!statsSaAreaCode && !city && !streetAddress) {
      throw new HttpsError(
        "invalid-argument",
        "Insufficient location data provided.",
      );
    }

    // 2. Build AI Context Prompt
    const systemPrompt = `You are an expert South African Geographic & Economic Development AI Engine specializing in Stats-SA census area codes, MDB municipal boundaries, public transport trails, and industrial economic hubs.

Your task is to analyze raw learner address data and return a STRICT JSON object containing exact South African municipal and placement metadata.

STRICT REQUIREMENTS:
- Output MUST be valid, raw JSON only. Do not include markdown code blocks, backticks (\`\`\`json), or conversational commentary.
- Coordinates MUST be inside South Africa (Latitude between -35.0 and -22.0, Longitude between 16.0 and 33.5). Latitudes MUST be negative.
- If Stats-SA Area Code is provided (e.g. "2011-797031001 - Katlehong"), decode its Main Place and Municipality accurately.

JSON OUTPUT STRUCTURE:
{
  "localMunicipality": "Official Local or Metropolitan Municipality Name (e.g. City of Ekurhuleni, City of Cape Town, Sol Plaatje)",
  "districtOrMetro": "District Municipality or Metro Name (e.g. Ekurhuleni Metro, Frances Baard District)",
  "province": "Official Province Name",
  "municipalityCode": "Official MDB Code if known (e.g. EKU, JHB, GT423, WC011, ETH)",
  "mainPlace": "Township / Suburb / Sub-place Name (e.g. Katlehong, Boksburg, Soweto, Kimberley)",
  "coords": [latitude_number, longitude_number],
  "economicHubs": ["List of 3-4 nearest major employment / industrial zones"],
  "transitTrails": ["List of main public transit options / routes connecting this area to job hubs"],
  "placementInsight": "A 1-2 sentence executive summary of job industries best suited for learners in this location"
}`;

    const userPrompt = `Please resolve the following South African learner address details:
- Stats-SA Area Code: ${statsSaAreaCode || "N/A"}
- Street Address: ${streetAddress || "N/A"}
- City / Town: ${city || "N/A"}
- Province: ${province || "N/A"}
- Postal Code: ${postalCode || "N/A"}`;

    try {
      // 3. Request AI Completion via AI Client
      const aiResponse = await generateCompletion({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for maximum factual precision
        maxTokens: 1000,
      });

      // 4. Sanitize and Parse JSON
      const cleanJsonText = aiResponse.text
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      const parsedData = JSON.parse(cleanJsonText);

      return {
        success: true,
        data: parsedData,
        modelUsed: aiResponse.modelUsed,
      };
    } catch (error: any) {
      console.error("AI Municipal Resolution Error:", error);
      throw new HttpsError(
        "internal",
        `Failed to resolve location via AI: ${error.message}`,
      );
    }
  },
);
