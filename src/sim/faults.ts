export type FaultId = 'bindingDrag' | 'rampDrift' | 'motorReversed' | 'encoderDropout' | 'intakeJam' | 'imuDrift' | 'brownout' | 'gamepadDisconnect' | 'hubDisconnect' | 'sensorNoise';

export interface Fault { id: FaultId; label: string; on: boolean; severity: number; detail: string }

export const FAULTS: Fault[] = [
  { id: 'bindingDrag', label: 'Binding drag (left side)', on: false, severity: 0.5, detail: 'Left wheels rub the frame. Robot pulls left under power.' },
  { id: 'rampDrift', label: 'Ramp drift', on: false, severity: 0.5, detail: 'Heading wanders while crossing the ramp.' },
  { id: 'motorReversed', label: 'Motor reversed (backRight)', on: false, severity: 1, detail: 'backRight spins the wrong way.' },
  { id: 'encoderDropout', label: 'Encoder dropout (frontLeft)', on: false, severity: 1, detail: 'frontLeft encoder stops counting.' },
  { id: 'intakeJam', label: 'Intake jam', on: false, severity: 1, detail: 'Roller stalls, nothing comes in.' },
  { id: 'imuDrift', label: 'IMU drift (bad)', on: false, severity: 0.5, detail: 'Yaw walks off far faster than a healthy IMU.' },
  { id: 'brownout', label: 'Weak battery, brownout', on: false, severity: 0.6, detail: 'Tired pack. Full power sags the hub under 7 V and it resets.' },
  { id: 'gamepadDisconnect', label: 'Gamepad disconnect', on: false, severity: 0.5, detail: 'Driver station drops the gamepad for a moment.' },
  { id: 'hubDisconnect', label: 'Hub disconnect', on: false, severity: 0.5, detail: 'Expansion Hub drops off the bus. Motors stop, sensors freeze.' },
  { id: 'sensorNoise', label: 'Sensor noise and drift (normal)', on: true, severity: 1, detail: 'Realistic IMU noise, slow drift, encoder jitter, 40 ms read hold. Off gives perfect sensors.' },
];

export function fault(id: FaultId): Fault { return FAULTS.find(f => f.id === id)!; }
