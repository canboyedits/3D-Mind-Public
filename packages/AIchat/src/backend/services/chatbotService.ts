import type { GenerativeModel } from '@google/generative-ai';
import type {
  ChatHistoryEntry,
  ChatRequestBody,
  PatientRecordPaths,
  PrescriptionData,
} from '../types/index.js';
import { resolveRecordPaths, loadPatientMetadata, ensureRecordDirectoryExists } from '../utils/records.js';
import {
  buildGeneralPrompt,
  buildPatientContext,
  buildPrompt,
  isCourtesyQuestion,
  isMedicalQuestion,
  shouldIncludeFullRadiomics,
} from '../utils/prompts.js';
import type { RuntimeConfig } from '../utils/runtimeConfig.js';
import { readHistory } from '../utils/history.js';

interface GenerateOptions {
  question: string;
  recordUid: string;
  contextHint?: string | null;
  recordPaths?: PatientRecordPaths;
}

interface GenerateResult {
  reply: string;
  modelUsed: string;
  recordPaths: PatientRecordPaths;
  historyEntries: ChatHistoryEntry[];
}

const DOCTOR_PRESCRIPTION_TRIGGER = '@doctor prescription entry';
const PRESCRIPTION_AVAILABLE_MESSAGE = 'Prescription is available.';
const PRESCRIPTION_MANUAL_MODEL = 'prescription-manual-entry';
const PRESCRIPTION_HISTORY_MODEL = 'prescription-history';
const PRESCRIPTION_UPLOAD_SUMMARY = 'Doctor uploaded a prescription.';
const NEXT_APPOINTMENT_HISTORY_MODEL = 'prescription-next-appointment';
const NO_PRESCRIPTION_MESSAGE = 'No prescription has been recorded yet.';
const NO_APPOINTMENT_MESSAGE = 'No next appointment has been scheduled yet.';

export class ChatbotService {
  constructor(private readonly config: RuntimeConfig) {}

  resolveRecord(recordUid: string): PatientRecordPaths {
    return resolveRecordPaths(this.config.recordsRoot, recordUid);
  }

