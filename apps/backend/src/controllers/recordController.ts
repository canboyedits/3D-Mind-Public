import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Metadata {
  recordId: string;
  patient: {
    name: string;
    dateOfBirth: string;
    contact: string;
    contactType: string;
  };
  tumor: any;
  createdAt: string;
}

export async function getRecord(req: Request, res: Response): Promise<void> {
  try {
    const { uid, dob } = req.query;

    // Validate query parameters
    if (!uid || typeof uid !== 'string') {
      res.status(400).json({ ok: false, error: 'uid query parameter is required' });
      return;
    }

    if (!dob || typeof dob !== 'string') {
      res.status(400).json({ ok: false, error: 'dob query parameter is required' });
      return;
    }

    // Construct path to record directory
    // From apps/backend/src/controllers/ to root: ../../../../storage/records
    const recordDir = path.join(__dirname, '../../../../storage/records', uid);
    const metadataPath = path.join(recordDir, 'metadata.json');

    // Check if directory exists
    try {
      await fs.access(recordDir);
    } catch {
      res.status(404).json({ ok: false, error: 'Record not found' });
      return;
    }

    // Check if metadata.json exists and read it
    let metadata: Metadata;
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf-8');
      metadata = JSON.parse(metadataContent);
    } catch {
      res.status(404).json({ ok: false, error: 'Metadata not found' });
      return;
    }

    // Validate date of birth
    if (metadata.patient.dateOfBirth !== dob) {
      res.status(401).json({ ok: false, error: 'Unauthorized: Date of birth mismatch' });
      return;
    }

    // Build response with URLs
    const response = {
      ok: true,
      recordId: metadata.recordId,
      patient: metadata.patient,
      tumor: metadata.tumor,
      flairUrl: `/static/records/${uid}/flair.nii.gz`,
      maskUrl: `/static/records/${uid}/mask.nii.gz`,
      metadataUrl: `/static/records/${uid}/metadata.json`
    };

    res.json(response);
  } catch (error) {
    console.error('Error in getRecord:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

