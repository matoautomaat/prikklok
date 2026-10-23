'use strict';

/* Nederlands — the course in the Nederlands tab: 18 units from A1 to B1, the
   restaurant first (what a waiter says every evening), then daily life, then
   what a Flemish art school asks for. Explanations are in Chinese.
   Exercises get harder unit by unit (tier 1 to 4): from picking the meaning,
   to building sentences, to typing, speaking and writing what you hear.
   Dutch is spoken by the phone (speechSynthesis, a Flemish voice when there is
   one) and heard by it (SpeechRecognition) where the phone can.
   Progress is a small JSON object, saved by app.js (save_learning). */

const Dutch = (() => {
  // [Dutch, Chinese, tip in Chinese]. "a|b": both are right, the first is shown.
  // {naam} becomes the learner's name.
  const UNITS = [
    { id: 'hallo', cefr: 'A1', tier: 1, nl: 'Hallo!', zh: '打招呼',
      tip: '在弗拉芒（比利时荷语区），见面和告别都可以说 <b>Dag!</b>。对客人用 <b>u</b>（您），对同事和朋友用 <b>je</b>（你）。',
      items: [
        ['Hallo!', '你好！'],
        ['Dag!', '你好！/ 再见！', '弗拉芒人见面和告别都说 Dag。'],
        ['Goeiedag!|Goedendag!|Goededag!', '您好！（白天）', '弗拉芒口语常说 Goeiedag。'],
        ['Goeiemorgen!|Goedemorgen!', '早上好！'],
        ['Goeienavond!|Goedenavond!', '晚上好！'],
        ['Tot ziens!', '再见！'],
        ['Tot straks!', '待会儿见！'],
        ['Tot morgen!', '明天见！'],
        ['Hoe gaat het?', '你好吗？'],
        ['Goed, dank u.', '很好，谢谢您。'],
        ['Dank u wel.', '非常感谢。'],
        ['Merci!', '谢谢！', '比利时人也常用法语的 Merci。'],
        ['Alstublieft.', '请。/ 给您。', '把东西递给客人时说 Alstublieft。'],
        ['Sorry.', '对不起。'],
        ['Ja.', '是。/ 对。'],
        ['Nee.', '不。/ 不是。'],
      ] },
    { id: 'welkom', cefr: 'A1', tier: 1, nl: 'Welkom!', zh: '欢迎光临',
      tip: '对客人一律用 <b>u</b>（您）：<b>Wat wilt u drinken?</b>。<b>maar</b> 在 <b>Volg mij maar</b> 里不是“但是”，而是让语气更客气、更随和。',
      items: [
        ['Welkom!', '欢迎光临！'],
        ['Voor hoeveel personen?', '请问几位？'],
        ['Een tafel voor twee?', '两位的桌子吗？'],
        ['Heeft u gereserveerd?', '您预订了吗？'],
        ['Volg mij maar.', '请跟我来。'],
        ['Neem maar plaats.', '请坐。'],
        ['Hier is de menukaart.', '这是菜单。'],
        ['Wat wilt u drinken?', '您想喝点什么？'],
        ['Wat mag het zijn?', '您要点什么？', '弗拉芒服务员最常用的点单句。'],
        ['Bent u klaar om te bestellen?', '您准备好点菜了吗？'],
        ['Smakelijk!|Smakelijk eten!', '请慢用！', '上菜时说，意思是“祝您用餐愉快”。'],
        ['Is alles naar wens?', '一切都满意吗？'],
        ['Nog iets?', '还要别的吗？'],
      ] },
    { id: 'getallen', cefr: 'A1', tier: 1, nl: 'Getallen', zh: '数字和价钱',
      tip: '价钱这样说：8,50 欧 = <b>acht euro vijftig</b>。比利时用逗号表示小数：8,50。',
      items: [
        ['één|een', '一 (1)'], ['twee', '二 (2)'], ['drie', '三 (3)'], ['vier', '四 (4)'], ['vijf', '五 (5)'],
        ['zes', '六 (6)'], ['zeven', '七 (7)'], ['acht', '八 (8)'], ['negen', '九 (9)'], ['tien', '十 (10)'],
        ['elf', '十一 (11)'], ['twaalf', '十二 (12)'], ['vijftien', '十五 (15)'], ['twintig', '二十 (20)'],
        ['vijftig', '五十 (50)'], ['honderd', '一百 (100)'],
        ['Hoeveel kost dat?', '这个多少钱？'],
        ['Dat is twaalf euro.', '一共十二欧元。'],
        ['Dat is acht euro vijftig.', '一共八欧元五十（8,50 欧）。'],
        ['Tafel zeven.', '七号桌。'],
      ] },
    { id: 'eten', cefr: 'A1', tier: 1, nl: 'Eten en drinken', zh: '吃的和喝的',
      tip: '名词前面有冠词 <b>de</b> 或 <b>het</b>。背单词时连冠词一起背：<b>het water</b>、<b>de thee</b>。',
      items: [
        ['het water', '水'],
        ['plat water', '无气矿泉水'],
        ['bruisend water', '气泡水'],
        ['de cola', '可乐'],
        ['het bier', '啤酒'],
        ['de wijn', '葡萄酒'],
        ['de thee', '茶'],
        ['de koffie', '咖啡'],
        ['de rijst', '米饭'],
        ['de soep', '汤'],
        ['de kip', '鸡肉'],
        ['het rundvlees', '牛肉'],
        ['het varkensvlees', '猪肉'],
        ['de scampi', '大虾', '比利时餐馆的菜单上大虾叫 scampi。'],
        ['de groenten', '蔬菜'],
        ['de loempia', '春卷'],
        ['het dessert', '甜点'],
        ['pikant', '辣的'],
        ['zoet', '甜的'],
        ['zuur', '酸的'],
      ] },
    { id: 'betalen', cefr: 'A1', tier: 2, nl: 'Bestellen en betalen', zh: '点单和结账',
      tip: '<b>zo</b> 在 <b>Ik kom zo</b> 里是“马上”。<b>het bonnetje</b> 是小票：以 <b>-je</b> 结尾的词都用 <b>het</b>。',
      items: [
        ['Wilt u nog iets drinken?', '您还想喝点什么吗？'],
        ['Ik kom zo.', '我马上来。'],
        ['Een momentje, alstublieft.', '请稍等一下。'],
        ['Het eten komt eraan.', '菜马上就来。'],
        ['Pas op, het bord is heet.', '小心，盘子很烫。'],
        ['Hier opeten of meenemen?', '在这里吃还是带走？'],
        ['De rekening, alstublieft.', '请结账。', '这是客人会对你说的话。'],
        ['Samen of apart?', '一起付还是分开付？'],
        ['Cash of met de kaart?', '付现金还是刷卡？'],
        ['U mag uw kaart insteken.', '您可以插卡了。'],
        ['Wilt u het bonnetje?', '您要小票吗？'],
        ['Nog een fijne avond!', '祝您晚上愉快！'],
      ] },
    { id: 'ikzelf', cefr: 'A1', tier: 2, nl: 'Over mezelf', zh: '介绍自己',
      tip: '听不懂的时候别怕，直接说 <b>Kunt u wat trager praten?</b>，比利时人会很乐意放慢速度。',
      items: [
        ['Ik heet {naam}.', '我叫 {naam}。'],
        ['Ik kom uit China.', '我来自中国。'],
        ['Ik werk in Torhout.', '我在托尔豪特（Torhout）工作。'],
        ['Ik werk in een restaurant.', '我在一家餐厅工作。'],
        ['Ik ben serveerster.', '我是服务员。'],
        ['Ik leer Nederlands.', '我在学荷兰语。'],
        ['Ik spreek een beetje Nederlands.', '我会说一点荷兰语。'],
        ['Ik begrijp het niet.', '我不明白。'],
        ['Kunt u dat herhalen?', '您能再说一遍吗？'],
        ['Kunt u wat trager praten?|Kunt u wat langzamer praten?', '您能说慢一点吗？'],
        ['Wat betekent dat?', '那是什么意思？'],
        ['Hoe zeg je dat in het Nederlands?', '这个用荷兰语怎么说？'],
      ] },
    { id: 'tijd', cefr: 'A1', tier: 2, nl: 'Dagen en uren', zh: '星期和时间',
      tip: '注意！<b>half zeven</b> 不是七点半，而是 <b>六点半</b>：意思是“离七点还差一半”。<b>half twaalf</b> = 11:30。',
      items: [
        ['maandag', '星期一'], ['dinsdag', '星期二'], ['woensdag', '星期三'], ['donderdag', '星期四'],
        ['vrijdag', '星期五'], ['zaterdag', '星期六'], ['zondag', '星期日'],
        ['vandaag', '今天'], ['morgen', '明天'], ['gisteren', '昨天'],
        ['Hoe laat is het?', '现在几点？'],
        ['Het is drie uur.', '现在三点。'],
        ['Het is half zeven.', '现在六点半。', 'half zeven = 6:30，不是 7:30！'],
        ['We zijn op dinsdag gesloten.', '我们星期二不营业。'],
        ['We gaan open om half twaalf.', '我们十一点半开门。'],
        ['Tot vrijdag!', '星期五见！'],
      ] },
    { id: 'zijn', cefr: 'A1', tier: 2, nl: 'Zijn en hebben', zh: '“是”和“有”',
      tip: '<b>zijn</b>（是）：ik ben, je bent, hij/zij is, we zijn, u bent。<b>hebben</b>（有）：ik heb, je hebt, hij heeft, we hebben。荷兰语说“我有饿”：<b>Ik heb honger</b>。',
      items: [
        ['ik ben', '我是'], ['je bent|jij bent', '你是'], ['hij is', '他是'], ['ze is|zij is', '她是'],
        ['we zijn|wij zijn', '我们是'], ['u bent', '您是'],
        ['ik heb', '我有'], ['je hebt|jij hebt', '你有'], ['hij heeft', '他有'], ['we hebben|wij hebben', '我们有'],
        ['Ik ben moe.', '我累了。'],
        ['Ik heb honger.', '我饿了。'],
        ['Ik heb dorst.', '我渴了。'],
        ['Heeft u een reservatie?', '您有预订吗？', '比利时说 reservatie，荷兰说 reservering。'],
        ['We zijn vol.', '我们客满了。'],
      ] },
    { id: 'dehet', cefr: 'A1', tier: 2, nl: 'De of het?', zh: 'de 还是 het？',
      tip: '大约三分之二的名词用 <b>de</b>。<b>复数一律用 de</b>（de stokjes）。以 <b>-je</b> 结尾的小称词一律用 <b>het</b>（het bonnetje）。其他的只能背。',
      items: [
        ['de tafel', '桌子'], ['de stoel', '椅子'], ['het bord', '盘子'], ['het glas', '杯子'],
        ['de vork', '叉子'], ['het mes', '刀'], ['de lepel', '勺子'], ['de stokjes', '筷子'],
        ['het servet', '餐巾'], ['de keuken', '厨房'], ['het restaurant', '餐厅'], ['de klant', '客人'],
        ['de kok', '厨师'], ['het menu', '套餐'], ['de fles', '瓶子'],
      ] },
    { id: 'stad', cefr: 'A2', tier: 3, nl: 'In de stad', zh: '在城里',
      tip: '问路：<b>Waar is …?</b>（…在哪里？）。买票：<b>Een ticket naar …, alstublieft.</b>',
      items: [
        ['de winkel', '商店'], ['de supermarkt', '超市'], ['de apotheek', '药店'], ['de dokter', '医生'],
        ['het station', '火车站'], ['de bus', '公交车'], ['de trein', '火车'], ['de bakker', '面包店'],
        ['Waar is het station?', '火车站在哪里？'],
        ['Ik zoek de apotheek.', '我在找药店。'],
        ['Een ticket naar Brugge, alstublieft.', '请给我一张去布鲁日的票。'],
        ['Ik kom een pakje ophalen.', '我来取包裹。'],
        ['Mag ik met de kaart betalen?', '我可以刷卡吗？'],
        ['Is het ver?', '远吗？'],
        ['Het is hier om de hoek.', '就在拐角那里。'],
      ] },
    { id: 'woordvolgorde', cefr: 'A2', tier: 3, nl: 'Het werkwoord op twee', zh: '动词放第二位',
      tip: '荷兰语最重要的规则：主句里<b>动词永远在第二位</b>。<br><b>Ik</b> werk vandaag. → <b>Vandaag</b> werk <b>ik</b>.<br>如果句子用时间或地点开头，主语就跑到动词后面。',
      items: [
        ['Ik werk vandaag.', '我今天上班。'],
        ['Vandaag werk ik.', '今天我上班。'],
        ['Morgen ben ik vrij.', '明天我休息。'],
        ['Na het werk leer ik Nederlands.', '下班后我学荷兰语。'],
        ['In het weekend is het druk.', '周末很忙。'],
        ['Om vijf uur begint mijn shift.', '我的班五点开始。'],
        ['Op maandag ga ik naar de markt.', '星期一我去市场。'],
        ['Daarna drink ik een tas thee.', '然后我喝一杯茶。', '弗拉芒说 een tas thee，荷兰说 een kop thee。'],
        ['Soms fiets ik naar het werk.', '有时候我骑车去上班。'],
        ['Nu heb ik even pauze.', '现在我休息一下。'],
      ] },
    { id: 'problemen', cefr: 'A2', tier: 3, nl: 'Problemen oplossen', zh: '处理问题',
      tip: '客人不满意时先说 <b>Het spijt me</b>（很抱歉），再说你会怎么做：<b>Ik vraag het aan de kok.</b>',
      items: [
        ['Het spijt me.', '很抱歉。'],
        ['Excuseer, ik had u niet gezien.', '不好意思，我刚才没看到您。', '比利时常说 Excuseer。'],
        ['Ik breng een nieuw bord.', '我给您拿一个新盘子。'],
        ['Ik vraag het aan de kok.', '我去问一下厨师。'],
        ['Heeft u allergieën?', '您有过敏吗？'],
        ['Er zitten noten in.', '这里面有坚果。'],
        ['Dit gerecht is vegetarisch.', '这道菜是素的。'],
        ['Is het niet te pikant?', '会不会太辣？'],
        ['De keuken kan het minder pikant maken.', '厨房可以做得不那么辣。'],
        ['Het duurt nog tien minuten.', '还要十分钟。'],
        ['De toiletten zijn achteraan rechts.', '洗手间在里面右边。'],
      ] },
    { id: 'telefoon', cefr: 'A2', tier: 3, nl: 'Aan de telefoon', zh: '接电话',
      tip: '接电话先说店名再问好：<b>Chen\'s Garden, goeiedag.</b> 名字听不清就问 <b>Kunt u dat spellen?</b>',
      items: [
        ['Chen\'s Garden, goeiedag.|Chen\'s Garden, goedendag.', '这里是 Chen\'s Garden，您好。'],
        ['Wilt u reserveren of afhalen?', '您是要订位还是外带？'],
        ['Voor wanneer?', '哪一天？'],
        ['Om hoe laat?', '几点？'],
        ['Op welke naam?', '用什么名字？'],
        ['Wat is uw telefoonnummer?', '您的电话号码是多少？'],
        ['Kunt u dat spellen?', '您能拼一下吗？'],
        ['Het is klaar over twintig minuten.', '二十分钟后好。'],
        ['Uw bestelling is klaar.', '您点的东西好了。'],
        ['Tot straks, dag!', '待会儿见，再见！'],
      ] },
    { id: 'verleden', cefr: 'A2', tier: 3, nl: 'Wat heb je gedaan?', zh: '说过去的事',
      tip: '过去的事：<b>hebben/zijn + 过去分词</b>，分词放在句子最后。<br>Ik <b>heb</b> gewerkt. Ik <b>ben</b> naar Brugge <b>gegaan</b>.<br>表示移动（gaan, komen）多用 <b>zijn</b>。',
      items: [
        ['Ik heb gewerkt.', '我工作了。'],
        ['Ik heb al gegeten.', '我已经吃过了。'],
        ['Ik heb goed geslapen.', '我睡得很好。'],
        ['Wat heb je gisteren gedaan?', '你昨天做了什么？'],
        ['Ik ben naar Brugge gegaan.', '我去了布鲁日。'],
        ['We hebben veel klanten gehad.', '我们来了很多客人。'],
        ['Het was druk.', '那时候很忙。'],
        ['Ik was moe.', '我那时候很累。'],
        ['Ik heb een tekening gemaakt.', '我画了一幅画。'],
        ['Hij is te laat gekomen.', '他来晚了。'],
      ] },
    { id: 'bijzin', cefr: 'B1', tier: 4, nl: 'Omdat, dat, als', zh: '从句：动词放最后',
      tip: '在 <b>omdat</b>（因为）、<b>dat</b>、<b>als</b>（如果）、<b>of</b>（是否）、<b>wanneer</b> 后面，<b>动词放在最后</b>。<br><b>want</b> 也是“因为”，但后面语序不变。<br>…omdat ik in België <b>woon</b>. / …want ik <b>woon</b> in België.',
      items: [
        ['Ik leer Nederlands omdat ik in België woon.', '我学荷兰语，因为我住在比利时。'],
        ['Ik leer Nederlands want ik woon in België.', '我学荷兰语，因为我住在比利时。（want：语序不变）'],
        ['Ik denk dat het een goed idee is.', '我觉得这是个好主意。'],
        ['Als het druk is, werk ik langer.', '如果很忙，我就多做一会儿。'],
        ['Ik weet niet of hij vandaag komt.', '我不知道他今天来不来。'],
        ['Wanneer ik vrij ben, ga ik tekenen.', '我有空的时候就去画画。'],
        ['Ze zegt dat de keuken dicht is.', '她说厨房已经关了。'],
        ['Ik bel je als ik klaar ben.', '我好了就给你打电话。'],
      ] },
    { id: 'kunst', cefr: 'B1', tier: 4, nl: 'Naar de kunstschool', zh: '去艺术学校',
      tip: '弗拉芒的艺术学院入学一般要考 <b>toelatingsproef</b>（入学考试），并带上 <b>portfolio</b>（作品集）。面试时多用 <b>Mijn werk gaat over …</b> 介绍自己。',
      items: [
        ['de kunstacademie', '艺术学院'],
        ['het portfolio', '作品集'],
        ['tekenen', '画画（素描）'],
        ['schilderen', '画画（上色、油画）'],
        ['het schilderij', '一幅画'],
        ['de tekening', '素描、图画'],
        ['de toelatingsproef', '入学考试'],
        ['Ik wil me inschrijven.', '我想报名。'],
        ['Wanneer is de toelatingsproef?', '入学考试是什么时候？'],
        ['Ik teken al sinds ik klein was.', '我从小就画画。'],
        ['Mijn werk gaat over herinneringen.', '我的作品是关于回忆的。'],
        ['Ik haal inspiratie uit de natuur.', '我的灵感来自大自然。'],
        ['Ik werk graag met inkt en papier.', '我喜欢用墨水和纸创作。'],
        ['Kan ik mijn portfolio online insturen?', '我可以在网上提交作品集吗？'],
      ] },
    { id: 'mening', cefr: 'B1', tier: 4, nl: 'Je mening geven', zh: '表达观点',
      tip: '<b>Ik vind</b> + 形容词：Ik vind het mooi。<b>Volgens mij</b> = 我认为。同意：<b>Ik ben het met je eens</b>。',
      items: [
        ['Ik vind het mooi.', '我觉得它很美。'],
        ['Volgens mij klopt dat niet.', '我认为那不对。'],
        ['Ik ben het met je eens.', '我同意你。'],
        ['Ik ben het er niet mee eens.', '我不同意。'],
        ['Dat hangt ervan af.', '那要看情况。'],
        ['Aan de ene kant is het duur, aan de andere kant is het goed.', '一方面它很贵，另一方面它很好。'],
        ['Kunt u dat uitleggen?', '您能解释一下吗？'],
        ['Wat bedoelt u daarmee?', '您这是什么意思？'],
        ['Daar heb ik nog nooit over nagedacht.', '这个我从来没想过。'],
        ['Dat is een goede vraag.', '这是个好问题。'],
      ] },
    { id: 'afspraak', cefr: 'B1', tier: 4, nl: 'Afspraken en e-mails', zh: '预约和写邮件',
      tip: '正式邮件开头 <b>Beste mevrouw …</b> / <b>Beste meneer …</b>，结尾 <b>Met vriendelijke groeten</b>。',
      items: [
        ['Beste mevrouw Peeters,', '尊敬的 Peeters 女士：'],
        ['Ik schrijf u omdat ik informatie wil.', '我写信给您，是因为我想了解一些信息。'],
        ['Kan ik de afspraak verplaatsen?', '我可以改约时间吗？'],
        ['Ik ben ziek, ik kan vandaag niet komen.', '我生病了，今天来不了。'],
        ['Past dinsdag om tien uur?', '星期二十点可以吗？'],
        ['Ik wacht op uw antwoord.', '我等您的回复。'],
        ['In de bijlage vindt u mijn portfolio.', '附件里是我的作品集。'],
        ['Met vriendelijke groeten', '此致敬礼（信的结尾）'],
        ['Alvast bedankt.', '先谢谢您了。'],
        ['Mag ik u iets vragen?', '我可以问您一件事吗？'],
      ] },
  ];

  // Fun level names for the Dutch level, Dutch and Chinese.
  const LEVELS = [['Nieuwkomer', '新来的'], ['Hallo-zegger', '会说你好'], ['Menulezer', '会看菜单'], ['Bestelbaas', '点单高手'],
    ['Babbelaar', '小话匣子'], ['Frietkotkenner', '薯条摊行家'], ['Marktganger', '逛市场达人'], ['Treinreiziger', '火车旅行家'],
    ['Goede buur', '好邻居'], ['Verhalenverteller', '故事大王'], ['Vlaamse tong', '弗拉芒舌头'], ['Taalheld', '语言英雄'],
    ['Woordkunstenaar', '文字艺术家'], ['Bijna Belg', '准比利时人'], ['Echte Vlaming', '地道弗拉芒人']];
  const levelName = (l, zh) => LEVELS[Math.min(l, LEVELS.length) - 1][zh ? 1 : 0];

  const TIER_NAME = { 1: ['Kennismaken', '认识'], 2: ['Zinnen bouwen', '造句'], 3: ['Zelf schrijven en spreken', '自己写、自己说'], 4: ['Zonder hulp', '不靠提示'] };

  /* ------------------------------------------------------------ items */

  let NAME = '';
  const fill = s => s.replace(/\{naam\}/g, NAME || 'Zu Yi');
  function setName(name) { NAME = String(name || '').trim(); }

  // Every item once, with its unit; key = the Dutch as written (also for progress).
  const ITEMS = [];
  UNITS.forEach((u, ui) => {
    u.index = ui;
    u.list = u.items.map(([nl, zh, note]) => {
      const it = { key: nl.split('|')[0], raw: nl, zh, note, unit: u };
      const words = it.key.split(/\s+/);
      it.noun = /^(de|het) [^\s]+$/.test(it.key) && !/[.!?]$/.test(it.key);
      it.sentence = words.length >= 3 || /[.!?,]$/.test(it.key);
      ITEMS.push(it);
      return it;
    });
  });
  const nl = it => fill(it.key);
  const answers = it => it.raw.split('|').map(fill);
  const zh = it => fill(it.zh);

  // Lessons of five to seven items, then the unit test.
  const LESSON_SIZE = 6;
  function lessonsOf(u) {
    if (u.lessons) return u.lessons;
    const n = Math.max(1, Math.round(u.list.length / LESSON_SIZE)), per = Math.ceil(u.list.length / n), out = [];
    for (let i = 0; i < n; i++) out.push({ id: `${u.id}-${i + 1}`, n: i + 1, unit: u, items: u.list.slice(i * per, (i + 1) * per) });
    out.push({ id: `${u.id}-t`, n: n + 1, unit: u, test: true, items: u.list });
    u.lessons = out;
    return out;
  }
  const unitById = id => UNITS.find(u => u.id === id);
  function lessonById(id) {
    const u = unitById(String(id).replace(/-(\d+|t)$/, ''));
    return u ? lessonsOf(u).find(l => l.id === id) : null;
  }

  /* --------------------------------------------------------- progress */

  // { v, done: {lessonId: stars}, words: {key: {b: box, d: due day}}, log: {day: lessons}, goal, slow }
  function blank() { return { v: 1, done: {}, words: {}, log: {}, goal: 1 }; }
  function clean(p) {
    const b = blank();
    if (!p || typeof p !== 'object') return b;
    return { ...b, ...p, done: p.done || {}, words: p.words || {}, log: p.log || {} };
  }
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayNum = (d = new Date()) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);

  const unitDone = (p, u) => !!p.done[`${u.id}-t`];
  const unitOpen = (p, u) => u.index === 0 || unitDone(p, UNITS[u.index - 1]);
  function lessonOpen(p, l) {
    if (!unitOpen(p, l.unit)) return false;
    const ls = lessonsOf(l.unit), i = ls.indexOf(l);
    if (l.test) return ls.slice(0, -1).every(x => p.done[x.id]);
    return i === 0 || !!p.done[ls[i - 1].id];
  }
  // The first open lesson not done yet; after everything, null.
  function nextLesson(p) {
    for (const u of UNITS) {
      if (!unitOpen(p, u)) return null;
      for (const l of lessonsOf(u)) if (!p.done[l.id] && lessonOpen(p, l)) return l;
    }
    return null;
  }
  // The first locked unit: its test can be taken to skip it.
  const skippable = p => UNITS.find(u => !unitOpen(p, u)) || null;
  const unitProgress = (p, u) => { const ls = lessonsOf(u); return ls.filter(l => p.done[l.id]).length / ls.length; };

  function streak(p) {
    let n = 0, d = new Date();
    if (!p.log[dayKey(d)]) d.setDate(d.getDate() - 1); // today not done yet: the streak still counts up to yesterday
    while (p.log[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  const today = p => p.log[dayKey()] || 0;
  // Words seen before that are due again, weakest first.
  function due(p) {
    const t = dayNum(), seen = ITEMS.filter(it => p.words[it.key]);
    return seen.filter(it => p.words[it.key].d <= t).sort((a, b) => p.words[a.key].b - p.words[b.key].b || p.words[a.key].d - p.words[b.key].d);
  }
  const GAPS = [1, 2, 4, 8, 16, 35];
  function mark(p, it, ok) {
    const w = p.words[it.key] || { b: 0, d: 0 };
    w.b = ok ? Math.min(GAPS.length - 1, w.b + (p.words[it.key] ? 1 : 0)) : 0;
    w.d = dayNum() + (ok ? GAPS[w.b] : 0);
    p.words[it.key] = w;
  }
  function logLesson(p) {
    const k = dayKey();
    p.log[k] = (p.log[k] || 0) + 1;
    const keep = Object.keys(p.log).sort().slice(-120); // four months is enough for the streak
    p.log = Object.fromEntries(keep.map(d => [d, p.log[d]]));
  }
  const known = p => ITEMS.filter(it => p.words[it.key] && p.words[it.key].b >= 2).length;
  // The highest level whose units are all done ('A0': none yet). The units follow
  // the CEFR topics; it is not an official exam level.
  const cefrNow = p => ['B1', 'A2', 'A1'].find(c => UNITS.filter(u => u.cefr === c).every(u => unitDone(p, u))) || 'A0';

  /* ------------------------------------------------------- answers */

  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’`]/g, "'").replace(/[.,!?;:¿¡"“”()]/g, ' ').replace(/\s+/g, ' ').trim();
  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // Typed: right, right with a small typo, or wrong.
  function checkTyped(input, it) {
    const got = norm(input);
    if (!got) return { ok: false };
    let best = Infinity;
    for (const a of answers(it)) {
      const want = norm(a);
      if (got === want) return { ok: true };
      best = Math.min(best, lev(got, want));
    }
    const len = norm(nl(it)).length, allowed = len >= 16 ? 2 : len >= 6 ? 1 : 0;
    return best <= allowed ? { ok: true, typo: true } : { ok: false };
  }
  // Spoken: the phone writes numbers as digits and drops punctuation, so compare the words.
  const DIGITS = { 0: 'nul', 1: 'een', 2: 'twee', 3: 'drie', 4: 'vier', 5: 'vijf', 6: 'zes', 7: 'zeven', 8: 'acht', 9: 'negen', 10: 'tien',
    11: 'elf', 12: 'twaalf', 15: 'vijftien', 20: 'twintig', 50: 'vijftig', 100: 'honderd' };
  const spokenWords = s => norm(String(s).replace(/\b\d+\b/g, d => DIGITS[d] || d)).split(' ').filter(Boolean);
  function checkSpoken(heard, it) {
    let best = 0;
    for (const h of heard) for (const a of answers(it)) {
      const want = spokenWords(a), got = spokenWords(h);
      if (!want.length) continue;
      const pool = [...got];
      let hit = 0;
      for (const w of want) {
        const i = pool.findIndex(g => g === w || (w.length > 4 && lev(g, w) <= 1));
        if (i >= 0) { hit++; pool.splice(i, 1); }
      }
      best = Math.max(best, hit / want.length);
    }
    return { ok: best >= 0.75, score: best };
  }
  // Word tiles: the sentence without its last punctuation.
  const tilesOf = s => s.replace(/[.!?]+$/, '').split(/\s+/);
  const checkBuilt = (words, it) => answers(it).some(a => norm(words.join(' ')) === norm(a));

  /* ------------------------------------------------------ exercises */

  const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
  const pickN = (a, n) => shuffle(a).slice(0, n);

  // Wrong answers that look alike: same unit and same kind first, then the units
  // around it. Never one that means the same (你好！ and 你好！/ 再见！).
  const parts = s => s.replace(/[（(][^）)]*[）)]/g, '').split('/').map(x => x.trim()).filter(Boolean);
  const clash = (a, b) => nl(a) === nl(b) || parts(zh(a)).some(x => parts(zh(b)).includes(x));
  function distractors(it, n) {
    const same = x => x !== it && x.sentence === it.sentence && x.noun === it.noun;
    const near = shuffle(it.unit.list.filter(same));
    const far = shuffle(ITEMS.filter(x => x.unit !== it.unit && Math.abs(x.unit.index - it.unit.index) <= 2 && same(x)));
    const out = [];
    for (const x of [...near, ...far, ...shuffle(ITEMS)]) {
      if (out.length >= n) break;
      if (x !== it && !clash(x, it) && !out.some(o => clash(o, x))) out.push(x);
    }
    return out;
  }
  function extraTiles(it, n) {
    const mine = new Set(tilesOf(nl(it)).map(w => w.toLowerCase()));
    const pool = ITEMS.filter(x => x.sentence && x !== it).flatMap(x => tilesOf(nl(x))).filter(w => !mine.has(w.toLowerCase()));
    return pickN([...new Set(pool)], n);
  }

  // What a tier may ask, with weights; type and speak only when the phone can.
  function typesFor(it, tier, { test = false, speech = false, listen = true } = {}) {
    const t = [];
    const add = (type, w) => { for (let i = 0; i < w; i++) t.push(type); };
    const words = tilesOf(nl(it)).length;
    if (tier === 1) { add('pickZh', 3); add('pickNl', 3); if (listen) add('listen', 2); }
    if (tier === 2) {
      add('pickZh', 1); add('pickNl', 2); if (listen) add('listen', 2);
      if (it.sentence && words >= 3) add('build', 4);
      if (it.noun) add('dehet', 3);
      if (!it.sentence && test) add('type', 2);
    }
    if (tier === 3) {
      add('pickNl', 1); if (listen) add('listen', 1);
      if (it.sentence && words >= 3) add('build', 3);
      if (it.noun) add('dehet', 2);
      add('type', it.sentence ? 2 : 3);
      if (speech) add('speak', 2);
    }
    if (tier === 4) {
      if (listen) add('listen', 1);
      if (it.sentence && words >= 3) add('build', 3);
      if (it.noun) add('dehet', 1);
      add('type', 3);
      if (listen) add('dictation', it.sentence ? 2 : 1);
      if (speech) add('speak', 2);
    }
    if (test) return t.filter(x => x !== 'pickZh').length ? t.filter(x => x !== 'pickZh') : t;
    return t;
  }

  function exercise(type, it, tier) {
    const ex = { type, item: it, tier };
    if (type === 'pickZh') ex.choices = shuffle([it, ...distractors(it, 3)]);
    if (type === 'pickNl' || type === 'listen') ex.choices = shuffle([it, ...distractors(it, 3)]);
    if (type === 'build') ex.tiles = shuffle([...tilesOf(nl(it)), ...extraTiles(it, tier >= 3 ? 3 : tier === 2 ? 1 : 0)]);
    if (type === 'dehet') ex.answer = nl(it).split(' ')[0];
    return ex;
  }

  // A lesson: new words first as cards, then two exercises per word, mixed.
  function makeLesson(lesson, p, opts) {
    const tier = lesson.unit.tier, out = [];
    if (!lesson.test) lesson.items.filter(it => !p.words[it.key]).forEach(it => out.push({ type: 'intro', item: it, tier }));
    const items = lesson.test ? pickN(lesson.items, Math.min(12, lesson.items.length)) : lesson.items;
    const rounds = lesson.test ? 1 : 2, list = [];
    for (let r = 0; r < rounds; r++) {
      for (const it of items) {
        const types = typesFor(it, tier, { ...opts, test: lesson.test });
        let type = types[Math.floor(Math.random() * types.length)];
        const last = list.filter(e => e.item === it).map(e => e.type);
        for (let tries = 0; last.includes(type) && tries < 6; tries++) type = types[Math.floor(Math.random() * types.length)];
        list.push(exercise(type, it, tier));
      }
    }
    // never the same word twice in a row, if it can be helped
    let mixed = shuffle(list);
    for (let tries = 0; tries < 30 && mixed.some((e, i) => i && e.item === mixed[i - 1].item); tries++) mixed = shuffle(list);
    return out.concat(mixed);
  }
  // Practice: the words due again, at the level of the unit they come from.
  function makeReview(p, opts, n = 10) {
    const list = due(p).slice(0, n);
    if (list.length < n) list.push(...shuffle(ITEMS.filter(it => p.words[it.key] && !list.includes(it))).slice(0, n - list.length));
    return shuffle(list).map(it => {
      const types = typesFor(it, Math.min(it.unit.tier + 1, 4), { ...opts, test: true });
      return exercise(types[Math.floor(Math.random() * types.length)], it, it.unit.tier);
    });
  }

  /* ----------------------------------------------- the phone's voice */

  const voice = { list: [], best: null };
  function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    voice.list = speechSynthesis.getVoices().filter(v => /^nl/i.test(v.lang));
    voice.best = voice.list.find(v => /nl[-_]BE/i.test(v.lang)) || voice.list.find(v => /nl[-_]NL/i.test(v.lang)) || voice.list[0] || null;
  }
  if ('speechSynthesis' in window) {
    loadVoices();
    if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', loadVoices);
  }
  const canSpeak = () => 'speechSynthesis' in window;
  const hasDutchVoice = () => !!voice.best;
  function say(text, { slow = false } = {}) {
    if (!canSpeak()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text).replace(/\|.*/, ''));
    u.lang = voice.best ? voice.best.lang : 'nl-BE';
    if (voice.best) u.voice = voice.best;
    u.rate = slow ? 0.65 : 0.92;
    speechSynthesis.speak(u);
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canHear = () => !!SR;
  // What the phone heard: a few guesses, or an error ('no-speech', 'not-allowed', ...).
  function hear({ onStart } = {}) {
    return new Promise((resolve, reject) => {
      const r = new SR();
      r.lang = 'nl-BE';
      r.interimResults = false;
      r.maxAlternatives = 5;
      let done = false;
      r.onstart = () => onStart && onStart();
      r.onresult = e => { done = true; resolve([...e.results[0]].map(a => a.transcript)); };
      r.onerror = e => { if (!done) { done = true; reject(e.error || 'error'); } };
      r.onend = () => { if (!done) { done = true; resolve([]); } };
      try { r.start(); } catch (e) { reject('busy'); }
      setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, 9000);
    });
  }

  return {
    UNITS, ITEMS, LEVELS, TIER_NAME, levelName, setName, fill, nl, zh, answers,
    lessonsOf, lessonById, unitById, blank, clean, dayKey, unitDone, unitOpen, lessonOpen, nextLesson, skippable, unitProgress,
    streak, today, due, mark, logLesson, known, cefrNow,
    norm, checkTyped, checkSpoken, checkBuilt, tilesOf, makeLesson, makeReview,
    canSpeak, hasDutchVoice, say, canHear, hear,
  };
})();
