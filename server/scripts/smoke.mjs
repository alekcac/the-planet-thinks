import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:8080/ws';
const ws = new WebSocket(url);
let n = 0;
ws.on('open', () => console.log('connected', url));
ws.on('message', data => {
  console.log(String(data).slice(0, 160));
  if (++n >= 5) process.exit(0);
});
ws.on('error', err => { console.error(err.message); process.exit(1); });
setTimeout(() => { console.error('timeout: fewer than 5 messages in 90s'); process.exit(1); }, 90_000);
