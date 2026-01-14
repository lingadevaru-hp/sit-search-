import { GoogleGenAI, Modality } from "@google/genai";
import { Document, Role, SourceType, Citation } from "../types";
import { MODEL_MAIN, MODEL_TTS, MODEL_FAST_LITE } from "../constants";

// The API key is injected via vite.config.ts from the .env file
const apiKey = process.env.GEMINI_API_KEY;

// Validate API key on load
if (!apiKey) {
  console.error("CRITICAL: GEMINI_API_KEY is not configured!");
} else {
  console.log("API Key loaded:", apiKey.substring(0, 10) + "...");
}

// Singleton AI client
let aiInstance: GoogleGenAI | null = null;

const getAIClient = (): GoogleGenAI => {
  if (!aiInstance) {
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured. Please add it to your .env file.");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
};

export const resetAIClient = (): void => {
  aiInstance = null;
};

// Abort controller for cancellable requests
let currentAbortController: AbortController | null = null;

export const cancelCurrentRequest = (): void => {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
};

// Simple retry helper
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  delayMs = 1000
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1} failed:`, error.message);

      // Don't retry on abort
      if (error.name === 'AbortError') throw error;

      // Don't retry on auth errors
      if (error.message?.includes('API key') || error.status === 401) throw error;

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// System instruction for SIT Scholar
const SYSTEM_INSTRUCTION = `You are SIT Scholar, an intelligent academic assistant for Siddaganga Institute of Technology (SIT), Tumkur.

## YOUR ROLE
- Provide accurate, helpful information about SIT
- Answer questions about academics, faculty, admissions, fees, placements
- Format responses clearly with proper structure

## DEFAULT DEPARTMENT
If no department is specified, assume MCA (Master of Computer Applications)

## FORMATTING RULES
1. Use **bold** for important names, dates, titles
2. Use tables for lists of people, courses, or comparative data
3. Structure: Direct answer first, then details
4. Keep responses concise but complete

## KNOWN FACTS ABOUT SIT
- Location: Tumkur, Karnataka, India
- Type: Autonomous Engineering College
- Established: 1963
- Affiliated to: Visvesvaraya Technological University (VTU)
- MCA Department HOD: Dr. Premasudha B G
- Principal: Dr. Shivakumara Swamy

## PRIVACY
- For PUBLIC users: Don't share personal contact details
- For ADMIN users: Full access to all information

Be helpful, accurate, and professional.`;

interface GenerateResponseResult {
  text: string;
  citations: Citation[];
  needsWebSearchApproval: boolean;
}

type ProgressCallback = (status: string) => void;

export const generateAnswer = async (
  query: string,
  history: { role: string; content: string }[],
  role: Role,
  documents: Document[],
  enableWebSearch: boolean,
  onProgress?: ProgressCallback
): Promise<GenerateResponseResult> => {

  // Create new abort controller for this request
  currentAbortController = new AbortController();

  try {
    onProgress?.('Processing your request...');

    // Find relevant internal documents
    const relevantDocs = documents.filter(doc => {
      if (role === Role.PUBLIC && doc.isRestricted) return false;
      const keywords = query.toLowerCase().split(' ').filter(k => k.length > 2);
      return keywords.some(k =>
        doc.content.toLowerCase().includes(k) ||
        doc.title.toLowerCase().includes(k)
      );
    });

    // Build context from internal docs
    const internalContext = relevantDocs.length > 0
      ? `\n\nINTERNAL RECORDS:\n${relevantDocs.map(d =>
        `[${d.title}]\n${d.content}`).join('\n\n')}`
      : '';

    const fullSystemInstruction = `${SYSTEM_INSTRUCTION}
        
CURRENT USER ROLE: ${role}
${internalContext}`;

    onProgress?.('Generating response...');

    const ai = getAIClient();

    // Limit history to last 10 messages to avoid token overflow
    const limitedHistory = history.slice(-10);

    // Build content array
    const contents = [
      ...limitedHistory.map(h => ({
        role: h.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: h.content }]
      })),
      { role: 'user' as const, parts: [{ text: query }] }
    ];

    // Make the API call
    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: MODEL_MAIN,
        contents: contents,
        config: {
          systemInstruction: fullSystemInstruction,
          tools: enableWebSearch ? [{ googleSearch: {} }] : undefined,
        }
      });
    });

    // Check if aborted
    if (currentAbortController?.signal.aborted) {
      throw new Error('Request was cancelled');
    }

    const text = response.text || "I couldn't generate a response. Please try again.";

    // Build citations
    const citations: Citation[] = [];

    // Add grounding citations from Gemini (if web search was used)
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web) {
          citations.push({
            title: chunk.web.title || "Web Source",
            url: chunk.web.uri,
            sourceType: SourceType.EXTERNAL_WEB,
            snippet: chunk.web.title
          });
        }
      });
    }

    // Add internal document citations
    relevantDocs.forEach(doc => {
      citations.push({
        title: doc.title,
        sourceType: SourceType.INTERNAL,
        snippet: doc.content.substring(0, 100) + "..."
      });
    });

    return {
      text,
      citations,
      needsWebSearchApproval: false
    };

  } catch (error: any) {
    console.error("Generate answer error:", error);

    // Handle specific error types
    if (error.name === 'AbortError' || error.message === 'Request was cancelled') {
      return {
        text: "Request was cancelled.",
        citations: [],
        needsWebSearchApproval: false
      };
    }

    let errorMessage = "An error occurred while processing your request.";

    if (error.message?.includes('API key')) {
      errorMessage = "API key error. Please check your configuration.";
    } else if (error.message?.includes('429') || error.message?.includes('rate')) {
      errorMessage = "Too many requests. Please wait a moment and try again.";
    } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
      errorMessage = "Network error. Please check your internet connection.";
    }

    return {
      text: `⚠️ **Error**\n\n${errorMessage}`,
      citations: [],
      needsWebSearchApproval: false
    };
  } finally {
    currentAbortController = null;
  }
};

export const generateChatTitle = async (firstMessage: string): Promise<string> => {
  try {
    const ai = getAIClient();

    const response = await ai.models.generateContent({
      model: MODEL_FAST_LITE,
      contents: `Generate a 3-4 word title for this query: "${firstMessage}". Return only the title.`
    });

    return response.text?.trim().replace(/"/g, '') || "New Search";
  } catch (e) {
    console.warn("Title generation failed:", e);
    return "New Search";
  }
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  try {
    const ai = getAIClient();

    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: MODEL_MAIN,
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
            { text: "Transcribe this audio exactly. Return only the transcription text, nothing else." }
          ]
        }
      });
    }, 1);

    return response.text?.trim() || "";
  } catch (e) {
    console.error("Transcription error:", e);
    return "";
  }
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();

    // Clean and truncate text for TTS
    const cleanText = text
      .replace(/\*\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .replace(/\|/g, ', ')
      .replace(/\[.*?\]/g, '')
      .replace(/\n+/g, '. ')
      .substring(0, 1000);

    if (!cleanText.trim()) return undefined;

    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: MODEL_TTS,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' }
            }
          }
        }
      });
    }, 1);

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    console.error("TTS error:", e);
    return undefined;
  }
};

// Initialize on load
export const initializeSearchEngine = (): void => {
  console.log('[SIT Scholar] Initializing...');
  // Validate API key
  try {
    getAIClient();
    console.log('[SIT Scholar] API client ready');
  } catch (e) {
    console.error('[SIT Scholar] Initialization failed:', e);
  }
};

export const resetGeminiClient = resetAIClient;