import { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import type { ChangeEvent, FormEvent } from 'react';
import type { PrescriptionFormValues } from '../types/index.js';

type PrescriptionDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (values: PrescriptionFormValues) => void | Promise<void>;
  initialValues?: Partial<PrescriptionFormValues>;
};

const EMPTY_FORM: PrescriptionFormValues = {
  patientName: '',
  patientAge: '',
  diagnosis: '',
  medications: '',
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
  nextAppointment: '',
};

function createDefaultForm(initialValues?: Partial<PrescriptionFormValues>): PrescriptionFormValues {
  return {
    ...EMPTY_FORM,
    ...initialValues,
  };
}

export function PrescriptionDialog({ open, onClose, onSubmit, initialValues }: PrescriptionDialogProps) {
  const [form, setForm] = useState<PrescriptionFormValues>(() => createDefaultForm(initialValues));

  useEffect(() => {
    if (open) {
      setForm(createDefaultForm(initialValues));
    }
  }, [open, initialValues]);

  const handleChange = (field: keyof PrescriptionFormValues) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const resetAndClose = () => {
    setForm(createDefaultForm(initialValues));
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(form);
    setForm(createDefaultForm(initialValues));
  };

  return (
    <Dialog open={open} onClose={resetAndClose} maxWidth="sm" fullWidth>
      <DialogTitle>Doctor Prescription</DialogTitle>
      <Box component="form" onSubmit={handleSubmit}>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Patient Name"
                value={form.patientName}
                onChange={handleChange('patientName')}
                fullWidth
                required
              />
              <TextField
                label="Age"
                value={form.patientAge}
                onChange={handleChange('patientAge')}
                fullWidth
              />
            </Stack>
            <TextField
              label="Diagnosis"
              value={form.diagnosis}
              onChange={handleChange('diagnosis')}
              fullWidth
              multiline
              minRows={2}
              placeholder="Chief complaint or clinical notes"
            />
            <TextField
              label="Medications"
              value={form.medications}
              onChange={handleChange('medications')}
              fullWidth
              multiline
              minRows={2}
              placeholder="List medications (one per line if needed)"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Dosage"
                value={form.dosage}
                onChange={handleChange('dosage')}
                fullWidth
              />
              <TextField
                label="Frequency"
                value={form.frequency}
                onChange={handleChange('frequency')}
                fullWidth
              />
            </Stack>
            <TextField
              label="Duration"
              value={form.duration}
              onChange={handleChange('duration')}
              fullWidth
              placeholder="e.g. 7 days"
            />
            <TextField
              label="Additional Instructions"
              value={form.instructions}
              onChange={handleChange('instructions')}
              fullWidth
              multiline
              minRows={2}
              placeholder="Diet, follow-ups, or lifestyle notes"
            />
            <TextField
              label="Next Appointment"
              value={form.nextAppointment}
              onChange={handleChange('nextAppointment')}
              fullWidth
              placeholder="e.g. 12 Jan 2026 at 3:30 PM"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={resetAndClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            Save Prescription
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
