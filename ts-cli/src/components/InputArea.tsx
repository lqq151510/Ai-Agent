import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';

type InputAreaProps = {
  input: string;
  setInput: (val: string) => void;
  onSubmit: (val: string) => void;
  loading: boolean;
  statusLine: string;
};

export function InputArea({ input, setInput, onSubmit, loading, statusLine }: InputAreaProps) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box marginBottom={1}>
        {loading ? (
          <Text color="yellow">
            <Spinner type="dots" /> {statusLine}
          </Text>
        ) : (
          <Text color="gray">{statusLine}</Text>
        )}
      </Box>
      <Box>
        <Text color="green" bold>❯ </Text>
        <TextInput 
          value={input} 
          onChange={setInput} 
          onSubmit={onSubmit} 
          placeholder="有什么我可以帮你的？ (输入 /help 查看命令)" 
        />
      </Box>
    </Box>
  );
}
