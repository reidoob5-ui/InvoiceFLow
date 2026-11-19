import type { Metadata } from "next";
import LegalPage from "@/components/legal-page";

export const metadata: Metadata = { title: "Política de privacidade", alternates: { canonical: "/privacy" } };

export default function PrivacyPage() {
  return <LegalPage title="Política de privacidade" intro="Explicamos que dados recolhemos, para que os usamos e que direitos tens. Tratamos dados pessoais de acordo com a legislação aplicável, incluindo a lei angolana de protecção de dados pessoais e, quando relevante, o RGPD." sections={[
    { title: "Que dados recolhemos", body: ["Dados de conta: nome, email e palavra-passe (guardada apenas sob a forma de hash).", "Dados da empresa e do negócio que introduzes: dados de clientes e fornecedores, facturas, pagamentos, despesas e documentos.", "Dados técnicos: endereço IP, tipo de navegador e registos de segurança (por exemplo tentativas de início de sessão)."] },
    { title: "Para que os usamos", body: ["Para prestar o serviço, autenticar-te, proteger a conta contra abusos, processar pagamentos da subscrição, enviar emails de serviço e dar suporte.", "Não vendemos dados pessoais e não os usamos para publicidade de terceiros."] },
    { title: "Assistente de IA", body: ["Quando usas o assistente, um resumo dos dados financeiros da tua empresa e a tua pergunta são enviados ao fornecedor de IA (Anthropic) apenas para gerar a resposta. A utilização é opcional e depende do teu plano."] },
    { title: "Com quem partilhamos", body: ["Subcontratantes necessários ao serviço: alojamento (Vercel), base de dados (Neon), processadores de pagamento (Paddle, referência Multicaixa/ProxyPay), envio de email e, se usares o assistente, o fornecedor de IA.", "Também podemos divulgar dados quando a lei o exigir."] },
    { title: "Cookies", body: ["Usamos apenas um cookie de sessão estritamente necessário para manteres o início de sessão. Não usamos cookies de publicidade nem de rastreio de terceiros."] },
    { title: "Conservação", body: ["Mantemos os dados enquanto a conta estiver activa. Depois do encerramento, eliminamos ou anonimizamos os dados, excepto os que tenhamos de conservar por obrigação legal (por exemplo registos de facturação)."] },
    { title: "Segurança", body: ["Usamos ligações cifradas (HTTPS), palavras-passe com hash, sessões seguras, autenticação em dois passos opcional, controlo de acessos por perfil, registo de auditoria e isolamento dos dados de cada empresa."] },
    { title: "Os teus direitos", body: ["Podes pedir acesso, correcção, portabilidade e eliminação dos teus dados, bem como opor-te a certos tratamentos. Responderemos dentro dos prazos legais.", "Se entenderes que os teus direitos não foram respeitados, podes reclamar junto da autoridade de protecção de dados competente."] },
    { title: "Alterações", body: ["Se alterarmos esta política de forma relevante, actualizamos a data desta página e, quando adequado, avisamos-te por email."] },
  ]} />;
}
