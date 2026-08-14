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

function centerCurrentHour(wrapperElement, dayTimes) {
  if (!forecastData || forecastData.utc_offset_seconds === undefined) return;

  const now = new Date(Date.now() + forecastData.utc_offset_seconds * 1000);
  const currentISO = now.toISOString().slice(0, 13);

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
// SUPORTE A ARRASTE (DRAG NO DESKTOP E TOUCH NO MOBILE)
// ==========================================

function enableDragToScroll(wrapper) {
  let isDown = false;
  let startX;
  let scrollLeft;

  // Mouse Events (Desktop Drag)
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
    const walk = (x - startX) * 1.5; // Velocidade do arraste
    wrapper.scrollLeft = scrollLeft - walk;
  });

  // Touch Events (Mobile Drag Optimization)
  let touchStartX = 0;
  let touchScrollLeft = 0;

  wrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].pageX - wrapper.offsetLeft;
    touchScrollLeft = wrapper.scrollLeft;
  }, { passive: true });

  wrapper.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX - wrapper.offsetLeft;
    const walk = (x - touchStartX) * 1;
    wrapper.scrollLeft = touchScrollLeft - walk;
  }, { passive: true });
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
// MÚLTIPLOS CANVAS NO MESMO CONTAINER DE SCROLL
// ==========================================

