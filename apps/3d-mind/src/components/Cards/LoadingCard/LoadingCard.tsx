import { useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Alert,
} from '@mui/material';
import { CheckCircle, Science } from '@mui/icons-material';
import LinearProgressWithLabel from './LinearProgressWithLabel';

interface LoadingCardProps {
  title?: string;
  subtitle?: string;
  description?: string;
  progress?: number;
  isComplete?: boolean;
  onComplete?: () => void;
}

export default function LoadingCard({
  title = 'Analyzing MRI Scans',
  subtitle = 'Processing',
  description = 'Please wait while we analyze your MRI scans for tumor detection',
  progress = 0,
  isComplete = false,
  onComplete,
}: LoadingCardProps) {

  useEffect(() => {
    if (isComplete && onComplete) {
      // Small delay before calling onComplete to show completion message
      const timer = setTimeout(() => {
        onComplete();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onComplete]);

  return (
    <Box
      component="main"
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
            {description}
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            width: '100%',
            maxWidth: 600,
            mx: 'auto',
            mt: 4,
          }}
        >
          {isComplete ? (
            <>
              <CheckCircle sx={{ fontSize: 80, color: 'success.main', mb: 2 }} />
              <Alert severity="success" sx={{ width: '100%' }}>
                Analysis complete
              </Alert>
            </>
          ) : (
            <>
              <Science sx={{ fontSize: 80, color: 'primary.main', mb: 2 }} />
              <Box sx={{ width: '100%', mt: 2 }}>
                <LinearProgressWithLabel 
                  value={progress} 
                  label="Processing..."
                />
              </Box>
            </>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

