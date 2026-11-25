const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

/**
 * Encapsulates a serverless WebRTC peer-to-peer RTCDataChannel session
 * using copy-paste / URL-encoded SDP offers and answers.
 */
export class PeerSession {
  constructor({ onOpen, onMessage, onClose, onStateChange, onError } = {}) {
    this.pc = null;
    this.dc = null;
    this.role = null; // 'host' | 'guest'
    this.connected = false;
    this.onOpen = onOpen || (() => {});
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this.onError = onError || (() => {});
  }

  static encodeSignal(desc) {
    const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static decodeSignal(code) {
    const clean = (code || '').trim();
    if (!clean) throw new Error('Empty connection code');
    // Support full URL with ?offer=... or raw base64url code
    let raw = clean;
    if (clean.includes('offer=')) {
      try {
        const u = new URL(clean);
        raw = u.searchParams.get('offer') || clean;
      } catch (e) {
        const m = clean.match(/offer=([A-Za-z0-9_-]+)/);
        if (m) raw = m[1];
      }
    }
    const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || !parsed.type || !parsed.sdp) throw new Error('Invalid connection code');
    return parsed;
  }

  _createPeerConnection() {
    this.close(false);
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      const st = this.pc.iceConnectionState;
      this.onStateChange(st);
      if (st === 'disconnected' || st === 'failed' || st === 'closed') {
        if (this.connected) {
          this.connected = false;
          this.onClose();
        }
      }
    };
  }

  _bindDataChannel(dc) {
    this.dc = dc;
    this.dc.onopen = () => {
      this.connected = true;
      this.onStateChange('connected');
      this.onOpen();
    };
    this.dc.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        this.onMessage(msg);
      } catch (e) {}
    };
    this.dc.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.onStateChange('closed');
      if (wasConnected) this.onClose();
    };
    this.dc.onerror = (err) => {
      this.onError(err);
    };
  }

  _waitForIceGathering(timeoutMs = 2500) {
    return new Promise((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        if (this.pc) this.pc.removeEventListener('icegatheringstatechange', onChange);
        resolve();
      }, timeoutMs);
      const onChange = () => {
        if (this.pc && this.pc.iceGatheringState === 'complete') {
          clearTimeout(timer);
          this.pc.removeEventListener('icegatheringstatechange', onChange);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', onChange);
    });
  }

  async createOffer() {
    this.role = 'host';
    this._createPeerConnection();
    this.onStateChange('gathering');
    const dc = this.pc.createDataChannel('pente', { ordered: true });
    this._bindDataChannel(dc);

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await this._waitForIceGathering();
    this.onStateChange('waiting_answer');
    return PeerSession.encodeSignal(this.pc.localDescription);
  }

  async acceptOfferAndCreateAnswer(offerCode) {
    this.role = 'guest';
    this._createPeerConnection();
    this.onStateChange('gathering');
    this.pc.ondatachannel = (ev) => {
      this._bindDataChannel(ev.channel);
    };

    const offerDesc = PeerSession.decodeSignal(offerCode);
    await this.pc.setRemoteDescription(new RTCSessionDescription(offerDesc));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await this._waitForIceGathering();
    this.onStateChange('waiting_host');
    return PeerSession.encodeSignal(this.pc.localDescription);
  }

  async acceptAnswer(answerCode) {
    if (!this.pc) throw new Error('No active host session');
    const answerDesc = PeerSession.decodeSignal(answerCode);
    await this.pc.setRemoteDescription(new RTCSessionDescription(answerDesc));
    this.onStateChange('connecting');
  }

  send(payload) {
    if (!this.dc || this.dc.readyState !== 'open') return false;
    this.dc.send(JSON.stringify(payload));
    return true;
  }

  close(notify = true) {
    const wasConnected = this.connected;
    this.connected = false;
    if (this.dc) {
      try { this.dc.close(); } catch (e) {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    if (notify && wasConnected) this.onClose();
  }
}
