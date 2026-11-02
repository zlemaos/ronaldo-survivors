# 호날두 서바이버즈 — design notes

A pixel-art survivors-like about 날두's career, year by year from his debut at 17 (2002) to the present (2026),
ending with 메시 as the final boss. Non-commercial fan parody: parody names for clubs, coaches, teammates and rivals,
no club logos. Only 날두 and 메시 keep their names.

## Files

| File | Role | DOM? |
| --- | --- | --- |
| `js/core.js` | seeded RNG, weighted pick, spatial hash grid, storage wrapper | no |
| `js/data.js` | all data tables (below) and per-year tuning | no |
| `js/game.js` | `RS.World` (one year/stage), build, stats, damage, level-up choices, evolutions, teammates, bosses, bot | no |
| `js/career.js` | career flow, coach picks, saves (`localStorage`), replays, meta shop | no |
| `js/sprites.js` | pixel art drawn in code from char-grid templates (outline, flip, flash variants) | yes |
| `js/render.js` | canvas renderer (low-res canvas at integer scale, then upscale) | yes |
| `js/audio.js` | SIUU mp3 (`HTMLAudioElement`) + WebAudio chiptune SFX | yes |
| `js/input.js` | floating joystick (touch/drag anywhere) + WASD/arrows | yes |
| `js/main.js` | screens, HUD, main loop (fixed 1/60 s step) | yes |
| `tests/*.test.js` | `npm test` (Node built-in test runner, no dependencies) | — |
| `tools/sim.js` | balance tool: bot plays the whole career and prints a line per year | — |
| `tools/screenshots.js` | Playwright: phone + desktop screenshots into `docs/screenshots/`, fails on console errors | — |
| `tools/make-icons.js` | writes `icons/*.png` (PWA icons) without dependencies | — |

All scripts are classic `<script>` tags that attach to a global `RS` namespace, so the game runs from `file://`
(double-click `index.html`) and on GitHub Pages at the repo root. No build step, no CDN. Node tests `require()` the same
files (`tests/load.js`).

## Core loop

- The player only moves. Every owned skill fires on its own timer at the nearest enemy (or around 날두).
- Enemies spawn on a ring just outside the view, biased toward the movement direction; far stragglers are recycled in
  front of the player. Spawn rate ramps over the stage; caps per year (`maxAlive`, up to 420).
- Kills drop XP footballs (bigger value = blue shard / gold trophy). Pickups inside the magnet radius fly to 날두.
  Rare drops: coin, 에그타르트 (heal 30), 트로피 자석 (vacuum all XP).
- Level-up pauses the game and offers 3 cards: new skill, skill upgrade, new passive, passive upgrade, teammate join,
  teammate level-up, or an evolution (always shown first when available). Rerolls come from the meta shop.
- Elites (gold aura) drop a chest: evolves an eligible skill, otherwise applies 1 (25 %: 3) random upgrades + coins.
- Timeline per year (`World.makeSchedule`): rescue marker 22 %, press line 30 %, elite 40 %, encirclement 50 %,
  elite 75 %, second press line 82 % (from 2006), season boss at 100 %. Killing the boss clears the year.
- Slots: 6 skills, 6 passives, 5 teammates. Skills max Lv.6, passives Lv.5, teammates Lv.5.

### Stats (`RS.computeStats`)

Mods from passives (× level), coach cards and meta upgrades are summed, then:
`dmg = 1 + Σdmg`, `cd = max(0.45, 1 + Σcd)`, `move = 78 × (1 + ΣmoveSpeed)`, `maxHp = 100 + Σhp`,
`magnet = 30 × (1 + Σmagnet)`, `crit = 0.05 + Σcrit` (crit = ×2), `teamDmg`, `teamCd`, `bossDmg`, `xp`, `gold`,
`armor` (flat), `regen` (/s), `revive`, `reroll`.

Damage: `round(base × dmg × (team ? teamDmg : 1) × (boss ? bossDmg : 1) × (crit ? 2 : 1))`, minimum 1.
Player damage taken: `max(1, dmg − armor)`, then 0.45 s i-frames.

## Data tables (`js/data.js`)

### Skills (Lv.1 → Lv.6 → evolution)

