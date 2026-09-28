// É responsável por montar e exibir a janela modal com a previsão hora a hora quando o usuário clica em alguma métrica do card.

import { getPeriodName, getWeatherDescription } from './processamento.js';

export function openModal(dayIndex, metricType, dateTitle, bgClass, currentWeatherData) {
    const modalHeader = document.getElementById('modalHeader');
    const modalBody = document.getElementById('modalBody');
    const modalOverlay = document.getElementById('modalOverlay');

    modalHeader.textContent = dateTitle;
    modalBody.innerHTML = '';

    if (!currentWeatherData?.hourly?.time) {
        modalOverlay.style.display = 'flex';
        return;
    }

    const targetDateStr = currentWeatherData.daily.time[dayIndex];
    const hourlyTime = currentWeatherData.hourly.time;
    let lastPeriodName = '', currentElementToScroll = null;

    const now = new Date();
    const currentDateTimeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:00`;

    for (let hourNum = 0; hourNum < 24; hourNum++) {
        const hourStr = `${String(hourNum).padStart(2, '0')}:00`;
        const fullDateTime = `${targetDateStr}T${hourStr}`;
        const periodName = getPeriodName(hourNum);

        if (periodName && periodName !== lastPeriodName) {
            const separator = document.createElement('div');
            separator.className = 'modal-group-separator';
            separator.textContent = periodName;
            modalBody.appendChild(separator);
            lastPeriodName = periodName;
        }

        const index = hourlyTime.indexOf(fullDateTime);
        let displayValue = 'N/A', customStyle = '';

        if (metricType === 'condition' && index !== -1) {
            displayValue = getWeatherDescription(currentWeatherData.hourly.cloudcover?.[index] ?? 0, currentWeatherData.hourly.weathercode?.[index] ?? 0);
        } else if (metricType === 'temp_range' && index !== -1) {
            const temp = currentWeatherData.hourly.temperature_2m?.[index];
            displayValue = `${Math.round(temp)}°C`;
            customStyle = temp < 11 ? 'color: #0066cc; font-weight: bold;' : temp > 29 ? 'color: #cc0000; font-weight: bold;' : '';
        } else if (metricType === 'precipitation' && index !== -1) {
            const precip = currentWeatherData.hourly.precipitation?.[index] || 0;
            displayValue = `${precip.toFixed(1)} mm`;
            customStyle = precip === 0 ? '' : precip <= 2.5 ? 'color: #3399ff; font-weight: bold;' : 'color: #0000cc; font-weight: bold;';
        } else if (metricType === 'wind_gusts' && index !== -1) {
            displayValue = `${Math.round(currentWeatherData.hourly.wind_gusts_10m?.[index] || 0)} km/h`;
        }

        const rowDiv = document.createElement('div');
        rowDiv.className = `modal-row-div ${bgClass}`;
        if (fullDateTime === currentDateTimeStr) {
            rowDiv.classList.add('current-hour-highlight');
            currentElementToScroll = rowDiv;
        }

        rowDiv.innerHTML = `<div class="modal-row-time-div">${hourStr}</div><div class="modal-row-value-div" style="${customStyle}">${displayValue}</div>`;
        modalBody.appendChild(rowDiv);
    }

    modalOverlay.style.display = 'flex';
    if (currentElementToScroll) {
        setTimeout(() => currentElementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
}