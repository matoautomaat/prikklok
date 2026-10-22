# Prikklok

Een app voor je personeel: shiften opnemen, in- en uitklokken, uren bekijken en loonfiches downloaden.

- **Personeel** meldt zich aan met de eigen naam en een pincode. Ze kunnen in- en uitklokken (met een opmerking als ze vroeger weg moeten), open shiften opnemen of teruggeven (met een korte reden, die alleen de verantwoordelijke ziet), zien wie er werkt, en hun uren en verdiensten van de maand bekijken. Klopt een uur niet, of vergaten ze in of uit te klokken, dan sturen ze een aanpassing.
- **Inklokken kan alleen tijdens een eigen shift**, of tot 15 minuten ervoor. Wie zonder shift werkte, voegt de uren toe bij **Mijn uren** en de verantwoordelijke keurt ze goed. Verantwoordelijken kunnen altijd inklokken. Aan- of uitzetten en het aantal minuten kies je bij **Team → Instellingen**.
- **Profiel:** elke medewerker vult bij **Profiel** de eigen gegevens in (telefoon, e-mail, geboortedatum, rijksregisternummer, adres, IBAN, noodcontact), wijzigt de eigen pincode en downloadt de eigen contracten. Het rijksregisternummer en de IBAN worden gecontroleerd op tikfouten.
- **Avatar en levels:** iedereen maakt een eigen cartoon-avatar, als vrouw of als man: huidskleur, ogen, mond, baard, 33 kapsels, een hoofddoek, kleren, schoenen, hoofddeksels, brillen, oorbellen en meer. Ook verantwoordelijken maken er een (tik op je foto bovenaan, of **Profiel**). Werken levert XP op: 10 per gewerkt uur, +5 als je op tijd begint, +5 als je blijft tot het einde. Level 2 vraagt 50 XP, level 10 1.350 XP en level 20 5.225 XP. Elk level tot 20 geeft iets nieuws: pet (2), konijnensloffen (3), bodywarmer (4), bandana (5), zonnebril (6), monstersloffen (7), koksmuts en koksvest (8), fantasiekleuren voor het haar (9), kroon (10), koptelefoon (11), gouden ketting (12), schort (13), vissershoedje (14), Chen's Garden-shirt (15), hartjesbril (16), leren jas (17), drakensloffen (18), gouden sneakers (19) en een gouden gloed (20). De avatar verschijnt bovenaan, naast de naam in de kalender, bij Vandaag, in het overzicht en bij Team.
- **Bonus-XP:** bij **Team → (persoon) → Werk en loon** geef je iemand extra XP bovenop het werk, bijvoorbeeld om iemand meteen op een hoger level te zetten (level 20 = 5.225 XP). Bonus-XP telt voor het level en de ranglijst van altijd, nooit voor uren of loon.
- **Ranglijst:** iedereen ziet wie van het team het hoogste level heeft, van altijd of van deze maand, met een podium voor de top drie. Alleen het level en de XP worden gedeeld, geen uren of loon.
- **De planning** is een maandkalender die op maandag begint. Elke shift toont of het een **Middag**- of **Avond**shift is (de naam van de vaste shift, of anders volgens het beginuur) en de avatar van wie hem opnam. De vaste shiften vullen hem automatisch, tot 3 maanden op voorhand (dinsdag is dicht): Middag 11:30–14:30 op maandag, woensdag, donderdag, vrijdag en zaterdag, en 11:30–15:00 op zondag; Avond 17:30–21:30 op maandag, woensdag en donderdag, en 17:30–22:30 op vrijdag, zaterdag en zondag. Het personeel tikt op een open shift om hem op te nemen, of op een eigen shift om hem terug te geven. Wie een shift teruggeeft, zegt kort waarom (Ziek, School of examen, Familie, Andere afspraak, of in eigen woorden). De verantwoordelijke ziet die reden bij **Vandaag → Teruggegeven shiften**, samen met wie de shift intussen opnam, en in de shift zelf op de planning. Op een gsm blijft het dezelfde maandkalender, compacter (M = middag, A = avond); een tik op een dag toont die dag groot, met een knop Opnemen of Teruggeven. Vaste shiften wijzig je bij **Planning → Vaste shiften**.
- **Loon:** het personeel ziet hoeveel uur het deze maand gewerkt heeft en wat het verdiend heeft (uren × uurloon, bruto). Elke maand upload je de loonfiches bij **Overzicht → Loonfiches uploaden**, allemaal tegelijk. De app leest elke pdf in de browser: voor wie ze is (naam, rijksregisternummer of werknemersnummer), de maand, het bruto- en nettoloon, en gegevens zoals IBAN, adres, geboortedatum, datum van indiensttreding en statuut. Je kijkt alles na voor het bewaard wordt; ontbrekende gegevens worden aangevuld in het profiel. Elke persoon downloadt de eigen loonfiche bij **Mijn uren** en ziet daar ook het nettoloon. Alleen die persoon en de verantwoordelijken kunnen een loonfiche openen. Een foto of scan kan de app niet lezen; daar kies je zelf de persoon en de maand.
- **Team:** bij **Team** open je een persoon voor alle gegevens: werk en loon (uurloon, statuut, werknemersnummer, in dienst sinds, rol), persoonlijke gegevens, contracten (uploaden, met begin- en einddatum) en loonfiches.
- **Naar Securex:** bij **Overzicht → Naar Securex** download je elke maand één bestand met een regel per gewerkte shift: werknemersnummer, statuut, datum, looncode, soort uren (gewoon, zondag of feestdag) en uren in decimalen. Shiften over middernacht worden op middernacht gesplitst, en de tien Belgische wettelijke feestdagen worden herkend. Vul per persoon het statuut en het werknemersnummer van Securex in bij **Team**, en de looncodes één keer via **Looncodes instellen**. Het scherm waarschuwt als er iets ontbreekt of nog open staat. Upload het bestand in MySecurex (Isypass Web) of mail het naar je dossierbeheerder. Zodra Securex hun eigen sjabloon bezorgt, kan het bestand daaraan aangepast worden.
- **Geschiedenis:** **Overzicht → Alle maanden** toont elke maand met uren, geschat loon en het aantal geüploade loonfiches. Klik op een maand om ze te openen.
- **Verantwoordelijken** zien wie er nu werkt en wie niet kwam opdagen, plannen shiften, wijzen mensen toe, keuren aanpassingen goed of af en bekijken het maandoverzicht: gewerkte tegenover geplande uren, te laat, vroeger weg, niet gekomen en geschat loon. Het overzicht kan als CSV naar Excel.

