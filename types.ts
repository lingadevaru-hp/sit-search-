export enum Role {
  PUBLIC = 'PUBLIC',
  AUTHORIZED = 'AUTHORIZED',
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
  content: string;
  category: string;
  sourceType?: SourceType;
  isRestricted: boolean;
  uploadedAt: number;
  citation?: string;
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
  needsWebSearchApproval?: boolean;
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