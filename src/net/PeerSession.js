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
    // Extract only the non-boilerplate fields from a WebRTC DataChannel SDP
    const lines = desc.sdp.split(/\r?\n/);
    let ufrag = '';
    let pwd = '';
    let fpHex = '';
    let setup = desc.type === 'offer' ? 'a' : 'p'; // actpass | active | passive
    const cands = [];

    for (const line of lines) {
      if (line.startsWith('a=ice-ufrag:')) ufrag = line.slice(12).trim();
      else if (line.startsWith('a=ice-pwd:')) pwd = line.slice(10).trim();
      else if (line.startsWith('a=fingerprint:sha-256 ')) fpHex = line.slice(22).trim().replace(/:/g, '');
      else if (line.startsWith('a=setup:')) {
        const s = line.slice(8).trim();
        setup = s === 'actpass' ? 'a' : s === 'active' ? 'c' : 'p';
      } else if (line.startsWith('a=candidate:')) {
        // Format: a=candidate:<foundation> <comp> <proto> <prio> <ip> <port> typ <type> ...
        const parts = line.slice(12).trim().split(/\s+/);
        if (parts.length >= 8 && parts[2].toLowerCase() === 'udp') {
          const ip = parts[4];
          const port = parts[5];
          const typ = parts[7];
          // Skip .local mDNS hostnames if we already have a srflx/public IP, or include compactly
          cands.push(`${ip}|${port}|${typ[0]}|${parts[0]}|${parts[3]}`);
        }
      }
    }

    if (ufrag && pwd && fpHex.length === 64 && cands.length > 0) {
      // Pack 32-byte fingerprint into base64url (43 chars)
      const fpBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) fpBytes[i] = parseInt(fpHex.slice(i * 2, i * 2 + 2), 16);
      let fpBin = '';
      for (let i = 0; i < 32; i++) fpBin += String.fromCharCode(fpBytes[i]);
      const fpB64 = btoa(fpBin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

      const compact = [desc.type === 'offer' ? 'o' : 'a', setup, ufrag, pwd, fpB64, ...cands].join('~');
      return '1' + compact;
    }

    // Fallback to raw JSON base64url
    const json = JSON.stringify({ type: desc.type, sdp: desc.sdp });
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static decodeSignal(code) {
    const clean = (code || '').trim();
    if (!clean) throw new Error('Empty connection code');
    let raw = clean;
    if (clean.includes('offer=')) {
      try {
        const u = new URL(clean);
        raw = u.searchParams.get('offer') || clean;
      } catch (e) {
        const m = clean.match(/offer=([^&\s]+)/);
        if (m) raw = decodeURIComponent(m[1]);
      }
    }

    // Compact format v1: starts with '1o~' or '1a~'
    if (raw.startsWith('1o~') || raw.startsWith('1a~')) {
      const parts = raw.slice(1).split('~');
      if (parts.length < 6) throw new Error('Invalid compact code');
      const [tCode, setupCode, ufrag, pwd, fpB64, ...candStrs] = parts;
      const type = tCode === 'o' ? 'offer' : 'answer';
      const setup = setupCode === 'a' ? 'actpass' : setupCode === 'c' ? 'active' : 'passive';

      const b64 = fpB64.replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
      const fpBin = atob(b64 + pad);
      const fpHex = Array.from(fpBin, (ch) => ch.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()).join(':');

      const firstCand = candStrs[0].split('|');
      const mainIp = firstCand[0].includes(':') ? '127.0.0.1' : firstCand[0];
      const mainPort = firstCand[1] || '9';

      const candLines = candStrs.map((c) => {
        const [ip, port, typC, found, prio] = c.split('|');
        const typ = typC === 's' ? 'srflx' : typC === 'r' ? 'relay' : 'host';
        const raddr = typ === 'host' ? '' : ' raddr 0.0.0.0 rport 0';
        return `a=candidate:${found || '1'} 1 udp ${prio || '2113937151'} ${ip} ${port} typ ${typ}${raddr} generation 0`;
      });

      const sdp = [
        'v=0',
        'o=- 1 2 IN IP4 127.0.0.1',
        's=-',
        't=0 0',
        'a=group:BUNDLE 0',
        'a=extmap-allow-mixed',
        'a=msid-semantic: WMS',
        `m=application ${mainPort} UDP/DTLS/SCTP webrtc-datachannel`,
        `c=IN IP4 ${mainIp}`,
        ...candLines,
        `a=ice-ufrag:${ufrag}`,
        `a=ice-pwd:${pwd}`,
        'a=ice-options:trickle',
        `a=fingerprint:sha-256 ${fpHex}`,
        `a=setup:${setup}`,
        'a=mid:0',
        'a=sctp-port:5000',
        'a=max-message-size:262144',
        ''
      ].join('\r\n');

      return { type, sdp };
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
