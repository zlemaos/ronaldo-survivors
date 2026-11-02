/* 호날두 서바이버즈 — data tables. Pure data, no DOM. See docs/DESIGN.md for how to add content.
 * Parody safety: real people get a twisted spelling that still reads at a glance (챠비, 니에미스타, 무링요);
 * clubs use parody names. Only 날두 and 메시 keep their names. */
(function (RS) {
  'use strict';

  RS.MAX_SKILLS = 6;
  RS.MAX_PASSIVES = 6;
  RS.MAX_MATES = 2;   // on the pitch with 날두
  RS.MAX_BENCH = 3;   // bench warmers: weak passive synergy only
  RS.BENCH_FACTOR = 0.34;
  RS.MATE_MAX_LV = 10;
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

  // ---------------------------------------------------------------- Skills (active, auto-firing)
  // Each skill: lv[] holds stats for level 1..max; evo holds evolved stats. passive = paired passive for evolution.
  RS.SKILLS = {
    kick: {
      name: '축구공 킥', icon: '⚽', passive: 'boots', hero: 'ronaldo', evoName: '황금 발롱볼', evoIcon: '🏆',
      desc: '가장 가까운 적에게 축구공을 찬다.',
      evoDesc: '황금 공이 적 사이를 튕기며 관통한다.',
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
      name: '무회전 프리킥', icon: '🎯', passive: 'freekick', hero: 'ronaldo', evoName: '무회전 대포알', evoIcon: '💥',
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
      name: '헤딩 점프', icon: '🦘', passive: 'jump', hero: 'ronaldo', evoName: '2.56m 슈퍼 헤더', evoIcon: '🚀',
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
      name: '바이시클 킥', icon: '🌀', passive: 'flex', hero: 'ronaldo', evoName: '오버헤드 토네이도', evoIcon: '🌪️',
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
      name: '스텝오버', icon: '💨', passive: 'speed', hero: 'ronaldo', evoName: '환상 스텝오버', evoIcon: '👻',
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
      name: '시저스 킥', icon: '✂️', passive: 'finisher', hero: 'ronaldo', evoName: '더블 시저스', evoIcon: '⚔️',
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
    // 메시 only: balls circle him instead of projectiles — a plain white ball, golden from Lv.goldLv, the 발롱도르
    // trophy ball once evolved (RS.orbitLook). Two evolutions: 8 balls or one ball 8× the size.
    // upW: his only weapon at the start, so its upgrade card comes up more often than other upgrades.
    orbit: {
      name: '회전 공', icon: '⚽', passive: 'ballon', hero: 'messi', evoName: '8발롱도르', evoIcon: '🌕', goldLv: 3, upW: 3,
      desc: '공이 메시 주위를 빙글빙글 돌며 닿는 적을 때린다. Lv3부터 황금 공, 진화하면 발롱도르.',
      evoDesc: '발롱도르로 진화: 공 8개 또는 8배 크기의 공.',
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
        count: { name: '8발롱도르공', icon: '🟡', desc: '발롱도르 8개가 쉴 새 없이 돈다.', stats: { dmg: 30, cd: 0.3, count: 8, size: 1.6, speed: 4.4, radius: 44 } },
        size: { name: '8발롱도르', icon: '🌕', desc: '거대한 발롱도르 하나(8배)가 모든 것을 쓸어버린다.', stats: { dmg: 46, cd: 0.32, count: 1, size: 8, speed: 2.6, radius: 46, knock: 90 } }
      }
    },
    // 날두: a curling boomerang ball, out and back, piercing both ways (catching it = 볼 트래핑).
    rabona: {
      name: '라보나 킥', icon: '🪃', passive: 'trap', hero: 'ronaldo', evoName: '라보나 부메랑 폭풍', evoIcon: '🌪️',
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
      name: '불꽃 질주', icon: '🔥', passive: 'fitness', hero: 'ronaldo', evoName: '지옥의 레드카펫', evoIcon: '☄️',
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
    // ---- 메시 only: his own moves. `use` names the runtime behaviour a move shares with a 날두 move (own name,
    // numbers and evolution); proj = [normal, evolved] ball look. A hero never sees the other hero's moves.
    // 메시 never shoots or throws a ball himself: `passer` is the teammate who plays it for him (챠비 or
    // 니에미스타 runs beside him; the squad member himself when he is on the pitch — World.passerFor).
    tiki: {
      name: '티키타카', icon: '🔁', passive: 'leftfoot', hero: 'messi', use: 'kick', passer: 'xavino', proj: ['tiki', 'golden'], evoName: '티키타카 오케스트라', evoIcon: '🎼',
      desc: '챠비가 찔러 준 짧은 패스가 적과 적 사이를 튕기며 이어진다.',
      evoDesc: '챠비의 황금 패스가 멈추지 않고 적 사이를 누빈다.',
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
      desc: '니에미스타가 크게 감아 찬 공이 휘어 들어가 적을 노린다.',
      evoDesc: '니에미스타의 세 갈래 감아차기가 적을 꿰뚫고, 치명타가 잘 터진다.',
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
      desc: '니에미스타가 수비 라인을 꿰뚫는 스루패스를 곧게 찔러 준다.',
      evoDesc: '니에미스타의 거대한 패스가 모든 수비를 꿰뚫는다.',
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
      desc: '챠비가 수비 머리 위로 띄운 공이 가장 센 적(보스 우선) 위에 떨어진다.',
      evoDesc: '챠비의 황금 로빙 패스 세 개가 한꺼번에 떨어져 크게 터진다.',
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
    }
  };
  RS.SKILL_MAX = 6;
  // 각성 (★): an evolved move keeps growing — every star: that move's damage +12 %, cooldown −4 %.
  RS.STAR_MAX = 5;
  RS.STAR_STEP = { dmg: 0.12, cd: -0.04 };

  // Old 메시 careers (saved before the heroes had separate moves) can hold 날두's moves: RS.normalizeBuild turns
  // each into 메시's counterpart (level and evolution kept).
  RS.MESSI_COUNTERPART = {
    skills: { kick: 'tiki', knuckle: 'killpass', header: 'chip', bicycle: 'elastico', stepover: 'solo', scissors: 'curler', siuu: 'bobo', rabona: 'curler', trail: 'solo' },
    passives: { boots: 'leftfoot', freekick: 'vision', jump: 'calm', flex: 'samba', speed: 'lowcenter', finisher: 'curve', charisma: 'grit', fitness: 'grit', trap: 'vision' },
    relics: { honaldo: 'messia', lunchbox: 'mate' }
  };

  // ---------------------------------------------------------------- Passives
  // mods are applied once per level. Keys: see RS.computeStats in game.js.
  RS.PASSIVES = {
    boots: { name: '황금 축구화', icon: '👟', desc: '공격력 +10%', mods: { dmg: 0.10 } },
    freekick: { name: '프리킥 연습', icon: '🥅', desc: '투사체 속도 +10%, 지속 +5%', mods: { projSpeed: 0.10, dur: 0.05 } },
    jump: { name: '점프력', icon: '🦵', desc: '공격 범위 +10%', mods: { area: 0.10 } },
    flex: { name: '유연성', icon: '🧘', desc: '쿨타임 -7%', mods: { cd: -0.07 } },
    speed: { name: '스피드 훈련', icon: '🏃', desc: '이동속도 +8%', mods: { moveSpeed: 0.08 } },
    finisher: { name: '골 결정력', icon: '🎯', desc: '치명타 확률 +6%', mods: { crit: 0.06 } },
    charisma: { name: '카리스마', icon: '😎', desc: '기절·지속시간 +12%', mods: { dur: 0.12 } },
    fitness: { name: '체력 단련', icon: '💪', desc: '최대 체력 +20', mods: { hp: 20 } },
    trap: { name: '볼 트래핑', icon: '🧲', desc: '아이템 흡수 범위 +30%', mods: { magnet: 0.30 } },
    recovery: { name: '회복 루틴', icon: '💤', desc: '초당 체력 +0.25', mods: { regen: 0.25 } },
    icebath: { name: '얼음 목욕', icon: '🧊', desc: '받는 피해 -1', mods: { armor: 1 } },
    ballon: { name: '발롱도르 수집', icon: '🏆', desc: '공격력 +6%, 범위 +6%', mods: { dmg: 0.06, area: 0.06 }, hero: 'messi' },
    // 메시's own training. A passive paired only with the other hero's moves is never offered (RS.passiveFor).
    leftfoot: { name: '왼발 장인', icon: '🦶', desc: '공격력 +10%', mods: { dmg: 0.10 } },
    curve: { name: '감아차기 감각', icon: '🌙', desc: '치명타 확률 +6%', mods: { crit: 0.06 } },
    lowcenter: { name: '낮은 무게중심', icon: '⬇️', desc: '이동속도 +8%', mods: { moveSpeed: 0.08 } },
    grit: { name: '승부욕', icon: '💢', desc: '최대 체력 +20', mods: { hp: 20 } },
    vision: { name: '넓은 시야', icon: '👁️', desc: '투사체 속도 +10%, 지속 +5%', mods: { projSpeed: 0.10, dur: 0.05 } },
    calm: { name: '침착함', icon: '😌', desc: '공격 범위 +10%', mods: { area: 0.10 } },
    samba: { name: '삼바 리듬', icon: '💃', desc: '쿨타임 -7%', mods: { cd: -0.07 } }
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

  // ---------------------------------------------------------------- 특수 카드: graded items ("개사기" grades)
  // A level-up sometimes deals a 4th card of a grade: 레어 < 히든 < 초히든 < 슈퍼히든, or a gamble card.
  // Each item is owned once and kept for the career. mods use the RS.computeStats keys; fx names a runtime
  // effect in game.js (World.updateRelics, damageEnemy, killEnemy, the dice reroll).
  RS.TIERS = {
    rare: { name: '레어', color: '#4aa8ff' },
    hidden: { name: '히든', color: '#b65cff' },
    ultra: { name: '초히든', color: '#ff4a4a' },
    super: { name: '슈퍼히든', color: '#ffd84a' }
  };
  RS.TIER_ORDER = ['rare', 'hidden', 'ultra', 'super'];
  RS.TIER_POWER = { rare: 12, hidden: 25, ultra: 45, super: 80 }; // 전투력 points per item
  // chance per level-up that the 4th card is of that grade (relic odds × (1 + luck)), else maybe a gamble card.
  // Rare on purpose: about one graded card in ten level-ups, so the items last a whole career (슈퍼히든 ≈ once).
  RS.SPECIAL_ODDS = { super: 0.0025, ultra: 0.007, hidden: 0.025, rare: 0.07, gamble: 0.1 };
  RS.RELICS = {
    dice: { tier: 'rare', icon: '🎲', name: '행운의 주사위', desc: '선택지가 나올 때마다 1번 무료로 다시 굴린다', fx: 'dice' },
    ion: { tier: 'rare', icon: '🥤', name: '이온 음료', desc: '이동속도 +10%, 초당 체력 +0.4', mods: { moveSpeed: 0.10, regen: 0.4 } },
    armband: { tier: 'rare', icon: '🎗️', name: '주장 완장', desc: '동료 공격력 +35%, 동료 쿨타임 -15%', mods: { teamDmg: 0.35, teamCd: -0.15 } },
    contract: { tier: 'rare', icon: '📈', name: '연봉 협상', desc: '코인 획득 +40%', mods: { gold: 0.4 } },
    clover: { tier: 'rare', icon: '🍀', name: '네잎클로버', desc: '특수 카드 등장 확률 +50%', mods: { luck: 0.5 } },
    spikes: { tier: 'rare', icon: '👟', name: '스파이크 축구화', desc: '공격력 +12%, 치명타 +5%', mods: { dmg: 0.12, crit: 0.05 } },
    lunchbox: { tier: 'rare', icon: '🍱', name: '에그타르트 도시락', desc: '최대 체력 +25, 먹는 즉시 체력 완전 회복', mods: { hp: 25 }, fx: 'fullheal', hero: 'ronaldo' },
    mate: { tier: 'rare', icon: '🧉', name: '마테차 보온병', desc: '최대 체력 +25, 마시는 즉시 체력 완전 회복', mods: { hp: 25 }, fx: 'fullheal', hero: 'messi' },
    shinpad: { tier: 'rare', icon: '🦵', name: '정강이 보호대', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
    adrenaline: { tier: 'hidden', icon: '⚡', name: '아드레날린', desc: '체력이 절반 이하면 공격력 +60%', fx: 'adrenaline' },
    goldboot: { tier: 'hidden', icon: '🥇', name: '골든 부트', desc: '공격력 +25%', mods: { dmg: 0.25 } },
    heart: { tier: 'hidden', icon: '🫀', name: '강철 심장', desc: '쿨타임 -12%, 이동속도 +6%', mods: { cd: -0.12, moveSpeed: 0.06 } },
    blackhole: { tier: 'hidden', icon: '🌀', name: '블랙홀 트래핑', desc: '흡수 범위 +120%, 경험치 +15%', mods: { magnet: 1.2, xp: 0.15 } },
    bomb: { tier: 'hidden', icon: '💥', name: '폭발 슈팅', desc: '쓰러진 적이 폭발해 주변 적까지 쓸어버린다', fx: 'bomb' },
    sniper: { tier: 'hidden', icon: '🎯', name: '저격수의 눈', desc: '치명타 +15%, 보스에게 주는 피해 +15%', mods: { crit: 0.15, bossDmg: 0.15 } },
    whistle: { tier: 'ultra', icon: '⏱️', name: '추가시간 휘슬', desc: '12초마다 휘슬! 보스를 뺀 모든 적이 2초간 멈춘다', fx: 'whistle' },
    legend: { tier: 'ultra', icon: '🧬', name: '레전드 DNA', desc: '공격력 +40%, 치명타 +10%, 범위 +15%', mods: { dmg: 0.4, crit: 0.1, area: 0.15 } },
    crowd: { tier: 'ultra', icon: '🏟️', name: '홈 관중의 함성', desc: '최대 체력 +40, 초당 체력 +1.5, 받는 피해 -2', mods: { hp: 40, regen: 1.5, armor: 2 } },
    overdrive: { tier: 'ultra', icon: '⏩', name: '오버드라이브', desc: '쿨타임 -25%, 투사체 속도 +25%', mods: { cd: -0.25, projSpeed: 0.25 } },
    // 메시 only (his growth-hormone story). Stats only: a 하드 모드 body stays small.
    doping: { tier: 'ultra', icon: '💉', name: '약물 꽂기', desc: '성장호르몬 한 방 더! 올스탯 상승: 공격 +20%, 체력 +30, 이동 +8%, 쿨타임 -10%, 범위·흡수 +15%, 치명타 +5%, 받는 피해 -1',
      mods: { dmg: 0.2, hp: 30, moveSpeed: 0.08, cd: -0.1, area: 0.15, magnet: 0.15, crit: 0.05, armor: 1 }, hero: 'messi' },
    honaldo: { tier: 'super', icon: '🥋', name: '호날도', desc: '전설의 무술. 3초마다 정권 → 회오리 발차기 → 내려찍기 3연타 (호! 날! 도!)', fx: 'honaldo', hero: 'ronaldo' },
    messia: { tier: 'super', icon: '✨', name: '메시아', desc: '구세주의 기적. 3초마다 드리블 돌파 → 감아차기 연사 → 기적의 일격 3연타 (메! 시! 아!)', fx: 'messia', hero: 'messi' },
    meteor: { tier: 'super', icon: '🌠', name: '별똥별 슛', desc: '4초마다 하늘에서 황금 공 8개가 적에게 쏟아진다', fx: 'meteor' },
    goat: { tier: 'super', icon: '🐐', name: 'GOAT', desc: '공격력 +50%, 쿨타임 -15%, 최대 체력 +60, 이동속도 +12%, 받는 피해 -2', mods: { dmg: 0.5, cd: -0.15, hp: 60, moveSpeed: 0.12, armor: 2 } }
  };
  // 도박 카드: rolled when picked; the odds are printed on the card. Outcome keys: levels (extra level-ups),
  // relic (grade odds), hpHalf, coinMul (this match's coins), text (result line). needCoins: shown only with coins.
  RS.GAMBLES = {
    coin: { icon: '🪙', name: '동전 던지기', desc: '앞면(50%): 레벨 +2 · 뒷면(50%): 꽝',
      outcomes: [{ p: 0.5, win: true, levels: 2, text: '앞면! 레벨 +2' }, { p: 0.5, text: '뒷면… 꽝!' }] },
    roll: { icon: '🎲', name: '주사위 한 판', desc: '5~6(33%): 히든 아이템 · 1~4(67%): 체력 절반',
      outcomes: [{ p: 0.33, win: true, relic: { hidden: 1 }, text: '주사위 6! 히든 아이템' }, { p: 0.67, hpHalf: true, text: '주사위 1… 체력 절반' }] },
    slot: { icon: '🎰', name: '슬롯머신', desc: '2% 슈퍼히든 · 6% 초히든 · 22% 레어 · 70% 꽝',
      outcomes: [{ p: 0.02, win: true, relic: { super: 1 }, text: '777 잭팟!! 슈퍼히든' }, { p: 0.06, win: true, relic: { ultra: 1 }, text: '초히든 당첨!' },
        { p: 0.22, win: true, relic: { rare: 1 }, text: '레어 당첨' }, { p: 0.7, text: '꽝! 다음 기회에' }] },
    allin: { icon: '💰', name: '올인 베팅', desc: '이번 경기 코인 전부: 45% 3배 · 55% 전부 잃음', needCoins: 10,
      outcomes: [{ p: 0.45, win: true, coinMul: 3, text: '대박! 코인 3배' }, { p: 0.55, coinMul: 0, text: '쪽박… 코인 전부 잃음' }] },
    devil: { icon: '😈', name: '악마의 계약', desc: '30%: 초히든 아이템 · 70%: 체력 절반',
      outcomes: [{ p: 0.3, win: true, relic: { ultra: 1 }, text: '계약 성립! 초히든 아이템' }, { p: 0.7, hpHalf: true, text: '악마가 웃는다… 체력 절반' }] }
  };
  // Coin shop on every level-up screen: paid rerolls any number of times, one grade draw per level-up.
  // Coins come from this match first, then the wallet (훈련장 money). A draw costs more with every item owned
  // (RS.drawCost: cost × (1 + DRAW_COST_STEP × items)), so a rich wallet cannot buy the whole collection at once.
  RS.COIN_REROLL = 8;
  RS.DRAW_COST_STEP = 0.5;
  RS.COIN_DRAWS = [
    { id: 'rare', icon: '💎', name: '레어 이상', cost: 25, odds: { rare: 0.8, hidden: 0.16, ultra: 0.035, super: 0.005 } },
    { id: 'hidden', icon: '🔮', name: '히든 이상', cost: 70, odds: { hidden: 0.78, ultra: 0.19, super: 0.03 } },
    { id: 'ultra', icon: '👑', name: '초히든 이상', cost: 160, odds: { ultra: 0.9, super: 0.1 } }
  ];
  RS.CHEST_RELIC = { chance: 0.05, odds: { rare: 0.85, hidden: 0.13, ultra: 0.02 } }; // a graded item in a chest

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
    ] }
  };

  // Extra coach cards that can appear in any coach pick.
  RS.COACH_EXTRA = {
    recruit: { id: 'recruit', name: '동료 영입', icon: '🤝', desc: '이 시대의 동료 1명이 합류한다.' },
    train: { id: 'train', name: '동료 특훈', icon: '📈', desc: '모든 동료 레벨 +1' }
  };

  // ---------------------------------------------------------------- Teammates (parody nicknames)
  // role: defender | keeper | winger | mid | striker. era: where they can be found (rescue markers prefer the current era).
  RS.ROLES = {
    // {hero} = the playing hero's short name (RS.mateLine)
    defender: { name: '수비수', desc: '{hero} 주위를 돌며 부딪힌 적을 밀쳐낸다.' },
    keeper: { name: '골키퍼', desc: '날아오는 공·카드를 막아낸다.' },
    winger: { name: '윙어', desc: '적 진영을 일직선으로 돌파한다.' },
    // 메시 never shoots: his midfielders' passes end in a dribble that scatters the defenders around him
    mid: { name: '미드필더', desc: '{hero}에게 패스, {hero}가 강슛으로 마무리.', descMessi: '{hero}에게 패스, {hero}가 드리블로 주변 수비를 휘젓는다.' },
    striker: { name: '스트라이커', desc: '가까운 적에게 추가 슛을 쏜다.' }
  };
  // name: a twisted spelling that still reads as the player at a glance. ovr: overall rating (RS.MATE_TIERS).
  // same: the same person at another club — never two of him in one squad (RS.samePerson).
  RS.TEAMMATES = {
    pepperoni: { name: '페페로니', ovr: 85, role: 'defender', era: 'madrid', hair: '#1a1a1a', skin: '#c99a73' },
    gingerscorp: { name: '폴 스콜쓰', ovr: 88, role: 'mid', era: 'manchester', hair: '#d0702a', skin: '#f1c9a5' },
    looneytoon: { name: '루니툰', ovr: 89, role: 'striker', era: 'manchester', hair: '#6a4a2a', skin: '#f1c9a5' },
    tumblenano: { name: '나니뇨', ovr: 80, role: 'winger', era: 'lisbon', hair: '#1a1a1a', skin: '#a8714a' },
    saintcasi: { name: '카시야쓰', ovr: 90, role: 'keeper', era: 'madrid', hair: '#2a1a10', skin: '#e8b892' },
    ramong: { name: '라몬스', ovr: 90, role: 'defender', era: 'madrid', hair: '#3a2a1a', skin: '#e0ac84' },
    ozilly: { name: '외질리', ovr: 87, role: 'mid', era: 'madrid', hair: '#111111', skin: '#e3b48c' },
    benjamin: { name: '벤제마왕', ovr: 90, role: 'striker', era: 'madrid', hair: '#151515', skin: '#c8956a' },
    modric: { name: '모드리찌', ovr: 92, role: 'mid', era: 'madrid', hair: '#c9a46a', skin: '#f0c8a2' },
    marcel: { name: '마르쎌루', ovr: 87, role: 'winger', era: 'madrid', hair: '#2a1a10', skin: '#8a5a3a' },
    golfbale: { name: '골프왕 베일리', ovr: 88, role: 'winger', era: 'madrid', hair: '#3a2a1a', skin: '#f1c9a5' },
    buffonne: { name: '부퐁', ovr: 92, role: 'keeper', era: 'turin', hair: '#5a4a3a', skin: '#e8b892' },
    maskchiello: { name: '끼엘리니', ovr: 88, role: 'defender', era: 'turin', hair: '#3a3a3a', skin: '#e0ac84' },
    vdsar: { name: '판데르싸르', ovr: 87, role: 'keeper', era: 'manchester', hair: '#c9a46a', skin: '#f1c9a5' },
    rioferd: { name: '리오 퍼디난도', ovr: 88, role: 'defender', era: 'manchester', hair: '#111111', skin: '#8a5a3a' },
    brunofk: { name: '브루노 페르난데쓰', ovr: 86, role: 'mid', era: 'manchester2', hair: '#3a2a1a', skin: '#e3b48c' },
    sadiomane: { name: '사디오 마녜', ovr: 86, role: 'winger', era: 'riyadh', hair: '#111111', skin: '#5a3a26' },
    talis: { name: '탈리스까', ovr: 79, role: 'striker', era: 'riyadh', hair: '#1a1a1a', skin: '#a8714a' },
    bernardo: { name: '베르나르두 씰바', ovr: 87, role: 'mid', era: 'national', hair: '#3a2a1a', skin: '#e3b48c' },
    quaresmo: { name: '콰레스망', ovr: 81, role: 'winger', era: 'national', hair: '#111111', skin: '#a8714a' },
    hugovia: { name: '위고 비아냐', ovr: 74, role: 'mid', era: 'lisbon', hair: '#3a2a1a', skin: '#e3b48c' },
    lisbongk: { name: '사자굴 수문장', ovr: 72, role: 'keeper', era: 'lisbon', hair: '#1a1a1a', skin: '#c99a73' },
    parkji: { name: '박지썽', ovr: 83, role: 'winger', era: 'manchester', hair: '#111111', skin: '#e8c09a' },
    dybalino: { name: '디발리노', ovr: 86, role: 'striker', era: 'turin', hair: '#2a1a10', skin: '#e8b892' },
    pjanic: { name: '퍄니찌', ovr: 84, role: 'mid', era: 'turin', hair: '#1a1a1a', skin: '#e0ac84' },
    cuadrado: { name: '콰드라또', ovr: 82, role: 'winger', era: 'turin', hair: '#111111', skin: '#7a4a2a' },
    rashy: { name: '래쉬포드', ovr: 83, role: 'winger', era: 'manchester2', hair: '#111111', skin: '#6a4430' },
    degea: { name: '데헤아노', ovr: 88, role: 'keeper', era: 'manchester2', hair: '#2a1a10', skin: '#e8b892' },
    varanne: { name: '바란느', ovr: 87, role: 'defender', era: 'manchester2', hair: '#111111', skin: '#9a6a48' },
    brozo: { name: '브로조비찌', ovr: 82, role: 'mid', era: 'riyadh', hair: '#c9a46a', skin: '#f0c8a2' },
    laporto: { name: '라포르뜨', ovr: 84, role: 'defender', era: 'riyadh', hair: '#1a1a1a', skin: '#e0ac84' },
    bentoz: { name: '벤뚜', ovr: 78, role: 'keeper', era: 'riyadh', hair: '#111111', skin: '#9a6a48' },
    dias: { name: '후벵 디아쓰', ovr: 88, role: 'defender', era: 'national', hair: '#111111', skin: '#c99a73' },
    brunopt: { name: '비티냥', ovr: 86, role: 'mid', era: 'national', hair: '#1a1a1a', skin: '#e0ac84' },
    leaozinho: { name: '라파엘 레옹', ovr: 85, role: 'striker', era: 'national', hair: '#111111', skin: '#6a4430' },
    // ---- 메시 career teammates (youth first)
    alleypal: { name: '골목 단짝', ovr: 60, role: 'mid', era: 'rosario', hair: '#2a1a10', skin: '#e8b892' },
    tinykeeper: { name: '87년생 꼬마 골키퍼', ovr: 58, role: 'keeper', era: 'rosario', hair: '#1a1a1a', skin: '#e0ac84' },
    alleyback: { name: '골목대장 수비수', ovr: 59, role: 'defender', era: 'rosario', hair: '#3a2a1a', skin: '#c99a73' },
    cescino: { name: '꼬마 쎄스크', ovr: 70, role: 'mid', era: 'masia', hair: '#2a1a10', skin: '#e8b892' },
    piquechu: { name: '꼬마 피케츄', ovr: 69, role: 'defender', era: 'masia', hair: '#3a2a1a', skin: '#f0c8a2' },
    youthcap: { name: '유스 주장 바스께스', ovr: 66, role: 'striker', era: 'masia', hair: '#1a1a1a', skin: '#e0ac84' },
    dingyo: { name: '호나우딩요', ovr: 91, role: 'winger', era: 'barcelona', hair: '#111111', skin: '#8a5a3a', style: 'long' }, // style: fixed haircut
    iniestar: { name: '니에미스타', ovr: 92, role: 'mid', era: 'barcelona', hair: '#3a3a3a', skin: '#f0c8a2', style: 'bald' },
    xavino: { name: '챠비', ovr: 92, role: 'mid', era: 'barcelona', hair: '#2a1a10', skin: '#e8b892', style: 'short' },
    puyolion: { name: '뿌욜', ovr: 88, role: 'defender', era: 'barcelona', hair: '#4a3020', skin: '#e0ac84', style: 'long' },
    valdes: { name: '발데쓰', ovr: 84, role: 'keeper', era: 'barcelona', hair: '#1a1a1a', skin: '#e8b892' },
    alvesrun: { name: '다니 알베쓰', ovr: 87, role: 'winger', era: 'barcelona', hair: '#111111', skin: '#9a6a48' },
    suarezbite: { name: '수아레즈', ovr: 91, role: 'striker', era: 'barcelona', hair: '#1a1a1a', skin: '#e0ac84' },
    neytrick: { name: '네이마루', ovr: 90, role: 'winger', era: 'barcelona', hair: '#2a1a10', skin: '#c8956a' },
    etoocheetah: { name: '에뚜', ovr: 88, role: 'striker', era: 'barcelona', hair: '#111111', skin: '#5a3a26' },
    busquetsorch: { name: '부스께츠', ovr: 87, role: 'mid', era: 'barcelona', hair: '#1a1a1a', skin: '#e3b48c' },
    stegenwall: { name: '테어슈테건', ovr: 88, role: 'keeper', era: 'barcelona', hair: '#c9a46a', skin: '#f1c9a5' },
    mbaflash: { name: '음바뻬', ovr: 91, role: 'striker', era: 'paris', hair: '#111111', skin: '#8a5a3a' },
    donnarum: { name: '돈나룸바', ovr: 87, role: 'keeper', era: 'paris', hair: '#3a2a1a', skin: '#e8b892' },
    verratino: { name: '베라띠', ovr: 86, role: 'mid', era: 'paris', hair: '#1a1a1a', skin: '#e3b48c' },
    hakimiwing: { name: '하킴이', ovr: 85, role: 'winger', era: 'paris', hair: '#111111', skin: '#a8714a' },
    albamiami: { name: '조르디 알바생', ovr: 80, role: 'defender', era: 'miami', hair: '#1a1a1a', skin: '#e0ac84' },
    busquetsmia: { name: '마이애미 부스께츠', ovr: 80, role: 'mid', era: 'miami', hair: '#1a1a1a', skin: '#e3b48c', same: 'busquetsorch' },
    suarezmia: { name: '마이애미 수아레즈', ovr: 82, role: 'striker', era: 'miami', hair: '#1a1a1a', skin: '#e0ac84', same: 'suarezbite' },
    dibugk: { name: '디부 마르띠', ovr: 86, role: 'keeper', era: 'argentina', hair: '#1a1a1a', skin: '#e0ac84' },
    dimariangel: { name: '디마리오', ovr: 87, role: 'winger', era: 'argentina', hair: '#3a2a1a', skin: '#e8b892' },
    julianfin: { name: '훌리안 알바레쓰', ovr: 85, role: 'striker', era: 'argentina', hair: '#2a1a10', skin: '#f0c8a2' },
    otamendiwall: { name: '오따멘디', ovr: 82, role: 'defender', era: 'argentina', hair: '#1a1a1a', skin: '#e0ac84' },
    enzomid: { name: '엔쪼', ovr: 84, role: 'mid', era: 'argentina', hair: '#1a1a1a', skin: '#e8b892' }
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
    enforcer: { name: '집행관 미드필더', hp: 95, speed: 30, dmg: 11, r: 10, xp: 12, sprite: 'grunt', mini: true, pace: 'slow', acts: ['charge', 'charge', 'slam'] }
  };
  RS.ELITE_SPEED = 0.75; // elites are 1.5x the size: they walk slower
  RS.BASE_MOVE = 78; // hero walking speed before bonuses (× the hero's moveMul)
  RS.FINAL_PACE = 1.2; // the final duel's patterns are tuned for a hero running at this × base speed (see World.recalc)
  RS.IFRAMES = 0.55; // seconds of invulnerability after a hit (crowds can hit at most this often)
  RS.MINI_TYPES = ['brute', 'enforcer'];
  // manual slide (슬라이딩 버튼): invulnerable dash with a gradient trail; cooldown per hero
  RS.SLIDE = { speed: 420, dur: 0.28, dmg: 12, cd: { ronaldo: 5, messi: 3 } }; // 메시: quicker feet, shorter cooldown

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
    ronaldo: { hp: 720, fight: 1.4, speed: 62, r: 10, dmg: 18, actions: [], cool: 1.25, sprite: 'ronaldo', sig: '무회전·헤딩 강타·SIUU' } // 메시 career final
  };
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
  RS.BOSS_FIGHT_SECONDS = 22; // one-minute stages: the season boss is a short, sharp fight
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
    Y(2006, 'manchester', 'hairdryer', '월드컵과 윙크 논란', 'referee', '레드카드 주심', '월드컵 8강, 팀 동료의 퇴장과 윙크 논란으로 잉글랜드 전체의 야유를 받았다. 카드를 꺼내 드는 주심이 상대다.', { trial: 1, twist: { press: 1 } }),
    Y(2007, 'manchester', 'hairdryer', '첫 리그 정상, FA컵 결승의 악몽', 'drogba', '드록빠', '첫 리그 우승. 하지만 새 웸블리 첫 FA컵 결승, 연장 막판 첼씨의 괴물 스트라이커 드록빠에게 결승골을 내줬다. 그 괴물이 다시 온다.', { foe: 'chelsea', trial: 2 }),
    Y(2008, 'manchester', 'hairdryer', '빗속의 유럽 정상, 첫 발롱도르', 'keeper', '첼씨 수문장 쩨흐', '모스크바 빗속 결승, 상대는 또 첼씨. 승부차기에서 실축하고도 끝내 웃었다. 첫 발롱도르의 해, 그날의 수문장 쩨흐를 넘어야 한다.', { ballon: true, foe: 'chelsea' }),
    Y(2009, 'madrid', 'engineer', '세계 최고 이적료로 마드리드행', 'maestro', '티키타카 지휘자 챠비', '세계 최고 이적료로 마드리드행. 라이벌 팀 티키타카의 심장 챠비와 첫 대결.'),
    Y(2010, 'madrid', 'special', '엘 클라시코 시대', 'tackler', '곱슬머리 수비대장 뿌욜', '엘 클라시코의 시대가 열렸다. 카탈루냐의 곱슬머리 수비대장 뿌욜과의 악연이 시작된다.'),
    Y(2011, 'madrid', 'special', '국왕컵 결승 헤더', 'giant', '바르샤 장신 피케츄', '국왕컵 결승 결승골 헤더. 바르샤의 장신 센터백을 뛰어넘은 그 밤.'),
    Y(2012, 'madrid', 'special', '리그 우승, 진정해 세리머니', 'referee', '엘 클라시코 주심', '리그 우승과 "진정해" 세리머니. 클라시코마다 카드를 꺼내던 주심이 상대다.'),
    Y(2013, 'madrid', 'eyebrow', '두 번째 발롱도르', 'striker', '스웨덴 거인 즐라탄탄', '월드컵 플레이오프 해트트릭으로 스웨덴 거인을 꺾고 두 번째 발롱도르.', { ballon: true }),
    Y(2014, 'madrid', 'eyebrow', '열 번째 유럽 정상', 'keeper', '이웃집 수문장 꾸르뚜아', '리스본 결승, 열 번째 유럽 정상. 같은 도시 라이벌의 수문장 꾸르뚜아가 마지막 벽.', { ballon: true }),
    Y(2015, 'madrid', 'eyebrow', '득점 기계 모드', 'maestro', '뮌헨 전차 지휘관', '득점 기계의 해. 유럽 무대에서 뮌헨 전차 군단의 지휘관과 격돌.'),
    Y(2016, 'madrid', 'headbutt', '유로 우승, 나방과의 결승', 'giant', '파리 결승의 나방 군단장', '유로 결승, 부상으로 쓰러진 뒤 벤치에서 지휘한 우승. 나방 떼가 날아들던 파리의 밤.', { ballon: true }),
    Y(2017, 'madrid', 'headbutt', '유럽 2연패, 다섯 번째 발롱도르', 'striker', '카디프 결승 저격수', '카디프 결승 두 골로 유럽 2연패. 다섯 번째 발롱도르.', { ballon: true }),
    Y(2018, 'turin', 'allegro', '전설의 바이시클 킥, 토리노행', 'keeper', '바이시클 킥의 증인 부퐁', '토리노 원정에서 바이시클 킥, 상대 팬까지 기립했다. 그 골을 내준 수문장 부퐁이 다시 골문을 지킨다. 그리고 그 여름, 토리노로 이적.'),
    Y(2019, 'turin', 'smoker', '네이션스리그 초대 우승', 'tackler', '아약스 영건 대장', '네이션스리그 초대 우승. 유럽 무대에서 암스테르담 영건 군단에 발목을 잡혔다.'),
    Y(2020, 'turin', 'maestro', '텅 빈 경기장', 'referee', 'VAR 판독관', '관중 없는 시즌. 골을 지우는 보이지 않는 심판, VAR 판독관과 싸운다.'),
    Y(2021, 'manchester2', 'babyface', '맨체스터 귀환', 'maestro', '시끄러운 이웃 지휘관', '12년 만의 맨체스터 귀환. 시끄러운 이웃 구단의 지휘관과 더비.'),
    Y(2022, 'manchester2', 'professor', '폭로 인터뷰, 벤치의 월드컵', 'referee', '폭로 인터뷰 기자왕', '폭로 인터뷰로 구단과 결별하고, 다섯 번째 월드컵에선 벤치로 밀려 8강 탈락 뒤 눈물로 퇴장했다. 커리어 최악의 해, 기자왕과의 설전.',
      { trial: 3, twist: { press: 2 } }),
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
    Y(2007, 'barcelona', 'rijkaard', '마라도나 재현 골', 'maestro', '헤타페 중원 지휘자', '하프라인부터 여섯 명을 제친 마라도나 재현 골. 그 경기 상대 지휘자가 복수를 노린다.'),
    Y(2008, 'barcelona', 'pep', '베이징 올림픽 금메달', 'striker', '나이지리아 폭격기', '베이징 올림픽 결승. 나이지리아의 폭격기를 꺾고 금메달.'),
    Y(2009, 'barcelona', 'pep', '6관왕, 첫 발롱도르', 'keeper', '로마 결승 수문장 판데르싸르', '한 해 6관왕. 로마 결승에서 헤딩골을 내준 판데르싸르가 설욕을 노린다. 첫 발롱도르.', { ballon: true }),
    Y(2010, 'barcelona', 'pep', '월드컵 8강 탈락, 두 번째 발롱도르', 'giant', '독일 전차 센터백', '남아공 월드컵 8강에서 독일 전차에 0-4. 그 센터백을 넘어야 한다.',
      { ballon: true, trial: 1, twist: { mix: [{ type: 'tank', w: 2 }] } }),
    Y(2011, 'barcelona', 'pep', '웸블리 결승, 세 번째 발롱도르', 'referee', '엘 클라시코 주심', '웸블리 결승골로 유럽 정상. 클라시코마다 카드를 꺼내던 주심이 상대다.', { ballon: true }),
    Y(2012, 'barcelona', 'tito', '한 해 91골, 첼씨의 버스', 'drogba', '드록빠', '한 해 91골 세계 기록. 하지만 챔스 4강에서 10명이 버틴 첼씨의 버스 수비를 끝내 못 뚫었고, 페널티킥은 크로스바를 때렸다. 1차전 결승골의 주인공 드록빠가 기다린다.',
      { ballon: true, foe: 'chelsea', trial: 2 }),
    Y(2013, 'barcelona', 'tata', '햄스트링 부상의 해', 'tackler', '부상 유발 백태클러', '반복된 햄스트링 부상. 백태클러를 피하며 버텨야 한다.'),
    Y(2014, 'barcelona', 'luis', '브라질 월드컵 준우승', 'giant', '마라카낭 결승 독일 거인', '마라카낭 결승 연장 실점. 골든볼을 들고도 웃지 못한, 커리어 가장 아픈 밤. 이번엔 연장전까지 버텨야 독일 거인이 나온다.',
      { trial: 3, twist: { extra: 15, mix: [{ type: 'tank', w: 2 }] } }),
    Y(2015, 'barcelona', 'luis', 'MSN 트레블, 다섯 번째 발롱도르', 'keeper', '베를린 결승 수문장 부퐁', 'MSN 삼각편대로 트레블. 베를린 결승의 토리노 수문장 부퐁을 넘는다.', { ballon: true }),
    Y(2016, 'barcelona', 'luis', '코파 결승 실축, 은퇴 번복', 'keeper', '코파 결승 칠레 수문장', '3년 연속 결승 패배. 승부차기 실축 뒤 "대표팀은 끝났다"며 은퇴를 선언했다가 번복했다. 칠레 수문장과 다시 맞선다.', { trial: 3 }),
    Y(2017, 'barcelona', 'valverde', '600골, 유니폼 세리머니', 'referee', '베르나베우 주심', '원정 클라시코 600번째 골과 유니폼 세리머니. 그 밤의 주심이 카드를 꺼낸다.'),
    Y(2018, 'barcelona', 'valverde', '주장 완장, 러시아 월드컵 16강', 'striker', '프랑스 번개 음바뻬', '주장 완장을 찼지만 러시아 월드컵 16강에서 프랑스의 번개 음바뻬에게 무너졌다.'),
    Y(2019, 'barcelona', 'valverde', '여섯 번째 발롱도르, 안필드 참사', 'maestro', '안필드 압박 감독 끌롭', '여섯 번째 발롱도르. 하지만 안필드에서 3-0 리드를 날린 밤, 압박의 지휘자 끌롭과 재대결.', { ballon: true }),
    Y(2020, 'barcelona', 'koeman', '2-8 참사, 뷔로팩스', 'referee', '뷔로팩스 회장단', '챔스 8강 2-8 참사. 팩스로 이적을 요청했지만 막혔다. 계약서를 흔드는 회장단이 상대다.', { trial: 2, twist: { press: 1 } }),
    Y(2021, 'paris', 'poch', '코파 우승, 파리행, 일곱 번째 발롱도르', 'giant', '마라카낭 결승 브라질 거인', '마라카낭에서 브라질을 꺾고 첫 성인 대표팀 우승. 눈물의 작별 뒤 파리행.', { ballon: true }),
    Y(2022, 'argentina', 'scaloni', '카타르 월드컵 우승', 'striker', '결승 해트트릭 음바뻬', '카타르 결승, 음바뻬의 해트트릭을 넘어 승부차기 끝에 월드컵 우승.'),
    Y(2023, 'miami', 'tata', '마이애미행, 여덟 번째 발롱도르', 'maestro', '리그스컵 결승 지휘자', '마이애미행 첫 대회 우승. 리그스컵 결승 상대 지휘자와의 대결. 여덟 번째 발롱도르.', { ballon: true }),
    Y(2024, 'argentina', 'scaloni', '코파 아메리카 2연패', 'tackler', '결승 콜롬비아 수비대장', '코파 결승에서 발목 부상으로 눈물. 콜롬비아 수비대장을 넘어 2연패.'),
    Y(2025, 'miami', 'mascherano', '서포터스 실드', 'keeper', 'MLS 결승 수문장', 'MLS 정규리그 1위 서포터스 실드. 결승 무대의 수문장과 승부.'),
    Y(2026, 'argentina', 'scaloni', '마지막 월드컵 — 최종 결전', 'ronaldo', '호날두', '마지막 월드컵. 20년을 함께 달려온 영원한 라이벌, 호날두와의 최종 결전.', { final: true })
  ];
  // Playable heroes. selectHero() points RS.YEARS / DEBUT / BIRTH at the chosen career (one career at a time).
  RS.HEROES = {
    ronaldo: { name: '호날두', short: '날두', moveMul: 1, startSkill: 'kick', years: RS.YEARS, debut: 2002, birth: 1985, desc: '투사체 공격 · 슬라이딩 5초', rival: '메시' },
    // wall: ×RS.WALL's HP growth — his orbit, aura and stun hold a crowd off far better than 날두's shots
    messi: { name: '메시', short: '메시', moveMul: 1.22, startSkill: 'orbit', years: RS.YEARS_MESSI, debut: 2004, birth: 1987, desc: '유소년부터 · 드리블과 회전하는 공 · 패스는 챠비·니에미스타 · 성장호르몬 선택이 난이도', rival: '호날두', wall: 3 }
  };

  // ---------------------------------------------------------------- Story events (메시's career)
  // Shown once before that season (career years, not replays). Card keys: hgh (growth hormone: true = normal,
  // false = 하드 모드), skill (teaches a move when a slot is free, else `alt` is offered), mods (kept for the career
  // like a coach card), result (toast). mate: joins the squad when there is room, whatever the pick.
  // Before the treatment (and for the whole career without it) 메시 plays in a small body: RS.SMALL_BODY.
  RS.SMALL_BODY = { hp: -30, dmg: -0.2 };
  RS.EVENTS = {
    hgh: {
      title: '성장호르몬 주사', who: '키가 자라지 않는 병 · 한 달 치료비가 아버지 월급만큼',
      story: '의사는 매일 밤 다리에 성장호르몬 주사를 놓아야 키가 자란다고 했다. 주사를 맞으면 몸이 커지고 강해진다. 맞지 않으면 끝까지 작은 몸으로 싸운다. 이 선택이 커리어의 난이도다.',
      cards: [
        { id: 'hgh_yes', icon: '💉', name: '주사를 맞는다', tag: '일반 모드', hgh: true, result: '💉 몸이 자랐다! 작은 몸의 약점이 사라졌다',
          desc: '몸이 자라 강해진다: 작은 몸의 약점(최대 체력 -30, 공격력 -20%)이 바로 사라진다.' },
        { id: 'hgh_no', icon: '🔥', name: '주사 없이 버틴다', tag: '하드 모드', hgh: false, result: '🔥 하드 모드: 작은 몸 그대로 간다',
          desc: '커리어 끝까지 작은 몸: 최대 체력 -30, 공격력 -20%. 되돌릴 수 없다.' }
      ]
    },
    dingyo: {
      title: '호나우딩요의 튜터링', who: '삼바 마법사 호나우딩요 · 바르셀로나의 슈퍼스타', mate: 'dingyo',
      story: '팀의 슈퍼스타 호나우딩요가 열일곱 살 꼬마를 맡았다. 훈련이 끝나면 따로 남아 자기 기술을 하나씩 가르쳐 준다. 무엇부터 배울까?',
      cards: [
        { id: 'dy_elastico', icon: '🪄', name: '엘라스티코 전수', tag: '새 스킬', skill: 'elastico', result: '🪄 엘라스티코를 배웠다!',
          desc: '호나우딩요의 고무줄 페인트를 배운다. 이 튜터링에서만 얻는 스킬.',
          alt: { id: 'dy_touch', icon: '✨', name: '마법의 볼 터치', tag: '스킬 강화', skillsUp: 1, result: '✨ 모든 스킬 Lv.+1',
            desc: '스킬 칸이 가득 차 있어 대신 볼 터치를 배운다: 보유 스킬 전부 Lv.+1.' } },
        { id: 'dy_nolook', icon: '😎', name: '노룩 패스 수업', tag: '영구 효과', mods: { teamDmg: 0.2, teamCd: -0.1 }, result: '😎 노룩 패스를 배웠다!',
          desc: '동료 공격력 +20%, 동료 쿨타임 -10%' },
        { id: 'dy_joy', icon: '😁', name: '즐기는 축구', tag: '영구 효과', mods: { xp: 0.15, regen: 0.3 }, result: '😁 축구를 즐기는 법을 배웠다!',
          desc: '경험치 +15%, 초당 체력 +0.3' }
      ]
    }
  };
  RS.YEARS_RONALDO = RS.YEARS;
  RS.HERO = 'ronaldo';
  RS.selectHero = function (hero) {
    const h = RS.HEROES[hero] ? hero : 'ronaldo';
    RS.HERO = h;
    RS.YEARS = RS.HEROES[h].years;
    RS.DEBUT_YEAR = RS.HEROES[h].debut;
    RS.BIRTH_YEAR = RS.HEROES[h].birth;
    return h;
  };
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
  RS.WALL = { from: 5, hp: 0.25, hp2: 0.012, dmg: 0.04, speed: 0.004, spawn: 0.025, boss: 0.05, poise: 0.12, ref: 0.08, final: 0 };
  RS.FINAL_DMG = 0.11; // the final duel boss: damage × (1 + FINAL_DMG × season index)
  // 고난의 시즌 (RS.YEARS[i].trial = 1–3): per level, on top of the curve.
  RS.TRIAL = { hp: 0.18, dmg: 0.12, spawn: 0.1, boss: 0.15, fight: 0.12, poise: 0.1 };

  // Per-year tuning derived from the difficulty index so new years need no extra numbers.
  RS.yearTuning = function (yearIdx) {
    const y = RS.YEARS[yearIdx], idx = RS.tuneIdx(yearIdx);
    const gentle = [0.32, 0.6, 0.75, 0.88][idx] || 1; // first seasons: phone newcomers (2003-05 used to spike)
    // the final is a duel: its crowd stays off the wall (WALL.final = how much of it still applies)
    const W = RS.WALL, w = Math.max(0, idx - W.from) * (y.final ? W.final : 1), L = y.trial || 0, T = RS.TRIAL, tw = y.twist || {};
    const hw = RS.HEROES[RS.HERO].wall || 1; // the hero's own wall steepness (메시: orbit, aura and stun keep crowds off)
    const wallHp = 1 + (W.hp * w + W.hp2 * w * w) * hw;
    const t = {
      hpMul: (1 + 0.55 * idx + 0.03 * idx * idx) * wallHp * (1 + T.hp * L),
      wallHp, // 준보스 leave this out: they already scale with the season and must stay killable (World.spawnEnemy)
      dmgMul: (1 + 0.08 * idx) * gentle * (1 + W.dmg * w) * (1 + T.dmg * L),
      wallDmg: 1 + W.dmg * w, // 준보스 leave this out too
      speedMul: 1 + 0.008 * idx + W.speed * w,
      poise: 1 / (1 + W.poise * w + T.poise * L), // × knockback and stun taken by ordinary enemies
      spawnRate: (2.3 + 0.18 * idx) * (idx === 0 ? 0.5 : 1) * (1 + W.spawn * w) * (1 + T.spawn * L),
      maxAlive: Math.min(420, 150 + 12 * idx),
      duration: 60 + (tw.extra || 0), // one minute per season (+ 연장전), then the boss
      // inside a stage enemies visibly toughen: by the end they have this much more HP / damage / speed
      rampHp: 0.35, rampDmg: 0.12 * gentle, rampSpeed: 0.1, // speed ramp: normal-pace enemies only
      xpMul: 1 + 0.16 * idx,
      bossHpMul: 1 + 0.55 * idx + 0.03 * idx * idx,
      // the final duel keeps its own bite (tuned with World.finalScale / finalPace), outside the wall
      bossDmgMul: y.final ? 1 + RS.FINAL_DMG * idx : (1 + 0.1 * idx) * gentle * (1 + W.boss * w) * (1 + T.boss * L),
      bossCool: idx === 0 ? 1.2 : 1,
      bossDensity: Math.min(0.85, 0.7 + 0.04 * idx), // fewer bullets on screen: readable fights
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
    luck: { name: '행운 부적', icon: '🍀', desc: '특수 카드 확률 +10%', max: 5, cost: [60, 120, 200, 300, 420], mods: { luck: 0.1 } },
    revive: { name: '불사조 정신', icon: '🔥', desc: '연도마다 1회 부활', max: 1, ballon: [2], mods: { revive: 1 } },
    reroll: { name: '전술 보드', icon: '🔁', desc: '레벨업 리롤 +1', max: 3, ballon: [1, 1, 1], mods: { reroll: 1 } }
  };
})(globalThis.RS = globalThis.RS || {});
