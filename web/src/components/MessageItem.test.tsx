import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { MessageItem } from './MessageItem';
import { Message } from '../types';

describe('MessageItem Component', () => {
  const userMessage: Message = {
    id: 'msg-1',
    role: 'user',
    content: 'Hello, this is **bold** text.',
    provider: 'OPENAI',
    model: 'gpt-4',
    createdAt: '2026-05-24T08:00:00Z',
    toolTrace: ''
  };

  const assistantMessage: Message = {
    id: 'msg-2',
    role: 'assistant',
    content: 'Here is some *italic* response.',
    provider: 'OPENAI',
    model: 'gpt-4',
    createdAt: '2026-05-24T08:01:00Z',
    toolTrace: JSON.stringify([
      {
        toolName: 'searchCode',
        argsJson: '{"query": "test"}',
        status: 'SUCCESS',
        durationMs: 120,
        output: 'found 5 results'
      }
    ])
  };

  it('renders user message correctly with sender name and time', () => {
    render(<MessageItem message={userMessage} />);
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText(/Hello, this is/)).toBeInTheDocument();
    
    // check markdown bold element is rendered as <strong> or equivalent structure
    const boldEl = screen.getByText('bold');
    expect(boldEl.tagName).toBe('STRONG');
    expect(screen.queryByText(/Tool Trace/)).toBeNull();
  });

  it('renders assistant message correctly', () => {
    render(<MessageItem message={assistantMessage} />);
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();
    const italicEl = screen.getByText('italic');
    expect(italicEl.tagName).toBe('EM');
    expect(screen.getByText(/Tool Trace \(1\)/)).toBeInTheDocument();
  });

  it('toggles trace display when trace button is clicked', () => {
    render(<MessageItem message={assistantMessage} />);
    const button = screen.getByText(/Tool Trace/);
    
    // Initially, trace details are not visible
    expect(screen.queryByText('searchCode')).toBeNull();
    expect(screen.queryByText('found 5 results')).toBeNull();

    // Click to expand
    fireEvent.click(button);
    expect(screen.getByText('searchCode')).toBeInTheDocument();
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
    expect(screen.getByText('120ms')).toBeInTheDocument();
    expect(screen.getByText('{"query": "test"}')).toBeInTheDocument();
    expect(screen.getByText('found 5 results')).toBeInTheDocument();

    // Click again to collapse
    fireEvent.click(button);
    expect(screen.queryByText('searchCode')).toBeNull();
  });
});
