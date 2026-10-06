// Contém funções puras de lógica. Processa dados brutos da API.

export function hasThunderstormCode(code) {
    return [95, 96, 99].includes(code) || (code >= 90 && code <= 99);
}

export function getWeatherDescription(cloudcover, weathercode, isNight = false) {
    const lightning = hasThunderstormCode(weathercode) ? '' : '';
    const hasStorm = hasThunderstormCode(weathercode);
    const periodSuffix = isNight ? 'noite' : 'dia';

    let text = '';
    let iconPath = '';

    if (hasStorm) {
        if (cloudcover <= 50) {
            text = `Nuvens esparsas ${lightning}`;
            iconPath = `icones/nuvens-esparsas-trovoadas-${periodSuffix}.png`;
        } else if (cloudcover <= 80) {
            text = `Muitas nuvens ${lightning}`;
            iconPath = `icones/muitas-nuvens-trovoada-${periodSuffix}.png`;
        } else {
            text = `Nublado ${lightning}`;
            iconPath = `icones/nublado-trovoadas-dia-ou-noite.png`;
        }
    } else {
        if (cloudcover <= 20) {
            text = `Poucas nuvens`;
            iconPath = `icones/poucas-nuvens-${periodSuffix}.png`;
        } else if (cloudcover <= 50) {
            text = `Nuvens esparsas`;
            iconPath = `icones/nuvens-esparsas-${periodSuffix}.png`;
        } else if (cloudcover <= 80) {
            text = `Muitas nuvens`;
            iconPath = `icones/muitas-nuvens-${periodSuffix}.png`;
        } else {
            text = `Nublado`;
            iconPath = `icones/nublado.png`;
        }
    }

    return {
        text: text.trim(),
        icon: iconPath
    };
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