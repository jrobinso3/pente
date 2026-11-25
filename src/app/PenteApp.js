import {
  BLACK,
  WHITE,
  DIRS,
  AI_PROFILES,
  BEAD_THEMES,
  WIN_CONGRATS,
  LOSS_TIPS,
  ACHIEVEMENTS,
  STORY_CHAPTERS,
  MENTOR_CURRICULUM,
  pickRandom,
  coordLabel
} from '../config/constants.js';
import { PenteGame } from '../engine/PenteGame.js';
import { PenteAI } from '../engine/PenteAI.js';
import { SoundFX } from '../audio/SoundFX.js';
import { ProfileStore } from '../state/ProfileStore.js';
import { PeerSession } from '../net/PeerSession.js';
import { BoardRenderer } from '../ui/BoardRenderer.js';
import { MentorCoach } from '../ui/MentorCoach.js';
import { ModalManager } from '../ui/ModalManager.js';

/**
 * Main Pente application controller orchestrating game engine, AI, audio, UI, and modals.
 */
export class PenteApp {
  constructor() {
    this.game = new PenteGame();
    this.ai = new PenteAI();
    this.sfx = new SoundFX();
    this.profileStore = new ProfileStore();
    this._toastTimer = null;

    this.state = {
      humanColor: BLACK,
      aiColor: WHITE,
      tier: 'novice',
      confirmMode: false,
      mentorMode: false,
      mentorShowOverlay: true,
      mentorBestMove: null,
      mentorAltMove: null,
      mentorDrill: null,
      mentorDrillIdx: 0,
      zoom: 1,
      panX: 0,
      panY: 0,
      aimPoint: null,
      previewPoint: null,
      hintPoint: null,
      aiThinking: false,
      captureFlash: [],
      boardPx: 400,
      shopTab: 'opponents',
      gameMode: 'free',
      puzzleSolved: false,
      currentPuzzle: null,
      storyChapterIdx: 0,
      profile: this.profileStore.data
    };

    this.els = this._queryElements();
    this.showToast = this.showToast.bind(this);
    this.updateHUD = this.updateHUD.bind(this);
    this.startNewGame = this.startNewGame.bind(this);

    this.renderer = new BoardRenderer({
      canvas: this.els.canvas,
      boardContainer: this.els.boardContainer,
      boardWrapper: this.els.boardWrapper,
      game: this.game,
      state: this.state,
      sfx: this.sfx,
      onSelectIntersection: (r, c) => this.executeHumanMove(r, c),
      onInvalidMove: () => this.showToast('Invalid intersection'),
      onPreviewSelected: () => this.updateHUD()
    });

    this.mentorCoach = new MentorCoach({
      game: this.game,
      ai: this.ai,
      state: this.state,
      els: this.els,
      profileStore: this.profileStore,
      showToast: this.showToast,
      updateHUD: this.updateHUD,
      resizeBoard: () => this.renderer.resize()
    });

    this.modals = new ModalManager({
      game: this.game,
      state: this.state,
      els: this.els,
      profileStore: this.profileStore,
      mentorCoach: this.mentorCoach,
      renderer: this.renderer,
      onStartNewGame: this.startNewGame,
      onUpdateHUD: this.updateHUD,
      showToast: this.showToast
    });

    this.peer = new PeerSession({
      onStateChange: (st) => this.modals.setP2PStatus(st),
      onOpen: () => this._onPeerOpen(),
      onMessage: (msg) => this._onPeerMessage(msg),
      onClose: () => {
        if (this.state.gameMode === 'p2p') {
          this.showToast('Peer disconnected', 3000);
          this.updateHUD();
        }
      },
      onError: () => this.showToast('WebRTC connection error')
    });
    this.modals.setPeerSession(this.peer);

    this._bindToolbarEvents();
  }

