# Innsending til App Store og Google Play

Praktisk sjekkliste for å sende **LME Autopilot** til de to butikkene. Appen er en
PWA (nettapp), så den pakkes inn i en app-fil med PWABuilder. Det er gratis, og
samme verktøy dekker begge butikkene.

> Appens adresse: `https://lme-contentstudio.pages.dev`
> Personvern: `https://lme-contentstudio.pages.dev/personvern`
> Slett konto: `https://lme-contentstudio.pages.dev/slett-konto`

Sist oppdatert 26. august 2026.

## Viktig: appen heter LME Autopilot

Ikke "LME Content Studio", og ikke "Content Studio". Det gamle navnet skal ikke stå
noe sted i butikkoppføringen. LME Studio er skaperdelen av plattformen, LME Autopilot
er appen. Repoet heter fortsatt `lme-content-studio`, det er bare et mappenavn og
betyr ingenting for butikkene.

## Viktig: appen er ikke en Montessori-app

Autopilot brukes av mange nisjer: kafé, Etsy-selger, coach, eiendomsmegler,
håndverker, SaaS og flere. Montessori er én av dem, ikke standarden. Butikkteksten
under er derfor nisjenøytral med vilje. Den forrige versjonen av dette dokumentet
solgte appen som "AI-drevet innholdsstudio for montessori", og det snevret inn
markedet til en brøkdel av det appen faktisk dekker.

## Betaling: butikkappen har verken priser eller kjøpsknapper

Renate bestemte 26. august 2026 at butikkappen bare skal ha innlogging. Ingen priser,
ingen kjøpsknapper, ingen lenker til betaling. Kjøp skjer på lmexplorers.com, og
brukeren logger inn i appen med kontoen sin etterpå.

Dette er det Netflix og Spotify gjør, og grunnen er at det holder appen utenfor både
Apples regel 3.1.1 og Googles betalingspolicy. Hele salget blir Renates, minus bare
Stripes kortgebyr.

Det gamle notatet i lme-platform (`docs/pwa-pakking.md`) sa at appen kunne vise priser
og sende brukeren ut til Stripe uten at det kostet noe. Det stemmer ikke lenger:

- **Google** skilte 30. juni 2026 tjenestegebyret fra betalingsgebyret i EØS, som
  Norge er med i. Lenker du ut til kjøp fra appen, tar Google 10 % av abonnementer og
  20 % av nye kjøp. Selger du ingenting i appen i det hele tatt, faller appen utenfor
  policyen, og gebyret blir null.
- **Apple** godtar utlenking til kjøp bare i USA (etter Epic-dommen i 2025) og i EU
  under DMA. Norge er EØS, ikke EU, så DMA gjelder ikke her. En norsk iOS-app som
  viser priser og lenker til Stripe blir sannsynligvis avvist etter 3.1.1.

Konklusjonen er den samme i begge butikkene: vis ingenting om pris i appen.

### Slik er det løst i koden

`lme-pricing.js` slår på butikkmodus automatisk. Da skjules alt som er merket
`data-lme-kjop` (prisfanen, prismodalen, "Priser" i menyen og planlisten på
låseskjermen), og planene rendres ikke i det hele tatt.

Butikkmodus slås på når:

- appen kjøres som installert app (`display-mode: standalone`, som er tilfellet både
  i Android-pakken og iOS-pakken), eller
- adressen inneholder `?store=1`, som lagres, så den overlever navigering.

`?store=0` slår den av igjen. Vil du se hvordan butikkversjonen ser ut i en vanlig
nettleser, åpne `https://lme-contentstudio.pages.dev/no.html?store=1`.

**Sett `start_url` til `/?store=1` i PWABuilder.** Da er butikkmodus sikret selv om
iOS-pakken ikke skulle rapportere `standalone`. Riktige verdier ligger ferdig i
`manifest-store.json` i repoet.

## Status: hva er klart nå

- Ikoner (72 til 512 px, inkludert maskable) er på plass og lenket i `manifest.json`.
- `manifest.json` har navn, beskrivelse, farger, kategori og `id`.
- `manifest-store.json` er fasit for hva PWABuilder skal pakke.
- Personvernerklæring (norsk og engelsk) på `/personvern`.
- Sletting av konto (norsk og engelsk) på `/slett-konto`, med et ekte endepunkt
  som virkelig sletter data. Google Play krever dette, se eget punkt.
