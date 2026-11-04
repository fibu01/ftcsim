# ftcsim handoff (updated 2026-11-04)

## Phase 2 done (Nov 4): Java OpModes run in the browser
- src/java/: lexer, parser (Java subset: classes, fields, methods, locals, arrays, for/while/do/switch/try, ternary, casts, lambdas, enhanced for, annotations), generator-based interpreter (yields once per sim tick at opModeIsActive/idle/sleep/waitForStart), Sim SDK (sdk.ts), OpMode runner (opmode.ts).
- Sim SDK surface: hardwareMap.get(Class, name) and get(name) with aliases for common motor names, DcMotor/DcMotorEx (power, direction, run modes incl. RUN_TO_POSITION and STOP_AND_RESET_ENCODER, zero power, encoder position and velocity, setVelocity, target position, isBusy, current, enable), Servo and CRServo (stored only, no mechanism), IMU (initialize, resetYaw, getRobotYawPitchRollAngles().getYaw(AngleUnit), getRobotAngularVelocity), telemetry (addData with format strings, addLine, update, log), gamepad1 and gamepad2 fields plus xWasPressed()/WasReleased() edges, ElapsedTime, Math, Range, String.format, Integer/Double, System.out, Thread.sleep, LinearOpMode (waitForStart, opModeIsActive, isStopRequested, sleep, idle, requestOpModeStop, getRuntime) and iterative OpMode (init, init_loop, start, loop, stop).
- Anything else: "Unsupported SDK call: X" with the line. Unknown hardware name: SDK-style error listing the config names. Compile errors and runtime errors highlight the line in Monaco.
- UI: Code button opens a Monaco pane (tabs, Load sample, Compile, Ctrl+Enter). Driver Station panel: mode, Auto and TeleOp OpMode selects (built-ins plus compiled classes by @Autonomous/@TeleOp), INIT, START, STOP, telemetry lines. The file being edited becomes the selected OpMode on compile.
- Samples: slide 21 working, slide 21 buggy, an encoder + IMU autonomous. The SDK's BasicOmniOpMode_Linear.java runs unchanged (unit test).
- Verified: 26 vitest tests (19 for the Java layer); headless UI run: working TeleOp drives 1.38 m forward in 1.5 s, buggy one drives backward, wrong hardware name stops the OpMode with the line, encoder auto drives 1.2 m, turns to -37 deg, lifts.
- config.ts ROBOT.mirroredLeftMotors (default true): left motors need setDirection(REVERSE) like a real chassis. The deck's slide 21 code lacks those two lines; the samples here add them.
- Monaco adds ~7 MB to the bundle (2.5 MB gzipped). Fine for GitHub Pages; lazy-load later if it matters.

## State
- Phase 1 built and pushed: field, robot, Rapier physics, keyboard and controller drive, four cameras, telemetry, event log, five faults, run/pause/step/reset, speed, quality toggle. Reset rebuilds the physics world so replays match.
- Match clock: TeleOp, Autonomous (30 s), or Full match (AUTO 30 s then TELEOP 120 s, from the postcard, [confirm in manual]). Built-in sample auto (src/opmode/sampleAuto.ts) seeks POLLEN by a vision stand-in bearing, intakes, aims at the HIVE, launches, repeats, parks at 24 s. Headless run on Nov 4 (lane z = 0.9): 3 launches, 2 in the CELL.
- Intake: roller pulls balls in from a cone in front, captured ball travels to the hold point over 0.4 s (no teleport), balls have low bounce and roll to a stop.
- Verified headless (Playwright, swiftshader): forward, strafe, turn, binding drag pulls left, reversed motor spins, encoder dropout freezes frontLeft, intake grabs and launch throws, two identical runs give identical poses. 7 vitest unit tests on the mecanum model pass.
- Not verified: frame rate on a real laptop, controller input, look in a real GPU browser. Headless renders at 2 to 5 fps, which says nothing about real hardware.
- GitHub Pages workflow in .github/workflows/pages.yml. Justin has to set Pages source to "GitHub Actions" in repo settings once.

