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
# ► NOVO DICIONÁRIO: CIDADES PRINCIPAIS DO BRASIL
#   (Inclui todas do Nordeste + Norte + Sul + Sudeste + Centro-Oeste)
# ======================================================
CIDADES_BRASIL = {

    # NORDESTE – (todas que você já tinha)
    "Salvador (BA)": (-12.9714, -38.5108),
    "Feira de Santana (BA)": (-12.2669, -38.9664),
    "Vitória da Conquista (BA)": (-15.1970, -40.8354),
    "Camaçari (BA)": (-12.6961, -38.3117),
    "Ilhéus (BA)": (-14.7937, -39.0494),
    "Barreiras (BA)": (-12.1439, -44.9968),
    "Irecê (BA)": (-11.3033, -41.8535),
    "Fortaleza (CE)": (-3.7319, -38.5267),
    "Juazeiro do Norte (CE)": (-7.2081, -39.3149),
    "Recife (PE)": (-8.0539, -34.8811),
    "Olinda (PE)": (-8.0100, -34.8550),
    "Caruaru (PE)": (-8.2753, -35.9754),
    "Petrolina (PE)": (-9.3900, -40.5086),
    "Serra Talhada (PE)": (-7.9858, -38.2958),
    "Parnamirim (PE)": (-8.0906, -39.5783),
    "São Luís (MA)": (-2.5367, -44.3056),
    "Imperatriz (MA)": (-5.5261, -47.4786),
    "São José de Ribamar (MA)": (-2.5939, -44.0533),
    "Caxias (MA)": (-4.8617, -43.3553),
    "Timon (MA)": (-5.0874, -42.8306),
    "Natal (RN)": (-5.7950, -35.2014),
    "Mossoró (RN)": (-5.1931, -37.3456),
    "Parnamirim (RN)": (-5.9189, -35.2443),
    "São Gonçalo do Amarante (RN)": (-5.7939, -35.3283),
    "Macaíba (RN)": (-5.8506, -35.3619),
    "João Pessoa (PB)": (-7.1197, -34.8450),
    "Campina Grande (PB)": (-7.2306, -35.8819),
    "Santa Rita (PB)": (-7.0699, -35.0354),
    "Itaporanga (PB)": (-7.3039, -38.1500),
    "Patos (PB)": (-7.0210, -37.2801),
    "Bayeux (PB)": (-7.0945, -34.9392),
    "Maceió (AL)": (-9.6658, -35.7351),
    "Arapiraca (AL)": (-9.7540, -36.6669),
    "Santana do Ipanema (AL)": (-9.3783, -37.2453),
    "Aracaju (SE)": (-10.9092, -37.0631),
    "Nossa Senhora do Socorro (SE)": (-10.8353, -37.1856),
    "Lagarto (SE)": (-10.9231, -37.6472),
    "Itabaiana (SE)": (-10.6861, -37.3197),
    "Estância (SE)": (-11.2721, -37.4410),
    "Teresina (PI)": (-5.0927, -42.8037),
    "Parnaíba (PI)": (-2.9031, -41.7769),
    "Picos (PI)": (-7.0753, -41.4725),
    "Piripiri (PI)": (-4.2750, -41.7825),
    "Floriano (PI)": (-6.7645, -43.0186),

    # NORTE
    "Manaus (AM)": (-3.1190, -60.0217),
    "Belém (PA)": (-1.4558, -48.5044),
    "Macapá (AP)": (0.0350, -51.0705),
    "Rio Branco (AC)": (-9.9749, -67.8243),
    "Porto Velho (RO)": (-8.7608, -63.8999),
    "Boa Vista (RR)": (2.8235, -60.6758),
    "Palmas (TO)": (-10.2491, -48.3243),

    # CENTRO-OESTE
    "Brasília (DF)": (-15.7939, -47.8828),
    "Goiânia (GO)": (-16.6869, -49.2648),
    "Anápolis (GO)": (-16.3281, -48.9533),
    "Cuiabá (MT)": (-15.6010, -56.0974),
    "Várzea Grande (MT)": (-15.6462, -56.1322),
    "Campo Grande (MS)": (-20.4697, -54.6201),
    "Dourados (MS)": (-22.2231, -54.8120),

    # SUDESTE
    "São Paulo (SP)": (-23.5505, -46.6333),
    "Campinas (SP)": (-22.9056, -47.0608),
    "Ribeirão Preto (SP)": (-21.1775, -47.8103),
    "Santos (SP)": (-23.9608, -46.3337),
    "Rio de Janeiro (RJ)": (-22.9068, -43.1729),
    "Niterói (RJ)": (-22.8832, -43.1034),
    "Belo Horizonte (MG)": (-19.9167, -43.9345),
    "Uberlândia (MG)": (-18.9146, -48.2754),
    "Juiz de Fora (MG)": (-21.7642, -43.3496),
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
    "Curitiba (PR)": (-25.4284, -49.2733),
    "Londrina (PR)": (-23.3045, -51.1696),
    "Maringá (PR)": (-23.4205, -51.9331),
    "Santa Rosa (RS)": (-27.8702, -54.4804),
    "Ijuí (RS)": (-28.3880, -53.9190),
    "Uruguaiana (RS)": (-29.7602, -57.0852),
}

