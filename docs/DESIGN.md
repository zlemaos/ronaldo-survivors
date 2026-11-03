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
`RS.threatStars(idx)` the 1–5 ★ threat shown on the year intro (see Round 7).
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
- The final keeps the hero's pace (`World.recalc`): boss bullets, dashes and walking speed scale by
  `max(1, hero move / (RS.BASE_MOVE × moveMul × RS.FINAL_PACE))`; telegraph and cooldown times do not scale.
  `RS.FINAL_PACE = 1.2` reproduces the round-5 duel (30 seeds: strong bot 26/30 wins, 21/30 below half; weak bot
  10/30 wins; round 5: 25/30, 22/30, 9/30). Without it a round-6 build (≈150 px/s) outran every pattern.
  `finalScale` multiplies the duel's damage by the toughness the graded items add (max HP + 60 s of regen).

### 메시 (playable hero, `RS.HEROES.messi`)
- Title-screen hero buttons; each hero keeps his own career (`save.careers[hero]` parks the other), meta is shared.
  `RS.selectHero()` points `RS.YEARS`/`DEBUT_YEAR`/`BIRTH_YEAR` at the active career; `RS.YEARS_MESSI` has 26
  seasons: youth (`youth: true`) 1995 로사리오 · 1998 성장호르몬 진단 · 2001 냅킨 계약서/라 마시아, then the 2004 Barcelona
  debut → 2026 final vs 날두, with eras rosario/masia/barcelona/paris/miami/argentina.
- Difficulty follows `RS.tuneIdx`: youth seasons play like the debut year; pro seasons count from the debut, so both
  heroes share one pro curve.
- Story events (`RS.EVENTS`, `year.event`) are asked once before that season's coach (career years only):
  - `hgh` (1998): 성장호르몬 주사 = difficulty. Until it (and for the whole career when refused) 메시 has a small body:
    `RS.SMALL_BODY` (max HP −30, damage −20 %) and a shorter sprite. `build.hgh`: null undecided, true treated,
    false = 하드 모드 (shown on the title, intro, HUD and victory screen).
  - `dingyo` (2004): 딩요 joins the squad and teaches one of: 엘라스티코 (a `gift` move never dealt at level-ups; a
    full skill bar gets "모든 스킬 Lv.+1" instead), 노룩 패스 or 즐기는 축구 (lasting mods, stored like coach cards).
- Old saves: career schema `v: 2` (`RS.migrateCareer`). A 메시 career saved before the youth seasons shifts its year
  indices past them (youth marked cleared), keeps its snapshots and is treated (`hgh: true`). To play the youth and
  make the growth-hormone choice, the player uses 🔄 처음부터 on the year screen (`RS.newCareer`: the active hero's
  career restarts; coins, 발롱도르 and 훈련장 upgrades stay).
- Move speed ×1.22, slide cooldown 3 s (날두 5 s).
- No projectiles: starts with `orbit` (회전 공) — `count` balls circle at `radius`, each enemy touched takes
  `dmg` every `cd` s (per-enemy timer `e.orbT`). Lv.1→6: 1→4 balls, size 1→2×. Evolution with the 발롱도르 수집 passive
  offers two cards: 8발롱도르공 (8 balls) or 8발롱도르 (one ball 8×, knockback). `build.evolved.orbit` stores the
  variant name; `RS.skillStats` reads `evos[variant].stats`.
- The ball grows up with the skill (`RS.orbitLook`): a plain white ball at Lv.1-2, a golden ball from `goldLv` 3, the
  발롱도르 trophy ball (polished gold, engraved seams, little stand, glow and twinkles) once evolved; a flash ring marks
  the change mid-run. `RS.Sprites.orb` paints each look per pixel (lit sphere, 32-panel pattern spinning, cached frames).
- `orbit.upW: 3`: its upgrade card is weighted ×3. It was offered in ~34% of first hands and ~43% of random pickers
  still had one ball after 10 level-ups; now it is offered in ~69% and ~16% are still at one ball (test in
  `hero.test.js`).
