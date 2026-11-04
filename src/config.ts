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
  length: 0.4318, // 17 in [estimate]
  width: 0.4318,
  chassisHeight: 0.09,
  mass: 12, // kg [estimate]
  wheelRadius: 0.048, // 96 mm mecanum [estimate]
  wheelWidth: 0.04,
  wheelbase: 0.30, // front to back axle [estimate]
  trackWidth: 0.47, // left to right wheel center, wheels sit outside the frame [estimate]
  ticksPerRev: 537.7, // 312 rpm goBILDA style motor [estimate]
  liftTravel: 0.45,
  liftSpeed: 0.35, // m/s at full power [estimate]
  intakeRadius: 0.03,
};

export const DRIVE = {
  maxForwardVel: 1.5, // m/s [estimate]
  maxStrafeVel: 1.1,
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
  launchSpeed: 4.0, // m/s [estimate]
};
