// ============================================================
// THE WORLD IN ONE PAGE — TUESDAY 24 NOVEMBER 2026
// 1024x1024 dense newspaper front page, drawn from scratch.
// Node 22, stdlib only (fs/zlib). No network. No system fonts.
// Deterministic: fixed layout, seeded PRNG only, no clock.
// ============================================================

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const W = 1024, H = 1024;
const img = new Uint8Array(W * H * 3);

// ---------- seeded PRNG (deterministic) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261124);

// ---------- color helpers ----------
function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

const PAPER = [244, 240, 229];
const PAPER_D = [236, 231, 218];
const INK = [24, 23, 24];
const GRAY = [104, 99, 90];
const LGRAY = [186, 180, 168];
const RED = [176, 26, 34];
const BLUE = [30, 70, 148];
const GREEN = [22, 106, 62];
const AMBER = [190, 116, 8];
const ORANGE = [212, 96, 12];
const PURPLE = [98, 44, 142];
const TEAL = [12, 112, 120];
const WHITE = [250, 249, 244];

const TAGC = {
  CONFIRMED: GREEN,
  OFFICIAL: BLUE,
  REPORTED: AMBER,
  CLAIM: RED,
  SCHEDULED: PURPLE,
};

// ---------- raster primitives ----------
function setP(x, y, c) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2];
}
function fillRect(x, y, w, h, c) {
  const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w)), y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    let i = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      img[i] = c[0]; img[i + 1] = c[1]; img[i + 2] = c[2]; i += 3;
    }
  }
}
function strokeRect(x, y, w, h, c, t) {
  t = t || 1;
  fillRect(x, y, w, t, c); fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c); fillRect(x + w - t, y, t, h, c);
}
function fillCircle(cx, cy, r, c) {
  for (let dy = -r; dy <= r; dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    fillRect(cx - dx, cy + dy, 2 * dx + 1, 1, c);
  }
}
function line(x0, y0, x1, y1, c, th) {
  th = th || 1;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    const off = Math.floor((th - 1) / 2);
    fillRect(x0 - off, y0 - off, th, th, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}
function fillPoly(pts, c) {
  let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
  for (const p of pts) {
    if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
    if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
  }
  for (let y = Math.ceil(miny); y <= Math.floor(maxy); y++) {
    const ys = y + 0.5; const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const x1 = pts[i][0], y1 = pts[i][1], x2 = pts[j][0], y2 = pts[j][1];
      if ((y1 <= ys && y2 > ys) || (y2 <= ys && y1 > ys)) {
        xs.push(x1 + ((ys - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.ceil(xs[k]), xb = Math.ceil(xs[k + 1]);
      if (xb > xa) fillRect(xa, y, xb - xa, 1, c);
    }
  }
}
function ditherRect(x, y, w, h, c, ink, dens) {
  // deterministic checker dither of a color over an area
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const on = ((x + xx) + (y + yy) + ((x + xx) * (y + yy) & dens)) % 2 === 0;
      setP(Math.round(x + xx), Math.round(y + yy), on ? c : ink);
    }
  }
}
function hatchRect(x, y, w, h, c, step) {
  for (let yy = 0; yy < h; yy += step) fillRect(x, y + yy, w, 1, c);
}

// ---------- 5x7 bitmap font (defined here, drawn by hand) ----------
const FONT = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "A": [14, 17, 17, 31, 17, 17, 17],
  "B": [30, 17, 17, 30, 17, 17, 30],
  "C": [14, 17, 16, 16, 16, 17, 14],
  "D": [28, 18, 17, 17, 17, 18, 28],
  "E": [31, 16, 16, 30, 16, 16, 31],
  "F": [31, 16, 16, 30, 16, 16, 16],
  "G": [14, 17, 16, 23, 17, 17, 15],
  "H": [17, 17, 17, 31, 17, 17, 17],
  "I": [14, 4, 4, 4, 4, 4, 14],
  "J": [7, 2, 2, 2, 2, 18, 12],
  "K": [17, 18, 20, 24, 20, 18, 17],
  "L": [16, 16, 16, 16, 16, 16, 31],
  "M": [17, 27, 21, 21, 17, 17, 17],
  "N": [17, 25, 21, 19, 17, 17, 17],
  "O": [14, 17, 17, 17, 17, 17, 14],
  "P": [30, 17, 17, 30, 16, 16, 16],
  "Q": [14, 17, 17, 17, 21, 18, 13],
  "R": [30, 17, 17, 30, 20, 18, 17],
  "S": [15, 16, 16, 14, 1, 1, 30],
  "T": [31, 4, 4, 4, 4, 4, 4],
  "U": [17, 17, 17, 17, 17, 17, 14],
  "V": [17, 17, 17, 17, 17, 10, 4],
  "W": [17, 17, 17, 21, 21, 27, 17],
  "X": [17, 17, 10, 4, 10, 17, 17],
  "Y": [17, 17, 10, 4, 4, 4, 4],
  "Z": [31, 1, 2, 4, 8, 16, 31],
  "0": [14, 17, 19, 21, 25, 17, 14],
  "1": [4, 12, 4, 4, 4, 4, 14],
  "2": [14, 17, 1, 2, 4, 8, 31],
  "3": [31, 2, 4, 2, 1, 17, 14],
  "4": [2, 6, 10, 18, 31, 2, 2],
  "5": [31, 16, 30, 1, 1, 17, 14],
  "6": [6, 8, 16, 30, 17, 17, 14],
  "7": [31, 1, 2, 4, 8, 8, 8],
  "8": [14, 17, 17, 14, 17, 17, 14],
  "9": [14, 17, 17, 15, 1, 2, 12],
  ".": [0, 0, 0, 0, 0, 12, 12],
  ",": [0, 0, 0, 0, 12, 4, 8],
  ":": [0, 12, 12, 0, 12, 12, 0],
  ";": [0, 12, 12, 0, 12, 4, 8],
  "!": [4, 4, 4, 4, 4, 0, 4],
  "?": [14, 17, 1, 2, 4, 0, 4],
  "'": [6, 4, 8, 0, 0, 0, 0],
  '"': [10, 10, 0, 0, 0, 0, 0],
  "-": [0, 0, 0, 31, 0, 0, 0],
  "–": [0, 0, 0, 31, 0, 0, 0],
  "—": [0, 0, 31, 31, 31, 0, 0],
  "/": [1, 1, 2, 4, 8, 16, 16],
  "(": [2, 4, 8, 8, 8, 4, 2],
  ")": [8, 4, 2, 2, 2, 4, 8],
  "$": [4, 15, 20, 14, 5, 30, 4],
  "%": [25, 26, 2, 4, 8, 11, 19],
  "&": [12, 18, 20, 8, 21, 18, 13],
  "+": [0, 4, 4, 31, 4, 4, 0],
  "=": [0, 0, 31, 0, 31, 0, 0],
  "₹": [14, 17, 16, 30, 4, 4, 31],
  "~": [0, 0, 13, 11, 0, 0, 0],
  "·": [0, 0, 12, 12, 0, 0, 0],
  "<": [2, 4, 8, 16, 8, 4, 2],
  ">": [8, 4, 2, 1, 2, 4, 8],
  "_": [0, 0, 0, 0, 0, 0, 31],
};

function drawChar(ch, x, y, sc, c, bold) {
  const g = FONT[ch] || FONT[" "];
  for (let r = 0; r < 7; r++) {
    const row = g[r];
    if (!row) continue;
    for (let b = 0; b < 5; b++) {
      if ((row >> (4 - b)) & 1) {
        const px = x + b * sc, py = y + r * sc;
        fillRect(px, py, sc, sc, c);
        if (bold && sc >= 2) fillRect(px + 1, py, sc, sc, c);
      }
    }
  }
}
function textW(s, sc) { return s.length * 6 * sc - sc; }
function text(x, y, s, sc, c, o) {
  o = o || {};
  s = String(s).toUpperCase();
  let cx = x;
  for (const ch of s) {
    drawChar(ch, cx, y, sc, c, o.bold);
    cx += 6 * sc;
  }
  return cx;
}
function textCentered(cx, y, s, sc, c, o) {
  return text(cx - textW(s, sc) / 2, y, s, sc, c, o);
}
function textRight(rx, y, s, sc, c, o) {
  return text(rx - textW(s, sc), y, s, sc, c, o);
}
function wrapWords(str, maxChars) {
  const out = [];
  let cur = "";
  for (const w of String(str).toUpperCase().split(/\s+/).filter(Boolean)) {
    if (!cur) { cur = w; continue; }
    if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}
function wrapText(x, y, s, sc, c, maxChars, lh, o) {
  for (const ln of wrapWords(s, maxChars)) { text(x, y, ln, sc, c, o); y += lh; }
  return y;
}
// rich tokens: [{t:"TXT", c:color, b:bool}] — greedy word wrap, mixed colors
function richText(x, y, toks, maxChars, sc, lh) {
  let cx = x, cy = y;
  let firstInLine = true;
  for (const tk of toks) {
    const words = String(tk.t).toUpperCase().split(/(\s+)/).filter(p => p.length > 0);
    for (const w of words) {
      if (w.match(/^\s+$/)) {
        if (!firstInLine) cx += w.length * 6 * sc;
        continue;
      }
      const wpx = w.length * 6 * sc - sc;
      if (!firstInLine && cx + wpx > x + maxChars * 6 * sc) {
        cx = x; cy += lh; firstInLine = true;
      }
      text(cx, cy, w, sc, tk.c || INK, { bold: !!tk.b });
      cx += (w.length + 1) * 6 * sc;
      firstInLine = false;
    }
  }
  return cy + lh;
}

// ... apparatus remains same ...

// ---------- small apparatus ----------
function chip(x, y, label, bg, fg) {
  const w = label.length * 6 + 5;
  fillRect(x, y, w, 10, bg);
  text(x + 2, y + 1, label, 1, fg || WHITE);
  return w;
}
function sectionBar(x, y, w, label, rightLabel, bg) {
  fillRect(x, y, w, 13, bg || INK);
  text(x + 4, y + 3, label, 1, WHITE, { bold: false });
  if (rightLabel) textRight(x + w - 4, y + 3, rightLabel, 1, mix(bg || INK, WHITE, 0.55));
}
function hrule(x, y, w, c, t) { fillRect(x, y, w, t || 1, c || INK); }
function vrule(x, y, h, c, t) { fillRect(x, y, t || 1, h, c || LGRAY); }

// ============================================================
// STORY DATA — every fact, figure and source straight from BRIEF.md
// ============================================================
const PICTURED = [
  {
    n: 1, lead: true,
    hl: "INDONESIA FACTORY FIRE: 24 DEAD, ~30 MISSING",
    sub: "",
    body: "RESCUE CONTINUES AT THE CANDY FACTORY FIRE; THE TOLL REACHES 24 WITH ABOUT 30 STILL MISSING. CREWS WORK WITH LADDERS AT THE SCENE.",
    src: "LEXINGTON HERALD LEADER", tag: "REPORTED", region: "ASIA", rc: RED,
    scene: "fire",
  },
  {
    n: 2,
    hl: "INDIA-NEPAL: ₹15,000 CRORE, 8 MOUS",
    sub: "MODI X PM BALENDRA SHAH BILATERAL TALKS",
    body: "",
    src: "INDIAN EXPRESS", tag: "CONFIRMED", region: "ASIA", rc: RED,
    scene: "handshake",
  },
  {
    n: 3,
    hl: "TOKYO REOPENS AFTER HISTORIC ROUT",
    sub: "NIKKEI FUT ~54,550; FRI -5.06%, -3,008 PTS",
    body: "",
    src: "REUTERS/JAPAN MKT DESK", tag: "REPORTED", region: "ASIA", rc: RED,
    scene: "tokyo",
  },
  {
    n: 4,
    hl: "KYIV REGION STRIKES KILL SEVERAL",
    sub: "OTHERS MISSING AS WAR ENTERS 5TH WINTER",
    body: "",
    src: "THE GUARDIAN", tag: "REPORTED", region: "EUROPE", rc: BLUE,
    scene: "kyiv",
  },
  {
    n: 5,
    hl: "GURU NANAK JAYANTI: 557TH UTSAV",
    sub: "KARTARPUR CORRIDOR REOPENING URGED",
    body: "",
    src: "INDIAN EXPRESS", tag: "CONFIRMED", region: "ASIA", rc: RED,
    scene: "temple",
  },
  {
    n: 6,
    hl: "SA BOWL BANGLADESH OUT FOR 91",
    sub: "CENTURION TEST DAY 1; SA 88/1 AT STUMPS",
    body: "",
    src: "IANS", tag: "CONFIRMED", region: "SPORT", rc: ORANGE,
    scene: "cricket",
  },
  {
    n: 7,
    hl: "CHINA SETS 2030 WELFARE TARGETS",
    sub: "ELDERLY CARE + CHILDCARE TO STRENGTHEN",
    body: "",
    src: "LEXINGTON HERALD LEADER", tag: "OFFICIAL", region: "ASIA", rc: RED,
    scene: "welfare",
  },
  {
    n: 8,
    hl: "S.KOREA NAMES NEW FM, NIS CHIEF",
    sub: "PRESIDENTIAL PICKS AMID MARKET TURMOIL",
    body: "",
    src: "LEXINGTON HERALD LEADER", tag: "OFFICIAL", region: "ASIA", rc: RED,
    scene: "govt",
  },
  {
    n: 9,
    hl: "BEPICOLOMBO ORBITING MERCURY",
    sub: "JAPAN-EUROPE PROBE STUDIES MAGNETIC FIELD",
    body: "",
    src: "TRIBUNE INDIA", tag: "CONFIRMED", region: "SCIENCE", rc: PURPLE,
    scene: "mercury",
  },
  {
    n: 10,
    hl: "GOOGLE: $5M FOR IIT KHARAGPUR AI",
    sub: "FUNDS AI RESEARCH AND INFRASTRUCTURE",
    body: "",
    src: "IANS", tag: "CONFIRMED", region: "TECH", rc: TEAL,
    scene: "ai",
  },
  {
    n: 11,
    hl: "INDIA WOMEN HIT THAILAND 7-0",
    sub: "DEEPIKA HAT-TRICK IN ASIAN CHAMPS TROPHY",
    body: "",
    src: "AKASHVANI", tag: "CONFIRMED", region: "SPORT", rc: ORANGE,
    scene: "hockey",
  },
  {
    n: 12,
    hl: "CAS TO RULE ON SENEGAL AFCON APPEAL",
    sub: "DECISION DUE TUESDAY AFTERNOON",
    body: "",
    src: "REUTERS", tag: "REPORTED", region: "SPORT", rc: ORANGE,
    scene: "court",
  },
];

const NUMBERS = [
  ["24 DEAD", "INDONESIA FIRE (~30 MISS)"],
  ["₹15,000 CR", "INDIA-NEPAL PACKAGE"],
  ["8 MOUS", "INDIA-NEPAL, SIGNED"],
  ["91 ALL OUT", "BANGLADESH, CENTURION"],
  ["56.0", "INDIA MFG PMI, 9-MO HIGH"],
  ["54,550", "NIKKEI FUT, FRI -5.06%"],
  ["7-0", "INDIA WOMEN HOCKEY"],
  ["557TH", "GURU NANAK JAYANTI"],
  ["₹5,610 CR", "NE PROJECTS, ARUNACHAL"],
  ["$5M", "GOOGLE AI, IIT KHARAGPUR"],
  ["700 MW", "WAAREE SOLAR+STORAGE"],
  ["1,000 KM", "INDIAN DRONE RADIO"],
];

const ALSO = [
  [13, "BANGLADESH VOWS TO ARREST EX-PM SHEIKH HASINA IF SHE RETURNS FROM INDIA", "REPORTED"],
  [14, "ARMENIA PROPOSES A NEW CONSTITUTION TO ADVANCE PEACE WITH AZERBAIJAN", "REPORTED"],
  [15, "AMIT SHAH ANNOUNCES ₹5,610 CRORE NORTHEAST PROJECTS IN ARUNACHAL PRADESH", "OFFICIAL"],
  [16, "FSSAI ORDERS PROSECUTION OF BISLERI OVER PACKAGED WATER QUALITY", "OFFICIAL"],
  [17, "KARNATAKA CONGRESS MLA NAYANA MOTAMMA RESIGNS IN ELEPHANT-RELOCATION ROW", "CONFIRMED"],
  [18, "10 FILMS COMPETE FOR THE ICFT-UNESCO GANDHI MEDAL AT IFFI", "CONFIRMED"],
  [19, "SUPREME COURT HEARS DELHI AIR POLLUTION AND WEST BENGAL ELECTORAL-ROLL CASES", "OFFICIAL"],
  [20, "SC PERMITS ONE-TIME KARTHIGAI DEEPAM LIGHTING AT THIRUPARANKUNDRAM HILL ON 24 NOV", "OFFICIAL"],
  [21, "DELHI COURT ISSUES NON-BAILABLE WARRANT AGAINST DHRUV RATHEE", "OFFICIAL"],
  [22, "UGC NET DEC 2026 CITY INTIMATION SLIP EXPECTED", "REPORTED"],
  [23, "PUNJAB BOARD ANNOUNCES CLASS 8/10/12 EXAM SCHEDULE FOR 2027", "OFFICIAL"],
  [24, "DELHI NURSERY ADMISSIONS 2027-28: SCHOOLS UPLOAD CRITERIA", "OFFICIAL"],
  [25, "INDIA-FRANCE DEEPEN SPACE COOPERATION, INCL. JOINT TRISHNA SATELLITE", "REPORTED"],
  [26, "INDIAN RESEARCHERS BUILD RADIO SYSTEM FOR DRONES OVER 1,000 KM", "REPORTED"],
  [27, "RESEARCHERS REPORT POTENTIAL AI-ASSISTED PROGRESS ON 160-YEAR-OLD RIEMANN HYPOTHESIS", "CLAIM"],
  [28, "NEW MARINE BRISTLE WORM HYPERETEONE INDICA FOUND OFF ODISHA AND W. BENGAL COASTS", "CONFIRMED"],
  [29, "INDIAN SCIENTISTS EXPLORE MICROGRAVITY RESEARCH FOR NEW MEDICINES", "REPORTED"],
  [30, "INDIA MANUFACTURING PMI RISES TO 56.0 IN NOVEMBER, A NINE-MONTH HIGH", "OFFICIAL"],
  [31, "INDIAN COMPANIES PLAN ~$2.7B IN BOND SALES AHEAD OF RBI'S DECEMBER POLICY", "REPORTED"],
  [32, "WAAREE ENERGIES SIGNS 700 MW SOLAR + STORAGE PROJECT IN MAHARASHTRA", "CONFIRMED"],
  [33, "APL APOLLO APPROVES TATA STEEL ACQUISITIONS WORTH ₹28,000 CRORE", "CONFIRMED"],
  [34, "RUPEE CLOSES WEAKER NEAR ₹92.91 PER US DOLLAR", "CONFIRMED"],
  [35, "AFGHANISTAN A BEATS HONG KONG BY 7 WICKETS, ASIA CUP RISING STARS", "CONFIRMED"],
  [36, "LEPCHENKO BEATS RENCHELI IN ARGENTINA OPEN ROUND 1", "CONFIRMED"],
  [37, "ABHAY SINGH AND AKANKSHA SALUNKHE WIN NATIONAL SQUASH TITLES", "CONFIRMED"],
  [38, "PAKISTAN A BEATS INDIA A BY 48 RUNS, RISING STARS; TILAK VARMA SCORES A CENTURY", "CONFIRMED"],
  [39, "SHUBMAN GILL EYES SECOND-TEST WIN IN CHRISTCHURCH", "REPORTED"],
  [40, "AIFF SPORTSPERSONS OF MERIT: BEMBEM DEVI, BENTLA D'COTH, JO PAUL ANCHERI, BRUNO COUTINHO", "OFFICIAL"],
  [41, "BMKG HEAVY-RAIN ALERT: CENTRAL AND EAST JAVA DISTRICTS ON ALERT TUESDAY", "OFFICIAL"],
  [42, "IMD: DENSE FOG IN BIHAR, JHARKHAND, ODISHA; HEAVY RAIN IN TAMIL NADU AND KERALA", "OFFICIAL"],
  [43, "EXPENSIFY LAUNCHES INSIGHTS, AI-POWERED EXPENSE ANALYTICS", "CONFIRMED"],
  [44, "VICTORIAN BUSINESS LEADERS UNITE TO PUSH THE NEXT STATE GOVERNMENT ON THE ECONOMY", "CONFIRMED"],
  [45, "NSW COUNCILS PUT MINNS GOVERNMENT ON NOTICE OVER POKER-MACHINE REFORM", "CONFIRMED"],
  [46, "TONIGHT: CHAMPIONS LEAGUE — ARSENAL-DORTMUND, REAL MADRID-PSV, MAN CITY-NAPOLI, GALATASARAY-ASTON VILLA", "SCHEDULED"],
  [47, "TONIGHT: NFL MONDAY NIGHT FOOTBALL — WASHINGTON VS CINCINNATI, 8:15 WIB", "SCHEDULED"],
  [48, "SYED MUSHTAQ ALI TROPHY PLATE FINAL IN DIMAPUR TODAY", "SCHEDULED"],
  [49, "SHEFFIELD SHIELD: SOUTH AUSTRALIA VS VICTORIA IN ADELAIDE TODAY", "SCHEDULED"],
];

const DATECHECK = [
  "COP31 TALKS COLLAPSE - SUN 22 NOV",
  "MERKURY WARSHIP SUNK (CLAIMED) - MON 23",
  "MISSILES IN POLAND/NATO AIR - FRI 20 NOV",
  "MYANMAR ICJ GENOCIDE RULING - THU 19",
  "INDIA-NZ TEST DRAW, WELLINGTON - MON 23",
  "ALCARAZ WINS ATP FINALS - SUN 22 NOV",
  "SENSEX -1,484 PTS - MON 23 NOV",
  "TRUMP-XI-PUTIN SUMMIT - LAST WEEK",
];

// ============================================================
// SCENE DRAWING HELPERS
// ============================================================
function stick(cx, cy, h, c, opt) {
  // cy = top of head, h = total height. opt: {armL, armR, legSplit, cane}
  opt = opt || {};
  const hr = Math.max(2, Math.round(h * 0.16));
  fillCircle(cx, cy + hr, hr, c);
  const neck = cy + 2 * hr;
  const hip = cy + Math.round(h * 0.55);
  line(cx, neck, cx, hip, c, 1);
  const foot = cy + h - 1;
  const ls = opt.legSplit == null ? hr * 1.6 : opt.legSplit;
  line(cx, hip, cx - ls, foot, c, 1);
  line(cx, hip, cx + ls, foot, c, 1);
  const sh = neck + Math.round((hip - neck) * 0.2);
  if (opt.armL) line(cx, sh, cx - ls - 1, sh - 3 + (opt.armL.dy || 0), c, 1);
  else line(cx, sh, cx - ls - 1, sh + 3, c, 1);
  if (opt.armR) line(cx, sh, cx + ls + 1, sh - 3 + (opt.armR.dy || 0), c, 1);
  else line(cx, sh, cx + ls + 1, sh + 3, c, 1);
  if (opt.cane) line(cx + ls + 2, sh, cx + ls + 4, foot, c, 1);
  return cx;
}
function flagIndia(x, y, w, h) {
  fillRect(x, y, w, Math.round(h / 3), [244, 150, 40]);
  fillRect(x, y + Math.round(h / 3), w, Math.round(h / 3), WHITE);
  fillRect(x, y + 2 * Math.round(h / 3), w, h - 2 * Math.round(h / 3), [20, 130, 60]);
  fillCircle(x + w / 2, y + h / 2, Math.max(1, Math.round(h / 6)), [10, 20, 110]);
  strokeRect(x, y, w, h, INK, 1);
}
function flagNepal(x, y, w, h) {
  fillPoly([[x, y], [x + w * 0.75, y + h * 0.5], [x + w * 0.3, y + h * 0.5], [x + w, y + h], [x, y + h]], [198, 18, 48]);
  line(x, y, x, y + h, [0, 40, 130], 1);
  line(x, y, x + w * 0.75, y + h * 0.5, [0, 40, 130], 1);
  line(x + w * 0.75, y + h * 0.5, x + w * 0.3, y + h * 0.5, [0, 40, 130], 1);
  line(x + w * 0.3, y + h * 0.5, x + w, y + h, [0, 40, 130], 1);
  text(x + 2, y + h * 0.55, "+", 1, WHITE);
}
function flagSK(x, y, w, h) {
  fillRect(x, y, w, h, WHITE);
  strokeRect(x, y, w, h, GRAY, 1);
  const cx = x + w / 2, cy = y + h / 2, r = Math.max(2, Math.round(h * 0.28));
  fillCircle(cx, cy, r, [205, 40, 50]);
  fillCircle(cx, cy + Math.round(r / 2), Math.round(r / 2), [10, 40, 140]);
  fillCircle(cx, cy - Math.round(r / 2), Math.round(r / 3), [205, 40, 50]);
}
function smokePlume(x, y, n, tint) {
  const c1 = tint || [120, 115, 110];
  for (let i = 0; i < n; i++) {
    const wob = Math.round(Math.sin(i * 1.7) * (2 + i));
    const r = 2 + Math.floor(i * 0.8);
    fillCircle(x + wob, y - i * 4, r, mix(c1, PAPER, i / (n * 2.2)));
  }
}
function flame(cx, baseY, w, h, c1, c2) {
  fillPoly([[cx - w / 2, baseY], [cx, baseY - h], [cx + w / 2, baseY]], c1);
  fillPoly([[cx - w / 4, baseY], [cx, baseY - Math.round(h * 0.6)], [cx + w / 4, baseY]], c2);
}
function stars(x, y, w, h, n, c) {
  for (let i = 0; i < n; i++) {
    const sx = x + Math.floor(rnd() * w), sy = y + Math.floor(rnd() * h);
    fillRect(sx, sy, 1, 1, c);
    if (rnd() > 0.8) fillRect(sx - 1, sy, 3, 1, c);
  }
}

// ============================================================
// THE 12 PICTURED SCENES
// ============================================================
function sceneFire(x, y, w, h) {
  fillRect(x, y, w, h, [216, 202, 180]); // smoky sky
  smokePlume(x + w * 0.62, y + h * 0.34, 9, [105, 100, 96]);
  smokePlume(x + w * 0.4, y + h * 0.4, 6, [130, 124, 118]);
  const bx = x + w * 0.18, bw = w * 0.6, bh = h * 0.42, by = y + h - bh - Math.round(h * 0.16);
  fillRect(bx, by, bw, bh, [122, 66, 52]); // factory block
  fillRect(bx, by - 4, bw, 4, [88, 48, 40]); // roof
  fillRect(bx + bw * 0.32, by - 12, 6, 8, [70, 40, 34]); // chimney
  // windows: some burning
  for (let r = 0; r < 3; r++) {
    for (let c2 = 0; c2 < 5; c2++) {
      const wx = bx + 6 + c2 * (bw - 14) / 5, wy = by + 6 + r * (bh - 14) / 3;
      const burning = (r === 0 && c2 % 2 === 0) || (r === 1 && c2 === 3);
      if (burning) { fillRect(wx, wy, 8, 8, ORANGE); flame(wx + 4, wy + 9, 9, 10, RED, [255, 200, 40]); }
      else fillRect(wx, wy, 8, 8, [30, 26, 26]);
    }
  }
  flame(bx + bw * 0.5, by - 4, 26, 16, RED, [255, 190, 40]);
  flame(bx + bw * 0.2, by - 4, 16, 11, RED, [255, 190, 40]);
  // ladders
  line(x + w * 0.06, y + h - 4, bx + 12, by + 8, INK, 2);
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    line(x + w * 0.06 + (bx + 12 - x - w * 0.06) * t, (y + h - 4) + (by + 8 - y - h + 4) * t - 2,
      x + w * 0.06 + (bx + 12 - x - w * 0.06) * t + 4, (y + h - 4) + (by + 8 - y - h + 4) * t - 2, INK, 1);
  }
  // fire truck + crew
  fillRect(x + w * 0.03, y + h - 14, 26, 10, [190, 30, 30]);
  fillRect(x + w * 0.03 + 20, y + h - 18, 10, 6, [190, 30, 30]);
  fillCircle(x + w * 0.03 + 6, y + h - 4, 3, INK); fillCircle(x + w * 0.03 + 22, y + h - 4, 3, INK);
  stick(x + w * 0.33, y + h - 26, 22, INK, { armL: {}, armR: {} });
  stick(x + w * 0.87, y + h - 26, 22, INK, { armL: {} });
  fillRect(x + w * 0.33 - 3, y + h - 28, 7, 3, [250, 180, 30]); // helmets
  fillRect(x + w * 0.87 - 3, y + h - 28, 7, 3, [250, 180, 30]);
  fillRect(x, y + h - 4, w, 4, [70, 66, 60]); // ground
}
function sceneHandshake(x, y, w, h) {
  fillRect(x, y, w, h, [232, 224, 204]);
  // two flags on poles
  line(x + w * 0.13, y + 3, x + w * 0.13, y + h - 8, INK, 1);
  flagIndia(x + w * 0.13 + 1, y + 3, 24, 12);
  line(x + w * 0.87, y + 3, x + w * 0.87, y + h - 8, INK, 1);
  flagNepal(x + w * 0.87 - 14, y + 3, 14, 13);
  // two figures shaking hands
  const cy2 = y + h - 8;
  stick(x + w * 0.4, cy2 - 30, 30, INK, { armR: {}, armL: {} });
  stick(x + w * 0.6, cy2 - 30, 30, [60, 30, 30], { armR: {}, armL: {} });
  fillCircle(x + w * 0.5, cy2 - 16, 3, INK); // clasped hands
  fillRect(x, y + h - 8, w, 8, [160, 150, 130]);
  text(x + 4, y + h - 7, "BILATERAL TALKS", 1, mix(PAPER, INK, 0.5));
}
function sceneTokyo(x, y, w, h) {
  fillRect(x, y, w, h, [16, 28, 24]); // board
  const cells = ["54,550", "-3,008", "56,436", "-5.06%"];
  for (let i = 0; i < 4; i++) {
    const cw = w / 4;
    fillRect(x + 2 + i * cw, y + 3, cw - 3, 13, i % 2 ? [46, 20, 20] : [18, 42, 30]);
    textCentered(x + 2 + i * cw + (cw - 3) / 2, y + 6, cells[i], 1,
      i % 2 ? [255, 120, 100] : [120, 230, 140]);
  }
  fillRect(x + 2, y + 18, w - 4, 12, [10, 18, 16]);
  text(x + 5, y + 20, "TUE: CASH MARKET REOPENS", 1, [200, 220, 200]);
  // falling arrow
  line(x + w * 0.55, y + h - 6, x + w * 0.95, y + 20, RED, 2);
  fillPoly([[x + w * 0.95, y + 20], [x + w * 0.95 - 8, y + 22], [x + w * 0.95 - 3, y + 27]], RED);
  stick(x + w * 0.18, y + h - 20, 18, [180, 200, 180], { armR: { dy: -4 } });
}
function sceneKyiv(x, y, w, h) {
  for (let i = 0; i < 5; i++) fillRect(x, y + i * (h / 5), w, h / 5 + 1, mix([40, 44, 78], [190, 120, 70], i / 4));
  // skyline silhouettes
  const hs = [0.55, 0.4, 0.62, 0.45, 0.5, 0.38, 0.58, 0.42];
  for (let i = 0; i < 8; i++) {
    const bwid = w / 8, bx = x + i * bwid;
    fillRect(bx + 1, y + h - hs[i] * h, bwid - 2, hs[i] * h, [26, 24, 30]);
    fillRect(bx + 3, y + h - hs[i] * h + 4, 3, 3, [240, 200, 90]);
    fillRect(bx + bwid - 7, y + h - hs[i] * h + 8, 3, 3, [240, 200, 90]);
  }
  smokePlume(x + w * 0.32, y + h * 0.36, 5, [150, 145, 140]);
  smokePlume(x + w * 0.68, y + h * 0.42, 4, [150, 145, 140]);
}
function sceneTemple(x, y, w, h) {
  fillRect(x, y, w, h, [205, 220, 230]);
  const cx = x + w * 0.5, base = y + h - 12;
  fillRect(cx - 30, base - 12, 60, 12, WHITE); // base
  fillCircle(cx, base - 22, 13, [222, 168, 40]); // golden dome
  fillPoly([[cx - 13, base - 22], [cx + 13, base - 22], [cx, base - 34]], [222, 168, 40]);
  fillRect(cx - 1.5, base - 40, 3, 7, [180, 130, 20]); // spire
  fillRect(cx - 44, base - 20, 12, 20, WHITE); // towers
  fillCircle(cx - 38, base - 22, 6, [222, 168, 40]);
  fillRect(cx + 32, base - 20, 12, 20, WHITE);
  fillCircle(cx + 38, base - 22, 6, [222, 168, 40]);
  fillRect(x, base, w, 12, [70, 120, 160]); // pool
  for (let i = 0; i < 5; i++) fillRect(cx - 24 + i * 10, base + 3 + (i % 2), 6, 1, [230, 200, 90]);
  for (let i = 0; i < 9; i++) fillRect(x + 6 + i * ((w - 12) / 9), y + h - 3, 3, 2, mix(WHITE, INK, 0.35)); // devotees
}
function sceneCricket(x, y, w, h) {
  fillRect(x, y, w, h, [40, 96, 52]); // field
  fillCircle(x + w * 0.5, y + h * 0.55, h * 0.9, [52, 112, 62]);
  fillRect(x + w * 0.36, y + h * 0.3, w * 0.28, h * 0.55, [188, 156, 104]); // pitch
  // stumps + batsman at right end
  for (let i = 0; i < 3; i++) line(x + w * 0.62 + i * 3, y + h * 0.42, x + w * 0.62 + i * 3, y + h * 0.58, [240, 235, 220], 1);
  stick(x + w * 0.68, y + h * 0.3, 20, INK, { armL: {}, armR: { dy: -6 } });
  // bowler mid-action
  stick(x + w * 0.34, y + h * 0.26, 20, [40, 30, 30], { armR: { dy: -8 }, armL: { dy: 4 } });
  fillCircle(x + w * 0.47, y + h * 0.44, 2, [190, 30, 30]); // ball
  chip(x + 3, y + 3, "91 ALL OUT", [40, 20, 20], [255, 210, 120]);
}
function sceneWelfare(x, y, w, h) {
  fillRect(x, y, w, h, [214, 226, 228]);
  for (let i = 0; i < 7; i++) {
    const bwid = w / 7, bx = x + i * bwid, bh2 = (0.35 + (i % 3) * 0.16) * h;
    fillRect(bx + 2, y + h - 10 - bh2, bwid - 4, bh2, mix([120, 130, 140], PAPER, 0.15));
  }
  const gy = y + h - 10;
  fillRect(x, gy, w, 10, [140, 134, 122]);
  stick(x + w * 0.4, gy - 24, 24, INK, { cane: true });
  stick(x + w * 0.5, gy - 22, 22, [60, 40, 40], {});
  stick(x + w * 0.6, gy - 14, 14, INK, {});
  line(x + w * 0.4 + 3, gy - 8, x + w * 0.5 - 2, gy - 6, INK, 1); // holding hands
  line(x + w * 0.5 + 2, gy - 6, x + w * 0.6 - 2, gy - 4, INK, 1);
}
function sceneGovt(x, y, w, h) {
  fillRect(x, y, w, h, [222, 218, 206]);
  const cx = x + w * 0.5, by = y + h - 8;
  fillPoly([[cx - 34, y + 16], [cx + 34, y + 16], [cx, y + 4]], [150, 140, 120]); // pediment
  fillRect(cx - 36, y + 16, 72, by - y - 16, WHITE);
  strokeRect(cx - 36, y + 16, 72, by - y - 16, [150, 140, 120], 1);
  for (let i = 0; i < 5; i++) fillRect(cx - 30 + i * 13, y + 18, 4, by - y - 20, [180, 172, 152]);
  line(cx - 20, y + 4, cx - 20, y + 2, INK, 1); line(cx + 20, y + 4, cx + 20, y + 2, INK, 1);
  flagSK(cx - 30, y - 1, 11, 8); flagSK(cx + 18, y - 1, 11, 8);
  line(cx - 20, y + 2, cx - 20, by, INK, 1); line(cx + 20, y + 2, cx + 20, by, INK, 1);
  fillRect(x, by, w, 8, [150, 144, 130]);
  textCentered(cx, by + 1, "NEW FM + NIS CHIEF", 1, mix(PAPER, INK, 0.55));
}
function sceneMercury(x, y, w, h) {
  fillRect(x, y, w, h, [8, 8, 14]);
  stars(x + 2, y + 2, w - 4, h - 4, 26, WHITE);
  const px = x + w * 0.68, py = y + h * 0.52, pr = h * 0.42;
  fillCircle(px, py, pr, [150, 118, 92]);
  fillCircle(px - pr * 0.3, py - pr * 0.2, pr * 0.28, [118, 92, 72]);
  fillCircle(px + pr * 0.25, py + pr * 0.3, pr * 0.2, [118, 92, 72]);
  fillCircle(px + pr * 0.05, py - pr * 0.45, pr * 0.14, [118, 92, 72]);
  // spacecraft with panels
  const sx = x + w * 0.2, sy = y + h * 0.4;
  fillRect(sx - 5, sy - 4, 10, 8, [200, 205, 215]);
  fillRect(sx - 18, sy - 2, 12, 4, [40, 70, 160]);
  fillRect(sx + 6, sy - 2, 12, 4, [40, 70, 160]);
  line(sx + 5, sy - 2, sx + 11, sy - 6, [120, 125, 135], 1); // dish strut
  fillCircle(sx + 12, sy - 7, 2, [120, 125, 135]);
  // dotted trajectory
  for (let t = 0; t <= 10; t++) {
    const dx = sx + 14 + (px - sx - 30) * (t / 10);
    const dy = sy - 8 + (py - sy + 4) * (t / 10) - Math.sin(t / 10 * Math.PI) * 6;
    fillRect(dx, dy, 2, 2, [170, 175, 190]);
  }
}
function sceneAI(x, y, w, h) {
  fillRect(x, y, w, h, [228, 222, 206]);
  // campus building
  const bx = x + w * 0.3, by = y + h - 8;
  fillRect(bx, by - 20, w * 0.42, 20, [140, 66, 48]);
  fillPoly([[bx - 4, by - 20], [bx + w * 0.42 + 4, by - 20], [bx + w * 0.21, by - 28]], [110, 50, 38]);
  for (let i = 0; i < 4; i++) fillRect(bx + 5 + i * (w * 0.42 - 14) / 4, by - 17, 4, 14, [230, 220, 200]);
  fillRect(bx, by - 4, w * 0.42, 4, [170, 90, 66]);
  // AI chip + circuit traces
  const cx = x + w * 0.12, cy = y + h * 0.3;
  fillRect(cx - 9, cy - 7, 18, 14, [30, 36, 46]);
  strokeRect(cx - 9, cy - 7, 18, 14, TEAL, 1);
  textCentered(cx, cy - 3, "AI", 1, [110, 220, 210]);
  for (let i = 0; i < 4; i++) {
    line(cx + 9, cy - 5 + i * 3, cx + 16 + i * 2, cy - 5 + i * 3, TEAL, 1);
    fillRect(cx + 16 + i * 2, cy - 5 + i * 3, 2, 2, TEAL);
  }
  text(x + w * 0.75, y + h * 0.2, "$5M", 2, TEAL, { bold: true });
}
function sceneHockey(x, y, w, h) {
  fillRect(x, y, w, h, [46, 110, 58]); // pitch
  line(x, y + h / 2, x + w, y + h / 2, WHITE, 1);
  fillCircle(x + w * 0.5, y + h / 2, 6, WHITE); fillCircle(x + w * 0.5, y + h / 2, 5, [46, 110, 58]);
  // goal + net
  const gx = x + w * 0.78;
  line(gx, y + h * 0.2, gx, y + h * 0.8, WHITE, 2);
  line(gx, y + h * 0.2, x + w - 3, y + h * 0.3, WHITE, 1);
  line(gx, y + h * 0.8, x + w - 3, y + h * 0.7, WHITE, 1);
  for (let i = 1; i < 5; i++) {
    line(gx + i * (w - 3 - gx) / 5, y + h * 0.22 + i * 1, gx + i * (w - 3 - gx) / 5, y + h * 0.78 - i * 1, [220, 224, 220], 1);
  }
  // striker + ball in net
  stick(x + w * 0.42, y + h * 0.22, 22, [30, 40, 80], { armR: { dy: -8 } });
  line(x + w * 0.42 + 5, y + h * 0.42, x + w * 0.52, y + h * 0.62, INK, 2); // hockey stick
  fillCircle(gx + 8, y + h * 0.5, 2, WHITE);
  chip(x + 3, y + 3, "7-0", [20, 50, 30], [180, 240, 170]);
}
function sceneCourt(x, y, w, h) {
  fillRect(x, y, w, h, [230, 224, 208]);
  for (let i = 0; i < 5; i++) fillRect(x + 8 + i * 12, y + 4, 5, h - 12, [206, 198, 176]); // columns
  // scales of justice
  const cx = x + w * 0.4, top = y + 5, base = y + h - 6;
  line(cx, top + 6, cx, base, INK, 2);
  fillRect(cx - 6, base, 12, 3, INK);
  line(cx - 12, top + 8, cx + 12, top + 8, INK, 2);
  for (const s of [-12, 12]) {
    line(cx + s, top + 8, cx + s - 4, top + 14, [90, 90, 90], 1);
    line(cx + s, top + 8, cx + s + 4, top + 14, [90, 90, 90], 1);
    line(cx + s - 5, top + 14, cx + s + 5, top + 14, [90, 90, 90], 2);
  }
  // golden trophy
  const tx = x + w * 0.72, ty = y + h * 0.35;
  fillPoly([[tx - 6, ty], [tx + 6, ty], [tx + 3, ty + 10], [tx - 3, ty + 10]], [222, 168, 40]);
  fillRect(tx - 2, ty + 10, 4, 4, [180, 130, 20]);
  fillRect(tx - 6, ty + 14, 12, 3, [180, 130, 20]);
  chip(x + w - 3 - "TUE PM".length * 6 - 5, y + 3, "TUE PM", INK, [250, 210, 130]);
}

const SCENES = {
  fire: sceneFire, handshake: sceneHandshake, tokyo: sceneTokyo, kyiv: sceneKyiv,
  temple: sceneTemple, cricket: sceneCricket, welfare: sceneWelfare, govt: sceneGovt,
  mercury: sceneMercury, ai: sceneAI, hockey: sceneHockey, court: sceneCourt,
};

// ============================================================
// LAYOUT
// ============================================================
// ---------- paper background with deterministic grain ----------
fillRect(0, 0, W, H, PAPER);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const n = ((x * 17 + y * 23 + ((x * y) >> 6)) & 7) - 3;
    if (n !== 0 && (x + y) % 2 === 0) {
      const i = (y * W + x) * 3;
      img[i] = Math.max(0, Math.min(255, img[i] + n));
      img[i + 1] = Math.max(0, Math.min(255, img[i + 1] + n));
      img[i + 2] = Math.max(0, Math.min(255, img[i + 2] + n));
    }
  }
}

