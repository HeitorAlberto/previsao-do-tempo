// Elementos do DOM
const searchForm = document.getElementById('search-form');
const cityInput = document.getElementById('city-input');
const historyContainer = document.getElementById('history-container');
const locationInfo = document.getElementById('location-info');
const forecastContainer = document.getElementById('forecast-container');
const dayNav = document.getElementById('day-nav');
const prevDayBtn = document.getElementById('prev-day-btn');
const nextDayBtn = document.getElementById('next-day-btn');

// Elemento do Autocomplete
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

// Carrega o histórico salvo no localStorage ao iniciar
renderHistory();

function centerCurrentHour(wrapperElement, dayTimes) {
  if (!forecastData || forecastData.utc_offset_seconds === undefined) return;

  const now = new Date(Date.now() + forecastData.utc_offset_seconds * 1000);
  const currentISO = now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"

  const currentIndex = dayTimes.findIndex(timeStr => timeStr.startsWith(currentISO));
  if (currentIndex === -1) return;

  const totalItems = dayTimes.length;
  const wrapperWidth = wrapperElement.clientWidth;
  const contentWidth = wrapperElement.scrollWidth;

  const itemWidth = contentWidth / totalItems;
  const itemCenterPos = (currentIndex * itemWidth) + (itemWidth / 2);
  const targetScrollLeft = itemCenterPos - (wrapperWidth / 2);

  wrapperElement.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });
}

// ==========================================
// SUPORTE A ARRASTE (DRAG NO DESKTOP)
// ==========================================

