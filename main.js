// ESSE CODIGO É O ORQUESTRADOR PRINCIPAL

// É chamado no HTML. Controla o estado global (cidade atual, dados, histórico), ouve eventos de digitação no input e de clique, e chama as funções dos outros módulos para buscar dados e atualizar a tela.

import { fetchLocations, fetchWeatherData } from './api.js';
import { renderHistory, renderForecast } from './ui.js';
import { openModal } from './modal.js';

let searchHistory = JSON.parse(localStorage.getItem('weather_history') || '[]');
let currentWeatherData = null;
let currentCityName = '';

const searchInput = document.getElementById('searchInput');
const suggestionsContainer = document.getElementById('suggestionsContainer');
const modalOverlay = document.getElementById('modalOverlay');

renderHistory(searchHistory, selectLocation);

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 3) { suggestionsContainer.style.display = 'none'; return; }
    setTimeout(async () => {
        const results = await fetchLocations(query);
        suggestionsContainer.innerHTML = '';
        if (results.length > 0) {
            results.forEach(loc => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = `${loc.name}, ${loc.admin1 || ''} (${loc.country})`;
                div.addEventListener('click', () => selectLocation(loc));
                suggestionsContainer.appendChild(div);
            });
            suggestionsContainer.style.display = 'block';
        }
    }, 300);
});

async function selectLocation(loc) {
    // Evita duplicar o admin1 se ele já estiver presente no nome escolhido
    const stateName = loc.admin1 || loc.country;
    const locName = loc.name.includes(stateName) ? loc.name : `${loc.name}, ${stateName}`;
    
    currentCityName = locName;
    searchInput.value = '';
    suggestionsContainer.style.display = 'none';
    
    const locationObj = { 
        name: locName, 
        latitude: loc.latitude || loc.lat, 
        longitude: loc.longitude || loc.lon, 
        country: loc.country, 
        admin1: loc.admin1 
    };

    searchHistory = [
        locationObj, 
        ...searchHistory.filter(i => i.name !== locName)
    ].slice(0, 3);

    localStorage.setItem('weather_history', JSON.stringify(searchHistory));
    renderHistory(searchHistory, selectLocation);

    currentWeatherData = await fetchWeatherData(locationObj.latitude, locationObj.longitude);
    renderForecast(currentWeatherData, currentCityName, (dayIdx, type, title, bg) => {
        openModal(dayIdx, type, title, bg, currentWeatherData);
    });
}
document.getElementById('modalClose').addEventListener('click', () => modalOverlay.style.display = 'none');
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.style.display = 'none'; });