// ---------- masthead (y 0..88) ----------
fillRect(0, 0, W, 12, INK);
text(6, 3, "THE WORLD IN ONE PAGE", 1, WHITE, { bold: true });
textRight(W - 6, 3, "LATE EDITION · ALL 49 STORIES FROM TUESDAY ONLY", 1, mix(INK, WHITE, 0.6));
textCentered(W / 2, 18, "THE WORLD IN ONE PAGE", 4, INK, { bold: true });
hrule(6, 50, 250, INK, 1); hrule(W - 256, 50, 250, INK, 1);
text(6, 58, "49 STORIES", 1, GRAY);
text(6, 68, "12 PICTURED SCENES", 1, GRAY);
textRight(W - 6, 58, "THURSDAY 26 NOV: DEADLINE", 1, GRAY);
textRight(W - 6, 68, "FREE ENTRY", 1, GRAY);
textCentered(W / 2, 54, "TUESDAY 24 NOVEMBER 2026", 3, INK, { bold: true });
textCentered(W / 2, 76, "EVERY STORY, FIGURE AND SOURCE ON THIS PAGE IS DATED TUESDAY 24 NOVEMBER 2026", 1, GRAY);
hrule(0, 86, W, INK, 2);

// ---------- THE DAY IN NUMBERS (y 90..164) ----------
sectionBar(6, 90, W - 12, "THE DAY IN NUMBERS", "12 CHECKABLE FIGURES FROM THE DAY");
const numCols = 6, cellW = 165, cellH = 29;
for (let i = 0; i < 12; i++) {
  const col = i % numCols, row = Math.floor(i / numCols);
  const cx = 6 + col * 169, cy = 106 + row * 31;
  fillRect(cx, cy, cellW, cellH, i % 2 ? PAPER : WHITE);
  strokeRect(cx, cy, cellW, cellH, LGRAY, 1);
  fillRect(cx, cy, 3, cellH, mix(PAPER, INK, 0.35));
  textCentered(cx + cellW / 2, cy + 3, NUMBERS[i][0], 2, INK, { bold: true });
  textCentered(cx + cellW / 2, cy + 20, NUMBERS[i][1], 1, GRAY);
}

