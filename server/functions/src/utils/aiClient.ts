// functions/src/utils/aiClient.ts

import * as admin from "firebase-admin";
import { createHash } from "crypto";

/**
 * ============================================================================
 * SHARED AI CLIENT GATEWAY
 * ============================================================================
 *
 * Architecture:
 *
 *   Cloud Function
 *        ↓
 *   generateCompletion()
 *        ↓
 *   ┌──────────────────────────────┐
 *   │ Provider 1: OpenRouter       │
 *   │ Ordered model fallback chain │
 *   └──────────────────────────────┘
 *        ↓ failure
 *   ┌──────────────────────────────┐
 *   │ Provider 2: Hugging Face     │
 *   │ Sequential model fallback    │
 *   └──────────────────────────────┘
 *        ↓
 *   AI Response
 *        ↓
 *   ┌──────────────────────────────┐
 *   │ Firestore ai_usage           │
 *   │ Detailed audit trail         │
 *   └──────────────────────────────┘
 *        +
 *   ┌──────────────────────────────┐
 *   │ GA4 Measurement Protocol     │
 *   │ Aggregate analytics          │
 *   └──────────────────────────────┘
 *
 * IMPORTANT:
 * - Firestore is the detailed source of truth for AI usage.
 * - GA4 is used for aggregate analytics and reporting.
 * - AI prompts/responses are NOT sent to GA4.
 * - Telemetry failures never cause the AI request itself to fail.
 */

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type AIProvider = "OpenRouter" | "HuggingFace";

export type AIMessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: AIMessageRole;

  /**
   * String for normal text prompts.
   *
   * `any` is intentionally retained here because some AI functions may
   * eventually use multimodal/OpenAI-compatible message content arrays.
   */
  content: string | any;
}

export interface AIParams {
  /**
   * Messages sent to the AI provider.
   */
  messages: ChatMessage[];

  /**
   * AI temperature.
   *
   * Typical range:
   * 0.0 - 2.0
   */
  temperature?: number;

  /**
   * Maximum output tokens.
   */
  maxTokens?: number;

  /**
   * Maximum amount of time allowed for an individual provider request.
   *
   * Default: 45 seconds.
   */
  timeoutMs?: number;

  frequencyPenalty?: number;
  presencePenalty?: number;

  /**
   * Identifies which backend feature invoked the AI request.
   *
   * Examples:
   * - mock_interview_turn
   * - mock_interview_evaluation
   * - placement_readiness_evaluation
   * - cv_analysis
   * - assessment_feedback
   */
  feature?: string;

  /**
   * Firebase authenticated user ID.
   *
   * Stored in Firestore audit records.
   */
  userId?: string;

  /**
   * Business/session identifier.
   *
   * Example:
   * - interview session ID
   * - assessment ID
   */
  sessionId?: string;

  /**
   * Writes detailed AI usage information to:
   *
   * ai_usage/{auto-generated-document-id}
   *
   * Default: true.
   */
  recordUsage?: boolean;

  /**
   * Sends an aggregate AI telemetry event to GA4 using the
   * Google Analytics Measurement Protocol.
   *
   * Default: true.
   *
   * If GA4 credentials are not configured, the event is skipped.
   * This does NOT cause the AI request to fail.
   */
  sendAnalytics?: boolean;
}

export interface AICompletionResult {
  /**
   * Generated AI response.
   */
  text: string;

  /**
   * Provider that actually generated the successful response.
   */
  provider: AIProvider;

  /**
   * Exact model reported by the provider.
   */
  modelUsed: string;

  /**
   * Whether the request had to leave the primary OpenRouter path.
   *
   * false:
   *   OpenRouter successfully responded.
   *
   * true:
   *   Hugging Face was required.
   */
  fallbackUsed: boolean;

  /**
   * Number of Hugging Face models attempted.
   *
   * OpenRouter's internal model routing is not counted here because
   * OpenRouter controls that fallback internally.
   */
  fallbackAttempts: number;

  /**
   * Total AI generation duration in milliseconds.
   */
  durationMs: number;
}

// ============================================================================
// PROVIDER RESPONSE TYPES
// ============================================================================

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;

  /**
   * OpenRouter returns the model that actually generated the response.
   */
  model?: string;
}

interface HuggingFaceResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;

  model?: string;
}

// ============================================================================
// FALLBACK MODEL CHAINS
// ============================================================================

/**
 * OpenRouter model fallback chain.
 *
 * OpenRouter is responsible for routing between these models.
 *
 * The model returned by OpenRouter is captured in `modelUsed`, so we know
 * which model actually answered the request.
 */
