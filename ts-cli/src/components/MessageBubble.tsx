import React from 'react';
import { Box, Text } from 'ink';
import cliMd from 'cli-markdown';

type MessageRole = 'system' | 'user' | 'assistant' | 'error';

export function MessageBubble({ role, content }: { role: MessageRole; content: string }) {
  const isUser = role === 'user';
  const isSystem = role === 'system';
  const isError = role === 'error';
  const isAssistant = role === 'assistant';

  const borderColor = isUser ? 'green' : isAssistant ? 'blue' : isError ? 'red' : 'gray';
  const badgeText = isUser ? ' YOU ' : isAssistant ? ' AI ' : isError ? ' ERR ' : ' SYS ';
  
  // Ink supports backgroundColor props like bgGreen, bgBlue, etc.
  const bgProp = isUser ? { bgGreen: true } : isAssistant ? { bgBlue: true } : isError ? { bgRed: true } : { bgGray: true };

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box flexDirection="row" marginLeft={1}>
        <Text color="black" bold {...bgProp}>
          {badgeText}
        </Text>
      </Box>
      <Box
        borderStyle={isSystem ? undefined : "round"}
        borderColor={borderColor}
        paddingX={isSystem ? 0 : 1}
        marginLeft={1}
        flexDirection="column"
      >
        <Text color={isSystem ? "gray" : undefined}>
          {isAssistant ? cliMd(content) : content}
        </Text>
      </Box>
    </Box>
  );
}
