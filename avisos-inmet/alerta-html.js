export async function verificarAlertasInmet(cidade, estado) {
    // Remove qualquer aviso anterior para não duplicar
    const avisoAntigo = document.getElementById('alerta-inmet-container');
    if (avisoAntigo) avisoAntigo.remove();

    try {
        const chaveBusca = `${cidade} - ${estado}`.toUpperCase();

        // Busca as bases no seu repositório GitHub
        const [resRef, resAlertas] = await Promise.all([
            fetch('avisos-inmet/referencia_locais.json'),
            fetch('avisos-inmet/alertas_ativos.json')
        ]);

        if (!resRef.ok || !resAlertas.ok) return;

        const referencia = await resRef.json();
        const alertasAtivos = await resAlertas.json();

        // 1. Acha a mesorregião do usuário
        const dadosLocal = referencia[chaveBusca];
        if (!dadosLocal) return;

        const mesoUsuario = dadosLocal.meso.toLowerCase();

        // 2. Cruza com os alertas ativos
        const alertaParaExibir = alertasAtivos.find(alerta =>
            alerta.areas.some(area => area.toLowerCase() === mesoUsuario)
        );

        // 3. Se houver alerta, injeta no HTML
        if (alertaParaExibir) {
            exibirBanner(alertaParaExibir);
        }
    } catch (err) {
        console.error("Erro ao carregar alertas:", err);
    }
}

function exibirBanner(alerta) {
    const main = document.querySelector('main');
    const forecastSection = document.getElementById('forecastSection');

    // Cores baseadas na severidade do seu script Python
    const estilos = {
        "Baixo": { bg: "#fff3cd", border: "#ffeeba", texto: "#856404" },   // Amarelo
        "Médio": { bg: "#fff3cd", border: "#ffa000", texto: "#856404" },   // Laranja
        "Extremo": { bg: "#f8d7da", border: "#f5c6cb", texto: "#721c24" }  // Vermelho
    };

    const estilo = estilos[alerta.severidade] || estilos["Baixo"];

    const banner = document.createElement('div');
    banner.id = 'alerta-inmet-container';
    banner.style.cssText = `
        background-color: ${estilo.bg};
        border: 2px solid ${estilo.border};
        color: ${estilo.texto};
        padding: 15px;
        margin: 0 auto 30px auto;
        max-width: 800px;
        border-radius: 8px;
        text-align: center;
        font-family: sans-serif;
    `;

    banner.innerHTML = `
        <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 5px;">
            ⚠️ AVISO INMET: ${alerta.evento.toUpperCase()} (${alerta.severidade})
        </div>
        <div style="font-size: 0.9em; margin-bottom: 10px;">
            Válido até: ${alerta.fim}
        </div>
        <a href="${alerta.link}" target="_blank" style="color: ${estilo.texto}; font-weight: bold; text-decoration: underline;">
            Ver detalhes oficiais
        </a>
    `;

    // Insere antes da seção de cards
    main.insertBefore(banner, forecastSection);
}