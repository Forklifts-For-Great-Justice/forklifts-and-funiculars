import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CargoItem, syncCargoMesh } from './cargo';
import { Forklift } from './forklift';
import { FORKLIFT_MASS_TONS, STATION_Y } from './levels';
import { createHazardStripeTexture, createSignTexture } from './textures';

export const CAR_WIDTH = 4.2;
export const CAR_LENGTH = 5.2;
export const CAR_DECK_THICKNESS = 0.36;
export const TRACK_LOWER_Z = 8.4;
export const TRACK_UPPER_Z = -8.4;
export const TRACK_X_STATION = 2.75;
export const TRACK_X_FLARE = 0.65;

export type FunicularState = 'LOWER_DOCKED' | 'UPPER_DOCKED' | 'MOVING';

interface FunicularCar {
  id: 'A' | 'B';
  body: RAPIER.RigidBody;
  group: THREE.Group;
  gateSouth: THREE.Mesh;
  gateNorth: THREE.Mesh;
  lampMat: THREE.MeshStandardMaterial;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
}

export class FunicularSystem {
  public readonly carA: FunicularCar;
  public readonly carB: FunicularCar;

  public progress = 0; // 0 = Car A at Lower & Car B at Upper; 1 = Car A at Upper & Car B at Lower
  public targetProgress = 0;
  public state: FunicularState = 'LOWER_DOCKED';
  public tripCount = 0;

  public carAMass = 0;
  public carBMass = 0;
  public deltaMax = 4;
  public maxCarLoad = 8;

  private readonly travelDuration = 5.2; // seconds for scenic smooth ride
  private travelElapsed = 0;
  private travelStartProgress = 0;

  private readonly bullwheel: THREE.Mesh;
  private readonly cableLineA: THREE.Line;
  private readonly cableLineB: THREE.Line;
  private readonly archSignMat: THREE.MeshBasicMaterial;
  private readonly lowerGateA: THREE.Mesh;
  private readonly lowerGateB: THREE.Mesh;
  private readonly upperGateA: THREE.Mesh;
  private readonly upperGateB: THREE.Mesh;
  private readonly lowerGateACollider: RAPIER.RigidBody;
  private readonly lowerGateBCollider: RAPIER.RigidBody;
  private readonly upperGateACollider: RAPIER.RigidBody;
  private readonly upperGateBCollider: RAPIER.RigidBody;
  private lastSignKey = '';

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    const hazardTex = createHazardStripeTexture();

    this.carA = this.createCar('A', 0x1a2840, 0x44ccdd, world, scene, hazardTex);
    this.carB = this.createCar('B', 0x3a1a28, 0xcc44aa, world, scene, hazardTex);

