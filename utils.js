// -----------------------------
// FORMATAÇÃO DE DATA
// -----------------------------

export const fmtDate = (d) => {

  const dt = new Date(d + 'T00:00:00');

  return {
    date: dt.toLocaleDateString('pt-BR'),

    weekday: dt.toLocaleDateString(
      'pt-BR',
      { weekday: 'long' }
    ),

    day: dt.getDay()
  };
};


// -----------------------------
// TEXTO DE LOCALIZAÇÃO
// -----------------------------

export const addrText = (a) => {

  const possibleCity = [
    a.city,
    a.town,
    a.village,
    a.municipality,
    a.city_district,
    a.suburb
  ];

  const city = possibleCity.find(v =>

    v &&

    !v.includes('Região Geográfica') &&
    !v.includes('Intermediate Region') &&
    !v.includes('Immediate Region')

  ) || '';

  return [
    city,
    a.state,
    a.country
  ]
    .filter(Boolean)

    .filter((v, i, arr) =>
      arr.indexOf(v) === i
    )

    .join(', ');
};


// -----------------------------
// CLOUD TYPE (SEMÂNTICO)
// -----------------------------

export const cloudType = v => {

  if (v <= 10)
    return 'clear';

  if (v <= 35)
    return 'few-clouds';

  if (v <= 60)
    return 'partly-cloudy';

  if (v <= 92)
    return 'cloudy';

  return 'overcast';
};


// -----------------------------
// LABELS DO CÉU
// -----------------------------

export const cloudLabels = {

  clear:
    '☀️ Céu aberto em maior parte',

  'few-clouds':
    '🌤️ Poucas nuvens no geral',

  'partly-cloudy':
    '⛅ Parcialmente nublado',

  cloudy:
    '🌥️ Muitas nuvens no geral',

  overcast:
    '☁️ Céu encoberto'
};


// -----------------------------
// UI DAS NUVENS
// -----------------------------

export const cloudText = v => {

  const type = cloudType(v);

  const map = {

    clear: {
      icon: '',
      label: 'Limpo'
    },

    'few-clouds': {
      icon: '',
      label: 'Poucas nuvens'
    },

    'partly-cloudy': {
      icon: '',
      label: 'Nuvens esparsas'
    },

    cloudy: {
      icon: '',
      label: 'Nublado'
    },

    overcast: {
      icon: '',
      label: 'Encoberto'
    }
  };

  const item = map[type];

  return `
    <span class="cloud-status">

      ${item.label}

    </span>
  `;
};


// -----------------------------
// WEATHER CODE
// -----------------------------

export const weatherCodeMap = {

  0: '☀️ Céu limpo',
  1: '🌤️ Predomínio de sol',
  2: '⛅ Parcialmente nublado',
  3: '☁️ Encoberto',

  45: '🌫️ Neblina',
  48: '🌫️ Neblina com geada',

  51: '💧 Chuviscos leves',
  53: '💧 Chuviscos',
  55: '💧 Chuviscos intensos',

  61: '💧 Chuva fraca',
  63: '💧 Chuva',
  65: '💧 Chuva forte',

  66: '💧 Chuva congelante',
  67: '💧 Chuva congelante forte',

  71: '🌨️ Neve fraca',
  73: '🌨️ Neve',
  75: '🌨️ Neve intensa',

  77: '🌨️ Grãos de neve',

  80: '💧 Pancadas leves',
  81: '💧 Pancadas de chuva',
  82: '💧 Pancadas fortes',

  85: '🌨️ Neve isolada',
  86: '🌨️ Neve intensa',

  95: '🌩️ Trovoadas',
  96: '🌩️ Trovoadas com granizo',
  99: '⚪ Granizo forte'
};


// -----------------------------
// RESUMO INTELIGENTE DO DIA
// -----------------------------

