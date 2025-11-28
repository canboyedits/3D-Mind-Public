import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function uploadSingleFile(req: Request, res: Response): Promise<void> {
  try {
    // Get the uploaded file
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: 'No file uploaded' });
      return;
    }

    // Get patient metadata and recordId from form data
    const { recordId, patientMetadata } = req.body;
    
    if (!recordId || !patientMetadata) {
      res.status(400).json({ ok: false, error: 'Missing required fields' });
      return;
    }

    const patient = JSON.parse(patientMetadata);

    // Create record directory
    // From apps/backend/src/controllers/ to root: ../../../../storage/records
    const recordDir = path.join(__dirname, '../../../../storage/records', recordId);
    await fs.mkdir(recordDir, { recursive: true });

    // Move/rename the uploaded file to flair.nii.gz
    const targetFileName = file.originalname.endsWith('.nii.gz') ? 'flair.nii.gz' : 'flair.nii';
    const targetPath = path.join(recordDir, targetFileName);
    await fs.rename(file.path, targetPath);

    // Create metadata.json with patient info and no tumor data
    const metadata = {
      recordId,
      patient: {
        name: patient.name,
        dateOfBirth: patient.dateOfBirth,
        contact: patient.contact,
        contactType: patient.contactType,
      },
      tumor: null, // No tumor detection for single file uploads
      viewOnly: true, // Flag to indicate this is a view-only record
      createdAt: new Date().toISOString(),
    };

    const metadataPath = path.join(recordDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');

    // Return success response with URLs
    res.json({
      recordId,
      flairUrl: `/static/records/${recordId}/${targetFileName}`,
      metadataUrl: `/static/records/${recordId}/metadata.json`,
    });
  } catch (error) {
    console.error('Error in uploadSingleFile:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

