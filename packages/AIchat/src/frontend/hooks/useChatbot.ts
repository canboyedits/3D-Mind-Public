import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatbotUIProps } from '../types/index.js';
import { fetchHistory, sendPrompt } from '../utils/api.js';

const HISTORY_PAGE_SIZE = 20;

function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface UseChatbotOptions {
  recordUid?: string | null;
  contextHint?: string;
  apiBaseUrl?: string;
}

export function useChatbot(options: UseChatbotOptions) {
  const { recordUid, contextHint, apiBaseUrl } = options;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const initialisedRef = useRef(false);

  const canUseChat = Boolean(recordUid);

  const resetState = useCallback(() => {
    setMessages([]);
    setSendError(null);
    setHistoryError(null);
    setHistoryOffset(0);
    setHasMoreHistory(true);
    setIsHistoryLoading(false);
    initialisedRef.current = false;
  }, []);

  const loadHistory = useCallback(async (offset: number, preserveExisting: boolean) => {
    if (!recordUid) return;
    if (isHistoryLoading) return;

    setIsHistoryLoading(true);
    setHistoryError(null);

    try {
      const result = await fetchHistory(recordUid, {
        offset,
        limit: HISTORY_PAGE_SIZE,
        apiBaseUrl,
      });

      setMessages((prev: ChatMessage[]) => {
        if (preserveExisting) {
          const existingIds = new Set(prev.map((message: ChatMessage) => message.id));
          const combined = [...result.messages.filter((msg) => !existingIds.has(msg.id)), ...prev];
          return combined;
        }
        return result.messages;
      });

      setHistoryOffset(result.nextOffset ?? offset + result.messages.length);
      setHasMoreHistory(result.hasMore);
      if (!result.hasMore) {
        initialisedRef.current = true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load chat history.';
      setHistoryError(message);
    } finally {
      setIsHistoryLoading(false);
    }
  }, [recordUid, apiBaseUrl, isHistoryLoading]);

  useEffect(() => {
    if (!recordUid) {
      resetState();
      return;
    }
    resetState();
    void loadHistory(0, false);
  }, [recordUid, resetState, loadHistory]);

  const sendMessage = useCallback(async (content: string) => {
    if (!recordUid) {
      setSendError('Patient data is not available yet.');
      return;
    }
    const trimmed = content.trim();
    if (!trimmed) return;
    const isPrescriptionCommand = trimmed.toLowerCase().startsWith('@doctor prescription entry');
    const displayContent = isPrescriptionCommand ? 'Doctor uploaded a prescription.' : trimmed;

    const userMessage: ChatMessage = {
      id: createMessageId(),
      role: 'user',
      content: displayContent,
      timestamp: new Date().toISOString(),
      ...(isPrescriptionCommand
        ? {
            meta: {
              type: 'prescription',
              event: 'upload',
            } as Record<string, unknown>,
          }
        : {}),
    };

    setMessages((prev: ChatMessage[]) => [...prev, userMessage]);
    setIsSending(true);
    setSendError(null);

    try {
      const response = await sendPrompt({
        prompt: trimmed,
        recordUid,
        contextHint: contextHint ?? null,
      }, apiBaseUrl);

      const assistantMessage: ChatMessage = {
        id: createMessageId(),
        role: 'assistant',
        content: response.reply,
        timestamp: new Date().toISOString(),
        meta: { model: response.model },
      };

      setMessages((prev: ChatMessage[]) => [...prev, assistantMessage]);
      setHistoryOffset((prev: number) => prev + 2);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to send message.';
      setSendError(message);
      setMessages((prev: ChatMessage[]) => [...prev, {
        id: createMessageId(),
        role: 'assistant',
        content: 'Sorry, I could not process that request right now.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsSending(false);
    }
  }, [recordUid, apiBaseUrl, contextHint]);

  const handleLoadMore = useCallback(async () => {
    if (!recordUid || !hasMoreHistory || isHistoryLoading) {
      return;
    }
    await loadHistory(historyOffset, true);
  }, [recordUid, hasMoreHistory, isHistoryLoading, loadHistory, historyOffset]);

  const state = useMemo(() => ({
    messages,
    isSending,
    sendError,
    historyError,
    hasMoreHistory,
    isHistoryLoading,
    canUseChat,
  }), [
    messages,
    isSending,
    sendError,
    historyError,
    hasMoreHistory,
    isHistoryLoading,
    canUseChat,
  ]);

  return {
    state,
    sendMessage,
    loadMoreHistory: handleLoadMore,
    resetState,
  };
}

export type UseChatbotReturn = ReturnType<typeof useChatbot>;

export type UseChatbotProps = Pick<ChatbotUIProps, 'recordUid' | 'contextHint' | 'apiBaseUrl'>;
