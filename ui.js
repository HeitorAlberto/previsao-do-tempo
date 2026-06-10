import { obterDiaSemana, formatarData } from './utils.js';

/**
 * Renderiza a lista de cidades buscadas recentemente (Histórico)
 */
export function renderizarHistoricoUI(historico, dadosCidadesLista, ufFromCode, callbackClique) {
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

      if (city) callbackClique(city);
    };

    el.appendChild(item);
  });
}

/**
 * Renderiza os cards de previsão do tempo para os próximos 10 dias
 */
export function renderizarCidadeUI(cidadeObj, atualizarHistoricoCallback) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  cidadeObj.forecast.forEach((d, indexDia) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${obterDiaSemana(d.date)}, ${formatarData(d.date)}</h3>
      <div class="data-row">
        <div class="data">
          <div>Temperatura</div>
          <div class="temperatura">${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</div>
        </div>
        <div class="data">
          <div>Chuva acumulada</div>
          <div class="chuva">${d.rain_sum_mm} mm (${d.rain_prob_max}%)</div>
        </div>
        <div class="data">
          <div>Rajadas de vento máx</div>
          <div class="vento">${Math.round(d.wind_max_kmh)} km/h</div>
        </div>

        <div class="periodos-bloco">
          <div class="periodo" data-dia="${indexDia}" data-inicio="0" data-fim="6">
            <div style="font-weight: bolder;">Madrugada</div>
            <div class="periodo-infos">
              <div class="nuvens">Nuvens ${d.p1.nuvens}%</div>
              <div class="chuva">${d.p1.chuva} mm</div>
              ${d.p1.trovoadas ? `<div class="trovoadas">Trovoadas⚡</div><br>` : ""}
            </div>
          </div>
          <div class="periodo" data-dia="${indexDia}" data-inicio="6" data-fim="12">
            <div style="font-weight: bolder;">Manhã</div>
            <div class="periodo-infos">
              <div class="nuvens">Nuvens ${d.p2.nuvens}%</div>
              <div class="chuva">${d.p2.chuva} mm</div>
              ${d.p2.trovoadas ? `<div class="trovoadas">Trovoadas⚡</div>` : ""}
            </div>
          </div>
          <div class="periodo" data-dia="${indexDia}" data-inicio="12" data-fim="18">
            <div style="font-weight: bolder;">Tarde</div>
            <div class="periodo-infos">
              <div class="nuvens">Nuvens ${d.p3.nuvens}%</div>
              <div class="chuva">${d.p3.chuva} mm</div>
              ${d.p3.trovoadas ? `<div class="trovoadas">Trovoadas⚡</div><br>` : ""}<br>
            </div>
          </div>
          <div class="periodo" data-dia="${indexDia}" data-inicio="18" data-fim="24">
            <div style="font-weight: bolder;">Noite</div>
            <div class="periodo-infos">
              <div class="nuvens">Nuvens ${d.p4.nuvens}%</div>
              <div class="chuva">${d.p4.chuva} mm</div>
              ${d.p4.trovoadas ? `<div class="trovoadas">Trovoadas⚡</div><br>` : ""}
            </div>
          </div>
        </div>
      </div>
    `;

    // Vincula o clique para abrir o Modal de interface (declarado abaixo)
    div.querySelectorAll('.periodo').forEach(elPeriodo => {
      elPeriodo.onclick = () => {
        const inicio = parseInt(elPeriodo.getAttribute('data-inicio'));
        const fim = parseInt(elPeriodo.getAttribute('data-fim'));
        exibirModalHorarioUI(d, inicio, fim);
      };
    });

    container.appendChild(div);
  });

  atualizarHistoricoCallback(cidadeObj.cidade);

  document.getElementById("cidadeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
}

/**
 * Cria dinamicamente e injeta o modal com dados detalhados hora a hora na tela
 */
export function exibirModalHorarioUI(dadosDia, inicio, fmt) {
  const modalAntigo = document.getElementById("modal-previsao");
  if (modalAntigo) modalAntigo.remove();

  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "modal-previsao";
  overlay.className = "modal-overlay";

  const content = document.createElement("div");
  content.className = "modal-content";

  const data = document.createElement("p");
  data.textContent =
    `${obterDiaSemana(dadosDia.date)}, ${formatarData(dadosDia.date)}`;

  const cabecalho = document.createElement("div");
  cabecalho.className = "modal-cabecalho";
  cabecalho.append(data);

  const containerHoras = document.createElement("div");
  containerHoras.className = "modal-horas-container";

  const dh = dadosDia.dadosHorarios;

  const template = document.createElement("template");

  template.innerHTML = `
    <div class="periodo">
      <div class="hora"></div>

      <div class="periodo-infos" style="display:flex;flex-direction:row;flex-wrap:wrap;gap:8px;">
        <div class="temperatura"></div>
        <div class="chuva"></div>
        <div class="nuvens"></div>
      </div>
    </div>
  `;

  const fragment = document.createDocumentFragment();

  for (let h = inicio; h < fmt; h++) {
    const periodo =
      template.content.firstElementChild.cloneNode(true);

    const horaEl = periodo.querySelector(".hora");
    const tempEl = periodo.querySelector(".temperatura");
    const chuvaEl = periodo.querySelector(".chuva");
    const nuvensEl = periodo.querySelector(".nuvens");
    const infosEl = periodo.querySelector(".periodo-infos");

    horaEl.textContent = dh.horas[h];
    horaEl.style.fontWeight = "bolder";

    tempEl.textContent =
      `🌡️ ${Math.round(dh.temperaturas[h])}°C`;

    chuvaEl.textContent =
      `💧 ${dh.chuvas[h].toFixed(1)} mm (${dh.probabilidades[h]}%)`;

    nuvensEl.textContent =
      `Nuvens ${Math.round(dh.nebulosidade[h])}%`;

    if (dh.trovoadas?.[h]) {
      const trovoadasEl = document.createElement("div");

      trovoadasEl.className = "trovoadas";
      trovoadasEl.textContent = "⚡ Trovoadas";

      infosEl.appendChild(trovoadasEl);
    }

    fragment.appendChild(periodo);
  }

  containerHoras.appendChild(fragment);

  const btnFechar = document.createElement("button");
  btnFechar.className = "btn-fechar-modal";
  btnFechar.textContent = "Fechar";

  content.append(
    cabecalho,
    containerHoras,
    btnFechar
  );

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  const fecharModal = () => {
    overlay.remove();
    document.body.style.overflow = "";
  };

  btnFechar.addEventListener("click", fecharModal);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      fecharModal();
    }
  });
}