import type { ChatHistoryResponse, SendPromptPayload, ChatMessage } from '../types/index.js';

const DEFAULT_BASE_URL = (() => {
  try {
    const meta = import.meta as unknown as { env?: Record<string, string> };
    return meta.env?.VITE_CHATBOT_API_BASE_URL ?? 'http://localhost:3100/api';
  } catch (_error) {
    return 'http://localhost:3100/api';
  }
})();

export function getChatbotBaseUrl(apiBaseUrl?: string): string {
  const candidate = apiBaseUrl?.trim();
  if (!candidate) return DEFAULT_BASE_URL;
  return candidate.endsWith('/chat') || candidate.endsWith('/chat/') ? candidate.replace(/\/chat\/?$/, '') : candidate;
}

function normaliseMessage(entry: unknown): ChatMessage | null {
  const candidate = (entry ?? {}) as {
    role?: string;
    content?: unknown;
    timestamp?: string;
    meta?: Record<string, unknown>;
    id?: string;
  };
  const role = candidate.role === 'user' ? 'user' : candidate.role === 'assistant' ? 'assistant' : null;
  if (!role) return null;
  const content = typeof candidate.content === 'string' ? candidate.content : JSON.stringify(candidate.content ?? '');
  const timestamp = typeof candidate.timestamp === 'string' ? candidate.timestamp : undefined;
  const meta = candidate.meta && typeof candidate.meta === 'object' ? candidate.meta : undefined;
  const id = typeof candidate.id === 'string' && candidate.id.trim()
    ? candidate.id
    : `${role}-${timestamp ?? Date.now()}-${Math.random().toString(16).slice(2)}`;
  return { id, role, content, timestamp, meta };
}

export async function sendPrompt(payload: SendPromptPayload, apiBaseUrl?: string): Promise<{ reply: string; model: string }> {
  const baseUrl = getChatbotBaseUrl(apiBaseUrl);
  const response = await fetch(`${baseUrl}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `Chat request failed with status ${response.status}`;
    throw new Error(message);
  }

  const reply = typeof data?.reply === 'string' ? data.reply : '';
  const model = typeof data?.model === 'string' ? data.model : 'unknown-model';
  if (!reply) {
    throw new Error('Chatbot returned an empty response.');
  }
  return { reply, model };
}

export async function fetchHistory(
  recordUid: string,
  options: { offset?: number; limit?: number; apiBaseUrl?: string } = {},
): Promise<ChatHistoryResponse> {
  const baseUrl = getChatbotBaseUrl(options.apiBaseUrl);
  const params = new URLSearchParams({ recordUid });
  if (typeof options.offset === 'number') {
    params.set('offset', String(options.offset));
  }
  if (typeof options.limit === 'number') {
    params.set('limit', String(options.limit));
  }

  const response = await fetch(`${baseUrl}/chat/history?${params.toString()}`);
  const data = await response.json();
  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : `History request failed with status ${response.status}`;
    throw new Error(message);
  }

  const messages = Array.isArray(data?.messages)
    ? (data.messages as unknown[])
        .map((entry) => normaliseMessage(entry))
        .filter((entry): entry is ChatMessage => entry !== null)
    : [];
  return {
    messages,
    hasMore: Boolean(data?.hasMore),
    nextOffset: typeof data?.nextOffset === 'number' ? data.nextOffset : 0,
    total: typeof data?.total === 'number' ? data.total : messages.length,
  };
}
