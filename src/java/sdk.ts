// Sim FTC SDK: the classes, enums, and devices an OpMode can touch. Method names follow the SDK 12.0 samples in
// reference/ftc-sdk-samples. Anything not here fails with "Unsupported SDK call" and the line number.
import { Value, V, Native, NativeClass, Yield, JEnum, toJavaString, javaFormat, describe } from './interp';
import { JavaError } from './lexer';
import { Robot } from '../sim/robot';
import { SimMotor, Direction, RunMode, ZeroPowerBehavior, MAX_TICKS_PER_SEC } from '../sim/motor';
import { GamepadState, emptyGamepad } from '../sim/gamepad';
import { ROBOT } from '../config';

export interface SdkHost {
  robot: Robot;
  gamepad1(): GamepadState;
  gamepad2(): GamepadState;
  now(): number; // sim seconds
  log(level: 'info' | 'warn' | 'error', msg: string): void;
  telemetryOut(lines: string[]): void;
  requestStop(): void;
  rng(): number;
}

const enumCache = new Map<string, JEnum>();
function en(cls: string, name: string, ordinal: number): JEnum {
  const key = cls + '.' + name;
  if (!enumCache.has(key)) enumCache.set(key, { jclass: cls, name, ordinal, jtoString: () => name } as JEnum);
  return enumCache.get(key)!;
}
function enumClass(cls: string, names: string[]): NativeClass {
  return { jclass: cls, jstatic: (n, line) => { const i = names.indexOf(n); if (i < 0) throw new JavaError(`Unsupported SDK call: ${cls}.${n}`, line, 'unsupported'); return V.ref(en(cls, n, i)); },
    jcallStatic: (n, _a, line) => { if (n === 'values') return V.ref({ jclass: 'array' }); throw new JavaError(`Unsupported SDK call: ${cls}.${n}()`, line, 'unsupported'); } };
}
const num = (v: Value, line: number, what: string): number => { if (v.t === 'boolean' || v.t === 'String' || v.t === 'ref' || v.t === 'null') throw new JavaError(`${what} needs a number, got ${describe(v)}`, line, 'compile'); return v.v; };
const str = (v: Value) => toJavaString(v);
const isEnum = (v: Value, cls: string, line: number, what: string): string => { if (v.t !== 'ref' || v.v?.jclass !== cls) throw new JavaError(`${what} needs a ${cls}, got ${describe(v)}`, line, 'compile'); return v.v.name; };
const unsupported = (what: string, line: number): never => { throw new JavaError(`Unsupported SDK call: ${what}`, line, 'unsupported'); };

// Hardware names the sim knows, plus common aliases so SDK samples and older code run.
const ALIASES: Record<string, string> = {
  frontleft: 'frontLeft', front_left_drive: 'frontLeft', left_front_drive: 'frontLeft', frontleftdrive: 'frontLeft', leftfront: 'frontLeft', fl: 'frontLeft', leftfrontdrive: 'frontLeft', front_left: 'frontLeft', left_front: 'frontLeft',
  frontright: 'frontRight', front_right_drive: 'frontRight', right_front_drive: 'frontRight', frontrightdrive: 'frontRight', rightfront: 'frontRight', fr: 'frontRight', rightfrontdrive: 'frontRight', front_right: 'frontRight', right_front: 'frontRight',
  backleft: 'backLeft', back_left_drive: 'backLeft', left_back_drive: 'backLeft', backleftdrive: 'backLeft', leftback: 'backLeft', bl: 'backLeft', leftbackdrive: 'backLeft', back_left: 'backLeft', left_back: 'backLeft', rearleft: 'backLeft', left_rear: 'backLeft',
  backright: 'backRight', back_right_drive: 'backRight', right_back_drive: 'backRight', backrightdrive: 'backRight', rightback: 'backRight', br: 'backRight', rightbackdrive: 'backRight', back_right: 'backRight', right_back: 'backRight', rearright: 'backRight', right_rear: 'backRight',
  lift: 'lift', elevator: 'lift', slide: 'lift', arm: 'lift', intake: 'intake', roller: 'intake', imu: 'imu',
};

