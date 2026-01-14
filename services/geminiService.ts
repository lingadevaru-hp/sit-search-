import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Document, Role, SourceType, Citation } from "../types";
import { TRUSTED_DOMAINS, MODEL_MAIN, MODEL_TRANSCRIPTION, MODEL_TTS, MODEL_FAST_LITE } from "../constants";

// The API key is injected via vite.config.ts from the .env file
const apiKey = process.env.GEMINI_API_KEY;
console.log("Using API Key starting with:", apiKey ? apiKey.substring(0, 8) + "..." : "UNDEFINED");
const ai = new GoogleGenAI({ apiKey: apiKey });

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
    const response = await ai.models.generateContent({
      model: MODEL_MAIN,
      contents: [
        ...history.map(h => ({
          role: h.role === 'user' ? 'user' : 'model',
          parts: [{ text: h.content }]
        })),
        { role: 'user', parts: [{ text: query }] }
      ],
      config: {
        systemInstruction: systemInstruction,
        tools: tools,
      }
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
    const errorMessage = error.message || error.toString() || "Unknown error";
    return {
      text: `⚠️ **API Error**: ${errorMessage}\n\n*Please share this error message so we can fix it.*`,
      citations: [],
      needsWebSearchApproval: false
    };
  }
};

export const generateChatTitle = async (firstMessage: string, firstResponse: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_FAST_LITE,
      contents: `Generate a short, professional title (max 4-5 words) for this search query: "${firstMessage}". Return ONLY the title text.`,
    });
    return response.text?.trim() || "Search Session";
  } catch (e) {
    return "Search Session";
  }
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TRANSCRIPTION,
      contents: {
        parts: [
          { inlineData: { mimeType: 'audio/webm', data: base64Audio } },
          { text: "Transcribe exactly." }
        ]
      }
    });
    return response.text || "";
  } catch (e) {
    return "";
  }
};

export const generateSpeech = async (text: string): Promise<string | undefined> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_TTS,
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (e) {
    return undefined;
  }
};