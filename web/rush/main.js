// Chen's Garden Rush: the game around the run. Menu, shop, missions,
// settings, the HUD, controls, the tutorial, pause and game over, and saving
// the player's progress (here and, through the app, in the database).
import { createView } from './view.js';
import { createRun } from './sim.js';
import { createWorld } from './world.js';
import { lookFrom, OUTFITS, TRAYS, POWER_COLORS } from './models.js';
import { createAudio } from './audio.js';
import { C, powerTime } from './rules.js';

// ------------------------------------------------------------------ texts
// [Dutch, Chinese, Hungarian]
const TX = {
  title: ["Chen's Garden Rush", "Chen's Garden Rush", "Chen's Garden Rush"],
  tagline: ['Ren weg van de chef!', '快跑，别被大厨抓住！', 'Fuss a séf elől!'],
  play: ['Spelen', '开始', 'Játék'],
  best: ['Beste score', '最高分', 'Legjobb pontszám'],
  coins: ['Munten', '金币', 'Érmék'],
  shop: ['Winkel', '商店', 'Bolt'],
  missions: ['Missies', '任务', 'Küldetések'],
  settings: ['Instellingen', '设置', 'Beállítások'],
  board: ['Ranglijst', '排行榜', 'Ranglista'],
  back: ['Terug naar Prikklok', '返回 Prikklok', 'Vissza a Prikklokba'],
  close: ['Sluiten', '关闭', 'Bezárás'],
  loading: ['Het restaurant gaat open…', '餐厅正在开门…', 'Nyit az étterem…'],
  noGL: ['Dit toestel kan het spel niet tonen (geen WebGL).', '这台设备无法显示游戏（不支持 WebGL）。', 'Ez az eszköz nem tudja megjeleníteni a játékot (nincs WebGL).'],
  skip: ['Tik om over te slaan', '点击跳过', 'Koppints a kihagyáshoz'],
  pause: ['Pauze', '暂停', 'Szünet'],
  resume: ['Verder', '继续', 'Folytatás'],
  restart: ['Opnieuw', '重新开始', 'Újrakezdés'],
  menu: ['Hoofdmenu', '主菜单', 'Főmenü'],
  music: ['Muziek', '音乐', 'Zene'],
  sfx: ['Geluiden', '音效', 'Hangeffektek'],
  shake: ['Scherm schudt bij een botsing', '碰撞时屏幕震动', 'Rázkódás ütközéskor'],
  graphics: ['Beeld', '画面', 'Grafika'],
  pretty: ['Mooi', '精美', 'Szép'],
  fast: ['Snel', '流畅', 'Gyors'],
  graphicsNote: ['Kies Snel als het spel hapert. Wordt toegepast bij de volgende start.', '如果游戏卡顿，请选“流畅”。下次打开时生效。', 'Válaszd a Gyorsat, ha akadozik a játék. A következő indításkor lép életbe.'],
  tutorialAgain: ['Uitleg opnieuw bij de volgende run', '下次跑步时重新教学', 'Útmutató újra a következő futásnál'],
  controls: ['Besturing', '操作', 'Irányítás'],
  controlsTouch: ['Veeg links/rechts: van rij wisselen · omhoog: springen · omlaag: glijden (in de lucht: snel naar beneden) · twee keer tikken: dienblad',
    '左右滑动：换道 · 上滑：跳 · 下滑：滑行（空中：快速落下）· 双击：托盘',
    'Húzás balra/jobbra: sávváltás · fel: ugrás · le: csúszás (a levegőben: gyors leérkezés) · dupla koppintás: tálca'],
  controlsKeys: ['Toetsen: ← → of A D · ↑ W of spatie · ↓ S · E: dienblad · P of Esc: pauze',
    '键盘：← → 或 A D · ↑ W 或空格 · ↓ S · E：托盘 · P 或 Esc：暂停',
    'Billentyűk: ← → vagy A D · ↑ W vagy szóköz · ↓ S · E: tálca · P vagy Esc: szünet'],
  caught: ['Gepakt!', '被抓住了！', 'Elkaptak!'],
  score: ['Score', '得分', 'Pontszám'],
  record: ['Nieuw record!', '新纪录！', 'Új rekord!'],
  distance: ['Afstand', '距离', 'Távolság'],
  earned: ['Munten verdiend', '获得金币', 'Szerzett érmék'],
  again: ['Nog eens', '再来一次', 'Még egyszer'],
  colleagues: ["Collega's", '同事排行', 'Kollégák'],
  nobody: ['Nog niemand van het team heeft gespeeld. Jij bent de eerste!', '团队里还没有人玩过。你是第一个！', 'A csapatból még senki sem játszott. Te vagy az első!'],
  you: ['jij', '你', 'te'],
  offline: ['Niet verbonden: je score wordt bewaard en later doorgestuurd.', '未连接：成绩已保存，稍后上传。', 'Nincs kapcsolat: a pontszámod mentve, később elküldjük.'],
  mult: ['Vermenigvuldiger', '倍数', 'Szorzó'],
  multNote: ['Je score is afstand × vermenigvuldiger. Voltooi een missieset om je vaste vermenigvuldiger met 1 te verhogen, tot ×10.',
    '得分 = 距离 × 倍数。完成一组任务，固定倍数加 1，最高 ×10。', 'A pontszámod: távolság × szorzó. Teljesíts egy küldetéssort, és az állandó szorzód 1-gyel nő, legfeljebb ×10-ig.'],
  setDone: ['Missieset klaar!', '任务组完成！', 'Küldetéssor kész!'],
  newMult: ['Je vaste vermenigvuldiger is nu ×{n}.', '你的固定倍数现在是 ×{n}。', 'Az állandó szorzód most ×{n}.'],
  setCoins: ['Bonus: {n} munten.', '奖励：{n} 枚金币。', 'Jutalom: {n} érme.'],
  missionDone: ['Missie voltooid', '任务完成', 'Küldetés teljesítve'],
  scopeRun: ['In één run', '一次完成', 'Egy futásban'],
  scopeTotal: ['Telt op over al je runs', '多次累计', 'Összeadódik a futások között'],
  setN: ['Set {n}', '第 {n} 组', '{n}. sor'],
  maxMult: ['Hoogste vermenigvuldiger bereikt: elke set geeft nu munten.', '已达到最高倍数：之后每组任务奖励金币。', 'Elérted a legnagyobb szorzót: mostantól minden sor érmét ad.'],
  outfits: ['Outfits', '服装', 'Ruhák'],
  trayDesigns: ['Dienbladen', '托盘样式', 'Tálcák'],
  upgrades: ['Power-ups langer', '道具时间更长', 'Hosszabb power-upok'],
  extraTrays: ['Extra dienbladen', '额外托盘', 'Extra tálcák'],
  buy: ['Kopen', '购买', 'Megvesz'],
  choose: ['Kiezen', '选择', 'Kiválaszt'],
  chosen: ['Gekozen', '已选', 'Kiválasztva'],
  level: ['Niveau', '等级', 'Szint'],
  max: ['Max', '已满', 'Max'],
  tooFew: ['Te weinig munten', '金币不够', 'Nincs elég érméd'],
  have: ['Je hebt {n}', '你有 {n} 个', 'Van {n} db'],
  seconds: ['{n} s', '{n} 秒', '{n} mp'],
  trayInfo: ['Dubbel tikken of E: 30 seconden bescherming. Bij een botsing breekt het dienblad en loop je door.',
    '双击或按 E：30 秒保护。撞上东西时托盘会碎，但你能继续跑。', 'Dupla koppintás vagy E: 30 másodperc védelem. Ütközéskor eltörik a tálca, de futsz tovább.'],
  overlap: ['Pak je dezelfde power-up opnieuw, dan begint zijn tijd opnieuw. Verschillende power-ups werken tegelijk.',
    '再次拿到同一个道具，时间会重新计算。不同的道具可以同时生效。', 'Ha ugyanazt a power-upot újra felveszed, az ideje elölről indul. A különböző power-upok egyszerre hatnak.'],
  free: ['Gratis', '免费', 'Ingyen'],
  tutDone: ['Goed zo! Nu is het echt, de chef komt eraan.', '很好！现在正式开始，大厨追来了。', 'Ügyes! Most jön az igazi, jön a séf.'],
  tutGift: ['Je krijgt een dienblad om te oefenen.', '送你一个托盘练习。', 'Kapsz egy tálcát gyakorlásra.'],
  trayNone: ['Geen dienblad meer. Koop er in de winkel.', '没有托盘了。可以在商店购买。', 'Nincs több tálcád. Vehetsz a boltban.'],
  trayBroke: ['Dienblad gebroken! Je loopt door.', '托盘碎了！继续跑。', 'Eltört a tálca! Futsz tovább.'],
  close2: ['De chef zit je op de hielen!', '大厨就在身后！', 'A séf a nyomodban van!'],
  cartAhead: ['Kar komt eraan', '推车来了', 'Jön a kocsi'],
  crossAhead: ['Trolley steekt over', '推车横穿', 'Átkelő kocsi'],
};
const NEEDS = {
  lane: [['Veeg naar links of rechts', '向左或向右滑动', 'Húzd balra vagy jobbra'], ['← →  A  D', '← →  A  D', '← →  A  D']],
  jump: [['Veeg omhoog om te springen', '向上滑动跳跃', 'Húzd felfelé az ugráshoz'], ['↑  W  spatie', '↑  W  空格', '↑  W  szóköz']],
  slide: [['Veeg omlaag om te glijden', '向下滑动滑行', 'Húzd lefelé a csúszáshoz'], ['↓  S', '↓  S', '↓  S']],
  tray: [['Tik twee keer snel: dienblad!', '快速点两下：用托盘！', 'Koppints kétszer gyorsan: tálca!'], ['E', 'E', 'E']],
};
// the countries after the restaurant, and what stands on their horizon
const LANDMARKS = {
  japan: ['Fuji-san', '富士山', 'Fudzsi'], china: ['De Chinese Muur', '长城', 'A kínai nagy fal'], korea: ['Gyeongbokgung', '景福宫', 'Kjongbokkung'],
  thailand: ['Wat Arun', '郑王庙', 'Vat Arun'], vietnam: ['Ha Long-baai', '下龙湾', 'Ha Long-öböl'], india: ['Taj Mahal', '泰姬陵', 'Tádzs Mahal'],
  nepal: ['Himalaya · Boudhanath', '喜马拉雅 · 博达哈佛塔', 'Himalája · Bodnath'], indonesia: ['Borobudur', '婆罗浮屠', 'Borobudur'],
};
const ZONE_NAMES = {
  japan: ['Japan', '日本', 'Japán'], china: ['China', '中国', 'Kína'], korea: ['Korea', '韩国', 'Korea'], thailand: ['Thailand', '泰国', 'Thaiföld'],
  vietnam: ['Vietnam', '越南', 'Vietnám'], india: ['India', '印度', 'India'], nepal: ['Nepal', '尼泊尔', 'Nepál'], indonesia: ['Indonesië', '印度尼西亚', 'Indonézia'],
  dining: ['Restaurant', '餐厅', 'Étterem'], kitchen: ['Keuken', '厨房', 'Konyha'], storage: ['Voorraadkelder', '仓库', 'Raktár'],
  garden: ['Tuinterras', '花园露台', 'Kertterasz'], takeaway: ['Afhaalbalie', '外卖区', 'Elvitel'],
};
const POWER_NAMES = {
  magnet: ['Fooienmagneet', '小费磁铁', 'Borravaló-mágnes'], spring: ['Springschoenen', '弹簧鞋', 'Rugós cipő'],
  dragon: ['Gouden Draak', '金龙飞行', 'Aranysárkány'], double: ['Dubbele Fooi', '双倍小费', 'Dupla borravaló'],
};
const POWER_INFO = {
  magnet: ['Trekt de munten uit alle drie de rijen naar je toe.', '把三条道上的金币都吸过来。', 'Mindhárom sávból magához vonzza az érméket.'],
  spring: ['Je springt veel hoger, zelfs over hoge kasten.', '跳得更高，连高柜子都能跳过。', 'Sokkal magasabbra ugrasz, még a magas szekrények fölé is.'],
  dragon: ['Een gouden draak draagt je over alles heen en zet je veilig neer.', '金龙载你飞越一切，并安全降落。', 'Egy aranysárkány átrepít mindenen, és biztonságosan letesz.'],
  double: ['Je score telt dubbel. Je munten niet.', '得分翻倍，金币不翻倍。', 'A pontszámod duplán számít, az érméid nem.'],
};
const OUTFIT_NAMES = {
  mine: ['Mijn avatar', '我的头像', 'Saját avatar'], waiter: ['Ober', '服务员', 'Pincér'], chef: ['Kok', '厨师', 'Szakács'],
  delivery: ['Bezorger', '外卖员', 'Futár'], host: ['Gastheer', '迎宾', 'Házigazda'], panda: ['Panda', '熊猫', 'Panda'],
  dragon: ['Draak', '龙', 'Sárkány'], gold: ['Goud', '金色', 'Arany'],
};
const TRAY_NAMES = { steel: ['Staal', '不锈钢', 'Acél'], bamboo: ['Bamboe', '竹子', 'Bambusz'], lacquer: ['Rood lakwerk', '红漆', 'Vörös lakk'], jade: ['Jade', '翡翠', 'Jáde'], gold: ['Goud', '金色', 'Arany'] };
const SPECIALS = {
  dumpling: { coins: 5, name: ['Dumpling', '饺子', 'Gombóc'] },
  cookie: { coins: 10, name: ['Gelukskoekje', '幸运饼干', 'Szerencsesüti'] },
  box: { coins: 20, name: ['Afhaaldoos', '外卖盒', 'Elviteles doboz'] },
};
const FORTUNES = [
  ['Een glimlach is de beste fooi.', '微笑是最好的小费。', 'A mosoly a legjobb borravaló.'],
  ['Vandaag vang je elke munt.', '今天你会接住每一枚金币。', 'Ma minden érmét elkapsz.'],
  ['De chef is trager dan hij denkt.', '大厨比他自己想的慢。', 'A séf lassabb, mint hiszi.'],
  ['Een volle zaal begint met één tafel.', '满堂宾客从一桌开始。', 'A teli terem egy asztallal kezdődik.'],
  ['Geluk zit in een dumpling.', '福气藏在饺子里。', 'A szerencse egy gombócban rejlik.'],
  ['Draag je dienblad met trots.', '骄傲地端好你的托盘。', 'Hordd büszkén a tálcádat.'],
  ['Goede rijst heeft tijd nodig. Goede obers niet.', '好米饭要慢慢煮，好服务员不用。', 'A jó rizsnek idő kell. A jó pincérnek nem.'],
  ['Wie op tijd springt, valt nooit in de soep.', '跳得及时，就不会掉进汤里。', 'Aki időben ugrik, sosem esik a levesbe.'],
  ['Er wacht een gouden draak op jou.', '一条金龙在等你。', 'Egy aranysárkány vár rád.'],
  ['Vandaag komt er een gast met een grote fooi.', '今天会来一位给大笔小费的客人。', 'Ma jön egy vendég nagy borravalóval.'],
  ['De wok is heter dan je denkt. Jij ook.', '炒锅比你想的还热。你也是。', 'A wok forróbb, mint gondolnád. Te is.'],
  ['Wie de laatste loempia pakt, doet de afwas.', '拿走最后一个春卷的人去洗碗。', 'Aki elveszi az utolsó tavaszi tekercset, az mosogat.'],
  ['Vandaag breek je geen enkel bord. Waarschijnlijk.', '今天你一个盘子都不会打碎。大概吧。', 'Ma egyetlen tányért sem törsz el. Valószínűleg.'],
  ['Je benen zijn sneller dan de chef. Zijn pollepel niet.', '你的腿比大厨快，他的汤勺可不一定。', 'A lábad gyorsabb a séfnél. A merőkanala nem.'],
  ['Een goede ober rent nooit. Behalve nu.', '好服务员从不跑。除了现在。', 'Egy jó pincér sosem fut. Kivéve most.'],
  ['Pas op voor natte vloeren en droge grappen.', '小心湿地板和冷笑话。', 'Vigyázz a vizes padlóra és a száraz poénokra.'],
  ['Achter elke goede chef staat een snelle ober.', '每个好厨师背后都有一个跑得快的服务员。', 'Minden jó séf mögött ott áll egy gyors pincér.'],
  ['Dumplings die je onderweg opeet, tellen niet.', '路上偷吃的饺子不算数。', 'Az útközben megevett gombóc nem számít.'],
  ['Draag je dienblad zoals een kroon.', '像戴皇冠一样端好托盘。', 'Úgy hordd a tálcát, mint egy koronát.'],
  ['Lachen is gratis. De loempia\'s niet.', '笑是免费的，春卷可不是。', 'A nevetés ingyen van. A tavaszi tekercs nem.'],
  ['Jij hebt de mooiste glimlach van de zaal. Gebruik hem.', '你有全场最灿烂的笑容，用上它。', 'Neked van a legszebb mosolyod a teremben. Használd.'],
  ['Teamwork: jij rent, de chef roept.', '团队合作：你跑，大厨喊。', 'Csapatmunka: te futsz, a séf kiabál.'],
  ['De sojasaus is op. Niet jouw schuld. Toch maar rennen.', '酱油用完了。不怪你。不过还是快跑吧。', 'Elfogyott a szójaszósz. Nem a te hibád. Azért fuss.'],
  ['Tafel 12 wil weten waar hun nasi blijft. Ren!', '12号桌问炒饭什么时候上。快跑！', 'A 12-es asztal kérdezi, hol a sült rizs. Fuss!'],
  ['Wie te laat komt, krijgt de korst van de rijstpot.', '迟到的人只能吃锅巴。', 'Aki késik, az kapja a rizses fazék alját.'],
  ['Elke munt is een fooi. Elke fooi is een glimlach.', '每枚金币都是小费，每份小费都是一个微笑。', 'Minden érme egy borravaló. Minden borravaló egy mosoly.'],
  ['Wees zoals bamboe: buig, maar breek niet. En spring.', '像竹子一样：能弯不能折。还要会跳。', 'Légy olyan, mint a bambusz: hajolj, de ne törj. És ugorj.'],
  ['De chef is niet boos. Hij heeft gewoon honger.', '大厨没生气，他只是饿了。', 'A séf nem mérges. Csak éhes.'],
  ['Een dumpling per dag houdt de chef op afstand.', '一天一个饺子，大厨远离你。', 'Napi egy gombóc távol tartja a séfet.'],
  ['Vandaag is een goede dag voor dubbele fooi.', '今天适合拿双倍小费。', 'Ma jó nap van a dupla borravalóhoz.'],
  ['Het geluk zit in de kleine dingen. En in grote porties.', '幸福藏在小事里。也藏在大份里。', 'A boldogság az apró dolgokban rejlik. És a nagy adagokban.'],
  ['Je loopt zo snel dat je schaduw een pauze neemt.', '你跑得太快，影子都要歇一会儿。', 'Olyan gyorsan futsz, hogy az árnyékod szünetet tart.'],
];
// Remarks about the team, from the server (rush_state → cheer): birthdays,
// who leads, who is new, and playful lines with a colleague's first name.
const CHEER = {
  myBirthday: ['🎂 Gelukkige verjaardag! De chef rent vandaag extra traag.', '🎂 生日快乐！大厨今天跑得特别慢。', '🎂 Boldog születésnapot! A séf ma különösen lassan fut.'],
  birthdayToday: ['🎂 {n} is vandaag jarig! Vergeet niet te feliciteren.', '🎂 今天是{n}的生日！别忘了祝贺。', '🎂 Ma van {n} születésnapja! Ne felejts el gratulálni.'],
  birthdayTomorrow: ['🎂 Morgen is {n} jarig. Wie zorgt voor de taart?', '🎂 明天是{n}的生日。谁去订蛋糕？', '🎂 Holnap van {n} születésnapja. Ki hozza a tortát?'],
  birthdaySoon: ['🎂 {n} is over {d} dagen jarig. Al een cadeautje?', '🎂 再过{d}天就是{n}的生日了。礼物准备好了吗？', '🎂 {d} nap múlva {n} születésnapja. Megvan már az ajándék?'],
  newcomer: ['🎉 Welkom in het team, {n}!', '🎉 欢迎{n}加入团队！', '🎉 Üdv a csapatban, {n}!'],
  leader: ['🏆 {n} staat bovenaan de ranglijst. Voorlopig.', '🏆 {n}目前排行榜第一。暂时的。', '🏆 {n} vezeti a ranglistát. Egyelőre.'],
  record: ['🏃 {n} heeft het record in deze game: {s}. Haal je het?', '🏃 {n}保持着这个游戏的纪录：{s}。你能超过吗？', '🏃 {n} tartja a játék rekordját: {s}. Megdöntöd?'],
  myRecord: ['🏃 Jij hebt het record van het team. Iedereen zit achter je aan, zelfs de chef.', '🏃 全队纪录在你手里。大家都在追你，连大厨也是。', '🏃 Tiéd a csapat rekordja. Mindenki üldöz, még a séf is.'],
  team: [
    ['{n} heeft de laatste dumpling opgegeten. Er is een getuige.', '{n}吃掉了最后一个饺子。有目击者。', '{n} ette meg az utolsó gombócot. Van tanú.'],
    ['{n} zegt dat jij vandaag de snelste bent.', '{n}说你今天是最快的。', '{n} szerint ma te vagy a leggyorsabb.'],
    ['{n} doet de groeten. En vraagt of jij de afwas wil doen.', '{n}向你问好，还问你愿不愿意洗碗。', '{n} üdvözöl. És kérdezi, elmosogatnál-e.'],
    ['{n} rekent op jou vandaag!', '{n}今天就靠你了！', '{n} ma rád számít!'],
    ['Het geheim van {n}: nooit rennen met soep.', '{n}的秘诀：端汤的时候千万别跑。', '{n} titka: levessel sosem futunk.'],
    ['{n} stuurt je een high five. ✋', '{n}给你来了个击掌。✋', '{n} küld neked egy pacsit. ✋'],
    ['{n} heeft de chef afgeleid met een loempia. Ga!', '{n}用一个春卷引开了大厨。快跑！', '{n} elterelte a séf figyelmét egy tavaszi tekerccsel. Fuss!'],
    ['{n} wedt dat je de 1000 meter haalt.', '{n}打赌你能跑过1000米。', '{n} fogad, hogy meglesz az 1000 méter.'],
    ['{n} heeft de chef verteld dat jij het niet was.', '{n}跟大厨说了不是你干的。', '{n} megmondta a séfnek, hogy nem te voltál.'],
    ['{n} houdt een plekje vrij voor jou aan de personeelstafel.', '{n}在员工餐桌给你留了个位子。', '{n} foglal neked helyet a személyzeti asztalnál.'],
    ['Weetje: {n} kan sneller rijst bestellen dan jij kan rennen.', '冷知识：{n}点米饭比你跑步还快。', 'Érdekesség: {n} gyorsabban rendel rizst, mint ahogy te futsz.'],
    ['{n} vindt dat je dienblad vandaag extra glanst.', '{n}觉得你今天的托盘特别亮。', '{n} szerint ma különösen fényes a tálcád.'],
  ],
};

