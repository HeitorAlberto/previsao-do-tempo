import { exibir_dados_openMeteo } from "./exibir_dados_openmeteo.js";

document.addEventListener("DOMContentLoaded", () => {
  // Elementos do DOM
  const btnBuscar = document.querySelector("#button");
  const inputCidade = document.querySelector("#cidadeInput");
  const resultado = document.querySelector("#resultado");
  const datalist = document.querySelector("#sugestoesCidades"); // datalist para autocomplete

  // -----------------------------
  // Autocomplete / sugestões enquanto digita
  inputCidade.addEventListener("input", async () => {
    const query = inputCidade.value.trim();
    if (!query) return;

    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`;
      const res = await fetch(url, { headers: { "User-Agent": "MeuAppPrevisao/1.0" } });
      const data = await res.json();

      datalist.innerHTML = ""; // limpa sugestões antigas
      data.forEach(item => {
        const option = document.createElement("option");
        option.value = item.display_name; // ou só item.address.city
        datalist.appendChild(option);
      });
    } catch (err) {
      console.error("Erro ao buscar sugestões:", err);
    }
  });

  // -----------------------------
  // Botão de busca
  btnBuscar.addEventListener("click", async () => {
    const cidadeNome = inputCidade.value.trim();
    if (!cidadeNome) return alert("Digite uma cidade!");

    try {
      const local = await buscarCoordenadas(cidadeNome);
      if (!local) {
        alert("Cidade não encontrada");
        limparColunas();
        return;
      }

      resultado.textContent = `📌 ${local.cidade}, ${local.estado}, ${local.pais}`;
      const dados_openMeteo = await buscarClima(local.lat, local.lon);
      exibir_dados_openMeteo(dados_openMeteo);

      // Salva a última cidade pesquisada
      localStorage.setItem("ultimaCidade", cidadeNome);
      inputCidade.value = "";
    } catch (err) {
      console.error("Erro ao buscar dados do clima:", err);
      resultado.textContent = "Erro ao buscar dados do clima.";
    }
  });

  // -----------------------------
  // Detectar localização ao carregar a página
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude;
          const lon = position.coords.longitude;

          const dados_openMeteo = await buscarClima(lat, lon);
          const local = await buscarLocalPorCoordenadas(lat, lon);

          if (local) {
            resultado.textContent = `📌 ${local.cidade}, ${local.estado}, ${local.pais}`;
          } else {
            resultado.textContent = `📌 Localização atual (lat: ${lat.toFixed(2)}, lon: ${lon.toFixed(2)})`;
          }

          exibir_dados_openMeteo(dados_openMeteo);
        } catch (err) {
          console.error("Erro ao buscar dados da localização:", err);
          resultado.textContent = "Erro ao detectar localização.";
        }
      },
      async () => {
        const ultimaCidade = localStorage.getItem("ultimaCidade") || "São Paulo";
        const local = await buscarCoordenadas(ultimaCidade);
        if (local) {
          const dados_openMeteo = await buscarClima(local.lat, local.lon);
          resultado.textContent = `📌 ${local.cidade}, ${local.estado}, ${local.pais}`;
          exibir_dados_openMeteo(dados_openMeteo);
        }
      }
    );
  } else {
    const ultimaCidade = localStorage.getItem("ultimaCidade") || "São Paulo";
    buscarCoordenadas(ultimaCidade).then(async (local) => {
      if (local) {
        const dados_openMeteo = await buscarClima(local.lat, local.lon);
        resultado.textContent = `📌 ${local.cidade}, ${local.estado}, ${local.pais}`;
        exibir_dados_openMeteo(dados_openMeteo);
      }
    });
  }
});

// -----------------------------
// Função para buscar coordenadas via Nominatim
async function buscarCoordenadas(cidade) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    cidade
  )}&format=json&limit=1&addressdetails=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "MeuAppPrevisao/1.0" },
  });

  const data = await res.json();
  if (!data || data.length === 0) return null;

  const address = data[0].address || {};
  const cidade_nome =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    "";
  const estado = address.state || "";
  const pais = address.country || "";

  return { lat: data[0].lat, lon: data[0].lon, cidade: cidade_nome, estado, pais };
}

// -----------------------------
// Função para buscar dados de clima
async function buscarClima(lat, lon) {
  let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_clear_sky_max,uv_index_max,sunshine_duration,daylight_duration,sunset,sunrise,rain_sum,showers_sum,snowfall_sum,precipitation_sum,precipitation_hours,precipitation_probability_max,et0_fao_evapotranspiration,shortwave_radiation_sum,wind_direction_10m_dominant,wind_gusts_10m_max,wind_speed_10m_max,temperature_2m_mean,apparent_temperature_mean,cape_mean,cape_max,cape_min,cloud_cover_mean,cloud_cover_max,cloud_cover_min,dew_point_2m_mean,dew_point_2m_max,dew_point_2m_min,pressure_msl_min,pressure_msl_max,pressure_msl_mean,snowfall_water_equivalent_sum,relative_humidity_2m_min,relative_humidity_2m_max,relative_humidity_2m_mean,precipitation_probability_min,precipitation_probability_mean,leaf_wetness_probability_mean,growing_degree_days_base_0_limit_50,et0_fao_evapotranspiration_sum,surface_pressure_mean,surface_pressure_max,surface_pressure_min,updraft_max,visibility_mean,visibility_min,visibility_max,winddirection_10m_dominant,wind_gusts_10m_mean,wind_speed_10m_mean,wind_gusts_10m_min,wind_speed_10m_min,vapour_pressure_deficit_max,wet_bulb_temperature_2m_min,wet_bulb_temperature_2m_max,wet_bulb_temperature_2m_mean&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,rain,showers,precipitation,snow_depth,snowfall,vapour_pressure_deficit,et0_fao_evapotranspiration,evapotranspiration,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,weather_code,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,temperature_80m,temperature_120m,temperature_180m,soil_moisture_27_to_81cm,soil_moisture_9_to_27cm,soil_moisture_3_to_9cm,soil_moisture_1_to_3cm,soil_moisture_0_to_1cm,soil_temperature_54cm,soil_temperature_18cm,soil_temperature_6cm,soil_temperature_0cm&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,snowfall,showers,rain,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_direction_10m,wind_gusts_10m,wind_speed_10m&timezone=auto&forecast_days=16`;

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) {
    console.error("Erro da API Open-Meteo:", data.reason);
    return null;
  }
  return data;
}

// -----------------------------
// Função para buscar localização a partir de coordenadas (reversa)
async function buscarLocalPorCoordenadas(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

  const res = await fetch(url, {
    headers: { "User-Agent": "MeuAppPrevisao/1.0" },
  });

  const data = await res.json();
  if (!data || !data.address) return null;

  const address = data.address;
  const cidade_nome =
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    address.state_district ||
    "";
  const estado = address.state || "";
  const pais = address.country || "";

  return { cidade: cidade_nome, estado, pais };
}
