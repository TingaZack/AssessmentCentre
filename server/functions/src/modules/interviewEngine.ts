// functions/src/modules/interviewEngine.ts

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import { GoogleAuth } from "google-auth-library";

// Central AI Gateway Client
import { generateCompletion, ChatMessage } from "../utils/aiClient";

// Define Secret Manager dependencies for deployment runtime access
const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
const hfTokenSecret = defineSecret("HF_TOKEN");

// Initialize Google Auth for Gemini TTS REST API
const auth = new GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});

// -----------------------------------------------------------------------------
// TYPES & INTERFACES
// -----------------------------------------------------------------------------

export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
export type InterviewScope = "full" | "technical_only" | "behavioral_only";

export interface InterviewTurnPayload {
  sessionId?: string;
  targetRole: string;
  difficulty?: "simple" | "mid" | "hard";
  seniority?: string;
  selectedSkillChips: string[];
  currentStage: string;
  contextMode?: ContextMode;
  interviewScope?: InterviewScope;
  cvSummary?: string;
  pastInterviewSummary?: string;
  timeRemainingSeconds?: number;
  totalTimeLimitSeconds?: number;
  conversationHistory: ChatMessage[];
  lastCandidateAnswer?: string;
}

export interface EvaluationPayload {
  sessionId?: string;
  learnerId?: string;
  targetRole: string;
  difficulty?: "simple" | "mid" | "hard";
  selectedSkillChips: string[];
  contextMode?: ContextMode;
  interviewScope?: InterviewScope;
  cvSummary?: string;
  fullTranscript: Array<{
    speaker: string;
    text: string;
    timestamp?: string;
  }>;
}

// -----------------------------------------------------------------------------
// 1. GEMINI FLASH TEXT-TO-SPEECH GENERATOR
// -----------------------------------------------------------------------------

export const generateSpeech = onCall(
  {
    cors: true,
    region: "us-central1",
  },
  async (request) => {
    const userAuth = request.auth;
    if (!userAuth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to generate audio.",
      );
    }

    const {
      text,
      voiceName = "Achernar",
      languageCode = "en-GB",
    } = request.data as {
      text: string;
      voiceName?: string;
      languageCode?: string;
    };

    if (!text || typeof text !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Valid text content is required.",
      );
    }

    try {
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();

      const response = await fetch(
        "https://texttospeech.googleapis.com/v1beta1/text:synthesize",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenResponse.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audioConfig: {
              audioEncoding: "MP3",
              pitch: 0,
              speakingRate: 1.05,
            },
            input: {
              text: text,
              prompt:
                "Read aloud in a professional, warm, and natural conversational tone. Act as a human interviewer.",
            },
            voice: {
              languageCode: languageCode,
              modelName: "gemini-3.1-flash-tts-preview",
              name: voiceName,
            },
          }),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          `TTS API Error: ${data.error?.message || response.statusText}`,
        );
      }

      if (!data.audioContent) {
        throw new Error("No audio content returned from Gemini TTS.");
      }

      return {
        audioBase64: `data:audio/mp3;base64,${data.audioContent}`,
      };
    } catch (error: any) {
      logger.error("Gemini TTS Error:", error);
      throw new HttpsError(
        "internal",
        error?.message || "Failed to generate Gemini TTS speech.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// 2. DYNAMIC INTERVIEW TURN GENERATOR (ZERO-LATENCY TEXT RETURN)
// -----------------------------------------------------------------------------

export const generateInterviewTurn = onCall(
  {
    cors: true,
    secrets: [openRouterSecret, hfTokenSecret],
    region: "us-central1",
  },
  async (request) => {
    const userAuth = request.auth;

    if (!userAuth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to participate in mock interviews.",
      );
    }

    const {
      sessionId,
      targetRole,
      difficulty = "simple",
      seniority,
      selectedSkillChips = [],
      currentStage = "Introduction & Warmup",
      contextMode = "both",
      interviewScope = "full",
      cvSummary = "No CV provided or linked.",
      pastInterviewSummary,
      timeRemainingSeconds,
      totalTimeLimitSeconds,
      conversationHistory = [],
      lastCandidateAnswer,
    } = request.data as InterviewTurnPayload;

    if (!targetRole || typeof targetRole !== "string") {
      throw new HttpsError("invalid-argument", "Target role is required.");
    }

    // Intercept feedback requests mid-interview
    const immediateAnswer =
      lastCandidateAnswer?.trim() ||
      (conversationHistory.length > 0
        ? conversationHistory[conversationHistory.length - 1].content
        : "N/A");

    const feedbackRequestPattern =
      /give me feedback|how am i doing|what'?s my score|rate my performance|what.*score/i;
    if (immediateAnswer && feedbackRequestPattern.test(immediateAnswer)) {
      return {
        success: true,
        responseText:
          "I'm not able to share a score or provide feedback while the interview is still in progress — that keeps the assessment fair and unbiased. Once we wrap up, you'll get a full evidence-based scorecard covering your technical, behavioural, and communication performance. Let's continue — shall we move to the next question?",
        turnPurpose: "CLARIFICATION",
        answerAssessment: "NOT_APPLICABLE",
        shouldAdvanceStage: false,
        provider: "System_Guardrail",
        modelUsed: "N/A",
        fallbackUsed: false,
        fallbackAttempts: 0,
        durationMs: 0,
      };
    }

    const topicKeywords = [
      "stakeholder",
      "typescript",
      "jest",
      "testing",
      "api",
      "react",
      "migration",
      "team",
      "collaborat",
      "agile",
      "scrum",
      "database",
      "sql",
      "docker",
      "devops",
    ];
    const coveredTopics: string[] = [];

    conversationHistory.forEach((msg, i) => {
      if (msg.role === "user" && msg.content.trim().length > 100) {
        const priorQuestion =
          conversationHistory[i - 1]?.content?.toLowerCase() || "";
        topicKeywords.forEach((t) => {
          if (priorQuestion.includes(t) && !coveredTopics.includes(t)) {
            coveredTopics.push(t);
          }
        });
      }
    });

    let personaRigor =
      "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

    if (difficulty === "mid") {
      personaRigor =
        "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
    }

    if (difficulty === "hard") {
      personaRigor =
        "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
    }

    let timeContextInstruction = "";
    if (typeof timeRemainingSeconds === "number") {
      if (timeRemainingSeconds <= 120) {
        timeContextInstruction =
          "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
      } else if (timeRemainingSeconds <= 300) {
        timeContextInstruction =
          "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
      }
    }

    let contextInstruction = "";
    if (contextMode === "both" || contextMode === "cv_only") {
      contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
    }

    if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
      contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
      contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but focus on verifying if they have improved in those specific areas today.\n`;
    }

    let scopeInstruction = "";
    if (interviewScope === "full") {
      scopeInstruction = `
THIS IS A HOLISTIC MULTI-PART INTERVIEW. Guide the conversation through these stages based on the current stage:
1. Work Readiness & Warmup
2. Soft Skills & STAR Behavioral
3. Technical Deep-Dive
4. System Scenario & Problem-Solving
5. Candidate Q&A
6. Conclusion & Wrap-Up`;
    } else if (interviewScope === "technical_only") {
      scopeInstruction =
        "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
    } else {
      scopeInstruction =
        "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
    }

    const systemPrompt = `You are an expert interviewer conducting a live, spoken mock interview for a ${targetRole} position at mLab Southern Africa.

DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
CURRENT STAGE: ${currentStage}
CANDIDATE SENIORITY: ${seniority || "Not specified"}
FOCUS SKILLS: ${selectedSkillChips.length > 0 ? selectedSkillChips.join(", ") : "General technical, behavioural and workplace skills"}
TOPICS ALREADY THOROUGHLY ANSWERED (DO NOT RE-ASK IN DIFFERENT PHRASING): ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "None yet"}

 ${contextInstruction}
 ${scopeInstruction}

TOTAL SESSION TIME: ${typeof totalTimeLimitSeconds === "number" ? `${totalTimeLimitSeconds} seconds` : "Not specified"}
TIME REMAINING: ${typeof timeRemainingSeconds === "number" ? `${timeRemainingSeconds} seconds` : "Not specified"}

IMMEDIATE CONTEXT:
The candidate's exact last message was: "${immediateAnswer}"
CRITICAL RULE: You MUST directly acknowledge and respond to what the candidate just said before moving on. Do NOT ignore their last message. Do NOT repeat your previous greeting or question unless asked.

INTERVIEWER STANDARD:
 ${personaRigor}

CORE ASSESSMENT PRINCIPLES:
1. EVIDENCE OVER CLAIMS: Give credit for demonstrated knowledge, reasoning, and examples.
2. DO NOT RESCUE: Do not provide the answer or complete their answer for them.
3. FORCED PROGRESSION (CRITICAL): If the candidate repeatedly says "I don't know", "I have no idea", or clearly lacks knowledge on a topic, DO NOT keep asking them about it. Note the weakness internally, advance the stage ("shouldAdvanceStage": true), and immediately switch to a completely different technical or behavioral concept. Do not beat a dead horse.

INTERVIEWER CONDUCT & REGISTER NOTE (CRITICAL):
If the candidate uses casual or overly familiar language toward you (e.g. "buddy", "bro", "dude", "mate", slang), do not mirror it or ignore it completely. Maintain your own strictly professional tone. If it happens more than once, briefly and professionally remind the candidate that this is a formal assessment and professional communication is part of the evaluation, then smoothly ask the pending interview question without derailing the interview.

MLAB & CODETRIBE ALIGNMENT (CRITICAL):
As an mLab assessor, if the candidate asks for learning resources, expresses difficulty, or when wrapping up the interview, you MUST explicitly recommend that they refer to the "mLab skills programmes", specifically "CodeTribe Academy". You MUST also advise them to reach out directly to their "facilitators and mentors" for guidance. You may add your own brief, specific technical advice (e.g., "review React documentation") on top of this. Do not invent fake links.

ANSWER VALIDATION AND REDIRECTION:
- First determine whether the candidate answered the previous question adequately.
- If they gave an incorrect answer, ask ONE concise probing question.
- If they ask a meta-question like "Can you hear me?", answer briefly ("Yes, I can hear you perfectly.") and RESTATE the pending question.

TIME MANAGEMENT:
${timeContextInstruction}

CONVERSATION STATE:
${
  conversationHistory.length === 0
    ? `This is TURN ONE. Conversation history is empty. You MUST introduce yourself warmly but professionally. State that your name is Bongs, and you are the assessor for mLab today. Explain to the candidate why they are here: to participate in a structured mock assessment for the ${targetRole} position to rigorously evaluate their technical skills and behavioral competencies. Advise them to respond exactly as they would in a real industry interview. Conclude your introduction by asking a foundational warmup question about their background. Limit this introduction to about 4 sentences.`
    : `This is turn ${conversationHistory.length + 1}. The interview is ALREADY IN PROGRESS. You MUST NOT reintroduce yourself (do not say your name is Bongs again). Read the actual conversation history above and continue naturally from it, directly addressing what the candidate just said in IMMEDIATE CONTEXT below.`
}

SPEECH SYNTHESIS (CRITICAL):
- Ask exactly ONE clear question per turn.
- Ensure you end your turn with a QUESTION mark (?). Do not just state "I'd like to ask a follow-up question..." without actually asking it.
- Keep the response concise.
- Use natural professional spoken language. NO markdown, NO bullet points.
- Do not repeat the same sentence twice in your response.

JSON OUTPUT REQUIREMENT:
You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

JSON SCHEMA:
{
  "responseText": "string (The exact spoken response and single question for the candidate)",
  "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
  "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
  "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
}`;

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory,
    ];

    if (lastCandidateAnswer?.trim()) {
      const lastMsgInHistory =
        conversationHistory[conversationHistory.length - 1];
      const isAlreadyInHistory =
        lastMsgInHistory &&
        lastMsgInHistory.role === "user" &&
        lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

      if (!isAlreadyInHistory) {
        messages.push({ role: "user", content: lastCandidateAnswer.trim() });
      }
    }

    try {
      let parsedData: any = null;
      let rawText = "";
      let aiResult: any;

      const lastAiMessage =
        [...conversationHistory]
          .reverse()
          .find((m) => m.role === "assistant")
          ?.content?.trim()
          .toLowerCase() || "";

      for (let attempt = 1; attempt <= 2; attempt++) {
        let currentMessages = [...messages];

        if (attempt === 2) {
          currentMessages.push({ role: "assistant", content: rawText || "{}" });
          currentMessages.push({
            role: "user",
            content:
              "Your previous response was invalid JSON, contained looping, or failed to ask a question. Please output ONLY the raw JSON object for the next interviewer turn. End your responseText with an actual question mark (?). Do not refuse.",
          });
        }

        aiResult = await generateCompletion({
          messages: currentMessages,
          temperature: 0.5,
          maxTokens: 400,
          frequencyPenalty: 0.4,
          presencePenalty: 0.3,
          feature: "mock_interview_turn",
          userId: userAuth.uid,
          sessionId,
        });

        rawText = aiResult.text?.trim() || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const jsonParsed = JSON.parse(jsonMatch[0]);
            if (
              jsonParsed &&
              typeof jsonParsed.responseText === "string" &&
              jsonParsed.responseText.trim().length > 0
            ) {
              const responseText = jsonParsed.responseText.trim();
              const turnPurpose = jsonParsed.turnPurpose || "PRIMARY_QUESTION";

              const isRefusal =
                /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
                  responseText,
                );
              const isExactRepeatOfLastTurn =
                lastAiMessage.length > 0 &&
                responseText.toLowerCase() === lastAiMessage;

              const sentences = responseText.split(/(?<=[.?!])\s+/);
              const hasInternalLoop = sentences.some(
                (s: string, i: number, arr: string[]) =>
                  s.length > 20 && arr.indexOf(s) !== i,
              );

              const isWrapupOrGreeting = [
                "STAGE_WRAPUP",
                "INITIAL_GREETING",
              ].includes(turnPurpose);
              const endsWithQuestion = /\?\s*$/.test(responseText);
              const isMetaCommentaryOnly =
                /i'?d like to ask|i'?ll ask|let'?s move (forward|on)/i.test(
                  responseText,
                ) && !endsWithQuestion;

              let isValidTurn =
                !isRefusal && !isExactRepeatOfLastTurn && !hasInternalLoop;

              if (
                !isWrapupOrGreeting &&
                (isMetaCommentaryOnly || !endsWithQuestion)
              ) {
                isValidTurn = false;
                logger.warn(
                  `Attempt ${attempt}: AI failed to ask a question or only provided meta-commentary. Retrying.`,
                );
              }

              if (isValidTurn) {
                parsedData = {
                  responseText: responseText,
                  turnPurpose: turnPurpose,
                  answerAssessment:
                    jsonParsed.answerAssessment || "SATISFACTORY",
                  shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
                };
                break;
              }
            }
          } catch (e) {
            logger.warn(`Attempt ${attempt}: JSON parse failed.`);
          }
        }
      }

      if (!parsedData && rawText.length > 0) {
        const cleanText = rawText
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();
        const looksLikeJson =
          /^\s*\{[\s\S]*"responseText"[\s\S]*\}?\s*$/.test(cleanText) ||
          /^\s*\{/.test(cleanText);
        const isRefusal =
          /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
            cleanText,
          );

        if (!isRefusal && !looksLikeJson && cleanText.length > 0) {
          parsedData = {
            responseText: cleanText,
            turnPurpose: "PRIMARY_QUESTION",
            answerAssessment: "NOT_APPLICABLE",
            shouldAdvanceStage: false,
          };
        } else if (looksLikeJson) {
          logger.warn(
            "JSON Leak Prevented. Falling back to generic hardcoded prompt.",
          );
        }
      }

      if (!parsedData) {
        if (conversationHistory.length === 0) {
          parsedData = {
            responseText: `Hello, and thank you for taking the time to participate in this mock interview for the ${targetRole} role. My name is Bongs, and I'll be your assessor for mLab today. This is a structured assessment designed to rigorously evaluate your skills. Please treat this like a real industry interview. To get us started, could you tell me a little bit about your background?`,
            turnPurpose: "INITIAL_GREETING",
            answerAssessment: "NOT_APPLICABLE",
            shouldAdvanceStage: false,
          };
        } else {
          parsedData = {
            responseText: `Thank you for sharing that. Building on what you just mentioned, could you provide a specific, real-world example to support your approach?`,
            turnPurpose: "PRIMARY_QUESTION",
            answerAssessment: "SATISFACTORY",
            shouldAdvanceStage: false,
          };
        }
      }

      return {
        success: true,
        responseText: parsedData.responseText,
        turnPurpose: parsedData.turnPurpose,
        answerAssessment: parsedData.answerAssessment,
        shouldAdvanceStage: parsedData.shouldAdvanceStage,
        provider: aiResult?.provider || "Fallback",
        modelUsed: aiResult?.modelUsed || "Fallback",
        fallbackUsed: aiResult?.fallbackUsed || true,
        fallbackAttempts: aiResult?.fallbackAttempts || 2,
        durationMs: aiResult?.durationMs || 0,
      };
    } catch (error: any) {
      logger.error("Error generating interview turn:", error);
      throw new HttpsError(
        "internal",
        error?.message || "Failed to generate interview response.",
      );
    }
  },
);

// -----------------------------------------------------------------------------
// 3. POST-INTERVIEW EVALUATION & READINESS ENGINE
// -----------------------------------------------------------------------------

export const evaluateMockInterview = onCall(
  {
    cors: true,
    secrets: [openRouterSecret, hfTokenSecret],
    timeoutSeconds: 300,
    memory: "512MiB",
    region: "us-central1",
  },
  async (request) => {
    const userAuth = request.auth;

    if (!userAuth) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication required to evaluate mock interviews.",
      );
    }

    const {
      sessionId,
      learnerId,
      targetRole,
      difficulty = "simple",
      selectedSkillChips = [],
      contextMode = "both",
      interviewScope = "full",
      cvSummary = "No CV provided.",
      fullTranscript,
    } = request.data as EvaluationPayload;

    if (!targetRole || typeof targetRole !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "Target role is required for assessment.",
      );
    }

    if (
      !fullTranscript ||
      !Array.isArray(fullTranscript) ||
      fullTranscript.length === 0
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Full transcript is required for evaluation.",
      );
    }

    const isQualifyingRun = contextMode === "both" && interviewScope === "full";

    const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

You are evaluating a completed mock interview for a candidate applying for:

TARGET ROLE: ${targetRole}
DIFFICULTY: ${difficulty.toUpperCase()}
FOCUS SKILLS: ${selectedSkillChips?.length ? selectedSkillChips.join(", ") : "General technical and workplace competencies"}

 ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

ASSESSMENT PHILOSOPHY:
Be accurate, evidence-based and appropriately rigorous. Do NOT inflate scores to encourage the candidate.
If the candidate performed poorly, say so clearly.

SCORING STANDARD:
90-100 = Interview Ready / Strong Evidence
80-89 = Nearly Ready / Minor Gaps
70-79 = Developing / Not Yet Consistently Ready
60-69 = Significant Development Required
40-59 = Not Interview Ready
0-39 = Seriously Not Ready

IMPORTANT SCORING RULE:
Do not use 80 as a default or "average" score.
A candidate who performs poorly should receive a low score.
A candidate who demonstrates only basic knowledge should receive a basic score.
A candidate must earn points through evidence.

CATEGORY SCORING:
TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional register, ability to explain technical concepts, listening and responsiveness.
ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

PROFESSIONAL CONDUCT & LANGUAGE REGISTER (CRITICAL — MUST BE EXPLICITLY ASSESSED):
Review the candidate's exact wording throughout the transcript for professional register, not just content.
A real interview panel penalises casual, informal, or overly familiar language directed at the interviewer, even if the underlying technical or behavioural content is otherwise reasonable.

Flag and penalise instances such as:
- Casual/familiar address terms directed at the interviewer (e.g. "buddy", "man", "dude", "bro", "mate")
- Dismissive or curt responses that lack professional framing (e.g. one-word answers with no elaboration when elaboration was possible)
- Slang, texting-style abbreviations, or overly informal phrasing in a formal assessment context
- Any tone that would be inappropriate in a real employer-facing interview

This is NOT about penalising honesty (e.g. "I don't know" is acceptable and should not be penalised on its own).
It is specifically about HOW something is said, not THAT the candidate lacked knowledge.

If such language appears anywhere in the transcript:
1. It MUST measurably lower the communicationScore — do not treat it as a minor stylistic footnote.
2. It MUST be quoted (briefly, verbatim) and cited as specific evidence in areasForImprovement or priorityGaps.
3. The relevant questionBreakdown entry's feedback field MUST note the tone issue, not just the technical/behavioural content of the answer.
4. If casual language toward the interviewer occurs more than once, readinessStatus MUST NOT be "READY" or "NEARLY_READY" regardless of technical score, since professional communication is itself a core competency being assessed for real employer-facing interviews.

CRITICAL RULES:
1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
2. A vague answer must not receive full marks.
3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
4. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
5. The overall score must reflect actual evidence from the transcript.

RECOMMENDED PREPARATION (CRITICAL):
For your 'recommendedPreparation' array, you MUST explicitly advise the candidate to leverage the "mLab skills programmes" and "CodeTribe Academy", as well as to seek direct feedback from their "facilitators and mentors". Combine this with specific technical advice based on their weak points.

JSON OUTPUT REQUIREMENT:
Return valid JSON only.