export const buildDailyWeatherText = ({
  weatherCode,
  rain,
  probability,
  alerts
}) => {

  const hasStorm =
    alerts.some(a => a.type === 'storm');

  const hasHail =
    alerts.some(a => a.type === 'hail');

  const hasFog =
    alerts.some(a => a.type === 'fog');

  const hasSnow =
    alerts.some(a => a.type === 'snow');

  // -----------------------------
  // EVENTOS PRIORITÁRIOS
  // -----------------------------

  if (hasHail)
    return '⚪ Risco de granizo';

  if (hasStorm)
    return '🌩️ Trovoadas';

  if (hasSnow)
    return '🌨️ Possibilidade de neve';

  if (hasFog)
    return '🌫️ Neblina';

  // -----------------------------
  // CHUVA
  // -----------------------------

  if (rain >= 25)
    return '💧 Chuva volumosa';

  if (rain >= 8)
    return '💧 Pancadas de chuva';

  if (rain >= 1)
    return '💧 Chuva fraca';

  if (probability >= 70)
    return '💧 Chance de chuva';

  // -----------------------------
  // IGNORA WEATHER CODES DE CÉU
  // -----------------------------

  const ignoredSkyCodes = [0, 1, 2, 3];

  if (ignoredSkyCodes.includes(weatherCode))
    return '';

  // -----------------------------
  // FALLBACK
  // -----------------------------

  return (
    weatherCodeMap[weatherCode] ||
    ''
  );
};


// -----------------------------
// ALERTAS CLIMÁTICOS
// -----------------------------

export const alertsMap = [

  {
    type: 'storm',
    label: 'Trovoadas',
    priority: 3,
    codes: [95]
  },

  {
    type: 'hail',
    label: 'Granizo',
    priority: 5,
    codes: [96, 99]
  },

  {
    type: 'snow',
    label: 'Neve',
    priority: 4,
    codes: [71, 73, 75, 77, 85, 86]
  },

  {
    type: 'fog',
    label: 'Neblina',
    priority: 2,
    codes: [45, 48]
  }
];


// -----------------------------
// PROCESSAMENTO POR PERÍODO
// -----------------------------

export const periodData = (
  data,
  dayIndex,
  startHour,
  endHour
) => {

  const clouds = [];
  const rainProb = [];
  const gusts = [];
  const rainAmount = [];
  const codes = [];

  const targetDate =
    data.daily.time[dayIndex];

  for (let i = 0; i < data.hourly.time.length; i++) {

    const time =
      data.hourly.time[i];

    if (!time.startsWith(targetDate))
      continue;

    const hour =
      new Date(time).getHours();

    if (hour < startHour || hour > endHour)
      continue;

    const low =
      data.hourly.cloud_cover_low[i] || 0;

    const mid =
      data.hourly.cloud_cover_mid[i] || 0;

    const high =
      data.hourly.cloud_cover_high[i] || 0;

    // normalização ponderada

    const weightedCloud = (

      (low * 1.0) +
      (mid * 0.6) +
      (high * 0.1)

    ) / 1.7;

    clouds.push(weightedCloud);

    rainProb.push(
      data.hourly
        .precipitation_probability[i]
    );

    gusts.push(
      data.hourly
        .wind_gusts_10m[i]
    );

    rainAmount.push(
      data.hourly
        .precipitation[i]
    );

    codes.push(
      Number(
        data.hourly.weather_code[i]
      )
    );
  }

  const avgCloud =

    clouds.reduce(
      (a, b) => a + b,
      0
    ) /

    (clouds.length || 1);

  const totalRain =

    rainAmount.reduce(
      (a, b) => a + b,
      0
    );

  const alerts = alertsMap.filter(a =>

    codes.some(c =>
      a.codes.includes(c)
    )
  );

  return {

    clouds:
      cloudText(avgCloud),

    cloudType:
      cloudType(avgCloud),

    rain:
      Math.max(...rainProb, 0),

    gust:
      Math.max(...gusts, 0),

    accumulation:
      totalRain,

    alerts
  };
};