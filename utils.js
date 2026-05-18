
// -----------------------------
// FORMATAÇÃO DE DATA
// -----------------------------

export const fmtDate = (d) => {
  const dt = new Date(d + 'T00:00:00');

  return {
    date: dt.toLocaleDateString('pt-BR'),
    weekday: dt.toLocaleDateString('pt-BR', { weekday: 'short' }),
    day: dt.getDay()
  };
};


// -----------------------------
// TEXTO DE LOCALIZAÇÃO (se ainda usado fora do app.js)
// -----------------------------

export const addrText = (a) =>
  `${a.city || a.town || a.village || a.municipality || ''}`
  + (a.state ? `, ${a.state}` : '')
  + (a.country ? `, ${a.country}` : '');


// -----------------------------
// CONDIÇÃO DE NUVENS (UI)
// -----------------------------

export const cloudText = v => {

  if (v <= 10) {
    return `
                <span class="cloud-status">
                    <img src="icons/clear.svg" class="cloud-icon">
                    Limpo
                </span>
            `;
  }

  if (v <= 35) {
    return `
                <span class="cloud-status">
                    <img src="icons/few-clouds.svg" class="cloud-icon">
                    Poucas nuvens
                </span>
            `;
  }

  if (v <= 60) {
    return `
                <span class="cloud-status">
                    <img src="icons/partly-cloudy.svg" class="cloud-icon">
                    Algumas nuvens
                </span>
            `;
  }

  if (v <= 85) {
    return `
                <span class="cloud-status">
                    <img src="icons/cloudy.svg" class="cloud-icon">
                    Nublado
                </span>
            `;
  }

  return `
            <span class="cloud-status">
                <img src="icons/overcast.svg" class="cloud-icon">
                Encoberto
            </span>
        `;
};


// -----------------------------
// ALERTAS CLIMÁTICOS
// -----------------------------

export const alertsMap = [
  {
    type: 'storm',
    label: 'Trovoadas',
    icon: 'icons/storm.svg',
    priority: 3,
    codes: [95]
  },
  {
    type: 'hail',
    label: 'Granizo',
    icon: 'icons/hail.svg',
    priority: 5,
    codes: [96, 99]
  },
  {
    type: 'snow',
    label: 'Neve',
    icon: 'icons/snow.svg',
    priority: 4,
    codes: [71, 73, 75, 77, 85, 86]
  },
  {
    type: 'fog',
    label: 'Neblina',
    icon: 'icons/fog.svg',
    priority: 2,
    codes: [45, 48]
  }
];


// -----------------------------
// PROCESSAMENTO POR PERÍODO
// -----------------------------

export const periodData = (data, dayIndex, startHour, endHour) => {

  const clouds = [];
  const rainProb = [];
  const gusts = [];
  const rainAmount = [];
  const codes = [];

  const targetDate = data.daily.time[dayIndex];

  for (let i = 0; i < data.hourly.time.length; i++) {

    const time = data.hourly.time[i];

    // filtra apenas o dia correto
    if (!time.startsWith(targetDate)) continue;

    const hour = new Date(time).getHours();

    // filtra período do dia
    if (hour < startHour || hour > endHour) continue;

    clouds.push(data.hourly.cloud_cover[i]);
    rainProb.push(data.hourly.precipitation_probability[i]);
    gusts.push(data.hourly.wind_gusts_10m[i]);
    rainAmount.push(data.hourly.precipitation[i]);
    codes.push(Number(data.hourly.weather_code[i]));
  }

  // média de nuvens
  const avgCloud =
    clouds.reduce((a, b) => a + b, 0) / (clouds.length || 1);

  // chuva total no período
  const totalRain =
    rainAmount.reduce((a, b) => a + b, 0);

  // alertas ativos no período
  const alerts = alertsMap.filter(a =>
    codes.some(c => a.codes.includes(c))
  );

  return {
    clouds: cloudText(avgCloud),
    rain: Math.max(...rainProb, 0),
    gust: Math.max(...gusts, 0),
    accumulation: totalRain,
    alerts
  };
};