    // Upper bullwheel pulley in cable house
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x262d36,
      metalness: 0.65,
      roughness: 0.3,
    });
    this.bullwheel = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.35, 20), wheelMat);
    this.bullwheel.position.set(0, STATION_Y.upper + 0.6, -10.8);
    this.bullwheel.castShadow = true;
    scene.add(this.bullwheel);

    // Glowing rim ring on bullwheel
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 0.6,
    });
    const rimGeo = new THREE.TorusGeometry(2.8, 0.06, 8, 32);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.set(0, STATION_Y.upper + 0.6, -10.8);
    scene.add(rim);

    // Steel haul cables connecting cars to upper bullwheel
    const cableMat = new THREE.LineBasicMaterial({ color: 0x222830 });
    this.cableLineA = new THREE.Line(new THREE.BufferGeometry(), cableMat);
    this.cableLineB = new THREE.Line(new THREE.BufferGeometry(), cableMat);
    scene.add(this.cableLineA, this.cableLineB);

    // Diegetic overhead station arch balance display (visible at both stations!)
    this.archSignMat = new THREE.MeshBasicMaterial({
      map: createSignTexture('BALANCE GAUGE', '0T vs 0T'),
    });

    for (const [y, z] of [
      [STATION_Y.lower, 11.4],
      [STATION_Y.upper, -11.4],
    ]) {
      const archGroup = new THREE.Group();
      const postMat = new THREE.MeshStandardMaterial({ color: 0x353e4a, roughness: 0.6, metalness: 0.3 });
      for (const sx of [-5.8, 5.8]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.35), postMat);
        post.position.set(sx, y + 2.3, z);
        post.castShadow = true;
        archGroup.add(post);
      }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.38, 0.4), postMat);
      beam.position.set(0, y + 4.5, z);
      beam.castShadow = true;
      archGroup.add(beam);

      const signBoard = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.5, 0.22), [
        postMat,
        postMat,
        postMat,
        postMat,
        this.archSignMat,
        this.archSignMat,
      ]);
      signBoard.position.set(0, y + 4.6, z);
      signBoard.castShadow = true;
      archGroup.add(signBoard);
      scene.add(archGroup);
    }

    // Station berth safety barriers (prevent driving into the empty pit!)
    const gateMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 });
    const makeStationGate = (x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH + 0.1, 0.85, 0.24), gateMat);
      mesh.position.set(x, y + 0.42, z);
      mesh.castShadow = true;
      scene.add(mesh);

      const rb = world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 0.42, z),
      );
      world.createCollider(RAPIER.ColliderDesc.cuboid(CAR_WIDTH / 2 + 0.05, 0.6, 0.14), rb);
      return { mesh, rb };
    };

    const lgA = makeStationGate(-TRACK_X_STATION, STATION_Y.lower, 11.12);
    const lgB = makeStationGate(TRACK_X_STATION, STATION_Y.lower, 11.12);
    const ugA = makeStationGate(-TRACK_X_STATION, STATION_Y.upper, -11.12);
    const ugB = makeStationGate(TRACK_X_STATION, STATION_Y.upper, -11.12);

    this.lowerGateA = lgA.mesh;
    this.lowerGateACollider = lgA.rb;
    this.lowerGateB = lgB.mesh;
    this.lowerGateBCollider = lgB.rb;
    this.upperGateA = ugA.mesh;
    this.upperGateACollider = ugA.rb;
    this.upperGateB = ugB.mesh;
    this.upperGateBCollider = ugB.rb;

    this.applyTrackPositions(0, true);
  }

  private createCar(
    id: 'A' | 'B',
    primaryHex: number,
    trimHex: number,
    world: RAPIER.World,
    scene: THREE.Scene,
    hazardTex: THREE.CanvasTexture,
  ): FunicularCar {
    const pos = this.evalCarPos(id, 0);
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z),
    );

    // Flush deck collider (top surface sits at y = pos.y)
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(CAR_WIDTH / 2, CAR_DECK_THICKNESS / 2, CAR_LENGTH / 2)
        .setTranslation(0, -CAR_DECK_THICKNESS / 2, 0)
        .setFriction(1.2),
      body,
    );

    // Left and right low guardrails
    const railH = 0.55;
    for (const side of [-CAR_WIDTH / 2 + 0.08, CAR_WIDTH / 2 - 0.08]) {
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.08, railH / 2, CAR_LENGTH / 2)
          .setTranslation(side, railH / 2, 0),
        body,
      );
    }

    const group = new THREE.Group();
    group.position.copy(pos);

    const deckMat = new THREE.MeshStandardMaterial({ color: 0x1e2834, roughness: 0.55, metalness: 0.45 });
    const bodyMat = new THREE.MeshStandardMaterial({
      color: primaryHex,
      roughness: 0.38,
      metalness: 0.55,
      flatShading: true,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: trimHex, emissive: trimHex, emissiveIntensity: 0.15, roughness: 0.25 });
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x262d36,
      metalness: 0.5,
      roughness: 0.45,
    });

    // Main flat deck
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_WIDTH, CAR_DECK_THICKNESS, CAR_LENGTH),
      deckMat,
    );
    deck.position.y = -CAR_DECK_THICKNESS / 2;
    deck.castShadow = true;
    deck.receiveShadow = true;
    group.add(deck);

    // Painted border trim + Car ID stencil on deck
    const borderMat = new THREE.MeshStandardMaterial({ map: hazardTex, roughness: 0.6 });
    const edgeStripS = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.04, 0.22), borderMat);
    edgeStripS.position.set(0, 0.01, CAR_LENGTH / 2 - 0.11);
    group.add(edgeStripS);
    const edgeStripN = new THREE.Mesh(new THREE.BoxGeometry(CAR_WIDTH, 0.04, 0.22), borderMat);
    edgeStripN.position.set(0, 0.01, -CAR_LENGTH / 2 + 0.11);
    group.add(edgeStripN);

    // Classic angled wedge undercarriage matching the 26.6° mountain incline!
    const wedgeShape = new THREE.Shape();
    wedgeShape.moveTo(-CAR_LENGTH / 2 + 0.2, 0);
    wedgeShape.lineTo(CAR_LENGTH / 2 - 0.2, 0);
    wedgeShape.lineTo(CAR_LENGTH / 2 - 0.2, -2.3);
    wedgeShape.lineTo(-CAR_LENGTH / 2 + 0.2, -0.2);
    wedgeShape.closePath();

    const wedgeGeo = new THREE.ExtrudeGeometry(wedgeShape, {
      depth: CAR_WIDTH - 0.5,
      bevelEnabled: false,
    });
    wedgeGeo.rotateY(Math.PI / 2);
    wedgeGeo.translate(-(CAR_WIDTH - 0.5) / 2, -CAR_DECK_THICKNESS, 0);
    const wedge = new THREE.Mesh(wedgeGeo, bodyMat);
    wedge.castShadow = true;
    group.add(wedge);

    // Heritage side walls + brass/cream handrails
    for (const side of [-CAR_WIDTH / 2 + 0.09, CAR_WIDTH / 2 - 0.09]) {
      const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, CAR_LENGTH), bodyMat);
      sidePanel.position.set(side, 0.275, 0);
      sidePanel.castShadow = true;
      group.add(sidePanel);

      const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.09, CAR_LENGTH + 0.04), trimMat);
      topRail.position.set(side, 0.58, 0);
      group.add(topRail);
    }

    // Small open-air conductor canopy post + signal lamp on outer side
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 0.9,
    });
    const lampPost = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), metalMat);
    lampPost.position.set(id === 'A' ? -CAR_WIDTH / 2 + 0.12 : CAR_WIDTH / 2 - 0.12, 0.7, 0);
    group.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), lampMat);
    lamp.position.set(id === 'A' ? -CAR_WIDTH / 2 + 0.12 : CAR_WIDTH / 2 - 0.12, 1.46, 0);
    group.add(lamp);

    // South and North folding safety gates on the car itself
    const gateGeo = new THREE.BoxGeometry(CAR_WIDTH - 0.36, 0.52, 0.12);
    const gateSouth = new THREE.Mesh(gateGeo, trimMat);
    gateSouth.position.set(0, 0.26, CAR_LENGTH / 2 - 0.08);
    group.add(gateSouth);

    const gateNorth = new THREE.Mesh(gateGeo, trimMat);
    gateNorth.position.set(0, 0.26, -CAR_LENGTH / 2 + 0.08);
    group.add(gateNorth);

    scene.add(group);

    return {
      id,
      body,
      group,
      gateSouth,
      gateNorth,
      lampMat,
      pos: pos.clone(),
      prevPos: pos.clone(),
    };
  }

  public evalCarPos(id: 'A' | 'B', prog: number): THREE.Vector3 {
    const t = id === 'A' ? prog : 1 - prog;
    const sign = id === 'A' ? -1 : 1;
    const x = sign * (TRACK_X_STATION + TRACK_X_FLARE * Math.sin(Math.PI * t));
    const y = STATION_Y.lower + (STATION_Y.upper - STATION_Y.lower) * t;
    const z = TRACK_LOWER_Z + (TRACK_UPPER_Z - TRACK_LOWER_Z) * t;
    return new THREE.Vector3(x, y, z);
  }

  public isPointOnCar(car: FunicularCar, x: number, y: number, z: number, margin = 0.0): boolean {
    const dx = Math.abs(x - car.pos.x);
    const dz = Math.abs(z - car.pos.z);
    const dy = y - car.pos.y;
    return (
      dx <= CAR_WIDTH / 2 - margin &&
      dz <= CAR_LENGTH / 2 - margin &&
      dy >= -0.35 &&
      dy <= 3.6
    );
  }

  public getCarAtStation(station: 'lower' | 'upper'): FunicularCar | null {
    if (this.state === 'MOVING') return null;
    if (this.state === 'LOWER_DOCKED') {
      return station === 'lower' ? this.carA : this.carB;
    }
    return station === 'lower' ? this.carB : this.carA;
  }

  public computeWeights(forklift: Forklift, cargoList: CargoItem[]): {
    carAMass: number;
    carBMass: number;
    diff: number;
    balanced: boolean;
    reason?: string;
  } {
    let mA = 0;
    let mB = 0;

    // Forklift mass (counts if parked on a car!)
    const fp = forklift.getPosition();
    const forkOnA =
      this.state === 'MOVING'
        ? forklift.ridingCar === 'A'
        : this.isPointOnCar(this.carA, fp.x, fp.y, fp.z, -0.15);
    const forkOnB =
      this.state === 'MOVING'
        ? forklift.ridingCar === 'B'
        : this.isPointOnCar(this.carB, fp.x, fp.y, fp.z, -0.15);

    if (forkOnA) {
      mA += FORKLIFT_MASS_TONS;
      if (forklift.carriedCargo) mA += forklift.carriedCargo.massTons;
    } else if (forkOnB) {
      mB += FORKLIFT_MASS_TONS;
      if (forklift.carriedCargo) mB += forklift.carriedCargo.massTons;
    }

    // Free-standing cargo on cars
    for (const item of cargoList) {
      if (item.carried) continue;
      const p = item.body.translation();
      const onA =
        this.state === 'MOVING'
          ? item.ridingCar === 'A'
          : this.isPointOnCar(this.carA, p.x, p.y, p.z, -0.05);
      const onB =
        this.state === 'MOVING'
          ? item.ridingCar === 'B'
          : this.isPointOnCar(this.carB, p.x, p.y, p.z, -0.05);
      if (onA) mA += item.massTons;
      else if (onB) mB += item.massTons;
    }

    this.carAMass = mA;
    this.carBMass = mB;
    const diff = Math.abs(mA - mB);

    let balanced = true;
    let reason: string | undefined;
    if (mA > this.maxCarLoad) {
      balanced = false;
      reason = `Car A exceeds max deck load (${mA}t / ${this.maxCarLoad}t)!`;
    } else if (mB > this.maxCarLoad) {
      balanced = false;
      reason = `Car B exceeds max deck load (${mB}t / ${this.maxCarLoad}t)!`;
    } else if (diff > this.deltaMax) {
      balanced = false;
      const heavier = mA > mB ? 'Car A' : 'Car B';
      reason = `OVERLOAD! ${heavier} is heavier by ${diff}t (max diff: ${this.deltaMax}t). Add counterweight!`;
    }

    this.updateDiegeticGauge(mA, mB, diff, balanced);
    return { carAMass: mA, carBMass: mB, diff, balanced, reason };
  }

  public tryDispatch(
    forklift: Forklift,
    cargoList: CargoItem[],
  ): { ok: boolean; message: string } {
    if (this.state === 'MOVING') {
      return { ok: false, message: 'Funicular is already in transit!' };
    }

    const check = this.computeWeights(forklift, cargoList);
    if (!check.balanced) {
      return { ok: false, message: check.reason ?? 'Funicular unbalanced!' };
    }

    // Latch any forklift & cargo currently aboard Car A or Car B for zero-jitter transit!
    const fp = forklift.getPosition();
    if (this.isPointOnCar(this.carA, fp.x, fp.y, fp.z, -0.15)) {
      forklift.ridingCar = 'A';
      forklift.setDeckLock(true);
      forklift.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else if (this.isPointOnCar(this.carB, fp.x, fp.y, fp.z, -0.15)) {
      forklift.ridingCar = 'B';
      forklift.setDeckLock(true);
      forklift.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    } else {
      forklift.ridingCar = null;
    }

    for (const item of cargoList) {
      if (item.carried) continue;
      const p = item.body.translation();
      if (this.isPointOnCar(this.carA, p.x, p.y, p.z, -0.05)) {
        item.ridingCar = 'A';
        item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      } else if (this.isPointOnCar(this.carB, p.x, p.y, p.z, -0.05)) {
        item.ridingCar = 'B';
        item.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      } else {
        item.ridingCar = null;
      }
    }

    this.travelStartProgress = this.progress;
    this.targetProgress = this.progress < 0.5 ? 1 : 0;
    this.travelElapsed = 0;
    this.state = 'MOVING';
    this.tripCount += 1;

    const dirLabel =
      forklift.ridingCar === 'A'
        ? this.targetProgress > 0.5
          ? 'Riding Car A UP to Summit!'
          : 'Riding Car A DOWN to Valley!'
        : forklift.ridingCar === 'B'
          ? this.targetProgress > 0.5
            ? 'Riding Car B DOWN to Valley!'
            : 'Riding Car B UP to Summit!'
          : 'Remote dispatch engaged — swapping cars!';

    return { ok: true, message: dirLabel };
  }

  public update(dt: number, forklift: Forklift, cargoList: CargoItem[]): boolean {
    let justArrived = false;

    if (this.state === 'MOVING') {
      this.travelElapsed += dt;
      const u = Math.min(1, this.travelElapsed / this.travelDuration);
      // Smooth cosine S-curve acceleration & braking
      const eased = 0.5 - 0.5 * Math.cos(Math.PI * u);
      const nextProg = THREE.MathUtils.lerp(this.travelStartProgress, this.targetProgress, eased);

      this.applyTrackPositions(nextProg, false);

      // Carry locked forklift & cargo by exact frame delta (zero drift, zero clipping!)
      const deltaA = this.carA.pos.clone().sub(this.carA.prevPos);
      const deltaB = this.carB.pos.clone().sub(this.carB.prevPos);

      if (forklift.ridingCar) {
        const d = forklift.ridingCar === 'A' ? deltaA : deltaB;
        const p = forklift.body.translation();
        forklift.body.setNextKinematicTranslation({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
      }

      for (const item of cargoList) {
        if (item.ridingCar) {
          const d = item.ridingCar === 'A' ? deltaA : deltaB;
          const p = item.body.translation();
          item.body.setNextKinematicTranslation({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z });
          item.peakFallY = p.y + d.y;
        }
      }

      // Spin upper bullwheel
      const spinDir = this.targetProgress > this.travelStartProgress ? 1 : -1;
      this.bullwheel.rotation.y += spinDir * dt * 2.2;

      if (u >= 1) {
        this.state = this.targetProgress > 0.5 ? 'UPPER_DOCKED' : 'LOWER_DOCKED';
        this.applyTrackPositions(this.targetProgress, true);

        // Release forklift & cargo cleanly back to dynamic physics at arrival!
        if (forklift.ridingCar) {
          const p = forklift.body.translation();
          forklift.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
          forklift.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
          forklift.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
          forklift.ridingCar = null;
          forklift.setDeckLock(false);
        }

        for (const item of cargoList) {
          if (item.ridingCar) {
            const p = item.body.translation();
            item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
            item.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
            item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
            item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
            item.ridingCar = null;
            item.wasAirborne = false;
            item.peakFallY = p.y;
            syncCargoMesh(item);
          }
        }
        justArrived = true;
      }
    }

    this.updateGatesAndCables();
    return justArrived;
  }

  public reset(progress = 0): void {
    this.progress = progress;
    this.targetProgress = progress;
    this.state = progress < 0.5 ? 'LOWER_DOCKED' : 'UPPER_DOCKED';
    this.travelElapsed = 0;
    this.tripCount = 0;
    this.applyTrackPositions(progress, true);
    this.updateGatesAndCables();
  }

  private applyTrackPositions(prog: number, snap: boolean): void {
    this.progress = prog;
    for (const car of [this.carA, this.carB]) {
      car.prevPos.copy(car.pos);
      car.pos.copy(this.evalCarPos(car.id, prog));
      if (snap) {
        car.prevPos.copy(car.pos);
        car.body.setTranslation(car.pos, true);
      } else {
        car.body.setNextKinematicTranslation(car.pos);
      }
      car.group.position.copy(car.pos);
    }
  }

  private updateGatesAndCables(): void {
    const moving = this.state === 'MOVING';
    const lowerIsA = this.state === 'LOWER_DOCKED';
    const upperIsA = this.state === 'UPPER_DOCKED';

    // Car onboard safety gates: open only on the docked station side!
    this.carA.gateSouth.visible = !lowerIsA;
    this.carA.gateNorth.visible = !upperIsA;
    this.carB.gateSouth.visible = !upperIsA;
    this.carB.gateNorth.visible = !lowerIsA;

    // Station berth barriers: raise on any berth that does NOT have a docked car
    const setGate = (mesh: THREE.Mesh, rb: RAPIER.RigidBody, open: boolean, baseY: number) => {
      const targetY = open ? baseY - 1.4 : baseY + 0.42;
      mesh.position.y = THREE.MathUtils.lerp(mesh.position.y, targetY, 0.2);
      mesh.visible = !open || mesh.position.y > baseY - 0.8;
      rb.setNextKinematicTranslation({ x: mesh.position.x, y: targetY, z: mesh.position.z });
    };

    setGate(this.lowerGateA, this.lowerGateACollider, !moving && lowerIsA, STATION_Y.lower);
    setGate(this.lowerGateB, this.lowerGateBCollider, !moving && upperIsA, STATION_Y.lower);
    setGate(this.upperGateA, this.upperGateACollider, !moving && upperIsA, STATION_Y.upper);
    setGate(this.upperGateB, this.upperGateBCollider, !moving && lowerIsA, STATION_Y.upper);

    // Update steel haul cable lines from cars to bullwheel
    this.cableLineA.geometry.setFromPoints([
      new THREE.Vector3(this.carA.pos.x, this.carA.pos.y - 0.1, this.carA.pos.z - CAR_LENGTH / 2),
      new THREE.Vector3(-TRACK_X_STATION, STATION_Y.upper + 0.55, -10.8),
    ]);
    this.cableLineB.geometry.setFromPoints([
      new THREE.Vector3(this.carB.pos.x, this.carB.pos.y - 0.1, this.carB.pos.z - CAR_LENGTH / 2),
      new THREE.Vector3(TRACK_X_STATION, STATION_Y.upper + 0.55, -10.8),
    ]);
  }

  private updateDiegeticGauge(mA: number, mB: number, diff: number, balanced: boolean): void {
    const key = `${mA}-${mB}-${diff}-${balanced}-${this.deltaMax}`;
    if (key === this.lastSignKey) return;
    this.lastSignKey = key;

    const oldMap = this.archSignMat.map;
    this.archSignMat.map = createSignTexture(
      `DIFF ${diff}T / MAX ${this.deltaMax}T`,
      `A:${mA}T  |  B:${mB}T`,
      balanced ? '#0e2018' : '#351717',
      balanced ? '#44ccdd' : '#ff4444',
    );
    this.archSignMat.needsUpdate = true;
    oldMap?.dispose();

    const lampHex = balanced ? 0x44ccdd : 0xff4444;
    const emissiveHex = balanced ? 0x22aacc : 0x991f1a;
    for (const car of [this.carA, this.carB]) {
      car.lampMat.color.setHex(lampHex);
      car.lampMat.emissive.setHex(emissiveHex);
    }
  }
}
