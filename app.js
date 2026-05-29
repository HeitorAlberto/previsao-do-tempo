let dadosCidadesLista = [];
let cidadeAtualObj = null;
let historico = JSON.parse(localStorage.getItem("historico")) || [];

const DB_NAME = "PrevisaoWeatherDB";
const DB_VERSION = 1;
const STORE_NAME = "cache_previsoes";

// bloqueio simples para evitar chamadas duplicadas
let carregando = false;

// --- MAPEAMENTO DE ESTADOS (UF) ---
const UF_MAP = {
  "12": "AC", "27": "AL", "13": "AM", "16": "AP", "29": "BA", "23": "CE", "53": "DF",
  "32": "ES", "52": "GO", "21": "MA", "31": "MG", "50": "MS", "51": "MT", "15": "PA",
  "25": "PB", "26": "PE", "22": "PI", "41": "PR", "33": "RJ", "24": "RN", "43": "RS",
  "11": "RO", "14": "RR", "42": "SC", "35": "SP", "28": "SE", "17": "TO"
};

function ufFromCode(city) {
  const codigo = String(city.codigo_uf || "").padStart(2, "0");
  return UF_MAP[codigo] || "";
}

// --- MAPEAMENTO DE ÍCONES ---
function obterIconeWMO(codigo) {
  if (codigo === 0) return "icons/claro.webp";
  if (codigo === 1) return "icons/parcial.webp";
  if (codigo === 2) return "icons/predominio.webp";
  return "icons/encoberto.webp";
}

// --- GERENCIAMENTO DO INDEXEDDB ---
function abrirDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "nomeChave" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

function calcularProximaExpiracao() {
  const agora = new Date();
  const exp00 = new Date(agora);
  exp00.setHours(24, 0, 0, 0);

  const exp12 = new Date(agora);
  exp12.setHours(12, 0, 0, 0);

  if (agora.getHours() >= 12) {
    exp12.setDate(exp12.getDate() + 1);
  }

  return Math.min(exp00.getTime(), exp12.getTime());
}

async function salvarNoCache(nomeChave, dadosPrevisao) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  const registro = {
    nomeChave,
    dados: dadosPrevisao,
    expiraEm: calcularProximaExpiracao()
  };

  store.put(registro);
}

async function obterDoCache(nomeChave) {
  const db = await abrirDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(nomeChave);

    request.onsuccess = (e) => {
      const registro = e.target.result;
      if (!registro) return resolve(null);

      if (Date.now() > registro.expiraEm) {
        removerDoCache(nomeChave);
        return resolve(null);
      }
      resolve(registro.dados);
    };
    request.onerror = () => resolve(null);
  });
}

async function removerDoCache(nomeChave) {
  const db = await abrirDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).delete(nomeChave);
}

// --- LOGICA DE CARREGAMENTO ---
async function carregarDados() {
  try {
    const resCidades = await fetch("./cidades.json");
    if (!resCidades.ok) throw new Error("Não foi possível carregar cidades.json");
    dadosCidadesLista = await resCidades.json();

    document.getElementById("cidade").textContent = "Digite e selecione uma cidade para ver a previsão";
    renderizarHistorico();
  } catch (e) {
    console.error(e);
    document.getElementById("cidade").textContent = "Erro ao carregar lista de cidades.";
  }
}