| id | Skill | Behaviour | Paired passive | Evolution |
| --- | --- | --- | --- | --- |
| `kick` | 축구공 킥 | ball at nearest enemies; gains count, bounce, pierce | 황금 축구화 | 황금 발롱볼 (4 balls, bounce 4) |
| `knuckle` | 무회전 프리킥 | wobbling piercing shot | 프리킥 연습 | 무회전 대포알 (infinite pierce) |
| `header` | 헤딩 점프 | jump, landing shockwave | 점프력 | 2.56m 슈퍼 헤더 (double shockwave) |
| `bicycle` | 바이시클 킥 | 360° kick around 날두 | 유연성 | 오버헤드 토네이도 (permanent aura) |
| `stepover` | 스텝오버 | auto-dash with i-frames when an enemy is about to touch | 스피드 훈련 | 환상 스텝오버 (afterimage burst) |
| `scissors` | 시저스 킥 | X-pattern curving balls | 골 결정력 | 더블 시저스 (8 directions, +crit) |
| `siuu` | SIUU 함성 | expanding stun ring | 카리스마 | 월드 SIUU (knockback, heal) |

Evolution rule: skill at Lv.6 **and** its paired passive owned (any level).

### Passives
황금 축구화 dmg +10 % · 프리킥 연습 projectile speed +10 % · 점프력 area +10 % · 유연성 cooldown −7 % ·
스피드 훈련 move +8 % · 골 결정력 crit +6 % · 카리스마 duration +12 % · 체력 단련 HP +20 · 볼 트래핑 magnet +30 % ·
회복 루틴 regen +0.25/s · 얼음 목욕 armor +1 (per level).

### Teammates (roles)

| Role | Behaviour (scales with Lv.) |
| --- | --- |
| 수비수 defender | orbits 날두, damages + knocks back what it touches |
| 골키퍼 keeper | follows; destroys enemy projectiles in a radius; punches close enemies |
| 윙어 winger | dashes in a straight line through enemies |
| 미드필더 mid | passes a ball to 날두, who auto-fires a piercing power shot |
| 스트라이커 striker | extra shots at nearby enemies (1→3) |

20 parody teammates, each tied to an era (`RS.TEAMMATES`). Sources: level-up cards (eras up to the current year),
rescue markers on the field (current era first; stand on the marker ~1 s), and the coach "동료 영입" card.
Teammates do not take damage.

### Eras and coaches

| Years | Era (parody club) | Coach(es) |
| --- | --- | --- |
| 2002 | 리스본 사자단 | 볼로뇨 감독 |
| 2003–08 | 맨체스터 붉은악마단 | 헤어드라이어 경 |
| 2009–17 | 마드리드 백색군단 | 엔지니어 감독, 스페셜 원, 눈썹 신사, 박치기 지주 |
| 2018–20 | 토리노 얼룩말단 | 알레그로 감독, 줄담배 감독, 마에스트로 감독 |
| 2021–22 | 맨체스터 붉은악마단 (귀환) | 동안 암살자 감독, 게겐 교수 |
| 2023–25 | 리야드 노란기사단 | 사막의 여우 감독 |
| 2026 | 포르투갈 대표팀 (night final) | 전략가 마르띠 |

Before each career year the coach of that year offers 3 cards: 2 of the coach's own buffs (not yet taken) + 동료 영입
or 동료 특훈 (all teammates +1). Cards stack for the rest of the career.

