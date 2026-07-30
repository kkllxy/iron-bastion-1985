# Iron Bastion 1985 — Quality Report

Built under the `threejs-game-director` skill (premium mode). All work is
confined to `iron-bastion-1985-glm/`; the parent project was not modified.

## Game design brief

- **Player promise**: a punchy, top-down 3D tank-defense that channels the
  feel of 1985 arcade tank battles — defend the bastion, hunt hostiles, break
  cover, grab power-ups.
- **Primary verb**: move + fire (grid-aligned, lane-snapping tank control).
- **Objective**: destroy every hostile in a sector; protect the bastion (HQ).
- **Pressure**: up to 4 hostiles on field, spawning from the top; 4 enemy
  archetypes with distinct speed/HP/AI; the base can be exposed by brick fire.
- **Reward / progression**: 3 sectors of rising difficulty; 6 power-ups;
  score + lives; sector-clear bonus.
- **Fail / retry**: lose a life when shot (respawn with brief shield); bastion
  hit or 0 lives = game over → restart from sector 1.
- **Skill expression**: maze navigation, cover management, prioritising
  fast/heavy/bonus hostiles, timing shots to open lanes, power-up tempo.
- **Non-goals**: no multiplayer; no direct reproduction of trademarked assets.

## Core loop contract

Move/fire → destroy hostiles & eat cover → collect power-ups → survive until
roster is empty → sector clear → next sector (or victory). Fail state on bastion
loss or lives = 0; restart returns to sector 1.

## Level / encounter plan

Three authored 13×13 battlefields (border steel ring, base + guard bricks at
bottom-centre, player spawn beside the base, three hostile spawn points at top):

1. **Checkpoint** (roster 12, 3 concurrent) — open field, central water bar
   forces flanking routes; scattered brick cover. First hostile in ~1 s.
2. **Crossfire** (roster 16, 4 concurrent) — pillar grid with a central lane;
   corridor firefights; mix adds hunters + heavies.
3. **Fortress** (roster 20, 4 concurrent) — steel bunkers, water moats, forest
   ambush zones, a centre steel keep; mix adds berserkers; fastest spawns.

Enemy mix cycles per sector; every 4th hostile is a flashing **bonus carrier**
that drops a power-up. Heavy tanks take 3 hits and visibly tank damage.

## Skill-loading ledger

- Director: **active** — `threejs-game-director/SKILL.md` + `references/phase-playbook.md` loaded at planning.
- Gameplay systems: **yes** — `threejs-gameplay-systems/SKILL.md`, `references/gameplay-workflows.md`, `game-design-level-design.md`, `game-feel.md`, `physics-engine-selection.md`, `checklists/new-game-definition-of-done.md`.
- AAA graphics: **yes** — `threejs-aaa-graphics-builder/SKILL.md` + `references/visual-scorecard.md` (anchors + measured-evidence rubric used).
- UI: **yes** — `threejs-game-ui-designer/SKILL.md` (workflow followed; deep sub-refs `ui-patterns.md`/checklists covered via the SKILL workflow + phase-playbook fallback).
- Debug/profile: **yes** — `threejs-debug-profiler/SKILL.md` (debug + performance workflows followed).
- QA/release: **yes** — `threejs-qa-release/SKILL.md` (QA + release workflows followed; bot-playtest + visual-test-harness decisions applied).
- 3D generator: **not-needed** — no hero GLB asset; tanks/tiles/base are procedural (see sourcing ledger for blocker).
- Image generator: **not-needed** — textures are procedural canvas (see sourcing ledger).
- Audio generator: **not-needed** — audio is WebAudio-synthesized (see sourcing ledger).

"Loaded" = file read into context this session. No skill was *invoked* as a separate process.

## External asset sourcing ledger

- **Credential probe output** (ran `scripts/probe_asset_credentials.sh`):
  `TRIPO_API_KEY=MISSING`, `GEMINI_API_KEY=MISSING`, `ELEVENLABS_API_KEY=MISSING`.
