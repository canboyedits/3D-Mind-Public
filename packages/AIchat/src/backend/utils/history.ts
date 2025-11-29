import { promises as fs } from 'fs';
import type { ChatHistoryEntry, ChatHistoryResult, PatientRecordPaths } from '../types/index.js';

export const DEFAULT_HISTORY_PAGE_SIZE = 20;
const HISTORY_MAX_LIMIT = 100;

export async function readHistory(historyPath: string): Promise<ChatHistoryEntry[]> {
  const raw = await fs.readFile(historyPath, 'utf8').catch((error: unknown) => {
    const nodeError = error as { code?: string };
    if (nodeError.code === 'ENOENT') {
      return '[]';
    }
    throw error;
  });

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChatHistoryEntry[]) : [];
  } catch (error) {
    throw Object.assign(new Error('Failed to parse chat history file.'), { statusCode: 500 });
  }
}

export async function appendHistory(paths: PatientRecordPaths, entries: ChatHistoryEntry[]): Promise<void> {
  const history = await readHistory(paths.historyPath);
  history.push(...entries.map(normaliseHistoryEntry));
  await fs.writeFile(paths.historyPath, JSON.stringify(history, null, 2));
}

export async function getHistoryChunk(
  paths: PatientRecordPaths,
  offset = 0,
  limit = DEFAULT_HISTORY_PAGE_SIZE,
): Promise<ChatHistoryResult> {
  const history = await readHistory(paths.historyPath);
  const total = history.length;
  if (total === 0) {
    return { messages: [], total: 0, hasMore: false, nextOffset: 0 };
  }

  const safeOffset = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), HISTORY_MAX_LIMIT) : DEFAULT_HISTORY_PAGE_SIZE;

  const end = Math.max(total - safeOffset, 0);
  const start = Math.max(end - safeLimit, 0);
  const slice = history.slice(start, end);
  const retrieved = slice.length;
  const nextOffset = Math.min(total, safeOffset + retrieved);
  const hasMore = start > 0;

  return { messages: slice, total, hasMore, nextOffset };
}

export function normaliseHistoryEntry(entry: ChatHistoryEntry): ChatHistoryEntry {
  const role = entry.role === 'user' ? 'user' : 'assistant';
  const content = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content ?? '');
  const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : new Date().toISOString();
  const meta = entry.meta && typeof entry.meta === 'object' ? entry.meta : undefined;
  return meta ? { role, content, timestamp, meta } : { role, content, timestamp };
}
