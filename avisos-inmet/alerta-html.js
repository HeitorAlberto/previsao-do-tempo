async function verificarAlertasInmet(cidadeNome, ufSigla) {
    try {
        // 1. Formata a chave igual ao dicionário Python: "CIDADE - UF"
        const chaveBusca = `${cidadeNome} - ${ufSigla}`.toUpperCase();

        // 2. Carrega as bases (usando caminhos relativos ao seu GitHub Pages)
        const [resRef, resAlertas] = await Promise.all([
            fetch('avisos-inmet/referencia_locais.json'),
            fetch('avisos-inmet/alertas_ativos.json')
        ]);

        const referencia = await resRef.json();
        const alertasAtivos = await resAlertas.json();

        // 3. Descobre a mesorregião do usuário
        const dadosLocal = referencia[chaveBusca];
        if (!dadosLocal) return; // Cidade não encontrada na base IBGE

        const mesoUsuario = dadosLocal.meso;

        // 4. Filtra alertas que incluem a mesorregião do usuário
        const alertasParaUsuario = alertasAtivos.filter(alerta => 
            alerta.areas.some(area => area.toLowerCase() === mesoUsuario.toLowerCase())
        );

        // 5. Se houver alertas, renderiza na tela
        if (alertasParaUsuario.length > 0) {
            exibirAvisoNaTela(alertasParaUsuario[0]); // Mostra o mais relevante
        }

    } catch (err) {
        console.error("Erro ao processar alertas:", err);
    }
}

function exibirAvisoNaTela(alerta) {
    // Aqui você cria o HTML seguindo o padrão do seu site
    const banner = document.createElement('div');
    banner.className = `alerta-inmet alerta-${alerta.severidade.toLowerCase()}`;
    banner.innerHTML = `
        <strong>AVISO INMET: ${alerta.evento}</strong><br>
        Severidade: ${alerta.severidade} | Fim: ${alerta.fim}
    `;
    document.body.prepend(banner); // Insere no topo
}