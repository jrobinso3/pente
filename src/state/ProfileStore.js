import { ACHIEVEMENTS } from '../config/constants.js';

const STORAGE_KEY = 'pente_profile_v1';

/**
 * Manages persistent player profile, currency, unlocks, and achievement queue.
 */
export class ProfileStore {
  constructor() {
    this.data = {
      points: 0,
      unlocked: [],
      ownedRivals: ['novice'],
      ownedBeads: ['classic'],
      ownedBoards: ['walnut_travertine', 'hideaway', 'original_78'],
      ownedPuzzlePacks: ['novice'],
      solvedPuzzles: [],
      activeBead: 'classic',
      activeBoard: 'walnut_travertine',
      drillsSolved: 0,
      storyCleared: [],
      storyPlays: {},
      lastOutcome: null
    };
    this._achQueue = [];
    this._achShowing = false;
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign({}, this.data, parsed);
        if (!Array.isArray(this.data.ownedBeads)) this.data.ownedBeads = ['classic'];
        if (!Array.isArray(this.data.ownedBoards)) this.data.ownedBoards = ['walnut_travertine', 'hideaway', 'original_78'];
        if (!this.data.ownedBoards.includes('walnut_travertine')) this.data.ownedBoards.unshift('walnut_travertine');
        if (!Array.isArray(this.data.unlocked)) this.data.unlocked = [];
        if (!Array.isArray(this.data.storyCleared)) this.data.storyCleared = [];
        if (!this.data.storyPlays || typeof this.data.storyPlays !== 'object') this.data.storyPlays = {};
        if (!Array.isArray(this.data.ownedRivals)) this.data.ownedRivals = ['novice'];
        if (!Array.isArray(this.data.ownedPuzzlePacks)) this.data.ownedPuzzlePacks = ['novice'];
        if (!Array.isArray(this.data.solvedPuzzles)) this.data.solvedPuzzles = [];
      }
    } catch (e) {}
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {}
  }

  unlockAchievement(id) {
    if (this.data.unlocked.includes(id)) return false;
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    if (!ach) return false;
    this.data.unlocked.push(id);
    this.data.points += ach.reward;
    this.save();
    this._achQueue.push(ach);
    this._processAchQueue();
    return true;
  }

  _processAchQueue() {
    if (this._achShowing || this._achQueue.length === 0) return;
    this._achShowing = true;
    const ach = this._achQueue.shift();
    const pop = document.getElementById('achievementPopup');
    document.getElementById('achPopIcon').textContent = ach.icon;
    document.getElementById('achPopName').textContent = ach.name;
    document.getElementById('achPopReward').textContent = `+$${ach.reward}`;

    pop.classList.remove('opacity-0', '-translate-y-4');
    pop.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
      pop.classList.remove('opacity-100', 'translate-y-0');
      pop.classList.add('opacity-0', '-translate-y-4');
      setTimeout(() => {
        this._achShowing = false;
        this._processAchQueue();
      }, 320);
    }, 2800);
  }
}