// ---------------------------------------------------------------- the shop
const SHOP = {
  outfits: { mine: 0, waiter: 0, chef: 1000, delivery: 2000, host: 3000, panda: 5000, dragon: 8000, gold: 12000 },
  trays: { steel: 0, bamboo: 600, lacquer: 1500, jade: 3000, gold: 6000 },
  upgrade: [500, 1000, 2000, 4000, 8000],
  tray: 250, trayMax: 9,
};

// -------------------------------------------------------------- missions
// Each set has three; finishing a set raises the score multiplier by one,
// up to ×10. scope 'run' = within one run, 'total' = summed over runs.
const M = {
  coins: ['Verzamel {n} munten', '收集 {n} 枚金币', 'Gyűjts {n} érmét'],
  jumps: ['Spring over {n} obstakels', '跳过 {n} 个障碍', 'Ugorj át {n} akadályt'],
  slides: ['Glij onder {n} hindernissen door', '从 {n} 个障碍下滑过', 'Csússz át {n} akadály alatt'],
  dist: ['Loop {n} m', '跑 {n} 米', 'Fuss {n} métert'],
  score: ['Haal {n} punten', '得到 {n} 分', 'Szerezz {n} pontot'],
  dumpling: ['Pak {n} dumplings', '拿到 {n} 个饺子', 'Vegyél fel {n} gombócot'],
  cookie: ['Pak {n} gelukskoekjes', '拿到 {n} 个幸运饼干', 'Vegyél fel {n} szerencsesütit'],
  box: ['Pak {n} afhaaldozen', '拿到 {n} 个外卖盒', 'Vegyél fel {n} elviteles dobozt'],
  trays: ['Gebruik {n}× een dienblad', '使用 {n} 次托盘', 'Használj {n}× tálcát'],
  powerups: ['Pak {n} power-ups', '拿到 {n} 个道具', 'Vegyél fel {n} power-upot'],
  runs: ['Speel {n} runs', '玩 {n} 次', 'Játssz {n} futást'],
};
const SETS = [
  [['coins', 'total', 100], ['jumps', 'total', 10], ['dist', 'run', 500]],
  [['slides', 'total', 10], ['dumpling', 'total', 3], ['score', 'run', 2500]],
  [['coins', 'run', 150], ['trays', 'total', 1], ['powerups', 'total', 3]],
  [['dist', 'run', 1000], ['jumps', 'total', 30], ['cookie', 'total', 2]],
  [['score', 'run', 10000], ['slides', 'run', 12], ['box', 'total', 3]],
  [['coins', 'total', 1500], ['powerups', 'run', 3], ['runs', 'total', 15]],
  [['dist', 'run', 2000], ['dumpling', 'total', 12], ['trays', 'total', 4]],
  [['score', 'run', 30000], ['jumps', 'run', 35], ['coins', 'run', 400]],
  [['dist', 'run', 3000], ['cookie', 'total', 10], ['slides', 'run', 25]],
];
const MULT_MAX = 10;
function missionsFor(set) {
  if (set < SETS.length) return SETS[set].map(([k, scope, n], i) => ({ id: `${set}:${i}`, k, scope, n }));
  // after the last set: harder versions, rewarded with coins
  const x = set - SETS.length + 1;
  return [
    { id: `${set}:0`, k: 'dist', scope: 'run', n: 3000 + x * 500 },
    { id: `${set}:1`, k: ['coins', 'jumps', 'slides'][x % 3], scope: 'run', n: [400, 35, 25][x % 3] + x * 10 },
    { id: `${set}:2`, k: ['dumpling', 'cookie', 'box', 'powerups'][x % 4], scope: 'total', n: 10 + x * 3 },
  ];
}

