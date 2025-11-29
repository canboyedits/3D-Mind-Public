import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatbotRouterOptions } from '../types/index.js';

const DEFAULT_MODEL = 'gemini-1.5-flash';

export interface RuntimeConfig {
  recordsRoot: string;
  geminiApiKey: string;
  geminiModel: string;
  modelCandidates: string[];
  genAI: GoogleGenerativeAI;
}

export function createRuntimeConfig(options: ChatbotRouterOptions = {}): RuntimeConfig {
  const geminiApiKey = options.geminiApiKey ?? process.env.GEMINI_API_KEY;
  if (!geminiApiKey) {
    throw new Error('Missing GEMINI_API_KEY. Provide it via environment or ChatbotRouterOptions.');
  }

  const geminiModel = options.geminiModel ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const recordsRoot = options.recordsRoot ?? process.env.RECORDS_ROOT ?? path.resolve(process.cwd(), 'storage/records');

  const modelCandidates = Array.from(
    new Set([
      geminiModel,
      'gemini-1.5-pro',
      'gemini-1.5-flash-8b',
    ]),
  );

  return {
    recordsRoot,
    geminiApiKey,
    geminiModel,
    modelCandidates,
    genAI: new GoogleGenerativeAI(geminiApiKey),
  };
}
