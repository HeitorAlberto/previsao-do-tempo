#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from ecmwf.opendata import Client
from datetime import datetime, timedelta
import xarray as xr
import matplotlib.pyplot as plt
import cartopy.crs as ccrs
from cartopy.feature import NaturalEarthFeature
from matplotlib.colors import ListedColormap, BoundaryNorm
import numpy as np
import pandas as pd
import os, warnings
from pathlib import Path
import matplotlib.colors as mcolors

warnings.filterwarnings("ignore", category=FutureWarning)

# ==============================
# 1. Configurações iniciais
# ==============================
dias_semana_pt = {
    "Monday": "segunda-feira", "Tuesday": "terça-feira", "Wednesday": "quarta-feira",
    "Thursday": "quinta-feira", "Friday": "sexta-feira", "Saturday": "sábado", "Sunday": "domingo",
}

# ======================================================
# ► CIDADES PRINCIPAIS DO BRASIL (mantive seu dicionário)
# ======================================================
CIDADES_BRASIL = {
    # NORDESTE
    "Salvador (BA)": (-12.9714, -38.5108),
    "Paulo Afonso (BA)": (-9.3983, -38.2216),
    "Feira de Santana (BA)": (-12.2669, -38.9664),
    "Vitória da Conquista (BA)": (-15.1970, -40.8354),
    "Camaçari (BA)": (-12.6961, -38.3117),
    "Ilhéus (BA)": (-14.7937, -39.0494),
    "Barreiras (BA)": (-12.1439, -44.9968),
    "Irecê (BA)": (-11.3033, -41.8535),
    "Uauá (BA)": (-9.8330, -39.4795),
    "Guanambi (BA)": (-14.2231, -42.7814),
    "Fortaleza (CE)": (-3.7319, -38.5267),
    "Juazeiro do Norte (CE)": (-7.2081, -39.3149),
    "Sobral (CE)": (-3.68913, -40.34820),
    "Quixadá (CE)": (-4.96630, -39.01550),
    "Tauá (CE)": (-6.4783, -40.9893),
    "Recife (PE)": (-8.0539, -34.8811),
    "Olinda (PE)": (-8.0100, -34.8550),
    "Caruaru (PE)": (-8.2753, -35.9754),
    "Iati (PE)": (-9.0454, -36.8496),
    "Petrolina (PE)": (-9.3900, -40.5086),
    "Serra Talhada (PE)": (-7.9858, -38.2958),
    "Parnamirim (PE)": (-8.0906, -39.5783),
    "São Luís (MA)": (-2.5367, -44.3056),
    "Imperatriz (MA)": (-5.5261, -47.4786),
    "São José de Ribamar (MA)": (-2.5939, -44.0533),
    "Caxias (MA)": (-4.8617, -43.3553),
    "Timon (MA)": (-5.0874, -42.8306),
    "Balsas (MA)": (-7.5273, -46.0361),
    "Natal (RN)": (-5.80540, -35.20809),
    "Mossoró (RN)": (-5.18413, -37.34778),
    "Caicó (RN)": (-6.45997, -37.09369),
    "Lajes (RN)": (-5.69322, -36.24700),
    "Macau (RN)": (-5.10834, -36.63217),
    "João Pessoa (PB)": (-7.11509, -34.86410),
    "Campina Grande (PB)": (-7.23056, -35.88110),
    "Cajazeiras (PB)": (-6.88004, -38.55770),
    "Patos (PB)": (-7.03000, -37.28000),
    "Camalaú (PB)": (-7.88503, -36.82420),
    "Maceió (AL)": (-9.6658, -35.7351),
    "Arapiraca (AL)": (-9.7540, -36.6669),
    "Inhapi (AL)": (-9.2250, -37.7500),
    "Aracaju (SE)": (-10.9092, -37.0631),
    "Nossa Senhora da Glória (SE)": (-10.2473, -37.5293),
    "Teresina (PI)": (-5.0927, -42.8037),
    "Parnaíba (PI)": (-2.9031, -41.7769),
    "Picos (PI)": (-7.0753, -41.4725),
    "Piripiri (PI)": (-4.2750, -41.7825),
    "Floriano (PI)": (-6.7645, -43.0186),
    "Canto do Buriti (PI)": (-8.1111, -42.9517),
    "Redenção do Gurguéia (PI)": (-9.47937, -44.58110),

    # NORTE
    "Manaus (AM)": (-3.1190, -60.0217),
    "Belém (PA)": (-1.4558, -48.5044),
    "Castelo dos Sonhos (PA)": (-8.2976, -55.2570),
    "Itaituba (PA)": (-4.2767, -55.9836),
    "Macapá (AP)": (0.0350, -51.0705),
    "Rio Branco (AC)": (-9.9749, -67.8243),
    "Porto Velho (RO)": (-8.7608, -63.8999),
    "Boa Vista (RR)": (2.8235, -60.6758),
    "Palmas (TO)": (-10.2491, -48.3243),

    # CENTRO-OESTE
    "Brasília (DF)": (-15.7939, -47.8828),
    "Goiânia (GO)": (-16.6869, -49.2648),
    "Anápolis (GO)": (-16.3281, -48.9533),
    "Jataí (GO)": (-17.8881, -51.7169),
    "Cuiabá (MT)": (-15.6010, -56.0974),
    "Várzea Grande (MT)": (-15.6462, -56.1322),
    "Confresa (MT)": (-10.6437, -51.5699),
    "Nova Monte Verde (MT)": (-9.9996, -57.5260),
    "Campo Grande (MS)": (-20.4697, -54.6201),
    "Dourados (MS)": (-22.2231, -54.8120),

    # SUDESTE
    "São Paulo (SP)": (-23.5505, -46.6333),
    "Campinas (SP)": (-22.9056, -47.0608),
    "Ribeirão Preto (SP)": (-21.1775, -47.8103),
    "Santos (SP)": (-23.9608, -46.3337),
    "São José do Rio Preto (SP)": (-20.8196, -49.3797),
    "Cajati (SP)": (-24.7128, -48.0103),
    "Araçatuba (SP)": (-21.2053, -50.4392),
    "Rio de Janeiro (RJ)": (-22.9068, -43.1729),
    "Niterói (RJ)": (-22.8832, -43.1034),
    "Belo Horizonte (MG)": (-19.9167, -43.9345),
    "Uberlândia (MG)": (-18.9146, -48.2754),
    "Juiz de Fora (MG)": (-21.7642, -43.3496),
    "Montes Claros (MG)": (-16.7349, -43.8619),
    "Januária (MG)": (-15.4875, -44.3611),
    "Vitória (ES)": (-20.3155, -40.3128),
    "Vila Velha (ES)": (-20.3478, -40.2949),

    # SUL
    "Porto Alegre (RS)": (-30.0346, -51.2177),
    "Caxias do Sul (RS)": (-29.1670, -51.1790),
    "Pelotas (RS)": (-31.7654, -52.3371),
    "Florianópolis (SC)": (-27.5945, -48.5477),
    "Joinville (SC)": (-26.3044, -48.8487),
    "Blumenau (SC)": (-26.9180, -49.0653),
    "Chapecó (SC)": (-27.1004, -52.6152),
    "São Joaquim (SC)": (-28.2822, -49.9456),
    "Curitiba (PR)": (-25.4284, -49.2733),
    "Londrina (PR)": (-23.3045, -51.1696),
    "Cascavel (PR)": (-24.9556, -53.4557),
    "Guarapuava (PR)": (-25.3900, -51.4622),
    "Maringá (PR)": (-23.4205, -51.9331),
    "Santa Rosa (RS)": (-27.8702, -54.4804),
    "Ijuí (RS)": (-28.3880, -53.9190),
    "Uruguaiana (RS)": (-29.7602, -57.0852),
    "Bagé (RS)": (-31.3300, -54.1000),
}

