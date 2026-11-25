import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { DropZoneSpec, StationId } from './types';
import { STATION_Y } from './levels';
import {
  TRACK_LOWER_Z,
  TRACK_UPPER_Z,
  TRACK_X_FLARE,
  TRACK_X_STATION,
} from './funicular';
import { createDropZoneTexture, createSignTexture } from './textures';

export interface Weighbridge {
  station: StationId;
  x: number;
  y: number;
  z: number;
  halfW: number;
  halfD: number;
  signMat: THREE.MeshBasicMaterial;
  lastValue: number;
}

export interface ActiveDropZone {
  spec: DropZoneSpec;
  y: number;
  plane: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  satisfied: boolean;
}

export class WorldEnvironment {
  public readonly weighbridges: Weighbridge[] = [];
  public activeDropZones: ActiveDropZone[] = [];
  private readonly dropZoneGroup = new THREE.Group();

  constructor(world: RAPIER.World, scene: THREE.Scene) {
    this.setupLightingAndSky(scene);
    this.buildAlpineBackdrop(scene);
    this.buildStations(world, scene);
    this.buildFunicularTracks(scene);
    this.buildWeighbridges(scene);
    scene.add(this.dropZoneGroup);
  }

  private setupLightingAndSky(scene: THREE.Scene): void {
    scene.background = new THREE.Color(0x9bc8e8);
    scene.fog = new THREE.FogExp2(0x9bc8e8, 0.0085);

    const hemi = new THREE.HemisphereLight(0xdff2ff, 0x4d6b47, 0.95);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff1d6, 1.55);
    sun.position.set(24, 38, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 110;
    const d = 32;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0006;
    scene.add(sun);

    // Subtle cool alpine fill from opposite side
    const fill = new THREE.DirectionalLight(0xaad0ff, 0.4);
    fill.position.set(-20, 18, -16);
    scene.add(fill);
  }

