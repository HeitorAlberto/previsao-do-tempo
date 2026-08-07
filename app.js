// Configuração dos Limites de Cores e Rótulos do INMET
// Chuva acumulada por hora (Escala original horária do INMET)
const RAIN_INMET_1H = [
  { max: 0.1, class: '', label: 'Sem chuva' },
  { max: 2.5, class: '', label: 'Chuva fraca' },
  { max: 10.0, class: '', label: 'Chuva moderada' },
  { max: 20.0, class: '', label: 'Chuva forte' },
  { max: Infinity, class: '', label: '(Extrema)' }
];

// Ventos (com base nas cores de alerta do INMET)
const WIND_INMET = [
  { max: 40, class: 'wind-normal', label: '' },
  { max: 60, class: 'wind-yellow', label: '' },
  { max: 100, class: 'wind-orange', label: '' },
  { max: Infinity, class: 'wind-red', label: '' }
];

// Utilitários para mapeamento de classes CSS e rótulos
function getRainInfo(mm1h) {
  return RAIN_INMET_1H.find(rule => mm1h <= rule.max);
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

// Verifica se há código WMO referente a trovoadas (95: Trovoadas, 96/99: Trovoadas com granizo)
function isThunderstorm(code) {
  return code === 95 || code === 96 || code === 99;
}

// Elementos do DOM
const searchInput = document.getElementById('city-search');
const suggestionsDiv = document.getElementById('search-suggestions');
const currentLocationDiv = document.getElementById('current-location');
const historyDiv = document.getElementById('search-history');
let debounceTimer;

// Esconde imediatamente o container de sugestões
function hideSuggestions() {
  suggestionsDiv.hidden = true;
  suggestionsDiv.style.display = 'none';
  suggestionsDiv.innerHTML = '';
}

// Exibe o container de sugestões
function showSuggestions() {
  suggestionsDiv.hidden = false;
  suggestionsDiv.style.display = 'block';
}

// --- GERENCIAMENTO DE HISTÓRICO ---
function getHistory() {
  return JSON.parse(localStorage.getItem('weather_history')) || [];
}

function saveToHistory(place) {
  let history = getHistory();
  
  // 1. Remove se já existir (evita duplicatas considerando cidade, estado e país)
  history = history.filter(item => 
    !(item.name === place.name && item.admin1 === place.admin1 && item.country === place.country)
  );
  
  // 2. Adiciona o mais recente no topo
  history.unshift(place);
  
  // 3. Limita a no máximo 3 locais
  if (history.length > 3) {
    history = history.slice(0, 3);
  }
  
  localStorage.setItem('weather_history', JSON.stringify(history));
  renderHistory();
}

// Renderiza o título "Histórico" e as divs simples das cidades salvas (Cidade, Estado, País)
function renderHistory() {
  const history = getHistory();
  historyDiv.innerHTML = '';

  if (history.length === 0) return;

  const titleHeader = document.createElement('h4');
  titleHeader.className = 'history-title';
  titleHeader.textContent = 'Últimas buscas:';
  historyDiv.appendChild(titleHeader);

  history.forEach(place => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'history-item';
    
    const formattedText = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`;
    itemDiv.textContent = formattedText;
    
    itemDiv.addEventListener('click', () => {
      selectCity(place);
    });
    historyDiv.appendChild(itemDiv);
  });
}

// Função executada ao selecionar uma cidade
function selectCity(place) {
  // Esconde e limpa o elemento de sugestões IMEDIATAMENTE após a busca
  hideSuggestions();
  searchInput.value = '';
  
  const formattedLocation = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`;
  currentLocationDiv.style.border = '2px solid black';

  currentLocationDiv.innerHTML = `<p style="font-weight: bolder">📍 Local atual:</p> <br> <p>${formattedLocation}</p>`;
  
  saveToHistory(place);
  fetchForecast(place.latitude, place.longitude);
}

// 1. Autocomplete (Open-Meteo Geocoding API) - Renderizado usando DIVs
searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value.trim();
  
  if (query.length < 3) {
    hideSuggestions();
    return;
  }

  debounceTimer = setTimeout(async () => {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt`);
      const data = await res.json();
      
      suggestionsDiv.innerHTML = '';
      if (data.results && data.results.length > 0) {
        data.results.forEach(place => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'suggestion-item';
          itemDiv.textContent = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''} - ${place.country}`;
          itemDiv.addEventListener('click', () => selectCity(place));
          suggestionsDiv.appendChild(itemDiv);
        });
        showSuggestions();
      } else {
        hideSuggestions();
      }
    } catch (err) {
      console.error('Erro na geocodificação:', err);
      hideSuggestions();
    }
  }, 300);
});

