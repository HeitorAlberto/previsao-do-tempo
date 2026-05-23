let dados = [];
let historico = JSON.parse(localStorage.getItem("historico")) || [];

/* ---------------- CARREGAMENTO 00Z / 12Z ---------------- */

async function carregarDados() {
  const hoje = new Date().toISOString().slice(0, 10);

  const [h12, h00] = await Promise.all([
    fetch(`previsao_12Z.json?v=${Date.now()}`).then(r => r.json()).catch(() => null),
    fetch(`previsao_00Z.json?v=${Date.now()}`).then(r => r.json()).catch(() => null)
  ]);

  function valido(json, run) {
    return (
      json &&
      json.run_date === hoje &&
      json.run_hour === run &&
      Array.isArray(json.data)
    );
  }

  if (valido(h12, 12)) {
    dados = h12.data;
    console.log("Usando 12Z");
  } else if (valido(h00, 0)) {
    dados = h00.data;
    console.log("Usando 00Z");
  } else {
    dados = [];
    console.log("Sem dados válidos");
  }

  renderizarHistorico();
}

/* ---------------- HISTÓRICO ---------------- */

function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function renderizarHistorico() {
  const el = document.getElementById("historico");
  if (!el) return;

  el.innerHTML = "";

  historico.slice(0, 3).forEach(cidade => {
    const item = document.createElement("div");
    item.className = "historico-item";
    item.textContent = cidade;

    item.addEventListener("click", () => {
      const cidadeObj = dados.find(c => c.cidade === cidade);
      if (cidadeObj) renderizarCidade(cidadeObj);
    });

    el.appendChild(item);
  });
}

/* ---------------- UTIL ---------------- */

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarTexto(texto) {
  return (texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("-")[0]
    .trim();
}

/* ---------------- RESUMO CLIMA ---------------- */

function gerarResumo(manha, tarde) {
  const combinacoes = {
    "céu limpo|céu limpo": "☀️ Céu limpo",
    "céu limpo|poucas nuvens": "🌤️ Poucas nuvens",
    "céu limpo|parcialmente nublado": "🌤️ Sol com algumas nuvens",
    "céu limpo|nublado": "☁️ Nublado à tarde",
    "poucas nuvens|céu limpo": "🌤️ Poucas nuvens com sol",
    "poucas nuvens|poucas nuvens": "🌤️ Poucas nuvens",
    "poucas nuvens|parcialmente nublado": "⛅ Parcialmente nublado",
    "poucas nuvens|nublado": "☁️ Dia ficando nublado",
    "parcialmente nublado|céu limpo": "⛅ Sol entre nuvens",
    "parcialmente nublado|poucas nuvens": "⛅ Parcialmente nublado",
    "parcialmente nublado|parcialmente nublado": "⛅ Parcialmente nublado",
    "parcialmente nublado|nublado": "☁️ Nublado",
    "nublado|céu limpo": "🌥️ Algumas aberturas",
    "nublado|poucas nuvens": "🌥️ Algumas aberturas",
    "nublado|parcialmente nublado": "🌥️ Predomínio de nuvens",
    "nublado|nublado": "☁️ Nublado"
  };

  return combinacoes[`${manha}|${tarde}`] || "Condição variável";
}

/* ---------------- RENDER CIDADE ---------------- */

function renderizarCidade(cidadeObj) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach(d => {
    const resumo = gerarResumo(d.nuvens_manha, d.nuvens_tarde);

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${d.weekday}, ${formatarData(d.date)}</h3>

      <div class="data-row">
        <div class="data-1">🌡️ Temperatura</div>
        <div class="data-2">${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</div>

        <div class="data-1">💧 Chuva</div>
        <div class="data-2">${Math.round(d.rain_mm)} mm</div>

        <div class="data-1">🍃 Vento</div>
        <div class="data-2">${Math.round(d.wind_max_kmh)} km/h</div>
      </div>

      <div class="cloud-desc"><b>${resumo}</b></div>
    `;

    container.appendChild(div);
  });

  const nomeCidade = cidadeObj.cidade;

  historico = historico.filter(c => c !== nomeCidade);
  historico.unshift(nomeCidade);
  historico = historico.slice(0, 3);

  salvarHistorico();
  renderizarHistorico();

  document.getElementById("cidadeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
}

/* ---------------- BUSCA ---------------- */

function buscarCidade() {
  const input = normalizarTexto(document.getElementById("cidadeInput").value);

  const cidade = dados.find(c =>
    normalizarTexto(c.cidade).includes(input)
  );

  if (!cidade) {
    document.getElementById("cidade").textContent = "Cidade não encontrada";
    document.getElementById("container").innerHTML = "";
    return;
  }

  renderizarCidade(cidade);
}

/* ---------------- AUTOCOMPLETE ---------------- */

const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);

  suggestions.innerHTML = "";
  if (!valor) return;

  dados
    .filter(c => normalizarTexto(c.cidade).includes(valor))
    .slice(0, 6)
    .forEach(c => {
      const item = document.createElement("div");
      item.textContent = c.cidade;

      item.addEventListener("click", () => {
        inputEl.value = c.cidade;
        suggestions.innerHTML = "";
        renderizarCidade(c);
      });

      suggestions.appendChild(item);
    });
});

document.addEventListener("click", (e) => {
  if (e.target !== inputEl) suggestions.innerHTML = "";
});

/* ---------------- EVENTS ---------------- */

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

/* ---------------- INIT ---------------- */

carregarDados();