export function buildSdk(host: SdkHost): { natives: NativeClass[]; presets: Map<string, Value>; gamepads: GamepadDevice[]; telemetry: TelemetryDevice; base: LinearOpModeBase } {
  const natives: NativeClass[] = [];
  const robot = host.robot;

  // Enums
  const Direction = enumClass('DcMotor.Direction', ['FORWARD', 'REVERSE']);
  const RunModeE = enumClass('DcMotor.RunMode', ['RUN_WITHOUT_ENCODER', 'RUN_USING_ENCODER', 'STOP_AND_RESET_ENCODER', 'RUN_TO_POSITION']);
  const Zpb = enumClass('DcMotor.ZeroPowerBehavior', ['BRAKE', 'FLOAT', 'UNKNOWN']);
  const AngleUnit: NativeClass = { ...enumClass('AngleUnit', ['DEGREES', 'RADIANS']), jcallStatic: (n, a, line) => {
    if (n === 'normalizeDegrees') { let d = num(a[0], line, n) % 360; if (d > 180) d -= 360; if (d <= -180) d += 360; return V.double(d); }
    if (n === 'normalizeRadians') { let r = num(a[0], line, n) % (2 * Math.PI); if (r > Math.PI) r -= 2 * Math.PI; if (r <= -Math.PI) r += 2 * Math.PI; return V.double(r); }
    return unsupported(`AngleUnit.${n}()`, line);
  } };
  const CurrentUnit = enumClass('CurrentUnit', ['AMPS', 'MILLIAMPS']);
  const ServoDirection = enumClass('Servo.Direction', ['FORWARD', 'REVERSE']);
  const Logo = enumClass('RevHubOrientationOnRobot.LogoFacingDirection', ['UP', 'DOWN', 'FORWARD', 'BACKWARD', 'LEFT', 'RIGHT']);
  const Usb = enumClass('RevHubOrientationOnRobot.UsbFacingDirection', ['UP', 'DOWN', 'FORWARD', 'BACKWARD', 'LEFT', 'RIGHT']);
  const Resolution = enumClass('ElapsedTime.Resolution', ['SECONDS', 'MILLISECONDS']);
  const DistanceUnit = enumClass('DistanceUnit', ['METER', 'CM', 'MM', 'INCH']);

  const nested = (parent: string, children: Record<string, NativeClass>): NativeClass => ({
    jclass: parent,
    jstatic: (n, line) => { const c = children[n]; if (!c) return unsupported(`${parent}.${n}`, line); return V.ref({ jclass: 'Class', name: parent + '.' + n, nativeClass: c }); },
  });
  const motorStatics = { Direction, RunMode: RunModeE, ZeroPowerBehavior: Zpb };
  natives.push({ ...nested('DcMotor', motorStatics), jclass: 'DcMotor' }, { ...nested('DcMotorEx', motorStatics), jclass: 'DcMotorEx' }, { ...nested('DcMotorSimple', { Direction }), jclass: 'DcMotorSimple' });
  natives.push({ ...Direction, jclass: 'DcMotor.Direction' }, { ...RunModeE, jclass: 'DcMotor.RunMode' }, { ...Zpb, jclass: 'DcMotor.ZeroPowerBehavior' });
  natives.push({ ...Direction, jclass: 'DcMotorSimple.Direction' }, { ...Direction, jclass: 'DcMotorEx.Direction' }, { ...RunModeE, jclass: 'DcMotorEx.RunMode' }, { ...Zpb, jclass: 'DcMotorEx.ZeroPowerBehavior' });
  natives.push(AngleUnit, CurrentUnit, DistanceUnit, { ...nested('Servo', { Direction: ServoDirection }), jclass: 'Servo' }, { ...ServoDirection, jclass: 'Servo.Direction' });
  natives.push({ ...nested('ElapsedTime', { Resolution }), jclass: 'ElapsedTime', jnew: () => new ElapsedTimeDevice(host) }, { ...Resolution, jclass: 'ElapsedTime.Resolution' });
  natives.push({ ...nested('RevHubOrientationOnRobot', { LogoFacingDirection: Logo, UsbFacingDirection: Usb }), jclass: 'RevHubOrientationOnRobot', jnew: (a) => ({ jclass: 'RevHubOrientationOnRobot', args: a }) });
  natives.push({ ...Logo, jclass: 'RevHubOrientationOnRobot.LogoFacingDirection' }, { ...Usb, jclass: 'RevHubOrientationOnRobot.UsbFacingDirection' });
  natives.push({ jclass: 'IMU', jstatic: (n, line) => n === 'Parameters' ? V.ref({ jclass: 'Class', name: 'IMU.Parameters', nativeClass: ImuParams }) : unsupported(`IMU.${n}`, line) });
  const ImuParams: NativeClass = { jclass: 'IMU.Parameters', jnew: (a) => ({ jclass: 'IMU.Parameters', orientation: a[0] }) };
  natives.push(ImuParams);
  natives.push({ jclass: 'YawPitchRollAngles' }, { jclass: 'AngularVelocity' });

  // Math, Range, String, Integer, Double, System, Thread
  natives.push({ jclass: 'Math', jstatic: (n, line) => n === 'PI' ? V.double(Math.PI) : n === 'E' ? V.double(Math.E) : unsupported(`Math.${n}`, line),
    jcallStatic: (n, a, line) => {
      const x = () => num(a[0], line, `Math.${n}`), y = () => num(a[1], line, `Math.${n}`);
      const intish = (f: (v: number) => number) => a[0].t === 'int' ? V.int(f(a[0].v)) : a[0].t === 'long' ? V.long(f(a[0].v)) : V.double(f(a[0].v));
      switch (n) {
        case 'abs': return intish(Math.abs);
        case 'max': return a[0].t === 'int' && a[1].t === 'int' ? V.int(Math.max(x(), y())) : V.double(Math.max(x(), y()));
        case 'min': return a[0].t === 'int' && a[1].t === 'int' ? V.int(Math.min(x(), y())) : V.double(Math.min(x(), y()));
        case 'pow': return V.double(Math.pow(x(), y())); case 'sqrt': return V.double(Math.sqrt(x())); case 'cbrt': return V.double(Math.cbrt(x()));
        case 'sin': return V.double(Math.sin(x())); case 'cos': return V.double(Math.cos(x())); case 'tan': return V.double(Math.tan(x()));
        case 'asin': return V.double(Math.asin(x())); case 'acos': return V.double(Math.acos(x())); case 'atan': return V.double(Math.atan(x())); case 'atan2': return V.double(Math.atan2(x(), y()));
        case 'hypot': return V.double(Math.hypot(x(), y())); case 'signum': return V.double(Math.sign(x()));
        case 'floor': return V.double(Math.floor(x())); case 'ceil': return V.double(Math.ceil(x())); case 'round': return V.long(Math.round(x()));
        case 'toRadians': return V.double(x() * Math.PI / 180); case 'toDegrees': return V.double(x() * 180 / Math.PI);
        case 'exp': return V.double(Math.exp(x())); case 'log': return V.double(Math.log(x())); case 'log10': return V.double(Math.log10(x()));
        case 'random': return V.double(host.rng());
        case 'floorMod': return V.int(((x() % y()) + y()) % y());
      }
      return unsupported(`Math.${n}()`, line);
    } });
  natives.push({ jclass: 'Range', jcallStatic: (n, a, line) => {
    if (n === 'clip') { const v = num(a[0], line, n), lo = num(a[1], line, n), hi = num(a[2], line, n); const r = Math.max(lo, Math.min(hi, v)); return a[0].t === 'int' ? V.int(r) : V.double(r); }
    if (n === 'scale') { const [v, lo, hi, lo2, hi2] = a.map(x => num(x, line, n)); return V.double(lo2 + (v - lo) * (hi2 - lo2) / (hi - lo)); }
    return unsupported(`Range.${n}()`, line);
  } });
  natives.push({ jclass: 'String', jcallStatic: (n, a, line) => {
    if (n === 'format') return V.str(javaFormat(str(a[0]), a.slice(1), line));
    if (n === 'valueOf') return V.str(str(a[0]));
    if (n === 'join') return V.str(a.slice(1).map(str).join(str(a[0])));
    return unsupported(`String.${n}()`, line);
  } });
  natives.push({ jclass: 'Integer', jstatic: (n, line) => n === 'MAX_VALUE' ? V.int(2147483647) : n === 'MIN_VALUE' ? V.int(-2147483648) : unsupported(`Integer.${n}`, line),
    jcallStatic: (n, a, line) => n === 'parseInt' ? V.int(parseInt(str(a[0]))) : n === 'toString' || n === 'valueOf' ? (n === 'toString' ? V.str(String(a[0].v | 0)) : V.int(a[0].v)) : n === 'compare' ? V.int(Math.sign(a[0].v - a[1].v)) : unsupported(`Integer.${n}()`, line) });
  natives.push({ jclass: 'Double', jstatic: (n, line) => n === 'MAX_VALUE' ? V.double(Number.MAX_VALUE) : n === 'MIN_VALUE' ? V.double(Number.MIN_VALUE) : n === 'NaN' ? V.double(NaN) : n === 'POSITIVE_INFINITY' ? V.double(Infinity) : n === 'NEGATIVE_INFINITY' ? V.double(-Infinity) : unsupported(`Double.${n}`, line),
    jcallStatic: (n, a, line) => n === 'parseDouble' || n === 'valueOf' ? V.double(parseFloat(str(a[0]))) : n === 'toString' ? V.str(str(V.double(a[0].v))) : n === 'isNaN' ? V.bool(Number.isNaN(a[0].v)) : n === 'compare' ? V.int(Math.sign(a[0].v - a[1].v)) : unsupported(`Double.${n}()`, line) });
  natives.push({ jclass: 'Boolean', jcallStatic: (n, a, line) => n === 'parseBoolean' ? V.bool(str(a[0]).toLowerCase() === 'true') : n === 'toString' ? V.str(String(!!a[0].v)) : unsupported(`Boolean.${n}()`, line) });
  const sysOut: Native = { jclass: 'PrintStream', jcall: (n, a) => { host.log('info', 'System.out: ' + a.map(str).join('')); void n; return V.void(); } };
  natives.push({ jclass: 'System', jstatic: (n, line) => n === 'out' || n === 'err' ? V.ref(sysOut) : unsupported(`System.${n}`, line),
    jcallStatic: (n, _a, line) => n === 'currentTimeMillis' ? V.long(host.now() * 1000) : n === 'nanoTime' ? V.long(host.now() * 1e9) : unsupported(`System.${n}()`, line) });
  natives.push({ jclass: 'Thread', jcallStatic: (n, a, line) => n === 'sleep' ? (new Yield('sleep', num(a[0], line, n)) as unknown as Value) : unsupported(`Thread.${n}()`, line) });
  natives.push({ jclass: 'Exception', jnew: (a) => ({ jclass: 'Exception', msg: a[0] ? str(a[0]) : '', jcall: (n: string) => n === 'getMessage' ? V.str(a[0] ? str(a[0]) : '') : V.void(), jtoString: () => 'Exception: ' + (a[0] ? str(a[0]) : '') }) });
  natives.push({ jclass: 'RuntimeException', jnew: (a) => ({ jclass: 'RuntimeException', jcall: (n: string) => n === 'getMessage' ? V.str(a[0] ? str(a[0]) : '') : V.void(), jtoString: () => 'RuntimeException: ' + (a[0] ? str(a[0]) : '') }) });

  // Devices
  const motors = new Map<string, MotorDevice>();
  const servos = new Map<string, ServoDevice>();
  const imu = new ImuDevice(host);
  const hardwareMap: Native = {
    jclass: 'HardwareMap',
    jcall: (n, a, line) => {
      if (n === 'get' || n === 'tryGet') {
        const nameArg = a.length === 2 ? a[1] : a[0];
        const typeName: string | null = a.length === 2 ? (a[0].v?.name ?? null) : null;
        const name = str(nameArg);
        const dev = lookup(name, typeName, line, n === 'tryGet');
        return dev ? V.ref(dev) : V.null();
      }
      if (n === 'getAll') return unsupported('hardwareMap.getAll()', line);
      return unsupported(`hardwareMap.${n}()`, line);
    },
    jget: (n, line) => {
      const typed = (t: string): Native => ({ jclass: 'DeviceMapping', jcall: (m, a, l) => m === 'get' ? V.ref(lookup(str(a[0]), t, l, false)!) : unsupported(`hardwareMap.${n}.${m}()`, l) });
      if (n === 'dcMotor') return V.ref(typed('DcMotor'));
      if (n === 'servo') return V.ref(typed('Servo'));
      if (n === 'crservo') return V.ref(typed('CRServo'));
      if (n === 'appContext') return V.ref({ jclass: 'Context' });
      return unsupported(`hardwareMap.${n}`, line);
    },
  };
  function lookup(name: string, typeName: string | null, line: number, soft: boolean): Native | null {
    const key = ALIASES[name.toLowerCase()] ?? ALIASES[name.toLowerCase().replace(/[\s-]/g, '_')];
    const motorNames = Object.keys(robot.motors);
    if (typeName === 'Servo' || typeName === 'CRServo') {
      if (!servos.has(name)) servos.set(name, new ServoDevice(name, typeName === 'CRServo'));
      return servos.get(name)!;
    }
    if (typeName === 'IMU' || key === 'imu' || name.toLowerCase() === 'imu') return imu;
    if (typeName && !['DcMotor', 'DcMotorEx', 'DcMotorSimple', 'HardwareDevice'].includes(typeName)) {
      if (soft) return null;
      throw new JavaError(`Unsupported SDK call: hardwareMap.get(${typeName}.class, "${name}"). The simulator has motors, servos, and an IMU.`, line, 'unsupported');
    }
    if (key && motorNames.includes(key)) {
      if (!motors.has(key)) motors.set(key, new MotorDevice((robot.motors as any)[key] as SimMotor, name, host));
      return motors.get(key)!;
    }
    if (soft) return null;
    throw new JavaError(`Unable to find a hardware device with name "${name}". This robot's configuration has: ${motorNames.join(', ')}, imu.`, line, 'runtime');
  }

  const telemetry = new TelemetryDevice(host);
  const g1 = new GamepadDevice(() => host.gamepad1()), g2 = new GamepadDevice(() => host.gamepad2());
  const base = new LinearOpModeBase(host);
  const presets = new Map<string, Value>([
    ['hardwareMap', V.ref(hardwareMap)], ['telemetry', V.ref(telemetry)], ['gamepad1', V.ref(g1)], ['gamepad2', V.ref(g2)], ['$base', V.ref(base)],
  ]);
  return { natives, presets, gamepads: [g1, g2], telemetry, base };
}

