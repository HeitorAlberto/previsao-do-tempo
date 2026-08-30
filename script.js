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
    return `${label} com trovoadas⚡`;
  }

  return label;
}

function getBlockCloudDescription(hourlyData, dateStr, startHour, endHour) {
  if (!hourlyData || !hourlyData.cloud_cover) return "-";

  const categoriesOrder = [
    "Céu limpo",
    "Poucas nuvens",
    "Parcialmente nublado",
    "Muitas nuvens",
    "Nublado"
  ];

  const counts = {
    "Céu limpo": 0,
    "Poucas nuvens": 0,
    "Parcialmente nublado": 0,
    "Muitas nuvens": 0,
    "Nublado": 0
  };

  let hasThunderstorm = false;

  hourlyData.time.forEach((hTime, hIdx) => {
    if (hTime.startsWith(dateStr)) {
      const hour = new Date(hTime).getHours();
      if (hour >= startHour && hour < endHour) {
        const percentage = hourlyData.cloud_cover[hIdx];
        const code = hourlyData.weather_code ? hourlyData.weather_code[hIdx] : null;

        if (code === 95 || code === 96 || code === 99) {
          hasThunderstorm = true;
        }

        if (percentage !== null && percentage !== undefined) {
          if (percentage <= 10) counts["Céu limpo"]++;
          else if (percentage <= 30) counts["Poucas nuvens"]++;
          else if (percentage <= 60) counts["Parcialmente nublado"]++;
          else if (percentage <= 85) counts["Muitas nuvens"]++;
          else counts["Nublado"]++;
        }
      }
    }
  });

  let dominantLabel = "Céu limpo";
  let maxCount = -1;

  categoriesOrder.forEach(label => {
    if (counts[label] >= maxCount && counts[label] > 0) {
      maxCount = counts[label];
      dominantLabel = label;
    }
  });

  if (hasThunderstorm) {
    return `${dominantLabel} com trovoadas⚡`;
  }

  return dominantLabel;
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

function toggleAccordion(parentCard, dateStr, hourlyData) {
  const nextElement = parentCard.nextElementSibling;
  const isAlreadyOpen = nextElement && nextElement.classList.contains('accordion-card');

  document.querySelectorAll('.accordion-card').forEach(card => card.remove());
  document.querySelectorAll('.day-card').forEach(card => card.classList.remove('active-card'));

  if (isAlreadyOpen) return;

  parentCard.classList.add('active-card');
  const accordionCard = document.createElement('div');
  accordionCard.classList.add('accordion-card');

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDate = String(now.getDate()).padStart(2, '0');
  const todayStr = `${currentYear}-${currentMonth}-${currentDate}`;
  const currentHourVal = now.getHours();

  accordionCard.innerHTML = `
    <div class="accordion-content">
      <div id="hourly-container-${dateStr}" class="hourly-container"></div>
    </div>
  `;

  parentCard.after(accordionCard);

  const containerHourly = accordionCard.querySelector(`#hourly-container-${dateStr}`);
  const blocks = [
    { start: 0, end: 6, label: "00h - 06h" },
    { start: 6, end: 12, label: "06h - 12h" },
    { start: 12, end: 18, label: "12h - 18h" },
    { start: 18, end: 24, label: "18h - 24h" }
  ];

  blocks.forEach(block => {
    let temps = [];
    let rains = [];
    let winds = [];
    let gusts = [];

    if (hourlyData && hourlyData.time) {
      hourlyData.time.forEach((hTime, hIdx) => {
        if (hTime.startsWith(dateStr)) {
          const hour = new Date(hTime).getHours();
          if (hour >= block.start && hour < block.end) {
            if (hourlyData.temperature_2m && hourlyData.temperature_2m[hIdx] !== undefined) {
              temps.push(hourlyData.temperature_2m[hIdx]);
            }
            if (hourlyData.precipitation && hourlyData.precipitation[hIdx] !== undefined) {
              rains.push(hourlyData.precipitation[hIdx]);
            }
            if (hourlyData.wind_speed_10m && hourlyData.wind_speed_10m[hIdx] !== undefined) {
              winds.push(hourlyData.wind_speed_10m[hIdx]);
            }
            if (hourlyData.wind_gusts_10m && hourlyData.wind_gusts_10m[hIdx] !== undefined) {
              gusts.push(hourlyData.wind_gusts_10m[hIdx]);
            }
          }
        }
      });
    }

    const firstTemp = temps.length > 0 ? Math.round(temps[0]) : null;
    const lastTemp = temps.length > 0 ? Math.round(temps[temps.length - 1]) : null;

    let tempStr = '-';
    if (firstTemp !== null && lastTemp !== null) {
      if (firstTemp === lastTemp) {
        tempStr = `${firstTemp}°`;
      } else {
        tempStr = `${firstTemp}° a ${lastTemp}°`;
      }
    }

    const totalRain = rains.length > 0 ? Math.round(rains.reduce((acc, val) => acc + val, 0) * 10) / 10 : 0;

    const minWind = winds.length > 0 ? Math.min(...winds) : null;
    const maxGust = gusts.length > 0 ? Math.max(...gusts) : null;
    const windStr = formatWind(minWind, maxGust);

    const cloudText = getBlockCloudDescription(hourlyData, dateStr, block.start, block.end);

    const isToday = dateStr === todayStr;
    const isCurrentBlock = isToday && currentHourVal >= block.start && currentHourVal < block.end;
    const cardClass = isCurrentBlock ? 'hourly-item current-hour' : 'hourly-item';

    const card = document.createElement('div');
    card.className = cardClass;

    card.innerHTML = `
      <div class="hourly-hour">${block.label}</div>
      <div class="hourly-condition">${cloudText}</div>
      <div class="hourly-temp"><div>Temperatura</div><div><strong>${tempStr}</strong></div></div>
      <div class="hourly-rain"><div>Chuva</div><div><strong>${totalRain} mm</strong></div></div>
      <div class="hourly-wind"><div>Ventos</div><div><strong>${windStr} km/h</strong></div></div>
    `;
    containerHourly.appendChild(card);
  });

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
  
  const forecastContainer = document.getElementById('forecast-container');
  forecastContainer.innerHTML = '';

  daily.time.forEach((dateStr, i) => {
    const minVal = daily.temperature_2m_min[i];
    const maxVal = daily.temperature_2m_max[i];

    const tempMin = minVal !== null && minVal !== undefined ? Math.round(minVal) : null;
    const tempMax = maxVal !== null && maxVal !== undefined ? Math.round(maxVal) : null;

    let tempStr = '-';
    if (tempMin !== null && tempMax !== null) {
      tempStr = `${tempMin}° a ${tempMax}°`;
    }

    const windSpeedMax = daily.wind_speed_10m_max ? daily.wind_speed_10m_max[i] : null;
    const windGustsMax = daily.wind_gusts_10m_max ? daily.wind_gusts_10m_max[i] : null;
    const windStr = formatWind(windSpeedMax, windGustsMax);

    const condicao = getDailyCloudDescription(hourly, dateStr, daily.weather_code ? daily.weather_code[i] : null);
    const dateInfo = formatDateInfo(dateStr);
    const dayIndex = i + 1;
    const precipSum = daily.precipitation_sum[i] ?? '-';

    const card = document.createElement('div');
    card.classList.add('day-card');
    if (dateInfo.isWeekend) card.classList.add('weekend');

    card.innerHTML = `
      <div class="card-date">${dayIndex} - ${dateInfo.formatted}</div>
      <div class="card-condition">${condicao}</div>
      <div class="card-temp"><div>Temperatura</div><div><strong>${tempStr}</strong></div></div>
      <div class="card-rain"><div>Chuva</div><div><strong>${precipSum} mm</strong></div></div>
      <div class="card-wind"><div>Ventos</div><div><strong>${windStr} km/h</strong></div></div>
    `;

    card.addEventListener('click', () => {
      toggleAccordion(card, dateStr, hourly);
    });
    forecastContainer.appendChild(card);
  });

  syncSearchWidth();
}