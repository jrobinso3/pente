import { SIZE, CENTER, EMPTY, BLACK, WHITE, DIRS, DIRS8, AI_PROFILES } from '../config/constants.js';

export class PenteAI {
  constructor() {
    this.tt = new Map();
    this.nodes = 0;
    this.startTime = 0;
    this.timeLimit = 600;
    this.aborted = false;
  }

  chooseMove(game, tierKey) {
    const profile = AI_PROFILES[tierKey] || AI_PROFILES.master;
    this.nodes = 0;
    this.startTime = performance.now();
    this.timeLimit = profile.timeMs;
    this.aborted = false;
    if (this.tt.size > 60000) this.tt.clear();

    // Forced center on move 0
    if (game.moveCount === 0) return { r: CENTER, c: CENTER, score: 0 };

    const aiPlayer = game.turn;
    const candidates = this.generateCandidates(game, aiPlayer);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    // 1. Immediate Win Check (5-in-a-row or 5th capture)
    for (const m of candidates) {
      const rec = game.makeMove(m.r, m.c);
      const won = game.winner === aiPlayer;
      game.undoMove();
      if (won) return { r: m.r, c: m.c, score: 1000000 };
    }

    // 2. Novice mode: 1-ply with meaningful noise & occasional human-like oversight
    if (profile.depth <= 1) {
      const scored = [];
      for (const m of candidates.slice(0, 14)) {
        game.makeMove(m.r, m.c);
        const val = -this.evaluateBoard(game, game.turn) + (Math.random() - 0.5) * profile.noise;
        game.undoMove();
        scored.push({ r: m.r, c: m.c, score: val });
      }
      scored.sort((a, b) => b.score - a.score);
      if (profile.blunderRate && Math.random() < profile.blunderRate && scored.length > 2) {
        const pick = scored[1 + Math.floor(Math.random() * Math.min(3, scored.length - 1))];
        return pick;
      }
      return scored[0];
    }

    // 3. Iterative Deepening Alpha-Beta
    let bestMove = candidates[0];
    let bestScore = -Infinity;

    for (let depth = 2; depth <= profile.depth; depth++) {
      let currentBest = null;
      let currentScore = -Infinity;
      let alpha = -2000000;
      const beta = 2000000;

      // Order bestMove from previous iteration first
      if (bestMove) {
        const idx = candidates.findIndex(m => m.r === bestMove.r && m.c === bestMove.c);
        if (idx > 0) {
          candidates.unshift(candidates.splice(idx, 1)[0]);
        }
      }

      for (const m of candidates) {
        if (this.isTimeUp()) { this.aborted = true; break; }
        game.makeMove(m.r, m.c);
        let score;
        if (game.winner === aiPlayer) {
          score = 900000 + depth * 1000;
        } else {
          score = -this.alphabeta(game, depth - 1, -beta, -alpha, game.turn);
        }
        game.undoMove();

        if (this.aborted) break;
        if (score > currentScore) {
          currentScore = score;
          currentBest = m;
        }
        if (score > alpha) alpha = score;
      }

      if (!this.aborted && currentBest) {
        bestMove = currentBest;
        bestScore = currentScore;
        if (bestScore >= 850000) break; // Found forced win
      } else {
        break;
      }
    }

    // Controlled tactical variance for Club / Master tiers when no forced win/loss
    if (profile.blunderRate && Math.random() < profile.blunderRate && bestScore < 40000 && candidates.length > 2) {
      const alt = candidates[1 + Math.floor(Math.random() * Math.min(2, candidates.length - 1))];
      return { r: alt.r, c: alt.c, score: bestScore };
    }
    return { r: bestMove.r, c: bestMove.c, score: bestScore };
  }

  isTimeUp() {
    return (this.nodes & 127) === 0 && (performance.now() - this.startTime) >= this.timeLimit;
  }