// ---------- PICTURED grid (y 168..547) ----------
sectionBar(6, 168, W - 12, "PICTURED — 12 SCENES FROM THE DAY", "NUMBERED CELLS MATCH THE MAP PINS");

// lead story: x6..256, y186..547
const L = PICTURED[0];
fillRect(6, 186, 250, 361, WHITE);
strokeRect(6, 186, 250, 361, INK, 1);
fillRect(6, 186, 3, 361, L.rc);
SCENES[L.scene](9, 189, 244, 166);
strokeRect(9, 189, 244, 166, LGRAY, 1);
chip(13, 193, "1 · LEAD PICTURE", INK, WHITE);
let ly = 366;
ly = wrapText(12, ly, L.hl, 2, INK, 20, 16, { bold: true });
ly += 4;
ly = wrapText(12, ly, L.body, 1, GRAY, 40, 8);
ly += 4;
let lw = chip(12, ly, L.tag, TAGC[L.tag]);
text(12 + lw + 5, ly + 1, "REGION: " + L.region, 1, L.rc);
ly += 14;
text(12, ly, "SOURCE: " + L.src, 1, GRAY);
ly += 14;
hrule(12, ly, 238, LGRAY, 1);
ly += 8;
fillRect(12, ly, 238, 56, PAPER_D);
strokeRect(12, ly, 238, 56, LGRAY, 1);
textCentered(131, ly + 6, "24 DEAD", 3, RED, { bold: true });
textCentered(131, ly + 28, "~30 MISSING", 2, INK, { bold: true });
textCentered(131, ly + 46, "TOLL RISES AS RESCUE CONTINUES", 1, GRAY);

