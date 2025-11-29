import express, { Router, type RequestHandler } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import recordRoutes from './routes/record.js';
import uploadRoutes from './routes/upload.js';
import { createChatbotRouter } from '@AIchat/aichatbot/backend';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Ensure temp directory exists
const tempDir = path.join(__dirname, '../../../storage/temp');
await fs.mkdir(tempDir, { recursive: true });
const recordsRoot = path.join(__dirname, '../../../storage/records');
await fs.mkdir(recordsRoot, { recursive: true });

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

let chatbotRouter: Router;
try {
  chatbotRouter = createChatbotRouter({ recordsRoot });
  console.log('AI assistant routes ready');
} catch (error) {
  const detail = error instanceof Error ? error.message : 'Chatbot initialization failed';
  console.warn(`AI assistant disabled: ${detail}`);
  const disabledHandler: RequestHandler = (_req, res) => {
    res.status(503).json({ error: 'AI assistant unavailable', detail });
  };
  const fallback = Router();
  fallback.post('/chat', disabledHandler);
  fallback.get('/chat/history', disabledHandler);
  chatbotRouter = fallback;
}

app.use('/api', chatbotRouter);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
});

