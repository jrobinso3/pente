import {
  BLACK,
  WHITE,
  AI_PROFILES,
  BEAD_THEMES,
  BOARD_THEMES,
  ACHIEVEMENTS,
  STORY_CHAPTERS,
  MENTOR_CURRICULUM
} from '../config/constants.js';

/**
 * Manages all modal dialogs, story progression, shop, puzzles, achievements, and home menu navigation.
 */
export class ModalManager {
  constructor({ game, state, els, profileStore, mentorCoach, renderer, onStartNewGame, onUpdateHUD, showToast }) {
    this.game = game;
    this.state = state;
    this.els = els;
    this.profileStore = profileStore;
    this.mentorCoach = mentorCoach;
    this.renderer = renderer;
    this.onStartNewGame = onStartNewGame;
    this.onUpdateHUD = onUpdateHUD;
    this.showToast = showToast;

    this._pendingTier = state.tier;
    this._pendingSide = state.humanColor;
    this._introIdx = 0;
    this._introBeat = 0;
    this._activeIntroBeats = [];
    this.peer = null;

    this._bindEvents();
  }

  setPeerSession(peer) {
    this.peer = peer;
  }

  setP2PStatus(status) {
    const labels = {
      creating: 'Creating room…',
      waiting_guest: 'Room open — waiting for friend to join',
      connecting: 'Connecting peer-to-peer…',
      connected: 'Connected peer-to-peer',
      closed: 'Disconnected'
    };
    if (this.els.p2pStatusText) {
      this.els.p2pStatusText.textContent = labels[status] || 'Direct peer-to-peer via WebRTC';
    }
  }

  openP2PModal(tab = 'host', prefillRoom = '') {
    const { els } = this;
    this._switchP2PTab(tab);
    if (prefillRoom) {
      els.p2pRoomInput.value = prefillRoom;
    }
    this._showModal(els.p2pModal);
    if (prefillRoom && tab === 'join' && this.peer) {
      els.btnP2PJoinRoom.click();
    }
  }

  closeP2PModal() {
    this._hideModal(this.els.p2pModal);
  }

  _switchP2PTab(tab) {
    const { els } = this;
    const isHost = tab === 'host';
    els.p2pHostPane.classList.toggle('hidden', !isHost);
    els.p2pJoinPane.classList.toggle('hidden', isHost);
    els.btnP2PTabHost.classList.toggle('bg-[#161616]', isHost);
    els.btnP2PTabHost.classList.toggle('text-white', isHost);
    els.btnP2PTabHost.classList.toggle('text-[#6E675F]', !isHost);
    els.btnP2PTabJoin.classList.toggle('bg-[#161616]', !isHost);
    els.btnP2PTabJoin.classList.toggle('text-white', !isHost);
    els.btnP2PTabJoin.classList.toggle('text-[#6E675F]', isHost);
  }

  _showModal(el) {
    el.classList.remove('hidden');
    el.classList.add('flex');
  }

  _hideModal(el) {
    el.classList.add('hidden');
    el.classList.remove('flex');
  }

  syncSetupUI() {
    const { state, els } = this;
    document.querySelectorAll('.ai-tier-btn').forEach((btn) => {
      const t = btn.dataset.tier;
      const owned = state.profile.ownedRivals.includes(t);
      const prof = AI_PROFILES[t];
      const active = t === this._pendingTier;
      btn.classList.toggle('opacity-60', !owned);
      const badge = btn.querySelector('span.rounded-full');
      if (badge) {
        badge.textContent = owned ? `+$${prof.winPrize} / -$${prof.losePenalty}` : `Unlock $${prof.unlockCost}`;
      }
      btn.classList.toggle('border-[#161616]', active);
      btn.classList.toggle('bg-[#EDE7DC]', active);
      btn.classList.toggle('border-[#161616]/10', !active);
      btn.classList.toggle('bg-white', !active);
    });
    els.btnSideBlack.classList.toggle('border-[#161616]', this._pendingSide === BLACK);
    els.btnSideBlack.classList.toggle('bg-[#EDE7DC]', this._pendingSide === BLACK);
    els.btnSideBlack.classList.toggle('border-[#161616]/10', this._pendingSide !== BLACK);
    els.btnSideWhite.classList.toggle('border-[#161616]', this._pendingSide === WHITE);
    els.btnSideWhite.classList.toggle('bg-[#EDE7DC]', this._pendingSide === WHITE);
    els.btnSideWhite.classList.toggle('border-[#161616]/10', this._pendingSide !== WHITE);
    els.chkMentorMode.checked = state.mentorMode;
    els.chkConfirmMode.checked = state.confirmMode;
  }

  openSetupModal() {
    this._pendingTier = this.state.tier;
    this._pendingSide = this.state.humanColor;
    this.syncSetupUI();
    this._showModal(this.els.setupModal);
  }