  init() {
    this.profileStore.load();
    this.state.profile = this.profileStore.data;
    this.renderer.resize();
    this.startNewGame();

    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      this.modals.openP2PModal('join', room);
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch (e) {}
    }
  }

  showToast(msg, duration = 2200) {
    this.els.statusToast.textContent = msg;
    this.els.statusToast.classList.remove('opacity-0');
    this.els.statusToast.classList.add('opacity-100');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.els.statusToast.classList.remove('opacity-100');
      this.els.statusToast.classList.add('opacity-0');
    }, duration);
  }

  speakAI(category) {
    const prof = AI_PROFILES[this.state.tier];
    if (!prof) return;
    this.els.aiDialogueSpeaker.textContent = `${prof.name}:`;
    let line = prof.quoteStart;
    if (category === 'start' && this.state.profile.lastOutcome) {
      const lo = this.state.profile.lastOutcome;
      if (lo.won) {
        line = lo.reasonType === 'captures'
          ? '"Still thinking about those 5 captures last game—watch out this time!"'
          : '"You got me with 5-in-a-row last game. Let\'s see what you\'ve got now!"';
      } else {
        line = lo.reasonType === 'captures'
          ? '"Remember last game\'s tip: guard your pairs so I can\'t snatch 5 again!"'
          : '"Remember last game\'s tip: block open threes early this round!"';
      }
    } else if (category && prof.quotes && prof.quotes[category]) {
      const pool = prof.quotes[category];
      line = pool[Math.floor(Math.random() * pool.length)];
    }
    this.els.aiDialogueText.textContent = line;
  }

  updateHUD() {
    const { state, game, els } = this;
    const isPuzzle = state.gameMode === 'puzzle';
    const isLocal2P = state.gameMode === 'local2p';
    const isP2P = state.gameMode === 'p2p';
    const profile = AI_PROFILES[state.tier];
    els.humanNameLabel.textContent = isLocal2P ? 'Player 1' : 'You';
    els.aiNameLabel.textContent = isLocal2P ? 'Player 2' : isP2P ? 'Peer' : `${profile.name}`;
    const tags = [];
    if (game.tournamentRule) tags.push('Tournament');
    if (game.adjacentOnly) tags.push('Adjacent');
    if (game.keryoRule) tags.push('Keryo');
    if (game.noCaptures) tags.push('No-Cap');
    els.modeSubtitle.textContent = isPuzzle
      ? 'Puzzle Mode'
      : isLocal2P
        ? 'Pass & Play' + (tags.length ? ` • ${tags.join(', ')}` : '')
        : isP2P
          ? 'Online P2P' + (tags.length ? ` • ${tags.join(', ')}` : '')
          : `vs ${profile.name}` + (tags.length ? ` • ${tags.join(', ')}` : '');

    els.aiAvatarImg.classList.toggle('hidden', isLocal2P || isP2P);
    els.aiAvatarImg.src = profile.avatar;
    els.pointsBalance.textContent = `$${state.profile.points}`;
    els.homeCoinsBalance.textContent = `$${state.profile.points}`;
    els.homeAchCount.textContent = `${state.profile.unlocked.length}/${ACHIEVEMENTS.length}`;
    const beadSet = BEAD_THEMES[state.profile.activeBead] || BEAD_THEMES.classic;
    const leftColor = isLocal2P ? BLACK : state.humanColor;
    const rightColor = isLocal2P ? WHITE : state.aiColor;
    els.humanStoneBadge.style.background = leftColor === BLACK ? beadSet.p1.css : beadSet.p2.css;
    els.aiStoneBadge.style.background = rightColor === BLACK ? beadSet.p1.css : beadSet.p2.css;

    const hCaps = game.captures[leftColor];
    const aCaps = game.captures[rightColor];
    els.humanCapCount.textContent = hCaps;
    els.aiCapCount.textContent = aCaps;

    this._renderPips(els.humanPips, hCaps, rightColor);
    this._renderPips(els.aiPips, aCaps, leftColor);

    const humanTurn = game.winner === 0 && game.turn === leftColor;
    const aiTurn = game.winner === 0 && game.turn === rightColor;

    els.humanTurnTag.classList.toggle('hidden', !humanTurn);
    els.aiTurnTag.classList.toggle('hidden', !aiTurn);
    els.cardHuman.classList.toggle('opacity-100', humanTurn);
    els.cardHuman.classList.toggle('opacity-70', !humanTurn);
    els.cardAI.classList.toggle('opacity-100', aiTurn);
    els.cardAI.classList.toggle('opacity-70', !aiTurn);

    els.moveCountBadge.textContent = game.moveCount + 1;
    els.btnUndo.disabled = isP2P || game.history.length === 0 || state.aiThinking;
    els.btnHint.disabled = isP2P || game.winner !== 0 || state.aiThinking || (!isLocal2P && game.turn !== state.humanColor);

    els.matchPlayersStrip.classList.toggle('hidden', isPuzzle);
    els.aiDialogueBox.classList.toggle('hidden', isPuzzle);
    if (isLocal2P) {
      const activeName = game.turn === BLACK ? 'Player 1' : 'Player 2';
      els.aiDialogueSpeaker.textContent = `${activeName}'s turn`;
      els.aiDialogueText.textContent = game.moveCount === 0 ? 'Open on the center point' : 'Tap an intersection to place a bead';
    } else if (isP2P) {
      els.aiDialogueSpeaker.textContent = this.peer.connected
        ? (game.turn === state.humanColor ? 'Your turn' : "Peer's turn")
        : 'Disconnected';
      els.aiDialogueText.textContent = this.peer.connected ? 'WebRTC P2P connected' : 'Peer left the match';
    }
    els.puzzleBar.classList.toggle('hidden', !isPuzzle);
    els.btnMentor.classList.toggle('hidden', isPuzzle || isLocal2P || isP2P);
    els.btnNewGame.textContent = (isPuzzle && state.puzzleSolved) ? 'Next' : 'New';

    const isStory = state.gameMode === 'story';
    els.storyBanner.classList.toggle('hidden', !isStory);
    els.btnStory.classList.toggle('border-[#161616]/40', isStory);
    if (isStory) {
      const ch = STORY_CHAPTERS[state.storyChapterIdx] || STORY_CHAPTERS[0];
      els.storyChapterBadge.textContent = ch.badge;
      els.storyChapterTitle.textContent = ch.title;
      els.storyChapterLine.textContent = ch.story;
    }

    const curr = MENTOR_CURRICULUM[state.tier] || MENTOR_CURRICULUM.novice;
    els.mentorLevelBadge.textContent = curr.badge;
    els.mentorPanel.classList.toggle('hidden', !state.mentorMode || isPuzzle);
    els.btnMentor.classList.toggle('bg-[#161616]', state.mentorMode);
    els.btnMentor.classList.toggle('text-white', state.mentorMode);
    els.btnMentor.classList.toggle('text-[#161616]', !state.mentorMode);
    els.btnMentorOverlay.textContent = state.mentorShowOverlay ? 'Hide ★' : 'Show ★';

    if (state.confirmMode && state.previewPoint && humanTurn) {
      els.confirmBar.classList.remove('hidden');
      els.confirmBar.classList.add('flex');
      els.confirmCoordLabel.textContent = `Selected: ${coordLabel(state.previewPoint.r, state.previewPoint.c)}`;
    } else {
      els.confirmBar.classList.add('hidden');
      els.confirmBar.classList.remove('flex');
    }
  }

  _renderPips(container, count, capturedStoneColor) {
    container.innerHTML = '';
    const beadSet = BEAD_THEMES[this.state.profile.activeBead] || BEAD_THEMES.classic;
    const pStyle = capturedStoneColor === BLACK ? beadSet.p1 : beadSet.p2;
    for (let i = 0; i < 5; i++) {
      const div = document.createElement('div');
      const filled = i < count;
      div.className = `pip ${filled ? 'pip-glass-filled' : 'pip-empty'}`;
      if (filled) {
        div.style.background = [
          'radial-gradient(ellipse 42% 28% at 34% 26%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.25) 60%, rgba(255,255,255,0) 100%)',
          `radial-gradient(circle at 66% 70%, ${pStyle.caustic} 0%, rgba(255,255,255,0) 58%)`,
          `radial-gradient(circle at 46% 44%, ${pStyle.c0} 0%, ${pStyle.c1} 46%, ${pStyle.c2} 78%, ${pStyle.c3} 100%)`
        ].join(', ');
        div.style.border = `1px solid ${pStyle.edge}`;
        div.style.boxShadow = `0 2px 5px rgba(20, 14, 8, 0.28), 0 1px 3px ${pStyle.c2}, inset 0 -1px 2px ${pStyle.rim}`;
      }
      container.appendChild(div);
    }
  }

  executeHumanMove(r, c) {
    const { state, game } = this;
    const isLocal2P = state.gameMode === 'local2p';
    if (state.aiThinking || game.winner !== 0 || (!isLocal2P && game.turn !== state.humanColor)) return;
    if (!game.isLegalMove(r, c)) {
      if (game.moveCount === 0) this.showToast('First stone must be placed on the center point');
      else if (game.tournamentRule && game.moveCount === 2) this.showToast('Tournament rule: play outside the dashed center box');
      else if (game.adjacentOnly) this.showToast('Adjacent mode: play next to an existing stone');
      return;
    }

    state.hintPoint = null;
    state.previewPoint = null;
    state.aimPoint = null;

    const movingPlayer = game.turn;
    const oppPlayer = movingPlayer === BLACK ? WHITE : BLACK;
    const rec = game.makeMove(r, c);
    this.sfx.playStone();
    if (!isLocal2P) {
      this.mentorCoach.evaluateHumanMove(r, c, rec);
    }

    if (rec.capturedStones.length > 0) {
      this.sfx.playCapture();
      this.renderer.triggerCaptureFlash(rec.capturedStones, oppPlayer);
      const who = isLocal2P ? (movingPlayer === BLACK ? 'Player 1' : 'Player 2') : 'You';
      this.showToast(`${who} captured ${rec.pairsGained} pair${rec.pairsGained > 1 ? 's' : ''}!`);
      if (!isLocal2P) {
        this.profileStore.unlockAchievement('first_cap');
        if (rec.pairsGained >= 2) this.profileStore.unlockAchievement('multi_cap');
        this.speakAI('humanCap');
      }
    } else if (!isLocal2P) {
      let maxLine = 1;
      for (let d = 0; d < 4; d++) {
        const info = this.ai.lineStatsAt(game, r, c, DIRS[d][0], DIRS[d][1], state.humanColor);
        if (info.count > maxLine) maxLine = info.count;
      }
      if (maxLine >= 3) this.speakAI('humanThreat');
    }

    state.mentorDrill = null;
    if (!isLocal2P) {
      this.speakAI('start');
      this.mentorCoach.analyzeTurn();
    }
    this.updateHUD();
    this.renderer.resize();

    if (game.winner !== 0) {
      if (state.gameMode === 'p2p') {
        this.peer.send({ type: 'move', r, c });
      }
      if (state.gameMode !== 'puzzle') {
        this.finishGame();
      }
      return;
    }

    if (state.gameMode === 'p2p') {
      this.peer.send({ type: 'move', r, c });
      return;
    }

    if (state.gameMode !== 'puzzle' && !isLocal2P) {
      this.scheduleAIMove();
    }
  }

  scheduleAIMove() {
    const { state, game } = this;
    state.aiThinking = true;
    this.updateHUD();
    setTimeout(() => {
      try {
        const best = this.ai.chooseMove(game, state.tier);
        state.aiThinking = false;
        if (best) {
          const rec = game.makeMove(best.r, best.c);
          this.sfx.playStone();
          if (rec && rec.capturedStones.length > 0) {
            this.sfx.playCapture();
            this.renderer.triggerCaptureFlash(rec.capturedStones, state.humanColor);
            this.showToast(`${AI_PROFILES[state.tier].name} captured ${rec.pairsGained} pair${rec.pairsGained > 1 ? 's' : ''}!`);
            this.speakAI('aiCap');
          } else {
            let maxAiLine = 1;
            for (let d = 0; d < 4; d++) {
              const info = this.ai.lineStatsAt(game, best.r, best.c, DIRS[d][0], DIRS[d][1], state.aiColor);
              if (info.count > maxAiLine) maxAiLine = info.count;
            }
            if (maxAiLine >= 3) this.speakAI('aiThreat');
            else if (game.moveCount % 6 === 0) this.speakAI('banter');
          }
        }
      } finally {
        state.aiThinking = false;
        this.mentorCoach.analyzeTurn();
        this.updateHUD();
        this.renderer.draw();
        if (game.winner !== 0) {
          this.finishGame();
        }
      }
    }, 60);
  }

  finishGame() {
    const { state, game, els } = this;
    if (state.gameMode === 'local2p' || state.gameMode === 'p2p') {
      const isP2P = state.gameMode === 'p2p';
      const p1Won = game.winner === BLACK;
      const humanWon = isP2P ? (game.winner === state.humanColor) : true;
      this.sfx.playWin(humanWon);
      els.winBadgeIcon.textContent = 'Π';
      els.winTitle.textContent = isP2P
        ? (humanWon ? 'You Win' : 'Peer Wins')
        : (p1Won ? 'Player 1 Wins' : 'Player 2 Wins');
      els.winReason.textContent = game.winReason;
      els.winQuoteBox.classList.add('hidden');
      els.statMoves.textContent = game.moveCount;
      els.statHumanCaps.textContent = game.captures[isP2P ? state.humanColor : BLACK];
      els.statAICaps.textContent = game.captures[isP2P ? state.aiColor : WHITE];
      els.btnBackToProgress.textContent = 'Main Menu';
      this.updateHUD();
      els.gameOverModal.classList.remove('hidden');
      els.gameOverModal.classList.add('flex');
      return;
    }
    els.winQuoteBox.classList.remove('hidden');
    const humanWon = game.winner === state.humanColor;
    const prof = AI_PROFILES[state.tier];
    this.sfx.playWin(humanWon);
    els.winBadgeIcon.textContent = humanWon ? '🏆' : '♟️';
    els.winTitle.textContent = humanWon ? 'Victory!' : `${prof.name} Wins`;
    els.winReason.textContent = game.winReason;
    const reasonType = (game.winLine && game.winLine.length >= 5) ? 'five_row' : 'captures';
    const outcomeLine = humanWon ? pickRandom(WIN_CONGRATS[reasonType]) : pickRandom(LOSS_TIPS[reasonType]);
    state.profile.lastOutcome = { won: humanWon, reasonType, tier: state.tier, oppName: prof.name, line: outcomeLine };
    this.profileStore.save();

    els.winAvatarImg.src = prof.avatar;
    els.winCharQuote.textContent = outcomeLine;
    els.statMoves.textContent = game.moveCount;
    els.statHumanCaps.textContent = game.captures[state.humanColor];
    els.statAICaps.textContent = game.captures[state.aiColor];

    if (humanWon) {
      state.profile.points += prof.winPrize;
      this.profileStore.save();
      els.winReason.textContent = `${game.winReason} • Earned +$${prof.winPrize}`;
      this.showToast(`🏆 Victory! Won +$${prof.winPrize}`, 2800);
      this.profileStore.unlockAchievement('first_win');
      if (game.captures[state.humanColor] >= 5) this.profileStore.unlockAchievement('five_cap_win');
      if (game.winLine && game.winLine.length >= 6) this.profileStore.unlockAchievement('overkill_6');
      this.profileStore.unlockAchievement('beat_' + state.tier);
    } else {
      const lost = Math.min(state.profile.points, prof.losePenalty || 0);
      state.profile.points = Math.max(0, state.profile.points - lost);
      this.profileStore.save();
      els.winReason.textContent = lost > 0 ? `${game.winReason} • Lost -$${lost}` : game.winReason;
      if (lost > 0) this.showToast(`💸 Defeat! Lost -$${lost}`, 2800);
    }

    if (state.gameMode === 'story' && humanWon) {
      const ch = STORY_CHAPTERS[state.storyChapterIdx];
      if (ch && !state.profile.storyCleared.includes(ch.id)) {
        state.profile.storyCleared.push(ch.id);
        state.profile.points += ch.reward;
        this.profileStore.save();
        this.showToast(`📖 ${ch.badge} Cleared! +$${ch.reward}`, 3200);
      }
      if (state.profile.storyCleared.length >= STORY_CHAPTERS.length) {
        this.profileStore.unlockAchievement('story_champion');
        els.winTitle.textContent = 'Grandmaster Crowned!';
      }
    }

    els.btnBackToProgress.textContent = state.gameMode === 'story' ? 'Progress →' : 'Main Menu →';
    this.updateHUD();
    els.gameOverModal.classList.remove('hidden');
    els.gameOverModal.classList.add('flex');
  }

  startNewGame(fromRemote = false) {
    const { state, game, els } = this;
    const rules = {
      tournamentRule: els.chkTournament.checked,
      adjacentOnly: els.chkAdjacentOnly.checked,
      keryoRule: els.chkKeryo.checked,
      noCaptures: els.chkNoCaptures.checked
    };
    game.reset(rules);

    state.aimPoint = null;
    state.previewPoint = null;
    state.hintPoint = null;
    state.aiThinking = false;

    els.gameOverModal.classList.add('hidden');
    els.gameOverModal.classList.remove('flex');
    this.updateHUD();
    this.renderer.draw();

    if (state.gameMode === 'p2p') {
      if (!fromRemote && this.peer.connected) {
        this.peer.send({ type: 'new_game', rules });
      }
      this.showToast(game.turn === state.humanColor ? 'P2P Match — Your turn to open' : 'P2P Match — Waiting for peer');
    } else if (state.gameMode === 'local2p') {
      this.showToast('Pass & Play — Player 1 opens on center');
    } else if (game.turn === state.aiColor) {
      this.scheduleAIMove();
    } else {
      this.showToast('Your turn — open on the center point');
    }
  }

  _onPeerOpen() {
    const { state, els } = this;
    state.gameMode = 'p2p';
    state.mentorMode = false;
    this.modals.closeP2PModal();
    els.homeMenu.classList.add('hidden');
    if (this.peer.role === 'host') {
      state.humanColor = BLACK;
      state.aiColor = WHITE;
      const rules = {
        tournamentRule: els.chkTournament.checked,
        adjacentOnly: els.chkAdjacentOnly.checked,
        keryoRule: els.chkKeryo.checked,
        noCaptures: els.chkNoCaptures.checked
      };
      this.peer.send({ type: 'hello', rules });
      this.startNewGame(true);
    } else {
      state.humanColor = WHITE;
      state.aiColor = BLACK;
      this.startNewGame(true);
    }
    this.showToast('WebRTC P2P connected!');
  }

  _onPeerMessage(msg) {
    const { state, game, els } = this;
    if (!msg || !msg.type) return;
    if (msg.type === 'hello' || msg.type === 'new_game') {
      if (msg.rules) {
        els.chkTournament.checked = !!msg.rules.tournamentRule;
        els.chkAdjacentOnly.checked = !!msg.rules.adjacentOnly;
        els.chkKeryo.checked = !!msg.rules.keryoRule;
        els.chkNoCaptures.checked = !!msg.rules.noCaptures;
      }
      this.startNewGame(true);
      if (msg.type === 'new_game') this.showToast('Peer started a rematch');
      return;
    }
    if (msg.type === 'move' && state.gameMode === 'p2p') {
      if (game.turn !== state.aiColor || !game.isLegalMove(msg.r, msg.c)) return;
      const rec = game.makeMove(msg.r, msg.c);
      this.sfx.playStone();
      if (rec && rec.capturedStones.length > 0) {
        this.sfx.playCapture();
        this.renderer.triggerCaptureFlash(rec.capturedStones, state.humanColor);
        this.showToast(`Peer captured ${rec.pairsGained} pair${rec.pairsGained > 1 ? 's' : ''}!`);
      }
      this.updateHUD();
      this.renderer.draw();
      if (game.winner !== 0) {
        this.finishGame();
      }
    }
  }

  _startNextPuzzle() {
    const { state } = this;
    const cur = state.currentPuzzle;
    if (!cur) return;
    const pack = MENTOR_CURRICULUM[cur.tierKey];
    if (pack && cur.idx + 1 < pack.drills.length) {
      this.modals.startSpecificPuzzle(cur.tierKey, cur.idx + 1);
      return;
    }
    const keys = Object.keys(MENTOR_CURRICULUM);
    const startPos = keys.indexOf(cur.tierKey);
    for (let offset = 1; offset <= keys.length; offset++) {
      const nextKey = keys[(startPos + offset) % keys.length];
      if (state.profile.ownedPuzzlePacks.includes(nextKey) && MENTOR_CURRICULUM[nextKey].drills.length > 0) {
        this.modals.startSpecificPuzzle(nextKey, 0);
        return;
      }
    }
    this.modals.startSpecificPuzzle(cur.tierKey, 0);
  }

  _bindToolbarEvents() {
    const { state, game, els } = this;

    els.btnConfirmMove.addEventListener('click', () => {
      if (state.previewPoint) this.executeHumanMove(state.previewPoint.r, state.previewPoint.c);
    });
    els.btnCancelPreview.addEventListener('click', () => {
      state.previewPoint = null;
      this.updateHUD();
      this.renderer.draw();
    });

    els.btnZoom.addEventListener('click', () => {
      if (state.zoom === 1) {
        state.zoom = 1.65;
        els.zoomLabel.textContent = '1.6×';
        this.showToast('Zoomed in — drag to pan, tap to place');
      } else {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        els.zoomLabel.textContent = '1×';
      }
      this.renderer.draw();
    });

    els.btnSound.addEventListener('click', () => {
      this.sfx.enabled = !this.sfx.enabled;
      els.btnSound.textContent = this.sfx.enabled ? 'Sound: On' : 'Sound: Muted';
    });

    els.btnNewGame.addEventListener('click', () => {
      if (state.gameMode === 'puzzle' && state.currentPuzzle) {
        if (state.puzzleSolved) {
          this._startNextPuzzle();
        } else {
          this.modals.startSpecificPuzzle(state.currentPuzzle.tierKey, state.currentPuzzle.idx);
        }
        return;
      }
      this.startNewGame(false);
    });
    els.btnPlayAgain.addEventListener('click', () => this.startNewGame(false));
    els.btnReviewBoard.addEventListener('click', () => {
      els.gameOverModal.classList.add('hidden');
      els.gameOverModal.classList.remove('flex');
    });

    els.btnUndo.addEventListener('click', () => {
      if (state.aiThinking || game.history.length === 0) return;
      game.undoMove();
      if (state.gameMode !== 'local2p' && game.history.length > 0 && game.turn === state.aiColor) {
        game.undoMove();
      }
      state.hintPoint = null;
      state.previewPoint = null;
      this.mentorCoach.analyzeTurn();
      this.updateHUD();
      this.renderer.draw();
    });

    els.btnHint.addEventListener('click', () => {
      const isLocal2P = state.gameMode === 'local2p';
      if (state.aiThinking || game.winner !== 0 || (!isLocal2P && game.turn !== state.humanColor)) return;
      const best = this.ai.chooseMove(game, 'master');
      if (best) {
        state.hintPoint = { r: best.r, c: best.c };
        this.showToast(`Suggested move: ${coordLabel(best.r, best.c)}`);
        this.renderer.draw();
      }
    });

    els.btnMentor.addEventListener('click', () => {
      state.mentorMode = !state.mentorMode;
      if (state.mentorMode) this.mentorCoach.analyzeTurn();
      else {
        state.mentorBestMove = null;
        state.mentorAltMove = null;
        state.mentorDrill = null;
      }
      this.updateHUD();
      this.renderer.resize();
    });
    els.btnMentorOverlay.addEventListener('click', () => {
      state.mentorShowOverlay = !state.mentorShowOverlay;
      this.updateHUD();
      this.renderer.draw();
    });
    els.btnMentorDrill.addEventListener('click', () => this.mentorCoach.loadDrill());

    window.addEventListener('resize', () => this.renderer.resize());
  }

  _queryElements() {
    const ids = [
      'boardContainer', 'boardWrapper', 'cardHuman', 'cardAI',
      'humanStoneBadge', 'aiStoneBadge', 'humanTurnTag', 'aiTurnTag',
      'humanCapCount', 'aiCapCount', 'humanPips', 'aiPips',
      'aiNameLabel', 'modeSubtitle', 'moveCountBadge', 'statusToast',
      'confirmBar', 'confirmCoordLabel', 'btnConfirmMove', 'btnCancelPreview',
      'btnZoom', 'zoomLabel', 'btnSound', 'btnNewGame', 'btnUndo', 'btnHint',
      'btnRules', 'btnSettings', 'gameOverModal', 'winBadgeIcon', 'winTitle',
      'winReason', 'statMoves', 'statHumanCaps', 'statAICaps',
      'btnReviewBoard', 'btnPlayAgain', 'setupModal', 'btnCloseSetup',
      'btnApplyStart', 'btnSideBlack', 'btnSideWhite', 'homeMenu',
      'homeCoinsBalance', 'btnHomeCoins', 'btnHomeStory', 'btnHomeFreePlay', 'btnHomeLocal2P', 'btnHomeP2P',
      'btnHomePuzzles', 'btnHomeShop', 'btnHomeAchievements', 'homeAchCount',
      'humanNameLabel', 'winQuoteBox',
      'p2pModal', 'p2pStatusText', 'btnCloseP2P', 'btnP2PTabHost', 'btnP2PTabJoin',
      'p2pHostPane', 'p2pJoinPane', 'btnP2PCreateRoom', 'p2pRoomBox', 'p2pRoomCodeText',
      'btnP2PCopyLink', 'btnP2PCopyCode', 'p2pRoomInput', 'btnP2PJoinRoom',
      'achievementsModal', 'achModalCount', 'achCoinsDisplay',
      'btnCloseAchievements', 'achievementsBody', 'btnHomeRules', 'btnGoHome',
      'puzzlesModal', 'puzzlesCoinsDisplay', 'btnClosePuzzles', 'puzzlesBody',
      'btnStory', 'storyModal', 'btnCloseStory', 'storyChapterList',
      'storyCoinsDisplay', 'btnModeFreePlay', 'btnModeDrills', 'storyBanner',
      'storyChapterBadge', 'storyChapterTitle', 'storyChapterLine',
      'btnExitStory', 'btnNextChapter', 'btnBackToProgress', 'storyIntroModal',
      'introChapterBadge', 'introChapterTitle', 'introAvatarImg',
      'introSpeaker', 'introSubtitle', 'introBeatText', 'introDots',
      'btnIntroNext', 'btnSkipIntro', 'btnShop', 'pointsBalance', 'shopModal',
      'shopPointsDisplay', 'btnCloseShop', 'shopBody', 'matchPlayersStrip',
      'puzzleBar', 'puzzleBarTitle', 'puzzleBarPrompt', 'btnOpenPuzzleList',
      'aiAvatarImg', 'aiDialogueBox', 'aiDialogueSpeaker', 'aiDialogueText',
      'winAvatarImg', 'winCharQuote', 'btnMentor', 'mentorPanel',
      'mentorLevelBadge', 'mentorHeadline', 'mentorAdvice', 'btnMentorDrill',
      'btnMentorOverlay', 'chkMentorMode', 'chkConfirmMode', 'chkTournament',
      'chkAdjacentOnly', 'chkKeryo', 'chkNoCaptures', 'btnHomeRulesets',
      'rulesModal', 'btnCloseRules', 'btnGotItRules'
    ];
    const els = { canvas: document.getElementById('penteCanvas') };
    for (const id of ids) {
      els[id] = document.getElementById(id);
    }
    return els;
  }
}
