import { calculateCardCondition, getWeatherDescription, calculateDayPeriodsIcons, hasThunderstormCode } from './processamento.js';

// Funções auxiliares com a lógica exata de intervalos numéricos
function getTempColor(temp) {
    if (temp < 15) return '#007bff';     // Azul claro (< 15)
    if (temp <= 29) return '#000000';    // Preto (15 a 29)
    return '#df0000';                    // Vermelho escuro (>= 30)
}

function getPrecipColor(precip) {
    if (precip === 0 || precip === 0.0) return '#000000'; 
    if (precip <= 2) return '#006aff';                 
    if (precip < 10) return '#9d00ff';                 
    return '#df0000';                                        
}

function generateTurnSummary(turnHoursData) {
    if (!turnHoursData || turnHoursData.length === 0) return 'Dados indisponíveis para este turno.';

    const maxWind = Math.max(...turnHoursData.map(h => h.wind));
    const avgCloud = turnHoursData.reduce((sum, h) => sum + h.cloudcover, 0) / turnHoursData.length;
    const totalPrecip = turnHoursData.reduce((sum, h) => sum + h.precip, 0);

    const lightHours = turnHoursData.filter(h => h.precip > 0 && h.precip <= 2.0);
    const moderateHours = turnHoursData.filter(h => h.precip > 2.0 && h.precip < 10.0);
    const heavyHours = turnHoursData.filter(h => h.precip >= 10.0);

    const totalRainHours = lightHours.length + moderateHours.length + heavyHours.length;

    const lines = [];

    // --- 1. CONDIÇÃO DE NUVENS ---
    let cloudText = '';
    if (avgCloud <= 20) {
        cloudText = 'Poucas nuvens';
    } else if (avgCloud <= 50) {
        cloudText = 'Nuvens esparsas';
    } else if (avgCloud <= 80) {
        cloudText = 'Muitas nuvens';
    } else {
        cloudText = 'Nublado';
    }
    lines.push(cloudText);

    // --- 2. CONDIÇÃO DE CHUVA (Com acumulado entre parênteses) ---
    let rainText = '';
    const precipFormatted = totalPrecip.toFixed(1).replace('.', ','); // Formato padrão BR opcional, ou use .toFixed(1)
    
    if (totalRainHours > 0) {
        if (heavyHours.length > 0) {
            if (heavyHours.length === 6) {
                rainText = `Chuva forte persistente (${totalPrecip.toFixed(1)} mm)`;
            } else {
                rainText = `Momentos de chuva forte (${totalPrecip.toFixed(1)} mm)`;
            }
        } else if (moderateHours.length > 0) {
            if (moderateHours.length === 6) {
                rainText = `Chuva moderada persistente (${totalPrecip.toFixed(1)} mm)`;
            } else if (moderateHours.length >= 3) {
                rainText = `Pancadas de chuva moderada (${totalPrecip.toFixed(1)} mm)`;
            } else {
                rainText = `Momentos de chuva moderada (${totalPrecip.toFixed(1)} mm)`;
            }
        } else if (lightHours.length > 0) {
            rainText = `Pancadas de chuva leve (${totalPrecip.toFixed(1)} mm)`;
        }
    } else {
        rainText = `Sem chuva (${totalPrecip.toFixed(1)} mm)`;
    }
    lines.push(rainText);

    // --- 3. CONDIÇÃO DE VENTOS (Com emoji de alerta) ---
    if (maxWind >= 80) {
        lines.push(`Ventos intensos ⚠️`);
    } else if (maxWind >= 60) {
        lines.push(`Ventos fortes ⚠️`);
    } else if (maxWind >= 40) {
        lines.push(`Ventos moderados ⚠️`);
    }

    // Retorna as linhas unidas por <br> para exibição em HTML
    return lines.join('<br>');
}

export function renderHistory(history, onClick) {
    const historyContainer = document.getElementById('historyContainer');
    const historyList = document.getElementById('historyList');
    if (history.length === 0) { historyContainer.style.display = 'none'; return; }
    
    historyContainer.style.display = 'block';
    historyList.innerHTML = '';
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = item.name;
        div.addEventListener('click', () => onClick(item));
        historyList.appendChild(div);
    });
}

