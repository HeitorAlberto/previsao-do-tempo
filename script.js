let weatherData = null;
let currentCoords = { lat: -23.5475, lon: -46.6361, name: "São Paulo, Brasil" };

// Referências de elementos do DOM
const searchInput = document.getElementById('city-search');
const suggestionsList = document.getElementById('suggestions');
const cityDisplay = document.getElementById('city-display');

// ==========================================
// 1. GERENCIAMENTO DE MODAIS E HISTÓRICO
// ==========================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'flex';
}

function closeModal(e, modalId) {
    if (e && e.stopPropagation) e.stopPropagation();
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

function getSearchHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('weather_search_history'));
        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

function saveToSearchHistory(cityObj) {
    let history = getSearchHistory();
    history = history.filter(item => item.name !== cityObj.name);
    history.unshift(cityObj);
    if (history.length > 3) history = history.slice(0, 3);
    
    localStorage.setItem('weather_search_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const historyContainer = document.getElementById('history-container');
    if (!historyContainer) return;

    const history = getSearchHistory();
    if (history.length === 0) {
        historyContainer.innerHTML = '';
        return;
    }

    historyContainer.innerHTML = history.map(item => `
        <div class="history-chip" onclick="selectHistoryCity(${item.lat}, ${item.lon}, '${item.name.replace(/'/g, "\\'")}')">
            ${item.name}
        </div>
    `).join('');
}

function selectHistoryCity(lat, lon, name) {
    currentCoords = { lat, lon, name };
    if (cityDisplay) cityDisplay.textContent = name;
    if (searchInput) searchInput.value = '';
    if (suggestionsList) suggestionsList.innerHTML = '';
    fetchWeatherData();
    saveToSearchHistory(currentCoords);
}

// ==========================================
// 2. BUSCA DE MUNICÍPIOS (GEOCODING API)
// ==========================================

if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
        const query = e.target.value.trim();
        if (query.length < 3) {
            if (suggestionsList) suggestionsList.innerHTML = '';
            return;
        }

        try {
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt`);
            const data = await res.json();

            if (!suggestionsList) return;
            suggestionsList.innerHTML = '';

            if (data.results && Array.isArray(data.results)) {
                const fragment = document.createDocumentFragment();

                data.results.forEach(city => {
                    const li = document.createElement('li');
                    const label = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''} (${city.country})`;
                    li.textContent = label;
                    li.onclick = () => {
                        currentCoords = { lat: city.latitude, lon: city.longitude, name: label };
                        if (cityDisplay) cityDisplay.textContent = label;
                        searchInput.value = '';
                        suggestionsList.innerHTML = '';
                        saveToSearchHistory(currentCoords);
                        fetchWeatherData();
                    };
                    fragment.appendChild(li);
                });

                suggestionsList.appendChild(fragment);
            }
        } catch (err) {
            console.error("Erro na busca de locais:", err);
        }
    });
}

// ==========================================
// 3. ESTRUTURAÇÃO DE DATAS E TRATAMENTO
// ==========================================

function getDaysMap() {
    if (!weatherData || !weatherData.hourly || !weatherData.hourly.time) return {};

    const daysMap = {};
    weatherData.hourly.time.forEach((timeStr, idx) => {
        const dateStr = timeStr.split('T')[0];
        if (!daysMap[dateStr]) daysMap[dateStr] = [];
        daysMap[dateStr].push(idx);
    });

    return daysMap;
}

function get6HourBlockKey(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = date.getHours();
    const blockHour = String(Math.floor(hour / 6) * 6).padStart(2, '0');
    return `${year}-${month}-${day}_${blockHour}h`;
}

// ==========================================
// 4. MÉTRICAS E PROCESSAMENTO CLIMÁTICO
// ==========================================

function getCloudCategory(percentage) {
    if (percentage <= 20) return { label: 'Poucas nuvens', severity: 1 };
    if (percentage <= 60) return { label: 'Parcialmente Nublado', severity: 2 };
    if (percentage <= 80) return { label: 'Muitas nuvens', severity: 3 };
    return { label: 'Nublado', severity: 4 };
}

