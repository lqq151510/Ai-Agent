import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: number;
  text?: string;
  fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  size = 24, 
  text = '加载中...',
  fullScreen = false 
}) => {
  const content = (
    <div className="loading-spinner">
      <Loader2 size={size} className="animate-spin" />
      {text && <span className="loading-text">{text}</span>}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="loading-fullscreen">
        {content}
      </div>
    );
  }

  return content;
};
