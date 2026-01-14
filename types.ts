export enum Role {
  PUBLIC = 'PUBLIC',
  AUTHORIZED = 'AUTHORIZED', // Student/Faculty
  ADMIN = 'ADMIN'
}

export enum SourceType {
  INTERNAL = 'Internal Records',
  COLLEGE_WEB = 'SIT Website',
  EXTERNAL_WEB = 'External Web'
}

export interface Document {
  id: string;
  title: string;
  content: string; // Plain text content for this demo
  category: 'student_list' | 'faculty_file' | 'curriculum' | 'other';
  isRestricted: boolean;
  dateUploaded: string;
}

export interface Citation {
  url?: string;
  title: string;
  sourceType: SourceType;
  snippet?: string;
  scrapedAt?: number;
  pageSection?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  citations?: Citation[];
  timestamp: number;
  needsWebSearchApproval?: boolean;
  isSearching?: boolean; // New: shows when actively scraping
  scrapedPages?: string[]; // New: tracks which pages were scraped
}

export interface Thread {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

export interface UserState {
  role: Role;
  isAuthenticated: boolean;
}

// Audio/TTS Types
export interface TTSChunk {
  text: string;
  audioData?: string;
  status: 'pending' | 'generating' | 'ready' | 'playing' | 'error';
}

export interface AudioPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentChunk: number;
  totalChunks: number;
  progress: number;
}

// Live Voice Types
export interface LiveVoiceState {
  status: 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';
  audioLevel: number;
  transcript: string;
  response: string;
}

// Search Result Types
export interface SearchContext {
  query: string;
  scrapedContent: string;
  citations: Citation[];
  scrapedAt: number;
}