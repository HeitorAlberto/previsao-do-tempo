import { obterDiaSemana, formatarData } from './utils.js';

/**
 * Renderiza a lista de cidades buscadas recentemente (Histórico)
 */
export function renderizarHistoricoUI(
  historico,
  dadosCidadesLista,
  ufFromCode,
  callbackClique
) {
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

      if (city) {
        callbackClique(city);
      }
    };

    el.appendChild(item);
  });
}

/**
 * Renderiza os cards de previsão
 */
/**
 * Renderiza os cards de previsão
 */
export function renderizarCidadeUI(
  cidadeObj,
  atualizarHistoricoCallback
) {
  const container =
    document.getElementById("container");

  const titulo =
    document.getElementById("cidade");

  container.innerHTML = "";

  titulo.textContent =
    `📍 ${cidadeObj.cidade}`;

  let indiceAtual = 0;

  function renderizarCard(indice) {
    container.innerHTML = "";

    const d =
      cidadeObj.forecast[indice];

    const podeVoltar =
      indice > 0;

    const podeAvancar =
      indice <
      cidadeObj.forecast.length - 1;

    const card =
      document.createElement("div");

    card.className = "card";

    card.innerHTML = `
      <h3
        style="
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
        "
      >
        <button
          class="btn-nav-card"
          ${!podeVoltar ? "disabled" : ""}
          style="
            background:none;
            border:none;
            color:white;
            cursor:pointer;
            font-size:20px;
            font-weight:bolder;
            padding:0 8px;
            opacity:${podeVoltar ? 1 : .3};
          "
        >
          ◀︎
        </button>

        <span
          style="
            flex:1;
            text-align:center;
          "
        >
          ${obterDiaSemana(d.date)},
          ${formatarData(d.date)}
        </span>

        <button
          class="btn-nav-card"
          ${!podeAvancar ? "disabled" : ""}
          style="
            background:none;
            border:none;
            color:white;
            cursor:pointer;
            font-size:20px;
            font-weight:bolder;
            padding:0 8px;
            opacity:${podeAvancar ? 1 : .3};
          "
        >
          ▶︎
        </button>
      </h3>

      <div class="data-row">
        <div class="data">
          <div>Temperatura</div>

          <div class="temperatura">
            ${Math.round(d.temp_min_c)}°
            a
            ${Math.round(d.temp_max_c)}°
          </div>
        </div>

        <div class="data">
          <div>Chuva acumulada</div>

          <div class="chuva">
            ${d.rain_sum_mm} mm
          </div>
        </div>

        <div class="data">
          <div>Rajadas de vento máx</div>

          <div class="vento">
            ${Math.round(
      d.wind_max_kmh
    )} km/h
          </div>
        </div>
      </div>

      <div class="periodos-bloco">

        <div class="periodo">
          <div class="periodo-titulo">
            00h - 06h
          </div>

          <div class="periodo-infos">

            <div>
              ${d.p1.nuvens_desc}
            </div>

            <div style="color: #0085de">
              ${d.p1.chuva} mm
            </div>

            ${d.p1.trovoadas
        ? `
                <div style="color: orangered">
                  Trovoadas
                </div>
              `
        : ""
      }

          </div>
        </div>

        <div class="periodo">
          <div class="periodo-titulo">
            06h - 12h
          </div>

          <div class="periodo-infos">

            <div>
              ${d.p2.nuvens_desc}
            </div>

            <div style="color: #0085de">
              ${d.p2.chuva} mm
            </div>

            ${d.p2.trovoadas
        ? `
                <div style="color: orangered">
                  Trovoadas
                </div>
              `
        : ""
      }

          </div>
        </div>

        <div class="periodo">
          <div class="periodo-titulo">
            12h - 18h
          </div>

          <div class="periodo-infos">

            <div>
              ${d.p3.nuvens_desc}
            </div>

            <div style="color: #0085de">
              ${d.p3.chuva} mm
            </div>

            ${d.p3.trovoadas
        ? `
                <div style="color: orangered">
                  Trovoadas
                </div>
              `
        : ""
      }

          </div>
        </div>

        <div class="periodo">
          <div class="periodo-titulo">
            18h - 24h
          </div>

          <div class="periodo-infos">

            <div>
              ${d.p4.nuvens_desc}
            </div>

            <div style="color: #0085de">
              ${d.p4.chuva} mm
            </div>

            ${d.p4.trovoadas
        ? `
                <div style="color: orangered">
                  Trovoadas
                </div>
              `
        : ""
      }

          </div>
        </div>

      </div>

      <button
        class="btn-dados-horarios"
      >
        Dados horários
      </button>
    `;

    const botoes =
      card.querySelectorAll(
        ".btn-nav-card"
      );

    botoes[0]
      .addEventListener(
        "click",
        () => {
          if (
            indiceAtual > 0
          ) {
            indiceAtual--;

            renderizarCard(
              indiceAtual
            );
          }
        }
      );

    botoes[1]
      .addEventListener(
        "click",
        () => {
          if (
            indiceAtual <
            cidadeObj.forecast
              .length - 1
          ) {
            indiceAtual++;

            renderizarCard(
              indiceAtual
            );
          }
        }
      );

    card
      .querySelector(
        ".btn-dados-horarios"
      )
      .addEventListener(
        "click",
        () => {
          exibirModalHorarioUI(
            d
          );
        }
      );

    container.appendChild(
      card
    );
  }

  renderizarCard(
    indiceAtual
  );

  atualizarHistoricoCallback(
    cidadeObj.cidade
  );

  document.getElementById(
    "cidadeInput"
  ).value = "";

  document.getElementById(
    "suggestions"
  ).innerHTML = "";
}

