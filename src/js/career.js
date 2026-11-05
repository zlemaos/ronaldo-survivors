/* 호날두 서바이버즈 — career flow, saves and meta shop (no DOM). */
(function (RS) {
  'use strict';

  RS.SAVE_KEY = 'ronaldo-survivors.save.v1';
  // career schema 2: 메시's youth seasons come before his 2004 debut; 3: the 발롱도르 won (build.ballons, see
  // RS.migrateCareer); 4 (round 14): the ladder grew past SSS, so a grade index saved above it (a round-12 무지개
  // never normalised) is SSS, not GOAT
  RS.CAREER_V = 4;

  RS.newSave = function () {
    return {
      version: 1,
      career: {
        v: RS.CAREER_V,
        yearIdx: 0, // next year to play
        cleared: [], // cleared[idx] = true
        eventDone: -1, // story event of year idx (RS.EVENTS) resolved when eventDone >= idx
        pressDone: -1, // press conference of year idx (RS.PRESS) answered when pressDone >= idx
        recallDone: -1, // 회상 of year idx (RS.YEARS[idx].recall, a RS.PRESS scene) seen when recallDone >= idx
        over: null, // a bad ending (RS.ENDINGS id) stopped this career; only a new career goes on
        coachDone: -1, // coach card for year idx picked when coachDone >= idx
        transferDone: -1, // transfer window for year idx handled when transferDone >= idx
        rewardDone: -1, // boss reward for year idx picked when rewardDone >= idx
        build: RS.newBuild(),
        snapshots: {}, // idx -> build at the start of that year (after the coach pick)
        shootouts: {}, // idx -> 'win' | 'loss': the season's real penalty shootout (RS.SHOOTOUTS)
        torresBeaten: {}, // idx -> true: 토레쓰 beaten that season (his reward is paid once per season)
        torresReward: null, // idx of a 토레쓰 reward still to pick (RS.needsTorresReward)
        finished: false,
        laps: 0
      },
      careers: {}, // parked careers of the other heroes (see RS.switchHero)
      // diff: RS.DIFFS key; auto: 'off' | 'semi' (반자동: important choices are the player's) | 'full' (완전 오토);
      // pk: matches played and each hero's penalties (RS.normalizePk)
      // unlocked: heroes opened in play (round 11: torres, by beating him after 드록빠)
      // cup: the 승부차기 토너먼트 record (RS.normalizeCup); its rewards are unlocked keys too (RS.CUP_REWARDS)
      meta: { coins: 0, ballons: 0, upgrades: {}, ballonYears: [], muted: false, totalKills: 0, wins: 0, diff: 'normal', auto: 'off', pk: { games: 0, heroes: {} }, unlocked: {}, cup: { played: 0, wins: 0, best: 0 } }
    };
  };
  RS.AUTO_MODES = ['off', 'semi', 'full'];

  // Load with defaults filled in; never throws.
  RS.loadSave = function (storage) {
    const d = RS.newSave();
    let raw = null;
    try { raw = storage.get(RS.SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return d;
    let s;
    try { s = JSON.parse(raw); } catch (e) { return d; }
    if (!s || typeof s !== 'object') return d;
    const savedV = s.career && s.career.v;
    s.career = Object.assign(d.career, s.career || {});
    s.career.v = savedV || 1; // careers saved before schema 2 carry no version
    s.meta = Object.assign(d.meta, s.meta || {});
    s.version = 1;
    s.career.build = RS.normalizeBuild(s.career.build);
    for (const k of Object.keys(s.career.snapshots || {})) s.career.snapshots[k] = RS.normalizeBuild(s.career.snapshots[k]);
    s.careers = s.careers && typeof s.careers === 'object' ? s.careers : {}; // parked careers of the other heroes
    RS.migrateCareer(s.career);
    for (const h of Object.keys(s.careers)) RS.migrateCareer(s.careers[h]);
    RS.selectHero(s.career.build.hero, s.career.build);
    s.career.yearIdx = Math.max(0, Math.min(RS.YEARS.length - 1, s.career.yearIdx | 0));
    if (!s.career.finished) RS.releaseOffSeason(s.career.build, s.career.yearIdx); // squads saved before round 11
    for (const k of Object.keys(s.meta.upgrades)) if (!RS.META[k]) delete s.meta.upgrades[k];
    if (!RS.DIFFS[s.meta.diff]) s.meta.diff = 'normal';
    if (!RS.AUTO_MODES.includes(s.meta.auto)) s.meta.auto = 'off';
    s.meta.pk = RS.normalizePk(s.meta.pk);
    if (!s.meta.unlocked || typeof s.meta.unlocked !== 'object') s.meta.unlocked = {};
    s.meta.cup = RS.normalizeCup(s.meta.cup);
    RS.grantCupRewards(s);
    RS.setDiff(s.meta.diff);
    return s;
  };
  // 승부차기 토너먼트 rewards (round 15): the active career holds each unlocked move of its hero at SIUUU, in hand
  // when it first comes (the move held goes to the 무기고). Owned already, nothing changes. Returns the ids given.
  RS.grantCupRewards = function (save) {
    const b = save.career.build, un = save.meta.unlocked || {}, got = [];
    for (const r of RS.CUP_REWARDS) {
      if (!un[r.id] || r.hero !== b.hero || RS.ownedWeapon(b, r.id)) continue;
      if (RS.gainWeapon(b, { id: r.id, g: RS.CUP_GRADE, p: 1 }, true)) got.push(r.id);
    }
    return got;
  };

  // Switch the active career to another hero. The current career is parked under save.careers[hero] and the
  // other hero's parked career (or a fresh one) becomes save.career. Meta (coins, 발롱도르, shop) is shared.
  RS.switchHero = function (save, hero) {
    hero = RS.HEROES[hero] ? hero : 'ronaldo';
    const cur = save.career.build.hero;
    if (cur === hero) { RS.selectHero(hero, save.career.build); return save.career; }
    save.careers = save.careers || {};
    save.careers[cur] = save.career;
    let next = save.careers[hero];
    if (!next) { next = RS.newSave().career; next.build = RS.newBuild(hero); RS.dressBuild(save, next.build); }
    else { next.build = RS.normalizeBuild(next.build); next.build.hero = hero; }
    delete save.careers[hero];
    save.career = next;
    RS.selectHero(hero, save.career.build);
    save.career.yearIdx = Math.max(0, Math.min(RS.YEARS.length - 1, save.career.yearIdx | 0));
    if (!save.career.finished) RS.releaseOffSeason(save.career.build, save.career.yearIdx); // a parked pre-round-11 squad
    RS.grantCupRewards(save);
    return save.career;
  };

  // A 메시 career saved before schema 2 started at his 2004 debut: its year indices move past the youth seasons
  // (marked cleared so they can be replayed) and it keeps the grown body (normal mode). Fresh careers start in the
  // youth. 날두 careers only get the version.
  RS.migrateCareer = function (career) {
    if (!career || career.v >= RS.CAREER_V) return career;
    if (career.eventDone == null) career.eventDone = -1; // parked careers are stored without defaults
    const b = career.build, v = career.v || 1;
    const started = (career.yearIdx | 0) > 0 || career.coachDone >= 0 || career.finished || (career.cleared || []).some(Boolean);
    if (v < 2 && b && b.hero === 'messi' && started) {
      const n = RS.YEARS_MESSI.filter((y) => y.youth).length;
      const shift = (v) => (v == null || v < 0 ? v : v + n);
      career.yearIdx = shift(career.yearIdx | 0);
      for (const k of ['coachDone', 'transferDone', 'rewardDone']) career[k] = shift(career[k]);
      career.cleared = new Array(n).fill(true).concat(career.cleared || []);
      const snaps = {};
      for (const k of Object.keys(career.snapshots || {})) { snaps[+k + n] = career.snapshots[k]; snaps[+k + n].hgh = true; }
      career.snapshots = snaps;
      b.hgh = true;
    }
    if (v < 3 && b) RS.backfillBallons(career);
    if (v < 4 && b) { // round 14: the ladder's old top is SSS (4); nothing saved before can be GOAT or SIUUU
      const cap = (bb) => {
        for (const w of [bb.weapon].concat(bb.armory || [])) if (w) w.g = Math.min(RS.GRADE_TOP, w.g | 0);
        for (const id of Object.keys(bb.passiveGrades || {})) bb.passiveGrades[id] = bb.passiveGrades[id].map((g) => Math.min(RS.GRADE_TOP, g | 0));
        // a parked career saved before round 11 has no weapon yet (RS.normalizeBuild makes one when it is played):
        // syncing it stopped the whole page at load
        if (bb.weapon && RS.SKILLS[bb.weapon.id]) RS.syncWeapon(bb);
      };
      cap(b);
      for (const k of Object.keys(career.snapshots || {})) cap(career.snapshots[k]);
      if (career.recallDone == null) career.recallDone = -1;
    }
    career.v = RS.CAREER_V;
    return career;
  };
  // A fresh career's story marks (round 14): once 성공한 첼씨 토레쓰 is unlocked (meta.unlocked.torresBlue), every new
  // 토레쓰 career is his — the 첼씨 path from the start, SSS, in blue (RS.heroGrade, RS.TORRES_BLUE).
  RS.dressBuild = function (save, b) {
    if (b.hero === 'torres' && save.meta && save.meta.unlocked && save.meta.unlocked.torresBlue) {
      b.flags.blue = true; b.flags.path = RS.CHELSEA.bluePath; b.flags.cgrade = RS.GRADE_TOP;
    }
    return b;
  };
  // Schema 3 (round 10): the 발롱도르 a career has won (build.ballons) come from its cleared 발롱도르 seasons — for the
  // build and each year's snapshot, the ones before that year — and a 회전 공 evolved before the first one goes back
  // to Lv.6 (the evolution is the 발롱도르 he has won: RS.availableEvolutions).
  RS.backfillBallons = function (career) {
    const hero = RS.HEROES[career.build.hero] ? career.build.hero : 'ronaldo', years = RS.HEROES[hero].years, cleared = career.cleared || [];
    const before = (k) => years.slice(0, k).filter((y, i) => y.ballon && cleared[i]).map((y) => y.year);
    const fix = (b, k) => {
      b.ballons = before(k);
      if (b.weapon) RS.syncWeapon(b); // a 무지개 회전 공 waits for the first 발롱도르 again
    };
    fix(career.build, career.finished ? years.length : (career.yearIdx | 0));
    for (const k of Object.keys(career.snapshots || {})) fix(career.snapshots[k], +k);
  };

  RS.writeSave = function (storage, save) {
    try { storage.set(RS.SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
  };

  RS.yearAge = (idx) => RS.YEARS[idx].year - RS.BIRTH_YEAR;

  // Can this year be played? Cleared years can be replayed; the current year can be played.
  RS.canPlay = function (save, idx) {
    const c = save.career;
    if (c.over || idx < 0 || idx >= RS.YEARS.length) return false;
    return idx <= c.yearIdx || !!c.cleared[idx];
  };
  RS.isReplay = (save, idx) => idx !== save.career.yearIdx || save.career.finished;
  RS.needsCoach = (save, idx) => !RS.isReplay(save, idx) && save.career.coachDone < idx;

  // Story events (메시: the growth-hormone choice = difficulty, 딩요's tutoring): once, before that season's coach.
  RS.needsEvent = (save, idx) => !RS.isReplay(save, idx) && !!RS.YEARS[idx].event && save.career.eventDone < idx;
  // A move taught by the story (event card skill, press answer fx.skill) comes as a 희귀 +1 weapon (RS.GIFT_GRADE),
  // into the hand when it beats the one held, else into the 무기고. Owned already: that weapon gets 강화 +1.
  // Returns 'learned' | 'up' | 'full' (owned and maxed).
  RS.giftWeapon = function (b, id) {
    const own = RS.ownedWeapon(b, id);
    if (own) { if (own.p >= RS.PLUS_MAX) return 'full'; own.p++; RS.syncWeapon(b); return 'up'; }
    const w = { id, g: RS.GIFT_GRADE, p: 1 };
    RS.gainWeapon(b, w, RS.weaponBetter(w, b.weapon));
    return 'learned';
  };
  // The cards of an event for this build: its variant list when the event has one for the build's flag (round 14:
  // the 2014 월드컵 depends on the knee), else the base cards; a skill card already owned shows its `alt`.
  RS.eventCards_ = function (ev, b) {
    const v = ev.variants, k = v && b.flags && b.flags[v.flag];
    return (v && k && v.by[k]) || ev.cards;
  };
  RS.eventChoices = function (save, idx) {
    const b = save.career.build;
    return RS.eventCards_(RS.EVENTS[RS.YEARS[idx].event], b).map((c) => {
      const card = c.skill && c.alt && RS.ownedWeapon(b, c.skill) ? c.alt : c;
      return Object.assign({ kind: 'event' }, card, card.skill ? { g: RS.GIFT_GRADE } : {});
    });
  };
  // A card's lasting effects (round 14, RS.EVENTS fx): mods (kept like a coach card under cid), flags (name → value),
  // gradeDown (every owned weapon loses that many grades).
  RS.applyEventFx = function (b, fx, cid) {
    if (!fx) return;
    if (fx.mods && !b.coachCards.includes(cid)) b.coachCards.push(cid);
    if (fx.flag) Object.assign(b.flags, fx.flag);
    if (fx.gradeDown) RS.downgradeWeapons(b, fx.gradeDown);
    if (fx.fans) b.fans = RS.clampFans((b.fans == null ? RS.FANS.start : b.fans) + fx.fans);
  };
  RS.applyEvent = function (save, idx, card, rng) {
    const c = save.career, b = c.build, ev = RS.EVENTS[RS.YEARS[idx].event];
    const info = { card: card.id, text: card.result || '' };
    if (card.hgh != null) b.hgh = card.hgh;
    if (card.skill) RS.giftWeapon(b, card.skill);
    if (card.skillsUp) RS.enhanceWeapon(b, card.skillsUp);
    if (card.mods && !b.coachCards.includes(card.id)) b.coachCards.push(card.id);
    if (card.trio) { RS.formTrio(b); info.trio = true; }
    if (card.rolls) { // rolled once, like a press answer
      let r = (rng || Math.random)(), roll = card.rolls.length - 1;
      for (let i = 0; i < card.rolls.length; i++) { if (r < card.rolls[i].p) { roll = i; break; } r -= card.rolls[i].p; }
      const o = card.rolls[roll];
      info.roll = roll; info.win = !!o.win; info.text = o.text || info.text;
      RS.applyEventFx(b, o.fx, card.id + '_' + roll);
    } else RS.applyEventFx(b, card.fx, card.id);
    if (ev.mate && RS.addMate(b, ev.mate)) info.mate = ev.mate;
    c.eventDone = idx;
    c.snapshots[idx] = RS.cloneBuild(b);
    return info;
  };

  // ---------------------------------------------------------------- 기자회견 (RS.PRESS)
  // Once in a career season that has one (RS.YEARS[idx].press), after the story event and before the coach.
  // skipIf (round 14): a scene a build flag skips (성공한 첼씨 토레쓰 never stands at the 2011 crossroads)
  RS.needsPress = (save, idx) => !RS.isReplay(save, idx) && !!RS.YEARS[idx].press && (save.career.pressDone == null ? -1 : save.career.pressDone) < idx &&
    !(RS.PRESS[RS.YEARS[idx].press].skipIf && save.career.build.flags[RS.PRESS[RS.YEARS[idx].press].skipIf]);
  RS.pressFor = (idx) => RS.PRESS[RS.YEARS[idx].press];
  // 회상 (round 14): a RS.PRESS scene with one answer before a 첼씨 시련 (RS.YEARS[idx].recall), after the press
  RS.needsRecall = (save, idx) => !RS.isReplay(save, idx) && !!RS.YEARS[idx].recall && (save.career.recallDone == null ? -1 : save.career.recallDone) < idx;
  RS.recallFor = (idx) => RS.PRESS[RS.YEARS[idx].recall];
  // Answer `choiceId`: its odds are rolled once (rng), the outcome is applied to the career and returned as
  // { choice, text, note, win, mood: 'good' | 'bad' | 'sad' | 'calm', ending, skill: 'learned' | 'up' | 'full' }.
  // pid: the scene (default the season's press; a 회상 names its own).
  RS.applyPress = function (save, idx, choiceId, rng, pid) {
    const c = save.career, b = c.build;
    pid = pid || RS.YEARS[idx].press;
    const ch = RS.PRESS[pid].choices.find((x) => x.id === choiceId) || RS.PRESS[pid].choices[0];
    let o = ch.result, roll = null;
    if (ch.rolls) {
      let r = rng();
      roll = ch.rolls.length - 1;
      for (let i = 0; i < ch.rolls.length; i++) { if (r < ch.rolls[i].p) { roll = i; break; } r -= ch.rolls[i].p; }
      o = ch.rolls[roll];
    }
    const fx = o.fx || {};
    const out = { choice: ch.id, text: o.text, note: o.note || '', win: !!o.win, roll,
      mood: o.mood || (o.ending ? 'bad' : o.win ? 'good' : ch.rolls ? 'bad' : (fx.fans || 0) < 0 ? 'bad' : 'good') };
    if (fx.fans) b.fans = RS.clampFans((b.fans == null ? RS.FANS.start : b.fans) + fx.fans);
    if (fx.coins != null) save.meta.coins = Math.floor(save.meta.coins * fx.coins); // a fine: share of the wallet
    const card = RS.pressCardId(pid, ch.id, roll);
    if (fx.mods && !b.coachCards.includes(card)) b.coachCards.push(card);
    if (fx.skill) { // the move as a weapon (RS.giftWeapon); a small lasting boost when that weapon is maxed already
      out.skill = RS.giftWeapon(b, fx.skill);
      if (out.skill === 'full' && !b.coachCards.includes(card + '_full')) b.coachCards.push(card + '_full');
    }
    if (fx.flag) { if (typeof fx.flag === 'string') b.flags[fx.flag] = true; else Object.assign(b.flags, fx.flag); } // a name, or name → value
    if (o.ending) { c.over = o.ending; out.ending = o.ending; }
    if (RS.PRESS[pid].recall) c.recallDone = idx; else c.pressDone = idx;
    // the 2011 crossroads picked the career's path: the season list changes from here on (RS.selectHero)
    if (fx.flag && fx.flag.path) { RS.selectHero(b.hero, b); out.path = fx.flag.path; }
    c.snapshots[idx] = RS.cloneBuild(b);
    return out;
  };

  // ---------------------------------------------------------------- 완전 오토 picks between seasons
  // Story events and press answers: the lowest `ai` rank (never a career-ending gamble). Coach: a lasting card
  // first, a recruit when the pitch has room. Boss reward: toughness first.
  RS.autoEventPick = (cards) => cards.reduce((bi, c, i) => ((c.ai || 0) < (cards[bi].ai || 0) ? i : bi), 0);
  RS.autoPressPick = (choices) => choices.reduce((bi, c, i) => (c.ai < choices[bi].ai ? i : bi), 0);
  RS.autoCoachPick = function (cards, build) {
    const roomy = build.teammates.length < RS.MAX_MATES;
    const rank = (c) => (c.id === 'recruit' ? (roomy ? 0 : 2) : c.id === 'train' ? 1.5 : c.id === 'rest' ? 3 : 1);
    return cards.reduce((bi, c, i) => (rank(c) < rank(cards[bi]) ? i : bi), 0);
  };
  RS.autoRewardPick = function (cards) {
    const order = ['hp', 'reroll', 'train', 'coach', 'coins'];
    return cards.reduce((bi, c, i) => (order.indexOf(c.id) < order.indexOf(cards[bi].id) ? i : bi), 0);
  };

  // Coach cards for year idx: 2 coach cards + 1 extra (recruit or train) when possible.
  RS.coachChoices = function (save, idx, rng) {
    const yd = RS.YEARS[idx];
    const coach = RS.COACHES[yd.coach];
    const b = save.career.build;
    const pool = coach.cards.filter((c) => !b.coachCards.includes(c.id));
    const out = [];
    while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const canRecruit = !RS.squadFull(b) && RS.mateCandidates(b, idx).length > 0;
    const canTrain = RS.allMates(b).some((m) => m.lv < RS.MATE_MAX_LV);
    if (canRecruit && (!canTrain || rng() < 0.6)) out.push(RS.COACH_EXTRA.recruit);
    else if (canTrain) out.push(RS.COACH_EXTRA.train);
    while (out.length < 3 && pool.length) out.push(pool.splice(0, 1)[0]);
    if (out.length < 3) {
      // all coach cards already taken: generic fallback
      out.push({ id: 'rest', name: '휴식', icon: '🛌', desc: '코인 +40' });
    }
    return out.slice(0, 3);
  };

  // Apply a coach card to the career build; returns info about what happened.
  RS.applyCoach = function (save, idx, card, rng) {
    const c = save.career;
    const info = { card: card.id };
    if (card.id === 'recruit') {
      const cands = RS.mateCandidates(c.build, idx);
      if (cands.length) { const id = cands[Math.floor(rng() * cands.length)], lv = RS.rollMatePlus(rng); RS.addMate(c.build, id, lv); info.mate = id; info.lv = lv; }
    } else if (card.id === 'train') {
      for (const m of RS.allMates(c.build)) RS.levelMate(c.build, m.id, 1);
    } else if (card.id === 'rest') {
      save.meta.coins += 40;
    } else if (RS.coachCard(card.id) && !c.build.coachCards.includes(card.id)) {
      c.build.coachCards.push(card.id);
    }
    c.coachDone = idx;
    c.snapshots[idx] = RS.cloneBuild(c.build);
    return info;
  };

  // Transfer window: when the club changes, players of the new club in that season are offered (sign into a free
  // slot or swap with a current teammate), each with his own 강화. Returns up to 2 offers {id, lv}, [] when none.
  RS.clubChanged = (idx) => idx > 0 && RS.YEARS[idx].era !== RS.YEARS[idx - 1].era;
  RS.transferOffers = function (save, idx, rng) {
    if (RS.isReplay(save, idx) || !RS.clubChanged(idx) || save.career.transferDone >= idx) return [];
    const cands = RS.mateCandidates(save.career.build, idx);
    const out = [];
    while (out.length < 2 && cands.length) out.push({ id: cands.splice(Math.floor(rng() * cands.length), 1)[0], lv: RS.rollMatePlus(rng) });
    return out;
  };
  // outId: teammate to release (null = sign into a free slot). newId null = keep the squad. lv: the newcomer's 강화.
  RS.applyTransfer = function (save, idx, newId, outId, lv) {
    const b = save.career.build;
    let ok = true;
    if (newId) ok = outId ? RS.swapMate(b, outId, newId, lv || 1) : !!RS.addMate(b, newId, lv);
    save.career.snapshots[idx] = RS.cloneBuild(b);
    return ok;
  };
  RS.finishTransfers = function (save, idx) { save.career.transferDone = idx; };
  // Simple policy for bots/tests: sign into free slots, otherwise replace the longest-serving teammate.
  RS.autoTransfers = function (save, idx, rng) {
    const offers = RS.transferOffers(save, idx, rng);
    for (const { id, lv } of offers) {
      const b = save.career.build;
      RS.applyTransfer(save, idx, id, RS.squadFull(b) ? b.teammates[0].id : null, lv);
      // the swapped-in player goes to the back of the line
      const i = b.teammates.findIndex((m) => m.id === id);
      if (i >= 0) b.teammates.push(b.teammates.splice(i, 1)[0]);
    }
    RS.finishTransfers(save, idx);
    save.career.snapshots[idx] = RS.cloneBuild(save.career.build);
    return offers;
  };

  // Build used to start year idx. Career year: current career build. Replay: snapshot from that year.
  RS.buildForYear = function (save, idx) {
    const c = save.career;
    if (!RS.isReplay(save, idx)) return RS.cloneBuild(c.build);
    return RS.cloneBuild(c.snapshots[idx] || c.build);
  };

  RS.startYear = function (save, idx, opt) {
    opt = opt || {};
    return new RS.World({ yearIdx: idx, build: RS.buildForYear(save, idx), meta: save.meta, seed: opt.seed, view: opt.view });
  };

  // Called when a year ends (clear, victory or death). Returns summary for the UI.
  RS.finishYear = function (save, world) {
    const idx = world.yearIdx;
    const res = world.result();
    const replay = RS.isReplay(save, idx);
    const out = { idx, replay, cleared: res.cleared, coins: res.coins, kills: res.kills, ballon: 0, finished: false, level: res.level };
    save.meta.coins += res.coins;
    save.meta.totalKills += res.kills;
    out.pkDue = RS.pkCountGame(save.meta); // every fifth match, cleared or not, ends with a PK 챌린지
    if (res.cleared) {
      const yd = RS.YEARS[idx];
      // 엘 클라시코: the record and 민심 move once the season is really played (not a replay); a lost 클라시코 in a
      // 발롱도르 year hands the trophy to the rival (play the year again and beat him to take it back)
      if (res.rival && !replay) {
        const b = world.build;
        b.rivalry = b.rivalry || { w: 0, l: 0 };
        if (res.rival === 'win') b.rivalry.w++; else b.rivalry.l++;
        b.fans = RS.clampFans((b.fans == null ? RS.FANS.start : b.fans) + (res.rival === 'win' ? RS.RIVAL_FANS : -RS.RIVAL_FANS));
        out.rival = res.rival; out.rivalName = res.rivalName;
      }
      const stolen = yd.ballon && yd.rival && res.rival === 'loss';
      if (stolen) { out.ballonStolen = true; out.rivalName = res.rivalName; }
      // the career's own 발롱도르 (trophy balls, RS.ballonCount); a replay that wins a stolen one back counts too
      const keep = (b) => { if (yd.ballon && !stolen && !b.ballons.includes(yd.year)) { b.ballons.push(yd.year); out.ballonWon = b.ballons.length; } };
      if (yd.ballon && !stolen && !save.meta.ballonYears.includes(yd.year)) {
        save.meta.ballonYears.push(yd.year);
        save.meta.ballons += 1;
        out.ballon = 1;
      }
      if (yd.final) {
        save.meta.wins += 1;
        save.meta.ballons += 1;
        out.ballon += 1;
      }
      // 토레쓰 beaten after 드록빠 (RS.TORRES): his career opens; once per career season an extra reward waits
      // (RS.torresRewardChoices, picked on the result screen — it survives a reload in career.torresReward)
      out.torres = res.torres || null;
      if (res.torres === 'win') {
        if (!save.meta.unlocked || typeof save.meta.unlocked !== 'object') save.meta.unlocked = {};
        if (!save.meta.unlocked.torres) { save.meta.unlocked.torres = true; out.unlockTorres = true; }
        const c = save.career;
        c.torresBeaten = c.torresBeaten || {};
        if (!c.torresBeaten[idx]) { c.torresBeaten[idx] = true; c.torresReward = idx; out.torresReward = true; }
      }
      if (!replay) {
        const c = save.career;
        c.cleared[idx] = true;
        c.build = world.exportBuild();
        keep(c.build);
        const f = c.build.flags;
        // 첼씨 시련 (round 14): each cleared one lifts 첼씨 토레쓰 a grade; the fourth makes 성공한 첼씨 토레쓰 for good
        if (yd.ctrial && f.path === RS.CHELSEA.bluePath && !f.blue) {
          const was = f.cgrade | 0;
          f.cgrade = Math.min(RS.GRADE_TOP, Math.max(was, yd.ctrial));
          if (f.cgrade > was) out.cgrade = { from: was, to: f.cgrade };
          if (yd.ctrial >= RS.CHELSEA.trials) {
            if (!save.meta.unlocked || typeof save.meta.unlocked !== 'object') save.meta.unlocked = {};
            if (!save.meta.unlocked.torresBlue) { save.meta.unlocked.torresBlue = true; out.unlockBlue = true; }
          }
        }
        // 이빨괴물 수아레즈 beaten as a season boss: from now on he may run on as a 준보스 (World.runScheduled)
        if (yd.boss.type === 'suarez' && !f.suarez) { f.suarez = true; out.suarez = true; }
        if (yd.final) { c.finished = true; out.finished = true; }
        else {
          c.yearIdx = idx + 1;
          const moves = RS.releaseOffSeason(c.build, idx + 1); // the men who do not play beside him next season
          if (moves.gone.length) out.farewell = moves;
        }
      } else {
        save.career.cleared[idx] = true;
        keep(save.career.build);
      }
    }
    return out;
  };

  // Boss reward: after a season boss falls (career years only) 날두 picks one trophy perk. Permanent for the career.
  RS.BOSS_REWARDS = [
    { id: 'hp', icon: '🏆', name: '트로피 체력', desc: '최대 체력 +20 (영구)' },
    { id: 'reroll', icon: '🎲', name: '베테랑의 눈', desc: '레벨업 다시 뽑기 +1 (매 시즌)' },
    { id: 'train', icon: '📈', name: '팀 훈련 캠프', desc: '선발·벤치 동료 전원 강화 +1' },
    { id: 'coins', icon: '💰', name: '우승 보너스', desc: '코인 +150' },
    { id: 'coach', icon: '👔', name: '감독의 선물', desc: '이번 시즌 감독 카드 1장 추가' }
  ];
  RS.bossRewardChoices = function (save, idx, rng) {
    const b = save.career.build;
    const pool = RS.BOSS_REWARDS.filter((r) => {
      if (r.id === 'train') return RS.allMates(b).some((m) => m.lv < RS.MATE_MAX_LV);
      if (r.id === 'coach') return RS.COACHES[RS.YEARS[idx].coach].cards.some((c) => !b.coachCards.includes(c.id));
      return true;
    });
    const out = [];
    while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out.map((r) => Object.assign({ kind: 'reward', tag: '보스 보상' }, r));
  };
  RS.applyBossReward = function (save, idx, card, rng) {
    const b = save.career.build;
    const info = { card: card.id };
    if (card.id === 'hp') b.bonusHp = (b.bonusHp || 0) + 20;
    else if (card.id === 'reroll') b.bonusReroll = (b.bonusReroll || 0) + 1;
    else if (card.id === 'train') for (const m of RS.allMates(b)) RS.levelMate(b, m.id, 1);
    else if (card.id === 'coins') save.meta.coins += 150;
    else if (card.id === 'coach') {
      const pool = RS.COACHES[RS.YEARS[idx].coach].cards.filter((c) => !b.coachCards.includes(c.id));
      if (pool.length) { const c = pool[Math.floor(rng() * pool.length)]; b.coachCards.push(c.id); info.coach = c.id; }
    }
    save.career.rewardDone = idx;
    save.career.snapshots[idx] = RS.cloneBuild(b);
    return info;
  };
  RS.needsBossReward = (save, idx) => !RS.YEARS[idx].final && !!save.career.cleared[idx] && (save.career.rewardDone == null ? -1 : save.career.rewardDone) < idx && save.career.yearIdx === idx + 1;

  // 토레쓰 reward (round 11): one pick after beating him. g: the card colour (RS.GRADES).
  RS.TORRES_REWARDS = [
    { id: 'mate', icon: '⚽', name: '토레쓰 영입', g: 4, desc: '토레쓰(OVR 90 공격수)가 강화 +5로 합류 · 자리가 없으면 가장 약한 벤치 동료와 교체' },
    { id: 'weapon', icon: '🏆', name: '빈의 결승골', g: 3, desc: 'SS 이상 무기 1개 (SSS 확률 15%) · 지금 무기보다 세면 바로 장착' },
    { id: 'coins', icon: '💰', name: '5천만 파운드 이적료', g: 2, desc: '코인 +500' }
  ];
  // 토레쓰 only runs on from 2007 (날두, pro season 5) or 2012 (메시), where the level-up cards already deal 전설.
  RS.TORRES_WEAPON_ODDS = [0, 0, 0, 0.85, 0.15];
  RS.needsTorresReward = (save) => save.career.torresReward != null;
  // Rewards still to pick, in the result screen's order. A reload between a clear and its picks keeps them in the
  // save (토레쓰's in career.torresReward, the season boss's until the next season is cleared), so the next match
  // start offers them: otherwise a later clear would bury the one and skip the other.
  RS.pendingRewards = function (save) {
    const out = [], y = save.career.yearIdx;
    if (RS.needsTorresReward(save)) out.push('torres');
    if (y > 0 && RS.needsBossReward(save, y - 1)) out.push('boss');
    return out;
  };
  RS.torresRewardChoices = function (save) {
    const b = save.career.build;
    return RS.TORRES_REWARDS.filter((r) => r.id !== 'mate' || !RS.allMates(b).some((m) => RS.samePerson(m.id, 'torresmate')))
      .map((r) => Object.assign({ kind: 'reward', tag: '토레쓰 보상' }, r));
  };
  RS.applyTorresReward = function (save, card, rng) {
    const b = save.career.build, info = { card: card.id };
    if (card.id === 'mate') {
      if (!RS.addMate(b, 'torresmate', 5)) { // a full squad: he takes the weakest bench place
        let lo = 0;
        for (let i = 1; i < b.bench.length; i++) if (RS.mateValue(b.bench[i].id, b.bench[i].lv) < RS.mateValue(b.bench[lo].id, b.bench[lo].lv)) lo = i;
        b.bench[lo] = { id: 'torresmate', lv: 5 };
      }
      info.mate = 'torresmate';
    } else if (card.id === 'weapon') {
      const res = RS.openBox(b, RS.rollWeapon(b, rng, RS.TORRES_WEAPON_ODDS), { cost: 0 });
      info.weapon = res.w; info.kept = res.kept;
      if (!res.kept) save.meta.coins += 500; // a copy no better than his own: the fee instead
    } else if (card.id === 'coins') save.meta.coins += 500;
    save.career.torresReward = null;
    return info;
  };

  // New career lap after beating the rival or after a bad ending (meta upgrades are kept).
  RS.newCareer = function (save) {
    const laps = save.career.laps + (save.career.finished ? 1 : 0);
    const hero = save.career.build.hero;
    save.career = RS.newSave().career;
    save.career.build = RS.dressBuild(save, RS.newBuild(hero));
    save.career.laps = laps;
    RS.selectHero(hero, save.career.build);
    RS.grantCupRewards(save);
  };

  // ---------------------------------------------------------------- shop
  RS.metaCost = function (id, lv) {
    const m = RS.META[id];
    if (lv >= m.max) return null;
    if (m.ballon) return { ballons: m.ballon[lv] };
    return { coins: m.cost[lv] };
  };
  RS.buyMeta = function (save, id) {
    const m = RS.META[id];
    if (!m) return false;
    const lv = save.meta.upgrades[id] || 0;
    const cost = RS.metaCost(id, lv);
    if (!cost) return false;
    if (cost.coins != null) { if (save.meta.coins < cost.coins) return false; save.meta.coins -= cost.coins; }
    if (cost.ballons != null) { if (save.meta.ballons < cost.ballons) return false; save.meta.ballons -= cost.ballons; }
    save.meta.upgrades[id] = lv + 1;
    return true;
  };

  // ---------------------------------------------------------------- 훈련장 weapons and squad (round 11)
  // Coin sinks that never run out: 무기 상자 (일반 to 희귀 only, round 13), 무기 강화 (odds fall with every step; a
  // failure only costs the coins) and teammate training. They change the career build (replays keep their own
  // snapshots).
  RS.buyBox = function (save, boxId, rng) {
    const d = RS.WEAPON_BOXES.find((x) => x.id === boxId);
    if (!d || save.meta.coins < d.cost) return null;
    save.meta.coins -= d.cost;
    const b = save.career.build, res = RS.openBox(b, RS.rollWeapon(b, rng, d.odds), d);
    save.meta.coins += res.refund;
    return res;
  };
  RS.enhanceCost = (w) => (w.p >= RS.PLUS_MAX ? null : RS.ENHANCE.cost[RS.clampGrade(w.g)] * w.p);
  RS.enhanceOdds = (w) => (w.p >= RS.PLUS_MAX ? 0 : RS.ENHANCE.odds[w.p - 1]);
  RS.buyEnhance = function (save, rng) {
    const b = save.career.build, w = b.weapon, cost = RS.enhanceCost(w);
    if (cost == null || save.meta.coins < cost) return null;
    save.meta.coins -= cost;
    const ok = rng() < RS.enhanceOdds(w);
    if (ok) RS.enhanceWeapon(b, 1);
    return { ok, p: b.weapon.p, cost };
  };
  RS.mateTrainCost = (m) => (m.lv >= RS.MATE_MAX_LV ? null : RS.MATE_ENHANCE * m.lv * (1 + RS.mateGrade(m.id)));
  RS.buyMateTrain = function (save, id) {
    const m = RS.allMates(save.career.build).find((x) => x.id === id), cost = m && RS.mateTrainCost(m);
    if (cost == null || save.meta.coins < cost) return false;
    save.meta.coins -= cost;
    m.lv++;
    return true;
  };
})(globalThis.RS = globalThis.RS || {});
(globalThis.RS_FILES = globalThis.RS_FILES || {}).career = 'R16';