function enableDragToScroll(wrapper) {
  let isDown = false;
  let startX;
  let scrollLeft;

  // Eventos de Mouse EXCLUSIVAMENTE para Desktop
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
// ALGORITMO INTELIGENTE DE DIAGNÓSTICO
// ==========================================

function getCloudDiagnosis(dayTimes, roundedValues) {
  const daytimeValues = [];
  
  dayTimes.forEach((timeStr, index) => {
    const hour = new Date(timeStr).getHours();
    if (hour >= 6 && hour <= 18) {
      daytimeValues.push(roundedValues[index]);
    }
  });

  const targetValues = daytimeValues.length > 0 ? daytimeValues : roundedValues;

  const min = Math.min(...targetValues);
  const max = Math.max(...targetValues);
  const total = targetValues.reduce((a, b) => a + b, 0);
  const avg = Math.round(total / targetValues.length);

  if (avg <= 30 && max <= 50) {
    return {
      text: "Pouca nebulosidade",
      icon: "icons/pouca-nebulosidade.png"
    };
  }

  if (avg >= 70 && min >= 40) {
    return {
      text: "Nublado",
      icon: "icons/nublado.png"
    };
  }

  return {
    text: "Parcialmente nublado",
    icon: "icons/parcialmente-nublado.png"
  };
}

// ==========================================
// TABELA CLIMÁTICA SCROLLÁVEL
// ==========================================

function createStackedChartModule(labels, dayClouds, dayTemp, dayPrecip, dayGusts, dayTimes, weatherCodes) {
  const roundedClouds = dayClouds.map(v => Math.round(v / 10) * 10);
  const cloudDiagnosis = getCloudDiagnosis(dayTimes, roundedClouds);
  const thunderstormCodes = [95, 96, 99];

  const minTemp = Math.round(Math.min(...dayTemp));
  const maxTemp = Math.round(Math.max(...dayTemp));
  const totalPrecip = dayPrecip.reduce((acc, curr) => acc + curr, 0).toFixed(1);
  const maxGust = Math.round(Math.max(...dayGusts));

  const now = forecastData && forecastData.utc_offset_seconds !== undefined
    ? new Date(Date.now() + forecastData.utc_offset_seconds * 1000)
    : new Date();
  const currentISO = now.toISOString().slice(0, 13);

  const box = document.createElement('div');
  box.className = 'metric-box';

  let cloudCells = '';
  let tempCells = '';
  let precipCells = '';
  let gustCells = '';
  let hourCells = '';

  dayTimes.forEach((timeStr, index) => {
    const hourLabel = labels[index];
    const isCurrent = timeStr.startsWith(currentISO);
    const highlightClass = isCurrent ? ' current-hour' : '';

    const hasThunderstorm = weatherCodes && thunderstormCodes.includes(weatherCodes[index]);
    const cloudValue = hasThunderstorm ? `${roundedClouds[index]}%⚡` : `${roundedClouds[index]}%`;

    const precipVal = dayPrecip[index];

    cloudCells += `<td class="row-cloud${highlightClass}">${cloudValue}</td>`;
    tempCells += `<td class="row-temp${highlightClass}">${Math.round(dayTemp[index])}°C</td>`;
    precipCells += `<td class="row-precip${highlightClass}">${precipVal} mm</td>`;
    gustCells += `<td class="row-gust${highlightClass}">${Math.round(dayGusts[index])} Km/h</td>`;
    hourCells += `<th class="row-hour${highlightClass}">${hourLabel}</th>`;
  });

  box.innerHTML = `
    <div class="metric-header">
      <div class="header-right">
        <span class="summary-badge">
          ${cloudDiagnosis.text}
          <img src="${cloudDiagnosis.icon}" alt="${cloudDiagnosis.text}" class="badge-icon">
        </span>
        <span class="summary-badge">Temp: ${minTemp}° a ${maxTemp}°C</span>
        <span class="summary-badge">Acumulado de chuva: ${totalPrecip} mm</span>
        <span class="summary-badge">Rajada Máx: ${maxGust} km/h</span>
      </div>
    </div>
    <div class="metric-content">
      <div class="scroll-wrapper">
        <table class="weather-table">
          <tbody>
            <tr class="tr-cloud">
              ${cloudCells}
            </tr>
            <tr class="tr-temp">
              ${tempCells}
            </tr>
            <tr class="tr-precip">
              ${precipCells}
            </tr>
            <tr class="tr-gust">
              ${gustCells}
            </tr>
            <tr class="tr-hour">
              ${hourCells}
            </tr>
          </tbody>
        </table>
      </div>
      <div class="rain-legend">
        <p><span class="dot dot-cloud"></span> Nebulosidade: Poucas nuvens (≤35%) - Parcialmente nublado (≤75%) - Nublado (>75%)</p>
        <p><span class="dot dot-precip"></span> Precipitação: Leve (≤2.5 mm/h) - Moderada (≤10 mm/h) - Forte (>10 mm/h)</p>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const scrollWrapper = box.querySelector('.scroll-wrapper');
    if (scrollWrapper) {
      enableDragToScroll(scrollWrapper);
      centerCurrentHour(scrollWrapper, dayTimes);
    }
  });

  return box;
}

// ==========================================
// RENDERIZAÇÃO E NAVEGAÇÃO
// ==========================================

function formatDate(dateString, dayIndex) {
  const date = new Date(dateString);
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);

  return `(${dayIndex + 1}) ${diaSemana}, ${dd}/${mm}/${yy}`;
}

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
  const dayWeatherCodes = forecastData.weathercode ? forecastData.weathercode.slice(startIndex, endIndex) : [];

  const formattedDate = formatDate(dayTimes[0], currentDayIndex);
  document.getElementById('current-day-label').textContent = formattedDate;

  const dayCard = document.createElement('div');
  dayCard.className = 'day-card';

  const hourLabels = dayTimes.map(t => new Date(t).getHours() + 'h');

  dayCard.appendChild(
    createStackedChartModule(
      hourLabels,
      dayClouds,
      dayTemp,
      dayPrecip,
      dayGusts,
      dayTimes,
      dayWeatherCodes
    )
  );

  forecastContainer.appendChild(dayCard);
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
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,temperature_2m,precipitation,wind_gusts_10m,weathercode&forecast_days=10&timezone=auto&models=ecmwf_ifs`;
    const response = await fetch(weatherUrl);
    const data = await response.json();

    forecastData = data.hourly;
    forecastData.utc_offset_seconds = data.utc_offset_seconds;
    currentDayIndex = 0;
    dayNav.style.display = 'flex';
    
    renderSelectedDay();
  } catch (error) {
    console.error('Erro ao buscar previsão:', error);
  }
}