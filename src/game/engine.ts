import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ControlInput, HudSnapshot, LevelSpec } from './types';
import { FORKLIFT_MASS_TONS, LEVELS, STATION_Y } from './levels';
import { CargoItem, createCargoItem, resetCargoToSpawn, syncCargoMesh } from './cargo';
import { Forklift } from './forklift';
import { FunicularSystem } from './funicular';
import { WorldEnvironment } from './world';
import { OverheadCameraController } from './camera';
import { SoundEngine } from './audio';

interface UndoSnapshot {
  funicularProgress: number;
  tripCount: number;
  forkliftPos: THREE.Vector3;
  forkliftYaw: number;
  cargoStates: Array<{ id: string; pos: THREE.Vector3; rot: THREE.Quaternion }>;
}

const SAVE_KEY = 'forklifts_funiculars_completed_v1';

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  public readonly cameraCtrl: OverheadCameraController;
  public readonly sound: SoundEngine;

  private world!: RAPIER.World;
  private env!: WorldEnvironment;
  private funicular!: FunicularSystem;
  private forklift!: Forklift;
  private cargoList: CargoItem[] = [];

  public currentLevelIndex = 0;
  private currentLevel: LevelSpec = LEVELS[0];
  private damageCount = 0;
  private levelCompleted = false;
  private completedLevels = new Set<string>();
  private undoStack: UndoSnapshot[] = [];

  private physicsAccum = 0;
  private readonly fixedDt = 1 / 60;
  private paused = false;

  private readonly onToast: (msg: string, kind?: 'info' | 'error' | 'success') => void;
  private readonly onHudUpdate: (snap: HudSnapshot) => void;
  private hudTimer = 0;

  constructor(
    canvas: HTMLCanvasElement,
    onToast: (msg: string, kind?: 'info' | 'error' | 'success') => void,
    onHudUpdate: (snap: HudSnapshot) => void,
  ) {
    this.onToast = onToast;
    this.onHudUpdate = onHudUpdate;
    this.sound = new SoundEngine();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;

    this.scene = new THREE.Scene();
    this.cameraCtrl = new OverheadCameraController(window.innerWidth / window.innerHeight);

    this.loadSaveData();
  }

  public async init(): Promise<void> {
    await RAPIER.init();
    this.world = new RAPIER.World({ x: 0, y: -18.0, z: 0 });
    this.env = new WorldEnvironment(this.world, this.scene);
    this.funicular = new FunicularSystem(this.world, this.scene);
    this.forklift = new Forklift(
      this.world,
      this.scene,
      new THREE.Vector3(0, 0.55, 18.5),
      Math.PI,
    );

    this.loadLevel(0);
  }

  public loadLevel(index: number): void {
    const safeIdx = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    this.currentLevelIndex = safeIdx;
    this.currentLevel = LEVELS[safeIdx];
    this.damageCount = 0;
    this.levelCompleted = false;
    this.undoStack = [];

    // Remove previous cargo from physics & scene
    this.forklift.releaseCargo();
    for (const item of this.cargoList) {
      this.scene.remove(item.mesh);
      this.world.removeRigidBody(item.body);
    }
    this.cargoList = [];

    // Reset funicular parameters & position
    this.funicular.deltaMax = this.currentLevel.deltaMaxTons;
    this.funicular.maxCarLoad = this.currentLevel.maxCarLoadTons;
    this.funicular.reset(0);

    // Reset forklift
    const fs = this.currentLevel.forkliftStart;
    this.forklift.reset(new THREE.Vector3(fs.x, STATION_Y[fs.station] + 0.55, fs.z), fs.yaw);

    // Spawn drop zones and cargo
    this.env.setDropZones(this.currentLevel.dropZones);
    for (const cSpec of this.currentLevel.cargo) {
      this.cargoList.push(createCargoItem(cSpec, this.world, this.scene));
    }

    this.funicular.computeWeights(this.forklift, this.cargoList);
    this.emitHud();
    this.onToast(`Loaded ${this.currentLevel.name} (Max Balance Diff: ${this.currentLevel.deltaMaxTons}t)`, 'info');
  }

  public resetLevel(): void {
    this.loadLevel(this.currentLevelIndex);
  }

  public triggerDispatch(): void {
    this.sound.unlock();
    if (this.funicular.state === 'MOVING') return;

    // Save undo snapshot before dispatching so player can effortlessly experiment!
    const snapshot: UndoSnapshot = {
      funicularProgress: this.funicular.progress,
      tripCount: this.funicular.tripCount,
      forkliftPos: this.forklift.getPosition(),
      forkliftYaw: this.forklift.yaw,
      cargoStates: this.cargoList.map((c) => {
        const t = c.body.translation();
        const r = c.body.rotation();
        return {
          id: c.id,
          pos: new THREE.Vector3(t.x, t.y, t.z),
          rot: new THREE.Quaternion(r.x, r.y, r.z, r.w),
        };
      }),
    };

    const res = this.funicular.tryDispatch(this.forklift, this.cargoList);
    if (res.ok) {
      this.undoStack.push(snapshot);
      if (this.undoStack.length > 20) this.undoStack.shift();
      this.sound.playBell();
      this.onToast(res.message, 'info');
    } else {
      this.sound.playOverload();
      this.onToast(res.message, 'error');
    }
    this.emitHud();
  }

  public undoLastTrip(): void {
    if (this.funicular.state === 'MOVING') {
      this.onToast('Wait for funicular to dock before undoing.', 'info');
      return;
    }
    const snap = this.undoStack.pop();
    if (!snap) {
      this.onToast('No previous trip to undo — use Reset to restart level.', 'info');
      return;
    }

    this.forklift.releaseCargo();
    this.funicular.reset(snap.funicularProgress);
    this.funicular.tripCount = snap.tripCount;
    this.forklift.reset(snap.forkliftPos, snap.forkliftYaw);

    for (const saved of snap.cargoStates) {
      const item = this.cargoList.find((c) => c.id === saved.id);
      if (!item) continue;
      item.carried = false;
      item.ridingCar = null;
      item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      item.body.setTranslation(saved.pos, true);
      item.body.setRotation(saved.rot, true);
      item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      syncCargoMesh(item);
    }

    this.onToast('Rewound to before last funicular trip.', 'info');
    this.emitHud();
  }

  public toggleDeckLock(): void {
    if (this.funicular.state === 'MOVING' && this.forklift.ridingCar !== null) return;
    const locked = this.forklift.toggleDeckLock();
    this.sound.playLock(locked);
    this.emitHud();
  }

  public honkHorn(): void {
    this.sound.playHorn();
    // Convenience: if parked & deck-locked on a funicular car, horn also rings departure bell!
    if (this.forklift.deckLocked && this.funicular.state !== 'MOVING') {
      const fp = this.forklift.getPosition();
      const onA = this.funicular.isPointOnCar(this.funicular.carA, fp.x, fp.y, fp.z, -0.15);
      const onB = this.funicular.isPointOnCar(this.funicular.carB, fp.x, fp.y, fp.z, -0.15);
      if (onA || onB) {
        this.triggerDispatch();
      }
    }
  }

  public recoverForklift(): void {
    if (this.funicular.state === 'MOVING' && this.forklift.ridingCar !== null) return;
    this.forklift.recoverToNearestSafeSpot();
    this.onToast('Recovered forklift onto nearest safe station dock.', 'info');
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      this.sound.updateContinuous(0, false, false);
    }
  }

  public resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.cameraCtrl.resize(window.innerWidth / window.innerHeight);
  }

  public tick(dt: number, input: ControlInput): void {
    if (this.paused) return;
    const clampedDt = Math.min(dt, 0.05);
    this.physicsAccum += clampedDt;

    while (this.physicsAccum >= this.fixedDt) {
      this.stepSimulation(this.fixedDt, input);
      this.physicsAccum -= this.fixedDt;
    }

    // Smooth 3/4 overhead camera & rendering
    this.cameraCtrl.update(
      clampedDt,
      this.forklift.getPosition(),
      this.forklift.getForward(),
      this.funicular.state === 'MOVING',
    );
    this.renderer.render(this.scene, this.cameraCtrl.camera);

    // Continuous Web Audio foley
    this.sound.updateContinuous(
      Math.abs(this.forklift.speed) / 6.4,
      Math.abs(input.lift) > 0.1 || Math.abs(input.tilt) > 0.1,
      this.funicular.state === 'MOVING',
    );

    // Throttled HUD updates (~15 Hz)
    this.hudTimer += clampedDt;
    if (this.hudTimer >= 0.065) {
      this.hudTimer = 0;
      this.emitHud();
    }
  }

  private stepSimulation(dt: number, input: ControlInput): void {
    // 1. Update forklift controls & pallet handling
    this.forklift.update(
      dt,
      input,
      this.cargoList,
      this.funicular.state === 'MOVING',
      () => this.sound.playClack(),
    );

    // 2. Update funicular movement & platform coupling
    const justArrived = this.funicular.update(dt, this.forklift, this.cargoList);
    if (justArrived) {
      this.sound.playBell();
      this.onToast('Funicular docked — ramps open!', 'success');
    }

    // 3. Step Rapier3D physics
    this.world.timestep = dt;
    this.world.step();

    // 4. Sync meshes, check out-of-bounds / fragile impacts, weighbridges, and drop zones
    const fp = this.forklift.getPosition();
    if (fp.y < -4) {
      this.forklift.recoverToNearestSafeSpot();
      this.onToast('Forklift recovered from cliff!', 'error');
    }

    for (const item of this.cargoList) {
      syncCargoMesh(item);
      const p = item.body.translation();

      // Out-of-bounds safety respawn
      if (p.y < -4) {
        resetCargoToSpawn(item);
        this.onToast(`${item.label} fell off dock — respawned at bay.`, 'error');
        continue;
      }

      // Fragile cargo hard-drop detection
      if (item.kind === 'fragile' && !item.carried && item.ridingCar === null) {
        const velY = item.body.linvel().y;
        if (velY < -1.2) {
          item.wasAirborne = true;
          item.peakFallY = Math.max(item.peakFallY, p.y);
        } else if (item.wasAirborne && Math.abs(velY) < 0.25) {
          const dropDist = item.peakFallY - p.y;
          item.wasAirborne = false;
          item.peakFallY = p.y;
          if (dropDist > 1.15) {
            this.damageCount += 1;
            this.sound.playBreak();
            resetCargoToSpawn(item);
            this.onToast(`${item.label} shattered from a rough drop! Respawned at origin.`, 'error');
          }
        }
      }
    }

    // 5. Update funicular counterweight gauges
    this.funicular.computeWeights(this.forklift, this.cargoList);

    // 6. Update station weighbridges
    for (const wb of this.env.weighbridges) {
      let tons = 0;
      if (
        Math.abs(fp.x - wb.x) <= wb.halfW &&
        Math.abs(fp.z - wb.z) <= wb.halfD &&
        Math.abs(fp.y - (wb.y + 0.5)) < 1.5
      ) {
        tons += FORKLIFT_MASS_TONS;
        if (this.forklift.carriedCargo) tons += this.forklift.carriedCargo.massTons;
      }
      for (const item of this.cargoList) {
        if (item.carried) continue;
        const p = item.body.translation();
        if (
          Math.abs(p.x - wb.x) <= wb.halfW &&
          Math.abs(p.z - wb.z) <= wb.halfD &&
          Math.abs(p.y - (wb.y + item.halfExtents.y)) < 1.6
        ) {
          tons += item.massTons;
        }
      }
      this.env.updateWeighbridge(wb, tons);
    }

    // 7. Check delivery drop zones & level completion
    this.evaluateDeliveries();
  }

  private evaluateDeliveries(): void {
    const manifestItems = this.cargoList.filter((c) => c.targetZoneId !== undefined);
    const claimedZones = new Set<string>();
    let newlyDelivered = false;

    for (const item of manifestItems) {
      const wasDelivered = item.delivered;
      item.delivered = false;
      if (item.carried || item.ridingCar !== null) continue;

      const p = item.body.translation();
      // Match any compatible unsatisfied drop zone on the right station
      for (const zone of this.env.activeDropZones) {
        if (claimedZones.has(zone.spec.id)) continue;
        if (zone.spec.acceptsKind !== item.kind) continue;

        const inX = Math.abs(p.x - zone.spec.x) <= zone.spec.width / 2 + 0.15;
        const inZ = Math.abs(p.z - zone.spec.z) <= zone.spec.depth / 2 + 0.15;
        const inY = Math.abs(p.y - (zone.y + item.halfExtents.y)) <= 1.2;

        if (inX && inZ && inY) {
          item.delivered = true;
          claimedZones.add(zone.spec.id);
          if (!wasDelivered) newlyDelivered = true;
          break;
        }
      }
    }

    for (const zone of this.env.activeDropZones) {
      this.env.setDropZoneSatisfied(zone, claimedZones.has(zone.spec.id));
    }

    if (newlyDelivered) {
      this.sound.playDeliver();
    }

    if (
      !this.levelCompleted &&
      manifestItems.length > 0 &&
      manifestItems.every((c) => c.delivered)
    ) {
      this.levelCompleted = true;
      this.completedLevels.add(this.currentLevel.id);
      this.saveData();
      this.sound.playVictory();
      this.emitHud();
    }
  }

  private emitHud(): void {
    const diff = Math.abs(this.funicular.carAMass - this.funicular.carBMass);
    const balanced =
      diff <= this.funicular.deltaMax &&
      this.funicular.carAMass <= this.funicular.maxCarLoad &&
      this.funicular.carBMass <= this.funicular.maxCarLoad;

    const carAStation =
      this.funicular.state === 'MOVING'
        ? 'IN TRANSIT'
        : this.funicular.state === 'LOWER_DOCKED'
          ? 'LOWER'
          : 'UPPER';
    const carBStation =
      this.funicular.state === 'MOVING'
        ? 'IN TRANSIT'
        : this.funicular.state === 'LOWER_DOCKED'
          ? 'UPPER'
          : 'LOWER';

    const manifest = this.cargoList
      .filter((c) => c.targetZoneId !== undefined)
      .map((c) => {
        const z = this.currentLevel.dropZones.find((dz) => dz.id === c.targetZoneId);
        return {
          id: c.id,
          label: c.label,
          massTons: c.massTons,
          targetLabel: z ? `${z.station === 'upper' ? '↑' : '↓'} ${z.label}` : 'Drop Zone',
          delivered: c.delivered,
        };
      });

    this.onHudUpdate({
      levelIndex: this.currentLevelIndex,
      levelName: this.currentLevel.name,
      levelSubtitle: this.currentLevel.subtitle,
      trips: this.funicular.tripCount,
      parTrips: this.currentLevel.parTrips,
      damageCount: this.damageCount,
      carAMass: this.funicular.carAMass,
      carBMass: this.funicular.carBMass,
      diffMass: diff,
      deltaMax: this.funicular.deltaMax,
      maxCarLoad: this.funicular.maxCarLoad,
      balanced,
      funicularState: this.funicular.state,
      carAStation,
      carBStation,
      forkHeight: this.forklift.forkHeight,
      mastTiltDeg: Math.round(THREE.MathUtils.radToDeg(this.forklift.mastTilt)),
      deckLocked: this.forklift.deckLocked,
      carryingLabel: this.forklift.carriedCargo
        ? `${this.forklift.carriedCargo.label} (${this.forklift.carriedCargo.massTons}t)`
        : null,
      overviewMode: this.cameraCtrl.overviewMode,
      manifest,
      completed: this.levelCompleted,
      completedLevels: Array.from(this.completedLevels),
    });
  }

  private loadSaveData(): void {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          parsed.forEach((id) => this.completedLevels.add(id));
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }

  private saveData(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(Array.from(this.completedLevels)));
    } catch {
      // Ignore storage restrictions
    }
  }
}