// 2. Busca Previsão ECMWF de Alta Resolução (IFS 9km) com inclusão de weather_code
async function fetchForecast(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,cloud_cover,wind_gusts_10m,weather_code&models=ecmwf_ifs&timezone=auto`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    renderForecast(data.hourly);
  } catch (err) {
    console.error('Erro ao buscar previsão:', err);
  }
}

// 3. Processamento dos Dados Horários -> Diário e Blocos de 1h
function renderForecast(hourly) {
  const container = document.getElementById('forecast-container');
  container.innerHTML = '';

  const daysMap = {};
  
  // Data e hora atual para identificação da hora presente
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHourStr = String(now.getHours()).padStart(2, '0');

  let currentBlockElement = null;

  hourly.time.forEach((timeStr, i) => {
    const dateStr = timeStr.substring(0, 10);
    if (!daysMap[dateStr]) {
      daysMap[dateStr] = {
        times: [],
        temps: [],
        precip: [],
        clouds: [],
        windGusts: [],
        weatherCodes: []
      };
    }
    daysMap[dateStr].times.push(timeStr);
    daysMap[dateStr].temps.push(hourly.temperature_2m[i]);
    daysMap[dateStr].precip.push(hourly.precipitation[i]);
    daysMap[dateStr].clouds.push(hourly.cloud_cover[i]);
    daysMap[dateStr].windGusts.push(hourly.wind_gusts_10m[i]);
    daysMap[dateStr].weatherCodes.push(hourly.weather_code[i]);
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

    const isToday = (dateKey === todayStr);

    const cardDiv = document.createElement('article');
    cardDiv.className = 'daily-card';

    const blocksGrid = document.createElement('div');
    blocksGrid.className = 'blocks-grid';

    day.times.forEach((timeStr, i) => {
      const hourLabel = timeStr.substring(11, 16);
      const hourOnly = hourLabel.substring(0, 2);
      const temp = Math.round(day.temps[i]);
      const cloudVal = day.clouds[i];
      const precipVal = day.precip[i];
      const windVal = day.windGusts[i];
      const codeVal = day.weatherCodes[i];

      const rainInfo = getRainInfo(precipVal);
      const windInfo = getWindInfo(windVal);
      const thunder = isThunderstorm(codeVal);

      const isCurrentHour = isToday && (hourOnly === currentHourStr);

      const blockDiv = document.createElement('div');
      blockDiv.className = `block-1h ${isCurrentHour ? 'current-hour' : ''}`;
      
      blockDiv.innerHTML = `
        <div>
          <span class="block-time">
            ${hourLabel} ${isCurrentHour ? '<span class="arrow-indicator">(Agora)</span>' : ''}
          </span>
        </div>
        
        <div class="block-infos">
          <span>${getCloudText(cloudVal)} ${thunder ? `<span class="block-thunder">⚡</span>` : ''}</span>
          <span class="temp">${temp}°C</span>
          <span class="rain">${rainInfo.label} - ${precipVal.toFixed(1)} mm</span>
          <span class="wind ${windInfo.class}">Rajadas de ${Math.round(windVal)} km/h</span>
        </div>
      `;

      if (isCurrentHour) {
        currentBlockElement = blockDiv;
      }

      blocksGrid.appendChild(blockDiv);
    });

    cardDiv.innerHTML = `
      <div class="card-summary">
        <h3 class="day-date">${formattedDate}</h3>
        <div class="info-day">
            <p>Temperatura</p> <p>${minTemp}° a ${maxTemp}°</p>
        </div>

        <div class="info-day">
            <p>Chuva acumulada</p> <p>${totalRain} mm</p>
        </div>

        <div class="info-day">
            <p>Rajadas de vento max</p> <p>${maxWind} km/h</p>
        </div>
        
        <button class="toggle-btn" aria-label="Expandir detalhes">${isToday ? 'Esconder infos' : 'Mais infos'}</button>
      </div>

      <div class="card-details" ${isToday ? '' : 'hidden'}></div>
    `;

    const detailsDiv = cardDiv.querySelector('.card-details');
    detailsDiv.appendChild(blocksGrid);

    const toggleBtn = cardDiv.querySelector('.toggle-btn');

    toggleBtn.addEventListener('click', () => {
      const isHidden = detailsDiv.hidden;
      detailsDiv.hidden = !isHidden;
      toggleBtn.textContent = isHidden ? 'Esconder infos' : 'Mais infos';
    });

    container.appendChild(cardDiv);
  });

  // Executa o scrollTo centralizando o elemento da hora atual
  if (currentBlockElement) {
    setTimeout(() => {
      currentBlockElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }, 100);
  }
}

// Renderiza o histórico salvo ao carregar a aplicação
renderHistory();