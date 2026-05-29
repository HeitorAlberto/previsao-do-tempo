let dados = {};
let historico = JSON.parse(localStorage.getItem("historico")) || [];

const ICONS = {
  0: "claro.webp",
  1: "parcial.webp",
  2: "predominio.webp",
  3: "encoberto.webp"
};

async function carregarDados() {
  const base = location.hostname.includes("github.io")
    ? "/previsao-do-tempo/"
    : "./";

  const hora = new Date().getUTCHours();

  // regra simples:
  // 00z -> madrugada/manhã UTC
  // 12z -> tarde/noite UTC
  const run = (hora >= 9 && hora < 21) ? "12z" : "00z";

  const arquivo = `previsao_${run}.csv`;

  try {
    const res = await fetch(`${base}${arquivo}?v=${Date.now()}`);
    const text = await res.text();

    const lines = text.trim().split("\n").slice(1);

    dados = {};

    for (const line of lines) {
      const cols = line.trim().split(",");

      if (cols.length !== 13) continue;

      const [
        cidade,
        dt,
        r1, r2, r3, r4,
        tmin, tmax, wmx,
        c1, c2, c3, c4
      ] = cols;

      if (!cidade || !dt) continue;

      if (!dados[cidade]) {
        dados[cidade] = { cidade, forecast: [] };
      }

      dados[cidade].forecast.push({
        date: dt,
        temp_min_c: Number(tmin) || 0,
        temp_max_c: Number(tmax) || 0,
        wind_max_kmh: Number(wmx) || 0,
        periods: {
          "até 06h": { cloud_desc: Number(c1) || 0, rain_mm: Math.max(0, Number(r1) || 0) },
          "até 12h": { cloud_desc: Number(c2) || 0, rain_mm: Math.max(0, Number(r2) || 0) },
          "até 18h": { cloud_desc: Number(c3) || 0, rain_mm: Math.max(0, Number(r3) || 0) },
          "até 24h": { cloud_desc: Number(c4) || 0, rain_mm: Math.max(0, Number(r4) || 0) }
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

function obterIconeNuvem(valor) {
  const arquivo = ICONS[valor];
  if (!arquivo) return "";

  return `
    <img src="icons/${arquivo}" class="icone-tempo">
  `;
}

function renderizarHistorico() {
  const el = document.getElementById("historico");
  if (!el) return;

  el.innerHTML = "";

  historico
    .slice(0, 3)
    .forEach((cidade) => {
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
    const div = document.createElement("div");
    div.className = "card";

    const periodosHTML = Object.entries(d.periods)
      .map(([hora, p]) => {
        return `
          <div class="periodo">
            <div class="hora">${hora}</div>
            <div class="icone">${obterIconeNuvem(p.cloud_desc)}</div>
            <div class="chuva">${Math.round(p.rain_mm)} mm</div>
          </div>
        `;
      })
      .join("");

    div.innerHTML = `
      <h3>
        ${obterDiaSemana(d.date)},
        ${formatarData(d.date)}
      </h3>

      <div class="resumo-dia">
        ${periodosHTML}
      </div>

      <div class="data-row">
        <div class="data">
          <span>🌡️ Temperatura</span>
          <strong>${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</strong>
        </div>

        <div class="data">
          <span>🍃 Vento</span>
          <strong>${Math.round(d.wind_max_kmh)} km/h</strong>
        </div>
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
  const input = normalizarTexto(
    document.getElementById("cidadeInput").value
  );

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
  if (e.target !== inputEl) {
    suggestions.innerHTML = "";
  }
});

document.getElementById("btnBuscar").addEventListener("click", buscarCidade);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

carregarDados();