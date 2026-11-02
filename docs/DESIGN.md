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
  A passive that pairs with an owned skill ignores the passive slot cap, so every owned skill can always evolve.
- Level-up cards show the evolution condition in one line (`진화: Lv.6 + 황금 축구화 패시브 필요` / `✓`, and on
  passives `진화 짝: 축구공 킥 → 황금 발롱볼`). Teammate cards show `역할: what it does` in one plain line.

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

Evolution rule: skill at Lv.6 **and** its paired passive owned (any level). Paired passives are offered much more
often once the skill is Lv.5+, and can be taken even with all 6 passive slots used.

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

Parody teammates, at least 3 per era (`RS.TEAMMATES`, 메시 eras included). Sources: level-up cards (eras up to the
current year), rescue markers on the field (current era; stand on the marker ~1 s), and the coach "동료 영입" card.
Teammates do not take damage.

**Squad = 2 starters + 3 bench (round 3).**
- `RS.MAX_MATES = 2` run on the pitch; `RS.MAX_BENCH = 3` sit on the bench. A new signing goes to the pitch if there
  is room, else to the bench; with 2+3 the rescue marker becomes a transfer swap (any of the five can be released).
- Every role gives a team buff while on the pitch (`RS.ROLE_BUFF`: defender 받는 피해 -1, keeper 체력 +15, winger
  이동속도 +6 %, mid 쿨타임 -5 %, striker 공격력 +8 %); bench players give `RS.BENCH_FACTOR` (34 %) of it.
- The two starters form a named partnership by role pair (`RS.PAIR_SYNERGY`, 15 combos: 원투 패스, 철벽 수비, 투톱 …).
  Recruit cards preview the partnership they would create (`RS.synergyHint`).
- Between seasons the intro screen's squad panel has 벤치로/선발로 buttons (`RS.toggleBench`); replays keep that
  year's squad.

**Boss rewards (`RS.BOSS_REWARDS`).** After a season boss falls in a career year the result screen offers 3 of 5
permanent perks (max HP +20, reroll +1, all teammates +1 Lv, coins +150, an extra coach card); the boss also banks
`30 + 6·idx` coins directly (pickups would be lost at the phase change).

**Transfers (the squad follows the career).**
- When the club changes (2003, 2009, 2018, 2021, 2023, 2026), a transfer window opens after the coach pick:
  up to 2 era players, each "빈 자리에 영입" / "○○ 방출" (swap) / "영입하지 않기". A swapped-in player inherits
  the released teammate's level, so following the career is never a downgrade.
- During a run, a rescue marker still appears with a full squad (current-era player); reaching it opens an in-run
  "이적 제안" (swap with level inheritance, or keep).
- Keepers save one projectile per cooldown (`max(0.9, 2.0 − 0.25·Lv)` s, radius `20 + 3·Lv`) and cannot save
  메시's shots or a 강슛.

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
spawn rate `2.3 + 0.18i`/s (debut year ×0.55), stage length 60 s for every year (then the boss), XP per kill `1 + 0.16i`.
Inside a stage enemies toughen with elapsed time (`rampHp` 0.35, `rampDmg` 0.2, `rampSpeed` 0.1 at the end) and carry a
visible tier (0/1/2 by thirds of the minute: darker kit, red outline); banners mark the 2nd and 3rd wave. Spawning drops to
30 % once the boss is out so the fight stays about the boss. `RS.powerScore(build)` is the HUD "⚔ 전투력" number and
`RS.threatStars(idx)` the 1–5 ★ threat shown on the year intro.
Enemy mix adds 태클러 (2003+), 거구 센터백 (2005+), 심판 (2007+, throws cards); 기자단 lines sweep across.

### Boss attacks (anti-kiting, all telegraphed)
Bosses lead their attacks using the player's smoothed velocity (`World.predict`), so running in a straight line
gets punished, but every attack is readable:

| Move | Telegraph | Why a kiter gets hit |
| --- | --- | --- |
| `dash` / `cut` | wide red line, tracks until 0.25 s before the dash | aimed at / across the escape path |
| `snipe` 강슛 | thin red aim line tracks, locks 0.16 s, then 3 fast balls (380+ px/s) | sidestepping late into the side balls |
| `pslam` | 1 or 3 red circles where the player is heading, 1.0 s | flanking circles cover both sides |
| `curl` | — | curving balls home briefly (limited turn rate) |
| `encircle` 포위망 | ring of faded balls around the player for 0.7 s, one gap | must find the gap |
| `fan`, `ring`, `burst`, `cards`, `summon` | wind-up | volume |

