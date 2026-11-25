import * as THREE from 'three';

/**
 * 3/4 Overhead Follow Camera with stepped 90° rotation, right-click drag orbit,
 * mouse-wheel zoom, and seamless Diorama Overview toggle.
 */
export class OverheadCameraController {
  public readonly camera: THREE.PerspectiveCamera;
  public overviewMode = false;

  private targetAngleY = Math.PI * 0.22; // Classic 3/4 diagonal framing
  private currentAngleY = Math.PI * 0.22;
  private targetDistance = 24;
  private currentDistance = 24;

  private readonly lookAtPos = new THREE.Vector3(0, 1, 16);
  private readonly desiredLookAt = new THREE.Vector3(0, 1, 16);
  private readonly pitchRad = THREE.MathUtils.degToRad(47); // Crisp 3/4 overhead pitch

  constructor(aspect: number) {
    // Low telephoto FOV (35°) gives a clean stylized 3/4 diorama feel without fish-eye distortion
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.5, 240);
  }

  public rotateStep(dir: -1 | 1): void {
    this.targetAngleY += dir * (Math.PI / 2);
  }

  public dragOrbit(deltaX: number): void {
    this.targetAngleY -= deltaX * 0.0065;
  }

  public zoom(deltaY: number): void {
    if (this.overviewMode) return;
    this.targetDistance = THREE.MathUtils.clamp(this.targetDistance + deltaY * 0.015, 14, 38);
  }

  public toggleOverview(): boolean {
    this.overviewMode = !this.overviewMode;
    return this.overviewMode;
  }

  public resize(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public update(
    dt: number,
    forkliftPos: THREE.Vector3,
    forkliftFwd: THREE.Vector3,
    funicularMoving: boolean,
  ): void {
    const smooth = Math.min(1, dt * 6.5);

    if (this.overviewMode) {
      // Frame the entire mountain slope, both stations, and both funicular cars
      this.desiredLookAt.set(0, 5.2, 0.5);
      const overviewDist = 60;
      this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, overviewDist, smooth);
    } else {
      // 3/4 Overhead follow with gentle forward look-ahead
      const lead = funicularMoving ? 0 : 1.6;
      this.desiredLookAt.set(
        forkliftPos.x + forkliftFwd.x * lead,
        forkliftPos.y + 0.5,
        forkliftPos.z + forkliftFwd.z * lead,
      );
      const rideBonus = funicularMoving ? 6.0 : 0;
      this.currentDistance = THREE.MathUtils.lerp(
        this.currentDistance,
        this.targetDistance + rideBonus,
        smooth,
      );
    }

    this.currentAngleY = THREE.MathUtils.lerp(this.currentAngleY, this.targetAngleY, Math.min(1, dt * 9));
    this.lookAtPos.lerp(this.desiredLookAt, smooth);

    const horizDist = Math.cos(this.pitchRad) * this.currentDistance;
    const vertDist = Math.sin(this.pitchRad) * this.currentDistance;

    this.camera.position.set(
      this.lookAtPos.x + Math.sin(this.currentAngleY) * horizDist,
      this.lookAtPos.y + vertDist,
      this.lookAtPos.z + Math.cos(this.currentAngleY) * horizDist,
    );
    this.camera.lookAt(this.lookAtPos);
  }
}
