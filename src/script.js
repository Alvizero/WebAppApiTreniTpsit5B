'use strict';

const API = 'api.php';

// ─── Fetch ────────────────────────────────────────────────────────────────────
async function apiFetch(params) {
  const url = new URL(API, window.location.href);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res  = await fetch(url.toString());
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Errore sconosciuto');
  return json.data;
}

// ─── Formattatori ─────────────────────────────────────────────────────────────
function fmtTime(val) {
  if (!val) return '—';
  if (typeof val === 'string' && val.includes(':')) return val;
  const num = parseInt(val);
  if (isNaN(num) || num <= 1_000_000_000_000) return '—';
  return new Date(num).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function calcRitardoMin(prog, eff) {
  if (!prog || !eff) return null;
  return Math.round((parseInt(eff) - parseInt(prog)) / 60000);
}

function ritardoBadge(min) {
  if (min === null || min === undefined)
    return '<span class="badge-ritardo badge-soppresso">N/D</span>';
  if (min <= 0)
    return '<span class="badge-ritardo badge-puntuale"><i class="fa-solid fa-check"></i> In orario</span>';
  if (min <= 5)
    return `<span class="badge-ritardo badge-lieve">+${min} min</span>`;
  return `<span class="badge-ritardo badge-ritardo-g">+${min} min</span>`;
}

function orarioClass(min) {
  if (min === null) return '';
  if (min < 0)  return 'anticipo';
  if (min === 0) return 'in-orario';
  return 'in-ritardo';
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(msg, duration = 3500) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => toast.remove(), duration);
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
function loaderHTML(text = 'Ricerca in corso…') {
  return `<div class="loader">
    <div class="loader-dots"><span></span><span></span><span></span></div>
    <span>${text}</span>
  </div>`;
}

function msgBox(tipo, icon, testo) {
  return `<div class="msg-box msg-${tipo}">
    <i class="fa-solid fa-${icon}"></i><span>${testo}</span>
  </div>`;
}

// ─── Navigazione Tab ──────────────────────────────────────────────────────────
let stazioneCorrente  = null;
let direzioneCorrente = 'partenze';

function resetTab(tabId) {
  switch (tabId) {
    case 'treno':
      document.getElementById('input-numero-treno').value = '';
      document.getElementById('result-treno').innerHTML   = '';
      break;
    case 'stazione':
      document.getElementById('input-stazione').value      = '';
      document.getElementById('hidden-stazione-id').value  = '';
      document.getElementById('result-stazione').innerHTML = '';
      document.getElementById('toggle-dir').hidden         = true;
      direzioneCorrente = 'partenze';
      document.querySelectorAll('.toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.dir === 'partenze');
      });
      stazioneCorrente = null;
      break;
    case 'viaggio':
      document.getElementById('input-orig').value          = '';
      document.getElementById('hidden-orig-id').value      = '';
      document.getElementById('input-dest').value          = '';
      document.getElementById('hidden-dest-id').value      = '';
      document.getElementById('result-viaggio').innerHTML  = '';
      setDefaultDatetime();
      break;
  }
}

function setActiveTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => {
    const isTarget = b.dataset.tab === tabId;
    b.classList.toggle('active', isTarget);
    b.setAttribute('aria-selected', String(isTarget));
  });
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + tabId).classList.add('active');
}

function navigaTab(tabId) {
  const active = document.querySelector('.tab-btn.active');
  if (active) resetTab(active.dataset.tab);
  setActiveTab(tabId);
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const active = document.querySelector('.tab-btn.active');
    if (active && active !== btn) resetTab(active.dataset.tab);
    setActiveTab(btn.dataset.tab);
  });
});

// ─── Link cliccabili (delegazione) ───────────────────────────────────────────
document.addEventListener('click', async e => {
  const trenoEl = e.target.closest('.link-treno');
  if (trenoEl?.dataset.numero) { await apriTreno(trenoEl.dataset.numero); return; }

  const stazioneEl = e.target.closest('.link-stazione');
  if (stazioneEl) {
    let { id, nome } = stazioneEl.dataset;
    if (!nome || nome === '—') return;
    if (!id) {
      try {
        const results = await apiFetch({ action: 'autocompleta_stazione', q: nome });
        id = (results?.find(r => r.nome.toUpperCase() === nome.toUpperCase()) ?? results?.[0])?.id;
      } catch {
        showToast(`Impossibile trovare la stazione "${nome}".`); return;
      }
    }
    id ? await apriStazione(id, nome) : showToast(`Stazione "${nome}" non trovata.`);
  }
});