const OPENROUTER_FALLBACKS = [
  "google/gemini-2.5-flash",
  "qwen/qwen-plus",
  "meta-llama/llama-3.3-70b-instruct",
  "google/gemini-1.5-flash:free",
  "meta-llama/llama-3-8b-instruct:free",
  "deepseek/deepseek-chat",
];

/**
 * Hugging Face fallback chain.
 *
 * These are only attempted if OpenRouter fails completely.
 */
const HUGGINGFACE_FALLBACKS = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "mistralai/Mistral-7B-Instruct-v0.3",
];

/**
 * Default timeout for an individual provider request.
 */
const DEFAULT_TIMEOUT_MS = 45_000;

/**
 * GA4 Measurement Protocol endpoint.
 */
const GA4_MEASUREMENT_PROTOCOL_URL =
  "https://www.google-analytics.com/mp/collect";

// ============================================================================
// FIREBASE ADMIN INITIALISATION
// ============================================================================

function getAdminFirestore(): FirebaseFirestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }

  return admin.firestore();
}

// ============================================================================
// TIMEOUT
// ============================================================================

const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  return AbortSignal.timeout(timeoutMs);
};

// ============================================================================
// RESPONSE EXTRACTION
// ============================================================================

/**
 * Extracts text from an OpenAI-compatible provider response.
 */
const extractCompletionText = (
  data: OpenRouterResponse | HuggingFaceResponse,
): string => {
  const text = data.choices?.[0]?.message?.content;

  if (!text || typeof text !== "string") {
    throw new Error("AI provider returned an empty or invalid response.");
  }

  return text.trim();
};

// ============================================================================
// FIRESTORE AI USAGE AUDIT
// ============================================================================

interface AIUsageRecord {
  feature: string;
  provider: AIProvider;
  model: string;

  success: boolean;

  fallbackUsed: boolean;
  fallbackAttempts: number;

  durationMs: number;

  userId?: string;
  sessionId?: string;
}

/**
 * Writes a detailed AI usage record to Firestore.
 *
 * Collection:
 *
 *   ai_usage
 *
 * Each request gets its own automatically generated document.
 *
 * Telemetry failures are intentionally swallowed so that a Firestore outage
 * does not break an otherwise successful AI request.
 */
