let weatherData = null;
let currentCoords = {
    lat: -23.5475,
    lon: -46.6361,
    name: "São Paulo, Brasil"
};

const CACHE_VERSION = 'v3';

// ==========================================
// REFERÊNCIAS DE ELEMENTOS DO DOM
// ==========================================

const searchInput = document.getElementById('city-search');
const suggestionsList = document.getElementById('suggestions');
const cityDisplay = document.getElementById('city-display');

// ==========================================
// 1. GERENCIAMENTO DE MODAIS E HISTÓRICO
// ==========================================

function openModal(modalId) {
    const modal = document.getElementById(modalId);

    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeModal(e, modalId) {
    if (e && e.stopPropagation) {
        e.stopPropagation();
    }

    const modal = document.getElementById(modalId);

    if (modal) {
        modal.style.display = 'none';
    }
}

function getSearchHistory() {
    try {
        const history = JSON.parse(
            localStorage.getItem('weather_search_history')
        );

        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

function saveToSearchHistory(cityObj) {
    let history = getSearchHistory();

    history = history.filter(
        item =>
            item.name !== cityObj.name ||
            item.lat !== cityObj.lat ||
            item.lon !== cityObj.lon
    );

    history.unshift(cityObj);

    if (history.length > 3) {
        history = history.slice(0, 3);
    }

    localStorage.setItem(
        'weather_search_history',
        JSON.stringify(history)
    );

    renderHistory();
}

function renderHistory() {
    const historyContainer =
        document.getElementById('history-container');

    if (!historyContainer) {
        return;
    }

    const history = getSearchHistory();

    if (history.length === 0) {
        historyContainer.innerHTML = '';
        return;
    }

    historyContainer.innerHTML = history
        .map(item => `
            <div
                class="history-chip"
                onclick="selectHistoryCity(
                    ${item.lat},
                    ${item.lon},
                    '${item.name.replace(/'/g, "\\'")}'
                )"
            >
                ${item.name}
            </div>
        `)
        .join('');
}

function selectHistoryCity(lat, lon, name) {
    currentCoords = {
        lat,
        lon,
        name
    };

    if (cityDisplay) {
        cityDisplay.textContent = name;
    }

    if (searchInput) {
        searchInput.value = '';
    }

    if (suggestionsList) {
        suggestionsList.innerHTML = '';
    }

    fetchWeatherData();

    saveToSearchHistory(currentCoords);
}

// ==========================================
// 2. BUSCA DE MUNICÍPIOS
// ==========================================

if (searchInput) {
    searchInput.addEventListener('input', async e => {
        const query = e.target.value.trim();

        if (query.length < 3) {
            if (suggestionsList) {
                suggestionsList.innerHTML = '';
            }

            return;
        }

        try {
            const res = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt`
            );

            if (!res.ok) {
                throw new Error(
                    `Erro HTTP ${res.status}`
                );
            }

            const data = await res.json();

            if (!suggestionsList) {
                return;
            }

            suggestionsList.innerHTML = '';

            if (
                data.results &&
                Array.isArray(data.results)
            ) {
                const fragment =
                    document.createDocumentFragment();

                data.results.forEach(city => {
                    const li =
                        document.createElement('li');

                    const label =
                        `${city.name}` +
                        `${city.admin1 ? ', ' + city.admin1 : ''}` +
                        ` (${city.country})`;

                    li.textContent = label;

                    li.onclick = () => {
                        currentCoords = {
                            lat: city.latitude,
                            lon: city.longitude,
                            name: label
                        };

                        if (cityDisplay) {
                            cityDisplay.textContent = label;
                        }

                        searchInput.value = '';

                        suggestionsList.innerHTML = '';

                        saveToSearchHistory(
                            currentCoords
                        );

                        fetchWeatherData();
                    };

                    fragment.appendChild(li);
                });

                suggestionsList.appendChild(fragment);
            }
        } catch (err) {
            console.error(
                "Erro na busca de locais:",
                err
            );
        }
    });
}

// ==========================================
// 3. ESTRUTURAÇÃO DE DATAS
// ==========================================

function getDaysMap() {
    if (
        !weatherData ||
        !weatherData.hourly ||
        !weatherData.hourly.time
    ) {
        return {};
    }

    const daysMap = {};

    weatherData.hourly.time.forEach(
        (timeStr, idx) => {
            const dateStr =
                timeStr.split('T')[0];

            if (!daysMap[dateStr]) {
                daysMap[dateStr] = [];
            }

            daysMap[dateStr].push(idx);
        }
    );

    return daysMap;
}

// ==========================================
// 4. BLOCO DE 6 HORAS
// ==========================================

function get6HourBlockKey(
    date = new Date(),
    timezone = null
) {
    let year;
    let month;
    let day;
    let hour;

    if (timezone) {
        const parts =
            new Intl.DateTimeFormat(
                'en-US',
                {
                    timeZone: timezone,
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    hourCycle: 'h23'
                }
            ).formatToParts(date);

        const getPart = type => {
            const part = parts.find(
                p => p.type === type
            );

            return part ? part.value : null;
        };

        year = getPart('year');
        month = getPart('month');
        day = getPart('day');
        hour = Number(getPart('hour'));
    } else {
        year = date.getFullYear();

        month = String(
            date.getMonth() + 1
        ).padStart(2, '0');

        day = String(
            date.getDate()
        ).padStart(2, '0');

        hour = date.getHours();
    }

    const blockHour =
        String(
            Math.floor(hour / 6) * 6
        ).padStart(2, '0');

    return `${year}-${month}-${day}_${blockHour}h`;
}

// ==========================================
// 5. MÉTRICAS CLIMÁTICAS E TROVOADAS
// ==========================================

function isThunderCode(code) {
    // Códigos WMO da Open-Meteo para Trovoada: 95, 96, 99
    return [95, 96, 99].includes(Math.round(code));
}

function getCloudCategory(percentage) {
    if (percentage <= 20) {
        return {
            label: 'Poucas nuvens',
            severity: 1
        };
    }

    if (percentage <= 60) {
        return {
            label: 'Parcialmente Nublado',
            severity: 2
        };
    }

    if (percentage <= 80) {
        return {
            label: 'Muitas nuvens',
            severity: 3
        };
    }

    return {
        label: 'Nublado',
        severity: 4
    };
}

function getDailyCloudSummary(hourly, indices) {
    const times = hourly.time;
    const clouds = hourly.cloud_cover;
    const codes = hourly.weather_code || [];

    if (!clouds) {
        return 'Sem dados de nebulosidade';
    }

    const daytimeReadings = [];
    let hasThunder = false;

    indices.forEach(idx => {
        const hour =
            parseInt(
                times[idx]
                    .split('T')[1]
                    .split(':')[0],
                10
            );

        if (codes[idx] && isThunderCode(codes[idx])) {
            hasThunder = true;
        }

        if (
            hour >= 6 &&
            hour <= 18 &&
            hour % 3 === 0
        ) {
            const val = clouds[idx];

            if (
                typeof val === 'number' &&
                !isNaN(val)
            ) {
                daytimeReadings.push(val);
            }
        }
    });

    if (!daytimeReadings.length) {
        return 'Sem dados de nebulosidade';
    }

    const categoryCounts = {};
    let maxSeverityCat = null;

    daytimeReadings.forEach(val => {
        const cat = getCloudCategory(val);
        const label = cat.label;

        if (!categoryCounts[label]) {
            categoryCounts[label] = {
                count: 0,
                severity: cat.severity,
                label
            };
        }

        categoryCounts[label].count += 1;

        if (
            !maxSeverityCat ||
            cat.severity >
                maxSeverityCat.severity
        ) {
            maxSeverityCat =
                categoryCounts[label];
        }
    });

    let finalLabel = '';

    if (
        maxSeverityCat &&
        maxSeverityCat.count >= 3
    ) {
        finalLabel = maxSeverityCat.label;
    } else {
        const modeCat =
            Object.values(categoryCounts).reduce(
                (prev, curr) =>
                    curr.count > prev.count
                        ? curr
                        : prev
            );
        finalLabel = modeCat.label;
    }

    return hasThunder ? `${finalLabel}⚡ ` : finalLabel;
}

function getBaseValues(hourly, indices) {
    const dayTemps = indices
        .map(
            idx =>
                hourly.temperature_2m?.[idx]
        )
        .filter(
            v =>
                typeof v === 'number' &&
                !isNaN(v)
        );

    const dayPrecip = indices
        .map(
            idx =>
                hourly.precipitation?.[idx]
        )
        .filter(
            v =>
                typeof v === 'number' &&
                !isNaN(v)
        );

    const dayWind = indices
        .map(
            idx =>
                hourly.wind_gusts_10m?.[idx]
        )
        .filter(
            v =>
                typeof v === 'number' &&
                !isNaN(v)
        );

    const minTemp =
        dayTemps.length
            ? Math.round(
                  Math.min(...dayTemps)
              )
            : 0;

    const maxTemp =
        dayTemps.length
            ? Math.round(
                  Math.max(...dayTemps)
              )
            : 0;

    const totalPrecip =
        dayPrecip.length
            ? dayPrecip
                  .reduce(
                      (acc, v) => acc + v,
                      0
                  )
                  .toFixed(1)
            : '0.0';

    const maxWind =
        dayWind.length
            ? Math.round(
                  Math.max(...dayWind)
              )
            : 0;

    return {
        temp: `${minTemp}° a ${maxTemp}°`,
        precip: `${totalPrecip} mm`,
        wind: `${maxWind} km/h`
    };
}

function get6HourBreakdown(
    hourly,
    indices,
    metricType
) {
    const times = hourly.time;

    const keyMap = {
        temp: 'temperature_2m',
        precip: 'precipitation',
        wind: 'wind_gusts_10m',
        cloud: 'cloud_cover'
    };

    const metricKey = keyMap[metricType];
    const codes = hourly.weather_code || [];

    const blocks = {
        Madrugada: [],
        Manhã: [],
        Tarde: [],
        Noite: []
    };

    indices.forEach(idx => {
        const timeStr = times[idx];

        const hour =
            parseInt(
                timeStr
                    .split('T')[1]
                    .split(':')[0],
                10
            );

        const val = hourly[metricKey]?.[idx];
        const weatherCode = codes[idx] || 0;

        if (
            typeof val !== 'number' ||
            isNaN(val)
        ) {
            return;
        }

        const item = {
            time: timeStr,
            hour,
            val,
            weatherCode,
            index: idx
        };

        if (hour >= 0 && hour < 6) {
            blocks.Madrugada.push(item);
        } else if (
            hour >= 6 &&
            hour < 12
        ) {
            blocks.Manhã.push(item);
        } else if (
            hour >= 12 &&
            hour < 18
        ) {
            blocks.Tarde.push(item);
        } else if (
            hour >= 18 &&
            hour < 24
        ) {
            blocks.Noite.push(item);
        }
    });

    return blocks;
}

// ==========================================
// 6. PROCESSAMENTO ESTATÍSTICO (ENSEMBLE)
// ==========================================

function getConsensusCluster(values, tolerance) {
    if (!values || values.length === 0) return [];

    const clusters = [];
    values.forEach(val => {
        let placed = false;
        for (const cluster of clusters) {
            const mean = cluster.reduce((a, b) => a + b, 0) / cluster.length;
            if (Math.abs(val - mean) <= tolerance) {
                cluster.push(val);
                placed = true;
                break;
            }
        }
        if (!placed) clusters.push([val]);
    });

    clusters.sort((a, b) => b.length - a.length);
    return clusters[0];
}

function processEnsembleVariable(hourlyData, baseVariableName) {
    const memberKeys = Object.keys(hourlyData).filter(key =>
        key.startsWith(`${baseVariableName}_member`) || key === baseVariableName
    );

    if (memberKeys.length === 0) return [];

    const totalTimeSteps = hourlyData.time.length;
    const processedValues = [];

    let tolerance = 1.0;
    if (baseVariableName === 'temperature_2m') tolerance = 1.5;
    if (baseVariableName === 'precipitation') tolerance = 0.5;
    if (baseVariableName === 'wind_gusts_10m') tolerance = 3.0;
    if (baseVariableName === 'cloud_cover') tolerance = 15.0;

    for (let i = 0; i < totalTimeSteps; i++) {
        const stepValues = memberKeys
            .map(key => hourlyData[key]?.[i])
            .filter(val => val !== null && val !== undefined);

        if (stepValues.length === 0) {
            processedValues.push(0);
            continue;
        }

        // 1. WEATHER_CODE / TROVOADAS: Pega o maior código (não ignora alertas)
        if (baseVariableName === 'weather_code') {
            const maxCode = Math.max(...stepValues);
            processedValues.push(maxCode);
            continue;
        }

        // 2. PRECIPITAÇÃO: Percentil 75 (não apaga o sinal de tempestade)
        if (baseVariableName === 'precipitation') {
            const sortedPrecip = [...stepValues].sort((a, b) => a - b);
            const p75Index = Math.floor(sortedPrecip.length * 0.75);
            const precipVal = sortedPrecip[p75Index] || 0;
            processedValues.push(Number(precipVal.toFixed(2)));
            continue;
        }

        // 3. VENTO: Percentil 90 do Cluster (captura o pico real de rajadas)
        if (baseVariableName === 'wind_gusts_10m') {
            const consensusCluster = getConsensusCluster(stepValues, tolerance);
            const sortedWind = [...consensusCluster].sort((a, b) => a - b);
            const p90Index = Math.min(
                Math.floor(sortedWind.length * 0.90),
                sortedWind.length - 1
            );
            const windVal = sortedWind[p90Index] || 0;
            processedValues.push(Number(windVal.toFixed(2)));
            continue;
        }

        // 4. TEMPERATURA E NEBULOSIDADE: Consensus Cluster + Mediana
        const consensusCluster = getConsensusCluster(stepValues, tolerance);
        const sortedCluster = [...consensusCluster].sort((a, b) => a - b);
        const mid = Math.floor(sortedCluster.length / 2);
        const consensusValue = sortedCluster.length % 2 !== 0
            ? sortedCluster[mid]
            : (sortedCluster[mid - 1] + sortedCluster[mid]) / 2;

        processedValues.push(Number(consensusValue.toFixed(2)));
    }

    return processedValues;
}

function processWeatherData(data) {
    if (!data || !data.hourly) return data;

    const targetVariables = [
        'temperature_2m',
        'precipitation',
        'wind_gusts_10m',
        'cloud_cover',
        'weather_code'
    ];

    const consolidatedHourly = { time: data.hourly.time };

    targetVariables.forEach(variable => {
        consolidatedHourly[variable] = processEnsembleVariable(data.hourly, variable);
    });

    data.hourly = consolidatedHourly;
    return data;
}

// ==========================================
// 7. CACHE + REQUISIÇÃO METEOROLÓGICA
// ==========================================

async function fetchWeatherData() {
    const { lat, lon } = currentCoords;

    const coordinatePrefix =
        `${CACHE_VERSION}_weather_${lat.toFixed(4)}_${lon.toFixed(4)}_`;

    const now = new Date();

    let cachedData = null;

    Object.keys(localStorage).forEach(key => {
        if (!key.startsWith(coordinatePrefix)) {
            return;
        }

        try {
            const raw =
                localStorage.getItem(key);

            if (!raw) {
                return;
            }

            const data =
                JSON.parse(raw);

            if (
                !data ||
                !data._cacheTimezone
            ) {
                return;
            }

            const currentBlockKey =
                get6HourBlockKey(
                    now,
                    data._cacheTimezone
                );

            if (
                key.endsWith(
                    `_${currentBlockKey}`
                )
            ) {
                cachedData = data;
            }
        } catch {
            localStorage.removeItem(key);
        }
    });

    if (cachedData) {
        weatherData = cachedData;
        renderCards();
        return;
    }

    const url =
        `https://ensemble-api.open-meteo.com/v1/ensemble` +
        `?latitude=${lat}` +
        `&longitude=${lon}` +
        `&hourly=temperature_2m,precipitation,wind_gusts_10m,cloud_cover,weather_code` +
        `&models=ecmwf_ifs025` +
        `&forecast_days=15` +
        `&timezone=auto`;

    try {
        const response =
            await fetch(url);

        if (!response.ok) {
            throw new Error(
                `Erro HTTP ${response.status}`
            );
        }

        const rawData =
            await response.json();

        const data = processWeatherData(rawData);

        const timezone =
            data.timezone || 'UTC';

        const currentBlockKey =
            get6HourBlockKey(
                now,
                timezone
            );

        const cacheKey =
            `${coordinatePrefix}${currentBlockKey}`;

        data._cacheVersion =
            CACHE_VERSION;

        data._cacheTimezone =
            timezone;

        data._cacheCreatedAt =
            Date.now();

        weatherData = data;

        localStorage.setItem(
            cacheKey,
            JSON.stringify(data)
        );

        renderCards();

    } catch (error) {
        console.error(
            "Erro ao buscar dados meteorológicos:",
            error
        );
    }
}

// ==========================================
// 8. MODAL DE DETALHES (ACORDEÃO E HORÁRIOS)
// ==========================================

function toggleAccordionBlock(blockId) {
    const targetAccordion = document.getElementById(blockId);
    if (!targetAccordion) return;

    const isVisible = targetAccordion.style.display === 'block';

    const allAccordions = document.querySelectorAll('.accordion-content');
    allAccordions.forEach(acc => {
        acc.style.display = 'none';
    });

    if (!isVisible) {
        targetAccordion.style.display = 'block';
    }
}

function formatSingleValue(item, type) {
    const val = item.val;
    const code = item.weatherCode || 0;

    if (type === 'precip') return val.toFixed(1);
    if (type === 'temp') return `${Math.round(val)}°`;
    if (type === 'wind') return Math.round(val);
    if (type === 'cloud') {
        const hasThunder = isThunderCode(code);
        const text = `${Math.round(val)}%`;
        return hasThunder ? `${text} ⚡ ` : text;
    }
    return val;
}

function openDetailModal(
    type,
    dateLabel,
    dateStr
) {
    const daysMap =
        getDaysMap();

    const indices =
        daysMap[dateStr];

    if (
        !indices ||
        !weatherData ||
        !weatherData.hourly
    ) {
        return;
    }

    const hourly =
        weatherData.hourly;

    const rawBlocks =
        get6HourBreakdown(
            hourly,
            indices,
            type
        );

    let metricTitle = '';
    let formatFn = null;

    if (type === 'precip') {
        metricTitle =
            'CHUVA ACUMULADA';

        formatFn = items => {
            const sum =
                items.reduce(
                    (acc, item) =>
                        acc + item.val,
                    0
                );

            return `${sum.toFixed(1)} mm`;
        };

    } else if (type === 'temp') {
        metricTitle =
            'TEMPERATURA';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            let maxObj = items[0];
            let minObj = items[0];

            items.forEach(item => {
                if (
                    item.val >
                    maxObj.val
                ) {
                    maxObj = item;
                }

                if (
                    item.val <
                    minObj.val
                ) {
                    minObj = item;
                }
            });

            const minRounded =
                Math.round(
                    minObj.val
                );

            const maxRounded =
                Math.round(
                    maxObj.val
                );

            if (
                minRounded ===
                maxRounded
            ) {
                return `${maxRounded}°`;
            }

            if (
                maxObj.index <
                minObj.index
            ) {
                return `${maxRounded}° a ${minRounded}°`;
            }

            return `${minRounded}° a ${maxRounded}°`;
        };

    } else if (type === 'wind') {
        metricTitle =
            'RAJADAS DE VENTO';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            const maxVal =
                Math.max(
                    ...items.map(
                        i => i.val
                    )
                );

            return `${Math.round(maxVal)} km/h`;
        };

    } else if (type === 'cloud') {
        metricTitle =
            'NEBULOSIDADE';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            const avg =
                items.reduce(
                    (acc, item) =>
                        acc + item.val,
                    0
                ) / items.length;

            const cat =
                getCloudCategory(avg);

            const hasThunder =
                items.some(
                    i =>
                        isThunderCode(
                            i.weatherCode
                        )
                );

            return hasThunder
                ? ` ${cat.label}⚡`
                : cat.label;
        };
    }

    /*
     * Define a classe de cor
     * para cada valor horário.
     */
    const getValueClass =
        (value, metricType) => {
            const val =
                Number(value);

            if (!Number.isFinite(val)) {
                return '';
            }

            /*
             * NUVENS
             *
             * 0–33%  = cinza claro
             * 34–66% = cinza
             * 67–100% = cinza escuro
             */
            if (metricType === 'cloud') {
                if (val <= 33) {
                    return 'cloud-low';
                }

                if (val <= 66) {
                    return 'cloud-medium';
                }

                return 'cloud-high';
            }

            /*
             * TEMPERATURA
             *
             * <=10  = azul claro
             * <=18  = azul
             * <=24  = verde
             * <=28  = amarelo
             * <=34  = laranja
             * >34   = vermelho
             */
            if (metricType === 'temp') {
                if (val <= 10) {
                    return 'temp-cold';
                }

                if (val <= 18) {
                    return 'temp-cool';
                }

                if (val <= 24) {
                    return 'temp-mild';
                }

                if (val <= 28) {
                    return 'temp-warm';
                }

                if (val <= 34) {
                    return 'temp-hot';
                }

                return 'temp-very-hot';
            }

            /*
             * CHUVA
             *
             * <=1   = azul claro
             * <=5   = azul
             * <=10  = azul escuro
             * >10   = roxo
             */
            if (metricType === 'precip') {
                if (val <= 1) {
                    return 'precip-light';
                }

                if (val <= 5) {
                    return 'precip-moderate';
                }

                if (val <= 10) {
                    return 'precip-heavy';
                }

                return 'precip-extreme';
            }

            /*
             * VENTO
             *
             * <20   = verde claro
             * <40   = verde
             * <60   = amarelo
             * <80   = laranja
             * >=80  = vermelho
             */
            if (metricType === 'wind') {
                if (val < 20) {
                    return 'wind-light';
                }

                if (val < 40) {
                    return 'wind-moderate';
                }

                if (val < 60) {
                    return 'wind-strong';
                }

                if (val < 80) {
                    return 'wind-very-strong';
                }

                return 'wind-extreme';
            }

            return '';
        };

    const modalTitle =
        document.getElementById(
            'detail-modal-title'
        );

    const modalBody =
        document.getElementById(
            'detail-modal-body'
        );

    if (modalTitle) {
        modalTitle.textContent =
            dateLabel.toUpperCase();
    }

    const now =
        new Date();

    const currentYear =
        now.getFullYear();

    const currentMonth =
        String(
            now.getMonth() + 1
        ).padStart(2, '0');

    const currentDay =
        String(
            now.getDate()
        ).padStart(2, '0');

    const todayStr =
        `${currentYear}-${currentMonth}-${currentDay}`;

    const isToday =
        dateStr === todayStr;

    const currentHour =
        now.getHours();

    let html = `
        <div class="detail-metric-title">
            ${metricTitle}
        </div>

        <div class="detail-blocks-container">
    `;

    Object.entries(rawBlocks)
        .forEach(
            ([interval, items], index) => {
                const blockId =
                    `accordion-block-${index}`;

                /*
                 * Somente o período que contém
                 * a hora atual começa aberto.
                 */
                const containsCurrentHour =
                    isToday &&
                    items.some(
                        item =>
                            item.hour ===
                            currentHour
                    );

                const openClass =
                    containsCurrentHour
                        ? 'is-open'
                        : '';

                html += `
                    <div
                        class="base-metric-box ${type} detail-metric-box"
                        onclick="toggleAccordionBlock('${blockId}')"
                    >
                        <span class="metric-title">
                            ${interval}
                        </span>

                        <span class="metric-value">
                            ${formatFn(items)}
                        </span>
                    </div>

                    <div
                        id="${blockId}"
                        class="accordion-content ${openClass}"
                    >
                        <div class="hourly-values-grid">
                            ${items.map(item => {
                                const isCurrentHour =
                                    isToday &&
                                    item.hour ===
                                        currentHour;

                                const valueClass =
                                    getValueClass(
                                        item.val,
                                        type
                                    );

                                const currentHourClass =
                                    isCurrentHour
                                        ? 'current-hour'
                                        : '';

                                return `
                                    <div class="hourly-value-item">
                                        <span
                                            class="hourly-value ${valueClass} ${currentHourClass}"
                                        >
                                            ${formatSingleValue(
                                                item,
                                                type
                                            )}
                                        </span>

                                        <span class="hourly-hour">
                                            ${item.hour}h
                                        </span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }
        );

    html += `
        </div>
    `;

    if (modalBody) {
        modalBody.innerHTML =
            html;
    }

    openModal('detail-modal');
}


function openDetailModal(
    type,
    dateLabel,
    dateStr
) {
    const daysMap =
        getDaysMap();

    const indices =
        daysMap[dateStr];

    if (
        !indices ||
        !weatherData ||
        !weatherData.hourly
    ) {
        return;
    }

    const hourly =
        weatherData.hourly;

    const rawBlocks =
        get6HourBreakdown(
            hourly,
            indices,
            type
        );

    let metricTitle = '';
    let formatFn = null;

    if (type === 'precip') {
        metricTitle =
            'CHUVA ACUMULADA';

        formatFn = items => {
            const sum =
                items.reduce(
                    (acc, item) =>
                        acc + item.val,
                    0
                );

            return `${sum.toFixed(1)} mm`;
        };

    } else if (type === 'temp') {
        metricTitle =
            'TEMPERATURA';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            let maxObj = items[0];
            let minObj = items[0];

            items.forEach(item => {
                if (item.val > maxObj.val) {
                    maxObj = item;
                }

                if (item.val < minObj.val) {
                    minObj = item;
                }
            });

            const minRounded =
                Math.round(minObj.val);

            const maxRounded =
                Math.round(maxObj.val);

            if (
                minRounded ===
                maxRounded
            ) {
                return `${maxRounded}°`;
            }

            if (
                maxObj.index <
                minObj.index
            ) {
                return `${maxRounded}° a ${minRounded}°`;
            }

            return `${minRounded}° a ${maxRounded}°`;
        };

    } else if (type === 'wind') {
        metricTitle =
            'RAJADAS DE VENTO';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            const maxVal =
                Math.max(
                    ...items.map(
                        i => i.val
                    )
                );

            return `${Math.round(maxVal)} km/h`;
        };

    } else if (type === 'cloud') {
        metricTitle =
            'NEBULOSIDADE';

        formatFn = items => {
            if (!items.length) {
                return '--';
            }

            const avg =
                items.reduce(
                    (acc, item) =>
                        acc + item.val,
                    0
                ) / items.length;

            const cat =
                getCloudCategory(avg);

            const hasThunder =
                items.some(
                    i =>
                        isThunderCode(
                            i.weatherCode
                        )
                );

            return hasThunder
                ? `${cat.label}⚡`
                : cat.label;
        };
    }

    /*
     * =========================
     * CORES DOS VALORES
     * =========================
     */

    const getValueClass =
        (value, metricType) => {
            const val =
                Number(value);

            if (!Number.isFinite(val)) {
                return '';
            }

            /*
             * NUVENS
             *
             * 0–33%   = cinza claro
             * 34–66%  = cinza
             * 67–100% = cinza escuro
             */
            if (metricType === 'cloud') {
                if (val <= 33) {
                    return 'cloud-low';
                }

                if (val <= 66) {
                    return 'cloud-medium';
                }

                return 'cloud-high';
            }

            /*
             * TEMPERATURA
             *
             * <=10°C = azul claro
             * <=18°C = azul
             * <=24°C = verde
             * <=28°C = amarelo
             * <=34°C = laranja
             * >34°C  = vermelho
             */
            if (metricType === 'temp') {
                if (val <= 10) {
                    return 'temp-cold';
                }

                if (val <= 18) {
                    return 'temp-cool';
                }

                if (val <= 24) {
                    return 'temp-mild';
                }

                if (val <= 28) {
                    return 'temp-warm';
                }

                if (val <= 34) {
                    return 'temp-hot';
                }

                return 'temp-very-hot';
            }

            /*
             * CHUVA
             *
             * <=1 mm  = azul claro
             * <=5 mm  = azul
             * <=10 mm = azul escuro
             * >10 mm  = roxo
             */
            if (metricType === 'precip') {

                if (val < 0.5) {
                    return 'no-precip';
                }

                if (val <= 1) {
                    return 'precip-light';
                }

                if (val <= 5) {
                    return 'precip-moderate';
                }

                if (val <= 10) {
                    return 'precip-heavy';
                }

                return 'precip-extreme';
            }

            /*
             * VENTO
             *
             * <20 km/h = verde claro
             * <40 km/h = verde
             * <60 km/h = amarelo
             * <80 km/h = laranja
             * >=80     = vermelho
             */
            if (metricType === 'wind') {
                if (val < 20) {
                    return 'wind-light';
                }

                if (val < 40) {
                    return 'wind-moderate';
                }

                if (val < 60) {
                    return 'wind-strong';
                }

                if (val < 80) {
                    return 'wind-very-strong';
                }

                return 'wind-extreme';
            }

            return '';
        };

    /*
     * =========================
     * ELEMENTOS DO MODAL
     * =========================
     */

    const modalTitle =
        document.getElementById(
            'detail-modal-title'
        );

    const modalBody =
        document.getElementById(
            'detail-modal-body'
        );

    if (modalTitle) {
        modalTitle.textContent =
            dateLabel.toUpperCase();
    }

    /*
     * =========================
     * DATA E PERÍODO ATUAL
     * =========================
     */

    const now =
        new Date();

    const currentYear =
        now.getFullYear();

    const currentMonth =
        String(
            now.getMonth() + 1
        ).padStart(2, '0');

    const currentDay =
        String(
            now.getDate()
        ).padStart(2, '0');

    const todayStr =
        `${currentYear}-${currentMonth}-${currentDay}`;

    const isToday =
        dateStr === todayStr;

    const currentHour =
        now.getHours();

    /*
     * Determina o período atual:
     *
     * 00–05 = madrugada
     * 06–11 = manhã
     * 12–17 = tarde
     * 18–23 = noite
     */
    const getCurrentPeriod =
        hour => {
            if (
                hour >= 0 &&
                hour < 6
            ) {
                return 'madrugada';
            }

            if (
                hour >= 6 &&
                hour < 12
            ) {
                return 'manha';
            }

            if (
                hour >= 12 &&
                hour < 18
            ) {
                return 'tarde';
            }

            return 'noite';
        };

    const currentPeriod =
        getCurrentPeriod(
            currentHour
        );

    /*
     * =========================
     * HTML
     * =========================
     */

    let html = `
        <div class="detail-metric-title">
            ${metricTitle}
        </div>

        <div class="detail-blocks-container">
    `;

    Object.entries(rawBlocks)
        .forEach(
            ([interval, items], index) => {
                const blockId =
                    `accordion-block-${index}`;

                /*
                 * Identifica o período pelo
                 * primeiro horário do bloco.
                 */
                const firstItemHour =
                    items.length
                        ? Number(
                              items[0].hour
                          )
                        : null;

                const blockPeriod =
                    firstItemHour !== null
                        ? getCurrentPeriod(
                              firstItemHour
                          )
                        : null;

                /*
                 * Somente o período atual,
                 * quando estamos visualizando
                 * hoje, começa aberto.
                 */
                const containsCurrentPeriod =
                    isToday &&
                    blockPeriod ===
                        currentPeriod;

                const openClass =
                    containsCurrentPeriod
                        ? 'is-open'
                        : '';

                html += `
                    <div
                        class="base-metric-box ${type} detail-metric-box"
                        onclick="
                            this.nextElementSibling
                                .classList
                                .toggle('is-open')
                        "
                    >
                        <span class="metric-title">
                            ${interval}
                        </span>

                        <span class="metric-value">
                            ${formatFn(items)}
                        </span>
                    </div>

                    <div
                        id="${blockId}"
                        class="accordion-content ${openClass}"
                    >
                        <div class="hourly-values-grid">

                            ${items.map(item => {

                                const isCurrentHour =
                                    isToday &&
                                    Number(
                                        item.hour
                                    ) ===
                                        currentHour;

                                const valueClass =
                                    getValueClass(
                                        item.val,
                                        type
                                    );

                                const currentHourClass =
                                    isCurrentHour
                                        ? 'current-hour'
                                        : '';

                                return `
                                    <div
                                        class="hourly-value-item"
                                    >
                                        <span
                                            class="
                                                hourly-value
                                                ${valueClass}
                                                ${currentHourClass}
                                            "
                                        >
                                            ${formatSingleValue(
                                                item,
                                                type
                                            )}
                                        </span>

                                        <span
                                            class="hourly-hour"
                                        >
                                            ${item.hour}h
                                        </span>
                                    </div>
                                `;

                            }).join('')}

                        </div>
                    </div>
                `;
            }
        );

    html += `
        </div>
    `;

    /*
     * =========================
     * INSERE NO MODAL
     * =========================
     */

    if (modalBody) {
        modalBody.innerHTML =
            html;
    }

    openModal(
        'detail-modal'
    );
}

// ==========================================
// 9. RENDERIZAÇÃO DOS CARDS
// ==========================================

function renderCards() {
    if (
        !weatherData ||
        !weatherData.hourly
    ) {
        return;
    }

    const container =
        document.getElementById(
            'cards-container'
        );

    if (!container) {
        return;
    }

    const hourly =
        weatherData.hourly;

    const daysMap =
        getDaysMap();

    const dayKeys =
        Object.keys(daysMap);

    const fragment =
        document.createDocumentFragment();

    dayKeys.forEach(
        (dateStr, dayIdx) => {
            const dayIndices =
                daysMap[dateStr];

            const baseValues =
                getBaseValues(
                    hourly,
                    dayIndices
                );

            const cloudSummary =
                getDailyCloudSummary(
                    hourly,
                    dayIndices
                );

            const [
                year,
                month,
                day
            ] =
                dateStr
                    .split('-')
                    .map(Number);

            const dateObj =
                new Date(
                    year,
                    month - 1,
                    day
                );

            const formattedDate =
                dateObj.toLocaleDateString(
                    'pt-BR',
                    {
                        weekday:
                            'long',
                        day:
                            '2-digit',
                        month:
                            '2-digit'
                    }
                );

            const card =
                document.createElement(
                    'div'
                );

            card.className =
                'card';

            card.innerHTML = `
                <div class="card-header">
                    (${dayIdx + 1})
                    ${formattedDate.toUpperCase()}
                </div>

                <div class="card-body">

                    <div class="base-metrics-container">

                        <div
                            class="base-metric-box cloud clickable"
                            onclick="openDetailModal('cloud', '${formattedDate}', '${dateStr}')"
                        >
                            <span class="metric-value">
                                ${cloudSummary}
                            </span>
                        </div>

                        <div
                            class="base-metric-box temp clickable"
                            onclick="openDetailModal('temp', '${formattedDate}', '${dateStr}')"
                        >
                            <span class="metric-title">
                                Temperatura
                            </span>

                            <span class="metric-value">
                                ${baseValues.temp}
                            </span>
                        </div>

                        <div
                            class="base-metric-box precip clickable"
                            onclick="openDetailModal('precip', '${formattedDate}', '${dateStr}')"
                        >
                            <span class="metric-title">
                                Chuva acumulada
                            </span>

                            <span class="metric-value">
                                ${baseValues.precip}
                            </span>
                        </div>

                        <div
                            class="base-metric-box wind clickable"
                            onclick="openDetailModal('wind', '${formattedDate}', '${dateStr}')"
                        >
                            <span class="metric-title">
                                Rajadas de Vento
                            </span>

                            <span class="metric-value">
                                ${baseValues.wind}
                            </span>
                        </div>

                        <div class="card-footer-notice">
                            Clique em um dos cards acima para detalhes.
                        </div>

                    </div>

                </div>
            `;

            fragment.appendChild(card);
        }
    );

    container.innerHTML = '';

    container.appendChild(
        fragment
    );
}

// ==========================================
// 10. INICIALIZAÇÃO
// ==========================================

document.addEventListener(
    'DOMContentLoaded',
    () => {
        renderHistory();
        fetchWeatherData();
    }
);