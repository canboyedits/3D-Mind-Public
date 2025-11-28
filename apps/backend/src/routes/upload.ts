import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { uploadSingleFile } from '../controllers/uploadController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure multer for file uploads
// Store in a temporary directory first, then move to final location
const upload = multer({
  dest: path.join(__dirname, '../../../../storage/temp'),
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only accept .nii and .nii.gz files
    if (file.originalname.endsWith('.nii') || file.originalname.endsWith('.nii.gz')) {
      cb(null, true);
    } else {
      cb(new Error('Only .nii and .nii.gz files are allowed'));
    }
  },
});

const router = Router();

router.post('/', upload.single('file'), uploadSingleFile);

export default router;

