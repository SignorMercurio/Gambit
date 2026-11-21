#!/usr/bin/env node
// Render a Gambit timeline to video offline, frame by frame, instead of screen
// recording present mode. The app is opened with `?render` (src/lib/renderMode.ts),
// which hides the chrome and lets this script set the playback clock; every frame
// is script + FEN + time, so the output matches live playback without dropped frames.
//
//   node scripts/render-video.mjs --script output.gambit --fen '<FEN>' \
//     --srt output.srt --audio output.mp3 --out render.mov
//
// Needs the dev server (npm run dev), ffmpeg, and a Chromium-family browser
// (--chrome or $CHROME). Zero npm dependencies: it speaks the DevTools protocol
// over Node's built-in WebSocket.

import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/ego lite.app/Contents/MacOS/ego lite',
];
// Mirrors src/lib/moveSound.ts: the click sits at half volume under narration.
const CLICK_VOLUME = 0.5;
const AUDIO_RATE = 48000;

const { values: opt } = parseArgs({
  options: {
    script: { type: 'string' },
    fen: { type: 'string' },
    srt: { type: 'string' },
    audio: { type: 'string' },
    out: { type: 'string' },
    url: { type: 'string', default: 'http://localhost:5173/' },
    fps: { type: 'string', default: '30' },
    // The full-screen present window the OBS recordings were made in, at 2x.
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
    scale: { type: 'string', default: '2' },
    chrome: { type: 'string', default: process.env.CHROME },
    'no-sfx': { type: 'boolean', default: false },
    // Render only the first N seconds, for a quick preview.
    until: { type: 'string' },
  },
});
for (const key of ['script', 'out']) {
  if (!opt[key]) fail(`--${key} is required`);
}
if (existsSync(opt.out)) fail(`${opt.out} already exists`);
const fps = Number(opt.fps);
const chromePath = opt.chrome ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromePath) fail('no Chromium-family browser found; pass --chrome');

function fail(message) {
  console.error(`render-video: ${message}`);
  process.exit(1);
}

function mediaDuration(file) {
  return Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file])
      .toString()
      .trim(),
  );
}

