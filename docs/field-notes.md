# BIOBUZZ field, elements, timing, and scoring (from the Competition Manual, TU07)

Source: docs/BIOBUZZ_Competition_Manual_TU07.pdf. Section numbers below are the manual's. Re-check against TU08 when it lands. Where a value came from reading a figure rather than text, it says so.

## Field (9.1 to 9.4)
- 144 in by 144 in (365.75 cm) inside the perimeter walls. 36 foam tiles, each 24 in by 24 in by 0.59 in (60.95 cm by 60.95 cm by 1.50 cm) nominal.
- Elements on the field: 1 HIVE Structure (frame with 2 HIVES, one per alliance) and 4 FLOWERS.
- Tape lines 1 in or 2 in gaffer tape in red and electric blue. None cross tile seams.
- Red alliance area is on the left from the audience view (9.5).

## Zones (9.3, Figure 9-2)
- ALLIANCE AREA: 97 in wide by 54 in deep, outside the field, each side.
- LOADING ZONE: 23 in wide by 11 in deep, against the field perimeter in the corner next to its alliance area. Red at the rear-left corner, blue at the audience-right corner (read from Figure 9-2).
- GARDEN: 23 in by 2 in strip of tape in the corners opposite the loading zones. Red garden at the audience-left corner, blue garden at the rear-right corner (read from Figure 9-2).

## HIVE Structure (9.6)
- Center of the field. Frame is two triangles joined by a crossbar: 49.46 in (125.65 cm) wide, 38.95 in (98.95 cm) deep at the base, pivots 43.95 in (111.65 cm) above the tiles.
- Each HIVE is bi-stable on a pivot, with 2 CELLS 18.8 in (47.8 cm) apart. One CELL faces up, the other down. Enough POLLEN or NECTAR launched into the up CELL tips it.
- CELL opening: 20 in (50.8 cm) wide by 14 in (35.6 cm) tall by 12 in (30.5 cm) deep. Pentagon profile, 7.61 in (19.35 cm) from the lower edge to the shoulder (Figure 9-11).
- AprilTag cluster (4 tags, 36h11, 3.25 in each) on the bottom face of each CELL, facing the tiles. IDs 30 to 33 red rear, 34 to 37 red audience side, 38 to 41 blue audience side, 42 to 45 blue rear (9.9).
- Tip threshold count is not given as a number in TU07. It depends on the bi-stable mechanism. Keep the sim threshold configurable and tagged [estimate].

## FLOWER (9.7)
- 4 FLOWERS attached to the perimeter wall: two on the audience wall and two on the rear wall (Figure 9-2). Exact positions along the wall are not stated in text; the field CAD or the Event Field Setup Guide is needed. [positions: estimate from figure]
- Top opening 4 in (10.15 cm) diameter, 21.5 in (54.6 cm) above the tiles, with a 1.25 in backstop.
- Retrieval opening at the bottom 3.55 in tall by 3.57 in deep. Lower ring 0.4 in tall with a 2.79 in hole.
- Scoring volume is between the top ring and middle ring (10.5.2).

## Scoring elements (9.8)
- POLLEN: 2.8 in (7.1 cm) yellow polyethylene balls. 40 per match.
- NECTAR: 3.6 in (9.1 cm) balls, 8 red and 8 blue.
- Not perfectly spherical, size varies.

## Staging (10.3.1, 10.3.4)
- POLLEN: 4 in each FLOWER (16), 4 in each GARDEN (8), 4 pre-loaded on each ROBOT (16).
- NECTAR: 3 in each upward CELL of its color (6), 5 in each ALLIANCE AREA (10).
- Each HIVE starts with the CELL that points at a FLOWER tilted down.
- Robots start touching the perimeter wall, inside the 18 in starting cube, contacting their 4 pre-load POLLEN, not in the LOADING ZONE, not touching a FLOWER (G304).

## Match timing (10.1, 10.4, Table 9-1)
- AUTO 30 s, transition 8 s, TELEOP 2:00. Total clock 2:30 plus the transition.
- FLOWER ownership (NECTAR into FLOWERS) unlocks with 1:00 left (G410).
- Final 20 s cue at 0:20.

## Points (Table 10-2)
| Achievement | AUTO | TELEOP |
|---|---|---|
| LEAVE (robot no longer touching the perimeter wall) | 3 | |
| PARK (at least partly in the LOADING ZONE) | 5 | 5 |
| HIVE TIP | 20 | 20 |
| POLLEN or NECTAR remaining in an upward CELL at match end | | 2 each |
| Bottom NECTAR bonus in a FLOWER | | 5 |
| POLLEN or NECTAR in an owned FLOWER | | 2 each |
| POLLEN or NECTAR in a GARDEN | | 1 each |
- Ranking points: SWARM (LEAVE + PARK at or above 16 at regular events), POLLINATOR 1 (4 tips), POLLINATOR 2 (7 tips), WIN 3, TIE 1 (Table 10-3).
- MINOR FOUL 5 points to the opponent, MAJOR FOUL 20 (Table 10-4).
- Tips landing during the transition count for AUTO (10.5 B). Pieces in CELLS are counted after everything comes to rest at match end (10.5 C).

## Robot sizing (12.1)
- R102: STARTING CONFIGURATION fits an 18 in (45.70 cm) cube, self-supported.
- R104: after the match starts, may expand to 18 in by 24 in by 29 in tall (45.70 by 61.0 by 73.65 cm) (text near line "R104" in 12.1; number read from the rule body).

## Still unknown
- FLOWER positions along the walls, HIVE tip force or count, CELL AprilTag offsets: need the field CAD or Playing Field Resources page.
