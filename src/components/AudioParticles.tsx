import { useEffect, useRef } from 'react';
import { useApp } from '@/context/AppContext';

interface AudioParticlesProps {
  isActive: boolean;
  intensity?: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  baseOpacity: number;
  hue: number;
  phase: number;
  driftX: number;
}

/**
 * Particle field that pulses with the actual playing audio's volume RMS.
 * Falls back to a gentle ambient drift if no analyser / not active.
 */
export default function AudioParticles({ isActive, intensity = 0.5 }: AudioParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const rmsRef = useRef<number>(0);
  const { audioAnalyser } = useApp();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    let rect = canvas.getBoundingClientRect();
    let width = rect.width;
    let height = rect.height;

    const resize = () => {
      rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    if (particlesRef.current.length === 0 && width > 0) {
      const N = Math.min(80, Math.max(40, Math.floor((width * height) / 9000)));
      for (let i = 0; i < N; i++) {
        particlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.6 + 0.4,
          speedY: Math.random() * 0.35 + 0.08,
          baseOpacity: Math.random() * 0.35 + 0.1,
          hue: Math.random() > 0.5 ? 155 : 240,
          phase: Math.random() * Math.PI * 2,
          driftX: (Math.random() - 0.5) * 0.15,
        });
      }
    }

    const timeData = audioAnalyser ? new Uint8Array(audioAnalyser.fftSize) : null;

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, width, height);
      const time = Date.now() * 0.001;

      // RMS from analyser (0..1)
      let rmsTarget = 0;
      if (isActive && audioAnalyser && timeData) {
        audioAnalyser.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sum += v * v;
        }
        rmsTarget = Math.sqrt(sum / timeData.length);
      } else if (isActive) {
        rmsTarget = 0.25 + Math.sin(time * 1.2) * 0.08;
      }
      // Smooth
      rmsRef.current += (rmsTarget - rmsRef.current) * 0.12;
      const rms = rmsRef.current;
      const energy = Math.min(1, rms * 2.5);

      const list = particlesRef.current;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        const beat = Math.sin(time * 2.3 + p.phase) * energy * (1 + intensity);
        const size = Math.max(0.2, p.size + beat * 1.8);
        const alpha = Math.min(0.75, p.baseOpacity + energy * 0.4 * (0.5 + intensity));

        p.y -= p.speedY + energy * 0.3;
        p.x += p.driftX;
        if (p.y < -8) { p.y = height + 8; p.x = Math.random() * width; }
        if (p.x < -8) p.x = width + 8;
        else if (p.x > width + 8) p.x = -8;

        const wobble = Math.sin(time + p.phase) * (1.5 + energy * 4);
        const cx = p.x + wobble;

        const radius = Math.max(1, size * 3.5);
        const gradient = ctx.createRadialGradient(cx, p.y, 0, cx, p.y, radius);
        gradient.addColorStop(0, `hsla(${p.hue}, 80%, 70%, ${alpha})`);
        gradient.addColorStop(0.5, `hsla(${p.hue}, 60%, 60%, ${alpha * 0.4})`);
        gradient.addColorStop(1, `hsla(${p.hue}, 40%, 50%, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, p.y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `hsla(${p.hue}, 95%, 88%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(cx, p.y, Math.max(0.4, size * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(animRef.current);
      ro.disconnect();
    };
  }, [isActive, intensity, audioAnalyser]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
