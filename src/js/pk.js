/* 호날두 서바이버즈 — 페널티킥 (round 10): the PK 챌린지 after every fifth match and the career's real penalty
 * shootouts. Rules and data only (no DOM); the scene and its touch steps are in pkscene.js, the screen in main.js. */
(function (RS) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------------------------------------------------------------- the goal mouth
  // Nine zones, numbered from the ground up (left to right as the kicker sees them):
  //   7 8 9
  //   4 5 6
  //   1 2 3
  // A young player only aims along the ground (1–3 = left / middle / right); the middle row opens at
  // Lv.PK_ZONE_LV[0] and the row under the bar at Lv.PK_ZONE_LV[1].
  RS.PK_ZONE_LV = [35, 70]; // a career runs from about Lv.11 to Lv.120: six zones from its first third, nine from its second
  RS.pkZoneCount = (level) => (level >= RS.PK_ZONE_LV[1] ? 9 : level >= RS.PK_ZONE_LV[0] ? 6 : 3);
  RS.pkCol = (z) => (z - 1) % 3; // 0 left, 1 middle, 2 right
  RS.pkRow = (z) => Math.floor((z - 1) / 3); // 0 along the ground, 2 under the bar
  // per zone: save = how often a keeper rated 80 stops a clean, well-struck shot there; off = how often a clean
  // strike there still misses. The top corners are the hardest to stop and the easiest to miss.
  RS.PK_ZONE = {
    1: { save: 0.24, off: 0.04 }, 2: { save: 0.42, off: 0.02 }, 3: { save: 0.24, off: 0.04 },
    4: { save: 0.28, off: 0.05 }, 5: { save: 0.55, off: 0.02 }, 6: { save: 0.28, off: 0.05 },
    7: { save: 0.1, off: 0.09 }, 8: { save: 0.34, off: 0.06 }, 9: { save: 0.1, off: 0.09 }
  };

  // ---------------------------------------------------------------- the kicker
  // 골결정력 (1–99): the hero's own touch from the spot (날두 scored 84 % of his career penalties, 메시 78 %),
  // + the career level (up to +24 at Lv.120, the end of a career), + the 훈련장's penalty drill (RS.META.pkdrill, +3 a level).
  RS.PK_BASE = { ronaldo: 62, messi: 54, torres: 58 }; // 토레쓰 (round 11): a game value between the two, not a record
  RS.pkFinishing = function (build, meta) {
    const hero = build && RS.PK_BASE[build.hero] != null ? build.hero : 'ronaldo';
    const drill = (meta && meta.upgrades && meta.upgrades.pkdrill) || 0;
    return clamp(Math.round(RS.PK_BASE[hero] + Math.min(24, ((build && build.level) || 1) * 0.2) + 3 * drill), 1, 99);
  };
  // The power gauge sweeps 0 → 1 → 0 and the tap stops it: 'perfect' inside PK_POWER.perfect, 'weak' below
  // PK_POWER.weak (an easy save), 'over' past PK_POWER.over (skied or dragged wide), 'ok' between.
  RS.PK_POWER = { weak: 0.55, perfect: [0.7, 0.88], over: 0.95 };
  RS.pkPowerGrade = (p) => (p > RS.PK_POWER.over ? 'over' : p >= RS.PK_POWER.perfect[0] && p <= RS.PK_POWER.perfect[1] ? 'perfect' : p < RS.PK_POWER.weak ? 'weak' : 'ok');
  // How fast the gauge and the 정확도 needle move and how wide the needle's target is (degrees of the dial; the
  // 'great' band sits in the middle of 'good'). The lower the 골결정력 the faster and the narrower: a young
  // player has to be exact (fin 55: a 127 ms window, 32 ms for 'great'; fin 95: 200 ms and 54 ms).
  RS.pkTiming = (fin) => ({
    gauge: 1.5 - fin * 0.006, // sweeps a second: fin 55 → 1.17, fin 95 → 0.93
    needle: 0.95 - fin * 0.003, // turns a second: 0.785 → 0.665
    good: Math.round(18 + fin * 0.32), // 36° → 48°
    great: Math.round(3 + fin * 0.11) // 9° → 13°
  });
  // Where the needle stopped: within great/2 of the target's centre 'great', within good/2 'good', else 'miss'.
  RS.pkNeedleGrade = (diffDeg, timing) => {
    const d = Math.abs(((diffDeg % 360) + 540) % 360 - 180);
    return d <= timing.great / 2 ? 'great' : d <= timing.good / 2 ? 'good' : 'miss';
  };

  // ---------------------------------------------------------------- keepers
  // rating: 80 = the zone table; higher saves more. legend: the hall of fame. nemesis: the most one hero can score
  // against him. mate: the hero who had him on his own side (never drawn as that hero's PK 챌린지 keeper).
  // look: kit, trim, hair, skin and hair style of his sprite (RS.Sprites.pkKeeper; style 'cap' = a cap or 쩨흐's
  // black head guard, C its colour).
  RS.PK_KEEPERS = {
    local: { name: '동네 수문장', rating: 55, look: { K: '#c8a020', k2: '#6a4a10', H: '#3a2a1a', style: 'short' } },
    reserve: { name: '2부 리그 수문장', rating: 64, look: { K: '#7a8a9a', k2: '#2a3a4a', H: '#2a1a10', style: 'fade' } },
    pro: { name: '1부 리그 수문장', rating: 72, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', style: 'slick' } },
    national: { name: '국가대표 수문장', rating: 80, look: { K: '#2a3aa8', k2: '#ffd400', H: '#4a3020', style: 'short' } },
    cech: { name: '쩨흐', rating: 90, legend: true, nemesis: { messi: 0.1 }, note: '메시의 천적 — 여섯 번 만나 한 골도 못 넣었고, 2012년 페널티킥은 크로스바를 때렸다', look: { K: '#26262e', k2: '#5a5a66', H: '#1a1a1a', style: 'cap', C: '#111111' } },
    buffon: { name: '부퐁', rating: 93, legend: true, mate: 'ronaldo', look: { K: '#2e2e2e', k2: '#e8e8e8', H: '#2a1a10', style: 'long' } },
    casillas: { name: '카시야쓰', rating: 91, legend: true, mate: 'ronaldo', look: { K: '#f2c200', k2: '#1a1a1a', H: '#2a1a10', style: 'short' } },
    vdsar: { name: '판데르싸르', rating: 88, legend: true, mate: 'ronaldo', look: { K: '#2a6a3a', k2: '#111111', H: '#c0a070', style: 'short' } },
    neuer: { name: '노이어르', rating: 93, legend: true, look: { K: '#9ad010', k2: '#111111', H: '#d8b870', style: 'short' } },
    courtois: { name: '꾸르뚜아', rating: 90, legend: true, look: { K: '#7a3ad8', k2: '#111111', H: '#3a2a1a', style: 'long' } },
    oblak: { name: '오블라끄', rating: 91, legend: true, look: { K: '#2a8a5a', k2: '#111111', H: '#3a2a1a', style: 'long' } },
    alisson: { name: '알리쏭', rating: 90, legend: true, look: { K: '#e8e8e8', k2: '#1a5ad8', H: '#2a1a10', style: 'long' } },
    dibu: { name: '디부 마르띠', rating: 92, legend: true, mate: 'messi', note: '승부차기의 악마', look: { K: '#c8e000', k2: '#6a2ab8', H: '#1a1a1a', style: 'fade' } },
    yashin: { name: '검은 거미 야씬', rating: 97, legend: true, note: '전설 중의 전설', look: { K: '#0e0e10', k2: '#2a2a2e', H: '#0e0e10', style: 'cap', C: '#0e0e10' } },
    // the keepers of the career shootouts (RS.SHOOTOUTS)
    james: { name: '제임쓰', rating: 74, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', s: '#7a5236', style: 'fade' } },
    robinson: { name: '로빈쓴', rating: 77, look: { K: '#e8e8e8', k2: '#c41e2a', H: '#3a2a1a', style: 'short' } },
    bravo: { name: '브라보오', rating: 84, look: { K: '#1a1a1a', k2: '#e01b1b', H: '#1a1a1a', style: 'slick' } },
    ospina: { name: '오스삐나', rating: 82, look: { K: '#f0c000', k2: '#1a3a8a', H: '#1a1a1a', style: 'long' } },
    lloris: { name: '요리쓰', rating: 86, look: { K: '#ffd400', k2: '#1a1a1a', H: '#4a3020', style: 'short' } },
    willis: { name: '윌리쓰', rating: 70, look: { K: '#ffd400', k2: '#1a1a1a', H: '#d8b870', style: 'bald' } },
    dominguez: { name: '도밍게쓰', rating: 74, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', style: 'short' } }
  };
  // our own keeper when the other side kicks (a shootout): the squad's green keeper kit
  RS.PK_OUR_LOOK = { K: '#2fd36b', k2: '#1a1a1a', H: '#2a1a10', style: 'cap', C: '#1a1a1a' };
  // the national teams' kits for their shootouts (RS.Sprites.pkHero / pkMate)
  RS.NAT_KITS = {
    ronaldo: { main: '#c41e2a', alt: '#1f7a3a', shorts: '#1f7a3a', socks: '#c41e2a', pattern: 'trim' },
    messi: { main: '#8cc8f0', alt: '#f6f6f6', shorts: '#1a1a2e', socks: '#f6f6f6', pattern: 'stripes' },
    torres: { main: '#c8102e', alt: '#f6c700', shorts: '#1c2c5b', socks: '#1c2c5b', pattern: 'trim' }
  };
  // The PK 챌린지 keeper grows with the career: 동네 수문장 in the first seasons, legends at the end.
  RS.PK_POOLS = [
    ['local', 'reserve'],
    ['reserve', 'pro', 'national'],
    ['national', 'cech', 'casillas', 'vdsar', 'courtois', 'oblak'],
    ['neuer', 'buffon', 'cech', 'courtois', 'oblak', 'alisson', 'dibu', 'casillas', 'vdsar'],
    ['yashin', 'neuer', 'buffon', 'dibu', 'alisson']
  ];
  RS.pkChallengeKeeper = function (rng, hero, yearIdx) {
    const years = RS.HEROES[hero] ? RS.HEROES[hero].years : RS.YEARS;
    const t = yearIdx / Math.max(1, years.length - 1);
    const band = t < 0.15 ? 0 : t < 0.35 ? 1 : t < 0.6 ? 2 : t < 0.85 ? 3 : 4;
    const pool = RS.PK_POOLS[band].filter((id) => RS.PK_KEEPERS[id].mate !== hero);
    return pool[Math.floor(rng() * pool.length)];
  };
  RS.pkTier = (k) => (k.rating >= 95 ? '전설 중의 전설' : k.legend ? '레전드' : k.rating >= 78 ? '국가대표급' : k.rating >= 68 ? '프로' : '아마추어');

  // ---------------------------------------------------------------- one kick
  // Chance of a goal, a save or a miss. o: { fin, keeper (RS.PK_KEEPERS entry), zone, power (0–1),
  // acc: 'great' | 'good' | 'miss', hero }. Sums to 1.
  RS.pkOdds = function (o) {
    const Z = RS.PK_ZONE[o.zone], row = RS.pkRow(o.zone), corner = RS.pkCol(o.zone) !== 1;
    const pg = RS.pkPowerGrade(o.power), fin = o.fin;
    // a miss: a clean strike's own risk (less with 골결정력), a mistimed one (the corners suffer most), an over-hit
    // one (the top row flies over the bar)
    const mBase = Z.off * (o.acc === 'great' ? 0.5 : 1) * (1.3 - fin / 100);
    const mAcc = o.acc === 'miss' ? (corner ? (row === 2 ? 0.6 : 0.42) : 0.15) : 0;
    const mPow = pg === 'over' ? (row === 2 ? 0.65 : row === 1 ? 0.4 : 0.22) : 0;
    const off = 1 - (1 - mBase) * (1 - mAcc) * (1 - mPow);
    // a save: the zone, the keeper (squared: a legend reaches what others cannot), power, placement and 골결정력
    const save = clamp(Z.save * (o.keeper.rating / 80) ** 2 * { weak: 1.7, ok: 1.12, perfect: 0.85, over: 0.75 }[pg] *
      { great: 0.75, good: 1, miss: 1.35 }[o.acc] * (1.25 - fin / 200), 0.02, 0.95);
    const odds = { goal: (1 - off) * (1 - save), save: (1 - off) * save, off };
    // a keeper one hero could never beat (메시 against 쩨흐): at most that chance, the rest half on the frame
    const cap = o.keeper.nemesis && o.keeper.nemesis[o.hero];
    if (cap != null && odds.goal > cap) { const rest = 1 - cap; odds.goal = cap; odds.save = rest / 2; odds.off = rest / 2; odds.nemesis = true; }
    return odds;
  };
  // Roll one kick. Returns { res: 'goal' | 'save' | 'post' | 'bar' | 'over' | 'wide', goal, diveCol (the keeper's
  // dive: 0 left, 1 stays, 2 right), odds }. On a save he went the right way; on a goal mostly the wrong one.
  RS.pkKick = function (rng, o) {
    const odds = RS.pkOdds(o), r = rng(), row = RS.pkRow(o.zone), col = RS.pkCol(o.zone);
    let res;
    if (r < odds.goal) res = 'goal';
    else if (r < odds.goal + odds.save) res = 'save';
    else {
      const q = rng(), high = row === 2 || RS.pkPowerGrade(o.power) === 'over';
      if (odds.nemesis && q < 0.6) res = 'bar';
      else if (high && q < 0.6) res = q < 0.2 ? 'bar' : 'over';
      else res = col !== 1 && q < 0.8 ? 'post' : 'wide';
    }
    const others = [0, 1, 2].filter((c) => c !== col);
    const diveCol = res === 'save' ? col : res === 'goal' && rng() < 0.75 ? others[Math.floor(rng() * 2)] : Math.floor(rng() * 3);
    return { res, goal: res === 'goal', diveCol, odds };
  };
  // 완전 오토 (and the 🤖 button): a sensible kick — the corners once they are open — executed as steadily as the
  // 골결정력 allows.
  RS.pkBotKick = function (rng, fin, level) {
    const n = RS.pkZoneCount(level);
    const pool = n === 9 ? [7, 9, 1, 3, 4, 6] : n === 6 ? [1, 3, 4, 6, 1, 3] : [1, 3, 1, 3, 2];
    const zone = pool[Math.floor(rng() * pool.length)];
    const spread = 0.2 - fin * 0.0013;
    const power = clamp(0.79 + (rng() * 2 - 1) * spread, 0.2, 1);
    const r = rng(), great = 0.12 + fin * 0.0035;
    return { zone, power, acc: r < great ? 'great' : r < great + 0.55 ? 'good' : 'miss' };
  };

  // ---------------------------------------------------------------- PK 챌린지 (after every fifth match)
  RS.PK_EVERY = 5;
  RS.PK_KICKS = 5;
  // coins a goal: 11 against 동네 수문장 … 32 against 야씬; all five in pays three more
  RS.pkCoinPer = (keeper) => Math.round(8 + (keeper.rating - 50) * 0.5);
  RS.pkReward = (keeper, goals) => RS.pkCoinPer(keeper) * (goals + (goals >= RS.PK_KICKS ? 3 : 0));
  // Titles for the penalties a hero has scored over all his careers (PK 챌린지 and 승부차기 alike).
  RS.PK_TITLES = [
    { goals: 10, icon: '🎯', name: '믿음직한 키커' },
    { goals: 25, icon: '🔥', name: '11m의 강심장' },
    { goals: 50, icon: '👑', name: '세계 최고의 페널티 키커' }
  ];
  RS.pkTitle = (rec) => RS.PK_TITLES.filter((t) => rec.goals >= t.goals).pop() || null;
  RS.pkNextTitle = (rec) => RS.PK_TITLES.find((t) => rec.goals < t.goals) || null;

  // PK records live in save.meta.pk: games played (for the PK 챌린지 rhythm) and each hero's own penalties.
  RS.pkRec = (r) => Object.assign({ goals: 0, shots: 0, streak: 0, best: 0, saves: 0, won: 0, lost: 0 }, r && typeof r === 'object' ? r : {});
  RS.normalizePk = function (pk) {
    pk = pk && typeof pk === 'object' ? pk : {};
    pk.games = Math.max(0, pk.games | 0);
    if (!pk.heroes || typeof pk.heroes !== 'object') pk.heroes = {};
    for (const h of Object.keys(RS.HEROES)) pk.heroes[h] = RS.pkRec(pk.heroes[h]);
    return pk;
  };
  // A match ended (cleared or not): returns true when a PK 챌린지 is due now.
  RS.pkCountGame = function (meta) {
    meta.pk = RS.normalizePk(meta.pk);
    meta.pk.games++;
    return meta.pk.games % RS.PK_EVERY === 0;
  };
  // One kick taken by the hero: the record and the streak. Returns the title it earned, if any.
  RS.pkRecord = function (meta, hero, goal) {
    meta.pk = RS.normalizePk(meta.pk);
    const r = meta.pk.heroes[hero], before = RS.pkTitle(r);
    r.shots++;
    if (goal) { r.goals++; r.streak++; r.best = Math.max(r.best, r.streak); } else r.streak = 0;
    const now = RS.pkTitle(r);
    return now && now !== before ? now : null;
  };
  RS.pkRate = (r) => (r.shots ? Math.round((r.goals / r.shots) * 100) : 0);

  // ---------------------------------------------------------------- the career's penalty shootouts
  // The real ones, in the seasons of the game (sources: messivsronaldo.app shootout list, UEFA match reports).
  // order: the hero's place among his side's five kickers; single: one penalty in open play, no shootout;
  // nat: for the national team (else the season's club).
  RS.SHOOTOUTS = {
    ronaldo: {
      2004: { nat: true, title: '유로 2004 8강 승부차기', vs: '잉글랜드', keeper: 'james', order: 4, story: '안방 유로 8강, 잉글랜드와 연장까지 2-2. 열아홉 살 날두가 11m 앞에 선다.', real: '실제: 날두 성공, 포르투갈 6-5 승' },
      2006: { nat: true, title: '독일 월드컵 8강 승부차기', vs: '잉글랜드', keeper: 'robinson', order: 5, story: '윙크 논란 속 0-0. 다섯 번째 키커로 나선다.', real: '실제: 날두가 마지막 키커로 성공, 3-1 승' },
      2008: { title: '모스크바 챔스 결승 승부차기', vs: '첼씨', keeper: 'cech', order: 3, story: '빗속의 모스크바, 1-1. 세 번째 키커 날두 앞에 쩨흐가 선다.', real: '실제: 날두 실축(쩨흐 선방), 그래도 맨체스터 6-5 우승' },
      2012: { title: '챔스 4강 승부차기', vs: '뮌헨', keeper: 'neuer', order: 1, story: '마드리드의 4강 2차전, 합계 3-3. 첫 키커는 날두.', real: '실제: 날두 실축(노이어르 선방), 1-3 탈락' },
      2016: { title: '밀라노 챔스 결승 승부차기', vs: '아틀레띠꼬', keeper: 'oblak', order: 5, story: '마드리드 더비 결승 1-1. 다섯 번째 키커에게 우승이 걸렸다.', real: '실제: 날두가 우승을 확정하는 마지막 킥 성공, 5-3' },
      2024: { nat: true, title: '유로 2024 16강 승부차기', vs: '슬로베니아', keeper: 'oblak', order: 1, story: '연장전 페널티킥을 오블라끄에게 막히고 눈물. 승부차기 첫 키커로 다시 선다.', real: '실제: 날두 성공, 3-0 승 (우리 골키퍼 세 번 선방)' }
    },
    messi: {
      2012: { single: true, title: '챔스 4강 2차전 페널티킥', vs: '첼씨', keeper: 'cech', story: '첼씨는 10명, 이 한 방이면 결승이 보인다. 골문엔 천적 쩨흐.', real: '실제: 크로스바. 첼씨가 결승에 갔다' },
      2015: { nat: true, title: '코파 아메리카 결승 승부차기', vs: '칠레', keeper: 'bravo', order: 1, story: '산티아고 결승 0-0. 첫 키커로 나선다.', real: '실제: 메시 성공, 하지만 1-4 패' },
      2016: { nat: true, title: '코파 아메리카 결승 승부차기', vs: '칠레', keeper: 'bravo', order: 1, story: '또 칠레, 또 결승 승부차기. 첫 키커는 메시.', real: '실제: 메시 실축(크로스바 위로), 2-4 패, 대표팀 은퇴 선언' },
      2021: { nat: true, title: '코파 아메리카 4강 승부차기', vs: '콜롬비아', keeper: 'ospina', order: 1, story: '브라질리아 4강 1-1. 첫 키커로 나선다.', real: '실제: 메시 성공, 디부 마르띠 세 번 선방, 3-2 승' },
      2022: { nat: true, title: '카타르 월드컵 결승 승부차기', vs: '프랑스', keeper: 'lloris', order: 1, story: '3-3, 음바뻬의 해트트릭. 월드컵이 11m에 달렸다.', real: '실제: 메시 성공, 4-2 우승' },
      2023: { title: '리그스컵 결승 승부차기', vs: '내슈빌', keeper: 'willis', order: 1, story: '마이애미 첫 트로피가 걸린 결승 1-1.', real: '실제: 메시 성공, 10-9 끝장 승부 끝에 우승' },
      2024: { nat: true, title: '코파 아메리카 8강 승부차기', vs: '에콰도르', keeper: 'dominguez', order: 1, story: '1-1. 첫 키커 메시가 공을 내려놓는다.', real: '실제: 파넨카가 크로스바, 그래도 4-2 승' }
    }
  };
  RS.shootoutFor = function (hero, idx) {
    const y = RS.HEROES[hero] && RS.HEROES[hero].years[idx];
    return (y && RS.SHOOTOUTS[hero] && RS.SHOOTOUTS[hero][y.year]) || null;
  };
  // rewards (once per season of a career: a replay can only win back a lost one)
  RS.SHOOTOUT_COINS = 120; RS.SINGLE_COINS = 60; RS.SHOOTOUT_FANS = 5;
  RS.SO_MATE = 0.76; // a teammate's kick goes in this often against a keeper rated 80
  RS.SO_KICKS = 5;
  // Teammate kick: rolled. Against keeper rating K.
  RS.soMateKick = (rng, K) => rng() < clamp(RS.SO_MATE - (K - 80) * 0.006, 0.4, 0.95);
  // The other side's kick against our keeper (rating ourK). dive: the column the player sends him to (0 left,
  // 1 stays, 2 right; null = he guesses). The kicker goes for a corner most of the time and misses 7 %.
  RS.soOppKick = function (rng, ourK, dive) {
    const r = rng(), col = r < 0.42 ? 0 : r < 0.84 ? 2 : 1;
    const guess = dive == null ? (rng() < 0.42 ? 0 : rng() < 0.72 ? 2 : 1) : dive;
    let res;
    if (rng() < 0.07) res = col === 1 ? 'over' : rng() < 0.5 ? 'post' : 'wide';
    else if (guess === col && rng() < clamp(0.35 + (ourK - 70) * 0.008, 0.2, 0.7)) res = 'save';
    else res = 'goal';
    return { res, goal: res === 'goal', col, diveCol: guess };
  };
  // Our side's keeper: the best one in the squad (pitch or bench), else a club keeper.
  RS.soOurKeeper = function (build) {
    let best = 70;
    for (const m of (build.teammates || []).concat(build.bench || [])) { const t = RS.TEAMMATES[m.id]; if (t && t.role === 'keeper') best = Math.max(best, t.ovr); }
    return best;
  };
  // A shootout: five kicks a side, then sudden death. first: 'us' | 'them'. done/won once it is decided.
  RS.newShootout = (first) => ({ us: [], them: [], turn: first === 'them' ? 'them' : 'us', done: false, won: null });
  RS.soAdd = function (so, side, goal) {
    so[side].push(!!goal);
    so.turn = side === 'us' ? 'them' : 'us';
    const a = so.us.filter(Boolean).length, b = so.them.filter(Boolean).length, nu = so.us.length, nt = so.them.length;
    if (nu <= RS.SO_KICKS && nt <= RS.SO_KICKS) {
      // the first five: decided once one side can no longer catch up
      if (a > b + (RS.SO_KICKS - nt) || b > a + (RS.SO_KICKS - nu)) { so.done = true; so.won = a > b; }
    } else if (nu === nt && a !== b) { so.done = true; so.won = a > b; } // sudden death: after a pair of kicks
    if (!so.done && nu + nt >= 40) { so.done = true; so.won = a >= b; } // a guard; never reached in play
    return so;
  };
  // Is the next kick ours and the hero's? (his place among the first five; in sudden death the others go)
  RS.soHeroNext = (so, def) => so.turn === 'us' && so.us.length + 1 === (def.order || 1);
  // After the shootout (or the single penalty): rewards and the career's record of it.
  RS.applyShootout = function (save, idx, def, won, replay) {
    const c = save.career, out = { won, coins: 0, fans: 0 };
    c.shootouts = c.shootouts || {};
    const before = c.shootouts[idx];
    if (won && before !== 'win') { out.coins = def.single ? RS.SINGLE_COINS : RS.SHOOTOUT_COINS; save.meta.coins += out.coins; }
    if (!replay && !def.single) {
      const b = c.build;
      out.fans = won ? RS.SHOOTOUT_FANS : -RS.SHOOTOUT_FANS;
      b.fans = RS.clampFans((b.fans == null ? RS.FANS.start : b.fans) + out.fans);
    }
    if (before !== 'win') c.shootouts[idx] = won ? 'win' : 'loss';
    const rec = RS.normalizePk(save.meta.pk).heroes[c.build.hero];
    if (!def.single) { if (won) rec.won++; else rec.lost++; }
    return out;
  };
  // Could the next kick end the shootout, whichever way it goes? (the slow-motion kicks)
  RS.soDecisive = function (so) {
    for (const g of [true, false]) {
      const c = { us: so.us.slice(), them: so.them.slice(), turn: so.turn, done: false, won: null };
      if (RS.soAdd(c, so.turn, g).done) return true;
    }
    return false;
  };
  // A cleared season with a real shootout plays it now, unless this career has already won it (a lost one comes
  // back with every replay of the season).
  RS.shootoutDue = function (save, idx, cleared) {
    if (!cleared) return null;
    const def = RS.shootoutFor(save.career.build.hero, idx);
    return def && (save.career.shootouts || {})[idx] !== 'win' ? def : null;
  };
  // our side's name on the scoreboard: the national team or the season's club
  RS.soUsName = function (hero, idx, def) {
    if (def && def.nat) return hero === 'messi' ? '아르헨티나' : hero === 'torres' ? '스페인' : '포르투갈';
    const y = RS.HEROES[hero] && RS.HEROES[hero].years[idx];
    return (y && RS.ERAS[y.era] && RS.ERAS[y.era].club) || '우리 팀';
  };

  // ---------------------------------------------------------------- a PK session (the screen drives it)
  // kind 'challenge': the PK 챌린지, five kicks by the hero. kind 'shootout': the season's real shootout (or single
  // penalty). The screen asks next() for the next kick, plays it (RS.PKScene) and hands the outcome to record();
  // next() returns null once it is over, then finish() pays out and returns the summary.
  class PKSession {
    constructor(save, opt) {
      const b = save.career.build;
      this.save = save; this.kind = opt.kind; this.idx = opt.idx | 0; this.replay = !!opt.replay;
      this.rng = opt.rng || Math.random;
      this.hero = RS.HEROES[b.hero] ? b.hero : 'ronaldo';
      this.level = b.level || 1;
      this.small = RS.smallBody(b);
      this.fin = RS.pkFinishing(b, save.meta);
      this.zones = RS.pkZoneCount(this.level);
      if (opt.kind === 'shootout') {
        this.def = RS.shootoutFor(this.hero, this.idx);
        this.keeperId = this.def.keeper;
        this.so = this.def.single ? null : RS.newShootout(this.rng() < 0.5 ? 'us' : 'them');
        this.us = RS.soUsName(this.hero, this.idx, this.def);
      } else {
        this.def = null; this.so = null;
        this.keeperId = RS.pkChallengeKeeper(this.rng, this.hero, this.idx);
      }
      this.keeper = RS.PK_KEEPERS[this.keeperId];
      this.ourK = RS.soOurKeeper(b);
      this.ourKeeper = { name: '우리 골키퍼', rating: this.ourK, look: RS.PK_OUR_LOOK };
      this.kicks = []; // the hero's own kicks: { goal, res }
      this.titles = []; // titles earned on the way
      this.cur = null;
      this.result = null;
    }
    // The next kick: { who: 'hero' | 'mate' | 'opp', mode: 'shoot' | 'keep', n (the kick's number for its side),
    // decisive (slow motion), forced: { goal } for a teammate's kick (rolled now) }; null when it is over.
    next() {
      let c = null;
      if (this.kind === 'challenge') {
        const n = this.kicks.length;
        if (n < RS.PK_KICKS) c = { who: 'hero', mode: 'shoot', n: n + 1, decisive: n === RS.PK_KICKS - 1 && this.kicks.every((k) => k.goal) };
      } else if (!this.so) {
        if (!this.kicks.length) c = { who: 'hero', mode: 'shoot', n: 1, decisive: true };
      } else if (!this.so.done) {
        const so = this.so, decisive = RS.soDecisive(so);
        if (so.turn === 'them') c = { who: 'opp', mode: 'keep', n: so.them.length + 1, decisive };
        else if (RS.soHeroNext(so, this.def)) c = { who: 'hero', mode: 'shoot', n: so.us.length + 1, decisive };
        else c = { who: 'mate', mode: 'shoot', n: so.us.length + 1, decisive, forced: { goal: RS.soMateKick(this.rng, this.keeper.rating) } };
      }
      return (this.cur = c);
    }
    // the current kick's outcome ({ goal, res } — RS.PKScene.result)
    record(result) {
      const c = this.cur, goal = !!(result && result.goal);
      if (!c) return;
      const rec = RS.normalizePk(this.save.meta.pk).heroes[this.hero];
      if (c.who === 'hero') {
        this.kicks.push({ goal, res: result.res });
        const t = RS.pkRecord(this.save.meta, this.hero, goal);
        if (t) this.titles.push(t);
      } else if (c.who === 'opp' && result.res === 'save') rec.saves++;
      if (this.so) RS.soAdd(this.so, c.who === 'opp' ? 'them' : 'us', goal);
      this.cur = null;
    }
    // Pays out (once) and returns { kind, goals, shots, coins, won, fans, titles, score: [us, them] }.
    finish() {
      if (this.result) return this.result;
      const goals = this.kicks.filter((k) => k.goal).length, out = { kind: this.kind, goals, shots: this.kicks.length, coins: 0, fans: 0, titles: this.titles };
      if (this.kind === 'challenge') {
        out.coins = RS.pkReward(this.keeper, goals);
        this.save.meta.coins += out.coins;
        out.perfect = goals >= RS.PK_KICKS;
      } else {
        const won = this.so ? !!this.so.won : goals > 0;
        Object.assign(out, RS.applyShootout(this.save, this.idx, this.def, won, this.replay));
        if (this.so) out.score = [this.so.us.filter(Boolean).length, this.so.them.filter(Boolean).length];
      }
      return (this.result = out);
    }
  }
  RS.PKSession = PKSession;
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pk = 'R13.3';
