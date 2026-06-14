import type { ServerMessage } from './types';

export function parseMessage(raw: string): ServerMessage | null {
  try {
    const m = JSON.parse(raw) as { type?: string };
    return m && (m.type === 'pulse' || m.type === 'stats' || m.type === 'replay')
      ? (m as ServerMessage)
      : null;
  } catch {
    return null;
  }
}

export function connect(
  url: string,
  onMessage: (m: ServerMessage) => void,
  onStatus: (connected: boolean) => void,
) {
  let delay = 1000;
  function open() {
    const ws = new WebSocket(url);
    ws.onopen = () => { delay = 1000; onStatus(true); };
    ws.onmessage = ev => {
      const m = parseMessage(String(ev.data));
      if (m) onMessage(m);
    };
    ws.onclose = () => {
      onStatus(false);
      setTimeout(open, delay);
      delay = Math.min(delay * 2, 30_000);
    };
    ws.onerror = () => ws.close();
  }
  open();
}
