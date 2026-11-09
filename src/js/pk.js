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
  // (round 23: the sides' off halved — the post is its own RS.PK_POST now)
  RS.PK_ZONE = {
    1: { save: 0.24, off: 0.02 }, 2: { save: 0.42, off: 0.02 }, 3: { save: 0.24, off: 0.02 },
    4: { save: 0.28, off: 0.025 }, 5: { save: 0.55, off: 0.02 }, 6: { save: 0.28, off: 0.025 },
    7: { save: 0.1, off: 0.045 }, 8: { save: 0.34, off: 0.06 }, 9: { save: 0.1, off: 0.045 }
  };
  // Round 27 (the user: 상중하 높이 있으면 당연히 상단이 제일 차기 어려워야지 … 그게 어려우니까 선수들이 적당히 띄워차거나
  // 땅볼로 차는 거): the higher the aim, the harder the dial (× its speed and ÷ its bands, RS.pkTiming) and the more
  // an inexact needle sends the ball over or wide instead of in (RS.PK_AIM_OFF[acc] × RS.PK_ROW_OFF[row]). A ball
  // along the ground never flies off this way; one under the bar struck with the white needle is off 4 times in 10.
  // Round 28 (the user: 난이도 너무 어려워졌는데 … 지금 난이도를 하드로, 이전꺼를 노말로): that is 하드 only, by the
  // game's difficulty (RS.DIFF). 노멀 is round 26 (every row the same dial, no flying off); 이지 a slower, wider dial
  // (× ease on the gauge and the needle). pool: the zones the 🤖 aims at with all nine open.
  RS.PK_AIM_OFF = { great: 0, fine: 0.15, good: 0.4, miss: 0.7 };
  RS.PK_DIFFS = {
    easy: { rowHard: [1, 1, 1], rowOff: [0, 0, 0], ease: 0.8, pool: [7, 9, 1, 3, 4, 6] },
    normal: { rowHard: [1, 1, 1], rowOff: [0, 0, 0], ease: 1, pool: [7, 9, 1, 3, 4, 6] },
    hard: { rowHard: [1, 1.15, 1.4], rowOff: [0, 0.3, 1], ease: 1, pool: [1, 3, 1, 3, 4, 6, 4, 6, 7, 9] }
  };
  RS.pkDiff = () => RS.PK_DIFFS[RS.DIFF] || RS.PK_DIFFS.normal;

  // ---------------------------------------------------------------- the kicker
  // 골결정력 (1–99): the hero's own touch from the spot (날두 scored 84 % of his career penalties, 메시 78 %),
  // + the career level (up to +24 at Lv.120, the end of a career), + the 훈련장's penalty drill (RS.META.pkdrill, +3 a level).
  RS.PK_BASE = { ronaldo: 62, messi: 54, torres: 58 }; // 토레쓰 (round 11): a game value between the two, not a record
  RS.pkFinishing = function (build, meta) {
    const hero = build && RS.PK_BASE[build.hero] != null ? build.hero : 'ronaldo';
    const drill = (meta && meta.upgrades && meta.upgrades.pkdrill) || 0;
    return clamp(Math.round(RS.PK_BASE[hero] + Math.min(24, ((build && build.level) || 1) * 0.2) + 3 * drill), 1, 99);
  };
  // The power gauge sweeps 0 → 1 → 0 and the tap stops it. Round 23 (the user): from the left — red 'slow' under
  // PK_POWER.slow (barely touched: it rolls or floats in so slowly that a keeper who went the right way walks over
  // and picks it up), the 파넨카 zone PK_POWER.pan (green, a thin blue band 'panPerfect' around PK_POWER.panBlue; a
  // soft placed chip when aimed at a side), grey 'weak' under PK_POWER.weak, yellow 'ok', green 'good' inside
  // PK_POWER.good with the thin blue 'perfect' band around PK_POWER.blue (RS.pkBlueHalf), yellow again, and red
  // 'over' past PK_POWER.over (skied). The power is only the power: it sets how fast the ball goes (how easily it
  // is saved, RS.PK_POWER_SAVE) and an over-hit flies high — never the direction (that is the needle's, RS.PK_PULL).
  RS.PK_POWER = { slow: 0.08, pan: [0.08, 0.3], panBlue: 0.19, weak: 0.55, good: [0.7, 0.88], blue: 0.79, over: 0.95 };
  // half the blue band: fin 55 → ±1.35 %, fin 95 → ±1.75 % of the gauge (about 30 ms of its sweep)
  RS.pkBlueHalf = (fin) => (0.016 + (fin == null ? 70 : fin) * 0.0002) / 2;
  RS.pkPowerGrade = (p, fin) => {
    const P = RS.PK_POWER;
    if (p > P.over) return 'over';
    if (Math.abs(p - P.blue) <= RS.pkBlueHalf(fin)) return 'perfect';
    if (p >= P.good[0] && p <= P.good[1]) return 'good';
    if (p < P.slow) return 'slow';
    if (p <= P.pan[1]) return Math.abs(p - P.panBlue) <= RS.pkBlueHalf(fin) ? 'panPerfect' : 'pan';
    return p < P.weak ? 'weak' : 'ok';
  };
  // × a struck ball's saves by its power: a soft one is slow to the corner, a full one hard to hold
  RS.PK_POWER_SAVE = { pan: 2.2, panPerfect: 2.2, weak: 1.75, ok: 1.15, good: 1, perfect: 0.9, over: 0.75 };
  // The needle sets the direction. Round 22 (the user: 파란색 노란색 흰색): three bands — blue 'great' in the middle
  // (with the blue power band a perfect strike), yellow 'fine', white 'good'. Round 23 (the user: 다이얼 제대로
  // 맞출수록 구석에 가는 거 … 못 맞출수록 가운데 쏠려서 키퍼가 막기 쉬워지고): the worse the needle, the more the ball is
  // pulled from its corner toward the keeper in the middle (RS.PK_PULL: the share of the way) — saved more, not wide.
  RS.PK_PULL = { great: 0, fine: 0.15, good: 0.35, miss: 1 };
  RS.PK_CENTER = 2.4; // × the middle's saves for a ball pulled all the way in: it comes at his body
  RS.PK_SAVE_K = 0.52; // round 23: with the posts and the pull, about the round-22 cup odds (sim: 60 → 25 → 11 → 7 % for a good 날두)
  RS.PK_POST = 0.1; // round 23 (the user): a struck ball to either side rings off the post this often
  RS.pkPerfect = (power, acc, fin) => acc === 'great' && RS.pkPowerGrade(power, fin) === 'perfect';
  // How fast the gauge and the 정확도 needle move and how wide the needle's target is (degrees of the dial; the
  // 'great' band sits in the middle of 'good'). The lower the 골결정력 the faster and the narrower: a young
  // player has to be exact (fin 55: a 127 ms window, 21 ms for 'great'; fin 95: 200 ms and 38 ms).
  // Round 20 (the user: 강하게 찰수록 정확도 다이얼 맞추기 어렵게): with the power the strike was given, the needle
  // turns faster and its arcs narrow — × RS.pkPowerHard(power): 1 on the blue band, up to 1.45 for a full-blooded
  // strike, down to 0.7 for a soft one.
  RS.pkPowerHard = (power) => (power == null ? 1 : clamp(1 + (power - RS.PK_POWER.blue) * 2.5, 0.7, 1.45));
  // Round 23 (the user: 파넨카 실패 시 키커 사기 저하 … 파워나 정확도 맞추기가 더 훨씬 어려워지게): each failed 파넨카
  // in a session (morale 1–3, RS.PK_MORALE_MAX) speeds the gauge and the needle up and narrows the needle's bands
  // by × (1 + RS.PK_MORALE per step) — the odds of a given strike stay; hitting it gets harder.
  RS.PK_MORALE = 0.3; RS.PK_MORALE_MAX = 3;
  // row (round 27): the aimed zone's row — on 하드 the higher, the faster and narrower the needle (RS.PK_DIFFS rowHard);
  // 이지 slows the gauge and the needle and widens the bands (ease)
  RS.pkTiming = (fin, power, morale, row) => {
    const D = RS.pkDiff(), m = 1 + RS.PK_MORALE * clamp(morale | 0, 0, RS.PK_MORALE_MAX);
    const h = RS.pkPowerHard(power) * m * (D.rowHard[row | 0] || 1) * D.ease;
    return {
      gauge: (1.5 - fin * 0.006) * m * D.ease, // sweeps a second: fin 55 → 1.17, fin 95 → 0.93
      needle: (0.95 - fin * 0.003) * h, // turns a second: 0.785 → 0.665 (on the blue band)
      good: Math.max(8, Math.round((18 + fin * 0.32) / h)), // 36° → 48°
      // round 34 (the user: 정확도 맞추는거 아주 조금만 버프 … 파랑 노랑 간격 → 파랑은 10% 노랑을 15%): blue × 1.1, yellow × 1.15
      great: Math.max(2, Math.round((1 + fin * 0.08) * 1.1 / h)), // 6° → 10°, blue (round 16: half of a perfect strike, so it is narrow)
      fine: Math.max(6, Math.round((4 + fin * 0.15) * 1.15 / h)) // 13° → 21°, the yellow band around the blue (round 22)
    };
  };
  // Where the needle stopped: within great/2 of the target's centre 'great' (blue), within fine/2 'fine' (yellow),
  // within good/2 'good' (white), else 'miss'.
  RS.pkNeedleGrade = (diffDeg, timing) => {
    const d = Math.abs(((diffDeg % 360) + 540) % 360 - 180);
    return d <= timing.great / 2 ? 'great' : d <= timing.fine / 2 ? 'fine' : d <= timing.good / 2 ? 'good' : 'miss';
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
    push: { name: '밀어차기', icon: '🦶', key: 'Q', tip: '기본 슛 · 무난하다', gauge: 1, save: 1, saveAdd: 0, base: 1, drift: 1, over: 1, rage: 1, flight: 1, post: 1, pull: 1 },
    drive: { name: '발등슛', icon: '🚀', key: 'W', tip: '빠르고 세서 막기 어렵다 · 대신 게이지가 빨라 빗나가기 쉽다', gauge: 1.3, save: 0.75, saveAdd: 0, base: 1.15, drift: 1.3, over: 1.3, rage: 0.95, flight: 0.78, post: 1.3, pull: 1.4 },
    // round 23: post × RS.PK_POST, pull × RS.PK_PULL — the 발등슛 is struck too hard to place (more to the middle, more
    // of the frame); the 감아차기 bends back toward its corner (less of the frame, less drawn to the middle)
    curl: { name: '감아차기', icon: '🌀', key: 'E', tip: '구석으로 휘어 들어가 잘 안 빗나간다 · 대신 느려서 방향을 읽히면 막힌다', gauge: 0.8, save: 1.45, saveAdd: 0, base: 0.85, drift: 0.88, over: 0.9, rage: 1.12, flight: 1.2, post: 0.6, pull: 0.8 }
  };
  RS.PK_SHOT_IDS = ['push', 'drive', 'curl'];
  RS.pkShot = (id) => RS.PK_SHOTS[id] || RS.PK_SHOTS.push;
  // 왼발잡이 (round 18, the user: "메시는 왼발잡이니까 … 반대편에 서있어야지 왼발로 차게")
  RS.PK_LEFT = { messi: true };
  RS.pkFoot = (hero) => (RS.PK_LEFT[hero] ? 'L' : 'R');

  // ---------------------------------------------------------------- keepers
  // rating: 80 = the zone table; higher saves more. legend: the hall of fame. nemesis: the most one hero can score
  // against him. mate: the hero who had him on his own side (never drawn as that hero's PK 챌린지 keeper).
  // look: kit, trim, hair, skin and hair style of his sprite (RS.Sprites.pkKeeper; style 'cap' = a cap or 체흐's
  // black head guard, C its colour).
  RS.PK_KEEPERS = {
    local: { name: '동네 수문장', rating: 55, look: { K: '#c8a020', k2: '#6a4a10', H: '#3a2a1a', style: 'short' } },
    reserve: { name: '2부 리그 수문장', rating: 64, look: { K: '#7a8a9a', k2: '#2a3a4a', H: '#2a1a10', style: 'fade' } },
    pro: { name: '1부 리그 수문장', rating: 72, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', style: 'slick' } },
    national: { name: '국가대표 수문장', rating: 80, look: { K: '#2a3aa8', k2: '#ffd400', H: '#4a3020', style: 'short' } },
    cech: { name: '체흐', rating: 90, legend: true, nemesis: { messi: 0.1 }, note: '메시의 천적 — 여섯 번 만나 한 골도 못 넣었고, 2012년 페널티킥은 크로스바를 때렸다', look: { K: '#26262e', k2: '#5a5a66', H: '#1a1a1a', style: 'cap', C: '#111111' } },
    buffon: { name: '부폰', rating: 93, legend: true, mate: 'ronaldo', look: { K: '#2e2e2e', k2: '#e8e8e8', H: '#2a1a10', style: 'long' } },
    casillas: { name: '카시야스', rating: 91, legend: true, mate: 'ronaldo', look: { K: '#f2c200', k2: '#1a1a1a', H: '#2a1a10', style: 'short' } },
    vdsar: { name: '반데르사르', rating: 88, legend: true, mate: 'ronaldo', look: { K: '#2a6a3a', k2: '#111111', H: '#c0a070', style: 'short' } },
    neuer: { name: '노이어', rating: 93, legend: true, look: { K: '#9ad010', k2: '#111111', H: '#d8b870', style: 'short' } },
    courtois: { name: '쿠르투아', rating: 90, legend: true, look: { K: '#7a3ad8', k2: '#111111', H: '#3a2a1a', style: 'long' } },
    oblak: { name: '오블락', rating: 91, legend: true, look: { K: '#2a8a5a', k2: '#111111', H: '#3a2a1a', style: 'long' } },
    alisson: { name: '알리송', rating: 90, legend: true, look: { K: '#e8e8e8', k2: '#1a5ad8', H: '#2a1a10', style: 'long' } },
    dibu: { name: '디부 마르티네스', rating: 92, legend: true, mate: 'messi', note: '승부차기의 악마', look: { K: '#c8e000', k2: '#6a2ab8', H: '#1a1a1a', style: 'fade' } },
    yashin: { name: '검은 거미 야신', rating: 97, legend: true, note: '전설 중의 전설', look: { K: '#0e0e10', k2: '#2a2a2e', H: '#0e0e10', style: 'cap', C: '#0e0e10' } },
    // round 38: the 도장깨기's keepers not met elsewhere (RS.DOJO)
    schmeichel: { name: '슈마이켈', rating: 90, legend: true, look: { K: '#e8e000', k2: '#1a1a1a', H: '#e8d0a0', style: 'short' } },
    kahn: { name: '올리버 칸', rating: 90, legend: true, look: { K: '#1a8a3a', k2: '#1a1a1a', H: '#e0c890', style: 'short' } },
    // the keepers of the career shootouts (RS.SHOOTOUTS)
    james: { name: '제임스', rating: 74, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', s: '#7a5236', style: 'fade' } },
    robinson: { name: '로빈슨', rating: 77, look: { K: '#e8e8e8', k2: '#c41e2a', H: '#3a2a1a', style: 'short' } },
    bravo: { name: '브라보', rating: 84, look: { K: '#1a1a1a', k2: '#e01b1b', H: '#1a1a1a', style: 'slick' } },
    ospina: { name: '오스피나', rating: 82, look: { K: '#f0c000', k2: '#1a3a8a', H: '#1a1a1a', style: 'long' } },
    lloris: { name: '요리스', rating: 86, look: { K: '#ffd400', k2: '#1a1a1a', H: '#4a3020', style: 'short' } },
    willis: { name: '윌리스', rating: 70, look: { K: '#ffd400', k2: '#1a1a1a', H: '#d8b870', style: 'bald' } },
    dominguez: { name: '도밍게스', rating: 74, look: { K: '#e06a1a', k2: '#1a1a1a', H: '#1a1a1a', style: 'short' } },
    // the youth keepers of the 승부차기 토너먼트's first two stages (round 22, RS.CUP_STAGES)
    u17: { name: '유소년 수문장', rating: 58, look: { K: '#3ab0e0', k2: '#1a1a1a', H: '#3a2a1a', style: 'short' } },
    u17b: { name: '유소년 대표 수문장', rating: 63, look: { K: '#e0a020', k2: '#1a1a1a', H: '#1a1a1a', style: 'fade' } },
    u20: { name: 'U-20 수문장', rating: 68, look: { K: '#8a5ad8', k2: '#1a1a1a', H: '#2a1a10', style: 'slick' } },
    u20b: { name: 'U-20 대표 수문장', rating: 73, look: { K: '#d83a5a', k2: '#1a1a1a', H: '#4a3020', style: 'short' } },
    u20s: { name: 'U-20 에이스 수문장', rating: 77, look: { K: '#1a1a1a', k2: '#ffd400', H: '#1a1a1a', style: 'long' } }
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
  // acc: 'great' | 'fine' | 'good' | 'miss', hero, rage (the keeper's 분노 모드), panStreak (our 파넨카 attempts
  // just before this one, in a row) }. Sums to 1. kind: 'perfect' (blue band and blue needle: it bends into the
  // zone's own corner — no miss, and only a legend's fingertips), 'panenka' (the 파넨카 zone down the middle: a chip
  // that beats a keeper who dives and dies in the arms of one who stays; on its blue band (odds.chipPerfect) it
  // floats over half the ones who stay), 'slow' (round 23, the red far left, any zone: it rolls or floats in so
  // slowly that a keeper who went the right way walks over to it — otherwise it is in), else a struck ball: the
  // needle pulls it toward the middle (RS.PK_PULL), the power sets its pace (RS.PK_POWER_SAVE) and an over-hit
  // flies high; to either side it rings off the post RS.PK_POST of the time (odds.post, part of odds.off).
  RS.PK_RAGE = 1.2; // × the keeper's saves in 분노 모드 (after one of our 파넨카 he read: he burns for the rest)
  // A perfect strike (round 20, the user): 99 % in; against a keeper in 분노 모드 it goes in every time he dives the
  // wrong way and 80 % of the times he guesses it (he guesses it rageGuess of the time). Never shown on screen.
  RS.PK_PERFECT = { goal: 0.99, rageRead: 0.8, rageGuess: 0.45 };
  RS.PK_PAN_STREAK = [1, 1.9, 2.6]; // × how often he stays for our 파넨카: the first, the second in a row, more
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
    if (pg === 'slow') { // round 23: he only has to go the right way (a 분노 keeper reads it more)
      const read = clamp((0.6 + (o.keeper.rating - 80) * 0.01) * (o.rage ? 1.3 : 1), 0.4, 0.9);
      odds = { goal: 1 - read, save: read, off: 0, kind: 'slow' };
    } else if (!corner && (pg === 'pan' || pg === 'panPerfect')) { // 파넨카: he stays (reads it) or he dives (beaten, unless the chip is off)
      // round 23 (the user: 파넨카 2연속시 상대가 가운데 막을 확률 올려): a second one in a row, a third — he waits for it
      const streak = RS.PK_PAN_STREAK[Math.min(o.panStreak | 0, RS.PK_PAN_STREAK.length - 1)];
      const stay = clamp(0.3 * k2 * (o.rage ? 1.5 : 1) * streak, 0.1, 0.9), top = pg === 'panPerfect', off = top ? 0 : 0.06, save = stay * (top ? 0.5 : 1);
      odds = { goal: (1 - save) * (1 - off), save, off: (1 - save) * off, kind: 'panenka', chipPerfect: top };
    } else if (RS.pkPerfect(o.power, o.acc, fin)) { // round 20: whatever the type, the zone or the keeper
      const P = RS.PK_PERFECT, goal = o.rage ? P.rageGuess * P.rageRead + (1 - P.rageGuess) : P.goal;
      odds = { goal, save: 1 - goal, off: 0, kind: 'perfect' };
    } else {
      // a miss: the zone's own risk (less with 골결정력; a 발등슛 more), an over-hit flies high, the post to the sides
      const mBase = Math.min(0.5, Z.off * (1.3 - fin / 100) * S.base * S.drift);
      const mPow = pg === 'over' ? Math.min(0.9, (row === 2 ? 0.65 : row === 1 ? 0.4 : 0.22) * S.over) : 0;
      // round 27 (하드): aimed high with an inexact needle it flies over or wide (a 발등슛 more, a 감아차기 less)
      const mAim = Math.min(0.9, (RS.PK_AIM_OFF[o.acc] != null ? RS.PK_AIM_OFF[o.acc] : RS.PK_AIM_OFF.miss) * RS.pkDiff().rowOff[row] * S.drift);
      const post = corner ? RS.PK_POST * S.post : 0, off = 1 - (1 - post) * (1 - mBase) * (1 - mPow) * (1 - mAim);
      // a save: the spot it ends up at — the zone, pulled toward the middle of its row by the needle — the keeper
      // (squared: a legend reaches what others cannot), its pace and 골결정력
      const pull = (RS.PK_PULL[o.acc] != null ? RS.PK_PULL[o.acc] : RS.PK_PULL.miss) * S.pull, mid = RS.PK_ZONE[row * 3 + 2];
      const spot = Z.save * (1 - pull) + mid.save * RS.PK_CENTER * pull;
      const save = clamp(RS.PK_SAVE_K * spot * k2 * RS.PK_POWER_SAVE[pg] * (1.25 - fin / 200) * sv + sa, 0.02, 0.95);
      odds = { goal: (1 - off) * (1 - save), save: (1 - off) * save, off, post, kind: null };
    }
    // a keeper one hero could never beat (메시 against 체흐): at most that chance, the rest half on the frame
    const cap = o.keeper.nemesis && o.keeper.nemesis[o.hero];
    if (cap != null && odds.goal > cap) { const rest = 1 - cap; odds.goal = cap; odds.save = rest / 2; odds.off = rest / 2; odds.nemesis = true; }
    return odds;
  }
  // What the aim grid shows: the zone's chance at the best strike short of perfect — just outside the blue band, the
  // needle in the gold (round 20: the perfect strike's own numbers are not shown)
  RS.pkZoneBest = (o, z) => RS.pkOdds(Object.assign({}, o, { zone: z, power: RS.PK_POWER.blue + RS.pkBlueHalf(o.fin) + 0.004, acc: 'great' })).goal;
  // Roll one kick. Returns { res: 'goal' | 'save' | 'post' | 'bar' | 'over' | 'wide', goal, diveCol (the keeper's
  // dive: 0 left, 1 stays, 2 right), kind (pkOdds), kickAway (a save he boots away: an angry 파넨카 save), odds }.
  // On a save he went the right way; on a goal mostly the wrong one (a 'slow' ball: always the wrong one).
  RS.pkKick = function (rng, o) {
    const odds = RS.pkOdds(o), r = rng(), row = RS.pkRow(o.zone), col = RS.pkCol(o.zone);
    let res;
    if (odds.kind === 'perfect' && !odds.nemesis) { // round 20: the angry keeper must guess the side to have a chance
      const P = RS.PK_PERFECT, wrong = [0, 1, 2].filter((c) => c !== col);
      const read = o.rage ? r < P.rageGuess : rng() < 0.3;
      res = o.rage ? (read && rng() >= P.rageRead ? 'save' : 'goal') : (rng() < P.goal ? 'goal' : 'save');
      if (res === 'save') return { res, goal: false, diveCol: col, kind: 'perfect', kickAway: false, odds, shot: odds.shot };
      // (down the middle he cannot have stayed for it — except over his head, under the bar)
      const stayed = read && !(col === 1 && row < 2);
      return { res, goal: true, diveCol: stayed ? col : wrong[Math.floor(rng() * 2)], kind: 'perfect', kickAway: false, odds, shot: odds.shot };
    }
    if (r < odds.goal) res = 'goal';
    else if (r < odds.goal + odds.save) res = 'save';
    else if (odds.post && r < odds.goal + odds.save + odds.post) res = 'post'; // round 23: a side shot off the post
    else {
      // a 발등슛 off the mark rises (from the middle row too); the sides go wide, the middle up or sideways
      const drive = odds.shot === 'drive' && !odds.kind;
      const q = rng(), high = row === 2 || (drive && row === 1) || RS.pkPowerGrade(o.power, o.fin) === 'over' || odds.kind === 'panenka';
      if (odds.nemesis && q < 0.6) res = 'bar';
      else if (high && q < (drive ? 0.75 : 0.6)) res = q < 0.2 ? 'bar' : 'over';
      else if (col === 1) res = q < (drive ? 0.7 : 0.55) ? 'over' : q < 0.8 ? 'post' : 'wide';
      else res = 'wide';
    }
    const others = [0, 2].concat(col === 1 ? [] : [1]).filter((c) => c !== col);
    let diveCol = res === 'save' ? col : res === 'goal' && rng() < 0.75 ? others[Math.floor(rng() * others.length)] : Math.floor(rng() * 3);
    if (odds.kind === 'panenka') diveCol = res === 'save' ? 1 : rng() < 0.5 ? 0 : 2;
    // round 23: a goal down the middle means he went to a side — only a full strike under the bar (zone 8, the
    // green, blue or over band) may beat a keeper who stayed, over his head (RS.PKScene puts it there)
    if (col === 1 && !odds.kind && res === 'goal') {
      const full = ['good', 'perfect', 'over'].includes(RS.pkPowerGrade(o.power, o.fin));
      diveCol = row === 2 && full && rng() < 0.5 ? 1 : rng() < 0.5 ? 0 : 2;
    }
    if (odds.kind === 'slow' && res === 'goal') diveCol = others[Math.floor(rng() * others.length)];
    const kickAway = res === 'save' && odds.kind === 'panenka';
    return { res, goal: res === 'goal', diveCol, kind: odds.kind, kickAway, odds, shot: odds.shot };
  };
  // 완전 오토 (and the 🤖 button): a sensible kick — the corners once they are open — executed as steadily as the
  // 골결정력 allows (it finds the blue band and the gold now and then, never a 파넨카). The shot type (round 18) is
  // the one that pays best for its zone: 감아차기 under the bar, 발등슛 down the middle and low against a keeper
  // rated 88 or more, else 밀어차기; a faster gauge (발등슛) spreads its power wider.
  RS.pkBotKick = function (rng, fin, level, keeper, zones) {
    const n = zones || RS.pkZoneCount(level);
    // round 27 (하드): like real kickers it mostly goes low or half-high; under the bar one time in five
    const D = RS.pkDiff(), pool = n === 9 ? D.pool : n === 6 ? [1, 3, 4, 6, 1, 3] : [1, 3, 1, 3, 2];
    const zone = pool[Math.floor(rng() * pool.length)];
    const shot = RS.pkBotShot(zone, keeper);
    const spread = (0.2 - fin * 0.0013) * RS.pkShot(shot).gauge;
    const power = clamp(RS.PK_POWER.blue + (rng() * 2 - 1) * spread, 0.6, 1);
    // a harder strike, a higher aim: a harder dial
    const r = rng(), great = (0.12 + fin * 0.0035) / (RS.pkPowerHard(power) * D.rowHard[RS.pkRow(zone)] * D.ease);
    return { zone, power, acc: r < great ? 'great' : r < great + 0.15 ? 'fine' : r < great + 0.55 ? 'good' : 'miss', shot };
  };
  RS.pkBotShot = (zone, keeper) => (RS.pkRow(zone) === 2 ? 'curl' : RS.pkCol(zone) === 1 || ((keeper && keeper.rating) || 80) >= 88 ? 'drive' : 'push');

  // ---------------------------------------------------------------- PK 챌린지 (after every fifth match)
  RS.PK_EVERY = 5;
  RS.PK_KICKS = 5;
  // coins a goal: 11 against 동네 수문장 … 32 against 야신; all five in pays three more
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
      2008: { title: '모스크바 챔스 결승 승부차기', vs: '첼씨', keeper: 'cech', order: 3, story: '빗속의 모스크바, 1-1. 세 번째 키커 날두 앞에 체흐가 선다.', real: '실제: 날두 실축(체흐 선방), 그래도 맨체스터 6-5 우승' },
      2012: { title: '챔스 4강 승부차기', vs: '뮌헨', keeper: 'neuer', order: 1, story: '마드리드의 4강 2차전, 합계 3-3. 첫 키커는 날두.', real: '실제: 날두 실축(노이어 선방), 1-3 탈락' },
      2016: { title: '밀라노 챔스 결승 승부차기', vs: '아틀레띠꼬', keeper: 'oblak', order: 5, story: '마드리드 더비 결승 1-1. 다섯 번째 키커에게 우승이 걸렸다.', real: '실제: 날두가 우승을 확정하는 마지막 킥 성공, 5-3' },
      2024: { nat: true, title: '유로 2024 16강 승부차기', vs: '슬로베니아', keeper: 'oblak', order: 1, story: '연장전 페널티킥을 오블락에게 막히고 눈물. 승부차기 첫 키커로 다시 선다.', real: '실제: 날두 성공, 3-0 승 (우리 골키퍼 세 번 선방)' }
    },
    messi: {
      2012: { single: true, title: '챔스 4강 2차전 페널티킥', vs: '첼씨', keeper: 'cech', story: '첼씨는 10명, 이 한 방이면 결승이 보인다. 골문엔 천적 체흐.', real: '실제: 크로스바. 첼씨가 결승에 갔다' },
      2015: { nat: true, title: '코파 아메리카 결승 승부차기', vs: '칠레', keeper: 'bravo', order: 1, story: '산티아고 결승 0-0. 첫 키커로 나선다.', real: '실제: 메시 성공, 하지만 1-4 패' },
      2016: { nat: true, title: '코파 아메리카 결승 승부차기', vs: '칠레', keeper: 'bravo', order: 1, story: '또 칠레, 또 결승 승부차기. 첫 키커는 메시.', real: '실제: 메시 실축(크로스바 위로), 2-4 패, 대표팀 은퇴 선언' },
      2021: { nat: true, title: '코파 아메리카 4강 승부차기', vs: '콜롬비아', keeper: 'ospina', order: 1, story: '브라질리아 4강 1-1. 첫 키커로 나선다.', real: '실제: 메시 성공, 디부 마르티네스 세 번 선방, 3-2 승' },
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
  // RS.soReact(): 0.9 s on 이지, 0.6 on 노멀, 0.4 on 하드 — the user, round 16; 하드 0.3 → 0.5 in round 33, → 0.4 in round 37). The right cell saves often, the right
  // side at the wrong height seldom; a reaction saves more the
  // quicker it came. dive: { col, row, rt } | a column (old callers: the height is a coin) | null (he guesses).
  RS.SO_REACT = { easy: 0.9, normal: 0.6, hard: 0.4 };
  RS.soReact = () => RS.SO_REACT[RS.DIFF] || RS.SO_REACT.normal;
  // Round 23 (the user: 파넨카 상대는 안 참?): one kicker in RS.SO_OPP_PANENKA chips it down the middle (aim.panenka):
  // our keeper who stays — picked the middle, or watched it and never moved, or reacted to the middle — takes it
  // RS.SO_PAN_SAVE of the time; one who went to a side is beaten.
  RS.SO_OPP_PANENKA = 0.08; RS.SO_PAN_SAVE = 0.9;
  RS.SO_MID_SAVE = { low: 0.95, highUp: 0.85, highOver: 0.2 };
  // (the user: 가운데 가만히만 있음 가운데 다 막으니까 상대가 가운데 한 번 막히면 사이드로 차거나 머리 위 파워슛 갈길 가능성
  // 높아지게) midSaved: their low balls down the middle our keeper has taken this session — after one, most of the
  // kickers who would go low down the middle (or chip it) go to a side or over his head instead (RS.SO_MID_WARY)
  RS.SO_MID_WARY = [0, 0.7, 0.85, 0.95];
  RS.soOppAim = function (rng, miss, midSaved) {
    const wary = RS.SO_MID_WARY[Math.min(midSaved || 0, RS.SO_MID_WARY.length - 1)];
    if (rng() < RS.SO_OPP_PANENKA * (1 - wary)) return { col: 1, row: 0, off: rng() < 0.06 ? 'over' : null, panenka: true };
    const r = rng();
    let col = r < 0.42 ? 0 : r < 0.84 ? 2 : 1, row = rng() < 0.35 ? 1 : 0;
    if (col === 1 && row === 0 && rng() < wary) { if (rng() < 0.45) row = 1; else col = rng() < 0.5 ? 0 : 2; }
    const off = rng() < (miss == null ? 0.07 : miss) ? (col === 1 || row === 1 ? (rng() < 0.6 ? 'over' : 'post') : rng() < 0.5 ? 'post' : 'wide') : null;
    return { col, row, off };
  };
  RS.soGuess = (rng) => ({ col: rng() < 0.42 ? 0 : rng() < 0.72 ? 2 : 1, row: rng() < 0.4 ? 1 : 0 });
  RS.soSaveChance = function (ourK, aim, dive) {
    if (!dive || aim.off || dive.col !== aim.col) return 0;
    if (aim.panenka) return RS.SO_PAN_SAVE;
    // round 23 (the user: 가운데 가만히 서있는데 가운데 슛을 왜 먹혀 … 맨 가운데 위 파워슛만 머리 위로): a keeper in the
    // middle — picked it, reacted to it or never moved — takes a low ball down the middle; only a high one beats him
    // over his head, unless he went up for it
    if (aim.col === 1) return aim.row === 0 ? RS.SO_MID_SAVE.low : dive.row === 1 ? RS.SO_MID_SAVE.highUp : RS.SO_MID_SAVE.highOver;
    const kf = clamp(0.75 + (ourK - 70) * 0.017, 0.6, 1.25), same = dive.row === aim.row;
    // round 36 (the user: 보고 막기 … 42~60%밖에 못 막으면 보람이 없잖아 … 80%까지, 0.5초에 눌러도 60%): the right cell by
    // watching saves 80 % at once down to 60 % at the end of the reaction window, whoever our keeper is
    if (dive.rt != null) return same ? 0.8 - 0.2 * clamp(dive.rt / RS.soReact(), 0, 1) : clamp(0.1 * kf, 0, 0.9);
    return clamp((same ? 0.7 : 0.2) * kf, 0, 0.85);
  };
  RS.soOppSave = function (rng, ourK, aim, dive) {
    const res = aim.off || (rng() < RS.soSaveChance(ourK, aim, dive) ? 'save' : 'goal');
    return { res, goal: res === 'goal', col: aim.col, row: aim.row, diveCol: dive ? dive.col : 1, diveRow: dive ? dive.row : 0, kind: aim.panenka ? 'panenka' : null };
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

  // Round 22 (the user: 바로 첨부터 월드컵이 아니라 청소년때부터 올라가게해 서사 있게): each hero climbs four stages,
  // one tournament a run — 유소년 대회 (U-17) → 청소년 대회 (U-20) → his continent's cup (유로 / 코파 아메리카) → the
  // 월드컵 (RS.CUP_ROUNDS, the SIUUU reward). A title opens the next stage for that hero and pays its coins; a loss
  // replays the same stage. lv: the kicker's level there (his 골결정력; round 23: every zone is open at every
  // stage); ourK: our keeper; pre: the youth teams' prefix. A stage's story: RS.CUP_STORY.
  RS.CUP_STAGES = [
    { id: 'u17', name: '유소년 대회', icon: '🧒', pre: 'U-17 ', lv: 20, ourK: 64, coins: 150, rounds: [
      { name: '4강', miss: 0.34, pool: [{ vs: '스위쓰', keeper: 'u17' }, { vs: '미국', keeper: 'u17' }, { vs: '일본', keeper: 'u17' }] },
      { name: '결승', miss: 0.28, pool: [{ vs: '브라질', keeper: 'u17b' }, { vs: '프랑스', keeper: 'u17b' }, { vs: '잉글랜드', keeper: 'u17b' }] }] },
    { id: 'u20', name: '청소년 대회', icon: '🎓', pre: 'U-20 ', lv: 45, ourK: 72, coins: 300, rounds: [
      { name: '8강', miss: 0.28, pool: [{ vs: '나이지리아', keeper: 'u20' }, { vs: '멕시코', keeper: 'u20' }, { vs: '한국', keeper: 'u20' }] },
      { name: '4강', miss: 0.22, pool: [{ vs: '네덜란드', keeper: 'u20b' }, { vs: '우루과이', keeper: 'u20b' }, { vs: '이탈리아', keeper: 'u20b' }] },
      { name: '결승', miss: 0.18, pool: [{ vs: '브라질', keeper: 'u20s' }, { vs: '독일', keeper: 'u20s' }, { vs: '아르헨티나', keeper: 'u20s' }, { vs: '스페인', keeper: 'u20s' }] }] },
    { id: 'conti', name: '유로', icon: '🏟️', pre: '', lv: 70, ourK: 80, coins: 500, rounds: [
      { name: '8강', miss: 0.2, pool: [{ vs: '잉글랜드', keeper: 'robinson' }, { vs: '스위쓰', keeper: 'national' }] },
      { name: '4강', miss: 0.15, pool: [{ vs: '프랑스', keeper: 'lloris' }, { vs: '네덜란드', keeper: 'vdsar' }, { vs: '체코', keeper: 'cech' }] },
      { name: '결승', miss: 0.12, pool: [{ vs: '독일', keeper: 'neuer' }, { vs: '이탈리아', keeper: 'buffon' }, { vs: '스페인', keeper: 'casillas' }] }],
      // 메시's continent: the 코파 아메리카 (and its final against 칠레, the side that beat him twice on penalties)
      sa: { name: '코파 아메리카', rounds: [
        { name: '8강', miss: 0.2, pool: [{ vs: '에콰도르', keeper: 'dominguez' }, { vs: '미국', keeper: 'willis' }] },
        { name: '4강', miss: 0.15, pool: [{ vs: '콜롬비아', keeper: 'ospina' }, { vs: '우루과이', keeper: 'national' }] },
        { name: '결승', miss: 0.12, pool: [{ vs: '칠레', keeper: 'bravo' }, { vs: '브라질', keeper: 'alisson' }] }] } },
    { id: 'wc', name: '월드컵', icon: '🌍', pre: '', lv: RS.CUP_LEVEL, ourK: RS.CUP_KEEPER, rounds: RS.CUP_ROUNDS }
  ];
  RS.CUP_WC = RS.CUP_STAGES.length - 1;
  RS.CUP_SA = { messi: true };
  // one stage as this hero plays it: { id, name, icon, pre, lv, ourK, coins, rounds }
  RS.cupStage = function (stage, hero) {
    const st = RS.CUP_STAGES[stage == null ? RS.CUP_WC : clamp(stage | 0, 0, RS.CUP_WC)];
    return st.sa && RS.CUP_SA[hero] ? Object.assign({}, st, st.sa) : st;
  };
  // one line of each hero's story per stage (the intro of its first round)
  RS.CUP_STORY = {
    ronaldo: ['마데이라 섬에서 올라온 깡마른 소년. 첫 유소년 대회, 승부차기는 전부 내가 찬다.', 'U-20 대표팀의 7번. 관중석에는 유럽 빅클럽 스카우트들이 앉아 있다.',
      '안방 유로 결승에서 울던 열아홉 살을 기억한다. 이번엔 조국에 트로피를.', '남은 꿈은 하나, 월드컵. 시우우우를 외칠 시간이다.'],
    messi: ['로사리오의 작은 소년. 키는 작아도 공은 발에 붙어 다닌다.', '바다 건너에서 자란 U-20 에이스. 조국이 그를 부른다.',
      '코파 결승 승부차기에서 두 번 울었다. 세 번은 없다.', '마지막 남은 단 하나, 월드컵.'],
    torres: ['마드리드의 금발 소년. 꼬마 때부터 골문만 봤다.', 'U-20 스페인의 9번. "꼬마"라는 별명이 붙기 시작했다.',
      '유로 결승, 한 골이면 역사가 된다.', '무적함대의 마지막 퍼즐, 월드컵.']
  };
  RS.normalizeCup = function (c) {
    c = c && typeof c === 'object' ? c : {};
    const st = {}, s0 = c.stage && typeof c.stage === 'object' ? c.stage : {};
    for (const h of Object.keys(RS.PK_BASE)) st[h] = clamp(s0[h] | 0, 0, RS.CUP_WC);
    return { played: Math.max(0, c.played | 0), wins: Math.max(0, c.wins | 0), best: Math.max(0, Math.min(RS.CUP_ROUNDS.length, c.best | 0)), stage: st,
      ucl: Math.max(0, c.ucl | 0), dojo: clamp(c.dojo | 0, 0, RS.DOJO.length) };
  };

  // Round 38 (the user: 승부차기 모드 … 위에는 챔피언스리그 가운데 월드컵 마지막 도장깨기 · 도장깨기는 총 10단계로 역사상
  // 최고의 골키퍼 탑10과 승부 · 1990년대 이후로 해 단 야신은 10단계 깨고 최종 레전드 보스로): the title's 승부차기 opens
  // three modes. 'wc' is the stage ladder above (유소년 → 월드컵); 'ucl' one club tournament, the hero's club against
  // Europe's (coins); 'dojo' single shootouts against the ten best keepers since the 1990s — FourFourTwo's "The best
  // goalkeepers ever" (2024) in its order, the lesser-known 90s names (Zubizarreta, Preud'homme) left out — from 10th up
  // to 1st, then 야신 as the final boss (boss: true). A win opens the next 단, a loss replays it. Every mode plays at
  // the 월드컵's level with the national keeper (RS.CUP_LEVEL, RS.CUP_KEEPER).
  RS.UCL_CLUB = { ronaldo: '마드리드 백색군단', messi: '바르셀로나 청홍군단', torres: '마드리드 적백 줄무늬단' };
  RS.UCL = { id: 'ucl', name: '챔피언스리그', icon: '🏆', pre: '', lv: RS.CUP_LEVEL, ourK: RS.CUP_KEEPER, coins: 800, rounds: [
    { name: '16강', miss: 0.24, pool: [{ vs: '리스본 사자단', keeper: 'pro' }, { vs: '파리 에펠군단', keeper: 'national' }, { vs: '바르셀로나 청홍군단', keeper: 'bravo' }] },
    { name: '8강', miss: 0.18, pool: [{ vs: '리버풀 붉은 함성단', keeper: 'alisson' }, { vs: '마드리드 적백 줄무늬단', keeper: 'oblak' }, { vs: '맨체스터 붉은악마단', keeper: 'vdsar' }] },
    { name: '4강', miss: 0.14, pool: [{ vs: '런던 파란 사자단', keeper: 'cech' }, { vs: '토리노 얼룩말단', keeper: 'buffon' }, { vs: '마드리드 백색군단', keeper: 'courtois' }] },
    { name: '결승', miss: 0.1, pool: [{ vs: '마드리드 백색군단', keeper: 'casillas' }, { vs: '뮌헨 붉은 맥주단', keeper: 'neuer' }] }] };
  // one 단 each: the keeper (his rating here: the climb), the other side's miss rate, the coins, his line
  RS.DOJO = [
    { keeper: 'oblak', vs: '슬로베니아', rating: 84, miss: 0.16, line: '아틀레티코의 벽, 라리가와 유로파리그를 들어 올린 수문장' },
    { keeper: 'alisson', vs: '브라질', rating: 86, miss: 0.15, line: '리버풀의 수호신, 극장 결승골 헤딩까지 넣은 골키퍼' },
    { keeper: 'courtois', vs: '벨기에', rating: 87, miss: 0.14, line: '2미터 거인, 첼시·아틀레티코·레알을 지킨 벽' },
    { keeper: 'kahn', vs: '독일', rating: 88, miss: 0.13, line: '골키퍼 최초의 월드컵 골든볼, 무서운 눈빛의 티타늄' },
    { keeper: 'vdsar', vs: '네덜란드', rating: 89, miss: 0.12, line: '아약스와 맨유에서 챔스 우승, 네덜란드 최고의 골키퍼' },
    { keeper: 'schmeichel', vs: '덴마크', rating: 90, miss: 0.11, line: 'XXXL 유니폼을 입던 거인, 맨유 트레블의 벽' },
    { keeper: 'cech', vs: '체코', rating: 91, miss: 0.1, line: '헤드기어의 벽, 프리미어리그 최다 무실점 202경기' },
    { keeper: 'buffon', vs: '이탈리아', rating: 92, miss: 0.09, line: '마흔다섯 살까지 골문을 지킨 영원한 수문장' },
    { keeper: 'casillas', vs: '스페인', rating: 94, miss: 0.08, line: '성 이케르, 5년 연속 세계 최고의 골키퍼' },
    { keeper: 'neuer', vs: '독일', rating: 96, miss: 0.07, line: '골문을 비우고 뛰쳐나오는 스위퍼 키퍼의 완성형' },
    { keeper: 'yashin', vs: '소련', rating: 99, miss: 0.05, boss: true, line: '골키퍼 유일의 발롱도르, 검은 거미 — 최종 레전드 보스' }
  ];
  RS.dojoCoins = (i) => (i >= RS.DOJO.length - 1 ? 3000 : i === RS.DOJO.length - 2 ? 1500 : 150 + 60 * i);
  // a 단's label: 1단 … 10단, then the final boss
  RS.dojoName = (i) => (RS.DOJO[i] && RS.DOJO[i].boss ? '최종 보스' : (i | 0) + 1 + '단');
  // the 단 to play next: the first one not cleared (the last once all ten are)
  RS.dojoNext = (meta) => Math.min(RS.DOJO.length - 1, RS.normalizeCup(meta.cup).dojo);
  RS.dojoStage = (i) => {
    const d = RS.DOJO[clamp(i | 0, 0, RS.DOJO.length - 1)];
    return { id: 'dojo', name: '도장깨기', icon: '🥋', pre: '', lv: RS.CUP_LEVEL, ourK: RS.CUP_KEEPER, coins: RS.dojoCoins(i | 0),
      rounds: [{ name: RS.dojoName(i | 0), miss: d.miss, pool: [{ vs: d.vs + ' 레전드', keeper: d.keeper }] }] };
  };
  RS.pkModeStage = (mode, stage, hero) => (mode === 'ucl' ? RS.UCL : mode === 'dojo' ? RS.dojoStage(stage) : RS.cupStage(stage, hero));
  RS.pkModeUs = (mode, hero) => (mode === 'ucl' ? RS.UCL_CLUB[hero] || RS.UCL_CLUB.ronaldo : RS.soUsName(hero, 0, { nat: true }));
  RS.cupHeroStage = (meta, hero) => RS.normalizeCup(meta.cup).stage[hero] || 0;
  RS.cupLeft = (meta) => RS.CUP_REWARDS.filter((r) => !(meta.unlocked && meta.unlocked[r.id]));
  // The opponents of one run for this hero at this stage (the 월드컵 when no stage is given).
  RS.cupDraw = (rng, hero, stage) => RS.pkDraw(rng, hero, 'wc', stage);
  // round 38: any mode's draw; the 도장깨기's one keeper per 단 is met whoever he played for (the fallback)
  RS.pkDraw = function (rng, hero, mode, stage) {
    const st = RS.pkModeStage(mode, stage, hero), us = RS.pkModeUs(mode, hero);
    return st.rounds.map((r) => {
      const ok = r.pool.filter((m) => { const K = RS.PK_KEEPERS[m.keeper]; return m.vs !== us && K.mate !== hero && !(K.nemesis && K.nemesis[hero] != null); });
      const m = (ok.length ? ok : r.pool)[Math.floor(rng() * (ok.length || r.pool.length))];
      return { vs: st.pre + m.vs, keeper: m.keeper };
    });
  };
  RS.cupStart = function (save) {
    save.meta.cup = RS.normalizeCup(save.meta.cup);
    save.meta.cup.played++;
  };
  // A round played: the record, and on the 결승 the reward. Returns { round, won, next (the round to play, or
  // null), champion, stage, stageUp (the stage it opened, or null), reward: { id, hero } | { coins } }.
  // (round 19: the move only unlocks; level-ups deal it now and then. round 22: below the 월드컵 a title opens the next
  // stage for this hero and pays the stage's coins.)
  // round 38: mode 'ucl' pays its coins and counts the title; 'dojo' opens the next 단 (stageUp) and pays the 단's coins
  RS.cupResult = function (save, round, won, rng, stage, hero, mode) {
    const m = save.meta;
    if (mode === 'ucl' || mode === 'dojo') {
      const st = RS.pkModeStage(mode, stage), last = st.rounds.length - 1, si = stage | 0;
      const out = { round, won, next: null, champion: false, stage: si, stageUp: null, reward: null, mode };
      m.cup = RS.normalizeCup(m.cup);
      if (!won) return out;
      if (round < last) { out.next = round + 1; return out; }
      out.champion = true;
      if (mode === 'ucl') m.cup.ucl++;
      else if (m.cup.dojo <= si) { m.cup.dojo = si + 1; if (si + 1 < RS.DOJO.length) out.stageUp = si + 1; }
      m.coins += st.coins;
      out.reward = { coins: st.coins };
      return out;
    }
    const si = stage == null ? RS.CUP_WC : clamp(stage | 0, 0, RS.CUP_WC);
    const st = RS.cupStage(si, hero), last = st.rounds.length - 1;
    const out = { round, won, next: null, champion: false, stage: si, stageUp: null, reward: null };
    m.cup = RS.normalizeCup(m.cup);
    if (!won) return out;
    if (si === RS.CUP_WC) m.cup.best = Math.max(m.cup.best, round + 1);
    if (round < last) { out.next = round + 1; return out; }
    out.champion = true;
    if (si < RS.CUP_WC) {
      const h = hero && m.cup.stage[hero] != null ? hero : 'ronaldo';
      if (m.cup.stage[h] <= si) { m.cup.stage[h] = si + 1; out.stageUp = si + 1; }
      m.coins += st.coins;
      out.reward = { coins: st.coins };
      return out;
    }
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
      // the 토너먼트 (round 22): its stage (the 월드컵 when none is given) sets the level — fixed for the youth stages
      // round 38: mode 'wc' (that ladder), 'ucl' or 'dojo' (its 단 in stage); the last two play at the 월드컵's level
      this.mode = opt.kind === 'cup' ? (opt.mode === 'ucl' || opt.mode === 'dojo' ? opt.mode : 'wc') : null;
      this.stage = opt.kind !== 'cup' ? null : this.mode === 'ucl' ? 0 : this.mode === 'dojo' ? clamp(opt.stage | 0, 0, RS.DOJO.length - 1)
        : opt.stage == null ? RS.CUP_WC : clamp(opt.stage | 0, 0, RS.CUP_WC);
      this.st = opt.kind === 'cup' ? RS.pkModeStage(this.mode, this.stage, this.hero) : null;
      const top = this.mode && (this.mode !== 'wc' || this.stage === RS.CUP_WC);
      this.level = opt.kind === 'cup' ? (top ? Math.max(b.level || 1, RS.CUP_LEVEL) : this.st.lv) : b.level || 1;
      this.small = RS.smallBody(b);
      this.fin = RS.pkFinishing({ hero: this.hero, level: this.level }, save.meta);
      // round 23 (the user: 승부차기 모드에선 유소년때도 다 해금시켜줘 미니게임인데): the 토너먼트 opens every zone
      this.zones = opt.kind === 'cup' ? 9 : RS.pkZoneCount(this.level);
      if (opt.kind === 'cup') {
        this.round = Math.max(0, Math.min(this.st.rounds.length - 1, opt.round | 0));
        this.def = { cup: true, all: true, nat: this.mode !== 'ucl', title: this.st.icon + ' ' + this.st.name + ' · ' + this.st.rounds[this.round].name, vs: opt.vs, keeper: opt.keeper };
        this.keeperId = opt.keeper;
        this.so = RS.newShootout(this.rng() < 0.5 ? 'us' : 'them');
        this.us = this.mode === 'wc' ? this.st.pre + RS.soUsName(this.hero, 0, this.def) : RS.pkModeUs(this.mode, this.hero);
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
      // the 도장깨기: the 단's rating, and no hero's 천적 cap (each 단 must be winnable)
      if (this.mode === 'dojo') this.keeper = Object.assign({}, this.keeper, { rating: RS.DOJO[this.stage].rating, nemesis: null });
      // the 토너먼트: the national team's keeper (RS.CUP_KEEPER at least) and each round's opposing kickers (oppMiss)
      // (round 22: a youth stage has its own keeper, not the career's)
      this.ourK = this.kind !== 'cup' ? RS.soOurKeeper(b) : top ? Math.max(RS.CUP_KEEPER, RS.soOurKeeper(b)) : this.st.ourK;
      this.oppMiss = this.kind === 'cup' ? this.st.rounds[this.round].miss : null;
      this.ourKeeper = { name: '우리 골키퍼', rating: this.ourK, look: RS.PK_OUR_LOOK };
      this.rage = false; // the other keeper's 분노 모드 (round 16)
      this.morale = 0; // round 23: our kicker's failed 파넨카s so far (RS.pkTiming)
      this.panStreak = 0; // round 23: his 파넨카 attempts in a row just now (RS.PK_PAN_STREAK)
      this.midSaved = 0; // round 23: their low balls down the middle our keeper took (RS.soOppAim)
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
        // round 23: a 파넨카 that did not go in shakes him (사기 저하: this.moraleNew for the screen)
        const pan = !!(result && result.kind === 'panenka');
        this.panStreak = pan ? this.panStreak + 1 : 0;
        if (pan && !goal && this.morale < RS.PK_MORALE_MAX) { this.morale++; this.moraleNew = true; }
        this.kicks.push({ goal, res: result.res });
        const t = RS.pkRecord(this.save.meta, this.hero, goal);
        if (t) this.titles.push(t);
      } else if (c.who === 'opp' && result.res === 'save') {
        rec.saves++;
        if (result.col === 1 && result.row === 0) this.midSaved++; // (RS.soOppAim: the next ones avoid it)
      }
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
        out.cup = RS.cupResult(this.save, this.round, out.won, this.rng, this.stage, this.hero, this.mode);
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
(globalThis.RS_FILES = globalThis.RS_FILES || {}).pk = 'R39';
