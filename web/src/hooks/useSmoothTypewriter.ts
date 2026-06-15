import { useState, useEffect, useRef } from 'react';

export function useSmoothTypewriter(rawText: string, isStreaming: boolean) {
  const [displayText, setDisplayText] = useState('');
  const queueRef = useRef<string[]>([]);
  const rawTextRef = useRef('');
  const timerRef = useRef<number | null>(null);

  // Sync state and feed the queue with new chunks
  useEffect(() => {
    if (!isStreaming) {
      // If streaming has ended and there is no queue left, instantly align to match rawText
      if (queueRef.current.length === 0) {
        setDisplayText(rawText);
        rawTextRef.current = rawText;
      } else {
        // If streaming ended but queue still has text, let the loop finish quickly
        rawTextRef.current = rawText;
      }
      return;
    }

    const currentLen = rawTextRef.current.length;
    if (rawText.length > currentLen) {
      const newChars = rawText.slice(currentLen).split('');
      queueRef.current.push(...newChars);
      rawTextRef.current = rawText;
    }
  }, [rawText, isStreaming]);

  // Handle the typewriter render loop
  useEffect(() => {
    const processQueue = () => {
      if (queueRef.current.length > 0) {
        const queueSize = queueRef.current.length;
        let charsToTake = 1;

        // Adaptive printing speed based on queue depth
        if (!isStreaming) {
          // Flush rapidly if stream finished
          charsToTake = Math.max(3, Math.ceil(queueSize / 10));
        } else if (queueSize > 40) {
          charsToTake = 4;
        } else if (queueSize > 20) {
          charsToTake = 2;
        }

        const taken = queueRef.current.splice(0, charsToTake).join('');
        setDisplayText((prev) => prev + taken);

        // Schedule next character print
        const nextDelay = !isStreaming ? 5 : queueSize > 20 ? 10 : 20;
        timerRef.current = window.setTimeout(processQueue, nextDelay);
      } else {
        if (isStreaming) {
          // Keep loop alive while streaming
          timerRef.current = window.setTimeout(processQueue, 30);
        } else {
          // End of stream & empty queue: finalize sync
          setDisplayText(rawTextRef.current);
        }
      }
    };

    timerRef.current = window.setTimeout(processQueue, 20);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [isStreaming]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Return rawText when empty or not streaming to skip typing latency for fast responses
  return displayText || (isStreaming ? '' : rawText);
}