export class MotorDevice implements Native {
  jclass = 'DcMotorEx';
  constructor(public motor: SimMotor, public configName: string, private host: SdkHost) {}
  jcall(n: string, a: Value[], line: number): Value {
    const m = this.motor;
    switch (n) {
      case 'setPower': m.setPower(num(a[0], line, 'setPower')); return V.void();
      case 'getPower': return V.double(m.getPower());
      case 'setDirection': m.setDirection(isEnum(a[0], 'DcMotor.Direction', line, 'setDirection') as Direction); return V.void();
      case 'getDirection': return V.ref(en('DcMotor.Direction', m.getDirection(), m.getDirection() === 'FORWARD' ? 0 : 1));
      case 'setMode': m.setMode(isEnum(a[0], 'DcMotor.RunMode', line, 'setMode') as RunMode); return V.void();
      case 'getMode': return V.ref(en('DcMotor.RunMode', m.getMode(), ['RUN_WITHOUT_ENCODER', 'RUN_USING_ENCODER', 'STOP_AND_RESET_ENCODER', 'RUN_TO_POSITION'].indexOf(m.getMode())));
      case 'setZeroPowerBehavior': m.setZeroPowerBehavior(isEnum(a[0], 'DcMotor.ZeroPowerBehavior', line, n) as ZeroPowerBehavior); return V.void();
      case 'getZeroPowerBehavior': return V.ref(en('DcMotor.ZeroPowerBehavior', m.zeroPowerBehavior, m.zeroPowerBehavior === 'BRAKE' ? 0 : 1));
      case 'getCurrentPosition': return V.int(m.getCurrentPosition());
      case 'getVelocity': { const v = m.getVelocity(); if (a[0]) { const u = isEnum(a[0], 'AngleUnit', line, n); const rev = v / ROBOT.ticksPerRev; return V.double(u === 'DEGREES' ? rev * 360 : rev * 2 * Math.PI); } return V.double(v); }
      case 'setVelocity': { let v = num(a[0], line, n); if (a[1]) { const u = isEnum(a[1], 'AngleUnit', line, n); v = (u === 'DEGREES' ? v / 360 : v / (2 * Math.PI)) * ROBOT.ticksPerRev; } m.setVelocity(v); return V.void(); }
      case 'setTargetPosition': m.setTargetPosition(num(a[0], line, n)); return V.void();
      case 'getTargetPosition': return V.int(m.getTargetPosition());
      case 'isBusy': return V.bool(m.isBusy());
      case 'setTargetPositionTolerance': m.targetTolerance = num(a[0], line, n); return V.void();
      case 'getTargetPositionTolerance': return V.int(m.targetTolerance);
      case 'setPIDFCoefficients': case 'setVelocityPIDFCoefficients': case 'setPositionPIDFCoefficients': case 'setPIDCoefficients':
        this.host.log('warn', `${this.configName}.${n}() accepted but the sim has no PIDF model yet`); return V.void();
      case 'getCurrent': { const u = isEnum(a[0], 'CurrentUnit', line, n); return V.double(u === 'MILLIAMPS' ? m.amps * 1000 : m.amps); }
      case 'getCurrentAlert': return V.double(9.2);
      case 'setCurrentAlert': return V.void();
      case 'isOverCurrent': return V.bool(m.amps > 9.2);
      case 'setMotorEnable': m.enabled = true; return V.void();
      case 'setMotorDisable': m.enabled = false; return V.void();
      case 'isMotorEnabled': return V.bool(m.enabled);
      case 'setPowerFloat': m.setZeroPowerBehavior('FLOAT'); m.setPower(0); return V.void();
      case 'getPowerFloat': return V.bool(m.zeroPowerBehavior === 'FLOAT' && m.getPower() === 0);
      case 'getDeviceName': return V.str('Sim goBILDA 5203 ' + this.configName);
      case 'getConnectionInfo': return V.str('sim');
      case 'getPortNumber': return V.int(0);
      case 'resetDeviceConfigurationForOpMode': m.setMode('RUN_WITHOUT_ENCODER'); m.setDirection('FORWARD'); m.setPower(0); return V.void();
      case 'close': return V.void();
      case 'getMotorType': return V.ref({ jclass: 'MotorConfigurationType', jcall: (mm: string) => mm === 'getTicksPerRev' ? V.double(ROBOT.ticksPerRev) : mm === 'getMaxRPM' ? V.double(ROBOT.motorFreeRpm) : mm === 'getAchieveableMaxTicksPerSecond' ? V.double(MAX_TICKS_PER_SEC) : unsupported(`MotorConfigurationType.${mm}()`, line) });
    }
    return unsupported(`DcMotor.${n}()`, line);
  }
}

