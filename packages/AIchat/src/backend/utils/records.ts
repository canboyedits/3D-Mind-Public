import { promises as fs } from 'fs';
import path from 'path';
import type { PatientMetadata, PatientRecordPaths } from '../types/index.js';

const RECORD_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function withStatus<T extends Error>(error: T, statusCode: number): T {
  (error as T & { statusCode: number }).statusCode = statusCode;
  return error;
}

export function validateRecordId(recordUid: string): string {
  if (typeof recordUid !== 'string' || !recordUid.trim()) {
    throw withStatus(new Error('recordUid is required.'), 400);
  }

  const trimmed = recordUid.trim();
  if (!RECORD_ID_PATTERN.test(trimmed)) {
    throw withStatus(new Error('Invalid record identifier.'), 400);
  }

  return trimmed;
}

export function resolveRecordPaths(recordsRoot: string, recordUid: string): PatientRecordPaths {
  const safeRecordId = validateRecordId(recordUid);
  const recordDir = path.join(recordsRoot, safeRecordId);
  return {
    safeRecordId,
    recordDir,
    metadataPath: path.join(recordDir, 'metadata.json'),
    historyPath: path.join(recordDir, 'history.json'),
  };
}

export async function ensureRecordDirectoryExists(recordDir: string): Promise<void> {
  const stat = await fs.stat(recordDir).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw withStatus(new Error('Record not found on disk.'), 404);
  }
}

async function findAlternateMetadataPath(recordDir: string): Promise<string | null> {
  const entries = (await fs.readdir(recordDir).catch(() => [])) as string[];
  const fallback = entries.find((name: string) => /^metadata.*\.json$/i.test(name));
  return fallback ? path.join(recordDir, fallback) : null;
}

export async function loadPatientMetadata(paths: PatientRecordPaths): Promise<PatientMetadata> {
  await ensureRecordDirectoryExists(paths.recordDir);

  const primary = await fs.readFile(paths.metadataPath, 'utf8').catch(async (error) => {
    const nodeError = error as unknown as { code?: string };
    if (nodeError.code !== 'ENOENT') {
      throw error;
    }
    const alternative = await findAlternateMetadataPath(paths.recordDir);
    if (!alternative) {
      throw withStatus(new Error('Patient metadata file not found.'), 404);
    }
    return fs.readFile(alternative, 'utf8');
  });

  try {
    return JSON.parse(primary) as PatientMetadata;
  } catch (error) {
    const err = withStatus(new Error('Malformed JSON in metadata file.'), 500);
    (err as { detail?: string }).detail = 'The metadata file could not be parsed.';
    throw err;
  }
}
