# Iron Bastion 1985

A 3D tank-defense browser game — an original homage to classic 1985 arcade tank
battles. Defend your bastion, clear every sector, advance through three
distinct battlefields. Built with **Three.js + TypeScript + Vite**.

> Not a clone: all art, audio, and code are original. No Nintendo / Battle City
> assets or trademarks are used.

## Play

```bash
cd iron-bastion-1985-glm
npm install
npm run dev        # http://127.0.0.1:5311
```

Open the URL, click **Deploy** (or press `Enter`), and fight.

### Controls

| Action | Desktop | Mobile |
| ------ | ------- | ------ |
| Move   | `W A S D` / arrows | Left on-screen stick |
| Fire   | `Space` (hold to auto-fire) | ✛ button |
| Pause  | `P` / `Esc` | II button |

### Objective

Protect the **bastion** (your HQ) at the bottom of the field. Destroy every
hostile tank in a sector. If a bullet reaches the bastion, or you lose all
lives, the sector is lost. Clear all three sectors to win.

### Tiles

- **Brick** — destructible cover. Eat through it to open lanes or expose the base.
- **Steel** — blocks bullets. Only max-firepower shots can destroy it.
- **Water** — impassable to tanks; bullets fly over.
- **Forest** — tanks can hide under the canopy (and so can enemies).

### Power-ups (dropped by flashing bonus carriers)

★ **Firepower** — upgrade your cannon (faster shot → dual shot → steel-breaking).
◈ **Shield** — temporary invulnerability.
◭ **Extra Tank** — +1 life.
▣ **Bastion** — steel-plates your base walls for a while.
✺ **Clear** — destroys every hostile on the field.
❄ **Freeze** — locks all hostiles in place.

### Sectors (3 distinct layouts)

1. **Checkpoint** — open field, central water bar forces flanking. (roster 12)
2. **Crossfire** — pillar maze with a central lane; corridor firefights. (roster 16)
3. **Fortress** — steel bunkers, water moats, forest ambush, center keep. (roster 20)

## Verify

```bash
npm run build              # tsc + vite production build
npm test                   # full Playwright suite (desktop + mobile)
npm run verify:visual      # nonblank canvas + input + screenshots
npm run inspect:canvas     # canvas pixel metrics + render budget
# capture a specific state:
node scripts/inspect-threejs-canvas.mjs --url http://127.0.0.1:5311 --state play-l3 --mobile
```

Determinism hooks live on `window.__THREE_GAME_TEST_HOOKS__`
(`seed`, `setState`, `setPausedForScreenshot`, `setReducedMotion`,
`setEnemySpawnEnabled`, `setInvincible`) and live diagnostics on
`window.__THREE_GAME_DIAGNOSTICS__`. Add `?debug` for the tuning GUI.

## Project layout

```
src/
  core/        Loop, Renderer, InputController (keyboard + touch)
  game/        Game (orchestrator/state machine), config, levels
  entities/    Field (instanced tiles + collision), Tank, Projectile, PowerUp, Effects (VFX)
  systems/     CameraRig, AudioSystem (WebAudio synth), Hud
tests/         visual, visual-regression (per-sector baselines), bot playtest
```

## Design notes

- **Single-pool GPU particles**: all sparks, debris, smoke, muzzle flash and
  ring telegraphs share one `THREE.Points` draw call (ShaderMaterial with
  per-particle size/colour/alpha).
- **Instanced tiles**: brick / steel / tree canopy / water are `InstancedMesh`,
  so a full battlefield costs ~20 draw calls and ~2k triangles.
- **Grid collision**: tanks lane-snap to cell centres (classic feel); bullets
  substep to avoid tunneling.
- **Synthesized audio**: every SFX is generated with the Web Audio API — no
  external asset files (all generator API keys were unavailable; see
  `QUALITY_REPORT.md`).
