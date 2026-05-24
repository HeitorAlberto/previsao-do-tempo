let dados = [];
let historico = JSON.parse(localStorage.getItem("historico")) || [];

async function carregarDados() {
  const arquivo = "previsao_00Z.json";
  const base = location.hostname.includes("github.io") ? "/previsao-do-tempo/" : "./";

  try {
    const res = await fetch(`${base}${arquivo}?v=${Date.now()}`);
    const json = await res.json();
    dados = json.data || [];
    renderizarHistorico();
  } catch (e) {
    console.log("Erro ao carregar JSON", e);
    dados = [];
  }
}

function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarTexto(texto) {
  return (texto || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").split("-")[0].trim();
}

// Função expandida com todas as combinações lógicas
function gerarResumoTempo(periods) {
  const norm = (str) => (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const m = norm(periods["06h"]?.cloud_desc);
  const t = norm(periods["12h"]?.cloud_desc);

  // 1. Estados Estáveis
  if (m.includes("claro") && t.includes("claro")) return "☀️ Ensolarado";
  if (m.includes("encoberto") && t.includes("encoberto")) return "☁️ Encoberto";
  if (m.includes("predominio") && t.includes("predominio")) return "🌥️ Nublado";
  if (m.includes("parcial") && t.includes("parcial")) return "⛅ Parcialmente nublado";
  if (m.includes("parcial") && (t.includes("claro"))) return "⛅ Parcialmente nublado";

  // 2. Transições (Melhora: Nublado -> Parcial/Claro)
  if (m.includes("predominio") && (t.includes("parcial") || t.includes("claro"))) return "⛅ Parcialmente nublado";
  if (m.includes("encoberto") && (t.includes("parcial") || t.includes("claro"))) return "🌥️ Nublado, depois abre";

  // 3. Transições (Piora: Claro/Parcial -> Nublado/Encoberto)
  if ((m.includes("claro") || m.includes("parcial") || m.includes("predominio")) && t.includes("encoberto")) return "🌥️ Nublado à tarde";
  if ((m.includes("claro") || m.includes("parcial")) && t.includes("predominio")) return "⛅ Parcialmente nublado";
  

  // 4. Fallback (Caso algo não mapeado)
  return "🌤️ Variação de nuvens";
}

function renderizarHistorico() {
  const el = document.getElementById("historico");
  if (!el) return;
  el.innerHTML = "";
  historico.slice(0, 3).forEach(cidade => {
    const item = document.createElement("div");
    item.className = "historico-item";
    item.textContent = cidade;
    item.onclick = () => {
      const cidadeObj = dados.find(c => c.cidade === cidade);
      if (cidadeObj) renderizarCidade(cidadeObj);
    };
    el.appendChild(item);
  });
}

function renderizarCidade(cidadeObj) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach(d => {
    const resumo = gerarResumoTempo(d.periods);
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
      <div class="resumo-dia">
        ${resumo}
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

function buscarCidade() {
  const input = normalizarTexto(document.getElementById("cidadeInput").value);
  const cidadeEncontrada = dados.find(c => normalizarTexto(c.cidade).includes(input));
  if (!cidadeEncontrada) {
    document.getElementById("cidade").textContent = "Cidade não encontrada";
    document.getElementById("container").innerHTML = "";
    return;
  }
  renderizarCidade(cidadeEncontrada);
}

/* AUTOCOMPLETE */
const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);
  suggestions.innerHTML = "";
  if (!valor) return;
  const filtrados = dados.filter(c => normalizarTexto(c.cidade).includes(valor)).slice(0, 6);
  filtrados.forEach(c => {
    const item = document.createElement("div");
    item.textContent = c.cidade;
    item.onclick = () => {
      inputEl.value = c.cidade;
      suggestions.innerHTML = "";
      renderizarCidade(c);
    };
    suggestions.appendChild(item);
  });
});

document.addEventListener("click", (e) => { if (e.target !== inputEl) suggestions.innerHTML = ""; });
document.getElementById("btnBuscar").addEventListener("click", buscarCidade);
inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") buscarCidade(); });

carregarDados();