// ─── Navigazione programmativa ────────────────────────────────────────────────
async function apriTreno(numero) {
  navigaTab('treno');
  document.getElementById('input-numero-treno').value = numero;
  await cercaTreno();
}

async function apriStazione(id, nome) {
  navigaTab('stazione');
  document.getElementById('input-stazione').value     = nome;
  document.getElementById('hidden-stazione-id').value = id;
  stazioneCorrente = { id, nome };
  await caricaTabellone(id, nome, direzioneCorrente);
}

// ─── Autocompletamento ────────────────────────────────────────────────────────
function initAutocomplete(inputId, listId, hiddenId, onSelect) {
  const input  = document.getElementById(inputId);
  const list   = document.getElementById(listId);
  const hidden = document.getElementById(hiddenId);
  let timer    = null;

  input.addEventListener('input', () => {
    hidden.value = '';
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 1) { closeList(); return; }
    timer = setTimeout(async () => {
      try { renderList(await apiFetch({ action: 'autocompleta_stazione', q })); }
      catch { closeList(); }
    }, 200);
  });

  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target)) closeList();
  });

  input.addEventListener('keydown', e => {
    const items   = [...list.querySelectorAll('li')];
    const current = list.querySelector('[aria-selected="true"]');
    let idx = items.indexOf(current);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = Math.min(idx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = Math.max(idx - 1, 0);
    } else if (e.key === 'Enter') {
      const sel = list.querySelector('[aria-selected="true"]');
      if (sel) { e.preventDefault(); sel.click(); }
      return;
    } else if (e.key === 'Escape') {
      closeList(); return;
    } else return;

    items.forEach(i => i.removeAttribute('aria-selected'));
    items[idx]?.setAttribute('aria-selected', 'true');
    items[idx]?.scrollIntoView({ block: 'nearest' });
  });

  function renderList(results) {
    list.innerHTML = '';
    if (!results?.length) { closeList(); return; }
    results.slice(0, 12).forEach(item => {
      const li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.innerHTML = `<i class="fa-regular fa-building"></i>
        <span>${item.nome}</span>
        <span class="station-id">${item.id}</span>`;
      li.addEventListener('mousedown', e => e.preventDefault());
      li.addEventListener('click', () => {
        input.value  = item.nome;
        hidden.value = item.id;
        closeList();
        onSelect?.(item);
      });
      list.appendChild(li);
    });
    list.hidden = false;
  }

  function closeList() { list.hidden = true; list.innerHTML = ''; }
}

initAutocomplete('input-stazione', 'autocomplete-stazione', 'hidden-stazione-id');
initAutocomplete('input-orig',     'autocomplete-orig',     'hidden-orig-id');
initAutocomplete('input-dest',     'autocomplete-dest',     'hidden-dest-id');

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 1 — CERCA TRENO
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-cerca-treno').addEventListener('click', cercaTreno);
document.getElementById('input-numero-treno').addEventListener('keydown', e => {
  if (e.key === 'Enter') cercaTreno();
});

async function cercaTreno() {
  const num = document.getElementById('input-numero-treno').value.trim();
  if (!num) { showToast('Inserisci un numero di treno.'); return; }

  const el = document.getElementById('result-treno');
  el.innerHTML = loaderHTML('Ricerca treno in corso…');

  try {
    const meta = await apiFetch({ action: 'cerca_treno', numero: num });
    if (!meta.codStazione) throw new Error('Stazione di partenza non trovata');

    el.innerHTML = loaderHTML('Caricamento andamento in tempo reale…');

    const andamento = await apiFetch({
      action:   'andamento_treno',
      stazione: meta.codStazione,
      treno:    meta.codTreno,
      data:     meta.timestamp || ''
    });

    el.innerHTML = renderAndamento(andamento, meta);
  } catch (e) {
    el.innerHTML = msgBox('error', 'triangle-exclamation',
      `Treno ${num} non trovato o non circolante oggi. (${e.message})`);
  }
}

