// Elementos do DOM
const searchForm = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const historyContainer = document.getElementById('history-container');
const locationInfo = document.getElementById('location-info');
const forecastContainer = document.getElementById('forecast-container');
const dayNav = document.getElementById('day-nav');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');

let autocompleteList = document.getElementById('autocomplete-list');
if (!autocompleteList && cityInput) {
  autocompleteList = document.createElement('div');
  autocompleteList.id = 'autocomplete-list';
  autocompleteList.className = 'autocomplete-items';
  cityInput.parentNode.appendChild(autocompleteList);
}

let searchHistory = JSON.parse(localStorage.getItem('weather_search_history') || '[]');
let forecastData = null;
let currentDayIndex = 0;
let debounceTimer = null;

renderHistory();

// ==========================================
// SUPORTE A ARRASTE (DRAG)
// ==========================================

function enableDragToScroll(wrapper) {
  let isDown = false;
  let startX;
  let scrollLeft;

  wrapper.addEventListener('mousedown', (e) => {
    isDown = true;
    wrapper.classList.add('active');
    startX = e.pageX - wrapper.offsetLeft;
    scrollLeft = wrapper.scrollLeft;
  });

  wrapper.addEventListener('mouseleave', () => {
    isDown = false;
    wrapper.classList.remove('active');
  });

  wrapper.addEventListener('mouseup', () => {
    isDown = false;
    wrapper.classList.remove('active');
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const walk = (x - startX) * 1.5;
    wrapper.scrollLeft = scrollLeft - walk;
  });
}

// ==========================================
// CENTRALIZAÇÃO DO BLOCO DA HORA ATUAL
// ==========================================

function centerCurrentHourBlock(scrollWrapper, activeBlock) {
  if (!scrollWrapper || !activeBlock) return;

  const wrapperWidth = scrollWrapper.clientWidth;
  const blockLeft = activeBlock.offsetLeft;
  const blockWidth = activeBlock.clientWidth;

  const targetScroll = blockLeft - (wrapperWidth / 2) + (blockWidth / 2);

  scrollWrapper.scrollTo({
    left: targetScroll,
    behavior: 'smooth'
  });
}

// ==========================================
// CÁLCULO DE ÍCONES E RESUMO DO DIA
// ==========================================

function getDaySummary(dayClouds, dayTemp, dayPrecip, dayGusts) {
  const maxCloud = Math.max(...dayClouds);
  const totalCloud = dayClouds.reduce((a, b) => a + b, 0);
  const avgCloud = Math.round(totalCloud / dayClouds.length);

  const minTemp = Math.round(Math.min(...dayTemp));
  const maxTemp = Math.round(Math.max(...dayTemp));
  const totalPrecip = dayPrecip.reduce((a, b) => a + b, 0).toFixed(1);
  const maxGust = Math.round(Math.max(...dayGusts));

  let diagnosisText = "Parcialmente nublado";
  let iconLevel = 2;

  // Combinação segura de Médias e Picos
  if (avgCloud <= 20 && maxCloud <= 40) {
    diagnosisText = "Pouca nebulosidade";
    iconLevel = 1;
  } else if (avgCloud <= 50 && maxCloud <= 70) {
    diagnosisText = "Parcialmente nublado";
    iconLevel = 2;
  } else if (avgCloud <= 75 || maxCloud >= 85) {
    diagnosisText = "Muitas nuvens, aberturas pontuais";
    iconLevel = 3;
  } else {
    diagnosisText = "Nublado";
    iconLevel = 4;
  }

  return {
    text: diagnosisText,
    icon: `icons/${iconLevel}d.png`,
    minTemp,
    maxTemp,
    totalPrecip,
    maxGust
  };
}

function get3hBlockIcon(avgCloud, maxCloudDay, hasThunderstorm, isDaytime) {
  const period = isDaytime ? 'd' : 'n';

  // REGRA EXCLUSIVA PARA TROVOADAS (Apenas níveis 3 e 4)
  if (hasThunderstorm) {
    const stormLevel = avgCloud >= 75 ? 4 : 3;
    return `${stormLevel}${period}_t`;
  }

  // Lógica padrão para dias sem trovoada
  let level = 1;
  if (maxCloudDay <= 50) {
    level = avgCloud <= 25 ? 1 : 2;
  } else {
    if (avgCloud <= 25) level = 1;
    else if (avgCloud <= 50) level = 2;
    else if (avgCloud <= 75) level = 3;
    else level = 4;
  }

  return `${level}${period}`;
}

// ==========================================
// RENDERIZAÇÃO DO CARD DIA
// ==========================================

