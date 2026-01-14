import { GoogleGenAI, Modality } from "@google/genai";
import { Document, Role, SourceType, Citation } from "../types";
import { MODEL_MAIN, MODEL_TTS, MODEL_FAST_LITE } from "../constants";
import { searchSITWebsite, prefetchCommonPages } from "./webScraperService";

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
        if (isRateLimited) {
          throw new Error(`Rate limit exceeded. Please wait a moment before trying again.`);
        }
        throw error;
      }

      const backoffMs = initialBackoff * Math.pow(2, attempt) + Math.random() * 500;
      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${backoffMs}ms...`);

      const waitTime = isRateLimited ? Math.max(backoffMs, 5000) : backoffMs;
      await new Promise(resolve => setTimeout(resolve, waitTime));

      if (isNetworkError) {
        resetAIClient();
      }
    }
  }

  throw lastError;
}

// SEARCH ENGINE SYSTEM INSTRUCTION - NOT A CHATBOT
const SEARCH_ENGINE_INSTRUCTION = `
You are SIT Scholar, an ACADEMIC SEARCH ENGINE for Siddaganga Institute of Technology (SIT), Tumkur.

## CRITICAL: YOU ARE A SEARCH ENGINE, NOT A CHATBOT

You MUST:
1. ONLY answer based on the SCRAPED WEB DATA provided below
2. NEVER fabricate or hallucinate information
3. ALWAYS cite the exact source URL for every fact
4. If data is not in the scraped content, say "This information was not found on the SIT website"
5. Present data in structured formats (tables, lists)

## MANDATORY CITATION FORMAT
Every factual statement MUST end with [Source: URL]
Example: "The HOD of MCA is Dr. Premasudha B G [Source: https://sit.ac.in/html/department.php?deptid=15]"

## DATA PRESENTATION RULES
1. Use MARKDOWN TABLES for lists of people, courses, fees
2. Bold important names, titles, dates
3. Start with a direct answer, then provide details
4. Include contact information when available

## DEPARTMENT ASSUMPTION
If no department is specified, assume MCA (Master of Computer Applications)

## RESPONSE STRUCTURE
1. **Direct Answer** (1-2 sentences)
2. **Detailed Information** (tables/lists from scraped data)
3. **Source Citations** (list all scraped URLs used)

## PRIVACY
- PUBLIC users: Hide USNs, personal emails, phone numbers
- ADMIN users: Show all information

Remember: You are a SEARCH ENGINE. Only present information that exists in the scraped data.
`;

interface GenerateResponseResult {
  text: string;
  citations: Citation[];
  needsWebSearchApproval: boolean;
  scrapedPages?: string[];
}

// Progress callback for UI updates
type ProgressCallback = (status: string) => void;

export const generateAnswer = async (
  query: string,
  history: { role: string; content: string }[],
  role: Role,
  documents: Document[],
  enableWebSearch: boolean,
  onProgress?: ProgressCallback
): Promise<GenerateResponseResult> => {

  try {
    // Step 1: Scrape SIT website for relevant data
    onProgress?.('Searching SIT website...');

    const scrapedData = await searchSITWebsite(query);
    console.log('[Search] Scraped data from:', scrapedData.relevantPages);

    // Step 2: Also check internal documents
    onProgress?.('Checking internal records...');

    const relevantDocs = documents.filter(doc => {
      if (role === Role.PUBLIC && doc.isRestricted) return false;
      const keywords = query.toLowerCase().split(' ');
      return keywords.some(k => k.length > 2 &&
        (doc.content.toLowerCase().includes(k) || doc.title.toLowerCase().includes(k)));
    });

    const internalContext = relevantDocs.length > 0
      ? `\n\n## INTERNAL RECORDS:\n${relevantDocs.map(d =>
        `[Document: ${d.title}]\n${d.content}`).join('\n\n')}`
      : '';

    // Step 3: Build context with scraped data
    const systemInstruction = `
${SEARCH_ENGINE_INSTRUCTION}

CURRENT USER ROLE: ${role}

## SCRAPED WEB DATA FROM SIT WEBSITE:
${scrapedData.content || 'No data could be scraped from the website.'}
${internalContext}

