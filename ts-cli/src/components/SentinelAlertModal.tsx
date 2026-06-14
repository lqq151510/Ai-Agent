import React from 'react';
import { Box, Text, useInput } from 'ink';

type SentinelAlertModalProps = {
  rootCause: string;
  suggestedFix: string;
  onDismiss: () => void;
};

export function SentinelAlertModal({ rootCause, suggestedFix, onDismiss }: SentinelAlertModalProps) {
  useInput((input, key) => {
    if (key.return || input === 'q') {
      onDismiss();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="red"
      padding={1}
      width="100%"
    >
      <Text color="red" bold>🚨 Bug Sentinel Alert 🚨</Text>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Root Cause:</Text>
        <Text>{rootCause}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Suggested Fix:</Text>
        <Text>{suggestedFix}</Text>
      </Box>
      <Box marginTop={1}>
        <Text color="gray">Press 'Enter' or 'q' to dismiss</Text>
      </Box>
    </Box>
  );
}
