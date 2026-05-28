/*!
 * PulseCam.js — measure heart rate from a webcam using remote photoplethysmography (rPPG)
 * MIT License
 *
 * The library samples the green channel of a facial region of interest (ROI),
 * builds a time series, removes slow trends, applies a Hann window and an FFT,
 * and reports the dominant frequency in the human heart-rate band (0.7–4 Hz,
 * i.e. ~42–240 BPM) as beats per minute.
 *
 * Usage:
 *   const pc = new PulseCam(videoElement, { onUpdate: (r) => console.log(r.bpm) });
 *   await pc.start();
 *   // ... later
 *   pc.stop();
 */
(function (global, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    global.PulseCam = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- small radix-2 iterative FFT (in-place, real/imag arrays) ----
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      const wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2;
          const tr = re[b] * cr - im[b] * ci;
          const ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
          const ncr = cr * wr - ci * wi;
          ci = cr * wi + ci * wr; cr = ncr;
        }
      }
    }
  }

  function nextPow2(x) {
    let p = 1;
    while (p < x) p <<= 1;
    return p;
  }

  const DEFAULTS = {
    windowSeconds: 10,    // length of analysis window
    updateMs: 1000,       // how often to emit a result
    minBpm: 42,
    maxBpm: 240,
    roi: 'auto',          // 'auto' uses FaceDetector if available, else 'center'
    roiScale: 0.6,        // fraction of frame used for the 'center' ROI box
    sampleWidth: 160,     // downscaled processing canvas width
    onUpdate: null,       // callback(result)
    onError: null         // callback(error)
  };

  function PulseCam(video, options) {
    this.video = video;
    this.opt = Object.assign({}, DEFAULTS, options || {});
    this.samples = [];   // { t: seconds, v: green-mean }
    this.timer = null;
    this.running = false;
    this.stream = null;
    this._faceDetector = null;
    this._lastRoi = null;

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    if (this.opt.roi === 'auto' && typeof window.FaceDetector === 'function') {
      try { this._faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 }); }
      catch (e) { this._faceDetector = null; }
    }
  }

  // Start the webcam (if the video has no stream yet) and begin sampling.
  PulseCam.prototype.start = async function () {
    if (this.running) return;
    if (!this.video.srcObject && !this.video.src) {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      this.video.srcObject = this.stream;
      await this.video.play();
    }
    this.running = true;
    this.samples = [];
    this._t0 = performance.now();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
    const self = this;
    this.timer = setInterval(function () { self._emit(); }, this.opt.updateMs);
  };

  PulseCam.prototype.stop = function () {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(function (t) { t.stop(); });
      this.stream = null;
    }
  };

  // The per-frame sampling loop.
  PulseCam.prototype._loop = async function () {
    if (!this.running) return;
    try {
      await this._sampleFrame();
    } catch (e) {
      if (this.opt.onError) this.opt.onError(e);
    }
    requestAnimationFrame(this._loop);
  };

  PulseCam.prototype._sampleFrame = async function () {
    const vw = this.video.videoWidth, vh = this.video.videoHeight;
    if (!vw || !vh) return;

    // Determine ROI (face box or centered box) in source coordinates.
    let roi = await this._resolveRoi(vw, vh);
    this._lastRoi = roi;

    // Downscale ROI into the processing canvas.
    const sw = this.opt.sampleWidth;
    const sh = Math.max(1, Math.round((roi.h / roi.w) * sw));
    this.canvas.width = sw;
    this.canvas.height = sh;
    this.ctx.drawImage(this.video, roi.x, roi.y, roi.w, roi.h, 0, 0, sw, sh);

    const data = this.ctx.getImageData(0, 0, sw, sh).data;
    let sum = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += data[i + 1]; // green channel
      count++;
    }
    const t = (performance.now() - this._t0) / 1000;
    this.samples.push({ t: t, v: sum / count });

    // Drop samples outside the window.
    const cutoff = t - this.opt.windowSeconds * 1.2;
    while (this.samples.length && this.samples[0].t < cutoff) this.samples.shift();
  };

  PulseCam.prototype._resolveRoi = async function (vw, vh) {
    if (this._faceDetector) {
      try {
        const faces = await this._faceDetector.detect(this.video);
        if (faces && faces.length) {
          const b = faces[0].boundingBox;
          // Use the upper-center of the face (forehead/cheeks) — strongest rPPG signal.
          const w = b.width * 0.6, h = b.height * 0.45;
          const x = b.x + (b.width - w) / 2;
          const y = b.y + b.height * 0.12;
          return { x: x, y: y, w: w, h: h };
        }
      } catch (e) { /* fall through to center ROI */ }
    }
    const s = this.opt.roiScale;
    const w = vw * s, h = vh * s;
    return { x: (vw - w) / 2, y: (vh - h) / 2, w: w, h: h };
  };

  // Return the last ROI used (source coords), so callers can draw an overlay.
  PulseCam.prototype.getRoi = function () { return this._lastRoi; };

  // Compute and dispatch a heart-rate estimate from the current window.
  PulseCam.prototype._emit = function () {
    const r = this.analyze();
    if (r && this.opt.onUpdate) this.opt.onUpdate(r);
  };

  // Core analysis: detrend -> window -> resample -> FFT -> peak in HR band.
  PulseCam.prototype.analyze = function () {
    const s = this.samples;
    if (s.length < 64) return { bpm: null, confidence: 0, ready: false, samples: s.length };

    const t0 = s[0].t, t1 = s[s.length - 1].t;
    const duration = t1 - t0;
    if (duration < this.opt.windowSeconds * 0.5) {
      return { bpm: null, confidence: 0, ready: false, samples: s.length };
    }

    // Uniform resampling onto a fixed grid (linear interpolation).
    const fs = 30; // target sampling rate (Hz)
    const N = nextPow2(Math.floor(duration * fs));
    const dt = duration / (N - 1);
    const grid = new Float64Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const tt = t0 + i * dt;
      while (j < s.length - 2 && s[j + 1].t < tt) j++;
      const a = s[j], b = s[j + 1] || s[j];
      const span = (b.t - a.t) || 1;
      const frac = Math.min(1, Math.max(0, (tt - a.t) / span));
      grid[i] = a.v + (b.v - a.v) * frac;
    }

    // Detrend with a moving average, then mean-remove.
    const win = Math.max(3, Math.round(fs * 0.75));
    const detr = new Float64Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      acc += grid[i];
      if (i >= win) acc -= grid[i - win];
      const ma = acc / Math.min(i + 1, win);
      detr[i] = grid[i] - ma;
    }

    // Hann window.
    const re = new Float64Array(N);
    const im = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
      re[i] = detr[i] * w;
    }

    fft(re, im);

    const fsEff = (N - 1) / duration; // effective sample rate
    const minHz = this.opt.minBpm / 60, maxHz = this.opt.maxBpm / 60;
    let peakIdx = -1, peakMag = 0, total = 0;
    for (let k = 1; k < N / 2; k++) {
      const f = (k * fsEff) / N;
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      if (f >= minHz && f <= maxHz) {
        total += mag;
        if (mag > peakMag) { peakMag = mag; peakIdx = k; }
      }
    }
    if (peakIdx < 0) return { bpm: null, confidence: 0, ready: false, samples: s.length };

    // Parabolic interpolation around the peak for sub-bin frequency accuracy.
    const m0 = Math.hypot(re[peakIdx - 1], im[peakIdx - 1]);
    const m1 = peakMag;
    const m2 = Math.hypot(re[peakIdx + 1], im[peakIdx + 1]);
    const denom = (m0 - 2 * m1 + m2);
    const delta = denom !== 0 ? 0.5 * (m0 - m2) / denom : 0;
    const freq = ((peakIdx + delta) * fsEff) / N;
    const bpm = freq * 60;

    const confidence = total > 0 ? Math.min(1, peakMag / (total / 8)) : 0;

    return {
      bpm: Math.round(bpm * 10) / 10,
      confidence: Math.round(confidence * 100) / 100,
      ready: true,
      windowSeconds: Math.round(duration * 10) / 10,
      samples: s.length
    };
  };

  return PulseCam;
});