## Added Nov 4 after Justin's review
- Battery model: open circuit 12.8 V, 0.12 ohm, current from commanded power and motor load, slow drain. Full-power run sags to 11.7 V at 9.4 A. Brownout fault: tired pack, hub resets under 7 V, encoders zero, motors off 1.5 s.
- Sensors: IMU white noise 0.25 deg, slow drift, encoder jitter 1 tick, 40 ms read hold. "Sensor noise" toggle (on by default) turns them off for perfect reads. IMU drift fault adds a fast walk. Telemetry shows IMU yaw and true yaw side by side.
- Encoders read the wheel, not the body: when the body is blocked the wheels slip toward commanded speed. Head-on wall hit at full power now reads four equal encoder speeds and 29 deg/s peak yaw (was 224 deg/s with mixed signs).
- Robot box: 0.43 by 0.38 m frame, wheels at 0.40 m track, outer faces 0.44 m, under the 18 in limit. Rounded collider, angular damping 3.5.
- Drive top speed is now the loaded 12 V figure (1.25 forward, 0.95 strafe). Measured 1.2 and 0.87 with sag. No stall or torque curve yet.
- Faults added: IMU drift, brownout, gamepad disconnect, hub disconnect. No servo model yet, so no stuck servo.
- Start lane moved to z = 0.9 so the robot clears the flowers and hive posts.

## Added Nov 4, second review
- Encoder dropout now reads position held and velocity 0 (was: position frozen, velocity live).
- Full match: AUTO 30 s, TRANSITION 8 s placeholder with the OpMode stopped, TELEOP 120 s, DONE with an end-of-match log line. [confirm in manual]
- Placeholder score in telemetry: 1 per piece in the CELL, 5 for a tip. [confirm in manual]
- Limits button in the run bar opens a panel listing what is and isn't modeled.
- docs/PRD.md has a 10-item roadmap from the review. Order: SDK layer, robot config, run export and diff, batch runs, motor and traction model, sensors and camera, manual field and scoring, alliance robots, more faults, confidence panel.
- Checked: pure translation in open field gives 0.00 deg yaw (forward, strafe, both diagonals). The 15 deg swing in the review came from touching a field element on the old start lane.

## Added Nov 4, manual landed
- docs/BIOBUZZ_Competition_Manual_TU07.pdf uploaded by Justin. docs/field-notes.md extracts Section 9 (field, HIVE, FLOWER, elements), 10.3 staging, 10.4 timing, Table 10-2 points, R102 sizing.
- Applied: field 144 in, tile 24 in, POLLEN 7.1 cm and NECTAR 9.1 cm, 8 s transition confirmed, tip 20 and CELL piece 2 points. Motor constants from the goBILDA 5203 sheet (Justin, Nov 4) in config.ts.
- Not applied yet (roadmap item 7): hive structure in the field center with two hives, four wall-mounted flowers, gardens, loading zones, staging layout, LEAVE, PARK, FLOWER and GARDEN scoring. The manual has no ramp; ours stays as a teaching obstacle until then.
- Unknown: flower positions along the walls (need field CAD), tip threshold.

## Run
`npm install && npm run dev` then open the URL. `npm test` for unit tests. `npm run build` for dist/.

## Next
- Phase 2: Monaco code pane and the Java subset translator (docs/PRD.md). Acceptance: the slide 21 TeleOp runs unchanged.
- Visual polish once Justin sends Higgsfield textures (tile floor, honeycomb, arena backdrop).
- Field sizes stay placeholders until the manual's field section is in docs/.

## Known gaps
- Robot pitch and roll are locked, so the ramp is ridden flat.
- HIVE, FLOWERS, and the ramp are rough placeholder shapes.
- Intake grabs when a ball is in the mouth zone, not by collider contact.
