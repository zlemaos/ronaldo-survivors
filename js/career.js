/* 호날두 서바이버즈 — career flow, saves and meta shop (no DOM). */
(function (RS) {
  'use strict';

  RS.SAVE_KEY = 'ronaldo-survivors.save.v1';

  RS.newSave = function () {
    return {
      version: 1,
      career: {
        yearIdx: 0, // next year to play
        cleared: [], // cleared[idx] = true
        coachDone: -1, // coach card for year idx picked when coachDone >= idx
        transferDone: -1, // transfer window for year idx handled when transferDone >= idx
        rewardDone: -1, // boss reward for year idx picked when rewardDone >= idx
        build: RS.newBuild(),
        snapshots: {}, // idx -> build at the start of that year (after the coach pick)
        finished: false,
        laps: 0
      },
      meta: { coins: 0, ballons: 0, upgrades: {}, ballonYears: [], muted: false, totalKills: 0, wins: 0 }
    };
  };

  // Load with defaults filled in; never throws.
  RS.loadSave = function (storage) {
    const d = RS.newSave();
    let raw = null;
    try { raw = storage.get(RS.SAVE_KEY); } catch (e) { raw = null; }
    if (!raw) return d;
    let s;
    try { s = JSON.parse(raw); } catch (e) { return d; }
    if (!s || typeof s !== 'object') return d;
    s.career = Object.assign(d.career, s.career || {});
    s.meta = Object.assign(d.meta, s.meta || {});
    s.version = 1;
    s.career.build = RS.normalizeBuild(s.career.build);
    for (const k of Object.keys(s.career.snapshots || {})) s.career.snapshots[k] = RS.normalizeBuild(s.career.snapshots[k]);
    s.career.yearIdx = Math.max(0, Math.min(RS.YEARS.length - 1, s.career.yearIdx | 0));
    for (const k of Object.keys(s.meta.upgrades)) if (!RS.META[k]) delete s.meta.upgrades[k];
    return s;
  };

  RS.writeSave = function (storage, save) {
    try { storage.set(RS.SAVE_KEY, JSON.stringify(save)); return true; } catch (e) { return false; }
  };

  RS.yearAge = (idx) => RS.YEARS[idx].year - RS.BIRTH_YEAR;

  // Can this year be played? Cleared years can be replayed; the current year can be played.
  RS.canPlay = function (save, idx) {
    const c = save.career;
    if (idx < 0 || idx >= RS.YEARS.length) return false;
    return idx <= c.yearIdx || !!c.cleared[idx];
  };
  RS.isReplay = (save, idx) => idx !== save.career.yearIdx || save.career.finished;
  RS.needsCoach = (save, idx) => !RS.isReplay(save, idx) && save.career.coachDone < idx;

  // Coach cards for year idx: 2 coach cards + 1 extra (recruit or train) when possible.
  RS.coachChoices = function (save, idx, rng) {
    const yd = RS.YEARS[idx];
    const coach = RS.COACHES[yd.coach];
    const b = save.career.build;
    const pool = coach.cards.filter((c) => !b.coachCards.includes(c.id));
    const out = [];
    while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const canRecruit = !RS.squadFull(b) && RS.mateCandidates(b, idx, false).length > 0;
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
      let cands = RS.mateCandidates(c.build, idx, true);
      if (!cands.length) cands = RS.mateCandidates(c.build, idx, false);
      if (cands.length) { const id = cands[Math.floor(rng() * cands.length)]; RS.addMate(c.build, id); info.mate = id; }
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

  // Transfer window: when the club changes, era players are offered (sign into a free slot or swap with
  // a current teammate, who passes on his level). Returns up to 2 candidate ids, [] when nothing to offer.
  RS.clubChanged = (idx) => idx > 0 && RS.YEARS[idx].era !== RS.YEARS[idx - 1].era;
  RS.transferOffers = function (save, idx, rng) {
    if (RS.isReplay(save, idx) || !RS.clubChanged(idx) || save.career.transferDone >= idx) return [];
    const cands = RS.mateCandidates(save.career.build, idx, true);
    const out = [];
    while (out.length < 2 && cands.length) out.push(cands.splice(Math.floor(rng() * cands.length), 1)[0]);
    return out;
  };
  // outId: teammate to release (null = sign into a free slot). newId null = keep the squad.
  RS.applyTransfer = function (save, idx, newId, outId) {
    const b = save.career.build;
    let ok = true;
    if (newId) ok = outId ? RS.swapMate(b, outId, newId) : !!RS.addMate(b, newId);
    save.career.snapshots[idx] = RS.cloneBuild(b);
    return ok;
  };
  RS.finishTransfers = function (save, idx) { save.career.transferDone = idx; };
  // Simple policy for bots/tests: sign into free slots, otherwise replace the longest-serving teammate.
  RS.autoTransfers = function (save, idx, rng) {
    const offers = RS.transferOffers(save, idx, rng);
    for (const id of offers) {
      const b = save.career.build;
      RS.applyTransfer(save, idx, id, RS.squadFull(b) ? b.teammates[0].id : null);
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
    if (res.cleared) {
      const yd = RS.YEARS[idx];
      if (yd.ballon && !save.meta.ballonYears.includes(yd.year)) {
        save.meta.ballonYears.push(yd.year);
        save.meta.ballons += 1;
        out.ballon = 1;
      }
      if (yd.final) {
        save.meta.wins += 1;
        save.meta.ballons += 1;
        out.ballon += 1;
      }
      if (!replay) {
        const c = save.career;
        c.cleared[idx] = true;
        c.build = world.exportBuild();
        if (yd.final) { c.finished = true; out.finished = true; }
        else c.yearIdx = idx + 1;
      } else {
        save.career.cleared[idx] = true;
      }
    }
    return out;
  };

  // Boss reward: after a season boss falls (career years only) 날두 picks one trophy perk. Permanent for the career.
  RS.BOSS_REWARDS = [
    { id: 'hp', icon: '🏆', name: '트로피 체력', desc: '최대 체력 +20 (영구)' },
    { id: 'reroll', icon: '🎲', name: '베테랑의 눈', desc: '레벨업 다시 뽑기 +1 (매 시즌)' },
    { id: 'train', icon: '📈', name: '팀 훈련 캠프', desc: '선발·벤치 동료 전원 Lv.+1' },
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

  // New career lap after beating 메시 (meta upgrades are kept).
  RS.newCareer = function (save) {
    const laps = save.career.laps + (save.career.finished ? 1 : 0);
    save.career = RS.newSave().career;
    save.career.laps = laps;
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
})(globalThis.RS = globalThis.RS || {});
