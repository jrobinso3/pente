const ROOM_PREFIX = 'pente-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Encapsulates a WebRTC peer-to-peer session using PeerJS signaling
 * with short 6-character room codes. Gameplay runs directly over WebRTC DataChannel.
 */
export class PeerSession {
  constructor({ onOpen, onMessage, onClose, onStateChange, onError } = {}) {
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.roomCode = '';
    this.connected = false;
    this.onOpen = onOpen || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});
  }

  static generateRoomCode(length = 6) {
    let code = '';
    for (let i = 0; i < length; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  static parseRoomCode(input) {
    const raw = (input || '').trim();
    if (!raw) throw new Error('Enter a room code');
    let extracted = raw;
    if (raw.includes('room=')) {
      try {
        const u = new URL(raw);
        extracted = u.searchParams.get('room') || raw;
      } catch (e) {
        const m = raw.match(/room=([A-Za-z0-9_-]+)/i);
        if (m) extracted = m[1];
      }
    }
    const clean = extracted.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (clean.length < 4 || clean.length > 12) {
      throw new Error('Invalid room code');
    }
    return clean;
  }

  _requirePeerJS() {
    if (typeof window === 'undefined' || typeof window.Peer !== 'function') {
      throw new Error('PeerJS library not loaded (check internet connection)');
    }
  }

  _bindConnection(conn) {
    this.conn = conn;
    conn.on('open', () => {
      this.connected = true;
      this.onStateChange('connected');
      this.onOpen();
    });
    conn.on('data', (data) => {
      if (data && typeof data === 'object') {
        this.onMessage(data);
      }
    });
    conn.on('close', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.onStateChange('closed');
      if (wasConnected) this.onClose();
    });
    conn.on('error', (err) => {
      this.onError(err);
    });
  }

  hostRoom() {
    this._requirePeerJS();
    this.close(false);
    this.role = 'host';
    this.roomCode = PeerSession.generateRoomCode(6);
    this.onStateChange('creating');

    return new Promise((resolve, reject) => {
      const peer = new window.Peer(ROOM_PREFIX + this.roomCode, { debug: 0 });
      this.peer = peer;

      let settled = false;
      peer.on('open', () => {
        settled = true;
        this.onStateChange('waiting_guest');
        resolve(this.roomCode);
      });
      peer.on('connection', (conn) => {
        this.onStateChange('connecting');
        this._bindConnection(conn);
      });
      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        } else {
          this.onError(err);
        }
      });
    });
  }

  joinRoom(codeOrUrl) {
    this._requirePeerJS();
    const code = PeerSession.parseRoomCode(codeOrUrl);
    this.close(false);
    this.role = 'guest';
    this.roomCode = code;
    this.onStateChange('connecting');

    return new Promise((resolve, reject) => {
      const peer = new window.Peer(undefined, { debug: 0 });
      this.peer = peer;

      let settled = false;
      peer.on('open', () => {
        const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
        this._bindConnection(conn);
        conn.on('open', () => {
          if (!settled) {
            settled = true;
            resolve(code);
          }
        });
      });
      peer.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        } else {
          this.onError(err);
        }
      });
    });
  }

  send(payload) {
    if (!this.conn || !this.connected) return false;
    this.conn.send(payload);
    return true;
  }

  close(notify = true) {
    const wasConnected = this.connected;
    this.connected = false;
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (notify && wasConnected) this.onClose();
  }
}