function renderSelectedDay() {
  forecastContainer.innerHTML = '';

  prevDayBtn.disabled = currentDayIndex === 0;
  nextDayBtn.disabled = currentDayIndex === 9;

  const startIndex = currentDayIndex * 24;
  const endIndex = startIndex + 24;

  const dayTimes = forecastData.time.slice(startIndex, endIndex);
  const dayClouds = forecastData.cloud_cover.slice(startIndex, endIndex);
  const dayTemp = forecastData.temperature_2m.slice(startIndex, endIndex);
  const dayPrecip = forecastData.precipitation.slice(startIndex, endIndex);
  const dayGusts = forecastData.wind_gusts_10m.slice(startIndex, endIndex);
  const dayCodes = forecastData.weathercode ? forecastData.weathercode.slice(startIndex, endIndex) : [];

  const maxCloudDay = Math.max(...dayClouds);
  const summary = getDaySummary(dayClouds, dayTemp, dayPrecip, dayGusts);

  const formattedDate = formatDate(dayTimes[0], currentDayIndex);
  document.getElementById('current-day-label').textContent = formattedDate;

  // Verificação da Hora Atual para destaque
  const now = forecastData.utc_offset_seconds !== undefined
    ? new Date(Date.now() + forecastData.utc_offset_seconds * 1000)
    : new Date();
  const currentISO = now.toISOString().slice(0, 13);
  const currentHour = now.getUTCHours();

  const dayCard = document.createElement('div');
  dayCard.className = 'day-card';

  // 1. Bloco RESUMO-DIA
  const summaryHTML = `
    <div class="resumo-dia">
      <div class="resumo-main">
        <img src="${summary.icon}" alt="Ícone Clima" class="resumo-icon">
        <div class="resumo-textos">
          <h3>${summary.text}</h3>
          <span class="resumo-temp-range">${summary.minTemp}° a ${summary.maxTemp}°</span>
        </div>
      </div>
      <div class="resumo-badges">
        <span class="badge">💧 <strong>${summary.totalPrecip} mm</strong></span>
        <span class="badge">🍃 <strong>${summary.maxGust} km/h</strong></span>
      </div>
    </div>
  `;

  // 2. Bloco DADOS-HORA (A cada 3 horas = 8 blocos de 3h)
  let blocksHTML = '';

  for (let b = 0; b < 8; b++) {
    const hStart = b * 3;
    const hEnd = hStart + 3;

    const blockTimes = dayTimes.slice(hStart, hEnd);
    const blockClouds = dayClouds.slice(hStart, hEnd);
    const blockTemps = dayTemp.slice(hStart, hEnd);
    const blockPrecip = dayPrecip.slice(hStart, hEnd);
    const blockGusts = dayGusts.slice(hStart, hEnd);
    const blockCodes = dayCodes.slice(hStart, hEnd);

    // Identifica se este bloco de 3h contém a hora atual
    const isCurrentDay = blockTimes[0].startsWith(currentISO.slice(0, 10));
    const isCurrentBlock = isCurrentDay && (currentHour >= hStart && currentHour < hEnd);
    const currentBlockClass = isCurrentBlock ? ' current-hour-block' : '';

    // Cálculos do bloco de 3h
    const avgCloud = Math.round(blockClouds.reduce((a, b) => a + b, 0) / 3);
    const totalPrecip3h = blockPrecip.reduce((a, b) => a + b, 0).toFixed(1);
    const maxGust3h = Math.round(Math.max(...blockGusts));
    const hasThunderstorm = blockCodes.some(code => [95, 96, 99].includes(code));

    // Mantém estritamente a ordem cronológica das 3 horas
    const chronologicalTemps = blockTemps.map(t => Math.round(t));

    // Período do dia
    const startHour = parseInt(blockTimes[0].slice(11, 13), 10);
    const isDaytime = startHour >= 6 && startHour < 18;
    const iconCode = get3hBlockIcon(avgCloud, maxCloudDay, hasThunderstorm, isDaytime);

    const labelIntervalo = `${String(hStart).padStart(2, '0')}h - ${String(hEnd).padStart(2, '0')}h`;

    blocksHTML += `
      <div class="bloco-3h${currentBlockClass}">
        <div class="bloco-hora-header">${labelIntervalo}</div>
        <img src="icons/${iconCode}.png" class="bloco-icon" alt="Clima">
        
        <div class="bloco-metrica temps-ordem">
          <span class="metrica-label">Temp (ordem):</span>
          <span class="metrica-valor">${chronologicalTemps.join('° - ')}°C</span>
        </div>

        <div class="bloco-metrica">
          <span class="metrica-label">Chuva acumulada:</span>
          <span class="metrica-valor ${totalPrecip3h > 0 ? 'com-chuva' : ''}">${totalPrecip3h} mm</span>
        </div>

        <div class="bloco-metrica">
          <span class="metrica-label">Rajadas Vento</span>
          <span class="metrica-valor">${maxGust3h} km/h</span>
        </div>
      </div>
    `;
  }

  dayCard.innerHTML = `
    ${summaryHTML}
    <div class="dados-hora-wrapper scroll-wrapper">
      <div class="dados-hora-container">
        ${blocksHTML}
      </div>
    </div>
  `;

  forecastContainer.appendChild(dayCard);

  requestAnimationFrame(() => {
    const scrollWrapper = dayCard.querySelector('.scroll-wrapper');
    const activeBlock = dayCard.querySelector('.current-hour-block');

    if (scrollWrapper) {
      enableDragToScroll(scrollWrapper);
      if (activeBlock) {
        centerCurrentHourBlock(scrollWrapper, activeBlock);
      }
    }
  });
}

