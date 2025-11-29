import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { Box, Button, CircularProgress, Divider, IconButton, Paper, Stack, TextField, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import HistoryIcon from '@mui/icons-material/History';
import SendIcon from '@mui/icons-material/Send';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import type { ChatbotUIProps, ChatMessage, PrescriptionFormValues } from '../types/index.js';
import { useChatbot } from '../hooks/useChatbot.js';
import { PrescriptionDialog } from './PrescriptionDialog.js';

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const modelLabel = typeof message.meta?.model === 'string' ? message.meta.model : undefined;
  const metaType = typeof message.meta?.type === 'string' ? message.meta.type : undefined;
  const isPrescriptionNotice = !isUser && metaType === 'prescription';
  return (
    <Box
      sx={{
        alignSelf: isUser ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        px: 2,
        py: 1.5,
        borderRadius: 2,
        bgcolor: isUser ? 'primary.main' : 'grey.200',
        color: isUser ? 'primary.contrastText' : 'text.primary',
        boxShadow: 1,
      }}
    >
      <Typography variant="caption" sx={{ opacity: 0.8 }}>
        {isUser ? 'You' : 'Assistant'}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mt: 0.5 }}>
        {message.content}
      </Typography>
      {modelLabel && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, opacity: 0.6 }}>
          Model: {modelLabel}
        </Typography>
      )}
      {isPrescriptionNotice && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, fontStyle: 'italic' }}>
          Ask "give me the prescription" or "When is the next appointment?" to view the details.
        </Typography>
      )}
    </Box>
  );
}

