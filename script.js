const searchInput = document.getElementById('searchInput');
const suggestionsContainer = document.getElementById('suggestionsContainer');
const forecastContainer = document.getElementById('forecastContainer');
const historyContainer = document.getElementById('historyContainer');
const historyList = document.getElementById('historyList');
const currentLocationContainer = document.getElementById('currentLocationContainer');
const modalOverlay = document.getElementById('modalOverlay');
const modalHeader = document.getElementById('modalHeader');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

let searchTimeout;
let currentWeatherData = null;
let currentCityName = '';

let searchHistory = JSON.parse(localStorage.getItem('weather_history') || '[]');
renderHistory();

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length < 3) {
        suggestionsContainer.style.display = 'none';
        return;
    }
    searchTimeout = setTimeout(() => fetchLocations(query), 300);
});

modalClose.addEventListener('click', () => {
    modalOverlay.style.display = 'none';
});

modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) modalOverlay.style.display = 'none';
});

async function fetchLocations(query) {
    try {
        const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`);
        const data = await response.json();
        
        suggestionsContainer.innerHTML = '';
        if (data.results && data.results.length > 0) {
            data.results.forEach(loc => {
                const div = document.createElement('div');
                div.className = 'suggestion-item';
                div.textContent = `${loc.name}, ${loc.admin1 || ''} (${loc.country})`;
                div.addEventListener('click', () => {
                    selectLocation(loc);
                });
                suggestionsContainer.appendChild(div);
            });
            suggestionsContainer.style.display = 'block';
        } else {
            suggestionsContainer.style.display = 'none';
        }
    } catch (err) {
        console.error('Erro ao buscar localidades:', err);
    }
}

function selectLocation(loc) {
    currentCityName = `${loc.name}, ${loc.admin1 || loc.country}`;
    searchInput.value = '';
    suggestionsContainer.style.display = 'none';
    addToHistory(loc);
    fetchWeatherData(loc);
}

function addToHistory(loc) {
    const locString = `${loc.name}, ${loc.admin1 || loc.country}`;
    searchHistory = searchHistory.filter(item => item.name !== locString);
    searchHistory.unshift({ 
        name: locString, 
        latitude: loc.latitude, 
        longitude: loc.longitude, 
        country: loc.country, 
        admin1: loc.admin1 
    });
    if (searchHistory.length > 3) searchHistory.pop();
    localStorage.setItem('weather_history', JSON.stringify(searchHistory));
    renderHistory();
}

function renderHistory() {
    if (searchHistory.length === 0) {
        historyContainer.style.display = 'none';
        return;
    }
    historyContainer.style.display = 'block';
    historyList.innerHTML = '';
    searchHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = item.name;
        div.addEventListener('click', () => {
            currentCityName = item.name;
            searchInput.value = '';
            fetchWeatherData(item);
        });
        historyList.appendChild(div);
    });
}

function getCacheKey(lat, lon) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    const hour = now.getUTCHours();

    let cycleHour = 0;
    if (hour >= 18) cycleHour = 18;
    else if (hour >= 12) cycleHour = 12;
    else if (hour >= 6) cycleHour = 6;
    else cycleHour = 0;

    return `ecmwf_cache_${lat}_${lon}_${year}-${month}-${day}_${cycleHour}`;
}

async function fetchWeatherData(loc) {
    const lat = loc.latitude !== undefined ? loc.latitude : loc.lat;
    const lon = loc.longitude !== undefined ? loc.longitude : loc.lon;

    const cacheKey = getCacheKey(lat, lon);
    const cachedData = localStorage.getItem(cacheKey);

    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ecmwf_cache_') && key !== cacheKey) {
            localStorage.removeItem(key);
        }
    });

    if (cachedData) {
        currentWeatherData = JSON.parse(cachedData);
        renderForecast(currentWeatherData);
        return;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,wind_gusts_10m_max&hourly=temperature_2m,precipitation,wind_gusts_10m,cloudcover,weathercode&models=ecmwf_ifs&timezone=auto&forecast_days=10`;
        
        const response = await fetch(url);
        const data = await response.json();

        currentWeatherData = data;
        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderForecast(data);
    } catch (err) {
        console.error('Erro ao buscar dados do ECMWF:', err);
        forecastContainer.innerHTML = '<div class="forecast-card"><div class="card-header-div">Erro ao carregar dados meteorológicos.</div></div>';
    }
}

