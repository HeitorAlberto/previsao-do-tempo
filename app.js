// Plugin customizado para desenhar uma coluna de fundo na hora atual
const currentHourHighlightPlugin = {
  id: 'currentHourHighlight',
  beforeDraw(chart) {
    if (!chart.config.options.plugins.currentHourHighlight?.enabled) return;
    
    const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
    const now = new Date();
    const currentHourLabel = String(now.getHours()).padStart(2, '0') + 'h';
    const index = chart.data.labels.findIndex(label => label.startsWith(currentHourLabel));

    if (index !== -1) {
      const xPos = x.getPixelForTick(index);
      const count = chart.data.labels.length;
      const width = (x.width / count);

      ctx.save();
      ctx.fillStyle = 'rgba(255, 193, 7, 0.2)'; // Cor de destaque suave
      ctx.fillRect(xPos - width / 2, top, width, bottom - top);
      ctx.restore();
    }
  }
};

// Registra plugins com segurança após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
    Chart.register(currentHourHighlightPlugin);
  } else {
    console.error('O Chart.js ou o plugin DataLabels não foram carregados.');
  }

  renderHistory();
});

// Cores para intensidades de chuva
function getRainColor(mm) {
  if (mm <= 0.1) return 'transparent';
  if (mm <= 2.5) return '#1976d2'; // Azul (Fraca)
  if (mm <= 10.0) return '#fbc02d'; // Amarelo (Moderada)
  if (mm <= 20.0) return '#f57c00'; // Laranja (Forte)
  return '#d32f2f'; // Vermelho (Extrema)
}

// Elementos do DOM
const searchInput = document.getElementById('city-search');
const suggestionsDiv = document.getElementById('search-suggestions');
const currentLocationDiv = document.getElementById('current-location');
const historyDiv = document.getElementById('search-history');
let debounceTimer;

function hideSuggestions() {
  suggestionsDiv.hidden = true;
  suggestionsDiv.style.display = 'none';
  suggestionsDiv.innerHTML = '';
}

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
  history = history.filter(item => 
    !(item.name === place.name && item.admin1 === place.admin1 && item.country === place.country)
  );
  history.unshift(place);
  if (history.length > 3) history = history.slice(0, 3);
  localStorage.setItem('weather_history', JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  if (!historyDiv) return;
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
    itemDiv.addEventListener('click', () => selectCity(place));
    historyDiv.appendChild(itemDiv);
  });
}