export class ServoDevice implements Native {
  jclass: string; position = 0.5; power = 0; direction = 'FORWARD'; lo = 0; hi = 1;
  constructor(public name: string, public continuous: boolean) { this.jclass = continuous ? 'CRServo' : 'Servo'; }
  jcall(n: string, a: Value[], line: number): Value {
    switch (n) {
      case 'setPosition': this.position = Math.max(0, Math.min(1, num(a[0], line, n))); return V.void();
      case 'getPosition': return V.double(this.position);
      case 'setPower': this.power = Math.max(-1, Math.min(1, num(a[0], line, n))); return V.void();
      case 'getPower': return V.double(this.power);
      case 'setDirection': this.direction = isEnum(a[0], 'Servo.Direction', line, n); return V.void();
      case 'getDirection': return V.ref(en('Servo.Direction', this.direction, this.direction === 'FORWARD' ? 0 : 1));
      case 'scaleRange': this.lo = num(a[0], line, n); this.hi = num(a[1], line, n); return V.void();
      case 'getDeviceName': return V.str('Sim servo ' + this.name);
      case 'close': return V.void();
    }
    return unsupported(`${this.jclass}.${n}()`, line);
  }
}

export class ImuDevice implements Native {
  jclass = 'IMU'; private yawOffset = 0; initialized = false;
  constructor(private host: SdkHost) {}
  jcall(n: string, a: Value[], line: number): Value {
    const r = this.host.robot;
    switch (n) {
      case 'initialize': this.initialized = true; return V.bool(true);
      case 'resetYaw': this.yawOffset = r.imuYaw(); return V.void();
      case 'getRobotYawPitchRollAngles': {
        const yaw = r.imuYaw() - this.yawOffset;
        const norm = (rad: number) => { let x = rad % (2 * Math.PI); if (x > Math.PI) x -= 2 * Math.PI; if (x <= -Math.PI) x += 2 * Math.PI; return x; };
        const conv = (rad: number, u: Value, l: number, what: string) => { const unit = isEnum(u, 'AngleUnit', l, what); return V.double(unit === 'DEGREES' ? norm(rad) * 180 / Math.PI : norm(rad)); };
        const t = this.host.now();
        return V.ref({ jclass: 'YawPitchRollAngles', jcall: (m: string, b: Value[], l: number) => m === 'getYaw' ? conv(yaw, b[0], l, m) : m === 'getPitch' || m === 'getRoll' ? conv(0, b[0], l, m) : m === 'getAcquisitionTime' ? V.long(t * 1e9) : m === 'toString' ? V.str(`yaw=${(norm(yaw) * 180 / Math.PI).toFixed(1)}`) : unsupported(`YawPitchRollAngles.${m}()`, l) });
      }
      case 'getRobotAngularVelocity': {
        const unit = isEnum(a[0], 'AngleUnit', line, n); const z = unit === 'DEGREES' ? r.yawRate * 180 / Math.PI : r.yawRate;
        return V.ref({ jclass: 'AngularVelocity', jget: (f: string, l: number) => f === 'zRotationRate' ? V.double(z) : f === 'xRotationRate' || f === 'yRotationRate' ? V.double(0) : unsupported(`AngularVelocity.${f}`, l) });
      }
      case 'getDeviceName': return V.str('Sim IMU');
      case 'close': return V.void();
      case 'getRobotOrientation': case 'getRobotOrientationAsQuaternion': return unsupported(`imu.${n}() (use getRobotYawPitchRollAngles)`, line);
    }
    return unsupported(`IMU.${n}()`, line);
  }
}

