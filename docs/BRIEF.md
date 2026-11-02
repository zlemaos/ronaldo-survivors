# 호날두 서바이버즈 — build brief

A pixel-art survivors-like (Vampire Survivors / Survivor.io style) about Ronaldo's career, as a non-commercial
fan parody. All in-game text is Korean. The owner's own words (from a chat):

> 뱀서로 만들자. 동료 모으기하고, 날두 기본공격 축구공 발로 차기, 최종보스 메시. 데뷔때부터 연도별로 진화하는거임.
> 연도별 감독, 동료들이 업글시켜주고.

## Must-haves

1. **Genre core (survivors-like).** The player only moves; attacks fire automatically. Enemies swarm in growing
   waves; killed enemies drop XP (small footballs / trophy shards). Each level-up pauses and offers 3 picks
   (new skill, skill upgrade, passive, or a teammate). Max-level skill + matching passive unlocks an **evolution**
   (e.g. 무회전 프리킥 → 무회전 대포알). Treasure chests from elites. Health, magnet radius, crit, etc.
2. **날두's basic attack: kicking a football** at the nearest enemy (the ball can bounce/pierce as it upgrades).
   Other 날두 skills fit his style: 무회전 프리킥 (piercing knuckleball), 헤딩 점프 (landing shockwave),
   바이시클 킥 (360° arc), 스텝오버 (dash with i-frames), 시저스 킥, **SIUU 함성** (stun shockwave), etc.
3. **동료 모으기 (collect teammates).** Teammates join as AI companions that fight beside 날두, each with a role:
   e.g. 수비수 orbiting shield, 골키퍼 blocking projectiles, 윙어 dashing through lines, 미드필더 passing balls
   that 날두 auto-shoots, 스트라이커 extra shots. Gain them from level-up picks and by reaching rescue markers on
   the field. They level up too.
4. **연도별 진화 — career by year from debut.** The campaign is the career year by year (debut at 17 →
   the present). Each year is one short stage (about 2-4 minutes on a phone) with its own arena, enemy mix and
   a season boss. Between years: **감독 (coach) pick** (team-wide buff cards that differ by coach/era) and
   teammate upgrades/joins; 날두's sprite and kit visibly evolve with age and era (club changes). Progress is
   saved after each year, so the campaign can be played in short sessions; cleared years can be replayed.
5. **Final boss: 메시.** Last year's final stage. Fast dribble dashes through the arena, curling shots, a
   left-foot volley barrage, and a phase-2 rage. Make it hard but fair, with a big win screen.
6. **Meta progression.** Coins/발롱도르 earned in runs buy permanent upgrades between runs (localStorage).
7. **SIUU.** `assets/audio/siuu.mp3` is provided. Play it on evolutions, boss kills, year clears, the 메시 win.
   Use an HTMLAudioElement (works on file://). Mute button; on phones start audio only after a user tap. Other SFX
   can be tiny WebAudio chiptune sounds.
8. **Mobile first.** Portrait phone (360-430 px wide) is the main target: floating virtual joystick (touch and drag
   anywhere), big tap targets, safe areas, no zoom/scroll while playing, pause on tab hide. Desktop: WASD/arrows.
   Smooth 60 fps on a mid-range phone with hundreds of enemies (object pools, spatial grid, canvas batching).
   Web app manifest + icon so it can be added to the home screen.
9. **Runs as static files.** No build step, no external CDN. Works when `index.html` is double-clicked (file://)
   and on GitHub Pages at the repo root.

## Content and tone

- Fun, readable at a glance on a small screen: clear silhouettes, damage numbers, big level-up cards with icons.
- Korean UI and text, short sentences. Explain each skill/teammate/coach card in one plain line.
- Parody safety: no real club logos or badges; use parody club names and parody nicknames for coaches and
  teammates (recognisable but not real names). 날두 and 메시 keep those names. Show "비공식 팬 패러디" on the title.

## Engineering

- Plain JS modules or script tags, canvas rendering, pixel art drawn in code or small PNGs you create.
- Game logic separated from rendering so it can be tested in Node. `npm test` must cover: damage/XP/level-up
  picks, evolution rules, teammate joining/levelling, year progression and saves, the 메시 fight phases, and a
  headless simulated run that clears early years with a simple bot without errors.
- `docs/DESIGN.md`: systems, data tables (skills, passives, evolutions, teammates, coaches, years), how to add content.
- Phone and desktop screenshots in `docs/screenshots/`.
- Do not clear folders with `rm -rf`; overwrite files instead.

## Done when

The owner can open the GitHub Pages URL on a phone, play from the debut year through to beating 메시, collect
teammates, pick coach upgrades each year, watch 날두 evolve, and hear SIUU on the big moments — with no crashes
and all tests green.
