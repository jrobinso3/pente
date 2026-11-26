const BROKER_URL = 'wss://broker.emqx.io:8084/mqtt';

function encodeVarLen(len) {
  const out = [];
  do {
    let d = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) d |= 128;
    out.push(d);
  } while (len > 0);
  return out;
}

function utf8Bytes(str) {
  return new TextEncoder().encode(str);
}

/**
 * Lightweight MQTT 3.1.1 over WebSocket (WSS) room relay used as an automatic
 * fallback when direct WebRTC ICE traversal is blocked by NAT/firewalls.
 */
export class WssRelay {
  constructor({ onMessage, onClose, onError } = {}) {
    this.ws = null;
    this.topic = '';
    this.clientId = 'pente_' + Math.random().toString(36).slice(2, 10);
    this.connected = false;
    this._pingTimer = null;
    this.onMessage = onMessage || (() => {});
    this.onClose = onClose || (() => {});
    this.onError = onError || (() => {});
  }

  connect(roomCode, timeoutMs = 8000) {
    this.close();
    this.topic = `pente/v1/room/${roomCode}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(BROKER_URL, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.close();
          reject(new Error('Relay connection timed out'));
        }
      }, timeoutMs);

      ws.onopen = () => {
        const cid = utf8Bytes(this.clientId);
        const vh = [0, 4, 77, 81, 84, 84, 4, 2, 0, 45];
        const pl = [0, cid.length, ...cid];
        const rem = encodeVarLen(vh.length + pl.length);
        ws.send(new Uint8Array([0x10, ...rem, ...vh, ...pl]));
      };

      ws.onmessage = (ev) => {
        const buf = new Uint8Array(ev.data);
        let idx = 0;
        while (idx < buf.length) {
          const type = buf[idx] & 0xf0;
          let mult = 1;
          let len = 0;
          let p = idx + 1;
          let byte;
          do {
            byte = buf[p++];
            len += (byte & 127) * mult;
            mult *= 128;
          } while ((byte & 128) !== 0);

          const bodyStart = p;
          const bodyEnd = p + len;

          if (type === 0x20) {
            // CONNACK -> SUBSCRIBE to room topic
            const tBytes = utf8Bytes(this.topic);
            const subBody = [0, 1, (tBytes.length >> 8) & 0xff, tBytes.length & 0xff, ...tBytes, 0];
            ws.send(new Uint8Array([0x82, ...encodeVarLen(subBody.length), ...subBody]));
          } else if (type === 0x90) {
            // SUBACK -> ready
            if (!settled) {
              settled = true;
              clearTimeout(timer);
              this.connected = true;
              this._pingTimer = setInterval(() => {
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                  this.ws.send(new Uint8Array([0xc0, 0x00]));
                }
              }, 25000);
              resolve();
            }
          } else if (type === 0x30) {
            // PUBLISH
            const tLen = (buf[bodyStart] << 8) | buf[bodyStart + 1];
            const msgStart = bodyStart + 2 + tLen;
            const jsonStr = new TextDecoder().decode(buf.slice(msgStart, bodyEnd));
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed && parsed._from !== this.clientId) {
                this.onMessage(parsed.payload);
              }
            } catch (e) {}
          }

          idx = bodyEnd;
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          reject(new Error('Relay connection failed'));
        } else {
          this.onError(err);
        }
      };

      ws.onclose = () => {
        clearTimeout(timer);
        const wasConnected = this.connected;
        this.connected = false;
        if (this._pingTimer) {
          clearInterval(this._pingTimer);
          this._pingTimer = null;
        }
        if (wasConnected) this.onClose();
      };
    });
  }

  send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) return false;
    const msgBytes = utf8Bytes(JSON.stringify({ _from: this.clientId, payload }));
    const tBytes = utf8Bytes(this.topic);
    const body = [(tBytes.length >> 8) & 0xff, tBytes.length & 0xff, ...tBytes, ...msgBytes];
    this.ws.send(new Uint8Array([0x30, ...encodeVarLen(body.length), ...body]));
    return true;
  }

  close() {
    this.connected = false;
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch (e) {}
      this.ws = null;
    }
  }
}
