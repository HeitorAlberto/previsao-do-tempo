const defaultLocation = {
  name: "São Miguel dos Campos",
  admin1: "Alagoas",
  country: "Brasil",
  lat: -9.7811,
  lon: -36.0936
};

const input = document.getElementById('city-input');
const suggestionsBox = document.getElementById('suggestions');
const searchContainer = document.getElementById('search-box-container');
const weatherCard = document.getElementById('weather-card');

function syncSearchWidth() {
  if (weatherCard.style.display !== 'none') {
    const cardWidth = weatherCard.offsetWidth;
    if (cardWidth > 0) {
      searchContainer.style.width = `${cardWidth}px`;
    }
  }
}

window.addEventListener('resize', syncSearchWidth);

fetchWeather(defaultLocation.lat, defaultLocation.lon, defaultLocation.name, defaultLocation.admin1, defaultLocation.country);

input.addEventListener('input', async () => {
  const query = input.value.trim();
  if (query.length < 3) {
    suggestionsBox.style.display = 'none';
    return;
  }

  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`);
  const data = await response.json();

  suggestionsBox.innerHTML = '';
  if (data.results && data.results.length > 0) {
    data.results.forEach(city => {
      const div = document.createElement('div');
      div.className = 'suggestion-item';
      const estado = city.admin1 ? `, ${city.admin1}` : '';
      const pais = city.country ? `, ${city.country}` : '';
      div.textContent = `${city.name}${estado}${pais}`;
      
      div.addEventListener('click', () => {
        input.value = '';
        suggestionsBox.style.display = 'none';
        fetchWeather(city.latitude, city.longitude, city.name, city.admin1, city.country);
      });
      suggestionsBox.appendChild(div);
    });
    suggestionsBox.style.display = 'block';
  } else {
    suggestionsBox.style.display = 'none';
  }
});

function getCacheKey(lat, lon) {
  return `weather_cache_${lat.toFixed(2)}_${lon.toFixed(2)}`;
}

function getLatestCutoffTime() {
  const now = new Date();
  const cutoff = new Date(now);
  const currentHour = now.getHours();

  if (currentHour >= 12) {
    cutoff.setHours(12, 0, 0, 0);
  } else {
    cutoff.setHours(0, 0, 0, 0);
  }

  return cutoff.getTime();
}

async function fetchWeather(lat, lon, city, state, country) {
  const cacheKey = getCacheKey(lat, lon);
  const cachedData = localStorage.getItem(cacheKey);
  const cachedTime = localStorage.getItem(`${cacheKey}_time`);

  const latestCutoff = getLatestCutoffTime();
  const savedTime = cachedTime ? parseInt(cachedTime, 10) : 0;

  if (cachedData && savedTime >= latestCutoff) {
    const data = JSON.parse(cachedData);
    renderData(data, city, state, country, lat, lon);
    fetchLongTermRain(lat, lon);
    return;
  }

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_min,temperature_2m_max,cloud_cover_mean,wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum,weather_code&hourly=temperature_2m,cloud_cover,precipitation,wind_speed_10m,wind_gusts_10m,weather_code,is_day&models=ecmwf_ifs&timezone=auto&forecast_days=10`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();

    localStorage.setItem(cacheKey, JSON.stringify(data));
    localStorage.setItem(`${cacheKey}_time`, new Date().getTime().toString());

    renderData(data, city, state, country, lat, lon);
    fetchLongTermRain(lat, lon);
  } catch (error) {
    if (cachedData) {
      const data = JSON.parse(cachedData);
      renderData(data, city, state, country, lat, lon);
      fetchLongTermRain(lat, lon);
    } else {
      alert('Erro ao carregar os dados de previsão do tempo.');
    }
  }
}