function getDailyCloudSummary(hourly, indices) {
    const times = hourly.time;
    const clouds = hourly.cloud_cover;
    if (!clouds) return 'Sem dados de nebulosidade';

    const daytimeReadings = [];
    indices.forEach(idx => {
        const hour = parseInt(times[idx].split('T')[1].split(':')[0], 10);
        if (hour >= 6 && hour <= 18 && hour % 3 === 0) {
            const val = clouds[idx];
            if (typeof val === 'number' && !isNaN(val)) {
                daytimeReadings.push(val);
            }
        }
    });

    if (!daytimeReadings.length) return 'Sem dados de nebulosidade';

    const categoryCounts = {};
    let maxSeverityCat = null;

    daytimeReadings.forEach(val => {
        const cat = getCloudCategory(val);
        const label = cat.label;

        if (!categoryCounts[label]) {
            categoryCounts[label] = { count: 0, severity: cat.severity, label: label };
        }
        categoryCounts[label].count += 1;

        if (!maxSeverityCat || cat.severity > maxSeverityCat.severity) {
            maxSeverityCat = categoryCounts[label];
        }
    });

    if (maxSeverityCat && maxSeverityCat.count >= 3) {
        return maxSeverityCat.label;
    }

    const modeCat = Object.values(categoryCounts).reduce((prev, curr) => 
        (curr.count > prev.count) ? curr : prev
    );

    return modeCat.label;
}

function getBaseValues(hourly, indices) {
    const dayTemps = indices.map(idx => hourly.temperature_2m?.[idx]).filter(v => typeof v === 'number' && !isNaN(v));
    const dayPrecip = indices.map(idx => hourly.precipitation?.[idx]).filter(v => typeof v === 'number' && !isNaN(v));
    const dayWind = indices.map(idx => hourly.wind_gusts_10m?.[idx]).filter(v => typeof v === 'number' && !isNaN(v));

    const minTemp = dayTemps.length ? Math.round(Math.min(...dayTemps)) : 0;
    const maxTemp = dayTemps.length ? Math.round(Math.max(...dayTemps)) : 0;
    const totalPrecip = dayPrecip.length ? dayPrecip.reduce((acc, v) => acc + v, 0).toFixed(1) : '0.0';
    const maxWind = dayWind.length ? Math.round(Math.max(...dayWind)) : 0;

    return {
        temp: `${minTemp}° a ${maxTemp}°`,
        precip: `${totalPrecip} mm`,
        wind: `${maxWind} km/h`
    };
}

function get6HourBreakdown(hourly, indices, metricType) {
    const times = hourly.time;
    const keyMap = {
        'temp': 'temperature_2m',
        'precip': 'precipitation',
        'wind': 'wind_gusts_10m',
        'cloud': 'cloud_cover'
    };
    const metricKey = keyMap[metricType];
    
    const blocks = {
        'Madrugada': [],
        'Manhã': [],
        'Tarde': [],
        'Noite': []
    };

    indices.forEach(idx => {
        const timeStr = times[idx];
        const hour = parseInt(timeStr.split('T')[1].split(':')[0], 10);
        const val = hourly[metricKey]?.[idx];

        if (typeof val === 'number' && !isNaN(val)) {
            const item = { time: timeStr, val: val, index: idx };
            if (hour >= 0 && hour < 6) blocks['Madrugada'].push(item);
            else if (hour >= 6 && hour < 12) blocks['Manhã'].push(item);
            else if (hour >= 12 && hour < 18) blocks['Tarde'].push(item);
            else if (hour >= 18 && hour < 24) blocks['Noite'].push(item);
        }
    });

    return blocks;
}

// ==========================================
// 5. CÁLCULO DE INSIGHTS E THRESHOLDS
// ==========================================

