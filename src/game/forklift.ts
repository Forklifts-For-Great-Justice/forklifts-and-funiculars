import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ControlInput } from './types';
import { CargoItem, syncCargoMesh } from './cargo';
import { STATION_Y } from './levels';

const MIN_FORK_H = 0.07;
const MAX_FORK_H = 2.45;
const MIN_TILT = -0.14; // tilt back (cradle)
const MAX_TILT = 0.17; // tilt forward (unloading)

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export class Forklift {
  public readonly body: RAPIER.RigidBody;
  public readonly collider: RAPIER.Collider;
  public readonly root: THREE.Group;

  private readonly chassisTiltGroup: THREE.Group;
  private readonly mastPivot: THREE.Group;
  private readonly forkCarriage: THREE.Group;
  private readonly rearWheels: THREE.Group[] = [];
  private readonly frontWheels: THREE.Mesh[] = [];
  private readonly brakeLampMat: THREE.MeshStandardMaterial;
  private readonly reticleGroup: THREE.Group;
  private readonly reticleRingMat: THREE.MeshBasicMaterial;
  private readonly alignGlowMesh: THREE.Mesh;

  public yaw = Math.PI;
  public speed = 0;
  public steerAngle = 0;
  public forkHeight = 0.09;
  public mastTilt = 0;
  public deckLocked = false;
  public ridingCar: 'A' | 'B' | null = null;
  public carriedCargo: CargoItem | null = null;
  public carriedOffset = new THREE.Vector3();
  public carriedYawOffset = 0;

  private spawnPos = new THREE.Vector3(0, 0.55, 18.5);
  private spawnYaw = Math.PI;
  private wheelSpin = 0;
  private pickupCooldown = 0;

  constructor(world: RAPIER.World, scene: THREE.Scene, startPos: THREE.Vector3, startYaw: number) {
    this.spawnPos.copy(startPos);
    this.spawnYaw = startYaw;
    this.yaw = startYaw;

    // Dynamic chassis body with locked X/Z rotation for crisp arcade-tactile stability
    // (subtle body roll/pitch is rendered visually on chassisTiltGroup)
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(startPos.x, startPos.y, startPos.z)
      .lockRotations()
      .setLinearDamping(3.0)
      .setCanSleep(false);

    this.body = world.createRigidBody(bodyDesc);
    const qInit = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), startYaw);
    this.body.setRotation({ x: qInit.x, y: qInit.y, z: qInit.z, w: qInit.w }, true);

    // Main chassis collider: width 1.46m, height 1.0m, length 2.1m (bottom at y - 0.50)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(0.73, 0.5, 1.05)
      .setDensity(1.4)
      .setFriction(0.6)
      .setRestitution(0.0);
    this.collider = world.createCollider(colliderDesc, this.body);

    // Build stylized low-poly industrial yellow forklift
    this.root = new THREE.Group();
    this.chassisTiltGroup = new THREE.Group();
    this.root.add(this.chassisTiltGroup);

    const yellowMat = new THREE.MeshStandardMaterial({
      color: 0xf4b41a,
      roughness: 0.45,
      metalness: 0.12,
      flatShading: true,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x262d36,
      roughness: 0.55,
      metalness: 0.45,
      flatShading: true,
    });
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1b1e22,
      roughness: 0.9,
      flatShading: true,
    });
    const hubMat = new THREE.MeshStandardMaterial({
      color: 0xd9dee4,
      roughness: 0.4,
      metalness: 0.5,
    });
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3b2d23, roughness: 0.85 });

    // Lower chassis frame (local +Z is FORWARD toward the forks)
    const bodyBase = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.52, 1.95), yellowMat);
    bodyBase.position.set(0, -0.04, -0.1);
    bodyBase.castShadow = true;
    bodyBase.receiveShadow = true;
    this.chassisTiltGroup.add(bodyBase);

    // Rounded rear counterweight block
    const counterweight = new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.62, 0.62), darkSteelMat);
    counterweight.position.set(0, 0.04, -0.92);
    counterweight.castShadow = true;
    this.chassisTiltGroup.add(counterweight);

    const cwCap = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.24, 0.52), yellowMat);
    cwCap.position.set(0, 0.44, -0.88);
    cwCap.castShadow = true;
    this.chassisTiltGroup.add(cwCap);

    // Cab floor + operator seat + steering wheel
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.42, 0.52), seatMat);
    seat.position.set(0, 0.44, -0.35);
    seat.castShadow = true;
    this.chassisTiltGroup.add(seat);

    const steerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.65, 8), darkSteelMat);
    steerCol.position.set(0, 0.48, 0.35);
    steerCol.rotation.x = -0.35;
    this.chassisTiltGroup.add(steerCol);

    const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 6, 14), darkSteelMat);
    steerWheel.position.set(0, 0.76, 0.22);
    steerWheel.rotation.x = Math.PI / 2 - 0.35;
    this.chassisTiltGroup.add(steerWheel);

    // Operator (cute low-poly hardhat driver)
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.24, 0.48, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f6ba8, roughness: 0.7 }),
    );
    torso.position.set(0, 0.78, -0.26);
    torso.castShadow = true;
    this.chassisTiltGroup.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0xf0c29e, roughness: 0.7 }),
    );
    head.position.set(0, 1.12, -0.24);
    head.castShadow = true;
    this.chassisTiltGroup.add(head);

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58),
      new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: 0.35 }),
    );
    helmet.position.set(0, 1.14, -0.24);
    helmet.castShadow = true;
    this.chassisTiltGroup.add(helmet);

    // Overhead ROPS roll cage
    const pillarPositions: [number, number][] = [
      [-0.58, 0.58],
      [0.58, 0.58],
      [-0.58, -0.68],
      [0.58, -0.68],
    ];
    for (const [px, pz] of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.32, 0.08), darkSteelMat);
      pillar.position.set(px, 0.88, pz);
      pillar.castShadow = true;
      this.chassisTiltGroup.add(pillar);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.08, 1.34), darkSteelMat);
    roof.position.set(0, 1.54, -0.05);
    roof.castShadow = true;
    this.chassisTiltGroup.add(roof);

    // Amber beacon + deck-lock status lamp on roof
    this.brakeLampMat = new THREE.MeshStandardMaterial({
      color: 0xffaa22,
      emissive: 0xaa5500,
      emissiveIntensity: 0.9,
      roughness: 0.25,
    });
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.16, 10), this.brakeLampMat);
    beacon.position.set(0, 1.64, -0.42);
    this.chassisTiltGroup.add(beacon);

    // Front drive wheels (larger)
    const wheelGeoF = new THREE.CylinderGeometry(0.32, 0.32, 0.24, 14);
    wheelGeoF.rotateZ(Math.PI / 2);
    for (const side of [-0.74, 0.74]) {
      const wheel = new THREE.Mesh(wheelGeoF, tireMat);
      wheel.position.set(side, -0.18, 0.62);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.26, 8), hubMat);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      this.chassisTiltGroup.add(wheel);
      this.frontWheels.push(wheel);
    }

    // Rear steering wheels (smaller, pivot with rear steering!)
    const wheelGeoR = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 12);
    wheelGeoR.rotateZ(Math.PI / 2);
    for (const side of [-0.66, 0.66]) {
      const pivot = new THREE.Group();
      pivot.position.set(side, -0.26, -0.78);
      const wheel = new THREE.Mesh(wheelGeoR, tireMat);
      wheel.castShadow = true;
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 8), hubMat);
      hub.rotation.z = Math.PI / 2;
      wheel.add(hub);
      pivot.add(wheel);
      this.chassisTiltGroup.add(pivot);
      this.rearWheels.push(pivot);
    }

    // Hydraulic Mast + Forks (mounted at front +Z = 0.98)
    this.mastPivot = new THREE.Group();
    this.mastPivot.position.set(0, -0.35, 0.96);
    this.chassisTiltGroup.add(this.mastPivot);

    for (const side of [-0.38, 0.38]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.11, 2.75, 0.14), darkSteelMat);
      rail.position.set(side, 1.38, 0);
      rail.castShadow = true;
      this.mastPivot.add(rail);
    }
    const crossTop = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.14), darkSteelMat);
    crossTop.position.set(0, 2.72, 0);
    this.mastPivot.add(crossTop);

    // Fork carriage that slides vertically along mast
    this.forkCarriage = new THREE.Group();
    this.mastPivot.add(this.forkCarriage);

    const backrest = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.62, 0.08), darkSteelMat);
    backrest.position.set(0, 0.34, 0.08);
    backrest.castShadow = true;
    this.forkCarriage.add(backrest);

    const forkMat = new THREE.MeshStandardMaterial({
      color: 0x3b4450,
      metalness: 0.65,
      roughness: 0.35,
    });
    for (const side of [-0.3, 0.3]) {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.055, 1.32), forkMat);
      tine.position.set(side, 0.03, 0.72);
      tine.castShadow = true;
      tine.receiveShadow = true;
      this.forkCarriage.add(tine);

      // Painted high-vis yellow fork tips for crisp 3/4 overhead readability!
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.06, 0.24), yellowMat);
      tip.position.set(side, 0.032, 1.28);
      this.forkCarriage.add(tip);
    }

    // Overhead alignment indicator glow between forks when lined up with a pallet
    this.alignGlowMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 1.15),
      new THREE.MeshBasicMaterial({
        color: 0x42c97a,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.alignGlowMesh.rotation.x = -Math.PI / 2;
    this.alignGlowMesh.position.set(0, 0.09, 0.78);
    this.forkCarriage.add(this.alignGlowMesh);

    scene.add(this.root);

    // Overhead depth aid: projected footprint reticle directly underneath lifted cargo!
    this.reticleGroup = new THREE.Group();
    this.reticleRingMat = new THREE.MeshBasicMaterial({
      color: 0x42c97a,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.58, 0.72, 4), this.reticleRingMat);
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.rotation.z = Math.PI / 4;
    this.reticleGroup.add(outerRing);

    const shadowDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 1.18),
      new THREE.MeshBasicMaterial({
        color: 0x0b1117,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    shadowDisc.rotation.x = -Math.PI / 2;
    shadowDisc.position.y = -0.005;
    this.reticleGroup.add(shadowDisc);
    this.reticleGroup.visible = false;
    scene.add(this.reticleGroup);

    this.syncVisuals();
  }

  public toggleDeckLock(): boolean {
    this.deckLocked = !this.deckLocked;
    this.brakeLampMat.color.setHex(this.deckLocked ? 0x42c97a : 0xffaa22);
    this.brakeLampMat.emissive.setHex(this.deckLocked ? 0x168042 : 0xaa5500);
    return this.deckLocked;
  }

  public setDeckLock(locked: boolean): void {
    if (this.deckLocked !== locked) {
      this.toggleDeckLock();
    }
  }

  public getPosition(out = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return out.set(t.x, t.y, t.z);
  }

  public getForward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)).normalize();
  }

  public getForkTipWorldPos(out = new THREE.Vector3()): THREE.Vector3 {
    const pos = this.getPosition();
    const fwd = this.getForward();
    return out.set(
      pos.x + fwd.x * 1.72,
      pos.y - 0.5 + this.forkHeight,
      pos.z + fwd.z * 1.72,
    );
  }

  public update(
    dt: number,
    input: ControlInput,
    cargoList: CargoItem[],
    funicularMoving: boolean,
    onClack: () => void,
  ): void {
    if (this.pickupCooldown > 0) this.pickupCooldown -= dt;

    // 1. Mast lift & tilt (always responsive unless funicular is moving while locked)
    const liftSpeed = 1.45;
    const tiltSpeed = 0.85;
    this.forkHeight = THREE.MathUtils.clamp(
      this.forkHeight + input.lift * liftSpeed * dt,
      MIN_FORK_H,
      MAX_FORK_H,
    );
    this.mastTilt = THREE.MathUtils.clamp(
      this.mastTilt + input.tilt * tiltSpeed * dt,
      MIN_TILT,
      MAX_TILT,
    );

    // 2. Driving kinematics (rear-wheel steering!)
    const canDrive = !(this.deckLocked || (funicularMoving && this.ridingCar !== null));
    const maxSpeed = input.crawl ? 2.6 : 6.4;
    const accel = 16.0;
    const decel = 14.0;

    if (canDrive) {
      const targetSpeed = input.throttle * maxSpeed;
      if (Math.abs(targetSpeed) > 0.05) {
        this.speed = moveTowards(this.speed, targetSpeed, accel * dt);
      } else {
        this.speed = moveTowards(this.speed, 0, decel * dt);
      }

      // Rear-wheel steering angle (tight agile forklift turning)
      const targetSteer = input.steer * 0.72;
      this.steerAngle = THREE.MathUtils.lerp(this.steerAngle, targetSteer, Math.min(1, dt * 11));

      if (Math.abs(this.speed) > 0.06) {
        const wheelbase = 1.62;
        const angularVel = (this.speed / wheelbase) * Math.tan(this.steerAngle);
        this.yaw += angularVel * dt;
      }

      const fwd = this.getForward();
      const curVel = this.body.linvel();
      this.body.setLinvel(
        {
          x: fwd.x * this.speed,
          y: curVel.y,
          z: fwd.z * this.speed,
        },
        true,
      );
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);

      this.wheelSpin += this.speed * dt * 2.8;
    } else {
      this.speed = 0;
      const curVel = this.body.linvel();
      this.body.setLinvel({ x: 0, y: funicularMoving ? 0 : curVel.y, z: 0 }, true);
    }

    // 3. Smart Fork-Cradle Pickup & Placement (smooth, zero jitter, supports stacking!)
    this.updatePalletHandling(cargoList, input.lift, onClack);

    // 4. Visual body lean + wheels + mast + overhead depth reticle
    this.syncVisuals(cargoList);
  }

  private updatePalletHandling(cargoList: CargoItem[], liftInput: number, onClack: () => void): void {
    const forkPos = this.getForkTipWorldPos();
    const fwd = this.getForward();
    const forkBaseY = this.getPosition().y - 0.5;

    if (this.carriedCargo) {
      const item = this.carriedCargo;
      // Place carried cargo smoothly onto forks
      const worldOffset = this.carriedOffset
        .clone()
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

      const targetX = forkPos.x + worldOffset.x;
      const targetY = forkPos.y + item.halfExtents.y + 0.02;
      const targetZ = forkPos.z + worldOffset.z;

      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        this.yaw + this.carriedYawOffset,
      );
      const qTilt = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        this.mastTilt * 0.8,
      );
      qYaw.multiply(qTilt);

      item.body.setNextKinematicTranslation({ x: targetX, y: targetY, z: targetZ });
      item.body.setNextKinematicRotation({ x: qYaw.x, y: qYaw.y, z: qYaw.z, w: qYaw.w });

      // Release when forks lower back down onto ground OR onto another pallet stack while pressing down
      const supportY = this.computeSupportSurfaceY(targetX, targetZ, item, cargoList);
      const bottomY = targetY - item.halfExtents.y;

      const shouldRelease =
        (this.forkHeight <= MIN_FORK_H + 0.05 && bottomY <= supportY + 0.14) ||
        (liftInput < -0.2 && bottomY <= supportY + 0.09);

      if (shouldRelease) {
        this.releaseCargo(supportY + item.halfExtents.y + 0.01);
        onClack();
      }
      return;
    }

    // Not carrying: check if aligned with a liftable pallet and raising forks
    let bestCandidate: CargoItem | null = null;
    let bestScore = Infinity;

    for (const item of cargoList) {
      if (item.carried || item.ridingCar !== null) continue;
      const p = item.body.translation();
      const dx = p.x - forkPos.x;
      const dz = p.z - forkPos.z;
      const horizDist = Math.hypot(dx, dz);
      const palletBottomY = p.y - item.halfExtents.y;
      const vertDist = Math.abs(forkPos.y - (palletBottomY + 0.08));

      // Also verify pallet is in front of the forklift
      const relX = p.x - this.getPosition().x;
      const relZ = p.z - this.getPosition().z;
      const dotFwd = relX * fwd.x + relZ * fwd.z;

      if (horizDist < 0.88 && vertDist < 0.34 && dotFwd > 0.75) {
        const score = horizDist + vertDist;
        if (score < bestScore) {
          bestScore = score;
          bestCandidate = item;
        }
      }
    }

    // Highlight fork alignment guide when lined up with a pallet!
    const glowMat = this.alignGlowMesh.material as THREE.MeshBasicMaterial;
    glowMat.opacity = bestCandidate ? 0.42 : 0.0;

    if (bestCandidate && this.pickupCooldown <= 0 && (liftInput > 0.1 || this.forkHeight > forkBaseY - (this.getPosition().y - 0.5) + 0.16)) {
      if (liftInput > 0.1) {
        this.grabCargo(bestCandidate);
        onClack();
      }
    }
  }

  private grabCargo(item: CargoItem): void {
    this.carriedCargo = item;
    item.carried = true;
    item.wasAirborne = false;

    // Remember small local offset (clamped for neat seating)
    const forkPos = this.getForkTipWorldPos();
    const p = item.body.translation();
    const worldDelta = new THREE.Vector3(p.x - forkPos.x, 0, p.z - forkPos.z);
    worldDelta.applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    worldDelta.x = THREE.MathUtils.clamp(worldDelta.x, -0.25, 0.25);
    worldDelta.z = THREE.MathUtils.clamp(worldDelta.z, -0.25, 0.25);
    this.carriedOffset.copy(worldDelta);

    // Snap pallet rotation neatly to nearest 90° relative to forks for crisp stacking
    const r = item.body.rotation();
    const eul = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x, r.y, r.z, r.w), 'YXZ');
    const relYaw = eul.y - this.yaw;
    this.carriedYawOffset = Math.round(relYaw / (Math.PI / 2)) * (Math.PI / 2);

    item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
  }

  public releaseCargo(snapCenterY?: number): void {
    if (!this.carriedCargo) return;
    const item = this.carriedCargo;
    this.carriedCargo = null;
    item.carried = false;
    this.pickupCooldown = 0.28;

    const t = item.body.translation();
    item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    item.body.setTranslation(
      { x: t.x, y: snapCenterY !== undefined ? snapCenterY : t.y, z: t.z },
      true,
    );
    const flatYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw + this.carriedYawOffset,
    );
    item.body.setRotation({ x: flatYaw.x, y: flatYaw.y, z: flatYaw.z, w: flatYaw.w }, true);
    item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    item.peakFallY = snapCenterY !== undefined ? snapCenterY : t.y;
    syncCargoMesh(item);
  }

  private computeSupportSurfaceY(
    x: number,
    z: number,
    ignoreItem: CargoItem,
    cargoList: CargoItem[],
  ): number {
    // Base deck height: Lower (z >= 0) vs Upper (z < 0), plus check if over another pallet
    let baseY = this.getPosition().y - 0.5;
    if (baseY > 5.5) baseY = STATION_Y.upper;
    else if (baseY < 1.5) baseY = STATION_Y.lower;

    let highestY = baseY;
    for (const other of cargoList) {
      if (other === ignoreItem || other.carried) continue;
      const p = other.body.translation();
      const dx = Math.abs(p.x - x);
      const dz = Math.abs(p.z - z);
      if (dx < other.halfExtents.x + 0.35 && dz < other.halfExtents.z + 0.35) {
        const topY = p.y + other.halfExtents.y;
        if (topY > highestY && topY < this.getPosition().y + 2.4) {
          highestY = topY;
        }
      }
    }
    return highestY;
  }

  public syncVisuals(cargoList: CargoItem[] = []): void {
    const t = this.body.translation();
    this.root.position.set(t.x, t.y, t.z);
    this.root.rotation.set(0, this.yaw, 0);

    // Subtle realistic pitch & roll feedback on chassis visual when carrying/turning
    const loadPitch = this.carriedCargo ? 0.025 + (this.forkHeight / MAX_FORK_H) * 0.035 : 0;
    const turnRoll = -this.steerAngle * Math.min(1, Math.abs(this.speed) / 5) * 0.06;
    this.chassisTiltGroup.rotation.x = THREE.MathUtils.lerp(this.chassisTiltGroup.rotation.x, loadPitch, 0.15);
    this.chassisTiltGroup.rotation.z = THREE.MathUtils.lerp(this.chassisTiltGroup.rotation.z, turnRoll, 0.15);

    // Mast & forks
    this.mastPivot.rotation.x = this.mastTilt;
    this.forkCarriage.position.y = this.forkHeight - 0.08;

    // Wheels
    for (const fw of this.frontWheels) {
      fw.rotation.x = this.wheelSpin;
    }
    for (const rw of this.rearWheels) {
      // Rear wheels turn opposite to front turn direction for authentic rear-steer visual!
      rw.rotation.y = -this.steerAngle;
      const mesh = rw.children[0];
      if (mesh) mesh.rotation.x = this.wheelSpin;
    }

    // Overhead Depth Reticle beneath lifted cargo
    if (this.carriedCargo) {
      const cp = this.carriedCargo.body.translation();
      const surfY = this.computeSupportSurfaceY(cp.x, cp.z, this.carriedCargo, cargoList);
      this.reticleGroup.visible = true;
      this.reticleGroup.position.set(cp.x, surfY + 0.03, cp.z);
      this.reticleGroup.rotation.y = this.yaw + this.carriedYawOffset;
      const heightGap = Math.max(0, cp.y - this.carriedCargo.halfExtents.y - surfY);
      this.reticleRingMat.color.setHex(heightGap < 0.25 ? 0x42c97a : 0xf5b726);
    } else {
      this.reticleGroup.visible = false;
    }
  }

  public reset(pos: THREE.Vector3, yaw: number): void {
    this.releaseCargo();
    this.spawnPos.copy(pos);
    this.spawnYaw = yaw;
    this.yaw = yaw;
    this.speed = 0;
    this.steerAngle = 0;
    this.forkHeight = 0.09;
    this.mastTilt = 0;
    this.setDeckLock(false);
    this.ridingCar = null;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setTranslation(pos, true);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.syncVisuals();
  }

  public recoverToNearestSafeSpot(): void {
    const pos = this.getPosition();
    const isUpper = pos.y > 5.5;
    const safeY = isUpper ? STATION_Y.upper + 0.55 : STATION_Y.lower + 0.55;
    const safeZ = isUpper ? -15.5 : 15.5;
    const safeX = THREE.MathUtils.clamp(pos.x, -9.5, 9.5);
    this.setDeckLock(false);
    this.ridingCar = null;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    this.body.setTranslation({ x: safeX, y: safeY, z: safeZ }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.speed = 0;
    this.syncVisuals();
  }

  public getSpawn(): { pos: THREE.Vector3; yaw: number } {
    return { pos: this.spawnPos.clone(), yaw: this.spawnYaw };
  }
}
