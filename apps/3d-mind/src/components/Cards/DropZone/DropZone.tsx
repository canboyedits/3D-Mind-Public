import { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
  CircularProgress,
  Button,
} from '@mui/material';
import { CloudUpload, Folder } from '@mui/icons-material';

// Type definitions for File System Access API
interface FileSystemEntry {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
  readonly filesystem: FileSystem;
}

interface FileSystemFileEntry extends FileSystemEntry {
  file(successCallback: (file: File) => void, errorCallback?: (error: Error) => void): void;
}

interface FileSystemDirectoryEntry extends FileSystemEntry {
  createReader(): FileSystemDirectoryReader;
}

interface FileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: FileSystemEntry[]) => void,
    errorCallback?: (error: Error) => void
  ): void;
}

interface FileSystem {
  readonly name: string;
  readonly root: FileSystemDirectoryEntry;
}


// File validation types and functions
type FileValidationResult = {
  isValid: boolean;
  error?: string;
  files: {
    flair?: File;
    T1?: File;
    T2?: File;
    T1ce?: File;
  };
};

/**
 * Validates that a folder contains exactly one file for each required pattern
 * @param files - Array of files from the dropped folder
 * @returns Validation result with separated files or error message
 */
function validateFolderFiles(files: File[]): FileValidationResult {
  const result: FileValidationResult = {
    isValid: false,
    files: {},
  };

  // Check if any files were provided
  if (!files || files.length === 0) {
    result.error = 'No files found in the folder';
    return result;
  }

  // Find files matching each pattern
  const foundFiles: Record<string, File[]> = {
    flair: [],
    T1: [],
    T2: [],
    T1ce: [],
  };

  files.forEach((file) => {
    const fileName = file.name.toLowerCase();
    
    if (fileName.includes('_flair')) {
      foundFiles.flair.push(file);
    } else if (fileName.includes('_t1ce')) {
      foundFiles.T1ce.push(file);
    } else if (fileName.includes('_t1') && !fileName.includes('_t1ce')) {
      foundFiles.T1.push(file);
    } else if (fileName.includes('_t2')) {
      foundFiles.T2.push(file);
    }
  });

  // Check for missing patterns
  const missingPatterns: string[] = [];
  const duplicatePatterns: string[] = [];

  if (foundFiles.flair.length === 0) missingPatterns.push('_flair');
  if (foundFiles.flair.length > 1) duplicatePatterns.push('_flair');

  if (foundFiles.T1.length === 0) missingPatterns.push('_T1');
  if (foundFiles.T1.length > 1) duplicatePatterns.push('_T1');

  if (foundFiles.T2.length === 0) missingPatterns.push('_T2');
  if (foundFiles.T2.length > 1) duplicatePatterns.push('_T2');

  if (foundFiles.T1ce.length === 0) missingPatterns.push('_T1ce');
  if (foundFiles.T1ce.length > 1) duplicatePatterns.push('_T1ce');

  // Return error if patterns are missing
  if (missingPatterns.length > 0) {
    result.error = `Missing required files with patterns: ${missingPatterns.join(', ')}`;
    return result;
  }

  // Return error if duplicate patterns found
  if (duplicatePatterns.length > 0) {
    result.error = `Multiple files found for patterns: ${duplicatePatterns.join(', ')}. Expected exactly one file per pattern.`;
    return result;
  }

  // All validations passed
  result.isValid = true;
  result.files = {
    flair: foundFiles.flair[0],
    T1: foundFiles.T1[0],
    T2: foundFiles.T2[0],
    T1ce: foundFiles.T1ce[0],
  };

  return result;
}

interface DropZoneProps {
  title?: string;
  subtitle?: string;
  description?: string;
  onValidationSuccess?: (files: FileValidationResult['files']) => void;
}

