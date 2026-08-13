// Registrar o plugin de datalabels no Chart.js
if (typeof ChartDataLabels !== 'undefined') {
  Chart.register(ChartDataLabels);
}

// Configurar a fonte global para todos os gráficos do Chart.js
Chart.defaults.font.family = "'Open Sans', 'Segoe UI', Tahoma, sans-serif";

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

// ==========================================
// 1. HELPER PARA IDENTIFICAR E CENTRALIZAR A HORA ATUAL
// ==========================================

function getHourStyles(dayTimes) {
  const now = forecastData && forecastData.utc_offset_seconds !== undefined
    ? new Date(Date.now() + forecastData.utc_offset_seconds * 1000)
    : new Date();

  const currentISO = now.toISOString().slice(0, 13); // "YYYY-MM-DDTHH"

  const fontColors = [];
  const fontWeights = [];

  dayTimes.forEach(timeStr => {
    const isCurrent = timeStr.startsWith(currentISO);
    fontColors.push(isCurrent ? '#e63946' : '#555555');
    fontWeights.push(isCurrent ? 'bold' : 'normal');
  });

  return { fontColors, fontWeights };
}

// Função para centralizar a hora atual no container de scroll
function centerCurrentHour(canvasElement, dayTimes) {
  if (!forecastData || forecastData.utc_offset_seconds === undefined) return;

  const now = new Date(Date.now() + forecastData.utc_offset_seconds * 1000);
  const currentISO = now.toISOString().slice(0, 13);

  const currentIndex = dayTimes.findIndex(timeStr => timeStr.startsWith(currentISO));
  if (currentIndex === -1) return;

  const scrollWrapper = canvasElement.closest('.scroll-wrapper');
  if (!scrollWrapper) return;

  const totalItems = dayTimes.length;
  const wrapperWidth = scrollWrapper.clientWidth;
  const canvasWidth = canvasElement.clientWidth || scrollWrapper.scrollWidth;

  const itemWidth = canvasWidth / totalItems;
  const itemCenterPos = (currentIndex * itemWidth) + (itemWidth / 2);
  const targetScrollLeft = itemCenterPos - (wrapperWidth / 2);

  scrollWrapper.scrollTo({
    left: targetScrollLeft,
    behavior: 'smooth'
  });
}

function getCommonOptions(dayTimes) {
  const { fontColors, fontWeights } = getHourStyles(dayTimes);

  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: { top: 28, bottom: 10 }
    },
    plugins: {
      legend: { display: false },
      datalabels: {
        anchor: 'end',
        align: 'top',
        font: { weight: 'bold', size: 13 },
        color: '#222'
      }
    },
    scales: {
      y: { display: false },
      x: { 
        grid: { display: false },
        ticks: {
          font: (context) => ({
            size: 14,
            weight: fontWeights[context.index] || 'normal'
          }),
          color: (context) => fontColors[context.index] || '#555555'
        }
      }
    }
  };
}

// Controle do Acordeão (Abrir/Fechar com auto-scroll para hora atual)
function toggleModuleContent(headerElement) {
  const content = headerElement.nextElementSibling;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'block' : 'none';
  headerElement.classList.toggle('expanded', isHidden);

  if (isHidden) {
    requestAnimationFrame(() => {
      const canvas = content.querySelector('canvas');
      if (canvas && forecastData) {
        const startIndex = currentDayIndex * 24;
        const dayTimes = forecastData.time.slice(startIndex, startIndex + 24);
        centerCurrentHour(canvas, dayTimes);
      }
    });
  }
}

// ==========================================
// ALGORITMO INTELIGENTE DE DIAGNÓSTICO (SIMPLIFICADO)
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

  // 1. Regra de consistência para "Pouca nebulosidade"
  // Só é pouca nebulosidade se a média for baixa E o pico máximo não for muito alto
  if (avg <= 30 && max <= 50) {
    return "Pouca nebulosidade";
  }

  // 2. Regra de consistência para "Nublado"
  // Só é totalmente nublado se a média for alta E o dia não tiver tido grandes aberturas de sol
  if (avg >= 70 && min >= 40) {
    return "Nublado";
  }

  // 3. Todo o resto (dias instáveis, transições ou com variação grande) cai aqui
  return "Parcialmente nublado";
}