/**
 * Modal com todas as horas do dia
 */

function descricaoNuvens(percentual) {

  if (percentual <= 20) return "Poucas nuvens";
  if (percentual <= 50) return "Nuvens esparsas";
  if (percentual <= 80) return "Muitas nuvens";

  return "Nublado";
}

export function exibirModalHorarioUI(dadosDia) {
  const modalAntigo =
    document.getElementById("modal-previsao");

  if (modalAntigo) {
    modalAntigo.remove();
  }

  document.body.style.overflow = "hidden";

  const overlay = document.createElement("div");
  overlay.id = "modal-previsao";
  overlay.className = "modal-overlay";

  const content = document.createElement("div");
  content.className = "modal-content";

  const cabecalho = document.createElement("div");
  cabecalho.className = "modal-cabecalho";

  const titulo = document.createElement("p");
  titulo.textContent =
    `${obterDiaSemana(dadosDia.date)}, ${formatarData(dadosDia.date)}`;

  cabecalho.appendChild(titulo);

  const containerHoras = document.createElement("div");
  containerHoras.className = "modal-horas-container";

  const dh = dadosDia.dadosHorarios;

  // Obtém a hora atual no fuso horário do Brasil (formato "HH:00")
  const horaAtualBrasil = new Date().toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit"
  }).split(":")[0] + ":00";

  let elementoHoraAtual = null;

  for (let h = 0; h < dh.horas.length; h++) {
    const linha = document.createElement("div");
    linha.className = "horas";

    // Verifica se a hora da linha corresponde à hora atual do Brasil
    const ehHoraAtual = dh.horas[h] === horaAtualBrasil;

    // Aplica o estilo dourado apenas na div da hora
    const estiloHora = ehHoraAtual
      ? 'style="font-weight: bolder; color: #ffb732;"'
      : 'style="font-weight: bolder;"';

    linha.innerHTML = `
      <div class="hora" ${estiloHora}>
        ${dh.horas[h]}
      </div>

      <div>
        ${descricaoNuvens(dh.nebulosidade[h])}
      </div>

      <div class="hora-info">
        <div>
          ${Math.round(dh.temperaturas[h])}°C
        </div>

        <div>
          ${Number(dh.chuvas[h]).toFixed(1)} mm (${dh.probabilidades[h]}%)
        </div>


        ${dh.trovoadas?.[h]
      ? '<div style="color: #ffb732;">Trovoadas</div>'
        : ''
      }
      </div>
    `;

    if (ehHoraAtual) {
      elementoHoraAtual = linha;
    }

    containerHoras.appendChild(linha);
  }

  const btnFechar = document.createElement("button");
  btnFechar.className = "btn-fechar-modal";
  btnFechar.textContent = "Fechar";

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

  content.append(
    cabecalho,
    containerHoras,
    btnFechar
  );

  overlay.appendChild(content);

  document.body.appendChild(overlay);

  // Desloca o scroll do container para exibir a linha atualizada na tela
  if (elementoHoraAtual) {
    setTimeout(() => {
      elementoHoraAtual.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }
}
