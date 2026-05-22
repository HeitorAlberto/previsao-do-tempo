export const fmtDate = (d) => {

  const dt = new Date(d + 'T00:00:00');

  return {
    date: dt.toLocaleDateString('pt-BR'),
    weekday: dt.toLocaleDateString('pt-BR', { weekday: 'long' }),
    day: dt.getDay()
  };
};

export const addrText = (a) => {

  const city =
    [a.city, a.town, a.village, a.municipality, a.city_district, a.suburb]
      .find(v => v && !v.includes('Região Geográfica')) || '';

  return [city, a.state, a.country]
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .join(', ');
};

export const cloudType = (v) => {

  if (v <= 33) return 'clear';
  if (v <= 66) return 'clouds';
  return 'overcast';
};

export const alertsMap = [
  {
    type: 'storm',
    label: 'Trovoadas',
    priority: 3,
    codes: [95],
    icon: 'trovoadas.webp'
  },
  {
    type: 'hail',
    label: 'Granizo',
    priority: 5,
    codes: [96, 99],
    icon: 'granizo.webp'
  },
  {
    type: 'snow',
    label: 'Neve',
    priority: 4,
    codes: [71, 73, 75, 77, 85, 86],
    icon: 'neve.webp'
  },
  {
    type: 'fog',
    label: 'Neblina',
    priority: 2,
    codes: [45, 48],
    icon: 'neblina.webp'
  }
];

export const rainIntensityLabel = (mm) => {

  if (mm < 0.5) return 'Sem chuva';
  if (mm < 3) return 'Chuva muito leve';
  if (mm < 8) return 'Chuva leve';
  if (mm < 20) return 'Chuva moderada';
  if (mm < 40) return 'Chuva forte';

  return 'Chuva extrema';
};

export const periodData = (data, dayIndex, startHour, endHour) => {

  const clouds = [];
  const rainProb = [];
  const gusts = [];
  const precipValues = [];
  const snowValues = [];
  const codes = [];

  const targetDate = data.daily.time[dayIndex];

  for (let i = 0; i < data.hourly.time.length; i++) {

    const time = data.hourly.time[i];
    if (!time.startsWith(targetDate)) continue;

    const hour = new Date(time).getHours();
    if (hour < startHour || hour > endHour) continue;

    const low = data.hourly.cloud_cover_low[i] || 0;
    const mid = data.hourly.cloud_cover_mid[i] || 0;
    const high = data.hourly.cloud_cover_high[i] || 0;

    const cloud = (low + mid * 0.6 + high * 0.1) / 1.7;
    clouds.push(cloud);

    rainProb.push(data.hourly.precipitation_probability[i] || 0);
    gusts.push(data.hourly.wind_gusts_10m[i] || 0);

    precipValues.push(data.hourly.precipitation[i] || 0);
    snowValues.push(data.hourly.snowfall[i] || 0);

    codes.push(Number(data.hourly.weather_code[i]));
  }

  const avgCloud =
    clouds.reduce((a, b) => a + b, 0) / (clouds.length || 1);

  return {
    cloudType: cloudType(avgCloud),

    rain: precipValues.reduce((a, b) => a + b, 0),
    snow: snowValues.reduce((a, b) => a + b, 0),

    rainProb: Math.max(...rainProb, 0),
    gust: Math.max(...gusts, 0),

    alerts: alertsMap.filter(a =>
      codes.some(c => a.codes.includes(c))
    )
  };
};