export class TelemetryDevice implements Native {
  jclass = 'Telemetry'; private pending: string[] = []; lines: string[] = []; autoClear = true;
  constructor(private host: SdkHost) {}
  jcall(n: string, a: Value[], line: number): Value {
    switch (n) {
      case 'addData': {
        const cap = str(a[0]);
        const val = a.length === 2 ? str(a[1]) : a.length > 2 && a[1].t === 'String' ? javaFormat(a[1].v, a.slice(2), line) : a.slice(1).map(str).join(' ');
        this.pending.push(`${cap} : ${val}`);
        return V.ref({ jclass: 'Telemetry.Item', jcall: (m: string, b: Value[]) => { if (m === 'setRetained') return V.void(); if (m === 'addData') { this.pending[this.pending.length - 1] += ` | ${str(b[0])} : ${b.length > 2 ? javaFormat(str(b[1]), b.slice(2), line) : str(b[1])}`; } return V.void(); } });
      }
      case 'addLine': this.pending.push(a[0] ? str(a[0]) : ''); return V.ref({ jclass: 'Telemetry.Line', jcall: (m: string, b: Value[]) => { if (m === 'addData') this.pending[this.pending.length - 1] += ` ${str(b[0])} : ${b.length > 2 ? javaFormat(str(b[1]), b.slice(2), line) : str(b[1])}`; return V.void(); } });
      case 'update': this.lines = this.pending.slice(); if (this.autoClear) this.pending = []; this.host.telemetryOut(this.lines); return V.bool(true);
      case 'clear': case 'clearAll': this.pending = []; return V.void();
      case 'setAutoClear': this.autoClear = !!a[0].v; return V.void();
      case 'setMsTransmissionInterval': case 'setDisplayFormat': case 'setCaptionValueSeparator': case 'setItemSeparator': case 'speak': return V.void();
      case 'getMsTransmissionInterval': return V.int(250);
      case 'log': return V.ref({ jclass: 'Telemetry.Log', jcall: (m: string, b: Value[]) => { if (m === 'add') this.host.log('info', 'telemetry.log: ' + (b.length > 1 ? javaFormat(str(b[0]), b.slice(1), line) : str(b[0]))); return V.void(); } });
      case 'addAction': return unsupported('telemetry.addAction()', line);
    }
    return unsupported(`telemetry.${n}()`, line);
  }
}