async function fetchLongTermRain(lat, lon) {
  const seasonalUrl = `https://seasonal-api.open-meteo.com/v1/seasonal?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&models=ecmwf_ec46&timezone=auto`;

  try {
    const response = await fetch(seasonalUrl);
    const data = await response.json();
    
    if (data && data.daily && data.daily.precipitation_sum && data.daily.time) {
      const timeArr = data.daily.time;
      const precip = data.daily.precipitation_sum;
      
      const rain15 = calculateRainAccumulatedWithDate(timeArr, precip, 15);
      const rain30 = calculateRainAccumulatedWithDate(timeArr, precip, 30);
      const rain46 = calculateRainAccumulatedWithDate(timeArr, precip, 46);

      updateRainSummaryUI(rain15, rain30, rain46);
    }
  } catch (error) {
    console.warn("Não foi possível carregar os acumulados de longo prazo.", error);
  }
}

function calculateRainAccumulatedWithDate(timeArray, precipitationArray, days) {
  if (!precipitationArray || precipitationArray.length === 0) return { sum: 0, endDate: '-' };
  
  let sum = 0;
  const limit = Math.min(precipitationArray.length, days);
  
  for (let i = 0; i < limit; i++) {
    const val = precipitationArray[i];
    if (val !== null && val !== undefined) {
      sum += val;
    }
  }
  
  let formattedDate = '-';
  if (timeArray && timeArray[limit - 1]) {
    const parts = timeArray[limit - 1].split('-');
    if (parts.length === 3) {
      formattedDate = `${parts[2]}/${parts[1]}`;
    }
  }
  
  return {
    sum: Math.round(sum * 10) / 10,
    endDate: formattedDate
  };
}

function updateRainSummaryUI(r15, r30, r46) {
  const container = document.getElementById('long-term-rain-summary');
  if (!container) return;

  const diff30 = Math.round((r30.sum - r15.sum) * 10) / 10;
  const diff46 = Math.round((r46.sum - r30.sum) * 10) / 10;

  const diff30Str = diff30 >= 0 ? `+${diff30} mm` : `${diff30} mm`;
  const diff46Str = diff46 >= 0 ? `+${diff46} mm` : `${diff46} mm`;

  container.innerHTML = `
    <strong>Chuva acumulada:</strong><br><br>
    15 dias (até ${r15.endDate}): ${r15.sum} mm<br><br>
    30 dias (até ${r30.endDate}): ${r30.sum} mm (${diff30Str})<br><br>
    46 dias (até ${r46.endDate}): ${r46.sum} mm (${diff46Str})
  `;
}

function getCloudDescriptionText(percentage, code) {
  if (percentage === null || percentage === undefined) {
    return "-";
  }

  let label = "Céu limpo";

  if (percentage <= 10) {
    label = "Céu limpo";
  } else if (percentage <= 30) {
    label = "Poucas nuvens";
  } else if (percentage <= 60) {
    label = "Parcialmente nublado";
  } else if (percentage <= 85) {
    label = "Muitas nuvens";
  } else {
    label = "Nublado";
  }

  const isThunderstorm = (code === 95 || code === 96 || code === 99);
  if (isThunderstorm) {
    return `${label} ⚡`;
  }

  return label;
}

function getDailyCloudDescription(hourlyData, dateStr, dailyWeatherCode) {
  if (!hourlyData || !hourlyData.time) return "Céu limpo";

  let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0;

  hourlyData.time.forEach((hTime, hIdx) => {
    if (hTime.startsWith(dateStr)) {
      const isDayTime = hourlyData.is_day ? hourlyData.is_day[hIdx] === 1 : true;
      
      if (isDayTime) {
        const percentage = hourlyData.cloud_cover[hIdx];
        if (percentage !== null && percentage !== undefined) {
          if (percentage <= 10) c1++;
          else if (percentage <= 30) c2++;
          else if (percentage <= 60) c3++;
          else if (percentage <= 85) c4++;
          else c5++;
        }
      }
    }
  });

  const heavyClouds = c4 + c5;
  const lightOrClear = c1 + c2 + c3;
  const totalDayHours = heavyClouds + lightOrClear;

  let label = "Céu limpo";

  if (totalDayHours > 0) {
    const heavyRatio = heavyClouds / totalDayHours;

    if (heavyRatio >= 0.55) {
      if (c4 >= 2 && c4 > c5) {
        label = "Muitas nuvens";
      } else {
        label = "Nublado";
      }
    } else if (heavyRatio <= 0.35) {
      if (c1 > (c2 + c3)) {
        label = "Céu limpo";
      } else if (c3 >= 3) {
        label = "Parcialmente nublado";
      } else {
        label = "Poucas nuvens";
      }
    } else {
      label = "Muitas nuvens";
    }
  }

  const isThunderstorm = (dailyWeatherCode === 95 || dailyWeatherCode === 96 || dailyWeatherCode === 99);
  if (isThunderstorm) {
    return `${label} ⚡`;
  }

  return label;
}

