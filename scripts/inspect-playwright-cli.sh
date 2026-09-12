#!/usr/bin/env bash
set -euxo pipefail
ROOT=$(pwd)

python3 - <<'PY'
from pathlib import Path
p = Path('public/persona-ui/index.html')
s = p.read_text()
old1 = 'return `<div class="page"><i class="burst b1"></i>'
new1 = 'return `<div class="page"><div class="scene"><i class="burst b1"></i>'
old2 = '</section></div><div class="layer${menu ? " open" : ""}">${drawer()}</div></div>`;'
new2 = '</section></div></div><div class="layer${menu ? " open" : ""}">${drawer()}</div></div>`;'
assert s.count(old1) == 1, s.count(old1)
assert s.count(old2) == 1, s.count(old2)
s = s.replace(old1, new1, 1).replace(old2, new2, 1)
p.write_text(s)
PY
cp scripts/persona-motion-next.css public/persona-ui/motion.css

pnpm build
pnpm preview --host 127.0.0.1 --port 4173 >/tmp/persona-preview.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4173/HolodoriOptimizer/persona-ui/?view=main >/dev/null; then
    break
  fi
  sleep 1
done
curl -fsS http://127.0.0.1:4173/HolodoriOptimizer/persona-ui/?view=main >/dev/null

PW='npx -y @playwright/cli@latest'
cd /tmp
$PW install-browser chromium
$PW open 'http://127.0.0.1:4173/HolodoriOptimizer/persona-ui/?view=main' --browser=chromium
$PW resize 390 844
$PW snapshot --boxes --filename=/tmp/persona-before.yml
$PW --raw eval "() => JSON.stringify({width:innerWidth,clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,reduceMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,layer:(()=>{const r=document.querySelector('.layer').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()})"
$PW --raw run-code "async page => { const times=[0,30,60,90,120,180,260,360,480,560]; const out=[]; const start=Date.now(); await page.locator('.menu-btn').click(); for (const target of times) { const wait=target-(Date.now()-start); if(wait>0) await page.waitForTimeout(wait); out.push(await page.evaluate((target)=>{ const rect=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();const c=getComputedStyle(e);return{x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2),opacity:+c.opacity,transform:c.transform};};return{target,scene:rect('.scene'),drawer:rect('.drawer'),first:rect('.mi:nth-child(2)'),last:rect('.mi:nth-child(9)')};},target)); } return JSON.stringify(out); }"
$PW screenshot --filename=/tmp/persona-after.png
$PW --raw eval "() => {const layer=document.querySelector('.layer').getBoundingClientRect();const items=[...document.querySelectorAll('.mi')].map(e=>{const r=e.getBoundingClientRect();return{text:e.querySelector('b')?.textContent,x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2)}});const gaps=items.slice(1).map((x,i)=>+(x.y-(items[i].y+items[i].h)).toFixed(2));return JSON.stringify({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,layer:{x:+layer.x.toFixed(2),y:+layer.y.toFixed(2),w:+layer.width.toFixed(2),h:+layer.height.toFixed(2)},items,gaps,minGap:Math.min(...gaps)}); }"
$PW console error
$PW --raw run-code "async page => { await page.locator('[data-a=menu-close]').first().click(); await page.waitForTimeout(520); const scene=getComputedStyle(document.querySelector('.scene')).transform; const drawer=getComputedStyle(document.querySelector('.drawer')).transform; return JSON.stringify({open:document.querySelector('.layer').classList.contains('open'),scene,drawer}); }"
$PW close

if command -v ffmpeg >/dev/null 2>&1; then
  ffmpeg -loglevel error -y -i /tmp/persona-after.png -vf scale=195:-1 -q:v 10 /tmp/persona-small.jpg
  echo '=== SMALL_SCREENSHOT_BASE64_BEGIN ==='
  base64 -w0 /tmp/persona-small.jpg
  echo
  echo '=== SMALL_SCREENSHOT_BASE64_END ==='
fi
exit 3
