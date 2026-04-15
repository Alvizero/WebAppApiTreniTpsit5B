<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

const VIAGGIATRENO_BASE = 'http://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno';
const CURL_TIMEOUT = 12;

$action = $_GET['action'] ?? '';

try {
    switch ($action) {

        // 1. Autocompletamento stazione
        case 'autocompleta_stazione':
            $query = inpututente($_GET['q'] ?? '');
            // Accettiamo anche 1 solo carattere per mostrare risultati subito
            if (strlen($query) < 1) throw new Exception('Query troppo corta', 400);
            $url = VIAGGIATRENO_BASE . '/autocompletaStazione/' . rawurlencode($query); // endpoint
            $raw = fetchUrl($url, false);
            $lines   = array_filter(explode("\n", trim($raw)));
            $results = [];
            foreach ($lines as $line) {
                $parts = explode('|', trim($line));
                if (count($parts) >= 2) {
                    $results[] = [ // risposta
                        'nome' => trim($parts[0]),
                        'id'   => trim($parts[1]),
                    ];
                }
            }
            echo json_encode(['success' => true, 'data' => $results]);
            break;

        // 2. Cerca numero treno
        case 'cerca_treno':
            $num = inpututente($_GET['numero'] ?? '');
            if (!is_numeric($num)) throw new Exception('Numero treno non valido', 400);
            $url  = VIAGGIATRENO_BASE . '/cercaNumeroTrenoTrenoAutocomplete/' . $num; // endpoint
            $raw  = fetchUrl($url, false);
            $line = trim(explode("\n", $raw)[0] ?? '');
            if (!$line) throw new Exception('Treno non trovato', 404);
            $parts = explode('|', $line);
            if (count($parts) < 2) throw new Exception('Treno non trovato', 404);

            $right = $parts[1];
            if (preg_match('/^(\d+)-(S\d+)-?(\d*)$/', trim($right), $m)) {
                echo json_encode([
                    'success' => true,
                    'data'    => [
                        'label'       => trim($parts[0]),
                        'codTreno'    => $m[1],
                        'codStazione' => $m[2],
                        'timestamp'   => $m[3] ?? '',
                    ]
                ]);
            } else {
                throw new Exception('Formato risposta inatteso: ' . $right, 502);
            }
            break;

        // 3. Andamento treno (fermate + ritardo)
        case 'andamento_treno':
            $codStazione  = inpututente($_GET['stazione'] ?? '');
            $codTreno     = inpututente($_GET['treno']    ?? '');
            $dataPartenza = inpututente($_GET['data']     ?? '');
            if (!$codStazione || !$codTreno) throw new Exception('Parametri mancanti', 400);
            if (!$dataPartenza || !is_numeric($dataPartenza)) {
                // Mezzanotte di oggi in ms
                $dataPartenza = (string)(strtotime('today') * 1000);
            }
            $url  = VIAGGIATRENO_BASE . "/andamentoTreno/{$codStazione}/{$codTreno}/{$dataPartenza}";
            $data = fetchUrl($url);
            echo json_encode(['success' => true, 'data' => $data]);
            break;

        // 4. Partenze da una stazione
        // Endpoint: /partenze/{codiceStazione}/{orario}
        case 'partenze':
            $codStazione = inpututente($_GET['stazione'] ?? '');
            if (!$codStazione) throw new Exception('Stazione mancante', 400);
            $orario    = formatOrarioAPI();
            // rawurlencode codifica tutto incluso lo spazio come %20;
            // poi ripristiniamo il + di GMT+0100 che non va encodato
            $orarioEnc = str_replace('%2B', '+', rawurlencode($orario));
            $url  = VIAGGIATRENO_BASE . "/partenze/{$codStazione}/{$orarioEnc}";
            $data = fetchUrl($url);
            // Viaggiatreno a volte restituisce null invece di array vuoto
            if ($data === null) $data = [];
            echo json_encode(['success' => true, 'data' => $data]);
            break;

        // 5. Arrivi a una stazione
        // Endpoint: /arrivi/{codiceStazione}/{orario}
        case 'arrivi':
            $codStazione = inpututente($_GET['stazione'] ?? '');
            if (!$codStazione) throw new Exception('Stazione mancante', 400);
            $orario    = formatOrarioAPI();
            $orarioEnc = str_replace('%2B', '+', rawurlencode($orario));
            $url  = VIAGGIATRENO_BASE . "/arrivi/{$codStazione}/{$orarioEnc}";
            $data = fetchUrl($url);
            if ($data === null) $data = [];
            echo json_encode(['success' => true, 'data' => $data]);
            break;

        // 6. Soluzioni di viaggio Da→A
        // Endpoint: /soluzioniViaggioNew/{codOrig}/{codDest}/{dateISO}
        case 'soluzioni_viaggio':
            $orig = inpututente($_GET['orig'] ?? '');
            $dest = inpututente($_GET['dest'] ?? '');
            $dt   = inpututente($_GET['data'] ?? date('Y-m-d\TH:i:s'));
            if (!$orig || !$dest) throw new Exception('Origine o destinazione mancante', 400);
            // Assicuriamo formato corretto ISO senza millisecondi
            if (strlen($dt) === 16) $dt .= ':00'; // "2026-03-30T14:30" → aggiunge ":00"
            $url  = VIAGGIATRENO_BASE . "/soluzioniViaggioNew/{$orig}/{$dest}/" . rawurlencode($dt);
            $resp = fetchUrl($url);
            echo json_encode(['success' => true, 'data' => $resp]);
            break;

        // 7. Regione della stazione
        // Endpoint: /regione/{codStazione}  → restituisce un numero intero
        case 'regione':
            $codStazione = inpututente($_GET['stazione'] ?? '');
            if (!$codStazione) throw new Exception('Stazione mancante', 400);
            $url  = VIAGGIATRENO_BASE . "/regione/{$codStazione}";
            $data = fetchUrl($url, false);
            echo json_encode(['success' => true, 'data' => intval(trim($data))]);
            break;

        default:
            throw new Exception("Azione '{$action}' non riconosciuta", 400);
    }

} catch (Exception $e) {
    $code = $e->getCode() >= 400 ? $e->getCode() : 500;
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'error'   => $e->getMessage(),
        'code'    => $code,
    ]);
}