## Hoe het gebouwd is

| Onderdeel | Waar |
| --- | --- |
| Database en API | Supabase-project `staff-shifts` (`cwncvipsaqqvwjcfphno`, EU West) |
| Schema en alle logica | `supabase/schema.sql` |
| Website (statische bestanden, geen build-stap) | `web/` |
| Avatars (tekening in SVG) | `web/avatar.js` |
| Loonfiches lezen (met pdf.js, in de browser) | `web/loonfiche.js`, `web/vendor/pdfjs/` |

De browser kan nooit rechtstreeks aan de tabellen. Elke actie loopt via een databasefunctie die eerst de aanmelding en de rol controleert. Pincodes worden versleuteld (bcrypt) bewaard; na vijf verkeerde pincodes is die persoon 15 minuten geblokkeerd. Verwijderde shiften en registraties worden gearchiveerd in plaats van gewist, zodat de loongeschiedenis bewaard blijft. De database geeft foutmeldingen in het Engels; de website vertaalt ze naar het Nederlands (`SERVER_NL` in `web/app.js`).

## De website online zetten

De site staat op <https://chensgardenplan.netlify.app>. Netlify haalt ze uit deze GitHub-repository (`main`, map `web`, zie `netlify.toml`): elke push naar `main` staat na een minuutje online.

De map `web/` is een gewone statische website, dus elke andere statische host werkt ook. Wie een nieuwe, lege database als eerste opent, stelt de app in en wordt verantwoordelijke.

## Uitzicht

De app draagt de kleuren van Chen's Garden: een kastanjerode balk met het logo, een crèmekleurige achtergrond en groen voor inklokken. Op een gsm staan de onderdelen onderaan (bij verantwoordelijken komt de rest onder **Meer**). De app is standaard licht. Met de maan- of zonknop bovenaan, of bij **Profiel → Weergave**, kies je Licht, Donker of Zoals mijn toestel; dat wordt per toestel onthouden. Het logo staat in `web/brand/logo.svg` en wordt gekozen in `web/config.js` (`logo`); laat die regel weg voor een app met de naam van de zaak in tekst.

## Dingen aanpassen

- Naam van de zaak, termijn om shiften terug te geven, speling en valuta: **Team → Instellingen** in de app.
- Supabase-adres en sleutel: `web/config.js` (de publieke sleutel, die veilig in een browser mag).
- Databasewijzigingen: pas `supabase/schema.sql` aan en voer de wijziging uit op het project.
