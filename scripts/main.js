import { exibir_dados_openMeteo } from "./exibir_dados_openmeteo.js";






// Elementos do DOM
const btnBuscar = document.querySelector("#button");
const inputCidade = document.querySelector("#cidadeInput");
const resultado = document.querySelector("#resultado");







// Botão de busca
btnBuscar.addEventListener("click", async () => {

    const cidadeNome = inputCidade.value.trim();
    
    if (!cidadeNome) return alert("Digite uma cidade!");

    try {
        // Buscar coordenadas da cidade
        const local = await buscarCoordenadas(cidadeNome);
        
        if (!local) {
            alert("Cidade não encontrada");
            limparColunas();
            return;
        }

        resultado.textContent = `📌 ${local.cidade}, ${local.estado}, ${local.pais}`;

        // Buscar dados climáticos
        const dados_openMeteo = await buscarClima(local.lat, local.lon);


        console.log(dados_openMeteo);
        


        exibir_dados_openMeteo(dados_openMeteo);
        






        inputCidade.value = "";






        
    } catch (err) {
        console.error("Erro ao buscar dados do clima:", err);
        resultado.textContent = "Erro ao buscar dados do clima.";
        //limparColunas();
    }
});






// Função para buscar coordenadas via Nominatim
async function buscarCoordenadas(cidade) {
    
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade)}&format=json&limit=1&addressdetails=1`;
    
    const res = await fetch(url, { headers: { "User-Agent": "MeuAppPrevisao/1.0" } });
    
    const data = await res.json();
    
    if (!data || data.length === 0) return null;

    const address = data[0].address || {};

    const cidade_nome = address.city || address.town || address.villadados_e || address.municipality || address.county || address.state_district || "";
    
    const estado = address.state || "";
    
    const pais = address.country || "";

    return { lat: data[0].lat, lon: data[0].lon, cidade: cidade_nome, estado, pais };
}








// Função para buscar dados de clima
async function buscarClima(lat, lon) {

  let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,uv_index_clear_sky_max,uv_index_max,sunshine_duration,daylight_duration,sunset,sunrise,rain_sum,showers_sum,snowfall_sum,precipitation_probability_max,precipitation_hours,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,snow_depth,vapour_pressure_deficit,et0_fao_evapotranspiration,evapotranspiration,visibility,cloud_cover_high,cloud_cover_mid,cloud_cover_low,cloud_cover,surface_pressure,pressure_msl,weather_code,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,temperature_80m,temperature_120m,temperature_180m,soil_moisture_27_to_81cm,soil_moisture_9_to_27cm,soil_moisture_3_to_9cm,soil_moisture_1_to_3cm,soil_moisture_0_to_1cm,soil_temperature_54cm,soil_temperature_18cm,soil_temperature_0cm,soil_temperature_6cm&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,snowfall,showers,rain,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_gusts_10m,wind_direction_10m,wind_speed_10m&timezone=auto&forecast_days=16`;

  

  const res = await fetch(url);
  const data = await res.json();

  // Se a API retornar erro, mostrar no console
  if (data.error) {
    console.error("Erro da API Open-Meteo:", data.reason);
    return null;
  }

  return data;
}





