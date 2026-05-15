import os
import json
import numpy as np
import xarray as xr
from datetime import datetime, timedelta

# Configurações de caminhos (ajuste conforme seu ambiente)
grib_file = "downloaded_data.grib"
json_file = "dados.json"
data_query = datetime.now().strftime("%Y%m%d") # Usa a data atual como referência

print("Iniciando o processamento do Xarray com suavização...")

try:
    # 1. Abre o arquivo GRIB2 ordenando as latitudes
    ds = xr.open_dataset(grib_file, engine="cfgrib")
    ds = ds.sortby("latitude")
    
    # 2. Recorta a área de interesse (América do Sul / Brasil)
    ds = ds.sel(latitude=slice(-34, 5), longitude=slice(-75, -34))

    # 3. Extrai e calcula a precipitação incremental de 3 em 3 horas (convertendo para mm)
    tp = ds["tp"].load()
    tp_inc = tp.diff("step")
    tp_inc = tp_inc.where(tp_inc >= 0, 0).fillna(0) * 1000

    # =========================================================================
    # ENGENHARIA DE SUAVIZAÇÃO: INTERPOLAÇÃO BILINEAR
    # =========================================================================
    # Criamos um novo grid 4 vezes mais denso que o original de 0.25°
    # O passo de 0.0625° vai gerar micro-quadrados que criam a ilusão de gradiente
    novas_lats = np.arange(-34, 5.01, 0.0625)
    novas_lons = np.arange(-75, -33.99, 0.0625)

    print("Calculando interpolação bilinear (isso pode levar alguns segundos)...")
    # O método bilinear calcula a média ponderada dos 4 pixels vizinhos
    tp_inc_suave = tp_inc.interp(latitude=novas_lats, longitude=novas_lons, method="bilinear")
    # =========================================================================

    # Atualiza as variáveis de coordenadas com o novo grid denso
    lats = novas_lats
    lons = novas_lons
    dias_semana = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]

    frames_5dias = []
    data_base = datetime.strptime(data_query, "%Y%m%d")

    # 4. Agrupa os blocos de 3h em períodos de 24h (8 passos por dia)
    for i in range(5):
        start_step = i * 8
        end_step = (i + 1) * 8
        
        # Soma os 8 passos do dia usando a matriz já suavizada
        grid_dia = tp_inc_suave.isel(step=slice(start_step, end_step)).sum(dim="step")
        
        # Calcula a data do respectivo dia de previsão
        data_alvo = data_base + timedelta(days=i)
        label = f"{data_alvo.strftime('%d/%m')} - {dias_semana[data_alvo.weekday() ]}"
        
        # Converte valores nulos (NaN) para 0.0 e transforma em lista Python pura
        data_array = np.nan_to_num(grid_dia.values, nan=0.0)
        
        frames_5dias.append({
            "label": label,
            "precip": data_array.round(1).tolist() # Uma casa decimal para economizar espaço no JSON
        })

    # 5. Estrutura o objeto final do JSON
    output = {
        "model": "ECMWF Global Suavizado (00h UTC)",
        "updated": datetime.now().strftime("%d/%m/%Y %H:%M"),
        "grid": {"lat": lats.tolist(), "lon": lons.tolist()},
        "frames_24h": frames_5dias
    }

    # 6. Salva o arquivo final
    print("Salvando arquivo dados.json...")
    with open(json_file, "w") as f:
        json.dump(output, f)

    print(f"Sucesso! O arquivo '{json_file}' foi gerado com alta definição.")

except Exception as e:
    print(f"Ocorreu um erro durante o processamento: {e}")