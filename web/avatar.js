'use strict';

/* Avatars: a full-body cartoon drawn as SVG from a small settings object,
   e.g. { skin: 's3', hair: 'long', hairColor: 'brown', top: 'tee', ... }.
   The same drawing is cropped for list pictures, the editor's tiles and the
   profile. Some items unlock at a level; keep UNLOCKS in sync with
   app_private.clean_avatar in supabase/schema.sql. */

const Avatar = (() => {
  /* ------------------------------------------------------------ catalogue */

  const SKIN = { s1: '#FBE3D0', s2: '#F4CDAE', s3: '#EBB892', s4: '#D49A6C', s5: '#B47A4B', s6: '#8A5632', s7: '#5C3920' };
  const HAIR_COLORS = {
    black: '#1F1A17', dark: '#3A2A20', brown: '#5E4130', chestnut: '#7B4F32', light: '#A67C56',
    blonde: '#D8B56F', platinum: '#EEDDAE', auburn: '#8A3A20', ginger: '#C2632F', gray: '#A8A8AC',
    pink: '#E78FB2', blue: '#5A7ED8', lilac: '#B69BE2',
  };
  const EYE_COLORS = { brown: '#6A4127', dark: '#2E1E15', hazel: '#8B6A2E', green: '#4D7D4A', blue: '#4A7EC2', gray: '#7C8692' };
  const CLOTH = {
    white: '#F3F2EE', black: '#27282D', navy: '#27334F', maroon: '#6F302C', red: '#C8443A', pink: '#F2C3CE',
    lilac: '#C6B5E2', sky: '#B7D0EA', green: '#3F8E69', olive: '#6B7A4E', mustard: '#D6A340', beige: '#E6D8BE',
    gray: '#A6AAB1', cream: '#EEE5CE',
  };
  const BOTTOM_COLORS = {
    grey: '#8D9096', blue: '#6E8CB3', light: '#BCCFE2', indigo: '#3B4A66', black: '#35363B',
    beige: '#D9C7A5', pink: '#F1C4CE', olive: '#6B7A4E', white: '#ECEBE6', maroon: '#6F302C',
  };
  const SHOE_COLORS = { white: '#F5F4F1', black: '#2A2A2E', chestnut: '#A36A3E', beige: '#D8BC93', pink: '#F2C3CE', sky: '#B7D0EA', gray: '#9EA2A8' };

  // [key, Dutch label]
  const STYLES = {
    hair: [['long', 'Lang'], ['wavy', 'Golvend'], ['bob', 'Bob'], ['bun', 'Knot'], ['ponytail', 'Paardenstaart'],
      ['braids', 'Vlechten'], ['curly', 'Krullen'], ['short', 'Kort'], ['buzz', 'Heel kort'], ['none', 'Kaal']],
    eyes: [['round', 'Rond'], ['almond', 'Amandel'], ['side', 'Opzij'], ['happy', 'Lachend']],
    brows: [['soft', 'Zacht'], ['arched', 'Gebogen'], ['straight', 'Recht']],
    mouth: [['smile', 'Glimlach'], ['grin', 'Lach'], ['neutral', 'Neutraal'], ['pout', 'Pruillip'], ['smirk', 'Grijns']],
    beard: [['none', 'Geen'], ['stubble', 'Stoppels'], ['mustache', 'Snor'], ['beard', 'Baard']],
    top: [['tee', 'T-shirt'], ['vneck', 'V-hals'], ['tank', 'Topje'], ['longsleeve', 'Lange mouw'], ['sweater', 'Trui'],
      ['hoodie', 'Hoodie'], ['chef', 'Koksvest']],
    outer: [['none', 'Geen'], ['jacket', 'Jasje'], ['puffer', 'Bodywarmer']],
    bottom: [['baggy', 'Wijde jeans'], ['straight', 'Rechte jeans'], ['joggers', 'Joggingbroek'], ['skirt', 'Rok'], ['shorts', 'Short']],
    shoes: [['sneakers', 'Sneakers'], ['boots', 'Laarsjes'], ['bunny', 'Konijnensloffen'], ['monster', 'Monstersloffen']],
    hat: [['none', 'Geen'], ['beanie', 'Muts'], ['cap', 'Pet'], ['bandana', 'Bandana'], ['chef', 'Koksmuts'], ['crown', 'Kroon']],
    glasses: [['none', 'Geen'], ['round', 'Rond'], ['square', 'Vierkant'], ['sun', 'Zonnebril']],
    earrings: [['none', 'Geen'], ['studs', 'Knopjes'], ['hoops', 'Ringen'], ['stack', 'Meerdere']],
    piercing: [['none', 'Geen'], ['nose', 'Neus'], ['septum', 'Septum']],
  };
  const COLORS = {
    skin: SKIN, hairColor: HAIR_COLORS, eyeColor: EYE_COLORS, topColor: CLOTH, outerColor: CLOTH,
    bottomColor: BOTTOM_COLORS, shoeColor: SHOE_COLORS, hatColor: CLOTH,
  };
  // Items that unlock at a level. Same list as the database.
  const UNLOCKS = {
    hat: { cap: 2, bandana: 5, chef: 8, crown: 10 }, shoes: { bunny: 3, monster: 7 }, outer: { puffer: 4 },
    glasses: { sun: 6 }, top: { chef: 8 }, hairColor: { pink: 9, blue: 9, lilac: 9 },
  };
  const DEFAULT = {
    skin: 's3', hair: 'long', hairColor: 'brown', eyes: 'round', eyeColor: 'brown', brows: 'soft', mouth: 'smile',
    beard: 'none', freckles: false, blush: true, top: 'tee', topColor: 'white', outer: 'none', outerColor: 'cream',
    bottom: 'baggy', bottomColor: 'grey', shoes: 'sneakers', shoeColor: 'white', hat: 'none', hatColor: 'white',
    glasses: 'none', earrings: 'none', piercing: 'none',
  };

  const levelOf = (key, value) => (UNLOCKS[key] || {})[value] || 1;
  // What unlocks at each level, for the profile and the level-up message.
  function rewardsAt(level) {
    const out = [];
    for (const [key, items] of Object.entries(UNLOCKS)) {
      for (const [value, lvl] of Object.entries(items)) {
        if (lvl !== level) continue;
        const style = (STYLES[key] || []).find(s => s[0] === value);
        if (style) out.push(style[1]);
        else if (key === 'hairColor') { if (!out.includes('Fantasiekleuren voor je haar')) out.push('Fantasiekleuren voor je haar'); }
      }
    }
    return out;
  }

  function normalize(cfg) {
    const c = { ...DEFAULT, ...(cfg && typeof cfg === 'object' ? cfg : {}) };
    for (const [k, list] of Object.entries(STYLES)) if (!list.some(s => s[0] === c[k])) c[k] = DEFAULT[k];
    for (const [k, map] of Object.entries(COLORS)) if (!map[c[k]]) c[k] = DEFAULT[k];
    c.freckles = !!c.freckles; c.blush = !!c.blush;
    return c;
  }

  function random(level = 1) {
    const pick = (key, list) => {
      const ok = list.filter(v => levelOf(key, v) <= level);
      return ok[Math.floor(Math.random() * ok.length)];
    };
    const c = {};
    for (const [k, list] of Object.entries(STYLES)) c[k] = pick(k, list.map(s => s[0]));
    for (const [k, map] of Object.entries(COLORS)) c[k] = pick(k, Object.keys(map));
    // keep the extras rare so random looks stay tidy
    if (Math.random() < 0.6) c.hat = 'none';
    if (Math.random() < 0.6) c.glasses = 'none';
    if (Math.random() < 0.7) c.beard = 'none';
    if (Math.random() < 0.6) c.outer = 'none';
    if (Math.random() < 0.6) c.piercing = 'none';
    if (c.top === 'chef') c.top = 'tee';
    c.freckles = Math.random() < 0.3; c.blush = Math.random() < 0.6;
    return c;
  }

  /* --------------------------------------------------------------- colour */

  const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const hex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const dark = (c, t = 0.18) => mix(c, '#000000', t);
  const light = (c, t = 0.2) => mix(c, '#FFFFFF', t);
  const luma = c => { const [r, g, b] = rgb(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

  /* -------------------------------------------------------------- drawing */

  // Every shape is drawn for the viewer's left side and mirrored for the right.
  // Paths only use absolute M, L, C, Q and Z, so every number pair is x, y.
  function mirror(d) {
    let i = 0;
    return d.replace(/[MLCQZ]|-?\d*\.?\d+/g, t => {
      if (/[A-Z]/.test(t)) { i = 0; return t; }
      return (i++ % 2 === 0) ? String(Math.round((200 - parseFloat(t)) * 100) / 100) : t;
    });
  }
  const both = d => [d, mirror(d)];
  const OL = 'stroke="rgba(45,28,18,.32)" stroke-width="1" stroke-linejoin="round"';
  const path = (d, fill, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const shape = (d, fill) => path(d, fill, OL);
  const line = (d, color, w = 1.4, op = 1) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${op}"/>`;
  const ell = (cx, cy, rx, ry, fill, extra = '') => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
  const circ = (cx, cy, r, fill, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${extra}/>`;

  /* ---- body ---- */

  const ARM = 'M 60 172 C 51 176 47 190 46 210 L 43 272 Q 43 280 50 280 L 60 280 Q 65 280 65 272 L 70 214 C 71 200 71 186 67 176 Z';
  const NECK = 'M 89 136 L 111 136 L 112 172 L 88 172 Z';
  const TORSO = 'M 64 180 Q 66 168 86 165 L 89 160 L 111 160 L 114 165 Q 134 168 136 180 L 137 266 L 63 266 Z';
  const LEG = 'M 68 290 L 97 290 L 95 386 L 73 386 Z';
  const FACE = 'M 58 96 C 58 60 76 42 100 42 C 124 42 142 60 142 96 C 142 124 128 148 100 152 C 72 148 58 124 58 96 Z';

  function body(c) {
    const skin = SKIN[c.skin], sd = dark(skin, 0.14);
    return {
      arms: both(ARM).map(d => shape(d, skin)).join(''),
      hands: [ell(54, 288, 8.5, 11, skin, OL), ell(146, 288, 8.5, 11, skin, OL)].join(''),
      neck: shape(NECK, skin) + path('M 89 144 Q 100 158 111 144 L 111 152 Q 100 164 89 152 Z', sd, 'opacity=".55"'),
      torso: shape(TORSO, skin) + line('M 82 178 Q 90 182 96 180', sd, 1.2, 0.6) + line('M 118 178 Q 110 182 104 180', sd, 1.2, 0.6),
      legs: both(LEG).map(d => shape(d, skin)).join(''),
      ears: [ell(58, 104, 7, 11, skin, OL), ell(142, 104, 7, 11, skin, OL), ell(58.5, 105, 3, 6, sd, 'opacity=".5"'), ell(141.5, 105, 3, 6, sd, 'opacity=".5"')].join(''),
      face: shape(FACE, skin) +
        path('M 62 112 C 66 136 82 150 100 152 C 118 150 134 136 138 112 C 132 140 116 149 100 149 C 84 149 68 140 62 112 Z', sd, 'opacity=".35"'),
    };
  }

  /* ---- face ---- */

  function eyes(c) {
    const iris = EYE_COLORS[c.eyeColor], skin = SKIN[c.skin], lash = '#1B1310', lid = dark(skin, 0.3);
    // s = -1 for the eye on the viewer's left, whose outer corner is on the left
    const one = (cx, s) => {
      const ox = cx + s * 11, ix = cx - s * 10.5, at = f => (ix + (ox - ix) * f).toFixed(1);
      const lashes = (yIn, yOut, top) => line(`M ${ix} ${yIn} C ${at(0.3)} ${top} ${at(0.75)} ${top - 0.5} ${ox} ${yOut}`, lash, 2.6) +
        line(`M ${ox} ${yOut} L ${ox + s * 3.5} ${yOut - 3}`, lash, 1.9);
      const lower = y => line(`M ${cx - 8} ${y} Q ${cx} ${y + 3.3} ${cx + 8} ${y}`, lid, 1, 0.55);
      const ball = (x, y, r) => circ(x, y, r, iris) + circ(x, y, r * 0.52, '#160F0B') + circ(x - r * 0.35, y - r * 0.35, r * 0.28, '#FFFFFF');
      switch (c.eyes) {
        case 'happy':
          return line(`M ${cx - 9} 102 Q ${cx} 93 ${cx + 9} 102`, lash, 2.6) + line(`M ${ox - s * 1.5} 100 L ${ox + s * 2} 97`, lash, 1.8);
        case 'almond':
          return ell(cx, 100, 10.5, 6.5, '#FFFFFF') + ball(cx, 100.5, 5.2) + lashes(100.5, 98.5, 92.5) + lower(104.8);
        case 'side':
          return ell(cx, 100, 10, 7.5, '#FFFFFF') + ball(cx + 3.6, 101, 5.6) +
            path(`M ${cx - 12} 99.5 C ${cx - 8} 94.5 ${cx + 8} 94.5 ${cx + 12} 99.5 L ${cx + 12} 88 L ${cx - 12} 88 Z`, skin) +
            lashes(99.5, 99, 95.5) + lower(106);
        default:
          return ell(cx, 100, 10, 8, '#FFFFFF') + ball(cx, 101, 6.2) + circ(cx + 2, 103.4, 0.8, '#FFFFFF', 'opacity=".7"') +
            lashes(99, 97.5, 91) + lower(106.5);
      }
    };
    return one(81, -1) + one(119, 1);
  }

  function brows(c) {
    const col = dark(HAIR_COLORS[c.hairColor], c.hairColor === 'platinum' || c.hairColor === 'blonde' ? 0.3 : 0.2);
    const d = c.brows === 'arched' ? 'M 69 88 Q 77 78 92 84' : c.brows === 'straight' ? 'M 70 85.5 Q 80 82.5 92 84.5' : 'M 70 87 Q 79 81 92 84';
    return line(d, col, 3.4) + line(mirror(d), col, 3.4);
  }

  function mouth(c) {
    const skin = SKIN[c.skin], lip = mix(skin, '#C45A5E', 0.42), lipDark = dark(lip, 0.25);
    switch (c.mouth) {
      case 'grin':
        return path('M 87 126 Q 100 144 113 126 Q 100 130 87 126 Z', '#7B2C2E', `stroke="${lipDark}" stroke-width="1"`) +
          path('M 89.5 127 Q 100 131 110.5 127 L 109.5 130 Q 100 133.5 90.5 130 Z', '#FFFFFF') +
          path('M 94 136.5 Q 100 139.5 106 136.5 Q 100 134.5 94 136.5 Z', '#E07A82', 'opacity=".8"');
      case 'neutral':
        return path('M 90 128.5 Q 95 124.5 100 127 Q 105 124.5 110 128.5 Q 100 130.5 90 128.5 Z', lip) +
          path('M 91.5 129 Q 100 136.5 108.5 129 Q 100 131 91.5 129 Z', light(lip, 0.08)) + line('M 90.5 128.7 Q 100 130.6 109.5 128.7', lipDark, 1.1);
      case 'pout':
        return path('M 92 129 Q 96 126 100 127.5 Q 104 126 108 129 Q 100 130.5 92 129 Z', lip) +
          path('M 92.5 129.5 Q 100 137 107.5 129.5 Q 100 131.5 92.5 129.5 Z', light(lip, 0.08)) + line('M 92 129.3 Q 100 128.4 108 129.3', lipDark, 1.2);
      case 'smirk':
        return line('M 91 130 Q 102 133 111 126', lipDark, 2.2) + path('M 95 132 Q 102 135.5 108 130.5 Q 102 133.5 95 132 Z', lip, 'opacity=".8"');
      default:
        return line('M 88.5 127 Q 100 137.5 111.5 127', lipDark, 2.3) + path('M 92.5 131 Q 100 137.5 107.5 131 Q 100 134.2 92.5 131 Z', lip, 'opacity=".85"');
    }
  }

  function nose(c) {
    const sd = dark(SKIN[c.skin], 0.28);
    return line('M 96.5 116 Q 100 119.5 103.5 116', sd, 1.7, 0.8) + line('M 101 104 Q 102.5 110 101.5 114', sd, 1.1, 0.25);
  }

  function cheeks(c) {
    let s = '';
    if (c.blush) s += ell(76, 118, 8.5, 4.6, '#F07C84', 'opacity=".28"') + ell(124, 118, 8.5, 4.6, '#F07C84', 'opacity=".28"');
    if (c.freckles) {
      const fc = dark(SKIN[c.skin], 0.38);
      const dots = [[84, 111, 1.1], [88, 114, 0.9], [80, 115, 1], [86, 118, 0.9], [92, 112, 0.8], [77, 111, 0.8], [83, 108, 0.8]];
      for (const [x, y, r] of dots) s += circ(x, y, r, fc, 'opacity=".6"') + circ(200 - x, y, r, fc, 'opacity=".6"');
    }
    return s;
  }

  function facialHair(c) {
    const hc = HAIR_COLORS[c.hairColor];
    switch (c.beard) {
      case 'stubble':
        return path('M 62 112 C 66 138 82 151 100 152 C 118 151 134 138 138 112 C 133 126 124 134 114 134 Q 100 138 86 134 C 76 134 67 126 62 112 Z', hc, 'opacity=".22"') +
          path('M 88 124 Q 100 119 112 124 Q 106 127 100 126 Q 94 127 88 124 Z', hc, 'opacity=".3"');
      case 'mustache':
        return path('M 87 125.5 Q 94 119 100 122.5 Q 106 119 113 125.5 Q 106 126.5 100 125 Q 94 126.5 87 125.5 Z', dark(hc, 0.05), OL);
      case 'beard':
        return path('M 60 104 C 62 140 82 156 100 156 C 118 156 138 140 140 104 C 136 120 128 130 116 132 Q 100 120 84 132 C 72 130 64 120 60 104 Z', hc, OL) +
          path('M 87 125.5 Q 94 119 100 122.5 Q 106 119 113 125.5 Q 106 126.5 100 125 Q 94 126.5 87 125.5 Z', dark(hc, 0.05)) +
          path('M 90 132 Q 100 139 110 132 Q 100 135 90 132 Z', mix(SKIN[c.skin], '#C45A5E', 0.42));
      default: return '';
    }
  }

  /* ---- hair ---- */

  function hair(c) {
    const hc = HAIR_COLORS[c.hairColor], hd = dark(hc, 0.22), hl = light(hc, 0.35);
    const shine = line('M 70 56 Q 82 42 97 40', hl, 3, 0.35);
    const strand = d => line(d, hd, 1.2, 0.45);
    const capPart = 'M 54 104 C 50 56 74 31 100 32 C 126 31 150 56 146 104 C 144 86 136 70 118 60 C 110 56 104 54 100 49 C 96 54 90 56 82 60 C 64 70 56 86 54 104 Z';
    const capSlick = 'M 56 98 C 52 58 76 35 100 35 C 124 35 148 58 144 98 C 140 78 128 63 100 59 C 72 63 60 78 56 98 Z';
    const capLines = strand('M 99 50 C 88 56 72 66 62 88') + strand(mirror('M 99 50 C 88 56 72 66 62 88'));
    let back = '', front = '';
    switch (c.hair) {
      case 'long': {
        back = shape('M 100 30 C 70 30 50 50 50 92 L 48 160 C 47 200 50 240 54 262 L 146 262 C 150 240 153 200 152 160 L 150 92 C 150 50 130 30 100 30 Z', hd);
        const s = 'M 54 96 C 50 130 54 170 60 205 C 64 230 66 245 70 260 C 74 252 78 243 80 232 C 76 200 70 160 66 124 C 64 108 62 96 58 88 Z';
        front = both(s).map(d => shape(d, hc)).join('') + shape(capPart, hc) + capLines + shine +
          strand('M 60 120 C 62 170 66 210 72 248') + strand(mirror('M 60 120 C 62 170 66 210 72 248'));
        break;
      }
      case 'wavy': {
        back = shape('M 100 30 C 70 30 50 50 48 92 C 44 120 54 140 48 165 C 42 190 54 210 50 235 C 48 250 54 262 60 264 L 140 264 C 146 262 152 250 150 235 C 146 210 158 190 152 165 C 146 140 156 120 152 92 C 150 50 130 30 100 30 Z', hd);
        const s = 'M 54 96 C 48 120 58 136 54 156 C 50 176 62 190 58 210 C 54 230 66 242 70 260 C 76 252 82 244 80 232 C 80 214 72 202 74 186 C 76 168 66 154 68 136 C 70 118 62 100 58 88 Z';
        front = both(s).map(d => shape(d, hc)).join('') + shape(capPart, hc) + capLines + shine +
          strand('M 62 130 C 58 150 66 170 64 190 C 62 212 70 228 72 246') + strand(mirror('M 62 130 C 58 150 66 170 64 190 C 62 212 70 228 72 246'));
        break;
      }
      case 'bob': {
        back = shape('M 100 30 C 68 30 48 52 48 96 C 48 124 50 146 56 160 L 144 160 C 150 146 152 124 152 96 C 152 52 132 30 100 30 Z', hd);
        const side = 'M 52 100 C 50 130 52 150 58 162 L 74 162 C 66 140 62 120 60 96 Z';
        front = both(side).map(d => shape(d, hc)).join('') +
          shape('M 52 112 C 46 60 72 32 100 32 C 128 32 154 60 148 112 C 146 96 144 86 140 76 Q 121 81 100 77 Q 79 81 60 76 C 56 86 54 96 52 112 Z', hc) +
          strand('M 74 78 L 72 62') + strand('M 88 79 L 87 58') + strand('M 112 79 L 113 58') + strand('M 126 78 L 128 62') + shine;
        break;
      }
      case 'bun':
        back = shape('M 100 34 C 72 34 54 52 54 96 L 146 96 C 146 52 128 34 100 34 Z', hd) +
          circ(100, 24, 17, hc, OL) + line('M 90 20 Q 100 12 110 22 Q 104 32 94 28', hd, 1.3, 0.6);
        front = shape(capSlick, hc) + strand('M 100 37 C 84 40 70 50 62 76') + strand(mirror('M 100 37 C 84 40 70 50 62 76')) + shine +
          line('M 59 92 Q 57 102 60 110', hc, 1.6, 0.9) + line('M 141 92 Q 143 102 140 110', hc, 1.6, 0.9);
        break;
      case 'ponytail':
        back = shape('M 100 34 C 72 34 54 52 54 96 L 146 96 C 146 52 128 34 100 34 Z', hd) +
          shape('M 128 48 C 154 46 164 76 160 112 C 157 146 151 176 155 208 C 141 190 135 158 139 120 C 141 92 138 70 124 60 Z', hc) +
          line('M 150 82 C 154 110 148 146 150 184', hd, 1.2, 0.45) + ell(130, 53, 5, 7, dark(hc, 0.4), 'transform="rotate(-30 130 53)"');
        front = shape(capSlick, hc) + strand('M 100 37 C 84 40 70 50 62 76') + strand(mirror('M 100 37 C 84 40 70 50 62 76')) + shine;
        break;
      case 'braids': {
        back = shape('M 100 30 C 68 30 50 52 50 96 L 52 130 L 148 130 L 150 96 C 150 52 132 30 100 30 Z', hd);
        let braid = '';
        for (const sx of [1, -1]) {
          for (let i = 0; i < 9; i++) {
            const x = 100 + sx * (38 - (i % 2) * 2.5 - i * 0.4), y = 116 + i * 16;
            braid += ell(x, y, 8.5, 10, hc, OL) + line(`M ${x - 6} ${y - 2} Q ${x} ${y + 4} ${x + 6} ${y - 2}`, hd, 1.1, 0.5);
          }
          braid += ell(100 + sx * 34, 262, 4, 3, dark(hc, 0.45)) + path(`M ${100 + sx * 30} 264 L ${100 + sx * 38} 264 L ${100 + sx * 36} 276 L ${100 + sx * 32} 276 Z`, hc, OL);
        }
        front = braid + shape(capPart, hc) + capLines + shine;
        break;
      }
      case 'curly': {
        let cloud = '';
        for (let a = 150; a <= 390; a += 16) {
          const t = a * Math.PI / 180, x = 100 + Math.cos(t) * 50, y = 86 + Math.sin(t) * 50;
          if (y > 132) continue;
          cloud += circ(x.toFixed(1), y.toFixed(1), 15, hc, OL);
        }
        back = cloud + circ(100, 76, 50, hc);
        let fringe = '';
        for (const [x, y, r] of [[66, 70, 10], [78, 58, 11], [92, 52, 11], [108, 52, 11], [122, 58, 11], [134, 70, 10], [100, 44, 10], [84, 44, 9], [116, 44, 9]]) {
          fringe += circ(x, y, r, hc, OL) + line(`M ${x - 4} ${y} Q ${x} ${y - 5} ${x + 4} ${y}`, hd, 1, 0.5);
        }
        front = fringe + shine;
        break;
      }
      case 'short':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 56 100 C 50 52 76 29 102 29 C 128 29 150 50 145 100 C 143 88 141 78 136 70 C 126 62 112 64 98 59 C 86 66 70 64 62 74 C 59 82 57 92 56 100 Z', hc) +
          shape('M 56 94 L 62 94 L 61 110 L 57 110 Z', hc) + shape(mirror('M 56 94 L 62 94 L 61 110 L 57 110 Z'), hc) +
          strand('M 70 58 L 78 46') + strand('M 84 52 L 92 40') + strand('M 104 52 L 112 40') + strand('M 120 56 L 128 46') + shine;
        break;
      case 'buzz':
        front = path('M 58 96 C 54 56 76 38 100 38 C 124 38 146 56 142 96 C 140 80 132 66 100 62 C 68 66 60 80 58 96 Z', hc, 'opacity=".82"');
        break;
      default:
        front = line('M 74 54 Q 86 46 98 46', '#FFFFFF', 3, 0.25);
    }
    return { back, front };
  }

  /* ---- clothes ---- */

  const SLEEVE_SHORT = 'M 59 171 C 49 175 44 190 43 212 L 70 217 C 71 200 71 186 68 175 Z';
  const SLEEVE_LONG = 'M 59 171 C 49 175 44 190 43 212 L 40 274 Q 40 282 48 282 L 62 282 Q 68 282 68 274 L 72 216 C 72 200 72 186 68 175 Z';
  const BODY_CREW = 'M 60 180 Q 62 168 82 164 Q 100 172 118 164 Q 138 168 140 180 L 143 272 Q 100 278 57 272 Z';

  function top(c) {
    const col = c.top === 'chef' ? CLOTH.white : CLOTH[c.topColor], cd = dark(col, 0.12), cl = light(col, 0.12);
    const fold = path('M 118 172 Q 136 176 139 190 L 143 272 Q 130 275 122 275 Q 126 220 118 172 Z', '#000', 'opacity=".05"');
    const hem = line('M 58 266 Q 100 272 142 266', cd, 1.2, 0.5);
    const sleeves = kind => both(kind === 'long' ? SLEEVE_LONG : SLEEVE_SHORT).map(d => shape(d, col)).join('') +
      (kind === 'long' ? line('M 41 270 L 67 271', cd, 1.4, 0.8) + line(mirror('M 41 270 L 67 271'), cd, 1.4, 0.8)
        : line('M 44 209 L 70 213.5', cd, 1.4, 0.8) + line(mirror('M 44 209 L 70 213.5'), cd, 1.4, 0.8));
    switch (c.top) {
      case 'tank':
        return shape('M 62 198 Q 100 207 138 198 L 143 272 Q 100 278 57 272 Z', col) +
          both('M 75 199 L 80 165 L 84 165 L 80.5 199.5 Z').map(d => shape(d, col)).join('') +
          line('M 63 199 Q 66 203 69 200 Q 72 204 75 201 Q 78 205 81 202 Q 84 206 87 203 Q 90 207 93 204 Q 96 207.5 100 205 Q 104 207.5 107 204 Q 110 207 113 203 Q 116 206 119 202 Q 122 205 125 201 Q 128 204 131 200 Q 134 203 137 199', cl, 1.6, 0.9) +
          fold + hem;
      case 'vneck':
        return sleeves('short') + shape('M 60 180 Q 62 168 84 164 L 100 192 L 116 164 Q 138 168 140 180 L 143 272 Q 100 278 57 272 Z', col) +
          line('M 85 166 L 100 191 L 115 166', cd, 2, 0.7) + fold + hem;
      case 'longsleeve':
        return sleeves('long') + shape(BODY_CREW, col) + line('M 84 165.5 Q 100 174 116 165.5', cd, 2, 0.7) + fold + hem;
      case 'sweater':
        return sleeves('long') + shape(BODY_CREW, col) +
          path('M 82 164 Q 100 172 118 164 L 119 169 Q 100 179 81 169 Z', cd, OL) +
          path('M 57 262 Q 100 268 143 262 L 143 272 Q 100 278 57 272 Z', cd, 'opacity=".55"') +
          line('M 42.5 266 L 66 267', cd, 4, 0.5) + line(mirror('M 42.5 266 L 66 267'), cd, 4, 0.5) + fold;
      case 'hoodie':
        return sleeves('long') + shape(BODY_CREW, col) +
          shape('M 74 170 Q 70 156 84 151 Q 100 166 116 151 Q 130 156 126 170 Q 100 186 74 170 Z', cd) +
          line('M 94 177 L 93 206', cl, 1.6) + line('M 106 177 L 107 206', cl, 1.6) + circ(93, 207, 1.6, cl) + circ(107, 207, 1.6, cl) +
          path('M 76 232 L 124 232 L 130 262 L 70 262 Z', cd, `${OL} opacity=".55"`) +
          path('M 57 262 Q 100 268 143 262 L 143 274 Q 100 280 57 274 Z', cd, 'opacity=".7"') + fold;
      case 'chef':
        return sleeves('long') + shape(BODY_CREW, col) +
          path('M 84 162 Q 100 170 116 162 L 116 170 Q 100 178 84 170 Z', '#FFFFFF', OL) +
          line('M 84 170 Q 108 186 112 210 L 112 270', '#C9C9C9', 1.4) +
          [190, 212, 234, 256].map(y => circ(90, y, 2.2, '#D0D0D0', OL) + circ(118, y, 2.2, '#D0D0D0', OL)).join('') + fold + hem;
      default:
        return sleeves('short') + shape(BODY_CREW, col) + line('M 84 165.5 Q 100 174 116 165.5', cd, 2, 0.7) + fold + hem;
    }
  }

  function outer(c) {
    if (c.outer === 'none') return '';
    const col = CLOTH[c.outerColor], cd = dark(col, 0.14);
    if (c.outer === 'puffer') {
      const panel = 'M 60 180 Q 62 167 84 162 L 97 192 L 97 278 L 56 278 Q 54 230 60 180 Z';
      let quilts = '';
      for (const y of [198, 216, 234, 252, 268]) quilts += line(`M 58 ${y} Q 77 ${y + 4} 96 ${y}`, cd, 1.3, 0.7) + line(mirror(`M 58 ${y} Q 77 ${y + 4} 96 ${y}`), cd, 1.3, 0.7);
      return both(panel).map(d => shape(d, col)).join('') + quilts +
        shape('M 81 150 Q 100 158 119 150 L 118 163 Q 100 171 82 163 Z', col) + line('M 98 166 L 98 278', cd, 1.4, 0.8) +
        path('M 62 184 Q 66 230 64 276 L 58 276 Q 56 230 60 184 Z', '#FFFFFF', 'opacity=".18"');
    }
    const sleeve = 'M 58 170 C 47 175 42 190 41 212 L 38 276 Q 38 284 46 284 L 63 284 Q 69 284 69 276 L 73 216 C 73 200 73 186 69 174 Z';
    const panel = 'M 60 178 Q 62 167 84 162 L 93 186 L 91 278 L 56 278 Q 54 230 60 178 Z';
    return both(sleeve).map(d => shape(d, col)).join('') + line('M 39 268 L 69 269', cd, 1.5, 0.8) + line(mirror('M 39 268 L 69 269'), cd, 1.5, 0.8) +
      both(panel).map(d => shape(d, col)).join('') +
      both('M 84 162 L 93 186 L 86 194 L 76 168 Z').map(d => shape(d, cd)).join('') +
      both('M 66 204 L 82 204 L 82 216 L 66 216 Z').map(d => path(d, 'none', `stroke="${cd}" stroke-width="1.3"`)).join('') +
      line('M 66 208 L 82 208', cd, 1.3) + line(mirror('M 66 208 L 82 208'), cd, 1.3);
  }

  function bottom(c) {
    const col = BOTTOM_COLORS[c.bottomColor], cd = dark(col, 0.16), cl = light(col, 0.18);
    const denim = ['baggy', 'straight', 'shorts'].includes(c.bottom);
    const seams = denim
      ? line('M 100 258 L 100 300', cd, 1.3, 0.8) + line('M 70 262 Q 80 274 86 258', cd, 1.2, 0.7) + line(mirror('M 70 262 Q 80 274 86 258'), cd, 1.2, 0.7) +
        line('M 64 262 L 136 262', cd, 1.2, 0.5)
      : '';
    switch (c.bottom) {
      case 'straight':
        return shape('M 65 256 L 135 256 L 134 384 L 104 384 L 100 304 L 96 384 L 66 384 Z', col) + seams +
          path('M 72 300 L 80 300 L 79 384 L 73 384 Z', cl, 'opacity=".35"') + path(mirror('M 72 300 L 80 300 L 79 384 L 73 384 Z'), cl, 'opacity=".35"') +
          line('M 66 378 L 96 378', cd, 1.2, 0.6) + line('M 104 378 L 134 378', cd, 1.2, 0.6);
      case 'joggers':
        return shape('M 64 256 L 136 256 L 138 370 L 105 370 L 100 304 L 95 370 L 62 370 Z', col) +
          shape('M 66 368 L 93 368 L 92 383 L 68 383 Z', cd) + shape(mirror('M 66 368 L 93 368 L 92 383 L 68 383 Z'), cd) +
          line('M 96 262 Q 94 276 92 282', cl, 1.6) + line('M 104 262 Q 106 276 108 282', cl, 1.6) +
          line('M 76 320 Q 82 324 88 320', cd, 1.2, 0.6) + line(mirror('M 76 320 Q 82 324 88 320'), cd, 1.2, 0.6) + line('M 64 264 L 136 264', cd, 2, 0.5);
      case 'skirt':
        return shape('M 66 256 L 134 256 L 150 342 Q 100 352 50 342 Z', col) +
          line('M 82 262 L 74 344', cd, 1.2, 0.5) + line('M 100 262 L 100 348', cd, 1.2, 0.5) + line('M 118 262 L 126 344', cd, 1.2, 0.5) +
          line('M 66 264 L 134 264', cd, 2, 0.5);
      case 'shorts':
        return shape('M 64 256 L 136 256 L 141 318 L 104 318 L 100 298 L 96 318 L 59 318 Z', col) + seams +
          line('M 60 312 L 96 312', cd, 1.2, 0.6) + line('M 104 312 L 140 312', cd, 1.2, 0.6);
      default:
        return shape('M 64 256 L 136 256 L 142 384 L 104 384 L 100 304 L 96 384 L 58 384 Z', col) + seams +
          path('M 70 300 L 80 300 L 78 384 L 66 384 Z', cl, 'opacity=".3"') + path(mirror('M 70 300 L 80 300 L 78 384 L 66 384 Z'), cl, 'opacity=".3"') +
          line('M 72 330 Q 80 334 88 328', cd, 1.1, 0.5) + line('M 70 356 Q 78 360 88 354', cd, 1.1, 0.5) +
          line(mirror('M 72 330 Q 80 334 88 328'), cd, 1.1, 0.5) + line(mirror('M 70 356 Q 78 360 88 354'), cd, 1.1, 0.5) +
          line('M 59 377 L 96 378', cd, 1.4, 0.6) + line('M 104 378 L 141 377', cd, 1.4, 0.6);
    }
  }

  function shoes(c) {
    const col = SHOE_COLORS[c.shoeColor];
    switch (c.shoes) {
      case 'boots': {
        const s = 'M 58 398 Q 56 372 65 366 L 93 366 Q 101 372 101 398 Q 101 408 92 408 L 67 408 Q 58 408 58 398 Z';
        return both(s).map(d => shape(d, col)).join('') + line('M 59 402 L 100 402', dark(col, 0.25), 2.4, 0.6) + line(mirror('M 59 402 L 100 402'), dark(col, 0.25), 2.4, 0.6);
      }
      case 'bunny': {
        const fur = '#B8AFA7', fd = dark(fur, 0.2);
        let s = '';
        for (const x of [78, 122]) {
          s += ell(x - 7, 380, 4, 10, fur, `${OL} transform="rotate(-14 ${x - 7} 380)"`) + ell(x + 7, 380, 4, 10, fur, `${OL} transform="rotate(14 ${x + 7} 380)"`) +
            ell(x - 7, 381, 1.8, 6, '#E9B4B8', `transform="rotate(-14 ${x - 7} 381)"`) + ell(x + 7, 381, 1.8, 6, '#E9B4B8', `transform="rotate(14 ${x + 7} 381)"`) +
            ell(x, 395, 22, 11, fur, OL) + circ(x - 6, 393, 1.8, '#2A2220') + circ(x + 6, 393, 1.8, '#2A2220') + ell(x, 397, 2.4, 1.6, '#E58C95') +
            line(`M ${x - 4} 399 Q ${x} 401 ${x + 4} 399`, fd, 1, 0.8);
        }
        return s;
      }
      case 'monster': {
        const fur = '#3D4FCB', fd = dark(fur, 0.25);
        let s = '';
        for (const x of [78, 122]) {
          s += path(`M ${x - 23} 400 Q ${x - 25} 386 ${x - 16} 383 Q ${x - 12} 377 ${x - 5} 381 Q ${x} 376 ${x + 5} 381 Q ${x + 12} 377 ${x + 16} 383 Q ${x + 25} 386 ${x + 23} 400 Q ${x} 408 ${x - 23} 400 Z`, fur, OL) +
            line(`M ${x - 16} 396 L ${x - 14} 392`, fd, 1.4) + line(`M ${x + 16} 396 L ${x + 14} 392`, fd, 1.4) +
            circ(x - 7, 388, 5.5, '#FFFFFF', OL) + circ(x + 7, 388, 5.5, '#FFFFFF', OL) + circ(x - 6, 389, 2.6, '#151515') + circ(x + 8, 389, 2.6, '#151515');
        }
        return s;
      }
      default: {
        const s = 'M 56 396 Q 56 381 72 380 L 88 380 Q 102 382 102 398 L 102 402 Q 101 408 95 408 L 61 408 Q 56 408 56 403 Z';
        const accent = luma(col) > 0.6 ? '#C8CCD2' : light(col, 0.4);
        return both(s).map(d => shape(d, col)).join('') +
          path('M 56.5 401 L 101.5 401 L 101.5 402 Q 101 408 95 408 L 61 408 Q 56.5 408 56.5 403 Z', dark(col, 0.1)) + path(mirror('M 56.5 401 L 101.5 401 L 101.5 402 Q 101 408 95 408 L 61 408 Q 56.5 408 56.5 403 Z'), dark(col, 0.1)) +
          line('M 70 387 L 88 387 M 72 391.5 L 90 391.5', accent, 1.3) + line(mirror('M 70 387 L 88 387 M 72 391.5 L 90 391.5'), accent, 1.3) +
          line('M 60 397 Q 74 392 84 398', accent, 1.8, 0.9) + line(mirror('M 60 397 Q 74 392 84 398'), accent, 1.8, 0.9);
      }
    }
  }

  /* ---- extras ---- */

  function earrings(c) {
    const gold = '#E2B23C', gd = '#B8861B';
    switch (c.earrings) {
      case 'studs': return circ(58.5, 116, 2.4, gold, `stroke="${gd}" stroke-width=".8"`) + circ(141.5, 116, 2.4, gold, `stroke="${gd}" stroke-width=".8"`);
      case 'hoops': return `<circle cx="58" cy="121" r="5.5" fill="none" stroke="${gold}" stroke-width="1.8"/><circle cx="142" cy="121" r="5.5" fill="none" stroke="${gold}" stroke-width="1.8"/>`;
      case 'stack': return `<circle cx="58" cy="121" r="5" fill="none" stroke="${gold}" stroke-width="1.7"/><circle cx="142" cy="121" r="5" fill="none" stroke="${gold}" stroke-width="1.7"/>` +
        circ(57, 108, 1.7, gold) + circ(143, 108, 1.7, gold) + circ(56.5, 101, 1.4, gold) + circ(143.5, 101, 1.4, gold);
      default: return '';
    }
  }

  function piercing(c) {
    if (c.piercing === 'nose') return '<path d="M 104.5 115 Q 107.5 117.5 105 120" fill="none" stroke="#C9CDD3" stroke-width="1.5" stroke-linecap="round"/>';
    if (c.piercing === 'septum') return '<path d="M 97.5 118 Q 100 122.5 102.5 118" fill="none" stroke="#C9CDD3" stroke-width="1.5" stroke-linecap="round"/>';
    return '';
  }

  function glasses(c) {
    const frame = '#2B2B2E';
    switch (c.glasses) {
      case 'round':
        return `<g fill="rgba(255,255,255,.12)" stroke="${frame}" stroke-width="2.3"><circle cx="81" cy="100" r="12.5"/><circle cx="119" cy="100" r="12.5"/></g>` +
          line('M 93.5 99 Q 100 95.5 106.5 99', frame, 2.2) + line('M 68.5 98 L 59 96', frame, 2) + line('M 131.5 98 L 141 96', frame, 2);
      case 'square':
        return `<g fill="rgba(255,255,255,.12)" stroke="${frame}" stroke-width="2.4"><rect x="67" y="90" width="28" height="20" rx="5"/><rect x="105" y="90" width="28" height="20" rx="5"/></g>` +
          line('M 95 98 Q 100 95 105 98', frame, 2.2) + line('M 67 96 L 59 95', frame, 2) + line('M 133 96 L 141 95', frame, 2);
      case 'sun':
        return `<g fill="#1E1F23" stroke="#111" stroke-width="2"><path d="M 66 92 L 96 92 Q 96 112 82 112 Q 66 112 66 92 Z"/><path d="M 104 92 L 134 92 Q 134 112 118 112 Q 104 112 104 92 Z"/></g>` +
          line('M 96 94 Q 100 91.5 104 94', '#111', 2.2) + line('M 70 97 L 78 95', '#FFFFFF', 2, 0.35) + line('M 108 97 L 116 95', '#FFFFFF', 2, 0.35) +
          line('M 66 94 L 59 95', '#111', 2) + line('M 134 94 L 141 95', '#111', 2);
      default: return '';
    }
  }

  function hat(c) {
    const col = CLOTH[c.hatColor], cd = dark(col, 0.16), cl = light(col, 0.2);
    switch (c.hat) {
      case 'beanie':
        return shape('M 54 82 C 52 38 76 20 100 20 C 124 20 148 38 146 82 Z', col) +
          shape('M 51 70 Q 100 58 149 70 L 149 88 Q 100 76 51 88 Z', cd) +
          [62, 72, 82, 92, 100, 108, 118, 128, 138].map(x => line(`M ${x} ${x < 100 ? 70 - (x - 51) * 0.2 : 70 - (149 - x) * 0.2} L ${x} ${x < 100 ? 86 - (x - 51) * 0.2 : 86 - (149 - x) * 0.2}`, dark(col, 0.3), 1, 0.35)).join('') +
          circ(100, 18, 8, cl, OL);
      case 'cap':
        return shape('M 53 78 C 51 36 76 19 100 19 C 124 19 149 36 147 78 Q 100 66 53 78 Z', col) +
          path('M 53 78 Q 100 66 147 78 L 147 72 Q 100 60 53 72 Z', cd) +
          path('M 87 72 Q 87 57 100 57 Q 113 57 113 72 Z', HAIR_COLORS[c.hairColor], OL) +
          path('M 89 66 L 111 66 L 111 69.5 L 89 69.5 Z', cd) +
          line('M 100 21 Q 84 34 80 68', cd, 1.1, 0.5) + line('M 100 21 Q 116 34 120 68', cd, 1.1, 0.5) + circ(100, 20.5, 3, cd);
      case 'bandana': {
        const b = c.hatColor === 'white' ? CLOTH.navy : col;
        let dots = '';
        for (const [x, y] of [[70, 50], [86, 38], [104, 34], [122, 42], [134, 58], [78, 66], [96, 54], [114, 58], [62, 68]]) {
          dots += line(`M ${x - 4} ${y} Q ${x} ${y - 5} ${x + 4} ${y} Q ${x} ${y + 3} ${x - 2} ${y - 1}`, '#F1F1F1', 1.4, 0.85);
        }
        return shape('M 51 86 C 49 40 76 23 100 23 C 124 23 151 40 149 86 Q 100 70 51 86 Z', b) + dots +
          path('M 51 86 Q 100 70 149 86 L 149 80 Q 100 64 51 80 Z', dark(b, 0.25)) +
          shape('M 146 74 Q 160 80 162 96 Q 154 90 148 92 Z', b);
      }
      case 'chef':
        return circ(74, 36, 18, '#FFFFFF', OL) + circ(126, 36, 18, '#FFFFFF', OL) + circ(100, 24, 24, '#FFFFFF', OL) +
          path('M 62 40 L 138 40 L 138 54 L 62 54 Z', '#FFFFFF') +
          shape('M 60 70 Q 100 62 140 70 L 140 52 Q 100 46 60 52 Z', '#F4F4F4') +
          line('M 86 30 L 88 48', '#D9D9D9', 1.2) + line('M 112 30 L 110 48', '#D9D9D9', 1.2);
      case 'crown':
        return path('M 66 62 L 69 30 L 84 46 L 100 20 L 116 46 L 131 30 L 134 62 Q 100 56 66 62 Z', '#E8B830', 'stroke="#B8861B" stroke-width="1.4" stroke-linejoin="round"') +
          path('M 67 56 Q 100 50 133 56 L 134 62 Q 100 56 66 62 Z', '#C9971F') +
          circ(69, 30, 3.2, '#E8B830', 'stroke="#B8861B"') + circ(100, 20, 3.4, '#E8B830', 'stroke="#B8861B"') + circ(131, 30, 3.2, '#E8B830', 'stroke="#B8861B"') +
          circ(100, 45, 3.6, '#D2404A') + circ(83, 52, 2.6, '#3E7BD6') + circ(117, 52, 2.6, '#3E7BD6');
      default: return '';
    }
  }

  /* --------------------------------------------------------------- render */

  // view: 'full' | 'head' | 'bust' or a custom viewBox string.
  const VIEWS = { full: '0 0 200 412', head: '32 16 136 136', bust: '20 10 160 160', tile: '30 6 140 140' };

  function render(cfg, { view = 'full', title = '', cls = '' } = {}) {
    const c = normalize(cfg);
    const b = body(c), h = hair(c);
    const slippers = c.shoes === 'bunny' || c.shoes === 'monster';
    const vb = VIEWS[view] || view;
    const parts = [
      h.back,
      b.arms, b.neck, b.torso, b.legs,
      slippers ? '' : shoes(c),
      bottom(c),
      slippers ? shoes(c) : '',
      top(c), outer(c), b.hands,
      b.ears, b.face, facialHair(c), cheeks(c), eyes(c), brows(c), nose(c), mouth(c),
      h.front, earrings(c), piercing(c), glasses(c), hat(c),
    ];
    return `<svg class="${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title ? title.replace(/"/g, '&quot;') : 'Avatar'}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
  }

  return { render, normalize, random, rewardsAt, levelOf, DEFAULT, STYLES, COLORS, UNLOCKS, VIEWS };
})();
