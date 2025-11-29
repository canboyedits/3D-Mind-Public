import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  MenuItem,
} from '@mui/material';
import { Person, CalendarToday, Phone, Email } from '@mui/icons-material';

export interface FillFormData {
  name: string;
  dateOfBirth: string;
  contact: string;
  contactType: 'phone' | 'email';
}

interface FillFormProps {
  title?: string;
  subtitle?: string;
  description?: string;
  onSubmit?: (data: FillFormData) => void;
}

export default function FillForm({
  title = 'Patient Information',
  subtitle = 'Fill Form',
  description = 'Please provide the following information to proceed',
  onSubmit,
}: FillFormProps) {
  const [formData, setFormData] = useState<FillFormData>({
    name: '',
    dateOfBirth: '',
    contact: '',
    contactType: 'phone',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof FillFormData, string>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof FillFormData, boolean>>>({});

  const validateField = (name: keyof FillFormData, value: string): string => {
    switch (name) {
      case 'name': {
        if (!value.trim()) return 'Name is required';
        if (value.trim().length < 2) return 'Name must be at least 2 characters';
        return '';
      }
      case 'dateOfBirth': {
        if (!value) return 'Date of birth is required';
        const date = new Date(value);
        const today = new Date();
        if (date > today) return 'Date of birth cannot be in the future';
        const age = today.getFullYear() - date.getFullYear();
        if (age > 150) return 'Please enter a valid date of birth';
        return '';
      }
      case 'contact': {
        if (!value.trim()) return 'Contact information is required';
        if (formData.contactType === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) return 'Please enter a valid email address';
        } else {
          const phoneRegex = /^[\d\s\-+()]+$/;
          if (!phoneRegex.test(value) || value.replace(/\D/g, '').length < 10) {
            return 'Please enter a valid phone number';
          }
        }
        return '';
      }
      default:
        return '';
    }
  };

  const handleChange = (name: keyof FillFormData) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({ ...prev, [name]: error }));
    }
  };

  const handleBlur = (name: keyof FillFormData) => () => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, formData[name]);
    setErrors((prev) => ({ ...prev, [name]: error }));
  };

  const handleContactTypeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const contactType = e.target.value as 'phone' | 'email';
    setFormData((prev) => ({ ...prev, contactType, contact: '' }));
    setErrors((prev) => ({ ...prev, contact: '' }));
    setTouched((prev) => ({ ...prev, contact: false }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Mark all fields as touched
    const allTouched = {
      name: true,
      dateOfBirth: true,
      contact: true,
    };
    setTouched(allTouched);

    // Validate all fields
    const newErrors: Partial<Record<keyof FillFormData, string>> = {};
    newErrors.name = validateField('name', formData.name);
    newErrors.dateOfBirth = validateField('dateOfBirth', formData.dateOfBirth);
    newErrors.contact = validateField('contact', formData.contact);

    setErrors(newErrors);

    // Check if form is valid
    const isValid = !newErrors.name && !newErrors.dateOfBirth && !newErrors.contact;

    if (isValid && onSubmit) {
      onSubmit(formData);
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
            gap: 3,
            width: '100%',
            maxWidth: 600,
            mx: 'auto',
          }}
        >
          <TextField
            fullWidth
            required
            label="Name"
            value={formData.name}
            onChange={handleChange('name')}
            onBlur={handleBlur('name')}
            error={!!errors.name}
            helperText={errors.name}
            InputProps={{
              startAdornment: <Person sx={{ mr: 1, color: 'action.active' }} />,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: 'white',
              },
            }}
          />

          <TextField
            fullWidth
            required
            label="Date of Birth"
            type="date"
            value={formData.dateOfBirth}
            onChange={handleChange('dateOfBirth')}
            onBlur={handleBlur('dateOfBirth')}
            error={!!errors.dateOfBirth}
            helperText={errors.dateOfBirth}
            InputLabelProps={{
              shrink: true,
            }}
            InputProps={{
              startAdornment: <CalendarToday sx={{ mr: 1, color: 'action.active' }} />,
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                borderRadius: 2,
                backgroundColor: 'white',
              },
            }}
          />

          <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', sm: 'row' } }}>
            <TextField
              select
              label="Contact Type"
              value={formData.contactType}
              onChange={handleContactTypeChange}
              sx={{
                minWidth: { xs: '100%', sm: 150 },
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'white',
                },
              }}
            >
              <MenuItem value="phone">Phone</MenuItem>
              <MenuItem value="email">Email</MenuItem>
            </TextField>

            <TextField
              fullWidth
              required
              label={formData.contactType === 'phone' ? 'Phone Number' : 'Email Address'}
              type={formData.contactType === 'phone' ? 'tel' : 'email'}
              value={formData.contact}
              onChange={handleChange('contact')}
              onBlur={handleBlur('contact')}
              error={!!errors.contact}
              helperText={errors.contact}
              placeholder={
                formData.contactType === 'phone'
                  ? 'e.g., +1 (555) 123-4567'
                  : 'e.g., example@email.com'
              }
              InputProps={{
                startAdornment:
                  formData.contactType === 'phone' ? (
                    <Phone sx={{ mr: 1, color: 'action.active' }} />
                  ) : (
                    <Email sx={{ mr: 1, color: 'action.active' }} />
                  ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                  backgroundColor: 'white',
                },
              }}
            />
          </Box>
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
            Submit
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

