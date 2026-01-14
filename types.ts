export enum Role {
  PUBLIC = 'PUBLIC',
  AUTHORIZED = 'AUTHORIZED', // Student/Faculty
  ADMIN = 'ADMIN'
}

export enum SourceType {
  INTERNAL = 'Internal Records',
  COLLEGE_WEB = 'College Website',
  EXTERNAL_WEB = 'External Web Search'
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
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  citations?: Citation[];
  timestamp: number;
  needsWebSearchApproval?: boolean; // If true, UI shows "Search Web" button
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