function formatDate(dateString, dayIndex) {
  const date = new Date(dateString);
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);

  return `(${dayIndex + 1}) ${diaSemana}, ${dd}/${mm}/${yy}`;
}

function changeDay(delta) {
  currentDayIndex += delta;
  if (currentDayIndex < 0) currentDayIndex = 0;
  if (currentDayIndex > 9) currentDayIndex = 9;
  renderSelectedDay();
}

cityInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();
  clearTimeout(debounceTimer);
  
  if (query.length < 2) {
    autocompleteList.innerHTML = '';
    return;
  }

  debounceTimer = setTimeout(() => {
    fetchCitySuggestions(query);
  }, 300);
});

document.addEventListener('click', (e) => {
  if (e.target !== cityInput) {
    autocompleteList.innerHTML = '';
  }
});

async function fetchCitySuggestions(query) {
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`;
    const response = await fetch(geoUrl);
    const data = await response.json();

    autocompleteList.innerHTML = '';
    if (!data.results || data.results.length === 0) return;

    data.results.forEach(loc => {
      const item = document.createElement('div');
      item.className = 'autocomplete-item';
      
      const name = loc.name;
      const state = loc.admin1 || '';
      const country = loc.country || '';
      const displayText = `${name}${state ? ', ' + state : ''} - ${country}`;

      item.textContent = displayText;
      item.addEventListener('click', () => {
        cityInput.value = '';
        autocompleteList.innerHTML = '';
        selectLocation(loc);
      });

      autocompleteList.appendChild(item);
    });
  } catch (error) {
    console.error('Erro ao buscar sugestões:', error);
  }
}

searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const city = cityInput.value.trim();
  if (city) {
    fetchCityCoordinates(city);
    cityInput.value = '';
    autocompleteList.innerHTML = '';
  }
});

function updateHistory(fullLocationName) {
  searchHistory = searchHistory.filter(item => item.toLowerCase() !== fullLocationName.toLowerCase());
  searchHistory.unshift(fullLocationName);
  if (searchHistory.length > 3) {
    searchHistory.pop();
  }
  localStorage.setItem('weather_search_history', JSON.stringify(searchHistory));
  renderHistory();
}

function renderHistory() {
  historyContainer.innerHTML = '';
  searchHistory.forEach(fullLocationName => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = fullLocationName;
    item.onclick = () => fetchCityCoordinates(fullLocationName);
    historyContainer.appendChild(item);
  });
}

function selectLocation(location) {
  const name = location.name;
  const state = location.admin1 || '';
  const country = location.country || '';

  const fullLocationName = `${name}${state ? ', ' + state : ''} - ${country}`;

  locationInfo.textContent = fullLocationName;
  updateHistory(fullLocationName);
  fetchForecast(location.latitude, location.longitude);
}

async function fetchCityCoordinates(cityName) {
  try {
    const cleanCityName = cityName.split(',')[0].split('-')[0].trim();

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanCityName)}&count=1&language=pt&format=json`;
    const response = await fetch(geoUrl);
    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      alert('Cidade não encontrada!');
      return;
    }

    selectLocation(data.results[0]);
  } catch (error) {
    console.error('Erro ao buscar localização:', error);
  }
}

async function fetchForecast(lat, lon) {
  try {
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,temperature_2m,precipitation,wind_gusts_10m,weathercode&daily=sunrise,sunset&forecast_days=10&timezone=auto&models=ecmwf_ifs`;
    const response = await fetch(weatherUrl);
    const data = await response.json();

    forecastData = data.hourly;
    forecastData.daily = data.daily;
    forecastData.utc_offset_seconds = data.utc_offset_seconds;
    currentDayIndex = 0;
    dayNav.style.display = 'flex';
    
    renderSelectedDay();
  } catch (error) {
    console.error('Erro ao buscar previsão:', error);
  }
}