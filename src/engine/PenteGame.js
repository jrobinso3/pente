import { SIZE, CENTER, EMPTY, BLACK, WHITE, DIRS, DIRS8 } from '../config/constants.js';

const ZOBRIST_HI = new Uint32Array(SIZE * SIZE * 3);
const ZOBRIST_LO = new Uint32Array(SIZE * SIZE * 3);
(function initZobrist() {
  let s = 0x9e3779b9;
  function nextRand() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17; s >>>= 0;
    s ^= s << 5; s >>>= 0;
    return s;
  }
  for (let i = 0; i < ZOBRIST_HI.length; i++) {
    ZOBRIST_HI[i] = nextRand();
    ZOBRIST_LO[i] = nextRand();
  }
})();


export class PenteGame {
  constructor() {
    this.board = new Uint8Array(SIZE * SIZE);
    this.captures = { [BLACK]: 0, [WHITE]: 0 }; // pairs captured
    this.turn = BLACK;
    this.moveCount = 0; // stones placed so far
    this.history = [];
    this.winner = 0;
    this.winReason = '';
    this.winLine = null; // array of [r, c]
    this.lastMove = null;
    this.tournamentRule = false;
    this.adjacentOnly = false;
    this.keryoRule = false;
    this.noCaptures = false;
    this.hashHi = 0;
    this.hashLo = 0;
  }

  idx(r, c) { return r * SIZE + c; }
  inBounds(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }

  reset({ tournamentRule = false, adjacentOnly = false, keryoRule = false, noCaptures = false } = {}) {
    this.board.fill(EMPTY);
    this.captures[BLACK] = 0;
    this.captures[WHITE] = 0;
    this.turn = BLACK;
    this.moveCount = 0;
    this.history = [];
    this.winner = 0;
    this.winReason = '';
    this.winLine = null;
    this.lastMove = null;
    this.hashHi = 0;
    this.hashLo = 0;
    this.tournamentRule = tournamentRule;
    this.adjacentOnly = adjacentOnly;
    this.keryoRule = keryoRule;
    this.noCaptures = noCaptures;
  }

  loadPosition({ stones, turn, humanCaps = 0, aiCaps = 0 }) {
    this.reset();
    this.captures[BLACK] = humanCaps;
    this.captures[WHITE] = aiCaps;
    this.turn = turn;
    this.moveCount = stones.length;
    for (const [sr, sc, scolor] of stones) {
      const idx = sr * SIZE + sc;
      this.board[idx] = scolor;
      this.hashHi ^= ZOBRIST_HI[idx * 3 + scolor];
      this.hashLo ^= ZOBRIST_LO[idx * 3 + scolor];
    }
  }

  isLegalMove(r, c) {
    if (this.winner !== 0) return false;
    if (!this.inBounds(r, c) || this.board[r * SIZE + c] !== EMPTY) return false;

    // Move 0 (Black's first move) must be on center
    if (this.moveCount === 0) {
      return r === CENTER && c === CENTER;
    }

    // Tournament rule: Black's 2nd move (moveCount === 2) must be >= 3 away from center
    if (this.tournamentRule && this.moveCount === 2 && this.turn === BLACK) {
      const dr = Math.abs(r - CENTER);
      const dc = Math.abs(c - CENTER);
      if (Math.max(dr, dc) < 3) return false;
    }

    // Optional Drexel adjacent-only rule
    if (this.adjacentOnly && this.moveCount > 0) {
      let hasNeighbor = false;
      for (let d = 0; d < 8; d++) {
        const nr = r + DIRS8[d][0];
        const nc = c + DIRS8[d][1];
        if (this.inBounds(nr, nc) && this.board[nr * SIZE + nc] !== EMPTY) {
          hasNeighbor = true;
          break;
        }
      }
      if (!hasNeighbor) return false;
    }
    return true;
  }

