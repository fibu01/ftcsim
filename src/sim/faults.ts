export type FaultId = 'bindingDrag' | 'rampDrift' | 'motorReversed' | 'encoderDropout' | 'intakeJam';

export interface Fault { id: FaultId; label: string; on: boolean; severity: number; detail: string }

export const FAULTS: Fault[] = [
  { id: 'bindingDrag', label: 'Binding drag (left side)', on: false, severity: 0.5, detail: 'Left wheels rub the frame. Robot pulls left under power.' },
  { id: 'rampDrift', label: 'Ramp drift', on: false, severity: 0.5, detail: 'Heading wanders while crossing the ramp.' },
  { id: 'motorReversed', label: 'Motor reversed (backRight)', on: false, severity: 1, detail: 'backRight spins the wrong way.' },
  { id: 'encoderDropout', label: 'Encoder dropout (frontLeft)', on: false, severity: 1, detail: 'frontLeft encoder stops counting.' },
  { id: 'intakeJam', label: 'Intake jam', on: false, severity: 1, detail: 'Roller stalls, nothing comes in.' },
];

export function fault(id: FaultId): Fault { return FAULTS.find(f => f.id === id)!; }
