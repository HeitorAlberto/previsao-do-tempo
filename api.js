const OPEN_METEO_API =
  'https://api.open-meteo.com/v1/forecast';

const fetchJSON = async (url) =>
  (await fetch(url)).json();

// -----------------------------
// BUSCA CIDADE
// -----------------------------

export const search = (q) =>
  fetchJSON(
    `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(q)}&limit=1`
  ).then(data => {

    if (!data[0]) {
      throw new Error('Local não encontrado');
    }

    const place = data[0];

    return {
      lat: Number(place.lat),
      lon: Number(place.lon),
      name: place.display_name || 'Local desconhecido'
    };
  });

// -----------------------------
// PREVISÃO
// -----------------------------

export const forecast = (lat, lon) => {

  const url = new URL(OPEN_METEO_API);

  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('timezone', 'America/Fortaleza');
  url.searchParams.set('forecast_days', '10');

  url.searchParams.set('daily', [
    'weather_code',
    'temperature_2m_max',
    'temperature_2m_min',
    'precipitation_sum',
    'snowfall_sum',
    'precipitation_probability_max',
    'wind_gusts_10m_max'
  ].join(','));

  url.searchParams.set('hourly', [
    'cloud_cover_low',
    'cloud_cover_mid',
    'cloud_cover_high',
    'precipitation',
    'precipitation_probability',
    'wind_gusts_10m',
    'weather_code',
    'snowfall'
  ].join(','));

  return fetchJSON(url);
};