- Every move belongs to one hero (`skill.hero`). 메시's own: 회전 공, 티키타카 (bouncing passes), 왼발 감아차기
  (homing curlers), 원더골 드리블 (auto dash), 뭘 봐, 바보야? (stun glare, no SIUU), 킬 패스 (straight piercing pass),
  칩슛 (lobs onto the toughest enemy, boss first) and 엘라스티코 (딩요's gift). `skill.use` reuses a 날두 runtime
  behaviour under 메시's own name, numbers, ball look (`skill.proj`) and evolution. Passives paired only with the other
  hero's moves are never offered (`RS.passiveFor`); 메시 has 7 of his own. Items: 호날도/에그타르트 are 날두's,
  메시아 (메! 시! 아! combo)/마테차/약물 꽂기 (초히든, all stats up; a 하드 모드 body stays small) are 메시's
  (`relic.hero`). 메시 celebrates with the crowd and ☝️, not SIUU.

### Round 7: 메시 plays like 메시, teammate OVR, the mid-career wall, 첼씨
- 메시 never shoots or throws a ball himself: a projectile move names its `passer` (`xavino` 챠비, `iniestar`
  니에미스타). `World.passerFor` uses that squad member when he is on the pitch, else a support runner who trails
  메시 (`World.updatePassers`; drawn like a teammate with the ball at his feet, never hit) — the ball leaves from him.
  No 날두 motions (header, jump, scissors, bicycle) for 메시; his dash moves use his own low dribble pose.
- Old 메시 saves that still hold 날두 moves: `RS.normalizeBuild` swaps each for its `RS.MESSI_COUNTERPART`
  (moves, passives and items; level and evolution kept).
- Names are recognisable parody spellings: 챠비, 니에미스타, 네이마루, 피케츄, 뿌욜, 람빠드, 쩨흐, 드록빠, 꾸르뚜아,
  부퐁, 판데르싸르, 음바뻬, 끌롭 …
- Teammate OVR (`TEAMMATES[id].ovr`) → grade `RS.MATE_TIERS` (레전드 90+, 월드클래스 85+, 주전급 78+, else 유망주)
  and power `RS.mateMul` = 1 + (OVR − pivot) × `MATE_OVR_STEP` 0.02 (pivot 80; 60 in youth seasons, so kids are
  rated against kids). Transfer and swap cards show `RS.swapVerdict`: ▲/▼ OVR before → after and a position change.
- Level-ups never run dry: special cards are rarer (`RS.SPECIAL_ODDS`), a coin draw costs +50 % per item owned
  (`RS.drawCost`), an evolved move keeps growing with 각성 ★1–5 (`RS.STAR_STEP`: +12 % damage, −4 % cooldown per
  star), and 개인 훈련 (`RS.DRILLS`, small uncapped boosts) fill a hand once moves, passives and teammates run out.
- The wall: from pro season `RS.WALL.from` (5) every season adds enemy HP (linear + quadratic), damage, speed,
  density, boss damage and poise (knockback/stun on them × 1 / (1 + poise × seasons)). 고난의 시즌 (`year.trial`
  1–3, `RS.TRIAL` per level) are the hardest seasons of each life: 날두 2004▲▲ 2005▲ 2006▲ 2007▲▲ 2022▲▲▲,
  메시 2010▲ 2012▲▲ 2014▲▲▲ (15 s 연장전 before the boss) 2016▲▲▲ 2020▲▲. Red edge in the year list, red pill on the
  intro.
- 첼씨 (`year.foe: 'chelsea'`, `RS.FOES`): the crowd wears royal blue (`RS.foeColors`) and the 버스 sweeps in three
  times (two rows of heavy defenders marching straight across; break a gap or run around the end). 날두 2005·2007·2008,
  메시 2012. Boss type `drogba` (드록빠: cannon shots, shoulder charge, header slam, 버스 wall, short rests, longer
  fight) in 날두 2007 and 메시 2012.
- `RS.threatStars` reads log10(enemy HP × damage) of the season, so the wall and the trials show; the final is ★5.

### Round 8: difficulty, auto play, 메시's own moves, press conferences
- **Difficulty** (`RS.DIFFS`, saved in `save.meta.diff`, picked on the title, shown in the HUD; default 노멀). The values
  multiply the season curve (`RS.yearTuning`); `grow` adds × (1 + grow × season index). On 노멀/하드 the extra toughness
  ramps in over the first three seasons, so the debut plays as before; 이지 applies fully at once.

  | | enemy HP | enemy dmg | crowd | boss hits | grow | heal drops |
  |---|---|---|---|---|---|---|
  | 이지 | ×0.72 | ×0.65 | ×0.85 | ×0.8 | 0 | ×1.4 |
  | 노멀 | ×1.3 | ×1.25 | ×1.1 | ×1.25 | 0.015 | ×1 |
  | 하드 | ×1.75 | ×1.6 | ×1.22 | ×1.6 | 0.03 | ×0.6 |

  Strong bot (`tests/career-sim.js`, seeds 3 / 7; "stops" = three deaths in one season): 날두 clears 이지 without 훈련장
  upgrades; 노멀 stops at 2022 without them and clears with half of them; 하드 stops at 2017 / 2004 without and 2022 / 2020
  with half. 메시: 노멀 stops at 2020 / clears without upgrades, clears with half; 하드 stops at 2016 / clears without,
  clears with half. The round-7 curve sits between 이지 and 노멀.
- **Auto play** (`save.meta.auto`: off / semi / full; title buttons and the HUD 오토 button). 반자동: the bot moves while the
  screen is untouched, picks plain level-up hands, opens chests and starts the next season or the retry; graded, 약물 and
  gamble cards, press answers, coach cards, boss rewards, story events and transfer offers stay with the player. 완전 오토 picks those
  too: `RS.botChoose` takes 초히든 > 울트라 / a 약물 dose > 히든 > evolution > a card that links with the build now (a
  passive that opens an evolution, a move whose passive is owned, a teammate completing a named pair) > upgrades; press
  answers by their `ai` rank, never a career-ending gamble. A touch takes over at once; a badge with a bar shows the
  next automatic step.
- **Hero-only items**: `hero` on `RS.SKILLS` / `RS.RELICS` limits who can be offered them (`RS.relicOk`). 폭발 슈팅 and
  별똥별 are 날두's; 메시 gets 알까기 연쇄 (히든: a kill nutmegs the ball through 3 nearby enemies, damage + stun) and
  외계인 모드 (초히든: every 4 s an afterimage zigzags through 8 enemies, big damage + stun, invulnerable meanwhile).
- **메시's ball moves**: 회전 공 (`orbit`), 드리볼 (`dribball`: balls leave him to chase and hit the enemies around him),
  드롭볼 (`dropball`: balls circle him, rise over a crowd, fall like a meteor — area damage, crater, dust — and come back
  after `respawn` s), 신의 손 (`hand`: a giant hand slams the thickest crowd, stuns it; also learned at the 2007 press
  conference).
- **Pitch**: two teammates at most (`RS.MAX_MATES`); passes come only from the two starters, no extra runners. 챠비 +
  니에미스타 on the pitch = 티키타카 트리오 (`RS.NAMED_PAIRS`: 메시 공격력 +30 %, 쿨타임 -10 %, 동료 공격력 +20 %,
  their passes +25 %); 뻽's 2009 story event can put both in.
- **약물 꽂기 = stimpack** (메시 after the growth-hormone treatment; refusing the treatment still keeps the small body):
  up to `RS.STIM.max` = 5 doses, each extra dose adds `RS.STIM.step` = 25 % of the first dose's mods; offered on
  1.2 % (first) / 2.5 % (next) of level-ups. Every dose card can be taken or passed.
- **Press conferences** (`RS.PRESS`, 5 per hero, `RS.pressFor(idx)`): typed lines with inner thoughts and camera
  flashes, then 2–3 answers. Answers may roll odds, move 민심 (`b.fans`, 0–100; its tier is a lasting buff or curse),
  fine coins, teach a move or end the career (`RS.ENDINGS` → bad-ending screen; coins, 발롱도르 and 훈련장 stay).
  탈세: 아버지에게 미룬다 = 90 % it passes and the father goes to jail, 10 % bad ending; 자백한다 = 공격력 -8 %,
  최대 체력 -10, 민심 +10, the career goes on.
- **Look and motion**: the renderer draws between the last two fixed steps (`alpha`) so motion stays smooth at any
  refresh rate; HD grass, a soft vignette, hit squash and enemies falling over on a kill; each new move has its own
  effect (hand, impact ring + crater, nutmeg zip, afterimages).

### Round 9: a real 하드, the 엘 클라시코 rival, 합체 moves, rarer graded cards, pixelfx effects
- **Difficulty, again.** 완전 오토 cleared 하드, so both pro settings got much tougher and 하드 bites from the first pro
  season. `RS.DIFFS` also scales graded-card odds (`special`), knockback/stun taken (`poise`), the rest between boss
  attacks (`bossCool`) and the ramp-in (`ramp` seasons; 0 = at once).

  | | enemy HP | enemy dmg | crowd | boss hits | grow / season | heal drops | graded cards | poise |
  |---|---|---|---|---|---|---|---|---|
  | 이지 | ×0.72 | ×0.65 | ×0.85 | ×0.8 | 0 | ×1.4 | ×1 | ×1 |
  | 노멀 (round 8 → 9) | ×1.3 → ×1.6 | ×1.25 → ×1.5 | ×1.1 → ×1.25 | ×1.25 → ×1.5 | 0.015 → 0.035 | ×1 → ×0.9 | ×0.85 | ×0.85 |
  | 하드 (round 8 → 9) | ×1.75 → ×2.4 | ×1.6 → ×2.1 | ×1.22 → ×1.5 | ×1.6 → ×2.2 | 0.03 → 0.05 | ×0.6 → ×0.45 | ×0.5 | ×0.6 |

  Strong bot (= 완전 오토) with the whole 훈련장, seed 7: 노멀 clears with a near-death in 2022 (14/403 HP); 하드
  stalls in 2020 (`tests/round9.test.js` guards the 하드 stall; `round8` only asks 노멀 to reach the 마드리드 years
  with half a 훈련장).
- **Graded cards** (`RS.SPECIAL_ODDS`): per level-up 히든 0.9 %, 초히든 0.25 %, 슈퍼히든 0.08 % (a third of round 8);
  draws 45 / 160 / 420 coins and `RS.DRAW_COST_STEP` 0.75 per owned item, weighted to their floor grade; chests 3 %.
- **엘 클라시코** (`RS.RIVAL`, `World.spawnRival`): 날두's 마드리드 seasons 2009–2017 and 메시's 2010–2018 bring the
  other hero at 42 % of the stage for `RS.RIVAL_WINDOW` = 30 s with a countdown on the boss bar. `rivalLv` (0–8)
  unlocks his move lists (`tiers`), adds 30 % HP and 8 % damage per level and from `rageAt` = 3 a second phase at
  half HP. His HP is seeded from the player's recent output (`RS.RIVAL_HIT_SHARE`) and calibrated at the first two
  checkpoints to `secs` = 0.47 + 0.1 × lv windows, then fixed: the first 클라시코 falls in 11–17 s, the fifth is
  decided in the last seconds, the ninth is not caught by the bot. Kill = 클라시코 win (chest, coins); the window
  closing = loss (he leaves); the season goes on either way. `build.rivalry` keeps the record (shown as a chip),
  each result moves 민심 by `RS.RIVAL_FANS` = 8, and a lost 클라시코 in a 발롱도르 year hands the trophy to the rival
  (`out.ballonStolen`; a replay that wins it takes it back). 메시 2009 is the Rome final: 호날두 as the season boss
  with the final's move lists and rage.
- **합체** (`RS.SKILLS[*].fusion`, `RS.availableFusions`, `RS.fuse`): two evolved moves fuse into a new move that
  takes one of their slots at Lv.1 and frees the other; it levels, evolves and awakens like any move, and tier-2
  fusions fuse two fused moves. The card leads the hand (after an evolution) and 완전 오토 takes it first. 날두:
  유도 대포알 (강슛+무회전: homing cannon balls that explode), 공중 지배 (헤딩+바이시클: landing + rolling tornado
  rings), 환상 난무 (스텝오버+시저스: a zigzag through the crowd, untouchable only while it runs), 지옥의 함성
  (SIUU+불꽃 질주: the roar leaves a ring of fire), CR7 궁극기 (유도 대포알+공중 지배: golden meteors). 메시: 위성 군단
  (회전 공+드리볼), 유성우 폭격 (드롭볼+로빙), 마라도나 모드 (원더골+엘라스티코), 패스 교향곡 (티키타카+킬 패스),
  신의 분노 (신의 손+바보야), GOAT 모드 (위성 군단+유성우 폭격). Fused tables are × `RS.FUSE_SCALE` = 0.42 (the gain
  is the free slot and the new behaviour; unscaled, the bot cleared 하드 outright) and the final rival hits ×
  (1 + `RS.FINAL_FUSE` × depth) per fused move.
- **pixelfx effects** (`js/pixelfx.js` = `tools/build-fx.mjs` over `tools/fx-entry.js` + `vendor/pixelfx`, MIT; see
  `docs/FX_RESEARCH_KO.md`): the world queues effects as data (`World.pfx` → `w.pfxQ`), `Renderer.drawPfx` runs the
  live instances in a colour + additive-light frame the size of the low-res canvas and composites the touched rows
  over the scene. Library effects: hit spark (crits on bosses, 준보스, elites), small explosion (클라시코 win, gold),
  big explosion (season boss), heal. Our own, to the same contract: spark pop (tank / elite kills), gold burst
  (evolution, 합체, evolved SIUU, 초히든+ items), boom small (유도 대포알 hits, 드롭볼 and meteor impacts, 신의 손 and
  공중 지배 as a white shock), stun stars. Cap `RS.PFX_MAX` = 24; measured 2.6 ms a frame with 12 live. Hit stop
  (`RS.HIT_STOP`): the match freezes 0.12 s on a boss or rival kill and 0.035 s on a boss crit.

### Round 10: penalties, 발롱도르 balls only from 발롱도르 won, a varied 메시 hand
- **메시's hand.** 회전 공 carried `upW` 4, so its upgrade card weighed 12 against 1.7 for a new move: on 하드 37–72 %
  of a youth hand held it and a 회전 공-only pick evolved it at Lv.9 in 1995. Without `upW` it is 10–33 %. 회전 공
  evolves only after the career's first 발롱도르 (`RS.availableEvolutions`).
- **발롱도르 balls** (`RS.ballonCount`, `build.ballons`): trophy balls come only from the 발롱도르 this career has won
  (메시 up to 8, 날두 up to 5); before that the balls stay gold. Career schema 3 (`RS.backfillBallons`) rebuilds
  `build.ballons` and each snapshot's from the cleared 발롱도르 seasons and takes back a 회전 공 evolved too early.
  `UID` is per world, so a match replays exactly from its seed. 하드 `grow` 0.05 → 0.08: replayed per seed, 완전
  오토 with the whole 훈련장 still cleared 하드 on 2 seeds of 8; now it stalls on all of them between 2011 and 2017.
- **페널티킥** (`js/pk.js` rules, `js/pkscene.js` one kick, `js/pkrender.js` drawing, `js/pkui.js` screens). Real
  numbers it is shaped on (messivsronaldo.app, Sept 2025): 날두 177/210 (84.3 %), 메시 113/145 (77.9 %); 메시 never
  scored against 쩨흐 in six games and hit the bar from the spot in 2012.
  - A kick: pick a zone (`RS.pkZoneCount`: 3 along the ground, 6 from Lv.35, 9 from Lv.70), stop the power gauge
    (`RS.PK_POWER`: green 0.70–0.88; weak below 0.55, over-hit above 0.95), stop the needle on the white arc
    (`RS.pkTiming`: the needle, the gauge and the arcs widen with 골결정력; gold = perfect, two turns = a miss).
  - 골결정력 (`RS.pkFinishing`) = 62 날두 / 54 메시 + level × 0.2 (max +24) + 3 per 훈련장 `pkdrill`.
  - Odds (`RS.pkOdds`): a miss from the zone, the needle and an over-hit; a save from the zone × (keeper rating / 80)²
    × power × placement × 골결정력. A keeper's `nemesis` caps one hero (쩨흐 vs 메시: 10 %, the rest on the frame).
    The aim grid shows each zone's odds. `tests/round10.test.js` guards: the bot 날두 beats the bot 메시 at Lv.10,
    60 and 120; late 날두 vs a national keeper 78–92 %.
  - **PK 챌린지**: every `RS.PK_EVERY` = 5 matches (cleared or not; `meta.pk.games`) five kicks against a keeper
    from the career's stage (`RS.PK_POOLS`: 동네 수문장 → 야씬). `RS.pkCoinPer` coins a goal (8 + (rating − 50) / 2),
    five of five pays eight. Each hero keeps his own record (`meta.pk.heroes`); titles at 10 / 25 / 50 goals
    (`RS.PK_TITLES`, the last 세계 최고의 페널티 키커). The title screen shows the record and the matches left.
  - **승부차기** (`RS.SHOOTOUTS`): 날두 2004 · 2006 · 2008 · 2012 · 2016 · 2024, 메시 2015 · 2016 · 2021 · 2022 ·
    2023 · 2024, and 메시 2012's single penalty against 쩨흐. After that season is cleared: five a side in the real
    order, the hero at his real place, teammates rolled (`RS.SO_MATE` 0.76 at rating 80), the other side's kicks
    against our keeper (the player picks the dive), sudden death, decided early when it cannot be caught. A win pays
    `RS.SHOOTOUT_COINS` 120 (single: 60) and moves 민심 by `RS.SHOOTOUT_FANS` 5, once per season; a loss can be won
    back by replaying the season.
  - 반자동 and 완전 오토 kick and dive by themselves (`RS.pkBotKick`), and the screen's button switches any kick to
    the player. The kick that can decide a shootout is slow-motion with a zoom on the goal.
  - Effects: night stadium with a crowd in both sides' colours (it jumps on a goal), LED boards that flash, a net
    that bulges where the ball went in, a white flash, light and a gold firework for our goal, spark and shake on a
    save or the frame, `GOAL!!` / `SIUUU!` shouts, fireworks and confetti for a won shootout or five of five.

### Round 11: 담백하게 — one weapon, grades, fewer and meaner enemies, 토레쓰
Player feedback (31세 하드, Lv.90): the screen was unreadable (six moves, evolutions, 합체, damage numbers
everywhere), level-ups came too fast, nobody could die (메시 bot: 0 hits a season from 2004 on), the rival never
fell, coins had nothing left to buy, teammates did not fit the year (수아레즈 at the start), crowds were far too
big in the 20s and the 첼씨 seasons.
- **One weapon** (`build.weapon = {id, g, p, v}`): the moves of `RS.SKILLS` are now weapons. Grade
  `RS.GRADES` 일반 · 고급 · 레어 · 에픽 · 황금 · 무지개 picks the move's table row (Lv.1/2/3/4/6) or its evolved form
  (무지개) and multiplies its damage (×1, 1.3, 1.69, 2.2, 2.86, 3.71); 강화 +1 … +10 adds 3 % a step, so a +10
  (×1.27) always stays below the next grade's +1. `RS.syncWeapon` mirrors the weapon into `skills / skillOrder /
  evolved` so the World and the Renderer run the move as before (one entry). Owned weapons wait in the 무기고
  (`build.armory`, one copy per move, the best kept); `RS.gainWeapon`, `RS.equipFromArmory`, `RS.enhanceWeapon`.
- Level-up hand: three cards (a graded item / gamble is added as a 4th) from: one weapon card (`RS.offerWeapon`:
  a move not owned or a better copy, grade odds `RS.GRADE_ODDS` 56 / 27 / 12 / 4 / 0.9 / 0.1 %, +1 … +4; taking it
  swaps the weapon in hand, the old one goes to the 무기고), 강화 +1, passives (plain stat boosts, six slots),
  teammates, 개인 훈련. Skills, skill levels, evolutions, 합체 and 각성 cards are gone; 합체 moves come as 황금+
  weapons (`RS.FUSED_FROM`). Old saves: each move becomes a weapon by its level (`RS.weaponFromSkill`), the best in
  hand.
- Grade colours on every card (`g-0 … g-5` in css): grey, green, blue, purple, gold (shine) and an animated
  rainbow; graded items share the scale (`RS.TIER_GRADE`: 레어 blue, 히든 purple, 초히든 gold, 슈퍼히든 rainbow),
  teammates by OVR tier (`RS.MATE_GRADE`, one grade more from +8).
- Teammates: only the hero's real teammates of that club and season (`RS.TEAMMATES[].yrs`, `RS.mateCandidates`).
  Each signs already trained, 강화 +1 … +10 (`RS.MATE_PLUS_W`, +1 common, +10 rare); the team effect grows 6 % a
  step (`RS.ROLE_PLUS`). Each role has one plain job and an icon (`RS.ROLES`), shown on the card and above the
  player on the pitch. When a season ends, whoever does not play beside the hero next season (another club, his
  years over) leaves, and the best free man of that club and year takes his place at the same 강화
  (`RS.releaseOffSeason`, also run on old saves): the squad's training is kept, only the faces change; the result
  screen names who left and who came. The 토레쓰 reward player stays for good.
- 코인: 훈련장 sells 무기 상자 (90 / 320 / 1100 coins, `RS.WEAPON_BOXES`), weapon 강화 with falling odds
  (`RS.ENHANCE`) and teammate training (`RS.MATE_ENHANCE`) — sinks that never run out. The level-up shop sells the
  small box once per screen.
- Survival: armor never takes more than half of a hit (`RS.ARMOR_CAP`); the 클라시코 rival's HP aims at most
  `RS.RIVAL_MAX_SHARE` of his window, so a build that keeps hitting him wins.
- Readability: enemy projectiles are red laser bolts (aim line while telegraphed); damage numbers only on bosses,
  준보스 and elites, summed per `RS.NUM_GAP`.
- 토레쓰 (`RS.TORRES`, `RS.BOSS_TYPES.torres`): when 드록빠 falls the season is cleared and 토레쓰 runs on for 30 s.
  Beating him gives one of `RS.TORRES_REWARDS` (once per career season) and unlocks his career
  (`meta.unlocked.torres`, `RS.HEROES.torres`, `RS.YEARS_TORRES`: 2001 debut at 17 → 리버풀 → 첼씨 → home → 사간
  도스 2019, final duel with 메시). His weapons: 날두's shooting moves and his own 엘 니뇨 칩슛 (`nino`).
  Rewards left unpicked when the game is closed on the result screen (토레쓰's, the season boss's) come back
  before the next match starts (`RS.pendingRewards`), instead of waiting for — or being skipped by — a later clear.
- Balance after the switch (enemies hit no harder per blow than in round 10; one weapon kills slower, so 준보스
  and bosses act more often): the bot (also the auto-move) now side-steps every telegraph — 준보스 charges and slams,
  the rival's and 토레쓰's dashes — and keeps a wider berth from men who hit hard (left out of its "danger", so it
  still closes in on bosses); `RS.TRIAL` is about half (날두's four trial seasons in a row, 2004-07, walled the
  half-trained bot at 2007); the final is a duel — when 메시/날두 comes on the 준보스 and elites walk off, 4 men
  stay and at most 10 are on (`RS.BOSS_CROWD.duelKeep / duelMax`; the crowd used to refill to 30), and
  `RS.FINAL_DMG` 0.11 → 0.065. Checked: strong bot with half the 훈련장 + coin purchases clears 노멀 2002-2010 in 9
  seeds of 9 (메시 and 토레쓰 careers to the end in 3 of 3); 이지 career with no 훈련장 clears with no death;
  하드 with the whole 훈련장 still stalls (2012); a motionless player still dies; over the final builds of four
  이지 careers the strong bot wins 19 finals of 24 (15 below half HP), the weak bot 5.

### Hero readability (round 3)
- The hero sprite alone has a gold double outline (`paint` `opt.glow`), a pulsing gold ring + soft light pool under
  the feet, a bobbing gold chevron above the head and a gold-framed HP bar.
- Enemy kits are pulled 38 % toward a slate tone (`dull`) and enemies within 18 px of the hero draw at 55 % alpha so
  he never vanishes in a pile. Teammates get a thin green outline.

### Balance targets (checked by `tests/balance.test.js`)
- A player who does not move survives the first 45 s of 2002 (5 seeds).
- The repo bot clears 2002–2025 on 이지 without 훈련장 upgrades (and 노멀 2002-2010 with half of them plus coin
  purchases between seasons, `round8`); the
  final with 메시 and the single-season checks run on 노멀; median season-boss fight 28–90 s, ≥75 % of fights within 20–100 s.
- At least 2 of the first 6 season bosses land hits on the bot.
- Over the final builds of four 이지 careers (one weapon makes the build a draw), 메시 takes the strong bot below
  half HP in at least a quarter of the finals while the bot still wins at least half.
- The weak bot (`RS.WEAK_BOT`: 0.12 s reaction delay, ±0.3 rad steering noise, no meta) both loses and wins
  against 메시 over the same builds.

### Round 12: the crowd trickles in and comes in packs, attacks you can see, a burning carpet, no stale builds
- **Crowd** (`RS.CROWD`, `World.updateSpawns`): a thin trickle from every side (`trickle` × the season's spawn rate,
  from `start` of it at kick-off to all of it) plus packs of `packN[0] + packN[1] × season` men (× `packGrow` over the
  minute) every 13 → 8 s from one direction. Running away meets only the trickle (`World.awayAngle`): every man of a
  pack stays more than 60° off a running hero's heading (the pack's centre keeps its half-width more), and a straggler
  left far behind comes back behind or beside him, never ahead — R11 put half of the spawns and every recycled straggler
  ahead of a runner. Alive cap `cap[0] + cap[1] × season` (≤ `cap[2]`); wave events may go `room` past it (was +40).
  The 포위 ring is three quarters of a circle, with a gap to run through.
- Each man is worth `value` (1.6) × the XP, the coin drop chance and the kill coins, so levels and coins keep their R11
  pace with about a third of the men. Strong bot in god mode on 노멀, avg / peak alive and XP per stage before the boss:
  2002 8.5/19 → 4.8/12 (XP 90 → 90), 2005 32.5/58 → 12.6/25 (88 → 94), 2014 36.3/76 → 21.0/45 (135 → 158),
  2025 120/181 → 40.6/75 (338 → 301).
- **Aim on screen** (`World.inSight`): every pick — the hero's moves and items (`nearestEnemies`), teammates, homing,
  bouncing and item shots (`nearestFrom`), 드리볼 (`dribTarget`) and a homing, dribbled or rising 드롭볼 ball keeping its
  target (a 드롭볼 whose man walks off screen lands where he was last seen) —
  takes only men inside the view (+8 px); bosses, the 클라시코 rival and 토레쓰 always. A 390 × 844 phone shows
  147 × 317 game pixels while the moves reached 240: 7 hits of 12 (kick) and 8 of 11 (SIUU) landed out of sight, so
  the pitch looked empty. After: kick 11 of 14 on screen (SIUU's ring still rolls past the edge, where it is seen going).
- Focused shots shorten the measured boss fights: `BOSS_FIGHT_SECONDS` 22 → 25 — on R11's own builds the 2005-10
  bosses then last 21-34 s as on R11 (22-32 s; at 22 they were 2-3 s shorter); the guard careers' median is 24 s.
  `FINAL_DMG` stays 0.065: the finals of the guard careers give the strong bot 10 wins of 12 (5 below half HP) and the
  weak bot 4 of 18, the same at 0.07.
- **Career guards** (tests): a career is a draw, and any change to the random sequence reshuffles it. 이지: the four
  careers the finals use, one may stop (R12 code: 1 of 30 seeded careers stopped, R11: 2 of 30). 노멀 with half the
  훈련장: 20 careers of 30 reach Madrid — of 130 seeded careers R11 stopped 25 and R12 21; R12 stops more in 2004-06
  (9 of 100 against 1) and less at the 2007 wall (4 against 16).
- **불꽃 질주 carpet**: a slide (any dash) lays a patch every 0.8 radius of its path; patches draw in passes (rims,
  fires, flames) so the row reads as one burning strip.
- **Attack visibility** (render): ball trails, orbit and dribble outlines, SIUU rings, swings and lob markers carry the
  weapon's grade colour (`RS.GRADES[g].color`) and are thicker; enemy shots stay red lasers.
- **Squad screen**: pick a player, then one on the other side to swap them (works with a full pitch and bench); a free
  slot shows a move button. Transfer cards say who leaves and who comes (🔻 / 🔺).
- **Builds**: `RS.VERSION` (core.js) = `<meta name="build">` = `?v=` on every file index.html loads = the stamp each
  file carries (`RS_FILES.<name>` on a script's last line, `--build` in the stylesheet); a test keeps them equal. The
  build is shown on the title screen. `App.boot` compares the stamps with the page's build: a page that loaded files of
  two builds (a phone's cache across an update — `?v=` alone cannot stop it, the server answers any `?v=` with the files
  it has now) does not start, fetches the page and every file past the cache and reloads, twice at most, then leaves
  the update button. Back on the tab, `App.checkUpdate` reads the live index.html and offers the same reload when its
  build differs. Why: a phone screenshot 1.5 h after round 11 went live still showed round 10's HUD.
- **Files moved to `src/`** (`src/js`, `src/css`): round 11's main.js has no such check, and a phone's cache keeps or
  drops each file on its own, so a cached round-11 page could run its own main.js with round-12 files fetched at the
  same addresses. `js/` and `css/` therefore keep round 11's files byte for byte, for round-11 pages only: whatever its
  cache dropped, a round-11 page fetches round-11 files. From round 12 on every main.js has the check, so later rounds
  can keep src/. Keep `js/` and `css/` unchanged while cached R11 pages remain supported; never repurpose their URLs.

### Round 13: one ladder 일반 → 전설, the top grades only from luck in a match
Player feedback: coins bought 초히든 items at Lv.1 and an 8-coin reroll could be pressed again and again, so a fresh
career started with the strongest gear ("다 운으로만 나와야지"); and the grades should be one system with 전설 on top,
for passives, weapons and items alike.
- **One ladder** (`RS.GRADES`): 일반 grey · 고급 green · 희귀 blue · 영웅 purple · 전설 gold — the order and colours
  Korean games use. Round 11's 레어 / 에픽 / 황금 / 무지개 and round 9's 레어 / 히든 / 초히든 / 슈퍼히든 are gone.

  | | 일반 | 고급 | 희귀 | 영웅 | 전설 |
  |---|---|---|---|---|---|
  | weapon (table row, damage) | Lv.1 ×1 | Lv.2 ×1.3 | Lv.4 ×1.69 | Lv.6 ×2.2 | evolved ×2.86 |
  | passive card (× the passive's base, `pmul`) | 0.7 | 0.85 | 1 | 1.3 | 1.7 |
  | special item (전투력 `power`) | — | — | 12 | 25 | 60 |
  | teammate card colour (OVR tier) | — | 유망주 | 주전급 | 월드클래스 | 레전드 |

  Weapons: 합체 moves from 영웅 (`RS.FUSED_FROM` 3); 강화 +1 … +10 never changes a grade. Passives: every card — a
  new passive or a level — carries a grade; `build.passiveGrades[id]` keeps one per level and `RS.passivePow` sums
  their `pmul`; the card text comes from the mods (`RS.modsText`, `RS.MOD_TEXT`). Items (`RELICS[].g`): 레어 → 희귀,
  히든 → 영웅, 초히든 → 전설 (약물 꽂기 → 영웅), 슈퍼히든 → 전설. Teammates: OVR tier only (강화 +8 no longer adds a
  grade).
- **Only luck, opened by the season** (pro season `RS.tuneIdx`; the same odds for the weapon card and every passive
  card, `RS.GRADE_STAGES`; the item card per level-up and chest items, `RS.ITEM_STAGES`):

  | from season | weapon / passive card 일반 · 고급 · 희귀 · 영웅 · 전설 | item card chance | item 희귀 · 영웅 · 전설 |
  |---|---|---|---|
  | 0 (debut) | 60 · 30 · 9 · 1 · 0 % | 5 % | 90 · 10 · 0 % |
  | 3 | 40 · 38 · 18 · 4 · 0 % | 5 % | 90 · 10 · 0 % |
  | 5 (the wall, 2007) | 20 · 42 · 26 · 10 · 2 % | 5.5 % | 78 · 20 · 2 % |
  | 10 | 0 · 30 · 42 · 22 · 6 % | 6 % | 66 · 28 · 6 % |
  | 16 | 0 · 0 · 45 · 40 · 15 % | 6.5 % | 56 · 34 · 10 % |

  From season 5 on, 전설 comes as often as round 12's 황금 and 무지개 together; the debut, which dealt both at 1 %,
  deals none, and season 3 bridges the debut and the wall. 행운 부적 / items (`luck`) raise 희귀 and up and the item
  chance but never open a grade early (`RS.luckOdds` keeps a 0 at 0). Luck used to take its extra share from 일반
  alone: from season 10 (no 일반) the odds summed over 1 and the roll never reached the top, so a 20 % 행운 부적 or
  a 네잎클로버 dealt no 전설 at all (round 12 too, for 황금 and 무지개). It now takes from 일반, then 고급, then
  scales the odds back to 1.
- **하드 deals the top grades at ×0.25** (`RS.DIFFS.hard.top`; the rest goes to 희귀). 하드 had been tuned with the
  luck bug above: once it was fixed, 완전 오토 with the whole 훈련장 cleared 하드 on seed 7 (×0.5: seeds 7 and 3, of
  7 · 3 · 5 · 9). At ×0.25 its season-10 hand is 영웅 8 % · 전설 2 % (round 12 dealt it 에픽 7 % and no 황금), and
  it stalls on all six seeds tried (7 · 3 · 5 · 9 · 11 · 13) between 2011 and 2022. The 하드 card says so. 도박 cards win 영웅 at most. 토레쓰's weapon reward is 영웅 (전설 15 %), and he only runs on from 2007 (날두,
  season 5) or 2012 (메시).
- **Coins buy no grade above 희귀**: the level-up coin shop is gone (the 8-coin reroll, the 45 / 160 / 420 grade draws
  and the small box), and so is the wallet a match could spend. Coins buy the 훈련장's 무기 상자 (90: 일반 65 · 고급 30
  · 희귀 5 %, 320: 고급 75 · 희귀 25 %; `RS.WEAPON_BOXES`), 강화, teammate training and the META upgrades. Free
  rerolls (전술 보드, boss rewards) and 행운의 주사위 stay: they deal again from the same season's odds.
- **Old saves** (`RS.normalizeBuild`): weapon grades keep their index (레어 → 희귀 now on Lv.4, 에픽 → 영웅 on Lv.6,
  황금 → 전설 evolved) and 무지개 clamps to 전설 (×3.71 → ×2.86); a passive level without a grade counts as 희귀, the
  old card's full value (`RS.PASSIVE_OLD_G`); items stay, named by their new grade.
- **Auto play closes on a boss by its move** (`World.bossReach`): to the edge of a move with a radius around the hero
  (a SIUU ring too), to 70 px with 불꽃 질주 (the boss then walks on fire that still burns), inside the turning
  distance of 라보나's boomerangs, within 180 px with any other shot. Held at 180 px, round 13's weaker early builds
  fought 2009–11 bosses for two to nine minutes.
- **Measured** (이지 career bot, seeds 7 · 3 · 5 · 9 to the last season; round 12 → round 13): median boss fight
  20–28 → 23–27 s, the longest 31–101 → 33–78 s, and seed 7 now finishes (it fell at 2011). The debut over 24 seeds,
  이지 / 노멀: median boss 22 → 23 / 29 → 24 s, the longest 61 → 61 / 107 → 95 s. The bot only picks dealt cards and
  never bought draws, so these numbers show the honest path stays playable; the coin route players used is gone by
  design.

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
Coins per run: picked coins + kills × `RS.CROWD.value` / 8 + clear bonus (40 + 8 × year index), × coin multiplier.
Kept on death too.

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
boss stun immunity and HP calibration, 강슛) · `round8` (difficulty order, 노멀 cleared with the 훈련장, 메시-only items,
stimpack doses, two-mate pitch and the trio, 드리볼 / 드롭볼 / 신의 손, press conferences and endings, auto pickers,
old saves) · `round9` (하드 not cleared by the bot, difficulty shape, graded-card rates, 클라시코 seasons and the Rome
final, the rival fight and its record, 합체 up to tier 2, old saves).

`npm run build:fx` rebuilds `js/pixelfx.js` after a change under `tools/fx-entry.js` or `vendor/pixelfx` (esbuild, dev only).

`tools/sim.js [from] [to] [seed] [weak]` prints per year: boss fight time, min HP, hits, boss damage, level, DPS.