- Butikkmodus skjuler alt kjøp, verifisert i nettleser.
- Service worker og offline-skall fungerer.

## Det du trenger før innsending

- **Google Play:** utviklerkonto. Allerede betalt, og appen ligger der fra før, så
  dette blir en oppdatering, ikke en ny innsending.
- **App Store:** Apple-utviklerkonto (999 kr i året) og tilgang til en Mac med Xcode.
  Uten Mac kan en sky-Mac brukes, men en lånt Mac er enklere.
- Skjermbilder, se eget punkt.

## Steg 1: lag app-filene med PWABuilder

1. Gå til [pwabuilder.com](https://www.pwabuilder.com).
2. Lim inn `https://lme-contentstudio.pages.dev` og kjør analysen.
3. Åpne manifest-redigeringen og **sett `start_url` til `/?store=1`**.
4. Velg "Package for stores".
   - Android: gir en `.aab`-fil til Play og en `assetlinks.json` (se steg 3).
   - iOS: gir et Xcode-prosjekt som åpnes på en Mac.
5. Før du laster opp: installer pakken på en telefon og sjekk at det ikke finnes
   pris eller kjøpsknapp noe sted. Finner du en, er butikkmodus ikke slått på, og
   `start_url` er sannsynligvis feil.

## Steg 2: Google Play (oppdatere appen som ligger der)

1. Logg inn på [Play Console](https://play.google.com/console) og åpne appen.
2. Last opp den nye `.aab`-filen under "Lukket testing" først, ikke rett i produksjon.
   Versjonskoden må være høyere enn forrige, det settes i PWABuilder.
3. Rett opp navnet i butikkoppføringen hvis det fortsatt står "LME Content Studio".
4. Fyll inn teksten og skjermbildene lenger ned.
5. Fyll ut **Datasikkerhet**, se eget punkt. Dette er der innsendinger oftest stopper.
6. Send inn for gjennomgang.

## Steg 3: assetlinks.json (fjerner nettleserlinjen i Android-appen)

Android-appen viser en adresselinje øverst helt til domenet er verifisert.

1. I Play Console, under "Appintegritet", kopier SHA-256-fingeravtrykket for
   appsignering.
2. Send det til meg, så legger jeg filen i repoet, så publiseres den automatisk på
   `https://lme-contentstudio.pages.dev/.well-known/assetlinks.json`.

Filen ser slik ut, og fingeravtrykket er det eneste som mangler:

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "<pakkenavnet fra PWABuilder>",
    "sha256_cert_fingerprints": ["<SHA-256 fra Play Console>"]
  }
}]
```

## Steg 4: App Store

1. Logg inn på [App Store Connect](https://appstoreconnect.apple.com) og opprett appen.
2. Åpne iOS-pakken fra PWABuilder i Xcode på en Mac.
3. Sett ikon, navn og versjon, og arkiver (Product, så Archive).
4. Last opp via Xcode eller Transporter.
5. Fyll inn butikkoppføringen med teksten under.
6. **Ikke** opprett noe abonnement under "In-App Purchases". Appen selger ingenting.
7. Send inn for gjennomgang.

Apple ser etter to ting her. Det ene er at appen føles som en ekte app og ikke bare
en nettside, så skjermbildene bør vise arbeid som gjøres i appen. Det andre er
regel 3.1.1, og den er dekket så lenge butikkmodus er på.

Får du likevel avslag etter 3.1.1, er svaret til Apple at appen er en
multiplattformtjeneste etter 3.1.3(b): kontoen kjøpes utenfor appen, appen selger
ingenting og lenker ikke til kjøp.

## Datasikkerhet i Play Console

Play spør hva appen samler inn. Dette er riktige svar for Autopilot:

| Spørsmål | Svar |
| --- | --- |
| E-postadresse | Ja, samles inn. Knyttet til identitet. Brukes til konto og innlogging. |
| Brukergenerert innhold | Ja (tekst og bilder brukeren lager). Knyttet til identitet. |
| Deles med tredjepart | Nei, ikke i markedsføringsøyemed. Underleverandører for drift og AI. |
| Kryptert under overføring | Ja. |
| Bruker kan be om sletting | Ja. |
| Nettadresse for sletting | `https://lme-contentstudio.pages.dev/slett-konto` |

