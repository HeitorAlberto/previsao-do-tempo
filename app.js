let dadosCidadesLista = [];
let cidadeAtualObj = null;
let historico = JSON.parse(localStorage.getItem("historico")) || [];

let carregando = false;

/* =========================
   UF MAP
========================= */
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

/* =========================
   VISIONS SYSTEM (PLUGIN)
========================= */
const VISIONS = {};

/* ---- Nebulosidade ---- */
VISIONS.nebulosidade = (ctx) => {
  const cloud = ctx.cloud;

  const media = cloud.reduce((a, b) => a + (b || 0), 0) / cloud.length;
  const variacao = Math.max(...cloud) - Math.min(...cloud);

  const mediaManha = cloud.slice(0, 6).reduce((a, b) => a + (b || 0), 0) / 6;
  const mediaTarde = cloud.slice(12, 18).reduce((a, b) => a + (b || 0), 0) / 6;
  const mediaNoite = cloud.slice(18, 24).reduce((a, b) => a + (b || 0), 0) / 6;

  let tipo;

  const abreNaTarde = mediaManha > mediaTarde && mediaNoite > mediaTarde;
  const fechaNaNoite = mediaManha < mediaTarde && mediaNoite > mediaTarde;
  const abreProgressivo = mediaManha > mediaTarde && mediaTarde > mediaNoite;
  const fechaProgressivo = mediaManha < mediaTarde && mediaTarde < mediaNoite;

  if (variacao < 15 && media < 30) {
    tipo = "🌤️ Ensolarado";
  }
  else if (media > 70 && variacao < 20) {
    tipo = "☁️ Nublado";
  }
  else if (abreNaTarde) {
    tipo = "⛅ Nebulosidade diminui à tarde, aumenta à noite";
  }
  else if (fechaNaNoite) {
    tipo = "🌥️ Nebulosidade maior a noite";
  }
  else if (abreProgressivo) {
    tipo = "⛅ Parcialmente nublado";
  }
  else if (fechaProgressivo) {
    tipo = "☁️ Nebulosidade aumentando com o passar do tempo";
  }
  else {
    tipo = "⛅ Nebulosidade variável";
  }

  return { media, variacao, tipo };
};

/* ---- Chuva ---- */
VISIONS.chuva = (ctx) => {
  const rain = ctx.rain;

  const total = rain.reduce((a, b) => a + (b || 0), 0);
  const horas = rain.filter(v => v > 0.1).length;
  const pico = Math.max(...rain);

  let tipo;

  // 1. evento forte sempre domina
  if (pico >= 8) {
    tipo = "🔵 Pancada forte de chuva";
  }

  // 2. pancadas fortes mesmo que poucas horas
  else if (pico >= 5) {
    tipo = horas <= 3
      ? "🔵 Chuva forte pontual"
      : "🔵 Pancadas de chuva forte";
  }

  // 3. chuva contínua leve
  else if (horas >= 8 && total >= 5) {
    tipo = "🔵 Pancadas de chuva moderada";
  }

  // 4. chuva moderada distribuída
  else if (horas >= 6) {
    tipo = "🔵 Algumas pancadas de chuva";
  }

  // 5. eventos leves
  else if (total >= 1) {
    tipo = "🔵 Pancadas de chuva isoladas";
  }

  else {
    tipo = "Sem chuva relevante";
  }

  return { total, horas, pico, tipo };
};


/* ---- Resumo final ---- */
function gerarResumo(r) {
  const chuva = r.chuva.tipo;
  const nuvem = r.nebulosidade.tipo;

  if (chuva === "Sem chuva relevante") {
    return `${nuvem}.<br> Não chove.`;
  }

  return `${nuvem}. <br> ${chuva}.`;
}

/* ---- Motor principal ---- */
function analisarDia(ctx) {
  const resultado = {};

  for (const key in VISIONS) {
    resultado[key] = VISIONS[key](ctx);
  }

  resultado.resumo = gerarResumo(resultado);

  return resultado;
}


/* =========================
   CARREGAR DADOS
========================= */
async function carregarDados() {
  try {
    const resCidades = await fetch("./cidades.json");

    if (!resCidades.ok) throw new Error("Erro cidades.json");

    dadosCidadesLista = await resCidades.json();

    document.getElementById("cidade").textContent =
      "Busque uma cidade";

    renderizarHistorico();

  } catch (e) {
    console.error(e);
    document.getElementById("cidade").textContent =
      "Erro ao carregar cidades.";
  }
}

