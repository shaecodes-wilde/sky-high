# Skyflow integration contract

Approved by the principal integrator for this implementation. The final technical authority will be CLOUD_CURL_PHYSICS.md; this file records ownership and integration decisions.

## Baseline and safeguards

- Base: origin/master 0701b28, including the merged momentum build (PR 3).
- Art PR 2 is independent. Do not merge or copy its unmerged palette/signals work.
- Integrate into feat/cloud-curl-skyflow only. No default-branch merge or remote write is authorized.
- Preserve existing flat-platform physics and all existing routes/progression.

## Approved interfaces

Coordinates are pixels, seconds, y-up; Player.x is horizontal centre and Player.y is feet. Fixed simulation is 60 Hz.

Terrain is an optional LevelData.terrain array. TerrainDef has id:number, kind:'island'|'cloud', knots:TerrainKnot[], bottom:number, pump?:boolean, recovery?:boolean, parade?:boolean. TerrainKnot is {x:number,y:number,slope:number}. Knots use strictly increasing world x and cubic Hermite interpolation with explicit dy/dx slopes. Terrain solid IDs must remain distinct from platform IDs.

Solid.terrain?:TerrainDef marks curve geometry. terrainToSolid(def,id?) constructs its broad-phase bounds. sampleTerrain(def,x) returns {x,y,slope,curvature,tangent:{x,y},normal:{x,y}} or null outside its x domain. Curvature is signed d2y/dx2 / (1+slope²)^1.5. Positive curvature is a valley; negative curvature is a crest.

surfaceContact(solids,body) returns SurfaceContact|null, including solid, x,y,slope,curvature,tangent,normal. It includes valley?:{id:string,x:number,y:number,leftX:number,rightX:number,depth:number} when a geometrically eligible, authored pump valley is nearby. Flat platforms use the same surface API with zero curvature.

moveGrounded(solids,body,dx,speed,gravity,allowLaunch) returns {hit:Solid|null,contact:SurfaceContact|null,separated:boolean}. It changes position only; grounded traversal follows continuous geometry. It never creates speed. Crest separation uses the normal-force condition gravity*normal.y + speed²*curvature < 0, and allowLaunch controls that behavior. Controller converts tangent speed into world vx/vy on leaving contact. Existing sweepX/sweepY/groundUnder/blocked support curved solids, including two-way walls/ceilings and one-way curves. A can add internal helpers without changing this public contract.

InputFrame adds optional rollHeld:boolean, directionPressed:-1|0|1, directionReleased:-1|0|1, directionEvents:{dir:-1|1,down:boolean,age:number}[] (age seconds before sampling, bounded to the fixed-step input interval). Optional fields retain backward compatibility with existing tapes/tests. Input.sample adds optional fourth parameter rolling=false; grounded rolling directional gestures clear double-tap history, but explicit Shift remains available after takeoff. Controller owns edge fallback for directly authored InputFrames.

Player exposes rolling:boolean, rollAngle:number (integrated signed travelled distance/radius), sinceCurl:number, sinceUncurl:number, sincePump:number, pumpResult:'none'|'good'|'perfect', surface:SurfaceContact|null. Presentation reads these fields. New PlayerEvents include curl/uncurl/launch with x,y, and pump with x,y,quality:'good'|'perfect',valley:string. Existing events remain intact.

Controller owns movement tuning in movement.ts, rules version bump, smaller roll hitbox with stable feet, clearance, tangent gravity, bounded acceleration/braking/resistance, timed delivered pump bonus, traversal-key anti-farming, slope roll jump and contact lifecycle. Initial hypotheses: roll drive target 230, safety cap 300, good/perfect +8/+16 over 0.1 seconds, good/perfect windows 0.11/0.05 seconds. These require simulation evidence.

## Ownership and dependency order

- A: collision.ts, new terrain.ts/helpers, terrain portions of level/types.ts, terrain tests. Commit terrain API first.
- B: Player.ts, movement.ts, Input.ts, keys.ts, controller/input tests. Work against this contract, integrate A before completing.
- C: animation.ts, characters.ts, GameRenderer.ts, Particles.ts, AudioEngine.ts and animation tests/ANIMATION_STANDARD.md. No physics edits. Curved drawing follows sampleTerrain; no physics geometry approximations.
- D: skyflow level content, level1.ts, dedicated level fixtures/content notes. Starts after A/B integrated; no controller changes.
- E: traversal.ts, validate.ts, dedicated route tests, MOVEMENT_DESIGN.md, CLOUD_CURL_PHYSICS.md, LEVEL_DESIGN_STANDARD.md, SKYFLOW_LABORATORY.md. Starts after A/B integrated and pairs with D measured content.
- Principal: World.ts, Game.ts, main.ts, UI integration, browser checks, final tuning/review, README/STATUS/implementation report and integration commits.

Every agent uses an isolated git worktree and commits only owned files. No push, default-branch merge, dependencies, unrelated file changes or further delegation. Baseline and full regression checks precede final handoff.