// ==========================================
// 2. MÓDULOS DOS GRÁFICOS
// ==========================================

// Div 1: Nebulosidade
function createCloudCoverModule(labels, cloudValues, dayTimes) {
  const roundedValues = cloudValues.map(v => Math.round(v / 10) * 10);
  const cloudDiagnosis = getCloudDiagnosis(dayTimes, roundedValues);

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header" onclick="toggleModuleContent(this)">
      <h4>Nebulosidade (%)</h4>
      <div class="header-right">
        <span class="summary-badge">${cloudDiagnosis}</span>
        <span class="toggle-icon">▼</span>
      </div>
    </div>
    <div class="metric-content" style="display: none;">
      <div class="scroll-wrapper">
        <div class="chart-container"><canvas id="cloud-chart"></canvas></div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const canvas = document.getElementById('cloud-chart');
    if (!canvas) return;
    const options = getCommonOptions(dayTimes);
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: roundedValues,
          borderColor: '#888888',
          backgroundColor: 'rgba(136, 136, 136, 0.15)',
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          datalabels: {
            ...options.plugins.datalabels,
            formatter: (val) => val
          }
        },
        scales: {
          ...options.scales,
          y: { display: false, min: 0, max: 110 }
        }
      }
    });

    centerCurrentHour(canvas, dayTimes);
  });

  return box;
}

// Div 2: Temperatura
function createTemperatureModule(labels, tempValues, dayTimes) {
  const minTemp = Math.round(Math.min(...tempValues));
  const maxTemp = Math.round(Math.max(...tempValues));

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header" onclick="toggleModuleContent(this)">
      <h4>Temperatura (°C)</h4>
      <div class="header-right">
        <span class="summary-badge">${minTemp}° a ${maxTemp}°</span>
        <span class="toggle-icon">▼</span>
      </div>
    </div>
    <div class="metric-content" style="display: none;">
      <div class="scroll-wrapper">
        <div class="chart-container"><canvas id="temp-chart"></canvas></div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const canvas = document.getElementById('temp-chart');
    if (!canvas) return;
    const options = getCommonOptions(dayTimes);
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: tempValues,
          borderColor: '#ff7f0e',
          backgroundColor: 'rgba(255, 127, 14, 0.15)',
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          datalabels: {
            ...options.plugins.datalabels,
            formatter: (val) => `${Math.round(val)}°`
          }
        }
      }
    });

    centerCurrentHour(canvas, dayTimes);
  });

  return box;
}

