let dadosCidadesLista = [];
let cidadeAtualObj = null;
let historico = JSON.parse(localStorage.getItem("historico")) || [];

let carregando = false;

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

function obterIconeWMO(codigo) {
  if (codigo === 0) return "icons/claro.webp";
  if (codigo === 1) return "icons/parcial.webp";
  if (codigo === 2) return "icons/predominio.webp";
  return "icons/encoberto.webp";
}

async function carregarDados() {
  try {
    const resCidades = await fetch("./cidades.json");

    if (!resCidades.ok) {
      throw new Error("Não foi possível carregar cidades.json");
    }

    dadosCidadesLista = await resCidades.json();

    document.getElementById("cidade").textContent =
      "Busque uma cidade";

    renderizarHistorico();

  } catch (e) {
    console.error(e);
    document.getElementById("cidade").textContent =
      "Erro ao carregar as cidades.";
  }
}

async function buscarPrevisaoOpenMeteo(city) {
  if (carregando) return;

  carregando = true;

  const titulo = document.getElementById("cidade");

  try {
    const uf = ufFromCode(city);
    const nomeChave = uf ? `${city.nome} - ${uf}` : city.nome;

    titulo.textContent = `⏳ Carregando previsão...`;

    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${city.latitude}` +
      `&longitude=${city.longitude}` +
      `&hourly=precipitation,temperature_2m,wind_gusts_10m,cloud_cover` +
      `&models=ecmwf_ifs` +
      `&timezone=America%2FSao_Paulo` +
      `&forecast_days=10`;

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error("Erro na API Open-Meteo");
    }

    const forecastMeteo = await res.json();

    const hourly = forecastMeteo.hourly;

    const temp_2m =
      hourly.temperature_2m || hourly.temperature_2m_ecmwf_ifs;

    const prec =
      hourly.precipitation || hourly.precipitation_ecmwf_ifs;

    const wind =
      hourly.wind_gusts_10m || hourly.wind_gusts_10m_ecmwf_ifs;

    const cloudCover = hourly.cloud_cover;

    cidadeAtualObj = {
      cidade: nomeChave,
      forecast: []
    };

    const somarChuva = (inicio, fim) => {
      let soma = 0;

      for (let i = inicio; i < fim; i++) {
        const valorHora = prec[i];
        soma += (valorHora && !isNaN(valorHora))
          ? Number(valorHora)
          : 0;
      }

      return soma;
    };

    const obterCodigoNuvem = (baseIdx) => {
      const valores = [];

      for (let i = baseIdx; i < baseIdx + 3; i++) {
        valores.push(cloudCover[i] || 0);
      }

      const media =
        valores.reduce((soma, valor) => soma + valor, 0) /
        valores.length;

      if (media < 20) return 0; // limpo
      if (media < 50) return 1; // poucas nuvens
      if (media < 80) return 2; // parcialmente nublado
      return 3; // encoberto
    };

    for (let d = 0; d < 10; d++) {
      const baseIdx = d * 24;

      const dataISO = hourly.time[baseIdx].split("T")[0];

      const tempsDia =
        temp_2m.slice(baseIdx, baseIdx + 24);

      const windsDia =
        wind.slice(baseIdx, baseIdx + 24);

      const periods = {};

      let totalChuvaDia = 0;

      for (let h = 0; h < 24; h += 3) {
        const inicio = baseIdx + h;
        const fim = inicio + 3;

        const chuva = somarChuva(inicio, fim);

        totalChuvaDia += chuva;

        periods[
          `${String(h).padStart(2, "0")}h`
        ] = {
          cloud_desc: obterCodigoNuvem(inicio),
          rain_mm: Number(chuva.toFixed(1))
        };
      }

      cidadeAtualObj.forecast.push({
        date: dataISO,

        temp_min_c: Math.min(...tempsDia),

        temp_max_c: Math.max(...tempsDia),

        wind_max_kmh: Math.max(...windsDia),

        rain_sum_mm: Number(totalChuvaDia.toFixed(1)),

        periods
      });
    }


    renderizarCidade(cidadeAtualObj);

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro ao buscar previsão na API.";
  } finally {
    carregando = false;
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
      const city = dadosCidadesLista.find((c) => {
        const uf = ufFromCode(c);
        const nomeGerado = uf ? `${c.nome} - ${uf}` : c.nome;

        return nomeGerado === nomeCidade;
      });

      if (city) {
        buscarPrevisaoOpenMeteo(city);
      }
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
      .map(([hora, p]) => `
        <div class="periodo">
          <div class="hora">${hora}</div>
          <div class="icone">${obterIconeNuvem(p.cloud_desc)}</div>
          <div class="chuva">💧 ${p.rain_mm} mm</div>
        </div>
      `)
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
          <span>🍃 Rajadas de vento</span>
          <strong>${Math.round(d.wind_max_kmh)} km/h</strong>
        </div>
      </div>

      <div class="resumo-dia">
        ${periodosHTML}
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
  const input =
    normalizarTexto(document.getElementById("cidadeInput").value);

  const cidadeEncontrada = dadosCidadesLista.find((c) =>
    normalizarTexto(c.nome).includes(input)
  );

  if (!cidadeEncontrada) {
    document.getElementById("cidade").textContent =
      "Cidade não encontrada na lista local";

    document.getElementById("container").innerHTML = "";
    return;
  }

  buscarPrevisaoOpenMeteo(cidadeEncontrada);
}

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

    item.textContent =
      uf ? `${c.nome} - ${uf}` : c.nome;

    item.onclick = () => {
      inputEl.value = c.nome;
      suggestions.innerHTML = "";
      buscarPrevisaoOpenMeteo(c);
    };

    suggestions.appendChild(item);
  });
});

document.addEventListener("click", (e) => {
  if (e.target !== inputEl) {
    suggestions.innerHTML = "";
  }
});

document
  .getElementById("btnBuscar")
  .addEventListener("click", buscarCidade);

inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    buscarCidade();
  }
});

carregarDados();