  async processPrompt(request: ChatRequestBody): Promise<GenerateResult> {
    const question = request.prompt.trim();
    if (!question) {
      const error = new Error('Prompt must be a non-empty string.');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const recordUid = request.recordUid?.trim();
    if (!recordUid) {
      const error = new Error('recordUid is required to personalise the chat.');
      (error as Error & { statusCode: number }).statusCode = 400;
      throw error;
    }

    const result = await this.generatePatientAwareReply({
      question,
      recordUid,
      contextHint: request.contextHint,
    });

    return {
      reply: result.reply,
      modelUsed: result.modelUsed,
      recordPaths: result.recordPaths,
      historyEntries: result.historyEntries,
    };
  }

  private async generatePatientAwareReply(options: GenerateOptions): Promise<GenerateResult> {
    const { question, recordUid, contextHint } = options;
    const recordPaths = options.recordPaths ?? this.resolveRecord(recordUid);
    await ensureRecordDirectoryExists(recordPaths.recordDir);
    const lowerQuestion = question.toLowerCase();

    if (lowerQuestion.startsWith(DOCTOR_PRESCRIPTION_TRIGGER)) {
      const prescriptionData = parsePrescriptionCommand(question);
      const timestamp = new Date().toISOString();

      const userEntry: ChatHistoryEntry = {
        role: 'user',
        content: PRESCRIPTION_UPLOAD_SUMMARY,
        timestamp,
        meta: {
          type: 'prescription',
          event: 'upload',
        } as Record<string, unknown>,
      };

      const assistantEntry: ChatHistoryEntry = {
        role: 'assistant',
        content: PRESCRIPTION_AVAILABLE_MESSAGE,
        timestamp,
        meta: {
          type: 'prescription',
          recordedAt: timestamp,
          data: prescriptionData,
        } as Record<string, unknown>,
      };

      return {
        reply: PRESCRIPTION_AVAILABLE_MESSAGE,
        modelUsed: PRESCRIPTION_MANUAL_MODEL,
        recordPaths,
        historyEntries: [userEntry, assistantEntry],
      };
    }

    if (isNextAppointmentRequest(lowerQuestion)) {
      const prescriptionData = await findLatestPrescription(recordPaths);
      const nextAppointment = prescriptionData?.nextAppointment?.trim();
      const userTimestamp = new Date().toISOString();
      const assistantTimestamp = new Date().toISOString();

      const userEntry: ChatHistoryEntry = {
        role: 'user',
        content: question,
        timestamp: userTimestamp,
      };

      const meta: Record<string, unknown> = {
        type: 'prescription',
        source: 'history',
        query: 'next-appointment',
      };

      let message = NO_APPOINTMENT_MESSAGE;
      if (nextAppointment && prescriptionData) {
        message = formatNextAppointmentResponse(prescriptionData);
        meta.data = prescriptionData;
      }

      const assistantEntry: ChatHistoryEntry = {
        role: 'assistant',
        content: message,
        timestamp: assistantTimestamp,
        meta,
      };

      return {
        reply: message,
        modelUsed: NEXT_APPOINTMENT_HISTORY_MODEL,
        recordPaths,
        historyEntries: [userEntry, assistantEntry],
      };
    }

    if (isPrescriptionRequest(lowerQuestion)) {
      const prescriptionData = await findLatestPrescription(recordPaths);
      const userTimestamp = new Date().toISOString();
      const assistantTimestamp = new Date().toISOString();

      const userEntry: ChatHistoryEntry = {
        role: 'user',
        content: question,
        timestamp: userTimestamp,
      };

      if (!prescriptionData) {
        const message = NO_PRESCRIPTION_MESSAGE;
        const assistantEntry: ChatHistoryEntry = {
          role: 'assistant',
          content: message,
          timestamp: assistantTimestamp,
          meta: { model: PRESCRIPTION_HISTORY_MODEL } as Record<string, unknown>,
        };

        return {
          reply: message,
          modelUsed: PRESCRIPTION_HISTORY_MODEL,
          recordPaths,
          historyEntries: [userEntry, assistantEntry],
        };
      }

      const formatted = formatPrescriptionResponse(prescriptionData);
      const assistantEntry: ChatHistoryEntry = {
        role: 'assistant',
        content: formatted,
        timestamp: assistantTimestamp,
        meta: {
          type: 'prescription',
          source: 'history',
          data: prescriptionData,
        } as Record<string, unknown>,
      };

      return {
        reply: formatted,
        modelUsed: PRESCRIPTION_HISTORY_MODEL,
        recordPaths,
        historyEntries: [userEntry, assistantEntry],
      };
    }

    if (isCourtesyQuestion(question) && !isMedicalQuestion(question)) {
      const timestamp = new Date().toISOString();
      return {
        reply: "You're welcome! I'm here whenever you need more information about your scan or treatment plan.",
        modelUsed: 'courtesy-response',
        recordPaths,
        historyEntries: [
          { role: 'user', content: question, timestamp },
          {
            role: 'assistant',
            content: "You're welcome! I'm here whenever you need more information about your scan or treatment plan.",
            timestamp,
            meta: { model: 'courtesy-response' },
          },
        ],
      };
    }

    if (!isMedicalQuestion(question)) {
      const prompt = buildGeneralPrompt(question, contextHint ?? undefined);
      const { text, modelUsed } = await this.safeGenerate(prompt);
      const userTimestamp = new Date().toISOString();
      const assistantTimestamp = new Date().toISOString();
      return {
        reply: text,
        modelUsed,
        recordPaths,
        historyEntries: [
          { role: 'user', content: question, timestamp: userTimestamp },
          { role: 'assistant', content: text, timestamp: assistantTimestamp, meta: { model: modelUsed } },
        ],
      };
    }

    const metadata = await loadPatientMetadata(recordPaths);
    const includeFullRadiomics = shouldIncludeFullRadiomics(question);
    const patientContext = buildPatientContext(metadata, includeFullRadiomics, contextHint ?? undefined);
    const prompt = buildPrompt(patientContext, question);
    const { text, modelUsed } = await this.safeGenerate(prompt);
    const userTimestamp = new Date().toISOString();
    const assistantTimestamp = new Date().toISOString();

    return {
      reply: text,
      modelUsed,
      recordPaths,
      historyEntries: [
        { role: 'user', content: question, timestamp: userTimestamp },
        { role: 'assistant', content: text, timestamp: assistantTimestamp, meta: { model: modelUsed } },
      ],
    };
  }

  private getModelInstance(modelName: string): GenerativeModel {
    return this.config.genAI.getGenerativeModel({ model: modelName });
  }

  private async safeGenerate(prompt: string): Promise<{ text: string; modelUsed: string }> {
    const attempts: Array<{ model: string; message: string }> = [];
    for (const candidate of this.config.modelCandidates) {
      try {
        const instance = this.getModelInstance(candidate);
        const result = await instance.generateContent(prompt);
        const text = result.response?.text?.()?.trim();
        if (!text) {
          throw new Error('Empty response body');
        }
        return { text, modelUsed: candidate };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ model: candidate, message });
        const status = (error as { status?: number }).status;
        if (status && status !== 404) {
          throw error;
        }
      }
    }

