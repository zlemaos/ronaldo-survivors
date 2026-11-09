/* 호날두 서바이버즈 — data tables. Pure data, no DOM. See docs/DESIGN.md for how to add content.
 * Parody safety: real people get a twisted spelling that still reads at a glance (챠비, 니에미스타, 무링요);
 * clubs use parody names. Only 날두 and 메시 keep their names. */
(function (RS) {
  'use strict';

  RS.MAX_PASSIVES = 6;
  RS.MAX_MATES = 2;   // on the pitch with 날두
  RS.MAX_BENCH = 3;   // bench warmers: weak passive synergy only
  RS.BENCH_FACTOR = 0.34;
  RS.MATE_MAX_LV = 10;

  // ---------------------------------------------------------------- Round 14: one ladder B · A · S · SS · SSS · GOAT · SIUUU
  // Every graded thing sits on RS.GRADES (round 13's 일반 · 고급 · 희귀 · 영웅 · 전설 renamed to letter ranks the user
  // reads at a glance — the old top, 전설, is SSS — plus two ranks above it: GOAT, and SIUUU, which only comes at
  // "벼락맞을 확률"): the weapon, each passive card, the special items and the teammates' card colour (RS.MATE_GRADE).
  // The hero fights with ONE weapon at a time (build.weapon = { id, g, p }; the weapons are the moves of RS.SKILLS).
  // Its grade g picks the move's behaviour — level table row lv (Lv.1-6) or, from SSS up, its evolved form (evo) — and
  // multiplies the damage by mul; 강화 p (+1 … PLUS_MAX) adds PLUS_STEP per step on top. One grade is worth more than
  // nine steps (1.3 > 1 + 9 × 0.03), so a +10 always stays below the next grade's +1. pmul: what one passive card of
  // that grade adds (× the passive's base, RS.passiveMods); power: 전투력 of a special item of that grade.
  // Owned weapons wait in the 무기고 (build.armory). Items (RS.RELICS) stop at SSS.
  RS.GRADES = [
    { key: 'common', name: 'B', color: '#b4bcc8', lv: 1, mul: 1, pmul: 0.7 },
    { key: 'uncommon', name: 'A', color: '#46d36e', lv: 2, mul: 1.3, pmul: 0.85 },
    { key: 'rare', name: 'S', color: '#3d8bff', lv: 4, mul: 1.69, pmul: 1, power: 12 },
    { key: 'epic', name: 'SS', color: '#b05cff', lv: 6, mul: 2.2, pmul: 1.3, power: 25 },
    { key: 'legend', name: 'SSS', color: '#ffc83a', lv: 6, evo: true, mul: 2.86, pmul: 1.7, power: 60 },
    { key: 'goat', name: 'GOAT', color: '#ff4fd8', lv: 6, evo: true, mul: 3.7, pmul: 2.2, power: 120 },
    { key: 'siuuu', name: 'SIUUU', color: '#8df9ff', lv: 6, evo: true, mul: 5, pmul: 3, power: 250 }
  ];
  RS.GRADE_TOP = 4; // SSS: the top of the old ladder; items and 토레쓰's reward stop here
  RS.PLUS_MAX = 10;
  RS.PLUS_STEP = 0.03;
  // Grade odds of every graded level-up card — the weapon card and each passive card — by pro season (RS.tuneIdx).
  // Round 13: the top grades come only from luck in a match. The debut deals mostly B and A, an SS once in a
  // hundred and an SSS about once in 5,000 cards (0.019 %, the user's figure); SSS then climbs slowly, to 3.5 % in
  // 2018 (season 16; round 13 first dealt 15 % there: "너무 높아") and 5.5 % at the end, the share it gave up going
  // mostly to SS. Round 14: GOAT is one card in 100,000 until the wall season, then 0.05 % climbing to 0.6 % (taken from SSS's share);
  // SIUUU is one card in a million from the debut on (about one career in a thousand ever sees one — the user's
  // "벼락맞을 확률"), taken from the lowest open grade. Luck (RS.luckOdds) raises S and up but never opens a closed grade.
  RS.GRADE_STAGES = [
    { from: 0, odds: [0.599989, 0.3, 0.08981, 0.01, 0.00019, 0.00001, 0.000001] },
    { from: 3, odds: [0.399989, 0.38, 0.179, 0.04, 0.001, 0.00001, 0.000001] },
    { from: 5, odds: [0.199999, 0.42, 0.266, 0.11, 0.0035, 0.0005, 0.000001] },
    { from: 8, odds: [0.099999, 0.36, 0.36, 0.17, 0.009, 0.001, 0.000001] },
    { from: 10, odds: [0, 0.299999, 0.42, 0.265, 0.013, 0.002, 0.000001] },
    { from: 13, odds: [0, 0.149999, 0.45, 0.375, 0.022, 0.003, 0.000001] },
    { from: 16, odds: [0, 0, 0.499999, 0.465, 0.031, 0.004, 0.000001] },
    { from: 19, odds: [0, 0, 0.449999, 0.505, 0.04, 0.005, 0.000001] },
    { from: 22, odds: [0, 0, 0.399999, 0.545, 0.049, 0.006, 0.000001] }
  ];
  RS.WEAPON_PLUS_W = [62, 24, 10, 4]; // and it comes at +1 … +4
  RS.FUSED_FROM = 3; // 합체 weapons (two moves in one) only come at 영웅 or better
  // 무기 상자 (coins, 훈련장 only): 일반 to 희귀. Coins never buy 영웅 or 전설 (round 13: the user bought 초히든 items at
  // Lv.1 and rerolled at once). g: the colour of the box's row.
  RS.WEAPON_BOXES = [
    { id: 'box1', icon: '🎁', name: '무기 상자', cost: 90, g: 0, odds: [0.65, 0.3, 0.05, 0, 0] },
    { id: 'box2', icon: '💎', name: '고급 무기 상자', cost: 320, g: 1, odds: [0, 0.75, 0.25, 0, 0] }
  ];
  RS.SELL_BACK = 0.3; // a box weapon no better than the one owned turns into this share of the box price
  // 강화 with coins (훈련장): cost[grade] × the current step; odds[p − 1] = the chance to go from +p to +p+1 (a failure
  // only costs the coins). The 강화 card of a level-up always succeeds. 강화 never changes the grade.
  RS.ENHANCE = { cost: [12, 24, 45, 85, 160, 300, 500], odds: [1, 1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4] };
  // Teammates arrive already trained (m.lv = their 강화 +1 … +10): 사비 +1 is common, 사비 +10 is rare.
  RS.MATE_PLUS_W = [30, 22, 15, 11, 8, 6, 4, 2.4, 1.1, 0.5];
  RS.MATE_GRADE = { prospect: 1, starter: 2, world: 3, legend: 4 }; // card colour by OVR tier (강화 never changes it)
  RS.MATE_ENHANCE = 35; // 훈련장: coins × the current 강화 × (1 + the colour grade) to train one teammate +1
  RS.ROLE_PLUS = 0.06; // a teammate's team effect × (1 + this × (강화 − 1))
  RS.ARMOR_CAP = 0.5; // armor never takes away more than this share of a hit
  RS.GUARD_MAX = 0.5; // seconds of cover the 신의 손 palm gives (one slam), whatever the grade
  // When the season boss, the 클라시코 rival or 토레쓰 comes on, the ordinary crowd but the `keep` nearest walks off
  // (one weapon's shots were soaked up by the men in front: a boss took 185 damage in 140 s); while he is on, at
  // most `max` stay and fewer arrive (World.updateSpawns).
  // Round 12: the crowd trickles in from every side at a low, even density and arrives in packs, one side at a time
  // (World.updateSpawns): `trickle` × the season's spawn rate, rising from `start` of it at kick-off to all of it;
  // from `packFirst` s a pack of packN[0] + packN[1] × season men (× packGrow from kick-off to the boss) every
  // packEvery[0] → [1] s, within `packArc` rad of one direction. At most cap[0] + cap[1] × season alive (≤ cap[2]);
  // the season's events may go `room` past it. Nothing spawns ahead of a running hero any more (half of the crowd
  // used to): the user ran from men at one o'clock and found men already waiting at seven. Fewer men, each worth
  // `value` × the XP and coins, so levels and coins keep their pace. Round 13.1: from `nearFirst` s on, at least
  // `near` men are always on the pitch — every `nearEvery` s one more steps in just off the screen edge when fewer
  // are (a youth stage showed its first man after 46 s: "저단계여도 한 두 마리는 계속 덤벼야지"). Round 13.2 ("몹 좀만
  // 더 리젠"): trickle 0.42 → 0.55, start 0.3 → 0.45, near 2 → 3, and value 1.6 → 1.25 so levels keep their pace
  // with the extra men. `surge`: the 1차 · 2차 · 총공세 banners each bring a pack of surge[n − 1] × the season's
  // pack (World.surge; the banners used to come with no men behind them).
  RS.CROWD = { trickle: 0.55, start: 0.45, packFirst: 8, packEvery: [13, 8], packN: [4, 0.35], packGrow: [0.6, 1.4], packArc: 0.9, cap: [12, 2.2, 60], room: 16, value: 1.25, near: 3, nearFirst: 1.5, nearEvery: 0.5, surge: [1.5, 2.2, 3] };
  // The final duel keeps `duelKeep` of them and at most `duelMax` on (메시's / 날두's own summons included): during
  // the duel the crowd used to refill to 30 and decided the final for the close-range weapons.
  RS.BOSS_CROWD = { keep: 10, max: 30, rivalKeep: 16, rivalRate: 0.5, duelKeep: 4, duelMax: 10 };
  // Each weapon must carry a match alone: × its damage numbers (World.weaponStats), from a bench of every move at
  // round 11's 에픽 +5 (the Lv.4 row) against a season-7 crowd (kills before the boss, normalised to the median move). 1 when unlisted.
  RS.WEAPON_SOLO = {
    trail: 0.8, rabona: 0.9, kick: 0.95, siuu: 1.8, scissors: 1.8, bicycle: 1.9, stepover: 2,
    dropball: 0.85, orbit: 0.9, tiki: 0.9, chip: 0.9, curler: 1.6, elastico: 2.6, bobo: 2, solo: 2, zeto: 1.1, hollywood: 2
  };
  // × the cooldown of the moves built as a side skill (a dash every 4 s, a shout every 7 s): alone they must fire
  // often enough to hold the crowd off
  RS.WEAPON_CD = { stepover: 0.5, solo: 0.5, siuu: 0.7, hollywood: 0.5 };
  RS.NUM_GAP = 0.25; // seconds between two damage numbers on one boss / 준보스 / elite (the hits between are summed)
  RS.GIFT_GRADE = 2; // a move taught by a story event or a press answer comes as a 희귀 +1 weapon
  // Teammate grade from the player's OVR (a FIFA-style overall), shown on every teammate card. A higher OVR hits
  // harder and lends a stronger team buff (RS.mateMul), so a swap can be judged at a glance.
  RS.MATE_TIERS = [
    { min: 90, key: 'legend', name: '레전드' },
    { min: 85, key: 'world', name: '월드클래스' },
    { min: 78, key: 'starter', name: '주전급' },
    { min: 0, key: 'prospect', name: '유망주' }
  ];
  RS.MATE_OVR_STEP = 0.02; // power × (1 + (OVR − pivot) × step): pro seasons OVR 60 = 0.6×, 80 = 1×, 92 = 1.24×
  // Youth seasons are a kids' league: the kids are measured against kids (pivot 60), so the 메시 youth keeps its
  // pace while a kid kept into the pro seasons is clearly weaker than a pro.
  RS.MATE_OVR_PIVOT = { pro: 80, youth: 60 };
  // What each role gives the team while on the pitch (bench: ×BENCH_FACTOR). Shown on every teammate card.
  RS.ROLE_BUFF = {
    defender: { mods: { armor: 1 }, text: '받는 피해 -1' },
    keeper: { mods: { hp: 15 }, text: '최대 체력 +15' },
    winger: { mods: { moveSpeed: 0.06 }, text: '이동속도 +6%' },
    mid: { mods: { cd: -0.05 }, text: '쿨타임 -5%' },
    striker: { mods: { dmg: 0.08 }, text: '공격력 +8%' }
  };
  // Two players on the pitch make a named partnership (key = roles sorted and joined with '+').
  RS.PAIR_SYNERGY = {
    'mid+striker': { name: '원투 패스', desc: '동료 공격력 +25%', mods: { teamDmg: 0.25 } },
    'defender+keeper': { name: '철벽 수비', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
    'striker+winger': { name: '역습 축구', desc: '치명타 +8%', mods: { crit: 0.08 } },
    'mid+winger': { name: '측면 크로스', desc: '동료 쿨타임 -20%', mods: { teamCd: -0.2 } },
    'defender+striker': { name: '롱볼 축구', desc: '공격력 +6%, 투사체 속도 +10%', mods: { dmg: 0.06, projSpeed: 0.1 } },
    'keeper+mid': { name: '빌드업', desc: '초당 체력 +0.3', mods: { regen: 0.3 } },
    'defender+winger': { name: '오버래핑', desc: '이동속도 +5%, 범위 +6%', mods: { moveSpeed: 0.05, area: 0.06 } },
    'keeper+striker': { name: '골킥 카운터', desc: '보스에게 주는 피해 +12%', mods: { bossDmg: 0.12 } },
    'defender+mid': { name: '중원 장악', desc: '경험치 +10%', mods: { xp: 0.1 } },
    'keeper+winger': { name: '빠른 전환', desc: '쿨타임 -4%, 이동속도 +4%', mods: { cd: -0.04, moveSpeed: 0.04 } },
    'striker+striker': { name: '투톱', desc: '동료 공격력 +30%', mods: { teamDmg: 0.3 } },
    'defender+defender': { name: '더블 센터백', desc: '받는 피해 -2', mods: { armor: 2 } },
    'mid+mid': { name: '더블 볼란치', desc: '쿨타임 -8%', mods: { cd: -0.08 } },
    'winger+winger': { name: '양 날개', desc: '이동속도 +10%', mods: { moveSpeed: 0.1 } },
    'keeper+keeper': { name: '골키퍼 둘', desc: '최대 체력 +30', mods: { hp: 30 } }
  };
  // Two particular players on the pitch beat the role partnership (key = their ids sorted and joined with '+').
  // 챠비 + 니에미스타 beside 메시: the 티키타카 trio.
  RS.NAMED_PAIRS = {
    'iniestar+xavino': { name: '티키타카 트리오', desc: '메시 공격력 +30%, 쿨타임 -10%, 동료 공격력 +20%', mods: { dmg: 0.3, cd: -0.1, teamDmg: 0.2 } }
  };
  // A 메시 pass played by that move's own passer (챠비 / 니에미스타 in the starting two) hits this much harder.
  RS.PASSER_BONUS = 1.25;

  // ---------------------------------------------------------------- Skills (active, auto-firing)
  // Each skill: lv[] holds stats for level 1..max; evo holds evolved stats. passive = paired passive for evolution.
  RS.SKILLS = {
    kick: {
      name: '축구공 킥', icon: '⚽', passive: 'boots', hero: ['ronaldo', 'torres'], evoName: '황금 발롱볼', evoIcon: '🏆', trophy: true,
      desc: '가장 가까운 적에게 축구공을 찬다.',
      evoDesc: '황금 공이 적 사이를 튕기며 관통한다. 받은 발롱도르 수만큼은 발롱도르 공이 날아간다.',
      ups: ['', '공이 1번 튕긴다', '공 +1', '관통 +1, 피해 증가', '피해 증가, 튕김 +1', '피해·관통 크게 증가, 연사 증가'],
      lv: [
        { dmg: 10, cd: 0.95, count: 1, pierce: 0, bounce: 0, speed: 230, r: 3 },
        { dmg: 12, cd: 0.9, count: 1, pierce: 0, bounce: 1, speed: 235, r: 3 },
        { dmg: 12, cd: 0.9, count: 2, pierce: 0, bounce: 1, speed: 240, r: 3 },
        { dmg: 15, cd: 0.85, count: 2, pierce: 1, bounce: 1, speed: 245, r: 3 },
        { dmg: 18, cd: 0.8, count: 2, pierce: 1, bounce: 2, speed: 250, r: 3 },
        { dmg: 24, cd: 0.72, count: 2, pierce: 2, bounce: 2, speed: 260, r: 4 }
      ],
      evo: { dmg: 40, cd: 0.6, count: 3, pierce: 3, bounce: 4, speed: 280, r: 5 }
    },
    knuckle: {
      name: '무회전 프리킥', icon: '🎯', passive: 'freekick', hero: ['ronaldo', 'torres'], evoName: '무회전 대포알', evoIcon: '💥',
      desc: '흔들리며 날아가 적을 꿰뚫는 무회전 슛.',
      evoDesc: '거대한 대포알이 모든 적을 꿰뚫는다.',
      ups: ['', '피해 증가', '관통 +1', '슛 +1', '관통 +1, 피해 증가', '피해 크게 증가'],
      lv: [
        { dmg: 22, cd: 2.2, count: 1, pierce: 3, speed: 320, r: 4 },
        { dmg: 27, cd: 2.0, count: 1, pierce: 3, speed: 325, r: 4 },
        { dmg: 30, cd: 1.9, count: 1, pierce: 4, speed: 330, r: 4 },
        { dmg: 33, cd: 1.8, count: 2, pierce: 4, speed: 335, r: 4 },
        { dmg: 38, cd: 1.65, count: 2, pierce: 5, speed: 340, r: 4 },
        { dmg: 46, cd: 1.5, count: 2, pierce: 6, speed: 350, r: 4 }
      ],
      evo: { dmg: 110, cd: 1.25, count: 2, pierce: 999, speed: 360, r: 8 }
    },
    header: {
      name: '헤딩 점프', icon: '🦘', passive: 'jump', hero: ['ronaldo', 'torres'], evoName: '2.56m 슈퍼 헤더', evoIcon: '🚀',
      desc: '뛰어올라 착지할 때 주변에 충격파.',
      evoDesc: '하늘 높이 솟구쳐 두 번의 거대 충격파.',
      ups: ['', '범위 증가', '피해 증가', '쿨타임 감소', '범위·피해 증가', '피해 크게 증가'],
      lv: [
        { dmg: 18, cd: 3.0, radius: 40 },
        { dmg: 20, cd: 2.9, radius: 46 },
        { dmg: 26, cd: 2.8, radius: 48 },
        { dmg: 28, cd: 2.4, radius: 50 },
        { dmg: 34, cd: 2.3, radius: 56 },
        { dmg: 42, cd: 2.1, radius: 60 }
      ],
      evo: { dmg: 75, cd: 1.7, radius: 85, double: true }
    },
    bicycle: {
      name: '바이시클 킥', icon: '🌀', passive: 'flex', hero: ['ronaldo', 'torres'], evoName: '오버헤드 토네이도', evoIcon: '🌪️',
      desc: '몸을 날려 360도 주변을 걷어찬다.',
      evoDesc: '멈추지 않는 회오리 킥이 주변을 계속 깎는다.',
      ups: ['', '피해 증가', '범위 증가', '쿨타임 감소', '피해·범위 증가', '피해 크게 증가'],
      lv: [
        { dmg: 14, cd: 2.6, radius: 34 },
        { dmg: 18, cd: 2.5, radius: 35 },
        { dmg: 19, cd: 2.4, radius: 40 },
        { dmg: 21, cd: 2.0, radius: 41 },
        { dmg: 26, cd: 1.9, radius: 45 },
        { dmg: 32, cd: 1.7, radius: 48 }
      ],
      evo: { dmg: 22, cd: 0.3, radius: 58, aura: true }
    },
    stepover: {
      name: '스텝오버', icon: '💨', passive: 'speed', hero: ['ronaldo', 'torres'], evoName: '환상 스텝오버', evoIcon: '👻',
      desc: '적이 붙으면 자동 대시. 대시 중 무적, 지나간 적에게 피해.',
      evoDesc: '더 자주, 더 멀리. 출발점에 잔상이 폭발한다.',
      ups: ['', '대시 거리 증가', '피해 증가', '쿨타임 감소', '피해·거리 증가', '쿨타임 크게 감소'],
      lv: [
        { dmg: 15, cd: 4.0, dist: 50 },
        { dmg: 16, cd: 3.8, dist: 58 },
        { dmg: 22, cd: 3.6, dist: 60 },
        { dmg: 24, cd: 3.1, dist: 62 },
        { dmg: 30, cd: 3.0, dist: 70 },
        { dmg: 34, cd: 2.4, dist: 74 }
      ],
      evo: { dmg: 60, cd: 1.5, dist: 90, burst: 44 }
    },
    scissors: {
      name: '시저스 킥', icon: '✂️', passive: 'finisher', hero: ['ronaldo', 'torres'], evoName: '더블 시저스', evoIcon: '⚔️',
      desc: '공을 X자로 교차해 찬다.',
      evoDesc: '6방향 교차 슛이 깊게 관통하고, 치명타 확률 증가.',
      ups: ['', '피해 증가', '방향 +2', '관통 +1', '피해 증가, 쿨타임 감소', '방향 +2'],
      lv: [
        { dmg: 12, cd: 1.6, dirs: 2, pierce: 1, speed: 210, r: 3 },
        { dmg: 15, cd: 1.5, dirs: 2, pierce: 1, speed: 215, r: 3 },
        { dmg: 15, cd: 1.5, dirs: 4, pierce: 1, speed: 220, r: 3 },
        { dmg: 17, cd: 1.4, dirs: 4, pierce: 2, speed: 225, r: 3 },
        { dmg: 21, cd: 1.25, dirs: 4, pierce: 2, speed: 230, r: 3 },
        { dmg: 23, cd: 1.2, dirs: 6, pierce: 2, speed: 235, r: 3 }
      ],
      evo: { dmg: 48, cd: 0.9, dirs: 6, pierce: 5, speed: 250, r: 4, critBonus: 0.2 }
    },
    siuu: {
      name: 'SIUU 함성', icon: '📣', passive: 'charisma', hero: 'ronaldo', evoName: '월드 SIUU', evoIcon: '🌍',
      desc: '함성 충격파로 주변 적을 기절시킨다.',
      evoDesc: '경기장을 뒤흔드는 함성. 넉백하고 체력을 회복한다.',
      ups: ['', '범위 증가', '기절 시간 증가', '피해 증가', '쿨타임 감소', '범위·기절 크게 증가'],
      lv: [
        { dmg: 8, cd: 7.0, radius: 60, stun: 0.8 },
        { dmg: 9, cd: 6.8, radius: 70, stun: 0.9 },
        { dmg: 10, cd: 6.5, radius: 72, stun: 1.2 },
        { dmg: 15, cd: 6.2, radius: 76, stun: 1.25 },
        { dmg: 16, cd: 5.2, radius: 80, stun: 1.3 },
        { dmg: 20, cd: 5.0, radius: 96, stun: 1.6 }
      ],
      evo: { dmg: 50, cd: 4.0, radius: 150, stun: 2.4, knock: 220, heal: 4 }
    },
    // 메시 only: balls circle him instead of projectiles — a plain white ball, golden from Lv.goldLv. needBallon: the
    // evolution turns them into the 발롱도르 he has really won in this career (RS.ballonCount, at most BALLON_MAX), so
    // it opens after his first one and grows with every one he wins: N trophy balls (count) or one ball N× the size
    // (size); below four trophies golden balls fill the ring up to the Lv.6 four (World.updateOrbit).
    orbit: {
      name: '회전 공', icon: '⚽', passive: 'ballon', hero: 'messi', evoName: '8발롱도르', evoIcon: '🌕', goldLv: 3, needBallon: true,
      desc: '공이 메시 주위를 빙글빙글 돌며 닿는 적을 때린다. Lv3부터 황금 공, 진화하면 그동안 받은 발롱도르가 돈다.',
      evoDesc: '받은 발롱도르 수만큼(최대 8개) 발롱도르 공이 돈다. 첫 발롱도르를 받아야 진화한다.',
      ups: ['', '공 +1 (2개)', '황금 공으로 변신, 공이 커진다', '공 +1 (3개)', '공 +1 (4개), 피해 증가', '공이 더 커진다, 피해 증가'],
      lv: [
        { dmg: 9, cd: 0.4, count: 1, size: 1, speed: 3.4, radius: 34 },
        { dmg: 10, cd: 0.4, count: 2, size: 1, speed: 3.4, radius: 34 },
        { dmg: 12, cd: 0.4, count: 2, size: 1.5, speed: 3.5, radius: 36 },
        { dmg: 13, cd: 0.38, count: 3, size: 1.5, speed: 3.6, radius: 36 },
        { dmg: 16, cd: 0.36, count: 4, size: 1.5, speed: 3.8, radius: 38 },
        { dmg: 20, cd: 0.34, count: 4, size: 2, speed: 4.0, radius: 40 }
      ],
      evo: { dmg: 30, cd: 0.3, count: 8, size: 1.6, speed: 4.4, radius: 44 },
      evos: {
        count: { name: '8발롱도르공', icon: '🟡', desc: '받은 발롱도르가 쉴 새 없이 돈다. 받을 때마다 1개씩 늘어 최대 8개.', stats: { dmg: 30, cd: 0.3, count: 8, size: 1.6, speed: 4.4, radius: 44 } },
        size: { name: '8발롱도르', icon: '🌕', desc: '받은 발롱도르가 하나로 합쳐져 그 수만큼 커진다. 최대 8배.', stats: { dmg: 46, cd: 0.32, count: 1, size: 8, speed: 2.6, radius: 46, knock: 90 } }
      }
    },
    // 날두: a curling boomerang ball, out and back, piercing both ways (catching it = 볼 트래핑).
    rabona: {
      name: '라보나 킥', icon: '🪃', passive: 'trap', hero: ['ronaldo', 'torres'], evoName: '라보나 부메랑 폭풍', evoIcon: '🌪️',
      desc: '휘어 나갔다 되돌아오는 공. 오갈 때 모두 꿰뚫는다.',
      evoDesc: '커다란 부메랑 공 4개가 사방을 휘젓고 돌아온다.',
      ups: ['', '피해 증가', '공 +1', '사거리 증가', '공 +1, 피해 증가', '피해 크게 증가, 공이 커진다'],
      lv: [
        { dmg: 12, cd: 2.3, count: 1, range: 95, speed: 210, r: 4 },
        { dmg: 15, cd: 2.2, count: 1, range: 100, speed: 215, r: 4 },
        { dmg: 15, cd: 2.2, count: 2, range: 104, speed: 220, r: 4 },
        { dmg: 18, cd: 2.0, count: 2, range: 120, speed: 230, r: 4 },
        { dmg: 22, cd: 1.9, count: 3, range: 124, speed: 235, r: 4 },
        { dmg: 28, cd: 1.75, count: 3, range: 130, speed: 240, r: 5 }
      ],
      evo: { dmg: 46, cd: 1.35, count: 4, range: 150, speed: 260, r: 7 }
    },
    // 날두: running leaves burning turf; enemies standing in it burn (rewards moving, like the game).
    trail: {
      name: '불꽃 질주', icon: '🔥', passive: 'fitness', hero: ['ronaldo', 'torres'], evoName: '지옥의 레드카펫', evoIcon: '☄️',
      desc: '달린 자리에 불타는 잔디를 남긴다. 밟은 적이 탄다.',
      evoDesc: '넓고 오래 타는 불길. 멈춰 서도 발밑이 불탄다.',
      ups: ['', '피해 증가', '불길이 넓어진다', '더 오래 탄다', '피해·범위 증가', '피해 크게 증가'],
      lv: [
        { dmg: 4, cd: 0.24, radius: 10, life: 1.6, tick: 0.4 },
        { dmg: 6, cd: 0.24, radius: 10, life: 1.6, tick: 0.4 },
        { dmg: 6, cd: 0.22, radius: 13, life: 1.7, tick: 0.4 },
        { dmg: 7, cd: 0.22, radius: 13, life: 2.2, tick: 0.38 },
        { dmg: 9, cd: 0.2, radius: 15, life: 2.3, tick: 0.36 },
        { dmg: 12, cd: 0.2, radius: 16, life: 2.4, tick: 0.34 }
      ],
      evo: { dmg: 18, cd: 0.15, radius: 20, life: 2.8, tick: 0.3, still: true }
    },
    // 토레쓰 (round 11): his trademark finish — he lifts the ball over the toughest man near him (the boss first) and
    // it lands with a small blast (the 'chip' behaviour played by himself, no passer). Also 날두's 슈팅 moves are his.
    nino: {
      name: '엘 니뇨 칩슛', icon: '🪶', passive: 'finisher', hero: 'torres', use: 'chip', evoName: '빈의 결승골', evoIcon: '🏆',
      desc: '가장 센 적(보스 우선) 머리 위로 공을 띄워 떨어뜨린다. 떨어진 자리가 터진다.',
      evoDesc: '황금 칩슛 세 개가 한꺼번에 떨어져 크게 터진다.',
      ups: ['', '피해 증가', '범위 증가', '칩슛 +1', '피해·범위 증가', '쿨타임 감소, 피해 증가'],
      lv: [
        { dmg: 16, cd: 1.6, count: 1, radius: 20 },
        { dmg: 19, cd: 1.55, count: 1, radius: 21 },
        { dmg: 20, cd: 1.5, count: 1, radius: 25 },
        { dmg: 22, cd: 1.45, count: 2, radius: 25 },
        { dmg: 27, cd: 1.4, count: 2, radius: 28 },
        { dmg: 33, cd: 1.25, count: 2, radius: 30 }
      ],
      evo: { dmg: 54, cd: 1.1, count: 3, radius: 38 }
    },
    // 제토라인 (round 14): 제라두's long ball from deep, run onto and finished by 토레쓰 — homing cannon balls played
    // from the passer (World.passOrigin, the 'missile' behaviour) that burst on the first man they hit. Not dealt
    // until 제라두 has joined the squad once in this career (need: build.flags.zeto, RS.weaponIds); after that it
    // comes like any other move, at every grade, whether or not he is still beside him (his pass then comes from
    // off the screen).
    zeto: {
      name: '제토라인', icon: '🔗', passive: 'finisher', hero: 'torres', use: 'missile', passer: 'gerrardo', need: 'zeto', evoName: '제토라인 전설의 호흡', evoIcon: '⚡',
      desc: '제라두의 롱패스가 가장 센 적을 쫓아가고, 토레쓰가 받아 터뜨린다. 제라두가 선발이면 피해 +25%.',
      evoDesc: '황금 롱패스 4개가 적을 꿰뚫으며 연달아 터진다. 안필드의 호흡이 완성됐다.',
      ups: ['', '폭발 범위 증가', '롱패스 +1', '피해 증가, 관통 +1', '폭발 피해 증가', '피해 크게 증가, 쿨타임 감소'],
      lv: [
        { dmg: 24, cd: 1.5, count: 1, pierce: 1, speed: 320, r: 5, boom: 26, boomDmg: 16 },
        { dmg: 27, cd: 1.45, count: 1, pierce: 1, speed: 325, r: 5, boom: 32, boomDmg: 18 },
        { dmg: 30, cd: 1.4, count: 2, pierce: 1, speed: 330, r: 5, boom: 32, boomDmg: 20 },
        { dmg: 35, cd: 1.3, count: 2, pierce: 2, speed: 335, r: 5, boom: 36, boomDmg: 23 },
        { dmg: 40, cd: 1.2, count: 2, pierce: 2, speed: 340, r: 5, boom: 38, boomDmg: 30 },
        { dmg: 50, cd: 1.05, count: 3, pierce: 3, speed: 350, r: 6, boom: 42, boomDmg: 36 }
      ],
      evo: { dmg: 72, cd: 0.92, count: 4, pierce: 5, speed: 370, r: 7, boom: 52, boomDmg: 52, gold: true }
    },
    // ---- 메시 only: his own moves. `use` names the runtime behaviour a move shares with a 날두 move (own name,
    // numbers and evolution); proj = [normal, evolved] ball look. A hero never sees the other hero's moves.
    // 메시 never shoots or throws a ball himself: a teammate on the pitch plays the pass for him — `passer` (챠비 /
    // 니에미스타) hits RS.PASSER_BONUS harder when he is one of the starting two; with nobody on the pitch the ball
    // comes long from off the screen (World.passOrigin). No extra runners: the pitch holds two teammates at most.
    tiki: {
      name: '티키타카', icon: '🔁', passive: 'leftfoot', hero: 'messi', use: 'kick', passer: 'xavino', proj: ['tiki', 'golden'], evoName: '티키타카 오케스트라', evoIcon: '🎼',
      desc: '동료가 찔러 준 짧은 패스가 적과 적 사이를 튕기며 이어진다. 챠비가 선발이면 피해 +25%.',
      evoDesc: '황금 패스가 멈추지 않고 적 사이를 누빈다.',
      ups: ['', '패스가 1번 더 이어진다', '패스 +1', '이어지는 횟수 +1, 피해 증가', '피해 증가, 관통 +1', '피해 크게 증가, 2번 더 이어진다'],
      lv: [
        { dmg: 8, cd: 1.0, count: 1, pierce: 0, bounce: 1, speed: 230, r: 3 },
        { dmg: 9, cd: 0.95, count: 1, pierce: 0, bounce: 2, speed: 235, r: 3 },
        { dmg: 9, cd: 0.95, count: 2, pierce: 0, bounce: 2, speed: 240, r: 3 },
        { dmg: 11, cd: 0.9, count: 2, pierce: 0, bounce: 3, speed: 245, r: 3 },
        { dmg: 14, cd: 0.85, count: 2, pierce: 1, bounce: 3, speed: 250, r: 3 },
        { dmg: 18, cd: 0.78, count: 2, pierce: 1, bounce: 5, speed: 260, r: 4 }
      ],
      evo: { dmg: 30, cd: 0.62, count: 3, pierce: 2, bounce: 7, speed: 280, r: 5 }
    },
    curler: {
      name: '감아차기 패스', icon: '🌙', passive: 'curve', hero: 'messi', passer: 'iniestar', evoName: '탑코너 감아차기', evoIcon: '🎯',
      desc: '동료가 크게 감아 찬 공이 휘어 들어가 적을 노린다. 니에미스타가 선발이면 피해 +25%.',
      evoDesc: '세 갈래 감아차기가 적을 꿰뚫고, 치명타가 잘 터진다.',
      ups: ['', '피해 증가', '공 +1', '관통 +1', '피해 증가, 쿨타임 감소', '공 +1'],
      lv: [
        { dmg: 13, cd: 1.5, count: 1, pierce: 0, speed: 200, r: 3, home: 4.5 },
        { dmg: 16, cd: 1.45, count: 1, pierce: 0, speed: 205, r: 3, home: 4.5 },
        { dmg: 16, cd: 1.45, count: 2, pierce: 0, speed: 210, r: 3, home: 5 },
        { dmg: 18, cd: 1.4, count: 2, pierce: 1, speed: 215, r: 3, home: 5 },
        { dmg: 22, cd: 1.25, count: 2, pierce: 1, speed: 220, r: 3, home: 5.5 },
        { dmg: 24, cd: 1.2, count: 3, pierce: 1, speed: 225, r: 3, home: 5.5 }
      ],
      evo: { dmg: 46, cd: 0.9, count: 3, pierce: 3, speed: 245, r: 4, home: 6.5, critBonus: 0.2 }
    },
    solo: {
      name: '원더골 드리블', icon: '⚡', passive: 'lowcenter', hero: 'messi', use: 'stepover', evoName: '여섯 명 제치기', evoIcon: '🌟',
      desc: '적이 붙으면 낮은 자세로 제치고 나간다. 돌파 중 무적, 지나간 적에게 피해.',
      evoDesc: '더 자주, 더 멀리 돌파한다. 제친 자리에 잔상이 폭발한다.',
      ups: ['', '돌파 거리 증가', '피해 증가', '쿨타임 감소', '피해·거리 증가', '쿨타임 크게 감소'],
      lv: [
        { dmg: 14, cd: 3.6, dist: 52 },
        { dmg: 15, cd: 3.4, dist: 60 },
        { dmg: 20, cd: 3.2, dist: 62 },
        { dmg: 22, cd: 2.8, dist: 64 },
        { dmg: 28, cd: 2.7, dist: 72 },
        { dmg: 32, cd: 2.2, dist: 76 }
      ],
      evo: { dmg: 56, cd: 1.3, dist: 92, burst: 44 }
    },
    bobo: {
      name: '뭘 봐, 바보야?', icon: '😠', passive: 'grit', hero: 'messi', use: 'siuu', evoName: '저리 가!', evoIcon: '👉',
      desc: '노려보며 한마디. 주변 적이 얼어붙는다(기절).',
      evoDesc: '경기장이 얼어붙는 한마디. 적을 밀어내고 체력을 회복한다.',
      ups: ['', '범위 증가', '기절 시간 증가', '피해 증가', '쿨타임 감소', '범위·기절 크게 증가'],
      lv: [
        { dmg: 8, cd: 7.0, radius: 60, stun: 0.8 },
        { dmg: 9, cd: 6.8, radius: 70, stun: 0.9 },
        { dmg: 10, cd: 6.5, radius: 72, stun: 1.2 },
        { dmg: 15, cd: 6.2, radius: 76, stun: 1.25 },
        { dmg: 16, cd: 5.2, radius: 80, stun: 1.3 },
        { dmg: 20, cd: 5.0, radius: 96, stun: 1.6 }
      ],
      evo: { dmg: 50, cd: 4.0, radius: 150, stun: 2.4, knock: 220, heal: 4 }
    },
    killpass: {
      name: '킬 패스', icon: '🗡️', passive: 'vision', hero: 'messi', use: 'knuckle', passer: 'iniestar', proj: ['knuckle', 'shot'], straight: true, evoName: '라인 브레이커', evoIcon: '📏',
      desc: '동료가 수비 라인을 꿰뚫는 스루패스를 곧게 찔러 준다. 니에미스타가 선발이면 피해 +25%.',
      evoDesc: '거대한 스루패스가 모든 수비를 꿰뚫는다.',
      ups: ['', '피해 증가', '관통 +1', '패스 +1', '관통 +1, 피해 증가', '피해 크게 증가'],
      lv: [
        { dmg: 22, cd: 2.2, count: 1, pierce: 3, speed: 320, r: 4 },
        { dmg: 27, cd: 2.0, count: 1, pierce: 3, speed: 325, r: 4 },
        { dmg: 30, cd: 1.9, count: 1, pierce: 4, speed: 330, r: 4 },
        { dmg: 33, cd: 1.8, count: 2, pierce: 4, speed: 335, r: 4 },
        { dmg: 38, cd: 1.65, count: 2, pierce: 5, speed: 340, r: 4 },
        { dmg: 46, cd: 1.5, count: 2, pierce: 6, speed: 350, r: 4 }
      ],
      evo: { dmg: 110, cd: 1.25, count: 2, pierce: 999, speed: 360, r: 8 }
    },
    chip: {
      name: '로빙 패스', icon: '🪶', passive: 'calm', hero: 'messi', passer: 'xavino', evoName: '로빙 폭격', evoIcon: '☄️',
      desc: '동료가 수비 머리 위로 띄운 공이 가장 센 적(보스 우선) 위에 떨어진다. 챠비가 선발이면 피해 +25%.',
      evoDesc: '황금 로빙 패스 세 개가 한꺼번에 떨어져 크게 터진다.',
      ups: ['', '피해 증가', '범위 증가', '로빙 패스 +1', '피해·범위 증가', '쿨타임 감소, 피해 증가'],
      lv: [
        { dmg: 20, cd: 2.6, count: 1, radius: 24 },
        { dmg: 25, cd: 2.5, count: 1, radius: 25 },
        { dmg: 26, cd: 2.4, count: 1, radius: 30 },
        { dmg: 28, cd: 2.3, count: 2, radius: 30 },
        { dmg: 34, cd: 2.2, count: 2, radius: 34 },
        { dmg: 42, cd: 1.9, count: 2, radius: 36 }
      ],
      evo: { dmg: 70, cd: 1.6, count: 3, radius: 46 }
    },
    // gift: never dealt at a level-up; 호나우딩요's tutoring (RS.EVENTS.dingyo) teaches it.
    elastico: {
      name: '엘라스티코', icon: '🪄', passive: 'samba', hero: 'messi', use: 'bicycle', gift: true, evoName: '호나우딩요의 마법', evoIcon: '✨',
      desc: '호나우딩요에게 배운 고무줄 페인트. 주변 적을 휘감아 걷어내고 잠깐 얼린다.',
      evoDesc: '마법 같은 페인트가 쉬지 않고 주변을 휘감는다.',
      ups: ['', '피해 증가', '범위 증가', '쿨타임 감소', '피해·범위 증가', '피해 크게 증가'],
      lv: [
        { dmg: 14, cd: 2.6, radius: 34, stun: 0.3 },
        { dmg: 18, cd: 2.5, radius: 35, stun: 0.3 },
        { dmg: 19, cd: 2.4, radius: 40, stun: 0.35 },
        { dmg: 21, cd: 2.0, radius: 41, stun: 0.35 },
        { dmg: 26, cd: 1.9, radius: 45, stun: 0.4 },
        { dmg: 32, cd: 1.7, radius: 48, stun: 0.45 }
      ],
      evo: { dmg: 22, cd: 0.3, radius: 58, aura: true }
    },
    // 신의 손: a giant hand comes down on the thickest crowd (the boss first), stuns it and swats away the cards
    // in its reach. The 2007 "신의 손" press conference can also teach it.
    hand: {
      name: '신의 손', icon: '✋', passive: 'trickster', hero: 'messi', evoName: '세기의 골', evoIcon: '🖐️',
      desc: '하늘에서 거대한 손이 내려와 적이 가장 많은 곳(보스 우선)을 내리친다. 맞은 적은 기절. 심판은 못 봤다!',
      evoDesc: '신의 손이 세 번 연달아 내리치고, 그동안 메시는 무적.',
      ups: ['', '피해 증가', '손이 커진다, 기절 증가', '쿨타임 감소', '피해·범위 증가', '손이 두 번 내리친다'],
      lv: [
        { dmg: 34, cd: 6.5, radius: 30, stun: 0.6, count: 1 },
        { dmg: 42, cd: 6.3, radius: 31, stun: 0.6, count: 1 },
        { dmg: 44, cd: 6.0, radius: 37, stun: 0.7, count: 1 },
        { dmg: 50, cd: 5.3, radius: 38, stun: 0.7, count: 1 },
        { dmg: 62, cd: 5.1, radius: 43, stun: 0.8, count: 1 },
        { dmg: 78, cd: 4.6, radius: 45, stun: 1.0, count: 2 }
      ],
      evo: { dmg: 110, cd: 4.0, radius: 50, stun: 1.2, count: 3, guard: 0.7 }
    },
    // ---- round 15: the 승부차기 토너먼트 rewards (RS.CUP_REWARDS). gift: never in the normal level-up deal; a cup win
    // unlocks one at random and from then on it can turn up, rarely, on its hero's level-ups at SIUUU (round 19:
    // RS.cupOffer). Each plays an existing behaviour (use) under its own name, numbers and shout, with its own
    // SIUUU effects (World.penaldoShot, the referee of 심판매수, World.hollywoodLand).
    penaldo: {
      name: '패널두', icon: '🥅', passive: 'freekick', hero: 'ronaldo', use: 'knuckle', straight: true, gift: true, evoName: '패널두 11m 대포', evoIcon: '🥅', proj: ['pcannon', 'pcannon'],
      desc: '넘어지면 PK, PK면 골. 페널티 마크에서 찬 대포알이 일직선으로 적을 꿰뚫는다.',
      evoDesc: '11m 대포알이 일직선으로 모든 적을 꿰뚫는다. 승부차기 토너먼트 우승 보상.',
      ups: ['', '피해 증가', '관통 +1', '슛 +1', '관통 +1, 피해 증가', '피해 크게 증가'],
      lv: [
        { dmg: 22, cd: 2.2, count: 1, pierce: 3, speed: 320, r: 4 },
        { dmg: 27, cd: 2.0, count: 1, pierce: 3, speed: 325, r: 4 },
        { dmg: 30, cd: 1.9, count: 1, pierce: 4, speed: 330, r: 4 },
        { dmg: 33, cd: 1.8, count: 2, pierce: 4, speed: 335, r: 4 },
        { dmg: 38, cd: 1.65, count: 2, pierce: 5, speed: 340, r: 4 },
        { dmg: 46, cd: 1.5, count: 2, pierce: 6, speed: 350, r: 4 }
      ],
      evo: { dmg: 110, cd: 1.25, count: 2, pierce: 999, speed: 360, r: 8 }
    },
    bribe: {
      name: '심판매수', icon: '💸', passive: 'trickster', hero: 'messi', use: 'hand', shout: '퇴장!', gift: true, evoName: '매수된 심판', evoIcon: '🟥',
      desc: '봉투를 받은 심판이 적이 가장 많은 곳(보스 우선)에 퇴장을 선언한다. 맞은 적은 기절.',
      evoDesc: '매수된 심판이 세 번 연달아 퇴장을 선언하고, 그동안 메시는 무적. VAR도 못 봤다. 승부차기 토너먼트 우승 보상.',
      ups: ['', '피해 증가', '범위 증가, 기절 증가', '쿨타임 감소', '피해·범위 증가', '두 번 연달아 선언'],
      lv: [
        { dmg: 34, cd: 6.5, radius: 30, stun: 0.6, count: 1 },
        { dmg: 42, cd: 6.3, radius: 31, stun: 0.6, count: 1 },
        { dmg: 44, cd: 6.0, radius: 37, stun: 0.7, count: 1 },
        { dmg: 50, cd: 5.3, radius: 38, stun: 0.7, count: 1 },
        { dmg: 62, cd: 5.1, radius: 43, stun: 0.8, count: 1 },
        { dmg: 78, cd: 4.6, radius: 45, stun: 1.0, count: 2 }
      ],
      evo: { dmg: 110, cd: 4.0, radius: 50, stun: 1.2, count: 3, guard: 0.7 }
    },
    hollywood: {
      name: '명품 헐리웃', icon: '🎬', passive: 'speed', hero: 'torres', use: 'stepover', shout: '헐리웃!', gift: true, evoName: '오스카 헐리웃', evoIcon: '🏆',
      desc: '적이 붙으면 화려하게 넘어진다. 넘어지는 동안 무적, 휩쓸린 적에게 피해.',
      evoDesc: '오스카급 다이빙. 더 자주, 더 멀리 날아가고 넘어진 자리가 폭발한다. 승부차기 토너먼트 우승 보상.',
      ups: ['', '다이빙 거리 증가', '피해 증가', '쿨타임 감소', '피해·거리 증가', '쿨타임 크게 감소'],
      lv: [
        { dmg: 15, cd: 4.0, dist: 50 },
        { dmg: 16, cd: 3.8, dist: 58 },
        { dmg: 22, cd: 3.6, dist: 60 },
        { dmg: 24, cd: 3.1, dist: 62 },
        { dmg: 30, cd: 3.0, dist: 70 },
        { dmg: 34, cd: 2.4, dist: 74 }
      ],
      evo: { dmg: 60, cd: 1.5, dist: 90, burst: 44 }
    },
    // 드리볼: balls leave 메시's feet and chase the enemies around him, tapping one after another; past the leash
    // they run back and juggle at his feet. Looks like the 회전 공: white, golden from goldLv; evolved, as many of
    // them as he has won 발롱도르 are trophies (RS.ballLookAt).
    dribball: {
      name: '드리볼', icon: '🏃', passive: 'keepup', hero: 'messi', evoName: '마라도나의 재림', evoIcon: '🌟', goldLv: 3,
      desc: '메시 발끝을 떠난 공이 주변 적을 쫓아다니며 툭툭 때린다. 멀어지면 발밑으로 돌아온다.',
      evoDesc: '공 4개가 미친 듯이 드리블하며 적 사이를 누빈다. 맞은 적은 넘어진다. 받은 발롱도르 수만큼은 발롱도르 공.',
      ups: ['', '피해 증가', '공 +1', '더 빨라진다', '공 +1, 피해 증가', '피해 크게 증가'],
      lv: [
        { dmg: 11, count: 1, speed: 170, leash: 95, touch: 0.26, r: 3 },
        { dmg: 13, count: 1, speed: 180, leash: 100, touch: 0.25, r: 3 },
        { dmg: 13, count: 2, speed: 185, leash: 105, touch: 0.25, r: 3 },
        { dmg: 15, count: 2, speed: 215, leash: 110, touch: 0.22, r: 3 },
        { dmg: 18, count: 3, speed: 220, leash: 115, touch: 0.22, r: 3.5 },
        { dmg: 22, count: 3, speed: 235, leash: 120, touch: 0.2, r: 3.5 }
      ],
      evo: { dmg: 32, count: 4, speed: 265, leash: 140, touch: 0.17, r: 4.5, trip: 0.45 }
    },
    // 드롭볼: balls circle 메시; each in turn shoots up out of sight and crashes down on the thickest crowd like a
    // meteor (a wide blast), is gone for `respawn` seconds, then pops back into orbit. Evolved: the blast bursts
    // into `scatter` small balls.
    dropball: {
      name: '드롭볼', icon: '☄️', passive: 'juggle', hero: 'messi', evoName: '발롱도르 유성우', evoIcon: '🌠', goldLv: 3,
      desc: '메시 주위를 돌던 공이 가끔 하늘로 솟았다가 적 무리 위로 운석처럼 떨어져 넓게 터진다. 몇 초 뒤 다시 돌아온다.',
      evoDesc: '떨어진 공이 터지며 작은 공 6개로 흩어져 주변을 휩쓴다. 받은 발롱도르 수만큼은 발롱도르 공.',
      ups: ['', '피해 증가', '공 +1', '폭발 범위 증가', '공 +1, 피해 증가', '쿨타임 감소, 피해 크게 증가'],
      lv: [
        { dmg: 20, cd: 3.4, count: 1, radius: 30, respawn: 2.2 },
        { dmg: 25, cd: 3.3, count: 1, radius: 31, respawn: 2.1 },
        { dmg: 26, cd: 3.2, count: 2, radius: 32, respawn: 2.0 },
        { dmg: 30, cd: 3.1, count: 2, radius: 38, respawn: 1.9 },
        { dmg: 36, cd: 3.0, count: 3, radius: 39, respawn: 1.8 },
        { dmg: 44, cd: 2.6, count: 3, radius: 41, respawn: 1.7 }
      ],
      evo: { dmg: 58, cd: 2.3, count: 4, radius: 46, respawn: 1.4, scatter: 6 }
    }
  };
  RS.SKILL_MAX = 6;
  // 발롱도르 balls (round 10): a trophy ball only for a 발롱도르 the hero has really won in this career
  // (build.ballons, RS.ballonCount); 메시's career holds eight, 날두's five.
  RS.BALLON_MAX = 8;
  // trophy: an evolved 발롱도르 move whose volley turns that many of its balls into trophies (World.fire).
  RS.ORBIT_RING = 4; // the Lv.6 회전 공 ring: golden balls fill it while fewer 발롱도르 have been won

  // ---------------------------------------------------------------- 합체 기술 (fusions, round 9)
  // Two evolved moves fuse into one new move (RS.availableFusions → a 합체 card → RS.applyChoice 'fuse'): both
  // leave the build, the fused move starts at Lv.1 in one of their slots and the other slot is free again. A fused
  // move levels, evolves (Lv.6 + the listed passive, which the parents already brought) and awakens like any other,
  // and two fused moves can fuse again (tier 2). `fusion` names the parts; `use` the runtime behaviour.
  const FUSE = (id, def) => { RS.SKILLS[id] = Object.assign({ fused: true }, def); };
  RS.PFX_MAX = 24; // live pixelfx effects at once (the oldest gives way)
  RS.PFX_GOLD = ['#4a2a06', '#a86a12', '#e8a820', '#ffd84a', '#fff0a0', '#ffffff']; // 발롱도르 palette for pixelfx effects
  RS.PFX_FIRE = ['#4a1712', '#c9281f', '#f2561d', '#ff8a2a', '#ffe26b', '#fff3a6', '#ffffff'];
  RS.PFX_WHITE = ['#2a3a4a', '#6a8aa8', '#a8c8e0', '#d8ecf8', '#f4faff', '#ffffff', '#ffffff']; // a shock of white light
  // round 19: the SIUUU grade's own colours (RS.GRADES siuuu, the card's cyan → gold → pink cycle) and 심판매수's red
  RS.SIUUU_CYCLE = ['#8df9ff', '#ffd45a', '#ff4fd8'];
  RS.PFX_SIUUU = ['#06303a', '#1a7f95', '#3fd4e8', '#8df9ff', '#d6fdff', '#ffffff'];
  RS.PFX_PINK = ['#2a0622', '#8a1a6e', '#e03cb8', '#ff4fd8', '#ffc4f2', '#ffffff'];
  RS.PFX_RED = ['#2a0606', '#7a0a0a', '#c81414', '#ff3030', '#ff9a8a', '#fff0ea', '#ffffff'];
  RS.HIT_STOP = { boss: 0.12, rival: 0.12, crit: 0.035 }; // seconds the match freezes on a big hit (App.tick)
  RS.FINAL_FUSE = 0.03; // the final rival's damage × (1 + this × fusion depth) per fused move in the build
  RS.FUSE_SCALE = 0.42; // × the damage numbers below (RS.skillStats): a fusion is worth about one evolved move and a free slot
  // 날두
  FUSE('missile', {
    name: '유도 대포알', icon: '🚀', fusion: ['kick', 'knuckle'], passive: 'freekick', hero: ['ronaldo', 'torres'], use: 'missile', evoName: '발롱도르 미사일', evoIcon: '🛰️', trophy: true,
    desc: '진화한 축구공 킥 + 무회전 대포알. 적을 쫓아가는 대포알이 첫 적중에서 폭발한다.',
    evoDesc: '황금 미사일 4발이 폭발하며 적 사이를 꿰뚫는다. 받은 발롱도르 수만큼은 발롱도르 미사일.',
    ups: ['', '폭발 범위 증가', '대포알 +1', '피해 증가, 관통 +1', '폭발 피해 증가', '피해 크게 증가, 쿨타임 감소'],
    lv: [
      { dmg: 60, cd: 1.4, count: 2, pierce: 2, speed: 330, r: 6, boom: 30, boomDmg: 40 },
      { dmg: 66, cd: 1.35, count: 2, pierce: 2, speed: 335, r: 6, boom: 38, boomDmg: 44 },
      { dmg: 72, cd: 1.3, count: 3, pierce: 2, speed: 340, r: 6, boom: 38, boomDmg: 48 },
      { dmg: 84, cd: 1.2, count: 3, pierce: 3, speed: 345, r: 6, boom: 42, boomDmg: 54 },
      { dmg: 96, cd: 1.1, count: 3, pierce: 3, speed: 350, r: 6, boom: 45, boomDmg: 70 },
      { dmg: 120, cd: 0.95, count: 3, pierce: 4, speed: 360, r: 7, boom: 48, boomDmg: 84 }
    ],
    evo: { dmg: 170, cd: 0.85, count: 4, pierce: 6, speed: 380, r: 8, boom: 60, boomDmg: 120, gold: true }
  });
  FUSE('airraid', {
    name: '공중 지배', icon: '🛸', fusion: ['header', 'bicycle'], passive: 'jump', hero: ['ronaldo', 'torres'], use: 'airraid', evoName: '오버헤드 폭격', evoIcon: '🌪️',
    desc: '슈퍼 헤더 + 오버헤드 토네이도. 솟구쳐 내려찍고, 착지점에서 회오리가 바깥으로 번진다.',
    evoDesc: '다섯 겹의 회오리가 화면을 쓸어 적을 기절시킨다.',
    ups: ['', '회오리 +1', '피해 증가', '범위 증가', '쿨타임 감소', '피해·범위 크게 증가'],
    lv: [
      { dmg: 70, cd: 2.4, radius: 60, rings: 2, stun: 0.3 },
      { dmg: 76, cd: 2.3, radius: 62, rings: 3, stun: 0.3 },
      { dmg: 90, cd: 2.2, radius: 64, rings: 3, stun: 0.35 },
      { dmg: 96, cd: 2.1, radius: 72, rings: 3, stun: 0.35 },
      { dmg: 108, cd: 1.8, radius: 74, rings: 4, stun: 0.4 },
      { dmg: 130, cd: 1.7, radius: 80, rings: 4, stun: 0.45 }
    ],
    evo: { dmg: 190, cd: 1.4, radius: 100, rings: 5, stun: 0.6 }
  });
  FUSE('blitz', {
    name: '환상 난무', icon: '👻', fusion: ['stepover', 'scissors'], passive: 'speed', hero: ['ronaldo', 'torres'], use: 'blitz', evoName: '유령 질주', evoIcon: '💀',
    desc: '환상 스텝오버 + 더블 시저스. 잔상이 적 사이를 번개처럼 누비며 한 명마다 가위차기를 꽂는다. 그동안 무적.',
    evoDesc: '열두 명을 연달아 제치는 유령의 질주.',
    ups: ['', '제치는 수 +1', '피해 증가', '쿨타임 감소', '제치는 수 +2', '피해 크게 증가'],
    lv: [
      { dmg: 70, cd: 4.5, count: 6, range: 170, stun: 0.5 },
      { dmg: 76, cd: 4.3, count: 7, range: 175, stun: 0.5 },
      { dmg: 90, cd: 4.1, count: 7, range: 180, stun: 0.55 },
      { dmg: 96, cd: 3.8, count: 7, range: 185, stun: 0.55 },
      { dmg: 108, cd: 3.5, count: 9, range: 190, stun: 0.6 },
      { dmg: 140, cd: 3.2, count: 10, range: 200, stun: 0.6 }
    ],
    evo: { dmg: 200, cd: 3.0, count: 13, range: 220, stun: 0.8 }
  });
  FUSE('inferno', {
    name: '지옥의 함성', icon: '🔥', fusion: ['siuu', 'trail'], passive: 'charisma', hero: 'ronaldo', use: 'inferno', evoName: '월드 인페르노', evoIcon: '🌋',
    desc: '월드 SIUU + 지옥의 레드카펫. 함성이 적을 날리고 기절시킨 자리에 불의 고리가 남아 타오른다.',
    evoDesc: '함성 한 번에 경기장이 불바다가 된다.',
    ups: ['', '불 고리 +2', '불 피해 증가', '범위 증가', '쿨타임 감소', '함성·불 피해 크게 증가'],
    lv: [
      { dmg: 30, cd: 5.0, radius: 90, stun: 1.0, knock: 90, zones: 8, zdmg: 8, life: 3.0, tick: 0.3, zr: 16 },
      { dmg: 34, cd: 4.8, radius: 92, stun: 1.0, knock: 90, zones: 10, zdmg: 9, life: 3.2, tick: 0.3, zr: 16 },
      { dmg: 38, cd: 4.6, radius: 95, stun: 1.1, knock: 95, zones: 10, zdmg: 12, life: 3.4, tick: 0.3, zr: 17 },
      { dmg: 42, cd: 4.4, radius: 105, stun: 1.1, knock: 100, zones: 10, zdmg: 13, life: 3.6, tick: 0.28, zr: 18 },
      { dmg: 46, cd: 3.9, radius: 110, stun: 1.2, knock: 100, zones: 12, zdmg: 15, life: 3.8, tick: 0.28, zr: 18 },
      { dmg: 60, cd: 3.5, radius: 120, stun: 1.3, knock: 110, zones: 12, zdmg: 20, life: 4.0, tick: 0.25, zr: 19 }
    ],
    evo: { dmg: 90, cd: 3.0, radius: 150, stun: 1.6, knock: 130, zones: 16, zdmg: 30, life: 5.0, tick: 0.22, zr: 22, heal: 10 }
  });
  FUSE('cr7', {
    name: 'CR7 궁극기', icon: '7️⃣', fusion: ['missile', 'airraid'], passive: 'boots', hero: 'ronaldo', use: 'meteor', evoName: '발롱도르 유성 폭격', evoIcon: '🌠', trophy: true,
    desc: '진화한 유도 대포알 + 오버헤드 폭격. 하늘에서 황금 유성이 적들 머리 위로 쏟아진다.',
    evoDesc: '열여덟 개의 황금 유성, 경기장 전체가 폭격당한다. 받은 발롱도르 수만큼은 발롱도르가 떨어진다.',
    ups: ['', '유성 +2', '피해 증가', '범위 증가', '쿨타임 감소', '피해 크게 증가'],
    lv: [
      { dmg: 60, cd: 3.5, count: 8, radius: 24, range: 240, stun: 0.3 },
      { dmg: 66, cd: 3.4, count: 10, radius: 24, range: 245, stun: 0.3 },
      { dmg: 80, cd: 3.2, count: 10, radius: 25, range: 250, stun: 0.3 },
      { dmg: 88, cd: 3.0, count: 10, radius: 30, range: 255, stun: 0.35 },
      { dmg: 100, cd: 2.5, count: 12, radius: 30, range: 260, stun: 0.35 },
      { dmg: 130, cd: 2.2, count: 14, radius: 32, range: 270, stun: 0.4 }
    ],
    evo: { dmg: 200, cd: 1.8, count: 18, radius: 38, range: 300, stun: 0.5 }
  });
  // 메시
  FUSE('swarm', {
    name: '위성 군단', icon: '🪐', fusion: ['orbit', 'dribball'], passive: 'ballon', hero: 'messi', use: 'swarm', evoName: '발롱도르 위성계', evoIcon: '🌌', goldLv: 1,
    desc: '진화한 회전 공 + 마라도나의 재림. 황금 공들이 메시를 돌면서, 몇 개는 떨어져 나가 적을 쫓아가 찬다.',
    evoDesc: '공 열 개가 돌고 다섯 개가 사냥한다. 도는 공 중 받은 발롱도르 수만큼은 발롱도르.',
    ups: ['', '회전 공 +1', '사냥 공 +1', '피해 증가', '범위 증가', '피해 크게 증가, 회전 공 +2'],
    lv: [
      { dmg: 20, cd: 0.35, count: 4, radius: 40, speed: 3.2, size: 1.3, knock: 25, dcount: 2, leash: 110, dspeed: 220, r: 4, touch: 0.5, trip: 0.2 },
      { dmg: 22, cd: 0.35, count: 5, radius: 41, speed: 3.2, size: 1.3, knock: 25, dcount: 2, leash: 112, dspeed: 225, r: 4, touch: 0.5, trip: 0.2 },
      { dmg: 24, cd: 0.34, count: 5, radius: 42, speed: 3.3, size: 1.3, knock: 25, dcount: 3, leash: 115, dspeed: 230, r: 4, touch: 0.48, trip: 0.2 },
      { dmg: 30, cd: 0.33, count: 5, radius: 44, speed: 3.3, size: 1.4, knock: 28, dcount: 3, leash: 118, dspeed: 235, r: 4, touch: 0.46, trip: 0.25 },
      { dmg: 34, cd: 0.32, count: 5, radius: 50, speed: 3.4, size: 1.4, knock: 28, dcount: 3, leash: 125, dspeed: 240, r: 5, touch: 0.44, trip: 0.25 },
      { dmg: 45, cd: 0.3, count: 7, radius: 52, speed: 3.5, size: 1.5, knock: 30, dcount: 4, leash: 130, dspeed: 250, r: 5, touch: 0.42, trip: 0.3 }
    ],
    evo: { dmg: 70, cd: 0.28, count: 10, radius: 60, speed: 3.8, size: 1.6, knock: 35, dcount: 5, leash: 150, dspeed: 270, r: 5, touch: 0.38, trip: 0.35 }
  });
  FUSE('rain', {
    name: '유성우 폭격', icon: '☄️', fusion: ['dropball', 'chip'], passive: 'juggle', hero: 'messi', use: 'chip', evoName: '발롱도르 유성우', evoIcon: '🌠', trophy: true,
    desc: '진화한 드롭볼 + 로빙 폭격. 황금 공이 가장 단단한 적들 머리 위로 쉴 새 없이 떨어진다.',
    evoDesc: '열 개의 황금 유성이 보스부터 때린다. 받은 발롱도르 수만큼은 발롱도르가 떨어진다.',
    ups: ['', '유성 +1', '피해 증가', '범위 증가', '쿨타임 감소', '피해 크게 증가, 유성 +2'],
    lv: [
      { dmg: 55, cd: 2.2, count: 5, radius: 34 },
      { dmg: 60, cd: 2.1, count: 6, radius: 34 },
      { dmg: 72, cd: 2.0, count: 6, radius: 36 },
      { dmg: 78, cd: 1.9, count: 6, radius: 42 },
      { dmg: 90, cd: 1.6, count: 6, radius: 44 },
      { dmg: 120, cd: 1.5, count: 8, radius: 46 }
    ],
    evo: { dmg: 180, cd: 1.3, count: 10, radius: 52 }
  });
  FUSE('maradona', {
    name: '마라도나 모드', icon: '🇦🇷', fusion: ['solo', 'elastico'], passive: 'lowcenter', hero: 'messi', use: 'blitz', evoName: '세기의 드리블', evoIcon: '👑',
    desc: '여섯 명 제치기 + 호나우딩요의 마법. 하프라인부터 적을 하나하나 제치며 번개처럼 달린다. 그동안 무적.',
    evoDesc: '열두 명을 제치는 세기의 드리블.',
    ups: ['', '제치는 수 +1', '피해 증가', '쿨타임 감소', '제치는 수 +2', '피해 크게 증가'],
    lv: [
      { dmg: 70, cd: 4.5, count: 6, range: 170, stun: 0.5 },
      { dmg: 76, cd: 4.3, count: 7, range: 175, stun: 0.5 },
      { dmg: 90, cd: 4.1, count: 7, range: 180, stun: 0.55 },
      { dmg: 96, cd: 3.8, count: 7, range: 185, stun: 0.55 },
      { dmg: 108, cd: 3.5, count: 9, range: 190, stun: 0.6 },
      { dmg: 140, cd: 3.2, count: 10, range: 200, stun: 0.6 }
    ],
    evo: { dmg: 200, cd: 3.0, count: 13, range: 220, stun: 0.8 }
  });
  FUSE('symphony', {
    name: '패스 교향곡', icon: '🎻', fusion: ['tiki', 'killpass'], passive: 'leftfoot', hero: 'messi', use: 'kick', passer: 'xavino', proj: ['tiki', 'golden'], evoName: '발롱도르 교향곡', evoIcon: '🎼', trophy: true,
    desc: '티키타카 오케스트라 + 라인 브레이커. 챠비와 니에미스타의 패스가 적 사이를 튕기고 꿰뚫으며 멈추지 않는다.',
    evoDesc: '황금 패스 여덟 줄기가 경기장을 가른다. 받은 발롱도르 수만큼은 발롱도르 패스.',
    ups: ['', '패스 +1', '관통 +1', '튕김 +1', '피해 증가', '피해 크게 증가, 패스 +1'],
    lv: [
      { dmg: 40, cd: 0.6, count: 4, pierce: 3, bounce: 3, speed: 260, r: 4 },
      { dmg: 44, cd: 0.58, count: 5, pierce: 3, bounce: 3, speed: 265, r: 4 },
      { dmg: 48, cd: 0.56, count: 5, pierce: 4, bounce: 3, speed: 270, r: 4 },
      { dmg: 52, cd: 0.54, count: 5, pierce: 4, bounce: 4, speed: 275, r: 4 },
      { dmg: 64, cd: 0.5, count: 5, pierce: 5, bounce: 4, speed: 280, r: 4 },
      { dmg: 85, cd: 0.42, count: 6, pierce: 6, bounce: 5, speed: 290, r: 5 }
    ],
    evo: { dmg: 130, cd: 0.38, count: 8, pierce: 8, bounce: 6, speed: 300, r: 5 }
  });
  FUSE('wrath', {
    name: '신의 분노', icon: '🖐️', fusion: ['hand', 'bobo'], passive: 'trickster', hero: 'messi', use: 'hand', evoName: '심판의 손', evoIcon: '⚡',
    desc: '세기의 골 + 저리 가!. 거대한 손이 연달아 내리치고, 그 사이 메시는 노려보기만 해도 적이 얼어붙는다.',
    evoDesc: '다섯 번 내리치는 심판의 손.',
    ups: ['', '내리치기 +1', '기절 시간 증가', '범위 증가', '쿨타임 감소', '피해 크게 증가, 내리치기 +1'],
    lv: [
      { dmg: 90, cd: 4.5, count: 2, radius: 60, stun: 1.2, guard: 0.8 },
      { dmg: 96, cd: 4.4, count: 3, radius: 62, stun: 1.2, guard: 0.9 },
      { dmg: 104, cd: 4.2, count: 3, radius: 64, stun: 1.5, guard: 0.9 },
      { dmg: 112, cd: 4.0, count: 3, radius: 72, stun: 1.6, guard: 1.0 },
      { dmg: 130, cd: 3.4, count: 3, radius: 74, stun: 1.7, guard: 1.0 },
      { dmg: 180, cd: 3.0, count: 4, radius: 80, stun: 2.0, guard: 1.1 }
    ],
    evo: { dmg: 260, cd: 2.6, count: 5, radius: 95, stun: 2.4, guard: 1.3 }
  });
  FUSE('goat', {
    name: 'GOAT 모드', icon: '🐐', fusion: ['swarm', 'rain'], passive: 'ballon', hero: 'messi', use: 'meteor', evoName: '8발롱도르 유성우', evoIcon: '🏆', trophy: true,
    desc: '진화한 위성 군단 + 진화한 유성우 폭격. 하늘에서 황금 공이 쏟아져 적들을 짓누른다.',
    evoDesc: '받은 발롱도르가 모두(최대 8개) 황금 유성과 함께 한꺼번에 떨어지는 밤.',
    ups: ['', '유성 +2', '피해 증가', '범위 증가', '쿨타임 감소', '피해 크게 증가'],
    lv: [
      { dmg: 60, cd: 3.5, count: 8, radius: 24, range: 240, stun: 0.3, gold: true },
      { dmg: 66, cd: 3.4, count: 10, radius: 24, range: 245, stun: 0.3, gold: true },
      { dmg: 80, cd: 3.2, count: 10, radius: 25, range: 250, stun: 0.3, gold: true },
      { dmg: 88, cd: 3.0, count: 10, radius: 30, range: 255, stun: 0.35, gold: true },
      { dmg: 100, cd: 2.5, count: 12, radius: 30, range: 260, stun: 0.35, gold: true },
      { dmg: 130, cd: 2.2, count: 14, radius: 32, range: 270, stun: 0.4, gold: true }
    ],
    evo: { dmg: 200, cd: 1.8, count: 18, radius: 38, range: 300, stun: 0.5, gold: true }
  });
  // 각성 (★): an evolved move keeps growing — every star: that move's damage +12 %, cooldown −4 %.
  RS.STAR_MAX = 5;
  RS.STAR_STEP = { dmg: 0.12, cd: -0.04 };

  // Old 메시 careers (saved before the heroes had separate moves) can hold 날두's moves: RS.normalizeBuild turns
  // each into 메시's counterpart (level and evolution kept).
  RS.MESSI_COUNTERPART = {
    skills: { kick: 'tiki', knuckle: 'killpass', header: 'chip', bicycle: 'elastico', stepover: 'solo', scissors: 'curler', siuu: 'bobo', rabona: 'curler', trail: 'solo' },
    passives: { boots: 'leftfoot', freekick: 'vision', jump: 'calm', flex: 'samba', speed: 'lowcenter', finisher: 'curve', charisma: 'grit', fitness: 'grit', trap: 'vision' },
    relics: { honaldo: 'messia', lunchbox: 'mate', bomb: 'nutmeg', meteor: 'alien' }
  };

  // ---------------------------------------------------------------- Passives
  // mods: the base of one card (희귀); a card of grade g adds mods × RS.GRADES[g].pmul, as its text says
  // (RS.passiveMods, RS.modsText). Keys: see RS.computeStats in game.js.
  RS.PASSIVES = {
    boots: { name: '황금 축구화', icon: '👟', mods: { dmg: 0.10 } },
    freekick: { name: '프리킥 연습', icon: '🥅', mods: { projSpeed: 0.10, dur: 0.05 } },
    jump: { name: '점프력', icon: '🦵', mods: { area: 0.10 } },
    flex: { name: '유연성', icon: '🧘', mods: { cd: -0.07 } },
    speed: { name: '스피드 훈련', icon: '🏃', mods: { moveSpeed: 0.08 } },
    finisher: { name: '골 결정력', icon: '🎯', mods: { crit: 0.06 } },
    charisma: { name: '카리스마', icon: '😎', mods: { dur: 0.12 } },
    fitness: { name: '체력 단련', icon: '💪', mods: { hp: 20 } },
    trap: { name: '볼 트래핑', icon: '🧲', mods: { magnet: 0.30 } },
    recovery: { name: '회복 루틴', icon: '💤', mods: { regen: 0.25 } },
    icebath: { name: '얼음 목욕', icon: '🧊', mods: { armor: 1 } },
    ballon: { name: '발롱도르 수집', icon: '🏆', mods: { dmg: 0.06, area: 0.06 }, hero: 'messi' },
    // 메시's own training. A passive paired only with the other hero's moves is never offered (RS.passiveFor).
    leftfoot: { name: '왼발 장인', icon: '🦶', mods: { dmg: 0.10 } },
    curve: { name: '감아차기 감각', icon: '🌙', mods: { crit: 0.06 } },
    lowcenter: { name: '낮은 무게중심', icon: '⬇️', mods: { moveSpeed: 0.08 } },
    grit: { name: '승부욕', icon: '💢', mods: { hp: 20 } },
    vision: { name: '넓은 시야', icon: '👁️', mods: { projSpeed: 0.10, dur: 0.05 } },
    calm: { name: '침착함', icon: '😌', mods: { area: 0.10 } },
    samba: { name: '삼바 리듬', icon: '💃', mods: { cd: -0.07 } },
    keepup: { name: '볼 키핑', icon: '🪀', mods: { moveSpeed: 0.05, area: 0.05 } },
    juggle: { name: '리프팅 묘기', icon: '🤹', mods: { area: 0.08, dur: 0.06 } },
    trickster: { name: '능청 연기', icon: '🎭', mods: { dur: 0.12, crit: 0.03 } },
    // Round 13.2 (the user: 맞고 나서 1초간 깜박이며 무적, 1 ~ 2 ~ 3초): seconds of blinking invulnerability after a
    // hit, × the card's grade, three levels, at most RS.HIT_GUARD_MAX (World.hurtPlayer).
    ironwill: { name: '오뚝이 정신', icon: '🛡️', mods: { hitGuard: 1 }, max: 3 }
  };
  // A passive level saved before round 13 has no grade: it counts as 희귀, the old card's full value.
  RS.PASSIVE_OLD_G = 2;
  // Card text of a mods table (RS.modsText): label, unit ('%': the value is a fraction) and sign (-1: shown negative).
  RS.MOD_TEXT = {
    dmg: ['공격력', '%'], cd: ['쿨타임', '%'], area: ['공격 범위', '%'], projSpeed: ['투사체 속도', '%'],
    dur: ['기절·지속시간', '%'], moveSpeed: ['이동속도', '%'], crit: ['치명타 확률', '%'], hp: ['최대 체력', ''],
    magnet: ['아이템 흡수 범위', '%'], regen: ['초당 체력', ''], armor: ['받는 피해', '', -1], hitGuard: ['맞은 뒤 무적', '초']
  };
  RS.PASSIVE_MAX = 5;

  // 개인 훈련: once the moves, passives and teammates on offer run short, a hand is filled with these small
  // permanent boosts (no cap) instead of plain filler, so a late-career level-up is still a choice.
  RS.DRILLS = {
    shoot: { name: '슈팅 특훈', icon: '🥅', desc: '공격력 +3%', mods: { dmg: 0.03 } },
    stamina: { name: '체력 특훈', icon: '❤️', desc: '최대 체력 +8', mods: { hp: 8 } },
    agility: { name: '순발력 특훈', icon: '⏱️', desc: '쿨타임 -2%', mods: { cd: -0.02 } },
    sprint: { name: '스프린트 특훈', icon: '👟', desc: '이동속도 +2%', mods: { moveSpeed: 0.02 } },
    focus: { name: '집중력 특훈', icon: '🎯', desc: '치명타 확률 +2%', mods: { crit: 0.02 } }
  };

  // ---------------------------------------------------------------- 특수 아이템 (graded items)
  // A level-up sometimes deals a 4th card: a special item of grade g (희귀 · 영웅 · 전설 on RS.GRADES), or a gamble
  // card. Each item is owned once and kept for the career. mods use the RS.computeStats keys; fx names a runtime
  // effect in game.js (World.updateRelics, damageEnemy, killEnemy, the dice reroll). Round 13: the old 레어 · 히든 ·
  // 초히든 · 슈퍼히든 became 희귀 · 영웅 · 전설 · 전설 (약물 꽂기 영웅), and no coin buys an item any more.
  // The item card: `chance` per level-up (× (1 + luck), × the difficulty's `special`), its grade from `odds` by pro
  // season, 전설 on the same slow climb as the cards above (0.019 % in the debut). Chests (RS.CHEST_RELIC) use the
  // same odds; gamble cards give 영웅 at most. 하드 halves the chance (RS.DIFFS.special).
  RS.ITEM_STAGES = [
    { from: 0, chance: 0.05, odds: [0, 0, 0.89981, 0.1, 0.00019] },
    { from: 3, chance: 0.05, odds: [0, 0, 0.899, 0.1, 0.001] },
    { from: 5, chance: 0.055, odds: [0, 0, 0.78, 0.216, 0.004] },
    { from: 8, chance: 0.055, odds: [0, 0, 0.71, 0.28, 0.01] },
    { from: 10, chance: 0.06, odds: [0, 0, 0.66, 0.325, 0.015] },
    { from: 13, chance: 0.06, odds: [0, 0, 0.61, 0.365, 0.025] },
    { from: 16, chance: 0.065, odds: [0, 0, 0.56, 0.405, 0.035] },
    { from: 19, chance: 0.065, odds: [0, 0, 0.52, 0.435, 0.045] },
    { from: 22, chance: 0.065, odds: [0, 0, 0.48, 0.465, 0.055] }
  ];
  RS.GAMBLE_ODDS = 0.08; // after the item card's chance: the 4th card is a gamble card
  RS.RELICS = {
    dice: { g: 2, icon: '🎲', name: '행운의 주사위', desc: '선택지가 나올 때마다 1번 무료로 다시 굴린다', fx: 'dice' },
    ion: { g: 2, icon: '🥤', name: '이온 음료', desc: '이동속도 +10%, 초당 체력 +0.4', mods: { moveSpeed: 0.10, regen: 0.4 } },
    armband: { g: 2, icon: '🎗️', name: '주장 완장', desc: '동료 공격력 +35%, 동료 쿨타임 -15%', mods: { teamDmg: 0.35, teamCd: -0.15 } },
    contract: { g: 2, icon: '📈', name: '연봉 협상', desc: '코인 획득 +40%', mods: { gold: 0.4 } },
    clover: { g: 2, icon: '🍀', name: '네잎클로버', desc: '특수 카드 등장 확률 +50%', mods: { luck: 0.5 } },
    spikes: { g: 2, icon: '👟', name: '스파이크 축구화', desc: '공격력 +12%, 치명타 +5%', mods: { dmg: 0.12, crit: 0.05 } },
    lunchbox: { g: 2, icon: '🍱', name: '에그타르트 도시락', desc: '최대 체력 +25, 먹는 즉시 체력 완전 회복', mods: { hp: 25 }, fx: 'fullheal', hero: 'ronaldo' },
    mate: { g: 2, icon: '🧉', name: '마테차 보온병', desc: '최대 체력 +25, 마시는 즉시 체력 완전 회복', mods: { hp: 25 }, fx: 'fullheal', hero: 'messi' },
    jamon: { g: 2, icon: '🥪', name: '하몽 보까디요', desc: '최대 체력 +25, 먹는 즉시 체력 완전 회복', mods: { hp: 25 }, fx: 'fullheal', hero: 'torres' },
    shinpad: { g: 2, icon: '🦵', name: '정강이 보호대', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
    adrenaline: { g: 3, icon: '⚡', name: '아드레날린', desc: '체력이 절반 이하면 공격력 +60%', fx: 'adrenaline' },
    goldboot: { g: 3, icon: '🥇', name: '골든 부트', desc: '공격력 +25%', mods: { dmg: 0.25 } },
    heart: { g: 3, icon: '🫀', name: '강철 심장', desc: '쿨타임 -12%, 이동속도 +6%', mods: { cd: -0.12, moveSpeed: 0.06 } },
    blackhole: { g: 3, icon: '🌀', name: '블랙홀 트래핑', desc: '흡수 범위 +120%, 경험치 +15%', mods: { magnet: 1.2, xp: 0.15 } },
    // 날두's power shots blow up; 메시 slips the ball through the fallen man's legs instead (his own style)
    bomb: { g: 3, icon: '💥', name: '폭발 슈팅', desc: '쓰러진 적이 폭발해 주변 적까지 쓸어버린다', fx: 'bomb', hero: ['ronaldo', 'torres'] },
    nutmeg: { g: 3, icon: '🔗', name: '알까기 연쇄', desc: '적이 쓰러지면 공이 가랑이 사이로 빠져나가 주변 적 3명을 연달아 제치고 넘어뜨린다(피해 + 기절)', fx: 'nutmeg', hero: 'messi' },
    sniper: { g: 3, icon: '🎯', name: '저격수의 눈', desc: '치명타 +15%, 보스에게 주는 피해 +15%', mods: { crit: 0.15, bossDmg: 0.15 } },
    whistle: { g: 4, icon: '⏱️', name: '추가시간 휘슬', desc: '12초마다 휘슬! 보스를 뺀 모든 적이 2초간 멈춘다', fx: 'whistle' },
    legend: { g: 4, icon: '🧬', name: '레전드 DNA', desc: '공격력 +40%, 치명타 +10%, 범위 +15%', mods: { dmg: 0.4, crit: 0.1, area: 0.15 } },
    crowd: { g: 4, icon: '🏟️', name: '홈 관중의 함성', desc: '최대 체력 +40, 초당 체력 +1.5, 받는 피해 -2', mods: { hp: 40, regen: 1.5, armor: 2 } },
    overdrive: { g: 4, icon: '⏩', name: '오버드라이브', desc: '쿨타임 -25%, 투사체 속도 +25%', mods: { cd: -0.25, projSpeed: 0.25 } },
    // 메시 only (his growth-hormone story), and only after he took the treatment (need: 'hgh'). A stimpack: up to
    // RS.STIM.max doses (b.relics.doping = doses); every extra dose adds RS.STIM.step of the first one's mods.
    // Stats only: a small body stays small.
    doping: { g: 3, icon: '💉', name: '약물 꽂기', desc: '성장호르몬 한 방 더! 스팀팩처럼 최대 5번 투여. 첫 투여: 공격 +20%, 체력 +30, 이동 +8%, 쿨타임 -10%, 범위·흡수 +15%, 치명타 +5%, 받는 피해 -1 · 추가 투여마다 그 25%씩 더',
      mods: { dmg: 0.2, hp: 30, moveSpeed: 0.08, cd: -0.1, area: 0.15, magnet: 0.15, crit: 0.05, armor: 1 }, hero: 'messi', need: 'hgh', stack: true },
    honaldo: { g: 4, icon: '🥋', name: '호날도', desc: '전설의 무술. 3초마다 정권 → 회오리 발차기 → 내려찍기 3연타 (호! 날! 도!)', fx: 'honaldo', hero: 'ronaldo' },
    messia: { g: 4, icon: '✨', name: '메시아', desc: '구세주의 기적. 3초마다 드리블 돌파 → 감아차기 연사 → 기적의 일격 3연타 (메! 시! 아!)', fx: 'messia', hero: 'messi' },
    meteor: { g: 4, icon: '🌠', name: '별똥별 슛', desc: '4초마다 하늘에서 황금 공 8개가 적에게 쏟아진다', fx: 'meteor', hero: ['ronaldo', 'torres'] },
    // 메시's own: "외계인" — a phantom dribble zigzags through eight defenders
    alien: { g: 4, icon: '👽', name: '외계인 모드', desc: '4초마다 메시의 잔상이 주변 적 8명 사이를 번개처럼 지그재그로 제치며 큰 피해 + 기절. 그동안 무적', fx: 'alien', hero: 'messi' },
    goat: { g: 4, icon: '🐐', name: 'GOAT', desc: '공격력 +50%, 쿨타임 -15%, 최대 체력 +60, 이동속도 +12%, 받는 피해 -2', mods: { dmg: 0.5, cd: -0.15, hp: 60, moveSpeed: 0.12, armor: 2 } }
  };
  // 도박 카드: rolled when picked; the odds are printed on the card. Outcome keys: levels (extra level-ups),
  // relic (the grade of the item won, 영웅 at most), hpHalf, coinMul (this match's coins), text (result line).
  // needCoins: shown only with coins.
  RS.GAMBLES = {
    coin: { icon: '🪙', name: '동전 던지기', desc: '앞면(50%): 레벨 +2 · 뒷면(50%): 꽝',
      outcomes: [{ p: 0.5, win: true, levels: 2, text: '앞면! 레벨 +2' }, { p: 0.5, text: '뒷면… 꽝!' }] },
    roll: { icon: '🎲', name: '주사위 한 판', desc: '4~6(50%): 희귀 아이템 · 1~3(50%): 체력 절반',
      outcomes: [{ p: 0.5, win: true, relic: 2, text: '주사위 5! 희귀 아이템' }, { p: 0.5, hpHalf: true, text: '주사위 2… 체력 절반' }] },
    slot: { icon: '🎰', name: '슬롯머신', desc: '8% 영웅 · 22% 희귀 · 70% 꽝',
      outcomes: [{ p: 0.08, win: true, relic: 3, text: '777 잭팟!! 영웅 아이템' }, { p: 0.22, win: true, relic: 2, text: '희귀 당첨' },
        { p: 0.7, text: '꽝! 다음 기회에' }] },
    allin: { icon: '💰', name: '올인 베팅', desc: '이번 경기 코인 전부: 45% 3배 · 55% 전부 잃음', needCoins: 10,
      outcomes: [{ p: 0.45, win: true, coinMul: 3, text: '대박! 코인 3배' }, { p: 0.55, coinMul: 0, text: '쪽박… 코인 전부 잃음' }] },
    devil: { icon: '😈', name: '악마의 계약', desc: '30%: 영웅 아이템 · 70%: 체력 절반',
      outcomes: [{ p: 0.3, win: true, relic: 3, text: '계약 성립! 영웅 아이템' }, { p: 0.7, hpHalf: true, text: '악마가 웃는다… 체력 절반' }] }
  };
  // 약물 꽂기 as a stimpack: the first dose is a 영웅 item (or this extra chance per level-up once 메시 took the
  // treatment); every dose after that comes as its own card (odds per level-up × (1 + luck)) up to `max`.
  RS.STIM = { max: 5, step: 0.25, first: 0.012, odds: 0.025 };
  RS.CHEST_RELIC = { chance: 0.03 }; // a special item in a chest, its grade from RS.ITEM_STAGES

  // ---------------------------------------------------------------- Eras (clubs) — parody names, no logos
  // kit.pattern: hoops | stripes | trim | sash
  RS.ERAS = {
    lisbon: {
      club: '리스본 사자단', short: '리스본',
      kit: { main: '#1e8c4e', alt: '#f2f2f2', shorts: '#f2f2f2', socks: '#1e8c4e', pattern: 'hoops' },
      theme: { g1: '#4a9a3e', g2: '#42903a', line: '#e6f5dc', edge: '#2f6d2a', night: false },
      foe: ['#2f5fb3', '#e0c040']
    },
    manchester: {
      club: '맨체스터 붉은악마단', short: '맨체스터',
      kit: { main: '#d3232f', alt: '#ffffff', shorts: '#ffffff', socks: '#151515', pattern: 'trim' },
      theme: { g1: '#3d8b3d', g2: '#367f36', line: '#e2f2dc', edge: '#265c26', night: false },
      foe: ['#3b6fd8', '#8ec3ea']
    },
    madrid: {
      club: '마드리드 백색군단', short: '마드리드',
      kit: { main: '#f7f7f7', alt: '#6c4bc0', shorts: '#f7f7f7', socks: '#f7f7f7', pattern: 'trim' },
      theme: { g1: '#43933e', g2: '#3b8837', line: '#f0f7ec', edge: '#2b682a', night: false },
      foe: ['#a3203a', '#1f3f8f']
    },
    turin: {
      club: '토리노 얼룩말단', short: '토리노',
      kit: { main: '#f4f4f4', alt: '#141414', shorts: '#f4f4f4', socks: '#141414', pattern: 'stripes' },
      theme: { g1: '#3f8a45', g2: '#387e3e', line: '#e9f4e6', edge: '#29602d', night: false },
      foe: ['#1d4fa8', '#c23030']
    },
    manchester2: {
      club: '맨체스터 붉은악마단', short: '맨체스터',
      kit: { main: '#d3232f', alt: '#ffffff', shorts: '#ffffff', socks: '#151515', pattern: 'trim' },
      theme: { g1: '#3a843a', g2: '#337733', line: '#e2f2dc', edge: '#245724', night: false },
      foe: ['#7cc4ef', '#1b1b4f']
    },
    riyadh: {
      club: '리야드 노란기사단', short: '리야드',
      kit: { main: '#ffd21f', alt: '#1b3f92', shorts: '#1b3f92', socks: '#ffd21f', pattern: 'trim' },
      theme: { g1: '#5a9c3c', g2: '#529236', line: '#fff4d6', edge: '#c8a868', night: false },
      foe: ['#1a7a3e', '#2a62c9']
    },
    national: {
      club: '포르투갈 대표팀', short: '대표팀',
      kit: { main: '#c41e2a', alt: '#1f7a3a', shorts: '#1f7a3a', socks: '#c41e2a', pattern: 'sash' },
      theme: { g1: '#2f6f33', g2: '#2a662e', line: '#dff0da', edge: '#163a19', night: true },
      foe: ['#8cc8f0', '#f4f4f4']
    },
    // ---- 메시 career eras (youth first)
    rosario: {
      club: '로사리오 붉은검정 유스', short: '로사리오',
      kit: { main: '#d0202a', alt: '#151515', shorts: '#151515', socks: '#d0202a', pattern: 'stripes' },
      theme: { g1: '#5c9a44', g2: '#54903e', line: '#eef6e6', edge: '#7a6a48', night: false },
      foe: ['#3a7ad0', '#f0f0f0']
    },
    masia: {
      club: '라 마시아 유스', short: '라 마시아',
      kit: { main: '#a50044', alt: '#004d98', shorts: '#004d98', socks: '#004d98', pattern: 'stripes' },
      theme: { g1: '#4a9a42', g2: '#43903c', line: '#eaf5e4', edge: '#2c6a2b', night: false },
      foe: ['#f0f0f0', '#2a2a2a']
    },
    barcelona: {
      club: '바르셀로나 청홍군단', short: '바르셀로나',
      kit: { main: '#a50044', alt: '#004d98', shorts: '#004d98', socks: '#004d98', pattern: 'stripes' },
      theme: { g1: '#44953f', g2: '#3c893a', line: '#eaf5e4', edge: '#2c6a2b', night: false },
      foe: ['#f0f0f0', '#7a1020']
    },
    paris: {
      club: '파리 에펠군단', short: '파리',
      kit: { main: '#1b2a5a', alt: '#da291c', shorts: '#1b2a5a', socks: '#1b2a5a', pattern: 'sash' },
      theme: { g1: '#3a843a', g2: '#337733', line: '#e2f2dc', edge: '#245724', night: true },
      foe: ['#8ec3ea', '#c0c0c0']
    },
    miami: {
      club: '마이애미 핑크군단', short: '마이애미',
      kit: { main: '#f7b5cd', alt: '#231f20', shorts: '#f7b5cd', socks: '#f7b5cd', pattern: 'trim' },
      theme: { g1: '#5a9c3c', g2: '#529236', line: '#fff4f8', edge: '#c88aa8', night: false },
      foe: ['#1a7a3e', '#e0c040']
    },
    argentina: {
      club: '아르헨티나 대표팀', short: '대표팀',
      kit: { main: '#75aadb', alt: '#ffffff', shorts: '#1a1a2e', socks: '#ffffff', pattern: 'stripes' },
      theme: { g1: '#2f6f33', g2: '#2a662e', line: '#dff0da', edge: '#163a19', night: true },
      foe: ['#1d4fa8', '#f4f4f4']
    },
    // ---- 토레쓰 career eras (round 11)
    atletico: {
      club: '마드리드 적백 줄무늬단', short: '줄무늬단',
      kit: { main: '#cb3524', alt: '#f6f6f6', shorts: '#1c2c5b', socks: '#cb3524', pattern: 'stripes' },
      theme: { g1: '#48963f', g2: '#408b39', line: '#eef6e8', edge: '#2d6a2a', night: false },
      foe: ['#f7f7f7', '#6c4bc0']
    },
    liverpool: {
      club: '리버풀 붉은 함성단', short: '리버풀',
      kit: { main: '#c8102e', alt: '#f6eb61', shorts: '#c8102e', socks: '#c8102e', pattern: 'trim' },
      theme: { g1: '#3d8b3d', g2: '#367f36', line: '#e2f2dc', edge: '#265c26', night: false },
      foe: ['#274488', '#f4f4f4']
    },
    chelseat: {
      club: '런던 파란 사자단', short: '첼씨',
      kit: { main: '#1a56b8', alt: '#f2f2f2', shorts: '#1a56b8', socks: '#f2f2f2', pattern: 'trim' },
      theme: { g1: '#43933e', g2: '#3b8837', line: '#f0f7ec', edge: '#2b682a', night: false },
      foe: ['#d3232f', '#a50044']
    },
    atletico2: {
      club: '마드리드 적백 줄무늬단', short: '줄무늬단',
      kit: { main: '#cb3524', alt: '#f6f6f6', shorts: '#1c2c5b', socks: '#cb3524', pattern: 'stripes' },
      theme: { g1: '#44923d', g2: '#3d8737', line: '#eef6e8', edge: '#2b662a', night: false },
      foe: ['#f7f7f7', '#1f3f8f']
    },
    tosu: {
      club: '사간 도스 하늘단', short: '도스',
      kit: { main: '#5aa5dc', alt: '#e75a8c', shorts: '#1c2c5b', socks: '#5aa5dc', pattern: 'trim' },
      theme: { g1: '#2f6f33', g2: '#2a662e', line: '#dff0da', edge: '#163a19', night: true },
      foe: ['#a50044', '#004d98']
    }
  };
  // Named opponents: a season with `foe` dresses the whole crowd in that club's kit (RS.foeColors) and adds its
  // formation wave (World 'bus'). 첼씨 is the blue nemesis of both careers: the 버스 수비, rows of heavy defenders.
  RS.FOES = {
    chelsea: { name: '첼씨', kit: ['#1a56b8', '#0f2f6e'], wall: '🚌 첼씨 버스 주차! 파란 수비벽이 밀고 온다' }
  };
  RS.foeColors = (yearIdx) => { const y = RS.YEARS[yearIdx]; return y.foe ? RS.FOES[y.foe].kit : RS.ERAS[y.era].foe; };

  // ---------------------------------------------------------------- Coaches (parody nicknames)
  // Each coach offers cards (team-wide buffs). Cards stack for the rest of the career.
  RS.COACHES = {
    boloni: { name: '볼로뇨 감독', tag: '첫 스승', look: { hair: '#5a4632', suit: '#2b3a2b' }, cards: [
      { id: 'boloni_xp', name: '유망주 육성', icon: '🌱', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'boloni_speed', name: '측면 돌파', icon: '🏃', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } },
      { id: 'boloni_hp', name: '기초 체력', icon: '❤️', desc: '최대 체력 +15', mods: { hp: 15 } }
    ] },
    hairdryer: { name: '퍼거쓴 경', tag: '헤어드라이어 불호령 명장', look: { hair: '#d9d9d9', suit: '#1d1d2a' }, cards: [
      { id: 'hd_team', name: '헤어드라이어 정신교육', icon: '💨', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'hd_time', name: '막판 극장골 타임', icon: '⏱️', desc: '보스에게 주는 피해 +15%', mods: { bossDmg: 0.15 } },
      { id: 'hd_young', name: '젊은 피', icon: '🌱', desc: '경험치 +10%', mods: { xp: 0.10 } },
      { id: 'hd_disc', name: '철의 규율', icon: '🛡️', desc: '받는 피해 -1', mods: { armor: 1 } }
    ] },
    engineer: { name: '뻴레그리니 감독', tag: '엔지니어, 설계의 달인', look: { hair: '#bfbfbf', suit: '#26262e' }, cards: [
      { id: 'eng_proj', name: '정밀 설계', icon: '📐', desc: '투사체 속도 +12%', mods: { projSpeed: 0.12 } },
      { id: 'eng_gal', name: '갈락티코 영입', icon: '⭐', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'eng_dmg', name: '공격 축구', icon: '⚔️', desc: '공격력 +8%', mods: { dmg: 0.08 } }
    ] },
    special: { name: '무링요 감독', tag: '자칭 스페셜 원', look: { hair: '#6d6d6d', suit: '#1a1a1a' }, cards: [
      { id: 'sp_bus', name: '버스 주차', icon: '🚌', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
      { id: 'sp_counter', name: '역습의 화신', icon: '⚡', desc: '이동속도 +7%', mods: { moveSpeed: 0.07 } },
      { id: 'sp_mind', name: '마인드 게임', icon: '🧠', desc: '치명타 확률 +6%', mods: { crit: 0.06 } }
    ] },
    eyebrow: { name: '안첼로띠 감독', tag: '한쪽 눈썹으로 지휘하는 신사', look: { hair: '#8a8a8a', suit: '#24304a' }, cards: [
      { id: 'eb_calm', name: '평온한 리더십', icon: '☕', desc: '초당 체력 +0.4', mods: { regen: 0.4 } },
      { id: 'eb_tenth', name: '열 번째 별', icon: '🌟', desc: '공격력 +10%', mods: { dmg: 0.10 } },
      { id: 'eb_brow', name: '눈썹 하나로 지휘', icon: '🤨', desc: '쿨타임 -6%', mods: { cd: -0.06 } }
    ] },
    headbutt: { name: '지딴 감독', tag: '박치기의 전설, 유럽 3연패', look: { hair: '#c9b48c', suit: '#2a2a2a' }, cards: [
      { id: 'hb_three', name: '3연패의 비결', icon: '🏆', desc: '공격력 +12%', mods: { dmg: 0.12 } },
      { id: 'hb_rot', name: '로테이션', icon: '🔄', desc: '동료 쿨타임 -12%', mods: { teamCd: -0.12 } },
      { id: 'hb_head', name: '박치기 정신', icon: '🐏', desc: '공격 범위 +12%', mods: { area: 0.12 } }
    ] },
    allegro: { name: '알레그로 감독', tag: '실리 축구', look: { hair: '#4a4a4a', suit: '#202020' }, cards: [
      { id: 'al_safe', name: '1:0 승리 공식', icon: '🧱', desc: '받는 피해 -1', mods: { armor: 1 } },
      { id: 'al_pts', name: '승점 관리', icon: '📊', desc: '최대 체력 +20', mods: { hp: 20 } },
      { id: 'al_short', name: '짧은 패스', icon: '↔️', desc: '쿨타임 -5%', mods: { cd: -0.05 } }
    ] },
    smoker: { name: '싸리 감독', tag: '줄담배 트레이닝복 철학자', look: { hair: '#9a9a9a', suit: '#1c2a4a' }, cards: [
      { id: 'sm_ball', name: '볼 점유 철학', icon: '🔁', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'sm_tri', name: '삼각 패스', icon: '🔺', desc: '투사체 속도 +10%, 범위 +5%', mods: { projSpeed: 0.10, area: 0.05 } },
      { id: 'sm_track', name: '트레이닝복 정신', icon: '🧥', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } }
    ] },
    maestro: { name: '삐를로 감독', tag: '초보 감독, 전설의 패서', look: { hair: '#3a2a1e', suit: '#222' }, cards: [
      { id: 'ma_vision', name: '대지를 가르는 패스', icon: '👁️', desc: '동료 쿨타임 -10%', mods: { teamCd: -0.10 } },
      { id: 'ma_free', name: '프리킥 수업', icon: '🥅', desc: '치명타 확률 +5%, 공격력 +5%', mods: { crit: 0.05, dmg: 0.05 } },
      { id: 'ma_calm', name: '무표정 리더십', icon: '😐', desc: '지속시간 +12%', mods: { dur: 0.12 } }
    ] },
    babyface: { name: '쏠샤르 감독', tag: '동안 암살자, 슈퍼 서브 출신', look: { hair: '#e0c27a', suit: '#1e1e2e' }, cards: [
      { id: 'bf_sub', name: '슈퍼 서브', icon: '🔄', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'bf_home', name: '귀환 환영식', icon: '🏠', desc: '최대 체력 +20', mods: { hp: 20 } },
      { id: 'bf_late', name: '추가시간의 기적', icon: '⏱️', desc: '보스에게 주는 피해 +12%', mods: { bossDmg: 0.12 } }
    ] },
    professor: { name: '랑니크 교수', tag: '게겐프레싱의 아버지', look: { hair: '#b0b0b0', suit: '#2a2a2a' }, cards: [
      { id: 'pr_press', name: '게겐프레싱', icon: '🔥', desc: '공격력 +10%', mods: { dmg: 0.10 } },
      { id: 'pr_run', name: '8초 탈환', icon: '⏩', desc: '쿨타임 -6%', mods: { cd: -0.06 } },
      { id: 'pr_lab', name: '스포츠 과학', icon: '🔬', desc: '초당 체력 +0.4', mods: { regen: 0.4 } }
    ] },
    desert: { name: '사막의 여우 감독', tag: '모래바람 전술가', look: { hair: '#2e2e2e', suit: '#f2f2f2' }, cards: [
      { id: 'de_sand', name: '모래바람 역습', icon: '🌪️', desc: '이동속도 +6%, 범위 +6%', mods: { moveSpeed: 0.06, area: 0.06 } },
      { id: 'de_oil', name: '오일머니 영입', icon: '💰', desc: '코인 획득 +25%, 동료 공격력 +8%', mods: { gold: 0.25, teamDmg: 0.08 } },
      { id: 'de_heat', name: '폭염 적응', icon: '☀️', desc: '최대 체력 +25', mods: { hp: 25 } },
      { id: 'de_magnet', name: '오아시스 시야', icon: '🧲', desc: '아이템 흡수 범위 +30%', mods: { magnet: 0.30 } }
    ] },
    marti: { name: '마르띠네즈 감독', tag: '대표팀 사령탑', look: { hair: '#3a3a3a', suit: '#1b2440' }, cards: [
      { id: 'mt_last', name: '라스트 댄스', icon: '💃', desc: '공격력 +15%', mods: { dmg: 0.15 } },
      { id: 'mt_cap', name: '주장 완장', icon: '©️', desc: '동료 공격력 +15%, 받는 피해 -1', mods: { teamDmg: 0.15, armor: 1 } },
      { id: 'mt_boss', name: '결승전 집중', icon: '🎯', desc: '보스에게 주는 피해 +20%', mods: { bossDmg: 0.20 } }
    ] },
    // ---- 메시 career coaches (youth first)
    grandma: { name: '할머니', tag: '첫 번째 팬', look: { hair: '#e6e6e6', suit: '#7a4a6a' }, cards: [
      { id: 'gm_cheer', name: '할머니의 응원', icon: '👵', desc: '초당 체력 +0.4', mods: { regen: 0.4 } },
      { id: 'gm_older', name: '형들 틈에서', icon: '👦', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'gm_sky', name: '하늘을 가리키며', icon: '☝️', desc: '공격력 +8%', mods: { dmg: 0.08 } }
    ] },
    machine: { name: '머신 감독', tag: '87년생 머신의 사령탑', look: { hair: '#5a4a3a', suit: '#d0202a' }, cards: [
      { id: 'mh_machine', name: '87년생 머신', icon: '⚙️', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'mh_juggle', name: '공 리프팅 묘기', icon: '🤹', desc: '공격 범위 +8%', mods: { area: 0.08 } },
      { id: 'mh_quick', name: '작은 발놀림', icon: '👟', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } }
    ] },
    napkin: { name: '냅킨 단장', tag: '냅킨에 계약서를 쓴 남자', look: { hair: '#c0c0c0', suit: '#004d98' }, cards: [
      { id: 'nk_napkin', name: '냅킨 계약서', icon: '🧻', desc: '코인 획득 +20%', mods: { gold: 0.20 } },
      { id: 'nk_masia', name: '라 마시아 기숙사', icon: '🏠', desc: '경험치 +10%, 최대 체력 +10', mods: { xp: 0.10, hp: 10 } },
      { id: 'nk_cure', name: '치료비 지원', icon: '🏥', desc: '받는 피해 -1', mods: { armor: 1 } }
    ] },
    rijkaard: { name: '레이까르트 감독', tag: '첫 스승, 자유 축구', look: { hair: '#1a1a1a', suit: '#2b2b3a' }, cards: [
      { id: 'rk_free', name: '자유 축구', icon: '🕊️', desc: '공격력 +8%', mods: { dmg: 0.08 } },
      { id: 'rk_wing', name: '오른쪽 윙 배치', icon: '🏃', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } },
      { id: 'rk_calm', name: '느긋한 리더십', icon: '😌', desc: '초당 체력 +0.3', mods: { regen: 0.3 } }
    ] },
    pep: { name: '뻽 감독', tag: '티키타카 설계자, 대머리 교수', look: { hair: '#e8c0a0', suit: '#1a1a1a' }, cards: [
      { id: 'pep_tiki', name: '티키타카', icon: '🔁', desc: '동료 쿨타임 -12%', mods: { teamCd: -0.12 } },
      { id: 'pep_false9', name: '가짜 9번', icon: '9️⃣', desc: '공격력 +10%', mods: { dmg: 0.10 } },
      { id: 'pep_press', name: '6초 압박', icon: '⏱️', desc: '쿨타임 -6%', mods: { cd: -0.06 } }
    ] },
    tito: { name: '티토 감독', tag: '91골 시즌의 조력자', look: { hair: '#3a3a3a', suit: '#24304a' }, cards: [
      { id: 'tito_91', name: '91골의 해', icon: '🔥', desc: '치명타 확률 +6%', mods: { crit: 0.06 } },
      { id: 'tito_heart', name: '뜨거운 심장', icon: '❤️', desc: '최대 체력 +20', mods: { hp: 20 } },
      { id: 'tito_pass', name: '패스 길 열기', icon: '↔️', desc: '공격 범위 +8%', mods: { area: 0.08 } }
    ] },
    tata: { name: '타타 감독', tag: '아르헨 동향 감독', look: { hair: '#5a5a5a', suit: '#2a2a2a' }, cards: [
      { id: 'tata_link', name: '아르헨 연결고리', icon: '🔗', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'tata_sun', name: '마이애미 햇살', icon: '🌴', desc: '초당 체력 +0.4', mods: { regen: 0.4 } },
      { id: 'tata_cup', name: '컵 결승 집중', icon: '🏆', desc: '보스에게 주는 피해 +12%', mods: { bossDmg: 0.12 } }
    ] },
    luis: { name: '엔리꿰 감독', tag: 'MSN 트레블', look: { hair: '#2a2a2a', suit: '#1e1e2e' }, cards: [
      { id: 'lu_msn', name: 'MSN 삼각편대', icon: '🔺', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'lu_counter', name: '직선 역습', icon: '⚡', desc: '투사체 속도 +12%', mods: { projSpeed: 0.12 } },
      { id: 'lu_treble', name: '트레블 정신', icon: '3️⃣', desc: '공격력 +10%', mods: { dmg: 0.10 } }
    ] },
    valverde: { name: '발베르떼 감독', tag: '실리의 개미', look: { hair: '#6a6a6a', suit: '#222' }, cards: [
      { id: 'va_442', name: '실리 4-4-2', icon: '🧱', desc: '받는 피해 -1', mods: { armor: 1 } },
      { id: 'va_600', name: '600골 기념', icon: '🎉', desc: '공격력 +8%', mods: { dmg: 0.08 } },
      { id: 'va_captain', name: '주장 완장', icon: '©️', desc: '최대 체력 +15, 경험치 +5%', mods: { hp: 15, xp: 0.05 } }
    ] },
    koeman: { name: '쿠망 감독', tag: '대포알 슛의 전설', look: { hair: '#d9c9a0', suit: '#2a2a3a' }, cards: [
      { id: 'ko_fax', name: '뷔로팩스', icon: '📠', desc: '코인 획득 +20%', mods: { gold: 0.20 } },
      { id: 'ko_young', name: '유스 발탁', icon: '🌱', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'ko_cannon', name: '대포알 슛', icon: '💣', desc: '투사체 속도 +10%, 공격력 +5%', mods: { projSpeed: 0.10, dmg: 0.05 } }
    ] },
    poch: { name: '포체띠노 감독', tag: '파리의 별 관리자', look: { hair: '#3a3a3a', suit: '#1b2a5a' }, cards: [
      { id: 'po_eiffel', name: '에펠탑 야경', icon: '🗼', desc: '공격 범위 +10%', mods: { area: 0.10 } },
      { id: 'po_stars', name: '별들의 팀', icon: '⭐', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'po_press', name: '전방 압박', icon: '🔥', desc: '쿨타임 -5%', mods: { cd: -0.05 } }
    ] },
    scaloni: { name: '스깔로니 감독', tag: '월드컵 사령탑', look: { hair: '#2a2a2a', suit: '#75aadb' }, cards: [
      { id: 'sc_family', name: '가족 같은 팀', icon: '👨‍👩‍👦', desc: '동료 쿨타임 -10%, 최대 체력 +10', mods: { teamCd: -0.10, hp: 10 } },
      { id: 'sc_cup', name: '월드컵 정신', icon: '🏆', desc: '보스에게 주는 피해 +15%', mods: { bossDmg: 0.15 } },
      { id: 'sc_calm', name: '침착한 결승', icon: '🧊', desc: '받는 피해 -1', mods: { armor: 1 } }
    ] },
    mascherano: { name: '마스께라노 감독', tag: '투지의 작은 대장', look: { hair: '#1a1a1a', suit: '#f7b5cd' }, cards: [
      { id: 'mc_fight', name: '투지', icon: '💢', desc: '공격력 +8%', mods: { dmg: 0.08 } },
      { id: 'mc_lead', name: '동료 리더십', icon: '🗣️', desc: '동료 공격력 +10%', mods: { teamDmg: 0.10 } },
      { id: 'mc_shield', name: '서포터스 실드', icon: '🛡️', desc: '최대 체력 +20', mods: { hp: 20 } }
    ] },
    // ---- 토레쓰 career coaches (round 11; 첼씨 also had 안첼로띠 and 무링요: eyebrow, special)
    aragones: { name: '아라고네쓰 감독', tag: '현자, 엘 니뇨를 1군에 올린 스승', look: { hair: '#d8d8d8', suit: '#2a2a3a' }, cards: [
      { id: 'ar_nino', name: '엘 니뇨 데뷔', icon: '👦', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'ar_pass', name: '짧은 패스 축구', icon: '↔️', desc: '쿨타임 -6%', mods: { cd: -0.06 } },
      { id: 'ar_pride', name: '줄무늬의 자존심', icon: '❤️', desc: '최대 체력 +15', mods: { hp: 15 } }
    ] },
    benitez: { name: '베니떼쓰 감독', tag: '전술 노트의 라파', look: { hair: '#3a3a3a', suit: '#1a1a2a' }, cards: [
      { id: 'rb_zonal', name: '지역 방어', icon: '🧱', desc: '받는 피해 -1', mods: { armor: 1 } },
      { id: 'rb_rot', name: '로테이션', icon: '🔄', desc: '동료 쿨타임 -10%', mods: { teamCd: -0.10 } },
      { id: 'rb_notes', name: '전술 노트', icon: '📒', desc: '보스에게 주는 피해 +12%', mods: { bossDmg: 0.12 } }
    ] },
    dimatteo: { name: '디마떼오 감독', tag: '대행 감독, 뮌헨의 기적', look: { hair: '#2a2a2a', suit: '#1a2a5a' }, cards: [
      { id: 'dm_bus', name: '두 줄 수비', icon: '🚌', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
      { id: 'dm_run', name: '단독 역습', icon: '⚡', desc: '이동속도 +7%', mods: { moveSpeed: 0.07 } },
      { id: 'dm_munich', name: '뮌헨의 기적', icon: '🏆', desc: '보스에게 주는 피해 +15%', mods: { bossDmg: 0.15 } }
    ] },
    // 리버풀 잔류 path (round 14)
    kenny: { name: '킹 케니 감독', tag: '안필드의 왕이 돌아왔다', look: { hair: '#d0d0d0', suit: '#8a1020' }, cards: [
      { id: 'kk_pass', name: '패스 앤 무브', icon: '🔁', desc: '쿨타임 -7%', mods: { cd: -0.07 } },
      { id: 'kk_kop', name: '콥의 함성', icon: '📣', desc: '최대 체력 +15, 초당 체력 +0.2', mods: { hp: 15, regen: 0.2 } },
      { id: 'kk_nine', name: '안필드의 9번', icon: '9️⃣', desc: '공격력 +8%', mods: { dmg: 0.08 } }
    ] },
    rodgers: { name: '로저쓰 감독', tag: '봉투 세 개의 철학자', look: { hair: '#4a3a2a', suit: '#2a2a3a' }, cards: [
      { id: 'br_env', name: '봉투 세 개', icon: '✉️', desc: '경험치 +10%, 코인 획득 +10%', mods: { xp: 0.1, gold: 0.1 } },
      { id: 'br_sas', name: 'SAS 투톱', icon: '⚡', desc: '동료 공격력 +20%', mods: { teamDmg: 0.2 } },
      { id: 'br_press', name: '전방 압박', icon: '🔥', desc: '이동속도 +5%, 치명타 +4%', mods: { moveSpeed: 0.05, crit: 0.04 } }
    ] },
    simeone: { name: '씨메오네 감독', tag: '검은 정장의 촐로', look: { hair: '#111111', suit: '#111111' }, cards: [
      { id: 'si_one', name: '한 경기씩', icon: '☝️', desc: '공격력 +10%', mods: { dmg: 0.10 } },
      { id: 'si_press', name: '강도 높은 압박', icon: '🔥', desc: '쿨타임 -6%, 이동속도 +4%', mods: { cd: -0.06, moveSpeed: 0.04 } },
      { id: 'si_wall', name: '줄무늬 철벽', icon: '🛡️', desc: '최대 체력 +20', mods: { hp: 20 } }
    ] },
    tosu: { name: '도스 감독', tag: '마지막 시즌의 사령탑', look: { hair: '#2a2a2a', suit: '#1c2c5b' }, cards: [
      { id: 'to_last', name: '마지막 시즌', icon: '🌅', desc: '공격력 +12%', mods: { dmg: 0.12 } },
      { id: 'to_fans', name: '사가의 환영', icon: '🎌', desc: '코인 획득 +20%', mods: { gold: 0.20 } },
      { id: 'to_legend', name: '레전드의 품격', icon: '👑', desc: '치명타 확률 +6%', mods: { crit: 0.06 } }
    ] }
  };

  // Extra coach cards that can appear in any coach pick.
  RS.COACH_EXTRA = {
    recruit: { id: 'recruit', name: '동료 영입', icon: '🤝', desc: '지금 이 팀의 동료 1명이 합류한다 (강화 +1~+10 랜덤).' },
    train: { id: 'train', name: '동료 특훈', icon: '📈', desc: '모든 동료 강화 +1' }
  };

  // ---------------------------------------------------------------- Teammates (parody nicknames)
  // role: defender | keeper | winger | mid | striker — one job each, shown with its icon on the card and above the
  // player on the pitch. {hero} = the playing hero's short name (RS.mateLine).
  RS.ROLES = {
    defender: { name: '수비수', icon: '🛡️', desc: '{hero} 주위를 돌며 다가오는 적을 밀쳐낸다' },
    keeper: { name: '골키퍼', icon: '🧤', desc: '날아오는 빨간 공격을 몇 초마다 1번 막아낸다' },
    winger: { name: '윙어', icon: '⚡', desc: '적 무리를 일직선으로 뚫고 지나가며 때린다' },
    // 메시 never shoots: his midfielders' passes end in a dribble that scatters the defenders around him
    mid: { name: '미드필더', icon: '🎯', desc: '{hero}에게 패스 → {hero}가 강슛으로 마무리', descMessi: '{hero}에게 패스 → {hero}가 드리블로 주변 적을 휘젓는다' },
    striker: { name: '공격수', icon: '⚽', desc: '가까운 적에게 직접 슛을 쏜다' }
  };
  // name: a twisted spelling that still reads as the player at a glance. ovr: overall rating (RS.MATE_TIERS).
  // era: the hero's club (season era) he plays for; yrs: [first, last] season (RS.YEARS year) he was the hero's
  // teammate there — only these are signed in a season (RS.mateCandidates), so nobody turns up years early.
  // same: the same person at another club — never two of him in one squad (RS.samePerson). special: a reward only
  // (never signed in a season).
  RS.TEAMMATES = {
    pepperoni: { name: '페페로니', ovr: 85, role: 'defender', era: 'madrid', yrs: [2009, 2017], hair: '#1a1a1a', skin: '#c99a73' },
    gingerscorp: { name: '폴 스콜쓰', ovr: 88, role: 'mid', era: 'manchester', yrs: [2003, 2008], hair: '#d0702a', skin: '#f1c9a5' },
    looneytoon: { name: '루니툰', ovr: 89, role: 'striker', era: 'manchester', yrs: [2004, 2008], hair: '#6a4a2a', skin: '#f1c9a5' },
    tumblenano: { name: '나니뇨', ovr: 80, role: 'winger', era: 'manchester', yrs: [2007, 2008], hair: '#1a1a1a', skin: '#a8714a' },
    saintcasi: { name: '카시야쓰', ovr: 90, role: 'keeper', era: 'madrid', yrs: [2009, 2015], hair: '#2a1a10', skin: '#e8b892' },
    ramong: { name: '라몬스', ovr: 90, role: 'defender', era: 'madrid', yrs: [2009, 2017], hair: '#3a2a1a', skin: '#e0ac84' },
    ozilly: { name: '외질리', ovr: 87, role: 'mid', era: 'madrid', yrs: [2010, 2013], hair: '#111111', skin: '#e3b48c' },
    benjamin: { name: '벤제마왕', ovr: 90, role: 'striker', era: 'madrid', yrs: [2009, 2017], hair: '#151515', skin: '#c8956a' },
    modric: { name: '모드리찌', ovr: 92, role: 'mid', era: 'madrid', yrs: [2012, 2017], hair: '#c9a46a', skin: '#f0c8a2' },
    marcel: { name: '마르쎌루', ovr: 87, role: 'winger', era: 'madrid', yrs: [2009, 2017], hair: '#2a1a10', skin: '#8a5a3a' },
    golfbale: { name: '골프왕 베일리', ovr: 88, role: 'winger', era: 'madrid', yrs: [2013, 2017], hair: '#3a2a1a', skin: '#f1c9a5' },
    buffonne: { name: '부퐁', ovr: 92, role: 'keeper', era: 'turin', yrs: [2019, 2020], hair: '#5a4a3a', skin: '#e8b892' },
    maskchiello: { name: '끼엘리니', ovr: 88, role: 'defender', era: 'turin', yrs: [2018, 2020], hair: '#3a3a3a', skin: '#e0ac84' },
    vdsar: { name: '판데르싸르', ovr: 87, role: 'keeper', era: 'manchester', yrs: [2005, 2008], hair: '#c9a46a', skin: '#f1c9a5' },
    rioferd: { name: '리오 퍼디난도', ovr: 88, role: 'defender', era: 'manchester', yrs: [2003, 2008], hair: '#111111', skin: '#8a5a3a' },
    brunofk: { name: '브루노 페르난데쓰', ovr: 86, role: 'mid', era: 'manchester2', yrs: [2021, 2022], hair: '#3a2a1a', skin: '#e3b48c' },
    sadiomane: { name: '사디오 마녜', ovr: 86, role: 'winger', era: 'riyadh', yrs: [2023, 2025], hair: '#111111', skin: '#5a3a26' },
    talis: { name: '탈리스까', ovr: 79, role: 'striker', era: 'riyadh', yrs: [2023, 2024], hair: '#1a1a1a', skin: '#a8714a' },
    bernardo: { name: '베르나르두 씰바', ovr: 87, role: 'mid', era: 'national', yrs: [2026, 2026], hair: '#3a2a1a', skin: '#e3b48c' },
    quaresmo: { name: '콰레스망', ovr: 79, role: 'winger', era: 'lisbon', yrs: [2002, 2002], hair: '#111111', skin: '#a8714a' },
    hugovia: { name: '위고 비아냐', ovr: 74, role: 'mid', era: 'lisbon', yrs: [2002, 2002], hair: '#3a2a1a', skin: '#e3b48c' },
    lisbongk: { name: '사자굴 수문장', ovr: 72, role: 'keeper', era: 'lisbon', yrs: [2002, 2002], hair: '#1a1a1a', skin: '#c99a73' },
    parkji: { name: '박지썽', ovr: 83, role: 'winger', era: 'manchester', yrs: [2005, 2008], hair: '#111111', skin: '#e8c09a' },
    dybalino: { name: '디발리노', ovr: 86, role: 'striker', era: 'turin', yrs: [2018, 2020], hair: '#2a1a10', skin: '#e8b892' },
    pjanic: { name: '퍄니찌', ovr: 84, role: 'mid', era: 'turin', yrs: [2018, 2020], hair: '#1a1a1a', skin: '#e0ac84' },
    cuadrado: { name: '콰드라또', ovr: 82, role: 'winger', era: 'turin', yrs: [2018, 2020], hair: '#111111', skin: '#7a4a2a' },
    rashy: { name: '래쉬포드', ovr: 83, role: 'winger', era: 'manchester2', yrs: [2021, 2022], hair: '#111111', skin: '#6a4430' },
    degea: { name: '데헤아노', ovr: 88, role: 'keeper', era: 'manchester2', yrs: [2021, 2022], hair: '#2a1a10', skin: '#e8b892' },
    varanne: { name: '바란느', ovr: 87, role: 'defender', era: 'manchester2', yrs: [2021, 2022], hair: '#111111', skin: '#9a6a48' },
    brozo: { name: '브로조비찌', ovr: 82, role: 'mid', era: 'riyadh', yrs: [2023, 2025], hair: '#c9a46a', skin: '#f0c8a2' },
    laporto: { name: '라포르뜨', ovr: 84, role: 'defender', era: 'riyadh', yrs: [2023, 2025], hair: '#1a1a1a', skin: '#e0ac84' },
    bentoz: { name: '벤뚜', ovr: 78, role: 'keeper', era: 'riyadh', yrs: [2024, 2025], hair: '#111111', skin: '#9a6a48' },
    dias: { name: '후벵 디아쓰', ovr: 88, role: 'defender', era: 'national', yrs: [2026, 2026], hair: '#111111', skin: '#c99a73' },
    brunopt: { name: '비티냥', ovr: 86, role: 'mid', era: 'national', yrs: [2026, 2026], hair: '#1a1a1a', skin: '#e0ac84' },
    leaozinho: { name: '라파엘 레옹', ovr: 85, role: 'striker', era: 'national', yrs: [2026, 2026], hair: '#111111', skin: '#6a4430' },
    // ---- 메시 career teammates (youth first)
    alleypal: { name: '골목 단짝', ovr: 60, role: 'mid', era: 'rosario', yrs: [1995, 1998], hair: '#2a1a10', skin: '#e8b892' },
    tinykeeper: { name: '87년생 꼬마 골키퍼', ovr: 58, role: 'keeper', era: 'rosario', yrs: [1995, 1998], hair: '#1a1a1a', skin: '#e0ac84' },
    alleyback: { name: '골목대장 수비수', ovr: 59, role: 'defender', era: 'rosario', yrs: [1995, 1998], hair: '#3a2a1a', skin: '#c99a73' },
    cescino: { name: '꼬마 쎄스크', ovr: 70, role: 'mid', era: 'masia', yrs: [2001, 2001], hair: '#2a1a10', skin: '#e8b892' },
    piquechu: { name: '꼬마 피케츄', ovr: 69, role: 'defender', era: 'masia', yrs: [2001, 2001], hair: '#3a2a1a', skin: '#f0c8a2' },
    youthcap: { name: '유스 주장 바스께스', ovr: 66, role: 'striker', era: 'masia', yrs: [2001, 2001], hair: '#1a1a1a', skin: '#e0ac84' },
    dingyo: { name: '호나우딩요', ovr: 91, role: 'winger', era: 'barcelona', yrs: [2004, 2007], hair: '#111111', skin: '#8a5a3a', style: 'long' }, // style: fixed haircut
    iniestar: { name: '니에미스타', ovr: 92, role: 'mid', era: 'barcelona', yrs: [2004, 2018], hair: '#3a3a3a', skin: '#f0c8a2', style: 'bald' },
    xavino: { name: '챠비', ovr: 92, role: 'mid', era: 'barcelona', yrs: [2004, 2015], hair: '#2a1a10', skin: '#e8b892', style: 'short' },
    puyolion: { name: '뿌욜', ovr: 88, role: 'defender', era: 'barcelona', yrs: [2004, 2014], hair: '#4a3020', skin: '#e0ac84', style: 'long' },
    valdes: { name: '발데쓰', ovr: 84, role: 'keeper', era: 'barcelona', yrs: [2004, 2014], hair: '#1a1a1a', skin: '#e8b892' },
    alvesrun: { name: '다니 알베쓰', ovr: 87, role: 'winger', era: 'barcelona', yrs: [2008, 2016], hair: '#111111', skin: '#9a6a48' },
    suarezbite: { name: '수아레즈', ovr: 91, role: 'striker', era: 'barcelona', yrs: [2015, 2020], hair: '#1a1a1a', skin: '#e0ac84' },
    neytrick: { name: '네이마루', ovr: 90, role: 'winger', era: 'barcelona', yrs: [2013, 2017], hair: '#2a1a10', skin: '#c8956a' },
    etoocheetah: { name: '에뚜', ovr: 88, role: 'striker', era: 'barcelona', yrs: [2004, 2009], hair: '#111111', skin: '#5a3a26' },
    busquetsorch: { name: '부스께츠', ovr: 87, role: 'mid', era: 'barcelona', yrs: [2008, 2020], hair: '#1a1a1a', skin: '#e3b48c' },
    stegenwall: { name: '테어슈테건', ovr: 88, role: 'keeper', era: 'barcelona', yrs: [2015, 2020], hair: '#c9a46a', skin: '#f1c9a5' },
    mbaflash: { name: '음바뻬', ovr: 91, role: 'striker', era: 'paris', yrs: [2021, 2023], hair: '#111111', skin: '#8a5a3a' },
    donnarum: { name: '돈나룸바', ovr: 87, role: 'keeper', era: 'paris', yrs: [2021, 2023], hair: '#3a2a1a', skin: '#e8b892' },
    verratino: { name: '베라띠', ovr: 86, role: 'mid', era: 'paris', yrs: [2021, 2023], hair: '#1a1a1a', skin: '#e3b48c' },
    hakimiwing: { name: '하킴이', ovr: 85, role: 'winger', era: 'paris', yrs: [2021, 2023], hair: '#111111', skin: '#a8714a' },
    albamiami: { name: '조르디 알바생', ovr: 80, role: 'defender', era: 'miami', yrs: [2023, 2025], hair: '#1a1a1a', skin: '#e0ac84' },
    busquetsmia: { name: '마이애미 부스께츠', ovr: 80, role: 'mid', era: 'miami', yrs: [2023, 2025], hair: '#1a1a1a', skin: '#e3b48c', same: 'busquetsorch' },
    suarezmia: { name: '마이애미 수아레즈', ovr: 82, role: 'striker', era: 'miami', yrs: [2024, 2025], hair: '#1a1a1a', skin: '#e0ac84', same: 'suarezbite' },
    dibugk: { name: '디부 마르띠', ovr: 86, role: 'keeper', era: 'argentina', yrs: [2022, 2026], hair: '#1a1a1a', skin: '#e0ac84' },
    dimariangel: { name: '디마리오', ovr: 87, role: 'winger', era: 'argentina', yrs: [2022, 2024], hair: '#3a2a1a', skin: '#e8b892' },
    julianfin: { name: '훌리안 알바레쓰', ovr: 85, role: 'striker', era: 'argentina', yrs: [2022, 2026], hair: '#2a1a10', skin: '#f0c8a2' },
    otamendiwall: { name: '오따멘디', ovr: 82, role: 'defender', era: 'argentina', yrs: [2022, 2026], hair: '#1a1a1a', skin: '#e0ac84' },
    enzomid: { name: '엔쪼', ovr: 84, role: 'mid', era: 'argentina', yrs: [2022, 2026], hair: '#1a1a1a', skin: '#e8b892' },
    // ---- 토레쓰 career teammates (round 11)
    atlkeeper: { name: '줄무늬단 수문장', ovr: 74, role: 'keeper', era: 'atletico', yrs: [2001, 2004], hair: '#1a1a1a', skin: '#e0ac84' },
    atlmate: { name: '유스 동기 미드필더', ovr: 72, role: 'mid', era: 'atletico', yrs: [2001, 2004], hair: '#3a2a1a', skin: '#e8b892' },
    atlback: { name: '2부 리그 센터백', ovr: 73, role: 'defender', era: 'atletico', yrs: [2001, 2003], hair: '#2a1a10', skin: '#c99a73' },
    gabi: { name: '가비', ovr: 79, role: 'mid', era: 'atletico', yrs: [2004, 2006], hair: '#2a1a10', skin: '#e0ac84' },
    ibagaza: { name: '이바가싸', ovr: 82, role: 'mid', era: 'atletico', yrs: [2004, 2006], hair: '#1a1a1a', skin: '#e8b892' },
    leofranco: { name: '레오 프랑꼬', ovr: 80, role: 'keeper', era: 'atletico', yrs: [2005, 2006], hair: '#3a2a1a', skin: '#e8b892' },
    pabloib: { name: '파블로 이바녜쓰', ovr: 80, role: 'defender', era: 'atletico', yrs: [2005, 2006], hair: '#1a1a1a', skin: '#e0ac84' },
    maxirod: { name: '막시 로드리게쓰', ovr: 81, role: 'winger', era: 'atletico', yrs: [2006, 2006], hair: '#2a1a10', skin: '#e3b48c' },
    aguerito: { name: '꾼 아게로', ovr: 84, role: 'striker', era: 'atletico', yrs: [2006, 2006], hair: '#1a1a1a', skin: '#c8956a' },
    // 제라두 (round 14): his joining the squad once unlocks the 제토라인 move for the career (RS.SKILLS.zeto). The
    // 리버풀 men stay through 2014 for the 잔류 path (RS.YEARS_TORRES_LFC; the 첼씨 path never asks for them)
    gerrardo: { name: '제라두', ovr: 90, role: 'mid', era: 'liverpool', yrs: [2007, 2014], hair: '#5a3a20', skin: '#f1c9a5' },
    carraga: { name: '캐라거', ovr: 85, role: 'defender', era: 'liverpool', yrs: [2007, 2013], hair: '#3a2a1a', skin: '#f1c9a5' },
    reinaa: { name: '레이냐', ovr: 87, role: 'keeper', era: 'liverpool', yrs: [2007, 2013], hair: '#1a1a1a', skin: '#e0ac84' },
    xabialon: { name: '사비 알론쏘', ovr: 87, role: 'mid', era: 'liverpool', yrs: [2007, 2009], hair: '#3a2a1a', skin: '#e3b48c' },
    maschera: { name: '마스께라노', ovr: 85, role: 'mid', era: 'liverpool', yrs: [2007, 2010], hair: '#1a1a1a', skin: '#e0ac84' },
    kuyto: { name: '카위트', ovr: 82, role: 'winger', era: 'liverpool', yrs: [2007, 2012], hair: '#c9a46a', skin: '#f1c9a5' },
    hendo: { name: '헨더쓴', ovr: 81, role: 'mid', era: 'liverpool', yrs: [2011, 2014], hair: '#5a3a20', skin: '#f1c9a5' },
    skrtel: { name: '슈크르뗄', ovr: 83, role: 'defender', era: 'liverpool', yrs: [2011, 2014], hair: '#2a2a2a', skin: '#e8c8a8', style: 'bald' },
    mignolet: { name: '미뇰레', ovr: 82, role: 'keeper', era: 'liverpool', yrs: [2013, 2014], hair: '#3a2a1a', skin: '#f0c8a2' },
    sturridgy: { name: '스터리지', ovr: 85, role: 'striker', era: 'liverpool', yrs: [2013, 2014], hair: '#111111', skin: '#8a5a3a' },
    coutinho: { name: '쿠치뉴', ovr: 84, role: 'mid', era: 'liverpool', yrs: [2013, 2014], hair: '#2a1a10', skin: '#c99070' },
    drogbro: { name: '드록빠', ovr: 89, role: 'striker', era: 'chelseat', yrs: [2011, 2012], hair: '#111111', skin: '#5a3a26' },
    lampardo: { name: '람빠드', ovr: 88, role: 'mid', era: 'chelseat', yrs: [2011, 2014], hair: '#6a4a2a', skin: '#f1c9a5' },
    cechwall: { name: '쩨흐', ovr: 89, role: 'keeper', era: 'chelseat', yrs: [2011, 2014], hair: '#1a1a1a', skin: '#f0c8a2' },
    terrycap: { name: '존 테뤼', ovr: 87, role: 'defender', era: 'chelseat', yrs: [2011, 2014], hair: '#2a1a10', skin: '#f1c9a5' },
    dluiz: { name: '다비드 루이쓰', ovr: 84, role: 'defender', era: 'chelseat', yrs: [2011, 2014], hair: '#3a2a1a', skin: '#c8956a', style: 'long' },
    matamagic: { name: '후안 마따', ovr: 86, role: 'mid', era: 'chelseat', yrs: [2012, 2013], hair: '#1a1a1a', skin: '#e8b892' },
    hazardo: { name: '에당 아자흐', ovr: 88, role: 'winger', era: 'chelseat', yrs: [2013, 2014], hair: '#2a1a10', skin: '#e0ac84' },
    griezo: { name: '그리즈망', ovr: 89, role: 'striker', era: 'atletico2', yrs: [2015, 2018], hair: '#c9a46a', skin: '#f0c8a2' },
    oblako: { name: '오블라끄', ovr: 90, role: 'keeper', era: 'atletico2', yrs: [2015, 2018], hair: '#3a2a1a', skin: '#f1c9a5' },
    godinwall: { name: '고딘', ovr: 88, role: 'defender', era: 'atletico2', yrs: [2015, 2018], hair: '#1a1a1a', skin: '#e0ac84' },
    kokemid: { name: '코께', ovr: 86, role: 'mid', era: 'atletico2', yrs: [2015, 2018], hair: '#1a1a1a', skin: '#e8b892' },
    gabicap: { name: '주장 가비', ovr: 84, role: 'mid', era: 'atletico2', yrs: [2015, 2018], hair: '#2a1a10', skin: '#e0ac84', same: 'gabi' },
    saulino: { name: '사울', ovr: 84, role: 'mid', era: 'atletico2', yrs: [2016, 2018], hair: '#2a1a10', skin: '#e3b48c' },
    carrasko: { name: '카라스꼬', ovr: 83, role: 'winger', era: 'atletico2', yrs: [2016, 2017], hair: '#1a1a1a', skin: '#e8b892' },
    tosucap: { name: '도스 주장', ovr: 76, role: 'mid', era: 'tosu', yrs: [2019, 2019], hair: '#1a1a1a', skin: '#f0c8a2' },
    tosugk: { name: '도스 수문장', ovr: 75, role: 'keeper', era: 'tosu', yrs: [2019, 2019], hair: '#1a1a1a', skin: '#f0c8a2' },
    tosuwing: { name: '도스 윙어', ovr: 74, role: 'winger', era: 'tosu', yrs: [2019, 2019], hair: '#2a1a10', skin: '#f0c8a2' },
    // the 토레쓰 reward (RS.TORRES_REWARDS): he joins any career's squad
    torresmate: { name: '토레쓰', ovr: 90, role: 'striker', era: 'chelseat', special: true, hair: '#e0a84a', skin: '#f0c8a0', style: 'torres' }
  };

  // ---------------------------------------------------------------- Enemies
  // pace: fast = small, fragile and quick (speed streaks) · slow = big and heavy (slow stomping walk, no speed
  // ramp inside the stage). Unmarked = normal pace. Elites (1.5x size) also walk slowly.
  RS.ENEMIES = {
    grunt: { name: '수비수', hp: 8, speed: 40, dmg: 5, r: 6, xp: 1, sprite: 'grunt' },
    runner: { name: '태클러', hp: 5, speed: 70, dmg: 4, r: 5, xp: 1, sprite: 'runner', pace: 'fast' },
    tank: { name: '거구 센터백', hp: 48, speed: 18, dmg: 11, r: 10, xp: 5, sprite: 'tank', pace: 'slow' },
    ref: { name: '심판', hp: 18, speed: 32, dmg: 6, r: 6, xp: 2, sprite: 'ref', ranged: true },
    press: { name: '기자', hp: 9, speed: 95, dmg: 5, r: 5, xp: 1, sprite: 'press', line: true, pace: 'fast' },
    minimessi: { name: '꼬마 메시', hp: 30, speed: 70, dmg: 8, r: 5, xp: 2, sprite: 'minimessi', pace: 'fast' },
    miniron: { name: '꼬마 날두', hp: 32, speed: 64, dmg: 8, r: 5, xp: 2, sprite: 'miniron', pace: 'fast' },
    // mini-bosses (준보스): big and slow, drawn at 1.5x with an HP bar, telegraphed charge / slam, chest drops
    brute: { name: '거구 주장', hp: 150, speed: 20, dmg: 13, r: 13, xp: 16, sprite: 'tank', mini: true, pace: 'slow', acts: ['charge', 'slam'] },
    enforcer: { name: '집행관 미드필더', hp: 95, speed: 30, dmg: 11, r: 10, xp: 12, sprite: 'grunt', mini: true, pace: 'slow', acts: ['charge', 'charge', 'slam'] },
    // 이빨괴물 수아레즈 (round 14): once beaten as the 2011 season boss of the 리버풀 잔류 path, he may run on again
    // as a quick 준보스 in any later season of that career (World.runScheduled 'mini', RS.SUAREZ.miniOdds)
    suarezmini: { name: '이빨괴물 수아레즈', hp: 130, speed: 52, dmg: 13, r: 9, xp: 18, sprite: 'bsuarez', mini: true, acts: ['charge', 'charge', 'slam'] }
  };
  RS.ELITE_SPEED = 0.75; // elites are 1.5x the size: they walk slower
  RS.BASE_MOVE = 78; // hero walking speed before bonuses (× the hero's moveMul)
  RS.FINAL_PACE = 1.2; // the final duel's patterns are tuned for a hero running at this × base speed (see World.recalc)
  RS.IFRAMES = 0.55; // seconds of invulnerability after a hit (crowds can hit at most this often)
  RS.HIT_GUARD_MAX = 3; // 오뚝이 정신: never more than this many seconds of it
  RS.MINI_TYPES = ['brute', 'enforcer'];
  // manual slide (슬라이딩 버튼): invulnerable dash with a gradient trail; cooldown per hero
  RS.SLIDE = { speed: 420, dur: 0.28, dmg: 12, cd: { ronaldo: 5, messi: 3, torres: 4 } }; // 메시: quicker feet, shorter cooldown

  // Season bosses — archetypes reused with parody names per year.
  // Each archetype has its own signature so fights feel different:
  // keeper = dives (slams) + a defensive wall + one big punt · tackler = pure melee dashes · maestro = ball patterns
  // striker = sniper shots + bursts · referee = cards + summons · giant = ground slams + rings
  RS.BOSS_TYPES = {
    keeper: { hp: 520, fight: 1, speed: 30, r: 14, dmg: 14, actions: ['pslam', 'wall', 'punt', 'pslam', 'ring'], cool: 2.0, sprite: 'bkeeper', sig: '다이빙 선방·수비벽·펀트킥' },
    tackler: { hp: 440, fight: 1, speed: 40, r: 12, dmg: 16, actions: ['cut', 'dash', 'slam', 'cut', 'dash'], cool: 1.6, sprite: 'btackler', sig: '연속 태클 돌진' },
    maestro: { hp: 420, fight: 1, speed: 34, r: 12, dmg: 12, actions: ['fan', 'encircle', 'curl', 'fan', 'ring'], cool: 1.9, sprite: 'bmaestro', sig: '패스 패턴·포위' },
    striker: { hp: 420, fight: 1, speed: 42, r: 12, dmg: 12, actions: ['snipe', 'burst', 'dash', 'snipe', 'burst'], cool: 1.8, sprite: 'bstriker', sig: '강슛 저격·연사' },
    referee: { hp: 400, fight: 1, speed: 36, r: 12, dmg: 10, actions: ['cards', 'pslam', 'summon', 'cards', 'wall'], cool: 1.9, sprite: 'bref', sig: '카드 세례·소환' },
    giant: { hp: 640, fight: 1.15, speed: 25, r: 18, dmg: 18, actions: ['pslam', 'ring', 'slam', 'wall', 'pslam'], cool: 2.0, sprite: 'bgiant', sig: '지면 강타·링' },
    // 드록빠 (첼씨): the toughest season boss — cannon shots, a shoulder charge, a header slam and the 버스 wall,
    // with less rest between them and a longer fight
    drogba: { hp: 600, fight: 1.35, speed: 46, r: 13, dmg: 19, actions: ['snipe', 'dash', 'pslam', 'wall', 'burst', 'dash', 'snipe'], cool: 1.35, sprite: 'bdrogba', sig: '대포알 슛·몸싸움 돌진·헤더 강타·버스 수비' },
    messi: { hp: 700, fight: 1.4, speed: 70, r: 9, dmg: 18, actions: [], cool: 1.25, sprite: 'messi', sig: '드리블·감아차기·발리' }, // the final: a long duel
    ronaldo: { hp: 720, fight: 1.4, speed: 62, r: 10, dmg: 18, actions: [], cool: 1.25, sprite: 'ronaldo', sig: '무회전·헤딩 강타·SIUU' }, // 메시 career final
    // round 11: the special boss who runs on after 드록빠 (RS.TORRES) — runs in behind, chips and strikes quickly
    torres: { hp: 560, fight: 1, speed: 56, r: 10, dmg: 16, actions: ['dash', 'snipe', 'burst', 'dash', 'pslam'], cool: 1.4, sprite: 'btorres', sig: '단독 돌파·칩슛·속공' },
    // 이빨괴물 수아레즈 (round 14): the 2011 boss of the 리버풀 잔류 path — bites (quick dashes and cuts), a sniper
    // shot, and he calls the crowd in; beaten once, he comes back as a 준보스 (RS.ENEMIES.suarezmini)
    suarez: { hp: 520, fight: 1.15, speed: 60, r: 11, dmg: 17, actions: ['dash', 'cut', 'snipe', 'dash', 'cut', 'summon'], cool: 1.4, sprite: 'bsuarez', sig: '물어뜯기 돌진·연속 태클·동료 소환' }
  };
  RS.SUAREZ = { miniOdds: 0.35 }; // chance a 준보스 wave of a later season brings him, once beaten (build.flags.suarez)
  // 토레쓰 (round 11): when 드록빠 falls the season is already cleared, and 토레쓰 runs on at once for `window`
  // seconds. Beating him is optional: it gives one pick of RS.TORRES_REWARDS (career.js) and unlocks his career
  // (RS.HEROES.torres, meta.unlocked.torres); the window closing or the hero going down just ends the clear.
  // secs: share of the window his HP is set to (from the damage that really lands, like the 클라시코 rival).
  RS.TORRES = { window: 30, secs: 0.5, name: '페르난도 토레쓰' };
  // Final bosses: phase 1 → roar at 50 % HP → phase 2 rage (two action lists per boss).
  RS.FINAL = {
    messi: {
      phase1: ['dribble', 'curl', 'volley', 'snipe', 'encircle'],
      phase2: ['dribble3', 'curl', 'volley2', 'encircle', 'snipe', 'summon'],
      rageCool: 0.62, rageSpeed: 1.3, rageText: '메시 분노! 2페이즈', ball: 'mball', minion: 'minimessi'
    },
    ronaldo: {
      phase1: ['dash', 'snipe', 'pslam', 'burst', 'wall'],
      phase2: ['dash', 'burst', 'pslam', 'snipe', 'ring', 'summon'],
      rageCool: 0.65, rageSpeed: 1.25, rageText: 'SIUU! 날두 2페이즈', ball: 'ball', minion: 'miniron'
    }
  };
  RS.MESSI = RS.FINAL.messi;

  // Boss HP: base HP for the year; after BOSS_CALIBRATE_AT seconds of fighting the boss is topped up so the
  // player's measured damage rate on it gives roughly BOSS_FIGHT_SECONDS × fight (see World.calibrateBoss).
  // Bosses are stun-immune.
  // one-minute stages: the season boss is a short, sharp fight. Round 12: 22 → 25 — aimed only at men on screen, the
  // shots no longer drift off to the crowd once he is measured: R11's own builds fought 2-3 s shorter at 22; at 25 their
  // 2005-10 bosses last 21-34 s as on R11 (22-32 s), and the guard careers' median fight is 24 s
  RS.BOSS_FIGHT_SECONDS = 25;
  RS.BOSS_CALIBRATE_AT = [2, 6, 12, 20, 30]; // seconds after the boss first takes damage
  RS.bossHp = (bt, tune) => Math.round(bt.hp * tune.bossHpMul);
  RS.keeperRadius = (lv) => 20 + 3 * Math.min(lv, 5); // the save zone stops growing at Lv.5 (damage does not)
  // 'Weaker bot' used by balance tests: reacts 0.12 s late with up to ±0.3 rad steering noise.
  RS.WEAK_BOT = { delay: 0.12, noise: 0.3 };

  // ---------------------------------------------------------------- Career years (debut at 17 → present)
  // Facts are kept to well-known headlines. Ballon: true = a real Ballon d'Or year, grants a 발롱도르 on first clear.
  // story: one line that ties the season boss to that year of the career (shown on the year intro).
  // trial: 1–3 = one of the hardest seasons of that life (고난의 시즌): tougher by RS.TRIAL per level, graded by how
  // hard that year really was. foe: a named opponent (RS.FOES). twist: that season's own pressure — mix (extra
  // enemy types), press (extra 기자단 waves), wall (a formation of heavy defenders, banner text), extra (seconds of
  // 연장전 before the boss).
  const Y = (year, era, coach, title, bossType, bossName, story, extra) =>
    Object.assign({ year, era, coach, title, boss: { type: bossType, name: bossName }, story }, extra || {});
  RS.YEARS = [
    Y(2002, 'lisbon', 'boloni', '17세 프로 데뷔', 'keeper', '데뷔전 상대 수문장', '리스본에서 17세에 데뷔. 첫 프로 경기, 상대 골문엔 베테랑 수문장이 버티고 있다.'),
    Y(2003, 'manchester', 'hairdryer', '맨체스터 이적, 등번호 7', 'tackler', '프리미어 백태클러', '맨체스터로 이적해 7번을 받았다. 프리미어리그의 거친 백태클이 신인을 노린다.'),
    Y(2004, 'manchester', 'hairdryer', '유로 2004 준우승', 'giant', '그리스 철벽 대장', '열아홉 살, 안방 유로 결승에서 그리스의 철벽 수비에 막혀 눈물을 쏟았다. 그 벽을 다시 만난다.',
      { trial: 2, twist: { mix: [{ type: 'tank', w: 2.5 }], wall: '🧱 그리스 철벽 수비가 밀고 온다!' } }),
    Y(2005, 'manchester', 'hairdryer', '드리블 장인 각성, 첼씨의 시대', 'maestro', '첼씨 지휘자 람빠드', '드리블 장인으로 각성했지만 리그 왕좌는 버스 수비의 첼씨 차지였다. 파란 군단의 중원 지휘자 람빠드가 길을 막는다.', { foe: 'chelsea', trial: 1 }),
    Y(2006, 'manchester', 'hairdryer', '월드컵과 윙크 논란', 'referee', '레드카드 주심', '월드컵 8강, 팀 동료의 퇴장과 윙크 논란으로 잉글랜드 전체의 야유를 받았다. 카드를 꺼내 드는 주심이 상대다.', { trial: 1, twist: { press: 1 }, press: 'wink' }),
    Y(2007, 'manchester', 'hairdryer', '첫 리그 정상, FA컵 결승의 악몽', 'drogba', '드록빠', '첫 리그 우승. 하지만 새 웸블리 첫 FA컵 결승, 연장 막판 첼씨의 괴물 스트라이커 드록빠에게 결승골을 내줬다. 그 괴물이 다시 온다.', { foe: 'chelsea', trial: 2 }),
    Y(2008, 'manchester', 'hairdryer', '빗속의 유럽 정상, 첫 발롱도르', 'keeper', '첼씨 수문장 쩨흐', '모스크바 빗속 결승, 상대는 또 첼씨. 승부차기에서 실축하고도 끝내 웃었다. 첫 발롱도르의 해, 그날의 수문장 쩨흐를 넘어야 한다.', { ballon: true, foe: 'chelsea' }),
    Y(2009, 'madrid', 'engineer', '세계 최고 이적료로 마드리드행', 'maestro', '티키타카 지휘자 챠비', '세계 최고 이적료로 마드리드행. 라이벌 팀 티키타카의 심장 챠비와 첫 대결.', { press: 'unveil' }),
    Y(2010, 'madrid', 'special', '엘 클라시코 시대', 'tackler', '곱슬머리 수비대장 뿌욜', '엘 클라시코의 시대가 열렸다. 카탈루냐의 곱슬머리 수비대장 뿌욜과의 악연이 시작된다.'),
    Y(2011, 'madrid', 'special', '국왕컵 결승 헤더', 'giant', '바르샤 장신 피케츄', '국왕컵 결승 결승골 헤더. 바르샤의 장신 센터백을 뛰어넘은 그 밤.'),
    Y(2012, 'madrid', 'special', '리그 우승, 진정해 세리머니', 'referee', '엘 클라시코 주심', '리그 우승과 "진정해" 세리머니. 클라시코마다 카드를 꺼내던 주심이 상대다.'),
    Y(2013, 'madrid', 'eyebrow', '두 번째 발롱도르', 'striker', '스웨덴 거인 즐라탄탄', '월드컵 플레이오프 해트트릭으로 스웨덴 거인을 꺾고 두 번째 발롱도르.', { ballon: true }),
    Y(2014, 'madrid', 'eyebrow', '열 번째 유럽 정상', 'keeper', '이웃집 수문장 꾸르뚜아', '리스본 결승, 열 번째 유럽 정상. 같은 도시 라이벌의 수문장 꾸르뚜아가 마지막 벽.', { ballon: true }),
    Y(2015, 'madrid', 'eyebrow', '득점 기계 모드', 'maestro', '뮌헨 전차 지휘관', '득점 기계의 해. 유럽 무대에서 뮌헨 전차 군단의 지휘관과 격돌.'),
    Y(2016, 'madrid', 'headbutt', '유로 우승, 나방과의 결승', 'giant', '파리 결승의 나방 군단장', '유로 결승, 부상으로 쓰러진 뒤 벤치에서 지휘한 우승. 나방 떼가 날아들던 파리의 밤.', { ballon: true }),
    Y(2017, 'madrid', 'headbutt', '유럽 2연패, 다섯 번째 발롱도르', 'striker', '카디프 결승 저격수', '카디프 결승 두 골로 유럽 2연패. 다섯 번째 발롱도르.', { ballon: true, press: 'tax_ronaldo' }),
    Y(2018, 'turin', 'allegro', '전설의 바이시클 킥, 토리노행', 'keeper', '바이시클 킥의 증인 부퐁', '토리노 원정에서 바이시클 킥, 상대 팬까지 기립했다. 그 골을 내준 수문장 부퐁이 다시 골문을 지킨다. 그리고 그 여름, 토리노로 이적.'),
    Y(2019, 'turin', 'smoker', '네이션스리그 초대 우승', 'tackler', '아약스 영건 대장', '네이션스리그 초대 우승. 유럽 무대에서 암스테르담 영건 군단에 발목을 잡혔다.'),
    Y(2020, 'turin', 'maestro', '텅 빈 경기장', 'referee', 'VAR 판독관', '관중 없는 시즌. 골을 지우는 보이지 않는 심판, VAR 판독관과 싸운다.'),
    Y(2021, 'manchester2', 'babyface', '맨체스터 귀환', 'maestro', '시끄러운 이웃 지휘관', '12년 만의 맨체스터 귀환. 시끄러운 이웃 구단의 지휘관과 더비.', { press: 'cola' }),
    Y(2022, 'manchester2', 'professor', '폭로 인터뷰, 벤치의 월드컵', 'referee', '폭로 인터뷰 기자왕', '폭로 인터뷰로 구단과 결별하고, 다섯 번째 월드컵에선 벤치로 밀려 8강 탈락 뒤 눈물로 퇴장했다. 커리어 최악의 해, 기자왕과의 설전.',
      { trial: 3, twist: { press: 2 }, press: 'morgan' }),
    Y(2023, 'riyadh', 'desert', '사막의 별, 리야드행', 'striker', '사막 더비 에이스', '사막의 별이 되어 리야드행. 사막 더비의 에이스와 득점 경쟁.'),
    Y(2024, 'riyadh', 'desert', '통산 900골 돌파', 'keeper', '유로 2024 수문장', '통산 900골. 유로 2024 승부차기에서 실축을 막아낸 수문장과 재대결.'),
    Y(2025, 'riyadh', 'desert', '네이션스리그 두 번째 우승', 'maestro', '무적함대 지휘자', '네이션스리그 결승에서 무적함대를 꺾고 두 번째 우승.'),
    Y(2026, 'national', 'marti', '마지막 월드컵 — 최종 결전', 'messi', '메시', '마지막 월드컵. 20년을 함께 달려온 영원한 라이벌, 메시와의 최종 결전.', { final: true })
  ];
  // 메시 career: youth in 로사리오 (youth: true, they play like the debut year — see RS.tuneIdx), the growth-hormone
  // choice (= difficulty), 라 마시아, debut at 17 in 2004 with 딩요's tutoring → the last World Cup against 날두.
  // event: a story choice shown once before that season (RS.EVENTS).
  RS.YEARS_MESSI = [
    Y(1995, 'rosario', 'grandma', '로사리오의 꼬마', 'giant', '동네 형님 센터백', '할머니 손을 잡고 처음 나간 동네 경기. 덩치 큰 형들 틈에서도 공을 뺏기지 않는 꼬마가 있었다.', { youth: true }),
    Y(1998, 'rosario', 'machine', '성장호르몬 결핍 진단', 'tackler', '87년생 라이벌 수비대장', '열한 살, 키가 자라지 않는 병을 진단받았다. 매일 밤 주사를 맞을 것인가, 작은 몸 그대로 버틸 것인가.', { youth: true, event: 'hgh' }),
    Y(2001, 'masia', 'napkin', '냅킨 계약서, 라 마시아', 'referee', '입단 테스트 심사위원', '냅킨에 쓴 계약서 한 장으로 바다를 건너 바르셀로나 유스 기숙사에 들어갔다. 마지막 관문은 입단 테스트.', { youth: true }),
    Y(2004, 'barcelona', 'rijkaard', '17세 프로 데뷔, 호나우딩요의 튜터링', 'keeper', '더비 상대 수문장', '1군 데뷔. 팀의 슈퍼스타 호나우딩요가 꼬마를 맡아 직접 가르친다. 첫 더비, 골문엔 베테랑 수문장이 버티고 있다.', { event: 'dingyo' }),
    Y(2005, 'barcelona', 'rijkaard', '프로 첫 골, 청소년 월드컵 우승', 'tackler', '네덜란드 U-20 수비대장', '호나우딩요가 띄워 준 공을 칩슛으로 넣은 프로 첫 골, 호나우딩요의 목말 세리머니. 청소년 월드컵 결승의 네덜란드 수비대장이 다시 온다.'),
    Y(2006, 'barcelona', 'rijkaard', '유럽 정상, 부상으로 결승 결장', 'giant', '파리 결승의 런던 거인', '유럽 정상에 섰지만 부상으로 결승을 벤치에서 봤다. 그날 런던 팀의 거인 센터백과 싸운다.'),
    Y(2007, 'barcelona', 'rijkaard', '마라도나 재현 골', 'maestro', '헤타페 중원 지휘자', '하프라인부터 여섯 명을 제친 마라도나 재현 골. 그 경기 상대 지휘자가 복수를 노린다.', { press: 'handgoal' }),
    Y(2008, 'barcelona', 'pep', '베이징 올림픽 금메달', 'striker', '나이지리아 폭격기', '베이징 올림픽 결승. 나이지리아의 폭격기를 꺾고 금메달.', { event: 'pep' }),
    Y(2009, 'barcelona', 'pep', '6관왕, 로마 결승의 첫 맞대결', 'ronaldo', '호날두', '한 해 6관왕. 로마의 유럽 결승, 상대는 맨체스터의 호날두. 20년 라이벌의 첫 맞대결이다. 무회전 슛과 헤딩 강타, SIUU를 넘어야 첫 발롱도르가 온다.', { ballon: true, rivalBoss: true }),
    Y(2010, 'barcelona', 'pep', '월드컵 8강 탈락, 두 번째 발롱도르', 'giant', '독일 전차 센터백', '남아공 월드컵 8강에서 독일 전차에 0-4. 그 센터백을 넘어야 한다.',
      { ballon: true, trial: 1, twist: { mix: [{ type: 'tank', w: 2 }] } }),
    Y(2011, 'barcelona', 'pep', '웸블리 결승, 세 번째 발롱도르', 'referee', '엘 클라시코 주심', '웸블리 결승골로 유럽 정상. 클라시코마다 카드를 꺼내던 주심이 상대다.', { ballon: true }),
    Y(2012, 'barcelona', 'tito', '한 해 91골, 첼씨의 버스', 'drogba', '드록빠', '한 해 91골 세계 기록. 하지만 챔스 4강에서 10명이 버틴 첼씨의 버스 수비를 끝내 못 뚫었고, 페널티킥은 크로스바를 때렸다. 1차전 결승골의 주인공 드록빠가 기다린다.',
      { ballon: true, foe: 'chelsea', trial: 2 }),
    Y(2013, 'barcelona', 'tata', '햄스트링 부상의 해', 'tackler', '부상 유발 백태클러', '반복된 햄스트링 부상. 백태클러를 피하며 버텨야 한다.', { press: 'tax_messi' }),
    Y(2014, 'barcelona', 'luis', '브라질 월드컵 준우승', 'giant', '마라카낭 결승 독일 거인', '마라카낭 결승 연장 실점. 골든볼을 들고도 웃지 못한, 커리어 가장 아픈 밤. 이번엔 연장전까지 버텨야 독일 거인이 나온다.',
      { trial: 3, twist: { extra: 15, mix: [{ type: 'tank', w: 2 }] } }),
    Y(2015, 'barcelona', 'luis', 'MSN 트레블, 다섯 번째 발롱도르', 'keeper', '베를린 결승 수문장 부퐁', 'MSN 삼각편대로 트레블. 베를린 결승의 토리노 수문장 부퐁을 넘는다.', { ballon: true }),
    Y(2016, 'barcelona', 'luis', '코파 결승 실축, 은퇴 번복', 'keeper', '코파 결승 칠레 수문장', '3년 연속 결승 패배. 승부차기 실축 뒤 "대표팀은 끝났다"며 은퇴를 선언했다가 번복했다. 칠레 수문장과 다시 맞선다.', { trial: 3, press: 'retire' }),
    Y(2017, 'barcelona', 'valverde', '600골, 유니폼 세리머니', 'referee', '베르나베우 주심', '원정 클라시코 600번째 골과 유니폼 세리머니. 그 밤의 주심이 카드를 꺼낸다.'),
    Y(2018, 'barcelona', 'valverde', '주장 완장, 러시아 월드컵 16강', 'striker', '프랑스 번개 음바뻬', '주장 완장을 찼지만 러시아 월드컵 16강에서 프랑스의 번개 음바뻬에게 무너졌다.'),
    Y(2019, 'barcelona', 'valverde', '여섯 번째 발롱도르, 안필드 참사', 'maestro', '안필드 압박 감독 끌롭', '여섯 번째 발롱도르. 하지만 안필드에서 3-0 리드를 날린 밤, 압박의 지휘자 끌롭과 재대결.', { ballon: true }),
    Y(2020, 'barcelona', 'koeman', '2-8 참사, 뷔로팩스', 'referee', '뷔로팩스 회장단', '챔스 8강 2-8 참사. 팩스로 이적을 요청했지만 막혔다. 계약서를 흔드는 회장단이 상대다.', { trial: 2, twist: { press: 1 }, press: 'burofax' }),
    Y(2021, 'paris', 'poch', '코파 우승, 파리행, 일곱 번째 발롱도르', 'giant', '마라카낭 결승 브라질 거인', '마라카낭에서 브라질을 꺾고 첫 성인 대표팀 우승. 눈물의 작별 뒤 파리행.', { ballon: true }),
    Y(2022, 'argentina', 'scaloni', '카타르 월드컵 우승', 'striker', '결승 해트트릭 음바뻬', '카타르 결승, 음바뻬의 해트트릭을 넘어 승부차기 끝에 월드컵 우승.', { press: 'bobo' }),
    Y(2023, 'miami', 'tata', '마이애미행, 여덟 번째 발롱도르', 'maestro', '리그스컵 결승 지휘자', '마이애미행 첫 대회 우승. 리그스컵 결승 상대 지휘자와의 대결. 여덟 번째 발롱도르.', { ballon: true }),
    Y(2024, 'argentina', 'scaloni', '코파 아메리카 2연패', 'tackler', '결승 콜롬비아 수비대장', '코파 결승에서 발목 부상으로 눈물. 콜롬비아 수비대장을 넘어 2연패.'),
    Y(2025, 'miami', 'mascherano', '서포터스 실드', 'keeper', 'MLS 결승 수문장', 'MLS 정규리그 1위 서포터스 실드. 결승 무대의 수문장과 승부.'),
    Y(2026, 'argentina', 'scaloni', '마지막 월드컵 — 최종 결전', 'ronaldo', '호날두', '마지막 월드컵. 20년을 함께 달려온 영원한 라이벌, 호날두와의 최종 결전.', { final: true })
  ];
  // 토레쓰 career (round 11; unlocked by beating him after 드록빠): debut at 17 in 2001 for his home club, the
  // 리버풀 and 첼씨 years, home again, then 사간 도스 and a last duel with 메시 (Camp Nou 2012 was his).
  RS.YEARS_TORRES = [
    Y(2001, 'atletico', 'aragones', '17세 데뷔, 엘 니뇨', 'keeper', '2부 리그 베테랑 수문장', '열일곱 살, 2부 리그로 떨어진 고향 팀의 1군 데뷔. 앳된 얼굴에 붙은 별명은 "엘 니뇨(꼬마)". 골문엔 산전수전 다 겪은 베테랑 수문장이 버틴다.'),
    Y(2002, 'atletico', 'aragones', '1부 리그 승격', 'tackler', '라리가 백태클러', '고향 팀을 1부 리그로 다시 끌어올렸다. 라리가의 거친 수비수들이 꼬마 공격수를 노린다.'),
    Y(2003, 'atletico', 'aragones', '열아홉 살 주장', 'maestro', '이웃집 백색군단 지휘자', '열아홉 살에 주장 완장을 찼다. 마드리드 더비, 이웃집 백색군단의 중원 지휘자가 길을 막는다.'),
    Y(2004, 'atletico', 'aragones', '유로 2004 조별 탈락', 'giant', '포르투갈 철벽 수비대장', '첫 메이저 대회 유로 2004. 개최국 포르투갈에 0-1로 지며 조별리그에서 짐을 쌌다. 그날의 철벽 수비대장과 다시 만난다.', { trial: 1 }),
    Y(2005, 'atletico', 'aragones', '줄무늬의 심장', 'striker', '라리가 득점왕 경쟁자', '팀이 흔들려도 골은 늘 토레쓰의 몫. 라리가 득점 경쟁자와 골 대결을 벌인다.'),
    Y(2006, 'atletico', 'aragones', '독일 월드컵 16강', 'referee', '16강 프랑스전 주심', '독일 월드컵 조별리그 3골. 하지만 16강에서 프랑스에 1-3으로 졌다. 그날 휘슬을 분 주심이 상대다.'),
    Y(2007, 'liverpool', 'benitez', '리버풀 이적, 데뷔 시즌 24골', 'tackler', '프리미어 백태클러', '고향을 떠나 리버풀로. 데뷔 시즌 리그 24골을 넣었다. 프리미어리그의 백태클이 기다린다.'),
    Y(2008, 'liverpool', 'benitez', '유로 2008 결승골', 'keeper', '빈 결승 독일 수문장', '빈에서 열린 유로 2008 결승. 수비 뒷공간을 파고들어 독일 수문장 위로 공을 띄운 한 방으로 44년 만의 우승을 안겼다.'),
    Y(2009, 'liverpool', 'benitez', '올드 트래퍼드 4-1', 'giant', '맨체스터 철벽 비디찌', '맨체스터 원정 4-1 대승. 철벽 수비수 비디찌를 속도로 무너뜨린 밤, 그 철벽이 복수를 노린다.'),
    // 2010 (round 14): the 월드컵 choice before the season (RS.EVENTS.wc2010) — play on a bad knee or sit it out
    Y(2010, 'liverpool', 'benitez', '남아공 월드컵의 해', 'maestro', '오렌지 군단 지휘자', '남아공 월드컵의 해. 무릎은 성치 않다. 결승에서 기다리는 건 오렌지 군단의 지휘자.', { event: 'wc2010' }),
    // 2011 (round 14): the crossroads 기자회견 (RS.PRESS.crossroads) — 첼씨's 5천만 파운드 or 안필드. This array is
    // the 첼씨 path: four 시련 seasons (ctrial 1-4; each cleared one lifts 첼씨 토레쓰 one grade, B → SSS; the last is
    // the 캄프 누 goal, played out on the pitch: cine), each opened by a 회상 of a flop (recall: RS.PRESS). The 잔류
    // path swaps these four for RS.YEARS_TORRES_LFC's 리버풀 seasons (RS.selectHero reads build.flags.path).
    Y(2011, 'chelseat', 'eyebrow', '5천만 파운드, 903분의 골 가뭄', 'tackler', '친정팀 수비대장 캐라거', '영국 최고 이적료로 첼씨에 입단. 그런데 공이 발에 붙지 않는다. 첫 골까지 903분. 데뷔전 상대는 하필 친정팀 리버풀, 옛 동료 수비대장이 몸으로 막아선다.', { press: 'crossroads', recall: 'recall1', ctrial: 1, trial: 1 }),
    Y(2011, 'chelseat', 'eyebrow', '맨유전, 텅 빈 골문', 'keeper', '맨체스터 수문장 데게아르', '아넬까의 패스, 1대1, 수문장까지 제쳤다. 그리고 텅 빈 골문 앞에서… 공은 옆그물로. 전 세계가 웃었다. 그 수문장이 다시 골문에 선다.', { recall: 'recall2', ctrial: 2, trial: 1 }),
    Y(2012, 'chelseat', 'dimatteo', '백조단 앞 헛발질, 벤치의 겨울', 'tackler', '백조단 수비대장', '웨일스 백조단 원정, 또 빈 골문 앞 헛발질. 벤치가 길어진 겨울. 그 수비대장이 백태클을 노린다.', { recall: 'recall3', ctrial: 3, trial: 1 }),
    Y(2012, 'chelseat', 'dimatteo', '캄프 누, 900억 일시불 골', 'keeper', '바르샤 수문장 발기스', '캄프 누 4강 2차전, 10명이 버티는 첼씨. 추가시간, 하프라인에 혼자 남은 토레쓰 앞으로 공이 굴러온다. 바르샤 수문장 발기스만 제치면 900억을 한 번에 갚는다.', { recall: 'recall4', ctrial: 4, trial: 2, cine: 'goal900', twist: { press: 1 } }),
    Y(2013, 'chelseat', 'benitez', '유로파리그 우승', 'striker', '암스테르담 결승 저격수', '암스테르담 유로파리그 결승에서 선제골. 상대 팀 저격수와 맞붙는다.'),
    Y(2014, 'chelseat', 'special', '무링요의 첼씨, 브라질 월드컵', 'giant', '프리미어 거인 센터백', '스페셜 원이 돌아왔다. 출전 시간은 줄었지만 거인 센터백들과의 몸싸움은 계속된다. 여름엔 브라질 월드컵.', { trial: 1, event: 'wc2014' }),
    Y(2015, 'atletico2', 'simeone', '고향 복귀, 4만 관중', 'maestro', '베르나베우 백색군단 지휘자', '4만 5천 관중의 환영 속에 고향 팀으로 돌아왔다. 복귀 직후 베르나베우 원정에서 두 골, 백색군단 지휘자와 다시 더비.'),
    Y(2016, 'atletico2', 'simeone', '밀라노 결승의 눈물', 'ronaldo', '호날두', '밀라노 챔스 결승, 마드리드 더비는 승부차기까지 갔다. 우승을 확정한 마지막 키커는 날두. 그 날두를 넘어야 한다.', { rivalBoss: true, trial: 2 }),
    Y(2017, 'atletico2', 'simeone', '공포의 충돌, 다시 일어서다', 'giant', '공중볼 경합의 거인', '공중볼 경합에서 머리를 부딪쳐 의식을 잃었지만 며칠 만에 그라운드로 돌아왔다. 그 거인을 다시 넘는다.'),
    Y(2018, 'atletico2', 'simeone', '유로파리그 우승, 고향과의 작별', 'tackler', '리옹 결승 수비대장', '리옹 유로파리그 결승 우승, 고향 팀에서 들어 올린 첫 큰 트로피. 눈물의 작별 뒤 일본으로.'),
    Y(2019, 'tosu', 'tosu', '은퇴 무대 — 최종 결전', 'messi', '메시', '사간 도스에서 맞는 마지막 시즌. 2012년 캄프 누에서 울렸던 메시와 마지막으로 맞선다.', { final: true })
  ];
  // 리버풀 잔류 path (round 14, RS.PRESS.crossroads 'stay'): the four 첼씨 시련 seasons become four 리버풀 seasons —
  // 이빨괴물 수아레즈 as the 2011 boss (beaten once, he comes back as a 준보스), the 칭호 '안필드의 9번' and the 2014
  // 월드컵 choice. The seasons before and after are the same objects as the 첼씨 path's.
  RS.YEARS_TORRES_LFC = RS.YEARS_TORRES.slice(0, 10).concat([
    Y(2011, 'liverpool', 'kenny', '안필드 잔류, 이빨괴물 수아레즈', 'suarez', '이빨괴물 수아레즈', '첼씨의 5천만 파운드를 거절했다. 1월에 온 새 파트너 수아레즈는 상대를 물어뜯는 이빨괴물. 훈련장에서 먼저 그를 길들여야 한다.', { press: 'crossroads', lfc: 1 }),
    Y(2012, 'liverpool', 'kenny', '웸블리 칼링컵, 안필드의 9번', 'keeper', '웸블리 결승 수문장', '웸블리 칼링컵 결승. 안필드의 9번으로 남은 첫 트로피가 걸렸다. 결승 수문장을 넘어라.', { lfc: 2 }),
    Y(2013, 'liverpool', 'rodgers', '수아레즈와 투톱, 득점왕 경쟁', 'tackler', '에버튼 더비 백태클러', '수아레즈와 투톱. 리그 득점왕을 두고 둘이 경쟁한다. 머지사이드 더비의 백태클러가 발목을 노린다.', { lfc: 3 }),
    Y(2014, 'liverpool', 'rodgers', '우승 문턱, 미끄러진 제라두', 'giant', '첼씨 버스 거인 센터백', '24년 만의 리그 우승이 눈앞. 첼씨전, 제라두가 미끄러졌다. 버스를 세운 첼씨의 거인 센터백을 넘어야 한다. 여름엔 브라질 월드컵.', { trial: 1, foe: 'chelsea', event: 'wc2014', lfc: 4 })
  ], RS.YEARS_TORRES.slice(16));
  // 첼씨 토레쓰 (round 14): on the 첼씨 path the hero is 첼씨 토레쓰 at a grade of his own (build.flags.cgrade, an index
  // into RS.GRADES B … SSS): every cleared 시련 lifts it one step (RS.finishYear), and his damage and HP follow it
  // (RS.heroGradeMul). All four cleared: 성공한 첼씨 토레쓰 (meta.unlocked.torresBlue) — his next careers start at SSS,
  // in 첼씨 blue for good (build.flags.blue).
  RS.CHELSEA = { mul: [0.82, 0.9, 1, 1.1, 1.25], hp: [-15, -5, 0, 10, 25], trials: 4, bluePath: 'chelsea' };
  // ---------------------------------------------------------------- 엘 클라시코 (the rival as a mid-season boss)
  // 날두 in 마드리드 (2009–2018) meets 메시's 바르샤 every season: 날두's seasons 2009–2017 and 메시's 2010–2018 get
  // the rival at the middle of the stage (World.spawnRival) for RS.RIVAL_WINDOW seconds. Kill him = 클라시코 win;
  // he leaves when the window closes = loss (the season goes on either way; dying is still dying). rivalLv = how
  // many 클라시코 seasons came before: each adds the next move list (tiers) and more HP / damage; from rageAt on
  // he gets a 2nd phase at half HP (RS.FINAL rage). The record (build.rivalry) moves 민심 and can cost the
  // 발롱도르 of a lost season (RS.finishYear).
  RS.RIVAL_WINDOW = 30;
  RS.RIVAL_FANS = 8; // 민심 per 클라시코 won (+) or lost (−)
  RS.RIVAL_HIT_SHARE = 0.12; // share of the player's recent total output assumed to land on the rival
  // secs: [base, per rivalLv] share of the window his HP aims at, capped at RIVAL_MAX_SHARE (round 11: the 9th
  // 클라시코 asked for 38 s of a 30 s window, so he never fell)
  RS.RIVAL = {
    messi: { name: '메시', tiers: [['dribble', 'curl'], ['volley'], ['encircle'], ['snipe'], ['summon'], ['dribble3']], rageAt: 3, hp: 0.3, dmg: 0.08, secs: [0.4, 0.04] },
    ronaldo: { name: '호날두', tiers: [['dash', 'snipe'], ['burst'], ['pslam'], ['wall'], ['ring'], ['summon']], rageAt: 3, hp: 0.3, dmg: 0.08, secs: [0.4, 0.04] }
  };
  RS.RIVAL_MAX_SHARE = 0.7;
  // The rival's (and 토레쓰's) HP follows the average damage landing on him since the first hit, at these seconds
  // after it; never below RIVAL_FLOOR of a boss's base HP.
  RS.RIVAL_CALIBRATE_AT = [5, 12];
  RS.RIVAL_FLOOR = 0.03;
  for (const y of RS.YEARS) if (y.era === 'madrid') y.rival = 'messi';
  for (const y of RS.YEARS_MESSI) if (y.year >= 2010 && y.year <= 2018) y.rival = 'ronaldo';
  for (const years of [RS.YEARS, RS.YEARS_MESSI, RS.YEARS_TORRES]) { let n = 0; for (const y of years) if (y.rival) y.rivalLv = n++; }

  // Playable heroes. selectHero() points RS.YEARS / DEBUT / BIRTH at the chosen career (one career at a time).
  RS.HEROES = {
    ronaldo: { name: '호날두', short: '날두', moveMul: 1, startSkill: 'kick', years: RS.YEARS, debut: 2002, birth: 1985, desc: '투사체 공격 · 슬라이딩 5초', rival: '메시' },
    // wall: ×RS.WALL's HP growth — his orbit, aura and stun hold a crowd off far better than 날두's shots
    messi: { name: '메시', short: '메시', moveMul: 1.22, startSkill: 'orbit', years: RS.YEARS_MESSI, debut: 2004, birth: 1987, desc: '유소년부터 · 드리블과 공 기술 · 패스는 동료가 · 성장호르몬·약물 선택', rival: '호날두', wall: 3 },
    // round 11: unlocked by beating 토레쓰 after 드록빠 (meta.unlocked.torres); quick feet, 날두's shooting moves
    // and his own 엘 니뇨 칩슛
    // round 14: his 2011 crossroads picks one of two season lists (paths; build.flags.path, RS.selectHero)
    torres: { name: '토레쓰', short: '토레쓰', moveMul: 1.1, startSkill: 'nino', years: RS.YEARS_TORRES, paths: { chelsea: RS.YEARS_TORRES, liverpool: RS.YEARS_TORRES_LFC }, debut: 2001, birth: 1984, desc: '17세 데뷔 · 칩슛과 속공 · 슬라이딩 4초', rival: '메시', locked: true }
  };
  RS.heroLocked = (meta, hero) => !!(RS.HEROES[hero] && RS.HEROES[hero].locked) && !(meta && meta.unlocked && meta.unlocked[hero]);
  // The season list of a career: the hero's, or the path his career took (토레쓰 after 2011).
  RS.yearsFor = (hero, build) => {
    const h = RS.HEROES[hero] || RS.HEROES.ronaldo, path = build && build.flags && build.flags.path;
    return (h.paths && path && h.paths[path]) || h.years;
  };
  // 첼씨 토레쓰 (RS.CHELSEA): the hero's own grade on the 첼씨 path — null off it (the 발롱도르 ladder is the weapon's)
  RS.heroGrade = (b) => (b && b.flags && (b.flags.blue || b.flags.path === RS.CHELSEA.bluePath) ? Math.max(0, Math.min(RS.GRADE_TOP, b.flags.cgrade | 0)) : null);
  RS.heroGradeName = (b) => { const g = RS.heroGrade(b); return g == null ? '' : RS.GRADES[g].name; };

  // ---------------------------------------------------------------- Difficulty (이지 / 노멀 / 하드)
  // On top of the season curve: enemy HP, damage, spawn density and boss damage × these, and from the debut on
  // × (1 + grow × pro season) more, so the gap widens as the career goes on. heal: × the heal drop chance.
  // 노멀 is the default; it sits well above the round-7 curve, which is now about 이지.
  // Round 9: both pro settings got much tougher after 완전 오토 cleared 하드. special: × the graded-card odds;
  // crowd: × the ordinary crowd — trickle, packs, the minimum-men floor and the alive cap (RS.yearTuning, World.updateSpawns);
  // 하드 fields twice 노멀's men at the same moment (spawn/spawnRamp are 노멀's, so the ratio holds from the first season on)
  // poise: × knockback and stun taken by the crowd; bossCool: × the rest between boss attacks; ramp: seasons over
  // which the extra toughness grows in (the debut on 노멀 still plays as it always did; 하드 bites from the start).
  RS.DIFFS = {
    easy: { name: '이지', icon: '🙂', hp: 0.72, dmg: 0.65, spawn: 0.85, spawnRamp: 0, crowd: 1, boss: 0.8, grow: 0, heal: 1.4, special: 1, poise: 1, bossCool: 1, ramp: 0, desc: '적이 약하고 회복이 자주 나온다. 승부차기 게이지도 느리다. 처음이라면 여기서' },
    // round 11: grow 0.035 → 0.02 (normal), 0.08 → 0.045 (hard): one weapon grows far slower than six moves did
    normal: { name: '노멀', icon: '⚽', hp: 1.6, dmg: 1.5, spawn: 1.25, spawnRamp: 3, crowd: 1, boss: 1.5, grow: 0.02, heal: 0.9, special: 0.85, poise: 0.85, bossCool: 0.95, ramp: 3, desc: '기본 난이도. 중반부터는 벽이 느껴진다 · 훈련장 강화가 필요하다' },
    // grow 0.08 (round 10, was 0.05): with each match replayable from its seed, 완전 오토 with the whole 훈련장 still
    // cleared 하드 on 2 seeds of 8; now it stalls on every one between 2011 and 2017
    // top (round 13): × the 영웅 and 전설 share of the weapon and passive cards (RS.gradeOddsAt; the rest goes to
    // 희귀). Luck used to cut the top grades off in late seasons (RS.luckOdds), and 하드 was tuned with that: once
    // fixed, 완전 오토 with the whole 훈련장 cleared 하드 on seed 7 of 7 · 3 · 5 · 9 (×0.5: on 7 and 3). At ×0.25 its
    // season-10 hand is 영웅 8 % · 전설 2 %, near round 12's 에픽 7 % · no 황금, and it stalls on all six seeds tried
    // (7 · 3 · 5 · 9 · 11 · 13), between 2011 and 2022.
    hard: { name: '하드', icon: '🔥', hp: 2.4, dmg: 2.1, spawn: 1.25, spawnRamp: 3, crowd: 2, boss: 2.2, grow: 0.045, heal: 0.45, special: 0.5, top: 0.25, poise: 0.6, bossCool: 0.8, ramp: 1, desc: '적이 단단하고 아프며 잘 밀리지 않는다. 회복과 특수 아이템, SS·SSS 카드도 드물다. 승부차기는 높이 찰수록 어렵다. 오토로는 못 깬다' }
  };
  RS.DIFF_ORDER = ['easy', 'normal', 'hard'];
  RS.DIFF = 'normal';
  RS.setDiff = (k) => (RS.DIFF = RS.DIFFS[k] ? k : 'normal');

  // ---------------------------------------------------------------- Story events (메시's career)
  // Shown once before that season (career years, not replays). Card keys: hgh (growth hormone: true = normal,
  // false = 하드 모드), skill (teaches a move when a slot is free, else `alt` is offered), mods (kept for the career
  // like a coach card), result (toast). mate: joins the squad when there is room, whatever the pick.
  // Before the treatment (and for the whole career without it) 메시 plays in a small body: RS.SMALL_BODY.
  RS.SMALL_BODY = { hp: -30, dmg: -0.2 };
  RS.EVENTS = {
    hgh: {
      title: '성장호르몬 주사', who: '키가 자라지 않는 병 · 한 달 치료비가 아버지 월급만큼',
      story: '의사는 매일 밤 다리에 성장호르몬 주사를 놓아야 키가 자란다고 했다. 주사를 맞으면 몸이 커지고 강해지고, 나중에 약물(스팀팩)도 더 맞을 수 있다. 맞지 않으면 끝까지 작은 몸으로 싸운다. 난이도(이지·노멀·하드)와 따로, 이 선택이 메시만의 추가 난이도다.',
      cards: [
        { id: 'hgh_yes', icon: '💉', name: '주사를 맞는다', tag: '정상 성장', hgh: true, ai: 0, result: '💉 몸이 자랐다! 작은 몸의 약점이 사라졌다',
          desc: '몸이 자라 강해진다: 작은 몸의 약점(최대 체력 -30, 공격력 -20%)이 바로 사라진다. 이후 "약물 꽂기"(스팀팩, 최대 5번)를 받을 수 있다.' },
        { id: 'hgh_no', icon: '🔥', name: '주사 없이 버틴다', tag: '작은 몸 도전', hgh: false, ai: 1, result: '🔥 작은 몸 그대로 간다 · 약물은 끝까지 거부',
          desc: '커리어 끝까지 작은 몸: 최대 체력 -30, 공격력 -20%. 약물(스팀팩)도 나오지 않는다. 되돌릴 수 없다.' }
      ]
    },
    dingyo: {
      title: '호나우딩요의 튜터링', who: '삼바 마법사 호나우딩요 · 바르셀로나의 슈퍼스타', mate: 'dingyo',
      story: '팀의 슈퍼스타 호나우딩요가 열일곱 살 꼬마를 맡았다. 훈련이 끝나면 따로 남아 자기 기술을 하나씩 가르쳐 준다. 무엇부터 배울까?',
      cards: [
        { id: 'dy_elastico', icon: '🪄', name: '엘라스티코 전수', tag: '새 스킬', skill: 'elastico', ai: 0, result: '🪄 엘라스티코를 배웠다!',
          desc: '호나우딩요의 고무줄 페인트를 배운다. 이 튜터링에서만 얻는 스킬.',
          alt: { id: 'dy_touch', icon: '✨', name: '마법의 볼 터치', tag: '스킬 강화', skillsUp: 1, ai: 0, result: '✨ 모든 스킬 Lv.+1',
            desc: '스킬 칸이 가득 차 있어 대신 볼 터치를 배운다: 보유 스킬 전부 Lv.+1.' } },
        { id: 'dy_nolook', icon: '😎', name: '노룩 패스 수업', tag: '영구 효과', mods: { teamDmg: 0.2, teamCd: -0.1 }, ai: 1, result: '😎 노룩 패스를 배웠다!',
          desc: '동료 공격력 +20%, 동료 쿨타임 -10%' },
        { id: 'dy_joy', icon: '😁', name: '즐기는 축구', tag: '영구 효과', mods: { xp: 0.15, regen: 0.3 }, ai: 2, result: '😁 축구를 즐기는 법을 배웠다!',
          desc: '경험치 +15%, 초당 체력 +0.3' }
      ]
    },
    // 2008: 뻽 puts 메시 at false nine with 챠비 and 니에미스타 behind him. trio: both join the starting two (the
    // starters move to the bench; RS.formTrio).
    pep: {
      title: '뻽의 티키타카', who: '새 감독 뻽 · 중원의 챠비와 니에미스타',
      story: '새 감독 뻽이 메시를 가짜 9번에 세웠다. 바로 뒤에는 챠비와 니에미스타. 셋이 공을 돌리기 시작하면 아무도 공을 뺏지 못한다. 셋이 함께 선발로 뛰면 메시가 훨씬 강해진다.',
      cards: [
        { id: 'pepev_trio', icon: '🔺', name: '챠비·니에미스타와 선발', tag: '트리오 결성', trio: true, ai: 0, result: '🔺 티키타카 트리오 결성!',
          desc: '챠비·니에미스타가 선발 두 자리에 들어온다(지금 선발은 벤치로). 셋이 함께면 메시 공격력 +30%, 쿨타임 -10%, 동료 공격력 +20%, 두 사람의 패스 피해 +25%.' },
        { id: 'pepev_false9', icon: '9️⃣', name: '가짜 9번 특훈', tag: '영구 효과', mods: { dmg: 0.1, crit: 0.05 }, ai: 1, result: '9️⃣ 가짜 9번이 몸에 익었다!',
          desc: '공격력 +10%, 치명타 확률 +5%. 스쿼드는 그대로.' },
        { id: 'pepev_rondo', icon: '🔁', name: '론도 훈련', tag: '영구 효과', mods: { cd: -0.08, teamCd: -0.1 }, ai: 2, result: '🔁 론도로 패스 감각이 살아났다!',
          desc: '쿨타임 -8%, 동료 쿨타임 -10%. 스쿼드는 그대로.' },
        // round 29: turn the trio down and carry the team alone — a chosen hard mode: every teammate leaves and
        // nobody signs for the rest of the career (solo: RS.applyEvent, RS.addMate, RS.mateCandidates)
        { id: 'pepev_solo', icon: '🙅', name: '"패스 필요 없어, 나 혼자 한다"', tag: '🔥 독박축구', solo: true, ai: 3,
          desc: '난이도를 스스로 올리는 길: 지금 동료가 모두 떠나고 커리어 끝까지 동료 없이 혼자 뛴다(영입·이적 제안도 없다) · 민심 -10. 20%: 혼자서도 통한다(공격력 +15%) · 80%: 아무 보상 없음',
          rolls: [
            { p: 0.2, win: true, text: '🙅 독박축구 선언! 혼자 여섯 명을 제치고 골. 챠비와 니에미스타는 하프라인에서 손만 들고 서 있었다', fx: { fans: -10, mods: { dmg: 0.15 } } },
            { p: 0.8, text: '🙅 독박축구 선언! 패스해 줄 사람이 없다. 뻽은 터치라인에서 머리를 감싸 쥐었다', fx: { fans: -10 } }
          ] }
      ]
    },
    // ---- 토레쓰 (round 14). Cards may carry fx { mods, flag: { name: value }, gradeDown: n (every owned weapon
    // loses n grades) } and `rolls` ([{ p, text, win, fx }], rolled once) like a press answer; `variants` picks the
    // card list by a build flag (the 2014 choice depends on what the knee went through in 2010).
    wc2010: {
      title: '남아공 월드컵, 무릎을 걸 것인가', who: '2010년 봄 · 무릎 수술 두 달 뒤 · 대표팀 소집 명단',
      story: '수술한 무릎이 다 낫지 않았다. 의사는 "지금 뛰면 다시 다칠 수 있다"고 했고, 감독은 "네가 없으면 안 된다"고 했다. 월드컵에 인생을 건다, 아니면 재활에 집중하고 4년 뒤를 본다.',
      cards: [
        { id: 'wc10_go', icon: '🏆', name: '참가한다 — 무릎을 걸고', tag: '🎲 40% 악화', ai: 1,
          desc: '60%: 월드컵 우승, 챔피언의 담력(보스에게 주는 피해 +12%) · 40%: 무릎 악화 — 가진 모든 스킬(무기) 등급 -2, 메달은 목에 건다. 2014년 참가는 그때 몸 상태에 달린다.',
          rolls: [
            { p: 0.6, win: true, text: '🏆 무릎을 안고 뛰었고, 결승을 넘었다! 월드컵 챔피언 · 보스에게 주는 피해 +12%', fx: { mods: { bossDmg: 0.12 }, flag: { knee: 'ok', wc2010: 'win' } } },
            { p: 0.4, text: '💥 결승 뒤 무릎이 무너졌다. 메달은 걸었지만 모든 스킬 등급 -2', fx: { gradeDown: 2, flag: { knee: 'bad', wc2010: 'win' } } }
          ] },
        { id: 'wc10_rest', icon: '🩹', name: '불참하고 재활한다', tag: '확정', ai: 0, result: '🩹 월드컵은 TV로 봤다. 대신 무릎이 새것처럼 돌아왔다 · 최대 체력 +15 · 2014 월드컵 확정 참가',
          desc: '이번 월드컵은 무관. 몸이 완전히 돌아온다: 최대 체력 +15. 2014년 브라질 월드컵은 확정 참가(리스크 없음).',
          fx: { mods: { hp: 15 }, flag: { knee: 'fit', wc2010: 'skip' } } }
      ]
    },
    wc2014: {
      title: '브라질 월드컵 소집', who: '2014년 여름 · 대표팀 소집 명단 · 서른 살의 무릎',
      story: '브라질 월드컵. 2010년의 선택이 지금 무릎 상태를 정했다.',
      variants: { flag: 'knee', by: {
        fit: [
          { id: 'wc14_fit', icon: '🏆', name: '참가한다 — 몸 상태 최고', tag: '확정', ai: 0, result: '🏆 재활 덕에 완전한 몸으로 브라질에 갔다 · 공격력 +8%, 최대 체력 +10',
            desc: '2010년 재활의 보상: 리스크 없이 참가. 공격력 +8%, 최대 체력 +10.', fx: { mods: { dmg: 0.08, hp: 10 }, flag: { wc2014: 'go' } } },
          { id: 'wc14_no', icon: '🛋️', name: '불참한다', tag: '확정', ai: 1, result: '🛋️ 여름을 쉬었다. 변화 없음', fx: { flag: { wc2014: 'skip' } }, desc: '아무 일도 일어나지 않는다.' }
        ],
        ok: [
          { id: 'wc14_ok', icon: '🏆', name: '참가한다 — 괜찮을 거야', tag: '🎲 25% 재부상', ai: 1,
            desc: '75%: 멀쩡히 돌아온다, 공격력 +8% · 25%: 재부상 — 모든 스킬 등급 -1',
            rolls: [
              { p: 0.75, win: true, text: '🏆 무릎은 버텼다. 브라질의 여름 · 공격력 +8%', fx: { mods: { dmg: 0.08 }, flag: { wc2014: 'go' } } },
              { p: 0.25, text: '💥 조별리그에서 무릎이 다시 말을 안 들었다. 모든 스킬 등급 -1', fx: { gradeDown: 1, flag: { wc2014: 'hurt' } } }
            ] },
          { id: 'wc14_no', icon: '🛋️', name: '불참한다', tag: '확정', ai: 0, result: '🛋️ 여름을 쉬었다. 변화 없음', fx: { flag: { wc2014: 'skip' } }, desc: '아무 일도 일어나지 않는다.' }
        ],
        bad: [
          { id: 'wc14_bad', icon: '🎰', name: '참가한다 — 어차피 게임이잖아', tag: '🎲 60% 재부상', ai: 1,
            desc: '2010년에 무너진 무릎으로 또 간다. 40%: 기적의 여름, 공격력 +15% · 60%: 재부상 — 모든 스킬 등급 -2, 최대 체력 -10',
            rolls: [
              { p: 0.4, win: true, text: '🏆 기적처럼 무릎이 버텼다! 전 세계가 놀랐다 · 공격력 +15%', fx: { mods: { dmg: 0.15 }, flag: { wc2014: 'go' } } },
              { p: 0.6, text: '💥 첫 경기 20분 만에 무릎이 꺾였다. 모든 스킬 등급 -2, 최대 체력 -10', fx: { gradeDown: 2, mods: { hp: -10 }, flag: { wc2014: 'hurt' } } }
            ] },
          { id: 'wc14_no', icon: '🛋️', name: '불참한다', tag: '확정', ai: 0, result: '🛋️ 무릎을 아껴 여름을 쉬었다. 변화 없음', fx: { flag: { wc2014: 'skip' } }, desc: '아무 일도 일어나지 않는다.' }
        ]
      } },
      cards: [
        { id: 'wc14_none', icon: '🛋️', name: '소집을 사양한다', tag: '확정', ai: 0, result: '🛋️ 여름을 쉬었다. 변화 없음', fx: { flag: { wc2014: 'skip' } }, desc: '아무 일도 일어나지 않는다.' }
      ]
    }
  };
  // Every card an event can deal (its base cards and each variant list), for RS.coachCard and the validators.
  RS.eventCards = (ev) => (ev.variants ? Object.values(ev.variants.by).reduce((a, l) => a.concat(l), []) : []).concat(ev.cards || []);

  // ---------------------------------------------------------------- 기자회견 (press conferences: a visual novel)
  // Shown once before that season (career years; RS.YEARS[i].press). lines: the scene (by: speaker, inner: the
  // hero's thoughts). choices: name (the answer), say (what the hero says), desc (what it does, odds printed),
  // ai (lowest = the 완전 오토 pick: never a career-ending gamble), then a fixed `result` or `rolls` ([{ p, … }],
  // rolled once). Outcome: text, note (one-line effect), win, fx { mods (permanent, kept like a coach card), fans
  // (민심 change), coins (× the wallet: a fine), skill (learn the move, else Lv.+1), flag }, ending (the career
  // ends: RS.ENDINGS).
  RS.PRESS = {
    wink: {
      title: '윙크 논란 기자회견', who: '월드컵 8강 직후 · 잉글랜드 기자단',
      lines: [
        { by: '기자', text: '루니툰 선수가 퇴장당하던 순간, 벤치를 보며 윙크하셨죠? 일부러 퇴장을 유도한 겁니까?' },
        { by: '기자', text: '잉글랜드 팬들은 다음 시즌 내내 야유를 퍼붓겠다고 벼르고 있습니다.' },
        { by: '날두', text: '(맨체스터로 돌아가면 루니툰이랑 같은 팀인데… 뭐라고 하지?)', inner: true }
      ],
      choices: [
        { id: 'deny', icon: '🙄', name: '"눈에 먼지가 들어갔어요"', say: '윙크요? 눈에 먼지가 들어갔을 뿐입니다.', desc: '아무도 안 믿는다: 민심 -10 · 오기가 생긴다: 공격력 +5%', ai: 1,
          result: { text: '아무도 믿지 않았다. 대신 오기가 생겼다.', fx: { fans: -10, mods: { dmg: 0.05 } }, note: '공격력 +5% · 민심 -10' } },
        { id: 'sorry', icon: '🤝', name: '루니툰에게 사과한다', say: '루니툰에게 직접 전화해서 사과하겠습니다. 우린 한 팀이니까요.', desc: '동료와 화해: 동료 공격력 +10% · 민심 +12', ai: 0,
          result: { text: '루니툰은 웃으며 받아 줬다. "괜찮아, 다음 시즌에 골이나 넣어."', fx: { fans: 12, mods: { teamDmg: 0.1 } }, note: '동료 공격력 +10% · 민심 +12' } },
        { id: 'fuel', icon: '🔥', name: '"야유는 제 연료입니다"', say: '야유요? 좋습니다. 그게 제 연료니까요.', desc: '50%: 야유를 먹고 큰다(공격력 +12%) · 50%: 멘탈이 흔들린다(최대 체력 -15) · 민심 -15', ai: 2,
          rolls: [
            { p: 0.5, win: true, text: '야유가 쏟아질수록 더 빨라졌다. 원정 경기마다 골!', fx: { fans: -15, mods: { dmg: 0.12 } }, note: '공격력 +12% · 민심 -15' },
            { p: 0.5, text: '경기장마다 야유. 밤잠을 설쳤다.', fx: { fans: -15, mods: { hp: -15 } }, note: '최대 체력 -15 · 민심 -15' }
          ] }
      ]
    },
    unveil: {
      title: '8만 관중 입단식', who: '마드리드 홈구장 · 세계 최고 이적료',
      lines: [
        { by: '사회자', text: '여러분, 세계에서 가장 비싼 선수입니다! 8만 관중이 경기장을 가득 채웠습니다!' },
        { by: '기자', text: '역대 최고 이적료가 부담되지는 않습니까? 팬들에게 한마디 해 주세요!' },
        { by: '날두', text: '(마이크를 잡은 손에 땀이 난다. 8만 명이 나만 보고 있다.)', inner: true }
      ],
      choices: [
        { id: 'hala', icon: '🤍', name: '"할라 마드리드!"', say: '어릴 때부터 꿈이었습니다. 할라 마드리드!', desc: '민심 +15 · 경험치 +5%', ai: 1,
          result: { text: '8만 명이 함께 외쳤다. "할라 마드리드!"', fx: { fans: 15, mods: { xp: 0.05 } }, note: '경험치 +5% · 민심 +15' } },
        { id: 'best', icon: '👑', name: '"세계 최고가 되겠습니다"', say: '저는 세계 최고가 되려고 여기 왔습니다.', desc: '각오: 공격력 +6% · 건방지다: 민심 -3', ai: 0,
          result: { text: '건방지다는 말도 들었지만, 각오만큼은 진짜였다.', fx: { fans: -3, mods: { dmg: 0.06 } }, note: '공격력 +6% · 민심 -3' } },
        { id: 'juggle', icon: '🤹', name: '관중 앞 리프팅 묘기', say: '말보다 공으로 보여 드리죠!', desc: '70%: 대성공(치명타 +4%, 민심 +12) · 30%: 공을 떨어뜨린다(민심 -8)', ai: 2,
          rolls: [
            { p: 0.7, win: true, text: '공이 한 번도 땅에 닿지 않았다. 함성이 터졌다!', fx: { fans: 12, mods: { crit: 0.04 } }, note: '치명타 +4% · 민심 +12' },
            { p: 0.3, text: '긴장한 탓에 세 번 만에 공을 떨어뜨렸다… 그 장면이 짤로 돌았다.', fx: { fans: -8 }, note: '민심 -8' }
          ] }
      ]
    },
    tax_ronaldo: {
      title: '탈세 의혹 기자회견', who: '스페인 검찰 · 초상권 수입 1470만 유로 탈세 혐의',
      lines: [
        { by: '기자', text: '초상권 수입을 해외 회사로 돌려 1470만 유로를 탈세했다는 혐의입니다. 인정하십니까?' },
        { by: '기자', text: '스페인을 떠나겠다는 말까지 했다는 보도가 있는데요?' },
        { by: '날두', text: '(세금 서류는 에이전트한테 맡겼는데… 이걸 어떻게 넘기지?)', inner: true }
      ],
      choices: [
        { id: 'fight', icon: '⚔️', name: '"결백합니다, 끝까지 싸웁니다"', say: '저는 숨길 게 없습니다. 법정에서 끝까지 싸우겠습니다.', desc: '60%: 혐의 일부를 벗는다(민심 +5) · 40%: 패소(벌금: 지갑 코인 -40%, 공격력 -6%)', ai: 1,
          rolls: [
            { p: 0.6, win: true, text: '혐의 일부를 벗었다. 팬들은 "역시 날두"를 외쳤다.', fx: { fans: 5 }, note: '민심 +5' },
            { p: 0.4, text: '패소. 거액의 벌금에 마음고생까지 했다.', fx: { coins: 0.6, mods: { dmg: -0.06 } }, note: '지갑 코인 -40% · 공격력 -6%' }
          ] },
        { id: 'settle', icon: '🤝', name: '합의하고 벌금을 낸다', say: '오해가 있었지만, 합의하고 벌금을 내겠습니다.', desc: '안전: 지갑 코인 -25% · 민심 -5', ai: 0,
          result: { text: '벌금을 내고 집행유예로 끝났다. 이제 축구에만 집중하기로 했다.', fx: { coins: 0.75, fans: -5 }, note: '지갑 코인 -25% · 민심 -5' } },
        { id: 'agent', icon: '🕴️', name: '에이전트에게 미룬다', say: '세금 문제는 전부 에이전트가 처리했습니다. 저는 몰랐어요.', desc: '85%: 에이전트가 책임지고 해고된다(코인 획득 -10%) · 15%: 커리어 종결 (배드 엔딩)', ai: 3,
          rolls: [
            { p: 0.85, win: true, text: '에이전트가 책임을 지고 물러났다. 새 에이전트를 구할 때까지 수입이 줄었다.', fx: { fans: -8, mods: { gold: -0.1 } }, note: '코인 획득 -10% · 민심 -8' },
            { p: 0.15, text: '"서류에 서명한 사람은 본인입니다." 판사는 믿지 않았다.', ending: 'tax_ronaldo' }
          ] }
      ]
    },
    cola: {
      title: '유로 기자회견, 콜라 두 병', who: '대표팀 기자회견장 · 테이블 위 스폰서 콜라',
      lines: [
        { by: '사회자', text: '날두 선수 들어오십니다. 질문 받겠습니다.' },
        { by: '날두', text: '(테이블 위에 스폰서 콜라 두 병이 놓여 있다. 나는 탄산음료를 안 마시는데.)', inner: true },
        { by: '기자', text: '…날두 선수? 콜라를 왜 그렇게 쳐다보시죠?' }
      ],
      choices: [
        { id: 'water', icon: '💧', name: '콜라를 치우고 "아구아!"', say: '(콜라 두 병을 화면 밖으로 치우고 물병을 든다) 아구아!', desc: '건강 관리: 최대 체력 +15 · 민심 +15 · 스폰서가 화났다: 코인 획득 -8%', ai: 0,
          result: { text: '전 세계에 생중계됐다. 그날 스폰서 주가가 출렁였다는 뉴스가 떴다.', fx: { fans: 15, mods: { hp: 15, gold: -0.08 } }, note: '최대 체력 +15 · 코인 획득 -8% · 민심 +15' } },
        { id: 'leave', icon: '😐', name: '그냥 둔다', say: '(못 본 척하고 질문에 답한다)', desc: '아무 일도 없다 · 민심 -3', ai: 1,
          result: { text: '무난하게 끝났다. 아무도 기억하지 못하는 기자회견.', fx: { fans: -3 }, note: '민심 -3' } },
        { id: 'drink', icon: '🥤', name: '원샷한다', say: '(콜라를 따서 단숨에 들이켠다)', desc: '30%: 당이 오른다(이동속도 +8%) · 70%: 배탈(최대 체력 -10) · 웃겼다: 민심 +5', ai: 2,
          rolls: [
            { p: 0.3, win: true, text: '당이 확 올랐다! 그날 경기에서 미친 듯이 뛰었다.', fx: { fans: 5, mods: { moveSpeed: 0.08 } }, note: '이동속도 +8% · 민심 +5' },
            { p: 0.7, text: '경기 전날 밤새 배를 움켜쥐었다…', fx: { fans: 5, mods: { hp: -10 } }, note: '최대 체력 -10 · 민심 +5' }
          ] }
      ]
    },
    morgan: {
      title: '폭로 인터뷰', who: '독설가 방송인 피어쓰 모건 · 단독 인터뷰',
      lines: [
        { by: '모건', text: '솔직하게 말해 봅시다. 지금 구단이 당신을 존중한다고 생각합니까?' },
        { by: '모건', text: '감독이 당신을 일부러 벤치에 앉힌다는 소문도 있던데요.' },
        { by: '날두', text: '(카메라가 돌아가고 있다. 다 말해 버릴까?)', inner: true }
      ],
      choices: [
        { id: 'reveal', icon: '💣', name: '다 폭로한다', say: '배신감을 느낍니다. 구단은 저를 내보내고 싶어 해요.', desc: '분노의 질주: 공격력 +10% · 동료와 서먹: 동료 공격력 -15% · 민심 -5', ai: 1,
          result: { text: '인터뷰가 나간 다음 날, 구단과 결별했다. 화가 나서 공을 더 세게 찼다.', fx: { fans: -5, mods: { dmg: 0.1, teamDmg: -0.15 } }, note: '공격력 +10% · 동료 공격력 -15% · 민심 -5' } },
        { id: 'hold', icon: '🤐', name: '"노코멘트"', say: '그 얘기는 하지 않겠습니다.', desc: '마음을 다스린다: 초당 체력 +0.2 · 민심 +3', ai: 0,
          result: { text: '참았다. 대신 훈련장에 가장 먼저 나왔다.', fx: { fans: 3, mods: { regen: 0.2 } }, note: '초당 체력 +0.2 · 민심 +3' } },
        { id: 'siuu', icon: '📣', name: '"SIUU!"로 대답한다', say: '…SIUUUU!', desc: '50%: 밈이 된다(민심 +15) · 50%: 무성의 논란(민심 -10)', ai: 2,
          rolls: [
            { p: 0.5, win: true, text: '그 장면이 전 세계 밈이 됐다. 팬들이 따라 외쳤다.', fx: { fans: 15 }, note: '민심 +15' },
            { p: 0.5, text: '"질문에 성의가 없다"는 비판이 쏟아졌다.', fx: { fans: -10 }, note: '민심 -10' }
          ] }
      ]
    },
    handgoal: {
      title: '"신의 손" 논란 기자회견', who: '에스빠뇰 더비 직후 · 핸드볼 골 논란',
      lines: [
        { by: '기자', text: '오늘 동점골, 공이 손에 맞고 들어간 것 같은데요? 마라도나의 "신의 손"이 떠오릅니다.' },
        { by: '기자', text: '심판은 못 봤습니다. 손에 맞은 겁니까, 아닙니까?' },
        { by: '메시', text: '(…솔직히 손에 맞긴 했다. 어떻게 말하지?)', inner: true }
      ],
      choices: [
        { id: 'admit', icon: '🙋', name: '"손에 맞았습니다"', say: '손에 맞았어요. 정직하게 인정합니다.', desc: '페어플레이: 치명타 +3% · 민심 +12', ai: 1,
          result: { text: '"어린 선수가 정직하다"는 칭찬이 쏟아졌다.', fx: { fans: 12, mods: { crit: 0.03 } }, note: '치명타 +3% · 민심 +12' } },
        { id: 'god', icon: '✋', name: '"신의 손이었습니다!"', say: '그건… 신의 손이었습니다!', desc: '스킬 "신의 손"을 배운다(이미 있으면 Lv.+1) · 논란: 민심 -8', ai: 0,
          result: { text: '논란이 커졌지만, 그날 밤 꿈에 마라도나가 나와 손을 내밀었다.', fx: { fans: -8, skill: 'hand' }, note: '스킬 "신의 손" · 민심 -8' } },
        { id: 'dunno', icon: '🤷', name: '"기억이 안 나요"', say: '음… 기억이 잘 안 나요.', desc: '50%: 그냥 넘어간다 · 50%: 징계(공격력 -4%)', ai: 2,
          rolls: [
            { p: 0.5, win: true, text: '다음 날 다른 뉴스에 묻혔다. 휴.', fx: {}, note: '변화 없음' },
            { p: 0.5, text: '연맹이 징계를 내렸다. 한동안 위축됐다.', fx: { mods: { dmg: -0.04 } }, note: '공격력 -4%' }
          ] }
      ]
    },
    tax_messi: {
      title: '탈세 의혹 기자회견', who: '스페인 검찰 · 초상권 수입 410만 유로 탈세 혐의',
      lines: [
        { by: '기자', text: '초상권 수입을 해외 회사로 빼돌려 410만 유로를 탈세했다는 혐의입니다. 알고 계셨습니까?' },
        { by: '기자', text: '계약과 돈 관리는 전부 아버님이 하셨다는데, 사실입니까?' },
        { by: '메시', text: '(돈 관리는 아빠가 다 했는데. 나는 축구만 했을 뿐인데…)', inner: true }
      ],
      choices: [
        { id: 'blame', icon: '👨', name: '아버지에게 미룬다', say: '계약은 전부 아버지가 하셨습니다. 저는 몰랐어요.', desc: '90%: 넘어간다, 대신 아버지가 감옥에 간다 · 10%: 커리어 종결 (배드 엔딩)', ai: 1,
          rolls: [
            { p: 0.9, win: true, mood: 'sad', text: '판사는 메시를 믿었다. 대신 아버지가 모든 책임을 지고 감옥에 갔다… 면회실 유리창 너머로 아버지가 웃어 보였다.',
              fx: { fans: -10, flag: 'fatherJail', mods: { gold: -0.15 } }, note: '아버지 수감 · 매니저 공백: 코인 획득 -15% · 민심 -10' },
            { p: 0.1, text: '"몰랐다는 건 변명이 되지 않습니다." 판사는 믿지 않았다.', ending: 'tax_messi' }
          ] },
        { id: 'confess', icon: '🙇', name: '자백한다', say: '제 이름으로 된 일입니다. 모두 인정하고 벌금을 내겠습니다.', desc: '커리어를 조금 잃는다: 공격력 -8%, 최대 체력 -10 (영구) · 민심 +10 · 게임은 계속된다', ai: 0,
          result: { mood: 'calm', text: '모든 걸 인정하고 거액의 벌금을 냈다. 충격으로 몸이 무거워졌지만, 팬들은 정직함을 응원했다.', fx: { fans: 10, mods: { dmg: -0.08, hp: -10 } }, note: '공격력 -8%, 최대 체력 -10 · 민심 +10' } }
      ]
    },
    retire: {
      title: '대표팀 은퇴 기자회견', who: '코파 결승 승부차기 실축 직후 · 믹스트존',
      lines: [
        { by: '기자', text: '3년 연속 결승 패배입니다. 승부차기를 실축하셨는데, 지금 심정이 어떠십니까?' },
        { by: '메시', text: '(…다리에 힘이 하나도 없다. 이제 그만하고 싶다.)', inner: true },
        { by: '기자', text: '대표팀에서 계속 뛰실 겁니까?' }
      ],
      choices: [
        { id: 'quit', icon: '💔', name: '"대표팀은 끝났습니다"', say: '대표팀은… 여기까지인 것 같습니다.', desc: '온 나라가 붙잡는다: 은퇴 번복 뒤 각성(공격력 +8%) · 민심 +10', ai: 0,
          result: { text: '대통령까지 나서서 붙잡았다. 거리마다 "가지 마, 메시" 현수막. 한 달 뒤 은퇴를 번복했다. 각오가 달라졌다.', fx: { fans: 10, mods: { dmg: 0.08 } }, note: '공격력 +8% · 민심 +10' } },
        { id: 'again', icon: '💪', name: '"다시 일어서겠습니다"', say: '아픕니다. 하지만 다시 일어서겠습니다.', desc: '단단해진다: 받는 피해 -1 · 민심 +5', ai: 1,
          result: { text: '눈물을 닦고 다음 대회를 준비했다.', fx: { fans: 5, mods: { armor: 1 } }, note: '받는 피해 -1 · 민심 +5' } }
      ]
    },
    burofax: {
      title: '뷔로팩스 기자회견', who: '2-8 참사 직후 · 팩스로 보낸 이적 요청서',
      lines: [
        { by: '기자', text: '구단에 팩스로 이적 요청서를 보냈다는 게 사실입니까?' },
        { by: '기자', text: '회장단은 "위약금 7억 유로를 내야 나갈 수 있다"고 합니다.' },
        { by: '메시', text: '(이 팀을 사랑한다. 하지만 이대로는…)', inner: true }
      ],
      choices: [
        { id: 'leave', icon: '📠', name: '"떠나고 싶습니다"', say: '떠나고 싶었습니다. 1년 내내 말씀드렸어요.', desc: '50%: 팬들이 편을 든다(경험치 +5%, 민심 +10) · 50%: 회장단과 싸움(공격력 -5%, 민심 -5)', ai: 1,
          rolls: [
            { p: 0.5, win: true, text: '팬들이 "메시는 잘못 없다"며 회장단 퇴진 시위를 열었다.', fx: { fans: 10, mods: { xp: 0.05 } }, note: '경험치 +5% · 민심 +10' },
            { p: 0.5, text: '회장단과의 싸움이 길어졌다. 훈련에 집중이 안 된다.', fx: { fans: -5, mods: { dmg: -0.05 } }, note: '공격력 -5% · 민심 -5' }
          ] },
        { id: 'stay', icon: '❤️', name: '"남겠습니다"', say: '사랑하는 구단과 법정에서 싸울 수는 없습니다. 남겠습니다.', desc: '동료가 다시 뭉친다: 동료 공격력 +10% · 민심 +8', ai: 0,
          result: { text: '"마지막 1년, 최선을 다하겠다." 동료들이 다시 뭉쳤다.', fx: { fans: 8, mods: { teamDmg: 0.1 } }, note: '동료 공격력 +10% · 민심 +8' } }
      ]
    },
    bobo: {
      title: '"뭘 봐, 바보야?" 인터뷰', who: '월드컵 8강 직후 · 믹스트존 생방송',
      lines: [
        { by: '기자', text: '메시, 오늘 경기 정말 거칠었는데요. 상대 감독이 경기 전에 도발했죠?' },
        { by: '메시', text: '(그때 상대 공격수가 이쪽을 노려보며 지나간다.)', inner: true },
        { by: '기자', text: '…메시? 누굴 보시는 거예요?' }
      ],
      choices: [
        { id: 'bobo', icon: '😠', name: '"뭘 봐, 바보야? 저리 가!"', say: '뭘 봐, 바보야? 저리 가! 저리 가라고!', desc: '전설의 밈: 스킬 "뭘 봐, 바보야?"를 배우거나 Lv.+1 · 민심 +20', ai: 0,
          result: { text: '그 한마디가 티셔츠와 머그컵에 찍혀 팔려 나갔다.', fx: { fans: 20, skill: 'bobo' }, note: '스킬 "뭘 봐, 바보야?" · 민심 +20' } },
        { id: 'calm', icon: '😌', name: '차분히 인터뷰를 마친다', say: '…죄송합니다. 질문 계속하시죠.', desc: '초당 체력 +0.2 · 민심 +3', ai: 1,
          result: { text: '평소의 조용한 메시로 돌아왔다.', fx: { fans: 3, mods: { regen: 0.2 } }, note: '초당 체력 +0.2 · 민심 +3' } }
      ]
    }
  };
  // ---- 토레쓰 (round 14): the 2011 crossroads, and the 회상 before each 첼씨 시련 (recall: one answer, no odds; it
  // marks career.recallDone instead of pressDone, so a season can carry both). skipIf: a build flag that skips the
  // scene (성공한 첼씨 토레쓰 is on the 첼씨 path from the start).
  RS.PRESS.crossroads = {
    title: '2011년 1월, 기자회견', who: '안필드 기자회견장 · 첼씨의 5천만 파운드 제안', skipIf: 'blue', prevLook: true,
    lines: [
      { by: '기자', text: '첼씨가 영국 역대 최고 이적료 5천만 파운드를 제시했다는 보도입니다. 떠나는 겁니까?' },
      { by: '토레쓰', text: '(2007년 첫 시즌 24골. 제라두의 롱패스, 콥의 함성, "You\'ll Never Walk Alone"… 다 여기서였다.)', inner: true },
      { by: '토레쓰', text: '(하지만 트로피는 없었다. 런던에 가면 우승할 수 있다. 다만, 그 돈의 무게를 견딜 수 있을까.)', inner: true },
      { by: '기자', text: '토레쓰 선수, 대답해 주시죠.' }
    ],
    choices: [
      { id: 'chelsea', icon: '🔵', name: '"런던으로 갑니다"', say: '트로피를 들고 싶습니다. 첼씨로 갑니다.', desc: '첼씨 토레쓰 B등급으로 시작 · 시련 4개: 하나 넘을 때마다 등급 +1(B→A→S→SS→SSS) · 마지막은 캄프 누 900억 골 · 다 넘으면 성공한 첼씨 토레쓰 획득', ai: 0,
        result: { mood: 'calm', text: '5천만 파운드. 파란 유니폼을 입은 첫날부터 숫자가 등에 붙어 다녔다.', fx: { flag: { path: 'chelsea', cgrade: 0 } }, note: '첼씨 토레쓰 B등급 · 시련 1/4 시작' } },
      { id: 'stay', icon: '🔴', name: '"안필드에 남겠습니다"', say: '제 집은 여기입니다. 리버풀에 남겠습니다.', desc: '리버풀 잔류 확정 · 칭호 "안필드의 9번"(공격력 +5%, 최대 체력 +10) · 민심 +10 · 대신 이빨괴물 수아레즈가 보스로 온다(한 번 잡으면 준보스로 불쑥불쑥)', ai: 1,
        result: { mood: 'good', win: true, text: '콥이 노래를 멈추지 않았다. 그리고 1월, 이빨괴물 수아레즈가 안필드에 도착했다.', fx: { flag: { path: 'liverpool', lfcTitle: true }, mods: { dmg: 0.05, hp: 10 }, fans: 10 }, note: '칭호 "안필드의 9번" · 공격력 +5%, 최대 체력 +10 · 민심 +10' } }
    ]
  };
  const RECALL = (title, lines) => ({
    title, who: '회상 · 꼴사나운 장면', recall: true, lines,
    choices: [{ id: 'go', icon: '😤', name: '…그래도 뛴다', say: '다 봤다. 그래도 뛴다.', desc: '시련 시작', ai: 0, result: { mood: 'calm', text: '숨을 고르고 터널을 나선다.', fx: {}, note: '시련 시작' } }]
  });
  RS.PRESS.recall1 = RECALL('회상 — 903분', [
    { by: '회상', text: '2011년 1월, 첼씨 데뷔전. 상대는 하필 리버풀. 90분 동안 공이 발에 붙지 않았다.' },
    { by: '회상', text: '한 골도 없이 2월, 3월… 첫 골까지 903분. 기자들은 "5천만 파운드짜리 무득점"이라고 썼다.' },
    { by: '토레쓰', text: '(안필드에서는 이러지 않았는데. 뭐가 달라진 거지.)', inner: true }
  ]);
  RS.PRESS.recall2 = RECALL('회상 — 텅 빈 골문', [
    { by: '회상', text: '2011년 9월, 맨유전. 아넬까의 패스가 정확히 왔다. 1대1. 수문장 데게아르까지 제쳤다.' },
    { by: '회상', text: '골문은 비어 있었다. 공은… 옆그물 바깥으로. 올드 트래퍼드 전체가 웃었다. 그날 밤 세계의 짤이 됐다.' },
    { by: '토레쓰', text: '(왜 그걸 못 넣었지. 지금도 모르겠다.)', inner: true }
  ]);
  RS.PRESS.recall3 = RECALL('회상 — 벤치의 겨울', [
    { by: '회상', text: '2012년 1월, 백조단 원정. 또 빈 골문 앞에서 헛발질. 벤치가 길어졌다. 등번호 9번이 무거웠다.' },
    { by: '회상', text: '팬들은 "900억짜리 벤치"라고 불렀다. 감독이 바뀌었다. 대행 감독 디마떼오는 말했다. "한 골이면 다 바뀐다."' },
    { by: '토레쓰', text: '(한 골. 딱 한 골이면.)', inner: true }
  ]);
  RS.PRESS.recall4 = RECALL('회상 — 캄프 누 전야', [
    { by: '회상', text: '2012년 4월, 챔스 4강 2차전. 상대는 메시의 바르샤. 1차전 1-0, 하지만 캄프 누에서 테뤼가 퇴장당했다. 10명.' },
    { by: '회상', text: '2-2. 추가시간. 바르샤가 전원 공격으로 올라온다. 하프라인에 혼자 남은 토레쓰 앞으로… 공이 굴러온다.' },
    { by: '토레쓰', text: '(발기스 하나다. 900억을 한 번에 갚는다.)', inner: true }
  ]);
  // A move taught by a press answer while the skill bar is full becomes this small lasting boost instead.
  RS.PRESS_FULL_MODS = { dmg: 0.05 };
  // Bad endings: the career stops there (RS.applyPress sets career.over); a new career starts from scratch.
  RS.ENDINGS = {
    tax_messi: { icon: '⚖️', title: '배드 엔딩 — 410만 유로의 대가', text: '유죄 판결과 출전 정지. 스물여섯 살에 축구화를 벗었다. 지금은 로사리오의 작은 골목에서 아이들에게 공을 차 주며 산다. "그때 솔직하게 말했더라면…"' },
    tax_ronaldo: { icon: '⚖️', title: '배드 엔딩 — 서명은 본인이 했다', text: '유죄 판결과 함께 커리어가 멈췄다. 마데이라 바닷가에서 혼자 프리킥을 찬다. SIUU를 외쳐도 대답하는 관중이 없다.' }
  };
  // 민심 (fan opinion, 0–100, b.fans): moved by press answers; its tier is a lasting buff or curse.
  RS.FANS = {
    start: 50,
    tiers: [
      { min: 85, key: 'love', name: '열광', icon: '🔥', mods: { gold: 0.15, regen: 0.3, dmg: 0.05 }, text: '코인 +15%, 초당 체력 +0.3, 공격력 +5%' },
      { min: 65, key: 'like', name: '호감', icon: '👏', mods: { gold: 0.08 }, text: '코인 +8%' },
      { min: 30, key: 'calm', name: '보통', icon: '🙂', mods: {}, text: '효과 없음' },
      { min: 11, key: 'boo', name: '야유', icon: '👎', mods: { dmg: -0.06 }, text: '공격력 -6%' },
      { min: 0, key: 'hate', name: '비난 폭주', icon: '🤬', mods: { dmg: -0.1, gold: -0.1 }, text: '공격력 -10%, 코인 -10%' }
    ]
  };
  RS.YEARS_RONALDO = RS.YEARS;
  RS.HERO = 'ronaldo';
  // build (round 14): the career's path (토레쓰 after 2011) picks its season list, and 성공한 첼씨 토레쓰 (flags.blue)
  // wears 첼씨 blue all career (RS.TORRES_BLUE, read by the sprites)
  RS.selectHero = function (hero, build) {
    const h = RS.HEROES[hero] ? hero : 'ronaldo';
    RS.HERO = h;
    RS.YEARS = RS.yearsFor(h, build);
    RS.TORRES_BLUE = h === 'torres' && !!(build && build.flags && build.flags.blue);
    RS.DEBUT_YEAR = RS.HEROES[h].debut;
    RS.BIRTH_YEAR = RS.HEROES[h].birth;
    return h;
  };
  RS.TORRES_BLUE = false;
  RS.DEBUT_YEAR = 2002;
  RS.BIRTH_YEAR = 1985;

  // Difficulty index of a season: youth seasons play like the debut year, pro seasons count from the debut, so
  // both heroes' pro careers share one curve.
  RS.tuneIdx = function (yearIdx) {
    if (RS.YEARS[yearIdx].youth) return 0;
    let k = yearIdx;
    for (let i = 0; i < yearIdx; i++) if (RS.YEARS[i].youth) k--;
    return k;
  };

  // The mid-career wall: from pro season WALL.from on, the crowd outgrows a maxed build — per season past it
  // enemies gain hp/hp2 (linear/quadratic) HP, dmg damage, speed, spawn density and boss damage, and poise:
  // knockback and stun on them shrink to 1 / (1 + poise × seasons), so a crowd can no longer be held off forever.
  // round 11: hp 0.25 → 0.05, hp2 0.012 → 0, spawn 0.025 → 0.015 (one weapon instead of six moves: the crowd outgrew
  // even a 황금 +10 build and piled up to 300 men on screen)
  RS.WALL = { from: 5, hp: 0.05, hp2: 0, dmg: 0.04, speed: 0.004, spawn: 0.015, boss: 0.05, poise: 0.12, ref: 0.08, final: 0 };
  // the final duel boss: damage × (1 + FINAL_DMG × season index). Round 11: 0.11 → 0.065 — a one-weapon build
  // (≈340 HP at the final) fell to four of 메시's balls: the strong bot won 4 finals of 8 and the weak bot none;
  // now 7 of 8 (6 of them below half HP) and 2 of 8 (0.07 still left the weak bot without a win)
  RS.FINAL_DMG = 0.065;
  // 고난의 시즌 (RS.YEARS[i].trial = 1–3): per level, on top of the curve.
  // round 11: a hard season is tougher, not more crowded (spawn 0.1 → 0), and by about half as much (hp 0.18,
  // dmg 0.12, boss 0.15, fight 0.12, poise 0.1 before): with one weapon 날두's four trial seasons in a row (2004-07)
  // walled a strong bot with half the 훈련장 on 노멀 at 2007 in five seeds of nine
  RS.TRIAL = { hp: 0.1, dmg: 0.07, spawn: 0, boss: 0.09, fight: 0.08, poise: 0.06 };

  // Per-year tuning derived from the difficulty index so new years need no extra numbers.
  RS.yearTuning = function (yearIdx) {
    const y = RS.YEARS[yearIdx], idx = RS.tuneIdx(yearIdx);
    const gentle = [0.32, 0.6, 0.75, 0.88][idx] || 1; // first seasons: phone newcomers (2003-05 used to spike)
    // the final is a duel: its crowd stays off the wall (WALL.final = how much of it still applies)
    const W = RS.WALL, w = Math.max(0, idx - W.from) * (y.final ? W.final : 1), L = y.trial || 0, T = RS.TRIAL, tw = y.twist || {};
    const hw = RS.HEROES[RS.HERO].wall || 1; // the hero's own wall steepness (메시: orbit, aura and stun keep crowds off)
    const wallHp = 1 + (W.hp * w + W.hp2 * w * w) * hw;
    // difficulty (RS.DIFFS): 이지's discounts apply from the start; 노멀/하드's extra toughness grows in over the first
    // three pro seasons (the debut plays as it always did, so a newcomer can learn the controls)
    const D = RS.DIFFS[RS.DIFF] || RS.DIFFS.normal, g = 1 + D.grow * idx, ramp = D.ramp ? Math.min(1, idx / D.ramp) : 1;
    const dv = (v) => 1 + (v - 1) * ramp;
    // round 11: the crowd's HP curve follows one weapon, not six moves (was 1 + 0.55 idx + 0.03 idx², bosses too)
    const curve = 1 + 0.4 * idx + 0.004 * idx * idx;
    const t = {
      hpMul: curve * wallHp * (1 + T.hp * L) * dv(D.hp) * g,
      wallHp, // 준보스 leave this out: they already scale with the season and must stay killable (World.spawnEnemy)
      // round 13.2: the crowd's hits no longer take the newcomer discount (a debut 수비수 hit for 2 of 100 HP: "맞은
      // 줄도 모르겠음"); bosses keep it
      dmgMul: (1 + 0.08 * idx) * (idx === 0 ? 0.55 : 1) * (1 + W.dmg * w) * (1 + T.dmg * L) * dv(D.dmg) * g,
      wallDmg: 1 + W.dmg * w, // 준보스 leave this out too
      speedMul: 1 + 0.008 * idx + W.speed * w,
      poise: dv(D.poise) / (1 + W.poise * w + T.poise * L), // × knockback and stun taken by ordinary enemies
      // round 11: far fewer in the 20s, the crowd grows late (was (2.3 + 0.18 idx) and up to 150 + 12 idx alive)
      spawnRate: (1 + 0.04 * idx + 0.0025 * idx * idx) * (idx === 0 ? 0.7 : 1) * (1 + W.spawn * w) * (1 + T.spawn * L) * (1 + (D.spawn - 1) * (D.spawnRamp ? Math.min(1, idx / D.spawnRamp) : 1)) * D.crowd,
      healMul: dv(D.heal), // × the heal drop chance
      crowd: D.crowd, // × the packs and the minimum-men floor (World.updateSpawns)
      maxAlive: Math.round(Math.min(RS.CROWD.cap[2], Math.round(RS.CROWD.cap[0] + RS.CROWD.cap[1] * idx)) * D.crowd), // round 12: was min(150, 40 + 5 idx)
      duration: 60 + (tw.extra || 0), // one minute per season (+ 연장전), then the boss
      // inside a stage enemies visibly toughen: by the end they have this much more HP / damage / speed
      rampHp: 0.35, rampDmg: 0.12 * gentle, rampSpeed: 0.1, // speed ramp: normal-pace enemies only
      xpMul: 1 + 0.16 * idx,
      bossHpMul: curve,
      // the final duel keeps its own bite (tuned with World.finalScale / finalPace), outside the wall
      bossDmgMul: (y.final ? 1 + RS.FINAL_DMG * idx : (1 + 0.1 * idx) * gentle * (1 + W.boss * w) * (1 + T.boss * L) * g) * dv(D.boss),
      bossCool: (idx === 0 ? 1.2 : 1) * dv(D.bossCool),
      bossDensity: Math.min(0.85, 0.7 + 0.04 * idx) * (RS.DIFF === 'hard' ? 1.1 : 1), // fewer bullets on screen: readable fights
      minis: 1 + Math.floor(idx / 10), // mini-bosses per wave (4 waves a stage; 2 in the debut year)
      bossFight: (idx === 0 ? 0.7 : idx === 1 ? 0.85 : 1) * (1 + T.fight * L), // shorter boss fights for newcomers
      mix: [{ type: 'grunt', w: 10 }]
    };
    if (idx >= 1) t.mix.push({ type: 'runner', w: 4 + Math.min(4, idx * 0.3) });
    if (idx >= 3) t.mix.push({ type: 'tank', w: 1.2 + Math.min(2, idx * 0.1) });
    // rare: ranged mobs clutter the screen — though past the wall more of them shoot (a crowd you cannot just outlast)
    if (idx >= 7) t.mix.push({ type: 'ref', w: 0.5 + Math.min(0.6, idx * 0.03) + Math.min(1.5, W.ref * w) });
    for (const m of tw.mix || []) t.mix.push(m);
    return t;
  };

  // ---------------------------------------------------------------- Meta progression (permanent, bought between runs)
  // cost: coins per level (array) or ballon cost. 발롱도르 come from real Ballon d'Or years and beating 메시.
  // Cheap first steps and more of them: something is affordable after almost every match.
  RS.META = {
    might: { name: '근력 훈련', icon: '🏋️', desc: '공격력 +5%', max: 10, cost: [40, 70, 110, 160, 220, 290, 370, 460, 560, 680], mods: { dmg: 0.05 } },
    vitality: { name: '심폐 지구력', icon: '❤️', desc: '최대 체력 +10', max: 10, cost: [30, 55, 90, 130, 180, 240, 310, 390, 480, 580], mods: { hp: 10 } },
    swift: { name: '스프린트', icon: '👟', desc: '이동속도 +4%', max: 5, cost: [50, 110, 190, 290, 420], mods: { moveSpeed: 0.04 } },
    magnetM: { name: '시야', icon: '🧲', desc: '흡수 범위 +15%', max: 6, cost: [35, 70, 120, 180, 260, 350], mods: { magnet: 0.15 } },
    growth: { name: '전술 이해', icon: '📘', desc: '경험치 +6%', max: 10, cost: [40, 70, 110, 160, 220, 290, 370, 460, 560, 680], mods: { xp: 0.06 } },
    greed: { name: '스폰서 계약', icon: '💰', desc: '코인 획득 +10%', max: 10, cost: [30, 55, 90, 130, 180, 240, 310, 390, 480, 580], mods: { gold: 0.10 } },
    cooldown: { name: '회복 훈련', icon: '⏳', desc: '쿨타임 -3%', max: 6, cost: [70, 140, 230, 340, 470, 620], mods: { cd: -0.03 } },
    luck: { name: '행운 부적', icon: '🍀', desc: '특수 카드·희귀 이상 확률 +10% (시즌이 안 된 등급은 안 열림)', max: 5, cost: [60, 120, 200, 300, 420], mods: { luck: 0.1 } },
    revive: { name: '불사조 정신', icon: '🔥', desc: '연도마다 1회 부활', max: 1, ballon: [2], mods: { revive: 1 } },
    // round 10: 골결정력 for penalties only (RS.pkFinishing), no match stat
    pkdrill: { name: 'PK 훈련', icon: '🎯', desc: '페널티킥 골결정력 +3', max: 5, cost: [60, 120, 200, 300, 420], mods: {} },
    reroll: { name: '전술 보드', icon: '🔁', desc: '레벨업 리롤 +1', max: 3, ballon: [1, 1, 1], mods: { reroll: 1 } }
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).data = 'R35';
