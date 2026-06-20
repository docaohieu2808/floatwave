// Sleep timer — pick a duration (or "end of track") to fade the music out and
// pause it, for falling asleep to music without it playing all night. Session
// only (not persisted): you arm it when you go to bed. On fire it ramps the
// volume to 0 over a few seconds (gentler than an abrupt cut), pauses, then
// restores the volume so the next play is back to normal.
import { els } from './ui-elements.js';
import * as player from './playback-router.js';

const OPTIONS = [
  { label: 'Off', min: 0 },
  { label: '5 minutes', min: 5 },
  { label: '10 minutes', min: 10 },
  { label: '15 minutes', min: 15 },
  { label: '20 minutes', min: 20 },
  { label: '30 minutes', min: 30 },
  { label: '45 minutes', min: 45 },
  { label: '60 minutes', min: 60 },
  { label: 'End of track', min: -1 }, // stop when the CURRENT track finishes
];

const FADE_MS = 5000;
const FADE_STEPS = 25;

let fireTimer = null; // setTimeout to the fire moment
let tickTimer = null; // interval that refreshes the remaining-time tooltip
let endAt = 0; // ms timestamp when a duration timer fires
let endOfTrack = false; // true while "End of track" is armed
let currentMin = 0; // the armed option (for menu highlight); 0 = off

function disarm() {
  clearTimeout(fireTimer);
  clearInterval(tickTimer);
  fireTimer = tickTimer = null;
  endAt = 0;
  endOfTrack = false;
  currentMin = 0;
  els.btnSleep.classList.remove('active');
  els.btnSleep.title = 'Sleep timer';
}

function refreshTooltip() {
  if (!endAt) return;
  const left = Math.max(0, Math.ceil((endAt - Date.now()) / 60000));
  els.btnSleep.title = `Sleep timer — ${left} min left`;
}

async function fadeOutAndPause() {
  const original = Number(els.volume.value) || 0;
  for (let i = 1; i <= FADE_STEPS; i += 1) {
    player.setVolume(Math.round(original * (1 - i / FADE_STEPS)));
    await new Promise((r) => setTimeout(r, FADE_MS / FADE_STEPS));
  }
  player.pause();
  player.setVolume(original); // paused → silent; volume restored for the next play
}

function fire() {
  disarm();
  fadeOutAndPause();
}

function arm(min) {
  disarm();
  if (min === 0) return; // "Off"
  currentMin = min;
  els.btnSleep.classList.add('active');
  if (min === -1) {
    endOfTrack = true;
    els.btnSleep.title = 'Sleep timer — stops after this track';
    return;
  }
  endAt = Date.now() + min * 60000;
  fireTimer = setTimeout(fire, min * 60000);
  tickTimer = setInterval(refreshTooltip, 15000);
  refreshTooltip();
}

// The queue ENDED handler asks this first: true → "stop here, don't play next".
export function consumeEndOfTrack() {
  if (!endOfTrack) return false;
  disarm();
  return true;
}

function highlight() {
  for (const item of els.sleepMenu.querySelectorAll('.sleep-opt')) {
    item.classList.toggle('active', currentMin !== 0 && Number(item.dataset.min) === currentMin);
  }
}

function openMenu() {
  highlight();
  const menu = els.sleepMenu;
  menu.classList.remove('hidden');
  // anchor under the clock button, clamped inside the window
  const r = els.btnSleep.getBoundingClientRect();
  const left = Math.min(
    Math.max(4, Math.round(r.right - menu.offsetWidth)),
    window.innerWidth - menu.offsetWidth - 4
  );
  menu.style.top = `${Math.round(r.bottom + 2)}px`;
  menu.style.left = `${left}px`;
}

function closeMenu() {
  els.sleepMenu.classList.add('hidden');
}

export function initSleepTimer() {
  const menu = els.sleepMenu;
  for (const opt of OPTIONS) {
    const item = document.createElement('button');
    item.className = 'sleep-opt';
    item.textContent = opt.label;
    item.dataset.min = String(opt.min);
    item.addEventListener('click', () => {
      arm(opt.min);
      closeMenu();
    });
    menu.appendChild(item);
  }
  els.btnSleep.addEventListener('click', (event) => {
    event.stopPropagation(); // don't let the document handler close it immediately
    if (menu.classList.contains('hidden')) openMenu();
    else closeMenu();
  });
  // click outside / Esc dismiss
  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('hidden') && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}
