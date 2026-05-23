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
    const div = document.createElement("div");
    div.className = "card";

    // Adicionamos os campos de nuvens na interface
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
    `;

    container.appendChild(div);
  });

  // ... (o resto da sua função de historico continua igual)
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
  const input = normalizarTexto(
    document.getElementById("cidadeInput").value
  );

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

/* AUTOCOMPLETE */
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
  if (e.target !== inputEl) {
    suggestions.innerHTML = "";
  }
});

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

carregarDados();