function formatDateInfo(dateString) {
  const parts = dateString.split('-');
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  
  const dayOfWeekNum = date.getDay();
  const isWeekend = dayOfWeekNum === 0 || dayOfWeekNum === 6;
  
  const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' });
  const day = parts[2];
  const month = parts[1];
  
  return {
    formatted: `${dayOfWeek}, ${day}/${month}`,
    isWeekend: isWeekend
  };
}

function formatWind(speed, gusts) {
  const speedVal = (speed !== null && speed !== undefined) ? Math.round(speed) : '-';
  const gustVal = (gusts !== null && gusts !== undefined) ? Math.round(gusts) : '-';
  
  if (speedVal === '-' && gustVal === '-') return '-';
  return `${speedVal} a ${gustVal}`;
}

function toggleAccordion(parentRow, dateStr, hourlyData) {
  const nextElement = parentRow.nextElementSibling;
  const isAlreadyOpen = nextElement && nextElement.classList.contains('accordion-row');

  document.querySelectorAll('.accordion-row').forEach(row => row.remove());
  document.querySelectorAll('.clickable-row').forEach(row => row.classList.remove('active-row'));

  if (isAlreadyOpen) return;

  parentRow.classList.add('active-row');
  const accordionRow = document.createElement('tr');
  accordionRow.classList.add('accordion-row');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDate = String(now.getDate()).padStart(2, '0');
  const todayStr = `${currentYear}-${currentMonth}-${currentDate}`;
  const currentHourVal = now.getHours();

  let defaultBlock = 0;
  if (dateStr === todayStr) {
    defaultBlock = Math.floor(currentHourVal / 6) * 6;
  }

  accordionRow.innerHTML = `
    <td colspan="5">
      <div class="accordion-content">
        
        <div class="table-responsive">
          <table class="hourly-forecast-table">
            <tbody id="hourly-tbody-${dateStr}">
            </tbody>
          </table>

          <div class="hourly-tabs">
          <button type="button" class="tab-btn" data-block="0">00h - 06h</button>
          <button type="button" class="tab-btn" data-block="6">06h - 12h</button>
          <button type="button" class="tab-btn" data-block="12">12h - 18h</button>
          <button type="button" class="tab-btn" data-block="18">18h - 24h</button>
        </div>
        </div>
        <div id="period-rain-${dateStr}" class="period-rain-summary" style="margin-top: 10px; font-weight: bold;"></div>
      </div>
    </td>
  `;

  parentRow.after(accordionRow);

  function renderHourlyBlock(startHour) {
    const tbodyHourly = accordionRow.querySelector(`#hourly-tbody-${dateStr}`);
    tbodyHourly.innerHTML = '';
    let periodRainSum = 0;

    if (hourlyData && hourlyData.time) {
      hourlyData.time.forEach((hTime, hIdx) => {
        if (hTime.startsWith(dateStr)) {
          const hour = new Date(hTime).getHours();
          if (hour >= startHour && hour < startHour + 6) {
            const hRainVal = hourlyData.precipitation[hIdx] !== undefined ? hourlyData.precipitation[hIdx] : 0;
            periodRainSum += hRainVal;

            const hourFormatted = `${String(hour).padStart(2, '0')}h`;
            const hTemp = hourlyData.temperature_2m[hIdx] !== undefined ? Math.round(hourlyData.temperature_2m[hIdx]) : '-';
            const hCloudText = getCloudDescriptionText(
              hourlyData.cloud_cover[hIdx], 
              hourlyData.weather_code ? hourlyData.weather_code[hIdx] : null
            );
            const hRain = Math.round(hRainVal * 10) / 10;
            const hWindSpeed = hourlyData.wind_speed_10m ? hourlyData.wind_speed_10m[hIdx] : null;
            const hWindGusts = hourlyData.wind_gusts_10m ? hourlyData.wind_gusts_10m[hIdx] : null;
            const hWindStr = formatWind(hWindSpeed, hWindGusts);

            const isToday = dateStr === todayStr;
            const isCurrentHour = isToday && currentHourVal === hour;
            const trClass = isCurrentHour ? 'current-hour-row' : '';

            const tr = document.createElement('tr');
            if (trClass) tr.className = trClass;

            tr.innerHTML = `
              <td>${hourFormatted}</td>
              <td>${hCloudText}</td>
              <td>${hTemp}°C</td>
              <td>${hRain} mm</td>
              <td>${hWindStr} km/h</td>
            `;
            tbodyHourly.appendChild(tr);
          }
        }
      });
    }

    const roundedPeriodRain = Math.round(periodRainSum * 10) / 10;
    accordionRow.querySelector(`#period-rain-${dateStr}`).textContent = `Chuva total no período: ${roundedPeriodRain} mm`;

    accordionRow.querySelectorAll('.tab-btn').forEach(btn => {
      if (parseInt(btn.dataset.block, 10) === startHour) {
        btn.style.backgroundColor = '#000';
        btn.style.color = '#fff';
      } else {
        btn.style.backgroundColor = '#e2e8f0';
        btn.style.color = '#333';
      }
    });
  }

  accordionRow.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      renderHourlyBlock(parseInt(btn.dataset.block, 10));
    });
  });

  renderHourlyBlock(defaultBlock);
  syncSearchWidth();
}