function renderAndamento(d, meta) {
  if (!d || typeof d !== 'object')
    return msgBox('error', 'circle-exclamation', 'Nessun dato disponibile per questo treno.');

  const ritardoMin = d.ritardo ?? d.ritardoUltimoRilevamento ?? null;
  const soppresso  = d.provvedimento === 1;
  const numero     = d.numeroTreno ?? meta.codTreno ?? '—';
  const categoria  = d.categoria ?? '';
  const origine    = d.origine ?? '—';
  const dest       = d.destinazione ?? '—';
  const fermate    = d.fermate ?? [];

  const ultimoRil = (d.stazioneUltimoRilevamento && d.stazioneUltimoRilevamento !== 'undefined')
    ? d.stazioneUltimoRilevamento : '—';
  const oraUlt = d.oraUltimoRilevamento ? fmtTime(d.oraUltimoRilevamento) : '';

  const badgeHTML = soppresso
    ? '<span class="badge-ritardo badge-soppresso"><i class="fa-solid fa-ban"></i> Soppresso</span>'
    : ritardoBadge(ritardoMin);

  const origineHTML = meta.codStazione
    ? `<span class="link-stazione" data-id="${meta.codStazione}" data-nome="${origine}">${origine}</span>`
    : origine;

  return `
    <div class="treno-card">
      <div class="treno-card-header">
        <div class="treno-numero">${numero}</div>
        <div class="treno-info">
          <div class="treno-rotta">${categoria} · ${origineHTML} → ${dest}</div>
          <div class="treno-categoria">${meta.label ?? ''}</div>
        </div>
        ${badgeHTML}
      </div>
      <div class="treno-card-meta">
        <div class="meta-item">
          <i class="fa-solid fa-location-crosshairs"></i>
          <span>Ultimo rilevamento: <strong>${ultimoRil}${oraUlt ? ' · ' + oraUlt : ''}</strong></span>
        </div>
        ${ritardoMin !== null ? `
        <div class="meta-item">
          <i class="fa-solid fa-clock"></i>
          <span>Ritardo: <strong>${ritardoMin > 0 ? '+' + ritardoMin : ritardoMin} min</strong></span>
        </div>` : ''}
        <div class="meta-item">
          <i class="fa-solid fa-calendar-day"></i>
          <span>Data: <strong>${d.dataPartenzaTreno
            ? new Date(d.dataPartenzaTreno).toLocaleDateString('it-IT') : '—'}</strong></span>
        </div>
      </div>
      ${fermate.length
        ? renderFermate(fermate)
        : `<div style="padding:1rem 1.5rem">${msgBox('empty', 'circle-info', 'Nessuna fermata disponibile.')}</div>`}
    </div>`;
}