  alphabeta(game, depth, alpha, beta, player) {
    this.nodes++;
    if (this.isTimeUp()) {
      this.aborted = true;
      return 0;
    }

    const ttKey = `${game.hashHi}_${game.hashLo}_${player}`;
    const ttEntry = this.tt.get(ttKey);
    if (ttEntry && ttEntry.depth >= depth) {
      if (ttEntry.flag === 0) return ttEntry.val;
      if (ttEntry.flag === -1 && ttEntry.val <= alpha) return alpha;
      if (ttEntry.flag === 1 && ttEntry.val >= beta) return beta;
    }

    if (depth <= 0) {
      return this.evaluateBoard(game, player);
    }

    const moves = this.generateCandidates(game, player, ttEntry ? ttEntry.bestMove : null);
    if (moves.length === 0) return 0;

    // Limit branching factor at deeper plies for speed
    const maxBranch = depth >= 4 ? 14 : (depth >= 2 ? 18 : 22);
    const limit = Math.min(moves.length, maxBranch);

    let bestVal = -Infinity;
    let bestMove = moves[0];
    let origAlpha = alpha;

    for (let i = 0; i < limit; i++) {
      const m = moves[i];
      game.makeMove(m.r, m.c);
      let val;
      if (game.winner === player) {
        val = 900000 + depth * 1000;
      } else {
        val = -this.alphabeta(game, depth - 1, -beta, -alpha, game.turn);
      }
      game.undoMove();

      if (this.aborted) return 0;

      if (val > bestVal) {
        bestVal = val;
        bestMove = m;
      }
      if (val > alpha) alpha = val;
      if (alpha >= beta) break;
    }

    let flag = 0;
    if (bestVal <= origAlpha) flag = -1;
    else if (bestVal >= beta) flag = 1;

    this.tt.set(ttKey, { depth, val: bestVal, flag, bestMove });
    return bestVal;
  }

