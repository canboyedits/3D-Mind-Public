import type { Request, Response } from 'express';
import { DEFAULT_HISTORY_PAGE_SIZE } from '../utils/history.js';
import { validateRecordId } from '../utils/records.js';
import type { ChatbotService } from '../services/chatbotService.js';
import { HistoryService } from '../services/historyService.js';

function toNumber(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function createChatController(chatbotService: ChatbotService, historyService = new HistoryService()) {
  const handleChat = async (req: Request, res: Response) => {
    try {
      const requestBody = {
        prompt: typeof req.body?.prompt === 'string' ? req.body.prompt : '',
        recordUid: typeof req.body?.recordUid === 'string' ? req.body.recordUid : '',
        contextHint: typeof req.body?.contextHint === 'string' ? req.body.contextHint : undefined,
      };

      const result = await chatbotService.processPrompt(requestBody);
      await historyService.append(result.recordPaths, result.historyEntries);

      const payload = {
        reply: result.reply,
        model: result.modelUsed,
      };

      res.json(payload);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const response: Record<string, unknown> = {
        error: (error as Error).message ?? 'Failed to generate a reply.',
      };
      if (status === 404) {
        response.error = 'Patient record not found on local disk.';
      } else if (status === 400 && typeof (error as Error).message === 'string' && (error as Error).message.includes('record')) {
        response.error = 'Invalid record identifier supplied.';
      }
      if ((error as { detail?: unknown }).detail) {
        response.detail = (error as { detail?: unknown }).detail;
      }
      if (status >= 500) {
        console.error('Chatbot request failed', error);
      }
      res.status(status).json(response);
    }
  };

  const handleHistory = async (req: Request, res: Response) => {
    try {
      const recordUidRaw = Array.isArray(req.query?.recordUid) ? req.query.recordUid[0] : req.query?.recordUid;
      const recordUid = typeof recordUidRaw === 'string' ? recordUidRaw : '';
      const safeRecordId = validateRecordId(recordUid);

      const offsetRaw = Array.isArray(req.query?.offset) ? req.query.offset[0] : req.query?.offset;
      const limitRaw = Array.isArray(req.query?.limit) ? req.query.limit[0] : req.query?.limit;

      const offset = toNumber(offsetRaw, 0);
      const limit = toNumber(limitRaw, DEFAULT_HISTORY_PAGE_SIZE);

      const recordPaths = chatbotService.resolveRecord(safeRecordId);
      const result = await historyService.loadChunk(recordPaths, { recordUid: safeRecordId, offset, limit });

      res.json(result);
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode ?? 500;
      const response: Record<string, unknown> = {
        error: (error as Error).message ?? 'Failed to load chat history.',
      };
      if (status === 404) {
        response.error = 'Patient record not found on local disk.';
      }
      if (status >= 500) {
        console.error('Chat history request failed', error);
      }
      res.status(status).json(response);
    }
  };

  return { handleChat, handleHistory };
}