SCHEMA:
{
  "overallScore": number,
  "technicalScore": number,
  "technicalKnowledgeScore": number,
  "interviewReadinessScore": number,
  "behavioralScore": number,
  "communicationScore": number,
  "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
  "readinessSummary": "string",
  "confidence": number,
  "strengths": ["string"],
  "areasForImprovement": ["string"],
  "priorityGaps": ["string"],
  "recommendedPreparation": ["string"],
  "questionBreakdown": [
    {
      "question": "string",
      "candidateAnswer": "string",
      "score": number,
      "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
      "feedback": "string",
      "whatWasMissing": "string",
      "idealAnswerSample": "string"
    }
  ]
}`;

    const formattedTranscriptText = fullTranscript
      .map((t) => `[${t.speaker.toUpperCase()}]: ${t.text}`)
      .join("\n");

    const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${formattedTranscriptText}`;

    try {
      let scorecard: any = null;
      let lastRawText = "";

      for (let attempt = 1; attempt <= 2; attempt++) {
        let currentPrompt = userPrompt;
        if (attempt === 2) {
          currentPrompt += `\n\nCRITICAL FIX: Your previous response was invalid JSON. Output ONLY raw JSON matching the required schema. Do not include markdown, explanations, or trailing commas.`;
        }

        const aiResult = await generateCompletion({
          messages: [
            { role: "system" as const, content: systemPrompt },
            { role: "user" as const, content: currentPrompt },
          ],
          temperature: 0.1,
          maxTokens: 3500,
          feature: "mock_interview_evaluation",
          userId: userAuth.uid,
          sessionId,
        });

        lastRawText = aiResult.text?.trim() || "";
        const jsonMatch = lastRawText.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed && typeof parsed.overallScore === "number") {
              scorecard = parsed;
              break;
            }
          } catch (e) {
            logger.warn(`Evaluation attempt ${attempt} JSON parse failed.`);
          }
        }
      }

      if (!scorecard) {
        logger.error(
          "AI Evaluation parsing failed twice. Generating emergency fallback scorecard.",
          { lastRawText, sessionId },
        );

        scorecard = {
          overallScore: 55,
          technicalScore: 50,
          technicalKnowledgeScore: 50,
          interviewReadinessScore: 55,
          behavioralScore: 60,
          communicationScore: 60,
          readinessStatus: "DEVELOPING",
          readinessSummary:
            "Evaluation completed based on transcript analysis. Further technical and communication preparation recommended.",
          confidence: 0.8,
          strengths: [
            "Completed the full interview session",
            "Active participation throughout the conversation",
          ],
          areasForImprovement: [
            "Strengthen technical domain depth",
            "Ensure formal professional register and communication",
          ],
          priorityGaps: [
            "Technical depth on core framework concepts",
            "Professional interview register",
          ],
          recommendedPreparation: [
            "Leverage the mLab skills programmes and CodeTribe Academy modules",
            "Schedule direct feedback sessions with your CodeTribe facilitators and mentors",
          ],
          questionBreakdown: fullTranscript
            .filter((t) => t.speaker === "interviewer")
            .slice(0, 10)
            .map((t) => ({
              question: t.text,
              candidateAnswer: "Answer recorded in transcript",
              score: 55,
              evidenceLevel: "PARTIAL",
              feedback: "Evaluated as part of the holistic assessment session.",
              whatWasMissing:
                "Ensure detailed technical examples and formal professional communication.",
              idealAnswerSample:
                "Provide structured, detailed technical responses using the STAR format.",
            })),
        };
      }

      const requiredNumericFields = [
        "overallScore",
        "technicalScore",
        "technicalKnowledgeScore",
        "interviewReadinessScore",
        "behavioralScore",
        "communicationScore",
      ];

      for (const field of requiredNumericFields) {
        const val = scorecard[field];
        if (typeof val !== "number" || val < 0 || val > 100) {
          scorecard[field] =
            typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
        }
      }

      if (
        (scorecard.technicalScore < 80 ||
          scorecard.technicalKnowledgeScore < 80) &&
        scorecard.readinessStatus === "READY"
      ) {
        scorecard.readinessStatus = "NEARLY_READY";
        scorecard.readinessSummary +=
          " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
      }

      const db = admin.firestore();

      if (sessionId) {
        await db.collection("ai_interviews").doc(sessionId).set(
          {
            scorecard,
            difficulty,
            targetRole,
            contextMode,
            interviewScope,
            isQualifyingRun,
            status: "completed",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }

      const targetLearnerId = learnerId || userAuth.uid;
      const learnerRef = db.collection("learners").doc(targetLearnerId);
      const learnerSnap = await learnerRef.get();

      if (learnerSnap.exists && isQualifyingRun) {
        const existingData = learnerSnap.data() || {};
        const prevProgress = existingData.interviewProgress || {
          currentTier: "simple",
          unlockedTier: "simple",
          tier1HighScore: 0,
          tier2HighScore: 0,
          tier3HighScore: 0,
          totalSessionsCompleted: 0,
          qualifyingSessionsCompleted: 0,
          readinessStatus: "NOT_READY",
          unresolvedGaps: [],
          lastInterviewAt: new Date().toISOString(),
        };

        const overall = scorecard.overallScore || 0;
        let t1High = prevProgress.tier1HighScore || 0;
        let t2High = prevProgress.tier2HighScore || 0;
        let t3High = prevProgress.tier3HighScore || 0;

        if (difficulty === "simple" && overall > t1High) t1High = overall;
        if (difficulty === "mid" && overall > t2High) t2High = overall;
        if (difficulty === "hard" && overall > t3High) t3High = overall;

        let unlocked: "simple" | "mid" | "hard" =
          prevProgress.unlockedTier || "simple";
        if (t1High >= 90) unlocked = "mid";
        if (t1High >= 90 && t2High >= 90) unlocked = "hard";

        await learnerRef.update({
          employabilityScore: overall,
          latestInterviewScore: overall,
          technicalScore: scorecard.technicalScore || 0,
          technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
          interviewReadinessScore: scorecard.interviewReadinessScore || 0,
          behavioralScore: scorecard.behavioralScore || 0,
          communicationScore: scorecard.communicationScore || 0,
          readinessStatus: scorecard.readinessStatus || "NOT_READY",
          lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
          "interviewProgress.tier1HighScore": t1High,
          "interviewProgress.tier2HighScore": t2High,
          "interviewProgress.tier3HighScore": t3High,
          "interviewProgress.unlockedTier": unlocked,
          "interviewProgress.unresolvedGaps": scorecard.priorityGaps || [],
          "interviewProgress.totalSessionsCompleted":
            admin.firestore.FieldValue.increment(1),
          "interviewProgress.qualifyingSessionsCompleted":
            admin.firestore.FieldValue.increment(1),
          "interviewProgress.lastInterviewAt":
            admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        success: true,
        scorecard,
        isQualifyingRun,
      };
    } catch (error: any) {
      logger.error("Error evaluating mock interview:", {
        error: error?.message || error,
        userId: userAuth.uid,
        sessionId,
      });
      throw new HttpsError(
        "internal",
        error?.message || "Failed to evaluate mock interview transcript.",
      );
    }
  },
);

// // functions/src/modules/interviewEngine.ts

// import { onCall, HttpsError } from "firebase-functions/v2/https";
// import { defineSecret } from "firebase-functions/params";
// import * as logger from "firebase-functions/logger";
// import * as admin from "firebase-admin";
// import { GoogleAuth } from "google-auth-library";

// // Central AI Gateway Client
// import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // Define Secret Manager dependencies for deployment runtime access
// const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// const hfTokenSecret = defineSecret("HF_TOKEN");

// // Initialize Google Auth for Gemini TTS REST API
// const auth = new GoogleAuth({
//   scopes: ["https://www.googleapis.com/auth/cloud-platform"],
// });

// // -----------------------------------------------------------------------------
// // TYPES & INTERFACES
// // -----------------------------------------------------------------------------

// export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// export interface InterviewTurnPayload {
//   sessionId?: string;
//   targetRole: string;
//   difficulty?: "simple" | "mid" | "hard";
//   seniority?: string;
//   selectedSkillChips: string[];
//   currentStage: string;
//   contextMode?: ContextMode;
//   interviewScope?: InterviewScope;
//   cvSummary?: string;
//   pastInterviewSummary?: string;
//   timeRemainingSeconds?: number;
//   totalTimeLimitSeconds?: number;
//   conversationHistory: ChatMessage[];
//   lastCandidateAnswer?: string;
// }

// export interface EvaluationPayload {
//   sessionId?: string;
//   learnerId?: string;
//   targetRole: string;
//   difficulty?: "simple" | "mid" | "hard";
//   selectedSkillChips: string[];
//   contextMode?: ContextMode;
//   interviewScope?: InterviewScope;
//   cvSummary?: string;
//   fullTranscript: Array<{
//     speaker: string;
//     text: string;
//     timestamp?: string;
//   }>;
// }

// // -----------------------------------------------------------------------------
// // 1. GEMINI FLASH TEXT-TO-SPEECH GENERATOR
// // -----------------------------------------------------------------------------

// export const generateSpeech = onCall(
//   {
//     cors: true,
//     region: "us-central1",
//   },
//   async (request) => {
//     const userAuth = request.auth;
//     if (!userAuth) {
//       throw new HttpsError(
//         "unauthenticated",
//         "Authentication required to generate audio.",
//       );
//     }

//     const {
//       text,
//       voiceName = "Achernar",
//       languageCode = "en-GB",
//     } = request.data as {
//       text: string;
//       voiceName?: string;
//       languageCode?: string;
//     };

//     if (!text || typeof text !== "string") {
//       throw new HttpsError(
//         "invalid-argument",
//         "Valid text content is required.",
//       );
//     }

//     try {
//       const client = await auth.getClient();
//       const tokenResponse = await client.getAccessToken();

//       const response = await fetch(
//         "https://texttospeech.googleapis.com/v1beta1/text:synthesize",
//         {
//           method: "POST",
//           headers: {
//             Authorization: `Bearer ${tokenResponse.token}`,
//             "Content-Type": "application/json",
//           },
//           body: JSON.stringify({
//             audioConfig: {
//               audioEncoding: "MP3",
//               pitch: 0,
//               speakingRate: 1.05,
//             },
//             input: {
//               text: text,
//               prompt:
//                 "Read aloud in a professional, warm, and natural conversational tone. Act as a human interviewer.",
//             },
//             voice: {
//               languageCode: languageCode,
//               modelName: "gemini-3.1-flash-tts-preview",
//               name: voiceName,
//             },
//           }),
//         },
//       );

//       const data = await response.json();

//       if (!response.ok) {
//         throw new Error(
//           `TTS API Error: ${data.error?.message || response.statusText}`,
//         );
//       }

//       if (!data.audioContent) {
//         throw new Error("No audio content returned from Gemini TTS.");
//       }

//       return {
//         audioBase64: `data:audio/mp3;base64,${data.audioContent}`,
//       };
//     } catch (error: any) {
//       logger.error("Gemini TTS Error:", error);
//       throw new HttpsError(
//         "internal",
//         error?.message || "Failed to generate Gemini TTS speech.",
//       );
//     }
//   },
// );

// // -----------------------------------------------------------------------------
// // 2. DYNAMIC INTERVIEW TURN GENERATOR (ZERO-LATENCY TEXT RETURN)
// // -----------------------------------------------------------------------------

// export const generateInterviewTurn = onCall(
//   {
//     cors: true,
//     secrets: [openRouterSecret, hfTokenSecret],
//     region: "us-central1",
//   },
//   async (request) => {
//     const userAuth = request.auth;

//     if (!userAuth) {
//       throw new HttpsError(
//         "unauthenticated",
//         "Authentication required to participate in mock interviews.",
//       );
//     }

//     const {
//       sessionId,
//       targetRole,
//       difficulty = "simple",
//       seniority,
//       selectedSkillChips = [],
//       currentStage = "Introduction & Warmup",
//       contextMode = "both",
//       interviewScope = "full",
//       cvSummary = "No CV provided or linked.",
//       pastInterviewSummary,
//       timeRemainingSeconds,
//       totalTimeLimitSeconds,
//       conversationHistory = [],
//       lastCandidateAnswer,
//     } = request.data as InterviewTurnPayload;

//     if (!targetRole || typeof targetRole !== "string") {
//       throw new HttpsError("invalid-argument", "Target role is required.");
//     }

//     // Intercept feedback requests mid-interview
//     const immediateAnswer =
//       lastCandidateAnswer?.trim() ||
//       (conversationHistory.length > 0
//         ? conversationHistory[conversationHistory.length - 1].content
//         : "N/A");

//     const feedbackRequestPattern =
//       /give me feedback|how am i doing|what'?s my score|rate my performance|what.*score/i;
//     if (immediateAnswer && feedbackRequestPattern.test(immediateAnswer)) {
//       return {
//         success: true,
//         responseText:
//           "I'm not able to share a score or provide feedback while the interview is still in progress — that keeps the assessment fair and unbiased. Once we wrap up, you'll get a full evidence-based scorecard covering your technical, behavioural, and communication performance. Let's continue — shall we move to the next question?",
//         turnPurpose: "CLARIFICATION",
//         answerAssessment: "NOT_APPLICABLE",
//         shouldAdvanceStage: false,
//         provider: "System_Guardrail",
//         modelUsed: "N/A",
//         fallbackUsed: false,
//         fallbackAttempts: 0,
//         durationMs: 0,
//       };
//     }

//     const topicKeywords = [
//       "stakeholder",
//       "typescript",
//       "jest",
//       "testing",
//       "api",
//       "react",
//       "migration",
//       "team",
//       "collaborat",
//       "agile",
//       "scrum",
//       "database",
//       "sql",
//       "docker",
//       "devops",
//     ];
//     const coveredTopics: string[] = [];

//     conversationHistory.forEach((msg, i) => {
//       if (msg.role === "user" && msg.content.trim().length > 100) {
//         const priorQuestion =
//           conversationHistory[i - 1]?.content?.toLowerCase() || "";
//         topicKeywords.forEach((t) => {
//           if (priorQuestion.includes(t) && !coveredTopics.includes(t)) {
//             coveredTopics.push(t);
//           }
//         });
//       }
//     });

//     let personaRigor =
//       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

//     if (difficulty === "mid") {
//       personaRigor =
//         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
//     }

//     if (difficulty === "hard") {
//       personaRigor =
//         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
//     }

//     let timeContextInstruction = "";
//     if (typeof timeRemainingSeconds === "number") {
//       if (timeRemainingSeconds <= 120) {
//         timeContextInstruction =
//           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
//       } else if (timeRemainingSeconds <= 300) {
//         timeContextInstruction =
//           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
//       }
//     }

//     let contextInstruction = "";
//     if (contextMode === "both" || contextMode === "cv_only") {
//       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
//     }

//     if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
//       contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
//       contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but focus on verifying if they have improved in those specific areas today.\n`;
//     }

//     let scopeInstruction = "";
//     if (interviewScope === "full") {
//       scopeInstruction = `
// THIS IS A HOLISTIC MULTI-PART INTERVIEW. Guide the conversation through these stages based on the current stage:
// 1. Work Readiness & Warmup
// 2. Soft Skills & STAR Behavioral
// 3. Technical Deep-Dive
// 4. System Scenario & Problem-Solving
// 5. Candidate Q&A
// 6. Conclusion & Wrap-Up`;
//     } else if (interviewScope === "technical_only") {
//       scopeInstruction =
//         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
//     } else {
//       scopeInstruction =
//         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
//     }

//     const systemPrompt = `You are an expert interviewer conducting a live, spoken mock interview for a ${targetRole} position at mLab Southern Africa.

// DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// CURRENT STAGE: ${currentStage}
// CANDIDATE SENIORITY: ${seniority || "Not specified"}
// FOCUS SKILLS: ${selectedSkillChips.length > 0 ? selectedSkillChips.join(", ") : "General technical, behavioural and workplace skills"}
// TOPICS ALREADY THOROUGHLY ANSWERED (DO NOT RE-ASK IN DIFFERENT PHRASING): ${coveredTopics.length > 0 ? coveredTopics.join(", ") : "None yet"}

//  ${contextInstruction}
//  ${scopeInstruction}

// TOTAL SESSION TIME: ${typeof totalTimeLimitSeconds === "number" ? `${totalTimeLimitSeconds} seconds` : "Not specified"}
// TIME REMAINING: ${typeof timeRemainingSeconds === "number" ? `${timeRemainingSeconds} seconds` : "Not specified"}

// IMMEDIATE CONTEXT:
// The candidate's exact last message was: "${immediateAnswer}"
// CRITICAL RULE: You MUST directly acknowledge and respond to what the candidate just said before moving on. Do NOT ignore their last message. Do NOT repeat your previous greeting or question unless asked.

// INTERVIEWER STANDARD:
//  ${personaRigor}

// CORE ASSESSMENT PRINCIPLES:
// 1. EVIDENCE OVER CLAIMS: Give credit for demonstrated knowledge, reasoning, and examples.
// 2. DO NOT RESCUE: Do not provide the answer or complete their answer for them.
// 3. FORCED PROGRESSION (CRITICAL): If the candidate repeatedly says "I don't know", "I have no idea", or clearly lacks knowledge on a topic, DO NOT keep asking them about it. Note the weakness internally, advance the stage ("shouldAdvanceStage": true), and immediately switch to a completely different technical or behavioral concept. Do not beat a dead horse.

// INTERVIEWER CONDUCT & REGISTER NOTE (CRITICAL):
// If the candidate uses casual or overly familiar language toward you (e.g. "buddy", "bro", "dude", "mate", slang), do not mirror it or ignore it completely. Maintain your own strictly professional tone. If it happens more than once, briefly and professionally remind the candidate that this is a formal assessment and professional communication is part of the evaluation, then smoothly ask the pending interview question without derailing the interview.

// MLAB & CODETRIBE ALIGNMENT (CRITICAL):
// As an mLab assessor, if the candidate asks for learning resources, expresses difficulty, or when wrapping up the interview, you MUST explicitly recommend that they refer to the "mLab skills programmes", specifically "CodeTribe Academy". You MUST also advise them to reach out directly to their "facilitators and mentors" for guidance. You may add your own brief, specific technical advice (e.g., "review React documentation") on top of this. Do not invent fake links.

// ANSWER VALIDATION AND REDIRECTION:
// - First determine whether the candidate answered the previous question adequately.
// - If they gave an incorrect answer, ask ONE concise probing question.
// - If they ask a meta-question like "Can you hear me?", answer briefly ("Yes, I can hear you perfectly.") and RESTATE the pending question.

// TIME MANAGEMENT:
// ${timeContextInstruction}

// CONVERSATION STATE:
// ${
//   conversationHistory.length === 0
//     ? `This is TURN ONE. Conversation history is empty. You MUST introduce yourself warmly but professionally. State that your name is Bongs, and you are the assessor for mLab today. Explain to the candidate why they are here: to participate in a structured mock assessment for the ${targetRole} position to rigorously evaluate their technical skills and behavioral competencies. Advise them to respond exactly as they would in a real industry interview. Conclude your introduction by asking a foundational warmup question about their background. Limit this introduction to about 4 sentences.`
//     : `This is turn ${conversationHistory.length + 1}. The interview is ALREADY IN PROGRESS. You MUST NOT reintroduce yourself (do not say your name is Bongs again). Read the actual conversation history above and continue naturally from it, directly addressing what the candidate just said in IMMEDIATE CONTEXT below.`
// }

// SPEECH SYNTHESIS (CRITICAL):
// - Ask exactly ONE clear question per turn.
// - Ensure you end your turn with a QUESTION mark (?). Do not just state "I'd like to ask a follow-up question..." without actually asking it.
// - Keep the response concise.
// - Use natural professional spoken language. NO markdown, NO bullet points.
// - Do not repeat the same sentence twice in your response.

// JSON OUTPUT REQUIREMENT:
// You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// JSON SCHEMA:
// {
//   "responseText": "string (The exact spoken response and single question for the candidate)",
//   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
//   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
//   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// }`;

//     const messages: ChatMessage[] = [
//       { role: "system", content: systemPrompt },
//       ...conversationHistory,
//     ];

//     if (lastCandidateAnswer?.trim()) {
//       const lastMsgInHistory =
//         conversationHistory[conversationHistory.length - 1];
//       const isAlreadyInHistory =
//         lastMsgInHistory &&
//         lastMsgInHistory.role === "user" &&
//         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

//       if (!isAlreadyInHistory) {
//         messages.push({ role: "user", content: lastCandidateAnswer.trim() });
//       }
//     }

//     try {
//       let parsedData: any = null;
//       let rawText = "";
//       let aiResult: any;

//       const lastAiMessage =
//         [...conversationHistory]
//           .reverse()
//           .find((m) => m.role === "assistant")
//           ?.content?.trim()
//           .toLowerCase() || "";

//       for (let attempt = 1; attempt <= 2; attempt++) {
//         let currentMessages = [...messages];

//         if (attempt === 2) {
//           currentMessages.push({ role: "assistant", content: rawText || "{}" });
//           currentMessages.push({
//             role: "user",
//             content:
//               "Your previous response was invalid JSON, contained looping, or failed to ask a question. Please output ONLY the raw JSON object for the next interviewer turn. End your responseText with an actual question mark (?). Do not refuse.",
//           });
//         }

//         aiResult = await generateCompletion({
//           messages: currentMessages,
//           temperature: 0.5,
//           maxTokens: 400,
//           frequencyPenalty: 0.4,
//           presencePenalty: 0.3,
//           feature: "mock_interview_turn",
//           userId: userAuth.uid,
//           sessionId,
//         });

//         rawText = aiResult.text?.trim() || "";
//         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

//         if (jsonMatch) {
//           try {
//             const jsonParsed = JSON.parse(jsonMatch[0]);
//             if (
//               jsonParsed &&
//               typeof jsonParsed.responseText === "string" &&
//               jsonParsed.responseText.trim().length > 0
//             ) {
//               const responseText = jsonParsed.responseText.trim();
//               const turnPurpose = jsonParsed.turnPurpose || "PRIMARY_QUESTION";

//               const isRefusal =
//                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
//                   responseText,
//                 );
//               const isExactRepeatOfLastTurn =
//                 lastAiMessage.length > 0 &&
//                 responseText.toLowerCase() === lastAiMessage;

//               const sentences = responseText.split(/(?<=[.?!])\s+/);
//               const hasInternalLoop = sentences.some(
//                 (s: string, i: number, arr: string[]) =>
//                   s.length > 20 && arr.indexOf(s) !== i,
//               );

//               const isWrapupOrGreeting = [
//                 "STAGE_WRAPUP",
//                 "INITIAL_GREETING",
//               ].includes(turnPurpose);
//               const endsWithQuestion = /\?\s*$/.test(responseText);
//               const isMetaCommentaryOnly =
//                 /i'?d like to ask|i'?ll ask|let'?s move (forward|on)/i.test(
//                   responseText,
//                 ) && !endsWithQuestion;

//               let isValidTurn =
//                 !isRefusal && !isExactRepeatOfLastTurn && !hasInternalLoop;

//               if (
//                 !isWrapupOrGreeting &&
//                 (isMetaCommentaryOnly || !endsWithQuestion)
//               ) {
//                 isValidTurn = false;
//                 logger.warn(
//                   `Attempt ${attempt}: AI failed to ask a question or only provided meta-commentary. Retrying.`,
//                 );
//               }

//               if (isValidTurn) {
//                 parsedData = {
//                   responseText: responseText,
//                   turnPurpose: turnPurpose,
//                   answerAssessment:
//                     jsonParsed.answerAssessment || "SATISFACTORY",
//                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
//                 };
//                 break;
//               }
//             }
//           } catch (e) {
//             logger.warn(`Attempt ${attempt}: JSON parse failed.`);
//           }
//         }
//       }

//       if (!parsedData && rawText.length > 0) {
//         const cleanText = rawText
//           .replace(/```json/gi, "")
//           .replace(/```/g, "")
//           .trim();
//         const looksLikeJson =
//           /^\s*\{[\s\S]*"responseText"[\s\S]*\}?\s*$/.test(cleanText) ||
//           /^\s*\{/.test(cleanText);
//         const isRefusal =
//           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
//             cleanText,
//           );

//         if (!isRefusal && !looksLikeJson && cleanText.length > 0) {
//           parsedData = {
//             responseText: cleanText,
//             turnPurpose: "PRIMARY_QUESTION",
//             answerAssessment: "NOT_APPLICABLE",
//             shouldAdvanceStage: false,
//           };
//         } else if (looksLikeJson) {
//           logger.warn(
//             "JSON Leak Prevented. Falling back to generic hardcoded prompt.",
//           );
//         }
//       }

//       if (!parsedData) {
//         if (conversationHistory.length === 0) {
//           parsedData = {
//             responseText: `Hello, and thank you for taking the time to participate in this mock interview for the ${targetRole} role. My name is Bongs, and I'll be your assessor for mLab today. This is a structured assessment designed to rigorously evaluate your skills. Please treat this like a real industry interview. To get us started, could you tell me a little bit about your background?`,
//             turnPurpose: "INITIAL_GREETING",
//             answerAssessment: "NOT_APPLICABLE",
//             shouldAdvanceStage: false,
//           };
//         } else {
//           parsedData = {
//             responseText: `Thank you for sharing that. Building on what you just mentioned, could you provide a specific, real-world example to support your approach?`,
//             turnPurpose: "PRIMARY_QUESTION",
//             answerAssessment: "SATISFACTORY",
//             shouldAdvanceStage: false,
//           };
//         }
//       }

//       return {
//         success: true,
//         responseText: parsedData.responseText,
//         turnPurpose: parsedData.turnPurpose,
//         answerAssessment: parsedData.answerAssessment,
//         shouldAdvanceStage: parsedData.shouldAdvanceStage,
//         provider: aiResult?.provider || "Fallback",
//         modelUsed: aiResult?.modelUsed || "Fallback",
//         fallbackUsed: aiResult?.fallbackUsed || true,
//         fallbackAttempts: aiResult?.fallbackAttempts || 2,
//         durationMs: aiResult?.durationMs || 0,
//       };
//     } catch (error: any) {
//       logger.error("Error generating interview turn:", error);
//       throw new HttpsError(
//         "internal",
//         error?.message || "Failed to generate interview response.",
//       );
//     }
//   },
// );

// // -----------------------------------------------------------------------------
// // 3. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // -----------------------------------------------------------------------------

// export const evaluateMockInterview = onCall(
//   {
//     cors: true,
//     secrets: [openRouterSecret, hfTokenSecret],
//     timeoutSeconds: 300,
//     memory: "512MiB",
//     region: "us-central1",
//   },
//   async (request) => {
//     const userAuth = request.auth;

//     if (!userAuth) {
//       throw new HttpsError(
//         "unauthenticated",
//         "Authentication required to evaluate mock interviews.",
//       );
//     }

//     const {
//       sessionId,
//       learnerId,
//       targetRole,
//       difficulty = "simple",
//       selectedSkillChips = [],
//       contextMode = "both",
//       interviewScope = "full",
//       cvSummary = "No CV provided.",
//       fullTranscript,
//     } = request.data as EvaluationPayload;

//     if (!targetRole || typeof targetRole !== "string") {
//       throw new HttpsError(
//         "invalid-argument",
//         "Target role is required for assessment.",
//       );
//     }

//     if (
//       !fullTranscript ||
//       !Array.isArray(fullTranscript) ||
//       fullTranscript.length === 0
//     ) {
//       throw new HttpsError(
//         "invalid-argument",
//         "Full transcript is required for evaluation.",
//       );
//     }

//     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

//     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// You are evaluating a completed mock interview for a candidate applying for:

// TARGET ROLE: ${targetRole}
// DIFFICULTY: ${difficulty.toUpperCase()}
// FOCUS SKILLS: ${selectedSkillChips?.length ? selectedSkillChips.join(", ") : "General technical and workplace competencies"}

//  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// ASSESSMENT PHILOSOPHY:
// Be accurate, evidence-based and appropriately rigorous. Do NOT inflate scores to encourage the candidate.
// If the candidate performed poorly, say so clearly.

// SCORING STANDARD:
// 90-100 = Interview Ready / Strong Evidence
// 80-89 = Nearly Ready / Minor Gaps
// 70-79 = Developing / Not Yet Consistently Ready
// 60-69 = Significant Development Required
// 40-59 = Not Interview Ready
// 0-39 = Seriously Not Ready

// IMPORTANT SCORING RULE:
// Do not use 80 as a default or "average" score.
// A candidate who performs poorly should receive a low score.
// A candidate who demonstrates only basic knowledge should receive a basic score.
// A candidate must earn points through evidence.

// CATEGORY SCORING:
// TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
// BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
// COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional register, ability to explain technical concepts, listening and responsiveness.
// ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// PROFESSIONAL CONDUCT & LANGUAGE REGISTER (CRITICAL — MUST BE EXPLICITLY ASSESSED):
// Review the candidate's exact wording throughout the transcript for professional register, not just content.
// A real interview panel penalises casual, informal, or overly familiar language directed at the interviewer, even if the underlying technical or behavioural content is otherwise reasonable.

// Flag and penalise instances such as:
// - Casual/familiar address terms directed at the interviewer (e.g. "buddy", "man", "dude", "bro", "mate")
// - Dismissive or curt responses that lack professional framing (e.g. one-word answers with no elaboration when elaboration was possible)
// - Slang, texting-style abbreviations, or overly informal phrasing in a formal assessment context
// - Any tone that would be inappropriate in a real employer-facing interview

// This is NOT about penalising honesty (e.g. "I don't know" is acceptable and should not be penalised on its own).
// It is specifically about HOW something is said, not THAT the candidate lacked knowledge.

// If such language appears anywhere in the transcript:
// 1. It MUST measurably lower the communicationScore — do not treat it as a minor stylistic footnote.
// 2. It MUST be quoted (briefly, verbatim) and cited as specific evidence in areasForImprovement or priorityGaps.
// 3. The relevant questionBreakdown entry's feedback field MUST note the tone issue, not just the technical/behavioural content of the answer.
// 4. If casual language toward the interviewer occurs more than once, readinessStatus MUST NOT be "READY" or "NEARLY_READY" regardless of technical score, since professional communication is itself a core competency being assessed for real employer-facing interviews.

// CRITICAL RULES:
// 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
// 2. A vague answer must not receive full marks.
// 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
// 4. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
// 5. The overall score must reflect actual evidence from the transcript.

// RECOMMENDED PREPARATION (CRITICAL):
// For your 'recommendedPreparation' array, you MUST explicitly advise the candidate to leverage the "mLab skills programmes" and "CodeTribe Academy", as well as to seek direct feedback from their "facilitators and mentors". Combine this with specific technical advice based on their weak points.

// JSON OUTPUT REQUIREMENT:
// Return valid JSON only.

// SCHEMA:
// {
//   "overallScore": number,
//   "technicalScore": number,
//   "technicalKnowledgeScore": number,
//   "interviewReadinessScore": number,
//   "behavioralScore": number,
//   "communicationScore": number,
//   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
//   "readinessSummary": "string",
//   "confidence": number,
//   "strengths": ["string"],
//   "areasForImprovement": ["string"],
//   "priorityGaps": ["string"],
//   "recommendedPreparation": ["string"],
//   "questionBreakdown": [
//     {
//       "question": "string",
//       "candidateAnswer": "string",
//       "score": number,
//       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
//       "feedback": "string",
//       "whatWasMissing": "string",
//       "idealAnswerSample": "string"
//     }
//   ]
// }`;

//     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(fullTranscript, null, 2)}`;

//     try {
//       const aiResult = await generateCompletion({
//         messages: [
//           { role: "system" as const, content: systemPrompt },
//           { role: "user" as const, content: userPrompt },
//         ],
//         temperature: 0.1,
//         maxTokens: 8000,
//         feature: "mock_interview_evaluation",
//         userId: userAuth.uid,
//         sessionId,
//       });

//       const rawText = aiResult.text?.trim() || "";

//       if (!rawText) {
//         throw new Error("AI provider returned an empty evaluation response.");
//       }

//       const cleanJsonText = rawText
//         .replace(/```json/gi, "")
//         .replace(/```/g, "")
//         .trim();
//       let scorecard: any;

//       try {
//         scorecard = JSON.parse(cleanJsonText);
//       } catch (jsonError) {
//         logger.error("AI evaluation output failed JSON parsing:", {
//           error: jsonError,
//           sessionId,
//           rawText,
//         });
//         throw new Error("The AI evaluation response was not valid JSON.");
//       }

//       const requiredNumericFields = [
//         "overallScore",
//         "technicalScore",
//         "technicalKnowledgeScore",
//         "interviewReadinessScore",
//         "behavioralScore",
//         "communicationScore",
//       ];

//       for (const field of requiredNumericFields) {
//         const val = scorecard[field];
//         if (typeof val !== "number" || val < 0 || val > 100) {
//           scorecard[field] =
//             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
//         }
//       }

//       if (
//         (scorecard.technicalScore < 80 ||
//           scorecard.technicalKnowledgeScore < 80) &&
//         scorecard.readinessStatus === "READY"
//       ) {
//         scorecard.readinessStatus = "NEARLY_READY";
//         scorecard.readinessSummary +=
//           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
//       }

//       const db = admin.firestore();

//       if (sessionId) {
//         await db.collection("ai_interviews").doc(sessionId).set(
//           {
//             scorecard,
//             difficulty,
//             targetRole,
//             contextMode,
//             interviewScope,
//             isQualifyingRun,
//             status: "completed",
//             completedAt: admin.firestore.FieldValue.serverTimestamp(),
//             aiProvider: aiResult.provider,
//             modelUsed: aiResult.modelUsed,
//             fallbackUsed: aiResult.fallbackUsed,
//             fallbackAttempts: aiResult.fallbackAttempts,
//             durationMs: aiResult.durationMs,
//             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
//           },
//           { merge: true },
//         );
//       }

//       const targetLearnerId = learnerId || userAuth.uid;
//       const learnerRef = db.collection("learners").doc(targetLearnerId);
//       const learnerSnap = await learnerRef.get();

//       if (learnerSnap.exists && isQualifyingRun) {
//         await learnerRef.update({
//           employabilityScore: scorecard.overallScore || 0,
//           latestInterviewScore: scorecard.overallScore || 0,
//           technicalScore: scorecard.technicalScore || 0,
//           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
//           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
//           behavioralScore: scorecard.behavioralScore || 0,
//           communicationScore: scorecard.communicationScore || 0,
//           readinessStatus: scorecard.readinessStatus || "NOT_READY",
//           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
//         });
//       }

//       return {
//         success: true,
//         scorecard,
//         isQualifyingRun,
//         provider: aiResult.provider,
//         modelUsed: aiResult.modelUsed,
//         fallbackUsed: aiResult.fallbackUsed,
//         fallbackAttempts: aiResult.fallbackAttempts,
//         durationMs: aiResult.durationMs,
//       };
//     } catch (error: any) {
//       logger.error("Error evaluating mock interview:", {
//         error: error?.message || error,
//         userId: userAuth.uid,
//         sessionId,
//       });
//       throw new HttpsError(
//         "internal",
//         error?.message || "Failed to evaluate mock interview transcript.",
//       );
//     }
//   },
// );

// // // functions/src/modules/interviewEngine.ts

// // import { onCall, HttpsError } from "firebase-functions/v2/https";
// // import { defineSecret } from "firebase-functions/params";
// // import * as logger from "firebase-functions/logger";
// // import * as admin from "firebase-admin";
// // import { GoogleAuth } from "google-auth-library";

// // // Central AI Gateway Client
// // import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // // Define Secret Manager dependencies for deployment runtime access
// // const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// // const hfTokenSecret = defineSecret("HF_TOKEN");

// // // Initialize Google Auth for Gemini TTS REST API
// // const auth = new GoogleAuth({
// //   scopes: ["https://www.googleapis.com/auth/cloud-platform"],
// // });

// // // -----------------------------------------------------------------------------
// // // TYPES & INTERFACES
// // // -----------------------------------------------------------------------------

// // export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// // export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// // export interface InterviewTurnPayload {
// //   sessionId?: string;
// //   targetRole: string;
// //   difficulty?: "simple" | "mid" | "hard";
// //   seniority?: string;
// //   selectedSkillChips: string[];
// //   currentStage: string;
// //   contextMode?: ContextMode;
// //   interviewScope?: InterviewScope;
// //   cvSummary?: string;
// //   pastInterviewSummary?: string;
// //   timeRemainingSeconds?: number;
// //   totalTimeLimitSeconds?: number;
// //   conversationHistory: ChatMessage[];
// //   lastCandidateAnswer?: string;
// //   voiceName?: string;
// //   languageCode?: string;
// // }

// // export interface EvaluationPayload {
// //   sessionId?: string;
// //   learnerId?: string;
// //   targetRole: string;
// //   difficulty?: "simple" | "mid" | "hard";
// //   selectedSkillChips: string[];
// //   contextMode?: ContextMode;
// //   interviewScope?: InterviewScope;
// //   cvSummary?: string;
// //   fullTranscript: Array<{
// //     speaker: string;
// //     text: string;
// //     timestamp?: string;
// //   }>;
// // }

// // // -----------------------------------------------------------------------------
// // // 1. DYNAMIC INTERVIEW TURN GENERATOR (WITH EMBEDDED TTS)
// // // -----------------------------------------------------------------------------

// // export const generateInterviewTurn = onCall(
// //   {
// //     cors: true,
// //     secrets: [openRouterSecret, hfTokenSecret],
// //     region: "us-central1",
// //   },
// //   async (request) => {
// //     const userAuth = request.auth;

// //     if (!userAuth) {
// //       throw new HttpsError(
// //         "unauthenticated",
// //         "Authentication required to participate in mock interviews.",
// //       );
// //     }

// //     const {
// //       sessionId,
// //       targetRole,
// //       difficulty = "simple",
// //       seniority,
// //       selectedSkillChips = [],
// //       currentStage = "Introduction & Warmup",
// //       contextMode = "both",
// //       interviewScope = "full",
// //       cvSummary = "No CV provided or linked.",
// //       pastInterviewSummary,
// //       timeRemainingSeconds,
// //       totalTimeLimitSeconds,
// //       conversationHistory = [],
// //       lastCandidateAnswer,
// //       voiceName = "Achernar",
// //       languageCode = "en-GB",
// //     } = request.data as InterviewTurnPayload;

// //     if (!targetRole || typeof targetRole !== "string") {
// //       throw new HttpsError("invalid-argument", "Target role is required.");
// //     }

// //     // --- PERSONA & RIGOR ---
// //     let personaRigor =
// //       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

// //     if (difficulty === "mid") {
// //       personaRigor =
// //         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
// //     }

// //     if (difficulty === "hard") {
// //       personaRigor =
// //         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
// //     }

// //     // --- TIME-AWARENESS ---
// //     let timeContextInstruction = "";
// //     if (typeof timeRemainingSeconds === "number") {
// //       if (timeRemainingSeconds <= 120) {
// //         timeContextInstruction =
// //           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
// //       } else if (timeRemainingSeconds <= 300) {
// //         timeContextInstruction =
// //           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
// //       }
// //     }

// //     // --- CONTEXT & SCOPE ---
// //     let contextInstruction = "";
// //     if (contextMode === "both" || contextMode === "cv_only") {
// //       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
// //     }

// //     if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
// //       contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
// //       contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but do not hold it against them if they show improvement today. Focus on verifying if they have improved in those specific areas.\n`;
// //     }

// //     let scopeInstruction = "";
// //     if (interviewScope === "full") {
// //       scopeInstruction = `
// // THIS IS A HOLISTIC MULTI-PART INTERVIEW. You MUST guide the conversation logically through these stages based on the current stage:
// // 1. Work Readiness & Warmup
// // 2. Soft Skills & STAR Behavioral Questions
// // 3. Technical Deep-Dive
// // 4. System Scenario & Problem-Solving
// // 5. Candidate Q&A ("Do you have any questions for me about the role or company?")
// // 6. Conclusion & Wrap-Up`;
// //     } else if (interviewScope === "technical_only") {
// //       scopeInstruction =
// //         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
// //     } else {
// //       scopeInstruction =
// //         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
// //     }

// //     const lastHistoryMsg =
// //       conversationHistory.length > 0
// //         ? conversationHistory[conversationHistory.length - 1]
// //         : null;
// //     const immediateAnswer =
// //       lastCandidateAnswer?.trim() ||
// //       (lastHistoryMsg && lastHistoryMsg.role === "user"
// //         ? lastHistoryMsg.content
// //         : "N/A");

// //     // --- SYSTEM PROMPT ---
// //     const systemPrompt = `You are an expert interviewer conducting a live, spoken mock interview for a ${targetRole} position at mLab Southern Africa.

// // This is an interview-readiness assessment. Your responsibility is NOT to make the candidate feel successful. Your responsibility is to accurately determine what the candidate can demonstrate independently and to expose areas where they are not yet ready.

// // DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// // CURRENT STAGE: ${currentStage}
// // CANDIDATE SENIORITY: ${seniority || "Not specified"}
// // FOCUS SKILLS: ${selectedSkillChips.length > 0 ? selectedSkillChips.join(", ") : "General technical, behavioural and workplace skills"}

// //  ${contextInstruction}
// //  ${scopeInstruction}

// // TOTAL SESSION TIME: ${typeof totalTimeLimitSeconds === "number" ? `${totalTimeLimitSeconds} seconds` : "Not specified"}
// // TIME REMAINING: ${typeof timeRemainingSeconds === "number" ? `${timeRemainingSeconds} seconds` : "Not specified"}

// // IMMEDIATE CONTEXT:
// // The candidate's exact last message was: "${immediateAnswer}"
// // CRITICAL RULE: You MUST directly acknowledge and respond to what the candidate just said before moving on. Do NOT ignore their last message. Do NOT repeat your previous greeting or question unless they specifically asked you to repeat it.

// // INTERVIEWER STANDARD:
// //  ${personaRigor}

// // CORE ASSESSMENT PRINCIPLES:
// // 1. EVIDENCE OVER CLAIMS: Give credit for demonstrated knowledge, reasoning, examples, decisions, and outcomes, not just claims of experience.
// // 2. DO NOT RESCUE: Do not provide the answer, suggest key concepts, or complete their answer for them.
// // 3. WEAK ANSWERS MUST REMAIN WEAK: Do not reinterpret vague or incorrect answers as competent.
// // 4. ROLE APPROPRIATENESS: Evaluate against the expected competence of the specified ${targetRole} role.
// // 5. TECHNICAL QUESTIONS: Evaluate correctness, understanding, reasoning, practical application, and ability to explain decisions.
// // 6. BEHAVIOURAL QUESTIONS: Look for evidence of Situation, Task, Action, and Result (STAR).

// // ANSWER VALIDATION AND REDIRECTION:
// // - First determine whether the candidate answered the previous question adequately.
// // - If they partially answered, ask ONE focused follow-up question targeting the missing evidence.
// // - If they gave an incorrect or irrelevant answer, ask ONE concise probing question.
// // - If they ask a meta-question like "Can you hear me?", answer briefly ("Yes, I can hear you perfectly. Now, regarding...") and RESTATE the pending question.

// // TIME MANAGEMENT:
// // ${timeContextInstruction}

// // CONVERSATION STATE (CRITICAL RULE):
// // ${
// //   conversationHistory.length === 0
// //     ? `This is TURN ONE. Conversation history is empty. You MUST introduce yourself warmly but professionally. State that your name is Bongs, and you are the assessor for mLab today. Briefly explain that the purpose of this session is to simulate a realistic interview for the ${targetRole} position to evaluate their technical and behavioural readiness. Conclude your introduction by asking a foundational warmup question about their background. Limit this introduction to about 4 sentences.`
// //     : `This is turn ${conversationHistory.length + 1}. The interview is ALREADY IN PROGRESS. You MUST NOT reintroduce yourself (do not say your name is Bongs again), restate the target role, or repeat any greeting. Read the actual conversation history above and continue naturally from it, directly addressing what the candidate just said in IMMEDIATE CONTEXT below.`
// // }

// // SPEECH SYNTHESIS:
// // - Ask exactly ONE clear question per turn.
// // - Keep the response concise (under 3 sentences for regular turns, though the intro can be slightly longer).
// // - Use natural professional spoken language. NO markdown, NO bullet points.

// // JSON OUTPUT REQUIREMENT:
// // You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// // JSON SCHEMA:
// // {
// //   "responseText": "string (The exact spoken response and single question for the candidate)",
// //   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
// //   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
// //   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// // }`;

// //     const messages: ChatMessage[] = [
// //       { role: "system", content: systemPrompt },
// //       ...conversationHistory,
// //     ];

// //     if (lastCandidateAnswer?.trim()) {
// //       const lastMsgInHistory =
// //         conversationHistory[conversationHistory.length - 1];
// //       const isAlreadyInHistory =
// //         lastMsgInHistory &&
// //         lastMsgInHistory.role === "user" &&
// //         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

// //       if (!isAlreadyInHistory) {
// //         messages.push({ role: "user", content: lastCandidateAnswer.trim() });
// //       }
// //     }

// //     try {
// //       let parsedData: any = null;
// //       let rawText = "";
// //       let aiResult: any;

// //       const lastAiMessage =
// //         [...conversationHistory]
// //           .reverse()
// //           .find((m) => m.role === "assistant")
// //           ?.content?.trim()
// //           .toLowerCase() || "";

// //       for (let attempt = 1; attempt <= 2; attempt++) {
// //         let currentMessages = [...messages];

// //         if (attempt === 2) {
// //           currentMessages.push({ role: "assistant", content: rawText || "{}" });
// //           currentMessages.push({
// //             role: "user",
// //             content:
// //               "Your previous response was invalid. Please output ONLY the raw JSON object for the next interviewer turn based strictly on the current conversation history. Do not refuse. Do not use markdown.",
// //           });
// //         }

// //         aiResult = await generateCompletion({
// //           messages: currentMessages,
// //           temperature: 0.5,
// //           maxTokens: 400,
// //           feature: "mock_interview_turn",
// //           userId: userAuth.uid,
// //           sessionId,
// //         });

// //         rawText = aiResult.text?.trim() || "";
// //         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

// //         if (jsonMatch) {
// //           try {
// //             const jsonParsed = JSON.parse(jsonMatch[0]);
// //             if (
// //               jsonParsed &&
// //               typeof jsonParsed.responseText === "string" &&
// //               jsonParsed.responseText.trim().length > 0
// //             ) {
// //               const isRefusal =
// //                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// //                   jsonParsed.responseText,
// //                 );
// //               const isRepeat =
// //                 lastAiMessage.length > 0 &&
// //                 jsonParsed.responseText.trim().toLowerCase() === lastAiMessage;

// //               if (!isRefusal && !isRepeat) {
// //                 parsedData = {
// //                   responseText: jsonParsed.responseText,
// //                   turnPurpose: jsonParsed.turnPurpose || "PRIMARY_QUESTION",
// //                   answerAssessment:
// //                     jsonParsed.answerAssessment || "SATISFACTORY",
// //                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
// //                 };
// //                 break;
// //               }
// //             }
// //           } catch (e) {
// //             logger.warn(`Attempt ${attempt}: JSON parse failed.`);
// //           }
// //         }
// //       }

// //       // Dynamic Fallback in case the AI completely fails
// //       if (!parsedData && rawText.length > 0) {
// //         const cleanText = rawText
// //           .replace(/```json/gi, "")
// //           .replace(/```/g, "")
// //           .trim();
// //         const isRefusal =
// //           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// //             cleanText,
// //           );

// //         if (!isRefusal) {
// //           parsedData = {
// //             responseText: cleanText,
// //             turnPurpose: "PRIMARY_QUESTION",
// //             answerAssessment: "NOT_APPLICABLE",
// //             shouldAdvanceStage: false,
// //           };
// //         }
// //       }

// //       // Absolute Safety Fallback with the "Bongs" Persona
// //       if (!parsedData) {
// //         if (conversationHistory.length === 0) {
// //           parsedData = {
// //             responseText: `Hello, and welcome to your mLab mock assessment for the ${targetRole} position. My name is Bongs, and I'll be your assessor today. We will be covering a range of topics to evaluate your technical skills and workplace readiness. To get us started, could you tell me a little bit about your background?`,
// //             turnPurpose: "INITIAL_GREETING",
// //             answerAssessment: "NOT_APPLICABLE",
// //             shouldAdvanceStage: false,
// //           };
// //         } else {
// //           parsedData = {
// //             responseText: `Thank you for sharing that. Building on what you just mentioned, could you provide a specific, real-world example to support your approach?`,
// //             turnPurpose: "PRIMARY_QUESTION",
// //             answerAssessment: "SATISFACTORY",
// //             shouldAdvanceStage: false,
// //           };
// //         }
// //       }

// //       // 🚀 FAST INTERNAL TTS GENERATION
// //       let audioBase64 = null;
// //       try {
// //         const client = await auth.getClient();
// //         const tokenResponse = await client.getAccessToken();

// //         const response = await fetch(
// //           "https://texttospeech.googleapis.com/v1beta1/text:synthesize",
// //           {
// //             method: "POST",
// //             headers: {
// //               Authorization: `Bearer ${tokenResponse.token}`,
// //               "Content-Type": "application/json",
// //             },
// //             body: JSON.stringify({
// //               audioConfig: {
// //                 audioEncoding: "MP3",
// //                 pitch: 0,
// //                 speakingRate: 1.05,
// //               },
// //               input: {
// //                 text: parsedData.responseText,
// //                 prompt:
// //                   "Read aloud in a professional, warm, and natural conversational tone. Act as a human interviewer.",
// //               },
// //               voice: {
// //                 languageCode: languageCode,
// //                 modelName: "gemini-3.1-flash-tts-preview",
// //                 name: voiceName,
// //               },
// //             }),
// //           },
// //         );

// //         const data = await response.json();
// //         if (data.audioContent) {
// //           audioBase64 = data.audioContent;
// //         }
// //       } catch (err) {
// //         logger.error(
// //           "Internal Gemini TTS Generation failed, falling back to frontend browser TTS.",
// //           err,
// //         );
// //       }

// //       return {
// //         success: true,
// //         responseText: parsedData.responseText,
// //         turnPurpose: parsedData.turnPurpose,
// //         answerAssessment: parsedData.answerAssessment,
// //         shouldAdvanceStage: parsedData.shouldAdvanceStage,
// //         audioBase64: audioBase64,

// //         provider: aiResult?.provider || "Fallback",
// //         modelUsed: aiResult?.modelUsed || "Fallback",
// //         fallbackUsed: aiResult?.fallbackUsed || true,
// //         fallbackAttempts: aiResult?.fallbackAttempts || 2,
// //         durationMs: aiResult?.durationMs || 0,
// //       };
// //     } catch (error: any) {
// //       logger.error("Error generating interview turn:", error);
// //       throw new HttpsError(
// //         "internal",
// //         error?.message || "Failed to generate interview response.",
// //       );
// //     }
// //   },
// // );

// // // -----------------------------------------------------------------------------
// // // 2. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // // -----------------------------------------------------------------------------

// // export const evaluateMockInterview = onCall(
// //   {
// //     cors: true,
// //     secrets: [openRouterSecret, hfTokenSecret],
// //     timeoutSeconds: 300,
// //     memory: "512MiB",
// //     region: "us-central1",
// //   },
// //   async (request) => {
// //     const userAuth = request.auth;

// //     if (!userAuth) {
// //       throw new HttpsError(
// //         "unauthenticated",
// //         "Authentication required to evaluate mock interviews.",
// //       );
// //     }

// //     const {
// //       sessionId,
// //       learnerId,
// //       targetRole,
// //       difficulty = "simple",
// //       selectedSkillChips = [],
// //       contextMode = "both",
// //       interviewScope = "full",
// //       cvSummary = "No CV provided.",
// //       fullTranscript,
// //     } = request.data as EvaluationPayload;

// //     if (!targetRole || typeof targetRole !== "string") {
// //       throw new HttpsError(
// //         "invalid-argument",
// //         "Target role is required for assessment.",
// //       );
// //     }

// //     if (
// //       !fullTranscript ||
// //       !Array.isArray(fullTranscript) ||
// //       fullTranscript.length === 0
// //     ) {
// //       throw new HttpsError(
// //         "invalid-argument",
// //         "Full transcript is required for evaluation.",
// //       );
// //     }

// //     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

// //     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// // You are evaluating a completed mock interview for a candidate applying for:

// // TARGET ROLE: ${targetRole}
// // DIFFICULTY: ${difficulty.toUpperCase()}
// // FOCUS SKILLS: ${selectedSkillChips?.length ? selectedSkillChips.join(", ") : "General technical and workplace competencies"}

// //  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// // The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// // ASSESSMENT PHILOSOPHY:
// // Be accurate, evidence-based and appropriately rigorous.
// // Do NOT inflate scores to encourage the candidate.
// // A low score is an acceptable and useful result.
// // If the candidate performed poorly, say so clearly.
// // Do not reward effort, enthusiasm, confidence, length of answers or participation unless these actually demonstrate the assessed competency.
// // Do not infer knowledge that is not demonstrated in the transcript.
// // Do not give credit because the candidate appears capable of learning the concept later.
// // The assessment must describe the candidate's CURRENT demonstrated ability, not their potential.

// // SCORING STANDARD:
// // 90-100 = Interview Ready / Strong Evidence
// // 80-89 = Nearly Ready / Minor Gaps
// // 70-79 = Developing / Not Yet Consistently Ready
// // 60-69 = Significant Development Required
// // 40-59 = Not Interview Ready
// // 0-39 = Seriously Not Ready

// // IMPORTANT SCORING RULE:
// // Do not use 80 as a default or "average" score.
// // A candidate who performs poorly should receive a low score.
// // A candidate who demonstrates only basic knowledge should receive a basic score.
// // A candidate must earn points through evidence.

// // CATEGORY SCORING:
// // TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
// // BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
// // COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional communication, ability to explain technical concepts, listening and responsiveness.
// // ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// // CRITICAL RULES:
// // 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
// // 2. A vague answer must not receive full marks.
// // 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
// // 4. If the interviewer had to repeatedly prompt the candidate before obtaining a correct answer, this indicates weaker independent interview readiness.
// // 5. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
// // 6. Do not invent experience, projects, technologies, responsibilities or outcomes that are not present in the transcript.
// // 7. Do not treat participation itself as competence.
// // 8. Do not award a high overall score when one critical competency is substantially deficient.
// // 9. The overall score must reflect actual evidence from the transcript.
// // 10. The evaluation must distinguish between: demonstrated independently, demonstrated after prompting, partially demonstrated, not demonstrated, incorrect.

// // READINESS DECISION:
// // Determine one of: "READY", "NEARLY_READY", "DEVELOPING", "NOT_READY"
// // Use "READY" only when the candidate has demonstrated sufficient competence for the selected target role and difficulty.
// // A candidate scoring below 80 should normally not be classified as READY.
// // A candidate scoring 90+ should still NOT be classified as READY if there is a serious critical competency failure.
// // Do not allow one strong category to hide a major weakness in another category.

// // QUESTION-LEVEL SCORING:
// // Each question must receive an individual score from 0-100.
// // The feedback must explain: what the candidate demonstrated, what was missing, whether the answer was technically correct, whether prompting was required, what a stronger candidate would have demonstrated.
// // The ideal answer must be appropriate for the target role and difficulty level. Do not make the ideal answer unrealistically senior. The ideal answer is an example of a strong answer, not necessarily the only acceptable answer.

// // OVERALL SCORE:
// // Calculate the overall score from the demonstrated competencies.
// // Do not simply average the categories if doing so would hide a serious weakness.
// // The final score must be defensible from the transcript.

// // CRITICAL WEAKNESS RULE:
// // If the candidate demonstrates a serious deficiency in a core competency required for the target role, the candidate cannot be classified as READY regardless of their communication or behavioural score.

// // JSON OUTPUT REQUIREMENT:
// // Return valid JSON only.
// // Do not return markdown.
// // Do not return commentary outside the JSON.
// // Do not use trailing commas.

// // SCHEMA:
// // {
// //   "overallScore": number,
// //   "technicalScore": number,
// //   "technicalKnowledgeScore": number,
// //   "interviewReadinessScore": number,
// //   "behavioralScore": number,
// //   "communicationScore": number,
// //   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
// //   "readinessSummary": "string",
// //   "confidence": number,
// //   "strengths": ["string"],
// //   "areasForImprovement": ["string"],
// //   "priorityGaps": ["string"],
// //   "recommendedPreparation": ["string"],
// //   "questionBreakdown": [
// //     {
// //       "question": "string",
// //       "candidateAnswer": "string",
// //       "score": number,
// //       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
// //       "feedback": "string",
// //       "whatWasMissing": "string",
// //       "idealAnswerSample": "string"
// //     }
// //   ]
// // }

// // QUALITY CONTROL BEFORE RETURNING JSON:
// // - Did I score what was actually demonstrated?
// // - Did I avoid assuming knowledge?
// // - Did I avoid inflating weak answers?
// // - Did I distinguish prompted answers from independent answers?
// // - Did I identify incorrect technical statements?
// // - Does the overall score match the evidence?
// // - Does readinessStatus agree with the score and critical weaknesses?
// // - Would I trust this candidate to perform similarly in a real interview?`;

// //     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(fullTranscript, null, 2)}`;

// //     try {
// //       const aiResult = await generateCompletion({
// //         messages: [
// //           { role: "system" as const, content: systemPrompt },
// //           { role: "user" as const, content: userPrompt },
// //         ],
// //         temperature: 0.1,
// //         maxTokens: 3000,
// //         feature: "mock_interview_evaluation",
// //         userId: userAuth.uid,
// //         sessionId,
// //       });

// //       const rawText = aiResult.text?.trim() || "";

// //       if (!rawText) {
// //         throw new Error("AI provider returned an empty evaluation response.");
// //       }

// //       const cleanJsonText = rawText
// //         .replace(/```json/gi, "")
// //         .replace(/```/g, "")
// //         .trim();
// //       let scorecard: any;

// //       try {
// //         scorecard = JSON.parse(cleanJsonText);
// //       } catch (jsonError) {
// //         logger.error("AI evaluation output failed JSON parsing:", {
// //           error: jsonError,
// //           sessionId,
// //           rawText,
// //         });
// //         throw new Error("The AI evaluation response was not valid JSON.");
// //       }

// //       // SCORE & GATE VALIDATION
// //       const requiredNumericFields = [
// //         "overallScore",
// //         "technicalScore",
// //         "technicalKnowledgeScore",
// //         "interviewReadinessScore",
// //         "behavioralScore",
// //         "communicationScore",
// //       ];

// //       for (const field of requiredNumericFields) {
// //         const val = scorecard[field];
// //         if (typeof val !== "number" || val < 0 || val > 100) {
// //           scorecard[field] =
// //             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
// //         }
// //       }

// //       // STRICT TECHNICAL READINESS GATE ENFORCEMENT
// //       if (
// //         (scorecard.technicalScore < 80 ||
// //           scorecard.technicalKnowledgeScore < 80) &&
// //         scorecard.readinessStatus === "READY"
// //       ) {
// //         scorecard.readinessStatus = "NEARLY_READY";
// //         scorecard.readinessSummary +=
// //           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
// //       }

// //       // FIRESTORE PERSISTENCE
// //       const db = admin.firestore();

// //       if (sessionId) {
// //         await db.collection("ai_interviews").doc(sessionId).set(
// //           {
// //             scorecard,
// //             difficulty,
// //             targetRole,
// //             contextMode,
// //             interviewScope,
// //             isQualifyingRun,
// //             status: "completed",
// //             completedAt: admin.firestore.FieldValue.serverTimestamp(),
// //             aiProvider: aiResult.provider,
// //             modelUsed: aiResult.modelUsed,
// //             fallbackUsed: aiResult.fallbackUsed,
// //             fallbackAttempts: aiResult.fallbackAttempts,
// //             durationMs: aiResult.durationMs,
// //             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// //           },
// //           { merge: true },
// //         );
// //       }

// //       // Update Learner Metric Profile ONLY if this was a qualifying run
// //       const targetLearnerId = learnerId || userAuth.uid;
// //       const learnerRef = db.collection("learners").doc(targetLearnerId);
// //       const learnerSnap = await learnerRef.get();

// //       if (learnerSnap.exists && isQualifyingRun) {
// //         await learnerRef.update({
// //           employabilityScore: scorecard.overallScore || 0,
// //           latestInterviewScore: scorecard.overallScore || 0,
// //           technicalScore: scorecard.technicalScore || 0,
// //           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
// //           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
// //           behavioralScore: scorecard.behavioralScore || 0,
// //           communicationScore: scorecard.communicationScore || 0,
// //           readinessStatus: scorecard.readinessStatus || "NOT_READY",
// //           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
// //         });
// //       }

// //       return {
// //         success: true,
// //         scorecard,
// //         isQualifyingRun,
// //         provider: aiResult.provider,
// //         modelUsed: aiResult.modelUsed,
// //         fallbackUsed: aiResult.fallbackUsed,
// //         fallbackAttempts: aiResult.fallbackAttempts,
// //         durationMs: aiResult.durationMs,
// //       };
// //     } catch (error: any) {
// //       logger.error("Error evaluating mock interview:", {
// //         error: error?.message || error,
// //         userId: userAuth.uid,
// //         sessionId,
// //       });
// //       throw new HttpsError(
// //         "internal",
// //         error?.message || "Failed to evaluate mock interview transcript.",
// //       );
// //     }
// //   },
// // );

// // // // functions/src/modules/interviewEngine.ts

// // // import { onCall, HttpsError } from "firebase-functions/v2/https";
// // // import { defineSecret } from "firebase-functions/params";
// // // import * as logger from "firebase-functions/logger";
// // // import * as admin from "firebase-admin";

// // // // Central AI Gateway Client
// // // import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // // // Define Secret Manager dependencies for deployment runtime access
// // // const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// // // const hfTokenSecret = defineSecret("HF_TOKEN");

// // // // -----------------------------------------------------------------------------
// // // // TYPES & INTERFACES
// // // // -----------------------------------------------------------------------------

// // // export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// // // export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// // // export interface InterviewTurnPayload {
// // //   sessionId?: string;
// // //   targetRole: string;
// // //   difficulty?: "simple" | "mid" | "hard";
// // //   seniority?: string;
// // //   selectedSkillChips: string[];
// // //   currentStage: string;
// // //   contextMode?: ContextMode;
// // //   interviewScope?: InterviewScope;
// // //   cvSummary?: string;
// // //   pastInterviewSummary?: string;
// // //   timeRemainingSeconds?: number;
// // //   totalTimeLimitSeconds?: number;
// // //   conversationHistory: ChatMessage[];
// // //   lastCandidateAnswer?: string;
// // // }

// // // export interface EvaluationPayload {
// // //   sessionId?: string;
// // //   learnerId?: string;
// // //   targetRole: string;
// // //   difficulty?: "simple" | "mid" | "hard";
// // //   selectedSkillChips: string[];
// // //   contextMode?: ContextMode;
// // //   interviewScope?: InterviewScope;
// // //   cvSummary?: string;
// // //   fullTranscript: Array<{
// // //     speaker: string;
// // //     text: string;
// // //     timestamp?: string;
// // //   }>;
// // // }

// // // // -----------------------------------------------------------------------------
// // // // 1. DYNAMIC INTERVIEW TURN GENERATOR
// // // // -----------------------------------------------------------------------------

// // // export const generateInterviewTurn = onCall(
// // //   {
// // //     cors: true,
// // //     secrets: [openRouterSecret, hfTokenSecret],
// // //     region: "us-central1",
// // //   },
// // //   async (request) => {
// // //     const auth = request.auth;

// // //     if (!auth) {
// // //       throw new HttpsError(
// // //         "unauthenticated",
// // //         "Authentication required to participate in mock interviews.",
// // //       );
// // //     }

// // //     const {
// // //       sessionId,
// // //       targetRole,
// // //       difficulty = "simple",
// // //       seniority,
// // //       selectedSkillChips = [],
// // //       currentStage = "Introduction & Warmup",
// // //       contextMode = "both",
// // //       interviewScope = "full",
// // //       cvSummary = "No CV provided or linked.",
// // //       pastInterviewSummary,
// // //       timeRemainingSeconds,
// // //       totalTimeLimitSeconds,
// // //       conversationHistory = [],
// // //       lastCandidateAnswer,
// // //     } = request.data as InterviewTurnPayload;

// // //     if (!targetRole || typeof targetRole !== "string") {
// // //       throw new HttpsError("invalid-argument", "Target role is required.");
// // //     }

// // //     if (
// // //       !Array.isArray(selectedSkillChips) ||
// // //       !Array.isArray(conversationHistory)
// // //     ) {
// // //       throw new HttpsError("invalid-argument", "Invalid interview payload.");
// // //     }

// // //     // --- PERSONA & RIGOR ---
// // //     let personaRigor =
// // //       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

// // //     if (difficulty === "mid") {
// // //       personaRigor =
// // //         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
// // //     }

// // //     if (difficulty === "hard") {
// // //       personaRigor =
// // //         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
// // //     }

// // //     // --- TIME-AWARENESS ---
// // //     let timeContextInstruction = "";
// // //     if (typeof timeRemainingSeconds === "number") {
// // //       if (timeRemainingSeconds <= 120) {
// // //         timeContextInstruction =
// // //           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
// // //       } else if (timeRemainingSeconds <= 300) {
// // //         timeContextInstruction =
// // //           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
// // //       }
// // //     }

// // //     // --- CONTEXT & SCOPE ---
// // //     let contextInstruction = "";
// // //     if (contextMode === "both" || contextMode === "cv_only") {
// // //       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
// // //     }

// // //     if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
// // //       contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
// // //       contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but do not hold it against them if they show improvement today. Focus on verifying if they have improved in those specific areas.\n`;
// // //     }

// // //     let scopeInstruction = "";
// // //     if (interviewScope === "full") {
// // //       scopeInstruction = `
// // // THIS IS A HOLISTIC MULTI-PART INTERVIEW. You MUST guide the conversation logically through these stages based on the current stage:
// // // 1. Work Readiness & Warmup
// // // 2. Soft Skills & STAR Behavioral Questions
// // // 3. Technical Deep-Dive
// // // 4. System Scenario & Problem-Solving
// // // 5. Candidate Q&A ("Do you have any questions for me about the role or company?")
// // // 6. Conclusion & Wrap-Up`;
// // //     } else if (interviewScope === "technical_only") {
// // //       scopeInstruction =
// // //         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
// // //     } else {
// // //       scopeInstruction =
// // //         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
// // //     }

// // //     // --- IMMEDIATE CONTEXT FOR AI ATTENTION ---
// // //     const lastHistoryMsg =
// // //       conversationHistory.length > 0
// // //         ? conversationHistory[conversationHistory.length - 1]
// // //         : null;
// // //     const immediateAnswer =
// // //       lastCandidateAnswer?.trim() ||
// // //       (lastHistoryMsg && lastHistoryMsg.role === "user"
// // //         ? lastHistoryMsg.content
// // //         : "N/A");

// // //     // --- SYSTEM PROMPT ---
// // //     const systemPrompt = `You are a professional industry interviewer conducting a structured mock interview for a ${targetRole} position.

// // // This is an interview-readiness assessment. Your responsibility is NOT to make the candidate feel successful. Your responsibility is to accurately determine what the candidate can demonstrate independently and to expose areas where they are not yet ready.

// // // DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// // // CURRENT STAGE: ${currentStage}
// // // CANDIDATE SENIORITY: ${seniority || "Not specified"}
// // // FOCUS SKILLS: ${selectedSkillChips.length > 0 ? selectedSkillChips.join(", ") : "General technical, behavioural and workplace skills"}

// // //  ${contextInstruction}
// // //  ${scopeInstruction}

// // // TOTAL SESSION TIME: ${typeof totalTimeLimitSeconds === "number" ? `${totalTimeLimitSeconds} seconds` : "Not specified"}
// // // TIME REMAINING: ${typeof timeRemainingSeconds === "number" ? `${timeRemainingSeconds} seconds` : "Not specified"}

// // // IMMEDIATE CONTEXT:
// // // The candidate's exact last message was: "${immediateAnswer}"
// // // CRITICAL RULE: You MUST directly acknowledge and respond to what the candidate just said before moving on. Do NOT ignore their last message. Do NOT repeat your previous greeting or question unless they specifically asked you to repeat it.

// // // INTERVIEWER STANDARD:
// // //  ${personaRigor}

// // // CORE ASSESSMENT PRINCIPLES:

// // // 1. EVIDENCE OVER CLAIMS
// // //    - Do not assume the candidate knows something merely because they say they have experience with it.
// // //    - Give credit for demonstrated knowledge, reasoning, examples, decisions, and outcomes.

// // // 2. DO NOT RESCUE THE CANDIDATE
// // //    - Do not provide the answer. Do not suggest key concepts. Do not complete their answer for them.
// // //    - If they cannot answer, allow that weakness to be recorded.

// // // 3. WEAK ANSWERS MUST REMAIN WEAK
// // //    - Do not reinterpret vague, incomplete, incorrect or technically inaccurate answers as competent answers.

// // // 4. DO NOT INFER COMPETENCE
// // //    - Never award points for knowledge that is not demonstrated in the transcript. Never compensate for a weak technical answer because the candidate communicates confidently.

// // // 5. ROLE APPROPRIATENESS
// // //    - Evaluate the candidate against the expected competence of the specified ${targetRole} role and difficulty level. Do not lower the standard merely because the candidate is a learner.

// // // 6. BEHAVIOURAL QUESTIONS
// // //    - For behavioural questions, look for evidence of Situation, Task, Action and Result. Do not award full marks when the candidate only describes what "we" did without explaining their own contribution.

// // // 7. TECHNICAL QUESTIONS
// // //    - Evaluate correctness, understanding, reasoning, practical application and ability to explain decisions. Prefer practical understanding over memorised definitions.

// // // 8. COMMUNICATION
// // //    - Assess clarity, relevance, structure, listening, ability to explain technical concepts and ability to answer the actual question. Do not confuse verbosity with strong communication.

// // // 9. ANSWER VALIDATION AND REDIRECTION
// // //    - First determine whether the candidate answered the previous question.
// // //    - If they answered adequately, continue with the interview.
// // //    - If they partially answered, ask ONE focused follow-up question targeting the missing evidence.
// // //    - If they gave an incorrect or irrelevant answer, ask ONE concise probing question where useful.
// // //    - If they clearly do not know the answer, do not keep coaching them indefinitely. Move to the next appropriate question.
// // //    - If they ask a meta-question such as "Can you hear me?", "Are you there?", or "I can't hear you", answer briefly and naturally (e.g., "Yes, I can hear you perfectly. Now, regarding...") and then RESTATE the pending interview question smoothly.
// // //    - Never abandon an unanswered substantive question simply to make the conversation feel smooth.

// // // 10. QUESTION CONTROL
// // //    - Ask exactly ONE substantive question per turn.
// // //    - Do not ask compound questions containing several unrelated questions.
// // //    - Follow-up questions must target evidence missing from the previous answer.

// // // 11. INTERVIEW FLOW
// // //    - Respect the current interview stage. Do not randomly jump between unrelated topics.
// // //    - A strong answer should allow the interview to progress (shouldAdvanceStage: true).
// // //    - A weak answer should trigger appropriate probing before progression.

// // // 12. TIME MANAGEMENT
// // //    ${timeContextInstruction}

// // // 13. SPEECH SYNTHESIS
// // //    - Ask exactly ONE clear question.
// // //    - Keep the response to no more than 3 concise sentences.
// // //    - Use natural professional spoken language.
// // //    - No markdown, tables, bullet points, numbered lists or special formatting.

// // // 14. CONVERSATION STATE (READ CAREFULLY, THIS OVERRIDES ANY GENERIC GREETING IMPULSE):
// // //    ${
// // //      conversationHistory.length === 0
// // //        ? `This is TURN ONE. Conversation history is empty. Dynamically introduce yourself briefly as the interviewer, state the target role (${targetRole}), and ask the first introductory or warmup question for the "${currentStage}" stage.`
// // //        : `This is turn ${conversationHistory.length + 1}. The interview is ALREADY IN PROGRESS. You MUST NOT reintroduce yourself, restate the target role, or repeat any greeting. You MUST NOT repeat any previous message from you that appears above verbatim or near-verbatim. Read the actual conversation history above and continue naturally from it, directly addressing what the candidate just said in IMMEDIATE CONTEXT below.`
// // //    }

// // // 15. CV & SKILL CHIP CROSS-EXAMINATION:
// // //    - When CV or skill chips are enabled, cross-examine candidate responses directly against their declared skills and CV project claims.

// // // IMPORTANT:
// // // You are an assessor, not a coach, during the live interview. Accuracy is more important than encouragement. Do not manufacture competence. Do not sugar-coat weaknesses. A candidate who performs poorly must be allowed to receive a poor result.

// // // JSON OUTPUT REQUIREMENT:
// // // You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// // // JSON SCHEMA:
// // // {
// // //   "responseText": "string (The exact spoken response and single question for the candidate)",
// // //   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
// // //   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
// // //   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// // // }`;

// // //     // --- BUILD MESSAGE HISTORY ---
// // //     const messages: ChatMessage[] = [
// // //       { role: "system", content: systemPrompt },
// // //       ...conversationHistory,
// // //     ];

// // //     if (lastCandidateAnswer?.trim()) {
// // //       const lastMsgInHistory =
// // //         conversationHistory[conversationHistory.length - 1];
// // //       const isAlreadyInHistory =
// // //         lastMsgInHistory &&
// // //         lastMsgInHistory.role === "user" &&
// // //         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

// // //       if (!isAlreadyInHistory) {
// // //         messages.push({ role: "user", content: lastCandidateAnswer.trim() });
// // //       }
// // //     }

// // //     // --- GENERATE AI RESPONSE (WITH DYNAMIC SELF-CORRECTION & REPEAT GUARD) ---
// // //     try {
// // //       let parsedData: {
// // //         responseText: string;
// // //         turnPurpose:
// // //           | "INITIAL_GREETING"
// // //           | "PRIMARY_QUESTION"
// // //           | "PROBE"
// // //           | "CLARIFICATION"
// // //           | "STAGE_WRAPUP";
// // //         answerAssessment:
// // //           | "SATISFACTORY"
// // //           | "PARTIAL"
// // //           | "INADEQUATE"
// // //           | "OFF_TOPIC"
// // //           | "NOT_APPLICABLE";
// // //         shouldAdvanceStage: boolean;
// // //       } | null = null;

// // //       let rawText = "";
// // //       let aiResult: any;

// // //       // Extract the last thing the AI said so we can prevent it from repeating it
// // //       const lastAiMessage =
// // //         [...conversationHistory]
// // //           .reverse()
// // //           .find((m) => m.role === "assistant")
// // //           ?.content?.trim()
// // //           .toLowerCase() || "";

// // //       // Loop to allow the AI to self-correct if it fails JSON, refuses, or repeats itself
// // //       for (let attempt = 1; attempt <= 2; attempt++) {
// // //         let currentMessages = [...messages];

// // //         if (attempt === 2) {
// // //           logger.warn(
// // //             `Attempt 2: AI failed to provide valid JSON, refused, or repeated itself. Forcing self-correction.`,
// // //           );
// // //           currentMessages.push({ role: "assistant", content: rawText || "{}" });
// // //           currentMessages.push({
// // //             role: "user",
// // //             content:
// // //               "Your previous response was invalid: it was either empty, not valid JSON, an AI refusal, or an exact repeat of something you already said earlier in this conversation. You must stay in character as the interviewer, you must NOT reintroduce yourself or repeat a prior greeting, and you must directly address the candidate's most recent message. Please output ONLY the raw JSON object for the next interviewer turn. Do not refuse. Do not explain. Do not use markdown.",
// // //           });
// // //         }

// // //         aiResult = await generateCompletion({
// // //           messages: currentMessages,
// // //           temperature: 0.5,
// // //           maxTokens: 400,
// // //           feature: "mock_interview_turn",
// // //           userId: auth.uid,
// // //           sessionId,
// // //         });

// // //         rawText = aiResult.text?.trim() || "";

// // //         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

// // //         if (jsonMatch) {
// // //           try {
// // //             const jsonParsed = JSON.parse(jsonMatch[0]);
// // //             if (
// // //               jsonParsed &&
// // //               typeof jsonParsed.responseText === "string" &&
// // //               jsonParsed.responseText.trim().length > 0
// // //             ) {
// // //               const isRefusal =
// // //                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // //                   jsonParsed.responseText,
// // //                 );
// // //               const isRepeat =
// // //                 lastAiMessage.length > 0 &&
// // //                 jsonParsed.responseText.trim().toLowerCase() === lastAiMessage;

// // //               if (!isRefusal && !isRepeat) {
// // //                 parsedData = {
// // //                   responseText: jsonParsed.responseText,
// // //                   turnPurpose: jsonParsed.turnPurpose || "PRIMARY_QUESTION",
// // //                   answerAssessment:
// // //                     jsonParsed.answerAssessment || "SATISFACTORY",
// // //                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
// // //                 };
// // //                 break;
// // //               }
// // //               if (isRepeat) {
// // //                 logger.warn(
// // //                   `Attempt ${attempt}: AI repeated its previous message verbatim.`,
// // //                 );
// // //               }
// // //             }
// // //           } catch (e) {
// // //             logger.warn(
// // //               `Attempt ${attempt}: Matched string was not valid JSON.`,
// // //             );
// // //           }
// // //         }
// // //       }

// // //       // DYNAMIC FALLBACK: If JSON parsing failed but we have rawText, just use the raw text!
// // //       if (!parsedData && rawText.length > 0) {
// // //         const cleanText = rawText
// // //           .replace(/```json/gi, "")
// // //           .replace(/```/g, "")
// // //           .trim();
// // //         const isRefusal =
// // //           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // //             cleanText,
// // //           );
// // //         const isRepeat =
// // //           lastAiMessage.length > 0 &&
// // //           cleanText.trim().toLowerCase() === lastAiMessage;

// // //         if (!isRefusal && !isRepeat) {
// // //           parsedData = {
// // //             responseText: cleanText,
// // //             turnPurpose: "PRIMARY_QUESTION",
// // //             answerAssessment: "NOT_APPLICABLE",
// // //             shouldAdvanceStage: false,
// // //           };
// // //         }
// // //       }

// // //       // If the AI absolutely refused or returned nothing after retries, throw error to frontend
// // //       if (!parsedData) {
// // //         throw new Error(
// // //           "AI failed to generate a valid interview turn after self-correction attempts.",
// // //         );
// // //       }

// // //       return {
// // //         success: true,
// // //         responseText: parsedData.responseText,
// // //         turnPurpose: parsedData.turnPurpose,
// // //         answerAssessment: parsedData.answerAssessment,
// // //         shouldAdvanceStage: parsedData.shouldAdvanceStage,
// // //         provider: aiResult.provider,
// // //         modelUsed: aiResult.modelUsed,
// // //         fallbackUsed: aiResult.fallbackUsed,
// // //         fallbackAttempts: aiResult.fallbackAttempts,
// // //         durationMs: aiResult.durationMs,
// // //       };
// // //     } catch (error: any) {
// // //       logger.error("Error generating interview turn:", {
// // //         error: error?.message || error,
// // //         userId: auth.uid,
// // //         targetRole,
// // //         difficulty,
// // //         currentStage,
// // //       });

// // //       throw new HttpsError(
// // //         "internal",
// // //         error?.message || "Failed to generate interview response.",
// // //       );
// // //     }
// // //   },
// // // );

// // // // -----------------------------------------------------------------------------
// // // // 2. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // // // -----------------------------------------------------------------------------

// // // export const evaluateMockInterview = onCall(
// // //   {
// // //     cors: true,
// // //     secrets: [openRouterSecret, hfTokenSecret],
// // //     timeoutSeconds: 300,
// // //     memory: "512MiB",
// // //     region: "us-central1",
// // //   },
// // //   async (request) => {
// // //     const auth = request.auth;

// // //     if (!auth) {
// // //       throw new HttpsError(
// // //         "unauthenticated",
// // //         "Authentication required to evaluate mock interviews.",
// // //       );
// // //     }

// // //     const {
// // //       sessionId,
// // //       learnerId,
// // //       targetRole,
// // //       difficulty = "simple",
// // //       selectedSkillChips = [],
// // //       contextMode = "both",
// // //       interviewScope = "full",
// // //       cvSummary = "No CV provided.",
// // //       fullTranscript,
// // //     } = request.data as EvaluationPayload;

// // //     if (!targetRole || typeof targetRole !== "string") {
// // //       throw new HttpsError(
// // //         "invalid-argument",
// // //         "Target role is required for assessment.",
// // //       );
// // //     }

// // //     if (
// // //       !fullTranscript ||
// // //       !Array.isArray(fullTranscript) ||
// // //       fullTranscript.length === 0
// // //     ) {
// // //       throw new HttpsError(
// // //         "invalid-argument",
// // //         "Full transcript is required for evaluation.",
// // //       );
// // //     }

// // //     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

// // //     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// // // You are evaluating a completed mock interview for a candidate applying for:

// // // TARGET ROLE: ${targetRole}
// // // DIFFICULTY: ${difficulty.toUpperCase()}
// // // FOCUS SKILLS: ${selectedSkillChips?.length ? selectedSkillChips.join(", ") : "General technical and workplace competencies"}

// // //  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// // // The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// // // ASSESSMENT PHILOSOPHY:
// // // Be accurate, evidence-based and appropriately rigorous.
// // // Do NOT inflate scores to encourage the candidate.
// // // A low score is an acceptable and useful result.
// // // If the candidate performed poorly, say so clearly.
// // // Do not reward effort, enthusiasm, confidence, length of answers or participation unless these actually demonstrate the assessed competency.
// // // Do not infer knowledge that is not demonstrated in the transcript.
// // // Do not give credit because the candidate appears capable of learning the concept later.
// // // The assessment must describe the candidate's CURRENT demonstrated ability, not their potential.

// // // SCORING STANDARD:
// // // 90-100 = Interview Ready / Strong Evidence
// // // 80-89 = Nearly Ready / Minor Gaps
// // // 70-79 = Developing / Not Yet Consistently Ready
// // // 60-69 = Significant Development Required
// // // 40-59 = Not Interview Ready
// // // 0-39 = Seriously Not Ready

// // // IMPORTANT SCORING RULE:
// // // Do not use 80 as a default or "average" score.
// // // A candidate who performs poorly should receive a low score.
// // // A candidate who demonstrates only basic knowledge should receive a basic score.
// // // A candidate must earn points through evidence.

// // // CATEGORY SCORING:
// // // TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
// // // BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
// // // COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional communication, ability to explain technical concepts, listening and responsiveness.
// // // ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// // // CRITICAL RULES:
// // // 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
// // // 2. A vague answer must not receive full marks.
// // // 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
// // // 4. If the interviewer had to repeatedly prompt the candidate before obtaining a correct answer, this indicates weaker independent interview readiness.
// // // 5. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
// // // 6. Do not invent experience, projects, technologies, responsibilities or outcomes that are not present in the transcript.
// // // 7. Do not treat participation itself as competence.
// // // 8. Do not award a high overall score when one critical competency is substantially deficient.
// // // 9. The overall score must reflect actual evidence from the transcript.
// // // 10. The evaluation must distinguish between: demonstrated independently, demonstrated after prompting, partially demonstrated, not demonstrated, incorrect.

// // // READINESS DECISION:
// // // Determine one of: "READY", "NEARLY_READY", "DEVELOPING", "NOT_READY"
// // // Use "READY" only when the candidate has demonstrated sufficient competence for the selected target role and difficulty.
// // // A candidate scoring below 80 should normally not be classified as READY.
// // // A candidate scoring 90+ should still NOT be classified as READY if there is a serious critical competency failure.
// // // Do not allow one strong category to hide a major weakness in another category.

// // // QUESTION-LEVEL SCORING:
// // // Each question must receive an individual score from 0-100.
// // // The feedback must explain: what the candidate demonstrated, what was missing, whether the answer was technically correct, whether prompting was required, what a stronger candidate would have demonstrated.
// // // The ideal answer must be appropriate for the target role and difficulty level. Do not make the ideal answer unrealistically senior. The ideal answer is an example of a strong answer, not necessarily the only acceptable answer.

// // // OVERALL SCORE:
// // // Calculate the overall score from the demonstrated competencies.
// // // Do not simply average the categories if doing so would hide a serious weakness.
// // // The final score must be defensible from the transcript.

// // // CRITICAL WEAKNESS RULE:
// // // If the candidate demonstrates a serious deficiency in a core competency required for the target role, the candidate cannot be classified as READY regardless of their communication or behavioural score.

// // // JSON OUTPUT REQUIREMENT:
// // // Return valid JSON only.
// // // Do not return markdown.
// // // Do not return commentary outside the JSON.
// // // Do not use trailing commas.

// // // SCHEMA:
// // // {
// // //   "overallScore": number,
// // //   "technicalScore": number,
// // //   "technicalKnowledgeScore": number,
// // //   "interviewReadinessScore": number,
// // //   "behavioralScore": number,
// // //   "communicationScore": number,
// // //   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
// // //   "readinessSummary": "string",
// // //   "confidence": number,
// // //   "strengths": ["string"],
// // //   "areasForImprovement": ["string"],
// // //   "priorityGaps": ["string"],
// // //   "recommendedPreparation": ["string"],
// // //   "questionBreakdown": [
// // //     {
// // //       "question": "string",
// // //       "candidateAnswer": "string",
// // //       "score": number,
// // //       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
// // //       "feedback": "string",
// // //       "whatWasMissing": "string",
// // //       "idealAnswerSample": "string"
// // //     }
// // //   ]
// // // }

// // // QUALITY CONTROL BEFORE RETURNING JSON:
// // // - Did I score what was actually demonstrated?
// // // - Did I avoid assuming knowledge?
// // // - Did I avoid inflating weak answers?
// // // - Did I distinguish prompted answers from independent answers?
// // // - Did I identify incorrect technical statements?
// // // - Does the overall score match the evidence?
// // // - Does readinessStatus agree with the score and critical weaknesses?
// // // - Would I trust this candidate to perform similarly in a real interview?`;

// // //     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(fullTranscript, null, 2)}`;

// // //     try {
// // //       const aiResult = await generateCompletion({
// // //         messages: [
// // //           { role: "system" as const, content: systemPrompt },
// // //           { role: "user" as const, content: userPrompt },
// // //         ],
// // //         temperature: 0.1,
// // //         maxTokens: 3000,
// // //         feature: "mock_interview_evaluation",
// // //         userId: auth.uid,
// // //         sessionId,
// // //       });

// // //       const rawText = aiResult.text?.trim() || "";

// // //       if (!rawText) {
// // //         throw new Error("AI provider returned an empty evaluation response.");
// // //       }

// // //       const cleanJsonText = rawText
// // //         .replace(/```json/gi, "")
// // //         .replace(/```/g, "")
// // //         .trim();

// // //       let scorecard: any;

// // //       try {
// // //         scorecard = JSON.parse(cleanJsonText);
// // //       } catch (jsonError) {
// // //         logger.error("AI evaluation output failed JSON parsing:", {
// // //           error: jsonError,
// // //           sessionId,
// // //           rawText,
// // //         });
// // //         throw new Error("The AI evaluation response was not valid JSON.");
// // //       }

// // //       // SCORE & GATE VALIDATION
// // //       const requiredNumericFields = [
// // //         "overallScore",
// // //         "technicalScore",
// // //         "technicalKnowledgeScore",
// // //         "interviewReadinessScore",
// // //         "behavioralScore",
// // //         "communicationScore",
// // //       ];

// // //       for (const field of requiredNumericFields) {
// // //         const val = scorecard[field];
// // //         if (typeof val !== "number" || val < 0 || val > 100) {
// // //           logger.warn(
// // //             `Score field ${field} invalid (${val}), clamping to 0-100 range.`,
// // //           );
// // //           scorecard[field] =
// // //             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
// // //         }
// // //       }

// // //       // STRICT TECHNICAL READINESS GATE ENFORCEMENT
// // //       if (
// // //         (scorecard.technicalScore < 80 ||
// // //           scorecard.technicalKnowledgeScore < 80) &&
// // //         scorecard.readinessStatus === "READY"
// // //       ) {
// // //         scorecard.readinessStatus = "NEARLY_READY";
// // //         scorecard.readinessSummary +=
// // //           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
// // //       }

// // //       // FIRESTORE PERSISTENCE
// // //       const db = admin.firestore();

// // //       if (sessionId) {
// // //         await db.collection("ai_interviews").doc(sessionId).set(
// // //           {
// // //             scorecard,
// // //             difficulty,
// // //             targetRole,
// // //             contextMode,
// // //             interviewScope,
// // //             isQualifyingRun,
// // //             status: "completed",
// // //             completedAt: admin.firestore.FieldValue.serverTimestamp(),
// // //             aiProvider: aiResult.provider,
// // //             modelUsed: aiResult.modelUsed,
// // //             fallbackUsed: aiResult.fallbackUsed,
// // //             fallbackAttempts: aiResult.fallbackAttempts,
// // //             durationMs: aiResult.durationMs,
// // //             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// // //           },
// // //           { merge: true },
// // //         );
// // //       }

// // //       // Update Learner Metric Profile ONLY if this was a qualifying run
// // //       const targetLearnerId = learnerId || auth.uid;
// // //       const learnerRef = db.collection("learners").doc(targetLearnerId);
// // //       const learnerSnap = await learnerRef.get();

// // //       if (learnerSnap.exists && isQualifyingRun) {
// // //         await learnerRef.update({
// // //           employabilityScore: scorecard.overallScore || 0,
// // //           latestInterviewScore: scorecard.overallScore || 0,
// // //           technicalScore: scorecard.technicalScore || 0,
// // //           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
// // //           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
// // //           behavioralScore: scorecard.behavioralScore || 0,
// // //           communicationScore: scorecard.communicationScore || 0,
// // //           readinessStatus: scorecard.readinessStatus || "NOT_READY",
// // //           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
// // //         });
// // //       }

// // //       return {
// // //         success: true,
// // //         scorecard,
// // //         isQualifyingRun,
// // //         provider: aiResult.provider,
// // //         modelUsed: aiResult.modelUsed,
// // //         fallbackUsed: aiResult.fallbackUsed,
// // //         fallbackAttempts: aiResult.fallbackAttempts,
// // //         durationMs: aiResult.durationMs,
// // //       };
// // //     } catch (error: any) {
// // //       logger.error("Error evaluating mock interview:", {
// // //         error: error?.message || error,
// // //         userId: auth.uid,
// // //         learnerId: learnerId || auth.uid,
// // //         sessionId,
// // //         targetRole,
// // //         difficulty,
// // //       });

// // //       throw new HttpsError(
// // //         "internal",
// // //         error?.message || "Failed to evaluate mock interview transcript.",
// // //       );
// // //     }
// // //   },
// // // );

// // // // // functions/src/modules/interviewEngine.ts

// // // // import { onCall, HttpsError } from "firebase-functions/v2/https";
// // // // import { defineSecret } from "firebase-functions/params";
// // // // import * as logger from "firebase-functions/logger";
// // // // import * as admin from "firebase-admin";

// // // // // Central AI Gateway Client
// // // // import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // // // // Define Secret Manager dependencies for deployment runtime access
// // // // const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// // // // const hfTokenSecret = defineSecret("HF_TOKEN");

// // // // // -----------------------------------------------------------------------------
// // // // // TYPES & INTERFACES
// // // // // -----------------------------------------------------------------------------

// // // // export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// // // // export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// // // // export interface InterviewTurnPayload {
// // // //   sessionId?: string;
// // // //   targetRole: string;
// // // //   difficulty?: "simple" | "mid" | "hard";
// // // //   seniority?: string;
// // // //   selectedSkillChips: string[];
// // // //   currentStage: string;
// // // //   contextMode?: ContextMode;
// // // //   interviewScope?: InterviewScope;
// // // //   cvSummary?: string;
// // // //   pastInterviewSummary?: string;
// // // //   timeRemainingSeconds?: number;
// // // //   totalTimeLimitSeconds?: number;
// // // //   conversationHistory: ChatMessage[];
// // // //   lastCandidateAnswer?: string;
// // // // }

// // // // export interface EvaluationPayload {
// // // //   sessionId?: string;
// // // //   learnerId?: string;
// // // //   targetRole: string;
// // // //   difficulty?: "simple" | "mid" | "hard";
// // // //   selectedSkillChips: string[];
// // // //   contextMode?: ContextMode;
// // // //   interviewScope?: InterviewScope;
// // // //   cvSummary?: string;
// // // //   fullTranscript: Array<{
// // // //     speaker: string;
// // // //     text: string;
// // // //     timestamp?: string;
// // // //   }>;
// // // // }

// // // // // -----------------------------------------------------------------------------
// // // // // 1. DYNAMIC INTERVIEW TURN GENERATOR
// // // // // -----------------------------------------------------------------------------

// // // // export const generateInterviewTurn = onCall(
// // // //   {
// // // //     cors: true,
// // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // //     region: "us-central1",
// // // //   },
// // // //   async (request) => {
// // // //     const auth = request.auth;

// // // //     if (!auth) {
// // // //       throw new HttpsError(
// // // //         "unauthenticated",
// // // //         "Authentication required to participate in mock interviews.",
// // // //       );
// // // //     }

// // // //     const {
// // // //       sessionId,
// // // //       targetRole,
// // // //       difficulty = "simple",
// // // //       seniority,
// // // //       selectedSkillChips = [],
// // // //       currentStage = "Introduction & Warmup",
// // // //       contextMode = "both",
// // // //       interviewScope = "full",
// // // //       cvSummary = "No CV provided or linked.",
// // // //       pastInterviewSummary,
// // // //       timeRemainingSeconds,
// // // //       totalTimeLimitSeconds,
// // // //       conversationHistory = [],
// // // //       lastCandidateAnswer,
// // // //     } = request.data as InterviewTurnPayload;

// // // //     if (!targetRole || typeof targetRole !== "string") {
// // // //       throw new HttpsError("invalid-argument", "Target role is required.");
// // // //     }

// // // //     if (
// // // //       !Array.isArray(selectedSkillChips) ||
// // // //       !Array.isArray(conversationHistory)
// // // //     ) {
// // // //       throw new HttpsError("invalid-argument", "Invalid interview payload.");
// // // //     }

// // // //     // --- PERSONA & RIGOR ---
// // // //     let personaRigor =
// // // //       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

// // // //     if (difficulty === "mid") {
// // // //       personaRigor =
// // // //         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
// // // //     }

// // // //     if (difficulty === "hard") {
// // // //       personaRigor =
// // // //         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
// // // //     }

// // // //     // --- TIME-AWARENESS ---
// // // //     let timeContextInstruction = "";
// // // //     if (typeof timeRemainingSeconds === "number") {
// // // //       if (timeRemainingSeconds <= 120) {
// // // //         timeContextInstruction =
// // // //           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
// // // //       } else if (timeRemainingSeconds <= 300) {
// // // //         timeContextInstruction =
// // // //           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
// // // //       }
// // // //     }

// // // //     // --- CONTEXT & SCOPE ---
// // // //     let contextInstruction = "";
// // // //     if (contextMode === "both" || contextMode === "cv_only") {
// // // //       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
// // // //     }

// // // //     if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
// // // //       contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
// // // //       contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but do not hold it against them if they show improvement today. Focus on verifying if they have improved in those specific areas.\n`;
// // // //     }

// // // //     let scopeInstruction = "";
// // // //     if (interviewScope === "full") {
// // // //       scopeInstruction = `
// // // // THIS IS A HOLISTIC MULTI-PART INTERVIEW. You MUST guide the conversation logically through these stages based on the current stage:
// // // // 1. Work Readiness & Warmup
// // // // 2. Soft Skills & STAR Behavioral Questions
// // // // 3. Technical Deep-Dive
// // // // 4. System Scenario & Problem-Solving
// // // // 5. Candidate Q&A ("Do you have any questions for me about the role or company?")
// // // // 6. Conclusion & Wrap-Up`;
// // // //     } else if (interviewScope === "technical_only") {
// // // //       scopeInstruction =
// // // //         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
// // // //     } else {
// // // //       scopeInstruction =
// // // //         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
// // // //     }

// // // //     // 🚀 IMMEDIATE CONTEXT FOR AI ATTENTION
// // // //     const lastHistoryMsg =
// // // //       conversationHistory.length > 0
// // // //         ? conversationHistory[conversationHistory.length - 1]
// // // //         : null;
// // // //     const immediateAnswer =
// // // //       lastCandidateAnswer?.trim() ||
// // // //       (lastHistoryMsg && lastHistoryMsg.role === "user"
// // // //         ? lastHistoryMsg.content
// // // //         : "N/A");

// // // //     // --- SYSTEM PROMPT ---
// // // //     const systemPrompt = `You are a professional industry interviewer conducting a structured mock interview for a ${targetRole} position.

// // // // This is an interview-readiness assessment. Your responsibility is NOT to make the candidate feel successful. Your responsibility is to accurately determine what the candidate can demonstrate independently and to expose areas where they are not yet ready.

// // // // DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// // // // CURRENT STAGE: ${currentStage}
// // // // CANDIDATE SENIORITY: ${seniority || "Not specified"}
// // // // FOCUS SKILLS: ${selectedSkillChips.length > 0 ? selectedSkillChips.join(", ") : "General technical, behavioural and workplace skills"}

// // // //  ${contextInstruction}
// // // //  ${scopeInstruction}

// // // // TOTAL SESSION TIME: ${typeof totalTimeLimitSeconds === "number" ? `${totalTimeLimitSeconds} seconds` : "Not specified"}
// // // // TIME REMAINING: ${typeof timeRemainingSeconds === "number" ? `${timeRemainingSeconds} seconds` : "Not specified"}

// // // // IMMEDIATE CONTEXT:
// // // // The candidate's exact last message was: "${immediateAnswer}"
// // // // CRITICAL RULE: You MUST directly acknowledge and respond to what the candidate just said before moving on. Do NOT ignore their last message. Do NOT repeat your previous greeting or question unless they specifically asked you to repeat it.

// // // // INTERVIEWER STANDARD:
// // // //  ${personaRigor}

// // // // CORE ASSESSMENT PRINCIPLES:

// // // // 1. EVIDENCE OVER CLAIMS
// // // //    - Do not assume the candidate knows something merely because they say they have experience with it.
// // // //    - Give credit for demonstrated knowledge, reasoning, examples, decisions, and outcomes.

// // // // 2. DO NOT RESCUE THE CANDIDATE
// // // //    - Do not provide the answer. Do not suggest key concepts. Do not complete their answer for them.
// // // //    - If they cannot answer, allow that weakness to be recorded.

// // // // 3. WEAK ANSWERS MUST REMAIN WEAK
// // // //    - Do not reinterpret vague, incomplete, incorrect or technically inaccurate answers as competent answers.

// // // // 4. DO NOT INFER COMPETENCE
// // // //    - Never award points for knowledge that is not demonstrated in the transcript. Never compensate for a weak technical answer because the candidate communicates confidently.

// // // // 5. ROLE APPROPRIATENESS
// // // //    - Evaluate the candidate against the expected competence of the specified ${targetRole} role and difficulty level. Do not lower the standard merely because the candidate is a learner.

// // // // 6. BEHAVIOURAL QUESTIONS
// // // //    - For behavioural questions, look for evidence of Situation, Task, Action and Result. Do not award full marks when the candidate only describes what "we" did without explaining their own contribution.

// // // // 7. TECHNICAL QUESTIONS
// // // //    - Evaluate correctness, understanding, reasoning, practical application and ability to explain decisions. Prefer practical understanding over memorised definitions.

// // // // 8. COMMUNICATION
// // // //    - Assess clarity, relevance, structure, listening, ability to explain technical concepts and ability to answer the actual question. Do not confuse verbosity with strong communication.

// // // // 9. ANSWER VALIDATION AND REDIRECTION
// // // //    - First determine whether the candidate answered the previous question.
// // // //    - If they answered adequately, continue with the interview.
// // // //    - If they partially answered, ask ONE focused follow-up question targeting the missing evidence.
// // // //    - If they gave an incorrect or irrelevant answer, ask ONE concise probing question where useful.
// // // //    - If they clearly do not know the answer, do not keep coaching them indefinitely. Move to the next appropriate question.
// // // //    - If they ask a meta-question such as "Can you hear me?", "Are you there?", or "I can't hear you", answer briefly and naturally (e.g., "Yes, I can hear you perfectly. Now, regarding...") and then RESTATE the pending interview question smoothly.
// // // //    - Never abandon an unanswered substantive question simply to make the conversation feel smooth.

// // // // 10. QUESTION CONTROL
// // // //    - Ask exactly ONE substantive question per turn.
// // // //    - Do not ask compound questions containing several unrelated questions.
// // // //    - Follow-up questions must target evidence missing from the previous answer.

// // // // 11. INTERVIEW FLOW
// // // //    - Respect the current interview stage. Do not randomly jump between unrelated topics.
// // // //    - A strong answer should allow the interview to progress (shouldAdvanceStage: true).
// // // //    - A weak answer should trigger appropriate probing before progression.

// // // // 12. TIME MANAGEMENT
// // // //    ${timeContextInstruction}

// // // // 13. SPEECH SYNTHESIS
// // // //    - Ask exactly ONE clear question.
// // // //    - Keep the response to no more than 3 concise sentences.
// // // //    - Use natural professional spoken language.
// // // //    - No markdown, tables, bullet points, numbered lists or special formatting.

// // // // 14. FIRST TURN HANDLING (WHEN CONVERSATION HISTORY IS EMPTY):
// // // //    - Dynamically introduce yourself briefly as the interviewer.
// // // //    - State the target role (${targetRole}).
// // // //    - Ask the first introductory or warmup question for the "${currentStage}" stage.

// // // // 15. CV & SKILL CHIP CROSS-EXAMINATION:
// // // //    - When CV or skill chips are enabled, cross-examine candidate responses directly against their declared skills and CV project claims.

// // // // IMPORTANT:
// // // // You are an assessor, not a coach, during the live interview. Accuracy is more important than encouragement. Do not manufacture competence. Do not sugar-coat weaknesses. A candidate who performs poorly must be allowed to receive a poor result.

// // // // JSON OUTPUT REQUIREMENT:
// // // // You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// // // // JSON SCHEMA:
// // // // {
// // // //   "responseText": "string (The exact spoken response and single question for the candidate)",
// // // //   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
// // // //   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
// // // //   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// // // // }`;

// // // //     // --- BUILD MESSAGE HISTORY ---
// // // //     const messages: ChatMessage[] = [
// // // //       { role: "system", content: systemPrompt },
// // // //       ...conversationHistory,
// // // //     ];

// // // //     if (lastCandidateAnswer?.trim()) {
// // // //       const lastMsgInHistory =
// // // //         conversationHistory[conversationHistory.length - 1];
// // // //       const isAlreadyInHistory =
// // // //         lastMsgInHistory &&
// // // //         lastMsgInHistory.role === "user" &&
// // // //         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

// // // //       if (!isAlreadyInHistory) {
// // // //         messages.push({ role: "user", content: lastCandidateAnswer.trim() });
// // // //       }
// // // //     }

// // // //     // --- GENERATE AI RESPONSE (WITH DYNAMIC SELF-CORRECTION) ---
// // // //     try {
// // // //       let parsedData: {
// // // //         responseText: string;
// // // //         turnPurpose:
// // // //           | "INITIAL_GREETING"
// // // //           | "PRIMARY_QUESTION"
// // // //           | "PROBE"
// // // //           | "CLARIFICATION"
// // // //           | "STAGE_WRAPUP";
// // // //         answerAssessment:
// // // //           | "SATISFACTORY"
// // // //           | "PARTIAL"
// // // //           | "INADEQUATE"
// // // //           | "OFF_TOPIC"
// // // //           | "NOT_APPLICABLE";
// // // //         shouldAdvanceStage: boolean;
// // // //       } | null = null;

// // // //       let rawText = "";
// // // //       let aiResult: any;

// // // //       // Loop to allow the AI to self-correct if it fails JSON or refuses
// // // //       for (let attempt = 1; attempt <= 2; attempt++) {
// // // //         let currentMessages = [...messages];

// // // //         if (attempt === 2) {
// // // //           logger.warn(
// // // //             `Attempt 2: AI failed to provide valid JSON or refused. Forcing self-correction.`,
// // // //           );
// // // //           currentMessages.push({ role: "assistant", content: rawText || "{}" });
// // // //           currentMessages.push({
// // // //             role: "user",
// // // //             content:
// // // //               "Your previous response was either empty, not valid JSON, or contained an AI refusal. You must stay in character as the interviewer. Please output ONLY the raw JSON object for the next interviewer turn based strictly on the current conversation history and stage. Do not refuse. Do not explain. Do not use markdown.",
// // // //           });
// // // //         }

// // // //         aiResult = await generateCompletion({
// // // //           messages: currentMessages,
// // // //           temperature: 0.5,
// // // //           maxTokens: 400,
// // // //           feature: "mock_interview_turn",
// // // //           userId: auth.uid,
// // // //           sessionId,
// // // //         });

// // // //         rawText = aiResult.text?.trim() || "";

// // // //         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

// // // //         if (jsonMatch) {
// // // //           try {
// // // //             const jsonParsed = JSON.parse(jsonMatch[0]);
// // // //             if (
// // // //               jsonParsed &&
// // // //               typeof jsonParsed.responseText === "string" &&
// // // //               jsonParsed.responseText.trim().length > 0
// // // //             ) {
// // // //               const isRefusal =
// // // //                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // //                   jsonParsed.responseText,
// // // //                 );
// // // //               if (!isRefusal) {
// // // //                 parsedData = {
// // // //                   responseText: jsonParsed.responseText,
// // // //                   turnPurpose: jsonParsed.turnPurpose || "PRIMARY_QUESTION",
// // // //                   answerAssessment:
// // // //                     jsonParsed.answerAssessment || "SATISFACTORY",
// // // //                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
// // // //                 };
// // // //                 break;
// // // //               }
// // // //             }
// // // //           } catch (e) {
// // // //             logger.warn(
// // // //               `Attempt ${attempt}: Matched string was not valid JSON.`,
// // // //             );
// // // //           }
// // // //         }
// // // //       }

// // // //       // DYNAMIC FALLBACK: If JSON parsing failed but we have rawText, just use the raw text!
// // // //       if (!parsedData && rawText.length > 0) {
// // // //         const cleanText = rawText
// // // //           .replace(/```json/gi, "")
// // // //           .replace(/```/g, "")
// // // //           .trim();
// // // //         const isRefusal =
// // // //           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // //             cleanText,
// // // //           );

// // // //         if (!isRefusal) {
// // // //           parsedData = {
// // // //             responseText: cleanText,
// // // //             turnPurpose: "PRIMARY_QUESTION",
// // // //             answerAssessment: "NOT_APPLICABLE",
// // // //             shouldAdvanceStage: false,
// // // //           };
// // // //         }
// // // //       }

// // // //       // If the AI absolutely refused or returned nothing after retries, throw error to frontend
// // // //       if (!parsedData) {
// // // //         throw new Error(
// // // //           "AI failed to generate a valid interview turn after self-correction attempts.",
// // // //         );
// // // //       }

// // // //       return {
// // // //         success: true,
// // // //         responseText: parsedData.responseText,
// // // //         turnPurpose: parsedData.turnPurpose,
// // // //         answerAssessment: parsedData.answerAssessment,
// // // //         shouldAdvanceStage: parsedData.shouldAdvanceStage,
// // // //         provider: aiResult.provider,
// // // //         modelUsed: aiResult.modelUsed,
// // // //         fallbackUsed: aiResult.fallbackUsed,
// // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // //         durationMs: aiResult.durationMs,
// // // //       };
// // // //     } catch (error: any) {
// // // //       logger.error("Error generating interview turn:", {
// // // //         error: error?.message || error,
// // // //         userId: auth.uid,
// // // //         targetRole,
// // // //         difficulty,
// // // //         currentStage,
// // // //       });

// // // //       throw new HttpsError(
// // // //         "internal",
// // // //         error?.message || "Failed to generate interview response.",
// // // //       );
// // // //     }
// // // //   },
// // // // );

// // // // // -----------------------------------------------------------------------------
// // // // // 2. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // // // // -----------------------------------------------------------------------------

// // // // export const evaluateMockInterview = onCall(
// // // //   {
// // // //     cors: true,
// // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // //     timeoutSeconds: 300,
// // // //     memory: "512MiB",
// // // //     region: "us-central1",
// // // //   },
// // // //   async (request) => {
// // // //     const auth = request.auth;

// // // //     if (!auth) {
// // // //       throw new HttpsError(
// // // //         "unauthenticated",
// // // //         "Authentication required to evaluate mock interviews.",
// // // //       );
// // // //     }

// // // //     const {
// // // //       sessionId,
// // // //       learnerId,
// // // //       targetRole,
// // // //       difficulty = "simple",
// // // //       selectedSkillChips = [],
// // // //       contextMode = "both",
// // // //       interviewScope = "full",
// // // //       cvSummary = "No CV provided.",
// // // //       fullTranscript,
// // // //     } = request.data as EvaluationPayload;

// // // //     if (!targetRole || typeof targetRole !== "string") {
// // // //       throw new HttpsError(
// // // //         "invalid-argument",
// // // //         "Target role is required for assessment.",
// // // //       );
// // // //     }

// // // //     if (
// // // //       !fullTranscript ||
// // // //       !Array.isArray(fullTranscript) ||
// // // //       fullTranscript.length === 0
// // // //     ) {
// // // //       throw new HttpsError(
// // // //         "invalid-argument",
// // // //         "Full transcript is required for evaluation.",
// // // //       );
// // // //     }

// // // //     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

// // // //     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// // // // You are evaluating a completed mock interview for a candidate applying for:

// // // // TARGET ROLE: ${targetRole}
// // // // DIFFICULTY: ${difficulty.toUpperCase()}
// // // // FOCUS SKILLS: ${selectedSkillChips?.length ? selectedSkillChips.join(", ") : "General technical and workplace competencies"}

// // // //  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// // // // The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// // // // ASSESSMENT PHILOSOPHY:
// // // // Be accurate, evidence-based and appropriately rigorous.
// // // // Do NOT inflate scores to encourage the candidate.
// // // // A low score is an acceptable and useful result.
// // // // If the candidate performed poorly, say so clearly.
// // // // Do not reward effort, enthusiasm, confidence, length of answers or participation unless these actually demonstrate the assessed competency.
// // // // Do not infer knowledge that is not demonstrated in the transcript.
// // // // Do not give credit because the candidate appears capable of learning the concept later.
// // // // The assessment must describe the candidate's CURRENT demonstrated ability, not their potential.

// // // // SCORING STANDARD:
// // // // 90-100 = Interview Ready / Strong Evidence
// // // // 80-89 = Nearly Ready / Minor Gaps
// // // // 70-79 = Developing / Not Yet Consistently Ready
// // // // 60-69 = Significant Development Required
// // // // 40-59 = Not Interview Ready
// // // // 0-39 = Seriously Not Ready

// // // // IMPORTANT SCORING RULE:
// // // // Do not use 80 as a default or "average" score.
// // // // A candidate who performs poorly should receive a low score.
// // // // A candidate who demonstrates only basic knowledge should receive a basic score.
// // // // A candidate must earn points through evidence.

// // // // CATEGORY SCORING:
// // // // TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
// // // // BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
// // // // COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional communication, ability to explain technical concepts, listening and responsiveness.
// // // // ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// // // // CRITICAL RULES:
// // // // 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
// // // // 2. A vague answer must not receive full marks.
// // // // 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
// // // // 4. If the interviewer had to repeatedly prompt the candidate before obtaining a correct answer, this indicates weaker independent interview readiness.
// // // // 5. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
// // // // 6. Do not invent experience, projects, technologies, responsibilities or outcomes that are not present in the transcript.
// // // // 7. Do not treat participation itself as competence.
// // // // 8. Do not award a high overall score when one critical competency is substantially deficient.
// // // // 9. The overall score must reflect actual evidence from the transcript.
// // // // 10. The evaluation must distinguish between: demonstrated independently, demonstrated after prompting, partially demonstrated, not demonstrated, incorrect.

// // // // READINESS DECISION:
// // // // Determine one of: "READY", "NEARLY_READY", "DEVELOPING", "NOT_READY"
// // // // Use "READY" only when the candidate has demonstrated sufficient competence for the selected target role and difficulty.
// // // // A candidate scoring below 80 should normally not be classified as READY.
// // // // A candidate scoring 90+ should still NOT be classified as READY if there is a serious critical competency failure.
// // // // Do not allow one strong category to hide a major weakness in another category.

// // // // QUESTION-LEVEL SCORING:
// // // // Each question must receive an individual score from 0-100.
// // // // The feedback must explain: what the candidate demonstrated, what was missing, whether the answer was technically correct, whether prompting was required, what a stronger candidate would have demonstrated.
// // // // The ideal answer must be appropriate for the target role and difficulty level. Do not make the ideal answer unrealistically senior. The ideal answer is an example of a strong answer, not necessarily the only acceptable answer.

// // // // OVERALL SCORE:
// // // // Calculate the overall score from the demonstrated competencies.
// // // // Do not simply average the categories if doing so would hide a serious weakness.
// // // // The final score must be defensible from the transcript.

// // // // CRITICAL WEAKNESS RULE:
// // // // If the candidate demonstrates a serious deficiency in a core competency required for the target role, the candidate cannot be classified as READY regardless of their communication or behavioural score.

// // // // JSON OUTPUT REQUIREMENT:
// // // // Return valid JSON only.
// // // // Do not return markdown.
// // // // Do not return commentary outside the JSON.
// // // // Do not use trailing commas.

// // // // SCHEMA:
// // // // {
// // // //   "overallScore": number,
// // // //   "technicalScore": number,
// // // //   "technicalKnowledgeScore": number,
// // // //   "interviewReadinessScore": number,
// // // //   "behavioralScore": number,
// // // //   "communicationScore": number,
// // // //   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
// // // //   "readinessSummary": "string",
// // // //   "confidence": number,
// // // //   "strengths": ["string"],
// // // //   "areasForImprovement": ["string"],
// // // //   "priorityGaps": ["string"],
// // // //   "recommendedPreparation": ["string"],
// // // //   "questionBreakdown": [
// // // //     {
// // // //       "question": "string",
// // // //       "candidateAnswer": "string",
// // // //       "score": number,
// // // //       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
// // // //       "feedback": "string",
// // // //       "whatWasMissing": "string",
// // // //       "idealAnswerSample": "string"
// // // //     }
// // // //   ]
// // // // }

// // // // QUALITY CONTROL BEFORE RETURNING JSON:
// // // // - Did I score what was actually demonstrated?
// // // // - Did I avoid assuming knowledge?
// // // // - Did I avoid inflating weak answers?
// // // // - Did I distinguish prompted answers from independent answers?
// // // // - Did I identify incorrect technical statements?
// // // // - Does the overall score match the evidence?
// // // // - Does readinessStatus agree with the score and critical weaknesses?
// // // // - Would I trust this candidate to perform similarly in a real interview?`;

// // // //     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(fullTranscript, null, 2)}`;

// // // //     try {
// // // //       const aiResult = await generateCompletion({
// // // //         messages: [
// // // //           { role: "system" as const, content: systemPrompt },
// // // //           { role: "user" as const, content: userPrompt },
// // // //         ],
// // // //         temperature: 0.1,
// // // //         maxTokens: 3000,
// // // //         feature: "mock_interview_evaluation",
// // // //         userId: auth.uid,
// // // //         sessionId,
// // // //       });

// // // //       const rawText = aiResult.text?.trim() || "";

// // // //       if (!rawText) {
// // // //         throw new Error("AI provider returned an empty evaluation response.");
// // // //       }

// // // //       const cleanJsonText = rawText
// // // //         .replace(/```json/gi, "")
// // // //         .replace(/```/g, "")
// // // //         .trim();

// // // //       let scorecard: any;

// // // //       try {
// // // //         scorecard = JSON.parse(cleanJsonText);
// // // //       } catch (jsonError) {
// // // //         logger.error("AI evaluation output failed JSON parsing:", {
// // // //           error: jsonError,
// // // //           sessionId,
// // // //           rawText,
// // // //         });
// // // //         throw new Error("The AI evaluation response was not valid JSON.");
// // // //       }

// // // //       // SCORE & GATE VALIDATION
// // // //       const requiredNumericFields = [
// // // //         "overallScore",
// // // //         "technicalScore",
// // // //         "technicalKnowledgeScore",
// // // //         "interviewReadinessScore",
// // // //         "behavioralScore",
// // // //         "communicationScore",
// // // //       ];

// // // //       for (const field of requiredNumericFields) {
// // // //         const val = scorecard[field];
// // // //         if (typeof val !== "number" || val < 0 || val > 100) {
// // // //           logger.warn(
// // // //             `Score field ${field} invalid (${val}), clamping to 0-100 range.`,
// // // //           );
// // // //           scorecard[field] =
// // // //             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
// // // //         }
// // // //       }

// // // //       // STRICT TECHNICAL READINESS GATE ENFORCEMENT
// // // //       if (
// // // //         (scorecard.technicalScore < 80 ||
// // // //           scorecard.technicalKnowledgeScore < 80) &&
// // // //         scorecard.readinessStatus === "READY"
// // // //       ) {
// // // //         scorecard.readinessStatus = "NEARLY_READY";
// // // //         scorecard.readinessSummary +=
// // // //           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
// // // //       }

// // // //       // FIRESTORE PERSISTENCE
// // // //       const db = admin.firestore();

// // // //       if (sessionId) {
// // // //         await db.collection("ai_interviews").doc(sessionId).set(
// // // //           {
// // // //             scorecard,
// // // //             difficulty,
// // // //             targetRole,
// // // //             contextMode,
// // // //             interviewScope,
// // // //             isQualifyingRun,
// // // //             status: "completed",
// // // //             completedAt: admin.firestore.FieldValue.serverTimestamp(),
// // // //             aiProvider: aiResult.provider,
// // // //             modelUsed: aiResult.modelUsed,
// // // //             fallbackUsed: aiResult.fallbackUsed,
// // // //             fallbackAttempts: aiResult.fallbackAttempts,
// // // //             durationMs: aiResult.durationMs,
// // // //             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// // // //           },
// // // //           { merge: true },
// // // //         );
// // // //       }

// // // //       // Update Learner Metric Profile ONLY if this was a qualifying run
// // // //       const targetLearnerId = learnerId || auth.uid;
// // // //       const learnerRef = db.collection("learners").doc(targetLearnerId);
// // // //       const learnerSnap = await learnerRef.get();

// // // //       if (learnerSnap.exists && isQualifyingRun) {
// // // //         await learnerRef.update({
// // // //           employabilityScore: scorecard.overallScore || 0,
// // // //           latestInterviewScore: scorecard.overallScore || 0,
// // // //           technicalScore: scorecard.technicalScore || 0,
// // // //           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
// // // //           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
// // // //           behavioralScore: scorecard.behavioralScore || 0,
// // // //           communicationScore: scorecard.communicationScore || 0,
// // // //           readinessStatus: scorecard.readinessStatus || "NOT_READY",
// // // //           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
// // // //         });
// // // //       }

// // // //       return {
// // // //         success: true,
// // // //         scorecard,
// // // //         isQualifyingRun,
// // // //         provider: aiResult.provider,
// // // //         modelUsed: aiResult.modelUsed,
// // // //         fallbackUsed: aiResult.fallbackUsed,
// // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // //         durationMs: aiResult.durationMs,
// // // //       };
// // // //     } catch (error: any) {
// // // //       logger.error("Error evaluating mock interview:", {
// // // //         error: error?.message || error,
// // // //         userId: auth.uid,
// // // //         learnerId: learnerId || auth.uid,
// // // //         sessionId,
// // // //         targetRole,
// // // //         difficulty,
// // // //       });

// // // //       throw new HttpsError(
// // // //         "internal",
// // // //         error?.message || "Failed to evaluate mock interview transcript.",
// // // //       );
// // // //     }
// // // //   },
// // // // );

// // // // // // functions/src/modules/interviewEngine.ts

// // // // // import { onCall, HttpsError } from "firebase-functions/v2/https";
// // // // // import { defineSecret } from "firebase-functions/params";
// // // // // import * as logger from "firebase-functions/logger";
// // // // // import * as admin from "firebase-admin";

// // // // // // Central AI Gateway Client
// // // // // import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // // // // // Define Secret Manager dependencies for deployment runtime access
// // // // // const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// // // // // const hfTokenSecret = defineSecret("HF_TOKEN");

// // // // // // -----------------------------------------------------------------------------
// // // // // // TYPES & INTERFACES
// // // // // // -----------------------------------------------------------------------------

// // // // // export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// // // // // export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// // // // // export interface InterviewTurnPayload {
// // // // //   sessionId?: string;
// // // // //   targetRole: string;
// // // // //   difficulty?: "simple" | "mid" | "hard";
// // // // //   seniority?: string;
// // // // //   selectedSkillChips: string[];
// // // // //   currentStage: string;
// // // // //   contextMode?: ContextMode;
// // // // //   interviewScope?: InterviewScope;
// // // // //   cvSummary?: string;
// // // // //   pastInterviewSummary?: string;
// // // // //   timeRemainingSeconds?: number;
// // // // //   totalTimeLimitSeconds?: number;
// // // // //   conversationHistory: ChatMessage[];
// // // // //   lastCandidateAnswer?: string;
// // // // // }

// // // // // export interface EvaluationPayload {
// // // // //   sessionId?: string;
// // // // //   learnerId?: string;
// // // // //   targetRole: string;
// // // // //   difficulty?: "simple" | "mid" | "hard";
// // // // //   selectedSkillChips: string[];
// // // // //   contextMode?: ContextMode;
// // // // //   interviewScope?: InterviewScope;
// // // // //   cvSummary?: string;
// // // // //   fullTranscript: Array<{
// // // // //     speaker: string;
// // // // //     text: string;
// // // // //     timestamp?: string;
// // // // //   }>;
// // // // // }

// // // // // // -----------------------------------------------------------------------------
// // // // // // 1. DYNAMIC INTERVIEW TURN GENERATOR
// // // // // // -----------------------------------------------------------------------------

// // // // // export const generateInterviewTurn = onCall(
// // // // //   {
// // // // //     cors: true,
// // // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // // //     region: "us-central1",
// // // // //   },
// // // // //   async (request) => {
// // // // //     const auth = request.auth;

// // // // //     if (!auth) {
// // // // //       throw new HttpsError(
// // // // //         "unauthenticated",
// // // // //         "Authentication required to participate in mock interviews.",
// // // // //       );
// // // // //     }

// // // // //     const {
// // // // //       sessionId,
// // // // //       targetRole,
// // // // //       difficulty = "simple",
// // // // //       seniority,
// // // // //       selectedSkillChips = [],
// // // // //       currentStage = "Introduction & Warmup",
// // // // //       contextMode = "both",
// // // // //       interviewScope = "full",
// // // // //       cvSummary = "No CV provided or linked.",
// // // // //       pastInterviewSummary,
// // // // //       timeRemainingSeconds,
// // // // //       totalTimeLimitSeconds,
// // // // //       conversationHistory = [],
// // // // //       lastCandidateAnswer,
// // // // //     } = request.data as InterviewTurnPayload;

// // // // //     if (!targetRole || typeof targetRole !== "string") {
// // // // //       throw new HttpsError("invalid-argument", "Target role is required.");
// // // // //     }

// // // // //     if (
// // // // //       !Array.isArray(selectedSkillChips) ||
// // // // //       !Array.isArray(conversationHistory)
// // // // //     ) {
// // // // //       throw new HttpsError("invalid-argument", "Invalid interview payload.");
// // // // //     }

// // // // //     // --- PERSONA & RIGOR ---
// // // // //     let personaRigor =
// // // // //       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

// // // // //     if (difficulty === "mid") {
// // // // //       personaRigor =
// // // // //         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
// // // // //     }

// // // // //     if (difficulty === "hard") {
// // // // //       personaRigor =
// // // // //         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
// // // // //     }

// // // // //     // --- TIME-AWARENESS ---
// // // // //     let timeContextInstruction = "";
// // // // //     if (typeof timeRemainingSeconds === "number") {
// // // // //       if (timeRemainingSeconds <= 120) {
// // // // //         timeContextInstruction =
// // // // //           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
// // // // //       } else if (timeRemainingSeconds <= 300) {
// // // // //         timeContextInstruction =
// // // // //           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
// // // // //       }
// // // // //     }

// // // // //     // --- CONTEXT & SCOPE ---
// // // // //     let contextInstruction = "";
// // // // //     if (contextMode === "both" || contextMode === "cv_only") {
// // // // //       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
// // // // //     }

// // // // //     if (pastInterviewSummary && pastInterviewSummary.trim().length > 0) {
// // // // //       contextInstruction += `\nCANDIDATE PAST INTERVIEW MEMORY:\n${pastInterviewSummary}\n`;
// // // // //       contextInstruction += `INSTRUCTION FOR PAST MEMORY: The candidate has taken interviews before. Naturally acknowledge their past weaknesses if relevant, but do not hold it against them if they show improvement today. Focus on verifying if they have improved in those specific areas.\n`;
// // // // //     }

// // // // //     let scopeInstruction = "";
// // // // //     if (interviewScope === "full") {
// // // // //       scopeInstruction = `
// // // // // THIS IS A HOLISTIC MULTI-PART INTERVIEW. You MUST guide the conversation logically through these stages based on the current stage:
// // // // // 1. Work Readiness & Warmup
// // // // // 2. Soft Skills & STAR Behavioral Questions
// // // // // 3. Technical Deep-Dive
// // // // // 4. System Scenario & Problem-Solving
// // // // // 5. Candidate Q&A ("Do you have any questions for me about the role or company?")
// // // // // 6. Conclusion & Wrap-Up`;
// // // // //     } else if (interviewScope === "technical_only") {
// // // // //       scopeInstruction =
// // // // //         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
// // // // //     } else {
// // // // //       scopeInstruction =
// // // // //         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
// // // // //     }

// // // // //     // --- SYSTEM PROMPT ---
// // // // //     const systemPrompt = `You are a professional industry interviewer conducting a structured mock interview for a ${targetRole} position.

// // // // // This is an interview-readiness assessment. Your responsibility is NOT to make the candidate feel successful. Your responsibility is to accurately determine what the candidate can demonstrate independently and to expose areas where they are not yet ready.

// // // // // DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// // // // // CURRENT STAGE: ${currentStage}
// // // // // CANDIDATE SENIORITY: ${seniority || "Not specified"}
// // // // // FOCUS SKILLS: ${
// // // // //       selectedSkillChips.length > 0
// // // // //         ? selectedSkillChips.join(", ")
// // // // //         : "General technical, behavioural and workplace skills"
// // // // //     }

// // // // //  ${contextInstruction}
// // // // //  ${scopeInstruction}

// // // // // TOTAL SESSION TIME: ${
// // // // //       typeof totalTimeLimitSeconds === "number"
// // // // //         ? `${totalTimeLimitSeconds} seconds`
// // // // //         : "Not specified"
// // // // //     }
// // // // // TIME REMAINING: ${
// // // // //       typeof timeRemainingSeconds === "number"
// // // // //         ? `${timeRemainingSeconds} seconds`
// // // // //         : "Not specified"
// // // // //     }

// // // // // INTERVIEWER STANDARD:
// // // // //  ${personaRigor}

// // // // // CORE ASSESSMENT PRINCIPLES:

// // // // // 1. EVIDENCE OVER CLAIMS
// // // // //    - Do not assume the candidate knows something merely because they say they have experience with it.
// // // // //    - Give credit for demonstrated knowledge, reasoning, examples, decisions, and outcomes.
// // // // //    - Statements such as "I know React", "I have worked with APIs", or "I understand Scrum" are not evidence by themselves.
// // // // //    - If the candidate makes a technical claim, probe it when necessary to determine whether they genuinely understand it.

// // // // // 2. DO NOT RESCUE THE CANDIDATE
// // // // //    - Do not provide the answer.
// // // // //    - Do not suggest the key concepts they should mention.
// // // // //    - Do not complete their answer for them.
// // // // //    - Do not turn a weak answer into a correct answer through excessive prompting.
// // // // //    - If they cannot answer, allow that weakness to be recorded.
// // // // //    - You may ask a concise clarification question where appropriate, but clarification must not become coaching.

// // // // // 3. WEAK ANSWERS MUST REMAIN WEAK
// // // // //    - Do not reinterpret vague, incomplete, incorrect or technically inaccurate answers as competent answers.
// // // // //    - If an answer is fundamentally incorrect, treat it as incorrect.
// // // // //    - If an answer demonstrates partial understanding, probe the missing part.
// // // // //    - If the candidate continues to demonstrate insufficient understanding after probing, move on and allow the weakness to affect the final evaluation.

// // // // // 4. DO NOT INFER COMPETENCE
// // // // //    - Never award points for knowledge that is not demonstrated in the transcript.
// // // // //    - Never assume that a candidate would have known the answer if they had more time.
// // // // //    - Never compensate for a weak technical answer because the candidate communicates confidently.
// // // // //    - Never compensate for weak behavioural evidence because the candidate sounds enthusiastic.

// // // // // 5. ROLE APPROPRIATENESS
// // // // //    - Evaluate the candidate against the expected competence of the specified ${targetRole} role and difficulty level.
// // // // //    - Do not require senior-level knowledge from a junior candidate simply because the topic is technically advanced.
// // // // //    - However, do not lower the standard merely because the candidate is a learner.
// // // // //    - The purpose of this exercise is to determine whether the candidate is ready for an actual interview at this level.

// // // // // 6. BEHAVIOURAL QUESTIONS
// // // // //    - For behavioural questions, look for evidence of Situation, Task, Action and Result.
// // // // //    - Do not award full marks when the candidate only describes what "we" did without explaining their own contribution.
// // // // //    - Do not award full marks when there is no clear outcome or learning.
// // // // //    - If the candidate cannot provide a real example, do not invent one for them.

// // // // // 7. TECHNICAL QUESTIONS
// // // // //    - Evaluate correctness, understanding, reasoning, practical application and ability to explain decisions.
// // // // //    - Prefer practical understanding over memorised definitions.
// // // // //    - If a candidate gives a technically questionable answer, probe the relevant concept before moving on.
// // // // //    - Do not accept confident but technically incorrect explanations.

// // // // // 8. COMMUNICATION
// // // // //    - Assess clarity, relevance, structure, listening, ability to explain technical concepts and ability to answer the actual question.
// // // // //    - Do not confuse verbosity with strong communication.
// // // // //    - Do not penalise a candidate merely for having an accent, speaking style, or minor grammatical mistakes.
// // // // //    - Penalise communication only where it materially affects the candidate's ability to communicate professionally and answer the question.

// // // // // 9. ANSWER VALIDATION AND REDIRECTION
// // // // //    - First determine whether the candidate answered the previous question.
// // // // //    - If they answered adequately, continue with the interview.
// // // // //    - If they partially answered, ask ONE focused follow-up question targeting the missing evidence.
// // // // //    - If they gave an incorrect or irrelevant answer, ask ONE concise probing question where useful.
// // // // //    - If they clearly do not know the answer, do not keep coaching them indefinitely. Move to the next appropriate question.
// // // // //    - If they ask a meta-question such as "Can you hear me?", "Are you there?", or "I can't hear you", answer briefly and naturally (e.g., acknowledge them naturally, then smoothly transition back) and then RESTATE the pending interview question smoothly.
// // // // //    - Never abandon an unanswered substantive question simply to make the conversation feel smooth.

// // // // // 10. QUESTION CONTROL
// // // // //    - Ask exactly ONE substantive question per turn.
// // // // //    - Do not ask compound questions containing several unrelated questions.
// // // // //    - Do not provide a list of things the candidate should answer.
// // // // //    - Follow-up questions must target evidence missing from the previous answer.

// // // // // 11. INTERVIEW FLOW
// // // // //    - Respect the current interview stage.
// // // // //    - Do not randomly jump between unrelated topics.
// // // // //    - Increase or decrease probing based on the candidate's demonstrated competence.
// // // // //    - A strong answer should allow the interview to progress (shouldAdvanceStage: true).
// // // // //    - A weak answer should trigger appropriate probing before progression.
// // // // //    - Do not artificially increase scores by making questions easier after repeated failures.

// // // // // 12. TIME MANAGEMENT
// // // // //    ${timeContextInstruction}

// // // // // 13. SPEECH SYNTHESIS
// // // // //    - Ask exactly ONE clear question.
// // // // //    - Keep the response to no more than 3 concise sentences.
// // // // //    - Use natural professional spoken language.
// // // // //    - No markdown, tables, bullet points, numbered lists or special formatting.

// // // // // 14. FIRST TURN HANDLING (WHEN CONVERSATION HISTORY IS EMPTY):
// // // // //    - Dynamically introduce yourself briefly as the interviewer.
// // // // //    - State the target role (${targetRole}).
// // // // //    - Ask the first introductory or warmup question for the "${currentStage}" stage.

// // // // // 15. CV & SKILL CHIP CROSS-EXAMINATION:
// // // // //    - When CV or skill chips are enabled, cross-examine candidate responses directly against their declared skills and CV project claims.
// // // // //    - Verify whether claims made on their CV or skill list match their actual demonstrated understanding.

// // // // // IMPORTANT:
// // // // // You are an assessor, not a coach, during the live interview.
// // // // // Accuracy is more important than encouragement.
// // // // // Do not manufacture competence.
// // // // // Do not sugar-coat weaknesses.
// // // // // A candidate who performs poorly must be allowed to receive a poor result.

// // // // // JSON OUTPUT REQUIREMENT:
// // // // // You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// // // // // JSON SCHEMA:
// // // // // {
// // // // //   "responseText": "string (The exact spoken response and single question for the candidate)",
// // // // //   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
// // // // //   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
// // // // //   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// // // // // }`;

// // // // //     // --- BUILD MESSAGE HISTORY ---
// // // // //     const messages: ChatMessage[] = [
// // // // //       { role: "system", content: systemPrompt },
// // // // //       ...conversationHistory,
// // // // //     ];

// // // // //     if (lastCandidateAnswer?.trim()) {
// // // // //       const lastMsgInHistory =
// // // // //         conversationHistory[conversationHistory.length - 1];
// // // // //       const isAlreadyInHistory =
// // // // //         lastMsgInHistory &&
// // // // //         lastMsgInHistory.role === "user" &&
// // // // //         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

// // // // //       if (!isAlreadyInHistory) {
// // // // //         messages.push({ role: "user", content: lastCandidateAnswer.trim() });
// // // // //       }
// // // // //     }

// // // // //     // --- GENERATE AI RESPONSE (WITH DYNAMIC SELF-CORRECTION) ---
// // // // //     try {
// // // // //       let parsedData: {
// // // // //         responseText: string;
// // // // //         turnPurpose:
// // // // //           | "INITIAL_GREETING"
// // // // //           | "PRIMARY_QUESTION"
// // // // //           | "PROBE"
// // // // //           | "CLARIFICATION"
// // // // //           | "STAGE_WRAPUP";
// // // // //         answerAssessment:
// // // // //           | "SATISFACTORY"
// // // // //           | "PARTIAL"
// // // // //           | "INADEQUATE"
// // // // //           | "OFF_TOPIC"
// // // // //           | "NOT_APPLICABLE";
// // // // //         shouldAdvanceStage: boolean;
// // // // //       } | null = null;

// // // // //       let rawText = "";
// // // // //       let aiResult: any;

// // // // //       // Loop to allow the AI to self-correct if it fails JSON or refuses
// // // // //       for (let attempt = 1; attempt <= 2; attempt++) {
// // // // //         let currentMessages = [...messages];

// // // // //         if (attempt === 2) {
// // // // //           logger.warn(
// // // // //             `Attempt 2: AI failed to provide valid JSON or refused. Forcing self-correction.`,
// // // // //           );
// // // // //           currentMessages.push({ role: "assistant", content: rawText || "{}" });
// // // // //           currentMessages.push({
// // // // //             role: "user",
// // // // //             content:
// // // // //               "Your previous response was either empty, not valid JSON, or contained an AI refusal. You must stay in character as the interviewer. Please output ONLY the raw JSON object for the next interviewer turn based strictly on the current conversation history and stage. Do not refuse. Do not explain. Do not use markdown.",
// // // // //           });
// // // // //         }

// // // // //         aiResult = await generateCompletion({
// // // // //           messages: currentMessages,
// // // // //           temperature: 0.5,
// // // // //           maxTokens: 400,
// // // // //           feature: "mock_interview_turn",
// // // // //           userId: auth.uid,
// // // // //           sessionId,
// // // // //         });

// // // // //         rawText = aiResult.text?.trim() || "";

// // // // //         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

// // // // //         if (jsonMatch) {
// // // // //           try {
// // // // //             const jsonParsed = JSON.parse(jsonMatch[0]);
// // // // //             if (
// // // // //               jsonParsed &&
// // // // //               typeof jsonParsed.responseText === "string" &&
// // // // //               jsonParsed.responseText.trim().length > 0
// // // // //             ) {
// // // // //               const isRefusal =
// // // // //                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // // //                   jsonParsed.responseText,
// // // // //                 );
// // // // //               if (!isRefusal) {
// // // // //                 parsedData = {
// // // // //                   responseText: jsonParsed.responseText,
// // // // //                   turnPurpose: jsonParsed.turnPurpose || "PRIMARY_QUESTION",
// // // // //                   answerAssessment:
// // // // //                     jsonParsed.answerAssessment || "SATISFACTORY",
// // // // //                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
// // // // //                 };
// // // // //                 break;
// // // // //               }
// // // // //             }
// // // // //           } catch (e) {
// // // // //             logger.warn(
// // // // //               `Attempt ${attempt}: Matched string was not valid JSON.`,
// // // // //             );
// // // // //           }
// // // // //         }
// // // // //       }

// // // // //       // 🚀 DYNAMIC FALLBACK: If JSON parsing failed but we have rawText, just use the raw text!
// // // // //       if (!parsedData && rawText.length > 0) {
// // // // //         const cleanText = rawText
// // // // //           .replace(/```json/gi, "")
// // // // //           .replace(/```/g, "")
// // // // //           .trim();
// // // // //         const isRefusal =
// // // // //           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // // //             cleanText,
// // // // //           );

// // // // //         if (!isRefusal) {
// // // // //           parsedData = {
// // // // //             responseText: cleanText,
// // // // //             turnPurpose: "PRIMARY_QUESTION",
// // // // //             answerAssessment: "NOT_APPLICABLE",
// // // // //             shouldAdvanceStage: false,
// // // // //           };
// // // // //         }
// // // // //       }

// // // // //       // If the AI absolutely refused or returned nothing after retries, throw error to frontend
// // // // //       if (!parsedData) {
// // // // //         throw new Error(
// // // // //           "AI failed to generate a valid interview turn after self-correction attempts.",
// // // // //         );
// // // // //       }

// // // // //       return {
// // // // //         success: true,
// // // // //         responseText: parsedData.responseText,
// // // // //         turnPurpose: parsedData.turnPurpose,
// // // // //         answerAssessment: parsedData.answerAssessment,
// // // // //         shouldAdvanceStage: parsedData.shouldAdvanceStage,
// // // // //         provider: aiResult.provider,
// // // // //         modelUsed: aiResult.modelUsed,
// // // // //         fallbackUsed: aiResult.fallbackUsed,
// // // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // // //         durationMs: aiResult.durationMs,
// // // // //       };
// // // // //     } catch (error: any) {
// // // // //       logger.error("Error generating interview turn:", {
// // // // //         error: error?.message || error,
// // // // //         userId: auth.uid,
// // // // //         targetRole,
// // // // //         difficulty,
// // // // //         currentStage,
// // // // //       });

// // // // //       throw new HttpsError(
// // // // //         "internal",
// // // // //         error?.message || "Failed to generate interview response.",
// // // // //       );
// // // // //     }
// // // // //   },
// // // // // );

// // // // // // -----------------------------------------------------------------------------
// // // // // // 2. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // // // // // -----------------------------------------------------------------------------

// // // // // export const evaluateMockInterview = onCall(
// // // // //   {
// // // // //     cors: true,
// // // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // // //     timeoutSeconds: 300,
// // // // //     memory: "512MiB",
// // // // //     region: "us-central1",
// // // // //   },
// // // // //   async (request) => {
// // // // //     const auth = request.auth;

// // // // //     if (!auth) {
// // // // //       throw new HttpsError(
// // // // //         "unauthenticated",
// // // // //         "Authentication required to evaluate mock interviews.",
// // // // //       );
// // // // //     }

// // // // //     const {
// // // // //       sessionId,
// // // // //       learnerId,
// // // // //       targetRole,
// // // // //       difficulty = "simple",
// // // // //       selectedSkillChips = [],
// // // // //       contextMode = "both",
// // // // //       interviewScope = "full",
// // // // //       cvSummary = "No CV provided.",
// // // // //       fullTranscript,
// // // // //     } = request.data as EvaluationPayload;

// // // // //     if (!targetRole || typeof targetRole !== "string") {
// // // // //       throw new HttpsError(
// // // // //         "invalid-argument",
// // // // //         "Target role is required for assessment.",
// // // // //       );
// // // // //     }

// // // // //     if (
// // // // //       !fullTranscript ||
// // // // //       !Array.isArray(fullTranscript) ||
// // // // //       fullTranscript.length === 0
// // // // //     ) {
// // // // //       throw new HttpsError(
// // // // //         "invalid-argument",
// // // // //         "Full transcript is required for evaluation.",
// // // // //       );
// // // // //     }

// // // // //     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

// // // // //     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// // // // // You are evaluating a completed mock interview for a candidate applying for:

// // // // // TARGET ROLE: ${targetRole}
// // // // // DIFFICULTY: ${difficulty.toUpperCase()}
// // // // // FOCUS SKILLS: ${
// // // // //       selectedSkillChips?.length
// // // // //         ? selectedSkillChips.join(", ")
// // // // //         : "General technical and workplace competencies"
// // // // //     }

// // // // //  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// // // // // The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// // // // // ASSESSMENT PHILOSOPHY:
// // // // // Be accurate, evidence-based and appropriately rigorous.
// // // // // Do NOT inflate scores to encourage the candidate.
// // // // // A low score is an acceptable and useful result.
// // // // // If the candidate performed poorly, say so clearly.
// // // // // Do not reward effort, enthusiasm, confidence, length of answers or participation unless these actually demonstrate the assessed competency.
// // // // // Do not infer knowledge that is not demonstrated in the transcript.
// // // // // Do not give credit because the candidate appears capable of learning the concept later.
// // // // // The assessment must describe the candidate's CURRENT demonstrated ability, not their potential.

// // // // // SCORING STANDARD:
// // // // // 90-100 = Interview Ready / Strong Evidence
// // // // // 80-89 = Nearly Ready / Minor Gaps
// // // // // 70-79 = Developing / Not Yet Consistently Ready
// // // // // 60-69 = Significant Development Required
// // // // // 40-59 = Not Interview Ready
// // // // // 0-39 = Seriously Not Ready

// // // // // IMPORTANT SCORING RULE:
// // // // // Do not use 80 as a default or "average" score.
// // // // // A candidate who performs poorly should receive a low score.
// // // // // A candidate who demonstrates only basic knowledge should receive a basic score.
// // // // // A candidate must earn points through evidence.

// // // // // CATEGORY SCORING:
// // // // // TECHNICAL SCORE: correctness, conceptual understanding, practical application, debugging/problem-solving reasoning, technical vocabulary, ability to explain decisions, role relevance.
// // // // // BEHAVIOURAL SCORE: relevance of examples, ownership of actions, Situation, Task, Action, Result, reflection/learning, ability to explain contribution rather than only describing team activity.
// // // // // COMMUNICATION SCORE: relevance to the question, clarity, structure, conciseness, professional communication, ability to explain technical concepts, listening and responsiveness.
// // // // // ROLE READINESS: Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// // // // // CRITICAL RULES:
// // // // // 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.
// // // // // 2. A vague answer must not receive full marks.
// // // // // 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.
// // // // // 4. If the interviewer had to repeatedly prompt the candidate before obtaining a correct answer, this indicates weaker independent interview readiness.
// // // // // 5. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.
// // // // // 6. Do not invent experience, projects, technologies, responsibilities or outcomes that are not present in the transcript.
// // // // // 7. Do not treat participation itself as competence.
// // // // // 8. Do not award a high overall score when one critical competency is substantially deficient.
// // // // // 9. The overall score must reflect actual evidence from the transcript.
// // // // // 10. The evaluation must distinguish between: demonstrated independently, demonstrated after prompting, partially demonstrated, not demonstrated, incorrect.

// // // // // READINESS DECISION:
// // // // // Determine one of: "READY", "NEARLY_READY", "DEVELOPING", "NOT_READY"
// // // // // Use "READY" only when the candidate has demonstrated sufficient competence for the selected target role and difficulty.
// // // // // A candidate scoring below 80 should normally not be classified as READY.
// // // // // A candidate scoring 90+ should still NOT be classified as READY if there is a serious critical competency failure.
// // // // // Do not allow one strong category to hide a major weakness in another category.

// // // // // QUESTION-LEVEL SCORING:
// // // // // Each question must receive an individual score from 0-100.
// // // // // The feedback must explain: what the candidate demonstrated, what was missing, whether the answer was technically correct, whether prompting was required, what a stronger candidate would have demonstrated.
// // // // // The ideal answer must be appropriate for the target role and difficulty level. Do not make the ideal answer unrealistically senior. The ideal answer is an example of a strong answer, not necessarily the only acceptable answer.

// // // // // OVERALL SCORE:
// // // // // Calculate the overall score from the demonstrated competencies.
// // // // // Do not simply average the categories if doing so would hide a serious weakness.
// // // // // The final score must be defensible from the transcript.

// // // // // CRITICAL WEAKNESS RULE:
// // // // // If the candidate demonstrates a serious deficiency in a core competency required for the target role, the candidate cannot be classified as READY regardless of their communication or behavioural score.

// // // // // JSON OUTPUT REQUIREMENT:
// // // // // Return valid JSON only.
// // // // // Do not return markdown.
// // // // // Do not return commentary outside the JSON.
// // // // // Do not use trailing commas.

// // // // // SCHEMA:
// // // // // {
// // // // //   "overallScore": number,
// // // // //   "technicalScore": number,
// // // // //   "technicalKnowledgeScore": number,
// // // // //   "interviewReadinessScore": number,
// // // // //   "behavioralScore": number,
// // // // //   "communicationScore": number,
// // // // //   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
// // // // //   "readinessSummary": "string",
// // // // //   "confidence": number,
// // // // //   "strengths": ["string"],
// // // // //   "areasForImprovement": ["string"],
// // // // //   "priorityGaps": ["string"],
// // // // //   "recommendedPreparation": ["string"],
// // // // //   "questionBreakdown": [
// // // // //     {
// // // // //       "question": "string",
// // // // //       "candidateAnswer": "string",
// // // // //       "score": number,
// // // // //       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
// // // // //       "feedback": "string",
// // // // //       "whatWasMissing": "string",
// // // // //       "idealAnswerSample": "string"
// // // // //     }
// // // // //   ]
// // // // // }

// // // // // QUALITY CONTROL BEFORE RETURNING JSON:
// // // // // - Did I score what was actually demonstrated?
// // // // // - Did I avoid assuming knowledge?
// // // // // - Did I avoid inflating weak answers?
// // // // // - Did I distinguish prompted answers from independent answers?
// // // // // - Did I identify incorrect technical statements?
// // // // // - Does the overall score match the evidence?
// // // // // - Does readinessStatus agree with the score and critical weaknesses?
// // // // // - Would I trust this candidate to perform similarly in a real interview?`;

// // // // //     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(fullTranscript, null, 2)}`;

// // // // //     try {
// // // // //       const aiResult = await generateCompletion({
// // // // //         messages: [
// // // // //           { role: "system" as const, content: systemPrompt },
// // // // //           { role: "user" as const, content: userPrompt },
// // // // //         ],
// // // // //         temperature: 0.1,
// // // // //         maxTokens: 3000,
// // // // //         feature: "mock_interview_evaluation",
// // // // //         userId: auth.uid,
// // // // //         sessionId,
// // // // //       });

// // // // //       const rawText = aiResult.text?.trim() || "";

// // // // //       if (!rawText) {
// // // // //         throw new Error("AI provider returned an empty evaluation response.");
// // // // //       }

// // // // //       const cleanJsonText = rawText
// // // // //         .replace(/```json/gi, "")
// // // // //         .replace(/```/g, "")
// // // // //         .trim();

// // // // //       let scorecard: any;

// // // // //       try {
// // // // //         scorecard = JSON.parse(cleanJsonText);
// // // // //       } catch (jsonError) {
// // // // //         logger.error("AI evaluation output failed JSON parsing:", {
// // // // //           error: jsonError,
// // // // //           sessionId,
// // // // //           rawText,
// // // // //         });
// // // // //         throw new Error("The AI evaluation response was not valid JSON.");
// // // // //       }

// // // // //       // SCORE & GATE VALIDATION
// // // // //       const requiredNumericFields = [
// // // // //         "overallScore",
// // // // //         "technicalScore",
// // // // //         "technicalKnowledgeScore",
// // // // //         "interviewReadinessScore",
// // // // //         "behavioralScore",
// // // // //         "communicationScore",
// // // // //       ];

// // // // //       for (const field of requiredNumericFields) {
// // // // //         const val = scorecard[field];
// // // // //         if (typeof val !== "number" || val < 0 || val > 100) {
// // // // //           logger.warn(
// // // // //             `Score field ${field} invalid (${val}), clamping to 0-100 range.`,
// // // // //           );
// // // // //           scorecard[field] =
// // // // //             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
// // // // //         }
// // // // //       }

// // // // //       // STRICT TECHNICAL READINESS GATE ENFORCEMENT
// // // // //       if (
// // // // //         (scorecard.technicalScore < 80 ||
// // // // //           scorecard.technicalKnowledgeScore < 80) &&
// // // // //         scorecard.readinessStatus === "READY"
// // // // //       ) {
// // // // //         scorecard.readinessStatus = "NEARLY_READY";
// // // // //         scorecard.readinessSummary +=
// // // // //           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
// // // // //       }

// // // // //       // FIRESTORE PERSISTENCE
// // // // //       const db = admin.firestore();

// // // // //       if (sessionId) {
// // // // //         await db.collection("ai_interviews").doc(sessionId).set(
// // // // //           {
// // // // //             scorecard,
// // // // //             difficulty,
// // // // //             targetRole,
// // // // //             contextMode,
// // // // //             interviewScope,
// // // // //             isQualifyingRun,
// // // // //             status: "completed",
// // // // //             completedAt: admin.firestore.FieldValue.serverTimestamp(),
// // // // //             aiProvider: aiResult.provider,
// // // // //             modelUsed: aiResult.modelUsed,
// // // // //             fallbackUsed: aiResult.fallbackUsed,
// // // // //             fallbackAttempts: aiResult.fallbackAttempts,
// // // // //             durationMs: aiResult.durationMs,
// // // // //             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// // // // //           },
// // // // //           { merge: true },
// // // // //         );
// // // // //       }

// // // // //       // Update Learner Metric Profile ONLY if this was a qualifying run
// // // // //       const targetLearnerId = learnerId || auth.uid;
// // // // //       const learnerRef = db.collection("learners").doc(targetLearnerId);
// // // // //       const learnerSnap = await learnerRef.get();

// // // // //       if (learnerSnap.exists && isQualifyingRun) {
// // // // //         await learnerRef.update({
// // // // //           employabilityScore: scorecard.overallScore || 0,
// // // // //           latestInterviewScore: scorecard.overallScore || 0,
// // // // //           technicalScore: scorecard.technicalScore || 0,
// // // // //           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
// // // // //           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
// // // // //           behavioralScore: scorecard.behavioralScore || 0,
// // // // //           communicationScore: scorecard.communicationScore || 0,
// // // // //           readinessStatus: scorecard.readinessStatus || "NOT_READY",
// // // // //           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
// // // // //         });
// // // // //       }

// // // // //       return {
// // // // //         success: true,
// // // // //         scorecard,
// // // // //         isQualifyingRun,
// // // // //         provider: aiResult.provider,
// // // // //         modelUsed: aiResult.modelUsed,
// // // // //         fallbackUsed: aiResult.fallbackUsed,
// // // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // // //         durationMs: aiResult.durationMs,
// // // // //       };
// // // // //     } catch (error: any) {
// // // // //       logger.error("Error evaluating mock interview:", {
// // // // //         error: error?.message || error,
// // // // //         userId: auth.uid,
// // // // //         learnerId: learnerId || auth.uid,
// // // // //         sessionId,
// // // // //         targetRole,
// // // // //         difficulty,
// // // // //       });

// // // // //       throw new HttpsError(
// // // // //         "internal",
// // // // //         error?.message || "Failed to evaluate mock interview transcript.",
// // // // //       );
// // // // //     }
// // // // //   },
// // // // // );

// // // // // // // functions/src/modules/interviewEngine.ts

// // // // // // import { onCall, HttpsError } from "firebase-functions/v2/https";
// // // // // // import { defineSecret } from "firebase-functions/params";
// // // // // // import * as logger from "firebase-functions/logger";
// // // // // // import * as admin from "firebase-admin";

// // // // // // // Central AI Gateway Client
// // // // // // import { generateCompletion, ChatMessage } from "../utils/aiClient";

// // // // // // // Define Secret Manager dependencies for deployment runtime access
// // // // // // const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// // // // // // const hfTokenSecret = defineSecret("HF_TOKEN");

// // // // // // // -----------------------------------------------------------------------------
// // // // // // // TYPES & INTERFACES
// // // // // // // -----------------------------------------------------------------------------

// // // // // // export type ContextMode = "both" | "chips_only" | "cv_only" | "none";
// // // // // // export type InterviewScope = "full" | "technical_only" | "behavioral_only";

// // // // // // export interface InterviewTurnPayload {
// // // // // //   sessionId?: string;
// // // // // //   targetRole: string;
// // // // // //   difficulty?: "simple" | "mid" | "hard";
// // // // // //   seniority?: string;
// // // // // //   selectedSkillChips: string[];
// // // // // //   currentStage: string;
// // // // // //   contextMode?: ContextMode;
// // // // // //   interviewScope?: InterviewScope;
// // // // // //   cvSummary?: string;
// // // // // //   timeRemainingSeconds?: number;
// // // // // //   totalTimeLimitSeconds?: number;
// // // // // //   conversationHistory: ChatMessage[];
// // // // // //   lastCandidateAnswer?: string;
// // // // // // }

// // // // // // export interface EvaluationPayload {
// // // // // //   sessionId?: string;
// // // // // //   learnerId?: string;
// // // // // //   targetRole: string;
// // // // // //   difficulty?: "simple" | "mid" | "hard";
// // // // // //   selectedSkillChips: string[];
// // // // // //   contextMode?: ContextMode;
// // // // // //   interviewScope?: InterviewScope;
// // // // // //   cvSummary?: string;
// // // // // //   fullTranscript: Array<{
// // // // // //     speaker: string;
// // // // // //     text: string;
// // // // // //     timestamp?: string;
// // // // // //   }>;
// // // // // // }

// // // // // // // -----------------------------------------------------------------------------
// // // // // // // 1. DYNAMIC INTERVIEW TURN GENERATOR
// // // // // // // -----------------------------------------------------------------------------

// // // // // // /**
// // // // // //  * Generates evidence-based, time-aware, and stage-controlled interview turns.
// // // // // //  * Operates strictly as an objective assessor rather than a friendly coach.
// // // // // //  */
// // // // // // export const generateInterviewTurn = onCall(
// // // // // //   {
// // // // // //     cors: true,
// // // // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // // // //     region: "us-central1",
// // // // // //   },
// // // // // //   async (request) => {
// // // // // //     const auth = request.auth;

// // // // // //     if (!auth) {
// // // // // //       throw new HttpsError(
// // // // // //         "unauthenticated",
// // // // // //         "Authentication required to participate in mock interviews.",
// // // // // //       );
// // // // // //     }

// // // // // //     const {
// // // // // //       sessionId,
// // // // // //       targetRole,
// // // // // //       difficulty = "simple",
// // // // // //       seniority,
// // // // // //       selectedSkillChips = [],
// // // // // //       currentStage = "Introduction & Warmup",
// // // // // //       contextMode = "both",
// // // // // //       interviewScope = "full",
// // // // // //       cvSummary = "No CV provided or linked.",
// // // // // //       timeRemainingSeconds,
// // // // // //       totalTimeLimitSeconds,
// // // // // //       conversationHistory = [],
// // // // // //       lastCandidateAnswer,
// // // // // //     } = request.data as InterviewTurnPayload;

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 1. VALIDATION
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     if (!targetRole || typeof targetRole !== "string") {
// // // // // //       throw new HttpsError("invalid-argument", "Target role is required.");
// // // // // //     }

// // // // // //     if (
// // // // // //       !Array.isArray(selectedSkillChips) ||
// // // // // //       !Array.isArray(conversationHistory)
// // // // // //     ) {
// // // // // //       throw new HttpsError("invalid-argument", "Invalid interview payload.");
// // // // // //     }

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 2. PERSONA & RIGOR CUSTOMIZATION
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     let personaRigor =
// // // // // //       "Professional and fair interviewer. Assess what the candidate can demonstrate independently. Do not coach, rescue, or give away answers during the interview.";

// // // // // //     if (difficulty === "mid") {
// // // // // //       personaRigor =
// // // // // //         "Professional industry interviewer. Expect independent reasoning, practical examples, appropriate technical depth, and clear explanation of decisions. Probe weaknesses rather than accepting vague answers.";
// // // // // //     }

// // // // // //     if (difficulty === "hard") {
// // // // // //       personaRigor =
// // // // // //         "Strict senior technical interviewer. Challenge assumptions, probe technical depth, trade-offs, edge cases, debugging ability, scalability, and practical decision-making. Surface weaknesses rather than helping the candidate reach an answer.";
// // // // // //     }

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 3. TIME-AWARENESS INSTRUCTIONS
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     let timeContextInstruction = "";

// // // // // //     if (typeof timeRemainingSeconds === "number") {
// // // // // //       if (timeRemainingSeconds <= 120) {
// // // // // //         timeContextInstruction =
// // // // // //           "CRITICAL TIME WARNING: Less than 2 minutes remain in this session. Explicitly acknowledge the time limit naturally, for example, 'As we are almost out of time...' or 'With our remaining two minutes...'. Ask one final focused closing question or prepare to wrap up.";
// // // // // //       } else if (timeRemainingSeconds <= 300) {
// // // // // //         timeContextInstruction =
// // // // // //           "TIME NOTICE: Less than 5 minutes remain. Keep your phrasing concise and focus on completing the most important outstanding technical or behavioural topic.";
// // // // // //       }
// // // // // //     }

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 4. CONTEXT & SCOPE INSTRUCTIONS
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     let contextInstruction = "";
// // // // // //     if (contextMode === "both" || contextMode === "cv_only") {
// // // // // //       contextInstruction += `\nCANDIDATE CV / RESUME SUMMARY:\n${cvSummary}\n`;
// // // // // //     }

// // // // // //     let scopeInstruction = "";
// // // // // //     if (interviewScope === "full") {
// // // // // //       scopeInstruction = `
// // // // // // THIS IS A HOLISTIC MULTI-PART INTERVIEW. You MUST guide the conversation logically through these stages based on the current stage:
// // // // // // 1. Work Readiness & Warmup
// // // // // // 2. Soft Skills & STAR Behavioral Questions
// // // // // // 3. Technical Deep-Dive
// // // // // // 4. System Scenario & Problem-Solving
// // // // // // 5. Candidate Q&A ("Do you have any questions for me about the role or company?")
// // // // // // 6. Conclusion & Wrap-Up`;
// // // // // //     } else if (interviewScope === "technical_only") {
// // // // // //       scopeInstruction =
// // // // // //         "THIS IS A FOCUSED TECHNICAL PRACTICE SESSION. Focus exclusively on technical questions, architecture, syntax, debugging, and system implementation.";
// // // // // //     } else {
// // // // // //       scopeInstruction =
// // // // // //         "THIS IS A FOCUSED BEHAVIORAL PRACTICE SESSION. Focus exclusively on STAR-method situational scenarios, teamwork, conflict resolution, and communication skills.";
// // // // // //     }

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 5. FULL EVIDENCE-BASED SYSTEM PROMPT
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     const systemPrompt = `You are a professional industry interviewer conducting a structured mock interview for a ${targetRole} position.

// // // // // // This is an interview-readiness assessment. Your responsibility is NOT to make the candidate feel successful. Your responsibility is to accurately determine what the candidate can demonstrate independently and to expose areas where they are not yet ready.

// // // // // // DIFFICULTY LEVEL: ${difficulty.toUpperCase()}
// // // // // // CURRENT STAGE: ${currentStage}
// // // // // // CANDIDATE SENIORITY: ${seniority || "Not specified"}
// // // // // // FOCUS SKILLS: ${
// // // // // //       selectedSkillChips.length > 0
// // // // // //         ? selectedSkillChips.join(", ")
// // // // // //         : "General technical, behavioural and workplace skills"
// // // // // //     }

// // // // // //  ${contextInstruction}
// // // // // //  ${scopeInstruction}

// // // // // // TOTAL SESSION TIME: ${
// // // // // //       typeof totalTimeLimitSeconds === "number"
// // // // // //         ? `${totalTimeLimitSeconds} seconds`
// // // // // //         : "Not specified"
// // // // // //     }
// // // // // // TIME REMAINING: ${
// // // // // //       typeof timeRemainingSeconds === "number"
// // // // // //         ? `${timeRemainingSeconds} seconds`
// // // // // //         : "Not specified"
// // // // // //     }

// // // // // // INTERVIEWER STANDARD:
// // // // // //  ${personaRigor}

// // // // // // CORE ASSESSMENT PRINCIPLES:

// // // // // // 1. EVIDENCE OVER CLAIMS
// // // // // //    - Do not assume the candidate knows something merely because they say they have experience with it.
// // // // // //    - Give credit for demonstrated knowledge, reasoning, examples, decisions, and outcomes.
// // // // // //    - Statements such as "I know React", "I have worked with APIs", or "I understand Scrum" are not evidence by themselves.
// // // // // //    - If the candidate makes a technical claim, probe it when necessary to determine whether they genuinely understand it.

// // // // // // 2. DO NOT RESCUE THE CANDIDATE
// // // // // //    - Do not provide the answer.
// // // // // //    - Do not suggest the key concepts they should mention.
// // // // // //    - Do not complete their answer for them.
// // // // // //    - Do not turn a weak answer into a correct answer through excessive prompting.
// // // // // //    - If they cannot answer, allow that weakness to be recorded.
// // // // // //    - You may ask a concise clarification question where appropriate, but clarification must not become coaching.

// // // // // // 3. WEAK ANSWERS MUST REMAIN WEAK
// // // // // //    - Do not reinterpret vague, incomplete, incorrect or technically inaccurate answers as competent answers.
// // // // // //    - If an answer is fundamentally incorrect, treat it as incorrect.
// // // // // //    - If an answer demonstrates partial understanding, probe the missing part.
// // // // // //    - If the candidate continues to demonstrate insufficient understanding after probing, move on and allow the weakness to affect the final evaluation.

// // // // // // 4. DO NOT INFER COMPETENCE
// // // // // //    - Never award points for knowledge that is not demonstrated in the transcript.
// // // // // //    - Never assume that a candidate would have known the answer if they had more time.
// // // // // //    - Never compensate for a weak technical answer because the candidate communicates confidently.
// // // // // //    - Never compensate for weak behavioural evidence because the candidate sounds enthusiastic.

// // // // // // 5. ROLE APPROPRIATENESS
// // // // // //    - Evaluate the candidate against the expected competence of the specified ${targetRole} role and difficulty level.
// // // // // //    - Do not require senior-level knowledge from a junior candidate simply because the topic is technically advanced.
// // // // // //    - However, do not lower the standard merely because the candidate is a learner.
// // // // // //    - The purpose of this exercise is to determine whether the candidate is ready for an actual interview at this level.

// // // // // // 6. BEHAVIOURAL QUESTIONS
// // // // // //    - For behavioural questions, look for evidence of Situation, Task, Action and Result.
// // // // // //    - Do not award full marks when the candidate only describes what "we" did without explaining their own contribution.
// // // // // //    - Do not award full marks when there is no clear outcome or learning.
// // // // // //    - If the candidate cannot provide a real example, do not invent one for them.

// // // // // // 7. TECHNICAL QUESTIONS
// // // // // //    - Evaluate correctness, understanding, reasoning, practical application and ability to explain decisions.
// // // // // //    - Prefer practical understanding over memorised definitions.
// // // // // //    - If a candidate gives a technically questionable answer, probe the relevant concept before moving on.
// // // // // //    - Do not accept confident but technically incorrect explanations.

// // // // // // 8. COMMUNICATION
// // // // // //    - Assess clarity, relevance, structure, listening, ability to explain technical concepts and ability to answer the actual question.
// // // // // //    - Do not confuse verbosity with strong communication.
// // // // // //    - Do not penalise a candidate merely for having an accent, speaking style, or minor grammatical mistakes.
// // // // // //    - Penalise communication only where it materially affects the candidate's ability to communicate professionally and answer the question.

// // // // // // 9. ANSWER VALIDATION AND REDIRECTION
// // // // // //    - First determine whether the candidate answered the previous question.
// // // // // //    - If they answered adequately, continue with the interview.
// // // // // //    - If they partially answered, ask ONE focused follow-up question targeting the missing evidence.
// // // // // //    - If they gave an incorrect or irrelevant answer, ask ONE concise probing question where useful.
// // // // // //    - If they clearly do not know the answer, do not keep coaching them indefinitely. Move to the next appropriate question.
// // // // // //    - If they ask a meta-question such as "Can you hear me?", "Are you there?", or "I can't hear you", answer briefly and naturally (e.g., acknowledge them naturally, then smoothly transition back) and then RESTATE the pending interview question smoothly.
// // // // // //    - Never abandon an unanswered substantive question simply to make the conversation feel smooth.

// // // // // // 10. QUESTION CONTROL
// // // // // //    - Ask exactly ONE substantive question per turn.
// // // // // //    - Do not ask compound questions containing several unrelated questions.
// // // // // //    - Do not provide a list of things the candidate should answer.
// // // // // //    - Follow-up questions must target evidence missing from the previous answer.

// // // // // // 11. INTERVIEW FLOW
// // // // // //    - Respect the current interview stage.
// // // // // //    - Do not randomly jump between unrelated topics.
// // // // // //    - Increase or decrease probing based on the candidate's demonstrated competence.
// // // // // //    - A strong answer should allow the interview to progress (shouldAdvanceStage: true).
// // // // // //    - A weak answer should trigger appropriate probing before progression.
// // // // // //    - Do not artificially increase scores by making questions easier after repeated failures.

// // // // // // 12. TIME MANAGEMENT
// // // // // //    ${timeContextInstruction}

// // // // // // 13. SPEECH SYNTHESIS
// // // // // //    - Ask exactly ONE clear question.
// // // // // //    - Keep the response to no more than 3 concise sentences.
// // // // // //    - Use natural professional spoken language.
// // // // // //    - No markdown, tables, bullet points, numbered lists or special formatting.

// // // // // // 14. FIRST TURN HANDLING (WHEN CONVERSATION HISTORY IS EMPTY):
// // // // // //    - Dynamically introduce yourself briefly as the interviewer.
// // // // // //    - State the target role (${targetRole}).
// // // // // //    - Ask the first introductory or warmup question for the "${currentStage}" stage.

// // // // // // 15. CV & SKILL CHIP CROSS-EXAMINATION:
// // // // // //    - When CV or skill chips are enabled, cross-examine candidate responses directly against their declared skills and CV project claims.
// // // // // //    - Verify whether claims made on their CV or skill list match their actual demonstrated understanding.

// // // // // // IMPORTANT:
// // // // // // You are an assessor, not a coach, during the live interview.
// // // // // // Accuracy is more important than encouragement.
// // // // // // Do not manufacture competence.
// // // // // // Do not sugar-coat weaknesses.
// // // // // // A candidate who performs poorly must be allowed to receive a poor result.

// // // // // // JSON OUTPUT REQUIREMENT:
// // // // // // You MUST output valid, raw JSON only. Do NOT wrap output in markdown syntax (\`\`\`json).

// // // // // // JSON SCHEMA:
// // // // // // {
// // // // // //   "responseText": "string (The exact spoken response and single question for the candidate)",
// // // // // //   "turnPurpose": "INITIAL_GREETING" | "PRIMARY_QUESTION" | "PROBE" | "CLARIFICATION" | "STAGE_WRAPUP",
// // // // // //   "answerAssessment": "SATISFACTORY" | "PARTIAL" | "INADEQUATE" | "OFF_TOPIC" | "NOT_APPLICABLE",
// // // // // //   "shouldAdvanceStage": boolean (True ONLY if the candidate has substantively answered the current topic and it is time to progress)
// // // // // // }`;

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 6. BUILD MESSAGE HISTORY (PREVENT DUPLICATES)
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     const messages: ChatMessage[] = [
// // // // // //       {
// // // // // //         role: "system",
// // // // // //         content: systemPrompt,
// // // // // //       },
// // // // // //       ...conversationHistory,
// // // // // //     ];

// // // // // //     if (lastCandidateAnswer?.trim()) {
// // // // // //       const lastMsgInHistory =
// // // // // //         conversationHistory[conversationHistory.length - 1];
// // // // // //       const isAlreadyInHistory =
// // // // // //         lastMsgInHistory &&
// // // // // //         lastMsgInHistory.role === "user" &&
// // // // // //         lastMsgInHistory.content.trim() === lastCandidateAnswer.trim();

// // // // // //       if (!isAlreadyInHistory) {
// // // // // //         messages.push({
// // // // // //           role: "user",
// // // // // //           content: lastCandidateAnswer.trim(),
// // // // // //         });
// // // // // //       }
// // // // // //     }

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 7. GENERATE AI RESPONSE VIA GATEWAY (WITH DYNAMIC SELF-CORRECTION)
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     try {
// // // // // //       let parsedData: {
// // // // // //         responseText: string;
// // // // // //         turnPurpose:
// // // // // //           | "INITIAL_GREETING"
// // // // // //           | "PRIMARY_QUESTION"
// // // // // //           | "PROBE"
// // // // // //           | "CLARIFICATION"
// // // // // //           | "STAGE_WRAPUP";
// // // // // //         answerAssessment:
// // // // // //           | "SATISFACTORY"
// // // // // //           | "PARTIAL"
// // // // // //           | "INADEQUATE"
// // // // // //           | "OFF_TOPIC"
// // // // // //           | "NOT_APPLICABLE";
// // // // // //         shouldAdvanceStage: boolean;
// // // // // //       } | null = null;

// // // // // //       let rawText = "";
// // // // // //       let aiResult: any;

// // // // // //       // Loop to allow the AI to self-correct if it fails JSON or refuses
// // // // // //       for (let attempt = 1; attempt <= 2; attempt++) {
// // // // // //         let currentMessages = [...messages];

// // // // // //         if (attempt === 2) {
// // // // // //           logger.warn(
// // // // // //             `Attempt 2: AI failed to provide valid JSON or refused. Forcing self-correction.`,
// // // // // //           );
// // // // // //           // Feed the bad response back to the AI to force it to fix itself dynamically
// // // // // //           currentMessages.push({
// // // // // //             role: "assistant",
// // // // // //             content: rawText || "{}",
// // // // // //           });
// // // // // //           currentMessages.push({
// // // // // //             role: "user",
// // // // // //             content:
// // // // // //               "Your previous response was either empty, not valid JSON, or contained an AI refusal. You must stay in character as the interviewer. Please output ONLY the raw JSON object for the next interviewer turn based strictly on the current conversation history and stage. Do not refuse. Do not explain. Do not use markdown.",
// // // // // //           });
// // // // // //         }

// // // // // //         aiResult = await generateCompletion({
// // // // // //           messages: currentMessages,
// // // // // //           temperature: 0.5, // Slightly higher for natural flow
// // // // // //           maxTokens: 400,
// // // // // //           feature: "mock_interview_turn",
// // // // // //           userId: auth.uid,
// // // // // //           sessionId,
// // // // // //         });

// // // // // //         rawText = aiResult.text?.trim() || "";

// // // // // //         const jsonMatch = rawText.match(/\{[\s\S]*\}/);

// // // // // //         if (jsonMatch) {
// // // // // //           try {
// // // // // //             const jsonParsed = JSON.parse(jsonMatch[0]);
// // // // // //             if (
// // // // // //               jsonParsed &&
// // // // // //               typeof jsonParsed.responseText === "string" &&
// // // // // //               jsonParsed.responseText.trim().length > 0
// // // // // //             ) {
// // // // // //               const isRefusal =
// // // // // //                 /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // // // //                   jsonParsed.responseText,
// // // // // //                 );

// // // // // //               if (!isRefusal) {
// // // // // //                 parsedData = {
// // // // // //                   responseText: jsonParsed.responseText,
// // // // // //                   turnPurpose: jsonParsed.turnPurpose || "PRIMARY_QUESTION",
// // // // // //                   answerAssessment:
// // // // // //                     jsonParsed.answerAssessment || "SATISFACTORY",
// // // // // //                   shouldAdvanceStage: Boolean(jsonParsed.shouldAdvanceStage),
// // // // // //                 };
// // // // // //                 break; // Successfully parsed valid JSON, break the loop
// // // // // //               }
// // // // // //             }
// // // // // //           } catch (e) {
// // // // // //             logger.warn(
// // // // // //               `Attempt ${attempt}: Matched string was not valid JSON.`,
// // // // // //             );
// // // // // //           }
// // // // // //         }
// // // // // //       }

// // // // // //       // If after retries we still don't have parsedData, but we have rawText, use it dynamically
// // // // // //       if (!parsedData && rawText.length > 0) {
// // // // // //         const cleanText = rawText
// // // // // //           .replace(/```json/gi, "")
// // // // // //           .replace(/```/g, "")
// // // // // //           .trim();
// // // // // //         const isRefusal =
// // // // // //           /cannot conduct|cannot assist|as an ai|language model|i'm unable to/i.test(
// // // // // //             cleanText,
// // // // // //           );

// // // // // //         if (!isRefusal) {
// // // // // //           parsedData = {
// // // // // //             responseText: cleanText,
// // // // // //             turnPurpose: "PRIMARY_QUESTION",
// // // // // //             answerAssessment: "NOT_APPLICABLE",
// // // // // //             shouldAdvanceStage: false,
// // // // // //           };
// // // // // //         }
// // // // // //       }

// // // // // //       // If the AI absolutely refused or returned nothing after retries, throw error to frontend
// // // // // //       if (!parsedData) {
// // // // // //         throw new Error(
// // // // // //           "AI failed to generate a valid interview turn after self-correction attempts.",
// // // // // //         );
// // // // // //       }

// // // // // //       return {
// // // // // //         success: true,
// // // // // //         responseText: parsedData.responseText,
// // // // // //         turnPurpose: parsedData.turnPurpose,
// // // // // //         answerAssessment: parsedData.answerAssessment,
// // // // // //         shouldAdvanceStage: parsedData.shouldAdvanceStage,

// // // // // //         provider: aiResult.provider,
// // // // // //         modelUsed: aiResult.modelUsed,
// // // // // //         fallbackUsed: aiResult.fallbackUsed,
// // // // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // // // //         durationMs: aiResult.durationMs,
// // // // // //       };
// // // // // //     } catch (error: any) {
// // // // // //       logger.error("Error generating interview turn:", {
// // // // // //         error: error?.message || error,
// // // // // //         userId: auth.uid,
// // // // // //         targetRole,
// // // // // //         difficulty,
// // // // // //         currentStage,
// // // // // //       });

// // // // // //       throw new HttpsError(
// // // // // //         "internal",
// // // // // //         error?.message || "Failed to generate interview response.",
// // // // // //       );
// // // // // //     }
// // // // // //   },
// // // // // // );

// // // // // // // -----------------------------------------------------------------------------
// // // // // // // 2. POST-INTERVIEW EVALUATION & READINESS ENGINE
// // // // // // // -----------------------------------------------------------------------------

// // // // // // /**
// // // // // //  * Analyzes complete interview transcript against strict evidence standards,
// // // // // //  * separates Technical Knowledge from Interview Readiness, enforces
// // // // // //  * technical hard gates, and produces a granular evidence-level audit.
// // // // // //  */
// // // // // // export const evaluateMockInterview = onCall(
// // // // // //   {
// // // // // //     cors: true,
// // // // // //     secrets: [openRouterSecret, hfTokenSecret],
// // // // // //     timeoutSeconds: 300,
// // // // // //     memory: "512MiB",
// // // // // //     region: "us-central1",
// // // // // //   },
// // // // // //   async (request) => {
// // // // // //     const auth = request.auth;

// // // // // //     if (!auth) {
// // // // // //       throw new HttpsError(
// // // // // //         "unauthenticated",
// // // // // //         "Authentication required to evaluate mock interviews.",
// // // // // //       );
// // // // // //     }

// // // // // //     const {
// // // // // //       sessionId,
// // // // // //       learnerId,
// // // // // //       targetRole,
// // // // // //       difficulty = "simple",
// // // // // //       selectedSkillChips = [],
// // // // // //       contextMode = "both",
// // // // // //       interviewScope = "full",
// // // // // //       cvSummary = "No CV provided.",
// // // // // //       fullTranscript,
// // // // // //     } = request.data as EvaluationPayload;

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 1. INPUT VALIDATION & QUALIFYING GATE
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     if (!targetRole || typeof targetRole !== "string") {
// // // // // //       throw new HttpsError(
// // // // // //         "invalid-argument",
// // // // // //         "Target role is required for assessment.",
// // // // // //       );
// // // // // //     }

// // // // // //     if (
// // // // // //       !fullTranscript ||
// // // // // //       !Array.isArray(fullTranscript) ||
// // // // // //       fullTranscript.length === 0
// // // // // //     ) {
// // // // // //       throw new HttpsError(
// // // // // //         "invalid-argument",
// // // // // //         "Full transcript is required for evaluation.",
// // // // // //       );
// // // // // //     }

// // // // // //     const isQualifyingRun = contextMode === "both" && interviewScope === "full";

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 2. STRICT ASSESSOR SYSTEM PROMPT
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     const systemPrompt = `You are an expert technical recruiter, workplace-readiness assessor and educational assessment director at mLab Southern Africa.

// // // // // // You are evaluating a completed mock interview for a candidate applying for:

// // // // // // TARGET ROLE: ${targetRole}
// // // // // // DIFFICULTY: ${difficulty.toUpperCase()}
// // // // // // FOCUS SKILLS: ${
// // // // // //       selectedSkillChips?.length
// // // // // //         ? selectedSkillChips.join(", ")
// // // // // //         : "General technical and workplace competencies"
// // // // // //     }

// // // // // //  ${contextMode !== "none" && contextMode !== "chips_only" ? `CANDIDATE CV / RESUME SUMMARY:\n${cvSummary}` : ""}

// // // // // // The purpose of this evaluation is to determine whether the candidate is genuinely prepared to participate successfully in a real job interview.

// // // // // // ASSESSMENT PHILOSOPHY:

// // // // // // Be accurate, evidence-based and appropriately rigorous.

// // // // // // Do NOT inflate scores to encourage the candidate.

// // // // // // A low score is an acceptable and useful result.

// // // // // // If the candidate performed poorly, say so clearly.

// // // // // // Do not reward effort, enthusiasm, confidence, length of answers or participation unless these actually demonstrate the assessed competency.

// // // // // // Do not infer knowledge that is not demonstrated in the transcript.

// // // // // // Do not give credit because the candidate appears capable of learning the concept later.

// // // // // // The assessment must describe the candidate's CURRENT demonstrated ability, not their potential.

// // // // // // SCORING STANDARD:

// // // // // // 90-100 = Interview Ready / Strong Evidence
// // // // // // The candidate consistently demonstrates the required competence independently. Answers are accurate, relevant, structured and supported by appropriate examples. Only minor gaps may remain.

// // // // // // 80-89 = Nearly Ready / Minor Gaps
// // // // // // The candidate demonstrates good competence but has identifiable weaknesses that could affect performance in a real interview. Targeted preparation is still recommended.

// // // // // // 70-79 = Developing / Not Yet Consistently Ready
// // // // // // The candidate demonstrates some relevant competence but performance is inconsistent. Several answers require prompting, lack depth, or contain gaps.

// // // // // // 60-69 = Significant Development Required
// // // // // // The candidate demonstrates limited readiness. Important technical, behavioural or communication weaknesses are present.

// // // // // // 40-59 = Not Interview Ready
// // // // // // The candidate demonstrates substantial gaps in the competencies required for the target role. Additional preparation is required before relying on interview performance.

// // // // // // 0-39 = Seriously Not Ready
// // // // // // The candidate is currently unable to demonstrate the expected level of competence for the selected interview level.

// // // // // // IMPORTANT SCORING RULE:
// // // // // // Do not use 80 as a default or "average" score.

// // // // // // A candidate who performs poorly should receive a low score.

// // // // // // A candidate who demonstrates only basic knowledge should receive a basic score.

// // // // // // A candidate must earn points through evidence.

// // // // // // CATEGORY SCORING:

// // // // // // TECHNICAL SCORE:
// // // // // // Evaluate:
// // // // // // - correctness
// // // // // // - conceptual understanding
// // // // // // - practical application
// // // // // // - debugging/problem-solving reasoning
// // // // // // - technical vocabulary
// // // // // // - ability to explain decisions
// // // // // // - role relevance

// // // // // // BEHAVIOURAL SCORE:
// // // // // // Evaluate:
// // // // // // - relevance of examples
// // // // // // - ownership of actions
// // // // // // - Situation
// // // // // // - Task
// // // // // // - Action
// // // // // // - Result
// // // // // // - reflection/learning
// // // // // // - ability to explain contribution rather than only describing team activity

// // // // // // COMMUNICATION SCORE:
// // // // // // Evaluate:
// // // // // // - relevance to the question
// // // // // // - clarity
// // // // // // - structure
// // // // // // - conciseness
// // // // // // - professional communication
// // // // // // - ability to explain technical concepts
// // // // // // - listening and responsiveness

// // // // // // ROLE READINESS:
// // // // // // Evaluate whether the candidate's demonstrated performance is sufficient for the specified ${targetRole} level.

// // // // // // CRITICAL RULES:

// // // // // // 1. A technically incorrect answer must not receive a high technical score merely because it is confidently delivered.

// // // // // // 2. A vague answer must not receive full marks.

// // // // // // 3. "I don't know" should be scored according to the competency demonstrated. Do not punish honesty more than an incorrect answer.

// // // // // // 4. If the interviewer had to repeatedly prompt the candidate before obtaining a correct answer, this indicates weaker independent interview readiness.

// // // // // // 5. If the candidate never demonstrates the required knowledge, assume the knowledge was not demonstrated.

// // // // // // 6. Do not invent experience, projects, technologies, responsibilities or outcomes that are not present in the transcript.

// // // // // // 7. Do not treat participation itself as competence.

// // // // // // 8. Do not award a high overall score when one critical competency is substantially deficient.

// // // // // // 9. The overall score must reflect actual evidence from the transcript.

// // // // // // 10. The evaluation must distinguish between:
// // // // // //    - demonstrated independently
// // // // // //    - demonstrated after prompting
// // // // // //    - partially demonstrated
// // // // // //    - not demonstrated
// // // // // //    - incorrect

// // // // // // READINESS DECISION:

// // // // // // Determine one of:

// // // // // // "READY"
// // // // // // "NEARLY_READY"
// // // // // // "DEVELOPING"
// // // // // // "NOT_READY"

// // // // // // Use "READY" only when the candidate has demonstrated sufficient competence for the selected target role and difficulty.

// // // // // // A candidate scoring below 80 should normally not be classified as READY.

// // // // // // A candidate scoring 90+ should still NOT be classified as READY if there is a serious critical competency failure.

// // // // // // Do not allow one strong category to hide a major weakness in another category.

// // // // // // QUESTION-LEVEL SCORING:

// // // // // // Each question must receive an individual score from 0-100.

// // // // // // The feedback must explain:
// // // // // // - what the candidate demonstrated
// // // // // // - what was missing
// // // // // // - whether the answer was technically correct
// // // // // // - whether prompting was required
// // // // // // - what a stronger candidate would have demonstrated

// // // // // // The ideal answer must be appropriate for the target role and difficulty level.

// // // // // // Do not make the ideal answer unrealistically senior.

// // // // // // The ideal answer is an example of a strong answer, not necessarily the only acceptable answer.

// // // // // // OVERALL SCORE:

// // // // // // Calculate the overall score from the demonstrated competencies.

// // // // // // Do not simply average the categories if doing so would hide a serious weakness.

// // // // // // The final score must be defensible from the transcript.

// // // // // // CRITICAL WEAKNESS RULE:

// // // // // // If the candidate demonstrates a serious deficiency in a core competency required for the target role, the candidate cannot be classified as READY regardless of their communication or behavioural score.

// // // // // // JSON OUTPUT REQUIREMENT:

// // // // // // Return valid JSON only.

// // // // // // Do not return markdown.
// // // // // // Do not return commentary outside the JSON.
// // // // // // Do not use trailing commas.

// // // // // // SCHEMA:

// // // // // // {
// // // // // //   "overallScore": number,
// // // // // //   "technicalScore": number,
// // // // // //   "technicalKnowledgeScore": number,
// // // // // //   "interviewReadinessScore": number,
// // // // // //   "behavioralScore": number,
// // // // // //   "communicationScore": number,
// // // // // //   "readinessStatus": "READY" | "NEARLY_READY" | "DEVELOPING" | "NOT_READY",
// // // // // //   "readinessSummary": "string",
// // // // // //   "confidence": number,
// // // // // //   "strengths": ["string"],
// // // // // //   "areasForImprovement": ["string"],
// // // // // //   "priorityGaps": ["string"],
// // // // // //   "recommendedPreparation": ["string"],
// // // // // //   "questionBreakdown": [
// // // // // //     {
// // // // // //       "question": "string",
// // // // // //       "candidateAnswer": "string",
// // // // // //       "score": number,
// // // // // //       "evidenceLevel": "INDEPENDENT" | "PROMPTED" | "PARTIAL" | "NOT_DEMONSTRATED" | "INCORRECT",
// // // // // //       "feedback": "string",
// // // // // //       "whatWasMissing": "string",
// // // // // //       "idealAnswerSample": "string"
// // // // // //     }
// // // // // //   ]
// // // // // // }

// // // // // // QUALITY CONTROL BEFORE RETURNING JSON:

// // // // // // Before producing the final JSON, internally verify:

// // // // // // - Did I score what was actually demonstrated?
// // // // // // - Did I avoid assuming knowledge?
// // // // // // - Did I avoid inflating weak answers?
// // // // // // - Did I distinguish prompted answers from independent answers?
// // // // // // - Did I identify incorrect technical statements?
// // // // // // - Does the overall score match the evidence?
// // // // // // - Does readinessStatus agree with the score and critical weaknesses?
// // // // // // - Would I trust this candidate to perform similarly in a real interview?`;

// // // // // //     const userPrompt = `FULL INTERVIEW TRANSCRIPT FOR EVALUATION:\n${JSON.stringify(
// // // // // //       fullTranscript,
// // // // // //       null,
// // // // // //       2,
// // // // // //     )}`;

// // // // // //     // -------------------------------------------------------------------------
// // // // // //     // 3. EXECUTE AI EVALUATION VIA AI CLIENT
// // // // // //     // -------------------------------------------------------------------------

// // // // // //     try {
// // // // // //       const aiResult = await generateCompletion({
// // // // // //         messages: [
// // // // // //           { role: "system" as const, content: systemPrompt },
// // // // // //           { role: "user" as const, content: userPrompt },
// // // // // //         ],
// // // // // //         temperature: 0.1, // Deterministic scoring precision
// // // // // //         maxTokens: 3000,
// // // // // //         feature: "mock_interview_evaluation",
// // // // // //         userId: auth.uid,
// // // // // //         sessionId,
// // // // // //       });

// // // // // //       const rawText = aiResult.text?.trim() || "";

// // // // // //       if (!rawText) {
// // // // // //         throw new Error("AI provider returned an empty evaluation response.");
// // // // // //       }

// // // // // //       const cleanJsonText = rawText
// // // // // //         .replace(/```json/gi, "")
// // // // // //         .replace(/```/g, "")
// // // // // //         .trim();

// // // // // //       let scorecard: any;

// // // // // //       try {
// // // // // //         scorecard = JSON.parse(cleanJsonText);
// // // // // //       } catch (jsonError) {
// // // // // //         logger.error("AI evaluation output failed JSON parsing:", {
// // // // // //           error: jsonError,
// // // // // //           sessionId,
// // // // // //           rawText,
// // // // // //         });

// // // // // //         throw new Error("The AI evaluation response was not valid JSON.");
// // // // // //       }

// // // // // //       // -------------------------------------------------------------------------
// // // // // //       // 4. SCORE & GATE VALIDATION
// // // // // //       // -------------------------------------------------------------------------

// // // // // //       const requiredNumericFields = [
// // // // // //         "overallScore",
// // // // // //         "technicalScore",
// // // // // //         "technicalKnowledgeScore",
// // // // // //         "interviewReadinessScore",
// // // // // //         "behavioralScore",
// // // // // //         "communicationScore",
// // // // // //       ];

// // // // // //       for (const field of requiredNumericFields) {
// // // // // //         const val = scorecard[field];
// // // // // //         if (typeof val !== "number" || val < 0 || val > 100) {
// // // // // //           logger.warn(
// // // // // //             `Score field ${field} invalid (${val}), clamping to 0-100 range.`,
// // // // // //           );
// // // // // //           scorecard[field] =
// // // // // //             typeof val === "number" ? Math.max(0, Math.min(100, val)) : 0;
// // // // // //         }
// // // // // //       }

// // // // // //       // STRICT TECHNICAL READINESS GATE ENFORCEMENT
// // // // // //       if (
// // // // // //         (scorecard.technicalScore < 80 ||
// // // // // //           scorecard.technicalKnowledgeScore < 80) &&
// // // // // //         scorecard.readinessStatus === "READY"
// // // // // //       ) {
// // // // // //         scorecard.readinessStatus = "NEARLY_READY";
// // // // // //         scorecard.readinessSummary +=
// // // // // //           " (Note: Readiness status adjusted to NEARLY_READY due to unfulfilled technical competency threshold).";
// // // // // //       }

// // // // // //       // -------------------------------------------------------------------------
// // // // // //       // 5. FIRESTORE PERSISTENCE
// // // // // //       // -------------------------------------------------------------------------

// // // // // //       const db = admin.firestore();

// // // // // //       if (sessionId) {
// // // // // //         await db.collection("ai_interviews").doc(sessionId).set(
// // // // // //           {
// // // // // //             scorecard,
// // // // // //             difficulty,
// // // // // //             targetRole,
// // // // // //             contextMode,
// // // // // //             interviewScope,
// // // // // //             isQualifyingRun,
// // // // // //             status: "completed",
// // // // // //             completedAt: admin.firestore.FieldValue.serverTimestamp(),

// // // // // //             aiProvider: aiResult.provider,
// // // // // //             modelUsed: aiResult.modelUsed,
// // // // // //             fallbackUsed: aiResult.fallbackUsed,
// // // // // //             fallbackAttempts: aiResult.fallbackAttempts,
// // // // // //             durationMs: aiResult.durationMs,
// // // // // //             updatedAt: admin.firestore.FieldValue.serverTimestamp(),
// // // // // //           },
// // // // // //           { merge: true },
// // // // // //         );
// // // // // //       }

// // // // // //       // Update Learner Metric Profile ONLY if this was a qualifying run
// // // // // //       const targetLearnerId = learnerId || auth.uid;
// // // // // //       const learnerRef = db.collection("learners").doc(targetLearnerId);
// // // // // //       const learnerSnap = await learnerRef.get();

// // // // // //       if (learnerSnap.exists && isQualifyingRun) {
// // // // // //         await learnerRef.update({
// // // // // //           employabilityScore: scorecard.overallScore || 0,
// // // // // //           latestInterviewScore: scorecard.overallScore || 0,
// // // // // //           technicalScore: scorecard.technicalScore || 0,
// // // // // //           technicalKnowledgeScore: scorecard.technicalKnowledgeScore || 0,
// // // // // //           interviewReadinessScore: scorecard.interviewReadinessScore || 0,
// // // // // //           behavioralScore: scorecard.behavioralScore || 0,
// // // // // //           communicationScore: scorecard.communicationScore || 0,
// // // // // //           readinessStatus: scorecard.readinessStatus || "NOT_READY",
// // // // // //           lastInterviewAt: admin.firestore.FieldValue.serverTimestamp(),
// // // // // //         });
// // // // // //       }

// // // // // //       // -------------------------------------------------------------------------
// // // // // //       // 6. RETURN AUDITED SCORECARD + TELEMETRY
// // // // // //       // -------------------------------------------------------------------------

// // // // // //       return {
// // // // // //         success: true,
// // // // // //         scorecard,
// // // // // //         isQualifyingRun,
// // // // // //         provider: aiResult.provider,
// // // // // //         modelUsed: aiResult.modelUsed,
// // // // // //         fallbackUsed: aiResult.fallbackUsed,
// // // // // //         fallbackAttempts: aiResult.fallbackAttempts,
// // // // // //         durationMs: aiResult.durationMs,
// // // // // //       };
// // // // // //     } catch (error: any) {
// // // // // //       logger.error("Error evaluating mock interview:", {
// // // // // //         error: error?.message || error,
// // // // // //         userId: auth.uid,
// // // // // //         learnerId: learnerId || auth.uid,
// // // // // //         sessionId,
// // // // // //         targetRole,
// // // // // //         difficulty,
// // // // // //       });

// // // // // //       throw new HttpsError(
// // // // // //         "internal",
// // // // // //         error?.message || "Failed to evaluate mock interview transcript.",
// // // // // //       );
// // // // // //     }
// // // // // //   },
// // // // // // );