- **Hero/player source**: procedural (authored tank mesh: body/turret/barrel/treads/tail-lights/shield-ring).
- **Enemies/vehicles/weapons source**: procedural (4 archetypes, recoloured authored tank + behaviour).
- **Signature props/pickups source**: procedural (instanced disc + glyph + ring power-ups).
- **World/sky/background source**: procedural (instanced tiles, ground apron, gradient backdrop).
- **Materials/textures/decals source**: procedural canvas textures (brick mortar, steel rivets, floor grid, water ripple, base emblem).
- **Logos/icons/GUI art source**: procedural (Unicode glyphs + CSS HUD).
- **Audio/SFX/voice source**: Web Audio synthesis (oscillators + noise buffers).
- **Chosen sources per surface**: procedural for all (allowed: all three generator keys MISSING → real blocker; no external generation attempted because keys absent).
- **External assets generated**: no — blocker = all keys MISSING (would otherwise use 3D-generator for a hero tank model, image-generator for sky/GUI art, audio-generator for SFX).
- **Audio assets generated**: no — synthesized in-engine (key MISSING; chosen synth also keeps the bundle asset-free).

## Reference ledger (required references)

- `phase-playbook.md`: yes. `gameplay-workflows.md`: yes. `game-design-level-design.md`: yes.
  `game-feel.md`: yes. `physics-engine-selection.md`: yes. `new-game-definition-of-done.md`: yes.
  `visual-scorecard.md`: yes. UI/debug/QA sibling `SKILL.md`: yes (deep sub-checklists via SKILL workflow + playbook fallback).
- New-game DoD checklist: met (install, dev, build, first-screen-is-game, <5s interaction, objective/score/lives/level/fail, real-input loop, keyboard+touch, framed desktop+mobile, readable HUD, no console errors, screenshot + nonblank canvas, brief/plan/controls/risks reported).

## Phase ledger

- **Gameplay systems**: done — full loop (title→play→levelclear→victory/gameover→restart), 3 sectors, 4 enemy types, 6 power-ups, grid collision w/ lane-snap, substepped bullets, scoring/lives, deterministic hooks. Physics engine: none — custom arcade grid collision (no Rapier/cannon; fits the "simple custom collision" branch of physics-engine-selection). Timestep: frame delta clamped to 0.05 s in the Loop; tanks are kinematic, one AABB collider per tank resolved against the grid + each other; bullets substep ≤0.28 u to prevent tunneling; bullet-vs-bullet cancels both.
- **External asset sourcing**: done — probe + ledger above; procedural justified by MISSING keys.
- **AAA graphics**: done — instanced tile kit, procedural textures, single-pool VFX, lighting/render, art direction; before/after scorecard below.
- **UI**: done — genre HUD + 5 overlay states + power badges + responsive + safe areas + touch controls.
- **Debug/profile**: done — fixed blank-frame camera framing (contrast 6.7→64.6), refit-on-resize, shield-protection bug; metrics captured.
- **QA/release**: done — production build, Playwright desktop+mobile, bot playtest, visual baselines per sector, canvas inspector metrics.

## Files changed (new project under `iron-bastion-1985-glm/`)

Created by the gameplay scaffold creator, then replaced/extended:
`src/game/{Game,config,levels}.ts`, `src/entities/{Field,Tank,Projectile,PowerUp,Effects}.ts`,
`src/systems/{CameraRig,AudioSystem,Hud}.ts`, `src/core/InputController.ts`,
`src/styles.css`, `index.html`, `src/vite-env.d.ts`, `tests/{visual,visual-regression,bot-playtest}.spec.ts`,
`vite.config.ts` (port 5311), `playwright.config.ts` (port 5311), `README.md`, `QUALITY_REPORT.md`.
Deleted unused scaffold: `Pickup/Player/CollisionSystem/DebugTools` entities + `utils/dispose.ts`.

## Verification commands + results

```bash
npm install
npm run build          # tsc + vite build  -> OK (dist 578 KB / 149 KB gzip)
npx tsc --noEmit       # No errors found
npm test               # 11 passed, 0 failed, 3 skipped (desktop-chrome + mobile-safari)
npm run inspect:canvas -- --state play      # nonblank, within budget
```

- **Build**: `dist/index.html 4.07 kB`, `assets/index-*.js 578.31 kB (149.24 kB gzip)`, `css 7.16 kB`.
- **GPU**: `ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro)` — **hardware**, not software, so frame metrics are valid.
- **Playwright**: `PASS (11) FAIL (0) skipped (3)` — desktop keyboard input moves tank, mobile touch-stick moves tank, nonblank canvas, no console/page errors, 3-sector baselines captured, bot seeks hostiles and reduces the roster / raises score.
- **Bot playtest**: drove the tank toward the nearest hostile with wall-skirting + auto-fire; frames advanced, distance > 6, score increased / hostiles reduced, no errors.

