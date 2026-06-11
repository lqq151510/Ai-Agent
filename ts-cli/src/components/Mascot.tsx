import React from 'react';
import { Text, Box } from 'ink';

export function Mascot({ status = 'idle' }: { status?: 'idle' | 'thinking' | 'error' | string }) {
  const face = status === 'thinking' ? '(>_<)' : status === 'error' ? '(x_x)' : '(•_•)';
  
  return (
    <Box paddingRight={2}>
      <Text color="magentaBright" bold>
        {` ╭─────╮\n │ ${face} │\n ╰─────╯`}
      </Text>
    </Box>
  );
}
