// All lengths in meters, angles in radians, time in seconds.
// Values marked [estimate] are tuning placeholders, not measured.
// Field sizes are placeholders until the Competition Manual field section is in docs/. [confirm in manual]

export const TICK = 0.02; // 20 ms fixed timestep

export const FIELD = {
  size: 3.6576, // 12 ft [confirm in manual]
  wallHeight: 0.3, // [confirm in manual]
  tile: 0.6096, // 24 in foam tile [confirm in manual]
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
  ticksPerRev: 537.7, // 312 rpm goBILDA style motor [estimate]
  motorFreeRpm: 312, // unloaded, at nominal voltage [estimate]
  motorStallAmps: 9.2, // per motor [estimate]
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

export const GAME = {
  pollenRadius: 0.0635, // [confirm in manual]
  nectarRadius: 0.0635, // [confirm in manual]
  pollenCount: 10,
  nectarCount: 4,
  hiveTipThreshold: 3, // pieces in the CELL before it TIPS [confirm in manual]
  // Placeholder scoring until the manual's scoring table is in docs/. [confirm in manual]
  pointsPerPieceInCell: 1,
  pointsPerHiveTip: 5,
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