function createStackedChartModule(labels, dayClouds, dayTemp, dayPrecip, dayGusts, dayTimes, weatherCodes) {
  const roundedClouds = dayClouds.map(v => Math.round(v / 10) * 10);
  const cloudDiagnosis = getCloudDiagnosis(dayTimes, roundedClouds);
  const thunderstormCodes = [95, 96, 99];

  const minTemp = Math.round(Math.min(...dayTemp));
  const maxTemp = Math.round(Math.max(...dayTemp));
  const totalPrecip = dayPrecip.reduce((acc, curr) => acc + curr, 0).toFixed(1);
  const maxGust = Math.round(Math.max(...dayGusts));

  const box = document.createElement('div');
  box.className = 'metric-box';
  box.innerHTML = `
    <div class="metric-header">
      <h4>Previsão do Dia</h4>
      <div class="header-right">
        <span class="summary-badge">
          ${cloudDiagnosis.text}
          <img src="${cloudDiagnosis.icon}" alt="${cloudDiagnosis.text}" class="badge-icon">
        </span>
        <span class="summary-badge">Temp: ${minTemp}° a ${maxTemp}°C</span>
        <span class="summary-badge">Chuva: ${totalPrecip} mm</span>
        <span class="summary-badge">Rajada Máx: ${maxGust} km/h</span>
      </div>
    </div>
    <div class="metric-content">
      <div class="scroll-wrapper">
        <div class="chart-container">
          <div class="canvas-item"><canvas id="chart-clouds"></canvas></div>
          <div class="canvas-item"><canvas id="chart-temp"></canvas></div>
          <div class="canvas-item"><canvas id="chart-precip"></canvas></div>
          <div class="canvas-item"><canvas id="chart-gusts"></canvas></div>
        </div>
      </div>
      <div class="rain-legend">
        <p>Poucas nuvens até 35% - Parcialmente nublado até 75% - Nublado acima de 75%</p>
        <p>chuva leve até 2.5 mm/h - chuva moderada até 10 mm/h - chuva forte acima de 10 mm/h</p>
      </div>

    </div>
  `;

  const barColors = dayPrecip.map(v => {
    if (v <= 2.5) return '#a0c4ff';
    if (v < 10) return '#0052a3';
    return '#ad51f9';
  });

  const tempMinVal = Math.floor(minTemp - 2);
  const tempMaxVal = Math.ceil(maxTemp + 3);
  const gustMaxVal = Math.ceil(maxGust * 1.2);

  requestAnimationFrame(() => {
    const { fontColors, fontWeights } = getHourStyles(dayTimes);

    // Opções base garantindo que o eixo X (horas) fique VISÍVEL em todos os gráficos
    const createBaseOptions = () => ({
      responsive: true,
      maintainAspectRatio: false,
      events: [], // Desativa eventos do Chart.js para não interferir no arraste da div pai
      layout: { padding: { top: 20, bottom: 5, left: 10, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false },
        datalabels: { font: { weight: 'bold', size: 11 } }
      },
      scales: {
        x: {
          display: true, // Exibe o eixo com as horas em TODOS
          grid: { display: false },
          ticks: {
            font: (context) => ({
              size: 13,
              weight: fontWeights[context.index] || 'normal'
            }),
            color: (context) => fontColors[context.index] || '#555555'
          }
        },
        y: { display: false }
      }
    });

    // 1. Gráfico de Nebulosidade
    const canvasClouds = document.getElementById('chart-clouds');
    if (canvasClouds) {
      const opts = createBaseOptions();
      opts.scales.y.min = 0;
      opts.scales.y.max = 120;
      new Chart(canvasClouds, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Nebulosidade (%)',
            data: roundedClouds,
            borderColor: '#888888',
            backgroundColor: 'rgba(136, 136, 136, 0.15)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.3,
            fill: true,
            datalabels: {
              anchor: 'end',
              align: 'top',
              color: '#444444',
              formatter: (val, ctx) => {
                const index = ctx.dataIndex;
                const hasThunderstorm = weatherCodes && thunderstormCodes.includes(weatherCodes[index]);
                return hasThunderstorm ? `${val}%⚡` : `${val}%`;
              }
            }
          }]
        },
        options: opts
      });
    }

    // 2. Gráfico de Temperatura
    const canvasTemp = document.getElementById('chart-temp');
    if (canvasTemp) {
      const opts = createBaseOptions();
      opts.scales.y.min = tempMinVal;
      opts.scales.y.max = tempMaxVal;
      new Chart(canvasTemp, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Temperatura (°C)',
            data: dayTemp,
            borderColor: '#ff7f0e',
            backgroundColor: 'rgba(255, 127, 14, 0.15)',
            borderWidth: 3,
            pointRadius: 4,
            tension: 0.3,
            fill: true,
            datalabels: {
              anchor: 'end',
              align: 'top',
              color: '#d95f02',
              formatter: (val) => `${Math.round(val)}°`
            }
          }]
        },
        options: opts
      });
    }

    // 3. Gráfico de Chuva / Precipitação
    const canvasPrecip = document.getElementById('chart-precip');
    if (canvasPrecip) {
      const opts = createBaseOptions();
      opts.scales.y.min = 0;
      new Chart(canvasPrecip, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Precipitação (mm)',
            data: dayPrecip,
            backgroundColor: barColors,
            datalabels: {
              anchor: 'end',
              align: 'top',
              color: '#0052a3',
              formatter: (val) => val > 0 ? `${val}` : ''
            }
          }]
        },
        options: opts
      });
    }

    // 4. Gráfico de Ventos / Rajadas
    const canvasGusts = document.getElementById('chart-gusts');
    if (canvasGusts) {
      const opts = createBaseOptions();
      opts.scales.y.min = 0;
      opts.scales.y.max = gustMaxVal;
      new Chart(canvasGusts, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Rajadas de Vento (km/h)',
            data: dayGusts,
            borderColor: '#1e8449',
            backgroundColor: 'rgba(30, 132, 73, 0.15)',
            borderWidth: 2,
            pointRadius: 3,
            tension: 0.2,
            fill: true,
            datalabels: {
              anchor: 'end',
              align: 'top',
              color: '#1e8449',
              formatter: (val) => `${Math.round(val)}`
            }
          }]
        },
        options: opts
      });
    }

    const scrollWrapper = box.querySelector('.scroll-wrapper');
    if (scrollWrapper) {
      enableDragToScroll(scrollWrapper);
      centerCurrentHour(scrollWrapper, dayTimes);
    }
  });

  return box;
}

// ==========================================
// RENDERIZAÇÃO E DEMAIS MÉTODOS
// ==========================================

function formatDate(dateString, dayIndex) {
  const date = new Date(dateString);
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diaSemana = diasSemana[date.getDay()];
  
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);

  // Exemplo de retorno: "(1) Segunda-feira, 25/04/26"
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

  // Passando o currentDayIndex para formatar o número do dia
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