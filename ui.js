import { obterDiaSemana, formatarData } from './utils.js';

/**
 * Retorna o ícone correto com base na nebulosidade e horário.
 */
function descricaoNuvens(percentual, hora) {
  const horaNumero = Number(hora.split(":")[0]);
  const noite = horaNumero >= 18 || horaNumero < 6;
  const sufixo = noite ? 'noite-' : '';

  if (percentual <= 20) return `<img src='icones/${sufixo}poucas-nuvens.png'>`;
  if (percentual <= 50) return `<img src='icones/${sufixo}nuvens-esparsas.png'>`;
  if (percentual <= 80) return `<img src='icones/${sufixo}muitas-nuvens.png'>`;
  return `<img src='icones/${sufixo}nublado.png'>`;
}

/**
 * Gera o HTML padrão para os blocos de períodos (Madrugada, Manhã, Tarde, Noite).
 */
function gerarHtmlPeriodo(titulo, periodoDados) {
  const trovoadaHtml = periodoDados.trovoadas 
    ? `<div style="color: #ff6229"><img src="icones/trovoadas.png" width="70px"></div>` 
    : '';

  return `
    <div class="periodo">
      <div class="periodo-titulo">${titulo}</div>
      <div class="periodo-infos">
        <div>${periodoDados.nuvens_desc}</div>
        <div style="color: #0085de">${periodoDados.chuva} mm</div>
        ${trovoadaHtml}
      </div>
    </div>
  `;
}

/**
 * Gera a estrutura HTML dos dados horários (antigo modal, agora embutido).
 */
function gerarHtmlDadosHorarios(dadosDia) {
  const dh = dadosDia.dadosHorarios;
  if (!dh || !dh.horas) return '';

  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).split(":")[0] + ":00";

  let linhasHtml = "";

  for (let h = 0; h < dh.horas.length; h++) {
    const ehHoraAtual = dh.horas[h] === horaAtualBrasil;
    const estiloHora = ehHoraAtual ? 'style="font-weight: bolder; background-color: #dfdfdf;"' : 'style="font-weight: bolder;"';
    const trovoadaHtml = dh.trovoadas?.[h] ? '<div style="color: #ff6229;">Trovoadas</div>' : '';
    const idHoraAtual = ehHoraAtual ? 'id="hora-atual-card"' : '';

    linhasHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${dh.horas[h]}</div>
        <div>${descricaoNuvens(dh.nebulosidade[h], dh.horas[h])}</div>
        <div class="hora-info">
          <div>${Math.round(dh.temperaturas[h])}°C</div>
          <div>${Number(dh.chuvas[h]).toFixed(1)} mm (${dh.probabilidades[h]}%)</div>
          ${trovoadaHtml}
        </div>
      </div>
    `;
  }

  return `
    <div class="card-horas-container" style="max-height: 300px; overflow-y: auto; border-top: 1px solid #ddd; padding-top: 15px;">
      ${linhasHtml}
    </div>
  `;
}

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
      const city = dadosCidadesLista.find((c) => {
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
 * Renderiza os cards de previsão
 */
export function renderizarCidadeUI(cidadeObj, atualizarHistoricoCallback) {
  const container = document.getElementById("container");
  const titulo = document.getElementById("cidade");

  container.innerHTML = "";
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  let indiceAtual = 0;

  function renderizarCard(indice) {
    container.innerHTML = "";

    const d = cidadeObj.forecast[indice];
    const podeVoltar = indice > 0;
    const podeAvancar = indice < cidadeObj.forecast.length - 1;

    const card = document.createElement("div");
    card.className = "card";

    const estiloBtnVoltar = `background:none; border:none; color:white; cursor:pointer; font-size:20px; font-weight:bolder; padding:0 8px; opacity:${podeVoltar ? 1 : .3};`;
    const estiloBtnAvancar = `background:none; border:none; color:white; cursor:pointer; font-size:20px; font-weight:bolder; padding:0 8px; opacity:${podeAvancar ? 1 : .3};`;

    card.innerHTML = `
      <h3 style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <button class="btn-nav-card btn-voltar" ${!podeVoltar ? "disabled" : ""} style="${estiloBtnVoltar}">◀︎</button>
        <span style="flex:1; text-align:center;">
          ${obterDiaSemana(d.date)}, ${formatarData(d.date)}
        </span>
        <button class="btn-nav-card btn-avancar" ${!podeAvancar ? "disabled" : ""} style="${estiloBtnAvancar}">▶︎</button>
      </h3>

      <div class="data-row">
        <div class="data">
          <div>Temperatura</div>
          <div class="temperatura">${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°</div>
        </div>
        <div class="data">
          <div>Chuva acumulada</div>
          <div class="chuva">${d.rain_sum_mm} mm</div>
        </div>
        <div class="data">
          <div>Rajadas de vento máx</div>
          <div class="vento">${Math.round(d.wind_max_kmh)} km/h</div>
        </div>
      </div>

      <div class="titulo-periodo-hora">Dados por período</div>

      <div class="periodos-bloco">
        ${gerarHtmlPeriodo("00h - 06h", d.p1)}
        ${gerarHtmlPeriodo("06h - 12h", d.p2)}
        ${gerarHtmlPeriodo("12h - 18h", d.p3)}
        ${gerarHtmlPeriodo("18h - 00h", d.p4)}
      </div>

      <div class="titulo-periodo-hora">Dados por hora</div>

      ${gerarHtmlDadosHorarios(d)}
    `;

    // Listeners de navegação dos dias
    card.querySelector(".btn-voltar").addEventListener("click", () => {
      if (indiceAtual > 0) {
        indiceAtual--;
        renderizarCard(indiceAtual);
      }
    });

    card.querySelector(".btn-avancar").addEventListener("click", () => {
      if (indiceAtual < cidadeObj.forecast.length - 1) {
        indiceAtual++;
        renderizarCard(indiceAtual);
      }
    });

    container.appendChild(card);

    // Scroll suave para a hora atual executado diretamente na montagem do card
    const elementoHoraAtual = card.querySelector("#hora-atual-card");
    if (elementoHoraAtual) {
      setTimeout(() => {
        elementoHoraAtual.scrollIntoView({ 
          behavior: "smooth", 
          inline: "start",
          block: "nearest"  // Impede que a página (body) se mova verticalmente se o elemento já estiver visível na região
        });
      }, 50);
    }
  }

  renderizarCard(indiceAtual);
  atualizarHistoricoCallback(cidadeObj.cidade);

  document.getElementById("cidadeInput").value = "";
  document.getElementById("suggestions").innerHTML = "";
}