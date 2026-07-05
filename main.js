import { normalizarTexto, ufFromCode } from './utils.js';
import { buscarCidadesJSON, fetchPrevisao, processarDadosPrevisao } from './api.js';
import { renderizarHistoricoUI, renderizarCidadeUI } from './ui.js';

// Estado global da aplicação
let dadosCidadesLista = [];
let historico = JSON.parse(localStorage.getItem("historico")) || [];
let carregando = false;

// Controle de paginação dos dias
let diaAtualIndex = 0; 
let dadosPrevisaoGlobais = null; 

const inputEl = document.getElementById("cidadeInput");
const suggestions = document.getElementById("suggestions");
const titulo = document.getElementById("cidade");

/**
 * Inicializa a aplicação carregando a lista de cidades do JSON local
 */
async function iniciar() {
  try {
    dadosCidadesLista = await buscarCidadesJSON();
    titulo.textContent = "Busque uma cidade";
    renderizarHistorico();
  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro ao carregar cidades.";
  }
}

function salvarHistorico() {
  localStorage.setItem("historico", JSON.stringify(historico));
}

function renderizarHistorico() {
  renderizarHistoricoUI(historico, dadosCidadesLista, ufFromCode, buscarPrevisaoOpenMeteo);
}

function atualizarHistorico(nomeCidade) {
  historico = historico.filter(c => c !== nomeCidade);
  historico.unshift(nomeCidade);
  historico = historico.slice(0, 3);
  salvarHistorico();
  renderizarHistorico();
}

/**
 * Dispara a busca da previsão do tempo na API Open-Meteo
 */
async function buscarPrevisaoOpenMeteo(city) {
  if (carregando) return;
  carregando = true;
  titulo.textContent = "⏳ Carregando...";

  try {
    const data = await fetchPrevisao(city);
    dadosPrevisaoGlobais = processarDadosPrevisao(data, city);
    
    // Sempre que buscar uma nova cidade, reinicia para o primeiro dia
    diaAtualIndex = 0; 

    // Renderiza a UI passando o objeto de dados, o índice do dia e o callback do histórico
    renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex, atualizarHistorico);
    
    // Ativa os cliques dos botões de avançar/voltar que já estão no HTML
    configurarBotoesNavegacao();

  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro na previsão.";
  } finally {
    carregando = false;
  }
}

/**
 * Configura os cliques dos botões de avançar e voltar do HTML
 */
function configurarBotoesNavegacao() {
  const btnVoltar = document.getElementById("btnVoltar");
  const btnAvancar = document.getElementById("btnAvancar");

  // .onclick limpa eventos anteriores evitando bugs se o usuário buscar várias cidades
  btnVoltar.onclick = () => {
    if (diaAtualIndex > 0) {
      diaAtualIndex--;
      // Não passamos o callback aqui para não reinserir no histórico a cada clique de navegação
      renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex);
    }
  };

  btnAvancar.onclick = () => {
    // Verificação usando '.forecast' que é o padrão do seu objeto
    if (dadosPrevisaoGlobais && dadosPrevisaoGlobais.forecast && diaAtualIndex < dadosPrevisaoGlobais.forecast.length - 1) { 
      diaAtualIndex++;
      // Não passamos o callback aqui para não reinserir no histórico a cada clique de navegação
      renderizarCidadeUI(dadosPrevisaoGlobais, diaAtualIndex);
    }
  };
}

/**
 * Processa o clique da barra de busca principal
 */
function buscarCidade() {
  const input = normalizarTexto(inputEl.value);
  const cidadeEncontrada = dadosCidadesLista.find(c =>
    normalizarTexto(c.nome).includes(input)
  );

  if (!cidadeEncontrada) {
    titulo.textContent = "Cidade não encontrada";
    return;
  }

  buscarPrevisaoOpenMeteo(cidadeEncontrada);
}

/* ==========================================================================
   Ouvintes de Eventos (Event Listeners)
   ========================================================================== */

// Evento de Digitação para Autocomplete (Sugestões)
inputEl.addEventListener("input", () => {
  const valor = normalizarTexto(inputEl.value);
  suggestions.innerHTML = "";
  if (!valor) return;

  const filtrados = dadosCidadesLista
    .filter(c => normalizarTexto(c.nome).includes(valor))
    .slice(0, 6);

  filtrados.forEach(c => {
    const item = document.createElement("div");
    const uf = ufFromCode(c);
    item.textContent = uf ? `${c.nome} - ${uf}` : c.nome;

    item.onclick = () => {
      inputEl.value = c.nome;
      suggestions.innerHTML = "";
      buscarPrevisaoOpenMeteo(c);
    };
    suggestions.appendChild(item);
  });
});

// Fecha a caixa de sugestões se clicar em qualquer outro ponto do documento
document.addEventListener("click", (e) => {
  if (e.target !== inputEl) suggestions.innerHTML = "";
});

// Clique no botão de busca
document.getElementById("btnBuscar").addEventListener("click", buscarCidade);

// Atalho da tecla Enter no input
inputEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") buscarCidade();
});

// Inicialização automática do App
iniciar();