Sletting er obligatorisk for apper med innlogging, og Play krever både en vei inne i
appen og en offentlig nettadresse. Begge finnes nå: Innstillinger, "Konto og
personvern", og adressen over.

## Butikktekst

### Appnavn
LME Autopilot

### Kort beskrivelse, norsk (maks 80 tegn)
Lag ferdig innhold til sosiale medier med AI. Tekst, bilder og reels.

### Kort beskrivelse, engelsk (maks 80 tegn)
Create ready-to-post social content with AI. Captions, images and reels.

### Full beskrivelse, norsk
LME Autopilot lager innholdet ditt til sosiale medier, uansett hva du driver med.
Skriv inn nisjen din, så bygger appen en komplett innholdsplan med hooks, tekst,
emneknagger, SEO og ferdige innlegg du kan publisere rett fra appen.

Slik fungerer det:
- Velg innholdstype og tema, det tar ett minutt
- Få en plan for 30 eller 90 dager, ferdig fordelt på ukedager
- Få tekst, bilder, reels, karuseller og stories, klare til å legges ut
- Rediger reels med musikk, og stories med import fra Canva
- Planlegg alt i kalenderen, eller la appen publisere automatisk
- Alt på norsk og engelsk

Appen passer for kafeen, nettbutikken, coachen, håndverkeren, pedagogen og alle andre
som skal være synlige, men ikke har tid til å lage innhold hver dag.

Appen krever en aktiv LME Autopilot-konto. Logg inn med e-postadressen din, så er alt
arbeidet ditt der, uansett hvilken enhet du bruker.

### Full beskrivelse, engelsk
LME Autopilot creates your social media content, whatever you do for a living.
Enter your niche and the app builds a complete content plan with hooks, captions,
hashtags, SEO and ready-made posts you can publish straight from the app.

How it works:
- Pick a content type and topic, it takes a minute
- Get a plan for 30 or 90 days, laid out across the week
- Get captions, images, reels, carousels and stories, ready to post
- Edit reels with music, and stories with imports from Canva
- Schedule everything in the calendar, or let the app publish automatically
- Everything in Norwegian and English

Made for the café, the online shop, the coach, the tradesperson, the educator and
anyone else who needs to be visible but has no time to make content every day.

The app requires an active LME Autopilot account. Log in with your email address and
your work follows you to every device.

### Nøkkelord (App Store)
innhold, sosiale medier, reels, AI, bildetekst, instagram, tiktok, markedsføring,
planlegger, småbedrift

### Kategori
- Google Play: Produktivitet (sekundær: Bedrift)
- App Store: Productivity (sekundær: Business)

Nisjenøytral app hører hjemme under Produktivitet, ikke Utdanning. Utdanning ville
sagt til butikkens søk at appen er for pedagoger, og det er den ikke bare.

### Aldersgrense
4+ / Alle. Appen er laget for voksne, men har ikke noe upassende innhold.

### Nettadresser som kreves
- Personvern: `https://lme-contentstudio.pages.dev/personvern`
- Sletting av konto: `https://lme-contentstudio.pages.dev/slett-konto`
- Støtte: `https://lmexplorers.com/help`

## Skjermbilder

Begge butikkene krever skjermbilder. Ta dem på telefonen med appen i butikkmodus
(`?store=1`), slik at ingen priser kommer med.

- Google Play: minst 2, helst 4 til 8, i portrett.
- App Store: iPhone 6,7" (1290 x 2796), gjerne også 6,5".

Fine skjermer å ta bilde av: en ferdig innholdsplan, et generert innlegg, et AI-bilde,
reel-editoren og kalenderen.

Sender du meg 4 til 6 skjermbilder, setter jeg dem i pene rammer med korte tekster
over, så oppføringen ser proff ut.

## Rekkefølgen jeg anbefaler

1. Kjør PWABuilder med `start_url` satt til `/?store=1`.
2. Installer Android-pakken på telefonen og bekreft at ingen priser vises.
3. Google Play først, som lukket testing. Kontoen finnes, så dette går raskest.
4. Hent SHA-256 fra Play Console og send til meg, så blir `assetlinks.json` ferdig.
5. Ta skjermbildene mens Android-versjonen ligger til gjennomgang.
6. App Store når du har tilgang til en Mac.
