import './style.css';
import { GameEngine } from './game/engine';
import { LEVELS } from './game/levels';
import { ControlInput, HudSnapshot } from './game/types';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
const levelTabsEl = document.getElementById('level-tabs') as HTMLDivElement;
const balanceStatusEl = document.getElementById('balance-status') as HTMLSpanElement;
const carAMassEl = document.getElementById('car-a-mass') as HTMLElement;
const carBMassEl = document.getElementById('car-b-mass') as HTMLElement;
const carAPosEl = document.getElementById('car-a-pos') as HTMLElement;
const carBPosEl = document.getElementById('car-b-pos') as HTMLElement;
const diffMassEl = document.getElementById('diff-mass') as HTMLElement;
const levelTitleEl = document.getElementById('level-title') as HTMLElement;
const levelSubtitleEl = document.getElementById('level-subtitle') as HTMLElement;
const tripCounterEl = document.getElementById('trip-counter') as HTMLElement;
const manifestListEl = document.getElementById('manifest-list') as HTMLUListElement;
const hudForkHeightEl = document.getElementById('hud-fork-height') as HTMLElement;
const hudMastTiltEl = document.getElementById('hud-mast-tilt') as HTMLElement;
const hudBrakeEl = document.getElementById('hud-brake') as HTMLElement;
const chipBrakeEl = document.getElementById('chip-brake') as HTMLElement;
const hudLoadEl = document.getElementById('hud-load') as HTMLElement;
const chipLoadEl = document.getElementById('chip-load') as HTMLElement;
const toastContainer = document.getElementById('toast-container') as HTMLDivElement;

const btnDispatch = document.getElementById('btn-dispatch') as HTMLButtonElement;
const btnOverview = document.getElementById('btn-overview') as HTMLButtonElement;
const btnRotateCam = document.getElementById('btn-rotate-cam') as HTMLButtonElement;
const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnSound = document.getElementById('btn-sound') as HTMLButtonElement;

const victoryModal = document.getElementById('victory-modal') as HTMLDivElement;
const victoryTitle = document.getElementById('victory-title') as HTMLElement;
const victorySummary = document.getElementById('victory-summary') as HTMLElement;
const victoryStats = document.getElementById('victory-stats') as HTMLElement;
const btnReplay = document.getElementById('btn-replay') as HTMLButtonElement;
const btnNextLevel = document.getElementById('btn-next-level') as HTMLButtonElement;

function showToast(message: string, kind: 'info' | 'error' | 'success' = 'info'): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.25s ease';
    setTimeout(() => el.remove(), 260);
  }, 3400);
}

let victoryShownForLevel = -1;