  renderStoryModal() {
    const { state, els } = this;
    els.storyCoinsDisplay.textContent = `$${state.profile.points}`;
    const list = els.storyChapterList;
    list.innerHTML = '';

    STORY_CHAPTERS.forEach((ch, idx) => {
      if (idx > 0) {
        const prevCleared = state.profile.storyCleared.includes(STORY_CHAPTERS[idx - 1].id);
        const prof = AI_PROFILES[ch.tier];
        const owned = state.profile.ownedRivals.includes(ch.tier);
        const conn = document.createElement('div');
        conn.className = 'flex items-center justify-center py-1';
        conn.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="w-0.5 h-3 ${prevCleared ? 'bg-amber-400/50' : 'bg-white/10'}"></div>
            <span class="px-2 py-0.5 rounded-full text-[12px] font-bold border ${
              owned ? 'bg-emerald-700/10 border-emerald-700/25 text-emerald-800' : 'bg-white border-[#161616]/15 text-[#8F6523]'
            }">${owned ? '✓ Unlocked' : `$${prof.unlockCost}`}</span>
            <div class="w-0.5 h-3 ${prevCleared ? 'bg-amber-400/50' : 'bg-white/10'}"></div>
          </div>
        `;
        list.appendChild(conn);
      }

      const prof = AI_PROFILES[ch.tier];
      const cleared = state.profile.storyCleared.includes(ch.id);
      const prevCleared = idx === 0 || state.profile.storyCleared.includes(STORY_CHAPTERS[idx - 1].id);
      const rivalOwned = state.profile.ownedRivals.includes(ch.tier);
      const canAfford = state.profile.points >= prof.unlockCost;

      const node = document.createElement('div');
      node.className = `p-3 rounded-xl border transition ${
        rivalOwned && prevCleared ? 'bg-white border-[#161616]/15' :
        prevCleared ? 'bg-white border-[#161616]/12' :
        'bg-[#EFEAE0] border-[#161616]/5 opacity-60'
      }`;

      if (!prevCleared && !cleared) {
        node.innerHTML = `
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[#EDE7DC] border border-[#161616]/12 flex items-center justify-center text-sm font-bold text-[#6E675F] shrink-0">?</div>
            <div class="min-w-0 flex-1">
              <div class="text-xs font-semibold text-[#3F3A34]">${ch.badge}: Mystery Rival</div>
              <div class="text-[13px] text-[#8A8279]">Unlock cost: $${prof.unlockCost}</div>
            </div>
          </div>
        `;
      } else if (!rivalOwned) {
        node.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-full bg-[#EDE7DC] border border-amber-400/35 flex items-center justify-center text-base shrink-0">🔒</div>
              <div class="min-w-0">
                <div class="text-xs font-bold text-[#161616]">${ch.badge}: Next Challenger</div>
                <div class="text-[13px] text-[#6E675F]">You have $${state.profile.points} / $${prof.unlockCost}</div>
              </div>
            </div>
            <button type="button" data-unlockstoryrival="${idx}" ${canAfford ? '' : 'disabled'}
              class="px-3 py-1.5 rounded-lg text-[13px] font-bold shrink-0 transition ${
                canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white shadow' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'
              }">Unlock $${prof.unlockCost}</button>
          </div>
        `;
      } else {
        node.innerHTML = `
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <img src="${prof.avatar}" alt="${prof.name}" class="w-11 h-11 rounded-full object-cover border ${cleared ? 'border-emerald-400/60' : 'border-amber-400/45'} shrink-0" />
              <div class="min-w-0">
                <div class="text-xs font-bold text-[#161616] leading-snug break-words">${ch.badge}: ${ch.title}</div>
                <div class="text-[13px] text-[#6E675F]">vs ${prof.name} • Win +$${prof.winPrize}</div>
              </div>
            </div>
            <button type="button" data-playchapter="${idx}"
              class="px-3.5 py-1.5 rounded-lg text-[13px] font-bold bg-[#161616] hover:bg-[#2C2C2C] text-white shadow shrink-0 transition">
              ${cleared ? 'Play' : 'Start'}
            </button>
          </div>
        `;
      }
      list.appendChild(node);
    });
  }

