import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner Component', () => {
  it('renders default spinner with default text', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('renders custom text when provided', () => {
    render(<LoadingSpinner text="自定义加载" />);
    expect(screen.getByText('自定义加载')).toBeInTheDocument();
  });

  it('does not render text if text is empty', () => {
    const { container } = render(<LoadingSpinner text="" />);
    const span = container.querySelector('.loading-text');
    expect(span).toBeNull();
  });

  it('applies fullscreen classes when fullScreen prop is true', () => {
    const { container } = render(<LoadingSpinner fullScreen={true} />);
    expect(container.firstChild).toHaveClass('loading-fullscreen');
    expect(container.querySelector('.loading-spinner')).toBeInTheDocument();
  });

  it('renders without fullscreen classes when fullScreen is false', () => {
    const { container } = render(<LoadingSpinner fullScreen={false} />);
    expect(container.firstChild).toHaveClass('loading-spinner');
    expect(container.firstChild).not.toHaveClass('loading-fullscreen');
  });
});