function renderHud(snap: HudSnapshot): void {
  // Level tabs
  if (levelTabsEl.childElementCount !== LEVELS.length) {
    levelTabsEl.innerHTML = '';
    LEVELS.forEach((_lvl, idx) => {
      const btn = document.createElement('button');
      btn.className = 'level-tab';
      btn.dataset.idx = String(idx);
      btn.addEventListener('click', () => {
        victoryShownForLevel = -1;
        victoryModal.classList.add('hidden');
        engine.loadLevel(idx);
      });
      levelTabsEl.appendChild(btn);
    });
  }
  Array.from(levelTabsEl.children).forEach((child, idx) => {
    const btn = child as HTMLButtonElement;
    const lvl = LEVELS[idx];
    const isDone = snap.completedLevels.includes(lvl.id);
    btn.classList.toggle('active', idx === snap.levelIndex);
    btn.innerHTML = `<span>${lvl.name}</span>${isDone ? '<span class="done-badge">✓</span>' : ''}`;
  });

  // Counterweight balance panel
  carAMassEl.textContent = `${snap.carAMass}t`;
  carBMassEl.textContent = `${snap.carBMass}t`;
  carAPosEl.textContent = snap.carAStation;
  carBPosEl.textContent = snap.carBStation;
  diffMassEl.textContent = `${snap.diffMass}t / ${snap.deltaMax}t`;

  if (snap.funicularState === 'MOVING') {
    balanceStatusEl.textContent = 'IN TRANSIT';
    balanceStatusEl.className = 'balance-status moving';
    btnDispatch.disabled = true;
  } else if (snap.balanced) {
    balanceStatusEl.textContent = 'BALANCED';
    balanceStatusEl.className = 'balance-status ok';
    btnDispatch.disabled = false;
  } else {
    balanceStatusEl.textContent = 'OVERLOAD';
    balanceStatusEl.className = 'balance-status overload';
    btnDispatch.disabled = false; // Allow click so player hears buzzer + sees exact reason
  }

  btnOverview.textContent = snap.overviewMode ? '🎯 Follow Cam' : '🗺 Overview';

  // Manifest panel
  levelTitleEl.textContent = snap.levelName;
  levelSubtitleEl.textContent = snap.levelSubtitle;
  tripCounterEl.textContent = `Trips: ${snap.trips} (Par ${snap.parTrips})`;

  manifestListEl.innerHTML = '';
  for (const item of snap.manifest) {
    const li = document.createElement('li');
    li.className = `manifest-item${item.delivered ? ' delivered' : ''}`;
    li.innerHTML = `<span>${item.delivered ? '✓ ' : ''}${item.label} (${item.massTons}t)</span><span class="tag">${item.targetLabel}</span>`;
    manifestListEl.appendChild(li);
  }

  // Forklift telemetry
  hudForkHeightEl.textContent = `${snap.forkHeight.toFixed(2)}m`;
  hudMastTiltEl.textContent = `${snap.mastTiltDeg}°`;
  hudBrakeEl.textContent = snap.deckLocked ? 'LOCKED' : 'OFF';
  chipBrakeEl.classList.toggle('active', snap.deckLocked);
  hudLoadEl.textContent = snap.carryingLabel ?? 'EMPTY';
  chipLoadEl.classList.toggle('active', snap.carryingLabel !== null);

  // Victory Modal
  if (snap.completed && victoryShownForLevel !== snap.levelIndex) {
    victoryShownForLevel = snap.levelIndex;
    victoryTitle.textContent = `${snap.levelName} Complete!`;
    const isLast = snap.levelIndex >= LEVELS.length - 1;
    victorySummary.textContent = isLast
      ? 'All vertical slice alpine deliveries completed! Feel free to replay for par trips or explore freely.'
      : 'Every crate delivered safely. Ready for the next alpine logistics puzzle?';
    victoryStats.innerHTML = `
      <div class="v-stat"><span>TRIPS</span><strong>${snap.trips} / ${snap.parTrips}</strong></div>
      <div class="v-stat"><span>DAMAGE</span><strong>${snap.damageCount}</strong></div>
      <div class="v-stat"><span>RATING</span><strong>${snap.damageCount === 0 && snap.trips <= snap.parTrips ? '★★★' : snap.damageCount === 0 ? '★★☆' : '★☆☆'}</strong></div>
    `;
    btnNextLevel.textContent = isLast ? 'Replay From Level 1 ▶' : 'Next Level ▶';
    victoryModal.classList.remove('hidden');
  }
}

const engine = new GameEngine(canvas, showToast, renderHud);

// Keyboard & Gamepad input state
const keys = new Set<string>();
const prevPadButtons = new Map<number, boolean>();

window.addEventListener('keydown', (e) => {
  engine.sound.unlock();
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) {
    e.preventDefault();
  }
  if (e.repeat) return;
  keys.add(e.code);

  switch (e.code) {
    case 'Space':
      engine.toggleDeckLock();
      break;
    case 'KeyG':
    case 'Enter':
      engine.triggerDispatch();
      break;
    case 'KeyH':
      engine.honkHorn();
      break;
    case 'Tab':
      engine.cameraCtrl.toggleOverview();
      break;
    case 'KeyZ':
      engine.cameraCtrl.rotateStep(-1);
      break;
    case 'KeyC':
      engine.cameraCtrl.rotateStep(1);
      break;
    case 'Backspace':
      engine.undoLastTrip();
      break;
    case 'KeyU':
      engine.recoverForklift();
      break;
    case 'KeyM': {
      const muted = engine.sound.toggleMute();
      btnSound.textContent = muted ? '🔇' : '🔊';
      break;
    }
    case 'KeyR':
      if (e.shiftKey) {
        victoryShownForLevel = -1;
        victoryModal.classList.add('hidden');
        engine.resetLevel();
      }
      break;
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

// Mouse right-click drag orbit & wheel zoom
let draggingOrbit = false;
let lastMouseX = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  engine.sound.unlock();
  if (e.button === 2 || e.button === 0) {
    draggingOrbit = true;
    lastMouseX = e.clientX;
  }
});
window.addEventListener('pointermove', (e) => {
  if (!draggingOrbit) return;
  const dx = e.clientX - lastMouseX;
  lastMouseX = e.clientX;
  engine.cameraCtrl.dragOrbit(dx);
});
window.addEventListener('pointerup', () => {
  draggingOrbit = false;
});
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    engine.cameraCtrl.zoom(e.deltaY);
  },
  { passive: false },
);