  generateCandidates(game, player, pvMove = null) {
    const opp = player === BLACK ? WHITE : BLACK;
    const seen = new Uint8Array(SIZE * SIZE);
    const list = [];
    const radius = game.adjacentOnly ? 1 : 2;

    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (game.board[r * SIZE + c] !== EMPTY) {
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) {
                const idx = nr * SIZE + nc;
                if (!seen[idx] && game.isLegalMove(nr, nc)) {
                  seen[idx] = 1;
                  const score = this.scoreMoveHeuristic(game, nr, nc, player, opp, pvMove);
                  list.push({ r: nr, c: nc, h: score });
                }
              }
            }
          }
        }
      }
    }

    list.sort((a, b) => b.h - a.h);
    return list;
  }

  scoreMoveHeuristic(game, r, c, player, opp, pvMove) {
    if (pvMove && pvMove.r === r && pvMove.c === c) return 5000000;

    let score = 0;
    // Center bias
    score += 14 - (Math.abs(r - CENTER) + Math.abs(c - CENTER));

    // Check immediate captures by playing (r, c)
    let myCaps = 0;
    let oppCapsPrevented = 0;
    for (let d = 0; d < 8; d++) {
      const dr = DIRS8[d][0], dc = DIRS8[d][1];
      const r1 = r + dr, c1 = c + dc;
      const r2 = r + 2 * dr, c2 = c + 2 * dc;
      const r3 = r + 3 * dr, c3 = c + 3 * dc;
      if (r3 >= 0 && r3 < SIZE && c3 >= 0 && c3 < SIZE) {
        const b1 = game.board[r1 * SIZE + c1];
        const b2 = game.board[r2 * SIZE + c2];
        const b3 = game.board[r3 * SIZE + c3];
        if (b1 === opp && b2 === opp && b3 === player) myCaps++;
        if (b1 === player && b2 === player && b3 === opp) oppCapsPrevented++;
      }
    }
    if (myCaps > 0) {
      score += (game.captures[player] + myCaps >= 5) ? 900000 : myCaps * 4200;
    }
    if (oppCapsPrevented > 0) {
      score += (game.captures[opp] + oppCapsPrevented >= 5) ? 60000 : oppCapsPrevented * 1600;
    }

    // Line potential for both attack and defense
    for (let d = 0; d < 4; d++) {
      const dr = DIRS[d][0], dc = DIRS[d][1];
      const myInfo = this.lineStatsAt(game, r, c, dr, dc, player);
      const oppInfo = this.lineStatsAt(game, r, c, dr, dc, opp);

      if (myInfo.count >= 5) score += 1000000;
      else if (myInfo.count === 4 && myInfo.openEnds === 2) score += 80000;
      else if (myInfo.count === 4 && myInfo.openEnds === 1) score += 14000;
      else if (myInfo.count === 3 && myInfo.openEnds === 2) score += 9500;
      else if (myInfo.count === 3 && myInfo.openEnds === 1) score += 1200;
      else if (myInfo.count === 2 && myInfo.openEnds === 2) score += 450;

      if (oppInfo.count >= 5) score += 500000; // Must block 5!
      else if (oppInfo.count === 4 && oppInfo.openEnds === 2) score += 45000;
      else if (oppInfo.count === 4 && oppInfo.openEnds === 1) score += 11000;
      else if (oppInfo.count === 3 && oppInfo.openEnds === 2) score += 8000;
      else if (oppInfo.count === 3 && oppInfo.openEnds === 1) score += 900;
      else if (oppInfo.count === 2 && oppInfo.openEnds === 2) score += 300;
    }

    return score;
  }

  lineStatsAt(game, r, c, dr, dc, color) {
    let count = 1;
    let openEnds = 0;

    let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && game.board[rr * SIZE + cc] === color) {
      count++;
      rr += dr; cc += dc;
    }
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && game.board[rr * SIZE + cc] === EMPTY) {
      openEnds++;
    }

    rr = r - dr; cc = c - dc;
    while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && game.board[rr * SIZE + cc] === color) {
      count++;
      rr -= dr; cc -= dc;
    }
    if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && game.board[rr * SIZE + cc] === EMPTY) {
      openEnds++;
    }
    return { count, openEnds };
  }

  evaluateBoard(game, perspective) {
    const opp = perspective === BLACK ? WHITE : BLACK;
    if (game.winner === perspective) return 900000;
    if (game.winner === opp) return -900000;

    let score = 0;

    // Capture score (exponentially more valuable near 5 pairs)
    const capWeights = [0, 350, 950, 2200, 6500, 900000];
    score += capWeights[Math.min(5, game.captures[perspective])];
    score -= capWeights[Math.min(5, game.captures[opp])] * 1.08;

    // Scan all 4 directions across the board
    const myLines = this.evalAllLines(game, perspective, opp);
    score += myLines;

    // Penalize vulnerable pairs (X O O _) that can be captured immediately
    score += this.evalVulnerablePairs(game, perspective, opp);

    return score;
  }

  evalVulnerablePairs(game, perspective, opp) {
    let delta = 0;
    const b = game.board;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const p = b[r * SIZE + c];
        if (p === EMPTY) continue;
        for (let d = 0; d < 4; d++) {
          const dr = DIRS[d][0], dc = DIRS[d][1];
          const r1 = r + dr, c1 = c + dc;
          const r2 = r + 2 * dr, c2 = c + 2 * dc;
          const rPrev = r - dr, cPrev = c - dc;
          if (r2 < 0 || r2 >= SIZE || c2 < 0 || c2 >= SIZE) continue;
          if (b[r1 * SIZE + c1] !== p) continue;
          // Ensure exact pair (not 3+)
          const prevSame = (rPrev >= 0 && rPrev < SIZE && cPrev >= 0 && cPrev < SIZE && b[rPrev * SIZE + cPrev] === p);
          const nextSame = (b[r2 * SIZE + c2] === p);
          if (prevSame || nextSame) continue;

          const prevVal = (rPrev >= 0 && rPrev < SIZE && cPrev >= 0 && cPrev < SIZE) ? b[rPrev * SIZE + cPrev] : -1;
          const nextVal = b[r2 * SIZE + c2];
          const other = p === BLACK ? WHITE : BLACK;

          // If one end has enemy and other end is empty -> capture threat!
          if ((prevVal === other && nextVal === EMPTY) || (nextVal === other && prevVal === EMPTY)) {
            delta += (p === opp) ? 260 : -290;
          }
        }
      }
    }
    return delta;
  }

  evalAllLines(game, perspective, opp) {
    let total = 0;
    const b = game.board;

    const scorePattern = (len, openEnds, gaps, isMine) => {
      const mult = isMine ? 1 : -1.12; // Slight defense priority
      if (len >= 5 && gaps === 0) return 200000 * mult;
      if (gaps === 0) {
        if (len === 4) {
          if (openEnds === 2) return 42000 * mult;
          if (openEnds === 1) return (isMine ? 4500 : 8500) * (isMine ? 1 : -1);
        } else if (len === 3) {
          if (openEnds === 2) return (isMine ? 3800 : 6200) * (isMine ? 1 : -1);
          if (openEnds === 1) return 320 * mult;
        } else if (len === 2) {
          if (openEnds === 2) return 140 * mult;
          if (openEnds === 1) return 35 * mult;
        } else if (len === 1 && openEnds === 2) {
          return 8 * mult;
        }
      } else if (gaps === 1) {
        // Gapped 4 (X X X _ X or X X _ X X) or gapped 3 (X X _ X)
        if (len === 4) return (isMine ? 4000 : 7500) * (isMine ? 1 : -1);
        if (len === 3 && openEnds === 2) return (isMine ? 2400 : 4200) * (isMine ? 1 : -1);
      }
      return 0;
    };

    // Scan horizontal, vertical, and diagonals
    const scanRay = (startR, startC, dr, dc) => {
      let r = startR, c = startC;
      let curColor = EMPTY, len = 0, openStart = false;
      while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
        const cell = b[r * SIZE + c];
        if (cell === EMPTY) {
          if (curColor !== EMPTY) {
            total += scorePattern(len, (openStart ? 1 : 0) + 1, 0, curColor === perspective);
            // Check gapped pattern across this single empty cell
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && b[nr * SIZE + nc] === curColor) {
              let extLen = len + 1;
              let tr = nr + dr, tc = nc + dc;
              while (tr >= 0 && tr < SIZE && tc >= 0 && tc < SIZE && b[tr * SIZE + tc] === curColor) {
                extLen++;
                tr += dr; tc += dc;
              }
              const openEnd = (tr >= 0 && tr < SIZE && tc >= 0 && tc < SIZE && b[tr * SIZE + tc] === EMPTY);
              total += scorePattern(extLen, (openStart ? 1 : 0) + (openEnd ? 1 : 0), 1, curColor === perspective);
            }
            curColor = EMPTY;
            len = 0;
          }
          openStart = true;
        } else if (cell === curColor) {
          len++;
        } else {
          if (curColor !== EMPTY) {
            total += scorePattern(len, openStart ? 1 : 0, 0, curColor === perspective);
          }
          curColor = cell;
          len = 1;
          openStart = (r - dr >= 0 && r - dr < SIZE && c - dc >= 0 && c - dc < SIZE && b[(r - dr) * SIZE + (c - dc)] === EMPTY);
        }
        r += dr; c += dc;
      }
      if (curColor !== EMPTY) {
        total += scorePattern(len, openStart ? 1 : 0, 0, curColor === perspective);
      }
    };

    for (let i = 0; i < SIZE; i++) {
      scanRay(i, 0, 0, 1); // rows
      scanRay(0, i, 1, 0); // cols
    }
    for (let i = 0; i < SIZE; i++) {
      scanRay(i, 0, 1, 1);
      if (i > 0) scanRay(0, i, 1, 1);
      scanRay(i, 0, -1, 1);
      if (i > 0) scanRay(SIZE - 1, i, -1, 1);
    }

    return total;
  }
}

