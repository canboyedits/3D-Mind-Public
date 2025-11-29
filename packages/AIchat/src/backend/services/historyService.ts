import type { ChatHistoryEntry, ChatHistoryQuery, ChatHistoryResult, PatientRecordPaths } from '../types/index.js';
import { appendHistory, getHistoryChunk, DEFAULT_HISTORY_PAGE_SIZE } from '../utils/history.js';

export class HistoryService {
  async append(paths: PatientRecordPaths, entries: ChatHistoryEntry[]): Promise<void> {
    await appendHistory(paths, entries);
  }

  async loadChunk(paths: PatientRecordPaths, query: ChatHistoryQuery): Promise<ChatHistoryResult> {
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_HISTORY_PAGE_SIZE;
    return getHistoryChunk(paths, offset, limit);
  }
}