  private buildAlpineBackdrop(scene: THREE.Scene): void {
    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x5c8f4c,
      roughness: 0.92,
      flatShading: true,
    });
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x7c828a,
      roughness: 0.9,
      flatShading: true,
    });
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xf0f4f8,
      roughness: 0.75,
      flatShading: true,
    });

    // Valley floor meadow
    const valley = new THREE.Mesh(new THREE.BoxGeometry(140, 2, 140), grassMat);
    valley.position.set(0, -3.2, 22);
    valley.receiveShadow = true;
    scene.add(valley);

    // Sloped mountainside beneath the funicular viaduct
    const slopeLen = Math.hypot(22, 11) + 4;
    const slopeAngle = Math.atan2(11, 22);
    const hillside = new THREE.Mesh(new THREE.BoxGeometry(62, 6, slopeLen), grassMat);
    hillside.position.set(0, 2.2, 0);
    hillside.rotation.x = slopeAngle;
    hillside.receiveShadow = true;
    scene.add(hillside);

    // Upper summit plateau earth mass
    const plateau = new THREE.Mesh(new THREE.BoxGeometry(80, 14, 48), rockMat);
    plateau.position.set(0, 3.6, -33);
    plateau.receiveShadow = true;
    scene.add(plateau);

    const plateauTop = new THREE.Mesh(new THREE.BoxGeometry(82, 1.0, 50), grassMat);
    plateauTop.position.set(0, 10.2, -33);
    plateauTop.receiveShadow = true;
    scene.add(plateauTop);

    // Scenic distant alpine peaks behind Upper Station
    const peakData: [number, number, number, number, number][] = [
      [-26, 10, -48, 18, 28],
      [-5, 10, -56, 22, 34],
      [22, 10, -50, 19, 30],
      [-36, 4, -22, 14, 20],
      [36, 4, -20, 15, 22],
    ];
    for (const [px, py, pz, rad, h] of peakData) {
      const peak = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 6), rockMat);
      peak.position.set(px, py + h / 2 - 2, pz);
      peak.castShadow = true;
      peak.receiveShadow = true;
      scene.add(peak);

      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.44, h * 0.42, 6), snowMat);
      cap.position.set(px, py + h * 0.79 - 2, pz);
      scene.add(cap);
    }

    // Stylized low-poly pine trees lining the hillside
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x614228, roughness: 0.9 });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0x2f683a,
      roughness: 0.85,
      flatShading: true,
    });
    const addPine = (x: number, y: number, z: number, scale = 1) => {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 1.1, 6), trunkMat);
      trunk.position.y = 0.55;
      trunk.castShadow = true;
      g.add(trunk);

      const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.2, 6), pineMat);
      c1.position.y = 1.9;
      c1.castShadow = true;
      g.add(c1);

      const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.8, 6), pineMat);
      c2.position.y = 3.1;
      c2.castShadow = true;
      g.add(c2);

      g.position.set(x, y, z);
      g.scale.setScalar(scale);
      scene.add(g);
    };

    const treeSpots: [number, number, number, number][] = [
      [-15.5, -2.0, 16, 1.1],
      [-17.2, -2.0, 21, 0.9],
      [15.8, -2.0, 15, 1.15],
      [17.5, -2.0, 20, 0.85],
      [-12.5, 2.5, 5, 1.0],
      [12.5, 3.0, 4, 1.05],
      [-13.0, 6.2, -3, 1.1],
      [13.2, 6.5, -4, 0.95],
      [-16.0, 10.6, -15, 1.15],
      [-17.5, 10.6, -22, 0.95],
      [16.2, 10.6, -16, 1.1],
      [17.8, 10.6, -23, 1.0],
    ];
    for (const [x, y, z, s] of treeSpots) addPine(x, y, z, s);
  }

  private buildStations(world: RAPIER.World, scene: THREE.Scene): void {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0xb6bec6, roughness: 0.86 });
    const stoneWallMat = new THREE.MeshStandardMaterial({
      color: 0x7b7f86,
      roughness: 0.92,
      flatShading: true,
    });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x3b4450, roughness: 0.7 });
    const woodShedMat = new THREE.MeshStandardMaterial({ color: 0x995932, roughness: 0.82 });
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0xb54434,
      roughness: 0.72,
      flatShading: true,
    });

    const addStaticBox = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setFriction(1.0),
        rb,
      );
    };

    // === LOWER VALLEY STATION (Top surface y = 0.0, z in [11, 24], x in [-13, 13]) ===
    addStaticBox(0, -1.0, 17.5, 26, 2.0, 13, concreteMat);
    // Stone retaining apron underneath
    const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(26.6, 2.4, 13.6), stoneWallMat);
    lowerBase.position.set(0, -2.3, 17.5);
    scene.add(lowerBase);

    // Safety perimeter curbs around Lower Station (leaving open funicular berths at x ∈ [-5.1, +5.1], z = 11.0)
    addStaticBox(0, 0.35, 23.8, 26, 0.7, 0.45, curbMat); // South back wall
    addStaticBox(-12.8, 0.35, 17.5, 0.45, 0.7, 13, curbMat); // West wall
    addStaticBox(12.8, 0.35, 17.5, 0.45, 0.7, 13, curbMat); // East wall
    addStaticBox(-9.1, 0.35, 11.2, 7.6, 0.7, 0.45, curbMat); // North-West cliff curb
    addStaticBox(9.1, 0.35, 11.2, 7.6, 0.7, 0.45, curbMat); // North-East cliff curb
    // Center divider pier between Car A and Car B berths
    addStaticBox(0, 0.35, 11.2, 1.1, 0.7, 0.5, curbMat);

    // === UPPER SUMMIT STATION (Top surface y = 11.0, z in [-24, -11], x in [-13, 13]) ===
    addStaticBox(0, STATION_Y.upper - 1.0, -17.5, 26, 2.0, 13, concreteMat);
    const upperRetaining = new THREE.Mesh(new THREE.BoxGeometry(26.6, 11.5, 13.6), stoneWallMat);
    upperRetaining.position.set(0, 4.4, -17.5);
    upperRetaining.castShadow = true;
    upperRetaining.receiveShadow = true;
    scene.add(upperRetaining);

    // Safety perimeter curbs around Upper Station (leaving open funicular berths at z = -11.0)
    addStaticBox(0, STATION_Y.upper + 0.35, -23.8, 26, 0.7, 0.45, curbMat); // North back wall
    addStaticBox(-12.8, STATION_Y.upper + 0.35, -17.5, 0.45, 0.7, 13, curbMat); // West wall
    addStaticBox(12.8, STATION_Y.upper + 0.35, -17.5, 0.45, 0.7, 13, curbMat); // East wall
    addStaticBox(-9.1, STATION_Y.upper + 0.35, -11.2, 7.6, 0.7, 0.45, curbMat); // South-West cliff curb
    addStaticBox(9.1, STATION_Y.upper + 0.35, -11.2, 7.6, 0.7, 0.45, curbMat); // South-East cliff curb
    addStaticBox(0, STATION_Y.upper + 0.35, -11.2, 1.1, 0.7, 0.5, curbMat);

    // Decorative alpine station depots outside the driving apron
    const addStationHouse = (x: number, y: number, z: number, label: string) => {
      const g = new THREE.Group();
      const walls = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.8, 3.6), woodShedMat);
      walls.position.y = 1.4;
      walls.castShadow = true;
      walls.receiveShadow = true;
      g.add(walls);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.7, 1.9, 4), roofMat);
      roof.position.y = 3.65;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      g.add(roof);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(3.6, 1.05),
        new THREE.MeshBasicMaterial({ map: createSignTexture('STATION', label) }),
      );
      sign.position.set(0, 2.1, 1.84);
      g.add(sign);

      g.position.set(x, y, z);
      scene.add(g);
    };

    addStationHouse(-10.2, STATION_Y.lower, 22.0, 'VALLEY');
    addStationHouse(10.2, STATION_Y.upper, -22.0, 'SUMMIT');

    // Interactive station dispatch lever posts next to the funicular berths
    const postMat = new THREE.MeshStandardMaterial({ color: 0x262d36, metalness: 0.4 });
    const leverKnobMat = new THREE.MeshStandardMaterial({
      color: 0xf5b726,
      emissive: 0x7a5000,
    });
    for (const [lx, ly, lz] of [
      [0, STATION_Y.lower, 12.1],
      [0, STATION_Y.upper, -12.1],
    ]) {
      const consoleBox = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.55), postMat);
      consoleBox.position.set(lx, ly + 0.55, lz);
      consoleBox.castShadow = true;
      scene.add(consoleBox);

      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), leverKnobMat);
      knob.position.set(lx, ly + 1.25, lz);
      scene.add(knob);
    }
  }

  private buildFunicularTracks(scene: THREE.Scene): void {
    const viaductMat = new THREE.MeshStandardMaterial({
      color: 0x8e959c,
      roughness: 0.88,
      flatShading: true,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x353c45,
      metalness: 0.65,
      roughness: 0.35,
    });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x6b4b32, roughness: 0.9 });

    // Concrete sloped viaduct ramp beneath the twin tracks
    const runZ = TRACK_LOWER_Z - TRACK_UPPER_Z + 5.2;
    const riseY = STATION_Y.upper - STATION_Y.lower;
    const len = Math.hypot(runZ, riseY);
    const angle = Math.atan2(riseY, runZ);

    const viaduct = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.4, len), viaductMat);
    viaduct.position.set(0, (STATION_Y.lower + STATION_Y.upper) / 2 - 2.35, 0);
    viaduct.rotation.x = angle;
    viaduct.receiveShadow = true;
    scene.add(viaduct);

    // Draw flared twin rails + wooden sleepers along the exact car path splines!
    for (const side of [-1, 1]) {
      const ptsLeft: THREE.Vector3[] = [];
      const ptsRight: THREE.Vector3[] = [];
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = side * (TRACK_X_STATION + TRACK_X_FLARE * Math.sin(Math.PI * t));
        const cy = STATION_Y.lower + (STATION_Y.upper - STATION_Y.lower) * t - 1.55;
        const cz = TRACK_LOWER_Z + (TRACK_UPPER_Z - TRACK_LOWER_Z) * t;
        ptsLeft.push(new THREE.Vector3(cx - 1.05, cy, cz));
        ptsRight.push(new THREE.Vector3(cx + 1.05, cy, cz));

        if (i % 2 === 0) {
          const tie = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.16, 0.32), tieMat);
          tie.position.set(cx, cy - 0.1, cz);
          tie.rotation.x = angle;
          tie.receiveShadow = true;
          scene.add(tie);
        }
      }

      for (const pts of [ptsLeft, ptsRight]) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const railGeo = new THREE.TubeGeometry(curve, 32, 0.08, 6, false);
        const railMesh = new THREE.Mesh(railGeo, railMat);
        railMesh.castShadow = true;
        scene.add(railMesh);
      }
    }
  }

  private buildWeighbridges(scene: THREE.Scene): void {
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3b4958, roughness: 0.72 });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf5b726, roughness: 0.55 });

    const configs: Array<{ station: StationId; x: number; z: number; signZ: number }> = [
      { station: 'lower', x: 0.2, z: 21.6, signZ: 23.2 },
      { station: 'upper', x: 0.2, z: -21.6, signZ: -23.2 },
    ];

    for (const cfg of configs) {
      const y = STATION_Y[cfg.station];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.06, 3.0), padMat);
      pad.position.set(cfg.x, y + 0.03, cfg.z);
      pad.receiveShadow = true;
      scene.add(pad);

      const border = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 3.2), frameMat);
      border.position.set(cfg.x, y + 0.02, cfg.z);
      scene.add(border);

      const signMat = new THREE.MeshBasicMaterial({
        map: createSignTexture('WEIGHBRIDGE', '0.0 T', '#18222c', '#4aa3df'),
      });
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 0.14), signMat);
      sign.position.set(cfg.x, y + 1.45, cfg.signZ);
      scene.add(sign);

      this.weighbridges.push({
        station: cfg.station,
        x: cfg.x,
        y,
        z: cfg.z,
        halfW: 1.75,
        halfD: 1.55,
        signMat,
        lastValue: -1,
      });
    }
  }

  public updateWeighbridge(wb: Weighbridge, tons: number): void {
    if (wb.lastValue === tons) return;
    wb.lastValue = tons;
    const oldMap = wb.signMat.map;
    wb.signMat.map = createSignTexture(
      'WEIGHBRIDGE',
      `${tons} T`,
      tons > 0 ? '#182a24' : '#18222c',
      tons > 0 ? '#42c97a' : '#4aa3df',
    );
    wb.signMat.needsUpdate = true;
    oldMap?.dispose();
  }

  public setDropZones(specs: DropZoneSpec[]): void {
    // Clear existing drop zone meshes
    while (this.dropZoneGroup.children.length > 0) {
      const child = this.dropZoneGroup.children[0];
      this.dropZoneGroup.remove(child);
    }
    this.activeDropZones = [];

    for (const spec of specs) {
      const y = STATION_Y[spec.station];
      const tex = createDropZoneTexture(spec.label, spec.color, spec.icon, false);
      const planeMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(spec.width, spec.depth), planeMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(spec.x, y + 0.035, spec.z);
      this.dropZoneGroup.add(plane);

      // Corner indicator beacon pole
      const beaconMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.color),
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: 0.45,
      });
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, 1.5, 8),
        new THREE.MeshStandardMaterial({ color: 0x2b323b }),
      );
      pole.position.set(spec.x - spec.width / 2 - 0.15, y + 0.75, spec.z - spec.depth / 2 - 0.15);
      this.dropZoneGroup.add(pole);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), beaconMat);
      orb.position.set(spec.x - spec.width / 2 - 0.15, y + 1.58, spec.z - spec.depth / 2 - 0.15);
      this.dropZoneGroup.add(orb);

      this.activeDropZones.push({
        spec,
        y,
        plane,
        beaconMat,
        satisfied: false,
      });
    }
  }

  public setDropZoneSatisfied(zone: ActiveDropZone, satisfied: boolean): void {
    if (zone.satisfied === satisfied) return;
    zone.satisfied = satisfied;
    const mat = zone.plane.material as THREE.MeshBasicMaterial;
    const oldMap = mat.map;
    mat.map = createDropZoneTexture(zone.spec.label, zone.spec.color, zone.spec.icon, satisfied);
    mat.needsUpdate = true;
    oldMap?.dispose();

    const hex = satisfied ? 0x42c97a : new THREE.Color(zone.spec.color).getHex();
    zone.beaconMat.color.setHex(hex);
    zone.beaconMat.emissive.setHex(hex);
    zone.beaconMat.emissiveIntensity = satisfied ? 1.1 : 0.45;
  }
}
