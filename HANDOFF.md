# ftcsim handoff (updated 2026-11-04)

## State
- Phase 1 built and pushed: field, robot, Rapier physics, keyboard and controller drive, four cameras, telemetry, event log, five faults, run/pause/step/reset, speed, quality toggle. Reset rebuilds the physics world so replays match.
- Match clock: TeleOp, Autonomous (30 s), or Full match (AUTO 30 s then TELEOP 120 s, from the postcard, [confirm in manual]). Built-in sample auto (src/opmode/sampleAuto.ts) seeks POLLEN by a vision stand-in bearing, intakes, aims at the HIVE, launches, repeats, parks at 24 s. Scores 2 to 3 in a headless run.
- Intake: roller pulls balls in from a cone in front, captured ball travels to the hold point over 0.4 s (no teleport), balls have low bounce and roll to a stop.
- Verified headless (Playwright, swiftshader): forward, strafe, turn, binding drag pulls left, reversed motor spins, encoder dropout freezes frontLeft, intake grabs and launch throws, two identical runs give identical poses. 7 vitest unit tests on the mecanum model pass.
- Not verified: frame rate on a real laptop, controller input, look in a real GPU browser. Headless renders at 2 to 5 fps, which says nothing about real hardware.
- GitHub Pages workflow in .github/workflows/pages.yml. Justin has to set Pages source to "GitHub Actions" in repo settings once.

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
