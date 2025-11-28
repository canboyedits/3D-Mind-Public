import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import recordRoutes from './routes/record.js';
import uploadRoutes from './routes/upload.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../../storage/temp');
await fs.mkdir(tempDir, { recursive: true });

// Enable CORS for all origins
app.use(cors());

// Parse JSON bodies
app.use(express.json());

// Serve static files from storage directory
// From apps/backend/src/ to root: ../../../storage
app.use('/static', express.static(path.join(__dirname, '../../../storage')));

// Register routes
app.use('/record', recordRoutes);
app.use('/upload-single', uploadRoutes);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

