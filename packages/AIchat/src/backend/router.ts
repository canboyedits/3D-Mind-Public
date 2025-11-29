import { Router } from 'express';
import { createRuntimeConfig } from './utils/runtimeConfig.js';
import { ChatbotService } from './services/chatbotService.js';
import { HistoryService } from './services/historyService.js';
import { createChatController } from './controllers/chatController.js';
import type { ChatbotRouterOptions } from './types/index.js';

export function createChatbotRouter(options?: ChatbotRouterOptions): Router {
  const config = createRuntimeConfig(options);
  const chatbotService = new ChatbotService(config);
  const historyService = new HistoryService();
  const controller = createChatController(chatbotService, historyService);

  const router = Router();
  router.post('/chat', controller.handleChat);
  router.get('/chat/history', controller.handleHistory);
  return router;
}
