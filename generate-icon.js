#!/usr/bin/env node
// Generates a Frybox icon: a cute fry box with fries, on a clean background.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SIZE = 1024;
const buf = Buffer.alloc(SIZE * SIZE * 3, 0);

// ── Pixel helpers ──
function setPixel(x, y, r, g, b) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 3;
  buf[i] = r; buf[i+1] = g; buf[i+2] = b;
}

function getPixel(x, y) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return [0,0,0];
  const i = (y * SIZE + x) * 3;
  return [buf[i], buf[i+1], buf[i+2]];
}

// ── Shape drawing ──
function fillRoundedRect(x1, y1, x2, y2, radius, r, g, b) {
  for (let y = Math.floor(y1); y <= Math.floor(y2); y++) {
    if (y < 0 || y >= SIZE) continue;
    for (let x = Math.floor(x1); x <= Math.floor(x2); x++) {
      if (x < 0 || x >= SIZE) continue;
      let inside = true;
      if (x < x1+radius && y < y1+radius)
        inside = ((x-x1-radius)**2 + (y-y1-radius)**2) <= radius*radius;
      else if (x > x2-radius && y < y1+radius)
        inside = ((x-x2+radius)**2 + (y-y1-radius)**2) <= radius*radius;
      else if (x < x1+radius && y > y2-radius)
        inside = ((x-x1-radius)**2 + (y-y2+radius)**2) <= radius*radius;
      else if (x > x2-radius && y > y2-radius)
        inside = ((x-x2+radius)**2 + (y-y2+radius)**2) <= radius*radius;
      if (inside) setPixel(x, y, r, g, b);
    }
  }
}

function fillTrapezoid(topX1, topX2, botX1, botX2, topY, botY, r, g, b) {
  for (let y = Math.floor(topY); y <= Math.floor(botY); y++) {
    if (y < 0 || y >= SIZE) continue;
    const t = (y - topY) / (botY - topY);
    const lx = topX1 + (botX1 - topX1) * t;
    const rx = topX2 + (botX2 - topX2) * t;
    for (let x = Math.floor(lx); x <= Math.floor(rx); x++) {
      if (x >= 0 && x < SIZE) setPixel(x, y, r, g, b);
    }
  }
}

function fillCircle(cx, cy, radius, r, g, b) {
  for (let y = Math.floor(cy-radius); y <= Math.ceil(cy+radius); y++) {
    for (let x = Math.floor(cx-radius); x <= Math.ceil(cx+radius); x++) {
      if ((x-cx)**2 + (y-cy)**2 <= radius*radius) setPixel(x, y, r, g, b);
    }
  }
}

function fillFry(cx, topY, botY, width, angle, r, g, b) {
  const hw = width / 2;
  const len = botY - topY;
  const rad = angle * Math.PI / 180;
  const cosA = Math.cos(rad), sinA = Math.sin(rad);

  for (let ly = 0; ly <= len; ly++) {
    for (let lx = -hw; lx <= hw; lx++) {
      const ry = topY + ly;
      const rx = cx + lx * cosA - (ly - len/2) * sinA + (len/2) * sinA;

      // Shading: lighter on left edge
      const shade = 0.88 + 0.24 * ((lx + hw) / width);
      const sr = Math.min(255, Math.round(r * shade));
      const sg = Math.min(255, Math.round(g * shade));
      const sb = Math.min(255, Math.round(b * shade));

      // Rounded ends
      if (ly < hw && (lx*lx + (ly-hw)*(ly-hw)) > hw*hw) continue;
      if (ly > len-hw) {
        const dy = ly - (len - hw);
        if (lx*lx + dy*dy > hw*hw) continue;
      }

      setPixel(Math.round(rx), Math.round(ry), sr, sg, sb);
    }
  }
}

// ══════════════════════════════════════════════════
// DRAW THE FRYBOX ICON
// ══════════════════════════════════════════════════

// 1. Background: warm yellow-orange rounded square
fillRoundedRect(40, 40, SIZE-40, SIZE-40, 200, 255, 195, 50);

