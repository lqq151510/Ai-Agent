import React, { useEffect, useRef, useState } from 'react';

type Ripple = {
  id: number;
  x: number;
  y: number;
};

const PARTICLES = [
  { angle: 0, radius: 24, size: 4, duration: 3.4, alpha: 0.42 },
  { angle: 45, radius: 34, size: 3, duration: 4.1, alpha: 0.34 },
  { angle: 90, radius: 28, size: 5, duration: 3.8, alpha: 0.3 },
  { angle: 135, radius: 40, size: 3, duration: 4.6, alpha: 0.28 },
  { angle: 180, radius: 30, size: 4, duration: 3.9, alpha: 0.32 },
  { angle: 225, radius: 38, size: 3, duration: 4.3, alpha: 0.25 },
  { angle: 270, radius: 26, size: 4, duration: 3.6, alpha: 0.37 },
  { angle: 315, radius: 44, size: 3, duration: 4.9, alpha: 0.24 }
];

export const MouseFx: React.FC = () => {
  const layerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>();
  const idRef = useRef(0);
  const targetRef = useRef({ x: 0, y: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const timeoutsRef = useRef<number[]>([]);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  useEffect(() => {
    const center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    targetRef.current = center;
    currentRef.current = center;
    if (layerRef.current) {
      layerRef.current.style.setProperty('--mx', `${center.x}px`);
      layerRef.current.style.setProperty('--my', `${center.y}px`);
    }

    const loop = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      current.x += (target.x - current.x) * 0.18;
      current.y += (target.y - current.y) * 0.18;
      if (layerRef.current) {
        layerRef.current.style.setProperty('--mx', `${current.x}px`);
        layerRef.current.style.setProperty('--my', `${current.y}px`);
      }
      frameRef.current = window.requestAnimationFrame(loop);
    };

    const onPointerMove = (event: PointerEvent) => {
      targetRef.current = { x: event.clientX, y: event.clientY };
    };

    const onPointerDown = (event: PointerEvent) => {
      idRef.current += 1;
      const id = idRef.current;
      const next = { id, x: event.clientX, y: event.clientY };
      setRipples(prev => [...prev.slice(-5), next]);
      const timeout = window.setTimeout(() => {
        setRipples(prev => prev.filter(item => item.id !== id));
      }, 900);
      timeoutsRef.current.push(timeout);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    frameRef.current = window.requestAnimationFrame(loop);

    return () => {
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      timeoutsRef.current.forEach(timeout => window.clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, []);

  return (
    <div className="mouse-fx" ref={layerRef} aria-hidden="true">
      <span className="mouse-halo halo-soft" />
      <span className="mouse-halo halo-core" />
      {PARTICLES.map((particle, idx) => (
        <span
          key={idx}
          className="mouse-particle"
          style={
            {
              '--angle': `${particle.angle}deg`,
              '--radius': `${particle.radius}px`,
              '--size': `${particle.size}px`,
              '--duration': `${particle.duration}s`,
              '--alpha': `${particle.alpha}`
            } as React.CSSProperties
          }
        />
      ))}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="mouse-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        />
      ))}
    </div>
  );
};

