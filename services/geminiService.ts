import { GoogleGenAI, Modality } from "@google/genai";
import { Document, Role, SourceType, Citation } from "../types";
import { TRUSTED_DOMAINS, MODEL_MAIN, MODEL_TRANSCRIPTION, MODEL_TTS, MODEL_FAST_LITE } from "../constants";

// The API key is injected via vite.config.ts from the .env file
const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key starting with:", apiKey ? apiKey.substring(0, 8) + "..." : "UNDEFINED");

// Create a singleton AI client instance
let aiInstance: GoogleGenAI | null = null;

const getAIClient = (): GoogleGenAI => {
  if (!aiInstance) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }
    aiInstance = new GoogleGenAI({ apiKey: apiKey });
  }
  return aiInstance;
};

// Reset the AI client (useful for error recovery)
const resetAIClient = (): void => {
  aiInstance = null;
};

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

// Helper function for exponential backoff retry
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  initialBackoff: number = INITIAL_BACKOFF_MS
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      // Check if error is retryable
      const isRateLimited = error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.toLowerCase().includes('rate limit') ||
        error?.message?.toLowerCase().includes('quota');

      const isServerError = error?.status >= 500 ||
        error?.message?.includes('500') ||
        error?.message?.toLowerCase().includes('internal');

      const isNetworkError = error?.message?.toLowerCase().includes('network') ||
        error?.message?.toLowerCase().includes('fetch') ||
        error?.message?.toLowerCase().includes('timeout');

      const isRetryable = isRateLimited || isServerError || isNetworkError;

      if (!isRetryable || attempt === maxRetries) {
        // If rate limited, provide a clearer message
        if (isRateLimited) {
          throw new Error(`Rate limit exceeded. Please wait a moment before trying again.`);
        }
        throw error;
      }

      // Calculate backoff with jitter
      const backoffMs = initialBackoff * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms...`);

      // If rate limited, wait longer
      const waitTime = isRateLimited ? Math.max(backoffMs, 5000) : backoffMs;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Reset AI client on network errors
      if (isNetworkError) {
        resetAIClient();
      }
    }
  }

  throw lastError;
}

const SYSTEM_INSTRUCTION_BASE = `
You are SIT Scholar, a dedicated academic search engine for Siddaganga Institute of Technology (SIT).
Your role is to retrieve, synthesize, and present information with high accuracy and professional formatting.

**CONTEXTUAL ASSUMPTION:**
If the user's query does not explicitly specify a department (e.g., "Who is the HOD?", "Show me the 3rd sem syllabus"), **YOU MUST ASSUME THEY ARE REFERRING TO THE MCA (Master of Computer Applications) DEPARTMENT.**

**MANDATORY FORMATTING RULES:**
1.  **Tables are Required**: Whenever you present lists of people, courses, fees, alumni data, or comparative data, **YOU MUST USE A MARKDOWN TABLE**.
2.  **Rich Text & Math**: Use LaTeX formatting for any mathematical formulas (e.g., $E=mc^2$).
3.  **Structure**: Start with a direct answer. Follow with detailed data (tables/lists). End with a summary or next steps.
4.  **Bold Keywords**: Bold important entities (names, dates, official titles, company names) for scannability.

**DATA SOURCE PROTOCOL:**
1.  **Internal Records (Priority 1)**: 
    *   Use the provided "Internal Knowledge Base" first. 
    *   **Alumni/Student Queries**: If a user asks about a student, search the "Alumni & Student Database". 
    *   **Clarification Mode**: If a user provides a name that matches multiple entries, list the potential matches (Name + Batch) and ask for clarification.
    *   **HOD/Faculty**: The correct HOD of MCA is **Dr. Premasudha B G**.
    *   Cite as "Internal Record".
2.  **Web Search (Priority 2)**: 
    *   If the answer is not in internal records, or if the user asks for *current* external info, use Google Search.

**PRIVACY GATES:**
- **Public User**: Can see general info. CANNOT see specific Student USNs, private emails, or phone numbers from Internal Context.
- **Authorized/Admin**: Full access.