export function renderForecast(data, cityName) {
    const container = document.getElementById('forecastContainer');
    const locationDiv = document.getElementById('currentLocationContainer');
    locationDiv.textContent = `Local: ${cityName}`;
    locationDiv.style.display = 'block';
    container.innerHTML = '';

    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
    const currentDay = String(now.getDate()).padStart(2, '0');
    const currentHour = String(now.getHours()).padStart(2, '0');
    
    const todayStr = `${currentYear}-${currentMonth}-${currentDay}`;
    const currentDateTimeStr = `${todayStr}T${currentHour}:00`;

    data.daily.time.forEach((dateStr, index) => {
        const dateObj = new Date(dateStr + 'T00:00:00');
        const dayName = days[dateObj.getDay()];
        const card = document.createElement('div');
        card.className = 'forecast-card';

        const header = document.createElement('div');
        header.className = `card-header-div ${[0, 6].includes(dateObj.getDay()) ? 'weekend-header' : ''}`;
        header.textContent = `(${index + 1}) ${dayName}, ${dateObj.toLocaleDateString('pt-BR')}`;
        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'card-body-div';

        // Calcula os ícones dos 4 períodos
        const dayPeriodsIcons = calculateDayPeriodsIcons(
            data.hourly?.time || [], 
            data.hourly?.cloudcover || [], 
            data.hourly?.weathercode || [], 
            dateStr
        );

        // Mapeia os ícones centralizados (sem legenda "Condição")
        const iconsHtml = dayPeriodsIcons.map(p => `
            <img src="${p.icon}" alt="${p.periodKey}" title="${p.periodKey}" style="width: 24px; height: 24px; object-fit: contain;" />
        `).join('');

        const metrics = [
            { label: 'Condição', valueHtml: `<div style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 100%;">${iconsHtml}</div>`, bg: 'bg-condition', noLabel: true },
            { label: 'Temperatura', value: `${Math.round(data.daily.temperature_2m_min[index])}° a ${Math.round(data.daily.temperature_2m_max[index])}°`, bg: 'bg-temp' },
            { label: 'Chuva Acumulada', value: `${data.daily.precipitation_sum[index]} mm`, bg: 'bg-precip' },
            { label: 'Rajada de Vento', value: `${Math.round(data.daily.wind_gusts_10m_max[index])} km/h`, bg: 'bg-wind' }
        ];

        metrics.forEach(m => {
            const mDiv = document.createElement('div');
            mDiv.className = `weather-metric-div ${m.bg}`;

            if (m.noLabel) {
                mDiv.innerHTML = m.valueHtml;
                mDiv.style.display = 'flex';
                mDiv.style.alignItems = 'center';
                mDiv.style.justifyContent = 'center';
            } else if (m.valueHtml) {
                mDiv.innerHTML = `
                    <div class="metric-label-div">${m.label}</div>
                    <div class="metric-value-div">${m.valueHtml}</div>
                `;
            } else {
                mDiv.innerHTML = `<div class="metric-label-div">${m.label}</div><div class="metric-value-div">${m.value}</div>`;
            }
            body.appendChild(mDiv);
        });

        card.appendChild(body);

        const isToday = (dateStr === todayStr);

        // --- BASE DO CARD ---
        const footerBase = document.createElement('div');
        footerBase.className = 'card-footer-base';

        const detailsToggleBtn = document.createElement('button');
        detailsToggleBtn.className = 'details-toggle-btn';

        const detailsContentArea = document.createElement('div');
        detailsContentArea.className = 'details-content-area';

        if (isToday) {
            detailsContentArea.style.display = 'flex';
            detailsToggleBtn.textContent = 'Menos detalhes ▴';
        } else {
            detailsContentArea.style.display = 'none';
            detailsToggleBtn.textContent = 'Mais detalhes ▾';
        }

        const menuContainer = document.createElement('div');
        menuContainer.className = 'turn-menu-container';

        const displayArea = document.createElement('div');
        displayArea.className = 'turn-display-area';

        const turns = [
            { label: '0h - 6h', hours: [0, 1, 2, 3, 4, 5] },
            { label: '6h - 12h', hours: [6, 7, 8, 9, 10, 11] },
            { label: '12h - 18h', hours: [12, 13, 14, 15, 16, 17] },
            { label: '18h - 00h', hours: [18, 19, 20, 21, 22, 23] }
        ];

        let activeButtonBtn = null;
        let activeDisplayContainer = null;
        let defaultTurnIndex = 0;

        if (isToday) {
            const currentHourNum = parseInt(currentHour, 10);
            turns.forEach((t, tIdx) => {
                if (t.hours.includes(currentHourNum)) {
                    defaultTurnIndex = tIdx;
                }
            });
        }

        turns.forEach((turn, tIdx) => {
            const btn = document.createElement('button');
            btn.className = 'turn-btn';
            btn.textContent = turn.label;

            const turnHoursContainer = document.createElement('div');
            turnHoursContainer.className = 'turn-hours-container';
            turnHoursContainer.style.display = 'none';

            const turnHoursData = [];

            turn.hours.forEach(hourNum => {
                const hourStr = `${String(hourNum).padStart(2, '0')}:00`;
                const fullDateTime = `${dateStr}T${hourStr}`;
                const hIndex = data.hourly?.time ? data.hourly.time.indexOf(fullDateTime) : -1;

                const rowDiv = document.createElement('div');
                rowDiv.className = 'card-hourly-row';

                if (fullDateTime === currentDateTimeStr) {
                    rowDiv.classList.add('current-hour-highlight');
                }

                if (hIndex !== -1) {
                    const cloudcover = data.hourly.cloudcover?.[hIndex] ?? 0;
                    const weathercode = data.hourly.weathercode?.[hIndex] ?? 0;
                    const temp = Math.round(data.hourly.temperature_2m?.[hIndex] || 0);
                    const precip = parseFloat(data.hourly.precipitation?.[hIndex] || 0);
                    const wind = Math.round(data.hourly.wind_gusts_10m?.[hIndex] || 0);

                    turnHoursData.push({ cloudcover, weathercode, temp, precip, wind });

                    const isNight = hourNum < 6 || hourNum >= 18;
                    const condDesc = getWeatherDescription(cloudcover, weathercode, isNight);

                    const precipFormatted = precip.toFixed(1);
                    const tempColor = getTempColor(temp);
                    const precipColor = getPrecipColor(precip);

                    let condDisplay = '';
                    if (condDesc.icon) {
                        condDisplay = `
                            <div style="display: flex; align-items: center; justify-content: center; gap: 6px;">
                                <img src="${condDesc.icon}" alt="${condDesc.text}" style="width: 24px; height: 24px; object-fit: contain;" />
                                <span style="font-size: 0.9rem;">${condDesc.text}</span>
                            </div>
                        `;
                    } else {
                        condDisplay = `<span>${condDesc.text}</span>`;
                    }

                    rowDiv.innerHTML = `
                        <div class="hourly-time-label">${hourStr}</div>
                        <div class="hourly-details-group">
                            <div class="weather-metric-div bg-condition" style="padding: 6px 10px; display: flex; align-items: center; justify-content: center;">${condDisplay}</div>
                            <div class="weather-metric-div bg-temp" style="padding: 6px 10px; display: flex; align-items: center;">
                                <span style="color: ${tempColor};">${temp}°C</span>
                            </div>
                            <div class="weather-metric-div bg-precip" style="padding: 6px 10px; display: flex; align-items: center;">
                                <span style="color: ${precipColor};">${precipFormatted} mm</span>
                            </div>
                            <div class="weather-metric-div bg-wind" style="padding: 6px 10px; display: flex; align-items: center;"><span>${wind} km/h</span></div>
                        </div>
                    `;
                } else {
                    rowDiv.innerHTML = `<div class="hourly-time-label">${hourStr}</div><div>Dados indisponíveis</div>`;
                }

                turnHoursContainer.appendChild(rowDiv);
            });

            // --- GERAÇÃO DO RESUMO TEXTUAL ---
            const summaryHtml = generateTurnSummary(turnHoursData);
            const turnSummaryDiv = document.createElement('div');
            turnSummaryDiv.className = 'turn-summary-text';
            turnSummaryDiv.style.cssText = 'padding: 8px 12px; margin-bottom: 8px; background: rgba(0, 0, 0, 0.04); border-radius: 6px; font-size: 0.88rem; font-weight: 500; text-align: center; color: #333; line-height: 1.4;';
            turnSummaryDiv.innerHTML = summaryHtml; // Usando innerHTML para respeitar o <br> das linhas separadas

            turnHoursContainer.insertBefore(turnSummaryDiv, turnHoursContainer.firstChild);

            btn.addEventListener('click', () => {
                if (activeButtonBtn) activeButtonBtn.classList.remove('active');
                if (activeDisplayContainer) activeDisplayContainer.style.display = 'none';

                btn.classList.add('active');
                turnHoursContainer.style.display = 'flex';

                activeButtonBtn = btn;
                activeDisplayContainer = turnHoursContainer;
            });

            if (tIdx === defaultTurnIndex) {
                btn.classList.add('active');
                turnHoursContainer.style.display = 'flex';
                activeButtonBtn = btn;
                activeDisplayContainer = turnHoursContainer;
            }

            menuContainer.appendChild(btn);
            displayArea.appendChild(turnHoursContainer);
        });

        detailsContentArea.appendChild(menuContainer);
        detailsContentArea.appendChild(displayArea);

        detailsToggleBtn.addEventListener('click', () => {
            const isHidden = detailsContentArea.style.display === 'none';
            detailsContentArea.style.display = isHidden ? 'flex' : 'none';
            detailsToggleBtn.textContent = isHidden ? 'Menos detalhes ▴' : 'Mais detalhes ▾';
        });

        footerBase.appendChild(detailsToggleBtn);
        footerBase.appendChild(detailsContentArea);
        card.appendChild(footerBase);

        container.appendChild(card);
    });
}