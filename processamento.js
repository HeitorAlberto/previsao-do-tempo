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
        } else if (cloudcover <= 80) {
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

// Função para remover extremos (menor e maior valor) e tirar a média dos valores restantes
function calculateTrimmedAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    if (arr.length <= 2) {
        // Se tiver poucos elementos, apenas tira a média simples
        const sum = arr.reduce((acc, val) => acc + val, 0);
        return sum / arr.length;
    }

    // Ordena os valores em ordem crescente
    const sorted = [...arr].sort((a, b) => a - b);
    
    // Remove o menor e o maior (extremos)
    sorted.shift();
    sorted.pop();

    // Se após remover sobra algum elemento, calcula a média deles
    if (sorted.length === 0) return arr[0];
    
    const sum = sorted.reduce((acc, val) => acc + val, 0);
    return sum / sorted.length;
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
        const cloudValues = [];
        let periodHasThunderstorm = false;

        period.hours.forEach(hourNum => {
            const hourStr = `${String(hourNum).padStart(2, '0')}:00`;
            const fullDateTime = `${targetDateStr}T${hourStr}`;
            const hIndex = hourlyTime ? hourlyTime.indexOf(fullDateTime) : -1;

            if (hIndex !== -1) {
                if (cloudcoverArr?.[hIndex] != null) {
                    cloudValues.push(cloudcoverArr[hIndex]);
                }
                if (hasThunderstormCode(weathercodeArr?.[hIndex])) {
                    periodHasThunderstorm = true;
                }
            }
        });

        // Aplica a lógica de remoção de extremos e cálculo da média
        const avgCloud = calculateTrimmedAverage(cloudValues);
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