// small cells: 3 cols x 4 rows at x262/518/774, y 186/277/368/459
const colX = [262, 518, 774];
const rowY = [186, 277, 368, 459];
const cellW2 = 250, cellH2 = 88;
for (let idx = 0; idx < 12; idx++) {
  const col = Math.floor(idx / 4), row = idx % 4;
  const x = colX[col], y = rowY[row];
  if (idx === 11) {
    // INSIDE THE PAGE box in the last slot
    fillRect(x, y, cellW2, cellH2, PAPER_D);
    strokeRect(x, y, cellW2, cellH2, INK, 1);
    text(x + 5, y + 4, "INSIDE THIS PAGE", 1, INK, { bold: true });
    hrule(x + 5, y + 14, cellW2 - 10, INK, 1);
    const inside = [
      "37 MORE STORIES: 'ALSO ON' BELOW",
      "THE DAY IN NUMBERS: 12 FIGURES",
      "WORLD MAP + 24-HOUR UTC TIMELINE",
      "DATE CHECK: 8 STORIES LEFT OUT",
      "SOURCES: AP/WIRES/NATIONAL PRESS",
    ];
    for (let i = 0; i < inside.length; i++) text(x + 5, y + 17 + i * 13, "· " + inside[i], 1, GRAY);
    continue;
  }
  const st = PICTURED[1 + idx];
  fillRect(x, y, cellW2, cellH2, WHITE);
  strokeRect(x, y, cellW2, cellH2, LGRAY, 1);
  fillRect(x, y, 3, cellH2, st.rc);
  SCENES[st.scene](x + 4, y + 3, cellW2 - 8, 34);
  strokeRect(x + 4, y + 3, cellW2 - 8, 34, LGRAY, 1);
  fillRect(x + 6, y + 5, 10, 10, INK);
  text(x + 8, y + 6, String(st.n), 1, WHITE);
  let ty = y + 41;
  ty = wrapText(x + 6, ty, st.hl, 1, INK, 40, 8, {});
  ty = wrapText(x + 6, ty, st.sub, 1, GRAY, 40, 8);
  ty += 1;
  const tw = chip(x + 6, ty, st.tag, TAGC[st.tag]);
  text(x + 6 + tw + 4, ty + 1, st.region, 1, st.rc);
  textRight(x + cellW2 - 6, ty + 1, "P" + st.n, 1, GRAY);
  text(x + 6, ty + 12, st.src, 1, GRAY);
}