    const detail = attempts.map((attempt) => `${attempt.model} => ${attempt.message}`).join('; ');
    throw new Error(`All candidate models failed: ${detail}`);
  }
}

const PRESCRIPTION_FIELD_MAP: Record<string, keyof PrescriptionData> = {
  'patient name': 'patientName',
  'patient': 'patientName',
  'age': 'patientAge',
  'patient age': 'patientAge',
  'diagnosis': 'diagnosis',
  'medications': 'medications',
  'medication': 'medications',
  'dosage': 'dosage',
  'frequency': 'frequency',
  'duration': 'duration',
  'additional instructions': 'instructions',
  'instructions': 'instructions',
  'next appointment': 'nextAppointment',
  'appointment': 'nextAppointment',
  'follow up': 'nextAppointment',
};

const PRESCRIPTION_KEYWORDS = ['prescription', 'prescribtion', 'priscribtion'];
const NEXT_APPOINTMENT_KEYWORDS = [
  'next appointment',
  'future appointments',
  'future appointment',
  'follow up',
  'follow-up',
  'followup',
  'next visit',
  'next checkup',
  'upcoming appointment',
  'upcoming appointments',
];
const MS_PER_DAY = 86_400_000;

function isPrescriptionRequest(question: string): boolean {
  const normalised = question.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!PRESCRIPTION_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return false;
  }
  return normalised.includes('give')
    || normalised.includes('show')
    || normalised.includes('provide')
    || normalised.includes('share')
    || normalised.includes('view')
    || normalised.includes('see');
}

function isNextAppointmentRequest(question: string): boolean {
  const normalised = question.replace(/\s+/g, ' ').trim().toLowerCase();
  if (NEXT_APPOINTMENT_KEYWORDS.some((keyword) => normalised.includes(keyword))) {
    return true;
  }
  if (normalised.includes('appointment')) {
    return normalised.includes('next')
      || normalised.includes('when')
      || normalised.includes('schedule')
      || normalised.includes('scheduled')
      || normalised.includes('due');
  }
  if (normalised.includes('follow')) {
    return normalised.includes('up');
  }
  return false;
}

function parsePrescriptionCommand(command: string): PrescriptionData {
  const lines = command.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const data: PrescriptionData = {};
  let currentKey: keyof PrescriptionData | null = null;

  for (const line of lines.slice(1)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      if (!currentKey) continue;
      const addition = line.trim();
      if (!addition) continue;
      const existing = data[currentKey];
      data[currentKey] = existing ? `${existing}\n${addition}` : addition;
      continue;
    }

    const labelRaw = line.slice(0, separatorIndex);
    const valueRaw = line.slice(separatorIndex + 1);
    const label = labelRaw.trim().toLowerCase();
    const key = PRESCRIPTION_FIELD_MAP[label];
    if (!key) {
      currentKey = null;
      continue;
    }

    const value = valueRaw.trim();
    if (!value) {
      currentKey = null;
      continue;
    }

    data[key] = value;
    currentKey = key;
  }

  if (Object.keys(data).length === 0) {
    const error = new Error('Prescription details were not provided.');
    (error as Error & { statusCode: number }).statusCode = 400;
    throw error;
  }

  return data;
}