export class GamepadDevice implements Native {
  jclass = 'Gamepad';
  private prev: GamepadState = emptyGamepad();
  private cur: GamepadState = emptyGamepad();
  constructor(private read: () => GamepadState) {}
  // Called once per tick by the runner so edge methods (aWasPressed) are stable within a loop.
  refresh() { this.prev = this.cur; this.cur = this.read(); }
  private btn(name: string): boolean | number | null {
    const g = this.cur as any;
    const map: Record<string, string> = { cross: 'a', circle: 'b', square: 'x', triangle: 'y', options: 'start', share: 'back', ps: 'guide' };
    const k = map[name] ?? name;
    if (k in g) return g[k];
    if (['start', 'back', 'guide', 'left_stick_button', 'right_stick_button', 'touchpad', 'touchpad_finger_1', 'touchpad_finger_2'].includes(k)) return false;
    if (['touchpad_finger_1_x', 'touchpad_finger_1_y', 'touchpad_finger_2_x', 'touchpad_finger_2_y'].includes(k)) return 0;
    return null;
  }
  jget(n: string, line: number): Value {
    if (n === 'left_trigger_pressed') return V.bool(this.cur.left_trigger > 0.5);
    if (n === 'right_trigger_pressed') return V.bool(this.cur.right_trigger > 0.5);
    const v = this.btn(n);
    if (v === null) return unsupported(`gamepad.${n}`, line);
    return typeof v === 'boolean' ? V.bool(v) : V.double(v);
  }
  jset(n: string, v: Value, line: number) { void n; void v; void line; }
  jcall(n: string, a: Value[], line: number): Value {
    const edge = /^([a-zA-Z]+?)(WasPressed|WasReleased)$/.exec(n);
    if (edge) {
      const key = edge[1].replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^dpad_(up|down|left|right)$/, 'dpad_$1');
      const map: Record<string, string> = { left_bumper: 'left_bumper', right_bumper: 'right_bumper', left_trigger: 'left_trigger', right_trigger: 'right_trigger' };
      const k = map[key] ?? key;
      const now = this.btn(k), before = (this.prev as any)[k] ?? (this.btn(k) === null ? null : false);
      if (now === null) return unsupported(`gamepad.${n}()`, line);
      const pressed = (x: boolean | number) => typeof x === 'number' ? x > 0.5 : x;
      const p = pressed(now), q = pressed(before as any);
      return V.bool(edge[2] === 'WasPressed' ? p && !q : !p && q);
    }
    switch (n) {
      case 'rumble': case 'rumbleBlips': case 'stopRumble': case 'runRumbleEffect': case 'setLedColor': case 'runLedEffect': return V.void();
      case 'isRumbling': return V.bool(false);
      case 'atRest': return V.bool(Object.values(this.cur).every(v => typeof v === 'number' ? Math.abs(v) < 0.01 : !v));
      case 'getGamepadId': return V.int(0);
      case 'toString': return V.str('Gamepad');
    }
    void a; return unsupported(`gamepad.${n}()`, line);
  }
}

