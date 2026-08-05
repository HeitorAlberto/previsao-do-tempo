// Configuração dos Limites de Cores e Rótulos do INMET
// Chuva acumulada em 3 horas (adaptado dos limites horários do INMET)
const RAIN_INMET_3H = [
  { max: 0.1,  class: 'rain-none',       label: 'Sem chuva' },
  { max: 7.5,  class: 'rain-very-light', label: 'Chuviscos' },
  { max: 15.0, class: 'rain-light',      label: 'Chuva leve' },
  { max: 30.0, class: 'rain-moderate',   label: 'Chuva moderada' },
  { max: 60.0, class: 'rain-heavy',      label: 'Chuva forte' },
  { max: Infinity, class: 'rain-extreme', label: 'Chuva extrema' }
];

// Ventos (com base nas cores de alerta do INMET)
const WIND_INMET = [
  { max: 40, class: 'wind-normal', label: 'Rajadas de vento' },
  { max: 60, class: 'wind-yellow', label: 'Rajadas moderadas' },
  { max: 100, class: 'wind-orange', label: 'Rajadas fortes' },
  { max: Infinity, class: 'wind-red', label: 'Rajadas muito fortes' }
];

// Utilitários para mapeamento de classes CSS e rótulos
function getRainInfo(mm3h) {
  return RAIN_INMET_3H.find(rule => mm3h <= rule.max);
}

function getWindInfo(kmh) {
  return WIND_INMET.find(rule => kmh <= rule.max);
}

// Retorna apenas o texto descritivo da nebulosidade
function getCloudText(cloudCover) {
  if (cloudCover <= 25) return 'Poucas nuvens';
  if (cloudCover <= 50) return 'Nuvens esparsas';
  if (cloudCover <= 75) return 'Muitas nuvens';
  return 'Nublado';
}

// Elementos do DOM
const searchInput = document.getElementById('city-search');
const suggestionsUl = document.getElementById('search-suggestions');
const currentLocationDiv = document.getElementById('current-location');
const historyDiv = document.getElementById('search-history');
let debounceTimer;

// --- GERENCIAMENTO DE HISTÓRICO ---
function getHistory() {
  return JSON.parse(localStorage.getItem('weather_history')) || [];
}

function saveToHistory(place) {
  let history = getHistory();
  
  // 1. Remove se já existir (evita duplicatas)
  history = history.filter(item => item.name !== place.name || item.country !== place.country);
  
  // 2. Adiciona o mais recente no topo
  history.unshift(place);
  
  // 3. Limita a no máximo 3 locais
  if (history.length > 3) {
    history = history.slice(0, 3);
  }
  
  localStorage.setItem('weather_history', JSON.stringify(history));
  renderHistory();
}

// Renderiza divs simples com a classe history-item
function renderHistory() {
  const history = getHistory();
  historyDiv.innerHTML = '';

  if (history.length === 0) return;

  history.forEach(place => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'history-item';
    itemDiv.textContent = `${place.name}`;
    itemDiv.addEventListener('click', () => {
      selectCity(place);
    });
    historyDiv.appendChild(itemDiv);
  });
}

// Função executada ao selecionar uma cidade
function selectCity(place) {
  suggestionsUl.hidden = true;
  
  const formattedLocation = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`;
  currentLocationDiv.innerHTML = `<div style="justify-self: center">📍 Local atual:</div> <br> <div>${formattedLocation}</div>`;
  
  saveToHistory(place);
  fetchForecast(place.latitude, place.longitude);
}

// 1. Autocomplete (Open-Meteo Geocoding API)
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();
  
  if (query.length < 3) {
    suggestionsUl.hidden = true;
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt`);
      const data = await res.json();
      
      suggestionsUl.innerHTML = '';
      if (data.results && data.results.length > 0) {
        data.results.forEach(place => {
          const li = document.createElement('li');
          li.textContent = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''} - ${place.country}`;
          li.addEventListener('click', () => selectCity(place));
          suggestionsUl.appendChild(li);
        });
        suggestionsUl.hidden = false;
      }
    } catch (err) {
      console.error('Erro na geocodificação:', err);
    }
  }, 300);
});

// 2. Busca Previsão ECMWF de Alta Resolução (IFS 9km)
async function fetchForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,cloud_cover,wind_gusts_10m&models=ecmwf_ifs025&timezone=auto`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    renderForecast(data.hourly);
  } catch (err) {
    console.error('Erro ao buscar previsão:', err);
  }
}