## Screenshots / artifacts

Captured by `scripts/inspect-threejs-canvas.mjs` into `artifacts/inspect/`:
`desktop-play.png`, `desktop-play-l2.png`, `desktop-play-l3.png`,
`desktop-title.png`, `desktop-victory.png`, `mobile-play.png` (+ matching `.json`).
Playwright run attachments: desktop-active-play, mobile-active-play, sector-1/2/3 baselines, title/victory screens (in the HTML report).

## Renderer / performance notes

| State | calls | triangles | geometries | textures |
| --- | --- | --- | --- | --- |
| desktop play   | 24 | 2178 | 17 | 11 |
| desktop play-l2 | 23 | 2418 | 16 | 10 |
| desktop play-l3 | 26 | 2674 | 19 | 12 |
| mobile play    | 24 | 2178 | 17 | 11 |

Budget (desktop 300 calls / 750k tris / 300 geo / 60 tex; mobile 150 / 300k / 200 / 40): **all within budget**. Whole battlefield ≈ 20 draw calls / ~2k triangles thanks to `InstancedMesh` tiles and the single-pool `Points` VFX. No post-processing passes; shadow map 2048² PCF.

## Technical art budget

- **Render budget**: desktop ≤300 calls / 750k tris; mobile ≤150 calls / 300k tris → actual ~24 calls / ~2.7k tris (all rows within budget).
- **VFX readability**: single-pool particle system keeps VFX to one draw call while covering every event (muzzle/explosion/debris/spark/cancel/spawn/shield); effects clarify state (shield ring, bonus strobe, base-exposed alarm ring, frozen tint) rather than obscuring the next decision; hitstop/shake/flash are capped and decay so they never hide the field.
- Draw calls target ≤60 → actual ~24. Triangles target ≤50k → actual ~2.7k.
- Geometry: shared tank geometry singletons; instanced brick/steel/tree/water.
- Textures: ≤12 procedural canvas textures, anisotropy 4, no external files.
- Particles: 1 `Points` draw call, 360-slot ring buffer, recycled.
- Mobile tradeoffs: DPR capped at 2; `?debug` GUI gated off in release; shadows kept (cheap at this triangle count); no bloom (deliberate — keeps the dusk palette crisp and avoids mobile fill cost).
- Readability tradeoff: forest canopy is opaque + high `renderOrder` to honour the classic hide mechanic; a red alarm ring telegraphs an exposed base.

## Visual scorecard (premium)

| Category | Before | After | Measured evidence |
| --- | --- | --- | --- |
| Art direction | 1 | 3 | cohesive dusk-steel + amber/teal identity across tanks/tiles/base/UI/VFX/synth-audio; 3 themed sectors |
| Hero/player | 1 | 2 | authored tank silhouette (body/turret/barrel/treads/tail-lights/shield-ring) + collision proxy + state cues |
| Obstacles/enemies | 1 | 2 | 4 archetypes (colour/speed/HP/AI) + bonus strobe + spawn telegraph + frozen tint; shared silhouette |
| Rewards/interactables | 1 | 2 | 6 power-ups w/ glyph/colour/idle-bob/collect-pop + HUD timer bars |
| World/environment | 1 | 3 | 3 distinct authored battlefields; layered brick/steel/water/forest + apron + gradient sky; edge 0.16–0.22 |
| Materials/textures | 1 | 2 | procedural canvas tex (brick mortar, steel rivets, floor grid, water ripple, emblem); instanceColor shovel tint; entropy 2.8–3.1 |
| Lighting/render | 1 | 2 | hemi + sun shadows + fill, ACES, exposure tuned, fog, gradient bg; contrast 65–86 |
| VFX/motion | 1 | 3 | single-pool event VFX (muzzle/explosion/debris/spark/cancel/spawn/shield) + hitstop + trauma² shake + flash; 1 draw call |
| UI/HUD | 1 | 2 | genre HUD (lives/hostiles/firepower/power-timers) + 5 overlays + responsive + safe areas + touch |
| Performance evidence | 1 | 2 | renderer counts, build, desktop+mobile screenshots, inspector metrics, budget, GPU, before/after contrast fix |