Season bosses use 5-move lists per archetype (`RS.BOSS_TYPES`). Bosses are stun-immune. The first two years use
fewer bullets (`bossDensity`) and slower cooldowns.

### Boss HP and fight length
Boss HP starts at `max(base × bossHpMul, recent total DPS × 0.25 × target)`. At 2, 6, 12, 20 and 30 s after the
boss first takes damage, HP is rescaled (up or down, never below base) so the damage rate measured on the boss gives
a fight of about `22 s × fight` (메시 ×1.3, debut year ×0.7). The HP bar keeps its fraction, so the change is
invisible. This removes the power creep of the carried-over build: late bosses no longer melt in 7 s.

### 메시 (final boss)
- Phase 1: 드리블 돌파 (0.65 s tracking line, then a fast dash), 감아차기 (3 curving balls that home briefly),
  왼발 발리 (fan of 7), 강슛 (single ball), 포위망. Keeps ~105 px distance and strafes.
- At 50 % HP: roar — 1.6 s invulnerable (blue ring), shockwave, minions stunned — then phase 2: +30 % speed,
  cooldowns ×0.62, 3-dash chains that each end in a point-blank 3-ball volley, 5 curling balls, two-wave volley of 9,
  3-ball 강슛, tighter 포위망, 꼬마 메시 minions.
- Death → victory screen with SIUU (twice), confetti, +1 발롱도르, new-career lap option (meta kept).
- Final bosses are generic: `RS.FINAL[type]` holds the two action lists, rage multipliers, ball sprite and minion.
  The 메시 career ends with `ronaldo` (dash·snipe·pslam·burst·wall → + ring·summon 꼬마 날두).

### 메시 (playable hero, `RS.HEROES.messi`)
- Title-screen hero buttons; each hero keeps his own career (`save.careers[hero]` parks the other), meta is shared.
  `RS.selectHero()` points `RS.YEARS`/`DEBUT_YEAR`/`BIRTH_YEAR` at the active career; `RS.YEARS_MESSI` has 23
  years (2004 Barcelona debut → 2026 final vs 날두) with eras barcelona/paris/miami/argentina and 10 parody coaches.
- Move speed ×1.22, slide cooldown 3 s (날두 5 s).
- No projectiles: starts with `orbit` (발롱도르 공) — `count` golden balls circle at `radius`, each enemy touched takes
  `dmg` every `cd` s (per-enemy timer `e.orbT`). Lv.1→6: 1→4 balls, size 1→2×. Evolution with the 발롱도르 수집 passive
  offers two cards: 8발롱도르공 (8 balls) or 8발롱도르 (one ball 8×, knockback). `build.evolved.orbit` stores the
  variant name; `RS.skillStats` reads `evos[variant].stats`.
- 킥, 무회전 프리킥, SIUU 함성 are 날두-only (`skill.hero`); orbit and 발롱도르 수집 are 메시-only.

### Hero readability (round 3)
- The hero sprite alone has a gold double outline (`paint` `opt.glow`), a pulsing gold ring + soft light pool under
  the feet, a bobbing gold chevron above the head and a gold-framed HP bar.
- Enemy kits are pulled 38 % toward a slate tone (`dull`) and enemies within 18 px of the hero draw at 55 % alpha so
  he never vanishes in a pile. Teammates get a thin green outline.

### Balance targets (checked by `tests/balance.test.js`)
- A player who does not move survives the first 45 s of 2002 (5 seeds).
- The repo bot clears 2002–2025; median season-boss fight 28–90 s, ≥75 % of fights within 20–100 s.
- At least 2 of the first 6 season bosses land hits on the bot.
- 메시 takes the strong bot below half HP in at least 1 of 4 seeds while the bot still wins most.
- The weak bot (`RS.WEAK_BOT`: 0.12 s reaction delay, ±0.3 rad steering noise, no meta) both loses and wins
  against 메시 across 6 seeds.

### Round-2 tuning (before → after)

| Value | Before | After |
| --- | --- | --- |
| 2002 enemy damage mult | 0.6 | 0.35 |
| 2002 spawn rate mult | 0.75 | 0.65 |
| 2003 enemy damage mult | 0.8 | 0.75 |
| Boss damage scaling | `1 + 0.1·i` | `1 + 0.12·i` (× gentle in 2002/03) |
| Boss HP | `hp × hpMul` fixed | base floor + fight-length calibration |
| 메시 base HP / contact dmg | 1500 / 16 | 700 / 16 (calibrated up to ≈58 s) |
| Boss stun | ×0.15 of normal | immune |
| Keeper save | unlimited, radius `26 + 5·Lv` | 1 per `max(0.9, 2 − 0.25·Lv)` s, radius `20 + 3·Lv` |
| Stepover i-frames | dash + 0.12 s | dash + 0.04 s |
| XP to next level | … `+ (L−30)·12` | … `+ (L−30)·14 + (L−50)·30` |

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

