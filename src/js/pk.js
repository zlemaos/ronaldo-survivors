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
  // The power gauge sweeps 0 → 1 → 0 and the tap stops it (round 16, the user's gauge): red under PK_POWER.red (the
  // softest touch — a 파넨카 when aimed down the middle), grey 'weak' under PK_POWER.weak, yellow 'ok', green 'good'
  // inside PK_POWER.good, and inside the green a thin blue band around PK_POWER.blue — 'perfect', very hard to stop
  // on (RS.pkBlueHalf) — then yellow again and red 'over' past PK_POWER.over (skied or dragged wide).
  RS.PK_POWER = { red: 0.16, weak: 0.55, good: [0.7, 0.88], blue: 0.79, over: 0.95 };
  // half the blue band: fin 55 → ±1.35 %, fin 95 → ±1.75 % of the gauge (about 30 ms of its sweep)
  RS.pkBlueHalf = (fin) => (0.016 + (fin == null ? 70 : fin) * 0.0002) / 2;
  RS.pkPowerGrade = (p, fin) => {
    const P = RS.PK_POWER;
    if (p > P.over) return 'over';
    if (Math.abs(p - P.blue) <= RS.pkBlueHalf(fin)) return 'perfect';
    if (p >= P.good[0] && p <= P.good[1]) return 'good';
    return p < P.red ? 'red' : p < P.weak ? 'weak' : 'ok';
  };
  // 영점: how far the strike drifts from the point aimed at — 0 on the blue band with the needle in gold; it grows with
  // the distance from the blue band (1 at the green's edge) and with a needle off the gold (good +0.35, miss +1)
  RS.pkAimErr = (power, acc, fin) => Math.max(0, Math.abs(power - RS.PK_POWER.blue) - RS.pkBlueHalf(fin)) / 0.09 + ({ great: 0, good: 0.35, miss: 1 }[acc] || 0);
  RS.pkPerfect = (power, acc, fin) => acc === 'great' && RS.pkPowerGrade(power, fin) === 'perfect';
  // How fast the gauge and the 정확도 needle move and how wide the needle's target is (degrees of the dial; the
  // 'great' band sits in the middle of 'good'). The lower the 골결정력 the faster and the narrower: a young
  // player has to be exact (fin 55: a 127 ms window, 21 ms for 'great'; fin 95: 200 ms and 38 ms).
  RS.pkTiming = (fin) => ({
    gauge: 1.5 - fin * 0.006, // sweeps a second: fin 55 → 1.17, fin 95 → 0.93
    needle: 0.95 - fin * 0.003, // turns a second: 0.785 → 0.665
    good: Math.round(18 + fin * 0.32), // 36° → 48°
    great: Math.round(1 + fin * 0.08) // 5° → 9° (round 16: the gold is half of a perfect strike, so it is narrow)
  });
  // Where the needle stopped: within great/2 of the target's centre 'great', within good/2 'good', else 'miss'.
  RS.pkNeedleGrade = (diffDeg, timing) => {
    const d = Math.abs(((diffDeg % 360) + 540) % 360 - 180);
    return d <= timing.great / 2 ? 'great' : d <= timing.good / 2 ? 'good' : 'miss';
  };

  // ---------------------------------------------------------------- shot types (round 18)
  // The user: "키커 슛도 발등슛 감아차기 이런 거 지정해줘". The player picks how he strikes his own kick (the 🤖 picks
  // too, RS.pkBotKick). push 밀어차기 is the round-16 kick, unchanged, and the default. drive 발등슛 (the laces): the
  // ball flies faster (flight) and a keeper saves less (save), but the power is harder to control (the gauge sweeps
  // faster: gauge) and a strike off the blue band flies further off (base, drift, over: misses). curl 감아차기 (the
  // inside of the foot): it bends into the corner (fewer misses) on a slower gauge, but the ball is slower too — a
  // keeper who guessed right gets there more often (save), all the more an angry one who flies early (rage).
  // A soft touch down the middle stays a 파넨카 or a 티배깅 whatever was picked: a chip is a chip.
  RS.PK_SHOTS = {
    push: { name: '밀어차기', icon: '🦶', key: 'Q', tip: '기본 슛 · 무난하다', gauge: 1, save: 1, saveAdd: 0, base: 1, drift: 1, over: 1, rage: 1, flight: 1 },
    drive: { name: '발등슛', icon: '🚀', key: 'W', tip: '빠르고 세서 막기 어렵다 · 대신 게이지가 빨라 빗나가기 쉽다', gauge: 1.3, save: 0.75, saveAdd: 0, base: 1.15, drift: 1.45, over: 1.3, rage: 0.95, flight: 0.78 },
    curl: { name: '감아차기', icon: '🌀', key: 'E', tip: '구석으로 휘어 들어가 잘 안 빗나간다 · 대신 느려서 방향을 읽히면 막힌다', gauge: 0.8, save: 1.3, saveAdd: 0, base: 0.85, drift: 0.78, over: 0.9, rage: 1.12, flight: 1.2 }
  };
  RS.PK_SHOT_IDS = ['push', 'drive', 'curl'];
  RS.pkShot = (id) => RS.PK_SHOTS[id] || RS.PK_SHOTS.push;
  // 왼발잡이 (round 18, the user: "메시는 왼발잡이니까 … 반대편에 서있어야지 왼발로 차게")
  RS.PK_LEFT = { messi: true };
  RS.pkFoot = (hero) => (RS.PK_LEFT[hero] ? 'L' : 'R');

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
  // acc: 'great' | 'good' | 'miss', hero, rage (the keeper's 분노 모드) }. Sums to 1. kind: 'perfect' (blue band and
  // gold needle: it bends into the zone's own corner — no miss, and only a legend's fingertips), 'panenka' (the red
  // band down the middle: a chip that beats a keeper who dives and dies in the arms of one who stays), 'tbag' (too
  // soft down the middle: the keeper starts to go, stops and walks back to it), else a strike that drifts with its
  // 영점 error (RS.pkAimErr) — wide or over from a corner, up or sideways from the middle, and nearer the keeper.
  RS.PK_RAGE = 1.2; // × the keeper's saves in 분노 모드 (after one of our 파넨카 he read: he burns for the rest)
  // o.shot (round 18): 'push' (default) | 'drive' | 'curl' (RS.PK_SHOTS) scales the saves and the misses of a struck
  // ball; odds.shot says which one it was.
  RS.pkOdds = function (o) {
    const odds = pkOdds(o);
    odds.shot = RS.PK_SHOTS[o.shot] ? o.shot : 'push';
    return odds;
  };
  function pkOdds(o) {
    const Z = RS.PK_ZONE[o.zone], row = RS.pkRow(o.zone), col = RS.pkCol(o.zone), corner = col !== 1;
    const fin = o.fin, pg = RS.pkPowerGrade(o.power, fin), k2 = (o.keeper.rating / 80) ** 2 * (o.rage ? RS.PK_RAGE : 1);
    const S = RS.pkShot(o.shot), sv = S.save * (o.rage ? S.rage : 1), sa = S.saveAdd * (o.rage ? S.rage : 1);
    let odds;
    if (!corner && pg === 'red') { // 파넨카: he stays (reads it) or he dives (beaten, unless the chip is off)
      const stay = clamp(0.3 * k2 * (o.rage ? 1.5 : 1), 0.1, 0.8), off = 0.06;
      odds = { goal: (1 - stay) * (1 - off), save: stay, off: (1 - stay) * off, kind: 'panenka' };
    } else if (!corner && pg === 'weak') { // too soft down the middle: he comes back for it
      const save = clamp(0.82 * Math.min(1.1, k2), 0.5, 0.95);
      odds = { goal: 1 - save, save, off: 0, kind: 'tbag' };
    } else if (RS.pkPerfect(o.power, o.acc, fin)) {
      const save = clamp(Z.save * k2 * 0.4 * (1.15 - fin / 200) * sv + sa, 0.01, 0.9);
      odds = { goal: 1 - save, save, off: 0, kind: 'perfect' };
    } else {
      const E = RS.pkAimErr(o.power, o.acc, fin), drift = Math.pow(Math.min(E, 2.5), 1.5);
      // a miss: the zone's own risk (less with 골결정력), the drift (from the top corners it flies most), an over-hit
      const mBase = Math.min(0.5, Z.off * (1.3 - fin / 100) * S.base);
      const mErr = Math.min(0.85, drift * (corner ? (row === 2 ? 0.22 : 0.14) : 0.1) * S.drift);
      const mPow = pg === 'over' ? Math.min(0.9, (row === 2 ? 0.65 : row === 1 ? 0.4 : 0.22) * S.over) : 0;
      const off = 1 - (1 - mBase) * (1 - mErr) * (1 - mPow);
      // a save: the zone, the keeper (squared: a legend reaches what others cannot), power, the drift toward him
      const save = clamp(Z.save * k2 * { red: 2.2, weak: 1.75, ok: 1.15, good: 1, perfect: 0.9, over: 0.75 }[pg] * (1 + 0.3 * Math.min(E, 2)) * (1.25 - fin / 200) * sv + sa, 0.02, 0.95);
      odds = { goal: (1 - off) * (1 - save), save: (1 - off) * save, off, kind: null };
    }
    // a keeper one hero could never beat (메시 against 쩨흐): at most that chance, the rest half on the frame
    const cap = o.keeper.nemesis && o.keeper.nemesis[o.hero];
    if (cap != null && odds.goal > cap) { const rest = 1 - cap; odds.goal = cap; odds.save = rest / 2; odds.off = rest / 2; odds.nemesis = true; }
    return odds;
  }
  // What the aim grid shows: the zone's chance at a perfect strike (round 16: "최대한으로 잘 맞췄을 때")
  RS.pkZoneBest = (o, z) => RS.pkOdds(Object.assign({}, o, { zone: z, power: RS.PK_POWER.blue, acc: 'great' })).goal;
  // Roll one kick. Returns { res: 'goal' | 'save' | 'post' | 'bar' | 'over' | 'wide', goal, diveCol (the keeper's
  // dive: 0 left, 1 stays, 2 right), kind (pkOdds), kickAway (a save he boots away: an angry 파넨카 save, half the
  // 티배깅 ones), odds }. On a save he went the right way; on a goal mostly the wrong one.
  RS.pkKick = function (rng, o) {
    const odds = RS.pkOdds(o), r = rng(), row = RS.pkRow(o.zone), col = RS.pkCol(o.zone);
    let res;
    if (r < odds.goal) res = 'goal';
    else if (r < odds.goal + odds.save) res = 'save';
    else {
      // a 발등슛 off the mark rises (from the middle row too); a 감아차기 off the mark curls past the post
      const drive = odds.shot === 'drive' && !odds.kind, curl = odds.shot === 'curl' && !odds.kind;
      const q = rng(), high = row === 2 || (drive && row === 1) || RS.pkPowerGrade(o.power, o.fin) === 'over' || odds.kind === 'panenka';
      if (odds.nemesis && q < 0.6) res = 'bar';
      else if (high && q < (drive ? 0.75 : 0.6)) res = q < 0.2 ? 'bar' : 'over';
      else if (col === 1) res = q < (drive ? 0.7 : 0.55) ? 'over' : q < 0.8 ? 'post' : 'wide'; // the middle spreads up or sideways
      else res = q < (curl ? 0.5 : 0.8) ? 'post' : 'wide';
    }
    const others = [0, 2].concat(col === 1 ? [] : [1]).filter((c) => c !== col);
    let diveCol = res === 'save' ? col : res === 'goal' && rng() < 0.75 ? others[Math.floor(rng() * others.length)] : Math.floor(rng() * 3);
    if (odds.kind === 'panenka' || odds.kind === 'tbag') diveCol = res === 'save' ? 1 : rng() < 0.5 ? 0 : 2;
    const kickAway = res === 'save' && (odds.kind === 'panenka' || (odds.kind === 'tbag' && rng() < 0.5));
    return { res, goal: res === 'goal', diveCol, kind: odds.kind, kickAway, odds, shot: odds.shot };
  };
  // 완전 오토 (and the 🤖 button): a sensible kick — the corners once they are open — executed as steadily as the
  // 골결정력 allows (it finds the blue band and the gold now and then, never a 파넨카). The shot type (round 18) is
  // the one that pays best for its zone: 감아차기 under the bar, 발등슛 down the middle and low against a keeper
  // rated 88 or more, else 밀어차기; a faster gauge (발등슛) spreads its power wider.
  RS.pkBotKick = function (rng, fin, level, keeper) {
    const n = RS.pkZoneCount(level);
    const pool = n === 9 ? [7, 9, 1, 3, 4, 6] : n === 6 ? [1, 3, 4, 6, 1, 3] : [1, 3, 1, 3, 2];
    const zone = pool[Math.floor(rng() * pool.length)];
    const shot = RS.pkBotShot(zone, keeper);
    const spread = (0.2 - fin * 0.0013) * RS.pkShot(shot).gauge;
    const power = clamp(RS.PK_POWER.blue + (rng() * 2 - 1) * spread, 0.6, 1);
    const r = rng(), great = 0.12 + fin * 0.0035;
    return { zone, power, acc: r < great ? 'great' : r < great + 0.55 ? 'good' : 'miss', shot };
  };
  RS.pkBotShot = (zone, keeper) => (RS.pkRow(zone) === 2 ? 'curl' : RS.pkCol(zone) === 1 || ((keeper && keeper.rating) || 80) >= 88 ? 'drive' : 'push');

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
  // 1 stays, 2 right; null = he guesses). The kicker goes for a corner most of the time and misses 7 % (miss: the
  // 승부차기 토너먼트's own rate, RS.CUP_ROUNDS).
  // Round 16: the kick has a height too (row 0 low, 1 high: a third go high) and our keeper picks one of six cells —
  // early (a guess before the strike) or by watching the ball (react: seconds after the strike, within
  // RS.soReact(): 0.9 s on 이지, 0.6 on 노멀, 0.3 on 하드 — the user, round 16). The right cell saves often, the right
  // side at the wrong height seldom; a reaction saves more the
  // quicker it came. dive: { col, row, rt } | a column (old callers: the height is a coin) | null (he guesses).
  RS.SO_REACT = { easy: 0.9, normal: 0.6, hard: 0.3 };
  RS.soReact = () => RS.SO_REACT[RS.DIFF] || RS.SO_REACT.normal;
  RS.soOppAim = function (rng, miss) {
    const r = rng(), col = r < 0.42 ? 0 : r < 0.84 ? 2 : 1, row = rng() < 0.35 ? 1 : 0;
    const off = rng() < (miss == null ? 0.07 : miss) ? (col === 1 || row === 1 ? (rng() < 0.6 ? 'over' : 'post') : rng() < 0.5 ? 'post' : 'wide') : null;
    return { col, row, off };
  };
  RS.soGuess = (rng) => ({ col: rng() < 0.42 ? 0 : rng() < 0.72 ? 2 : 1, row: rng() < 0.4 ? 1 : 0 });
  RS.soSaveChance = function (ourK, aim, dive) {
    if (!dive || aim.off || dive.col !== aim.col) return 0;
    const kf = clamp(0.75 + (ourK - 70) * 0.017, 0.6, 1.25), same = dive.row === aim.row;
    if (dive.rt != null) return clamp((same ? 0.8 - 0.75 * clamp(dive.rt, 0, 1) : 0.1) * kf, 0, 0.9);
    return clamp((same ? 0.7 : 0.2) * kf, 0, 0.85);
  };
  RS.soOppSave = function (rng, ourK, aim, dive) {
    const res = aim.off || (rng() < RS.soSaveChance(ourK, aim, dive) ? 'save' : 'goal');
    return { res, goal: res === 'goal', col: aim.col, row: aim.row, diveCol: dive ? dive.col : 1, diveRow: dive ? dive.row : 0 };
  };
  RS.soOppKick = function (rng, ourK, dive, miss) {
    const aim = RS.soOppAim(rng, miss);
    const d = dive == null ? RS.soGuess(rng) : typeof dive === 'number' ? { col: dive, row: rng() < 0.5 ? 1 : 0 } : dive;
    return RS.soOppSave(rng, ourK, aim, d);
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
  // Is the next kick ours and the hero's? (his place among the first five; in sudden death the others go; def.all:
  // the 승부차기 토너먼트, where he takes every kick of ours)
  RS.soHeroNext = (so, def) => so.turn === 'us' && (!!def.all || so.us.length + 1 === (def.order || 1));
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

  // ---------------------------------------------------------------- 승부차기 토너먼트 (round 15, from the title screen)
  // A mini-game outside the career: four shootouts, 16강 → 8강 → 4강 → 결승, the hero taking all five of our kicks
  // (and the sudden-death ones) with the whole goal open (RS.CUP_LEVEL: nine zones). One loss ends the run. Each
  // round draws one side from its pool, never the hero's own nation, a keeper who played beside him (mate) or one
  // he can never beat (nemesis). The champion unlocks one of RS.CUP_REWARDS at random, one not unlocked yet; three
  // titles open all three, and after that a title pays RS.CUP_COINS.
  RS.CUP_LEVEL = 70;
  RS.CUP_COINS = 1000;
  RS.CUP_KEEPER = 84; // our national keeper's rating when the other side kicks
  // miss: how often the other side's kicker misses (the career's shootouts: 7 %); the early rounds' kickers are worse
  RS.CUP_ROUNDS = [
    { name: '16강', miss: 0.26, pool: [{ vs: '스위쓰', keeper: 'pro' }, { vs: '잉글랜드', keeper: 'robinson' }, { vs: '에콰도르', keeper: 'dominguez' }, { vs: '미국', keeper: 'willis' }] },
    { name: '8강', miss: 0.2, pool: [{ vs: '칠레', keeper: 'bravo' }, { vs: '콜롬비아', keeper: 'ospina' }, { vs: '프랑스', keeper: 'lloris' }, { vs: '네덜란드', keeper: 'vdsar' }] },
    { name: '4강', miss: 0.15, pool: [{ vs: '체코', keeper: 'cech' }, { vs: '스페인', keeper: 'casillas' }, { vs: '벨기에', keeper: 'courtois' }, { vs: '슬로베니아', keeper: 'oblak' }, { vs: '브라질', keeper: 'alisson' }] },
    { name: '결승', miss: 0.1, pool: [{ vs: '독일', keeper: 'neuer' }, { vs: '이탈리아', keeper: 'buffon' }, { vs: '아르헨티나', keeper: 'dibu' }, { vs: '소련', keeper: 'yashin' }] }
  ];
  // the champion's reward: one hero's move (RS.SKILLS, gift), held at SIUUU by every career of that hero
  RS.CUP_REWARDS = [{ id: 'penaldo', hero: 'ronaldo' }, { id: 'bribe', hero: 'messi' }, { id: 'hollywood', hero: 'torres' }];
  RS.CUP_GRADE = RS.GRADES.length - 1;
  RS.normalizeCup = function (c) {
    c = c && typeof c === 'object' ? c : {};
    return { played: Math.max(0, c.played | 0), wins: Math.max(0, c.wins | 0), best: Math.max(0, Math.min(RS.CUP_ROUNDS.length, c.best | 0)) };
  };
  RS.cupLeft = (meta) => RS.CUP_REWARDS.filter((r) => !(meta.unlocked && meta.unlocked[r.id]));
  // The four opponents of one run for this hero.
  RS.cupDraw = function (rng, hero) {
    const us = RS.soUsName(hero, 0, { nat: true });
    return RS.CUP_ROUNDS.map((r) => {
      const ok = r.pool.filter((m) => { const K = RS.PK_KEEPERS[m.keeper]; return m.vs !== us && K.mate !== hero && !(K.nemesis && K.nemesis[hero] != null); });
      return Object.assign({}, ok[Math.floor(rng() * ok.length)]);
    });
  };
  RS.cupStart = function (save) {
    save.meta.cup = RS.normalizeCup(save.meta.cup);
    save.meta.cup.played++;
  };
  // A round played: the record, and on the 결승 the reward. Returns { round, won, next (the round to play, or
  // null), champion, reward: { id, hero } | { coins } }. (round 19: the move only unlocks; level-ups deal it now and then)
  RS.cupResult = function (save, round, won, rng) {
    const m = save.meta, last = RS.CUP_ROUNDS.length - 1, out = { round, won, next: null, champion: false, reward: null };
    m.cup = RS.normalizeCup(m.cup);
    if (!won) return out;
    m.cup.best = Math.max(m.cup.best, round + 1);
    if (round < last) { out.next = round + 1; return out; }
    out.champion = true;
    m.cup.wins++;
    const left = RS.cupLeft(m);
    if (!left.length) { m.coins += RS.CUP_COINS; out.reward = { coins: RS.CUP_COINS }; return out; }
    const r = left[Math.floor((rng || Math.random)() * left.length)];
    if (!m.unlocked || typeof m.unlocked !== 'object') m.unlocked = {};
    m.unlocked[r.id] = true;
    out.reward = { id: r.id, hero: r.hero };
    return out;
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
      this.level = opt.kind === 'cup' ? Math.max(b.level || 1, RS.CUP_LEVEL) : b.level || 1;
      this.small = RS.smallBody(b);
      this.fin = RS.pkFinishing({ hero: this.hero, level: this.level }, save.meta);
      this.zones = RS.pkZoneCount(this.level);
      if (opt.kind === 'cup') {
        this.round = Math.max(0, Math.min(RS.CUP_ROUNDS.length - 1, opt.round | 0));
        this.def = { cup: true, all: true, nat: true, title: '승부차기 토너먼트 · ' + RS.CUP_ROUNDS[this.round].name, vs: opt.vs, keeper: opt.keeper };
        this.keeperId = opt.keeper;
        this.so = RS.newShootout(this.rng() < 0.5 ? 'us' : 'them');
        this.us = RS.soUsName(this.hero, 0, this.def);
      } else if (opt.kind === 'shootout') {
        this.def = RS.shootoutFor(this.hero, this.idx);
        this.keeperId = this.def.keeper;
        this.so = this.def.single ? null : RS.newShootout(this.rng() < 0.5 ? 'us' : 'them');
        this.us = RS.soUsName(this.hero, this.idx, this.def);
      } else {
        this.def = null; this.so = null;
        this.keeperId = RS.pkChallengeKeeper(this.rng, this.hero, this.idx);
      }
      this.keeper = RS.PK_KEEPERS[this.keeperId];
      // the 토너먼트: the national team's keeper (RS.CUP_KEEPER at least) and each round's opposing kickers (oppMiss)
      this.ourK = this.kind === 'cup' ? Math.max(RS.CUP_KEEPER, RS.soOurKeeper(b)) : RS.soOurKeeper(b);
      this.oppMiss = this.kind === 'cup' ? RS.CUP_ROUNDS[this.round].miss : null;
      this.ourKeeper = { name: '우리 골키퍼', rating: this.ourK, look: RS.PK_OUR_LOOK };
      this.rage = false; // the other keeper's 분노 모드 (round 16)
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
      // a 파넨카 the keeper read: he boots the ball away and burns for the rest of the session (RS.PK_RAGE)
      if (c.who !== 'opp' && result && result.kind === 'panenka' && result.res === 'save' && !this.rage) { this.rage = true; this.rageNew = true; }
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
      } else if (this.kind === 'cup') {
        out.won = !!this.so.won;
        out.score = [this.so.us.filter(Boolean).length, this.so.them.filter(Boolean).length];
        const rec = RS.normalizePk(this.save.meta.pk).heroes[this.hero];
        if (out.won) rec.won++; else rec.lost++;
        out.cup = RS.cupResult(this.save, this.round, out.won, this.rng);
        if (out.cup.reward && out.cup.reward.coins) out.coins = out.cup.reward.coins;
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
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pk = 'R18';