async function buscarPrevisaoOpenMeteo(city) {
  if (carregando) return;
  carregando = true;

  const titulo = document.getElementById("cidade");

  try {
    const uf = ufFromCode(city);
    const nomeChave = uf ? `${city.nome} - ${uf}` : city.nome;

    titulo.textContent = `Carregando previsão para ${city.nome}...`;

    const cacheValido = await obterDoCache(nomeChave);
    if (cacheValido) {
      console.log(`Dados de [${nomeChave}] recuperados do IndexedDB.`);
      cidadeAtualObj = cacheValido;
      renderizarCidade(cidadeAtualObj);
      return;
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}&longitude=${city.longitude}&hourly=precipitation,temperature_2m,wind_speed_10m,cloud_cover_low,cloud_cover_mid&models=ecmwf_aifs025_single&timezone=America%2FSao_Paulo&forecast_days=10`;

    const res = await fetch(url);
    if (!res.ok) throw new Error("Erro na API Open-Meteo");
    const forecastMeteo = await res.json();

    const hourly = forecastMeteo.hourly;

    const temp_2m = hourly.temperature_2m || hourly.temperature_2m_ecmwf_ifs;
    const prec = hourly.precipitation || hourly.precipitation_ecmwf_ifs;
    const wind = hourly.wind_speed_10m || hourly.wind_speed_10m_ecmwf_ifs;

    const cloudLow = hourly.cloud_cover_low;
    const cloudMid = hourly.cloud_cover_mid;

    cidadeAtualObj = {
      cidade: nomeChave,
      forecast: []
    };

    const somarChuva = (inicio, fim) => {
      let soma = 0;
      for (let i = inicio; i < fim; i++) {
        const valorHora = prec[i];
        soma += (valorHora && !isNaN(valorHora)) ? Number(valorHora) : 0;
      }
      return soma;
    };

    const obterCodigoNuvem = (low, mid) => {
      const valor = ((low || 0) + (mid || 0)) / 2;

      if (valor < 20) return 0;
      if (valor < 40) return 1;
      if (valor < 70) return 2;
      return 3;
    };

    for (let d = 0; d < 7; d++) {
      const baseIdx = d * 24;
      const dataISO = hourly.time[baseIdx].split("T")[0];
      const idxs = [baseIdx, baseIdx + 6, baseIdx + 12, baseIdx + 18];

      const temps = idxs.map(i => temp_2m[i] || 0);
      const winds = idxs.map(i => wind[i] || 0);

      const r1 = somarChuva(baseIdx, baseIdx + 6);
      const r2 = somarChuva(baseIdx + 6, baseIdx + 12);
      const r3 = somarChuva(baseIdx + 12, baseIdx + 18);
      const r4 = somarChuva(baseIdx + 18, baseIdx + 24);

      const totalChuvaDia = r1 + r2 + r3 + r4;

      cidadeAtualObj.forecast.push({
        date: dataISO,
        temp_min_c: Math.min(...temps),
        temp_max_c: Math.max(...temps),
        wind_max_kmh: Math.max(...winds),
        rain_sum_mm: Number(totalChuvaDia.toFixed(1)),
        periods: {
          "até 06h": { cloud_desc: obterCodigoNuvem(cloudLow[idxs[0]], cloudMid[idxs[0]]), rain_mm: Number(r1.toFixed(1)) },
          "até 12h": { cloud_desc: obterCodigoNuvem(cloudLow[idxs[1]], cloudMid[idxs[1]]), rain_mm: Number(r2.toFixed(1)) },
          "até 18h": { cloud_desc: obterCodigoNuvem(cloudLow[idxs[2]], cloudMid[idxs[2]]), rain_mm: Number(r3.toFixed(1)) },
          "até 24h": { cloud_desc: obterCodigoNuvem(cloudLow[idxs[3]], cloudMid[idxs[3]]), rain_mm: Number(r4.toFixed(1)) }
        }
      });
    }

    await salvarNoCache(nomeChave, cidadeAtualObj);
    renderizarCidade(cidadeAtualObj);

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro ao buscar previsão na API.";
  } finally {
    carregando = false;
  }
}

// --- INTERFACE E AUXILIARES ---
function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function obterDiaSemana(dataISO) {
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const [ano, mes, dia] = dataISO.split("-");
  const d = new Date(`${ano}-${mes}-${dia}T00:00:00`);
  return dias[d.getDay()];
}

function normalizarTexto(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("-")[0]
    .trim();
}

function obterIconeNuvem(valor) {
  return `<img src="${obterIconeWMO(valor)}" class="icone-tempo">`;
}

function renderizarHistorico() {
  const el = document.getElementById("historico");
  if (!el) return;
  el.innerHTML = "";

  historico.slice(0, 3).forEach((nomeCidade) => {
    const item = document.createElement("div");
    item.className = "historico-item";
    item.textContent = nomeCidade;
    item.onclick = () => {
      const city = dadosCidadesLista.find(c => {
        const uf = ufFromCode(c);
        const nomeGerado = uf ? `${c.nome} - ${uf}` : c.nome;
        return nomeGerado === nomeCidade;
      });
      if (city) buscarPrevisaoOpenMeteo(city);
    };
    el.appendChild(item);
  });
}

function renderizarCidade(cidadeObj) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach((d) => {
    const div = document.createElement("div");
    div.className = "card";

    const periodosHTML = Object.entries(d.periods)
      .map(([hora, p]) => {
        return `
          <div class="periodo">
            <div class="hora">${hora}</div>
            <div class="icone">${obterIconeNuvem(p.cloud_desc)}</div>
            <div class="chuva">${p.rain_mm} mm</div>
          </div>
        `;
      })
      .join("");

    div.innerHTML = `
      <h3>${obterDiaSemana(d.date)}, ${formatarData(d.date)}</h3>
      <div class="data-row">
        <div class="data">
          <span>🌡️ Temperatura</span>
          <strong>${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</strong>
        </div>
        <div class="data">
          <span>💧 Chuva Acumulada</span>
          <strong>${d.rain_sum_mm} mm</strong>
        </div>
        <div class="data">
          <span>🍃 Vento</span>
          <strong>${Math.round(d.wind_max_kmh)} km/h</strong>
        </div>
      </div>
      <div class="resumo-dia">${periodosHTML}</div>
    `;
    container.appendChild(div);
  });

  historico = historico.filter((c) => c !== cidadeObj.cidade);
  historico.unshift(cidadeObj.cidade);
  historico = historico.slice(0, 3);

  salvarHistorico();
  renderizarHistorico();

  document.getElementById("cidadeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
}

function buscarCidade() {
  const input = normalizarTexto(document.getElementById("cidadeInput").value);
  const cidadeEncontrada = dadosCidadesLista.find((c) =>
    normalizarTexto(c.nome).includes(input)
  );

  if (!cidadeEncontrada) {
    document.getElementById("cidade").textContent = "Cidade não encontrada na lista local";
    document.getElementById("container").innerHTML = "";
    return;
  }
  buscarPrevisaoOpenMeteo(cidadeEncontrada);
}

// --- EVENTOS ---
const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);
  suggestions.innerHTML = "";
  if (!valor) return;

  const filtrados = dadosCidadesLista
    .filter((c) => normalizarTexto(c.nome).includes(valor))
    .slice(0, 6);

  filtrados.forEach((c) => {
    const item = document.createElement("div");
    const uf = ufFromCode(c);
    item.textContent = uf ? `${c.nome} - ${uf}` : c.nome;

    item.onclick = () => {
      inputEl.value = c.nome;
      suggestions.innerHTML = "";
      buscarPrevisaoOpenMeteo(c);
    };
    suggestions.appendChild(item);
  });
});

document.addEventListener("click", (e) => {
  if (e.target !== inputEl) suggestions.innerHTML = "";
});

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

carregarDados();