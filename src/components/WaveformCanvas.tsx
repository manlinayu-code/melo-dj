import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';

interface WaveformCanvasProps {
  isPlaying: boolean;
  color?: 'blue' | 'white' | 'indigo';
  height?: number;
  barCount?: number;
  /** Force-disable real audio analyser (use synthetic wave even if analyser is available). */
  synthetic?: boolean;
}

/**
 * WaveformCanvas
 * - When `audioAnalyser` from AppContext is available AND audio is actually playing,
 *   we render frequency bins from the real Web Audio API analyser.
 * - We lerp each bar's height between frames to avoid stutter.
 * - Otherwise we fall back to a synthetic sine + noise pattern (still useful for TTS-only states).
 */
export default function WaveformCanvas({
  isPlaying,
  color = 'green',
  height = 80,
  barCount: customBarCount,
  synthetic = false,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const smoothedRef = useRef<Float32Array | null>(null);
  const { audioAnalyser } = useApp();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rect = canvas.getBoundingClientRect();
    const sizeCanvas = () => {
      rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    sizeCanvas();

    const resizeObs = new ResizeObserver(sizeCanvas);
    resizeObs.observe(canvas);

    const barCount = customBarCount || (rect.width < 500 ? 40 : 80);

    const useReal = !synthetic && !!audioAnalyser;
    const freqArr = useReal ? new Uint8Array(audioAnalyser!.frequencyBinCount) : null;

    if (!smoothedRef.current || smoothedRef.current.length !== barCount) {
      smoothedRef.current = new Float32Array(barCount);
    }

    const palette = (() => {
      if (color === 'blue') return ['#0a1a2a', '#004466', '#3b82f6'];
      if (color === 'indigo') return ['rgba(79,70,229,0.05)', 'rgba(129,140,248,0.45)', 'rgba(165,180,252,0.95)'];
      return ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0.7)'];
    })();

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      const W = rect.width;
      const H = height;
      ctx.clearRect(0, 0, W, H);

      const barWidth = (W / barCount) * 0.6;
      const gap = (W / barCount) * 0.4;
      const smoothed = smoothedRef.current!;
      const time = Date.now() * 0.005;

      // Compute targets per bar (0..1)
      let targets: number[];
      if (useReal && freqArr && audioAnalyser) {
        audioAnalyser.getByteFrequencyData(freqArr);
        // Use logarithmic-ish slice: skip very-low DC bins, weight midrange
        const usable = Math.floor(freqArr.length * 0.75);
        const step = Math.max(1, Math.floor(usable / barCount));
        targets = new Array(barCount);
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += freqArr[i * step + j] || 0;
          targets[i] = (sum / step) / 255;
        }
      } else {
        targets = new Array(barCount);
        for (let i = 0; i < barCount; i++) {
          const phase = i * 0.3;
          const wave = Math.sin(time + phase) * 0.5 + 0.5;
          const noise = Math.random() * 0.25;
          const idle = isPlaying ? 1 : 0.18;
          targets[i] = Math.min(1, (wave + noise) * idle);
        }
      }

      // Lerp toward target — fast attack, slower decay
      for (let i = 0; i < barCount; i++) {
        const t = targets[i];
        const cur = smoothed[i];
        const k = t > cur ? 0.45 : 0.18;
        smoothed[i] = cur + (t - cur) * k;
      }

      for (let i = 0; i < barCount; i++) {
        const v = smoothed[i];
        const h = Math.max(2, Math.min(H - 2, v * H * 0.92));
        const x = i * (barWidth + gap) + gap / 2;
        const y = (H - h) / 2;

        const grad = ctx.createLinearGradient(x, y + h, x, y);
        grad.addColorStop(0, palette[0]);
        grad.addColorStop(0.55, palette[1]);
        grad.addColorStop(1, palette[2]);
        ctx.fillStyle = grad;

        const r = Math.min(barWidth / 2, 6);
        ctx.beginPath();
        if ((ctx as any).roundRect) {
          (ctx as any).roundRect(x, y, barWidth, h, [r, r, r, r]);
        } else {
          ctx.rect(x, y, barWidth, h);
        }
        ctx.fill();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      resizeObs.disconnect();
    };
  }, [isPlaying, color, height, customBarCount, audioAnalyser, synthetic]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: `${height}px` }}
      className="block"
    />
  );
}
