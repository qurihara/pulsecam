# PulseCam.js

Measure heart rate from a webcam, entirely in the browser, using **remote photoplethysmography (rPPG)**. No server, no dependencies, no data leaving the device.

**[▶ Live demo](https://qurihara.github.io/pulsecam/)**

## How it works

Tiny fluctuations in skin colour caused by blood flow are invisible to the eye but measurable from video. PulseCam:

1. Grabs frames from a `<video>` element onto a canvas.
2. Picks a region of interest — the face (via the browser `FaceDetector` API when available) or a centred box as a fallback.
3. Averages the **green channel** over the ROI each frame (green carries the strongest rPPG signal).
4. Resamples the time series to a uniform grid, removes slow trends, applies a Hann window and an FFT.
5. Reports the dominant frequency within the human heart-rate band (42–240 BPM) as beats per minute, with a confidence score.

## Usage

```html
<video id="cam" playsinline muted></video>
<script src="src/pulsecam.js"></script>
<script>
  const pc = new PulseCam(document.getElementById('cam'), {
    windowSeconds: 12,
    onUpdate: (r) => {
      if (r.bpm) console.log(`${r.bpm} BPM (confidence ${r.confidence})`);
    }
  });
  pc.start();   // requests the camera if the video has no stream yet
  // pc.stop();  // stops sampling and releases the camera
</script>
```

It also works as a CommonJS / AMD module (`require('pulsecam')`).

## Options

| Option | Default | Description |
| --- | --- | --- |
| `windowSeconds` | `10` | Length of the analysis window. |
| `updateMs` | `1000` | How often `onUpdate` fires. |
| `minBpm` / `maxBpm` | `42` / `240` | Heart-rate search band. |
| `roi` | `'auto'` | `'auto'` uses `FaceDetector` if present, else a centred box. |
| `roiScale` | `0.6` | Size of the centred ROI box as a fraction of the frame. |
| `sampleWidth` | `160` | Downscaled processing width (smaller = faster). |
| `onUpdate(result)` | `null` | Called with `{ bpm, confidence, ready, windowSeconds, samples }`. |
| `onError(err)` | `null` | Called on a sampling error. |

## API

- `start()` — async; opens the camera if needed and begins sampling.
- `stop()` — stops sampling and releases the camera.
- `analyze()` — returns the current estimate synchronously.
- `getRoi()` — the last ROI used (source coordinates), handy for drawing an overlay.

## Tips for a good reading

Sit still for ~15 seconds in steady, even lighting and keep your face centred. Movement and flickering light are the main sources of error.

## Disclaimer

PulseCam is a demonstration of rPPG, **not a medical device**. Do not use it for diagnosis or any health decision.

## License

MIT
