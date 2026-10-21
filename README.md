# Prikklok

Een app voor je personeel: shiften opnemen, in- en uitklokken, uren bekijken en loonfiches downloaden.

- **Personeel** meldt zich aan met de eigen naam en een pincode. Ze kunnen in- en uitklokken (met een opmerking als ze vroeger weg moeten), open shiften opnemen of teruggeven, zien wie er werkt, en hun uren en verdiensten van de maand bekijken. Klopt een uur niet, of vergaten ze in of uit te klokken, dan sturen ze een aanpassing.
- **De planning** is een maandkalender. De vaste shiften vullen hem automatisch, tot 3 maanden op voorhand: Avond 17:30–22:30 op vrijdag, zaterdag en zondag; Middag 11:30–14:30 op vrijdag en zaterdag; Middag 11:30–15:00 op zondag. Het personeel tikt op een open shift om hem op te nemen, of op een eigen shift om hem terug te geven. Op een gsm wordt de kalender een lijst per dag. Vaste shiften wijzig je bij **Planning → Vaste shiften**.
- **Loon:** het personeel ziet hoeveel uur het deze maand gewerkt heeft en wat het verdiend heeft (uren × uurloon, bruto). Elke maand upload je de loonfiche van iedereen als pdf of foto bij **Overzicht → Loonfiches**; elke persoon downloadt de eigen loonfiche bij **Mijn uren → Loonfiches**. Alleen die persoon en de verantwoordelijken kunnen een loonfiche openen.
- **Naar Securex:** bij **Overzicht → Naar Securex** download je elke maand één bestand met een regel per gewerkte shift: werknemersnummer, statuut, datum, looncode, soort uren (gewoon, zondag of feestdag) en uren in decimalen. Shiften over middernacht worden op middernacht gesplitst, en de tien Belgische wettelijke feestdagen worden herkend. Vul per persoon het statuut en het werknemersnummer van Securex in bij **Team**, en de looncodes één keer via **Looncodes instellen**. Het scherm waarschuwt als er iets ontbreekt of nog open staat. Upload het bestand in MySecurex (Isypass Web) of mail het naar je dossierbeheerder. Zodra Securex hun eigen sjabloon bezorgt, kan het bestand daaraan aangepast worden.
- **Geschiedenis:** **Overzicht → Alle maanden** toont elke maand met uren, geschat loon en het aantal geüploade loonfiches. Klik op een maand om ze te openen.
- **Verantwoordelijken** zien wie er nu werkt en wie niet kwam opdagen, plannen shiften, wijzen mensen toe, keuren aanpassingen goed of af en bekijken het maandoverzicht: gewerkte tegenover geplande uren, te laat, vroeger weg, niet gekomen en geschat loon. Het overzicht kan als CSV naar Excel.

## Hoe het gebouwd is

| Onderdeel | Waar |
| --- | --- |
| Database en API | Supabase-project `staff-shifts` (`cwncvipsaqqvwjcfphno`, EU West) |
| Schema en alle logica | `supabase/schema.sql` |
| Website (statische bestanden, geen build-stap) | `web/` |

De browser kan nooit rechtstreeks aan de tabellen. Elke actie loopt via een databasefunctie die eerst de aanmelding en de rol controleert. Pincodes worden versleuteld (bcrypt) bewaard; na vijf verkeerde pincodes is die persoon 15 minuten geblokkeerd. Verwijderde shiften en registraties worden gearchiveerd in plaats van gewist, zodat de loongeschiedenis bewaard blijft. De database geeft foutmeldingen in het Engels; de website vertaalt ze naar het Nederlands (`SERVER_NL` in `web/app.js`).

## De website online zetten

De map `web/` is een gewone statische website:

- **Netlify Drop** (gratis): ga naar <https://app.netlify.com/drop> en sleep de map `web` of `shift-clock-site.zip` erop. Maak een gratis account aan als dat gevraagd wordt, anders verloopt de site. Een nieuwe versie zet je online via je site → **Deploys** → de zip in het vak onderaan slepen.
- **Cloudflare Pages** (gratis): Workers & Pages → Create → Pages → Upload assets, en upload de zip.

Wie een nieuwe site als eerste opent, stelt ze in en wordt verantwoordelijke. Open ze dus zelf meteen na het publiceren.

## Dingen aanpassen

- Naam van de zaak, termijn om shiften terug te geven, speling en valuta: **Team → Instellingen** in de app.
- Supabase-adres en sleutel: `web/config.js` (de publieke sleutel, die veilig in een browser mag).
- Databasewijzigingen: pas `supabase/schema.sql` aan en voer de wijziging uit op het project.
