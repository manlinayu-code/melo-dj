/**
 * BPM Detector — onset detection + autocorrelation
 *
 * Algorithm:
 * 1. Low-pass filter @ 200 Hz (isolate bass/kick for beat detection)
 * 2. Split into 20 ms frames, compute energy per frame
 * 3. Onset detection: positive energy differences (rising edges = beats)
 * 4. Autocorrelation on onset function to find dominant period
 * 5. Convert period → BPM, with harmonic check (double/half time)
 *
 * Returns BPM or null if confidence is too low.
 */

/** Apply a simple moving-average low-pass filter to isolate low frequencies. */
function lowPass(data: Float32Array, sampleRate: number): Float32Array {
  // Moving average window size ≈ 5 ms @ 44.1 kHz ≈ 220 samples
  // This effectively attenuates frequencies above ~200 Hz
  const windowSize = Math.floor(sampleRate * 0.005);
  if (windowSize <= 1) return data;

  const out = new Float32Array(data.length);
  let sum = 0;
  for (let i = 0; i < Math.min(windowSize, data.length); i++) {
    sum += data[i];
    out[i] = sum / (i + 1);
  }
  for (let i = windowSize; i < data.length; i++) {
    sum += data[i] - data[i - windowSize];
    out[i] = sum / windowSize;
  }
  return out;
}

/** Compute short-time energy for overlapping frames. */
function frameEnergy(samples: Float32Array, sampleRate: number): Float32Array {
  const frameMs = 20; // 20 ms per frame
  const hopMs = 10; // 10 ms hop (50% overlap)
  const frameSize = Math.floor(sampleRate * frameMs / 1000);
  const hopSize = Math.floor(sampleRate * hopMs / 1000);
  const numFrames = Math.floor((samples.length - frameSize) / hopSize);

  const energies = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    let sum = 0;
    const offset = i * hopSize;
    for (let j = 0; j < frameSize; j++) {
      sum += samples[offset + j] ** 2;
    }
    energies[i] = sum / frameSize;
  }
  return energies;
}

/** Onset detection function: only keep positive energy jumps. */
function onsetDetection(energies: Float32Array): Float32Array {
  const onsets = new Float32Array(energies.length);
  let prev = energies[0];
  for (let i = 1; i < energies.length; i++) {
    onsets[i] = Math.max(0, energies[i] - prev);
    prev = energies[i];
  }
  return onsets;
}

/**
 * Autocorrelation on the onset function.
 * Only checks lags corresponding to 40–200 BPM range.
 * Returns the lag (in frames) with the highest correlation.
 */
function findBeatPeriod(onsets: Float32Array, frameHopMs: number): { lag: number; confidence: number } | null {
  // 40 BPM = 1500 ms period, 200 BPM = 300 ms period
  const maxLag = Math.ceil(1500 / frameHopMs);
  const minLag = Math.floor(300 / frameHopMs);
  if (minLag >= maxLag) return null;

  // Compute autocorrelation
  const corr = new Float32Array(maxLag - minLag);
  let maxCorr = 0;
  let bestIdx = 0;

  for (let lag = minLag; lag < maxLag; lag++) {
    let sum = 0;
    const n = onsets.length - lag;
    if (n <= 0) continue;
    for (let i = 0; i < n; i++) {
      sum += onsets[i] * onsets[i + lag];
    }
    const normalized = sum / n;
    const idx = lag - minLag;
    corr[idx] = normalized;
    if (normalized > maxCorr) {
      maxCorr = normalized;
      bestIdx = lag;
    }
  }

  if (bestIdx === 0 || maxCorr === 0) return null;

  // Also check harmonic (double / half) candidates
  const doubleLag = bestIdx * 2;
  const halfLag = Math.floor(bestIdx / 2);
  let conf = maxCorr;

  if (doubleLag < maxLag) {
    const doubleCorr = corr[doubleLag - minLag] || 0;
    if (doubleCorr > conf * 0.8) {
      // Double-time felt as beat → likely half the BPM
      bestIdx = doubleLag;
      conf = doubleCorr;
    }
  }
  if (halfLag >= minLag) {
    const halfCorr = corr[halfLag - minLag] || 0;
    if (halfCorr > conf) {
      // Half-time peak stronger → original was double
      bestIdx = halfLag;
      conf = halfCorr;
    }
  }

  return { lag: bestIdx, confidence: conf };
}

export interface BpmResult {
  bpm: number;
  confidence: number; // 0–1
}

/**
 * Detect BPM from an AudioBuffer.
 * Only analyzes the first 30 seconds (enough for beat detection, saves CPU).
 */
export function detectBPM(buffer: AudioBuffer): BpmResult | null {
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);

  // Only analyze first 30 seconds
  const maxSamples = Math.min(channelData.length, sampleRate * 30);
  const segment = channelData.slice(0, maxSamples);

  // Step 1: Low-pass filter
  const filtered = lowPass(segment, sampleRate);

  // Step 2: Energy per frame
  const energies = frameEnergy(filtered, sampleRate);

  // Check if there's enough energy variation (silent or drone tracks have no beat)
  let energySum = 0;
  for (let i = 0; i < energies.length; i++) energySum += energies[i];
  const meanEnergy = energySum / energies.length;
  if (meanEnergy < 1e-6) return null; // too quiet

  // Step 3: Onset detection
  const onsets = onsetDetection(energies);

  // Step 4: Autocorrelation
  const hopMs = 10; // 10 ms hop used in frameEnergy
  const result = findBeatPeriod(onsets, hopMs);
  if (!result) return null;

  // Convert lag (frames) → BPM
  const periodMs = result.lag * hopMs;
  const bpm = Math.round(60000 / periodMs);

  // Clamp to reasonable range
  if (bpm < 40 || bpm > 220) return null;

  // Normalize confidence to 0–1 range (empirically, good matches ≥ 0.01 with this normalization)
  const conf = Math.min(1, Math.max(0, result.confidence * 5));

  return { bpm, confidence: conf };
}

/**
 * Utility: fetch and decode audio from a URL, then detect BPM.
 * Returns null on any error (network, decode failure, no beat detected).
 */
export async function detectBpmFromUrl(url: string): Promise<BpmResult | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();

    const ctx = new OfflineAudioContext({
      numberOfChannels: 1,
      length: 1,
      sampleRate: 44100,
    });

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return detectBPM(audioBuffer);
  } catch {
    return null;
  }
}
