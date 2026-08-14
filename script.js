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

// Flag para evitar loops infinitos de scroll
let isSyncingScroll = false;

// Carrega o histórico salvo no localStorage ao iniciar
renderHistory();

// ==========================================
// 1. HELPER PARA SCROLL SINCRONIZADO E ARRASTE COM A MÃOZINHA
// ==========================================

function setupSynchronizedScroll() {
  const wrappers = document.querySelectorAll('.scroll-wrapper');

  wrappers.forEach(wrapper => {
    // Aplica o cursor de mãozinha via estilo inline
    wrapper.style.cursor = 'grab';
    wrapper.style.userSelect = 'none';

    // Sincronização de Scroll
    wrapper.removeEventListener('scroll', handleScroll);
    wrapper.addEventListener('scroll', handleScroll);

    // Lógica de Arraste com a Mãozinha (Drag to Scroll)
    let isDown = false;
    let startX;
    let scrollLeft;

    wrapper.addEventListener('mousedown', (e) => {
      isDown = true;
      wrapper.style.cursor = 'grabbing';
      startX = e.pageX - wrapper.offsetLeft;
      scrollLeft = wrapper.scrollLeft;
    });

    wrapper.addEventListener('mouseleave', () => {
      isDown = false;
      wrapper.style.cursor = 'grab';
    });

    wrapper.addEventListener('mouseup', () => {
      isDown = false;
      wrapper.style.cursor = 'grab';
    });

    wrapper.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - wrapper.offsetLeft;
      const walk = (x - startX) * 1.5; // Multiplicador de velocidade do arraste
      wrapper.scrollLeft = scrollLeft - walk;
    });
  });
}

function handleScroll(e) {
  if (isSyncingScroll) return;

  isSyncingScroll = true;
  const target = e.target;
  const scrollLeft = target.scrollLeft;

  const wrappers = document.querySelectorAll('.scroll-wrapper');
  wrappers.forEach(w => {
    if (w !== target) {
      w.scrollLeft = scrollLeft;
    }
  });

  requestAnimationFrame(() => {
    isSyncingScroll = false;
  });
}

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

  const wrappers = document.querySelectorAll('.scroll-wrapper');
  wrappers.forEach(w => {
    w.scrollTo({
      left: targetScrollLeft,
      behavior: 'smooth'
    });
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
      tooltip: { enabled: false }, // Tooltips removidos de todos os gráficos
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
// 2. MÓDULOS DOS GRÁFICOS
// ==========================================

// Div 1: Nebulosidade
function createCloudCoverModule(labels, cloudValues, dayTimes, weatherCodes) {
  const roundedValues = cloudValues.map(v => Math.round(v / 10) * 10);
  const cloudDiagnosis = getCloudDiagnosis(dayTimes, roundedValues);

  // Códigos Open-Meteo para Trovoada: 95 (Trovoada), 96 e 99 (Trovoada com granizo)
  const thunderstormCodes = [95, 96, 99];

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header">
      <h4>Nebulosidade (%)</h4>
      <div class="header-right">
        <span class="summary-badge">
          ${cloudDiagnosis.text}
          <img src="${cloudDiagnosis.icon}" alt="${cloudDiagnosis.text}" class="badge-icon">
        </span>
      </div>
    </div>
    <div class="metric-content">
      <div class="scroll-wrapper">
        <div class="chart-container"><canvas id="cloud-chart"></canvas></div>
      </div>
      <div class="rain-legend">
        <p>Poucas nuvens até 35%</p>
        <p>Parcialmente nublado até 75%</p>
        <p>Nublado acima de 75%</p>
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
            formatter: (val, context) => {
              const index = context.dataIndex;
              const hasThunderstorm = weatherCodes && thunderstormCodes.includes(weatherCodes[index]);
              return hasThunderstorm ? `${val}⚡` : `${val}`;
            }
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
    <div class="metric-header">
      <h4>Temperatura (°C)</h4>
      <div class="header-right">
        <span class="summary-badge">${minTemp}° a ${maxTemp}°</span>
      </div>
    </div>
    <div class="metric-content">
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
  });

  return box;
}

// Div 3: Precipitação
function createPrecipitationModule(labels, precipValues, dayTimes) {
  const total24h = precipValues.reduce((acc, curr) => acc + curr, 0).toFixed(1);

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header">
      <h4>Precipitação (mm)</h4>
      <div class="header-right">
        <span class="summary-badge">${total24h} mm</span>
      </div>
    </div>
    <div class="metric-content">
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
          datalabels: {
            ...options.plugins.datalabels,
            formatter: (val) => val > 0 ? val : ''
          }
        }
      }
    });
  });

  return box;
}

// Div 4: Rajadas de Vento
function createGustsModule(labels, gustValues, dayTimes) {
  const maxGust = Math.round(Math.max(...gustValues));

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header">
      <h4>Rajadas de Vento (km/h)</h4>
      <div class="header-right">
        <span class="summary-badge">Máx: ${maxGust} km/h</span>
      </div>
    </div>
    <div class="metric-content">
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
  const dayWeatherCodes = forecastData.weathercode ? forecastData.weathercode.slice(startIndex, endIndex) : [];

  const formattedDate = formatDate(dayTimes[0]);
  document.getElementById('current-day-label').textContent = formattedDate;

  const dayCard = document.createElement('div');
  dayCard.className = 'day-card';

  const hourLabels = dayTimes.map(t => new Date(t).getHours() + 'h');

  dayCard.appendChild(createCloudCoverModule(hourLabels, dayClouds, dayTimes, dayWeatherCodes));
  dayCard.appendChild(createTemperatureModule(hourLabels, dayTemp, dayTimes));
  dayCard.appendChild(createPrecipitationModule(hourLabels, dayPrecip, dayTimes));
  dayCard.appendChild(createGustsModule(hourLabels, dayGusts, dayTimes));

  forecastContainer.appendChild(dayCard);

  requestAnimationFrame(() => {
    setupSynchronizedScroll();
  });
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
    // Adicionado weathercode na lista de parâmetros hourly
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