// Minimal DevTools client: one page session, request/response by id.
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, ko) => {
    ws.onopen = ok;
    ws.onerror = () => ko(new Error(`cannot open ${wsUrl}`));
  });
  let nextId = 1;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    const waiter = pending.get(msg.id);
    if (!waiter) return;
    pending.delete(msg.id);
    if (msg.error) waiter.ko(new Error(`${waiter.method}: ${msg.error.message}`));
    else waiter.ok(msg.result);
  };
  const send = (method, params = {}) =>
    new Promise((ok, ko) => {
      const id = nextId++;
      pending.set(id, { ok, ko, method });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

async function waitFor(page, expression, what, ms = 20_000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await page.evaluate(expression).catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timed out waiting for ${what}`);
}

async function launchBrowser(profile) {
  const proc = spawn(
    chromePath,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--hide-scrollbars',
      '--mute-audio',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(profile, 'DevToolsActivePort');
  const until = Date.now() + 15_000;
  while (!existsSync(portFile)) {
    if (Date.now() > until) throw new Error('browser did not start');
    await new Promise((r) => setTimeout(r, 100));
  }
  const port = (await readFile(portFile, 'utf8')).split('\n')[0].trim();
  // The port file can appear before the first tab is listed.
  while (true) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const page = targets.find((t) => t.type === 'page');
    if (page) return { proc, page: await connect(page.webSocketDebuggerUrl) };
    if (Date.now() > until) throw new Error('browser opened no page');
    await new Promise((r) => setTimeout(r, 100));
  }
}

function run(cmd, args) {
  return new Promise((ok, ko) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`${cmd} exited ${code}`))));
  });
}

// Sum the click sample into one track at the frame times it landed on.
async function writeClickTrack(clickTimes, seconds, file) {
  const sample = execFileSync('ffmpeg', [
    '-v', 'error', '-i', join(ROOT, 'public/sounds/move.mp3'),
    '-f', 'f32le', '-ac', '1', '-ar', String(AUDIO_RATE), '-',
  ]);
  const click = new Float32Array(sample.buffer, sample.byteOffset, sample.length / 4);
  const track = new Float32Array(Math.ceil(seconds * AUDIO_RATE));
  for (const t of clickTimes) {
    const at = Math.round(t * AUDIO_RATE);
    for (let i = 0; i < click.length && at + i < track.length; i++) track[at + i] += click[i] * CLICK_VOLUME;
  }
  await writeFile(file, Buffer.from(track.buffer));
}

const work = await mkdtemp(join(tmpdir(), 'gambit-render-'));
const { proc: browser, page } = await launchBrowser(join(work, 'profile'));
try {
  const width = Number(opt.width);
  const height = Number(opt.height);
  const scale = Number(opt.scale);
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });

  // Drafts are the app's only input path. Seed them before the app's own code
  // runs: a loaded app flushes its drafts on unload and would overwrite them.
  const drafts = {
    'gambit:draft:script': await readFile(opt.script, 'utf8'),
    'gambit:draft:subtitles': opt.srt ? await readFile(opt.srt, 'utf8') : '',
    'gambit:draft:start-fen': opt.fen ?? '',
    'gambit:draft:board-orientation': 'white',
    'gambit:draft:present-pgn': '0',
    // The page stays silent; `seek` reports the landings and they are mixed below.
    'gambit:draft:move-sound': '0',
  };
  if (!opt.fen) delete drafts['gambit:draft:start-fen'];
  await page.send('Page.enable');
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `localStorage.clear(); for (const [k, v] of Object.entries(${JSON.stringify(drafts)})) localStorage.setItem(k, v);`,
  });
  const renderUrl = new URL(opt.url);
  renderUrl.searchParams.set('render', '');
  await page.send('Page.navigate', { url: renderUrl.href });
  await waitFor(
    page,
    `!!window.gambitRender && document.readyState === 'complete' &&
     document.fonts.status === 'loaded' && [...document.images].every((i) => i.complete)`,
    'the render view',
  );
  const appDuration = await page.evaluate('window.gambitRender.duration()');
  const full = Math.max(appDuration, opt.audio ? mediaDuration(opt.audio) : 0);
  const seconds = opt.until ? Math.min(full, Number(opt.until)) : full;
  const frames = Math.ceil(seconds * fps);
  // Frame the board and its subtitle strip, as the recordings' OBS crop did:
  // a small side margin, the board's top edge, and a little room below the strip.
  const clip = await page.evaluate(`(() => {
    const board = document.querySelector('.board').getBoundingClientRect();
    const strip = document.querySelector('.subtitle-strip').getBoundingClientRect();
    const even = (v) => Math.round(v * ${scale} / 2) * 2 / ${scale};
    const x = even(board.left - 6), y = even(board.top);
    return { x, y, width: even(board.right + 6) - x, height: even(strip.bottom + 10) - y, scale: 1 };
  })()`);
  console.error(
    `render-video: ${frames} frames (${seconds.toFixed(2)}s at ${fps}fps), ${clip.width * scale}x${clip.height * scale}`,
  );

  const silentVideo = join(work, 'video.mov');
  const encoder = spawn(
    'ffmpeg',
    [
      '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '14',
      '-vf', 'scale=out_color_matrix=bt709:out_range=tv', '-pix_fmt', 'yuv420p',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      silentVideo,
    ],
    { stdio: ['pipe', 'ignore', 'inherit'] },
  );
  const encoded = new Promise((ok, ko) =>
    encoder.on('exit', (code) => (code === 0 ? ok() : ko(new Error(`ffmpeg exited ${code}`)))),
  );

  const clickTimes = [];
  const started = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const landed = await page.evaluate(`window.gambitRender.seek(${t})`);
    if (landed && !opt['no-sfx']) clickTimes.push(t);
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, clip });
    if (!encoder.stdin.write(Buffer.from(data, 'base64'))) {
      await new Promise((r) => encoder.stdin.once('drain', r));
    }
    if (i % 300 === 299) {
      const rate = (i + 1) / ((Date.now() - started) / 1000);
      console.error(`render-video: ${i + 1}/${frames} frames, ${rate.toFixed(1)} fps`);
    }
  }
  encoder.stdin.end();
  await encoded;

  const inputs = ['-i', silentVideo];
  const mix = [];
  if (opt.audio) {
    inputs.push('-i', opt.audio);
    mix.push(`[${mix.length + 1}:a]aresample=${AUDIO_RATE}[a${mix.length}]`);
  }
  if (clickTimes.length) {
    const clicks = join(work, 'clicks.f32');
    await writeClickTrack(clickTimes, seconds, clicks);
    inputs.push('-f', 'f32le', '-ar', String(AUDIO_RATE), '-ac', '1', '-i', clicks);
    mix.push(`[${mix.length + 1}:a]anull[a${mix.length}]`);
  }
  const audioArgs = mix.length
    ? [
        '-filter_complex',
        `${mix.join(';')};${mix.map((_, i) => `[a${i}]`).join('')}amix=inputs=${mix.length}:normalize=0:duration=longest,aformat=channel_layouts=stereo[aout]`,
        '-map', '0:v', '-map', '[aout]', '-c:a', 'aac', '-b:a', '256k',
      ]
    : ['-map', '0:v'];
  await run('ffmpeg', ['-v', 'error', ...inputs, ...audioArgs, '-c:v', 'copy', '-t', String(frames / fps), opt.out]);
  const took = (Date.now() - started) / 1000;
  console.log(JSON.stringify({ out: resolve(opt.out), frames, seconds: frames / fps, clicks: clickTimes.length, renderSeconds: Math.round(took) }));
} finally {
  page.close();
  // Wait for the browser to exit: it keeps writing its profile until it does.
  const exited = new Promise((r) => browser.once('exit', r));
  browser.kill();
  await exited;
  await rm(work, { recursive: true, force: true, maxRetries: 3 });
}
