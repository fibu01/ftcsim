# FTC 3D Robot Simulator: PRD (2026-11-04)

Status: decisions made Nov 4. Signed off when Justin says go on Phase 1.

## Decisions (Justin, Nov 4)

1. Deadline: workshop delayed one week. Target: full demo build by Thursday Nov 12 for a Friday Nov 13 delivery.
2. Team number: none. No decal, no config field.
3. Field: BIOBUZZ. The game postcard (saved as `docs/game-postcard.md`) gives the elements and vocabulary: POLLEN and NECTAR game pieces, HIVE with a CELL that TIPS, FLOWERS. It has no dimensions. Element sizes and positions stay [confirm in manual] until the Competition Manual field section is saved in `docs/`.
4. Repo: separate, https://github.com/fibu01/ftcsim. Code, PRD, and reference files live there. This repo keeps only this pointer and the workshop deck.
5. SDK reference: FtcRobotController 12.0 (Sept 2026). The Sim SDK surface and method names come from its samples, not from memory.

## Summary

A browser-based 3D simulator of one FTC mecanum robot on one competition field. Students paste a Java TeleOp into a code pane, run it, drive the robot with keyboard or gamepad, watch telemetry, inject faults, and replay a run. It replaces the Feb 2026 2D simulator, which was too basic and whose location was never recorded. It's built from scratch.

The visual target is a modern game engine demo: physically based materials, real-time shadows, bloom, a dark venue with lit field lines. It is not photoreal. The robot is hand-built geometry, not a scanned model, so its wheels, elevator, and intake can move separately.

## Users

- Workshop attendees from other FTC teams, on their own laptops, no install.
- Justin presenting Demos 1 to 3 and the slide 21 debug exercise.
- The team's drivers and programmers during the season.

## Platform

- Static site: Vite, TypeScript, Three.js, Rapier (WASM). Hosted on GitHub Pages from this repo and runnable offline from a local build. No backend, no accounts, no network calls at runtime.
- Target: a 2023 or newer laptop with integrated graphics at 60 fps, 1080p. A quality toggle (shadows, bloom, resolution scale) for weaker machines.
- Browsers: current Chrome and Edge. Safari and Firefox are best effort.

## Robot

Parametric model with named parts and a single config file (`robot.json`) for dimensions, mass, wheel radius, gear ratio, and motor limits.

- Chassis with honeycomb panel material. No team number anywhere.
- Four mecanum wheels with visible rollers. Wheels spin with commanded power; roller angle set per wheel so the strafe geometry is right.
- Chain-driven elevator (lift) with a visible chain that moves when the lift runs.
- Roller intake that spins in and out and can hold one game piece, plus a launcher that sends it toward the HIVE.
- Control Hub IMU (yaw, pitch, roll) and an encoder on every drive motor.

## Physics

- Rapier rigid bodies for robot, game pieces, ramp, walls, and field elements. Fixed 20 ms timestep, deterministic for a given input log and seed.
- Mecanum kinematics convert the four wheel powers to a body force and torque. Strafe and rotate behave like a real mecanum base, including the lower effective strafe speed.
- Per-wheel friction and drag parameters. Faults are physics parameters, so the drift is real, not scripted.

## Field

- BIOBUZZ elements from the postcard: FLOWERS (upright tubes that hold POLLEN and NECTAR), a HIVE with a CELL that TIPS when enough pieces land in it, POLLEN balls (yellow), NECTAR balls (purple). Field 12 ft by 12 ft with perimeter walls and foam tile floor [confirm in manual]. Element sizes and positions are placeholders labeled "not to scale" until the manual's field section is in `docs/`. No DECODE markings anywhere (older season).
- Game piece physics: POLLEN and NECTAR are spheres the intake can pick up and the robot can launch into the HIVE CELL. Tip of the HIVE is a hinged body with a threshold count [confirm in manual].
- Venue backdrop: dark arena with rig lighting (Higgsfield image as the skybox).

## Code pane and the Sim SDK

