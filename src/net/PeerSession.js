import { WssRelay } from './WssRelay.js';

const ROOM_PREFIX = 'pente-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const RTC_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ]
};

/**
 * Encapsulates a WebRTC peer-to-peer session (PeerJS) with automatic
 * WSS relay fallback if NAT/firewalls block direct ICE traversal.
 */
export class PeerSession {
  constructor({ onOpen, onMessage, onClose, onStateChange, onError } = {}) {
    this.peer = null;
    this.conn = null;
    this.relay = null;
    this.transport = null; // 'webrtc' | 'relay'
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

  _activateTransport(kind) {
    if (this.connected) return;
    this.connected = true;
    this.transport = kind;
    if (kind === 'webrtc' && this.relay) {
      this.relay.close();
      this.relay = null;
    } else if (kind === 'relay') {
      if (this.conn) {
        try { this.conn.close(); } catch (e) {}
        this.conn = null;
      }
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
        this.peer = null;
      }
    }
    this.onStateChange('connected');
    this.onOpen();
  }

  _bindWebRTCConnection(conn, onIceFail) {
    this.conn = conn;
    const handleOpen = () => {
      this._activateTransport('webrtc');
    };

    if (conn.open) {
      queueMicrotask(handleOpen);
    } else {
      conn.on('open', handleOpen);
    }

    if (conn.peerConnection) {
      conn.peerConnection.addEventListener('iceconnectionstatechange', () => {
        const st = conn.peerConnection && conn.peerConnection.iceConnectionState;
        if ((st === 'failed' || st === 'disconnected') && !this.connected && onIceFail) {
          onIceFail();
        }
      });
    }

    conn.on('data', (data) => {
      if (this.transport !== 'webrtc') return;
      if (data && typeof data === 'object') this.onMessage(data);
    });
    conn.on('close', () => {
      if (this.transport !== 'webrtc') return;
      const was = this.connected;
      this.connected = false;
      this.onStateChange('closed');
      if (was) this.onClose();
    });
    conn.on('error', () => {
      if (!this.connected && onIceFail) onIceFail();
    });
  }

  _startRelayListener(roomCode) {
    this.relay = new WssRelay({
      onMessage: (payload) => {
        if (!payload) return;
        if (payload._relayJoin && this.role === 'host' && !this.connected) {
          this.relay.send({ _relayAccept: true });
          this._activateTransport('relay');
          return;
        }
        if (this.transport === 'relay') {
          this.onMessage(payload);
        }
      },
      onClose: () => {
        if (this.transport !== 'relay') return;
        const was = this.connected;
        this.connected = false;
        this.onStateChange('closed');
        if (was) this.onClose();
      },
      onError: (err) => this.onError(err)
    });
    return this.relay.connect(roomCode);
  }

  async hostRoom() {
    this.close(false);
    this.role = 'host';
    this.roomCode = PeerSession.generateRoomCode(6);
    this.onStateChange('creating');

    // Start WSS relay listener in parallel so guest can always fall back cleanly
    const relayReady = this._startRelayListener(this.roomCode).catch(() => {});

    if (typeof window !== 'undefined' && typeof window.Peer === 'function') {
      try {
        await new Promise((resolve, reject) => {
          const peer = new window.Peer(ROOM_PREFIX + this.roomCode, {
            debug: 0,
            config: RTC_CONFIG
          });
          this.peer = peer;
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error('PeerJS timeout'));
            }
          }, 5000);

          peer.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          });
          peer.on('connection', (conn) => {
            this.onStateChange('connecting');
            this._bindWebRTCConnection(conn);
          });
          peer.on('disconnected', () => {
            if (this.peer === peer && !peer.destroyed) {
              try { peer.reconnect(); } catch (e) {}
            }
          });
          peer.on('error', (err) => {
            clearTimeout(timer);
            if (!settled) {
              settled = true;
              reject(err);
            }
          });
        });
      } catch (e) {
        // PeerJS unavailable; relay listener is still active
        await relayReady;
      }
    } else {
      await relayReady;
    }

    this.onStateChange('waiting_guest');
    return this.roomCode;
  }

  async joinRoom(codeOrUrl) {
    const code = PeerSession.parseRoomCode(codeOrUrl);
    this.close(false);
    this.role = 'guest';
    this.roomCode = code;
    this.onStateChange('connecting');

    // Try direct WebRTC first with a 4.5s budget, then seamlessly fall back to WSS relay
    if (typeof window !== 'undefined' && typeof window.Peer === 'function') {
      const webrtcOk = await new Promise((resolve) => {
        let settled = false;
        const finish = (ok) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(ok);
        };
        const timer = setTimeout(() => finish(false), 4500);

        const peer = new window.Peer(undefined, { debug: 0, config: RTC_CONFIG });
        this.peer = peer;
        peer.on('open', () => {
          const conn = peer.connect(ROOM_PREFIX + code, { reliable: true });
          this._bindWebRTCConnection(conn, () => finish(false));
          if (conn.open) finish(true);
          else conn.on('open', () => finish(true));
        });
        peer.on('error', () => finish(false));
      });

      if (webrtcOk) return code;
      if (this.peer) {
        try { this.peer.destroy(); } catch (e) {}
        this.peer = null;
      }
      this.conn = null;
    }

    // Automatic WSS Relay fallback
    await new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.close(false);
          reject(new Error('Could not reach room — verify the host room is open'));
        }
      }, 8000);

      this.relay = new WssRelay({
        onMessage: (payload) => {
          if (!payload) return;
          if (payload._relayAccept && !this.connected) {
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              this._activateTransport('relay');
              resolve(code);
            }
            return;
          }
          if (this.transport === 'relay') {
            this.onMessage(payload);
          }
        },
        onClose: () => {
          if (this.transport !== 'relay') return;
          const was = this.connected;
          this.connected = false;
          this.onStateChange('closed');
          if (was) this.onClose();
        },
        onError: (err) => this.onError(err)
      });

      this.relay.connect(code).then(() => {
        this.relay.send({ _relayJoin: true });
      }).catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
    });

    return code;
  }

  send(payload) {
    if (!this.connected) return false;
    if (this.transport === 'webrtc' && this.conn) {
      this.conn.send(payload);
      return true;
    }
    if (this.transport === 'relay' && this.relay) {
      return this.relay.send(payload);
    }
    return false;
  }

  close(notify = true) {
    const wasConnected = this.connected;
    this.connected = false;
    this.transport = null;
    if (this.conn) {
      try { this.conn.close(); } catch (e) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    if (this.relay) {
      this.relay.close();
      this.relay = null;
    }
    if (notify && wasConnected) this.onClose();
  }
}
