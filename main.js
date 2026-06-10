import { normalizarTexto, ufFromCode } from './utils.js';
import { buscarCidadesJSON, fetchPrevisao, processarDadosPrevisao } from './api.js';
import { renderizarHistoricoUI, renderizarCidadeUI } from './ui.js';

// Estado global da aplicação
let dadosCidadesLista = [];
let historico = JSON.parse(localStorage.getItem("historico")) || [];
let carregando = false;

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
    const cidadeAtualObj = processarDadosPrevisao(data, city);

    // Agora passa apenas 2 parâmetros. O ui.js cuida do clique do modal sozinho.
    renderizarCidadeUI(cidadeAtualObj, atualizarHistorico);
  } catch (e) {
    console.error(e);
    titulo.textContent = "Erro na previsão.";
  } finally {
    carregando = false;
  }
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