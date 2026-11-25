import {
  CENTER,
  BLACK,
  WHITE,
  DIRS,
  AI_PROFILES,
  MENTOR_CURRICULUM,
  coordLabel
} from '../config/constants.js';

/**
 * Provides real-time move coaching, tactical explanations, and interactive puzzle drills.
 */
export class MentorCoach {
  constructor({ game, ai, state, els, profileStore, showToast, updateHUD, resizeBoard }) {
    this.game = game;
    this.ai = ai;
    this.state = state;
    this.els = els;
    this.profileStore = profileStore;
    this.showToast = showToast;
    this.updateHUD = updateHUD;
    this.resizeBoard = resizeBoard;
  }

  analyzeTurn() {
    const { state, game, els } = this;
    if (!state.mentorMode || game.winner !== 0 || game.turn !== state.humanColor) {
      state.mentorBestMove = null;
      state.mentorAltMove = null;
      return;
    }
    if (game.moveCount === 0) {
      state.mentorBestMove = { r: CENTER, c: CENTER };
      state.mentorAltMove = null;
      const curr = MENTOR_CURRICULUM[state.tier] || MENTOR_CURRICULUM.novice;
      els.mentorHeadline.textContent = curr.title;
      els.mentorAdvice.textContent = 'Opening rule: place your first blue bead on the center point (J10). ' + curr.intro;
      return;
    }

    const cands = this.ai.generateCandidates(game, state.humanColor);
    if (cands.length === 0) return;

    const best = this.ai.chooseMove(game, 'master');
    state.mentorBestMove = best ? { r: best.r, c: best.c } : { r: cands[0].r, c: cands[0].c };
    state.mentorAltMove = cands.length > 1 ? { r: cands[1].r, c: cands[1].c } : null;

    if (state.mentorDrill) return;

    const tip = this.describeMoveReason(state.mentorBestMove.r, state.mentorBestMove.c, state.humanColor);
    els.mentorHeadline.textContent = (MENTOR_CURRICULUM[state.tier] || MENTOR_CURRICULUM.novice).title;
    els.mentorAdvice.textContent = `Coach suggests ${coordLabel(state.mentorBestMove.r, state.mentorBestMove.c)}: ${tip}`;
  }

  describeMoveReason(r, c, color) {
    const { game, ai } = this;
    const opp = color === BLACK ? WHITE : BLACK;
    const rec = game.makeMove(r, c);
    const won = game.winner === color;
    const caps = rec ? rec.pairsGained : 0;
    game.undoMove();
    if (won) return caps > 0 ? 'this capture reaches 5 pairs and wins immediately!' : 'this completes 5-in-a-row to win!';
    if (caps > 0) return `captures ${caps} enemy pair${caps > 1 ? 's' : ''} and opens the board.`;

    let maxOwn = 1, ownOpen = 0, maxOpp = 1, oppOpen = 0;
    for (let d = 0; d < 4; d++) {
      const oInfo = ai.lineStatsAt(game, r, c, DIRS[d][0], DIRS[d][1], color);
      if (oInfo.count > maxOwn || (oInfo.count === maxOwn && oInfo.openEnds > ownOpen)) {
        maxOwn = oInfo.count; ownOpen = oInfo.openEnds;
      }
      const eInfo = ai.lineStatsAt(game, r, c, DIRS[d][0], DIRS[d][1], opp);
      if (eInfo.count > maxOpp || (eInfo.count === maxOpp && eInfo.openEnds > oppOpen)) {
        maxOpp = eInfo.count; oppOpen = eInfo.openEnds;
      }
    }
    if (maxOpp >= 4) return 'blocks an immediate 5-in-a-row threat!';
    if (maxOwn === 4 && ownOpen === 2) return 'creates an unstoppable open four (tessera)!';
    if (maxOpp === 3 && oppOpen === 2) return 'blocks an open three before it becomes a tessera.';
    if (maxOwn === 3 && ownOpen === 2) return 'builds a strong open three to seize the initiative.';
    if (maxOwn === 4) return 'forces the opponent to answer a 4-in-a-row.';
    return 'develops central influence and connects your stones.';
  }