  _renderIntroBeat() {
    const { els } = this;
    const ch = STORY_CHAPTERS[this._introIdx];
    const prof = AI_PROFILES[ch.tier];
    const beat = this._activeIntroBeats[this._introBeat] || ch.beats[0];
    els.introChapterBadge.textContent = ch.badge;
    els.introChapterTitle.textContent = ch.title;
    els.introAvatarImg.src = prof.avatar;
    els.introSpeaker.textContent = beat.speaker;
    els.introSubtitle.textContent = beat.sub;
    els.introBeatText.textContent = beat.text;

    els.introDots.innerHTML = '';
    this._activeIntroBeats.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = `h-1.5 rounded-full transition-all ${i === this._introBeat ? 'w-5 bg-amber-400' : 'w-1.5 bg-white/20'}`;
      els.introDots.appendChild(dot);
    });

    const isLast = this._introBeat >= this._activeIntroBeats.length - 1;
    els.btnIntroNext.textContent = isLast ? 'Start Match' : 'Next →';
  }

  launchStoryMatch(idx) {
    const { state, els } = this;
    const ch = STORY_CHAPTERS[idx];
    if (!ch) return;
    this._hideModal(els.storyIntroModal);
    state.gameMode = 'story';
    state.storyChapterIdx = idx;
    state.tier = ch.tier;
    state.humanColor = BLACK;
    state.aiColor = WHITE;
    els.chkTournament.checked = false;
    els.chkAdjacentOnly.checked = false;
    els.chkKeryo.checked = false;
    els.chkNoCaptures.checked = false;
    els.homeMenu.classList.add('hidden');
    this.onStartNewGame();
    this.showToast(`${ch.badge}: ${AI_PROFILES[ch.tier].quoteStart}`, 2800);
  }

  startStoryChapter(idx) {
    const { state, els } = this;
    const ch = STORY_CHAPTERS[idx];
    if (!ch) return;
    this._introIdx = idx;
    this._introBeat = 0;
    const playNum = state.profile.storyPlays[ch.id] || 0;
    if (playNum === 0 || !ch.replays || ch.replays.length === 0) {
      this._activeIntroBeats = ch.beats;
    } else {
      const rIdx = (playNum - 1) % ch.replays.length;
      this._activeIntroBeats = ch.replays[rIdx].slice();
      if (state.profile.lastOutcome) {
        const lo = state.profile.lastOutcome;
        const prof = AI_PROFILES[ch.tier];
        const callbackText = lo.won
          ? `"Still impressed by your ${lo.reasonType === 'captures' ? 'five captures' : 'five-in-a-row'} last match! Ready for another?"`
          : lo.line;
        this._activeIntroBeats.push({ speaker: prof.name, sub: lo.won ? 'Last Match Replay' : 'Coaching Tip', text: callbackText });
      }
    }
    state.profile.storyPlays[ch.id] = playNum + 1;
    this.profileStore.save();
    this._hideModal(els.storyModal);
    els.homeMenu.classList.add('hidden');
    this._renderIntroBeat();
    this._showModal(els.storyIntroModal);
  }

  renderShop() {
    const { state, els } = this;
    els.shopPointsDisplay.textContent = `$${state.profile.points}`;
    document.querySelectorAll('.shop-tab-btn').forEach((btn) => {
      const active = btn.dataset.shoptab === state.shopTab;
      btn.classList.toggle('bg-[#161616]', active);
      btn.classList.toggle('text-white', active);
      btn.classList.toggle('text-[#6E675F]', !active);
    });

    const body = els.shopBody;
    body.innerHTML = '';

    const activeBeadObj = BEAD_THEMES[state.profile.activeBead] || BEAD_THEMES.classic;
    const activeBoardObj = BOARD_THEMES[state.profile.activeBoard] || BOARD_THEMES.hideaway;
    const summary = document.createElement('div');
    summary.className = 'p-2.5 rounded-xl bg-[#EDE7DC] border border-[#161616]/10 flex items-center justify-between gap-2';
    summary.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-8 h-8 rounded-lg border shrink-0 flex items-center justify-center gap-0.5 shadow" style="background:linear-gradient(135deg,${activeBoardObj.bg0},${activeBoardObj.bg2});border-color:${activeBoardObj.border}">
          <span class="w-2.5 h-2.5 rounded-full" style="background:${activeBeadObj.p1.css}"></span>
          <span class="w-2.5 h-2.5 rounded-full" style="background:${activeBeadObj.p2.css}"></span>
        </div>
        <div class="min-w-0">
          <div class="text-[13px] font-bold text-[#161616] leading-snug break-words">${activeBoardObj.name}</div>
          <div class="text-[12px] text-[#6E675F] leading-snug break-words">${activeBeadObj.name}</div>
        </div>
      </div>
      <div class="text-[12px] text-[#6E675F] shrink-0 text-right">
        <div>Rivals ${state.profile.ownedRivals.length}/5</div>
        <div>Trophies ${state.profile.unlocked.length}/${ACHIEVEMENTS.length}</div>
      </div>
    `;
    body.appendChild(summary);

    if (state.shopTab === 'opponents') {
      for (const [key, prof] of Object.entries(AI_PROFILES)) {
        const owned = state.profile.ownedRivals.includes(key);
        const canAfford = state.profile.points >= prof.unlockCost;
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${owned ? 'bg-white border-emerald-700/25' : 'bg-white border-[#161616]/10'}`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <img src="${prof.avatar}" alt="${prof.name}" class="w-10 h-10 rounded-full object-cover border border-[#161616]/20 shrink-0" />
            <div class="min-w-0">
              <div class="text-xs font-bold text-[#161616]">${prof.name} • ${prof.label}</div>
              <div class="text-[13px] text-[#6E675F] leading-snug">${prof.title} • Win +$${prof.winPrize} / Lose -$${prof.losePenalty}</div>
            </div>
          </div>
          <button type="button" data-buyrival="${key}" class="px-2.5 py-1.5 rounded-lg text-[13px] font-bold shrink-0 transition ${
            owned ? 'bg-emerald-700/15 text-emerald-900 border border-emerald-700/30' :
            canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'
          }">${owned ? 'Play' : `$${prof.unlockCost}`}</button>
        `;
        body.appendChild(card);
      }
    } else if (state.shopTab === 'puzzles') {
      for (const [key, pack] of Object.entries(MENTOR_CURRICULUM)) {
        const owned = state.profile.ownedPuzzlePacks.includes(key);
        const canAfford = state.profile.points >= pack.packCost;
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${owned ? 'bg-white border-emerald-700/25' : 'bg-white border-[#161616]/10'}`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-lg bg-emerald-700/10 border border-emerald-700/25 flex items-center justify-center text-lg shrink-0"></div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-[#161616]">${pack.packName}</div>
              <div class="text-[13px] text-[#6E675F] leading-snug">${pack.drills.length} puzzles • Pays $${pack.puzzleReward} each</div>
            </div>
          </div>
          <button type="button" data-buypack="${key}" class="px-2.5 py-1.5 rounded-lg text-[13px] font-bold shrink-0 transition ${
            owned ? 'bg-emerald-700/15 text-emerald-900 border border-emerald-700/30' :
            canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'
          }">${owned ? 'Open' : `$${pack.packCost}`}</button>
        `;
        body.appendChild(card);
      }
    } else if (state.shopTab === 'achievements') {
      for (const ach of ACHIEVEMENTS) {
        const done = state.profile.unlocked.includes(ach.id);
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${done ? 'bg-emerald-700/5 border-emerald-700/30' : 'bg-white border-[#161616]/10 opacity-85'}`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${done ? 'bg-emerald-700/15' : 'bg-[#EDE7DC]'}">${ach.icon}</div>
            <div class="min-w-0">
              <div class="text-xs font-bold ${done ? 'text-emerald-900' : 'text-[#161616]'} leading-snug break-words">${ach.name}</div>
              <div class="text-[13px] text-[#6E675F] leading-snug">${ach.desc}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded-full text-[13px] font-bold shrink-0 ${done ? 'bg-emerald-500/25 text-emerald-800' : 'bg-[#EDE7DC] text-[#8F6523]'}">${done ? '✓ ' : '+'}$${ach.reward}</span>
        `;
        body.appendChild(card);
      }
    } else if (state.shopTab === 'beads') {
      for (const [key, item] of Object.entries(BEAD_THEMES)) {
        const owned = state.profile.ownedBeads.includes(key);
        const equipped = state.profile.activeBead === key;
        const canAfford = state.profile.points >= item.cost;
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${equipped ? 'bg-[#EDE7DC] border-[#161616]' : 'bg-white border-[#161616]/10'}`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="flex -space-x-1.5 shrink-0">
              <span class="w-5 h-5 rounded-full border border-white/40 shadow" style="background:${item.p1.css}"></span>
              <span class="w-5 h-5 rounded-full border border-white/40 shadow" style="background:${item.p2.css}"></span>
            </div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-[#161616]">${item.name}</div>
              <div class="text-[13px] text-[#6E675F] leading-snug">${item.desc}</div>
            </div>
          </div>
          <button type="button" data-buybead="${key}" class="px-2.5 py-1.5 rounded-lg text-[13px] font-bold shrink-0 transition ${
            equipped ? 'bg-emerald-500/25 text-emerald-900 border border-emerald-700/30' :
            owned ? 'bg-stone-700 hover:bg-stone-600 text-[#161616]' :
            canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'
          }">${equipped ? 'Equipped' : owned ? 'Equip' : `$${item.cost}`}</button>
        `;
        body.appendChild(card);
      }
    } else {
      for (const [key, item] of Object.entries(BOARD_THEMES)) {
        const owned = state.profile.ownedBoards.includes(key);
        const equipped = state.profile.activeBoard === key;
        const canAfford = state.profile.points >= item.cost;
        const card = document.createElement('div');
        card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${equipped ? 'bg-[#EDE7DC] border-[#161616]' : 'bg-white border-[#161616]/10'}`;
        card.innerHTML = `
          <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-8 h-8 rounded-lg border shrink-0 shadow" style="background:linear-gradient(135deg,${item.bg0},${item.bg2});border-color:${item.border}"></div>
            <div class="min-w-0">
              <div class="text-xs font-bold text-[#161616]">${item.name}</div>
              <div class="text-[13px] text-[#6E675F] leading-snug">${item.desc}</div>
            </div>
          </div>
          <button type="button" data-buyboard="${key}" class="px-2.5 py-1.5 rounded-lg text-[13px] font-bold shrink-0 transition ${
            equipped ? 'bg-emerald-500/25 text-emerald-900 border border-emerald-700/30' :
            owned ? 'bg-stone-700 hover:bg-stone-600 text-[#161616]' :
            canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'
          }">${equipped ? 'Equipped' : owned ? 'Equip' : `$${item.cost}`}</button>
        `;
        body.appendChild(card);
      }
    }
  }

  renderPuzzlesModal() {
    const { state, els } = this;
    els.puzzlesCoinsDisplay.textContent = `$${state.profile.points}`;
    const body = els.puzzlesBody;
    body.innerHTML = '';

    let totalPuzzles = 0;
    Object.values(MENTOR_CURRICULUM).forEach((p) => (totalPuzzles += p.drills.length));
    const solvedCount = state.profile.solvedPuzzles.length;
    const prog = document.createElement('div');
    prog.className = 'p-2.5 rounded-xl bg-[#EDE7DC] border border-emerald-400/25 flex items-center justify-between gap-3';
    prog.innerHTML = `
      <div>
        <div class="text-xs font-bold text-emerald-900">Puzzle Mastery</div>
        <div class="text-[13px] text-[#6E675F]">Solve puzzles to earn cash for the Store</div>
      </div>
      <span class="px-2.5 py-1 rounded-full bg-emerald-700/15 text-xs font-bold text-emerald-800 shrink-0">${solvedCount}/${totalPuzzles}</span>
    `;
    body.appendChild(prog);

    for (const [tierKey, pack] of Object.entries(MENTOR_CURRICULUM)) {
      const owned = state.profile.ownedPuzzlePacks.includes(tierKey);
      const canAfford = state.profile.points >= pack.packCost;
      const sec = document.createElement('div');
      sec.className = 'p-3 rounded-xl bg-white border border-[#161616]/10 space-y-2';
      let headerHtml = `
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-xs font-bold text-emerald-900">${pack.packName}</div>
            <div class="text-[12px] text-[#6E675F]">Reward: $${pack.puzzleReward} per puzzle</div>
          </div>`;
      if (!owned) {
        headerHtml += `<button type="button" data-unlockpack="${tierKey}" class="px-2.5 py-1 rounded-lg text-[13px] font-bold ${canAfford ? 'bg-[#161616] hover:bg-[#2C2C2C] text-white' : 'bg-stone-800 text-[#8A8279] cursor-not-allowed'}">Unlock $${pack.packCost}</button>`;
      }
      headerHtml += '</div>';
      sec.innerHTML = headerHtml;

      if (owned) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-1 gap-1.5 pt-1';
        pack.drills.forEach((d, idx) => {
          const pId = `${tierKey}_${idx}`;
          const solved = state.profile.solvedPuzzles.includes(pId);
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.startpuzzle = `${tierKey}:${idx}`;
          btn.className = 'p-2 rounded-lg bg-[#EDE7DC] hover:bg-emerald-700/10 border border-[#161616]/10 flex items-center justify-between text-left transition';
          btn.innerHTML = `
            <span class="text-xs font-medium text-[#161616]">${d.title}</span>
            <span class="text-[12px] font-bold px-2 py-0.5 rounded-full ${solved ? 'bg-emerald-700/15 text-emerald-800' : 'bg-[#161616] text-white text-[#8F6523]'}">${solved ? '✓ Solved' : `+$${pack.puzzleReward}`}</span>
          `;
          grid.appendChild(btn);
        });
        sec.appendChild(grid);
      }
      body.appendChild(sec);
    }
  }

  openPuzzlesModal() {
    this.renderPuzzlesModal();
    this._showModal(this.els.puzzlesModal);
  }

  startSpecificPuzzle(tierKey, idx) {
    const { state, game, els } = this;
    const pack = MENTOR_CURRICULUM[tierKey];
    const drill = pack.drills[idx];
    if (!drill) return;

    state.gameMode = 'puzzle';
    state.tier = tierKey;
    state.mentorDrill = Object.assign({}, drill, { tierKey, puzzleId: `${tierKey}_${idx}` });
    game.loadPosition({
      stones: drill.stones,
      turn: drill.turn,
      humanCaps: drill.humanCaps,
      aiCaps: drill.aiCaps
    });

    state.humanColor = drill.turn;
    state.aiColor = drill.turn === BLACK ? WHITE : BLACK;
    state.mentorMode = true;
    state.aimPoint = null;
    state.previewPoint = null;
    state.hintPoint = null;
    state.aiThinking = false;

    const goal = drill.goalCoord || drill.goalCoords[0];
    state.mentorBestMove = { r: goal[0], c: goal[1] };
    state.mentorAltMove = null;
    els.mentorHeadline.textContent = drill.title;
    els.mentorAdvice.textContent = drill.prompt;
    this._hideModal(els.puzzlesModal);
    els.homeMenu.classList.add('hidden');
    this.onUpdateHUD();
    this.renderer.resize();
  }

  renderAchievementsModal() {
    const { state, els } = this;
    els.achModalCount.textContent = `${state.profile.unlocked.length}/${ACHIEVEMENTS.length}`;
    els.achCoinsDisplay.textContent = `$${state.profile.points}`;
    const body = els.achievementsBody;
    body.innerHTML = '';
    for (const ach of ACHIEVEMENTS) {
      const done = state.profile.unlocked.includes(ach.id);
      const card = document.createElement('div');
      card.className = `p-2.5 rounded-xl border flex items-center justify-between gap-2.5 ${done ? 'bg-emerald-700/5 border-emerald-700/30' : 'bg-white border-[#161616]/10 opacity-85'}`;
      card.innerHTML = `
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0 ${done ? 'bg-emerald-700/15' : 'bg-[#EDE7DC]'}">${ach.icon}</div>
          <div class="min-w-0">
            <div class="text-xs font-bold ${done ? 'text-emerald-900' : 'text-[#161616]'} leading-snug break-words">${ach.name}</div>
            <div class="text-[13px] text-[#6E675F] leading-snug">${ach.desc}</div>
          </div>
        </div>
        <span class="px-2 py-0.5 rounded-full text-[13px] font-bold shrink-0 ${done ? 'bg-emerald-500/25 text-emerald-800' : 'bg-[#EDE7DC] text-[#8F6523]'}">${done ? '✓ ' : '+'}$${ach.reward}</span>
      `;
      body.appendChild(card);
    }
  }

  _bindEvents() {
    const { state, els } = this;

    // Setup Modal
    document.querySelectorAll('.ai-tier-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = btn.dataset.tier;
        if (!state.profile.ownedRivals.includes(t)) {
          const prof = AI_PROFILES[t];
          if (state.profile.points >= prof.unlockCost) {
            state.profile.points -= prof.unlockCost;
            state.profile.ownedRivals.push(t);
            this.profileStore.save();
            this.onUpdateHUD();
            this.showToast(`Unlocked ${prof.name} for $${prof.unlockCost}!`);
          } else {
            this.showToast(`Unlock ${prof.name} in Store ($${prof.unlockCost})!`);
            return;
          }
        }
        this._pendingTier = t;
        this.syncSetupUI();
      });
    });
    els.btnSideBlack.addEventListener('click', () => { this._pendingSide = BLACK; this.syncSetupUI(); });
    els.btnSideWhite.addEventListener('click', () => { this._pendingSide = WHITE; this.syncSetupUI(); });
    els.btnSettings.addEventListener('click', () => this.openSetupModal());
    els.btnCloseSetup.addEventListener('click', () => this._hideModal(els.setupModal));
    els.btnApplyStart.addEventListener('click', () => {
      state.tier = this._pendingTier;
      state.humanColor = this._pendingSide;
      state.aiColor = this._pendingSide === BLACK ? WHITE : BLACK;
      state.mentorMode = els.chkMentorMode.checked;
      state.confirmMode = els.chkConfirmMode.checked;
      this._hideModal(els.setupModal);
      this.onStartNewGame();
    });

    // Story Modal & Intro Beats
    els.btnIntroNext.addEventListener('click', () => {
      if (this._introBeat < this._activeIntroBeats.length - 1) {
        this._introBeat++;
        this._renderIntroBeat();
      } else {
        this.launchStoryMatch(this._introIdx);
      }
    });
    els.btnSkipIntro.addEventListener('click', () => this.launchStoryMatch(this._introIdx));
    els.btnStory.addEventListener('click', () => {
      this.renderStoryModal();
      this._showModal(els.storyModal);
    });
    els.btnCloseStory.addEventListener('click', () => this._hideModal(els.storyModal));
    els.storyChapterList.addEventListener('click', (e) => {
      const uBtn = e.target.closest('[data-unlockstoryrival]');
      if (uBtn && !uBtn.disabled) {
        const idx = Number(uBtn.dataset.unlockstoryrival);
        const ch = STORY_CHAPTERS[idx];
        const prof = AI_PROFILES[ch.tier];
        if (state.profile.points >= prof.unlockCost && !state.profile.ownedRivals.includes(ch.tier)) {
          state.profile.points -= prof.unlockCost;
          state.profile.ownedRivals.push(ch.tier);
          this.profileStore.save();
          this.onUpdateHUD();
          this.renderStoryModal();
          this.showToast(`Unlocked ${ch.badge}: ${prof.name}!`);
        }
        return;
      }
      const btn = e.target.closest('[data-playchapter]');
      if (!btn || btn.disabled) return;
      this.startStoryChapter(Number(btn.dataset.playchapter));
    });
    els.btnExitStory.addEventListener('click', () => {
      state.gameMode = 'free';
      this.onUpdateHUD();
      this.renderer.resize();
    });
    els.btnNextChapter.addEventListener('click', () => {
      this.startStoryChapter(Math.min(STORY_CHAPTERS.length - 1, state.storyChapterIdx + 1));
    });
    els.btnBackToProgress.addEventListener('click', () => {
      this._hideModal(els.gameOverModal);
      if (state.gameMode === 'story') {
        this.renderStoryModal();
        this._showModal(els.storyModal);
      } else {
        this.onUpdateHUD();
        els.homeMenu.classList.remove('hidden');
      }
    });
    els.btnModeFreePlay.addEventListener('click', () => {
      state.gameMode = 'free';
      this._hideModal(els.storyModal);
      this.openSetupModal();
    });
    els.btnModeDrills.addEventListener('click', () => {
      state.gameMode = 'free';
      this._hideModal(els.storyModal);
      this.mentorCoach.loadDrill();
    });

    // Shop Modal
    els.btnShop.addEventListener('click', () => {
      this.renderShop();
      this._showModal(els.shopModal);
    });
    els.btnCloseShop.addEventListener('click', () => this._hideModal(els.shopModal));
    document.querySelectorAll('.shop-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.shopTab = btn.dataset.shoptab;
        this.renderShop();
      });
    });
    els.shopBody.addEventListener('click', (e) => {
      const rivalBtn = e.target.closest('[data-buyrival]');
      if (rivalBtn) {
        const key = rivalBtn.dataset.buyrival;
        const prof = AI_PROFILES[key];
        if (!state.profile.ownedRivals.includes(key)) {
          if (state.profile.points < prof.unlockCost) return;
          state.profile.points -= prof.unlockCost;
          state.profile.ownedRivals.push(key);
          this.profileStore.save();
          this.renderShop();
          this.onUpdateHUD();
          this.showToast(`Unlocked ${prof.name}!`);
        } else {
          state.gameMode = 'free';
          state.tier = key;
          this._hideModal(els.shopModal);
          els.homeMenu.classList.add('hidden');
          this.onStartNewGame();
        }
        return;
      }
      const packBtn = e.target.closest('[data-buypack]');
      if (packBtn) {
        const key = packBtn.dataset.buypack;
        const pack = MENTOR_CURRICULUM[key];
        if (!state.profile.ownedPuzzlePacks.includes(key)) {
          if (state.profile.points < pack.packCost) return;
          state.profile.points -= pack.packCost;
          state.profile.ownedPuzzlePacks.push(key);
          this.profileStore.save();
          this.renderShop();
          this.onUpdateHUD();
          this.showToast(`Unlocked ${pack.packName}!`);
        } else {
          this._hideModal(els.shopModal);
          this.openPuzzlesModal();
        }
        return;
      }
      const beadBtn = e.target.closest('[data-buybead]');
      if (beadBtn) {
        const key = beadBtn.dataset.buybead;
        const item = BEAD_THEMES[key];
        if (!state.profile.ownedBeads.includes(key)) {
          if (state.profile.points < item.cost) return;
          state.profile.points -= item.cost;
          state.profile.ownedBeads.push(key);
        }
        state.profile.activeBead = key;
        this.profileStore.save();
        this.renderShop();
        this.onUpdateHUD();
        this.renderer.draw();
        return;
      }
      const boardBtn = e.target.closest('[data-buyboard]');
      if (boardBtn) {
        const key = boardBtn.dataset.buyboard;
        const item = BOARD_THEMES[key];
        if (!state.profile.ownedBoards.includes(key)) {
          if (state.profile.points < item.cost) return;
          state.profile.points -= item.cost;
          state.profile.ownedBoards.push(key);
        }
        state.profile.activeBoard = key;
        this.profileStore.save();
        this.renderShop();
        this.onUpdateHUD();
        this.renderer.draw();
      }
    });

    // Puzzles Modal
    els.btnOpenPuzzleList.addEventListener('click', () => this.openPuzzlesModal());
    els.btnClosePuzzles.addEventListener('click', () => this._hideModal(els.puzzlesModal));
    els.puzzlesBody.addEventListener('click', (e) => {
      const uBtn = e.target.closest('[data-unlockpack]');
      if (uBtn) {
        const key = uBtn.dataset.unlockpack;
        const pack = MENTOR_CURRICULUM[key];
        if (state.profile.points >= pack.packCost && !state.profile.ownedPuzzlePacks.includes(key)) {
          state.profile.points -= pack.packCost;
          state.profile.ownedPuzzlePacks.push(key);
          this.profileStore.save();
          this.renderPuzzlesModal();
          this.onUpdateHUD();
          this.showToast(`Unlocked ${pack.packName}!`);
        }
        return;
      }
      const pBtn = e.target.closest('[data-startpuzzle]');
      if (pBtn) {
        const [tk, ix] = pBtn.dataset.startpuzzle.split(':');
        this.startSpecificPuzzle(tk, Number(ix));
      }
    });

    // Home Menu & Achievements & Rules
    els.btnGoHome.addEventListener('click', () => {
      if (state.gameMode === 'p2p' && this.peer && this.peer.connected) {
        this.peer.close(false);
      }
      this.onUpdateHUD();
      els.homeMenu.classList.remove('hidden');
    });
    els.btnHomeCoins.addEventListener('click', () => {
      this.renderShop();
      this._showModal(els.shopModal);
    });
    els.btnHomeStory.addEventListener('click', () => {
      els.homeMenu.classList.add('hidden');
      this.renderStoryModal();
      this._showModal(els.storyModal);
    });
    els.btnHomeFreePlay.addEventListener('click', () => {
      state.gameMode = 'free';
      els.homeMenu.classList.add('hidden');
      this.openSetupModal();
    });
    els.btnHomeLocal2P.addEventListener('click', () => {
      state.gameMode = 'local2p';
      state.humanColor = BLACK;
      state.aiColor = WHITE;
      state.mentorMode = false;
      els.homeMenu.classList.add('hidden');
      this.onStartNewGame();
    });
    els.btnHomeP2P.addEventListener('click', () => this.openP2PModal('host'));

    // Online P2P Modal
    els.btnCloseP2P.addEventListener('click', () => this.closeP2PModal());
    els.btnP2PTabHost.addEventListener('click', () => this._switchP2PTab('host'));
    els.btnP2PTabJoin.addEventListener('click', () => this._switchP2PTab('join'));

    const copyText = async (text, label) => {
      try {
        await navigator.clipboard.writeText(text);
        this.showToast(`Copied ${label}`);
      } catch (e) {
        this.showToast(`Select & copy ${label} manually`);
      }
    };

    els.btnP2PCreateRoom.addEventListener('click', async () => {
      if (!this.peer) return;
      els.btnP2PCreateRoom.disabled = true;
      els.btnP2PCreateRoom.textContent = 'Creating Room…';
      try {
        const code = await this.peer.hostRoom();
        els.p2pRoomCodeText.textContent = code;
        els.p2pRoomBox.classList.remove('hidden');
      } catch (e) {
        this.showToast(e && e.message ? e.message : 'Failed to create room');
      } finally {
        els.btnP2PCreateRoom.disabled = false;
        els.btnP2PCreateRoom.textContent = 'Create 6-Char Room';
      }
    });

    els.btnP2PCopyLink.addEventListener('click', () => {
      const code = els.p2pRoomCodeText.textContent.trim();
      if (!code || code === '------') return;
      const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(code)}`;
      copyText(url, 'invite link');
    });

    els.btnP2PCopyCode.addEventListener('click', () => {
      const code = els.p2pRoomCodeText.textContent.trim();
      if (code && code !== '------') copyText(code, 'room code');
    });

    els.btnP2PJoinRoom.addEventListener('click', async () => {
      if (!this.peer) return;
      const raw = els.p2pRoomInput.value.trim();
      if (!raw) {
        this.showToast('Enter a room code or invite link');
        return;
      }
      els.btnP2PJoinRoom.disabled = true;
      els.btnP2PJoinRoom.textContent = 'Connecting…';
      try {
        await this.peer.joinRoom(raw);
      } catch (e) {
        this.showToast(e && e.message ? e.message : 'Could not join room');
      } finally {
        els.btnP2PJoinRoom.disabled = false;
        els.btnP2PJoinRoom.textContent = 'Join & Play';
      }
    });
    els.btnHomePuzzles.addEventListener('click', () => this.openPuzzlesModal());
    els.btnHomeShop.addEventListener('click', () => {
      this.renderShop();
      this._showModal(els.shopModal);
    });
    els.btnHomeAchievements.addEventListener('click', () => {
      this.renderAchievementsModal();
      this._showModal(els.achievementsModal);
    });
    els.btnCloseAchievements.addEventListener('click', () => this._hideModal(els.achievementsModal));
    els.btnHomeRulesets.addEventListener('click', () => {
      state.gameMode = 'free';
      els.homeMenu.classList.add('hidden');
      this.openSetupModal();
    });
    els.btnHomeRules.addEventListener('click', () => this._showModal(els.rulesModal));

    els.btnRules.addEventListener('click', () => this._showModal(els.rulesModal));
    document.getElementById('btnSetupRules').addEventListener('click', () => {
      this._hideModal(els.setupModal);
      this._showModal(els.rulesModal);
    });
    els.btnCloseRules.addEventListener('click', () => this._hideModal(els.rulesModal));
    els.btnGotItRules.addEventListener('click', () => this._hideModal(els.rulesModal));
  }
}