**Tone**: Objective, Concise, Academic.
`;

interface GenerateResponseResult {
  text: string;
  citations: Citation[];
  needsWebSearchApproval: boolean;
}

export const generateAnswer = async (
  query: string,
  history: { role: string; content: string }[],
  role: Role,
  documents: Document[],
  enableWebSearch: boolean
): Promise<GenerateResponseResult> => {

  // 1. Retrieval (Mock RAG)
  const relevantDocs = documents.filter(doc => {
    if (role === Role.PUBLIC && doc.isRestricted) return false;
    const keywords = query.toLowerCase().split(' ');
    // Enhanced matching
    return keywords.some(k => k.length > 2 && (doc.content.toLowerCase().includes(k) || doc.title.toLowerCase().includes(k)));
  });

  const contextText = relevantDocs.map(d => `[Internal Document: ${d.title} (${d.category})] \n${d.content}`).join('\n\n');

  const systemInstruction = `
${SYSTEM_INSTRUCTION_BASE}

CURRENT USER ROLE: ${role}

INTERNAL KNOWLEDGE BASE:
${contextText || "No relevant internal documents found for this specific query."}
  `;

  const tools: any[] = [];
  if (enableWebSearch) {
    tools.push({ googleSearch: {} });
  }

  try {
    const ai = getAIClient();

    // Limit history to prevent token overflow (keep last 20 messages)
    const limitedHistory = history.slice(-20);

    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: MODEL_MAIN,
        contents: [
          ...limitedHistory.map(h => ({
            role: h.role === 'user' ? 'user' : 'model',
            parts: [{ text: h.content }]
          })),
          { role: 'user', parts: [{ text: query }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          tools: tools.length > 0 ? tools : undefined,
        }
      });
    });

    let text = response.text || "";
    const citations: Citation[] = [];

    // Extract Grounding (Web Sources)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          citations.push({
            title: chunk.web.title || "Web Result",
            url: chunk.web.uri,
            sourceType: SourceType.EXTERNAL_WEB
          });
        }
      });
    }

    // Heuristic for Internal citations
    if (relevantDocs.length > 0) {
      relevantDocs.forEach(doc => {
        citations.push({
          title: doc.title,
          sourceType: SourceType.INTERNAL,
          snippet: "Verified Internal Record"
        });
      });
    }

    const uniqueCitations = citations.filter((v, i, a) =>
      a.findIndex(t => (t.url === v.url && t.title === v.title)) === i
    );

    const needsWebSearchApproval = text.includes("Do you want me to search the wider web?") || text.includes("search the wider web");

    return {
      text,
      citations: uniqueCitations,
      needsWebSearchApproval
    };

  } catch (error: any) {
    console.error("Gemini API Error:", error);

    // Provide user-friendly error messages
    let userMessage = "An error occurred while processing your request.";

    if (error?.message?.includes("Rate limit") || error?.message?.includes("429")) {
      userMessage = "⏳ **Rate Limit Reached**: The API is currently busy. Please wait a moment and try again.";
    } else if (error?.message?.includes("API key")) {
      userMessage = "🔑 **Configuration Error**: The API key is not properly configured.";
    } else if (error?.message?.includes("network") || error?.message?.includes("fetch")) {
      userMessage = "🌐 **Network Error**: Unable to connect to the server. Please check your internet connection.";
    } else if (error?.status >= 500) {
      userMessage = "🔧 **Server Error**: The Gemini service is temporarily unavailable. Please try again later.";
    } else {
      userMessage = `⚠️ **Error**: ${error.message || "Unknown error occurred"}\n\n*If this persists, please refresh the page and try again.*`;
    }

    return {
      text: userMessage,
      citations: [],
      needsWebSearchApproval: false
    };
  }
};

export const generateChatTitle = async (firstMessage: string, firstResponse: string): Promise<string> => {
  try {
    const ai = getAIClient();

    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: MODEL_FAST_LITE,
        contents: `Generate a short, professional title (max 4-5 words) for this search query: "${firstMessage}". Return ONLY the title text.`,
      });
    }, 2); // Only 2 retries for title generation

    return response.text?.trim() || "Search Session";
  } catch (e) {
    console.warn("Title generation failed:", e);
    return "Search Session";
  }
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  try {
    const ai = getAIClient();

    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: MODEL_TRANSCRIPTION,
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
            { text: "Transcribe exactly." }
          ]
        }
      });
    }, 2);

    return response.text || "";
  } catch (e) {
    console.error("Transcription error:", e);
    return "";
  }
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();

    // Truncate text if too long for TTS
    const maxLength = 2000;
    const truncatedText = text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;

    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: MODEL_TTS,
        contents: [{ parts: [{ text: truncatedText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
    }, 2);

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    console.error("TTS error:", e);
    return undefined;
  }
};

// Export utility for resetting the client if needed
export const resetGeminiClient = resetAIClient;