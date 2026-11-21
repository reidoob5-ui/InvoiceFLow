# Subscrições e pagamentos manuais (IBAN / Multicaixa Express)

Fluxo pensado para Angola: o cliente paga fora da app, envia o comprovativo por WhatsApp e **só o administrador activa o plano**.

1. **Cliente** (Plano e subscrição → "Pagar por transferência…"): escolhe plano e periodicidade, recebe uma referência `IF-XXXXXX` e os dados de pagamento. Carrega em *Enviar comprovativo no WhatsApp* (abre o teu WhatsApp com a mensagem pronta) e depois em *Já enviei o comprovativo*. Nada muda no plano.
2. **Administrador** (`/admin` → Pagamentos): vê a fila (os que dizem que pagaram aparecem primeiro), confere o comprovativo no WhatsApp, marca a caixa de confirmação e carrega em *Confirmar e activar plano* (ou *Rejeitar* com motivo). Só isto activa o plano, e só rotas `/api/admin/*` (restritas a `isPlatformAdmin`) o podem fazer.
3. A confirmação é atómica (Serializable + UPDATE condicional OPEN→PAID): confirmar duas vezes não soma dois períodos. Se o plano já estava activo, o novo período soma-se ao que resta.
4. **Quem pagou e quem não pagou** (`/admin` → Subscrições): o estado é calculado com a mesma regra que bloqueia o cliente (`hasActiveAccess`): Pago, A expirar (≤7 dias), Não pago/expirado, Experimental, Suspenso. O cron diário passa a EXPIRED as subscrições manuais fora de prazo.
5. Acções manuais por empresa: estender dias, reactivar, suspender, mudar plano. Tudo fica no registo de auditoria (`billing.*`).

## Configuração
- `/admin` → **Dados de pagamento**: o teu WhatsApp (formato internacional, ex. `244923000000`), IBAN, banco, titular, número Multicaixa Express e uma nota.
- O cliente é avisado por email (confirmado/rejeitado) se `SMTP_*` estiver configurado; sem SMTP não envia nada.

## Limites conhecidos
- Não há lembrete automático antes de expirar (só o estado "A expirar" no painel).
- O comprovativo não é guardado na app: é conferido no WhatsApp, como pediste.
- Pagamentos ProxyPay/Paddle continuam a seguir os seus próprios webhooks.

## Cofre da administração (acesso reservado)
`/admin` e `/api/admin/*` têm quatro camadas, todas verificadas no servidor:
1. Sessão normal (email + senha da conta, e 2FA se activo) **e** `isPlatformAdmin`. Quem não é administrador recebe **404** (a área "não existe").
2. **Senha própria do admin**, diferente da senha da conta (mín. 14 caracteres), guardada com scrypt. Fica em `PlatformSetting` ou, se definires `ADMIN_ACCESS_HASH` na Vercel, só se muda lá.
3. **Entrada directa**: em `/admin` basta o **email + a senha do admin** (sem a senha da conta). O 2FA é opcional: só é pedido se a conta já o tiver activo, ou se definires `ADMIN_REQUIRE_2FA=1`. A primeira vez (ainda sem senha do admin) entras na conta normal e `/admin` leva-te a criar a senha.
4. **Bloqueio automático**: o cofre fecha após 15 min sem actividade e nunca fica aberto mais de 2 h; botão "Bloquear agora". 5 falhas em 15 min bloqueiam 15 min; 10 falhas em 24 h bloqueiam 1 h. Cada tentativa (boa ou má) fica no registo de auditoria.

Opcional: `ADMIN_ALLOWED_IPS=1.2.3.4,5.6.7.8` restringe a administração a esses IPs (cuidado com IPs dinâmicos/dados móveis). Com SMTP configurado, cada abertura do cofre envia um aviso por email.

Limites honestos: nenhum sistema é "impenetrável". Quem controlar a base de dados ou as variáveis da Vercel controla tudo; protege também a conta Vercel, GitHub, Neon e o email com 2FA.