// ---------- THE DAY IN UTC timeline (y 551..604) ----------
sectionBar(6, 551, W - 12, "THE DAY IN UTC — TUESDAY 24 NOVEMBER 2026", "DOT POSITIONS APPROXIMATE · HOURS FROM 00:00");
const tlX = 6, tlW = W - 12;
const bands = [
  ["ASIA-PACIFIC", 0, 8, mix(PAPER, RED, 0.14)],
  ["EUROPE & AFRICA", 8, 16, mix(PAPER, BLUE, 0.14)],
  ["AMERICAS", 16, 24, mix(PAPER, GREEN, 0.14)],
];
for (const [nm, a, b, c] of bands) {
  const bx = tlX + (a / 24) * tlW, bw = ((b - a) / 24) * tlW;
  fillRect(bx, 566, bw, 14, c);
  textCentered(bx + bw / 2, 569, nm, 1, mix(PAPER, INK, 0.55));
}
const axisY = 584;
hrule(tlX, axisY, tlW, INK, 2);
for (let hr = 0; hr <= 24; hr += 4) {
  const tx = tlX + (hr / 24) * tlW;
  line(tx, axisY, tx, axisY + 4, INK, 1);
  textCentered(tx, axisY + 6, String(hr).padStart(2, "0"), 1, GRAY);
}
function tDot(hr, n, c, solid) {
  const dx = tlX + (hr / 24) * tlW;
  if (solid) {
    fillCircle(dx, 578, 5, c);
    fillCircle(dx, 578, 3, WHITE);
    textCentered(dx, 576, String(n), 1, c);
  } else {
    strokeRect(dx - 4, 574, 9, 9, c, 1);
  }
}
tDot(0.4, 3, RED, true);   // tokyo reopen 09:00 JST = 00:00 UTC
tDot(1.2, 8, RED, true);   // seoul
tDot(2.2, 7, RED, true);   // beijing
tDot(3.5, 1, RED, true);   // jakarta
tDot(5.5, 5, RED, true);   // punjab
tDot(6.2, 2, RED, true);   // delhi
tDot(6.9, 11, ORANGE, true); // delhi hockey
tDot(7.6, 10, TEAL, true);  // kharagpur
tDot(8.8, 4, BLUE, true);  // kyiv
tDot(9.8, 6, ORANGE, true); // centurion
tDot(13, 12, ORANGE, true); // lausanne CAS
tDot(1.2, 47, PURPLE, false); // NFL 8:15 WIB
tDot(19, 46, PURPLE, false);  // CL evening kick-offs approx
fillCircle(tlX + (0 / 24) * tlW, 578, 2, INK);
text(tlX + 2, 572, "TOKYO REOPENS 09:00 JST", 1, INK);
textRight(tlX + tlW, 572, "SOLID = PICTURED No. · HOLLOW = TONIGHT", 1, GRAY);