function calcThresholds(hourly, indices, minAgreementCount = 13) {
    const tempKeys = Object.keys(hourly).filter(k => k.startsWith('temperature_2m'));
    const precipKeys = Object.keys(hourly).filter(k => k.startsWith('precipitation'));
    const windKeys = Object.keys(hourly).filter(k => k.startsWith('wind_gusts_10m'));

    let rawInsights = [];

    const getValidValues = (key) => indices
        .map(idx => hourly[key][idx])
        .filter(v => v !== null && v !== undefined && !isNaN(v) && typeof v === 'number');

    const getRobustMax = (arr) => {
        if (!arr.length) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        
        if (sorted.length < 5) {
            return sorted[sorted.length - 1];
        }

        const p90Index = Math.ceil(sorted.length * 0.90) - 1;
        return sorted[p90Index];
    };

    if (tempKeys.length > 0) {
        const tempMaxes = tempKeys.map(k => {
            const vals = getValidValues(k);
            return vals.length > 0 ? Math.max(...vals) : null;
        }).filter(v => v !== null);

        const tempMins = tempKeys.map(k => {
            const vals = getValidValues(k);
            return vals.length > 0 ? Math.min(...vals) : null;
        }).filter(v => v !== null);

        const tempRanges = [
            { min: 40, labelFn: (val) => `Possibilidade de temperaturas de até ${val}°`, severity: 3, isMax: true },
            { min: 35, max: 40, labelFn: (val) => `Possibilidade de temperaturas de até ${val}°`, severity: 2, isMax: true },
            { max: 0, labelFn: (val) => `Possibilidade de temperaturas negativas`, severity: 3, isMax: false },
            { min: 0, max: 5, labelFn: (val) => `Possibilidade de temperaturas de até ${val}°`, severity: 2, isMax: false }
        ];

        let matchedTemp = [];
        tempRanges.forEach(range => {
            const dataset = range.isMax ? tempMaxes : tempMins;
            const matchingValues = dataset.filter(val => 
                range.min !== undefined && range.max !== undefined ? (val >= range.min && val < range.max) :
                range.min !== undefined ? (val >= range.min) : (val <= range.max)
            );
            
            if (matchingValues.length >= minAgreementCount) {
                const maxVal = Math.round(getRobustMax(matchingValues));

                matchedTemp.push({
                    severity: range.severity,
                    text: range.labelFn(maxVal),
                    type: 'temp'
                });
            }
        });

        if (matchedTemp.length > 0) {
            matchedTemp.sort((a, b) => b.severity - a.severity);
            rawInsights.push(matchedTemp[0]);
        }
    }

    if (precipKeys.length > 0) {
        const precipTotals = precipKeys.map(k => {
            const vals = getValidValues(k);
            return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : 0;
        });

        const precipRanges = [
            { min: 50, severity: 5 },
            { min: 30, max: 50, severity: 4 },
            { min: 20, max: 30, severity: 3 },
            { min: 10, max: 20, severity: 2 },
            { min: 5, max: 10, severity: 1 }
        ];

        let matchedPrecip = [];
        precipRanges.forEach(range => {
            const matchingValues = precipTotals.filter(val => range.max ? (val >= range.min && val < range.max) : (val >= range.min));
            if (matchingValues.length >= minAgreementCount) {
                const maxVal = getRobustMax(matchingValues).toFixed(1);

                matchedPrecip.push({
                    severity: range.severity,
                    text: `Possibilidade de chuva acumulada de até ${maxVal} mm`,
                    type: 'precip'
                });
            }
        });

        if (matchedPrecip.length > 0) {
            matchedPrecip.sort((a, b) => b.severity - a.severity);
            rawInsights.push(matchedPrecip[0]);
        }
    }

    if (windKeys.length > 0) {
        const windMaxes = windKeys.map(k => {
            const vals = getValidValues(k);
            return vals.length > 0 ? Math.max(...vals) : 0;
        });

        const windRanges = [
            { min: 100, severity: 4 },
            { min: 80, max: 100, severity: 3 },
            { min: 60, max: 80, severity: 2 },
            { min: 40, max: 60, severity: 1 }
        ];

        let matchedWind = [];
        windRanges.forEach(range => {
            const matchingValues = windMaxes.filter(val => range.max ? (val >= range.min && val < range.max) : (val >= range.min));
            if (matchingValues.length >= minAgreementCount) {
                const maxVal = Math.round(getRobustMax(matchingValues));

                matchedWind.push({
                    severity: range.severity,
                    text: `Possibilidade de rajadas de vento de até ${maxVal} km/h`,
                    type: 'wind'
                });
            }
        });

        if (matchedWind.length > 0) {
            matchedWind.sort((a, b) => b.severity - a.severity);
            rawInsights.push(matchedWind[0]);
        }
    }

    return rawInsights;
}

