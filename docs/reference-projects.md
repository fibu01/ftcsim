# Reference projects (uploaded by Justin, Nov 4 2026)

None of these run in a browser. All three are JVM or desktop tools. They're references for the SDK surface and the physics model, not code to reuse.

## FtcRobotController 12.0 (Sept 2026, BSD 3-clause)
The real SDK. Three samples copied to `reference/ftc-sdk-samples/` with the license: `BasicOmniOpMode_Linear.java` (the mecanum TeleOp pattern students use), `RobotTeleopMecanumFieldRelativeDrive.java`, `ConceptExploringIMUOrientation.java`. The Sim SDK surface is checked against these, never written from memory.

## FTCodeSim (org.codeblooded, no license file, all rights reserved)
Gradle library that runs unmodified OpModes on a fake hardware layer, with AdvantageScope for visualization and a Driver Station emulator. Not vendored. What we take from it, by reading only:
- Mecanum model shape: body-frame acceleration = kA * voltage * effort minus back-EMF term minus natural deceleration, with separate forward, strafe, and turn constants, an interpolated max velocity by travel direction, a static-friction dead zone, and brake vs float handling. Fit from real data (model form `a = A*u - B*v*|d| - C*v - D*sgn(v)`).
- Kinematics: standard mecanum forward and inverse with R = wheelbase/2 + trackWidth/2.
- `SimMotor` method list is a checklist of the `DcMotorEx` surface a sim can be asked for.

## FTCSimulator (Team 6448, GPLv3)
Bridge between the FTC SDK and Webots R2021b. Desktop install, old Webots. Reference for how they map SDK motors and servos onto a physics engine. Nothing copied (GPL).

## EOCV-Sim docs (deltacv)
Docs only, for EasyOpenCV pipelines. Out of scope for v1 (no AprilTag or vision pipeline). Kept in mind for the roadmap.

## Decision
Browser-first stays. A JVM approach gives full Java but needs an install on every student laptop. The browser translator handles the workshop skeleton; the physics model follows FTCodeSim's form with Rapier handling collisions and game pieces.