// ---------- WHERE IT HAPPENED map (y 608..780) ----------
sectionBar(6, 608, W - 12, "WHERE IT HAPPENED", "PINS = PICTURED STORIES 1-12 · STYLIZED MAP");
const mapX = 6, mapY = 622, mapW = 714, mapH = 152;
fillRect(mapX, mapY, mapW, mapH, [220, 230, 236]);
strokeRect(mapX, mapY, mapW, mapH, INK, 1);
// graticule
for (const lon of [-120, -60, 0, 60, 120]) {
  const gx = mapX + ((lon + 180) / 360) * mapW;
  for (let yy = mapY; yy < mapY + mapH; yy += 4) fillRect(gx, yy, 1, 2, [200, 210, 216]);
}
for (const lat of [45, 0, -30]) {
  const gy = mapY + ((75 - lat) / 135) * mapH;
  for (let xx = mapX; xx < mapX + mapW; xx += 4) fillRect(xx, gy, 2, 1, [200, 210, 216]);
}
function mX(lon) { return mapX + ((lon + 180) / 360) * mapW; }
function mY(lat) { return mapY + ((75 - lat) / 135) * mapH; }
const CONT = [
  [[-166, 66], [-140, 70], [-120, 72], [-95, 74], [-80, 70], [-60, 60], [-55, 48], [-70, 44], [-76, 36], [-81, 30], [-90, 29], [-97, 26], [-105, 22], [-112, 28], [-120, 34], [-125, 42], [-135, 52], [-152, 58], [-166, 60]],
  [[-52, 82], [-30, 82], [-20, 74], [-32, 66], [-48, 68]],
  [[-78, 8], [-70, 11], [-60, 9], [-52, 5], [-44, -2], [-36, -6], [-40, -14], [-48, -26], [-56, -34], [-62, -40], [-68, -54], [-72, -50], [-72, -36], [-70, -20], [-76, -10], [-80, 0]],
  [[-9, 55], [0, 58], [8, 58], [18, 60], [28, 62], [38, 60], [42, 54], [36, 48], [28, 42], [20, 40], [14, 42], [6, 44], [0, 46], [-4, 48], [-8, 50]],
  [[-16, 14], [-8, 26], [0, 32], [10, 34], [22, 32], [32, 30], [36, 20], [42, 10], [50, 8], [44, 0], [40, -8], [36, -16], [30, -26], [24, -34], [16, -30], [12, -18], [8, -2], [0, 4], [-10, 6]],
  [[42, 48], [50, 44], [60, 40], [68, 40], [66, 32], [70, 24], [76, 10], [80, 8], [86, 20], [92, 22], [98, 10], [104, 2], [108, 10], [112, 20], [120, 24], [122, 32], [130, 34], [136, 40], [142, 46], [148, 52], [160, 60], [170, 64], [178, 66], [160, 68], [140, 70], [120, 72], [100, 74], [80, 72], [60, 70], [48, 64], [42, 56]],
  [[96, 4], [104, 0], [112, -4], [118, -6], [112, -8], [104, -6], [98, -2]],
  [[114, -22], [122, -14], [132, -11], [142, -11], [150, -20], [152, -30], [146, -38], [136, -34], [128, -32], [118, -32]],
  [[130, 32], [136, 35], [141, 40], [143, 44], [139, 41], [134, 35]],
  [[-6, 54], [-2, 56], [-1, 51], [-5, 50]],
];
for (const poly of CONT) {
  const pp = poly.map(([lo, la]) => [mX(lo), mY(la)]);
  fillPoly(pp, [172, 162, 138]);
  fillPoly(pp.map(([px2, py2]) => [px2, py2 + 1]), [150, 140, 118]);
}
// pin: 9x9 colored box with white number
function pin(x, y, n, c) {
  fillRect(x, y, 9, 9, WHITE);
  fillRect(x + 1, y + 1, 7, 7, c);
  text(x + 2, y + 2, String(n), 1, WHITE);
}
pin(mX(107) - 4, mY(-6) - 4, 1, RED);       // java fire
pin(mX(77) + 6, mY(28) + 8, 2, RED);        // delhi (offset, leader)
pin(mX(139.7) - 4, mY(35.7) - 4, 3, RED);   // tokyo
pin(mX(30.5) - 4, mY(50.4) - 4, 4, BLUE);   // kyiv
pin(mX(74) - 26, mY(31) - 14, 5, RED);      // amritsar
pin(mX(28.2) - 4, mY(-25.7) - 4, 6, ORANGE);// centurion
pin(mX(116.4) - 4, mY(39.9) - 4, 7, RED);   // beijing
pin(mX(127) - 4, mY(37.5) - 4, 8, RED);     // seoul
pin(mX(87) + 14, mY(22) + 8, 10, TEAL);     // kharagpur
pin(mX(80) + 6, mY(27) - 14, 11, ORANGE);   // delhi hockey
pin(mX(6.6) - 4, mY(46.5) - 4, 12, ORANGE); // lausanne
// leaders for offset india pins
line(mX(74) - 22, mY(31) - 10, mX(74), mY(31), INK, 1);
line(mX(77) + 8, mY(28) + 10, mX(77), mY(28), INK, 1);
line(mX(87) + 14, mY(22) + 10, mX(87), mY(22), INK, 1);
line(mX(80) + 8, mY(27) - 12, mX(77.5), mY(28.4), INK, 1);
// story 9: mercury inset planet in south pacific
const insX = mX(165), insY = mY(-42);
fillCircle(insX, insY, 8, [150, 118, 92]);
fillCircle(insX - 3, insY - 2, 2, [118, 92, 72]);
pin(insX + 10, insY - 4, 9, PURPLE);
text(insX - 14, insY + 10, "MERCURY", 1, PURPLE);