**Average: 2.3.** All categories ≥ 2 → meets the premium gate.

**Automatic failures remaining:** none — active screenshots are nonblank and varied (not primitive-dominant); the world is authored tile kits + apron + gradient sky (not stretched boxes/flat planes/sparse arena); the hero is an authored multi-part tank mesh (not default primitives + glow); 4 enemy archetypes + 6 distinct rewards; HUD is genre-specific (not rectangular stat cards); fog/particles do not hide missing geometry; UI does not overlap the play path and respects mobile safe areas; playable through real input; active desktop + mobile screenshots captured; renderer diagnostics present after graphics work; technical-art budget reported.

Measured evidence per viewport (inspector `metrics`):
- desktop play: colorEntropyBits 2.79, edgeDensity 0.156, luminance.contrast 64.6, dominantColorShare 0.45
- desktop play-l2: 3.01 / 0.218 / 85.6 / 0.45
- desktop play-l3: 3.1 / 0.199 / 71.6 / 0.451
- mobile play: 3.02 / 0.197 / 72.9 / 0.395
- All above thresholds (entropy ~3, edge >0.04, contrast >60, dominant <0.6); no render-budget row over.

## Fresh-eyes review (adversarial self-review — no subagent reviewer available)

Strongest case each score is only a 1, then the assigned score:
- Art direction → 3: "It's a generic dark sci-fi palette, not a memorable original IP." Identity is consistent and original across every surface + synthesized audio + 3 themed sectors → 3 (stylized, not photoreal).
- Hero/player → 2: "Box-stack tank, default-primitive read." Authored multi-part silhouette + shield + lights + proxy → 2, not a deeply layered hero model.
- Obstacles/enemies → 2: "Recoloured same silhouette." 4 archetypes are behaviour/colour/stats + telegraphs, not distinct meshes → 2.
- Rewards → 2: "Shared disc token." 6 power-ups differentiated by glyph/colour/HUD timer + collect pop → 2.
- World → 3: "Grid tiles, not a dense world." 3 authored battlefields each shaping decisions + layered tile types + apron/sky → 3 (reads as designed, supported by edge/entropy).
- Materials → 2: "Simple canvas patterns." Cohesive procedural material language, rivets/mortar/grid/ripple, instanceColor → 2.
- Lighting → 2: "No post-processing/bloom." Intentional ACES + shadows + fill + fog + gradient, contrast healthy → 2.
- VFX → 3: "Particles could be generic." Broad event-driven system, high-impact (hitstop/shake/flash/explosion layers), 1 draw call, clarifies state → 3.
- UI → 2: "Rectangular panels." Genre-specific HUD (tank/hostile/firepower icons + power timers) + 5 overlays + responsive → 2.
- Performance → 2: "No multi-pass optimisation log." Counts + build + screenshots + metrics + budget + GPU + one before/after fix → 2.

## Quality gates passed

Playable through real input (keyboard + touch); brief/loop/level plan reported; deterministic test hooks; desktop + mobile active screenshots; nonblank canvas; visual scorecard avg 2.3 with no category <2; fresh-eyes review done; HUD readable + responsive; renderer diagnostics + tech-art budget; visual-test-harness decision + bot playtest; build + browser QA passed.

## Visual test harness decision

**Added** (lightweight): `tests/visual-regression.spec.ts` captures deterministic per-sector + title/victory baselines via the `seed/setReducedMotion/setPausedForScreenshot` hooks and asserts nonblank + varied output. Strict pixel-diff was deliberately skipped (GPU/SwiftShader differences would flake); the canvas-inspector metrics + screenshot attachments are the baseline of record.

## Skipped phases / residual risks

- No external AI assets (all generator keys MISSING) → hero tank and sky/GUI art are procedural; a 3D-generator hero model + image-generator sky/GUI would push Art direction / Hero toward showcase.
- Enemy tanks share one silhouette (differentiated by colour/stat/AI) — a second authored mesh would raise Obstacles/enemies.
- No background music track (SFX only); an audio-generator loop would deepen the audio identity.
- Headline metrics are from an M1 Pro (hardware WebGL); lower-end mobile GPUs untested in-device (DPR cap + low draw calls mitigate).
- Not pushed / no PR created (per instructions); parent project untouched.
