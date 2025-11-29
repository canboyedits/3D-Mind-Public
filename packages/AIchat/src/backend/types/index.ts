export type ChatRole = 'user' | 'assistant';

export interface ChatHistoryEntry {
  role: ChatRole;
  content: string;
  timestamp?: string;
  meta?: Record<string, unknown>;
}

export interface ChatRequestBody {
  prompt: string;
  recordUid: string;
  contextHint?: string | null;
}

export interface ChatResponsePayload {
  reply: string;
  model: string;
}

export interface ChatHistoryQuery {
  recordUid: string;
  offset?: number;
  limit?: number;
}

export interface ChatHistoryResult {
  messages: ChatHistoryEntry[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
}

export interface PrescriptionData {
  patientName?: string;
  patientAge?: string;
  diagnosis?: string;
  medications?: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  nextAppointment?: string;
}

export interface PatientRecordPaths {
  safeRecordId: string;
  recordDir: string;
  metadataPath: string;
  historyPath: string;
}

export interface PatientMetadata {
  recordId?: string;
  createdAt?: string;
  patient?: {
    name?: string;
    dateOfBirth?: string;
    contact?: string;
    contactType?: string;
  };
  tumor?: {
    volume_cc?: number;
    hemisphere?: string;
    midline_shift_mm?: number;
    centroid_physical_xyz?: Array<number | string> | null;
    modality?: string;
    radiomics?: Record<string, unknown>;
  };
}

export interface ChatbotRouterOptions {
  recordsRoot?: string;
  geminiApiKey?: string;
  geminiModel?: string;
}