// right panel: region + confidence keys
const kx = 728, kw = 290;
fillRect(kx, mapY, kw, mapH, WHITE);
strokeRect(kx, mapY, kw, mapH, INK, 1);
text(kx + 5, mapY + 4, "REGION KEY (PICTURED)", 1, INK, { bold: true });
const regions = [
  ["ASIA", RED, 6], ["EUROPE", BLUE, 1], ["SPORT", ORANGE, 3],
  ["SCIENCE", PURPLE, 1], ["TECH", TEAL, 1],
];
for (let i = 0; i < regions.length; i++) {
  const ry = mapY + 16 + i * 12;
  fillRect(kx + 6, ry, 9, 9, regions[i][1]);
  text(kx + 19, ry + 1, regions[i][0], 1, INK);
  textRight(kx + kw - 6, ry + 1, String(regions[i][2]) + (regions[i][2] === 1 ? " STORY" : " STORIES"), 1, GRAY);
}
let ky = mapY + 16 + regions.length * 12 + 4;
hrule(kx + 5, ky, kw - 10, LGRAY, 1);
ky += 4;
text(kx + 5, ky, "CONFIDENCE KEY", 1, INK, { bold: true });
ky += 11;
const conf = [
  ["CONFIRMED", "CROSS-CHECKED REPORTING"],
  ["OFFICIAL", "GOVT / COURT / EXCHANGE PAPER"],
  ["REPORTED", "SINGLE-WIRE REPORT"],
  ["CLAIM", "ASSERTED, NOT VERIFIED"],
  ["SCHEDULED", "DUE LATER THIS TUESDAY"],
];
for (let i = 0; i < conf.length; i++) {
  text(kx + 6, ky, conf[i][0], 1, TAGC[conf[i][0]]);
  text(kx + 68, ky, "= " + conf[i][1], 1, GRAY);
  ky += 11;
}

