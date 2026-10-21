# Prikklok

Een app voor je personeel: shiften opnemen, in- en uitklokken, uren bekijken en loonfiches downloaden.

- **Personeel** meldt zich aan met de eigen naam en een pincode. Ze kunnen in- en uitklokken (met een opmerking als ze vroeger weg moeten), open shiften opnemen of teruggeven, zien wie er werkt, en hun uren en verdiensten van de maand bekijken. Klopt een uur niet, of vergaten ze in of uit te klokken, dan sturen ze een aanpassing.
- **Inklokken kan alleen tijdens een eigen shift**, of tot 15 minuten ervoor. Wie zonder shift werkte, voegt de uren toe bij **Mijn uren** en de verantwoordelijke keurt ze goed. Verantwoordelijken kunnen altijd inklokken. Aan- of uitzetten en het aantal minuten kies je bij **Team → Instellingen**.
- **Profiel:** elke medewerker vult bij **Profiel** de eigen gegevens in (telefoon, e-mail, geboortedatum, rijksregisternummer, adres, IBAN, noodcontact), wijzigt de eigen pincode en downloadt de eigen contracten. Het rijksregisternummer en de IBAN worden gecontroleerd op tikfouten.
- **Avatar en levels:** iedereen maakt een eigen cartoon-avatar (huidskleur, ogen, mond, kapsel, kleren, schoenen, pet, bril, oorbellen, ...). Werken levert XP op: 10 per gewerkt uur, +5 als je op tijd begint, +5 als je blijft tot het einde. Met elk level komen er nieuwe dingen bij: een pet (level 2), konijnensloffen (3), een bodywarmer (4), een bandana (5), een zonnebril (6), monstersloffen (7), een koksmuts en koksvest (8), fantasiekleuren voor het haar (9) en een kroon (10). De avatar verschijnt bovenaan, bij Vandaag, in het overzicht en bij Team.
- **De planning** is een maandkalender. De vaste shiften vullen hem automatisch, tot 3 maanden op voorhand: Avond 17:30–22:30 op vrijdag, zaterdag en zondag; Middag 11:30–14:30 op vrijdag en zaterdag; Middag 11:30–15:00 op zondag. Het personeel tikt op een open shift om hem op te nemen, of op een eigen shift om hem terug te geven. Op een gsm wordt de kalender een lijst per dag. Vaste shiften wijzig je bij **Planning → Vaste shiften**.
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

## Dingen aanpassen

- Naam van de zaak, termijn om shiften terug te geven, speling en valuta: **Team → Instellingen** in de app.
- Supabase-adres en sleutel: `web/config.js` (de publieke sleutel, die veilig in een browser mag).
- Databasewijzigingen: pas `supabase/schema.sql` aan en voer de wijziging uit op het project.