function renderData(data, city, state, country, lat, lon) {
  weatherCard.style.display = 'block';
  
  const estadoStr = state ? `, ${state}` : '';
  const paisStr = country ? `, ${country}` : '';
  document.getElementById('location-name').textContent = `${city}${estadoStr}${paisStr}`;
  document.getElementById('location-coords').textContent = `Latitude: ${lat} | Longitude: ${lon}`;

  const daily = data.daily;
  const hourly = data.hourly;
  
  const tbody = document.querySelector('#forecast-table tbody');
  tbody.innerHTML = '';

  daily.time.forEach((dateStr, i) => {
    const minVal = daily.temperature_2m_min[i];
    const maxVal = daily.temperature_2m_max[i];

    const tempMin = minVal !== null && minVal !== undefined ? Math.round(minVal) : null;
    const tempMax = maxVal !== null && maxVal !== undefined ? Math.round(maxVal) : null;

    let tempStr = '-';
    if (tempMin !== null && tempMax !== null) {
      tempStr = `${tempMin} a ${tempMax}`;
    }

    const windSpeedMax = daily.wind_speed_10m_max ? daily.wind_speed_10m_max[i] : null;
    const windGustsMax = daily.wind_gusts_10m_max ? daily.wind_gusts_10m_max[i] : null;
    const windStr = formatWind(windSpeedMax, windGustsMax);

    const condicao = getDailyCloudDescription(hourly, dateStr, daily.weather_code ? daily.weather_code[i] : null);
    const dateInfo = formatDateInfo(dateStr);
    const dayIndex = i + 1;

    const row = document.createElement('tr');
    row.classList.add('clickable-row');
    if (dateInfo.isWeekend) row.classList.add('weekend');

    row.innerHTML = `
      <td>${dayIndex} - ${dateInfo.formatted}</td>
      <td>${condicao}</td>
      <td>${tempStr}</td>
      <td>${daily.precipitation_sum[i] ?? '-'} mm</td>
      <td>${windStr} km/h</td>
    `;

    row.addEventListener('click', () => {
      toggleAccordion(row, dateStr, hourly);
    });
    tbody.appendChild(row);
  });

  syncSearchWidth();
}