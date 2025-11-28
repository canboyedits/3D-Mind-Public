import { Box, LinearProgress, Typography } from '@mui/material';

interface LinearProgressWithLabelProps {
  value: number;
  label?: string;
}

export default function LinearProgressWithLabel({ 
  value, 
  label 
}: LinearProgressWithLabelProps) {
  return (
    <Box sx={{ width: '100%', mb: 1 }}>
      {label && (
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {label}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {Math.round(value)}%
          </Typography>
        </Box>
      )}
      <LinearProgress 
        variant="determinate" 
        value={value} 
        sx={{
          height: 8,
          borderRadius: 4,
          backgroundColor: 'rgba(0, 0, 0, 0.1)',
          '& .MuiLinearProgress-bar': {
            borderRadius: 4,
          },
        }}
      />
    </Box>
  );
}