- People are 13 × 16 px templates (`js/sprites.js`): 4 run frames plus a kick pose and a heading-jump pose for 날두;
  bosses are drawn at 2×. The renderer picks scale `round(min(devW/156, devH/280))` → 5× on a 390-px phone (날두 ≈ 45 CSS px).
- Effects (`World.fx`): impact shards on every hit (crits golden, with a flash cross), kill bursts, dust behind the running
  feet, ball trails, level-up ring, boss telegraphs, screen shake (hurt, wave, crit on boss, clear), low-HP red vignette.
- World is drawn into a low-res canvas (≈156 × 338 world px on a phone) at an integer scale and upscaled once with
  smoothing off: crisp pixels and cheap fills. Damage numbers and the joystick are drawn afterwards at device resolution.
- Sprites are pre-rendered to canvases once (normal, flipped, white flash). Enemies use object pools; collision and
  targeting use a spatial hash (typed-array linked lists, no per-frame allocation). Separation runs on half the crowd per
  frame. Damage numbers use a fixed ring buffer.
- Fixed 1/60 s simulation step with at most 4 catch-up steps per frame; the game pauses on tab hide.

## Audio
One WebAudio graph for everything: SFX bus (gain = 효과음 slider) and SIUU → compressor → output. `assets/audio/siuu.mp3`
is decoded into the graph (on `file://`, where fetch is impossible, an `HTMLAudioElement` fallback plays it) on:
evolutions, season boss kills / year clears, the 메시 win, and a revive. The graph is unlocked inside the first tap and
resumed on every tap and on returning to the tab. iOS: `navigator.audioSession.type = 'playback'` when available, else the
graph is routed through a hidden `<audio>` element, so the ringer switch does not silence the effects. SFX are short
synthesised chiptune with ±6 % random pitch, rate-limited per name (kick thump+slap, hit, crit, kill, climbing gem
arpeggio, coin, hurt, low-HP heartbeat, level-up, chest, evolve, wave alarm, boss, crowd cheer…). Pause menu: 효과음 / SIUU
sliders (saved in localStorage) and a 소리 테스트 button.

## How to add content

- **Skill**: add an entry to `RS.SKILLS` (`lv` × 6, `ups` × 6, `evo`, `passive`), then a `case` in `World.fire`
  (or a special branch in `updateWeapons`). Add a projectile sprite key in `RS.Sprites.item` if it shoots something new.
- **Passive**: add to `RS.PASSIVES` with `mods` (keys listed under Stats).
- **Teammate**: add to `RS.TEAMMATES` with a `role` from `RS.ROLES` and an `era` key. Behaviour comes from the role.
  Keep at least 3 per era so transfer windows have offers.
- **Coach**: add to `RS.COACHES` with 3–4 `cards` (unique `id`s, `mods`), then reference it from a year.
- **Year**: append/edit `RS.YEARS` (`Y(year, era, coach, title, bossType, bossName, extra)`); tuning is automatic.
- **Boss archetype**: add to `RS.BOSS_TYPES` (`actions` from: dash, cut, snipe, pslam, slam, curl, encircle, fan,
  ring, burst, cards, summon; `fight` = fight-length factor) and a sprite case in `RS.Sprites.boss`.
- Run `npm test`, `node tools/sim.js` (balance check) and `node tools/screenshots.js` (visual check, needs Playwright).

## Tests (`npm test`)
`combat` (damage, XP, level-up picks, slots, armor, revive) · `evolution` (rules, cards, chests, all evolved skills fire) ·
`teammates` (join via card and rescue, levelling, caps, every role) · `career` (year progression, coach picks, saves and
corrupt saves, replays, 발롱도르, shop, new lap) · `messi` (phase-1 moves, telegraphs, 50 % roar, phase-2 moves, win) ·
`sim` (bot clears 2002–2005 headlessly without NaNs; late-career stage keeps hundreds of enemies under the cap) ·
`balance` (targets above) · `round2` (evolution hints and reachability, role lines, transfer window, in-run swap,
boss stun immunity and HP calibration, 강슛).

`tools/sim.js [from] [to] [seed] [weak]` prints per year: boss fight time, min HP, hits, boss damage, level, DPS.