// Gradient: lighter at top, deeper at bottom
for (let y = 40; y < SIZE-40; y++) {
  const t = (y - 40) / (SIZE - 80);
  for (let x = 40; x < SIZE-40; x++) {
    const [pr] = getPixel(x, y);
    if (pr === 0) continue;
    const r = Math.round(255 - t * 30);
    const g = Math.round(200 - t * 50);
    const b = Math.round(55 - t * 20);
    setPixel(x, y, r, g, b);
  }
}

// 2. The fry box — a big red container, center stage
const boxTopLeft = 260, boxTopRight = SIZE - 260;
const boxBotLeft = 310, boxBotRight = SIZE - 310;
const boxTop = 420;
const boxBot = SIZE - 110;

// Shadow behind box
fillTrapezoid(boxTopLeft+15, boxTopRight+15, boxBotLeft+15, boxBotRight+15,
  boxTop+10, boxBot+10, 200, 130, 20);

// Main box body (red)
fillTrapezoid(boxTopLeft, boxTopRight, boxBotLeft, boxBotRight, boxTop, boxBot, 220, 50, 50);

// Lighter front face
fillTrapezoid(boxTopLeft+5, boxTopRight-5, boxBotLeft+5, boxBotRight-5,
  boxTop+5, boxBot, 235, 60, 55);

// White wavy stripe across the box
const stripeTop = boxTop + 70;
const stripeBot = boxTop + 115;
for (let y = stripeTop; y <= stripeBot; y++) {
  const t = (y - boxTop) / (boxBot - boxTop);
  const lx = boxTopLeft + (boxBotLeft - boxTopLeft) * t + 20;
  const rx = boxTopRight + (boxBotRight - boxTopRight) * t - 20;
  for (let x = Math.floor(lx); x <= Math.floor(rx); x++) {
    // Wavy offset
    const wave = Math.sin((x - lx) / (rx - lx) * Math.PI * 3) * 6;
    if (y + wave >= stripeTop && y + wave <= stripeBot) {
      setPixel(x, Math.round(y + wave), 255, 250, 235);
    }
  }
}

// "F" letter on the box (for Frybox)
const letterCx = SIZE / 2;
const letterTop = boxTop + 140;
// F - vertical bar
for (let y = letterTop; y <= letterTop + 120; y++) {
  const t = (y - boxTop) / (boxBot - boxTop);
  for (let x = letterCx - 50; x <= letterCx - 25; x++) {
    setPixel(x, y, 255, 245, 230);
  }
}
// F - top horizontal
for (let y = letterTop; y <= letterTop + 22; y++) {
  for (let x = letterCx - 50; x <= letterCx + 40; x++) {
    setPixel(x, y, 255, 245, 230);
  }
}
// F - middle horizontal
for (let y = letterTop + 52; y <= letterTop + 72; y++) {
  for (let x = letterCx - 50; x <= letterCx + 25; x++) {
    setPixel(x, y, 255, 245, 230);
  }
}

// Box rim (top edge, thicker)
fillTrapezoid(boxTopLeft-12, boxTopRight+12, boxTopLeft-5, boxTopRight+5,
  boxTop-18, boxTop+6, 245, 70, 60);
// Rim highlight
fillTrapezoid(boxTopLeft-8, boxTopRight+8, boxTopLeft-6, boxTopRight+6,
  boxTop-14, boxTop-6, 255, 100, 85);

// 3. French fries bursting out of the box!
const fryData = [
  // { cx, topY, botY, width, angle }
  { cx: 360, topY: 110, botY: boxTop+20, width: 48, angle: -12 },
  { cx: 420, topY: 80,  botY: boxTop+15, width: 44, angle: -5 },
  { cx: 490, topY: 55,  botY: boxTop+20, width: 50, angle: -1 },
  { cx: 545, topY: 60,  botY: boxTop+18, width: 46, angle: 3 },
  { cx: 610, topY: 85,  botY: boxTop+15, width: 48, angle: 7 },
  { cx: 665, topY: 120, botY: boxTop+20, width: 44, angle: 12 },
  // Shorter ones in between
  { cx: 385, topY: 170, botY: boxTop+10, width: 40, angle: -8 },
  { cx: 460, topY: 130, botY: boxTop+12, width: 42, angle: -3 },
  { cx: 520, topY: 110, botY: boxTop+14, width: 44, angle: 1 },
  { cx: 580, topY: 125, botY: boxTop+10, width: 40, angle: 5 },
  { cx: 640, topY: 165, botY: boxTop+12, width: 38, angle: 9 },
];