  evaluateHumanMove(r, c, rec) {
    const { state, game, els } = this;
    if (state.gameMode === 'puzzle' && state.mentorDrill) {
      const d = state.mentorDrill;
      const hitGoal = d.goalCoord
        ? (r === d.goalCoord[0] && c === d.goalCoord[1])
        : (d.goalCoords && d.goalCoords.some(([gr, gc]) => gr === r && gc === c));
      if (hitGoal) {
        const pId = d.puzzleId || `${state.tier}_${d.title}`;
        const currPack = MENTOR_CURRICULUM[d.tierKey || state.tier] || MENTOR_CURRICULUM.novice;
        const firstSolve = !state.profile.solvedPuzzles.includes(pId);
        const payout = firstSolve ? currPack.puzzleReward : Math.round(currPack.puzzleReward * 0.25);
        state.profile.points += payout;
        if (firstSolve) state.profile.solvedPuzzles.push(pId);
        state.profile.drillsSolved = (state.profile.drillsSolved || 0) + 1;
        this.profileStore.save();
        els.puzzleBarTitle.textContent = `Solved! +$${payout}`;
        els.puzzleBarPrompt.textContent = d.successMsg;
        this.showToast(`🧩 Solved! +$${payout}`, 2800);
        if (state.profile.drillsSolved >= 3) this.profileStore.unlockAchievement('drill_scholar');
      } else {
        els.puzzleBarTitle.textContent = d.title;
        els.puzzleBarPrompt.textContent = 'Not quite — tap Undo or Hint to try again.';
      }
      state.mentorDrill = null;
      return;
    }
    if (!state.mentorMode) return;

    if (rec.pairsGained > 0) {
      els.mentorAdvice.textContent = `Great capture! You took ${rec.pairsGained} pair${rec.pairsGained > 1 ? 's' : ''} (${game.captures[state.humanColor]}/5 total).`;
      return;
    }
    if (state.mentorBestMove && (state.mentorBestMove.r !== r || state.mentorBestMove.c !== c)) {
      const bestTip = this.describeMoveReason(state.mentorBestMove.r, state.mentorBestMove.c, state.humanColor);
      if (bestTip.includes('wins') || bestTip.includes('blocks')) {
        els.mentorAdvice.textContent = `Heads up: ${coordLabel(state.mentorBestMove.r, state.mentorBestMove.c)} was critical — it ${bestTip}`;
        return;
      }
    }
    els.mentorAdvice.textContent = `Played ${coordLabel(r, c)}. Watch how ${AI_PROFILES[state.tier].name} responds!`;
  }

  loadDrill() {
    const { state, game, els } = this;
    const curr = MENTOR_CURRICULUM[state.tier] || MENTOR_CURRICULUM.novice;
    const drill = curr.drills[state.mentorDrillIdx % curr.drills.length];
    state.mentorDrillIdx++;

    game.loadPosition({
      stones: drill.stones,
      turn: drill.turn,
      humanCaps: drill.humanCaps,
      aiCaps: drill.aiCaps
    });

    state.humanColor = drill.turn;
    state.aiColor = drill.turn === BLACK ? WHITE : BLACK;
    state.mentorMode = true;
    state.mentorDrill = drill;
    state.aimPoint = null;
    state.previewPoint = null;
    state.hintPoint = null;
    state.aiThinking = false;

    const goal = drill.goalCoord || drill.goalCoords[0];
    state.mentorBestMove = { r: goal[0], c: goal[1] };
    state.mentorAltMove = null;

    els.puzzleBarTitle.textContent = drill.title;
    els.puzzleBarPrompt.textContent = drill.prompt;
    els.gameOverModal.classList.add('hidden');
    els.gameOverModal.classList.remove('flex');
    this.updateHUD();
    this.resizeBoard();
    this.showToast(drill.title);
  }
}
