// Contém funções puras de lógica. Processa dados brutos da API.

export function hasThunderstormCode(code) {
    return [95, 96, 99].includes(code) || (code >= 90 && code <= 99);
}

export function getWeatherDescription(cloudcover, weathercode, isNight = false) {
    const hasStorm = hasThunderstormCode(weathercode);
    const periodSuffix = isNight ? 'noite' : 'dia';

    let text = '';
    let iconPath = '';

    if (hasStorm) {
        if (cloudcover <= 50) {
            text = 'Nuvens esparsas';
            iconPath = `icones/nuvens-esparsas-trovoadas-${periodSuffix}.png`;
        } else if (cloudcover <= 80) {
            text = 'Muitas nuvens';
            iconPath = `icones/muitas-nuvens-trovoada-${periodSuffix}.png`;
        } else {
            text = 'Nublado';
            iconPath = `icones/nublado-trovoadas-dia-ou-noite.png`;
        }
    } else {
        if (cloudcover <= 20) {
            text = 'Poucas nuvens';
            iconPath = `icones/poucas-nuvens-${periodSuffix}.png`;
        } else if (cloudcover <= 50) {
            text = 'Nuvens esparsas';
            iconPath = `icones/nuvens-esparsas-${periodSuffix}.png`;
        } else if (cloudcover <= 75) {
            text = 'Muitas nuvens';
            iconPath = `icones/muitas-nuvens-${periodSuffix}.png`;
        } else {
            text = 'Nublado';
            iconPath = `icones/nublado.png`;
        }
    }

    return {
        text: text.trim(),
        icon: iconPath
    };
}

// Retorna os ícones para os 4 períodos do dia de um dia específico
export function calculateDayPeriodsIcons(hourlyTime, cloudcoverArr, weathercodeArr, targetDateStr) {
    const periods = [
        { key: 'madrugada', hours: [0, 1, 2, 3, 4, 5], isNight: true },
        { key: 'manha', hours: [6, 7, 8, 9, 10, 11], isNight: false },
        { key: 'tarde', hours: [12, 13, 14, 15, 16, 17], isNight: false },
        { key: 'noite', hours: [18, 19, 20, 21, 22, 23], isNight: true }
    ];

    return periods.map(period => {
        let totalCloud = 0;
        let count = 0;
        let periodHasThunderstorm = false;

        period.hours.forEach(hourNum => {
            const hourStr = `${String(hourNum).padStart(2, '0')}:00`;
            const fullDateTime = `${targetDateStr}T${hourStr}`;
            const hIndex = hourlyTime ? hourlyTime.indexOf(fullDateTime) : -1;

            if (hIndex !== -1) {
                if (cloudcoverArr?.[hIndex] != null) {
                    totalCloud += cloudcoverArr[hIndex];
                    count++;
                }
                if (hasThunderstormCode(weathercodeArr?.[hIndex])) {
                    periodHasThunderstorm = true;
                }
            }
        });

        // Calcula a média simples diretamente
        const avgCloud = count > 0 ? totalCloud / count : 0;
        const dummyWeatherCode = periodHasThunderstorm ? 95 : 0;

        const desc = getWeatherDescription(avgCloud, dummyWeatherCode, period.isNight);
        return {
            periodKey: period.key,
            icon: desc.icon
        };
    });
}

export function calculateCardCondition(hourlyTime, cloudcoverArr, weathercodeArr, targetDateStr) {
    let totalCloud = 0, count = 0, hasThunderstorm = false;
    hourlyTime.forEach((t, i) => {
        if (t?.startsWith(targetDateStr)) {
            if (cloudcoverArr[i] != null) { totalCloud += cloudcoverArr[i]; count++; }
            if (hasThunderstormCode(weathercodeArr[i])) hasThunderstorm = true;
        }
    });
    return getWeatherDescription(count > 0 ? totalCloud / count : 0, hasThunderstorm ? 95 : 0, false);
}

export function getPeriodName(hour) {
    if (hour < 6) return 'Madrugada';
    if (hour < 12) return 'Manhã';
    if (hour < 18) return 'Tarde';
    return 'Noite';
}