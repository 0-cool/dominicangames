# Polish pass — Santo Domingo Open World (23 Nov 2026)

Method: the *Claude Code Game Studios* polish workflow (`/team-polish`: assessment → optimisation → visual
polish → audio polish → hardening → sign-off) and its audio checklist (`/team-audio`: every player action has
feedback, balanced mix, ambient layers, no information carried by sound alone). Applied by hand to this
project; the studio template itself is **not** installed in the repo. Desktop only.

## 1. Assessment (what the engine already had)

| Area | Already solid | Gaps found |
| --- | --- | --- |
| Rendering | ACES tone mapping, half-float HDR, GTAO, bloom, SMAA, colour grade, dynamic resolution, PMREM sky reflections, procedural façades with lit windows, wet surfaces/puddles/ripples | Image a bit soft (no sharpening); no sense of speed when driving fast; foliage cards show black back faces (cardboard look) |
| Lighting | Sun/moon/hemisphere, city-lamp glows + pooled point lights, emissive head/tail/brake lights on every car | Player's headlights do not light the road at night (no beam) and cannot be switched |
| Audio | Master compressor, ambient beds (city, sea, rain, wind, insects, crowd), birds/dogs, procedural engine, horn, crash, footsteps, colmado bachata/merengue | No car radio; silent actions: getting in/out, tyre skids, landing a jump, headlight switch; wind does not grow with speed; no rain-on-roof inside a car |
| Actions | Walk/sprint/jump/crouch, enter/exit, drive (handbrake, horn), first-person car camera, map, missions | No headlight switch, no radio, no in-game photo mode |

## 2. Changes

| # | Change | Where |
| --- | --- | --- |
| G1 | Real headlight beams on the player's vehicle (spot light + soft light cone), automatic at dusk, `L` to switch | `render/Headlights.ts`, `engine/Game.ts` |
| G2 | Foliage lit from both sides with light passing through leaves (no black back faces) | `render/materials.ts` |
| G3 | Cinematic finish on Alto/Ultra: contrast-adaptive sharpening, fine film grain, subtle lens fringing; speed blur at the screen edges above ~70 km/h | `engine/Renderer.ts` |
| A1 | Car radio with four original, procedurally generated Dominican stations (bachata, merengue, dembow, típico) + tuning static; `R` changes station | `audio/Radio.ts` |
| A2 | New feedback sounds: doors / kickstand, tyre skids, jump landing, headlight click, wind that grows with speed, rain on the roof | `audio/Audio.ts` |
| X1–X3 | New actions `lights` (L), `radio` (R), `photo` (P): free camera, HUD hidden, `Enter` saves a PNG | shared bindings, `engine/Game.ts`, web HUD |

Every new sound that carries information also has a visual cue (station name on screen, headlight icon,
photo-mode banner), per the audio accessibility rule.

Also fixed while auditing:

* The colour grade never received the rain/night values (three.js `ShaderPass` copies its uniforms), so the
  night tint and rain desaturation were stuck at "clear day". They are now updated every frame.
* Leaf textures had black transparent texels that mip-mapping smeared into dark fringes and dark cards in the
  distance; the AO pre-pass ignored leaf alpha and darkened whole rectangles behind trees. Both fixed.
* Lit windows now look like rooms (ceiling light, curtains, the odd TV) instead of flat white rectangles, and
  windows by day show a dim interior instead of a black hole.
* City lamp point lights and the new headlight beam stay in the scene with intensity 0 when off: hiding them
  changed the light count and recompiled every material at dusk/dawn (a hitch).
* Player-facing pages no longer mention the old RD$100 price; the legacy Fundador badge is secret (only its
  holders see it). The payment engine stays switched off and untouched.

## 3. Hardening & sign-off

| Check | Result |
| --- | --- |
| TypeScript (all workspaces) | ✅ |
| Unit + integration tests | ✅ 71/71 (engine 10, shared 11, server 43, world-builder 7) |
| Browser tests (Playwright, incl. free new-account journey) | ✅ 12/12 |
| Radio loudness (offline render, after the 4-bar intro) | ✅ every station −25.0 dB RMS, peaks 0.56–0.65 (no clipping) |
| Headlights | ✅ auto-on at 21:18, `L` off/on, beam lights the road (night capture) |
| Radio | ✅ station announced on entering a vehicle, `R` switches station |
| Photo mode | ✅ `P` enters, `Enter` saves a 2400×1350 PNG (Ultra), `P`/`Esc` leaves |
| Performance | ⚠️ Rendered with software WebGL in CI; not measured on a real GPU. New cost: one spot light, a 5-tap sharpen pass, 2 taps of fringing (Alto/Ultra), 6 taps of speed blur only above 70 km/h. Players sensitive to motion can switch speed blur off |