### 날두's look by year (`RS.ronaldoLook`)
Hair: frosted curls (≤2004) → slick (≤2010) → fade (≤2022) → fade + stubble. Kit follows the era. Gold boots from
2008 (first Ballon d'Or), captain armband from 2016. The intro screen shows "날두 진화!" with before/after sprites.

### Years
`RS.YEARS` has 25 entries (2002–2026), each with era, coach, a headline, and a season boss
(`keeper`, `tackler`, `maestro`, `striker`, `referee`, `giant` archetypes with parody names). `ballon: true` marks real
Ballon d'Or years (2008, 2013, 2014, 2016, 2017): first clear grants one 발롱도르. 2026 is `final: true` → 메시.

Per-year tuning is derived from the index (`RS.yearTuning`): enemy HP `1 + 0.55i + 0.03i²`, damage `1 + 0.1i`,
spawn rate `2 + 0.16i`/s, stage length `min(150, 95 + 3i)` s (final: 100 s before 메시), XP per kill `1 + 0.16i`.
Enemy mix adds 태클러 (2003+), 거구 센터백 (2005+), 심판 (2007+, throws cards); 기자단 lines sweep across.

### 메시 (final boss)
- Phase 1: 드리블 돌파 (0.7 s red line telegraph, then a fast dash), 감아차기 (3 curving balls),
  왼발 발리 (fan of 7). Keeps ~105 px distance and strafes.
- At 50 % HP: roar — 1.6 s invulnerable (blue ring), shockwave, minions stunned — then phase 2: +30 % speed,
  cooldowns ×0.62, 3-dash chains with shorter telegraphs, 5 curling balls, two-wave volley of 9, 꼬마 메시 minions.
- Death → victory screen with SIUU (twice), confetti, +1 발롱도르, new-career lap option (meta kept).

### Meta progression (`RS.META`, bought on 훈련장)
Coins: 근력 훈련 dmg, 심폐 지구력 HP, 스프린트 speed, 시야 magnet, 전술 이해 XP, 스폰서 계약 coins, 회복 훈련 cooldown.
발롱도르: 불사조 정신 (one revive per year), 전술 보드 (+1 reroll, ×3).
Coins per run: picked coins + kills/8 + clear bonus (40 + 8 × year index), × coin multiplier. Kept on death too.

## Career, saves, replays (`js/career.js`)

- Save key `ronaldo-survivors.save.v1` in `localStorage` (falls back to memory if storage is blocked).
  `RS.loadSave` fills missing fields with defaults and never throws on corrupt JSON.
- `career.build` persists across years (level, skills, passives, evolutions, teammates, coach cards). Start of each year
  (after the coach pick) is stored in `career.snapshots[idx]`. Dying keeps the career at the same year; retry restarts
  from that snapshot. Coins earned are kept.
- Cleared years can be replayed from their snapshot; replays pay coins but never change the career.

## Rendering and performance

- World is drawn into a low-res canvas (≈200 × 420 world px on a phone) at an integer scale and upscaled once with
  smoothing off: crisp pixels and cheap fills. Damage numbers and the joystick are drawn afterwards at device resolution.
- Sprites are pre-rendered to canvases once (normal, flipped, white flash). Enemies use object pools; collision and
  targeting use a spatial hash (typed-array linked lists, no per-frame allocation). Separation runs on half the crowd per
  frame. Damage numbers use a fixed ring buffer.
- Fixed 1/60 s simulation step with at most 4 catch-up steps per frame; the game pauses on tab hide.

## Audio
`assets/audio/siuu.mp3` plays through an `HTMLAudioElement` (works on `file://`) on: evolutions, season boss kills /
year clears, the 메시 win, and a revive. It is primed inside the first tap so mobile browsers allow later plays.
Everything else is short WebAudio chiptune (rate-limited). Mute buttons on the title, HUD and pause menu (saved).

## How to add content

- **Skill**: add an entry to `RS.SKILLS` (`lv` × 6, `ups` × 6, `evo`, `passive`), then a `case` in `World.fire`
  (or a special branch in `updateWeapons`). Add a projectile sprite key in `RS.Sprites.item` if it shoots something new.
- **Passive**: add to `RS.PASSIVES` with `mods` (keys listed under Stats).
- **Teammate**: add to `RS.TEAMMATES` with a `role` from `RS.ROLES` and an `era` key. Behaviour comes from the role.
- **Coach**: add to `RS.COACHES` with 3–4 `cards` (unique `id`s, `mods`), then reference it from a year.
- **Year**: append/edit `RS.YEARS` (`Y(year, era, coach, title, bossType, bossName, extra)`); tuning is automatic.
- **Boss archetype**: add to `RS.BOSS_TYPES` (`actions` from: dash, fan, ring, curl, burst, cards, summon, slam) and a
  sprite case in `RS.Sprites.boss`.
- Run `npm test`, `node tools/sim.js` (balance check) and `node tools/screenshots.js` (visual check, needs Playwright).

## Tests (`npm test`)
`combat` (damage, XP, level-up picks, slots, armor, revive) · `evolution` (rules, cards, chests, all evolved skills fire) ·
`teammates` (join via card and rescue, levelling, caps, every role) · `career` (year progression, coach picks, saves and
corrupt saves, replays, 발롱도르, shop, new lap) · `messi` (phase-1 moves, telegraphs, 50 % roar, phase-2 moves, win) ·
`sim` (bot clears 2002–2005 headlessly without NaNs; late-career stage keeps hundreds of enemies under the cap).
