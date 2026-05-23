let dados = [];
let historico = JSON.parse(localStorage.getItem("historico")) || [];

async function carregarDados() {
  const res = await fetch('previsao.json');
  dados = await res.json();

  renderizarHistorico();
}

function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function formatarData(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("-")[0]
    .trim();
}

function gerarResumo(manha, tarde) {
  const combinacoes = {
    "céu limpo|céu limpo": "☀️ Céu limpo",
    "céu limpo|poucas nuvens": "🌤️ Poucas nuvens",
    "céu limpo|parcialmente nublado": "🌤️Sol com algumas nuvens",
    "céu limpo|nublado": "☁️ Nublado à tarde",
    "poucas nuvens|céu limpo": "🌤️ Poucas nuvens com sol",
    "poucas nuvens|poucas nuvens": "🌤️ Poucas nuvens",
    "poucas nuvens|parcialmente nublado": "⛅ Parcialmente nublado",
    "poucas nuvens|nublado": "Dia ficando nublado",
    "parcialmente nublado|céu limpo": "⛅ Sol entre nuvens",
    "parcialmente nublado|poucas nuvens": "⛅ Parcialmente nublado",
    "parcialmente nublado|parcialmente nublado": "⛅ Parcialmente nublado",
    "parcialmente nublado|nublado": "☁️ Nublado",
    "nublado|céu limpo": "🌥️ Algumas aberturas",
    "nublado|poucas nuvens": "🌥️ Algumas aberturas",
    "nublado|parcialmente nublado": "🌥️ Predomínio de nuvens",
    "nublado|nublado": "☁️ Nublado"
  };
  const chave = `${manha}|${tarde}`;
  return combinacoes[chave] || "Condição variável";
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

function renderizarCidade(cidadeObj) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach(d => {
    // Calculamos o resumo aqui
    const resumoDoDia = gerarResumo(d.nuvens_manha, d.nuvens_tarde);
    
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
      <div class="cloud-desc">
          <b>${resumoDoDia}</b>
      </div>
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

function buscarCidade() {
  const input = normalizarTexto(document.getElementById("cidadeInput").value);

  const cidadeEncontrada = dados.find(c =>
    normalizarTexto(c.cidade).includes(input)
  );

  if (!cidadeEncontrada) {
    document.getElementById("cidade").textContent = "Cidade não encontrada";
    document.getElementById("container").innerHTML = "";
    return;
  }

  renderizarCidade(cidadeEncontrada);
}

const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");

inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);
  suggestions.innerHTML = "";

  if (!valor) return;

  const filtrados = dados
    .filter(c => normalizarTexto(c.cidade).includes(valor))
    .slice(0, 6);

  filtrados.forEach(c => {
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

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

carregarDados();