## SCRAPED SOURCES:
${scrapedData.relevantPages.map(url => `- ${url}`).join('\n')}
`;

    // Step 4: Generate response
    onProgress?.('Generating response...');

    const ai = getAIClient();
    const limitedHistory = history.slice(-10); // Reduced history for search context

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
          tools: enableWebSearch ? [{ googleSearch: {} }] : undefined,
        }
      });
    });

    let text = response.text || "";

    // Combine citations from scraping and any grounding
    const citations: Citation[] = [...scrapedData.citations];

    // Add grounding citations from Gemini
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (groundingChunks) {
      groundingChunks.forEach((chunk: any) => {
        if (chunk.web && !citations.some(c => c.url === chunk.web.uri)) {
          citations.push({
            title: chunk.web.title || "Web Result",
            url: chunk.web.uri,
            sourceType: SourceType.EXTERNAL_WEB
          });
        }
      });
    }

    // Add internal document citations
    relevantDocs.forEach(doc => {
      if (!citations.some(c => c.title === doc.title)) {
        citations.push({
          title: doc.title,
          sourceType: SourceType.INTERNAL,
          snippet: "Verified Internal Record"
        });
      }
    });

    return {
      text,
      citations,
      needsWebSearchApproval: false,
      scrapedPages: scrapedData.relevantPages,
    };

  } catch (error: any) {
    console.error("Search Engine Error:", error);

    let userMessage = "⚠️ **Search Error**\n\n";

    if (error?.message?.includes("Rate limit") || error?.message?.includes("429")) {
      userMessage += "The search service is busy. Please wait a moment and try again.";
    } else if (error?.message?.includes("API key")) {
      userMessage += "Configuration error. Please contact the administrator.";
    } else if (error?.message?.includes("network") || error?.message?.includes("fetch")) {
      userMessage += "Network error. Please check your internet connection.";
    } else {
      userMessage += `${error.message || "An unexpected error occurred."}\n\nPlease try again.`;
    }

    return {
      text: userMessage,
      citations: [],
      needsWebSearchApproval: false,
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
    }, 2);

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
        model: MODEL_MAIN,
        contents: {
          parts: [
            { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
            { text: "Transcribe this audio exactly. Return only the transcription." }
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

// STREAMING TTS - Generate speech in chunks for faster playback
export const generateSpeechStreaming = async (
  text: string,
  onChunkReady: (audioData: string, chunkIndex: number, isLast: boolean) => void
): Promise<void> => {
  const ai = getAIClient();

  // Split text into smaller chunks for faster initial playback
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks: string[] = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length < 200) {
      currentChunk += sentence;
    } else {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = sentence;
    }
  }
  if (currentChunk) chunks.push(currentChunk.trim());

  // Limit to reasonable number of chunks
  const finalChunks = chunks.slice(0, 10);

  console.log(`[TTS] Generating ${finalChunks.length} audio chunks...`);

  // Generate first chunk immediately for fast start
  for (let i = 0; i < finalChunks.length; i++) {
    try {
      const response = await ai.models.generateContent({
        model: MODEL_TTS,
        contents: [{ parts: [{ text: finalChunks[i] }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        onChunkReady(audioData, i, i === finalChunks.length - 1);
      }
    } catch (e) {
      console.error(`[TTS] Chunk ${i} failed:`, e);
    }
  }
};

// Legacy single-call TTS for backward compatibility
export const generateSpeech = async (text: string): Promise<string | undefined> => {
  try {
    const ai = getAIClient();

    // Truncate and clean text for TTS
    const cleanText = text
      .replace(/\*\*/g, '')  // Remove bold
      .replace(/\[Source:.*?\]/g, '') // Remove citations
      .replace(/\|/g, ', ') // Convert table pipes
      .replace(/#+\s/g, '') // Remove headings
      .substring(0, 1500);

    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: MODEL_TTS,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });
    }, 1); // Only 1 retry for TTS

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    console.error("TTS error:", e);
    return undefined;
  }
};

// Initialize - prefetch common pages
export const initializeSearchEngine = (): void => {
  console.log('[Search Engine] Initializing...');
  prefetchCommonPages();
};

// Export utility for resetting the client if needed
export const resetGeminiClient = resetAIClient;