export class ElapsedTimeDevice implements Native {
  jclass = 'ElapsedTime'; private start: number;
  constructor(private host: SdkHost) { this.start = host.now(); }
  jcall(n: string, _a: Value[], line: number): Value {
    const t = this.host.now() - this.start;
    switch (n) {
      case 'reset': this.start = this.host.now(); return V.void();
      case 'seconds': return V.double(t); case 'milliseconds': return V.double(t * 1000); case 'nanoseconds': return V.long(t * 1e9);
      case 'time': return V.double(t); case 'now': return V.long(this.host.now() * 1e9); case 'startTime': return V.double(this.start);
      case 'toString': return V.str(`${t.toFixed(3)} seconds`);
      case 'getResolution': return V.ref(en('ElapsedTime.Resolution', 'SECONDS', 0));
    }
    return unsupported(`ElapsedTime.${n}()`, line);
  }
  jtoString() { return `${(this.host.now() - this.start).toFixed(3)} seconds`; }
}

// Methods inherited from LinearOpMode / OpMode. The runner owns the state flags.
export class LinearOpModeBase implements Native {
  jclass = 'LinearOpMode';
  started = false; stopRequested = false; startTime = 0;
  constructor(private host: SdkHost) {}
  get active() { return this.started && !this.stopRequested; }
  jcall(n: string, a: Value[], line: number): Value | Yield {
    switch (n) {
      case 'waitForStart': return new Yield('waitForStart');
      case 'opModeIsActive': return new Yield('tick');       // runner resumes with the current active flag
      case 'opModeInInit': return V.bool(!this.started && !this.stopRequested);
      case 'isStarted': return V.bool(this.started);
      case 'isStopRequested': return V.bool(this.stopRequested);
      case 'idle': return new Yield('tick');
      case 'sleep': return new Yield('sleep', num(a[0], line, 'sleep'));
      case 'requestOpModeStop': this.host.requestStop(); return V.void();
      case 'terminateOpModeNow': this.host.requestStop(); return new Yield('tick');
      case 'getRuntime': return V.double(this.host.now() - this.startTime);
      case 'resetRuntime': this.startTime = this.host.now(); return V.void();
      case 'updateTelemetry': return V.void();
      case 'internalPreInit': case 'internalPostInitLoop': case 'internalPostLoop': return V.void();
    }
    return unsupported(`${n}()`, line);
  }
  jget(n: string, line: number): Value { if (n === 'time') return V.double(this.host.now() - this.startTime); return unsupported(n, line); }
}