const fryColors = [
  [255, 215, 85],
  [250, 200, 65],
  [255, 225, 105],
  [245, 190, 55],
  [255, 210, 75],
];

fryData.forEach((f, i) => {
  const [r, g, b] = fryColors[i % fryColors.length];
  fillFry(f.cx, f.topY, f.botY, f.width, f.angle, r, g, b);
});

// 4. Shine highlights on some fries
const shines = [
  [418, 160, 8], [488, 120, 9], [543, 130, 8], [608, 150, 7], [360, 200, 7],
  [520, 170, 6], [580, 190, 6],
];
shines.forEach(([sx, sy, rad]) => {
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx*dx + dy*dy <= rad*rad) {
        const [pr, pg, pb] = getPixel(sx+dx, sy+dy);
        if (pr > 150) {
          setPixel(sx+dx, sy+dy,
            Math.min(255, pr + 35),
            Math.min(255, pg + 30),
            Math.min(255, pb + 25));
        }
      }
    }
  }
});

// 5. Small steam/heat lines above fries (three little curves)
function drawSteam(cx, topY, height) {
  for (let y = 0; y < height; y++) {
    const t = y / height;
    const x = cx + Math.sin(t * Math.PI * 2) * 12;
    const alpha = 1 - t; // fade out
    const [pr, pg, pb] = getPixel(Math.round(x), topY + y);
    const r = Math.min(255, Math.round(pr + 60 * alpha));
    const g = Math.min(255, Math.round(pg + 55 * alpha));
    const b = Math.min(255, Math.round(pb + 50 * alpha));
    for (let dx = -2; dx <= 2; dx++) {
      setPixel(Math.round(x + dx), topY + y, r, g, b);
    }
  }
}
drawSteam(460, 50, 45);
drawSteam(520, 42, 50);
drawSteam(575, 52, 42);

// ══════════════════════════════════════════════════
// EXPORT
// ══════════════════════════════════════════════════

const ppmHeader = `P6\n${SIZE} ${SIZE}\n255\n`;
const ppmPath = path.join(__dirname, 'icon.ppm');
const pngPath = path.join(__dirname, 'icon.png');
const iconsetDir = path.join(__dirname, 'icon.iconset');
const icnsPath = path.join(__dirname, 'build', 'icon.icns');

fs.writeFileSync(ppmPath, Buffer.concat([Buffer.from(ppmHeader), buf]));
console.log('Generated PPM');

execSync(`sips -s format png "${ppmPath}" --out "${pngPath}" --resampleWidth ${SIZE}`, { stdio: 'pipe' });
console.log('Converted to PNG');

if (fs.existsSync(iconsetDir)) fs.rmSync(iconsetDir, { recursive: true });
fs.mkdirSync(iconsetDir);

const sizes = [16, 32, 64, 128, 256, 512, 1024];
sizes.forEach(s => {
  const name = s === 1024 ? 'icon_512x512@2x.png' : `icon_${s}x${s}.png`;
  execSync(`sips -z ${s} ${s} "${pngPath}" --out "${path.join(iconsetDir, name)}"`, { stdio: 'pipe' });
  if (s <= 512 && s > 16) {
    const name2x = `icon_${s/2}x${s/2}@2x.png`;
    execSync(`sips -z ${s} ${s} "${pngPath}" --out "${path.join(iconsetDir, name2x)}"`, { stdio: 'pipe' });
  }
});
console.log('Created iconset');

fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
console.log(`Created ${icnsPath}`);

fs.unlinkSync(ppmPath);
fs.rmSync(iconsetDir, { recursive: true });
console.log('Done! Icon at build/icon.icns');
