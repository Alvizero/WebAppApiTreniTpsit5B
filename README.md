1. cosa fa il software

è una web application che permette all’utente di:

- Cercare un treno tramite numero
- Visualizzare lo stato in tempo reale (ritardi, fermate, ecc.)
- Consultare il tabellone di una stazione (partenze/arrivi)
- Pianificare un viaggio tra due stazioni

2. architettura

client-server

dal frontend al backend le chiamate delle api avvengono attraverso il metodo apiFetch() in GET
dal backend al sito delle api le chiamate avvengono attraverso CURL in GET

- Frontend (Client)

Gestisce:

interfaccia grafica
input utente
visualizzazione dati


- Backend (Server)

Gestisce:

comunicazione con API Trenitalia
sicurezza (sanitizzazione input)
trasformazione dati

- Flusso di funzionamento

1. L’utente inserisce un input 

2. Il frontend invia una richiesta HTTP al backend
3. Il backend chiama le API ViaggiaTreno
4. Il backend elabora la risposta
5. Il frontend mostra i dati all’utente


ENDPOINT API:

- Auto completa stazione

GET http://localhost/..path../webapptreni/src/backend/api.php?action=autocompleta_stazione&q={testo}

testo: nome della stazione

ritorna un file json con nome e id della stazione

- Cerca treno per un numero

GET http://localhost/..path../webapptreni/src/backend/api.php?action=cerca_treno&numero{numerotreno}

numerotreno: numero del treno

ritorna un file json con label, codicetreno, codicestazione e orario

- Andamento treno

GET http://localhost/..path../webapptreni/src/backend/api.php?action=andamento_treno&stazione={codStazione}&treno{numerotreno}

codstazione: codice stazione

numerotreno: numero del treno

ritorna un file json con numerotreno, ritardo e array delle fermate, formato da nome stazione, id partenza/arrivo programmata/effettiva

- Partenze di una stazione

GET http://localhost/..path../webapptreni/src/backend/api.php?action=partenze&stazione={codStazione}

codstazione: codice stazione


ritorna un file json con numerotreno, categoria, destinazione, orariopartenza, ritardo e binariopartenza

- Arrivi di una stazione

GET http://localhost/..path../webapptreni/src/backend/api.php?action=arrivi&stazione={codStazione}

codstazione: codice stazione

ritorna un file json con numerotreno, categoria, origine, orarioarrivo, ritardo e binarioarrivo


- 3. Funzionalità del software

- 3.1 Ricerca treno

Permette di inserire un numero di treno e ottenere:

posizione treno attuale
ora di arrivo previsto
ora di arrivo effettivo
binario di fermata

- 3.2 Tabellone stazione

Permette di inserire il nome della stazione e di ottenere:

treni che partono/arrivano
meta di destinazione del treno
orario di partenza del treno 
binario di partnenza/arrivo
ritardo del treno

- 3.3 Pianificazione viaggio

Permette di trovare i treni disponibili tra una stazione A e B

non funziona perchè le api fornite non permettono di fare questo

- 4. Backend

Riceve le richieste del forntend
Chiama le API
invia la risposta al frontend

- 5. Test

- Frontend

✔ input utente
✔ autocompletamento
✔ cambio tabella
✔ visualizzazione dati
✔ gestione errori

- Backend

✔ autocompletamento stazioni
✔ ricerca treno
✔ andamento treno
✔ partenze/arrivi
✔ soluzioni viaggio
✔ Edge cases
✔ input vuoti
✔ numeri non validi
✔ API 
