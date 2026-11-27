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
    scene.background = new THREE.Color(0x080c1a);
    scene.fog = new THREE.FogExp2(0x080c1a, 0.009);

    const hemi = new THREE.HemisphereLight(0x1a2e4a, 0x0a1220, 0.85);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0x4488cc, 1.2);
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

    // Cyan accent fill
    const fill = new THREE.DirectionalLight(0x3388aa, 0.35);
    fill.position.set(-20, 18, -16);
    scene.add(fill);

    // Warm rim light from behind
    const rim = new THREE.DirectionalLight(0x884466, 0.2);
    rim.position.set(10, 10, 30);
    scene.add(rim);
  }

  private buildAlpineBackdrop(scene: THREE.Scene): void {
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x2a3240,
      roughness: 0.65,
      metalness: 0.35,
      flatShading: true,
    });
    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x181e28,
      roughness: 0.55,
      metalness: 0.5,
      flatShading: true,
    });

    // Valley floor — dark composite plating
    const valley = new THREE.Mesh(new THREE.BoxGeometry(140, 2, 140), metalMat);
    valley.position.set(0, -3.2, 22);
    valley.receiveShadow = true;
    scene.add(valley);

    // Sloped mountainside beneath the funicular viaduct — structural ramp face
    const slopeLen = Math.hypot(22, 11) + 4;
    const slopeAngle = Math.atan2(11, 22);
    const hillside = new THREE.Mesh(new THREE.BoxGeometry(62, 6, slopeLen), darkMetalMat);
    hillside.position.set(0, 2.2, 0);
    hillside.rotation.x = slopeAngle;
    hillside.receiveShadow = true;
    scene.add(hillside);

    // Upper summit plateau — dark composite mass
    const plateau = new THREE.Mesh(new THREE.BoxGeometry(80, 14, 48), darkMetalMat);
    plateau.position.set(0, 3.6, -33);
    plateau.receiveShadow = true;
    scene.add(plateau);

    const plateauTop = new THREE.Mesh(new THREE.BoxGeometry(82, 1.0, 50), metalMat);
    plateauTop.position.set(0, 10.2, -33);
    plateauTop.receiveShadow = true;
    scene.add(plateauTop);

    // Scenic distant crystalline spires behind Upper Station
    const spireData: [number, number, number, number, number][] = [
      [-26, 10, -48, 14, 26],
      [-5, 10, -56, 18, 32],
      [22, 10, -50, 15, 28],
      [-36, 4, -22, 10, 18],
      [36, 4, -20, 11, 20],
    ];
    for (const [px, py, pz, rad, h] of spireData) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(rad, h, 5), darkMetalMat);
      spire.position.set(px, py + h / 2 - 2, pz);
      spire.castShadow = true;
      spire.receiveShadow = true;
      scene.add(spire);

      // Glowing cap
      const capMat = new THREE.MeshStandardMaterial({
        color: 0x3388cc,
        emissive: 0x1144aa,
        emissiveIntensity: 0.6,
        roughness: 0.3,
        flatShading: true,
      });
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.42, h * 0.38, 5), capMat);
      cap.position.set(px, py + h * 0.79 - 2, pz);
      scene.add(cap);
    }

    // Stylized sci-fi pylons lining the hillside
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x222c38,
      roughness: 0.5,
      metalness: 0.55,
      flatShading: true,
    });
    const glowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    const glowPinkMat = new THREE.MeshStandardMaterial({
      color: 0xcc44aa,
      emissive: 0xaa2288,
      emissiveIntensity: 1.0,
      roughness: 0.2,
    });
    const addPylon = (x: number, y: number, z: number, scale = 1, usePink = false) => {
      const g = new THREE.Group();
      // Tapered pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.14 * scale, 2.4 * scale, 6), pylonMat);
      pole.position.y = 1.2 * scale;
      pole.castShadow = true;
      g.add(pole);

      // Cross-arm top
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.08 * scale, 0.08 * scale), pylonMat);
      arm.position.y = 2.2 * scale;
      arm.castShadow = true;
      g.add(arm);

      // Glowing tip
      const tipMat = usePink ? glowPinkMat : glowCyanMat;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.1 * scale, 8, 6), tipMat);
      tip.position.y = 2.3 * scale;
      g.add(tip);

      g.position.set(x, y, z);
      scene.add(g);
    };

    const pylonSpots: [number, number, number, number, boolean][] = [
      [-15.5, -2.0, 16, 1.1, false],
      [-17.2, -2.0, 21, 0.9, true],
      [15.8, -2.0, 15, 1.15, false],
      [17.5, -2.0, 20, 0.85, false],
      [-12.5, 2.5, 5, 1.0, true],
      [12.5, 3.0, 4, 1.05, false],
      [-13.0, 6.2, -3, 1.1, false],
      [13.2, 6.5, -4, 0.95, true],
      [-16.0, 10.6, -15, 1.15, false],
      [-17.5, 10.6, -22, 0.95, false],
      [16.2, 10.6, -16, 1.1, true],
      [17.8, 10.6, -23, 1.0, false],
    ];
    for (const [x, y, z, s, p] of pylonSpots) addPylon(x, y, z, s, p);
  }

  private buildStations(world: RAPIER.World, scene: THREE.Scene): void {
    const metalFloorMat = new THREE.MeshStandardMaterial({ color: 0x242c36, roughness: 0.55, metalness: 0.3 });
    const darkPanelMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.5, metalness: 0.45 });
    const accentMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.4, metalness: 0.5 });
    const structuralMat = new THREE.MeshStandardMaterial({
      color: 0x2a3240,
      roughness: 0.45,
      metalness: 0.6,
      flatShading: true,
    });
    const glowCyanMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 0.7,
      roughness: 0.2,
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

    // === LOWER VALLEY STATION ===
    addStaticBox(0, -1.0, 17.5, 26, 2.0, 13, metalFloorMat);
    // Structural base panel underneath
    const lowerBase = new THREE.Mesh(new THREE.BoxGeometry(26.6, 2.4, 13.6), darkPanelMat);
    lowerBase.position.set(0, -2.3, 17.5);
    scene.add(lowerBase);

    // Safety perimeter curbs with accent strips
    addStaticBox(0, 0.35, 23.8, 26, 0.7, 0.45, accentMat); // South back wall
    addStaticBox(-12.8, 0.35, 17.5, 0.45, 0.7, 13, accentMat); // West wall
    addStaticBox(12.8, 0.35, 17.5, 0.45, 0.7, 13, accentMat); // East wall
    addStaticBox(-9.1, 0.35, 11.2, 7.6, 0.7, 0.45, accentMat); // North-West cliff curb
    addStaticBox(9.1, 0.35, 11.2, 7.6, 0.7, 0.45, accentMat); // North-East cliff curb
    // Center divider pier
    addStaticBox(0, 0.35, 11.2, 1.1, 0.7, 0.5, accentMat);

    // === UPPER SUMMIT STATION ===
    addStaticBox(0, STATION_Y.upper - 1.0, -17.5, 26, 2.0, 13, metalFloorMat);
    const upperRetaining = new THREE.Mesh(new THREE.BoxGeometry(26.6, 11.5, 13.6), darkPanelMat);
    upperRetaining.position.set(0, 4.4, -17.5);
    upperRetaining.castShadow = true;
    upperRetaining.receiveShadow = true;
    scene.add(upperRetaining);

    // Safety perimeter curbs
    addStaticBox(0, STATION_Y.upper + 0.35, -23.8, 26, 0.7, 0.45, accentMat); // North back wall
    addStaticBox(-12.8, STATION_Y.upper + 0.35, -17.5, 0.45, 0.7, 13, accentMat); // West wall
    addStaticBox(12.8, STATION_Y.upper + 0.35, -17.5, 0.45, 0.7, 13, accentMat); // East wall
    addStaticBox(-9.1, STATION_Y.upper + 0.35, -11.2, 7.6, 0.7, 0.45, accentMat); // South-West cliff curb
    addStaticBox(9.1, STATION_Y.upper + 0.35, -11.2, 7.6, 0.7, 0.45, accentMat); // South-East cliff curb
    addStaticBox(0, STATION_Y.upper + 0.35, -11.2, 1.1, 0.7, 0.5, accentMat);

    // Sci-fi station shelters instead of wooden depots
    const addStationShelter = (x: number, y: number, z: number, label: string) => {
      const g = new THREE.Group();
      // Sleek dark body
      const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.6, 3.6), structuralMat);
      body.position.y = 1.3;
      body.castShadow = true;
      body.receiveShadow = true;
      g.add(body);

      // Flat angular roof with glow strip
      const roof = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 4.0), accentMat);
      roof.position.y = 2.65;
      roof.castShadow = true;
      g.add(roof);

      // Cyan glow strip along roof edge
      const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.04, 0.04), glowCyanMat);
      glowStrip.position.set(0, 2.7, 2.0);
      g.add(glowStrip);

      // Holographic sign panel
      const signMat = new THREE.MeshBasicMaterial({
        map: createSignTexture('STATION', label, '#0e1620', '#44ccdd'),
      });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.05), signMat);
      sign.position.set(0, 1.7, 1.84);
      g.add(sign);

      g.position.set(x, y, z);
      scene.add(g);
    };

    addStationShelter(-10.2, STATION_Y.lower, 22.0, 'VALLEY');
    addStationShelter(10.2, STATION_Y.upper, -22.0, 'SUMMIT');

    // Holographic dispatch consoles next to the funicular berths
    const consoleMat = new THREE.MeshStandardMaterial({ color: 0x1c2430, metalness: 0.55, roughness: 0.4 });
    const consoleTopMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 0.6,
    });
    for (const [cx, cy, cz] of [
      [0, STATION_Y.lower, 12.1],
      [0, STATION_Y.upper, -12.1],
    ]) {
      const consoleBody = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.5), consoleMat);
      consoleBody.position.set(cx, cy + 0.6, cz);
      consoleBody.castShadow = true;
      scene.add(consoleBody);

      // Glowing top panel
      const topPanel = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.52), consoleTopMat);
      topPanel.position.set(cx, cy + 1.23, cz);
      scene.add(topPanel);

      // Red indicator on top
      const indicatorMat = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0xaa2222,
        emissiveIntensity: 0.8,
      });
      const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), indicatorMat);
      indicator.position.set(cx - 0.2, cy + 1.3, cz);
      scene.add(indicator);
    }
  }

  private buildFunicularTracks(scene: THREE.Scene): void {
    const viaductMat = new THREE.MeshStandardMaterial({
      color: 0x242c36,
      roughness: 0.45,
      metalness: 0.55,
      flatShading: true,
    });
    const railGlowMat = new THREE.MeshStandardMaterial({
      color: 0x44ccdd,
      emissive: 0x22aacc,
      emissiveIntensity: 0.8,
      roughness: 0.15,
    });
    const darkRailMat = new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      roughness: 0.4,
      metalness: 0.7,
    });
    const tieMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.55, metalness: 0.5 });

    // Sleek dark viaduct ramp beneath the twin tracks
    const runZ = TRACK_LOWER_Z - TRACK_UPPER_Z + 5.2;
    const riseY = STATION_Y.upper - STATION_Y.lower;
    const len = Math.hypot(runZ, riseY);
    const angle = Math.atan2(riseY, runZ);

    const viaduct = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.4, len), viaductMat);
    viaduct.position.set(0, (STATION_Y.lower + STATION_Y.upper) / 2 - 2.35, 0);
    viaduct.rotation.x = angle;
    viaduct.receiveShadow = true;
    scene.add(viaduct);

    // Glowing track rails + carbon-fiber ties along the exact car path splines!
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
        // Outer rail — glowing
        const outerRailGeo = new THREE.TubeGeometry(curve, 32, 0.06, 6, false);
        const outerRailMesh = new THREE.Mesh(outerRailGeo, railGlowMat);
        outerRailMesh.castShadow = true;
        scene.add(outerRailMesh);
        // Inner rail — dark structural
        const ptsInner = pts.map(p => new THREE.Vector3(p.x - 0.14, p.y, p.z));
        const curveInner = new THREE.CatmullRomCurve3(ptsInner);
        const innerRailGeo = new THREE.TubeGeometry(curveInner, 32, 0.1, 6, false);
        const innerRailMesh = new THREE.Mesh(innerRailGeo, darkRailMat);
        innerRailMesh.castShadow = true;
        scene.add(innerRailMesh);
      }
    }
  }

  private buildWeighbridges(scene: THREE.Scene): void {
    const padMat = new THREE.MeshStandardMaterial({ color: 0x1e2834, roughness: 0.45, metalness: 0.5 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      emissive: 0x112233,
      emissiveIntensity: 0.3,
    });

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

      const border = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.04, 3.2), accentMat);
      border.position.set(cfg.x, y + 0.02, cfg.z);
      scene.add(border);

      const signMat = new THREE.MeshBasicMaterial({
        map: createSignTexture('WEIGHBRIDGE', '0.0 T', '#0e1620', '#44ccdd'),
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
      tons > 0 ? '#0e2018' : '#0e1620',
      tons > 0 ? '#44ccdd' : '#44ccdd',
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

      // Corner indicator beacon pole — holographic style
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e2834, metalness: 0.6, roughness: 0.4 });
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8),
        poleMat,
      );
      pole.position.set(spec.x - spec.width / 2 - 0.15, y + 0.9, spec.z - spec.depth / 2 - 0.15);
      this.dropZoneGroup.add(pole);

      const beaconMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.color),
        emissive: new THREE.Color(spec.color),
        emissiveIntensity: 0.45,
      });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), beaconMat);
      orb.position.set(spec.x - spec.width / 2 - 0.15, y + 1.85, spec.z - spec.depth / 2 - 0.15);
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

    const hex = satisfied ? 0x44ccdd : new THREE.Color(zone.spec.color).getHex();
    zone.beaconMat.color.setHex(hex);
    zone.beaconMat.emissive.setHex(hex);
    zone.beaconMat.emissiveIntensity = satisfied ? 1.1 : 0.45;
  }
}