nivels = [0, 0.5, 2, 5, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 400, 500]
cores = ["#FFFFFF","#cbcbcb","#797979","#4ffd72","#006000","#040CA5","#5E8CFF","#FFFF00",
          "#FFA500","#FF0000","#C00000","#800000","#330033","#660066","#c02ec0","#FFBFF5"]

color_map = ListedColormap(cores)
norma = BoundaryNorm(nivels, color_map.N)
tick_locs = [(nivels[i]+nivels[i+1])/2 for i in range(len(nivels)-1)]
tick_labels = [f"{nivels[i]}–{nivels[i+1]}" for i in range(len(nivels)-1)]
tick_labels[-1] = f">{nivels[-2]}"
extent = [-85, -30, -35, 10]

BBOX_STYLE = dict(boxstyle="round,pad=0.2", facecolor='black', alpha=0.8, edgecolor='black', linewidth=0.5)

out_dir = "mapas"
os.makedirs(out_dir, exist_ok=True)

def get_text_color_from_value(value, levels, cmap_colors, threshold=0.5):
    if pd.isna(value) or value < levels[0]: 
        return 'black'
    return 'white'

# ======================================================
# 2. Baixar ECMWF e processar (SEM ALTERAÇÕES)
# ======================================================
def gerar_mapas():
    client = Client(source="azure")

    now_br = datetime.utcnow() - timedelta(hours=3)
    date_run = now_br.date()
    run_date_str = date_run.strftime("%Y%m%d")
    run_hour = 0
    target_file = os.path.join(out_dir, f"dados_ecmwf_{run_date_str}.grib2")

    steps_all = list(range(0,145,3)) + list(range(150,361,6))
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

    print(f"\n📡 Verificando ECMWF HRES {run_date_str} 00Z...")

    if not os.path.exists(target_file):
        print("⬇️  Arquivo não encontrado. Iniciando download...")
        client.retrieve(**request_params)
        print(f"✅ Download concluído: {target_file}")
    else:
        print(f"⚠️  O arquivo '{target_file}' já existe — usando versão local.")

    print("\n📂 Abrindo arquivo GRIB2...")
    ds = xr.open_dataset(target_file, engine="cfgrib", filter_by_keys={"typeOfLevel": "surface"})
    tp_mm = ds["tp"] * 1000.0
    run_time = pd.to_datetime(tp_mm["time"].item()).to_pydatetime()
    utc_offset = -3
    n_days = 15
    daily = []
    step_times = run_time + pd.to_timedelta(tp_mm.step.values, unit='h')

    for day in range(n_days):
        start_br = datetime(run_time.year, run_time.month, run_time.day) + timedelta(days=day)
        end_br   = start_br + timedelta(hours=24)
        start_br_utc = start_br - timedelta(hours=utc_offset)
        end_br_utc   = end_br - timedelta(hours=utc_offset)
        
        step_start = np.argmin(np.abs(step_times - start_br_utc))
        step_end   = np.argmin(np.abs(step_times - end_br_utc))

        data_24h = tp_mm.isel(step=step_end) if day == 0 else tp_mm.isel(step=step_end) - tp_mm.isel(step=step_start)
        daily.append({"data": data_24h, "start": start_br, "end": end_br})

    # ==============================
    # 3. Mapas diários
    # ==============================
    print("\n🗺️ Gerando mapas diários...")
    for idx, item in enumerate(daily):
        daynum = idx + 1
        rain = item["data"]
        start = item["start"]

        fig = plt.figure(figsize=(10,8))
        ax = plt.axes(projection=ccrs.PlateCarree())
        ax.set_extent(extent, crs=ccrs.PlateCarree())
        ax.coastlines(resolution="10m", linewidth=0.8)
        ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.8))
        ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.8))
        ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
        
        cf = rain.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                 cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)

        # ------------------------------------------
        # ► ALTERAÇÃO 1: FONTE MUITO MENOR (0.8)
        # ------------------------------------------
        print(f"   > Plotando valores de precipitação para o dia {start:%d-%m}...")
        for city, (lat, lon) in CIDADES_BRASIL.items():
            try:
                precip_value = rain.sel(latitude=lat, longitude=lon, method="nearest").item()
                precip_int = str(int(round(precip_value)))
                text_color = 'white'
                bbox_style = BBOX_STYLE
            except:
                precip_int = "N/D"
                text_color = 'black'
                bbox_style = None

            ax.text(lon, lat, precip_int,
                    transform=ccrs.PlateCarree(),
                    fontsize=2,       # <<< MUITO MENOR
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
        plt.savefig(fname, dpi=300, bbox_inches="tight")
        plt.close(fig)
        print(f"✅ Salvo: {fname}")

    # ==============================
    # 4. Mapa Acumulado
    # ==============================
    accum_15d = sum([item["data"] for item in daily])
    start_acc = daily[0]['start']
    end_acc = daily[-1]['end']

    fig = plt.figure(figsize=(10,8))
    ax = plt.axes(projection=ccrs.PlateCarree())
    ax.set_extent(extent, crs=ccrs.PlateCarree())
    ax.coastlines(resolution="10m", linewidth=0.8)
    ax.add_feature(NaturalEarthFeature("cultural", "admin_0_countries","50m", edgecolor="black", facecolor="none", linewidth=0.8))
    ax.add_feature(NaturalEarthFeature("cultural", "admin_1_states_provinces_lines","50m", edgecolor="black", facecolor="none", linewidth=0.8))
    ax.gridlines(draw_labels=False, linestyle="--", alpha=0.4)
    
    cf = accum_15d.plot.contourf(ax=ax, transform=ccrs.PlateCarree(),
                                  cmap=color_map, norm=norma, levels=nivels, extend="max", add_colorbar=False)

    print("\n📍 Plotando valores acumulados no mapa (15 dias)...")
    for city, (lat, lon) in CIDADES_BRASIL.items():
        try:
            precip_value = accum_15d.sel(latitude=lat, longitude=lon, method="nearest").item()
            precip_int = str(int(round(precip_value)))
            text_color = 'white'
            bbox_style = BBOX_STYLE
        except:
            precip_int = "N/D"
            text_color = 'black'
            bbox_style = None

        ax.text(lon, lat, precip_int,
                transform=ccrs.PlateCarree(),
                fontsize=2,       
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
