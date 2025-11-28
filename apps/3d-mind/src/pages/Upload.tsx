import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DropZone from '../components/Cards/DropZone';
import FillForm from '../components/Cards/FillForm';
import LoadingCard from '../components/Cards/LoadingCard';
import type { FillFormData } from '../components/Cards/FillForm';
import {
  detectTumor,
  uploadSingleFileFlow,
  type ValidatedFiles,
  type DetectionResponse,
  type SingleFileUploadResult,
} from '../utils/connectDetectionapi';

export default function Upload() {
  const navigate = useNavigate();
  const [filesValidated, setFilesValidated] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [validatedFiles, setValidatedFiles] = useState<ValidatedFiles | null>(null);
  const [isSingleFile, setIsSingleFile] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleValidationSuccess = (files: ValidatedFiles, singleFile?: boolean) => {
    setValidatedFiles(files);
    setIsSingleFile(singleFile || false);
    setFilesValidated(true);
  };

  const handleFormSubmit = (submittedFormData: FillFormData) => {
    console.log('Form submitted:', submittedFormData);
    console.log('Validated files:', validatedFiles);
    console.log('Is single file:', isSingleFile);

    if (!validatedFiles) {
      console.error('No files to upload');
      return;
    }

    setIsAnalyzing(true);
    setProgress(0);
    setIsComplete(false);

    const patientData = {
      name: submittedFormData.name,
      dateOfBirth: submittedFormData.dateOfBirth,
      contact: submittedFormData.contact,
      contactType: submittedFormData.contactType,
    };

    // Handle single file upload (view-only mode)
    if (isSingleFile && validatedFiles.flair) {
      uploadSingleFileFlow(
        validatedFiles.flair,
        patientData,
        setProgress,
        (result: SingleFileUploadResult) => {
          // Wait a bit to show 100% progress before showing completion
          setTimeout(() => {
            setIsComplete(true);
            
            // Redirect to link page with recordId
            if (result.recordId) {
              navigate(`/link?uid=${encodeURIComponent(result.recordId)}`);
            } else {
              console.warn('Could not extract recordId from response:', result);
              alert('Upload complete, but could not generate access link. Please check the console for details.');
            }
          }, 500);
        },
        (error: Error) => {
          console.error('Error during single file upload:', error);
          setIsAnalyzing(false);
          alert(`Error: ${error.message}`);
        }
      );
      return;
    }

    // Handle full detection flow (4 files)
    detectTumor(
      validatedFiles,
      patientData,
      setProgress,
      (result: DetectionResponse) => {
        // Wait a bit to show 100% progress before showing completion
        setTimeout(() => {
          setIsComplete(true);
          
          // Get recordId from response (should be included by detection API)
          let recordId = result.recordId;
          
          // Fallback: Extract recordId from storagePath if not directly provided
          if (!recordId && result.storagePath) {
            const match = result.storagePath.match(/records[/\\]([^/\\]+)/);
            recordId = match ? match[1] : result.storagePath.replace(/records[/\\]?/, '').replace(/[/\\].*$/, '');
          }
          
          // Fallback: Extract from metadataUrl or flairUrl
          if (!recordId && result.metadataUrl) {
            const urlMatch = result.metadataUrl.match(/records[/\\]([^/\\]+)/);
            recordId = urlMatch ? urlMatch[1] : '';
          }
          
          // Redirect to link page with only recordId (no dob)
          if (recordId) {
            navigate(`/link?uid=${encodeURIComponent(recordId)}`);
          } else {
            console.warn('Could not extract recordId from response:', result);
            alert('Analysis complete, but could not generate access link. Please check the console for details.');
          }
        }, 500);
      },
      (error: Error) => {
        console.error('Error during tumor detection:', error);
        setIsAnalyzing(false);
        alert(`Error: ${error.message}`);
      }
    );
  };

  const handleLoadingComplete = () => {
    // This is called when LoadingCard animation completes
    // Navigation is handled in the onComplete callback of detectTumor
  };

  if (isAnalyzing) {
    return (
      <LoadingCard
        title={isSingleFile ? "Uploading MRI Scan" : "Analyzing MRI Scans"}
        subtitle="Processing"
        description={isSingleFile 
          ? "Please wait while we upload your MRI scan"
          : "Please wait while we analyze your MRI scans for tumor detection"
        }
        progress={progress}
        isComplete={isComplete}
        onComplete={handleLoadingComplete}
      />
    );
  }

  if (filesValidated) {
    return <FillForm onSubmit={handleFormSubmit} />;
  }

  return (
    <DropZone
      title="Upload MRI Scans"
      subtitle="Folder or File Upload"
      description="Drop a folder that contains exactly one file per sequence: _flair, _T1, _T2, _T1ce, or drop a single .nii/.nii.gz file for view-only mode"
      onValidationSuccess={handleValidationSuccess}
    />
  );
}