function selectCity(place) {
  hideSuggestions();
  if (searchInput) searchInput.value = '';
  const formattedLocation = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}, ${place.country}`;
  currentLocationDiv.style.border = '2px solid black';
  currentLocationDiv.innerHTML = `<p style="font-weight: bolder">📍 Local atual:</p> <br> <p>${formattedLocation}</p>`;
  saveToHistory(place);
  fetchForecast(place.latitude, place.longitude);
}

// Autocomplete
if (searchInput) {
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
}

// Fetch Previsão (Modelo ECMWF)
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

// --- CRIADOR DE GRÁFICOS ---
function createChart(canvas, labels, datasetConfig, options = {}) {
  const { unitSymbol = '', globalMin, globalMax, isToday = false, formatValue = null } = options;

  new Chart(canvas, {
    type: datasetConfig.type,
    data: {
      labels: labels,
      datasets: [{
        label: datasetConfig.label,
        data: datasetConfig.data,
        borderColor: datasetConfig.borderColor,
        backgroundColor: datasetConfig.backgroundColor,
        fill: datasetConfig.fill || false,
        borderWidth: 3,
        // Visual padronizado das "bolinhas" no topo da linha
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: datasetConfig.borderColor,
        pointBorderColor: '#ffffff',
        pointBorderWidth: 1.5,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: { top: 25, bottom: 10 }
      },
      plugins: {
        legend: { display: false },
        currentHourHighlight: { enabled: isToday },
        datalabels: {
          display: true,
          align: 'top',
          anchor: 'end',
          offset: 4,
          font: { weight: 'bold', size: 12 },
          color: '#222',
          formatter: (value) => {
            if (value === 0 && unitSymbol === 'mm') return ''; // Oculta sem chuva
            if (formatValue) return formatValue(value);
            return `${Math.round(value)}${unitSymbol}`;
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            autoSkip: false,
            font: (context) => {
              const label = context.tick.label || '';
              const isCurrent = label.includes('(Agora)');
              return {
                size: isCurrent ? 13 : 12,
                weight: isCurrent ? 'bold' : 'normal'
              };
            },
            color: (context) => {
              const label = context.tick.label || '';
              return label.includes('(Agora)') ? '#d32f2f' : '#666';
            }
          }
        },
        y: {
          display: false,
          min: globalMin !== undefined ? globalMin : undefined,
          max: globalMax !== undefined ? globalMax : undefined
        }
      }
    }
  });
}

// Renderização Principal
function renderForecast(hourly) {
  const container = document.getElementById('forecast-container');
  if (!container) return;
  container.innerHTML = '';

  const daysMap = {};
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentHour = now.getHours();

  const globalMinTemp = Math.floor(Math.min(...hourly.temperature_2m)) - 3;
  const globalMaxTemp = Math.ceil(Math.max(...hourly.temperature_2m)) + 3;

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
    let formattedDate = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${dayNum}/${month}/${year.slice(2)}`;
    
    const isToday = (dateKey === todayStr);
    if (isToday) {
      formattedDate += ' (Hoje)';
    }

    const cardDiv = document.createElement('article');
    cardDiv.className = 'daily-card';

    cardDiv.innerHTML = `
      <div class="card-summary">
        <h3 class="day-date">${formattedDate}</h3>
        <div class="info-day"><p>Temperatura</p> <p>${minTemp}° a ${maxTemp}°C</p></div>
        <div class="info-day"><p>Chuva acumulada</p> <p>${totalRain} mm</p></div>
        <div class="info-day"><p>Rajadas de vento max</p> <p>${maxWind} km/h</p></div>
        <button class="toggle-btn" aria-label="Expandir detalhes">${isToday ? 'Esconder gráficos' : 'Ver gráficos'}</button>
      </div>
      <div class="card-details" ${isToday ? '' : 'hidden'}>
        
        <div class="chart-box">
          <h4 class="chart-title">🌡️ Temperatura (°C)</h4>
          <div class="chart-scroll-container">
            <div class="chart-scroll-inner">
              <canvas class="canvas-temp"></canvas>
            </div>
          </div>
        </div>

        <div class="chart-box">
          <h4 class="chart-title">🌧️ Chuva (mm/h)</h4>
          <div class="chart-scroll-container">
            <div class="chart-scroll-inner">
              <canvas class="canvas-rain"></canvas>
            </div>
          </div>
        </div>

        <div class="chart-box">
          <h4 class="chart-title">💨 Rajadas de Vento (km/h)</h4>
          <div class="chart-scroll-container">
            <div class="chart-scroll-inner">
              <canvas class="canvas-wind"></canvas>
            </div>
          </div>
        </div>

      </div>
    `;

    const detailsDiv = cardDiv.querySelector('.card-details');

    // Rótulos de hora com destaque para a hora atual do dia de hoje
    const hoursLabels = day.times.map(t => {
      const h = parseInt(t.substring(11, 13), 10);
      if (isToday && h === currentHour) {
        return `${String(h).padStart(2, '0')}h (Agora)`;
      }
      return `${String(h).padStart(2, '0')}h`;
    });

    // 1. Gráfico de Temperatura
    createChart(
      detailsDiv.querySelector('.canvas-temp'),
      hoursLabels,
      { type: 'line', label: 'Temperatura', data: day.temps, borderColor: '#e65100', backgroundColor: 'transparent' },
      { unitSymbol: '°', globalMin: globalMinTemp, globalMax: globalMaxTemp, isToday }
    );

    // 2. Gráfico de Chuva (Cores dinâmicas por barra e valores sem arredondamento)
    const rainColors = day.precip.map(val => getRainColor(val));
    createChart(
      detailsDiv.querySelector('.canvas-rain'),
      hoursLabels,
      { type: 'bar', label: 'Chuva', data: day.precip, borderColor: rainColors, backgroundColor: rainColors },
      { 
        unitSymbol: 'mm', 
        isToday,
        formatValue: (val) => val === 0 ? '' : `${val} mm` 
      }
    );

    // 3. Gráfico de Vento (Bolinhas iguais às da temperatura e sem 'km/h' no rótulo)
    createChart(
      detailsDiv.querySelector('.canvas-wind'),
      hoursLabels,
      { type: 'line', label: 'Vento', data: day.windGusts, borderColor: '#455a64', backgroundColor: 'transparent' },
      { 
        isToday,
        formatValue: (val) => `${Math.round(val)}` 
      }
    );

    // Centralizar rolagem na hora atual
    const centerCurrentHour = () => {
      if (!isToday) return;
      const scrollContainers = detailsDiv.querySelectorAll('.chart-scroll-container');
      
      scrollContainers.forEach(container => {
        const inner = container.querySelector('.chart-scroll-inner');
        const totalWidth = inner.offsetWidth;
        const hourWidth = totalWidth / 24;
        
        const targetScroll = (currentHour * hourWidth) - (container.offsetWidth / 2) + (hourWidth / 2);
        container.scrollLeft = Math.max(0, targetScroll);
      });
    };

    if (isToday) {
      setTimeout(centerCurrentHour, 150);
    }

    const toggleBtn = cardDiv.querySelector('.toggle-btn');
    toggleBtn.addEventListener('click', () => {
      const isHidden = detailsDiv.hidden;
      detailsDiv.hidden = !isHidden;
      toggleBtn.textContent = isHidden ? 'Esconder gráficos' : 'Ver gráficos';
      
      if (!isHidden && isToday) {
        setTimeout(centerCurrentHour, 100);
      }
    });

    container.appendChild(cardDiv);
  });
}