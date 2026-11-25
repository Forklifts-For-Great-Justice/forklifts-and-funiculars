export type StationId = 'lower' | 'upper';

export type CargoKind = 'supply' | 'heavy' | 'fragile' | 'ballast';

export interface Vec3Tuple {
  x: number;
  y: number;
  z: number;
}

export interface CargoSpawnSpec {
  id: string;
  label: string;
  kind: CargoKind;
  massTons: number;
  station: StationId;
  /** Offset on the station deck (y is computed automatically from station deck elevation) */
  x: number;
  z: number;
  /** If defined, this cargo is part of the delivery manifest and must reach this drop zone id */
  targetZoneId?: string;
}

export interface DropZoneSpec {
  id: string;
  label: string;
  station: StationId;
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  icon: 'crate' | 'gear' | 'wine';
  acceptsKind: CargoKind;
}

export interface LevelSpec {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  deltaMaxTons: number;
  maxCarLoadTons: number;
  parTrips: number;
  forkliftStart: {
    station: StationId;
    x: number;
    z: number;
    yaw: number;
  };
  cargo: CargoSpawnSpec[];
  dropZones: DropZoneSpec[];
}

export interface ControlInput {
  throttle: number; // -1..1
  steer: number; // -1..1 (positive = left)
  crawl: boolean;
  lift: number; // -1..1
  tilt: number; // -1..1
}

export interface HudSnapshot {
  levelIndex: number;
  levelName: string;
  levelSubtitle: string;
  trips: number;
  parTrips: number;
  damageCount: number;
  carAMass: number;
  carBMass: number;
  diffMass: number;
  deltaMax: number;
  maxCarLoad: number;
  balanced: boolean;
  funicularState: 'LOWER_DOCKED' | 'UPPER_DOCKED' | 'MOVING';
  carAStation: string;
  carBStation: string;
  forkHeight: number;
  mastTiltDeg: number;
  deckLocked: boolean;
  carryingLabel: string | null;
  overviewMode: boolean;
  manifest: Array<{
    id: string;
    label: string;
    massTons: number;
    targetLabel: string;
    delivered: boolean;
  }>;
  completed: boolean;
  completedLevels: string[];
}
