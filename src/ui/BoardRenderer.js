import {
  SIZE,
  CENTER,
  EMPTY,
  BLACK,
  BEAD_THEMES,
  BOARD_THEMES
} from '../config/constants.js';

/**
 * Renders the 19x19 Pente board, glass beads, animations, and handles touch/pointer pan & zoom.
 */
export class BoardRenderer {
  constructor({ canvas, boardContainer, boardWrapper, game, state, sfx, onSelectIntersection, onInvalidMove, onPreviewSelected }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.boardContainer = boardContainer;
    this.boardWrapper = boardWrapper;
    this.game = game;
    this.state = state;
    this.sfx = sfx;
    this.onSelectIntersection = onSelectIntersection;
    this.onInvalidMove = onInvalidMove;
    this.onPreviewSelected = onPreviewSelected;

    this._pointerDown = false;
    this._pointerStart = null;
    this._panStart = null;
    this._movedDuringPointer = false;

    this._bindPointerEvents();
  }

  resize() {
    const rect = this.boardContainer.getBoundingClientRect();
    const size = Math.max(240, Math.floor(Math.min(rect.width, rect.height)));
    this.state.boardPx = size;
    this.boardWrapper.style.width = `${size}px`;
    this.boardWrapper.style.height = `${size}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.floor(size * dpr);
    this.canvas.height = Math.floor(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  getMetrics() {
    const size = this.state.boardPx;
    const active = this.state.profile && this.state.profile.activeBoard;
    const isOrig = !active || active === 'original_78';
    const isWalnut = active === 'walnut_travertine';
    const pad = isOrig
      ? Math.max(22, size * 0.082)
      : isWalnut
        ? Math.max(26, size * 0.095)
        : Math.max(14, size * 0.042);
    const gridSize = size - pad * 2;
    const step = gridSize / (SIZE - 1);
    return { size, pad, gridSize, step };
  }

  screenToBoard(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    let x = clientX - rect.left;
    let y = clientY - rect.top;

    if (this.state.zoom > 1) {
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      x = (x - cx - this.state.panX) / this.state.zoom + cx;
      y = (y - cy - this.state.panY) / this.state.zoom + cy;
    }

    const { pad, step } = this.getMetrics();
    const c = Math.round((x - pad) / step);
    const r = Math.round((y - pad) / step);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    return { r, c };
  }

  triggerCaptureFlash(stones, color) {
    this.state.captureFlash = stones.map(([r, c]) => ({ r, c, color, alpha: 0.9 }));
    const stepAnim = () => {
      let anyLeft = false;
      for (const f of this.state.captureFlash) {
        f.alpha -= 0.09;
        if (f.alpha > 0) anyLeft = true;
      }
      if (anyLeft) {
        this.draw();
        requestAnimationFrame(stepAnim);
      } else {
        this.state.captureFlash = [];
        this.draw();
      }
    };
    requestAnimationFrame(stepAnim);
  }

  draw() {
    const ctx = this.ctx;
    const { game, state } = this;
    const { size, pad, gridSize, step } = this.getMetrics();
    ctx.clearRect(0, 0, size, size);

    ctx.save();
    if (state.zoom > 1) {
      const cx = size / 2;
      const cy = size / 2;
      ctx.translate(cx + state.panX, cy + state.panY);
      ctx.scale(state.zoom, state.zoom);
      ctx.translate(-cx, -cy);
    }

    const bTheme = BOARD_THEMES[state.profile.activeBoard] || BOARD_THEMES.original_78;

    // 1. Board Surface Background
    if (bTheme.walnutTravertine) {
      const frameW = Math.max(16, size * 0.062);

      // Oiled walnut mitered frame
      const frameGrad = ctx.createLinearGradient(0, 0, size, size);
      frameGrad.addColorStop(0, '#5a3d29');
      frameGrad.addColorStop(0.5, '#462e1e');
      frameGrad.addColorStop(1, '#362215');
      ctx.fillStyle = frameGrad;
      ctx.fillRect(0, 0, size, size);

      // Subtle walnut grain along frame rails
      ctx.save();
      ctx.strokeStyle = 'rgba(20, 10, 4, 0.22)';
      ctx.lineWidth = 1.2;
      for (let i = 4; i < size; i += 7) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.bezierCurveTo(size * 0.35, i + Math.sin(i * 0.3) * 1.6, size * 0.65, i - Math.cos(i * 0.2) * 1.6, size, i);
        ctx.stroke();
      }
      // Diagonal miter lines at corners
      ctx.strokeStyle = 'rgba(24, 14, 8, 0.45)';
      ctx.lineWidth = 1.4;
      [
        [0, 0, frameW, frameW],
        [size, 0, size - frameW, frameW],
        [0, size, frameW, size - frameW],
        [size, size, size - frameW, size - frameW]
      ].forEach(([x0, y0, x1, y1]) => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      });
      // Outer highlight bevel
      ctx.strokeStyle = 'rgba(255, 224, 185, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      ctx.restore();

      // Honed travertine limestone interior
      const stoneGrad = ctx.createLinearGradient(frameW, frameW, size - frameW, size - frameW);
      stoneGrad.addColorStop(0, '#ebe2d1');
      stoneGrad.addColorStop(0.5, '#e3d8c4');
      stoneGrad.addColorStop(1, '#d8ccb5');
      ctx.fillStyle = stoneGrad;
      ctx.fillRect(frameW, frameW, size - frameW * 2, size - frameW * 2);

      // Subtle travertine mineral clouds
      const clouds = [
        [0.3, 0.28, 0.26, 'rgba(182, 165, 138, 0.16)'],
        [0.72, 0.65, 0.30, 'rgba(170, 152, 124, 0.15)'],
        [0.45, 0.78, 0.22, 'rgba(255, 250, 240, 0.20)']
      ];
      for (const [cx, cy, cr, col] of clouds) {
        const rg = ctx.createRadialGradient(size * cx, size * cy, 2, size * cx, size * cy, size * cr);
        rg.addColorStop(0, col);
        rg.addColorStop(1, 'rgba(235, 226, 209, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(frameW, frameW, size - frameW * 2, size - frameW * 2);
      }

      // Recessed inner frame shadow onto travertine
      ctx.save();
      ctx.strokeStyle = 'rgba(24, 16, 10, 0.32)';
      ctx.lineWidth = 3;
      ctx.strokeRect(frameW + 1, frameW + 1, size - frameW * 2 - 2, size - frameW * 2 - 2);
      ctx.strokeStyle = 'rgba(255, 248, 236, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(frameW - 0.5, frameW - 0.5, size - frameW * 2 + 1, size - frameW * 2 + 1);
      ctx.restore();
    } else if (bTheme.tiedye) {
      const baseGrad = ctx.createLinearGradient(0, 0, size, size);
      baseGrad.addColorStop(0, '#fbcfe8');
      baseGrad.addColorStop(0.35, '#fde68a');
      baseGrad.addColorStop(0.7, '#a5f3fc');
      baseGrad.addColorStop(1, '#ddd6fe');
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, size, size);

      const bursts = [
        [0.25, 0.25, 0.55, 'rgba(236, 72, 153, 0.34)', 'rgba(245, 158, 11, 0.18)'],
        [0.78, 0.28, 0.52, 'rgba(6, 182, 212, 0.34)', 'rgba(139, 92, 246, 0.18)'],
        [0.72, 0.78, 0.58, 'rgba(245, 158, 11, 0.34)', 'rgba(236, 72, 153, 0.16)'],
        [0.24, 0.76, 0.52, 'rgba(139, 92, 246, 0.34)', 'rgba(16, 185, 129, 0.16)'],
        [0.5, 0.5, 0.48, 'rgba(250, 204, 21, 0.28)', 'rgba(255, 255, 255, 0)']
      ];
      for (const [bx, by, br, cIn, cMid] of bursts) {
        const rg = ctx.createRadialGradient(size * bx, size * by, size * 0.02, size * bx, size * by, size * br);
        rg.addColorStop(0, cIn);
        rg.addColorStop(0.55, cMid);
        rg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, size, size);
      }
    } else if (bTheme.original78) {
      ctx.fillStyle = '#87281f';
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = '#1b1410';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size - 2, size - 2);
      ctx.strokeStyle = 'rgba(235, 217, 188, 0.72)';
      ctx.lineWidth = Math.max(1, pad * 0.08);
      ctx.strokeRect(pad * 0.16, pad * 0.16, size - pad * 0.32, size - pad * 0.32);

      ctx.fillStyle = 'rgba(235, 217, 188, 0.65)';
      const motifCount = 10;
      for (let m = 0; m < motifCount; m++) {
        const t = pad + (gridSize * (m + 0.5)) / motifCount;
        if (Math.abs(t - size / 2) < pad * 1.15) continue;
        [pad * 0.52, size - pad * 0.52].forEach((yy) => {
          ctx.beginPath();
          ctx.arc(t, yy, pad * 0.16, 0, Math.PI * 2);
          ctx.fill();
        });
        [pad * 0.52, size - pad * 0.52].forEach((xx) => {
          ctx.beginPath();
          ctx.arc(xx, t, pad * 0.16, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      ctx.fillStyle = '#e4d0ae';
      ctx.fillRect(pad, pad, gridSize, gridSize);

      const medR = pad * 0.92;
      const medallions = [
        { x: size / 2, y: pad * 0.22, start: 0, end: Math.PI, rot: Math.PI },
        { x: size / 2, y: size - pad * 0.22, start: Math.PI, end: Math.PI * 2, rot: 0 },
        { x: pad * 0.22, y: size / 2, start: -Math.PI / 2, end: Math.PI / 2, rot: Math.PI / 2 },
        { x: size - pad * 0.22, y: size / 2, start: Math.PI / 2, end: Math.PI * 1.5, rot: -Math.PI / 2 }
      ];
      medallions.forEach((med) => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(med.x, med.y, medR, med.start, med.end);
        ctx.closePath();
        ctx.fillStyle = '#181412';
        ctx.fill();
        ctx.strokeStyle = '#ebd9bc';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.translate(med.x, med.y);
        ctx.rotate(med.rot);
        ctx.fillStyle = '#ebd9bc';
        ctx.font = `400 ${Math.max(7, Math.round(pad * 0.31))}px 'Ibarra Real Nova', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PENTE', 0, -medR * 0.42);
        ctx.restore();
      });
    } else if (bTheme.checkered) {
      const cellSz = Math.max(10, pad * 0.65);
      for (let y = 0; y < size; y += cellSz) {
        for (let x = 0; x < size; x += cellSz) {
          const odd = (Math.floor(x / cellSz) + Math.floor(y / cellSz)) % 2 === 0;
          ctx.fillStyle = odd ? '#b91c1c' : '#fef3c7';
          ctx.fillRect(x, y, cellSz + 0.5, cellSz + 0.5);
        }
      }
      ctx.fillStyle = '#fdf4dc';
      ctx.fillRect(pad - 3, pad - 3, gridSize + 6, gridSize + 6);
    } else {
      const woodGrad = ctx.createLinearGradient(0, 0, size, size);
      woodGrad.addColorStop(0, bTheme.bg0);
      woodGrad.addColorStop(0.5, bTheme.bg1);
      woodGrad.addColorStop(1, bTheme.bg2);
      ctx.fillStyle = woodGrad;
      ctx.fillRect(0, 0, size, size);
    }

    // Subtle texture / grain lines (skip on walnutTravertine so stone looks crisp)
    if (!bTheme.walnutTravertine) {
      ctx.strokeStyle = bTheme.grain;
      ctx.lineWidth = 1;
      for (let y = 6; y < size; y += 9) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.33, y + Math.sin(y) * 2, size * 0.66, y - Math.cos(y) * 2, size, y);
        ctx.stroke();
      }
    }

    // 2. Grid Lines
    ctx.strokeStyle = bTheme.line;
    ctx.lineWidth = 1;
    for (let i = 0; i < SIZE; i++) {
      const p = pad + i * step;
      ctx.beginPath();
      ctx.moveTo(pad, p);
      ctx.lineTo(pad + gridSize, p);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p, pad);
      ctx.lineTo(p, pad + gridSize);
      ctx.stroke();
    }

    ctx.strokeStyle = bTheme.border;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(pad, pad, gridSize, gridSize);

    // 3. Star Points (Hoshi) + Center Ring
    const stars = [3, 9, 15];
    for (const sr of stars) {
      for (const sc of stars) {
        const sx = pad + sc * step;
        const sy = pad + sr * step;
        const isCenter = sr === CENTER && sc === CENTER;
        ctx.fillStyle = isCenter ? bTheme.tengen : bTheme.star;
        if (bTheme.original78) {
          const dr = isCenter ? step * 0.22 : step * 0.16;
          ctx.beginPath();
          ctx.moveTo(sx, sy - dr);
          ctx.lineTo(sx + dr, sy);
          ctx.lineTo(sx, sy + dr);
          ctx.lineTo(sx - dr, sy);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(sx, sy, isCenter ? step * 0.19 : step * 0.13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. Tournament Ring Indicator on Black's 2nd move
    if (game.tournamentRule && game.moveCount === 2 && game.turn === BLACK) {
      ctx.save();
      ctx.strokeStyle = 'rgba(180, 40, 20, 0.45)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.4;
      const rBox = step * 2.5;
      const cx = pad + CENTER * step;
      const cy = pad + CENTER * step;
      ctx.strokeRect(cx - rBox, cy - rBox, rBox * 2, rBox * 2);
      ctx.restore();
    }

    // 5a. Mentor Coach Markers
    if (state.mentorMode && state.mentorShowOverlay && game.winner === 0 && game.turn === state.humanColor && !state.aiThinking) {
      const markers = [];
      if (state.mentorBestMove) markers.push({ pt: state.mentorBestMove, color: '#10b981', label: '★' });
      if (state.mentorAltMove && (!state.mentorBestMove || state.mentorAltMove.r !== state.mentorBestMove.r || state.mentorAltMove.c !== state.mentorBestMove.c)) {
        markers.push({ pt: state.mentorAltMove, color: '#f59e0b', label: '2' });
      }
      for (const m of markers) {
        const mx = pad + m.pt.c * step;
        const my = pad + m.pt.r * step;
        ctx.save();
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 2.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(mx, my, step * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = m.color;
        ctx.font = `400 ${Math.max(9, Math.round(step * 0.43))}px 'Ibarra Real Nova', serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(m.label, mx, my);
        ctx.restore();
      }
    }

    // 5. Hint Marker
    if (state.hintPoint && game.winner === 0) {
      const hx = pad + state.hintPoint.c * step;
      const hy = pad + state.hintPoint.r * step;
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(hx, hy, step * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
      ctx.fill();
      ctx.restore();
    }

    // 6. Placed Stones (Glass Beads)
    const radius = step * 0.45;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const cell = game.board[r * SIZE + c];
        if (cell === EMPTY) continue;
        this.drawStone(pad + c * step, pad + r * step, radius, cell, 1);
      }
    }

    // 7. Capture Flash Particles
    if (state.captureFlash.length > 0) {
      for (const f of state.captureFlash) {
        this.drawStone(pad + f.c * step, pad + f.r * step, radius * (1 + (1 - f.alpha) * 0.35), f.color, f.alpha);
      }
    }

    // 8. Last Move Indicator
    if (game.lastMove) {
      const [lr, lc] = game.lastMove;
      const lx = pad + lc * step;
      const ly = pad + lr * step;
      ctx.save();
      ctx.beginPath();
      ctx.arc(lx, ly, radius * 0.32, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = Math.max(1.5, radius * 0.12);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(lx, ly, radius * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fill();
      ctx.restore();
    }

    // 9. Winning Line Highlight
    if (game.winLine && game.winLine.length >= 5) {
      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = Math.max(3, step * 0.2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const first = game.winLine[0];
      const last = game.winLine[game.winLine.length - 1];
      ctx.moveTo(pad + first[1] * step, pad + first[0] * step);
      ctx.lineTo(pad + last[1] * step, pad + last[0] * step);
      ctx.stroke();
      ctx.restore();
    }

    // 10. Aiming Crosshair / Preview Ghost Stone
    const isHumanTurn = state.gameMode === 'local2p' || game.turn === state.humanColor;
    const activeGhost = state.aimPoint || state.previewPoint;
    if (activeGhost && !state.aiThinking && game.winner === 0 && isHumanTurn) {
      const legal = game.isLegalMove(activeGhost.r, activeGhost.c);
      const gx = pad + activeGhost.c * step;
      const gy = pad + activeGhost.r * step;
      const ghostColor = state.gameMode === 'local2p' ? game.turn : state.humanColor;

      ctx.save();
      ctx.strokeStyle = legal ? 'rgba(16, 185, 129, 0.85)' : 'rgba(239, 68, 68, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, pad); ctx.lineTo(gx, pad + gridSize);
      ctx.moveTo(pad, gy); ctx.lineTo(pad + gridSize, gy);
      ctx.stroke();

      if (legal) {
        this.drawStone(gx, gy, radius, ghostColor, 0.55);
      } else {
        ctx.beginPath();
        ctx.arc(gx, gy, radius * 0.55, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  }

  drawStone(x, y, r, color, alpha) {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    const beadSet = BEAD_THEMES[this.state.profile.activeBead] || BEAD_THEMES.classic;
    const pStyle = color === BLACK ? beadSet.p1 : beadSet.p2;

    const shadowGrad = ctx.createRadialGradient(
      x + r * 0.16, y + r * 0.2, r * 0.35,
      x + r * 0.16, y + r * 0.2, r * 1.18
    );
    shadowGrad.addColorStop(0, 'rgba(20, 12, 4, 0.42)');
    shadowGrad.addColorStop(0.68, 'rgba(20, 12, 4, 0.24)');
    shadowGrad.addColorStop(1, 'rgba(20, 12, 4, 0)');
    ctx.beginPath();
    ctx.arc(x + r * 0.16, y + r * 0.2, r * 1.18, 0, Math.PI * 2);
    ctx.fillStyle = shadowGrad;
    ctx.fill();

    const cxCaustic = x + r * 0.34;
    const cyCaustic = y + r * 0.38;
    const causticPool = ctx.createRadialGradient(cxCaustic, cyCaustic, r * 0.04, cxCaustic, cyCaustic, r * 0.75);
    causticPool.addColorStop(0, pStyle.caustic);
    causticPool.addColorStop(0.55, pStyle.c1);
    causticPool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.beginPath();
    ctx.arc(cxCaustic, cyCaustic, r * 0.75, 0, Math.PI * 2);
    ctx.fillStyle = causticPool;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = pStyle.edge;
    ctx.lineWidth = Math.max(0.8, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(x - r, y - r * 0.04);
    ctx.quadraticCurveTo(x, y + r * 0.16, x + r, y - r * 0.04);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.04, y - r);
    ctx.quadraticCurveTo(x + r * 0.16, y, x - r * 0.04, y + r);
    ctx.stroke();

    const bodyGrad = ctx.createRadialGradient(x - r * 0.12, y - r * 0.12, r * 0.08, x, y, r);
    bodyGrad.addColorStop(0, pStyle.c0);
    bodyGrad.addColorStop(0.48, pStyle.c1);
    bodyGrad.addColorStop(0.82, pStyle.c2);
    bodyGrad.addColorStop(1, pStyle.c3);
    ctx.fillStyle = bodyGrad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    const innerCaustic = ctx.createRadialGradient(
      x + r * 0.36, y + r * 0.38, r * 0.02,
      x + r * 0.28, y + r * 0.3, r * 0.68
    );
    innerCaustic.addColorStop(0, pStyle.caustic);
    innerCaustic.addColorStop(0.5, pStyle.c0);
    innerCaustic.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = innerCaustic;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);

    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0.15, Math.PI * 0.48);
    ctx.strokeStyle = pStyle.rim;
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.save();
    ctx.translate(x - r * 0.32, y - r * 0.34);
    ctx.rotate(-Math.PI / 4);
    const specGrad = ctx.createRadialGradient(0, 0, r * 0.02, 0, 0, r * 0.36);
    specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.96)');
    specGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.48)');
    specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = specGrad;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.34, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(x - r * 0.44, y - r * 0.14, r * 0.075, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.82)';
    ctx.fill();

    ctx.restore();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = pStyle.edge;
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.restore();
  }

  _bindPointerEvents() {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.sfx.init();
      if (this.state.aiThinking || this.game.winner !== 0) return;
      this.canvas.setPointerCapture(e.pointerId);
      this._pointerDown = true;
      this._movedDuringPointer = false;
      this._pointerStart = { x: e.clientX, y: e.clientY };
      this._panStart = { x: this.state.panX, y: this.state.panY };

      if (this.state.zoom === 1) {
        this.state.aimPoint = this.screenToBoard(e.clientX, e.clientY);
        this.draw();
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const isHumanTurn = this.state.gameMode === 'local2p' || this.game.turn === this.state.humanColor;
      if (!this._pointerDown) {
        if (e.pointerType === 'mouse' && !this.state.aiThinking && this.game.winner === 0 && isHumanTurn) {
          this.state.aimPoint = this.screenToBoard(e.clientX, e.clientY);
          this.draw();
        }
        return;
      }
      const dx = e.clientX - this._pointerStart.x;
      const dy = e.clientY - this._pointerStart.y;
      if (Math.hypot(dx, dy) > 8) this._movedDuringPointer = true;

      if (this.state.zoom > 1 && this._movedDuringPointer) {
        const maxPan = (this.state.boardPx * (this.state.zoom - 1)) / 2;
        this.state.panX = Math.max(-maxPan, Math.min(maxPan, this._panStart.x + dx));
        this.state.panY = Math.max(-maxPan, Math.min(maxPan, this._panStart.y + dy));
        this.state.aimPoint = null;
      } else {
        this.state.aimPoint = this.screenToBoard(e.clientX, e.clientY);
      }
      this.draw();
    });

    this.canvas.addEventListener('pointerup', (e) => {
      if (!this._pointerDown) return;
      this._pointerDown = false;
      const pt = (this.state.zoom > 1 && this._movedDuringPointer) ? null : this.screenToBoard(e.clientX, e.clientY);
      this.state.aimPoint = null;

      const isHumanTurn = this.state.gameMode === 'local2p' || this.game.turn === this.state.humanColor;
      if (pt && isHumanTurn && this.game.winner === 0) {
        if (this.state.confirmMode) {
          if (this.game.isLegalMove(pt.r, pt.c)) {
            this.state.previewPoint = pt;
            this.onPreviewSelected();
          } else {
            this.onInvalidMove();
          }
        } else {
          this.onSelectIntersection(pt.r, pt.c);
        }
      }
      this.draw();
    });

    this.canvas.addEventListener('pointerleave', () => {
      if (!this._pointerDown) {
        this.state.aimPoint = null;
        this.draw();
      }
    });
  }
}
