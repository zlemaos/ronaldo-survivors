/* 호날두 서바이버즈 — data tables. Pure data, no DOM. See docs/DESIGN.md for how to add content.
 * Parody safety: clubs, coaches, teammates and rivals use parody names. Only 날두 and 메시 keep their names. */
(function (RS) {
  'use strict';

  RS.MAX_SKILLS = 6;
  RS.MAX_PASSIVES = 6;
  RS.MAX_MATES = 2;   // on the pitch with 날두
  RS.MAX_BENCH = 3;   // bench warmers: weak passive synergy only
  RS.BENCH_FACTOR = 0.34;
  RS.MATE_MAX_LV = 5;
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
      name: '헤딩 점프', icon: '🦘', passive: 'jump', evoName: '2.56m 슈퍼 헤더', evoIcon: '🚀',
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
      name: '바이시클 킥', icon: '🌀', passive: 'flex', evoName: '오버헤드 토네이도', evoIcon: '🌪️',
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
      name: '스텝오버', icon: '💨', passive: 'speed', evoName: '환상 스텝오버', evoIcon: '👻',
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
      name: '시저스 킥', icon: '✂️', passive: 'finisher', evoName: '더블 시저스', evoIcon: '⚔️',
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
    // 메시 only: golden balls circle him instead of projectiles. Two evolutions: 8 balls or one ball 8× the size.
    orbit: {
      name: '발롱도르 공', icon: '🏆', passive: 'ballon', hero: 'messi', evoName: '8발롱도르', evoIcon: '🌕',
      desc: '황금 공이 메시 주위를 돌며 닿는 적을 때린다.',
      evoDesc: '공 8개 또는 8배 크기의 공.',
      ups: ['', '공 +1', '공이 커진다', '공 +1', '공 +1, 피해 증가', '공이 더 커진다, 피해 증가'],
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
        count: { name: '8발롱도르공', icon: '🟡', desc: '황금 공 8개가 쉴 새 없이 돈다.', stats: { dmg: 30, cd: 0.3, count: 8, size: 1.6, speed: 4.4, radius: 44 } },
        size: { name: '8발롱도르', icon: '🌕', desc: '하나의 거대한 공(8배)이 모든 것을 쓸어버린다.', stats: { dmg: 46, cd: 0.32, count: 1, size: 8, speed: 2.6, radius: 46, knock: 90 } }
      }
    }
  };
  RS.SKILL_MAX = 6;

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
    ballon: { name: '발롱도르 수집', icon: '🏆', desc: '공격력 +6%, 범위 +6%', mods: { dmg: 0.06, area: 0.06 }, hero: 'messi' }
  };
  RS.PASSIVE_MAX = 5;

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
    // ---- 메시 career eras
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

  // ---------------------------------------------------------------- Coaches (parody nicknames)
  // Each coach offers cards (team-wide buffs). Cards stack for the rest of the career.
  RS.COACHES = {
    boloni: { name: '볼로뇨 감독', tag: '첫 스승', look: { hair: '#5a4632', suit: '#2b3a2b' }, cards: [
      { id: 'boloni_xp', name: '유망주 육성', icon: '🌱', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'boloni_speed', name: '측면 돌파', icon: '🏃', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } },
      { id: 'boloni_hp', name: '기초 체력', icon: '❤️', desc: '최대 체력 +15', mods: { hp: 15 } }
    ] },
    hairdryer: { name: '헤어드라이어 경', tag: '불호령 명장', look: { hair: '#d9d9d9', suit: '#1d1d2a' }, cards: [
      { id: 'hd_team', name: '헤어드라이어 정신교육', icon: '💨', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'hd_time', name: '막판 극장골 타임', icon: '⏱️', desc: '보스에게 주는 피해 +15%', mods: { bossDmg: 0.15 } },
      { id: 'hd_young', name: '젊은 피', icon: '🌱', desc: '경험치 +10%', mods: { xp: 0.10 } },
      { id: 'hd_disc', name: '철의 규율', icon: '🛡️', desc: '받는 피해 -1', mods: { armor: 1 } }
    ] },
    engineer: { name: '엔지니어 감독', tag: '설계의 달인', look: { hair: '#bfbfbf', suit: '#26262e' }, cards: [
      { id: 'eng_proj', name: '정밀 설계', icon: '📐', desc: '투사체 속도 +12%', mods: { projSpeed: 0.12 } },
      { id: 'eng_gal', name: '갈락티코 영입', icon: '⭐', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'eng_dmg', name: '공격 축구', icon: '⚔️', desc: '공격력 +8%', mods: { dmg: 0.08 } }
    ] },
    special: { name: '스페셜 원', tag: '자칭 특별한 감독', look: { hair: '#6d6d6d', suit: '#1a1a1a' }, cards: [
      { id: 'sp_bus', name: '버스 주차', icon: '🚌', desc: '받는 피해 -1, 최대 체력 +10', mods: { armor: 1, hp: 10 } },
      { id: 'sp_counter', name: '역습의 화신', icon: '⚡', desc: '이동속도 +7%', mods: { moveSpeed: 0.07 } },
      { id: 'sp_mind', name: '마인드 게임', icon: '🧠', desc: '치명타 확률 +6%', mods: { crit: 0.06 } }
    ] },
    eyebrow: { name: '눈썹 신사', tag: '한쪽 눈썹으로 지휘', look: { hair: '#8a8a8a', suit: '#24304a' }, cards: [
      { id: 'eb_calm', name: '평온한 리더십', icon: '☕', desc: '초당 체력 +0.4', mods: { regen: 0.4 } },
      { id: 'eb_tenth', name: '열 번째 별', icon: '🌟', desc: '공격력 +10%', mods: { dmg: 0.10 } },
      { id: 'eb_brow', name: '눈썹 하나로 지휘', icon: '🤨', desc: '쿨타임 -6%', mods: { cd: -0.06 } }
    ] },
    headbutt: { name: '박치기 지주', tag: '3연패의 전설', look: { hair: '#c9b48c', suit: '#2a2a2a' }, cards: [
      { id: 'hb_three', name: '3연패의 비결', icon: '🏆', desc: '공격력 +12%', mods: { dmg: 0.12 } },
      { id: 'hb_rot', name: '로테이션', icon: '🔄', desc: '동료 쿨타임 -12%', mods: { teamCd: -0.12 } },
      { id: 'hb_head', name: '박치기 정신', icon: '🐏', desc: '공격 범위 +12%', mods: { area: 0.12 } }
    ] },
    allegro: { name: '알레그로 감독', tag: '실리 축구', look: { hair: '#4a4a4a', suit: '#202020' }, cards: [
      { id: 'al_safe', name: '1:0 승리 공식', icon: '🧱', desc: '받는 피해 -1', mods: { armor: 1 } },
      { id: 'al_pts', name: '승점 관리', icon: '📊', desc: '최대 체력 +20', mods: { hp: 20 } },
      { id: 'al_short', name: '짧은 패스', icon: '↔️', desc: '쿨타임 -5%', mods: { cd: -0.05 } }
    ] },
    smoker: { name: '줄담배 감독', tag: '트레이닝복 철학자', look: { hair: '#9a9a9a', suit: '#1c2a4a' }, cards: [
      { id: 'sm_ball', name: '볼 점유 철학', icon: '🔁', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'sm_tri', name: '삼각 패스', icon: '🔺', desc: '투사체 속도 +10%, 범위 +5%', mods: { projSpeed: 0.10, area: 0.05 } },
      { id: 'sm_track', name: '트레이닝복 정신', icon: '🧥', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } }
    ] },
    maestro: { name: '마에스트로 감독', tag: '초보 감독, 전설의 패서', look: { hair: '#3a2a1e', suit: '#222' }, cards: [
      { id: 'ma_vision', name: '대지를 가르는 패스', icon: '👁️', desc: '동료 쿨타임 -10%', mods: { teamCd: -0.10 } },
      { id: 'ma_free', name: '프리킥 수업', icon: '🥅', desc: '치명타 확률 +5%, 공격력 +5%', mods: { crit: 0.05, dmg: 0.05 } },
      { id: 'ma_calm', name: '무표정 리더십', icon: '😐', desc: '지속시간 +12%', mods: { dur: 0.12 } }
    ] },
    babyface: { name: '동안 암살자 감독', tag: '슈퍼 서브 출신', look: { hair: '#e0c27a', suit: '#1e1e2e' }, cards: [
      { id: 'bf_sub', name: '슈퍼 서브', icon: '🔄', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'bf_home', name: '귀환 환영식', icon: '🏠', desc: '최대 체력 +20', mods: { hp: 20 } },
      { id: 'bf_late', name: '추가시간의 기적', icon: '⏱️', desc: '보스에게 주는 피해 +12%', mods: { bossDmg: 0.12 } }
    ] },
    professor: { name: '게겐 교수', tag: '압박의 아버지', look: { hair: '#b0b0b0', suit: '#2a2a2a' }, cards: [
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
    marti: { name: '전략가 마르띠', tag: '대표팀 사령탑', look: { hair: '#3a3a3a', suit: '#1b2440' }, cards: [
      { id: 'mt_last', name: '라스트 댄스', icon: '💃', desc: '공격력 +15%', mods: { dmg: 0.15 } },
      { id: 'mt_cap', name: '주장 완장', icon: '©️', desc: '동료 공격력 +15%, 받는 피해 -1', mods: { teamDmg: 0.15, armor: 1 } },
      { id: 'mt_boss', name: '결승전 집중', icon: '🎯', desc: '보스에게 주는 피해 +20%', mods: { bossDmg: 0.20 } }
    ] },
    // ---- 메시 career coaches
    rijkaard: { name: '레이카르 감독', tag: '첫 스승, 자유 축구', look: { hair: '#1a1a1a', suit: '#2b2b3a' }, cards: [
      { id: 'rk_free', name: '자유 축구', icon: '🕊️', desc: '공격력 +8%', mods: { dmg: 0.08 } },
      { id: 'rk_wing', name: '오른쪽 윙 배치', icon: '🏃', desc: '이동속도 +6%', mods: { moveSpeed: 0.06 } },
      { id: 'rk_calm', name: '느긋한 리더십', icon: '😌', desc: '초당 체력 +0.3', mods: { regen: 0.3 } }
    ] },
    pep: { name: '대머리 교수', tag: '티키타카 설계자', look: { hair: '#e8c0a0', suit: '#1a1a1a' }, cards: [
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
    luis: { name: '루초 감독', tag: 'MSN 트레블', look: { hair: '#2a2a2a', suit: '#1e1e2e' }, cards: [
      { id: 'lu_msn', name: 'MSN 삼각편대', icon: '🔺', desc: '동료 공격력 +15%', mods: { teamDmg: 0.15 } },
      { id: 'lu_counter', name: '직선 역습', icon: '⚡', desc: '투사체 속도 +12%', mods: { projSpeed: 0.12 } },
      { id: 'lu_treble', name: '트레블 정신', icon: '3️⃣', desc: '공격력 +10%', mods: { dmg: 0.10 } }
    ] },
    valverde: { name: '발베르 감독', tag: '실리의 개미', look: { hair: '#6a6a6a', suit: '#222' }, cards: [
      { id: 'va_442', name: '실리 4-4-2', icon: '🧱', desc: '받는 피해 -1', mods: { armor: 1 } },
      { id: 'va_600', name: '600골 기념', icon: '🎉', desc: '공격력 +8%', mods: { dmg: 0.08 } },
      { id: 'va_captain', name: '주장 완장', icon: '©️', desc: '최대 체력 +15, 경험치 +5%', mods: { hp: 15, xp: 0.05 } }
    ] },
    koeman: { name: '쿠만 감독', tag: '대포알 슛의 전설', look: { hair: '#d9c9a0', suit: '#2a2a3a' }, cards: [
      { id: 'ko_fax', name: '뷔로팩스', icon: '📠', desc: '코인 획득 +20%', mods: { gold: 0.20 } },
      { id: 'ko_young', name: '유스 발탁', icon: '🌱', desc: '경험치 +12%', mods: { xp: 0.12 } },
      { id: 'ko_cannon', name: '대포알 슛', icon: '💣', desc: '투사체 속도 +10%, 공격력 +5%', mods: { projSpeed: 0.10, dmg: 0.05 } }
    ] },
    poch: { name: '포체 감독', tag: '파리의 별 관리자', look: { hair: '#3a3a3a', suit: '#1b2a5a' }, cards: [
      { id: 'po_eiffel', name: '에펠탑 야경', icon: '🗼', desc: '공격 범위 +10%', mods: { area: 0.10 } },
      { id: 'po_stars', name: '별들의 팀', icon: '⭐', desc: '동료 공격력 +12%', mods: { teamDmg: 0.12 } },
      { id: 'po_press', name: '전방 압박', icon: '🔥', desc: '쿨타임 -5%', mods: { cd: -0.05 } }
    ] },
    scaloni: { name: '스칼로 감독', tag: '월드컵 사령탑', look: { hair: '#2a2a2a', suit: '#75aadb' }, cards: [
      { id: 'sc_family', name: '가족 같은 팀', icon: '👨‍👩‍👦', desc: '동료 쿨타임 -10%, 최대 체력 +10', mods: { teamCd: -0.10, hp: 10 } },
      { id: 'sc_cup', name: '월드컵 정신', icon: '🏆', desc: '보스에게 주는 피해 +15%', mods: { bossDmg: 0.15 } },
      { id: 'sc_calm', name: '침착한 결승', icon: '🧊', desc: '받는 피해 -1', mods: { armor: 1 } }
    ] },
    mascherano: { name: '마스체 감독', tag: '투지의 작은 대장', look: { hair: '#1a1a1a', suit: '#f7b5cd' }, cards: [
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
    defender: { name: '수비수', desc: '날두 주위를 돌며 부딪힌 적을 밀쳐낸다.' },
    keeper: { name: '골키퍼', desc: '날아오는 공·카드를 막아낸다.' },
    winger: { name: '윙어', desc: '적 진영을 일직선으로 돌파한다.' },
    mid: { name: '미드필더', desc: '날두에게 패스, 날두가 강슛으로 마무리.' },
    striker: { name: '스트라이커', desc: '가까운 적에게 추가 슛을 쏜다.' }
  };
  RS.TEAMMATES = {
    pepperoni: { name: '철벽 페페로니', role: 'defender', era: 'madrid', hair: '#1a1a1a', skin: '#c99a73' },
    gingerscorp: { name: '진저 스콜피온', role: 'mid', era: 'manchester', hair: '#d0702a', skin: '#f1c9a5' },
    looneytoon: { name: '루니툰', role: 'striker', era: 'manchester', hair: '#6a4a2a', skin: '#f1c9a5' },
    tumblenano: { name: '덤블링 나노', role: 'winger', era: 'lisbon', hair: '#1a1a1a', skin: '#a8714a' },
    saintcasi: { name: '수호성인 카시', role: 'keeper', era: 'madrid', hair: '#2a1a10', skin: '#e8b892' },
    ramong: { name: '헤딩왕 라몽', role: 'defender', era: 'madrid', hair: '#3a2a1a', skin: '#e0ac84' },
    ozilly: { name: '어시왕 외질리', role: 'mid', era: 'madrid', hair: '#111111', skin: '#e3b48c' },
    benjamin: { name: '고양이 벤자민', role: 'striker', era: 'madrid', hair: '#151515', skin: '#c8956a' },
    modric: { name: '마법사 모드릭', role: 'mid', era: 'madrid', hair: '#c9a46a', skin: '#f0c8a2' },
    marcel: { name: '곱슬 마르셀', role: 'winger', era: 'madrid', hair: '#2a1a10', skin: '#8a5a3a' },
    golfbale: { name: '골프왕 베일리', role: 'winger', era: 'madrid', hair: '#3a2a1a', skin: '#f1c9a5' },
    buffonne: { name: '문어발 부폰느', role: 'keeper', era: 'turin', hair: '#5a4a3a', skin: '#e8b892' },
    maskchiello: { name: '마스크 키엘로', role: 'defender', era: 'turin', hair: '#3a3a3a', skin: '#e0ac84' },
    vdsar: { name: '장신 판데르', role: 'keeper', era: 'manchester', hair: '#c9a46a', skin: '#f1c9a5' },
    rioferd: { name: '수비 장군 리오', role: 'defender', era: 'manchester', hair: '#111111', skin: '#8a5a3a' },
    brunofk: { name: '페널티 브루노', role: 'mid', era: 'manchester2', hair: '#3a2a1a', skin: '#e3b48c' },
    sadiomane: { name: '사막의 질주 마네', role: 'winger', era: 'riyadh', hair: '#111111', skin: '#5a3a26' },
    talis: { name: '프리킥 탈리', role: 'striker', era: 'riyadh', hair: '#1a1a1a', skin: '#a8714a' },
    bernardo: { name: '꼬마 마법사 베르니', role: 'mid', era: 'national', hair: '#3a2a1a', skin: '#e3b48c' },
    quaresmo: { name: '아웃프런트 콰레', role: 'winger', era: 'national', hair: '#111111', skin: '#a8714a' },
    hugovia: { name: '왼발 위고', role: 'mid', era: 'lisbon', hair: '#3a2a1a', skin: '#e3b48c' },
    lisbongk: { name: '사자굴 수문장', role: 'keeper', era: 'lisbon', hair: '#1a1a1a', skin: '#c99a73' },
    parkji: { name: '세 개의 폐 박지', role: 'winger', era: 'manchester', hair: '#111111', skin: '#e8c09a' },
    dybalino: { name: '조커 디발리노', role: 'striker', era: 'turin', hair: '#2a1a10', skin: '#e8b892' },
    pjanic: { name: '프리킥 퍄니치', role: 'mid', era: 'turin', hair: '#1a1a1a', skin: '#e0ac84' },
    cuadrado: { name: '헛다리 콰드라', role: 'winger', era: 'turin', hair: '#111111', skin: '#7a4a2a' },
    rashy: { name: '질주 래시', role: 'winger', era: 'manchester2', hair: '#111111', skin: '#6a4430' },
    degea: { name: '거미손 데헤아노', role: 'keeper', era: 'manchester2', hair: '#2a1a10', skin: '#e8b892' },
    varanne: { name: '침착 바란느', role: 'defender', era: 'manchester2', hair: '#111111', skin: '#9a6a48' },
    brozo: { name: '엔진 브로조', role: 'mid', era: 'riyadh', hair: '#c9a46a', skin: '#f0c8a2' },
    laporto: { name: '사막 장벽 라포르', role: 'defender', era: 'riyadh', hair: '#1a1a1a', skin: '#e0ac84' },
    bentoz: { name: '사막 거미 벤투', role: 'keeper', era: 'riyadh', hair: '#111111', skin: '#9a6a48' },
    dias: { name: '철벽 디아스', role: 'defender', era: 'national', hair: '#111111', skin: '#c99a73' },
    brunopt: { name: '대표팀 브루노', role: 'mid', era: 'national', hair: '#3a2a1a', skin: '#e3b48c' },
    leaozinho: { name: '번개 레앙', role: 'striker', era: 'national', hair: '#111111', skin: '#6a4430' },
    // ---- 메시 career teammates
    iniestar: { name: '돈 안드레스', role: 'mid', era: 'barcelona', hair: '#3a3a3a', skin: '#f0c8a2' },
    xavino: { name: '패스 머신 샤비노', role: 'mid', era: 'barcelona', hair: '#2a1a10', skin: '#e8b892' },
    puyolion: { name: '사자머리 푸욜', role: 'defender', era: 'barcelona', hair: '#4a3020', skin: '#e0ac84' },
    valdes: { name: '발데스 수문장', role: 'keeper', era: 'barcelona', hair: '#1a1a1a', skin: '#e8b892' },
    alvesrun: { name: '질주 알베스', role: 'winger', era: 'barcelona', hair: '#111111', skin: '#9a6a48' },
    suarezbite: { name: '이빨 수아레', role: 'striker', era: 'barcelona', hair: '#1a1a1a', skin: '#e0ac84' },
    neytrick: { name: '묘기 네이', role: 'winger', era: 'barcelona', hair: '#2a1a10', skin: '#c8956a' },
    etoocheetah: { name: '치타 에투', role: 'striker', era: 'barcelona', hair: '#111111', skin: '#5a3a26' },
    busquetsorch: { name: '조율사 부스케', role: 'mid', era: 'barcelona', hair: '#1a1a1a', skin: '#e3b48c' },
    stegenwall: { name: '벽 테어슈', role: 'keeper', era: 'barcelona', hair: '#c9a46a', skin: '#f1c9a5' },
    mbaflash: { name: '번개 음바', role: 'striker', era: 'paris', hair: '#111111', skin: '#8a5a3a' },
    donnarum: { name: '거인 돈나룸', role: 'keeper', era: 'paris', hair: '#3a2a1a', skin: '#e8b892' },
    verratino: { name: '꼬마 조율사 베라', role: 'mid', era: 'paris', hair: '#1a1a1a', skin: '#e3b48c' },
    hakimiwing: { name: '측면 하키미', role: 'winger', era: 'paris', hair: '#111111', skin: '#a8714a' },
    albamiami: { name: '마이애미 알바', role: 'defender', era: 'miami', hair: '#1a1a1a', skin: '#e0ac84' },
    busquetsmia: { name: '마이애미 조율사', role: 'mid', era: 'miami', hair: '#1a1a1a', skin: '#e3b48c' },
    suarezmia: { name: '마이애미 이빨', role: 'striker', era: 'miami', hair: '#1a1a1a', skin: '#e0ac84' },
    dibugk: { name: '수호자 디부', role: 'keeper', era: 'argentina', hair: '#1a1a1a', skin: '#e0ac84' },
    dimariangel: { name: '천사 디마리', role: 'winger', era: 'argentina', hair: '#3a2a1a', skin: '#e8b892' },
    julianfin: { name: '해결사 훌리안', role: 'striker', era: 'argentina', hair: '#2a1a10', skin: '#f0c8a2' },
    otamendiwall: { name: '기둥 오타멘', role: 'defender', era: 'argentina', hair: '#1a1a1a', skin: '#e0ac84' },
    enzomid: { name: '중원 엔조', role: 'mid', era: 'argentina', hair: '#1a1a1a', skin: '#e8b892' }
  };

  // ---------------------------------------------------------------- Enemies
  RS.ENEMIES = {
    grunt: { name: '수비수', hp: 8, speed: 40, dmg: 6, r: 6, xp: 1, sprite: 'grunt' },
    runner: { name: '태클러', hp: 6, speed: 66, dmg: 5, r: 5, xp: 1, sprite: 'runner' },
    tank: { name: '거구 센터백', hp: 48, speed: 27, dmg: 12, r: 10, xp: 4, sprite: 'tank' },
    ref: { name: '심판', hp: 18, speed: 34, dmg: 6, r: 6, xp: 2, sprite: 'ref', ranged: true },
    press: { name: '기자', hp: 9, speed: 95, dmg: 5, r: 5, xp: 1, sprite: 'press', line: true },
    minimessi: { name: '꼬마 메시', hp: 30, speed: 70, dmg: 8, r: 5, xp: 2, sprite: 'minimessi' },
    miniron: { name: '꼬마 날두', hp: 32, speed: 64, dmg: 8, r: 5, xp: 2, sprite: 'miniron' },
    // mini-bosses (준보스): big, drawn at 1.5x with an HP bar, telegraphed charge / slam, chest drops
    brute: { name: '거구 주장', hp: 150, speed: 30, dmg: 14, r: 13, xp: 14, sprite: 'tank', mini: true, acts: ['charge', 'slam'] },
    enforcer: { name: '집행관 미드필더', hp: 95, speed: 46, dmg: 12, r: 10, xp: 10, sprite: 'grunt', mini: true, acts: ['charge', 'charge', 'slam'] }
  };
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
  RS.keeperRadius = (lv) => 20 + 3 * lv;
  // 'Weaker bot' used by balance tests: reacts 0.12 s late with up to ±0.3 rad steering noise.
  RS.WEAK_BOT = { delay: 0.12, noise: 0.3 };

  // ---------------------------------------------------------------- Career years (debut at 17 → present)
  // Facts are kept to well-known headlines. Ballon: true = a real Ballon d'Or year, grants a 발롱도르 on first clear.
  // story: one line that ties the season boss to that year of the career (shown on the year intro).
  const Y = (year, era, coach, title, bossType, bossName, story, extra) =>
    Object.assign({ year, era, coach, title, boss: { type: bossType, name: bossName }, story }, extra || {});
  RS.YEARS = [
    Y(2002, 'lisbon', 'boloni', '17세 프로 데뷔', 'keeper', '데뷔전 상대 수문장', '리스본에서 17세에 데뷔. 첫 프로 경기, 상대 골문엔 베테랑 수문장이 버티고 있다.'),
    Y(2003, 'manchester', 'hairdryer', '맨체스터 이적, 등번호 7', 'tackler', '프리미어 백태클러', '맨체스터로 이적해 7번을 받았다. 프리미어리그의 거친 백태클이 신인을 노린다.'),
    Y(2004, 'manchester', 'hairdryer', '유로 2004 준우승', 'giant', '그리스 철벽 대장', '안방 유로 결승에서 그리스의 철벽 수비에 무릎을 꿇었다. 그 벽을 다시 만난다.'),
    Y(2005, 'manchester', 'hairdryer', '드리블 장인 각성', 'maestro', '런던 파란 지휘자', '드리블 장인으로 각성한 시즌. 리그 왕좌를 쥔 런던 파란 팀의 지휘자가 길을 막는다.'),
    Y(2006, 'manchester', 'hairdryer', '월드컵과 윙크 논란', 'referee', '레드카드 주심', '월드컵 8강, 팀 동료의 퇴장과 윙크 논란. 카드를 꺼내 드는 주심이 상대다.'),
    Y(2007, 'manchester', 'hairdryer', '첫 리그 정상', 'striker', '머지사이드 폭격기', '첫 리그 우승. 득점왕 경쟁 상대였던 머지사이드의 폭격기와 맞붙는다.'),
    Y(2008, 'manchester', 'hairdryer', '빗속의 유럽 정상, 첫 발롱도르', 'keeper', '모스크바 빗속 수문장', '모스크바 빗속 결승 승부차기. 첫 발롱도르의 해, 그날의 수문장을 넘어야 한다.', { ballon: true }),
    Y(2009, 'madrid', 'engineer', '세계 최고 이적료로 마드리드행', 'maestro', '티키타카 지휘자 샤비뇽', '세계 최고 이적료로 마드리드행. 라이벌 팀 티키타카의 심장과 첫 대결.'),
    Y(2010, 'madrid', 'special', '엘 클라시코 시대', 'tackler', '카탈루냐 곱슬 수비대장', '엘 클라시코의 시대가 열렸다. 카탈루냐 곱슬머리 수비대장과의 악연이 시작된다.'),
    Y(2011, 'madrid', 'special', '국왕컵 결승 헤더', 'giant', '바르샤 장신 피케츄', '국왕컵 결승 결승골 헤더. 바르샤의 장신 센터백을 뛰어넘은 그 밤.'),
    Y(2012, 'madrid', 'special', '리그 우승, 진정해 세리머니', 'referee', '엘 클라시코 주심', '리그 우승과 "진정해" 세리머니. 클라시코마다 카드를 꺼내던 주심이 상대다.'),
    Y(2013, 'madrid', 'eyebrow', '두 번째 발롱도르', 'striker', '스웨덴 거인 즐라탄탄', '월드컵 플레이오프 해트트릭으로 스웨덴 거인을 꺾고 두 번째 발롱도르.', { ballon: true }),
    Y(2014, 'madrid', 'eyebrow', '열 번째 유럽 정상', 'keeper', '마드리드 이웃 수문장', '리스본 결승, 열 번째 유럽 정상. 같은 도시 라이벌의 수문장이 마지막 벽.', { ballon: true }),
    Y(2015, 'madrid', 'eyebrow', '득점 기계 모드', 'maestro', '뮌헨 전차 지휘관', '득점 기계의 해. 유럽 무대에서 뮌헨 전차 군단의 지휘관과 격돌.'),
    Y(2016, 'madrid', 'headbutt', '유로 우승, 나방과의 결승', 'giant', '파리 결승의 나방 군단장', '유로 결승, 부상으로 쓰러진 뒤 벤치에서 지휘한 우승. 나방 떼가 날아들던 파리의 밤.', { ballon: true }),
    Y(2017, 'madrid', 'headbutt', '유럽 2연패, 다섯 번째 발롱도르', 'striker', '카디프 결승 저격수', '카디프 결승 두 골로 유럽 2연패. 다섯 번째 발롱도르.', { ballon: true }),
    Y(2018, 'turin', 'allegro', '전설의 바이시클 킥, 토리노행', 'keeper', '바이시클 킥의 증인 수문장', '토리노 원정에서 바이시클 킥, 상대 팬까지 기립. 그 수문장이 있는 팀으로 이적했다.'),
    Y(2019, 'turin', 'smoker', '네이션스리그 초대 우승', 'tackler', '아약스 영건 대장', '네이션스리그 초대 우승. 유럽 무대에서 암스테르담 영건 군단에 발목을 잡혔다.'),
    Y(2020, 'turin', 'maestro', '텅 빈 경기장', 'referee', 'VAR 판독관', '관중 없는 시즌. 골을 지우는 보이지 않는 심판, VAR 판독관과 싸운다.'),
    Y(2021, 'manchester2', 'babyface', '맨체스터 귀환', 'maestro', '시끄러운 이웃 지휘관', '12년 만의 맨체스터 귀환. 시끄러운 이웃 구단의 지휘관과 더비.'),
    Y(2022, 'manchester2', 'professor', '폭로 인터뷰, 다섯 번째 월드컵', 'referee', '폭로 인터뷰 기자왕', '폭로 인터뷰로 구단과 결별, 다섯 번째 월드컵. 기자왕과의 설전.'),
    Y(2023, 'riyadh', 'desert', '사막의 별, 리야드행', 'striker', '사막 더비 에이스', '사막의 별이 되어 리야드행. 사막 더비의 에이스와 득점 경쟁.'),
    Y(2024, 'riyadh', 'desert', '통산 900골 돌파', 'keeper', '유로 2024 수문장', '통산 900골. 유로 2024 승부차기에서 실축을 막아낸 수문장과 재대결.'),
    Y(2025, 'riyadh', 'desert', '네이션스리그 두 번째 우승', 'maestro', '무적함대 지휘자', '네이션스리그 결승에서 무적함대를 꺾고 두 번째 우승.'),
    Y(2026, 'national', 'marti', '마지막 월드컵 — 최종 결전', 'messi', '메시', '마지막 월드컵. 20년을 함께 달려온 영원한 라이벌, 메시와의 최종 결전.', { final: true })
  ];
  // 메시 career: debut at 17 in 2004 → the last World Cup against 날두.
  RS.YEARS_MESSI = [
    Y(2004, 'barcelona', 'rijkaard', '17세 프로 데뷔', 'keeper', '더비 상대 수문장', '바르셀로나에서 17세에 데뷔. 첫 더비, 골문엔 베테랑 수문장이 버티고 있다.'),
    Y(2005, 'barcelona', 'rijkaard', '첫 리그 우승, 청소년 월드컵 우승', 'tackler', '네덜란드 U-20 수비대장', '첫 리그 우승과 청소년 월드컵 우승. 결승에서 맞선 네덜란드 수비대장이 다시 온다.'),
    Y(2006, 'barcelona', 'rijkaard', '유럽 정상, 부상으로 결승 결장', 'giant', '파리 결승의 런던 거인', '유럽 정상에 섰지만 부상으로 결승을 벤치에서 봤다. 그날 런던 팀의 거인 센터백과 싸운다.'),
    Y(2007, 'barcelona', 'rijkaard', '마라도나 재현 골', 'maestro', '헤타페 중원 지휘자', '하프라인부터 여섯 명을 제친 마라도나 재현 골. 그 경기 상대 지휘자가 복수를 노린다.'),
    Y(2008, 'barcelona', 'pep', '베이징 올림픽 금메달', 'striker', '나이지리아 폭격기', '베이징 올림픽 결승. 나이지리아의 폭격기를 꺾고 금메달.'),
    Y(2009, 'barcelona', 'pep', '6관왕, 첫 발롱도르', 'keeper', '로마 결승 수문장', '한 해 6관왕. 로마 결승에서 헤딩골을 내준 수문장이 설욕을 노린다. 첫 발롱도르.', { ballon: true }),
    Y(2010, 'barcelona', 'pep', '월드컵 8강 탈락, 두 번째 발롱도르', 'giant', '독일 전차 센터백', '남아공 월드컵 8강에서 독일 전차에 0-4. 그 센터백을 넘어야 한다.', { ballon: true }),
    Y(2011, 'barcelona', 'pep', '웸블리 결승, 세 번째 발롱도르', 'referee', '엘 클라시코 주심', '웸블리 결승골로 유럽 정상. 클라시코마다 카드를 꺼내던 주심이 상대다.', { ballon: true }),
    Y(2012, 'barcelona', 'tito', '한 해 91골', 'tackler', '거친 수비대장', '한 해 91골 세계 기록. 매 경기 발목을 노린 거친 수비대장과 맞붙는다.', { ballon: true }),
    Y(2013, 'barcelona', 'tata', '햄스트링 부상의 해', 'tackler', '부상 유발 백태클러', '반복된 햄스트링 부상. 백태클러를 피하며 버텨야 한다.'),
    Y(2014, 'barcelona', 'luis', '브라질 월드컵 준우승', 'giant', '마라카낭 결승 독일 거인', '마라카낭 결승 연장 실점. 골든볼을 들고도 웃지 못한 밤, 독일 거인과 재대결.'),
    Y(2015, 'barcelona', 'luis', 'MSN 트레블, 다섯 번째 발롱도르', 'keeper', '베를린 결승 토리노 수문장', 'MSN 삼각편대로 트레블. 베를린 결승의 토리노 수문장을 넘는다.', { ballon: true }),
    Y(2016, 'barcelona', 'luis', '코파 결승 실축, 은퇴 번복', 'keeper', '코파 결승 칠레 수문장', '코파 결승 승부차기 실축 후 대표팀 은퇴 선언, 그리고 번복. 칠레 수문장과 다시 맞선다.'),
    Y(2017, 'barcelona', 'valverde', '600골, 유니폼 세리머니', 'referee', '베르나베우 주심', '원정 클라시코 600번째 골과 유니폼 세리머니. 그 밤의 주심이 카드를 꺼낸다.'),
    Y(2018, 'barcelona', 'valverde', '주장 완장, 러시아 월드컵 16강', 'striker', '프랑스 번개 스트라이커', '주장 완장을 찼지만 러시아 월드컵 16강에서 프랑스의 번개에 무너졌다.'),
    Y(2019, 'barcelona', 'valverde', '여섯 번째 발롱도르, 안필드 참사', 'maestro', '안필드 압박 지휘자', '여섯 번째 발롱도르. 하지만 안필드에서 3-0 리드를 날린 밤, 압박의 지휘자와 재대결.', { ballon: true }),
    Y(2020, 'barcelona', 'koeman', '뷔로팩스 이적 요청', 'referee', '뷔로팩스 회장단', '팩스로 이적을 요청했지만 막혔다. 계약서를 흔드는 회장단이 상대다.'),
    Y(2021, 'paris', 'poch', '코파 우승, 파리행, 일곱 번째 발롱도르', 'giant', '마라카낭 결승 브라질 거인', '마라카낭에서 브라질을 꺾고 첫 성인 대표팀 우승. 눈물의 작별 뒤 파리행.', { ballon: true }),
    Y(2022, 'argentina', 'scaloni', '카타르 월드컵 우승', 'striker', '결승 해트트릭 폭격기', '카타르 결승, 상대 폭격기의 해트트릭을 넘어 승부차기 끝에 월드컵 우승.'),
    Y(2023, 'miami', 'tata', '마이애미행, 여덟 번째 발롱도르', 'maestro', '리그스컵 결승 지휘자', '마이애미행 첫 대회 우승. 리그스컵 결승 상대 지휘자와의 대결. 여덟 번째 발롱도르.', { ballon: true }),
    Y(2024, 'argentina', 'scaloni', '코파 아메리카 2연패', 'tackler', '결승 콜롬비아 수비대장', '코파 결승에서 발목 부상으로 눈물. 콜롬비아 수비대장을 넘어 2연패.'),
    Y(2025, 'miami', 'mascherano', '서포터스 실드', 'keeper', 'MLS 결승 수문장', 'MLS 정규리그 1위 서포터스 실드. 결승 무대의 수문장과 승부.'),
    Y(2026, 'argentina', 'scaloni', '마지막 월드컵 — 최종 결전', 'ronaldo', '호날두', '마지막 월드컵. 20년을 함께 달려온 영원한 라이벌, 호날두와의 최종 결전.', { final: true })
  ];
  // Playable heroes. selectHero() points RS.YEARS / DEBUT / BIRTH at the chosen career (one career at a time).
  RS.HEROES = {
    ronaldo: { name: '호날두', short: '날두', moveMul: 1, startSkill: 'kick', years: RS.YEARS, debut: 2002, birth: 1985, desc: '투사체 공격 · 슬라이딩 5초', rival: '메시' },
    messi: { name: '메시', short: '메시', moveMul: 1.22, startSkill: 'orbit', years: RS.YEARS_MESSI, debut: 2004, birth: 1987, desc: '빠른 발 · 회전하는 발롱도르 공 · 슬라이딩 3초', rival: '호날두' }
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

  // Per-year tuning derived from index so new years need no extra numbers.
  RS.yearTuning = function (idx) {
    const y = RS.YEARS[idx];
    const gentle = idx === 0 ? 0.32 : idx === 1 ? 0.75 : 1; // first two years: phone newcomers
    const t = {
      hpMul: 1 + 0.55 * idx + 0.03 * idx * idx,
      dmgMul: (1 + 0.1 * idx) * gentle,
      speedMul: 1 + 0.008 * idx,
      spawnRate: (2.3 + 0.18 * idx) * (idx === 0 ? 0.5 : 1),
      maxAlive: Math.min(420, 150 + 12 * idx),
      duration: 60, // one minute per season, then the boss
      // inside a stage enemies visibly toughen: by the end they have this much more HP / damage / speed
      rampHp: 0.35, rampDmg: 0.2 * gentle, rampSpeed: 0.1,
      xpMul: 1 + 0.16 * idx,
      bossHpMul: 1 + 0.55 * idx + 0.03 * idx * idx,
      bossDmgMul: (1 + 0.12 * idx) * gentle,
      bossCool: idx === 0 ? 1.2 : 1,
      bossDensity: Math.min(0.85, 0.7 + 0.04 * idx), // fewer bullets on screen: readable fights
      minis: 1 + Math.floor(idx / 10), // mini-bosses per wave (4 waves a stage; 2 in the debut year)
      bossFight: idx === 0 ? 0.7 : idx === 1 ? 0.85 : 1, // shorter boss fights for newcomers
      mix: [{ type: 'grunt', w: 10 }]
    };
    if (idx >= 1) t.mix.push({ type: 'runner', w: 4 + Math.min(4, idx * 0.3) });
    if (idx >= 3) t.mix.push({ type: 'tank', w: 1.2 + Math.min(2, idx * 0.1) });
    if (idx >= 7) t.mix.push({ type: 'ref', w: 0.5 + Math.min(0.6, idx * 0.03) }); // rare: ranged mobs clutter the screen
    return t;
  };

  // ---------------------------------------------------------------- Meta progression (permanent, bought between runs)
  // cost: coins per level (array) or ballon cost. 발롱도르 come from real Ballon d'Or years and beating 메시.
  RS.META = {
    might: { name: '근력 훈련', icon: '🏋️', desc: '공격력 +5%', max: 5, cost: [80, 160, 280, 450, 700], mods: { dmg: 0.05 } },
    vitality: { name: '심폐 지구력', icon: '❤️', desc: '최대 체력 +10', max: 5, cost: [60, 120, 220, 360, 550], mods: { hp: 10 } },
    swift: { name: '스프린트', icon: '👟', desc: '이동속도 +4%', max: 3, cost: [100, 250, 500], mods: { moveSpeed: 0.04 } },
    magnetM: { name: '시야', icon: '🧲', desc: '흡수 범위 +15%', max: 3, cost: [70, 160, 320], mods: { magnet: 0.15 } },
    growth: { name: '전술 이해', icon: '📘', desc: '경험치 +6%', max: 5, cost: [90, 180, 320, 500, 750], mods: { xp: 0.06 } },
    greed: { name: '스폰서 계약', icon: '💰', desc: '코인 획득 +10%', max: 5, cost: [60, 140, 260, 420, 650], mods: { gold: 0.10 } },
    cooldown: { name: '회복 훈련', icon: '⏳', desc: '쿨타임 -3%', max: 3, cost: [150, 350, 700], mods: { cd: -0.03 } },
    revive: { name: '불사조 정신', icon: '🔥', desc: '연도마다 1회 부활', max: 1, ballon: [2], mods: { revive: 1 } },
    reroll: { name: '전술 보드', icon: '🔁', desc: '레벨업 리롤 +1', max: 3, ballon: [1, 1, 1], mods: { reroll: 1 } }
  };
})(globalThis.RS = globalThis.RS || {});