function getWeatherDescription(cloudcover, weathercode) {
    const thunderstormCodes = [95, 96, 99];
    const hasThunderstorm = thunderstormCodes.includes(weathercode);
    const lightningEmoji = hasThunderstorm ? ' ⚡' : '';

    if (cloudcover <= 20) {
        return `Poucas nuvens${lightningEmoji}`;
    } else if (cloudcover <= 50) {
        return `Parcial. Nublado${lightningEmoji}`;
    } else if (cloudcover <= 80) {
        return `Muitas nuvens${lightningEmoji}`;
    } else {
        return `Encoberto${lightningEmoji}`;
    }
}

function calculateCardCondition(hourlyTime, cloudcoverArr, weathercodeArr, targetDateStr) {
    let totalCloud = 0;
    let count = 0;
    let hasThunderstorm = false;

    hourlyTime.forEach((t, i) => {
        if (t && t.startsWith(targetDateStr)) {
            if (cloudcoverArr[i] != null) {
                totalCloud += cloudcoverArr[i];
                count++;
            }
            if (weathercodeArr[i] != null) {
                const code = weathercodeArr[i];
                if ([95, 96, 99].includes(code)) {
                    hasThunderstorm = true;
                }
            }
        }
    });

    const avgCloud = count > 0 ? totalCloud / count : 0;
    const dominantCode = hasThunderstorm ? 95 : 0;

    return getWeatherDescription(avgCloud, dominantCode);
}

function renderForecast(data) {
    currentLocationContainer.textContent = `Localidade: ${currentCityName}`;
    currentLocationContainer.style.display = 'block';

    forecastContainer.innerHTML = '';
    const daily = data.daily;
    const hourlyTime = data.hourly?.time || [];
    const cloudcoverArr = data.hourly?.cloudcover || [];
    const weathercodeArr = data.hourly?.weathercode || [];
    const daysOfWeek = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

    daily.time.forEach((dateStr, index) => {
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayOfWeekIndex = dateObj.getDay();
        const dayOfWeekName = daysOfWeek[dayOfWeekIndex];
        const formattedDate = dateObj.toLocaleDateString('pt-BR');
        const dayIndexOrder = index + 1;

        const card = document.createElement('div');
        card.className = 'forecast-card';

        const headerDiv = document.createElement('div');
        headerDiv.className = 'card-header-div';
        if (dayOfWeekIndex === 0 || dayOfWeekIndex === 6) {
            headerDiv.classList.add('weekend-header');
        }
        headerDiv.textContent = `(${dayIndexOrder}) ${dayOfWeekName}, ${formattedDate}`;
        card.appendChild(headerDiv);

        const bodyDiv = document.createElement('div');
        bodyDiv.className = 'card-body-div';

        const maxTemp = Math.round(daily.temperature_2m_max[index]);
        const minTemp = Math.round(daily.temperature_2m_min[index]);
        const precip = daily.precipitation_sum[index];
        const windGust = Math.round(daily.wind_gusts_10m_max[index]);
        const conditionText = calculateCardCondition(hourlyTime, cloudcoverArr, weathercodeArr, dateStr);

        const metrics = [
            { label: 'Condição', value: conditionText, type: 'condition', bgClass: 'bg-condition' },
            { label: 'Temperatura', value: `${minTemp}° a ${maxTemp}°`, type: 'temp_range', bgClass: 'bg-temp' },
            { label: 'Chuva Acumulada (24h)', value: `${precip} mm`, type: 'precipitation', bgClass: 'bg-precip' },
            { label: 'Rajada de Vento Máx', value: `${windGust} km/h`, type: 'wind_gusts', bgClass: 'bg-wind' }
        ];

        metrics.forEach(metric => {
            const metricDiv = document.createElement('div');
            metricDiv.className = `weather-metric-div ${metric.bgClass}`;
            metricDiv.addEventListener('click', () => openModal(index, metric.type, `${dayOfWeekName}, ${formattedDate}`, metric.bgClass));

            const labelDiv = document.createElement('div');
            labelDiv.className = 'metric-label-div';
            labelDiv.textContent = metric.label;

            const valueDiv = document.createElement('div');
            valueDiv.className = 'metric-value-div';
            valueDiv.textContent = metric.value;

            metricDiv.appendChild(labelDiv);
            metricDiv.appendChild(valueDiv);
            bodyDiv.appendChild(metricDiv);
        });

        card.appendChild(bodyDiv);
        forecastContainer.appendChild(card);
    });
}

