// All lengths in meters, angles in radians, time in seconds.
// Values marked [estimate] are tuning placeholders, not measured.
// Sizes marked with a manual section come from docs/field-notes.md. Element positions are still placeholders (roadmap item 7).

export const TICK = 0.02; // 20 ms fixed timestep

// Field numbers from the Competition Manual TU07, Section 9 (see docs/field-notes.md).
export const FIELD = {
  size: 3.6575, // 144 in inside the walls (9.2)
  wallHeight: 0.3, // perimeter wall height is not stated in text [estimate]
  tile: 0.6095, // 24 in tile (9.2)
  tileThickness: 0.015,
};

export const ROBOT = {
  length: 0.43, // frame, inside the 18 in (0.457 m) sizing limit with wheels [estimate]
  width: 0.38,
  chassisHeight: 0.09,
  mass: 12, // kg [estimate]
  wheelRadius: 0.048, // 96 mm mecanum [estimate]
  wheelWidth: 0.04,
  wheelbase: 0.30, // front to back axle [estimate]
  trackWidth: 0.40, // left to right wheel center. Outer wheel faces at 0.44 m, under the 0.457 m limit [estimate]
  // goBILDA 5203 312 rpm motor, from the manufacturer spec sheet as supplied by Justin on Nov 4 2026.
  ticksPerRev: 537.7, // encoder at the output shaft
  motorFreeRpm: 312, // no-load speed at 12 V
  motorStallAmps: 9.2, // stall current at 12 V
  motorStallTorqueNm: 2.38, // stall torque at 12 V (24.3 kg.cm)
  motorNoLoadAmps: 0.25, // no-load current at 12 V
  liftTravel: 0.45,
  liftSpeed: 0.35, // m/s at full power [estimate]
  intakeRadius: 0.03,
};

export const DRIVE = {
  // Loaded top speeds at 12 V. Free speed of a 312 rpm motor on 48 mm wheels is 1.57 m/s; a 12 kg robot runs under that. [estimate]
  maxForwardVel: 1.25,
  maxStrafeVel: 0.95,
  maxAccel: 3.0, // m/s^2 [estimate]
  forwardDecel: 1.0, // natural deceleration when coasting [estimate]
  strafeDecel: 1.3,
  maxAngularVel: 4.0, // rad/s [estimate]
  maxAngularAccel: 12.0,
  turnDecel: 2.0,
  nominalVoltage: 12.0,
  staticVelocity: 0.02, // dead zone, m/s
  staticAngular: 0.05,
};

// Game numbers from the Competition Manual TU07, Sections 9.8, 10.3, 10.5 (see docs/field-notes.md).
export const GAME = {
  pollenRadius: 0.0355, // 2.8 in (7.1 cm) ball (9.8)
  nectarRadius: 0.0455, // 3.6 in (9.1 cm) ball (9.8)
  pollenCount: 10, // sim scatters a subset; the real match stages 40 (10.3.1). Layout is still a placeholder.
  nectarCount: 4,
  hiveTipThreshold: 3, // the manual gives no count; the HIVE is bi-stable and tips on launched mass [estimate]
  // Table 10-2
  pointsPerPieceInCell: 2, // TELEOP, counted at match end
  pointsPerHiveTip: 20,
  pointsLeave: 3,
  pointsPark: 5,
  launchSpeed: 4.0, // m/s [estimate]
};

export const BATTERY = {
  openCircuit: 12.8, // fresh 12 V SLA pack [estimate]
  internalResistance: 0.12, // ohms, pack plus wiring [estimate]
  baseAmps: 0.6, // hubs and sensors with motors idle [estimate]
  drainPerCoulomb: 0.0004, // volts of open-circuit drop per coulomb drawn [estimate]
  brownoutVolts: 7.0, // Control Hub resets under this [estimate]
};

// Sensor imperfections. All on by default; the "Sensor noise" toggle turns them off.
export const SENSORS = {
  imuNoiseDeg: 0.25, // white noise on each read [estimate]
  imuDriftDegPerSec: 0.03, // slow random walk [estimate]
  encoderNoiseTicks: 1,
  readHoldTicks: 2, // sensors refresh every 40 ms, like a bulk read from the hub [estimate]
};
