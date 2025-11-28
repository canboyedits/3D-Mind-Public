import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
} from '@mui/material';
import { CalendarToday } from '@mui/icons-material';

interface EnterDOBProps {
  title?: string;
  subtitle?: string;
  description?: string;
  onSubmit?: (dob: string) => void;
}

export default function EnterDOB({
  title = 'Enter Date of Birth',
  subtitle = 'Verification',
  description = 'Please enter your date of birth to access your records',
  onSubmit,
}: EnterDOBProps) {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);

  const validateDateOfBirth = (value: string): string => {
    if (!value) return 'Date of birth is required';
    const date = new Date(value);
    const today = new Date();
    if (date > today) return 'Date of birth cannot be in the future';
    const age = today.getFullYear() - date.getFullYear();
    if (age > 150) return 'Please enter a valid date of birth';
    return '';
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDateOfBirth(value);
    
    if (touched) {
      const errorMessage = validateDateOfBirth(value);
      setError(errorMessage);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    const errorMessage = validateDateOfBirth(dateOfBirth);
    setError(errorMessage);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    setTouched(true);
    const errorMessage = validateDateOfBirth(dateOfBirth);
    setError(errorMessage);

    if (!errorMessage && onSubmit) {
      onSubmit(dateOfBirth);
    }
  };

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
        component="form"
        onSubmit={handleSubmit}
        sx={{
          p: { xs: 4, md: 6 },
          width: 'min(600px, 90vw)',
          minHeight: { xs: '50vh', md: '60vh' },
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
            gap: 3,
            width: '100%',
            maxWidth: 400,
            mx: 'auto',
          }}
        >
          <TextField
            fullWidth
            required
            label="Date of Birth"
            type="date"
            value={dateOfBirth}
            onChange={handleChange}
            onBlur={handleBlur}
            error={!!error}
            helperText={error || 'Format: YYYY-MM-DD'}
            InputLabelProps={{
              shrink: true,
            }}
            InputProps={{
              startAdornment: <CalendarToday sx={{ mr: 1, color: 'action.active' }} />,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
              },
            }}
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mt: 2 }}>
          <Button
            type="submit"
            variant="contained"
            size="large"
            sx={{
              px: 4,
              py: 1.5,
              borderRadius: 2,
              textTransform: 'none',
              fontSize: '1rem',
            }}
          >
            Continue
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

