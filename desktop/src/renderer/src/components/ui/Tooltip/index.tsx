import React, { useState } from 'react';

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: TooltipSide;
  delay?: number;
}

const sideClasses: Record<TooltipSide, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export default function Tooltip({
  content,
  children,
  side = 'top',
  delay = 200,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const show = () => {
    timer = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timer) clearTimeout(timer);
    setVisible(false);
  };

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {React.cloneElement(children, {
        className: [(children.props as { className?: string }).className, 'cursor-help']
          .filter(Boolean)
          .join(' '),
      } as Record<string, unknown>)}
      {visible && (
        <span
          className={[
            'absolute z-[var(--z-tooltip)] pointer-events-none',
            'px-2 py-1 rounded-[var(--radius-md)] text-[11px] font-medium whitespace-nowrap',
            'bg-[var(--text-primary)] text-[var(--text-inverse)] shadow-[var(--shadow-md)]',
            'transition-opacity duration-150',
            sideClasses[side],
          ].join(' ')}
          role="tooltip"
        >
          {content}
        </span>
      )}
    </span>
  );
}
