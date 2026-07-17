// functions/src/utils/aiClient.ts

/**
 * Super-Resilient Multi-Provider AI Fallback Client
 * Priority 1: OpenRouter (Self-correcting fallback array)
 * Priority 2 (Failover): Direct Hugging Face Inference API Router
 */

// 1. OpenRouter Fallback Chain (Mix of top-tier premium and free models)
const OPENROUTER_FALLBACKS = [
  "google/gemini-2.5-flash",
  "qwen/qwen-plus",
  "meta-llama/llama-3-70b-instruct",
  "google/gemini-1.5-flash:free",
  "meta-llama/llama-3-8b-instruct:free",
  "deepseek/deepseek-chat",
];

// 2. Hugging Face Fallback Chain (If OpenRouter fails completely)
const HUGGINGFACE_FALLBACKS = [
  "meta-llama/Llama-3.1-8B-Instruct", // Highly capable, incredibly fast serverless model
  "mistralai/Mistral-7B-Instruct-v0.3", // Ultra-reliable fallback
];

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AIParams {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export const generateCompletion = async ({
  messages,
  temperature = 0.4,
  maxTokens = 3000,
}: AIParams) => {
  // Attempt Provider 1: OpenRouter
  try {
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (!openRouterKey) throw new Error("Missing OpenRouter API Key");

    console.log("Attempting generation via OpenRouter...");
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
          models: OPENROUTER_FALLBACKS,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
          route: "fallback",
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      return {
        text: data.choices[0].message.content,
        modelUsed: `OpenRouter (${data.model})`,
      };
    }

    // If OpenRouter responded with a bad status, throw an error to trigger the catch block
    const errorText = await response.text();
    throw new Error(
      `OpenRouter returned status ${response.status}: ${errorText}`,
    );
  } catch (openRouterError: any) {
    // ─── FAILOVER TO HUGGING FACE ───
    console.warn(
      "OpenRouter completely failed or went offline. Redirecting to Hugging Face...",
      openRouterError.message,
    );

    const hfToken = process.env.HF_TOKEN; // Set this in your Firebase config
    if (!hfToken) {
      throw new Error(
        `OpenRouter failed, and Hugging Face fallback is unconfigured. Original Error: ${openRouterError.message}`,
      );
    }

    // Try Hugging Face's serverless model chain
    for (const model of HUGGINGFACE_FALLBACKS) {
      try {
        console.log(`Hugging Face Failover: Trying model ${model}...`);

        // Using Hugging Face's OpenAI-compatible serverless router
        const hfResponse = await fetch(
          "https://router.huggingface.co/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: model,
              messages: messages,
              temperature: temperature,
              max_tokens: maxTokens,
            }),
          },
        );

        if (hfResponse.ok) {
          const hfData = await hfResponse.json();
          return {
            text: hfData.choices[0].message.content,
            modelUsed: `HuggingFace Fallback (${model})`,
          };
        }

        console.warn(
          `Hugging Face model ${model} failed, moving to next HF option...`,
        );
      } catch (hfModelError) {
        console.error(
          `Failed during HF model ${model} execution:`,
          hfModelError,
        );
      }
    }

    // Both providers completely exhausted
    throw new Error(
      "Critical Failure: Both OpenRouter and Hugging Face providers failed to generate a response.",
    );
  }
};
