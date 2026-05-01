import { useEffect, useRef } from 'react';

interface WaveformCanvasProps {
  isPlaying: boolean;
  color?: 'green' | 'white';
  height?: number;
  barCount?: number;
}

export default function WaveformCanvas({
  isPlaying,
  color = 'green',
  height = 80,
  barCount: customBarCount,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const barCount = customBarCount || (rect.width < 500 ? 40 : 80);
    const barWidth = rect.width / barCount * 0.6;
    const gap = rect.width / barCount * 0.4;

    const draw = () => {
      ctx.clearRect(0, 0, rect.width, height);
      const time = Date.now() * 0.005;

      for (let i = 0; i < barCount; i++) {
        const baseHeight = height * 0.85;
        const phase = i * 0.3;
        const wave = Math.sin(time + phase) * 0.5 + 0.5;
        const noise = Math.random() * 0.3;
        let h = baseHeight * (wave + noise) * (isPlaying ? 1 : 0.15);
        if (!isPlaying) {
          h += Math.sin(Date.now() * 0.002 + i * 0.1) * height * 0.05;
        }
        h = Math.max(4, Math.min(h, height - 4));

        const x = i * (barWidth + gap) + gap / 2;
        const y = (height - h) / 2;

        if (color === 'green') {
          // Three-layer gradient
          const grad = ctx.createLinearGradient(x, y + h, x, y);
          grad.addColorStop(0, '#0a2a1a');
          grad.addColorStop(0.5, '#006644');
          grad.addColorStop(1, '#00d084');
          ctx.fillStyle = grad;
        } else {
          const grad = ctx.createLinearGradient(x, y + h, x, y);
          grad.addColorStop(0, 'rgba(255,255,255,0.1)');
          grad.addColorStop(1, 'rgba(255,255,255,0.6)');
          ctx.fillStyle = grad;
        }

        // Rounded top
        const r = barWidth / 2;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, h, [r, r, 0, 0]);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, color, height, customBarCount]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px` }}
      className="block"
    />
  );
}
