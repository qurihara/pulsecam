/* Node test: feed synthetic rPPG signals at known BPM and check recovery. */
global.window = { FaceDetector: undefined };
global.document = { createElement: () => ({ getContext: () => ({}) }) };

const PulseCam = require('../src/pulsecam.js');

function makeInstance() {
  const v = {};
  return new PulseCam(v, { windowSeconds: 12 });
}

function synthSamples(bpm, seconds, fs, noise) {
  const f = bpm / 60;
  const samples = [];
  for (let i = 0; i < seconds * fs; i++) {
    const t = i / fs;
    const dc = 128 + 2 * Math.sin(2 * Math.PI * 0.05 * t); // slow drift
    const pulse = 1.5 * Math.sin(2 * Math.PI * f * t);
    const n = noise * (Math.random() - 0.5);
    samples.push({ t, v: dc + pulse + n });
  }
  return samples;
}

let pass = 0, fail = 0;
function check(targetBpm, noise) {
  const pc = makeInstance();
  // ~24fps capture, 12s window
  pc.samples = synthSamples(targetBpm, 12, 24, noise);
  const r = pc.analyze();
  const ok = r.ready && Math.abs(r.bpm - targetBpm) <= 3; // within 3 BPM
  console.log(
    `target ${targetBpm} BPM (noise ${noise})  ->  ${r.bpm} BPM, conf ${r.confidence}  ${ok ? 'PASS' : 'FAIL'}`
  );
  ok ? pass++ : fail++;
}

[48, 60, 72, 90, 120, 160].forEach((b) => check(b, 0.5));
// higher noise
[60, 90, 120].forEach((b) => check(b, 2.0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
