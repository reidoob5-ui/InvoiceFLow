export const LOCALES = ["pt", "en", "fr", "es"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pt";

export const LOCALE_NAMES: Record<Locale, string> = { pt: "Português", en: "English", fr: "Français", es: "Español" };

type Dict = Record<string, string>;

const pt: Dict = {
  "nav.dashboard": "Painel", "nav.invoices": "Facturas", "nav.quotes": "Orçamentos", "nav.clients": "Clientes",
  "nav.products": "Produtos e serviços", "nav.payments": "Pagamentos", "nav.expenses": "Despesas",
  "nav.suppliers": "Fornecedores", "nav.cashflow": "Fluxo de caixa", "nav.reports": "Relatórios",
  "nav.taxes": "Impostos", "nav.assistant": "Assistente IA", "nav.team": "Equipa", "nav.settings": "Definições",
  "nav.billing": "Plano e subscrição", "nav.admin": "Administração",
  "common.save": "Guardar", "common.cancel": "Cancelar", "common.delete": "Eliminar", "common.edit": "Editar",
  "common.create": "Criar", "common.search": "Pesquisar", "common.export": "Exportar", "common.status": "Estado",
  "common.total": "Total", "common.date": "Data", "common.client": "Cliente", "common.actions": "Acções",
  "common.none": "Sem registos.", "common.back": "Voltar",
  "auth.login": "Entrar", "auth.logout": "Sair", "auth.register": "Criar conta", "auth.email": "E-mail",
  "auth.password": "Palavra-passe", "auth.forgot": "Esqueci-me da palavra-passe",
  "invoice.new": "Nova factura", "invoice.number": "Número", "invoice.due": "Vencimento",
  "invoice.subtotal": "Subtotal", "invoice.tax": "Impostos", "invoice.withholding": "Retenção",
  "invoice.balance": "Saldo em dívida", "invoice.issue": "Emitir", "invoice.void": "Anular",
  "invoice.send": "Enviar por e-mail", "invoice.pdf": "Descarregar PDF",
  "status.DRAFT": "Rascunho", "status.ISSUED": "Emitida", "status.PARTIALLY_PAID": "Parcialmente paga",
  "status.PAID": "Paga", "status.OVERDUE": "Vencida", "status.VOID": "Anulada",
};

const en: Dict = {
  "nav.dashboard": "Dashboard", "nav.invoices": "Invoices", "nav.quotes": "Quotes", "nav.clients": "Clients",
  "nav.products": "Products & services", "nav.payments": "Payments", "nav.expenses": "Expenses",
  "nav.suppliers": "Suppliers", "nav.cashflow": "Cash flow", "nav.reports": "Reports",
  "nav.taxes": "Taxes", "nav.assistant": "AI assistant", "nav.team": "Team", "nav.settings": "Settings",
  "nav.billing": "Plan & billing", "nav.admin": "Administration",
  "common.save": "Save", "common.cancel": "Cancel", "common.delete": "Delete", "common.edit": "Edit",
  "common.create": "Create", "common.search": "Search", "common.export": "Export", "common.status": "Status",
  "common.total": "Total", "common.date": "Date", "common.client": "Client", "common.actions": "Actions",
  "common.none": "No records.", "common.back": "Back",
  "auth.login": "Sign in", "auth.logout": "Sign out", "auth.register": "Create account", "auth.email": "Email",
  "auth.password": "Password", "auth.forgot": "Forgot your password?",
  "invoice.new": "New invoice", "invoice.number": "Number", "invoice.due": "Due date",
  "invoice.subtotal": "Subtotal", "invoice.tax": "Tax", "invoice.withholding": "Withholding",
  "invoice.balance": "Balance due", "invoice.issue": "Issue", "invoice.void": "Void",
  "invoice.send": "Send by email", "invoice.pdf": "Download PDF",
  "status.DRAFT": "Draft", "status.ISSUED": "Issued", "status.PARTIALLY_PAID": "Partially paid",
  "status.PAID": "Paid", "status.OVERDUE": "Overdue", "status.VOID": "Void",
};

const fr: Dict = {
  "nav.dashboard": "Tableau de bord", "nav.invoices": "Factures", "nav.quotes": "Devis", "nav.clients": "Clients",
  "nav.products": "Produits et services", "nav.payments": "Paiements", "nav.expenses": "Dépenses",
  "nav.suppliers": "Fournisseurs", "nav.cashflow": "Trésorerie", "nav.reports": "Rapports",
  "nav.taxes": "Taxes", "nav.assistant": "Assistant IA", "nav.team": "Équipe", "nav.settings": "Paramètres",
  "nav.billing": "Abonnement", "nav.admin": "Administration",
  "common.save": "Enregistrer", "common.cancel": "Annuler", "common.delete": "Supprimer", "common.edit": "Modifier",
  "common.create": "Créer", "common.search": "Rechercher", "common.export": "Exporter", "common.status": "Statut",
  "common.total": "Total", "common.date": "Date", "common.client": "Client", "common.actions": "Actions",
  "common.none": "Aucun enregistrement.", "common.back": "Retour",
  "auth.login": "Se connecter", "auth.logout": "Se déconnecter", "auth.register": "Créer un compte", "auth.email": "E-mail",
  "auth.password": "Mot de passe", "auth.forgot": "Mot de passe oublié ?",
  "invoice.new": "Nouvelle facture", "invoice.number": "Numéro", "invoice.due": "Échéance",
  "invoice.subtotal": "Sous-total", "invoice.tax": "Taxes", "invoice.withholding": "Retenue",
  "invoice.balance": "Solde dû", "invoice.issue": "Émettre", "invoice.void": "Annuler",
  "invoice.send": "Envoyer par e-mail", "invoice.pdf": "Télécharger le PDF",
  "status.DRAFT": "Brouillon", "status.ISSUED": "Émise", "status.PARTIALLY_PAID": "Partiellement payée",
  "status.PAID": "Payée", "status.OVERDUE": "En retard", "status.VOID": "Annulée",
};

const es: Dict = {
  "nav.dashboard": "Panel", "nav.invoices": "Facturas", "nav.quotes": "Presupuestos", "nav.clients": "Clientes",
  "nav.products": "Productos y servicios", "nav.payments": "Pagos", "nav.expenses": "Gastos",
  "nav.suppliers": "Proveedores", "nav.cashflow": "Flujo de caja", "nav.reports": "Informes",
  "nav.taxes": "Impuestos", "nav.assistant": "Asistente IA", "nav.team": "Equipo", "nav.settings": "Ajustes",
  "nav.billing": "Plan y suscripción", "nav.admin": "Administración",
  "common.save": "Guardar", "common.cancel": "Cancelar", "common.delete": "Eliminar", "common.edit": "Editar",
  "common.create": "Crear", "common.search": "Buscar", "common.export": "Exportar", "common.status": "Estado",
  "common.total": "Total", "common.date": "Fecha", "common.client": "Cliente", "common.actions": "Acciones",
  "common.none": "Sin registros.", "common.back": "Volver",
  "auth.login": "Iniciar sesión", "auth.logout": "Cerrar sesión", "auth.register": "Crear cuenta", "auth.email": "Correo",
  "auth.password": "Contraseña", "auth.forgot": "¿Olvidaste tu contraseña?",
  "invoice.new": "Nueva factura", "invoice.number": "Número", "invoice.due": "Vencimiento",
  "invoice.subtotal": "Subtotal", "invoice.tax": "Impuestos", "invoice.withholding": "Retención",
  "invoice.balance": "Saldo pendiente", "invoice.issue": "Emitir", "invoice.void": "Anular",
  "invoice.send": "Enviar por correo", "invoice.pdf": "Descargar PDF",
  "status.DRAFT": "Borrador", "status.ISSUED": "Emitida", "status.PARTIALLY_PAID": "Pagada parcialmente",
  "status.PAID": "Pagada", "status.OVERDUE": "Vencida", "status.VOID": "Anulada",
};

const DICTS: Record<Locale, Dict> = { pt, en, fr, es };

export function isLocale(v: string | null | undefined): v is Locale {
  return !!v && (LOCALES as readonly string[]).includes(v);
}

/** Translate a key; falls back to Portuguese, then to the key itself so a missing string is visible, not blank. */
export function t(locale: string, key: string): string {
  const l = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return DICTS[l][key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
}

export function dictionaryKeys(locale: Locale): string[] {
  return Object.keys(DICTS[locale]);
}
