import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import { ContentCopy, Check } from '@mui/icons-material';

export default function Link() {
  const [searchParams] = useSearchParams();
  const uid = searchParams.get('uid');
  const [copied, setCopied] = useState(false);
  const [oneClickLink, setOneClickLink] = useState('');

  useEffect(() => {
    if (uid) {
      // Get current origin (localhost:5174 or whatever port is running)
      const origin = window.location.origin;
      // Link only contains uid, no dob
      const link = `${origin}/view-scan?uid=${encodeURIComponent(uid)}`;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOneClickLink(link);
    }
  }, [uid]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(oneClickLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (!uid) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          px: 3,
          py: 4,
          backgroundImage: `linear-gradient(135deg, rgba(59,130,246,0.12), rgba(56,189,248,0.12))`,
        }}
      >
        <Paper
          elevation={6}
          sx={{
            p: 4,
            textAlign: 'center',
            borderRadius: 4,
          }}
        >
          <Typography variant="h5" color="error">
            Missing Parameter
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 2 }}>
            Please provide uid in the URL parameters.
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
          width: 'min(800px, 90vw)',
          textAlign: 'center',
          borderRadius: 4,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
        }}
      >
        <Box>
          <Typography variant="overline" color="primary" sx={{ letterSpacing: 2 }}>
            One-Click Access
          </Typography>
          <Typography variant="h3" component="h1" sx={{ mt: 1, mb: 1 }}>
            Your Scan Link
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Share this link to access your scan results. The link requires date of birth verification.
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            width: '100%',
            maxWidth: 700,
            mx: 'auto',
          }}
        >
          <TextField
            fullWidth
            label="One-Click Link"
            value={oneClickLink}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <IconButton
                  onClick={handleCopy}
                  color={copied ? 'success' : 'default'}
                  sx={{ mr: 1 }}
                >
                  {copied ? <Check /> : <ContentCopy />}
                </IconButton>
              ),
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />

          <Button
            variant="contained"
            size="large"
            onClick={handleCopy}
            startIcon={copied ? <Check /> : <ContentCopy />}
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            {copied ? 'Copied!' : 'Copy Link'}
          </Button>
        </Box>
      </Paper>

      <Snackbar
        open={copied}
        autoHideDuration={2000}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setCopied(false)}>
          Link copied to clipboard!
        </Alert>
      </Snackbar>
    </Box>
  );
}

