// Type definitions
export interface ValidatedFiles {
  flair?: File;
  T1?: File;
  T2?: File;
  T1ce?: File;
}

export interface SingleFileUploadResult {
  recordId: string;
  flairUrl: string;
  metadataUrl: string;
}

export interface PatientMetadata {
  name: string;
  dateOfBirth: string;
  contact: string;
  contactType: 'phone' | 'email';
}

export interface ImageMetadata {
  spacing: [number, number, number];
  origin: [number, number, number];
  dimensions: [number, number, number];
  direction: number[] | null;
}

export interface TumorAnalysisResults {
  volume_cc: number;
  volume_mm3: number;
  voxel_count: number;
  hemisphere: string;
  midline_shift_mm: number;
  centroid_voxel_zyx: [number, number, number];
  centroid_physical_xyz: [number, number, number];
  image_metadata: ImageMetadata;
  mask_shape: [number, number, number];
  mask_dtype: string;
  radiomics?: Record<string, number>;
}

export interface DetectionResponse {
  detected: number;
  message: string;
  results?: TumorAnalysisResults;
  recordId?: string;
  storagePath?: string | null;
  flairUrl?: string | null;
  maskUrl?: string | null;
  metadataUrl?: string | null;
}

export interface DetectionProgress {
  progress: number;
  isComplete: boolean;
}

export type ProgressCallback = (progress: number) => void;
export type CompletionCallback = () => void;

// API Configuration
const DETECTION_API_BASE_URL = 'http://localhost:8000';
const BACKEND_API_BASE_URL = 'http://localhost:3001';

/**
 * Uploads files to the detection API and returns the detection results
 */
export async function uploadFilesToAPI(
  files: ValidatedFiles,
  patient: PatientMetadata
): Promise<DetectionResponse> {
  if (!files.flair || !files.T1 || !files.T2 || !files.T1ce) {
    throw new Error('Missing required files');
  }

  const formData = new FormData();
  formData.append('t1', files.T1);
  formData.append('t1ce', files.T1ce);
  formData.append('t2', files.T2);
  formData.append('flair', files.flair);

   // Patient metadata
  formData.append('patientName', patient.name);
  formData.append('patientMetadata', JSON.stringify(patient));

  const response = await fetch(`${DETECTION_API_BASE_URL}/detect`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      detail: 'Unknown error' 
    }));
    throw new Error(
      errorData.detail || `HTTP error! status: ${response.status}`
    );
  }

  return await response.json();
}

/**
 * Uploads a single NIfTI file directly to storage without detection
 * Creates a view-only record with no tumor data
 */
export async function uploadSingleFile(
  file: File,
  patient: PatientMetadata
): Promise<SingleFileUploadResult> {
  // Generate a unique record ID based on patient name and timestamp
  const sanitizedName = patient.name.toLowerCase().replace(/\s+/g, '_');
  const timestamp = Date.now().toString(36);
  const recordId = `${sanitizedName}_${timestamp}`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('recordId', recordId);
  formData.append('patientMetadata', JSON.stringify(patient));

  const response = await fetch(`${BACKEND_API_BASE_URL}/upload-single`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      detail: 'Unknown error' 
    }));
    throw new Error(
      errorData.detail || `HTTP error! status: ${response.status}`
    );
  }

  return await response.json();
}

/**
 * Simulates progress updates while API call is in progress
 * Returns a cleanup function to stop the simulation
 */
export function simulateProgress(
  onProgress: ProgressCallback,
  maxProgress: number = 90
): () => void {
  let currentProgress = 0;
  
  const intervalId = setInterval(() => {
    // Slow, controlled increment (1-3% per interval)
    const increment = Math.random() * 2 + 1;
    currentProgress = Math.min(currentProgress + increment, maxProgress);
    
    // Always update to ensure smooth progress
    onProgress(currentProgress);
    
    // Stop if we've reached max
    if (currentProgress >= maxProgress) {
      clearInterval(intervalId);
    }
  }, 800); // Slower interval for smoother progress

  // Return cleanup function
  return () => {
    clearInterval(intervalId);
  };
}

/**
 * Logs the detection response to the console in a formatted way
 */
export function logDetectionResponse(result: DetectionResponse): void {
  console.log('=== Tumor Detection API Response ===');
  console.log(
    'Detection Status:',
    result.detected === 1 ? 'Tumor Detected' : 'No Tumor Detected'
  );
  console.log('Message:', result.message);
  console.log('Full Response:', result);
  
  if (result.results) {
    console.log('Analysis Results:', result.results);
    
    if (result.results.volume_cc !== undefined) {
      console.log(`Tumor Volume: ${result.results.volume_cc.toFixed(3)} cc`);
    }
    
    if (result.results.hemisphere) {
      console.log(`Hemisphere: ${result.results.hemisphere}`);
    }
    
    if (result.results.centroid_physical_xyz) {
      console.log(
        'Centroid (physical):',
        result.results.centroid_physical_xyz
      );
    }
    
  }
}

/**
 * Main function to handle the complete detection flow
 * Handles progress simulation, API call, and response logging
 */
export async function detectTumor(
  files: ValidatedFiles,
  patient: PatientMetadata,
  onProgress: ProgressCallback,
  onComplete: (result: DetectionResponse) => void,
  onError: (error: Error) => void
): Promise<void> {
  // Start progress simulation (will slowly go to 90%)
  const stopProgress = simulateProgress(onProgress, 90);

  try {
    // Make API call
    const result = await uploadFilesToAPI(files, patient);
    
    // Stop progress simulation
    stopProgress();
    
    // Complete progress to 100%
    onProgress(100);
    
    // Log response
    logDetectionResponse(result);
    
    // Call completion callback
    onComplete(result);
  } catch (error) {
    // Stop progress simulation on error
    stopProgress();
    
    // Reset progress
    onProgress(0);
    
    // Call error callback
    const errorMessage = error instanceof Error 
      ? error 
      : new Error('Unknown error occurred');
    onError(errorMessage);
  }
}

/**
 * Handles single file upload flow (view-only mode, no detection)
 * Simpler flow that just uploads the file and creates metadata
 */
export async function uploadSingleFileFlow(
  file: File,
  patient: PatientMetadata,
  onProgress: ProgressCallback,
  onComplete: (result: SingleFileUploadResult) => void,
  onError: (error: Error) => void
): Promise<void> {
  // Start progress simulation (will slowly go to 90%)
  const stopProgress = simulateProgress(onProgress, 90);

  try {
    // Make API call
    const result = await uploadSingleFile(file, patient);
    
    // Stop progress simulation
    stopProgress();
    
    // Complete progress to 100%
    onProgress(100);
    
    console.log('=== Single File Upload Complete ===');
    console.log('Record ID:', result.recordId);
    console.log('View-only mode (no tumor detection)');
    
    // Call completion callback
    onComplete(result);
  } catch (error) {
    // Stop progress simulation on error
    stopProgress();
    
    // Reset progress
    onProgress(0);
    
    // Call error callback
    const errorMessage = error instanceof Error 
      ? error 
      : new Error('Unknown error occurred');
    onError(errorMessage);
  }
}