// Div 3: Precipitação
function createPrecipitationModule(labels, precipValues, dayTimes) {
  const total24h = precipValues.reduce((acc, curr) => acc + curr, 0).toFixed(1);

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header" onclick="toggleModuleContent(this)">
      <h4>Precipitação (mm)</h4>
      <div class="header-right">
        <span class="summary-badge">${total24h} mm</span>
        <span class="toggle-icon">▼</span>
      </div>
    </div>
    <div class="metric-content" style="display: none;">
      <div class="scroll-wrapper">
        <div class="chart-container"><canvas id="precip-chart"></canvas></div>
      </div>
      <div class="legend">
        <div class="legend-items">
          <span><b style="color:#a0c4ff">■</b> Fraca</span>
          <span><b style="color:#0052a3">■</b> Moderada</span>
          <span><b style="color:#ad51f9">■</b> Forte</span>
        </div>
      </div>
    </div>
  `;

  const barColors = precipValues.map(v => {
    if (v <= 2.5) return '#a0c4ff';
    if (v < 10) return '#0052a3';
    return '#ad51f9';
  });

  requestAnimationFrame(() => {
    const canvas = document.getElementById('precip-chart');
    if (!canvas) return;
    const options = getCommonOptions(dayTimes);
    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ data: precipValues, backgroundColor: barColors }]
      },
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          tooltip: {
            callbacks: { label: (context) => `${context.raw} mm` }
          },
          datalabels: {
            ...options.plugins.datalabels,
            formatter: (val) => val > 0 ? val : ''
          }
        }
      }
    });

    centerCurrentHour(canvas, dayTimes);
  });

  return box;
}

// Div 4: Rajadas de Vento
function createGustsModule(labels, gustValues, dayTimes) {
  const maxGust = Math.round(Math.max(...gustValues));

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header" onclick="toggleModuleContent(this)">
      <h4>Rajadas de Vento (km/h)</h4>
      <div class="header-right">
        <span class="summary-badge">Máx: ${maxGust} km/h</span>
        <span class="toggle-icon">▼</span>
      </div>
    </div>
    <div class="metric-content" style="display: none;">
      <div class="scroll-wrapper">
        <div class="chart-container"><canvas id="gust-chart"></canvas></div>
      </div>
    </div>
  `;

  requestAnimationFrame(() => {
    const canvas = document.getElementById('gust-chart');
    if (!canvas) return;
    const options = getCommonOptions(dayTimes);
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Rajadas',
          data: gustValues,
          borderColor: '#1e8449',
          backgroundColor: 'rgba(30, 132, 73, 0.15)',
          borderWidth: 3,
          pointRadius: 4,
          tension: 0.2,
          fill: true
        }]
      },
      options: {
        ...options,
        plugins: {
          ...options.plugins,
          datalabels: {
            ...options.plugins.datalabels,
            formatter: (val) => `${Math.round(val)}`
          }
        }
      }
    });

    centerCurrentHour(canvas, dayTimes);
  });

  return box;
}

// ==========================================
// 3. RENDERIZAÇÃO DA PÁGINA
// ==========================================

function formatDate(dateString) {
  const date = new Date(dateString);
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);

  return `${diaSemana}, ${dd}/${mm}/${yy}`;
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

  const formattedDate = formatDate(dayTimes[0]);
  document.getElementById('current-day-label').textContent = formattedDate;

  const dayCard = document.createElement('div');
  dayCard.className = 'day-card';

  const hourLabels = dayTimes.map(t => new Date(t).getHours() + 'h');

  dayCard.appendChild(createCloudCoverModule(hourLabels, dayClouds, dayTimes));
  dayCard.appendChild(createTemperatureModule(hourLabels, dayTemp, dayTimes));
  dayCard.appendChild(createPrecipitationModule(hourLabels, dayPrecip, dayTimes));
  dayCard.appendChild(createGustsModule(hourLabels, dayGusts, dayTimes));

  forecastContainer.appendChild(dayCard);
}

function changeDay(delta) {
  currentDayIndex += delta;
  if (currentDayIndex < 0) currentDayIndex = 0;
  if (currentDayIndex > 9) currentDayIndex = 9;
  renderSelectedDay();
}

// ==========================================
// 4. API & NAVEGAÇÃO DE BUSCA
// ==========================================

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

function updateHistory(cityName) {
  searchHistory = searchHistory.filter(item => item.toLowerCase() !== cityName.toLowerCase());
  searchHistory.unshift(cityName);
  if (searchHistory.length > 3) {
    searchHistory.pop();
  }
  localStorage.setItem('weather_search_history', JSON.stringify(searchHistory));
  renderHistory();
}

function renderHistory() {
  historyContainer.innerHTML = '';
  searchHistory.forEach(city => {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = city;
    item.onclick = () => fetchCityCoordinates(city);
    historyContainer.appendChild(item);
  });
}

function selectLocation(location) {
  const name = location.name;
  const state = location.admin1 || '';
  const country = location.country || '';

  locationInfo.textContent = `${name}${state ? ', ' + state : ''} - ${country}`;
  updateHistory(name);
  fetchForecast(location.latitude, location.longitude);
}

async function fetchCityCoordinates(cityName) {
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=pt&format=json`;
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
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=cloud_cover,temperature_2m,precipitation,wind_gusts_10m&forecast_days=10&timezone=auto&models=ecmwf_ifs`;
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