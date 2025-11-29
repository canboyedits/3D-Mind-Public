export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp?: string;
  meta?: Record<string, unknown>;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  hasMore: boolean;
  nextOffset: number;
  total: number;
}

export interface SendPromptPayload {
  prompt: string;
  recordUid: string;
  contextHint?: string | null;
}

export interface ChatbotUIProps {
  recordUid?: string | null;
  contextHint?: string;
  apiBaseUrl?: string;
  title?: string;
  height?: number | string;
  onClose?: () => void;
  showCloseButton?: boolean;
  patientName?: string;
  patientDob?: string;
}

export interface PrescriptionFormValues {
  patientName: string;
  patientAge: string;
  diagnosis: string;
  medications: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
  nextAppointment: string;
}