// 3. Processamento dos Dados Horários -> Diário e Blocos de 3h
function renderForecast(hourly) {
  const container = document.getElementById('forecast-container');
  container.innerHTML = '';

  const daysMap = {};
  
  hourly.time.forEach((timeStr, i) => {
    const dateStr = timeStr.substring(0, 10);
    if (!daysMap[dateStr]) {
      daysMap[dateStr] = {
        times: [],
        temps: [],
        precip: [],
        clouds: [],
        windGusts: []
      };
    }
    daysMap[dateStr].times.push(timeStr);
    daysMap[dateStr].temps.push(hourly.temperature_2m[i]);
    daysMap[dateStr].precip.push(hourly.precipitation[i]);
    daysMap[dateStr].clouds.push(hourly.cloud_cover[i]);
    daysMap[dateStr].windGusts.push(hourly.wind_gusts_10m[i]);
  });

  Object.keys(daysMap).forEach(dateKey => {
    const day = daysMap[dateKey];
    
    const minTemp = Math.round(Math.min(...day.temps));
    const maxTemp = Math.round(Math.max(...day.temps));
    const totalRain = day.precip.reduce((a, b) => a + b, 0).toFixed(1);
    const maxWind = Math.round(Math.max(...day.windGusts));
    
    const [year, month, dayNum] = dateKey.split('-');
    const dateObj = new Date(year, month - 1, dayNum);
    const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const formattedDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dayNum}/${month}/${year.slice(2)}`;

    const blocks3h = [];
    for (let i = 0; i < day.times.length; i += 3) {
      const sliceClouds = day.clouds.slice(i, i + 3);
      const slicePrecip = day.precip.slice(i, i + 3);
      const sliceWind = day.windGusts.slice(i, i + 3);
      
      const hourLabel = day.times[i].substring(11, 16);
      const avgCloud = sliceClouds.reduce((a, b) => a + b, 0) / (sliceClouds.length || 1);
      const sumPrecip = slicePrecip.reduce((a, b) => a + b, 0);
      const maxWind3h = Math.max(...sliceWind);

      const rainInfo = getRainInfo(sumPrecip);
      const windInfo = getWindInfo(maxWind3h);

      blocks3h.push({
        hour: hourLabel,
        cloudState: getCloudText(avgCloud),
        rainMm: sumPrecip.toFixed(1),
        rainClass: rainInfo.class,
        rainLabel: rainInfo.label,
        windKmh: Math.round(maxWind3h),
        windClass: windInfo.class,
        windLabel: windInfo.label
      });
    }

    const cardDiv = document.createElement('article');
    cardDiv.className = 'daily-card';
    
    cardDiv.innerHTML = `
      <div class="card-summary">
        <h3>${formattedDate}</h3>
        <div class="info-day">
            <p>Temperatura</p> <p>${minTemp}° a ${maxTemp}°</p>
        </div>

        <div class="info-day">
            <p>Chuva acumulada</p> <p>${totalRain} mm</p>
        </div>

        <div class="info-day">
            <p>Rajadas de vento max</p> <p>${maxWind} km/h</p>
        </div>
        
        <button class="toggle-btn" aria-label="Expandir detalhes">Expandir</button>
      </div>

      <div class="card-details" hidden>
        <div class="blocks-grid">
          ${blocks3h.map(block => `
            <div class="block-3h">
              <span class="block-time">${block.hour}</span>
              <span class="block-cloud">${block.cloudState}</span>
              <span class="block-rain ${block.rainClass}">${block.rainLabel} - ${block.rainMm} mm</span>
              <span class="block-wind ${block.windClass}">${block.windLabel} - ${block.windKmh} km/h</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    const toggleBtn = cardDiv.querySelector('.toggle-btn');
    const detailsDiv = cardDiv.querySelector('.card-details');

    toggleBtn.addEventListener('click', () => {
      const isHidden = detailsDiv.hidden;
      detailsDiv.hidden = !isHidden;
      toggleBtn.textContent = isHidden ? 'Retrair' : 'Expandir';
    });

    container.appendChild(cardDiv);
  });
}

// Renderiza o histórico salvo ao carregar a aplicação
renderHistory();