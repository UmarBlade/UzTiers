// Ko'rinish sozlamalari va tovushlar. Sozlamalar faqat shu brauzerda saqlanadi.
import { storageGet, storageSet } from './core.js';

// v: 2 — mytiers uslubi. Eski mavzu va shrift tanlovlari bir marta tozalanadi, hamma yangi ko'rinishni oladi.
const LOOK_VERSION = 2;
const DEFAULTS = { v: LOOK_VERSION, size: 'normal', font: 'golos', motion: 'on', sound: true, volume: 40 };
export const FONTS = [['golos', 'Golos Text'], ['onest', 'Onest'], ['system', 'Tizim shrifti']];

let current = null;
export function getLook() {
  if (current) return current;
  let saved = {};
  try { saved = JSON.parse(storageGet('uzp_look') || '{}') || {}; } catch { saved = {}; }
  if (saved.v !== LOOK_VERSION) {
    delete saved.theme;
    delete saved.font;
  }
  current = { ...DEFAULTS, ...saved, v: LOOK_VERSION };
  if (!FONTS.some(([id]) => id === current.font)) current.font = DEFAULTS.font;
  return current;
}
export function applyLook() {
  const look = getLook();
  const root = document.documentElement;
  delete root.dataset.theme;
  root.dataset.size = look.size;
  root.dataset.font = look.font;
  root.dataset.motion = look.motion;
}
export function setLook(changes) {
  current = { ...getLook(), ...changes, v: LOOK_VERSION };
  storageSet('uzp_look', JSON.stringify(current));
  applyLook();
  return current;
}

// ---------- tovushlar: fayl kerak emas, brauzerning o'zida hosil qilinadi ----------
let audio = null;
function ctx() {
  if (!audio) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audio = new Ctor();
  }
  if (audio.state === 'suspended') audio.resume().catch(() => {});
  return audio;
}
function note(ac, { freq, to = null, at = 0, length = 0.12, type = 'sine', gain = 0.2 }) {
  const master = (getLook().volume || 0) / 100;
  const start = ac.currentTime + at;
  const osc = ac.createOscillator();
  const amp = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + length);
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(Math.max(gain * master, 0.0002), start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}
const SOUNDS = {
  ok: ac => { note(ac, { freq: 660, length: 0.1, gain: 0.14 }); note(ac, { freq: 990, at: 0.09, length: 0.16, gain: 0.14 }); },
  bad: ac => { note(ac, { freq: 210, to: 140, length: 0.2, type: 'triangle', gain: 0.2 }); },
  msg: ac => { note(ac, { freq: 880, to: 1040, length: 0.09, gain: 0.12 }); },
  dm: ac => { note(ac, { freq: 780, length: 0.08, gain: 0.13 }); note(ac, { freq: 1170, at: 0.1, length: 0.13, gain: 0.13 }); },
  bell: ac => { note(ac, { freq: 1320, length: 0.28, gain: 0.1 }); note(ac, { freq: 1980, at: 0.02, length: 0.22, gain: 0.05 }); }
};
export function sfx(name) {
  if (!getLook().sound || !SOUNDS[name]) return;
  try {
    const ac = ctx();
    if (ac) SOUNDS[name](ac);
  } catch { /* tovush chiqmasa ham ishlayveradi */ }
}
