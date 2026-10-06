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
            separator.textContent = ' ';
            modalBody.appendChild(separator);
            lastPeriodName = periodName;
        }

        const index = hourlyTime.indexOf(fullDateTime);
        let displayHTML = 'N/A', customStyle = '';

        if (metricType === 'condition' && index !== -1) {
            const cloudcover = currentWeatherData.hourly.cloudcover?.[index] ?? 0;
            const weathercode = currentWeatherData.hourly.weathercode?.[index] ?? 0;
            const isNight = hourNum < 6 || hourNum >= 18;

            const conditionResult = getWeatherDescription(cloudcover, weathercode, isNight);

            if (conditionResult.icon) {
                displayHTML = `
                    <span style="${customStyle}">${conditionResult.text}</span>
                    <img src="${conditionResult.icon}" alt="${conditionResult.text}" style="width: 24px; height: 24px; object-fit: contain; vertical-align: middle;" />
                `;
            } else {
                displayHTML = `<span style="${customStyle}">${conditionResult.text}</span>`;
            }
        } else if (index !== -1) {
            if (metricType === 'temp_range') {
                const temp = currentWeatherData.hourly.temperature_2m?.[index];
                const roundedTemp = Math.round(temp);
                displayHTML = `${roundedTemp}°C`;
                customStyle = temp < 11 ? 'color: #0066cc; font-weight: bold;' : roundedTemp >= 30 ? 'color: #cc0000; font-weight: bold;' : '';
            } else if (metricType === 'precipitation') {
                const precip = currentWeatherData.hourly.precipitation?.[index] || 0;
                displayHTML = `${precip.toFixed(1)} mm`;
                customStyle = precip === 0 ? '' : precip <= 2.5 ? 'color: #3399ff; font-weight: bold;' : 'color: #0000cc; font-weight: bold;';
            } else if (metricType === 'wind_gusts') {
                displayHTML = `${Math.round(currentWeatherData.hourly.wind_gusts_10m?.[index] || 0)} km/h`;
            }
            displayHTML = `<span style="${customStyle}">${displayHTML}</span>`;
        }

        const rowDiv = document.createElement('div');
        rowDiv.className = `modal-row-div ${bgClass}`;
        if (fullDateTime === currentDateTimeStr) {
            rowDiv.classList.add('current-hour-highlight');
            currentElementToScroll = rowDiv;
        }

        rowDiv.innerHTML = `
            <div class="modal-row-time-div">${hourStr}</div>
            <div class="modal-row-value-div" style="display: flex; align-items: center; justify-content: flex-end;">${displayHTML}</div>
        `;
        modalBody.appendChild(rowDiv);
    }

    modalOverlay.style.display = 'flex';
    if (currentElementToScroll) {
        setTimeout(() => currentElementToScroll.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
}