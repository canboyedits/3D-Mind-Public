import type { PatientMetadata } from '../types/index.js';

const RADIOMIC_KEYWORDS = [
  'radiomic',
  'texture',
  'gldm',
  'glcm',
  'glszm',
  'entropy',
  'kurtosis',
  'variance',
  'haralick',
  'heterogeneity',
];

const RADIOMIC_HIGHLIGHT_KEYS = [
  'original_firstorder_Entropy',
  'original_shape_Sphericity',
  'original_firstorder_Mean',
  'original_firstorder_Maximum',
  'original_firstorder_Minimum',
];

const COURTESY_KEYWORDS = ['thank', 'thanks', 'appreciate', 'grateful', 'thx'];

const MEDICAL_KEYWORDS = [
  'tumor',
  'tumour',
  'brain',
  'mri',
  'scan',
  'result',
  'analysis',
  'report',
  'lesion',
  'symptom',
  'treatment',
  'volume',
  'radiomic',
  'texture',
  'diagnosis',
  'condition',
  'medicine',
];

export function shouldIncludeFullRadiomics(question: string): boolean {
  if (!question) return false;
  const lower = question.toLowerCase();
  return RADIOMIC_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function containsKeyword(text: string | undefined, keywords: string[]): boolean {
  if (!text) return false;
  const normalised = text.toLowerCase();
  return keywords.some((keyword) => normalised.includes(keyword));
}

export function isCourtesyQuestion(question: string): boolean {
  return containsKeyword(question, COURTESY_KEYWORDS);
}

export function isMedicalQuestion(question: string): boolean {
  return containsKeyword(question, MEDICAL_KEYWORDS) || shouldIncludeFullRadiomics(question);
}

export function selectRadiomicHighlights(radiomics: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!radiomics) return {};
  const highlights: Record<string, unknown> = {};
  for (const key of RADIOMIC_HIGHLIGHT_KEYS) {
    if (radiomics[key] !== undefined) {
      highlights[key] = radiomics[key];
    }
  }
  return highlights;
}

export function buildPatientContext(
  metadata: PatientMetadata,
  includeFullRadiomics: boolean,
  contextHint?: string | null,
): Record<string, unknown> {
  const patient = metadata?.patient ?? {};
  const tumor = metadata?.tumor ?? {};
  const centroidValue = Array.isArray(tumor?.centroid_physical_xyz)
    ? tumor.centroid_physical_xyz.map((value) => Number.parseFloat(value?.toString() ?? '')).filter((value) => !Number.isNaN(value))
    : tumor?.centroid_physical_xyz;

  const contextPayload: Record<string, unknown> = {
    recordId: metadata?.recordId ?? null,
    analysisDate: metadata?.createdAt ?? null,
    patient: {
      name: patient?.name ?? 'Unknown',
      dateOfBirth: patient?.dateOfBirth ?? 'Unknown',
      contact: patient?.contact ?? null,
      contactType: patient?.contactType ?? null,
    },
    tumor: {
      volumeCc: tumor?.volume_cc ?? null,
      hemisphere: tumor?.hemisphere ?? null,
      centroidPhysicalXYZ: centroidValue ?? null,
      modality: tumor?.modality ?? null,
    },
  };

  const highlightMetrics = selectRadiomicHighlights(tumor?.radiomics as Record<string, unknown> | undefined);
  if (Object.keys(highlightMetrics).length > 0) {
    contextPayload.tumorRadiomicHighlights = highlightMetrics;
  }

  if (includeFullRadiomics && tumor?.radiomics) {
    contextPayload.fullRadiomics = tumor.radiomics;
  }

  if (contextHint) {
    contextPayload.additionalContext = contextHint;
  }

  return contextPayload;
}

export function buildPrompt(contextPayload: Record<string, unknown>, question: string): string {
  const serializedContext = JSON.stringify(contextPayload, null, 2);
  return `You are an empathetic neuro-radiology assistant supporting clinicians and patients.

Patient analysis data:
${serializedContext}

Guidelines:
1. Base every answer strictly on the patient data above. If something is missing, say so explicitly.
2. Report tumour metrics with appropriate units (e.g., cc for volume) and explain clinical relevance in plain language.
3. If radiomics metrics are present, clarify what they mean in terms a patient can understand.
4. Be factual, concise, and reassuring. Avoid speculation beyond the provided data.

Question: ${question}

Provide a compassionate, factual answer:`;
}

export function buildGeneralPrompt(question: string, contextHint?: string | null): string {
  return `You are an empathetic neuro-radiology assistant.

The patient is making a general inquiry that is not about specific scan metrics.
${contextHint ? `Additional context from the session: ${contextHint}\n` : ''}Respond in a brief, warm manner. Invite the patient to ask about their MRI or tumour results if appropriate.

Patient message: ${question}

Respond succinctly (2 sentences max).`;
}