// FINE CHIAMATE API DA FRONTEND 

// CHIAMATE VERSO SITO DELLE API
function fetchUrl(string $url, bool $isJson = true): mixed
{
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => CURL_TIMEOUT,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_ENCODING       => '',          // accetta gzip/deflate automaticamente
        CURLOPT_USERAGENT      => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        CURLOPT_HTTPHEADER     => [
            'Accept: application/json, text/plain, */*',
            'Accept-Language: it-IT,it;q=0.9',
            'Referer: http://www.viaggiatreno.it/',
            'Origin: http://www.viaggiatreno.it',
        ],
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($curlErr) throw new Exception("Errore cURL: {$curlErr}", 502);
    if ($response === false) throw new Exception("Risposta vuota dall'API", 502);
    if ($httpCode === 404)   throw new Exception('Risorsa non trovata (404)', 404);
    if ($httpCode >= 500)    throw new Exception("Errore server Viaggiatreno (HTTP {$httpCode})", 502);

    if (!$isJson) return $response;

    $decoded = json_decode($response, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        // La risposta non è JSON valido — la restituiamo come stringa
        return $response;
    }
    return $decoded;
}

// ORARIO
function formatOrarioAPI(): string
{
    $ts = time();
    $dt = new DateTimeImmutable('now', new DateTimeZone('Europe/Rome'));

    $days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    $months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    $dow    = (int)$dt->format('w');   // 0=Dom … 6=Sab
    $mon    = (int)$dt->format('n');   // 1-12
    $day    = (int)$dt->format('j');
    $year   = $dt->format('Y');
    $time   = $dt->format('H:i:s');

    $offset = $dt->format('O'); // es. "+0100" o "+0200"
    $gmt    = 'GMT' . $offset;  // es. "GMT+0100"

    return sprintf('%s %s %02d %s %s %s', $days[$dow],$months[$mon - 1], $day, $year, $time, $gmt);
}

// Input utente
function inpututente(string $input): string {
    return htmlspecialchars(strip_tags(trim($input)), ENT_QUOTES, 'UTF-8');
}
