//Contém funções puras de lógica. Processa dados brutos da API (como calcular médias de nuvens, descobrir se há tempestades e definir o período do dia) sem interagir com o DOM.

export function hasThunderstormCode(code) {
    return [95, 96, 99].includes(code) || (code >= 90 && code <= 99);
}

export function getWeatherDescription(cloudcover, weathercode) {
    const lightning = hasThunderstormCode(weathercode) ? '⚡' : '';
    if (cloudcover <= 20) return `Poucas nuvens ${lightning}`;
    if (cloudcover <= 50) return `Nuvens esparsas ${lightning}`;
    if (cloudcover <= 80) return `Muitas nuvens ${lightning}`;
    return `Nublado ${lightning}`;
}

export function calculateCardCondition(hourlyTime, cloudcoverArr, weathercodeArr, targetDateStr) {
    let totalCloud = 0, count = 0, hasThunderstorm = false;
    hourlyTime.forEach((t, i) => {
        if (t?.startsWith(targetDateStr)) {
            if (cloudcoverArr[i] != null) { totalCloud += cloudcoverArr[i]; count++; }
            if (hasThunderstormCode(weathercodeArr[i])) hasThunderstorm = true;
        }
    });
    return getWeatherDescription(count > 0 ? totalCloud / count : 0, hasThunderstorm ? 95 : 0);
}

export function getPeriodName(hour) {
    if (hour < 6) return 'Madrugada';
    if (hour < 12) return 'Manhã';
    if (hour < 18) return 'Tarde';
    return 'Noite';
}