import React from 'react';
import { Box, Text, useInput } from 'ink';

type PlanApprovalModalProps = {
  planJson: string;
  onApprove: () => void;
  onReject: () => void;
};

export function PlanApprovalModal({ planJson, onApprove, onReject }: PlanApprovalModalProps) {
  let steps: any[] = [];
  try {
    steps = JSON.parse(planJson);
  } catch (e) {
    // fallback
  }

  useInput((input, key) => {
    if (input.toLowerCase() === 'y') {
      onApprove();
    } else if (input.toLowerCase() === 'n') {
      onReject();
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="blue"
      padding={1}
      width="100%"
    >
      <Text color="blue" bold>⏳ Plan-and-Solve: 拦截到执行计划等待审批</Text>
      <Box marginTop={1} flexDirection="column" paddingLeft={2}>
        {steps.length > 0 ? (
          steps.map((s: any, idx: number) => (
            <Box key={idx} flexDirection="row">
              <Text color="cyan">[{s.step}] </Text>
              <Text bold>{s.action} </Text>
              <Text color="gray">- {s.target}</Text>
            </Box>
          ))
        ) : (
          <Text>{planJson}</Text>
        )}
      </Box>
      <Box marginTop={1}>
        <Text bold>是否同意执行此计划？ </Text>
        <Text color="green">[y] 同意并执行  </Text>
        <Text color="red">[n] 拒绝并重试</Text>
      </Box>
    </Box>
  );
}
