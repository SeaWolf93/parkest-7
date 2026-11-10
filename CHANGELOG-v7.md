# PARKEST 7.0 — Primo incremento (anteprima)

Base: PARKEST v6.7 originale. La logica di ricerca, segnalazione, autenticazione, Supabase e notifiche resta in `app-v6.7.js`, **non modificato**.

## Incluso
- Nuova palette bianco/blu e ritocchi responsive, ispirati alle schermate Emergent.
- Barra inferiore Mappa / Lascia / Home / Profilo, collegata alle schermate già esistenti.
- Tema scuro adattato alla nuova palette.
- Gestione della barra di navigazione e delle visualizzazioni con `v7-ui.js` separato.

## Non ancora incluso
- Destinazioni salvate e Smart Arrival: richiedono backend e test nativi, non sono funzioni simulate in questa anteprima.
- Grafico affollamento: attende dati reali sufficienti.
- Localizzazione completa e nuova pagina community.
- Build Android e notifiche native.

## Come provare
Avviare un server HTTP statico dalla cartella `parkest_source` (`python -m http.server 8080`) e aprire `http://localhost:8080`. Configurazione Supabase e autenticazione necessarie per accedere alle schermate.
Non distribuire questa anteprima direttamente in produzione: eseguire test di regressione su dispositivi reali e verificare che le risorse remote si carichino.