// HUD button hooks
btnDispatch.addEventListener('click', () => engine.triggerDispatch());
btnOverview.addEventListener('click', () => engine.cameraCtrl.toggleOverview());
btnRotateCam.addEventListener('click', () => engine.cameraCtrl.rotateStep(1));
btnUndo.addEventListener('click', () => engine.undoLastTrip());
btnReset.addEventListener('click', () => {
  victoryShownForLevel = -1;
  victoryModal.classList.add('hidden');
  engine.resetLevel();
});
btnSound.addEventListener('click', () => {
  const muted = engine.sound.toggleMute();
  btnSound.textContent = muted ? '🔇' : '🔊';
});
btnReplay.addEventListener('click', () => {
  victoryShownForLevel = -1;
  victoryModal.classList.add('hidden');
  engine.resetLevel();
});
btnNextLevel.addEventListener('click', () => {
  victoryShownForLevel = -1;
  victoryModal.classList.add('hidden');
  engine.loadLevel((engine.currentLevelIndex + 1) % LEVELS.length);
});

window.addEventListener('resize', () => engine.resize());
document.addEventListener('visibilitychange', () => engine.setPaused(document.hidden));

function readInput(): ControlInput {
  let throttle = 0;
  let steer = 0;
  let lift = 0;
  let tilt = 0;
  let crawl = keys.has('ShiftLeft') || keys.has('ShiftRight');

  if (keys.has('KeyW')) throttle += 1;
  if (keys.has('KeyS')) throttle -= 1;
  if (keys.has('KeyA')) steer += 1;
  if (keys.has('KeyD')) steer -= 1;

  if (keys.has('KeyR') && !crawl) lift += 1;
  if (keys.has('ArrowUp')) lift += 1;
  if (keys.has('KeyF') || keys.has('ArrowDown')) lift -= 1;

  if (keys.has('KeyQ')) tilt -= 1;
  if (keys.has('KeyE')) tilt += 1;

  // Poll HTML5 Gamepad API if connected
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads[0];
  if (pad) {
    const dead = (v: number) => (Math.abs(v) < 0.14 ? 0 : v);
    const lx = dead(pad.axes[0] ?? 0);
    const ry = dead(pad.axes[3] ?? 0);
    const rt = pad.buttons[7]?.value ?? 0;
    const lt = pad.buttons[6]?.value ?? 0;
    if (Math.abs(rt - lt) > 0.08) throttle = rt - lt;
    if (lx !== 0) steer = -lx;
    if (ry !== 0) lift = -ry;
    if (pad.buttons[4]?.pressed) crawl = true; // LB
    if (pad.buttons[12]?.pressed) tilt = -1; // D-pad up
    if (pad.buttons[13]?.pressed) tilt = 1; // D-pad down

    const justPressed = (idx: number) => {
      const cur = Boolean(pad.buttons[idx]?.pressed);
      const prev = prevPadButtons.get(idx) ?? false;
      prevPadButtons.set(idx, cur);
      return cur && !prev;
    };
    if (justPressed(1)) engine.toggleDeckLock(); // B
    if (justPressed(2)) engine.honkHorn(); // X
    if (justPressed(5)) engine.triggerDispatch(); // RB
    if (justPressed(8)) engine.cameraCtrl.toggleOverview(); // Select
    if (justPressed(14)) engine.cameraCtrl.rotateStep(-1); // D-pad left
    if (justPressed(15)) engine.cameraCtrl.rotateStep(1); // D-pad right
  }

  return { throttle, steer, crawl, lift, tilt };
}

async function start(): Promise<void> {
  await engine.init();
  loadingOverlay.classList.add('fade-out');
  setTimeout(() => loadingOverlay.remove(), 400);

  let lastTime = performance.now();
  const loop = (now: number) => {
    const dt = (now - lastTime) / 1000;
    lastTime = now;
    engine.tick(dt, readInput());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void start();