  makeMove(r, c) {
    if (!this.isLegalMove(r, c)) return null;
    const player = this.turn;
    const opp = player === BLACK ? WHITE : BLACK;
    const i = r * SIZE + c;

    this.board[i] = player;
    this.hashHi ^= ZOBRIST_HI[i * 3 + player];
    this.hashLo ^= ZOBRIST_LO[i * 3 + player];

    // Check captures in all 8 directions: X O O X (and X O O O X in Keryo-Pente)
    const capturedStones = [];
    let pairsGained = 0;
    if (!this.noCaptures) {
      for (let d = 0; d < 8; d++) {
        const dr = DIRS8[d][0];
        const dc = DIRS8[d][1];
        const r1 = r + dr, c1 = c + dc;
        const r2 = r + 2 * dr, c2 = c + 2 * dc;
        const r3 = r + 3 * dr, c3 = c + 3 * dc;
        if (this.inBounds(r3, c3)) {
          const i1 = r1 * SIZE + c1;
          const i2 = r2 * SIZE + c2;
          const i3 = r3 * SIZE + c3;
          if (this.board[i1] === opp && this.board[i2] === opp && this.board[i3] === player) {
            this.board[i1] = EMPTY;
            this.board[i2] = EMPTY;
            this.hashHi ^= ZOBRIST_HI[i1 * 3 + opp] ^ ZOBRIST_HI[i2 * 3 + opp];
            this.hashLo ^= ZOBRIST_LO[i1 * 3 + opp] ^ ZOBRIST_LO[i2 * 3 + opp];
            capturedStones.push([r1, c1], [r2, c2]);
            pairsGained++;
            continue;
          }
        }
        if (this.keryoRule) {
          const r4 = r + 4 * dr, c4 = c + 4 * dc;
          if (this.inBounds(r4, c4)) {
            const i1 = r1 * SIZE + c1, i2 = r2 * SIZE + c2, i3 = r3 * SIZE + c3, i4 = r4 * SIZE + c4;
            if (this.board[i1] === opp && this.board[i2] === opp && this.board[i3] === opp && this.board[i4] === player) {
              this.board[i1] = EMPTY; this.board[i2] = EMPTY; this.board[i3] = EMPTY;
              this.hashHi ^= ZOBRIST_HI[i1 * 3 + opp] ^ ZOBRIST_HI[i2 * 3 + opp] ^ ZOBRIST_HI[i3 * 3 + opp];
              this.hashLo ^= ZOBRIST_LO[i1 * 3 + opp] ^ ZOBRIST_LO[i2 * 3 + opp] ^ ZOBRIST_LO[i3 * 3 + opp];
              capturedStones.push([r1, c1], [r2, c2], [r3, c3]);
              pairsGained++;
            }
          }
        }
      }
    }
    this.captures[player] += pairsGained;

    // Check 5-in-a-row win first (immediate win per rules)
    let winLine = this.findFiveInARow(r, c, player);
    let winner = 0;
    let winReason = '';
    if (winLine) {
      winner = player;
      winReason = winLine.length > 5 ? `${winLine.length} stones in a row` : 'Five stones in a row';
    } else if (this.captures[player] >= 5) {
      winner = player;
      winReason = `Captured ${this.captures[player]} pairs (${this.captures[player] * 2} stones)`;
    }

    const record = {
      r, c, player,
      capturedStones,
      pairsGained,
      prevLastMove: this.lastMove,
      prevHashHi: this.hashHi,
      prevHashLo: this.hashLo
    };
    this.history.push(record);
    this.lastMove = [r, c];
    this.moveCount++;
    this.winner = winner;
    this.winReason = winReason;
    this.winLine = winLine;
    if (winner === 0) {
      this.turn = opp;
    }
    return record;
  }

  undoMove() {
    if (this.history.length === 0) return null;
    const rec = this.history.pop();
    const player = rec.player;
    const opp = player === BLACK ? WHITE : BLACK;
    const i = rec.r * SIZE + rec.c;

    this.board[i] = EMPTY;
    this.hashHi ^= ZOBRIST_HI[i * 3 + player];
    this.hashLo ^= ZOBRIST_LO[i * 3 + player];

    for (let k = 0; k < rec.capturedStones.length; k++) {
      const [cr, cc] = rec.capturedStones[k];
      const ci = cr * SIZE + cc;
      this.board[ci] = opp;
      this.hashHi ^= ZOBRIST_HI[ci * 3 + opp];
      this.hashLo ^= ZOBRIST_LO[ci * 3 + opp];
    }
    this.captures[player] -= rec.pairsGained;
    this.lastMove = rec.prevLastMove;
    this.moveCount--;
    this.turn = player;
    this.winner = 0;
    this.winReason = '';
    this.winLine = null;
    return rec;
  }

  findFiveInARow(r, c, player) {
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0];
      const dc = DIRS[d][1];
      const line = [[r, c]];
      let rr = r + dr, cc = c + dc;
      while (this.inBounds(rr, cc) && this.board[rr * SIZE + cc] === player) {
        line.push([rr, cc]);
        rr += dr; cc += dc;
      }
      rr = r - dr; cc = c - dc;
      while (this.inBounds(rr, cc) && this.board[rr * SIZE + cc] === player) {
        line.unshift([rr, cc]);
        rr -= dr; cc -= dc;
      }
      if (line.length >= 5) return line;
    }
    return null;
  }
}
