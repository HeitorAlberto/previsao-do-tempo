let dados = {};
let historico = JSON.parse(localStorage.getItem("historico")) || [];

const cloudMap = {
  0: "claro",
  1: "parcial",
  2: "predominio",
  3: "encoberto"
};

async function carregarDados() {
  const arquivo = "previsao_00Z.csv";
  const base = location.hostname.includes("github.io") ? "/previsao-do-tempo/" : "./";

  try {
    const res = await fetch(`${base}${arquivo}?v=${Date.now()}`);
    const text = await res.text();

    const lines = text.trim().split("\n").slice(1);

    dados = {};

    for (const line of lines) {
      const [
        cidade, dt, r, tmin, tmax, wmx, c1, c2, c3, c4
      ] = line.split(",");

      if (!dados[cidade]) {
        dados[cidade] = {
          cidade,
          forecast: []
        };
      }

      dados[cidade].forecast.push({
        date: dt,
        rain_mm: Number(r),
        temp_min_c: Number(tmin),
        temp_max_c: Number(tmax),
        wind_max_kmh: Number(wmx),
        periods: {
          "00h": { cloud_desc: Number(c1) },
          "06h": { cloud_desc: Number(c2) },
          "12h": { cloud_desc: Number(c3) },
          "18h": { cloud_desc: Number(c4) }
        }
      });
    }

    renderizarHistorico();

  } catch (e) {
    console.log("Erro ao carregar CSV", e);
    dados = {};
  }
}

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

function gerarResumoTempo(periods) {
  const norm = (str) =>
    (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const m = cloudMap[periods["06h"]?.cloud_desc] || "";
  const t = cloudMap[periods["12h"]?.cloud_desc] || "";

  if (m.includes("claro") && t.includes("claro")) return "☀️ Ensolarado";
  if (m.includes("encoberto") && t.includes("encoberto")) return "☁️ Encoberto";
  if (m.includes("predominio") && t.includes("predominio")) return "🌥️ Nublado";
  if (m.includes("parcial") && t.includes("parcial")) return "⛅ Parcialmente nublado";
  if (m.includes("parcial") && t.includes("claro")) return "⛅ Parcialmente nublado";

  if (m.includes("predominio") && (t.includes("parcial") || t.includes("claro")))
    return "⛅ Parcialmente nublado";

  if (m.includes("encoberto") && (t.includes("parcial") || t.includes("claro")))
    return "🌥️ Nublado, depois abre";

  if (
    (m.includes("claro") || m.includes("parcial") || m.includes("predominio")) &&
    t.includes("encoberto")
  )
    return "🌥️ Nublado à tarde";

  if ((m.includes("claro") || m.includes("parcial")) && t.includes("predominio"))
    return "⛅ Parcialmente nublado";

  return "🌤️ Variação de nuvens";
}

function renderizarHistorico() {
  const el = document.getElementById("historico");
  if (!el) return;

  el.innerHTML = "";

  historico.slice(0, 3).forEach((cidade) => {
    const item = document.createElement("div");
    item.className = "historico-item";
    item.textContent = cidade;

    item.onclick = () => {
      const cidadeObj = dados[cidade];
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

  cidadeObj.forecast.forEach((d) => {
    const resumo = gerarResumoTempo(d.periods);

    const div = document.createElement("div");
    div.className = "card";

    div.innerHTML = `
      <h3>${obterDiaSemana(d.date)}, ${formatarData(d.date)}</h3>

      <div class="resumo-dia">
        ${resumo}
      </div>

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

  const cidadeEncontrada = Object.values(dados).find((c) =>
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

  const filtrados = Object.values(dados)
    .filter((c) => normalizarTexto(c.cidade).includes(valor))
    .slice(0, 6);

  filtrados.forEach((c) => {
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

document.addEventListener("click", (e) => {
  if (e.target !== inputEl) suggestions.innerHTML = "";
});

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

carregarDados();