- Monaco editor. Paste, edit, syntax highlighting, find and replace, Run, Stop, Reset.
- Java subset translator runs in the browser. It handles the LinearOpMode skeleton used in the workshop: class extending `LinearOpMode`, `runOpMode()`, `waitForStart()`, `opModeIsActive()` loop, local `double` and `boolean` variables, arithmetic, `Math.abs`, `Math.max`, `if`, `while`, and the untyped `hardwareMap.get("name")` form the Feb sim accepted.
- Supported SDK surface: `DcMotor` `setPower`, `setDirection`, `setMode`, `getCurrentPosition`, `getVelocity`; IMU yaw; `telemetry.addData` and `update`; `gamepad1` sticks, triggers, bumpers, dpad, A/B/X/Y.
- Anything else fails at translate time with `Unsupported SDK call: X` and the line number. No silent no-ops.
- Compile errors list with click-to-line. Runtime errors stop the OpMode and highlight the probable line.
- Acceptance test: the slide 21 TeleOp (working version and the dropped-minus version) runs unchanged and the bug is visible in the sim.

## Driving and cameras

- Keyboard: W/S forward and back, A/D strafe, left/right arrows rotate, mapped to gamepad1 values so the pasted TeleOp drives the robot. Gamepad API supported when a controller is plugged in.
- Cameras: orbit, chase, driver's eye, robot camera (what a vision pipeline would see). Hotkeys 1 to 4.

## Debugging tools

- Run, Pause, Step one tick, Reset. Speed 0.25x to 5x.
- Telemetry overlay: IMU yaw, per-motor power and velocity, encoder counts, drift indicator, drag indicator (left/right velocity mismatch under power), intake state, lift position.
- Event log with timestamps: OpMode start and stop, faults toggled, collisions, errors.
- Record and replay: input log plus seed replays the exact run. Export and import as JSON.

## Fault injection

Each fault has a toggle, a severity slider, a visible effect, and a telemetry warning.

- Binding drag on one side (robot pulls, heading drifts under push).
- Ramp drift (heading error after crossing the ramp).
- Motor reversed.
- Encoder dropout.
- Intake jam.

## Workshop scenarios

1. Rules lookup template: field with labeled zones, used while the presenter shows the manual chatbot.
2. Auto: acquire, deliver, park. Scripted sequence from the Feb spec runs end to end.
3. Debug: binding drag pull. Students find the fault from telemetry and the code.

## Out of scope for v1

Scanned or CAD-accurate models, AprilTag detection, a full Java compiler, generics and classes beyond the skeleton, multiplayer, autonomous path planning, scoring logic, sound.

## Phases

- Phase 1: field, robot, physics, keyboard drive, cameras, telemetry, faults. Demoable without the code pane.
- Phase 2: code pane and Java translator. Slide 21 exercise passes.
- Phase 3: replay, scenarios 1 to 3, quality toggle, GitHub Pages deploy.
- Phase 4: manual-accurate BIOBUZZ geometry, Higgsfield textures and skybox, title video.

## Assets Justin generates (Phase 4)

1. Arena backdrop: dark venue, overhead rig lighting, audience in shadow, wide shot, no robot.
2. Foam tile floor texture, top-down, seamless, FTC grey.
3. Honeycomb aluminium panel texture, flat, seamless.
4. Mecanum wheel close-up on white for the wheel material.
5. Title video, 6 to 8 seconds, cinematic pan of an FTC robot on a lit field.
6. Three to five photos of real BIOBUZZ robots from team sites or FIRST media (not generated).

## Acceptance criteria

- Runs from GitHub Pages and from a local build with no network.
- 60 fps on the reference laptop with quality on high; 30 fps minimum on low.
- Same input log and seed gives the same final robot pose to 1 mm over 60 seconds.
- Slide 21 working and buggy TeleOps both run unchanged; the buggy one drives backward on forward stick.
- Every fault produces a visible effect and a telemetry warning within one second of toggling.
- Unsupported SDK calls fail with the line number.
- No student names and no team number anywhere in the repo.

## Risks

- Physics tuning and the Java translator are the two items that can each eat a full day. Fallback for a demo: keyboard-only sim with the code pane shown as a static walkthrough.
- Field dimensions depend on the manual section being saved in the repo. Until then every size is a placeholder.
- Rendering in cloud sessions is headless. Visual checks need Justin to open the build in a browser and report back, or screenshots via Playwright, which don't catch frame rate.