function renderFermate(fermate) {
  const lastPassataIndex = fermate
    .map((f, i) => (f.actualFermataType && f.actualFermataType !== 0 ? i : -1))
    .filter(i => i !== -1).pop();

  const rows = fermate.map((f, index) => {
    const nome   = f.stazione ?? '—';
    const codSt  = f.id ?? '';
    const progPart = f.programmataPartenza ?? f.programmataArrivo ?? f.programmata ?? f.orarioArrivo ?? f.orarioPartenza ?? null;
    const effPart  = f.effettivaPartenza ?? f.effettivaArrivo ?? f.effettiva ?? null;
    const ritMin   = calcRitardoMin(progPart, effPart);
    const binario  = f.binarioProgrammatoPartenzaDescrizione ?? f.binarioProgrammatoArrivoDescrizione ?? '—';
    const binEff   = f.binarioEffettivoPartenzaDescrizione ?? f.binarioEffettivoArrivoDescrizione ?? '';
    const isPassata = (f.actualFermataType ?? 0) !== 0;
    const isUltima  = index === lastPassataIndex;

    let rowClass = isPassata ? 'fermata-passata' : 'fermata-futura';
    if (isUltima) rowClass += ' fermata-ultima';

    const effHTML  = effPart
      ? `<span class="orario-effettivo ${orarioClass(ritMin)}">${fmtTime(effPart)}</span>`
      : '<span class="orario-effettivo">—</span>';

    const binHTML  = binario !== '—'
      ? `<span class="binario-chip">${binario}</span>${binEff && binEff !== binario
          ? ` <span class="binario-chip binario-eff">${binEff}</span>` : ''}`
      : '—';

    const nomeHTML = nome !== '—'
      ? `<span class="link-stazione" data-id="${codSt}" data-nome="${nome}">${nome}</span>`
      : nome;

    return `
      <tr class="${rowClass}">
        <td class="col-progresso">
          <div class="col-progresso-inner">
            <div class="linea-percorso ${isPassata ? 'fatto' : ''}"></div>
            <div class="punto-percorso ${isPassata ? 'fatto' : ''} ${isUltima ? 'attuale' : ''}"></div>
          </div>
        </td>
        <td class="fermata-nome">${nomeHTML}</td>
        <td class="orario-programmato">${fmtTime(progPart)}</td>
        <td>${effHTML}</td>
        <td>${binHTML}</td>
      </tr>`;
  }).join('');

  return `
    <div class="fermate-title">
      <i class="fa-solid fa-list-ul"></i> Fermate (${fermate.length})
    </div>
    <table class="fermate-table">
      <colgroup>
        <col style="width:44px"><col><col style="width:90px">
        <col style="width:90px"><col style="width:80px">
      </colgroup>
      <thead>
        <tr><th></th><th>Stazione</th><th>Previsto</th><th>Effettivo</th><th>Binario</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 2 — TABELLONE STAZIONE
// ═══════════════════════════════════════════════════════════════════════════════
document.getElementById('btn-cerca-stazione').addEventListener('click', () => {
  const id   = document.getElementById('hidden-stazione-id').value;
  const nome = document.getElementById('input-stazione').value.trim();
  if (!id) { showToast('Seleziona una stazione dalla lista dei suggerimenti.'); return; }
  stazioneCorrente = { id, nome };
  caricaTabellone(id, nome, direzioneCorrente);
});

document.getElementById('input-stazione').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  const id   = document.getElementById('hidden-stazione-id').value;
  const nome = document.getElementById('input-stazione').value.trim();
  if (id) { stazioneCorrente = { id, nome }; caricaTabellone(id, nome, direzioneCorrente); }
});

document.querySelectorAll('.toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    direzioneCorrente = btn.dataset.dir;
    if (stazioneCorrente) caricaTabellone(stazioneCorrente.id, stazioneCorrente.nome, direzioneCorrente);
  });
});

async function caricaTabellone(id, nome, dir) {
  const el = document.getElementById('result-stazione');
  document.getElementById('toggle-dir').hidden = false;
  el.innerHTML = loaderHTML(`Caricamento ${dir}…`);
  try {
    const data = await apiFetch({ action: dir === 'partenze' ? 'partenze' : 'arrivi', stazione: id });
    el.innerHTML = renderTabellone(data, nome, dir);
  } catch (e) {
    el.innerHTML = msgBox('error', 'triangle-exclamation', `Errore caricamento tabellone: ${e.message}`);
  }
}

function renderTabellone(trains, nomeStazione, dir) {
  const header = `
    <div class="tabellone-header">
      <span class="tabellone-stazione-nome">
        <i class="fa-solid fa-location-dot" style="color:var(--accent)"></i> ${nomeStazione}
      </span>`;

  if (!Array.isArray(trains) || !trains.length) {
    return header + `</div>
      ${msgBox('empty', 'inbox', `Nessun treno in ${dir === 'partenze' ? 'partenza' : 'arrivo'} al momento.`)}`;
  }

  const isPartenze = dir === 'partenze';
  const colLabel   = isPartenze ? 'Destinazione' : 'Provenienza';
  const orLabel    = isPartenze ? 'Partenza' : 'Arrivo';

  const rows = trains.map(t => {
    const numero   = t.numeroTreno ?? '—';
    const categ    = t.categoria ?? '';
    const dest     = isPartenze ? (t.destinazione ?? '—') : (t.origine ?? '—');
    const orario   = isPartenze ? t.orarioPartenza : t.orarioArrivo;
    const ritardo  = t.ritardo ?? null;
    const codDest  = isPartenze ? (t.codiceDestinazione ?? '') : (t.codiceOrigine ?? '');
    const binProg  = t.binarioProgrammatoPartenzaDescrizione ?? t.binarioProgrammatoArrivoDescrizione ?? '';
    const binEff   = t.binarioEffettivoPartenzaDescrizione   ?? t.binarioEffettivoArrivoDescrizione   ?? '';

    const numeroHTML = numero !== '—'
      ? `<span class="link-treno" data-numero="${numero}" title="Traccia treno ${numero}">${numero}</span>`
      : '—';

    const destHTML = dest !== '—'
      ? `<span class="link-stazione" data-id="${codDest}" data-nome="${dest}">${dest}</span>`
      : '—';

    let ritardoHTML = `<span style="color:var(--text-muted)">—</span>`;
    if (ritardo !== null) {
      if (ritardo <= 0)
        ritardoHTML = `<span style="color:var(--go);font-weight:600">✓</span>`;
      else if (ritardo <= 5)
        ritardoHTML = `<span style="color:var(--warn);font-family:var(--font-mono);font-size:.82rem">+${ritardo}'</span>`;
      else
        ritardoHTML = `<span style="color:var(--danger);font-family:var(--font-mono);font-size:.82rem">+${ritardo}'</span>`;
    }

    let binHTML = '—';
    if (binProg || binEff) {
      const bP = binProg || '?';
      binHTML = (binEff && binEff !== bP)
        ? `<span class="binario-chip" style="text-decoration:line-through;opacity:.5">${bP}</span>
           <span class="binario-chip" style="color:var(--accent)">${binEff}</span>`
        : `<span class="binario-chip">${bP}</span>`;
    }

    return `<tr>
      <td style="font-family:var(--font-mono);color:var(--accent);font-weight:500">${numeroHTML}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${categ}</td>
      <td style="font-weight:500">${destHTML}</td>
      <td style="font-family:var(--font-mono)">${fmtTime(orario)}</td>
      <td>${binHTML}</td>
      <td>${ritardoHTML}</td>
    </tr>`;
  }).join('');

  return header +
    `<span style="font-size:.8rem;color:var(--text-muted)">${trains.length} treni · aggiornato adesso</span>
    </div>
    <table class="tabellone-table">
      <thead>
        <tr><th>N°</th><th>Cat.</th><th>${colLabel}</th><th>${orLabel}</th><th>Binario</th><th>Ritardo</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB 3 — SOLUZIONI DI VIAGGIO
// ═══════════════════════════════════════════════════════════════════════════════
function setDefaultDatetime() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
  const el = document.getElementById('input-data');
  if (el) el.value = now.toISOString().slice(0, 16);
}
setDefaultDatetime();

document.getElementById('btn-swap').addEventListener('click', () => {
  const iO = document.getElementById('input-orig'),      hO = document.getElementById('hidden-orig-id');
  const iD = document.getElementById('input-dest'),      hD = document.getElementById('hidden-dest-id');
  [iO.value, iD.value] = [iD.value, iO.value];
  [hO.value, hD.value] = [hD.value, hO.value];
});

document.getElementById('btn-cerca-viaggio').addEventListener('click', cercaViaggio);

async function cercaViaggio() {
  const origId   = document.getElementById('hidden-orig-id').value;
  const destId   = document.getElementById('hidden-dest-id').value;
  const origNome = document.getElementById('input-orig').value.trim();
  const destNome = document.getElementById('input-dest').value.trim();
  const dataVal  = document.getElementById('input-data').value;

  if (!origId) { showToast('Seleziona la stazione di partenza dalla lista.'); return; }
  if (!destId) { showToast('Seleziona la stazione di arrivo dalla lista.');   return; }

  const el = document.getElementById('result-viaggio');
  el.innerHTML = loaderHTML('Ricerca soluzioni di viaggio…');

  const dataISO = dataVal
    ? (dataVal.length === 16 ? dataVal + ':00' : dataVal)
    : new Date().toISOString().slice(0, 19);

  try {
    const resp = await apiFetch({ action: 'soluzioni_viaggio', orig: origId, dest: destId, data: dataISO });
    el.innerHTML = renderSoluzioni(resp, origNome, destNome);
  } catch (e) {
    el.innerHTML = msgBox('error', 'triangle-exclamation', `Errore: ${e.message}`);
  }
}

function formatDurata(da, a) {
  if (!da || !a) return null;
  const diff = parseInt(a) - parseInt(da);
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function renderSoluzioni(data, origNome, destNome) {
  const soluzioni = data?.soluzioni ?? (Array.isArray(data) ? data : []);
  if (!soluzioni.length)
    return msgBox('empty', 'inbox',
      `Nessuna soluzione trovata da <strong>${origNome}</strong> a <strong>${destNome}</strong>.`);

  const cards = soluzioni.map(sol => {
    const partenza = sol.orarioPartenza ?? null;
    const arrivo   = sol.orarioArrivo   ?? null;
    const durata   = formatDurata(partenza, arrivo);
    const cambi    = Math.max(0, (sol.vehicles?.length ?? 1) - 1);
    const cambiCls = cambi === 0 ? 'zero-cambi' : '';

    const legs = (sol.vehicles ?? []).map(v => {
      const numTreno = v.numeroTreno ?? '—';
      const numHTML  = numTreno !== '—'
        ? `<span class="link-treno leg-treno" data-numero="${numTreno}">${numTreno}</span>`
        : '<span class="leg-treno">—</span>';

      return `
        <div class="leg-item">
          <i class="fa-solid fa-train"></i>
          ${numHTML}
          <span>${v.origine ?? '—'}</span>
          <i class="fa-solid fa-arrow-right" style="color:var(--text-muted);font-size:.7rem"></i>
          <span>${v.destinazione ?? '—'}</span>
          <span style="margin-left:auto;font-family:var(--font-mono);font-size:.8rem;color:var(--text-muted)">
            ${fmtTime(v.orarioPartenza)} – ${fmtTime(v.orarioArrivo)}
          </span>
        </div>`;
    }).join('');

    return `
      <div class="soluzione-card">
        <div class="soluzione-header">
          <div class="soluzione-orari">
            <span class="soluzione-ora">${fmtTime(partenza)}</span>
            <span class="soluzione-freccia"><i class="fa-solid fa-arrow-right"></i></span>
            <span class="soluzione-ora">${fmtTime(arrivo)}</span>
            ${durata ? `<span class="soluzione-durata"><i class="fa-regular fa-clock"></i> ${durata}</span>` : ''}
          </div>
          <div class="soluzione-cambi ${cambiCls}">
            <i class="fa-solid fa-${cambi === 0 ? 'circle-check' : 'shuffle'}"></i>
            ${cambi === 0 ? 'Diretto' : cambi + ' cambio' + (cambi > 1 ? 'i' : '')}
          </div>
        </div>
        ${legs ? `<div class="soluzione-legs">${legs}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div style="margin-bottom:1rem;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
      <span style="font-family:var(--font-display);font-size:1.2rem;color:var(--white)">${origNome}</span>
      <i class="fa-solid fa-arrow-right" style="color:var(--accent)"></i>
      <span style="font-family:var(--font-display);font-size:1.2rem;color:var(--white)">${destNome}</span>
      <span style="color:var(--text-muted);font-size:.85rem">(${soluzioni.length} soluzioni)</span>
    </div>
    ${cards}`;
}

// ─── Clock & Theme (erano inline in index.html) ───────────────────────────────
(function () {
  const clockEl    = document.getElementById('live-clock');
  const html       = document.documentElement;
  const toggleBtn  = document.getElementById('theme-toggle');
  const toggleIcon = document.getElementById('theme-icon');

  function updateClock() {
    if (clockEl) clockEl.textContent =
      new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  setInterval(updateClock, 1000);
  updateClock();

  if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    html.setAttribute('data-theme', 'light');
    toggleIcon.className = 'fa-solid fa-moon';
  }

  toggleBtn.addEventListener('click', () => {
    const isLight = html.getAttribute('data-theme') === 'light';
    html.setAttribute('data-theme', isLight ? 'dark' : 'light');
    toggleIcon.className = isLight ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  });
})();