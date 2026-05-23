import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { Card, CardHeader } from './Card';

describe('Card Component', () => {
  it('renders children correctly', () => {
    render(<Card>Hello Card</Card>);
    expect(screen.getByText('Hello Card')).toBeInTheDocument();
  });

  it('applies hover class if hover prop is true', () => {
    const { container } = render(<Card hover={true}>Hover me</Card>);
    expect(container.firstChild).toHaveClass('card-hover');
  });

  it('triggers onClick handler when clicked', () => {
    const handleClick = vi.fn();
    render(<Card onClick={handleClick}>Clickable</Card>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});

describe('CardHeader Component', () => {
  it('renders title and subtitle', () => {
    render(<CardHeader title="My Title" subtitle="My Subtitle" />);
    expect(screen.getByText('My Title')).toBeInTheDocument();
    expect(screen.getByText('My Subtitle')).toBeInTheDocument();
  });
});