# Colormap and níveis
nivels = [0, 0.5, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]
cores = [
    "#FFFFFF", "#cbcbcb", "#797979", "#4ffd72", "#006000", "#040CA5", "#5E8CFF", "#FFFF00",
    "#FFA500", "#FF0000", "#C00000", "#800000", "#330033", "#660066", "#c02ec0", "#FFBFF5"
]
color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)
tick_locs = [(nivels[i] + nivels[i + 1]) / 2 for i in range(len(nivels) - 1)]
tick_labels = [f"{nivels[i]}–{nivels[i + 1]}" for i in range(len(nivels) - 1)]
tick_labels[-1] = f">{nivels[-2]}"
extent = [-85, -30, -35, 10]

BBOX_STYLE = dict(boxstyle="round,pad=0.2", facecolor='black', alpha=0.8, edgecolor='black', linewidth=0.5)

out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

def get_text_color_from_value(value, levels, cmap_colors, threshold=0.5):
    """
    Função simples para escolher cor do texto. Mantive básica (branco sobre cores fortes).
    """
    if pd.isna(value) or value < levels[0]:
        return 'black'
    return 'white'

# ======================================================
# 2. Baixar ECMWF e processar (com suporte 00Z/12Z)
# ======================================================
def gerar_mapas():
    client = Client(source="azure")

    # Hora local BR (UTC-3)
    now_br = datetime.utcnow() - timedelta(hours=3)
    date_run = now_br.date()
    run_date_str = date_run.strftime("%Y%m%d")

    # Aqui escolho run_hour = 0 para tentar baixar a rodada 00Z/12Z via param 'time' = 0 (00Z).
    # A forma como você usa o client.retrieve pode requerer ajustes se você preferir buscar 12Z explicitamente.
    # Vou solicitar o arquivo da rodada 00Z (time=0) — se seu workflow às 18h precisa de 12Z, a data
    # usada abaixo (date_run) deve ser a apropriada; o seu workflow chama o script às 06h e 18h,
    # então a combinação do YAML + disponibilidade do ECMWF deve fornecer o arquivo certo.
    #
    # Para reduzir problemas, vamos tentar sempre baixar a rodada do dia atual time=0 (00Z).
    # Se você estiver rodando às 18h, a data_run já será o dia correto para a 12Z estar disponível
    # via arquivo (depende de como o provider entrega os gribs). Em muitos casos você precisa
    # alterar "time" para 12 quando quiser forçar 12Z; aqui mantive time=0 e deixei a detecção
    # do run_time a partir do arquivo GRIB (caso o GRIB existente/baixado seja 12Z, a lógica
    # funciona do mesmo jeito).
    run_hour = 0
    target_file = os.path.join(out_dir, f"dados_ecmwf_{run_date_str}.grib2")

    # steps: 0..144 step=3, depois 150..360 step=6 (igual ao seu)
    steps_all = list(range(0, 145, 3)) + list(range(150, 361, 6))
    request_params = {
        "date": run_date_str,
        "time": run_hour,
        "step": steps_all,
        "param": "tp",
        "type": "fc",
        "levtype": "sfc",
        "stream": "oper",
        "target": target_file
    }

    print(f"\n📡 Verificando ECMWF HRES {run_date_str} (solicitando time={run_hour}Z) ...")

    if not os.path.exists(target_file):
        try:
            print("⬇️  Arquivo não encontrado localmente. Tentando download...")
            client.retrieve(**request_params)
            print(f"✅ Download concluído: {target_file}")
        except Exception as e:
            print(f"❌ Erro ao baixar: {e}")
            if os.path.exists(target_file):
                print("⚠️ O arquivo local parece existir; continuando com versão local.")
            else:
                raise

    else:
        print(f"⚠️  O arquivo '{target_file}' já existe — usando versão local.")

    print("\n📂 Abrindo arquivo GRIB2...")
    ds = xr.open_dataset(target_file, engine="cfgrib", filter_by_keys={"typeOfLevel": "surface"})
    # 'tp' vem em metros (acumulado desde a rodada) — converter pra mm
    tp_mm = ds["tp"] * 1000.0

    # 'time' na coord é a hora da rodada (reference time). Garantimos pegar o primeiro valor.
    # Exemplo: 2025-11-23T00:00:00.000000000
    run_time = pd.to_datetime(tp_mm.coords["time"].values[0]).to_pydatetime()

    # Converter steps em datas/hora UTC relativamente à run_time
    # Nota: tp_mm.step são horas desde a rodada (inteiros)
    step_hours = tp_mm.coords["step"].values
    step_times = np.array([run_time + np.timedelta64(int(h), 'h') for h in step_hours], dtype='datetime64[ns]')

    print(f"ℹ️ Rodada detectada no GRIB (hora da rodada): {run_time:%Y-%m-%d %H:%M} UTC")
    print(f"ℹ️ Total de steps lidos: {len(step_hours)} (ex.: {step_hours[:5]} ... {step_hours[-5:]})")

    # UTC offset para hora local BR (UTC-3)
    utc_offset = -3  # se precisar ajustar para outro fuso, mude aqui
    n_days = 15
    daily = []

    # ===============================
    # Ajuste para suportar 00Z e 12Z
    # ===============================
    hora_rodada = run_time.hour  # normalmente 0 ou 12

    if hora_rodada == 12:
        inicio_primeiro_dia = datetime(run_time.year, run_time.month, run_time.day) + timedelta(days=1)
        offset_horas = 36  # 12Z: 00h do dia seguinte corresponde a 36h da rodada
        print("🔁 Rodada é 12Z — Dia 1 será 00h do dia seguinte (uso offset 36h).")
    else:
        inicio_primeiro_dia = datetime(run_time.year, run_time.month, run_time.day)
        offset_horas = 0
        print("🔁 Rodada é 00Z (ou hora não-12/0) — Dia 1 será 00h do mesmo dia (offset 0h).")

    # Gera os 15 dias (cada dia: 00-24h horário local BR)
    for day in range(n_days):
        # período 00–24h LOCAL do dia solicitado
        start_br = inicio_primeiro_dia + timedelta(days=day)
        end_br = start_br + timedelta(hours=24)

        # converte para UTC (subtrai o offset local)
        start_utc = start_br - timedelta(hours=utc_offset)
        end_utc = end_br - timedelta(hours=utc_offset)

        # soma offset relativo à rodada (0 para 00Z; 36 para 12Z)
        start_utc_with_offset = start_utc + timedelta(hours=offset_horas)
        end_utc_with_offset = end_utc + timedelta(hours=offset_horas)

        # encontra índices de step (menor diferença em valor absoluto)
        # step_times é array datetime64, convert to numpy datetime64 for comparisons
        start_idx = int(np.argmin(np.abs(step_times - np.datetime64(start_utc_with_offset))))
        end_idx = int(np.argmin(np.abs(step_times - np.datetime64(end_utc_with_offset))))

        # DEBUG logs (opcional)
        print(f"   ▶ Dia {day+1:02d}: {start_br:%Y-%m-%d %H:%M} to {end_br:%Y-%m-%d %H:%M} (UTC indices {start_idx}->{end_idx}; steps {step_hours[start_idx]}->{step_hours[end_idx]})")

        # cálculo do acumulado 24h:
        # - se o step inicial fosse 0 (ou igual ao end), apenas pega o valor direto
        # - caso contrário, subtrai o campo do step inicial do step final
        try:
            if start_idx == 0 or start_idx == end_idx:
                data_24h = tp_mm.isel(step=end_idx)
            else:
                data_24h = tp_mm.isel(step=end_idx) - tp_mm.isel(step=start_idx)
        except Exception as e:
            # fallback resiliente: tenta usar método alternativo
            print(f"   ⚠️ Erro ao calcular acumulado para dia {day+1}: {e}. Tentando usar isel(step=end_idx).")
            data_24h = tp_mm.isel(step=end_idx)

        daily.append({"data": data_24h, "start": start_br, "end": end_br})

    # ==============================
    # 3. Mapas diários
    # ==============================
    print("\n🗺️ Gerando mapas diários...")
    for idx, item in enumerate(daily):
        daynum = idx + 1
        rain = item["data"]
        start = item["start"]

        fig = plt.figure(figsize=(10, 8))
        ax = plt.axes(projection=ccrs.PlateCarree())
        ax.set_extent(extent, crs=ccrs.PlateCarree())
        ax.coastlines(resolution="10m", linewidth=0.8)
        ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries", "50m",
                                          edgecolor="black", facecolor="none", linewidth=0.8))
        ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines", "50m",
                                          edgecolor="black", facecolor="none", linewidth=0.8))
        ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)

        cf = rain.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                 cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)

        # Plot de valores por cidade
        print(f"   > Plotando valores de precipitação para o dia {start:%d-%m}...")
        for city, (lat, lon) in CIDADES_BRASIL.items():
            try:
                # selecionar o ponto mais próximo
                precip_value = rain.sel(latitude=lat, longitude=lon, method="nearest").item()
                precip_int = str(int(round(precip_value)))
                text_color = get_text_color_from_value(precip_value, nivels, cores)
                bbox_style = BBOX_STYLE
            except Exception:
                precip_int = "N/D"
                text_color = 'black'
                bbox_style = None

            ax.text(lon, lat, precip_int,
                    transform=ccrs.PlateCarree(),
                    fontsize=6,       # ajuste: 6 é legível em imagens grandes; ajuste se quiser
                    color=text_color,
                    weight='bold',
                    ha='center',
                    va='center',
                    bbox=bbox_style)

        dia_semana = dias_semana_pt[start.strftime("%A")]
        ax.set_title(f"({daynum:02d}) {start:%d-%m-%y} ({dia_semana})\nRodada ECMWF: {run_time:%d-%m-%Y %H:%MZ}",
                      fontsize=11, weight="bold")

        cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02)
        cbar.set_ticks(tick_locs)
        cbar.set_ticklabels(tick_labels)
        cbar.set_label("Precipitação (mm/24h)")

        fname = os.path.join(out_dir, f"{daynum:02d}.png")
        plt.savefig(fname, dpi=600, bbox_inches="tight")
        plt.close(fig)
        print(f"✅ Salvo: {fname}")

    # ==============================
    # 4. Mapa Acumulado (15 dias)
    # ==============================
    print("\n🧮 Calculando acumulado de 15 dias...")
    # alguns itens "data" podem ser DataArray; garantir soma nomeada
    accum_15d = None
    for item in daily:
        if accum_15d is None:
            accum_15d = item["data"].copy(deep=True)
        else:
            accum_15d = accum_15d + item["data"]

    start_acc = daily[0]['start']
    end_acc = daily[-1]['end']

    fig = plt.figure(figsize=(10, 8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent(extent, crs=ccrs.PlateCarree())
    ax.coastlines(resolution="10m", linewidth=0.8)
    ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries", "50m",
                                      edgecolor="black", facecolor="none", linewidth=0.8))
    ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines", "50m",
                                      edgecolor="black", facecolor="none", linewidth=0.8))
    ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)

    cf = accum_15d.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                  cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)

    print("\n📍 Plotando valores acumulados no mapa (15 dias)...")
    for city, (lat, lon) in CIDADES_BRASIL.items():
        try:
            precip_value = accum_15d.sel(latitude=lat, longitude=lon, method="nearest").item()
            precip_int = str(int(round(precip_value)))
            text_color = get_text_color_from_value(precip_value, nivels, cores)
            bbox_style = BBOX_STYLE
        except Exception:
            precip_int = "N/D"
            text_color = 'black'
            bbox_style = None

        ax.text(lon, lat, precip_int,
                transform=ccrs.PlateCarree(),
                fontsize=6,
                color=text_color,
                weight='bold',
                ha='center',
                va='center',
                bbox=bbox_style)

    ax.set_title(f"Precipitação acumulada - 15 dias\nPeríodo: {start_acc:%d-%m} até {end_acc:%d-%m}\nRodada ECMWF: {run_time:%d-%m-%Y %HZ}",
                  fontsize=12, weight="bold")

    cbar = plt.colorbar(cf, ax=ax, orientation="vertical", fraction=0.04, pad=0.02)
    cbar.set_ticks(tick_locs)
    cbar.set_ticklabels(tick_labels)
    cbar.set_label("Precipitação (mm/15 dias)")

    fname_acc = os.path.join(out_dir, "acumulado-15-dias.png")
    plt.savefig(fname_acc, dpi=600, bbox_inches="tight")
    plt.close(fig)
    print(f"✅ Salvo: {fname_acc}")

if __name__ == "__main__":
    gerar_mapas()
