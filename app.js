(function () {
  "use strict";

  const PRAZO_MINUTES = { "45min": 45, "1h": 60, "2h": 120 };
  const PRAZO_LABELS = { "45min": "45 min", "1h": "1 hora", "2h": "2 horas" };
  const PRAZO_KEYS = ["45min", "1h", "2h"];
  const OUTPUT_HEADER = [
    "ZipCodeStart", "ZipCodeEnd", "PolygonName", "WeightStart", "WeightEnd",
    "AbsoluteMoneyCost", "PricePercent", "PriceByExtraWeight", "MaxVolume",
    "TimeCost", "Country", "MinimumValueInsurance"
  ];

  let modalityIdCounter = 0;
  let expandedModalityIds = new Set();
  let state = {
    modalities: [],
    parsed: { records: [], validUnique: [], invalid: [], duplicateCount: 0, byPrazo: {} }
  };

  // ---------- DOM refs ----------
  const el = (id) => document.getElementById(id);
  const filialInput = el("filial");
  const filialPreview = el("filialPreview");
  const filialError = el("filialError");
  const cepInputs = {
    "45min": el("cepInput-45min"),
    "1h": el("cepInput-1h"),
    "2h": el("cepInput-2h")
  };
  const dedupeCheckbox = el("dedupeCheckbox");
  const rangeCheckbox = el("rangeCheckbox");
  const rangeHint = el("rangeHint");
  const previewHeadRow = el("previewHeadRow");
  const countTotal = el("countTotal");
  const countValid = el("countValid");
  const countInvalid = el("countInvalid");
  const countDuplicate = el("countDuplicate");
  const splitWarning = el("splitWarning");
  const toggleInvalidBtn = el("toggleInvalidBtn");
  const invalidListWrap = el("invalidListWrap");
  const invalidList = el("invalidList");
  const togglePreviewBtn = el("togglePreviewBtn");
  const previewWrap = el("previewWrap");
  const previewBody = el("previewBody");
  const previewMore = el("previewMore");
  const modalitiesBody = el("modalitiesBody");
  const addModalityBtn = el("addModalityBtn");
  const modalitiesError = el("modalitiesError");
  const weightStartInput = el("weightStart");
  const weightEndInput = el("weightEnd");
  const splitLimitInput = el("splitLimit");
  const outputFormatSelect = el("outputFormat");
  const namePrefixInput = el("namePrefix");
  const nameSeparatorInput = el("nameSeparator");
  const nameSuffixInput = el("nameSuffix");
  const fileNamePreview = el("fileNamePreview");
  const generateBtn = el("generateBtn");
  const generateError = el("generateError");
  const statusLog = el("statusLog");
  const toggleAdvancedBtn = el("toggleAdvancedBtn");
  const advancedPanel = el("advancedPanel");
  const prazoTabs = document.querySelectorAll(".prazo-tab");
  const prazoPanels = document.querySelectorAll(".prazo-panel");
  const updateMapBtn = el("updateMapBtn");
  const downloadCoordsBtn = el("downloadCoordsBtn");
  const downloadReportBtn = el("downloadReportBtn");
  const mapStatus = el("mapStatus");
  const toggleNotFoundBtn = el("toggleNotFoundBtn");
  const notFoundWrap = el("notFoundWrap");
  const notFoundList = el("notFoundList");
  const cepAbertoTokenInput = el("cepAbertoToken");

  // ---------- Helpers ----------
  function pad2(n) { return String(n).padStart(2, "0"); }

  function minutesToHHMMSS(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    return `${pad2(h)}:${pad2(m)}:00`;
  }

  function cleanCep(raw) {
    return (raw || "").replace(/\D/g, "");
  }

  function formatFilial(raw) {
    const digits = (raw || "").trim();
    if (!digits) return { ok: false, error: "Informe o número da filial." };
    if (!/^\d+$/.test(digits)) return { ok: false, error: "Filial deve conter apenas números." };
    if (digits.length > 4) return { ok: false, error: "Filial deve ter no máximo 4 dígitos." };
    return { ok: true, value: digits.padStart(4, "0") };
  }

  function chunkArray(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function log(msg) {
    statusLog.hidden = false;
    statusLog.textContent += msg + "\n";
    statusLog.scrollTop = statusLog.scrollHeight;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function csvEscape(value) {
    const s = String(value);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  // ---------- Prazo tabs (CEP paste areas) ----------
  prazoTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const prazo = tab.dataset.prazo;
      const panel = document.querySelector(`.prazo-panel[data-prazo="${prazo}"]`);
      const willShow = panel.hidden;
      panel.hidden = !willShow;
      tab.classList.toggle("active", willShow);
    });
  });

  // ---------- Modalities ----------
  function defaultModalities() {
    return [
      { id: modalityIdCounter++, nome: "Rápida", sigla: "E", valor: 9.9, prazoTipo: "porCep", prazoFixoMinutos: 120, selecionada: true },
      { id: modalityIdCounter++, nome: "Rápida SJ", sigla: "ESJ", valor: 9.9, prazoTipo: "porCep", prazoFixoMinutos: 120, selecionada: true },
      { id: modalityIdCounter++, nome: "Programada", sigla: "P", valor: 5.9, prazoTipo: "fixo", prazoFixoMinutos: 10, selecionada: true },
      { id: modalityIdCounter++, nome: "Programada SJ", sigla: "PSJ", valor: 5.9, prazoTipo: "fixo", prazoFixoMinutos: 10, selecionada: true }
    ];
  }

  function renderModalities() {
    modalitiesBody.innerHTML = "";
    state.modalities.forEach((mod) => {
      const tr = document.createElement("tr");
      tr.dataset.id = mod.id;

      const tdCheck = document.createElement("td");
      const checkInput = document.createElement("input");
      checkInput.type = "checkbox";
      checkInput.checked = mod.selecionada;
      checkInput.title = "Incluir esta modalidade na geração";
      checkInput.addEventListener("change", () => {
        mod.selecionada = checkInput.checked;
        tr.classList.toggle("mod-unchecked", !mod.selecionada);
        updateFileNamePreview();
      });
      tdCheck.appendChild(checkInput);
      tr.classList.toggle("mod-unchecked", !mod.selecionada);

      const tdNome = document.createElement("td");
      tdNome.className = "mod-name";
      tdNome.textContent = mod.nome;

      const tdPrazo = document.createElement("td");
      renderPrazoCell(tdPrazo, mod);

      const tdValor = document.createElement("td");
      const valorInput = document.createElement("input");
      valorInput.type = "number";
      valorInput.step = "0.01";
      valorInput.min = "0";
      valorInput.value = mod.valor;
      valorInput.addEventListener("input", () => { mod.valor = parseFloat(valorInput.value) || 0; });
      tdValor.appendChild(valorInput);

      const tdGear = document.createElement("td");
      const gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "gear-btn";
      gearBtn.textContent = "⚙ Configurar";
      gearBtn.classList.toggle("active", expandedModalityIds.has(mod.id));
      gearBtn.addEventListener("click", () => {
        if (expandedModalityIds.has(mod.id)) expandedModalityIds.delete(mod.id);
        else expandedModalityIds.add(mod.id);
        renderModalities();
      });
      tdGear.appendChild(gearBtn);

      const tdRemove = document.createElement("td");
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "remove-btn";
      removeBtn.textContent = "Remover";
      removeBtn.addEventListener("click", () => {
        state.modalities = state.modalities.filter((m) => m.id !== mod.id);
        expandedModalityIds.delete(mod.id);
        renderModalities();
        updateFileNamePreview();
      });
      tdRemove.appendChild(removeBtn);

      tr.append(tdCheck, tdNome, tdPrazo, tdValor, tdGear, tdRemove);
      modalitiesBody.appendChild(tr);

      if (expandedModalityIds.has(mod.id)) {
        modalitiesBody.appendChild(buildConfigRow(mod));
      }
    });
  }

  function renderPrazoCell(tdPrazo, mod) {
    tdPrazo.innerHTML = "";
    if (mod.prazoTipo === "porCep") {
      const badge = document.createElement("span");
      badge.className = "mod-prazo-badge";
      badge.textContent = "Segue prazo do CEP";
      tdPrazo.appendChild(badge);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "mod-prazo-fixed";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.value = mod.prazoFixoMinutos;
      input.addEventListener("input", () => { mod.prazoFixoMinutos = parseInt(input.value, 10) || 0; });
      const unit = document.createElement("span");
      unit.textContent = "min";
      wrap.append(input, unit);
      tdPrazo.appendChild(wrap);
    }
  }

  function buildConfigRow(mod) {
    const tr = document.createElement("tr");
    tr.className = "mod-config-row";
    const td = document.createElement("td");
    td.colSpan = 6;

    const grid = document.createElement("div");
    grid.className = "mod-config-grid";

    const nomeField = document.createElement("div");
    const nomeLabel = document.createElement("label");
    nomeLabel.textContent = "Nome de exibição";
    const nomeInput = document.createElement("input");
    nomeInput.type = "text";
    nomeInput.value = mod.nome;
    nomeInput.addEventListener("input", () => {
      mod.nome = nomeInput.value;
      const row = modalitiesBody.querySelector(`tr[data-id="${mod.id}"] .mod-name`);
      if (row) row.textContent = mod.nome;
    });
    nomeField.append(nomeLabel, nomeInput);

    const siglaField = document.createElement("div");
    const siglaLabel = document.createElement("label");
    siglaLabel.textContent = "Sigla (nome do arquivo)";
    const siglaInput = document.createElement("input");
    siglaInput.type = "text";
    siglaInput.value = mod.sigla;
    siglaInput.addEventListener("input", () => { mod.sigla = siglaInput.value.trim(); updateFileNamePreview(); });
    siglaField.append(siglaLabel, siglaInput);

    const tipoField = document.createElement("div");
    const tipoLabel = document.createElement("label");
    tipoLabel.textContent = "Tipo de prazo";
    const tipoSelect = document.createElement("select");
    const optPorCep = document.createElement("option");
    optPorCep.value = "porCep";
    optPorCep.textContent = "Por CEP (45min/1h/2h)";
    const optFixo = document.createElement("option");
    optFixo.value = "fixo";
    optFixo.textContent = "Fixo";
    tipoSelect.append(optPorCep, optFixo);
    tipoSelect.value = mod.prazoTipo;
    tipoSelect.addEventListener("change", () => {
      mod.prazoTipo = tipoSelect.value;
      const prazoCell = modalitiesBody.querySelector(`tr[data-id="${mod.id}"] td:nth-child(3)`);
      if (prazoCell) renderPrazoCell(prazoCell, mod);
    });
    tipoField.append(tipoLabel, tipoSelect);

    grid.append(nomeField, siglaField, tipoField);
    td.appendChild(grid);
    tr.appendChild(td);
    return tr;
  }

  addModalityBtn.addEventListener("click", () => {
    state.modalities.push({
      id: modalityIdCounter++,
      nome: "Nova modalidade",
      sigla: "NM" + (state.modalities.length + 1),
      valor: 0,
      prazoTipo: "fixo",
      prazoFixoMinutos: 120,
      selecionada: true
    });
    renderModalities();
    updateFileNamePreview();
  });

  // ---------- CEP parsing ----------
  function parseBucketText(text, prazo, rangeMode) {
    const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l.length > 0);
    return lines.map((line, idx) => {
      if (rangeMode) {
        const digits = cleanCep(line);
        if (digits.length !== 16) {
          return {
            bucket: prazo, lineIndex: idx, raw: line, cepStart: "", cepEnd: "", prazo, valid: false,
            reason: "Faixa inválida: informe os 2 CEPs (inicial e final) de 8 dígitos cada, na mesma linha."
          };
        }
        const cepStart = digits.slice(0, 8);
        const cepEnd = digits.slice(8, 16);
        if (cepStart > cepEnd) {
          return {
            bucket: prazo, lineIndex: idx, raw: line, cepStart, cepEnd, prazo, valid: false,
            reason: "CEP inicial maior que o CEP final."
          };
        }
        return { bucket: prazo, lineIndex: idx, raw: line, cepStart, cepEnd, prazo, valid: true };
      }
      const cep = cleanCep(line);
      const valid = cep.length === 8;
      return {
        bucket: prazo, lineIndex: idx, raw: line, cepStart: cep, cepEnd: cep, prazo, valid,
        reason: valid ? undefined : "CEP com quantidade de dígitos incorreta ou caractere não numérico."
      };
    });
  }

  function analyzeRecords(records, dedupe) {
    const invalid = records.filter((r) => !r.valid);
    const validRecords = records.filter((r) => r.valid);
    const seen = new Map(); // key -> índice do registro vencedor em validUnique
    const validUnique = [];
    let duplicateCount = 0;
    validRecords.forEach((r) => {
      const key = `${r.cepStart}-${r.cepEnd}`;
      const winnerIdx = seen.get(key);
      if (winnerIdx !== undefined) {
        duplicateCount++;
        if (!dedupe) {
          validUnique.push(r);
        } else if (PRAZO_MINUTES[r.prazo] < PRAZO_MINUTES[validUnique[winnerIdx].prazo]) {
          // Duplicado com prazo diferente: o menor prazo sempre prevalece.
          validUnique[winnerIdx] = r;
        }
      } else {
        seen.set(key, validUnique.length);
        validUnique.push(r);
      }
    });
    return { records, invalid, validUnique, duplicateCount };
  }

  function reparse() {
    let allRecords = [];
    const byPrazo = {};
    const rangeMode = rangeCheckbox.checked;
    PRAZO_KEYS.forEach((prazo) => {
      const records = parseBucketText(cepInputs[prazo].value, prazo, rangeMode);
      byPrazo[prazo] = records;
      allRecords = allRecords.concat(records);
    });
    const analyzed = analyzeRecords(allRecords, dedupeCheckbox.checked);
    state.parsed = { ...analyzed, byPrazo, rangeMode };
    renderTabCounts();
    renderCounters();
    renderInvalidList();
    renderPreview();
  }

  function renderTabCounts() {
    PRAZO_KEYS.forEach((prazo) => {
      const validCount = state.parsed.byPrazo[prazo].filter((r) => r.valid).length;
      el(`tabCount-${prazo}`).textContent = validCount;
    });
  }

  function renderCounters() {
    const { records, invalid, validUnique, duplicateCount } = state.parsed;
    countTotal.textContent = records.length;
    countValid.textContent = validUnique.length;
    countInvalid.textContent = invalid.length;
    countDuplicate.textContent = duplicateCount;

    const limit = parseInt(splitLimitInput.value, 10) || 8999;
    if (validUnique.length > limit) {
      const parts = Math.ceil(validUnique.length / limit);
      splitWarning.hidden = false;
      splitWarning.textContent = `A lista tem ${validUnique.length} CEPs válidos, acima do limite de ${limit} por arquivo. Cada modalidade será dividida automaticamente em ${parts} arquivos, empacotados em um .zip.`;
    } else {
      splitWarning.hidden = true;
    }
  }

  function renderInvalidList() {
    const { invalid } = state.parsed;
    toggleInvalidBtn.textContent = `Ver CEPs inválidos (${invalid.length})`;
    invalidList.innerHTML = "";
    invalid.forEach((rec) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      const reasonText = rec.reason ? ` — ${rec.reason}` : "";
      span.textContent = `${rec.raw} (${PRAZO_LABELS[rec.bucket]})${reasonText}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "remove-btn";
      btn.textContent = "Remover da lista";
      btn.addEventListener("click", () => {
        const textarea = cepInputs[rec.bucket];
        const lines = textarea.value.split(/\r\n|\n|\r/);
        lines.splice(rec.lineIndex, 1);
        textarea.value = lines.join("\n");
        reparse();
      });
      li.append(span, btn);
      invalidList.appendChild(li);
    });
  }

  function renderPreview() {
    const { validUnique, rangeMode } = state.parsed;
    previewHeadRow.innerHTML = rangeMode
      ? "<th>CEP inicial</th><th>CEP final</th><th>Prazo interpretado</th>"
      : "<th>CEP</th><th>Prazo interpretado</th>";
    previewBody.innerHTML = "";
    const sample = validUnique.slice(0, 20);
    sample.forEach((rec) => {
      const tr = document.createElement("tr");
      const tdStart = document.createElement("td");
      tdStart.textContent = rec.cepStart;
      const tdPrazo = document.createElement("td");
      tdPrazo.textContent = PRAZO_LABELS[rec.prazo];
      if (rangeMode) {
        const tdEnd = document.createElement("td");
        tdEnd.textContent = rec.cepEnd;
        tr.append(tdStart, tdEnd, tdPrazo);
      } else {
        tr.append(tdStart, tdPrazo);
      }
      previewBody.appendChild(tr);
    });
    previewMore.textContent = validUnique.length > 20
      ? `Mostrando 20 de ${validUnique.length} CEPs válidos.`
      : (validUnique.length === 0 ? "Nenhum CEP válido ainda." : `Mostrando todos os ${validUnique.length} CEPs válidos.`);
  }

  toggleInvalidBtn.addEventListener("click", () => {
    invalidListWrap.hidden = !invalidListWrap.hidden;
  });
  togglePreviewBtn.addEventListener("click", () => {
    previewWrap.hidden = !previewWrap.hidden;
  });
  toggleAdvancedBtn.addEventListener("click", () => {
    advancedPanel.hidden = !advancedPanel.hidden;
  });

  PRAZO_KEYS.forEach((prazo) => {
    cepInputs[prazo].addEventListener("input", debounce(reparse, 150));
  });
  dedupeCheckbox.addEventListener("change", reparse);
  rangeCheckbox.addEventListener("change", () => {
    rangeHint.hidden = !rangeCheckbox.checked;
    reparse();
  });
  splitLimitInput.addEventListener("input", renderCounters);

  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }

  // ---------- Filial ----------
  function updateFilialPreview() {
    const res = formatFilial(filialInput.value);
    if (res.ok) {
      filialPreview.textContent = res.value;
      filialError.hidden = true;
    } else {
      filialPreview.textContent = "—";
    }
    updateFileNamePreview();
    return res;
  }
  filialInput.addEventListener("input", updateFilialPreview);

  // ---------- File naming ----------
  function buildFileName(filial4, sigla, partIndex, totalParts, ext) {
    const applyTemplate = (tpl) => tpl.replace(/\{filial\}/g, filial4).replace(/\{sigla\}/g, sigla);
    let name = applyTemplate(namePrefixInput.value) + nameSeparatorInput.value + applyTemplate(nameSuffixInput.value);
    if (totalParts > 1) name += `_${partIndex + 1}`;
    return `${name}.${ext}`;
  }

  function updateFileNamePreview() {
    const filialRes = formatFilial(filialInput.value);
    const filial4 = filialRes.ok ? filialRes.value : "0000";
    const selected = state.modalities.filter((m) => m.selecionada);
    const sigla = (selected[0] || state.modalities[0]) ? (selected[0] || state.modalities[0]).sigla || "SIGLA" : "SIGLA";
    const ext = outputFormatSelect.value;
    fileNamePreview.textContent = buildFileName(filial4, sigla, 0, 1, ext);
  }
  namePrefixInput.addEventListener("input", updateFileNamePreview);
  nameSeparatorInput.addEventListener("input", updateFileNamePreview);
  nameSuffixInput.addEventListener("input", updateFileNamePreview);
  outputFormatSelect.addEventListener("change", updateFileNamePreview);

  // ---------- Sheet building ----------
  // ZipCodeStart/ZipCodeEnd and the numeric fields are written as plain Numbers with
  // the default "General" format, matching a known-good reference file produced by
  // the original macro (verified by inspecting its cells directly). VTEX compares
  // CEPs numerically, so the leading zero in e.g. "01310100" is not meaningful here.
  function buildRows(validRecords, modality) {
    const weightStart = parseFloat(weightStartInput.value) || 0;
    const weightEnd = parseFloat(weightEndInput.value) || 0;
    return validRecords.map((rec) => {
      const timeMinutes = modality.prazoTipo === "fixo" ? modality.prazoFixoMinutos : PRAZO_MINUTES[rec.prazo];
      return [
        Number(rec.cepStart), Number(rec.cepEnd), "", weightStart, weightEnd,
        modality.valor, 0, 0, 1000000000,
        minutesToHHMMSS(timeMinutes), "BRA", 0
      ];
    });
  }

  function rowsToSheet(rows) {
    const aoa = [OUTPUT_HEADER, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    for (let r = 1; r <= rows.length; r++) {
      const timeCostAddr = XLSX.utils.encode_cell({ r, c: 9 });
      if (ws[timeCostAddr]) ws[timeCostAddr].z = "@"; // TimeCost, kept as text
      delete ws[XLSX.utils.encode_cell({ r, c: 2 })]; // PolygonName, left truly empty
    }
    return ws;
  }

  function sheetToXlsBlob(ws) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Frete");
    const out = XLSX.write(wb, { bookType: "biff8", type: "array" });
    return new Blob([out], { type: "application/vnd.ms-excel" });
  }

  function sheetToCsvBlob(ws) {
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: "," });
    return new Blob([csv], { type: "text/csv;charset=utf-8;" });
  }

  // ---------- Validation ----------
  function validateBeforeGenerate() {
    let ok = true;
    filialError.hidden = true;
    generateError.hidden = true;
    modalitiesError.hidden = true;

    const filialRes = formatFilial(filialInput.value);
    if (!filialRes.ok) {
      filialError.textContent = filialRes.error;
      filialError.hidden = false;
      ok = false;
    }

    if (state.parsed.validUnique.length === 0) {
      generateError.textContent = "Nenhum CEP válido para gerar. Cole ao menos um CEP válido em algum dos prazos.";
      generateError.hidden = false;
      ok = false;
    }

    const selectedModalities = state.modalities.filter((m) => m.selecionada);
    if (selectedModalities.length === 0) {
      modalitiesError.textContent = "Selecione ao menos uma modalidade de entrega (checkbox à esquerda).";
      modalitiesError.hidden = false;
      ok = false;
    } else {
      const siglas = new Set();
      for (const m of selectedModalities) {
        if (!m.sigla || !m.sigla.trim()) {
          modalitiesError.textContent = "Todas as modalidades precisam de uma sigla (usada no nome do arquivo). Abra ⚙ Configurar para editar.";
          modalitiesError.hidden = false;
          ok = false;
          break;
        }
        if (siglas.has(m.sigla)) {
          modalitiesError.textContent = `Sigla duplicada: "${m.sigla}". Cada modalidade precisa de uma sigla única.`;
          modalitiesError.hidden = false;
          ok = false;
          break;
        }
        siglas.add(m.sigla);
        if (m.prazoTipo === "fixo" && (!m.prazoFixoMinutos || m.prazoFixoMinutos <= 0)) {
          modalitiesError.textContent = `Modalidade "${m.nome}" precisa de um prazo fixo maior que zero.`;
          modalitiesError.hidden = false;
          ok = false;
          break;
        }
      }
    }

    return ok ? filialRes : null;
  }

  // ---------- Generate ----------
  async function generate() {
    statusLog.hidden = false;
    statusLog.textContent = "";
    const filialRes = validateBeforeGenerate();
    if (!filialRes) return;

    generateBtn.disabled = true;
    try {
      const filial4 = filialRes.value;
      const validRecords = state.parsed.validUnique;
      const limit = parseInt(splitLimitInput.value, 10) || 8999;
      const ext = outputFormatSelect.value;
      const chunks = chunkArray(validRecords, limit);
      const willZip = chunks.length > 1;
      const selectedModalities = state.modalities.filter((m) => m.selecionada);

      log(`Filial: ${filial4}`);
      log(`CEPs válidos a exportar: ${validRecords.length}`);
      log(`Modalidades: ${selectedModalities.map((m) => m.sigla).join(", ")}`);
      if (willZip) log(`Dividindo em ${chunks.length} arquivos por modalidade (limite ${limit} linhas).`);

      const files = [];
      for (const modality of selectedModalities) {
        for (let i = 0; i < chunks.length; i++) {
          const rows = buildRows(chunks[i], modality);
          const ws = rowsToSheet(rows);
          const blob = ext === "xls" ? sheetToXlsBlob(ws) : sheetToCsvBlob(ws);
          const filename = buildFileName(filial4, modality.sigla, i, chunks.length, ext);
          files.push({ name: filename, blob });
          log(`Gerado: ${filename} (${rows.length} linhas)`);
        }
      }

      if (willZip) {
        log("Empacotando arquivos em .zip...");
        const zip = new JSZip();
        files.forEach((f) => zip.file(f.name, f.blob));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        const zipName = `frete_${filial4}.zip`;
        triggerDownload(zipBlob, zipName);
        log(`Download iniciado: ${zipName}`);
      } else {
        for (let i = 0; i < files.length; i++) {
          setTimeout(() => triggerDownload(files[i].blob, files[i].name), i * 250);
        }
        log(`${files.length} arquivo(s) baixado(s) individualmente.`);
      }

      log("Concluído.");
    } catch (err) {
      generateError.textContent = "Erro ao gerar arquivos: " + err.message;
      generateError.hidden = false;
      log("Erro: " + err.message);
    } finally {
      generateBtn.disabled = false;
    }
  }

  generateBtn.addEventListener("click", generate);

  // ---------- Map / free geocoding ----------
  // Each CEP is geocoded on its own (cached by full CEP), but the map only marks
  // the neighborhood (bairro) each one resolves to - one marker per distinct
  // bairro, not one per CEP - since that is what "which areas does this list
  // cover" actually calls for. Free CEP APIs return bairro/city/state alongside
  // lat/lng, so this needs no extra requests beyond what geocoding already does.
  const PRAZO_COLORS = { "45min": "#2e7d32", "1h": "#f9a825", "2h": "#c62828" };
  const GEO_CACHE_KEY = "vtexFreteApp.geoCache.v4";
  const NO_BAIRRO_LABEL = "Bairro nao informado";

  let map = null;
  let markersLayer = null;
  let markerData = [];
  let geoCache = loadGeoCache();
  let geoQueriesThisRun = 0;
  let networkErrorsThisRun = 0;

  function loadGeoCache() {
    try {
      return JSON.parse(localStorage.getItem(GEO_CACHE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveGeoCache() {
    try {
      localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache));
    } catch (e) {
      // localStorage indisponivel (modo privado etc.) - cache fica so em memoria.
    }
  }

  function initMap() {
    if (map || typeof L === "undefined") return;
    map = L.map("mapEl").setView([-14.235, -51.9253], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    markersLayer = L.layerGroup().addTo(map);
  }

  function pickGeoInfo(data, source) {
    if (source === "awesome") {
      const lat = parseFloat(data.lat);
      const lng = parseFloat(data.lng);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng, bairro: (data.district || "").trim(), cidade: (data.city || "").trim(), uf: (data.state || "").trim() };
    }
    if (source === "brasilapi") {
      const coords = data.location && data.location.coordinates ? data.location.coordinates : null;
      const lat = coords ? parseFloat(coords.latitude) : NaN;
      const lng = coords ? parseFloat(coords.longitude) : NaN;
      if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
      return { lat, lng, bairro: (data.neighborhood || "").trim(), cidade: (data.city || "").trim(), uf: (data.state || "").trim() };
    }
    const lat = parseFloat(data.latitude);
    const lng = parseFloat(data.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
    return {
      lat,
      lng,
      bairro: (data.bairro || "").trim(),
      cidade: (data.cidade && data.cidade.nome ? data.cidade.nome : "").trim(),
      uf: (data.estado && data.estado.sigla ? data.estado.sigla : "").trim()
    };
  }

  function logGeoNetworkError(source, cep, err) {
    networkErrorsThisRun++;
    console.error(`[geocodeCep] ${source} falhou para ${cep}:`, err);
  }

  async function geocodeCep(cep) {
    try {
      const resp = await fetch(`https://cep.awesomeapi.com.br/json/${cep}`);
      if (resp.ok) {
        const info = pickGeoInfo(await resp.json(), "awesome");
        if (info) return info;
      }
    } catch (e) {
      // AwesomeAPI indisponivel - tenta a proxima opcao abaixo.
      logGeoNetworkError("AwesomeAPI", cep, e);
    }
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/cep/v2/${cep}`);
      if (resp.ok) {
        const info = pickGeoInfo(await resp.json(), "brasilapi");
        if (info) return info;
      }
    } catch (e) {
      // BrasilAPI indisponivel - tenta a ultima reserva abaixo.
      logGeoNetworkError("BrasilAPI", cep, e);
    }
    const token = cepAbertoTokenInput.value.trim();
    if (token) {
      try {
        const resp = await fetch(`https://www.cepaberto.com/api/v3/cep?cep=${cep}`, {
          headers: { Authorization: `Token token=${token}` }
        });
        if (resp.ok) {
          const info = pickGeoInfo(await resp.json(), "cepaberto");
          if (info) return info;
        }
      } catch (e) {
        // CEP Aberto indisponivel ou sem CORS - CEP fica como nao encontrado.
        logGeoNetworkError("CEP Aberto", cep, e);
      }
    }
    return null;
  }

  async function resolveCep(cep) {
    let info = geoCache[cep];
    if (info === undefined) {
      info = await geocodeCep(cep);
      // So resultados encontrados sao guardados no cache: um "nao encontrado" pode
      // ser uma falha de rede passageira, entao cada rodada tenta de novo em vez
      // de ficar preso num resultado negativo antigo.
      if (info !== null) {
        geoCache[cep] = info;
        saveGeoCache();
      }
      geoQueriesThisRun++;
      await sleep(120);
    }
    return info;
  }

  function dominantPrazo(counts) {
    let best = "2h";
    let max = -1;
    PRAZO_KEYS.forEach((k) => {
      if (counts[k] > max) {
        max = counts[k];
        best = k;
      }
    });
    return best;
  }

  function renderNotFound(notFound) {
    toggleNotFoundBtn.textContent = `Ver CEPs/faixas nao localizados (${notFound.length})`;
    notFoundList.innerHTML = "";
    notFound.forEach((label) => {
      const li = document.createElement("li");
      li.textContent = label;
      notFoundList.appendChild(li);
    });
  }

  async function updateMap() {
    initMap();
    if (!map) {
      mapStatus.textContent = "Nao foi possivel carregar o mapa (Leaflet nao disponivel).";
      return;
    }
    const records = state.parsed.validUnique;
    if (!records.length) {
      mapStatus.textContent = "Nenhum CEP valido para exibir. Cole os CEPs acima primeiro.";
      return;
    }

    updateMapBtn.disabled = true;
    downloadCoordsBtn.disabled = true;
    downloadReportBtn.disabled = true;
    markersLayer.clearLayers();
    markerData = [];
    geoQueriesThisRun = 0;
    networkErrorsThisRun = 0;

    const rangeMode = state.parsed.rangeMode;
    const notFound = [];
    const bairroGroups = {};
    let done = 0;

    function addToBairro(info, cep, prazo) {
      const bairro = info.bairro || NO_BAIRRO_LABEL;
      const key = `${bairro.toUpperCase()}|${info.cidade.toUpperCase()}|${info.uf.toUpperCase()}`;
      if (!bairroGroups[key]) {
        bairroGroups[key] = {
          bairro,
          cidade: info.cidade,
          uf: info.uf,
          latSum: 0,
          lngSum: 0,
          count: 0,
          ceps: [],
          prazoCounts: { "45min": 0, "1h": 0, "2h": 0 }
        };
      }
      const g = bairroGroups[key];
      g.latSum += info.lat;
      g.lngSum += info.lng;
      g.count++;
      g.ceps.push({ cep, prazo });
      g.prazoCounts[prazo]++;
    }

    for (const rec of records) {
      mapStatus.textContent = rangeMode
        ? `Geocodificando faixas... ${done}/${records.length}`
        : `Geocodificando CEPs... ${done}/${records.length}`;

      if (!rangeMode) {
        const info = await resolveCep(rec.cepStart);
        done++;
        if (info) addToBairro(info, rec.cepStart, rec.prazo);
        else notFound.push(rec.cepStart);
        continue;
      }

      const startInfo = await resolveCep(rec.cepStart);
      const endInfo = await resolveCep(rec.cepEnd);
      done++;
      const label = `${rec.cepStart} a ${rec.cepEnd}`;
      if (startInfo) addToBairro(startInfo, rec.cepStart, rec.prazo);
      if (endInfo) addToBairro(endInfo, rec.cepEnd, rec.prazo);
      if (!startInfo && !endInfo) notFound.push(label);
      else if (!startInfo || !endInfo) notFound.push(`${label} (so uma ponta localizada)`);
    }

    const allLatLngs = [];
    Object.values(bairroGroups).forEach((g) => {
      const lat = g.latSum / g.count;
      const lng = g.lngSum / g.count;
      const color = PRAZO_COLORS[dominantPrazo(g.prazoCounts)];
      const marker = L.circleMarker([lat, lng], { radius: 9, weight: 1.5, color: "#fff", fillColor: color, fillOpacity: 0.9 });
      marker.bindTooltip(g.bairro, { permanent: true, direction: "top", offset: [0, -6], className: "bairro-label" });
      const sample = g.ceps
        .slice(0, 15)
        .map((c) => `${c.cep} (${PRAZO_LABELS[c.prazo]})`)
        .join("<br>");
      const more = g.ceps.length > 15 ? `<br>+${g.ceps.length - 15} mais` : "";
      const local = g.cidade ? `${g.cidade}${g.uf ? "/" + g.uf : ""}` : "";
      marker.bindPopup(`<strong>${g.bairro}</strong>${local ? " - " + local : ""}<br>${g.count} CEP(s)<br>${sample}${more}`);
      marker.addTo(markersLayer);
      markerData.push({
        bairro: g.bairro,
        cidade: g.cidade,
        uf: g.uf,
        lat,
        lng,
        count: g.count,
        prazoCounts: g.prazoCounts,
        ceps: g.ceps
      });
      allLatLngs.push([lat, lng]);
    });

    if (allLatLngs.length) {
      map.fitBounds(L.latLngBounds(allLatLngs).pad(0.15));
    }

    renderNotFound(notFound);
    let statusMsg = `${markerData.length} bairro(s) localizados a partir de ${records.length} registro(s) (${geoQueriesThisRun} consulta(s) nova(s), resto veio do cache). ${notFound.length} nao encontrado(s).`;
    if (networkErrorsThisRun > 0) {
      statusMsg += ` Atencao: ${networkErrorsThisRun} chamada(s) as APIs de CEP falharam por erro de rede (nao "CEP inexistente") - verifique se o navegador/proxy esta bloqueando cep.awesomeapi.com.br, brasilapi.com.br ou www.cepaberto.com (veja o console do navegador, F12, para detalhes).`;
    }
    mapStatus.textContent = statusMsg;
    downloadCoordsBtn.disabled = markerData.length === 0;
    downloadReportBtn.disabled = markerData.length === 0;
    updateMapBtn.disabled = false;
  }

  function downloadCoordsCsv() {
    if (!markerData.length) return;
    const header = ["bairro", "cidade", "uf", "latitude", "longitude", "qtd_ceps"];
    const rows = [header];
    markerData.forEach((m) => {
      rows.push([m.bairro, m.cidade, m.uf, m.lat, m.lng, m.count]);
    });
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, "bairros_coordenadas.csv");
  }

  function downloadBairroReport() {
    if (!markerData.length) return;
    const header = ["bairro", "cidade", "uf", "qtd_ceps", "prazo_45min", "prazo_1h", "prazo_2h", "ceps"];
    const rows = [header];
    markerData
      .slice()
      .sort((a, b) => b.count - a.count)
      .forEach((m) => {
        rows.push([
          m.bairro,
          m.cidade,
          m.uf,
          m.count,
          m.prazoCounts["45min"],
          m.prazoCounts["1h"],
          m.prazoCounts["2h"],
          m.ceps.map((c) => c.cep).join(" ")
        ]);
      });
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    triggerDownload(blob, "relatorio_bairros.csv");
  }

  updateMapBtn.addEventListener("click", updateMap);
  downloadCoordsBtn.addEventListener("click", downloadCoordsCsv);
  downloadReportBtn.addEventListener("click", downloadBairroReport);
  toggleNotFoundBtn.addEventListener("click", () => {
    notFoundWrap.hidden = !notFoundWrap.hidden;
  });

  // ---------- Init ----------
  function init() {
    state.modalities = defaultModalities();
    renderModalities();
    reparse();
    updateFilialPreview();
    updateFileNamePreview();
    initMap();
  }

  init();
})();