// --------------------------------------------------------------- saving
const fresh = () => ({
  v: 1, at: 0, coins: 0, best: 0, bestDist: 0, runs: 0,
  outfit: 'mine', outfits: ['mine', 'waiter'], tray: 'steel', trayDesigns: ['steel'],
  up: { magnet: 0, spring: 0, dragon: 0, double: 0 }, trays: 2,
  set: 0, prog: {}, done: [], mult: 1,
  sfx: true, music: true, shake: true, quality: 'auto', tutorial: false,
});
function clean(s) {
  const f = fresh(), o = { ...f, ...(s && typeof s === 'object' ? s : {}) };
  const num = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  o.coins = num(o.coins, 1e9); o.best = num(o.best, 1e9); o.bestDist = num(o.bestDist, 1e7); o.runs = num(o.runs, 1e7);
  o.trays = num(o.trays, SHOP.trayMax); o.set = num(o.set, 1000); o.mult = Math.max(1, num(o.mult, MULT_MAX));
  o.outfits = [...new Set(['mine', 'waiter', ...(Array.isArray(o.outfits) ? o.outfits : [])])].filter(k => k in SHOP.outfits);
  o.trayDesigns = [...new Set(['steel', ...(Array.isArray(o.trayDesigns) ? o.trayDesigns : [])])].filter(k => k in SHOP.trays);
  if (!o.outfits.includes(o.outfit)) o.outfit = 'mine';
  if (!o.trayDesigns.includes(o.tray)) o.tray = 'steel';
  o.up = { ...f.up, ...(o.up || {}) };
  for (const k in o.up) o.up[k] = num(o.up[k], 5);
  o.prog = o.prog && typeof o.prog === 'object' ? o.prog : {};
  o.done = Array.isArray(o.done) ? o.done.filter(x => typeof x === 'string') : [];
  return o;
}

