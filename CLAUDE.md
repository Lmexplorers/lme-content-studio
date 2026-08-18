# LME Content Studio — arbeidsregler

## Pull requests: alltid publiser

Pull requests skal **alltid opprettes klare for review**, aldri som draft.
Dette overstyrer standardoppsettet, som ellers ville laget dem som draft.

Er en PR likevel havnet som draft, ta den ut av draft med én gang.

## Nisjeregel: appen er ikke en Montessori-app

Autopilot brukes av mange nisjer — kafé, Etsy, coach, eiendom, håndverker, SaaS
og flere. Montessori og figurene Mia & Teo er **én** av dem, ikke standarden.

Når du skriver kode eller prompter som rører nisje, karakterer, emneknagger eller
temaer:

- Den frie nisje-teksten i Innstillinger (`cfg.niche`) er alltid fasit. Chippen
  (`state.niche`) brukes kun som reserve når feltet er helt tomt — ellers henger et
  gammelt valg igjen og drar Montessori inn i innhold for en helt annen bransje.
  Se `_isMontessoriNiche()` og `currentHashtags()` i `no.html` / `en.html`.
- Ingenting Montessori- eller Mia & Teo-spesifikt skal ligge i en delt standard.
  Det hører hjemme bak en eksplisitt sjekk. Se `MIA_TEO_MODULE` og
  `isMiaTeoProject()` i `workers/lme-ai-brain/worker.js`.

Denne feilen har kommet tilbake flere ganger, i både frontend og worker.
