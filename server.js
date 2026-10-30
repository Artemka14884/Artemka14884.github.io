'use strict';
const path = require('path');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { buildWorld, WORLD_W, WORLD_H, segCircle, segAABB } = require('./public/map.js');

const PORT = process.env.PORT || 8080;
const TICK_MS = 50;
const WORLD = buildWorld();

const players = new Map();
let nextId = 1;

function pickSpawn(){
  for (let i=0;i<60;i++){
    const x = 260 + Math.random()*(WORLD_W-520);
    const y = 260 + Math.random()*(WORLD_H-520);
    let ok = true;
    for (const p of players.values()){
      if (!p.alive) continue;
      if (Math.hypot(p.x-x, p.y-y) < 320){ ok=false; break; }
    }
    if (ok) return { x, y };
  }
  return { x: WORLD_W/2, y: WORLD_H/2 };
}

function isInBush(x,y){
  for (const b of WORLD.bushes){
    const dx = x-b.x, dy = y-b.y;
    if (dx*dx + dy*dy < b.r*b.r) return true;
  }
  return false;
}

function serialize(p, forId){
  if (p.id === forId){
    return { id:p.id, name:p.name, hp:p.hp, alive:p.alive,
             kills:p.kills, deaths:p.deaths, x:p.x, y:p.y, ang:p.ang };
  }
  if (!p.alive || p.hidden){
    return { id:p.id, name:p.name, hp:p.hp, alive:p.alive,
             kills:p.kills, deaths:p.deaths, x:null, y:null, ang:0 };
  }
  return { id:p.id, name:p.name, hp:p.hp, alive:p.alive,
           kills:p.kills, deaths:p.deaths, x:p.x, y:p.y, ang:p.ang };
}

function broadcast(obj){
  const data = JSON.stringify(obj);
  for (const p of players.values()){
    if (p.ws.readyState === 1) p.ws.send(data);
  }
}

function resolveShot(shooterId, ang){
  const s = players.get(shooterId);
  if (!s || !s.alive) return;
  const dist = 3200;
  const ex = s.x + Math.cos(ang)*dist;
  const ey = s.y + Math.sin(ang)*dist;

  let coverT = 1;
  for (const c of WORLD.cover){
    const t = segAABB(s.x, s.y, ex, ey, c);
    if (t >= 0 && t < coverT) coverT = t;
  }

  let best = null;
  for (const p of players.values()){
    if (p.id === shooterId || !p.alive) continue;
    const t = segCircle(s.x, s.y, ex, ey, p.x, p.y, 15);
    if (t < 0) continue;
    if (t > coverT) continue;
    if (!best || t < best.t) best = { t, p };
  }

  broadcast({ type:'shot', by:shooterId, x:s.x, y:s.y, ang });

  if (best){
    const v = best.p;
    v.hp -= 34;
    if (v.hp <= 0){
      v.hp = 0; v.alive = false; v.deaths++;
      s.kills++;
      v.deadAt = Date.now();
      broadcast({ type:'kill', by:s.id, byName:s.name, id:v.id, name:v.name });
    }
    broadcast({ type:'hit', id:v.id, by:shooterId, x:v.x, y:v.y });
  }
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/healthz', (_,res)=>res.send('ok'));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path:'/ws' });

wss.on('connection', (ws) => {
  const id = String(nextId++);
  const sp = pickSpawn();
  const p = {
    id, ws, name: 'Боец'+id,
    x: sp.x, y: sp.y, ang: 0,
    hp: 100, alive: true, hidden: false,
    kills: 0, deaths: 0,
    lastShotAt: 0, lastMoveAt: 0, movingFast: false,
    deadAt: 0
  };
  players.set(id, p);

  ws.send(JSON.stringify({ type:'welcome', id, worldW: WORLD_W, worldH: WORLD_H, world: WORLD }));
  broadcast({ type:'join', id, name: p.name });

  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'move'){
      if (!p.alive) return;
      const nx = +m.x, ny = +m.y, na = +m.ang;
      if (!isFinite(nx) || !isFinite(ny) || !isFinite(na)) return;
      const dx = nx - p.x, dy = ny - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 600) return;
      const MAXPERTICK = 42;
      if (d > MAXPERTICK){ const k = MAXPERTICK/d; p.x += dx*k; p.y += dy*k; }
      else { p.x = nx; p.y = ny; }
      p.x = Math.max(56, Math.min(WORLD_W-56, p.x));
      p.y = Math.max(56, Math.min(WORLD_H-56, p.y));
      p.ang = na;
      if (d > 2){
        p.lastMoveAt = Date.now();
        p.movingFast = d > 18;
      } else {
        p.movingFast = false;
      }
    } else if (m.type === 'shoot'){
      if (!p.alive) return;
      const na = +m.ang;
      if (!isFinite(na)) return;
      p.lastShotAt = Date.now();
      resolveShot(id, na);
    } else if (m.type === 'suicide'){
      if (!p.alive) return;
      p.alive = false; p.hp = 0; p.deaths++;
      p.deadAt = Date.now();
      broadcast({ type:'suicide', id, x:p.x, y:p.y, name:p.name });
    } else if (m.type === 'respawn'){
      if (p.alive) return;
      if (Date.now() - p.deadAt < 2200) return;
      const sp2 = pickSpawn();
      p.x = sp2.x; p.y = sp2.y; p.ang = 0;
      p.hp = 100; p.alive = true; p.hidden = false;
      broadcast({ type:'respawned', id, x:sp2.x, y:sp2.y });
    } else if (m.type === 'name'){
      const n = String(m.name || '').slice(0,16)
        .replace(/[^\wа-яА-ЯёЁ0-9 _\-\.]/g, '').trim() || ('Боец'+id);
      p.name = n;
      broadcast({ type:'name', id, name:n });
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast({ type:'left', id });
  });
  ws.on('error', () => {});
});

setInterval(() => {
  const now = Date.now();
  for (const p of players.values()){
    if (!p.alive){ p.hidden = false; continue; }
    const inBush = isInBush(p.x, p.y);
    const revealed =
      (now - p.lastShotAt < 1600) ||
      (now - p.lastMoveAt < 500 && p.movingFast);
    p.hidden = inBush && !revealed;
  }
  for (const p of players.values()){
    if (p.ws.readyState !== 1) continue;
    const arr = [];
    for (const o of players.values()) arr.push(serialize(o, p.id));
    p.ws.send(JSON.stringify({ type:'snap', players: arr, t: now }));
  }
}, TICK_MS);

server.listen(PORT, () => {
  console.log('okop-online listening on ' + PORT);
});