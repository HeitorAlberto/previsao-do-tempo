import { calculateCardCondition } from './processamento.js';

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

export function renderForecast(data, cityName, onMetricClick) {
    const container = document.getElementById('forecastContainer');
    const locationDiv = document.getElementById('currentLocationContainer');
    locationDiv.textContent = `📌 ${cityName}`;
    locationDiv.style.display = 'block';
    container.innerHTML = '';

    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    
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

        const conditionResult = calculateCardCondition(
            data.hourly?.time || [], 
            data.hourly?.cloudcover || [], 
            data.hourly?.weathercode || [], 
            dateStr
        );

        const metrics = [
            { label: 'Condição', value: conditionResult.text, icon: conditionResult.icon, type: 'condition', bg: 'bg-condition' },
            { label: 'Temperatura', value: `${Math.round(data.daily.temperature_2m_min[index])}° a ${Math.round(data.daily.temperature_2m_max[index])}°`, type: 'temp_range', bg: 'bg-temp' },
            { label: 'Chuva Acumulada', value: `${data.daily.precipitation_sum[index]} mm`, type: 'precipitation', bg: 'bg-precip' },
            { label: 'Rajada de Vento', value: `${Math.round(data.daily.wind_gusts_10m_max[index])} km/h`, type: 'wind_gusts', bg: 'bg-wind' }
        ];

        metrics.forEach(m => {
            const mDiv = document.createElement('div');
            mDiv.className = `weather-metric-div ${m.bg}`;

            if (m.icon) {
                mDiv.innerHTML = `
                    <div class="metric-label-div">${m.label}</div>
                    <div class="metric-value-div" style="display: flex; align-items: center; gap: 8px; justify-content: center;">
                        <span>${m.value}</span>
                        <img src="${m.icon}" alt="${m.value}" style="width: 28px; height: 28px; object-fit: contain;" />
                    </div>
                `;
            } else {
                mDiv.innerHTML = `<div class="metric-label-div">${m.label}</div><div class="metric-value-div">${m.value}</div>`;
            }

            mDiv.addEventListener('click', () => onMetricClick(index, m.type, header.textContent, m.bg));
            body.appendChild(mDiv);
        });

        card.appendChild(body);
        container.appendChild(card);
    });
}