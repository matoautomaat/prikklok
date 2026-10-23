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
    gray: '#A6AAB1', cream: '#EEE5CE', ruby: '#8E1B24', brown: '#6A4630',
  };
  const BOTTOM_COLORS = {
    grey: '#8D9096', blue: '#6E8CB3', light: '#BCCFE2', indigo: '#3B4A66', black: '#35363B',
    beige: '#D9C7A5', pink: '#F1C4CE', olive: '#6B7A4E', white: '#ECEBE6', maroon: '#6F302C',
  };
  const SHOE_COLORS = { white: '#F5F4F1', black: '#2A2A2E', chestnut: '#A36A3E', beige: '#D8BC93', pink: '#F2C3CE', sky: '#B7D0EA', gray: '#9EA2A8' };

  // [key, Dutch label]
  const STYLES = {
    body: [['female', 'Vrouw'], ['male', 'Man']],
    hair: [['long', 'Lang'], ['bangs', 'Lang met pony'], ['wavy', 'Golvend'], ['longcurly', 'Lange krullen'], ['lob', 'Halflang'],
      ['shag', 'Laagjes'], ['bob', 'Bob'], ['pixie', 'Pixie'], ['halfup', 'Half opgestoken'], ['bun', 'Knot'], ['spacebuns', 'Twee knotjes'],
      ['ponytail', 'Paardenstaart'], ['highpony', 'Hoge staart'], ['pigtails', 'Staartjes'], ['braids', 'Vlechten'], ['sidebraid', 'Zijvlecht'],
      ['locs', 'Dreadlocks'], ['cornrows', 'Cornrows'], ['curly', 'Krullen'], ['afro', 'Afro'], ['short', 'Kort'], ['sidepart', 'Zijscheiding'],
      ['slickback', 'Achterover'], ['quiff', 'Kuif'], ['spiky', 'Stekeltjes'], ['curtains', 'Middenscheiding'], ['curlytop', 'Krullen bovenop'],
      ['mullet', 'Matje'], ['mohawk', 'Hanenkam'], ['fade', 'Fade'], ['manbun', 'Mannenknot'], ['buzz', 'Heel kort'], ['none', 'Kaal']],
    eyes: [['round', 'Rond'], ['almond', 'Amandel'], ['side', 'Opzij'], ['happy', 'Lachend']],
    brows: [['soft', 'Zacht'], ['arched', 'Gebogen'], ['straight', 'Recht']],
    mouth: [['smile', 'Glimlach'], ['grin', 'Lach'], ['neutral', 'Neutraal'], ['pout', 'Pruillip'], ['smirk', 'Grijns']],
    beard: [['none', 'Geen'], ['stubble', 'Stoppels'], ['mustache', 'Snor'], ['beard', 'Baard']],
    top: [['tee', 'T-shirt'], ['vneck', 'V-hals'], ['tank', 'Topje'], ['longsleeve', 'Lange mouw'], ['shirt', 'Hemd'], ['sweater', 'Trui'],
      ['hoodie', 'Hoodie'], ['chef', 'Koksvest'], ['garden', "Chen's Garden-shirt"], ['clown', 'Clownspak']],
    outer: [['none', 'Geen'], ['jacket', 'Jasje'], ['cardigan', 'Vest'], ['puffer', 'Bodywarmer'], ['apron', 'Schort'], ['leather', 'Leren jas']],
    bottom: [['baggy', 'Wijde jeans'], ['straight', 'Rechte jeans'], ['joggers', 'Joggingbroek'], ['skirt', 'Rok'], ['shorts', 'Short']],
    shoes: [['sneakers', 'Sneakers'], ['boots', 'Laarsjes'], ['bunny', 'Konijnensloffen'], ['monster', 'Monstersloffen'],
      ['dragon', 'Drakensloffen'], ['gold', 'Gouden sneakers']],
    hat: [['none', 'Geen'], ['beanie', 'Muts'], ['headband', 'Haarband'], ['hijab', 'Hoofddoek'], ['cap', 'Pet'], ['bandana', 'Bandana'], ['chef', 'Koksmuts'],
      ['crown', 'Kroon'], ['bucket', 'Vissershoedje'], ['clown', 'Clownshoedje']],
    glasses: [['none', 'Geen'], ['round', 'Rond'], ['square', 'Vierkant'], ['sun', 'Zonnebril'], ['heart', 'Hartjesbril']],
    neck: [['none', 'Geen'], ['scarf', 'Sjaal'], ['bowtie', 'Strikje'], ['headphones', 'Koptelefoon'], ['chain', 'Gouden ketting']],
    aura: [['none', 'Geen'], ['gold', 'Gouden gloed']],
    earrings: [['none', 'Geen'], ['studs', 'Knopjes'], ['hoops', 'Ringen'], ['stack', 'Meerdere']],
    piercing: [['none', 'Geen'], ['nose', 'Neus'], ['septum', 'Septum'], ['clownnose', 'Clownsneus']],
  };
  // The same items in Chinese, for staff who use the app in Chinese.
  const ZH = {
    body: { female: '女', male: '男' },
    hair: { long: '长发', bangs: '长发带刘海', wavy: '波浪发', longcurly: '长卷发', lob: '中长发', shag: '层次发', bob: '波波头',
      pixie: '精灵短发', halfup: '半扎发', bun: '丸子头', spacebuns: '双丸子头', ponytail: '马尾', highpony: '高马尾', pigtails: '双马尾',
      braids: '辫子', sidebraid: '侧辫', locs: '脏辫', cornrows: '玉米辫', curly: '卷发', afro: '爆炸头', short: '短发', sidepart: '侧分',
      slickback: '背头', quiff: '飞机头', spiky: '刺猬头', curtains: '中分', curlytop: '顶部卷发', mullet: '鲻鱼头', mohawk: '莫西干',
      fade: '渐变寸头', manbun: '男士发髻', buzz: '寸头', none: '光头' },
    eyes: { round: '圆眼', almond: '杏眼', side: '侧看', happy: '笑眼' },
    brows: { soft: '柔和', arched: '弯眉', straight: '平眉' },
    mouth: { smile: '微笑', grin: '大笑', neutral: '平静', pout: '嘟嘴', smirk: '坏笑' },
    beard: { none: '无', stubble: '胡茬', mustache: '小胡子', beard: '络腮胡' },
    top: { tee: 'T恤', vneck: 'V领', tank: '背心', longsleeve: '长袖', shirt: '衬衫', sweater: '毛衣', hoodie: '连帽衫', chef: '厨师服',
      garden: "Chen's Garden 衫", clown: '小丑服' },
    outer: { none: '无', jacket: '夹克', cardigan: '开衫', puffer: '羽绒背心', apron: '围裙', leather: '皮夹克' },
    bottom: { baggy: '阔腿牛仔裤', straight: '直筒牛仔裤', joggers: '运动裤', skirt: '裙子', shorts: '短裤' },
    shoes: { sneakers: '运动鞋', boots: '短靴', bunny: '兔子拖鞋', monster: '怪兽拖鞋', dragon: '龙拖鞋', gold: '金色运动鞋' },
    hat: { none: '无', beanie: '毛线帽', headband: '发带', hijab: '头巾', cap: '棒球帽', bandana: '方巾', chef: '厨师帽', crown: '皇冠', bucket: '渔夫帽', clown: '小丑帽' },
    glasses: { none: '无', round: '圆框', square: '方框', sun: '墨镜', heart: '爱心眼镜' },
    neck: { none: '无', scarf: '围巾', bowtie: '领结', headphones: '耳机', chain: '金项链' },
    aura: { none: '无', gold: '金光' },
    earrings: { none: '无', studs: '耳钉', hoops: '耳环', stack: '多个耳饰' },
    piercing: { none: '无', nose: '鼻环', septum: '中隔环', clownnose: '小丑鼻子' },
  };
  // An item's name: label('top', 'clown', 'zh') -> '小丑服'.
  const label = (key, value, lang = 'nl') => {
    const nl = ((STYLES[key] || []).find(s => s[0] === value) || [])[1];
    return lang === 'zh' ? (ZH[key] || {})[value] || nl : nl;
  };
  const FANCY_HAIR = { nl: 'Fantasiekleuren voor je haar', zh: '彩色头发' };
  const COLORS = {
    skin: SKIN, hairColor: HAIR_COLORS, eyeColor: EYE_COLORS, topColor: CLOTH, outerColor: CLOTH,
    bottomColor: BOTTOM_COLORS, shoeColor: SHOE_COLORS, hatColor: CLOTH, neckColor: CLOTH,
  };
  // Items that unlock at a level. Same list as the database.
  const UNLOCKS = {
    hat: { cap: 2, bandana: 5, chef: 8, crown: 10, bucket: 14 }, shoes: { bunny: 3, monster: 7, dragon: 18, gold: 19 },
    outer: { puffer: 4, apron: 13, leather: 17 }, glasses: { sun: 6, heart: 16 }, top: { chef: 8, garden: 15 },
    hairColor: { pink: 9, blue: 9, lilac: 9 }, neck: { headphones: 11, chain: 12 }, aura: { gold: 20 },
  };
  const DEFAULT = {
    body: 'female', neck: 'none', neckColor: 'ruby', aura: 'none',
    skin: 's3', hair: 'long', hairColor: 'brown', eyes: 'round', eyeColor: 'brown', brows: 'soft', mouth: 'smile',
    beard: 'none', freckles: false, blush: true, top: 'tee', topColor: 'white', outer: 'none', outerColor: 'cream',
    bottom: 'baggy', bottomColor: 'grey', shoes: 'sneakers', shoeColor: 'white', hat: 'none', hatColor: 'white',
    glasses: 'none', earrings: 'none', piercing: 'none',
  };

  const levelOf = (key, value) => (UNLOCKS[key] || {})[value] || 1;
  // What unlocks at each level, for the profile and the level-up message.
  function rewardsAt(level, lang = 'nl') {
    const out = [];
    for (const [key, items] of Object.entries(UNLOCKS)) {
      for (const [value, lvl] of Object.entries(items)) {
        if (lvl !== level) continue;
        const name = key === 'hairColor' ? FANCY_HAIR[lang] || FANCY_HAIR.nl : label(key, value, lang);
        if (name && !out.includes(name)) out.push(name);
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
    if (Math.random() < 0.7) c.neck = 'none';
    c.aura = 'none';
    if (c.top === 'chef' || c.top === 'clown') c.top = 'tee';
    if (c.hat === 'clown') c.hat = 'none';
    if (c.piercing === 'clownnose') c.piercing = 'none';
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
  // a wider jaw and flatter chin for the male figure
  const FACE_M = 'M 58 94 C 58 60 76 42 100 42 C 124 42 142 60 142 94 C 142 116 138 134 124 145 Q 112 153 100 153 Q 88 153 76 145 C 62 134 58 116 58 94 Z';

  function body(c) {
    const skin = SKIN[c.skin], sd = dark(skin, 0.14), male = c.body === 'male';
    return {
      arms: both(ARM).map(d => shape(d, skin)).join(''),
      hands: [ell(54, 288, 8.5, 11, skin, OL), ell(146, 288, 8.5, 11, skin, OL)].join(''),
      neck: shape(NECK, skin) + path('M 89 144 Q 100 158 111 144 L 111 152 Q 100 164 89 152 Z', sd, 'opacity=".55"'),
      torso: shape(TORSO, skin) + line('M 82 178 Q 90 182 96 180', sd, 1.2, 0.6) + line('M 118 178 Q 110 182 104 180', sd, 1.2, 0.6),
      legs: both(LEG).map(d => shape(d, skin)).join(''),
      ears: [ell(58, 104, 7, 11, skin, OL), ell(142, 104, 7, 11, skin, OL), ell(58.5, 105, 3, 6, sd, 'opacity=".5"'), ell(141.5, 105, 3, 6, sd, 'opacity=".5"')].join(''),
      face: shape(male ? FACE_M : FACE, skin) + (male
        ? path('M 62 112 C 64 132 72 142 80 146 Q 100 154 120 146 C 128 142 136 132 138 112 C 134 134 124 145 100 150 C 76 145 66 134 62 112 Z', sd, 'opacity=".35"')
        : path('M 62 112 C 66 136 82 150 100 152 C 118 150 134 136 138 112 C 132 140 116 149 100 149 C 84 149 68 140 62 112 Z', sd, 'opacity=".35"')),
    };
  }

  /* ---- face ---- */

  function eyes(c) {
    const iris = EYE_COLORS[c.eyeColor], skin = SKIN[c.skin], lash = '#1B1310', lid = dark(skin, 0.3), male = c.body === 'male';
    // s = -1 for the eye on the viewer's left, whose outer corner is on the left
    const one = (cx, s) => {
      const ox = cx + s * 11, ix = cx - s * 10.5, at = f => (ix + (ox - ix) * f).toFixed(1);
      // the male figure has a thinner line and no flick at the corner
      const lashes = (yIn, yOut, top) => line(`M ${ix} ${yIn} C ${at(0.3)} ${top} ${at(0.75)} ${top - 0.5} ${ox} ${yOut}`, lash, male ? 2 : 2.6) +
        (male ? '' : line(`M ${ox} ${yOut} L ${ox + s * 3.5} ${yOut - 3}`, lash, 1.9));
      const lower = y => line(`M ${cx - 8} ${y} Q ${cx} ${y + 3.3} ${cx + 8} ${y}`, lid, 1, 0.55);
      const ball = (x, y, r) => circ(x, y, r, iris) + circ(x, y, r * 0.52, '#160F0B') + circ(x - r * 0.35, y - r * 0.35, r * 0.28, '#FFFFFF');
      switch (c.eyes) {
        case 'happy':
          return line(`M ${cx - 9} 102 Q ${cx} 93 ${cx + 9} 102`, lash, male ? 2.2 : 2.6) + (male ? '' : line(`M ${ox - s * 1.5} 100 L ${ox + s * 2} 97`, lash, 1.8));
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
    const male = c.body === 'male';
    const d = c.brows === 'arched' ? 'M 69 88 Q 77 78 92 84' : c.brows === 'straight' ? 'M 70 85.5 Q 80 82.5 92 84.5' : male ? 'M 69 86.5 Q 80 81.5 93 84' : 'M 70 87 Q 79 81 92 84';
    return line(d, col, male ? 4.4 : 3.4) + line(mirror(d), col, male ? 4.4 : 3.4);
  }

  function mouth(c) {
    const skin = SKIN[c.skin], lip = mix(skin, '#C45A5E', c.body === 'male' ? 0.24 : 0.42), lipDark = dark(lip, 0.25);
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
    const covered = ['beanie', 'bucket', 'chef'].includes(c.hat); // these hats hide a bun
    if (c.hat === 'hijab') return { back: '', front: '' }; // the headscarf covers all hair
    const side = 'M 56 94 L 62 94 L 61 110 L 57 110 Z'; // short sideburn
    const sideburns = shape(side, hc) + shape(mirror(side), hc);
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
          (covered ? '' : circ(100, 24, 17, hc, OL) + line('M 90 20 Q 100 12 110 22 Q 104 32 94 28', hd, 1.3, 0.6));
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
      case 'pixie':
        back = shape('M 100 30 C 70 30 52 50 52 94 C 52 106 54 114 58 120 L 142 120 C 146 114 148 106 148 94 C 148 50 130 30 100 30 Z', hd);
        front = shape('M 54 104 C 48 56 74 30 102 30 C 130 30 152 54 146 100 C 145 88 142 78 136 72 C 124 76 100 78 80 72 C 70 70 62 66 60 74 C 57 82 55 92 54 104 Z', hc) +
          shape('M 60 82 C 66 58 96 46 130 56 C 140 60 142 68 138 74 C 116 66 92 70 70 88 C 66 92 62 90 60 80 Z', hc) +
          strand('M 70 80 C 86 66 108 62 132 66') + strand('M 76 64 C 92 54 112 52 128 58') + shine;
        break;
      case 'afro': {
        let cloud = '';
        for (let a = 140; a <= 400; a += 15) {
          const t = a * Math.PI / 180, x = 100 + Math.cos(t) * 56, y = 76 + Math.sin(t) * 54;
          if (y > 126) continue;
          cloud += circ(x.toFixed(1), y.toFixed(1), 17, hc, OL);
        }
        back = cloud + circ(100, 74, 56, hc);
        let tex = '';
        for (const [x, y] of [[70, 40], [90, 28], [112, 30], [132, 42], [60, 64], [146, 66], [80, 52], [120, 50], [100, 44]]) tex += line(`M ${x - 4} ${y} Q ${x} ${y - 4} ${x + 4} ${y}`, hd, 1.1, 0.5);
        front = shape('M 58 100 C 56 70 76 56 100 56 C 124 56 144 70 142 100 C 138 82 124 70 100 70 C 76 70 62 82 58 100 Z', hc) + tex;
        break;
      }
      case 'spacebuns':
        back = shape('M 100 34 C 72 34 54 52 54 96 L 146 96 C 146 52 128 34 100 34 Z', hd) + (covered ? '' :
          circ(70, 34, 15, hc, OL) + circ(130, 34, 15, hc, OL) +
          line('M 62 32 Q 70 24 78 34 Q 72 42 66 38', hd, 1.2, 0.6) + line('M 122 32 Q 130 24 138 34 Q 132 42 126 38', hd, 1.2, 0.6));
        front = shape(capSlick, hc) + strand('M 100 37 L 100 58') + strand('M 96 40 C 84 44 70 54 62 76') + strand(mirror('M 96 40 C 84 44 70 54 62 76')) + shine;
        break;
      case 'pigtails': {
        back = shape('M 100 32 C 70 32 52 52 52 96 L 148 96 C 148 52 130 32 100 32 Z', hd);
        const tail = 'M 58 100 C 40 108 34 140 38 176 C 41 200 50 218 60 222 C 66 204 64 170 66 132 C 67 118 64 106 58 100 Z';
        front = both(tail).map(d => shape(d, hc)).join('') +
          strand('M 52 120 C 46 150 48 182 56 208') + strand(mirror('M 52 120 C 46 150 48 182 56 208')) +
          ell(59, 104, 5, 6.5, dark(hc, 0.45)) + ell(141, 104, 5, 6.5, dark(hc, 0.45)) + shape(capPart, hc) + capLines + shine;
        break;
      }
      case 'locs': {
        back = shape('M 100 30 C 70 30 50 50 50 92 L 48 160 C 47 200 50 240 54 262 L 146 262 C 150 240 153 200 152 160 L 150 92 C 150 50 130 30 100 30 Z', hd);
        let locs = '';
        for (const [x, top, end] of [[56, 96, 236], [62, 92, 252], [68, 100, 244], [75, 108, 226]]) {
          for (const sx of [x, 200 - x]) {
            const d = `M ${sx} ${top} C ${sx - 3} ${top + 50} ${sx + 3} ${top + 100} ${sx + 1} ${end}`;
            locs += line(d, dark(hc, 0.35), 8.6) + line(d, hc, 6.6);
            for (let y = top + 16; y < end - 6; y += 16) locs += line(`M ${sx - 2.6} ${y} L ${sx + 2.6} ${y + 2}`, hd, 1, 0.55);
          }
        }
        front = locs + shape(capPart, hc) + capLines + shine;
        break;
      }
      case 'longcurly': {
        back = shape('M 100 28 C 66 28 44 50 44 92 C 38 120 50 140 44 165 C 36 192 50 212 46 238 C 44 252 52 266 60 268 L 140 268 C 148 266 156 252 154 238 C 150 212 164 192 156 165 C 150 140 162 120 156 92 C 156 50 134 28 100 28 Z', hd);
        const s = 'M 54 96 C 48 120 58 136 54 156 C 50 176 62 190 58 210 C 54 230 66 242 70 260 C 76 252 82 244 80 232 C 80 214 72 202 74 186 C 76 168 66 154 68 136 C 70 118 62 100 58 88 Z';
        let curls = '';
        for (const [x, y] of [[50, 132], [54, 166], [50, 196], [58, 226], [64, 254], [46, 108]]) curls += circ(x, y, 7.5, hc, OL) + circ(200 - x, y, 7.5, hc, OL);
        front = both(s).map(d => shape(d, hc)).join('') + curls + shape(capPart, hc) + capLines + shine +
          strand('M 62 130 C 58 150 66 170 64 190 C 62 212 70 228 72 246') + strand(mirror('M 62 130 C 58 150 66 170 64 190 C 62 212 70 228 72 246'));
        break;
      }
      case 'sidepart':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 56 100 C 50 54 74 28 104 28 C 132 28 150 50 145 98 C 142 80 132 66 114 60 C 100 56 86 58 76 64 L 74 52 C 66 62 60 78 56 100 Z', hc) +
          shape('M 56 94 L 62 94 L 61 110 L 57 110 Z', hc) + shape(mirror('M 56 94 L 62 94 L 61 110 L 57 110 Z'), hc) +
          strand('M 75 52 L 79 32') + strand('M 80 44 Q 110 34 138 54') + strand('M 80 52 Q 108 44 140 66') + shine;
        break;
      case 'quiff':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 56 100 C 52 70 56 52 66 44 C 72 24 96 12 120 18 C 140 24 150 44 146 98 C 143 86 140 76 134 70 C 118 64 92 64 72 70 C 64 76 58 86 56 100 Z', hc) +
          shape('M 56 94 L 62 94 L 61 110 L 57 110 Z', hc) + shape(mirror('M 56 94 L 62 94 L 61 110 L 57 110 Z'), hc) +
          strand('M 72 50 Q 94 22 124 26') + strand('M 78 60 Q 100 36 132 40') + strand('M 90 64 Q 108 48 136 54') + line('M 82 30 Q 98 18 116 20', hl, 3, 0.35);
        break;
      case 'curtains':
        back = shape('M 100 30 C 70 30 52 50 52 94 L 56 124 L 144 124 L 148 94 C 148 50 130 30 100 30 Z', hd);
        front = shape('M 54 104 C 48 56 74 30 100 30 C 126 30 152 56 146 104 C 144 92 140 82 132 76 C 122 70 110 72 103 84 L 100 62 L 97 84 C 90 72 78 70 68 76 C 60 82 56 92 54 104 Z', hc) +
          strand('M 98 64 C 90 56 76 56 64 70') + strand(mirror('M 98 64 C 90 56 76 56 64 70')) + strand('M 100 34 L 100 60') + shine;
        break;
      case 'fade':
        back = path('M 100 32 C 72 32 54 50 54 92 L 146 92 C 146 50 128 32 100 32 Z', hd, 'opacity=".7"');
        front = shape('M 60 86 C 58 50 78 32 100 32 C 122 32 142 50 140 86 C 138 76 132 68 124 64 C 112 60 88 60 76 64 C 68 68 62 76 60 86 Z', hc) +
          path('M 57 88 C 57 78 59 72 64 68 L 64 104 L 58 106 Z', hc, 'opacity=".38"') + path(mirror('M 57 88 C 57 78 59 72 64 68 L 64 104 L 58 106 Z'), hc, 'opacity=".38"') +
          strand('M 76 50 L 82 40') + strand('M 92 44 L 96 34') + strand('M 108 44 L 112 34') + strand('M 122 50 L 126 42') + shine;
        break;
      case 'manbun':
        back = shape('M 100 34 C 72 34 54 52 54 96 L 146 96 C 146 52 128 34 100 34 Z', hd) + (covered ? '' :
          circ(100, 26, 11.5, hc, OL) + line('M 93 24 Q 100 18 107 26', hd, 1.2, 0.6) + path('M 92 33 L 108 33 L 107 37 L 93 37 Z', dark(hc, 0.4)));
        front = shape(capSlick, hc) + strand('M 100 37 C 84 40 70 50 62 76') + strand(mirror('M 100 37 C 84 40 70 50 62 76')) +
          shape('M 56 94 L 61 94 L 60.5 108 L 57 108 Z', hc) + shape(mirror('M 56 94 L 61 94 L 60.5 108 L 57 108 Z'), hc) + shine;
        break;
      case 'bangs': {
        back = shape('M 100 30 C 70 30 50 50 50 92 L 48 160 C 47 200 50 240 54 262 L 146 262 C 150 240 153 200 152 160 L 150 92 C 150 50 130 30 100 30 Z', hd);
        const s = 'M 54 96 C 50 130 54 170 60 205 C 64 230 66 245 70 260 C 74 252 78 243 80 232 C 76 200 70 160 66 124 C 64 108 62 96 58 88 Z';
        front = both(s).map(d => shape(d, hc)).join('') +
          shape('M 52 112 C 46 60 72 32 100 32 C 128 32 154 60 148 112 C 146 96 144 86 140 76 Q 121 81 100 77 Q 79 81 60 76 C 56 86 54 96 52 112 Z', hc) +
          strand('M 76 78 L 74 60') + strand('M 90 79 L 89 56') + strand('M 110 79 L 111 56') + strand('M 124 78 L 126 60') +
          strand('M 60 120 C 62 170 66 210 72 248') + strand(mirror('M 60 120 C 62 170 66 210 72 248')) + shine;
        break;
      }
      case 'lob': {
        back = shape('M 100 30 C 70 30 50 50 50 92 L 50 168 Q 52 186 60 190 L 140 190 Q 148 186 150 168 L 150 92 C 150 50 130 30 100 30 Z', hd);
        const s = 'M 54 96 C 50 124 52 160 58 186 Q 66 194 78 188 C 72 160 66 126 64 106 C 63 98 60 92 58 88 Z';
        front = both(s).map(d => shape(d, hc)).join('') + shape(capPart, hc) + capLines + shine +
          strand('M 60 118 C 60 146 62 168 68 184') + strand(mirror('M 60 118 C 60 146 62 168 68 184'));
        break;
      }
      case 'shag': {
        back = shape('M 100 28 C 68 28 48 50 48 94 C 46 120 50 140 46 160 L 56 168 L 60 160 L 70 172 L 130 172 L 140 160 L 144 168 L 154 160 C 150 140 154 120 152 94 C 152 50 132 28 100 28 Z', hd);
        const s = 'M 54 96 C 48 118 52 140 48 160 L 58 154 L 56 172 L 68 160 L 70 174 C 70 150 64 120 62 100 Z';
        front = both(s).map(d => shape(d, hc)).join('') +
          shape('M 52 108 C 46 58 72 30 100 30 C 128 30 154 58 148 108 C 146 94 142 84 134 78 C 124 72 112 72 104 86 L 100 64 L 96 86 C 88 72 76 72 66 78 C 58 84 54 94 52 108 Z', hc) +
          strand('M 98 66 C 90 56 76 58 66 72') + strand(mirror('M 98 66 C 90 56 76 58 66 72')) + strand('M 58 120 L 56 150') + strand(mirror('M 58 120 L 56 150')) + shine;
        break;
      }
      case 'halfup': {
        back = shape('M 100 30 C 70 30 50 50 50 92 L 48 160 C 47 200 50 240 54 262 L 146 262 C 150 240 153 200 152 160 L 150 92 C 150 50 130 30 100 30 Z', hd) +
          (covered ? '' : circ(100, 28, 10, hc, OL) + line('M 93 26 Q 100 20 107 28', hd, 1.2, 0.6));
        const s = 'M 54 96 C 50 130 54 170 60 205 C 64 230 66 245 70 260 C 74 252 78 243 80 232 C 76 200 70 160 66 124 C 64 108 62 96 58 88 Z';
        front = both(s).map(d => shape(d, hc)).join('') + shape(capSlick, hc) +
          strand('M 100 37 C 84 40 70 50 62 76') + strand(mirror('M 100 37 C 84 40 70 50 62 76')) + strand('M 60 120 C 62 170 66 210 72 248') + shine;
        break;
      }
      case 'sidebraid': {
        back = shape('M 100 30 C 68 30 50 52 50 96 L 52 128 L 148 128 L 150 96 C 150 52 132 30 100 30 Z', hd);
        let braid = '';
        // over the shoulder and down the front
        for (let i = 0; i < 9; i++) {
          const x = (63 + i * 3.1 - (i % 2) * 2).toFixed(1), y = 112 + i * 15;
          braid += ell(x, y, 8.5, 10, hc, OL) + line(`M ${x - 6} ${y - 2} Q ${x} ${y + 4} ${+x + 6} ${y - 2}`, hd, 1.1, 0.5);
        }
        braid += ell(89, 243, 4, 3, dark(hc, 0.45)) + path('M 85 245 L 93 245 L 92 258 L 86 258 Z', hc, OL);
        front = shape('M 56 98 C 60 104 64 108 70 106 C 66 100 62 94 60 90 Z', hc) + braid + shape(capPart, hc) + capLines + shine;
        break;
      }
      case 'highpony':
        back = shape('M 100 34 C 72 34 54 52 54 96 L 146 96 C 146 52 128 34 100 34 Z', hd) +
          shape('M 94 30 C 106 6 140 8 152 34 C 162 62 160 112 154 152 C 146 122 144 82 136 58 C 128 42 114 36 104 38 Z', hc) +
          line('M 146 50 C 152 80 150 112 152 140', hd, 1.2, 0.45) + ell(100, 30, 6, 4.5, dark(hc, 0.4));
        front = shape(capSlick, hc) + strand('M 100 37 C 84 40 70 50 62 76') + strand(mirror('M 100 37 C 84 40 70 50 62 76')) + shine;
        break;
      case 'cornrows': {
        front = shape('M 58 96 C 54 56 76 36 100 36 C 124 36 146 56 142 96 C 140 80 132 66 100 62 C 68 66 60 80 58 96 Z', hc);
        for (const x of [72, 84, 100, 116, 128]) {
          const top = x === 100 ? 38 : x < 100 ? 40 + (100 - x) * 0.12 : 40 + (x - 100) * 0.12;
          front += line(`M ${x} 64 Q ${x + (x - 100) * 0.12} 52 ${x + (x - 100) * 0.05} ${top}`, hd, 3.2, 0.75) +
            `<path d="M ${x} 64 Q ${x + (x - 100) * 0.12} 52 ${x + (x - 100) * 0.05} ${top}" fill="none" stroke="${hl}" stroke-width="1.1" stroke-dasharray="2 2.4" opacity=".5"/>`;
        }
        back = shape('M 100 36 C 72 36 56 54 56 92 L 144 92 C 144 54 128 36 100 36 Z', hd);
        break;
      }
      case 'slickback':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 58 96 C 54 56 76 30 100 30 C 124 30 146 56 142 96 C 140 80 132 68 122 62 C 110 56 90 56 78 62 C 68 68 60 80 58 96 Z', hc) + sideburns +
          strand('M 82 60 Q 84 44 92 34') + strand('M 96 58 Q 98 42 104 32') + strand('M 112 58 Q 114 44 120 36') + strand('M 72 66 Q 72 52 78 42') + shine;
        break;
      case 'spiky':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 56 98 C 52 70 58 52 66 44 L 64 30 L 76 38 L 80 22 L 90 34 L 98 18 L 106 32 L 116 20 L 120 36 L 134 28 L 134 44 C 142 52 148 70 144 98 C 142 84 138 74 130 68 C 116 62 86 62 72 68 C 64 74 58 86 56 98 Z', hc) + sideburns +
          strand('M 80 50 L 82 36') + strand('M 98 48 L 98 30') + strand('M 116 50 L 116 34');
        break;
      case 'mohawk':
        front = path('M 58 96 C 54 56 76 38 100 38 C 124 38 146 56 142 96 C 140 80 132 66 100 62 C 68 66 60 80 58 96 Z', hc, 'opacity=".32"') +
          shape('M 88 64 C 84 42 88 20 94 8 L 100 2 L 106 8 C 112 20 116 42 112 64 Z', hc) +
          strand('M 96 56 L 97 14') + strand('M 104 56 L 103 14') + line('M 92 40 Q 94 20 100 8', hl, 2.4, 0.35);
        break;
      case 'curlytop': {
        front = path('M 58 96 C 56 70 66 56 76 52 L 124 52 C 134 56 144 70 142 96 C 140 82 132 70 120 66 L 80 66 C 68 70 60 82 58 96 Z', hc, 'opacity=".45"');
        for (const [x, y, r] of [[72, 52, 10], [84, 42, 11], [100, 38, 12], [116, 42, 11], [128, 52, 10], [78, 62, 8], [92, 56, 9], [108, 56, 9], [122, 62, 8], [100, 28, 9], [86, 30, 8], [114, 30, 8]]) {
          front += circ(x, y, r, hc, OL) + line(`M ${x - 4} ${y} Q ${x} ${y - 4} ${x + 4} ${y}`, hd, 1, 0.5);
        }
        break;
      }
      case 'mullet':
        back = shape('M 100 30 C 72 30 54 50 54 92 L 54 150 Q 62 174 78 178 L 122 178 Q 138 174 146 150 L 146 92 C 146 50 128 30 100 30 Z', hd);
        front = shape('M 56 100 C 50 52 76 29 102 29 C 128 29 150 50 145 100 C 143 88 141 78 136 70 C 126 62 112 64 98 59 C 86 66 70 64 62 74 C 59 82 57 92 56 100 Z', hc) +
          shape('M 56 96 C 52 122 54 144 60 160 L 66 156 C 62 140 61 120 62 102 Z', hc) + shape(mirror('M 56 96 C 52 122 54 144 60 160 L 66 156 C 62 140 61 120 62 102 Z'), hc) +
          strand('M 70 58 L 78 46') + strand('M 84 52 L 92 40') + strand('M 104 52 L 112 40') + strand('M 120 56 L 128 46') + shine;
        break;
      default:
        front = line('M 74 54 Q 86 46 98 46', '#FFFFFF', 3, 0.25);
    }
    return { back, front };
  }

  /* ---- clothes ---- */

  // A small Chinese knot with a tassel, like the ones on the Chen's Garden logo.
  function knot(x, y, s, color) {
    const k = n => (n * s).toFixed(2);
    return `<g transform="translate(${x} ${y})" fill="none" stroke="${color}" stroke-width="${k(1.1)}" stroke-linecap="round">` +
      `<path d="M 0 ${k(-5)} L ${k(5)} 0 L 0 ${k(5)} L ${k(-5)} 0 Z M ${k(-2.5)} ${k(-2.5)} L ${k(2.5)} ${k(2.5)} M ${k(2.5)} ${k(-2.5)} L ${k(-2.5)} ${k(2.5)}"/>` +
      `<circle cx="${k(-5.6)}" cy="${k(-1.8)}" r="${k(1.6)}"/><circle cx="${k(5.6)}" cy="${k(-1.8)}" r="${k(1.6)}"/>` +
      `<circle cx="${k(-5.6)}" cy="${k(1.8)}" r="${k(1.6)}"/><circle cx="${k(5.6)}" cy="${k(1.8)}" r="${k(1.6)}"/>` +
      `<path d="M 0 ${k(-5)} L 0 ${k(-7.5)} M 0 ${k(5)} L 0 ${k(7)} M ${k(-1)} ${k(7.5)} L ${k(-1)} ${k(12)} M 0 ${k(7.5)} L 0 ${k(12.5)} M ${k(1)} ${k(7.5)} L ${k(1)} ${k(12)}"/></g>`;
  }

  const SLEEVE_SHORT = 'M 59 171 C 49 175 44 190 43 212 L 70 217 C 71 200 71 186 68 175 Z';
  const SLEEVE_LONG = 'M 59 171 C 49 175 44 190 43 212 L 40 274 Q 40 282 48 282 L 62 282 Q 68 282 68 274 L 72 216 C 72 200 72 186 68 175 Z';
  const BODY_CREW = 'M 60 180 Q 62 168 82 164 Q 100 172 118 164 Q 138 168 140 180 L 143 272 Q 100 278 57 272 Z';

  // A clown suit: red and yellow halves (the sleeves the other way round), big
  // dots, a white ruffled collar and cuffs, and pompoms down the middle.
  const CLOWN_RED = '#D9363E', CLOWN_YELLOW = '#F2C230';
  const CLOWN_HALF = 'M 60 180 Q 62 168 82 164 Q 91 168 100 168 L 100 275 Q 78.5 275 57 272 Z';
  function clownSuit(fold, hem) {
    const ruffle = (pts, r) => pts.map(([x, y]) => circ(x, y, r, '#FFFFFF', OL)).join('');
    const collar = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8, u = 1 - t;
      collar.push([u * u * 68 + 2 * u * t * 100 + t * t * 132, u * u * 161 + 2 * u * t * 190 + t * t * 161]);
    }
    const cuff = [[42, 277], [48, 278.5], [54, 279], [60, 278.5], [66, 277]];
    const dots = (list, fill) => list.map(([x, y, r]) => circ(x, y, r, fill, 'opacity=".95"')).join('');
    return both(SLEEVE_LONG).map((d, i) => shape(d, i ? CLOWN_RED : CLOWN_YELLOW)).join('') +
      shape(CLOWN_HALF, CLOWN_RED) + shape(mirror(CLOWN_HALF), CLOWN_YELLOW) +
      dots([[74, 196, 5], [86, 224, 4.5], [70, 248, 5.5], [90, 262, 3.5]], CLOWN_YELLOW) +
      dots([[126, 200, 5], [114, 230, 4.5], [130, 252, 5], [112, 262, 3.5]], CLOWN_RED) +
      dots([[52, 236, 3.5], [58, 260, 3]], CLOWN_RED) + dots([[148, 236, 3.5], [142, 260, 3]], CLOWN_YELLOW) +
      ruffle(cuff, 3.6) + ruffle(cuff.map(([x, y]) => [200 - x, y]), 3.6) +
      ruffle(collar, 6.5) +
      [[100, 205, '#3B6FD8'], [100, 228, '#3FA34D'], [100, 251, '#8E5BD8']].map(([x, y, f]) => circ(x, y, 5, f, OL) + circ(x - 1.5, y - 1.6, 1.5, '#FFFFFF', 'opacity=".55"')).join('') +
      fold + hem;
  }

  function top(c) {
    const col = c.top === 'chef' ? CLOTH.white : c.top === 'garden' ? '#7A1620' : CLOTH[c.topColor], cd = dark(col, 0.12), cl = light(col, 0.12);
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
      case 'shirt':
        return sleeves('long') + shape(BODY_CREW, col) +
          both('M 84 161 L 99 176 L 92 184 L 79 168 Z').map(d => shape(d, light(col, 0.08))).join('') +
          line('M 100 176 L 100 270', cd, 1.3, 0.8) + [192, 212, 232, 252].map(y => circ(100, y, 1.6, dark(col, 0.3))).join('') +
          path('M 112 196 L 128 196 L 128 210 L 112 210 Z', 'none', `stroke="${cd}" stroke-width="1.2"`) + fold + hem;
      case 'garden':
        return sleeves('short') + shape(BODY_CREW, col) + line('M 84 165.5 Q 100 174 116 165.5', '#F3ECDE', 2.2, 0.9) +
          knot(119, 198, 1.25, '#F3ECDE') + line('M 44 209 L 70 213.5', '#F3ECDE', 1.6, 0.8) + line(mirror('M 44 209 L 70 213.5'), '#F3ECDE', 1.6, 0.8) + fold + hem;
      case 'chef':
        return sleeves('long') + shape(BODY_CREW, col) +
          path('M 84 162 Q 100 170 116 162 L 116 170 Q 100 178 84 170 Z', '#FFFFFF', OL) +
          line('M 84 170 Q 108 186 112 210 L 112 270', '#C9C9C9', 1.4) +
          [190, 212, 234, 256].map(y => circ(90, y, 2.2, '#D0D0D0', OL) + circ(118, y, 2.2, '#D0D0D0', OL)).join('') + fold + hem;
      case 'clown':
        return clownSuit(fold, line('M 58 266 Q 100 272 142 266', '#7A2A10', 1.2, 0.35));
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
    if (c.outer === 'apron') {
      const ink = luma(col) > 0.55 ? dark(col, 0.45) : '#F3ECDE';
      return both('M 85 163 L 80 198').map(d => line(d, cd, 3)).join('') +
        shape('M 78 196 L 122 196 L 123 236 Q 138 238 140 248 L 140 318 Q 100 326 60 318 L 60 248 Q 62 238 77 236 Z', col) +
        line('M 60 246 L 140 246', cd, 2.6, 0.9) + line('M 140 248 L 150 262', cd, 2.4) + line('M 140 248 L 146 268', cd, 2.4) +
        path('M 84 268 L 116 268 L 116 290 L 84 290 Z', 'none', `stroke="${cd}" stroke-width="1.3"`) + knot(100, 214, 1.1, ink);
    }
    const sleeve = 'M 58 170 C 47 175 42 190 41 212 L 38 276 Q 38 284 46 284 L 63 284 Q 69 284 69 276 L 73 216 C 73 200 73 186 69 174 Z';
    const sleeves = both(sleeve).map(d => shape(d, col)).join('') + line('M 39 268 L 69 269', cd, 1.5, 0.8) + line(mirror('M 39 268 L 69 269'), cd, 1.5, 0.8);
    if (c.outer === 'cardigan') {
      const knit = 'M 60 178 Q 62 167 84 162 L 95 206 L 93 278 L 57 278 Q 55 230 60 178 Z';
      return sleeves + both(knit).map(d => shape(d, col)).join('') +
        line('M 84 163 L 95 206 L 93 278', cd, 2.4, 0.7) + line(mirror('M 84 163 L 95 206 L 93 278'), cd, 2.4, 0.7) +
        [216, 234, 252].map(y => circ(90, y, 1.9, dark(col, 0.35))).join('') +
        line('M 58 270 L 93 270', cd, 3, 0.5) + line(mirror('M 58 270 L 93 270'), cd, 3, 0.5) +
        [66, 74, 82].map(x => line(`M ${x} 190 L ${x - 1} 262`, cd, 0.9, 0.35) + line(mirror(`M ${x} 190 L ${x - 1} 262`), cd, 0.9, 0.35)).join('');
    }
    if (c.outer === 'leather') {
      const l = c.outerColor === 'white' || c.outerColor === 'cream' ? CLOTH.black : col, ld = dark(l, 0.25), ll = light(l, 0.22);
      const ls = both(sleeve).map(d => shape(d, l)).join('') + line('M 39 268 L 69 269', ld, 1.5, 0.8) + line(mirror('M 39 268 L 69 269'), ld, 1.5, 0.8);
      return ls + shape('M 60 178 Q 62 167 84 162 L 96 190 L 108 278 L 56 278 Q 54 230 60 178 Z', l) +
        shape(mirror('M 60 178 Q 62 167 84 162 L 92 186 L 94 278 L 56 278 Q 54 230 60 178 Z'), l) +
        shape('M 84 162 L 96 190 L 84 200 L 74 170 Z', ld) + shape(mirror('M 84 162 L 98 184 L 88 196 L 74 170 Z'), ld) +
        line('M 97 192 L 108 276', '#C9CDD3', 1.6) + line('M 66 214 L 84 210', '#C9CDD3', 1.4) + line(mirror('M 68 234 L 84 232'), '#C9CDD3', 1.4) +
        path('M 62 186 Q 66 230 64 276 L 58 276 Q 56 230 60 186 Z', ll, 'opacity=".35"');
    }
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
      case 'dragon': {
        const red = '#C8322E', rd = dark(red, 0.25), gold = '#F2B93B';
        let s = '';
        for (const x of [78, 122]) {
          s += path(`M ${x - 10} 384 L ${x - 14} 372 L ${x - 5} 381 Z`, gold, OL) + path(`M ${x + 10} 384 L ${x + 14} 372 L ${x + 5} 381 Z`, gold, OL) +
            path(`M ${x - 23} 400 Q ${x - 24} 386 ${x - 14} 382 Q ${x} 376 ${x + 14} 382 Q ${x + 24} 386 ${x + 23} 400 Q ${x} 409 ${x - 23} 400 Z`, red, OL) +
            ell(x - 7, 389, 4.6, 3.6, gold, OL) + ell(x + 7, 389, 4.6, 3.6, gold, OL) + ell(x - 7, 389, 1.1, 3, '#151515') + ell(x + 7, 389, 1.1, 3, '#151515') +
            circ(x - 3, 397, 1, rd) + circ(x + 3, 397, 1, rd) +
            path(`M ${x - 12} 401 L ${x - 9} 405 L ${x - 6} 401 L ${x - 3} 405 L ${x} 401 L ${x + 3} 405 L ${x + 6} 401 L ${x + 9} 405 L ${x + 12} 401 Z`, '#FFFFFF');
        }
        return s;
      }
      default: {
        const s = 'M 56 396 Q 56 381 72 380 L 88 380 Q 102 382 102 398 L 102 402 Q 101 408 95 408 L 61 408 Q 56 408 56 403 Z';
        if (c.shoes === 'gold') {
          const g = '#E2B23C';
          return both(s).map(d => shape(d, g)).join('') +
            path('M 56.5 401 L 101.5 401 L 101.5 402 Q 101 408 95 408 L 61 408 Q 56.5 408 56.5 403 Z', '#B8861B') + path(mirror('M 56.5 401 L 101.5 401 L 101.5 402 Q 101 408 95 408 L 61 408 Q 56.5 408 56.5 403 Z'), '#B8861B') +
            line('M 70 387 L 88 387 M 72 391.5 L 90 391.5', '#8A6412', 1.3) + line(mirror('M 70 387 L 88 387 M 72 391.5 L 90 391.5'), '#8A6412', 1.3) +
            line('M 62 390 Q 66 384 74 383', '#FFF6D8', 2, 0.8) + line(mirror('M 62 390 Q 66 384 74 383'), '#FFF6D8', 2, 0.8);
        }
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
    if (c.piercing === 'clownnose') return circ(100, 113.5, 6.6, '#E0262F', OL) + circ(97.6, 111.1, 1.9, '#FFFFFF', 'opacity=".7"');
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
      case 'heart': {
        const heart = x => `M ${x} 111 C ${x - 15} 101 ${x - 13} 87 ${x} 93 C ${x + 13} 87 ${x + 15} 101 ${x} 111 Z`;
        return path(heart(81), '#E8455B', 'stroke="#A9243A" stroke-width="2" opacity=".9"') + path(heart(119), '#E8455B', 'stroke="#A9243A" stroke-width="2" opacity=".9"') +
          line('M 92 96 Q 100 93 108 96', '#A9243A', 2) + line('M 72 96 Q 74 93 78 93', '#FFFFFF', 1.8, 0.6) + line('M 110 96 Q 112 93 116 93', '#FFFFFF', 1.8, 0.6) +
          line('M 68 96 L 59 95', '#A9243A', 2) + line('M 132 96 L 141 95', '#A9243A', 2);
      }
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
      case 'hijab': {
        // the scarf frames the face (an oval hole) and drapes over the shoulders
        const outer = 'M 100 24 C 62 24 44 52 44 94 C 44 132 54 162 64 182 Q 100 206 136 182 C 146 162 156 132 156 94 C 156 52 138 24 100 24 Z';
        const hole = 'M 100 54 C 78 54 64 70 64 96 C 64 124 78 146 100 151 C 122 146 136 124 136 96 C 136 70 122 54 100 54 Z';
        return shape('M 62 176 Q 100 204 138 176 L 150 214 Q 100 240 50 214 Z', col) +
          path(outer + ' ' + hole, col, `${OL} fill-rule="evenodd"`) +
          line('M 64 94 C 64 70 78 56 100 56 C 122 56 136 70 136 94', cd, 2.2, 0.5) +
          line('M 56 150 Q 72 176 100 182', cd, 1.3, 0.45) + line('M 120 168 Q 132 190 128 214', cd, 1.3, 0.45) + line('M 70 40 Q 86 32 100 32', cl, 3, 0.4);
      }
      case 'headband':
        return shape('M 55 76 Q 100 44 145 76 L 146 85 Q 100 54 54 85 Z', col) + line('M 60 78 Q 100 52 140 78', cl, 1.2, 0.6);
      case 'bucket':
        return shape('M 62 66 C 62 36 80 24 100 24 C 120 24 138 36 138 66 Z', col) + path('M 62 58 Q 100 52 138 58 L 138 66 L 62 66 Z', cd) +
          shape('M 42 74 Q 100 56 158 74 L 153 86 Q 100 70 47 86 Z', col) + line('M 48 79 Q 100 63 152 79', cd, 1, 0.6) +
          line('M 80 30 Q 76 44 76 58', cd, 1, 0.4) + line('M 120 30 Q 124 44 124 58', cd, 1, 0.4);
      case 'clown': {
        // a striped party cone with a pompom, a bit askew
        const at = t => [[78 + 26 * t, 60 - 38 * t], [124 - 20 * t, 58 - 36 * t]];
        const band = (a, b) => { const [l1, r1] = at(a), [l2, r2] = at(b); return path(`M ${l1} L ${r1} L ${r2} L ${l2} Z`.replace(/,/g, ' '), CLOWN_YELLOW); };
        return shape('M 78 60 L 104 22 L 124 58 Q 101 66 78 60 Z', '#3B6FD8') + band(0.28, 0.42) + band(0.62, 0.74) +
          [80, 88, 96, 104, 112, 120].map((x, i) => circ(x, 61.5 - (i % 2), 4.2, '#FFFFFF', OL)).join('') +
          circ(104, 22, 5.5, CLOWN_RED, OL) + circ(102.3, 20.3, 1.6, '#FFFFFF', 'opacity=".6"');
      }
      case 'crown':
        return path('M 66 62 L 69 30 L 84 46 L 100 20 L 116 46 L 131 30 L 134 62 Q 100 56 66 62 Z', '#E8B830', 'stroke="#B8861B" stroke-width="1.4" stroke-linejoin="round"') +
          path('M 67 56 Q 100 50 133 56 L 134 62 Q 100 56 66 62 Z', '#C9971F') +
          circ(69, 30, 3.2, '#E8B830', 'stroke="#B8861B"') + circ(100, 20, 3.4, '#E8B830', 'stroke="#B8861B"') + circ(131, 30, 3.2, '#E8B830', 'stroke="#B8861B"') +
          circ(100, 45, 3.6, '#D2404A') + circ(83, 52, 2.6, '#3E7BD6') + circ(117, 52, 2.6, '#3E7BD6');
      default: return '';
    }
  }

  function neck(c) {
    const col = CLOTH[c.neckColor], cd = dark(col, 0.18);
    switch (c.neck) {
      case 'scarf':
        return shape('M 77 157 Q 100 178 123 157 L 127 171 Q 100 195 73 171 Z', col) +
          shape('M 105 178 L 117 238 L 104 240 L 97 184 Z', col) + line('M 104 240 L 103 246 M 108 239.5 L 108 246 M 112 239 L 113 245', cd, 1.3) +
          line('M 80 166 Q 100 184 120 166', cd, 1.2, 0.5) + line('M 108 200 L 113 199 M 110 214 L 115 213', cd, 1.2, 0.6);
      case 'bowtie':
        return shape('M 100 172 L 86 164 L 86 180 Z', col) + shape(mirror('M 100 172 L 86 164 L 86 180 Z'), col) +
          path('M 96 167 L 104 167 L 104 177 L 96 177 Z', cd, OL);
      case 'headphones':
        return line('M 74 170 Q 100 194 126 170', '#2B2B2E', 4.5) +
          ell(73, 168, 8, 11.5, '#2B2B2E', OL) + ell(127, 168, 8, 11.5, '#2B2B2E', OL) + ell(73, 168, 4, 6.5, '#E8455B') + ell(127, 168, 4, 6.5, '#E8455B');
      case 'chain':
        return '<path d="M 84 165 Q 100 200 116 165" fill="none" stroke="#E2B23C" stroke-width="2.6" stroke-dasharray="3 1.6" stroke-linecap="round"/>' +
          circ(100, 193, 4.6, '#E2B23C', 'stroke="#B8861B" stroke-width="1"') + circ(100, 193, 2, '#3F8E69');
      default: return '';
    }
  }

  // A soft golden glow with a few sparkles behind the whole figure.
  function aura(c) {
    if (c.aura !== 'gold') return '';
    const star = (x, y, r) => `<path d="M ${x} ${y - r} Q ${x} ${y} ${x + r} ${y} Q ${x} ${y} ${x} ${y + r} Q ${x} ${y} ${x - r} ${y} Q ${x} ${y} ${x} ${y - r} Z" fill="#F6C14B"/>`;
    return [150, 128, 106, 86].map((r, i) => `<ellipse cx="100" cy="206" rx="${r * 0.72}" ry="${r * 1.32}" fill="#F6C14B" opacity="${0.07 + i * 0.03}"/>`).join('') +
      star(30, 120, 8) + star(170, 90, 10) + star(22, 260, 6) + star(178, 230, 7) + star(160, 330, 5) + star(40, 360, 6);
  }

  /* --------------------------------------------------------------- render */

  // view: 'full' | 'head' | 'bust' or a custom viewBox string.
  const VIEWS = { full: '0 0 200 412', head: '32 16 136 136', bust: '20 10 160 160', tile: '30 6 140 140' };

  function drawing(c) {
    const b = body(c), h = hair(c);
    const slippers = ['bunny', 'monster', 'dragon'].includes(c.shoes);
    // the male figure has broader shoulders: the upper body is drawn 8% wider
    const wide = g => c.body === 'male' ? `<g transform="matrix(1.08 0 0 1 -8 0)">${g}</g>` : g;
    return [
      aura(c), h.back,
      wide(b.arms + b.neck + b.torso),
      b.legs, slippers ? '' : shoes(c), bottom(c), slippers ? shoes(c) : '',
      wide(top(c) + outer(c) + neck(c) + b.hands),
      b.ears, b.face, facialHair(c), cheeks(c), eyes(c), brows(c), nose(c), mouth(c),
      h.front, earrings(c), piercing(c), glasses(c), hat(c),
    ].join('');
  }

  function render(cfg, { view = 'full', title = '', cls = '' } = {}) {
    const vb = VIEWS[view] || view;
    // without a title the picture only decorates (a name or label is next to it)
    const name = title ? `role="img" aria-label="${title.replace(/"/g, '&quot;')}"` : 'aria-hidden="true"';
    return `<svg class="${cls}" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" ${name} preserveAspectRatio="xMidYMid meet">${drawing(normalize(cfg))}</svg>`;
  }

  // Small head pictures for lists and the calendar. Each different avatar is
  // drawn once into a hidden sprite; every picture of it just points there.
  const symbols = new Map();
  function head(cfg, cls = '') {
    const c = normalize(cfg), key = JSON.stringify(c);
    let id = symbols.get(key);
    if (!id) {
      id = `avh${symbols.size + 1}`;
      let sprite = document.getElementById('avatar-sprite');
      if (!sprite) {
        sprite = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sprite.id = 'avatar-sprite';
        sprite.setAttribute('aria-hidden', 'true');
        sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        document.body.appendChild(sprite);
      }
      sprite.insertAdjacentHTML('beforeend', `<symbol id="${id}" viewBox="${VIEWS.head}">${drawing(c)}</symbol>`);
      symbols.set(key, id);
    }
    return `<svg class="${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#${id}" width="100" height="100"/></svg>`;
  }

  return { render, head, normalize, random, rewardsAt, levelOf, label, DEFAULT, STYLES, COLORS, UNLOCKS, VIEWS };
})();