async function recordAIUsage(record: AIUsageRecord): Promise<void> {
  try {
    const db = getAdminFirestore();

    await db.collection("ai_usage").add({
      ...record,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to record AI usage telemetry in Firestore:", error);
  }
}

// ============================================================================
// GA4 / FIREBASE ANALYTICS
// ============================================================================

/**
 * Creates a stable pseudonymous GA4 client ID from the Firebase UID.
 *
 * We do not send the raw Firebase UID as the GA4 client_id.
 *
 * This produces a stable identifier for analytics without putting the
 * Firebase UID itself into the Measurement Protocol client_id field.
 */
function createAnalyticsClientId(userId?: string): string {
  if (userId) {
    return createHash("sha256").update(userId).digest("hex").substring(0, 32);
  }

  /**
   * If no authenticated user ID is available, create a request-specific
   * anonymous identifier.
   */
  return `${Date.now()}.${Math.floor(Math.random() * 1_000_000_000)}`;
}

/**
 * Sends an AI telemetry event to GA4 through the Measurement Protocol.
 *
 * IMPORTANT:
 * - AI prompt content is NOT sent.
 * - AI response content is NOT sent.
 * - API keys/tokens are NOT sent.
 * - Detailed audit information remains in Firestore.
 *
 * GA4 is therefore used for aggregate reporting such as:
 *
 * - How many AI requests were made?
 * - Which provider responded most often?
 * - Which models are being used?
 * - How often are fallbacks occurring?
 * - Which AI feature consumes the most requests?
 * - Average response duration.
 */
async function sendAIAnalyticsEvent(record: AIUsageRecord): Promise<void> {
  try {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;

    /**
     * GA4 configuration is optional.
     *
     * If it is not configured, simply skip analytics.
     */
    if (!measurementId || !apiSecret) {
      console.warn(
        "GA4 analytics skipped: GA4_MEASUREMENT_ID or GA4_API_SECRET is not configured.",
      );

      return;
    }

    const clientId = createAnalyticsClientId(record.userId);

    /**
     * GA4 event parameters should remain relatively small and should not
     * contain sensitive information or complete AI prompts/responses.
     */
    const eventParameters: Record<string, string | number> = {
      ai_feature: record.feature,
      ai_provider: record.provider,
      ai_model: record.model,

      ai_success: record.success ? 1 : 0,

      ai_fallback_used: record.fallbackUsed ? 1 : 0,

      ai_fallback_attempts: record.fallbackAttempts,

      ai_duration_ms: record.durationMs,
    };

    /**
     * Session ID is useful for reporting, but is only included when present.
     */
    if (record.sessionId) {
      eventParameters.ai_session_id = record.sessionId;
    }

    const response = await fetch(
      `${GA4_MEASUREMENT_PROTOCOL_URL}?measurement_id=${encodeURIComponent(
        measurementId,
      )}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          client_id: clientId,

          /**
           * GA4 User-ID is only supplied when an authenticated Firebase user
           * ID exists.
           *
           * This is a pseudonymous application identifier rather than an
           * email address or other direct personal information.
           */
          ...(record.userId
            ? {
                user_id: record.userId,
              }
            : {}),

          events: [
            {
              name: "ai_generation",

              params: eventParameters,
            },
          ],
        }),

        /**
         * Analytics should never be allowed to hang a Cloud Function.
         */
        signal: createTimeoutSignal(10_000),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.warn(
        `GA4 AI analytics event failed with HTTP ${response.status}:`,
        errorText,
      );

      return;
    }

    console.log(
      `GA4 AI analytics recorded: feature=${record.feature}, provider=${record.provider}, model=${record.model}`,
    );
  } catch (error: any) {
    /**
     * Analytics is non-critical.
     *
     * Never throw this error back into generateCompletion().
     */
    console.warn(
      "Failed to send AI analytics event to GA4:",
      error?.message || error,
    );
  }
}

// ============================================================================
// TELEMETRY DISPATCHER
// ============================================================================

/**
 * Records AI usage in Firestore and optionally sends a GA4 event.
 *
 * Both telemetry systems are intentionally independent of AI generation.
 *
 * If Firestore fails:
 *   AI response still succeeds.
 *
 * If GA4 fails:
 *   AI response still succeeds.
 *
 * If both fail:
 *   AI response still succeeds.
 */
async function recordAITelemetry(
  record: AIUsageRecord,
  recordUsage: boolean,
  sendAnalytics: boolean,
): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (recordUsage) {
    tasks.push(recordAIUsage(record));
  }

  if (sendAnalytics) {
    tasks.push(sendAIAnalyticsEvent(record));
  }

  if (tasks.length === 0) {
    return;
  }

  /**
   * Wait for telemetry tasks to finish, but neither function can throw
   * because their own implementations deliberately swallow telemetry errors.
   */
  await Promise.allSettled(tasks);
}

// ============================================================================
// MAIN AI COMPLETION GATEWAY
// ============================================================================

export const generateCompletion = async ({
  messages,
  temperature = 0.4,
  maxTokens = 3000,
  timeoutMs = DEFAULT_TIMEOUT_MS,

  feature = "unknown",

  userId,
  sessionId,

  recordUsage = true,
  sendAnalytics = true,
}: AIParams): Promise<AICompletionResult> => {
  const startTime = Date.now();

  // --------------------------------------------------------------------------
  // VALIDATION
  // --------------------------------------------------------------------------

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    throw new Error("At least one AI ChatMessage is required.");
  }

  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    throw new Error("Temperature must be between 0 and 2.");
  }

  if (!Number.isFinite(maxTokens) || maxTokens <= 0) {
    throw new Error("maxTokens must be greater than zero.");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("timeoutMs must be greater than zero.");
  }

  // --------------------------------------------------------------------------
  // STATE
  // --------------------------------------------------------------------------

  let fallbackUsed = false;

  /**
   * Counts Hugging Face models attempted after OpenRouter fails.
   *
   * OpenRouter's internal model fallback is not counted because OpenRouter
   * controls that process internally.
   */
  let fallbackAttempts = 0;

  let text = "";

  let provider: AIProvider = "OpenRouter";

  let modelUsed = "";

  // --------------------------------------------------------------------------
  // PROVIDER 1: OPENROUTER
  // --------------------------------------------------------------------------

  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (openRouterKey) {
    try {
      console.log(
        `AI request started: feature=${feature}, provider=OpenRouter, models=${OPENROUTER_FALLBACKS.length}`,
      );

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            Authorization: `Bearer ${openRouterKey}`,

            "Content-Type": "application/json",

            "HTTP-Referer": "https://mlabassessmentcenter.web.app",

            "X-Title": "mLab Ecosystem",
          },

          body: JSON.stringify({
            /**
             * OpenRouter receives the complete ordered fallback chain.
             */
            models: OPENROUTER_FALLBACKS,

            messages,

            temperature,

            max_tokens: maxTokens,

            route: "fallback",
          }),

          signal: createTimeoutSignal(timeoutMs),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as OpenRouterResponse;

      text = extractCompletionText(data);

      provider = "OpenRouter";

      /**
       * This is the exact model returned by OpenRouter as the model that
       * generated the response.
       */
      modelUsed = `OpenRouter (${data.model ?? "unknown"})`;

      console.log(
        `AI request successful: feature=${feature}, provider=${provider}, model=${modelUsed}`,
      );
    } catch (error: any) {
      fallbackUsed = true;

      console.warn(
        `OpenRouter failed for feature=${feature}. Starting Hugging Face failover.`,
        error?.message || "Unknown OpenRouter error.",
      );
    }
  } else {
    fallbackUsed = true;

    console.warn("OPENROUTER_API_KEY is not configured. Skipping OpenRouter.");
  }

  // --------------------------------------------------------------------------
  // PROVIDER 2: HUGGING FACE
  // --------------------------------------------------------------------------

  if (!text) {
    const hfToken = process.env.HF_TOKEN;

    if (!hfToken) {
      const durationMs = Date.now() - startTime;

      const failureRecord: AIUsageRecord = {
        feature,

        provider: "HuggingFace",

        model: "unconfigured-failover",

        success: false,

        fallbackUsed: true,

        fallbackAttempts,

        durationMs,

        userId,

        sessionId,
      };

      await recordAITelemetry(failureRecord, recordUsage, sendAnalytics);

      throw new Error(
        "All AI providers failed. OpenRouter failed and HF_TOKEN is not configured.",
      );
    }

    // ------------------------------------------------------------------------
    // SANITISE MESSAGES FOR HUGGING FACE
    // ------------------------------------------------------------------------

    /**
     * Hugging Face's OpenAI-compatible endpoint may not accept every
     * multimodal content structure supported by OpenRouter.
     *
     * For array content, retain text portions only.
     */
    const hfMessages = messages.map((message) => {
      if (Array.isArray(message.content)) {
        const textContent = message.content
          .filter((contentItem: any) => contentItem?.type === "text")
          .map((contentItem: any) => contentItem?.text)
          .filter((value: any): value is string => typeof value === "string")
          .join("\n\n");

        return {
          role: message.role,

          content: textContent,
        };
      }

      return {
        role: message.role,

        content:
          typeof message.content === "string"
            ? message.content
            : String(message.content ?? ""),
      };
    });

    // ------------------------------------------------------------------------
    // HUGGING FACE MODEL LOOP
    // ------------------------------------------------------------------------

    for (const model of HUGGINGFACE_FALLBACKS) {
      fallbackAttempts++;

      try {
        console.log(
          `AI failover: attempting Hugging Face model ${model} for feature=${feature}.`,
        );

        const response = await fetch(
          "https://router.huggingface.co/v1/chat/completions",
          {
            method: "POST",

            headers: {
              Authorization: `Bearer ${hfToken}`,

              "Content-Type": "application/json",
            },

            body: JSON.stringify({
              model,

              messages: hfMessages,

              temperature,

              max_tokens: maxTokens,
            }),

            signal: createTimeoutSignal(timeoutMs),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();

          console.warn(
            `Hugging Face model ${model} failed with HTTP ${response.status}:`,
            errorText,
          );

          continue;
        }

        const data = (await response.json()) as HuggingFaceResponse;

        text = extractCompletionText(data);

        provider = "HuggingFace";

        /**
         * Hugging Face request specifies the model directly, so we can
         * confidently record that model.
         */
        modelUsed = `HuggingFace (${data.model ?? model})`;

        console.log(
          `AI request successful: feature=${feature}, provider=${provider}, model=${modelUsed}`,
        );

        break;
      } catch (error: any) {
        console.warn(
          `Hugging Face model ${model} failed.`,
          error?.message || "Unknown Hugging Face error.",
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // ALL PROVIDERS FAILED
  // --------------------------------------------------------------------------

  const durationMs = Date.now() - startTime;

  if (!text) {
    const failureRecord: AIUsageRecord = {
      feature,

      provider: "HuggingFace",

      model: "all-fallbacks-failed",

      success: false,

      fallbackUsed: true,

      fallbackAttempts,

      durationMs,

      userId,

      sessionId,
    };

    await recordAITelemetry(failureRecord, recordUsage, sendAnalytics);

    throw new Error(
      "Critical AI failure: OpenRouter and all Hugging Face fallback models failed.",
    );
  }

  // --------------------------------------------------------------------------
  // SUCCESS TELEMETRY
  // --------------------------------------------------------------------------

  const successRecord: AIUsageRecord = {
    feature,

    provider,

    model: modelUsed,

    success: true,

    fallbackUsed,

    fallbackAttempts,

    durationMs,

    userId,

    sessionId,
  };

  await recordAITelemetry(successRecord, recordUsage, sendAnalytics);

  // --------------------------------------------------------------------------
  // RETURN
  // --------------------------------------------------------------------------

  return {
    text,

    provider,

    modelUsed,

    fallbackUsed,

    fallbackAttempts,

    durationMs,
  };
};
