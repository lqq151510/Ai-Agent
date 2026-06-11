import React from 'react';
import { Box, Text } from 'ink';
import { Mascot } from './Mascot.js';

type HeaderProps = {
  userEmail: string;
  activeSessionId?: string;
  statusLine: string;
};

export function Header({ userEmail, activeSessionId, statusLine }: HeaderProps) {
  const activeSessionLabel = activeSessionId ? activeSessionId.slice(0, 8) : 'none';

  const isThinking = statusLine.toLowerCase().includes('stream') || statusLine.toLowerCase().includes('collecting');
  const isError = statusLine.toLowerCase().includes('fail') || statusLine.toLowerCase().includes('error');
  const mascotStatus = isError ? 'error' : isThinking ? 'thinking' : 'idle';

  return (
    <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="row" alignItems="center">
      <Mascot status={mascotStatus} />
      <Box flexDirection="column" flexGrow={1}>
        <Text color="cyan" bold>AI Agent TS CLI</Text>
        <Box flexDirection="row" gap={2}>
          <Text color="gray">user: <Text color="white">{userEmail || 'anonymous'}</Text></Text>
          <Text color="gray">session: <Text color="white">{activeSessionLabel}</Text></Text>
          <Text color="gray">status: <Text color={isError ? "red" : isThinking ? "yellow" : "green"}>{statusLine}</Text></Text>
        </Box>
      </Box>
    </Box>
  );
}
