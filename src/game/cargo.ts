import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { CargoKind, CargoSpawnSpec } from './types';
import { STATION_Y } from './levels';
import { createCrateTexture } from './textures';

export interface CargoItem {
  id: string;
  label: string;
  kind: CargoKind;
  massTons: number;
  targetZoneId?: string;
  spawnPos: THREE.Vector3;
  halfExtents: THREE.Vector3;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Group;
  /** Non-null while carried on the forklift forks */
  carried: boolean;
  /** Which funicular car currently owns this item during transit ('A' | 'B' | null) */
  ridingCar: 'A' | 'B' | null;
  /** Used to detect hard drops on fragile cargo */
  peakFallY: number;
  wasAirborne: boolean;
  delivered: boolean;
}

export function createCargoItem(
  spec: CargoSpawnSpec,
  world: RAPIER.World,
  scene: THREE.Scene,
): CargoItem {
  const halfW = spec.kind === 'heavy' ? 0.72 : 0.62;
  const halfH = spec.kind === 'ballast' ? 0.52 : 0.62;
  const halfD = spec.kind === 'heavy' ? 0.72 : 0.62;
  const halfExtents = new THREE.Vector3(halfW, halfH, halfD);

  const deckY = STATION_Y[spec.station];
  const spawnPos = new THREE.Vector3(spec.x, deckY + halfH + 0.02, spec.z);

  const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
    .setLinearDamping(1.8)
    .setAngularDamping(3.5)
    .setCanSleep(false);

  const body = world.createRigidBody(bodyDesc);

  const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD)
    .setDensity(spec.massTons * 0.5)
    .setFriction(1.15)
    .setRestitution(0.02);

  const collider = world.createCollider(colliderDesc, body);

  // Build stylized low-poly pallet + stenciled crate mesh
  const group = new THREE.Group();
  group.position.copy(spawnPos);

  const palletH = 0.16;
  const palletMat = new THREE.MeshStandardMaterial({
    color: 0x222c38,
    roughness: 0.65,
    metalness: 0.35,
    flatShading: true,
  });

  // Pallet top deck
  const palletTop = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 2, 0.06, halfD * 2),
    palletMat,
  );
  palletTop.position.y = -halfH + palletH - 0.03;
  palletTop.castShadow = true;
  palletTop.receiveShadow = true;
  group.add(palletTop);

  // Three pallet runners creating visible fork entry slots
  for (const offset of [-halfW + 0.09, 0, halfW - 0.09]) {
    const runner = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, palletH - 0.06, halfD * 2 - 0.04),
      palletMat,
    );
    runner.position.set(offset, -halfH + (palletH - 0.06) / 2, 0);
    runner.castShadow = true;
    runner.receiveShadow = true;
    group.add(runner);
  }

  // Main crate body sitting atop pallet
  const crateH = halfH * 2 - palletH;
  const tex = createCrateTexture(spec.kind, spec.massTons);
  const crateMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: spec.kind === 'ballast' ? 0.92 : 0.65,
    metalness: spec.kind === 'heavy' ? 0.18 : 0.04,
  });

  const crateMesh = new THREE.Mesh(
    new THREE.BoxGeometry(halfW * 1.92, crateH, halfD * 1.92),
    crateMat,
  );
  crateMesh.position.y = -halfH + palletH + crateH / 2;
  crateMesh.castShadow = true;
  crateMesh.receiveShadow = true;
  group.add(crateMesh);

  // Subtle top tie-down straps / indicator trim
  if (spec.kind === 'fragile') {
    const ribbonMat = new THREE.MeshStandardMaterial({
      color: 0xe695ff,
      emissive: 0x3b124f,
      roughness: 0.4,
    });
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(halfW * 1.96, 0.08, halfD * 1.96),
      ribbonMat,
    );
    band.position.y = halfH - 0.12;
    group.add(band);
  } else if (spec.kind === 'ballast') {
    // Iron lifting eye on top of stone ballast
    const ironMat = new THREE.MeshStandardMaterial({
      color: 0x2c323a,
      metalness: 0.6,
      roughness: 0.45,
    });
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 6, 12), ironMat);
    eye.position.y = halfH + 0.06;
    eye.castShadow = true;
    group.add(eye);
  }

  scene.add(group);

  return {
    id: spec.id,
    label: spec.label,
    kind: spec.kind,
    massTons: spec.massTons,
    targetZoneId: spec.targetZoneId,
    spawnPos,
    halfExtents,
    body,
    collider,
    mesh: group,
    carried: false,
    ridingCar: null,
    peakFallY: spawnPos.y,
    wasAirborne: false,
    delivered: false,
  };
}

export function syncCargoMesh(item: CargoItem): void {
  const t = item.body.translation();
  const r = item.body.rotation();
  item.mesh.position.set(t.x, t.y, t.z);
  item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
}

export function resetCargoToSpawn(item: CargoItem): void {
  item.carried = false;
  item.ridingCar = null;
  item.wasAirborne = false;
  item.peakFallY = item.spawnPos.y;
  item.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  item.body.setTranslation(item.spawnPos, true);
  item.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  item.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  item.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  syncCargoMesh(item);
}
