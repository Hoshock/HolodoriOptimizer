#!/usr/bin/env bash
set -euxo pipefail
ROOT=$(pwd)

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
$PW --raw eval "() => JSON.stringify({width: innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, reduceMotion: matchMedia('(prefers-reduced-motion: reduce)').matches})"
$PW --raw run-code "async page => { const times=[0,60,120,180,260,360,460,580,660]; const out=[]; const start=Date.now(); await page.locator('.menu-btn').click(); for (const target of times) { const wait=target-(Date.now()-start); if(wait>0) await page.waitForTimeout(wait); out.push(await page.evaluate((target)=>{ const rect=s=>{const e=document.querySelector(s); if(!e) return null; const r=e.getBoundingClientRect(); const c=getComputedStyle(e); return {x:+r.x.toFixed(2),y:+r.y.toFixed(2),w:+r.width.toFixed(2),h:+r.height.toFixed(2),opacity:c.opacity,transform:c.transform,animation:c.animationName};}; return {target,layer:document.querySelector('.layer')?.className,scene:rect('.hero'),drawer:rect('.drawer'),first:rect('.mi:nth-child(2)'),last:rect('.mi:nth-child(9)')};}, target)); } return JSON.stringify(out); }"
$PW screenshot --filename=/tmp/persona-after.png
$PW --raw eval "() => JSON.stringify({clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, drawer: (()=>{const r=document.querySelector('.drawer').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})(), items:[...document.querySelectorAll('.mi')].map(e=>{const r=e.getBoundingClientRect();return {text:e.querySelector('b')?.textContent,x:r.x,y:r.y,w:r.width,h:r.height};})})"
echo '=== SCREENSHOT_BASE64_BEGIN ==='
base64 -w0 /tmp/persona-after.png
echo
echo '=== SCREENSHOT_BASE64_END ==='
$PW close
exit 3