export default function DropZone({
  title = 'Upload MRI Scans',
  subtitle = 'Folder Upload',
  description = 'Drop a folder that contains exactly one file per sequence: _flair, _T1, _T2, _T1ce',
  onValidationSuccess,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [folderName, setFolderName] = useState<string | null>(null);

  const handleFiles = useCallback(async (fileList: FileList | null, folderName?: string) => {
    if (!fileList || fileList.length === 0) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFolderName(folderName || null);

    try {
      // Convert FileList to Array
      const files = Array.from(fileList);
      
      // Extract folder name from file path if not provided
      if (!folderName && files.length > 0) {
        const firstFile = files[0];
        const webkitRelativePath = 'webkitRelativePath' in firstFile 
          ? (firstFile as File & { webkitRelativePath?: string }).webkitRelativePath 
          : undefined;
        if (webkitRelativePath) {
          const pathParts = webkitRelativePath.split('/');
          if (pathParts.length > 0) {
            setFolderName(pathParts[0]);
          }
        }
      }
      
      // Validate files
      const result = validateFolderFiles(files);

      if (!result.isValid) {
        setErrorMessage(result.error ?? 'Invalid folder contents');
        setSuccessMessage(null);
        return;
      }

      // Show success message when validation succeeds
      setSuccessMessage('All required files found and validated successfully!');
      setErrorMessage(null);
      
      // Call the callback if provided
      if (onValidationSuccess) {
        onValidationSuccess(result.files);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred');
      setSuccessMessage(null);
    } finally {
      setIsProcessing(false);
    }
  }, [onValidationSuccess]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent browser default drag behavior
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Prevent flicker when dragging over child elements
    const nextTarget = e.relatedTarget as Node | null;
    if (nextTarget && e.currentTarget.contains(nextTarget)) {
      return;
    }

    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Prevent browser default drag behavior
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Prevent browser from opening files
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
      setIsDragging(false);

      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        // Check if it's a folder (directory)
        const item = items[0];
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            // Handle folder drop
            const files: File[] = [];
            let pendingReads = 0;
            let hasError = false;

            const folderName = entry.name;
            const processFiles = () => {
              if (hasError) return;
              const fileList = {
                length: files.length,
                item: (index: number) => files[index] || null,
                [Symbol.iterator]: function* () {
                  for (let i = 0; i < files.length; i++) {
                    yield files[i];
                  }
                },
              } as FileList;
              handleFiles(fileList, folderName);
            };

            const readDirectory = (entry: FileSystemDirectoryEntry | FileSystemFileEntry) => {
              if (hasError) return;

              if (entry.isFile) {
                pendingReads++;
                (entry as FileSystemFileEntry).file(
                  (file) => {
                    files.push(file);
                    pendingReads--;
                    if (pendingReads === 0) {
                      processFiles();
                    }
                  },
                  () => {
                    hasError = true;
                    setErrorMessage('Error reading files from folder');
                  }
                );
              } else if (entry.isDirectory) {
                const dirReader = (entry as FileSystemDirectoryEntry).createReader();
                const readEntries = () => {
                  dirReader.readEntries(
                    (entries) => {
                      if (hasError) return;
                      if (entries.length === 0) {
                        if (pendingReads === 0) {
                          processFiles();
                        }
                      } else {
                        entries.forEach((entry) => {
                          readDirectory(entry as FileSystemDirectoryEntry | FileSystemFileEntry);
                        });
                        readEntries(); // Continue reading
                      }
                    },
                    () => {
                      hasError = true;
                      setErrorMessage('Error reading directory');
                    }
                  );
                };
                readEntries();
              }
            };
            readDirectory(entry as unknown as FileSystemDirectoryEntry);
            return;
          }
        }
      }

      // Fallback to regular file drop
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
    },
    [handleFiles]
  );

  // Prevent browser default drag and drop behavior globally
  useEffect(() => {
    const handleDragOverGlobal = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDropGlobal = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('dragover', handleDragOverGlobal);
    window.addEventListener('drop', handleDropGlobal);

    return () => {
      window.removeEventListener('dragover', handleDragOverGlobal);
      window.removeEventListener('drop', handleDropGlobal);
    };
  }, []);

  return (
    <Box
      component="main"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        minHeight: '100vh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        px: 3,
        py: { xs: 4, md: 6 },
        backgroundImage: `linear-gradient(135deg, rgba(59,130,246,0.12), rgba(56,189,248,0.12))`,
      }}
    >
      <Paper
        elevation={6}
        sx={{
          p: { xs: 4, md: 6 },
          width: 'min(900px, 90vw)',
          minHeight: { xs: '60vh', md: '70vh' },
          textAlign: 'center',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 2 }}>
            {subtitle}
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mt: 1, mb: 1 }}>
            {title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {description.split(/(_flair|_T1|_T2|_T1ce)/).map((part, index) => {
              if (['_flair', '_T1', '_T2', '_T1ce'].includes(part)) {
                return <strong key={index}>{part}</strong>;
              }
              return <span key={index}>{part}</span>;
            })}
          </Typography>
        </Box>

        <Box
          sx={{
            border: '2px dashed',
            borderColor: isDragging ? 'primary.main' : 'grey.300',
            borderRadius: 3,
            p: { xs: 4, md: 6 },
            bgcolor: isDragging ? 'action.hover' : 'background.paper',
            transition: 'all 0.3s ease',
            cursor: 'pointer',
            minHeight: 260,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {isProcessing ? (
            <CircularProgress />
          ) : (
            <>
              <CloudUpload sx={{ fontSize: 88, color: 'primary.main', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                Drag & Drop anywhere on the screen
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                or choose a folder manually
              </Typography>
              <Button
                size="large"
                variant="contained"
                component="label"
                startIcon={<Folder />}
              >
                Select Folder
                <input
                  type="file"
                  hidden
                  // @ts-expect-error - webkitdirectory is a valid HTML attribute but not in TypeScript types
                  webkitdirectory=""
                  multiple
                  onChange={handleFileInput}
                />
              </Button>
            </>
          )}
        </Box>

        {successMessage && (
          <Box sx={{ mt: 2 }}>
            {folderName && (
              <Typography
                variant="body2"
                sx={{
                  mb: 1.5,
                  px: 2,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: 'rgba(46, 125, 50, 0.2)',
                  color: 'success.dark',
                  fontWeight: 500,
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                Folder: {folderName}
              </Typography>
            )}
            <Alert 
              severity="success" 
              onClose={() => {
                setSuccessMessage(null);
                setFolderName(null);
              }}
            >
              {successMessage}
            </Alert>
          </Box>
        )}

        {errorMessage && (
          <Box sx={{ mt: 2 }}>
            {folderName && (
              <Typography
                variant="body2"
                sx={{
                  mb: 1.5,
                  px: 2,
                  py: 1,
                  borderRadius: 1,
                  bgcolor: 'rgba(211, 47, 47, 0.2)',
                  color: 'error.dark',
                  fontWeight: 500,
                  display: 'inline-block',
                  width: 'fit-content',
                }}
              >
                Folder: {folderName}
              </Typography>
            )}
            <Alert 
              severity="error" 
              onClose={() => {
                setErrorMessage(null);
                setFolderName(null);
              }}
            >
              {errorMessage}
            </Alert>
          </Box>
        )}
      </Paper>
    </Box>
  );
}