async function findLatestPrescription(recordPaths: PatientRecordPaths): Promise<PrescriptionData | null> {
  const history = await readHistory(recordPaths.historyPath);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const candidate = extractPrescriptionData(history[index]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function extractPrescriptionData(entry: ChatHistoryEntry): PrescriptionData | null {
  const meta = entry.meta as { type?: unknown; data?: unknown } | undefined;
  if (!meta || meta.type !== 'prescription' || typeof meta.data !== 'object' || meta.data === null) {
    return null;
  }

  const source = meta.data as Record<string, unknown>;
  const keys: Array<keyof PrescriptionData> = [
    'patientName',
    'patientAge',
    'diagnosis',
    'medications',
    'dosage',
    'frequency',
    'duration',
    'instructions',
    'nextAppointment',
  ];

  const data: PrescriptionData = {};

  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      data[key] = value.trim();
    }
  }

  return Object.keys(data).length > 0 ? data : null;
}

function formatPrescriptionResponse(data: PrescriptionData): string {
  const sentences: string[] = [];

  if (data.patientName || data.patientAge) {
    const namePart = data.patientName ? `This prescription is for ${data.patientName}` : 'This prescription is recorded for the patient';
    const agePart = data.patientAge ? `, age ${data.patientAge}` : '';
    sentences.push(`${namePart}${agePart}.`);
  }

  if (data.diagnosis) {
    sentences.push(`Primary diagnosis: ${data.diagnosis}.`);
  }

  if (data.medications) {
    const meds = data.medications
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (meds.length === 1) {
      sentences.push(`Medication prescribed: ${meds[0]}.`);
    } else if (meds.length > 1) {
      sentences.push(`Medications prescribed include: ${meds.join('; ')}.`);
    }
  }

  const dosageParts: string[] = [];
  if (data.dosage) {
    dosageParts.push(`dosage of ${data.dosage}`);
  }
  if (data.frequency) {
    dosageParts.push(`taken ${data.frequency}`);
  }
  if (data.duration) {
    dosageParts.push(`for ${data.duration}`);
  }
  if (dosageParts.length > 0) {
    sentences.push(`Dosage instructions: ${dosageParts.join(', ')}.`);
  }

  if (data.instructions) {
    sentences.push(`Additional notes: ${data.instructions}.`);
  }

  if (data.nextAppointment) {
    sentences.push(formatNextAppointmentResponse(data));
  }

  if (sentences.length === 0) {
    sentences.push('No structured prescription details are available.');
  }

  return sentences.join(' ');
}

function formatNextAppointmentResponse(data: PrescriptionData): string {
  const appointment = data.nextAppointment?.trim();
  if (!appointment) {
    return NO_APPOINTMENT_MESSAGE;
  }
  const nameSegment = data.patientName ? ` for ${data.patientName}` : '';
  const parsedDate = parseAppointmentDate(appointment);
  if (!parsedDate) {
    return `The next appointment${nameSegment} is recorded as "${appointment}".`;
  }

  const formatted = formatAppointmentDisplay(parsedDate, appointment);
  const relative = describeRelativeTiming(parsedDate);
  const relationText = relative ? `, which ${relative}.` : '.';
  return `The next appointment${nameSegment} is scheduled for ${formatted}${relationText}`;
}

function parseAppointmentDate(value: string): Date | null {
  const direct = Date.parse(value);
  if (!Number.isNaN(direct)) {
    return new Date(direct);
  }
  const cleaned = value.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
  const parsed = Date.parse(cleaned);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }
  return null;
}

function formatAppointmentDisplay(date: Date, original: string): string {
  if (Number.isNaN(date.getTime())) {
    return original;
  }

  const hasTimeComponent = /\d{1,2}:\d{2}/.test(original) || /\b(am|pm)\b/i.test(original);
  const options: Intl.DateTimeFormatOptions = hasTimeComponent
    ? { dateStyle: 'long', timeStyle: 'short' }
    : { dateStyle: 'long' };

  try {
    return date.toLocaleString('en-US', options);
  } catch (_error) {
    return date.toISOString();
  }
}

function describeRelativeTiming(target: Date): string {
  if (Number.isNaN(target.getTime())) {
    return '';
  }
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const diffMs = startOfTarget.getTime() - startOfToday.getTime();
  const diffDays = Math.round(diffMs / MS_PER_DAY);

  if (diffDays > 0) {
    const plural = diffDays === 1 ? 'day' : 'days';
    return `is ${diffDays} ${plural} from today`;
  }
  if (diffDays === 0) {
    return 'is today';
  }
  const abs = Math.abs(diffDays);
  const plural = abs === 1 ? 'day' : 'days';
  return `was ${abs} ${plural} ago`;
}