// ==========================================
// 6. REQUISIÇÕES E RENDERIZAÇÃO DE UI
// ==========================================

async function fetchWeatherData() {
    const { lat, lon } = currentCoords;
    const now = Date.now();
    const currentBlockKey = get6HourBlockKey(now);
    const cacheKey = `weather_cache_${lat.toFixed(4)}_${lon.toFixed(4)}_${currentBlockKey}`;

    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
        try {
            weatherData = JSON.parse(cachedData);
            renderCards();
            return;
        } catch {
            localStorage.removeItem(cacheKey);
        }
    }

    const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation,wind_gusts_10m,cloud_cover&models=ecmwf_ifs025&forecast_days=15&timezone=auto`;

    try {
        const response = await fetch(url);
        weatherData = await response.json();

        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('weather_cache_')) {
                localStorage.removeItem(key);
            }
        });

        localStorage.setItem(cacheKey, JSON.stringify(weatherData));
        renderCards();
    } catch (error) {
        console.error("Erro ao buscar dados meteorológicos:", error);
    }
}

function openDetailModal(type, dateLabel, dateStr) {
    const daysMap = getDaysMap();
    const indices = daysMap[dateStr];
    if (!indices || !weatherData || !weatherData.hourly) return;

    const hourly = weatherData.hourly;
    const rawBlocks = get6HourBreakdown(hourly, indices, type);

    let metricTitle = '';
    let formatFn = null;

    if (type === 'precip') {
        metricTitle = 'CHUVA ACUMULADA';
        formatFn = (items) => {
            const sum = items.reduce((acc, item) => acc + item.val, 0);
            return `${sum.toFixed(1)} mm`;
        };
    } else if (type === 'temp') {
        metricTitle = 'TEMPERATURA';
        formatFn = (items) => {
            if (!items.length) return '--';
            
            let maxObj = items[0], minObj = items[0];
            items.forEach(item => {
                if (item.val > maxObj.val) maxObj = item;
                if (item.val < minObj.val) minObj = item;
            });

            const minRounded = Math.round(minObj.val);
            const maxRounded = Math.round(maxObj.val);

            // EVITA REPETIÇÃO: Se as temperaturas forem iguais, exibe apenas um valor (ex: "22°")
            if (minRounded === maxRounded) {
                return `${maxRounded}°`;
            }

            if (maxObj.index < minObj.index) {
                return `${maxRounded}° a ${minRounded}°`;
            } else {
                return `${minRounded}° a ${maxRounded}°`;
            }
        };
    } else if (type === 'wind') {
        metricTitle = 'RAJADAS DE VENTO';
        formatFn = (items) => {
            if (!items.length) return '--';
            const maxVal = Math.max(...items.map(i => i.val));
            return `${Math.round(maxVal)} km/h`;
        };
    } else if (type === 'cloud') {
        metricTitle = 'NEBULOSIDADE';
        formatFn = (items) => {
            if (!items.length) return '--';
            const avg = items.reduce((acc, item) => acc + item.val, 0) / items.length;
            const cat = getCloudCategory(avg);
            return `${cat.label}`;
        };
    }

    const modalTitle = document.getElementById('detail-modal-title');
    const modalBody = document.getElementById('detail-modal-body');

    if (modalTitle) modalTitle.textContent = dateLabel.toUpperCase();
    
    let html = `
        <div style="font-weight: 700; color: #3c4043; margin-bottom: 8px; text-transform: uppercase; font-size: 0.9rem;">${metricTitle}</div>
        <div class="detail-blocks-container">
    `;

    Object.entries(rawBlocks).forEach(([interval, items]) => {
        html += `
            <div class="base-metric-box ${type}">
                <span class="metric-title">${interval}</span>
                <span class="metric-value">${formatFn(items)}</span>
            </div>
        `;
    });

    html += `</div>`;

    if (modalBody) modalBody.innerHTML = html;
    openModal('detail-modal');
}

function renderCards() {
    if (!weatherData || !weatherData.hourly) return;

    const container = document.getElementById('cards-container');
    if (!container) return;

    const hourly = weatherData.hourly;
    const daysMap = getDaysMap();
    const dayKeys = Object.keys(daysMap);

    const fragment = document.createDocumentFragment();

    dayKeys.forEach((dateStr, dayIdx) => {
        const dayIndices = daysMap[dateStr];

        const baseValues = getBaseValues(hourly, dayIndices);
        const cloudSummary = getDailyCloudSummary(hourly, dayIndices);
        const insights = calcThresholds(hourly, dayIndices, 13);

        const [year, month, day] = dateStr.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day);
        const formattedDate = dateObj.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });

        let insightsHtml = '';
        if (insights.length > 0) {
            insightsHtml = insights.map(item => `
                <div class="insight-item">
                    <span class="insight-badge ${item.type}">${item.text}</span>
                </div>
            `).join('');
        } else {
            insightsHtml = `<div class="no-insights">Sem alertas de chuva expressiva, ventos fortes ou extremos de temperatura.</div>`;
        }

        const isDetailable = dayIdx < 5;
        const clickableClass = isDetailable ? 'clickable' : '';

        const card = document.createElement('div');
        card.className = 'card';

        card.innerHTML = `
            <div class="card-header">(${dayIdx + 1}) ${formattedDate.toUpperCase()}</div>
            <div class="card-body">
                <div class="base-metrics-container">
                    <div class="base-metric-box cloud ${clickableClass}" ${isDetailable ? `onclick="openDetailModal('cloud', '${formattedDate}', '${dateStr}')"` : ''}>
                        <span class="metric-value">${cloudSummary}</span>
                    </div>
                    <div class="base-metric-box temp ${clickableClass}" ${isDetailable ? `onclick="openDetailModal('temp', '${formattedDate}', '${dateStr}')"` : ''}>
                        <span class="metric-title">Temperatura</span>
                        <span class="metric-value">${baseValues.temp}</span>
                    </div>
                    <div class="base-metric-box precip ${clickableClass}" ${isDetailable ? `onclick="openDetailModal('precip', '${formattedDate}', '${dateStr}')"` : ''}>
                        <span class="metric-title">Chuva acumulada</span>
                        <span class="metric-value">${baseValues.precip}</span>
                    </div>
                    <div class="base-metric-box wind ${clickableClass}" ${isDetailable ? `onclick="openDetailModal('wind', '${formattedDate}', '${dateStr}')"` : ''}>
                        <span class="metric-title">Rajadas de Vento</span>
                        <span class="metric-value">${baseValues.wind}</span>
                    </div>
                    ${isDetailable ? `
                        <div class="card-footer-notice">
                            Clique em um dos cards acima para detalhes.
                        </div>
                    ` : ''}
                </div>
                <div class="ensemble-insights-container">
                    <div class="ensemble-title">
                        Visão do ensemble
                        <button class="info-btn" onclick="openModal('info-modal')">i</button>
                    </div>
                    <div class="insights-list">
                        ${insightsHtml}
                    </div>
                </div>
            </div>
        `;

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderHistory();
    fetchWeatherData();
});