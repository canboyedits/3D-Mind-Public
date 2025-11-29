import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Snackbar,
  Alert,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  Person as PersonIcon,
  LightMode as LightModeIcon,
  DarkMode as DarkModeIcon,
  Tune as TuneIcon,
} from '@mui/icons-material';
import EnterDOB from '../components/Cards/EnterDOB';
import ControlPanel from '../components/ControlPanel';
import { fetchRecord, type RecordResponse, API_BASE_URL } from '../utils/api';
import { drawScan, type ScanViewer, type BrainPreset, type RenderMode } from '@3dmind/core';

export default function ViewScan() {
  const [searchParams, setSearchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const dob = searchParams.get('dob');

  const [recordData, setRecordData] = useState<RecordResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDOBEntry, setShowDOBEntry] = useState(false);
  const [showIncorrectDOBAlert, setShowIncorrectDOBAlert] = useState(false);

  // VTK viewer state
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ScanViewer | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

  // UI controls state
  const [maskVisible, setMaskVisible] = useState(true);
  const [brainOpacity, setBrainOpacity] = useState(100);
  const [maskOpacity, setMaskOpacity] = useState(10); // Default to 10% for tumor visibility
  const [brainPreset, setBrainPreset] = useState<BrainPreset>('skin');  // Default to skin for solid look
  const [theme, setTheme] = useState<'dark' | 'light'>('light'); // Default to light theme
  const [showControls, setShowControls] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>('accuracy');
  const [autoRotate, setAutoRotate] = useState(false);

  // Clipping planes
  const [clipX, setClipX] = useState<[number, number]>([0, 100]);
  const [clipY, setClipY] = useState<[number, number]>([0, 100]);
  const [clipZ, setClipZ] = useState<[number, number]>([0, 100]);

  useEffect(() => {
    if (uid && !dob) {
      setShowDOBEntry(true);
      setLoading(false);
    } else if (uid && dob) {
      loadRecord(uid, dob);
    }
  }, [uid, dob]);

  // Initialize VTK viewer
  useEffect(() => {
    if (
      recordData?.ok &&
      recordData.flairUrl &&
      containerRef.current
    ) {
      // Initialize viewer even if maskUrl is missing (view-only mode)
      initializeViewer();
    }

    return () => {
      if (viewerRef.current) {
        viewerRef.current.destroy();
        viewerRef.current = null;
        setViewerReady(false);
      }
    };
  }, [recordData]);

  const initializeViewer = useCallback(async () => {
    if (!containerRef.current || !recordData?.flairUrl) {
      return;
    }

    if (viewerRef.current) {
      viewerRef.current.destroy();
      viewerRef.current = null;
      setViewerReady(false);
    }

    setViewerLoading(true);
    setViewerError(null);

    try {
      const flairUrl = recordData.flairUrl.startsWith('http')
        ? recordData.flairUrl
        : `${API_BASE_URL}${recordData.flairUrl}`;
      
      // maskUrl is optional for view-only mode
      const maskUrl = recordData.maskUrl
        ? recordData.maskUrl.startsWith('http')
          ? recordData.maskUrl
          : `${API_BASE_URL}${recordData.maskUrl}`
        : undefined;
      
      const metadataUrl = recordData.metadataUrl
        ? recordData.metadataUrl.startsWith('http')
          ? recordData.metadataUrl
          : `${API_BASE_URL}${recordData.metadataUrl}`
        : undefined;

      console.log('Loading files from:', { flairUrl, maskUrl, metadataUrl });

      const viewer = await drawScan(
        {
          container: containerRef.current,
          backgroundColor: [0.02, 0.02, 0.06],
          theme: theme,
        },
        {
          flairUrl,
          maskUrl,
          metadataUrl,
        }
      );

      viewerRef.current = viewer;
      setMaskVisible(viewer.getMaskVisible());
      setBrainOpacity(viewer.getBrainOpacity() * 100);
      
      // Set initial mask opacity to 10% (our UI default)
      viewer.setMaskOpacity(0.1);
      setMaskOpacity(10);
      
      setViewerReady(true);
    } catch (err) {
      console.error('Error initializing VTK viewer:', err);
      setViewerError(
        err instanceof Error ? err.message : 'Failed to initialize scan viewer'
      );
      setViewerReady(false);
    } finally {
      setViewerLoading(false);
    }
  }, [recordData, theme]);

  const loadRecord = async (recordUid: string, recordDob: string) => {
    setLoading(true);
    setShowDOBEntry(false);

    try {
      const data = await fetchRecord(recordUid, recordDob);

      if (data.ok) {
        console.log('SCAN DATA:', data);
        setRecordData(data);
      } else if (
        data.error?.includes('Unauthorized') ||
        data.error?.includes('mismatch')
      ) {
        setShowDOBEntry(true);
        setShowIncorrectDOBAlert(true);
      }
    } catch (err) {
      console.error('Error fetching record:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDOBSubmit = (newDob: string) => {
    if (uid) {
      setShowIncorrectDOBAlert(false);
      setSearchParams({ uid, dob: newDob });
    }
  };

  // Control handlers
  const handleMaskVisibleChange = async (visible: boolean) => {
    setMaskVisible(visible);
    if (viewerRef.current) {
      await viewerRef.current.setMaskVisible(visible);
    }
  };

  const handleBrainOpacityChange = (opacity: number) => {
    setBrainOpacity(opacity);
    if (viewerRef.current) {
      viewerRef.current.setBrainOpacity(opacity / 100);
    }
  };

  const handleMaskOpacityChange = (opacity: number) => {
    setMaskOpacity(opacity);
    if (viewerRef.current) {
      viewerRef.current.setMaskOpacity(opacity / 100);
    }
  };

  const handleBrainPresetChange = (preset: BrainPreset) => {
    setBrainPreset(preset);
    if (viewerRef.current) {
      viewerRef.current.setBrainPreset(preset);
    }
  };

  const handleThemeToggle = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    if (viewerRef.current) {
      viewerRef.current.setTheme(newTheme);
    }
  };

  const handleRenderModeChange = (mode: RenderMode) => {
    setRenderMode(mode);
    if (viewerRef.current) {
      viewerRef.current.setRenderMode(mode);
    }
  };

  const handleClipXChange = (clip: [number, number]) => {
    setClipX(clip);
    if (viewerRef.current) {
      viewerRef.current.setClipPlanes({ x: clip });
    }
  };

  const handleClipYChange = (clip: [number, number]) => {
    setClipY(clip);
    if (viewerRef.current) {
      viewerRef.current.setClipPlanes({ y: clip });
    }
  };

  const handleClipZChange = (clip: [number, number]) => {
    setClipZ(clip);
    if (viewerRef.current) {
      viewerRef.current.setClipPlanes({ z: clip });
    }
  };

  const handleResetClipping = () => {
    setClipX([0, 100]);
    setClipY([0, 100]);
    setClipZ([0, 100]);
    if (viewerRef.current) {
      viewerRef.current.setClipPlanes({ x: [0, 100], y: [0, 100], z: [0, 100] });
    }
  };

  const handleAutoRotateChange = (enabled: boolean) => {
    setAutoRotate(enabled);
    if (viewerRef.current) {
      viewerRef.current.setAutoRotate(enabled);
    }
  };

  // Theme-based colors
  const isDark = theme === 'dark';
  const bgPrimary = isDark ? '#0a0a1a' : '#f8fafc';
  const bgSecondary = isDark ? 'rgba(20, 20, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const accent = '#6366f1';
  const borderColor = isDark ? 'rgba(100, 100, 200, 0.2)' : 'rgba(100, 100, 200, 0.3)';

  if (showDOBEntry || (!dob && uid)) {
    return (
      <>
        <EnterDOB
          title="Date of Birth Verification"
          subtitle="Access Required"
          description="Please enter your date of birth to access your scan"
          onSubmit={handleDOBSubmit}
        />
        <Snackbar
          open={showIncorrectDOBAlert}
          autoHideDuration={6000}
          onClose={() => setShowIncorrectDOBAlert(false)}
          anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setShowIncorrectDOBAlert(false)}
            severity="error"
            sx={{ width: '100%' }}
          >
            Incorrect Date of Birth. Please try again.
          </Alert>
        </Snackbar>
      </>
    );
  }

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `linear-gradient(135deg, ${bgPrimary} 0%, ${isDark ? '#1a1a3a' : '#e2e8f0'} 100%)`,
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 4,
            background: bgSecondary,
            backdropFilter: 'blur(10px)',
            border: `1px solid ${borderColor}`,
          }}
        >
          <CircularProgress sx={{ mb: 2, color: accent }} />
          <Typography variant="h5" sx={{ color: textPrimary }}>
            Loading scan data...
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        background: `linear-gradient(135deg, ${bgPrimary} 0%, ${isDark ? '#1a1a3a' : '#e2e8f0'} 100%)`,
      }}
    >
      {/* Main 3D Viewer Area */}
      <Box
        sx={{
          flex: 1,
          position: 'relative',
          minHeight: '100vh',
        }}
      >
        {/* Header */}
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 3,
            py: 2,
            background: `linear-gradient(180deg, ${bgSecondary} 0%, transparent 100%)`,
          }}
        >
          {/* Patient info */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <PersonIcon sx={{ color: accent, fontSize: 32 }} />
            {recordData?.patient && (
              <Box>
                <Typography variant="h6" sx={{ color: textPrimary, fontWeight: 600 }}>
                  {recordData.patient.name}
                </Typography>
                <Typography variant="body2" sx={{ color: textSecondary }}>
                  DOB: {recordData.patient.dateOfBirth}
                </Typography>
              </Box>
            )}
          </Box>

          {/* Quick actions */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tooltip title={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
              <IconButton onClick={handleThemeToggle} sx={{ color: accent }}>
                {theme === 'dark' ? <LightModeIcon /> : <DarkModeIcon />}
              </IconButton>
            </Tooltip>

            <Tooltip title="Toggle Controls">
              <IconButton onClick={() => setShowControls(!showControls)} sx={{ color: accent }}>
                <TuneIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* VTK Container - Full viewport */}
        <Box
          ref={containerRef}
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        />

        {/* Loading overlay */}
        {viewerLoading && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: isDark ? 'rgba(10, 10, 26, 0.9)' : 'rgba(248, 250, 252, 0.9)',
              zIndex: 10,
            }}
          >
            <CircularProgress sx={{ mb: 2, color: accent }} size={60} />
            <Typography variant="h6" sx={{ color: textPrimary }}>
              Loading brain scan...
            </Typography>
            <Typography variant="body2" sx={{ color: textSecondary, mt: 1 }}>
              This may take a moment for large files
            </Typography>
          </Box>
        )}

        {/* Error message */}
        {viewerError && (
          <Box
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              p: 4,
              bgcolor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: 2,
              border: '1px solid rgba(239, 68, 68, 0.3)',
              zIndex: 10,
            }}
          >
            <Typography variant="h6" sx={{ color: '#ef4444', mb: 1 }}>
              Error Loading Scan
            </Typography>
            <Typography variant="body2" sx={{ color: '#f87171' }}>
              {viewerError}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Controls Panel */}
      <ControlPanel
        viewerRef={viewerRef}
        viewerReady={viewerReady}
        maskVisible={maskVisible}
        onMaskVisibleChange={handleMaskVisibleChange}
        brainOpacity={brainOpacity}
        onBrainOpacityChange={handleBrainOpacityChange}
        maskOpacity={maskOpacity}
        onMaskOpacityChange={handleMaskOpacityChange}
        brainPreset={brainPreset}
        onBrainPresetChange={handleBrainPresetChange}
        renderMode={renderMode}
        onRenderModeChange={handleRenderModeChange}
        clipX={clipX}
        onClipXChange={handleClipXChange}
        clipY={clipY}
        onClipYChange={handleClipYChange}
        clipZ={clipZ}
        onClipZChange={handleClipZChange}
        onResetClipping={handleResetClipping}
        theme={theme}
        showControls={showControls}
        autoRotate={autoRotate}
        onAutoRotateChange={handleAutoRotateChange}
        tumorData={recordData?.tumor as { volume_cc?: number; hemisphere?: string; midline_shift_mm?: number } | undefined}
        hasMask={!!recordData?.maskUrl}
      />
    </Box>
  );
}
  