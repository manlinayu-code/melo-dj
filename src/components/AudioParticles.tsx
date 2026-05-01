import { useEffect, useRef } from 'react';

interface AudioParticlesProps {
  isActive: boolean;
  intensity?: number;
}

export default function AudioParticles({ isActive, intensity = 0.5 }: AudioParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Array<{
    x: number; y: number; size: number; speedY: number; opacity: number;
    hue: number; phase: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    // Init particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 60; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 2 + 0.5,
          speedY: Math.random() * 0.5 + 0.1,
          opacity: Math.random() * 0.3 + 0.1,
          hue: Math.random() > 0.5 ? 155 : 220, // green or blue
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      const time = Date.now() * 0.001;

      particlesRef.current.forEach((p) => {
        const beatPulse = isActive ? Math.sin(time * 3 + p.phase) * intensity * 8 : 0;
        const size = p.size + beatPulse;
        const alpha = isActive ? Math.min(p.opacity + intensity * 0.3, 0.6) : p.opacity * 0.5;

        // Move upward
        p.y -= p.speedY;
        if (p.y < -10) {
          p.y = height + 10;
          p.x = Math.random() * width;
        }

        // Wobble
        const wobble = Math.sin(time + p.phase) * 2;

        // Draw glow
        const gradient = ctx.createRadialGradient(p.x + wobble, p.y, 0, p.x + wobble, p.y, size * 3);
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${alpha})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 60%, 60%, ${alpha * 0.5})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 40%, 50%, 0)`);

        ctx.beginPath();
        ctx.arc(p.x + wobble, p.y, size * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(p.x + wobble, p.y, size * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 90%, 85%, ${alpha})`;
        ctx.fill();
      });

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [isActive, intensity]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
