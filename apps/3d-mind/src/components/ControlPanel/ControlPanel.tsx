import {
  Box,
  Paper,
  Typography,
  Switch,
  FormControlLabel,
  Slider,
  Divider,
  Collapse,
  Select,
  MenuItem,
  FormControl,
  Chip,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Speed as PerformanceIcon,
  HighQuality as AccuracyIcon,
} from '@mui/icons-material';
import type { BrainPreset, RenderMode, ScanViewer } from '@3dmind/core';

export interface ControlPanelProps {
  // Viewer reference
  viewerRef: React.MutableRefObject<ScanViewer | null>;
  viewerReady: boolean;
  
  // Visibility controls
  maskVisible: boolean;
  onMaskVisibleChange: (visible: boolean) => void;
  
  // Opacity controls
  brainOpacity: number;
  onBrainOpacityChange: (opacity: number) => void;
  maskOpacity: number;
  onMaskOpacityChange: (opacity: number) => void;
  
  // Preset controls
  brainPreset: BrainPreset;
  onBrainPresetChange: (preset: BrainPreset) => void;
  
  // Render mode
  renderMode: RenderMode;
  onRenderModeChange: (mode: RenderMode) => void;
  
  // Clipping planes
  clipX: [number, number];
  onClipXChange: (clip: [number, number]) => void;
  clipY: [number, number];
  onClipYChange: (clip: [number, number]) => void;
  clipZ: [number, number];
  onClipZChange: (clip: [number, number]) => void;
  onResetClipping: () => void;
  
  // Theme
  theme: 'dark' | 'light';
  
  // Panel visibility
  showControls: boolean;
  
  // Tumor data (optional)
  tumorData?: {
    volume_cc?: number;
    hemisphere?: string;
    midline_shift_mm?: number;
  };
  
  // View-only mode (no mask available)
  hasMask?: boolean;
}

