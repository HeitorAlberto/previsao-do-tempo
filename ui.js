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
        
        <div style="color: #0085de; font-weight: bolder;">
          ${periodoDados.chuva} mm (${periodoDados.probabilidade}%)
        </div>
        
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

    // PEGA O DADO DE RAJADA (Ajuste o nome '.rajadas' se na sua API for diferente, ex: .wind_gusts)
    const rajadaVento = dh.rajadas?.[h] ? Math.round(dh.rajadas[h]) : 0;

    linhasHtml += `
      <div class="horas" ${idHoraAtual}>
        <div class="hora" ${estiloHora}>${dh.horas[h]}</div>
        <div>${descricaoNuvens(dh.nebulosidade[h], dh.horas[h])}</div>
        <div class="hora-info">
          <div>${Math.round(dh.temperaturas[h])}°C</div>
          <div style="color: #0085de">${Number(dh.chuvas[h]).toFixed(1)} mm (${dh.probabilidades[h]}%)</div>
          
          <div style="color: #24a700; font-size: 12px;">${rajadaVento} km/h</div>
          
          ${trovoadaHtml}
        </div>
      </div>
    `;
  }

  return linhasHtml;
}

/**
 * Renderiza la lista de cidades buscadas recentemente (Histórico)
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
 * Renderiza os dados do dia selecionado usando a estrutura fixa do HTML
 */
export function renderizarCidadeUI(cidadeObj, indiceAtual, atualizarHistoricoCallback) {

  const card = document.querySelector(".card");
  if (card) {
    card.classList.remove("hidden");
    card.style.display = "grid"; // <-- ADICIONE ESTA LINHA AQUI!
  }

  const titulo = document.getElementById("cidade");
  titulo.textContent = `📍 ${cidadeObj.cidade}`;

  const d = cidadeObj.forecast[indiceAtual];
  const podeVoltar = indiceAtual > 0;
  const podeAvancar = indiceAtual < cidadeObj.forecast.length - 1;

  // 1. Atualiza elementos textuais simples
  document.getElementById("dataExibida").textContent = `${obterDiaSemana(d.date)}, ${formatarData(d.date)}`;
  document.getElementById("temperatura").textContent = `${Math.round(d.temp_min_c)}° a ${Math.round(d.temp_max_c)}°`;
  document.getElementById("chuva").textContent = `${d.rain_sum_mm} mm`;
  document.getElementById("vento").textContent = `${Math.round(d.wind_max_kmh)} km/h`;

  // 2. Atualiza os blocos internos complexos
  document.getElementById("periodosBloco").innerHTML = `
    ${gerarHtmlPeriodo("00h - 06h", d.p1)}
    ${gerarHtmlPeriodo("06h - 12h", d.p2)}
    ${gerarHtmlPeriodo("12h - 18h", d.p3)}
    ${gerarHtmlPeriodo("18h - 00h", d.p4)}
  `;

  document.getElementById("horasBloco").innerHTML = gerarHtmlDadosHorarios(d);

  // 3. Atualiza os botões e suas opacidades diretamente por seletores estáticos
  const btnVoltar = document.getElementById("btnVoltar");
  const btnAvancar = document.getElementById("btnAvancar");

  btnVoltar.disabled = !podeVoltar;
  btnVoltar.style.opacity = podeVoltar ? "1" : ".3";

  btnAvancar.disabled = !podeAvancar;
  btnAvancar.style.opacity = podeAvancar ? "1" : ".3";

  // 4. Executa o scroll suave se a hora atual estiver renderizada
  const elementoHoraAtual = document.getElementById("hora-atual-card");
  if (elementoHoraAtual) {
    setTimeout(() => {
      elementoHoraAtual.scrollIntoView({ 
        behavior: "smooth", 
        inline: "start",
        block: "nearest"
      });
    }, 50);
  }

  // Se a função foi ativada por uma busca inicial, limpa o input e atualiza histórico
  if (typeof atualizarHistoricoCallback === "function") {
    atualizarHistoricoCallback(cidadeObj.cidade);
    document.getElementById("cidadeInput").value = "";
    document.getElementById("suggestions").innerHTML = "";
  }
}