function getPeriodName(hour) {
    if (hour >= 0 && hour < 6) return 'Madrugada';
    if (hour >= 6 && hour < 12) return 'Manhã';
    if (hour >= 12 && hour < 18) return 'Tarde';
    if (hour >= 18 && hour <= 23) return 'Noite';
    return '';
}

function openModal(dayIndex, metricType, dateTitle, bgClass) {
    modalHeader.textContent = `${dateTitle}`;
    modalBody.innerHTML = '';

    if (!currentWeatherData || !currentWeatherData.hourly || !currentWeatherData.hourly.time) {
        modalOverlay.style.display = 'flex';
        return;
    }

    const hourlyTime = currentWeatherData.hourly.time;
    const targetDateStr = currentWeatherData?.daily?.time?.[dayIndex];
    if (!targetDateStr) {
        modalOverlay.style.display = 'flex';
        return;
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentDateTimeStr = `${currentYear}-${currentMonth}-${currentDay}T${currentHour}:00`;

    let unit = '';
    const blockHours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];

    if (metricType === 'condition') {
        const cloudcoverArr = currentWeatherData.hourly.cloudcover || [];
        const weathercodeArr = currentWeatherData.hourly.weathercode || [];
        let lastPeriodName = '';

        blockHours.forEach(targetHour => {
            const baseHour = parseInt(targetHour.split(':')[0], 10);
            let isCurrentBlock = false;

            const periodName = getPeriodName(baseHour);
            if (periodName && periodName !== lastPeriodName) {
                const separatorDiv = document.createElement('div');
                separatorDiv.className = 'modal-group-separator';
                separatorDiv.textContent = periodName;
                modalBody.appendChild(separatorDiv);
                lastPeriodName = periodName;
            }

            const fullDateTime = `${targetDateStr}T${targetHour}`;
            if (fullDateTime === currentDateTimeStr) {
                isCurrentBlock = true;
            }

            const index = hourlyTime.indexOf(fullDateTime);
            let conditionText = 'N/A';
            if (index !== -1) {
                const cloud = cloudcoverArr[index] ?? 0;
                const code = weathercodeArr[index] ?? 0;
                conditionText = getWeatherDescription(cloud, code);
            }

            const rowDiv = document.createElement('div');
            rowDiv.className = `modal-row-div ${bgClass}`;

            if (isCurrentBlock) {
                rowDiv.classList.add('current-hour-highlight');
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'modal-row-time-div';
            timeDiv.textContent = targetHour;

            const valDiv = document.createElement('div');
            valDiv.className = 'modal-row-value-div';
            valDiv.textContent = conditionText;

            rowDiv.appendChild(timeDiv);
            rowDiv.appendChild(valDiv);
            modalBody.appendChild(rowDiv);
        });
    } else if (metricType === 'temp_range') {
        const hourlyValues = currentWeatherData.hourly.temperature_2m || [];
        unit = '°C';
        let lastPeriodName = '';

        hourlyTime.forEach((t, i) => {
            if (t && t.startsWith(targetDateStr)) {
                const hourPart = t.split('T')[1];
                const hourInt = parseInt(hourPart.split(':')[0], 10);

                const periodName = getPeriodName(hourInt);
                if (periodName && periodName !== lastPeriodName) {
                    const separatorDiv = document.createElement('div');
                    separatorDiv.className = 'modal-group-separator';
                    separatorDiv.textContent = periodName;
                    modalBody.appendChild(separatorDiv);
                    lastPeriodName = periodName;
                }

                const rowDiv = document.createElement('div');
                rowDiv.className = `modal-row-div ${bgClass}`;

                if (t === currentDateTimeStr) {
                    rowDiv.classList.add('current-hour-highlight');
                }

                const timeDiv = document.createElement('div');
                timeDiv.className = 'modal-row-time-div';
                timeDiv.textContent = hourPart;

                let val = hourlyValues[i];
                let valText = val !== undefined ? `${Math.round(val)}${unit}` : 'N/A';

                const valDiv = document.createElement('div');
                valDiv.className = 'modal-row-value-div';
                valDiv.textContent = valText;

                rowDiv.appendChild(timeDiv);
                rowDiv.appendChild(valDiv);
                modalBody.appendChild(rowDiv);
            }
        });
    } else if (metricType === 'precipitation') {
        unit = ' mm';
        const hourlyPrecip = currentWeatherData.hourly.precipitation || [];
        let lastPeriodName = '';

        blockHours.forEach(targetHour => {
            let sumBlock = 0;
            const baseHour = parseInt(targetHour.split(':')[0], 10);
            let isCurrentBlock = false;

            const periodName = getPeriodName(baseHour);
            if (periodName && periodName !== lastPeriodName) {
                const separatorDiv = document.createElement('div');
                separatorDiv.className = 'modal-group-separator';
                separatorDiv.textContent = periodName;
                modalBody.appendChild(separatorDiv);
                lastPeriodName = periodName;
            }

            for (let i = 0; i < 3; i++) {
                const hourNum = baseHour + i;
                const hourStr = String(hourNum).padStart(2, '0') + ':00';
                const fullDateTime = `${targetDateStr}T${hourStr}`;
                
                if (fullDateTime === currentDateTimeStr) {
                    isCurrentBlock = true;
                }

                const index = hourlyTime.indexOf(fullDateTime);
                if (index !== -1 && hourlyPrecip[index] != null) {
                    sumBlock += hourlyPrecip[index];
                }
            }

            const rowDiv = document.createElement('div');
            rowDiv.className = `modal-row-div ${bgClass}`;

            if (isCurrentBlock) {
                rowDiv.classList.add('current-hour-highlight');
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'modal-row-time-div';
            timeDiv.textContent = targetHour;

            const valDiv = document.createElement('div');
            valDiv.className = 'modal-row-value-div';
            valDiv.textContent = `${sumBlock.toFixed(1)}${unit}`;

            rowDiv.appendChild(timeDiv);
            rowDiv.appendChild(valDiv);
            modalBody.appendChild(rowDiv);
        });
    } else if (metricType === 'wind_gusts') {
        unit = ' km/h';
        const hourlyValues = currentWeatherData.hourly.wind_gusts_10m || [];
        let lastPeriodName = '';

        blockHours.forEach(targetHour => {
            let maxBlock = 0;
            const baseHour = parseInt(targetHour.split(':')[0], 10);
            let isCurrentBlock = false;

            const periodName = getPeriodName(baseHour);
            if (periodName && periodName !== lastPeriodName) {
                const separatorDiv = document.createElement('div');
                separatorDiv.className = 'modal-group-separator';
                separatorDiv.textContent = periodName;
                modalBody.appendChild(separatorDiv);
                lastPeriodName = periodName;
            }

            for (let i = 0; i < 3; i++) {
                const hourNum = baseHour + i;
                const hourStr = String(hourNum).padStart(2, '0') + ':00';
                const fullDateTime = `${targetDateStr}T${hourStr}`;

                if (fullDateTime === currentDateTimeStr) {
                    isCurrentBlock = true;
                }

                const index = hourlyTime.indexOf(fullDateTime);
                if (index !== -1 && hourlyValues[index] != null) {
                    if (hourlyValues[index] > maxBlock) {
                        maxBlock = hourlyValues[index];
                    }
                }
            }

            const rowDiv = document.createElement('div');
            rowDiv.className = `modal-row-div ${bgClass}`;

            if (isCurrentBlock) {
                rowDiv.classList.add('current-hour-highlight');
            }

            const timeDiv = document.createElement('div');
            timeDiv.className = 'modal-row-time-div';
            timeDiv.textContent = targetHour;

            const valDiv = document.createElement('div');
            valDiv.className = 'modal-row-value-div';
            valDiv.textContent = `${Math.round(maxBlock)}${unit}`;

            rowDiv.appendChild(timeDiv);
            rowDiv.appendChild(valDiv);
            modalBody.appendChild(rowDiv);
        });
    }

    modalOverlay.style.display = 'flex';
}