/* =========================
   OPEN METEO
========================= */
async function buscarPrevisaoOpenMeteo(city) {
  if (carregando) return;

  carregando = true;

  const titulo = document.getElementById("cidade");

  try {
    const uf = ufFromCode(city);
    const nomeChave = uf ? `${city.nome} - ${uf}` : city.nome;

    titulo.textContent = "⏳ Carregando...";

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}` +
      `&longitude=${city.longitude}` +
      `&hourly=precipitation,temperature_2m,wind_gusts_10m,cloud_cover,precipitation_probability` +
      `&timezone=America%2FSao_Paulo&forecast_days=10`;

    const res = await fetch(url);
    const data = await res.json();

    const hourly = data.hourly;

    const temp = hourly.temperature_2m;
    const rain = hourly.precipitation;
    const wind = hourly.wind_gusts_10m;
    const cloud = hourly.cloud_cover;
    const prob = hourly.precipitation_probability;

    cidadeAtualObj = {
      cidade: nomeChave,
      forecast: []
    };

    for (let d = 0; d < 10; d++) {
      const i = d * 24;

      const tempsDia = temp.slice(i, i + 24);
      const chuvaDia = rain.slice(i, i + 24);
      const windDia = wind.slice(i, i + 24);
      const cloudDia = cloud.slice(i, i + 24);
      const probDia = prob.slice(i, i + 24);

      const analise = analisarDia({
        cloud: cloudDia,
        rain: chuvaDia,
        wind: windDia,
        temp: tempsDia
      });

      const maxProb = Math.max(...probDia.filter(v => v != null), 0);

      cidadeAtualObj.forecast.push({
        date: hourly.time[i].split("T")[0],

        temp_min_c: Math.min(...tempsDia),
        temp_max_c: Math.max(...tempsDia),
        wind_max_kmh: Math.max(...windDia),

        rain_sum_mm: Number(analise.chuva.total.toFixed(1)),
        rain_prob_max: Math.round(maxProb),

        nebulosidade: analise.nebulosidade.tipo,
        chuva: analise.chuva.tipo,

        resumo: analise.resumo
      });
    }

    renderizarCidade(cidadeAtualObj);

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro na previsão.";
  } finally {
    carregando = false;
  }
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

/* =========================
   HISTÓRICO
========================= */
function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
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
        const nome = uf ? `${c.nome} - ${uf}` : c.nome;
        return nome === nomeCidade;
      });

      if (city) buscarPrevisaoOpenMeteo(city);
    };

    el.appendChild(item);
  });
}

/* =========================
   RENDER
========================= */
function renderizarCidade(cidadeObj) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach(d => {
    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${obterDiaSemana(d.date)}, ${formatarData(d.date)}</h3>

      <div class="data-row">

        <div class="data">
          <span class="resumo">${d.resumo}</span>
        </div>

        <div class="data">
          <span>🌡️ Temperatura</span>
          <strong>${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</strong>
        </div>

        <div class="data">
          <span>☔ Chuva</span>
          <strong>${d.rain_sum_mm} mm (${d.rain_prob_max}%)</strong>
        </div>

        <div class="data">
          <span>🍃 Rajadas de vento</span>
          <strong>${Math.round(d.wind_max_kmh)} km/h</strong>
        </div>

      </div>
    `;

    container.appendChild(div);
  });

  historico = historico.filter(c => c !== cidadeObj.cidade);
  historico.unshift(cidadeObj.cidade);
  historico = historico.slice(0, 3);

  salvarHistorico();
  renderizarHistorico();

  document.getElementById("cidadeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
}

/* =========================
   BUSCA
========================= */
function normalizarTexto(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("-")[0]
    .trim();
}

function buscarCidade() {
  const input = normalizarTexto(
    document.getElementById("cidadeInput").value
  );

  const cidadeEncontrada = dadosCidadesLista.find(c =>
    normalizarTexto(c.nome).includes(input)
  );

  if (!cidadeEncontrada) {
    document.getElementById("cidade").textContent =
      "Cidade não encontrada";
    return;
  }

  buscarPrevisaoOpenMeteo(cidadeEncontrada);
}

/* =========================
   AUTOCOMPLETE + EVENTS
========================= */
const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);

  suggestions.innerHTML = "";
  if (!valor) return;

  const filtrados = dadosCidadesLista
    .filter(c => normalizarTexto(c.nome).includes(valor))
    .slice(0, 6);

  filtrados.forEach(c => {
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