/**
 * Mapa da aplicação para o assistente orientar o utilizador. Só estas rotas podem ser sugeridas como link.
 * Manter em sincronia com as páginas reais (app/*) e com os textos da interface.
 */
export const APP_ROUTES: Record<string, string> = {
  "/dashboard": "Visão geral do negócio",
  "/invoices": "Lista de facturas",
  "/invoices/new": "Criar uma nova factura",
  "/collections": "Cobranças: facturas em atraso e a vencer, com mensagens de cobrança (dívidas dos clientes à empresa)",
  "/quotes": "Orçamentos",
  "/clients": "Clientes",
  "/products": "Produtos e serviços",
  "/suppliers": "Fornecedores",
  "/expenses": "Despesas",
  "/bills": "Contas a pagar: facturas de fornecedores (dívidas da empresa)",
  "/taxes": "Impostos e taxas",
  "/reports": "Relatórios e fluxo de caixa",
  "/insights": "Inteligência financeira",
  "/business-planner": "Saúde do negócio: metas de vendas e reserva",
  "/fiscal": "Facturação electrónica AGT: perfil fiscal, séries, envio",
  "/team": "Equipa e acessos",
  "/billing": "Plano e subscrição",
  "/settings": "Definições da empresa",
  "/ai": "Página completa do assistente",
};

export const APP_GUIDE = [
  "GUIA DA APLICAÇÃO (usa-o para orientar o utilizador quando ele não souber onde fazer algo):",
  "- Emitir uma factura: Facturas > Nova factura (/invoices/new). Escolher o cliente, adicionar as linhas (produto/serviço, quantidade, preço, imposto) e guardar como rascunho. Depois abrir a factura e carregar em Emitir. Depois de emitida, os dados deixam de poder ser editados.",
  "- Na página de uma factura emitida: Ver PDF, enviar por email ao cliente, registar um recebimento (pagamento), anular, ou criar uma nota de crédito. O cliente tem também uma página pública com os dados de pagamento onde pode avisar que pagou.",
  "- Se a facturação AGT estiver activa, na página da factura emitida aparece o cartão Facturação electrónica AGT com o botão Certificar na AGT. O perfil fiscal, as séries e o estado dos envios estão em /fiscal.",
  "- Ver o que os clientes devem à empresa: Cobranças (/collections) e a lista de Facturas (/invoices) filtrada por estado.",
  "- Ver o que a empresa deve a fornecedores (dívidas da empresa): Contas a pagar (/bills). As despesas pagas ficam em Despesas (/expenses).",
  "- Orçamentos (/quotes): criar propostas, enviar ao cliente e converter os aceites em facturas.",
  "- Clientes, Produtos e serviços, Fornecedores: têm página própria para criar e editar registos.",
  "- Quanto entrou e saiu, fluxo de caixa: Relatórios (/reports). Riscos e prioridades: Inteligência financeira (/insights). Metas e reserva de segurança: Saúde do negócio (/business-planner).",
  "- Dados legais da empresa, NIF, moeda, instruções de pagamento: Definições (/settings). Convidar pessoas e definir permissões: Equipa (/team). Plano e limites: Plano e subscrição (/billing).",
  "Rotas que podes sugerir (e SÓ estas):",
  ...Object.entries(APP_ROUTES).map(([path, what]) => `  ${path} — ${what}`),
  "Para mandar o utilizador a uma página, escreve um link markdown com o caminho interno, por exemplo [Contas a pagar](/bills). Nunca inventes caminhos, não uses links externos e não descrevas botões que não estejam neste guia: se não tiveres a certeza onde algo está, di-lo e sugere a página mais próxima.",
].join("\n");
