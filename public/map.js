(function(root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OkopMap = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  const WORLD_W = 4200, WORLD_H = 3200;

  function mulberry32(a){
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function segCircle(x1,y1,x2,y2,cx,cy,r){
    const dx=x2-x1, dy=y2-y1, fx=x1-cx, fy=y1-cy;
    const a=dx*dx+dy*dy; if (a<1e-9) return -1;
    const b=2*(fx*dx+fy*dy), c=fx*fx+fy*fy-r*r;
    let disc=b*b-4*a*c; if (disc<0) return -1;
    disc=Math.sqrt(disc);
    const t1=(-b-disc)/(2*a), t2=(-b+disc)/(2*a);
    if (t1>=0 && t1<=1) return t1;
    if (t2>=0 && t2<=1) return t2;
    return -1;
  }
  function segAABB(x1,y1,x2,y2,b){
    const dx=x2-x1, dy=y2-y1;
    let tmin=0, tmax=1;
    if (Math.abs(dx)<1e-9){ if (x1<b.x||x1>b.x+b.w) return -1; }
    else {
      let t1=(b.x-x1)/dx, t2=(b.x+b.w-x1)/dx;
      if (t1>t2){ const s=t1; t1=t2; t2=s; }
      tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
      if (tmin>tmax) return -1;
    }
    if (Math.abs(dy)<1e-9){ if (y1<b.y||y1>b.y+b.h) return -1; }
    else {
      let t1=(b.y-y1)/dy, t2=(b.y+b.h-y1)/dy;
      if (t1>t2){ const s=t1; t1=t2; t2=s; }
      tmin=Math.max(tmin,t1); tmax=Math.min(tmax,t2);
      if (tmin>tmax) return -1;
    }
    return tmin;
  }

  function buildWorld(){
    const rng = mulberry32(20240607);
    const cover=[], bushes=[], trees=[], trenches=[];

    const tdefs = [
      { x:1250, y:1080, w:1150, h:86 },
      { x:1250, y:1980, w:1150, h:86 },
      { x: 620, y:1520, w:86,  h:820 },
      { x:2900, y:1380, w:86,  h:820 },
      { x:2100, y:2260, w:420, h:86 }
    ];
    for (const d of tdefs){
      trenches.push(d);
      if (d.w > d.h){
        cover.push({ x:d.x, y:d.y-20, w:d.w, h:20 });
        cover.push({ x:d.x, y:d.y+d.h, w:d.w, h:20 });
      } else {
        cover.push({ x:d.x-20, y:d.y, w:20, h:d.h });
        cover.push({ x:d.x+d.w, y:d.y, w:20, h:d.h });
      }
    }
    for (let i=0;i<26;i++){
      const x = rng()*WORLD_W, y = rng()*WORLD_H;
      if (Math.hypot(x-2100, y-1600) < 380) continue;
      const horiz = rng() > 0.5;
      cover.push(horiz
        ? { x, y, w: 90 + rng()*90, h: 22 }
        : { x, y, w: 22, h: 90 + rng()*90 });
    }
    for (let i=0;i<80;i++){
      const x = rng()*WORLD_W, y = rng()*WORLD_H;
      if (x<140||y<140||x>WORLD_W-140||y>WORLD_H-140) continue;
      if (Math.hypot(x-2100, y-1600) < 260) continue;
      let inside=false;
      for (const t of trenches) if (x>t.x-50 && x<t.x+t.w+50 && y>t.y-50 && y<t.y+t.h+50){ inside=true; break; }
      if (inside) continue;
      let inCover=false;
      for (const c of cover) if (x>c.x-30 && x<c.x+c.w+30 && y>c.y-30 && y<c.y+c.h+30){ inCover=true; break; }
      if (inCover) continue;
      bushes.push({ x, y, r: 34 + rng()*34, seed: Math.floor(rng()*1e6) });
    }
    const groves = [
      { x: 400,  y: 500,  rx: 620, ry: 520 },
      { x: 3600, y: 700,  rx: 700, ry: 600 },
      { x: 700,  y: 2700, rx: 700, ry: 560 },
      { x: 3450, y: 2600, rx: 660, ry: 620 },
      { x: 2050, y: 300,  rx: 900, ry: 380 }
    ];
    for (const g of groves){
      for (let i=0;i<70;i++){
        const a = rng()*Math.PI*2, r = Math.sqrt(rng());
        const x = g.x + Math.cos(a)*g.rx*r;
        const y = g.y + Math.sin(a)*g.ry*r;
        if (x<60||y<60||x>WORLD_W-60||y>WORLD_H-60) continue;
        let blocked = false;
        for (const t of trenches) if (x>t.x-40 && x<t.x+t.w+40 && y>t.y-40 && y<t.y+t.h+40){ blocked=true; break; }
        if (blocked) continue;
        trees.push({
          x, y,
          r: 4 + rng()*5, h: 26 + rng()*46,
          fallen: rng() > 0.72,
          angle: rng()*Math.PI*2,
          lean: (rng()-0.5)*0.5,
          ember: rng() > 0.86
        });
      }
    }
    return { cover, bushes, trees, trenches, W: WORLD_W, H: WORLD_H };
  }

  return { WORLD_W, WORLD_H, buildWorld, mulberry32, segCircle, segAABB };
});