// ---------- ALSO ON (y 784..984) ----------
sectionBar(6, 784, W - 12, "ALSO ON TUESDAY 24 NOVEMBER 2026", "37 MORE STORIES · No.13-49 · ALL DATED TODAY");
const listTop = 801;
const listBottom = 982;
const colW3 = 247;
const colX3 = [6, 259, 512, 765];
const maxLines = 21;
let ai = 0;
for (let c = 0; c < 4; c++) {
  let y = listTop;
  let used = 0;
  while (ai < ALSO.length) {
    const [n, txt, tag] = ALSO[ai];
    const lines = wrapWords(n + ". " + txt, colW3 / 6).length;
    if (used + lines > maxLines && used > 0) break;
    const toks = [
      { t: n + ".", c: INK, b: false },
      { t: txt, c: INK, b: false },
      { t: " [" + tag + "]", c: TAGC[tag], b: false },
    ];
    richText(colX3[c], y, toks, colW3 / 6, 1, 8);
    y += lines * 8 + 2;
    used += lines + 0;
    ai++;
  }
  if (c < 3) vrule(colX3[c] + colW3 + 3, listTop, listBottom - listTop, LGRAY, 1);
}
for (let c = 1; c < 4; c++) vrule(colX3[c] - 3, listTop, listBottom - listTop, LGRAY, 1);
// catch any items that did not fit (should not happen; draw as overflow at bottom)
if (ai < ALSO.length) {
  let y = listBottom - 8;
  for (; ai < ALSO.length; ai++) {
    const [n, txt, tag] = ALSO[ai];
    richText(6, y, [{ t: n + ".", c: INK }, { t: txt, c: INK }, { t: " [" + tag + "]", c: TAGC[tag] }], colW3 / 6, 1, 8);
    y -= 10;
  }
}

// ---------- DATE CHECK footer (y 988..1024) ----------
sectionBar(6, 988, W - 12, "DATE CHECK — LEFT OUT: NOT TUESDAY 24 NOVEMBER 2026", "EVERYTHING ABOVE ON THIS PAGE IS FROM TUESDAY ONLY", INK);
for (let i = 0; i < 8; i++) {
  const col = i % 4, row = Math.floor(i / 4);
  const x = colX3[col], y = 1004 + row * 10;
  fillRect(x, y + 2, 5, 5, RED);
  text(x + 9, y, DATECHECK[i], 1, mix(PAPER, INK, 0.75));
}
hrule(0, H - 2, W, INK, 2);

// ============================================================
// PNG ENCODER (stdlib zlib, hand-rolled chunks/CRC)
// ============================================================
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG() {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    const off = y * (1 + W * 3);
    raw[off] = 0; // filter: none
    for (let x = 0; x < W * 3; x++) {
      raw[off + 1 + x] = img[y * W * 3 + x];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type RGB
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- write ----------
const outDir = process.env.OUTPUT_DIR || "/output";
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "entry.png");
fs.writeFileSync(outPath, encodePNG());
const size = fs.statSync(outPath).size;
console.log("WROTE " + outPath + " (" + size + " bytes)");
