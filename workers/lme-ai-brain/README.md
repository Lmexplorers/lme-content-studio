# lme-ai-brain (Cloudflare Worker)

Delt AI-Worker for alle LME-apper. Autopilot (Content Studio) snakker med den
via `Nathalie AI`-panelet:

```
https://lme-ai-brain.renateshobby.workers.dev/api/ai
```

Konfigurert i `lme-bot-shell-content-studio.js` (`endpoint`), sendt av
`lme-bot-core.js`.

## Hvorfor ligger denne filen i repoet?

Workeren ble tidligere bare redigert i Cloudflare-dashbordet, så koden lå ikke
i versjonskontroll. Den deployede versjonen var fra 3. mai 2026 — altså fra før
Autopilot ble en fler-nisje-app — og den var fortsatt den viktigste gjenværende
kilden til «Montessori-lekkasjen».

## Rotårsak: Montessori-lekkasje fra Worker-siden

Den deployede workeren la `LME_CORE_IDENTITY` inn i **hver eneste** systemprompt,
uansett nisje og uansett app. Den teksten inneholder blant annet:

- «premium Mia & Teo books, workbooks, Montessori-inspired materials …»
- «soft watercolor aesthetic», «Montessori-inspired»
- de låste Mia & Teo-karakterreglene
- `content`-oppgaven: «Create social/marketing content for Mia & Teo and LME
  products» + «Montessori framing: buy some, make some, find some free»

Autopilot sender riktig nisje i Project Brain (`niche`, `brand`, `voice`,
`charPreset`), men workeren leste den aldri. En bruker med nisje «kafé» eller
«Etsy-selger» fikk derfor Montessori-føringer og Mia & Teo lagt på toppen —
uavhengig av frontend-fiksene i `no.html`.

## Hva som er endret

- Identiteten er delt i `CORE_IDENTITY` (nisjenøytral, alltid med) og
  `MIA_TEO_MODULE` (kun når prosjektet faktisk er Montessori / Mia & Teo).
- `isMiaTeoProject()` speiler `_isMontessoriNiche()` i frontend: den frie
  nisje-teksten er fasit, karaktervalget brukes bare når nisjefeltet er tomt.
  `appId: 'lme-studio'` (bok- og materiellbyggeren) er alltid i Mia & Teo-modus.
- Hver oppgave i `TASK_REGISTRY` har nå nisjenøytral `guidance` pluss valgfri
  `miaTeo`-tilleggstekst som bare legges på i Mia & Teo-modus.
- Merkevarefeltene (brand, niche, voice, audience, characters) løftes ut av
  JSON-dumpen og øverst i systemprompten, så modellen faktisk fester seg på dem.
- Mock-provideren er nisjebevisst i stedet for hardkodet Montessori.
- Svaret inkluderer `miaTeoMode: true|false`, så det er mulig å se hvilken modus
  workeren faktisk brukte.

Endepunkter, CORS, providere og payload-formatet er uendret — appene trenger
ingen endring.

## Deploy

Workeren har ingen wrangler-oppsett ennå. Deploy via dashbordet:

1. Cloudflare → Workers & Pages → `lme-ai-brain` → Edit code
2. Lim inn hele `worker.js` fra denne mappen
3. Save and deploy

Secrets som må være satt på workeren (uendret): `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`.

## Røyktest etter deploy

```bash
# Skal svare med miaTeoMode: false og ingen Montessori/Mia & Teo
curl -s https://lme-ai-brain.renateshobby.workers.dev/api/ai \
  -H 'Content-Type: application/json' \
  -d '{"appId":"content-studio","taskType":"content","provider":"mock",
       "projectContext":{"brand":"Kafé Nord","niche":"kafé"},
       "messages":[{"role":"user","content":"Skriv en reel-hook"}]}'

# Skal svare med miaTeoMode: true
curl -s https://lme-ai-brain.renateshobby.workers.dev/api/ai \
  -H 'Content-Type: application/json' \
  -d '{"appId":"content-studio","taskType":"content","provider":"mock",
       "projectContext":{"brand":"LME","niche":"Montessori"},
       "messages":[{"role":"user","content":"Skriv en reel-hook"}]}'
```