// ---------------------------------------------------------------- the game
// The stylesheet, once, next to this module.
function loadCss() {
  const href = new URL('./rush.css', import.meta.url).href;
  let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(l => l.href === href);
  if (link) return Promise.resolve();
  link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href });
  const done = new Promise(res => { link.onload = res; link.onerror = res; setTimeout(res, 4000); });
  document.head.appendChild(link);
  return done;
}

export async function start({ root, me = {}, colors = null, lang = 'nl', api = null, onExit = () => {}, pic = null }) {
  await loadCss();
  const L3 = a => a[lang === 'zh' ? 1 : lang === 'hu' ? 2 : 0] ?? a[0];
  const t = (k, n) => L3(TX[k]).replace('{n}', n);
  const fmtN = n => Math.floor(n).toLocaleString({ zh: 'zh-CN', hu: 'hu-HU' }[lang] || 'nl-BE');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const key = `rush.save.${me.id || 'guest'}`;
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
    set(v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  let save = clean(store.get());
  let board = [], pending = null, online = true, cheer = null;

  // ------------------------------------------------------------- the page
  root.innerHTML = `
    <div class="rush" data-screen="loading" lang="${lang === 'zh' ? 'zh-Hans' : lang}">
      <canvas class="rush-canvas" aria-hidden="true"></canvas>
      <div class="rush-hud" aria-hidden="true">
        <div class="hud-left"><div class="hud-score"><span class="hud-score-v">0</span><span class="hud-mult">×1</span></div><div class="hud-dist"></div></div>
        <div class="hud-right"><div class="hud-coins"><span class="coin-dot"></span><span class="hud-coins-v">0</span></div>
          <button class="hud-pause" type="button" aria-label="${t('pause')}"><span></span><span></span></button></div>
        <div class="hud-powers"></div>
        <div class="hud-trays"></div>
      </div>
      <div class="rush-hint" hidden><div class="hint-gesture"></div><div class="hint-text"></div><div class="hint-keys"></div></div>
      <div class="rush-toasts"></div>
      <div class="rush-flash"></div>
      <div class="rush-skip" hidden>${t('skip')}</div>
      <div class="rush-loading"><div class="rush-logo"><span>Chen's Garden</span><b>RUSH</b></div><p>${t('loading')}</p></div>
      <div class="rush-menu rush-screen"></div>
      <div class="rush-pause rush-screen"></div>
      <div class="rush-over rush-screen"></div>
      <div class="rush-sheet" hidden></div>
    </div>`;
  const el = root.querySelector('.rush');
  const $ = s => el.querySelector(s);
  const canvas = $('.rush-canvas');
  const setScreen = s => { el.dataset.screen = s; };

  let view;
  try {
    view = createView(canvas, {
      labels: Object.fromEntries(Object.entries(ZONE_NAMES).map(([k, v]) => [k, L3(v)])),
      lowPower: save.quality === 'fast',
    });
  } catch (e) {
    $('.rush-loading p').textContent = t('noGL');
    $('.rush-loading').insertAdjacentHTML('beforeend', `<button class="rb gold" type="button" data-exit>${t('back')}</button>`);
    $('[data-exit]').addEventListener('click', () => onExit());
    return { close() { root.innerHTML = ''; } };
  }
  const audio = createAudio();
  audio.set('sfx', save.sfx); audio.set('music', save.music);
  view.setShake(save.shake);
  const applyLook = () => view.setLook(lookFrom(me.avatar || {}, save.outfit, colors), save.tray);
  applyLook();
  view.setWorld(createWorld(1));
  view.setMode('menu');

  // the progress on the server: the newer of the two wins
  async function loadServer() {
    if (!api) return;
    try {
      const r = await api.state();
      online = true;
      board = r.board || [];
      cheer = r.cheer || null;
      if (r.save && (Number(r.save.at) || 0) > (save.at || 0)) { save = clean(r.save); store.set(save); applyLook(); audio.set('sfx', save.sfx); audio.set('music', save.music); view.setShake(save.shake); }
      else if ((save.at || 0) > (Number(r.save && r.save.at) || 0)) push();
      if (screen === 'menu') renderMenu();
    } catch { online = false; }
  }
  function persist() { save.at = Date.now(); store.set(save); push(); }
  function push(run = null) {
    if (!api) return Promise.resolve();
    const p = (run ? api.finish(run, save) : api.save(save)).then(r => { online = true; if (r && r.board) board = r.board; return r; }).catch(() => { online = false; });
    pending = p;
    return p;
  }

  // ------------------------------------------------- remarks and fortunes
  const pickOne = list => list[Math.floor(Math.random() * list.length)];
  const fill = (text, vars) => text.replace('{n}', esc(vars.n ?? '')).replace('{d}', vars.d ?? '').replace('{s}', vars.s ?? '');
  // the team's news: birthdays first, then a record, the leader, newcomers
  function teamNews() {
    const out = [];
    if (!cheer) return out;
    for (const b of cheer.birthdays || []) {
      if (b.me) { if (b.days === 0) out.push(L3(CHEER.myBirthday)); continue; }
      out.push(fill(L3(b.days === 0 ? CHEER.birthdayToday : b.days === 1 ? CHEER.birthdayTomorrow : CHEER.birthdaySoon), { n: b.name, d: b.days }));
    }
    const top = board[0];
    if (top && top.best > 0) out.push(top.me ? L3(CHEER.myRecord) : fill(L3(CHEER.record), { n: top.name.split(' ')[0], s: fmtN(top.best) }));
    if (cheer.leader && cheer.leader !== (me.name || '').split(' ')[0]) out.push(fill(L3(CHEER.leader), { n: cheer.leader }));
    for (const n of cheer.newcomers || []) out.push(fill(L3(CHEER.newcomer), { n }));
    return out;
  }
  // one remark: now and then team news, a line with a colleague, or a fortune
  let lastRemark = '';
  function remark() {
    const news = teamNews(), team = (cheer && cheer.team) || [];
    let text, tries = 0;
    do {
      const r = Math.random();
      if (news.length && r < 0.3) text = pickOne(news);
      else if (team.length && r < 0.6) text = fill(L3(pickOne(CHEER.team)), { n: pickOne(team) });
      else text = esc(L3(pickOne(FORTUNES)));
    } while (text === lastRemark && ++tries < 5);
    lastRemark = text;
    return text;
  }

  // ----------------------------------------------------------- the menu
  let screen = 'loading';
  const coinIcon = '<span class="coin-dot"></span>';
  function renderMenu() {
    screen = 'menu'; setScreen('menu');
    const ms = missionsFor(save.set), done = ms.filter(m => save.done.includes(m.id)).length;
    $('.rush-menu').innerHTML = `
      <div class="menu-top">
        <button class="rb ghost sm" type="button" data-exit>‹ ${t('back')}</button>
        <div class="menu-coins">${coinIcon}<b>${fmtN(save.coins)}</b></div>
      </div>
      <div class="rush-logo big"><span>Chen's Garden</span><b>RUSH</b><i>${t('tagline')}</i></div>
      ${teamNews().length ? `<div class="menu-news">${teamNews()[0]}</div>` : ''}
      <div class="menu-bottom">
        <div class="menu-stats">
          <div><span>${t('best')}</span><b>${fmtN(save.best)}</b></div>
          <div><span>${t('mult')}</span><b>×${save.mult}</b></div>
          <div><span>${t('missions')}</span><b>${done}/3</b></div>
        </div>
        <button class="rb gold play" type="button" data-play>▶ ${t('play')}</button>
        <div class="menu-row">
          <button class="rb" type="button" data-sheet="shop">${t('shop')}</button>
          <button class="rb" type="button" data-sheet="missions">${t('missions')}</button>
          <button class="rb" type="button" data-sheet="board">${t('board')}</button>
          <button class="rb icon" type="button" data-sheet="settings" aria-label="${t('settings')}">⚙</button>
        </div>
      </div>`;
    view.setMode('menu');
    audio.music('menu');
  }

  // ------------------------------------------------------------- sheets
  function sheet(kind) {
    const s = $('.rush-sheet');
    s.hidden = false; s.dataset.kind = kind;
    const head = title => `<div class="sheet-head"><h2>${title}</h2><div class="menu-coins">${coinIcon}<b>${fmtN(save.coins)}</b></div><button class="rb icon" type="button" data-close aria-label="${t('close')}">✕</button></div>`;
    if (kind === 'shop') {
      const owned = (list, k) => list.includes(k);
      const item = (group, k, price, name, extra = '') => {
        const mine = group === 'outfit' ? owned(save.outfits, k) : owned(save.trayDesigns, k);
        const on = group === 'outfit' ? save.outfit === k : save.tray === k;
        return `<div class="shop-item${on ? ' is-on' : ''}"><div class="swatch ${group}-${k}">${group === 'outfit' && k === 'mine' && pic ? pic(me) : ''}</div><div class="shop-name">${name}${extra}</div>
          ${on ? `<span class="tag on">${t('chosen')}</span>` : mine ? `<button class="rb sm" type="button" data-pick="${group}:${k}">${t('choose')}</button>`
            : `<button class="rb sm gold" type="button" data-buy="${group}:${k}" ${save.coins < price ? 'disabled' : ''}>${coinIcon}${fmtN(price)}</button>`}</div>`;
      };
      s.innerHTML = `<div class="sheet-card">${head(t('shop'))}<div class="sheet-body">
        <h3>${t('outfits')}</h3>
        <div class="shop-grid">${Object.entries(SHOP.outfits).map(([k, p]) => item('outfit', k, p, L3(OUTFIT_NAMES[k]))).join('')}</div>
        <h3>${t('trayDesigns')}</h3>
        <div class="shop-grid">${Object.entries(SHOP.trays).map(([k, p]) => item('tray', k, p, L3(TRAY_NAMES[k]))).join('')}</div>
        <h3>${t('upgrades')}</h3>
        <p class="sheet-note">${t('overlap')}</p>
        <div class="shop-list">${Object.keys(POWER_NAMES).map(k => {
          const lv = save.up[k], price = SHOP.upgrade[lv];
          return `<div class="shop-row"><span class="pw-ico" style="--c:${POWER_COLORS[k]}">${POWER_ICONS[k]}</span>
            <div class="shop-row-main"><b>${L3(POWER_NAMES[k])}</b><span>${L3(POWER_INFO[k])}</span>
              <span class="pips">${[0, 1, 2, 3, 4].map(i => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}<em>${t('seconds', powerTime(k, lv))}</em></span></div>
            ${lv >= 5 ? `<span class="tag">${t('max')}</span>` : `<button class="rb sm gold" type="button" data-up="${k}" ${save.coins < price ? 'disabled' : ''}>${coinIcon}${fmtN(price)}</button>`}</div>`;
        }).join('')}</div>
        <h3>${t('extraTrays')}</h3>
        <div class="shop-list"><div class="shop-row"><span class="pw-ico tray-ico"></span>
          <div class="shop-row-main"><b>${t('have', save.trays)}</b><span>${t('trayInfo')}</span></div>
          ${save.trays >= SHOP.trayMax ? `<span class="tag">${t('max')}</span>` : `<button class="rb sm gold" type="button" data-buytray ${save.coins < SHOP.tray ? 'disabled' : ''}>${coinIcon}${fmtN(SHOP.tray)}</button>`}</div></div>
      </div></div>`;
    } else if (kind === 'missions') {
      s.innerHTML = `<div class="sheet-card">${head(t('missions'))}<div class="sheet-body">
        <div class="mult-box"><b>×${save.mult}</b><span>${t('multNote')}</span></div>
        ${save.mult >= MULT_MAX ? `<p class="sheet-note">${t('maxMult')}</p>` : ''}
        <h3>${t('setN', save.set + 1)}</h3>
        ${missionList(null)}
      </div></div>`;
    } else if (kind === 'board') {
      s.innerHTML = `<div class="sheet-card">${head(t('board'))}<div class="sheet-body">${boardList(null)}</div></div>`;
      loadServer().then(() => { if (!s.hidden && s.dataset.kind === 'board') s.querySelector('.sheet-body').innerHTML = boardList(null); });
    } else if (kind === 'settings') {
      s.innerHTML = `<div class="sheet-card">${head(t('settings'))}<div class="sheet-body">
        ${toggles()}
        <div class="set-row"><span>${t('graphics')}</span><div class="seg">
          <button type="button" class="${save.quality !== 'fast' ? 'on' : ''}" data-quality="auto">${t('pretty')}</button>
          <button type="button" class="${save.quality === 'fast' ? 'on' : ''}" data-quality="fast">${t('fast')}</button></div></div>
        <p class="sheet-note">${t('graphicsNote')}</p>
        <label class="set-row"><span>${t('tutorialAgain')}</span><input type="checkbox" data-set="tutorialAgain" ${save.tutorial ? '' : 'checked'}></label>
        <h3>${t('controls')}</h3><p class="sheet-note">${t('controlsTouch')}</p><p class="sheet-note">${t('controlsKeys')}</p>
      </div></div>`;
    }
    bindSheet(s);
  }
  const toggles = () => ['music', 'sfx', 'shake'].map(k => `<label class="set-row"><span>${t(k)}</span><input type="checkbox" data-set="${k}" ${save[k] ? 'checked' : ''}></label>`).join('');
  function bindToggles(box) {
    box.querySelectorAll('[data-set]').forEach(c => c.addEventListener('change', () => {
      const k = c.dataset.set;
      if (k === 'tutorialAgain') save.tutorial = !c.checked;
      else { save[k] = c.checked; if (k === 'music' || k === 'sfx') audio.set(k, c.checked); if (k === 'shake') view.setShake(c.checked); }
      audio.play('click');
      persist();
    }));
  }
  function bindSheet(s) {
    s.querySelector('[data-close]').addEventListener('click', () => { s.hidden = true; audio.play('click'); renderMenu(); });
    bindToggles(s);
    s.querySelectorAll('[data-quality]').forEach(b => b.addEventListener('click', () => { save.quality = b.dataset.quality; persist(); sheet('settings'); }));
    s.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
      const [g, k] = b.dataset.pick.split(':');
      if (g === 'outfit') save.outfit = k; else save.tray = k;
      applyLook(); persist(); audio.play('click'); sheet('shop');
    }));
    s.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => {
      const [g, k] = b.dataset.buy.split(':'), price = g === 'outfit' ? SHOP.outfits[k] : SHOP.trays[k];
      if (save.coins < price) return toast(t('tooFew'));
      save.coins -= price;
      if (g === 'outfit') { save.outfits.push(k); save.outfit = k; } else { save.trayDesigns.push(k); save.tray = k; }
      applyLook(); persist(); audio.play('buy'); sheet('shop');
    }));
    s.querySelectorAll('[data-up]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.up, lv = save.up[k], price = SHOP.upgrade[lv];
      if (lv >= 5 || save.coins < price) return;
      save.coins -= price; save.up[k] = lv + 1;
      persist(); audio.play('buy'); sheet('shop');
    }));
    const bt = s.querySelector('[data-buytray]');
    if (bt) bt.addEventListener('click', () => {
      if (save.coins < SHOP.tray || save.trays >= SHOP.trayMax) return;
      save.coins -= SHOP.tray; save.trays++;
      persist(); audio.play('buy'); sheet('shop');
    });
  }

  // progress of a mission: what is saved plus, during a run, this run
  function progress(m, r) {
    const base = save.prog[m.id] || 0;
    if (save.done.includes(m.id)) return m.n;
    const now = r ? runValue(m.k, r) : 0;
    return Math.min(m.n, m.scope === 'run' ? Math.max(base, now) : base + now);
  }
  function runValue(k, r) {
    if (k === 'coins') return r.coins;
    if (k === 'dist') return Math.floor(r.p.d);
    if (k === 'score') return Math.floor(r.score);
    if (k === 'runs') return r.state === 'over' ? 1 : 0;
    if (k === 'trays') return r.counts.trays;
    return r.counts[k] || 0;
  }
  function missionList(r) {
    return `<div class="missions">${missionsFor(save.set).map(m => {
      const p = progress(m, r), ok = p >= m.n;
      return `<div class="mission${ok ? ' is-done' : ''}"><span class="m-check">${ok ? '✓' : ''}</span><div class="m-main">
        <b>${L3(M[m.k]).replace('{n}', fmtN(m.n))}</b><span class="m-scope ${m.scope}">${t(m.scope === 'run' ? 'scopeRun' : 'scopeTotal')}</span>
        <div class="m-bar"><i style="width:${(p / m.n) * 100}%"></i></div><span class="m-num">${fmtN(p)} / ${fmtN(m.n)}</span></div></div>`;
    }).join('')}</div>`;
  }
  function boardList(r) {
    const list = [...board];
    if (!list.length) return `<p class="sheet-note">${t('nobody')}</p>${online ? '' : `<p class="sheet-note">${t('offline')}</p>`}`;
    return `<ol class="board">${list.map((p, i) => `<li class="${p.me ? 'is-me' : ''}"><span class="b-rank">${p.rank || i + 1}</span>
      <span class="b-pic">${pic ? pic(p) : ''}</span><span class="b-name">${esc(p.name)}${p.me ? ` <em>${t('you')}</em>` : ''}</span><b class="b-score">${fmtN(p.best)}</b></li>`).join('')}</ol>
      ${online ? '' : `<p class="sheet-note">${t('offline')}</p>`}`;
  }

  // ------------------------------------------------------------- toasts
  function toast(text, kind = '') {
    const box = $('.rush-toasts'), d = document.createElement('div');
    d.className = `rt ${kind}`; d.innerHTML = text;
    box.appendChild(d);
    while (box.children.length > 2) box.firstChild.remove();
    // long remarks stay longer, so they can be read
    const ms = kind === 'fortune' ? Math.min(8000, 3500 + d.textContent.length * 50) : 3000;
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }
  function flash(color = '#FFFFFF') {
    const f = $('.rush-flash');
    f.style.background = color; f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }

  // ------------------------------------------------------------- the run
  let run = null, intro = 0, introFrom = 0, introSeen = false, slow = 1, lessonsDone = new Set(), tutorialNoted = false;
  let missionsHit = new Set(), queue = [], simTime = 0, lastFrame = 0, paused = false, hudCache = {}, zoneShown = null;
  function newRun() {
    const tutorial = !save.tutorial;
    run = createRun({ tutorial, levels: save.up, mult: save.mult, trays: save.trays });
    remarkT = 50 + Math.random() * 20;
    run.bonus = 0; lessonsDone = new Set(); tutorialNoted = false; missionsHit = new Set(save.done); slow = 1;
    zoneShown = run.zone.k;
    view.attach(run);
    hudCache = {};
    $('.rush-toasts').innerHTML = '';
  }
  function play() {
    audio.unlock();
    $('.rush-sheet').hidden = true;
    newRun();
    // the intro: the whole story the first time, the short version after
    intro = introSeen ? 1.05 : 0.0001; introFrom = intro; introSeen = true;
    screen = 'intro'; setScreen('intro');
    $('.rush-skip').hidden = false;
    view.setMode('intro');
    audio.music('run');
    audio.ambience('dining');
  }
  function beginRun() {
    $('.rush-skip').hidden = true;
    screen = 'run'; setScreen('run');
    view.setMode('run');
    queue = []; simTime = performance.now(); paused = false;
    if (run.tutorial) setTimeout(() => toast(L3(['Eerst even oefenen!', '先练习一下！', 'Előbb gyakorlunk egy kicsit!'])), 300);
  }
  function setPaused(p) {
    if (screen !== 'run' || paused === p) return;
    paused = p;
    audio.pause(p);
    if (p) {
      setScreen('pause');
      $('.rush-pause').innerHTML = `<div class="sheet-card small"><h2>${t('pause')}</h2>
        <button class="rb gold" type="button" data-resume>▶ ${t('resume')}</button>
        <button class="rb" type="button" data-restart>↻ ${t('restart')}</button>
        <div class="pause-toggles">${['music', 'sfx'].map(k => `<label class="set-row"><span>${t(k)}</span><input type="checkbox" data-set="${k}" ${save[k] ? 'checked' : ''}></label>`).join('')}</div>
        <button class="rb ghost" type="button" data-menu>${t('menu')}</button></div>`;
      bindToggles($('.rush-pause'));
    } else {
      setScreen('run');
      simTime = performance.now(); queue = [];
    }
  }

  // inputs carry their time, so each lands on the right step of the run
  function input(a, ts = performance.now()) {
    if (screen === 'intro') { if (a !== 'none') skipIntro(); return; }
    if (screen !== 'run' || paused || !run || run.state !== 'run') return;
    queue.push([ts, a]);
  }
  function skipIntro() { if (screen === 'intro' && intro > 0.3) intro = view.INTRO; }

  // the tutorial waits (in slow motion) for the move it shows
  function lessonFor(a) {
    const l = run.lesson();
    if (!l) return;
    const ok = (l.need === 'lane' && (a === 'left' || a === 'right')) || (l.need === 'jump' && a === 'up') || (l.need === 'slide' && a === 'down') || (l.need === 'tray' && a === 'tray');
    if (ok) lessonsDone.add(l.o ? l.o.id : 'tray');
  }

  function stepRun(now) {
    const dtMs = C.DT * 1000;
    let waiting = null, n = 0;
    for (;;) {
      const l = run.lesson();
      if (l && l.need === 'tray' && run.trays <= 0 && run.tray <= 0 && !lessonsDone.has('tray')) { run.trays = 1; toast(t('tutGift')); }
      waiting = l && !lessonsDone.has(l.o ? l.o.id : 'tray') && (l.need === 'tray' || l.dist < (l.need === 'lane' ? 11 : 8)) ? l : null;
      // slow motion while a lesson waits for its move: within about a fifth
      // of a second whatever the frame rate, almost still right in front of it
      const target = !waiting ? 1 : waiting.need !== 'tray' && waiting.dist < 3 ? 0.04 : 0.12;
      const stepMs = dtMs / slow;
      if (simTime + stepMs > now || n >= 240) break;
      const end = simTime + stepMs;
      while (queue.length && queue[0][0] <= end) { const [, a] = queue.shift(); run.input(a); lessonFor(a); }
      run.step(C.DT);
      simTime = end; n++;
      slow = target < slow ? Math.max(target, slow - stepMs / 250) : Math.min(target, slow + stepMs / 400);
      if (run.state !== 'run') break;
    }
    if (n >= 240) simTime = now;
    showHint(waiting ? waiting.need : null);
    if (run.state !== 'run') queue = [];
  }

  function showHint(need) {
    const h = $('.rush-hint');
    if (!need) { if (!h.hidden) h.hidden = true; return; }
    if (h.dataset.need === need && !h.hidden) return;
    h.dataset.need = need; h.hidden = false;
    h.querySelector('.hint-gesture').className = `hint-gesture g-${need}`;
    h.querySelector('.hint-text').textContent = L3(NEEDS[need][0]);
    h.querySelector('.hint-keys').textContent = L3(NEEDS[need][1]);
    audio.play('tutorial');
  }

  function handleEvents() {
    const ev = run.ev.splice(0);
    if (!ev.length) return;
    view.events(ev);
    for (const e of ev) {
      audio.play(e.type, e);
      if (e.type === 'special') {
        const sp = SPECIALS[e.p]; run.bonus += sp.coins; run.coins += sp.coins;
        if (e.p === 'cookie') toast(`🥠 “${remark()}” <b>+${sp.coins}</b>`, 'fortune');
        else if (e.p === 'dumpling') toast(`🥟 ${L3(sp.name)} <b>+${sp.coins}</b> ${coinIcon}`);
        // takeaway boxes: just the coins going up (the sound and sparkle say enough)
      } else if (e.type === 'trayBreak') { toast(t('trayBroke'), 'warn'); flash('rgba(255,255,255,.55)'); }
      else if (e.type === 'trayNo' && run.trays <= 0 && !run.p.fly) toast(t('trayNone'));
      else if (e.type === 'cartWarn') hudWarn('cart');
      else if (e.type === 'crossWarn') hudWarn('cross');
      else if (e.type === 'zone') {
        audio.ambience(e.z.k);
        if (e.z.k !== zoneShown) {
          // out of the restaurant: the journey through Asia begins
          if (LANDMARKS[e.z.k] && !LANDMARKS[zoneShown]) toast(L3(['Het restaurant uit… op reis door Azië!', '跑出餐厅……开始亚洲之旅！', 'Ki az étteremből… irány Ázsia!']), 'mission');
          zoneShown = e.z.k;
          if (LANDMARKS[e.z.k]) toast(`${L3(ZONE_NAMES[e.z.k])} · ${L3(LANDMARKS[e.z.k])}`, 'zone');
        }
      } else if (e.type === 'crash' || e.type === 'caught') { audio.music(null); setTimeout(() => audio.play('caught'), 450); }
    }
    // missions finished during the run
    for (const m of missionsFor(save.set)) {
      if (missionsHit.has(m.id)) continue;
      if (progress(m, run) >= m.n) { missionsHit.add(m.id); toast(`✓ ${t('missionDone')}: ${L3(M[m.k]).replace('{n}', fmtN(m.n))}`, 'mission'); audio.play('mission'); }
    }
    if (run.tutorial && !tutorialNoted && run.p.d > run.w.tutorialEnd) { tutorialNoted = true; toast(t('tutDone'), 'mission'); save.tutorial = true; persist(); }
  }
  let warnT = 0;
  function hudWarn(kind) {
    const box = $('.hud-warn') || $('.rush-hud').appendChild(Object.assign(document.createElement('div'), { className: 'hud-warn' }));
    box.textContent = `⚠ ${t(kind === 'cart' ? 'cartAhead' : 'crossAhead')}`;
    box.classList.add('on'); clearTimeout(warnT); warnT = setTimeout(() => box.classList.remove('on'), 1600);
  }

  const POWER_ICONS = {
    magnet: '<svg viewBox="0 0 24 24"><path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z" fill="currentColor"/></svg>',
    spring: '<svg viewBox="0 0 24 24"><path d="M4 15h11l5 2v3H4zM7 5h10M7 8.5h10M7 12h10" stroke="currentColor" stroke-width="2" fill="currentColor"/></svg>',
    dragon: '<svg viewBox="0 0 24 24"><path d="M3 15c3-6 7-8 12-7l3-3 1 4c2 1 2 4-1 5-4 1-6-2-9 0s-3 4-6 1z" fill="currentColor"/></svg>',
    double: '<svg viewBox="0 0 24 24"><text x="12" y="17" text-anchor="middle" font-size="13" font-weight="800" fill="currentColor">×2</text></svg>',
  };
  function updateHud() {
    const set = (k, v, fn) => { if (hudCache[k] !== v) { hudCache[k] = v; fn(v); } };
    set('score', Math.floor(run.score), v => { $('.hud-score-v').textContent = fmtN(v); });
    set('mult', run.mult(), v => { const m = $('.hud-mult'); m.textContent = `×${v}`; m.classList.toggle('double', run.power.double > 0); });
    set('coins', run.coins, v => { $('.hud-coins-v').textContent = fmtN(v); const c = $('.hud-coins'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); });
    set('dist', Math.floor(run.p.d), v => { $('.hud-dist').textContent = `${fmtN(v)} m`; });
    const pw = Object.keys(run.power).filter(k => run.power[k] > 0);
    set('pw', pw.join(), () => {
      $('.hud-powers').innerHTML = pw.map(k => `<div class="hud-pw" data-p="${k}" style="--c:${POWER_COLORS[k]}"><span class="pw-ico">${POWER_ICONS[k]}</span><span class="pw-bar"><i></i></span></div>`).join('');
    });
    for (const k of pw) {
      const b = el.querySelector(`.hud-pw[data-p="${k}"]`);
      if (!b) continue;
      b.querySelector('i').style.transform = `scaleX(${run.power[k] / run.powerT[k]})`;
      b.classList.toggle('ending', run.power[k] < 2);
    }
    set('trays', `${run.trays}|${run.tray > 0 ? Math.ceil(run.tray) : 0}`, () => {
      const on = run.tray > 0;
      $('.hud-trays').innerHTML = `<span class="tray-ico${on ? ' on' : ''}"></span><b>${run.trays}</b>${on ? `<span class="tray-time${run.tray < 3 ? ' ending' : ''}">${Math.ceil(run.tray)} s</span>` : ''}`;
    });
  }

  // ---------------------------------------------------------- game over
  async function gameOver() {
    screen = 'over'; setScreen('over');
    audio.ambience(null);
    const r = run, score = Math.floor(r.score), dist = Math.floor(r.p.d), coins = r.coins;
    const record = score > save.best;
    // saved progress: coins, trays left, totals, missions
    save.coins += coins; save.runs++; save.trays = r.trays;
    if (record) save.best = score;
    save.bestDist = Math.max(save.bestDist, dist);
    if (r.tutorial && r.p.d > r.w.tutorialEnd) save.tutorial = true;
    const ms = missionsFor(save.set);
    for (const m of ms) {
      if (save.done.includes(m.id)) continue;
      const p = progress(m, r);
      if (p >= m.n) save.done.push(m.id);
      else save.prog[m.id] = p;
    }
    let setMsg = '';
    if (ms.every(m => save.done.includes(m.id))) {
      const bonus = save.mult >= MULT_MAX ? 500 + 100 * (save.set - SETS.length + 1) : 0;
      if (save.mult < MULT_MAX) save.mult++;
      save.coins += bonus;
      for (const m of ms) delete save.prog[m.id];
      save.done = []; save.set++;
      setMsg = `<div class="set-done"><b>${t('setDone')}</b> ${bonus ? t('setCoins', bonus) : t('newMult', save.mult)}</div>`;
      setTimeout(() => audio.play('mission'), 900);
    }
    save.at = Date.now(); store.set(save);
    if (record) setTimeout(() => audio.play('record'), 500);
    const runInfo = { score, dist, coins, seed: r.seed, t: Math.round(r.p.t) };
    const shown = missionList(null);
    $('.rush-over').innerHTML = `<div class="over-card">
      <h2>${t('caught')}</h2>
      <p class="over-remark">💬 ${remark()}</p>
      <div class="over-score${record ? ' is-record' : ''}"><span>${t('score')}</span><b>${fmtN(score)}</b>${record ? `<em>★ ${t('record')}</em>` : `<small>${t('best')}: ${fmtN(save.best)}</small>`}</div>
      <div class="over-stats"><div><span>${t('distance')}</span><b>${fmtN(dist)} m</b></div><div><span>${t('earned')}</span><b>${coinIcon}${fmtN(coins)}</b></div><div><span>${t('coins')}</span><b>${coinIcon}${fmtN(save.coins)}</b></div></div>
      ${setMsg}
      <div class="over-cols"><div><h3>${t('missions')}</h3>${shown}</div><div><h3>${t('colleagues')}</h3><div class="over-board">${boardList(null)}</div></div></div>
      <div class="over-actions"><button class="rb gold play" type="button" data-again>↻ ${t('again')}</button><button class="rb" type="button" data-menu>${t('menu')}</button></div>
    </div>`;
    const res = await push(runInfo);
    if (screen === 'over' && res !== undefined) { const b = $('.over-board'); if (b) b.innerHTML = boardList(null); }
  }

  // ------------------------------------------------------------ controls
  // one swipe = one move, decided as soon as the finger has moved far enough
  const touch = new Map();
  // event times share performance.now()'s clock in current browsers
  const stamp = e => (e.timeStamp > 0 && e.timeStamp <= performance.now() + 1 ? e.timeStamp : performance.now());
  let lastTap = { t: 0, x: 0, y: 0 };
  const onDown = e => {
    if (e.target.closest('button, .rush-sheet, .rush-menu, .rush-over, .rush-pause, label, input')) return;
    if (screen === 'intro') { skipIntro(); return; }
    if (screen !== 'run') return;
    touch.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, done: false });
    e.preventDefault();
  };
  const onMove = e => {
    const s = touch.get(e.pointerId);
    if (!s || s.done) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y, min = Math.max(18, Math.min(innerWidth, innerHeight) * 0.045);
    if (Math.hypot(dx, dy) < min) return;
    s.done = true;
    input(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'), stamp(e));
    e.preventDefault();
  };
  const onUp = e => {
    const s = touch.get(e.pointerId);
    touch.delete(e.pointerId);
    if (!s || s.done || screen !== 'run') return;
    if (e.timeStamp - s.t < 300 && Math.hypot(e.clientX - s.x, e.clientY - s.y) < 16) {
      if (e.timeStamp - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 60) { input('tray', stamp(e)); lastTap.t = 0; }
      else lastTap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };
  const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowDown: 'down', KeyS: 'down', KeyE: 'tray' };
  const onKey = e => {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;
    if ((e.code === 'Escape' || e.code === 'KeyP') && (screen === 'run')) { setPaused(!paused); e.preventDefault(); return; }
    if (screen === 'intro' && (KEYS[e.code] || e.code === 'Enter' || e.code === 'Escape')) { skipIntro(); e.preventDefault(); return; }
    const a = KEYS[e.code];
    if (!a || screen !== 'run') {
      if ((e.code === 'Enter' || e.code === 'Space') && screen === 'over' && !e.repeat) { e.preventDefault(); play(); }
      return;
    }
    e.preventDefault();
    if (!e.repeat) input(a, stamp(e));
  };
  // sound may start from the first touch or key on
  const unlockAudio = () => audio.unlock();
  el.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  el.addEventListener('pointerdown', onDown, { passive: false });
  el.addEventListener('pointermove', onMove, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', e => touch.delete(e.pointerId));
  el.addEventListener('touchmove', e => { if (!e.target.closest('.rush-sheet, .over-card, .sheet-card')) e.preventDefault(); }, { passive: false });
  el.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('keydown', onKey);
  const onVis = () => { if (document.hidden) { setPaused(true); audio.pause(true); } else if (screen !== 'run' || !paused) audio.pause(false); };
  document.addEventListener('visibilitychange', onVis);
  const onBlur = () => setPaused(true);
  window.addEventListener('blur', onBlur);
  const onResize = () => view.resize();
  window.addEventListener('resize', onResize);

  // clicks on the screens' buttons
  el.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-play]')) { audio.play('click'); play(); }
    else if (b.matches('[data-again]')) { audio.play('click'); play(); }
    else if (b.matches('[data-menu]')) { audio.play('click'); paused = false; audio.pause(false); run = null; view.attach(null); renderMenu(); }
    else if (b.matches('[data-resume]')) { audio.play('click'); setPaused(false); }
    else if (b.matches('[data-restart]')) { audio.play('click'); paused = false; audio.pause(false); play(); }
    else if (b.matches('.hud-pause')) setPaused(true);
    else if (b.matches('[data-sheet]')) { audio.unlock(); audio.play('click'); sheet(b.dataset.sheet); }
    else if (b.matches('[data-exit]')) close();
  });

  // ------------------------------------------------------------ the loop
  let raf = 0, alive = true, overT = 0, remarkT = 20;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - (lastFrame || now)) / 1000));
    lastFrame = now;
    if (screen === 'intro') {
      intro += dt;
      view.frame(dt, Math.min(intro, view.INTRO));
      if (intro >= view.INTRO) beginRun();
      return;
    }
    if (screen === 'run' && run) {
      if (paused) return;
      stepRun(now);
      handleEvents();
      updateHud();
      audio.tick(dt);
      if (run.state === 'run' && !run.inTutorial()) {
        remarkT -= dt;
        // never on top of another remark: wait until it is gone
        if (remarkT <= 0 && !el.querySelector('.rt.fortune')) { remarkT = 90 + Math.random() * 60; toast(`💬 ${remark()}`, 'fortune'); }
      }
      view.frame(dt * slow);
      if (run.state === 'over') { overT += dt; if (overT > 0.4) { overT = 0; gameOver(); } }
      return;
    }
    view.frame(dt);
  }
  raf = requestAnimationFrame(frame);

  function close() {
    alive = false; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey); window.removeEventListener('keydown', unlockAudio); window.removeEventListener('blur', onBlur); window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVis);
    audio.close(); view.dispose();
    root.innerHTML = '';
    onExit();
  }

  renderMenu();
  loadServer();
  return {
    close,
    // for tests: the run, the save and the screen
    debug: () => ({ run, save, screen, paused, slow, view }),
  };
}
