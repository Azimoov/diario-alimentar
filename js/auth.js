// auth.js — conta do usuário (login por e-mail) e sincronização na nuvem.
//
// A SENHA NUNCA SAI DESTE APARELHO: aqui rodamos PBKDF2 (250k, SHA-256, sal
// derivado do e-mail) e mandamos só o `authKey` resultante. O servidor guarda
// um HMAC disso — se o banco dele vazar, ninguém entra na sua conta.
//
// Honestidade sobre o modelo escolhido: os DADOS na nuvem são cifrados com
// uma chave DO SERVIDOR, não com a sua senha. É isso que permite "esqueci
// minha senha" funcionar de verdade — e implica que quem controla o proxy
// consegue ler os dados. O caminho antigo (Backup por senha do app) segue
// disponível para quem quiser sigilo absoluto, ao custo de não ter recuperação.

window.Auth = (function () {
  'use strict';

  // Endereço embutido: assim o usuário só faz login, sem preencher nada.
  // Pode ser sobreposto em Dados (útil p/ quem publica o próprio proxy).
  const PROXY_PADRAO = 'https://diario-alimentar-proxy.azimoov.workers.dev';
  const ITERACOES = 250000;
  const TE = new TextEncoder();

  function base() {
    const S = window.Store.get();
    const url = (S.settings && S.settings.proxyUrl) || PROXY_PADRAO;
    return String(url).replace(/\/+$/, '');
  }
  function conta() {
    const S = window.Store.get();
    S.settings.account = S.settings.account || { email: null, session: null, lastSyncAt: null };
    return S.settings.account;
  }
  function logado() { return !!conta().session; }
  function email() { return conta().email; }

  // ---- porteiro único p/ as rotas de IA (foto, rótulo, análise, base comum).
  // Vale a sessão da conta OU a senha antiga do app: quem fez login não
  // precisa preencher mais nada.
  function podeUsarProxy() {
    const S = window.Store.get();
    return logado() || !!(S.settings && S.settings.proxyUrl && S.settings.proxyToken);
  }
  function cabecalhosProxy(extra) {
    const S = window.Store.get();
    const h = Object.assign({}, extra || {});
    if (logado()) h['X-Session'] = conta().session;
    else if (S.settings && S.settings.proxyToken) h['X-App-Token'] = S.settings.proxyToken;
    return h;
  }
  function urlProxy(rota) { return base() + (rota || ''); }

  function hex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Deriva o authKey a partir de e-mail + senha. Custa ~0,3–1 s no celular:
  // é de propósito (encarece a força bruta de quem roubar o banco).
  async function derivarAuthKey(mail, senha) {
    if (!(window.crypto && crypto.subtle)) {
      throw new Error('Este navegador não permite login seguro (precisa de HTTPS).');
    }
    const salt = await crypto.subtle.digest('SHA-256', TE.encode('highlander-auth:' + String(mail).trim().toLowerCase()));
    const baseKey = await crypto.subtle.importKey('raw', TE.encode(senha), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: ITERACOES, hash: 'SHA-256' }, baseKey, 256);
    return hex(bits);
  }

  async function chamar(rota, opts) {
    opts = opts || {};
    const headers = { 'Content-Type': 'application/json' };
    const c = conta();
    if (c.session) headers['X-Session'] = c.session;
    let res;
    try {
      res = await fetch(base() + rota, {
        method: opts.method || 'POST',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (e) {
      throw new Error('Sem conexão com o servidor. Verifique a internet e tente de novo.');
    }
    let data = null;
    try { data = await res.json(); } catch { /* resposta sem corpo */ }
    if (!res.ok) {
      let msg = (data && (data.detail || data.error)) || ('HTTP ' + res.status);
      // Servidor ainda na versão antiga (sem as rotas de conta): ele barra
      // /auth/* no porteiro da senha do app. Sem esta dica, o usuário vê
      // "senha do app incorreta" ao tentar criar conta e não entende nada.
      const semRota = rota.indexOf('/auth/') === 0
        && (res.status === 404 || res.status === 405
          || (res.status === 401 && /senha do app/i.test(msg)));
      if (semRota) {
        msg = 'O servidor ainda não foi atualizado para aceitar contas. '
          + 'Quem administra precisa publicar a versão nova do proxy (npx wrangler deploy) '
          + 'e cadastrar os segredos DATA_KEY, INVITE_CODE e RESEND_API_KEY.';
      }
      const err = new Error(msg);
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data || {};
  }

  function guardarSessao(data) {
    const c = conta();
    c.email = data.email;
    c.session = data.session;
    window.Store.save();
  }

  // ---- ações de conta ------------------------------------------------------
  async function criarConta(mail, senha, convite) {
    const authKey = await derivarAuthKey(mail, senha);
    guardarSessao(await chamar('/auth/signup', { body: { email: mail, authKey, invite: convite } }));
  }
  async function entrar(mail, senha) {
    const authKey = await derivarAuthKey(mail, senha);
    guardarSessao(await chamar('/auth/login', { body: { email: mail, authKey } }));
  }
  async function esqueciSenha(mail) {
    return chamar('/auth/forgot', { body: { email: mail } });
  }
  // usada pelo link do e-mail (#recuperar=token): precisa do e-mail para o sal
  async function redefinirSenha(token, mail, novaSenha) {
    const authKey = await derivarAuthKey(mail, novaSenha);
    guardarSessao(await chamar('/auth/reset', { body: { token, authKey } }));
  }
  async function trocarSenha(senhaAtual, novaSenha) {
    const mail = email();
    if (!mail) throw new Error('Você não está logado.');
    await chamar('/auth/password', {
      body: {
        authKeyAtual: await derivarAuthKey(mail, senhaAtual),
        authKeyNova: await derivarAuthKey(mail, novaSenha),
      },
    });
  }
  async function sair() {
    try { await chamar('/auth/logout', { body: {} }); } catch (e) { /* offline: some localmente do mesmo jeito */ }
    const c = conta();
    c.email = null; c.session = null; c.lastSyncAt = null;
    window.Store.save();
  }
  // confere se a sessão guardada ainda vale (chamado ao abrir o app)
  async function validarSessao() {
    if (!logado()) return false;
    try {
      const me = await chamar('/auth/me', { method: 'GET' });
      conta().email = me.email;
      window.Store.save();
      return true;
    } catch (e) {
      if (e.status === 401) {   // expirou/foi revogada: limpa só a sessão
        const c = conta();
        c.session = null;
        window.Store.save();
      }
      return false;            // erro de rede não desloga ninguém
    }
  }

  // ---- dados na nuvem ------------------------------------------------------
  // Devolve {state, updatedAt} ou null se a conta ainda não tem nada.
  async function baixarDados() {
    try {
      return await chamar('/account/data', { method: 'GET' });
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  async function enviarDados() {
    if (!logado()) return false;
    // paraNuvem: sem sessão e sem o catálogo comum de alimentos (esse é
    // compartilhado e o servidor já o serve em /foods)
    const state = window.Store.exportJSON({ paraNuvem: true });
    await chamar('/account/data', { method: 'PUT', body: { state, updatedAt: new Date().toISOString() } });
    conta().lastSyncAt = new Date().toISOString();
    window.Store.save();
    return true;
  }

  // ---- chave da API da própria pessoa (fica só no servidor, cifrada) ----
  async function statusChave() { return chamar('/account/apikey', { method: 'GET' }); }
  async function salvarChave(apiKey) { return chamar('/account/apikey', { method: 'PUT', body: { apiKey } }); }
  async function removerChave() { return chamar('/account/apikey', { method: 'DELETE' }); }

  // Envio com atraso: junta várias edições seguidas num só envio.
  //
  // TRAVA IMPORTANTE: nada é enviado antes de `liberarEnvio()`. Ao abrir o
  // app ainda não sabemos se a nuvem tem algo MAIS NOVO (feito em outro
  // aparelho); enviar às cegas sobrescreveria esse histórico. Quem decide é
  // a checagem inicial do app, que compara as datas e, na dúvida, pergunta.
  let timer = null;
  let pendente = false;
  let enviando = false;
  let liberado = false;
  function agendarEnvio() {
    if (!logado()) return;
    pendente = true;
    if (!liberado) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      pendente = false;
      enviando = true;
      try { await enviarDados(); } catch (e) { pendente = true; /* tenta na próxima edição */ }
      enviando = false;
      if (window.App && window.App.atualizarStatusConta) window.App.atualizarStatusConta();
    }, 3000);
  }
  function liberarEnvio() {
    liberado = true;
    if (pendente) agendarEnvio();
  }
  function travarEnvio() { liberado = false; clearTimeout(timer); }
  // Enquanto o PUT está no ar ainda NÃO está sincronizado: dizer "☁ salvo" aí
  // é mentira que só aparece quando a pessoa fecha o app no meio e perde o
  // envio. Por isso `enviando` conta como pendência.
  function temPendencia() { return pendente || enviando; }

  // token de recuperação vindo do link do e-mail (#recuperar=...)
  function tokenDeRecuperacao() {
    const m = /[#&]recuperar=([0-9a-f]{64})/.exec(location.hash || '');
    return m ? m[1] : null;
  }
  function limparHash() {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  return {
    PROXY_PADRAO,
    logado, email, conta, podeUsarProxy, cabecalhosProxy, urlProxy,
    criarConta, entrar, esqueciSenha, redefinirSenha, trocarSenha, sair, validarSessao,
    baixarDados, enviarDados, agendarEnvio, temPendencia, liberarEnvio, travarEnvio,
    statusChave, salvarChave, removerChave,
    tokenDeRecuperacao, limparHash, derivarAuthKey,
  };
})();
