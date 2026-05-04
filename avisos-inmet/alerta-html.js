export async function verificarAlertasInmet(cidade, estado) {
    const avisoAntigo = document.getElementById('alerta-inmet-container');
    if (avisoAntigo) avisoAntigo.remove();

    try {
        const normalize = str =>
            str
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toUpperCase();

        const cidadeNormalizada = normalize(cidade);

        const [resRef, resAlertas] = await Promise.all([
            fetch('avisos-inmet/referencia_locais.json'),
            fetch('avisos-inmet/alertas_ativos.json')
        ]);

        if (!resRef.ok || !resAlertas.ok) return;

        const referencia = await resRef.json();
        const alertasAtivos = await resAlertas.json();

        const entrada = Object.entries(referencia).find(([key]) =>
            normalize(key).startsWith(cidadeNormalizada)
        );

        if (!entrada) return;

        const dadosLocal = entrada[1];
        const mesoUsuario = dadosLocal.meso.toLowerCase();

        const agora = new Date();

        const alertasFiltrados = alertasAtivos
            .filter(alerta =>
                alerta.areas.some(area => area.toLowerCase() === mesoUsuario)
            )
            .map(a => ({
                ...a,
                inicioDate: new Date(a.inicio || a.inicioISO || a.fim),
                fimDate: new Date(a.fim)
            }))
            .filter(a => a.fimDate > agora);

        if (alertasFiltrados.length === 0) return;

        const peso = (sev) => {
            if (sev === "Extremo") return 3;
            if (sev === "Médio") return 2;
            return 1;
        };

        const selecionados = alertasFiltrados
            .sort((a, b) => {
                const diffInicio = a.inicioDate - b.inicioDate;
                if (diffInicio !== 0) return diffInicio;
                return peso(b.severidade) - peso(a.severidade);
            })
            .slice(0, 2);

        exibirBanner(selecionados);

    } catch (err) {
        console.error("Erro ao carregar alertas:", err);
    }
}

// 🔧 converte severidade → padrão INMET
function getCorInmet(severidade) {
    if (severidade === "Extremo") return "VERMELHO";
    if (severidade === "Médio") return "LARANJA";
    return "AMARELO";
}

function formatarData(data) {
    const d = new Date(data);
    const hora = d.getHours().toString().padStart(2, '0') + "h";
    const dia = d.toLocaleDateString('pt-BR');
    return `${hora} de ${dia}`;
}

function exibirBanner(alertas) {
    const main = document.querySelector('main');
    const forecastSection = document.getElementById('forecastSection');

    const estilos = {
        "VERMELHO": { bg: "#ffc3c8", border: "#f8d7da", texto: "#000" },
        "LARANJA": { bg: "#ffdec0", border: "#ffc198", texto: "#000" },
        "AMARELO": { bg: "#fffdbf", border: "#fffc97", texto: "#000" }
    };

    const container = document.createElement('div');
    container.id = 'alerta-inmet-container';
    container.style.cssText = `
        margin: 0 auto 30px auto;
        width: 700px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    `;

    alertas.forEach(alerta => {
        const cor = getCorInmet(alerta.severidade);
        const estilo = estilos[cor];

        const bloco = document.createElement('div');
        bloco.style.cssText = `
            background-color: ${estilo.bg};
            border: 2px solid ${estilo.border};
            color: ${estilo.texto};
            padding: 15px;
            border-radius: 8px;
            text-align: center;
        `;

        const inicio = formatarData(alerta.inicio || alerta.inicioISO || alerta.fim);
        const fim = formatarData(alerta.fim);

        bloco.innerHTML = `
            <div style="font-weight: bold; font-size: 1.05em; margin-bottom: 6px;">
                ⚠️ ALERTA ${cor} INMET - ${alerta.evento.toUpperCase()}
            </div>

            <div style="font-size: 0.9em; margin-bottom: 10px;">
                ${inicio} até ${fim}
            </div>

            <a href="${alerta.link}" target="_blank"
                style="color: ${estilo.texto}; font-weight: bold; text-decoration: underline;">
                Ver detalhes oficiais
            </a>
        `;

        container.appendChild(bloco);
    });

    main.insertBefore(container, forecastSection);
}