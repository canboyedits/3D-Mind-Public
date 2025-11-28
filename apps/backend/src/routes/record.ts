import { Router } from 'express';
import { getRecord } from '../controllers/recordController.js';

const router = Router();

router.get('/', getRecord);

export default router;