export function ChatbotUI({
  recordUid,
  contextHint,
  apiBaseUrl,
  title = 'AI Care Assistant',
  height = '100%',
  onClose,
  showCloseButton = true,
  patientName,
  patientDob,
}: ChatbotUIProps) {
  const [input, setInput] = useState('');
  const [isPrescriptionDialogOpen, setIsPrescriptionDialogOpen] = useState(false);
  const [dialogInitialValues, setDialogInitialValues] = useState<Partial<PrescriptionFormValues> | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    state: {
      messages,
      isSending,
      sendError,
      historyError,
      hasMoreHistory,
      isHistoryLoading,
      canUseChat,
    },
    sendMessage,
    loadMoreHistory,
  } = useChatbot({ recordUid, contextHint, apiBaseUrl });

  const isDoctorCommand = useMemo(() => input.trim().toLowerCase().startsWith('@doctor'), [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isSending]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || trimmed.toLowerCase() === '@doctor') return;
    void sendMessage(trimmed);
    setInput('');
  };

  const handleOpenPrescriptionDialog = () => {
    const defaults: Partial<PrescriptionFormValues> = {};
    if (patientName) {
      defaults.patientName = patientName;
    }
    const autoAge = calculateAgeFromDob(patientDob);
    if (autoAge) {
      defaults.patientAge = autoAge;
    }
    setDialogInitialValues(Object.keys(defaults).length > 0 ? defaults : undefined);
    setIsPrescriptionDialogOpen(true);
    setInput('');
  };

  const handleClosePrescriptionDialog = () => {
    setIsPrescriptionDialogOpen(false);
  };

  const handlePrescriptionSubmit = async (values: PrescriptionFormValues) => {
    const prescriptionLines = [
      `Patient Name: ${values.patientName}`,
      values.patientAge ? `Age: ${values.patientAge}` : null,
      values.diagnosis ? `Diagnosis: ${values.diagnosis}` : null,
      values.medications ? `Medications: ${values.medications}` : null,
      values.dosage ? `Dosage: ${values.dosage}` : null,
      values.frequency ? `Frequency: ${values.frequency}` : null,
      values.duration ? `Duration: ${values.duration}` : null,
      values.instructions ? `Instructions: ${values.instructions}` : null,
      values.nextAppointment ? `Next Appointment: ${values.nextAppointment}` : null,
    ].filter(Boolean);

    const formatted = ['@doctor prescription entry', ...prescriptionLines].join('\n');
    await sendMessage(formatted);
    setIsPrescriptionDialogOpen(false);
  };

  return (
    <PaperLikeContainer height={height}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 2, pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            sx={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              display: 'grid',
              placeItems: 'center',
              color: 'primary.contrastText',
            }}
          >
            <SmartToyIcon fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              Personalised insights for this scan
            </Typography>
          </Box>
        </Stack>

        {showCloseButton && onClose && (
          <Tooltip title="Close assistant">
            <IconButton size="small" onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Divider sx={{ mb: 1 }} />

      <Stack spacing={1.5} sx={{ flex: 1, minHeight: 0, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="caption" color="text.secondary">
            Conversation history
          </Typography>
          <Button
            size="small"
            startIcon={<HistoryIcon fontSize="inherit" />}
            onClick={() => void loadMoreHistory()}
            disabled={!hasMoreHistory || isHistoryLoading}
          >
            {isHistoryLoading ? 'Loading…' : hasMoreHistory ? 'Load earlier messages' : 'History synced'}
          </Button>
        </Box>

        {historyError && (
          <Box sx={{ bgcolor: 'error.light', color: 'error.contrastText', p: 1, borderRadius: 1 }}>
            <Typography variant="caption">{historyError}</Typography>
          </Box>
        )}

        <Box
          ref={scrollRef}
          sx={{
            flex: 1,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            pr: 1,
          }}
        >
          {messages.length === 0 && !isHistoryLoading && (
            <Box sx={{ textAlign: 'center', mt: 6 }}>
              <Typography variant="body2" color="text.secondary">
                Ask any question about this scan to begin.
              </Typography>
            </Box>
          )}

          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}

          {isSending && (
            <Box
              sx={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 1,
                borderRadius: 2,
                bgcolor: 'grey.200',
              }}
            >
              <CircularProgress size={16} thickness={5} />
              <Typography variant="body2">Thinking…</Typography>
            </Box>
          )}
        </Box>

        {sendError && (
          <Box sx={{ bgcolor: 'error.light', color: 'error.contrastText', p: 1, borderRadius: 1 }}>
            <Typography variant="caption">{sendError}</Typography>
          </Box>
        )}

        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <TextField
            label={canUseChat ? 'Ask about this scan' : 'Patient context loading…'}
            placeholder="Describe the area of concern, ask about tumour metrics, etc."
            value={input}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setInput(event.target.value)}
            disabled={isSending || !canUseChat}
            multiline
            minRows={3}
          />
          {isDoctorCommand && (
            <Paper elevation={2} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 1.5 }}>
              <Stack spacing={0.5}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <MedicalServicesIcon fontSize="small" color="primary" />
                  <Typography variant="subtitle2">Doctor tools available</Typography>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Add a structured prescription instead of sending the command.
                </Typography>
              </Stack>
              <Button size="small" variant="contained" onClick={handleOpenPrescriptionDialog}>
                Add prescription
              </Button>
            </Paper>
          )}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="caption" color="text.secondary">
              Shift + Enter for newline
            </Typography>
            <Button
              type="submit"
              variant="contained"
              endIcon={<SendIcon />}
              disabled={isSending || !input.trim() || !canUseChat}
            >
              {isSending ? 'Sending…' : 'Send'}
            </Button>
          </Stack>
        </Box>
      </Stack>

      <PrescriptionDialog
        open={isPrescriptionDialogOpen}
        onClose={handleClosePrescriptionDialog}
        onSubmit={handlePrescriptionSubmit}
        initialValues={dialogInitialValues}
      />
    </PaperLikeContainer>
  );
}

function PaperLikeContainer({ children, height }: { children: ReactNode; height: number | string }) {
  return (
    <Box
      sx={{
        height,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.paper',
        borderLeft: '1px solid',
        borderColor: 'divider',
        boxShadow: 6,
        width: 380,
        maxWidth: '100%',
      }}
    >
      {children}
    </Box>
  );
}

function calculateAgeFromDob(dob?: string): string {
  if (!dob) return '';
  const dobDate = new Date(dob);
  if (Number.isNaN(dobDate.getTime())) {
    return '';
  }
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const hasHadBirthdayThisYear =
    today.getMonth() > dobDate.getMonth()
    || (today.getMonth() === dobDate.getMonth() && today.getDate() >= dobDate.getDate());
  if (!hasHadBirthdayThisYear) {
    age -= 1;
  }
  return age >= 0 ? String(age) : '';
}
