# SIT Scholar AI - Intelligent Academic Search Engine

An advanced, AI-powered search interface designed for the Siddaganga Institute of Technology (SIT). It mimics the functionality of perplexity.ai but is tailored for academic datasets, providing privacy-gated access to student records, faculty details, and curriculum info.

## 🚀 Key Features

*   **Intelligent Retrieval**: Uses Gemini 3 Pro reasoning to answer complex academic queries.
*   **Privacy Gates**: Distinguishes between Public, Student, and Admin roles to redact sensitive info (USNs, Phone Numbers) automatically.
*   **Live Speech-to-Speech**: A real-time, low-latency voice mode for natural conversation.
*   **Rich Text Support**: Renders Markdown tables and **LaTeX** math formulas ($E=mc^2$).
*   **Voice Interactions**: 
    *   **Dictation**: High-accuracy speech-to-text.
    *   **Read Aloud**: Natural-sounding text-to-speech with Pause/Resume controls.

---

## 🛠️ Technology Stack & Architecture

### 1. Frontend
*   **Framework**: React 19 (TypeScript)
*   **Styling**: Tailwind CSS (Dark/Light mode support)
*   **Rendering**: `react-markdown` with `rehype-katex` for Math/LaTeX support.

### 2. AI Models (Google Gemini)
We use a tiered model approach to balance speed, cost, and intelligence:

*   **Chat Logic & Reasoning**: `gemini-3-pro-preview`
    *   Used for the main chat interface. It analyzes internal documents and formats the response.
*   **Transcription (STT)**: `gemini-3-flash-preview`
    *   Multimodal input capability allows us to send raw audio bytes directly to the model for transcription.
*   **Text-to-Speech (TTS)**: `gemini-2.5-flash-preview-tts`
    *   Generates high-quality, natural-sounding audio.
*   **Real-time Conversation**: `gemini-2.5-flash-native-audio-preview-12-2025`
    *   Used in the "Live Mode" for WebSocket-based, interruptible audio streaming.
*   **Fast Utility Tasks**: `gemini-2.5-flash-lite`
    *   Used for background tasks like generating chat titles.

### 3. Backend & "Scraping"
*   **No Live Scraping**: This demo does **not** scrape the live SIT website in real-time to avoid CORS issues and IP bans during testing.
*   **Simulated RAG (Retrieval Augmented Generation)**:
    *   We use a "Mock Backend" (`services/storageService.ts` and `constants.ts`).
    *   Data (Student lists, Faculty details) is pre-extracted (OCR) and stored as structured text constants.
    *   When you ask a question, the app searches these internal text blocks (acting as a Vector DB) and feeds the relevant chunks to Gemini 3 Pro to generate the answer.
    *   *Production Path*: In a real app, this would be replaced by a Python backend (FastAPI) using `BeautifulSoup` to scrape `sit.ac.in` and storing embeddings in `Pinecone` or `ChromaDB`.

---

## 🔑 API Key & Configuration

The application uses the **Google GenAI SDK** (`@google/genai`).
The API key is injected via the environment variable `process.env.API_KEY`.

**System Prompts**:
The AI is instructed to:
1.  Assume "MCA Department" context if unspecified.
2.  Always use Markdown tables for data.
3.  Cross-reference internal data with external web search (if enabled).

---

## 🎙️ How Audio Works

### Speech-to-Text (Dictation)
1.  Browser's `MediaRecorder` captures audio as a `WebM` blob.
2.  Blob is converted to Base64.
3.  Sent to `gemini-3-flash-preview` with prompt "Transcribe exactly".
4.  Resulting text is inserted into the input box.

### Speech-to-Speech (Live Mode)
1.  Establishes a WebSocket connection via `ai.live.connect`.
2.  **Input**: Browser microphone stream is downsampled to 16kHz PCM (Pulse Code Modulation) and sent in chunks.
3.  **Output**: Model returns 24kHz PCM audio chunks.
4.  **Playback**: We use the Web Audio API (`AudioContext`) to decode raw PCM bytes into an `AudioBuffer` and play them sequentially, handling the timing to ensure gapless playback.

---

## 📂 Project Structure

*   `components/`
    *   `ChatInterface.tsx`: Main chat view, search bar, message rendering.
    *   `LiveVoiceInterface.tsx`: Full-screen real-time voice mode.
    *   `Sidebar.tsx`: History management.
    *   `AdminPanel.tsx`: UI to add/edit internal "scraped" documents.
*   `services/`
    *   `geminiService.ts`: All calls to Google AI (Chat, STT, TTS).
    *   `storageService.ts`: LocalStorage wrapper for persisting chat history.
*   `types.ts`: TypeScript interfaces for Messages, Documents, Roles.

---

## 🔮 Future Roadmap (Stage 2)

*   **Google OAuth**: Replace the hardcoded "Admin" role with real Google Sign-In using Firebase Auth.
*   **Vector Database**: Replace `constants.ts` with a real vector search for scalable document retrieval.