export default function ControlPanel({
  viewerReady,
  maskVisible,
  onMaskVisibleChange,
  brainOpacity,
  onBrainOpacityChange,
  maskOpacity,
  onMaskOpacityChange,
  brainPreset,
  onBrainPresetChange,
  renderMode,
  onRenderModeChange,
  clipX,
  onClipXChange,
  clipY,
  onClipYChange,
  clipZ,
  onClipZChange,
  onResetClipping,
  theme,
  showControls,
  tumorData,
  hasMask = true, // Default to true for backward compatibility
}: ControlPanelProps) {
  // Theme-based colors
  const isDark = theme === 'dark';
  const bgSecondary = isDark ? 'rgba(20, 20, 40, 0.95)' : 'rgba(255, 255, 255, 0.95)';
  const textPrimary = isDark ? '#e2e8f0' : '#1e293b';
  const textSecondary = isDark ? '#94a3b8' : '#64748b';
  const accent = '#6366f1';
  const borderColor = isDark ? 'rgba(100, 100, 200, 0.2)' : 'rgba(100, 100, 200, 0.3)';

  const handleToggleMask = () => {
    onMaskVisibleChange(!maskVisible);
  };

  const handleBrainOpacityChange = (_: Event, value: number | number[]) => {
    onBrainOpacityChange(value as number);
  };

  const handleMaskOpacityChange = (_: Event, value: number | number[]) => {
    onMaskOpacityChange(value as number);
  };

  const handlePresetChange = (event: SelectChangeEvent) => {
    onBrainPresetChange(event.target.value as BrainPreset);
  };

  const handleRenderModeToggle = () => {
    const newMode: RenderMode = renderMode === 'accuracy' ? 'performance' : 'accuracy';
    onRenderModeChange(newMode);
  };

  const handleClipXChange = (_: Event, value: number | number[]) => {
    onClipXChange(value as [number, number]);
  };

  const handleClipYChange = (_: Event, value: number | number[]) => {
    onClipYChange(value as [number, number]);
  };

  const handleClipZChange = (_: Event, value: number | number[]) => {
    onClipZChange(value as [number, number]);
  };

  return (
    <Collapse in={showControls} orientation="horizontal">
      <Paper
        elevation={8}
        sx={{
          width: 320,
          height: '100vh',
          overflow: 'auto',
          background: bgSecondary,
          backdropFilter: 'blur(20px)',
          borderLeft: `1px solid ${borderColor}`,
          p: 3,
        }}
      >
        <Typography variant="h6" sx={{ color: textPrimary, mb: 3, fontWeight: 600 }}>
          Viewer Controls
        </Typography>

        {/* Render Mode Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ color: textSecondary, mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Render Mode
          </Typography>

          <Box
            onClick={handleRenderModeToggle}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              p: 1.5,
              borderRadius: 2,
              cursor: viewerReady ? 'pointer' : 'not-allowed',
              opacity: viewerReady ? 1 : 0.5,
              bgcolor: renderMode === 'performance' 
                ? 'rgba(34, 197, 94, 0.15)' 
                : 'rgba(99, 102, 241, 0.15)',
              border: `1px solid ${renderMode === 'performance' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(99, 102, 241, 0.4)'}`,
              transition: 'all 0.2s ease',
              '&:hover': viewerReady ? {
                bgcolor: renderMode === 'performance' 
                  ? 'rgba(34, 197, 94, 0.25)' 
                  : 'rgba(99, 102, 241, 0.25)',
              } : {},
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {renderMode === 'performance' ? (
                <PerformanceIcon sx={{ color: '#22c55e', fontSize: 22 }} />
              ) : (
                <AccuracyIcon sx={{ color: accent, fontSize: 22 }} />
              )}
              <Box>
                <Typography variant="body2" sx={{ color: textPrimary, fontWeight: 600 }}>
                  {renderMode === 'performance' ? 'Performance' : 'Accuracy'}
                </Typography>
                <Typography variant="caption" sx={{ color: textSecondary, fontSize: '0.65rem' }}>
                  {renderMode === 'performance' 
                    ? 'Smooth interaction, lower quality' 
                    : 'High quality when still'}
                </Typography>
              </Box>
            </Box>
            <Chip 
              size="small" 
              label={renderMode === 'performance' ? 'FAST' : 'HD'}
              sx={{ 
                bgcolor: renderMode === 'performance' ? '#22c55e' : accent,
                color: 'white',
                fontWeight: 600,
                fontSize: '0.65rem',
              }}
            />
          </Box>
        </Box>

        {/* Visibility Section - Only show if mask is available */}
        {hasMask && (
          <>
            <Divider sx={{ borderColor: borderColor, my: 2 }} />

            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" sx={{ color: textSecondary, mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                Visibility
              </Typography>

              <FormControlLabel
                control={
                  <Switch
                    checked={maskVisible}
                    onChange={handleToggleMask}
                    disabled={!viewerReady}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: accent },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: accent },
                    }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {maskVisible ? <VisibilityIcon sx={{ fontSize: 18 }} /> : <VisibilityOffIcon sx={{ fontSize: 18 }} />}
                    <Typography variant="body2">Tumor Mask</Typography>
                  </Box>
                }
                sx={{ color: textPrimary }}
              />
            </Box>

            <Divider sx={{ borderColor: borderColor, my: 2 }} />
          </>
        )}

        {/* Opacity Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ color: textSecondary, mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Opacity
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: textPrimary, mb: 1 }}>
              Brain: {brainOpacity}%
            </Typography>
            <Slider
              value={brainOpacity}
              onChange={handleBrainOpacityChange}
              disabled={!viewerReady}
              min={0}
              max={100}
              sx={{ color: accent }}
            />
          </Box>

          {hasMask && (
            <Box>
              <Typography variant="body2" sx={{ color: textPrimary, mb: 1 }}>
                Tumor Mask: {maskOpacity}%
              </Typography>
              <Slider
                value={maskOpacity}
                onChange={handleMaskOpacityChange}
                disabled={!viewerReady || !maskVisible}
                min={0}
                max={100}
                sx={{ color: '#ef4444' }}
              />
            </Box>
          )}
        </Box>

        <Divider sx={{ borderColor: borderColor, my: 2 }} />

        {/* Preset Section */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ color: textSecondary, mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
            Brain Preset
          </Typography>

          <FormControl fullWidth size="small" disabled={!viewerReady}>
            <Select
              value={brainPreset}
              onChange={handlePresetChange}
              sx={{
                color: textPrimary,
                '& .MuiOutlinedInput-notchedOutline': { borderColor: borderColor },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: accent },
                '& .MuiSvgIcon-root': { color: textSecondary },
              }}
            >
              <MenuItem value="grayscale">Grayscale (Classic)</MenuItem>
              <MenuItem value="skin">Skin / Flesh Tone</MenuItem>
              <MenuItem value="bone">Bone</MenuItem>
              <MenuItem value="mri">MRI Blue</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Divider sx={{ borderColor: borderColor, my: 2 }} />

        {/* Clipping Planes Section */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ color: textSecondary, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
              Clipping Planes
            </Typography>
            <Typography
              variant="caption"
              onClick={onResetClipping}
              sx={{ color: accent, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
            >
              Reset
            </Typography>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: textPrimary, mb: 1 }}>
              X (Left-Right): {clipX[0]}% - {clipX[1]}%
            </Typography>
            <Slider
              value={clipX}
              onChange={handleClipXChange}
              disabled={!viewerReady}
              min={0}
              max={100}
              valueLabelDisplay="auto"
              sx={{ color: '#ef4444' }}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ color: textPrimary, mb: 1 }}>
              Y (Front-Back): {clipY[0]}% - {clipY[1]}%
            </Typography>
            <Slider
              value={clipY}
              onChange={handleClipYChange}
              disabled={!viewerReady}
              min={0}
              max={100}
              valueLabelDisplay="auto"
              sx={{ color: '#22c55e' }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ color: textPrimary, mb: 1 }}>
              Z (Top-Bottom): {clipZ[0]}% - {clipZ[1]}%
            </Typography>
            <Slider
              value={clipZ}
              onChange={handleClipZChange}
              disabled={!viewerReady}
              min={0}
              max={100}
              valueLabelDisplay="auto"
              sx={{ color: '#3b82f6' }}
            />
          </Box>
        </Box>
        
        {/* Tumor Info - Only show if tumor data exists and is not null */}
        {tumorData && tumorData.volume_cc !== undefined && (
          <>
            <Divider sx={{ borderColor: borderColor, my: 2 }} />
            <Box>
              <Typography variant="subtitle2" sx={{ color: textSecondary, mb: 1.5, textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: 1 }}>
                Tumor Analysis
              </Typography>

              <Box sx={{ display: 'grid', gap: 1 }}>
                {tumorData.volume_cc !== undefined && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: textSecondary }}>Volume:</Typography>
                    <Typography variant="body2" sx={{ color: textPrimary, fontWeight: 500 }}>
                      {tumorData.volume_cc.toFixed(2)} cc
                    </Typography>
                  </Box>
                )}
                {tumorData.hemisphere && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: textSecondary }}>Hemisphere:</Typography>
                    <Typography variant="body2" sx={{ color: textPrimary, fontWeight: 500, textTransform: 'capitalize' }}>
                      {tumorData.hemisphere}
                    </Typography>
                  </Box>
                )}
                {tumorData.midline_shift_mm !== undefined && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ color: textSecondary }}>Midline Shift:</Typography>
                    <Typography variant="body2" sx={{ color: textPrimary, fontWeight: 500 }}>
                      {tumorData.midline_shift_mm.toFixed(2)} mm
                    </Typography>
                  </Box>
                )}
              </Box>
            </Box>
          </>
        )}
      </Paper>
    </Collapse>
  );
}

